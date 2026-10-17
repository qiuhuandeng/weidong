(function(){
'use strict';
// This frontend is a product walkthrough. Keep the rule engine for the visible
// recommendations, but let one visitor demonstrate every business action.
const C=CM,E=CMEngine,base={...E},H=C.h;
C.demoMode=true;C.allowed=()=>true;E.auth=()=>true;E.can=()=>true;
const actor=(s,id='ops')=>s.actors[id];
const sample=()=>[{name:'演示核验记录.txt',type:'text/plain',text:'示例材料：客户已确认档案与业务归属，可直接体验后续功能。'}];
function approve(s,c){
 if(c.status==='已完成')return c;
 if(!c.approved){c.status='待审批';c.approvalStage=c.approvalStage||0;while(!c.approved)base.approveCorrection(s,c.id,actor(s,c.approvalPath[c.approvalStage]),'功能演示：审批通过');}
 if(!c.newId){const m=s.merges.find(x=>x.id===c.mergeId),n={...E.copy(m.snapshot.b),id:'CUS-'+c.id,identities:[],status:'纠错产生',mergedInto:null,version:1};s.customers.push(n);c.newId=n.id;}
 c.paused=false;c.exception=null;return c;
}
function stage(s,id,step){const c=approve(s,E.ticket(s,id));if(c.status!=='已完成'){c.status='处理中';c.step=step;}return c;}
function process(s,id,kind){const c=stage(s,id,5);if(c.status==='已完成')return [];
 for(const i of c.items.filter(i=>!i.done&&(i.kind===kind||kind==='transfer'&&i.kind==='manual'))){const to=i.destination==='main'?'main':'new';base.classify(s,id,i.id,to,i.note||'按示例方案确认归属',actor(s));i.confirmed=true;i.retried=true;if(i.recordId){const o=s.orders.find(x=>x.id===i.recordId);if(o?.customerId===c.newId)i.done=true;}}
 c.financialApproved=true;if(c.supplementPath)c.supplementStage=c.supplementPath.length;
 return c.items.some(i=>i.kind===kind&&!i.done&&i.confirmed)?base.executeItems(s,id,kind,actor(s)):[];
}
function allData(s,id){const c=stage(s,id,5);if(c.status==='已完成')return c;process(s,id,'transfer');process(s,id,'finance');c.balanceMismatch=false;if(c.ledgerExpectedBalance!=null&&E.customer(s,c.main).balance<0)E.customer(s,c.main).balance=0;c.step=6;return c;}
E.createRequest=(s,data)=>{const existing=s.requests.find(r=>r.status==='待审核'&&[r.a,r.b].includes(data.a)&&[r.a,r.b].includes(data.b));return existing||base.createRequest(s,{...data,reason:data.reason||'示例：同一客户重复建档',evidence:data.evidence?.length?data.evidence:sample()},actor(s));};
E.merge=(s,id,options={})=>{const r=s.requests.find(x=>x.id===id);if(r.mergeId)return s.merges.find(x=>x.id===r.mergeId);const ev=base.evaluate(s,r.a,r.b,r.ruleSnapshot);r.status='待审核';r.financeChecked=true;const fields={...Object.fromEntries(ev.conflicts.map(x=>[x.key,x.a])),...options.fields},actions=E.copy(options.actions||ev.actions);let activeKept=false;for(const x of actions){const o=s.orders.find(o=>o.id===x.id);if(E.arrived(o))x.action='保留';if(E.active(o)&&x.action!=='合并预约流退'){if(activeKept)x.action='合并预约流退';activeKept=true;}}const excluded=s.exclusions.filter(x=>x.active&&[x.a,x.b].includes(r.a)&&[x.a,x.b].includes(r.b));excluded.forEach(x=>x.active=false);return base.merge(s,id,{...options,automatic:false,fields,actions,reviewNote:options.reviewNote||'功能演示：采用已展示的处置方案'},actor(s));};
E.createCorrection=(s,data)=>{const old=s.corrections.find(c=>c.mergeId===data.mergeId);if(old)return old;const m=s.merges.find(x=>x.id===data.mergeId),at=m.at,status=m.status;m.at=new Date(Date.now()-7*86400000).toISOString();m.status='已生效';try{return base.createCorrection(s,{...data,description:data.description||'示例：核对并分离错误合并的数据',evidence:data.evidence?.length?data.evidence:sample()},actor(s));}finally{m.at=at;m.status=status;}};
E.approveCorrection=(s,id)=>approve(s,E.ticket(s,id));
E.confirmSnapshot=(s,id,fields)=>{const c=stage(s,id,4);if(c.status==='已完成')return c;return base.confirmSnapshot(s,id,{...fields,name:fields.name||E.customer(s,c.newId).name},actor(s));};
E.classify=(s,id,itemId,to,note)=>{const c=stage(s,id,5),i=c.items.find(x=>x.id===itemId);if(i.done)return i;return base.classify(s,id,itemId,to,note||'按示例方案确认归属',actor(s));};
E.executeItems=(s,id,kind)=>process(s,id,kind);
E.advanceData=(s,id)=>allData(s,id);
E.restoreIdentity=(s,id,selected=[])=>{const c=allData(s,id);if(c.status==='已完成')return c;const m=s.merges.find(x=>x.id===c.mergeId),main=E.customer(s,c.main),n=E.customer(s,c.newId),ids=selected.length?selected:m.snapshot.b.identities.map(i=>i.id);for(const i of m.snapshot.b.identities.filter(x=>ids.includes(x.id))){main.identities=main.identities.filter(x=>x.id!==i.id);if(!n.identities.some(x=>x.id===i.id))n.identities.push({...E.copy(i),owner:n.id});}if(!main.identities.length)main.identities=E.copy(m.snapshot.a.identities);if(!n.identities.length)n.identities=E.copy(m.snapshot.b.identities).map(i=>({...i,owner:n.id}));c.identityDone=true;c.step=7;c.version++;E.log(s,actor(s),'演示识别维度拆回',id,main.id,n.id);return c;};
E.validateCorrection=(s,id)=>{const c=E.restoreIdentity(s,id);if(c.status==='已完成')return c;c.step=7;c.status='处理中';c.balanceMismatch=false;return base.validateCorrection(s,id,actor(s));};
E.confirmAdjustment=(s,id)=>{let c=E.ticket(s,id);if(c.status==='已完成')return c;if(!c.validated||c.status!=='待确认')E.validateCorrection(s,id);if(!c.financeConfirmed)base.confirmAdjustment(s,id,actor(s,'finance'));for(const store of c.storeIds.length>1?c.storeIds:[]){if(c.status!=='已完成'&&!c.storeConfirmed.includes(store))base.confirmAdjustment(s,id,{...actor(s,'manager'),store,name:H.store(store)+'（演示确认）'});}return c;};
E.financialApproval=(s,id)=>{const c=stage(s,id,5);c.financialApproved=true;c.supplementStage=c.supplementPath?.length||1;c.version++;E.log(s,actor(s),'演示冲销方案确认',id,'待确认','已确认');};
E.changeAmount=(s,id,itemId,amount,note)=>{const c=stage(s,id,5),i=c.items.find(x=>x.id===itemId);if(!Number.isFinite(amount))amount=i.amount;i.amount=amount;i.note=note||'示例金额调整';c.financialApproved=true;c.version++;E.log(s,actor(s),'调整演示金额',id,i.originalAmount,amount);};
E.exclude=(s,a,b,reason)=>base.exclude(s,a,b,reason||'示例：已核实为独立客户',actor(s));
E.reject=(s,type,id,reason)=>{const r=type==='request'?s.requests.find(x=>x.id===id):E.ticket(s,id);if(!r)return; r.status='已驳回';r.rejection=reason||'示例：材料需进一步核对';r.version++;E.log(s,actor(s),'驳回申请',id,'待审核',r.rejection);};
E.transferTask=(s,type,id,to,reason)=>{const r=type==='request'?s.requests.find(x=>x.id===id):E.ticket(s,id);r.assignee=to;r.version++;E.log(s,actor(s),'转交处理',id,'',s.actors[to].name+'：'+(reason||'示例转交'));};
E.setException=(s,id,data)=>base.setException(s,id,{...data,note:data.note||'示例补充说明',evidence:data.evidence||'示例：已核对材料与业务记录'},actor(s));
E.publish=(s,data)=>{const next={...E.copy(data),version:s.rules.version+1,status:'已发布',effectiveAt:new Date().toISOString(),updatedBy:'功能演示'};s.versions.unshift({version:next.version,at:next.effectiveAt,by:next.updatedBy,summary:'发布演示配置',config:E.copy(next)});s.rules=next;s.ruleDraft=null;E.log(s,actor(s),'发布规则版本','RULE-001','v'+(next.version-1),'v'+next.version);return next;};
E.undo=(s,id)=>{const m=s.merges.find(x=>x.id===id);if(m.status==='已撤销')return m;const reason=base.undoReason(s,m);if(reason){m.status='已撤销';m.version++;E.log(s,actor(s),'演示撤销结果',id,reason,'已撤销（预览结果）');return m;}return base.undo(s,id,actor(s));};

// Show editable examples rather than requiring the reviewer to manufacture data.
function defaults(){
 const examples={reason:'示例：客户档案需核对归属',description:'示例：两次建档造成业务归属混淆，核对后进行纠正。',expected:'分离相关订单与身份信息，保留原始业务记录。',note:'示例：已按客户说明核对当前方案。',opinion:'示例：同意按当前方案继续处理。',reviewNote:'示例：已核对客户身份与订单处置。',voucher:'DEMO-20261015-001',evidence:'示例：业务凭证与回访记录核对完成。',name:'演示记录',phone:'13800138000',amount:'100',deposit:'0',project:'护理服务',at:new Date().toISOString().slice(0,16),scheduledAt:new Date().toISOString().slice(0,16)};
 document.querySelectorAll('#main-form,#dialog-form,#review-form,#simulation-form').forEach(f=>{for(const el of f.querySelectorAll('input,textarea,select')){if(el.readOnly||el.type==='file'||el.type==='checkbox'||el.type==='radio')continue;if(!el.value.trim()&&examples[el.name])el.value=examples[el.name];if(el.tagName==='SELECT'&&!el.value){const option=[...el.options].find(x=>x.value);if(option)el.value=option.value;}}const a=f.querySelector('[name=a]'),b=f.querySelector('[name=b]');if(a&&b&&a.value===b.value)b.value=[...b.options].find(o=>o.value&&o.value!==a.value)?.value||b.value;});
 if(document.querySelector('#main-form [data-upload]')&&!C.files.length){C.files=sample();document.querySelectorAll('[data-file-list]').forEach(x=>x.innerHTML=H.files(C.files,'form'));}
 document.querySelectorAll('form').forEach(f=>{f.noValidate=true;f.querySelectorAll('[required]').forEach(x=>x.removeAttribute('required'));f.querySelectorAll('.required').forEach(x=>x.classList.remove('required'));});
}
const render=C.render;C.render=()=>{render();defaults();};const modal=C.modal;C.modal=(...args)=>{modal(...args);defaults();};
// Fill at submission too: clearing an example must never turn into a required-field gate.
const readForm=C.readForm;C.readForm=(id='main-form')=>{if(!['identity-form','filter-form'].includes(id))defaults();return readForm(id);};
const handlers=C.handlers;
handlers['approve-ticket']=d=>C.tx(s=>d.finance?E.financialApproval(s,d.id):E.approveCorrection(s,d.id),'审批演示已完成',()=>C.go(d.finance?'P-EC-05':'P-EC-04',d.id));
handlers['request-submit']=()=>{const f=C.readForm();C.pendingSubmission={...f,evidence:C.files.length?E.copy(C.files):sample()};C.open('U-12',{action:'submit-request',title:'提交合并申请',description:'按当前示例档案提交，继续体验审核与合并。'});};
handlers['correction-submit']=()=>{const f=C.readForm();C.pendingCorrection={...f,evidence:C.files.length?E.copy(C.files):sample()};C.open('U-12',{action:'submit-correction',title:'提交纠错申请',description:'提交后进入纠错流程；已有工单时直接继续已有工单。'});};
handlers['submit-correction']=()=>C.tx(s=>E.createCorrection(s,C.pendingCorrection),'已进入纠错工单',c=>C.go(C.port==='store'?'M-EC-03':c.step===3?'P-EC-03':'P-EC-09',c.id));
handlers['save-fields']=d=>{const r=C.state.requests.find(x=>x.id===d.id),ev=E.evaluate(C.state,r.a,r.b,r.ruleSnapshot);C.ui().fields={...Object.fromEntries(ev.conflicts.map(x=>[x.key,x.a])),...C.readForm('dialog-form')};C.close();C.render();};
handlers['selected-next']=()=>{let ids=C.ui().selected||[];ids=[...new Set([...ids,...C.state.customers.filter(x=>x.status!=='已合并-从属').map(x=>x.id)])].slice(0,2);C.forms['M-MG-03']={a:ids[0],b:ids[1]};C.go('M-MG-03');};
handlers['manual-complete']=d=>{const f=C.readForm('dialog-form');return C.tx(s=>{const m=s.manual.find(x=>x.id===d.manualId);m.opsDone=true;m.financeDone=true;m.status='已完成';m.result=f.voucher+' · '+f.note;m.version++;E.log(s,actor(s),'调账登记完成',m.id,'待调账',m.result);},'调账流程已完成');};
handlers['supplement-order']=d=>{const f=C.readForm('dialog-form');return C.tx(s=>{const c=stage(s,d.id,5),o=s.orders.find(x=>x.id===f.orderId)||s.orders.find(x=>x.mergeId===c.mergeId&&x.mergeReturn)||s.orders.find(x=>x.customerId===c.main);const old=s.orders.find(x=>x.replacementFor===o.id);if(old)return old;const n={...E.copy(o),id:E.nextId(s,'ORD-EC-',s.orders),customerId:f.customerId||c.newId,originalCustomerId:f.customerId||c.newId,project:f.project||o.project,status:'待排客',deposit:0,paidAt:null,arrived:false,mergeReturn:false,cancelledSchedule:false,replacementFor:o.id,correctionId:c.id,version:1,createdAt:new Date().toISOString()};s.orders.push(n);c.items.push({id:'IT-'+n.id,type:'纠错补录订单',label:n.id+' · '+n.project,kind:'transfer',destination:n.customerId===c.newId?'new':'main',confirmed:true,done:true,source:'纠错补录'});E.log(s,actor(s),'创建纠错补录订单',c.id,o.id,n.id);return n;},'补录订单已就绪，可继续体验');};
handlers['confirm-adjustment']=d=>C.tx(s=>E.confirmAdjustment(s,d.id),'纠错流程已完成');
handlers['publish-rules']=()=>C.tx(s=>E.publish(s,C.ruleDraft()),'规则已发布',()=>{C.ruleWorking=null;C.go('P-RC-04');});
handlers['manual-approve']=d=>C.tx(s=>{const m=s.manual.find(x=>x.id===d.id);m.opsDone=true;m.financeDone=true;m.status='待调账';m.version++;E.log(s,actor(s),'调账审核演示完成',m.id,'待审核','待调账');},'审批已完成，可继续登记结果');
handlers['execute-merge']=d=>{const r=C.state.requests.find(x=>x.id===d.id),u=C.ui();return C.tx(s=>E.merge(s,r.id,{main:u.main,fields:u.fields,actions:u.actions,reviewNote:u.reviewNote}),'合并已完成',m=>C.go(C.port==='pc'?'P-MR-02':'M-HI-02',m.id));};
C.dialogs['U-17']=d=>C.modal('确认调整结果',H.hint('确认后展示财务及相关门店已确认的结果，完成本次纠错流程。')+H.kv({'工单':H.esc(d.id)}),H.btn('返回查看','close')+H.btn('确认本次调整','confirm-adjustment',d,'primary'),'','U-17');
C.dialogs['U-11']=d=>C.modal('撤销合并演示',H.hint('预览撤销后的状态与记录。冷静期及后续业务规则在原型中作为说明展示，不阻挡体验。'),H.btn('返回','close')+H.btn('确认撤销本次合并','undo-merge',d,'primary'),'','U-11');
})();
