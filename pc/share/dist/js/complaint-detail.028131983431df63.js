/* Read-only complaint overview and progress. No workflow state or stored data is changed. */
window.PCModules['complaint-detail']={render(){},create({workOrderStatus,valueText,planText,detail,statusTag,currentHandler,currentTask,events,esc,empty,section,fmt,levelTag,level4Type,CHANNELS,interval}){
  function deadlineText(value){
    if(!value)return '—';
    if(typeof value==='number')return Number.isFinite(value)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
    return fmt(value);
  }
  function summary(r){
    const closed=workOrderStatus(r.status)==='已结案';
    const facts=[[closed?'办理结果':'当前环节',workOrderStatus(r.status),currentTask(r)],[closed?'结案人':'当前办理人',closed?r.closedBy:currentHandler(r),''],[closed?'结案时间':'当前节点截止',deadlineText(closed?r.closedAt:r.taskDeadline),''],['整单截止',deadlineText(r.deadline),'']];
    return `<div class="uc-ticket-overview"><div class="uc-ticket-meta"><div class="uc-ticket-origin"><span>工单号：${esc(r.id)}</span><span>${esc(CHANNELS[r.channel]||'—')}</span><span>创建于 ${esc(fmt(r.created))}</span></div><div class="uc-actions">${statusTag(r.status)}${levelTag(r.level)}${level4Type(r)?'<span class="uc-muted">'+esc(level4Type(r))+'</span>':''}</div></div><h3 class="uc-ticket-title">${esc(r.content||'投诉工单')}</h3><dl class="uc-ticket-facts">${facts.map(([label,value,note])=>`<div><dt>${label}</dt><dd>${esc(value||'—')}${note?`<small title="${esc(note)}">${esc(note)}</small>`:''}</dd></div>`).join('')}</dl></div>`;
  }
  function informationHeader(r){
    return section('客户与工单资料',`<div class="uc-details">${detail('客户姓名',r.name)}${detail('客户手机',r.phone)}${detail('会员号',r.member)}${detail('投诉门店',r.store)}${detail('发起人',r.submitter)}${r.channel==='wechat'?'':detail('原单号',r.sourceId)}${r.contactTime?detail('上报间隔',interval(r)):''}</div>`);
  }
  function processingDepartment(r){
    const status=workOrderStatus(r.status);
    if(status==='已结案')return '—';
    if(r.currentDepartment)return valueText(r.currentDepartment);
    if(['待处理','客服接单','客服处理中','客服待结案'].includes(status))return '售后客服';
    return ['门店','财务','采购'].find(department=>status.startsWith(department))||'—';
  }
  function processRecords(r){
    const titles={accept:'客服接单',start:'开始处理',assessment:'责任认定',handling:'责任认定',compensation:'保存解决方案',closure:'结案'};
    const rows=(r.follows||[]).filter(item=>Object.hasOwn(titles,item.kind)||(item.beforeStatus&&item.status&&workOrderStatus(item.beforeStatus)!==workOrderStatus(item.status))).map(item=>({
      time:item.time,actor:item.actor,title:titles[item.kind]||item.action||'工单流转',
      beforeStatus:item.beforeStatus?workOrderStatus(item.beforeStatus):'',status:item.status?workOrderStatus(item.status):'',
      note:['assessment','handling'].includes(item.kind)?(item.handlingPlan?planText(item.handlingPlan):''):item.kind==='compensation'?'解决方案已保存':item.note||''
    }));
    const received=(r.logs||[]).find(item=>item.action==='收到投诉');
    if(received||r.created)rows.push({time:received?.time||r.created,actor:received?.actor||r.submitter,title:'收到投诉',note:received?.text||''});
    for(const [kind,time,actor,status]of [['accept',r.acceptedAt,r.acceptedBy,'客服接单'],['start',r.startedAt,r.startedBy,'客服处理中'],['closure',r.closedAt,r.closedBy,'已结案']]){
      if(time&&!rows.some(item=>item.title===titles[kind]||(item.status===status&&item.time===time)))rows.push({time,actor,title:titles[kind],status,note:''});
    }
    return rows.reverse().sort((a,b)=>String(a.time||'').replace('T',' ').localeCompare(String(b.time||'').replace('T',' ')));
  }
  function processView(r){
    const closed=workOrderStatus(r.status)==='已结案',rows=processRecords(r);
    const current=`<div class="uc-details">${detail('工单状态',statusTag(r.status),false,true)}${detail('当前办理部门',processingDepartment(r))}${detail('当前办理人',closed?'—':currentHandler(r)||'—')}${detail('当前事项 / 卡点',currentTask(r),true)}</div>`;
    const history=rows.length?events(rows,item=>`<div class="uc-event-title"><strong>${esc(item.title)}</strong><span class="uc-muted">${esc(item.actor||'未记录办理人')}</span></div>${item.status?`<div class="uc-event-text">${item.beforeStatus&&item.beforeStatus!==item.status?esc(item.beforeStatus)+' → ':''}${esc(item.status)}</div>`:''}${item.note?`<div class="uc-event-text">${esc(item.note)}</div>`:''}`):empty('暂无流转记录');
    return section('当前进度',current)+section('流转记录',history);
  }
  return {summary,informationHeader,processingDepartment,processRecords,processView};
}};
