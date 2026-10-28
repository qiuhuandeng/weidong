/* One versioned ledger per origin. Compare and replace inside one IndexedDB transaction. */
window.PCInventoryStorage = (() => {
  const KEY='weid-pc-supply-chain-v1', DB='weid-pc-inventory-v1', STORE='state';
  let database, mode='indexedDB', readFailed=false;
  const conflict=()=>Error('其他窗口已更新进销存数据。本次操作未保存，请刷新载入最新账后重试。');
  function openDatabase(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(Error('浏览器未提供 IndexedDB'));
      let req,done=false;const timer=setTimeout(()=>finish(Error('数据库打开超时')),5000);
      function finish(error,db){if(done){db?.close();return}done=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=indexedDB.open(DB,1)}catch(e){finish(e);return}
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
      req.onerror=()=>finish(req.error);req.onblocked=()=>finish(Error('数据库被其他窗口占用'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(e=>{database=null;throw e});return database;
  }
  function legacy(){try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}}
  async function read(){try{const db=await openDatabase();return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value?.version===1?value:null);tx.onerror=()=>reject(tx.error)})}catch{readFailed=true;return null}}
  async function write(data,expected=0){
    let db;try{db=await openDatabase()}catch(e){
      if(!window.navigator?.locks)throw Error('进销存数据未能保存。请恢复浏览器数据库后重试；本次操作未记账。');
      return navigator.locks.request(KEY,()=>{const old=legacy();if((old?.revision||0)!==expected)throw conflict();try{localStorage.setItem(KEY,JSON.stringify(data));mode='localStorage'}catch{throw Error('进销存数据未能保存，原数据未覆盖。请重试。')}});
    }
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let failure;
      r.onsuccess=()=>{const old=r.result||legacy();if((old?.revision||0)!==expected){failure=conflict();tx.abort();return}store.put(data,KEY)};
      tx.oncomplete=()=>{mode='indexedDB';readFailed=false;resolve()};
      tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('进销存数据未能保存，原数据未覆盖。'));
    });
  }
  return {read,write,get mode(){return mode}};
})();
