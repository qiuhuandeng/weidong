(function(root){
'use strict';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let active=null,sequence=0;
function render({name,labels,selected=[],exclusive=false,title='处理方式'}){
 const id='method-select-'+(++sequence);
 return `<div class="method-select" data-method-select data-exclusive="${exclusive}" data-title="${esc(title)}"><button type="button" class="method-select-trigger" aria-label="${esc(title)}，可多选${selected.length?'，已选'+esc(selected.map(key=>labels[key]).join('、')):''}" aria-haspopup="dialog" aria-expanded="false" aria-controls="${id}"><span data-method-selection>${summary(labels,selected)}</span><span class="method-select-chevron" aria-hidden="true"></span></button><div hidden>${Object.entries(labels).map(([value,label])=>`<input type="checkbox" name="${esc(name)}" value="${esc(value)}" data-label="${esc(label)}" ${selected.includes(value)?'checked':''}>`).join('')}</div></div>`;
}
function summary(labels,selected){return selected.length?selected.map(key=>`<span class="method-select-tag">${esc(labels[key])}</span>`).join(''):'<span class="method-select-placeholder">请选择处理方式</span><span class="method-select-hint">可多选</span>';}
function commit(state){
 const {widget,trigger,selected,labels}=state;if(!widget.isConnected)return;
 const form=widget.closest('form'),name=widget.querySelector('input').name;
 widget.querySelectorAll('input').forEach(input=>input.checked=selected.includes(input.value));
 widget.querySelector('[data-method-selection]').innerHTML=summary(labels,selected);
 trigger.setAttribute('aria-label',widget.dataset.title+'，可多选'+(selected.length?'，已选'+selected.map(key=>labels[key]).join('、'):''));
 widget.dispatchEvent(new CustomEvent('methodselectchange',{bubbles:true,detail:{values:[...selected]}}));
 // Condition fields may redraw synchronously; keep this open menu attached to the replacement control.
 if(!widget.isConnected&&form?.isConnected){const replacement=[...form.querySelectorAll('[data-method-select]')].find(el=>el.querySelector('input')?.name===name);if(replacement){state.widget=replacement;state.trigger=replacement.querySelector('button');}}
}
function position(state){
 const {trigger,overlay}=state,menu=overlay.querySelector('section'),box=trigger.getBoundingClientRect(),width=Math.min(Math.max(box.width,260),innerWidth-24);
 menu.id=trigger.getAttribute('aria-controls');menu.style.width=width+'px';menu.style.left=Math.max(12,Math.min(box.left,innerWidth-width-12))+'px';menu.style.top=Math.max(12,Math.min(box.bottom+6,innerHeight-menu.offsetHeight-12))+'px';trigger.setAttribute('aria-expanded','true');
}
function close(apply=false,returnFocus=true){
 if(!active)return;const state=active;active=null;
 if(state.owner)state.owner.inert=false;state.overlay.remove();state.trigger.setAttribute('aria-expanded','false');
 if(apply)commit(state);
 if(returnFocus&&state.trigger.isConnected)state.trigger.focus();
}
function open(widget){
 close();const trigger=widget.querySelector('button'),inputs=[...widget.querySelectorAll('input')],labels=Object.fromEntries(inputs.map(input=>[input.value,input.dataset.label])),selected=inputs.filter(input=>input.checked).map(input=>input.value),mobile=document.body.classList.contains('is-mobile'),overlay=document.createElement('div');
 overlay.className='method-select-overlay '+(mobile?'method-select-mobile':'method-select-desktop');
 overlay.innerHTML=`<section class="method-select-menu" id="${trigger.getAttribute('aria-controls')}" role="dialog" ${mobile?'aria-modal="true"':''} aria-label="${esc(widget.dataset.title)}"><header><strong>${esc(widget.dataset.title)}</strong><span>可多选</span></header><div class="method-select-list" role="listbox" aria-label="${esc(widget.dataset.title)}" aria-multiselectable="true">${Object.entries(labels).map(([key,label])=>`<button type="button" role="option" data-method-value="${key}" aria-selected="${selected.includes(key)}"><span>${esc(label)}</span><span class="method-select-check" aria-hidden="true">✓</span></button>`).join('')}</div>${mobile?'<footer><button type="button" data-method-cancel>取消</button><button type="button" data-method-apply>确定</button></footer>':''}</section>`;
 document.body.appendChild(overlay);const owner=widget.closest('.mobile-action-page');active={widget,trigger,overlay,selected,labels,owner,mobile};if(owner)owner.inert=true;trigger.setAttribute('aria-expanded','true');
 const menu=overlay.querySelector('section');if(!mobile)position(active);
 overlay.addEventListener('click',event=>{
  event.stopPropagation();if(!active)return;const option=event.target.closest('[data-method-value]');
  if(option){const key=option.dataset.methodValue,has=active.selected.includes(key);active.selected=has?active.selected.filter(k=>k!==key):[...active.selected,key];if(!has&&active.widget.dataset.exclusive==='true')active.selected=key==='service'?['service']:active.selected.filter(k=>k!=='service');active.selected=Object.keys(labels).filter(key=>active.selected.includes(key));overlay.querySelectorAll('[data-method-value]').forEach(button=>button.setAttribute('aria-selected',active.selected.includes(button.dataset.methodValue)));
   if(!mobile){commit(active);if(!active.widget.isConnected){close(false,false);return;}position(active);option.focus();}
  }else if(event.target.closest('[data-method-apply]'))close(true);else if(event.target===overlay||event.target.closest('[data-method-cancel]'))close();
 });
 (menu.querySelector('[aria-selected="true"]')||menu.querySelector('[role="option"]')).focus();
}
document.addEventListener('pointerdown',event=>{if(active&&!active.mobile&&!active.overlay.contains(event.target)&&!active.trigger.contains(event.target))close(false,false);},true);
document.addEventListener('click',event=>{const button=event.target.closest('.method-select-trigger');if(button){event.preventDefault();const widget=button.closest('[data-method-select]');if(active?.widget===widget)close();else open(widget);}});
document.addEventListener('keydown',event=>{
 if(!active)return;
 if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return;}
 if(!active.overlay.contains(event.target))return;
 if(event.key==='Tab'&&!active.mobile){close();return;}
 event.stopPropagation();const options=[...active.overlay.querySelectorAll('[role="option"]')],index=options.indexOf(document.activeElement);
 if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();options[event.key==='Home'?0:event.key==='End'?options.length-1:(index+(event.key==='ArrowDown'?1:-1)+options.length)%options.length].focus();}
 if(event.key==='Tab'){const buttons=[...active.overlay.querySelectorAll('button')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
},true);
root.addEventListener('hashchange',()=>close());root.addEventListener('resize',()=>close());
root.MethodSelect={render,close};
})(window);
