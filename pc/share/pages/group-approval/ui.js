/* PC presentation for the migrated approval workflows. All controls are mounted
 * through the existing PCUI adapter and the pinned company/Element Plus package. */
window.PCGroupUI = (() => {
  const $ = selector => document.querySelector(selector);
  const routeMap = {'group-approval':'workbench','group-workbench':'workbench','group-list':'list/all','group-rules':'rules','group-organization':'organization','group-statistics':'statistics','group-mobile':'demo'};
  let active = false, pageRoute = '', baseRoute='list/all', dialogCancel=null, pageOpener = null, dialogOpener = null, confirming = false, preparing = false;
  const roots = () => [...document.querySelectorAll('#ga-application,#ga-page,#ga-modal,.pc-company-dialog .pc-ga')];
  const owns = el => active && !!el?.closest('.pc-ga');
  const escape = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function hash(to) {
    if(to.startsWith('@'))return '#'+to.slice(1);
    const base = ({workbench:'group-workbench',list:'group-list',catalog:'group-list',apply:'group-list',edit:'group-list',detail:'group-list',rules:'group-rules',rule:'group-rules',organization:'group-organization',statistics:'group-statistics',demo:'group-mobile',notifications:'group-workbench',profile:'group-workbench'})[to.split('/')[0]] || 'group-workbench';
    return '#'+base+(routeMap[base]===to?'':'?ga='+encodeURIComponent(to));
  }
  function readRoute() {const [base,query='']=location.hash.slice(1).split('?');return (new URLSearchParams(query).get('ga')||routeMap[base]||'workbench').split('/').filter(Boolean);}
  function navigate(to) {const next=hash(to);if(location.hash===next){GA.load();GA.render();}else location.hash=next;}
  function ensure() {
    active=true;
    document.body.classList.toggle('ga-mobile-mode',GA.mobile);
    if(!$('#ga-application'))$('#main').innerHTML='<div id="ga-application" class="pc-ga ub-workspace"></div>';
  }
  function drawer(key,title,body,footer,width) {
    return syncDrawerLayer($('#mergeDrawers'),key,`<div class="merge-drawer-backdrop"><section id="${key}" class="merge-drawer ub-drawer ga-drawer pc-ga" data-size="${width===560?'small':width===860?'medium':'large'}" style="--archive-drawer-width:${width}px" role="dialog" aria-modal="true" aria-label="${escape(title)}" tabindex="-1"><header class="merge-drawer-head"><h2>${escape(title)}</h2><button type="button" class="icon-btn" data-action="${key==='ga-page'?'pc-page-close':'close'}" aria-label="关闭${escape(title)}">${icon('close')}</button></header><div class="merge-drawer-body">${body}</div>${footer?`<footer class="merge-drawer-foot"><div class="actions">${footer}</div></footer>`:''}</section></div>`);
  }
  function sync() {syncDrawerInteraction();const page=$('#ga-page');if(page)page.inert=!!$('#ga-modal')&&!$('#ga-modal').closest('.is-closing')||confirming;}
  function render(content,title,route) {
    const secondary=['detail','apply','edit','rule'].includes(route[0]);
    if(!secondary){baseRoute=route.join('/');pageRoute='';syncDrawerLayer($('#mergeDrawers'),'ga-page','');$('#ga-application').innerHTML=content;sync();return;}
    if(!$('#ga-application').children.length){
      const old=[...route],background=old[0]==='rule'?'rules':baseRoute==='rules'?'list/all':baseRoute;route.splice(0,route.length,...background.split('/'));
      $('#ga-application').innerHTML=(GA.views[route[0]]||GA.views.list)();route.splice(0,route.length,...old);
    }
    if(!pageRoute)pageOpener=document.activeElement;
    const holder=document.createElement('div');holder.innerHTML=content;
    const pageNav=holder.querySelector('.ga-page-nav');
    let footer=pageNav?.querySelector('[data-action="print"]')?.outerHTML||'';
    pageNav?.remove();
    if(route[0]==='rule'){
      const top=holder.querySelector('.ga-rule-top');
      if(top){footer=[...top.querySelectorAll('.ga-rule-title > .pill,.ga-rule-title > #draft-state')].map(el=>el.outerHTML).join('')+(top.querySelector(':scope > .row')?.innerHTML||'');top.remove();}
      title=GA.config.editor.draft.basic.name+' · 规则配置';
    }else if(['apply','edit'].includes(route[0])){
      const actions=holder.querySelector('.form-actions');if(actions){actions.querySelectorAll('[type=submit]').forEach(b=>b.setAttribute('form','apply-form'));footer=actions.innerHTML;actions.remove();}
      title=GA.draft?.schema.basic.name||title;
    }else{
      const actions=holder.querySelector('.ga-detail-action');if(actions){footer+=actions.innerHTML;actions.remove();}
    }
    const changed=pageRoute!==route.join('/');pageRoute=route.join('/');
    const cancel=GA.btn(['apply','edit','rule'].includes(route[0])?'取消':'关闭','pc-page-close');
    drawer('ga-page',title,holder.innerHTML,cancel+footer,route[0]==='rule'?1400:1120);sync();
    if(changed)queueMicrotask(()=>$('#ga-page')?.focus({preventScroll:true}));
  }
  function close() {
    if(confirming){confirming=false;PCUI.closeDialog();}
    syncDrawerLayer($('#mergeDrawers'),'ga-modal','');sync();
    setTimeout(()=>{sync();if(dialogOpener?.isConnected&&!dialogOpener.closest('[inert]'))dialogOpener.focus({preventScroll:true});else $('#ga-page')?.focus({preventScroll:true});},drawerMotionTime()+20);
  }
  function open(title,body,onSave,{wide=false,saveText='保存',footer=''}={}) {
    if(confirming){confirming=false;PCUI.closeDialog();}
    if(!$('#ga-modal')||$('#ga-modal').closest('.is-closing'))dialogOpener=document.activeElement;
    const actions=footer+GA.btn(onSave?'取消':'关闭','close')+(onSave?`<button class="btn primary" type="submit" form="modal-form">${escape(saveText)}</button>`:'');
    if(!wide&&onSave&&!/<(?:input|select|textarea|table|button)|ga-flow-list|oa-print-sheet/.test(body)){confirming=true;dialogCancel=()=>GA.close();PCUI.dialog({title,content:`<div class="pc-ga"><form id="modal-form" novalidate><div id="modal-error" class="form-error" role="alert"></div>${body}</form></div>`,footer:`<div class="pc-ga actions">${actions}</div>`});prepare();sync();return;}
    drawer('ga-modal',title,`<form id="modal-form" novalidate><div class="form-error" role="alert" id="modal-error"></div>${body}</form>`,actions,wide?860:560);
    prepare();sync();queueMicrotask(()=>$('#ga-modal')?.focus({preventScroll:true}));
  }
  function confirm(title,body,fn,saveText='确认',cancel=()=>{}) {
    confirming=true;dialogCancel=cancel;
    PCUI.dialog({title,content:`<div class="pc-ga"><p>${body}</p><div id="ga-confirm-error" class="form-error" role="alert"></div></div>`,buttons:[{text:'取消',action:()=>{confirming=false;cancel();PCUI.closeDialog();sync();}},{text:saveText,primary:true,action:async()=>{if($('#ga-confirm-error')?.dataset.busy)return;const el=$('#ga-confirm-error');if(el)el.dataset.busy='true';try{await fn();confirming=false;PCUI.closeDialog();sync();}catch(error){if(el){el.textContent=error.message;delete el.dataset.busy;}}}}]});sync();
  }
  // ByForm owns the only native form. Business groups and field visibility stay
  // in their original positions, with Element Plus form items inheriting PC sizes.
  function mountForm(source) {
    const {h}=Vue,attributes=Object.fromEntries([...source.attributes].map(a=>[a.name,a.value]));
    const labels=[...source.querySelectorAll('.field-title,.ga-field-title,.ub-label')];
    const labelWidth=Math.min(160,Math.max(110,...labels.map(el=>Math.ceil((el.textContent.trim().length+1)*13+20))));
    const nodes=[...source.childNodes],host=document.createElement('div');host.className='pc-form ga-form-host';host.dataset.pcIsland='form';source.replaceWith(host);
    function node(v){
      if(v.nodeType===3)return v.textContent;if(v.nodeType!==1)return null;
      const props=Object.fromEntries([...v.attributes].map(a=>[a.name,a.value]));
      if(v.hasAttribute('hidden'))props.hidden=true;
      if(v.classList.contains('field')){
        const label=v.querySelector(':scope > .field-title,:scope > .ga-field-title,:scope > label,:scope > .ub-label');
        const control=v.cloneNode(true);control.querySelector(':scope > .field-title,:scope > .ga-field-title,:scope > label,:scope > .ub-label')?.remove();
        const required=!!label?.querySelector('.ga-required')||!!label?.classList.contains('required');
        props.class=v.className.replace(/\bfield\b/g,'ga-form-item');
        return h('div',props,[h(ElementPlus.ElFormItem,{label:(label?.textContent||'').replace(/^\s*\*/,'').trim(),labelWidth:labelWidth+'px',required,style:{minHeight:Math.ceil(((label?.textContent.trim().length||0)+1)*13/(labelWidth-20))*32+'px'}},()=>h('div',{class:'pc-field-content',innerHTML:control.innerHTML}))]);
      }
      return v.querySelector('.field')?h(v.tagName.toLowerCase(),props,[...v.childNodes].map(node)):h(v.tagName.toLowerCase(),{...props,innerHTML:v.innerHTML});
    }
    PCUI.mount(host,{render:()=>h(ByComponentsV3.components.ByForm,{formItems:[{type:'custom',field:'body',labelWidth:'0',colLayout:{span:24},itemStyle:{marginBottom:0}}],modelValue:{},labelWidth:'110px',labelSuffix:'：',elSize:'default',rowAttrs:{gutter:0},otherOptions:{submit:false,reset:false}},{body:()=>h('div',{class:'pc-field-content ga-form-content'},nodes.map(node))})});
    const actual=host.querySelector('form');for(const [name,value] of Object.entries(attributes))actual.setAttribute(name,value);
    actual.dataset.gaMounted='true';actual.noValidate=true;
    // Prevent native Enter in configuration panes from submitting the page.
    actual.addEventListener('submit',event=>{if(!GA.forms[actual.id]&&actual.id!=='modal-form')event.preventDefault();});
  }
  function searchForm(form) {
    form.classList.add('filterbar');form.closest('.panel')?.classList.add('query-module');
    if(!form.closest('.query-module')){const section=document.createElement('section');section.className='panel query-module';form.before(section);section.append(form);}
    form.querySelectorAll(':scope > label').forEach(label=>{const el=label.htmlFor?form.querySelector('#'+label.htmlFor):null;if(el)el.setAttribute('aria-label',label.textContent);label.remove();});
    const actions=document.createElement('div');actions.className='query-actions';
    form.querySelectorAll(':scope > button').forEach(b=>{if(b.type==='submit'){b.textContent='搜索';b.setAttribute('form',form.id);}actions.append(b);});
    const dates=[...form.querySelectorAll(':scope > input[type=date]')];
    if(dates.length===2){const range=document.createElement('div');range.className='mr-date';range.dataset.pcLabel='发起日期';dates[0].before(range);range.append(dates[0],document.createTextNode(' 至 '),dates[1]);}
    [...form.children].filter(el=>el.tagName==='SPAN'&&el.textContent.trim()==='至').forEach(el=>el.remove());
    form.append(actions);
  }
  function normalize(root) {
    root.querySelectorAll('.tabs,.oa-node-tabs,.oa-advanced > nav').forEach(el=>{if(!el.classList.contains('pc-tabs')){el.classList.add('tabs');el.querySelectorAll(':scope > button').forEach(b=>b.classList.remove('btn'));}});
    root.querySelectorAll('label.upload-label').forEach(label=>{const input=label.querySelector('input[type=file]');if(!input)return;const wrap=document.createElement('div');wrap.className='ga-upload-control';wrap.innerHTML=`<button type="button" class="btn" data-action="pc-upload" ${input.disabled?'disabled':''}>${escape(label.textContent.replace(/[＋+]/g,'').trim())}</button>`;input.hidden=true;input.tabIndex=-1;wrap.append(input);label.replaceWith(wrap);});
    root.querySelectorAll('.oa-device.phone').forEach(el=>{el.classList.remove('phone');el.classList.add('ga-device-phone');});
    root.querySelectorAll('button:not(.el-button):not([role=tab])').forEach(b=>{
      if(b.closest('.pc-tabs,.tabs'))return;
      if(b.matches('.ga-type,.stat,.ac-node-body,.ac-branch-title,.oa-field'))return;
      b.classList.add('btn');if(b.classList.contains('quiet'))b.classList.add('text');
    });
    root.querySelectorAll('.table-wrap > table').forEach(table=>{
      table.dataset.pcAlign='left';table.dataset.pcMinHeight='0';
      for(const name of table.classList)if(name.startsWith('oa-'))table.parentElement.classList.add(name);
      table.querySelectorAll('tbody td').forEach(td=>{if(td.querySelectorAll(':scope > button').length>1){const actions=document.createElement('div');actions.className='actions';actions.append(...td.childNodes);td.append(actions);}});
      table.querySelectorAll('th').forEach(th=>{if(/审批单|表单|项目|名称|任职|负责人|处理人|说明/.test(th.textContent))th.dataset.pcMinWidth='180';});
    });
    root.querySelectorAll('.ga-sub').forEach(el=>el.classList.add('pc-block'));
    root.querySelectorAll('form:not([data-ga-mounted]):not(.el-form)').forEach(form=>{
      if(form.closest('.pc-form,.pc-search-form'))return;
      if(form.matches('.ga-filters,#oa-form-search,#mobile-list-search'))searchForm(form);else mountForm(form);
    });
    // Keep category tabs and search in one panel, without adding a second gap.
    root.querySelectorAll('.panel:has(> .tabs)').forEach(panel=>{
      const next=panel.nextElementSibling;
      if(next?.classList.contains('query-module')){panel.append(...next.childNodes);panel.classList.add('query-module');next.remove();}
    });
  }
  function prepare() {
    if(preparing||!active)return;preparing=true;
    try{roots().forEach(normalize);PCUI.sweep();}finally{preparing=false;}
  }
  function pager(total,page,size,scope){return `<div data-pc-pager='${escape(JSON.stringify({total,page,size,scope,action:'group-approval'}))}'></div>`;}
  function leave(){active=false;pageRoute='';GA.close();syncDrawerLayer($('#mergeDrawers'),'ga-page','');document.body.classList.remove('ga-mobile-mode');$('#oa-page-style')?.remove();sync();}
  function keydown(event){
    if(!active||confirming||PCUI.isPopupOpen())return;
    const top=$('#ga-modal:not([inert])')||$('#ga-page:not([inert])');if(!top||top.closest('.is-closing'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(top.id==='ga-modal')GA.close();else GA.actions['pc-page-close']();return;}
    if(event.key!=='Tab')return;
    const els=[...top.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href],summary,[tabindex="0"]')].filter(el=>el.getClientRects().length&&el.tabIndex>=0&&!el.closest('[hidden],[inert]'));
    if(!els.length){event.preventDefault();top.focus();return;}
    if(event.shiftKey&&(document.activeElement===els[0]||document.activeElement===top)){event.preventDefault();els.at(-1).focus();}else if(!event.shiftKey&&(document.activeElement===els.at(-1)||!top.contains(document.activeElement))){event.preventDefault();els[0].focus();}
  }
  document.addEventListener('keydown',keydown,true);
  new MutationObserver(()=>{if(confirming&&!document.querySelector('.pc-company-dialog:not(.is-closing)')){confirming=false;const cancel=dialogCancel;dialogCancel=null;cancel?.();sync();}}).observe($('#modal'),{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
  return {returnRoute:()=>GA.route[0]==='rule'?'rules':baseRoute,active:()=>active,owns,hash,readRoute,navigate,ensure,render,prepare,open,close,confirm,pager,leave};
})();
