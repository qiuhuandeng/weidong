/* Route loader: one shared runtime, one download per module, last navigation wins. */
window.PCModules = Object.create(null);
clearTimeout(window.PC_BOOT_TIMER);
window.PCApp = (() => {
  const config = window.PC_ASSETS;
  const scripts = new Map(), styles = new Map(), modules = new Map();
  const styleOrder = [...config.styles, ...Object.values(config.modules).flatMap(module => module.styles)];
  const preloaded = new Set([...document.querySelectorAll('[data-pc-preload]')].map(link => link.getAttribute('href'))), routeModules = new Map();
  let activeModule = null, activeRoute = null, navigation = 0, shared;
  for (const [name, module] of Object.entries(config.modules)) {
    for (const path of module.routes) routeModules.set(path, name);
  }

  function resource(url, type, ordered = true) {
    const cache = type === 'script' ? scripts : styles;
    if (cache.has(url)) return cache.get(url);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(type === 'script' ? 'script' : 'link');
      const cleanup = () => { clearTimeout(timeout); window.removeEventListener('error', executionFailed); };
      const failed = error => { cleanup(); cache.delete(url); node.remove(); reject(error); };
      // A downloaded script can throw before registering its module. Preserve
      // that cause instead of reporting a missing module or a network failure.
      const executionFailed = event => {
        if (event.filename === node.src) failed(event.error || new Error(event.message));
      };
      const timeout = setTimeout(() => failed(new Error('资源加载超时：' + url)), 30000);
      if (type === 'script') { node.src = url; node.async = !ordered; }
      else { node.rel = 'stylesheet'; node.href = url; }
      node.dataset.pcAsset = type;
      if (type === 'script') window.addEventListener('error', executionFailed);
      node.onload = () => { cleanup(); resolve(node); };
      node.onerror = () => failed(new Error('资源加载失败：' + url));
      if (type === 'style') {
        // A shell-only route may load the theme before vendor styles are needed.
        // Preserve the same cascade order on every navigation and failed-load retry.
        const next = [...document.head.querySelectorAll('link[data-pc-asset="style"]')]
          .find(link => styleOrder.indexOf(link.getAttribute('href')) > styleOrder.indexOf(url));
        document.head.insertBefore(node, next || null);
      } else document.head.appendChild(node);
    });
    cache.set(url, promise);
    return promise;
  }
  function preload(url, type) {
    if (preloaded.has(url)) return;
    preloaded.add(url);
    const link = document.createElement('link');
    link.rel = 'preload'; link.as = type; link.href = url;
    document.head.appendChild(link);
  }
  function common() {
    if (!shared) {
      // Start independent downloads together; async=false preserves dependency order.
      shared = Promise.all([
        ...config.styles.map(url => resource(url, 'style')),
        ...config.scripts.map(url => resource(url, 'script'))
      ]).then(() => {
        if (!window.PCUI) throw new Error('公共组件未就绪');
      }).catch(error => { shared = null; throw error; });
    }
    return shared;
  }
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = config.modules[name];
    if (!module) return Promise.reject(new Error('页面依赖未登记：' + name));
    if (module.dependencies?.length) {
      const promise = Promise.all(module.dependencies.map(load)).then(() => loadOwn(name, module));
      const guarded = promise.catch(error => { modules.delete(name); throw error; });
      modules.set(name, guarded);
      return guarded;
    }
    return loadOwn(name, module);
  }
  function loadOwn(name, module) {
    preload(module.script, 'script');
    // Insert after the shared scripts immediately, so the browser can stream-parse
    // this module while dependencies download. async=false keeps execution ordered.
    const dependencies = module.requiresUI === false
      ? Promise.all(config.shellStyles.map(url => resource(url, 'style')))
      : common();
    const promise = Promise.all([dependencies, ...module.styles.map(url => resource(url, 'style')), resource(module.script, 'script', module.requiresUI !== false)])
      .then(async () => {
        if (!window.PCModules[name]) throw new Error('页面模块未就绪：' + name);
        const instance = window.PCModules[name];
        // Some business modules hydrate persistent data asynchronously.
        await instance.ready;
        if (typeof instance.render !== 'function') throw new Error('页面初始化未完成：' + name);
        return instance;
      }).catch(error => { modules.delete(name); throw error; });
    modules.set(name, promise);
    return promise;
  }
  function pending() {
    document.body.classList.remove('approval-h5');
    const main = document.querySelector('#main');
    main.setAttribute('aria-busy', 'true');
    main.innerHTML = '<div class="pc-loading" role="status">正在加载…</div>';
  }
  async function navigate() {
    const turn = ++navigation;
    let path = location.hash.slice(1).split('?')[0] || config.defaultRoute;
    const destination = Object.hasOwn(config.routeRedirects || {}, path) ? config.routeRedirects[path] : null;
    if (destination) {
      activeModule?.leave?.();
      window.PCUI?.closeDialog();
      location.replace(destination + location.search + location.hash);
      return;
    }
    if (!routeModules.has(path)) path = config.defaultRoute;
    if (!location.hash || !routeModules.has(location.hash.slice(1).split('?')[0])) {
      history.replaceState(null, '', '#' + path);
    }
    activeModule?.leave?.();
    window.PCUI?.closeDialog();
    activeModule = null;
    activeRoute = null;
    route = path;
    nav();
    pending();
    const name = routeModules.get(path);
    try {
      const module = await load(name);
      if (turn !== navigation) return;
      activeModule = module;
      activeRoute = name;
      module.render();
      nav();
      document.querySelector('#main').removeAttribute('aria-busy');
      window.PCUI?.sweep();
      performance.mark('pc-route-ready');
      window.dispatchEvent(new CustomEvent('pc:route-ready', {detail: {route, module: name}}));
    } catch (error) {
      if (turn !== navigation) return;
      console.error('[PC loading]', error);
      window.PC_BOOT_FAILED(error);
    }
  }
  function redraw() {
    if (activeModule) { (activeModule.redraw || activeModule.render)(); nav(); }
  }
  window.addEventListener('hashchange', navigate);
  navigate();
  return {retry:navigate, redraw, get module(){return activeRoute;}, get current(){return activeModule;}, get ready(){return !!activeModule;}};
})();

