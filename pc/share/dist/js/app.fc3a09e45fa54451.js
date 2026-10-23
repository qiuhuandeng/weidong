/* Shared helpers and shell. Business modules must not be imported here. */
const $=s=>document.querySelector(s),$$=s=>Array.from(document.querySelectorAll(s));
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=n=>'¥'+Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
const clone=x=>JSON.parse(JSON.stringify(x));
const paths={grid:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',layers:'M12 3 2 8l10 5 10-5-10-5z M2 12l10 5 10-5 M2 16l10 5 10-5',shield:'M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6l-8-3z M8 12l3 3 5-6',clock:'M12 8v5l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0',flow:'M5 4h5v5H5z M15 15h5v5h-5z M7 9v8h8 M10 6h7v9',return:'M9 6 4 11l5 5 M4 11h10a6 6 0 0 1 0 12',settings:'M4 6h16 M4 12h16 M4 18h16 M8 3v6 M16 9v6 M10 15v6',history:'M3 4v6h6 M3 10a9 9 0 1 1 1 8 M12 7v5l4 2',file:'M6 3h8l4 4v14H6z M14 3v5h4 M9 12h6 M9 16h6',plus:'M12 5v14 M5 12h14',arrow:'M4 12h16 M15 7l5 5-5 5',left:'M20 12H4 M9 7l-5 5 5 5',check:'M5 12l4 4L19 6',search:'M16 16l5 5 M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',down:'M6 9l6 6 6-6',info:'M12 11v6 M12 7v.1 M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',chart:'M4 3v18h17 M8 15v3 M13 9v9 M18 5v13',phone:'M7 2h10a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2 M10 18h4',wallet:'M4 6V4h14v4 M3 8h18v12H3z M16 12h5v4h-5z',users:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 3a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.9',close:'M6 6l12 12 M18 6 6 18',upload:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',download:'M12 3v13 M7 11l5 5 5-5 M4 17v4h16v-4',lock:'M5 10h14v11H5z M8 10V6a4 4 0 0 1 8 0v4 M12 14v3',edit:'m4 16 12-12 4 4L8 20H4z M14 6l4 4',eye:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0'};
function icon(n){return '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="'+(paths[n]||paths.file)+'"/></svg>'}
function btn(t,fn,cls='',ic=''){return '<button class="btn '+cls+'" onclick="'+esc(fn)+'">'+(ic?icon(ic):'')+t+'</button>'}
function badge(t,c='blue'){return '<span class="pill '+c+'"><span class="dot"></span>'+esc(t)+'</span>'}
function notice(t,c='',ic='info'){return !c||c==='blue'?'':'<div class="notice '+c+'">'+icon(ic)+'<span>'+t+'</span></div>'}
function panel(t,b,extra='',cls=''){return '<section class="panel '+cls+'"><div class="panel-head"><h2>'+t+'</h2>'+extra+'</div>'+b+'</section>'}
function body(b){return '<div class="panel-body">'+b+'</div>'}
function table(head,rows){return '<div class="table-wrap"><table><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
let fieldCounter=0;
function field(t,control,req=false){let match=control.match(/\bid="([^"]+)"/),id=match?match[1]:"field-"+(++fieldCounter);if(!match)control=control.replace(/<(input|select|textarea)\b/,'<$1 id="'+id+'"');return '<div class="field"><label for="'+id+'" class="'+(req?'required':'')+'">'+t+'</label>'+control+'</div>'}
function select(opts,val,attrs=''){return '<select '+attrs+'>'+opts.map(x=>{let [v,l]=Array.isArray(x)?x:[x,x];return '<option value="'+esc(v)+'" '+(v===val?'selected':'')+'>'+esc(l)+'</option>'}).join('')+'</select>'}
function switcher(checked,fn,label){return '<label class="switch"><input type="checkbox" '+(checked?'checked':'')+' aria-label="'+esc(label)+'" onchange="'+esc(fn)+'"><span></span></label>'}
function kv(obj){return '<div class="kv">'+Object.entries(obj).map(([k,v])=>'<span>'+k+'</span><span>'+v+'</span>').join('')+'</div>'}
function head(title,sub,actions='',code=''){if(isMergeRoute())return actions?'<div class="rule-section-actions">'+actions+'</div>':'';return '<div class="page-head"><h1>'+title+'</h1><div class="actions">'+actions+'</div></div>'}
const drawerRemovalTimers=new WeakMap();
function drawerMotionTime(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:280}
function canDismissMergeBackdrop(){return !document.querySelector('[data-overlay-layer="arb"],#modal>[data-overlay-layer]')}
function syncDrawerInteraction(){let blocking=!!document.querySelector('#mergeDrawers>[data-overlay-layer],#modal>[data-overlay-layer]');document.body.classList.toggle('drawer-open',blocking);['#main','#sidebar','.topbar'].forEach(sel=>{let el=$(sel);if(el)el.inert=blocking});let mergeRecord=$('#mergeRecordPanel');if(mergeRecord)mergeRecord.inert=mergeRecord.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let workbench=$('#correctionWorkbenchPanel');if(workbench)workbench.inert=workbench.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let application=$('#correctionApplicationPanel');if(application)application.inert=application.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let history=$('#mergeHistoryPanel');if(history)history.inert=history.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let outer=$('#mergeOuterPanel');if(outer)outer.inert=outer.parentElement.classList.contains('is-closing')||!!document.querySelector('[data-overlay-layer="arb"],#modal>[data-overlay-layer]')}
function syncDrawerLayer(root,key,html){
 let layer=root.querySelector('[data-overlay-layer="'+key+'"]');
 if(!html){if(!layer||layer.classList.contains('is-closing'))return;layer.classList.remove('show');layer.classList.add('is-closing');layer.dataset.closing='true';layer.inert=false;layer.firstElementChild.inert=true;layer.setAttribute('aria-hidden','true');let timer=setTimeout(()=>{layer.remove();drawerRemovalTimers.delete(layer);syncDrawerInteraction()},drawerMotionTime());drawerRemovalTimers.set(layer,timer);return}
 let box=document.createElement('div');box.innerHTML=html.trim();let next=box.firstElementChild;
 if(layer){clearTimeout(drawerRemovalTimers.get(layer));drawerRemovalTimers.delete(layer);layer.classList.remove('is-closing');delete layer.dataset.closing;layer.inert=false;layer.removeAttribute('aria-hidden');let panel=layer.firstElementChild,fresh=next.firstElementChild;panel.inert=false;for(const name of ['class','style','data-size']){if(fresh.hasAttribute(name))panel.setAttribute(name,fresh.getAttribute(name));else panel.removeAttribute(name)}panel.innerHTML=fresh.innerHTML;panel.setAttribute('aria-label',fresh.getAttribute('aria-label'));panel.setAttribute('aria-modal','true');layer.classList.add('show')}
 else{layer=next;layer.dataset.overlayLayer=key;root.appendChild(layer);layer.getBoundingClientRect();layer.classList.add('show')}
 if(typeof uiNormalizeIds==='function')uiNormalizeIds();return layer;
}
function focusAfterDrawerClose(selector){setTimeout(()=>{$(selector)?.focus()},drawerMotionTime()+16)}
function toast(s){if(typeof msIsMobile==='function'&&msIsMobile()){msToast(s);return}$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
let modalFocus=null,modalFocusAction='';
function modal(title,content,footer='',wide=false){if(typeof apIsMobile==='function'&&apIsMobile()){apPrompt(title,apMobileMarkup(content),(footer||btn('返回','apDismiss()')).replaceAll('closeModal()','apDismiss()'));return;}if(!document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){modalFocus=document.activeElement;modalFocusAction=modalFocus?.getAttribute?.('onclick')||''}PCUI.dialog({title,content,footer:footer||btn('知道了','closeModal()','primary'),wide});}
function pageTabs(items,selected,label){return '<div class="page-tabs" role="tablist" aria-label="'+label+'">'+items.map(([key,text,action])=>'<button class="page-tab '+(selected===key?'active':'')+'" type="button" role="tab" aria-selected="'+(selected===key)+'" onclick="'+esc(action)+'">'+text+'</button>').join('')+'</div>'}
function queryModule(controls,searchAction='render()',resetAction=''){let oldReset=controls.match(/<button\b[^>]*>\s*重置\s*<\/button>/),resetButton;if(oldReset){controls=controls.replace(oldReset[0],'');resetButton=oldReset[0].replace(/class="[^"]*"/,'class="btn"')}else resetButton=btn('重置',resetAction||'resetPageSearch()');let enter="if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();"+searchAction+"}";return '<section class="panel query-module" aria-label="搜索区" onkeydown="'+esc(enter)+'"><div class="filterbar">'+controls+'<div class="query-actions">'+resetButton+btn('搜索',searchAction,'primary','search')+'</div></div></section>'}
function contentModule(title,content,actions='',cls=''){return '<section class="panel content-module '+cls+'"><div class="panel-head"><h2>'+title+'</h2><div class="actions">'+actions+'</div></div>'+content+'</section>'}
function isMergeRoute(r=route){return r==='rules'||r.startsWith('rule-')}
function toggleSidebar(){if(window.innerWidth<=760)$('#sidebar').classList.toggle('open');else{sidebarPreferences.collapsed=$('.app').classList.toggle('sidebar-collapsed');saveSidebarPreferences()}syncSidebarControls()}
function empty(t,sub='调整筛选条件后重试。'){return '<div class="empty">'+icon('file')+'<div>'+t+'</div><p>'+sub+'</p></div>'}
const pageMap=[['mobile-store','移动档案工作台','P-MB-NEW'],['reviews','审核管理','AP-01'],['customers','客户档案','P-CM-01'],['merge-candidates','档案合并 · 待合并处理','P-MG-00'],['merge-records','档案合并 · 合并记录','P-MG-01'],['rules','规则配置','P-RC-01'],['rule-primary','主客户判定规则','P-RC-02'],['rule-intercept','前置拦截规则','P-RC-03'],['rule-deposit','预约金有效期','P-RC-04'],['rule-arbitration','订单仲裁规则','P-RC-05'],['tickets','纠错工单','P-EC-01'],['new','发起纠错申请','P-EC-02'],['approval','纠错审批','P-EC-03'],['snapshot','快照对比','P-EC-04'],['process','数据分类处理','P-EC-05'],['identity','识别维度拆回','P-EC-06'],['recalc','统计字段重算','P-EC-07'],['adjustment','纠错调整单','P-EC-08'],['ticket','工单详情 / 进度','P-EC-09'],['reversals','冲销记录','P-RV-01'],['reversal-detail','冲销记录详情','P-RV-02'],['mobile-approvals','移动待审核','P-AP-01'],['mobile-approval','移动审批详情','P-AP-02'],['mobile-adjustment','移动调整单确认','P-AP-03'],['mobile-customer','门店客户档案','P-MB-01'],['mobile-new','门店纠错申请','P-MB-02']];
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
