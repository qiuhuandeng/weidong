(function(root){
'use strict';
const M=root.AIGrading,Store=root.CaseStore,$=s=>document.querySelector(s),copy=x=>JSON.parse(JSON.stringify(x));
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=['','一级','二级','三级','四级','五级'];
let draft=null,context=null,dialog=null,lastFocus=null;
function reset(){draft=null;context=null;}
function render(state,ctx){
 context=ctx;if(!dialog)draft=M.get(state);
 return `<section class="panel ai-grading-page"><div class="panel-head"><div><h3>定级标准</h3><p class="small muted">配置一级至五级的判断条件，关键词用于辅助识别。</p></div></div><div class="table-wrap"><table class="ai-grading-table"><thead><tr><th>客诉等级</th><th>等级名称</th><th>定级条件</th><th>识别关键词</th><th>排除条件</th><th>操作</th></tr></thead><tbody>${draft.levels.map(row=>`<tr><td><span class="badge ${row.level===5?'red':'blue'}">${names[row.level]}</span></td><td>${esc(row.name)}</td><td>${esc(row.criteria)}</td><td>${esc(row.keywords)||'—'}</td><td>${esc(row.exclusions)||'—'}</td><td><button type="button" class="btn quiet compact blue" data-ai-action="edit" data-level="${row.level}" aria-label="编辑${names[row.level]}定级标准">编辑</button></td></tr>`).join('')}</tbody></table></div></section>`;
}
function open(level){
 if(context?.actorId!=='manager')return;const row=draft.levels.find(x=>x.level===level);if(!row)return;
 dialog={row:copy(row),version:draft.version,saving:false};lastFocus=document.activeElement;
 $('#modal-root').innerHTML=`<div class="overlay"><section class="drawer ai-grading-drawer" role="dialog" aria-modal="true" aria-labelledby="ai-grading-title"><header class="drawer-head"><h2 id="ai-grading-title">${names[level]} · 定级标准</h2><button type="button" class="close" data-ai-action="close" aria-label="关闭定级标准">×</button></header><form id="ai-level-form" novalidate><div class="drawer-scroll"><div id="ai-level-error" class="form-error callout error" role="alert"></div><div class="ai-grading-fields"><label class="rule-field"><span>客诉等级</span><input value="${names[level]}" disabled></label><label class="rule-field"><span>等级名称 <span class="red">*</span></span><input name="name" aria-label="等级名称" maxlength="20" value="${esc(row.name)}" required></label><label class="rule-field"><span>定级条件 <span class="red">*</span></span><textarea name="criteria" aria-label="定级条件" maxlength="1000" rows="5" required>${esc(row.criteria)}</textarea><small class="muted">描述客户诉求、严重程度及适用情形。</small></label><label class="rule-field"><span>识别关键词</span><textarea name="keywords" aria-label="识别关键词" maxlength="500" rows="3" placeholder="多个关键词用逗号或换行分隔">${esc(row.keywords)}</textarea></label><label class="rule-field"><span>排除条件</span><textarea name="exclusions" aria-label="排除条件" maxlength="500" rows="3" placeholder="填写不应判入该等级的情形">${esc(row.exclusions)}</textarea></label></div></div><footer class="form-actions"><button type="button" class="btn" data-ai-action="close">取消</button><button type="submit" class="btn primary">保存</button></footer></form></section></div>`;
 document.body.style.overflow='hidden';$('#ai-level-form [name=name]').focus();
}
function close(force=false){if(dialog?.saving&&!force)return;dialog=null;$('#modal-root').innerHTML='';document.body.style.overflow='';lastFocus?.focus();}
function refresh(){context?.refresh();}
function error(id,message){$(id).textContent=message;$(id).scrollIntoView({block:'nearest'});}
document.addEventListener('click',e=>{const b=e.target.closest('[data-ai-action]');if(!b)return;if(b.dataset.aiAction==='edit')open(Number(b.dataset.level));if(b.dataset.aiAction==='close')close();});
document.addEventListener('submit',async e=>{
 const form=e.target;if(form.id!=='ai-level-form')return;e.preventDefault();
 const editing=dialog;if(!editing||editing.saving)return;
 const fields=Object.fromEntries(new FormData(form)),updated=copy(draft),index=updated.levels.findIndex(x=>x.level===editing.row.level);
 updated.levels[index]={...editing.row,...fields};const submit=form.querySelector('[type=submit]');submit.disabled=true;editing.saving=true;
 try{await Store.exclusive(()=>{const fresh=Store.load(),next=M.save(fresh,context.actorId,updated,editing.version);Store.save(next);draft=M.get(next);});close(true);refresh();context.toast('定级标准已保存');}
 catch(err){error('#ai-level-error',err.message);}finally{editing.saving=false;if(submit.isConnected)submit.disabled=false;}
});
document.addEventListener('keydown',e=>{if(!dialog)return;if(e.key==='Escape'){close();return;}if(e.key==='Tab'){const els=[...document.querySelectorAll('.ai-grading-drawer button,.ai-grading-drawer input,.ai-grading-drawer textarea')].filter(x=>!x.disabled),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
root.AIGradingView={render,reset,isDirty:()=>!!dialog};
})(window);
