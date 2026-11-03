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
  PCUI:{registerPager(){}},ElementPlus:{ElMessage(){}},window:{PCModules:{},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-solutions/index.js'),'utf8'),context);
const workflowCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8');
vm.runInNewContext(workflowCode,context);
function loadOptions(target){vm.runInNewContext(workflowCode,target);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-fixtures/index.js'),'utf8'),target);for(const file of ['storage.js','index.js'])vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-options',file),'utf8'),target)}
loadOptions(context);
const followCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-follow/index.js'),'utf8');
vm.runInNewContext(followCode,context);
const processCode=fs.readFileSync(path.join(__dirname,'../pages/complaint-detail/index.js'),'utf8');
vm.runInNewContext(processCode,context);
const hook = `window.testAPI={toCents,orderDateRange,filtered,matchingOrders,orderPickerState,orderPickerOrders,orderPickerView,selectPickerOrder,handlingMissing,validateCustomerSolution,solutionDraft,solutionTotals,solutionOrders,refundEntries,refundAvailable,solutionTools,solutionRead,recordAccept,recordRecognition,recordCompensation,recordFollow,followTools,recordClosure,hasHandlingScheme,canClose,responsibleOptions,complaintCSV,validHandlingFile,records,orders,persist,canAssess,STATUS_TABS,WORK_ORDER_STATUSES,CHANNELS,workOrderStatus,normalizeRecordStatus,statusScope,currentHandler,currentTask,detailActions,complaintRow,summary,phoneView,processingDepartment,processRecords,processView,select(id){main={record:records.find(r=>r.id===id)};return main.record;}};`;
vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),context);
const a=context.window.testAPI;
let count=0;
const test=(name,run)=>{run();count++;console.log('PASS '+name)};
const copy=o=>JSON.parse(JSON.stringify(o));
test('seed contains all three channels and 23 complaints / 27 orders',()=>{assert.equal(a.records.length,23);assert.equal(a.orders.length,27);assert.deepEqual([...new Set(a.records.map(r=>r.channel))].sort(),['mini','staff','wechat'])});
test('PC writes only its own storage key',()=>assert.deepEqual([...storage.keys()],['weid.pc.complaints.v1']));
test('money precision, invalid decimals, negatives and overflow',()=>{assert.equal(a.toCents('12.34'),1234);assert.equal(a.toCents('0.01'),1);for(const v of ['1.001','-1','1e3','Infinity','9007199254740992'])assert.equal(a.toCents(v),null)});
test('date shortcuts handle leap year and week boundary',()=>{assert.deepEqual(copy(a.orderDateRange('lastMonth','2024-03-01')),{start:'2024-02-01',end:'2024-02-29'});assert.deepEqual(copy(a.orderDateRange('week','2026-10-22')),{start:'2026-10-19',end:'2026-10-25'})});
test('keyword, channel, status, date and linked filters compose',()=>{assert.equal(a.filtered({keyword:'3858',keywordType:'phone'}).length,1);assert.equal(a.filtered({keyword:'3858',keywordType:'phone',channel:'wechat'}).length,0);assert.ok(a.filtered({channel:'wechat',status:'待处理',linked:'yes'}).every(r=>r.channel==='wechat'&&r.status==='待处理'&&r.linked.length));assert.equal(a.filtered({start:'2099-01-01'}).length,0)});
test('order search independent keyword/consultant/date criteria',()=>{assert.equal(a.matchingOrders({keywordType:'phone',keyword:'3858'}).length,2);assert.equal(a.matchingOrders({keywordType:'name',keyword:'王秀珍',consultant:'不存在'}).length,0)});
test('known customer opens all of their orders by ID regardless of masked contact or stale filters',()=>{
  const r=a.records.find(r=>r.id==='31001'),e=a.orderPickerState({...r,phone:'unknown'});
  e.orderFilters={keyword:'other person',keywordType:'name',start:'2099-01-01',consultant:'其他'};
  const matches=a.orderPickerOrders(e);assert.equal(matches.length,2);assert.ok(matches.every(o=>o.customerId===r.customerId));
  assert.ok(matches.some(o=>o.state==='已完成'));assert.equal(e.orderSearch.keyword,'');
  assert.ok(!a.orderPickerView(e).includes('id="uc-order-search"'));
});
test('unknown customer waits for an explicit search and retains the search form',()=>{
  const e=a.orderPickerState({customerId:null,phone:'150****3858',linked:[]});
  assert.equal(a.orderPickerOrders(e).length,0);assert.ok(a.orderPickerView(e).includes('请先搜索客户'));
  assert.ok(a.orderPickerView(e).includes('id="uc-order-search"'));
  e.orderFilters={keywordType:'member',keyword:a.orders[0].member};
  assert.equal(a.orderPickerOrders(e).length,2);assert.ok(a.orderPickerOrders(e).every(o=>o.customerId===a.orders[0].customerId));
  e.orderFilters.keyword='';assert.equal(a.orderPickerOrders(e).length,0);
});
test('known customer without orders stays scoped instead of falling back to other customers',()=>{
  const e=a.orderPickerState({customerId:'no-orders',name:a.orders[0].name,phone:a.orders[0].phone,linked:[]});
  assert.equal(a.orderPickerOrders(e).length,0);const html=a.orderPickerView(e);
  assert.ok(html.includes('该客户暂无订单'));assert.ok(!html.includes('id="uc-order-search"'));
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
      assert.equal(entry.kind,'compensation');assert.equal(entry.beforeStatus,status);assert.equal(r.status,'客服处理中');
      assert.deepEqual(copy(r.customerSolution),copy(valid.value));assert.equal(a.hasHandlingScheme(r),false);
      const saved=JSON.stringify(r);assert.equal(a.recordCompensation(r,valid.value,'2026-10-26 14:01'),null);assert.equal(JSON.stringify(r),saved);
    }else{assert.equal(entry,null);assert.equal(JSON.stringify(r),before)}
  }
});
test('pending cannot save a solution or gain closure permission',()=>{
  const before=JSON.stringify(record);assert.equal(a.recordCompensation(record,valid.value,'2026-10-22 14:28'),null);
  assert.equal(JSON.stringify(record),before);assert.equal(a.canClose(record),false);
});
test('pending cannot skip confirmation to save a scheme or follow up',()=>{assert.equal(a.recordRecognition(copy(record),draft,'2026-10-22 14:29'),null);assert.equal(a.recordFollow(copy(record),{note:'x',files:[]},'2026-10-22 14:29'),null)});
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
  assert.equal(result.beforeStatus,'客服已接单');assert.equal(r.status,'客服处理中');assert.equal(r.startedAt,'2026-10-22 14:29');
  assert.equal(r.assessedAt,undefined);assert.equal(a.canClose(r),false);assert.ok(!r.follows.some(f=>f.kind==='start'));
});
test('started and followed complaints cannot close before a saved handling scheme',()=>{const r=copy(record),original=JSON.stringify(r);assert.equal(a.canClose(r),false);assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);assert.equal(JSON.stringify(r),original);assert.ok(a.recordFollow(r,{note:'follow',files:[]},'2026-10-22 14:29'));assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);r.handlingPlan='unresolved';assert.equal(a.canClose(r),false)});
test('first scheme retains independently saved compensation and ignores solution fields from handling',()=>{assert.ok(a.recordCompensation(record,valid.value,'2026-10-22 14:29'));const result=a.recordRecognition(record,{...draft,customerSolution:null},'2026-10-22 14:30');assert.ok(result);assert.equal(result.action,'责任认定');assert.equal(record.status,'客服处理中');assert.equal(record.follows[0].customerSolution.refundOrders.length,2)});
test('closure eligibility accepts saved and historical schemes but not pending or completed',()=>{assert.equal(a.canClose(record),true);const legacy=copy(record);delete legacy.assessedAt;assert.equal(a.canClose(legacy),true);assert.equal(a.canClose({...legacy,status:'待处理'}),false);assert.equal(a.canClose({...legacy,status:'已结案'}),false);assert.equal(a.canClose({...legacy,handlingPlan:''}),false)});
test('handling, responsibility and eligible closure are direct buttons without More',()=>{
  const primary=html=>(html.match(/class="btn primary"[^>]*data-uc="([^"]+)"/)||[])[1];
  for(const status of a.WORK_ORDER_STATUSES){
    const r={...copy(record),status},html=a.detailActions(r);
    assert.equal(primary(html),status==='待处理'?'accept-case':'begin-handling',status);
    assert.ok(html.includes('reply-customer'));assert.equal((html.match(/class="btn primary"/g)||[]).length,1);
    for(const action of ['begin-compensation','write-follow'])assert.ok(!html.includes(action));
    assert.equal(html.includes('begin-assessment'),a.canAssess(r));
    assert.ok(!html.includes('data-pc-menu'));
    assert.equal(html.includes('close-case'),a.canClose(r));
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
test('closed-store type skips responsibility and clears stale assignments only on saving',()=>{const d={...draft,type:'闭店',responsible:[]};assert.equal(a.handlingMissing(d).length,0);assert.ok(a.handlingMissing({...d,type:'门店服务'}).some(e=>e[0]==='responsible'));const r={...copy(record),status:'客服处理中'};assert.ok(a.recordRecognition(r,{...d,responsible:['旧责任人']},'2026-10-22 15:00'));assert.deepEqual(copy(r.responsible),[])});
test('responsibility options include departed staff, historical snapshots and selected missing names',()=>{const options=a.responsibleOptions(['当前显示但不在册'],[{name:'离职责任人',employmentStatus:'离职'}],[{responsible:['历史责任人'],follows:[{responsible:['跟进责任人'],before:{responsible:['调整前责任人']}}]}],[{consultant:'订单顾问',projects:[{operator:'操作老师'}]}]);const map=new Map(options);for(const n of ['当前显示但不在册','历史责任人','跟进责任人','调整前责任人','订单顾问','操作老师'])assert.equal(map.get(n),n);assert.equal(map.get('离职责任人'),'离职责任人（离职）');assert.equal(a.responsibleOptions().find(([name])=>name==='张宁')[1],'张宁（离职）')});
test('handling attachment formats retain MIME verification',()=>{for(const f of [{name:'x.png',type:'image/png'},{name:'x.pdf',type:'application/pdf'},{name:'x.amr',type:''},{name:'x.m4a',type:'audio/x-m4a'}])assert.ok(a.validHandlingFile(f));for(const f of [{name:'x.exe',type:''},{name:'x.png',type:'application/pdf'},{name:'x.html',type:'text/html'}])assert.equal(a.validHandlingFile(f),false)});
test('CSV preserves filtered rows, Chinese BOM, quotes and formula protection',()=>{const csv=a.complaintCSV([{...copy(record),name:'=1+1',content:'包含,逗号和\"引号\"'}]);assert.equal(csv[0],'\uFEFF');assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('\"包含,逗号和\"\"引号\"\"\"'));assert.ok(csv.includes('\"已结案\"'))});
test('department stages survive notes and cannot be closed or reset by customer service',()=>{
  for(const status of ['财务审批中','采购审批中','待财务付款','待采购发货']){
    const r={...copy(record),status};assert.equal(a.canClose(r),false);assert.equal(a.recordClosure(r,'2026-11-02 12:00'),null);
    assert.equal(a.recordRecognition(r,draft,'2026-11-02 12:00'),null);assert.equal(r.status,status);
    {assert.ok(a.recordFollow(r,{note:'继续核实',files:[]},'2026-11-02 12:01'));assert.equal(r.status,status)}
    assert.ok(!a.detailActions(r).includes('begin-assessment'));assert.ok(!a.detailActions(r).includes('close-case'));
  }
  const r={...copy(record),status:'客服复核中'};assert.ok(a.recordClosure(r,'2026-11-02 12:02'));assert.equal(r.status,'已结案');
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
test('nine intake sources keep customer WeCom separate from employee handoff',()=>{
  assert.equal(Object.keys(a.CHANNELS).length,9);assert.ok(a.CHANNELS.wecom.includes('客户'));assert.ok(a.CHANNELS.sales.includes('员工'));
  const original=a.records.length;
  try{for(const channel of Object.keys(a.CHANNELS))a.records.push({...copy(record),id:'source-'+channel,channel});
    for(const channel of Object.keys(a.CHANNELS))assert.equal(a.filtered({channel}).filter(r=>r.id.startsWith('source-')).length,1);
  }finally{a.records.splice(original)}
});
test('list retains orders and complaint content with a single workflow status',()=>{
  const r={...copy(record),status:'待财务付款',statusDetail:'收款账户待核实',currentHandler:'财务甲',content:'完整投诉正文标记',member:'会员标记',phone:'电话标记',department:['门店'],responsible:['责任乙'],channel:'legal',type:'服务类',submitter:'客户本人'};
  const html=a.complaintRow(r);for(const value of ['待财务付款','责任乙','法人电话',r.level,r.content,r.member,r.phone,r.linked[0].id,r.store])assert.ok(html.includes(value));
  for(const value of ['收款账户待核实','财务甲','当前事项 / 卡点','当前处理节点','发起人','客户本人'])assert.ok(!html.includes(value));
  const cells=html.split('</td>');
  assert.ok(cells[2].includes('售后类型：'+r.type));
  assert.ok(cells[3].includes('工单号：'+r.id));
  assert.ok(cells[3].includes(r.content));
  assert.ok(!cells[3].includes(r.type));
  assert.ok(a.complaintCSV([r]).includes('收款账户待核实'));
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
  assert.ok(!html.includes('客户沟通内容'));assert.ok(!html.includes('付款成功'));assert.equal(JSON.stringify(r),before);
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
  for(const value of ['已完成 1 / 4','售后办理','付款审批','付款办理','客服复核','财务甲','客服乙','审批中','已超时','完成于 2020-01-01 09:00','到达后分派','到达后开始计时','查看审批'])assert.ok(html.includes(value),value);
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
  assert.ok(html.includes('已完成 0 / 1'));assert.ok(html.includes('售后办理'));
  assert.ok(!html.includes('付款审批'));assert.ok(!html.includes('付款办理'));assert.ok(!html.includes('查看审批'));
  assert.ok(html.includes('办理时限待确认'));assert.ok(!html.includes('已超时'));
  const closed=a.processView({status:'已结案',closedAt:'2026-11-03 10:00',closedBy:'客服乙',follows:[]});
  assert.ok(closed.includes('客服复核'));assert.ok(!closed.includes('售后办理'));assert.ok(closed.includes('流程已结束'));
});
test('local example flow shows completed, active and future stages while preserving saved complaint data',()=>{
  const r={...copy(a.records.find(r=>r.id==='31017')),status:'客服处理中',currentHandler:'客服甲',startedAt:'2026-11-03 09:30',customerSolution:null};
  const before=JSON.stringify(r),html=a.processView(r);
  for(const value of ['已完成 1 / 5','客服接单','售后办理','付款审批','付款办理','客服复核','is-done','is-current','is-future','客服甲','完成于','到达后开始计时'])assert.ok(html.includes(value),value);
  assert.ok(!html.includes('示例流程'));
  assert.equal(JSON.stringify(r),before);
  assert.ok(!a.summary(r).includes('uc-ticket-progress'));assert.ok(a.summary(r).includes(r.content));
  for(const status of a.WORK_ORDER_STATUSES){
    const view=a.processView({...r,status});
    assert.equal((view.match(/aria-current="step"/g)||[]).length,status==='已结案'?0:1,status);
    if(status==='已结案'){assert.ok(!view.includes('is-future'));assert.ok(view.includes('流程已结束'));}
  }
});
test('example routes include procurement branches without store handoff and leave actual workflow records authoritative',()=>{
  const own=copy(a.records.find(r=>r.id==='31017'));
  for(const [status,node]of [['采购审批中','采购审批'],['待采购发货','采购办理']])assert.ok(a.processView({...own,status}).includes(node));
  assert.ok(!a.processView({...own,customerId:'unrelated'}).includes('付款审批'));
  const actual={...own,execution:{index:0,steps:[{type:'handling',title:'真实办理节点',people:['实际办理人']}]}};
  const html=a.processView(actual);assert.ok(html.includes('真实办理节点'));assert.ok(!html.includes('示例流程'));assert.ok(!html.includes('付款审批'));
  const pending=a.processView({...own,status:'待处理',currentHandler:'',acceptedBy:'',startedBy:''});
  assert.ok(pending.includes('已完成 0 / 5'));assert.ok(pending.includes('接单后开始计时'));
});
test('suspension pauses node timing and closure does not mark unexecuted route nodes complete',()=>{
  const r={status:'已挂起',taskDeadline:'2020-01-01 10:00',execution:{index:0,steps:[
    {type:'approval',title:'付款审批',external:{url:'javascript:alert(1)'}},
    {type:'handling',title:'付款办理'}
  ]}};
  const paused=a.processView(r);assert.ok(paused.includes('节点计时已暂停'));assert.ok(!paused.includes('已超时'));assert.ok(!paused.includes('查看审批'));
  r.status='已结案';const closed=a.processView(r);assert.ok(!closed.includes('is-current'));assert.ok(!closed.includes('is-done'));assert.ok(!closed.includes('未开始'));assert.ok(closed.includes('无需办理'));
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
  const r={...copy(record),status:'客服已接单',customerSolution:null,assessedAt:null,follows:[]},d={note:'已电话联系，客户暂未接听',files:[],followResult:'ongoing',unresolvedReason:'申请退款',nextFollowAt:'2026-11-04T10:00'};
  const entry=a.recordFollow(r,d,'2026-11-03 10:00');assert.ok(entry);assert.equal(r.status,'客服处理中');assert.equal(entry.beforeStatus,'客服已接单');
  assert.equal(r.customerSolution,null);assert.equal(r.assessedAt,null);assert.equal(a.canClose(r),false);
  assert.equal(a.followTools().current(r),entry);assert.equal(entry.communication.reason,'申请退款');assert.equal(entry.communication.nextFollowAt,'2026-11-04T10:00');
  assert.ok(a.followTools().overview(r).includes('申请退款'));assert.ok(a.followTools().history(r).includes('2026-11-04 10:00'));
  d.unresolvedReason='解释说明';d.files.push({name:'local'});assert.equal(entry.communication.reason,'申请退款');assert.equal(entry.files.length,0);
});
test('communication outcomes validate required reasons, explanations and dates before mutation',()=>{
  const r={...copy(record),status:'客服处理中',follows:[]},base={note:'',files:[],followResult:'ongoing',unresolvedReason:'申请退款',nextFollowAt:''};
  for(const change of [{followResult:''},{followResult:'unknown'},{unresolvedReason:''},{unresolvedReason:'unknown'},{unresolvedReason:'其他'},{nextFollowAt:'2026-02-30T10:00'},{nextFollowAt:'invalid'}]){
    const before=JSON.stringify(r);assert.equal(a.recordFollow(r,{...base,...change},'2026-11-03 10:00'),null);assert.equal(JSON.stringify(r),before);
  }
  for(const reason of context.window.PCComplaintOptions.current.demands)assert.ok(a.recordFollow(r,{...base,unresolvedReason:reason,note:reason==='其他'?'客户要求家属参与沟通':''},'2026-11-03 10:00'));
});
test('ordinary notes preserve communication blockers and do not start accepted work',()=>{
  const r={...copy(record),status:'客服已接单',follows:[]};a.recordFollow(r,{note:'内部资料已补充',files:[]},'2026-11-03 10:00');assert.equal(r.status,'客服已接单');assert.equal(a.followTools().current(r),null);
  const progress=a.recordFollow(r,{note:'协商金额',files:[],followResult:'ongoing',unresolvedReason:'解释说明'},'2026-11-03 10:01');
  a.recordFollow(r,{note:'补充订单核实结果',files:[],followResult:'note',unresolvedReason:'申请退款',nextFollowAt:'invalid'},'2026-11-03 10:02');
  assert.equal(a.followTools().current(r),progress);assert.equal(r.follows[0].communication,undefined);
});
test('customer agreement clears the blocker but does not submit a solution or close the case',()=>{
  const r={...copy(record),status:'客服处理中',handlingPlan:'unresolved',customerSolution:null,follows:[]};
  a.recordFollow(r,{note:'金额未达成一致',files:[],followResult:'ongoing',unresolvedReason:'解释说明'},'2026-11-03 10:00');
  const entry=a.recordFollow(r,{note:'客户同意协商金额',files:[],followResult:'agreed',unresolvedReason:'解释说明',nextFollowAt:'invalid'},'2026-11-03 11:00');
  assert.equal(entry.communication.reason,'');assert.equal(entry.communication.nextFollowAt,'');assert.equal(r.status,'客服处理中');assert.equal(r.customerSolution,null);assert.equal(a.canClose(r),false);
  const view=a.followTools().overview(r);assert.ok(view.includes('填写解决方案'));assert.ok(!view.includes('未达成原因'));assert.ok(a.followTools().history(r).includes('解释说明'));
  assert.ok(a.recordCompensation(r,valid.value,'2026-11-03 12:00'));assert.equal(a.followTools().current(r),null);assert.equal(a.followTools().overview(r),'');
});
test('financial, procurement, review and closed stages accept notes but cannot change communication outcomes',()=>{
  for(const status of ['待处理','财务审批中','采购审批中','待财务付款','待采购发货','客服复核中','已结案']){
    const r={...copy(record),status},before=JSON.stringify(r);
    for(const result of ['ongoing','agreed']){assert.equal(a.recordFollow(r,{note:'跟进',files:[],followResult:result,unresolvedReason:'解释说明'},'2026-11-03 10:00'),null);assert.equal(JSON.stringify(r),before)}
    assert.equal(a.followTools().draft(r).followResult,'note');assert.ok(!a.followTools().form(r,a.followTools().draft(r)).includes('name="followResult"'));
    if(status!=='待处理'){assert.ok(a.recordFollow(r,{note:'补充记录',files:[]},'2026-11-03 10:00'));assert.equal(r.status,status)}
  }
});
test('editing retains original communication time and snapshots without replacing a newer blocker',()=>{
  const r={...copy(record),status:'客服处理中',customerSolution:null,follows:[]};
  const first=a.recordFollow(r,{note:'电话未接',files:[],followResult:'ongoing',unresolvedReason:'申请退款'},'2026-11-03 10:00');
  const latest=a.recordFollow(r,{note:'客户接听，金额未谈妥',files:[],followResult:'ongoing',unresolvedReason:'解释说明'},'2026-11-03 11:00');
  const d=a.followTools().draft(r,first);d.note='补充：上午拨打两次';assert.ok(a.followTools().edit(r,first.id,d,'2026-11-03 12:00'));
  assert.equal(a.followTools().current(r),latest);assert.equal(first.time,'2026-11-03 10:00');assert.equal(first.revisions[0].note,'电话未接');assert.equal(first.revisions[0].communication.reason,'申请退款');
  const before=JSON.stringify(r);d.unresolvedReason='其他';assert.equal(a.followTools().edit(r,first.id,d,'2026-11-03 13:00'),null);assert.equal(JSON.stringify(r),before);
  r.status='已结案';d.unresolvedReason='申请退款';assert.ok(a.followTools().edit(r,first.id,d,'2026-11-03 13:00'));assert.equal(r.status,'已结案');assert.equal(a.followTools().current(r),null);
});
test('old complaints receive pending examples once without resetting existing work',()=>{
  const existing=copy(a.records.filter(r=>Number(r.id)<31019));existing.forEach(r=>r.status='已结案');let raw=JSON.stringify(existing);
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?raw:null,setItem:(k,v)=>{assert.equal(k,'weid.pc.complaints.v1');raw=v}}};
  const boot=()=>{loadOptions(local);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8'),local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);return local.window.testAPI.records};
  const loaded=boot();assert.equal(loaded.length,23);assert.ok(loaded.filter(r=>Number(r.id)<31019).every(r=>r.status==='已结案'));
  for(const id of ['31019','31020','31021','31022','31023']){const r=loaded.find(r=>r.id===id);assert.equal(r.status,'待处理');assert.ok(r.level);assert.equal(r.follows.length,0);assert.equal(r.linked.length,1);assert.equal(r.customerSolution,undefined)}
  const refreshed=boot();assert.equal(refreshed.length,23);assert.equal(refreshed.filter(r=>r.status==='待处理').length,5);
  const pending=refreshed.filter(r=>Number(r.id)>=31021);assert.deepEqual(copy(pending.map(r=>r.channel).sort()),['mini','staff','wechat']);
  for(const r of pending){assert.ok(r.files.length);assert.ok(local.window.testAPI.detailActions(r).includes('accept-case'));assert.ok(local.window.testAPI.recordAccept(r,'2026-11-03 11:00',{level:r.level}));}
  assert.ok(local.window.testAPI.persist(refreshed));
  const afterAccept=boot();for(const r of afterAccept.filter(r=>Number(r.id)>=31021)){assert.equal(r.status,'客服已接单');assert.equal(r.acceptedAt,'2026-11-03 11:00');assert.equal(r.follows.filter(f=>f.kind==='accept').length,1)}
  assert.equal(afterAccept.filter(r=>Number(r.id)>=31021).length,3);
});
test('communication survives refresh and failed saves leave the persisted record unchanged',()=>{
  const next=copy(a.records),r=next[0];r.status='客服已接单';r.follows=[];r.customerSolution=null;
  a.recordFollow(r,{note:'联系不上，下午重试',files:[],followResult:'ongoing',unresolvedReason:'申请退款',nextFollowAt:'2026-11-03T15:00'},'2026-11-03 10:00');
  const raw=JSON.stringify(next);let writes=0;
  const local={...context,window:{PCModules:{},addEventListener(){}},localStorage:{getItem:k=>k==='weid.pc.complaints.v1'?raw:null,setItem(){writes++;throw Error('QuotaExceededError')}}};
  loadOptions(local);vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-workflow/index.js'),'utf8'),local);vm.runInNewContext(processCode,local);vm.runInNewContext(followCode,local);vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),local);
  const api=local.window.testAPI;assert.equal(writes,0);assert.equal(api.followTools().current(api.records[0]).communication.reason,'申请退款');
  const changed=copy(api.records);api.recordFollow(changed[0],{note:'再次沟通',files:[],followResult:'ongoing',unresolvedReason:'解释说明'},'2026-11-03 11:00');
  assert.equal(api.persist(changed),false);assert.equal(api.followTools().current(api.records[0]).communication.reason,'申请退款');
});
test('handling context shows customer identity without repeating complaint content or attachments',()=>{
  const r=a.records.find(r=>r.id==='31020'),before=JSON.stringify(r),compact=a.summary(r,false,true),detail=a.summary(r);
  for(const value of [r.name,r.phone,r.member,r.id,'查看完整号码'])assert.ok(compact.includes(value));
  assert.ok(!compact.includes(r.content));assert.ok(!compact.includes('aria-label="投诉附件"'));assert.ok(!compact.includes('aria-label="发起信息"'));
  assert.ok(detail.includes(r.content));assert.equal(JSON.stringify(r),before);
});
test('one communication operation is selected and returning to the active form restores the radio choice',()=>{
  const helper=a.followTools(),options=Object.keys(helper.OPERATIONS);
  assert.deepEqual([...options],['follow','compensation']);
  for(const kind of options){const html=helper.operationChoice(kind);assert.equal((html.match(/type="radio"/g)||[]).length,2);assert.ok(html.includes('客服跟进中'));assert.ok(html.includes('已确认解决方案'));assert.ok(!html.includes('责任认定'));assert.equal((html.match(/ checked/g)||[]).length,1);assert.ok(html.includes(`value="${kind}" checked`));assert.ok(!html.includes('role="tab"'))}
  const inputs=options.map(value=>({value,checked:value==='compensation'})),synced=[],previous=context.PCUI.syncControl;
  context.PCUI.syncControl=input=>synced.push(input.value);
  try{helper.resetOperation({kind:'follow',layer:{el:{querySelectorAll:()=>inputs}}});assert.equal(inputs.filter(input=>input.checked).length,1);assert.ok(inputs[0].checked);assert.deepEqual(synced,options)}finally{context.PCUI.syncControl=previous}
});
test('customer-service follow-up has two outcomes and only disagreement requires a configured reason',()=>{
  const helper=a.followTools(),r={...copy(record),status:'客服处理中',follows:[]};
  assert.deepEqual(Object.values(helper.RESULTS),['客户已同意解决方案','未达成一致']);
  const ongoing=helper.form(r,helper.draft(r)),agreed=helper.form(r,{...helper.draft(r),followResult:'agreed'});
  assert.ok(!ongoing.includes('value="note"'));assert.ok(!ongoing.includes('value="unreachable"'));
  assert.ok(!ongoing.includes('data-field="unresolvedReason" hidden'));assert.ok(agreed.includes('data-field="unresolvedReason" hidden'));
  assert.ok(helper.validate(r,{files:[],followResult:'ongoing',unresolvedReason:''}).some(([name])=>name==='unresolvedReason'));
  assert.equal(helper.validate(r,{files:[],followResult:'agreed',unresolvedReason:'removed'}).length,0);
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
    assert.ok(helper.edit(r,legacy.id,legacyDraft,'2026-11-03 12:00'));assert.equal(legacy.communication.reason,'amount');assert.equal(legacy.communication.reasonSource,undefined);
  }finally{Object.defineProperty(dict,'current',descriptor);dict.options=options}
});
test('failed storage writes retain records and the real cause; a concurrent update cannot be overwritten',()=>{
  const saved=storage.get('weid.pc.complaints.v1'),original=JSON.stringify(a.records),messages=[];
  const write=context.localStorage.setItem,notify=context.ElementPlus.ElMessage;
  context.ElementPlus.ElMessage=message=>messages.push(message.message);
  try{
    context.localStorage.setItem=()=>{throw Error('QuotaExceededError')};assert.equal(a.persist(copy(a.records)),false);
    assert.equal(JSON.stringify(a.records),original);assert.equal(storage.get('weid.pc.complaints.v1'),saved);assert.ok(messages.at(-1).includes('QuotaExceededError'));
    context.localStorage.setItem=write;storage.set('weid.pc.complaints.v1','external-update');
    assert.equal(a.persist(copy(a.records)),false);assert.equal(storage.get('weid.pc.complaints.v1'),'external-update');assert.ok(messages.at(-1).includes('其他页面更新'));
  }finally{context.localStorage.setItem=write;context.ElementPlus.ElMessage=notify;storage.set('weid.pc.complaints.v1',saved)}
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
    assert.equal(entry.beforeStatus,entry.status);assert.ok(helper.history(r).includes('4级 · 监管局 → 2级'));assert.equal(helper.editable(entry),false);
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
  e.draft.note='继续协商退款';e.draft.unresolvedReason='申请退款';const follow=JSON.stringify(e.draft);
  helper.switchOperation(e,'compensation',r);assert.equal(JSON.stringify(e.draft),refund);
  e.baseline=JSON.stringify(e.draft);assert.equal(helper.operationDirty(e),true);
  helper.switchOperation(e,'follow',r);assert.equal(JSON.stringify(e.draft),follow);
  e.baseline=JSON.stringify(e.draft);assert.equal(helper.operationDirty(e),false);
});
console.log(`${count} business checks passed.`);
