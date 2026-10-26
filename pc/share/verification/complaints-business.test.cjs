// Isolated business regression checks. No browser globals/data are modified.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname, '../pages/complaints/business.js'), 'utf8');
const storage = new Map();
const context = {URL, Date, Intl, console, btoa:s=>Buffer.from(s,'binary').toString('base64'),
  localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  document:{addEventListener(){},getElementById(){return null}},
  PCUI:{registerPager(){}},ElementPlus:{ElMessage(){}},window:{PCModules:{},addEventListener(){}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-solutions/index.js'),'utf8'),context);
const hook = `window.testAPI={toCents,orderDateRange,filtered,matchingOrders,handlingMissing,validateCustomerSolution,solutionDraft,solutionTotals,solutionOrders,refundEntries,refundAvailable,solutionTools,solutionRead,recordStartProcessing,recordRecognition,recordCompensation,recordFollow,recordClosure,hasHandlingScheme,canClose,responsibleOptions,complaintCSV,validHandlingFile,records,orders,select(id){main={record:records.find(r=>r.id===id)};return main.record;}};`;
vm.runInNewContext(code.replace('  window.PCComplaints={mount,leave};',hook+'\n  window.PCComplaints={mount,leave};'),context);
const a=context.window.testAPI;
let count=0;
const test=(name,run)=>{run();count++;console.log('PASS '+name)};
const copy=o=>JSON.parse(JSON.stringify(o));
test('seed contains all three channels and 18 complaints / 22 orders',()=>{assert.equal(a.records.length,18);assert.equal(a.orders.length,22);assert.deepEqual([...new Set(a.records.map(r=>r.channel))].sort(),['mini','staff','wechat'])});
test('PC writes only its own storage key',()=>assert.deepEqual([...storage.keys()],['weid.pc.complaints.v1']));
test('money precision, invalid decimals, negatives and overflow',()=>{assert.equal(a.toCents('12.34'),1234);assert.equal(a.toCents('0.01'),1);for(const v of ['1.001','-1','1e3','Infinity','9007199254740992'])assert.equal(a.toCents(v),null)});
test('date shortcuts handle leap year and week boundary',()=>{assert.deepEqual(copy(a.orderDateRange('lastMonth','2024-03-01')),{start:'2024-02-01',end:'2024-02-29'});assert.deepEqual(copy(a.orderDateRange('week','2026-10-22')),{start:'2026-10-19',end:'2026-10-25'})});
test('keyword, channel, status, date and linked filters compose',()=>{assert.equal(a.filtered({keyword:'3858',keywordType:'phone'}).length,1);assert.equal(a.filtered({keyword:'3858',keywordType:'phone',channel:'wechat'}).length,0);assert.ok(a.filtered({channel:'wechat',status:'待处理',linked:'yes'}).every(r=>r.channel==='wechat'&&r.status==='待处理'&&r.linked.length));assert.equal(a.filtered({start:'2099-01-01'}).length,0)});
test('order search independent keyword/consultant/date criteria',()=>{assert.equal(a.matchingOrders({keywordType:'phone',keyword:'3858'}).length,2);assert.equal(a.matchingOrders({keywordType:'name',keyword:'王秀珍',consultant:'不存在'}).length,0)});
const record=a.select('31001');const p=a.solutionDraft(null);
p.methods=['refund','compensation','exchange'];
p.refundOrderIds=a.solutionOrders().map(order=>order.id);
for(const row of a.refundEntries())a.solutionTools().selectFullRefund(p,row);
p.compensation='100';p.compensationReason='验收';p.exchangeItems=[{productId:'repair-cream',quantity:'2'}];p.delivery={name:'验收',phone:'13800000000',address:'验收地址'};p.payout={method:'bank',name:'验收',account:'6222000000000000',bank:'验收银行'};
const valid=a.validateCustomerSolution(p);
test('multi-order refunds and combined solutions use integer cents',()=>{assert.equal(valid.errors.length,0);assert.equal(valid.value.refund,609900);assert.equal(valid.value.refundOrders.length,2);assert.equal(valid.value.compensation,10000);assert.equal(a.solutionTotals(p).exchange,36000);assert.equal(a.solutionTotals(p).refund+a.solutionTotals(p).compensation,619900)});
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
test('hidden method fields do not affect the submitted solution',()=>{const hidden=copy(p);hidden.methods=['exchange'];assert.equal(a.validateCustomerSolution(hidden).errors.length,0);assert.equal(a.validateCustomerSolution(hidden).value.refund,0);assert.equal(a.validateCustomerSolution(hidden).value.compensation,0)});
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
test('level 4 requires risk type, other levels do not',()=>{const d={department:['门店'],type:'门店服务',responsible:['林晓'],level:'4级',level4Type:'',handlingPlan:'unresolved'};assert.ok(a.handlingMissing(d).some(e=>e[0]==='level4Type'));d.level='2级';assert.equal(a.handlingMissing(d).length,0)});
const draft={department:['门店'],type:'门店服务',responsible:['林晓'],level:'2级',level4Type:'',reason:'验收',firstContact:'验收',contactTime:'2026-10-22T14:30',complaintStore:'河源源城店',customerStatement:'验收',handlingPlan:'unresolved',handlingFiles:[],customerSolution:valid.value};
test('compensation saves independently in every status without altering handling or closure',()=>{
  for(const status of ['待处理','处理中','已完成']){
    const r=copy(a.records.find(item=>item.status===status)),before=copy(r);
    const entry=a.recordCompensation(r,valid.value,'2026-10-26 14:00');
    assert.equal(entry.kind,'compensation');assert.equal(entry.beforeStatus,status);assert.equal(entry.status,status);
    assert.deepEqual(copy(r.customerSolution),copy(valid.value));
    for(const key of ['status','handlingPlan','department','responsible','handlingFiles','assessedAt','assessedBy','closedAt','closedBy'])assert.deepEqual(r[key],before[key]);
    assert.equal(a.hasHandlingScheme(r),a.hasHandlingScheme(before));assert.equal(a.canClose(r),a.canClose(before));
    const saved=JSON.stringify(r);assert.equal(a.recordCompensation(r,valid.value,'2026-10-26 14:01'),null);assert.equal(JSON.stringify(r),saved);
  }
});
test('compensation before handling neither starts the complaint nor grants closure',()=>{
  const entry=a.recordCompensation(record,valid.value,'2026-10-22 14:28');assert.ok(entry);
  assert.equal(record.status,'待处理');assert.equal(a.hasHandlingScheme(record),false);
  const r=copy(record);a.recordStartProcessing(r,'2026-10-22 14:29');assert.equal(a.canClose(r),false);
});
test('pending cannot skip confirmation to save a scheme or follow up',()=>{assert.equal(a.recordRecognition(copy(record),draft,'2026-10-22 14:29'),null);assert.equal(a.recordFollow(copy(record),{note:'x',files:[]},'2026-10-22 14:29'),null)});
test('starting changes status without creating a scheme and cannot be repeated',()=>{const result=a.recordStartProcessing(record,'2026-10-22 14:29');assert.equal(result.kind,'start');assert.equal(record.status,'处理中');assert.equal(record.assessedAt,undefined);assert.equal(record.handlingPlan,'');assert.equal(a.recordStartProcessing(record,'2026-10-22 14:30'),null)});
test('started and followed complaints cannot close before a saved handling scheme',()=>{const r=copy(record),original=JSON.stringify(r);assert.equal(a.canClose(r),false);assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);assert.equal(JSON.stringify(r),original);assert.ok(a.recordFollow(r,{note:'follow',files:[]},'2026-10-22 14:29'));assert.equal(a.recordClosure(r,'2026-10-22 14:29'),null);r.handlingPlan='unresolved';assert.equal(a.canClose(r),false)});
test('first scheme retains independently saved compensation and ignores solution fields from handling',()=>{const result=a.recordRecognition(record,{...draft,customerSolution:null},'2026-10-22 14:30');assert.ok(result);assert.equal(result.action,'责任认定');assert.equal(record.status,'处理中');assert.equal(record.follows[0].customerSolution.refundOrders.length,2)});
test('closure eligibility accepts saved and historical schemes but not pending or completed',()=>{assert.equal(a.canClose(record),true);const legacy=copy(record);delete legacy.assessedAt;assert.equal(a.canClose(legacy),true);assert.equal(a.canClose({...legacy,status:'待处理'}),false);assert.equal(a.canClose({...legacy,status:'已完成'}),false);assert.equal(a.canClose({...legacy,handlingPlan:''}),false)});
test('editing own refund does not reserve money or quantity twice',()=>{assert.equal(a.refundAvailable(a.refundEntries()[0].order,a.refundEntries()[0].item),550000);assert.equal(a.solutionTools().refundQuantityState(a.refundEntries()[0].order,a.refundEntries()[0].item).available,3);assert.equal(a.validateCustomerSolution(a.solutionDraft(record.customerSolution)).errors.length,0)});
test('other complaints reserve order and project refund amounts',()=>{const another=a.records.find(r=>r.id!=='31001');const previous=another.customerSolution;another.customerSolution=copy(valid.value);assert.equal(a.refundAvailable(a.refundEntries()[0].order,a.refundEntries()[0].item),0);assert.ok(a.validateCustomerSolution(p).errors.length);another.customerSolution=previous});
test('legacy single-order refund records still load',()=>{const group=valid.value.refundOrders[0];const old={handlingMethods:['refund'],refundOrderId:group.orderId,refund:group.refund,refundItems:group.refundItems};assert.equal(Object.keys(a.solutionDraft(old).refundAmounts).length,2)});
test('follow and closure preserve status boundaries',()=>{assert.ok(a.recordFollow(record,{note:'  回访  ',files:[]},'2026-10-22 14:31'));assert.equal(record.follows[0].note,'回访');assert.ok(a.recordClosure(record,'2026-10-22 14:32'));assert.equal(record.status,'已完成');const solution=JSON.stringify(record.customerSolution),closedAt=record.closedAt;assert.ok(a.recordFollow(record,{note:'结案后回访',files:[]},'2026-10-22 14:33'));assert.equal(record.status,'已完成');assert.equal(record.closedAt,closedAt);assert.equal(JSON.stringify(record.customerSolution),solution);assert.equal(record.follows[0].beforeStatus,'已完成');assert.equal(record.follows[0].status,'已完成');assert.equal(a.recordRecognition(record,draft,'2026-10-22 14:33'),null)});
test('closed-store type skips responsibility and clears stale assignments only on saving',()=>{const d={...draft,type:'闭店',responsible:[]};assert.equal(a.handlingMissing(d).length,0);assert.ok(a.handlingMissing({...d,type:'门店服务'}).some(e=>e[0]==='responsible'));const r={...copy(record),status:'处理中'};assert.ok(a.recordRecognition(r,{...d,responsible:['旧责任人']},'2026-10-22 15:00'));assert.deepEqual(copy(r.responsible),[])});
test('responsibility options include departed staff, historical snapshots and selected missing names',()=>{const options=a.responsibleOptions(['当前显示但不在册'],[{name:'离职责任人',employmentStatus:'离职'}],[{responsible:['历史责任人'],follows:[{responsible:['跟进责任人'],before:{responsible:['调整前责任人']}}]}],[{consultant:'订单顾问',projects:[{operator:'操作老师'}]}]);const map=new Map(options);for(const n of ['当前显示但不在册','历史责任人','跟进责任人','调整前责任人','订单顾问','操作老师'])assert.equal(map.get(n),n);assert.equal(map.get('离职责任人'),'离职责任人（离职）');assert.equal(a.responsibleOptions().find(([name])=>name==='张宁')[1],'张宁（离职）')});
test('handling attachment formats retain MIME verification',()=>{for(const f of [{name:'x.png',type:'image/png'},{name:'x.pdf',type:'application/pdf'},{name:'x.amr',type:''},{name:'x.m4a',type:'audio/x-m4a'}])assert.ok(a.validHandlingFile(f));for(const f of [{name:'x.exe',type:''},{name:'x.png',type:'application/pdf'},{name:'x.html',type:'text/html'}])assert.equal(a.validHandlingFile(f),false)});
test('CSV preserves filtered rows, Chinese BOM, quotes and formula protection',()=>{const csv=a.complaintCSV([{...copy(record),name:'=1+1',content:'包含,逗号和\"引号\"'}]);assert.equal(csv[0],'\uFEFF');assert.equal(csv.split('\r\n').length,2);assert.ok(csv.includes("\"'=1+1\""));assert.ok(csv.includes('\"包含,逗号和\"\"引号\"\"\"'));assert.ok(csv.includes('\"已完成\"'))});
console.log(`${count} business checks passed.`);
