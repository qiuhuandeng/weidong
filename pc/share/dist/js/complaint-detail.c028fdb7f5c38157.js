/* Read-only complaint overview and progress. No workflow state or stored data is changed. */
window.PCModules['complaint-detail']={render(){},create({workOrderStatus,valueText,planText,detail,statusTag,currentHandler,currentTask,events,esc,empty,section,fmt,levelTag,level4Type,CHANNELS,interval,filesView,link,tag,resolveLink,orderProjects,money,iconFile,paymentView,paymentMoney,detailReference}){
  function deadlineText(value){
    if(!value)return '—';
    if(typeof value==='number')return Number.isFinite(value)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
    return fmt(value);
  }
  function summary(r){
    const status=workOrderStatus(r.status),closed=status==='已结案',handler=closed?r.closedBy:currentHandler(r),department=processingDepartment(r),task=currentTask(r);
    const customer=r.customerId?link(`<strong>${esc(r.name||'未关联客户')}</strong>`,'customer-detail',`data-customer="${esc(r.customerId)}" aria-label="查看客户详情：${esc(r.name||'未关联客户')}"`):`<strong>${esc(r.name||'未关联客户')}</strong>`;
    const dates=[[closed?'结案时间':'当前节点截止',closed?r.closedAt:r.taskDeadline],['整单截止',r.deadline]].filter(([,value])=>value);
    const statement=valueText(r.customerStatement).trim(),complaintStore=r.complaintStore||r.store;
    const feedback=[[r.firstContact,'首次联系人',r.firstContact],[r.contactTime,'客户投诉时间',r.contactTime?fmt(r.contactTime):''],[r.contactTime,'上报间隔',r.contactTime?interval(r):''],[r.complaintStore&&r.store&&r.complaintStore!==r.store,'工单原门店',r.store]].filter(([show])=>show);
    return `<div class="uc-ticket-overview"><header class="uc-info-customer"><span class="uc-info-avatar" aria-hidden="true">${esc(Array.from(r.name||'客')[0])}</span><div class="uc-info-identity">${customer}<div><span>${esc(r.phone||'—')}</span><span>会员号 ${esc(r.member||'—')}</span>${complaintStore?`<span>投诉门店 ${esc(complaintStore)}</span>`:''}</div></div><div class="uc-ticket-identifiers"><div class="uc-actions">${levelTag(r.level)}${level4Type(r)?'<span class="uc-muted">'+esc(level4Type(r))+'</span>':''}</div><span>工单号：${esc(r.id)}</span></div></header><section class="uc-info-complaint-body" aria-label="投诉内容"><div class="uc-complaint-heading"><span class="uc-info-caption">投诉内容</span><div class="uc-complaint-meta"><span>发起时间：${esc(r.created?fmt(r.created):'—')}</span><span>来源渠道：${esc(CHANNELS[r.channel]||'—')}</span><span>发起人：${esc(r.submitter||'—')}</span></div></div><p class="uc-info-content">${esc(r.content||'未填写投诉内容')}</p>${statement&&statement!==valueText(r.content).trim()?`<div class="uc-complaint-statement"><div class="uc-info-caption">客户陈述</div><p class="uc-info-content">${esc(statement)}</p></div>`:''}${r.files?.length?`<div class="uc-info-attachments" aria-label="投诉附件">${filesView(r.files,'original')}</div>`:''}${feedback.length?`<div class="uc-info-feedback uc-complaint-meta">${feedback.map(([,label,value])=>`<span>${label}：${esc(value)}</span>`).join('')}</div>`:''}</section><section class="uc-ticket-progress" aria-label="当前进度"><div class="uc-ticket-progress-head"><div class="uc-actions"><span class="uc-info-caption">${closed?'办理结果':'当前进度'}</span>${statusTag(r.status)}</div><div class="uc-ticket-handler"><span>${closed?'结案人':'办理人'}</span><strong>${esc(handler||'—')}</strong>${!closed&&department!=='—'&&!valueText(handler).includes(department)?`<span>${esc(department)}</span>`:''}</div></div>${task&&task!==status&&task!=='—'?`<p class="uc-ticket-task">${esc(task)}</p>`:''}${dates.length?`<dl class="uc-ticket-deadlines">${dates.map(([label,value])=>`<div><dt>${label}</dt><dd>${esc(deadlineText(value))}</dd></div>`).join('')}</dl>`:''}</section></div>`;
  }
  function informationView(r){
    const orders=r.linked.length?orderCards(r.linked,true,r.customerId):empty('暂未关联订单'),orderAction=r.status==='已结案'?'':link(r.linked.length?'调整订单':'关联订单','pick-orders');
    return `<div class="uc-info-layout"><div class="uc-info-primary">${section('关联订单',orders,orderAction)}</div>${r.channel==='wechat'?detailReference('payment','微信支付',`订单 ${paymentMoney(r.paymentAmount)} · 申请退款 ${paymentMoney(r.refund)}`,paymentView(r),'查看支付资料'):''}</div>`;
  }
  function orderCards(linked,linkOrders=false,customerId=''){
    const present=value=>value!==undefined&&value!==null&&value!=='',read=value=>esc(present(value)?value:'—'),
      amount=value=>present(value)&&Number.isFinite(Number(value))?money(Number(value)/100):'—',
      fact=(label,value,full=false)=>`<div${full?' class="uc-linked-order-wide"':''}><dt>${label}</dt><dd>${read(value)}</dd></div>`;
    return `<div class="uc-order-detail-list">${linked.map(item=>{
      const {order:o,wx}=resolveLink(item);if(!o)return `<div class="uc-order-detail">${empty('订单 '+esc(item.id)+' 的资料暂不可用')}</div>`;
      const projects=orderProjects(o),paid=projects.length&&projects.every(project=>present(project.paid)&&Number.isFinite(Number(project.paid)))?projects.reduce((sum,project)=>sum+Number(project.paid),0):null;
      const rows=projects.map(project=>{
        const staff=[...new Set([project.biller,project.operator].filter(Boolean))].join(' / ');
        return `<tr><td>${project.category?`<span class="uc-muted">${esc(project.category)}：</span>`:''}${read(project.name)}</td><td>${project.type?tag(project.type,project.type==='消费'?'green':project.type==='维护'?'orange':'gray'):'—'}</td><td>${read(project.quantity)}</td><td>${amount(project.unitPrice)}</td><td>${amount(project.totalAmount??project.paid)}</td><td>${read(project.consultant??o.consultant)}</td><td>${read(project.collaborator)}</td><td>${read(staff)}</td></tr>`;
      }).join('');
      return `<article class="uc-order-detail uc-linked-order" aria-label="订单 ${esc(o.id)} 的信息"><header class="uc-linked-order-head"><span class="uc-linked-order-icon" aria-hidden="true">${iconFile}</span><div class="uc-linked-order-id"><span class="uc-muted">订单号</span>${linkOrders?link(esc(o.id),'order-detail',`data-order="${esc(o.id)}"`):`<strong>${esc(o.id)}</strong>`}</div><div class="uc-linked-order-store">${read(o.store)}${o.state?tag(o.state,o.state==='已完成'?'gray':'green'):''}</div></header><div class="uc-linked-order-body"><div class="uc-linked-order-overview${customerId&&o.customerId===customerId?' uc-linked-order-known':''}">${!customerId||o.customerId!==customerId?`<div><div><span class="uc-muted">客户</span> <strong>${read(o.name)}</strong></div><div class="uc-muted">会员号 ${read(o.member)}</div></div>`:''}<div class="uc-linked-order-amounts"><div><span>订单金额</span><strong>${present(o.amount)&&Number.isFinite(Number(o.amount))?money(Number(o.amount)):'—'}</strong></div><div><span>已付金额</span><strong class="uc-linked-order-paid">${amount(paid)}</strong></div></div></div><dl class="uc-linked-order-facts">${fact('订单意向',o.intention)}${fact('到店时间',o.arrived?String(o.arrived).replace('T',' '):'')}${fact('前端推广',wx?.promoter)}${fact('咨询预约',o.consultant)}${fact('门店接待',o.receptionSales)}${fact('门店店长',o.manager,true)}</dl><div class="uc-linked-order-wechat"><span class="uc-muted">加微记录</span><span>${read(wx?.record)}</span></div><h4 class="uc-order-project-heading">购买 / 维护项目</h4><div class="table-wrap uc-table-wrap uc-order-project-table-wrap" role="region" aria-label="订单 ${esc(o.id)} 的项目信息" tabindex="0"><table class="uc-table uc-order-project-table" data-pc-align="left" data-pc-min-height="0" aria-label="订单 ${esc(o.id)} 的项目信息"><colgroup><col><col style="width:56px"><col style="width:44px"><col style="width:76px"><col style="width:76px"><col style="width:64px"><col style="width:64px"><col style="width:110px"></colgroup><thead><tr>${['项目名称','类型','数量','单价','总金额','顾问','协作老师','开单/操作老师'].map((label,i)=>`<th scope="col"${i===0?' data-pc-min-width="140"':''}>${label}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="8">${empty('暂无项目明细')}</td></tr>`}</tbody></table></div></div></article>`;
    }).join('')}</div>`;
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
    const rows=processRecords(r);
    const history=rows.length?events(rows,item=>`<div class="uc-event-title"><strong>${esc(item.title)}</strong><span class="uc-muted">${esc(item.actor||'未记录办理人')}</span></div>${item.status?`<div class="uc-event-text">${item.beforeStatus&&item.beforeStatus!==item.status?esc(item.beforeStatus)+' → ':''}${esc(item.status)}</div>`:''}${item.note?`<div class="uc-event-text">${esc(item.note)}</div>`:''}`):empty('暂无流转记录');
    return section('流转记录',history);
  }
  return {summary,informationView,orderCards,processingDepartment,processRecords,processView};
}};
