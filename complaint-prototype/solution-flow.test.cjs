'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),P=require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment);
const seed=()=>C.initialize(E.seed()),base={name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款处理',description:'客户要求退款'};
function configure(s,edit){const scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(x=>x.level===2));edit(scene.config.ticketFlow.nodes,scene);P.validate(scene,s.configuration);s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());}
function create(s){const t=E.create(s,'chen',base);E.follow(s,t,t.currentAssignee,{connected:true,content:'线下已核实处理事项'});return t;}
const actor=(s,t)=>E.taskPeople(s,t)[0];
const proposal=(key='refund')=>({typeKey:key,refund:E.solutionIncludes.refund(key)?10000:0,compensation:E.solutionIncludes.compensation(key)?2000:0,content:'按线下沟通结果处理',account:'原支付渠道',exchangeItems:E.solutionIncludes.exchange(key)?[{name:'修护霜 50g',quantity:2,unitPrice:18000}]:[]});
const confirm=(s,t,p=proposal())=>E.confirmSolution(s,t,actor(s,t),p);
const voteAll=(s,t)=>{let n=0;while(t.phase==='待部门审批'){assert(n++<30);E.approve(s,t,actor(s,t),true,'核实完成');}};
const pay=(s,t)=>E.pay(s,t,actor(s,t),{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'PAY-'+t.id,proof:[{name:'付款凭证'}]});
test('seven types confirm without customer consent and follow the configured branches',()=>{
 for(const key of Object.keys(E.SOLUTION_TYPES)){const s=seed(),t=create(s);confirm(s,t,proposal(key));assert.equal(t.proposal.typeKey,key);assert.equal(t.proposal.status,'已确认');assert.equal(t.proposal.consent,undefined);assert.equal(t.execution.steps[0].done,true);assert.equal(t.phase,key==='exchange'?'待采购办理':key==='service'?'待结案':'待部门审批');if(E.solutionIncludes.exchange(key))assert.equal(t.proposal.exchangeValue,36000);}
});
test('invalid zero, hidden, fractional and exchange amounts fail before mutating the ticket or cursors',()=>{
 const s=seed(),t=create(s),before=E.clone(s);
 for(const [p,message] of [[{...proposal(),refund:0},/大于 0 的退款/],[{...proposal('compensation'),compensation:0},/大于 0 的赔偿/],[{...proposal('combined'),compensation:0},/赔偿/],[{...proposal('service'),refund:1},/不包含退款/],[{...proposal(),refund:1.5},/两位小数/],[{...proposal('exchange'),exchangeItems:[]},/置换商品/],[{...proposal('exchange'),exchangeItems:[{name:'',quantity:1,unitPrice:100}]},/商品名称/],[{...proposal('exchange'),exchangeItems:[{name:'商品',quantity:0.5,unitPrice:100}]},/整数/]])assert.throws(()=>confirm(s,t,p),message);
 assert.deepEqual(E.clone(s),before);
});
test('a funded path with no approval nodes reaches payment then explicit aftercare closure',()=>{
 const s=seed();configure(s,(nodes,scene)=>nodes.splice(1,nodes.length-2,P.node('payment',s.configuration,scene)));
 const t=create(s),owner=t.owner;confirm(s,t);assert.equal(t.phase,'待付款');assert.equal(t.approval,null);assert.equal(t.owner,owner);assert.equal(actor(s,t),'finance');
 assert.throws(()=>E.closeTicket(s,t,owner,{note:'跳过付款',completed:true}),/当前节点/);pay(s,t);assert.equal(t.phase,'待结案');assert.equal(actor(s,t),owner);assert.throws(()=>E.closeTicket(s,t,owner,{note:'处理完成'}),/确认/);E.closeTicket(s,t,owner,{note:'线下确认完成',completed:true});assert.equal(t.phase,'已结案');assert.deepEqual(E.taskPeople(s,t),[]);
});
test('a solution without funds may still visit an explicitly configured payment node',()=>{
 const s=seed();configure(s,(nodes,scene)=>nodes.splice(1,nodes.length-2,P.node('payment',s.configuration,scene)));const t=create(s);confirm(s,t,proposal('exchange'));assert.equal(t.phase,'待付款');assert.throws(()=>E.pay(s,t,actor(s,t),{result:'成功',amount:0}),/无退款或赔偿/);E.pay(s,t,actor(s,t),{result:'无需付款',reason:'仅置换商品，无资金事项'});assert.equal(t.phase,'待结案');assert.equal(t.payments.length,0);
});
test('store nodes use the ticket store, retain the aftercare owner and require a result',()=>{
 const s=seed();configure(s,(nodes,scene)=>nodes.splice(1,nodes.length-2,P.node('store',s.configuration,scene)));const t=create(s),owner=t.owner;confirm(s,t,proposal('exchange'));assert.equal(t.phase,'待门店办理');assert.equal(actor(s,t),'store2');assert.equal(t.owner,owner);assert.throws(()=>E.finishStore(s,t,owner,{note:'越权'}),/当前节点/);assert.throws(()=>E.finishStore(s,t,'store2',{note:' '}),/处理结果/);E.finishStore(s,t,'store2',{note:'已完成商品交付',files:[{name:'签收记录'}]});assert.equal(t.phase,'待结案');assert.equal(actor(s,t),owner);assert.equal(t.handlingRecords[0].files[0].name,'签收记录');
});
test('rejection returns to aftercare, retains history and re-evaluates a revised solution',()=>{
 const s=seed(),t=create(s),owner=t.owner;confirm(s,t);const original=E.clone(t.execution);assert.throws(()=>E.approve(s,t,actor(s,t),false,''),/原因/);E.approve(s,t,actor(s,t),false,'补充处理依据');assert.equal(t.phase,'处理中');assert.equal(actor(s,t),owner);assert.equal(t.proposal.status,'待调整');assert.equal(t.approval.status,'已驳回');confirm(s,t,proposal('service'));assert.equal(t.phase,'待结案');assert.equal(t.proposal.version,2);assert.equal(t.proposalHistory[0].typeKey,'refund');assert.equal(t.executionHistory[0].steps.length,original.steps.length);assert.equal(t.approvalHistory[0].status,'已驳回');
});
test('snapshot survives rule edits and reload, and level branches precede later plan branches',()=>{
 const s=seed(),F=C.Rules.Flow;configure(s,(nodes,scene)=>{const branch=F.branch();Object.assign(branch.branches[0],{judgeBy:'level',levels:[2],title:'二级门店核实',nodes:[P.node('store',s.configuration,scene)]});nodes.splice(1,0,branch);});const t=create(s),snapshot=E.clone(t.flow);
 configure(s,nodes=>nodes.splice(1,nodes.length-2));confirm(s,t);assert.equal(t.phase,'待门店办理');assert.equal(t.execution.path[0].title,'二级门店核实');assert.deepEqual(t.flow,snapshot);
 const reloaded=E.clone(s),same=reloaded.tickets.find(x=>x.id===t.id);E.finishStore(reloaded,same,actor(reloaded,same),{note:'核实完成'});assert.equal(same.phase,'待部门审批');voteAll(reloaded,same);assert.equal(same.phase,'待付款');
});
test('sequential and all-person department approvals only advance after the configured votes',()=>{
 for(const mode of ['all','sequential','any']){const s=seed(),c=C.Assignment.get(s.configuration);c.positions.find(p=>p.id==='finance').members=['finance','sun'];s.configuration=C.Assignment.save(s.configuration,'manager',c,c.version);configure(s,nodes=>nodes.splice(1,nodes.length-2,{...C.Rules.Flow.node(),title:'财务核实',source:'position',positionId:'finance',mode,handling:{hours:3}}));const t=create(s);confirm(s,t);assert.equal(t.phase,'待部门审批');assert.throws(()=>E.approve(s,t,'aftercare',true,''),/待审批/);if(mode==='sequential')assert.throws(()=>E.approve(s,t,'sun',true,''),/待审批/);E.approve(s,t,'finance',true,'同意');if(mode!=='any'){assert.equal(t.phase,'待部门审批');assert.deepEqual(E.taskPeople(s,t),['sun']);E.approve(s,t,'sun',true,'同意');}assert.equal(t.phase,'待结案');}
});
test('cc nodes record recipients and advance without fabricating an approval task',()=>{
 const s=seed();configure(s,nodes=>nodes.splice(1,nodes.length-2,{...C.Rules.Flow.node('cc'),title:'知会财务',source:'position',positionId:'finance'}));const t=create(s);confirm(s,t,proposal('service'));assert.equal(t.phase,'待结案');assert(t.participants.includes('finance'));assert.equal(t.execution.steps[1].done,true);assert.equal(t.approval,null);
});
test('unavailable node staff retains the confirmed solution and resumes after staffing is repaired',()=>{
 const s=seed();configure(s,(nodes,scene)=>{const store=P.node('store',s.configuration,scene);store.source='person';store.personId='store2';store.fallbackId='store2';nodes.splice(1,nodes.length-2,store);});const t=create(s);s.configuration.organization.appointments.find(p=>p.personId==='store2').active=false;confirm(s,t);assert.equal(t.phase,'待分派');assert.equal(t.pendingAssignment.mode,'flow-node');assert.equal(t.proposal.status,'已确认');const version=t.proposal.version;assert.throws(()=>E.retryFlowNode(s,t,'aftercare'),/经理/);s.configuration.organization.appointments.find(p=>p.personId==='store2').active=true;E.retryFlowNode(s,t,'manager');assert.equal(t.phase,'待门店办理');assert.equal(t.proposal.version,version);assert.equal(actor(s,t),'store2');
});
test('refunds reserve balance at confirmation, release on return and never pay twice',()=>{
 const s=seed(),a=create(s),b=create(s);confirm(s,a,{...proposal(),refund:250000});assert.throws(()=>confirm(s,b,{...proposal(),refund:100000}),/可退余额/);E.approve(s,a,actor(s,a),false,'重新核实金额');confirm(s,b,{...proposal(),refund:100000});voteAll(s,b);pay(s,b);const refunded=s.orders.find(o=>o.id===b.order).refunded;assert.equal(refunded,100000);assert.throws(()=>pay(s,b),/当前节点/);assert.equal(s.orders.find(o=>o.id===b.order).refunded,refunded);
});
test('payment failures retain the node, invalid evidence never advances, correction returns to sales',()=>{
 const s=seed(),t=create(s);confirm(s,t);voteAll(s,t);assert.throws(()=>E.pay(s,t,actor(s,t),{result:'成功',amount:10000,reference:'P'}),/凭证/);assert.equal(t.phase,'待付款');E.pay(s,t,actor(s,t),{result:'失败',reason:'账户信息待核实'});assert.equal(t.phase,'待付款');E.pay(s,t,actor(s,t),{result:'退回',reason:'请补充收款信息'});assert.equal(t.phase,'处理中');assert.equal(t.proposal.status,'待调整');
});
test('legacy sales tickets use the new confirmation while in-flight legacy approvals are preserved',()=>{
 const s=seed(),t=s.tickets.find(t=>t.phase==='处理中'&&t.level===2),untouched=E.clone(s.tickets.filter(x=>x.id!==t.id));confirm(s,t,proposal('service'));assert.equal(t.phase,'待结案');assert(t.flowHistory.length);assert(t.flow.config.ticketFlow);assert.deepEqual(E.clone(s.tickets.filter(x=>x.id!==t.id)),untouched);
});
test('configured sales staff and timing apply before scheduling is configured',()=>{
 const s=seed();configure(s,(nodes,scene)=>{scene.config.timing.firstContactHours=0.5;Object.assign(nodes[0],{source:'person',personId:'zhou',hours:6});});const t=E.create(s,'chen',base);assert.equal(t.owner,'zhou');assert.equal(t.taskDeadline-t.assignedAt,0.5*E.H);E.follow(s,t,'zhou',{connected:true,content:'已联系'});assert.equal(t.currentAssignee,'zhou');assert(Math.abs(t.taskDeadline-Date.now()-6*E.H)<1000);confirm(s,t,proposal('service'));assert.equal(actor(s,t),'zhou');
});
test('legacy actions cannot bypass a current handling node or close it by recording a callback',()=>{
 const s=seed(),t=create(s);confirm(s,t,proposal('service'));assert.throws(()=>E.review(s,t,actor(s,t),{result:'认可',note:'尝试旧接口'}),/当前流程|已取消/);assert.throws(()=>E.assign(s,t,'manager','finance','调度'),/当前流程|已取消/);assert.throws(()=>E.startApproval(s,t,actor(s,t),proposal()),/先完成/);assert.equal(t.phase,'待结案');
});
test('saving the editable source tree preserves existing aftercare solution, approval and closure execution',()=>{
 const s=seed(),scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(x=>x.level===2));P.prepareEntry(s.configuration,scene);const sales=scene.config.ticketFlow.nodes.find(n=>n.kind==='sales');sales.source='person';sales.personId='chen';scene.config.timing.firstContactHours=1;sales.hours=13;P.validate(scene,s.configuration);s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const t=E.create(s,'chen',{...base,channel:'门店H5 / A3'});E.follow(s,t,t.currentAssignee,{connected:true,content:'售后已核实'});assert.equal(t.owner,'chen');assert.equal(t.flow.doc.stage.process,13);confirm(s,t);assert.equal(t.execution.steps[0].kind,'sales');assert(!t.execution.steps.some(n=>n.entryRole==='store'||n.type==='end'));voteAll(s,t);pay(s,t);assert.equal(t.phase,'待结案');E.closeTicket(s,t,t.owner,{note:'处理完成',completed:true});assert.equal(t.phase,'已结案');
});
