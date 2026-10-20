'use strict';
const assert = require('node:assert/strict');
const E = require('./engine.js');
const NOW = new Date('2026-09-28T09:00:00+08:00').getTime();
let checks = 0;
function test(name, fn) { fn(); checks++; console.log('通过：' + name); }
function scenario(manual = false) {
  let s = E.seed(NOW), id;
  const r = E.apply(s, 'intake', { type:'create', data:{customerId:'customer1',store:E.STORES[0],title:'到店等候，希望改善预约',description:'示例客户反馈到店等候时间过长，希望道歉并调整预约。',autoAssign:!manual}},NOW);
  s=r.state;id=r.caseId;
  const c=()=>s.cases.find(c=>c.id===id);
  const task=kind=>E.pending(c()).find(t=>!kind||t.kind===kind);
  const command=(type,data={},who,kind)=>({type,caseId:id,expectedRevision:c().revision,taskId:task(kind)?.id,data});
  function run(type,data={},who,kind) { if(type==='confirm'&&!who)data={evidence:'负责人电话核实并记录客户意见',...data};const cmd=command(type,data,who,kind);s=E.apply(s,who||task(kind)?.assigneeId,cmd,NOW+60000).state;return c(); }
  function plan(items=1) { run('plan',{summary:'店长道歉，并按客户意愿调整预约。',deadline:NOW+8*E.HOUR,items:Array.from({length:items},(_,i)=>({type:i?'预约调整':'解释道歉',description:i?'重新安排客户认可的到店时间':'联系客户说明情况并致歉',assigneeId:'store1'}))}); }
  function toPlan() {run('accept');run('contact',{result:'connected',content:'已与客户确认诉求，客户希望道歉并重新安排。'});}
  function toService(items=1) {toPlan();plan(items);run('confirm',{version:c().plans.length,decision:'agree'});}
  function toVisit() {toService();run('service',{content:'已完成解释致歉，客户确认知悉处理安排。'});}
  return {c,task,command,run,plan,toPlan,toService,toVisit,get state(){return s;},get id(){return id;}};
}

