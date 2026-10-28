/* Inventory assurance documents keep physical findings separate from their review. */
(() => {
 const S=PCModules['supply-chain'],{get,must,copy,uid,round}=S;
 const record=(prefix,r)=>({id:uid(prefix),...copy(r),createdBy:S.actor().id,time:S.stamp()});
 function countPlan(m){return S.transaction('盘点计划下发',d=>{
  S.requirePermission('盘点',m.store,d);must(m.name?.trim()&&m.person&&m.date&&m.batches?.length,'请选择盘点机构、范围、盘点人及日期');must(get('staff',m.person,d)?.status==='启用','盘点人不可用');
  const p=record('COUNT-PLAN',{...m,status:'执行中',tasks:[]});
  for(const id of new Set(m.batches)){const b=get('batches',id,d),k=get('skus',b?.sku,d);must(b?.store===m.store,'盘点批次必须属于本机构');must(!d.counts.some(c=>c.batch===id&&['待盘点','待审核'].includes(c.status)),'范围内有未完成的盘点任务');const c=record('COUNT',{plan:p.id,name:m.name,kind:m.kind,batch:id,store:b.store,person:m.person,date:m.date,book:b.quantity,cutoff:S.stamp(),movementIds:d.movements.filter(x=>x.batch===id).map(x=>x.id),unit:k.unit,stockUnit:k.stockUnit,stockFactor:S.unitFactor(k.id,k.stockUnit,d),status:'待盘点'});d.counts.unshift(c);p.tasks.push(c.id)}
  d.countPlans.unshift(p);return p;
 })}
 const register=S.registerCount;
 S.registerCount=(id,r)=>{const c=get('counts',id);S.requirePermission('盘点',c?.store);must(S.actor().id===c.person,'请由任务指定盘点人登记');const result=register(id,r);return result};
 const approve=S.approveCount;
 S.approveCount=(id,r={})=>{const c=get('counts',id);const a=S.differentReviewer(c?.person,'盘点',c?.store);must(r.note?.trim(),'请填写盘点复核意见');return approve(id,{...r,reviewer:a.id})};
 function opening(m){return S.transaction('期初库存 / 发现实物建账',d=>{
  S.requirePermission('盘点',m.store,d);must(m.reason?.trim()&&m.batch&&m.produced&&m.expiry&&m.expiry>m.produced,'请记录批次效期及来源依据');const k=get('skus',m.sku,d);must(k&&k.status==='启用','物料不可用');S.zoneAccepts(m.warehouse,k.id,m.store,d);const conversion=S.unitSnapshot(k.id,m.quantity,m.unit,d);must(Number.isFinite(m.cost)&&m.cost>=0,'基本单位成本无效');if(k.udiRequired)must(m.udi?.trim(),'请登记追溯码');if(k.traceLevel==='单支')must(conversion.baseQuantity===S.unitFactor(k.id,k.containerUnit,d),'单支追溯物料须逐支建账');
  const r=record('OPENING',{...m,conversion,status:'待复核'});d.openingStocks.unshift(r);return r;
 })}
 function approveOpening(id,m){return S.transaction('期初盘盈实物复核',d=>{
  const r=get('openingStocks',id,d);must(r?.status==='待复核','建账申请已处理');const a=S.differentReviewer(r.createdBy,'盘点',r.store,d);must(m.note?.trim(),'请填写复核依据');
  if(m.result==='驳回'){r.status='已驳回';r.reviewNote=m.note;return r}
  const k=get('skus',r.sku,d);S.zoneAccepts(r.warehouse,k.id,r.store,d);if(r.udi)must(!d.udi.some(u=>u.code===r.udi),'追溯码已入账');
  const b={...copy(r),id:uid('LOT'),quantity:0,reserved:0,physicalWarehouse:r.warehouse,quality:'待确认',source:r.id,containerCode:k.traceLevel==='单支'?r.udi:'',traceRoot:''};b.traceRoot=b.id;d.batches.push(b);S.movement(d,b,r.conversion.baseQuantity,r.kind==='期初建账'?'期初建账':'发现实物盘盈',r.id);if(r.udi)d.udi.push({id:uid('UDI'),sku:r.sku,batch:b.id,code:r.udi,status:'在库'});r.status='已建账待质检';r.stockBatch=b.id;r.reviewer=a.id;r.reviewNote=m.note;return r;
 })}
 function receiptInvoice(id,m){return S.transaction('采购验收票据核对',d=>{const r=get('purchaseReceipts',id,d);S.requirePermission('财务',r?.store,d);must(r&&m.invoiceNo?.trim()&&Number.isFinite(m.invoiceAmount)&&m.invoiceAmount>=0&&m.note?.trim(),'请填写发票及核对依据');r.invoiceHistory||=[];r.invoiceHistory.push({invoiceNo:r.invoiceNo,invoiceAmount:r.invoiceAmount,match:r.match,time:S.stamp()});Object.assign(r,m);r.match=m.invoiceAmount===r.amount?'三单一致':'金额待核对';r.invoiceReviewer=S.actor(d).id;return r})}
 function saleReturn(m){return S.transaction('销售退货入库',d=>{
  const source=get('retail',m.source,d);S.requirePermission('财务',source?.store,d);must(source?.kind==='销售出库'&&m.reason?.trim(),'请选择原销售出库单并登记退货依据');const quantity=S.convertUnits(source.sku,Number(m.quantity),m.unit,d),already=d.retail.filter(x=>x.source===source.id&&x.kind==='销售退货').reduce((n,x)=>n+x.quantity,0);must(already+quantity<=source.quantity,'超过原单可退数量');let skip=already,left=quantity;const allocations=[];
  for(const a of source.allocations){let available=a.quantity;const n=Math.min(skip,available);skip-=n;available-=n;const q=Math.min(left,available);if(!q)continue;const old=get('batches',a.batch,d);const b={...copy(old),id:uid('RETLOT'),quantity:0,reserved:0,quality:'待确认',hold:'',assignedTreatment:'',source:source.id};d.batches.push(b);S.movement(d,b,q,'销售退货',source.id);allocations.push({batch:b.id,sku:b.sku,quantity:q,cost:b.cost});left=round(left-q);if(!left)break}
  const perBase=source.amount/source.quantity,r=record('RETURN',{...m,quantity,businessQuantity:m.quantity,businessUnit:m.unit,kind:'销售退货',sku:source.sku,store:source.store,customer:source.customer,customerId:source.customerId,amount:round(perBase*quantity),cost:round(allocations.reduce((n,a)=>n+a.cost*a.quantity,0)),allocations,refundStatus:'待原系统退款核对',status:'待质量确认'});d.retail.unshift(r);return r;
 })}
 function refundConfirm(id,m){return S.transaction('销售退货退款核对',d=>{const r=get('retail',id,d);S.requirePermission('财务',r?.store,d);must(r?.refundStatus==='待原系统退款核对'&&m.voucher?.trim(),'请选择未核对退货并填写原系统退款凭据');r.refundStatus='已人工核对';r.refund={...m,actor:S.actor(d).id,time:S.stamp()};return r})}
 function recallTasks(id){return S.transaction('召回任务展开',d=>{
  const r=get('recalls',id,d);S.requirePermission('质量',null,d);must(r?.status==='执行中','请先执行召回锁定');const source=get('batches',r.batch,d),same=b=>b&&b.sku===source.sku&&b.batch===source.batch;const tasks=[];
  d.batches.filter(b=>same(b)&&b.quantity>0).forEach(b=>tasks.push({key:'stock-'+b.id,type:'库存处置',source:b.id,store:b.store,subject:(b.containerCode||b.batch)+' / '+b.quantity+' '+get('skus',b.sku,d).unit}));
  d.transfers.filter(t=>same(get('batches',t.batch,d))&&['在途','部分收货','差异待处理','退回在途'].includes(t.status)).forEach(t=>tasks.push({key:'transit-'+t.id,type:'在途拦截',source:t.id,store:t.to,subject:t.id}));
  S.traceUses(r.batch,d).forEach(c=>tasks.push({key:'use-'+c.id,type:'患者 / 收货方跟进',source:c.id,store:c.store,subject:(c.customerId||c.customer||get('consumptions',c.source,d)?.customer||'待核对接收方')+' / '+c.id}));
  for(const task of tasks)if(!d.qualityTasks.some(t=>t.recall===id&&t.key===task.key))d.qualityTasks.push(record('Q-TASK',{...task,recall:id,owner:r.person,status:'待处理'}));r.tasksExpandedAt=S.stamp();return r;
 })}
 function resolveTask(id,m){return S.transaction('质量跟进处理',d=>{const t=get('qualityTasks',id,d);S.requirePermission('质量',t?.store,d);must(t&&m.result?.trim()&&m.evidence?.trim(),'请填写处置结果及联系 / 实物处理凭据');if(t.type==='库存处置')must(get('batches',t.source,d)?.quantity===0,'该批实物尚未完成退货或报损');if(t.type==='在途拦截')must(!(get('transfers',t.source,d)?.transitRemaining??get('transfers',t.source,d)?.quantity),'仍有未处理在途库存');Object.assign(t,m,{status:'已完成',closedBy:S.actor(d).id,closedAt:S.stamp()});return t})}
 function completeRecall(id){return S.transaction('召回处置完成',d=>{const r=get('recalls',id,d),source=get('batches',r.batch,d);S.requirePermission('质量',null,d);must(r.tasksExpandedAt,'请先展开召回任务并逐项处理');must(!d.batches.some(b=>b.sku===source.sku&&b.batch===source.batch&&b.quantity>0),'召回实物尚未清零');must(d.qualityTasks.filter(t=>t.recall===id).every(t=>t.status==='已完成'),'尚有在途拦截或患者跟进任务未完成');r.status='已完成';r.completedAt=S.stamp();return r})}
 function alertTask(m){return S.transaction('预警处理任务',d=>{S.requirePermission('库存查询',m.store,d);must(m.owner&&get('staff',m.owner,d)?.status==='启用'&&m.due&&m.note?.trim(),'请填写责任人、处理期限及措施');let r=d.alertTasks.find(t=>t.alert===m.alert&&t.status!=='已完成');if(r)Object.assign(r,m);else{r=record('ALERT-TASK',{...m,status:'处理中'});d.alertTasks.push(r)}return r})}
 function closeAlertTask(id,m){return S.transaction('预警处理结果',d=>{const r=get('alertTasks',id,d);S.requirePermission('库存查询',r?.store,d);must(r&&m.result?.trim(),'请填写处理结果');r.result=m.result;r.status='已完成';r.closedAt=S.stamp();r.closedBy=S.actor(d).id;return r})}
 function returnableVials(source,d=S.data){const c=get('consumptions',source,d);if(!c)return [];const recorded=new Set(d.emptyVials.filter(r=>r.status!=='已驳回').flatMap(r=>r.containers||[]));const lots=(c.allocations||[]).map(a=>get('batches',a.batch,d)).filter(b=>b&&get('skus',b.sku,d)?.controlled&&b.quantity===0);const legacy=d.emptyVials.filter(r=>r.source===source&&!r.containers&&r.status!=='已驳回').reduce((n,r)=>n+r.quantity,0);return [...new Map(lots.map(b=>[b.containerCode||b.id,b])).values()].filter(b=>!recorded.has(b.containerCode||b.id)).slice(legacy)}
 function controlledReview(type,id,m){return S.transaction('管制登记独立复核',d=>{must(['controlledLogs','emptyVials'].includes(type),'登记类型无效');const r=get(type,id,d);must(r?.status==='待复核','登记已复核');const a=S.differentReviewer(r.createdBy,'临床复核',r.store,d);must(a.id===r.requestedReviewer,'须由指定复核人员确认');must(m.note?.trim(),'请填写实物清点 / 空瓶核对意见');r.status='已复核';r.reviewer=a.id;r.reviewedAt=S.stamp();r.reviewNote=m.note;return r})}
 Object.assign(S,{returnableVials,controlledReview,countPlan,opening,approveOpening,receiptInvoice,saleReturn,refundConfirm,recallTasks,resolveTask,completeRecall,alertTask,closeAlertTask});
})();
