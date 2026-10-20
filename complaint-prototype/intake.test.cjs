'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),A=require('./ai-grading.js');
const seed=()=>C.initialize(E.seed()),base={name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'客户反馈',description:'希望退回未使用项目，申请退款'};
const realNow=Date.now;afterEach(()=>{Date.now=realNow;});
test('configured words grade all five levels, prioritizing the highest match and keeping evidence',()=>{
 for(const [level,description] of [[1,'服务态度需要改善'],[2,'要求退款'],[3,'要求退款并赔偿'],[4,'已向监管投诉，要求退款'],[5,'警方到店，涉及监管投诉']]){
  const result=A.classify({}, {description});assert.equal(result.level,level);assert.equal(result.status,'resolved');assert(result.matches[0].keywords.length);assert.equal(result.method,'configured-keywords');
 }
});
test('negations, exclusions, uncertain threats and unmatched complaints do not falsely grade',()=>{
 assert.equal(A.classify({}, {description:'无需赔偿，只要求退款'}).level,2);
 assert.equal(A.classify({}, {description:'没有监管投诉，客户仅要求退款'}).level,2);
 assert.equal(A.classify({}, {description:'如果不退款就要监管投诉'}).status,'review');
 assert.equal(A.classify({}, {description:'反馈资料需要核实'}).level,null);
 const config=A.get({});config.levels[4].exclusions='警方未到店';assert.equal(A.classify({aiGrading:config},{description:'警方未到店，只要求退款'}).level,2);
});
test('active grading configuration and selected input fields determine the next intake only',()=>{
 const s=seed(),first=E.create(s,'chen',base),snapshot=E.clone(first.grading),config=A.get(s.configuration);
 config.levels[1].keywords='退剩余款';config.inputs=['description'];s.configuration=A.save(s.configuration,'manager',config,0);
 const second=E.create(s,'chen',{...base,description:'申请退剩余款'});assert.equal(second.level,2);assert.equal(second.grading.configVersion,1);assert.deepEqual(first.grading,snapshot);
 const third=E.create(s,'chen',{...base,title:'退剩余款'});assert.equal(third.phase,'待定级');
});
test('intake ignores supplied grades and binds the automatically matched rule',()=>{
 const s=seed(),previous=E.clone(s.tickets),t=E.create(s,'chen',{...base,level:5,request:'要求赔偿'});
 assert.equal(t.level,2);assert.equal(t.flow.level,2);assert.equal(t.phase,'待首联');assert.equal(t.request,undefined);assert.equal(t.sources[0].request,undefined);assert.equal(t.taskDeadline-t.assignedAt,2*E.H);assert.deepEqual(E.clone(s.tickets.slice(1)),previous);
});
test('legacy request input reads complaint content without rewriting saved grading settings',()=>{
 const s=seed(),config=A.get(s.configuration);config.inputs=['request','description'];s.configuration.aiGrading=config;const saved=E.clone(config);
 assert.deepEqual(A.get(s.configuration).inputs,['description']);assert.equal(E.create(s,'chen',base).level,2);assert.deepEqual(s.configuration.aiGrading,saved);
});
test('unmatched tickets persist without a fake grade, flow, assignee rotation or first-contact deadline',()=>{
 const s=seed(),t=E.create(s,'chen',{...base,description:'情况待进一步核实'});
 assert.equal(t.phase,'待定级');assert.equal(t.level,null);assert.equal(t.flow,undefined);assert.equal(t.taskDeadline,null);assert.equal(t.owner,'');assert.deepEqual(E.taskPeople(s,t),['manager']);assert(s.tickets.includes(t));
 assert.equal(E.canHandle(s,t,'manager'),false);assert.throws(()=>E.assign(s,t,'manager','aftercare','直接分配'),/定级/);assert.throws(()=>E.confirmGrading(s,t,'chen',2,'客户明确退款'),/经理/);assert.throws(()=>E.confirmGrading(s,t,'gu',2,'客户明确退款'),/经理/);
 assert.throws(()=>E.confirmGrading(s,t,'manager',0,'依据'),/等级/);assert.throws(()=>E.confirmGrading(s,t,'manager',2,' '),/依据/);
 const created=t.created;Date.now=()=>created+E.H;E.confirmGrading(s,t,'manager',2,'线下确认客户申请退款');
 assert.equal(t.phase,'待首联');assert.equal(t.grading.status,'confirmed');assert.equal(t.grading.confirmedBy,'manager');assert.equal(t.created,created);assert.equal(t.deadline,created+72*E.H);assert.equal(t.taskDeadline,created+3*E.H);assert.match(t.grading.reason,/未明确命中/);assert.throws(()=>E.confirmGrading(s,t,'manager',3,'重复提交'),/已完成/);
});
test('missing or ambiguous scenes retain the ticket and retry routing without changing its identity or grade',()=>{
 const s=seed();s.configuration.ruleScenes.find(x=>x.level===2).enabled=false;
 const t=E.create(s,'chen',base),id=t.id,count=s.tickets.length,grading=E.clone(t.grading);
 assert.equal(t.level,2);assert.equal(t.phase,'待分派');assert.equal(t.pendingAssignment.mode,'configuration');assert.equal(t.taskDeadline,null);
 assert.throws(()=>E.retryIntake(s,t,'chen'),/经理/);assert.throws(()=>E.assign(s,t,'manager','aftercare','越过规则'),/匹配/);
 E.retryIntake(s,t,'manager');assert.equal(t.pendingAssignment.mode,'configuration');
 s.configuration.ruleScenes.find(x=>x.level===2).enabled=true;E.retryIntake(s,t,'manager');assert.equal(t.id,id);assert.equal(s.tickets.length,count);assert.deepEqual(t.grading,grading);assert.equal(t.phase,'待首联');assert.equal(t.pendingAssignment,undefined);
 assert.throws(()=>E.retryIntake(s,t,'manager'),/无需/);
 const duplicate=E.clone(s.configuration.ruleScenes.find(x=>x.level===2));duplicate.id='duplicate';s.configuration.ruleScenes.push(duplicate);const ambiguous=E.create(s,'chen',base);assert.match(ambiguous.pendingAssignment.reason,/多条启用规则/);
});
test('disabled grading requires manager confirmation and invalid intakes do not create tickets',()=>{
 const s=seed(),config=A.get(s.configuration);config.enabled=false;s.configuration=A.save(s.configuration,'manager',config,0);const count=s.tickets.length;
 assert.throws(()=>E.create(s,'chen',{...base,phone:'123'}),/手机号/);assert.throws(()=>E.create(s,'chen',{...base,name:' '}),/姓名/);assert.equal(s.tickets.length,count);
 const t=E.create(s,'chen',base);assert.equal(t.phase,'待定级');assert.match(t.gradeReason,/未启用/);
});
test('intake examples append once without changing existing tickets, configuration or assignment state',()=>{
 const s=seed(),before=structuredClone(s);assert.equal(E.ensureIntakeExamples(s),true);
 assert.equal(s.tickets.length,before.tickets.length+2);assert.deepEqual(s.tickets.slice(2),before.tickets);assert.deepEqual(s.configuration,before.configuration);assert.deepEqual(s.assignmentCursors,before.assignmentCursors);assert.equal(s.sequence,before.sequence);
 const grading=s.tickets.find(t=>t.id==='KS20261007-G01'),matching=s.tickets.find(t=>t.id==='KS20261007-R01');
 assert.equal(grading.phase,'待定级');assert.equal(grading.level,null);assert.deepEqual(E.taskPeople(s,grading),['manager']);
 assert.equal(matching.phase,'待分派');assert.equal(matching.level,5);assert.equal(matching.pendingAssignment.mode,'configuration');assert.equal(matching.flow,undefined);assert.match(matching.pendingAssignment.reason,/受理时/);
 E.confirmGrading(s,grading,'manager',2,'已联系确认客户希望退款');const handled=E.clone(grading);
 assert.equal(E.ensureIntakeExamples(s),false);assert.deepEqual(grading,handled);assert.equal(s.tickets.length,before.tickets.length+2);
});
test('missing-rule example keeps its historical state and retries against current rules on the same ticket',()=>{
 const s=seed(),scene=C.Rules.newScene(s.configuration);scene.name='五级紧急处理';scene.level=5;s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);const config=structuredClone(s.configuration);
 E.ensureIntakeExamples(s);assert.deepEqual(s.configuration,config);const t=s.tickets.find(t=>t.id==='KS20261007-R01'),created=t.created;
 assert.equal(t.pendingAssignment.mode,'configuration');E.retryIntake(s,t,'manager');assert.equal(t.id,'KS20261007-R01');assert.equal(t.created,created);assert.equal(t.level,5);assert.equal(t.phase,'待首联');assert.equal(t.owner,'manager');assert.equal(t.pendingAssignment,undefined);
 assert.equal(E.ensureIntakeExamples(s),false);assert.equal(s.tickets.filter(t=>t.id==='KS20261007-R01').length,1);assert.equal(t.phase,'待首联');
});
