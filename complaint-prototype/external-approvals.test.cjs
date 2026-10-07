'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration'),T=require('./approval-templates'),Store=require('./shared-store'),P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
function fixture(migrate=true){const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);E.ensureSolutionExamples(s);T.ensure(s);E.ensureExternalApprovals(s);E.ensureExternalApprovalExamples(s);if(migrate)E.ensureApprovalPresentation(s);return s;}
const ticket=(s,id)=>s.tickets.find(t=>t.id==='KS20261007-'+id);
const event=(s,t,data={})=>{const r=E.externalApprovalRecord(s,t);return {id:E.id(),instanceId:r.instanceId,processCode:r.processCode,scope:'instance',type:'finish',result:'agree',at:Math.max(Date.now(),r.lastEventAt||r.at)+10,...data};};
test('templates replace internal approval trees and preserve editable source/solution branches',()=>{
 const s=fixture();for(const scene of s.configuration.ruleScenes){P.validate(scene,s.configuration);const nodes=P.all(scene.config.ticketFlow.nodes);assert(nodes.some(n=>n.type==='branch'&&n.branches.some(b=>b.judgeBy==='source')));assert(nodes.filter(n=>n.type==='approval').every(n=>n.provider==='dingtalk'&&T.ready(T.get(s,n.templateId))));assert.equal(nodes.filter(n=>n.templateId==='approval-payment').length,1);assert.equal(nodes.filter(n=>n.templateId==='approval-purchase').length,1);assert(nodes.findIndex(n=>n.kind==='payment')<nodes.findIndex(n=>n.templateId==='approval-purchase'));}
 const original=JSON.stringify(s);assert.equal(E.ensureExternalApprovals(s),false);assert.equal(E.ensureExternalApprovalExamples(s),false);assert.equal(JSON.stringify(s),original);
});
test('a single approver agreement or transfer never advances the ticket; instance approval does once',()=>{
 const s=fixture(),t=ticket(s,'D01'),index=t.execution.index,r=E.externalApprovalRecord(s,t);
 assert.deepEqual(E.taskPeople(s,t),[]);assert.throws(()=>E.approve(s,t,'finance',true),/钉钉/);
 const task=event(s,t,{scope:'task',type:'finish',people:['主管'],actor:'陆清'});E.applyApprovalEvent(s,task);assert.equal(t.execution.index,index);assert.deepEqual(r.people,['主管']);
 const e=event(s,t);assert(E.applyApprovalEvent(s,e).advanced);assert.equal(E.currentFlowNode(t).kind,'payment');assert.equal(t.payments.length,0);const current=JSON.stringify(t);
 assert.equal(E.applyApprovalEvent(s,e).reason,'duplicate');assert.equal(JSON.stringify(t),current);
 E.applyApprovalEvent(s,{...e,id:'conflicting-final',result:'refuse'});assert.equal(JSON.stringify(t),current);assert.equal(r.status,'approved');
});
test('old rounds, out-of-order tasks and invalid results cannot change the current workflow',()=>{
 const s=fixture(),t=ticket(s,'D01'),r=E.externalApprovalRecord(s,t),before=JSON.stringify(t);
 E.applyApprovalEvent(s,event(s,t,{scope:'task',at:r.at-1,people:['错误人员']}));assert.equal(JSON.stringify(t),before);
 assert.throws(()=>E.applyApprovalEvent(s,event(s,t,{result:'unknown'})),/结果无效/);assert.equal(JSON.stringify(t),before);
 assert.throws(()=>E.applyApprovalEvent(s,event(s,t,{processCode:'other'})),/不匹配/);
 t.approval.recordId='new-round';const stale=JSON.stringify(t);E.applyApprovalEvent(s,event(s,{...t,approval:{recordId:r.id}}));assert.equal(JSON.stringify(t),stale);assert.equal(r.linkStatus,'superseded');
});
test('payment refusal returns to aftercare and starts a new immutable proposal round',()=>{
 const s=fixture(),t=ticket(s,'D04'),r=E.externalApprovalRecord(s,t),snapshot=JSON.stringify(r.snapshot);assert.equal(t.state,'处理中');assert.equal(t.proposal.status,'待调整');assert.equal(E.currentFlowNode(t).kind,'sales');
 E.confirmSolution(s,t,t.owner,{...E.clone(t.proposal),content:'补充未使用项目依据'});assert.equal(t.proposal.version,2);assert.equal(E.currentFlowNode(t).provider,'dingtalk');assert.equal(t.state,'审批中');assert.equal(JSON.stringify(r.snapshot),snapshot);assert.equal(r.status,'refused');assert.equal(E.externalApprovalRecord(s,t).status,'running');
});
test('after-payment procurement refusal locks financial records and resumes only procurement',()=>{
 const s=fixture(),t=ticket(s,'D05'),payment=JSON.stringify(t.payments),order=s.orders.find(o=>o.id===t.order),balance=JSON.stringify(order),version=t.proposal.version,old=E.externalApprovalRecord(s,t),snapshot=JSON.stringify(old.snapshot);
 assert.equal(t.state,'处理中');assert(t.approvalAmendment.paid);assert.throws(()=>E.confirmSolution(s,t,t.owner,t.proposal),/成功付款/);
 assert.throws(()=>E.amendProcurement(s,t,'finance',{note:'修改',items:[{productId:'repair-mask',quantity:3}]}),/主负责人/);
 E.amendProcurement(s,t,t.owner,{note:'更换缺货商品，客户已确认',items:[{productId:'repair-mask',quantity:3}],refund:999999});
 assert.equal(t.proposal.version,version);assert.equal(t.proposal.revision,2);assert.equal(t.proposal.refund,50000);assert.equal(JSON.stringify(t.payments),payment);assert.equal(JSON.stringify(order),balance);assert.equal(JSON.stringify(old.snapshot),snapshot);
 assert.equal(E.currentFlowNode(t).templateId,'approval-purchase');const r=E.externalApprovalRecord(s,t);assert.equal(r.round,2);assert(r.snapshot.fields.find(f=>f.id==='reason').value.includes('更换缺货商品'));
 E.applyApprovalEvent(s,event(s,t));assert.equal(E.currentFlowNode(t).kind,'procurement');
 assert.throws(()=>E.pay(s,t,'finance',{result:'成功'}),/办理人/);
 E.finishProcurement(s,t,E.taskPeople(s,t)[0],{method:'总部发货',items:E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining})),trackingNumber:'SF-TEST',note:'商品已发出'});E.closeTicket(s,t,t.owner,{completed:true,note:'已核实到账及交付'});assert.equal(t.state,'已结案');assert.equal(JSON.stringify(t.payments),payment);assert.equal(JSON.stringify(order),balance);
});
test('launch failure retains confirmed solution and deadline without falling back to local approvals',()=>{
 const s=fixture(),t=ticket(s,'D06'),r=E.externalApprovalRecord(s,t),before=JSON.stringify(s);
 assert.equal(t.state,'审批中');assert.equal(t.proposal.status,'已确认');assert(t.taskDeadline);assert(!t.pendingAssignment);assert.equal(r.status,'failed');
 assert.throws(()=>E.retryExternalApproval(s,t,'finance'),/权限/);const next=E.retryExternalApproval(s,t,t.owner);assert.equal(next.status,'running');assert(next.instanceId);assert.equal(r.status,'failed');assert.equal(next.previousRecordId,r.id);assert.equal(t.payments.length,0);
 const uncertain=ticket(s,'D10');assert.throws(()=>E.retryExternalApproval(s,uncertain,uncertain.owner),/同步确认/);E.syncExternalApproval(s,E.externalApprovalRecord(s,uncertain).id,uncertain.owner);assert.equal(E.externalApprovalRecord(s,uncertain).status,'uncertain');
});
test('normal confirmation needs no credentials and synchronization leaves approval pending',()=>{
 const s=fixture(),t=ticket(s,'D04'),old=E.externalApprovalRecord(s,t),snapshot=JSON.stringify(old.snapshot);assert.equal(T.integration(s).connection.status,'disconnected');assert(!T.integration(s).connection.identities);
 E.confirmSolution(s,t,t.owner,{...E.clone(t.proposal),content:'退款依据已补齐'});const r=E.externalApprovalRecord(s,t);assert.equal(r.status,'running');assert.equal(r.error,'');assert(r.instanceId);assert.equal(t.state,'审批中');
 const pending=JSON.stringify(t);E.syncExternalApproval(s,r.id,t.owner);assert.equal(JSON.stringify(t),pending);assert.equal(r.status,'running');assert.equal(t.payments.length,0);assert.equal(JSON.stringify(old.snapshot),snapshot);assert.equal(E.approvalLaunchRequest,undefined);
});
test('instance attachment is idempotent and URLs cannot escape approved DingTalk hosts',()=>{
 const s=fixture(),t=ticket(s,'D06'),r=E.externalApprovalRecord(s,t),d={instanceId:'DD-LAUNCH',people:['财务'],url:'https://evil.example/?data=private'};E.attachApprovalInstance(s,r.id,d);assert.equal(r.url,'');const count=r.events.length;E.attachApprovalInstance(s,r.id,d);assert.equal(r.events.length,count);assert.throws(()=>E.attachApprovalInstance(s,r.id,{instanceId:'other'}),/其他钉钉/);
 assert.equal(E.approvalSafeURL('javascript:alert(1)'),'');assert.equal(E.approvalSafeURL('https://aflow.dingtalk.com/a'),'https://aflow.dingtalk.com/a');
});
test('exchange-only route bypasses payment and all linked examples survive a store reload',()=>{
 const s=fixture(),t=ticket(s,'D11');assert(!t.execution.steps.some(n=>n.kind==='payment'));assert.equal(E.currentFlowNode(t).templateId,'approval-purchase');
 s._revision=10;const values=new Map([[Store.KEY,JSON.stringify(s)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},store=Store.createStore(storage,E,C);const loaded=store.load(),after=JSON.stringify(loaded);assert.equal(JSON.stringify(store.load()),after);assert.equal(loaded.approvalRecords.length,s.approvalRecords.length);
});

test('reload recovers previously blocked requests without changing money or resetting worked examples',()=>{
 const s=fixture(),t=ticket(s,'D06'),r=E.externalApprovalRecord(s,t);t.scenarioKey='custom';r.error='钉钉审批服务未连接';const payments=JSON.stringify(t.payments),plan=JSON.stringify(t.proposal);assert(E.ensureLocalApprovalInteractions(s));assert.equal(r.status,'running');assert.equal(JSON.stringify(t.proposal),plan);assert.equal(JSON.stringify(t.payments),payments);assert.equal(E.ensureLocalApprovalInteractions(s),false);
});

test('refresh preserves every approval result, financial record and workflow position',()=>{
 const s=fixture();
 for(const suffix of ['D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','D11']){
  const t=ticket(s,suffix),r=E.externalApprovalRecord(s,t),before=JSON.stringify(t),orders=JSON.stringify(s.orders),count=s.approvalRecords.length;
  r.localOutcome='agree';r.localReason='old implicit result';r.syncedAt=1;
  const original=E.clone(r);E.syncExternalApproval(s,r.id,t.owner);
  assert.equal(JSON.stringify(t),before,suffix);assert.equal(JSON.stringify(s.orders),orders);assert.equal(s.approvalRecords.length,count);
  assert(r.syncedAt>1);assert.deepEqual({...r,syncedAt:original.syncedAt,syncStatus:original.syncStatus},original);
  assert.equal(r.syncStatus,r.status==='uncertain'?'pending':'ok');
 }
});
test('unfinished legacy approvals migrate once without changing proposals, deadlines or historical evidence',()=>{
 const s=fixture(false),before=E.clone(s),ids=['KS20260929-005','KS20261007-P09','KS20261007-P40'];
 assert(E.ensureApprovalPresentation(s));assert.deepEqual(Object.keys(s.approvalPresentationBackup.tickets).sort(),ids.sort());
 for(const t of s.tickets){
  const old=before.tickets.find(x=>x.id===t.id);
  if(!ids.includes(t.id)){assert.deepEqual(t,old);continue;}
  assert.deepEqual(s.approvalPresentationBackup.tickets[t.id],old);
  for(const key of ['proposal','proposalHistory','payments','nodeTiming','nodeTimings','deadline','taskDeadline','phase','state','logs','updated','handlingRecords'])assert.deepEqual(t[key],old[key],t.id+' '+key);
  assert.equal(t.execution.index,old.execution.index);
  assert(t.execution.steps.slice(t.execution.index).filter(n=>n.type==='approval'&&!n.done).every(n=>n.provider==='dingtalk'));
  const n=E.currentFlowNode(t);
  if(n.type==='approval'){
   const r=E.externalApprovalRecord(s,t);assert.equal(r.status,'running');assert.equal(r.at,old.approval.at);assert.equal(n.startedAt,old.execution.steps[old.execution.index].startedAt??old.approval.at);
   assert.deepEqual(r.people,old.approval.steps[old.approval.index].people.filter(id=>!old.approval.steps[old.approval.index].votes.includes(id)).map(id=>E.user(id).name));
   assert.deepEqual(t.approvalHistory.at(-1),old.approval);assert.deepEqual(E.taskPeople(s,t),[]);assert.throws(()=>E.approve(s,t,old.owner,true),/钉钉/);
  }else assert.deepEqual(t.approval,old.approval);
 }
 assert.deepEqual(s.orders,before.orders);const json=JSON.stringify(s);assert.equal(E.ensureApprovalPresentation(s),false);assert.equal(JSON.stringify(s),json);
});

test('template repair retries with current mappings in a new round and retains failed evidence and clocks',()=>{
 const s=fixture(),t=ticket(s,'D12'),old=E.externalApprovalRecord(s,t),before=E.clone(old),deadline=t.taskDeadline,start=E.currentFlowNode(t).startedAt,clock=E.clone(t.nodeTiming),proposal=E.clone(t.proposal),orders=E.clone(s.orders);
 assert.equal(old.status,'failed');assert.throws(()=>E.retryExternalApproval(s,t,t.owner,old.id),/编辑审批模板/);assert.deepEqual(old,before);
 const draft=T.clone(T.get(s,old.templateId));draft.mappings.ticket.source='ticket.id';draft.mappings.reason={mode:'constant',value:'门店已核实退款依据'};T.saveTemplate(s,'manager',draft,T.integration(s).revision);
 const next=E.retryExternalApproval(s,t,t.owner,old.id);assert.equal(next.status,'running');assert.equal(next.round,old.round+1);assert.equal(next.templateVersion,2);assert.equal(next.snapshot.fields.find(f=>f.id==='reason').value,'门店已核实退款依据');assert.deepEqual(old,before);
 assert.equal(t.taskDeadline,deadline);assert.equal(E.currentFlowNode(t).startedAt,start);assert.deepEqual(t.nodeTiming,clock);assert.deepEqual(t.proposal,proposal);assert.deepEqual(s.orders,orders);assert.equal(t.payments.length,0);
 assert.throws(()=>E.retryExternalApproval(s,t,t.owner,old.id),/该申请已结束/);assert.equal(E.approvalRecovery(s,t,old).failed,false);
});
test('missing application data returns to the existing solution form and confirmation creates a fresh application',()=>{
 const s=fixture(),t=ticket(s,'D13'),old=E.externalApprovalRecord(s,t),before=E.clone(old),plan=E.clone(t.proposal);
 assert.deepEqual(E.approvalRecovery(s,t).missing,['收款账号']);assert.throws(()=>E.retryExternalApproval(s,t,t.owner),/收款账号/);
 E.correctApprovalApplication(s,t,t.owner,old.id);assert.equal(t.state,'处理中');assert.equal(t.proposal.status,'待调整');assert.deepEqual(old,before);assert.equal(E.approvalRecovery(s,t,old).failed,false);
 E.confirmSolution(s,t,t.owner,{...plan,payout:{...plan.payout,account:'customer_alipay'},content:'已核实收款账号并补充方案'});
 assert.equal(t.proposal.version,plan.version+1);assert.equal(t.state,'审批中');assert.equal(E.externalApprovalRecord(s,t).status,'running');assert.equal(E.externalApprovalRecord(s,t).snapshot.fields.find(f=>f.id==='account').value,'customer_alipay');assert.deepEqual(old,before);
});
test('after-payment failed procurement correction preserves paid amounts and resumes at procurement approval',()=>{
 const s=fixture(),t=ticket(s,'D03'),step=E.currentFlowNode(t);t.proposal.exchangeItems=[];const failure=E.enterExternalApproval(s,t,step),before=E.clone(failure),payments=E.clone(t.payments),order=E.clone(s.orders.find(o=>o.id===t.order)),version=t.proposal.version;
 assert.equal(failure.status,'failed');E.correctApprovalApplication(s,t,t.owner,failure.id);assert(t.approvalAmendment.paid);E.amendProcurement(s,t,t.owner,{note:'补全置换商品',items:[{productId:'repair-mask',quantity:3}]});
 assert.equal(E.currentFlowNode(t).templateId,'approval-purchase');assert.equal(E.externalApprovalRecord(s,t).status,'running');assert.equal(t.proposal.version,version);assert.deepEqual(t.payments,payments);assert.deepEqual(s.orders.find(o=>o.id===t.order),order);assert.deepEqual(failure,before);
});
test('recovery examples append to existing stores without resetting worked tickets or template edits',()=>{
 const s=fixture();s.externalApprovalExamplesVersion=1;s.tickets=s.tickets.filter(t=>!/-D1[23]$/.test(t.id));s.orders=s.orders.filter(o=>!/^ORDER-D1[23]$/.test(o.id));s.approvalRecords=s.approvalRecords.filter(r=>!/-D1[23]$/.test(r.ticketId));
 T.get(s,'approval-payment-store').mappings.ticket.source='ticket.id';const draft=E.clone(T.get(s,'approval-payment-store')),existing=E.clone(s.tickets),backup=E.clone(s.externalApprovalSampleBackup),records=E.clone(s.approvalRecords);
 assert(E.ensureExternalApprovalExamples(s));assert.equal(s.tickets.length,existing.length+2);assert.deepEqual(s.tickets.filter(t=>existing.some(x=>x.id===t.id)),existing);assert.deepEqual(s.approvalRecords.filter(r=>records.some(x=>x.id===r.id)),records);assert.deepEqual(T.get(s,'approval-payment-store'),draft);assert.deepEqual(s.externalApprovalSampleBackup,backup);assert.equal(E.ensureExternalApprovalExamples(s),false);
});
