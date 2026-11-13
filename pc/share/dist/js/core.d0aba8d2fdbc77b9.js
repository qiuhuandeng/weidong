/* Shared business helpers. Loaded before business code and native controls. */
const money=n=>'¥'+Number(n).toLocaleString('zh-CN',{maximumFractionDigits:2});
const clone=x=>JSON.parse(JSON.stringify(x));
function btn(t,fn,cls='',ic=''){return '<button class="btn '+cls+'" onclick="'+esc(fn)+'">'+(ic?icon(ic):'')+t+'</button>'}
function badge(t,c='blue'){return '<span class="pill '+c+'"><span class="dot"></span>'+esc(t)+'</span>'}
function notice(t,c='',ic='info'){return !c||c==='blue'?'':'<div class="notice '+c+'">'+icon(ic)+'<span>'+t+'</span></div>'}
function panel(t,b,extra='',cls=''){return '<section class="panel '+cls+'"><div class="panel-head"><h2>'+t+'</h2>'+extra+'</div>'+b+'</section>'}
function body(b){return '<div class="panel-body">'+b+'</div>'}
function table(head,rows){return '<div class="table-wrap"><table><thead><tr>'+head.map(h=>'<th>'+h+'</th>').join('')+'</tr></thead><tbody>'+rows.map(r=>'<tr>'+r.map(c=>'<td>'+c+'</td>').join('')+'</tr>').join('')+'</tbody></table></div>'}
let fieldCounter=0;
function field(t,control,req=false){let match=control.match(/\bid="([^"]+)"/),id=match?match[1]:"field-"+(++fieldCounter);if(!match)control=control.replace(/<(input|select|textarea)\b/,'<$1 id="'+id+'"');return '<div class="field"><label for="'+id+'" class="'+(req?'required':'')+'">'+t+'</label>'+control+'</div>'}
function select(opts,val,attrs=''){return '<select '+attrs+'>'+opts.map(x=>{let [v,l]=Array.isArray(x)?x:[x,x];return '<option value="'+esc(v)+'" '+(v===val?'selected':'')+'>'+esc(l)+'</option>'}).join('')+'</select>'}
function switcher(checked,fn,label){return '<label class="switch"><input type="checkbox" '+(checked?'checked':'')+' aria-label="'+esc(label)+'" onchange="'+esc(fn)+'"><span></span></label>'}
function kv(obj){return '<div class="kv">'+Object.entries(obj).map(([k,v])=>'<span>'+k+'</span><span>'+v+'</span>').join('')+'</div>'}
function head(title,sub,actions='',code=''){if(isMergeRoute())return actions?'<div class="rule-section-actions">'+actions+'</div>':'';return '<div class="page-head"><h1>'+title+'</h1><div class="actions">'+actions+'</div></div>'}
const drawerRemovalTimers=new WeakMap();
function drawerMotionTime(){return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches?0:280}
function canDismissMergeBackdrop(){return !document.querySelector('[data-overlay-layer="arb"],#modal>[data-overlay-layer]')}
function syncDrawerInteraction(){let blocking=!!document.querySelector('#mergeDrawers>[data-overlay-layer],#modal>[data-overlay-layer]');document.body.classList.toggle('drawer-open',blocking);['#main','#sidebar','.topbar'].forEach(sel=>{let el=$(sel);if(el)el.inert=blocking});let mergeRecord=$('#mergeRecordPanel');if(mergeRecord)mergeRecord.inert=mergeRecord.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let workbench=$('#correctionWorkbenchPanel');if(workbench)workbench.inert=workbench.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let application=$('#correctionApplicationPanel');if(application)application.inert=application.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let history=$('#mergeHistoryPanel');if(history)history.inert=history.parentElement.classList.contains('is-closing')||!!document.querySelector('#modal>[data-overlay-layer]');let outer=$('#mergeOuterPanel');if(outer)outer.inert=outer.parentElement.classList.contains('is-closing')||!!document.querySelector('[data-overlay-layer="arb"],#modal>[data-overlay-layer]')}
function syncDrawerLayer(root,key,html){
 let layer=root.querySelector('[data-overlay-layer="'+key+'"]');
 if(!html){if(!layer||layer.classList.contains('is-closing'))return;layer.classList.remove('show');layer.classList.add('is-closing');layer.dataset.closing='true';layer.inert=false;layer.firstElementChild.inert=true;layer.setAttribute('aria-hidden','true');let timer=setTimeout(()=>{layer.remove();drawerRemovalTimers.delete(layer);syncDrawerInteraction()},drawerMotionTime());drawerRemovalTimers.set(layer,timer);return}
 let box=document.createElement('div');box.innerHTML=html.trim();let next=box.firstElementChild;
 if(layer){clearTimeout(drawerRemovalTimers.get(layer));drawerRemovalTimers.delete(layer);layer.classList.remove('is-closing');delete layer.dataset.closing;layer.inert=false;layer.removeAttribute('aria-hidden');let panel=layer.firstElementChild,fresh=next.firstElementChild;panel.inert=false;for(const name of ['class','style','data-size']){if(fresh.hasAttribute(name))panel.setAttribute(name,fresh.getAttribute(name));else panel.removeAttribute(name)}panel.innerHTML=fresh.innerHTML;panel.setAttribute('aria-label',fresh.getAttribute('aria-label'));panel.setAttribute('aria-modal','true');layer.classList.add('show')}
 else{layer=next;layer.dataset.overlayLayer=key;root.appendChild(layer);layer.getBoundingClientRect();layer.classList.add('show')}
 if(typeof uiNormalizeIds==='function')uiNormalizeIds();return layer;
}
function focusAfterDrawerClose(selector){setTimeout(()=>{$(selector)?.focus()},drawerMotionTime()+16)}
function toast(s){if(typeof msIsMobile==='function'&&msIsMobile()){msToast(s);return}$('#toast').textContent=s;$('#toast').classList.add('show');clearTimeout(window.toastTimer);window.toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),3200)}
let modalFocus=null,modalFocusAction='';
function modal(title,content,footer='',wide=false){if(typeof apIsMobile==='function'&&apIsMobile()){apPrompt(title,apMobileMarkup(content),(footer||btn('返回','apDismiss()')).replaceAll('closeModal()','apDismiss()'));return;}if(!document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){modalFocus=document.activeElement;modalFocusAction=modalFocus?.getAttribute?.('onclick')||''}PCUI.dialog({title,content,footer:footer||btn('知道了','closeModal()','primary'),wide});}
function pageTabs(items,selected,label){return '<div class="page-tabs" role="tablist" aria-label="'+label+'">'+items.map(([key,text,action])=>'<button class="page-tab '+(selected===key?'active':'')+'" type="button" role="tab" aria-selected="'+(selected===key)+'" onclick="'+esc(action)+'">'+text+'</button>').join('')+'</div>'}
function queryModule(controls,searchAction='render()',resetAction=''){let oldReset=controls.match(/<button\b[^>]*>\s*重置\s*<\/button>/),resetButton;if(oldReset){controls=controls.replace(oldReset[0],'');resetButton=oldReset[0].replace(/class="[^"]*"/,'class="btn"')}else resetButton=btn('重置',resetAction||'resetPageSearch()');let enter="if(event.key==='Enter'&&event.target.tagName==='INPUT'){event.preventDefault();"+searchAction+"}";return '<section class="panel query-module" aria-label="搜索区" onkeydown="'+esc(enter)+'"><div class="filterbar">'+controls+'<div class="query-actions">'+resetButton+btn('搜索',searchAction,'primary','search')+'</div></div></section>'}
function contentModule(title,content,actions='',cls=''){return '<section class="panel content-module '+cls+'"><div class="panel-head"><h2>'+title+'</h2><div class="actions">'+actions+'</div></div>'+content+'</section>'}
function isMergeRoute(r=route){return r==='rules'||r.startsWith('rule-')}
function empty(t,sub='调整筛选条件后重试。'){return '<div class="empty">'+icon('file')+'<div>'+t+'</div><p>'+sub+'</p></div>'}
const pageMap=[['mobile-store','移动档案工作台','P-MB-NEW'],['reviews','审核管理','AP-01'],['customers','客户档案','P-CM-01'],['merge-candidates','档案合并 · 待合并处理','P-MG-00'],['merge-records','档案合并 · 合并记录','P-MG-01'],['rules','规则配置','P-RC-01'],['rule-primary','主客户判定规则','P-RC-02'],['rule-intercept','前置拦截规则','P-RC-03'],['rule-deposit','预约金有效期','P-RC-04'],['rule-arbitration','订单仲裁规则','P-RC-05'],['tickets','纠错工单','P-EC-01'],['new','发起纠错申请','P-EC-02'],['approval','纠错审批','P-EC-03'],['snapshot','快照对比','P-EC-04'],['process','数据分类处理','P-EC-05'],['identity','识别维度拆回','P-EC-06'],['recalc','统计字段重算','P-EC-07'],['adjustment','纠错调整单','P-EC-08'],['ticket','工单详情 / 进度','P-EC-09'],['reversals','冲销记录','P-RV-01'],['reversal-detail','冲销记录详情','P-RV-02'],['mobile-approvals','移动待审核','P-AP-01'],['mobile-approval','移动审批详情','P-AP-02'],['mobile-adjustment','移动调整单确认','P-AP-03'],['mobile-customer','门店客户档案','P-MB-01'],['mobile-new','门店纠错申请','P-MB-02']];
function closeModal() {
  if (typeof customerCloseModal === 'function') { customerCloseModal(); return; }
  window.PCUI?.closeDialog();
  setTimeout(() => modalFocus?.isConnected && modalFocus.focus(), drawerMotionTime()+16);
}

window.PCBusinessReady = true;
