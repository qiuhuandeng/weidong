'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js');
const pauseData=t=>({reasonType:'materials',expectedAt:Date.now()+24*E.H,evidenceId:E.suspensionEvidence(t)[0]?.id,basis:'已核实确需等待客户资料'});
const fixture=()=>{const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);return s;};
const find=(s,suffix)=>s.tickets.find(t=>t.id==='KS20261007-'+suffix),actor=(s,t)=>E.taskPeople(s,t)[0];
const memory=()=>{const map=new Map();return {getItem:key=>map.get(key)??null,setItem:(key,value)=>map.set(key,value)};};
test('eight persisted lifecycle states, separate from phases and current tasks',()=>{
 const s=fixture();assert.deepEqual(E.STATES,['待处理','处理中','审批中','付款办理','采购办理','待结案','已挂起','已结案']);
 for(const t of s.tickets){assert(E.STATES.includes(t.state));assert.equal(E.ticketStatus(t),t.state);assert(E.ticketStage(t));assert(E.ticketTask(t));}
 assert.equal(find(s,'W04').state,'待处理');assert.equal(find(s,'W04').phase,'待定级');assert.equal(find(s,'P06').state,'审批中');assert.equal(E.ticketStageKey(find(s,'P06')),'approval');assert.equal(find(s,'P19').state,'处理中');assert.equal(find(s,'P19').phase,'待分派');
});
test('payment and purchase handling start only after their preceding approvals complete',()=>{
 const store=Store.createStore(memory(),E,C),s=store.load(),t=find(s,'D01'),states=[t.state];
 const approve=()=>{const r=E.externalApprovalRecord(s,t);E.applyApprovalEvent(s,{id:E.id(),instanceId:r.instanceId,scope:'instance',type:'finish',result:'agree',at:Math.max(Date.now(),r.lastEventAt||r.at)+10,actor:'审批人'});states.push(t.state);};
 const record=E.externalApprovalRecord(s,t);E.applyApprovalEvent(s,{id:E.id(),instanceId:record.instanceId,scope:'task',type:'finish',result:'agree',at:Math.max(Date.now(),record.lastEventAt||record.at)+1,people:['下一审批人'],actor:'财务'});assert.equal(t.state,'审批中');assert.equal(E.currentFlowNode(t).type,'approval');
 approve();assert.equal(E.currentFlowNode(t).kind,'payment');
 E.pay(s,t,actor(s,t),{result:'失败',reason:'支付渠道异常'});assert.equal(t.state,'付款办理');
 E.pay(s,t,actor(s,t),{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'STATUS-PAY',proof:[{name:'凭证'}]});states.push(t.state);assert.equal(E.currentFlowNode(t).templateId,'approval-purchase');
 approve();assert.equal(E.currentFlowNode(t).kind,'procurement');const deadline=t.taskDeadline;
 E.finishProcurement(s,t,actor(s,t),{method:'总部发货',items:[{lineIndex:0,quantity:1}]});assert.equal(t.state,'采购办理');assert.equal(t.taskDeadline,deadline);
 E.finishProcurement(s,t,actor(s,t),{method:'门店发货',items:E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining}))});states.push(t.state);
 E.closeTicket(s,t,t.owner,{note:'款项与商品均已收到',completed:true});states.push(t.state);
 assert.deepEqual(states,['审批中','付款办理','审批中','采购办理','待结案','已结案']);store.save(s);assert.deepEqual(store.load().tickets.find(x=>x.id===t.id),t);
});
test('existing six-state tickets refresh only their status labels, preserving all progress and evidence',()=>{
 const mem=memory(),store=Store.createStore(mem,E,C),s=store.load();
 for(const t of s.tickets)if(['付款办理','采购办理'].includes(t.state)||E.ticketStageKey(t)==='store'&&t.execution)t.state='审批中';
 delete s.ticketStatusVersion;const original=E.clone(s);mem.setItem(Store.KEY,JSON.stringify(s));const next=store.load();assert.equal(next._revision,original._revision+1);assert.equal(next.ticketStatusVersion,2);
 for(const t of next.tickets){const old=original.tickets.find(x=>x.id===t.id),{state,...rest}=t;assert.deepEqual(rest,((({state,...r})=>r)(old)));assert.equal(state,E.ticketStatus(t));}
 const {tickets:oldTickets,_revision:oldRevision,ticketStatusVersion:oldStatusVersion,...oldRest}=original,{tickets:newTickets,_revision:newRevision,ticketStatusVersion:newStatusVersion,...newRest}=next;assert.deepEqual(newRest,oldRest);
 for(const suffix of ['D08','D14','D17','D18'])assert.equal(find(next,suffix).state,'采购办理');assert.equal(find(next,'D02').state,'付款办理');assert.equal(find(next,'D03').state,'审批中');assert.equal(find(next,'P10').state,'处理中');assert.deepEqual(store.load(),next);
});
test('grading stays pending; aftercare starts handling and a direct solution waits for manual closure',()=>{
 const s=fixture(),t=find(s,'W04');t.channel='门店H5 / A3';E.confirmGrading(s,t,'manager',1,'已核实为普通服务反馈');assert.equal(t.state,'待处理');assert.equal(t.phase,'待首联');E.follow(s,t,actor(s,t),{connected:true,content:'已联系并核实'});assert.equal(t.state,'处理中');E.confirmSolution(s,t,actor(s,t),{typeKey:'service',content:'线下协调处理完成',refund:0,compensation:0});assert.equal(t.state,'待结案');assert.equal(E.ticketStageKey(t),'close');E.closeTicket(s,t,actor(s,t),{note:'处理完成已核实',completed:true});assert.equal(t.state,'已结案');
});
test('62 cases cover every state, all seven solution types and approval modes',()=>{
 const s=fixture();assert.equal(E.WORKFLOW_EXAMPLES.length,62);
 for(const [state,count] of [['待处理',7],['处理中',18],['审批中',4],['付款办理',5],['采购办理',5],['待结案',7],['已挂起',7],['已结案',9]]){const rows=E.WORKFLOW_EXAMPLES.filter(row=>row.state===state);assert.equal(rows.length,count);for(const row of rows)assert.equal(s.tickets.find(t=>t.id===row.id).state,state,row.id);}
 assert.deepEqual(new Set(s.tickets.filter(t=>t.id.startsWith('KS20261007-C')&&t.proposal).map(t=>t.proposal.typeKey)),new Set(Object.keys(E.SOLUTION_TYPES)));
 assert.equal(find(s,'P06').approval.steps[0].votes.length,1);assert.equal(find(s,'P07').approval.index,1);assert.equal(find(s,'P08').approval.steps[0].mode,'any');
 assert.equal(find(s,'P12').payments[0].result,'失败');assert.equal(find(s,'P13').proposal.status,'待调整');assert.equal(find(s,'P02').handoffs.length,1);assert.equal(find(s,'P04').storeIntake.result,'unresolved');assert(E.canCloseEarly(s,find(s,'P05'),find(s,'P05').owner));
});
test('scenario building is additive, preserves current configuration and does not consume live dispatch cursors',()=>{
 const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);s.assignmentCursors={existing:9};s.aftercareCursors={aftercare:'chen'};const before=E.clone(s);E.ensureWorkflowExamples(s);
 assert.deepEqual(s.configuration,before.configuration);assert.deepEqual(s.assignmentCursors,before.assignmentCursors);assert.deepEqual(s.aftercareCursors,before.aftercareCursors);assert.deepEqual(s.tickets.filter(t=>before.tickets.some(old=>old.id===t.id)),before.tickets);
 const now=E.clone(s);assert.equal(E.ensureWorkflowExamples(s),false);assert.deepEqual(s,now);
});
test('all active handling, downstream, closure and suspended cases can reach closure through their actual configured operations',()=>{
 for(const entry of E.WORKFLOW_EXAMPLES.filter(row=>['处理中','审批中','付款办理','采购办理','待结案','已挂起'].includes(row.state))){const s=fixture(),t=s.tickets.find(t=>t.id===entry.id);let steps=0;
  while(t.state!=='已结案'){
   assert(steps++<15,entry.id+'没有到达结案');const a=actor(s,t);
   if(t.suspension){E.resumeTicket(s,t,t.owner,'资料已补齐');continue;}
   if(E.isStoreIntake(t)){if(!t.storeIntake.contactedAt)E.follow(s,t,a,{connected:true,content:'门店已联系'});E.closeEarly(s,t,a,{note:'已安抚解决',completed:true});continue;}
   if(t.pendingAssignment){assert.equal(t.pendingAssignment.mode,'flow-node');E.retryFlowNode(s,t,'manager');continue;}
   if(t.phase==='待首联'){E.follow(s,t,a,{connected:true,content:'有效联系'});continue;}
   const n=E.currentFlowNode(t);
   if(!n||n.kind==='sales'){E.confirmSolution(s,t,t.owner,{typeKey:'service',content:'已线下协调完成',refund:0,compensation:0});continue;}
   if(n.type==='approval'){E.approve(s,t,a,true,'核实完成');continue;}
   if(n.kind==='procurement'){E.finishProcurement(s,t,a,{method:'总部发货',items:E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining})),trackingNumber:'SF-TEST',note:'商品已发出'});continue;}
   if(n.kind==='store'){E.finishStore(s,t,a,{note:'商品已交付，门店处理完成'});continue;}
   if(n.kind==='payment'){const amount=t.proposal.refund+t.proposal.compensation;E.pay(s,t,a,amount?{result:'成功',amount,reference:'CHECK-'+t.id,proof:[{name:'付款凭证'}]}:{result:'无需付款',reason:'无退赔，仅服务协调'});continue;}
   assert.equal(n.kind,'close');E.closeTicket(s,t,a,{note:'已核实各项处理完成',completed:true});
  }
  if(!t.closure?.early)assert.equal(t.owner,E.currentFlowNode(t).people[0],entry.id);assert.deepEqual(E.taskPeople(s,t),[]);
 }
});
test('suspension examples preserve whole deadlines and overdue time, including first contact recovery',()=>{
 const s=fixture();for(const suffix of ['H01','H02','H03','H04']){const t=find(s,suffix),deadline=t.deadline,original=t.suspension.taskDeadline;t.suspension.at-=2*E.H;E.resumeTicket(s,t,t.owner,'继续办理');assert.equal(t.deadline,deadline);assert(Math.abs(t.taskDeadline-original-2*E.H)<100);assert.equal(t.state,suffix==='H01'?'待处理':'处理中');if(suffix==='H04')assert(t.deadline<Date.now());}
 const t=find(s,'H03');assert.equal(t.suspensionHistory[0].taskDeadline<t.suspensionHistory[0].at+2*E.H,true);
});
test('legacy running approvals, payments and callbacks migrate once without losing recorded evidence',()=>{
 const s=C.initialize(E.seed()),original=E.clone(s.tickets);for(const t of s.tickets){t.state=t.phase;delete t.phase;}
 assert(E.prepareTickets(s));assert(!s.tickets.some(t=>['待方案审批','待打款','待回访'].includes(t.phase)));
 for(const old of original){const t=s.tickets.find(t=>t.id===old.id);assert.equal(t.deadline,old.deadline);assert.deepEqual(t.payments,old.payments);for(const log of old.logs)assert(t.logs.some(row=>JSON.stringify(row)===JSON.stringify(log)));if(['待方案审批','待打款','待回访'].includes(old.phase)){assert.equal(t.legacyWorkflow.phase,old.phase);assert.equal(t.taskDeadline,old.taskDeadline);}}
 const snapshot=E.clone(s);assert.equal(E.prepareTickets(s),false);assert.deepEqual(s,snapshot);
 const t=s.tickets.find(t=>t.phase==='待部门审批');while(t.phase==='待部门审批')E.approve(s,t,actor(s,t),true,'继续办理');assert.equal(t.phase,'待付款');E.pay(s,t,actor(s,t),{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'CONTINUED',proof:[{name:'凭证'}]});assert.equal(t.state,'待结案');assert.equal(t.phase,'待结案');E.closeTicket(s,t,t.owner,{note:'线下已核实完成',completed:true});assert.equal(t.state,'已结案');
 const callback=s.tickets.find(t=>t.legacyWorkflow?.phase==='待回访');assert.equal(callback.proposal,null);E.closeTicket(s,callback,callback.owner,{note:'原处理事项已确认完成',completed:true});assert.equal(callback.state,'已结案');
});
test('retired callbacks and risk approval cannot close tickets, and keywords do not silently replace grading or flow',()=>{
 const s=fixture(),t=find(s,'P01'),level=t.level,flow=E.clone(t.flow);E.follow(s,t,t.owner,{connected:true,content:'客户提到12315，请核实相关信息'});assert.equal(t.level,level);assert.deepEqual(t.flow,flow);assert.equal(E.needsRiskReview(t),false);
 for(const fn of [()=>E.review(s,t,t.owner,{result:'认可',note:'旧路径'}),()=>E.riskAck(s,t,'manager','旧复核'),()=>E.withdraw(s,t,t.owner,'旧撤回')])assert.throws(fn,/已取消/);
});
test('reload and scenario directory visits do not reset processed examples, and stale writes are rejected',()=>{
 const mem=memory(),original=C.initialize(E.seed());original._revision=10;mem.setItem(Store.KEY,JSON.stringify(original));const store=Store.createStore(mem,E,C),s=store.load();assert.equal(s._revision,11);assert.throws(()=>store.save(original),/其他页面/);const t=find(s,'H02');E.resumeTicket(s,t,t.owner,'已收到材料');store.save(s);const snapshot=E.clone(s);assert.deepEqual(store.load(),snapshot);assert.equal(find(store.load(),'H02').state,'处理中');assert.equal(s.tickets.length,76+E.EXTERNAL_APPROVAL_EXAMPLES.length);
});
test('a newly created ticket can be followed immediately without an artificial migration version conflict',()=>{
 const store=Store.createStore(memory(),E,C),s=store.load(),t=E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'400电话',title:'客户申请退款',description:'请核实剩余疗程退款事项'});store.save(s);const revision=s._revision;store.assertVersion(s);assert.equal(s._revision,revision);E.follow(s,t,actor(s,t),{connected:true,content:'已核实客户情况'});store.save(s);const loaded=store.load().tickets.find(row=>row.id===t.id);assert.equal(loaded.state,'处理中');assert.equal(loaded.lifecycleVersion,1);
});
test('store handling starts on attempted contact but early closure requires effective contact',()=>{
 const s=fixture(),t=find(s,'P23'),a=actor(s,t);assert.equal(t.state,'待处理');E.follow(s,t,a,{connected:false,content:'未接通'});assert.equal(t.state,'处理中');assert.equal(t.firstContact,null);assert.equal(E.canCloseEarly(s,t,a),false);E.follow(s,t,a,{connected:true,content:'已安抚解决'});assert.equal(E.canCloseEarly(s,t,a),true);E.closeEarly(s,t,a,{note:'解释后客户已理解',completed:true});assert.equal(t.state,'已结案');
});

