'use strict';
const E=Engine,Store=window.ComplaintStore,KEY=Store.KEY;let S=Store.load();
const UI={demoMode:sessionStorage.getItem('meiye.complaint.reference.demo-mode')||'auto',view:'all',page:1,filters:{q:'',state:'',level:'',store:'',owner:'',channel:'',risk:'',task:'',from:'',to:'',sort:'risk'},drawer:null,tab:'info',ruleTab:'scenes',settingsTab:'routing',editor:null,editorTab:'basic',node:null,more:false};
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)],esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>'¥'+((n||0)/100).toLocaleString('zh-CN',{minimumFractionDigits:2}),date=n=>n?new Date(n).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replaceAll('/','-'):'—',name=u=>E.user(u)?.name||'待分派',actor=()=>E.user(S.actor),ticket=id=>S.tickets.find(t=>t.id===id),mobile=()=>location.hash.startsWith('#/mobile'),mask=p=>p?p.slice(0,3)+'****'+p.slice(-4):'—';
const paths={ticket:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h4',settings:'M4 7h16 M4 17h16 M8 4v6 M16 14v6',phone:'M5 3h4l2 5-3 2c2 3 3 4 6 6l2-3 5 2v4c-1 5-18-9-16-16',mobile:'M7 2h10v20H7z M11 18h2',plus:'M12 4v16 M4 12h16',search:'M20 20l-5-5 M17 10a7 7 0 1 0-14 0 7 7 0 0 0 14 0',close:'M6 6l12 12 M6 18 18 6',arrow:'m9 5 7 7-7 7',back:'m15 5-7 7 7 7',filter:'M3 5h18l-7 8v6l-4 2v-8z',clock:'M12 8v5l3 2 M21 12a9 9 0 1 0-18 0 9 9 0 0 0 18 0',refresh:'M20 7V3l-3 3a8 8 0 1 0 3 11 M20 3h-5',check:'m5 12 4 4 10-10',shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7z M12 8v5 M12 16v1',flow:'M8 3h8v5H8z M3 16h6v5H3z M15 16h6v5h-6z M12 8v4H6v4 M12 12h6v4',more:'M5 12h1 M11 12h1 M17 12h1',download:'M12 3v12 m-5-5 5 5 5-5 M4 16v5h16v-5',logout:'M8 3H3v18h5 M10 12h11 m-4-4 4 4-4 4'};
const I=k=>`<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[k]||paths.ticket}"/></svg>`;
function btn(label,act,id='',cls='',extra=''){return `<button type="button" class="${cls}" data-action="${act}" data-id="${esc(id)}" ${extra}>${label}</button>`}
function options(values,chosen,blank){return(blank!==undefined?`<option value="">${esc(blank)}</option>`:'')+values.map(v=>{let[a,b]=Array.isArray(v)?v:[v,v];return`<option value="${esc(a)}" ${String(a)===String(chosen)?'selected':''}>${esc(b)}</option>`}).join('')}
function field(label,control,full=false){return`<div class="field ${full?'full':''}"><label>${label}</label>${control}</div>`}
function inp(n,v='',type='text',req=false,extra=''){return`<input name="${n}" aria-label="${n}" type="${type}" value="${esc(v)}" ${req?'required':''} ${extra}>`}
function select(n,vals,v='',blank){return`<select name="${n}" aria-label="${n}">${options(vals,v,blank)}</select>`}
function txt(n,v='',required=true){return`<textarea name="${n}" aria-label="${n}" ${required?'required':''}>${esc(v)}</textarea>`}
function toast(t){$('#toast').textContent=t;$('#toast').style.display='block';clearTimeout(UI.toast);UI.toast=setTimeout(()=>$('#toast').style.display='none',3500)}
function save(){Store.save(S)}
async function mutate(fn){return Store.exclusive(()=>{Store.assertVersion(S);const previous=E.clone(S);try{const r=fn();save();return r}catch(e){S=previous;throw e}})}
function badges(t){return`<span class="pill l${t.level}">${['','一级','二级','三级','四级'][t.level]}</span>${t.repeat?'<span class="pill red">重复投诉</span>':''}`}
function stateTag(t){return`<span class="pill ${({'待方案审批':'amber','待打款':'blue','已结案':'green','待首联':'blue'})[t.state]||''}">${esc(t.state)}</span>`}
function due(t){if(['已结案','已合并'].includes(t.state))return`<span class="sub">${date(t.closed||t.updated)}</span>`;const times=[t.deadline,t.taskDeadline].filter(x=>x>0);if(!times.length)return'<span class="sub">时限待设定</span>';const d=(Math.min(...times)-Date.now())/E.H,a=Math.abs(d),v=a>=24?Math.floor(a/24)+'天'+Math.floor(a%24)+'小时':a>=1?Math.floor(a)+'小时'+Math.floor(a%1*60)+'分':Math.max(1,Math.floor(a*60))+'分钟';return`<span class="${d<0?'red-text':d<S.rules.warn?'amber-text':'teal-text'}">${d<0?'已超时':'剩余'} ${v}</span>`}
function shownTaskPeople(t){return actor().role==='lead'&&E.needsRiskReview(t)?[S.rules.riskConfig.receiver]:E.taskPeople(S,t)}
function taskLabel(t){if(actor().role==='lead'&&E.needsRiskReview(t))return '结案风险复核';if(t.state==='待方案审批')return t.approval?.steps[t.approval.index]?.name||t.state;return({'待分派':'分派工单','待首联':'首次联系','处理中':'跟进处理','待打款':'财务打款','待回访':'结果确认'})[t.state]||t.state}
function roleSelect(){return `<a class="demo-return" href="#/demo" aria-label="返回演示入口">${I('flow')} 演示入口</a>`}
function canCreate(){return['agent','lead','store','sales'].includes(actor().role)}
function canConfig(){return['admin','lead'].includes(actor().role)}
function filtered(){const f=UI.filters;return S.tickets.filter(t=>E.canView(S,t,S.actor)).filter(t=>UI.view==='mine'?E.isPending(S,t,S.actor):UI.view==='created'?t.creator===S.actor:UI.view==='involved'?t.owner===S.actor||t.creator===S.actor||t.participants.includes(S.actor):true).filter(t=>{const q=f.q.trim().toLowerCase();return(!q||[t.id,t.name,t.phone,t.member,t.title].join(' ').toLowerCase().includes(q))&&(!f.state||t.state===f.state)&&(!f.level||t.level===+f.level)&&(!f.store||t.store===f.store)&&(!f.owner||t.owner===f.owner)&&(!f.channel||t.channel===f.channel)&&(!f.task||taskLabel(t).includes(f.task))&&(!f.risk||(f.risk==='repeat'?t.repeat:f.risk==='high'?t.level===4:f.risk==='overdue'?t.taskDeadline<Date.now()&&!['已结案','已合并'].includes(t.state):t.taskDeadline>=Date.now()&&t.taskDeadline-Date.now()<S.rules.warn*E.H&&!['已结案','已合并'].includes(t.state)))&&(!f.from||t.created>=new Date(f.from).getTime())&&(!f.to||t.created<new Date(f.to).getTime()+24*E.H)}).sort((a,b)=>f.sort==='new'?b.created-a.created:f.sort==='due'?a.taskDeadline-b.taskDeadline:((b.level===4?100:0)+(b.repeat?50:0))-((a.level===4?100:0)+(a.repeat?50:0))||a.taskDeadline-b.taskDeadline)}
function filterControls(){const f=UI.filters;return`<form id="filter-form" class="filters ${UI.more?'expanded':''}"><input class="search" name="q" aria-label="搜索工单" placeholder="搜索工单号、客户、手机号 / 会员号" value="${esc(f.q)}">${select('state',E.STATES,f.state,'全部状态')}${select('level',[[1,'一级'],[2,'二级'],[3,'三级'],[4,'四级']],f.level,'全部等级')}${select('store',E.STORES,f.store,'全部门店')}<button class="primary" type="submit">查询</button>${btn('重置','resetFilters','','ghost')}${btn(I('filter')+' 更多筛选','moreFilters','','ghost')}<div class="filter-more">${select('owner',E.USERS.filter(u=>['agent','lead','store'].includes(u.role)).map(u=>[u.id,u.name]),f.owner,'全部负责人')}${select('channel',E.CHANNELS,f.channel,'全部来源')}${select('risk',[['high','四级风险'],['repeat','重复投诉'],['overdue','已超时'],['soon','即将超时']],f.risk,'风险 / 时效')}${select('task',['首联','跟进','审批','打款','确认','分派'],f.task,'全部任务')}${inp('from',f.from,'date',false,'title="开始日期"')}${inp('to',f.to,'date',false,'title="结束日期"')}${select('sort',[['risk','风险优先'],['new','最近受理'],['due','最近截止']],f.sort)}</div></form>`}
function tabs(){return`<div class="tabs">${[['mine','待我处理'],['created','我发起的'],['involved','我参与的'],['all','全部工单']].map(([v,l])=>btn(l,'view',v,'tab '+(UI.view===v?'active':''),'aria-pressed="'+(UI.view===v)+'"')).join('')}</div>`}
function pager(total){const pages=Math.max(1,Math.ceil(total/8));UI.page=Math.min(UI.page,pages);return`<div class="pager"><span>共 ${total} 条工单</span><div class="row">${btn('上一页','page',UI.page-1,'small',UI.page===1?'disabled':'')}${Array.from({length:pages},(_,i)=>btn(i+1,'page',i+1,'small '+(i+1===UI.page?'selected':''))).join('')}${btn('下一页','page',UI.page+1,'small',UI.page===pages?'disabled':'')}</div></div>`}
function empty(text='暂无符合条件的工单'){return`<div class="empty">${I('ticket')}<p>${text}</p>${btn('重置筛选','resetFilters','','link')}</div>`}
function listPage(){const list=filtered(),pagination=pager(list.length),rows=list.slice((UI.page-1)*8,UI.page*8);return`<div class="page-head"><h1>工单列表</h1><div class="row">${btn(I('refresh'),'refresh','','iconbtn','aria-label="刷新列表"')}${canCreate()?btn(I('plus')+' 新增工单','create','','primary'):''}</div></div><div class="panel tickets-query-panel">${tabs()}${filterControls()}</div><div class="panel tickets-results-panel">${rows.length?`<div class="table-wrap"><table class="tickets-table"><thead><tr><th>工单 / 来源</th><th>客户</th><th>门店</th><th>等级 / 风险</th><th>当前进度</th><th>责任人</th><th>处理时效</th><th>操作</th></tr></thead><tbody>${rows.map(t=>`<tr class="${t.level===4||t.repeat?'risky':''}"><td><div class="ticket-no">${t.id}</div><a href="#/tickets/${t.id}" class="ticket-title">${esc(t.title)}</a><span class="sub">${esc(t.channel)}</span></td><td class="nowrap">${esc(t.name)}<div class="sub">${mask(t.phone)}</div></td><td class="nowrap">${esc(t.store)}</td><td>${badges(t)}</td><td>${stateTag(t)}<div class="sub">${esc(taskLabel(t))}</div></td><td class="nowrap">${shownTaskPeople(t).map(name).join('、')||name(t.owner)}<div class="sub">主责 · ${name(t.owner)}</div></td><td class="nowrap">${due(t)}<div class="sub">整单 ${t.deadline?date(t.deadline):'待设定'}</div></td><td class="nowrap">${btn('查看详情','detail',t.id,'link')}</td></tr>`).join('')}</tbody></table></div>`:empty()}${pagination}</div>`}
function render(){UI.mobileListObserver?.disconnect();UI.mobileListObserver=null;UI.mobileListCleanup?.();UI.mobileListCleanup=null;let route=location.hash||'#/demo';if(route.startsWith('#/rules')){location.replace('../index.html?view=pc&actor=manager&page=rules#rules');return;}if(route.startsWith('#/archive/')){renderArchive(route.split('/')[2]);return;}if(route==='#/demo'||route==='#/demo/'){demoPortal();return}if(route.startsWith('#/demo/')){openDemo(route.split('/')[2]);return}syncDemoActor(route);document.body.classList.toggle('is-mobile',mobile());$('#drawer-root').innerHTML='';if(mobile()){renderMobile();return}const rules=route.startsWith('#/rules');$('#app').innerHTML=`<div class="shell"><aside class="sidebar"><div class="brand"><div class="brand-mark">✓</div><div><strong>悦服</strong><small>客诉管理</small></div></div><nav>${actor().role!=='admin'?`<a class="nav-item ${!rules?'active':''}" href="#/tickets">${I('ticket')}工单列表</a>`:''}<a class="nav-item ${rules?'active':''}" href="#/rules">${I('settings')}规则配置</a></nav><div class="side-bottom"><a href="#/demo">${I('flow')} 演示入口</a></div></aside><main class="main"><header class="topbar"><div class="crumb">客诉管理 <b>/ ${rules?'规则配置':'工单列表'}</b></div><div class="top-right"><a class="mini-link" href="#/mobile">${I('mobile')} 移动端</a>${btn(I('more'),'utilities','','iconbtn','aria-label="演示工具"')}${roleSelect()}</div></header><section class="content">${listPage()}</section></main></div>`;const rid=route.split('/')[2];if(!rules&&rid){UI.drawer=rid;renderDrawer(rid)}else if(!rules&&UI.drawer)renderDrawer(UI.drawer)}
function dataRows(rows){return`<dl class="data">${rows.map(([a,b])=>`<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl>`}
function info(t){return originalInfo(t)+`<div class="card"><h3>处理规则</h3><div class="gap"></div>${dataRows([['匹配场景',esc(t.flow?.name||'历史流程')+' · V'+(t.flow?.version||1)],['定级依据',esc(t.gradeReason||'受理人员确认')],['整单截止',t.deadline?date(t.deadline):'待设定'],['当前节点截止',date(t.taskDeadline)]])}</div>`}
function originalInfo(t){const o=S.orders.find(x=>x.id===t.order);return`<div class="grid cols2"><div class="card"><div class="section-title"><h3>客户信息</h3><span class="pill outline">${esc(t.isNew)}</span></div>${dataRows([['客户姓名',esc(t.name)],['手机号',mask(t.phone)+' '+btn('查看','reveal',t.id,'link')],['会员号',esc(t.member)||'—'],['所属门店',esc(t.store)],['接待人员',esc(t.staff)||'—']])}</div><div class="card"><div class="section-title"><h3>消费订单</h3>${!o&&E.canHandle(S,t,S.actor)?btn('关联订单','bindOrder',t.id,'link'):''}</div>${dataRows([['订单编号',esc(o?.external)||'待核实'],['订单来源',esc(o?.system)||'—'],['消费项目',esc(t.project)],['订单金额',money(o?.paid||t.amount)],['可退余额',o?money(o.paid-o.refunded):'待核实']])}</div></div><div class="gap"></div><div class="card"><div class="section-title"><h3>投诉内容</h3><span class="sub">${date(t.created)} · ${esc(t.channel)}</span></div><p class="text">${esc(t.description)}</p>${t.attachments.length?'<div class="gap"></div>'+filesView(t.attachments):''}</div>${t.related.length?`<div class="card"><h3>关联工单</h3><div class="gap"></div>${t.related.map(x=>btn(x,'detail',x,'link')).join('')}</div>`:''}<div class="card"><h3>来源记录</h3><div class="gap"></div>${t.sources.map(x=>`<p class="sub">${esc(x.channel)} · ${date(x.at)}</p><p class="text">${esc(x.content)}</p>`).join('<div class="gap"></div>')}</div>`}
function filesView(files){return`<div class="files">${files.map(f=>`<a class="file" href="${f.data||'#'}" ${f.data?'download="'+esc(f.name)+'"':''}>${esc(f.name)}</a>`).join('')}</div>`}
function timelineEvents(t){return`<div class="card record-timeline-card"><div class="section-title"><h3>处理记录</h3><span class="sub">${t.logs.length} 条记录</span></div><div class="timeline">${t.logs.map(l=>`<div class="event"><h3>${esc(l.title)} <span class="muted">· ${esc(l.actor)}</span></h3><div class="sub">${date(l.at)}</div><div class="text">${esc(l.body)}</div></div>`).join('')}</div></div>`}
function timeline(t){return timelineEvents(t)+planRecords(t)}
function approvalView(a){return`<div class="section-title"><h3>审批情况</h3><span class="pill blue">V${a.version} · ${esc(a.status)}</span></div><p class="approval-scene-name">${esc(a.scene)}</p>${a.steps.map((n,i)=>`<div class="approval-line"><div class="node-dot ${n.done?'done':i===a.index&&a.status==='审批中'?'current':''}">${n.done?'✓':i+1}</div><div class="grow"><div>${esc(n.name)}</div><div class="sub">${n.people.map(name).join('、')} · ${n.type==='cc'?'抄送':n.mode==='all'?'全部同意':'任一同意'}</div></div><span class="sub">${n.done?'已完成':i===a.index&&a.status==='审批中'?'待审批':'未执行'}</span></div>`).join('')}`}
function funding(t){const p=t.proposal;if(!p)return`<div class="card"><div class="empty">暂无处理方案</div></div>`;return`<div class="card"><div class="section-title"><h3>方案内容 · V${p.version}</h3><span class="pill outline">${esc(p.type)}</span></div><p class="text">${esc(p.content)}</p><div class="gap"></div>${dataRows([['退款金额',money(p.refund)],['赔偿金额',money(p.compensation)],['申请总额','<b>'+money(p.refund+p.compensation)+'</b>'],['客户沟通',esc(p.consent)],['收款方式',esc(p.account)||'无资金事项']])}</div>`}
function planRecords(t){return`${t.payments.length?`<div class="card"><h3>付款记录</h3>${t.payments.map(x=>`<div class="approval-line"><div class="grow"><b class="${x.result==='失败'?'red-text':'teal-text'}">${esc(x.result)}</b> · ${money(x.amount)}<div class="sub">${date(x.at)} · ${esc(x.actor)}</div><div class="text">${esc(x.reference||x.reason||'')}</div>${x.proof?filesView(x.proof):''}</div></div>`).join('')}</div>`:''}${t.approvalHistory?.length?`<div class="card"><details><summary>历史审批 · ${t.approvalHistory.length} 次</summary><div class="gap"></div>${t.approvalHistory.map(a=>approvalView(a)).join('<div class="gap"></div>')}</details></div>`:''}`}
function actionButtons(t){let b=[];if(t.mergedInto)return btn('查看主工单','detail',t.mergedInto,'primary');if(['已结案','已合并'].includes(t.state))return '';if(t.state==='待分派'&&(actor().role==='lead'||E.taskPeople(S,t).includes(S.actor)))b.push(btn('分派工单','assign',t.id,'primary'));if(E.needsRiskReview(t)&&actor().role==='lead')b.push(btn('结案风险复核','risk',t.id,'danger'));if(t.state==='待方案审批'&&E.taskPeople(S,t).includes(S.actor)){b.push(btn('驳回','reject',t.id,'danger'),btn('同意','approve',t.id,'primary'))}else if(t.state==='待打款'&&S.actor===(t.flow?.doc.finance||S.rules.finance)){b.push(btn('退回补正','payReturn',t.id),btn('登记打款结果','pay',t.id,'primary'))}else if(E.canHandle(S,t,S.actor)){if(t.state==='待首联')b.push(btn(I('phone')+' 联系客户','call',t.id),btn('记录联系','follow',t.id,'primary'));if(t.state==='处理中'){b.push(btn('添加跟进','follow',t.id),btn(t.level===1?'提交处理结果':'提交处理方案',t.level===1?'complete':'proposal',t.id,'primary'))}if(t.state==='待回访'&&(!t.flow?.config||E.taskPeople(S,t).includes(S.actor)||actor().role==='lead'))b.push(btn('记录回访结果','review',t.id,'primary'));if(['待方案审批','待打款'].includes(t.state))b.push(btn('添加跟进','follow',t.id),btn('撤回方案','withdraw',t.id))}return b.join('')}
function moreActions(t){
 if(t.state==='已合并')return '';
 const active=t.state!=='已结案';
 return `${active&&t.state!=='待分派'&&actor().role==='lead'?btn('调整负责人','assign',t.id):''}${active&&E.canHandle(S,t,S.actor)&&t.level<4?btn('升级投诉','escalate',t.id):''}${canCreate()?btn('再次投诉','repeat',t.id):''}`;
}
function moreMenu(t){const actions=moreActions(t);return actions?`<details class="ticket-more-menu"><summary>更多</summary><div class="ticket-more-items">${actions}</div></details>`:''}
function pcTicketOverview(t){
 const ended=['已结案','已合并'].includes(t.state),people=shownTaskPeople(t).map(name).join('、')||'待分派';
 const facts=[['主责负责人',esc(name(t.owner))],...(ended?[['结束时间',date(t.closed||t.updated)]]:[['当前办理',esc(taskLabel(t))+' · '+esc(people)],['办理时效',due(t)],['整单截止',t.deadline?date(t.deadline):'待设定']]),...(!ended&&t.nextFollow?[['下次跟进',esc(t.nextFollow)]]:[])];
 return `<section class="pc-ticket-overview" aria-label="工单概况"><div class="pc-ticket-meta"><span class="ticket-no">${esc(t.id)}</span><div class="pc-ticket-badges">${stateTag(t)}${badges(t)}</div></div><h3>${esc(t.title)}</h3><dl class="pc-ticket-facts">${facts.map(([label,value])=>`<div><dt>${label}</dt><dd>${value}</dd></div>`).join('')}</dl></section>`;
}
function pcTicketInfo(t){
 return `${originalInfo(t)}<details class="pc-rule-details"><summary>处理规则</summary><div>${dataRows([['匹配场景',esc(t.flow?.name||'历史流程')+' · V'+(t.flow?.version||1)],['定级依据',esc(t.gradeReason||'受理人员确认')],['整单截止',t.deadline?date(t.deadline):'待设定'],['当前节点截止',date(t.taskDeadline)]])}</div></details>`;
}
function renderDrawer(id){
 const previous=$('#drawer-root .drawer'),oldScroll=previous?.dataset.ticketId===id&&previous.dataset.detailTab===UI.tab?previous.querySelector('.drawer-body')?.scrollTop||0:0,t=ticket(id);
 if(!t||!E.canView(S,t,S.actor)){UI.drawer=null;$('#drawer-root').innerHTML='';toast('工单不存在或没有访问权限');return;}
 const ended=['已结案','已合并'].includes(t.state),actions=actionButtons(t),more=moreMenu(t);
 UI.drawer=id;
 $('#drawer-root').innerHTML=`<div class="drawer-backdrop" data-action="closeDrawer"><section class="drawer ticket-drawer" data-ticket-id="${esc(id)}" data-detail-tab="${UI.tab}" role="dialog" aria-modal="true" aria-label="工单详情" data-stop>
   <header class="drawer-header"><h2>工单详情</h2>${btn(I('close'),'closeDrawer','','iconbtn','aria-label="关闭详情"')}</header>

   <div class="drawer-body">${pcTicketOverview(t)}
     ${!ended&&(t.level===4||t.repeat)?`<div class="banner red pc-ticket-risk">${I('shield')}<span>${t.level===4?'四级风险工单':'重复投诉工单'}${t.level===4&&t.repeat?' · 重复投诉':''} · ${t.riskAck?'已完成结案风险复核':t.state==='待回访'?'待结案风险复核':'结案前需风险复核'}${t.riskWords?.length?' · 命中：'+esc(t.riskWords.join('、')):''}</span></div>`:''}
   <div class="tabs drawer-tabs" aria-label="工单详情分类">${[['info','工单信息'],['fund','处理方案'],['logs','处理记录']].map(([v,l])=>btn(l,'detailTab',v,'tab '+(UI.tab===v?'active':''),'aria-pressed="'+(UI.tab===v)+'"')).join('')}</div>
     <div class="pc-ticket-content">${UI.tab==='info'?pcTicketInfo(t):UI.tab==='logs'?timeline(t):funding(t)}</div>
   </div>
   <footer class="drawer-footer"><span class="pc-footer-context">${ended?'工单办理已结束':actions?'办理操作':'当前暂无需要你办理的操作'}</span><div class="pc-footer-actions">${more}${actions?`<div class="action-buttons">${actions}</div>`:''}</div></footer>
 </section></div>`;
 $('#drawer-root .drawer-body').scrollTop=oldScroll;
}
function modal(title,body,{form='',id='',wide=false,drawer=!!form,submit='保存',danger=false}={}){
 UI.returnFocus=document.activeElement;UI.modalDirty=false;
 const actions=`${btn('取消','closeModal')}<button type="submit" class="${danger?'danger':'primary'}">${submit}</button>`;
 if(mobile()){
   if(!UI.mobileSurfaceOpen){UI.mobileSurfaceOpen=true;UI.mobileOverflow=document.body.style.overflow;UI.mobilePreviousState=history.state;UI.mobileHistoryToken='mobile-form-'+Date.now()+'-'+Math.random();history.pushState({...history.state,complaintMobileForm:UI.mobileHistoryToken},'',location.href);}
   document.body.style.overflow='hidden';document.body.classList.add('mobile-action-open');$('#app').inert=true;
   const content=form?`<form data-form="${form}" data-id="${esc(id)}"><div class="mobile-action-body">${body}</div><footer class="mobile-action-footer"><div class="error-slot" role="alert"></div><div class="form-actions">${actions}</div></footer></form>`:`<div class="mobile-action-body">${body}</div>`;
   $('#modal-root').innerHTML=`<div class="mobile-action-surface"><section class="mobile-action-page" role="region" aria-label="${esc(title)}" tabindex="-1"><header class="mobile-action-header">${btn(I('back')+'返回','closeModal','','mobile-action-back','aria-label="返回上一页"')}<h2>${esc(title)}</h2><span aria-hidden="true"></span></header>${content}</section></div>`;
   prepareMobileFields();syncMobileFields();setTimeout(()=>$('#modal-root .mobile-action-back')?.focus(),30);return;
 }
 $('#modal-root').innerHTML=drawer?`<div class="drawer-backdrop form-drawer-backdrop" data-action="closeModal"><section class="drawer form-drawer" role="dialog" aria-modal="true" aria-label="${esc(title)}" data-stop><header class="drawer-header spread"><h2>${title}</h2>${btn(I('close'),'closeModal','','iconbtn','aria-label="关闭抽屉"')}</header><form data-form="${form}" data-id="${esc(id)}"><div class="drawer-body">${body}</div><footer class="drawer-footer"><div class="error-slot" role="alert"></div><div class="form-actions">${actions}</div></footer></form></section></div>`:`<div class="modal-backdrop"><section class="modal ${wide?'wide':''}" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="modal-head"><h2>${title}</h2>${btn(I('close'),'closeModal','','iconbtn','aria-label="关闭弹窗"')}</div>${form?`<form data-form="${form}" data-id="${esc(id)}">${body}<div class="error-slot" role="alert"></div><div class="form-actions">${actions}</div></form>`:body}</section></div>`;
 setTimeout(()=>$('#modal-root input, #modal-root textarea, #modal-root select, #modal-root button')?.focus(),30);
}
function prepareMobileFields(){
 const page=$('#modal-root .mobile-action-page');if(!page)return;
 page.querySelectorAll('.field').forEach((field,index)=>{const label=field.querySelector('label'),input=field.querySelector('input,select,textarea');if(!label||!input)return;const text=label.textContent.replace(/\s*\*\s*$/,'').trim();if(!input.id)input.id='mobile-field-'+index;label.htmlFor=input.id;input.setAttribute('aria-label',text);if(!label.dataset.requiredLabel)label.dataset.requiredLabel=String(/\*\s*$/.test(label.textContent));label.textContent=text;if(input.required||label.dataset.requiredLabel==='true'){const mark=document.createElement('span');mark.className='mobile-required';mark.setAttribute('aria-hidden','true');mark.textContent=' *';label.append(mark);}if(input.type==='number')input.inputMode='decimal';if(input.type==='tel')input.autocomplete='tel';});
 const form=page.querySelector('form');if(form?.dataset.form==='proposal'){form.elements.content.placeholder='说明处理措施、依据及与客户确认的结果';}
}
function syncMobileFields(){
 const form=$('#modal-root .mobile-action-page form');if(!form)return;
 const show=(name,visible)=>{const input=form.elements[name];if(!input)return;input.closest('.field').hidden=!visible;input.disabled=!visible;};
 if(form.dataset.form==='proposal'){const type=form.elements.type.value;show('refund',['退款','退款＋赔偿'].includes(type));show('compensation',['赔偿','退款＋赔偿'].includes(type));}
 if(form.dataset.form==='pay'){const success=form.elements.result.value==='成功';for(const name of ['amount','reference','proof'])show(name,success);show('reason',!success);form.elements.reason.required=!success;form.elements.reference.required=success;form.elements.proof.required=success;}
 prepareMobileFields();
}
document.addEventListener('change',event=>{if(event.target.closest('.mobile-action-page')&&['type','result'].includes(event.target.name))syncMobileFields();});
document.addEventListener('focusin',event=>{if(event.target.closest('.mobile-action-page')&&event.target.type==='number'&&event.target.value==='0')event.target.select();});
function closeModal(force=false){
 const mobileOpen=UI.mobileSurfaceOpen,ownsHistory=mobileOpen&&history.state?.complaintMobileForm===UI.mobileHistoryToken;
 $('#modal-root').innerHTML='';UI.modalDirty=false;
 if(mobileOpen){UI.mobileSurfaceOpen=false;document.body.style.overflow=UI.mobileOverflow||'';document.body.classList.remove('mobile-action-open');$('#app').inert=false;if(ownsHistory){if(force)history.replaceState(UI.mobilePreviousState,'',location.href);else history.back();}UI.mobileHistoryToken=null;}
 UI.returnFocus?.isConnected&&UI.returnFocus.focus();
}
window.addEventListener('popstate',()=>{if(UI.mobileSurfaceOpen&&history.state?.complaintMobileForm!==UI.mobileHistoryToken)closeModal(true);});
function createForm(){UI.duplicates=[];const u=actor();modal('新增工单',`<div class="form-section"><h3>受理信息</h3><div class="form-grid">${field('来源渠道',select('channel',E.CHANNELS,u.role==='store'?E.CHANNELS[2]:u.role==='sales'?E.CHANNELS[5]:E.CHANNELS[0]))}${field('客户类型',select('isNew',['新客','老客','待核实'],'待核实'))}</div></div><div class="form-section"><h3>客户与订单</h3><div class="form-grid">${field('客户姓名 *',inp('name','','text',true))}${field('手机号 *',inp('phone','','tel',true,'pattern="1[0-9]{10}" maxlength="11"'))}${field('会员号',inp('member'))}${field('所属门店 *',select('store',u.store?[u.store]:E.STORES,u.store||E.STORES[0]))}${field('关联订单',select('order',S.orders.filter(o=>!u.store||o.store===u.store).map(o=>[o.id,o.external+' · '+o.name+' · '+o.system]),'','暂未关联'),true)}</div><div id="duplicate-candidates"></div></div><div class="form-section"><h3>投诉内容</h3><div class="form-grid">${field('投诉摘要 *',inp('title','','text',true,'maxlength="60"'),true)}${field('投诉描述 / 客户诉求 *',txt('description'),true)}${field('投诉等级',select('level',[[1,'一级 · 普通服务'],[2,'二级 · 退款 / 小额赔付'],[3,'三级 · 赔偿'],[4,'四级 · 越级风险']],2))}${field('附件',`<input name="files" type="file" multiple aria-label="投诉附件">`,true)}</div></div>`,{form:'create',drawer:true,submit:'提交工单'})}
function duplicateCandidates(){
 const f=$('[data-form="create"]');if(!f)return;
 const phone=f.elements.phone.value.trim(),member=f.elements.member.value.trim(),order=f.elements.order.value;
 const hits=S.tickets.filter(t=>E.canView(S,t,S.actor)&&t.state!=='已合并'&&(order?t.order===order:((phone&&t.phone===phone)||(member&&t.member===member)))).sort((a,b)=>b.created-a.created||b.id.localeCompare(a.id));
 const t=hits[0];UI.duplicates=t?[t.id]:[];
 $('#duplicate-candidates').innerHTML=t?`<section class="related-ticket-notice" aria-label="关联工单提示"><div class="related-ticket-notice-heading"><strong>${order?'该订单已有工单':'该客户已有工单'}</strong><span>最近受理</span></div><div class="related-ticket-preview"><div class="related-ticket-meta"><span class="ticket-no">${esc(t.id)}</span>${stateTag(t)}</div><p class="related-ticket-title">${esc(t.title)}</p><div class="related-ticket-actions">${t.state!=='已结案'?btn('补充原工单','appendExisting',t.id,'small'):''}${btn('登记再次投诉','repeatExisting',t.id,'small')}</div></div><label class="related-ticket-distinct"><input type="checkbox" name="distinct"><span>不同事件，继续新建</span></label></section>`:'';
}
async function readFiles(list){const files=[...(list||[])];if(files.some(f=>f.size>500*1024)||files.reduce((n,f)=>n+f.size,0)>1024*1024)throw Error('本地附件每个不超过500KB，单次总计不超过1MB');return Promise.all(files.map(f=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve({name:f.name,type:f.type,size:f.size,data:r.result});r.onerror=()=>reject(Error('附件读取失败'));r.readAsDataURL(f)})))}
async function actionForm(act,id){const t=ticket(id);if(!t||!E.canView(S,t,S.actor))throw Error('没有工单访问权限');const base={id};if(act==='follow')modal('联系与跟进',`<div class="form-grid">${field('联系方式',select('method',['电话','企微','门店面谈','其他'],'电话'))}${field('联系结果',select('connected',[['yes','已接通 / 有效沟通'],['no','未接通']],'yes'))}${field('沟通内容 *',txt('content'),true)}${field('客户诉求',txt('request','',false),true)}${field('下次跟进时间',inp('next','','datetime-local'),true)}${field('附件','<input type="file" name="files" multiple>',true)}</div>`,{...base,form:'follow',submit:'保存记录'});
 else if(act==='assign')modal(t.state==='待分派'?'分派工单':'调整负责人',`<div class="form-grid">${field('负责人 *',select('owner',E.USERS.filter(u=>t.pendingAssignment?t.pendingAssignment.candidates.includes(u.id):['agent','lead'].includes(u.role)||(u.role==='store'&&u.store===t.store)).map(u=>[u.id,u.name+' · '+u.title]),t.owner),true)}${field('原因 *',txt('reason'),true)}</div>`,{...base,form:'assign',submit:'确认分派'});
 else if(act==='proposal')proposalForm(t);
 else if(act==='approve'||act==='reject')modal(act==='approve'?'审批同意':'审批驳回',`<div class="banner">${esc(t.approval?.steps[t.approval.index]?.name)} · 申请 ${money((t.proposal?.refund||0)+(t.proposal?.compensation||0))}</div><p class="text">${esc(t.proposal?.content)}</p><div class="gap"></div>${field(act==='reject'?'驳回原因 *':'审批意见',txt('note','',act==='reject'))}`,{...base,form:act,submit:act==='approve'?'确认同意':'确认驳回',danger:act==='reject'});
 else if(act==='pay')modal('登记打款结果',`<div class="banner">批准金额 <b>${money(t.proposal.refund+t.proposal.compensation)}</b> · ${esc(t.proposal.account)}</div><div class="form-grid">${field('付款结果',select('result',['成功','失败'],'成功'))}${field('实际金额（元）',inp('amount',(t.proposal.refund+t.proposal.compensation)/100,'number',true,'step="0.01" min="0"'))}${field('交易流水号',inp('reference'),true)}${field('付款凭证','<input name="proof" type="file" multiple>',true)}${field('失败原因',txt('reason','',false),true)}</div>`,{...base,form:'pay',submit:'保存付款结果'});
 else if(act==='payReturn'||act==='withdraw')modal(act==='payReturn'?'退回补正':'撤回方案',field('原因 *',txt('reason')),{...base,form:act,submit:'确认退回',danger:true});
 else if(act==='review')modal('回访与结果确认',`<div class="form-grid">${field('客户反馈',select('result',['认可','不认可','未联系上'],'认可'),true)}${field('回访记录 *',txt('note'),true)}</div>`,{...base,form:'review',submit:'保存回访结果'});
 else if(act==='complete')modal('提交处理结果',field('处理措施与结果 *',txt('note')),{...base,form:'complete',submit:'进入结果确认'});
 else if(act==='risk')modal('结案风险复核',field('处置情况与复核意见 *',txt('note')),{...base,form:'risk',submit:'完成复核'});
 else if(act==='repeat')modal('登记再次投诉',field('客户再次投诉内容 *',txt('note')),{...base,form:'repeat',submit:'保存并标红'});
 else if(act==='escalate')modal('升级投诉',`<div class="form-grid">${field('升级至',select('level',[2,3,4].filter(x=>x>t.level).map(x=>[x,x+'级']),Math.min(4,t.level+1)),true)}${field('升级原因 *',txt('note'),true)}</div>`,{...base,form:'escalate',submit:'确认升级'});
 else if(act==='bindOrder')modal('关联订单',field('客户订单',select('order',S.orders.filter(o=>o.phone===t.phone).map(o=>[o.id,o.external+' · '+o.project]),'','请选择')),{...base,form:'bindOrder',submit:'确认关联'});
 else if(act==='call')modal('联系客户',`<div class="spread"><div><h2>${esc(t.name)}</h2><p class="muted">${mask(t.phone)}</p></div>${I('phone')}</div><div class="gap"></div><div class="action-buttons">${btn('记录未接通','follow',t.id)}${btn('记录联系结果','follow',t.id,'primary')}</div>`);
 else if(act==='reveal'){await mutate(()=>E.log(t,S.actor,'查看客户联系方式','经当前岗位权限查看'));modal('客户联系方式',`<h2>${esc(t.name)}</h2><div class="gap"></div><p>${esc(t.phone)}</p>`)}
}
function proposalForm(t){modal('提交处理方案',`<div class="form-grid">${field('方案类型',select('type',['普通处理','退款','赔偿','退款＋赔偿'],t.level===3?'退款＋赔偿':'退款'))}${field(mobile()?'客户确认':'客户沟通结果',select('consent',['客户已认可','尚未认可'],'客户已认可'))}${field('退款金额（元）',inp('refund',0,'number',true,'min="0" step="0.01"'))}${field('赔偿金额（元）',inp('compensation',0,'number',true,'min="0" step="0.01"'))}${field(mobile()?'处理方案 *':'处理方案与依据 *',txt('content',t.proposal?.content||''),true)}</div>`,{form:'proposal',id:t.id,wide:true,submit:'提交审批'})}
function proposalFromForm(f){const d=Object.fromEntries(new FormData(f));return{type:d.type,refund:Math.round(Number(d.refund??0)*100),compensation:Math.round(Number(d.compensation??0)*100),content:d.content,consent:d.consent,account:ticket(f.dataset.id)?.proposal?.account||'原支付渠道'}}
function mobileState(t){
 const tone=({'待分派':'neutral','待首联':'blue','处理中':'blue','待方案审批':'amber','待打款':'amber','待回访':'purple','已结案':'green','已合并':'neutral'})[t.state]||'neutral';
 return `<span class="mobile-state ${tone}">${esc(t.state)}</span>`;
}
function mobileTiming(t){
 const ended=['已结案','已合并'].includes(t.state);
 return `<span class="mobile-timing ${ended?'is-ended':''}">${ended?'<span>结束于</span>':I('clock')}${due(t)}</span>`;
}
function mobileLoadStatus(total){
 return total?`<div class="mobile-load-status" role="status" aria-live="polite">${Math.min(UI.page*8,total)<total?'继续上滑加载更多':'已显示全部工单'}</div>`:'';
}
function observeMobileList(){
 const sentinel=$('.mobile-load-status');if(!sentinel)return;
 const load=()=>{
   if(!sentinel.isConnected||!mobile()||location.hash.split('/')[2])return;
   const all=filtered(),start=UI.page*8;
   if(start>=all.length)return;
   UI.page++;
   $('.mobile-ticket-list').insertAdjacentHTML('beforeend',all.slice(start,UI.page*8).map(mobileTicket).join(''));
   const more=UI.page*8<all.length;
   sentinel.textContent=more?'继续上滑加载更多':'已显示全部工单';
   UI.mobileListObserver?.unobserve(sentinel);
   if(more)UI.mobileListObserver?.observe(sentinel);
 };
 if('IntersectionObserver' in window){
   UI.mobileListObserver=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting))load()},{rootMargin:'0px 0px 120px 0px'});
   UI.mobileListObserver.observe(sentinel);
 }else{
   const check=()=>{const rect=sentinel.getBoundingClientRect();if(rect.top<=window.innerHeight+120&&rect.bottom>=0)load();};
   document.addEventListener('scroll',check,{passive:true,capture:true});window.addEventListener('resize',check);
   UI.mobileListCleanup=()=>{document.removeEventListener('scroll',check,true);window.removeEventListener('resize',check);};
   check();
 }
}
function mobileTicket(t){
 const ended=['已结案','已合并'].includes(t.state),people=shownTaskPeople(t).map(name).join('、')||name(t.owner);
 return `<a class="mobile-ticket ${!ended&&(t.level===4||t.repeat)?'risky':''} ${ended?'is-ended':''}" href="#/mobile/${t.id}">
   <div class="mobile-ticket-heading"><span class="ticket-no">${esc(t.id)}</span>${mobileState(t)}</div>
   <h2 class="ticket-title">${esc(t.title)}</h2>
   <div class="mobile-customer"><span>${esc(t.name)}</span><span>${esc(t.store)}</span></div>
   <div class="mobile-ticket-meta"><span class="mobile-badges">${badges(t)}</span>${!ended?`<span class="mobile-node">${esc(taskLabel(t))}</span>`:''}</div>
   <div class="mobile-ticket-footer"><span class="mobile-assignee"><span>${ended?'负责人':'办理人'}</span><b>${esc(people)}</b></span>${mobileTiming(t)}</div>
 </a>`;
}
function renderMobile(){
 const rid=location.hash.split('/')[2],t=ticket(rid);
 if(rid){
   if(!t||!E.canView(S,t,S.actor)){$('#app').innerHTML=`<div class="mobile-shell"><header class="mobile-top"><a href="#/mobile" aria-label="返回工单列表">${I('back')}<span>返回</span></a><strong>工单详情</strong><span aria-hidden="true"></span></header><div class="empty">${I('ticket')}<p>工单不存在或没有访问权限</p><a class="link" href="#/mobile">返回工单列表</a></div></div>`;return;}
   const actionable=E.isPending(S,t,S.actor),ended=['已结案','已合并'].includes(t.state),actions=actionButtons(t);
   const resultNote=ended?(t.logs.find(log=>log.title==='工单结案')?.body||'办理已结束，详细过程见处理记录。'):(t.logs[0]?.body||t.description);
   $('#app').innerHTML=`<div class="mobile-shell mobile-detail-shell ${ended?'is-ended':''}">
     <header class="mobile-top"><a href="#/mobile" aria-label="返回工单列表">${I('back')}<span>返回</span></a><strong>工单详情</strong><span aria-hidden="true"></span></header>
     <div class="mobile-content mobile-detail-content">
       <section class="mobile-overview"><div class="mobile-ticket-heading"><span class="ticket-no">${esc(t.id)}</span>${mobileState(t)}</div><h1 class="mobile-detail-title">${esc(t.title)}</h1><div class="mobile-tags"><span class="mobile-badges">${badges(t)}</span><span class="mobile-owner">主责 · ${esc(name(t.owner))}</span></div><div class="mobile-overview-time">${mobileTiming(t)}</div></section>
       ${!ended&&(t.level===4||t.repeat)?`<div class="banner red mobile-risk-note">${I('shield')}<span>${t.level===4?'四级风险工单':'重复投诉工单'} · ${t.riskAck?'已完成结案风险复核':t.state==='待回访'?'待结案风险复核':'结案前需风险复核'}</span></div>`:''}
       <section class="task-callout ${ended?'is-ended':''}"><div class="mobile-tasktitle">${ended?'办理结果':actionable?'待我处理':'当前办理'}</div><div class="mobile-task-heading"><h3>${esc(taskLabel(t))}</h3><span>${esc(shownTaskPeople(t).map(name).join('、')|| (ended?'已完成':'待分派'))}</span></div>${!ended?`<div class="sub">整单截止 · ${t.deadline?date(t.deadline):'待设定'}</div>`:''}
         ${['待方案审批','待打款'].includes(t.state)?`<div class="mobile-amount-label">${t.state==='待打款'?'待付款金额':'方案申请金额'}</div><div class="detail-amount">${money((t.proposal?.refund||0)+(t.proposal?.compensation||0))}</div><p class="text">${esc(t.proposal?.content)}</p><p class="sub">${t.state==='待打款'?esc(t.proposal?.account):esc(t.approval?.scene)}</p>`:`<p class="text">${esc(resultNote)}</p>`}
       </section>
       <details class="mobile-details"><summary>工单信息</summary><div>${info(t)}</div></details>
       ${t.proposal?`<details class="mobile-details" ${['待方案审批','待打款'].includes(t.state)?'open':''}><summary>处理方案</summary><div>${funding(t)}</div></details>`:''}
       <details class="mobile-details mobile-records" open><summary>处理记录 <span class="mobile-record-count">${t.logs.length}</span></summary><div>${timeline(t)}</div></details>
     </div><footer class="mobile-footer mobile-detail-footer">${moreMenu(t).replace('<summary>更多</summary>','<summary>'+I('more')+'<span>更多</span></summary>')}<div class="mobile-detail-actions">${actions||`<span class="mobile-footer-note">${ended?'工单办理已结束':'当前暂无需要你办理的操作'}</span>`}</div></footer>
   </div>`;
   return;
 }
 const all=filtered();UI.page=Math.max(1,Math.min(UI.page,Math.ceil(all.length/8)||1));const rows=all.slice(0,UI.page*8);
 const count=Object.entries(UI.filters).filter(([key,value])=>key!=='q'&&key!=='sort'&&value).length;
 const narrowed=count>0||UI.filters.q.trim(),sortLabel=({'risk':'风险优先','new':'最近受理','due':'最近截止'})[UI.filters.sort];
 $('#app').innerHTML=`<div class="mobile-shell mobile-list-shell ${canCreate()?'has-floating-create':''}">
   <header class="mobile-top">${document.body.classList.contains('embedded')?`<a href="../demo.html?v=20260930-directory" data-demo-return="true" aria-label="返回演示入口">${I('back')}返回</a>`:'<span aria-hidden="true"></span>'}<strong>工单列表</strong><span aria-hidden="true"></span></header>
   <div class="tickets-query-panel">${tabs()}<form class="mobile-search" data-form="mobileSearch"><div class="mobile-search-box"><button type="submit" aria-label="查询工单">${I('search')}</button><input name="q" type="search" enterkeyhint="search" aria-label="搜索工单" placeholder="工单号、客户或手机号" value="${esc(UI.filters.q)}"></div>${btn(I('filter')+`<span>筛选${count?' · '+count:''}</span>`,'mobileFilter','','mobile-filter-button '+(count?'is-active':''),'aria-label="筛选工单'+(count?'，已选 '+count+' 项':'')+'"')}</form></div>
   <div class="mobile-content mobile-list-content"><div class="mobile-list-meta"><span role="status" aria-live="polite">${narrowed?'筛选结果':'共'} <b>${all.length}</b> 条工单</span>${narrowed?btn('清空筛选','resetFilters','','link'):`<span>${sortLabel}</span>`}</div><div class="mobile-ticket-list">${rows.length?rows.map(mobileTicket).join(''):empty()}</div>${mobileLoadStatus(all.length)}</div>
   ${canCreate()?btn(I('plus'),'create','','mobile-create-fab','aria-label="新增工单" title="新增工单"'):''}
 </div>`;
 observeMobileList();
}
async function legacyOnAction(act,id,el){
 if(act==='closeModal')return closeModal();if(act==='discardModal')return closeModal(true);
 if(act==='closeDrawer'){UI.drawer=null;UI.tab='info';$('#drawer-root').innerHTML='';history.replaceState(null,'','#/tickets');return}
 if(act==='detail'||act==='handle'){closeModal(true);UI.drawer=id;UI.tab=act==='handle'&&['待打款','待方案审批'].includes(ticket(id)?.state)?'fund':'info';location.hash=(mobile()?'#/mobile/':'#/tickets/')+id;if(!mobile())renderDrawer(id);return}
 if(act==='detailTab'){UI.tab=id;renderDrawer(UI.drawer);return}
 if(act==='view'){UI.view=id;UI.page=1;render();return}
 if(act==='page'){UI.page=+id;render();return}
 if(act==='refresh'){render();toast('已刷新');return}
 if(act==='resetFilters'){Object.keys(UI.filters).forEach(k=>UI.filters[k]=k==='sort'?'risk':'');UI.page=1;render();return}
 if(act==='moreFilters'){UI.more=!UI.more;$('#filter-form')?.classList.toggle('expanded',UI.more);return}
 if(act==='create')return createForm();
 if(['follow','assign','proposal','approve','reject','pay','payReturn','withdraw','review','complete','risk','repeat','escalate','bindOrder','call','reveal'].includes(act)){closeModal(true);return actionForm(act,id)}

 if(act==='appendExisting'||act==='repeatExisting'){const f=$('[data-form="create"]'),d=Object.fromEntries(new FormData(f));if(!d.description.trim())throw Error('请先填写本次投诉内容');const t=ticket(id),files=await readFiles(f.elements.files.files);let result=t;await mutate(()=>{if(act==='appendExisting'){if(['已结案','已合并'].includes(t.state))throw Error('已结束工单请登记再次投诉');t.sources.push({channel:d.channel,at:Date.now(),content:d.description});t.attachments.push(...files);E.log(t,S.actor,'补充来源记录',d.channel+'；'+d.description);E.scan(S,t,S.actor,d.description)}else{result=E.repeat(S,t,S.actor,d.description);result.attachments.push(...files);result.sources[result.sources.length-1].channel=d.channel}});closeModal(true);location.hash=(mobile()?'#/mobile/':'#/tickets/')+result.id;UI.drawer=result.id;render();toast(act==='appendExisting'?'已补充到原工单':'已登记再次投诉');return}
 if(act==='utilities'){modal('演示工具',`<div class="action-buttons">${btn('重置样例数据','resetData','','danger')}</div>`);return}
 if(act==='resetData'){modal('重置样例数据','<p>本机演示工单将重置，已保存的规则配置保留。</p><div class="gap"></div>'+btn('确认重置','doResetData','','danger'));return}
 if(act==='doResetData'){await mutate(()=>{const next=E.seed();next.configuration=S.configuration;next.unifiedVersion=1;next.assignmentCursors=S.assignmentCursors;next._revision=S._revision;S=next;});UI.drawer=null;UI.editor=null;UI.view='mine';closeModal(true);location.hash='#/demo';render();toast('演示数据已重置');return}
 if(act==='mobileFilter'){const f=UI.filters;modal('筛选工单',`<div class="form-grid">${field('状态',select('state',E.STATES,f.state,'全部状态'))}${field('等级',select('level',[[1,'一级'],[2,'二级'],[3,'三级'],[4,'四级']],f.level,'全部等级'))}${field('门店',select('store',E.STORES,f.store,'全部门店'))}${field('来源',select('channel',E.CHANNELS,f.channel,'全部来源'))}${field('风险 / 时效',select('risk',[['high','四级'],['repeat','重复投诉'],['overdue','已超时'],['soon','即将超时']],f.risk,'全部'))}${field('排序',select('sort',[['risk','风险优先'],['new','最近受理'],['due','最近截止']],f.sort))}</div>`,{form:'mobileFilters',submit:'应用筛选'});return}
}
document.addEventListener('click',async ev=>{const el=ev.target.closest('[data-action]');if(!el){const link=ev.target.closest('a[href^="#/"]');if(link){ev.preventDefault();location.hash=link.getAttribute('href');}return;}if(el.classList.contains('drawer-backdrop')&&ev.target.closest('[data-stop]'))return;ev.preventDefault();try{await onAction(el.dataset.action,el.dataset.id,el)}catch(e){toast(e.message)}});
document.addEventListener('keydown',ev=>{if(ev.key==='Escape'){if($('#modal-root').children.length)closeModal();else if(UI.drawer)onAction('closeDrawer','')}if(ev.key==='Tab'){const container=$('#modal-root .mobile-action-page, #modal-root .modal, #modal-root .drawer')||$('#drawer-root .drawer');if(!container)return;const elements=[...container.querySelectorAll('button:not(:disabled),summary,a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]')].filter(x=>x.offsetParent!==null);const first=elements[0],last=elements[elements.length-1];if(ev.shiftKey&&document.activeElement===first){ev.preventDefault();last?.focus()}else if(!ev.shiftKey&&document.activeElement===last){ev.preventDefault();first?.focus()}}});
document.addEventListener('input',ev=>{if(ev.target.closest('#modal-root form')&&!ev.target.closest('[data-form=simulate]'))UI.modalDirty=true;if(ev.target.closest('[data-editor-basic],[data-node-form]'))UI.editor.dirty=true;const row=ev.target.closest('[data-condition]');if(row){const[g,c]=row.dataset.condition.split('|').map(Number);UI.editor.doc.groups[g][c][ev.target.dataset.condField]=ev.target.value;UI.editor.dirty=true}if(ev.target.closest('[data-form="create"]')&&['phone','member'].includes(ev.target.name))duplicateCandidates()});
document.addEventListener('change',ev=>{const f=ev.target.closest('[data-form="create"]');if(f&&ev.target.name==='order'){const o=S.orders.find(x=>x.id===ev.target.value);if(o){['name','phone','member','store','isNew'].forEach(k=>f.elements[k].value=o[k]);}duplicateCandidates()}});
document.addEventListener('submit',async ev=>{ev.preventDefault();const f=ev.target;if(f.id==='filter-form'){Object.assign(UI.filters,Object.fromEntries(new FormData(f)));UI.page=1;render();return}const type=f.dataset.form;if(!type)return;const d=Object.fromEntries(new FormData(f)),id=f.dataset.id,t=ticket(id),submit=f.querySelector('[type=submit]');if(submit)submit.disabled=true;try{
 if(type==='sceneSearch'){UI.sceneSearch=d.q;render();return}
 if(type==='mobileSearch'){UI.filters.q=d.q;UI.page=1;render();return}
 if(type==='mobileFilters'){Object.assign(UI.filters,d);UI.page=1;closeModal(true);render();return}
 if(type==='create'){if(UI.duplicates?.length&&!d.distinct)throw Error('请选择关联处理方式，或确认是不同事件');const files=await readFiles(f.elements.files.files);const nt=await mutate(()=>E.create(S,S.actor,{...d,attachments:files}));closeModal(true);UI.drawer=nt.id;UI.view='all';location.hash=(mobile()?'#/mobile/':'#/tickets/')+nt.id;render();toast('工单已创建');return}
 if(type==='follow'){const files=await readFiles(f.elements.files.files);await mutate(()=>E.follow(S,t,S.actor,{...d,connected:d.connected==='yes',files}))}
 else if(type==='assign')await mutate(()=>E.assign(S,t,S.actor,d.owner,d.reason));
 else if(type==='proposal')await mutate(()=>E.startApproval(S,t,S.actor,proposalFromForm(f)));
 else if(type==='approve'||type==='reject')await mutate(()=>E.approve(S,t,S.actor,type==='approve',d.note));
 else if(type==='pay'){const proof=f.elements.proof.disabled?[]:await readFiles(f.elements.proof.files);await mutate(()=>E.pay(S,t,S.actor,{...d,amount:Math.round(Number(d.amount??0)*100),proof}))}
 else if(type==='payReturn')await mutate(()=>E.pay(S,t,S.actor,{result:'退回',reason:d.reason}));
 else if(type==='withdraw')await mutate(()=>E.withdraw(S,t,S.actor,d.reason));
 else if(type==='review')await mutate(()=>E.review(S,t,S.actor,d));
 else if(type==='complete')await mutate(()=>E.completeNormal(S,t,S.actor,d.note));
 else if(type==='risk')await mutate(()=>E.riskAck(S,t,S.actor,d.note));
 else if(type==='repeat'){const nt=await mutate(()=>E.repeat(S,t,S.actor,d.note));if(nt.id!==t.id){UI.drawer=nt.id;location.hash=(mobile()?'#/mobile/':'#/tickets/')+nt.id}}
 else if(type==='escalate')await mutate(()=>E.escalate(S,t,S.actor,d.level,d.note));
 else if(type==='bindOrder')await mutate(()=>{if(!E.canHandle(S,t,S.actor))throw Error('没有关联权限');const o=S.orders.find(x=>x.id===d.order&&x.phone===t.phone);if(!o)throw Error('请选择本人客户的有效订单');if(t.proposal?.approved||t.approval?.status==='审批中')throw Error('请先撤回当前方案');Object.assign(t,{order:o.id,project:o.project,amount:o.paid,member:o.member,staff:o.staff});E.log(t,S.actor,'关联消费订单',o.external)});
 closeModal(true);render();toast('操作已完成');
 }catch(e){const slot=f.querySelector('.error-slot');if(slot)slot.innerHTML=`<div class="error-inline">${esc(e.message)}</div>`;else toast(e.message)}finally{if(submit?.isConnected)submit.disabled=false}
});
window.addEventListener('hashchange',()=>{if(!location.hash.startsWith('#/rules')){UI.editor=null;UI.node=null;}closeModal(true);UI.drawer=null;UI.tab='info';render()});
window.addEventListener('storage',ev=>{if(ev.key===KEY&&ev.newValue&&!$('#modal-root').children.length&&!UI.editor){try{S=JSON.parse(ev.newValue);render()}catch{}}});

function renderArchive(id){
 const c=S.configuration.cases.find(c=>c.id===decodeURIComponent(id||''));
 const customer=c&&S.configuration.customers?.find(x=>x.id===c.customerId);
 $('#drawer-root').innerHTML='';
 $('#app').innerHTML=`<main class="content"><div class="page-head"><h1>历史工单记录</h1><a class="link" href="#/tickets">返回客诉工单</a></div>${c?`<div class="card"><h2>${esc(c.number)} · ${esc(c.title)}</h2><p>${esc(customer?.name||'')} · ${esc(c.store)}</p><p class="text">${esc(c.description)}</p><p class="sub">旧版记录已完整保留，仅供查阅；当前工单统一从客诉工单入口办理。</p></div><div class="card"><h3>处理记录</h3>${(c.records||[]).map(r=>`<div class="approval-line"><div><b>${esc(r.title)}</b><p class="sub">${date(r.at)}</p><p class="text">${esc(r.body)}</p>${filesView(r.attachments||[])}</div></div>`).join('')}</div><div class="card"><h3>历史方案</h3>${(c.plans||[]).map(p=>`<div class="approval-line"><div><b>V${p.version}</b><p class="text">${esc(p.summary)}</p>${p.refund?`<p>${money(p.refund.amountCents)} · ${esc(p.refund.status)}</p>`:''}${(p.items||[]).map(i=>`<p>${esc(i.description)} · ${esc(i.status)}</p>`).join('')}</div></div>`).join('')}</div>`:empty('历史工单不存在')}
 </main>`;
}
async function onAction(act,id,el){return legacyOnAction(act,id,el);}
const DEMO_ENTRIES=[
 {id:'pc-list',title:'工单列表',device:'PC端',icon:'ticket',tag:'列表 · 新增 · 跟进',kind:'list'},
 {id:'pc-rules',title:'场景审批配置',device:'PC端',icon:'flow',tag:'场景 · 条件 · 流程',kind:'rules'},
 {id:'mobile-list',title:'移动工单列表',device:'移动端',icon:'mobile',tag:'列表 · 搜索 · 代发起',kind:'mobileList'},
 {id:'approval',title:'钉钉审批详情',device:'钉钉 H5',icon:'check',tag:'方案 · 审批 · 记录',state:'待方案审批',sample:4},
 {id:'create',title:'新增工单',device:'PC端',icon:'plus',kind:'create'},
 {id:'flow',title:'审批流程编辑',device:'PC端',icon:'flow',kind:'flow'},
 {id:'first',title:'首次联系客户',device:'移动端',icon:'phone',state:'待首联',sample:1},
 {id:'store',title:'门店处理详情',device:'移动端',icon:'ticket',state:'处理中',level:1,sample:7},
 {id:'follow',title:'售后跟进详情',device:'移动端',icon:'ticket',state:'处理中',level:2,sample:2},
 {id:'payment',title:'财务打款详情',device:'钉钉 H5',icon:'check',state:'待打款',sample:5},
 {id:'review',title:'回访确认详情',device:'移动端',icon:'phone',state:'待回访',sample:7},
 {id:'risk',title:'四级风险处置',device:'移动端',icon:'shield',level:4,sample:0,mode:'risk'},
 {id:'repeat',title:'重复投诉详情',device:'移动端',icon:'refresh',repeat:true,sample:2,mode:'risk'},
 {id:'closed',title:'已结案详情',device:'移动端',icon:'check',state:'已结案',sample:9}
];
function demoPortal(){UI.drawer=null;$('#drawer-root').innerHTML='';document.body.classList.remove('is-mobile');const card=(x,compact=false)=>`<a href="#/demo/${x.id}" class="demo-card ${compact?'compact':''}"><div class="demo-card-icon">${I(x.icon)}</div><div class="demo-card-content"><span class="demo-device">${x.device}</span><h2>${x.title}</h2>${x.tag?`<div class="demo-tag">${x.tag}</div>`:''}</div><span class="demo-card-arrow">${I('arrow')}</span></a>`;$('#app').innerHTML=`<main class="demo-portal"><header class="demo-header"><div class="brand"><div class="brand-mark">✓</div><div><strong>悦服</strong><small>客诉工单系统</small></div></div><span class="demo-version">交互原型</span></header><section class="demo-main"><div class="demo-title"><span class="demo-kicker">PROTOTYPE DIRECTORY</span><h1>原型演示入口</h1></div><div class="demo-section-heading"><h2>页面入口</h2><span>PC / 移动端 / 钉钉 H5</span></div><div class="demo-main-grid">${DEMO_ENTRIES.slice(0,4).map(x=>card(x)).join('')}</div><div class="demo-section-heading demo-secondary-heading"><h2>办理场景</h2></div><div class="demo-scenes-grid">${DEMO_ENTRIES.slice(4).map(x=>card(x,true)).join('')}</div></section><footer class="demo-portal-footer"><span>悦服 · 客诉工单系统</span>${btn('重置演示数据','resetData','','link')}</footer></main>`}
function demoTicket(entry){let t=S.tickets.find(t=>(!entry.state||t.state===entry.state)&&(!entry.level||t.level===entry.level)&&(!entry.repeat||t.repeat)&&!t.mergedInto&&(entry.mode!=='risk'||!t.riskAck));if(t)return t;const seeds=E.seed();t=E.clone(seeds.tickets[entry.sample]);t.id='DEMO-'+entry.id.toUpperCase()+'-'+E.id().slice(0,4).toUpperCase();if(entry.state)t.state=entry.state;if(entry.level)t.level=entry.level;if(entry.repeat)t.repeat=true;if(entry.mode==='risk'){t.riskAck=false;}if(entry.id==='store'){t.owner='zhang';t.proposal=null;t.approval=null;t.payments=[];t.state='处理中'}const o=seeds.orders.find(o=>o.id===t.order);if(o){const copy=E.clone(o);copy.id='DEMO-ORDER-'+E.id();copy.refunded=0;S.orders.push(copy);t.order=copy.id}t.related=[];t.participants=[...new Set([...t.participants,t.owner])];S.tickets.unshift(t);save();return t}
function openDemo(id){const e=DEMO_ENTRIES.find(x=>x.id===id);if(!e){history.replaceState(null,'','#/demo');demoPortal();return}UI.editor=null;UI.node=null;UI.tab='info';UI.drawer=null;UI.view='all';UI.page=1;UI.demoMode=e.mode||'auto';sessionStorage.setItem('meiye.complaint.reference.demo-mode',UI.demoMode);Object.keys(UI.filters).forEach(k=>UI.filters[k]=k==='sort'?'risk':'');let route='#/tickets',action='';if(e.kind==='rules'||e.kind==='flow'){route='#/rules';UI.ruleTab='scenes';action=e.kind==='flow'?'flow':''}else if(e.kind==='mobileList')route='#/mobile';else if(e.kind==='create')action='create';else if(!e.kind){const t=demoTicket(e);route='#/mobile/'+t.id}history.replaceState(null,'',route);render();if(action==='create')createForm();}
function syncDemoActor(route){const rid=route.split('/')[2],t=ticket(rid);if(t&&!route.startsWith('#/rules')){if(E.needsRiskReview(t))S.actor=S.rules.riskConfig.receiver;else S.actor=E.taskPeople(S,t)[0]||t.owner||S.rules.fallback;}else S.actor='jiang';}

if(!location.hash||!/^#\/(demo|tickets|rules|mobile|archive)/.test(location.hash))history.replaceState(null,'','#/demo');
render();

// Keep auxiliary actions grouped, and close the menu after choosing an action.
document.addEventListener('click',ev=>{document.querySelectorAll('.ticket-more-menu[open]').forEach(menu=>{if(!menu.contains(ev.target)||ev.target.closest('.ticket-more-items button'))menu.open=false;});});
document.addEventListener('keydown',ev=>{if(ev.key!=='Escape'||$('#modal-root').children.length)return;const menu=document.querySelector('.ticket-more-menu[open]');if(menu){ev.preventDefault();ev.stopImmediatePropagation();menu.open=false;menu.querySelector('summary').focus();}},true);
