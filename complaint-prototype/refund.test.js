'use strict';
const assert=require('node:assert/strict'),E=require('./engine.js'),F=E.Refunds;
const NOW=new Date('2026-09-28T09:00:00+08:00').getTime();let checks=0;
function test(name,fn){fn();checks++;console.log('通过：'+name);}
function scenario(initial=E.seed(NOW),overrides={}){
  let s=initial;
  const created=E.apply(s,'intake',{type:'create',data:{customerId:'customer1',store:E.STORES[0],title:'退款流程验证',description:'申请未使用服务退款',demand:'申请退款',autoAssign:true,...overrides}},NOW);s=created.state;const id=created.caseId;
  const c=()=>s.cases.find(c=>c.id===id),task=()=>E.pending(c())[0];
  const cmd=(type,data={})=>({type,caseId:id,taskId:task()?.id,expectedRevision:c().revision,data});
  function run(type,data={},who){if(type==='confirm'&&!who)data={evidence:'负责人电话记录客户意见',...data};s=E.apply(s,who||task()?.assigneeId,cmd(type,data),NOW+60000).state;return c();}
  const proposal=(amount='600',more={})=>run('plan',{planType:'refund',orderId:'order-r1',refundAmount:amount,refundReason:'未使用服务',summary:'将未使用服务金额原路退回',deadline:NOW+48*E.HOUR,...more});
  const approve=()=>{while(c().stage==='approval')run('refundApproval',{decision:'approve',content:'核实订单金额，同意退款'});};
  const ready=(amount='600')=>{proposal(amount);approve();run('confirm',{version:c().plans.length,decision:'agree'});};
  const result=(result,more={},type='refundResult')=>run(type,{result,content:'模拟渠道核实依据',occurredAt:NOW+60000,reference:'DEMO-RECEIPT-1',...more});
  if(c().stage==='unassigned')run('assign',{assigneeId:'manager',reason:'主管承接'});
  run('accept');run('contact',{result:'connected',content:'确认订单及退款诉求'});
  return {c,task,run,cmd,proposal,approve,ready,result,id,get s(){return s;}};
}
test('600元完整退款闭环：主管、财务、客户确认、执行成功、独立回访',()=>{
  const x=scenario();x.proposal();assert.equal(x.task().assigneeId,'manager');assert.equal(x.c().plans[0].customerReleasedAt,undefined);
  assert(!x.c().records.some(r=>r.public&&r.title.includes('退款方案')));
  x.run('refundApproval',{decision:'approve',content:'核实通过'});assert.equal(x.task().assigneeId,'finance');
  x.approve();assert(x.c().plans[0].customerReleasedAt);assert.equal(x.c().stage,'confirm');
  x.run('confirm',{version:1,decision:'agree'});assert.equal(x.task().kind,'refundExecute');
  x.run('refundStart');assert.equal(x.s.refundLedger.length,1);assert.equal(x.c().stage,'refund_check');
  x.result('success');assert.equal(x.c().stage,'visit');assert.equal(F.balance(x.s,'order-r1').refunded,80000);
  x.run('visit',{result:'resolved',score:5,content:'客户确认退款已到账，问题解决'});assert.equal(x.c().stage,'closed');
});
test('阈值500元只经财务，500.01元需要主管加签',()=>{
  const a=scenario();a.proposal('500');assert.deepEqual(a.c().plans[0].approvals.map(a=>a.assigneeId),['finance']);
  const b=scenario();b.proposal('500.01');assert.deepEqual(b.c().plans[0].approvals.map(a=>a.assigneeId),['manager','finance']);
});
test('金额精确到分，拒绝零、负数、科学计数法及多于两位小数',()=>{
  assert.equal(F.cents('0.29'),29);assert.equal(F.cents('1800.00'),180000);
  for(const n of ['0','-1','1e2','0.001','NaN'])assert.throws(()=>F.cents(n));
});
test('限制订单归属，扣除历史退款与跨工单占用，失败提交不改变状态',()=>{
  const a=scenario();assert.throws(()=>a.proposal('100',{orderId:'order-r2'}),/属于该客户/);
  assert.throws(()=>a.proposal('1800.01'),/超过/);a.proposal('1000');
  const b=scenario(a.s),before=JSON.stringify(b.s);assert.throws(()=>b.proposal('800.01'),/800.00/);assert.equal(JSON.stringify(b.s),before);
  b.proposal('800');assert.equal(F.balance(b.s,'order-r1').available,0);
});
test('越权与顺序校验：财务不能抢审主管节点，审批通过前不能确认或执行',()=>{
  const x=scenario();x.proposal();assert.throws(()=>x.run('refundApproval',{decision:'approve',content:'抢审'},'finance'),/不由您/);
  assert.throws(()=>x.run('confirm',{version:1,decision:'agree'},'customer1'));
  assert.throws(()=>x.run('refundStart',{},'finance'));assert.equal(x.s.refundLedger.length,0);
});
test('审批驳回释放额度，修订版本重新完整审批',()=>{
  const x=scenario();x.proposal();x.run('refundApproval',{decision:'reject',content:'需调整退款依据'});
  assert.equal(F.balance(x.s,'order-r1').reserved,0);assert.equal(x.c().stage,'plan');
  x.proposal('700');assert.equal(x.c().plans[1].version,2);assert.equal(x.c().plans[1].approvals[0].status,'pending');
});
test('客户异议释放额度并生成新方案待办',()=>{
  const x=scenario();x.proposal();x.approve();x.run('confirm',{version:1,decision:'disagree',reason:'金额需调整'});
  assert.equal(x.c().stage,'plan');assert.equal(F.balance(x.s,'order-r1').reserved,0);assert(x.c().plans[0].invalidatedAt);
});
test('撤回已确认方案取消财务待办，原确认失效，旧版本不能再用',()=>{
  const x=scenario();x.ready();const old=x.cmd('refundStart');x.run('reviseRefund',{content:'重新核对金额'},x.c().ownerId);
  assert(x.c().plans[0].confirmation.invalidatedAt);assert.equal(x.c().tasks.find(t=>t.id===old.taskId).status,'cancelled');
  assert.throws(()=>E.apply(x.s,'finance',{...old,expectedRevision:x.c().revision},NOW+60000));
  x.proposal('550');x.approve();assert.throws(()=>x.run('confirm',{version:1,decision:'agree'}),/方案已更新/);
});
test('重复点击及陈旧跨端任务不能重复发起退款',()=>{
  const x=scenario();x.ready();const command=x.cmd('refundStart');x.run('refundStart');
  assert.throws(()=>E.apply(x.s,'finance',command,NOW+60000),/已被更新/);
  assert.throws(()=>E.apply(x.s,'finance',{...command,expectedRevision:x.c().revision},NOW+60000),/已处理/);
  assert.equal(x.s.refundLedger.length,1);
});
test('结果待核实只能核查，重复待核实不重复派发，成功才进入回访',()=>{
  const x=scenario();x.ready();x.run('refundStart');x.result('unknown');const id=x.task().id;
  assert.equal(x.task().kind,'refundVerify');assert.throws(()=>x.run('refundRetry',{decision:'retry',content:'重试'}));
  assert.throws(()=>x.run('reviseRefund',{content:'修改'},x.c().ownerId),/不能修改/);
  x.result('unknown',{},'refundVerify');assert.equal(x.task().id,id);assert.equal(x.s.refundLedger.length,1);
  assert.equal(F.balance(x.s,'order-r1').reserved,60000);assert(!E.pending(x.c()).some(t=>t.kind==='visit'));
  x.result('success',{},'refundVerify');assert.equal(x.c().stage,'visit');assert.equal(x.s.refundLedger[0].events.length,3);
});
test('失败后重试保留旧记录，成功金额只计一次',()=>{
  const x=scenario();x.ready();x.run('refundStart');x.result('failed');assert.equal(F.balance(x.s,'order-r1').refunded,20000);
  x.run('refundRetry',{decision:'retry',content:'已核实失败，恢复后重试'});x.run('refundStart');x.result('success');
  assert.deepEqual(x.s.refundLedger.map(x=>x.status),['failed','success']);assert.equal(F.balance(x.s,'order-r1').refunded,80000);
});
test('失败退回修订释放占用并重新审批，原成功退款不得撤回',()=>{
  const x=scenario();x.ready();x.run('refundStart');x.result('failed');x.run('refundRetry',{decision:'revise',content:'需更正方案'});
  assert.equal(F.balance(x.s,'order-r1').reserved,0);x.ready('500');x.run('refundStart');x.result('success');
  assert.throws(()=>x.run('reviseRefund',{content:'再修改'},x.c().ownerId),/不能修改/);
});
test('成功必须有唯一凭证，拒绝重复凭证、未来时间和危险附件',()=>{
  const a=scenario();a.ready('300');a.run('refundStart');a.result('success');
  const b=scenario(a.s);b.ready('300');b.run('refundStart');
  assert.throws(()=>b.result('success',{reference:''}),/凭证编号/);assert.throws(()=>b.result('success'),/已用于其他退款/);
  assert.throws(()=>b.result('success',{reference:'SECOND',occurredAt:NOW+2*E.HOUR}),/结果时间/);
  assert.throws(()=>b.result('success',{reference:'SECOND',attachments:[{name:'bad',data:'data:text/html;base64,AAAA'}]}),/附件/);
  b.result('success',{reference:'SECOND'});assert.equal(F.balance(b.s,'order-r1').refunded,80000);
});
test('同人提交与审批使用独立替代审批人，保留受理时阈值与时限',()=>{
  const s=E.seed(NOW);s.rules.timing.approvalHours=3;s.rules.timing.refundHours=5;
  const x=scenario(s,{autoAssign:false});assert.equal(x.c().ownerId,'manager');
  x.s.rules.approval.refundManagerAbove=10000;x.proposal('600');assert.deepEqual(x.c().plans[0].approvals.map(a=>a.assigneeId),['director','finance']);
  assert.equal(x.task().dueAt,NOW+60000+3*E.HOUR);x.approve();x.run('confirm',{version:1,decision:'agree'});assert.equal(x.task().dueAt,NOW+60000+5*E.HOUR);
});
test('旧浏览器数据迁移保留原工单，退款示例重复加入保持幂等',()=>{
  const s=E.demo(NOW);delete s.orders;delete s.refundLedger;
  const migrated=E.normalize(s);assert.equal(migrated.cases.length,6);
  const ready=E.addRefundSamples(migrated,NOW);assert.equal(ready.cases.length,9);
  assert.deepEqual(E.addRefundSamples(ready,NOW),ready);assert.equal(ready.refundLedger[0].status,'unknown');
});
console.log(`完成 ${checks} 项退款规则验证。`);
