(() => {
  'use strict';

  if (window.__elementorSectionCopierLoaded) {
    return;
  }
  window.__elementorSectionCopierLoaded = true;

  const INSPECTOR_ROOT_ID = 'esc-inspector-root';
  const CAPTURE_CLASS_PREFIX = 'ext-el-';
  const SECTION_CLASS_PREFIX = 'ext-sec-';
  const MODE_KEY = 'mode';
  const CONVERSION_KEY = 'conversion';
  const CAPTURE_KEY = 'lastSerialized';

  // ---------------------------------------------------------------------------
  // Utility
  // ---------------------------------------------------------------------------

  const CONTAINER_TAGS = ['div', 'section', 'article', 'aside', 'main', 'header', 'footer', 'nav'];

  const DEFAULTS = new Set([
    'none', 'normal', 'auto', 'initial', 'inherit', 'unset', 'revert',
    'transparent', 'rgba(0, 0, 0, 0)', 'static', 'visible',
    '0px', '0s', '0', '0%', '0deg'
  ]);

  function cs(el) {
    return window.getComputedStyle(el);
  }

  function toAbsoluteUrl(url) {
    if (!url) return url;
    if (url.indexOf('data:') === 0 || url.indexOf('blob:') === 0) return url;
    try {
      return new URL(url, document.baseURI).href;
    } catch (e) {
      return url;
    }
  }

  function absolutizeCssValue(value) {
    if (typeof value !== 'string') return value;
    return value.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (m, raw) => {
      const cleaned = raw.trim();
      if (/^(data:|blob:|#)/i.test(cleaned)) return `url("${cleaned}")`;
      if (/^https?:\/\//i.test(cleaned)) return `url("${cleaned}")`;
      return `url("${toAbsoluteUrl(cleaned)}")`;
    });
  }

  function shouldSkip(prop, value) {
    if (!value) return true;
    if (DEFAULTS.has(value)) return true;
    if (prop === 'opacity' && value === '1') return true;
    if (prop === 'z-index' && value === 'auto') return true;
    if (prop === 'cursor' && value === 'auto') return true;
    if (prop === 'overflow' && value === 'visible') return true;
    if (prop === 'box-shadow' && value === 'none') return true;
    if (prop === 'transform' && value === 'none') return true;
    if (prop === 'transition' && /all 0s|none/.test(value)) return true;
    if ((prop === 'width' || prop === 'height') && value === 'auto') return true;
    return false;
  }

  function resolveHref(value) {
    if (!value) return value;
    const v = value.trim();
    if (/^(#|mailto:|tel:|javascript:|data:|blob:|https?:|\/\/)/i.test(v)) return value;
    return toAbsoluteUrl(v);
  }

  function resolveUrlList(value) {
    if (!value) return value;
    if (value.indexOf('data:') === 0 || value.indexOf('blob:') === 0) return value;
    if (value.indexOf(',') !== -1) {
      return value.split(',').map((part) => {
        const seg = part.trim().split(/\s+/);
        seg[0] = toAbsoluteUrl(seg[0]);
        return seg.join(' ');
      }).join(', ');
    }
    const seg = value.trim().split(/\s+/);
    seg[0] = toAbsoluteUrl(seg[0]);
    return seg.join(' ');
  }

  function resolveAttributeUrls(el) {
    const imageAttrs = ['src', 'srcset', 'poster', 'data-src', 'data-bg', 'data-original'];
    const process = (node) => {
      imageAttrs.forEach((attr) => {
        if (node.hasAttribute(attr)) node.setAttribute(attr, resolveUrlList(node.getAttribute(attr)));
      });
      if (node.hasAttribute('href')) node.setAttribute('href', resolveHref(node.getAttribute('href')));
      if (node.hasAttribute('style')) node.setAttribute('style', absolutizeCssValue(node.getAttribute('style')));
    };
    process(el);
    el.querySelectorAll('*').forEach(process);
  }

  function resolveInnerHtml(el) {
    const tmp = document.createElement('div');
    tmp.innerHTML = el.innerHTML;
    resolveAttributeUrls(tmp);
    return tmp.innerHTML;
  }

  function hashString(str) {
    let h = 0;
    for (let i = 0; i < str.length; i++) {
      h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
  }

  function randomId() {
    let s = '';
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 7; i++) s += chars[Math.floor(Math.random() * chars.length)];
    return s;
  }

  function getElementChildren(el) {
    return Array.from(el.children || []);
  }

  function alignFrom(textAlign) {
    if (!textAlign) return 'left';
    if (textAlign === 'center' || textAlign === 'end' || textAlign === 'right' || textAlign === 'justify') {
      if (textAlign === 'end') return 'right';
      return textAlign;
    }
    if (textAlign === 'start') return 'left';
    return 'left';
  }

  function typographyFrom(s) {
    const t = {};
    const fs = parseFloat(s.fontSize);
    if (fs > 0) t.typography_font_size = { unit: 'px', size: fs };
    const fw = s.fontWeight;
    if (fw && fw !== '400' && fw !== 'normal') t.typography_font_weight = String(fw);
    const lh = parseFloat(s.lineHeight);
    if (lh > 0 && s.lineHeight.indexOf('%') === -1) {
      t.typography_line_height = {
        unit: s.lineHeight.indexOf('px') !== -1 ? 'px' : 'em',
        size: lh
      };
    }
    const ls = parseFloat(s.letterSpacing);
    if (ls && !isNaN(ls) && s.letterSpacing.indexOf('normal') === -1) {
      t.typography_letter_spacing = { unit: 'px', size: ls };
    }
    if (s.fontFamily) t.typography_font_family = s.fontFamily;
    const tt = s.textTransform;
    if (tt && tt !== 'none') t.typography_text_transform = tt;
    return Object.keys(t).length ? t : null;
  }

  function borderRadius(s) {
    const r = parseFloat(s.borderTopLeftRadius);
    if (!r || r <= 0) return null;
    return { unit: 'px', top: String(r), right: String(r), bottom: String(r), left: String(r), isLinked: true };
  }

  function borderWidth(s) {
    const w = parseFloat(s.borderTopWidth);
    if (!w || w <= 0) return null;
    return { unit: 'px', top: String(w), right: String(w), bottom: String(w), left: String(w), isLinked: true };
  }

  function padding(s) {
    const p = {
      top: parseFloat(s.paddingTop) || 0,
      right: parseFloat(s.paddingRight) || 0,
      bottom: parseFloat(s.paddingBottom) || 0,
      left: parseFloat(s.paddingLeft) || 0
    };
    if (!p.top && !p.right && !p.bottom && !p.left) return null;
    return { unit: 'px', top: String(p.top), right: String(p.right), bottom: String(p.bottom), left: String(p.left), isLinked: '' };
  }

  function flexGap(s) {
    const gap = parseFloat(s.gap) || parseFloat(s.rowGap) || 0;
    if (!gap || gap <= 0) return null;
    return { column: String(gap), row: String(gap), unit: 'px', size: gap, sizes: [], isLinked: true };
  }

  // ---------------------------------------------------------------------------
  // Scoped HTML capture (fallback for complex elements)
  // ---------------------------------------------------------------------------

  const STYLE_PROPS = [
    'display', 'position', 'top', 'right', 'bottom', 'left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'box-sizing',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'flex-direction', 'flex-wrap', 'justify-content', 'align-items', 'align-content',
    'gap', 'row-gap', 'column-gap',
    'flex-grow', 'flex-shrink', 'flex-basis',
    'grid-template-columns', 'grid-template-rows',
    'grid-auto-rows', 'grid-auto-columns', 'grid-column', 'grid-row',
    'background-color', 'background-image', 'background-size',
    'background-position', 'background-repeat', 'background-attachment',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style',
    'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-left-radius', 'border-bottom-right-radius',
    'color', 'font-family', 'font-size', 'font-weight', 'font-style',
    'line-height', 'letter-spacing', 'text-align', 'text-transform',
    'text-decoration', 'text-decoration-color', 'white-space', 'word-break',
    'text-shadow', 'text-overflow',
    'box-shadow', 'opacity', 'overflow', 'overflow-x', 'overflow-y', 'z-index',
    'transform', 'transition', 'animation', 'cursor', 'object-fit', 'object-position',
    'vertical-align', 'list-style-type', 'list-style-position', 'aspect-ratio'
  ];

  function computedStyleToString(style) {
    const parts = [];
    for (const prop of STYLE_PROPS) {
      let value = style.getPropertyValue(prop);
      if (shouldSkip(prop, value)) continue;
      value = absolutizeCssValue(value);
      parts.push(`${prop}: ${value};`);
    }
    return parts.join(' ');
  }

  function extractPseudo(el, pseudo) {
    let style;
    try {
      style = window.getComputedStyle(el, pseudo);
    } catch (e) {
      return '';
    }
    const content = style.getPropertyValue('content');
    if (!content || content === 'none' || content === 'normal') return '';
    const parts = [`content: ${content};`];
    for (const prop of ['display', 'position', 'width', 'height', 'background-color', 'background-image', 'color', 'font-size']) {
      const value = style.getPropertyValue(prop);
      if (!shouldSkip(prop, value)) parts.push(`${prop}: ${absolutizeCssValue(value)};`);
    }
    return parts.join(' ');
  }

  function collectGlobalCss() {
    let out = '';
    const seenKeyframes = new Set();
    const handleRule = (rule) => {
      if (!rule) return;
      if (rule.type === CSSRule.FONT_FACE_RULE) {
        out += absolutizeCssValue(rule.cssText) + '\n';
      } else if (rule.type === CSSRule.KEYFRAMES_RULE) {
        if (!seenKeyframes.has(rule.name)) {
          seenKeyframes.add(rule.name);
          out += rule.cssText + '\n';
        }
      } else if (rule.type === CSSRule.IMPORT_RULE && rule.href && /fonts\.(googleapis|gstatic)\.com/i.test(rule.href)) {
        out += `@import url("${rule.href}");\n`;
      } else if (rule.type === CSSRule.MEDIA_RULE || rule.type === CSSRule.SUPPORTS_RULE) {
        for (const child of Array.from(rule.cssRules || [])) handleRule(child);
      }
    };
    for (const sheet of Array.from(document.styleSheets || [])) {
      try {
        const rules = sheet.cssRules || sheet.rules;
        if (!rules) continue;
        for (const rule of Array.from(rules)) handleRule(rule);
      } catch (e) { /* cross-origin */ }
    }
    return out;
  }

  function collectGoogleFontsLinks() {
    const hrefs = [];
    document.querySelectorAll('link[rel="stylesheet"]').forEach((link) => {
      const href = link.getAttribute('href') || '';
      if (/fonts\.(googleapis|gstatic)\.com/i.test(href)) hrefs.push(href);
    });
    return hrefs.map((h) => `@import url("${toAbsoluteUrl(h)}");`).join('\n');
  }

  function buildScopedHtml(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script, iframe, embed, object, link, meta, noscript').forEach((el) => el.remove());
    resolveAttributeUrls(clone);

    let counter = 0;
    const rules = [];

    const walk = (orig, cloned) => {
      if (cloned.nodeType === Node.ELEMENT_NODE) {
        const cls = CAPTURE_CLASS_PREFIX + counter++;
        cloned.removeAttribute('id');
        cloned.setAttribute('class', cls);
        cloned.removeAttribute('style');
        const rule = computedStyleToString(window.getComputedStyle(orig));
        if (rule) rules.push(`.${cls} { ${rule} }`);
        const before = extractPseudo(orig, '::before');
        if (before) rules.push(`.${cls}::before { ${before} }`);
        const after = extractPseudo(orig, '::after');
        if (after) rules.push(`.${cls}::after { ${after} }`);
      }
      const oc = orig.childNodes;
      const cc = cloned.childNodes;
      for (let i = 0; i < oc.length; i++) {
        if (cc[i]) walk(oc[i], cc[i]);
      }
    };
    walk(root, clone);

    const sectionClass = SECTION_CLASS_PREFIX + hashString(root.outerHTML.slice(0, 500) + Date.now());
    const styleText = [collectGoogleFontsLinks(), collectGlobalCss(), rules.join('\n')].filter(Boolean).join('\n');
    return `<div class="${sectionClass}">${clone.outerHTML}<style>${styleText}</style></div>`;
  }

  // ---------------------------------------------------------------------------
  // Native Elementor conversion
  // ---------------------------------------------------------------------------

  function isComplex(el) {
    if (el.querySelector('svg, canvas, iframe, video, audio, object, embed, map')) return true;
    const s = cs(el);
    if (s.position === 'absolute' || s.position === 'fixed') return true;
    const t = s.transform;
    if (t && t !== 'none' && !/matrix\(1, 0, 0, 1, 0, 0\)/.test(t)) return true;
    if (s.animationName && s.animationName !== 'none') return true;
    for (const c of getElementChildren(el)) {
      const cp = cs(c).position;
      if (cp === 'absolute' || cp === 'fixed') return true;
    }
    return false;
  }

  function isButtonLike(el) {
    const cls = (el.getAttribute('class') || '').toLowerCase();
    if (/(btn|button|cta)/.test(cls)) return true;
    const s = cs(el);
    const pad = parseFloat(s.paddingTop) || parseFloat(s.paddingLeft) || 0;
    const bg = s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent';
    const bw = parseFloat(s.borderTopWidth) || 0;
    const radius = parseFloat(s.borderTopLeftRadius) || 0;
    const inline = s.display === 'inline-block' || s.display === 'inline-flex' || s.display === 'inline';
    return pad > 4 && (bg || bw > 0) && (radius > 8 || inline);
  }

  function hasContainerStyles(el) {
    const s = cs(el);
    const display = s.display;
    if (display === 'flex' || display === 'grid' || display === 'inline-flex') return true;
    if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') return true;
    if (s.backgroundImage && s.backgroundImage !== 'none') return true;
    if (parseFloat(s.borderTopWidth) > 0) return true;
    if (parseFloat(s.paddingTop) > 0 || parseFloat(s.paddingBottom) > 0) return true;
    if (s.minHeight && s.minHeight !== '0px' && s.minHeight !== 'auto') return true;
    return false;
  }

  function isHorizontalRow(el) {
    const s = cs(el);
    const display = s.display;
    if (display === 'grid') return true;
    if (display === 'flex' || display === 'inline-flex') {
      const dir = s.flexDirection;
      return dir === 'row' || dir === 'row-reverse';
    }
    return false;
  }

  function makeWidget(el, widgetType, settings) {
    return { id: randomId(), elType: 'widget', settings, elements: [], widgetType, isInner: false };
  }

  function makeHtmlWidget(el) {
    return makeWidget(el, 'html', { html: buildScopedHtml(el) });
  }

  function makeHeading(el) {
    const text = (el.textContent || '').trim();
    if (!text) return null;
    const s = cs(el);
    const level = el.tagName.toLowerCase().replace('h', '');
    const settings = {
      title: text,
      header_size: 'h' + level,
      align: alignFrom(s.textAlign)
    };
    if (s.color) settings.title_color = s.color;
    const typo = typographyFrom(s);
    if (typo) Object.assign(settings, typo);
    return makeWidget(el, 'heading', settings);
  }

  function makeTextEditor(el) {
    const html = (el.innerHTML || '').trim();
    if (!html) return null;
    const s = cs(el);
    const settings = {
      editor: resolveInnerHtml(el),
      align: alignFrom(s.textAlign)
    };
    if (s.color) settings.text_color = s.color;
    const typo = typographyFrom(s);
    if (typo) Object.assign(settings, typo);
    return makeWidget(el, 'text-editor', settings);
  }

  function makeImage(el) {
    const src = el.getAttribute('src') || el.getAttribute('data-src') || el.getAttribute('data-original') || '';
    if (!src) return null;
    const s = cs(el);
    const settings = {
      image: { url: toAbsoluteUrl(src), id: '' },
      image_size: 'full',
      align: alignFrom(s.textAlign === 'start' ? 'center' : s.textAlign)
    };
    const w = Math.round(el.getBoundingClientRect().width);
    if (w > 0) settings.width = { unit: 'px', size: w };
    return makeWidget(el, 'image', settings);
  }

  function buttonSizeFrom(s) {
    const fs = parseFloat(s.fontSize) || 15;
    if (fs < 12) return 'xs';
    if (fs < 14) return 'sm';
    if (fs < 17) return 'md';
    if (fs < 20) return 'lg';
    return 'xl';
  }

  function makeButton(el) {
    const text = (el.textContent || '').trim();
    if (!text) return null;
    const s = cs(el);
    const settings = {
      text,
      link: { url: resolveHref(el.getAttribute('href') || '#'), is_external: '', nofollow: '' },
      align: alignFrom(s.textAlign),
      size: buttonSizeFrom(s)
    };
    const bg = s.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') settings.background_color = bg;
    if (s.color) settings.button_text_color = s.color;
    const br = borderRadius(s);
    if (br) settings.border_radius = br;
    const bw = borderWidth(s);
    if (bw) {
      settings.border_border = 'solid';
      settings.border_width = bw;
      if (s.borderTopColor) settings.border_color = s.borderTopColor;
    }
    const pad = padding(s);
    if (pad) settings.text_padding = pad;
    const fs = parseFloat(s.fontSize);
    if (fs > 0) settings.typography_font_size = { unit: 'px', size: fs };
    return makeWidget(el, 'button', settings);
  }

  function detectIcon(li) {
    const html = (li.innerHTML || '').toLowerCase();
    if (html.indexOf('check') !== -1 || html.indexOf('lucide-check') !== -1) {
      return { value: 'fas fa-check', library: 'fa-solid' };
    }
    if (html.indexOf('arrow') !== -1 || html.indexOf('chevron') !== -1) {
      return { value: 'fas fa-chevron-right', library: 'fa-solid' };
    }
    return { value: 'fas fa-circle', library: 'fa-solid' };
  }

  function makeIconList(el) {
    const s = cs(el);
    const direct = getElementChildren(el).filter((c) => c.tagName.toLowerCase() === 'li');
    const list = direct.length ? direct : Array.from(el.querySelectorAll('li'));
    const items = [];
    list.forEach((li) => {
      const text = (li.textContent || '').trim();
      if (!text) return;
      items.push({ _id: randomId(), text, selected_icon: detectIcon(li) });
    });
    if (!items.length) return null;
    const settings = {
      icon_list: items,
      space_between: { unit: 'px', size: Math.max(8, Math.round(parseFloat(s.gap) || parseFloat(s.rowGap) || 10)), sizes: [] }
    };
    if (s.color) settings.text_color = s.color;
    const fs = parseFloat(s.fontSize);
    if (fs > 0) settings.typography_font_size = { unit: 'px', size: fs };
    return makeWidget(el, 'icon-list', settings);
  }

  function makeContainer(el, elements, overrides) {
    const s = cs(el);
    const settings = { content_width: 'full' };

    const bg = s.backgroundColor;
    if (bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') settings.background_color = bg;

    const pad = padding(s);
    if (pad) settings.padding = pad;

    const bw = borderWidth(s);
    if (bw) {
      settings.border_border = 'solid';
      settings.border_width = bw;
      if (s.borderTopColor) settings.border_color = s.borderTopColor;
    }
    const br = borderRadius(s);
    if (br) settings.border_radius = br;

    const gap = flexGap(s);
    if (gap) settings.flex_gap = gap;

    const jc = s.justifyContent;
    if (jc && jc !== 'normal' && jc !== 'stretch' && jc !== 'flex-start') settings.flex_justify_content = jc;
    const ai = s.alignItems;
    if (ai && ai !== 'normal' && ai !== 'stretch') settings.flex_align_items = ai;

    if (overrides) Object.assign(settings, overrides);

    return { id: randomId(), elType: 'container', settings, elements, isInner: false };
  }

  function convertNode(el) {
    const tag = el.tagName.toLowerCase();
    const s = cs(el);

    if (/^h[1-6]$/.test(tag)) {
      const w = makeHeading(el);
      return w ? [w] : [];
    }
    if (tag === 'p') {
      const w = makeTextEditor(el);
      return w ? [w] : [];
    }
    if (tag === 'img') {
      const w = makeImage(el);
      return w ? [w] : [];
    }
    if (tag === 'figure') {
      const img = el.querySelector('img');
      if (img) {
        const w = makeImage(img);
        return w ? [w] : [];
      }
      return [makeHtmlWidget(el)];
    }
    if (tag === 'ul' || tag === 'ol') {
      const w = makeIconList(el);
      return w ? [w] : [];
    }
    if (tag === 'a') {
      if (isButtonLike(el)) {
        const w = makeButton(el);
        return w ? [w] : [];
      }
      const w = makeTextEditor(el);
      return w ? [w] : [];
    }
    if (tag === 'button') {
      const w = makeButton(el);
      return w ? [w] : [];
    }
    if (tag === 'hr') {
      return [makeWidget(el, 'divider', {})];
    }
    if (tag === 'br') return [];

    if (CONTAINER_TAGS.includes(tag)) {
      return convertContainer(el);
    }

    const text = (el.textContent || '').trim();
    if (text && getElementChildren(el).length === 0) {
      const w = makeTextEditor(el);
      return w ? [w] : [];
    }

    return [makeHtmlWidget(el)];
  }

  function convertContainer(el) {
    if (isComplex(el)) return [makeHtmlWidget(el)];

    const children = getElementChildren(el);
    if (children.length === 0) {
      const text = (el.textContent || '').trim();
      if (text) {
        const w = makeTextEditor(el);
        return w ? [w] : [];
      }
      return [];
    }

    if (children.length >= 2 && isHorizontalRow(el)) {
      const n = children.length;
      const width = { unit: '%', size: Math.floor(100 / n) };
      const columns = children.map((child) => {
        const items = convertNode(child);
        if (items.length === 1 && items[0].elType === 'container') {
          items[0].settings = items[0].settings || {};
          items[0].settings.width = width;
          return items[0];
        }
        return makeContainer(child, items, { flex_direction: 'column', width });
      }).filter(Boolean);
      return [makeContainer(el, columns, { flex_direction: 'row' })];
    }

    const items = [];
    for (const child of children) {
      items.push(...convertNode(child));
    }

    if (!hasContainerStyles(el)) {
      return items;
    }
    return [makeContainer(el, items, { flex_direction: 'column' })];
  }

  function buildElements(root, mode, conversion) {
    if (conversion === 'html') {
      const html = buildScopedHtml(root);
      const widget = { id: randomId(), elType: 'widget', settings: { html }, elements: [], widgetType: 'html', isInner: false };
      if (mode === 'section') {
        return [{
          id: randomId(), elType: 'section', settings: { layout: 'full_width', gap: 'no' },
          elements: [{ id: randomId(), elType: 'column', settings: { _column_size: 100, _inline_size: null }, elements: [widget], isInner: false }],
          isInner: false
        }];
      }
      return [{ id: randomId(), elType: 'container', settings: { content_width: 'full' }, elements: [widget], isInner: false }];
    }

    const items = [];
    for (const child of getElementChildren(root)) {
      items.push(...convertNode(child));
    }

    if (mode === 'section') {
      const s = cs(root);
      const settings = { layout: 'full_width', gap: 'no' };
      if (s.backgroundColor && s.backgroundColor !== 'rgba(0, 0, 0, 0)' && s.backgroundColor !== 'transparent') {
        settings.background_background = 'classic';
        settings.background_color = s.backgroundColor;
      }
      const pad = padding(s);
      if (pad) settings.padding = pad;
      return [{
        id: randomId(), elType: 'section', settings,
        elements: [{ id: randomId(), elType: 'column', settings: { _column_size: 100, _inline_size: null }, elements: items, isInner: false }],
        isInner: false
      }];
    }

    return [makeContainer(root, items, { flex_direction: 'column' })];
  }

  function serializeCapture(root, mode, conversion) {
    const elements = buildElements(root, mode, conversion);
    const title = describeElement(root) || document.title || 'Elementor Section';

    const clipboardPayload = {
      type: 'elementor',
      siteurl: location.origin,
      elements
    };

    const templateJson = {
      version: '0.4',
      title,
      type: mode === 'section' ? 'section' : 'container',
      page_settings: {},
      content: elements
    };

    return {
      clipboardText: JSON.stringify(clipboardPayload),
      templateText: JSON.stringify(templateJson),
      title,
      mode,
      conversion,
      elementCount: elements.length,
      capturedAt: Date.now()
    };
  }

  function describeElement(el) {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? '#' + el.id : '';
    const classes = typeof el.className === 'string' ? el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    const cls = classes ? '.' + classes : '';
    return (tag + id + cls || 'section').slice(0, 60);
  }

  // ---------------------------------------------------------------------------
  // Persistence / clipboard / download / inject
  // ---------------------------------------------------------------------------

  function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([MODE_KEY, CONVERSION_KEY], (result) => {
        resolve({
          mode: result[MODE_KEY] === 'section' ? 'section' : 'container',
          conversion: result[CONVERSION_KEY] === 'html' ? 'html' : 'native'
        });
      });
    });
  }

  function saveSerialized(serialized) {
    chrome.storage.local.set({ [CAPTURE_KEY]: serialized });
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function injectIntoElementor(payloadText) {
    let parsed;
    try {
      parsed = JSON.parse(payloadText);
    } catch (e) {
      return { ok: false, reason: 'invalid-json' };
    }
    if (!parsed || parsed.type !== 'elementor' || !Array.isArray(parsed.elements) || !parsed.elements.length) {
      return { ok: false, reason: 'invalid-payload' };
    }

    let raw;
    try { raw = localStorage.getItem('elementor'); } catch (e) { raw = null; }
    let store = {};
    try { store = raw ? JSON.parse(raw) : {}; } catch (e) { store = {}; }
    store.clipboard = parsed;
    try {
      localStorage.setItem('elementor', JSON.stringify(store));
    } catch (e) {
      return { ok: false, reason: 'storage-denied' };
    }

    let triggered = false;
    try {
      if (window.$e && window.elementor && typeof window.elementor.getContainer === 'function') {
        const container = window.elementor.getContainer();
        if (container && window.$e.run) {
          window.$e.run('document/elements/paste', { container, rebuild: true });
          triggered = true;
        }
      }
    } catch (e) {
      triggered = false;
    }
    return { ok: true, triggered };
  }

  // ---------------------------------------------------------------------------
  // Inspector UI
  // ---------------------------------------------------------------------------

  let inspectorActive = false;
  let highlightEl = null;
  let toolbarEl = null;
  let hoveredEl = null;
  let selectedEl = null;

  function ensureInspectorRoot() {
    let root = document.getElementById(INSPECTOR_ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = INSPECTOR_ROOT_ID;
    document.documentElement.appendChild(root);
    return root;
  }

  function createToolbar() {
    const bar = document.createElement('div');
    bar.className = 'esc-toolbar';
    bar.innerHTML = `
      <div class="esc-toolbar-title">Elementor Copier</div>
      <div class="esc-toolbar-hint">Clique no elemento para capturar · ESC cancela</div>
      <div class="esc-toolbar-actions">
        <button class="esc-btn esc-btn-copy" type="button">Copiar p/ Elementor</button>
        <button class="esc-btn esc-btn-download" type="button">Baixar .json</button>
        <button class="esc-btn esc-btn-cancel" type="button">Cancelar</button>
      </div>
      <div class="esc-toolbar-status"></div>
    `;
    return bar;
  }

  function positionHighlight(el) {
    if (!el || !highlightEl) return;
    const rect = el.getBoundingClientRect();
    highlightEl.style.top = rect.top + 'px';
    highlightEl.style.left = rect.left + 'px';
    highlightEl.style.width = rect.width + 'px';
    highlightEl.style.height = rect.height + 'px';
  }

  function startInspector() {
    if (inspectorActive) return;
    inspectorActive = true;
    const root = ensureInspectorRoot();
    highlightEl = document.createElement('div');
    highlightEl.className = 'esc-highlight';
    toolbarEl = createToolbar();
    root.appendChild(highlightEl);
    root.appendChild(toolbarEl);

    toolbarEl.querySelector('.esc-btn-copy').addEventListener('click', () => handleCapture(true));
    toolbarEl.querySelector('.esc-btn-download').addEventListener('click', () => handleCapture(false));
    toolbarEl.querySelector('.esc-btn-cancel').addEventListener('click', () => stopInspector());

    document.addEventListener('mousemove', onMouseMove, true);
    document.addEventListener('click', onClick, true);
    document.addEventListener('keydown', onKeyDown, true);
  }

  function stopInspector() {
    inspectorActive = false;
    hoveredEl = null;
    selectedEl = null;
    document.removeEventListener('mousemove', onMouseMove, true);
    document.removeEventListener('click', onClick, true);
    document.removeEventListener('keydown', onKeyDown, true);
    const root = document.getElementById(INSPECTOR_ROOT_ID);
    if (root) root.remove();
    highlightEl = null;
    toolbarEl = null;
  }

  function onMouseMove(e) {
    const target = e.target;
    if (target && target.closest && target.closest('#' + INSPECTOR_ROOT_ID)) return;
    if (target && target.nodeType === Node.ELEMENT_NODE) {
      hoveredEl = target;
      positionHighlight(target);
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      stopInspector();
    }
  }

  function onClick(e) {
    if (!inspectorActive) return;
    const target = e.target;
    if (target && target.closest && target.closest('.esc-toolbar')) return;
    e.preventDefault();
    e.stopPropagation();
    if (target && target.nodeType === Node.ELEMENT_NODE) {
      selectedEl = target;
      positionHighlight(target);
      setStatus('Elemento selecionado: ' + describeElement(target));
    }
  }

  function setStatus(msg) {
    if (toolbarEl) {
      const status = toolbarEl.querySelector('.esc-toolbar-status');
      if (status) status.textContent = msg;
    }
  }

  async function handleCapture(copy) {
    const el = selectedEl || hoveredEl || document.body;
    const { mode, conversion } = await getSettings();
    const serialized = serializeCapture(el, mode, conversion);
    saveSerialized(serialized);
    if (copy) {
      const ok = await copyText(serialized.clipboardText);
      setStatus(ok
        ? 'Copiado! No Elementor: botão direito → "Colar de outro site" → Ctrl+V'
        : 'Falha ao copiar.');
    } else {
      downloadText(serialized.templateText, 'elementor-section.json');
      setStatus('Arquivo .json baixado. Importe em Elementor → Templates → Importar.');
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || typeof message.type !== 'string') return false;

    switch (message.type) {
      case 'START_INSPECTOR':
        startInspector();
        sendResponse({ ok: true });
        break;
      case 'STOP_INSPECTOR':
        stopInspector();
        sendResponse({ ok: true });
        break;
      case 'INJECT_INTO_ELEMENTOR':
        chrome.storage.local.get([CAPTURE_KEY], (result) => {
          const serialized = result[CAPTURE_KEY];
          if (!serialized || !serialized.clipboardText) {
            sendResponse({ ok: false, reason: 'no-capture' });
            return;
          }
          sendResponse(injectIntoElementor(serialized.clipboardText));
        });
        return true;
      default:
        return false;
    }
    return false;
  });
})();
