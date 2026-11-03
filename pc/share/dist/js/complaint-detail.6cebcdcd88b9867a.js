/* Read-only complaint overview and progress. No workflow state or stored data is changed. */
window.PCModules['complaint-detail']={render(){},create({btn,replyAction,canAssess,canClose,hasHandlingScheme,handlingMissing,icon,workOrderStatus,valueText,planText,detail,statusTag,currentHandler,currentTask,events,esc,empty,section,fmt,levelTag,level4Type,CHANNELS,interval,filesView,link,tag,resolveLink,orderProjects,money,iconFile,paymentView,paymentMoney,detailReference,isDemoRecord=()=>false}){
  function closureReady(r){
    if(!hasHandlingScheme(r)||handlingMissing(r).length)return false;
    const pending=(r.execution?.steps||[]).some(node=>['handling','approval'].includes(node.type)&&!['intake','sales','close'].includes(node.kind)&&!node.done&&!node.skipped);
    return !pending&&(r.status==='客服复核中'||r.handlingPlan==='resolved'||Boolean(r.customerSolution?.methods?.length||r.customerSolution?.handlingMethods?.length));
  }
  function detailActions(r){
    let primary=null,more=[];
    const assess=['责任认定','begin-assessment'],solution=['解决方案','begin-compensation'],close=['结案','close-case'];
    if(!r.suspension&&!r.legacySuspended){
      if(r.status==='待处理')primary=['客服接单','accept-case'];
      else if(canAssess(r)){
        primary=r.status==='客服已接单'||!hasHandlingScheme(r)||handlingMissing(r).length?assess:canClose(r)?close:solution;
        more=[assess,solution].filter(action=>action!==primary);
      }else if(canClose(r))primary=close;
    }
    return replyAction()+(more.length?`<span data-pc-menu="更多">${more.map(([label,action])=>btn(label,action)).join('')}</span>`:'')+(primary?btn(primary[0],primary[1],'',true):'');
  }
  function deadlineText(value){
    if(!value)return '—';
    if(typeof value==='number')return Number.isFinite(value)?new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
    return fmt(value);
  }
  function phoneView(r,revealed=false){
    const full=[r.fullPhone,r.phone].map(value=>String(value||'').trim()).find(value=>/^\+?\d[\d\s()-]{5,29}$/.test(value))||'';
    const recorded=String(r.phone||'').trim(),digits=full.replace(/\D/g,'');
    const masked=/[*＊•]/.test(recorded)?recorded:full?digits.slice(0,3)+'****'+digits.slice(-4):recorded||'—';
    return {value:revealed&&full?full:masked,canReveal:Boolean(full),hasPhone:Boolean(recorded||full)};
  }
  function summary(r,phoneVisible=false){
    const customer=r.customerId?link(`<strong>${esc(r.name||'未关联客户')}</strong>`,'customer-detail',`data-customer="${esc(r.customerId)}" aria-label="查看客户详情：${esc(r.name||'未关联客户')}"`):`<strong>${esc(r.name||'未关联客户')}</strong>`;
    const phone=phoneView(r,phoneVisible),phoneAction=phone.hasPhone?link(phoneVisible?'收起号码':'查看完整号码','toggle-phone',`aria-expanded="${phoneVisible}" aria-controls="uc-phone-value"`):'';
    const statement=valueText(r.customerStatement).trim(),complaintStore=r.complaintStore||r.store;
    const feedback=[[r.firstContact,'首次联系人',r.firstContact],[r.contactTime,'客户投诉时间',r.contactTime?fmt(r.contactTime):''],[r.contactTime,'上报间隔',r.contactTime?interval(r):''],[r.complaintStore&&r.store&&r.complaintStore!==r.store,'工单原门店',r.store]].filter(([show])=>show);
    return `<div class="uc-ticket-overview"><header class="uc-info-customer"><span class="uc-info-avatar" aria-hidden="true">${esc(Array.from(r.name||'客')[0])}</span><div class="uc-info-identity"><div class="uc-info-contact">${customer}<div class="uc-info-phone"><span class="uc-info-phone-number" id="uc-phone-value">${esc(phone.value)}</span>${phoneAction}</div></div><div class="uc-info-context"><span>会员号 ${esc(r.member||'—')}</span></div></div><div class="uc-ticket-identifiers"><div class="uc-actions">${statusTag(r.status)}${levelTag(r.level)}${level4Type(r)?'<span class="uc-muted">'+esc(level4Type(r))+'</span>':''}</div><span>工单号：${esc(r.id)}</span></div></header><section class="uc-info-complaint-body" aria-label="投诉内容"><p class="uc-info-content">${esc(r.content||'未填写投诉内容')}</p>${statement&&statement!==valueText(r.content).trim()?`<div class="uc-complaint-statement"><div class="uc-info-caption">客户陈述</div><p class="uc-info-content">${esc(statement)}</p></div>`:''}${r.files?.length?`<div class="uc-info-attachments" aria-label="投诉附件">${filesView(r.files,'original')}</div>`:''}${feedback.length?`<div class="uc-info-feedback uc-complaint-meta">${feedback.map(([,label,value])=>`<span>${label}：${esc(value)}</span>`).join('')}</div>`:''}</section><footer class="uc-complaint-origin uc-complaint-meta" aria-label="发起信息"><span>${icon('clock')}<span>发起时间：${esc(r.created?fmt(r.created):'—')}</span></span><span>${icon('users')}<span>发起人：${esc(r.submitter||'—')}</span></span><span>来源渠道：${esc(CHANNELS[r.channel]||'—')}</span>${complaintStore?`<span>投诉门店：${esc(complaintStore)}</span>`:''}</footer></div>`;
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
      const projects=orderProjects(o);
      const rows=projects.map(project=>{
        const staff=[...new Set([project.biller,project.operator].filter(Boolean))].join(' / ');
        return `<tr><td>${project.category?`<span class="uc-muted">${esc(project.category)}：</span>`:''}${read(project.name)}</td><td>${project.type?tag(project.type,project.type==='消费'?'green':project.type==='维护'?'orange':'gray'):'—'}</td><td>${read(project.quantity)}</td><td>${amount(project.unitPrice)}</td><td>${amount(project.totalAmount??project.paid)}</td><td>${read(project.consultant??o.consultant)}</td><td>${read(project.collaborator)}</td><td>${read(staff)}</td></tr>`;
      }).join('');
      return `<article class="uc-order-detail uc-linked-order" aria-label="订单 ${esc(o.id)} 的信息"><header class="uc-linked-order-head"><span class="uc-linked-order-icon" aria-hidden="true">${iconFile}</span><div class="uc-linked-order-id"><span class="uc-muted">订单号</span>${linkOrders?link(esc(o.id),'order-detail',`data-order="${esc(o.id)}"`):`<strong>${esc(o.id)}</strong>`}</div><div class="uc-linked-order-store">${read(o.store)}${o.state?tag(o.state,o.state==='已完成'?'gray':'green'):''}</div></header><div class="uc-linked-order-body">${!customerId||o.customerId!==customerId?`<div class="uc-linked-order-overview"><div><div><span class="uc-muted">客户</span> <strong>${read(o.name)}</strong></div><div class="uc-muted">会员号 ${read(o.member)}</div></div></div>`:''}<dl class="uc-linked-order-facts">${fact('订单意向',o.intention)}${fact('到店时间',o.arrived?String(o.arrived).replace('T',' '):'')}${fact('前端推广',wx?.promoter)}${fact('咨询预约',o.consultant)}${fact('门店接待',o.receptionSales)}${fact('门店店长',o.manager)}</dl><h4 class="uc-order-project-heading">购买 / 维护项目</h4><div class="table-wrap uc-table-wrap uc-order-project-table-wrap" role="region" aria-label="订单 ${esc(o.id)} 的项目信息" tabindex="0"><table class="uc-table uc-order-project-table" data-pc-align="left" data-pc-min-height="0" aria-label="订单 ${esc(o.id)} 的项目信息"><colgroup><col><col style="width:56px"><col style="width:44px"><col style="width:76px"><col style="width:76px"><col style="width:64px"><col style="width:64px"><col style="width:110px"></colgroup><thead><tr>${['项目名称','类型','数量','单价','总金额','顾问','协作老师','开单/操作老师'].map((label,i)=>`<th scope="col"${i===0?' data-pc-min-width="140"':''}>${label}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="8">${empty('暂无项目明细')}</td></tr>`}</tbody></table></div></div></article>`;
    }).join('')}</div>`;
  }
  function processingDepartment(r){
    const status=workOrderStatus(r.status,r);
    if(status==='已结案')return '—';
    if(r.currentDepartment)return valueText(r.currentDepartment);
    if(['待处理','客服已接单','客服处理中','客服复核中'].includes(status))return '售后客服';
    return ['门店','财务','采购'].find(department=>status.includes(department))||'—';
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
    for(const [kind,time,actor,status]of [['accept',r.acceptedAt,r.acceptedBy,'客服已接单'],['start',r.startedAt,r.startedBy,'客服处理中'],['closure',r.closedAt,r.closedBy,'已结案']]){
      if(time&&!rows.some(item=>item.title===titles[kind]||(item.status===status&&item.time===time)))rows.push({time,actor,title:titles[kind],status,note:''});
    }
    return rows.reverse().sort((a,b)=>String(a.time||'').replace('T',' ').localeCompare(String(b.time||'').replace('T',' ')));
  }
  // Read-only examples for this module's own fixtures. Never write an execution
  // route into storage or replace a real route received from workflow processing.
  function exampleProcess(r){
    if(!isDemoRecord(r)||r.execution?.steps?.length)return null;
    const status=workOrderStatus(r.status,r),closed=status==='已结案',paused=!!(r.suspension||r.legacySuspended||r.status==='已挂起');
    const stage={待处理:'intake',客服已接单:'sales',客服处理中:'sales',财务审批中:'financeApproval',待财务付款:'payment',采购审批中:'purchaseApproval',待采购发货:'procurement',客服复核中:'close',已结案:'close'};
    const previous=(r.follows||[]).find(item=>item.beforeStatus&&stage[workOrderStatus(item.beforeStatus)]&&item.beforeStatus!=='已挂起');
    const current=stage[status]||(paused?stage[workOrderStatus(previous?.beforeStatus)]||'sales':'sales');
    const methods=r.customerSolution?.methods||[],variant=(Number(r.id)-31001)%3;
    const finance=['financeApproval','payment'].includes(current)||methods.includes('refund')||(!methods.length&&variant===1);
    const purchase=['purchaseApproval','procurement'].includes(current)||methods.includes('exchange')||(!methods.length&&variant===2);
    const keys=['intake','sales',...(finance?['financeApproval','payment']:[]),...(purchase?['purchaseApproval','procurement']:[]),'close'];
    const titles={intake:'客服接单',sales:'售后办理',financeApproval:'付款审批',payment:'付款办理',purchaseApproval:'采购审批',procurement:'采购办理',close:'客服复核'};
    const staff={intake:r.acceptedBy||r.startedBy||'林晓（售后客服）',sales:r.startedBy||r.assessedBy||'林晓（售后客服）',financeApproval:'陆清（财务）',payment:'陈敏（财务）',purchaseApproval:'王珊（采购）',procurement:'李江（采购）',close:r.closedBy||r.acceptedBy||'林晓（售后客服）'};
    const timestamp=value=>typeof value==='number'?value:Date.parse(String(value||'').replace(' ','T')+(/(?:Z|[+-]\d{2}:\d{2})$/.test(String(value))?'':'+08:00'));
    const created=timestamp(r.created);if(!Number.isFinite(created))return null;
    const index=keys.indexOf(current),completed=closed?keys.length:index;
    const boundary=Math.max(created,timestamp(closed?r.closedAt:r.transfer?.time||r.startedAt||r.acceptedAt||r.assessedAt)||created+Math.max(1,completed)*600000);
    const steps=keys.map((key,i)=>({id:'example-'+key,title:titles[key],kind:key,type:key.endsWith('Approval')?'approval':'handling',
      done:i<completed,people:i===index&&status==='待处理'?[]:i<=index||closed?[staff[key]]:key==='close'?[staff.close]:[],
      completedAt:i<completed?created+(boundary-created)*(i+1)/completed:undefined}));
    return {...r,execution:{index,steps},currentHandler:currentHandler(r)||(status==='待处理'?'':staff[current]),taskDeadline:r.transfer?r.taskDeadline:r.taskDeadline||(['待处理','客服已接单'].includes(status)?undefined:boundary+7200000)};
  }
  // Read the executed route when available; legacy PC records retain only their
  // recorded stages. Saving a solution alone does not complete a workflow node.
  function processNodes(r){
    const status=workOrderStatus(r.status,r),closed=status==='已结案',paused=!!(r.suspension||r.legacySuspended||r.status==='已挂起');
    if(r.execution?.steps?.some(node=>['handling','approval'].includes(node.type))){
      return r.execution.steps.flatMap((node,index)=>{
        if(!['handling','approval'].includes(node.type))return [];
        const current=!closed&&index===r.execution.index&&!node.done&&!node.skipped;
        const state=node.skipped?'skipped':node.done?'done':current?(paused?'paused':'current'):node.returnedAt?'returned':closed?'skipped':'future';
        return [{title:node.kind==='close'?'客服复核':current&&node.kind==='store'&&r.legacyStoreAssignment?'客服处理':node.title||'办理节点',state,current,type:node.type,
          label:current?({'待处理':'待接单','客服已接单':'已接单','待财务付款':'待付款','待采购发货':'待发货','客服复核中':'复核中'})[status]:undefined,note:current?r.statusDetail||r.currentTask:'',
          people:current?currentHandler(r)||valueText(node.people):valueText(node.people)||node.completedBy||(node.kind==='close'?r.closedBy:'')||'',
          completedAt:node.completedAt||(node.kind==='close'&&node.done?r.closedAt:''),returnedAt:node.returnedAt,
          deadline:current?r.taskDeadline:node.deadline,reason:node.returnReason||'',external:node.external}];
      });
    }
    const stage=value=>value&&({待处理:'sales',客服已接单:'sales',客服处理中:'sales',财务审批中:'financeApproval',采购审批中:'purchaseApproval',待财务付款:'payment',待采购发货:'procurement',客服复核中:'close',已结案:'close'})[workOrderStatus(value)];
    const titles={sales:'售后办理',financeApproval:'付款审批',purchaseApproval:'采购审批',payment:'付款办理',procurement:'采购办理',close:'客服复核',paused:'工单办理'};
    const rows=[];
    const arrive=(key,time='')=>{
      if(!key)return null;
      let row=rows.at(-1);
      if(row?.key!==key){
        if(row){row.state='done';row.completedAt=time;}
        row={key,title:titles[key],state:'current',people:'',type:key.endsWith('Approval')?'approval':'handling'};rows.push(row);
      }
      return row;
    };
    for(const item of processRecords(r)){
      if(!item.status)continue;
      const before=stage(item.beforeStatus),next=stage(item.status);
      if(!rows.length&&before&&before!==next)arrive(before);
      const row=arrive(next,item.time);
      if(row&&['客服接单','开始处理','责任认定','结案'].includes(item.title)&&item.actor)row.people=item.actor;
    }
    const active=arrive(stage(status)||rows.at(-1)?.key||'paused');
    active.state=closed?'done':paused?'paused':'current';active.current=!closed;
    active.people=(closed?r.closedBy:currentHandler(r))||active.people;
    active.deadline=r.taskDeadline;active.note=r.statusDetail||r.currentTask;
    if(closed)active.completedAt=r.closedAt||processRecords(r).findLast(item=>item.status==='已结案')?.time||active.completedAt;
    if(!closed&&!paused)active.label=({'待处理':'待接单','客服已接单':'已接单','待财务付款':'待付款','待采购发货':'待发货','客服复核中':'复核中'})[status]||status;
    return rows;
  }
  function processTime(node,now){
    const at=value=>esc(deadlineText(value));
    if(node.state==='done')return node.completedAt?'完成于 '+at(node.completedAt):'完成时间未记录';
    if(node.state==='future')return '到达后开始计时';
    if(node.state==='skipped')return '无需办理';
    if(node.state==='returned')return '退回于 '+at(node.returnedAt);
    if(node.state==='paused')return '节点计时已暂停';
    const raw=node.deadline,deadline=typeof raw==='number'?raw:Date.parse(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(raw||'')?raw.replace(' ','T')+'+08:00':raw);
    if(!Number.isFinite(deadline))return node.label==='待接单'?'接单后开始计时':'办理时限待确认';
    const remaining=deadline-now,minutes=Math.max(1,Math.ceil(Math.abs(remaining)/60000)),hours=Math.floor(minutes/60),duration=(hours?hours+'小时':'')+(minutes%60?minutes%60+'分钟':'');
    return `<span class="uc-process-clock${remaining<0?' is-overdue':''}">${remaining<0?'已超时 ':'剩余 '}${duration}</span>`;
  }
  function processView(r){
    const example=exampleProcess(r),rows=processNodes(example||r),closed=workOrderStatus(r.status,r)==='已结案',now=Date.now();
    const marker=state=>state==='done'?'<path d="m5 10 3 3 7-7"/>':'<circle cx="10" cy="10" r="6"/><path d="M10 6v4l3 2"/>';
    const content=`<ol class="uc-process-list" aria-label="工单办理节点">${rows.map((node,index)=>{
      const label=node.label||({done:'已完成',current:node.type==='approval'?'审批中':'办理中',future:'未开始',paused:'已暂停',returned:'已退回',skipped:'已跳过'})[node.state];
      const people=node.people||(node.state==='future'?'到达后分派':node.label==='待接单'?'待接单':node.current?'待分派':'未记录');
      const url=node.external?.url,approvalURL=typeof url==='string'&&/^https?:\/\//i.test(url)?url:'';
      return `<li class="uc-process-node is-${node.state}"${node.current?' aria-current="step"':''}><div class="uc-process-title"><span class="uc-process-marker" aria-hidden="true">${node.state==='done'||node.current?`<svg viewBox="0 0 20 20">${marker(node.state)}</svg>`:index+1}</span><div><strong>${esc(node.title)}</strong>${approvalURL?`<a class="uc-link" href="${esc(approvalURL)}" target="_blank" rel="noopener noreferrer">查看审批</a>`:''}</div></div><div class="uc-process-assignee"><span class="uc-process-label">处理人：</span>${esc(people)}</div><span class="uc-process-status"><span class="uc-process-label">状态：</span>${esc(label)}</span><div class="uc-process-time"><span class="uc-process-label">办理时间：</span>${processTime(node,now)}</div>${node.state==='returned'&&node.reason||node.note?`<p class="uc-process-note">${esc(node.state==='returned'?node.reason:node.note)}</p>`:''}</li>`;
    }).join('')}</ol>`;
    return section('处理流程',content,`<span class="uc-muted">${closed?'流程已结束':'已完成 '+rows.filter(node=>node.state==='done').length+' / '+rows.length}</span>`);
  }
  return {summary,phoneView,informationView,orderCards,processingDepartment,processRecords,processView,detailActions,closureReady};
}};
