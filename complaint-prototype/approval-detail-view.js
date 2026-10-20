/* Shared, read-only approval summary and DingTalk-style approval progress. */
(function(root){
'use strict';
const Templates=typeof module!=='undefined'&&module.exports?require('./approval-templates.js'):root.ApprovalTemplates;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=v=>v?new Date(v).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).replaceAll('/','-'):'—';
const money=v=>'¥'+Number(v||0).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
const statusNames={running:'审批中',approved:'已通过',refused:'已拒绝',terminated:'已撤销',failed:'发起失败',uncertain:'状态待确认'};
const displayFields={
 payment:['category','related','ticket','reason','classification','project-category','responsibility','services','deposit-date','visit-date','purchased-products','instruction','total','expense','amount-words','invoice','store','account','images','department'],
 purchase:['store','reason','application-type','products','quantity','customer','member','instruction','images','department']
};
const legacyFields={'PROC-COMPLAINT-PAYMENT':['total','refund','compensation','customer','store','plan','reason'],'PROC-COMPLAINT-PURCHASE':['exchange-total','customer','store','products','reason']};
function coreFields(snapshot,template){const fields=snapshot?.fields||[],type=fields.some(f=>f.id==='classification')?'payment':fields.some(f=>f.id==='application-type')?'purchase':'',ids=displayFields[type]||legacyFields[template?.processCode];return ids?ids.map(id=>fields.find(f=>f.id===id)).filter(Boolean):fields;}
const imageSource=file=>/^data:image\/(?:png|jpe?g|gif|webp|svg\+xml)[;,]/i.test(file?.data||'')?file.data:'';

function fieldValue(f){if(['file','image'].includes(f.type))return (Array.isArray(f.value)?f.value:[]).map(x=>x.name||'附件').join('、')||'—';return f.value==null||f.value===''?'—':f.type==='money'?money(f.value):String(f.value);}
function attachmentMarkup(f){const files=Array.isArray(f.value)?f.value:[];return files.length?`<div class="ad-files ${f.type==='image'?'ad-images':''}">${files.map(file=>{const src=f.type==='image'&&imageSource(file);return src?`<button type="button" class="ad-image-button" data-ad-image="${esc(src)}" data-ad-name="${esc(file.name||'图片')}" aria-label="查看图片 ${esc(file.name||'图片')}"><img src="${esc(src)}" alt="${esc(file.name||'图片')}"></button>`:`<span>${esc(file.name||'附件')}</span>`;}).join('')}</div>`:`<span class="ad-empty">${f.id==='invoice'?'未上传':'—'}</span>`;}
function linkedApproval(f,interactive){const item=f.value;if(!item||typeof item!=='object')return '—';const content=`<span>${esc(item.name||'关联审批')}</span><small class="ad-related-status ${esc(item.status||'')}">${esc(statusNames[item.status]||item.status||'')}</small>`;return interactive&&item.id?`<button type="button" class="ad-related" data-approval-action="record" data-action="externalApproval" data-id="${esc(item.id)}">${content}<span aria-hidden="true">›</span></button>`:`<div class="ad-related">${content}</div>`;}
function fieldsMarkup(fields,{interactive=false,highlightAmount=false}={}){
 const products=fields.find(f=>f.id==='products'&&f.type!=='table'),quantity=fields.find(f=>f.id==='quantity'),paired=products&&quantity;
 const row=f=>{
  if(highlightAmount&&f.id==='total')return `<div class="ad-wide ad-payment-highlight"><dt>${esc(f.label)}</dt><dd>${esc(fieldValue(f))}</dd></div>`;
  if(paired&&f===quantity)return '';
  if(paired&&f===products){const names=String(products.value||'').split('\n'),counts=String(quantity.value||'').split('\n');return `<div class="ad-wide ad-gift-field"><dt class="visually-hidden">${esc(products.label)}与${esc(quantity.label)}</dt><dd class="ad-gift-table"><div class="ad-gift-head"><span>${esc(products.label)}</span><span>${esc(quantity.label)}</span></div>${names.map((name,index)=>`<div class="ad-gift-row"><span>${esc(name||'—')}</span><b>${esc(counts[index]||'—')}</b></div>`).join('')}</dd></div>`;}
  return `<div class="ad-field ${['textarea','table','file','image','note','approval'].includes(f.type)?'ad-wide':''} ${f.type==='note'?'ad-note':''}"><dt>${esc(f.label)}</dt><dd>${f.type==='approval'?linkedApproval(f,interactive):f.type==='table'?tableSummary(f):['file','image'].includes(f.type)?attachmentMarkup(f):esc(fieldValue(f))}</dd></div>`;
 };return fields.map(row).join('');
}
function formFields(snapshot,{showEmpty=false}={}){const fields=(snapshot?.fields||[]).filter(f=>showEmpty||f.value!==''&&f.value!=null&&(!Array.isArray(f.value)||f.value.length));return `<dl class="ad-fields ad-reference-fields">${fieldsMarkup(fields)}</dl>`;}
function summary(snapshot,template,{detailLink=''}={}){
 const fields=coreFields(snapshot,template),amount=fields.find(f=>['total','exchange-total'].includes(f.id)&&f.type==='money'),reference=(snapshot?.fields||[]).some(f=>['classification','application-type'].includes(f.id));
 if(reference)return `<dl class="ad-fields ad-reference-fields">${fieldsMarkup(fields,{interactive:true,highlightAmount:true})}</dl>${detailLink?`<div class="ad-detail-link">${detailLink}</div>`:''}`;
 const breakdown=amount?.id==='total'?fields.filter(f=>['refund','compensation'].includes(f.id)&&Number(f.value)>0):[];
 return `${amount?`<div class="ad-amount"><span>${esc(amount.label)}</span><strong>${esc(fieldValue(amount))}</strong>${breakdown.length?`<div class="ad-breakdown">${breakdown.map(f=>`<span>${esc(f.label)} ${esc(fieldValue(f))}</span>`).join('')}</div>`:''}</div>`:''}<dl class="ad-fields ${reference?'ad-reference-fields':''}">${fieldsMarkup(fields.filter(f=>f!==amount&&!breakdown.includes(f)&&!(amount?.id==='total'&&['refund','compensation'].includes(f.id))))}</dl>${detailLink?`<div class="ad-detail-link">${detailLink}</div>`:''}`;
}
function tableSummary(f){
 if(!f.rows?.length)return '—';
 const product=f.id==='products';
 return `<div class="ad-products">${f.rows.map(row=>{if(product){const title=row.find(c=>c.id==='product'),qty=row.find(c=>c.id==='quantity');return `<div><span>${esc(title?fieldValue(title):'—')}</span>${qty?`<b>× ${esc(fieldValue(qty))}</b>`:''}</div>`;}return `<div class="ad-generic-row">${row.map(c=>`<span>${esc(c.label)}：${esc(fieldValue(c))}</span>`).join('')}</div>`;}).join('')}</div>`;
}
function duration(ms){const min=Math.max(1,Math.floor(Math.max(0,ms)/60000)),hours=Math.floor(min/60);return hours?hours+'小时'+(min%60?min%60+'分钟':''):min+'分钟';}
function processSteps(r){
 const events=[...(r.events||[])].sort((a,b)=>(a.at||0)-(b.at||0));
 const steps=[{kind:'start',title:'发起申请',actor:r.initiator||'—',status:r.status==='failed'?'未发起':'已提交',at:r.at}];
 let waitingSince=r.at;
 for(const e of events){
  const title=e.title||'';
  if(e.status==='审批中'){waitingSince=e.at||waitingSince;continue;}
  if(/发起|同步/.test(title))continue;
  const last=e.at===r.finishedAt&&['approved','refused','terminated'].includes(r.status);
  if(last||/^(已通过|已拒绝|已撤销|审批通过|审批拒绝|审批撤销)$/.test(title))continue;
  const outcome=e.result==='agree'||/同意/.test(title)?'已同意':e.result==='refuse'||/拒绝|驳回/.test(title)?'已拒绝':e.type==='transfer'||/转交/.test(title)?'已转交':'';
  if(!outcome)continue;
  const nodeTitle=e.nodeTitle||title.replace(/同意|拒绝|驳回|转交/,'审批').replace(/审批人审批/,'审批');
  steps.push({kind:outcome==='已拒绝'?'refused':'done',title:nodeTitle||'审批',actor:e.actor||'—',status:outcome,at:e.at,note:e.note||''});
  waitingSince=Math.max(waitingSince||0,e.at||0);
 }
 if(r.status==='running'){
  steps.push({kind:'current',title:r.currentTaskName||r.name||'审批',people:r.people||[],status:r.people?.length?'审批中':'待分配审批人',since:r.currentTaskStartedAt||waitingSince||r.at});
 }else if(['failed','uncertain'].includes(r.status)){
  steps.push({kind:r.status,title:r.status==='failed'?'发起审批':'确认审批状态',actor:'系统',status:statusNames[r.status],note:r.error||'',at:null});
 }else if(['approved','refused','terminated'].includes(r.status)){
  const last=events.findLast(e=>e.at===r.finishedAt)||events.at(-1),person=last?.actor;
  steps.push({kind:r.status,title:r.status==='terminated'?'撤销审批':'审批结果',actor:person&&person!=='钉钉'&&person!=='系统'?person:'',status:statusNames[r.status],at:r.finishedAt,note:r.reason||last?.note||''});
 }
 return steps;
}
function process(r,t,{now=Date.now()}={}){
 const current=t?.approval?.recordId===r.id,deadline=current&&r.status==='running'?t.taskDeadline:null;
 return `<ol class="ad-process">${processSteps(r).map(step=>{
  const live=step.kind==='current',people=live?step.people:step.actor?[step.actor]:[],mark=live?'◷':step.kind==='refused'||step.kind==='failed'?'!':step.kind==='uncertain'?'…':step.kind==='terminated'?'−':'✓';
  const time=live?`<span class="ad-wait">已等待 ${duration(now-step.since)}</span>${deadline?`<span class="ad-deadline ${deadline<now?'overdue':''}">${deadline<now?'审批已超时 '+duration(now-deadline):'审批剩余 '+duration(deadline-now)}</span>`:''}`:step.at?`<time>${date(step.at)}</time>`:'';
  return `<li class="ad-step ${step.kind}" ${live?'aria-current="step"':''}><span class="ad-step-dot" aria-hidden="true">${mark}</span><div class="ad-step-content"><div class="ad-step-heading"><strong>${esc(step.title)}</strong><span class="ad-step-status">${esc(step.status)}</span></div>${people.length?`<div class="ad-people">${people.map(person=>`<span class="ad-person"><span class="ad-avatar" aria-hidden="true">${esc(Array.from(person).slice(0,1).join(''))}</span><span>${esc(person)}</span></span>`).join('')}</div>`:''}${time?`<div class="ad-step-time">${time}</div>`:''}${step.note?`<p class="ad-step-note">${esc(step.note)}</p>`:''}</div></li>`;
 }).join('')}</ol>`;
}
function detail(r,t,{detailLink='',controls='',now=Date.now(),state}={}){
 const snapshot=Templates.detailSnapshot(r,t,state);

 return `<div class="approval-detail-view"><section class="ad-application"><div class="ad-heading"><h3>${esc(r.templateName||r.name)}</h3><span class="ad-badge ${esc(r.status)}">${esc(statusNames[r.status]||r.status)}</span></div>${summary(snapshot,r.templateSnapshot||r,{detailLink})}</section><section class="ad-progress"><div class="ad-section-heading"><h3>审批过程</h3>${r.syncStatus==='pending'?'<span class="ad-sync">状态待同步</span>':''}</div>${process(r,t,{now})}</section>${controls?`<div class="ad-controls">${controls}</div>`:''}</div>`;
}
if(typeof document!=='undefined')document.addEventListener('click',event=>{
 const button=event.target.closest('[data-ad-image]');if(!button)return;
 const dialog=document.createElement('dialog');dialog.className='ad-image-dialog';dialog.setAttribute('aria-label',button.dataset.adName||'审批图片');dialog.innerHTML=`<button type="button" class="ad-image-close" aria-label="关闭图片">×</button><img src="${esc(button.dataset.adImage)}" alt="${esc(button.dataset.adName||'审批图片')}"><p>${esc(button.dataset.adName||'')}</p>`;document.body.appendChild(dialog);
 dialog.addEventListener('keydown',e=>{if(e.key==='Escape')e.stopPropagation();});dialog.addEventListener('click',e=>{if(e.target===dialog||e.target.closest('.ad-image-close'))dialog.close();});dialog.addEventListener('close',()=>{dialog.remove();button.focus();});dialog.showModal();
});
const API={coreFields,formFields,summary,processSteps,process,detail};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ApprovalDetailView=API;
})(typeof window!=='undefined'?window:globalThis);
