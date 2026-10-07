/* Bounded aftercare pauses, immutable audit evidence and effective node time. */
(function(root){
'use strict';
function createSuspensionControl(E,C){
 const old={...E},copy=E.clone,H=E.H,assert=(v,m)=>{if(!v)throw Error(m);};
 const policy={count:1,hours:24,nearHours:1};
 const reasons={materials:'等待客户补充必要资料',customer_time:'客户约定稍后联系',external:'等待外部机构必要材料'};
 const staff=id=>C.STAFF.find(p=>p.id===id),dept=(s,id)=>C.Rules.Flow.organization(s.configuration).appointments.find(p=>p.personId===id)?.departmentId;
 const isManager=(s,a)=>staff(a)?.role==='售后主管'&&C.active(s,a);
 const manager=(s,t,a)=>isManager(s,a)&&!!dept(s,a)&&dept(s,a)===dept(s,t.owner);
 const records=t=>[...(t.suspensionHistory||[]),...(t.suspension?[t.suspension]:[])];
 const elapsed=(r,now)=>Math.max(0,Math.min(r.resumedAt??now,r.expectedAt??Infinity)-r.at);
 function usage(t,now=Date.now()){const rows=records(t);return {count:rows.length,duration:rows.reduce((n,r)=>n+(r.duration??elapsed(r,now)),0),near:rows.filter(r=>r.nearDeadline).length,invalid:rows.filter(r=>r.invalidated).length};}
 function permissions(s,t,a){const p=old.aftercarePermissions(s,t,a);if(t.suspension)return {...p,resume:p.resume||manager(s,t,a),extend:manager(s,t,a),invalidate:manager(s,t,a)};return p;}
 function note(v,message){assert(typeof v==='string'&&v.trim(),message);assert(v.trim().length<=2000,'说明最多 2000 字');return v.trim();}
 const evidenceRows=t=>(t.logs||[]).filter(r=>['有效联系 / 跟进','联系尝试','首次联系','添加跟进','门店协同反馈','受理工单'].includes(r.title));
 function validate(s,t,a,data){
  const reason=note(data.note,'请填写挂起原因'),now=Date.now(),expectedAt=data.expectedAt?new Date(data.expectedAt).getTime():NaN;
  assert(Object.hasOwn(reasons,data.reasonType),'请选择有效的挂起原因类型');assert(Number.isFinite(expectedAt)&&expectedAt>now,'预计恢复时间必填，且须晚于当前时间');
  const evidence=evidenceRows(t).find(r=>r.id===data.evidenceId),files=copy(data.files||[]);assert(!data.evidenceId||evidence,'关联记录已失效，请重新选择');
  assert(evidence||files.length,'请关联一条沟通记录或上传挂起依据');
  const u=usage(t,now),supervisor=manager(s,t,a);assert(supervisor||u.count<policy.count,'该工单已使用自主挂起次数，请由售后主管操作');assert(supervisor||u.duration+expectedAt-now<=policy.hours*H,'累计挂起时间超过 24 小时，请由售后主管操作');
  const basis=supervisor?note(data.basis,'请填写主管处理依据'):'';
  return {reason,expectedAt,reasonType:data.reasonType,evidence:evidence?copy(evidence):null,files,basis,supervisor,ownerAtStart:t.owner,policyVersion:1,clockId:t.nodeTiming?.id||null,nearDeadline:!!t.taskDeadline&&t.taskDeadline-now<=policy.nearHours*H,overdueAtStart:!!t.taskDeadline&&t.taskDeadline<now};
 }
 function suspend(s,t,a,data){assert(permissions(s,t,a).suspend,'当前售后节点未允许挂起，或你没有操作权限');const meta=validate(s,t,a,data);old.suspendTicket(s,t,a,{note:meta.reason,expectedAt:meta.expectedAt});Object.assign(t.suspension,meta);E.log(t,a,'挂起依据',reasons[meta.reasonType]+'；'+(meta.basis||'客服自主额度内挂起')+'；预计恢复 '+new Date(meta.expectedAt).toLocaleString('zh-CN'));return t;}
 function finish(s,t,a,reason,{at=Date.now(),auto=false,invalidated=false}={}){
  const row=t.suspension,now=Date.now(),end=Math.min(at,row.expectedAt??at),duration=Math.max(0,end-row.at),excluded=invalidated?0:duration;
  t.taskDeadline=row.taskDeadline?row.taskDeadline+excluded:null;t.phase=row.returnState;t.currentAssignee=t.owner;
  t.suspensionHistory??=[];t.suspensionHistory.push({...copy(row),resumedAt:end,processedAt:now,resumedBy:a,resumeNote:reason,duration,excludedDuration:excluded,auto,invalidated});delete t.suspension;
  if(t.nodeTiming)t.nodeTiming.deadline=t.taskDeadline;
  E.log(t,a,invalidated?'挂起原因不成立':auto?'挂起到期自动恢复':'恢复办理',reason+'；暂停 '+Math.round(duration/60000)+' 分钟'+(invalidated?'，本次时间计入办理耗时':'')+'；继续原售后节点');
  t.suspensionNotice={at:now,title:auto?'挂起已到期，请继续跟进':invalidated?'主管已纠正挂起，请继续办理':'工单已恢复办理',people:[...new Set([t.owner,...C.STAFF.filter(p=>manager(s,t,p.id)).map(p=>p.id)])],id:row.id};return t;
 }
 function resume(s,t,a,value){assert(permissions(s,t,a).resume,'请由售后主负责人或同部门售后经理恢复办理');const text=note(value,'请填写恢复说明');return finish(s,t,a,text);}
 function extend(s,t,a,data){assert(permissions(s,t,a).extend,'仅同部门售后主管可以延长挂起');const now=Date.now(),row=t.suspension,basis=note(data.basis,'请填写延长依据'),until=new Date(data.expectedAt).getTime();assert(row.expectedAt>now,'挂起已到期，请刷新后重新办理');assert(Number.isFinite(until)&&until>row.expectedAt,'新的恢复时间须晚于原恢复时间');row.extensions??=[];row.extensions.push({at:now,by:a,from:row.expectedAt,to:until,basis});row.expectedAt=until;E.log(t,a,'主管延长挂起',basis+'；恢复时间调整为 '+new Date(until).toLocaleString('zh-CN'));return t;}
 function invalidate(s,t,a,value){assert(permissions(s,t,a).invalidate,'仅同部门售后主管可以纠正挂起');return finish(s,t,a,note(value,'请填写纠正依据'),{invalidated:true});}
 function prepare(s,now=Date.now()){
  let changed=false;
  for(const t of s.tickets||[]){const r=t.suspension;if(!r)continue;
   if(!r.policyVersion){r.legacy=copy(r);r.policyVersion=1;r.reasonType='legacy';r.ownerAtStart=t.owner;r.clockId=t.nodeTiming?.id||null;r.overdueAtStart=!!r.taskDeadline&&r.taskDeadline<r.at;r.nearDeadline=!!r.taskDeadline&&r.taskDeadline-r.at<=H;
    const candidate=Number(r.expectedAt),cap=r.at+policy.hours*H;r.expectedAt=Number.isFinite(candidate)&&candidate>r.at?(manager(s,t,r.by)?candidate:Math.min(candidate,cap)):cap;changed=true;
   }
   if(r.expectedAt<=now){finish(s,t,'系统','达到预计恢复时间，节点恢复计时，整单时限不变',{at:r.expectedAt,auto:true});changed=true;}
  }return changed;
 }
 function clockKey(t){if(t.pendingAssignment||['待定级','待分派'].includes(t.phase))return null;return (t.execution?'flow:'+t.execution.proposalVersion+':':'intake:')+(t.suspension?.nodeId||t.storeAssistance?.nodeId||t.activeNode|| (t.firstContact?'proposal':'contact'));}
 function initialClock(t){const key=clockKey(t);if(!key)return null;const node=E.isStoreIntake?.(t)?{...t.storeIntake.node,startedAt:t.assignedAt}:E.currentFlowNode(t),phase=t.suspension?.returnState||t.storeAssistance?.returnState||t.phase;return {id:E.id(),key,nodeId:t.suspension?.nodeId||t.storeAssistance?.nodeId||t.activeNode,title:node?.title||(phase==='待首联'?'首次联系':'售后办理'),startedAt:node?.startedAt||(t.storeIntake?.completedAt?t.assignedAt:phase==='待首联'?t.assignedAt:t.firstContact)||t.created,deadline:t.suspension?.taskDeadline||t.taskDeadline};}
 function track(t,before,now=Date.now()){
  const key=clockKey(t),prior=before||t.nodeTiming;
  if(prior&&prior.key!==key){t.nodeTimingHistory??=[];t.nodeTimingHistory.push({...prior,endedAt:now});delete t.nodeTiming;}
  if(key){t.nodeTiming=prior?.key===key?prior:{...initialClock(t),...(prior?{startedAt:now}:{})};if(t.taskDeadline)t.nodeTiming.deadline=t.taskDeadline;if(t.closed)t.nodeTiming.endedAt=t.closed;}
  return t;
 }
 function timing(t,now=Date.now(),clock=t.nodeTiming||initialClock(t)){
  if(!clock)return null;
  const end=clock.endedAt||now,rows=records(t).filter(r=>r.clockId===clock.id||(!r.clockId&&r.nodeId===clock.nodeId&&r.at>=clock.startedAt&&r.at<=end));
  const pause=rows.reduce((n,r)=>n+(r.excludedDuration??(r.invalidated?0:r.duration??elapsed(r,now))),0),total=Math.max(0,end-clock.startedAt);
  const deadline=clock.endedAt?clock.deadline:t.suspension?.taskDeadline||t.taskDeadline,checkAt=clock.endedAt?end:t.suspension?.at||end;
  return {...clock,total,pause,net:Math.max(0,total-pause),overdue:rows.some(r=>r.overdueAtStart)||!!deadline&&checkAt>deadline};
 }
 function statistics(s,a,now=Date.now()){
  assert(isManager(s,a),'请由售后主管查看挂起统计');const tickets=s.tickets.filter(t=>dept(s,t.owner)===dept(s,a));
  return C.STAFF.filter(p=>['售后专员','售后主管'].includes(p.role)&&dept(s,p.id)===dept(s,a)).map(p=>{
   const owned=tickets.filter(t=>t.owner===p.id||t.handoffs?.some(h=>h.from===p.id||h.to===p.id)||records(t).some(r=>(r.ownerAtStart||r.by)===p.id));
   const cases=owned.filter(t=>records(t).some(r=>(r.ownerAtStart||r.by)===p.id)),rows=cases.flatMap(t=>records(t).filter(r=>(r.ownerAtStart||r.by)===p.id));
   return {id:p.id,name:p.name,total:owned.length,suspended:cases.length,rate:owned.length?cases.length/owned.length:0,count:rows.length,duration:rows.reduce((n,r)=>n+(r.duration??elapsed(r,now)),0),near:rows.filter(r=>r.nearDeadline).length,invalid:rows.filter(r=>r.invalidated).length,tickets:cases.map(t=>t.id)};
  }).filter(p=>p.total);
 }
 return {SUSPENSION_POLICY:policy,SUSPENSION_REASONS:reasons,suspensionUsage:usage,suspensionRecords:records,suspensionEvidence:evidenceRows,isSuspensionManager:isManager,suspensionManager:manager,suspensionStatistics:statistics,nodeTiming:timing,nodeTimingHistory:(t,now)=> (t.nodeTimingHistory||[]).map(clock=>timing(t,now,clock)),initialNodeClock:initialClock,trackNodeClock:track,prepareSuspensions:prepare,aftercarePermissions:permissions,suspendTicket:suspend,resumeTicket:resume,extendSuspension:extend,invalidateSuspension:invalidate};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createSuspensionControl;else root.createSuspensionControl=createSuspensionControl;
})(typeof window!=='undefined'?window:globalThis);
