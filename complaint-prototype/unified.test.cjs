'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js');
const seed=()=>C.initialize(E.seed());
const intake=(s,level=2)=>E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'400电话',title:'统一规则验收',description:'协商未使用项目',level});
const proposal={type:'退款',refund:10000,compensation:0,content:'退还未消费项目',consent:'客户已认可',account:'原支付渠道'};
const contact=(s,t)=>E.follow(s,t,E.taskPeople(s,t)[0],{connected:true,content:'核实完成'});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};

test('configuration edits determine intake deadlines and preserve existing ticket snapshots',()=>{
 const s=seed(),old=intake(s),snapshot=E.clone(old.flow),deadline=old.taskDeadline;
 const scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2);scene.config.timing.firstContactHours=3;scene.config.timing.processingHours=9;
 s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const fresh=intake(s);assert.equal(fresh.flow.version,scene.version+1);assert.equal(fresh.taskDeadline-fresh.created,3*E.H);contact(s,fresh);assert(Math.abs(fresh.taskDeadline-Date.now()-9*E.H)<1000);
 assert.deepEqual(old.flow,snapshot);assert.equal(old.taskDeadline,deadline);
});
test('saved position rotation assigns real tickets; previews never consume a slot',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='aftercare').members=['aftercare','intake'];s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 for(let i=0;i<3;i++)C.Assignment.preview(s.configuration,c,c.nodes.contact,{cursor:0});
 assert.deepEqual([intake(s).owner,intake(s).owner,intake(s).owner],['aftercare','intake','aftercare']);
});
test('least load and inherited handlers use actual pending assignments',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='aftercare').members=['aftercare','intake'];c.nodes.contact.method='least_load';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const a=intake(s),b=intake(s);assert.equal(a.owner,'aftercare');assert.equal(b.owner,'intake');contact(s,a);assert.equal(a.currentAssignee,'aftercare');
});
test('manual dispatch supports a configured non-manager dispatcher and keeps the deadline',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.nodes.contact.method='manual';c.nodes.contact.manualBy='intake';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const t=intake(s),due=t.taskDeadline;assert.equal(t.state,'待分派');assert.deepEqual(E.taskPeople(s,t),['intake']);assert(E.canView(s,t,'intake'));
 E.assign(s,t,'intake','aftercare','按规则分派');assert.equal(t.state,'待首联');assert.equal(t.owner,'aftercare');assert.equal(t.taskDeadline,due);
});
test('approval branch and node timing are evaluated from the configured snapshot',()=>{
 const s=seed(),scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2),F=C.Rules.Flow;
 const branch=F.branch();branch.branches[0].conditions=[{field:'refund',op:'gte',value:100}];branch.branches[0].nodes=[{...F.node(),title:'客户接待部门审核',source:'department',hierarchy:{base:'receptionist',mode:'single',origin:'bottom',level:1,empty:'block'},handling:{hours:1.5,overdue:'supervisor'}}];
 scene.config.approval.flow=[branch,{...F.node(),title:'财务审核',source:'position',positionId:'finance',handling:{hours:2,overdue:'supervisor'}}];
 s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});
 assert.equal(t.approval.steps[0].people[0],'store2');assert.equal(t.approval.steps[0].hours,1.5);assert.equal(t.approval.steps[1].people[0],'finance');assert.equal(t.approval.path[0].branchId,branch.branches[0].id);
});
test('sequential approval expands to ordered single-person tasks and prevents a later vote',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='finance').members=['finance','sun'];s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2);scene.config.approval.flow=[{...C.Rules.Flow.node(),title:'财务依次审核',source:'position',positionId:'finance',mode:'sequential'}];s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});assert.deepEqual(E.taskPeople(s,t),['finance']);assert.throws(()=>E.approve(s,t,'sun',true,''),/当前待审批/);E.approve(s,t,'finance',true,'同意');assert.deepEqual(E.taskPeople(s,t),['sun']);
});
test('approval, payment, and callback complete through one ticket model',()=>{
 const s=seed(),t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});
 while(t.state==='待方案审批')E.approve(s,t,E.taskPeople(s,t)[0],true,'同意');assert.equal(t.state,'待打款');assert.deepEqual(E.taskPeople(s,t),['finance']);
 E.pay(s,t,'finance',{result:'成功',amount:10000,reference:'UNIFIED-TEST',proof:[{name:'凭证'}]});assert.equal(t.state,'待回访');assert.deepEqual(E.taskPeople(s,t),['callback']);assert.equal(t.owner,'aftercare');
 assert.throws(()=>E.review(s,t,'aftercare',{result:'认可',note:'非法自访'}),/回访节点/);E.review(s,t,'callback',{result:'认可',note:'客户认可'});assert.equal(t.state,'已结案');
});
test('plain service skips the configured funding approval and uses callback assignment',()=>{
 const s=seed(),t=intake(s,1);contact(s,t);E.completeNormal(s,t,t.currentAssignee,'已完成预约协调');assert.equal(t.state,'待回访');assert.equal(t.approval,null);assert.deepEqual(E.taskPeople(s,t),['callback']);
});
test('new configuration takes precedence over the retired intake assignment setting',()=>{
 const s=seed();s.rules.mode='manual';const t=intake(s);assert.equal(t.state,'待首联');assert.equal(t.owner,'aftercare');
});
test('callback may inherit the actual payment executor when configured',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.nodes.callback.source='inherit';c.nodes.callback.from='execution';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});while(t.state==='待方案审批')E.approve(s,t,E.taskPeople(s,t)[0],true,'同意');
 E.pay(s,t,'finance',{result:'成功',amount:10000,reference:'INHERIT-TEST',proof:[{name:'凭证'}]});assert.deepEqual(E.taskPeople(s,t),['finance']);E.review(s,t,'finance',{result:'认可',note:'收到款项'});assert.equal(t.state,'已结案');
});
test('disabled or ambiguous grade rules cannot silently fall back to unrelated rules',()=>{
 const s=seed();s.configuration.ruleScenes.find(x=>x.level===2).enabled=false;assert.throws(()=>intake(s),/没有启用/);
 const c=seed().configuration,d=C.Rules.newScene(c);d.name='同级新规则';d.level=2;assert.throws(()=>C.Rules.saveScene(c,'manager',d,c.sceneRevision),/已有启用/);d.enabled=false;assert(C.Rules.saveScene(c,'manager',d,c.sceneRevision).ruleScenes.some(x=>x.name===d.name));
});
test('missing personnel uses the configured fallback, never an invented successful approval',()=>{
 const s=seed();s.configuration.organization.appointments.find(p=>p.personId==='aftercare').active=false;const t=intake(s);assert.equal(t.owner,'manager');
 contact(s,t);const finance=s.configuration.organization.appointments.find(p=>p.personId==='finance');finance.active=false;assert.throws(()=>E.startApproval(s,t,t.currentAssignee,{...proposal}),/有效|人员|任职/);
});
test('storage migrates both existing datasets once, preserving raw legacy records and keys',()=>{
 const mem=memory(),old=E.seed(),legacy={schema:1,sequence:9,revision:2,cases:[{id:'case-old',records:[{body:'原始证据'}]}],customers:[],rules:C.Rules.defaults()};
 mem.setItem(Store.TICKETS_KEY,JSON.stringify(old));mem.setItem(Store.RULES_KEY,JSON.stringify(legacy));const a=Store.createStore(mem,E,C),s=a.load();
 assert.deepEqual(s.tickets,E.clone(old.tickets));assert.deepEqual(s.configuration.cases,legacy.cases);assert.equal(mem.getItem(Store.TICKETS_KEY),JSON.stringify(old));assert.equal(mem.getItem(Store.RULES_KEY),JSON.stringify(legacy));
 mem.setItem(Store.RULES_KEY,'{}');assert.equal(a.load().configuration.cases[0].id,'case-old');
});
test('both page adapters use the same versioned storage without overwriting each other',()=>{
 const mem=memory(),store=Store.createStore(mem,E,C),stale=store.load(),config=store.configuration.load();config.ruleScenes[1].name='已保存的规则';store.configuration.save(config);
 assert.equal(store.load().configuration.ruleScenes[1].name,'已保存的规则');assert.throws(()=>store.save(stale),/其他页面/);
 const current=store.load();intake(current);store.save(current);assert.equal(store.configuration.load().ruleScenes[1].name,'已保存的规则');assert.throws(()=>store.configuration.save(config),/其他页面/);
});
test('corrupted storage is reported without replacing it with demo data',()=>{
 const mem=memory();mem.setItem(Store.TICKETS_KEY,'broken');const store=Store.createStore(mem,E,C);assert.throws(()=>store.load(),/保留原始/);assert.equal(mem.getItem(Store.TICKETS_KEY),'broken');assert.equal(mem.getItem(Store.KEY),null);
});
