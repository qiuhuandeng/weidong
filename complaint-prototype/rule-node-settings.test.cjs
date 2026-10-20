'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),P=require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment);
const fixture=()=>{const s=C.initialize(E.seed()),d=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(r=>r.level===2));return {s,d};};
const data={name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款申请',description:'客户要求退款'};
test('old first-contact settings migrate to one rule value without node overrides',()=>{
 const {s,d}=fixture();P.prepareEntry(s.configuration,d);delete d.config.contactTimingVersion;const nodes=P.all(P.list(d)),store=nodes.find(n=>n.entryRole==='store'),sales=nodes.find(n=>n.kind==='sales');store.firstHours=1;sales.firstHours=3;store.source='person';store.personId='store2';store.fallbackId='manager';
 P.prepareSettings(d);assert.equal(d.config.timing.storeFirstContactHours,undefined);assert.equal(d.config.timing.firstContactHours,3);assert(nodes.every(n=>!Object.hasOwn(n,'firstHours')));assert.equal(store.source,'store');assert.equal(store.personId,'');assert.equal(store.fallbackId,'');
 d.config.timing.firstContactHours=4;sales.firstHours=9;P.prepareSettings(d);assert.equal(d.config.timing.firstContactHours,4);assert(!Object.hasOwn(sales,'firstHours'));P.validate(d,s.configuration);
});
test('rule first-contact settings persist, drive new tickets, and preserve existing clocks and snapshots',()=>{
 const {s,d}=fixture();P.prepareEntry(s.configuration,d);const old=E.create(s,'chen',data),before=E.clone(old);d.config.timing.firstContactHours=0.25;d.config.timing.storeFirstContactHours=1.5;
 s.configuration=C.Rules.saveScene(s.configuration,'manager',d,s.configuration.sceneRevision,Date.now());const saved=C.Rules.sceneList(s.configuration).find(r=>r.id===d.id);assert.equal(saved.config.timing.firstContactHours,0.25);assert.equal(saved.config.timing.storeFirstContactHours,undefined);assert(P.all(P.list(saved)).every(n=>!Object.hasOwn(n,'firstHours')));
 const t=E.create(s,'chen',data);assert.equal(t.taskDeadline-t.assignedAt,0.25*E.H);assert.equal(t.flow.doc.stage.first,0.25);assert.equal(t.flow.doc.stage.storeFirst,undefined);assert.deepEqual(old,before);
 for(const key of ['firstContactHours'])for(const value of ['',0,721]){const invalid=E.clone(saved);invalid.config.timing[key]=value;assert.throws(()=>C.Rules.saveScene(s.configuration,'manager',invalid,s.configuration.sceneRevision,Date.now()),/时限/);}
});
test('store entry supports either dynamic store handler and keeps that choice on save/reload',()=>{
 const {s,d}=fixture();P.prepareEntry(s.configuration,d);const store=P.all(P.list(d)).find(n=>n.entryRole==='store');store.source='receptionist';P.validate(d,s.configuration);assert.equal(P.sourceLabel(store,[]),'客户的接待老师');
 const saved=C.Rules.saveScene(s.configuration,'manager',d,s.configuration.sceneRevision,Date.now()),reloaded=P.prepare(saved,C.Rules.sceneList(saved).find(r=>r.id===d.id));P.prepareEntry(saved,reloaded);const current=P.all(P.list(reloaded)).find(n=>n.entryRole==='store');assert.equal(current.source,'receptionist');assert.equal(current.fallbackId,'');
 const payment=P.node('payment',s.configuration,d);payment.source='receptionist';assert.throws(()=>P.validNode(payment,s.configuration),/仅门店/);
});
test('receptionist-based store handling uses the linked order and blocks missing, inactive or different-store staff',()=>{
 for(const id of ['zhang',null,'li','inactive']){const {s,d}=fixture(),store=P.node('store',s.configuration,d);store.source='receptionist';d.config.ticketFlow.nodes=[P.node('sales',s.configuration,d),store,P.node('close',s.configuration,d)];s.configuration=C.Rules.saveScene(s.configuration,'manager',d,s.configuration.sceneRevision,Date.now());
  const order=s.orders.find(o=>o.id==='O2');order.receptionistId=id==='inactive'?'zhang':id;if(id==='inactive')s.configuration.organization.appointments.find(a=>a.personId==='zhang').active=false;
  const t=E.create(s,'chen',data);E.follow(s,t,t.owner,{connected:true,content:'已联系并核实'});E.confirmSolution(s,t,t.owner,{typeKey:'service',content:'已线下确认，由门店办理'});
  if(id==='zhang'){assert.equal(t.currentAssignee,'zhang');assert.equal(t.phase,'待门店办理');assert.throws(()=>E.finishStore(s,t,'store2',{note:'非接待老师操作'}),/当前节点/);E.finishStore(s,t,'zhang',{note:'处理完成'});assert.equal(t.currentAssignee,t.owner);assert.equal(t.state,'待结案');}
  else{assert.equal(t.pendingAssignment.mode,'flow-node');assert.match(t.pendingAssignment.reason,/接待老师/);assert.equal(t.proposal.status,'已确认');order.receptionistId='zhang';s.configuration.organization.appointments.find(a=>a.personId==='zhang').active=true;E.retryFlowNode(s,t,'manager');assert.equal(t.currentAssignee,'zhang');assert.equal(t.phase,'待门店办理');}
 }
});
