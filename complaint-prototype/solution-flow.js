/* Confirmed solutions advance configured ticket nodes; earlier records are adapted by ticket-lifecycle.js. */
(function(root){
'use strict';
function createSolutionFlow(E,C,P){
 const F=C.Rules.Flow,types=F.planTypes,assert=(v,m)=>{if(!v)throw Error(m);},copy=E.clone;
 const old=Object.fromEntries(['taskPeople','canHandle','canView','isPending','needsRiskReview','follow','approve','pay','review','withdraw','assign','escalate','startApproval','completeNormal'].map(k=>[k,E[k]]));
 const keyOf=p=>p.typeKey||Object.keys(types).find(k=>types[k]===p.type)||({'普通处理':'service','退款＋赔偿':'combined'})[p.type];
 const includesRefund=k=>['refund','combined','refund_exchange'].includes(k),includesCompensation=k=>['compensation','combined','compensation_exchange'].includes(k),includesExchange=k=>['exchange','refund_exchange','compensation_exchange'].includes(k);
 const current=t=>t.execution?.steps[t.execution.index];
 function taskPeople(s,t){
  if(!t.execution)return old.taskPeople(s,t);
  if(t.pendingAssignment)return [t.pendingAssignment.dispatcher];
  if(t.phase==='已结案')return [];
  const step=current(t);return step?.type==='approval'?t.approval.steps[t.approval.index].people.filter(id=>!t.approval.steps[t.approval.index].votes.includes(id)):[t.currentAssignee].filter(Boolean);
 }
 function canView(s,t,a){return old.canView(s,t,a)||!!t.execution&&taskPeople(s,t).includes(a);}
 function canHandle(s,t,a){return t.execution?!t.pendingAssignment&&t.phase!=='已结案'&&current(t)?.type==='handling'&&taskPeople(s,t).includes(a)&&C.active(s,a):old.canHandle(s,t,a);}
 function isPending(s,t,a){return t.execution?taskPeople(s,t).includes(a):old.isPending(s,t,a);}
 function requireTask(s,t,a,kind){assert(t.execution&&!t.pendingAssignment&&current(t)?.kind===kind&&canHandle(s,t,a),'请由当前节点的办理人操作');}
 function validateSolution(s,t,data){
  const detail=data.detailsVersion===2?E.validateFinancialDetails(s,t,{...data,typeKey:keyOf(data)}):{};data={...data,...detail};
  const typeKey=keyOf(data);assert(types[typeKey],'请选择有效的方案类型');assert(data.content?.trim(),'请填写处理方案');
  const refund=Number(data.refund??0),compensation=Number(data.compensation??0);
  assert([refund,compensation].every(n=>Number.isSafeInteger(n)&&n>=0),'金额须为非负数且最多两位小数');
  assert(includesRefund(typeKey)?refund>0:refund===0,includesRefund(typeKey)?'请输入大于 0 的退款金额':'当前方案不包含退款，请清除退款金额');
  assert(includesCompensation(typeKey)?compensation>0:compensation===0,includesCompensation(typeKey)?'请输入大于 0 的赔偿金额':'当前方案不包含赔偿，请清除赔偿金额');
  const items=includesExchange(typeKey)?data.exchangeItems||[]:[];
  assert(!includesExchange(typeKey)||items.length>0,'请填写置换商品');assert(items.length<=20,'置换商品最多 20 项');
  const exchangeItems=items.map(item=>{const name=String(item.name||'').trim(),quantity=Number(item.quantity),unitPrice=Number(item.unitPrice);assert(name&&name.length<=100,'请填写置换商品名称，最多 100 字');assert(Number.isInteger(quantity)&&quantity>0&&quantity<=9999,'置换数量须为 1 至 9999 的整数');assert(Number.isSafeInteger(unitPrice)&&unitPrice>0&&Number.isSafeInteger(unitPrice*quantity),'请输入有效的商品单价，须大于 0 且最多两位小数');return {name,quantity,unitPrice,value:unitPrice*quantity,...(item.productId?{productId:item.productId}:{}),remark:String(item.remark||'').trim()};});
  const exchangeValue=exchangeItems.reduce((v,x)=>v+x.value,0);assert(Number.isSafeInteger(exchangeValue)&&Number.isSafeInteger(refund+compensation),'方案金额过大');
  if(refund+compensation>0)assert(data.account?.trim(),'请填写收款方式');
  if(refund>0){const order=s.orders.find(o=>o.id===(data.refundOrderId||t.order));assert(order&&order.phone===t.phone,'退款方案须先关联并核实客户订单');const reserved=s.tickets.filter(x=>x.id!==t.id&&(x.proposal?.refundOrderId||x.order)===order.id&&((x.execution&&x.proposal?.status==='已确认'&&!['已结案','已合并'].includes(x.phase)&&!x.payments.some(p=>p.result==='成功'&&p.version===x.proposal.version))||(!x.execution&&x.phase==='待打款'))).reduce((v,x)=>v+(x.proposal?.refund||0),0);assert(refund<=order.paid-order.refunded-reserved,'退款超过订单可退余额（含其他工单占用）');}
  return {...detail,typeKey,type:types[typeKey],refund,compensation,exchangeItems,exchangeValue,content:data.content.trim(),account:refund+compensation>0?data.account.trim():'',status:'已确认'};
 }
 function flowSnapshot(s,t){
  if(t.flow?.config){const scene=P.prepare(s.configuration,{id:t.flow.id,name:t.flow.name,level:t.level,config:t.flow.config});P.validate(scene,s.configuration);return {...copy(t.flow),config:scene.config};}
  const scene=P.prepare(s.configuration,C.scene(s,t.level));P.validate(scene,s.configuration);const holder={...copy(t)};C.bind(s,holder);holder.flow.config=scene.config;return holder.flow;
 }
 function pathFor(flow,proposal,level){
  const steps=[],path=[],values={type:proposal.typeKey,refund:proposal.refund,compensation:proposal.compensation,total:proposal.refund+proposal.compensation};
  function walk(nodes){for(const n of nodes){if(n.type==='branch'){const b=n.branches.find(b=>b.fallback||F.matchesProposal(b,values,level));assert(b,'条件分支缺少默认路径');path.push({nodeId:n.id,branchId:b.id,title:b.title});walk(b.nodes);}else steps.push({...copy(n),done:false});}}
  walk(P.aftercareNodes(flow));assert(steps[0]?.kind==='sales'&&steps.at(-1)?.kind==='close','处理流程须从售后办理开始，并以客服结案结束');return {steps,path};
 }
 function context(s,t){const o=s.orders.find(o=>o.id===t.order);return {store:t.store,level:t.level,applicantId:t.proposal.confirmedBy,receptionistId:o?.receptionistId,now:Date.now()};}
 function eligible(s,t,id,kind){const person=C.STAFF.find(p=>p.id===id);return person&&C.active(s,id)&&(person.store==='*'||person.store===t.store)&&(kind!=='payment'||person.role==='财务审核')&&(kind!=='procurement'||person.role==='采购专员');}
 function handlingPerson(s,t,n){
  if(n.kind==='close'){assert(eligible(s,t,t.owner,n.kind),'售后主负责人已失效，请先维护人员配置');return t.owner;}
  let ids=[];
  if(n.source==='owner')ids=[t.owner];else if(n.source==='person')ids=[n.personId];
  else if(n.source==='receptionist'){const order=s.orders.find(o=>o.id===t.order),customer=[...(s.customers||[]),...(s.configuration.customers||[])].find(c=>t.customerId&&c.id===t.customerId||t.member&&c.member===t.member);const id=order?.receptionistId||t.receptionistId||customer?.receptionistId;assert(eligible(s,t,id,n.kind),'客户未配置有效的接待老师，请维护关联资料后重试');ids=[id];}
  else if(n.source==='store')ids=F.organization(s.configuration).departments.find(d=>d.store===t.store)?.leaders||[];
  else if(n.source==='position')ids=F.positions(s.configuration).find(p=>p.id===n.positionId)?.members||[];
  ids=ids.filter(id=>eligible(s,t,id,n.kind));
  if(!ids.length){assert(eligible(s,t,n.fallbackId,n.kind),'当前节点没有有效办理人，请维护岗位人员或兜底人员后重试');ids=[n.fallbackId];}
  s.assignmentCursors??={};const key='flow:'+n.id+':'+(n.positionId||n.source),cursor=s.assignmentCursors[key]||0;s.assignmentCursors[key]=cursor+1;return ids[cursor%ids.length];
 }
 function archiveApproval(t){if(t.approval){t.approvalHistory??=[];t.approvalHistory.push(copy(t.approval));t.approval=null;}}
 function enter(s,t){
  const step=current(t);assert(step,'处理流程缺少客服结案节点');
  try{
   delete t.pendingAssignment;const now=Date.now();t.currentAssignee='';
   if(step.type==='cc'){
    const people=[...new Set(F.resolveSource(F.organization(s.configuration),step,context(s,t)).flat())];t.participants=[...new Set([...t.participants,...people])];step.people=people;step.done=true;step.completedAt=now;E.log(t,'系统',step.title,'抄送：'+people.map(id=>E.user(id)?.name||id).join('、'));t.execution.index++;return enter(s,t);
   }
   if(step.type==='approval'){
    const groups=F.resolveApprovers(t.flow.config,F.organization(s.configuration),step,context(s,t));
    const tasks=groups.flatMap(group=>step.mode==='sequential'?group.map(id=>[id]):[group]).map((people,i)=>({id:step.id+'-'+i,nodeId:step.id,name:step.title,type:'approval',people,mode:step.mode==='sequential'?'all':step.mode,votes:[],done:false,hours:step.handling?.hours||24}));
    assert(tasks.length&&tasks.every(task=>task.people.length),'部门审批未匹配到有效人员，请维护人员配置');archiveApproval(t);
    t.approval={id:E.id(),scope:'department',scene:t.flow.name,version:t.flow.version,proposalVersion:t.proposal.version,initiator:t.proposal.confirmedBy,steps:tasks,index:0,status:'审批中',at:now};
    t.phase='待部门审批';t.currentAssignee=tasks[0].people[0];t.taskDeadline=now+tasks[0].hours*E.H;step.people=[...new Set(tasks.flatMap(x=>x.people))];
   }else{
    const person=handlingPerson(s,t,step);t.currentAssignee=person;step.people=[person];t.phase=({procurement:'待采购办理',store:'待门店办理',payment:'待付款',close:'待结案',sales:'处理中'})[step.kind];assert(t.phase,'无法识别办理节点类型');t.taskDeadline=now+step.hours*E.H;
   }
   step.startedAt??=now;t.activeNode=step.id;t.nodeOwners??={};t.nodeOwners[step.id]=t.currentAssignee;t.participants=[...new Set([...t.participants,...step.people])];E.log(t,'系统','进入'+step.title,step.people.map(id=>E.user(id)?.name||id).join('、'));
  }catch(error){
   const dispatcher=C.STAFF.find(p=>p.role==='售后主管'&&C.active(s,p.id))?.id||'manager';t.phase='待分派';t.currentAssignee=dispatcher;t.taskDeadline=null;t.pendingAssignment={mode:'flow-node',node:step.id,dispatcher,reason:error.message};t.participants=[...new Set([...t.participants,dispatcher])];E.log(t,'系统','节点办理待处理',step.title+'：'+error.message);
  }
 }
 function advance(s,t,a,note){const step=current(t);step.done=true;step.completedAt=Date.now();step.completedBy=a;step.result=note;E.log(t,a,'完成'+step.title,note);t.execution.index++;enter(s,t);}
 function confirmSolution(s,t,a,data){
  assert(t.phase==='处理中'&&(!t.execution||current(t)?.kind==='sales'),'请先完成联系跟进，或处理退回事项');assert(canHandle(s,t,a),'请由当前售后办理人确认方案');assert(t.firstContact,'请先填写有效联系与跟进记录');assert(!t.payments.some(p=>p.result==='成功'),'已有成功付款记录，请先核实已付款项，不能重新确认方案');
  const proposal=validateSolution(s,t,data),flow=flowSnapshot(s,t),route=pathFor(flow.config.ticketFlow,proposal,t.level);
  proposal.version=(t.proposal?.version||0)+1;proposal.confirmedBy=a;proposal.confirmedAt=Date.now();
  if(t.proposal){t.proposalHistory??=[];t.proposalHistory.push(copy(t.proposal));}if(t.execution){t.executionHistory??=[];t.executionHistory.push(copy(t.execution));}
  if(!t.flow?.config&&t.flow){t.flowHistory??=[];t.flowHistory.push(copy(t.flow));E.log(t,a,'匹配整单处理流程',flow.name+' · V'+flow.version);}
  archiveApproval(t);t.flow=flow;t.owner=t.owner||t.currentAssignee||a;t.proposal=proposal;t.execution={schema:1,proposalVersion:proposal.version,steps:route.steps,path:route.path,index:0,at:Date.now()};
  E.log(t,a,'确认解决方案',proposal.type+'；'+proposal.content+(proposal.exchangeItems.length?'\n置换商品：'+proposal.exchangeItems.map(x=>x.name+' × '+x.quantity).join('、'):''));advance(s,t,a,'解决方案已确认');return t;
 }
 function returnToSales(s,t,a,reason){
  assert(reason?.trim(),'请填写退回原因');assert(!t.payments.some(p=>p.result==='成功'&&p.version===t.proposal.version),'该方案已有成功付款，不能退回修改');
  if(t.approval?.status==='审批中')t.approval.status='已驳回';t.proposal.status='待调整';const from=current(t);from.returnedAt=Date.now();from.returnedBy=a;from.returnReason=reason.trim();
  t.execution.index=0;const sales=current(t);sales.done=false;t.phase='处理中';t.currentAssignee=t.owner;t.activeNode=sales.id;t.taskDeadline=Date.now()+sales.hours*E.H;delete t.pendingAssignment;E.log(t,a,'退回售后办理',from.title+'；'+reason.trim());
 }
 function approve(s,t,a,pass,note=''){
  if(!t.execution)return old.approve(s,t,a,pass,note);
  assert(t.phase==='待部门审批'&&current(t)?.type==='approval'&&taskPeople(s,t).includes(a)&&C.active(s,a),'不是当前待审批人员');assert(t.approval.proposalVersion===t.proposal.version,'方案版本已更新');
  if(!pass){returnToSales(s,t,a,note);return;}
  const task=t.approval.steps[t.approval.index];task.votes.push(a);E.log(t,a,'部门审批同意',task.name+'；'+(note.trim()||'同意'));
  if(task.mode==='any'||task.people.every(id=>task.votes.includes(id))){task.done=true;t.approval.index++;while(t.approval.steps[t.approval.index]?.type==='cc'){const cc=t.approval.steps[t.approval.index];cc.done=true;t.participants=[...new Set([...t.participants,...cc.people])];E.log(t,'系统',cc.name,'抄送：'+cc.people.map(id=>E.user(id).name).join('、'));t.approval.index++;}if(t.approval.index===t.approval.steps.length){t.approval.status='已通过';advance(s,t,a,note.trim()||'部门审批完成');}else{const next=t.approval.steps[t.approval.index];t.currentAssignee=next.people[0];t.taskDeadline=Date.now()+next.hours*E.H;}}
 }
 function pay(s,t,a,data){
  if(!t.execution)return old.pay(s,t,a,data);requireTask(s,t,a,'payment');
  if(data.result==='退回'){returnToSales(s,t,a,data.reason);return;}
  const amount=t.proposal.refund+t.proposal.compensation;
  if(amount===0){assert(data.result==='无需付款'&&data.reason?.trim(),'当前方案无退款或赔偿，请填写无需付款的说明');advance(s,t,a,'无需付款；'+data.reason.trim());return;}
  assert(['成功','失败'].includes(data.result),'请选择付款结果');
  assert(!t.payments.some(p=>p.result==='成功'&&p.version===t.proposal.version),'当前方案已付款');
  if(data.result==='成功'){
   assert(data.reference?.trim()&&data.proof?.length,'请填写交易流水号并上传付款凭证');assert(data.amount===amount,'实际付款金额必须等于方案金额');assert(!s.tickets.some(x=>x.payments.some(p=>p.result==='成功'&&p.reference===data.reference.trim())),'付款流水号已登记');
   if(t.proposal.refund){const o=s.orders.find(o=>o.id===(t.proposal.refundOrderId||t.order));assert(o&&o.refunded+t.proposal.refund<=o.paid,'订单可退余额不足，请核实');const rows=(t.proposal.refundItems||[]).map(row=>({row,item:E.orderItems(o).find(i=>i.id===row.itemId)}));for(const {row,item} of rows)assert(item&&(item.refunded||0)+row.amount<=item.paid,'订单项目可退余额不足，请核实');if(o.items)for(const {row,item} of rows)item.refunded=(item.refunded||0)+row.amount;o.refunded+=t.proposal.refund;}
  }else assert(data.reason?.trim(),'请填写付款失败原因');
  t.payments.push({id:E.id(),version:t.proposal.version,nodeId:current(t).id,at:Date.now(),actor:E.user(a).name,result:data.result,amount:data.result==='成功'?amount:0,reference:data.reference?.trim()||'',reason:data.reason||'',proof:copy(data.proof||[])});E.log(t,a,'付款'+data.result,data.result==='成功'?'流水号：'+data.reference:data.reason);if(data.result==='成功')advance(s,t,a,'付款完成');
 }
 function finishStore(s,t,a,data){requireTask(s,t,a,'store');assert(data.note?.trim(),'请填写门店处理结果');t.handlingRecords??=[];t.handlingRecords.push({nodeId:current(t).id,kind:'store',by:a,at:Date.now(),note:data.note.trim(),files:copy(data.files||[])});advance(s,t,a,data.note.trim());}
 function finishProcurement(s,t,a,data){
  requireTask(s,t,a,'procurement');assert(data.note?.trim(),'请填写采购办理结果');assert(data.completed===true||data.completed==='yes','请确认本节点的采购事项已完成');
  const reference=String(data.reference||'').trim();t.handlingRecords??=[];t.handlingRecords.push({id:E.id(),nodeId:current(t).id,kind:'procurement',version:t.proposal.version,at:Date.now(),actor:a,note:data.note.trim(),reference,items:copy(t.proposal.exchangeItems||[]),files:copy(data.files||[])});
  if(data.files)t.attachments.push(...copy(data.files));advance(s,t,a,data.note.trim()+(reference?'；单据号：'+reference:''));
 }
 function closeTicket(s,t,a,data){
  requireTask(s,t,a,'close');assert(data.note?.trim(),'请填写结案说明');assert(data.completed===true||data.completed==='yes','请确认相关部门及方案事项已处理完成');
  const payment=t.execution.steps.find(n=>n.kind==='payment');if((t.proposal?.refund||0)+(t.proposal?.compensation||0)>0)assert(t.payments.some(p=>p.result==='成功'&&p.version===t.proposal.version),'付款尚未完成，不能结案');
  const step=current(t);step.done=true;step.completedAt=Date.now();step.completedBy=a;step.result=data.note.trim();t.phase='已结案';t.closed=Date.now();t.taskDeadline=null;t.currentAssignee='';t.execution.completedAt=t.closed;E.log(t,a,'工单结案',data.note.trim());
 }
 function retryFlowNode(s,t,a){assert(t.pendingAssignment?.mode==='flow-node','当前节点无需重试');assert(C.STAFF.some(p=>p.id===a&&p.role==='售后主管')&&C.active(s,a),'请由售后经理重新匹配办理人');enter(s,t);}
 function follow(s,t,a,data){if(!t.execution)return old.follow(s,t,a,data);assert(t.phase!=='已结案'&&(taskPeople(s,t).includes(a)||t.owner===a)&&C.active(s,a),'当前人员不可添加跟进');assert(data.content?.trim(),'请填写沟通内容');E.log(t,a,'添加跟进',data.content.trim());t.nextFollow=data.next||'';if(data.files)t.attachments.push(...data.files);}
 function rejectLegacyAction(name,s,t,...args){assert(!t.execution,'请使用当前流程节点的办理操作');return old[name](s,t,...args);}
 return {SOLUTION_TYPES:types,solutionKey:keyOf,solutionIncludes:{refund:includesRefund,compensation:includesCompensation,exchange:includesExchange},currentFlowNode:current,validateSolution,confirmSolution,finishStore,finishProcurement,closeTicket,retryFlowNode,taskPeople,canView,canHandle,isPending,follow,approve,pay,
  needsRiskReview:t=>t.execution?false:old.needsRiskReview(t),
  startApproval:(s,t,a,p)=>t.execution?confirmSolution(s,t,a,p):old.startApproval(s,t,a,p),
  completeNormal:(s,t,a,note)=>t.execution?confirmSolution(s,t,a,{type:'无退赔',content:note}):old.completeNormal(s,t,a,note),
  review:(s,t,...args)=>rejectLegacyAction('review',s,t,...args),withdraw:(s,t,...args)=>rejectLegacyAction('withdraw',s,t,...args),assign:(s,t,...args)=>rejectLegacyAction('assign',s,t,...args),escalate:(s,t,...args)=>rejectLegacyAction('escalate',s,t,...args)};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createSolutionFlow;else root.createSolutionFlow=createSolutionFlow;
})(typeof window!=='undefined'?window:globalThis);
