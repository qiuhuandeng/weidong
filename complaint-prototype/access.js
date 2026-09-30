(function(root){
  'use strict';
  const isolatedKinds=['approvalException','refundApproval','quality','refundExecute','refundResult','refundVerify','refundRetry'];
  const employeeIds=['intake','manager','store1','store2','aftercare','callback'];
  const canWork=id=>employeeIds.includes(id);
  const canConfigure=id=>id==='manager';
  const isolated=t=>!!t&&(isolatedKinds.includes(t.kind)||(t.kind==='visit'&&t.assigneeId==='quality'));
  function taskAccess(state,actorId,caseId,taskId){
    const c=state.cases.find(c=>c.id===caseId),t=c?.tasks.find(t=>t.id===taskId);
    if(!c||!t||!isolated(t)||t.assigneeId!==actorId)return {allowed:false};
    const p=t.version?c.plans.find(p=>p.version===t.version):null;
    const invalid=['cancelled','transferred'].includes(t.status)||!!p?.invalidatedAt;
    return {allowed:true,c,t,p,invalid,actionable:t.status==='pending'&&!invalid,done:t.status==='done'};
  }
  function taskURL(actorId,c,t){
    const view=isolated(t)?'approval':'staff';
    return 'index.html?view='+view+'&actor='+encodeURIComponent(actorId)+'#detail/'+encodeURIComponent(c.id)+(t?'/'+encodeURIComponent(t.id):'');
  }
  function inScope(c,actorId,scope){
    if(scope==='created')return c.creatorId===actorId;
    if(scope==='involved')return c.ownerId===actorId||c.participants.includes(actorId);
    if(scope==='all')return canConfigure(actorId);
    return c.tasks.some(t=>t.status==='pending'&&t.assigneeId===actorId);
  }
  const api={canWork,canConfigure,isolated,taskAccess,taskURL,inScope};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.WorkAccess=api;
})(typeof window!=='undefined'?window:globalThis);
