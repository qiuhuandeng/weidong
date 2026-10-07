/* Aftercare handoff, temporary store assistance and suspension retain the original workflow node. */
(function(root){
'use strict';
function createAftercareActions(E,C,P){
 const assert=(value,message)=>{if(!value)throw Error(message);},copy=E.clone;
 const methods=['taskPeople','canView','canHandle','isPending','needsRiskReview','ruleTasks','follow','confirmSolution','startApproval','completeNormal','approve','pay','review','withdraw','assign','escalate','repeat','riskAck','finishStore','closeTicket','retryFlowNode','confirmGrading','retryIntake'];
 const old=Object.fromEntries(methods.map(key=>[key,E[key]]));
 const staff=id=>C.STAFF.find(p=>p.id===id),isAftercare=id=>['售后专员','售后主管'].includes(staff(id)?.role);
 const organization=s=>C.Rules.Flow.organization(s.configuration),department=(s,id)=>organization(s).appointments.find(a=>a.personId===id)?.departmentId;
 const sameDepartment=(s,a,b)=>!!department(s,a)&&department(s,a)===department(s,b);
 const manager=(s,t,a)=>staff(a)?.role==='售后主管'&&C.active(s,a)&&sameDepartment(s,a,t.owner);
 const ownerOrManager=(s,t,a)=>C.active(s,a)&&((a===t.owner&&isAftercare(a))||manager(s,t,a));
 const special=t=>!!(t.suspension||t.storeAssistance);
 function salesStage(s,t){return !special(t)&&!t.pendingAssignment&&['待首联','处理中'].includes(t.phase)&&isAftercare(t.owner)&&(!t.execution||E.currentFlowNode(t)?.kind==='sales');}
 function salesNode(s,t){
  if(t.execution)return E.currentFlowNode(t);
  const saved=t.flow?.config?{id:t.flow.id,name:t.flow.name,level:t.level,config:t.flow.config}:C.scene(s,t.level);
  return P.prepare(s.configuration,saved).config.ticketFlow.nodes.find(n=>n.kind==='sales');
 }
 function permissions(s,t,a){
  const activeOwner=ownerOrManager(s,t,a);
  if(t.suspension)return {resume:activeOwner};
  if(t.storeAssistance)return {feedback:t.storeAssistance.assignee===a&&C.active(s,a),cancelAssistance:activeOwner};
  if(!salesStage(s,t)||!activeOwner)return {};
  let actions;try{actions=salesNode(s,t).actions||{};}catch{return {};}
  return {transfer:actions.transfer===true,store:actions.store===true,suspend:actions.suspend===true};
 }
 function requirePermission(s,t,a,key){assert(permissions(s,t,a)[key],({transfer:'当前售后节点未允许转派，或你没有转派权限',store:'当前售后节点未允许门店协同，或你没有操作权限',suspend:'当前售后节点未允许挂起，或你没有挂起权限',resume:'请由售后主负责人或同部门售后经理恢复办理',feedback:'请由当前门店协同办理人反馈结果',cancelAssistance:'请由售后主负责人或同部门售后经理撤回协同'})[key]);}
 function transferCandidates(s,t){return C.STAFF.filter(p=>p.id!==t.owner&&isAftercare(p.id)&&C.active(s,p.id)&&sameDepartment(s,p.id,t.owner));}
 function storeCandidates(s,t){const org=organization(s),store=org.departments.find(d=>d.store===t.store);return [...new Set(store?.leaders||[])].map(staff).filter(p=>p&&C.active(s,p.id)&&(p.store==='*'||p.store===t.store));}
 function reason(value,message){assert(typeof value==='string'&&value.trim(),message);assert(value.trim().length<=2000,'说明最多 2000 字');return value.trim();}
 function transferAftercare(s,t,a,person,note){
  requirePermission(s,t,a,'transfer');note=reason(note,'请填写转派原因');assert(transferCandidates(s,t).some(p=>p.id===person),'请选择同部门其他有效售后人员');
  const previous=t.owner,at=Date.now();t.owner=person;t.currentAssignee=person;t.nodeOwners??={};for(const key of ['contact','proposal',t.activeNode].filter(Boolean))t.nodeOwners[key]=person;
  if(t.execution){const node=E.currentFlowNode(t);node.people=[person];t.nodeOwners[node.id]=person;}
  t.participants=[...new Set([...t.participants,previous,person,a])];t.handoffs??=[];t.handoffs.push({id:E.id(),at,by:a,from:previous,to:person,reason:note,nodeId:t.activeNode||'contact',deadline:t.taskDeadline});
  E.log(t,a,'售后转派',E.user(previous).name+' → '+E.user(person).name+'；'+note+'\n原办理期限保留');return t;
 }
 function requestStoreAssistance(s,t,a,data){
  requirePermission(s,t,a,'store');const instructions=reason(data.note,'请填写门店协同事项'),people=storeCandidates(s,t);assert(people.length,'工单所属门店没有有效负责人，请先维护门店任职');
  const key='store-assistance:'+t.store,cursor=s.assistanceCursors?.[key]||0,assignee=people[cursor%people.length].id;
  t.storeAssistance={id:E.id(),store:t.store,assignee,requestedBy:a,at:Date.now(),instructions,files:copy(data.files||[]),returnState:t.phase,returnAssignee:t.currentAssignee||t.owner,nodeId:t.activeNode||'contact',owner:t.owner,deadline:t.taskDeadline};
  s.assistanceCursors??={};s.assistanceCursors[key]=cursor+1;t.phase='待门店协同';t.currentAssignee=assignee;t.participants=[...new Set([...t.participants,a,assignee])];
  E.log(t,a,'发起门店协同',t.store+' · '+E.user(assignee).name+'\n'+instructions);return t;
 }
 function returnFromAssistance(t){const row=t.storeAssistance;t.phase=row.returnState;t.currentAssignee=t.owner;delete t.storeAssistance;return row;}
 function finishStoreAssistance(s,t,a,data){
  requirePermission(s,t,a,'feedback');const note=reason(data.note,'请填写门店反馈结果');assert(['已完成协同事项','需售后继续协调'].includes(data.result),'请选择协同结果');
  const files=copy(data.files||[]),row=returnFromAssistance(t);t.storeAssistanceHistory??=[];t.storeAssistanceHistory.push({...row,status:'已反馈',completedAt:Date.now(),completedBy:a,result:data.result,note,resultFiles:files});
  t.attachments.push(...files);E.log(t,a,'门店协同反馈',data.result+'；'+note+'\n返回售后：'+E.user(t.owner).name);return t;
 }
 function cancelStoreAssistance(s,t,a,note){
  requirePermission(s,t,a,'cancelAssistance');note=reason(note,'请填写撤回原因');const row=returnFromAssistance(t);t.storeAssistanceHistory??=[];t.storeAssistanceHistory.push({...row,status:'已撤回',completedAt:Date.now(),completedBy:a,note});E.log(t,a,'撤回门店协同',note+'\n返回售后：'+E.user(t.owner).name);return t;
 }
 // Pause only the node clock; the whole-ticket deadline continues from creation.
 const suspensionClock='node';
 function suspendTicket(s,t,a,data){
  requirePermission(s,t,a,'suspend');const note=reason(data.note,'请填写挂起原因'),now=Date.now(),expectedAt=data.expectedAt?new Date(data.expectedAt).getTime():null;
  assert(!data.expectedAt||Number.isFinite(expectedAt)&&expectedAt>now,'预计跟进时间须晚于当前时间');
  t.suspension={id:E.id(),at:now,by:a,reason:note,expectedAt,clock:suspensionClock,returnState:t.phase,returnAssignee:t.currentAssignee||t.owner,nodeId:t.activeNode||'contact',taskDeadline:t.taskDeadline,deadline:t.deadline};
  t.taskDeadline=null;t.phase='已挂起';E.log(t,a,'挂起工单',note+(expectedAt?'\n预计跟进：'+new Date(expectedAt).toLocaleString('zh-CN'):'')+'\n'+clockLabel());return t;
 }
 function clockLabel(){return '节点计时已暂停，整单继续计时';}
 function resumeTicket(s,t,a,note){
  requirePermission(s,t,a,'resume');note=reason(note,'请填写恢复说明');assert(C.active(s,t.owner),'原售后负责人已失效，请先维护人员配置后恢复');
  const row=t.suspension,now=Date.now(),duration=Math.max(0,now-row.at),shift=deadline=>deadline?deadline+duration:deadline;
  t.taskDeadline=shift(row.taskDeadline);
  t.phase=row.returnState;t.currentAssignee=t.owner;t.suspensionHistory??=[];t.suspensionHistory.push({...row,resumedAt:now,resumedBy:a,resumeNote:note,duration});delete t.suspension;
  E.log(t,a,'恢复办理',note+'\n返回'+t.phase+'，继续原节点办理');return t;
 }
 function taskPeople(s,t){
  if(t.suspension)return [t.owner];if(t.storeAssistance)return [t.storeAssistance.assignee];
  if(salesStage(s,t)&&!C.active(s,t.owner)){const lead=C.STAFF.find(p=>manager(s,t,p.id));return lead?[lead.id]:[];}return old.taskPeople(s,t);
 }
 function canView(s,t,a){return old.canView(s,t,a)||taskPeople(s,t).includes(a);}
 function canHandle(s,t,a){if(special(t))return false;if(salesStage(s,t))return ownerOrManager(s,t,a);return old.canHandle(s,t,a);}
 function guarded(key,s,t,a,...args){assert(!t.suspension,'工单已挂起，请先恢复办理');assert(!t.storeAssistance,'请先完成或撤回门店协同，再继续售后办理');if(['follow','confirmSolution','startApproval','completeNormal'].includes(key)&&salesStage(s,t))assert(canHandle(s,t,a),'请由售后主负责人或同部门售后经理办理');return old[key](s,t,a,...args);}
 function follow(s,t,a,data){const retainedOwner=t.handoffs?.length&&salesStage(s,t)?t.owner:null;const result=guarded('follow',s,t,a,data);if(retainedOwner&&t.phase==='处理中'){t.currentAssignee=retainedOwner;t.nodeOwners??={};t.nodeOwners.proposal=retainedOwner;}return result;}
 function assign(s,t,a,person,note){if(salesStage(s,t))return transferAftercare(s,t,a,person,note);return guarded('assign',s,t,a,person,note);}
 function ruleTasks(s,t){const rows=old.ruleTasks(s,t);if(!special(t)&&!t.execution)return rows;const title=t.suspension?'跟进挂起工单':t.storeAssistance?'门店协同反馈':E.currentFlowNode(t)?.title||t.phase,people=taskPeople(s,t);return rows.map(row=>row.key===t.id+':task'?{...row,title,people}:row.key===t.id+':node'?{...row,people:[...new Set([...people,...(row.title==='节点超时'?[s.rules.reminders.escalation]:[])])]}:row);}
 const api={aftercarePermissions:permissions,isAftercareStage:salesStage,transferCandidates,storeAssistanceCandidates:storeCandidates,transferAftercare,requestStoreAssistance,finishStoreAssistance,cancelStoreAssistance,suspendTicket,resumeTicket,suspensionClockLabel:clockLabel,taskPeople,canView,canHandle,follow,assign,ruleTasks,isPending:(s,t,a)=>special(t)||salesStage(s,t)?taskPeople(s,t).includes(a):old.isPending(s,t,a),needsRiskReview:t=>special(t)?false:old.needsRiskReview(t)};
 for(const key of methods.filter(key=>!Object.hasOwn(api,key)))api[key]=(s,t,a,...args)=>guarded(key,s,t,a,...args);
 return api;
}
if(typeof module!=='undefined'&&module.exports)module.exports=createAftercareActions;else root.createAftercareActions=createAftercareActions;
})(typeof window!=='undefined'?window:globalThis);
