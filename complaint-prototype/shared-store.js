/* One durable record for tickets and rule configuration. Legacy records are read once, never overwritten. */
(function(root){
'use strict';
const KEY='meiye.complaint.unified.v1',TICKETS_KEY='meiye.complaint.reference.v4',RULES_KEY='meiye.complaint.prototype.a.v1.workflow3',OLD_RULES_KEY='meiye.complaint.prototype.a.v1';
function createStore(storage,engine,configuration,locks){
 const parse=key=>{const raw=storage.getItem(key);if(raw===null)return null;try{return JSON.parse(raw);}catch{throw Error('本地数据无法读取，已保留原始数据，请勿重置：'+key);}};
 function load(){
  const existing=parse(KEY);if(existing){if(existing.unifiedVersion!==1||!Array.isArray(existing.tickets)||!existing.configuration)throw Error('统一数据版本不支持，已保留数据');const configured=configuration.upgrade?.(existing),examples=engine.ensureIntakeExamples?.(existing),upgraded=engine.prepareTickets?.(existing),scenarios=engine.ensureWorkflowExamples?.(existing);if(configured||examples||upgraded||scenarios){existing._revision=(existing._revision||0)+1;storage.setItem(KEY,JSON.stringify(existing));}return existing;}
  const previous=parse(TICKETS_KEY);if(previous&&previous.version!==4)throw Error('工单数据版本不支持，已保留数据');
  const state=previous?engine.migrate(previous):engine.seed();
  configuration.initialize(state,parse(RULES_KEY)||parse(OLD_RULES_KEY));
  engine.ensureIntakeExamples?.(state);
  engine.prepareTickets?.(state);
  engine.ensureWorkflowExamples?.(state);
  state._revision=0;state.migratedAt=Date.now();state.migratedFrom={tickets:!!previous,rules:!!storage.getItem(RULES_KEY)||!!storage.getItem(OLD_RULES_KEY)};
  storage.setItem(KEY,JSON.stringify(state));return state;
 }
 function assertVersion(state){const latest=load();if(latest._revision!==state._revision)throw Error('其他页面已更新工单或规则，请刷新后重新提交；本次未覆盖新数据');}
 function save(state){assertVersion(state);const next={...state,_revision:state._revision+1};storage.setItem(KEY,JSON.stringify(next));state._revision=next._revision;}
 function exclusive(fn){return locks?locks.request(KEY,fn):Promise.resolve().then(fn);}
 function readConfiguration(){const state=load();const c=state.configuration;c._sharedRevision=state._revision;return c;}
 function saveConfiguration(c){const state=load();if(c._sharedRevision!==state._revision)throw Error('其他页面已更新数据，请重新打开配置');const value=JSON.parse(JSON.stringify(c));delete value._sharedRevision;state.configuration=value;save(state);c._sharedRevision=state._revision;}
 return {KEY,load,save,assertVersion,exclusive,configuration:{KEY,load:readConfiguration,save:saveConfiguration,exclusive}};
}
const API={KEY,TICKETS_KEY,RULES_KEY,OLD_RULES_KEY,createStore};
if(typeof module!=='undefined'&&module.exports)module.exports=API;
else {root.ComplaintStore=createStore(root.localStorage,root.Engine,root.ComplaintConfiguration,root.navigator.locks);root.CaseStore=root.ComplaintStore.configuration;}
})(typeof window!=='undefined'?window:globalThis);
