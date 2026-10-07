'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js');
const seed=()=>C.initialize(E.seed());
const intake=(s,level=2)=>E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'统一规则验收',description:level===1?'预约问题，请协调时间':'协商未使用项目退款'});
const proposal={type:'退款',refund:10000,compensation:0,content:'退还未消费项目',consent:'客户已认可',account:'原支付渠道'};
const contact=(s,t)=>E.follow(s,t,E.taskPeople(s,t)[0],{connected:true,content:'核实完成'});
const memory=()=>{const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v),map};};

test('configuration edits determine intake deadlines and preserve existing ticket snapshots',()=>{
 const s=seed(),old=intake(s),snapshot=E.clone(old.flow),deadline=old.taskDeadline;
 const scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2);scene.config.timing.firstContactHours=3;scene.config.timing.processingHours=9;
 s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const fresh=intake(s);assert.equal(fresh.flow.version,scene.version+1);assert.equal(fresh.taskDeadline-fresh.assignedAt,3*E.H);contact(s,fresh);assert(Math.abs(fresh.taskDeadline-Date.now()-9*E.H)<1000);
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
test('manual dispatch supports a configured non-manager dispatcher and starts the contact clock on assignment',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.nodes.contact.method='manual';c.nodes.contact.manualBy='intake';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const t=intake(s),due=t.deadline;assert.equal(t.phase,'待分派');assert.deepEqual(E.taskPeople(s,t),['intake']);assert(E.canView(s,t,'intake'));assert.equal(t.taskDeadline,null);
 E.assign(s,t,'intake','aftercare','按规则分派');assert.equal(t.phase,'待首联');assert.equal(t.owner,'aftercare');assert.equal(t.deadline,due);assert.equal(t.taskDeadline-t.assignedAt,t.flow.doc.stage.first*E.H);
});
test('approval branch and node timing are evaluated from the configured snapshot',()=>{
 const s=seed(),scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2),F=C.Rules.Flow;
 const branch=F.branch();branch.branches[0].conditions=[{field:'refund',op:'gte',value:100}];branch.branches[0].nodes=[{...F.node(),title:'客户接待部门审核',source:'department',hierarchy:{base:'receptionist',mode:'single',origin:'bottom',level:1,empty:'block'},handling:{hours:1.5,overdue:'supervisor'}}];
 scene.config.approval.flow=[branch,{...F.node(),title:'财务审核',source:'position',positionId:'finance',handling:{hours:2,overdue:'supervisor'}}];
 s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});
 assert.equal(t.approval.steps[0].people[0],'store2');assert.equal(t.approval.steps[0].hours,1.5);assert(t.execution.path.some(row=>row.branchId===branch.branches[0].id));E.approve(s,t,'store2',true,'已核实');assert.equal(t.approval.steps[0].people[0],'finance');
});
test('sequential approval expands to ordered single-person tasks and prevents a later vote',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='finance').members=['finance','sun'];s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2);scene.config.approval.flow=[{...C.Rules.Flow.node(),title:'财务依次审核',source:'position',positionId:'finance',mode:'sequential'}];s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});assert.deepEqual(E.taskPeople(s,t),['finance']);assert.throws(()=>E.approve(s,t,'sun',true,''),/当前待审批/);E.approve(s,t,'finance',true,'同意');assert.deepEqual(E.taskPeople(s,t),['sun']);
});
test('approval adapter passes the ticket grade into condition matching',()=>{
 const s=seed(),scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2),F=C.Rules.Flow,branch=F.branch();
 Object.assign(branch.branches[0],{judgeBy:'level',levels:[2],title:'二级跟进',nodes:[{...F.node(),source:'duty',duty:'客诉主管'}]});
 scene.config.approval.flow=[branch,{...F.node(),source:'duty',duty:'财务审核'}];
 s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});
 assert.equal(t.flow.config.ticketFlow.schema,2);assert(!require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment).all(t.flow.config.ticketFlow.nodes).some(n=>n.type==='branch'&&n.branches.some(b=>b.judgeBy==='level')));assert.equal(t.approval.steps[0].people[0],'manager');
});
test('department approval and payment return to the aftercare owner for explicit closure',()=>{
 const s=seed(),t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});
 while(t.phase==='待部门审批')E.approve(s,t,E.taskPeople(s,t)[0],true,'同意');assert.equal(t.phase,'待付款');assert.deepEqual(E.taskPeople(s,t),['finance']);
 E.pay(s,t,'finance',{result:'成功',amount:10000,reference:'UNIFIED-TEST',proof:[{name:'凭证'}]});assert.equal(t.phase,'待结案');assert.deepEqual(E.taskPeople(s,t),['aftercare']);assert.equal(t.owner,'aftercare');
 assert.throws(()=>E.review(s,t,'aftercare',{result:'认可',note:'旧回访接口'}),/已取消/);E.closeTicket(s,t,'aftercare',{completed:true,note:'已核实处理完成'});assert.equal(t.phase,'已结案');
});
test('plain service skips funded nodes and waits for aftercare closure',()=>{
 const s=seed(),t=intake(s,1);contact(s,t);E.completeNormal(s,t,t.currentAssignee,'已完成预约协调');assert.equal(t.phase,'待结案');assert.equal(t.approval,null);assert.deepEqual(E.taskPeople(s,t),['aftercare']);
});
test('new configuration takes precedence over the retired intake assignment setting',()=>{
 const s=seed();s.rules.mode='manual';const t=intake(s);assert.equal(t.phase,'待首联');assert.equal(t.owner,'aftercare');
});
test('retired callback assignment cannot make finance close the ticket',()=>{
 const s=seed(),c=C.Assignment.get(s.configuration);c.nodes.callback.source='inherit';c.nodes.callback.from='execution';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);
 const t=intake(s);contact(s,t);E.startApproval(s,t,t.currentAssignee,{...proposal});while(t.phase==='待部门审批')E.approve(s,t,E.taskPeople(s,t)[0],true,'同意');
 E.pay(s,t,'finance',{result:'成功',amount:10000,reference:'INHERIT-TEST',proof:[{name:'凭证'}]});assert.deepEqual(E.taskPeople(s,t),['aftercare']);assert.throws(()=>E.closeTicket(s,t,'finance',{completed:true,note:'尝试代结案'}),/当前节点/);E.closeTicket(s,t,'aftercare',{completed:true,note:'到账已核实'});assert.equal(t.phase,'已结案');
});
test('disabled or ambiguous grade rules cannot silently fall back to unrelated rules',()=>{
 const s=seed();s.configuration.ruleScenes.find(x=>x.level===2).enabled=false;const pending=intake(s);assert.equal(pending.phase,'待分派');assert.equal(pending.pendingAssignment.mode,'configuration');assert.match(pending.pendingAssignment.reason,/没有启用/);assert.equal(pending.flow,undefined);
 const c=seed().configuration,d=C.Rules.newScene(c);d.name='同级新规则';d.level=2;assert.throws(()=>C.Rules.saveScene(c,'manager',d,c.sceneRevision),/已有启用/);d.enabled=false;assert(C.Rules.saveScene(c,'manager',d,c.sceneRevision).ruleScenes.some(x=>x.name===d.name));
});
test('missing personnel uses the configured fallback, never an invented successful approval',()=>{
 const s=seed();s.configuration.organization.appointments.find(p=>p.personId==='aftercare').active=false;const t=intake(s);assert.equal(t.owner,'manager');
 contact(s,t);const finance=s.configuration.organization.appointments.find(p=>p.personId==='finance');finance.active=false;E.confirmSolution(s,t,t.currentAssignee,{...proposal});assert.equal(t.pendingAssignment.mode,'flow-node');assert.match(t.pendingAssignment.reason,/有效|人员|任职/);assert.equal(t.state,'审批中');
});
test('storage migrates both existing datasets once, preserving raw legacy records and keys',()=>{
 const mem=memory(),old=E.seed(),legacy={schema:1,sequence:9,revision:2,cases:[{id:'case-old',records:[{body:'原始证据'}]}],customers:[],rules:C.Rules.defaults()};
 mem.setItem(Store.TICKETS_KEY,JSON.stringify(old));mem.setItem(Store.RULES_KEY,JSON.stringify(legacy));const a=Store.createStore(mem,E,C),s=a.load();
 for(const prior of old.tickets){const t=s.tickets.find(row=>row.id===prior.id);for(const key of ['title','description','created','deadline','payments','attachments','sources'])assert.deepEqual(t[key],prior[key]);for(const log of prior.logs)assert(t.logs.some(row=>JSON.stringify(row)===JSON.stringify(log)));}assert.equal(s.tickets.length,old.tickets.length+2+E.WORKFLOW_EXAMPLES.length);assert.deepEqual(s.configuration.cases,legacy.cases);assert.equal(mem.getItem(Store.TICKETS_KEY),JSON.stringify(old));assert.equal(mem.getItem(Store.RULES_KEY),JSON.stringify(legacy));
 mem.setItem(Store.RULES_KEY,'{}');assert.equal(a.load().configuration.cases[0].id,'case-old');
});
test('existing unified storage receives intake examples once and rejects stale writes after migration',()=>{
 const mem=memory(),old=seed();old._revision=7;mem.setItem(Store.KEY,JSON.stringify(old));const store=Store.createStore(mem,E,C),s=store.load();
 assert.equal(s._revision,8);assert.equal(s.intakeExamplesVersion,1);assert.equal(s.tickets.length,old.tickets.length+2+E.WORKFLOW_EXAMPLES.length);for(const prior of old.tickets){const t=s.tickets.find(row=>row.id===prior.id);assert.equal(t.description,prior.description);assert.deepEqual(t.payments,prior.payments);}assert.deepEqual(s.configuration,E.clone(old.configuration));assert.throws(()=>store.save(old),/其他页面/);
 assert.deepEqual(store.load(),s);const t=s.tickets.find(t=>t.id==='KS20261007-G01');E.confirmGrading(s,t,'manager',1,'核实为预约服务反馈');store.save(s);
 const again=store.load();assert.equal(again._revision,9);assert.equal(again.tickets.length,old.tickets.length+2+E.WORKFLOW_EXAMPLES.length);assert.equal(again.tickets.find(row=>row.id===t.id).grading.status,'confirmed');
});
test('both page adapters use the same versioned storage without overwriting each other',()=>{
 const mem=memory(),store=Store.createStore(mem,E,C),stale=store.load(),config=store.configuration.load();config.ruleScenes[1].name='已保存的规则';store.configuration.save(config);
 assert.equal(store.load().configuration.ruleScenes[1].name,'已保存的规则');assert.throws(()=>store.save(stale),/其他页面/);
 const current=store.load();intake(current);store.save(current);assert.equal(store.configuration.load().ruleScenes[1].name,'已保存的规则');assert.throws(()=>store.configuration.save(config),/其他页面/);
});
test('corrupted storage is reported without replacing it with demo data',()=>{
 const mem=memory();mem.setItem(Store.TICKETS_KEY,'broken');const store=Store.createStore(mem,E,C);assert.throws(()=>store.load(),/保留原始/);assert.equal(mem.getItem(Store.TICKETS_KEY),'broken');assert.equal(mem.getItem(Store.KEY),null);
});
