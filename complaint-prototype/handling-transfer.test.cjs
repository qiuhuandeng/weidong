'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration'),Store=require('./shared-store'),P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
const base={name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款协商',description:'申请退款'};
function setup(contact=true){const s=C.initialize(E.seed()),t=E.create(s,'chen',base);if(contact)E.follow(s,t,t.owner,{connected:true,content:'已联系客户'});return {s,t};}
function nodeFixture(kind){
 const {s,t}=setup(),scene={id:t.flow.id,level:t.level,config:t.flow.config},nodes=t.flow.config.ticketFlow.nodes;
 const salesIndex=nodes.findIndex(n=>n.kind==='sales');nodes.splice(salesIndex+1,nodes.length-salesIndex-2,P.node(kind,s.configuration,scene));
 E.confirmSolution(s,t,t.owner,{typeKey:kind==='payment'?'refund':'exchange',refund:kind==='payment'?10000:0,compensation:0,account:'原支付渠道',exchangeItems:kind==='payment'?[]:[{name:'修护霜',quantity:1,unitPrice:18000}]});return {s,t};
}
const clock=t=>E.clone({taskDeadline:t.taskDeadline,deadline:t.deadline,nodeTiming:t.nodeTiming,created:t.created,flow:t.flow,proposal:t.proposal});
test('temporary store handling permits multiple local handoffs and returns to the owner after reload',()=>{
 const map=new Map(),storage=Store.createStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},E,C),s=storage.load(),t=E.create(s,'chen',base);
 E.follow(s,t,t.owner,{connected:true,content:'已联系'});E.transferAftercare(s,t,t.owner,'zhou','负责人交接');const before=clock(t);
 E.requestStoreAssistance(s,t,'zhou',{store:'南京浦口店',person:'store1',note:'请门店核实'});assert.equal(t.owner,'zhou');assert.equal(t.store,'上海徐汇店');assert.deepEqual(E.taskPeople(s,t),['store1']);
 assert.deepEqual(E.handlingTransferCandidates(s,t).map(p=>p.id),['advisor1']);
 const blocked=E.clone(s);for(const id of ['zhou','store2','advisor2','finance','store1'])assert.throws(()=>E.transferHandling(s,t,'store1',id,'越界转派'));assert.throws(()=>E.confirmSolution(s,t,'zhou',{typeKey:'service'}));assert.deepEqual(E.clone(s),blocked);
 E.transferHandling(s,t,'store1','advisor1','顾问接手');assert.equal(t.owner,'zhou');assert.deepEqual(clock(t),before);assert.equal(E.isPending(s,t,'store1'),false);assert(E.isPending(s,t,'advisor1'));
 E.transferHandling(s,t,'advisor1','store1','店长继续核实');E.transferHandling(s,t,'store1','advisor1','顾问补齐结果');storage.save(s);
 const loaded=storage.load(),same=loaded.tickets.find(x=>x.id===t.id);assert.equal(same.storeAssistance.assignee,'advisor1');assert.equal(same.storeAssistance.handoffs.length,3);assert.equal(same.owner,'zhou');
 assert.throws(()=>E.finishStoreAssistance(loaded,same,'store1',{note:'旧办理人提交'}));E.finishStoreAssistance(loaded,same,'advisor1',{note:'资料已核实'});storage.save(loaded);
 const returned=storage.load().tickets.find(x=>x.id===t.id);assert.equal(returned.currentAssignee,'zhou');assert.equal(returned.owner,'zhou');assert.equal(returned.phase,'处理中');assert.equal(returned.storeAssistance,undefined);assert.equal(returned.storeAssistanceHistory[0].completedBy,'advisor1');assert.deepEqual(clock(returned),before);
});
test('store recipient eligibility follows active organization membership, including child departments',()=>{
 const {s,t}=setup(),org=s.configuration.organization;org.departments.push({id:'xuhui-advisors',name:'顾问组',parent:'store2',leaders:[]});org.appointments.find(p=>p.personId==='advisor2').departmentId='xuhui-advisors';
 assert(E.allStoreCandidates(s,t).some(p=>p.id==='advisor2'&&p.handlingStore==='上海徐汇店'));org.appointments.find(p=>p.personId==='advisor2').active=false;
 assert(!E.allStoreCandidates(s,t).some(p=>p.id==='advisor2'));const before=E.clone(s);assert.throws(()=>E.requestStoreAssistance(s,t,t.owner,{store:t.store,person:'advisor2',note:'已停用'}));assert.deepEqual(E.clone(s),before);
});
test('a returned first-contact ticket retains its owner through the next contact',()=>{
 const {s,t}=setup(false),owner=t.owner,due=t.taskDeadline;E.requestStoreAssistance(s,t,owner,{store:t.store,person:'advisor2',note:'先核对资料'});E.finishStoreAssistance(s,t,'advisor2',{note:'已核对'});assert.equal(t.phase,'待首联');assert.equal(t.firstContact,null);assert.equal(t.taskDeadline,due);
 E.follow(s,t,owner,{connected:true,content:'现已联系客户'});assert.equal(t.owner,owner);assert.equal(t.currentAssignee,owner);assert.equal(t.phase,'处理中');
});
test('payment and procurement can only hand off to active department colleagues, then complete normally',()=>{
 for(const kind of ['payment','procurement']){
  const {s,t}=nodeFixture(kind),from=t.currentAssignee,to=kind==='payment'?'finance2':'procurement2',owner=t.owner,before=clock(t),index=t.execution.index;
  assert(E.canTransferHandling(s,t,from));assert(E.handlingTransferCandidates(s,t).some(p=>p.id===to));const snapshot=E.clone(s);
  for(const person of ['aftercare','advisor2',from])assert.throws(()=>E.transferHandling(s,t,from,person,'越界'));assert.throws(()=>E.transferHandling(s,t,owner,to,'代转派'));assert.throws(()=>E.transferHandling(s,t,from,to,' '));assert.deepEqual(E.clone(s),snapshot);
  E.transferHandling(s,t,from,to,'同事忙，由本部门接手');assert.equal(t.owner,owner);assert.equal(t.execution.index,index);assert.equal(t.currentAssignee,to);assert.deepEqual(clock(t),before);assert.deepEqual(E.taskPeople(s,t),[to]);assert(!E.canHandle(s,t,from));
  if(kind==='payment')E.pay(s,t,to,{result:'成功',amount:10000,reference:'TRANSFER-'+t.id,proof:[{name:'付款凭证'}]});
  else E.finishProcurement(s,t,to,{method:'总部发货',items:[{lineIndex:0,quantity:1}]});
  assert.equal(t.phase,'待结案');assert.equal(t.currentAssignee,owner);
 }
});
test('formal store and initial store handling support local handoff without replacing the owner',()=>{
 const formal=nodeFixture('store'),s=C.initialize(E.seed()),t=E.create(s,'chen',{...base,channel:'400电话'});
 for(const [state,ticket] of [[formal.s,formal.t],[s,t]]){
  const owner=ticket.owner,before=clock(ticket);assert(owner);E.transferHandling(state,ticket,ticket.currentAssignee,'advisor2','顾问接手');assert.equal(ticket.owner,owner);assert.equal(ticket.currentAssignee,'advisor2');assert.deepEqual(clock(ticket),before);
  if(E.isStoreIntake(ticket))E.handleStoreIntake(state,ticket,'advisor2',{result:'unresolved',content:'请负责人继续处理',connected:true});else E.finishStore(state,ticket,'advisor2',{note:'门店已处理'});
  assert.equal(ticket.owner,owner);assert.equal(ticket.currentAssignee,owner);
 }
});
test('aftercare closure supports ownership handoff and a temporary store node without skipping closure',()=>{
 const {s,t}=setup();E.confirmSolution(s,t,t.owner,{typeKey:'service',refund:0,compensation:0});const index=t.execution.index;
 assert(E.aftercarePermissions(s,t,t.owner).transfer);E.transferAftercare(s,t,t.owner,'chen','交接结案');assert.equal(t.owner,'chen');assert.equal(t.currentAssignee,'chen');
 E.requestStoreAssistance(s,t,'chen',{store:'南京浦口店',person:'advisor1',note:'补核处理结果'});assert.equal(t.owner,'chen');assert.throws(()=>E.closeTicket(s,t,'chen',{aftercareType:'门店环境',note:'门店尚未办完',completed:true}));
 E.finishStoreAssistance(s,t,'advisor1',{note:'结果已核实'});assert.equal(t.phase,'待结案');assert.equal(t.execution.index,index);assert.equal(E.currentFlowNode(t).done,false);assert.equal(t.currentAssignee,'chen');
 E.closeTicket(s,t,'chen',{aftercareType:'门店环境',note:'已核实处理完成',completed:true});assert.equal(t.state,'已结案');assert.equal(t.owner,'chen');assert(!E.aftercarePermissions(s,t,'chen').transfer);assert(!E.canTransferHandling(s,t,'chen'));
});
test('stale saves cannot overwrite another colleague’s handoff',()=>{
 const map=new Map(),store=Store.createStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},E,C),s=store.load(),t=E.create(s,'chen',base);
 E.requestStoreAssistance(s,t,t.owner,{store:t.store,person:'store2',note:'门店处理'});store.save(s);const a=store.load(),b=store.load(),ta=a.tickets.find(x=>x.id===t.id),tb=b.tickets.find(x=>x.id===t.id);
 E.transferHandling(a,ta,'store2','advisor2','交接');store.save(a);E.finishStoreAssistance(b,tb,'store2',{note:'旧页面结果'});assert.throws(()=>store.save(b),/其他页面/);assert.equal(store.load().tickets.find(x=>x.id===t.id).currentAssignee,'advisor2');
});
