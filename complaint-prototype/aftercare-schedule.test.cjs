'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict'),C=require('./configuration.js'),E=require('./workflow/engine.js');
const M=C.Schedule,DAY='2026-10-07',realNow=Date.now,at=time=>Date.parse(DAY+'T'+time+':00+08:00');
function clock(time){Date.now=()=>at(time);}
afterEach(()=>{Date.now=realNow;});
function fixture(){clock('08:00');const s=C.initialize(E.seed()),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='aftercare').members=['aftercare','chen','zhou'];s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);const d=M.get(s.configuration);d.dispatchStart='09:30';d.roster[DAY]={aftercare:'early',chen:'early',zhou:'late'};s.configuration=M.save(s.configuration,'manager',d,0);return s;}
function intake(s,level=2){return E.create(s,'chen',{name:'客户',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'排班派单',description:level===5?'警方到店，需要紧急处理':'客户要求退款，核实剩余项目'});}
test('only active aftercare position members appear in the roster, never finance or stores',()=>{
 const s=fixture(),c=s.configuration;c.nodeAssignmentRules.positions[1].members.push('finance','store2');assert.deepEqual(M.staff(c).map(p=>p.id),['aftercare','chen','zhou']);c.organization.appointments.find(a=>a.personId==='zhou').active=false;assert.deepEqual(M.staff(c).map(p=>p.id),['aftercare','chen']);
});
test('batch scheduling respects people, weekdays, dates, rest and clearing without touching others',()=>{
 const s=fixture(),d=M.get(s.configuration),c=M.batch(s.configuration,d,{people:['aftercare','zhou'],start:'2026-10-05',end:'2026-10-11',weekdays:[1,3,5],shift:'rest'});
 assert.equal(c.roster['2026-10-07'].aftercare,'rest');assert.equal(c.roster['2026-10-07'].chen,'early');assert.equal(c.roster['2026-10-06'],undefined);assert.equal(d.roster[DAY].aftercare,'early');
 const cleared=M.batch(s.configuration,c,{people:['zhou'],start:DAY,end:DAY,weekdays:[3],shift:''});assert.equal(cleared.roster[DAY].zhou,undefined);assert.equal(cleared.roster[DAY].aftercare,'rest');
 for(const extra of [{people:['finance']},{weekdays:[]},{start:'2026-02-30'},{end:'2026-10-01'},{shift:'missing'}])assert.throws(()=>M.batch(s.configuration,d,{people:['chen'],start:DAY,end:DAY,weekdays:[3],shift:'early',...extra}));
});
test('cross-midnight shifts use their start-day dispatch time and exclusive end boundary',()=>{
 const s=fixture(),d=M.get(s.configuration);d.shifts.push({id:'night',name:'跨日班',start:'22:00',end:'06:00'});d.roster['2026-10-06']={zhou:'night'};s.configuration=M.save(s.configuration,'manager',d,d.version);
 assert(M.canReceive(s.configuration,'zhou',at('05:59')));assert(!M.canReceive(s.configuration,'zhou',at('06:00')));assert(!M.canReceive(s.configuration,'aftercare',at('09:29')));assert(M.canReceive(s.configuration,'aftercare',at('09:30')));assert(!M.canReceive(s.configuration,'aftercare',at('18:00')));
});
test('invalid shift times, repeated names, referenced deletion and overlapping adjacent shifts are rejected',()=>{
 const s=fixture(),d=M.get(s.configuration);for(const value of ['25:00','bad','09:00']){const x=E.clone(d);x.shifts[0].end=value;assert.throws(()=>M.validate(x),/时间/);}
 let x=E.clone(d);x.shifts[1].name='早班';assert.throws(()=>M.validate(x),/名称/);x=E.clone(d);x.shifts.shift();assert.throws(()=>M.validate(x),/删除/);
 x=E.clone(d);x.shifts[1]={id:'late',name:'晚班',start:'22:00',end:'10:00'};x.roster['2026-10-06']={aftercare:'late'};assert.throws(()=>M.validate(x),/重叠/);
});
test('schedule saves are authorized, versioned and preserve all unrelated configuration',()=>{
 const s=fixture(),before=E.clone(s.configuration),d=M.get(s.configuration);assert.throws(()=>M.save(s.configuration,'finance',d,d.version),/主管/);d.dispatchStart='10:00';const saved=M.save(s.configuration,'manager',d,d.version);assert.throws(()=>M.save(saved,'manager',d,d.version),/其他页面/);assert.deepEqual(saved.ruleScenes,before.ruleScenes);assert.deepEqual(saved.nodeAssignmentRules,before.nodeAssignmentRules);assert.equal(s.configuration.aftercareSchedule.dispatchStart,'09:30');
});
test('before opening time tickets queue without consuming rotation or starting first-contact clock',()=>{
 const s=fixture(),t=intake(s);assert.equal(t.phase,'待分派');assert.equal(t.owner,'');assert.equal(t.taskDeadline,null);assert.equal(t.deadline-t.created,72*E.H);assert.equal(t.pendingAssignment.mode,'schedule');assert.equal(s.aftercareCursors,undefined);assert.equal(E.dispatchPending(s,at('09:29')),0);assert.equal(t.assignedAt,undefined);E.assign(s,t,'manager','aftercare','提前分配');assert.equal(t.owner,'aftercare');assert.equal(t.pendingAssignment,undefined);assert.equal(t.taskDeadline,t.assignedAt+2*E.H);assert.equal(E.dispatchPending(s,at('09:30')),0);
});
test('backlog drains oldest first and a newly created ticket joins the same fair rotation',()=>{
 const s=fixture(),a=intake(s);clock('08:01');const b=intake(s);clock('08:02');const c=intake(s);clock('09:30');const fresh=intake(s);
 assert.deepEqual([a.owner,b.owner,c.owner,fresh.owner],['aftercare','chen','aftercare','chen']);for(const t of [a,b,c]){assert.equal(t.phase,'待首联');assert.equal(t.assignedAt,at('09:30'));assert.equal(t.taskDeadline,at('11:30'));assert.equal(t.deadline,t.created+72*E.H);assert.equal(t.logs.filter(l=>l.title==='自动派单').length,1);}
 const cursors=E.clone(s.aftercareCursors);assert.equal(E.dispatchPending(s,at('09:31')),0);assert.deepEqual(s.aftercareCursors,cursors);
});
test('shift changes add and remove candidates while keeping existing ticket owners',()=>{
 const s=fixture();clock('09:30');const a=intake(s),b=intake(s);clock('14:00');const late=intake(s);assert.equal(late.owner,'zhou');clock('18:00');const next=intake(s);assert.equal(next.owner,'zhou');assert.equal(a.owner,'aftercare');assert.equal(b.owner,'chen');clock('22:00');const waiting=intake(s);assert.equal(waiting.phase,'待分派');assert.equal(waiting.taskDeadline,null);
});
test('rest and unassigned days queue without bypassing the schedule through a fallback',()=>{
 const s=fixture(),d=M.get(s.configuration);d.roster[DAY]={aftercare:'rest',chen:'rest'};s.configuration=M.save(s.configuration,'manager',d,d.version);clock('10:00');const t=intake(s);assert.equal(t.owner,'');assert.equal(t.pendingAssignment.mode,'schedule');assert.equal(E.dispatchPending(s),0);
});
test('fixed aftercare staff still follows shifts, while finance and store handlers do not',()=>{
 const s=fixture(),c=C.Assignment.get(s.configuration);c.nodes.contact.source='person';c.nodes.contact.person='zhou';s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);const t=intake(s);assert.equal(t.phase,'待分派');const payment=C.allocate(s,t,'payment');assert.equal(payment.person,'finance');
 const store=E.clone(t);store.flow.config.ticketFlow.nodes.find(n=>n.kind==='sales').personId='store2';assert.equal(C.allocate(s,store,'contact').person,'store2');clock('14:00');E.dispatchPending(s);assert.equal(t.owner,'zhou');
});
test('active node staffing and rule first-contact hours are used for new scheduled tickets',()=>{
 const s=fixture(),P=require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment),scene=P.prepare(s.configuration,s.configuration.ruleScenes[1]);scene.config.timing.firstContactHours=0.5;scene.config.ticketFlow.nodes[0].source='person';scene.config.ticketFlow.nodes[0].personId='chen';s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());clock('10:00');const t=intake(s);assert.equal(t.owner,'chen');assert.equal(t.taskDeadline,at('10:30'));
});
test('new shift settings never reassign tickets that already have an owner',()=>{
 const s=fixture();clock('10:00');const t=intake(s),snapshot=E.clone(t);const d=M.get(s.configuration);d.roster[DAY]={aftercare:'rest',chen:'rest',zhou:'rest'};s.configuration=M.save(s.configuration,'manager',d,d.version);assert.equal(E.dispatchPending(s),0);assert.deepEqual(t,snapshot);
});
test('fifth grade goes directly to its aftercare manager before opening time',()=>{
 const s=fixture(),d=C.Rules.newScene(s.configuration);d.level=5;d.name='五级紧急工单';s.configuration=C.Rules.saveScene(s.configuration,'manager',d,s.configuration.sceneRevision,Date.now());clock('03:00');const t=intake(s,5);assert.equal(t.owner,'manager');assert.equal(t.phase,'待首联');assert.equal(t.pendingAssignment,undefined);assert.equal(t.assignedAt,at('03:00'));
});