test('an unanswered follow-up starts handling; transfer and suspension preserve progress and first-contact timing',()=>{
 const s=fixture(),t=find(s,'W02'),deadline=t.taskDeadline;
 E.transferAftercare(s,t,t.owner,'chen','交接给同部门客服');assert.equal(t.state,'待处理');
 assert.throws(()=>E.follow(s,t,t.owner,{connected:false,content:' '}),/沟通内容/);assert.equal(t.state,'待处理');
 E.follow(s,t,t.owner,{connected:false,content:'客户未接通，稍后继续联系'});assert.equal(t.state,'处理中');assert.equal(t.phase,'待首联');assert.equal(t.firstContact,null);assert.equal(t.taskDeadline,deadline);
 assert.throws(()=>E.confirmSolution(s,t,t.owner,{typeKey:'service',content:'服务协调',refund:0,compensation:0}),/联系跟进/);
 E.transferAftercare(s,t,t.owner,'aftercare','继续跟进');assert.equal(t.state,'处理中');assert.equal(t.taskDeadline,deadline);
 E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等待客户方便接听'});assert.equal(t.state,'已挂起');E.resumeTicket(s,t,t.owner,'继续联系');assert.equal(t.state,'处理中');assert.equal(t.firstContact,null);
 E.follow(s,t,t.owner,{connected:true,content:'已接通并核实'});assert.equal(t.state,'处理中');assert.equal(t.phase,'处理中');assert(t.firstContact);
});
test('approval completion enters payment handling; returns go back to aftercare and completion waits for closure',()=>{
 const s=fixture(),a=find(s,'P06');E.approve(s,a,actor(s,a),true,'会签事项已核实');assert.equal(a.phase,'待付款');assert.equal(a.state,'付款办理');
 E.pay(s,a,actor(s,a),{result:'失败',reason:'渠道异常'});assert.equal(a.state,'付款办理');E.pay(s,a,actor(s,a),{result:'退回',reason:'请核实收款账户'});assert.equal(a.state,'处理中');assert.equal(E.ticketStageKey(a),'sales');
 E.confirmSolution(s,a,a.owner,{typeKey:'refund',content:'账户已线下核实',refund:50000,compensation:0,account:'原渠道'});assert.equal(a.state,'审批中');E.approve(s,a,actor(s,a),false,'补充退款依据');assert.equal(a.state,'处理中');
 const t=find(s,'P10');E.finishStore(s,t,actor(s,t),{note:'商品已交付'});assert.equal(t.state,'待结案');assert.equal(t.currentAssignee,t.owner);assert.equal(t.closed,undefined);E.closeTicket(s,t,t.owner,{completed:true,note:'已核实客户签收'});assert.equal(t.state,'已结案');
 const pendingClose=find(s,'P11');s.configuration.organization.appointments.find(p=>p.personId===pendingClose.owner).active=false;
 E.pay(s,pendingClose,actor(s,pendingClose),{result:'成功',amount:50000,reference:'CLOSE-NO-OWNER',proof:[{name:'凭证'}]});assert.equal(pendingClose.pendingAssignment.mode,'flow-node');assert.equal(pendingClose.state,'待结案');
});
test('all seven solution types have completed evidence while waiting for the aftercare owner to close',()=>{
 const s=fixture(),rows=E.WORKFLOW_EXAMPLES.filter(row=>row.state==='待结案').map(row=>s.tickets.find(t=>t.id===row.id));
 assert.deepEqual(new Set(rows.map(t=>t.proposal.typeKey)),new Set(Object.keys(E.SOLUTION_TYPES)));
 for(const t of rows){assert.equal(E.currentFlowNode(t).kind,'close');assert.equal(t.currentAssignee,t.owner);assert(!t.closed);assert(t.execution.steps.slice(0,-1).every(n=>n.done));if(t.proposal.refund+t.proposal.compensation)assert(t.payments.some(p=>p.result==='成功'));if(t.proposal.exchangeItems.length)assert(t.handlingRecords.some(r=>r.kind==='procurement'));}
});
test('existing four-state data upgrades without rewriting evidence or resetting completed examples',()=>{
 const original=fixture(),removed=E.WORKFLOW_EXAMPLES.filter(row=>/^P2[2-7]$/.test(row.suffix));original.tickets=original.tickets.filter(t=>!removed.some(row=>row.id===t.id));original.orders=original.orders.filter(o=>!removed.some(row=>'ORDER-'+row.suffix===o.id));original.workflowExamplesVersion=2;
 const closed=find(original,'P14');E.closeTicket(original,closed,closed.owner,{completed:true,note:'此前已经验收并结案'});
 for(const t of original.tickets)if(['审批中','待结案'].includes(t.state))t.state='处理中';original._revision=17;
 const mem=memory();mem.setItem(Store.KEY,JSON.stringify(original));const store=Store.createStore(mem,E,C),s=store.load();assert.equal(s._revision,18);assert.equal(s.workflowExamplesVersion,7);assert.equal(s.tickets.length,76+E.EXTERNAL_APPROVAL_EXAMPLES.length);assert.equal(find(s,'P14').state,'已结案');assert.equal(find(s,'P06').state,'审批中');assert.equal(find(s,'P15').state,'待结案');
 for(const t of original.tickets){const {state:before,proposal:oldPlan,...old}=t,{state:after,proposal:currentPlan,...current}=s.approvalPresentationBackup?.tickets[t.id]||s.externalApprovalSampleBackup?.find(row=>row.id===t.id)||s.tickets.find(row=>row.id===t.id);assert.deepEqual(current,old);assert.deepEqual(s.solutionDetailsBackup?.proposals[t.id]||currentPlan,oldPlan);}
 assert.deepEqual(s.externalApprovalBackup.rules,original.configuration.ruleScenes);assert.equal(s.configuration.revision,original.configuration.revision+1);for(const [key,value] of Object.entries(original.configuration))if(!['ruleScenes','sceneHistory','sceneRevision','revision'].includes(key))assert.deepEqual(s.configuration[key],value,key);assert.deepEqual(store.load(),s);
});
