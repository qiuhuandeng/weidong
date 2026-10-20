'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Sources=require('./ticket-sources.js'),E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js');
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};};
const form=channel=>({name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel,title:'未使用项目申请退款',description:'客户申请退回未消费的护理项目，请核实退款。'});
test('five sources share one dictionary; only 微动 enters aftercare directly',()=>{
 assert.deepEqual(E.CHANNELS,['400电话','经理热线','微动','小程序','企微']);
 assert.deepEqual(C.Rules.Flow.ticketSources,Sources.labels);
 const s=Store.createStore(memory(),E,C).load();
 for(const channel of E.CHANNELS){
  const t=E.create(s,'chen',form(channel));assert.equal(t.channel,channel);assert.equal(t.sources[0].channel,channel);
  assert.equal(E.isStoreIntake(t),channel!=='微动',channel);
  if(channel!=='微动')assert.equal(t.storeIntake.source,Sources.key(channel));
 }
 const t=E.create(s,'zhang',form('微动'));assert.equal(t.channel,'微动');assert(!E.isStoreIntake(t));
});
test('legacy sources and grouped conditions upgrade once without changing ticket progress',()=>{
 const storage=memory(),store=Store.createStore(storage,E,C),s=store.load();
 delete s.ticketSourceVersion;
 const oldNames=['门店H5 / A3','微信小程序','售后保障 / 企微','业务员代发起','CRM系统'];
 oldNames.forEach((name,i)=>{s.tickets[i].channel=name;s.tickets[i].sources[0].channel=name;});
 const flow=s.configuration.ruleScenes[0].config.ticketFlow,branch=flow.nodes[0].branches[0];
 delete flow.sourceOptionsVersion;branch.sources=['hotline','wechat'];branch.title='非 CRM 来源';
 const before=E.clone(s);storage.setItem(Store.KEY,JSON.stringify(s));
 const next=store.load();assert.equal(next._revision,before._revision+1);
 assert.deepEqual(next.tickets.slice(0,5).map(t=>t.channel),['微动','小程序','企微','微动','微动']);
 for(let i=0;i<next.tickets.length;i++){
  const a=E.clone(next.tickets[i]),b=E.clone(before.tickets[i]);
  delete a.channel;delete b.channel;a.sources.forEach(x=>delete x.channel);b.sources.forEach(x=>delete x.channel);
  assert.deepEqual(a,b);
 }
 const upgraded=next.configuration.ruleScenes[0].config.ticketFlow;
 assert.deepEqual(upgraded.nodes[0].branches[0].sources,['hotline','manager_hotline','miniapp','wechat']);
 assert.equal(upgraded.nodes[0].branches[0].title,'非微动来源');assert.deepEqual(store.load(),next);
 // A newly configured single channel must remain single after saving/reloading.
 upgraded.nodes[0].branches[0].sources=['wechat'];store.save(next);
 assert.deepEqual(store.load().configuration.ruleScenes[0].config.ticketFlow.nodes[0].branches[0].sources,['wechat']);
});
