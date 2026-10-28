/* Business completion screens use the inventory's existing company component adapters. */
(() => {
 const S=PCModules['supply-chain'],U=S.ui,{f,ref,req,must,copy}=S;
 const simple=(title,defs,m,fn,width=560)=>U.open(title,U.form(defs,m),r=>{U.validate(defs,r);fn(r);U.saved()},m,width,'确认提交');
 const detailLink=(type,r)=>U.link('详情','detail',type,r.id);
 function approvalEditor(id){
  const old=S.get('approvals',id),m={name:'',kind:'采购',threshold:0,status:'启用',count:String(old?.nodes?.length||1),...copy(old||{})};m.count=String(old?.nodes?.length||1);if(m.status==='待配置')m.status='启用';for(let i=0;i<6;i++){m['role'+i]=old?.nodes?.[i]?.role||'';m['reviewer'+i]=old?.nodes?.[i]?.reviewer||''}
  U.open('审批流程配置',r=>U.form([req('name','流程名称'),f('kind','业务类型','select',[...new Set(Object.values(S.reviewTypes).map(x=>x[0]))],true),req('threshold','适用金额下限（元）','number'),f('status','状态','select',['启用','停用'],true),f('count','顺序审批节点数','select',['1','2','3','4','5','6'],true)],r).replace('name="count"','onchange="PCModules[&quot;supply-chain&quot;].workflowNodeCount()" name="count"')+Array.from({length:Number(r.count)},(_,i)=>contentModule('第 '+(i+1)+' 级审核',U.form([ref('role'+i,'审核角色','roles',false),ref('reviewer'+i,'指定审核人','staff',false)],r,'node-'+i))).join('')+kv({'适用规则':U.text('采用不超过单据金额的最高金额档；未匹配配置时，由另一位具备业务审核权限的人员独立复核。每级须由不同人员办理。')}),r=>{r.nodes=Array.from({length:Number(r.count)},(_,i)=>({role:r['role'+i],reviewer:r['reviewer'+i]}));S.save('approvals',r);U.saved()},m,860,'保存配置');
 }
 function review(type,id,approved=true){const r=S.get(type,id);simple(approved?'审批当前节点':'驳回申请',[req('note','审核意见','textarea')],{note:''},m=>S.reviewDocument(type,id,approved,m.note))}
 function history(type,id){const r=S.get(type,id),run=r.approvalRun;if(!run)return;U.open('审批过程',kv({'流程':U.text(run.name),'适用金额':U.text(run.amount),'提交人员':U.text(U.names('staff',run.submittedBy)),'流程状态':U.text(run.status),'当前级别':U.text(run.status==='审批中'?run.index+1:'已结束')})+table(['级别','角色','指定人员','审核人员','结论','意见','时间'],run.nodes.map((n,i)=>{const h=run.history.find(h=>h.node===i+1);return [i+1,U.text(U.names('roles',n.role)),U.text(U.names('staff',n.reviewer)),U.text(U.names('staff',h?.actor)),U.text(h?h.approved?'通过':'驳回':'待审核'),U.text(h?.note),U.text(h?.time)]})),null,null,1120)}
 const oldEdit=S.edit,oldWorkflow=S.workflow,oldTransfer=S.transfer;
 S.edit=(type,id,preset)=>type==='approvals'?approvalEditor(id):oldEdit(type,id,preset);
 S.workflow=(type,id,action)=>{
  if(S.reviewTypes[type]&&['approve','deny'].includes(action)){if(type==='purchaseReturns'&&action==='approve')return S.businessPurchaseReturn(id);return review(type,id,action==='approve')}
  if(type==='settlements')return S.businessSettlement(id);
  if(type==='payments'&&action==='paid')return S.businessPayment(id);
  if(type==='counts'&&action==='deny')return simple('退回重新盘点',[req('note','退回依据','textarea')],{note:''},m=>S.transaction('盘点退回重盘',d=>{const c=S.get('counts',id,d),b=S.get('batches',c?.batch,d);must(c?.status==='待审核','盘点状态已变化');S.differentReviewer(c.person,'盘点',c.store,d);c.previousResults||=[];c.previousResults.push({actual:c.actual,book:c.book,note:m.note,time:S.stamp()});Object.assign(c,{status:'待盘点',book:b.quantity,cutoff:S.stamp(),movementIds:d.movements.filter(x=>x.batch===b.id).map(x=>x.id)});delete c.actual;delete c.splitReview;return c}));
  return oldWorkflow(type,id,action);
 };
 S.transfer=(id,action)=>['approve','deny'].includes(action)?review('transfers',id,action==='approve'):oldTransfer(id,action);
 S.businessPurchaseReview=(id,approved)=>review('purchases',id,approved);
 S.businessPayment=id=>{const p=S.get('payments',id);simple('分次付款登记',[req('amount','本次实付金额（元）','number'),req('voucher','实际付款凭据'),req('date','实际付款日期','date'),req('note','付款核对依据','textarea')],{amount:Math.round((p.amount-S.paymentPaid(id))*100)/100,voucher:'',date:S.today(),note:''},m=>S.recordPayment(id,m))};
 S.businessSupplierRefund=id=>simple('登记供应商退回款',[req('amount','本次收回金额（元）','number'),req('voucher','银行收款凭据'),req('date','实际收款日期','date'),req('note','退货退款依据','textarea')],{purchase:id,kind:'供应商退款',amount:-S.purchaseBalance(id).balance,voucher:'',date:S.today(),note:''},m=>S.paymentEntry(m));
 S.businessReversePayment=id=>simple('收付登记冲正',[req('voucher','冲正凭据'),req('note','冲正原因与原凭据核对','textarea')],{voucher:'',note:''},m=>S.reversePayment(id,m));
 S.businessReconciliationResolve=id=>simple('处理对账差异',[f('result','处理方式','select',['供应商更正金额','撤销重建'],true),req('confirmedAmount','供应商更正后余额（元）','number'),req('voucher','双方确认凭据'),req('note','差异原因与处理依据','textarea')],{result:'供应商更正金额',confirmedAmount:S.get('purchaseReconciliations',id).amount,voucher:'',note:''},m=>S.resolveReconciliation(id,m),860);
 S.businessSettlement=id=>simple('跨店结算双方确认',[f('side','本次确认方','select',[['from','售卡方：'+U.names('stores',S.get('settlements',id).from)],['to','执行方：'+U.names('stores',S.get('settlements',id).to)]],true),f('result','核对结论','select',['确认一致','提出差异'],true),req('voucher','对账凭据'),req('note','核对意见','textarea')],{side:'',result:'确认一致',voucher:'',note:''},m=>S.settle(id,m),860);
 S.businessSettlementResolve=id=>simple('跨店结算差异处理',[req('ratio','双方确认执行店比例（%）','number'),req('voucher','双方协商凭据'),req('note','调整依据','textarea')],{ratio:S.get('settlements',id).ratio??'',voucher:'',note:''},m=>S.resolveSettlement(id,m),860);
 S.businessPartialRefund=id=>{const cs=S.get('cardSales',id),m={reason:''};cs.remaining.forEach((r,i)=>m['times'+i]=0);const defs=cs.remaining.map((r,i)=>req('times'+i,U.names('specs',r.spec)+'（剩余 '+r.times+' 次）','number')).concat(req('reason','退权益依据','textarea'));U.open('部分 / 全部退还卡权益',U.form(defs,m)+kv({'金额规则':U.text('按售卡时的项目金额分摊计算，仅退未使用权益；审批通过后登记原系统退款凭据。')}),r=>{S.requestCardRefund(id,{reason:r.reason,lines:cs.remaining.map((x,i)=>({spec:x.spec,times:Number(r['times'+i])}))});U.saved('已提交退款审批')},m,860,'提交退款申请')};
 S.businessRefundComplete=id=>simple('卡项退款核对',[req('voucher','原系统退款凭据')],{voucher:''},m=>S.completeCardRefund(id,m));
 S.businessRedemptionReverse=id=>simple('误核销冲正',[req('voucher','原系统核销冲正凭据'),req('note','误核销原因与核对依据','textarea')],{voucher:'',note:''},m=>S.reverseRedemption(id,m),860);
 S.businessLossResubmit=id=>simple('重新提交报损',[req('note','修改后的报损依据','textarea')],{note:''},m=>S.resubmitLoss(id,m));
 S.businessAlertReview=id=>simple('风险解除复核',[req('note','业务处理凭据及复核意见','textarea')],{note:''},m=>S.reviewAlertTask(id,m));
 // Card maintenance keeps refunds on their independent, reviewed document path.
 S.businessCardEvent=id=>simple('卡项权益维护',[f('kind','处理事项','select',['冻结','解冻','延期','授权代用'],true),ref('patient','代用患者','patients',false),f('expires','新的有效期','date'),req('reason','处理依据','textarea')],{kind:'冻结',patient:'',expires:'',reason:''},r=>S.cardEvent(id,r),860);
 S.businessTransferCancel=id=>simple('取消调拨申请',[req('note','取消依据','textarea')],{note:''},m=>S.cancelTransfer(id,m));
 const previous=S.extraActions;
 S.extraActions=(type,r)=>{
  if(type==='approvals')return U.link('编辑审批节点','edit',type,r.id);
  if(type==='settlements')return detailLink(type,r)+(!['已确认','已冲销'].includes(r.status)?U.link('双方确认','businessSettlement',r.id):'')+(r.status==='差异待处理'?U.link('处理差异','businessSettlementResolve',r.id):'');
  if(type==='purchaseReconciliations')return detailLink(type,r)+(r.status==='差异待处理'?U.link('处理差异','businessReconciliationResolve',r.id):'');
  if(type==='paymentEntries')return detailLink(type,r)+(!r.legacy&&r.kind!=='冲正'&&!S.data.paymentEntries.some(e=>e.reversalOf===r.id)?U.link('冲正','businessReversePayment',r.id):'');
  if(type==='cardSales')return detailLink(type,r)+U.link('权益维护','businessCardEvent',r.id)+(['有效','已冻结'].includes(r.status)?U.link('退还权益','businessPartialRefund',r.id):'');
  if(type==='cardEvents')return detailLink(type,r)+(r.status==='待审批'?U.link('审核','businessReview',type,r.id,true)+U.link('驳回','businessReview',type,r.id,false):r.status==='待退款'?U.link('登记退款','businessRefundComplete',r.id):'')+(r.approvalRun?U.link('审批过程','businessApprovalHistory',type,r.id):'');
  if(type==='redemptions')return detailLink(type,r)+(r.status==='已核销'?U.link('误核销冲正','businessRedemptionReverse',r.id):'');
  if(type==='alertTasks')return detailLink(type,r)+(r.status==='待复核'?U.link('风险解除复核','businessAlertReview',r.id)+U.link('补充处理结果','assuranceAlertResult',r.id):r.status!=='已完成'?U.link('登记处理结果','assuranceAlertResult',r.id):'');
  if(type==='losses'&&r.status==='已驳回')return detailLink(type,r)+U.link('重新提交','businessLossResubmit',r.id)+U.link('审批过程','businessApprovalHistory',type,r.id);
  let html=previous?.(type,r);
  if(type==='transfers'&&['待审批','待发货'].includes(r.status))html=(html||detailLink(type,r))+U.link('取消调拨','businessTransferCancel',r.id);
  if(S.reviewTypes[type]){
   if(html===undefined&&r.status==='待审批')html=detailLink(type,r)+U.link('审核','businessReview',type,r.id,true)+U.link('驳回','businessReview',type,r.id,false);
   if(type==='applications'&&r.status==='已通过')html=detailLink(type,r)+U.link('生成采购单','purchaseFrom',r.id);
   if(type==='payments'&&['待付款','部分付款'].includes(r.status))html=detailLink(type,r)+U.link('登记付款','businessPayment',r.id);
   if(type==='purchases'&&S.purchaseBalance(r.id).balance<0)html=(html||detailLink(type,r))+U.link('供应商退回款','businessSupplierRefund',r.id);
   if(r.status==='已驳回'&&S.fields[type]&&!['purchases','transfers','losses'].includes(type))html=(html||detailLink(type,r))+U.link('修改重提','edit',type,r.id);
   if(r.approvalRun)html=(html||detailLink(type,r))+U.link('审批过程','businessApprovalHistory',type,r.id);
  }
  return html;
 };
 const cell=S.extraCell;
 S.extraCell=(r,key,type)=>{if(key==='reviewProgress'){const a=r.approvalRun;return a?(a.status==='审批中'?'第 '+(a.index+1)+' / '+a.nodes.length+' 级 · '+a.name:a.status):'—'}if(type==='payments'&&key==='paid')return S.paymentPaid(r.id);if(type==='alertTasks'&&key==='overdue')return r.status!=='已完成'&&r.due<S.today()?'已逾期':'—';return cell?.(r,key,type)};
 for(const type of Object.keys(S.reviewTypes))if(S.columns[type])S.columns[type].push('reviewProgress:审批进度');
 S.columns.payments.splice(5,0,'paid:累计实付');S.columns.paymentEntries=['id:收付流水','purchase:采购单','payment:付款申请','supplier:供应商','kind:业务类型','amount:净付金额（退款为负）','date:实际日期','voucher:凭据','note:核对依据'];
 S.columns.alertTasks.push('overdue:时效');S.columns.settlements.splice(5,0,'ratio:执行店分摊比例（%）');
 S.pages['sc-procurement'].tabs.push({key:'cash',title:'付款与退回款流水',entity:'paymentEntries',readonly:true});S.pages['sc-finance'].tabs.push({key:'cash',title:'收付核销流水',entity:'paymentEntries',readonly:true});U.storeEntities.add('paymentEntries');U.storeEntities.add('cardEvents');
 S.creators.approvals=()=>approvalEditor();Object.assign(S,{businessReview:review,businessApprovalHistory:history,workflowNodeCount:()=>{U.collect();U.redraw()}});
 S.details.cardEvents=id=>{const r=S.get('cardEvents',id);U.open('卡项售后详情',U.tableFor('cardEvents',[r],false)+table(['项目规格','处理次数'],(r.lines||[]).map(l=>[U.text(U.names('specs',l.spec)),l.times]))+kv({'原系统凭据':U.text(r.voucher),'关联核销':U.text(r.source),'处理规则':U.text(r.kind==='误核销冲正'?'恢复卡权益并冲回核销金额；已发生的临床实际消耗保留在原治疗记录。':'退款凭据确认后扣减剩余权益。')}),null,null,1120)};
 // Source drill-down is generated from the same row set as on-screen export.
 const oldCanView=S.canView;S.canView=(type,r)=>['paymentEntries','payments','purchaseReconciliations','invoices'].includes(type)?S.can('财务',r.store||S.get('purchases',r.purchase)?.store):oldCanView(type,r);
 let reportRows=new Map();const reporting=S.businessReports;
 S.businessReports=(name,custom,filter)=>{const rows=reporting(name,custom,filter);rows.forEach(r=>reportRows.set(r.id,r));return rows};
 S.details.treatments=id=>{const t=S.get('treatments',id);U.open('院内治疗与核销依据',kv({'治疗单':U.text(t.id),'来源订单':U.text(t.sourceOrder),'患者':U.text(t.customer),'状态':U.text(t.status),'核对意见':U.text(t.billingNote)})+table(['项目规格','核销次数','核销金额'],(t.billing||[]).map(b=>[U.text(U.names('specs',b.spec)),b.times,b.amount]))+U.tableFor('consumptions',S.data.consumptions.filter(c=>c.sourceTreatment===id),false),null,null,1120)};
 const action=S.extraActions;
 S.extraActions=(type,r)=>type==='report'?U.link('计算依据','businessReportProof',r.id):type==='reportSources'?U.link('查看原记录','detail',r.sourceType,r.sourceId):action(type,r);
 S.columns.reportSources=['name:记录类型','sourceId:原记录编号','store:机构','quantity:基本数量','amount:金额 / 成本','time:发生时间'];
 S.businessReportProof=id=>{const r=reportRows.get(id);if(!r)return;const seen=new Set(),sources=(r.evidence||[]).filter(e=>{const key=e.type+e.id;if(seen.has(key))return false;seen.add(key);return true}).map(e=>{const source=S.get(e.type,e.id);return source?{id:e.type+e.id,name:({movements:'库存流水',batches:'实物批次',transfers:'调拨单',consumptions:'项目消耗',treatments:'院内治疗',shotLogs:'发数流水',cardSales:'售卡记录',redemptions:'卡项核销',adjustments:'消耗调整'})[e.type]||e.type,sourceType:e.type,sourceId:e.id,store:source.store||source.from,quantity:e.quantity??source.quantity,amount:e.amount??source.amount??(e.type==='batches'?source.quantity*source.cost:source.cost),time:e.time||source.time||source.closedAt||source.sold}:null}).filter(Boolean);U.open('报表计算依据',kv({'分析对象':U.text(r.name),'指标':U.text(r.metric),'数值':U.text(r.value==null?'无可用历史数据':r.value+' '+r.unit),'统计口径':U.text(r.period),'计算说明':U.text(r.note)})+U.tableFor('reportSources',sources),null,null,1120)};
 S.customReport=id=>{const r=S.get('reportPlans',id);U.open(r.name,U.tableFor('report',S.businessReports('',r,U.state())),null,null,1120)};
})();
