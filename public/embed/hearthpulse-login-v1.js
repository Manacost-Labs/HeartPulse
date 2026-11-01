/*! hearthpulse-login-v1 - <hearthpulse-login-button>. Published file: never edit in place, ship a new -vN.js. Spec: docs/specs/hearthpulse-login-button.md */
(function () {
  'use strict';
  var NAME = 'hearthpulse-login-button';
  var SVG = 'http://www.w3.org/2000/svg';
  var TEXT = {
    ru: 'Войти через HearthPulse',
    en: 'Sign in with HearthPulse'
  };
  var CSS =
    ':host{display:inline-block;vertical-align:middle;max-width:100%}' +
    ':host([hidden]){display:none}' +
    '.b{all:initial;--bg:#fff;--bd:#12345a;--fg:#07172b;--sub:#2f5a8a;--hv:#eaf3fc;--ac:#d9e9f9;' +
    'display:flex;align-items:center;justify-content:center;gap:12px;box-sizing:border-box;' +
    'min-height:44px;max-width:100%;padding:6px 16px 6px 6px;border:1px solid var(--bd);' +
    'border-radius:12px;background:var(--bg);color:var(--fg);direction:ltr;text-align:left;' +
    'font:600 15px/18px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;' +
    'text-decoration:none;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;' +
    'transition:background-color .15s,border-color .15s}' +
    ':host([theme=dark]) .b{--bg:#07172b;--bd:#4aa3d8;--fg:#f8fbff;--sub:#93c5fd;--hv:#0d2a4a;--ac:#12345a}' +
    '@media (prefers-color-scheme:dark){:host(:not([theme=light])) .b{--bg:#07172b;--bd:#4aa3d8;' +
    '--fg:#f8fbff;--sub:#93c5fd;--hv:#0d2a4a;--ac:#12345a}}' +
    '@media (hover:hover){.b:hover{background:var(--hv)}}' +
    '.b:active{background:var(--ac)}' +
    '.b:focus-visible{outline:3px solid #7dd3fc;outline-offset:2px;box-shadow:0 0 0 2px #07172b}' +
    '.b[aria-disabled=true]{opacity:.55;cursor:not-allowed}' +
    '.b[aria-disabled=true]:hover,.b[aria-disabled=true]:active{background:var(--bg)}' +
    '.l{all:initial;display:block;flex:none;width:32px;height:32px;forced-color-adjust:none}' +
    '.t{all:initial;display:block;min-width:0;overflow-wrap:anywhere;font:inherit}' +
    '.m{all:initial;display:block;min-width:0;overflow-wrap:anywhere;color:var(--fg);font:inherit}' +
    '.s{all:initial;display:block;min-width:0;overflow-wrap:anywhere;color:var(--sub);font:500 12px/14px system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;letter-spacing:.02em}' +
    '@media (forced-colors:active){.b{border-color:ButtonText;background:ButtonFace;color:ButtonText}' +
    '.m,.s{color:ButtonText}.b:hover{background:ButtonFace;border-color:Highlight}' +
    '.b:focus-visible{outline:3px solid Highlight;box-shadow:none}.b[aria-disabled=true]{opacity:1;color:GrayText;border-color:GrayText}' +
    '.b[aria-disabled=true] .m,.b[aria-disabled=true] .s{color:GrayText}}' +
    '@media (prefers-reduced-motion:reduce){.b{transition:none}}';

  var sheets = new WeakMap();

  // A constructed stylesheet can only be adopted by shadow roots of the document
  // (window) that created it, so every document that hosts a button gets its own.
  function sheetFor(doc) {
    var view = doc.defaultView;
    var sheet = sheets.get(doc);
    if (!sheet && view && view.CSSStyleSheet) {
      sheet = new view.CSSStyleSheet();
      sheet.replaceSync(CSS);
      sheets.set(doc, sheet);
    }
    return sheet || null;
  }

  function node(tag, attrs, children) {
    var el = document.createElementNS(SVG, tag);
    for (var key in attrs) el.setAttribute(key, attrs[key]);
    for (var i = 0; children && i < children.length; i++) el.appendChild(children[i]);
    return el;
  }

  function logo() {
    return node('svg', { 'class': 'l', viewBox: '0 0 64 64', 'aria-hidden': 'true', focusable: 'false' }, [
      node('rect', { x: 3, y: 3, width: 58, height: 58, rx: 16, fill: '#0a213d', stroke: 'none' }),
      node('rect', {
        x: 5.5, y: 5.5, width: 53, height: 53, rx: 13.5, fill: 'none', stroke: '#38bdf8',
        'stroke-opacity': '.62', 'stroke-width': 3
      }),
      node('path', {
        d: 'M18 48 31.8 15.5 46 48', fill: 'none', stroke: '#a5d2fc', 'stroke-width': 7.5,
        'stroke-linecap': 'round', 'stroke-linejoin': 'round'
      }),
      node('path', {
        d: 'M24.5 37.5h15', fill: 'none', stroke: '#7dd3fc', 'stroke-width': 6.5, 'stroke-linecap': 'round'
      })
    ]);
  }

  function html(tag, className, text) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  }

  // Only an absolute https URL (no credentials) or a path from the site root is
  // accepted. Whitespace anywhere (also at the ends: the value is not trimmed),
  // control characters and backslashes are refused so no browser can read the
  // value as another scheme or as a protocol-relative URL.
  function safeHref(value) {
    if (typeof value !== 'string') return null;
    var v = value;
    if (!v || v.length > 2048) return null;
    for (var i = 0; i < v.length; i++) {
      var code = v.charCodeAt(i);
      if (code <= 32 || (code >= 127 && code <= 159) || code === 92) return null;
    }
    if (v.charAt(0) === '/') return v.charAt(1) === '/' ? null : v;
    if (!/^https:\/\//i.test(v)) return null;
    try {
      var url = new URL(v);
      return url.protocol === 'https:' && !url.username && !url.password && url.hostname ? url.href : null;
    } catch {
      return null;
    }
  }

  function define() {
    if (!window.customElements || customElements.get(NAME)) return;
    if (!window.CSSStyleSheet || !('adoptedStyleSheets' in Document.prototype) ||
        !('replaceSync' in CSSStyleSheet.prototype) || !Element.prototype.attachShadow) return;

    class HearthPulseLoginButton extends HTMLElement {
      static get observedAttributes() { return ['href', 'lang']; }

      connectedCallback() {
        if (!this._link) this._build();
        this._adopt();
        this._queue();
      }

      attributeChangedCallback() {
        if (this._link) this._queue();
      }

      _build() {
        var root = this.shadowRoot || this.attachShadow({ mode: 'open' });
        var main = html('span', 'm');
        var caption = html('span', 's', 'hearthpulse.net');
        var text = html('span', 't');
        var link = html('a', 'b');
        text.append(main, ' ', caption);
        link.append(logo(), text);
        root.appendChild(link);
        this._link = link;
        this._main = main;
        this._warned = null;
        this._pending = false;
      }

      _adopt() {
        var doc = this.ownerDocument;
        if (this._doc === doc) return;
        var sheet = sheetFor(doc);
        if (!sheet) return;
        try {
          this.shadowRoot.adoptedStyleSheets = [sheet];
          this._doc = doc;
        } catch {
          this._doc = null;
        }
      }

      _queue() {
        if (this._pending) return;
        this._pending = true;
        var self = this;
        Promise.resolve().then(function () {
          self._pending = false;
          if (self.isConnected) self._render();
        });
      }

      _render() {
        var link = this._link;
        var lang = /^en(-|$)/i.test(this.getAttribute('lang') || '') ? 'en' : 'ru';
        var raw = this.getAttribute('href');
        var href = safeHref(raw);
        this._main.textContent = TEXT[lang];
        link.setAttribute('lang', lang);
        if (href) {
          link.setAttribute('href', href);
          link.removeAttribute('role');
          link.removeAttribute('aria-disabled');
          this._warned = null;
          return;
        }
        link.removeAttribute('href');
        link.setAttribute('role', 'link');
        link.setAttribute('aria-disabled', 'true');
        if (this._warned !== String(raw)) {
          this._warned = String(raw);
          console.warn('<' + NAME + '>: href must be an absolute https:// URL or a path starting with a single "/"; the button is disabled.');
        }
      }
    }

    customElements.define(NAME, HearthPulseLoginButton);
  }

  define();
})();
