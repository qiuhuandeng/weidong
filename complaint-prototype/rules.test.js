'use strict';
const assert=require('node:assert/strict');
const E=require('./engine.js');
const NOW=new Date('2026-09-28T10:00:00+08:00').getTime();
const copy=x=>JSON.parse(JSON.stringify(x));
let checks=0;
function test(label,fn){fn();checks++;console.log('通过：'+label);}
function update(s,edit){const r=copy(s.rules);edit(r);return E.Rules.save(s,'manager',r,s.rules.version,'验证配置生效范围',NOW);}
function create(s,data={}){return E.apply(s,'intake',{type:'create',data:{customerId:'customer1',store:E.STORES[0],title:'到店等待反馈',description:'希望解释原因',...data}},NOW).state;}
function flow(edit=()=>{}){
  let s=E.seed(NOW),r=copy(s.rules);edit(r);
  if(E.Rules.changes(s.rules,r).length)s=E.Rules.save(s,'manager',r,1,'测试流程规则',NOW);
  s=create(s);const id=s.cases[0].id,c=()=>s.cases.find(c=>c.id===id);
  function run(type,data={}){if(type==='confirm')data={evidence:'负责人电话记录客户意见',...data};const t=E.pending(c())[0];s=E.apply(s,t.assigneeId,{type,caseId:id,taskId:t.id,expectedRevision:c().revision,data},NOW+60000).state;}
  function toVisit(){run('accept');run('contact',{result:'connected',content:'诉求已核实'});run('plan',{summary:'联系解释并致歉',deadline:NOW+8*E.HOUR,items:[{type:'解释道歉',description:'店长解释并致歉',assigneeId:'store1'}]});run('confirm',{version:1,decision:'agree'});run('service',{content:'已完成解释，客户接受'});}
  return {c,run,toVisit,get state(){return s;}};
}
test('旧数据迁移保留原时限，旧工单补上V1规则而非当前新规则',()=>{
  const s=create(E.seed(NOW)),oldDue=s.cases[0].firstContactDue;delete s.cases[0].rulesSnapshot;
  s.rules.version=3;s.rules.timing.firstContactHours=6;
  E.Rules.normalize(s);assert.equal(s.cases[0].rulesSnapshot.version,1);assert.equal(s.cases[0].rulesSnapshot.timing.firstContactHours,2);assert.equal(s.cases[0].firstContactDue,oldDue);
});
test('保存新规则只影响新工单，旧工单及后续任务沿用受理时版本',()=>{
  const before=create(E.seed(NOW)),old=copy(before.cases[0]);
  let s=update(before,r=>{r.timing.firstContactHours=3;r.timing.acceptMinutes=45;r.timing.planHours=5;});
  assert.deepEqual(s.cases[0],old);assert.equal(before.rules.version,1);
  const t=E.pending(s.cases[0])[0];s=E.apply(s,'store1',{type:'accept',caseId:old.id,taskId:t.id,expectedRevision:1},NOW+60000).state;
  assert.equal(E.pending(s.cases[0])[0].dueAt,old.firstContactDue);
  s=create(s);assert.equal(s.cases[0].rulesSnapshot.version,2);assert.equal(s.cases[0].firstContactDue,NOW+3*E.HOUR);assert.equal(E.pending(s.cases[0])[0].dueAt,NOW+45*60000);
  assert.equal(s.ruleHistory[0].before.timing.firstContactHours,2);assert.equal(s.ruleHistory[0].after.timing.firstContactHours,3);
});
test('未授权身份与过期规则版本不能覆盖配置',()=>{
  const s=E.seed(NOW),r=copy(s.rules);r.timing.firstContactHours=3;
  assert.throws(()=>E.Rules.save(s,'intake',r,1,'越权',NOW),/只有授权/);
  const saved=E.Rules.save(s,'manager',r,1,'调整时限',NOW);
  assert.throws(()=>E.Rules.save(saved,'manager',r,1,'旧窗口覆盖',NOW),/其他窗口更新/);
});
test('无变更、缺少说明及无效时限拒绝保存且不污染当前配置',()=>{
  const s=E.seed(NOW),old=JSON.stringify(s);
  assert.throws(()=>E.Rules.save(s,'manager',s.rules,1,'无变更',NOW),/没有需要/);
  const r=copy(s.rules);r.timing.firstContactHours=3;
  assert.throws(()=>E.Rules.save(s,'manager',r,1,'',NOW),/变更说明/);
  r.timing.firstContactHours=0;
  assert.throws(()=>E.Rules.save(s,'manager',r,1,'无效时限',NOW),/时限/);assert.equal(JSON.stringify(s),old);
});
test('分类停用、重复名称及全部停用均正确校验',()=>{
  let s=E.seed(NOW);s=update(s,r=>r.classification.categories[0].enabled=false);
  assert.throws(()=>create(s,{category:'服务态度'}),/停用/);
  let r=copy(s.rules);r.classification.categories[1].name=r.classification.categories[2].name;
  assert.throws(()=>E.Rules.validate(r),/不能重复/);
  r=copy(s.rules);r.classification.categories.forEach(c=>c.enabled=false);assert.throws(()=>E.Rules.validate(r),/至少启用/);
});
test('新增分类和关键词共同分级，重点工单交主管承接',()=>{
  let s=update(E.seed(NOW),r=>{r.classification.categories.push({id:'new-type',name:'预约变更',level:2,enabled:true});r.classification.keywords=['监管'];});
  s=create(s,{category:'预约变更',description:'需要监管跟进'});
  assert.equal(s.cases[0].level,3);assert.equal(E.pending(s.cases[0])[0].assigneeId,'manager');assert(s.cases[0].records.some(r=>r.body.includes('监管')));
});
test('首选不可接时自动替补，都不可接时由主管分配',()=>{
  let s=update(E.seed(NOW),r=>r.routing.available.store1=false);s=create(s);
  assert.equal(E.pending(s.cases[0])[0].assigneeId,'aftercare');assert.equal(s.cases[0].stage,'accept');
  s=update(s,r=>r.routing.available.aftercare=false);s=create(s);
  assert.equal(E.pending(s.cases[0])[0].assigneeId,'manager');assert.equal(s.cases[0].stage,'unassigned');
});
test('人工派单模式不能被新建表单自动派单选项绕过',()=>{
  const s=create(update(E.seed(NOW),r=>r.routing.mode='manual'),{autoAssign:true});assert.equal(s.cases[0].stage,'unassigned');
});
test('跨店承接、重复替补和关闭主管兜底被阻止',()=>{
  let r=E.Rules.defaults();r.routing.stores[0].primaryId='store2';assert.throws(()=>E.Rules.validate(r),/门店范围/);
  r=E.Rules.defaults();r.routing.stores[0].backupId='store1';assert.throws(()=>E.Rules.validate(r),/不能相同/);
  r=E.Rules.defaults();r.routing.available.manager=false;assert.throws(()=>E.Rules.validate(r),/必须保持/);
});
test('关闭通知不取消任务，也不改变旧工单通知规则',()=>{
  let s=create(E.seed(NOW));const oldId=s.cases[0].id;
  s=update(s,r=>{r.notifications.task=false;r.notifications.customer=false;r.notifications.overdue=false;});
  const count=s.notices.length;s=create(s);assert.equal(s.notices.length,count);assert.equal(E.pending(s.cases[0]).length,1);
  s=E.advance(s,2,NOW);assert(s.notices.some(n=>n.caseId===oldId&&n.event==='overdue'));assert(!s.notices.some(n=>n.caseId===s.cases[0].id));
});
test('任务抄送负责人去重，超时关闭主管同步只提醒办理人',()=>{
  let s=create(update(E.seed(NOW),r=>{r.notifications.ownerCopy=true;r.notifications.supervisor=false;}));
  assert(s.notices.some(n=>n.recipientId==='manager'&&n.title.includes('任务抄送')));
  s=E.advance(s,2,NOW);assert(s.notices.some(n=>n.recipientId==='store1'&&n.event==='overdue'));assert(!s.notices.some(n=>n.recipientId==='manager'&&n.event==='overdue'));
});
test('历史回访人员配置可继续使用，回访解决即结案',()=>{
  const x=flow(r=>{r.closure.callbackId='quality';r.closure.qualityId='callback';r.closure.reviewMode='all';r.timing.visitHours=8;r.timing.qualityHours=4;});
  x.toVisit();assert.equal(E.pending(x.c())[0].assigneeId,'quality');assert.equal(E.pending(x.c())[0].dueAt,NOW+60000+8*E.HOUR);
  x.run('visit',{result:'resolved',score:5,content:'问题已解决'});assert.equal(E.pending(x.c()).length,0);assert.equal(x.c().stage,'closed');
});
test('历史评分保留，不再追加品控环节',()=>{
  const x=flow(r=>r.closure.lowScoreThreshold=2);x.toVisit();x.run('visit',{result:'resolved',score:2,content:'问题解决但体验不佳'});
  assert.equal(x.c().stage,'closed');assert.equal(x.c().round,1);assert.equal(x.c().visits[0].result,'resolved');assert.equal(x.c().visits[0].score,2);
});
test('回访人与品控复核人不得相同',()=>{
  const r=E.Rules.defaults();r.closure.qualityId='callback';assert.throws(()=>E.Rules.validate(r),/相互独立/);
});
test('审批流程在金额阈值边界正确匹配，零金额不能作为有效资金方案',()=>{
  const r=E.Rules.defaults();assert.deepEqual(E.Rules.approvalPreview(r,'refund',500),['finance']);assert.deepEqual(E.Rules.approvalPreview(r,'refund',501),['manager','finance']);assert.deepEqual(E.Rules.approvalPreview(r,'compensation',1),['manager','finance']);assert.throws(()=>E.Rules.approvalPreview(r,'refund',0),/大于0/);
});
test('新建表单打开后规则变化时拦截旧表单，避免静默采用不同规则',()=>{
  const s=update(E.seed(NOW),r=>r.timing.firstContactHours=3);assert.throws(()=>create(s,{ruleVersion:1}),/规则已更新/);assert.equal(s.cases.length,0);assert.equal(create(s,{ruleVersion:2}).cases[0].rulesSnapshot.version,2);
});
test('方案与确认共用接单开始的处理阶段时限',()=>{
  const x=flow(r=>{r.timing.planHours=3;r.timing.confirmHours=1;});x.run('accept');x.run('contact',{result:'connected',content:'已确认'});
  assert.equal(E.pending(x.c())[0].dueAt,NOW+60000+3*E.HOUR);
  x.run('plan',{summary:'致歉',deadline:NOW+8*E.HOUR,items:[{type:'解释道歉',description:'说明情况',assigneeId:'store1'}]});assert.equal(E.pending(x.c())[0].dueAt,NOW+60000+3*E.HOUR);
});
console.log(`完成 ${checks} 项配置规则验证。`);
