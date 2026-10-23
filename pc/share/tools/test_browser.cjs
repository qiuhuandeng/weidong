// Requires a dedicated Chromium launched with --remote-debugging-port=9348.
// PC_URL selects the preview URL; PC_QA_OUTPUT defaults to a temporary directory.
// Uses isolated browser contexts; does not touch the user's browser data.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const CDP=process.env.CDP_URL||'http://127.0.0.1:9348';
const ENTRY=process.env.PC_URL||'http://127.0.0.1:8757/pc/pc.html';
const OUTPUT=process.env.PC_QA_OUTPUT||path.join(require('node:os').tmpdir(),'weid-pc-browser-check');
fs.mkdirSync(OUTPUT,{recursive:true});
async function socket(url){const ws=new WebSocket(url);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});let seq=0;const pending=new Map(),events=[];ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(Error(JSON.stringify(m.error))):p.resolve(m.result)}else events.push(m)};return{events,close:()=>ws.close(),send:(method,params={})=>new Promise((resolve,reject)=>{pending.set(++seq,{resolve,reject});ws.send(JSON.stringify({id:seq,method,params}))})}}
async function create(){const browser=await socket((await(await fetch(CDP+'/json/version')).json()).webSocketDebuggerUrl),{browserContextId}=await browser.send('Target.createBrowserContext'),{targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId}),page=await socket((await(await fetch(CDP+'/json')).json()).find(t=>t.id===targetId).webSocketDebuggerUrl);const S=page.send,E=async expression=>{const r=await S('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value},delay=ms=>new Promise(r=>setTimeout(r,ms)),until=async(expr,limit=200)=>{for(let i=0;i<limit;i++){if(await E(expr))return;await delay(100)}throw Error('Timed out '+expr+'\n'+JSON.stringify(page.events.filter(e=>['Runtime.exceptionThrown','Network.loadingFailed'].includes(e.method))))},shot=async(name)=>fs.writeFileSync(path.join(OUTPUT,name+'.png'),Buffer.from((await S('Page.captureScreenshot',{format:'png'})).data,'base64'));
await S('Page.enable');await S('Network.enable');await S('Runtime.enable');await S('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});return{browser,page,S,E,delay,until,shot,close:async()=>{page.close();await browser.send('Target.disposeBrowserContext',{browserContextId});browser.close()}}}
(async()=>{
 const b=await create(),checks=[];
 try{
  await b.S('Page.navigate',{url:ENTRY+'#complaints'});
  await b.until('window.PCApp?.ready && !document.querySelector("#main[aria-busy]")');
  assert.equal(await b.E('typeof customerRender'), 'undefined');
  assert.equal(await b.E('typeof UB'), 'undefined');
  checks.push('Complaints does not load customer or management');
  const config=JSON.parse(fs.readFileSync(path.join(__dirname,'../routes.json')));
  for(const route of config.navigation.flatMap(group=>group.items.map(item=>item[0]))){
   await b.E(`go(${JSON.stringify(route)})`);
   await b.until(`window.PCApp?.ready && location.hash==='#${route}' && !document.querySelector('#main[aria-busy]')`);
   assert.ok(await b.E(`document.querySelector('#main').innerText.length > 100`));
   assert.deepEqual(await b.E('PCUI.failures'),[]);
   checks.push('Route '+route);
  }
  await b.E(`go('refunds');go('customers');go('complaints');go('shops')`);
  await b.until(`PCApp.ready && PCApp.module==='management' && location.hash==='#shops' && !document.querySelector('#main[aria-busy]')`);
  checks.push('Last navigation wins');
  for(const module of ['customer','management','complaints']){
   const requests=b.page.events.filter(e=>e.method==='Network.requestWillBeSent'&&new RegExp('/'+module+'\\.[a-f0-9]+\\.js').test(e.params.request.url));
   assert.equal(requests.length,1,module+' downloaded more than once');
  }
  assert.deepEqual(b.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  const requested=b.page.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  assert.ok(requested.filter(url=>/^https?:/.test(url)).every(url=>new URL(url).origin===new URL(ENTRY).origin),'Unexpected third-party runtime dependency');
  checks.push('No duplicate module downloads or runtime errors');
  for(const width of [1440,1280,1024]){
   await b.S('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await b.delay(100);
   assert.ok(await b.E('document.documentElement.scrollWidth<=innerWidth'));
   await b.shot('shops-'+width);
  }
 }finally{await b.close()}
 for(const pattern of ['*share/dist/js/app.*.js','*share/dist/js/management.*.js']){
  const page=await create();
  try{
   await page.S('Network.setBlockedURLs',{urls:[pattern]});
   await page.S('Page.navigate',{url:ENTRY+'#refunds'});
   await page.until(`document.querySelector('#main [role=alert]')?.innerText.includes('重新加载')`);
   await page.S('Network.setBlockedURLs',{urls:[]});
   await page.E(`document.querySelector('#main [role=alert] button').click()`);
   await page.until(`window.PCApp?.ready && PCApp.module==='management'`);
   assert.equal(await page.E('typeof customerRender'),'undefined');
   checks.push('Load failure and retry: '+pattern);
  }finally{await page.close()}
 }
 fs.writeFileSync(path.join(OUTPUT,'results.json'),JSON.stringify({entry:ENTRY,checks},null,2));
 console.log(checks.length+' browser checks passed; output: '+OUTPUT);
})().catch(error=>{console.error(error);process.exitCode=1});
