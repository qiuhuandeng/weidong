/* One source of truth for complaint workflow statuses and available actions. */
window.PCModules['complaint-workflow']={render(){},create({normalizeStatus}){
  const statuses=[
    ['待处理','售后客服'],['客服已接单','售后客服'],['客服处理中','售后客服'],
    ['财务审批中','财务'],['采购审批中','采购'],['待财务付款','财务'],
    ['待采购发货','采购'],['客服复核中','售后客服'],['已结案','']
  ];
  const labels=Object.fromEntries(statuses),known=new Set(Object.keys(labels)),handlingOperations={follow:['方案未达成一致'],compensation:['已确认解决方案'],closure:['已处理并结案']};
  const state=record=>normalizeStatus(record.status,record);
  const active=record=>!record.suspension&&!record.legacySuspended;
  function can(record,action){
    const value=state(record);if(!active(record))return false;
    if(action==='accept')return value==='待处理';
    if(action==='assess')return ['客服已接单','客服处理中'].includes(value);
    if(action==='follow')return known.has(value)&&value!=='待处理';
    if(action==='grade')return known.has(value)&&!['待处理','已结案'].includes(value);
    if(action==='close')return ['客服处理中','客服复核中'].includes(value);
    return false;
  }
  function detailActions(record,{canClose=false}={}){
    const actions=['reply'];
    if(can(record,'accept'))return [...actions,'accept'];
    if(can(record,'follow'))actions.push('handling');
    if(can(record,'assess'))actions.push('assessment');
    if(canClose&&can(record,'close'))actions.push('closure');
    return actions;
  }
  const showProcessAction=status=>Boolean(status)&&status!=='已结案';
  return {statuses,tabs:[['','全部'],...statuses.map(([status])=>[status,status])],handlingOperations,state,department:record=>labels[state(record)]||'—',showProcessAction,can,detailActions};
}};
