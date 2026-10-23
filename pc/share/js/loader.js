/* Route loader: one shared runtime, one download per module, last navigation wins. */
window.PCModules = Object.create(null);
clearTimeout(window.PC_BOOT_TIMER);
window.PCApp = (() => {
  const config = window.PC_ASSETS;
  const scripts = new Map(), styles = new Map(), modules = new Map();
  const preloaded = new Set([...document.querySelectorAll('[data-pc-preload]')].map(link => link.getAttribute('href'))), routeModules = new Map();
  let activeModule = null, activeRoute = null, navigation = 0, shared;
  for (const [name, module] of Object.entries(config.modules)) {
    for (const path of module.routes) routeModules.set(path, name);
  }

  function resource(url, type) {
    const cache = type === 'script' ? scripts : styles;
    if (cache.has(url)) return cache.get(url);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(type === 'script' ? 'script' : 'link');
      const failed = () => { clearTimeout(timeout); cache.delete(url); node.remove(); reject(new Error('资源加载失败：' + url)); };
      const timeout = setTimeout(failed, 30000);
      if (type === 'script') { node.src = url; node.async = false; }
      else { node.rel = 'stylesheet'; node.href = url; }
      node.dataset.pcAsset = type;
      node.onload = () => { clearTimeout(timeout); resolve(node); };
      node.onerror = failed;
      document.head.appendChild(node);
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
    preload(module.script, 'script');
    // Insert after the shared scripts immediately, so the browser can stream-parse
    // this module while dependencies download. async=false keeps execution ordered.
    const dependencies = common();
    const promise = Promise.all([dependencies, ...module.styles.map(url => resource(url, 'style')), resource(module.script, 'script')])
      .then(() => {
        if (!window.PCModules[name]) throw new Error('页面模块未就绪：' + name);
        return window.PCModules[name];
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
      PCUI.sweep();
      performance.mark('pc-route-ready');
      window.dispatchEvent(new CustomEvent('pc:route-ready', {detail: {route, module: name}}));
    } catch (error) {
      if (turn !== navigation) return;
      console.error('[PC loading]', error);
      window.PC_BOOT_FAILED();
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
    return '<button class="nav-item '+(id===selected?'active':'')+'" title="'+esc(label)+'" onclick="go(\''+id+'\')"'+(id===selected?' aria-current="page"':'')+'>'+icon(mark)+'<span>'+esc(label)+'</span></button>';
  }).join('')).join('');
  mountSidebarGroups();
  document.querySelector('#sidebar').scrollTop = top;
  const title = current?.label || '系统管理后台';
  document.querySelector('#crumb').innerHTML = '<span>WEID微动</span><span>/</span><span>'+esc(current?.group || '档案治理')+'</span><span>/</span><b>'+esc(title)+'</b>';
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
