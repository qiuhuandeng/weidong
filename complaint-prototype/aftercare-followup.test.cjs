'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration');
function fixture(level=2){
 const s=C.initialize(E.seed());
 if(level===5){const r=C.Rules.newScene(s.configuration);r.level=5;r.name='五级紧急客诉';r.enabled=true;s.configuration=C.Rules.saveScene(s.configuration,'manager',r,s.configuration.sceneRevision);}
 const t=E.create(s,'chen',{name:'林女士',phone:'13800001002',store:'上海徐汇店',order:'O2',channel:'微动',title:'售后沟通处理',description:level===5?'客户纠纷升级，警方到店协调，请售后经理介入。':'客户申请未使用项目退款'});
 assert(E.isAftercareStage(s,t));return {s,t,a:t.owner};
}
const input=result=>({result,method:'电话',connected:true,content:'已与客户沟通护理安排及本次处理事项',files:[{name:'沟通记录.txt',data:'data:text/plain,contact'}]});
test('specialist and manager can save first effective contact and close in one submission',()=>{
 for(const level of [2,5]){
  const {s,t,a}=fixture(level),deadline=t.deadline;E.follow(s,t,a,input('resolved'));
  assert.equal(t.state,'已结案');assert.equal(t.closure.kind,'sales');assert.equal(t.closure.note,input('resolved').content);assert(t.firstContact);assert.equal(t.deadline,deadline);assert.equal(t.proposal,null);assert.equal(t.approval,null);assert.deepEqual(E.taskPeople(s,t),[]);assert.equal(t.attachments.length,1);
  assert(t.logs.some(r=>r.title==='有效联系 / 跟进'&&r.body.includes('本次处理结果：沟通已解决，直接结案')));assert.equal(E.nodeTiming(t).endedAt,t.closed);
  const before=E.clone(s);assert.throws(()=>E.follow(s,t,a,input('resolved')));assert.deepEqual(E.clone(s),before);
 }
});
test('save-and-plan retains the aftercare node until a solution is actually confirmed',()=>{
 const {s,t,a}=fixture();E.follow(s,t,a,{...input('plan'),next:'2026-10-09T10:00'});
 assert.equal(t.state,'处理中');assert.equal(t.owner,a);assert.equal(t.currentAssignee,a);assert.equal(t.nextFollow,'2026-10-09T10:00');assert.equal(t.proposal,null);assert.equal(t.approval,null);assert(!t.execution);assert(!t.closed);assert(E.isAftercareStage(s,t));
 assert(t.logs.some(r=>r.body.includes('本次处理结果：需继续跟进，填写方案')));
 const clock=E.clone(t.nodeTiming),due=t.taskDeadline,whole=t.deadline,first=t.firstContact;
 for(let i=0;i<2;i++)E.follow(s,t,a,{...input('plan'),content:'后续第 '+(i+1)+' 次联系，仍需协商'});
 assert.deepEqual(t.nodeTiming,clock);assert.equal(t.taskDeadline,due);assert.equal(t.deadline,whole);assert.equal(t.firstContact,first);assert(!t.execution);
 const saved=E.clone(s),loaded=saved.tickets.find(x=>x.id===t.id);E.prepareTickets(saved);assert.equal(loaded.phase,'处理中');assert.equal(loaded.proposal,null);assert.equal(loaded.taskDeadline,due);
 E.confirmSolution(s,t,a,{typeKey:'service',content:'已确认后续服务安排',refund:0,compensation:0});assert.equal(t.state,'待结案');assert(t.execution.steps[0].done);
});
test('an unanswered contact can be recorded without fabricating effective contact or completing the node',()=>{
 const {s,t,a}=fixture(),due=t.taskDeadline;E.follow(s,t,a,{...input('plan'),connected:false,content:'客户暂未接听，继续联系'});
 assert.equal(t.firstContact,null);assert.equal(t.taskDeadline,due);assert.equal(t.state,'处理中');assert(!t.execution);assert.equal(t.proposal,null);
 assert.throws(()=>E.confirmSolution(s,t,a,{typeKey:'service',content:'尚未有效联系'}),/联系/);
 const before=E.clone(s);assert.throws(()=>E.follow(s,t,a,{...input('resolved'),connected:false}),/有效联系/);assert.deepEqual(E.clone(s),before);
});
test('store handoff followed by aftercare resolution preserves the original contact and both communications',()=>{
 const {s,t}=fixture(); // Create a separate store-first ticket under the same rule.
 const store=E.create(s,'chen',{name:t.name,phone:t.phone,store:t.store,order:t.order,channel:'400电话',title:'门店转售后',description:'客户申请退款'});
 E.follow(s,store,store.currentAssignee,{...input('unresolved'),content:'门店无法解决，转售后'});const first=store.firstContact;
 E.follow(s,store,store.owner,{...input('resolved'),content:'售后解释后客户理解，问题已解决'});
 assert.equal(store.firstContact,first);assert(store.aftercareContactAt);assert.equal(store.closure.kind,'sales');assert.equal(store.state,'已结案');assert.equal(store.storeIntake.result,'unresolved');assert.equal(store.logs.filter(r=>r.title==='有效联系 / 跟进').length,2);
});
test('missing outcomes, unauthorized staff and unresolved payment obligations cannot partially save a closing follow-up',()=>{
 const {s,t,a}=fixture();
 for(const data of [{...input('resolved'),content:' '},{...input('')},{...input('continue')},{...input('resolved'),connected:undefined}]){const before=E.clone(s);assert.throws(()=>E.follow(s,t,a,data));assert.deepEqual(E.clone(s),before);}
 let before=E.clone(s);assert.throws(()=>E.follow(s,t,'finance',input('resolved')));assert.deepEqual(E.clone(s),before);
 E.follow(s,t,a,input('plan'));E.confirmSolution(s,t,a,{typeKey:'refund',content:'确认退款',refund:10000,compensation:0,account:'原支付渠道'});
 before=E.clone(s);assert.throws(()=>E.follow(s,t,a,input('resolved')));assert.deepEqual(E.clone(s),before);
 E.approve(s,t,E.taskPeople(s,t)[0],false,'补充收款信息');before=E.clone(s);
 assert.throws(()=>E.follow(s,t,a,input('resolved')),/退款|赔偿|置换/);assert.deepEqual(E.clone(s),before);
});
