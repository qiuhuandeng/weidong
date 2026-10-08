/* Shared PC/H5 operations: source entry, early closure and detailed fulfilment. */
(function(root){
'use strict';
function createTicketOperations(E,C,P){
 const old={...E},copy=E.clone,assert=(v,m)=>{if(!v)throw Error(m);};
 const products=[{id:'repair-cream',name:'舒缓修护霜 50g',unitPrice:18000},{id:'repair-mask',name:'舒缓修护面膜 5片装',unitPrice:12000},{id:'hydrating-serum',name:'保湿精华 30ml',unitPrice:26000}];
 const Sources=typeof module!=='undefined'&&module.exports?require('./ticket-sources.js'):root.TicketSources;
 const source=t=>Sources.key(t.channel);
 const isStore=t=>!!t.storeIntake&&!t.storeIntake.completedAt&&t.phase!=='已结案';
 const sync=t=>{t.state=E.ticketStatus(t);};
 function transact(t,fn){const before=copy(t.nodeTiming||E.initialNodeClock(t));const result=fn();E.trackNodeClock(t,before);sync(t);return result;}
 function storePerson(s,t,node){
  const o=s.orders.find(o=>o.id===t.order),customers=[...(s.customers||[]),...(s.configuration.customers||[])];
  const customer=customers.find(c=>t.customerId&&c.id===t.customerId||t.member&&c.member===t.member);
  const ids=node.source==='receptionist'?[o?.receptionistId||t.receptionistId||customer?.receptionistId]:C.Rules.Flow.organization(s.configuration).departments.find(d=>d.store===t.store)?.leaders||[];
  const id=ids.find(id=>C.active(s,id)&&C.STAFF.some(p=>p.id===id&&(p.store==='*'||p.store===t.store)));
  assert(id,node.source==='receptionist'?'客户未配置有效的接待老师，请维护关联资料后重试':'工单所属门店未配置有效负责人，请维护门店任职后重试');return id;
 }
 function routeStoreEntry(s,t){
  if(t.storeIntake?.completedAt)return false;
  if(t.flow?.config?.ticketFlow?.schema!==2)return false;
  const steps=P.entryPath({level:t.level,config:t.flow.config},{source:source(t)}),node=steps.slice(0,steps.findIndex(n=>n.kind==='sales')<0?steps.length:steps.findIndex(n=>n.kind==='sales')).find(n=>n.kind==='store');
  if(!node)return false;
  t.storeIntake??={node:copy(node),startedAt:Date.now(),source:source(t)};t.owner='';t.activeNode=node.id;t.taskDeadline=null;
  try{const who=storePerson(s,t,node);delete t.pendingAssignment;t.currentAssignee=who;t.phase='待门店首联';t.assignedAt=Date.now();t.taskDeadline=t.assignedAt+t.flow.doc.stage.first*E.H;t.participants=[...new Set([...t.participants,who])];E.log(t,'系统','进入门店办理',E.user(who).name+'；按工单来源匹配');}
  catch(error){t.phase='待分派';t.currentAssignee='manager';t.pendingAssignment={mode:'entry-node',node:node.id,dispatcher:'manager',reason:error.message};t.participants=[...new Set([...t.participants,'manager'])];E.log(t,'系统','门店办理人待匹配',error.message);}
  return true;
 }
 function requireStore(s,t,a){assert(isStore(t)&&!t.pendingAssignment&&!t.suspension&&t.currentAssignee===a&&C.active(s,a),'请由当前门店办理人操作');}
 function follow(s,t,a,data){
  if(isStore(t)&&Object.hasOwn(data,'result'))return handleStoreIntake(s,t,a,data);
  if(isStore(t))return transact(t,()=>{requireStore(s,t,a);assert(data.content?.trim(),'请填写沟通内容');if(data.connected){t.firstContact??=Date.now();t.storeIntake.contactedAt??=Date.now();t.phase='门店处理中';t.taskDeadline=t.assignedAt+t.storeIntake.node.hours*E.H;}E.log(t,a,data.connected?'有效联系 / 跟进':'联系尝试',(data.method||'电话')+' · '+(data.connected?'已接通':'未接通')+'\n'+data.content.trim());t.attachments.push(...copy(data.files||[]));t.nextFollow=data.next||'';});
  if(Object.hasOwn(data,'result'))return handleAftercareFollow(s,t,a,data);
  return recordAftercareFollow(s,t,a,data);
 }
 function recordAftercareFollow(s,t,a,data){
  const first=t.firstContact;const result=old.follow(s,t,a,data);if(t.storeIntake?.completedAt&&data.connected){t.aftercareContactAt??=Date.now();t.firstContact=first||t.firstContact;}return result;
 }
 function handleAftercareFollow(s,t,a,data){
  assert(E.isAftercareStage(s,t)&&E.canHandle(s,t,a)&&C.active(s,a)&&!t.workflowIssue&&!t.mergedInto,'请由当前售后办理人填写跟进');
  const content=data.content?.trim(),resolved=data.result==='resolved';
  assert(content,'请填写沟通内容');assert(['resolved','plan'].includes(data.result),'请选择本次处理结果');
  assert(typeof data.connected==='boolean','请选择联系结果');
  if(resolved){
   assert(data.connected,'请有效联系客户后结案');
   assert(canCloseEarly(s,{...t,firstContact:t.firstContact||Date.now(),aftercareContactAt:t.aftercareContactAt||Date.now()},a),'仍有待完成的退款、赔偿或商品置换事项，请继续填写方案');
  }
  recordAftercareFollow(s,t,a,{...data,next:resolved?'':data.next,content:content+'\n本次处理结果：'+(resolved?'沟通已解决，直接结案':'需继续跟进，填写方案')});
  if(resolved)return closeEarly(s,t,a,{note:content,completed:true});
 }
 function finishStoreIntake(s,t,a,data){return transact(t,()=>completeStoreIntake(s,t,a,data));}
 function completeStoreIntake(s,t,a,data){
  requireStore(s,t,a);assert(t.storeIntake.contactedAt,'请先记录与客户的有效沟通');assert(data.note?.trim(),'请填写未解决原因及交接说明');
  const route=P.entryPath({level:t.level,config:t.flow.config},{source:source(t),storeResult:'unresolved'});assert(route.some(n=>n.kind==='sales'),'当前规则未配置未解决转售后的路径，请先核对流程');
  t.storeIntake.completedAt=Date.now();t.storeIntake.result='unresolved';t.storeIntake.note=data.note.trim();t.storeIntake.by=a;t.attachments.push(...copy(data.files||[]));E.log(t,a,'门店处理：未解决，已转售后',data.note.trim());
  t.phase='待首联';t.currentAssignee='';t.owner='';delete t.pendingAssignment;
  try{C.activate(s,t,'contact');if(t.owner){t.taskDeadline=Date.now()+t.flow.doc.stage.process*E.H;}}
  catch(error){t.phase='待分派';t.pendingAssignment={mode:'configuration',dispatcher:'manager',reason:error.message};t.currentAssignee='manager';t.taskDeadline=null;}
 }
 function canCloseEarly(s,t,a){
  if(t.suspension||t.pendingAssignment||t.workflowIssue||['已结案','已合并'].includes(t.phase))return false;
  if(isStore(t))return t.currentAssignee===a&&C.active(s,a)&&!!t.storeIntake.contactedAt;
  if(!E.isAftercareStage(s,t)||!E.canHandle(s,t,a)||!t.firstContact||t.storeIntake&&!t.aftercareContactAt)return false;
  return !t.proposal||!(t.proposal.refund||t.proposal.compensation||t.proposal.exchangeItems?.length);
 }
 function closeEarly(s,t,a,data){return transact(t,()=>completeEarlyClosure(s,t,a,data));}
 function completeEarlyClosure(s,t,a,data){
  assert(canCloseEarly(s,t,a),'当前节点仍有待办事项，或尚未有效联系客户，不能直接结案');assert(data.note?.trim(),'请填写结案说明');assert(data.completed===true||data.completed==='yes','请确认客户问题已解决且无未完成的退款、赔偿、置换事项');
  const store=isStore(t);if(store){t.storeIntake.completedAt=Date.now();t.storeIntake.result='resolved';t.storeIntake.note=data.note.trim();t.storeIntake.by=a;}
  t.closure={kind:store?'store':'sales',by:a,at:Date.now(),note:data.note.trim(),early:true};
  if(t.execution){t.execution.steps.forEach((n,i)=>{if(i===t.execution.index){n.done=true;n.completedAt=Date.now();n.completedBy=a;}else if(i>t.execution.index)n.skipped=true;});t.execution.completedAt=Date.now();}
  t.phase='已结案';t.closed=Date.now();t.currentAssignee='';t.taskDeadline=null;E.log(t,a,store?'门店处理：已解决并结案':'售后直接结案',data.note.trim());
 }
 function handleStoreIntake(s,t,a,data){
  requireStore(s,t,a);assert(!t.workflowIssue,'请先核对当前工单的办理流程');
  const content=data.content?.trim(),result=data.result,continuing=result==='continue';
  assert(content,'请填写沟通情况');assert(['resolved','unresolved','continue'].includes(result),'请选择本次处理结果');
  if(continuing)assert(typeof data.connected==='boolean','请选择本次联系情况');
  else assert(data.connected!==false,'未有效联系客户，请选择需继续跟进');
  // Check the complete transition before recording any communication.
  if(result==='unresolved')assert(P.entryPath({level:t.level,config:t.flow.config},{source:source(t),storeResult:'unresolved'}).some(n=>n.kind==='sales'),'当前规则未配置未解决转售后的路径，请先核对流程');
  if(result==='resolved')assert(canCloseEarly(s,{...t,storeIntake:{...t.storeIntake,contactedAt:t.storeIntake.contactedAt||Date.now()}},a),'当前节点仍有待办事项，不能直接结案');
  return transact(t,()=>{
   const now=Date.now(),connected=!continuing||data.connected;
   if(connected){
    t.firstContact??=now;
    if(!t.storeIntake.contactedAt){t.storeIntake.contactedAt=now;t.taskDeadline=t.assignedAt+t.storeIntake.node.hours*E.H;}
    t.phase='门店处理中';
   }
   t.storeIntake.lastHandledAt=now;t.storeIntake.lastResult=result;
   t.nextFollow=continuing?data.next||'':'';t.attachments.push(...copy(data.files||[]));
   E.log(t,a,connected?'有效联系 / 跟进':'联系尝试',(data.method||'电话')+' · '+(connected?'已接通 / 有效沟通':'未接通')+'\n'+content+'\n处理结果：'+({resolved:'已解决',unresolved:'未解决，转售后',continue:'需继续跟进'})[result]+(t.nextFollow?'\n下次跟进：'+t.nextFollow:''));
   if(result==='resolved')completeEarlyClosure(s,t,a,{note:content,completed:true});
   else if(result==='unresolved')completeStoreIntake(s,t,a,{note:content});
  });
 }
 function assignmentCandidates(s,t){return (t.pendingAssignment?.candidates||[]).map(id=>C.STAFF.find(p=>p.id===id)).filter(p=>p&&C.active(s,p.id)&&['售后专员','售后主管'].includes(p.role)&&(p.store==='*'||p.store===t.store));}
 function canAssignPending(s,t,a){return !!t.pendingAssignment&&['schedule',undefined].includes(t.pendingAssignment.mode)&&C.active(s,a)&&(t.pendingAssignment.dispatcher===a||C.STAFF.some(p=>p.id===a&&p.role==='售后主管'));}
 function assign(s,t,a,person,note){
  if(t.pendingAssignment?.mode!=='schedule')return old.assign(s,t,a,person,note);
  return transact(t,()=>{assert(canAssignPending(s,t,a),'只有分派负责人或售后经理可提前分派');assert(assignmentCandidates(s,t).some(p=>p.id===person),'请选择当前节点的有效售后候选人');assert(note?.trim(),'请填写分派原因');C.assignPending(s,t,person);t.assignedAt=Date.now();t.taskDeadline=t.assignedAt+(t.firstContact?t.flow.doc.stage.process:t.flow.doc.stage.first)*E.H;t.participants=[...new Set([...t.participants,person,a])];E.log(t,a,'手工提前分派',E.user(person).name+'；'+note.trim());});
 }
 function orderItems(o){return o?.items?.length?o.items:o?[{id:o.id+'-item',name:o.project,quantity:1,paid:o.paid,refunded:o.refunded||0}]:[];}
 function reservedTickets(s,t,o){return s.tickets.filter(x=>x.id!==t.id&&(x.proposal?.refundOrderId||x.order)===o.id&&x.proposal?.refund>0&&((x.proposal.status==='已确认'&&!['已结案','已合并'].includes(x.phase))||x.phase==='待打款')&&!x.payments.some(p=>p.result==='成功'&&p.version===x.proposal.version));}
 function refundBalance(s,t,o,item){const reserved=reservedTickets(s,t,o);return Math.max(0,item?item.paid-(item.refunded||0)-reserved.reduce((v,x)=>v+(x.proposal.refundItems?.find(i=>i.itemId===item.id)?.amount||(!x.proposal.refundItems?x.proposal.refund:0)),0):o.paid-(o.refunded||0)-reserved.reduce((v,x)=>v+x.proposal.refund,0));}
 function refundStaff(s,store){return C.STAFF.filter(p=>C.active(s,p.id)&&p.store===store);}
 function validateFinancialDetails(s,t,data){
  const k=data.typeKey,rf=E.solutionIncludes.refund(k),funded=rf||E.solutionIncludes.compensation(k);let detail={detailsVersion:2};
  if(rf){const o=s.orders.find(o=>o.id===data.refundOrderId&&o.phone===t.phone);assert(o,'请选择客户本人需要退款的订单');assert(Array.isArray(data.refundItems)&&data.refundItems.length,'请针对订单项目填写退款金额');const ids=new Set();const rows=data.refundItems.map(row=>{assert(!ids.has(row.itemId),'退款项目不能重复');ids.add(row.itemId);const item=orderItems(o).find(i=>i.id===row.itemId);assert(item,'退款项目不属于所选订单');assert(Number.isSafeInteger(row.amount)&&row.amount>0,'项目退款金额须大于 0 且最多两位小数');assert(row.amount<=refundBalance(s,t,o,item),'项目退款超过可退余额（含其他工单占用）');return {itemId:item.id,name:item.name,quantity:item.quantity,paid:item.paid,amount:row.amount};});const total=rows.reduce((v,i)=>v+i.amount,0);assert(total===data.refund,'退款合计与项目明细不一致');assert(total<=refundBalance(s,t,o),'退款超过订单可退余额（含其他工单占用）');assert(E.STORES.includes(data.refundStore),'请选择退款所属门店');assert(refundStaff(s,data.refundStore).some(p=>p.id===data.performanceId),'请选择退款门店有效的业绩归属人员');Object.assign(detail,{refundOrderId:o.id,refundOrderNo:o.external,refundItems:rows,refundStore:data.refundStore,performanceId:data.performanceId});}
  if(funded){const p=data.payout||{};assert(['bank','alipay','wechat'].includes(p.method),'请选择收款方式');assert(p.name?.trim(),p.method==='bank'?'请填写开户姓名':'请填写收款人姓名');assert(p.account?.trim(),'请填写收款账号');if(p.method==='bank'){assert(/^\d{12,30}$/.test(p.account.trim()),'请填写 12 至 30 位银行卡号');assert(p.bank?.trim(),'请填写开户银行');}else assert(p.account.trim().length>=3&&p.account.trim().length<=100,'请填写有效的收款账号');detail.payout={method:p.method,name:p.name.trim(),account:p.account.trim(),bank:p.method==='bank'?p.bank.trim():''};detail.account=({bank:'银行卡',alipay:'支付宝',wechat:'微信'})[p.method]+' · '+detail.payout.name+' · '+detail.payout.account+(detail.payout.bank?' · '+detail.payout.bank:'');}
  if(E.solutionIncludes.exchange(k)){assert(data.exchangeItems?.length,'请选择置换商品');detail.exchangeItems=data.exchangeItems.map(row=>{const product=products.find(p=>p.id===row.productId);assert(product,'请选择有效的置换商品');assert(String(row.remark||'').length<=500,'商品备注最多 500 字');return {...product,productId:product.id,quantity:row.quantity,remark:String(row.remark||'').trim()};});}
  return detail;
 }
 function prepareTickets(s){let changed=old.prepareTickets(s);for(const t of s.tickets){if(t.storeAssistance){const row=t.storeAssistance;t.storeAssistanceHistory??=[];t.storeAssistanceHistory.push({...copy(row),status:'已结束',completedAt:Date.now(),note:'门店协同入口已取消，恢复原售后办理，保留原时限。'});t.phase=row.returnState;t.currentAssignee=t.owner;delete t.storeAssistance;E.log(t,'系统','恢复售后办理','保留原记录及办理时限');sync(t);changed=true;}}return changed;}
 const retired=()=>{throw Error('转门店协同已取消，门店办理由工单来源和流程配置决定');};
 return {PRODUCTS:products,orderItems,refundBalance,refundStaff,validateFinancialDetails,routeStoreEntry,isStoreIntake:isStore,handleStoreIntake,finishStoreIntake,canCloseEarly,closeEarly,assignmentCandidates,canAssignPending,assign,follow,prepareTickets,
  taskPeople:(s,t)=>isStore(t)?[t.pendingAssignment?.dispatcher||t.currentAssignee].filter(Boolean):old.taskPeople(s,t),
  canHandle:(s,t,a)=>isStore(t)?!t.pendingAssignment&&t.currentAssignee===a&&C.active(s,a):old.canHandle(s,t,a),
  isPending:(s,t,a)=>isStore(t)?E.taskPeople(s,t).includes(a):old.isPending(s,t,a),
  canView:(s,t,a)=>old.canView(s,t,a)||isStore(t)&&E.taskPeople(s,t).includes(a),
  confirmSolution:(s,t,a,d)=>{assert(!isStore(t),'请先完成门店办理');assert(!t.storeIntake||t.aftercareContactAt,'请售后先记录与客户的有效沟通');return old.confirmSolution(s,t,a,d);},
  retryStoreEntry:(s,t,a)=>transact(t,()=>{assert(t.pendingAssignment?.mode==='entry-node'&&E.canConfirmGrading(s,t,a),'请由售后经理重新匹配门店办理人');routeStoreEntry(s,t);}),
  aftercarePermissions:(s,t,a)=>{const p=old.aftercarePermissions(s,t,a);if('store' in p)p.store=false;return p;},requestStoreAssistance:retired,finishStoreAssistance:retired,cancelStoreAssistance:retired};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createTicketOperations;else root.createTicketOperations=createTicketOperations;
})(typeof window!=='undefined'?window:globalThis);
