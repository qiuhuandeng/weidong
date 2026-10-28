/* Approval persistence is independent of the small localStorage quota. */
window.PCGroupStorage = (() => {
  const KEY='weid.pc.group-approval.v1', LEGACY='meiye.group-approval.prototype.v1';
  const DB='weid-pc-group-approval-v1', STORE='state', SIGNAL=KEY+'.changed';
  const listeners=new Set();
  let database, initializing, current, channel;
  const conflict=()=>Error('其他页面已更新审批数据，本次操作未保存，请刷新后再试。');
  function validate(value){
    if(value?.schema!==1||!Number.isInteger(value.revision)||!['requests','templates','people','companies','departments','positions','categories','notifications'].every(key=>Array.isArray(value[key])))throw Error('集团审批本地数据格式不兼容，原记录已保留，请先导出备份后处理。');
    return value;
  }
  function accept(value){
    validate(value);
    if(!current||value.revision>=current.revision)current=value;
    return current;
  }
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      let request,settled=false;
      const timer=setTimeout(()=>finish(Error('审批数据库打开超时，请关闭其他旧页面后重试。')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{request=indexedDB.open(DB,1)}catch{finish(Error('浏览器未能打开审批数据库，原记录未改动，请检查本地存储权限。'));return}
      request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE)};
      request.onerror=()=>finish(Error('审批数据库无法打开，原记录未改动，请重试。'));
      request.onblocked=()=>finish(Error('审批数据库被旧页面占用，请关闭其他旧页面后重试。'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(error=>{database=null;throw error});
    return database;
  }
  function legacy(){
    let raw;
    try{raw=localStorage.getItem(KEY)??localStorage.getItem(LEGACY)}catch{throw Error('原审批记录暂时无法读取，未创建或覆盖数据，请检查浏览器存储权限。')}
    if(raw===null)return GroupSeed.create();
    try{return validate(JSON.parse(raw))}catch{throw Error('原审批记录格式不兼容，原记录已保留，请先导出备份后处理。')}
  }
  function initialize(){
    if(initializing)return initializing;
    initializing=open().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get(KEY);
      let value,failure;
      request.onsuccess=()=>{try{value=request.result===undefined?validate(legacy()):validate(request.result);if(request.result===undefined)store.add(value,KEY)}catch(error){failure=error;tx.abort()}};
      tx.oncomplete=()=>resolve(accept(value));
      tx.onabort=tx.onerror=()=>reject(failure||Error('审批数据迁移未能保存，原记录已保留，请检查浏览器可用存储空间后重试。'));
    })).catch(error=>{initializing=null;throw error});
    return initializing;
  }
  async function read(){
    await initialize();const db=await open();
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readonly'),request=tx.objectStore(STORE).get(KEY);let value;
      request.onsuccess=()=>{value=request.result};
      tx.oncomplete=()=>{try{resolve(accept(value))}catch(error){reject(error)}};
      tx.onabort=tx.onerror=()=>reject(Error('审批数据读取失败，请重试。'));
    });
  }
  function publish(){
    // Only a small notification is sent; failure here cannot undo a committed save.
    try{channel?.postMessage({revision:current.revision})}catch{}
    try{localStorage.setItem(SIGNAL,String(current.revision))}catch{}
  }
  async function write(value,expected){
    validate(value);await initialize();const db=await open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),request=store.get(KEY);let failure;
      request.onsuccess=()=>{
        try{if(validate(request.result).revision!==expected||value.revision!==expected+1)throw conflict();store.put(value,KEY)}catch(error){failure=error;tx.abort()}
      };
      tx.oncomplete=()=>{accept(value);resolve()};
      tx.onabort=tx.onerror=()=>reject(failure||Error('审批数据未能保存，原记录和当前填写内容均已保留，请重试。'));
    });
    publish();
  }
  async function refresh(){
    if(!current)return;
    const previous=current.revision;
    try{await read();if(current.revision>previous)listeners.forEach(listener=>listener())}catch(error){console.warn(error.message)}
  }
  try{channel=new BroadcastChannel(KEY);channel.onmessage=refresh}catch{}
  window.addEventListener('storage',event=>{if(event.key===SIGNAL)refresh()});
  window.addEventListener('focus',refresh);
  return {initialize,read,write,subscribe:listener=>listeners.add(listener),get current(){return current}};
})();
