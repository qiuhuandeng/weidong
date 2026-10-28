/* Reviewed documents keep immutable approval and financial event histories. */
(() => {
 const S=PCModules['supply-chain'],{get,must,copy,uid,round}=S;
 const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const record=(prefix,m,d)=>({id:uid(prefix),...copy(m),createdBy:S.actor(d).id,time:S.stamp()});
 const reviewTypes={purchases:['采购','采购审批'],applications:['采购','采购审批'],firstReviews:['首营','采购审批'],purchaseReturns:['采购退货','采购审批'],transfers:['调拨','调拨审批'],losses:['报损','报损审批'],prices:['价格','主数据'],payments:['付款','财务'],adjustments:['消耗调整','临床复核'],cardEvents:['卡项退款','财务']};
 function reviewStore(type,r,d){return r.store||r.from||get('batches',r.batch,d)?.store||get('purchases',r.purchase,d)?.store||get('consumptions',r.source,d)?.store}
 function reviewAmount(type,r,d){return Math.abs(r.amount??(type==='prices'?r.price:['losses','transfers','purchaseReturns'].includes(type)?r.quantity*(get('batches',r.batch,d)?.cost||0):0))}
 function approvalSnapshot(type,r,d){
  const [kind,permission]=reviewTypes[type],amount=reviewAmount(type,r,d),flows=d.approvals.filter(a=>a.status==='启用'&&a.kind===kind&&a.nodes?.length&&amount>=a.threshold).sort((a,b)=>b.threshold-a.threshold);
  must(flows.length<2||flows[0].threshold!==flows[1].threshold,'同业务金额档存在重复审批流，请先停用冲突配置');
  const flow=flows[0];return {flow:flow?.id||'',name:flow?.name||'默认独立复核',kind,permission,amount,nodes:copy(flow?.nodes||[{role:'',reviewer:''}]),index:0,history:[],status:'审批中',submittedBy:r.createdBy||'SYSTEM',submittedAt:S.stamp()};
 }
 let reviewContext=null;
 S.approvalIntercept=d=>{
  if(!reviewContext)return null;
  const {type,id,approved,note}=reviewContext,r=get(type,id,d);must(r?.status==='待审批','该单据已处理');must(note?.trim(),'请填写审核意见');r.approvalRun||=approvalSnapshot(type,r,d);const run=r.approvalRun;
  must(run.status==='审批中','审批已结束，请重新提交');const a=S.differentReviewer(run.submittedBy,run.permission,reviewStore(type,r,d),d),node=run.nodes[run.index];must(node,'审批节点已结束');
  must(!run.history.some(h=>h.actor===a.id),'同一人员不能重复审核本单的不同节点');
  if(node.reviewer)must(a.id===node.reviewer,'须由当前节点指定人员审核');
  if(node.role)must((a.roles||[]).includes(node.role)&&get('roles',node.role,d)?.status==='启用','当前办理人不属于该审批节点角色');
  run.history.push({node:run.index+1,actor:a.id,approved,note,time:S.stamp()});
  if(!approved){run.status='已驳回';r.status='已驳回';return {skip:true,result:r}}
  run.index++;if(run.index<run.nodes.length)return {skip:true,result:r};run.status='已通过';return null;
 };
 function reviewCall(type,id,approved,note,fn){must(!reviewContext,'审核正在执行');reviewContext={type,id,approved,note};try{return fn()}finally{reviewContext=null}}
 const validate=S.validateMaster;
 S.validateMaster=(type,r,d)=>{
  validate(type,r,d);
  if(type==='approvals'){
   must(reviewTypes&&Object.values(reviewTypes).some(x=>x[0]===r.kind),'请选择支持的业务类型');must(Number.isFinite(r.threshold)&&r.threshold>=0,'金额阈值须为非负数');
   must(r.nodes?.length&&r.nodes.length<=6,'请配置 1–6 个顺序审批节点');const permission=Object.values(reviewTypes).find(x=>x[0]===r.kind)[1];
   r.nodes.forEach(n=>{must(n.role||n.reviewer,'每个节点须选择角色或指定人员');if(n.role){const role=get('roles',n.role,d);must(role?.status==='启用'&&(role.permissions.includes(permission)||role.permissions.includes('系统管理')),'节点角色须具有相应审核权限')}if(n.reviewer){const person=get('staff',n.reviewer,d);must(person?.status==='启用','指定审核人员不可用');must((person.roles||[]).some(id=>{const role=get('roles',id,d);return role?.status==='启用'&&(role.permissions.includes(permission)||role.permissions.includes('系统管理'))}),'指定审核人没有对应业务审核权限');if(n.role)must(person.roles?.includes(n.role),'指定人员不属于节点角色')}});
   const persons=r.nodes.map(n=>n.reviewer).filter(Boolean);must(new Set(persons).size===persons.length,'不同节点不能指定同一人员');
   if(r.status==='启用')must(!d.approvals.some(a=>a.id!==r.id&&a.status==='启用'&&a.kind===r.kind&&a.threshold===r.threshold&&a.nodes?.length),'该业务与金额档已存在启用流程');
   r.steps=r.nodes.map((n,i)=>(i+1)+'. '+(get('roles',n.role,d)?.name||'指定人员')+(n.reviewer?' / '+get('staff',n.reviewer,d).name:'')).join(' → ');
  }
  if(reviewTypes[type]&&r.status==='待审批'){const old=get(type,r.id,d);must(!old||old.status==='已驳回'||old.status==='待审批'&&!(old.approvalRun?.history.length),'已审核单据请先驳回后重新提交');r.createdBy=S.actor(d).id;r.approvalRun=approvalSnapshot(type,r,d)}
  if(type==='payments'){const p=get('purchases',r.purchase,d);must(p,'请选择采购单');const pending=d.payments.filter(p=>p.id!==r.id&&p.purchase===r.purchase&&['待审批','待付款','部分付款'].includes(p.status)).reduce((n,p)=>n+Math.max(0,p.amount-S.paymentPaid(p.id,d)),0);must(r.amount>0&&r.amount+pending<=S.purchaseBalance(r.purchase,d).balance,'申请金额超过扣除其他付款申请后的应付余额')}
 };
 const ledger=S.reconcileLedger;
 S.reconcileLedger=d=>{
  ledger(d);
  for(const [type] of Object.entries(reviewTypes))for(const r of d.inventorySchema>=2?d[type]||[]:[])if(r.status==='待审批'&&!r.approvalRun)r.approvalRun=approvalSnapshot(type,r,d);
  for(const p of d.countPlans||[]){const tasks=d.counts.filter(c=>c.plan===p.id);p.status=tasks.length&&tasks.every(c=>c.status==='已完成')?'已完成':'执行中'}
 };
 const purchaseReview=S.approvePurchase,transfer=S.transferAction,loss=S.approveLoss,returnReview=S.confirmPurchaseReturn;
 S.approvePurchase=(id,approved,note)=>reviewCall('purchases',id,approved,note,()=>purchaseReview(id,approved,note));
 S.transferAction=(id,action,m={})=>['approve','deny'].includes(action)?reviewCall('transfers',id,action==='approve',m.note||m.reason,()=>transfer(id,action,m)):transfer(id,action,m);
 S.approveLoss=(id,m={})=>reviewCall('losses',id,true,m.note,()=>loss(id));
 S.confirmPurchaseReturn=(id,m)=>reviewCall('purchaseReturns',id,true,m.note,()=>returnReview(id,m));
 function reviewDocument(type,id,approved,note){
  must(reviewTypes[type],'该业务没有通用审批入口');
  if(type==='purchases')return S.approvePurchase(id,approved,note);
  if(type==='transfers')return S.transferAction(id,approved?'approve':'deny',{note});
  if(type==='losses'&&approved)return S.approveLoss(id,{note});
  if(type==='cardEvents'&&approved)return reviewCardRefund(id,note);
  return reviewCall(type,id,approved,note,()=>S.transaction('业务单据审核',d=>{
   const r=get(type,id,d);
   if(type==='payments'){must(r.amount<=S.purchaseBalance(r.purchase,d).balance,'应付余额已变化');r.status='待付款'}
   else if(type==='prices')r.status='已生效';
   else if(type==='adjustments'){
    const c=get('consumptions',r.source,d);must(c?.status==='已消耗'&&r.quantity>0,'请关联已消耗单；负向冲回须通过实物盘点复核');const allocations=S.allocate(d,r.sku,c.store,r.quantity);S.guardClinical(d,allocations,c);allocations.forEach(a=>S.movement(d,get('batches',a.batch,d),-a.quantity,'消耗调整',r.id));r.allocations=allocations;r.cost=round(allocations.reduce((n,a)=>n+a.quantity*a.cost,0));r.status='已调整';
   }else if(['applications','firstReviews'].includes(type))r.status='已通过';
   else must(false,'请使用本业务专用审核入口');return r;
  }));
 }
 function resubmitLoss(id,m){return S.transaction('报损重新提交',d=>{const r=get('losses',id,d),b=get('batches',r?.batch,d);S.requirePermission('领用',b?.store,d);must(r?.status==='已驳回'&&m.note?.trim(),'请填写重新提交依据');must(b&&S.available(b)>=r.quantity,'实物可报损余量已变化');r.previousReviews||=[];r.previousReviews.push(copy(r.approvalRun));r.createdBy=S.actor(d).id;r.status='待审批';r.note=m.note;r.approvalRun=approvalSnapshot('losses',r,d);return r})}
 const paymentPaid=(id,d=S.data)=>money((d.paymentEntries||[]).filter(e=>e.payment===id).reduce((n,e)=>n+e.amount,0));
 S.purchaseBalance=(id,d=S.data)=>{const p=get('purchases',id,d);if(!p)return null;const received=p.receivedAmount??(p.status==='已入库'?p.amount:0),returns=d.purchaseReturns.filter(r=>r.purchase===id&&r.status==='已退货').reduce((n,r)=>n+(r.amount??r.quantity*(get('batches',r.batch,d)?.cost||0)),0),paid=(d.paymentEntries||[]).filter(e=>e.purchase===id).reduce((n,e)=>n+e.amount,0);return {received:money(received),returns:money(returns),net:money(received-returns),paid:money(paid),balance:money(received-returns-paid)}};
 function paymentEntry(m){return S.transaction('财务收付登记',d=>{
  const p=get('payments',m.payment,d),po=get('purchases',m.purchase||p?.purchase,d);S.requirePermission('财务',po?.store,d);must(po&&m.voucher?.trim()&&m.date&&m.date<=S.today()&&m.note?.trim(),'请填写采购来源、凭据、实际日期及依据');must(Number.isFinite(m.amount)&&m.amount>0&&money(m.amount)===m.amount,'金额须为正数且最多两位小数');
  must(!d.paymentEntries.some(e=>e.supplier===po.supplier&&e.voucher===m.voucher.trim()),'该供应商付款 / 收款凭据已登记');let amount=m.amount;
  if(m.kind==='供应商退款'){must(amount<=-S.purchaseBalance(po.id,d).balance,'超过应收回的供应商退款余额');amount=-amount}
  else{must(p&&['待付款','部分付款'].includes(p.status),'付款申请尚未审批或已付清');must(amount<=money(p.amount-paymentPaid(p.id,d))&&amount<=S.purchaseBalance(po.id,d).balance,'超过申请剩余量或当前应付余额')}
  const e=record('CASH',{...m,amount,purchase:po.id,payment:p?.id||'',supplier:po.supplier,store:po.store,status:'已登记'},d);d.paymentEntries.unshift(e);if(p){p.status=paymentPaid(p.id,d)>=p.amount?'已付款':'部分付款';p.payment={voucher:e.voucher,paidAt:e.date,actor:e.createdBy}}return e;
 })}
 function reversePayment(id,m){return S.transaction('财务付款冲正',d=>{
  const e=get('paymentEntries',id,d);must(e&&e.kind!=='冲正'&&!d.paymentEntries.some(x=>x.reversalOf===id),'该凭据不可重复冲正');S.differentReviewer(e.createdBy,'财务',e.store,d);must(m.note?.trim()&&m.voucher?.trim(),'请填写冲正依据与凭据');must(!d.paymentEntries.some(x=>x.supplier===e.supplier&&x.voucher===m.voucher.trim()),'凭据已登记');
  const r=record('CASH',{...m,kind:'冲正',date:S.today(),purchase:e.purchase,payment:e.payment,supplier:e.supplier,store:e.store,amount:-e.amount,reversalOf:id,status:'已登记'},d);d.paymentEntries.unshift(r);const p=get('payments',e.payment,d);if(p)p.status=paymentPaid(p.id,d)>0?'部分付款':'待付款';return r;
 })}
 S.recordPayment=(id,m)=>paymentEntry({...m,payment:id,kind:'付款',date:m.date||m.paidAt,amount:m.amount??money(get('payments',id).amount-paymentPaid(id)),note:m.note||'按已审批付款申请登记'});
 function resolveReconciliation(id,m){return S.transaction('财务对账差异复核',d=>{
  const r=get('purchaseReconciliations',id,d);must(r?.status==='差异待处理','该对账单没有待处理差异');S.differentReviewer(r.createdBy,'财务',null,d);must(m.note?.trim()&&m.voucher?.trim(),'请登记差异处理依据与双方确认凭据');
  if(m.result==='撤销重建'){r.status='已撤销';r.resolution={...m,actor:S.actor(d).id,time:S.stamp()};return r}
  must(Number.isFinite(m.confirmedAmount)&&money(m.confirmedAmount)===money(r.amount),'供应商更正金额须与本期账面一致；账面错误须补正原业务后撤销重建');r.resolution={...m,originalSupplierAmount:r.supplierAmount,actor:S.actor(d).id,time:S.stamp()};r.supplierAmount=m.confirmedAmount;r.difference=0;r.status='已对账';return r;
 })}
 function settle(id,m){return S.transaction('门店核销结算确认',d=>{
  const r=get('settlements',id,d);must(r&&r.status!=='已确认'&&r.status!=='已冲销','结算已结束');must(['from','to'].includes(m.side),'请选择本次确认方');S.requirePermission('财务',r[m.side],d);must(m.note?.trim()&&m.voucher?.trim(),'请填写对账依据和凭据');r.confirmations||=[];
  must(!r.confirmations.some(c=>c.side===m.side&&c.version===(r.version||0)),'本方本版本已确认');must(!r.confirmations.some(c=>c.side!==m.side&&c.version===(r.version||0)&&c.actor===S.actor(d).id),'收付双方须由不同人员确认');
  if(m.result==='提出差异'){r.status='差异待处理';r.disputes||=[];r.disputes.push({...m,actor:S.actor(d).id,time:S.stamp()});return r}
  must(r.status!=='差异待处理','请先处理双方差异');r.confirmations.push({...m,version:r.version||0,actor:S.actor(d).id,time:S.stamp()});r.status=new Set(r.confirmations.filter(c=>c.version===(r.version||0)).map(c=>c.side)).size===2?'已确认':'待对方确认';return r;
 })}
 function resolveSettlement(id,m){return S.transaction('门店结算差异处理',d=>{
  const r=get('settlements',id,d);must(r?.status==='差异待处理','没有待处理差异');S.requirePermission('财务',r.from,d);S.requirePermission('财务',r.to,d);must(m.note?.trim()&&m.voucher?.trim()&&Number.isFinite(m.ratio)&&m.ratio>=0&&m.ratio<=100,'请填写双方确认的分摊比例与依据');must(r.recognized!=null,'历史结算缺少核销金额，请先核对来源');r.revisions||=[];r.revisions.push({amount:r.amount,ratio:r.ratio,version:r.version||0,...m,actor:S.actor(d).id,time:S.stamp()});r.ratio=m.ratio;r.amount=money(r.recognized*m.ratio/100);r.version=(r.version||0)+1;r.status='待确认';return r;
 })}
 function cardIdle(cs,d){must(!d.treatments.some(t=>!['已关闭','已取消'].includes(t.status)&&t.items.some(i=>i.cardSale===cs.id))&&!d.consumptions.some(c=>c.cardSale===cs.id&&['已预占','待偏差审批'].includes(c.status)),'该卡存在未完成治疗或预占，请先完成处理')}
 function refundValue(cs,lines){const total=lines.reduce((n,l)=>n+l.times*(cs.unitValues?.[l.spec]??cs.amount/cs.initialTimes),0),all=cs.remaining.every(r=>lines.find(l=>l.spec===r.spec)?.times===r.times||r.times===0);return all?money(cs.amount-cs.recognized-(cs.refunded||0)):Math.min(money(total),money(cs.amount-cs.recognized-(cs.refunded||0)))}
 function requestCardRefund(id,m){return S.transaction('卡项退款申请',d=>{
  const cs=get('cardSales',id,d);S.requirePermission('财务',cs?.store,d);must(cs&&['有效','已冻结'].includes(cs.status),'卡状态不允许退款');cardIdle(cs,d);must(!d.cardEvents.some(e=>e.cardSale===id&&['待审批','待退款'].includes(e.status)),'该卡已有退款在处理');must(m.reason?.trim()&&m.lines?.length,'请填写退款权益及原因');
  const lines=m.lines.filter(l=>l.times>0).map(l=>{const r=cs.remaining.find(x=>x.spec===l.spec);must(r&&Number.isInteger(l.times)&&l.times>0&&l.times<=r.times,'退还次数超过未使用权益或不是整数');return {spec:l.spec,times:l.times}});must(lines.length&&new Set(lines.map(l=>l.spec)).size===lines.length,'请填写不重复的退权益明细');
  const e=record('CARD-EVENT',{cardSale:id,store:cs.store,kind:'部分 / 全部退权益',reason:m.reason,lines,amount:refundValue(cs,lines),status:'待审批'},d);d.cardEvents.unshift(e);return e;
 })}
 function reviewCardRefund(id,note){return reviewCall('cardEvents',id,true,note,()=>S.transaction('卡项退款审核',d=>{const e=get('cardEvents',id,d),cs=get('cardSales',e.cardSale,d);cardIdle(cs,d);must(e.lines.every(l=>cs.remaining.find(r=>r.spec===l.spec)?.times>=l.times),'剩余权益已变化');must(refundValue(cs,e.lines)===e.amount,'金额已变化，请驳回重提');e.status='待退款';return e}))}
 function completeCardRefund(id,m){return S.transaction('卡项退款核对',d=>{
  const e=get('cardEvents',id,d),cs=get('cardSales',e?.cardSale,d);S.requirePermission('财务',cs?.store,d);must(e?.status==='待退款'&&m.voucher?.trim(),'请关联已审批退款和原系统退款凭据');must(!d.cardEvents.some(x=>x.id!==id&&x.voucher===m.voucher.trim()),'退款凭据已登记');cardIdle(cs,d);must(e.lines.every(l=>cs.remaining.find(r=>r.spec===l.spec)?.times>=l.times),'权益已变化');e.lines.forEach(l=>cs.remaining.find(r=>r.spec===l.spec).times-=l.times);cs.refunded=money((cs.refunded||0)+e.amount);must(cs.refunded+cs.recognized<=cs.amount+.001,'退款超过未核销余额');if(cs.remaining.every(r=>!r.times))cs.status='已退款';Object.assign(e,{voucher:m.voucher.trim(),status:'已退款',paidAt:S.stamp(),paidBy:S.actor(d).id});return e;
 })}
 const oldCardEvent=S.cardEvent;
 S.cardEvent=(id,m)=>m.kind==='退还剩余权益'?requestCardRefund(id,{reason:m.reason,lines:copy(get('cardSales',id).remaining)}):oldCardEvent(id,m);
 function reverseRedemption(id,m){return S.transaction('卡项误核销冲正',d=>{
  const r=get('redemptions',id,d),cs=get('cardSales',r?.cardSale,d);must(r?.status==='已核销'&&cs,'该核销不可重复冲正');S.differentReviewer(r.createdBy||get('treatments',r.source,d)?.billingBy,'财务',r.store,d);must(m.note?.trim()&&m.voucher?.trim(),'请填写原系统冲正凭据及依据');must(!d.cardEvents.some(e=>e.voucher===m.voucher.trim()),'冲正凭据已登记');cardIdle(cs,d);must(!d.cardEvents.some(e=>e.cardSale===cs.id&&['待审批','待退款'].includes(e.status)),'请先处理该卡退款申请');must(cs.recognized>=r.amount,'已核销金额异常');
  const right=cs.remaining.find(x=>x.spec===r.spec);must(right,'卡权益快照缺失');right.times+=r.times;cs.recognized=money(cs.recognized-r.amount);if(cs.status==='已退款')cs.status='已冻结';r.status='已冲正';r.reversedAt=S.stamp();
  const e=record('CARD-EVENT',{cardSale:cs.id,store:r.store,kind:'误核销冲正',source:r.id,amount:-r.amount,lines:[{spec:r.spec,times:r.times}],reason:m.note,voucher:m.voucher,status:'已登记'},d);d.cardEvents.unshift(e);
  for(const settlement of d.settlements.filter(s=>s.redemption===id||!s.redemption&&s.source===r.source)){if(settlement.status==='已确认')d.settlements.unshift(record('SET',{...copy(settlement),id:uid('SET'),amount:-settlement.amount,recognized:-settlement.recognized,reversalOf:settlement.id,status:'待确认',confirmations:[],version:0,source:r.source},d));else{settlement.previousStatus=settlement.status;settlement.status='已冲销';settlement.reversal=e.id}}
  const t=get('treatments',r.source,d);if(t){t.billingReversals||=[];t.billingReversals.push(e.id);t.sourceSync='待原订单核对'}return e;
 })}

 function cancelTransfer(id,m){return S.transaction('调拨取消发货',d=>{const r=get('transfers',id,d);must(r&&['待审批','待发货'].includes(r.status),'发货后请走收货差异或拒收退回');S.requirePermission('调拨',r.from,d);must(S.actor(d).id===r.createdBy||S.can('调拨审批',r.from,d),'请由申请人或调拨审核人员取消');must(m.note?.trim(),'请填写取消依据');if(r.reserved){const b=get('batches',r.batch,d);must(b.reserved>=r.reserved,'预占库存异常');b.reserved=round(b.reserved-r.reserved);r.reserved=0}r.status='已取消';r.cancelNote=m.note;r.cancelledBy=S.actor(d).id;r.cancelledAt=S.stamp();if(r.approvalRun?.status==='审批中')r.approvalRun.status='已取消';return r})}
 S.cancelTransfer=cancelTransfer;
 Object.assign(S,{reviewTypes,approvalSnapshot,reviewDocument,resubmitLoss,paymentPaid,paymentEntry,reversePayment,resolveReconciliation,settle,resolveSettlement,requestCardRefund,completeCardRefund,reverseRedemption});
 const ready=S.ready;
 S.ready=ready.then(async()=>{if(S.data.workflowSchema===1||S.storageError)return;S.transaction('审批财务升级',d=>{
  d.paymentEntries||=[];for(const p of d.payments.filter(p=>p.status==='已付款'))if(!d.paymentEntries.some(e=>e.payment===p.id))d.paymentEntries.push({id:uid('CASH'),payment:p.id,purchase:p.purchase,supplier:get('purchases',p.purchase,d)?.supplier,store:get('purchases',p.purchase,d)?.store,kind:'付款',amount:p.amount,date:(p.payment?.paidAt||p.time||S.today()).slice(0,10),voucher:p.payment?.voucher||'历史记录 '+p.id,createdBy:p.payment?.actor||p.createdBy||'',time:p.time||S.stamp(),status:'已登记',legacy:true});
  for(const flow of d.approvals)if(!flow.nodes?.length){flow.status='待配置';flow.legacySteps=flow.steps;flow.steps='请配置可执行审批节点'}
  d.ledgerBaseline={time:S.stamp(),date:S.today(),batches:d.batches.map(b=>({id:b.id,store:b.store,sku:b.sku,quantity:b.quantity,cost:b.cost})),movementIds:d.movements.map(m=>m.id)};d.workflowSchema=1;return {id:'workflow-1'};
 });try{await S.flush()}catch(e){if(!S.storageError)throw e}}).catch(e=>{if(!S.storageError)throw e});PCModules['inventory-core'].ready=S.ready;
})();
