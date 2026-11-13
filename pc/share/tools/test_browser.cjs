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
await S('Page.enable');await S('Emulation.setFocusEmulationEnabled',{enabled:true});await S('Network.enable');await S('Runtime.enable');await S('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});return{browser,page,S,E,delay,until,shot,close:async()=>{page.close();await browser.send('Target.disposeBrowserContext',{browserContextId});browser.close()}}}
(async()=>{
 const b=await create(),checks=[];
 const layout=`[...document.querySelectorAll('#main .panel,#main .pc-tabs,#main .pc-query-field')].map(el=>{const r=el.getBoundingClientRect(),s=getComputedStyle(el);return {x:r.x,y:r.y,width:r.width,height:r.height,border:s.borderWidth,padding:s.padding,font:s.fontSize}})`;
 let refundLayout;
 try{
  await b.S('Page.navigate',{url:ENTRY+'#complaints'});
  await b.until('window.PCApp?.ready && !document.querySelector("#main[aria-busy]")');
  assert.equal(await b.E('typeof customerRender'), 'undefined');
  assert.equal(await b.E('typeof UB'), 'undefined');
  checks.push('Complaints does not load customer or management');
  assert.equal(await b.E('PCUI.runtime'),'native');
  assert.equal(await b.E('!!(window.Vue||window.ElementPlus||window.ByComponentsV3||window.VXETable)'),false);
  const config=await b.E('PC_ASSETS');
  for(const route of config.navigation.flatMap(group=>group.items.map(item=>item[0]))){
   await b.E(`go(${JSON.stringify(route)})`);
   await b.until(`window.PCApp?.ready && location.hash.split('?')[0]==='#${route}' && route==='${route}' && !document.querySelector('#main[aria-busy]')`);
   assert.ok(await b.E(route==='home' ? `document.querySelector('#main').innerText.includes('欢迎使用 WEID微动')` : `document.querySelector('#main').innerText.length > 100`));
   assert.deepEqual(await b.E('PCUI.failures'),[]);
   if(route==='refunds'){await b.delay(100);refundLayout=await b.E(layout);}
   checks.push('Route '+route);
  }
  await b.E(`go('refunds');go('customers');go('complaints');go('shops')`);
  await b.until(`PCApp.ready && PCApp.module==='management' && location.hash==='#shops' && !document.querySelector('#main[aria-busy]')`);
  checks.push('Last navigation wins');
  for(const module of ['customer','customer-engine','customer-state','customer-shared-ui','customer-merge','customer-correction','customer-review','customer-mobile','management','management-core','refunds','finance','store-beds','store-settings','complaints']){
   const requests=b.page.events.filter(e=>e.method==='Network.requestWillBeSent'&&new RegExp('/'+module+'\\.[a-f0-9]+\\.js').test(e.params.request.url));
   assert.equal(requests.length,1,module+' downloaded more than once');
  }
  assert.deepEqual(b.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  const requested=b.page.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request.url);
  assert.ok(requested.filter(url=>/^https?:/.test(url)).every(url=>new URL(url).origin===new URL(ENTRY).origin),'Unexpected third-party runtime dependency');
  assert.ok(!requested.some(url=>/\/(?:vue|element-plus|by-components|vendor)[.-]|\.(?:woff2?|ttf|otf)(?:[?#]|$)/i.test(url)),'Legacy runtime/font request');
  checks.push('No duplicate module downloads or runtime errors');
  for(const width of [1440,1280,1024]){
   await b.S('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});
   await b.delay(100);
   assert.ok(await b.E('document.documentElement.scrollWidth<=innerWidth'));
   await b.shot('shops-'+width);
  }
 }finally{await b.close()}
 const home=await create();
 try{
  await home.S('Page.navigate',{url:ENTRY+'#home'});
  await home.until(`window.PCApp?.ready && PCApp.module==='home'`);
  assert.equal(await home.E('typeof PCUI'),'undefined');
  assert.equal(await home.E('typeof PCBusinessReady'),'undefined');
  assert.notEqual(await home.E('typeof modal'),'function');
  assert.ok(!home.page.events.some(e=>e.method==='Network.requestWillBeSent'&&/\/(core|theme)\.[a-f0-9]+\.(js|css)/.test(e.params.request.url)), 'Welcome page downloaded business helpers or full controls theme');
  assert.ok(!home.page.events.some(e=>e.method==='Network.requestWillBeSent'&&/\/business\.[a-f0-9]+\.css/.test(e.params.request.url)), 'Welcome page downloaded historical business styles');
  assert.ok(!home.page.events.some(e=>e.method==='Network.requestWillBeSent'&&/\/(vue|element-plus|by-components|components|customer|management|complaints)\.[a-f0-9]+\./.test(e.params.request.url)));
  await home.E(`go('refunds')`);
  await home.until(`PCApp.ready && PCApp.module==='refunds' && !document.querySelector('#main[aria-busy]')`);
  assert.deepEqual(await home.E('PCUI.failures'),[]);
  await home.delay(100);
  assert.deepEqual(await home.E(layout),refundLayout,'Business layout changed when UI styles loaded after the welcome page');
  checks.push('Welcome-to-business navigation preserves the original layout');
  await home.E(`go('home');go('complaints');go('home')`);
  await home.until(`PCApp.ready && PCApp.module==='home'`);
  assert.deepEqual(home.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  checks.push('Welcome page skips UI downloads; business navigation loads native PCUI');
 }finally{await home.close()}
 const customer=await create();
 try{
  await customer.S('Page.addScriptToEvaluateOnNewDocument',{source:`(()=>{window.__customerWrites=0;const save=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key==='weidong-correction-prototype-v1')__customerWrites++;return save.call(this,key,value)}})();`});
  await customer.S('Page.navigate',{url:ENTRY+'#rules'});
  await customer.until(`window.PCApp?.ready && PCApp.module==='customer-rules'`);
  assert.equal(await customer.E('typeof customerRender'),'undefined');
  assert.equal(await customer.E('state.businessExamplesVersion===undefined && state.approvalWorkflowVersion===undefined'),true);
  assert.ok(!customer.page.events.some(e=>e.method==='Network.requestWillBeSent'&&/\/(customer|customer-mobile)\.[a-f0-9]+\.js/.test(e.params.request.url)));
  await customer.E(`openMergeEditor(state.mergeProfiles[0].id);go('rule-primary')`);
  await customer.delay(350);
  await customer.E(`const edit=[...document.querySelectorAll('button')].find(button=>button.getAttribute('onclick')==='editPrimary(0)');edit.focus();edit.click()`);
  await customer.delay(100);
  await customer.E(`commitPrimary(0)`);
  await customer.delay(400);
  assert.equal(await customer.E('modalFocusAction'),'editPrimary(0)');
  assert.equal(await customer.E(`!document.querySelector('.pc-dialog') && !document.querySelector('#mergeOuterPanel').closest('[inert]')`),true);
  await customer.E(`configDraft.threshold.hours=7;saveMergeProfile()`);
  await customer.E(`go('customers')`);
  await customer.until(`PCApp.ready && PCApp.module==='customer'`);
  assert.equal(await customer.E('state.config.threshold.hours'),7);
  assert.equal(await customer.E('typeof apMobilePage'),'undefined');
  await customer.E(`window.__originalCustomers=pcCustomers;window.__customerCalls=0;pcCustomers=function(){__customerCalls++;return __originalCustomers()};render()`);
  assert.equal(await customer.E('__customerCalls'),1);
  await customer.E(`pcCustomers=__originalCustomers;go('shops')`);
  await customer.until(`PCApp.ready && PCApp.module==='management'`);
  assert.equal(await customer.E('uiIdObserver===null'),true);
  await customer.E(`window.__customerProbe=document.createElement('span');__customerProbe.textContent='CUS-LIFECYCLE-PROBE';document.querySelector('#main').append(__customerProbe)`);
  await customer.delay(100);
  assert.equal(await customer.E('__customerProbe.textContent'),'CUS-LIFECYCLE-PROBE');
  await customer.E(`go('customers')`);
  await customer.until(`PCApp.ready && PCApp.module==='customer'`);
  assert.equal(await customer.E('uiIdObserver!==null'),true);
  await customer.E(`go('mobile-approvals')`);
  await customer.until(`PCApp.ready && PCApp.module==='customer-mobile'`);
  assert.equal(await customer.E('typeof apMobilePage'),'function');
  await customer.E(`go('customers')`);
  await customer.until(`PCApp.ready && PCApp.module==='customer'`);
  for(let i=0;i<2;i++){
   const origin=await customer.E('performance.timeOrigin');
   await customer.S('Page.reload');
   await customer.until(`performance.timeOrigin!==${origin} && window.PCApp?.ready && PCApp.module==='customer'`);
   await customer.delay(100);
  }
  assert.equal(await customer.E('__customerWrites'),0);
  assert.equal(await customer.E('state.config.threshold.hours'),7);
  assert.deepEqual(customer.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
  checks.push('Rules load without workflows; saved rules are shared with customer pages');
  checks.push('Customer list aggregates once per render; mobile UI loads on demand');
  checks.push('Customer DOM observation stops on leave and restarts on return');
  checks.push('Unchanged customer refresh skips writes and retains saved configuration');
 }finally{await customer.close()}
 const features=await create();
 try{
  await features.S('Page.navigate',{url:ENTRY+'#customers'});
  await features.until(`window.PCApp?.ready && PCApp.module==='customer'`);
  assert.equal(await features.E(`['customer-shared-ui','customer-detail','customer-merge','customer-correction','customer-review','customer-mobile'].every(name=>!PCModules[name])`),true);
  assert.ok(!features.page.events.some(e=>e.method==='Network.requestWillBeSent'&&/\/customer-mobile\.[a-f0-9]+\.css/.test(e.params.request.url)));
  assert.equal(await features.E('state.mergeRecords.every(record=>!record.snapshotExamples)'),true);
  checks.push('Customer list skips other business views, mobile styles and supplemental snapshots');
  assert.equal(await features.E('state.acceptanceFixturesVersion===undefined && state.approvalExamplesVersion===undefined && state.acceptancePendingProfiles.length>0'),true);
  const customerRows=await features.E('pcCustomers().map(c=>[c.id,c.name,c.phone,c.store,c.consultant,pcCustomerStatus(c),!!c.demo])');
  await features.S('Page.reload');
  await features.until(`window.PCApp?.ready && PCApp.module==='customer'`);
  assert.equal(await features.E('state.acceptanceFixturesVersion===undefined && state.approvalExamplesVersion===undefined'),true);
  assert.deepEqual(await features.E('pcCustomers().map(c=>[c.id,c.name,c.phone,c.store,c.consultant,pcCustomerStatus(c),!!c.demo])'),customerRows);
  checks.push('Customer refresh preserves list fields without preparing detail or approval fixtures');
  await features.S('Network.setBlockedURLs',{urls:['*share/dist/js/customer-detail.*.js']});
  await features.E('pcOpenCustomer(pcCustomers()[0].id)');
  await features.until(`document.body.innerText.includes('页面功能加载失败')`);
  assert.equal(await features.E('mrTask'),null);
  await features.S('Network.setBlockedURLs',{urls:[]});
  await features.E('pcOpenCustomer(pcCustomers()[0].id)');
  await features.until(`mrTask?.kind==='customer' && !!document.querySelector('#mergeDrawers [role=dialog]')`);
  assert.equal(await features.E(`!!PCModules['customer-detail'] && !PCModules['customer-merge']`),true);
  assert.equal(await features.E('state.acceptanceFixturesVersion===1 && state.approvalExamplesVersion===1 && !state.acceptancePendingProfiles'),true);
  assert.deepEqual(await features.E('pcCustomers().map(c=>[c.id,c.name,c.phone,c.store,c.consultant,pcCustomerStatus(c),!!c.demo])'),customerRows);
  assert.equal(await features.E(`(async()=>{const before=JSON.stringify(state);await Promise.all([PCModules['customer-engine'].initializeDetails(),PCModules['customer-engine'].initializeDetails()]);return JSON.stringify(state)===before})()`),true);
  assert.equal(await features.E(`[0,Date.now(),Date.parse('2026-01-01T16:00:00Z')].every(ms=>mrDate(ms)===new Date(ms).toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})) && mrDate(NaN)==='Invalid Date'`),true);
  checks.push('Detail initialization completes before actions, preserves list fields and runs only once');
  checks.push('Customer detail loads on demand and retries after a download failure');
  // Delay a cross-feature action, then close its source drawer before it finishes.
  await features.E(`window.__loadCustomer=PCApp.loadModule;PCApp.loadModule=name=>new Promise(resolve=>{window.__resumeCustomer=()=>resolve(__loadCustomer(name))});window.__pendingCustomer=mrOpen('record',state.mergeRecords[0].id);mrClose()`);
  await features.E('__resumeCustomer();__pendingCustomer');
  assert.equal(await features.E('mrTask'),null);
  await features.E('PCApp.loadModule=__loadCustomer');
  await features.E(`mrOpen('record',state.mergeRecords[0].id);mrTab('compare')`);
  assert.equal(await features.E('state.mergeRecords.filter(record=>record.snapshotExamples).length'),1);
  await features.E(`(async()=>{mrClose();mrNew();mrTask.reason='lazy module draft';await mrSaveDraft();mrNew()})()`);
  assert.equal(await features.E('mrTask.reason'),'lazy module draft');
  checks.push('Closing a source drawer cancels a delayed action; selected record snapshots and merge drafts work');
  // A navigation away must also invalidate an in-flight action.
  await features.E(`mrClose();PCApp.loadModule=name=>new Promise(resolve=>{window.__resumeCustomer=()=>resolve(__loadCustomer(name))});window.__pendingCustomer=cxOpenApplication();go('home')`);
  await features.until(`PCApp.ready && PCApp.module==='home'`);
  await features.E('__resumeCustomer();__pendingCustomer');
  assert.equal(await features.E('cxApplicationOpen'),false);
  assert.equal(await features.E(`!!document.querySelector('#mergeDrawers [role=dialog]')`),false);
  await features.E(`PCApp.loadModule=__loadCustomer;go('tickets')`);
  await features.until(`PCApp.ready && PCApp.module==='customer-correction'`);
  await features.E(`(async()=>{cxOpenApplication();newForm.description='correction draft after split';await clSaveDraft(true);clEditDraft(state.correctionDrafts[0].id)})()`);
  assert.equal(await features.E('newForm.description'),'correction draft after split');
  await features.E(`clClose();window.__reviewCase=state.cases.find(c=>c.review);pcGoCase(__reviewCase.id)`);
  await features.until(`apTask?.id===__reviewCase.id && !!document.querySelector('#mergeDrawers [role=dialog]')`);
  await features.E(`apReviewTabs().forEach(([tab])=>apTab(tab));apClose()`);
  checks.push('Navigation cancels delayed drawers; correction drafts and cross-feature review tabs work');
  assert.deepEqual(features.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 }finally{await features.close()}
 const stores=await create();
 try{
  await stores.S('Page.navigate',{url:ENTRY+'#shops'});
  await stores.until(`window.PCApp?.ready && PCApp.module==='management'`);
  assert.equal(await stores.E(`!PCModules.refunds && !PCModules.finance && !PCModules['store-beds'] && !PCModules['store-settings']`),true);
  assert.equal(await stores.E(`!Object.hasOwn(UB.context.data,'refunds') && !Object.hasOwn(UB.context.data,'storeSeats')`),true);
  await stores.E(`window.__storeId=UB.context.data.shops[0].id;window.__storeName=UB.context.data.shops[0].name;window.__storeRaw=localStorage.getItem(UB.key);UB.shopEdit(__storeId)`);
  await stores.E(`document.querySelector('#mergeDrawers input[name=name]').value='Storage retry check';window.__storeSet=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(key===UB.key)throw Error('QuotaExceededError');return __storeSet.call(this,key,value)};UB.commit()`);
  assert.equal(await stores.E('localStorage.getItem(UB.key)===__storeRaw'),true);
  assert.equal(await stores.E('UB.context.data.shops[0].name===__storeName'),true);
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers input[name=name]').value`),'Storage retry check');
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers').innerText.includes('QuotaExceededError')`),true);
  await stores.E('Storage.prototype.setItem=__storeSet;UB.commit()');
  await stores.until('UB.context.stack.length===0');
  assert.equal(await stores.E(`JSON.parse(localStorage.getItem(UB.key)).shops[0].name`),'Storage retry check');
  checks.push('Stores load independently; quota failures preserve the original record and editable draft');
  // Capacity's save callback retains a row reference; retry must update that same record.
  await stores.E('UB.shopCapacity(__storeId)');
  await stores.E(`Object.assign(UB.context.stack.at(-1).model,{newPosts:['主任'],oldPosts:['店长']});document.querySelector('#mergeDrawers input[name=newCapacity]').value='7';document.querySelector('#mergeDrawers input[name=oldCapacity]').value='3';Storage.prototype.setItem=function(key,value){if(key===UB.key)throw Error('QuotaExceededError');return __storeSet.call(this,key,value)};UB.commit()`);
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers input[name=newCapacity]').value`),'7');
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers').innerText.includes('QuotaExceededError')`),true);
  await stores.E('Storage.prototype.setItem=__storeSet;UB.commit()');
  await stores.until('UB.context.stack.length===0');
  assert.equal(await stores.E(`Number(JSON.parse(localStorage.getItem(UB.key)).shops[0].capacity.newCapacity)`),7);
  checks.push('Retry preserves captured record references and saves the retained capacity draft');
  // Simulate a legacy/external writer while the form remains open.
  await stores.E(`UB.shopEdit(__storeId)`);
  await stores.E(`window.__external=JSON.parse(localStorage.getItem(UB.key));__external.shops[0].name='Another window';localStorage.setItem(UB.key,JSON.stringify(__external));document.querySelector('#mergeDrawers input[name=name]').value='Stale draft';UB.commit()`);
  assert.equal(await stores.E(`JSON.parse(localStorage.getItem(UB.key)).shops[0].name`),'Another window');
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers input[name=name]').value`),'Stale draft');
  assert.equal(await stores.E(`document.querySelector('#mergeDrawers').innerText.includes('其他页面已更新')`),true);
  checks.push('Stale management edits cannot overwrite changes from another window');
  await stores.S('Page.reload');await stores.until(`window.PCApp?.ready && PCApp.module==='management'`);
  await stores.E(`window.__savedRaw=localStorage.getItem(UB.key);go('finance')`);
  await stores.until(`PCApp.ready && PCApp.module==='finance'`);
  assert.equal(await stores.E('UB.context.data.shops[0].name'),'Another window');
  await stores.E(`go('refunds')`);await stores.until(`PCApp.ready && PCApp.module==='refunds'`);
  await stores.E(`UB.withdrawalPay('RF-RECOVERY-ready-original')`);
  await stores.E(`navigator.locks.request(UB.key,()=>new Promise(resolve=>window.__releaseStoreLock=resolve));void 0`);
  await stores.until(`typeof __releaseStoreLock==='function'`);
  await stores.E(`document.querySelector('.pc-dialog .primary').click();closeModal();__releaseStoreLock()`);
  await stores.until(`!document.querySelector('.pc-dialog')`);
  assert.equal(await stores.E(`UB.context.data.refunds.find(r=>r.id==='RF-RECOVERY-ready-original').recoveryStatus`),'待原路退款');
  checks.push('Closing a confirmation cancels a payment still waiting for its storage lock');
  await stores.E(`UB.refundTab('withdrawal');UB.withdrawalPay('RF-RECOVERY-ready-original')`);
  await stores.until(`!!document.querySelector('.pc-dialog')`);
  await stores.E(`document.querySelector('.pc-dialog .primary').click()`);
  await stores.until(`UB.context.data.refunds.find(r=>r.id==='RF-RECOVERY-ready-original').recoveryStatus==='已退款'`);
  checks.push('Split finance/refund pages preserve shared store data and complete simulated refund payments');
  assert.deepEqual(stores.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
 }finally{await stores.close()}
 for(const raw of ['{broken','{"version":99,"history":[]}']){
  const page=await create();
  try{
   await page.S('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem('weidong-unified-backend-v1',${JSON.stringify(raw)})`});
   await page.S('Page.navigate',{url:ENTRY+'#shops'});
   await page.until(`document.querySelector('#main [role=alert]')?.innerText.includes('原记录已保留')`);
   assert.equal(await page.E(`localStorage.getItem('weidong-unified-backend-v1')`),raw);
   await page.E(`go('home')`);await page.until(`PCApp.ready && PCApp.module==='home'`);
   checks.push('Invalid management data is retained and navigation remains usable: '+raw);
  }finally{await page.close()}
 }
 for(const pattern of ['*share/dist/js/app.*.js','*share/dist/js/core.*.js','*share/dist/js/components.*.js','*share/dist/js/management-core.*.js','*share/dist/js/refunds.*.js']){
  const page=await create();
  try{
   await page.S('Network.setBlockedURLs',{urls:[pattern]});
   await page.S('Page.navigate',{url:ENTRY+'#refunds'});
   await page.until(`document.querySelector('#main [role=alert]')?.innerText.includes('重新加载')`);
   await page.S('Network.setBlockedURLs',{urls:[]});
   await page.E(`document.querySelector('#main [role=alert] button').click()`);
   await page.until(`window.PCApp?.ready && PCApp.module==='refunds'`);
   assert.equal(await page.E('typeof customerRender'),'undefined');
   checks.push('Load failure and retry: '+pattern);
  }finally{await page.close()}
 }
 for(const raw of ['{broken', '{"version":99}']){
  const page=await create();
  try{
   const key='weidong-correction-prototype-v1';
   await page.S('Page.addScriptToEvaluateOnNewDocument',{source:`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(raw)});`});
   await page.S('Page.navigate',{url:ENTRY+'#merge-candidates'});
   await page.until(`document.querySelector('#main [role=alert]')?.innerText.includes('原记录已保留')`);
   assert.equal(await page.E(`localStorage.getItem(${JSON.stringify(key)})`),raw);
   assert.equal(await page.E('PCApp.ready'),false);
   await page.E(`location.hash='#shops'`);
   await page.until(`PCApp.ready && PCApp.module==='management'`);
   await page.E(`PCUI.dialog({title:'关闭检查',content:'其他业务仍可使用'});closeModal()`);
   await page.until(`!document.querySelector('.pc-dialog')`);
   assert.deepEqual(page.page.events.filter(e=>e.method==='Runtime.exceptionThrown'),[]);
   checks.push('Invalid customer data preserved; other business dialogs still work: '+raw);
  }finally{await page.close()}
 }
 fs.writeFileSync(path.join(OUTPUT,'results.json'),JSON.stringify({entry:ENTRY,checks},null,2));
 console.log(checks.length+' browser checks passed; output: '+OUTPUT);
})().catch(error=>{console.error(error);process.exitCode=1});
