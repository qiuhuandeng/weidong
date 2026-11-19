/* Dedicated, origin-scoped activity records; product and order records stay in their own stores. */
(function(root){
  'use strict';
  root.WeidActivityStorage={create(){
    const M=root.WeidActivityModel,DB='weid-sales-activities-v1',listeners=new Set();let opening,initializing,current,channel;
    const valid=s=>{if(s?.schema!==1||!Array.isArray(s.activities)||!Number.isInteger(s.revision))throw Error('活动数据无法读取，原记录已保留');return s;};
    function open(){return opening||(opening=new Promise((resolve,reject)=>{
      let r;try{r=root.indexedDB.open(DB,1);}catch(e){reject(e);return;}
      r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('活动数据库被旧窗口占用，请关闭旧窗口后重试'));
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    }).catch(e=>{opening=null;throw e;}));}
    function transact(write,change){return open().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'),store=tx.objectStore('state'),req=store.get('activities');let value,result,failure;
      req.onsuccess=()=>{try{value=req.result===undefined?M.seed():valid(req.result);if(change){const next=M.copy(value);result=change(next);next.revision=value.revision+1;value=next;store.put(value,'activities');}else if(write&&req.result===undefined)store.add(value,'activities');}catch(e){failure=e;tx.abort();}};
      tx.oncomplete=()=>{current=value;resolve(result??M.copy(value));};tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('活动保存失败，当前填写内容已保留'));
    }));}
    const initialize=()=>initializing||(initializing=transact(true).catch(e=>{initializing=null;throw e;}));
    async function read(){await initialize();return transact(false);}
    async function commit(change,expected=current?.revision){await initialize();const result=await transact(true,s=>{if(expected!==s.revision)throw Error('活动已在其他窗口更新，请保留填写内容并重新读取');return change(s);});try{channel?.postMessage(current.revision);}catch{}listeners.forEach(fn=>fn(current));return result;}
    async function refresh(){if(!current)return;try{const old=current.revision;await read();if(old!==current.revision)listeners.forEach(fn=>fn(current));}catch{}}
    try{channel=new root.BroadcastChannel(DB);channel.onmessage=refresh;}catch{}
    return {initialize,read,commit,refresh,get current(){return current;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close(){channel?.close();opening?.then(db=>db.close());}};
  }};
})(typeof window==='undefined'?globalThis:window);
