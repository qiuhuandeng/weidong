/* A failed read is never an empty complaint list. Keep the legacy source intact. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else {root.PCComplaintStorage = factory(() => root.localStorage);root.PCModules['complaint-storage']={};}
})(globalThis, function (getStorage) {
  'use strict';
  const key='weid.pc.complaints.v1', sourceKey='weidong.unified-complaints.v1';
  let loaded=false, previous, source, snapshot;
  const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
  function validate(value) {
    if(!Array.isArray(value)||value.some(r=>!object(r)||!r.id||
      ['created','name','channel','status'].some(k=>typeof r[k]!=='string'||!r[k])||
      ['logs','follows','linked'].some(k=>!Array.isArray(r[k])||r[k].some(x=>!object(x)))||
      ['files','messages'].some(k=>r[k]!==undefined&&(!Array.isArray(r[k])||r[k].some(x=>!object(x))))||
      [...r.follows,...(r.messages||[])].some(x=>x.files!==undefined&&(!Array.isArray(x.files)||x.files.some(f=>!object(f)))))) {
      throw Error('投诉记录格式不兼容');
    }
    return value;
  }
  function failure(message,cause){return new Error(message+'：'+cause.message,{cause})}
  function read(){
    loaded=false;
    try{
      const storage=getStorage();previous=storage.getItem(key);source=previous===null?storage.getItem(sourceKey):undefined;
      const raw=previous===null?source:previous,value=raw===null?null:validate(JSON.parse(raw));
      snapshot=value===null?null:JSON.stringify(value);loaded=true;return value;
    }catch(error){throw failure('投诉记录读取失败，原记录已保留，已停止初始化和保存',error)}
  }
  function save(value){
    if(!loaded)throw Error('投诉记录尚未成功读取，已阻止保存');
    try{
      const storage=getStorage();
      if(storage.getItem(key)!==previous||(previous===null&&storage.getItem(sourceKey)!==source))throw Error('工单已在其他页面更新，请刷新后重试');
      const next=JSON.stringify(validate(value));if(previous!==null&&next===snapshot)return false;
      storage.setItem(key,next);previous=next;snapshot=next;return true;
    }catch(error){throw failure('投诉记录未保存，原记录和当前输入已保留',error)}
  }
  return {key,sourceKey,read,save,get needsMigration(){return loaded&&previous===null}};
});
