'use strict';
const assert=require('node:assert/strict'),E=require('./engine.js'),A=require('./access.js');
const NOW=Date.parse('2026-09-29T09:00:00+08:00');let checks=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
function scenario(){
  let s=E.seed(NOW);
  const r=E.apply(s,'intake',{type:'create',data:{customerId:'customer1',store:E.STORES[0],title:'结构验收退款',description:'未使用服务申请退款',autoAssign:true}},NOW);s=r.state;const id=r.caseId;
  const c=()=>s.cases.find(c=>c.id===id),t=()=>E.pending(c())[0];
  function run(type,data={},actor=t()?.assigneeId){s=E.apply(s,actor,{type,caseId:id,taskId:t()?.id,expectedRevision:c().revision,data},NOW+60000).state;return c();}
  const propose=()=>run('plan',{planType:'refund',orderId:'order-r1',refundAmount:'600',refundReason:'未使用服务',summary:'原路退回未使用服务金额',deadline:NOW+48*E.HOUR});
  run('accept');run('contact',{result:'connected',content:'已核实订单及客户诉求'});propose();
  const approve=()=>{while(c().stage==='approval')run('refundApproval',{decision:'approve',content:'已核实，同意'});};
  return {c,t,run,propose,approve,get s(){return s;}};
}
test('PC配置仅主管可进入；财务与审批身份不进入员工工作区',()=>{
  assert(A.canConfigure('manager'));for(const id of ['intake','store1','finance','director','quality'])assert(!A.canConfigure(id));
  assert(A.canWork('store1'));assert(A.canWork('aftercare'));for(const id of ['finance','director','quality','customer1'])assert(!A.canWork(id));
});
test('独立审批链接校验具体工单、任务及办理人',()=>{
  const x=scenario(),t=x.t();assert(A.taskAccess(x.s,'manager',x.c().id,t.id).actionable);
  assert(!A.taskAccess(x.s,'finance',x.c().id,t.id).allowed);assert(!A.taskAccess(x.s,'manager','missing',t.id).allowed);assert(!A.taskAccess(x.s,'manager',x.c().id,'missing').allowed);
});
test('旧审批链接完成后只读，不会自动代入后序财务任务',()=>{
  const x=scenario(),t=x.t();x.run('refundApproval',{decision:'approve',content:'同意'});
  const gate=A.taskAccess(x.s,'manager',x.c().id,t.id);assert(gate.done);assert(!gate.actionable);assert.equal(gate.t.id,t.id);assert.equal(x.t().assigneeId,'finance');
});
test('撤回重提后旧链接保留原方案版本并禁止办理',()=>{
  const x=scenario(),t=x.t();x.run('reviseRefund',{content:'重新核对方案'},'store1');x.propose();
  const gate=A.taskAccess(x.s,'manager',x.c().id,t.id);assert(gate.invalid);assert(!gate.actionable);assert.equal(gate.p.version,1);assert.equal(x.t().version,2);
});
test('员工跟进与审批通知进入不同页面；品控替补回访可独立办理',()=>{
  const x=scenario();assert(A.taskURL('manager',x.c(),x.t()).includes('view=approval'));x.approve();
  assert(A.taskURL('store1',x.c(),x.t()).includes('view=staff'));assert(!A.isolated(x.t()));assert(A.isolated({kind:'visit',assigneeId:'quality'}));
});
test('客户意见任务交给负责人，客户账号不能代办且必须留依据',()=>{
  const x=scenario();x.approve();assert.equal(x.t().assigneeId,x.c().ownerId);
  assert.throws(()=>x.run('confirm',{version:1,decision:'agree'},'customer1'),/负责人/);
  assert.throws(()=>x.run('confirm',{version:1,decision:'agree'}),/依据/);assert.equal(x.c().stage,'confirm');
});
test('客户意见的沟通方式、依据和附件进入同一工单',()=>{
  const x=scenario();x.approve();const files=[{name:'沟通凭证.png',data:'data:image/png;base64,AAAA'}];
  x.run('confirm',{version:1,decision:'agree',method:'企微沟通',evidence:'客户明确同意当前退款方案',attachments:files});
  const p=x.c().plans[0];assert.equal(p.confirmation.method,'企微沟通');assert.deepEqual(p.confirmation.attachments,files);
  assert(x.c().records.some(r=>r.title==='客户意见已记录'&&r.body.includes('客户明确同意')&&r.attachments.length===1));assert.equal(x.t().kind,'refundExecute');
});
test('旧客户待办迁移保留任务、方案和期限，重复迁移不重复通知',()=>{
  const x=scenario();x.approve();const s=JSON.parse(JSON.stringify(x.s)),c=s.cases[0],t=E.pending(c)[0];t.assigneeId=c.customerId;delete s.workflowVersion;
  const before={id:t.id,due:t.dueAt,version:t.version,records:c.records.length};E.normalize(s);
  assert.equal(t.assigneeId,c.ownerId);assert.equal(t.id,before.id);assert.equal(t.dueAt,before.due);assert.equal(t.version,before.version);assert.equal(c.records.length,before.records);
  const snapshot=JSON.stringify(s);E.normalize(s);assert.equal(JSON.stringify(s),snapshot);
});
test('列表范围区分我待办、我创建、我参与与主管全部',()=>{
  const x=scenario(),c=x.c();assert(A.inScope(c,'manager','mine'));assert(!A.inScope(c,'finance','mine'));assert(A.inScope(c,'intake','created'));assert(A.inScope(c,'store1','involved'));assert(A.inScope(c,'manager','all'));assert(!A.inScope(c,'store1','all'));
});
test('独立退款结果进入核查，再回到员工回访并结案',()=>{
  const x=scenario();x.approve();x.run('confirm',{version:1,decision:'agree',evidence:'负责人电话确认客户接受'});const start=x.t();x.run('refundStart');
  assert(!A.taskAccess(x.s,'finance',x.c().id,start.id).actionable);
  x.run('refundResult',{result:'unknown',content:'渠道结果待查',occurredAt:NOW+60000});assert.equal(x.t().kind,'refundVerify');assert(A.isolated(x.t()));
  x.run('refundVerify',{result:'success',content:'渠道已核实成功',reference:'STRUCTURE-001',occurredAt:NOW+60000});assert.equal(x.t().kind,'visit');assert(!A.isolated(x.t()));
  x.run('visit',{result:'resolved',score:5,content:'客户确认到账，问题解决'});assert.equal(x.c().stage,'closed');assert.equal(E.pending(x.c()).length,0);
});
console.log(`完成 ${checks} 项产品结构与跨端流程验证。`);
