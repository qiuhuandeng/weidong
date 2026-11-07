/* Online-only adapter. Business code and the offline runner remain in zhongtai.html. */
(function (config) {
  'use strict';
  const files = config.resources;
  const entry = new URL(location.href); entry.search = ''; entry.hash = '';
  const base = new URL('.', entry), texts = new Map(), pendingText = new Map(), installed = new WeakSet();
  const hasFile = path => Object.prototype.hasOwnProperty.call(files, path);
  const virtual = path => new URL(path, base).href;
  const asset = path => new URL(files[path].url, base).href;
  const quote = value => String(value).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  function target(value, from) {
    const raw = String(value || '');
    if (!raw || /^(?:#|data:|blob:|about:|javascript:|mailto:|tel:)/i.test(raw)) return null;
    let url; try { url = new URL(raw, virtual(from)); } catch { return null; }
    if (url.protocol !== base.protocol || url.host !== base.host || !url.pathname.startsWith(base.pathname)) return null;
    let path; try { path = decodeURIComponent(url.pathname.slice(base.pathname.length)); } catch { return null; }
    if (url.pathname === entry.pathname) path = url.searchParams.get('__weid_page') || 'index.html';
    if (!hasFile(path)) return null;
    if (!path.endsWith('.html')) return {path, url};
    const canonical = new URL(entry); canonical.search = url.search; canonical.hash = url.hash;
    if (path === 'index.html') canonical.searchParams.delete('__weid_page');
    else canonical.searchParams.set('__weid_page', path);
    return {path, url: canonical};
  }
  function resolve(value, from) {
    const item = target(value, from);
    return item ? item.path.endsWith('.html') ? item.url.href : asset(item.path) : String(value || '');
  }
  async function source(path) {
    if (texts.has(path)) return texts.get(path);
    if (!pendingText.has(path)) {
      const request = fetch(asset(path)).then(response => {
        if (!response.ok) throw Error('资源加载失败（' + response.status + '）');
        return response.text();
      }).then(text => { texts.set(path, text); return text; }).finally(() => pendingText.delete(path));
      pendingText.set(path, request);
    }
    return pendingText.get(path);
  }
  function attributes(html, from) {
    return html.replace(/<iframe\b[^>]*>/gi, tag => tag.replace(/\bsrc\s*=\s*(["'])([^"']*)\1/i, (whole, q, value) => {
      const item = target(value.replace(/&amp;/g, '&'), from);
      return item?.path.endsWith('.html') ? 'data-weid-frame="' + quote(item.url.href) + '"' : whole;
    })).replace(/\b(src|href)\s*=\s*(["'])([^"']*)\2/gi, (whole, name, q, value) => {
      const raw = value.replace(/&amp;/g, '&'), next = resolve(raw, from);
      return next === raw ? whole : name + '=' + q + next.replaceAll('&', '&amp;').replaceAll(q, q === '"' ? '&quot;' : '&#39;') + q;
    });
  }
  function script(code) { return '<script>' + code.replace(/<\/script/gi, '<\\/script') + '<\/script>'; }
  async function render(path, childURL) {
    let html = await source(path);
    html = html.split(/(<script\b[^>]*>[\s\S]*?<\/script>|<style\b[^>]*>[\s\S]*?<\/style>)/gi)
      .map((chunk, i) => i % 2 ? chunk.replace(/^<script\b[^>]*>/i, tag => attributes(tag, path)) : attributes(chunk, path)).join('');
    const init = childURL ? 'parent.WEID.attach(window,' + JSON.stringify(childURL).replaceAll('<', '\\u003c') + ');WEID.install();' : 'WEID.install();';
    return html.replace(/<head\b[^>]*>/i, head => head + '<base href="' + quote(base.href) + '">' + script(init));
  }
  function createContext(win, href, embedded = false) {
    const logical = new URL(href), page = logical.searchParams.get('__weid_page') || 'index.html';
    const frameStates = new WeakMap(); let observer;
    async function mountFrame(frame, state = frameStates.get(frame)) {
      if (!state || state.loaded || state.loading) return;
      state.loading = true; observer?.unobserve(frame);
      try {
        const html = await render(state.path, state.url.href);
        if (frameStates.get(frame) !== state || !frame.isConnected) return;
        state.loaded = true;
        frame.srcdoc = html;
      } catch (error) {
        if (frameStates.get(frame) !== state || !frame.isConnected) return;
        frame.srcdoc = '<!doctype html><meta charset="utf-8"><div style="padding:24px;font:13px system-ui;color:#64748b">页面加载失败，请检查网络后重试。<button style="margin-left:12px" onclick="parent.WEID.retryFrame(window.frameElement)">重新加载</button></div>';
        console.error('WEID page load:', state.path, error);
      } finally { state.loading = false; }
    }
    function setFrame(frame, value) {
      const item = target(value, page);
      if (!item?.path.endsWith('.html')) return false;
      if (frameStates.get(frame)?.url.href === item.url.href) return true;
      const state = {...item, loaded: false, loading: false};
      frameStates.set(frame, state);
      frame.dataset.weidFrame = item.url.href;
      if (frame.isConnected && frame.getBoundingClientRect().width && frame.getBoundingClientRect().height) mountFrame(frame, state);
      else if (win.IntersectionObserver) {
        observer ||= new win.IntersectionObserver(entries => entries.forEach(e => { if (e.isIntersecting) mountFrame(e.target); }));
        observer.observe(frame);
      } else mountFrame(frame, state);
      return true;
    }
    function scanFrames(root) {
      if (root.matches?.('iframe[data-weid-frame]')) setFrame(root, root.dataset.weidFrame);
      root.querySelectorAll?.('iframe[data-weid-frame]').forEach(frame => setFrame(frame, frame.dataset.weidFrame));
    }
    function navigate(value, replace = false) {
      const item = target(value, page);
      if (embedded && item?.path.endsWith('.html') && win.frameElement) win.parent.WEID.loadFrame(win.frameElement, item.url.href);
      else win.location[replace ? 'replace' : 'assign'](resolve(value, page));
    }
    function install() {
      if (installed.has(win.document)) return;
      installed.add(win.document);
      const open = win.open.bind(win);
      win.open = (url, ...args) => open(url == null ? url : resolve(url, page), ...args);
      for (const [ctor, name] of [[win.HTMLIFrameElement, 'src'], [win.HTMLImageElement, 'src'], [win.HTMLAnchorElement, 'href'], [win.HTMLLinkElement, 'href'], [win.HTMLScriptElement, 'src']]) {
        const descriptor = Object.getOwnPropertyDescriptor(ctor.prototype, name);
        Object.defineProperty(ctor.prototype, name, {...descriptor,
          get() { return ctor === win.HTMLIFrameElement && this.dataset.weidFrame ? this.dataset.weidFrame : descriptor.get.call(this); },
          set(value) {
            if (ctor === win.HTMLIFrameElement) {
              if (setFrame(this, value)) return;
              observer?.unobserve(this); frameStates.delete(this); delete this.dataset.weidFrame; this.removeAttribute('srcdoc');
            }
            descriptor.set.call(this, resolve(value, page));
          }
        });
      }
      const setAttribute = win.Element.prototype.setAttribute;
      win.Element.prototype.setAttribute = function (name, value) {
        if (this instanceof win.HTMLIFrameElement && name.toLowerCase() === 'src') { this.src = value; return; }
        return setAttribute.call(this, name, /^(src|href)$/i.test(name) ? resolve(value, page) : value);
      };
      for (const name of ['innerHTML', 'outerHTML']) {
        const descriptor = Object.getOwnPropertyDescriptor(win.Element.prototype, name);
        Object.defineProperty(win.Element.prototype, name, {...descriptor, set(value) {
          const host = name === 'outerHTML' ? this.parentNode : this;
          descriptor.set.call(this, typeof value === 'string' ? attributes(value, page) : value);
          if (host) scanFrames(host);
        }});
      }
      const adjacent = win.Element.prototype.insertAdjacentHTML;
      win.Element.prototype.insertAdjacentHTML = function (where, value) {
        const result = adjacent.call(this, where, attributes(String(value), page)); scanFrames(this.parentNode || this); return result;
      };
      if (embedded) {
        for (const name of ['pushState', 'replaceState']) {
          const original = win.history[name].bind(win.history);
          win.history[name] = function (state, title, url) {
            if (url == null) return original(state, title);
            const raw = String(url), next = new URL(raw, logical);
            if (!raw.startsWith('about:')) logical.search = next.search;
            return original(state, title, 'about:srcdoc' + (next.hash || '#'));
          };
        }
      }
      win.document.addEventListener('click', event => {
        const anchor = event.target.closest?.('a[href]');
        if (!anchor || anchor.hasAttribute('download')) return;
        const raw = anchor.getAttribute('href'), next = resolve(raw, page);
        if (embedded && raw.startsWith('#') && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0 && (!anchor.target || anchor.target === '_self')) { event.preventDefault(); win.location.hash = raw; return; }
        if (next !== raw) anchor.setAttribute('href', next);
        if (embedded && !event.defaultPrevented && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && event.button === 0 && (!anchor.target || anchor.target === '_self') && target(raw, page)?.path.endsWith('.html')) {
          event.preventDefault(); navigate(raw);
        }
      });
      const ready = () => scanFrames(win.document);
      if (win.document.readyState === 'loading') win.document.addEventListener('DOMContentLoaded', ready, {once: true});
      else ready();
    }
    return Object.freeze({version: 4, release: config.release, page, source: path => texts.get(path), readText: source, modules: config.lazy,
      styleText: (path, text) => text.replace(/url\(\s*(['"]?)([^\s)'"\)]+)\1\s*\)/gi, (whole, q, value) => /^(?:data:|blob:|#)/i.test(value) ? whole : 'url("' + new URL(value, asset(path)).href + '")'), virtual: () => virtual(page), sourceURL: virtual,
      query: () => embedded ? logical.search : win.location.search,
      url: value => resolve(value, page), install, navigate: value => navigate(value), replace: value => navigate(value, true),
      loadFrame: setFrame, retryFrame: frame => mountFrame(frame), list: () => Object.keys(files),
      async exportSources() {
        const entries = await Promise.all(Object.keys(files).map(async path => [path, files[path].type.startsWith('text/') || files[path].type === 'application/json' ? {type: files[path].type, text: await source(path)} : {type: files[path].type, url: asset(path)}]));
        return Object.fromEntries(entries);
      },
      attach(child, url) {
        if (child.parent !== win || !target(url, page)?.path.endsWith('.html')) throw Error('Invalid embedded page');
        child.WEID = createContext(child, url, true);
        child.history.replaceState(null, '', 'about:srcdoc' + (new URL(url).hash || '#'));
      }
    });
  }
  async function boot() {
    let page = new URLSearchParams(location.search).get('__weid_page') || 'index.html';
    if (!hasFile(page) || !page.endsWith('.html')) page = 'index.html';
    const current = new URL(location.href);
    if (page === 'index.html') current.searchParams.delete('__weid_page');
    window.WEID = createContext(window, current.href);
    if (page === 'index.html') { WEID.install(); return; }
    document.querySelector('.layout')?.setAttribute('hidden', '');
    const html = await render(page);
    document.open(); document.write(html); document.close();
  }
  boot().catch(error => {
    // Independent entries hide the host while loading; their retry must remain visible.
    const container = document.createElement('div'); container.setAttribute('role', 'alert');
    container.style.cssText = 'min-height:100vh;display:grid;place-content:center;gap:12px;font:14px system-ui;color:#64748b';
    container.textContent = '页面加载失败，请检查网络后重试。';
    const retry = document.createElement('button'); retry.textContent = '重新加载'; retry.onclick = () => location.reload(); container.appendChild(retry);
    document.body.prepend(container);
    console.error('WEID startup:', error);
  });
})(/*__WEID_CONFIG__*/);
