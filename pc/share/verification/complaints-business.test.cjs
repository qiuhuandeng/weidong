// Isolated business regression checks. No browser globals/data are modified.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname, '../pages/complaints/business.js'), 'utf8');
const storage = new Map();
const context = {URL, Date, Intl, console, icon:name=>`<svg aria-hidden="true" data-icon="${name}"></svg>`, btoa:s=>Buffer.from(s,'binary').toString('base64'),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  document:{addEventListener(){},getElementById(){return null}},
  PCUI:{registerPager(){},message(){}},window:{PCModules:{},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-solutions/index.js'),'utf8'),context);
const workflowCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8');
vm.runInNewContext(workflowCode,context);
function loadOptions(target){vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-intake/index.js'),'utf8'),target);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-order-linking/index.js'),'utf8'),target);vm.runInNewContext(workflowCode,target);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-fixtures/index.js'),'utf8'),target);for(const file of ['storage.js','index.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-options',file),'utf8'),target)}
loadOptions(context);
const followCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-follow/index.js'),'utf8');
vm.runInNewContext(followCode,context);
const processCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-detail/index.js'),'utf8');
vm.runInNewContext(processCode,context);
const hook = `window.testAPI={assessmentForm,responsibilityForm,assessmentValues,assessmentFields,syncResponsibility,inlineAssessmentForm,setEditor(value){main.editor=value},customerPage,createTicketState,createCustomerMatches,createCustomerOrders,setCreateCustomer,setCreateOrder,createTicketAssociation,createOrderTable,syncCreateInput,lookupCreateCustomer,createTicketAction,handleSubmit,handleChange,closeLayer,saveNewTicket,setCreateLayers(value){layers=value},setCreateRoot(value){root=value},getRecords(){return records},hasAssessment,financeApprovalView,createTicketForm,newTicketErrors,executionResultRecords,followPanel,attributionPanel,detailPanels,sections,detailTabKey,workflow,toCents,orderDateRange,filtered,matchingOrders,customerIdOf,customerDirectory,matchingCustomers,orderPickerState,orderPickerTitle,orderPickerDirty,orderPickerCustomers,orderPickerOrders,orderPickerView,selectPickerCustomer,changePickerCustomer,selectPickerOrder,recordOrderAssociation,informationView,handlingMissing,validateCustomerSolution,solutionDraft,solutionTotals,solutionOrders,refundEntries,refundAvailable,solutionTools,solutionRead,recordAccept,recordRecognition,recordCompensation,recordFollow,followTools,recordClosure,hasHandlingScheme,canClose,responsibleOptions,complaintCSV,validHandlingFile,records,orders,persist,canAssess,STATUS_TABS,WORK_ORDER_STATUSES,CHANNELS,workOrderStatus,normalizeRecordStatus,statusScope,currentHandler,currentTask,detailActions,complaintRow,complaintTiming,complaintTimingHTML,listProgressText,summary,phoneView,processingDepartment,processRecords,processView,select(id){main={record:records.find(r=>r.id===id),tab:detailTabKey()};return main.record;}};`;
vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),context);
const a=context.window.testAPI;
let count=0;
const test=(name,run)=>{run();count++;console.log('PASS '+name)};
const copy=o=>JSON.parse(JSON.stringify(o));
function inlineTicket(){const r=copy(a.records[0]);Object.assign(r,{status:'客服处理中',department:[],type:'',responsible:[],reason:'',handlingPlan:'',handlingFiles:[],follows:[]});for(const key of ['assessedAt','assessedBy','closedAt','closedBy','customerSolution','execution','financeApprovals','reviewInfo'])delete r[key];return r}
function inlineEditor(kind){return {kind,draft:kind==='closure'?{closeReason:'无需赔付，已解决',note:'客户确认处理完成'}:{},assessmentDraft:{department:['门店'],type:'门店服务',responsible:['陈佳'],reason:'已核实服务问题',handlingFiles:[{name:'认定凭证.pdf',type:'application/pdf',size:1,data:'data:application/pdf;base64,eA=='}]}}}
test('inline assessment is required only for unassessed customer-service outcomes',()=>{
 const f=a.followTools(),r=inlineTicket();assert.equal(f.needsInlineAssessment(r,'compensation'),true);assert.equal(f.needsInlineAssessment(r,'closure'),true);assert.equal(f.needsInlineAssessment(r,'follow'),false);
 assert.equal(f.needsInlineAssessment({...r,assessedAt:'2026-11-10 09:00'},'compensation'),true);assert.equal(f.needsInlineAssessment({...r,...inlineEditor('closure').assessmentDraft,assessedAt:'2026-11-10 09:00'},'compensation'),false);assert.equal(f.needsInlineAssessment({...r,status:'财务审批中'},'closure'),false);
 assert.deepEqual(copy(f.inlineAssessmentErrors(r,{kind:'closure'})).map(([key])=>key),['type','department','responsible','reason']);
});
test('inline responsibility expands with original fields and retains one draft across operation switches',()=>{
 const r=a.select(a.records[0].id),original=copy(r),e={kind:'compensation',draft:{customerSolution:a.solutionDraft(null)}};Object.assign(r,inlineTicket());delete r.assessedAt;e.baseline=JSON.stringify(e.draft);a.setEditor(e);
 try{
  const html=a.inlineAssessmentForm();for(const label of ['责任归属','售后类型','客户自身','责任原因','附件'])assert.ok(html.includes(label),label);
  assert.ok(!html.includes('name="handlingPlan"'));assert.ok(html.includes('id="uc-assessment-upload-list"'));e.assessmentDraft.reason='切换时保留认定草稿';
  a.followTools().switchOperation(e,'follow',r);assert.equal(a.inlineAssessmentForm(),'');assert.equal(a.followTools().operationDirty(e),true);
  a.followTools().switchOperation(e,'closure',r);assert.ok(a.inlineAssessmentForm().includes('切换时保留认定草稿'));assert.equal(r.assessedAt,undefined);
  r.assessedAt='2026-11-10 09:00';e.assessmentDraft.department=['门店'];assert.ok(a.inlineAssessmentForm().includes('name="responsible"'));
 }finally{Object.keys(r).forEach(key=>delete r[key]);Object.assign(r,original);a.setEditor(null)}
});
test('missing inline responsibility and invalid closure do not partially save attribution',()=>{
 const f=a.followTools(),r=inlineTicket(),before=copy(r),e=inlineEditor('closure');e.assessmentDraft.responsible=[];
 assert.equal(f.recordHandlingOutcome(r,e,'2026-11-10 10:00'),null);assert.deepEqual(r,before);
 e.assessmentDraft.responsible=['陈佳'];e.draft.closeReason='';assert.equal(f.recordHandlingOutcome(r,e,'2026-11-10 10:00'),null);assert.deepEqual(r,before);
});
test('inline responsibility and confirmed solution save together before finance submission',()=>{
 const r=inlineTicket(),e=inlineEditor('compensation'),solution={handlingMethods:['refund'],refund:120000,customerContext:'客户要求退还未消费金额',attachments:[]};
 assert.ok(a.followTools().recordHandlingOutcome(r,e,'2026-11-10 10:00',solution));assert.equal(r.status,'财务审批中');assert.equal(r.assessedAt,'2026-11-10 10:00');assert.equal(r.handlingPlan,'unresolved');assert.equal(r.financeApprovals.length,1);
 assert.equal(r.follows.filter(f=>f.kind==='handling').length,1);assert.equal(r.follows.filter(f=>f.kind==='compensation').length,1);assert.equal(r.handlingFiles[0].name,'认定凭证.pdf');assert.equal(r.customerSolution.attachments.length,0);
 assert.ok(!a.followTools().historyRecords(r,[]).some(f=>f.kind==='handling'));assert.equal(a.hasHandlingScheme(r),true);
});
test('inline responsibility and direct closure save together, including customer attribution',()=>{
 const r=inlineTicket(),e=inlineEditor('closure');e.assessmentDraft.department=['客户自身'];e.assessmentDraft.responsible=['应清除的责任人'];
 assert.ok(a.followTools().recordHandlingOutcome(r,e,'2026-11-10 10:00'));assert.equal(r.status,'已结案');assert.equal(r.closedAt,r.assessedAt);assert.equal(r.handlingPlan,'resolved');assert.deepEqual(copy(r.responsible),[]);assert.equal(r.follows[0].closureType,'no-payout');assert.equal(r.follows.filter(f=>f.kind==='closure').length,1);
});
test('existing attribution is not overwritten and failed persistence leaves the original record intact',()=>{
 const r=inlineTicket();r.assessedAt='2026-11-09 10:00';r.department=['销售'];r.type='门店服务';r.responsible=['原责任人'];r.reason='原认定';const e=inlineEditor('closure');assert.ok(a.followTools().recordHandlingOutcome(r,e,'2026-11-10 10:00'));assert.deepEqual(copy(r.department),['销售']);assert.equal(r.reason,'原认定');assert.equal(r.assessedAt,'2026-11-09 10:00');assert.ok(!r.follows.some(f=>f.kind==='handling'));
 const before=copy(a.getRecords()),next=copy(before);next[0]=inlineTicket();assert.ok(a.followTools().recordHandlingOutcome(next[0],inlineEditor('closure'),'2026-11-10 10:00'));
 const set=context.localStorage.setItem;try{context.localStorage.setItem=()=>{throw Error('quota test')};assert.equal(a.persist(next),false);assert.deepEqual(copy(a.getRecords()),before)}finally{context.localStorage.setItem=set}
});
test('saved attribution has an editable summary and modified recognition commits atomically',()=>{
 const f=a.followTools(),r=inlineTicket();Object.assign(r,inlineEditor('closure').assessmentDraft,{assessedAt:'2026-11-09 09:00',handlingPlan:'unresolved'});
 const e={kind:'closure',draft:{closeReason:'无需赔付，已解决',note:'客户已确认'}};
 let html=f.inlineAssessmentForm(r,e);assert.ok(html.includes('门店 / 门店服务 / 陈佳'));assert.ok(html.includes('inline-assessment-edit'));assert.ok(!html.includes('name="department"'));
 e.assessmentEditing=true;html=f.inlineAssessmentForm(r,e);assert.ok(html.includes('name="department"'));assert.ok(html.includes('data-uc="inline-assessment-orders"'));assert.ok(html.indexOf('id="uc-inline-assessment-orders"')<html.indexOf('data-field="department"'));assert.ok(!html.includes('uc-assessment-order-reference'));
 e.assessmentDraft.responsible=[];const before=copy(r);assert.equal(f.recordHandlingOutcome(r,e,'2026-11-10 10:00'),null);assert.deepEqual(r,before);
 e.assessmentDraft.responsible=['陈琳'];e.assessmentDraft.reason='核对操作记录后调整责任人';assert.ok(f.recordHandlingOutcome(r,e,'2026-11-10 10:00'));assert.equal(r.status,'已结案');assert.deepEqual(copy(r.responsible),['陈琳']);assert.equal(r.assessedAt,r.closedAt);assert.equal(r.follows.filter(item=>item.kind==='handling').length,1);
});
test('active demonstration tickets have no attribution and cleanup preserves other records and later edits',()=>{
 const cleanup=context.window.PCModules['complaint-fixtures'].clearProcessingAssessments,active=a.records.filter(r=>r.status==='客服处理中');assert.ok(active.length>0);
 for(const r of active){assert.equal(a.hasAssessment(r),false,r.id);assert.equal(r.type,'');assert.equal(r.department.length,0);assert.equal(r.responsible.length,0)}
 const saved=copy(active[0]);Object.assign(saved,inlineEditor('closure').assessmentDraft,{assessedAt:'2026-11-10 11:00'});assert.equal(cleanup([saved]),false);assert.equal(saved.responsible[0],'陈佳');
 const manual={...copy(saved),id:'manual',customerId:'manual',demoAssessmentCleared:false},before=copy(manual);assert.equal(cleanup([manual]),false);assert.deepEqual(manual,before);
 const original={...copy(saved),demoAssessmentCleared:false,follows:[{kind:'assessment',mock:false}]};cleanup([original]);assert.equal(original.assessedAt,'2026-11-10 11:00');
 const approval=copy(a.records.find(r=>r.status==='财务审批中')),snapshot=copy(approval);cleanup([approval]);assert.deepEqual(approval,snapshot);
 const old={...copy(saved),demoAssessmentCleared:false,follows:[{kind:'assessment',mock:true},{kind:'follow',mock:true,communication:{reason:'继续协商'},department:['门店']}]};assert.equal(cleanup([old]),true);assert.equal(a.hasAssessment(old),false);assert.equal(old.follows[0].communication.reason,'继续协商');assert.ok(!Object.hasOwn(old.follows[0],'department'));
});
test('multiple internal departments share one people picker after the type and attribution fields',()=>{
 const d={...inlineEditor('closure').assessmentDraft,department:['推广','门店'],responsible:['陈敏','陈佳'],handlingPlan:'unresolved'},html=a.responsibilityForm(d);
 assert.deepEqual(copy(a.handlingMissing(d)),[]);assert.equal((html.match(/name="responsible"/g)||[]).length,1);assert.ok(!html.includes('推广责任人'));assert.ok(!html.includes('门店责任人'));
 assert.ok(html.indexOf('data-field="type"')<html.indexOf('data-field="department"'));assert.ok(html.indexOf('data-field="department"')<html.indexOf('data-field="responsible"'));
 assert.ok(html.includes('value="陈敏" selected'));assert.ok(html.includes('value="陈佳" selected'));
 const r=inlineTicket();assert.ok(a.recordRecognition(r,d,'2026-11-10 12:00'));assert.deepEqual(copy(r.department),['推广','门店']);assert.deepEqual(copy(r.responsible),['陈敏','陈佳']);
 assert.ok(a.handlingMissing({...d,department:['客户自身','门店']}).some(([key])=>key==='department'));
 const own={...d,department:['客户自身'],type:'门店服务'},before=copy(own),ownHtml=a.responsibilityForm(own);
 assert.deepEqual(copy(a.handlingMissing(own)),[]);assert.ok(ownHtml.includes('data-field="responsible" hidden'));assert.deepEqual(own,before);
 assert.deepEqual(copy(a.assessmentValues(own)),{department:['客户自身'],responsible:[],reason:own.reason});assert.ok(!a.assessmentFields(own).some(([label])=>label==='责任人'));
 assert.ok(a.handlingMissing({...own,reason:''}).some(([key])=>key==='reason'));assert.ok(!ownHtml.includes('data-field="reason" hidden'));assert.ok(ownHtml.includes('name="reason"'));assert.ok(a.assessmentFields(own).some(([label])=>label==='责任原因'));assert.ok(a.handlingMissing({...own,department:['门店'],reason:''}).some(([key])=>key==='reason'));
 assert.ok(a.handlingMissing({...own,department:['门店'],responsible:[],type:'顾客自身'}).some(([key])=>key==='responsible'));
});
test('customer attribution can submit a confirmed solution and failed persistence keeps saved attribution',()=>{
 const r=inlineTicket(),e=inlineEditor('compensation');e.assessmentDraft.department=['客户自身'];e.assessmentDraft.reason='';
 const solution={handlingMethods:['refund'],refund:120000,customerContext:'客户搬家，无法继续消费',attachments:[]};
 assert.equal(a.followTools().recordHandlingOutcome(r,e,'2026-11-10 12:00',solution),null);e.assessmentDraft.reason='客户搬离本市，无法继续到店';assert.ok(a.followTools().recordHandlingOutcome(r,e,'2026-11-10 12:00',solution));assert.equal(r.reason,e.assessmentDraft.reason);assert.equal(r.status,'财务审批中');assert.equal(a.hasAssessment(r),true);assert.deepEqual(copy(r.responsible),[]);
 const before=copy(a.getRecords()),next=copy(before);next[0]=r;const set=context.localStorage.setItem;
 try{context.localStorage.setItem=()=>{throw Error('QuotaExceededError')};assert.equal(a.persist(next),false);assert.deepEqual(copy(a.getRecords()),before)}finally{context.localStorage.setItem=set}
});
test('customer and internal attribution toggle exclusively without discarding unsaved people',()=>{
 const d={...inlineEditor('closure').assessmentDraft,department:['推广','门店','客户自身'],responsible:['陈敏','陈佳']};
 const controls=['推广','销售','门店','客户自身'].map(value=>({value,checked:d.department.includes(value)})),reasonRow={hidden:false},reason={required:true,setAttribute(){},closest:()=>reasonRow},row={hidden:false},responsible={innerHTML:'',setAttribute(){},closest:()=>row},rule={textContent:'',parentElement:{hidden:false}},message={textContent:'old'};
 const form={querySelectorAll:()=>controls,querySelector:selector=>selector==='[name="responsible"]'?responsible:selector==='[name="reason"]'?reason:selector==='#uc-rule-text'?rule:message};
 const event=(name,value,checked)=>({name,value,checked,dataset:{},closest:()=>form});
 const oldSync=context.PCUI.syncControl;context.PCUI.syncControl=()=>{};
 try{
  assert.equal(a.syncResponsibility(event('department','客户自身',true),d),true);assert.deepEqual(copy(d.department),['客户自身']);assert.equal(row.hidden,true);assert.equal(reasonRow.hidden,false);assert.equal(reason.required,true);assert.equal(responsible.required,false);assert.deepEqual(controls.map(c=>c.checked),[false,false,false,true]);assert.deepEqual(copy(d.responsible),['陈敏','陈佳']);
  d.department=['推广','客户自身'];a.syncResponsibility(event('department','推广',true),d);assert.deepEqual(copy(d.department),['推广']);assert.equal(row.hidden,false);assert.equal(reasonRow.hidden,false);assert.equal(reason.required,true);assert.equal(responsible.required,true);assert.ok(responsible.innerHTML.includes('value="陈敏" selected'));assert.ok(responsible.innerHTML.includes('value="陈佳" selected'));
  d.type='顾客自身';a.syncResponsibility(event('type','顾客自身',false),d);assert.deepEqual(copy(d.department),['推广']);assert.equal(row.hidden,false);
 }finally{context.PCUI.syncControl=oldSync}
});
test('saved attribution survives reload and rejects a concurrent overwrite',()=>{
 const before=copy(a.getRecords()),next=copy(before),record=inlineTicket(),draft={...inlineEditor('closure').assessmentDraft,department:['推广','门店'],responsible:['陈敏','陈佳'],handlingPlan:'unresolved'};
 assert.ok(a.recordRecognition(record,draft,'2026-11-10 12:00'));next[0]=record;assert.equal(a.persist(next),true);
 const key='weid.pc.complaints.v1',saved=context.localStorage.getItem(key),fresh={...context,window:{PCComplaintOptions:context.window.PCComplaintOptions,PCModules:{...context.window.PCModules},addEventListener(){}}};
 vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),fresh);
 assert.deepEqual(copy(fresh.window.testAPI.records[0].responsible),['陈敏','陈佳']);assert.deepEqual(copy(fresh.window.testAPI.records[0].department),['推广','门店']);
 const oldSet=context.localStorage.setItem;oldSet(key,saved+' ');assert.equal(a.persist(before),false);assert.equal(context.localStorage.getItem(key),saved+' ');oldSet(key,saved);assert.equal(a.persist(before),true);
});
test('standalone attribution omits outcome controls and saving cannot close or advance the case',()=>{
 const r=a.select(a.records[0].id),original=copy(r),draft={...inlineEditor('closure').assessmentDraft,handlingPlan:'resolved'};
 try{
  Object.assign(r,inlineTicket(),{status:'客服已接单'});a.setEditor({kind:'assessment',draft});
  const form=a.assessmentForm(),footer=a.followTools().editorFooter({kind:'assessment',draft});
  assert.ok(!form.includes('name="handlingPlan"'));assert.ok(!form.includes('处理结果'));assert.ok(form.includes('uc-handling-upload'));assert.ok(footer.includes('保存责任认定'));assert.ok(!footer.includes('保存并结案'));
  const entry=a.recordRecognition(r,draft,'2026-11-10 12:00',{assessmentOnly:true,handlingPlan:r.handlingPlan||'unresolved'});
  assert.ok(entry);assert.equal(r.status,'客服已接单');assert.equal(r.handlingPlan,'unresolved');assert.equal(r.closedAt,undefined);assert.equal(r.startedAt,undefined);assert.equal(entry.beforeStatus,entry.status);assert.ok(!a.attributionPanel(r).includes('处理结果'));
 }finally{Object.keys(r).forEach(key=>delete r[key]);Object.assign(r,original);a.setEditor(null)}
});
test('refund drafts start with linked orders and retain saved additional refund orders',()=>{
 const r=a.select('31001'),before=copy(r),own=a.solutionOrders();
 try{
  r.linked=[{id:own[0].id}];const draft=a.solutionDraft(null);assert.deepEqual(copy(draft.refundOrderIds),[own[0].id]);
  const tool=a.solutionTools(),extra=own[1];assert.deepEqual(copy(tool.refundOrderCandidates(draft)).map(order=>order.id),copy(own.slice(1).map(order=>order.id)));
  tool.addRefundOrders(draft,[extra.id]);draft.methods=['refund'];draft.customerContext='客户要求退还未消费项目';draft.payout={method:'wechat',name:r.name,account:'demo-refund-account',bank:''};
  const row=a.refundEntries().find(row=>row.order.id===extra.id);tool.selectFullRefund(draft,row);
  const saved=a.validateCustomerSolution(draft);assert.deepEqual(copy(saved.errors),[]);assert.equal(saved.value.refundOrders[0].orderId,extra.id);
  const reopened=a.solutionDraft(saved.value);assert.deepEqual(copy(reopened.refundOrderIds),[own[0].id,extra.id]);assert.equal(reopened.refundAmounts[row.key],draft.refundAmounts[row.key]);assert.equal(reopened.refundQuantities[row.key],draft.refundQuantities[row.key]);
 }finally{Object.keys(r).forEach(key=>delete r[key]);Object.assign(r,before)}
});
test('adding refund orders preserves the solution and rejects foreign or exhausted orders atomically',()=>{
 const r=a.select('31001'),before=copy(r),own=a.solutionOrders(),draft=a.solutionDraft(null),tool=a.solutionTools();draft.refundOrderIds=[own[0].id];draft.customerContext='保留消费诉求';draft.exchangeDescription='保留置换方案';
 tool.selectFullRefund(draft,a.refundEntries()[0]);const original=copy(draft),foreign=a.orders.find(order=>order.customerId!==r.customerId);
 assert.ok(tool.addRefundOrders(draft,[own[1].id,foreign.id]).error);assert.deepEqual(copy(draft),original);
 const projects=copy(own[1].projects);try{own[1].projects.forEach(item=>item.refunded=item.paid);assert.ok(tool.addRefundOrders(draft,[own[1].id]).error);assert.deepEqual(copy(draft),original)}finally{own[1].projects=projects}
 assert.deepEqual(copy(tool.addRefundOrders(draft,[own[1].id,own[1].id,own[0].id]).added),[own[1].id]);assert.equal(draft.refundOrderIds.length,2);
 const {refundOrderIds,...rest}=copy(draft),{refundOrderIds:old,...expected}=original;assert.deepEqual(rest,expected);assert.deepEqual(copy(r),before);assert.deepEqual(copy(tool.refundOrderCandidates(draft)).map(order=>order.id),copy(own.slice(2).map(order=>order.id)));
 const forged={...draft,methods:['refund'],refundOrderIds:[...draft.refundOrderIds,foreign.id]};assert.ok(a.validateCustomerSolution(forged).errors.some(([key])=>key==='solution-refundOrders'));
});
test('refund order popup keeps pending selections private until confirm and ignores a stale parent',()=>{
 const r=a.select('31001'),draft=a.solutionDraft(null),tool=a.solutionTools(),own=a.solutionOrders();draft.refundOrderIds=[own[0].id];const before=copy(draft),recordBefore=copy(r),events={},nodes=new Map();let dialog,closed=0,added=0,current=true;
 const box={dataset:{refundPick:own[1].id},checked:false,hasAttribute:key=>key==='data-refund-pick'},all={checked:false};
 const form={addEventListener:(name,fn)=>events[name]=fn},root={querySelector(selector){if(selector==='form')return form;if(selector==='[data-refund-pick-all]')return all;if(!nodes.has(selector))nodes.set(selector,{textContent:'',innerHTML:'',addEventListener(){}});return nodes.get(selector)},querySelectorAll:()=>[box],addEventListener:(name,fn)=>events[name]=fn};
 const oldGet=context.document.getElementById,oldDialog=context.PCUI.dialog,oldClose=context.PCUI.closeDialog;
 try{
  context.document.getElementById=()=>root;context.PCUI.dialog=options=>dialog=options;context.PCUI.closeDialog=()=>closed++;
  const open=()=>tool.openRefundOrderPicker(draft,{isCurrent:()=>current,onAdded:()=>added++}),choose=()=>{box.checked=true;events.change({target:box})};
  open();const html=nodes.get('#uc-refund-order-results').innerHTML;assert.ok(!dialog.content.includes('query-module'));for(const order of own)assert.ok(html.includes(order.id));assert.ok(html.includes('已添加'));choose();assert.deepEqual(copy(draft),before);dialog.buttons[0].action();assert.deepEqual(copy(draft),before);
  open();choose();current=false;dialog.buttons[1].action();assert.deepEqual(copy(draft),before);assert.equal(added,0);
  current=true;open();choose();dialog.buttons[1].action();assert.deepEqual(copy(draft.refundOrderIds),copy(own.slice(0,2).map(order=>order.id)));assert.equal(added,1);assert.equal(closed,3);assert.deepEqual(copy(r),recordBefore);
  draft.refundOrderIds=[];open();events.change({target:{checked:true,hasAttribute:key=>key==='data-refund-pick-all'}});assert.equal(nodes.get('#uc-refund-order-count').textContent,'本次已选 '+own.length+' 笔订单');dialog.buttons[1].action();assert.deepEqual(copy(draft.refundOrderIds),copy(own.map(order=>order.id)));assert.equal(added,2);
 }finally{context.document.getElementById=oldGet;context.PCUI.dialog=oldDialog;context.PCUI.closeDialog=oldClose}
});
test('removing refund orders clears only their draft amounts and quantities and updates totals',()=>{
 const r=a.select('31001'),recordBefore=copy(r),tool=a.solutionTools(),own=a.solutionOrders(),draft=a.solutionDraft(null);tool.addRefundOrders(draft,own.map(order=>order.id));
 Object.assign(draft,{methods:['refund'],customerContext:'核对未消费项目后申请退款',payout:{method:'wechat',name:r.name,account:'demo-refund-account',bank:''}});for(const row of a.refundEntries())tool.selectFullRefund(draft,row);
 const before=copy(draft),removed=own[2],removedTotal=a.refundEntries().filter(row=>row.order.id===removed.id).reduce((sum,row)=>sum+a.toCents(draft.refundAmounts[row.key]),0),total=a.solutionTotals(draft).refund;
 assert.ok(tool.removeRefundOrder(draft,removed.id));assert.equal(a.solutionTotals(draft).refund,total-removedTotal);assert.ok(!draft.refundOrderIds.includes(removed.id));
 for(const key of Object.keys(before.refundAmounts)){if(key.startsWith(removed.id+':')){assert.ok(!Object.hasOwn(draft.refundAmounts,key));assert.ok(!Object.hasOwn(draft.refundQuantities,key))}else{assert.equal(draft.refundAmounts[key],before.refundAmounts[key]);assert.equal(draft.refundQuantities[key],before.refundQuantities[key])}}
 assert.deepEqual(copy(r),recordBefore);assert.equal(draft.customerContext,before.customerContext);assert.deepEqual(copy(draft.payout),before.payout);assert.ok(tool.refundOrderCandidates(draft).some(order=>order.id===removed.id));
 tool.addRefundOrders(draft,[removed.id]);assert.equal(a.solutionTotals(draft).refund,total-removedTotal);assert.ok(!a.refundEntries().filter(row=>row.order.id===removed.id).some(row=>Object.hasOwn(draft.refundAmounts,row.key)));
 const snapshot=copy(draft);assert.equal(tool.removeRefundOrder(draft,'missing-order'),false);assert.deepEqual(copy(draft),snapshot);
 for(const order of own)tool.removeRefundOrder(draft,order.id);assert.equal(a.solutionTotals(draft).refund,0);assert.ok(a.validateCustomerSolution(draft).errors.some(([key])=>key==='solution-refundOrders'));
});
test('saved refund selection retains removed linked orders on reload without changing complaint links',()=>{
 const r=a.select('31001'),recordBefore=copy(r),tool=a.solutionTools(),own=a.solutionOrders(),draft=a.solutionDraft(null);tool.addRefundOrders(draft,own.map(order=>order.id));
 Object.assign(draft,{methods:['refund'],customerContext:'仅退其中一笔订单',payout:{method:'wechat',name:r.name,account:'demo-refund-account',bank:''}});for(const row of a.refundEntries())tool.selectFullRefund(draft,row);
 tool.removeRefundOrder(draft,own[0].id);const result=a.validateCustomerSolution(draft);assert.deepEqual(copy(result.errors),[]);assert.ok(!result.value.refundOrders.some(order=>order.orderId===own[0].id));
 const reopened=a.solutionDraft(JSON.parse(JSON.stringify(result.value)));assert.deepEqual(copy(reopened.refundOrderIds),copy(draft.refundOrderIds));assert.ok(!reopened.refundOrderIds.includes(own[0].id));assert.deepEqual(copy(r),recordBefore);
 const previous=copy(a.getRecords()),next=copy(previous),target=next.find(record=>record.id===r.id);target.customerSolution=result.value;
 const set=context.localStorage.setItem;try{context.localStorage.setItem=()=>{throw Error('quota test')};assert.equal(a.persist(next),false);assert.deepEqual(copy(a.getRecords()),previous);assert.deepEqual(copy(draft.refundOrderIds),copy(reopened.refundOrderIds))}finally{context.localStorage.setItem=set}
});
test('seed contains all three channels and at least three complete orders per customer',()=>{
 assert.equal(a.records.length,39);assert.equal(a.orders.length,117);assert.equal(new Set(a.orders.map(order=>order.id)).size,a.orders.length);assert.deepEqual([...new Set(a.records.map(r=>r.channel))].sort(),['mini','staff','wechat']);
 for(const record of a.records){a.select(record.id);const own=a.solutionOrders();assert.ok(own.length>=3,record.id);for(const order of own){assert.ok(order.created&&order.store&&order.projects.length);assert.equal(order.projects.reduce((sum,item)=>sum+item.paid,0),Math.round(order.amount*100));for(const item of order.projects)assert.ok(Number.isInteger(item.quantity)&&Number.isInteger(item.consumedQuantity)&&Number.isInteger(item.refundedQuantity))}assert.ok(own.some(order=>order.demoAdditional&&!record.linked.some(link=>link.id===order.id)));}
});
test('new ticket inputs expose one business name and validate entered values',()=>{
 const html=a.createTicketForm();
 assert.ok(!html.includes('>搜索</button>'));assert.ok(!html.includes('>重置</button>'));
 for(const [id,name] of [['createName','name'],['createPhone','phone']]){
   const input=html.match(new RegExp('<input[^>]*id="uc-'+id+'"[^>]*>'))?.[0];
   assert.ok(input);assert.equal((input.match(/\bname="/g)||[]).length,1);assert.ok(input.includes('name="'+name+'"'));
 }
 assert.deepEqual(JSON.parse(JSON.stringify(a.newTicketErrors({name:'测试客户',phone:'13800000000',content:'测试'}))),[]);
});
test('intake searches full and masked phone candidates without binding automatically',()=>{
  const phone=a.orders[0].phone.replace(/[*＊•]/g,'0'),state=a.createTicketState();
  assert.ok(a.createCustomerMatches(phone).some(customer=>customer.customerId===a.orders[0].customerId));
  assert.equal(state.customerId,'');assert.equal(a.createCustomerMatches('3858').length,0);
  const count=a.records.length;
  try{
    a.records.push({customerId:'same-phone',name:'另一位客户',phone,member:'same-phone-member'});
    assert.ok(a.createCustomerMatches(phone).length>=2);state.searchedPhone=phone;state.consumptionPhone=phone;
    assert.equal(a.setCreateCustomer(state,'unrelated'),false);assert.ok(a.setCreateCustomer(state,'same-phone'));assert.equal(a.createCustomerOrders(state).length,0);
    assert.equal(a.createTicketAssociation(state,{phone:'13900000000',consumptionPhone:phone,name:'来电人'},'2026-11-09 10:00').customerId,'same-phone');
  }finally{a.records.splice(count)}
});
test('intake selects multiple orders only inside the confirmed customer and resets on customer change',()=>{
  const phone=a.orders[0].phone.replace(/[*＊•]/g,'0'),state={...a.createTicketState(),searchedPhone:phone,consumptionPhone:phone};
  assert.ok(a.setCreateCustomer(state,a.orders[0].customerId));const own=a.createCustomerOrders(state);
  assert.equal(own.length,2);assert.ok(own.some(order=>order.state==='已完成'));
  for(const order of own)assert.ok(a.setCreateOrder(state,order.id,true));
  assert.equal(state.linked.length,2);assert.ok(a.setCreateOrder(state,own[0].id,true));assert.equal(state.linked.length,2);
  assert.equal(a.setCreateOrder(state,a.orders.find(order=>order.customerId!==state.customerId).id,true),false);
  assert.ok(a.setCreateOrder(state,own[0].id,false));assert.equal(state.linked.length,1);
  assert.ok(a.setCreateCustomer(state,state.customerId));assert.equal(state.linked.length,1);assert.equal(state.lookupOpen,false);
});
test('intake order filters compose without losing selections or including another customer',()=>{
  const state={...a.createTicketState(),customerId:a.orders[0].customerId},own=a.createCustomerOrders(state);
  own.forEach(order=>a.setCreateOrder(state,order.id,true));const before=JSON.stringify(state);
  assert.equal(a.createCustomerOrders(state,{keyword:own[0].id}).length,1);
  assert.ok(a.createCustomerOrders(state,{keyword:own[0].project}).length);
  assert.equal(a.createCustomerOrders(state,{store:'不存在的门店'}).length,0);
  assert.equal(a.createCustomerOrders(state,{start:'2099-01-01'}).length,0);
  assert.equal(a.createCustomerOrders(state,{end:'2000-01-01'}).length,0);
  assert.equal(JSON.stringify(state),before);
  const html=a.createOrderTable(own,state.linked);assert.ok(html.includes('type="checkbox"'));assert.ok(html.includes('下单：'));assert.ok(html.includes('消费：'));assert.ok(html.includes('实付金额'));
  assert.ok(a.createOrderTable(own,state.linked,'',true).indexOf('>操作</th>')>a.createOrderTable(own,state.linked,'',true).indexOf('>状态</th>'));
});
test('intake allows unmatched customers and missing names or orders while retaining contact identity',()=>{
  const state=a.createTicketState(),values={name:'',phone:'13900000000',consumptionPhone:'13800009999',content:'反馈'};
  assert.deepEqual(copy(a.newTicketErrors(values)),[]);
  const result=a.createTicketAssociation(state,values,'2026-11-09 10:00');
  assert.equal(result.customerId,'');assert.equal(result.name,'未留姓名');assert.equal(result.phone,values.phone);assert.equal(result.consumptionPhone,values.consumptionPhone);assert.equal(result.linked.length,0);
  state.searchedPhone='13800002901';state.consumptionPhone=state.searchedPhone;assert.ok(a.setCreateCustomer(state,'C28'));
  const linked=a.createTicketAssociation(state,{...values,name:'代家人咨询',consumptionPhone:state.consumptionPhone},'2026-11-09 10:00');
  assert.equal(linked.customerId,'C28');assert.equal(linked.linked.length,0);assert.equal(linked.originalContact.phone,values.phone);assert.equal(linked.originalContact.name,'代家人咨询');assert.equal(linked.orderSelectionMode,'multiple');
  const summary=a.summary({...copy(a.records[0]),...linked});assert.ok(summary.includes('消费手机号'));assert.ok(summary.includes('联系客户'));assert.ok(!summary.includes(values.phone));
  assert.throws(()=>a.createTicketAssociation(state,{...values,consumptionPhone:'13999999999'},'2026-11-09 10:00'),/客户信息已变更/);
  state.linked=[{id:a.orders[0].id}];assert.throws(()=>a.createTicketAssociation(state,{...values,consumptionPhone:state.consumptionPhone},'2026-11-09 10:00'),/订单不属于/);
  assert.ok(a.newTicketErrors({...values,phone:'123'}).some(([field])=>field==='phone'));
});
test('new intake tickets retain multi-order editing and reject forged cross-customer orders',()=>{
  const record={...copy(a.records[0]),orderSelectionMode:'multiple',linked:[]},state=a.orderPickerState(record),own=a.orderPickerOrders(state);
  assert.equal(state.multipleOrders,true);own.forEach(order=>assert.ok(a.selectPickerOrder(state,order.id)));
  assert.equal(state.selection.length,2);assert.ok(a.orderPickerView(state).includes('type="checkbox"'));
  assert.ok(a.recordOrderAssociation(record,state,'2026-11-09 10:00'));assert.equal(record.linked.length,2);
  const reopened=a.orderPickerState(record);assert.ok(a.selectPickerOrder(reopened,own[0].id));assert.equal(reopened.selection.length,1);
  assert.ok(a.selectPickerOrder(reopened,own[1].id));assert.equal(reopened.selection.length,0);
  assert.ok(a.recordOrderAssociation(record,reopened,'2026-11-09 10:01'));assert.equal(record.linked.length,0);
  const forged=a.orderPickerState(record);forged.selection=[{id:a.orders.find(order=>order.customerId!==record.customerId).id}];
  assert.equal(a.recordOrderAssociation(record,forged,'2026-11-09 10:02'),null);
});
test('phone lookup changes discard only customer binding and automatic values, preserving intake text',()=>{
  const originalSync=context.PCUI.syncControl;context.PCUI.syncControl=()=>{};
  const node=(value='')=>({value,innerHTML:'',textContent:'',removeAttribute(){}}),phone=node('13900009999'),contact=node('13800002901'),name=node('自动带入姓名'),content=node('已记录的通话情况');
  phone.name='consumptionPhone';contact.name='phone';
  const nodes={'[name="consumptionPhone"]':phone,'[name="phone"]':contact,'[name="name"]':name,'[name="content"]':content,'#uc-create-customer-error':node(),'#uc-create-customer-result':node(),'#uc-create-orders':node()};
  const state={...a.createTicketState(),customerId:'C28',consumptionPhone:'13800002901',searchedPhone:'13800002901',autoName:name.value,linked:[{id:'old-order'}]},layer={creation:state,el:{querySelector:selector=>nodes[selector]}};
  a.setCreateLayers([layer]);
  try{
    assert.ok(a.syncCreateInput(phone));assert.equal(state.customerId,'');assert.equal(state.linked.length,0);assert.equal(name.value,'');assert.equal(contact.value,phone.value);assert.equal(content.value,'已记录的通话情况');
    contact.value='13700000000';a.syncCreateInput(contact);phone.value='13600000000';a.syncCreateInput(phone);assert.equal(contact.value,'13700000000');assert.equal(content.value,'已记录的通话情况');
    phone.value='13800002901';a.syncCreateInput(phone);assert.equal(state.searchedPhone,phone.value);assert.ok(nodes['#uc-create-customer-result'].innerHTML.includes('何女士'));assert.equal(state.customerId,'');
  }finally{a.setCreateLayers([]);context.PCUI.syncControl=originalSync}
});
test('customer selection hides lookup and reselecting the current customer retains selected orders',()=>{
  const oldFocus=context.PCUI.focusControl;context.PCUI.focusControl=()=>{};
  const phone={value:'13800002901',select(){}},lookup={hidden:false},result={innerHTML:''},orderRegion={innerHTML:'',hidden:true};
  const state={...a.createTicketState(),consumptionPhone:phone.value,searchedPhone:phone.value};assert.ok(a.setCreateCustomer(state,'C28'));a.createCustomerOrders(state).forEach(order=>a.setCreateOrder(state,order.id,true));
  const nodes={'[name="name"]':{value:'何女士'},'[name="consumptionPhone"]':phone,'#uc-create-customer-lookup':lookup,'#uc-create-customer-result':result,'#uc-create-orders':orderRegion};
  const layer={creation:state,el:{querySelector:selector=>nodes[selector]}};a.setCreateLayers([layer]);const before=JSON.stringify(state.linked);
  try{
    a.createTicketAction('create-change-customer',{},layer);assert.equal(lookup.hidden,false);assert.equal(JSON.stringify(state.linked),before);assert.ok(!result.innerHTML.includes('保留当前客户'));assert.ok(!result.innerHTML.includes('暂不关联客户'));
    a.createTicketAction('create-select-customer',{dataset:{customer:'C28'}},layer);assert.equal(lookup.hidden,true);assert.equal(orderRegion.hidden,false);assert.equal(JSON.stringify(state.linked),before);assert.ok(result.innerHTML.includes('更换客户'));assert.ok(!result.innerHTML.includes('<form'));assert.ok(result.innerHTML.includes('href="#complaints?customer=C28"'));assert.ok(result.innerHTML.includes('target="_blank"'));assert.ok(result.innerHTML.includes('rel="noopener noreferrer"'));
  }finally{a.setCreateLayers([]);context.PCUI.focusControl=oldFocus}
});
test('customer detail reads the linked customer and own orders without changing intake data',()=>{
  const before=JSON.stringify(a.records),own=a.orders.filter(order=>order.customerId==='C28'),html=a.customerPage('C28');
  assert.ok(html.includes('客户详情'));assert.ok(html.includes('何女士'));assert.ok(html.includes(own[0].id));assert.ok(!html.includes(a.orders[0].id));
  assert.ok(a.customerPage('missing-customer').includes('未找到该客户资料'));assert.equal(JSON.stringify(a.records),before);
  assert.ok(a.createTicketForm().includes('示例 13800002901'));
});
test('customer detail deep links reach the detail mount and ordinary complaints retain their list',()=>{
  let selected;const location={hash:'#complaints?customer=C28'},host={innerHTML:''},content={};
  const local={URLSearchParams,location,window:{PCModules:{}},PCComplaintOptions:{refresh(){}},PCComplaints:{mount(node,options){assert.equal(node,content);selected=options.customerId},leave(){}},document:{body:{classList:{remove(){}}},querySelector:selector=>selector==='#main'?host:content}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaints/index.js'),'utf8'),local);
  local.window.PCModules.complaints.render();assert.equal(selected,'C28');location.hash='#complaints';local.window.PCModules.complaints.render();assert.equal(selected,null);
});
test('intake checkbox changes retain the row and focus while updating the selection count',()=>{
  const state={...a.createTicketState(),customerId:a.orders[0].customerId},count={textContent:''},layer={creation:state,el:{querySelector(selector){assert.equal(selector,'#uc-create-selected-count');return count}}};
  const source={dataset:{createOrderChoice:a.orders[0].id},checked:true};a.setCreateLayers([layer]);
  try{
    a.handleChange({target:source,stopPropagation(){}});assert.equal(count.textContent,'已选 1 笔');assert.equal(state.linked[0].id,source.dataset.createOrderChoice);
    source.checked=false;a.handleChange({target:source,stopPropagation(){}});assert.equal(count.textContent,'可多选');assert.equal(state.linked.length,0);
  }finally{a.setCreateLayers([])}
});
test('order picker cancellation discards its selection and confirmation updates only parent order draft',()=>{
  const originalTimeout=context.setTimeout,originalMatch=context.matchMedia,callbacks=[];
  context.setTimeout=callback=>callbacks.push(callback);context.matchMedia=()=>({matches:true});
  const node=()=>({innerHTML:'',textContent:'',scrollTop:42,focus(){}}),nodes={'#uc-create-orders':node(),'.uc-drawer-body':node(),'.uc-drawer':node()};
  const parent={creation:{...a.createTicketState(),customerId:a.orders[0].customerId},el:{isConnected:true,inert:true,querySelector:selector=>nodes[selector]}};
  const makePicker=()=>({creationOrders:{parent,state:copy(parent.creation),filters:{keyword:'不匹配'},page:1,size:10},el:{classList:{remove(){},add(){}},remove(){}},parentView:{scroll:42}});
  try{
    let child=makePicker();a.setCreateOrder(child.creationOrders.state,a.orders[0].id,true);a.setCreateLayers([parent,child]);a.closeLayer();callbacks.shift()();
    assert.equal(parent.creation.linked.length,0);assert.equal(parent.el.inert,false);assert.equal(nodes['.uc-drawer-body'].scrollTop,42);
    child=makePicker();a.createCustomerOrders(child.creationOrders.state).forEach(order=>a.setCreateOrder(child.creationOrders.state,order.id,true));a.setCreateLayers([parent,child]);a.createTicketAction('create-confirm-orders',{},child);callbacks.shift()();
    assert.equal(parent.creation.linked.length,2);assert.equal(parent.creation.customerId,a.orders[0].customerId);assert.ok(nodes['#uc-create-orders'].innerHTML.includes('已选 2 笔'));
  }finally{a.setCreateLayers([]);context.setTimeout=originalTimeout;context.matchMedia=originalMatch}
});
test('intake save retains the entire draft on quota failure and concurrency conflict, then persists identity and orders atomically',()=>{
  let raw=null,fail=false;const notices=[];
  const local={...context,window:{PCModules:{},addEventListener(){}},PCUI:{registerPager(){},message:value=>notices.push(value)},matchMedia:()=>({matches:true}),setTimeout(){},localStorage:{getItem:key=>key==='weid.pc.complaints.v1'?raw:null,setItem(key,value){if(fail)throw Error('QuotaExceededError');if(key==='weid.pc.complaints.v1')raw=value}}};
  const boot=()=>{loadOptions(local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);return local.window.testAPI};
  let api=boot();const phone=api.orders[0].phone.replace(/[*＊•]/g,'0'),state={...api.createTicketState(),consumptionPhone:phone,searchedPhone:phone};
  assert.ok(api.setCreateCustomer(state,api.orders[0].customerId));api.createCustomerOrders(state).forEach(order=>api.setCreateOrder(state,order.id,true));
  const values={consumptionPhone:phone,name:'替家人咨询',phone:'13900000000',channel:'hotline',content:'请核对这两笔订单的售后问题'},controls=Object.entries(values).map(([name,value])=>({name,value})),form={querySelectorAll:()=>controls},layer={creation:state,el:{querySelector:selector=>selector==='[data-ticket-form]'?form:null,querySelectorAll:()=>[],classList:{remove(){},add(){}}}};
  api.setCreateLayers([layer]);api.setCreateRoot({querySelectorAll:()=>[]});const before=raw,draft=JSON.stringify(state),count=api.getRecords().length;
  fail=true;api.saveNewTicket();assert.equal(raw,before);assert.equal(api.getRecords().length,count);assert.equal(JSON.stringify(state),draft);assert.ok(!layer.closing);assert.ok(notices.some(value=>value.includes('QuotaExceededError')));
  fail=false;raw='[]';api.saveNewTicket();assert.equal(raw,'[]');assert.equal(JSON.stringify(state),draft);assert.ok(!layer.closing);assert.ok(notices.some(value=>value.includes('其他页面更新')));
  raw=before;api.saveNewTicket();assert.equal(api.getRecords().length,count+1);assert.equal(layer.closing,true);
  const created=JSON.parse(raw).at(-1);assert.equal(created.customerId,state.customerId);assert.equal(created.linked.length,2);assert.equal(created.originalContact.phone,values.phone);assert.equal(created.consumptionPhone,phone);assert.equal(created.status,'待处理');assert.equal(created.content,values.content);
  api=boot();const restored=api.getRecords().find(record=>record.id===created.id);assert.equal(restored.linked.length,2);assert.equal(restored.originalContact.name,values.name);assert.equal(api.orderPickerState(restored).multipleOrders,true);
  assert.ok(api.summary(restored,true).includes(values.phone));assert.ok(api.filtered({keywordType:'phone',keyword:values.phone}).some(record=>record.id===restored.id));
});
test('workflow owns status tabs, departments and action eligibility',()=>{
  assert.deepEqual(copy(a.workflow.statuses.map(([status])=>status)),copy(a.WORK_ORDER_STATUSES));
  assert.equal(a.workflow.department({status:'财务审批中'}),'财务');assert.equal(a.workflow.department({status:'待采购发货'}),'采购');
  assert.deepEqual(copy(a.workflow.detailActions({status:'待处理'})),['reply','accept']);
  assert.deepEqual(copy(a.workflow.detailActions({status:'客服已接单'})),['reply','handling','assessment']);
  assert.ok(!a.workflow.detailActions({status:'客服处理中'},{canClose:true}).includes('closure'));
  assert.equal(a.workflow.can({status:'已结案'},'grade'),false);
});
test('PC writes only its own storage key',()=>assert.deepEqual([...storage.keys()],['weid.pc.complaints.v1']));
test('money precision, invalid decimals, negatives and overflow',()=>{assert.equal(a.toCents('12.34'),1234);assert.equal(a.toCents('0.01'),1);for(const v of ['1.001','-1','1e3','Infinity','9007199254740992'])assert.equal(a.toCents(v),null)});
test('date shortcuts handle leap year and week boundary',()=>{assert.deepEqual(copy(a.orderDateRange('lastMonth','2024-03-01')),{start:'2024-02-01',end:'2024-02-29'});assert.deepEqual(copy(a.orderDateRange('week','2026-10-22')),{start:'2026-10-19',end:'2026-10-25'})});
test('keyword, channel, workflow, order status and complaint dates compose',()=>{assert.equal(a.filtered({keyword:'3858',keywordType:'phone'}).length,1);assert.equal(a.filtered({keyword:'3858',keywordType:'phone',channel:'wechat'}).length,0);assert.ok(a.filtered({channel:'wechat',status:'待处理',orderStatus:'已到店'}).every(r=>r.channel==='wechat'&&r.status==='待处理'&&r.linked.length));assert.equal(a.filtered({start:'2099-01-01'}).length,0)});
test('order status filters linked orders independently of workflow, including every linked order',()=>{
  const recordCount=a.records.length,orderCount=a.orders.length,base=copy(a.records[0]);
  try{
    for(const [index,state]of ['已排客','已到店','已超时','已完成','已流退'].entries()){
      const order={...copy(a.orders[0]),id:'status-order-'+index,state};a.orders.push(order);
      const r={...copy(base),id:'order-state-'+index,status:'客服处理中',created:'2026-11-04 09:00',linked:[{id:order.id}]};a.records.push(r);
      assert.ok(a.complaintRow(r).split('</td>')[1].includes(state));
    }
    a.records.push({...copy(base),id:'order-state-multiple',status:'客服处理中',created:'2026-11-04 10:00',linked:[{id:'status-order-1'},{id:'status-order-3'}]});
    a.records.push({...copy(base),id:'order-state-unlinked',status:'已结案',created:'2026-11-04 10:00',linked:[]});
    for(const [index,state]of ['已排客','已到店','已超时','已完成','已流退'].entries()){
      const rows=a.filtered({orderStatus:state,status:'客服处理中',start:'2026-11-04',end:'2026-11-04'}).filter(r=>r.id.startsWith('order-state-'));
      assert.ok(rows.some(r=>r.id==='order-state-'+index));assert.equal(rows.length,[1,3].includes(index)?2:1);
    }
    const multi=a.records.find(r=>r.id==='order-state-multiple'),cell=a.complaintRow(multi).split('</td>')[1];
    for(const text of ['status-order-1','已到店','status-order-3','已完成'])assert.ok(cell.includes(text));
    assert.equal(a.filtered({orderStatus:'已完成',status:'已结案'}).filter(r=>r.id==='order-state-unlinked').length,0);
    assert.equal(a.filtered({orderStatus:'已到店',end:'2026-11-03'}).filter(r=>r.id.startsWith('order-state-')).length,0);
  }finally{a.records.splice(recordCount);a.orders.splice(orderCount)}
});
test('order search independent keyword/consultant/date criteria',()=>{assert.equal(a.matchingOrders({keywordType:'phone',keyword:'3858'}).length,2);assert.equal(a.matchingOrders({keywordType:'name',keyword:'王秀珍',consultant:'不存在'}).length,0)});
test('known customer opens all of their orders by ID regardless of masked contact or stale filters',()=>{
  const r=a.records.find(r=>r.id==='31001'),e=a.orderPickerState({...r,phone:'unknown'});
  e.orderFilters={keyword:'other person',keywordType:'name',start:'2099-01-01',consultant:'其他'};
  const matches=a.orderPickerOrders(e);assert.equal(matches.length,2);assert.ok(matches.every(o=>o.customerId===r.customerId));
  assert.ok(matches.some(o=>o.state==='已完成'));assert.equal(e.customerSearch.keyword,'');
  assert.ok(!a.orderPickerView(e).includes('id="uc-customer-search"'));
});
test('unlinked customers must explicitly confirm a member before orders become selectable',()=>{
  const r={customerId:null,phone:'150****3858',linked:[]},e=a.orderPickerState(r),before=JSON.stringify(r);
  assert.equal(a.orderPickerOrders(e).length,0);assert.ok(a.orderPickerView(e).includes('请先搜索客户'));
  assert.ok(a.orderPickerView(e).includes('id="uc-customer-search"'));
  e.customerFilters={keywordType:'member',keyword:a.orders[0].member};
  assert.equal(a.orderPickerCustomers(e).length,1);assert.equal(a.orderPickerOrders(e).length,0);
  assert.equal(a.selectPickerOrder(e,a.orders[0].id),false);
  assert.ok(a.selectPickerCustomer(e,a.orders[0].customerId));assert.equal(e.selection.length,0);
  assert.equal(a.orderPickerOrders(e).length,2);assert.ok(a.orderPickerOrders(e).every(o=>o.customerId===a.orders[0].customerId));
  assert.equal(JSON.stringify(r),before);assert.ok(a.orderPickerView(e).includes('更换客户'));
});
test('legacy manual IDs and typed member labels are not treated as customer bindings',()=>{
  for(const customerId of ['',null,'manual-40001']){
    const r={customerId,member:a.orders[0].member,name:a.orders[0].name,phone:'13800002901',linked:[]},e=a.orderPickerState(r);
    assert.equal(a.customerIdOf(r),'');assert.equal(e.customerSearch.keyword,r.phone);assert.equal(a.orderPickerCustomers(e).length,1);
    assert.equal(e.orderCustomerId,'');assert.equal(a.orderPickerOrders(e).length,0);assert.equal(a.orderPickerTitle(e),'关联客户及订单');
    assert.ok(a.summary(r).includes('未关联客户'));assert.ok(!a.summary(r).includes('data-uc="customer-detail"'));
    assert.ok(a.informationView(r).includes('关联客户及订单'));assert.ok(a.complaintRow({...r,id:'manual',linked:[],follows:[],status:'待处理'}).includes('未关联客户'));
  }
  assert.ok(!a.customerDirectory().some(item=>item.customerId.startsWith('manual-')));
});
test('customer candidates are deduplicated by ID and same-name matches remain distinct',()=>{
  const candidates=a.matchingCustomers({keywordType:'name',keyword:'林女士'});
  assert.ok(candidates.length>=2);assert.equal(new Set(candidates.map(item=>item.customerId)).size,candidates.length);
  const e=a.orderPickerState({customerId:'',phone:'',linked:[]});e.customerFilters={keywordType:'name',keyword:'林女士'};
  assert.equal(a.selectPickerCustomer(e,'C0'),false);assert.ok(a.selectPickerCustomer(e,candidates[0].customerId));
  const firstOrder=a.orderPickerOrders(e)[0];assert.ok(a.selectPickerOrder(e,firstOrder.id));a.changePickerCustomer(e);
  assert.equal(e.orderCustomerId,'');assert.equal(e.selection.length,0);assert.ok(a.selectPickerCustomer(e,candidates[1].customerId));
  assert.equal(a.selectPickerOrder(e,firstOrder.id),false);assert.equal(e.selection.length,0);
});
test('no-match and no-order cases retain the ticket and do not silently choose another customer',()=>{
  const e=a.orderPickerState({customerId:'',name:'未登记客户',phone:'',linked:[]});e.customerFilters={keywordType:'name',keyword:'不存在的客户'};
  assert.equal(a.orderPickerCustomers(e).length,0);assert.ok(a.orderPickerView(e).includes('暂不关联也可继续处理工单'));
  const count=a.records.length;
  try{
    a.records.push({customerId:'customer-without-orders',name:'无订单会员',phone:'13800001234',member:'unique-member',store:'测试门店'});
    e.customerFilters={keywordType:'member',keyword:'unique-member'};assert.ok(a.selectPickerCustomer(e,'customer-without-orders'));
    assert.equal(a.orderPickerOrders(e).length,0);assert.ok(a.orderPickerView(e).includes('该客户暂无订单'));
    assert.ok(a.orderPickerView(e).includes('更换客户'));
  }finally{a.records.splice(count)}
});
test('customer and order associations save together and retain original complaint contact and workflow',()=>{
  const source={id:'manual-test',customerId:'manual-40001',name:'来电登记的姓名',phone:'13800002901',member:'',channel:'legal',store:'原投诉门店',status:'客服处理中',linked:[],follows:[],logs:[]};
  const r=copy(source),e=a.orderPickerState(r);assert.ok(a.selectPickerCustomer(e,'C28'));
  const order=a.orderPickerOrders(e)[0];assert.ok(a.selectPickerOrder(e,order.id));assert.equal(JSON.stringify(r),JSON.stringify(source));
  const entry=a.recordOrderAssociation(r,e,'2026-11-04 10:00');assert.ok(entry);assert.equal(r.customerId,'C28');assert.equal(r.member,order.member);assert.equal(r.name,order.name);assert.equal(r.linked[0].id,order.id);
  assert.deepEqual(copy(r.originalContact),{name:source.name,phone:source.phone,fullPhone:''});assert.equal(r.status,source.status);assert.equal(r.store,source.store);assert.equal(r.channel,source.channel);
  assert.ok(!a.followTools().history(r).includes('原投诉联系人'));assert.equal(r.follows[0].originalContact.name,source.name);assert.ok(a.summary(r).includes('原投诉联系人'));
  const reopened=a.orderPickerState(JSON.parse(JSON.stringify(r)));assert.equal(reopened.orderBindingRequired,false);assert.ok(!a.orderPickerView(reopened).includes('id="uc-customer-search"'));
  const invalid=copy(source),forged={...e,selection:[{id:a.orders[0].id}]};assert.equal(a.recordOrderAssociation(invalid,forged,'2026-11-04 10:01'),null);assert.deepEqual(invalid,source);
  assert.equal(a.recordOrderAssociation({...copy(source),status:'已结案'},e,'2026-11-04 10:01'),null);
});
test('known customer without orders stays scoped instead of falling back to other customers',()=>{
  const e=a.orderPickerState({customerId:'no-orders',name:a.orders[0].name,phone:a.orders[0].phone,linked:[]});
  assert.equal(a.orderPickerOrders(e).length,0);const html=a.orderPickerView(e);
  assert.ok(html.includes('该客户暂无订单'));assert.ok(!html.includes('id="uc-customer-search"'));
});
test('opening and changing order selection preserves the parent until saving',()=>{
  const r=a.records.find(r=>r.id==='31001'),before=JSON.stringify(r),e=a.orderPickerState(r);
  assert.equal(e.selection.length,2);assert.ok(a.orderPickerView(e).includes('选择订单 '+r.linked[0].id));
  assert.ok(a.selectPickerOrder(e,r.linked[1].id));assert.equal(e.selection.length,1);assert.equal(JSON.stringify(r),before);assert.equal(e.selectionBaseline,JSON.stringify(r.linked));
});

test('radio selection replaces the previous choice and stays inside the known customer',()=>{
  const r=a.records.find(r=>r.id==='31001'),e={...a.orderPickerState(r),draft:{linked:copy(r.linked)}};
  const own=a.orderPickerOrders(e);assert.ok(a.selectPickerOrder(e,own[0].id));assert.equal(e.selection[0].id,own[0].id);
  assert.ok(a.selectPickerOrder(e,own[1].id));assert.equal(e.selection.length,1);assert.equal(e.selection[0].id,own[1].id);
  assert.equal(a.selectPickerOrder(e,a.orders.find(o=>o.customerId!==r.customerId).id),false);assert.equal(e.selection[0].id,own[1].id);
  const reopened=a.orderPickerState(r,e.selection),html=a.orderPickerView(reopened);assert.equal((html.match(/ checked/g)||[]).length,1);
  assert.ok(!html.includes('取消选择'));assert.ok(!html.includes('客户姓名'));assert.ok(!html.includes('咨询'));
});
const record=a.select('31001');const p=a.solutionDraft(null);
p.methods=['refund','exchange'];
p.refundOrderIds=a.solutionOrders().map(order=>order.id);
for(const row of a.refundEntries())a.solutionTools().selectFullRefund(p,row);
p.exchangeItems=[{productId:'repair-cream',quantity:'2'}];p.delivery={name:'验收',phone:'13800000000',address:'验收地址'};p.payout={method:'bank',name:'验收',account:'6222000000000000',bank:'验收银行'};
const valid=a.validateCustomerSolution(p);
test('multi-order refunds and combined solutions use integer cents',()=>{assert.equal(valid.errors.length,0);assert.equal(valid.value.refund,609900);assert.equal(valid.value.refundOrders.length,2);assert.equal(Object.hasOwn(valid.value,'compensation'),false);assert.equal(a.solutionTotals(p).exchange,36000);assert.equal(a.solutionTotals(p).refund,609900)});
test('removed compensation is excluded from drafts, submissions and totals',()=>{
  const legacy={...copy(valid.value),handlingMethods:['refund','compensation','exchange'],compensation:10000,compensationReason:'历史备注'};
  const restored=a.solutionDraft(legacy),result=a.validateCustomerSolution(restored);
  assert.deepEqual(copy(restored.methods),['refund','exchange']);assert.equal(result.errors.length,0);
  for(const value of [restored,result.value,a.solutionTotals({...restored,compensation:'100'})])assert.equal(Object.hasOwn(value,'compensation'),false);
  assert.equal(Object.hasOwn(result.value,'compensationReason'),false);assert.ok(a.solutionRead(legacy).includes('赔偿（历史）'));
  const invalid={...copy(p),methods:['compensation'],compensation:'100',compensationReason:'test'};
  assert.ok(a.validateCustomerSolution(invalid).errors.some(([field])=>field==='solutionMethods'));
});
test('order select-all affects only that order and preserves other selections',()=>{
  const d=a.solutionDraft(null),rows=a.refundEntries(),first=rows[0].order.id,other=rows.find(row=>row.order.id!==first);
  // No editor is mounted in this isolated check; make refresh a no-op.
  const tools=context.window.PCModules['complaint-solutions'].create({selectedRefundEntries:()=>rows,refundAvailable:a.refundAvailable,centsText:value=>(value/100).toFixed(2),getRecords:()=>a.records,getRecord:()=>record,savedRefundOrders:p=>p?.refundOrders||[],renderSolutionFields(){}});
  const root={querySelector(){return null}},control={dataset:{refundAll:first},hasAttribute:name=>name==='data-refund-all',checked:true};
  a.solutionTools().selectFullRefund(d,other);tools.syncRefund(control,d,root);
  assert.equal(Object.keys(d.refundAmounts).length,rows.length);
  control.checked=false;tools.syncRefund(control,d,root);assert.deepEqual(Object.keys(d.refundAmounts),[other.key]);assert.deepEqual(Object.keys(d.refundQuantities),[other.key]);
});
test('grouped orders allow selecting just one project and reopen all orders',()=>{
  const d=copy(p),first=a.refundEntries()[0];d.refundAmounts={[first.key]:p.refundAmounts[first.key]};
  const result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);assert.equal(result.value.refundOrders.length,1);assert.equal(result.value.refundOrders[0].refundItems.length,1);
  const restored=a.solutionDraft(result.value);assert.deepEqual(copy(restored.refundOrderIds),copy(a.solutionOrders().map(order=>order.id)));assert.equal(Object.keys(restored.refundAmounts).length,1);
});
test('full refund returns only unused quantities and leaves zero remaining',()=>{
  const item=valid.value.refundOrders[0].refundItems[0];
  assert.equal(item.quantity,5);assert.equal(item.consumedQuantity,2);assert.equal(item.refundedQuantity,0);assert.equal(item.remainingBefore,3);assert.equal(item.refundQuantity,3);assert.equal(item.remainingAfter,0);
  assert.deepEqual(copy(a.solutionDraft(valid.value).refundQuantities),copy(p.refundQuantities));
});
test('partial refund persists quantity and before/after snapshots independently of money',()=>{
  const d=copy(p),row=a.refundEntries()[0];d.refundAmounts[row.key]='1000';d.refundQuantities[row.key]='1';
  const result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);
  const item=result.value.refundOrders[0].refundItems[0];assert.equal(item.amount,100000);assert.equal(item.remainingBefore,3);assert.equal(item.refundQuantity,1);assert.equal(item.remainingAfter,2);
  assert.ok(a.solutionRead(result.value).includes('本次退款数量 1 · 退款前剩余 3 → 退款后剩余 2'));
  const reopened=a.solutionDraft(result.value);assert.equal(reopened.refundQuantities[row.key],'1');
  a.solutionTools().selectFullRefund(reopened,row);assert.equal(reopened.refundQuantities[row.key],'3');assert.equal(reopened.refundAmounts[row.key],'5500.00');
});
test('invalid, missing, excessive and fractional refund quantities are rejected',()=>{
  const row=a.refundEntries()[0];
  for(const quantity of ['',null,'-1','1.5','4','1e1','0','9007199254740992']){const d=copy(p);d.refundAmounts[row.key]='1000';d.refundQuantities[row.key]=quantity;assert.ok(a.validateCustomerSolution(d).errors.some(([field])=>field==='solution-refund-0-0-quantity'),String(quantity))}
  const d=copy(p);d.refundQuantities[row.key]='1';assert.ok(a.validateCustomerSolution(d).errors.some(([,message])=>message.includes('全额退款')));
});
test('consumed and previously refunded quantities cannot be returned again',()=>{
  const row=a.refundEntries()[0],project=row.order.projects[0],before=copy(project);
  try{
    project.refundedQuantity=1;let state=a.solutionTools().refundQuantityState(row.order,project);assert.equal(state.available,2);
    const d=copy(p);a.solutionTools().selectFullRefund(d,{...row,item:project});let result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);assert.equal(result.value.refundOrders[0].refundItems[0].refundedQuantity,1);
    project.consumedQuantity=4;state=a.solutionTools().refundQuantityState(row.order,project);assert.equal(state.available,0);
    a.solutionTools().selectFullRefund(d,{...row,item:project});result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);assert.equal(result.value.refundOrders[0].refundItems[0].refundQuantity,0);assert.equal(result.value.refundOrders[0].refundItems[0].remainingAfter,0);
  }finally{Object.assign(project,before)}
});
test('missing quantity records are not inferred from purchase quantity or refund amount',()=>{
  const row=a.refundEntries()[0],project=row.order.projects[0],before=copy(project),d=copy(p);
  try{delete project.consumedQuantity;assert.equal(a.solutionTools().refundQuantityState(row.order,project).available,null);assert.ok(a.validateCustomerSolution(d).errors.some(([,message])=>message.includes('数量记录不完整')))}finally{Object.assign(project,before)}
  const legacy=copy(valid.value);for(const group of legacy.refundOrders)for(const item of group.refundItems){delete item.refundQuantity;delete item.remainingBefore;delete item.remainingAfter}
  const restored=a.solutionDraft(legacy);assert.deepEqual(copy(restored.refundQuantities),{});assert.ok(a.solutionRead(legacy).includes('退款数量未记录'));assert.ok(!a.solutionRead(legacy).includes('退款后剩余 0'));assert.ok(a.validateCustomerSolution(restored).errors.some(([field])=>field.endsWith('-quantity')));
});
test('other plans reserve quantities; old plans with unknown quantities require checking',()=>{
  const another=a.records.find(r=>r.id!=='31001'),before=another.customerSolution,row=a.refundEntries()[0],d=copy(p);
  d.refundAmounts[row.key]='1000';d.refundQuantities[row.key]='1';const other=copy(a.validateCustomerSolution(d).value);
  try{
    another.customerSolution=other;assert.equal(a.solutionTools().refundQuantityState(row.order,row.item).available,2);
    const next=copy(p);a.solutionTools().selectFullRefund(next,row);assert.equal(next.refundQuantities[row.key],'2');assert.equal(next.refundAmounts[row.key],'4500.00');
    assert.ok(a.validateCustomerSolution(d).errors.some(([field])=>field.endsWith('-quantity'))); // Other selected projects are already reserved.
    delete other.refundOrders[0].refundItems[0].refundQuantity;assert.equal(a.solutionTools().refundQuantityState(row.order,row.item).available,null);
  }finally{another.customerSolution=before}
});
test('refund exceeding a project limit is rejected',()=>{const bad=copy(p);bad.refundAmounts[Object.keys(bad.refundAmounts)[0]]='5500.01';assert.ok(a.validateCustomerSolution(bad).errors.some(e=>e[1].includes('超过')))});
test('unlinked projects cannot be submitted',()=>{const bad=copy(p);bad.refundAmounts['unknown:item']='1';assert.ok(a.validateCustomerSolution(bad).errors.some(e=>e[1].includes('不属于')))});
test('empty refund selection and invalid delivery/product/payout are rejected',()=>{const bad=copy(p);bad.refundAmounts={};bad.delivery.phone='x';bad.exchangeItems[0].quantity='1.5';bad.payout.account='12';assert.ok(a.validateCustomerSolution(bad).errors.length>=4)});
test('hidden method fields do not affect the submitted solution',()=>{const hidden=copy(p);hidden.methods=['exchange'];assert.equal(a.validateCustomerSolution(hidden).errors.length,0);assert.equal(a.validateCustomerSolution(hidden).value.refund,0);assert.equal(Object.hasOwn(a.validateCustomerSolution(hidden).value,'compensation'),false)});
test('handling method and refund order remain required without removed attribution fields',()=>{
  assert.ok(a.validateCustomerSolution({...copy(p),methods:[]}).errors.some(([field])=>field==='solutionMethods'));
  assert.ok(a.validateCustomerSolution({...copy(p),refundOrderIds:[]}).errors.some(([field])=>field==='solution-refundOrders'));
  assert.equal(a.validateCustomerSolution(p).errors.length,0);assert.equal(p.refundDetails,undefined);
  for(const group of valid.value.refundOrders){assert.equal(group.refundStore,undefined);assert.equal(group.performanceId,undefined);assert.equal(group.refundReason,undefined)}
});
test('refund orders include only the current customer and exclude unrelated selections',()=>{
  assert.ok(a.solutionOrders().every(order=>order.customerId===record.customerId));
  const bad=copy(p);bad.refundOrderIds.push(a.orders.find(order=>order.customerId!==record.customerId).id);
  assert.ok(a.validateCustomerSolution(bad).errors.some(([field])=>field==='solution-refundOrders'));
  const linked=record.linked;record.linked=[];assert.equal(a.solutionOrders().length,2);record.linked=linked;
});
test('deselected order drafts remain available but are excluded from totals and saving',()=>{
  const d=copy(p),original=copy(d.refundAmounts);d.refundOrderIds=[d.refundOrderIds[1]];
  const result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);assert.equal(result.value.refund,29900);assert.equal(result.value.refundOrders.length,1);assert.equal(a.solutionTotals(d).refund,29900);assert.deepEqual(d.refundAmounts,original);
  d.refundOrderIds=copy(p.refundOrderIds);assert.equal(a.validateCustomerSolution(d).value.refund,609900);
});
test('solution attachments round-trip independently',()=>{
  const d=copy(p);d.attachments=[{name:'说明.pdf',type:'application/pdf',size:15,data:'data:application/pdf;base64,JVBERi0xLjQ='}];
  const result=a.validateCustomerSolution(d);assert.equal(result.errors.length,0);
  const restored=a.solutionDraft(result.value);assert.deepEqual(copy(restored.refundOrderIds),copy(d.refundOrderIds));assert.deepEqual(copy(restored.attachments),d.attachments);
  d.attachments=[{name:'bad.exe',type:'application/octet-stream',size:1}];assert.ok(a.validateCustomerSolution(d).errors.some(([field])=>field==='solution-attachments'));
});
test('grading is independent of responsibility and level 4 requires a risk type',()=>{const d={department:['门店'],type:'门店服务',responsible:['林晓'],level:'4级',level4Type:'',handlingPlan:'unresolved'};assert.equal(a.handlingMissing(d).length,0);assert.ok(a.followTools().gradeErrors(d).some(e=>e[0]==='level4Type'));d.level='2级';assert.equal(a.followTools().gradeErrors(d).length,0);assert.ok(a.followTools().gradeErrors({}).some(e=>e[0]==='level'));});
const draft={department:['门店'],type:'门店服务',responsible:['林晓'],level:'2级',level4Type:'',reason:'验收',firstContact:'验收',contactTime:'2026-10-22T14:30',complaintStore:'河源源城店',customerStatement:'验收',handlingPlan:'unresolved',handlingFiles:[],customerSolution:valid.value};
test('solutions can be saved only during customer-service handling',()=>{
  for(const status of a.WORK_ORDER_STATUSES){
    const r={...copy(record),status},before=JSON.stringify(r);
    const entry=a.recordCompensation(r,valid.value,'2026-10-26 14:00');
    if(['客服已接单','客服处理中'].includes(status)){
      assert.equal(entry.kind,'compensation');assert.equal(entry.beforeStatus,status);assert.equal(r.status,'财务审批中');
      assert.deepEqual(copy(r.customerSolution),copy(valid.value));assert.equal(a.hasHandlingScheme(r),false);
      const saved=JSON.stringify(r);assert.equal(a.recordCompensation(r,valid.value,'2026-10-26 14:01'),null);assert.equal(JSON.stringify(r),saved);
    }else{assert.equal(entry,null);assert.equal(JSON.stringify(r),before)}
  }
});
test('pending cannot save a solution or gain closure permission',()=>{
  const before=JSON.stringify(record);assert.equal(a.recordCompensation(record,valid.value,'2026-10-22 14:28'),null);
  assert.equal(JSON.stringify(record),before);assert.equal(a.canClose(record),false);
});
test('pending allows attribution without skipping acceptance or starting follow-up',()=>{const r=copy(record);assert.ok(a.recordRecognition(r,draft,'2026-10-22 14:29'));assert.equal(r.status,'待处理');assert.equal(a.canClose(r),false);assert.equal(a.recordFollow(r,{note:'x',files:[]},'2026-10-22 14:29'),null);assert.ok(!a.followTools().history(r).includes('责任认定'))});
test('accepting assigns the handler before processing and does not create a scheme',()=>{
  const result=a.recordAccept(record,'2026-10-22 14:28',{level:'2级'});assert.equal(result.kind,'accept');
  assert.equal(record.status,'客服已接单');assert.equal(record.acceptedAt,'2026-10-22 14:28');assert.equal(a.currentHandler(record),record.acceptedBy);
  assert.equal(record.assessedAt,undefined);assert.equal(a.canClose(record),false);assert.equal(a.recordAccept(record,'2026-10-22 14:29'),null);
  assert.ok(a.recordRecognition(copy(record),draft,'2026-10-22 14:29'));
  assert.ok(!a.detailActions(record).includes('start-processing'));assert.ok(a.detailActions(record).includes('begin-handling'));assert.ok(!a.detailActions(record).includes('close-case'));
});
test('accepted complaints enter processing when a business result is saved without another start action',()=>{
  const r=copy(record);assert.equal(r.status,'客服已接单');
  const result=a.recordCompensation(r,{...copy(valid.value),content:'更新方案'},'2026-10-22 14:29');
  assert.equal(result.beforeStatus,'客服已接单');assert.equal(r.status,'财务审批中');assert.equal(r.startedAt,'2026-10-22 14:29');
  assert.equal(r.assessedAt,undefined);assert.equal(a.canClose(r),false);assert.ok(!r.follows.some(f=>f.kind==='start'));
});
test('started and followed complaints cannot close before a saved handling scheme',()=>{const r=copy(record),original=JSON.stringify(r);assert.equal(a.canClose(r),false);assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);assert.equal(JSON.stringify(r),original);assert.ok(a.recordFollow(r,{note:'follow',files:[]},'2026-10-22 14:29'));assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);r.handlingPlan='unresolved';assert.equal(a.canClose(r),false)});
test('first scheme retains independently saved compensation and ignores solution fields from handling',()=>{assert.ok(a.recordCompensation(record,valid.value,'2026-10-22 14:29'));const approval=a.workflow.financeApproval(record);assert.ok(a.workflow.returnFinance(record,{approvalId:approval.id,result:'rejected',time:'2026-10-22 14:29',actor:'财务甲',reason:'请核对资料'}));const result=a.recordRecognition(record,{...draft,customerSolution:null},'2026-10-22 14:30');assert.ok(result);assert.equal(result.action,'责任认定');assert.equal(record.status,'客服处理中');assert.equal(record.follows[0].customerSolution.refundOrders.length,2)});
record.execution=null;record.financeApprovals=[];delete record.currentTask;delete record.statusDetail;
test('closure eligibility accepts saved and historical schemes but not pending or completed',()=>{assert.equal(a.canClose(record),true);const legacy=copy(record);delete legacy.assessedAt;assert.equal(a.canClose(legacy),true);assert.equal(a.canClose({...legacy,status:'待处理'}),false);assert.equal(a.canClose({...legacy,status:'已结案'}),false);assert.equal(a.canClose({...legacy,handlingPlan:''}),false)});
test('handling, responsibility and eligible closure are direct buttons without More',()=>{
  const primary=html=>(html.match(/class="btn primary"[^>]*data-uc="([^"]+)"/)||[])[1];
  for(const status of a.WORK_ORDER_STATUSES){
    const r={...copy(record),status},html=a.detailActions(r);
    assert.equal(primary(html),status==='待处理'?'accept-case':'begin-handling',status);
    assert.ok(html.includes('reply-customer'));assert.equal((html.match(/class="btn primary"/g)||[]).length,1);
    for(const action of ['begin-compensation','write-follow'])assert.ok(!html.includes(action));
    assert.equal(html.includes('begin-assessment'),a.canAssess(r)&&!a.hasAssessment(r));
    assert.ok(!html.includes('data-pc-menu'));
    assert.equal(html.includes('close-case'),status!=='客服处理中'&&a.canClose(r));
  }
});
test('unfinished downstream work blocks closure through both save and close actions',()=>{
  const r={...copy(record),execution:{index:1,steps:[{kind:'sales',type:'handling',done:true},{kind:'payment',type:'handling',done:false},{kind:'close',type:'handling',done:false}]}},before=JSON.stringify(r);
  assert.equal(a.canClose(r),false);assert.equal(a.recordClosure(r,'2026-11-03 12:00'),null);
  assert.equal(a.recordRecognition(r,{...draft,handlingPlan:'resolved'},'2026-11-03 12:00'),null);assert.equal(JSON.stringify(r),before);
  r.execution.steps[1].done=true;assert.equal(a.canClose(r),true);
  const noPayout={...copy(record),customerSolution:null,execution:null};assert.equal(a.canClose(noPayout),false);
  assert.ok(a.recordRecognition(noPayout,{...draft,handlingPlan:'resolved'},'2026-11-03 12:00'));assert.equal(noPayout.status,'已结案');
});
test('list tabs contain every canonical status and filter with other criteria',()=>{
  assert.deepEqual(copy(a.STATUS_TABS),[['','全部'],...copy(a.WORK_ORDER_STATUSES).map(status=>[status,status])]);
  for(const status of a.WORK_ORDER_STATUSES){assert.ok(a.filtered({status}).every(r=>r.status===status));assert.ok(a.filtered({status,channel:'wechat'}).every(r=>r.status===status&&r.channel==='wechat'))}
  assert.ok(!code.includes("select('status',WORK_ORDER_STATUSES"));
});
test('editing own refund does not reserve money or quantity twice',()=>{assert.equal(a.refundAvailable(a.refundEntries()[0].order,a.refundEntries()[0].item),550000);assert.equal(a.solutionTools().refundQuantityState(a.refundEntries()[0].order,a.refundEntries()[0].item).available,3);assert.equal(a.validateCustomerSolution(a.solutionDraft(record.customerSolution)).errors.length,0)});
test('other complaints reserve order and project refund amounts',()=>{const another=a.records.find(r=>r.id!=='31001');const previous=another.customerSolution;another.customerSolution=copy(valid.value);assert.equal(a.refundAvailable(a.refundEntries()[0].order,a.refundEntries()[0].item),0);assert.ok(a.validateCustomerSolution(p).errors.length);another.customerSolution=previous});
test('legacy single-order refund records still load',()=>{const group=valid.value.refundOrders[0];const old={handlingMethods:['refund'],refundOrderId:group.orderId,refund:group.refund,refundItems:group.refundItems};assert.equal(Object.keys(a.solutionDraft(old).refundAmounts).length,2)});
test('follow and closure preserve status boundaries',()=>{assert.ok(a.recordFollow(record,{note:'  回访  ',files:[]},'2026-10-22 14:31'));assert.equal(record.follows[0].note,'回访');assert.ok(a.recordClosure(record,'2026-10-22 14:32'));assert.equal(record.status,'已结案');const solution=JSON.stringify(record.customerSolution),closedAt=record.closedAt;assert.ok(a.recordFollow(record,{note:'结案后回访',files:[]},'2026-10-22 14:33'));assert.equal(record.status,'已结案');assert.equal(record.closedAt,closedAt);assert.equal(JSON.stringify(record.customerSolution),solution);assert.equal(record.follows[0].beforeStatus,'已结案');assert.equal(record.follows[0].status,'已结案');assert.equal(a.recordRecognition(record,draft,'2026-10-22 14:33'),null)});
test('customer attribution skips people independently of after-sales type and clears old assignments only when saved',()=>{const d={...draft,department:['客户自身'],type:'门店服务',responsible:[]};assert.equal(a.handlingMissing(d).length,0);assert.ok(a.handlingMissing({...d,department:['门店'],type:'闭店'}).some(e=>e[0]==='responsible'));const r={...copy(record),status:'客服处理中'};assert.ok(a.recordRecognition(r,{...d,responsible:['旧责任人'],responsibleByDepartment:{门店:['旧责任人']}},'2026-10-22 15:00'));assert.deepEqual(copy(r.department),['客户自身']);assert.deepEqual(copy(r.responsible),[]);assert.equal(r.reason,d.reason);assert.equal(Object.hasOwn(r,'responsibleByDepartment'),false)});
test('responsibility options include departed staff, historical snapshots and selected missing names',()=>{const options=a.responsibleOptions(['当前显示但不在册'],[{name:'离职责任人',employmentStatus:'离职'}],[{responsible:['历史责任人'],follows:[{responsible:['跟进责任人'],before:{responsible:['调整前责任人']}}]}],[{consultant:'订单顾问',projects:[{operator:'操作老师'}]}]);const map=new Map(options);for(const n of ['当前显示但不在册','历史责任人','跟进责任人','调整前责任人','订单顾问','操作老师'])assert.equal(map.get(n),n);assert.equal(map.get('离职责任人'),'离职责任人（离职）');assert.equal(a.responsibleOptions().find(([name])=>name==='张宁')[1],'张宁（离职）')});
test('handling attachment formats retain MIME verification',()=>{for(const f of [{name:'x.png',type:'image/png'},{name:'x.pdf',type:'application/pdf'},{name:'x.amr',type:''},{name:'x.m4a',type:'audio/x-m4a'}])assert.ok(a.validHandlingFile(f));for(const f of [{name:'x.exe',type:''},{name:'x.png',type:'application/pdf'},{name:'x.html',type:'text/html'}])assert.equal(a.validHandlingFile(f),false)});
test('CSV preserves filtered rows, Chinese BOM, quotes and formula protection',()=>{const csv=a.complaintCSV([{...copy(record),name:'=1+1',content:'包含,逗号和\"引号\"'}]);assert.equal(csv[0],'\uFEFF');assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('\"包含,逗号和\"\"引号\"\"\"'));assert.ok(csv.includes('\"已结案\"'))});
test('other four downstream stages retain direct closure while notes preserve their status',()=>{
  for(const status of ['采购审批中','待财务付款','待采购发货','客服复核中']){
    const r={...copy(record),status,assessedAt:null,handlingPlan:'',department:'',responsible:[],customerSolution:null,follows:[],execution:{index:0,steps:[{kind:'payment',type:'handling',done:false},{kind:'procurement',type:'handling',done:false}]}};
    assert.equal(a.canClose(r),true);
    assert.ok(a.recordRecognition(r,draft,'2026-11-02 12:00'));assert.equal(r.status,status);
    {assert.ok(a.recordFollow(r,{note:'继续核实',files:[]},'2026-11-02 12:01'));assert.equal(r.status,status)}
    assert.ok(!a.detailActions(r).includes('begin-assessment'));assert.ok(a.detailActions(r).includes('close-case'));
    const execution=JSON.stringify(r.execution),entry=a.recordClosure(r,'2026-11-02 12:02','客户撤回诉求，无需继续办理');
    assert.ok(entry);assert.equal(entry.beforeStatus,status);assert.equal(r.closedFromStatus,status);assert.equal(r.status,'已结案');assert.equal(JSON.stringify(r.execution),execution);
    assert.equal(a.canClose(r),false);assert.ok(!a.detailActions(r).includes('close-case'));assert.ok(!a.processView(r).includes('is-current'));assert.ok(a.processView(r).includes('已终止'));
  }
});
test('direct closure does not invent completed approvals, payment or shipment in demo timelines',()=>{
  const r=copy(a.records.find(item=>item.id==='31033'));
  assert.ok(a.recordClosure(r,'2026-11-03 14:00','无需继续退款和发货'));
  const html=a.processView(r);
  assert.ok(html.includes('已终止'));assert.ok(!html.includes('is-current'));assert.ok(html.includes('财务审批中操作结果'));assert.ok(!html.includes('采购审批中操作结果'));assert.ok(!html.includes('待财务付款操作结果'));assert.ok(!html.includes('待采购发货操作结果'));
  assert.ok(html.includes('无需继续退款和发货'));assert.ok(html.includes('11.03 14:00'));assert.equal(a.executionResultRecords(r).some(item=>['financeApproval','payment','procurement'].includes(item.stage)),false);
});
test('legacy labels normalize without losing the actual blocking issue or external status',()=>{
  for(const [old,status]of [['处理中','客服处理中'],['已完成','已结案'],['财务付款失败','待财务付款'],['采购部分发货','待采购发货'],['财务审批发起失败','财务审批中']]){
    const r={...copy(record),status:old,channelStatus:'处理中'};a.normalizeRecordStatus(r);
    assert.equal(r.status,status);assert.equal(r.channelStatus,'处理中');
    if(!['处理中','已完成'].includes(old)){assert.equal(a.currentTask(r),old);assert.equal(r.statusDetail,old)}
    assert.deepEqual(copy(r.follows),copy(record.follows));assert.deepEqual(copy(r.customerSolution),copy(record.customerSolution));
  }
});
test('renamed statuses retain old records without turning labels into blocking issues',()=>{
  const aliases=[['客服接单','客服已接单'],['门店待处理','客服处理中'],['财务付款中','待财务付款'],['采购执行中','待采购发货'],['采购待发货','待采购发货']];
  for(const [old,status]of aliases){
    const r={...copy(record),status:old};delete r.statusDetail;a.normalizeRecordStatus(r);
    assert.equal(r.status,status);assert.equal(r.statusDetail,undefined);assert.ok(!a.currentTask(r).includes(old));
  }
  const accepted={...copy(record),status:'客服接单'};a.normalizeRecordStatus(accepted);
  assert.ok(a.recordRecognition(accepted,draft,'2026-11-03 11:00'));assert.equal(accepted.status,'客服处理中');
});
test('historical suspension retains its pause and ownership without becoming a selectable status',()=>{
  assert.ok(!a.WORK_ORDER_STATUSES.includes('已挂起'));assert.ok(!a.WORK_ORDER_STATUSES.includes('门店待处理'));
  const r={...copy(record),status:'已挂起',suspension:{returnState:'客服处理中',reason:'历史记录'}};
  const history=JSON.stringify(r.follows);a.normalizeRecordStatus(r);
  assert.equal(r.status,'客服处理中');assert.ok(r.legacySuspended);assert.equal(a.canClose(r),false);
  assert.equal(JSON.stringify(r.follows),history);assert.equal(r.suspension.reason,'历史记录');
  assert.ok(a.processView(r).includes('节点计时已暂停'));assert.ok(!a.detailActions(r).includes('begin-assessment'));
  assert.equal(a.workOrderStatus('已挂起',{execution:{index:0,steps:[{kind:'payment',type:'handling'}]}}),'待财务付款');
});
test('status filters and groups use department stages rather than fault attribution',()=>{
  const original=a.records.length;
  try{
    for(const [i,status]of a.WORK_ORDER_STATUSES.entries())a.records.push({...copy(record),id:'status-'+i,status,department:['门店'],channel:'hotline'});
    for(const status of a.WORK_ORDER_STATUSES){const rows=a.filtered({status,channel:'hotline'});assert.equal(rows.length,1);assert.equal(rows[0].status,status)}
    assert.equal(a.filtered({scope:'pending',channel:'hotline'}).length,2);
    assert.equal(a.filtered({scope:'active',channel:'hotline'}).length,6);
    assert.equal(a.filtered({scope:'closed',channel:'hotline'}).length,1);
    assert.equal(a.filtered({status:'待财务付款',department:'门店',channel:'hotline'}).length,1);
  }finally{a.records.splice(original)}
});
test('twelve intake sources use the requested names and order across filters, lists, details and exports',()=>{
  assert.deepEqual(copy(Object.values(a.CHANNELS)),['门店发起售后','400客服热线','微信小程序','销售企微头像','销售企微侧边栏','销售微动后台','财务业绩核对','广告平台投诉','微信支付投诉','银盛支付投诉','工商/法人投诉','原路退款']);
  const original=a.records.length;
  try{for(const channel of Object.keys(a.CHANNELS))a.records.push({...copy(record),id:'source-'+channel,channel});
    for(const [channel,label]of Object.entries(a.CHANNELS)){
      const rows=a.filtered({channel}).filter(r=>r.id.startsWith('source-'));assert.equal(rows.length,1);
      assert.ok(a.complaintRow(rows[0]).includes(label));assert.ok(a.summary(rows[0]).includes(label));assert.ok(a.complaintCSV(rows).includes(label));
    }
  }finally{a.records.splice(original)}
});
test('list retains orders and complaint content with a single workflow status',()=>{
  const r={...copy(record),status:'待财务付款',statusDetail:'收款账户待核实',currentHandler:'财务甲',content:'完整投诉正文标记',member:'会员标记',phone:'电话标记',department:['门店'],responsible:['责任乙'],channel:'legal',type:'服务类',submitter:'客户本人'};
  const html=a.complaintRow(r);for(const value of ['待财务付款','责任乙','工商/法人投诉',r.level,r.content,r.member,r.phone,r.linked[0].id,r.store])assert.ok(html.includes(value));
  for(const value of ['财务甲','当前事项 / 卡点','当前处理节点','发起人','客户本人'])assert.ok(!html.includes(value));
  const cells=html.split('</td>');assert.ok(!cells[5].includes(r.statusDetail));assert.ok(cells[6].includes('责任乙'));
  assert.ok(cells[6].includes('售后类型：'+r.type));
  assert.ok(cells[3].includes('工单号：'+r.id));
  assert.ok(cells[3].includes(r.content));
  assert.ok(!cells[3].includes(r.type));
  assert.ok(a.complaintCSV([r]).includes('收款账户待核实'));
});
test('list timing uses the saved deadline and China time, showing overdue only after the deadline',()=>{
  const r={...copy(record),status:'客服处理中',communicationPeriods:[{id:'p1',dueAt:'2026-11-04 10:00',endedAt:''}]},before=JSON.stringify(r);
  const at=text=>Date.parse(text+'+08:00');
  assert.equal(a.complaintTiming(r,at('2026-11-04T09:00:00')).overdue,0);assert.equal(a.complaintTiming(r,at('2026-11-04T10:00:00')).overdue,0);
  assert.equal(a.complaintTiming(r,at('2026-11-04T10:00:20')).duration,'不足1分钟');
  const late=a.complaintTiming(r,at('2026-11-04T12:35:00'));assert.equal(late.dueAt,'2026-11-04 10:00');assert.equal(late.duration,'2小时35分钟');assert.equal(late.overdue,155*60000);
  assert.equal(a.complaintTiming(r,at('2026-11-06T13:00:00')).duration,'2天3小时');
  assert.ok(a.complaintTimingHTML(r,at('2026-11-04T12:35:00')).includes('已超时 2小时35分钟'));
  const early=a.complaintTimingHTML(r,at('2026-11-04T09:00:00'));assert.ok(early.includes('截止 11-04 10:00'));assert.ok(!early.includes('已超时'));
  r.communicationPeriods[0].dueAt='2026-11-04T02:00:00Z';assert.equal(a.complaintTiming(r).dueAt,late.dueAt);r.communicationPeriods[0].dueAt='2026-11-04 10:00';assert.equal(JSON.stringify(r),before);
});
test('finished timing freezes overtime and missing timing never borrows an older period or current configuration',()=>{
  const r={...copy(record),status:'财务审批中',communicationPeriods:[{id:'old',dueAt:'2026-11-03 10:00',endedAt:'2026-11-03 12:00'}]},farFuture=Date.parse('2030-01-01T00:00:00+08:00');
  assert.equal(a.complaintTiming(r,farFuture).duration,'2小时');assert.equal(a.complaintTiming(r,farFuture).ended,true);
  r.communicationPeriods.push({id:'new',dueAt:'',endedAt:''});assert.equal(a.complaintTiming(r,farFuture),null);
  r.communicationPeriods[1].dueAt='invalid';assert.equal(a.complaintTiming(r,farFuture),null);
  r.communicationPeriods[1].dueAt='2026-11-04 10:00';r.status='已结案';r.closedAt='2026-11-04 11:30';assert.equal(a.complaintTiming(r,farFuture).duration,'1小时30分钟');
  r.closedAt='';r.follows=[];assert.equal(a.complaintTiming(r,farFuture).overdue,0);
  r.status='待处理';assert.equal(a.complaintTiming(r,farFuture),null);
  r.status='客服处理中';r.communicationPeriods=[];r.id='real-without-clock';assert.equal(a.complaintTiming(r,farFuture),null);assert.ok(!a.complaintTimingHTML(r).includes('截止'));
});
test('existing complaint fixtures show both pending deadlines and overtime without rewriting records or configuration',()=>{
  const at=Date.parse('2026-11-04T12:00:00+08:00'),before=JSON.stringify(a.records),dictionary=context.window.PCComplaintOptions,configBefore=JSON.stringify(dictionary.current);
  const active=a.records.filter(r=>r.status!=='待处理'),timings=active.map(r=>a.complaintTiming(r,at));
  assert.ok(active.length>0);assert.ok(timings.every(Boolean));assert.ok(timings.some(timing=>!timing.ended&&timing.overdue>0));assert.ok(timings.some(timing=>!timing.ended&&timing.overdue===0));
  for(const r of active)assert.ok(a.complaintTimingHTML(r,at).includes('截止 '));
  assert.equal(JSON.stringify(a.records),before);assert.equal(JSON.stringify(dictionary.current),configBefore);
  const r=copy(active[0]);r.communicationPeriods=[{id:'saved',dueAt:'2026-11-10 10:00',endedAt:''}];assert.equal(a.complaintTiming(r,at).dueAt,'2026-11-10 10:00');assert.equal(a.complaintTiming(r,at).mock,false);
  r.communicationPeriods[0].dueAt='';assert.equal(a.complaintTiming(r,at),null);
  r.communicationPeriods=[];r.name='真实客户';assert.equal(a.complaintTiming(r,at),null);
});
test('old fixture deadlines prefer configured demand overrides, falling back to grade defaults',()=>{
  const dict=context.window.PCComplaintOptions,descriptor=Object.getOwnPropertyDescriptor(dict,'current');
  const r=copy(a.records.find(r=>r.id==='31031')),config={...dict.current,defaultTimings:{'2级':3},demandTimings:{正和客户协商退款金额:{byLevel:{'2级':1}}}};
  Object.defineProperty(dict,'current',{get:()=>copy(config)});
  try{
    const oneDay=a.complaintTiming(r);assert.equal(oneDay.dueAt,'2026-11-04 13:22');
    delete config.demandTimings.正和客户协商退款金额;assert.equal(a.complaintTiming(r).dueAt,'2026-11-06 13:22');
    r.communicationPeriods=[{dueAt:'2026-11-05 09:00',endedAt:''}];assert.equal(a.complaintTiming(r).dueAt,'2026-11-05 09:00');
  }finally{Object.defineProperty(dict,'current',descriptor)}
});
test('accepted list progress shows the recorded acceptor, independent of the current handler',()=>{
  const r={...copy(record),status:'客服已接单',acceptedBy:'客服甲',currentHandler:'客服乙',statusDetail:'旧事项',follows:[{kind:'accept',actor:'客服甲'}]};
  assert.equal(a.listProgressText(r),'接单人：客服甲');
  const cell=a.complaintRow(r).split('</td>')[5];assert.ok(cell.includes('客服已接单'));assert.ok(cell.includes('接单人：客服甲'));assert.ok(!cell.includes('客服乙'));assert.ok(!cell.includes('旧事项'));
  delete r.acceptedBy;assert.equal(a.listProgressText(r),'接单人：客服甲');
  r.follows=[];assert.equal(a.listProgressText(r),'');
});
test('list progress follows the latest unresolved reason and clears old reasons after agreement or confirmation',()=>{
  const r={...copy(record),status:'客服处理中',customerSolution:null,compensatedAt:null,customerDemand:'旧诉求',follows:[{kind:'follow',time:'2026-11-04 12:00',note:'普通补充'},{kind:'follow',time:'2026-11-04 11:00',communication:{result:'ongoing',reason:'无法联系上客户',reasonSource:'demands'}}]};
  assert.equal(a.listProgressText(r),'无法联系上客户');assert.ok(a.complaintRow(r).split('</td>')[5].includes('无法联系上客户'));
  r.follows.unshift({kind:'follow',time:'2026-11-04 13:00',communication:{result:'ongoing',reason:'amount'}});assert.equal(a.listProgressText(r),'客户不认可方案金额');
  r.follows.unshift({kind:'follow',time:'2026-11-04 14:00',communication:{result:'agreed'}});assert.equal(a.listProgressText(r),'');
  r.customerSolution={methods:['refund']};r.compensatedAt='2026-11-04 15:00';assert.equal(a.listProgressText(r),'');
  r.follows=[];r.customerSolution=null;r.compensatedAt=null;r.customerDemand='无法联系上客户';r.statusDetail='旧事项';r.currentTask='待客服处理';assert.equal(a.listProgressText(r),'无法联系上客户');
  r.customerDemand='';assert.equal(a.listProgressText(r),'');
  r.customerDemand='旧诉求';r.follows=[{kind:'compensation'}];assert.equal(a.listProgressText(r),'');
});
test('approval list progress shows the current department result and marks rejection in red',()=>{
  for(const department of ['财务','采购']){
    const r={...copy(record),status:department+'审批中',compensatedAt:null,statusDetail:'',currentTask:'',execution:null,follows:[]};
    assert.equal(a.listProgressText(r),'处理中');
    r.follows=[{kind:'workflow',action:department+'审批',time:'2026-11-06 10:00',fields:[['审批结果','已驳回']]}];
    assert.equal(a.listProgressText(r),department+'驳回');
    const cell=a.complaintRow(r).split('</td>')[5];assert.ok(cell.includes(department+'审批中'));assert.ok(cell.includes('uc-progress-task uc-error'));assert.ok(cell.includes(department+'驳回'));
    r.statusDetail=department+'驳回';r.follows=[];assert.equal(a.listProgressText(r),department+'驳回');
    r.execution={index:0,steps:[{type:'approval',title:department+'审批',approvalResult:'审批中'}]};
    assert.equal(a.listProgressText(r),'处理中');assert.ok(!a.complaintRow(r).split('</td>')[5].includes('uc-error'));
    r.execution.steps[0].approvalResult='未通过';assert.equal(a.listProgressText(r),department+'驳回');
  }
});
test('approval list progress does not reuse another department or a previous submission result',()=>{
  const r={...copy(record),status:'采购审批中',compensatedAt:'2026-11-06 10:00',statusDetail:'',currentTask:'',execution:null,follows:[
    {kind:'workflow',action:'采购审批',time:'2026-11-06 09:00',fields:[['审批结果','已驳回']]},
    {kind:'workflow',action:'财务审批',time:'2026-11-06 11:00',fields:[['审批结果','已通过']]}
  ]};
  assert.equal(a.listProgressText(r),'处理中');
  r.follows.push({kind:'workflow',action:'采购审批',time:'2026-11-06 12:00',fields:[['审批结果','已驳回']]});
  assert.equal(a.listProgressText(r),'采购驳回');
  r.follows.push({kind:'workflow',action:'采购审批',time:'2026-11-06 13:00',fields:[['审批结果','审批中']]});
  const before=JSON.stringify(r);assert.equal(a.listProgressText(r),'处理中');assert.equal(JSON.stringify(r),before);
});
test('pending, payment, shipment and later list stages retain only the status even when operation details exist',()=>{
  const r={...copy(record),acceptedBy:'客服甲',customerDemand:'无法联系上客户',statusDetail:'收款账户待核实',currentTask:'旧事项',follows:[{kind:'follow',communication:{result:'ongoing',reason:'无法联系上客户'}}]};
  for(const status of a.WORK_ORDER_STATUSES.filter(status=>!['客服已接单','客服处理中','财务审批中','采购审批中'].includes(status))){
    r.status=status;assert.equal(a.listProgressText(r),'');
    const cell=a.complaintRow(r).split('</td>')[5];assert.ok(cell.includes(status));assert.ok(!cell.includes('uc-progress-task'));
  }
});
test('process history uses recorded transitions without inventing department work or changing records',()=>{
  const r={id:'history',created:'2026-11-03 09:00',submitter:'客户',status:'待财务付款',department:['门店'],currentHandler:'财务甲',statusDetail:'收款账户待核实',logs:[],follows:[]};
  const accepted={kind:'accept',time:'2026-11-03 09:10',actor:'客服甲',beforeStatus:'待处理',status:'客服接单',note:'已接单'};
  const started={kind:'start',time:'2026-11-03 09:20',actor:'客服甲',beforeStatus:'客服接单',status:'处理中',note:'已开始处理'};
  r.follows=[{kind:'follow',time:'2026-11-03 09:30',actor:'客服甲',beforeStatus:'待财务付款',status:'待财务付款',note:'客户沟通内容'},started,accepted];
  r.acceptedAt=accepted.time;r.acceptedBy=accepted.actor;r.startedAt=started.time;r.startedBy=started.actor;
  const before=JSON.stringify(r),rows=a.processRecords(r);
  assert.deepEqual(Array.from(rows,item=>item.title),['收到投诉','客服接单','开始处理']);
  assert.equal(rows[2].status,'客服处理中');assert.equal(a.processingDepartment(r),'财务');
  const html=a.summary(r)+a.processView(r);for(const value of ['待财务付款','财务甲','收款账户待核实'])assert.ok(html.includes(value));
  assert.ok(html.includes('客户沟通内容'));assert.ok(!html.includes('付款成功'));assert.equal(JSON.stringify(r),before);
});
test('phone disclosure uses a supplied full number and remains masked by default without changing records',()=>{
  const r={...copy(a.records.find(r=>r.id==='31017')),fullPhone:'15900003076',status:'客服处理中'};
  const original=JSON.stringify(r),hidden=a.summary(r),shown=a.summary(r,true);
  assert.equal(a.phoneView(r).value,'159****3076');assert.equal(a.phoneView(r,true).value,r.fullPhone);
  assert.ok(hidden.includes('查看完整号码'));assert.ok(hidden.includes('aria-expanded="false"'));assert.ok(!hidden.includes(r.fullPhone));
  assert.ok(shown.includes(r.fullPhone));assert.ok(shown.includes('收起号码'));assert.ok(shown.includes('aria-expanded="true"'));
  assert.ok(hidden.indexOf('客服处理中')<hidden.indexOf('3级'));assert.equal(JSON.stringify(r),original);
  assert.ok(!a.summary({...r,phone:r.fullPhone,fullPhone:''}).includes(r.fullPhone));
});
test('masked-only records cannot reveal invented numbers and empty phone records have no reveal action',()=>{
  const masked={phone:'159****3076'},missing={phone:''};
  assert.equal(a.phoneView(masked,true).canReveal,false);assert.equal(a.phoneView(masked,true).value,masked.phone);
  assert.equal(a.phoneView({...masked,fullPhone:'159****3076'},true).canReveal,false);
  assert.equal(a.phoneView(missing,true).value,'—');
  assert.ok(!a.summary({...a.records[0],...missing}).includes('data-uc="toggle-phone"'));
});
test('process history preserves recorded closure and leaves missing actors and stages unknown',()=>{
  const r={status:'已完成',closedAt:'2026-11-03 10:00',closedBy:'客服乙',follows:[],logs:[]};
  const rows=a.processRecords(r);assert.equal(rows.length,1);assert.equal(rows[0].title,'结案');assert.equal(rows[0].status,'已结案');assert.equal(a.processingDepartment(r),'—');
  assert.equal(a.processRecords({status:'待采购发货',follows:[],logs:[]}).length,0);
  assert.equal(a.processingDepartment({status:'已挂起',department:['门店']}),'售后客服');
});
test('process displays the recorded route with current approval, future nodes and overdue timing without mutating it',()=>{
  const r={status:'财务审批中',currentHandler:'财务甲',taskDeadline:'2020-01-01 10:00',execution:{index:1,steps:[
    {id:'sales',type:'handling',kind:'sales',title:'售后办理',done:true,people:['客服乙'],completedAt:'2020-01-01 09:00'},
    {id:'approval',type:'approval',title:'付款审批',external:{url:'https://example.com/approval/1'}},
    {id:'pay',type:'handling',kind:'payment',title:'付款办理'},
    {id:'close',type:'handling',kind:'close',title:'客服复核'}
  ]}};
  const before=JSON.stringify(r),html=a.processView(r);
  for(const value of ['已完成 1 / 4','售后办理','财务审批','财务付款','客服复核','财务甲','客服乙','财务审批中','已超时','01.01 09:00','到达后分派','查看审批'])assert.ok(html.includes(value),value);
  assert.equal((html.match(/aria-current="step"/g)||[]).length,1);
  assert.equal((html.match(/uc-process-node is-future/g)||[]).length,2);
  assert.ok(!html.includes('预计完成'));
  assert.ok(!html.includes('<details'));assert.equal(JSON.stringify(r),before);
});
test('legacy stages group customer-service actions and do not invent payment or approval from a saved solution',()=>{
  const r={status:'客服处理中',currentHandler:'客服甲',customerSolution:{methods:['refund']},follows:[
    {kind:'assessment',time:'2026-11-03 09:30',actor:'客服甲',beforeStatus:'客服处理中',status:'客服处理中'},
    {kind:'start',time:'2026-11-03 09:20',actor:'客服甲',beforeStatus:'客服接单',status:'客服处理中'},
    {kind:'accept',time:'2026-11-03 09:10',actor:'客服甲',beforeStatus:'待处理',status:'客服接单'}
  ]};
  const html=a.processView(r);
  assert.ok(html.includes('已完成 1 / 2'));assert.ok(html.includes('客服接单'));assert.ok(html.includes('售后办理'));
  assert.ok(!html.includes('财务审批'));assert.ok(!html.includes('财务付款'));assert.ok(!html.includes('查看审批'));
  assert.ok(html.includes('办理时限待确认'));assert.ok(!html.includes('已超时'));
  const closed=a.processView({status:'已结案',closedAt:'2026-11-03 10:00',closedBy:'客服乙',follows:[]});
  assert.ok(closed.includes('客服复核'));assert.ok(!closed.includes('售后办理'));assert.ok(!closed.includes('流程已结束'));
});
test('local example flow shows completed, active and future stages while preserving saved complaint data',()=>{
  const r={...copy(a.records.find(r=>r.id==='31017')),status:'客服处理中',currentHandler:'客服甲',startedAt:'2026-11-03 09:30',customerSolution:null};
  const before=JSON.stringify(r),html=a.processView(r);
  for(const value of ['已完成 2 / 9','待处理','客服已接单','客服处理中','客服复核中','已结案','is-done','is-current','is-future','客服甲'])assert.ok(html.includes(value),value);
  assert.ok(html.includes('财务审批中'));assert.ok(html.includes('采购审批中'));assert.ok(html.includes('未开始'));
  assert.ok(!html.includes('示例流程'));
  assert.equal(JSON.stringify(r),before);
  assert.ok(!a.summary(r).includes('uc-ticket-progress'));assert.ok(a.summary(r).includes(r.content));
  for(const status of a.WORK_ORDER_STATUSES){
    const view=a.processView({...r,status});
    assert.equal((view.match(/aria-current="step"/g)||[]).length,status==='已结案'?0:1,status);
    if(status==='已结案'){assert.ok(!view.includes('is-future'));assert.ok(!view.includes('流程已结束'));}
  }
});
test('example routes include procurement branches without store handoff and leave actual workflow records authoritative',()=>{
  const own=copy(a.records.find(r=>r.id==='31017'));
  for(const [status,node]of [['采购审批中','采购审批'],['待采购发货','采购发货']])assert.ok(a.processView({...own,status}).includes(node));
  assert.ok(!a.processView({...own,customerId:'unrelated'}).includes('财务审批'));
  const actual={...own,execution:{index:0,steps:[{type:'handling',title:'真实办理节点',people:['实际办理人']}]}};
  const html=a.processView(actual);assert.ok(html.includes('真实办理节点'));assert.ok(!html.includes('示例流程'));assert.ok(!html.includes('财务审批'));
  const pending=a.processView({...own,status:'待处理',currentHandler:'',acceptedBy:'',startedBy:''});
  assert.ok(pending.includes('已完成 0 / 9'));assert.ok(pending.includes('提交人：'));assert.ok(pending.includes('10.19 17:05'));
});
test('each status has a complete lifecycle example with results only on reached nodes',()=>{
  const examples=a.records.filter(r=>Number(r.id)>=31029&&Number(r.id)<=31037);
  assert.equal(examples.length,9);
  const result=(html,status)=>[...html.matchAll(/<li class="uc-process-node[\s\S]*?<\/li>/g)].map(match=>match[0]).find(node=>node.includes(`<strong class="uc-process-title">${status}</strong>`));
  examples.forEach((record,index)=>{
    assert.equal(record.status,a.WORK_ORDER_STATUSES[index]);
    assert.ok(a.filtered({status:record.status}).some(row=>row.id===record.id));
    const before=JSON.stringify(record),html=a.processView(record);
    assert.equal((html.match(/<li class="uc-process-node/g)||[]).length,9);
    assert.equal((html.match(/aria-current="step"/g)||[]).length,index===8?0:1);
    for(const [stage,status]of a.WORK_ORDER_STATUSES.entries()){
      const node=result(html,status);assert.ok(node,status);
      if(stage>index)assert.ok(!node.includes('uc-process-results'),status+' future result');
    }
    if(index<3){assert.ok(!html.includes('已通过'));assert.ok(!html.includes('DEMO-SF'));}
    if(index>=1)assert.ok(result(html,'客服已接单').includes('2级'));
    if(index===2)for(const value of ['方案未达成一致','正和客户协商退款金额'])assert.ok(result(html,'客服处理中').includes(value));
    if(index>=3)for(const value of ['已确认解决方案','退款金额','舒缓修护霜 50g × 2'])assert.ok(result(html,'客服处理中').includes(value));
    if(index>=3)assert.ok(result(html,'财务审批中').includes(index===3?'审批中':'已通过'));
    if(index>=4)assert.ok(result(html,'采购审批中').includes(index===4?'审批中':'已通过'));
    if(index>=5)assert.ok(result(html,'待财务付款').includes(index===5?'待执行':'成功'));
    if(index>=6)assert.ok(result(html,'待采购发货').includes(index===6?'待安排发货':'DEMO-SF-'+record.id));
    if(index>=7){const review=result(html,'客服复核中');assert.ok(review.includes('客户反馈'));assert.ok(review.includes(index===7?'客户确认退款已到账，等待签收置换商品。':'商品已签收，客户无其他诉求。'));assert.ok(!review.includes('<dt>复核结果</dt>'));assert.equal((review.match(/<dt>/g)||[]).length,1);}
    if(index===8)assert.ok(result(html,'已结案').includes(record.closeNote));
    assert.equal(JSON.stringify(record),before);
  });
  const closed=examples.at(-1),history=a.followTools().history(closed,a.executionResultRecords(closed));
  for(const value of ['正和客户协商退款金额','退款金额','DEMO-PAY-'+closed.id,'DEMO-SF-'+closed.id,'客户确认处理完成',closed.closeNote])assert.ok(history.includes(value),value);
});
test('original lifecycle examples have dated results without skipped nodes, and intake shows only the submitter',()=>{
  for(const saved of a.records.filter(r=>Number(r.id)<=31037)){
    for(const record of [copy(saved),{...copy(saved),status:'已结案'}]){
      const before=JSON.stringify(record),html=a.processView(record),nodes=[...html.matchAll(/<li class="uc-process-node[\s\S]*?<\/li>/g)].map(match=>match[0]);
      assert.equal(nodes.length,9,record.id);
      for(const text of ['完成时间未记录','已跳过','无需办理','undefined'])assert.ok(!html.includes(text),record.id+': '+text);
      assert.ok(nodes[0].includes('提交人：'));assert.ok(nodes[0].includes(record.submitter));assert.ok(!nodes[0].includes('uc-process-results'));
      for(const node of nodes){
        if(node.includes('is-done')||node.includes('is-current'))assert.match(node,/\d{2}\.\d{2} \d{2}:\d{2}/,record.id);
        if(node!==nodes[0]&&(node.includes('is-done')||node.includes('is-current')))assert.ok(node.includes('uc-process-results'),record.id);
        if(node.includes('is-future'))assert.ok(!node.includes('uc-process-results'),record.id);
      }
      assert.equal(JSON.stringify(record),before);
    }
  }
  const old={...copy(a.records.find(r=>r.id==='31016')),status:'已结案'};
  const history=a.followTools().history(old,a.executionResultRecords(old));
  for(const text of ['财务付款','采购发货','客服复核','DEMO-SF-'+old.id])assert.ok(history.includes(text),text);
  for(const text of ['财务审批','采购审批'])assert.ok(!history.includes(text),text);
});
test('customer-service examples mirror unresolved communication and confirmed solution forms without replacing saved follow-ups',()=>{
  const sales=record=>[...a.processView(record).matchAll(/<li class="uc-process-node[\s\S]*?<\/li>/g)].map(match=>match[0]).find(node=>node.includes('<strong class="uc-process-title">客服处理中</strong>'));
  for(const [id,reason]of [['31004','正和客户协商退款金额'],['31005','无法联系上客户']]){
    const r=a.records.find(record=>record.id===id),before=JSON.stringify(r),html=sales(r);
    for(const value of ['本次操作','方案未达成一致','未达成原因',reason,'沟通内容'])assert.ok(html.includes(value),id+': '+value);
    assert.equal(JSON.stringify(r),before);
    assert.ok(a.followTools().history(r,a.executionResultRecords(r)).includes(reason));
  }
  const confirmed=sales(a.records.find(record=>record.id==='31009'));
  for(const value of ['已确认解决方案','退款金额','置换商品','方案说明'])assert.ok(confirmed.includes(value));
  assert.ok(!confirmed.includes('未达成原因'));
  const saved={...copy(a.records.find(record=>record.id==='31004')),follows:[{kind:'follow',mock:false,time:'2026-11-03 15:00',beforeStatus:'客服处理中',status:'客服处理中',communication:{result:'ongoing',reason:'实际填写的原因',reasonSource:'demands'},note:'实际填写的沟通内容'}]};
  const actual=sales(saved);assert.ok(actual.includes('实际填写的原因'));assert.ok(actual.includes('实际填写的沟通内容'));assert.ok(!actual.includes('已逐项说明已消费项目'));
});
test('node summaries use recorded grades, communication, confirmed solutions and execution results without attachments',()=>{
  const proof={name:'付款凭证.png',data:'data:image/png;base64,eA=='};
  const solution={handlingMethods:['refund','exchange'],refund:120000,exchangeItems:[{name:'修护霜',quantity:2}],delivery:{name:'客户',phone:'13800000000',address:'完整收货地址'}};
  const r={status:'客服复核中',level:'4级',currentHandler:'客服甲',follows:[
    {kind:'compensation',nodeId:'sales',time:'2026-11-03 11:00',actor:'客服甲',customerSolution:solution},
    {kind:'follow',nodeId:'sales',time:'2026-11-03 10:30',actor:'客服甲',note:'客户尚在考虑方案',communication:{result:'ongoing',reason:'客户不接受金额',reasonSource:'demands'},files:[proof]},
    {kind:'accept',nodeId:'intake',time:'2026-11-03 10:00',actor:'客服甲',level:'2级',files:[]}
  ],payments:[
    {nodeId:'payment',at:'2026-11-03 11:30',actor:'财务甲',result:'失败',amount:0,reason:'账户异常'},
    {nodeId:'payment',at:'2026-11-03 12:00',actor:'财务甲',result:'成功',amount:120000,reference:'PAY-TEST-1',proof:[proof]}
  ],handlingRecords:[
    {nodeId:'ship',kind:'procurement',action:'shipment',at:'2026-11-03 12:30',actor:'采购甲',method:'总部发货',items:[{name:'修护霜',quantity:1}],trackingNumber:'SF-1',note:'首批备注'},
    {nodeId:'ship',kind:'procurement',action:'shipment',at:'2026-11-03 13:00',actor:'采购甲',method:'总部发货',items:[{name:'修护霜',quantity:1}],trackingNumber:'SF-2',note:'第二批备注'}
  ],execution:{index:6,steps:[
    {id:'intake',kind:'intake',type:'handling',done:true},
    {id:'sales',kind:'sales',type:'handling',done:true},
    {id:'approval',kind:'financeApproval',type:'approval',done:true,result:'审批无需复制表单'},
    {id:'payment',kind:'payment',type:'handling',done:true},
    {id:'purchase',kind:'purchaseApproval',type:'approval',done:true},
    {id:'ship',kind:'procurement',type:'handling',done:true},
    {id:'review',kind:'close',type:'handling'}
  ]}};
  const before=JSON.stringify(r),html=a.processView(r);
  for(const value of ['2级','已确认解决方案','退款','¥ 1,200.00','修护霜 × 2','成功','SF-2','客服复核中'])assert.ok(html.includes(value),value);
  for(const value of ['4级','完整收货地址','付款凭证.png','data-uc="file"','账户异常','SF-1','审批无需复制表单'])assert.ok(!html.includes(value),value);
  assert.ok(!html.includes('aria-label="财务审批操作结果"'));
  const history=a.followTools().history(r,a.executionResultRecords(r));
  for(const value of ['账户异常','PAY-TEST-1','付款凭证.png','payment-proof','SF-1','SF-2','首批备注','第二批备注','完整收货地址','客户不接受金额'])assert.ok(history.includes(value),value);
  assert.equal(JSON.stringify(r),before);
  r.follows.shift();const ongoing=a.processView(r);assert.ok(ongoing.includes('方案未达成一致'));assert.ok(ongoing.includes('客户不接受金额'));assert.ok(!ongoing.includes('付款凭证.png'));
});
test('review conclusions and missing results stay distinct, and repeated execution nodes bind their own records',()=>{
  const r={status:'已结案',aftercareType:'客户退款',follows:[],payments:[
    {nodeId:'pay-1',at:'2026-11-03 10:00',result:'成功',amount:10000},
    {nodeId:'pay-2',at:'2026-11-03 11:00',result:'成功',amount:20000}
  ],execution:{index:3,steps:[
    {id:'pay-1',kind:'payment',type:'handling',done:true},
    {id:'pay-2',kind:'payment',type:'handling',done:true},
    {id:'review',kind:'close',type:'handling',done:true,completedAt:'2026-11-03 12:00',completedBy:'客服乙',result:'客户确认已到账，处理完成'}
  ]}};
  const html=a.processView(r);
  assert.equal(html.split('¥ 100.00').length-1,1);assert.equal(html.split('¥ 200.00').length-1,1);
  assert.ok(html.includes('暂无客户反馈'));assert.ok(!html.includes('<dt>复核结果</dt>'));assert.ok(!html.includes('客户确认已到账，处理完成'));assert.ok(!html.includes('客户退款'));
  const history=a.followTools().history(r,a.executionResultRecords(r));assert.ok(history.includes('客户退款'));assert.ok(history.includes('客户确认已到账，处理完成'));
  const blank=a.processView({status:'待财务付款',follows:[],logs:[]});assert.ok(blank.includes('暂无操作结果'));assert.ok(!blank.includes('付款成功'));
});
test('follow history includes communication and execution outcomes while excluding attribution',()=>{
  const expected=[[],[],['communication'],['solution','communication'],['solution','communication'],['solution','communication'],['payment','solution','communication'],['review','shipment','payment','solution','communication'],['closure','review','shipment','payment','solution','communication']];
  expected.forEach((kinds,index)=>{
    const r=a.records.find(item=>item.id===String(31029+index)),before=JSON.stringify(r),helper=a.followTools();
    const rows=helper.historyRecords(r,a.executionResultRecords(r));assert.deepEqual(copy(rows.map(item=>item.historyKind)),kinds,r.id);
    const html=helper.history(r,a.executionResultRecords(r));
    for(const label of ['客服接单','财务审批','采购审批','待执行','待安排发货'])assert.ok(!html.includes(label),r.id+': '+label);
    assert.equal(JSON.stringify(r),before);
  });
});
test('follow history keeps manual communication, original form snapshots and attachment source indices',()=>{
  const proof={name:'沟通凭证.png',data:'data:image/png;base64,eA=='},solution={handlingMethods:['refund'],refund:50000,attachments:[proof]};
  const r={status:'客服处理中',customerSolution:{...solution,refund:90000},follows:[
    {id:'grade',kind:'grading',time:'2026-11-06 10:08',actor:'客服甲',before:{level:'1级'},level:'2级'},
    {id:'reply',kind:'reply',time:'2026-11-06 10:07',actor:'客服甲',note:'已告知预计办理时间',files:[proof]},
    {id:'note',kind:'follow',time:'2026-11-06 10:06',actor:'客服甲',note:'客户补充收货要求',files:[]},
    {id:'plan',kind:'compensation',time:'2026-11-06 10:05',actor:'客服甲',customerSolution:solution,note:'客户确认退款金额'},
    {id:'reason',kind:'follow',time:'2026-11-06 10:04',actor:'客服甲',note:'客户暂未接受金额',communication:{result:'ongoing',reason:'正和客户协商退款金额',reasonSource:'demands'},files:[proof]},
    {id:'assessment',kind:'handling',action:'责任认定',time:'2026-11-06 10:03',customerSolution:solution,reason:'内部责任原因'},
    {id:'association',kind:'association',time:'2026-11-06 10:02',action:'关联订单'},
    {id:'transfer',kind:'transfer',time:'2026-11-06 10:01',note:'内部转派'},
    {id:'accept',kind:'accept',time:'2026-11-06 10:00',note:'已接单'}
  ]};
  const before=JSON.stringify(r),helper=a.followTools(),rows=helper.historyRecords(r),html=helper.history(r);
  assert.deepEqual(copy(rows.map(f=>f.id)),['reply','note','plan','reason']);
  for(const value of ['已告知预计办理时间','客户补充收货要求','客户确认退款金额','正和客户协商退款金额','¥500.00','data-kind="solution-history" data-index="3"','data-kind="follow" data-index="4"'])assert.ok(html.includes(value),value);
  for(const value of ['内部转派','内部责任原因','责任认定','¥900.00'])assert.ok(!html.includes(value));
  assert.equal(JSON.stringify(r),before);assert.equal(helper.history(JSON.parse(before)),html);
});
test('follow history retains failed retries and shipment batches and prefers execution proof over duplicate workflow summaries',()=>{
  const proof={name:'实际付款凭证.png',data:'data:image/png;base64,eA=='};
  const r={status:'客服复核中',follows:[{kind:'workflow',action:'财务付款',time:'2026-11-06 10:00',fields:[['付款结果','成功'],['交易流水号','PAY-1']]}],payments:[
    {id:'payment',at:'2026-11-06 10:00',result:'失败',amount:0,reason:'账户异常'},
    {id:'payment',at:'2026-11-06 10:00',result:'成功',amount:50000,reference:'PAY-1',proof:[proof]},
    {id:'waiting',at:'2026-11-06 10:10',result:'待执行',amount:20000}
  ],handlingRecords:[
    {id:'batch-1',kind:'procurement',at:'2026-11-06 11:00',items:[{name:'修护霜',quantity:1}],trackingNumber:'SF-1'},
    {id:'batch-2',kind:'procurement',at:'2026-11-06 11:30',items:[{name:'修护霜',quantity:1}],trackingNumber:'SF-2'},
    {id:'batch-3',kind:'procurement',at:'2026-11-06 11:30',items:[{name:'修护霜',quantity:1}],trackingNumber:'SF-2',note:'同一物流单的另一批次'}
  ]};
  const before=JSON.stringify(r),helper=a.followTools(),rows=helper.historyRecords(r,a.executionResultRecords(r)),html=helper.history(r,a.executionResultRecords(r));
  assert.equal(rows.filter(f=>f.historyKind==='payment').length,2);assert.equal(rows.filter(f=>f.historyKind==='shipment').length,3);
  for(const value of ['账户异常','PAY-1','SF-1','SF-2','实际付款凭证.png','data-kind="payment-proof" data-index="1"'])assert.ok(html.includes(value),value);
  assert.ok(!html.includes('待执行'));assert.ok(!html.includes('客户确认已到账'));assert.ok(!html.includes('客户已签收'));assert.equal(JSON.stringify(r),before);
});
test('closure history appears once, preserves later communication and supports legacy combined forms without using responsibility reasons',()=>{
  const r={status:'已结案',closedAt:'2026-11-06 11:00',closedBy:'客服甲',closeNote:'解释服务范围后，双方确认处理完成',follows:[
    {id:'after',kind:'follow',time:'2026-11-06 12:00',note:'结案后回访',files:[]},
    {id:'close',kind:'closure',closureType:'no-payout',time:'2026-11-06 11:00',actor:'客服甲',note:'无需退赔，双方确认处理完成',files:[]},
    {id:'legacy',kind:'handling',action:'责任认定',time:'2026-11-06 10:59',status:'已完成',beforeStatus:'处理中',handlingPlan:'resolved',note:'内部责任原因'}
  ]};
  const helper=a.followTools(),extra=[{kind:'execution-result',historyKind:'closure',time:r.closedAt,fields:[['结案说明','重复的状态回执']]}],before=JSON.stringify(r);
  const rows=helper.historyRecords(r,extra),html=helper.history(r,extra);assert.equal(rows.filter(f=>f.historyKind==='closure').length,1);assert.equal(rows[0].id,'after');assert.ok(html.includes('无赔付直接结案'));assert.ok(!html.includes('内部责任原因'));assert.ok(!html.includes('重复的状态回执'));assert.equal(JSON.stringify(r),before);
  const legacy={...r,closedAt:'2026-11-06 10:59',follows:[r.follows[2]]};assert.equal(helper.historyRecords(legacy).filter(f=>f.historyKind==='closure').length,1);assert.equal(helper.historyRecords(legacy).filter(f=>f.historyKind==='attribution').length,0);assert.ok(helper.history(legacy).includes(r.closeNote));assert.ok(!helper.history(legacy).includes('内部责任原因'));
  const closeOnly={...r,follows:[]};assert.equal(helper.historyRecords(closeOnly).length,1);assert.ok(helper.history(closeOnly).includes(r.closeNote));
});
test('no-payout closure preserves the selected result after serialization',()=>{
  const r={...copy(a.records.find(r=>r.id==='31031')),status:'客服处理中',handlingPlan:'resolved',customerSolution:null,execution:null};
  const entry=a.recordClosure(r,'2026-11-06 15:00','客户确认无需退赔','no-payout');assert.ok(entry);assert.equal(entry.closureType,'no-payout');
  const reopened=JSON.parse(JSON.stringify(r));assert.ok(a.followTools().history(reopened).includes('无赔付直接结案'));assert.equal(a.followTools().historyRecords(reopened).filter(f=>f.historyKind==='closure').length,1);
});
test('independent attribution tab follows the history tab without changing the information panel',()=>{
  assert.deepEqual(copy(a.sections()),[['info','工单信息'],['follows','跟进记录'],['attribution','责任认定']]);
  assert.equal(a.detailTabKey(),'info');assert.equal(a.detailTabKey('info'),'info');
  for(const key of ['plan','attribution'])assert.equal(a.detailTabKey(key),'attribution');assert.equal(a.detailTabKey('solution'),'follows');
  for(const saved of a.records){
    const r=a.select(saved.id),html=a.detailPanels(r);
    const originalInfo='<section class="uc-tab-panel" role="tabpanel" id="uc-section-info" aria-labelledby="uc-tab-info" >'+a.informationView(r)+a.processView(r)+'</section>';
    assert.ok(html.startsWith(originalInfo),r.id);
    assert.ok(html.includes('id="uc-section-follows" aria-labelledby="uc-tab-follows" hidden'));assert.ok(html.includes('id="uc-section-attribution" aria-labelledby="uc-tab-attribution" hidden'));assert.ok(!html.includes('uc-section-plan'));assert.ok(html.indexOf('id="uc-section-follows"')<html.indexOf('id="uc-section-attribution"'));
  }
});
test('attribution has complete current fields and attachments in its independent panel, with no follow node',()=>{
  const r=copy(a.records.find(r=>r.id==='31031')),previous=copy(r.follows.find(f=>['handling','assessment'].includes(f.kind))),proof={name:'责任认定凭证.png',data:'data:image/png;base64,eA=='};
  const beforeHistory=a.followTools().history(r);
  const entry=a.recordRecognition(r,{...r,firstContact:'首次联系员工',contactTime:'2026-11-06T09:30',customerDemand:'正和客户协商退款金额',customerStatement:'客户表示希望退款，并说明沟通过程。',reason:'核实后的责任原因',handlingFiles:[proof]},'2026-11-06 15:00');assert.ok(entry);assert.equal(entry.action,'修改责任认定');
  assert.deepEqual(copy(r.follows.find(f=>f.id===previous.id)),previous);
  const before=JSON.stringify(r),html=a.attributionPanel(r);
  for(const value of ['2026-11-06 15:00','核实后的责任原因','责任归属','售后类型','责任人','附件','认定人','认定时间','data-uc="begin-assessment"','data-kind="handling"'])assert.ok(html.includes(value),value);
  assert.equal(a.followTools().history(r),beforeHistory);assert.ok(!a.followTools().historyRecords(r).some(f=>f.historyKind==='attribution'));
  assert.equal(JSON.stringify(r),before);
  for(const status of a.WORK_ORDER_STATUSES)assert.equal(a.attributionPanel({...r,status}).includes('data-uc="begin-assessment"'),status!=='已结案',status);
  assert.equal(a.attributionPanel({...r,follows:[]}),html);
  const later={...r,firstContact:'后续员工'};assert.equal(a.attributionPanel(later),html);
  const blank={...r,assessedAt:'',department:[],type:'',responsible:[],reason:'',handlingFiles:[],follows:[]};
  for(const status of a.WORK_ORDER_STATUSES)assert.equal(a.attributionPanel({...blank,status}).includes('>填写责任认定</button>'),status!=='已结案',status);
  assert.ok(!a.attributionPanel({...r,department:['客户自身']}).includes('责任人'));assert.ok(!html.includes('处理结果'));
});
test('editing existing attribution stays available before closure without changing downstream progress',()=>{
  for(const status of ['待处理','财务审批中','采购审批中','待财务付款','待采购发货','客服复核中']){
    const r={...copy(a.records.find(r=>r.id==='31031')),status,currentTask:'保留当前任务',statusDetail:'保留当前办理结果',customerSolution:copy(valid.value),execution:{index:1,steps:[{kind:'sales',done:true},{kind:'payment',type:'handling',done:false}]}};
    const before=copy(r),helper=a.followTools();
    assert.ok(a.attributionPanel(r).includes('data-uc="begin-assessment"'),status);
    const entry=a.recordRecognition(r,{...helper.operationDraft('assessment',r),reason:'补充责任核实资料',handlingPlan:'resolved',customerSolution:null},'2026-11-06 16:00');
    assert.ok(entry,status);assert.equal(entry.action,'修改责任认定');assert.equal(r.status,status);assert.equal(r.handlingPlan,before.handlingPlan);
    for(const key of ['currentTask','statusDetail','execution','customerSolution','closedAt','communicationPeriods'])assert.deepEqual(copy([r[key]]),copy([before[key]]),key);
    assert.deepEqual(copy(r.follows.slice(1)),before.follows);assert.equal(r.reason,'补充责任核实资料');
    const after=JSON.stringify(r);assert.equal(a.recordRecognition(r,helper.operationDraft('assessment',r),'2026-11-06 16:01'),null);assert.equal(JSON.stringify(r),after);
    assert.equal(a.recordCompensation(r,valid.value,'2026-11-06 16:02'),null);
  }
});
test('closed attribution cannot be edited and timeline node names retain shared colored tags',()=>{
  for(const saved of a.records){
    const r=copy(saved),helper=a.followTools(),html=helper.history(r,a.executionResultRecords(r));
    for(const heading of html.matchAll(/<div class="uc-event-title">([\s\S]*?)<\/div>/g))assert.ok(heading[1].includes('class="pill'),r.id);
    if(!r.assessedAt)continue;
    r.status='已结案';const before=JSON.stringify(r);
    assert.ok(!a.attributionPanel(r).includes('data-uc="begin-assessment"'));assert.ok(!helper.history(r).includes('责任认定'));
    assert.equal(a.recordRecognition(r,{...helper.operationDraft('assessment',r),reason:'禁止结案后修改'},'2026-11-06 16:00'),null);
    assert.equal(JSON.stringify(r),before);
  }
  assert.ok(a.followTools().history(a.records.find(r=>r.id==='31031')).includes('<span class="pill blue">方案未达成一致</span>'));
  const footer=a.followTools().editorFooter({kind:'assessment',assessmentOnly:true,draft:{handlingPlan:'resolved'}});
  assert.ok(footer.includes('保存责任认定'));assert.ok(!footer.includes('保存并结案'));
});
test('legacy attribution with no recorded handling result can still be corrected in downstream stages',()=>{
  const r={...copy(a.records.find(r=>r.id==='31031')),status:'采购审批中',handlingPlan:''};
  const entry=a.recordRecognition(r,{...a.followTools().operationDraft('assessment',r),reason:'补充历史责任原因'},'2026-11-06 16:00');
  assert.ok(entry);assert.equal(r.handlingPlan,'');assert.equal(r.status,'采购审批中');assert.equal(r.reason,'补充历史责任原因');
});
test('first attribution can be saved in every open stage and unchanged saves add no follow nodes',()=>{
  for(const status of a.WORK_ORDER_STATUSES.filter(status=>status!=='已结案')){
    const r={...copy(a.records.find(r=>r.id==='31029')),status,follows:[]};delete r.handlingPlan;
    assert.equal(a.detailActions(r).includes('data-uc="begin-assessment"'),a.canAssess(r));
    const helper=a.followTools(),entry=a.recordRecognition(r,{...helper.operationDraft('assessment',r),department:['门店'],type:'门店服务',responsible:['陈佳'],reason:'首次补填责任认定',handlingPlan:'unresolved'},'2026-11-06 17:00');
    assert.ok(entry,status);assert.equal(r.status,status==='客服已接单'?'客服处理中':status);
    assert.ok(!a.detailActions(r).includes('data-uc="begin-assessment"'));assert.ok(a.attributionPanel(r).includes('>编辑</button>'));
    assert.ok(a.attributionPanel(r).includes('首次补填责任认定'));assert.ok(!helper.history(r).includes('责任认定'));
    const saved=JSON.stringify(r);assert.equal(a.recordRecognition(r,helper.operationDraft('assessment',r),'2026-11-06 17:01'),null);assert.equal(JSON.stringify(r),saved);
  }
});
test('suspension pauses node timing and closure does not mark unexecuted route nodes complete',()=>{
  const r={status:'已挂起',taskDeadline:'2020-01-01 10:00',execution:{index:0,steps:[
    {type:'approval',title:'付款审批',external:{url:'javascript:alert(1)'}},
    {type:'handling',title:'付款办理'}
  ]}};
  const paused=a.processView(r);assert.ok(paused.includes('节点计时已暂停'));assert.ok(!paused.includes('已超时'));assert.ok(!paused.includes('查看审批'));
  r.status='已结案';const closed=a.processView(r);assert.ok(!closed.includes('is-current'));assert.ok(!closed.includes('is-done'));assert.ok(!closed.includes('未开始'));assert.ok(!closed.includes('无需办理'));
});
test('status compatibility reads existing records at full quota without rewriting storage',()=>{
  const saved=copy(a.records);saved[0].status='财务付款失败';saved[1].status='处理中';saved[2].status='门店处理中';saved[2].currentHandler='店长甲';saved[2].acceptedBy='客服甲';saved[3].status='客服待结案';
  const original=JSON.stringify(saved);let writes=0;
  const full={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?original:null,setItem(){writes++;throw Error('quota exceeded')}}};
  loadOptions(full);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8'),full);vm.runInNewContext(processCode,full);
  vm.runInNewContext(followCode,full);
  vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),full);
  assert.equal(writes,0);assert.equal(full.window.testAPI.records[0].status,'待财务付款');assert.equal(full.window.testAPI.currentTask(full.window.testAPI.records[0]),'财务付款失败');
  assert.equal(full.window.testAPI.records[2].status,'客服处理中');assert.equal(full.window.testAPI.currentHandler(full.window.testAPI.records[2]),'客服甲');assert.equal(full.window.testAPI.records[3].status,'客服复核中');
  assert.equal(JSON.stringify(saved),original);
});
test('retired store transfer has no actions, registration or active status',()=>{
  assert.ok(!a.WORK_ORDER_STATUSES.includes('门店处理中'));assert.ok(a.WORK_ORDER_STATUSES.includes('客服复核中'));
  for(const status of a.WORK_ORDER_STATUSES)assert.ok(!a.detailActions({...copy(record),status}).includes('begin-transfer'));
  for(const name of ['begin-transfer','save-transfer','transferTools','uc-transfer-form'])assert.ok(!code.includes(name));
  assert.ok(!fs.readFileSync(path.join(__dirname,'../routes.json'),'utf8').includes('complaint-transfer'));
  const own=copy(a.records.find(r=>r.id==='31013'));assert.ok(!a.processView({...own,status:'客服处理中',customerSolution:null}).includes('门店办理'));
});
test('legacy store transfers return to customer service without losing the recorded evidence',()=>{
  const r={...copy(record),status:'门店处理中',currentHandler:'店长甲',currentDepartment:'门店',currentTask:'待门店反馈',acceptedBy:'客服甲',taskDeadline:123,
    transfer:{fromHandler:'客服甲',toHandler:'店长甲',note:'核实订单'},follows:[{kind:'transfer',actor:'客服甲',status:'门店处理中',note:'核实订单'}]};
  const before=copy(r);a.normalizeRecordStatus(r);
  assert.equal(r.status,'客服处理中');assert.equal(a.currentHandler(r),'客服甲');assert.equal(r.currentDepartment,'售后客服');assert.equal(r.taskDeadline,null);
  assert.equal(r.legacyStoreAssignment.handler,'店长甲');assert.equal(r.legacyStoreAssignment.deadline,123);
  for(const key of ['follows','transfer','customerSolution','department','responsible'])assert.deepEqual(copy(r[key]),copy(before[key]));
  const saved=JSON.stringify(r);a.normalizeRecordStatus(r);assert.equal(JSON.stringify(r),saved);
  for(const [kind,status]of [['payment','待财务付款'],['procurement','待采购发货'],['close','客服复核中']]){
    const active={...before,execution:{index:0,steps:[{type:'handling',kind}]}};a.normalizeRecordStatus(active);assert.equal(active.status,status);
  }
  assert.equal(a.workOrderStatus('客服待结案'),'客服复核中');assert.equal(a.workOrderStatus('待结案'),'客服复核中');
});
test('communication records advance accepted work without creating or confirming a solution',()=>{
  const r={...copy(record),status:'客服已接单',customerSolution:null,assessedAt:null,follows:[]},d={note:'已电话联系，客户暂未接听',files:[],followResult:'ongoing',unresolvedReason:'正和客户协商退款金额',nextFollowAt:'2026-11-04T10:00'};
  const entry=a.recordFollow(r,d,'2026-11-03 10:00');assert.ok(entry);assert.equal(r.status,'客服处理中');assert.equal(entry.beforeStatus,'客服已接单');
  assert.equal(r.customerSolution,null);assert.equal(r.assessedAt,null);assert.equal(a.canClose(r),false);
  assert.equal(a.followTools().current(r),entry);assert.equal(entry.communication.reason,'正和客户协商退款金额');assert.equal(entry.communication.nextFollowAt,'2026-11-04T10:00');
  assert.ok(a.followTools().overview(r).includes('正和客户协商退款金额'));assert.ok(a.followTools().history(r).includes('2026-11-04 10:00'));
  d.unresolvedReason='无法联系上客户';d.files.push({name:'local'});assert.equal(entry.communication.reason,'正和客户协商退款金额');assert.equal(entry.files.length,0);
});
test('communication outcomes validate required reasons, explanations and dates before mutation',()=>{
  const r={...copy(record),status:'客服处理中',follows:[]},base={note:'',files:[],followResult:'ongoing',unresolvedReason:'正和客户协商退款金额',nextFollowAt:''};
  for(const change of [{followResult:''},{followResult:'unknown'},{unresolvedReason:''},{unresolvedReason:'unknown'},{unresolvedReason:'其他'},{nextFollowAt:'2026-02-30T10:00'},{nextFollowAt:'invalid'}]){
    const before=JSON.stringify(r);assert.equal(a.recordFollow(r,{...base,...change},'2026-11-03 10:00'),null);assert.equal(JSON.stringify(r),before);
  }
  for(const reason of context.window.PCComplaintOptions.current.demands)assert.ok(a.recordFollow(r,{...base,unresolvedReason:reason,note:reason==='其他'?'客户要求家属参与沟通':''},'2026-11-03 10:00'));
});
test('ordinary notes preserve communication blockers and do not start accepted work',()=>{
  const r={...copy(record),status:'客服已接单',follows:[]};a.recordFollow(r,{note:'内部资料已补充',files:[]},'2026-11-03 10:00');assert.equal(r.status,'客服已接单');assert.equal(a.followTools().current(r),null);
  const progress=a.recordFollow(r,{note:'协商金额',files:[],followResult:'ongoing',unresolvedReason:'无法联系上客户'},'2026-11-03 10:01');
  a.recordFollow(r,{note:'补充订单核实结果',files:[],followResult:'note',unresolvedReason:'正和客户协商退款金额',nextFollowAt:'invalid'},'2026-11-03 10:02');
  assert.equal(a.followTools().current(r),progress);assert.equal(r.follows[0].communication,undefined);
});
test('customer agreement clears the blocker but does not submit a solution or close the case',()=>{
  const r={...copy(record),status:'客服处理中',handlingPlan:'unresolved',customerSolution:null,follows:[]};
  a.recordFollow(r,{note:'金额未达成一致',files:[],followResult:'ongoing',unresolvedReason:'无法联系上客户'},'2026-11-03 10:00');
  const entry=a.recordFollow(r,{note:'客户同意协商金额',files:[],followResult:'agreed',unresolvedReason:'无法联系上客户',nextFollowAt:'invalid'},'2026-11-03 11:00');
  assert.equal(entry.communication.reason,'');assert.equal(entry.communication.nextFollowAt,'');assert.equal(r.status,'客服处理中');assert.equal(r.customerSolution,null);assert.equal(a.canClose(r),false);
  const view=a.followTools().overview(r);assert.ok(view.includes('填写解决方案'));assert.ok(!view.includes('未达成原因'));assert.ok(a.followTools().history(r).includes('无法联系上客户'));
  assert.ok(a.recordCompensation(r,valid.value,'2026-11-03 12:00'));assert.equal(a.followTools().current(r),null);assert.equal(a.followTools().overview(r),'');
});
test('financial, procurement, review and closed stages accept notes but cannot change communication outcomes',()=>{
  for(const status of ['待处理','财务审批中','采购审批中','待财务付款','待采购发货','客服复核中','已结案']){
    const r={...copy(record),status},before=JSON.stringify(r);
    for(const result of ['ongoing','agreed']){assert.equal(a.recordFollow(r,{note:'跟进',files:[],followResult:result,unresolvedReason:'无法联系上客户'},'2026-11-03 10:00'),null);assert.equal(JSON.stringify(r),before)}
    assert.equal(a.followTools().draft(r).followResult,'note');assert.ok(!a.followTools().form(r,a.followTools().draft(r)).includes('name="followResult"'));
    if(status!=='待处理'){assert.ok(a.recordFollow(r,{note:'补充记录',files:[]},'2026-11-03 10:00'));assert.equal(r.status,status)}
  }
});
test('editing retains original communication time and snapshots without replacing a newer blocker',()=>{
  const r={...copy(record),status:'客服处理中',customerSolution:null,follows:[]};
  const first=a.recordFollow(r,{note:'电话未接',files:[],followResult:'ongoing',unresolvedReason:'正和客户协商退款金额'},'2026-11-03 10:00');
  const latest=a.recordFollow(r,{note:'客户接听，金额未谈妥',files:[],followResult:'ongoing',unresolvedReason:'无法联系上客户'},'2026-11-03 11:00');
  const d=a.followTools().draft(r,first);d.note='补充：上午拨打两次';assert.ok(a.followTools().edit(r,first.id,d,'2026-11-03 12:00'));
  assert.equal(a.followTools().current(r),latest);assert.equal(first.time,'2026-11-03 10:00');assert.equal(first.revisions[0].note,'电话未接');assert.equal(first.revisions[0].communication.reason,'正和客户协商退款金额');
  const before=JSON.stringify(r);d.unresolvedReason='不在配置内的原因';assert.equal(a.followTools().edit(r,first.id,d,'2026-11-03 13:00'),null);assert.equal(JSON.stringify(r),before);
  r.status='已结案';d.unresolvedReason='正和客户协商退款金额';assert.ok(a.followTools().edit(r,first.id,d,'2026-11-03 13:00'));assert.equal(r.status,'已结案');assert.equal(a.followTools().current(r),null);
});
test('unresolved follow editing restores the reason selector and saves corrections with history',()=>{
  const helper=a.followTools();
  for(const status of a.WORK_ORDER_STATUSES.filter(status=>status!=='待处理')){
    const r={...copy(record),status:'客服处理中',customerSolution:null,compensatedAt:null,follows:[],communicationPeriods:[]};
    const entry=helper.record(r,{operation:'unresolved',unresolvedReason:'正和客户协商退款金额',note:'原沟通内容',files:[],nextFollowAt:'2026-11-04T10:00'},'2026-11-03 10:00');
    r.status=status;const d=helper.draft(r,entry),periods=JSON.stringify(r.communicationPeriods),html=helper.form(r,d,entry);
    assert.ok(html.includes('data-field="unresolvedReason"'));assert.ok(html.includes('value="正和客户协商退款金额" selected'));assert.ok(html.includes('value="无法联系上客户"'));
    assert.equal(d.nextFollowAt,'2026-11-04T10:00');
    const before=JSON.stringify(r);for(const change of [{unresolvedReason:''},{unresolvedReason:'任意无效原因'},{followResult:'agreed'},{nextFollowAt:'2026-11-05T10:00'}])assert.equal(helper.edit(r,entry.id,{...d,...change},'2026-11-03 11:00'),null);
    assert.equal(JSON.stringify(r),before);
    d.unresolvedReason='无法联系上客户';d.note='核实后更正沟通原因';
    assert.ok(helper.edit(r,entry.id,d,'2026-11-03 11:00'));assert.equal(entry.communication.reason,'无法联系上客户');assert.equal(entry.communication.reasonSource,'demands');
    assert.equal(entry.revisions[0].communication.reason,'正和客户协商退款金额');assert.equal(entry.revisions[0].note,'原沟通内容');assert.equal(entry.time,'2026-11-03 10:00');assert.equal(entry.communication.nextFollowAt,'2026-11-04T10:00');
    assert.equal(r.status,status);assert.equal(JSON.stringify(r.communicationPeriods),periods);
    const reopened=helper.form(r,helper.draft(r,entry),entry);assert.ok(reopened.includes('value="无法联系上客户" selected'));assert.ok(helper.history(r).includes('核实后更正沟通原因'));
    assert.equal(helper.current(r),status==='已结案'?null:entry);
  }
});
test('old complaints receive pending examples once without resetting existing work',()=>{
  const existing=copy(a.records.filter(r=>Number(r.id)<31019));existing.forEach(r=>r.status='已结案');let raw=JSON.stringify(existing);
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?raw:null,setItem:(k,v)=>{assert.equal(k,'weid.pc.complaints.v1');raw=v}}};
  const boot=()=>{loadOptions(local);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8'),local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);return local.window.testAPI.records};
  const loaded=boot();assert.equal(loaded.length,39);assert.ok(loaded.filter(r=>Number(r.id)<31019).every(r=>r.status==='已结案'));
  for(const id of ['31019','31020','31021','31022','31023']){const r=loaded.find(r=>r.id===id);assert.equal(r.status,'待处理');assert.ok(r.level);assert.equal(r.follows.length,0);assert.equal(r.linked.length,1);assert.equal(r.customerSolution,undefined)}
  const refreshed=boot();assert.equal(refreshed.length,39);assert.equal(refreshed.filter(r=>r.status==='待处理').length,6);
  const pending=refreshed.filter(r=>Number(r.id)>=31021&&Number(r.id)<=31023);assert.deepEqual(copy(pending.map(r=>r.channel).sort()),['mini','staff','wechat']);
  for(const r of pending){assert.ok(r.files.length);assert.ok(local.window.testAPI.detailActions(r).includes('accept-case'));assert.ok(local.window.testAPI.recordAccept(r,'2026-11-03 11:00',{level:r.level}));}
  assert.ok(local.window.testAPI.persist(refreshed));
  const afterAccept=boot();for(const r of afterAccept.filter(r=>Number(r.id)>=31021&&Number(r.id)<=31023)){assert.equal(r.status,'客服已接单');assert.equal(r.acceptedAt,'2026-11-03 11:00');assert.equal(r.follows.filter(f=>f.kind==='accept').length,1)}
  assert.equal(afterAccept.filter(r=>Number(r.id)>=31021&&Number(r.id)<=31023).length,3);
});
test('communication survives refresh and failed saves leave the persisted record unchanged',()=>{
  const next=copy(a.records),r=next[0];r.status='客服已接单';r.follows=[];r.customerSolution=null;
  a.recordFollow(r,{note:'联系不上，下午重试',files:[],followResult:'ongoing',unresolvedReason:'正和客户协商退款金额',nextFollowAt:'2026-11-03T15:00'},'2026-11-03 10:00');
  const raw=JSON.stringify(next);let writes=0;
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?raw:null,setItem(){writes++;throw Error('QuotaExceededError')}}};
  loadOptions(local);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8'),local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);
  const api=local.window.testAPI;assert.equal(writes,0);assert.equal(api.followTools().current(api.records[0]).communication.reason,'正和客户协商退款金额');
  assert.deepEqual(copy(api.records[0].communicationPeriods),copy(r.communicationPeriods));
  const changed=copy(api.records);api.recordFollow(changed[0],{note:'再次沟通',files:[],followResult:'ongoing',unresolvedReason:'无法联系上客户'},'2026-11-03 11:00');
  assert.equal(api.persist(changed),false);assert.equal(api.followTools().current(api.records[0]).communication.reason,'正和客户协商退款金额');
  assert.deepEqual(copy(api.records[0].communicationPeriods),copy(r.communicationPeriods));
});
test('handling context shows customer identity without repeating complaint content or attachments',()=>{
  const r=a.records.find(r=>r.id==='31020'),before=JSON.stringify(r),compact=a.summary(r,false,true),detail=a.summary(r);
  for(const value of [r.name,r.phone,r.member,r.id,'查看完整号码'])assert.ok(compact.includes(value));
  assert.ok(!compact.includes(r.content));assert.ok(!compact.includes('aria-label="投诉附件"'));assert.ok(!compact.includes('aria-label="发起信息"'));
  assert.ok(detail.includes(r.content));assert.equal(JSON.stringify(r),before);
});
test('handling offers three mutually exclusive business operations',()=>{
  const helper=a.followTools(),options=Object.keys(helper.OPERATIONS);
  assert.deepEqual([...options],['follow','compensation','closure']);
  for(const kind of options){const html=helper.operationChoice(kind);assert.equal((html.match(/type="radio"/g)||[]).length,3);assert.ok(html.includes('方案未达成一致'));assert.ok(html.includes('已确认退赔方案'));assert.ok(html.includes('无赔付直接结案'));assert.ok(!html.includes('责任认定'));assert.equal((html.match(/ checked/g)||[]).length,1);assert.ok(html.includes(`value="${kind}" checked`));assert.ok(!html.includes('role="tab"'))}
  const inputs=options.map(value=>({value,checked:value==='compensation'})),synced=[],previous=context.PCUI.syncControl;
  context.PCUI.syncControl=input=>synced.push(input.value);
  try{helper.resetOperation({kind:'follow',layer:{el:{querySelectorAll:()=>inputs}}});assert.equal(inputs.filter(input=>input.checked).length,1);assert.ok(inputs[0].checked);assert.deepEqual(synced,options)}finally{context.PCUI.syncControl=previous}
});
test('unresolved proposal requires a configured reason without a separate follow-up result',()=>{
  const helper=a.followTools(),r={...copy(record),status:'客服处理中',follows:[]};
  const html=helper.form(r,helper.draft(r));
  assert.ok(!html.includes('name="followResult"'));assert.ok(!html.includes('跟进结果'));
  assert.ok(html.includes('data-field="unresolvedReason"'));assert.ok(html.includes('required aria-required="true"'));
  assert.ok(helper.validate(r,{operation:'unresolved',files:[],unresolvedReason:''}).some(([name])=>name==='unresolvedReason'));
  assert.equal(helper.validate(r,{operation:'unresolved',files:[],unresolvedReason:'无法联系上客户'}).length,0);
  assert.ok(!helper.closureForm({note:''}).includes('确认后工单将进入已结案状态'));assert.ok(helper.closureForm({note:''}).includes('结案说明'));
});
test('reason choices track customer-demand configuration while saved reasons and legacy history remain stable',()=>{
  const dict=context.window.PCComplaintOptions,descriptor=Object.getOwnPropertyDescriptor(dict,'current'),options=dict.options;
  let demands=['退款金额待确认','到店安排待确认'];
  Object.defineProperty(dict,'current',{get:()=>({demands})});
  dict.options=(key,selected)=>{assert.equal(key,'demands');return [...new Set([...demands,...(selected?[selected]:[])])].map(value=>[value,value])};
  try{
    const helper=a.followTools(),r={...copy(record),status:'客服处理中',customerSolution:null,compensatedAt:null,follows:[]};
    const form=helper.form(r,helper.draft(r));assert.ok(form.includes('退款金额待确认'));assert.ok(!form.includes('value="申请退款"'));
    const entry=helper.record(r,{files:[],note:'沟通记录',followResult:'ongoing',unresolvedReason:demands[0]},'2026-11-03 10:00');
    assert.equal(entry.communication.reasonSource,'demands');demands=['修改后的原因'];
    assert.ok(helper.form(r,helper.draft(r)).includes('修改后的原因'));assert.ok(helper.history(r).includes('退款金额待确认'));
    const d=helper.draft(r,entry);d.note='补充情况';assert.ok(helper.edit(r,entry.id,d,'2026-11-03 11:00'));
    assert.ok(helper.validate(r,{...helper.draft(r),unresolvedReason:'退款金额待确认'}).some(([name])=>name==='unresolvedReason'));
    const legacy={...copy(entry),id:'legacy-reason',communication:{result:'ongoing',reason:'amount',nextFollowAt:''}};r.follows=[legacy];
    assert.ok(helper.history(r).includes('客户不认可方案金额'));const legacyDraft=helper.draft(r,legacy);legacyDraft.note='历史补充';
    assert.ok(helper.form(r,legacyDraft,legacy).includes('value="amount" selected>客户不认可方案金额</option>'));
    assert.ok(helper.edit(r,legacy.id,legacyDraft,'2026-11-03 12:00'));assert.equal(legacy.communication.reason,'amount');assert.equal(legacy.communication.reasonSource,undefined);
    legacyDraft.unresolvedReason=demands[0];assert.ok(helper.edit(r,legacy.id,legacyDraft,'2026-11-03 12:10'));assert.equal(legacy.communication.reason,demands[0]);assert.equal(legacy.communication.reasonSource,'demands');
  }finally{Object.defineProperty(dict,'current',descriptor);dict.options=options}
});
test('failed storage writes retain records and the real cause; a concurrent update cannot be overwritten',()=>{
  const saved=storage.get('weid.pc.complaints.v1'),original=JSON.stringify(a.records),messages=[];
  const write=context.localStorage.setItem,notify=context.PCUI.message;
  context.PCUI.message=message=>messages.push(message);
  try{
    context.localStorage.setItem=()=>{throw Error('QuotaExceededError')};assert.equal(a.persist(copy(a.records)),false);
    assert.equal(JSON.stringify(a.records),original);assert.equal(storage.get('weid.pc.complaints.v1'),saved);assert.ok(messages.at(-1).includes('QuotaExceededError'));
    context.localStorage.setItem=write;storage.set('weid.pc.complaints.v1','external-update');
    assert.equal(a.persist(copy(a.records)),false);assert.equal(storage.get('weid.pc.complaints.v1'),'external-update');assert.ok(messages.at(-1).includes('其他页面更新'));
  }finally{context.localStorage.setItem=write;context.PCUI.message=notify;storage.set('weid.pc.complaints.v1',saved)}
});
test('customer binding persists atomically, survives reload and retains the draft on storage failure or conflict',()=>{
  const original={id:'40100',customerId:'manual-40100',name:'来电姓名',phone:'13800002901',member:'',store:'',channel:'legal',status:'客服已接单',created:'2026-11-04 09:00',linked:[],follows:[],logs:[],files:[]};
  let raw=JSON.stringify([...copy(a.records),original]),fail=false;
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:key=>key==='weid.pc.complaints.v1'?raw:null,setItem(key,value){if(fail)throw Error('QuotaExceededError');if(key==='weid.pc.complaints.v1')raw=value}}};
  const boot=()=>{loadOptions(local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);return local.window.testAPI};
  let api=boot(),r=api.records.find(item=>item.id==='40100'),e=api.orderPickerState(r);
  assert.ok(api.selectPickerCustomer(e,'C28'));assert.ok(api.selectPickerOrder(e,api.orderPickerOrders(e)[0].id));
  const pending=copy(api.records),target=pending.find(item=>item.id===r.id);assert.ok(api.recordOrderAssociation(target,e,'2026-11-04 10:00'));
  const before=raw,draft=JSON.stringify(e);fail=true;assert.equal(api.persist(pending),false);assert.equal(raw,before);assert.equal(r.customerId,'manual-40100');assert.equal(JSON.stringify(e),draft);
  fail=false;raw=before+' ';assert.equal(api.persist(pending),false);assert.equal(raw,before+' ');assert.equal(JSON.stringify(e),draft);
  raw=before;assert.ok(api.persist(pending));api=boot();r=api.records.find(item=>item.id==='40100');assert.equal(r.customerId,'C28');assert.equal(r.originalContact.name,'来电姓名');assert.equal(r.follows[0].kind,'association');assert.equal(api.orderPickerState(r).orderBindingRequired,false);
});
test('accepting requires an explicit valid grade before any mutation',()=>{
  const source={...copy(record),status:'待处理',follows:[]};
  for(const grade of [undefined,{}, {level:'6级'}, {level:'4级'}, {level:'4级',level4Type:'未知风险'}]){
    const r=copy(source),before=JSON.stringify(r);assert.equal(a.recordAccept(r,'2026-11-03 15:00',grade),null);assert.equal(JSON.stringify(r),before);
  }
  const r=copy(source),entry=a.recordAccept(r,'2026-11-03 15:00',{level:'4级',level4Type:'监管局'});
  assert.equal(r.status,'客服已接单');assert.equal(r.level,'4级');assert.equal(r.level4Type,'监管局');assert.equal(entry.level,'4级');assert.equal(entry.level4Type,'监管局');
});
test('independent grade changes preserve workflow, retain history and clear inapplicable risk',()=>{
  const helper=a.followTools();
  for(const status of a.WORK_ORDER_STATUSES){
    const r={...copy(record),status,level:'4级',level4Type:'监管局',follows:[]},before=JSON.stringify(r),entry=helper.recordGrade(r,{level:'2级',level4Type:'监管局'},'2026-11-03 15:01');
    if(['待处理','已结案'].includes(status)){assert.equal(entry,null);assert.equal(JSON.stringify(r),before);continue}
    assert.equal(r.status,status);assert.equal(r.level,'2级');assert.equal(r.level4Type,'');assert.equal(entry.before.level,'4级');assert.equal(entry.before.level4Type,'监管局');
    assert.equal(entry.beforeStatus,entry.status);assert.ok(!helper.history(r).includes('4级 · 监管局 → 2级'));assert.equal(helper.editable(entry),false);
    assert.equal(helper.recordGrade(r,{level:'2级'},'2026-11-03 15:02'),null);assert.equal(r.follows.length,1);
    assert.ok(a.summary(r).includes('data-uc="edit-grade"'));assert.ok(!a.summary(r,false,true).includes('data-uc="edit-grade"'));
  }
});
test('responsibility cannot overwrite independently confirmed grade',()=>{
  const r={...copy(record),status:'客服处理中',level:'4级',level4Type:'报警',follows:[]};
  const form=a.followTools().operationDraft('assessment',r);assert.equal(Object.hasOwn(form,'level'),false);assert.equal(Object.hasOwn(form,'level4Type'),false);
  assert.ok(a.recordRecognition(r,{...draft,level:'1级',level4Type:''},'2026-11-03 15:00'));assert.equal(r.level,'4级');assert.equal(r.level4Type,'报警');
});
test('switching communication operations preserves both drafts and detects hidden unsaved edits',()=>{
  const helper=a.followTools(),r={...copy(record),status:'客服处理中'},d=helper.operationDraft('compensation',r),e={kind:'compensation',draft:d,baseline:JSON.stringify(d)};
  e.draft.customerSolution.methods=['refund'];e.draft.customerSolution.refundAmounts={project:'1200'};
  const refund=JSON.stringify(e.draft);
  helper.switchOperation(e,'follow',r);assert.equal(e.kind,'follow');assert.equal(helper.operationDirty(e),true);
  e.draft.note='继续协商退款';e.draft.unresolvedReason='正和客户协商退款金额';const follow=JSON.stringify(e.draft);
  helper.switchOperation(e,'compensation',r);assert.equal(JSON.stringify(e.draft),refund);
  e.baseline=JSON.stringify(e.draft);assert.equal(helper.operationDirty(e),true);
  helper.switchOperation(e,'follow',r);assert.equal(JSON.stringify(e.draft),follow);
  e.baseline=JSON.stringify(e.draft);assert.equal(helper.operationDirty(e),false);
});
test('duration configuration upgrades existing dictionaries without assigning arbitrary limits',()=>{
  const dict=context.window.PCComplaintOptions,old={schema:1,revision:3,demands:['原因甲'],types:['门店服务']},before=JSON.stringify(old);
  assert.deepEqual(copy(dict.validate(old).demandTimings),{});assert.deepEqual(copy(dict.validate(old).defaultTimings),{});assert.equal(JSON.stringify(old),before);
  assert.equal(dict.timingValue(''),null);assert.deepEqual(copy(dict.timingValue('24','hours')),{value:24,unit:'hours'});
  for(const [value,unit]of [[0,'hours'],[-1,'days'],[1.5,'hours'],[1,'weeks'],['bad','hours']])assert.throws(()=>dict.timingValue(value,unit));
  for(const timing of [{value:2},{value:0,unit:'hours'},{value:'2',unit:'hours'}])assert.throws(()=>dict.validate({...old,demandTimings:{原因甲:timing}}));
  assert.throws(()=>dict.validate({...old,demandTimings:{已删除的原因:{value:2,unit:'hours'}}}));
});
test('demand overrides fall back by grade, including absent demands, without inheriting another grade',()=>{
  const dict=context.window.PCComplaintOptions,config={...dict.current,defaultTimings:{'1级':3,'2级':2,'3级':1},demandTimings:{无法联系上客户:{byLevel:{'1级':0.5}},正和客户协商退款金额:{value:12,unit:'hours'}}};
  assert.doesNotThrow(()=>dict.validate(config));
  assert.deepEqual(copy(dict.resolveTiming(config,'无法联系上客户','1级')),{timing:{value:0.5,unit:'days'},source:'demand'});
  for(const name of ['无法联系上客户','','已删除的诉求'])assert.deepEqual(copy(dict.resolveTiming(config,name,'2级')),{timing:{value:2,unit:'days'},source:'default'});
  assert.equal(dict.timingFor(config,'无法联系上客户','4级'),null);assert.equal(dict.timingFor(config,'',''),null);
  assert.deepEqual(copy(dict.timingFor(config,'正和客户协商退款金额','2级')),{value:12,unit:'hours'});
  config.demandTimings.无法联系上客户.byLevel={};assert.equal(dict.timingFor(config,'无法联系上客户','1级').value,3);
  for(const defaults of [null,[],{'6级':1},{'1级':0},{'1级':'3'},{'1级':Infinity}])assert.throws(()=>dict.validate({...config,defaultTimings:defaults}));
});
test('acceptance without a demand starts a grade default snapshot; subsequent reasons use their own rules',()=>{
  const dict=context.window.PCComplaintOptions,descriptor=Object.getOwnPropertyDescriptor(dict,'current'),config={...dict.current,revision:7,defaultTimings:{'2级':3},demandTimings:{无法联系上客户:{byLevel:{'2级':1}}}};
  Object.defineProperty(dict,'current',{get:()=>copy(config)});
  try{
    const make=()=>({...copy(record),status:'待处理',customerDemand:'',customerSolution:null,compensatedAt:null,assessedAt:null,follows:[],communicationPeriods:[]});
    const r=make(),entry=a.recordAccept(r,'2026-11-04 10:00',{level:'2级'}),first=a.followTools().activePeriod(r);
    assert.equal(first.id,entry.timingPeriodId);assert.equal(first.dueAt,'2026-11-07 10:00');assert.equal(first.timingSource,'default');assert.equal(first.configRevision,7);
    config.defaultTimings['2级']=2;assert.equal(first.dueAt,'2026-11-07 10:00');
    assert.equal(a.recordAccept(r,'2026-11-04 10:30',{level:'2级'}),null);assert.equal(r.communicationPeriods.length,1);
    assert.equal(a.followTools().historyRecords(r).length,0);assert.ok(a.processRecords(r).some(item=>item.title==='客服接单'));
    a.recordFollow(r,{operation:'unresolved',unresolvedReason:'无法联系上客户',note:'等待回电',files:[]},'2026-11-04 11:00');
    assert.equal(first.endedAt,'2026-11-04 11:00');assert.equal(a.followTools().activePeriod(r).dueAt,'2026-11-05 11:00');assert.equal(a.followTools().activePeriod(r).timingSource,'demand');
    a.recordFollow(r,{operation:'unresolved',unresolvedReason:'正和客户协商退款金额',note:'继续沟通',files:[]},'2026-11-04 12:00');
    assert.equal(a.followTools().activePeriod(r).dueAt,'2026-11-06 12:00');assert.equal(a.followTools().activePeriod(r).timingSource,'default');
    const unset=make();a.recordAccept(unset,'2026-11-04 10:00',{level:'1级'});assert.equal(unset.communicationPeriods.length,0);
    const selected=make();selected.customerDemand='无法联系上客户';a.recordAccept(selected,'2026-11-04 10:00',{level:'2级'});assert.equal(a.followTools().activePeriod(selected).dueAt,'2026-11-05 10:00');
    r.status='客服复核中';a.recordClosure(r,'2026-11-04 13:00','确认完成');assert.equal(a.followTools().activePeriod(r),undefined);
  }finally{Object.defineProperty(dict,'current',descriptor)}
});
test('inline timing matrix preserves drafts, inheritance, validation and legacy durations',()=>{
  const base=context.window.PCComplaintOptions,dictionary={...base,save:async()=>{throw Error('unexpected persistence')}},draft={...base.current,defaultTimings:{'1\u7ea7':3,'2\u7ea7':2},demandTimings:{[base.current.demands[3]]:{byLevel:{'1\u7ea7':1}},[base.current.demands[0]]:{value:12,unit:'hours'}}},body={},foot={},message={},layers=[],messages=[];
  const layer={options:{draft,baseline:JSON.stringify(draft),tab:'demands',entries:{demands:{index:null,name:'draft option'},types:{index:null,name:''}},saving:false},el:{querySelector(selector){return selector==='.uc-drawer-body'?body:selector==='.uc-drawer-foot'?foot:selector==='[data-timing-error]'?message:null}}};layers.push(layer);
  let focuses=0;const originalFocus=context.PCUI.focusControl;context.PCUI.focusControl=()=>focuses++;
  const helper=context.window.PCModules['complaint-options'].create({dictionary,getLayers:()=>layers,esc:String,btn:(label,action)=>`<button data-uc="${action}">${label}</button>`,link:(label,action)=>`<button data-uc="${action}">${label}</button>`,section:(title,content,action='')=>title+action+content,field:(id,label,control)=>label+control,input:(id,value,placeholder,type,extra)=>`<input name="${id}" value="${value}" placeholder="${placeholder}" ${extra}>`,toast:message=>messages.push(message)});
  const action=(name,data={})=>helper.optionAction(name,{dataset:data},layer),set=(name,value)=>helper.syncOptionDraft({name,value,removeAttribute(){},setAttribute(){}});
  try{
    action('options-tab',{key:'demands'});assert.ok(!body.innerHTML.includes('name="timing-'));assert.ok(!body.innerHTML.includes('data-uc="options-configure"'));
    action('options-tab',{key:'timings'});assert.equal((body.innerHTML.match(/<table /g)||[]).length,1);assert.equal((body.innerHTML.match(/name="timing-/g)||[]).length,(draft.demands.length+1)*5);assert.ok(!body.innerHTML.includes('options-default-timing'));assert.ok(!body.innerHTML.includes('options-configure'));
    assert.equal(set('optionName','ignored'),false);assert.equal(layer.options.entries.demands.name,'draft option');
    const rendered=body.innerHTML;set('timing-default-0','4');assert.equal(draft.defaultTimings['1\u7ea7'],4);assert.equal(draft.demandTimings[draft.demands[3]].byLevel['1\u7ea7'],1);assert.equal(body.innerHTML,rendered);assert.ok(body.innerHTML.includes('placeholder=""'));assert.ok(!body.innerHTML.includes('data-timing-hint'));
    set('timing-3-0','');set('timing-3-1','0.5');assert.deepEqual(copy(draft.demandTimings[draft.demands[3]].byLevel),{'2\u7ea7':0.5});assert.equal(base.timingFor(draft,draft.demands[3],'1\u7ea7').value,4);
    set('timing-0-0','2');assert.deepEqual(copy(draft.demandTimings[draft.demands[0]].byLevel),{'1\u7ea7':2,'2\u7ea7':0.5,'3\u7ea7':0.5,'4\u7ea7':0.5,'5\u7ea7':0.5});
    set('timing-3-1','-2');assert.equal(draft.demandTimings[draft.demands[3]].byLevel['2\u7ea7'],0.5);assert.equal(layer.options.timingErrors.length,1);assert.ok(helper.optionsDirty(layer.options));
    action('options-tab',{key:'types'});assert.ok(!body.innerHTML.includes('name="timing-'));action('options-tab',{key:'timings'});assert.ok(body.innerHTML.includes('value="-2"'));assert.ok(body.innerHTML.includes('aria-invalid="true"'));
    layer.options.entries.demands.name='';action('options-save');assert.equal(layer.options.saving,false);assert.equal(focuses,1);assert.ok(body.innerHTML.includes('role="alert"'));
    set('timing-3-1','');assert.equal(layer.options.timingErrors.length,0);assert.equal(message.hidden,true);assert.equal(base.timingFor(draft,draft.demands[3],'2\u7ea7').value,2);
    set('timing-default-0','');assert.equal(base.timingFor(draft,draft.demands[3],'1\u7ea7'),null);
    assert.deepEqual(copy(base.current.defaultTimings),{});assert.equal(messages.length,0);
  }finally{context.PCUI.focusControl=originalFocus}
});
test('level-specific day limits select only the matching grade and preserve legacy uniform settings',()=>{
  const dict=context.window.PCComplaintOptions,config={...dict.current,demandTimings:{无法联系上客户:{byLevel:{'1级':3,'2级':2,'3级':1,'4级':0.5}}}};
  assert.doesNotThrow(()=>dict.validate(config));
  for(const [level,value]of [['1级',3],['2级',2],['3级',1],['4级',0.5]])assert.deepEqual(copy(dict.timingFor(config,'无法联系上客户',level)),{value,unit:'days'});
  assert.equal(dict.timingFor(config,'无法联系上客户','5级'),null);assert.equal(dict.timingFor(config,'无法联系上客户',''),null);assert.equal(dict.timingFor(config,'其他','1级'),null);
  for(const byLevel of [{'6级':1},{'1级':0},{'1级':-1},{'1级':'2'},{'1级':Infinity},null,[]])assert.throws(()=>dict.validate({...config,demandTimings:{无法联系上客户:{byLevel}}}));
  assert.deepEqual(copy(dict.daysByLevel({value:12,unit:'hours'})),{'1级':0.5,'2级':0.5,'3级':0.5,'4级':0.5,'5级':0.5});
  const descriptor=Object.getOwnPropertyDescriptor(dict,'current');Object.defineProperty(dict,'current',{get:()=>copy(config)});
  try{
    const draft={operation:'unresolved',unresolvedReason:'无法联系上客户',note:'等待客户回复',files:[]};
    const make=level=>({...copy(record),status:'客服处理中',level,customerSolution:null,compensatedAt:null,follows:[],communicationPeriods:[]});
    const low=make('1级'),high=make('4级'),unset=make('5级');
    for(const r of [low,high,unset])a.recordFollow(r,draft,'2026-11-03 10:00');
    assert.equal(low.communicationPeriods[0].dueAt,'2026-11-06 10:00');assert.equal(high.communicationPeriods[0].dueAt,'2026-11-03 22:00');assert.equal(unset.communicationPeriods[0].dueAt,'');
    const period=low.communicationPeriods[0];low.level='4级';config.demandTimings.无法联系上客户.byLevel['1级']=5;
    a.recordFollow(low,draft,'2026-11-03 11:00');assert.equal(low.communicationPeriods.length,1);assert.equal(period.level,'1级');assert.equal(period.dueAt,'2026-11-06 10:00');
    assert.ok(a.followTools().history(low).includes('3 天（按 1级）'));
  }finally{Object.defineProperty(dict,'current',descriptor)}
});
test('same-reason follow-ups preserve the original clock and configuration snapshot',()=>{
  const dict=context.window.PCComplaintOptions,descriptor=Object.getOwnPropertyDescriptor(dict,'current');
  let config={...dict.current,revision:2,demandTimings:{无法联系上客户:{value:24,unit:'hours'},正和客户协商退款金额:{value:2,unit:'days'}}};
  Object.defineProperty(dict,'current',{get:()=>copy(config)});
  try{
    const r={...copy(record),status:'客服已接单',customerSolution:null,compensatedAt:null,follows:[],communicationPeriods:[]};
    const draft={operation:'unresolved',reasonSource:'demands',unresolvedReason:'无法联系上客户',note:'未接听',files:[]};
    const first=a.recordFollow(r,draft,'2026-11-03 10:00');assert.equal(r.communicationPeriods.length,1);
    const period=r.communicationPeriods[0];assert.equal(period.dueAt,'2026-11-04 10:00');assert.equal(period.configRevision,2);
    config.demandTimings.无法联系上客户={value:1,unit:'hours'};config.revision=3;
    const repeated=a.recordFollow(r,{...draft,note:'再次拨打'},'2026-11-03 11:00');
    assert.equal(repeated.communication.periodId,first.communication.periodId);assert.equal(r.communicationPeriods.length,1);assert.equal(period.dueAt,'2026-11-04 10:00');
    const edited=a.followTools().draft(r,first);edited.note='补充说明';assert.ok(a.followTools().edit(r,first.id,edited,'2026-11-03 11:30'));assert.equal(period.startedAt,'2026-11-03 10:00');
    a.recordFollow(r,{...draft,unresolvedReason:'正和客户协商退款金额'},'2026-11-03 12:00');
    assert.equal(period.endedAt,'2026-11-03 12:00');assert.equal(period.endReason,'未达成原因变更');assert.equal(a.followTools().activePeriod(r).dueAt,'2026-11-05 12:00');
    a.recordFollow(r,draft,'2026-11-03 13:00');assert.equal(r.communicationPeriods.length,3);assert.equal(a.followTools().activePeriod(r).dueAt,'2026-11-03 14:00');
    assert.ok(a.followTools().history(r).includes('24 小时'));assert.ok(a.followTools().overview(r).includes('2026-11-03 14:00'));
    assert.ok(a.recordCompensation(r,valid.value,'2026-11-03 13:30'));assert.equal(a.followTools().activePeriod(r),undefined);assert.equal(r.communicationPeriods[2].endReason,'已确认解决方案');
  }finally{Object.defineProperty(dict,'current',descriptor)}
});
test('unset limits remain unset for an ongoing reason and closure finishes the interval',()=>{
  const dict=context.window.PCComplaintOptions,descriptor=Object.getOwnPropertyDescriptor(dict,'current'),config={...dict.current,demandTimings:{}};
  Object.defineProperty(dict,'current',{get:()=>copy(config)});
  try{
    const r={...copy(record),status:'客服处理中',customerSolution:null,handlingPlan:'unresolved',assessedAt:'2026-11-03 09:00',follows:[],communicationPeriods:[]};
    const draft={operation:'unresolved',unresolvedReason:'无法联系上客户',note:'等待回复',files:[]};
    a.recordFollow(r,draft,'2026-11-03 10:00');const period=r.communicationPeriods[0];assert.equal(period.timing,null);assert.equal(period.dueAt,'');
    config.demandTimings.无法联系上客户={value:12,unit:'hours'};
    a.recordFollow(r,draft,'2026-11-03 11:00');assert.equal(period.timing,null);assert.equal(r.communicationPeriods.length,1);
    a.recordFollow(r,{note:'核对订单',files:[]},'2026-11-03 11:30');assert.equal(period.endedAt,'');
    r.status='客服复核中';assert.ok(a.recordClosure(r,'2026-11-03 12:00','客户已确认完成'));assert.equal(period.endedAt,'2026-11-03 12:00');
    const snapshot=JSON.stringify(r.communicationPeriods);a.recordFollow(r,{note:'结案后补充',files:[]},'2026-11-03 13:00');assert.equal(JSON.stringify(r.communicationPeriods),snapshot);
  }finally{Object.defineProperty(dict,'current',descriptor)}
});

// Transaction-level dictionary checks use an isolated in-memory IDB double.
// They never open or modify the user's browser database.
async function checkOptionStorage(){
  let saved={schema:1,revision:4,demands:['原因甲','原因乙'],types:['门店服务']},writeFailure=false;
  const db={transaction(){
    let candidate,aborted=false;const tx={abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(){return {
      get(){const request={};queueMicrotask(()=>{request.result=copy(saved);request.onsuccess?.();queueMicrotask(()=>{if(aborted)return;if(candidate)saved=candidate;tx.oncomplete?.()})});return request},
      put(value){if(writeFailure){tx.error=Error('QuotaExceededError');tx.abort()}else candidate=copy(value)}
    }}};return tx;
  }};
  const local={setTimeout,clearTimeout,indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess());return request}},window:{addEventListener(){}}};
  const source=fs.readFileSync(path.join(__dirname,'../pages/complaint-options/storage.js'),'utf8');vm.runInNewContext(source,local);
  const dict=local.window.PCComplaintOptions,initial=await dict.read();assert.deepEqual(copy(initial.demandTimings),{});assert.equal(saved.demandTimings,undefined);
  const next={...copy(initial),defaultTimings:{'1级':5,'2级':3,'3级':2},demandTimings:{原因甲:{byLevel:{'1级':3,'2级':2,'4级':0.5}}}};await dict.save(next,4);assert.equal(saved.revision,5);
  const fresh={...local,window:{addEventListener(){}}};vm.runInNewContext(source,fresh);const reloaded=await fresh.window.PCComplaintOptions.read();assert.deepEqual(copy(reloaded.demandTimings),copy(next.demandTimings));assert.deepEqual(copy(reloaded.defaultTimings),copy(next.defaultTimings));assert.equal(fresh.window.PCComplaintOptions.timingFor(reloaded,'原因甲','3级').value,2);
  await assert.rejects(dict.save({...next,demandTimings:{}},4),/其他页面/);assert.equal(saved.revision,5);assert.equal(dict.current.demandTimings.原因甲.byLevel['2级'],2);
  writeFailure=true;await assert.rejects(dict.save({...next,demandTimings:{},defaultTimings:{'1级':9}},5),/QuotaExceededError/);assert.equal(saved.revision,5);assert.equal(dict.current.demandTimings.原因甲.byLevel['2级'],2);assert.equal(saved.defaultTimings['1级'],5);assert.equal(dict.current.defaultTimings['1级'],5);
  writeFailure=false;saved={...saved,revision:6,demandTimings:{原因甲:{value:3,unit:'hours'}}};let notified=0;dict.subscribe(()=>notified++);await dict.refresh();assert.equal(dict.current.revision,6);assert.equal(notified,1);
  const unavailable={setTimeout,clearTimeout,indexedDB:{open(){throw Error('SecurityError')}},window:{addEventListener(){}}};vm.runInNewContext(source,unavailable);await assert.rejects(unavailable.window.PCComplaintOptions.read(),/SecurityError/);assert.equal(unavailable.window.PCComplaintOptions.error,'SecurityError');
  count++;console.log('PASS duration dictionaries preserve legacy data, reload, concurrent revisions and failed transactions');
}
const financeTicket=()=>({...copy(record),id:'finance-test',status:'客服处理中',acceptedBy:'原客服',financeApprovals:[],execution:null,customerSolution:null,compensatedAt:null,follows:[],logs:[],statusDetail:'',currentTask:'',communicationPeriods:[]});
test('confirming a refund creates one immutable approval and locks the submitted solution',()=>{
  const r=financeTicket(),solution=copy(valid.value),entry=a.recordCompensation(r,solution,'2026-11-06 10:00');
  assert.equal(r.status,'财务审批中');assert.equal(a.listProgressText(r),'处理中');assert.equal(r.financeApprovals.length,1);assert.equal(entry.approvalId,r.financeApprovals[0].id);
  assert.equal(a.canAssess(r),false);assert.equal(a.canClose(r),false);assert.ok(!a.detailActions(r).includes('close-case'));
  assert.ok(a.workflow.can(r,'editAssessment'));assert.ok(a.processView(r).includes('view-finance-approval'));
  const before=JSON.stringify(r);assert.equal(a.recordCompensation(r,solution,'2026-11-06 10:01'),null);assert.equal(JSON.stringify(r),before);
  solution.refund=1;assert.notEqual(r.financeApprovals[0].customerSolution.refund,1);
  assert.ok(a.recordFollow(r,{note:'已向客户说明审批进度',files:[]},'2026-11-06 10:02'));assert.equal(r.status,'财务审批中');
  assert.equal(a.recordFollow(r,{operation:'unresolved',unresolvedReason:'无法联系上客户',files:[]},'2026-11-06 10:03'),null);
  assert.equal(a.recordClosure(r,'2026-11-06 10:04'),null);
});
test('rejection and confirmed withdrawal return ownership, preserve the scheme and allow unchanged resubmission',()=>{
  for(const result of ['rejected','withdrawn']){
    const r=financeTicket();a.recordCompensation(r,valid.value,'2026-11-06 10:00');const approval=r.financeApprovals[0],snapshot=JSON.stringify(approval.customerSolution);
    const event=a.workflow.returnFinance(r,{approvalId:approval.id,result,reason:'核对资料后重新提交',actor:'审批操作人',time:'2026-11-06 10:10'});
    assert.ok(event);assert.equal(r.status,'客服处理中');assert.equal(r.currentHandler,'原客服');assert.equal(r.currentDepartment,'售后客服');assert.equal(a.canAssess(r),true);
    const label=result==='rejected'?'财务驳回':'审批已撤销';assert.equal(a.listProgressText(r),label);assert.equal(a.currentTask(r),label);
    const cell=a.complaintRow(r).split('</td>')[5];assert.equal(cell.includes('uc-error'),result==='rejected');assert.ok(cell.includes(label));
    const html=a.processView(r);for(const text of [label,'核对资料后重新提交','调整方案并重新提交'])assert.ok(html.includes(text));
    const history=a.followTools().historyRecords(r,a.executionResultRecords(r));assert.ok(!history.some(f=>f.kind==='workflow'&&f.action==='财务审批'));
    assert.ok(a.recordCompensation(r,copy(approval.customerSolution),'2026-11-06 10:20'));assert.equal(r.status,'财务审批中');assert.equal(r.financeApprovals.length,2);assert.equal(a.listProgressText(r),'处理中');
    assert.equal(JSON.stringify(r.financeApprovals[0].customerSolution),snapshot);assert.equal(r.financeApprovals[0].status,result);assert.equal(r.financeApprovals[1].status,'pending');
    const process=a.processView(r),current=[...process.matchAll(/<li class="uc-process-node[\s\S]*?<\/li>/g)].map(match=>match[0]).filter(node=>node.includes('aria-current="step"'));assert.ok(process.includes('第 1 次'));assert.ok(process.includes('第 2 次'));assert.equal(current.length,1);assert.ok(current[0].includes('第 2 次'));assert.ok(!current[0].includes(label));
    assert.equal(r.follows.filter(f=>f.kind==='compensation').length,2);
  }
});
test('new communication replaces the return hint, ordinary notes and editing older communication do not',()=>{
  const r=financeTicket();a.recordCompensation(r,valid.value,'2026-11-06 10:00');const approval=r.financeApprovals[0];
  a.workflow.returnFinance(r,{approvalId:approval.id,result:'rejected',reason:'核对金额',actor:'财务',time:'2026-11-06 10:10'});
  assert.ok(a.recordFollow(r,{note:'内部核对中',files:[]},'2026-11-06 10:11'));assert.equal(a.listProgressText(r),'财务驳回');
  const follow=a.recordFollow(r,{operation:'unresolved',unresolvedReason:'无法联系上客户',note:'再次联系',files:[]},'2026-11-06 10:12');assert.equal(a.listProgressText(r),'无法联系上客户');assert.equal(a.currentTask(r),'无法联系上客户');
  const draft=a.followTools().draft(r,follow);draft.unresolvedReason='正和客户协商退款金额';a.followTools().edit(r,follow.id,draft,'2026-11-06 10:13');assert.equal(a.listProgressText(r),'正和客户协商退款金额');
  a.recordCompensation(r,valid.value,'2026-11-06 10:14');const second=r.financeApprovals.at(-1);a.workflow.returnFinance(r,{approvalId:second.id,result:'withdrawn',time:'2026-11-06 10:15'});
  draft.unresolvedReason='无法联系上客户';a.followTools().edit(r,follow.id,draft,'2026-11-06 10:16');assert.equal(a.listProgressText(r),'审批已撤销');
});
test('same-second event order and custom reason names keep return hints and colors accurate',()=>{
  const r=financeTicket();a.recordCompensation(r,valid.value,'2026-11-06 10:00');const approval=r.financeApprovals[0];
  a.workflow.returnFinance(r,{approvalId:approval.id,result:'rejected',reason:'核对金额',time:'2026-11-06 10:10'});
  const follow=a.recordFollow(r,{operation:'unresolved',unresolvedReason:'无法联系上客户',files:[]},'2026-11-06 10:10');assert.equal(a.listProgressText(r),'无法联系上客户');
  follow.communication.reason='财务驳回';assert.equal(a.listProgressText(r),'财务驳回');assert.ok(!a.complaintRow(r).split('</td>')[5].includes('uc-error'));
});
test('confirming a replacement without refund ends the old return hint without creating another finance round',()=>{
  const r=financeTicket();a.recordCompensation(r,valid.value,'2026-11-06 10:00');const approval=r.financeApprovals[0];a.workflow.returnFinance(r,{approvalId:approval.id,result:'withdrawn',time:'2026-11-06 10:10'});
  assert.ok(a.recordCompensation(r,{...copy(valid.value),handlingMethods:['exchange'],refund:0,refundOrders:[]},'2026-11-06 10:20'));assert.equal(r.status,'客服处理中');assert.equal(r.financeApprovals.length,1);assert.equal(a.workflow.financeReturn(r),null);assert.equal(a.listProgressText(r),'');
});
test('duplicate and outdated approval results cannot return a new round or closed case',()=>{
  const r=financeTicket();a.recordCompensation(r,valid.value,'2026-11-06 10:00');const first=r.financeApprovals[0];
  const event={approvalId:first.id,result:'rejected',reason:'资料不全',time:'2026-11-06 10:10'};assert.ok(a.workflow.returnFinance(r,event));
  const before=JSON.stringify(r);assert.equal(a.workflow.returnFinance(r,event),null);assert.equal(JSON.stringify(r),before);
  a.recordCompensation(r,valid.value,'2026-11-06 10:20');const pending=JSON.stringify(r);assert.equal(a.workflow.returnFinance(r,event),null);assert.equal(JSON.stringify(r),pending);
  const current=r.financeApprovals.at(-1);r.status='已结案';const closed=JSON.stringify(r);assert.equal(a.workflow.returnFinance(r,{...event,approvalId:current.id}),null);assert.equal(JSON.stringify(r),closed);
});
test('exception fixtures show complete editable proposals and readonly approval snapshots',()=>{
  for(const id of ['31038','31039']){
    const r=a.select(id),approval=a.workflow.financeApproval(r);assert.equal(r.status,'客服处理中');assert.equal(a.validateCustomerSolution(a.solutionDraft(r.customerSolution)).errors.length,0);
    const html=a.financeApprovalView(r,approval);for(const text of ['审批编号','提交时间','处理时间','已提交方案',approval.reason])assert.ok(html.includes(text),text);
    assert.ok(!html.includes('save-compensation'));assert.ok(!html.includes('begin-compensation'));assert.equal(r.financeApprovals.length,1);
  }
  a.select('31001');
});
test('legacy finance results migrate once without overwriting their evidence or other stages',()=>{
  for(const [label,status]of [['财务驳回','rejected'],['审批已撤销','withdrawn']]){
    const r=financeTicket();r.status='财务审批中';r.customerSolution=copy(valid.value);r.compensatedAt='2026-11-06 10:00';r.statusDetail=label;
    r.execution={index:0,steps:[{id:'legacy',kind:'financeApproval',type:'approval',approvalResult:label,result:'原审批意见',startedAt:r.compensatedAt}]};
    assert.ok(a.workflow.reconcileFinance(r));assert.equal(r.status,'客服处理中');assert.equal(r.financeApprovals[0].status,status);assert.equal(r.financeApprovals[0].reason,'原审批意见');
    const saved=JSON.stringify(r);assert.equal(a.workflow.reconcileFinance(r),false);assert.equal(JSON.stringify(r),saved);
  }
  const procurement={...financeTicket(),status:'采购审批中',statusDetail:'采购驳回'},before=JSON.stringify(procurement);assert.equal(a.workflow.reconcileFinance(procurement),false);assert.equal(JSON.stringify(procurement),before);
});
test('approval drafts persist atomically and restore both rounds after reload',()=>{
  let raw=JSON.stringify(a.records.map(r=>r.id==='31038'?copy(r):r)),fail=false;
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?raw:null,setItem:(k,v)=>{if(fail)throw Error('QuotaExceededError');raw=v}}};
  const boot=()=>{loadOptions(local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);return local.window.testAPI};
  let api=boot(),next=copy(api.records),r=next.find(r=>r.id==='31038');assert.ok(api.recordCompensation(r,r.customerSolution,'2026-11-06 12:00'));
  const original=raw;fail=true;assert.equal(api.persist(next),false);assert.equal(raw,original);assert.equal(api.records.find(item=>item.id===r.id).status,'客服处理中');
  fail=false;assert.ok(api.persist(next));api=boot();r=api.records.find(r=>r.id==='31038');assert.equal(r.status,'财务审批中');assert.equal(r.financeApprovals.length,2);assert.equal(api.listProgressText(r),'处理中');assert.equal(api.workflow.financeApproval(r).status,'pending');
});
checkOptionStorage().then(()=>console.log(`${count} business checks passed.`)).catch(error=>{console.error(error);process.exitCode=1});
