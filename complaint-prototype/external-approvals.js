/* Local approval interactions for the prototype. No backend, credentials or
 * network connection are required to present the workflow. */
(function(root){
'use strict';
function create(E,C,P,T){
 const copy=E.clone,assert=(v,m)=>{if(!v)throw Error(m);};
 const record=(s,id)=>(s.approvalRecords||[]).find(r=>r.id===id);
 const final=new Set(['approved','refused','terminated']);
 const node=(id,title,hours=24)=>({id:E.id(),type:'approval',provider:'dingtalk',title,templateId:id,handling:{hours}});
 const active=(s,t)=>record(s,t.approval?.recordId);
 function sync(t,before){t.state=E.ticketStatus(t);E.trackNodeClock(t,before);}
 function event(r,title,actor='系统',note='',at=Date.now()){r.events.push({title,actor,note,at});}
 function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='dingtalk.com'||u.hostname.endsWith('.dingtalk.com'))?u.href:'';}catch{return '';}}
 function reflect(t,r){t.approval.status=({running:'审批中',approved:'已通过',refused:'已驳回',terminated:'已撤销',failed:'发起失败',uncertain:'状态待确认'})[r.status];t.approval.people=copy(r.people);t.approval.error=r.error||'';t.approval.reason=r.reason||'';}
 function approvalRecovery(s,t,r=active(s,t)){
  const step=t&&E.currentFlowNode(t),current=!!r&&t.approval?.recordId===r.id&&step?.id===r.nodeId&&step.provider==='dingtalk'&&!['已结案','已合并'].includes(t.phase);
  const template=T.get(s,step?.templateId||r?.templateId),issues=!template?['关联审批模板不存在']:!template.enabled?['关联审批模板已停用']:T.issues(template);
  const snapshot=!issues.length&&t?.proposal?T.preview(template,t,s):null;
  return {current,templateId:template?.id,issues,missing:snapshot?.missing||[],snapshot,failed:current&&r.status==='failed'&&!r.instanceId};
 }
 function enterExternalApproval(s,t,step){
  T.ensure(s);const now=Date.now(),template=T.get(s,step.templateId),snapshot=T.ready(template)?T.preview(template,t,s):{fields:[],missing:['关联审批模板配置不完整']};
  const prior=(s.approvalRecords||[]).filter(r=>r.ticketId===t.id&&r.nodeId===step.id),round=prior.length+1;
  const r={id:E.id(),provider:'dingtalk',ticketId:t.id,customer:t.name,nodeId:step.id,name:step.title,templateId:step.templateId,templateName:template?.name||'模板待配置',templateVersion:template?.version||0,processCode:template?.processCode||'',proposalVersion:t.proposal.version,proposalRevision:t.proposal.revision||1,round,at:now,status:'failed',people:[],initiator:E.user(t.owner)?.name||t.owner,initiatorId:t.owner,initiatorDepartment:t.approvalContext?.initiatorDepartment||E.user(t.owner)?.department||'市场运营中心-售后服务部',instanceId:'',url:'',snapshot:copy(snapshot),events:[],eventIds:[],syncStatus:'ok',syncedAt:null,error:'',reason:''};
  r.requestKey=[t.id,step.id,r.proposalVersion,r.proposalRevision,round].join(':');
  r.templateSnapshot=template?copy(template):null;
  r.error=!T.ready(template||{})?'关联审批模板未启用或配置不完整':snapshot.missing.length?'申请资料缺失：'+snapshot.missing.join('、'):'';
  s.approvalRecords??=[];s.approvalRecords.push(r);
  t.approval={id:r.id,recordId:r.id,provider:'dingtalk',scope:'department',scene:r.templateName,version:r.templateVersion,proposalVersion:r.proposalVersion,initiator:t.owner,steps:[],index:0,at:now};reflect(t,r);
  step.approvalRecordId=r.id;step.startedAt=now;step.people=[];step.done=false;delete step.returnedAt;delete step.returnReason;
  t.phase='待部门审批';t.currentAssignee='';t.taskDeadline=now+(step.handling?.hours||24)*E.H;t.activeNode=step.id;delete t.pendingAssignment;
  if(r.error){event(r,'发起审批失败','系统',r.error);E.log(t,'系统','发起'+step.title,r.error);}else startLocalApproval(s,t,r);return r;
 }
 function startLocalApproval(s,t,r){return attachApprovalInstance(s,r.id,{instanceId:'AP-'+E.id().toUpperCase(),people:r.templateId==='approval-purchase'?['顾宁']:['陆清']});}
 // Link local records and projected approval results.
 function attachApprovalInstance(s,id,data){
  const r=record(s,id);assert(r&&!final.has(r.status),'审批记录已结束或不存在');
  assert(data?.instanceId,'缺少钉钉审批实例编号');assert(!r.instanceId||r.instanceId===data.instanceId,'该申请已关联其他钉钉实例');
  assert(!s.approvalRecords.some(x=>x.id!==r.id&&x.instanceId===data.instanceId),'钉钉实例已关联其他申请');
  const t=s.tickets.find(t=>t.id===r.ticketId);assert(t?.approval?.recordId===id&&E.currentFlowNode(t)?.id===r.nodeId,'该审批申请已失效');
  if(r.instanceId===data.instanceId)return r;
  r.instanceId=String(data.instanceId);r.status='running';r.error='';r.people=copy(data.people||[]);r.url=safeURL(data.url);r.syncedAt=Date.now();r.syncStatus='ok';
  event(r,'审批已发起',r.initiator,'',r.syncedAt);reflect(t,r);E.log(t,'系统','钉钉审批已发起',r.name);return r;
 }
 // Local result projection. Individual task events do not complete a node.
 function applyApprovalEvent(s,input){
  const e=copy(input),r=(s.approvalRecords||[]).find(r=>r.instanceId&&r.instanceId===e.instanceId);
  assert(r,'未找到对应审批实例');assert(e.id&&Number.isFinite(e.at)&&['task','instance'].includes(e.scope),'审批事件不完整');
  assert(!e.processCode||e.processCode===r.processCode,'审批模板与实例不匹配');
  if((r.eventIds||[]).includes(e.id))return {applied:false,reason:'duplicate'};
  if(e.scope==='instance')assert(['start','finish','terminate','delete'].includes(e.type)&&(!(e.type==='finish')||['agree','refuse'].includes(e.result)),'审批结果无效');
  const t=s.tickets.find(t=>t.id===r.ticketId),before=t?copy(t.nodeTiming||E.initialNodeClock(t)):null;
  r.eventIds??=[];r.eventIds.push(e.id);
  if(final.has(r.status))return {applied:false,reason:'final'};
  if(e.at<(r.lastEventAt||r.at))return {applied:false,reason:'stale'};
  r.lastEventAt=e.at;r.syncedAt=Date.now();r.syncStatus='ok';
  if(e.scope==='task'||e.type==='start'){
   if(e.people)r.people=copy(e.people);
   event(r,e.title||(e.type==='transfer'?'审批转交':e.result==='agree'?'审批人同意':e.result==='refuse'?'审批人拒绝':'审批处理中'),e.actor||'钉钉',e.reason||'',e.at);
   if(t?.approval?.recordId===r.id)reflect(t,r);return {applied:true,advanced:false};
  }
  r.status=e.type==='finish'?(e.result==='agree'?'approved':'refused'):'terminated';r.finishedAt=e.at;r.reason=String(e.reason||'');r.people=[];
  event(r,T.STATUS[r.status],e.actor||'钉钉',r.reason,e.at);
  const step=t&&E.currentFlowNode(t),valid=t?.approval?.recordId===r.id&&step?.id===r.nodeId&&t.proposal.version===r.proposalVersion&&(t.proposal.revision||1)===r.proposalRevision&&!['已结案','已合并'].includes(t.phase);
  if(!valid){r.linkStatus='superseded';return {applied:true,advanced:false};}
  reflect(t,r);E.log(t,'系统','钉钉审批'+T.STATUS[r.status],r.name+(r.reason?'；'+r.reason:''));
  if(r.status==='approved'){E.advanceFlowNode(s,t,'系统','钉钉审批通过');}
  else{
   const reason=r.reason||(r.status==='terminated'?'钉钉审批已撤销':'钉钉审批未通过'),paid=t.payments.some(p=>p.result==='成功'&&p.version===t.proposal.version);
   if(paid)returnProcurement(s,t,r,reason,e.at);
   else E.returnFlowToSales(s,t,'系统',reason);
  }
  sync(t,before);return {applied:true,advanced:r.status==='approved'};
 }
 function returnProcurement(s,t,r,reason,at=Date.now()){
  const step=E.currentFlowNode(t);step.returnedAt=at;step.returnReason=reason;step.returnedBy='系统';
  t.approvalAmendment={nodeId:step.id,index:t.execution.index,recordId:r.id,reason,paid:true,at};
  t.execution.index=0;const sales=E.currentFlowNode(t);sales.done=false;t.phase='处理中';t.currentAssignee=t.owner;t.activeNode=sales.id;t.taskDeadline=Date.now()+sales.hours*E.H;t.proposal.status='采购待调整';
  E.log(t,'系统','采购事项退回售后',reason);
 }
 function amendProcurement(s,t,a,data){
  const m=t.approvalAmendment;assert(m?.paid&&t.phase==='处理中'&&a===t.owner&&C.active(s,a),'请由售后主负责人调整采购事项');
  assert(data.note?.trim(),'请填写调整说明');assert(data.items?.length&&data.items.length<=20,'请添加 1 至 20 项置换商品');
  const seen=new Set(),items=data.items.map(row=>{const p=E.PRODUCTS.find(p=>p.id===row.productId),q=Number(row.quantity);assert(p&&!seen.has(p.id),'请检查商品是否有效或重复');seen.add(p.id);assert(Number.isInteger(q)&&q>0&&q<=9999,'商品数量须为 1 至 9999 的整数');return {productId:p.id,name:p.name,quantity:q,unitPrice:p.unitPrice,value:q*p.unitPrice};});
  const next=t.execution.steps[m.index];assert(next?.id===m.nodeId&&next.provider==='dingtalk','原采购审批节点不存在，请核对流程');
  const delivery=E.validateDelivery(data.delivery||t.proposal.delivery);
  const before=copy(t.nodeTiming||E.initialNodeClock(t));t.proposalHistory??=[];t.proposalHistory.push(copy(t.proposal));
  t.proposal.exchangeItems=items;t.proposal.exchangeValue=items.reduce((n,p)=>n+p.value,0);t.proposal.delivery=delivery;t.proposal.revision=(t.proposal.revision||1)+1;t.proposal.procurementNote=data.note.trim();t.proposal.status='已确认';
  const sales=E.currentFlowNode(t);sales.done=true;sales.completedAt=Date.now();sales.completedBy=a;
  t.execution.index=m.index;delete t.approvalAmendment;E.log(t,a,'调整采购事项',data.note.trim());E.enterFlowNode(s,t);sync(t,before);return t;
 }
 function retryExternalApproval(s,t,a,recordId){
  const r=active(s,t),recovery=approvalRecovery(s,t,r);assert(recovery.current&&(!recordId||r.id===recordId),'该申请已结束，请查看当前审批记录');
  assert((a===t.owner||E.user(a)?.role==='lead')&&C.active(s,a),'没有审批维护权限');
  assert(r.status==='failed'&&!r.instanceId,'须先同步确认原审批实例状态，不能重复发起');
  assert(!recovery.issues.length,'请先编辑审批模板：'+recovery.issues[0]);
  assert(!recovery.missing.length,'请先补充方案资料：'+recovery.missing.join('、'));
  const step=E.currentFlowNode(t),startedAt=step.startedAt,deadline=t.taskDeadline;
  t.approvalHistory??=[];t.approvalHistory.push(copy(t.approval));
  const next=enterExternalApproval(s,t,step);next.previousRecordId=r.id;
  step.startedAt=startedAt;t.taskDeadline=deadline;return next;
 }
 function correctApprovalApplication(s,t,a,recordId){
  const r=active(s,t),recovery=approvalRecovery(s,t,r);
  assert(recovery.failed&&r.id===recordId,'当前申请不能补充方案资料');
  assert((a===t.owner||E.user(a)?.role==='lead')&&C.active(s,a),'没有审批维护权限');
  assert(!recovery.issues.length&&recovery.missing.length,'请先核对审批模板与缺失资料');
  const before=copy(t.nodeTiming||E.initialNodeClock(t)),reason='补充审批资料：'+recovery.missing.join('、');
  if(t.payments.some(p=>p.result==='成功'&&p.version===t.proposal.version))returnProcurement(s,t,r,reason);
  else E.returnFlowToSales(s,t,a,reason);
  sync(t,before);return t;
 }
 function syncExternalApproval(s,id,a){
  const r=record(s,id),t=r&&s.tickets.find(t=>t.id===r.ticketId);assert(t&&E.canView(s,t,a),'没有审批记录访问权限');
  // Refresh the stored result only. Viewing a record never approves, retries or
  // invents a missing instance; separate fixtures represent each outcome.
  r.syncedAt=Date.now();if(r.status!=='uncertain')r.syncStatus='ok';return r;
 }
 function ensureLocalApprovalInteractions(s){
  if(s.localApprovalInteractionsVersion===1)return false;
  for(const t of s.tickets){const r=active(s,t);if(!r||r.status!=='failed'||r.instanceId||r.error!=='钉钉审批服务未连接'||E.currentFlowNode(t)?.provider!=='dingtalk')continue;
   if(t.scenarioKey==='dingtalk-failed'){r.error='审批申请发送失败，请重新发起';t.approval.error=r.error;t.title='申请发起失败，等待重新发起';}
   else if(T.ready(r.templateSnapshot)&&!r.snapshot.missing.length)startLocalApproval(s,t,r);
  }
  s.localApprovalInteractionsVersion=1;return true;
 }
 function ensureApprovalPresentation(s){
  if(s.approvalPresentationVersion>=1)return false;
  T.ensure(s);s.approvalPresentationBackup??={at:Date.now(),tickets:{}};
  for(const t of s.tickets){
   if(!t.execution||['已结案','已合并'].includes(t.phase))continue;
   const unfinished=t.execution.steps.slice(t.execution.index).filter(n=>n.type==='approval'&&n.provider!=='dingtalk'&&!n.done);
   if(!unfinished.length)continue;
   s.approvalPresentationBackup.tickets[t.id]??=copy(t);
   const current=E.currentFlowNode(t),migrateCurrent=unfinished.includes(current),previous=copy(t.approval||null);
   const people=migrateCurrent?(previous?.steps?.[previous.index]?.people||current.people||[]).filter(id=>!previous?.steps?.[previous.index]?.votes?.includes(id)).map(id=>E.user(id)?.name||id):[];
   for(const step of unfinished){
    const purchase=/采购/.test(step.title||'');step.provider='dingtalk';step.templateId=purchase?'approval-purchase':'approval-payment';
    if(/^(部门审批|财务审核|财务事项核实|赔偿部门审批)$/.test(step.title||''))step.title=purchase?'采购审批':'付款审批';
    for(const key of ['source','mode','hierarchy','positionId','personId','duty','fallbackId','people'])delete step[key];
   }
   if(!migrateCurrent)continue;
   const before=s.approvalPresentationBackup.tickets[t.id],startedAt=current.startedAt??previous?.at??Date.now();
   if(previous){t.approvalHistory??=[];t.approvalHistory.push(previous);}
   const r=enterExternalApproval(s,t,current);
   // Keep the existing application and its clock, rather than restarting it.
   r.at=previous?.at??startedAt;r.initiatorId=previous?.initiator||t.owner;r.initiator=E.user(r.initiatorId)?.name||r.initiatorId;
   r.events=[{title:'审批已发起',actor:r.initiator,note:'',at:r.at}];
   for(const task of previous?.steps||[])for(const id of task.votes||[]){const log=[...(before.logs||[])].reverse().find(log=>log.actor===(E.user(id)?.name||id)&&/审批同意/.test(log.title||''));event(r,'审批人同意',E.user(id)?.name||id,task.name,log?.at||r.at);}
   if(r.status==='running'){r.people=people.length?people:r.people;reflect(t,r);}
   else r.events=[{title:'发起审批失败',actor:'系统',note:r.error,at:r.at}];
   t.approval.at=r.at;t.approval.initiator=r.initiatorId;current.startedAt=startedAt;
   for(const key of ['returnedAt','returnReason','returnedBy'])if(before.execution.steps[before.execution.index][key]!==undefined)current[key]=before.execution.steps[before.execution.index][key];
   t.phase=before.phase;t.state=before.state;t.taskDeadline=before.taskDeadline;t.logs=copy(before.logs);t.updated=before.updated;
   if(before.pendingAssignment)t.pendingAssignment=copy(before.pendingAssignment);
  }
  s.approvalPresentationVersion=1;return true;
 }
 function convertNodes(nodes){
  const pure=n=>n.type==='approval'&&n.provider!=='dingtalk'||n.type==='branch'&&n.branches.every(b=>b.nodes.every(pure))&&P.all([n]).some(x=>x.type==='approval'&&x.provider!=='dingtalk');
  const result=[];let pending=[];
  const flush=()=>{if(pending.length){result.push(node('approval-payment','付款审批',pending.find(n=>n.type==='approval')?.handling?.hours||24));pending=[];}};
  for(const n of nodes){if(pure(n)){pending.push(n);continue;}flush();if(n.type==='branch')for(const b of n.branches)b.nodes=convertNodes(b.nodes);if(n.kind==='procurement'&&!result.some(n=>n.provider==='dingtalk'&&n.templateId==='approval-purchase'))result.push(node('approval-purchase','采购审批'));result.push(n);}flush();return result;
 }
 function ensureExternalApprovals(s){
  if(s.externalApprovalVersion>=1)return false;T.ensure(s);
  s.externalApprovalBackup={at:Date.now(),rules:copy(s.configuration.ruleScenes)};
  for(const scene of s.configuration.ruleScenes){const before=copy(scene),draft=P.prepare(s.configuration,scene);P.prepareEntry(s.configuration,draft);draft.config.ticketFlow.nodes=convertNodes(draft.config.ticketFlow.nodes);draft.config.ticketFlow.externalApprovalVersion=1;draft.version=(draft.version||0)+1;draft.updatedAt=Date.now();Object.assign(scene,draft);s.configuration.sceneHistory??=[];s.configuration.sceneHistory.unshift({sceneId:scene.id,at:Date.now(),actorId:'系统',before,after:copy(scene)});}
  s.configuration.sceneRevision=(s.configuration.sceneRevision||0)+1;s.configuration.externalApprovalVersion=1;s.externalApprovalVersion=1;return true;
 }
 return {approvalRecovery,correctApprovalApplication,ensureApprovalPresentation,ensureLocalApprovalInteractions,syncExternalApproval,prepareExternalNodes:convertNodes,externalApprovalRecord:active,externalRecord:record,externalApprovalNode:node,enterExternalApproval,attachApprovalInstance,applyApprovalEvent,amendProcurement,retryExternalApproval,ensureExternalApprovals,approvalSafeURL:safeURL};
}
if(typeof module!=='undefined'&&module.exports)module.exports=create;else root.createExternalApprovals=create;
})(typeof window!=='undefined'?window:globalThis);
