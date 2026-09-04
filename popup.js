(() => {
  'use strict';

  const MODE_KEY = 'mode';
  const CONVERSION_KEY = 'conversion';
  const CAPTURE_KEY = 'lastSerialized';

  const $ = (sel) => document.querySelector(sel);

  const btnStart = $('#btn-start');
  const btnCopy = $('#btn-copy');
  const btnDownload = $('#btn-download');
  const btnInject = $('#btn-inject');
  const inspectorStatus = $('#inspector-status');
  const actionStatus = $('#action-status');
  const captureInfo = $('#capture-info');
  const modeContainer = $('#mode-container');
  const modeSection = $('#mode-section');
  const labelContainer = $('#mode-container-label');
  const labelSection = $('#mode-section-label');
  const convNative = $('#conv-native');
  const convHtml = $('#conv-html');
  const labelConvNative = $('#conv-native-label');
  const labelConvHtml = $('#conv-html-label');

  let lastSerialized = null;
  let mode = 'container';
  let conversion = 'native';

  function sendToActiveTab(message) {
    return new Promise((resolve) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (!tabs || !tabs.length) {
          resolve({ ok: false, reason: 'no-tab' });
          return;
        }
        chrome.tabs.sendMessage(tabs[0].id, message, (res) => {
          if (chrome.runtime.lastError) {
            resolve({ ok: false, reason: 'no-receiver' });
            return;
          }
          resolve(res || { ok: false });
        });
      });
    });
  }

  function loadState() {
    chrome.storage.local.get([MODE_KEY, CONVERSION_KEY, CAPTURE_KEY], (result) => {
      mode = result[MODE_KEY] === 'section' ? 'section' : 'container';
      conversion = result[CONVERSION_KEY] === 'html' ? 'html' : 'native';
      lastSerialized = result[CAPTURE_KEY] || null;
      render();
    });
  }

  function render() {
    if (mode === 'section') {
      modeSection.checked = true;
      labelSection.classList.add('active');
      labelContainer.classList.remove('active');
    } else {
      modeContainer.checked = true;
      labelContainer.classList.add('active');
      labelSection.classList.remove('active');
    }

    if (conversion === 'html') {
      convHtml.checked = true;
      labelConvHtml.classList.add('active');
      labelConvNative.classList.remove('active');
    } else {
      convNative.checked = true;
      labelConvNative.classList.add('active');
      labelConvHtml.classList.remove('active');
    }

    if (lastSerialized) {
      captureInfo.innerHTML =
        `<strong>${escapeHtml(lastSerialized.title || 'Seção')}</strong><br>` +
        `Estrutura: ${lastSerialized.mode === 'section' ? 'Seção clássica' : 'Container'}<br>` +
        `Conversão: ${lastSerialized.conversion === 'html' ? 'HTML único' : 'Widgets nativos'}<br>` +
        `Capturado: ${new Date(lastSerialized.capturedAt).toLocaleString()}`;
      btnCopy.disabled = false;
      btnDownload.disabled = false;
      btnInject.disabled = false;
    } else {
      captureInfo.textContent = 'Nenhuma captura ainda.';
      btnCopy.disabled = true;
      btnDownload.disabled = true;
      btnInject.disabled = true;
    }
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function setInspectorStatus(msg, cls) {
    inspectorStatus.textContent = msg;
    inspectorStatus.className = 'status ' + (cls || '');
  }

  function setActionStatus(msg, cls) {
    actionStatus.textContent = msg;
    actionStatus.className = 'status ' + (cls || '');
  }

  function setMode(next) {
    mode = next;
    chrome.storage.local.set({ [MODE_KEY]: mode });
    render();
  }

  function setConversion(next) {
    conversion = next;
    chrome.storage.local.set({ [CONVERSION_KEY]: conversion });
    render();
  }

  modeContainer.addEventListener('change', () => {
    if (modeContainer.checked) setMode('container');
  });
  modeSection.addEventListener('change', () => {
    if (modeSection.checked) setMode('section');
  });
  convNative.addEventListener('change', () => {
    if (convNative.checked) setConversion('native');
  });
  convHtml.addEventListener('change', () => {
    if (convHtml.checked) setConversion('html');
  });

  btnStart.addEventListener('click', async () => {
    setInspectorStatus('Ativando inspetor…');
    const res = await sendToActiveTab({ type: 'START_INSPECTOR' });
    if (res.ok) {
      setInspectorStatus('Inspetor ativo. Clique em um elemento da página.', 'ok');
      setTimeout(() => window.close(), 500);
    } else {
      setInspectorStatus('Não foi possível ativar (recarregue a aba e tente).', 'err');
    }
  });

  btnCopy.addEventListener('click', async () => {
    setActionStatus('');
    if (!lastSerialized) {
      setActionStatus('Nenhuma captura. Capture uma seção primeiro.', 'err');
      return;
    }
    let ok = false;
    try {
      await navigator.clipboard.writeText(lastSerialized.clipboardText);
      ok = true;
    } catch (e) {
      ok = false;
    }
    setActionStatus(ok ? 'JSON copiado para a área de transferência.' : 'Falha ao copiar.', ok ? 'ok' : 'err');
  });

  btnDownload.addEventListener('click', () => {
    setActionStatus('');
    if (!lastSerialized) {
      setActionStatus('Nenhuma captura. Capture uma seção primeiro.', 'err');
      return;
    }
    const blob = new Blob([lastSerialized.templateText], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'elementor-section.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setActionStatus('Download iniciado.', 'ok');
  });

  btnInject.addEventListener('click', async () => {
    setActionStatus('');
    if (!lastSerialized) {
      setActionStatus('Nenhuma captura. Capture uma seção primeiro.', 'err');
      return;
    }
    const res = await sendToActiveTab({ type: 'INJECT_INTO_ELEMENTOR' });
    if (res && res.ok) {
      setActionStatus(res.triggered
        ? 'Colado no editor!'
        : 'Dados gravados. Use Ctrl+V ou botão direito → Colar no editor.', 'ok');
    } else if (res && res.reason === 'no-capture') {
      setActionStatus('Nenhuma captura. Capture uma seção primeiro.', 'err');
    } else {
      setActionStatus('Abra o editor do Elementor nesta aba e tente novamente.', 'err');
    }
  });

  loadState();
})();
