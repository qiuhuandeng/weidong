/* Inlined by the builder before the deferred app. No boot deadline or polling. */
window.PC_BOOT_FAILED = function (error) {
  function show() {
    const main = document.getElementById('main');
    main.removeAttribute('aria-busy');
    main.innerHTML = '<div class="pc-loading" role="alert"><span></span><button type="button" onclick="location.reload()">重新加载</button></div>';
    main.querySelector('span').textContent = error?.message
      ? '页面加载失败：' + error.message : '页面资源加载失败，请重新加载后重试。';
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show, {once:true});
  else show();
};
window.PCBoot = (() => {
  const config = window.PC_ASSETS, hints = new Map();
  function preload(url, type) {
    if (hints.has(url)) return;
    const link = document.createElement('link');
    link.rel = 'preload'; link.as = type; link.href = url;
    hints.set(url, link);
    document.head.appendChild(link);
  }
  const styles = name => config.modules[name].shellOnly ? config.shellStyles : config.styles;
  function prepare(name, seen = new Set()) {
    if (seen.has(name)) return;
    seen.add(name);
    const module = config.modules[name];
    if (!module.shellOnly && config.businessScript) preload(config.businessScript, 'script');
    if (module.requiresUI !== false) config.scripts.forEach(script => preload(script.src, 'script'));
    styles(name).forEach(url => preload(url, 'style'));
    preload(module.script, 'script');
    module.styles.forEach(url => preload(url, 'style'));
    (module.dependencies || []).forEach(dependency => prepare(dependency, seen));
  }
  const path = location.hash.slice(1).split('?')[0] || config.defaultRoute;
  if (!Object.hasOwn(config.routeRedirects, path)) {
    const modules = Object.entries(config.modules);
    prepare((modules.find(([, module]) => module.routes.includes(path)) ||
      modules.find(([, module]) => module.routes.includes(config.defaultRoute)))[0]);
  }
  return {prepare, styles, forget(url) { hints.get(url)?.remove(); hints.delete(url); }};
})();
