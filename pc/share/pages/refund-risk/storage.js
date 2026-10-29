/* Only case work is persisted. Loading analytics never writes payment stores. */
window.RefundRiskStorage = (() => {
  const name='weid-pc-refund-risk-v1',listeners=new Set();let dbPromise,channel,current;
  const copy=x=>JSON.parse(JSON.stringify(x));
  function validate(v){if(v?.schema!==1||!Number.isInteger(v.revision)||!v.cases||typeof v.cases!=='object'||Array.isArray(v.cases)||!/^\d{4}-\d{2}-\d{2}$/.test(v.sampleDate))throw Error('退款核查记录格式不兼容，原记录已保留。');return v}
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let req,settled=false;const timer=setTimeout(()=>finish(Error('核查数据库打开超时，请关闭旧页面后重试。')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=indexedDB.open(name,1)}catch(e){finish(Error('核查记录暂时无法读取：'+e.message));return}
      req.onupgradeneeded=()=>req.result.createObjectStore('state');
      req.onerror=()=>finish(Error('核查数据库不可用：'+(req.error?.message||'请检查浏览器存储权限')));
      req.onblocked=()=>finish(Error('核查数据库被旧页面占用，请关闭旧页面后重试。'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};finish(null,db)};
    }).catch(e=>{dbPromise=null;throw e});return dbPromise;
  }
  async function read(){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('current');let value,error;
      req.onsuccess=()=>{try{value=req.result===undefined?{schema:1,revision:0,sampleDate:RefundRiskModel.today(),cases:{}}:validate(req.result);if(req.result===undefined)store.add(value,'current')}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{current=value;resolve(copy(value))};tx.onabort=tx.onerror=()=>reject(error||Error('核查记录读取失败，原数据未改动：'+(tx.error?.message||'存储事务未完成')));
    });
  }
  async function save(value,expected){
    validate(value);const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('current');let error;
      req.onsuccess=()=>{try{if(validate(req.result).revision!==expected||value.revision!==expected+1)throw Error('其他页面已更新核查记录，本次修改尚未保存。请保留填写内容并重新载入最新记录。');store.put(value,'current')}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{current=copy(value);try{channel?.postMessage({revision:current.revision})}catch{}resolve(copy(value))};
      tx.onabort=tx.onerror=()=>reject(error||Error('保存失败，原记录和当前填写内容已保留：'+(tx.error?.message||'存储事务未完成')));
    });
  }
  try{channel=new BroadcastChannel(name);channel.onmessage=()=>listeners.forEach(fn=>fn())}catch{}
  return {read,save,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},get current(){return current}};
})();
