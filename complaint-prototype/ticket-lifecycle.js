/* The ticket lifecycle is separate from the current workflow phase and task. */
(function(root){
'use strict';
function createTicketLifecycle(E,C,P){
 const copy=E.clone,assert=(value,message)=>{if(!value)throw Error(message);},old={...E};
 const states=['待处理','处理中','审批中','待结案','已挂起','已结案'];
 const legacyPhases=['待方案审批','待打款','待回访'];
 const aftercare=id=>C.STAFF.some(p=>p.id===id&&['售后专员','售后主管'].includes(p.role));
 function status(t){
  const phase=t.phase||t.state;
  if(t.mergedInto||['已结案','已合并'].includes(phase))return '已结案';
  if(t.suspension||phase==='已挂起')return '已挂起';
  if(t.storeIntake&&!t.storeIntake.completedAt)return t.storeIntake.contactedAt||t.logs?.some(row=>row.title==='联系尝试')?'处理中':'待处理';
  // Temporary assistance remains part of aftercare; formal store/payment nodes are downstream.
  if(t.storeAssistance||phase==='待门店协同')return '处理中';
  const node=E.currentFlowNode(t);
  if(node?.kind==='close'||['待结案','待回访'].includes(phase))return '待结案';
  if(node?.type==='approval'||['store','payment','procurement'].includes(node?.kind)||['待部门审批','待门店办理','待采购办理','待付款','待方案审批','待打款'].includes(phase))return '审批中';
  // An unanswered follow-up starts handling without fabricating an effective first contact.
  if(node?.kind==='sales'||t.firstContact||phase==='处理中'||t.storeAssistanceHistory?.length||t.logs?.some(row=>['首次联系','有效联系 / 跟进','联系尝试','添加跟进'].includes(row.title)))return '处理中';
  return '待处理';
 }
 function sync(s){for(const t of s.tickets||[]){t.phase??=t.state;t.state=status(t);}return s;}
 function stageKey(t){
  if(t.state==='已结案')return 'ended';
  if(t.workflowIssue)return 'exception';
  if(t.suspension)return 'sales';
  if(t.storeIntake&&!t.storeIntake.completedAt&&!t.pendingAssignment)return 'store';
  if(t.storeAssistance)return 'assistance';
  if(t.phase==='待定级')return 'grading';
  if(t.pendingAssignment||t.phase==='待分派')return 'assignment';
  const n=E.currentFlowNode(t);if(n)return n.type==='approval'?'approval':n.kind;
  return ({'待方案审批':'approval','待部门审批':'approval','待打款':'payment','待付款':'payment','待回访':'close','待结案':'close','待门店办理':'store'})[t.phase]||'sales';
 }
 function stage(t){
  const key=stageKey(t);
  if(key==='assignment')return t.pendingAssignment?.mode==='configuration'?'规则匹配':t.pendingAssignment?.mode==='flow-node'?(E.currentFlowNode(t)?.title||'当前节点')+' · 人员待匹配':'售后派单';
  if(key==='ended')return t.mergedInto?'已并入主工单':'流程结束';
  if(key==='sales')return '售后办理';
  return ({grading:'定级确认',assistance:'门店协同',exception:'流程待处理'})[key]||E.currentFlowNode(t)?.title||({approval:'部门审批',store:'门店办理',procurement:'采购办理',payment:'付款办理',close:'售后结案'})[key];
 }
 function task(t){
  if(t.suspension)return '恢复办理';
  if(t.workflowIssue)return '核对流程并重新匹配';
  if(t.pendingAssignment?.mode==='schedule')return '待派单';
  if(t.pendingAssignment?.mode==='entry-node')return '重新匹配门店办理人';
  if(t.pendingAssignment?.mode==='configuration')return '重新匹配规则';
  if(t.pendingAssignment?.mode==='flow-node')return '重新匹配办理人';
  if(t.phase==='待首联')return '首次联系客户';
  const key=stageKey(t);return ({grading:'确认客诉等级',assignment:'分派工单',sales:'跟进并确认方案',assistance:'反馈协同结果',approval:'处理审批意见',store:'填写门店处理结果',procurement:'填写采购办理结果',payment:'登记付款结果',close:'确认结案',ended:'办理已结束'})[key]||stage(t);
 }
 function findOwner(s,t,sales){
  if(aftercare(t.owner))return t.owner;
  const ids=sales.source==='person'?[sales.personId]:C.Rules.Flow.positions(s.configuration).find(p=>p.id===sales.positionId)?.members||[];
  const person=[...ids,sales.fallbackId,'manager'].find(id=>aftercare(id)&&C.active(s,id));
  assert(person,'售后办理节点没有有效售后人员，请维护岗位人员后重新匹配');return person;
 }
 function upgradeTicket(s,t){
  const advanced=legacyPhases.includes(t.phase),needsOwner=!aftercare(t.owner)&&['待首联','处理中'].includes(t.phase)&&!t.execution&&!t.pendingAssignment;
  if(!advanced&&!needsOwner)return false;
  const before=copy({phase:t.phase,owner:t.owner,currentAssignee:t.currentAssignee,flow:t.flow,proposal:t.proposal,approval:t.approval,activeNode:t.activeNode});
  let scene;
  if(t.flow?.config)scene=P.prepare(s.configuration,{id:t.flow.id,name:t.flow.name,level:t.level,config:t.flow.config});
  else scene=P.prepare(s.configuration,C.scene(s,t.level));
  const sales=copy(scene.config.ticketFlow.nodes.find(n=>n.kind==='sales')),owner=findOwner(s,t,sales);sales.people=[owner];
  t.legacyWorkflow??=before;t.owner=owner;t.participants=[...new Set([...t.participants,owner])];
  if(!advanced){t.currentAssignee=owner;t.nodeOwners??={};t.nodeOwners[t.activeNode||'contact']=owner;E.log(t,'系统','衔接售后办理',E.user(owner).name+'继续办理，原时限与记录保留');return true;}
  const p=t.proposal;if(p){p.typeKey=E.solutionKey(p);assert(p.typeKey,'已有方案类型无法识别，请核对处理记录');p.type=E.SOLUTION_TYPES[p.typeKey];p.status='已确认';p.exchangeItems??=[];p.exchangeValue??=0;p.confirmedBy??=t.approval?.initiator||owner;p.confirmedAt??=t.approval?.at||t.updated;delete p.consent;delete p.approved;}
  const steps=[{...sales,done:true}],close={...P.node('close',s.configuration,scene),people:[owner],done:false};
  let phase=t.phase,approval=t.approval;
  const funded=!!p&&p.refund+p.compensation>0,paid=!!p&&t.payments.some(row=>row.result==='成功'&&row.version===p.version);
  if(phase==='待方案审批'){
   assert(p&&approval?.steps?.[approval.index],'原审批记录不完整，请核对后重新匹配');
   approval.scope='department';for(const row of approval.steps)row.name=(row.name||'部门审批').replaceAll('方案','部门');
   steps.push({id:'continued-approval-'+approval.id,type:'approval',title:'部门审批',people:[...new Set(approval.steps.flatMap(row=>row.people))],done:false,handling:{hours:approval.steps[approval.index].hours||24}});
  }
  if(funded&&!paid&&phase!=='待回访'){
   const finance=t.flow?.doc.finance||s.rules.finance;
   const payment={...P.node('payment',s.configuration,scene),source:'person',personId:finance,people:[finance],done:false};steps.push(payment);
  }
  steps.push(close);
  t.flow={...(t.flow||{}),id:t.flow?.id||scene.id,name:t.flow?.name||scene.name,version:t.flow?.version||scene.version,config:copy(scene.config)};
  t.execution={schema:1,proposalVersion:p?.version||0,steps,path:[],index:1,at:t.updated,continuedFromLegacy:true};
  const current=steps[1];t.activeNode=current.id;
  if(current.type==='approval'){t.phase='待部门审批';t.currentAssignee=approval.steps[approval.index].people.find(id=>!approval.steps[approval.index].votes.includes(id))||approval.steps[approval.index].people[0];}
  else{if(approval){t.approvalHistory??=[];t.approvalHistory.push(copy(approval));t.approval=null;}t.phase=current.kind==='payment'?'待付款':'待结案';t.currentAssignee=current.people[0];}
  t.nodeOwners??={};t.nodeOwners[current.id]=t.currentAssignee;
  E.log(t,'系统','衔接当前办理流程','继续'+current.title+'；已有办理、审批、付款记录及截止时间保留');return true;
 }
 function prepareTickets(s){
  let changed=E.prepareSuspensions(s);
  for(const t of s.tickets||[]){
   if(!t.phase){t.phase=t.state;changed=true;}
   if(!t.lifecycleVersion){
    const draft=copy(t);
    if(draft.phase==='待分派'&&!draft.pendingAssignment){draft.pendingAssignment={mode:'configuration',dispatcher:'manager',reason:'请按已确认客诉等级重新匹配规则并派单'};draft.currentAssignee='manager';draft.taskDeadline=null;}
    try{upgradeTicket(s,draft);Object.assign(t,draft);delete t.workflowIssue;}
    catch(error){t.workflowIssue={reason:error.message};}
    t.lifecycleVersion=1;changed=true;
   }
   const value=status(t);if(t.state!==value){t.state=value;changed=true;}
  }
  return changed;
 }
 function retryWorkflowUpgrade(s,t,a){assert(t.workflowIssue,'当前流程无需重新匹配');assert(E.canConfirmGrading(s,t,a),'请由售后经理处理');const draft=copy(t);upgradeTicket(s,draft);delete draft.workflowIssue;Object.assign(t,draft);sync(s);}
 function scan(s,t,a,body){const hit=(s.rules.riskConfig?.keywords||s.rules.keywords).filter(k=>String(body).includes(k));if(hit.length){t.riskWords=[...new Set([...(t.riskWords||[]),...hit])];E.log(t,'系统','风险信息记录','涉及：'+hit.join('、')+'；已记录至工单');}}
 function repeat(s,t,a,note){assert(!t.suspension,'工单已挂起，请先恢复办理');assert(!t.storeAssistance,'请先完成或撤回门店协同');assert(E.canView(s,t,a)&&E.user(a)?.role!=='finance','无权登记再次投诉');assert(note?.trim(),'请填写再次投诉内容');assert(!t.mergedInto,'请在主工单登记');if(status(t)==='已结案')return E.create(s,a,{...t,title:'再次投诉：'+t.title,description:note,repeat:true,related:t.id,owner:'',attachments:[]});t.repeat=true;t.sources.push({channel:t.channel,at:Date.now(),content:note});E.log(t,a,'再次投诉',note);scan(s,t,a,note);return t;}
 function ruleTasks(s,t){
  if(status(t)==='已结案')return [];
  const now=Date.now(),people=E.taskPeople(s,t),r=s.rules.reminders,out=[{title:task(t),people,reason:'当前任务',key:t.id+':task'}];
  for(const [kind,deadline] of [['node',t.taskDeadline],['total',t.deadline]]){if(!deadline||kind==='node'&&t.suspension)continue;const overdue=deadline<now;if(!overdue&&(kind==='total'||deadline-now>r.warn*E.H))continue;const title=(kind==='node'?'节点':'整单')+(overdue?'超时':'临期');out.push({title,people:overdue?[...new Set([...people,r.escalation])]:people,reason:(kind==='node'?'节点':'整单')+'截止 '+new Date(deadline).toLocaleString('zh-CN'),key:t.id+':'+kind,...(overdue?{nextAt:deadline+(Math.floor((now-deadline)/(r.repeat*E.H))+1)*r.repeat*E.H}:{})});}
  if(t.suspension?.overdueAtStart)out.push({title:'挂起前节点已超时',people:[...new Set([...people,r.escalation])],reason:'挂起不清除此前超时记录',key:t.id+':suspension-overdue'});
  if(t.suspensionNotice)out.push({title:t.suspensionNotice.title,people:t.suspensionNotice.people,reason:'请核实并继续跟进工单',key:t.id+':resume:'+t.suspensionNotice.id});
  return out;
 }
 const retired=()=>{throw Error('该操作已取消，请使用当前节点的办理操作');};
 const api={STATES:states,ticketStatus:status,ticketStage:stage,ticketStageKey:stageKey,ticketTask:task,prepareTickets,retryWorkflowUpgrade,scan,repeat,ruleTasks,needsRiskReview:()=>false,review:retired,withdraw:retired,riskAck:retired,escalate:retired};
 api.taskPeople=(s,t)=>t.workflowIssue?[C.STAFF.find(p=>p.role==='售后主管'&&C.active(s,p.id))?.id||'manager']:old.taskPeople(s,t);
 api.isPending=(s,t,a)=>t.workflowIssue?api.taskPeople(s,t).includes(a):old.isPending(s,t,a);
 api.canHandle=(s,t,a)=>!t.workflowIssue&&old.canHandle(s,t,a);
 const mutations=['create','follow','assign','confirmGrading','retryIntake','confirmSolution','approve','pay','finishStore','finishProcurement','closeTicket','retryFlowNode','transferAftercare','requestStoreAssistance','finishStoreAssistance','cancelStoreAssistance','suspendTicket','resumeTicket','extendSuspension','invalidateSuspension'];
 for(const name of mutations)api[name]=(s,...args)=>{
  const t=name==='create'?null:args[0],before=t?.id?copy(t.nodeTiming||E.initialNodeClock(t)):null;
  assert(!t?.workflowIssue,'请先核对流程并重新匹配');assert(!legacyPhases.includes(t?.phase),'请先将原办理记录衔接至当前流程');
  const result=old[name](s,...args);if(name==='create'){result.lifecycleVersion=1;E.trackNodeClock(result,null);}else if(t?.id){E.trackNodeClock(t,before);if(['follow','confirmSolution'].includes(name))delete t.suspensionNotice;}
  sync(s);return result;
 };
 api.startApproval=(s,t,a,p)=>api.confirmSolution(s,t,a,p);
 api.completeNormal=(s,t,a,note)=>api.confirmSolution(s,t,a,{typeKey:'service',content:note,refund:0,compensation:0});
 api.seed=()=>sync(old.seed());api.dispatchPending=(s,...args)=>{const count=old.dispatchPending(s,...args);sync(s);return count;};
 return api;
}
if(typeof module!=='undefined'&&module.exports)module.exports=createTicketLifecycle;else root.createTicketLifecycle=createTicketLifecycle;
})(typeof window!=='undefined'?window:globalThis);
