/* One source of truth for complaint workflow statuses and available actions. */
window.PCModules['complaint-workflow']={render(){},create({normalizeStatus,hasAssessment=record=>Boolean(record.assessedAt)}){
  const statuses=[
    ['待处理','售后客服'],['客服已接单','售后客服'],['客服处理中','售后客服'],
    ['财务审批中','财务'],['采购审批中','采购'],['待财务付款','财务'],
    ['待采购发货','采购'],['客服复核中','售后客服'],['已结案','']
  ];
  const labels=Object.fromEntries(statuses),known=new Set(Object.keys(labels)),handlingOperations={follow:['仍需继续跟进'],compensation:['客户已确认解决方案'],closure:['直接结案']};
  const state=record=>normalizeStatus(record.status,record);
  const active=record=>!record.suspension&&!record.legacySuspended;
  const directClosureStatuses=['采购审批中','待财务付款','待采购发货','客服复核中'];
  const approvalLabels={pending:'处理中',rejected:'财务驳回',withdrawn:'审批已撤销'};
  const clone=value=>JSON.parse(JSON.stringify(value));
  function financeApproval(r){
    if(r.financeApprovals?.length)return r.financeApprovals.at(-1);
    if(r.status!=='财务审批中')return null;
    const node=r.execution?.steps?.[r.execution.index],finance=node?.type==='approval'&&!/采购/.test(node.title||node.templateId||'')&&node.kind!=='purchaseApproval';
    const entry=(r.follows||[]).find(f=>f.kind==='workflow'&&f.action==='财务审批'&&(!r.compensatedAt||f.time>=r.compensatedAt));
    const result=String((finance?node.approvalResult:'')||r.statusDetail||entry?.fields?.find(([label])=>['审批结果','处理结果'].includes(label))?.[1]||'');
    const status=/驳回|拒绝|未通过|不通过|rejected/i.test(result)?'rejected':/撤销|撤回|withdrawn|cancelled/i.test(result)?'withdrawn':'pending';
    return {id:finance&&node.id||r.id+'-finance-legacy',round:1,status,submittedAt:r.compensatedAt||'',submittedBy:r.compensatedBy||r.acceptedBy||'',customerSolution:clone(r.customerSolution||null),returnedAt:status==='pending'?'':node?.returnedAt||entry?.time||'',returnedBy:node?.completedBy||entry?.actor||'',reason:status==='pending'?'':node?.returnReason||node?.result||entry?.note||'',legacy:true};
  }
  function financeReturn(r){
    const approval=financeApproval(r);if(state(r)!=='客服处理中'||!['rejected','withdrawn'].includes(approval?.status))return null;
    const follows=r.follows||[],returned=follows.findIndex(f=>f.approvalId===approval.id&&f.kind==='workflow'&&f.status==='客服处理中'),scheme=follows.findIndex(f=>f.kind==='compensation');
    if(scheme>=0&&(returned>=0?scheme<returned:String(follows[scheme].time||'')>String(approval.returnedAt||'')))return null;
    return approval;
  }
  function financeHint(r,follow){
    const returned=financeReturn(r);if(!returned)return null;
    const resultIndex=(r.follows||[]).findIndex(f=>f.approvalId===returned.id&&f.kind==='workflow'&&f.status==='客服处理中');
    const newer=follow&&(resultIndex>=0?(r.follows||[]).indexOf(follow)<resultIndex:String(follow.time||'')>String(returned.returnedAt||''));
    return newer?null:returned;
  }
  function ensureExecution(r,time,actor){
    if(r.execution?.steps?.length)return r.execution;
    const steps=[];
    if(r.acceptedAt)steps.push({id:r.id+'-intake',kind:'intake',type:'handling',title:'客服接单',done:true,startedAt:r.created,completedAt:r.acceptedAt,people:[r.acceptedBy||actor]});
    steps.push({id:r.id+'-sales-0',kind:'sales',type:'handling',status:'客服处理中',startedAt:r.startedAt||r.acceptedAt||time,people:[actor]});
    return r.execution={steps,index:steps.length-1};
  }
  function submitFinance(r,solution,time,actor){
    const previous=financeApproval(r);
    if(previous?.status==='pending')return null;
    const round=(r.financeApprovals?.length||0)+1,id=r.id+'-finance-'+round+'-'+time.replace(/\D/g,'');
    const approval={id,round,status:'pending',submittedAt:time,submittedBy:actor,customerSolution:clone(solution)};
    const execution=ensureExecution(r,time,actor),sales=execution.steps[execution.index];
    if(sales?.kind==='sales'){sales.done=true;sales.completedAt=time;sales.completedBy=actor;}
    const index=execution.index+1;
    execution.steps.splice(index,0,{id,kind:'financeApproval',type:'approval',title:'财务审批 · 第 '+round+' 次',status:'财务审批中',startedAt:time,approvalResult:'处理中',approvalId:id});execution.index=index;
    (r.financeApprovals??=[]).push(approval);
    Object.assign(r,{status:'财务审批中',currentDepartment:'财务',currentHandler:'',currentTask:'待财务审批反馈'});delete r.statusDetail;delete r.taskDeadline;
    return approval;
  }
  function submitReview(r,time,actor){
    const execution=ensureExecution(r,time,actor),sales=execution.steps[execution.index];
    if(sales?.kind==='sales'){sales.done=true;sales.completedAt=time;sales.completedBy=actor;}
    const index=execution.index+1;
    execution.steps.splice(index,0,{id:r.id+'-review-'+time.replace(/\D/g,''),kind:'close',type:'handling',title:'客服复核',status:'客服复核中',startedAt:time,people:[actor]});execution.index=index;
    Object.assign(r,{status:'客服复核中',currentDepartment:'售后客服',currentHandler:actor,currentTask:'待客服复核解决方案'});delete r.statusDetail;delete r.taskDeadline;
  }
  // This receives a confirmed result. It never invents a DingTalk response.
  function returnFinance(r,{approvalId,result,reason='',actor='',time}){
    const current=financeApproval(r);
    if(r.status!=='财务审批中'||!current||current.id!==approvalId||current.status!=='pending'||!['rejected','withdrawn'].includes(result))return null;
    if(!r.financeApprovals?.length)r.financeApprovals=[{...current,legacy:undefined}];
    const approval=r.financeApprovals.at(-1),handler=r.acceptedBy||r.startedBy||approval.submittedBy;
    const execution=ensureExecution(r,approval.submittedAt||time,handler);
    let node=execution.steps.find(step=>step.id===approval.id);
    if(!node){const sales=execution.steps[execution.index];sales.done=true;sales.completedAt=approval.submittedAt||time;node={id:approval.id,kind:'financeApproval',type:'approval',title:'财务审批 · 第 '+approval.round+' 次',startedAt:approval.submittedAt,approvalId:approval.id};execution.steps.splice(execution.index+1,0,node);}
    Object.assign(approval,{status:result,returnedAt:time,returnedBy:actor,reason:reason.trim()});
    Object.assign(node,{done:false,terminated:true,approvalReturned:true,returnedAt:time,completedAt:time,completedBy:actor,approvalResult:approvalLabels[result],returnReason:approval.reason,result:approval.reason,people:actor?[actor]:[]});
    const index=execution.steps.indexOf(node)+1;
    execution.steps.splice(index,0,{id:approval.id+'-rework',kind:'sales',type:'handling',status:'客服处理中',startedAt:time,people:handler?[handler]:[]});execution.index=index;
    Object.assign(r,{status:'客服处理中',currentDepartment:'售后客服',currentHandler:handler,currentTask:approvalLabels[result],statusDetail:approvalLabels[result]});delete r.taskDeadline;
    const entry={id:approval.id+'-'+result,kind:'workflow',action:'财务审批',approvalId:approval.id,nodeId:node.id,time,actor,note:approval.reason,fields:[['审批结果',approvalLabels[result]]],beforeStatus:'财务审批中',status:r.status,files:[]};
    r.follows.unshift(entry);return entry;
  }
  function reconcileFinance(r){
    const approval=financeApproval(r);
    if(r.status!=='财务审批中'||!approval||approval.status==='pending')return false;
    // Older prototype records only carry the result on the approval node.
    if(!r.financeApprovals?.length){r.financeApprovals=[{...approval,status:'pending'}];return Boolean(returnFinance(r,{approvalId:approval.id,result:approval.status,reason:approval.reason,actor:approval.returnedBy,time:approval.returnedAt||''}));}
    r.status='客服处理中';r.currentDepartment='售后客服';r.currentHandler=r.acceptedBy||r.startedBy||approval.submittedBy;r.statusDetail=approvalLabels[approval.status];r.currentTask=r.statusDetail;delete r.taskDeadline;return true;
  }
  function approvalProgress(r,status){
      const department=status.slice(0,2),node=r.execution?.steps?.[r.execution.index];
      const nodeDepartment=node?.kind==='purchaseApproval'||/采购/.test(node?.title||node?.templateId||'')||node?.templateId==='approval-purchase'?'采购':'财务';
      const current=node?.type==='approval'&&nodeDepartment===department;
      const latest=(r.follows||[]).filter(f=>f.kind==='workflow'&&f.action===department+'审批'&&(!r.compensatedAt||String(f.time||'').replace('T',' ')>=String(r.compensatedAt).replace('T',' '))).sort((a,b)=>String(b.time||'').replace('T',' ').localeCompare(String(a.time||'').replace('T',' ')))[0];
      const detail=[r.statusDetail,r.currentTask].find(value=>value&&!value.includes(department==='财务'?'采购':'财务')&&/^(?:财务|采购)?(?:审批)?(?:已)?(?:驳回|拒绝|退回|未通过|不通过|通过|处理中|审批中|待审批|发起失败|待同步)/.test(value));
      const result=String(current?node.approvalResult||detail||'':detail||latest?.fields?.find(([label])=>['审批结果','处理结果'].includes(label))?.[1]||'').trim();
      if(/驳回|拒绝|退回|未通过|不通过|rejected|returned/i.test(result))return department+'驳回';
      if(/通过|同意|approved/i.test(result))return department+'通过';
      return !result||/^(待|等待|审批中|处理中|pending|processing)/i.test(result)?'处理中':result;
  }
  function can(record,action){
    const value=state(record);
    if(action==='editAssessment')return known.has(value)&&value!=='已结案';
    if(!active(record))return false;
    if(action==='accept')return value==='待处理';
    if(action==='assess')return ['客服已接单','客服处理中'].includes(value);
    if(action==='follow')return known.has(value)&&value!=='待处理';
    if(action==='grade')return known.has(value)&&!['待处理','已结案'].includes(value);
    if(action==='closeDirectly')return directClosureStatuses.includes(value);
    if(action==='close')return value==='客服处理中'||directClosureStatuses.includes(value);
    return false;
  }
  function detailActions(record,{canClose=false}={}){
    const actions=['reply'];
    if(can(record,'accept'))return [...actions,'accept'];
    if(can(record,'follow'))actions.push('handling');
    if(can(record,'assess')&&!hasAssessment(record))actions.push('assessment');
    if(canClose&&can(record,'close')&&state(record)!=='客服处理中')actions.push('closure');
    return actions;
  }
  return {statuses,tabs:[['','全部'],...statuses.map(([status])=>[status,status])],handlingOperations,state,department:record=>labels[state(record)]||'—',can,detailActions,approvalProgress,approvalLabels,financeApproval,financeReturn,financeHint,submitFinance,submitReview,returnFinance,reconcileFinance};
}};
