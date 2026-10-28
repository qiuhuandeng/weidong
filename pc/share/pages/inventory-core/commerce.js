/* Receipt, transfer and settlement documents retain their business-unit snapshots. */
(() => {
  const S=PCModules['supply-chain'],{get,must,positive,round,copy,uid}=S;
  const rec=(prefix,r,d)=>({id:uid(prefix),...copy(r),createdBy:S.actor(d).id,time:S.stamp()});
  const purchaseLines=p=>p.lines||[{id:p.id+'-1',sku:p.sku,quantity:p.quantity,unit:p.unit,price:p.price,amount:p.amount,conversion:p.conversion,received:p.receivedQuantity??(p.status==='已入库'?p.quantity:0)}];
  function supplierAllowed(supplier,sku,d=S.data){
    const s=get('suppliers',supplier,d),k=get('skus',sku,d);must(s&&s.status==='启用','供应商不可用');must(k&&k.status==='启用','采购物料已停用');
    const credential=k.regulation==='药品'?'药品经营许可证':k.regulation==='械字号'?'医疗器械经营许可证':'营业执照';
    must(d.credentials.some(c=>c.supplier===supplier&&c.name===credential&&c.status==='有效'&&c.expiry>=S.today()),s.name+'缺少有效的'+credential);
    must(d.firstReviews.some(r=>r.supplier===supplier&&r.kind==='首营企业'&&r.status==='已通过'),'供应商首营企业审核未通过');
    must(d.firstReviews.some(r=>r.supplier===supplier&&r.kind==='首营品种'&&r.sku===sku&&r.status==='已通过'),k.name+'尚未完成该供应商的首营品种审核');
  }
  function savePurchase(m){return S.transaction('采购订单提交',d=>{
    S.requirePermission('采购',m.store,d);must(get('stores',m.store,d)?.status==='启用','收货机构不可用');must(m.lines?.length,'至少添加一项采购物料');
    const previous=get('purchases',m.id,d);if(previous){must(['待审批','已驳回'].includes(previous.status),'审核后请通过关闭剩余量或采购变更处理');must(previous.status==='已驳回'||!previous.approvalRun?.history.length,'已经进入逐级审核，请先驳回后修改重提')}
    const lines=m.lines.map((l,i)=>{supplierAllowed(m.supplier,l.sku,d);const conversion=S.unitSnapshot(l.sku,Number(l.quantity),l.unit,d);must(Number.isFinite(l.price)&&l.price>=0,'采购单价无效');return {...copy(l),id:l.id||'LINE-'+i,quantity:Number(l.quantity),price:Number(l.price),conversion,amount:round(l.quantity*l.price),received:0}});
    const r={...rec('PO',m,d),id:previous?.id||uid('PO'),lines,sku:lines[0].sku,quantity:lines.reduce((n,l)=>n+l.quantity,0),unit:lines.length===1?lines[0].unit:'多明细',price:lines[0].price,amount:round(lines.reduce((n,l)=>n+l.amount,0)),receivedAmount:0,status:'待审批'};
    delete r.approvalRun;if(m.application){const a=get('applications',m.application,d);must(a?.status==='已通过'&&!a.purchase,'采购申请已转单或未通过审核');a.purchase=r.id;a.status='已转采购'}
    if(previous)d.purchases[d.purchases.findIndex(x=>x.id===r.id)]=r;else d.purchases.unshift(r);return r;
  })}
  function approvePurchase(id,approved,note){return S.transaction('采购订单审核',d=>{
    const p=get('purchases',id,d);must(p?.status==='待审批','订单已处理');const a=S.differentReviewer(p.createdBy,'采购审批',p.store,d);must(note?.trim(),'请填写审核意见');
    if(approved)for(const l of purchaseLines(p))supplierAllowed(p.supplier,l.sku,d);
    p.status=approved?'待收货':'已驳回';p.approval={actor:a.id,note,time:S.stamp()};return p;
  })}
  function receivePurchase(id,m){return S.transaction('采购验收入库',d=>{
    const p=get('purchases',id,d);S.requirePermission('采购',p?.store,d);must(p&&['待收货','部分入库'].includes(p.status),'订单不在可收货状态');must(m.deliveryNo?.trim(),'请填写送货单号');must(!d.purchaseReceipts.some(r=>r.purchase===id&&r.deliveryNo===m.deliveryNo.trim()),'本采购单该送货凭据已验收，请勿重复入库');
    p.lines||=purchaseLines(p);const lines=m.lines||[{...m,line:p.lines[0].id,unit:p.lines[0].unit}],receipt=rec('RECEIPT',{purchase:id,store:p.store,supplier:p.supplier,deliveryNo:m.deliveryNo,invoiceNo:m.invoiceNo||'',invoiceAmount:m.invoiceAmount===''||m.invoiceAmount==null?null:Number(m.invoiceAmount),lines:[],status:'已验收'},d);
    must(lines.length,'至少登记一个到货批次');let amount=0;
    for(const row of lines){
      const l=p.lines.find(x=>x.id===row.line);must(l,'采购明细不存在');supplierAllowed(p.supplier,l.sku,d);
      const k=get('skus',l.sku,d),f=l.conversion?.factor||S.unitFactor(l.sku,l.unit,d),quantity=S.convertUnits(l.sku,Number(row.quantity),row.unit||l.unit,d,true),delivered=S.convertUnits(l.sku,Number(row.delivered??row.quantity),row.unit||l.unit,d,true);
      must(quantity<=delivered,'合格接收量不能大于送达量');must(quantity<=round((l.quantity-(l.received||0))*f),'累计入库量超过订单剩余量');
      if(delivered!==quantity)must(row.reason?.trim(),'请填写短少、拒收或差异原因');
      must(row.batch?.trim()&&row.produced&&row.expiry&&row.produced<=S.today()&&row.expiry>=S.today()&&row.expiry>row.produced,'请核对生产批号及日期');
      const zone=S.zoneAccepts(row.warehouse,k.id,p.store,d),codes=String(row.codes||row.unitCodes||'').split(/\s+/).filter(Boolean),capacity=S.unitFactor(k.id,k.containerUnit||k.stockUnit||k.unit,d);
      if(k.udiRequired)must(k.traceLevel==='单支'?codes.length:row.udi,'须登记相应追溯码');
      if(k.traceLevel==='单支'){must(Number.isInteger(quantity/capacity)&&codes.length===quantity/capacity&&new Set(codes).size===codes.length,'单支追溯码数量须与本次接收支数一致');must(codes.every(c=>!d.udi.some(u=>u.code===c)),'追溯码已入库')}
      if(k.cold)must(row.temperature!==''&&row.temperature!=null&&Number.isFinite(Number(row.temperature)),'冷链到货须登记交接温度');
      let quality=row.quality||'合格';if(k.cold&&(row.temperature<k.temperatureMin||row.temperature>k.temperatureMax))quality='待确认';
      const current={...copy(row),sku:k.id,unit:row.unit||l.unit,baseQuantity:quantity,baseDelivered:delivered,baseUnit:k.unit,cost:l.price/f,amount:round(quantity*l.price/f),batches:[],quality};amount+=current.amount;
      if(quantity>0)for(const code of k.traceLevel==='单支'?codes:['']){
        const b={id:uid('LOT'),sku:k.id,store:p.store,warehouse:zone.id,physicalWarehouse:zone.id,batch:row.batch,produced:row.produced,expiry:row.expiry,quantity:0,reserved:0,cost:l.price/f,supplier:p.supplier,quality,udi:code||row.udi||'',containerCode:code,source:p.id,purchase:p.id,purchaseLine:l.id,receipt:receipt.id,stockSnapshot:{unit:k.stockUnit,factor:S.unitFactor(k.id,k.stockUnit,d)}};
        b.traceRoot=b.id;d.batches.push(b);S.movement(d,b,k.traceLevel==='单支'?capacity:quantity,'采购入库',receipt.id);current.batches.push(b.id);
        if(b.udi)d.udi.push({id:uid('UDI'),sku:k.id,batch:b.id,code:b.udi,parentCode:row.boxCode||'',status:'在库'});
      }
      l.received=round((l.received||0)+quantity/f);receipt.lines.push(current);
    }
    receipt.amount=round(amount);receipt.match=receipt.invoiceAmount==null?'待到票':receipt.invoiceAmount===receipt.amount?'三单一致':'金额待核对';
    d.purchaseReceipts.unshift(receipt);p.receivedAmount=round((p.receivedAmount||0)+receipt.amount);p.receivedAt=S.stamp();p.status=p.lines.every(l=>l.received>=l.quantity)?'已入库':'部分入库';p.receiptIds||=[];p.receiptIds.push(receipt.id);return receipt;
  })}
  function closePurchase(id,note){return S.transaction('采购关闭剩余量',d=>{const p=get('purchases',id,d);S.requirePermission('采购审批',p?.store,d);must(p&&['待收货','部分入库'].includes(p.status),'当前订单不能关闭剩余量');must(note?.trim(),'请填写关闭原因');p.closedRemaining=purchaseLines(p).map(l=>({line:l.id,quantity:round(l.quantity-(l.received||0)),unit:l.unit}));p.status='已关闭';p.closeNote=note;p.closedAt=S.stamp();return p})}
  function purchaseOrigin(id,d=S.data){const b=get('batches',id,d);if(!b)return '';return b.purchase||(get('purchases',b.source,d)?b.source:'')||get('batches',b.traceRoot,d)?.purchase||get('batches',b.traceRoot,d)?.source||''}
  function confirmPurchaseReturn(id,m){return S.transaction('采购退货确认',d=>{
    const r=get('purchaseReturns',id,d),b=get('batches',r?.batch,d);must(r?.status==='待审批','退货已处理');const a=S.differentReviewer(r.createdBy,'采购审批',b?.store,d);
    must(m.note?.trim()&&m.voucher?.trim(),'请填写供应商退货确认号和处理意见');must(b&&!b.openedAt&&!b.assignedTreatment&&S.available(b)>=r.quantity,'仅可退回未开封、未占用实物');
    must(purchaseOrigin(b.id,d)===r.purchase,'批次与原采购来源不匹配');S.movement(d,b,-r.quantity,'采购退货',r.id);
    r.amount=round(r.quantity*b.cost);r.status='已退货';r.supplierConfirmation=m.voucher;r.note=m.note;r.reviewer=a.id;r.confirmedAt=S.stamp();return r;
  })}
  function saveReconciliation(m){return S.transaction('采购对账单确认',d=>{
    S.requirePermission('财务',null,d);must(m.orders?.length&&m.supplier&&m.start&&m.end&&m.start<=m.end,'请填写供应商、期间及采购单');must(m.statement?.trim(),'请填写供应商对账凭据');
    const at=(id,date)=>{const p=get('purchases',id,d),before=value=>(value||'9999').slice(0,10)<=date;const receipts=d.purchaseReceipts.filter(r=>r.purchase===id),received=receipts.length?receipts.filter(r=>before(r.time)).reduce((n,r)=>n+r.amount,0):before(p.receivedAt)?(p.receivedAmount??(p.status==='已入库'?p.amount:0)):0;const returns=d.purchaseReturns.filter(r=>r.purchase===id&&r.status==='已退货'&&before(r.confirmedAt||r.time)).reduce((n,r)=>n+(r.amount??r.quantity*(get('batches',r.batch,d)?.cost||0)),0),paid=(d.paymentEntries||[]).filter(r=>r.purchase===id&&before(r.date||r.time)).reduce((n,r)=>n+r.amount,0);return {received:round(received),returns:round(returns),paid:round(paid),balance:round(received-returns-paid)}};
    const previousDay=new Date(Date.parse(m.start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const lines=[...new Set(m.orders)].map(id=>{const p=get('purchases',id,d);must(p&&p.supplier===m.supplier,'对账采购单不属于该供应商');const opening=at(id,previousDay),closing=at(id,m.end);return {purchase:id,opening:opening.balance,...closing,receivedDuring:round(closing.received-opening.received),returnedDuring:round(closing.returns-opening.returns),paidDuring:round(closing.paid-opening.paid)}});
    const amount=round(lines.reduce((n,l)=>n+l.balance,0));must(Number.isFinite(m.supplierAmount),'请填写供应商确认金额');const difference=round(m.supplierAmount-amount);if(difference)must(m.reason?.trim(),'账款有差异，须登记处理原因');
    const r=rec('RECON',{...m,lines,amount,difference,status:difference?'差异待处理':'已对账'},d);d.purchaseReconciliations.unshift(r);return r;
  })}
  function recordPayment(id,m){return S.transaction('付款登记核销',d=>{
    const p=get('payments',id,d);S.requirePermission('财务',null,d);must(p?.status==='待付款','付款申请不可重复登记');must(m.voucher?.trim()&&m.paidAt,'请填写实际付款凭据及日期');const balance=S.purchaseBalance(p.purchase,d);must(p.amount<=balance.balance,'当前应付不足，请先核对退货或已有付款');p.status='已付款';p.payment={...copy(m),actor:S.actor(d).id};return p;
  })}
  function createTransfer(m){return S.transaction('调拨申请',d=>{
    const b=get('batches',m.batch,d);S.requirePermission('调拨',b?.store,d);must(b&&S.batchState(b,d)==='可用'&&!b.openedAt&&!b.assignedTreatment,'请选择未开封可用库存');must(m.to!==b.store&&get('stores',m.to,d)?.status==='启用','请选择其他有效接收机构');
    const conversion=S.unitSnapshot(b.sku,m.sendQuantity,m.sendUnit,d);must(conversion.baseQuantity<=S.available(b),'调拨数量超过可用库存');const r=rec('TRANSFER',{...m,sku:b.sku,from:b.store,quantity:conversion.baseQuantity,sendConversion:conversion,status:'待审批',mode:b.store==='WH'?'总仓 → 门店':m.to==='WH'?'门店 → 总仓':'门店间平级'},d);d.transfers.unshift(r);return r;
  })}
  function transferAction(id,action,m={}){return S.transaction('调拨 / '+action,d=>{
    const t=get('transfers',id,d),b=get('batches',t?.batch,d),k=get('skus',b?.sku,d);must(t&&b,'调拨单不存在');
    if(action==='approve'){S.differentReviewer(t.createdBy,'调拨审批',t.from,d);must(t.status==='待审批'&&S.batchState(b,d)==='可用'&&S.available(b)>=t.quantity,'调拨状态或可用库存已变化');b.reserved=round(b.reserved+t.quantity);t.reserved=t.quantity;t.status='待发货'}
    else if(action==='deny'){S.requirePermission('调拨审批',t.from,d);must(t.status==='待审批','状态已变化');t.status='已驳回';t.reviewNote=m.reason||''}
    else if(action==='ship'){S.requirePermission('调拨',t.from,d);must(t.status==='待发货'&&S.batchState(b,d)==='可用','当前批次不能发货');if(k.cold)must(m.temperature!==''&&m.temperature!=null&&Number.isFinite(Number(m.temperature))&&m.temperature>=k.temperatureMin&&m.temperature<=k.temperatureMax,'冷链发货须记录符合该商品温区的交接温度');if(!t.reserved){must(S.available(b)>=t.quantity,'库存不足');b.reserved+=t.quantity;t.reserved=t.quantity}must(b.reserved>=t.quantity,'预占库存异常');b.reserved=round(b.reserved-t.quantity);t.reserved=0;S.movement(d,b,-t.quantity,'调拨发货',t.id);t.status='在途';t.shipped=S.stamp();t.transitRemaining=t.quantity;t.transport={carrier:m.carrier||'',voucher:m.voucher||'',temperature:m.temperature??null}}
    else if(action==='receive'){
      S.requirePermission('调拨',t.to,d);must(['在途','部分收货'].includes(t.status),'该单不在收货阶段');const remaining=t.transitRemaining??t.quantity,unit=m.receiveUnit||k.stockUnit,received=S.convertUnits(k.id,Number(m.receiveQuantity),unit,d,true),damaged=S.convertUnits(k.id,Number(m.damaged||0),unit,d,true),missing=S.convertUnits(k.id,Number(m.missing||0),unit,d,true);
      must(received+damaged+missing>0&&received+damaged+missing<=remaining,'本次收货及差异量超出在途余额');if(damaged||missing)must(m.reason?.trim(),'请登记差异原因及责任处理');
      if(k.cold)must(m.temperature!==''&&m.temperature!=null&&Number.isFinite(Number(m.temperature)),'请登记冷链收货温度');const z=S.zoneAccepts(m.warehouse,k.id,t.to,d);
      for(const [q,quality]of [[received,'合格'],[damaged,'待确认']])if(q){
        const dest={...copy(b),id:uid('LOT'),store:t.to,warehouse:z.id,physicalWarehouse:z.id,quantity:0,reserved:0,source:t.id,quality,hold:'',transfer:t.id};
        if(S.daysLeft(dest)<0)dest.quality='待确认';if(k.cold&&(m.temperature<k.temperatureMin||m.temperature>k.temperatureMax))dest.quality='待确认';
        if(d.recalls.some(r=>r.status==='执行中'&&get('batches',r.batch,d)?.sku===dest.sku&&get('batches',r.batch,d)?.batch===dest.batch))dest.quality='召回锁定';d.batches.push(dest);S.movement(d,dest,q,'调拨收货',t.id);
      }
      t.receipts||=[];t.receipts.push({...copy(m),received,damaged,missing,time:S.stamp(),actor:S.actor(d).id});t.receivedQuantity=round((t.receivedQuantity||0)+received+damaged);t.receiveQuantity=round(t.receivedQuantity/S.unitFactor(k.id,unit,d));t.receiveUnit=unit;
      t.transitRemaining=round(remaining-received-damaged);t.pendingDifference=round((t.pendingDifference||0)+missing);
      t.status=t.pendingDifference?'差异待处理':t.transitRemaining?'部分收货':'已收货';if(!t.transitRemaining)t.received=S.stamp();
    }else if(action==='resolve'){
      const a=S.differentReviewer(t.createdBy,'调拨审批',t.from,d);must(t.status==='差异待处理'&&t.pendingDifference>0,'没有待处理短少');must(m.reason?.trim()&&m.responsible?.trim(),'请填写差异认定及责任方');
      const q=t.pendingDifference;t.differenceResolution={...copy(m),quantity:q,reviewer:a.id,time:S.stamp()};
      if(m.result==='确认运输损失'){t.transitRemaining=round(t.transitRemaining-q);d.losses.unshift(rec('LOSS',{batch:b.id,store:t.from,quantity:q,cost:round(q*b.cost),reason:'运输短少',subject:'存货损失',status:'已报损',source:t.id,inTransit:true},d));d.movements.unshift({id:uid('IO'),sku:b.sku,batch:b.id,batchNo:b.batch,store:t.from,quantity:-q,balance:null,unit:k.unit,cost:round(q*b.cost),kind:'在途损耗',source:t.id,time:S.stamp(),transit:true})}
      t.pendingDifference=0;t.status=t.transitRemaining?'部分收货':'已收货';if(!t.transitRemaining)t.received=S.stamp();
    }else if(action==='reject'){S.requirePermission('调拨',t.to,d);must(['在途','部分收货'].includes(t.status),'不可拒收');must(m.reason?.trim(),'请填写拒收原因');t.status='退回在途';t.rejectReason=m.reason}
    else if(action==='return'){S.requirePermission('调拨',t.from,d);must(t.status==='退回在途','该单不在退回阶段');const q=t.transitRemaining??t.quantity;const dest={...copy(b),id:uid('LOT'),quantity:0,reserved:0,source:t.id,quality:'待确认'};d.batches.push(dest);S.movement(d,dest,q,'调拨退回',t.id);t.transitRemaining=0;t.status='已退回';t.returned=S.stamp()}
    return t;
  })}
  function sellCard(m){return S.transaction('售卡预收',d=>{
    S.requirePermission('财务',m.store,d);const card=get('cards',m.card,d),patient=get('patients',m.customerId,d),store=get('stores',m.store,d);
    must(card&&card.status==='已上架'&&card.contents.length,'卡项尚未上架或未配置权益');must(patient&&patient.status==='启用','请关联患者 ID');must(store&&['全部门店',store.id,store.brand].includes(card.scope),'本机构不能售此卡');
    const total=card.contents.reduce((n,l)=>n+l.times*(get('specs',l.spec,d)?.price||0),0),times=card.contents.reduce((n,l)=>n+l.times,0);
    const cs=rec('CS',{...m,customer:patient.name,amount:card.price,remaining:copy(card.contents),initialTimes:times,recognized:0,refunded:0,sold:S.today(),expires:S.day(card.days),status:'有效',cardSnapshot:copy(card),unitValues:Object.fromEntries(card.contents.map(l=>[l.spec,card.allocation==='按次数平均'||!total?round(card.price/times):round(card.price*get('specs',l.spec,d).price/total)]))},d);d.cardSales.unshift(cs);return cs;
  })}
  function cardEvent(id,m){return S.transaction('卡权益 / '+m.kind,d=>{
    const cs=get('cardSales',id,d);S.requirePermission('财务',cs?.store,d);must(cs&&m.reason?.trim(),'请填写处理依据');must(!d.treatments.some(t=>!['已关闭','已取消'].includes(t.status)&&t.items.some(i=>i.cardSale===id))&&!d.consumptions.some(c=>c.cardSale===id&&['已预占','待偏差审批'].includes(c.status)),'该卡存在未完成治疗，请先处理治疗及预占');
    if(m.kind==='冻结'){must(cs.status==='有效','卡状态不支持冻结');cs.status='已冻结'}else if(m.kind==='解冻'){must(cs.status==='已冻结','该卡未冻结');cs.status='有效'}
    else if(m.kind==='延期'){must(m.expires>cs.expires,'新有效期须晚于原有效期');cs.expires=m.expires}
    else if(m.kind==='授权代用'){must(get('patients',m.patient,d)?.status==='启用'&&m.patient!==cs.customerId,'请选择有效的代用患者');cs.authorizedPatients||=[];if(!cs.authorizedPatients.includes(m.patient))cs.authorizedPatients.push(m.patient)}
    else if(m.kind==='退还剩余权益'){must(m.voucher?.trim(),'请填写原系统退款处理凭据');const refund=round(cs.amount-cs.recognized-(cs.refunded||0));must(refund>=0,'卡余额异常');m.amount=refund;cs.refunded=round((cs.refunded||0)+refund);cs.remaining.forEach(x=>x.times=0);cs.status='已退款'}
    else must(false,'权益处理类型无效');
    const e=rec('CARD-EVENT',{...m,cardSale:id,store:cs.store,status:'已登记'},d);d.cardEvents.unshift(e);return e;
  })}
  Object.assign(S,{purchaseLines,supplierAllowed,savePurchase,approvePurchase,purchaseReceive:receivePurchase,closePurchase,purchaseOrigin,confirmPurchaseReturn,saveReconciliation,recordPayment,createTransfer,transferAction,sellCard,cardEvent});
})();
