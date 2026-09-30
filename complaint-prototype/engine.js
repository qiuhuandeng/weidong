(function (root) {
  'use strict';
  const HOUR = 3600000;
  const STAFF = [
    { id: 'intake', name: '陈悦', role: '400受理', store: '*' },
    { id: 'manager', name: '林岚', role: '售后主管', store: '*' },
    { id: 'store1', name: '王敏', role: '门店店长', store: '南京浦口店' },
    { id: 'store2', name: '周妍', role: '门店店长', store: '上海徐汇店' },
    { id: 'aftercare', name: '许宁', role: '售后专员', store: '*' },
    { id: 'callback', name: '赵晴', role: '400回访', store: '*' },
    { id: 'quality', name: '沈青', role: '品控复核', store: '*' },
    { id: 'finance', name: '陆清', role: '财务审核', store: '*' },
    { id: 'director', name: '陈卓', role: '审批主管', store: '*' }
  ];
  const STORES = ['南京浦口店', '上海徐汇店'];
  const Rules = (typeof module !== 'undefined' && module.exports ? require('./rules.js') : root.createCaseRules)(STAFF, STORES, HOUR);
  const Refunds = (typeof module !== 'undefined' && module.exports ? require('./refunds.js') : root.createRefundModule)(STAFF,STORES,HOUR,Rules);
  function normalize(s, now=Date.now()+(s.offset||0)){
    Refunds.normalize(Rules.normalize(s));
    // Preserve old cases and deadlines while transferring pending customer contact to their owner.
    s.cases.forEach(c=>c.tasks.filter(t=>t.kind==='confirm'&&t.status==='pending'&&t.assigneeId===c.customerId).forEach(t=>{
      t.assigneeId=c.ownerId;c.revision+=1;s.revision+=1;
      if(!c.participants.includes(c.ownerId))c.participants.push(c.ownerId);
      notify(s,c,c.ownerId,'记录客户意见',c.title,t.createdAt,t.id,'task');
    }));
    s.cases.forEach(c=>migrateWorkflow(s,c,now));
    s.workflowVersion=3;return s;
  }
  const STAGES = { unassigned: '待分配', accept: '待接单', contact: '待首次联系', plan: '联系与处理', approval:'待退款审批', confirm: '联系与处理', refund:'待财务处理', refund_check:'退款处理中', service: '待服务履行', visit: '待回访', quality: '待品控复核', closed: '已结案' };
  const TASKS = { assign: '分配负责人', accept: '接单确认', contact: '联系与处理', plan: '联系与处理', refundApproval:'退款方案审批', approvalException:'处理审批人员异常', refundExecute:'发起退款模拟', refundResult:'登记退款结果', refundVerify:'核查退款结果', refundRetry:'处理退款失败', confirm: '联系与处理', service: '登记服务履行', visit: '400独立回访', quality: '品控复核' };
  const clone = x => JSON.parse(JSON.stringify(x));
  const insist = (ok, message) => { if (!ok) throw new Error(message); };
  const text = (v, label, max = 3000) => { const s = String(v || '').trim(); insist(s, '请填写' + label); insist(s.length <= max, label + '过长'); return s; };
  const people = s => STAFF.concat(s.customers.map(c => ({ id: c.id, name: c.name, role: '客户', store: '', phone: c.phone })));
  const person = (s, id) => people(s).find(p => p.id === id);
  const pending = c => c.tasks.filter(t => t.status === 'pending');
  const mainStatus = c => c.stage === 'contact' ? '待首次联系' : ['plan','confirm'].includes(c.stage) ? '处理中' : STAGES[c.stage] || '处理中';
  function canView(s, actorId, c) {
    const a = person(s, actorId);
    if (!a || !c) return false;
    if (a.role === '客户') return c.customerId === actorId;
    if (['intake', 'manager', 'quality'].includes(actorId)) return true;
    if(actorId==='finance')return c.plans.some(p=>p.type==='refund');
    if (actorId === 'callback') return ['visit', 'quality', 'closed'].includes(c.stage) || c.participants.includes(actorId);
    return c.creatorId === actorId || c.ownerId === actorId || c.participants.includes(actorId) || pending(c).some(t => t.assigneeId === actorId) || (a.role === '门店店长' && a.store === c.store);
  }
  const canCreate = (s, id) => !!person(s, id) && !['callback', 'quality', 'finance','director'].includes(id);
  function identity(s, prefix) { s.sequence += 1; return prefix + s.sequence; }
  function log(s, c, actorId, title, body, now, publicRecord = false, attachments = []) {
    c.records.push({ id: identity(s, 'r'), actorId, title, body, at: now, public: publicRecord, attachments });
  }
  function notify(s, c, recipientId, title, body, now, taskId = '', event = 'result') {
    const n=(c.rulesSnapshot||Rules.defaults()).notifications;
    if(recipientId===c.customerId&&!n.customer)return;
    if(recipientId!==c.customerId&&event==='task'&&!n.task)return;
    if(event==='overdue'&&!n.overdue)return;
    s.notices.unshift({ id: identity(s, 'n'), caseId: c.id, recipientId, title, body, taskId, event, ruleVersion:c.rulesSnapshot?.version||1, at: now, read: false });
  }
  function task(s, c, kind, assigneeId, dueAt, now, meta = {}) {
    const r=c.rulesSnapshot,policy=Rules.taskPolicy(r,kind,meta.nodeId);
    if(policy){
      const key={accept:'acceptMinutes',plan:'planHours',confirm:'confirmHours',service:'serviceHours',visit:'visitHours'}[kind];
      if(key)dueAt=now+r.timing[key]*(key.endsWith('Minutes')?60000:HOUR);
      if(kind==='contact')dueAt=c.firstContactDue;
      if(kind==='service')dueAt=Math.min(dueAt,Number(meta.promisedAt)||Infinity);
      if(kind==='refundApproval')dueAt=now+policy.hours*HOUR;
      if(['refundExecute','refundResult','refundVerify','refundRetry'].includes(kind)){const p=c.plans.find(p=>p.version===meta.version);p.refund.executionDueAt=p.refund.executionDueAt||now+r.timing.refundHours*HOUR;dueAt=p.refund.executionDueAt;}
      if(kind==='visit'){const previous=c.tasks.find(t=>t.kind==='visit'&&t.round===c.round);if(previous)dueAt=previous.dueAt;}
    }
    if(c.workflowVersion===3&&processingKinds.includes(kind)){
      const period=startPeriod(s,c,now,c.resumeProcessingDue,kind==='confirm'?'审批后确认':c.round>1?'退回继续处理':'接单后处理');
      delete c.resumeProcessingDue;meta={...meta,periodId:period.id};
      if(kind!=='contact')dueAt=period.dueAt;
    }
    const t = { id: identity(s, 't'), kind, assigneeId, dueAt, createdAt: now, status: 'pending', round:c.round, ...meta };
    c.tasks.push(t);
    if (!c.participants.includes(assigneeId) && assigneeId !== c.customerId) c.participants.push(assigneeId);
    notify(s, c, assigneeId, TASKS[kind], c.title, now, t.id, 'task');
    if(c.rulesSnapshot?.notifications.ownerCopy&&c.ownerId!==assigneeId)notify(s,c,c.ownerId,'任务抄送 · '+TASKS[kind],c.title,now,t.id,'task');
    return t;
  }
  function finish(t, now, status = 'done') { t.status = status; t.completedAt = now;t.elapsedMs=Math.max(0,now-t.createdAt);t.overdueMs=Math.max(0,now-Math.max(t.createdAt,t.dueAt)); }
  const processingKinds=['contact','plan','confirm'];
  const activePeriod=c=>(c.processingPeriods||[]).findLast(p=>p.status==='pending');
  function startPeriod(s,c,now,dueAt,reason='接单后处理') {
    let period=activePeriod(c);
    if(!period){
      period={id:identity(s,'period'),kind:'processing',assigneeId:c.ownerId,createdAt:now,
        dueAt:dueAt??now+(c.rulesSnapshot.timing.processingHours??c.rulesSnapshot.timing.planHours)*HOUR,
        status:'pending',round:c.round,reason};
      (c.processingPeriods||(c.processingPeriods=[])).push(period);
    }
    return period;
  }
  function settlePeriod(c,now,status='done') {const p=activePeriod(c);if(p)finish(p,now,status);}
  function migrateWorkflow(s,c,now) {
    if(c.workflowVersion===3)return;
    c.processingPeriods=[];
    // Legacy records keep their original timestamps and deadlines. Only consecutive
    // owner handling tasks are grouped; approval and finance waits remain separate.
    let period=null,previous=null;
    for(const t of c.tasks){
      if(!processingKinds.includes(t.kind)){period=null;previous=null;continue;}
      if(!period||period.assigneeId!==t.assigneeId||previous?.status==='transferred'){
        period={id:identity(s,'period'),kind:'processing',assigneeId:t.assigneeId,createdAt:t.createdAt,
          dueAt:t.dueAt,status:t.status,round:t.round||c.round,reason:'历史办理记录',legacy:true};c.processingPeriods.push(period);
      }
      period.dueAt=t.dueAt;period.status=t.status;
      if(t.completedAt)finish(period,t.completedAt,t.status);else {delete period.completedAt;delete period.elapsedMs;delete period.overdueMs;}
      t.periodId=period.id;previous=t;
    }
    c.workflowVersion=3;c.rulesSnapshot.closure.callbackOnly=true;
    // Old quality links become read-only. A real callback must confirm closure.
    if(c.stage==='quality'){
      c.tasks.filter(t=>t.kind==='quality'&&t.status==='pending').forEach(t=>finish(t,now,'cancelled'));
      c.stage='visit';task(s,c,'visit',c.rulesSnapshot.closure.callbackId,now+c.rulesSnapshot.timing.visitHours*HOUR,now);
      log(s,c,'system','流程调整：转400回访','取消独立品控环节，原记录保留；由400回访核实问题解决后结案。',now);
    }
    c.revision++;s.revision++;
  }
  function stageHint(c){
    if(c.stage==='contact')return c.nextFollowupAt?'未接通 · 等待再次联系':'接单后请首次联系客户';
    if(c.stage==='confirm')return c.plans.at(-1)?.type==='refund'?'退款已审批 · 待确认客户意见':'待确认当前方案';
    if(c.stage==='plan')return c.waitingReason||'沟通协商、记录处理结果';
    return STAGES[c.stage];
  }
  function timings(c,now=Date.now()) {
    const rows=c.tasks.filter(t=>!processingKinds.includes(t.kind)).map(t=>({...t,title:c.plans.find(p=>p.version===t.version)?.flowPlan?.steps[t.groupIndex]?.title||(t.kind==='processing'?'联系与处理':TASKS[t.kind])}));
    rows.push(...(c.processingPeriods||[]).map(p=>({...p,title:'联系与处理'+(p.reason==='审批后确认'?' · 审批后确认':'' )})));
    const contacts=c.tasks.filter(t=>t.kind==='contact');
    if(contacts.length)rows.push({id:'first-contact',kind:'firstContact',title:'首次有效联系（整单指标）',assigneeId:contacts.at(-1).assigneeId,createdAt:c.createdAt,dueAt:c.firstContactDue,completedAt:c.firstConnectedAt,status:c.firstConnectedAt?'done':'pending',metric:true});
    return rows.sort((a,b)=>a.createdAt-b.createdAt).map(t=>({...t,elapsedMs:Math.max(0,(t.completedAt||now)-t.createdAt),overdueMs:Math.max(0,(t.completedAt||now)-Math.max(t.createdAt,t.dueAt))}));
  }
  function isOverdue(c,now){return c.stage!=='closed'&&(c.targetAt<now||pending(c).some(t=>t.dueAt<now)||activePeriod(c)?.dueAt<now);}
  function process(original,actorId,command,now) {
    let s=original,c=s.cases.find(c=>c.id===command.caseId),t=c.tasks.find(t=>t.id===command.taskId);const d=command.data||{};
    insist(t&&t.status==='pending'&&processingKinds.includes(t.kind),'该处理任务已结束，请查看最新进度');
    insist(t.assigneeId===actorId&&c.ownerId===actorId,'当前任务不由您办理');
    insist(['followup','resolved','service','refund','confirm'].includes(d.intent),'请选择本次处理结果');
    const content=text(d.content,'联系与处理记录');attachments(d);
    const run=(type,data)=>{const taskNow=pending(c).find(x=>x.assigneeId===actorId&&processingKinds.includes(x.kind));const result=apply(s,actorId,{type,caseId:c.id,taskId:taskNow?.id,expectedRevision:c.revision,data},now);s=result.state;c=s.cases.find(x=>x.id===command.caseId);t=taskNow;};
    const contactResult=d.contactResult||'none';
    insist(['connected','unreachable','none'].includes(contactResult),'请选择本次联系结果');
    if(!c.firstConnectedAt&&d.intent!=='followup')insist(contactResult==='connected','首次有效联系后才能提交处理结果');
    if(d.intent!=='followup')insist(contactResult!=='unreachable','本次未接通，请保存跟进并安排再次联系');
    if(t.kind==='contact'&&contactResult!=='none')run('contact',{result:contactResult,content,retryAt:d.retryAt,attachments:d.attachments});
    else if(contactResult!=='none'){
      c.firstAttemptAt=c.firstAttemptAt||now;
      if(contactResult==='connected')c.firstConnectedAt=c.firstConnectedAt||now;
    }
    if(d.intent==='followup'){
      insist(Number(d.retryAt)>now,'请安排未来的下次跟进时间');
      c.nextFollowupAt=Number(d.retryAt);c.waitingReason=text(d.waitingReason,'待跟进事项');c.followupReminderAt=null;
      pending(c).filter(t=>processingKinds.includes(t.kind)).forEach(t=>t.retryAt=c.nextFollowupAt);
      log(s,c,actorId,'保存跟进',({connected:'已接通',unreachable:'未接通',none:'本次为内部处理'})[contactResult]+'：'+content+'；待跟进：'+c.waitingReason+'；下次跟进：'+new Date(c.nextFollowupAt).toLocaleString('zh-CN'),now,false,d.attachments||[]);
    }else if(d.intent==='confirm'){
      insist(pending(c).some(t=>t.kind==='confirm'),'请提交当前处理方案');
      run('confirm',{version:d.version,decision:d.decision,reason:d.reason,evidence:content,method:d.method,attachments:d.attachments});
    }else {
      insist(pending(c).some(t=>t.kind==='plan'),'已有待确认方案，请先记录本版客户意见');
      if(d.intent==='refund')run('plan',{...d,planType:'refund',summary:content});
      else {
        insist(d.customerAgreed===true||d.customerAgreed==='on','请确认客户已接受本次处理结果或安排');
        const evidence=text(d.evidence,'客户意见依据');
        const resolved=d.intent==='resolved';
        run('plan',{summary:content,deadline:resolved?now+HOUR:Number(d.deadline),items:[{type:resolved?'解释道歉':d.serviceType,description:resolved?text(d.fulfillment,'实际解决结果'):text(d.itemDescription,'后续服务安排'),assigneeId:resolved?actorId:d.executorId}]});
        run('confirm',{version:c.plans.length,decision:'agree',evidence,method:d.method,attachments:d.attachments});
        if(resolved){const st=pending(c).find(t=>t.kind==='service');s=apply(s,actorId,{type:'service',caseId:c.id,taskId:st.id,expectedRevision:c.revision,data:{content:d.fulfillment,attachments:d.attachments}},now).state;c=s.cases.find(x=>x.id===command.caseId);c.plans.at(-1).resolvedInContact=true;}
      }
    }
    if(d.intent!=='followup'){log(s,c,actorId,'联系与处理记录',content,now,false,d.attachments||[]);delete c.nextFollowupAt;delete c.waitingReason;}
    c.revision++;s.revision++;return {state:s,caseId:c.id};
  }
  function advance(original, hours = 2, realNow = Date.now()) {
    insist(Number.isFinite(hours) && hours > 0, '请选择有效的演示时间');
    const s = normalize(clone(original),realNow+(original.offset||0)); s.offset += hours * HOUR;
    const now = realNow + s.offset;
    poll(s,now);
    s.revision += 1;
    return s;
  }
  function poll(s,now) {
    for(const c of s.cases){
      const before=s.sequence,beforeTasks=c.tasks.map(t=>t.id+':'+t.assigneeId+':'+t.status).join('|'),r=c.rulesSnapshot;
      const ctx={s,c,rules:r,now,actorId:'system',task,finish,log,notify,identity};
      Refunds.refresh(ctx);
      for(const t of [...pending(c).filter(t=>!['plan','confirm'].includes(t.kind)||!activePeriod(c)),...(activePeriod(c)?[activePeriod(c)]:[])]){
        const policy=Rules.taskPolicy(r,t.kind,t.nodeId);
        const noticeTaskId=t.kind==='processing'?pending(c).find(x=>processingKinds.includes(x.kind))?.id||'':t.id;
        if((policy||t.kind==='processing')&&!t.reminderAt&&now<t.dueAt&&now>=t.createdAt+(t.dueAt-t.createdAt)*(r.handling?.remindPercent||80)/100){t.reminderAt=now;notify(s,c,t.assigneeId,'临期提醒 · '+(t.kind==='processing'?'联系与处理':TASKS[t.kind]),c.title,now,noticeTaskId,'task');}
        if(t.dueAt>=now||t.overdueNotifiedAt)continue;
        t.overdueNotifiedAt=now;
        notify(s,c,t.assigneeId,'办理超时提醒 · '+(t.kind==='processing'?'联系与处理':TASKS[t.kind]),c.title+'，请及时跟进。',now,noticeTaskId,'overdue');
        const n=r.notifications;
        const org=Rules.Flow.organization(s),manager=org.appointments.find(a=>a.personId===t.assigneeId&&a.active)?.managerId;
        const superior=org.appointments.some(a=>a.personId===manager&&a.active)?manager:n.escalationId;
        if((policy?policy.overdue!=='remind':n.supervisor)&&t.assigneeId!==superior)notify(s,c,superior,t.kind==='accept'?'接单超时，请跟进分配':'办理超时，请督办',c.title,now,noticeTaskId,'overdue');
        if(policy?.overdue==='transfer'&&t.kind==='accept'){
          const tried=c.tasks.filter(x=>x.kind==='accept').map(x=>x.assigneeId),row=r.routing.stores.find(x=>x.store===c.store);
          const next=!c.autoTransferredAt?[row?.backupId,r.routing.fallbackId].find(id=>id&&!tried.includes(id)&&r.routing.available[id]&&org.appointments.some(a=>a.personId===id&&a.active)):null;
          finish(t,now,'transferred');c.autoTransferredAt=now;
          if(next){c.stage='accept';task(s,c,'accept',next,now+r.timing.acceptMinutes*60000,now);}
          else{c.stage='unassigned';task(s,c,'assign',r.routing.fallbackId,now+r.timing.assignMinutes*60000,now);}
          log(s,c,'system','接单超时转派',person(s,t.assigneeId).name+'未及时接单；'+(next?'转交'+person(s,next).name:'交主管安排')+'，原期限及超时记录保留。',now);
        }
      }
      if(c.nextFollowupAt&&now>=c.nextFollowupAt&&!c.followupReminderAt&&processingKinds.includes(c.stage)){
        c.followupReminderAt=now;notify(s,c,c.ownerId,'跟进时间已到',c.waitingReason||c.title,now,pending(c).find(t=>processingKinds.includes(t.kind))?.id||'','task');
      }
      if(c.workflowVersion===3&&c.stage!=='closed'&&now>c.targetAt&&!c.targetOverdueAt){c.targetOverdueAt=now;for(const id of new Set([c.ownerId,r.routing.fallbackId]))notify(s,c,id,'整单办理超时',c.title+'，请协调当前环节。',now,'','overdue');}
      if(s.sequence!==before){if(beforeTasks!==c.tasks.map(t=>t.id+':'+t.assigneeId+':'+t.status).join('|'))c.revision++;s.revision++;}
    }
    return s;
  }
  function refresh(original,now=Date.now()+(original.offset||0)){return poll(normalize(clone(original),now),now);}
  function attachments(data) {
    const list = data.attachments || [];
    insist(Array.isArray(list) && list.length <= 3, '每次最多添加3个附件');
    list.forEach(a => insist(a && typeof a.name === 'string' && typeof a.data === 'string' && /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,[A-Za-z0-9+/=]+$/.test(a.data) && a.data.length < 720000, '附件仅支持单个500KB以内的图片或PDF'));
    return list;
  }
  function seed(now = Date.now()) {
    const s = { schema: 1, sequence: 100, revision: 1, offset: 0, cases: [], notices: [], drafts: {}, customers: [
      { id: 'customer1', name: '李女士', phone: '13800008821', member: 'DEMO-001' },
      { id: 'customer2', name: '王女士', phone: '13900004412', member: 'DEMO-002' }
    ] };
    return normalize(s);
  }
  function apply(original, actorId, command, now = Date.now() + (original.offset || 0)) {
    const s = normalize(clone(original),now), d = command.data || {}, a = person(s, actorId);
    insist(a, '请选择有效的演示身份');
    if (command.type === 'create') {
      insist(canCreate(s, actorId), '当前身份不能创建工单');
      insist(d.ruleVersion===undefined||Number(d.ruleVersion)===s.rules.version,'规则已更新，请保存草稿并刷新页面后重新提交');
      insist(d.sceneRevision===undefined||Number(d.sceneRevision)===(s.sceneRevision||0),'场景配置已更新，请保存草稿并刷新页面后重新提交');
      let customer = s.customers.find(x => x.id === (a.role === '客户' ? a.id : d.customerId));
      if (!customer) {
        const name = text(d.customerName, '客户称呼', 30), phone = text(d.phone, '联系电话', 20);
        insist(/^1\d{10}$/.test(phone), '请输入11位联系电话');
        const matches = s.customers.filter(x => x.phone === phone);
        insist(matches.length === 0, '此号码已有示例客户，请先选择已有客户并核实身份');
        customer = { id: identity(s, 'customer'), name, phone, member: '待核实' };
        s.customers.push(customer);
      }
      const store = text(d.store, '门店'); insist(STORES.includes(store), '请选择示例门店');
      if (a.role === '门店店长') insist(a.store === store, '店长只能为本店创建工单');
      const order=d.orderId?s.orders.find(o=>o.id===d.orderId):null;
      insist(!d.orderId||(order&&order.customerId===customer.id&&order.store===store),'关联订单必须属于该客户与门店');
      const rules=Rules.resolve(s,d), routing=Rules.route(rules,{...d,store},now);rules.closure.callbackOnly=true;
      const c = { id: identity(s, 'case'), number: 'KS' + new Date(now).toISOString().slice(0,10).replace(/-/g, '') + '-' + String(s.sequence).padStart(4, '0'),
        title: text(d.title, '问题摘要', 70), description: text(d.description, '问题描述'), category: routing.category, demand: d.demand || '解释道歉',
        customerId: customer.id, store, orderId:order?.id||'',order:order?.number||String(d.order || '待核实'), source: a.role === '客户' ? '客户H5' : (d.source || '400电话'),
        creatorId: actorId, ownerId: rules.routing.fallbackId, stage: routing.stage, level: routing.level, rulesSnapshot:rules, createdAt: now, firstContactDue:routing.firstContactDue, targetAt:routing.targetAt,
        workflowVersion:3, processingPeriods:[], revision: 1, round: 1, participants: a.role === '客户' ? [] : [actorId], tasks: [], records: [], plans: [], visits: [], feedback: [] };
      s.cases.unshift(c);
      log(s, c, actorId, '客诉已受理', c.description, now, true, attachments(d));
      task(s,c,routing.stage==='accept'?'accept':'assign',routing.assigneeId,routing.taskDue,now);
      log(s,c,'manager',rules.scene?'应用场景 '+rules.scene.name+' V'+rules.scene.version:'应用规则 V'+rules.version,routing.reason+'；'+routing.level+'级'+(!rules.scene&&routing.matched.length?'；命中关键词：'+routing.matched.join('、'):''),now);
      notify(s, c, c.customerId, '您的反馈已受理', '可查看处理进度并补充材料。', now);
      s.revision += 1;
      return { state: s, caseId: c.id };
    }
    const c = s.cases.find(x => x.id === command.caseId);
    insist(canView(s, actorId, c), '当前身份无权查看或处理这张工单');
    insist(c.revision === command.expectedRevision, '工单已被更新，请先查看最新状态；未提交内容已为您保留');
    if(command.type==='process')return process(s,actorId,command,now);
    const t = command.taskId ? c.tasks.find(x => x.id === command.taskId) : null;
    const rules=c.rulesSnapshot;
    const ownTask = kind => { insist(t && t.status === 'pending' && t.kind === kind, '该任务已处理或已转派，请查看最新工单'); insist(t.assigneeId === actorId, '当前任务不由您办理'); };
    const nextPlan = () => { c.stage = 'plan'; task(s, c, 'plan', c.ownerId, Math.min(now + rules.timing.planHours * HOUR, c.targetAt), now); };
    const currentPlan = () => c.plans[c.plans.length - 1];
    const refundContext={s,c,d,t,a,rules,actorId,now,command,ownTask,nextPlan,task,finish,log,notify,identity,attachments,text};
    switch (command.type) {
      case 'assign': {
        insist(['manager', 'intake'].includes(actorId), '只有主管或授权受理员可以派单');
        insist(['unassigned', 'accept', 'contact', 'plan', 'confirm'].includes(c.stage), '审批或执行中请先完成当前环节，再交接负责人');
        const target = person(s, d.assigneeId);
        insist(target && ['门店店长', '售后专员', '售后主管'].includes(target.role), '请选择可承接人员');
        insist(target.store === '*' || target.store === c.store, '该人员不在本店承接范围');
        insist(rules.routing.available[target.id], '该人员在本单适用规则中不可接单，请选择可承接人员');
        if(processingKinds.includes(c.stage)){
          c.resumeKind=c.stage;c.resumeVersion=pending(c).find(x=>processingKinds.includes(x.kind))?.version;
          c.resumeProcessingDue=activePeriod(c)?.dueAt;settlePeriod(c,now,'transferred');
        }
        pending(c).forEach(x => finish(x, now, 'transferred'));
        c.stage = 'accept'; task(s, c, 'accept', target.id, Math.min(now + rules.timing.acceptMinutes * 60000, c.firstContactDue), now);
        log(s, c, actorId, '分配负责人', target.name + ' · ' + text(d.reason, '分配原因'), now);
        break;
      }
      case 'accept':
        ownTask('accept'); finish(t, now); c.ownerId = actorId; c.stage = c.resumeKind || 'contact';
        task(s, c, c.stage, actorId, c.firstContactDue, now, c.resumeVersion?{version:c.resumeVersion}:{});delete c.resumeKind;delete c.resumeVersion;
        log(s, c, actorId, '已接单', '已承接处理，下一步联系客户。', now, true); break;
      case 'contact': {
        ownTask('contact'); insist(['connected', 'unreachable'].includes(d.result), '请选择联系结果'); const body = text(d.content, '沟通记录');
        c.firstAttemptAt = c.firstAttemptAt || now; finish(t, now);
        if (d.result === 'connected') {
          c.firstConnectedAt = c.firstConnectedAt || now; nextPlan();
          log(s, c, actorId, '已联系客户', body, now, false, attachments(d));
          log(s, c, actorId, '正在协商处理方案', '已与您沟通，正在安排后续处理。', now, true);
        } else {
          const retry = Number(d.retryAt); insist(retry > now, '请选择未来的再次联系时间');
          if(c.workflowVersion===3||rules.handling){t.status='pending';delete t.completedAt;delete t.elapsedMs;delete t.overdueMs;t.retryAt=retry;}else task(s, c, 'contact', actorId, retry, now);
          log(s, c, actorId, '联系未接通', body + '；已安排再次联系。', now);
        }
        break;
      }
      case 'plan': {
        if(d.planType==='refund'){Refunds.submit(refundContext);break;}
        ownTask('plan'); const summary = text(d.summary, '处理方案');
        insist(Array.isArray(d.items) && d.items.length > 0 && d.items.length <= 3, '至少选择一项需要履行的事项');
        const deadline = Number(d.deadline); insist(deadline > now, '请选择未来的履行时间');
        const items = d.items.map(i => {
          insist(['解释道歉', '补做服务', '预约调整'].includes(i.type), '第一批支持普通服务类处理事项');
          const executor = person(s, i.assigneeId);
          insist(executor && ['门店店长', '售后专员', '售后主管'].includes(executor.role) && (executor.store === '*' || executor.store === c.store), '执行人不在该门店承接范围');
          return { id: identity(s, 'item'), type: i.type, description: text(i.description, '履行内容'), assigneeId: i.assigneeId, status: 'pending' };
        });
        finish(t, now); const p = { version: c.plans.length + 1, summary, items, deadline, createdAt: now, confirmation: null };
        c.plans.push(p); c.stage = 'confirm';
        task(s, c, 'confirm', c.ownerId, Math.min(now+rules.timing.confirmHours*HOUR,deadline, c.targetAt), now, { version: p.version });
        log(s, c, actorId, '处理方案待确认', summary, now, true); break;
      }
      case 'confirm': {
        const p = currentPlan();
        insist(t && t.kind === 'confirm' && t.status === 'pending' && c.stage === 'confirm', '该方案已处理，请查看最新方案');
        insist(p && p.version === Number(d.version) && t.version === p.version, '方案已更新，请查看最新版本再确认');
        const phone = actorId === c.ownerId && a.role !== '客户';
        insist(phone && t.assigneeId === actorId, '只有工单负责人可以记录客户意见');
        if (phone) {text(d.evidence, '电话确认依据 / 客户沟通依据');insist(!d.method||['电话记录','企微沟通','现场沟通'].includes(d.method),'请选择有效沟通方式');}
        const agreed = d.decision === 'agree';
        insist(agreed || d.decision === 'disagree', '请选择确认结果');
        if (!agreed) text(d.reason, '不同意的原因');
        p.confirmation = { agreed, actorId, method: phone ? (d.method || '电话记录') : '客户在线', at: now, reason: d.reason || '', evidence: d.evidence, attachments: attachments(d) };
        finish(t, now);
        if (agreed) {
          if(p.type==='refund')Refunds.agree(refundContext,p);
          else {c.stage = 'service';p.items.forEach(i => task(s, c, 'service', i.assigneeId, p.deadline, now, { itemId: i.id, version: p.version, promisedAt:p.deadline }));}
          log(s, c, actorId, '客户意见已记录', '客户接受第' + p.version + '版方案。' + p.confirmation.method + '：' + d.evidence, now, false, p.confirmation.attachments);
        } else {
          if(p.type==='refund')Refunds.rejectCustomer(refundContext,p);
          nextPlan(); log(s, c, actorId, '方案需要调整', text(d.reason, '不同意的原因') + '。沟通依据：' + d.evidence, now, false, p.confirmation.attachments);
        }
        break;
      }
      case 'service': {
        ownTask('service'); const p = currentPlan(); insist(p.confirmation && p.confirmation.agreed && p.version === t.version, '客户尚未确认当前方案');
        const item = p.items.find(i => i.id === t.itemId); insist(item && item.status !== 'done', '此事项已经完成');
        item.evidence = text(d.content, '实际履行结果'); item.attachments = attachments(d); item.completedAt = now; item.status = 'done'; finish(t, now);
        log(s, c, actorId, item.type + '已完成', item.evidence, now, true, item.attachments);
        if (p.items.every(i => i.status === 'done')) { c.stage = 'visit'; task(s, c, 'visit', rules.closure.callbackId, now + rules.timing.visitHours * HOUR, now); }
        break;
      }
      case 'visit': {
        ownTask('visit'); const content = text(d.content, '回访记录'); finish(t, now);
        if (d.result === 'unreachable') {
          insist(Number(d.retryAt) > now, '请选择未来的再次回访时间');
          if(c.workflowVersion===3||rules.handling){t.status='pending';delete t.completedAt;delete t.elapsedMs;delete t.overdueMs;t.retryAt=Number(d.retryAt);}else task(s, c, 'visit', rules.closure.callbackId, Number(d.retryAt), now);
          log(s, c, actorId, '回访未接通', content, now); break;
        }
        insist(['resolved', 'unresolved'].includes(d.result), '请选择回访结果');
        const score = d.score ? Number(d.score) : null; insist(score === null || [1,2,3,4,5].includes(score), '满意度须为1至5分');
        c.visits.push({ at: now, actorId, result: d.result, score, content, round: c.round });
        log(s, c, actorId, '回访记录', content, now);
        if (d.result === 'unresolved') {
          c.round += 1; nextPlan(); log(s, c, actorId, '继续跟进处理', '回访确认仍有事项需要处理，已安排负责人继续跟进。', now, true);
          notify(s, c, rules.routing.fallbackId, '回访未解决', c.title, now);
        } else if (c.workflowVersion!==3&&Rules.needsQuality(c,score)) {
          c.stage = 'quality'; task(s, c, 'quality', rules.closure.qualityId, now + rules.timing.qualityHours * HOUR, now);
        } else close(s, c, actorId, now);
        break;
      }
      case 'quality':
        ownTask('quality'); insist(['pass', 'reject'].includes(d.decision), '请选择复核结论'); finish(t, now); log(s, c, actorId, '品控复核', text(d.content, '复核意见'), now);
        if (d.decision === 'pass') close(s, c, actorId, now); else { c.round += 1; nextPlan(); }
        break;
      case 'material':
        insist(actorId === c.customerId || c.ownerId === actorId || ['intake', 'manager'].includes(actorId), '当前身份不能补充材料');
        log(s, c, actorId, '补充材料', text(d.content, '补充说明'), now, true, attachments(d));
        notify(s, c, c.ownerId, '工单有新材料', c.title, now); break;
      case 'feedback':
        insist(actorId === c.customerId, '只有本人可以提交评价');
        insist(c.stage === 'closed', '处理完成后可提交评价，当前可先补充材料或联系负责人');
        insist([1,2,3,4,5].includes(Number(d.score)), '请选择满意度');
        c.feedback.push({ at: now, score: Number(d.score), content: text(d.content, '评价意见') });
        log(s, c, actorId, '客户评价', d.content, now, true);
        notify(s, c, c.ownerId, '客户提交了评价', c.title, now); break;
      case 'note':
        insist(a.role !== '客户', '客户请使用补充材料入口');
        log(s, c, actorId, '内部补充记录', text(d.content, '记录内容'), now); break;
      default: if(!Refunds.handle(refundContext))throw new Error('暂不支持这项操作');
    }
    if(c.workflowVersion===3&&!processingKinds.includes(c.stage)){settlePeriod(c,now);delete c.nextFollowupAt;delete c.waitingReason;}
    c.revision += 1; s.revision += 1;
    return { state: s, caseId: c.id };
  }
  function close(s, c, actorId, now) {
    const p=c.plans.at(-1),visit=c.visits.at(-1);
    insist(p&&(p.type==='refund'?p.refund.status==='succeeded':p.confirmation?.agreed&&p.items.length&&p.items.every(i=>i.status==='done')),'约定事项尚未全部履行，不能结案');
    insist(visit?.result==='resolved'&&visit.round===c.round,'本轮400回访确认解决后才能结案');
    c.stage = 'closed'; c.closedAt = now;
    log(s, c, actorId, '工单已结案', '约定事项已履行，400回访确认问题已解决。', now, true);
    notify(s, c, c.customerId, '您的售后已完成', '感谢您的反馈，欢迎评价本次处理。', now);
    notify(s, c, c.ownerId, '工单已结案', c.title, now);
  }
  function addRefundSamples(original,now=Date.now()) {
    let s=normalize(JSON.parse(JSON.stringify(original)));
    if(s.refundSamplesAdded)return s;
    [['customer1',STORES[0],'order-r1',600,'approval'],['customer2',STORES[0],'order-r2',300,'ready'],['customer1',STORES[1],'order-r3',500,'unknown']].forEach(([customerId,store,orderId,amount,end])=>{
      const created=apply(s,'intake',{type:'create',data:{customerId,store,orderId,title:'退款示例 · '+({approval:'等待审核',ready:'已确认，等待退款',unknown:'结果待核实'})[end],description:'用于演示一般退款从审批到回访的处理过程。',demand:'申请退款',category:s.rules.classification.categories.find(c=>c.enabled).name,autoAssign:true}},now);s=created.state;
      const id=created.caseId, current=()=>s.cases.find(c=>c.id===id);
      const act=(type,data={},who)=>{const c=current(),t=pending(c)[0];s=apply(s,who||t.assigneeId,{type,caseId:id,taskId:t.id,expectedRevision:c.revision,data},now).state;};
      if(current().stage==='unassigned')act('assign',{assigneeId:current().rulesSnapshot.routing.fallbackId,reason:'退款示例由主管承接'});
      act('accept');act('contact',{result:'connected',content:'已核实客户、消费订单和退款诉求。'});
      act('plan',{planType:'refund',summary:'客户申请退回未使用服务金额，审核后原路退回。',refundReason:'未使用服务申请退款',refundAmount:String(amount),orderId,deadline:now+48*HOUR});
      if(end==='approval')return;
      while(current().stage==='approval')act('refundApproval',{decision:'approve',content:'订单与金额已核对，同意本版退款。'});
      act('confirm',{decision:'agree',version:current().plans.length,evidence:'示例：负责人已电话确认客户接受本方案。'});if(end==='ready')return;
      act('refundStart');act('refundResult',{result:'unknown',content:'模拟渠道暂未返回明确结果，需继续核查。',occurredAt:now});
    });
    s.refundSamplesAdded=true;return s;
  }
  function demo(now = Date.now()) {
    let s = seed(now);
    const samples = [
      ['到店等候时间较长，希望改善预约安排', 'customer1', STORES[0], 'accept'],
      ['服务沟通不够细致，希望得到解释', 'customer2', STORES[0], 'contact'],
      ['预约时间变更未提前告知', 'customer1', STORES[0], 'confirm'],
      ['护理体验未达预期，安排补做服务', 'customer2', STORES[0], 'service'],
      ['预约衔接问题已处理，等待回访', 'customer1', STORES[1], 'visit'],
      ['门店接待反馈已解决', 'customer2', STORES[1], 'closed']
    ];
    samples.forEach((row, index) => {
      const at = now - (index + 1) * HOUR / 3;
      let r = apply(s, 'intake', { type: 'create', data: { title: row[0], description: '客户反馈：' + row[0] + '。希望门店给予明确说明并安排后续服务。', customerId: row[1], store: row[2], category: '预约等待', order: 'DEMO-ORD-00' + (index + 1) } }, at); s = r.state;
      const id = r.caseId;
      function act(type, data, overrideActor) { const c = s.cases.find(x => x.id === id), t = pending(c)[0]; s = apply(s, overrideActor || t.assigneeId, { type, caseId: id, taskId: t && t.id, expectedRevision: c.revision, data }, at + 1000).state; }
      if (row[3] === 'accept') return;
      act('accept'); if (row[3] === 'contact') return;
      act('contact', { result: 'connected', content: '已联系客户并确认诉求，客户希望明确解释及重新安排服务。' });
      act('plan', { summary: '由店长联系致歉，安排一次预约服务调整，并在完成后回访。', deadline: now + 8 * HOUR, items: [{ type: '预约调整', description: '与客户确认新的到店时间，安排专人接待。', assigneeId: row[2] === STORES[0] ? 'store1' : 'store2' }] });
      if (row[3] === 'confirm') return;
      act('confirm', { version: 1, decision: 'agree',evidence:'示例：已电话确认客户接受方案。' }); if (row[3] === 'service') return;
      act('service', { content: '已按约定完成预约安排与专人接待，客户确认已到店完成服务。' }); if (row[3] === 'visit') return;
      act('visit', { result: 'resolved', score: 5, content: '客户确认安排已落实，问题已解决，对本次处理满意。' });
    });
    return s;
  }
  const api = { STAFF, STORES, STAGES, TASKS, HOUR, Rules, Refunds, normalize, seed, demo, addRefundSamples, apply, advance, refresh, people, person, pending, canView, canCreate, mainStatus, activePeriod, timings, stageHint, isOverdue };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CaseEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
