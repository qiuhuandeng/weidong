/* Operational review screens, using the existing company form and table adapters. */
(() => {
 const S=PCModules['supply-chain'],U=S.ui,{f,ref,req,must}=S;
 function simple(title,defs,m,fn,width=860){U.open(title,U.form(defs,m),r=>{U.validate(defs,r);fn(r);U.saved()},m,width,'确认提交')}
 function countPlan(){const m={name:'',store:'',kind:'大盘',person:'',date:S.today(),batches:[]};U.open('盘点计划与任务下发',r=>U.form([req('name','盘点计划名称'),ref('store','盘点机构','stores'),f('kind','盘点类型','select',['大盘','循环盘','重点品盘'],true),ref('person','指定盘点人','staff'),req('date','盘点日期','date'),f('batches','实盘范围（含寄存与治疗室）','multi',S.data.batches.filter(b=>b.store===r.store&&b.quantity>0).map(b=>[b.id,U.names('skus',b.sku)+' / '+U.names('warehouses',b.warehouse)+' / '+(b.containerCode||b.batch)]),true)],r).replace('name="store"','onchange="PCModules[&quot;supply-chain&quot;].businessChange()" name="store"'),r=>{S.countPlan(r);U.saved('已为所选实物批次分别生成盘点任务')},m,1120,'下发盘点任务')}
 function opening(){simple('期初 / 发现实物建账',[f('kind','建账类型','select',['期初建账','发现实物盘盈'],true),ref('sku','物料','skus'),ref('store','所在机构','stores'),ref('warehouse','实际库位','warehouses'),req('batch','生产批号'),req('produced','生产日期','date'),req('expiry','有效期','date'),req('quantity','实际数量','number'),ref('unit','数量单位','unitNames'),req('cost','基本单位成本（元）','number'),f('udi','追溯码'),req('reason','来源与建账依据','textarea')],{kind:'期初建账',sku:'',store:'',warehouse:'',batch:'',produced:'',expiry:'',quantity:'',unit:'',cost:'',udi:'',reason:''},r=>S.opening(r),1120)}
 function saleReturn(){simple('按原销售单退货',[ref('source','原销售出库单','salesOut'),req('quantity','业务退货数量','number'),ref('unit','退货单位','unitNames'),req('reason','实物退回与退款依据','textarea')],{source:'',quantity:'',unit:'',reason:''},r=>S.saleReturn(r),560)}
 function alertAction(id){const row=U.alerts(U.view().alert).find(r=>r.id===id);if(!row)return;simple('预警处理派单',[ref('owner','处理责任人','staff'),req('due','处理期限','date'),req('note','处理措施','textarea')],{alert:id,target:row.target,entity:row.entity,store:row.store,name:row.subject,owner:'',due:S.today(),note:''},r=>S.alertTask(r),560)}
 const previousActions=S.extraActions;
 S.extraActions=(type,r)=>{
  if(['controlledLogs','emptyVials'].includes(type)&&r.status==='待复核')return U.link('详情','detail',type,r.id)+U.link('独立复核','assuranceControlledReview',type,r.id);
  if(type==='counts'&&r.status==='待审核')return U.link('详情','detail',type,r.id)+U.link('独立复核','assuranceCountReview',r.id)+U.link('退回重盘','workflow',type,r.id,'deny');
  if(type==='openingStocks')return U.link('详情','assuranceOpeningDetail',r.id)+(r.status==='待复核'?U.link('复核建账','assuranceOpeningReview',r.id):r.stockBatch?U.link('质量处置','qualityResolve',r.stockBatch):'');
  if(type==='purchaseReceipts')return U.link('详情','detail',type,r.id)+U.link('补票 / 核对','assuranceInvoice',r.id);
  if(type==='retail'&&r.kind==='销售退货')return U.link('详情','detail',type,r.id)+(r.refundStatus==='待原系统退款核对'?U.link('退款核对','assuranceRefund',r.id):'');
  if(type==='recalls'&&r.status==='执行中')return U.link('追溯','trace',r.batch)+U.link('展开跟进任务','assuranceRecallTasks',r.id)+U.link('完成召回','recallComplete',r.id);
  if(type==='qualityTasks')return U.link('处置记录','assuranceQualityTask',r.id);
  if(type==='alerts')return U.link('查看业务','detail',r.entity,r.target)+U.link('指派处理','assuranceAlert',r.id);
  if(type==='alertTasks')return U.link('处理结果','assuranceAlertResult',r.id);
  return previousActions?.(type,r);
 };
 S.columns.openingStocks=['id:建账申请','kind:来源类型','sku:物料','store:机构','warehouse:实物库位','batch:生产批号','quantity:业务数量','unit:单位','reason:依据','status:状态'];
 S.columns.qualityTasks=['recall:召回单','type:任务类型','subject:对象','store:机构','owner:责任人','result:处理结果','status:状态'];
 S.columns.alertTasks=['name:风险事项','store:机构','owner:责任人','due:期限','note:措施','result:处理结果','status:状态'];
 S.pages['sc-counts'].tabs[0].create='count-plan';S.pages['sc-counts'].tabs.push({key:'opening',title:'期初 / 发现实物',entity:'openingStocks',create:'opening'});
 S.pages['sc-quality'].tabs.push({key:'tasks',title:'召回跟进任务',entity:'qualityTasks',readonly:true});
 S.pages['sc-alerts'].tabs.push({key:'tasks',title:'预警处理任务',entity:'alertTasks',readonly:true});
 S.columns.controlledLogs.push('book:账面基本量','difference:清点差异');S.columns.emptyVials.push('status:复核状态');
 S.columns.retail.push('refundStatus:退款核对');
 for(const t of ['openingStocks','qualityTasks','alertTasks'])U.storeEntities.add(t);
 Object.assign(S.creators,{'count-plan':countPlan,opening,return:saleReturn});
 Object.assign(S,{
  assuranceAlert:alertAction,
  assuranceControlledReview:(type,id)=>simple('管制台账独立复核',[req('note','实物及交接核对意见','textarea')],{note:''},r=>S.controlledReview(type,id,r),560),
  assuranceCountReview:id=>simple('盘点结果独立复核',[req('note','复核意见','textarea')],{note:''},r=>S.approveCount(id,r),560),
  assuranceOpeningReview:id=>simple('建账实物复核',[f('result','复核结论','select',['通过','驳回'],true),req('note','实物与来源复核意见','textarea')],{result:'通过',note:''},r=>S.approveOpening(id,r),560),
  assuranceOpeningDetail:id=>{const r=S.get('openingStocks',id);U.open('实物建账详情',U.tableFor('openingStocks',[r],false)+kv({'复核意见':U.text(r.reviewNote),'入库批次':U.text(r.stockBatch)}),null,null,1120)},
  assuranceInvoice:id=>simple('验收入库补票与核对',[req('invoiceNo','发票号码'),req('invoiceAmount','本次验收对应金额（元）','number'),req('note','票据分配与核对依据','textarea')],{invoiceNo:S.get('purchaseReceipts',id).invoiceNo,invoiceAmount:'',note:''},r=>S.receiptInvoice(id,r),560),
  assuranceRefund:id=>simple('原系统退款核对',[req('voucher','原系统退款凭据'),req('note','核对结果','textarea')],{voucher:'',note:''},r=>S.refundConfirm(id,r),560),
  assuranceRecallTasks:id=>U.confirm('展开召回跟进任务','为库存、在途单据和已使用患者生成跟进任务，已有任务不重复创建。',()=>S.recallTasks(id)),
  recallComplete:id=>U.confirm('完成召回','核对所有实物处置、在途拦截与患者跟进任务均已完成。',()=>S.completeRecall(id)),
  assuranceQualityTask:id=>simple('召回任务处置',[req('result','处理结果','textarea'),req('evidence','联系 / 处置凭据')],{result:S.get('qualityTasks',id).result||'',evidence:''},r=>S.resolveTask(id,r),560),
  assuranceAlertResult:id=>simple('预警处理结果',[req('result','处理结果及业务凭据','textarea')],{result:''},r=>S.closeAlertTask(id,r),560)
 });
})();
