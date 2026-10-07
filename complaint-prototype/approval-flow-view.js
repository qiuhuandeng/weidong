(function(root){
'use strict';
const E=root.CaseEngine,F=E.Rules.Flow,P=root.TicketFlowConfig,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const CARD_WIDTH=240,BRANCH_GAP=20;
let zoom=100,menu=null,canvasObserver=null,activeFlow=[],activePositions=[],terminalLanes=[],activeState=null;
function treeWidth(nodes,includeCompleted=false){return Math.max(CARD_WIDTH,...nodes.map(n=>n.type==='branch'?n.branches.filter(b=>includeCompleted||!ends(b.nodes)).reduce((sum,b)=>sum+treeWidth(b.nodes,includeCompleted)+BRANCH_GAP,0):CARD_WIDTH));}
function completionLanes(nodes){return nodes.flatMap(n=>n.type==='branch'?n.branches.flatMap(b=>ends(b.nodes)?[{id:b.id,width:treeWidth(b.nodes,true)+BRANCH_GAP}]:completionLanes(b.nodes)):[]);}
function layoutCompletionLanes(){
 const canvas=document.querySelector('.ac-flow-canvas');if(!canvas)return;
 const box=canvas.getBoundingClientRect(),scale=zoom/100;let offset=0;
 canvas.querySelectorAll('.ac-branches').forEach(el=>el.style.minHeight='');
 // Completed subtrees own persistent columns. Later tasks never occupy those columns.
 for(const lane of terminalLanes){const branch=canvas.querySelector('[data-branch-id="'+lane.id+'"]');if(!branch)continue;const parent=branch.parentElement.getBoundingClientRect();branch.classList.add('ac-completion-lane');branch.style.width=lane.width+'px';branch.style.left=(box.left-parent.left)/scale+offset+'px';offset+=lane.width;}
 [...canvas.querySelectorAll('.ac-branches')].reverse().forEach(group=>{
  const completed=[...group.children].filter(el=>el.classList.contains('ac-completion-lane'));
  if(completed.length)group.style.minHeight=Math.max(...completed.map(el=>el.getBoundingClientRect().height/scale))+'px';
 });
}
function fitCanvas(){const canvas=document.querySelector('.ac-flow-canvas');if(!canvas)return;const style=getComputedStyle(canvas),inset=parseFloat(style.paddingLeft)+parseFloat(style.paddingRight);canvas.style.width=treeWidth(activeFlow)+inset+'px';canvas.style.minWidth='0';}
function connectBranches(){
 const outlets=new Map(),scale=zoom/100;
 document.querySelectorAll('.ac-add[data-redundant]').forEach(el=>{el.hidden=false;delete el.dataset.redundant;});
 document.querySelectorAll('.ac-direct-outlet').forEach(el=>{el.classList.remove('ac-direct-outlet');el.style.removeProperty('--ac-outlet-x');});
 const align=(el,x)=>{el.classList.add('ac-direct-outlet');el.style.setProperty('--ac-outlet-x',(x-el.getBoundingClientRect().left)/scale+'px');};
 // Resolve nested exits first. A sole continuing path at a branch tail goes straight
 // to its parent's merge, rather than detouring through the nested group's center.
 [...document.querySelectorAll('.ac-branches')].reverse().forEach(branches=>{
  const svg=branches.querySelector(':scope > .ac-join-lines'),fork=branches.querySelector(':scope > .ac-fork-lines'),box=branches.getBoundingClientRect();if(!svg||!box.width)return;
  const children=[...branches.children].filter(b=>b.classList.contains('ac-branch'));
  fork.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
  fork.innerHTML=children.map(b=>{const r=b.querySelector(':scope > .ac-condition-card').getBoundingClientRect(),x=r.left+r.width/2-box.left,y=r.top-box.top;return `<path d="M${box.width/2} 0H${x}V${y}"/>`;}).join('');
  const continuing=[...branches.children].filter(b=>b.classList.contains('ac-branch')&&!b.classList.contains('ac-branch-terminal'));
  const xs=continuing.map(b=>{const footer=b.querySelector(':scope > .ac-branch-footer'),r=footer.getBoundingClientRect();return outlets.get(footer)??r.left+r.width/2;});
  const group=branches.parentElement,connector=group.nextElementSibling,footer=connector?.nextElementSibling;
  if(xs.length===1&&connector?.classList.contains('ac-connector')){const add=connector.querySelector('.ac-add');add.hidden=true;add.dataset.redundant='true';}
  const direct=xs.length===1&&group.parentElement.classList.contains('ac-branch')&&connector?.classList.contains('ac-connector')&&footer?.classList.contains('ac-branch-footer');
  svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
  if(direct){align(connector,xs[0]);align(footer,xs[0]);outlets.set(footer,xs[0]);svg.innerHTML='';}
  else svg.innerHTML=xs.map(x=>`<path d="M${x-box.left} ${box.height-1}H${box.width/2}"/>`).join('');
 });
}
function connectEndings(){
 const canvas=document.querySelector('.ac-flow-canvas'),svg=canvas?.querySelector(':scope > .ac-completion-lines'),join=canvas?.querySelector(':scope > .ac-final-merge');if(!svg||!join)return;
 const box=canvas.getBoundingClientRect(),target=join.getBoundingClientRect(),scale=zoom/100,endX=target.left+target.width/2-box.left,endY=target.top-box.top+8*scale;
 svg.setAttribute('viewBox',`0 0 ${box.width} ${box.height}`);
 // Every completed node drops vertically through its reserved column, joining
 // the other outcomes only immediately before the common finish node.
 svg.innerHTML=[...canvas.querySelectorAll('.ac-node-end')].map(node=>{
  const r=node.getBoundingClientRect(),x=r.left+r.width/2-box.left,y=r.bottom-box.top;
  return `<path data-terminal-node="${esc(node.dataset.nodeId)}" d="M${x} ${y}V${endY}H${endX}"/>`;
 }).join('');
}
function hasEnds(nodes){return nodes.some(n=>n.type==='end'||n.type==='branch'&&n.branches.some(b=>hasEnds(b.nodes)));}

function mount(){canvasObserver?.disconnect();const viewport=document.querySelector('.ac-flow');if(viewport){fitCanvas();layoutCompletionLanes();connectBranches();connectEndings();canvasObserver=new ResizeObserver(()=>{fitCanvas();layoutCompletionLanes();connectBranches();connectEndings();});canvasObserver.observe(viewport);}}

const options=(list,value)=>list.map(o=>{const [v,t]=Array.isArray(o)?o:[o,o];return `<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`;}).join('');
const field=(label,control)=>`<label class="field"><span class="field-title">${label}</span>${control}</label>`;
const select=(label,name,list,value)=>field(label,`<select name="${name}" aria-label="${label}">${options(list,value)}</select>`);
const input=(label,name,value,extra='')=>field(label,`<input name="${name}" aria-label="${label}" value="${esc(value)}" ${extra}>`);
const action=(name,attrs='')=>`data-flow-action="${name}" ${attrs}`;
function icon(label,name,attrs){const paths={编辑:'<path d="m10 3 3 3M3 10l7-7 3 3-7 7-4 1z"/><path d="M2 15h12"/>',复制:'<path d="M6 5V2h8v10h-3"/><rect x="2" y="5" width="9" height="10" rx="1"/>',删除:'<path d="m3 3 10 10M13 3 3 13"/>'};return `<button type="button" class="ac-node-icon" ${action(name,attrs)} aria-label="${label}" title="${label}"><svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round">${paths[label]}</svg></button>`;}
function connector(list,index){return `<div class="ac-connector"><button type="button" class="ac-add" ${action('add',`data-list="${list}" data-index="${index}"`)} aria-label="添加节点">+</button></div>`;}
const condText=b=>F.conditionSummary(b);
function ends(nodes){const n=nodes.at(-1);return n?.type==='end'||n?.type==='branch'&&n.branches.every(b=>ends(b.nodes));}
function fallbackText(group){
 const conditions=group.branches.filter(b=>!b.fallback),kind=conditions[0]?.judgeBy;
 if(!['source','storeResult'].includes(kind)||!conditions.every(b=>b.judgeBy===kind))return '未满足其他条件时，进入此流程';
 const labels=kind==='source'?F.ticketSources:F.storeResults,key=kind==='source'?'sources':'results';
 const remaining=Object.keys(labels).filter(v=>!conditions.some(b=>b[key]?.includes(v)));
 return remaining.length?F.conditionKinds[kind]+'为「'+remaining.map(v=>labels[v]).join('、')+'」':'未满足其他条件时，进入此流程';
}
function drawList(nodes,list,insideCompleted=false){return connector(list,0)+nodes.map((n,i)=>{
 const attrs=`data-list="${list}" data-id="${n.id}"`,next=list==='root'&&i===nodes.length-1?'':connector(list,i+1);
 if(n.type==='branch')return `<div class="ac-branch-group" data-node-id="${n.id}" style="--ac-branch-count:${Math.max(1,n.branches.filter(b=>insideCompleted||!ends(b.nodes)).length)}"><div class="ac-branch-group-head ac-forkbar"><button type="button" class="btn compact" ${action('branch-add',`data-id="${n.id}"`)}>添加条件</button></div><div class="ac-branches">${n.branches.map((b,j)=>`<div class="ac-branch ${ends(b.nodes)?'ac-branch-terminal':''} ${terminalLanes.some(lane=>lane.id===b.id)?'ac-completion-lane':''}" data-branch-id="${b.id}" style="min-width:${treeWidth(b.nodes,insideCompleted||ends(b.nodes))+BRANCH_GAP}px"><section class="ac-condition-card" data-condition-id="${b.id}"><div class="ac-condition-card-head"><span class="ac-node-heading">${esc(b.fallback?'默认条件':b.title)}${b.fallback?'':`<span class="ac-node-actions">${icon('编辑','condition',`data-group="${n.id}" data-id="${b.id}"`)}</span>`}</span><div class="ac-condition-card-actions"><span class="ac-condition-priority">优先级 ${j+1}</span>${b.fallback?'':`<span class="ac-node-actions">${icon('复制','condition-copy',`data-group="${n.id}" data-id="${b.id}"`)}${icon('删除','condition-delete',`data-group="${n.id}" data-id="${b.id}" data-list="${list}"`)}</span>`}</div></div>${b.fallback?`<div class="ac-branch-title ac-fallback" title="${esc(fallbackText(n))}"><span>${esc(fallbackText(n))}</span></div>`:`<button type="button" class="ac-branch-title" title="${esc(condText(b))}" ${action('condition',`data-group="${n.id}" data-id="${b.id}"`)}><span>${esc(condText(b))}</span><span class="ac-card-chevron">›</span></button>`}</section>${drawList(b.nodes,b.id,insideCompleted||ends(b.nodes))}<div class="ac-branch-footer"></div></div>`).join('')}<svg class="ac-fork-lines" aria-hidden="true"></svg><svg class="ac-join-lines" aria-hidden="true"></svg></div></div>`+(ends([n])?'':next);
 const locked=!!P&&list==='root'&&(n.kind==='sales'||n.kind==='close');
 if(n.type==='end')return `<div class="ac-node ac-node-end" data-node-id="${n.id}"><div class="ac-node-head"><span class="ac-node-heading">结案节点<span class="ac-node-actions">${icon('编辑','edit',attrs)}</span></span><span class="ac-node-actions">${icon('删除','delete',attrs)}</span></div><button type="button" class="ac-node-body" ${action('edit',attrs)}><span><strong title="${esc(n.title)}">${esc(n.title)}</strong><span class="ac-muted">工单已结案，流程结束</span></span><span class="ac-card-chevron">›</span></button></div>`;
 return `<div class="ac-node ac-node-${n.type}" data-node-id="${n.id}"><div class="ac-node-head"><span class="ac-node-heading">${n.type==='handling'?'办理节点':n.type==='cc'?'抄送节点':'审批节点'}<span class="ac-node-actions">${icon('编辑','edit',attrs)}</span></span><span class="ac-node-actions">${locked?'':icon('复制','copy',attrs)+icon('删除','delete',attrs)}</span></div><button type="button" class="ac-node-body" ${action('edit',attrs)}><span><strong title="${esc(n.title)}">${esc(n.title)}</strong><span class="ac-muted">${n.type==='approval'?esc((window.ApprovalTemplates.get(activeState,n.templateId)?.name||'待关联审批模板')+' · '+(n.handling?.hours||24)+' 小时'):esc(P?P.sourceLabel(n,activePositions):F.sourceLabel(n,activePositions))+(n.type==='handling'?' · '+n.hours+' 小时':'')}</span></span><span class="ac-card-chevron">›</span></button></div>`+next;
 }).join('');}
function canvas(d,state){activeState=state;activePositions=F.positions(state);activeFlow=P?P.list(d):d.config.approval.flow;terminalLanes=completionLanes(activeFlow);return `<section class="ac-flow-workspace"><div class="ac-flow-zoom" role="group" aria-label="流程缩放"><button type="button" ${action('zoom-out')} aria-label="缩小流程" ${zoom<=50?'disabled':''}>−</button><output data-flow-zoom>${zoom}%</output><button type="button" ${action('zoom-in')} aria-label="放大流程" ${zoom>=150?'disabled':''}>+</button></div><div class="ac-flow"><div class="ac-flow-canvas ${hasEnds(activeFlow)?'ac-has-terminal':''}" style="--ac-flow-scale:${zoom/100};--ac-terminal-space:${terminalLanes.reduce((sum,lane)=>sum+lane.width,0)}px"><div class="ac-flow-start" aria-label="工单创建">工单创建</div><div class="ac-grading-connector"></div><div class="ac-grading-node"><strong>AI 定级 · ${esc(F.complaintLevels[d.level])}</strong><small>匹配 ${esc(d.name)}</small></div>${drawList(activeFlow,'root')}<div class="ac-final-merge" aria-hidden="true"></div>${connector('root',activeFlow.length)}<div class="ac-flow-end">工单已结案</div><svg class="ac-completion-lines" aria-hidden="true"></svg></div></div></section>`;}
function layer(title,draw,onSave){
 const previous=document.activeElement,host=document.getElementById('modal-root');let changed=false;
 host.innerHTML=`<div class="overlay flow-overlay"><section class="drawer flow-drawer" role="dialog" aria-modal="true" aria-label="${title}"><header class="drawer-head"><h2>${title}</h2><button type="button" class="close" data-flow-close aria-label="关闭">×</button></header><div class="drawer-scroll"><div class="callout error form-error" data-flow-error role="alert"></div><form id="flow-drawer-form" novalidate></form></div><footer class="form-actions"><button type="button" class="btn" data-flow-close>${onSave?'取消':'关闭'}</button>${onSave?'<button type="button" class="btn primary" data-flow-save>确定</button>':''}</footer></section></div>`;
 const form=host.querySelector('form'),error=host.querySelector('[data-flow-error]');document.body.style.overflow='hidden';
 const close=force=>{host.innerHTML='';document.body.style.overflow='';document.removeEventListener('keydown',keys);previous?.focus();};
 const keys=e=>{if(e.key==='Escape'){e.preventDefault();close(false);}if(e.key==='Tab'){const els=[...host.querySelectorAll('button,input,select,textarea')].filter(el=>!el.disabled&&el.offsetParent!==null);if(e.shiftKey&&document.activeElement===els[0]){e.preventDefault();els.at(-1)?.focus();}else if(!e.shiftKey&&document.activeElement===els.at(-1)){e.preventDefault();els[0]?.focus();}}};document.addEventListener('keydown',keys);
 host.querySelectorAll('[data-flow-close]').forEach(b=>b.onclick=()=>close(false));
 for(const type of ['input','change'])form.addEventListener(type,e=>{changed=true;e.stopPropagation();});
 form.addEventListener('submit',e=>{e.preventDefault();e.stopPropagation();});
 const save=host.querySelector('[data-flow-save]');if(save)save.onclick=async()=>{try{save.disabled=true;await onSave(form);close(true);}catch(e){error.textContent=e.message;save.disabled=false;}};
 draw(form,()=>{changed=true;});form.querySelector('input,select,button')?.focus();return {form,close};
}
function nodeDrawer(original,onSave,list,index,state,draft){if(original.type==='approval')return approvalTemplateDrawer(original,onSave,index,state,draft);if(['end','handling'].includes(original.type))return handlingDrawer(original,onSave,list,index,state,draft);const n=F.clone(original);if(n.type==='approval')n.handling={hours:draft.config.timing.approvalHours,overdue:'supervisor',...n.handling};const org=F.organization(state),roles=F.positions(state),candidates=E.STAFF.filter(p=>org.appointments.some(a=>a.personId===p.id&&a.active)).map(p=>[p.id,p.name+' · '+p.role]);if(n.handling?.emptyAssigneeId&&!candidates.some(([id])=>id===n.handling.emptyAssigneeId))candidates.push([n.handling.emptyAssigneeId,'原承接人（已失效，请重新选择）']);if(n.source==='duty'){let members=[];try{members=F.resolveSource(org,n,{}).flat();}catch{}const match=roles.find(p=>members.length&&p.members.length===members.length&&p.members.every(id=>members.includes(id)));n.source='position';n.positionId=match?.id||'';}layer(n.type==='cc'?'设置抄送人':'设置审批人',(form)=>{
 const capture=()=>{for(const el of form.querySelectorAll('[name]')){if(el.name.startsWith('h.'))n.hierarchy[el.name.slice(2)]=el.name==='h.level'?Number(el.value):el.value;else if(el.name.startsWith('handling.'))n.handling[el.name.slice(9)]=el.name==='handling.hours'?(el.value===''?'':Number(el.value)):el.value;else if(el.name!=='position')n[el.name]=el.value;}if(n.source.endsWith('-continuous')){n.source=n.source.replace('-continuous','');n.hierarchy.mode='continuous';}};
 function draw(){const hierarchy=['department','manager'].includes(n.source),h=n.hierarchy||{base:'receptionist',mode:'single',origin:'bottom',level:1,empty:'block'};n.hierarchy=h;const src=hierarchy&&h.mode==='continuous'?n.source+'-continuous':n.source;
 form.innerHTML=`<section class="flow-drawer-section"><h3>节点设置</h3><div class="form-grid">${input('节点名称','title',n.title,'maxlength="40"')}${select(n.type==='cc'?'抄送人来源':'审批人来源','source',[...(n.source==='manager'?[['','请选择审批人来源']]:[]),['department','指定部门负责人'],['department-continuous','连续多级部门负责人'],['position','指定岗位']],src)}${n.source==='position'?select('选择岗位','positionId',[['','请选择岗位'],...roles.map(p=>[p.id,p.name]),...(n.positionId&&!roles.some(p=>p.id===n.positionId)?[[n.positionId,'原岗位已删除，请重新选择']]:[])],n.positionId||''):''}${hierarchy?`${select('从哪个节点开始','h.base',[['business','工单所属门店'],['receptionist','客户的接待老师'],['applicant','工单发起人任职部门']],h.base)}${select('层级计数方向','h.origin',[['bottom','从下至上'],['top','从上至下']],h.origin)}${select(h.mode==='continuous'?'逐级审批终点':'指定层级','h.level',Array.from({length:10},(_,i)=>[i+1,'第 '+(i+1)+' 级']),h.level)}${n.source==='department'&&n.type==='cc'?select('当前层级无负责人时','h.empty',[['block','暂停，交管理员处理'],['parent','向上查找有效负责人']],h.empty):''}`:''}</div></section>${n.type==='approval'?`<section class="flow-drawer-section"><h3>办理方式</h3>${select('同一节点有多位人员时','mode',Object.entries(F.modes),n.mode)}<div class="form-grid mt">${input('办理时效（小时）','handling.hours',n.handling.hours,'type="number" min="0.25" max="720" step="0.25" required')}${select('当前节点审批人为空时的承接人','handling.emptyAssigneeId',[['','暂停，交管理员处理'],...candidates],n.handling.emptyAssigneeId||'')}</div></section>`:''}`;}
 form.addEventListener('change',e=>{if(e.target.name==='source'){const value=e.target.value;capture();n.source=value.replace('-continuous','');n.hierarchy.mode=value.endsWith('-continuous')?'continuous':'single';draw();}});form.capture=capture;draw();
 },form=>{form.capture();if(n.source==='position'){const role=roles.find(p=>p.id===n.positionId);if(!role)throw Error('请选择岗位与人员中已创建的岗位');n.positionName=role.name;}P?P.validNode(n,state):F.validNode(n);onSave(n,index);});}
function approvalTemplateDrawer(original,onSave,index,state,draft){
 const T=window.ApprovalTemplates,n={id:original.id,type:'approval',provider:'dingtalk',title:original.title==='部门审核'?'':original.title,templateId:original.templateId||'',handling:{hours:original.handling?.hours??draft.config.timing.approvalHours??24}};
 const templates=T.list(state).filter(T.ready),missing=n.templateId&&!templates.some(t=>t.id===n.templateId);
 layer('设置审批节点',form=>{form.innerHTML=`<section class="approval-node-form"><div class="form-grid">${input('节点名称','title',n.title,'maxlength="40" placeholder="例如：付款审批" required')}${input('办理时效（小时）','hours',n.handling.hours,'type="number" min="0.25" max="720" step="0.25" required')}</div>${select('关联审批模板','templateId',[['','请选择审批模板'],...templates.map(t=>[t.id,t.name]),...(missing?[[n.templateId,'原模板已停用或配置异常']]:[])],n.templateId)}</section>`;},form=>{
  n.title=form.elements.title.value.trim();n.templateId=form.elements.templateId.value;n.handling.hours=form.elements.hours.value;
  T.validateNode(n,window.CaseStore.load());onSave(n,index);
 });
}
function handlingDrawer(original,onSave,list,index,state,draft){
 let n=F.clone(original);if(n.type==='handling')P.useRotation(n);const roles=F.positions(state),org=F.organization(state),people=E.STAFF.filter(p=>org.appointments.some(a=>a.personId===p.id&&a.active));
 const endpoint=n.type==='end'&&index!==undefined||!!n.entryRole&&index!==undefined||list===P.list(draft)&&(n.kind==='sales'||n.kind==='close');
 layer('设置办理节点',form=>{
  const capture=()=>{for(const el of form.querySelectorAll('[name]')){if(el.name.startsWith('actions.')){n.actions??={};n.actions[el.name.slice(8)]=el.checked;}else if(el.name!=='kind')n[el.name]=el.name==='hours'?(el.value===''?'':Number(el.value)):el.value;}if(n.type==='handling')P.useRotation(n);};
  function draw(){
   const type=P.handlingType(n,draft),typeOptions=Object.entries(P.handlingTypes).filter(([key])=>!endpoint||key===type);
   if(n.type==='end'){form.innerHTML=`<section class="flow-drawer-section"><h3>节点信息</h3><div class="form-grid">${input('节点名称','title',n.title,'maxlength="40"')}${select('办理类型','kind',typeOptions,type)}</div></section><section class="flow-drawer-section"><h3>结案设置</h3><p class="small muted mt">门店填写处理结果及结案说明后，工单直接结束。沿用门店首次办理时限，不进入后续售后、审批或付款节点。</p></section>`;return;}
   const isManager=type==='manager',isPay=n.kind==='payment',isProcurement=n.kind==='procurement',isClose=n.kind==='close',eligible=people.filter(p=>n.entryRole==='specialist'?p.role==='售后专员':n.entryRole==='manager'?p.role==='售后主管':isPay?p.role==='财务审核':isProcurement?p.role==='采购专员':true);
   const sources=n.kind==='store'?[['store','工单所属门店负责人'],['receptionist','客户的接待老师']]:[['position','按岗位分配'],['person','指定人员']];
   const position=roles.find(p=>p.id===n.positionId),ids=position?.members||[];
   form.innerHTML=`<section class="flow-drawer-section"><h3>节点信息</h3><div class="form-grid">${input('节点名称','title',n.title,'maxlength="40"')}${select('办理类型','kind',typeOptions,type)}</div><p class="small muted mt">${esc(n.entryRole==='store'?'门店先电话联系客户并填写跟进及处理结果；能解决则直接结案，未解决才进入售后。':P.descriptions[n.kind])}</p></section>${isClose?'':`<section class="flow-drawer-section"><h3>人员分配</h3><div class="form-grid">${isManager?'':select('办理人来源','source',sources,n.source)}${n.source==='position'?select('负责岗位','positionId',[['','请选择岗位'],...roles.filter(p=>p.members.length&&p.members.every(id=>eligible.some(person=>person.id===id))).map(p=>[p.id,p.name])],n.positionId):''}${n.source==='person'?select('指定办理人','personId',[['','请选择人员'],...eligible.map(p=>[p.id,p.name+' · '+p.role])],n.personId):''}${!isClose&&n.kind!=='store'?select('无人可分配时的承接人','fallbackId',[['','保留待分派，交经理处理'],...eligible.map(p=>[p.id,p.name+' · '+p.role])],n.fallbackId):''}</div>${n.source==='position'?`<div class="handling-candidates"><span class="small muted">岗位成员（按轮排顺序）</span><div>${ids.map(id=>`<span class="badge">${esc(E.STAFF.find(p=>p.id===id)?.name||id)}</span>`).join('')||'<span class="small muted">请先选择岗位</span>'}</div></div>`:''}</section>`}<section class="flow-drawer-section"><h3>办理时效</h3><div class="form-grid">${input('节点时限（小时）','hours',n.hours,'type="number" min="0.25" max="720" step="0.25" required')}</div><p class="small muted">节点任务到达时起算，完成本节点时结束；转交不重置期限。</p></section>${n.kind==='sales'&&!isManager?`<section class="flow-drawer-section"><h3>售后操作</h3><div class="handling-action-options">${[['transfer','允许同部门转交'],['suspend','允许挂起工单']].map(([key,title])=>`<label class="scene-check"><input type="checkbox" name="actions.${key}" ${n.actions?.[key]?'checked':''}>${title}</label>`).join('')}</div><p class="small muted mt">解决方案在线下确认后录入，提交即完成售后节点。门店首次办理由工单来源决定。</p></section>`:''}`;
  }
  form.addEventListener('change',e=>{const key=e.target.name;if(!['kind','source','positionId'].includes(key))return;capture();if(key==='kind'){const kind=e.target.value;n={...P.handlingNode(kind,state,draft),id:n.id};}if(key==='positionId'){n.members=[];n.allMembers=true;}draw();form.querySelector('[name="'+key+'"]')?.focus();});form.capture=capture;draw();
 },form=>{form.capture();if(n.entryRole)P.validEntryNode(n,state);else P.validNode(n,state);onSave(n,index);});
}
function conditionDrawer(original,onSave,group,siblings=group){
 const b=F.clone(original);b.planTypes??=[];b.conditions??=[];
 let judgeBy=b.judgeBy||'plan',selectedSources=[...(b.sources||[])],selectedResults=[...(b.results||[])],selectedTypes=[...b.planTypes],amountMatch=b.match||'all';
 const amountFields=()=>selectedTypes.length?F.allowedFields(selectedTypes).filter(key=>key!=='total'):[];
 let priority=Math.max(0,group?.branches.findIndex(x=>x.id===b.id)||0);
 // Do not silently discard older range/total conditions when opening their editor.
 let legacyAmounts=b.conditions.some((c,i)=>!amountFields().includes(c.field||'refund')||b.conditions.slice(0,i).some(other=>(other.field||'refund')===(c.field||'refund')));
 const oldSummary=F.conditionSummary(original),values={};
 const initialize=()=>{for(const key of ['refund','compensation']){const c=b.conditions.find(c=>(c.field||'refund')===key);values[key]={op:c?.op||'gte',value:c?.value??''};}};initialize();
 layer('设置条件分支',form=>{
   form.closest('.drawer').classList.add('condition-drawer');form.closest('.drawer').querySelector('[data-flow-save]').textContent='保存';
   const capture=()=>{
     b.title=form.elements.title.value;priority=Number(form.elements.priority?.value??priority);b.judgeBy=judgeBy;
     delete b.levels;delete b.sources;delete b.results;
     if(judgeBy!=='plan'){b[judgeBy==='source'?'sources':'results']=[...(judgeBy==='source'?selectedSources:selectedResults)];b.planTypes=[];b.conditions=[];b.match='all';return;}
     b.planTypes=[...selectedTypes];
     form.querySelectorAll('[data-amount-row]').forEach(row=>{values[row.dataset.amountRow]={op:row.querySelector('[data-amount-op]').value,value:row.querySelector('[data-amount-value]').value};});
     amountMatch=form.elements.match?.value||amountMatch;b.match=amountMatch;
     if(!legacyAmounts)b.conditions=amountFields().filter(key=>String(values[key].value).trim()!=='').map(key=>({field:key,...values[key]}));
   };
   const feedback=()=>{
     form.closest('.drawer').querySelector('[data-flow-error]').textContent='';
     const complete=amountFields().filter(key=>String(values[key].value).trim()!=='').length;
     const relation=form.querySelector('[data-amount-relation]');if(relation)relation.hidden=complete<2;
     const hasSelection=(judgeBy==='source'?selectedSources:judgeBy==='storeResult'?selectedResults:selectedTypes).length,selectionError='请至少选择一个'+F.conditionKinds[judgeBy];
     form.querySelector('[data-condition-summary]').textContent=hasSelection?F.conditionSummary(b)+'时，进入本分支。':selectionError+'。';
     const notice=form.querySelector('[data-condition-notice]');let message='',invalid=false;
     try{if(!hasSelection)throw Error(selectionError);if(judgeBy==='plan'&&legacyAmounts)throw Error('原金额条件无法直接编辑，请重新设置金额后保存。');F.validCondition(F.clone(b));const overlaps=(siblings?.branches||[]).filter(other=>!other.fallback&&other.id!==b.id&&F.conditionsOverlap(b,other));if(overlaps.length)message='与「'+overlaps.map(other=>other.title).join('、')+'」存在重叠，将按优先级命中第一条分支。';}catch(error){message=error.message;invalid=true;}
     notice.textContent=message;notice.hidden=!message;notice.classList.toggle('is-error',invalid);
   };
   function draw(){
     const fields=amountFields();
     form.innerHTML=`<section class="flow-drawer-section"><h3>基本信息</h3><div class="form-grid">${input('分支名称','title',b.title,'maxlength="40"')}${group?select('匹配优先级','priority',group.branches.filter(x=>!x.fallback).map((x,i)=>[i,'优先级 '+(i+1)]),priority):''}</div></section>
       <section class="flow-drawer-section"><h3 id="condition-judge-title">判断方式</h3><div class="condition-type-options" role="radiogroup" aria-labelledby="condition-judge-title">${Object.entries(F.conditionKinds).map(([value,label])=>`<label class="condition-type-option"><input type="radio" name="judgeBy" value="${value}" ${judgeBy===value?'checked':''}><span>${label}</span></label>`).join('')}</div></section>
       ${judgeBy!=='plan'?`<section class="flow-drawer-section"><h3>${F.conditionKinds[judgeBy]}</h3><p class="small muted mb">可多选，匹配任一所选项时进入本分支。</p><div class="condition-type-options" role="group" aria-label="${F.conditionKinds[judgeBy]}">${Object.entries(judgeBy==='source'?F.ticketSources:F.storeResults).map(([value,label])=>`<label class="condition-type-option"><input type="checkbox" name="conditionValue" value="${value}" data-condition-value ${ (judgeBy==='source'?selectedSources:selectedResults).includes(value)?'checked':''}><span>${label}</span></label>`).join('')}</div></section>`:
       `<section class="flow-drawer-section"><h3 id="condition-types-title">适用方案类型</h3><p class="small muted mb">可多选，匹配任一所选类型后，再判断金额条件。</p><div class="condition-type-options" role="group" aria-labelledby="condition-types-title">${Object.entries(F.planTypes).map(([value,label])=>`<label class="condition-type-option"><input type="checkbox" name="planType" value="${value}" data-plan-type="${value}" ${selectedTypes.includes(value)?'checked':''}><span>${label}</span></label>`).join('')}</div></section>`}
       ${judgeBy==='plan'&&legacyAmounts?`<section class="condition-legacy"><p>原条件：${esc(oldSummary)}</p><button type="button" class="btn quiet" data-reset-amounts>重新设置金额</button></section>`:''}
       ${judgeBy==='plan'&&fields.length&&!legacyAmounts?`<section class="flow-drawer-section"><div class="condition-section-heading"><h3>金额条件</h3><span>选填</span></div><p class="condition-help">金额不填则不限制，仅按方案类型匹配。</p>
       ${fields.map(key=>`<div class="condition-fixed-amount" data-amount-row="${key}"><label for="branch-amount-${key}">${F.amountFields[key]}</label><select data-amount-op aria-label="${F.amountFields[key]}比较方式">${options([['gt','大于'],['gte','大于等于'],['lt','小于'],['lte','小于等于'],['eq','等于']],values[key].op)}</select><div class="condition-amount"><input id="branch-amount-${key}" data-amount-value aria-label="${F.amountFields[key]}" type="number" min="0" max="1000000" step="0.01" inputmode="decimal" placeholder="不限金额" value="${esc(values[key].value)}"><span>元</span></div></div>`).join('')}
       ${fields.length===2?`<div data-amount-relation>${select('两项金额条件','match',[['all','同时满足'],['any','任一满足']],amountMatch)}</div>`:''}</section>`:''}
       <section class="condition-summary"><h3>条件摘要</h3><p data-condition-summary aria-live="polite"></p></section><p class="condition-notice" data-condition-notice role="status" hidden></p>`;
     capture();feedback();
   }
   form.addEventListener('input',e=>{if(!e.target.matches('[data-amount-value],[name=title]'))return;capture();feedback();});
   form.addEventListener('change',e=>{
     capture();if(e.target.name==='judgeBy'){judgeBy=e.target.value;draw();form.querySelector('[name=judgeBy][value="'+judgeBy+'"]')?.focus();}
     else if(e.target.hasAttribute('data-condition-value')){const selected=[...form.querySelectorAll('[data-condition-value]:checked')].map(el=>el.value);if(judgeBy==='source')selectedSources=selected;else selectedResults=selected;capture();feedback();}
     else if(e.target.hasAttribute('data-plan-type')){const changed=e.target.value;selectedTypes=[...form.querySelectorAll('[data-plan-type]:checked')].map(el=>el.value);legacyAmounts=false;for(const key of Object.keys(values))if(!amountFields().includes(key))values[key]={op:'gte',value:''};draw();form.querySelector('[data-plan-type="'+changed+'"]')?.focus();}else feedback();
   });
   form.addEventListener('click',e=>{if(!e.target.closest('[data-reset-amounts]'))return;capture();legacyAmounts=false;b.conditions=[];for(const key of Object.keys(values))values[key]={op:'gte',value:''};draw();form.querySelector('[data-amount-value]')?.focus();});
   form.capture=capture;draw();
 },form=>{form.capture();if(judgeBy==='plan'){if(!selectedTypes.length)throw Error('请至少选择一种方案类型');if(legacyAmounts)throw Error('请重新设置金额后保存');}F.validCondition(b);onSave(b,priority);});
}
function showMenu(button,fn){menu?.remove();menu=document.createElement('div');menu.className='flow-add-menu';menu.innerHTML=[...(P?[['handling','办理节点']]:[]),['approval','审批节点'],['branch','条件分支'],['cc','抄送节点']].map(([type,label])=>`<button type="button" data-kind="${type}"><span class="flow-kind ${type}">${type==='handling'?'▤':type==='approval'?'✓':type==='cc'?'↗':'⑂'}</span>${label}</button>`).join('');document.body.appendChild(menu);const box=button.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-(P?360:270),box.left-120))+'px';menu.style.top=Math.min(innerHeight-100,box.bottom+8)+'px';menu.onclick=e=>{const b=e.target.closest('[data-kind]');if(b){menu.remove();menu=null;fn(b.dataset.kind);}};const dismiss=e=>{if(menu&&!menu.contains(e.target)&&e.target!==button){menu.remove();menu=null;}document.removeEventListener('pointerdown',dismiss);};document.addEventListener('pointerdown',dismiss);}
function handle(button,ctx){const a=button.dataset.flowAction,{draft,state,change}=ctx,flow=draft&&(P?P.list(draft):draft.config.approval.flow);
 if(a.startsWith('zoom-')){zoom=Math.max(50,Math.min(150,zoom+(a==='zoom-in'?10:-10)));document.querySelector('.ac-flow-canvas').style.setProperty('--ac-flow-scale',zoom/100);document.querySelector('[data-flow-zoom]').textContent=zoom+'%';document.querySelector('[data-flow-action="zoom-in"]').disabled=zoom>=150;document.querySelector('[data-flow-action="zoom-out"]').disabled=zoom<=50;fitCanvas();layoutCompletionLanes();connectBranches();connectEndings();return;}
 const n=F.find(flow,button.dataset.id),list=F.getList(flow,button.dataset.list),index=list?.findIndex(x=>x.id===n?.id);
 const insert=made=>{list.splice(Number(button.dataset.index),0,made);change();};
 if(a==='add')return showMenu(button,type=>{if(type==='branch'){const fork=F.branch();conditionDrawer(fork.branches[0],b=>{fork.branches[0]=b;insert(fork);});}else nodeDrawer(type==='handling'?newHandlingNode(flow,list,Number(button.dataset.index),state,draft):F.node(type),insert,null,undefined,state,draft);});
 if(a==='edit'){const foundList=list||findNodeList(flow,n.id);nodeDrawer(n,(updated,position)=>{const old=foundList.indexOf(n);foundList.splice(old,1);foundList.splice(position,0,updated);change();},foundList,foundList.indexOf(n),state,draft);}
 if(a==='copy'){list.splice(index+1,0,F.duplicate(n));change();}
 if(a==='delete'){if(confirm('删除“'+n.title+'”节点？')){list.splice(index,1);change();}}
 if(a==='branch-add'){if(n.branches.length>=F.maxBranches)throw Error('每组最多8条条件（含默认条件）');conditionDrawer(F.condition(),b=>{n.branches.splice(n.branches.length-1,0,b);change();},null,n);}
 if(a==='condition'||a==='condition-copy'){const group=F.find(flow,button.dataset.group),copy=a==='condition-copy';if(copy&&group.branches.length>=F.maxBranches)throw Error('每组最多8条条件（含默认条件）');conditionDrawer(copy?F.duplicate(n):n,(b,priority)=>{if(!copy)group.branches.splice(group.branches.indexOf(n),1);group.branches.splice(Math.min(copy?group.branches.indexOf(n)+1:priority,group.branches.length-1),0,b);change();},copy?null:group,group);}
 if(a==='condition-delete'){const group=F.find(flow,button.dataset.group);if(group.branches.length===2){if(confirm('删除最后一个条件会同时删除整组分支及内部节点，确定删除吗？')){list.splice(list.indexOf(group),1);change();}}else if(confirm('删除本条件及内部节点？')){group.branches.splice(group.branches.indexOf(n),1);change();}}
}
function newHandlingNode(flow,list,index,state,draft){const sales=flow.findIndex(n=>n.kind==='sales'),before=list===flow?index<=sales:F.getList(flow.slice(0,sales),buttonListId(flow,list))===list;const n=P.handlingNode('store',state,draft);return before?{...n,entryRole:'store',source:'store',fallbackId:''}:n;}
function buttonListId(flow,list){for(const n of flow)if(n.type==='branch')for(const b of n.branches){if(b.nodes===list)return b.id;const found=buttonListId(b.nodes,list);if(found)return found;}return null;}
function findNodeList(flow,id){if(flow.some(n=>n.id===id))return flow;for(const n of flow)if(n.type==='branch')for(const b of n.branches){const list=findNodeList(b.nodes,id);if(list)return list;}return null;}
function people(state){const org=F.organization(state),name=id=>E.STAFF.find(p=>p.id===id)?.name||id;return `<div class="callout mb">审批职责从组织架构及岗位任职匹配。流程中选择职责或层级，实际人员在提交时确定。</div><section class="panel"><div class="table-wrap"><table class="scene-table"><thead><tr><th>公司</th><th>审批职责</th><th>组织部门 / 岗位</th><th>当前任职人员</th><th>操作</th></tr></thead><tbody>${org.arrangements.map(a=>`<tr><td>${esc(org.company.name)}</td><td>${esc(a.duty)}</td><td>${esc(org.departments.find(d=>d.id===a.departmentId)?.name)} / ${esc(a.position)}</td><td>${esc(a.members.filter(id=>org.appointments.some(j=>j.personId===id&&j.active)).map(name).join('、')||'暂无有效任职')}</td><td><button class="btn quiet compact blue" data-org-duty="${esc(a.duty)}">配置职责</button></td></tr>`).join('')}</tbody></table></div></section><section class="panel mt"><div class="panel-head"><h3>门店审批层级</h3></div><div class="panel-body"><p class="small muted mb">所有门店共用“当前门店 → 上级部门 → 公司”的规则，人员随组织任职匹配。</p>${org.departments.filter(d=>d.store).map(d=>{const path=[];let cur=d;const seen=new Set();while(cur&&!seen.has(cur.id)){seen.add(cur.id);path.push(cur.name+'（'+cur.leaders.map(name).join('、')+'）');cur=org.departments.find(x=>x.id===cur.parent);}return `<p class="org-path">${esc(path.join(' → '))}</p>`;}).join('')}</div></section>`;}
function dutyDrawer(state,duty,onSave){const org=F.organization(state),row=F.clone(org.arrangements.find(x=>x.duty===duty));layer('配置审批职责 · '+duty,form=>{
 function draw(){const jobs=org.appointments.filter(a=>a.active&&a.departmentId===row.departmentId),roles=[...new Set(jobs.map(a=>E.STAFF.find(p=>p.id===a.personId)?.role).filter(Boolean))];if(!roles.includes(row.position))row.position=roles[0]||'';row.members=jobs.filter(a=>E.STAFF.find(p=>p.id===a.personId)?.role===row.position).map(a=>a.personId);
 form.innerHTML=`<section class="flow-drawer-section"><h3>${esc(org.company.name)} · ${esc(duty)}</h3><div class="form-grid">${select('所属部门','departmentId',org.departments.map(d=>[d.id,d.name]),row.departmentId)}${select('任职岗位','position',roles,row.position)}</div><div class="callout mt">当前匹配：${esc(row.members.map(id=>E.STAFF.find(p=>p.id===id)?.name).join('、')||'暂无人员')}</div><p class="small muted mt">人员由所选部门与岗位的有效任职自动确定，无需逐个指定员工。</p></section>`;}
 form.addEventListener('change',e=>{row[e.target.name]=e.target.value;draw();});draw();
 },()=>{if(!row.members.length)throw Error('该部门岗位暂无有效任职人员');return onSave(row,org.version);});}
root.ApprovalFlowUI={canvas,handle,people,dutyDrawer,mount};
})(window);
