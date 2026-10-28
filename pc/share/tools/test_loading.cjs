// Targeted loading contracts; no browser, dependencies or generated artifacts.
// Run: node --test pc/share/tools/test_loading.cjs
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../js/loader.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness(execute, extraModules = {}) {
  const events = new Map(), failures = [], downloads = [], timers = new Map();
  let sequence = 0;
  const element = () => ({innerHTML:'', scrollTop:0, dataset:{}, classList:{remove(){}},
    setAttribute(){}, removeAttribute(){}, remove(){}, querySelectorAll:()=>[]});
  const nodes = Object.fromEntries(['#main','#nav','#sidebar','#crumb'].map(id => [id, element()]));
  const context = vm.createContext({
    URL, Promise, Error, console:{error(){}, warn(){}},
    location:{hash:'#probe', search:''}, history:{replaceState(){}},
    route:'', esc:String, icon:()=>'', mountSidebarGroups(){},
    performance:{mark(){}}, CustomEvent:class {constructor(type, init){this.type=type;this.detail=init?.detail}},
    setTimeout(fn){timers.set(++sequence, fn);return sequence}, clearTimeout(id){timers.delete(id)},
    addEventListener(type, fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn)},
    removeEventListener(type, fn){events.get(type)?.delete(fn)},
    dispatchEvent(event){for(const fn of [...(events.get(event.type)||[])])fn(event)},
    PC_BOOT_FAILED:error=>failures.push(error),
    PC_ASSETS:{defaultRoute:'probe', navigation:[], scripts:[], styles:[], shellStyles:[],
      modules:{probe:{routes:['probe'],styles:[],script:'probe.js',requiresUI:false}, ...extraModules}},
    document:{body:element(),querySelector:id=>nodes[id],querySelectorAll:()=>[],
      createElement:tag=>Object.assign(element(),{tag,src:'',getAttribute(key){return this[key]}}),
      head:{querySelectorAll:()=>[],appendChild(node){
        if(node.tag!=='script')return;
        downloads.push(node.src);
        queueMicrotask(()=>execute(context,node));
      }}}
  });
  context.window = context;
  vm.runInContext(source, context);
  return {context,failures,downloads,timers,events,nodes};
}

test('waits for ready before rendering, including an asynchronous data initializer', async () => {
  let finish, rendered=0;
  const h=harness((w,node)=>{
    w.PCModules.probe={ready:new Promise(resolve=>finish=resolve),render(){rendered++}};
    node.onload();
  });
  await tick();
  assert.equal(rendered,0);
  assert.equal(h.context.PCApp.ready,false);
  finish();await tick();
  assert.equal(rendered,1);
  assert.equal(h.context.PCApp.ready,true);
  assert.equal(h.failures.length,0);
  assert.equal(h.events.get('error').size,0);
});

test('preserves the actual initialization failure instead of a network message', async () => {
  const error=new Error('审批数据库不可用');
  const h=harness((w,node)=>{
    w.PCModules.probe={ready:Promise.reject(error),render(){assert.fail('must not render')}};
    node.onload();
  });
  await tick();
  assert.equal(h.failures[0],error);
  assert.equal(h.context.PCApp.ready,false);
});

test('captures top-level quota errors, clears failed cache and allows retry', async () => {
  const error=Object.assign(new Error('localStorage quota exceeded'),{name:'QuotaExceededError'});
  let failed=true;
  const h=harness((w,node)=>{
    if(failed)w.dispatchEvent({type:'error',filename:node.src,error});
    else w.PCModules.probe={render(){}};
    // Browsers fire load even if executing a successfully downloaded script threw.
    node.onload();
  });
  await tick();assert.equal(h.failures[0],error);
  assert.equal(h.events.get('error').size,0);
  failed=false;await h.context.PCApp.retry();
  assert.equal(h.context.PCApp.ready,true);
  assert.deepEqual(h.downloads,['probe.js','probe.js']);
});

test('network resource failures can retry without stale rejection or listeners', async () => {
  let fail=true;
  const h=harness((w,node)=>{
    if(fail)node.onerror();
    else {w.PCModules.probe={render(){}};node.onload()}
  });
  await tick();assert.match(h.failures[0].message,/资源加载失败：probe.js/);
  fail=false;await h.context.PCApp.retry();
  assert.equal(h.context.PCApp.ready,true);
  assert.equal(h.events.get('error').size,0);
  assert.equal(h.timers.size,0);
});

test('script timeout preserves a distinct cause and cleans up listeners', async () => {
  const h=harness(()=>{});
  await tick();
  for(const expire of [...h.timers.values()])expire();
  await tick();assert.match(h.failures[0].message,/资源加载超时/);
  assert.equal(h.events.get('error').size,0);
});

test('unrelated window errors do not mark a successfully loaded module as failed', async () => {
  const h=harness((w,node)=>{
    w.dispatchEvent({type:'error',filename:'other.js',error:new Error('other page')});
    w.PCModules.probe={render(){}};node.onload();
  });
  await tick();assert.equal(h.context.PCApp.ready,true);assert.equal(h.failures.length,0);
});

test('dependency readiness precedes the dependent script', async () => {
  let finish;
  const h=harness((w,node)=>{
    if(node.src==='data.js')w.PCModules.data={ready:new Promise(resolve=>finish=resolve),render(){}};
    else w.PCModules.probe={render(){}};
    node.onload();
  },{probe:{routes:['probe'],styles:[],script:'probe.js',requiresUI:false,dependencies:['data']},
    data:{routes:[],styles:[],script:'data.js',requiresUI:false}});
  await tick();assert.deepEqual(h.downloads,['data.js']);
  finish();await tick();assert.deepEqual(h.downloads,['data.js','probe.js']);
  assert.equal(h.context.PCApp.ready,true);
});

test('new-page scaffold registers before a synchronous initializer throws', async () => {
  let source=fs.readFileSync(path.join(__dirname,'../templates/module.js'),'utf8')
    .replaceAll('__MODULE_KEY__','"probe"').replaceAll('__MODULE_NAME__','probe').replaceAll('__PAGE_TITLE__','"测试"');
  source=source.replace('async function initialize() {','async function initialize() { localStorage.setItem("test", "data");');
  const error=Object.assign(new Error('quota full'),{name:'QuotaExceededError'});
  const context=vm.createContext({PCModules:{},localStorage:{setItem(){throw error}}});
  context.window=context;
  vm.runInContext(source,context);
  assert.equal(typeof context.PCModules.probe.render,'function');
  await assert.rejects(context.PCModules.probe.ready, candidate=>candidate===error);
});

test('generated fallback renders error text safely and offers retry', () => {
  const html=fs.readFileSync(path.join(__dirname,'../../pc.html'),'utf8');
  const fallback=html.match(/window\.PC_BOOT_FAILED=function\(error\)[\s\S]*?(?=;window\.PC_BOOT_TIMER)/)?.[0];
  assert.ok(fallback,'build the PC entry first');
  const span={textContent:''},main={innerHTML:'',removeAttribute(){},querySelector:()=>span};
  const context=vm.createContext({document:{readyState:'complete',getElementById:()=>main}});context.window=context;
  vm.runInContext(fallback,context);
  const message='<img src=x onerror=alert(1)> 数据错误';
  context.PC_BOOT_FAILED({message});
  assert.equal(span.textContent,'页面加载失败：'+message);
  assert.ok(!main.innerHTML.includes('<img'));
  assert.match(main.innerHTML,/重新加载/);
  context.PC_BOOT_FAILED();assert.match(span.textContent,/页面资源加载失败/);
});
