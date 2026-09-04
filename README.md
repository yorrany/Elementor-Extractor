# Elementor Section Copier

Extensão para **Google Chrome / Edge / Brave** (Manifest V3) que inspeciona, seleciona e copia qualquer seção visual de um site, gerando um payload `_elementor_data` **100% compatível** com o editor do Elementor, preservando estrutura, fontes, alinhamentos, fundos e estilização.

## O que ela faz

1. **Inspetor visual** com overlay de hover (destaque) e barra de ferramentas flutuante.
2. **Captura profunda** do nó selecionado: clona a árvore, extrai os estilos computados essenciais de cada elemento via `getComputedStyle`, remove propriedades default/redundantes e resolve URLs relativas (`src`, `srcset`, `background-image`, fontes).
3. **CSS com escopo fechado**: cada elemento recebe uma classe única (`ext-el-N`) dentro de um contêiner `ext-sec-<hash>`, com regras compiladas que não colidem com o CSS global do tema WordPress. Inclui `@font-face`, `@keyframes` e `@import` de Google Fonts do site de origem.
4. **Serialização Elementor nativa**: converte a seção em **estrutura real** de containers/colunas com **widgets nativos** do Elementor — `heading` (títulos), `text-editor` (textos), `button` (botões/CTAs), `image` (imagens) e `icon-list` (listas). Elementos complexos (sliders, overlays, SVG, animações) caem em um widget `html` isolado com CSS escopado, mantendo 100% da fidelidade visual sem quebrar a editabilidade do restante.
5. **Dois modos de inserção**:
   - **Clipboard Elementor** (payload `{type:'elementor', siteurl, elements}`) — usado pelo recurso nativo *"Colar de outro site"* do editor.
   - **JSON direto** — arquivo `.json` compatível com o importador de templates (`content`, `title`, `type`, `page_settings`).

## Instalação (modo desenvolvedor)

1. Baixe/coloque esta pasta (`elementor-capture-extension`) em qualquer local.
2. Abra `chrome://extensions` (ou `edge://extensions` / `brave://extensions`).
3. Ative o **Modo do desenvolvedor** (interruptor no canto superior direito).
4. Clique em **"Carregar sem compactação"** e selecione a pasta da extensão.
5. A extensão **Elementor Section Copier** aparecerá na lista.

## Como usar

### Capturar uma seção
1. Abra a página de onde você quer copiar a seção.
2. Clique no ícone da extensão na barra de ferramentas.
3. Escolha o modo de **Estrutura** (**Container** ou **Seção clássica**) e de **Conversão** (**Widgets nativos** ou **HTML único**) e clique em **"Inspecionar página"**.
4. Passe o mouse sobre os elementos (um destaque rosa acompanha o cursor).
5. **Clique** no elemento/seção desejada para selecioná-lo.
6. Use a barra de ferramentas flutuante:
   - **"Copiar p/ Elementor"** — copia o JSON para a área de transferência.
   - **"Baixar .json"** — baixa o arquivo de template.
   - **"Cancelar"** (ou tecla **ESC**) — sai do inspetor.

### Colar no Elementor

**Opção A — Colar de outro site (recomendado, à prova de versão):**
1. Copie a seção com **"Copiar p/ Elementor"**.
2. No editor do Elementor, clique com o **botão direito** em qualquer área/elemento.
3. Escolha **"Colar de outro site"** (ícone de importar/exportar).
4. No diálogo aberto, pressione **Ctrl+V** (ou ⌘+V). O Elementor lê o JSON, importa e cola a seção.

**Opção B — Injeção direta:**
1. Com o editor do Elementor **aberto na aba atual** e uma captura feita, abra a extensão.
2. Clique em **"Colar no Elementor"**. A extensão grava o payload em `localStorage['elementor'].clipboard` e tenta disparar a colagem automaticamente.

**Opção C — Importar template:**
1. Baixe o `.json` com **"Baixar .json"**.
2. No WordPress: **Templates → Saved Templates → Importar Templates** e selecione o arquivo.
3. Arraste a seção importada para a página.

## Formato gerado (referência)

Payload de clipboard (o mesmo que o Elementor grava ao "Copiar") — exemplo em modo **Widgets nativos**:

```json
{
  "type": "elementor",
  "siteurl": "https://site-de-origem.com",
  "elements": [
    {
      "id": "a1b2c3d",
      "elType": "container",
      "settings": { "content_width": "full", "flex_direction": "column" },
      "elements": [
        {
          "id": "e4f5g6h",
          "elType": "widget",
          "widgetType": "heading",
          "settings": { "title": "Título", "header_size": "h2", "title_color": "#fff" },
          "elements": [],
          "isInner": false
        },
        {
          "id": "i7j8k9l",
          "elType": "widget",
          "widgetType": "button",
          "settings": { "text": "Quero Minha LP", "link": { "url": "#planos" } },
          "elements": [],
          "isInner": false
        }
      ],
      "isInner": false
    }
  ]
}
```

Arquivo `.json` de template:

```json
{
  "version": "0.4",
  "title": "Seção",
  "type": "container",
  "page_settings": {},
  "content": [ /* mesmos elements acima */ ]
}
```

## Limitações conhecidas

- Elementos complexos (sliders com JS, overlays com posicionamento absoluto, `<svg>`, animações) são preservados como widget `html` isolado; o restante da seção continua com widgets nativos editáveis.
- Estados de `:hover`/`:focus` e interações JS não são reproduzidos.
- Stylesheets **cross-origin** (CDNs de terceiros) não podem ser lidos por segurança; `@font-face`/`@keyframes` desses arquivos podem não ser copiados. Google Fonts são incluídos via `@import`.
- Scripts e iframes são removidos por segurança.

## Estrutura dos arquivos

| Arquivo | Função |
|---------|--------|
| `manifest.json` | Configuração Manifest V3 (permissões, service worker, content scripts). |
| `background.js` | Service worker: estado persistente (`chrome.storage.local`) e badge. |
| `content_script.js` | Inspetor, extração de CSS computado, resolução de URLs, serialização e clipboard. |
| `popup.html` / `popup.js` | Painel de controle (modo, capturar, copiar, baixar, colar). |
| `styles.css` | Estilos do overlay/barra do inspetor. |
