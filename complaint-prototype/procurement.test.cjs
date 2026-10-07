'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),F=C.Rules.Flow,P=require('./ticket-flow-config.js')(F,C.STAFF,C.Assignment),Store=require('./shared-store.js');
const fixture=()=>{const s=C.initialize(E.seed()),d=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(r=>r.level===2));P.prepareEntry(s.configuration,d);return {s,d};};
test('all grades and seven solution types route exchange to procurement once and keep funding decisions',()=>{
 for(const level of [1,2,3,4,5]){const {s,d}=fixture();d.level=level;P.prepareEntry(s.configuration,d);P.validate(d,s.configuration);
  for(const type of Object.keys(F.planTypes)){const proposal=F.proposalValues({type,refund:E.solutionIncludes.refund(type)?100:0,compensation:E.solutionIncludes.compensation(type)?20:0}),route=P.entryPath(d,{source:'crm',proposal}),kinds=route.map(n=>n.kind);
   assert.equal(kinds.filter(k=>k==='procurement').length,E.solutionIncludes.exchange(type)?1:0);assert.equal(kinds.filter(k=>k==='payment').length,E.solutionIncludes.refund(type)||E.solutionIncludes.compensation(type)?1:0);assert.equal(kinds.at(-1),'close');
   if(kinds.includes('procurement')&&kinds.includes('payment'))assert(kinds.indexOf('procurement')>kinds.indexOf('payment'));
   assert.deepEqual(P.entryPath(d,{source:'wechat',storeResult:'unresolved',proposal}).slice(1),route);assert.equal(P.entryPath(d,{source:'wechat',storeResult:'resolved',proposal}).at(-1).type,'end');
  }
 }
});
test('saved flows gain procurement only in the editor draft, preserve task IDs, and respect later deletion',()=>{
 const {s,d}=fixture(),flow=d.config.ticketFlow;flow.nodes=flow.nodes.filter(n=>!P.all([n]).some(x=>x.kind==='procurement'));delete flow.procurementVersion;const before=E.clone(d),ids=P.all(flow.nodes).map(n=>n.id);
 const draft=P.prepare(s.configuration,d);P.prepareEntry(s.configuration,draft);assert.deepEqual(d,before);assert.equal(P.all(P.list(draft)).filter(n=>n.kind==='procurement').length,1);assert(ids.every(id=>P.all(P.list(draft)).some(n=>n.id===id)));
 const once=E.clone(draft);P.prepareEntry(s.configuration,draft);assert.deepEqual(draft,once);
 const saved=C.Rules.saveScene(s.configuration,'manager',draft,s.configuration.sceneRevision),rule=saved.ruleScenes.find(r=>r.id===draft.id);assert.deepEqual(rule.config.ticketFlow,draft.config.ticketFlow);
 draft.config.ticketFlow.nodes=draft.config.ticketFlow.nodes.filter(n=>!P.all([n]).some(x=>x.kind==='procurement'));P.prepareEntry(s.configuration,draft);assert(!P.all(P.list(draft)).some(n=>n.kind==='procurement'));
});
test('procurement shipping requires the assigned staff, records approved goods and advances on full shipment',()=>{
 const s=C.initialize(E.seed());E.prepareTickets(s);E.ensureWorkflowExamples(s);
 for(const suffix of ['P31','P32','P33']){const t=s.tickets.find(t=>t.id==='KS20261007-'+suffix),owner=t.owner;assert.equal(t.state,'采购办理');assert.equal(E.ticketStageKey(t),'procurement');assert.equal(t.currentAssignee,'procurement');const before=E.clone(t),data={method:'总部发货',items:E.procurementItems(t).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining})),trackingNumber:'SF-'+suffix,note:'商品已发出'};
  assert.throws(()=>E.finishProcurement(s,t,owner,data),/当前节点/);assert.throws(()=>E.finishProcurement(s,t,'procurement',{items:data.items}),/发货方式/);assert.throws(()=>E.finishProcurement(s,t,'procurement',{method:'总部发货'}),/商品及数量/);assert.deepEqual(t,before);
  E.finishProcurement(s,t,'procurement',data);const r=t.handlingRecords.at(-1);assert.equal(r.version,t.proposal.version);assert.equal(r.items[0].quantity,2);assert.equal(r.trackingNumber,'SF-'+suffix);assert.equal(r.method,'总部发货');assert.equal(t.owner,owner);
  if(suffix!=='P31')assert(t.payments.some(row=>row.result==='成功'));
  assert.equal(t.state,'待结案');assert.equal(t.currentAssignee,owner);assert.throws(()=>E.finishProcurement(s,t,'procurement',data),/当前节点/);E.closeTicket(s,t,owner,{note:'已核实全部完成',completed:true});assert.equal(t.state,'已结案');
 }
});
test('procurement assignment filters roles and preserves confirmed solution when the staff is unavailable',()=>{
 const {s,d}=fixture(),n=P.all(P.list(d)).find(n=>n.kind==='procurement');n.source='person';n.personId='finance';assert.throws(()=>P.validNode(n,s.configuration),/采购专员/);n.personId='procurement';n.fallbackId='aftercare';assert.throws(()=>P.validNode(n,s.configuration),/采购专员/);n.fallbackId='procurement';P.validNode(n,s.configuration);
 E.prepareTickets(s);E.ensureWorkflowExamples(s);const t=s.tickets.find(t=>t.id==='KS20261007-P31');s.configuration.organization.appointments.find(a=>a.personId==='procurement').active=false;
 const source=E.clone(t);source.id='PROCUREMENT-RETRY';source.phase='处理中';source.execution=null;source.proposal=null;source.currentAssignee=source.owner;s.tickets.push(source);E.confirmSolution(s,source,source.owner,{typeKey:'exchange',content:'线下确认置换',exchangeItems:[{name:'面霜',quantity:1,unitPrice:10000}]});assert.equal(source.state,'采购办理');assert.equal(source.pendingAssignment.mode,'flow-node');assert.equal(source.proposal.status,'已确认');const version=source.proposal.version;
 s.configuration.organization.appointments.find(a=>a.personId==='procurement').active=true;E.retryFlowNode(s,source,'manager');assert.equal(source.currentAssignee,'procurement');assert.equal(source.proposal.version,version);
});
test('stored configuration gets procurement staff once without resetting tickets or later staffing changes',()=>{
 const memory=new Map(),store=Store.createStore({getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)},E,C),s=store.load();delete s.configuration.procurementConfigVersion;s.configuration.nodeAssignmentRules.positions=s.configuration.nodeAssignmentRules.positions.filter(p=>p.id!=='procurement');s.configuration.organization.appointments=s.configuration.organization.appointments.filter(a=>a.personId!=='procurement');s.configuration.organization.departments=s.configuration.organization.departments.filter(d=>d.id!=='procurement');const tickets=E.clone(s.tickets),orders=E.clone(s.orders);s._revision=9;
 memory.set(Store.KEY,JSON.stringify(s));const loaded=store.load();assert.equal(loaded._revision,10);assert(C.active(loaded,'procurement'));assert.deepEqual(loaded.tickets,tickets);assert.deepEqual(loaded.orders,orders);assert.deepEqual(store.load(),loaded);
 loaded.configuration.organization.appointments.find(a=>a.personId==='procurement').active=false;loaded.configuration.nodeAssignmentRules.positions=loaded.configuration.nodeAssignmentRules.positions.filter(p=>p.id!=='procurement');store.save(loaded);const after=store.load();assert(!C.active(after,'procurement'));assert(!after.configuration.nodeAssignmentRules.positions.some(p=>p.id==='procurement'));
});
