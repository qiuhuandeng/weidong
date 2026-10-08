'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration');
function fixture(level=2){
 const s=C.initialize(E.seed());
 if(level===5){const rule=C.Rules.newScene(s.configuration);rule.level=5;rule.name="五级紧急客诉";rule.enabled=true;s.configuration=C.Rules.saveScene(s.configuration,"manager",rule,s.configuration.sceneRevision);}
 const t=E.create(s,'chen',{name:'林女士',phone:'13800001002',store:'上海徐汇店',order:'O2',channel:'400电话',title:'门店沟通处理',description:level===5?'客户纠纷升级，警方到店协调，请售后经理介入。':'客户申请未使用项目退款'});
 assert.equal(t.level,level);assert(E.isStoreIntake(t));return {s,t,a:t.currentAssignee};
}
const handle=(s,t,a,result,content='门店已与客户沟通本次处理事项',connected)=>E.handleStoreIntake(s,t,a,{result,content,connected});
test('one store submission records communication and closes without prior follow-up or a solution',()=>{
 const {s,t,a}=fixture(),deadline=t.deadline,count=t.logs.length;
 handle(s,t,a,'resolved','客户已理解服务安排，安抚后问题解决');
 assert.equal(t.state,'已结案');assert.equal(t.storeIntake.result,'resolved');assert.equal(t.closure.note,'客户已理解服务安排，安抚后问题解决');assert.equal(t.proposal,null);assert.equal(t.owner,'');assert.equal(t.deadline,deadline);assert(t.firstContact);assert.deepEqual(E.taskPeople(s,t),[]);
 assert.equal(t.logs.length,count+2);assert.equal(t.logs[0].title,'门店处理：已解决并结案');assert.equal(E.nodeTiming(t).endedAt,t.closed);
 const before=E.clone(s);assert.throws(()=>handle(s,t,a,'resolved'));assert.deepEqual(E.clone(s),before);
});
test('one unresolved submission routes grades 1–4 to a specialist and grade 5 to a manager',()=>{
 for(const level of [2,5]){
  const {s,t,a}=fixture(level),deadline=t.deadline,clock=t.nodeTiming.id;
  handle(s,t,a,'unresolved','门店无法处理退款，请售后继续沟通');
  assert.equal(t.storeIntake.result,'unresolved');assert.equal(t.storeIntake.note,'门店无法处理退款，请售后继续沟通');assert.equal(t.state,'处理中');assert.equal(t.owner,level===5?'manager':'aftercare');assert.equal(t.deadline,deadline);assert.equal(t.logs.filter(x=>x.title==='门店处理：未解决，已转售后').length,1);
  assert.equal(t.nodeTimingHistory.filter(x=>x.id===clock).length,1);assert.equal(t.storeIntake.contactedAt,t.firstContact);assert(!t.aftercareContactAt);
  assert.throws(()=>E.confirmSolution(s,t,t.owner,{typeKey:'service',content:'售后尚未联系'}),/售后先记录/);
  const first=t.firstContact;E.follow(s,t,t.owner,{connected:true,content:'售后重新联系客户'});assert.equal(t.firstContact,first);assert(t.aftercareContactAt);
 }
});
test('unanswered continuation remains actionable and preserves first-contact, node and total clocks',()=>{
 const {s,t,a}=fixture(),due=t.taskDeadline,total=t.deadline,clock=E.clone(t.nodeTiming),active=t.activeNode;
 handle(s,t,a,'continue','电话无人接听，将再次联系',false);
 assert.equal(t.state,'处理中');assert(E.isStoreIntake(t));assert.equal(t.currentAssignee,a);assert.equal(t.firstContact,null);assert(!t.storeIntake.contactedAt);assert(!t.storeIntake.completedAt);assert.equal(t.activeNode,active);assert.equal(t.taskDeadline,due);assert.equal(t.deadline,total);assert.deepEqual(t.nodeTiming,clock);assert.equal(t.logs[0].title,'联系尝试');assert.match(t.logs[0].body,/处理结果：需继续跟进/);assert.match(t.logs[0].body,/未接通/);
 E.prepareTickets(s);assert.equal(t.state,'处理中');assert.equal(t.taskDeadline,due);
});
test('effective continuation starts handling without resetting time on subsequent communications',()=>{
 const {s,t,a}=fixture(),assigned=t.assignedAt,total=t.deadline,clock=t.nodeTiming.id;
 handle(s,t,a,'continue','客户需要考虑，已约定后续联系',true);
 assert(t.firstContact);assert.equal(t.taskDeadline,assigned+t.storeIntake.node.hours*E.H);assert.equal(t.state,'处理中');assert.equal(t.storeIntake.completedAt,undefined);
 const first=t.firstContact; t.taskDeadline-=E.H;const adjustedDue=t.taskDeadline;
 handle(s,t,a,'continue','再次联系未接通',false);handle(s,t,a,'continue','仍在等待客户确认',true);
 assert.equal(t.taskDeadline,adjustedDue);assert.equal(t.firstContact,first);assert.equal(t.nodeTiming.id,clock);assert.equal(t.assignedAt,assigned);assert.equal(t.deadline,total);assert(!t.nodeTimingHistory?.length);
 handle(s,t,a,'resolved','客户确认已解决');assert.equal(t.firstContact,first);assert.equal(t.state,'已结案');
});
test('missing content, missing outcome, unknown outcome and missing contact result save nothing',()=>{
 const {s,t,a}=fixture(),before=E.clone(s);
 for(const data of [{result:'resolved',content:'  '},{content:'已联系'},{content:'已联系',result:'invalid'},{content:'未接通',result:'continue'},{content:'未接通',result:'resolved',connected:false},{content:'未接通',result:'unresolved',connected:false}]){
  assert.throws(()=>E.handleStoreIntake(s,t,a,data));assert.deepEqual(E.clone(s),before);
 }
});
test('non-assignee, suspended, pending and invalid route failures do not leave partial follow-up records',()=>{
 for(const mode of ['actor','suspended','pending','route','workflow']){
  const {s,t,a}=fixture();if(mode==='suspended')t.suspension={at:Date.now()};if(mode==='pending')t.pendingAssignment={mode:'entry-node'};if(mode==='route')t.flow.config.ticketFlow.nodes=[];if(mode==='workflow')t.workflowIssue={reason:'配置异常'};
  const before=E.clone(s);assert.throws(()=>handle(s,t,mode==='actor'?'store1':a,'unresolved'));assert.deepEqual(E.clone(s),before,mode);
 }
});
test('missing aftercare staffing retains the submitted handoff for dispatch instead of leaving store work open',()=>{
 const {s,t,a}=fixture();delete t.flow.assignment.nodes.contact; // Simulate unavailable downstream configuration.
 handle(s,t,a,'unresolved');assert.equal(t.storeIntake.result,'unresolved');assert(!E.isStoreIntake(t));assert.equal(t.pendingAssignment.mode,'configuration');assert.equal(t.currentAssignee,'manager');assert(t.logs.some(x=>x.title==='门店处理：未解决，已转售后'));
});

test('shared follow-up saves method, communication, outcome, next contact and attachments together',()=>{
 const {s,t,a}=fixture(),files=[{name:'沟通附件.txt',data:'data:text/plain,contact'}];
 E.follow(s,t,a,{result:'continue',method:'企微',connected:true,content:'客户已收到说明，明日再确认',next:'2026-10-09T10:00',files});
 assert.equal(t.logs[0].title,'有效联系 / 跟进');assert.match(t.logs[0].body,/企微 · 已接通/);assert.match(t.logs[0].body,/客户已收到说明/);assert.match(t.logs[0].body,/处理结果：需继续跟进/);assert.match(t.logs[0].body,/下次跟进：2026-10-09T10:00/);assert.deepEqual(t.attachments,files);assert.notEqual(t.attachments[0],files[0]);
 E.follow(s,t,a,{result:'unresolved',method:'电话',connected:true,content:'客户需要售后进一步协调'});
 assert.equal(t.storeIntake.result,'unresolved');assert.equal(t.nextFollow,'');assert.equal(t.logs.filter(r=>r.title==='有效联系 / 跟进').length,2);assert.equal(t.logs.filter(r=>r.title==='门店处理：未解决，已转售后').length,1);
});
