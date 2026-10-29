/* PC and the self-contained V3 use the same origin-scoped inventory database.
 * A read/modify/write transaction compares the version before committing.
 */
(function(root){
  'use strict';
  function create(options={}){
    const M=root.WeidStockModel,DB=options.name||'weid-store-inventory-v1',STORE='state',KEY='inventory',listeners=new Set();
    let dbPromise,current,initializing,channel;
    const failure=(prefix,e)=>Error(prefix+'：'+(e?.message||e?.name||'未知存储错误')+'。原记录及当前填写内容已保留。');
    function open(){
      if(dbPromise)return dbPromise;
      dbPromise=new Promise((resolve,reject)=>{
        let r,done=false;const finish=(e,db)=>{if(done){db?.close();return}done=true;clearTimeout(timer);e?reject(e):resolve(db);};
        const timer=setTimeout(()=>finish(Error('库存数据库打开超时，请关闭旧页面后重试。')),5000);
        try{r=(options.indexedDB||root.indexedDB).open(DB,1);}catch(e){finish(failure('无法打开库存数据库',e));return;}
        r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
        r.onerror=()=>finish(failure('无法打开库存数据库',r.error));
        r.onblocked=()=>finish(Error('库存数据库被旧页面占用，请关闭旧页面后重试。'));
        r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();dbPromise=null;};finish(null,db);};
      }).catch(e=>{dbPromise=null;throw e;});
      return dbPromise;
    }
    function accept(s){M.validate(s);if(!current||s.revision>=current.revision)current=s;return current;}
    function initialize(){
      if(initializing)return initializing;
      initializing=open().then(db=>new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let value,error;
        r.onsuccess=()=>{try{value=r.result===undefined?M.seed():M.validate(r.result);if(r.result===undefined)store.add(value,KEY);}catch(e){error=e;tx.abort();}};
        tx.oncomplete=()=>resolve(accept(value));tx.onabort=tx.onerror=()=>reject(error||failure('库存初始化失败',tx.error));
      })).catch(e=>{initializing=null;throw e;});
      return initializing;
    }
    async function read(){
      await initialize();const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);let value;
        r.onsuccess=()=>value=r.result;
        tx.oncomplete=()=>{try{resolve(accept(value));}catch(e){reject(e);}};
        tx.onabort=tx.onerror=()=>reject(failure('库存读取失败',tx.error));
      });
    }
    async function commit(command,payload,expected=current?.revision){
      await initialize();const db=await open();
      const result=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let next,result,error;
        r.onsuccess=()=>{try{
          const saved=M.validate(r.result);
          if(expected!==saved.revision)throw Error('另一页面已更新库存数据，本次未保存。请保留当前填写内容，刷新数据后重新核对。');
          next=M.copy(saved);result=M.apply(next,command,payload);next.revision=saved.revision+1;store.put(next,KEY);
        }catch(e){error=e;tx.abort();}};
        tx.oncomplete=()=>{accept(next);resolve(result);};
        tx.onabort=tx.onerror=()=>reject(error||failure('库存保存失败',tx.error));
      });
      try{channel?.postMessage({revision:current.revision});}catch{}
      listeners.forEach(fn=>{try{fn(current);}catch(e){console.warn(e);}});
      return result;
    }
    async function refresh(){if(!current)return;const revision=current.revision;try{await read();if(current.revision>revision)listeners.forEach(fn=>fn(current));}catch(e){console.warn(e.message);}}
    try{channel=new root.BroadcastChannel(DB);channel.onmessage=refresh;}catch{}
    root.addEventListener?.('focus',refresh);
    return {initialize,read,commit,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},get current(){return current;},close(){channel?.close();dbPromise?.then(db=>db.close());root.removeEventListener?.('focus',refresh);}};
  }
  root.WeidStockStorage={create};
})(typeof window==='undefined'?globalThis:window);
