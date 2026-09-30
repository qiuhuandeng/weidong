/* Expand embedded overlays to the host viewport without moving or reloading the iframe. */
(function () {
  'use strict';
  if (parent === window || new URLSearchParams(location.search).get('embed') !== '1') return;
  const app = document.querySelector('#app, #application');
  if (!app) return;
  const surface = document.createElement('div');
  app.before(surface);
  surface.append(app);
  const style = document.createElement('style');
  style.textContent = 'html.complaint-overlay-expanded,html.complaint-overlay-expanded body{background:transparent!important;overflow:hidden!important}.complaint-overlay-expanded .complaint-embedded-surface{position:fixed;left:var(--surface-left);top:var(--surface-top);width:var(--surface-width);height:var(--surface-height);overflow:hidden;background:var(--bg,#f0f2f5)}';
  document.head.append(style);
  surface.className = 'complaint-embedded-surface';
  let open = false, savedScroll = 0;
  function sync() {
    const next = !!document.querySelector('#modal-root [role="dialog"], #drawer-root [role="dialog"]');
    if (next === open) return;
    open = next;
    if (open) savedScroll = window.scrollY;
    parent.postMessage({type:'complaint-overlay-state', open}, '*');
  }
  window.addEventListener('message', event => {
    if (event.source !== parent || event.data?.type !== 'complaint-overlay-viewport') return;
    const rect = event.data.rect;
    if (rect && open) {
      for (const key of ['left','top','width','height']) surface.style.setProperty('--surface-' + key, rect[key] + 'px');
      document.documentElement.classList.add('complaint-overlay-expanded');
      surface.scrollTop = savedScroll;
    } else if (!rect && !open) {
      document.documentElement.classList.remove('complaint-overlay-expanded');
      surface.removeAttribute('style');
      window.scrollTo(0, savedScroll);
    }
  });
  const observer = new MutationObserver(sync);
  document.querySelectorAll('#modal-root, #drawer-root').forEach(root => observer.observe(root, {childList:true, subtree:true}));
  sync();
})();
