(function(root){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=n=>'¥'+(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2}),time=n=>new Date(n).toLocaleString('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replaceAll('/','-');
const tabs=[['orders','订单记录'],['payments','支付记录'],['images','影像资料'],['visits','回访记录']],button=(label,act,id='',cls='')=>`<button type="button" data-crm="${act}" data-id="${esc(id)}" class="${cls}">${label}</button>`;
let ctx=null,view=null,lastContext=null,gallery=null;
const el=selector=>view?.surface.querySelector(selector),order=id=>view.profile.orders.find(o=>o.id===id),empty=message=>`<div class="crm-empty"><span aria-hidden="true">—</span><p>${message}</p></div>`;
const related=o=>o.id===ctx.ticket.order?'<span class="crm-linked">本工单关联</span>':'';
function orders(rows){
 const detail=o=>`<div class="crm-order-items">${o.items.map(x=>`<div><strong>${esc(x.name)}</strong><span>购买 ${x.quantity} · 已使用 ${x.used} · 剩余 ${x.remaining}</span><b>${money(x.paid)}</b></div>`).join('')}</div>`;
 if(ctx.mobile)return rows.map(o=>`<article class="crm-order-card"><div class="crm-card-top"><span>${esc(o.number)}</span><span class="crm-state">${esc(o.status)}</span></div>${related(o)}<h3>${esc(o.project)}</h3><p class="crm-muted">${time(o.at)} · ${esc(o.store)}</p><div class="crm-order-amount"><span>实付金额</span><strong>${money(o.paid)}</strong></div><details data-crm-order="${esc(o.id)}"><summary>项目明细<span>⌄</span></summary>${detail(o)}</details></article>`).join('');
 return `<div class="crm-table-wrap"><table class="crm-table"><thead><tr><th>订单 / 项目</th><th>下单时间</th><th>门店</th><th class="numeric">实付金额</th><th>状态</th><th></th></tr></thead><tbody>${rows.map(o=>`<tr><td><strong>${esc(o.project)}</strong><span class="crm-muted">${esc(o.number)}</span>${related(o)}</td><td>${time(o.at)}</td><td>${esc(o.store)}</td><td class="numeric"><strong>${money(o.paid)}</strong></td><td><span class="crm-state">${esc(o.status)}</span></td><td>${button('展开','order',o.id,'link crm-expand')}</td></tr><tr class="crm-order-expanded" data-crm-order="${esc(o.id)}" hidden><td colspan="6">${detail(o)}</td></tr>`).join('')}</tbody></table></div>`;
}
function payments(rows){
 if(ctx.mobile)return rows.map(r=>`<article class="crm-payment-card"><div class="crm-card-top"><strong class="crm-transaction-amount">${r.type==='退款'?'-':''}${money(r.amount)}</strong><span class="crm-state">${esc(r.status)}</span></div><div class="crm-payment-method">${esc(r.type)} · ${esc(r.method)}</div><p class="crm-muted">${time(r.at)}</p><p class="crm-payment-order">${esc(order(r.orderId)?.project||'')}<span>${esc(order(r.orderId)?.number||'')}</span></p><details><summary>交易明细<span>⌄</span></summary><dl class="crm-key-values"><dt>交易流水号</dt><dd>${esc(r.reference)}</dd><dt>收款门店</dt><dd>${esc(r.store)}</dd><dt>经办人</dt><dd>${esc(r.operator)}</dd></dl></details></article>`).join('');
 return `<div class="crm-table-wrap"><table class="crm-table crm-payments-table"><thead><tr><th>支付时间 / 流水号</th><th>关联订单</th><th>类型 / 方式</th><th class="numeric">金额</th><th>状态</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${time(r.at)}<span class="crm-muted crm-break">${esc(r.reference)}</span></td><td>${esc(order(r.orderId)?.project||'')}<span class="crm-muted">${esc(order(r.orderId)?.number||'')}</span><span class="crm-muted">${esc(r.store)} · ${esc(r.operator)}</span></td><td>${esc(r.type)}<span class="crm-muted">${esc(r.method)}</span></td><td class="numeric"><strong>${r.type==='退款'?'-':''}${money(r.amount)}</strong></td><td><span class="crm-state">${esc(r.status)}</span></td></tr>`).join('')}</tbody></table></div>`;
}
function images(rows){
 const groups=new Map();for(const row of rows){const key=row.orderId+'|'+time(row.at).slice(0,10);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
 return [...groups.values()].map(group=>`<section class="crm-image-group"><header><div><h3>${esc(group[0].project)}</h3><span>${esc(order(group[0].orderId)?.number||'')} · ${esc(group[0].store)}</span></div><time>${time(group[0].at).slice(0,10)}</time></header><div class="crm-image-grid">${group.map(r=>`<button type="button" class="crm-photo" data-crm="photo" data-id="${esc(r.id)}" aria-label="查看${esc(r.label)}照片"><span class="crm-photo-frame"><img src="${esc(r.src)}" alt="${esc(r.stage+' · '+r.label)}" loading="lazy"><span class="crm-photo-stage">${esc(r.stage)}</span></span><strong>${esc(r.label)}</strong><small>${esc(r.by)} · ${time(r.at).slice(11)}</small></button>`).join('')}</div></section>`).join('');
}
function visits(rows){return `<ol class="crm-visits">${rows.map(r=>`<li><div class="crm-visit-heading"><strong>${esc(r.method)}回访</strong><span class="crm-state ${r.result==='未接通'?'is-waiting':''}">${esc(r.result)}</span><time>${time(r.at)}</time></div><p class="crm-visit-person">${esc(r.staff)} · ${esc(order(r.orderId)?.project||'')}</p><p class="crm-visit-body">${esc(r.content)}</p><div class="crm-visit-meta"><span>${esc(order(r.orderId)?.number||'')}</span>${r.nextAt?`<span>下次回访 ${time(r.nextAt)}</span>`:''}</div></li>`).join('')}</ol>`;}
function content(){
 const p=view.profile;
 if(p.status==='unlinked')return empty('尚未关联 CRM 客户');
 if(p.status==='error')return `<div class="crm-empty"><span aria-hidden="true">!</span><p>客户资料加载失败</p>${button('重新加载','retry','','primary')}</div>`;
 const rows=CRMProfiles.records(p,view.tab);
 if(!rows.length)return empty(({orders:'暂无订单记录',payments:'暂无支付记录',images:'暂无影像资料',visits:'暂无回访记录'})[view.tab]);
 return ({orders,payments,images,visits})[view.tab](rows);
}
function paint(){
 const p=view.profile,t=ctx.ticket,ready=p.status==='ready',summary=p.status==='unlinked'?t:p;
 view.surface.innerHTML=`<header class="crm-header">${button('‹ '+(ctx.mobile?'返回':'返回工单'),'back','','crm-back')}<h2>客户资料</h2>${ctx.mobile?'<span></span>':button('×','dismiss','','crm-dismiss')}</header><div class="crm-scroll"><section class="crm-customer-summary"><div><h3>${esc(summary.name)}</h3><span>${esc(summary.phone||'—')}</span><span>会员号 ${esc(summary.member||'—')}</span><span>${esc(summary.store||'—')}</span></div><small>CRM${ready?' · 更新于 '+time(p.updatedAt):''}</small></section>${p.status==='unlinked'?'':`<nav class="crm-tabs" role="tablist" aria-label="客户资料分类">${tabs.map(([id,label])=>`<button type="button" data-crm="tab" data-id="${id}" id="crm-tab-${id}" role="tab" aria-selected="${view.tab===id}" aria-controls="crm-content" tabindex="${view.tab===id?0:-1}">${label}</button>`).join('')}</nav>`}<div class="crm-main"><section id="crm-content" role="tabpanel" aria-labelledby="crm-tab-${view.tab}" tabindex="0">${content()}</section></div></div>`;
 el('.crm-dismiss')?.setAttribute('aria-label','关闭客户资料');
}
function open(options,{push=true}={}){
 if(view)dismiss();ctx=options;lastContext=options;
 const surface=ctx.mobile?document.createElement('section'):document.querySelector('#drawer-root .ticket-drawer');if(!surface)return;
 const saved={fragment:document.createDocumentFragment(),className:surface.className,label:surface.getAttribute('aria-label'),scroll:surface.querySelector('.pc-detail-layout')?.scrollTop||0,windowY:scrollY,overflow:document.body.style.overflow,focus:document.activeElement,appInert:document.querySelector('#app').inert};
 if(!ctx.mobile)while(surface.firstChild)saved.fragment.append(surface.firstChild);
 surface.classList.add('crm-customer-view');surface.classList.toggle('crm-mobile',ctx.mobile);surface.setAttribute('aria-label','客户资料');
 if(ctx.mobile){surface.id='crm-customer-root';surface.setAttribute('role','region');const backdrop=document.createElement('div');backdrop.className='crm-mobile-surface';backdrop.append(surface);document.body.append(backdrop);document.body.style.overflow='hidden';document.querySelector('#app').inert=true;}
 view={surface,saved,profile:CRMProfiles.read(ctx.state,ctx.ticket),tab:'orders',token:'crm-'+Date.now()};
 if(push)history.pushState({...history.state,crmProfile:view.token},'',location.href);else view.token=history.state.crmProfile;
 paint();el('.crm-back').focus({preventScroll:true});
}
function dismiss({restore=true}={}){
 if(!view)return;closeGallery(false);const {surface,saved}=view,mobile=ctx.mobile;
 if(history.state?.crmProfile===view.token){const next={...history.state};delete next.crmProfile;delete next.crmPhoto;history.replaceState(next,'',location.href);}
 if(mobile){surface.parentElement.remove();document.body.style.overflow=saved.overflow;document.querySelector('#app').inert=saved.appInert;window.scrollTo(0,saved.windowY);}
 else {surface.replaceChildren(saved.fragment);surface.className=saved.className;surface.setAttribute('aria-label',saved.label);surface.querySelector('.pc-detail-layout').scrollTop=saved.scroll;}
 view=null;const callback=ctx.onReturn;ctx=null;if(restore){saved.focus?.focus({preventScroll:true});callback?.();}
}
function back(){if(history.state?.crmProfile===view?.token)history.back();else dismiss();}
function photoPaint(){
 const photo=gallery.rows[gallery.index];gallery.scale=1;gallery.x=gallery.y=0;
 gallery.root.innerHTML=`<header><div><strong>${esc(photo.stage+' · '+photo.label)}</strong><span>${time(photo.at)} · ${esc(photo.by)}</span></div>${button('×','photoClose','','crm-lightbox-close')}</header><div class="crm-photo-viewport"><img src="${esc(photo.src)}" alt="${esc(photo.stage+' · '+photo.label)}" draggable="false"></div><footer>${button('‹','photoPrevious','','crm-photo-nav')}<span>${gallery.index+1} / ${gallery.rows.length}</span>${button('›','photoNext','','crm-photo-nav')}<i></i>${button('−','zoomOut')}${button('100%','zoomReset')}${button('+','zoomIn')}</footer>`;
 gallery.root.querySelector('[data-crm=photoClose]').setAttribute('aria-label','关闭照片');gallery.root.querySelector('[data-crm=photoPrevious]').setAttribute('aria-label','上一张照片');gallery.root.querySelector('[data-crm=photoNext]').setAttribute('aria-label','下一张照片');gallery.root.querySelector('[data-crm=zoomIn]').setAttribute('aria-label','放大照片');gallery.root.querySelector('[data-crm=zoomOut]').setAttribute('aria-label','缩小照片');
 for(const [action,disabled] of [['photoPrevious',gallery.index===0],['photoNext',gallery.index===gallery.rows.length-1]])gallery.root.querySelector('[data-crm='+action+']').disabled=disabled;
 const image=gallery.root.querySelector('img');image.addEventListener('error',()=>{image.replaceWith(Object.assign(document.createElement('p'),{className:'crm-photo-error',textContent:'照片暂无法加载'}));});
}
function showPhoto(id){
 const rows=CRMProfiles.records(view.profile,'images'),index=rows.findIndex(x=>x.id===id);if(index<0)return;
 const box=document.createElement('section');box.className='crm-lightbox'+(ctx.mobile?' crm-mobile-lightbox':'');box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','影像照片');document.body.append(box);gallery={root:box,rows,index,focus:document.activeElement,pointers:new Map()};view.surface.inert=true;
 history.pushState({...history.state,crmPhoto:true},'',location.href);photoPaint();box.querySelector('button').focus();
}
function closeGallery(pop=true){if(!gallery)return;if(pop&&history.state?.crmPhoto){history.back();return;}const focus=gallery.focus;gallery.root.remove();gallery=null;if(view)view.surface.inert=false;focus?.focus({preventScroll:true});}
function movePhoto(delta){const next=gallery.index+delta;if(next<0||next>=gallery.rows.length)return;gallery.index=next;photoPaint();}
function transform(scale){if(!gallery)return;gallery.scale=Math.min(4,Math.max(1,scale));if(gallery.scale===1)gallery.x=gallery.y=0;const img=gallery.root.querySelector('img');if(img)img.style.transform=`translate(${gallery.x}px,${gallery.y}px) scale(${gallery.scale})`;gallery.root.querySelector('[data-crm=zoomReset]').textContent=Math.round(gallery.scale*100)+'%';}
document.addEventListener('click',event=>{
 const b=event.target.closest('[data-crm]');if(!b||!view)return;event.preventDefault();const act=b.dataset.crm,id=b.dataset.id;
 if(act==='back')return back();if(act==='dismiss')return back();if(act==='photoClose')return closeGallery();if(act==='photoPrevious')return movePhoto(-1);if(act==='photoNext')return movePhoto(1);if(act==='zoomIn')return transform(gallery.scale+.5);if(act==='zoomOut')return transform(gallery.scale-.5);if(act==='zoomReset')return transform(1);if(act==='photo')return showPhoto(id);
 if(act==='tab'){view.tab=id;paint();el('#crm-tab-'+id).focus({preventScroll:true});return;}
 if(act==='order'){const row=[...view.surface.querySelectorAll('[data-crm-order]')].find(e=>e.dataset.crmOrder===id);row.hidden=!row.hidden;b.textContent=row.hidden?'展开':'收起';b.setAttribute('aria-expanded',String(!row.hidden));return;}
 if(act==='retry'){view.profile=CRMProfiles.read(ctx.state,ctx.ticket,{retry:true});paint();}
});
window.addEventListener('popstate',()=>{if(!view){if(history.state?.crmProfile&&lastContext)open(lastContext,{push:false});return;}if(history.state?.crmProfile!==view.token)return dismiss();if(gallery&&!history.state?.crmPhoto)closeGallery(false);});
document.addEventListener('keydown',event=>{
 if(!view)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();gallery?closeGallery():back();return;}
 if(gallery&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();movePhoto(event.key==='ArrowLeft'?-1:1);return;}
 if(event.target.matches('.crm-tabs [role=tab]')){const keys=tabs.map(x=>x[0]),index=keys.indexOf(view.tab),next=({ArrowRight:keys[(index+1)%4],ArrowLeft:keys[(index+3)%4],Home:'orders',End:'visits'})[event.key];if(next){event.preventDefault();event.stopImmediatePropagation();view.tab=next;paint();el('#crm-tab-'+next).focus();}}
 if(event.key==='Tab'){event.stopImmediatePropagation();const container=gallery?.root||view.surface,items=[...container.querySelectorAll('button:not(:disabled),input,select,summary,[tabindex="0"]')].filter(e=>e.offsetParent!==null),first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}
},true);
document.addEventListener('wheel',event=>{if(!gallery||!event.target.closest('.crm-photo-viewport'))return;event.preventDefault();transform(gallery.scale+(event.deltaY<0?.15:-.15));},{passive:false});
document.addEventListener('pointerdown',event=>{if(!gallery||!event.target.closest('.crm-photo-viewport'))return;event.preventDefault();event.target.setPointerCapture?.(event.pointerId);gallery.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});gallery.start={x:event.clientX,y:event.clientY};if(gallery.pointers.size===2){const[a,b]=[...gallery.pointers.values()];gallery.pinch={distance:Math.hypot(a.x-b.x,a.y-b.y),scale:gallery.scale};}});
document.addEventListener('pointermove',event=>{if(!gallery?.pointers.has(event.pointerId))return;const old=gallery.pointers.get(event.pointerId);gallery.pointers.set(event.pointerId,{x:event.clientX,y:event.clientY});if(gallery.pointers.size===2&&gallery.pinch){const[a,b]=[...gallery.pointers.values()];transform(gallery.pinch.scale*Math.hypot(a.x-b.x,a.y-b.y)/gallery.pinch.distance);}else if(gallery.scale>1){gallery.x+=event.clientX-old.x;gallery.y+=event.clientY-old.y;transform(gallery.scale);}});
for(const type of ['pointerup','pointercancel'])document.addEventListener(type,event=>{if(!gallery?.pointers.has(event.pointerId))return;const dx=event.clientX-gallery.start.x,dy=event.clientY-gallery.start.y,swipe=type==='pointerup'&&gallery.scale===1&&gallery.pointers.size===1&&!gallery.pinch;gallery.pointers.delete(event.pointerId);if(!gallery.pointers.size)gallery.pinch=null;if(swipe&&Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy))movePhoto(dx<0?1:-1);});
root.CRMCustomerView={open,dismiss,isOpen:()=>!!view,updateState:state=>{if(ctx)ctx.state=state;}};
})(window);
