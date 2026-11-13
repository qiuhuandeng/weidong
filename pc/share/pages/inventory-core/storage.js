/* One versioned ledger per origin. A failed read can never authorize a write. */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory;
  else root.PCInventoryStorage=factory(root);
})(globalThis,function(env){
  'use strict';
  const KEY='weid-pc-supply-chain-v1',DB='weid-pc-inventory-v1',STORE='state';
  let database,mode='indexedDB',loaded=false,exists=false,legacyVersion;
  const conflict=()=>Error('其他窗口已更新进销存数据。本次操作未保存，请刷新载入最新账后重试。');
  const failure=(message,cause)=>new Error(message+'：'+cause.message,{cause});
  function validate(data){
    if(!data||Array.isArray(data)||data.version!==1||
      (data.revision!==undefined&&(!Number.isSafeInteger(data.revision)||data.revision<0))||
      ['history','movements','stores','skus','batches','units','services','specs','boms','staff','warehouses'].some(k=>!Array.isArray(data[k])))throw Error('账本版本或结构不兼容');
    for(const [key,max]of [['unitSchema',2],['inventorySchema',2],['workflowSchema',1]])if(data[key]!==undefined&&(!Number.isSafeInteger(data[key])||data[key]<0||data[key]>max))throw Error('账本升级版本不兼容：'+key);
    for(const key of ['merges','applications','purchases','purchaseReturns','payments','transfers','counts','losses','consumptions','retail','redemptions','partnerOrders','adverse','recalls','qualityChecks','temperatures','controlledLogs','emptyVials','invoices','maintenance','firstReviews','settlements','approvals','reportPlans','alertActions','udi','adjustments','serviceCategories','lines','categories','brands','dictionaries','equipment','heads','shotLogs','cards','cardSales','prices','suppliers','credentials','qualifications','departments','roles','patients','treatments','paymentEntries'])if(data[key]!==undefined&&!Array.isArray(data[key]))throw Error('账本明细格式不兼容：'+key);
    for(const batch of data.batches)if(!batch||!batch.id||!Number.isFinite(batch.quantity)||!Number.isFinite(batch.reserved)||batch.quantity<0||batch.reserved<0||batch.reserved>batch.quantity)throw Error('账本库存数量或预占数量异常');
    return data;
  }
  function legacy(){
    const raw=env.localStorage.getItem(KEY);
    return {raw,value:raw===null?null:validate(JSON.parse(raw))};
  }
  function openDatabase(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      let req,done=false;const timer=setTimeout(()=>finish(Error('数据库打开超时')),5000);
      function finish(error,db){if(done){db?.close();return}done=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=env.indexedDB.open(DB,1)}catch(e){finish(e);return}
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
      req.onerror=()=>finish(req.error);req.onblocked=()=>finish(Error('数据库被其他窗口占用'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(e=>{database=null;throw e});return database;
  }
  async function read(){
    loaded=false;
    try{
      // API absence permits the locked fallback; a failed DB read never does.
      if(!env.indexedDB){
        if(!env.navigator?.locks)throw Error('浏览器未提供 IndexedDB 和安全保存锁');
        return await env.navigator.locks.request(KEY,()=>{const old=legacy();legacyVersion=old.raw;mode='localStorage';loaded=true;return old.value});
      }
      const db=await openDatabase();
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let value,error;
        r.onsuccess=()=>{try{
          if(r.result!==undefined){value=validate(r.result);return}
          const old=legacy();value=old.value;
          if(value!==null)store.put(value,KEY);
        }catch(e){error=e;tx.abort()}};
        tx.oncomplete=()=>resolve(value);
        tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('账本读取或迁移失败'));
      });
      exists=value!==null;mode='indexedDB';loaded=true;return value;
    }catch(error){throw failure('进销存账本读取失败，原记录已保留，已停止初始化和记账',error)}
  }
  async function write(data,expected=0){
    if(!loaded)throw Error('进销存账本尚未成功读取，已阻止保存');
    try{
      validate(data);
      if(mode==='localStorage')return await env.navigator.locks.request(KEY,()=>{
        const old=legacy();if(old.raw!==legacyVersion||(old.value?.revision||0)!==expected)throw conflict();
        const next=JSON.stringify(data);env.localStorage.setItem(KEY,next);legacyVersion=next;
      });
      const db=await openDatabase();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let error;
        r.onsuccess=()=>{try{
          const old=r.result===undefined?null:validate(r.result);
          if((old!==null)!==exists||(old?.revision||0)!==expected)throw conflict();
          store.put(data,KEY);
        }catch(e){error=e;tx.abort()}};
        tx.oncomplete=resolve;
        tx.onabort=tx.onerror=()=>reject(error||tx.error||Error('账本提交失败'));
      });
      exists=true;
    }catch(error){throw failure('进销存数据未保存，原账已保留，本次操作未记账',error)}
  }
  return {read,write,get mode(){return mode}};
});
