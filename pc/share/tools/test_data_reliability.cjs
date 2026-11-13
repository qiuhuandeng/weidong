/* Dedicated Chromium only (CDP_URL); every case uses disposable browser data. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const CDP=process.env.CDP_URL||'http://127.0.0.1:9359';
const ENTRY=process.env.PC_URL||'http://127.0.0.1:8758/pc/pc.html';
async function connect(url){
  const ws=new WebSocket(url);await new Promise((resolve,reject)=>{ws.onopen=resolve;ws.onerror=reject});let id=0;const pending=new Map();
  ws.onmessage=event=>{const message=JSON.parse(event.data),p=pending.get(message.id);if(!p)return;pending.delete(message.id);message.error?p.reject(Error(JSON.stringify(message.error))):p.resolve(message.result)};
  return {close:()=>ws.close(),send:(method,params={})=>new Promise((resolve,reject)=>{pending.set(++id,{resolve,reject});ws.send(JSON.stringify({id,method,params}))})};
}
async function create(parent){
  const browser=parent?.browser||await connect((await(await fetch(CDP+'/json/version')).json()).webSocketDebuggerUrl);
  const {browserContextId}=parent||await browser.send('Target.createBrowserContext');
  const {targetId}=await browser.send('Target.createTarget',{url:'about:blank',browserContextId});
  const page=await connect((await(await fetch(CDP+'/json')).json()).find(t=>t.id===targetId).webSocketDebuggerUrl);
  await page.send('Page.enable');
  const E=async expression=>{const r=await page.send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||JSON.stringify(r.exceptionDetails));return r.result.value};
  const until=async expression=>{for(let i=0;i<200;i++){if(await E(expression))return;await new Promise(r=>setTimeout(r,50))}throw Error('Timed out: '+expression+'\n'+await E('document.body.innerText'))};
  return {browser,browserContextId,E,until,send:page.send,navigate:async(url=ENTRY+'#home')=>{await page.send('Page.navigate',{url});await until('window.PCApp?.ready')},close:async()=>{page.close();if(parent)await browser.send('Target.closeTarget',{targetId});else{await browser.send('Target.disposeBrowserContext',{browserContextId});browser.close()}}};
}
async function inventoryStorage(){
  const b=await create();try{
    await b.navigate();
    const source=fs.readFileSync(path.join(__dirname,'../pages/inventory-core/storage.js'),'utf8');
    const results=await b.E(`(async()=>{
      const create=new Function('module',${JSON.stringify(source)}+';return module.exports')({exports:{}}),checks=[];
      const key='weid-pc-supply-chain-v1',fixture=()=>Object.fromEntries([['version',1],['revision',3],...['history','movements','stores','skus','batches','units','services','specs','boms','staff','warehouses'].map(k=>[k,[]])]);
      const check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)},reject=async(fn,pattern)=>{try{await fn()}catch(e){if(pattern.test(e.message))return;throw e}throw Error('Expected failure: '+pattern)};
      const names=[],connections=[];
      function setup(raw=null,available=true){
        const name='pc-reliability-'+crypto.randomUUID();names.push(name);
        const storage={raw,writes:0,getItem(){return this.raw},setItem(k,v){this.raw=v;this.writes++}};
        const env={localStorage:storage,navigator,indexedDB:available?{open(){const r=indexedDB.open(name,1);r.addEventListener('success',()=>connections.push(r.result));return r}}:null};
        const api=create(env);
        const put=async value=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('state');const db=await new Promise((resolve,reject)=>{r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)});try{await new Promise((resolve,reject)=>{const tx=db.transaction('state','readwrite');tx.objectStore('state').put(value,key);tx.oncomplete=resolve;tx.onabort=()=>reject(tx.error)})}finally{db.close()}};
        return {api,env,storage,put};
      }
      try{
        for(const raw of ['', 'null', '{bad', JSON.stringify({...fixture(),version:2}),JSON.stringify({...fixture(),revision:-1}),JSON.stringify({...fixture(),unitSchema:99}),JSON.stringify({...fixture(),payments:{}}),JSON.stringify({...fixture(),batches:null})]){
          const t=setup(raw);await reject(()=>t.api.read(),/读取失败/);await reject(()=>t.api.write(fixture(),3),/阻止保存/);check(t.storage.raw===raw&&t.storage.writes===0,'Invalid legacy preserved: '+raw.slice(0,12));
        }
        for(const invalid of [null,{...fixture(),version:2},{...fixture(),revision:'3'},{version:1}]){
          const t=setup(JSON.stringify(fixture()));await t.put(invalid);await reject(()=>t.api.read(),/读取失败/);await reject(()=>t.api.write(fixture(),3),/阻止保存/);check(t.storage.writes===0,'Invalid DB blocks fallback');
        }
        {const t=setup();check(await t.api.read()===null,'Only absent stores seed');await t.api.write({...fixture(),revision:1},0);check((await t.api.read()).revision===1,'Fresh ledger commits')}
        {const raw=JSON.stringify(fixture()),t=setup(raw);check((await t.api.read()).revision===3,'Legacy migration commits');t.storage.raw='{broken source';check((await create(t.env).read()).revision===3,'Valid DB takes priority over invalid legacy');check(t.storage.writes===0,'Migration never changes source');
         const other=create(t.env);await other.read();const commits=await Promise.allSettled([t.api.write({...fixture(),revision:4},3),other.write({...fixture(),revision:4},3)]);check(commits.filter(r=>r.status==='fulfilled').length===1,'Native IDB rejects concurrent stale commit')}
        {const t=setup();t.env.indexedDB.open=()=>{throw Error('SecurityError')};await reject(()=>t.api.read(),/SecurityError/);await reject(()=>t.api.write(fixture()),/阻止保存/);check(t.storage.writes===0,'DB open failure never forks into localStorage')}
        {const t=setup();t.storage.getItem=()=>{throw Error('Access denied')};await reject(()=>t.api.read(),/Access denied/);await reject(()=>t.api.write(fixture()),/阻止保存/);check(t.storage.writes===0,'Legacy read failure blocks writes')}
        {const raw=JSON.stringify(fixture()),t=setup(raw);const put=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(){throw Error('QuotaExceededError')};try{await reject(()=>t.api.read(),/QuotaExceededError/);await reject(()=>t.api.write(fixture()),/阻止保存/);check(t.storage.raw===raw,'Failed migration preserves source')}finally{IDBObjectStore.prototype.put=put}check((await t.api.read()).revision===3,'Migration retries after recovery')}
        {const t=setup(JSON.stringify(fixture()));await t.api.read();const get=IDBObjectStore.prototype.get;IDBObjectStore.prototype.get=function(){const r=get.apply(this,arguments);this.transaction.abort();return r};try{await reject(()=>t.api.read(),/读取失败/);await reject(()=>t.api.write(fixture(),3),/阻止保存/);check(t.storage.writes===0,'Aborted DB read disables later writes')}finally{IDBObjectStore.prototype.get=get}}
        {const raw=JSON.stringify(fixture()),t=setup(raw,false);check((await t.api.read()).revision===3,'API absence uses validated locked fallback');const set=t.storage.setItem;t.storage.setItem=()=>{throw Error('quota full')};await reject(()=>t.api.write({...fixture(),revision:4},3),/quota full/);check(t.storage.raw===raw,'Fallback quota preserves ledger');t.storage.setItem=set;await t.api.write({...fixture(),revision:4},3);check(JSON.parse(t.storage.raw).revision===4,'Fallback save retries safely')}
      }finally{
        connections.forEach(db=>db.close());await Promise.all(names.map(name=>new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase(name);r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Test DB still open'))})));
      }
      return checks;
    })()`);
    return results;
  }finally{await b.close()}
}
async function customerWorkflows(){
  const b=await create();try{
    await b.navigate(ENTRY+'#reviews');
    await b.E(`Promise.all(['customer-correction','customer-merge'].map(x=>PCApp.loadModule(x)))`);
    return await b.E(`(async()=>{
      const checks=[],check=(ok,label)=>{if(!ok)throw Error(label);checks.push(label)},key=PCCustomerStorage.key;
      const set=Storage.prototype.setItem;let fail=false;
      Storage.prototype.setItem=function(k,v){if(fail&&k===key)throw new DOMException('test quota full','QuotaExceededError');return set.call(this,k,v)};
      const raw=()=>localStorage.getItem(key),snapshot=()=>JSON.stringify(state);
      const stop=()=>{for(const t of clJobs.values())clearTimeout(t);clJobs.clear();for(const t of apJobs.values())clearTimeout(t);apJobs.clear()};
      try{
        const id=state.cases.find(c=>c.review&&!c.high&&!c.resultData).id;
        apOpen('correction',id);apDecision('approve');document.querySelector('#modal textarea').value='approval note survives failure';apTask.note='approval note survives failure';await customerSavePresentation();
        const before=snapshot(),stored=raw();fail=true;await apCommit('approve');stop();
        check(raw()===stored&&snapshot()===before,'Failed approval restores records and creates no customer');
        check(document.querySelector('#modal textarea')?.value==='approval note survives failure','Failed approval preserves confirmation input');
        fail=false;await apCommit('approve');stop();check(state.cases.find(c=>c.id===id).approval===1,'Approval retries successfully');
        await customerSavePresentation();const approved=snapshot(),approvedRaw=raw();fail=true;
        check(await clExecute(id)===false,'Correction reports failed storage commit');
        check(raw()===approvedRaw&&snapshot()===approved,'Correction restores entire customer, financial and case state');
        check(customerExecutionErrors.has(id)&&apFooter().includes('apRetry()'),'Correction keeps a retry action after storage failure');
        fail=false;check(await clExecute(id)===true,'Correction executes after storage recovery');
        const completed=state.cases.find(c=>c.id===id),count=state.performanceAdjustments.length,customers=state.mergeCustomers.length;
        check(!!completed.resultData&&state.mergeCustomers.filter(c=>c.id===completed.newId).length===1,'Correction produces one target profile');
        check(await clExecute(id)===false&&state.performanceAdjustments.length===count&&state.mergeCustomers.length===customers,'Repeated correction does not duplicate profiles or adjustments');
        // Fail after the workflow has already changed live profiles and adjustments.
        const next=state.cases.find(c=>c.review&&!c.resultData&&c.id!==id);
        await PCCustomerStorage.run(()=>{next.review.status='approved';clApprove(next);persist()});
        const business=()=>JSON.stringify([state.mergeCustomers,state.mergeRecords,state.performanceAdjustments]),beforeBusiness=business(),event=cxEvent;
        let injected=false;cxEvent=function(){if(!injected){injected=true;throw Error('calculation interrupted')}return event(...arguments)};
        try{check(await clExecute(next.id)===false,'Correction calculation failure reports failure')}finally{cxEvent=event}
        check(business()===beforeBusiness&&state.cases.find(c=>c.id===next.id).execution.attempts===1,'Calculation failure restores all business data and retains attempt log');
        check(await clExecute(next.id)===true,'Calculation failure remains retryable');
        apClose();const a=state.mergeApplications.find(a=>a.review?.status==='pending'&&!mrApplicationConflict(a)&&apMergePlan(a).mainId);apOpen('merge',a.id);apDecision('approve');await apCommit('approve');stop();await customerSavePresentation();
        const mergeBefore=snapshot(),mergeRaw=raw(),records=state.mergeRecords.length;fail=true;
        check(await apExecuteMerge(a.id)===false,'Merge reports failed storage commit');
        check(raw()===mergeRaw&&snapshot()===mergeBefore&&state.mergeRecords.length===records,'Merge rolls back members, status, logs and success record');
        fail=false;check(await apExecuteMerge(a.id)===true,'Merge retries successfully');
        check(state.mergeRecords.filter(r=>r.applicationId===a.id).length===1,'Merge generates exactly one success record');
        check(await apExecuteMerge(a.id)===false&&state.mergeRecords.filter(r=>r.applicationId===a.id).length===1,'Repeated merge does not execute twice');
        const another=state.mergeApplications.find(x=>x.id!==a.id&&x.review?.status==='pending'&&!mrApplicationConflict(x)&&apMergePlan(x).mainId);
        await PCCustomerStorage.run(()=>{another.review.status='approved';another.review.approvedPlan=clone(apMergePlan(another));another.status='已通过';persist()});
        const mergeData=business(),mergeEvent=mrEvent;let once=false;mrEvent=function(){if(!once){once=true;throw Error('merge interrupted')}return mergeEvent(...arguments)};
        try{check(await apExecuteMerge(another.id)===false,'Merge calculation failure reports failure')}finally{mrEvent=mergeEvent}
        check(business()===mergeData&&!state.mergeApplications.find(x=>x.id===another.id).recordId,'Merge calculation failure retains no partial migration or success record');
        apClose();await new Promise(r=>setTimeout(r,drawerMotionTime()+30));mrNew();mrTask.reason='merge draft survives quota';fail=true;await mrSaveDraft();
        check(mrTask?.reason==='merge draft survives quota','Failed merge draft save keeps editor and input');fail=false;await mrSaveDraft();
        check(state.mergeApplicationDraft.reason==='merge draft survives quota','Merge draft retries without losing input');
        // A queued save must not commit after its source editor was closed.
        mrNew();mrTask.reason='must be discarded';let release,started;const held=new Promise(r=>started=r),lock=navigator.locks.request(key,()=>{started();return new Promise(r=>release=r)});await held;
        const queued=mrSaveDraft();mrClose();release();await lock;await queued;
        check(state.mergeApplicationDraft.reason==='merge draft survives quota','Closing editor cancels queued save');
        return checks;
      }finally{fail=false;Storage.prototype.setItem=set;stop()}
    })()`);
  }finally{await b.close()}
}
async function customerWindows(){
  const first=await create(),second=await create(first);try{
    await first.navigate();await second.navigate();
    await first.E(`localStorage.setItem('weidong-correction-prototype-v1',JSON.stringify({version:1,config:{},drafts:{},history:[],cases:[{id:'one'}]}))`);
    const source=fs.readFileSync(path.join(__dirname,'../pages/customer-state/storage.js'),'utf8');
    const setup=`window.testStorage=new Function('module',${JSON.stringify(source)}+';return module.exports')({exports:{}})(()=>localStorage,()=>navigator.locks);window.testValue=testStorage.read()`;
    await first.E(setup);await second.E(setup);
    const result=await Promise.all([first.E(`testStorage.run(()=>{testValue.role='first';testStorage.saveState(testValue)}).then(()=>true,()=>false)`),second.E(`testStorage.run(()=>{testValue.role='second';testStorage.saveState(testValue)}).then(()=>true,()=>false)`)]);
    assert.equal(result.filter(Boolean).length,1);
    return ['Two real tabs serialize customer writes and reject the stale tab'];
  }finally{await second.close();await first.close()}
}
async function failedPages(){
  const checks=[];
  for(const kind of ['target','source','empty','quota','inventory']){
    const b=await create();try{
      await b.navigate();
      const key=kind==='source'?'weidong.unified-complaints.v1':kind==='inventory'?'weid-pc-supply-chain-v1':'weid.pc.complaints.v1';
      if(kind==='quota')await b.E(`window.originalSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k==='weid.pc.complaints.v1')throw Error('test quota full');return originalSet.call(this,k,v)}`);
      else await b.E(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(kind==='empty'?'[]':'{bad')})`);
      await b.send('Page.navigate',{url:kind==='inventory'?ENTRY.replace('pc.html','inventory.html')+'#sc-services':ENTRY+'#complaints'});
      if(kind==='empty'){
        await b.until(`PCApp.ready&&PCApp.module==='complaints'`);
        assert.equal(await b.E(`localStorage.getItem(${JSON.stringify(key)})`),'[]');checks.push('Saved empty complaint list stays empty in the actual page');
      }else{
        await b.until(`!!document.querySelector('#main [role=alert]')`);
        assert.equal(await b.E(`localStorage.getItem(${JSON.stringify(key)})`),kind==='quota'?null:'{bad');
        const message=await b.E(`document.querySelector('#main').innerText`);assert.ok(message.includes(kind==='quota'?'test quota full':'读取失败'),kind+': '+message);
        checks.push('Page initialization preserves data on '+kind+' failure');
        if(kind!=='inventory'){await b.E(`go('home')`);await b.until(`PCApp.ready&&PCApp.module==='home'`);checks.push('Failed complaints page can return home: '+kind)}
      }
    }finally{await b.close()}
  }
  for(const [file,route,module]of [['pc.html','reviews','customer-review'],['pc.html','complaints','complaints'],['inventory.html','sc-services','supply-chain']]){
    const b=await create();try{await b.navigate(require('node:url').pathToFileURL(path.resolve(__dirname,'../../',file)).href+'#'+route);assert.equal(await b.E('PCApp.module'),module);checks.push('Offline file entry works: '+route)}finally{await b.close()}
  }
  return checks;
}
async function inventoryModel(){
  const b=await create(),url=ENTRY.replace('pc.html','inventory.html')+'#sc-services';try{
    await b.navigate(url);
    const legacy=await b.E(`(()=>{const value=PCModules['supply-chain'].seed();value.extra={preserve:'legacy ledger'};value.services[0].name='Saved legacy service';return JSON.stringify(value)})()`);
    await b.navigate();
    await b.E(`new Promise((resolve,reject)=>{const r=indexedDB.deleteDatabase('weid-pc-inventory-v1');r.onsuccess=resolve;r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('Old page still holds inventory database'))})`);
    await b.E(`localStorage.setItem('weid-pc-supply-chain-v1',${JSON.stringify(legacy)})`);
    await b.navigate(url);
    assert.equal(await b.E(`PCModules['supply-chain'].data.extra.preserve`),'legacy ledger');
    assert.equal(await b.E(`PCModules['supply-chain'].data.services[0].name`),'Saved legacy service');
    assert.equal(await b.E(`localStorage.getItem('weid-pc-supply-chain-v1')`),legacy);
    return await b.E(`(async()=>{
      const S=PCModules['supply-chain'],before=JSON.stringify(S.data),record={...S.data.services[0],name:'Retried service'},put=IDBObjectStore.prototype.put,checks=['Actual inventory page migrates existing ledger and retains its source'];
      IDBObjectStore.prototype.put=function(){throw Error('native quota full')};let failed=false;
      try{S.save('services',record);await S.flush()}catch(error){failed=error.message.includes('native quota full')}finally{IDBObjectStore.prototype.put=put}
      if(!failed||JSON.stringify(S.data)!==before)throw Error('Inventory save did not restore the whole ledger');checks.push('Actual inventory transaction rolls back a native IDB write failure');
      await S.retryPersist();S.save('services',record);await S.flush();if(S.data.services[0].name!==record.name)throw Error('Inventory retry failed');checks.push('Inventory transaction retries after storage recovery');return checks;
    })()`);
  }finally{await b.close()}
}
async function main(){const checks=[...await inventoryStorage(),...await customerWorkflows(),...await customerWindows(),...await failedPages(),...await inventoryModel()];console.log(checks.join('\n'));console.log('Passed '+checks.length+' data reliability checks')}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1});
module.exports={create};
