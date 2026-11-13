/* Navigation and welcome-page primitives. Business helpers load on demand. */
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',layers:'M12 3 2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3z M8 12l3 3 5-6',clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',flow:'M5 4h5v5H5z M15 15h5v5h-5z M7 9v8h8 M10 6h7v9',return:'M9 6 4 11l5 5 M4 11h10a6 6 0 0 1 0 12',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',history:'M3 4v6h6 M3 10a9 9 0 1 1 1 8 M12 7v5l4 2',file:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',plus:'M12 5v14 M5 12h14',arrow:'M4 12h16 M15 7l5 5-5 5',left:'M20 12H4 M9 7l-5 5 5 5',check:'M5 12l4 4L19 6',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',down:'M6 9l6 6 6-6',info:'M12 11v6 M12 7v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',chart:'M4 3v18h17 M8 15v3 M13 9v9 M18 5v13',phone:'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M10 18h4',wallet:'M4 6V4h14v4 M3 8h18v12H3z M16 12h5v4h-5z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',close:'M6 6l12 12 M18 6 6 18',upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',edit:'m4 16 12-12 4 4L8 20H4z M14 6l4 4',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
function icon(n){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[n]||paths.file)+'"/></svg>'}
function toggleSidebar(){if(window.innerWidth<=760)$('#sidebar').classList.toggle('open');else{sidebarPreferences.collapsed=$('.app').classList.toggle('sidebar-collapsed');saveSidebarPreferences()}syncSidebarControls()}
let route="";
const SIDEBAR_STORAGE='weidong-sidebar-preferences-v1';
const sidebarPreferences=(()=>{try{let value=JSON.parse(localStorage.getItem(SIDEBAR_STORAGE));if(value&&typeof value.groups==='object'&&value.groups&&!Array.isArray(value.groups))return {collapsed:value.collapsed===true,groups:value.groups}}catch{}return {collapsed:false,groups:{}}})();
if(!Object.hasOwn(sidebarPreferences.groups,'档案治理')&&Object.hasOwn(sidebarPreferences.groups,'客户档案治理'))sidebarPreferences.groups['档案治理']=sidebarPreferences.groups['客户档案治理'];
delete sidebarPreferences.groups['客户档案治理'];
let sidebarLastRoute=null;
function saveSidebarPreferences(){try{localStorage.setItem(SIDEBAR_STORAGE,JSON.stringify(sidebarPreferences))}catch{}}
function syncSidebarControls(){
 const compact=innerWidth>760&&$('.app').classList.contains('sidebar-collapsed');
 document.querySelectorAll('#nav .nav-group').forEach(group=>{let expanded=sidebarPreferences.groups[group.dataset.navGroup]===true;group.querySelector('.nav-group-toggle').setAttribute('aria-expanded',String(expanded));group.querySelector('.nav-group-items').hidden=!expanded});
 const control=$('.mobile-toggle'),expanded=innerWidth<=760?$('#sidebar').classList.contains('open'):!compact;
 control.setAttribute('aria-expanded',String(expanded));control.setAttribute('aria-controls','sidebar');control.setAttribute('aria-label',expanded?'收起左侧菜单':'展开左侧菜单');control.title=expanded?'收起左侧菜单':'展开左侧菜单';
 control.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 4h18v16H3z M9 4v16 '+(expanded?'m16 9-3 3 3 3':'m13 9 3 3-3 3')+'"/></svg>';
}
function toggleNavGroup(name){sidebarPreferences.groups[name]=!sidebarPreferences.groups[name];saveSidebarPreferences();syncSidebarControls()}
function mountSidebarGroups(){
 const navRoot=$('#nav'),children=Array.from(navRoot.children),groups=[];let current=null;
 children.forEach(child=>{if(child.classList.contains('nav-label')){current={name:child.textContent.trim(),items:[]};groups.push(current)}else if(current)current.items.push(child)});
 navRoot.replaceChildren();groups.forEach((group,index)=>{
  if(group.items.length===1&&group.items[0].classList.contains('nav-standalone')){navRoot.append(group.items[0]);return}
  const active=group.items.some(item=>item.classList.contains('active'));
  if(!Object.hasOwn(sidebarPreferences.groups,group.name))sidebarPreferences.groups[group.name]=active;
  if(sidebarLastRoute!==null&&sidebarLastRoute!==route&&active)sidebarPreferences.groups[group.name]=true;
  const section=document.createElement('section'),list=document.createElement('div'),control=document.createElement('button');
  section.className='nav-group'+(active?' is-active':'');section.dataset.navGroup=group.name;
  const groupIcon=({'档案治理':'layers','门店管理':'grid','财务管理':'wallet'})[group.name]||'file';
  control.type='button';control.className='nav-group-toggle';control.id='nav-group-toggle-'+index;control.title=group.name;control.setAttribute('aria-label',group.name);control.setAttribute('aria-controls','nav-group-items-'+index);control.innerHTML='<span class="nav-group-heading">'+icon(groupIcon)+'<span class="nav-group-title">'+esc(group.name)+'</span></span>'+icon('down').replace('class="icon"','class="icon nav-group-chevron"');control.onclick=()=>toggleNavGroup(group.name);
  group.items.forEach(item=>{item.querySelectorAll('.icon').forEach(mark=>mark.remove());if(!item.title)item.title=item.textContent.trim()});
  list.id='nav-group-items-'+index;list.className='nav-group-items';list.setAttribute('aria-labelledby',control.id);list.append(...group.items);section.append(control,list);navRoot.append(section);
 });
 sidebarLastRoute=route;saveSidebarPreferences();syncSidebarControls();
}
$('.app').classList.toggle('sidebar-collapsed',sidebarPreferences.collapsed);
matchMedia('(max-width:760px)').addEventListener('change',syncSidebarControls);

