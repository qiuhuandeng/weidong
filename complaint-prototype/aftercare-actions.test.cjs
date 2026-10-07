'use strict';
const {test,afterEach}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js'),P=require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment);
const pauseData=t=>({reasonType:'materials',expectedAt:Date.now()+24*E.H,evidenceId:E.suspensionEvidence(t)[0]?.id,basis:'已核实确需等待客户资料'});
const realNow=Date.now;afterEach(()=>{Date.now=realNow;});
const base={name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款协商',description:'申请退款'};
function setup(first=false){const s=C.initialize(E.seed()),t=E.create(s,'chen',base);if(!first)E.follow(s,t,t.owner,{connected:true,content:'已完成联系核实'});return {s,t};}
const noFunds={typeKey:'service',content:'协调完成',refund:0,compensation:0};
function confirm(s,t){E.confirmSolution(s,t,t.owner,{typeKey:'refund',content:'协商退款',refund:10000,compensation:0,account:'原支付渠道'});}
function snapshot(t){return E.clone({id:t.id,flow:t.flow,level:t.level,grading:t.grading,proposal:t.proposal,execution:t.execution,owner:t.owner,firstContact:t.firstContact,deadline:t.deadline,taskDeadline:t.taskDeadline,created:t.created});}
function memory(){const map=new Map();return {getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};}
test('same-department handoff moves ownership and task without changing deadlines, snapshots or round-robin queues',()=>{
 const {s,t}=setup(),before=snapshot(t),config=E.clone(s.configuration),cursors=E.clone(s.assignmentCursors),count=s.tickets.length;
 E.transferAftercare(s,t,t.owner,'chen','同事已线下确认接手');assert.equal(t.owner,'chen');assert.equal(t.currentAssignee,'chen');assert.deepEqual(E.taskPeople(s,t),['chen']);assert.equal(E.isPending(s,t,'aftercare'),false);assert.equal(E.canHandle(s,t,'aftercare'),false);assert(E.canView(s,t,'aftercare'));assert.deepEqual(snapshot(t),{...before,owner:'chen'});assert.deepEqual(s.configuration,config);assert.deepEqual(s.assignmentCursors,cursors);assert.equal(s.tickets.length,count);assert.equal(t.handoffs[0].from,'aftercare');assert.equal(t.handoffs[0].to,'chen');
});
test('handoff candidates exclude self, other departments, unrelated roles and inactive people',()=>{
 const {s,t}=setup();s.configuration.organization.appointments.find(p=>p.personId==='zhou').departmentId='finance';s.configuration.organization.appointments.find(p=>p.personId==='chen').active=false;
 const ids=E.transferCandidates(s,t).map(p=>p.id);for(const id of ['aftercare','zhou','chen','finance','sun','store2','gu','callback','intake'])assert(!ids.includes(id));assert(ids.includes('manager'));
 const before=E.clone(s);for(const id of ['aftercare','zhou','chen','finance','store2'])assert.throws(()=>E.transferAftercare(s,t,t.owner,id,'转交'),/同部门其他有效/);assert.throws(()=>E.transferAftercare(s,t,t.owner,'manager',' '),/原因/);assert.deepEqual(E.clone(s),before);
});
test('handoff requires the current owner or a same-department aftercare manager',()=>{
 const {s,t}=setup();assert.throws(()=>E.transferAftercare(s,t,'chen','zhou','非本人任务'),/权限/);assert.throws(()=>E.transferAftercare(s,t,'gu','zhou','审批主管越权'),/权限/);E.transferAftercare(s,t,'manager','zhou','经理安排交接');assert.equal(t.owner,'zhou');
});
test('node action switches are enforced in both dedicated operations and the old assign entry',()=>{
 const {s,t}=setup();Object.assign(t.flow.config.ticketFlow.nodes.find(n=>n.kind==='sales').actions,{transfer:false,store:false,suspend:false});assert.deepEqual(E.aftercarePermissions(s,t,t.owner),{transfer:false,store:false,suspend:false});
 assert.throws(()=>E.transferAftercare(s,t,t.owner,'chen','交接'),/未允许/);assert.throws(()=>E.assign(s,t,'manager','chen','绕过设置'),/未允许/);assert.throws(()=>E.requestStoreAssistance(s,t,t.owner,{note:'协助核实'}),/已取消/);assert.throws(()=>E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等资料'}),/未允许/);
});
test('saved action switches apply to new tickets while old ticket permissions keep their snapshot',()=>{
 const {s,t}=setup(),scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(r=>r.level===2));scene.config.ticketFlow.nodes[0].actions={transfer:false,store:false,suspend:false};s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const fresh=E.create(s,'chen',base);assert.equal(E.aftercarePermissions(s,fresh,fresh.owner).store,false);assert.equal(E.aftercarePermissions(s,t,t.owner).store,false);
});
test('handoff before first contact keeps the original first-contact deadline and the new owner continues handling',()=>{
 const {s,t}=setup(true),deadline=t.taskDeadline,assigned=t.assignedAt;E.transferAftercare(s,t,t.owner,'zhou','换人联系');assert.equal(t.phase,'待首联');assert.equal(t.taskDeadline,deadline);assert.equal(t.assignedAt,assigned);E.follow(s,t,'zhou',{connected:true,content:'已联系客户'});assert.equal(t.phase,'处理中');assert.equal(t.currentAssignee,'zhou');assert.equal(t.owner,'zhou');
});
test('retired assistance APIs cannot alter tickets even when old node snapshots allow it',()=>{
 const {s,t}=setup(),before=E.clone(s);for(const action of ['requestStoreAssistance','finishStoreAssistance','cancelStoreAssistance'])assert.throws(()=>E[action](s,t,t.owner,{note:'旧入口'}),/已取消/);assert.deepEqual(E.clone(s),before);
});
test('old active assistance returns to aftercare once, preserving evidence, owner and deadlines',()=>{
 const {s,t}=setup(),before=snapshot(t);t.storeAssistance={id:'OLD',returnState:t.phase,assignee:'store2',instructions:'核实服务记录',files:[{name:'附件'}],at:Date.now()};t.phase='待门店协同';t.currentAssignee='store2';E.prepareTickets(s);assert.deepEqual(snapshot(t),before);assert.equal(t.storeAssistance,undefined);assert.equal(t.storeAssistanceHistory[0].files[0].name,'附件');const loaded=E.clone(s);E.prepareTickets(s);assert.deepEqual(s,loaded);
});
test('suspension cannot be bypassed through workflow actions or early closure',()=>{
 const {s,t}=setup();E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等待资料'});const before=E.clone(s);for(const action of [()=>E.confirmSolution(s,t,t.owner,noFunds),()=>E.follow(s,t,t.owner,{content:'越过',connected:true}),()=>E.closeEarly(s,t,t.owner,{note:'越过',completed:true})])assert.throws(action,/挂起|待办事项/);assert.deepEqual(E.clone(s),before);
});
test('suspension pauses only the node clock, survives reload and resumes remaining time',()=>{
 let now=Date.parse('2026-10-07T02:00:00Z');Date.now=()=>now;const {s,t}=setup(),before=snapshot(t);now+=E.H;E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等客户补充资料',expectedAt:now+6*E.H});assert.equal(t.phase,'已挂起');assert.equal(t.taskDeadline,null);assert.equal(t.deadline,before.deadline);assert.equal(t.suspension.clock,'node');assert.deepEqual(E.taskPeople(s,t),[t.owner]);assert.equal(E.canHandle(s,t,t.owner),false);
 const loaded=E.clone(s),same=loaded.tickets.find(x=>x.id===t.id);now+=3*E.H;E.resumeTicket(loaded,same,same.owner,'资料已收到');assert.equal(same.phase,'处理中');assert.equal(same.taskDeadline,before.taskDeadline+3*E.H);assert.equal(same.deadline,before.deadline);assert.equal(same.currentAssignee,before.owner);assert.equal(same.suspensionHistory[0].duration,3*E.H);assert.equal(same.suspension,undefined);assert.deepEqual(same.flow,before.flow);assert.equal(same.proposal,before.proposal);
});
test('overdue node time remains overdue after resume, and repeated pauses only add actual suspension durations',()=>{
 let now=Date.parse('2026-10-07T02:00:00Z');Date.now=()=>now;const {s,t}=setup(),whole=t.deadline;t.taskDeadline=now-E.H;const original=t.taskDeadline;E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'外部资料暂缺'});now+=2*E.H;E.resumeTicket(s,t,'manager','收到补充');assert.equal(t.taskDeadline,original+2*E.H);assert.equal(now-t.taskDeadline,E.H);E.suspendTicket(s,t,'manager',{...pauseData(t),note:'补充第二份材料'});now+=E.H;E.resumeTicket(s,t,t.owner,'补齐');assert.equal(t.taskDeadline,original+3*E.H);assert.equal(now-t.taskDeadline,E.H);assert.equal(t.deadline,whole);assert.equal(t.suspensionHistory.length,2);
});
test('first-contact suspension resumes first contact rather than moving to processing',()=>{
 let now=Date.parse('2026-10-07T02:00:00Z');Date.now=()=>now;const {s,t}=setup(true),due=t.taskDeadline;E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'客户暂时无法联系'});now+=E.H;E.resumeTicket(s,t,t.owner,'已到约定时间');assert.equal(t.phase,'待首联');assert.equal(t.firstContact,null);assert.equal(t.taskDeadline,due+E.H);
});
test('suspension reason, follow-up time, resume note and operator permissions are validated atomically',()=>{
 const {s,t}=setup();let before=E.clone(s);assert.throws(()=>E.suspendTicket(s,t,t.owner,{...pauseData(t),note:' '}),/挂起原因/);assert.throws(()=>E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'挂起',expectedAt:'invalid'}),/恢复时间/);assert.throws(()=>E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'挂起',expectedAt:Date.now()-1}),/恢复时间/);assert.throws(()=>E.suspendTicket(s,t,'finance',{...pauseData(t),note:'越权'}),/权限/);assert.deepEqual(E.clone(s),before);E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等待资料'});before=E.clone(s);assert.throws(()=>E.resumeTicket(s,t,'chen','越权'),/负责人/);assert.throws(()=>E.resumeTicket(s,t,t.owner,' '),/恢复说明/);assert.deepEqual(E.clone(s),before);
});
test('whole-ticket reminders continue during suspension while paused node reminders stop',()=>{
 const {s,t}=setup();t.taskDeadline=Date.now()-E.H;t.deadline=Date.now()-2*E.H;E.suspendTicket(s,t,t.owner,{...pauseData(t),note:'等待外部结果'});const tasks=E.ruleTasks(s,t);assert(tasks.some(x=>x.title==='整单超时'));assert(!tasks.some(x=>x.title==='节点超时'||x.title==='节点临期'));assert.equal(tasks[0].title,'恢复办理');
});
test('after department rejection, transfer preserves the rejected plan and resume the same sales node',()=>{
 const {s,t}=setup();confirm(s,t);E.approve(s,t,E.taskPeople(s,t)[0],false,'请核实服务记录');const original=E.clone(t.proposal),flow=E.clone(t.flow),version=t.proposal.version;E.transferAftercare(s,t,t.owner,'zhou','交同事继续处理');E.follow(s,t,'zhou',{connected:true,content:'已补充核实服务记录'});assert.equal(t.execution.index,0);assert.equal(E.currentFlowNode(t).done,false);assert.deepEqual(t.proposal,original);assert.deepEqual(t.flow,flow);E.confirmSolution(s,t,'zhou',noFunds);assert.equal(t.proposal.version,version+1);assert.equal(t.phase,'待结案');assert.equal(t.owner,'zhou');assert.deepEqual(E.taskPeople(s,t),['zhou']);
});
test('aftercare-only operations cannot act on formal store, approval, payment, closure or completed nodes',()=>{
 const {s,t}=setup();confirm(s,t);for(const state of ['待部门审批','待付款','待门店办理','待结案','已结案']){const x=E.clone(t);x.phase=state;assert.deepEqual(E.aftercarePermissions(s,x,x.owner),{});assert.throws(()=>E.transferAftercare(s,x,x.owner,'zhou','错误阶段'),/未允许/);assert.throws(()=>E.suspendTicket(s,x,x.owner,{...pauseData(x),note:'错误阶段'}),/未允许/);}
});
test('shared storage rejects stale early closure after another operator transfers the ticket',()=>{
 const mem=memory(),store=Store.createStore(mem,E,C),s=store.load(),t=E.create(s,'chen',base);E.follow(s,t,t.owner,{connected:true,content:'已联系'});store.save(s);const stale=store.load(),current=store.load(),ct=current.tickets.find(x=>x.id===t.id);E.transferAftercare(current,ct,ct.owner,'zhou','交接继续办理');store.save(current);const st=stale.tickets.find(x=>x.id===t.id);E.closeEarly(stale,st,st.owner,{note:'已安抚',completed:true});assert.throws(()=>store.save(stale),/其他页面/);assert.equal(store.load().tickets.find(x=>x.id===t.id).owner,'zhou');
});