function nav() {
  const config = window.PC_ASSETS;
  const root = document.querySelector('#nav'), top = document.querySelector('#sidebar').scrollTop;
  const selected = route.startsWith('rule-') ? 'rules' : route === 'merge-records' ? 'merge-candidates' : route.startsWith('mobile') ? 'mobile-approvals' : route;
  let current;
  root.innerHTML = config.navigation.map(group => '<div class="nav-label">'+esc(group.group)+'</div>'+group.items.map(([id,label,mark]) => {
    if (id === selected) current = {group:group.group,label};
    return '<button class="nav-item '+(group.standalone?'nav-standalone ':'')+(id===selected?'active':'')+'" title="'+esc(label)+'" onclick="go(\''+id+'\')"'+(id===selected?' aria-current="page"':'')+'>'+icon(mark)+'<span>'+esc(label)+'</span></button>';
  }).join('')).join('');
  mountSidebarGroups();
  document.querySelector('#sidebar').scrollTop = top;
  const title = current?.label || '系统管理后台';
  document.querySelector('#crumb').innerHTML = '<span>WEID微动</span><span>/</span>'+(route==='home'?'':'<span>'+esc(current?.group || '档案治理')+'</span><span>/</span>')+'<b>'+esc(title)+'</b>';
  document.title = title+' · WEID微动';
}
function render() { window.PCApp?.redraw(); }
function readRoute() { return window.PCApp?.retry(); }
function go(path, id) {
  if (window.PCApp?.current?.go) { window.PCApp.current.go(path, id); return; }
  const hash = '#'+path+(id?'?id='+encodeURIComponent(id):'');
  if (location.hash === hash) render(); else location.hash = hash;
  document.querySelector('#sidebar').classList.remove('open');
  syncSidebarControls();
  window.scrollTo(0,0);
}
function closeModal() {
  if (typeof customerCloseModal === 'function') { customerCloseModal(); return; }
  window.PCUI?.closeDialog();
  setTimeout(() => modalFocus?.isConnected && modalFocus.focus(), drawerMotionTime()+16);
}
