'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('./workflow/engine'),C=require('./configuration'),A=require('./ai-grading'),Store=require('./shared-store'),P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
function fixture(){const values=new Map(),store=Store.createStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},E,C);return {store,s:store.load()};}
const sales=scene=>scene.config.ticketFlow.nodes.find(n=>n.kind==='sales');
const complaint=(s,channel='CRM系统',description='警方到店，需要售后经理协调')=>E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel,title:'客诉协调',description});
test('all five saved scenarios include grading fields and the fifth has a genuine manager flow',()=>{
 const {s,store}=fixture();assert.deepEqual(s.configuration.ruleScenes.map(s=>s.level),[1,2,3,4,5]);
 for(const scene of s.configuration.ruleScenes){assert(scene.grading.criteria);P.validate(E.clone(scene),s.configuration);assert.equal(P.handlingType(sales(scene)),scene.level===5?'manager':'sales');const stages=P.all(scene.config.ticketFlow.nodes);assert(stages.some(n=>n.type==='branch'&&n.branches.some(b=>b.judgeBy==='source')));assert(stages.some(n=>n.kind==='payment'));assert(stages.some(n=>n.kind==='procurement'));assert(stages.filter(n=>n.type==='approval').every(n=>n.provider==='dingtalk'));}
 assert.deepEqual(store.load(),s);
});
test('existing grading definitions migrate without modifying tickets, custom fields or saved manager choices',()=>{
 const {s}=fixture();delete s.configuration.ruleSetupVersion;s.configuration.ruleScenes=s.configuration.ruleScenes.filter(d=>d.level!==5);for(const d of s.configuration.ruleScenes)delete d.grading;
 const old=A.get({});old.levels[1].criteria='已配置的退款条件';old.levels[1].keywords='剩余疗程退费';old.levels[1].exclusions='不退费';s.configuration.aiGrading=old;
 const tickets=E.clone(s.tickets),orders=E.clone(s.orders),before=E.clone(s.configuration.ruleScenes);assert(C.ensureRuleSetup(s));assert.deepEqual(s.configuration.ruleSetupBackup.ruleScenes,before);assert.deepEqual(s.tickets,tickets);assert.deepEqual(s.orders,orders);assert.deepEqual(s.configuration.ruleScenes[1].grading,{criteria:'已配置的退款条件',keywords:'剩余疗程退费',exclusions:'不退费'});const snapshot=E.clone(s);assert.equal(C.ensureRuleSetup(s),false);assert.deepEqual(s,snapshot);
});
test('scene grading fields are the sole current definition and save validation retains the last valid config',()=>{
 const {s}=fixture(),c=s.configuration,d=C.Rules.sceneList(c).find(r=>r.level===5);d.grading={criteria:'需要经理协调的严重烫伤',keywords:'重度灼伤',exclusions:'没有重度灼伤'};
 const before=E.clone(c);assert.throws(()=>C.Rules.saveScene(c,'manager',{...d,grading:{...d.grading,criteria:' '}},c.sceneRevision,Date.now()),/定级条件/);assert.deepEqual(c,before);
 s.configuration=C.Rules.saveScene(c,'manager',d,c.sceneRevision,Date.now());assert.equal(A.classify(s.configuration,{description:'客户反馈重度灼伤'}).level,5);assert.equal(A.classify(s.configuration,{description:'没有重度灼伤'}).status,'review');assert.equal(A.classify(s.configuration,{description:'警方到店'}).status,'review');assert.equal(complaint(s,'CRM系统','客户反馈重度灼伤').owner,'manager');
});
test('manager person and fallback drive CRM and store-first tickets without resetting their flow',()=>{
 const {s}=fixture(),c=s.configuration,d=C.Rules.sceneList(c).find(r=>r.level===5),node=sales(d);node.personId='manager';node.fallbackId='jiang';node.hours=7;d.config.timing.firstContactHours=0.75;
 s.configuration=C.Rules.saveScene(c,'manager',d,c.sceneRevision,Date.now());s.configuration.organization.appointments.find(p=>p.personId==='manager').active=false;
 const crm=complaint(s);assert.equal(crm.level,5);assert.equal(crm.owner,'jiang');assert.equal(crm.taskDeadline-crm.assignedAt,0.75*E.H);assert.equal(crm.flow.doc.stage.process,7);
 const hotline=complaint(s,'400电话');assert.equal(hotline.currentAssignee,'store2');E.follow(s,hotline,'store2',{connected:true,content:'门店电话沟通未解决'});E.finishStoreIntake(s,hotline,'store2',{note:'交售后经理处理'});assert.equal(hotline.owner,'jiang');assert.equal(hotline.state,'处理中');assert.equal(hotline.flow.config.ticketFlow.nodes.find(n=>n.kind==='sales').hours,7);
 s.configuration.organization.appointments.find(p=>p.personId==='jiang').active=false;const waiting=complaint(s);assert.equal(waiting.pendingAssignment.mode,'configuration');assert.equal(waiting.owner,'');
});
test('manager handling only accepts a specified manager while specialist handling retains position assignment',()=>{
 const {s}=fixture(),d=s.configuration.ruleScenes[4],manager=P.handlingNode('manager',s.configuration,d),specialist=P.handlingNode('sales',s.configuration,s.configuration.ruleScenes[0]);assert.equal(P.handlingType(manager),'manager');assert.equal(manager.source,'person');P.validEntryNode(manager,s.configuration);manager.source='position';assert.throws(()=>P.validEntryNode(manager,s.configuration),/指定人员/);assert.equal(specialist.source,'position');assert.equal(specialist.entryRole,'specialist');
});
