/* Per-archive complaint marks. Historical customer snapshots are never rewritten. */
'use strict';
window.PCCustomerComplaintMarks=(()=>{
  const name='weid-pc-customer-complaint-marks-v1',marks=new Map(),listeners=new Set();
  let database,channel,failure='';
  const copy=value=>JSON.parse(JSON.stringify(value));
  function validate(value){
    if(!value||value.schema!==1||typeof value.customerId!=='string'||!value.customerId||!Number.isSafeInteger(value.revision)||value.revision<1||typeof value.active!=='boolean'||typeof value.note!=='string'||value.note.length>300||!Array.isArray(value.history))throw Error('客诉标记记录格式不兼容，原记录已保留');
    return value;
  }
  function remember(value){const old=marks.get(value.customerId);if(!old||old.revision<=value.revision)marks.set(value.customerId,copy(value))}
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      let request,settled=false;
      const timer=setTimeout(()=>finish(Error('客诉标记数据库打开超时，请关闭旧页面后重试')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{request=indexedDB.open(name,1)}catch(error){finish(error);return}
      request.onupgradeneeded=()=>request.result.createObjectStore('marks',{keyPath:'customerId'});
      request.onerror=()=>finish(request.error||Error('无法打开客诉标记数据库'));
      request.onblocked=()=>finish(Error('客诉标记数据库被旧页面占用，请关闭旧页面后重试'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(error=>{database=null;throw error});
    return database;
  }
  async function load(){
    try{
      const db=await open();
      await new Promise((resolve,reject)=>{
        const tx=db.transaction('marks','readonly'),request=tx.objectStore('marks').getAll();let values,error;
        request.onsuccess=()=>{try{values=request.result.map(validate)}catch(e){error=e;tx.abort()}};
        tx.oncomplete=()=>{values.forEach(remember);resolve()};
        tx.onabort=()=>reject(error||tx.error||request.error||Error('读取客诉标记失败'));
      });
      failure='';
    }catch(error){failure=error.message;throw error}
  }
  async function save({customerId,expectedRevision,active,note='',actor,at}){
    if(typeof customerId!=='string'||!customerId||typeof active!=='boolean'||typeof note!=='string'||note.trim().length>300||!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw Error('客诉标记信息无效，请重新核对');
    const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction('marks','readwrite'),store=tx.objectStore('marks'),request=store.get(customerId);let value,error;
      request.onsuccess=()=>{
        try{
          const previous=request.result===undefined?null:validate(request.result);
          if((previous?.revision||0)!==expectedRevision)throw Object.assign(Error('客诉标记已在其他页面更新，请关闭后重新核对'),{code:'conflict'});
          const entry={active,note:active?note.trim():'',actor,at};
          value=validate({schema:1,customerId,revision:expectedRevision+1,...entry,history:[...(previous?.history||[]),entry]});
          store.put(value);
        }catch(e){error=e;tx.abort()}
      };
      tx.oncomplete=()=>{remember(value);failure='';try{channel?.postMessage({customerId,revision:value.revision})}catch{}resolve(copy(value))};
      tx.onabort=()=>reject(error||tx.error||request.error||Error('保存客诉标记失败，当前输入已保留'));
    });
  }
  try{channel=new BroadcastChannel(name);channel.onmessage=()=>listeners.forEach(fn=>fn())}catch{}
  return {load,save,get:id=>{const value=marks.get(id);return value?copy(value):null},get error(){return failure},subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)}};
})();
