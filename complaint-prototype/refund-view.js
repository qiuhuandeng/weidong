(function(root){
  'use strict';
  const E=root.CaseEngine,F=E.Refunds;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const who=id=>E.STAFF.find(x=>x.id===id)?.name||id;
  const date=n=>new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
  const badge=status=>`<span class="badge ${status==='succeeded'?'green':['unknown','failed','rejected'].includes(status)?'orange':'blue'}">${F.STATUS[status]||status}</span>`;
  function orderBox(s,id){
    if(!id)return '<div class="callout">请选择该客户在本门店的订单，核对实付、已退和可申请金额。</div>';
    try{const b=F.balance(s,id);return `<div class="refund-order"><div class="row between mb"><strong>${esc(b.order.number)}</strong><span class="muted small">${esc(b.order.method)}</span></div><p class="small muted mb">${esc(b.order.title)}</p><div class="refund-numbers">${[['订单实付',b.paid],['累计已退',b.refunded],['其他申请占用',b.reserved],['当前可申请',b.available]].map(([label,n])=>`<div><small>${label}</small><strong>${F.money(n)}</strong></div>`).join('')}</div><p class="muted small mt">可申请金额已扣除审批中、待确认、处理中及待核实的退款申请。</p></div>`;}catch(error){return `<div class="callout warn">${esc(error.message)}</div>`;}
  }
  function plan(p,client=false){
    const r=p.refund;
    return `<section class="refund-plan mb"><div class="row between mb"><h3>退款方案 <span class="badge">V${p.version}</span></h3>${badge(p.invalidatedAt?'superseded':r.status)}</div><div class="refund-amount"><small>本次退款金额</small><strong>${F.money(r.amountCents)}</strong></div><p class="detail-text mt">${esc(p.summary)}</p><ul class="line-list"><li><label>关联订单</label><strong>${esc(r.orderNumber)}</strong></li><li><label>退款方式</label><strong>原路退回 · ${esc(r.channel)}</strong></li><li><label>预计办理时间</label><strong>${date(p.deadline)}</strong></li></ul><p class="detail-text mt">退款原因：${esc(r.reason)}</p>${p.invalidatedAt?'<div class="callout warn mt">此版本已失效，修改后的方案需要重新审核与确认。</div>':p.confirmation?`<div class="callout ${p.confirmation.agreed?'success':'warn'} mt">${p.confirmation.agreed?'客户已同意此版方案':'客户提出异议'} · ${date(p.confirmation.at)}</div>`:''}${client?'':`<div class="refund-approval mt"><h3>审批记录</h3>${p.approvals.map((a,i)=>`<div class="approval-step"><span class="step-number">${i+1}</span><div><strong>${esc(who(a.assigneeId))}</strong>${a.nodeTitle?`<div class="small muted">${esc(a.nodeTitle)} · ${esc(a.source)}</div>`:''}<span class="badge ${a.status==='approved'?'green':a.status==='rejected'?'orange':''}">${({waiting:'待前序审批',pending:'待审批',paused:'人员异常，待管理员处理',approved:'已通过',rejected:'已驳回',skipped:'同组已通过'})[a.status]}</span>${a.note?`<p>${esc(a.note)}</p><small>${date(a.at)}</small>`:''}</div></div>`).join('')}</div>`}</section>`;
  }
  function routePreview(c,amount,s){
    try{const n=F.cents(amount);if(c.rulesSnapshot.approval.flow){const result=E.Rules.Flow.plan(c.rulesSnapshot,s||{},{store:c.store,customerId:c.customerId,applicantId:c.ownerId,now:Date.now()+(s?.offset||0)},{type:'refund',refund:n/100,compensation:0});return result.steps.map(step=>(step.type==='cc'?'抄送：':'')+step.title+'（'+step.members.map(who).join('、')+'）').join(' → ');}const chain=E.Rules.approvalPreview(c.rulesSnapshot,'refund',n/100).map(id=>id===c.ownerId?c.rulesSnapshot.approval.delegateId:id);return '适用规则 V'+c.rulesSnapshot.version+' · '+chain.map(who).join(' → ')+' → 负责人记录客户意见 → 财务办理';}
    catch(error){return amount?error.message:'填写退款金额后显示审批路径。';}
  }
  function form(type,s,c,p,t,h){
    const {field,select,attachmentInput,dateInput,now}=h;
    let label='',fields='',submit='',message='',command=type;
    const financial=p?.type==='refund'?p:null;
    if(type==='refundApproval'){
      label='退款方案审批';fields=`<div class="full">${plan(financial)}${h.confirmationView(financial)}</div>`+select('审批结论','decision',[['approve','同意本版方案'],['reject','驳回，退负责人修改']],'approve')+field('审批意见','content','textarea');submit='提交审批结论';message='审批只针对当前方案版本。修改金额、订单或预计办理时间后，须重新审批和客户确认。';
    }else if(type==='refundExecute'){
      command='refundStart';label='发起退款模拟';fields=`<div class="full">${plan(financial)}${h.confirmationView(financial)}</div>`;submit='确认发起退款模拟';message='仅生成本地模拟退款记录，不连接支付渠道、不发生真实转账。提交后进入结果登记，同一任务不能重复发起。';
    }else if(['refundResult','refundVerify'].includes(type)){
      label=type==='refundVerify'?'核查退款结果':'登记退款结果';
      const attempt=s.refundLedger.find(x=>x.id===t.attemptId);
      fields=`<div class="callout full">退款记录：${esc(attempt.id)}<br>方案 V${p.version} · ${F.money(attempt.amountCents)} · 原路退回<br>发起时间：${date(attempt.createdAt)}</div>`+select('退款结果','result',[['unknown','结果待核实'],['success','确认退款成功'],['failed','确认退款失败']],'unknown')+field('结果发生时间','occurredAt','datetime-local',dateInput(now))+`<div class="full" data-conditional="result:success" hidden>${field('退款凭证编号','reference','text','',false,'placeholder="填写本次模拟成功凭证编号"')}</div>`+field(type==='refundVerify'?'核查依据':'结果依据','content','textarea','',true,'placeholder="记录渠道查询结果、凭证信息及核实过程"')+attachmentInput();
      submit=type==='refundVerify'?'保存核查结论':'保存退款结果';message='结果待核实期间只能核查原退款，不能重新发起。只有确认成功后才计入已退款并生成回访。';
    }else if(type==='refundRetry'){
      label='处理退款失败';fields=`<div class="callout full">${F.money(p.refund.amountCents)} · 方案 V${p.version}<br>该次退款已确认失败，历史记录会保留。</div>`+select('处理方式','decision',[['retry','按原方案安排重试'],['revise','退回负责人修订方案']],'retry')+field('失败处理说明','content','textarea');submit='确认处理方式';message='重试会生成新的退款办理任务；修改金额或方案内容需退回负责人重新提交审批。';
    }else if(type==='reviseRefund'){
      label='撤回并修改退款方案';fields=`<div class="callout full">方案 V${p.version} · ${F.money(p.refund.amountCents)}<br>撤回将取消未办任务、释放占用金额，并使原审批和客户确认失效。</div>`+field('修改原因','content','textarea');submit='撤回并生成修订待办';message='已提交、结果待核实或成功的退款不能直接修改。';
    }else return null;
    return {label,fields,submit,message,command};
  }
  function records(s,c,attachmentView){
    const rows=s.refundLedger.filter(x=>x.caseId===c.id).slice().reverse();
    if(!rows.length)return '<div class="empty"><h3>暂无退款执行记录</h3><p>方案审批通过、客户确认并由财务发起模拟后，会生成退款记录。</p></div>';
    return rows.map(x=>`<article class="refund-ledger"><div class="row between"><h3>${esc(x.id)} <span class="badge">V${x.planVersion}</span></h3>${badge(({success:'succeeded',processing:'processing',unknown:'unknown',failed:'failed'})[x.status])}</div><div class="row between mt"><strong class="blue">${F.money(x.amountCents)}</strong><span class="small muted">${date(x.createdAt)} 发起</span></div>${x.events.length?x.events.map(e=>`<div class="plan-item"><div class="row between"><strong class="small">${e.verify?'核查':'登记'} · ${({success:'成功',failed:'失败',unknown:'待核实'})[e.result]}</strong><small class="muted">${date(e.at)}</small></div><p>${esc(e.evidence)}</p>${e.reference?`<p>凭证编号：${esc(e.reference)}</p>`:''}<p>记录人 ${esc(who(e.actorId))} · 结果时间 ${date(e.occurredAt)}</p>${attachmentView(e.attachments)}</div>`).join(''):'<div class="callout mt">已发起，等待登记退款结果。刷新或切换端后仍可继续办理。</div>'}</article>`).join('');
  }
  root.RefundView={orderBox,plan,form,records,routePreview};
})(window);
