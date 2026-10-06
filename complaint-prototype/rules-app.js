/* Existing rule editor UI, backed exclusively by the shared configuration and store. */
(function(){
'use strict';
const E=window.CaseEngine,Store=window.CaseStore,KEY=Store.KEY,A={canConfigure:id=>id==='manager'};
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const params=new URLSearchParams(location.search),view='pc',actorId=params.get('actor')||'manager',embedded=params.get('embed')==='1';
let state,rulesDraft=null,rulesBaseVersion=0,rulesTab='approval',rulesListTab='scenes',assignmentSceneId='',activeForm=null,dirty=false,lastFocus,toastTimer;
const sceneFilters={keyword:'',status:''},load=()=>Store.load(),exclusive=fn=>Store.exclusive(fn);
const icons={ticket:'M7 3h10l3 3v15H4V3h3M8 9h8M8 13h8M8 17h5',shield:'M12 2l8 3v6c0 6-8 11-8 11S4 17 4 11V5l8-3M8 11l3 3 5-5'};
const ico=n=>`<svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[n]||icons.ticket}"/></svg>`;
const btn=(label,action,options='')=>`<button type="button" class="btn ${options}" data-action="${action}">${label}</button>`;
const empty=(title,desc)=>`<div class="empty"><h3>${title}</h3><p>${desc}</p></div>`;
function heading(title,desc,action=''){return `<div class="page-heading"><div><h1>${title}</h1><p>${desc}</p></div>${action}</div>`;}
function save(s){Store.save(s);state=s;}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function closeModal(){activeForm=null;$('#modal-root').innerHTML='';document.body.style.overflow='';dirty=false;lastFocus?.focus();}
function render(){
 document.body.classList.toggle('embedded',embedded);const a=E.person(state,actorId);
 $('#application').innerHTML=`<div class="pc-shell"><aside class="side"><div class="brand"><span class="brand-mark">✦</span><div><strong>美业AI平台</strong><small>SERVICE OPERATIONS</small></div></div><div class="side-label">客诉管理</div><button class="nav" data-go="tickets">${ico('ticket')}客诉工单</button><button class="nav active" data-go="rules">${ico('shield')}规则配置</button><div class="side-foot">受理、跟进与回访<br>在一张工单中协作</div></aside><main class="main"><header class="pc-header"><span>客诉管理 / 规则配置</span><div class="row"><span>${esc(a?.name||'未授权')} · ${esc(a?.role||'')}</span><span class="avatar">${esc(a?.name?.[0]||'')}</span></div></header><div class="page-body">${rulesPage()}</div></main></div>`;
 window.ApprovalFlowUI.mount();
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

function parseRoute(){
 if(params.get('view')==='customer'){$('#application').innerHTML='<main class="page-body">'+empty('客户入口已停用','请联系工单负责人反馈处理意见。')+'</main>';return;}
 const parts=location.hash.slice(1).split('/');rulesDraft=null;assignmentSceneId='';rulesListTab='scenes';window.NodeAssignmentView.reset();
 if(parts[0]&&parts[0]!=='rules'){
  const q=new URLSearchParams(location.search);q.delete('page');q.delete('embed');const old=parts[0]==='detail'&&state.cases.some(c=>c.id===parts[1]);
  const mobile=['staff','approval'].includes(params.get('view'));q.set('view',mobile?'h5':'pc');
  location.replace('workflow/index.html?'+q.toString()+(old?'#/archive/'+encodeURIComponent(parts[1]):parts[0]==='detail'?'#/'+(mobile?'mobile':'tickets')+'/'+encodeURIComponent(parts[1]):'#/'+(mobile?'mobile':'tickets')));return;
 }
 if(parts[1]&&A.canConfigure(actorId)){const scene=E.Rules.sceneList(state).find(s=>s.id===decodeURIComponent(parts[1]));if(scene){
  if(['assignment','timing'].includes(parts[2])){rulesListTab='assignment';assignmentSceneId=scene.id;if(parts[2]==='timing')history.replaceState(null,'','#rules/'+scene.id+'/assignment/timing');}
  else if(parts[2]==='basic'){render();sceneAction('edit-basic',{dataset:{id:scene.id}});return;}
  else{rulesDraft=E.Rules.prepareScene(scene);rulesBaseVersion=state.sceneRevision||0;}
 }}render();window.scrollTo(0,0);
}
document.addEventListener('click',async event=>{const b=event.target.closest('button');if(!b)return;try{
 if(b.dataset.flowAction){captureRules();window.ApprovalFlowUI.handle(b,{draft:rulesDraft,state,change:()=>{dirty=true;render();}});return;}
 if(b.dataset.sceneAction){await sceneAction(b.dataset.sceneAction,b);return;}
 if(b.dataset.action==='close-modal'){closeModal();return;}
 if(b.dataset.go==='tickets'){location.href='workflow/index.html#/tickets';return;}
 if(b.dataset.go==='rules'){location.hash='rules';}
}catch(e){toast(e.message);}});
for(const type of ['input','change'])document.addEventListener(type,event=>{if(event.target.closest('#rules-form')){captureRules();dirty=true;}if(event.target.closest('#scene-basic-form'))dirty=true;});
document.addEventListener('submit',event=>{const f=event.target;if(!['rules-form','scene-basic-form','scene-filters'].includes(f.id))return;event.preventDefault();if(f.id==='rules-form')submitRules(f);if(f.id==='scene-basic-form')submitSceneBasic(f);if(f.id==='scene-filters'){sceneFilters.keyword=f.elements.keyword.value.trim();sceneFilters.status=f.elements.status.value;render();}});
document.addEventListener('keydown',event=>{if(!activeForm)return;if(event.key==='Escape')closeModal();if(event.key==='Tab'){const elements=[...document.querySelectorAll('#modal-root button:not(:disabled), #modal-root input:not(:disabled), #modal-root select:not(:disabled), #modal-root textarea:not(:disabled)')].filter(el=>el.offsetParent!==null);const first=elements[0],last=elements.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
window.addEventListener('hashchange',()=>{state=load();parseRoute();});
window.addEventListener('storage',event=>{if(event.key!==KEY)return;state=load();if(dirty||activeForm||rulesDraft)toast('其他页面已更新数据，保存时将校验最新版本');else render();});
try{state=load();if(!location.hash&&params.get('page')!=='rules')history.replaceState(null,'','#tickets');parseRoute();}
catch(e){$('#application').innerHTML=`<main class="page-body"><div class="callout error">${esc(e.message)}</div></main>`;console.error(e);}
})();
