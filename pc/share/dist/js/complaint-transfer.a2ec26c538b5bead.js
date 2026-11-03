/* Complaint handoff to the linked store's manager; uses the existing PC editor. */
window.PCModules['complaint-transfer']={render(){},create({getMain,getRecords,getOrders,canAssess,currentHandler,clone,now,actor,esc,field,select,openEditor,commitRecord,closeLayer,toast,error,clearErrors}){
  function target(r){
    const own=getOrders().filter(o=>r.customerId&&o.customerId===r.customerId),linked=own.filter(o=>(r.linked||[]).some(x=>x.id===o.id));
    const stores=[...new Set(linked.map(o=>o.store).filter(Boolean))],store=r.complaintStore||r.store||(stores.length===1?stores[0]:'');
    const matched=linked.filter(o=>o.store===store),orders=matched.length?matched:own.filter(o=>o.store===store);
    const names=orders.flatMap(o=>Array.isArray(o.manager)?o.manager:String(o.manager||'').split(/[、,，;；]/));
    const managers=[...new Set(names.map(n=>String(n).trim()).filter(n=>n&&n!=='—'))];
    return {store,managers,error:!store?'工单尚未明确门店，请先关联对应订单。':!managers.length?'该工单门店暂无可确认的店长，请先补全对应订单的店长信息。':''};
  }
  function validate(r,d){
    if(!canAssess(r))return [['transferReason','当前工单不在客服办理环节，不能转派。']];
    const to=target(r);if(to.error)return [['transferManager',to.error]];
    if(to.store!==d.transferStore||!to.managers.includes(d.transferManager))return [['transferManager','请选择工单对应门店的店长。']];
    const reason=String(d.transferReason||'').trim();
    return !reason?[['transferReason','请填写转派原因']]:reason.length>1000?[['transferReason','转派原因不能超过 1000 字']]:[];
  }
  function record(r,d,time){
    if(validate(r,d).length)return null;
    const entry={id:r.id+'-transfer-'+Date.now()+'-'+r.follows.length,kind:'transfer',action:'转派门店',time,actor,beforeStatus:r.status,status:'门店处理中',fromHandler:currentHandler(r),store:d.transferStore,toHandler:d.transferManager,note:d.transferReason.trim(),files:[]};
    r.status=entry.status;r.currentDepartment='门店';r.currentHandler=entry.toHandler;r.currentTask='待门店店长反馈处理结果';
    r.transfer=clone(entry);r.taskDeadline=null;delete r.statusDetail;r.follows.unshift(entry);return entry;
  }
  function open(){
    const m=getMain();if(!m||m.editor||!canAssess(m.record))return;
    const to=target(m.record);openEditor('transfer',{transferStore:to.store,transferManager:to.managers.length===1?to.managers[0]:'',transferReason:''});
  }
  function form(){
    const {record:r,editor:{draft:d}}=getMain(),to=target(r);
    return `<div id="uc-transfer-form" data-draft="transfer" novalidate><div class="ub-form">${field('transferManager','接收店长',select('transferManager',to.managers,d.transferManager,to.managers.length?'请选择店长':'暂无店长信息',`required data-filterable ${to.managers.length?'':'disabled'}`),true,to.error)}${field('transferReason','转派原因',`<textarea id="uc-transferReason" name="transferReason" class="uc-input" rows="5" maxlength="1000" show-word-limit placeholder="说明需门店核实的问题及处理要求">${esc(d.transferReason)}</textarea>`,true)}</div></div>`;
  }
  function save(){
    const m=getMain(),e=m?.editor;if(e?.kind!=='transfer')return;
    clearErrors(e.layer.el);const next=clone(getRecords()),r=next.find(r=>r.id===m.record.id),missing=validate(r,e.draft);
    if(missing.length){missing.forEach(([name,message])=>error(e.layer.el,name,message));return;}
    const entry=record(r,e.draft,now());
    if(!commitRecord(next,'转派门店',entry.store+' · '+entry.toHandler+'；'+entry.note))return;
    closeLayer(true);toast('已转派给门店店长');
  }
  function history(f){return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong><span>转派门店</span></div><div class="uc-event-text">${esc(f.store)} · ${esc(f.toHandler)}<br>转派原因：${esc(f.note)}</div>`;}
  return {target,validate,record,open,form,save,history};
}};
