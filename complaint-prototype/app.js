(function () {
  'use strict';
  const E=window.CaseEngine,A=window.WorkAccess,Store=window.CaseStore,KEY=Store.KEY,DRAFTS=KEY+'.drafts';
  const $ = s => document.querySelector(s), esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const params = new URLSearchParams(location.search);
  let view=['pc','staff','approval'].includes(params.get('view'))?params.get('view'):'pc';
  const retiredCustomer=params.get('view')==='customer';
  let actorId=params.get('actor')||localStorage.getItem(KEY+'.actor')||'manager';
  let embedded = params.get('embed') === '1', state, page = params.get('page') || 'tickets', detailId = '', noticeTask = '';
  let activeForm = null, activeFiles = [], dirty = false, filters = { keyword:'', status:'', scope:'mine' }, toastTimer, lastFocus;
  let rulesDraft=null, rulesBaseVersion=0, rulesTab='approval',rulesListTab='scenes',assignmentSceneId='';
  const sceneFilters={keyword:'',status:''};
  const icons = { grid:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z', ticket:'M7 3h10l3 3v15H4V3h3M8 9h8M8 13h8M8 17h5', phone:'M7 3l3 5-3 3a15 15 0 006 6l3-3 5 3c-1 5-5 5-9 3C6 17 2 11 3 7c0-2 1-3 4-4', bell:'M6 9a6 6 0 0112 0v6l2 3H4l2-3V9M10 21h4', check:'M5 12l4 4L19 6', clock:'M12 8v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0', plus:'M12 5v14M5 12h14', arrow:'M5 12h14M14 7l5 5-5 5', back:'M15 5l-7 7 7 7', user:'M16 7a4 4 0 11-8 0 4 4 0 018 0M4 21v-3a8 8 0 0116 0v3', upload:'M12 16V3M7 8l5-5 5 5M4 16v5h16v-5', search:'M10 17a7 7 0 110-14 7 7 0 010 14M15 15l6 6', history:'M3 11a9 9 0 119 10M3 4v7h7M12 7v6l4 2', shield:'M12 2l8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3M8 11l3 3 5-5', msg:'M4 4h16v13H9l-5 4V4M8 8h8M8 12h5' };
  const ico = name => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.ticket}"/></svg>`;
  const btn = (label, action, options='') => `<button type="button" class="btn ${options}" data-action="${action}">${label}</button>`;
  const now = () => Date.now() + (state.offset || 0);
  const date = (n, full=false) => new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',...(full?{year:'numeric'}:{})}).replaceAll('/', '-');
  function dateInput(n) { const d = new Date(n); return new Date(n-d.getTimezoneOffset()*60000).toISOString().slice(0,16); }
  const actor = () => E.person(state, actorId);
  const name = id => id==='system'?'系统':(E.person(state,id) || {}).name || '待分配';
  const customer = c => state.customers.find(x=>x.id===c.customerId);
  const mask = p => p ? p.slice(0,3)+'****'+p.slice(-4) : '待核实';
  const visible = () => state.cases.filter(c=>E.canView(state,actorId,c));
  const currentCase = () => state.cases.find(c=>c.id===detailId);
  const load=()=>Store.load();
  function save(s){Store.save(s);state=s;}
  const exclusive=fn=>Store.exclusive(fn);
  async function change(command) { return exclusive(()=>{ const fresh=load(); const r=E.apply(fresh,actorId,command,Date.now()+fresh.offset); save(r.state); return r; }); }
  function toast(message) { $('#toast').textContent=message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500); }
  function deadline(n) { const diff=n-now(), mins=Math.ceil(Math.abs(diff)/60000), label=mins<60?mins+'分钟':Math.floor(mins/60)+'小时'+(mins%60?mins%60+'分':''); return `<span class="deadline ${diff<0?'red':diff<E.HOUR?'orange':'muted'}" data-due="${n}">${diff<0?'已超时 ':'还剩 '}${label}</span>`; }
  const badge = c => `<span class="badge ${c.stage==='closed'?'green':['visit','quality'].includes(c.stage)?'orange':'blue'}">${esc(E.mainStatus(c))}</span>`;
  const empty = (title,desc,action='') => `<div class="empty"><div class="empty-icon">${ico('ticket')}</div><h3>${title}</h3><p>${desc}</p>${action}</div>`;
  const field = (label,name,type='text',value='',required=true,extra='') => `<div class="field ${type==='textarea'?'full':''}"><label for="f-${name}" class="${required?'required':''}">${label}</label>${type==='textarea'?`<textarea id="f-${name}" name="${name}" rows="4" ${required?'required':''} ${extra}>${esc(value)}</textarea>`:`<input id="f-${name}" name="${name}" type="${type}" value="${esc(value)}" ${required?'required':''} ${extra}>`}</div>`;
  const select = (label,name,options,value='',extra='') => `<div class="field"><label for="f-${name}">${label}</label><select id="f-${name}" name="${name}" ${extra}>${options.map(o=>{const v=Array.isArray(o)?o[0]:o,l=Array.isArray(o)?o[1]:o;return `<option value="${esc(v)}" ${v===value?'selected':''}>${esc(l)}</option>`;}).join('')}</select></div>`;
  const duration=ms=>{const m=Math.ceil(Math.max(0,ms)/60000);return m<60?m+'分钟':Math.floor(m/60)+'小时'+(m%60?m%60+'分钟':'');};
  const processKind=t=>t&&['contact','plan','confirm'].includes(t.kind);
  const taskName=t=>processKind(t)?'联系与处理':E.TASKS[t.kind];
  function taskHistory(c){
    const rows=E.timings(c,now()),late=rows.filter(t=>!t.metric&&t.overdueMs>0);
    return `<section class="panel"><div class="panel-head"><h3>办理时效与责任记录</h3><span class="badge ${late.length?'orange':'green'}">${late.length?'有 '+late.length+' 段超时':'暂无超时环节'}</span></div><div class="responsibility-list">${rows.map(t=>`<article class="responsibility-row"><div><strong>${esc(t.title)}</strong><div class="small muted">${t.metric?'联系负责人（含受理等待）':esc(name(t.assigneeId))}${t.reason?' · '+esc(t.reason):''}</div></div><div class="small">开始 ${date(t.createdAt)}<br><span class="muted">截止 ${date(t.dueAt)}</span></div><div class="small">${({done:'已完成',pending:'进行中',cancelled:'已取消',transferred:'已交接'})[t.status]||esc(t.status)}${t.completedAt?'<br>'+date(t.completedAt):''}<div class="muted">耗时 ${duration(t.elapsedMs)}</div></div><strong class="small ${t.overdueMs?'red':'green'}">${t.overdueMs?'超时 '+duration(t.overdueMs):'未超时'}</strong></article>`).join('')}</div><div class="panel-body small muted">处理阶段只统计负责人实际承接的时段，审批与财务等待单独记录。首次联系是从受理起算的整单指标，与处理时段有重叠，不累加。交接保留原人员记录，超时供核查。</div></section>`;
  }
  function progress(c){
    const index=({unassigned:0,accept:1,contact:2,plan:2,confirm:2,approval:3,service:3,refund:3,refund_check:3,visit:4,closed:5})[c.stage]??2;
    return `<ol class="case-progress" aria-label="办理流程">${['受理分派','接单','联系与处理','审批 / 执行','400回访','结案'].map((label,i)=>`<li class="${i===index?'current':i<index?'passed':''}" ${i===index?'aria-current="step"':''}><span>${i+1}</span>${label}${i===3?'<small>按需进入</small>':''}</li>`).join('')}</ol>`;
  }
  function timingSummary(c){
    const p=E.activePeriod(c),end=c.closedAt||now();
    return `<div class="timing-summary"><div><small>首次有效联系</small><strong>${c.firstConnectedAt?date(c.firstConnectedAt):deadline(c.firstContactDue)}</strong><span class="small muted">${c.firstConnectedAt?'从受理到接通 '+duration(c.firstConnectedAt-c.createdAt)+(c.firstConnectedAt>c.firstContactDue?' · 超时 '+duration(c.firstConnectedAt-c.firstContactDue):''):c.firstAttemptAt?'首次尝试 '+date(c.firstAttemptAt)+' · 尚未接通':'接单不代表已联系'}</span></div>${p?`<div><small>本段联系与处理</small><strong>${deadline(p.dueAt)}</strong><span class="small muted">${esc(name(p.assigneeId))} · ${date(p.createdAt)} 开始${p.legacy?' · 沿用历史期限':''}</span></div>`:''}<div><small>整单办结</small><strong>${c.closedAt?'用时 '+duration(end-c.createdAt):deadline(c.targetAt)}</strong><span class="small muted">${c.closedAt&&c.closedAt>c.targetAt?'超时 '+duration(c.closedAt-c.targetAt):'从受理连续计时，交接不重置'}</span></div></div>`;
  }
  function attachmentInput() { return `<div class="field full"><span class="field-title">补充凭证 <span class="muted small">选填</span></span><label class="upload-label">${ico('upload')}选择图片或PDF<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" data-upload multiple></label><small>支持图片或PDF，每个不超过500KB，每次最多3个。</small><div class="upload-files" id="upload-files"></div></div>`; }
  function attachmentView(files=[]) { return files.length?`<div class="attachments">${files.map(f=>`<details><summary>${esc(f.name)}</summary>${f.data.startsWith('data:image/')?`<img src="${esc(f.data)}" alt="${esc(f.name)}">`:`<a href="${esc(f.data)}" download="${esc(f.name)}">下载查看PDF</a>`}</details>`).join('')}</div>`:''; }
  const pageTitle=()=>({tickets:'客诉工单',detail:'工单详情',create:'新建工单',rules:'规则配置'})[page]||'客诉工单';
  function render(){
    document.body.classList.toggle('embedded',embedded&&view==='pc');
    document.body.classList.toggle('mobile-preview',view!=='pc');
    const valid=E.STAFF.some(p=>p.id===actorId),a=valid?actor():null;
    if(retiredCustomer||!valid){$('#application').innerHTML=empty('此入口不可用','请通过员工工单入口或本人收到的钉钉任务链接进入。');return;}
    let content;
    if(view==='approval')content=approvalPage();
    else if(!A.canWork(actorId))content=empty('请从钉钉任务链接进入','当前身份通过通知中的独立页面办理审批，无需进入员工工单列表。');
    else if(page==='rules')content=rulesPage();
    else if(page==='detail')content=detail();
    else if(page==='create')content=createPage();
    else content=listPage();
    if(view==='pc'){
      $('#application').innerHTML=`<div class="pc-shell"><aside class="side"><div class="brand"><span class="brand-mark">✦</span><div><strong>美业AI平台</strong><small>SERVICE OPERATIONS</small></div></div><div class="side-label">客诉管理</div><button class="nav ${page!=='rules'?'active':''}" data-go="tickets">${ico('ticket')}客诉工单</button>${A.canConfigure(actorId)?`<button class="nav ${page==='rules'?'active':''}" data-go="rules">${ico('shield')}规则配置</button>`:''}<div class="side-foot">受理、跟进与回访<br>在一张工单中协作</div></aside><main class="main"><header class="pc-header"><span>客诉管理 / ${pageTitle()}</span><div class="row"><span>${esc(a.name)} · ${esc(a.role)}</span><span class="avatar">${esc(a.name[0])}</span></div></header><div class="page-body">${content}</div></main></div>`;
    }else{
      $('#application').innerHTML=`<main class="mobile-shell ${view==='approval'?'approval-shell':''}"><header class="mobile-header"><div class="row">${view==='staff'&&page!=='tickets'?btn(ico('back'),'back','quiet'):''}<strong>${view==='approval'?'客诉审批与办理':'客诉工单'}</strong></div><small>${esc(a.name)} · ${esc(a.role)}</small></header><div class="mobile-body">${content}</div></main>`;
    }
    window.ApprovalFlowUI.mount();
    if(page==='create'&&A.canWork(actorId)&&view!=='approval'){restoreDraft('create');updateCreateCustomer();updateCreateOrders();restoreDraft('create');updateCreateOrders();refreshUploadList();updateCreateRulePreview();}
    if(view==='approval'){
      const gate=A.taskAccess(state,actorId,detailId,noticeTask);
      if(gate.allowed&&gate.actionable)openForm(gate.t.kind,gate.t.id,true);
    }
  }
  function approvalPage(){
    const gate=A.taskAccess(state,actorId,detailId,noticeTask);
    if(!gate.allowed)return empty('暂无本次任务的办理权限','请使用任务通知指定的员工身份进入。链接不会授予其他工单的访问权限。');
    const {c,t,p}=gate,cu=customer(c);
    const result=gate.invalid?'本次任务已转交或失效':gate.done?'本次任务已办理':'待您办理';
    const next=E.pending(c).filter(x=>x.assigneeId===actorId&&A.isolated(x)&&x.id!==t.id);
    return `<div class="approval-heading"><span class="badge ${gate.actionable?'blue':gate.invalid?'orange':'green'}">${result}</span><h1>${esc(taskName(t))}</h1><p>${esc(c.number)} · ${esc(c.store)}</p></div><section class="panel mb"><div class="panel-body"><div class="kv-grid"><div class="kv"><label>申请人 / 负责人</label><p>${esc(name(p?.createdBy||c.ownerId))}</p></div><div class="kv"><label>客户</label><p>${esc(cu.name)} · ${mask(cu.phone)}</p></div><div class="kv"><label>当前任务办理人</label><p>${esc(name(t.assigneeId))}</p></div><div class="kv"><label>办理期限</label><p>${date(t.dueAt)}</p></div></div></div></section>${gate.actionable?'<section class="panel mb" id="approval-action"></section>':`<section class="panel mb"><div class="panel-body"><div class="callout ${gate.invalid?'warn':'success'}">${gate.invalid?'当前任务已转交或申请已失效，请以新任务通知为准。':'您的办理结果已保存并回写工单，无需重复提交。'}</div>${p?`<div class="mt">${planView(p)}</div>`:''}${gate.done?timeline(c.records.filter(r=>r.actorId===actorId&&r.at===t.completedAt),false):''}${gate.done&&t.attemptId?window.RefundView.records(state,c,attachmentView):''}${next.length?`<div class="mt"><p class="small muted mb">同一工单还有分配给您的后续任务</p>${next.map(x=>`<a class="btn" href="${A.taskURL(actorId,c,x)}">${esc(E.TASKS[x.kind])}</a>`).join('')}</div>`:''}</div></section>`}<details class="panel context-details"><summary>查看工单背景与处理依据</summary><div class="panel-body"><h3>${esc(c.title)}</h3><p class="detail-text mt">${esc(c.description)}</p>${attachmentView(c.records[0]?.attachments)}<div class="section-label mt">客户沟通记录</div>${timeline(c.records.filter(r=>['已联系客户','客户联系记录','方案已确认','客户意见已记录'].includes(r.title)||r.title.includes('联系')||r.title.includes('沟通')),false)}${c.visits.length?`<div class="section-label mt">回访记录</div>${c.visits.map(v=>`<p class="detail-text">${esc(v.content)}</p>`).join('')}`:''}</div></details>`;
  }

  function rulesPage() {
    if(view!=='pc'||!A.canConfigure(actorId))return empty('暂无配置权限','规则配置仅由授权管理员在PC端维护。');
    if(rulesDraft)return window.RuleSettingsView.editor(state,rulesDraft,rulesTab);
    if(rulesListTab==='assignment'){
      const scene=E.Rules.sceneList(state).find(s=>s.id===assignmentSceneId);
      return `<div class="page-heading scene-editor-heading secondary-page-heading"><div><button class="btn quiet blue secondary-page-back" data-scene-action="back">‹ 返回</button><h1>指派规则</h1></div></div>`+window.NodeAssignmentView.render(state,{actorId,toast,sceneId:scene?.id,tab:location.hash.split('/')[3],refresh:()=>{state=load();render();}});
    }
    const pageHeader=heading('规则配置','维护规则基础信息，配置方案审批与指派规则。',rulesListTab==='scenes'?'<button class="btn primary" data-scene-action="new">＋ 新建规则</button>':'');
    return pageHeader+`<section class="panel rules-query-panel">${window.RuleSettingsView.filterBar(sceneFilters)}</section>`+window.RuleSettingsView.list(state,sceneFilters);
  }
  function captureRules(){if(rulesDraft)rulesDraft=window.RuleSettingsView.read($('#rules-form'),rulesDraft);}
  async function sceneAction(action,b){
    if(!A.canConfigure(actorId))return;
    if(action==='reset-filter'){sceneFilters.keyword='';sceneFilters.status='';render();return;}
    if(action==='new'||action==='edit-basic'){
      state=load();const scene=action==='new'?E.Rules.prepareScene(E.Rules.newScene(state)):E.Rules.sceneList(state).find(x=>x.id===b.dataset.id);
      if(!scene)return toast('规则不存在，请刷新列表');
      activeForm={type:'scene-basic',draft:scene,baseRevision:state.sceneRevision||0};dirty=false;lastFocus=document.activeElement;
      $('#modal-root').innerHTML=`<div class="overlay"><section class="drawer rule-basic-drawer" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="drawer-head"><h2 id="dialog-title">${scene.id?'编辑规则':'新建规则'}</h2><button type="button" class="close" data-action="close-modal" aria-label="关闭基础信息">×</button></header><form id="scene-basic-form" novalidate><div class="drawer-scroll"><div id="scene-basic-error" class="form-error callout error" role="alert"></div>${window.RuleSettingsView.basicEditor(scene)}</div><footer class="form-actions">${btn('取消','close-modal')}<button class="btn primary" type="submit">保存</button></footer></form></section></div>`;
      document.body.style.overflow='hidden';$('#scene-basic-form input')?.focus();return;
    }
    if(action==='assignment'){
      window.NodeAssignmentView.reset();state=load();const scene=E.Rules.sceneList(state).find(x=>x.id===b.dataset.id);if(!scene)return toast('规则不存在，请刷新列表');
      rulesDraft=null;assignmentSceneId=scene.id;rulesListTab='assignment';dirty=false;history.replaceState(null,'','#rules/'+encodeURIComponent(scene.id)+'/assignment');render();window.scrollTo(0,0);return;
    }
    if(action==='edit'){
      rulesListTab='scenes';assignmentSceneId='';state=load();rulesDraft=E.Rules.sceneList(state).find(x=>x.id===b.dataset.id);
      if(!rulesDraft)return toast('审批场景不存在，请刷新列表');rulesDraft=E.Rules.prepareScene(rulesDraft);rulesBaseVersion=state.sceneRevision||0;rulesTab='approval';dirty=false;history.replaceState(null,'','#rules/'+encodeURIComponent(rulesDraft.id)+'/approval');render();window.scrollTo(0,0);return;
    }
    if(action==='back'){rulesDraft=null;assignmentSceneId='';dirty=false;rulesListTab='scenes';history.replaceState(null,'','#rules/scenes');render();window.scrollTo(0,0);return;}
    if(action==='toggle'){
      const revision=state.sceneRevision||0;
      await exclusive(()=>{const fresh=load();save(E.Rules.toggleScene(fresh,actorId,b.dataset.id,revision,Date.now()+fresh.offset));});render();toast('审批场景状态已更新，已有工单不受影响');return;
    }
  }

  async function submitSceneBasic(form){
    const ctx=activeForm;if(ctx?.type!=='scene-basic')return;
    const draft=window.RuleSettingsView.read(form,ctx.draft),submit=form.querySelector('[type=submit]');submit.disabled=true;
    try{
      await exclusive(()=>{const fresh=load();save(E.Rules.saveScene(fresh,actorId,draft,ctx.baseRevision,Date.now()+fresh.offset));});
      closeModal(true);rulesListTab='scenes';rulesDraft=null;history.replaceState(null,'','#rules/scenes');render();toast('规则基础信息已保存');
    }catch(error){$('#scene-basic-error').textContent=error.message;$('#scene-basic-error').scrollIntoView({block:'nearest'});submit.disabled=false;}
  }

  async function submitRules(form){
    captureRules();const submit=document.querySelector('[form="rules-form"]');submit.disabled=true;
    try{
      await exclusive(()=>{const fresh=load();save(E.Rules.saveScene(fresh,actorId,rulesDraft,rulesBaseVersion,Date.now()+fresh.offset));});
      rulesDraft=null;dirty=false;rulesListTab='scenes';history.replaceState(null,'','#rules/scenes');render();window.scrollTo(0,0);toast('方案审批配置已保存，新工单按对应审批场景办理');
    }catch(error){$('#rules-error').textContent=error.message;$('#rules-error').scrollIntoView({block:'center'});submit.disabled=false;}
  }
  function updateCreateRulePreview(){
    const f=$('#create-form'),el=$('#create-rule-preview');if(!f||!el)return;
    try{const d=Object.fromEntries(new FormData(f));d.autoAssign=f.elements.autoAssign?.checked;const r=E.Rules.resolve(state,d),p=E.Rules.route(r,d,now());el.textContent=(r.scene?r.scene.name+' V'+r.scene.version:'适用规则 V'+r.version)+' · '+p.reason+'（'+name(p.assigneeId)+'） · 首次联系：'+date(p.firstContactDue);}
    catch(error){el.textContent=error.message;}
  }
  function heading(title,desc,action='') { return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`; }
  function filterCases(){
    return visible().filter(c=>{
      if(!A.inScope(c,actorId,filters.scope))return false;
      const q=filters.keyword.trim().toLowerCase(),cu=customer(c);
      const match=!q||[c.number,c.title,cu.name,cu.phone,c.store].some(v=>v.toLowerCase().includes(q));
      const status=!filters.status||(filters.status==='overdue'?E.isOverdue(c,now()):filters.status==='visit'?c.stage==='visit':filters.status==='approval'?['approval','quality'].includes(c.stage):E.mainStatus(c)===filters.status);
      return match&&status;
    });
  }
  function listPage(){
    const cs=filterCases(),vs=visible(),myTasks=vs.flatMap(c=>E.pending(c).filter(t=>t.assigneeId===actorId));
    const scopes=[['mine','待我处理'],['created','我发起的'],['involved','我参与的'],...(A.canConfigure(actorId)?[['all','全部工单']]:[])];
    const ds=Object.entries(readDrafts()).filter(([key])=>key.startsWith(actorId+':'));
    return heading('客诉工单',view==='pc'?'受理客户反馈，持续跟进处理结果。':'查看需要您办理的事项，随时补充处理进展。',E.canCreate(state,actorId)?btn(ico('plus')+'新建工单','create','primary'):'')+
    `<div class="queue-summary"><span>待我办理 <b>${myTasks.length}</b></span><span>其中超时 <b class="${myTasks.some(t=>t.dueAt<now())?'red':''}">${myTasks.filter(t=>t.dueAt<now()).length}</b></span><span>待我回访 <b>${myTasks.filter(t=>t.kind==='visit').length}</b></span></div>${ds.length?`<details class="draft-strip"><summary>继续未提交的草稿 · ${ds.length}</summary>${ds.map(([key,d])=>`<div class="row between mt"><span>${esc(key.endsWith(':create')?'新建工单':d.label)} · ${date(d.at)}</span><button class="btn compact" data-draft="${esc(key)}">继续填写</button></div>`).join('')}</details>`:''}<section class="${view==='pc'?'panel':'mobile-list'}"><nav class="tabs scope-tabs" aria-label="工单范围">${scopes.map(([key,label])=>`<button data-scope="${key}" class="${filters.scope===key?'active':''}">${label}<span>${vs.filter(c=>A.inScope(c,actorId,key)).length}</span></button>`).join('')}</nav><form class="filters" id="filters-form"><input name="keyword" aria-label="搜索工单" placeholder="工单号 / 客户 / 手机号" value="${esc(filters.keyword)}"><select name="status" aria-label="处理状态">${[['','全部状态'],['overdue','已超时'],['待分配','待分配'],['待接单','待接单'],['待首次联系','待首次联系'],['处理中','处理中'],['待服务履行','待服务履行'],['待财务处理','待财务处理'],['退款处理中','退款处理中'],['approval','审批中'],['visit','待回访'],['已结案','已结案']].map(([v,l])=>`<option value="${v}" ${v===filters.status?'selected':''}>${l}</option>`).join('')}</select><button class="btn" type="submit">查询</button>${btn('清除','clear-filter','quiet')}</form>${view==='pc'?table(cs):cs.map(c=>mobileCard(c)).join('')}${cs.length?'':empty('当前范围暂无工单','可切换“我发起的”或调整筛选条件。')}<div class="table-foot">共 ${cs.length} 张工单 · 当前身份可访问范围</div></section>`;
  }

  function quickAction(c){
    const own=E.pending(c).find(t=>t.assigneeId===actorId);
    return own?A.isolated(own)?`<a class="btn compact primary" href="${A.taskURL(actorId,c,own)}" target="_blank" rel="noopener">去办理</a>`:`<button class="btn compact primary" data-open-case="${c.id}" data-task="${own.id}">${own.kind==='accept'?'接单':own.kind==='visit'?'去回访':processKind(own)?'去处理':'去履行'}</button>`:`<button class="btn quiet compact blue" data-case="${c.id}">查看详情</button>`;
  }
  function table(cs) {return `<div class="table-wrap"><table><thead><tr><th>工单 / 问题摘要</th><th>客户 / 门店</th><th>当前环节</th><th>当前办理人</th><th>环节与整单时限</th><th>操作</th></tr></thead><tbody>${cs.map(c=>{const cu=customer(c),t=E.pending(c).sort((a,b)=>a.dueAt-b.dueAt)[0],period=E.activePeriod(c);return `<tr><td class="table-title"><button data-case="${c.id}">${esc(c.title)}</button><div class="sub">${esc(c.number)} · ${c.level}级</div></td><td><strong>${esc(cu.name)}</strong><div class="sub">${esc(c.store)}</div></td><td>${badge(c)}<div class="sub">${esc(E.stageHint(c))}</div></td><td>${esc(t?name(t.assigneeId):'已完成')}<div class="sub">${t?esc(taskName(t)):''}</div></td><td>${t?`<div class="small">${processKind(t)?'处理阶段':'当前环节'} ${deadline(period?.dueAt||t.dueAt)}</div>`:''}${!c.firstConnectedAt&&t?`<div class="small">首次联系 ${deadline(c.firstContactDue)}</div>`:''}<div class="small muted">${c.stage==='closed'?'结案 '+date(c.closedAt):'整单 '+deadline(c.targetAt)}</div></td><td>${quickAction(c)}</td></tr>`;}).join('')}</tbody></table></div>`;}
  function mobileCard(c){const t=E.pending(c).find(t=>t.assigneeId===actorId)||E.pending(c)[0];return `<article class="mobile-card"><div class="row between"><span class="small muted">${esc(c.number)}</span>${badge(c)}</div><h3>${esc(c.title)}</h3><p class="small muted">${esc(customer(c).name)} · ${esc(c.store)}</p><p class="small muted">${esc(E.stageHint(c))}</p><div class="card-bottom"><div><p class="small">${t?esc(name(t.assigneeId))+' · '+deadline(E.activePeriod(c)?.dueAt||t.dueAt):'已完成'}</p>${c.stage!=='closed'?'<p class="small">整单 '+deadline(c.targetAt)+'</p>':''}</div>${quickAction(c)}</div></article>`;}
  function taskButton(c,t){
    if(A.isolated(t))return `<a class="btn primary" href="${A.taskURL(actorId,c,t)}">${esc(taskName(t))} ${ico('arrow')}</a>`;
    const item=t.itemId&&c.plans.at(-1)?.items.find(i=>i.id===t.itemId);
    return `<button type="button" class="btn primary" data-form="${processKind(t)?'process':t.kind}" data-task="${t.id}">${esc(taskName(t))}${item?' · '+esc(item.type):''}</button>`;
  }
  function detail(){
    const c=currentCase();if(!E.canView(state,actorId,c))return empty('暂无访问权限','当前身份不能查看这张工单。',btn('返回工单','tickets'));
    const cu=customer(c),tasks=E.pending(c),own=tasks.filter(t=>t.assigneeId===actorId),p=c.plans.at(-1);
    const edit=c.ownerId===actorId||['intake','manager'].includes(actorId);
    return heading(esc(c.number),esc(c.title),btn(ico('back')+'返回工单','tickets'))+
    `${progress(c)}${timingSummary(c)}${noticeTask&&!tasks.some(t=>t.id===noticeTask)?'<div class="callout mb">这条通知对应的任务已办理或已转交，当前展示工单最新进度。</div>':''}<section class="panel mb"><div class="task-card"><div class="row between"><span class="small blue">${own.length?'当前需要您办理':'当前处理进度'}</span>${badge(c)}</div>${tasks.length?tasks.map(t=>`<div class="current-task"><div><h3>${esc(taskName(t))}</h3><p class="small muted">办理人 ${esc(name(t.assigneeId))} · ${processKind(t)?'本段处理截止':'截止'} ${date(processKind(t)?E.activePeriod(c)?.dueAt||t.dueAt:t.dueAt)}${t.retryAt?' · 下次联系 '+date(t.retryAt):''}</p></div>${t.assigneeId===actorId?taskButton(c,t):deadline(t.dueAt)}</div>`).join(''):'<h3 class="mt green">处理已完成，记录已归档</h3>'}${['intake','manager'].includes(actorId)&&['unassigned','accept','contact','plan','confirm'].includes(c.stage)?`<div class="mt">${btn('调整负责人','assign','compact')}</div>`:''}${c.ownerId===actorId&&p?.type==='refund'&&['approval','awaiting_customer','ready','failed'].includes(p.refund.status)?`<div class="mt">${btn('撤回修改退款方案','reviseRefund','compact')}</div>`:''}</div></section><div class="case-layout"><div class="stack"><section class="panel"><div class="panel-head"><h3>问题与客户资料</h3>${edit?btn('补充材料','material','compact'):''}</div><div class="panel-body"><div class="kv-grid mb">${[['客户',cu.name+' · '+mask(cu.phone)],['所属门店',c.store],['关联订单',c.order],['客户诉求',c.demand],['投诉分类',c.category],['受理来源',c.source]].map(([k,v])=>`<div class="kv"><label>${k}</label><p>${esc(v)}</p></div>`).join('')}</div><p class="detail-text">${esc(c.description)}</p>${attachmentView(c.records[0]?.attachments)}</div></section><section class="panel"><div class="panel-head"><h3>处理方案与执行结果</h3>${p?`<span class="badge">当前 V${p.version}</span>`:''}</div><div class="panel-body">${p?planView(p):'<p class="muted">接单后进入“联系与处理”，记录跟进或提交处理结果。</p>'}${c.plans.length>1?`<details class="mt"><summary>查看 ${c.plans.length-1} 个历史版本</summary><div class="mt">${c.plans.slice(0,-1).reverse().map(p=>planView(p)).join('')}</div></details>`:''}${c.plans.some(p=>p.type==='refund')?`<details class="mt"><summary>退款执行记录与凭证</summary><div class="mt">${window.RefundView.records(state,c,attachmentView)}</div></details>`:''}${c.visits.length?`<div class="section-label mt">回访结果</div>${c.visits.map(v=>`<div class="plan-item"><strong>第${v.round}轮 · ${v.result==='resolved'?'问题已解决':'继续处理'}</strong><p>${esc(v.content)}</p><p>${esc(name(v.actorId))} · ${date(v.at)} · ${v.score===null?'':v.score+'分'}</p></div>`).join('')}`:''}</div></section><section class="panel"><div class="panel-head"><h3>处理记录</h3>${btn('添加记录','note','compact')}</div><div class="panel-body">${timeline(c.records,false)}</div></section></div><aside class="panel case-meta"><div class="panel-head"><h3>责任与时限</h3></div><div class="panel-body"><ul class="line-list">${[['总负责人',name(c.ownerId)],['创建人',name(c.creatorId)],['受理时间',date(c.createdAt)],['首次联系期限',date(c.firstContactDue)],['整体办理目标',date(c.targetAt)],['投诉等级',c.level+'级'],['适用场景',c.rulesSnapshot.scene?c.rulesSnapshot.scene.name+' V'+c.rulesSnapshot.scene.version:'历史规则 V'+c.rulesSnapshot.version],['处理轮次','第'+c.round+'轮']].map(([k,v])=>`<li><label>${k}</label><strong>${esc(v)}</strong></li>`).join('')}</ul></div></aside></div><div class="mt">${taskHistory(c)}</div>`;
  }

  function timeline(records,publicOnly) { const rs=records.filter(r=>!publicOnly||r.public).slice().reverse(); return `<div class="timeline">${rs.map(r=>`<article class="record"><div class="row between"><h3>${esc(r.title)}</h3><small>${date(r.at)}</small></div><p>${esc(r.body)}</p>${publicOnly?'':`<small>${esc(name(r.actorId))}</small>`}${attachmentView(r.attachments)}</article>`).join('')}</div>`; }
  function confirmationView(p){const v=p.confirmation;return v?`<div class="callout mt ${v.agreed?'success':'warn'}"><strong>客户意见 · ${v.agreed?'接受方案':'需要调整'}</strong><p class="mt">${esc(v.method)} · ${esc(name(v.actorId))} · ${date(v.at)}</p><p>${esc(v.evidence||'历史确认记录')}${v.reason?' · '+esc(v.reason):''}</p>${attachmentView(v.attachments)}</div>`:'';}
  function planView(p) { if(p.type==='refund')return window.RefundView.plan(p)+confirmationView(p); return `<div class="mb"><div class="row between mb"><h3>处理方案 <span class="badge">V${p.version}</span></h3><span class="badge ${p.confirmation?(p.confirmation.agreed?'green':'orange'):'blue'}">${p.confirmation?(p.confirmation.agreed?'客户已确认':'客户提出异议'):'待记录客户意见'}</span></div><p class="detail-text">${esc(p.summary)}</p><p class="muted small mt">${p.resolvedInContact?'本次联系中已实际解决':'约定履行时间：'+date(p.deadline,true)}</p>${p.items.map(i=>`<div class="plan-item"><div class="row between"><strong class="small">${esc(i.type)}</strong><span class="badge ${i.status==='done'?'green':''}">${i.status==='done'?'已履行':'待履行'}</span></div><p>${esc(i.description)}</p><p>执行人：${esc(name(i.assigneeId))}</p>${i.evidence?`<p class="green">履行结果：${esc(i.evidence)}</p>`:''}</div>`).join('')}${confirmationView(p)}</div>`; }
  function createPage() {
    if(!E.canCreate(state,actorId)) return empty('当前角色不能新建工单','请由受理员或门店员工代为受理。');
    const existingDraft=readDrafts()[actorId+':create']; activeFiles=existingDraft?.files||[];
    const storeOptions=actor().role==='门店店长'?[actor().store]:E.STORES;
    return heading('新建客诉工单','先受理，再补齐资料。每一张工单都有明确的负责人。')+`<form id="create-form" class="panel"><input type="hidden" name="ruleVersion" value="${state.rules.version}"><input type="hidden" name="sceneRevision" value="${state.sceneRevision||0}"><div id="create-rule-preview" class="callout rule-create-note"></div><section class="form-section"><h3>客户与消费信息</h3><div class="form-grid">${select('选择客户','customerId',state.customers.map(c=>[c.id,c.name+' · '+mask(c.phone)]).concat([['new','新增待核实客户']]),state.customers[0].id)}<div class="field full" id="new-customer-fields" hidden><div class="form-grid">${field('客户称呼','customerName','text','',false)}${field('联系电话','phone','tel','',false)}</div></div>${select('所属门店','store',storeOptions,storeOptions[0])}${select('关联订单（选填）','orderId',[['','暂未关联订单']])}<div class="full" id="order-summary"></div>${select('受理来源','source',['400电话','门店反馈','员工代发起','企微售后'],'400电话')}</div><div id="related-cases" class="mt"></div></section><section class="form-section"><h3>问题与诉求</h3><div class="form-grid">${field('问题摘要','title','text','',true,'maxlength="70" placeholder="例如：到店等候时间过长，希望调整预约"')}${select('审批场景','sceneId',E.Rules.sceneList(state).filter(s=>s.enabled).map(s=>[s.id,s.name]),E.Rules.sceneList(state).find(s=>s.enabled)?.id||'','required')}${select('问题分类','category',state.rules.classification.categories.filter(c=>c.enabled).map(c=>c.name),'','required')}${select('希望如何处理','demand',['解释道歉','补做服务','预约调整','申请退款'])}${field('问题描述','description','textarea','',true,'placeholder="请描述发生时间、具体情况及希望获得的帮助"')}${attachmentInput()}</div></section>${`<section class="form-section"><h3>受理安排</h3><label class="check-row"><input type="checkbox" name="autoAssign" checked>按当前配置的派单规则受理</label><p class="muted small">按所选场景安排承接人；关闭自动派单时，门店场景进入主管分配队列。首次联系从受理时开始计时。</p></section>`}<div class="form-section form-error" id="create-error" role="alert"></div><footer class="form-actions">${btn('保存草稿','save-create')}${btn('返回','back')}<button class="btn primary" type="submit">受理并生成工单</button></footer></form>`;
  }
  function updateCreateCustomer() {
    const f=$('#create-form'); if(!f)return;
    const id=f.elements.customerId?.value;
    $('#new-customer-fields').hidden=id!=='new';
    const related=state.cases.filter(c=>c.customerId===id&&c.stage!=='closed'&&E.canView(state,actorId,c));
    $('#related-cases').innerHTML=related.length?`<div class="callout">该客户有 ${related.length} 张进行中的工单，请核对是否为同一问题。<div class="mt">${select('处理方式','duplicateMode',[['new','不同问题，创建新工单'],...related.map(c=>[c.id,'追加至 '+c.number+' · '+c.title])],'new')}</div></div>`:'';
  }
  function updateCreateOrders() {
    const f=$('#create-form');if(!f)return;
    const selected=f.elements.orderId.value, orders=E.Refunds.eligibleOrders(state,{customerId:f.elements.customerId.value,store:f.elements.store.value});
    f.elements.orderId.innerHTML='<option value="">暂未关联订单</option>'+orders.map(o=>`<option value="${o.id}">${esc(o.number+' · '+o.title)}</option>`).join('');
    f.elements.orderId.value=orders.some(o=>o.id===selected)?selected:'';
    $('#order-summary').innerHTML=window.RefundView.orderBox(state,f.elements.orderId.value);
  }
  function updateRefundPreview() {
    const f=$('#task-form');if(!f)return;
    if(f.elements.intent){if(f.elements.intent.value==='refund'){$('#refund-order-summary').innerHTML=window.RefundView.orderBox(state,f.elements.orderId.value);$('#refund-route-preview').textContent=window.RefundView.routePreview(currentCase(),f.elements.refundAmount.value,state);}return;}
    if(!f.elements.planType)return;
    $('#refund-order-summary').innerHTML=window.RefundView.orderBox(state,f.elements.orderId.value);
    $('#refund-route-preview').textContent=window.RefundView.routePreview(currentCase(),f.elements.refundAmount.value,state);
    const submit=f.querySelector('[type=submit]'),label=f.elements.planType.value==='refund'?'提交退款审批':'保存方案并联系客户';
    if(submit.textContent!==label)submit.textContent=label;
  }

  function readDrafts() { try{return JSON.parse(localStorage.getItem(DRAFTS)||'{}');}catch{return {};} }
  function draftKey(kind) { return actorId+':'+(kind==='create'?'create':activeForm.caseId+':'+activeForm.taskId+':'+activeForm.type); }
  function capture(form) { const vals={}; for(const el of form.elements) { if(!el.name||el.type==='file')continue; vals[el.name]=el.type==='checkbox'?el.checked:el.value; } return vals; }
  function saveDraft(kind) { const form=kind==='create'?$('#create-form'):$('#task-form'), ds=readDrafts(); ds[draftKey(kind)]={ values:capture(form), files:activeFiles, context:activeForm, label:activeForm?.label, at:now() }; localStorage.setItem(DRAFTS,JSON.stringify(ds)); dirty=false; toast('草稿已保存，办理期限继续计时'); }
  function restoreDraft(kind) {
    const drafts=readDrafts(),form=kind==='create'?$('#create-form'):$('#task-form');let draft=drafts[draftKey(kind)];
    if(!draft&&kind==='task'&&activeForm.type==='process'){
      const old=Object.entries(drafts).find(([key,d])=>key.startsWith(actorId+':'+activeForm.caseId+':'+activeForm.taskId+':')&&['contact','plan','confirm'].includes(d.context?.type));
      if(old){const v=old[1].values;draft={...old[1],values:{...v,intent:'followup',contactResult:v.result==='unreachable'?'unreachable':v.result==='connected'?'connected':'none',content:v.content||v.summary||v.evidence||'',waitingReason:v.reason||''}};activeForm.legacyDraftKey=old[0];}
    }
    if(!draft||!form)return;
    for(const [k,v] of Object.entries(draft.values)){const el=form.elements[k];if(el&&k!=='ruleVersion'){if(el.type==='checkbox')el.checked=v;else el.value=v;}}
    activeFiles=draft.files||[];conditionalFields();
    if(activeForm?.legacyDraftKey){const message=document.createElement('p');message.className='callout mb';message.textContent='已载入旧版草稿的沟通内容与附件，请核对本次处理结果后提交。原草稿在成功提交前保留。';form.querySelector('.drawer-scroll')?.prepend(message);}
  }
  function removeDraft(kind) { const ds=readDrafts(); delete ds[draftKey(kind)]; if(kind==='task'&&activeForm.legacyDraftKey)delete ds[activeForm.legacyDraftKey]; localStorage.setItem(DRAFTS,JSON.stringify(ds)); }
  function openForm(type, taskId='', inline=false) {
    const c=currentCase(); if(!c||!E.canView(state,actorId,c))return toast('当前身份无权访问这张工单');
    const t=c.tasks.find(t=>t.id===taskId),p=t?.version?c.plans.find(p=>p.version===t.version):c.plans.at(-1);
    if(view==='approval'&&(!inline||!A.taskAccess(state,actorId,c.id,taskId).actionable))return toast('此入口只能办理通知指定的任务');
    if(view!=='approval'&&A.isolated(t)){window.open(A.taskURL(actorId,c,t),'_blank','noopener');return;}
    if(t&&t.status!=='pending')return toast('此任务已处理，请查看最新工单');
    if(t && t.assigneeId!==actorId && !(type==='confirm'&&c.ownerId===actorId))return toast('当前任务不由您办理');
    if(processKind(t)&&['contact','plan','confirm','process'].includes(type))type='process';
    let fields='',label='',submit='提交',message='',command=type;
    const retry=()=>`<div class="field full" data-conditional="result:unreachable" hidden>${field('下次联系时间','retryAt','datetime-local',dateInput(now()+c.rulesSnapshot.closure.retryHours*E.HOUR),false)}</div>`;
    const eligible=E.STAFF.filter(a=>['门店店长','售后专员','售后主管'].includes(a.role)&&(a.store==='*'||a.store===c.store)).map(a=>[a.id,a.name+' · '+a.role]);
    const refundForm=window.RefundView.form(type,state,c,p,t,{field,select,attachmentInput,dateInput,confirmationView,now:now()});
    if(refundForm)({fields,label,submit,message,command}=refundForm);
    else switch(type) {
      case 'process': {
        label='联系与处理';
        const confirming=t.kind==='confirm',orders=E.Refunds.eligibleOrders(state,c),period=E.activePeriod(c);
        const group=(intents,html)=>`<div class="full form-grid process-fields" data-process-fields="${intents}">${html}</div>`;
        fields=`<div class="process-context full"><strong>${esc(E.stageHint(c))}</strong><p>本段截止 ${date(period?.dueAt||t.dueAt)} · 保存跟进不重置时限</p>${c.nextFollowupAt?`<p>待跟进：${esc(c.waitingReason)} · ${date(c.nextFollowupAt)}</p>`:''}</div>`+
          select('本次联系情况','contactResult',[['connected','已接通客户'],['unreachable','未接通客户'],['none','本次仅内部跟进']],c.firstConnectedAt?'none':'connected')+
          select('沟通方式','method',['电话记录','企微沟通','现场沟通'],'电话记录')+
          field('联系与处理记录','content','textarea','',true,'placeholder="记录客户诉求、本次沟通或内部处理的实际进展"')+
          select('本次处理结果','intent',confirming?[['followup','继续跟进，暂不提交结果'],['confirm','记录当前版本的客户意见']]:[['followup','继续跟进，暂不提交结果'],['resolved','已实际解决，提交400回访'],['service','已协商一致，安排后续服务'],['refund','申请退款，提交审批']],'followup')+
          group('followup',field('待跟进事项 / 等待原因','waitingReason','text',c.waitingReason||'',true,'placeholder="例如：客户暂不方便接听，约明日再联系"')+field('下次跟进时间','retryAt','datetime-local',dateInput(now()+E.HOUR),true))+
          group('resolved service',`<label class="check-row full"><input type="checkbox" name="customerAgreed" required>客户已明确接受本次处理结果或服务安排</label>`+field('客户意见依据','evidence','textarea','',true,'placeholder="记录客户原话、沟通时间及同意的具体内容"'))+
          group('resolved',field('已实际完成的解决内容','fulfillment','textarea','',true,'placeholder="例如：已解释并致歉，客户认可，本次无待执行事项"'))+
          group('service',select('履行事项','serviceType',['补做服务','预约调整','解释道歉'],'补做服务')+select('服务执行人','executorId',eligible,c.ownerId)+field('约定完成时间','deadline','datetime-local',dateInput(now()+c.rulesSnapshot.timing.serviceHours*E.HOUR))+field('后续服务安排','itemDescription','textarea','',true,'placeholder="写清要执行的具体事项，执行人登记实际完成后才进入回访"'))+
          group('refund',select('退款订单','orderId',[['','请选择关联订单'],...orders.map(o=>[o.id,o.number+' · '+o.title])],c.orderId||'','required')+field('本次退款金额（元）','refundAmount','number','',true,'min="0.01" step="0.01"')+field('预计退款完成时间','refundDeadline','datetime-local',dateInput(now()+c.rulesSnapshot.timing.refundHours*E.HOUR))+field('退款原因','refundReason','textarea')+`<div class="full" id="refund-order-summary"></div><div class="callout full">审批通过后，由负责人确认本版方案的客户意见，再交财务。<div id="refund-route-preview"></div></div>`)+
          (confirming?group('confirm',`<div class="full">${planView(p)}</div><input type="hidden" name="version" value="${p.version}">`+select('本版方案的客户意见','decision',[['agree','客户明确接受本版方案'],['disagree','客户不接受，继续调整']],'agree')+field('不同意原因（不同意时必填）','reason','textarea','',false)+`<p class="small muted full">上方联系与处理记录须写清沟通时间与确认依据。仅对当前 V${p.version} 生效。</p>`):'')+attachmentInput();
        submit='保存跟进';message='记录一次真实办理进展。已解决直接交400回访；还有服务或退款事项时，先完成对应执行。';break;
      }
      case 'assign': {const available=eligible.filter(([id])=>c.rulesSnapshot.routing.available[id]);label='分配负责人';fields=select('承接人员','assigneeId',available,available[0]?.[0])+field('分配原因','reason','textarea','按门店安排对应负责人跟进');submit='确认分配';break;}
      case 'accept': label='接单确认';fields=`<div class="callout full">接单后，您将负责持续跟进本工单。首次联系截止时间：${date(c.firstContactDue)}。</div>`;submit='确认接单';break;
      case 'contact': label='记录客户联系';fields=select('联系结果','result',[['connected','已接通，诉求已确认'],['unreachable','未接通，安排再次联系']],'connected')+field('联系时间','contactTime','text',date(now()),false,'readonly')+field('沟通内容 / 未接通说明','content','textarea','',true,'placeholder="记录客户诉求、沟通结果和下一步安排"')+retry()+attachmentInput();submit='保存联系结果';break;
      case 'plan': {
        const refund=p?.type==='refund'||c.demand==='申请退款',orders=E.Refunds.eligibleOrders(state,c);
        label='制定处理方案';fields=select('方案类型','planType',[['service','普通服务'],['refund','一般退款']],refund?'refund':'service')+field('约定履行 / 预计退款办理时间','deadline','datetime-local',dateInput(now()+c.rulesSnapshot.timing[refund?'refundHours':'serviceHours']*E.HOUR))+field('方案说明','summary','textarea',refund?p?.summary||'':'',true,'placeholder="说明具体安排及对客户的承诺"')+
          `<div class="full form-grid" data-plan-fields="service">`+select('服务执行人','executorId',eligible,c.store===E.STORES[0]?'store1':'store2')+`<div class="field full"><span class="field-title">履行事项（可多选）</span>${['解释道歉','补做服务','预约调整'].map((v,i)=>`<label class="check-row"><input type="checkbox" name="item${i}" ${i===0?'checked':''}>${v}</label>`).join('')}</div>`+field('各项履行内容','itemDescription','textarea','',true,'placeholder="写清各项具体安排，所选事项均须登记完成"')+`</div><div class="full form-grid" data-plan-fields="refund">`+select('退款订单','orderId',[['','请选择关联订单'],...orders.map(o=>[o.id,o.number+' · '+o.title])],c.orderId||'','required')+field('本次退款金额（元）','refundAmount','number',p?.refund?String(p.refund.amountCents/100):'',true,'min="0.01" step="0.01"')+`<div class="full" id="refund-order-summary"></div>`+field('退款原因','refundReason','textarea',p?.refund?.reason||'')+`<div class="callout full">退款方式：原路退回。<div id="refund-route-preview" class="mt"></div></div></div>`;
        submit=refund?'提交退款审批':'保存方案并联系客户';message='保存方案后，由负责人联系客户并记录意见；一般退款需先完成审批。';break;
      }
      case 'confirm': label='记录客户意见';fields=`<div class="field full">${planView(p)}</div><input type="hidden" name="version" value="${p.version}">`+select('客户意见','decision',[['agree','客户接受本次方案'],['disagree','客户不接受，需要调整']],'agree')+select('沟通方式','method',['电话记录','企微沟通','现场沟通'],'电话记录')+`<div class="field full" data-conditional="decision:disagree" hidden>${field('客户不同意的原因','reason','textarea','',false)}</div>`+field('沟通时间与确认依据','evidence','textarea','',true,'placeholder="记录沟通时间、客户原话及确认依据"')+attachmentInput();submit='保存客户意见';message='由负责人记录真实沟通结果，客户不需要登录工单系统。';break;
      case 'service': { const item=p.items.find(i=>i.id===t.itemId);label='登记履行结果';fields=`<div class="callout full"><strong>${esc(item.type)}</strong><br>${esc(item.description)}<br>约定完成：${date(p.deadline)}</div>`+field('实际履行结果','content','textarea','',true,'placeholder="说明已完成的内容、客户接收情况和结果依据"')+attachmentInput();submit='确认该事项已履行';message='全部约定事项完成后，系统才会生成400回访任务。';break; }
      case 'visit': label='填写回访结果';fields=select('回访结果','result',[['resolved','已联系，问题已解决'],['unresolved','已联系，问题仍未解决'],['unreachable','未联系到客户']],'resolved')+(c.rulesSnapshot.closure.callbackOnly?'':select('客户满意度','score',[['','客户未评分'],['5','5分 · 非常满意'],['4','4分 · 满意'],['3','3分 · 一般'],['2','2分 · 不满意'],['1','1分 · 非常不满意']],''))+field('回访记录','content','textarea','',true,'placeholder="记录约定事项是否履行、问题是否解决及客户反馈"')+retry();submit='提交回访结果';message='未解决会退回负责人继续处理；未接通需再次回访，不能直接结案。';break;
      case 'approvalException':label='处理审批人员异常';fields=`<div class="callout full">${esc(t.reason||'原审批人任职失效')}。请在审批人员中维护该职责的有效任职后，重新匹配。当前操作只恢复审批，不代表同意方案。</div>`;submit='重新匹配并恢复审批';break;
      case 'quality':label='品控复核';fields=select('复核结论','decision',[['pass','通过，符合结案条件'],['reject','不通过，继续处理']],'pass')+field('复核意见','content','textarea');submit='提交复核';break;
      case 'material':label='补充材料';fields=field('补充说明','content','textarea','',true,'placeholder="补充问题情况、沟通依据或服务材料"')+attachmentInput();submit='提交补充材料';break;
      case 'note':label='内部补充记录';fields=field('记录内容','content','textarea');submit='保存记录';message='内部记录只供授权员工查看，不向客户展示。';break;
      default:return;
    }
    activeForm={type:command,caseId:c.id,taskId,rev:c.revision,label,inline};activeFiles=[];dirty=false;lastFocus=document.activeElement;
    if(inline){
      const intro=type==='refundApproval'?'核对申请内容，作出本节点审批结论。':message;
      $('#approval-action').innerHTML=`<form id="task-form"><div class="panel-body"><div id="task-error" class="form-error callout error" role="alert"></div><p class="small muted mb">${intro}</p><div class="form-grid">${fields}</div></div><footer class="approval-actions"><button class="btn primary wide" type="submit">${submit}</button></footer></form>`;
    }else $('#modal-root').innerHTML=`<div class="overlay"><section class="drawer" role="dialog" aria-modal="true" aria-labelledby="dialog-title"><header class="drawer-head"><div><h2 id="dialog-title">${label}</h2><p>${esc(c.number)} · ${esc(customer(c).name)} · ${esc(c.store)}</p></div><button class="close" data-action="close-modal" aria-label="关闭办理表单">×</button></header><form id="task-form"><div class="drawer-scroll"><div id="task-error" class="form-error callout error" role="alert"></div>${message?`<div class="callout mb">${message}</div>`:''}<div class="form-grid">${fields}</div></div><footer class="form-actions">${['process','plan','contact','service','visit','material','note'].includes(type)?btn('保存草稿','save-task'):''}${btn('取消','close-modal')}<button class="btn primary" type="submit">${submit}</button></footer></form></section></div>`;
    if(!inline)document.body.style.overflow='hidden';restoreDraft('task');conditionalFields();updateRefundPreview();refreshUploadList();
    if(!inline)setTimeout(()=>$('#task-form')?.querySelector('input:not([type=hidden]),select,textarea,button')?.focus(),0);
  }
  function closeModal(force=false) { $('#modal-root').innerHTML='';document.body.style.overflow='';activeForm=null;activeFiles=[];dirty=false;lastFocus?.focus();return true; }
  function conditionalFields() {
    document.querySelectorAll('[data-conditional]').forEach(el=>{const [field,value]=el.dataset.conditional.split(':');const f=el.closest('form');el.hidden=f.elements[field]?.value!==value;el.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=el.hidden);});
    document.querySelectorAll('[data-plan-fields]').forEach(el=>{el.hidden=el.closest('form').elements.planType.value!==el.dataset.planFields;el.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=el.hidden);});
    const f=$('#task-form');
    if(f?.elements.intent){
      const intent=f.elements.intent.value;
      f.querySelectorAll('[data-process-fields]').forEach(el=>{el.hidden=!el.dataset.processFields.split(' ').includes(intent);el.querySelectorAll('input,textarea,select').forEach(x=>x.disabled=el.hidden);});
      f.querySelector('[type=submit]').textContent=({followup:'保存跟进',resolved:'提交处理结果并交400回访',service:'提交服务安排',refund:'提交退款审批',confirm:'提交本版客户意见'})[intent];
    }

  }
  function refreshUploadList() { const el=$('#upload-files'); if(el)el.innerHTML=activeFiles.map((f,i)=>`<div class="row between"><span>${esc(f.name)}</span><button type="button" class="btn quiet compact" data-remove-file="${i}">移除</button></div>`).join(''); }
  async function uploadFiles(input) {
    const incoming=Array.from(input.files||[]); if(activeFiles.length+incoming.length>3)throw new Error('每次最多添加3个附件');
    const accepted=await Promise.all(incoming.map(f=>{if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(f.type)||f.size>500*1024)throw new Error('请使用500KB以内的PNG、JPG、WebP图片或PDF');return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:f.name,type:f.type,data:reader.result});reader.onerror=()=>reject(new Error('读取附件失败，请重试'));reader.readAsDataURL(f);});}));
    activeFiles.push(...accepted);input.value='';dirty=true;refreshUploadList();
  }
  async function submitTask(form) {
    const ctx={...activeForm},d=Object.fromEntries(new FormData(form));d.attachments=activeFiles;
    if(d.retryAt)d.retryAt=new Date(d.retryAt).getTime();
    if(d.occurredAt)d.occurredAt=new Date(d.occurredAt).getTime();
    if(ctx.type==='plan') { d.deadline=new Date(d.deadline).getTime();if(d.planType!=='refund')d.items=['解释道歉','补做服务','预约调整'].filter((v,i)=>form.elements['item'+i].checked).map(v=>({type:v,description:d.itemDescription,assigneeId:d.executorId})); }
    if(ctx.type==='process'){if(d.intent==='refund')d.deadline=new Date(d.refundDeadline).getTime();else if(d.deadline)d.deadline=new Date(d.deadline).getTime();}
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try { await change({type:ctx.type,caseId:ctx.caseId,taskId:ctx.taskId,expectedRevision:ctx.rev,data:d});removeDraft('task');dirty=false;closeModal(true);detailId=ctx.caseId;page='detail';noticeTask=view==='approval'?ctx.taskId:'';render();toast(ctx.type==='process'?(d.intent==='followup'?'跟进已保存，原期限继续计时':d.intent==='resolved'?'处理结果已提交，等待400回访':d.intent==='refund'?'退款方案已送审':'已提交，下一步待办已更新'):ctx.type==='accept'?'已接单，请按时联系客户':ctx.type==='plan'?(d.planType==='refund'?'退款方案已送审，审批通过后由负责人记录客户意见':'方案已保存，请联系客户并记录意见'):ctx.type==='visit'&&d.result==='resolved'?'回访结果已记录，工单状态已更新':'已保存，工单与下一步待办已更新'); }
    catch(error) { $('#task-error').textContent=error.message;submit.disabled=false;$('#task-error').scrollIntoView({block:'nearest'});state=load(); }
  }
  async function submitCreate(form) {
    const d=Object.fromEntries(new FormData(form));d.attachments=activeFiles;d.autoAssign=form.elements.autoAssign?.checked;
    const submit=form.querySelector('[type=submit]');submit.disabled=true;
    try {
      let r;
      if(d.duplicateMode&&d.duplicateMode!=='new') { const c=load().cases.find(c=>c.id===d.duplicateMode); r=await change({type:'material',caseId:c.id,expectedRevision:c.revision,data:{content:d.title+'\n'+d.description,attachments:activeFiles}}); }
      else r=await change({type:'create',data:d});
      removeDraft('create');dirty=false;activeFiles=[];go('detail',r.caseId);toast(d.duplicateMode&&d.duplicateMode!=='new'?'已追加到原工单，保留原办理时限':'工单已受理，已按配置生成待办');
    } catch(error) { $('#create-error').className='form-section form-error callout error';$('#create-error').textContent=error.message;submit.disabled=false;$('#create-error').scrollIntoView({block:'nearest'}); }
  }
  function go(target,id='',task=''){
    rulesDraft=null;if(activeForm)closeModal(true);dirty=false;activeFiles=[];
    const h=target==='detail'?'detail/'+encodeURIComponent(id)+(task?'/'+encodeURIComponent(task):''):target;
    if(location.hash.slice(1)===h){page=target;detailId=id;noticeTask=task;render();}else location.hash=h;
  }
  function parseRoute(){
    const parts=location.hash.slice(1).split('/');page=parts[0]||params.get('page')||'tickets';detailId=decodeURIComponent(parts[1]||'');noticeTask=decodeURIComponent(parts[2]||'');
    if(!['tickets','rules','detail','create'].includes(page))page='tickets';
    if(view==='staff'&&page==='rules')page='tickets';
    if(page==='rules'){
      rulesDraft=null;assignmentSceneId='';rulesListTab=parts[1]==='assignment'?'assignment':'scenes';window.NodeAssignmentView.reset();if(parts[1]==='timing')history.replaceState(null,'','#rules/scenes');
      if(parts[1]==='people')history.replaceState(null,'','#rules');
      if(view==='pc'&&A.canConfigure(actorId)&&parts[1]){
        const scene=E.Rules.sceneList(state).find(s=>s.id===decodeURIComponent(parts[1]));
        if(scene){
          if(parts[2]==='assignment'||parts[2]==='timing'){rulesListTab='assignment';assignmentSceneId=scene.id;if(parts[2]==='timing')history.replaceState(null,'','#rules/'+encodeURIComponent(scene.id)+'/assignment/timing');}
          else if(parts[2]==='basic'){rulesListTab='scenes';render();sceneAction('edit-basic',{dataset:{id:scene.id}});return;}
          else{rulesListTab='scenes';rulesDraft=E.Rules.prepareScene(scene);rulesBaseVersion=state.sceneRevision||0;rulesTab='approval';}
        }
      }
    }
    render();window.scrollTo(0,0);
  }
  async function act(action){
    if(['tickets','rules','create'].includes(action)){go(action);return;}
    if(action==='back'){go('tickets');return;}
    if(action==='close-modal'){closeModal();return;}
    if(action==='save-create'||action==='save-task'){saveDraft(action==='save-create'?'create':'task');return;}
    if(['assign','note','material','reviseRefund'].includes(action)){openForm(action);return;}
    if(action==='clear-filter'){filters.keyword='';filters.status='';render();return;}
  }

  document.addEventListener('click',async event=>{
    const b=event.target.closest('button');if(!b)return;
    try {
      if(b.dataset.rulesListTab){rulesDraft=null;assignmentSceneId='';rulesListTab='scenes';history.replaceState(null,'','#rules'+(rulesListTab==='scenes'?'':'/'+rulesListTab));render();return;}
      if(b.dataset.flowAction){captureRules();window.ApprovalFlowUI.handle(b,{draft:rulesDraft,state,change:()=>{dirty=true;render();}});return;}
      if(b.dataset.orgDuty){window.ApprovalFlowUI.dutyDrawer(state,b.dataset.orgDuty,async(row,version)=>{await exclusive(()=>{const fresh=load(),org=E.Rules.Flow.organization(fresh);if(org.version!==version)throw Error('组织职责已更新，请重新打开配置');org.arrangements[org.arrangements.findIndex(x=>x.duty===row.duty)]=row;org.version++;fresh.organization=org;fresh.revision++;save(fresh);});render();toast('审批职责已保存，后续提交按新任职匹配');});return;}
      if(b.dataset.scope){filters.scope=b.dataset.scope;filters.status='';render();return;}
      if(b.dataset.sceneAction)return await sceneAction(b.dataset.sceneAction,b);
      if(b.dataset.ruleTab){captureRules();rulesTab='approval';if(rulesDraft.id)history.replaceState(null,'','#rules/'+encodeURIComponent(rulesDraft.id)+'/'+rulesTab);render();return;}
      if(b.dataset.action) return await act(b.dataset.action);
      if(b.dataset.go) return go(b.dataset.go);
      if(b.dataset.openCase){detailId=b.dataset.openCase;page='detail';noticeTask='';history.pushState(null,'','#detail/'+detailId);state=load();render();const t=currentCase()?.tasks.find(t=>t.id===b.dataset.task);if(t)openForm(t.kind,t.id);return;}
      if(b.dataset.case) return go('detail',b.dataset.case,b.dataset.task||'');
      if(b.dataset.form)return openForm(b.dataset.form,b.dataset.task||'');
      if(b.dataset.removeFile!==undefined) {activeFiles.splice(Number(b.dataset.removeFile),1);dirty=true;refreshUploadList();return;}
      if(b.dataset.draft) {
        const d=readDrafts()[b.dataset.draft];if(!d)return;
        if(b.dataset.draft.endsWith(':create'))go('create');else {detailId=d.context.caseId;page='detail';render();openForm(d.context.type,d.context.taskId);}return;
      }
    } catch(error) {toast(error.message);}
  });
  document.addEventListener('change',async event=>{
    try {
      if(event.target.closest('#timing-rules-form')){
        dirty=true;const summary=event.target.closest('.hr-overdue')?.querySelector('summary');
        if(summary&&event.target.type==='radio')summary.textContent='超时处理：'+event.target.closest('label').textContent.trim();return;
      }
      if(event.target.matches('[data-upload]'))return await uploadFiles(event.target);
      if(event.target.closest('#rules-form')) {captureRules();dirty=true;
        if(event.target.type==='radio'){
          const el=event.target,box=el.closest('.hr-control'),replacement=box?.querySelector('.hr-replacement');
          if(replacement)replacement.hidden=el.value!=='replace';
          const summary=el.closest('.hr-overdue')?.querySelector('summary');if(summary)summary.textContent='超时处理：'+el.closest('label').textContent.trim();
        }else if(/\.condition$|sceneMode$|\.mode$/.test(event.target.dataset.scene||''))render();return;}
      if(event.target.name==='customerId')updateCreateCustomer();
      if(event.target.closest('#create-form')&&['customerId','store','orderId'].includes(event.target.name))updateCreateOrders();
      if(event.target.closest('#create-form'))updateCreateRulePreview();
      if(event.target.closest('form'))conditionalFields();
      if(event.target.closest('#task-form'))updateRefundPreview();
    } catch(error) {toast(error.message);event.target.value='';}
  });
  document.addEventListener('input',event=>{
    if(event.target.closest('#task-form,#create-form,#timing-rules-form,#scene-basic-form'))dirty=true;
    if(event.target.closest('#task-form'))updateRefundPreview();
    if(event.target.closest('#create-form'))updateCreateRulePreview();
    if(event.target.closest('#rules-form')){captureRules();dirty=true;}
  });
  document.addEventListener('submit',event=>{
    event.preventDefault();const f=event.target;
    if(f.id==='task-form')submitTask(f);
    if(f.id==='create-form')submitCreate(f);
    if(f.id==='rules-form')submitRules(f);
    
    if(f.id==='scene-basic-form')submitSceneBasic(f);
    if(f.id==='scene-filters'){sceneFilters.keyword=f.elements.keyword.value.trim();sceneFilters.status=f.elements.status.value;render();}
    if(f.id==='filters-form') {filters.keyword=f.elements.keyword.value;filters.status=f.elements.status.value;render();}
  });
  document.addEventListener('keydown',event=>{
    if(!activeForm||activeForm.inline)return;
    if(event.key==='Escape'){event.preventDefault();closeModal();}
    if(event.key==='Tab') {const list=Array.from($('#modal-root').querySelectorAll('button,input:not([type=hidden]),select,textarea')).filter(e=>!e.disabled&&e.offsetParent!==null),first=list[0],last=list.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  });
  window.addEventListener('hashchange',()=>{state=load();parseRoute();});
  window.addEventListener('storage',event=>{if(event.key!==KEY)return;state=load();if(dirty){toast('工单已更新，提交时会校验最新版本');}else if(activeForm&&!activeForm.inline){toast('其他窗口更新了工单，请重新打开任务表单');}else if(rulesDraft){if(rulesBaseVersion!==(state.sceneRevision||0))toast('方案审批配置已在其他页面更新，请返回列表后重新打开');}else{render();}});
  setInterval(()=>{exclusive(()=>{if(!state)return;const fresh=load(),changed=fresh.revision!==state.revision;state=fresh;if(changed&&!dirty&&!activeForm&&!rulesDraft)render();}).catch(error=>toast(error.message));},30000);
  setInterval(()=>{document.querySelectorAll('[data-due]').forEach(el=>{const wrapper=document.createElement('span');wrapper.innerHTML=deadline(Number(el.dataset.due));el.replaceWith(wrapper.firstElementChild);});},30000);
  try {state=load();parseRoute();}
  catch(error) {$('#application').innerHTML=`<main class="page-body"><div class="callout error">原型数据初始化失败：${esc(error.message)}。请通过本地HTTP服务打开，并允许浏览器保存本站数据。</div></main>`;console.error(error);}
})();