;
/* Download ahead; execute only after dependencies succeed. One runtime per entry. */
window.PCModules = Object.create(null);
window.PCApp = (() => {
  const config = window.PC_ASSETS;
  const scripts = new Map(), styles = new Map(), modules = new Map();
  const styleOrder = [...new Set([...config.shellStyles.filter(url => !config.styles.includes(url)), ...config.styles, ...Object.values(config.modules).flatMap(module => module.styles)])];
  const routeModules = new Map();
  let activeModule = null, activeRoute = null, navigation = 0, shared;
  for (const [name, module] of Object.entries(config.modules)) {
    for (const path of module.routes) routeModules.set(path, name);
  }

  function resource(url, type) {
    const cache = type === 'script' ? scripts : styles;
    if (cache.has(url)) return cache.get(url);
    const promise = new Promise((resolve, reject) => {
      const node = document.createElement(type === 'script' ? 'script' : 'link');
      let settled = false;
      const finish = (error, retryable = false) => {
        if (settled) return;
        settled = true;
        node.onload = node.onerror = null;
        window.removeEventListener('error', executionFailed);
        if (!error) { resolve(node); return; }
        if (retryable) {
          cache.delete(url);
          window.PCBoot.forget(url);
          node.remove();
        }
        // Execution errors are terminal for this document: running a partially
        // executed classic script again can redeclare globals or duplicate writes.
        reject(error);
      };
      const executionFailed = event => {
        if (event.filename === node.src) finish(event.error || new Error(event.message));
      };
      // Let the browser finish the transfer. A wall-clock timer cannot distinguish
      // a slow connection / suspended tab from a failed request.
      if (type === 'script') { node.src = url; node.async = true; }
      else { node.rel = 'stylesheet'; node.href = url; }
      node.dataset.pcAsset = type;
      if (type === 'script') window.addEventListener('error', executionFailed);
      node.onload = () => finish();
      node.onerror = () => finish(new Error('资源加载失败：' + url), true);
      if (type === 'style') {
        // A shell-only route may load the theme before business styles are needed.
        // Preserve the same cascade order on every navigation and failed-load retry.
        const next = [...document.head.querySelectorAll('link[data-pc-asset="style"]')]
          .find(link => styleOrder.indexOf(link.getAttribute('href')) > styleOrder.indexOf(url));
        document.head.insertBefore(node, next || null);
      } else document.head.appendChild(node);
    });
    cache.set(url, promise);
    return promise;
  }
  async function business() {
    if (!config.businessScript) return;
    await resource(config.businessScript, 'script');
    if (!window.PCBusinessReady) throw new Error('业务公共资源初始化未完成');
  }
  function common() {
    if (!shared) {
      // Preloads fetch in parallel; inserting each executable script only after
      // its predecessor succeeds prevents failures from cascading into business.
      shared = Promise.all([
        ...config.styles.map(url => resource(url, 'style')),
        (async () => {
          await business();
          for (const {src, global} of config.scripts) {
            await resource(src, 'script');
            if (!window[global]) throw new Error('依赖初始化未完成：' + global);
          }
        })()
      ]).catch(error => { shared = null; throw error; });
    }
    return shared;
  }
  function load(name) {
    if (modules.has(name)) return modules.get(name);
    const module = config.modules[name];
    if (!module) return Promise.reject(new Error('页面依赖未登记：' + name));
    // Register the promise before starting any dependency, including shared DAG
    // branches requested by concurrent navigations.
    const promise = Promise.resolve().then(async () => {
      await Promise.all([
        module.requiresUI === false
          ? Promise.all([...(module.shellOnly ? [] : [business()]), ...window.PCBoot.styles(name).map(url => resource(url, 'style'))])
          : common(),
        ...(module.dependencies || []).map(load),
        ...module.styles.map(url => resource(url, 'style'))
      ]);
      await resource(module.script, 'script');
      if (!window.PCModules[name]) throw new Error('页面模块未就绪：' + name);
      const instance = window.PCModules[name];
      // Some business modules hydrate persistent data asynchronously.
      await instance.ready;
      if (module.routes.length && typeof instance.render !== 'function') throw new Error('页面初始化未完成：' + name);
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
    const name = routeModules.get(path);
    try {
      const previous = activeModule;
      activeModule = null;
      activeRoute = null;
      previous?.leave?.();
      window.PCUI?.closeDialog();
      route = path;
      nav();
      pending();
      window.PCBoot.prepare(name);
      const module = await load(name);
      if (turn !== navigation) return;
      module.render();
      nav();
      document.querySelector('#main').removeAttribute('aria-busy');
      window.PCUI?.sweep();
      activeModule = module;
      activeRoute = name;
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
  function loadModule(name) {
    if (!Object.hasOwn(config.modules, name)) return Promise.reject(new Error('页面依赖未登记：' + name));
    window.PCBoot.prepare(name);
    return load(name);
  }
  window.addEventListener('hashchange', navigate);
  navigate();
  return {retry:navigate, redraw, loadModule, get module(){return activeRoute;}, get current(){return activeModule;}, get ready(){return !!activeModule;}};
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