test('普通投诉完整闭环：受理、接单、联系、方案、客户确认、履行、回访、结案',()=>{
  const x=scenario();assert.equal(x.c().stage,'accept');assert(x.state.notices.some(n=>n.recipientId==='store1'));
  x.toVisit();assert.equal(x.c().stage,'visit');assert.equal(x.task().assigneeId,'callback');
  x.run('visit',{result:'resolved',score:5,content:'客户确认问题解决，服务安排已履行。'});
  assert.equal(x.c().stage,'closed');assert.equal(E.pending(x.c()).length,0);assert.equal(x.c().visits[0].score,5);assert(x.c().closedAt);assert(x.state.notices.some(n=>n.title==='工单已结案'));
});
test('未接通保持处理中，不计为有效联系，保留首联任务与原期限',()=>{
  const x=scenario();x.run('accept');const old=x.task().id;
  x.run('contact',{result:'unreachable',content:'本次未接通。',retryAt:NOW+E.HOUR});
  assert.equal(x.c().stage,'contact');assert(x.c().firstAttemptAt);assert.equal(x.c().firstConnectedAt,undefined);assert.equal(x.task().id,old);assert.equal(x.task().dueAt,x.c().firstContactDue);assert.equal(x.task().retryAt,NOW+E.HOUR);
});
test('客户不同意后修订方案，旧版本确认不能用于新版本',()=>{
  const x=scenario();x.toPlan();x.plan();x.run('confirm',{version:1,decision:'disagree',reason:'希望调整预约时间。'});
  assert.equal(x.c().stage,'plan');x.plan();assert.equal(x.c().plans.length,2);
  assert.throws(()=>x.run('confirm',{version:1,decision:'agree'}),/方案已更新/);
  assert.equal(x.c().stage,'confirm');x.run('confirm',{version:2,decision:'agree'});assert.equal(x.c().stage,'service');
});
test('多项履行：第一项完成不能生成回访，全部完成才可以',()=>{
  const x=scenario();x.toService(2);assert.equal(E.pending(x.c()).length,2);
  x.run('service',{content:'解释与道歉已完成。'});assert.equal(x.c().stage,'service');assert.equal(E.pending(x.c()).length,1);assert(!E.pending(x.c()).some(t=>t.kind==='visit'));
  x.run('service',{content:'预约调整已完成并确认。'});assert.equal(x.c().stage,'visit');
});
test('回访未解决：保留旧履行记录，重新处理后由400回访直接结案',()=>{
  const x=scenario();x.toVisit();x.run('visit',{result:'unresolved',score:2,content:'客户表示仍需进一步调整。'});
  assert.equal(x.c().round,2);assert.equal(x.c().stage,'plan');assert.equal(x.c().plans[0].items[0].status,'done');
  x.plan();x.run('confirm',{version:2,decision:'agree'});x.run('service',{content:'已重新安排并完成约定。'});
  x.run('visit',{result:'resolved',score:4,content:'本轮客户确认问题已解决。'});assert.equal(x.c().stage,'closed');
  assert(!E.pending(x.c()).some(t=>t.kind==='quality')); assert.equal(x.c().stage,'closed');assert.equal(x.c().visits.length,2);
});
test('回访未接通不能结案或生成虚假满意度',()=>{
  const x=scenario();x.toVisit();x.run('visit',{result:'unreachable',content:'未接通，已安排再次回访。',retryAt:NOW+3*E.HOUR});
  assert.equal(x.c().stage,'visit');assert.equal(x.c().visits.length,0);assert.equal(x.c().closedAt,undefined);
});
test('实际低分保留：已解决不自动算作再次投诉',()=>{
  const x=scenario();x.toVisit();x.run('visit',{result:'resolved',score:2,content:'问题已解决，但客户对最初等待体验不满意。'});
  assert.equal(x.c().stage,'closed');assert.equal(x.c().round,1);assert.equal(x.c().visits[0].score,2);
});
test('越权检查：其他客户、其他门店不能接单，回访员不能改方案',()=>{
  const x=scenario();assert.equal(E.canView(x.state,'customer2',x.c()),false);assert.equal(E.canView(x.state,'store2',x.c()),false);
  assert.throws(()=>x.run('accept',{},'customer2'),/无权/);assert.throws(()=>x.run('accept',{},'store2'),/无权/);
  x.toPlan();assert.throws(()=>x.run('plan',{summary:'越权'},'callback'),/无权/);assert.equal(x.c().stage,'plan');
});
test('重复提交与跨端陈旧版本不能产生重复任务',()=>{
  const x=scenario();const cmd=x.command('accept');x.run('accept');const count=x.c().tasks.length;
  assert.throws(()=>E.apply(x.state,'store1',cmd,NOW+120000),/已被更新/);assert.equal(x.c().tasks.length,count);
  const freshOld={...cmd,expectedRevision:x.c().revision};assert.throws(()=>E.apply(x.state,'store1',freshOld,NOW+120000),/已处理或已转派/);
});
test('改派取消旧任务，保留首次联系截止时间',()=>{
  const x=scenario();const firstDue=x.c().firstContactDue,old=x.task().id;
  x.run('assign',{assigneeId:'aftercare',reason:'店长暂不可接，指定售后承接。'},'manager');
  assert.equal(x.c().firstContactDue,firstDue);assert.equal(x.c().tasks.find(t=>t.id===old).status,'transferred');assert.equal(x.task().assigneeId,'aftercare');
  assert.throws(()=>E.apply(x.state,'store1',{type:'accept',caseId:x.id,expectedRevision:x.c().revision,taskId:old},NOW),/已处理或已转派/);
});
test('人工派单路径有主管兜底任务，分配后进入接单',()=>{
  const x=scenario(true);assert.equal(x.c().stage,'unassigned');assert.equal(x.task().assigneeId,'manager');
  x.run('assign',{assigneeId:'store1',reason:'分配本店店长处理。'},'manager');assert.equal(x.c().stage,'accept');
});
test('员工记录电话确认需要明确依据，客户确认前不存在履行任务',()=>{
  const x=scenario();x.toPlan();x.plan();assert(!E.pending(x.c()).some(t=>t.kind==='service'));
  assert.throws(()=>x.run('confirm',{version:1,decision:'agree'},'store1'),/电话确认依据/);
  x.run('confirm',{version:1,decision:'agree',evidence:'09:05电话沟通，客户明确同意该版方案。'},'store1');assert.equal(x.c().plans[0].confirmation.method,'电话记录');
});
test('客户提交的工单进入受理范围，客户不能伪造他人归属',()=>{
  const s=E.seed(NOW),r=E.apply(s,'customer1',{type:'create',data:{customerId:'customer2',store:E.STORES[0],title:'客户自主反馈',description:'示例反馈内容。'}},NOW);
  assert.equal(r.state.cases[0].customerId,'customer1');assert.equal(E.canView(r.state,'intake',r.state.cases[0]),true);
});
test('空结果和不安全附件阻止提交，并且不改变原工单',()=>{
  const x=scenario();x.toService();const old=JSON.stringify(x.state);
  assert.throws(()=>x.run('service',{content:'  '}),/实际履行结果/);
  assert.throws(()=>x.run('service',{content:'完成',attachments:[{name:'bad.html',data:'data:text/html;base64,AAAA'}]}),/附件/);
  assert.equal(JSON.stringify(x.state),old);
});
test('刷新所用JSON可完整还原工单、任务、通知和处理历史',()=>{
  const x=scenario();x.toVisit();const restored=JSON.parse(JSON.stringify(x.state));assert.deepEqual(restored,x.state);assert.equal(restored.cases[0].stage,'visit');assert.equal(E.pending(restored.cases[0])[0].assigneeId,'callback');
});
test('推进时间产生接单超时提醒，主管同步收到且重复推进不重复发送',()=>{
  const x=scenario(), s=E.advance(x.state,2,NOW);
  assert(s.notices.some(n=>n.recipientId==='store1'&&n.title.includes('办理超时提醒')));
  assert(s.notices.some(n=>n.recipientId==='manager'&&n.title.includes('接单超时')));
  assert.equal(E.advance(s,2,NOW).notices.length,s.notices.length);
  assert.equal(x.state.offset,0);
});
test('已经办理完成的任务不会产生超时提醒',()=>{
  const x=scenario();x.toVisit();x.run('visit',{result:'resolved',score:5,content:'已确认解决'});
  assert.equal(E.advance(x.state,48,NOW).notices.length,x.state.notices.length);
});
console.log(`完成 ${checks} 项业务规则验证。`);
