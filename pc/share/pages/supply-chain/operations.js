/* Business-specific extensions use the existing inventory screen adapters. */
(() => {
  const S=PCModules['supply-chain'],U=S.ui,{must,copy,round,uid}=S;
  const {f,req,ref}=S;
  S.fields.skus.push(f('useType','容器使用类型','select',['单次使用','经核准多次使用','仪器耗材'],true),ref('policyApprover','留存规则核准人','staff',false),f('reconstitutionRequired','须登记单瓶配制记录','checkbox'),f('retailAllowed','允许零售','checkbox'));
  S.fields.warehouses.push(f('purpose','库位用途','select',['主库','治疗室','科室','隔离区']),ref('parent','上级库区','warehouses',false),ref('owner','保管责任人','staff',false),f('cold','受冷链温度管理','checkbox'),f('controlled','管制保管','checkbox'));
  S.fields.staff.find(f=>f.key==='post').options.push('护士','管理员','审核员');
  S.fields.staff.push(f('roles','岗位角色','multi',[]),f('practiceStores','允许执业机构','multi',[]));
  S.fields.roles.find(f=>f.key==='permissions').options=S.permissions;
  S.fields.equipment.push(req('model','仪器型号 / 配方类型'));
  S.fields.heads.push(f('lifeUnit','寿命计量单位','select',['次','发','线']));
  S.fields.qualifications.push(f('practiceStores','登记执业机构','multi',[]));
  S.columns.batches.splice(2,0,'warehouse:实际存放库位');
  S.columns.consumptions.splice(1,0,'sourceOrder:来源订单','sourceTreatment:院内治疗单');
  S.fields.cards.push(f('allocation','卡内金额分摊','select',['按项目标准价比例','按次数平均']));
  S.fields.prices.find(f=>f.key==='scope').type='ref';S.fields.prices.find(f=>f.key==='scope').options='saleScopes';
  S.pages['sc-access'].tabs.unshift({key:'accounts',title:'账号与角色',entity:'staff'});
  S.creators.consume=S.creators.redeem=()=>go('sc-treatments');
  S.optionListExtra=def=>{
    if(def.key==='roles')return S.data.roles.filter(r=>r.status==='启用').map(r=>[r.id,r.name]);
    if(def.key==='practiceStores')return S.data.stores.filter(r=>r.status==='启用').map(r=>[r.id,r.name]);
  };
  function sessionUI(){
    const defs=[f('account','当前办理账号','select',S.data.staff.filter(a=>a.status==='启用').map(a=>[a.id,a.name+' / '+a.post]),true)],m={account:S.actor()?.id||''};
    U.open('当前办理账号',U.form(defs,m)+kv({'当前机构':U.text(U.names('stores',S.actor()?.store))}),r=>{U.validate(defs,r);S.setActor(r.account);U.close(true);S.render()},m,560,'切换办理人');
  }
  function canView(type,r){
    if(['roles','approvals'].includes(type))return S.can('系统管理');
    if(type==='staff'||type==='qualifications')return S.can('系统管理')||S.can('库存查询',r.store||S.get('staff',r.staff)?.store);
    let store=r.store||S.get('batches',r.batch)?.store||S.get('purchases',r.purchase)?.store||S.get('equipment',r.equipment)?.store;
    if(type==='stores')store=r.id;
    if(type==='transfers')return S.can(null,r.from)||S.can(null,r.to);
    if(type==='settlements')return S.can('财务',r.from)||S.can('财务',r.to);
    return S.can(null,store);
  }
  const oldWorkflow=S.workflow;
  S.workflow=(type,id,action)=>{
    const r=S.get(type,id);
    if(['applications','purchases','firstReviews','prices','purchaseReturns','payments','adjustments','settlements','losses','counts','recalls','adverse'].includes(type)){
      const permission=({losses:'报损审批',counts:'盘点',recalls:'质量',adverse:'质量'})[type]||(['payments','settlements'].includes(type)?'财务':type==='prices'?'主数据':type==='adjustments'?'临床复核':'采购审批');
      try{S.requirePermission(permission,r.store||S.get('purchases',r.purchase)?.store);if(action==='approve')S.differentReviewer(r.createdBy,permission,r.store)}catch(e){toast(e.message);return}
    }
    oldWorkflow(type,id,action);
  };
  S.canView=canView;S.sessionUI=sessionUI;
  const originalTrace=S.trace;
  S.trace=id=>{
    const source=S.get('batches',id);if(!source)return;
    const exact=!!source.containerCode,rows=S.traceBatches(id,S.data,exact),uses=S.traceUses(id,S.data,exact);
    U.open(exact?'单支 / 容器全程追溯':'生产批号全程追溯',kv({'物料':U.text(U.names('skus',source.sku)),'生产批号':U.text(source.batch),'单支 / 容器号':U.text(source.containerCode),'UDI':U.text(source.udi)})+contentModule('实物位置与状态',U.tableFor('batches',rows,false))+contentModule('患者使用及补扣',table(['业务单号','患者','来源治疗 / 消耗单','使用量','时间'],uses.map(c=>{const original=S.get('consumptions',c.source);return [U.text(c.id),U.text(c.customer||original?.customer),U.text(c.sourceTreatment||c.source),U.text((c.allocations||[]).filter(a=>rows.some(b=>b.id===a.batch)).map(a=>a.quantity+' '+S.get('skus',a.sku).unit).join('；')),U.text(c.confirmed||c.time)]})))+contentModule('流转记录',U.tableFor('movements',S.data.movements.filter(x=>rows.some(b=>b.id===x.batch)),false)),null,null,1120);
  };
})();

(() => {
  const S=PCModules['supply-chain'],U=S.ui,{must,copy,round}=S,{f,req,ref}=S;
  function rowsForm(defs,row,i,group){const prefix=group+'-'+i+'-';return U.form(defs.map(x=>({...x,key:prefix+x.key})),Object.fromEntries(Object.entries(row).map(([k,v])=>[prefix+k,v]))).replaceAll(/name="[^"]+"/g,x=>'onchange="PCModules[&quot;supply-chain&quot;].businessChange()" '+x)}
  function readRows(el,m,group){(m[group]||[]).forEach((row,i)=>el.querySelectorAll('input[name],select[name],textarea[name]').forEach(c=>{const prefix=group+'-'+i+'-';if(c.name.startsWith(prefix))row[c.name.slice(prefix.length)]=c.type==='checkbox'?c.checked:c.type==='number'?(c.value===''?'':Number(c.value)):c.value}))}
  function simple(title,defs,m,fn,width=560,label='确认'){U.open(title,U.form(defs,m),r=>{U.validate(defs,r);fn(r);U.saved()},m,width,label)}
  function change(){U.collect();const item=U.top(),m=item.model;
    if(m.lines&&m.operation==='purchase')for(const row of m.lines){
      if(row.sku!==row.previousSku){const k=S.get('skus',row.sku);if(k){row.unit=k.purchaseUnit||k.unit;row.price=round(k.cost*S.unitFactor(k.id,row.unit));row.previousUnit=row.unit;row.previousSku=row.sku}}
      else if(row.unit&&row.unit!==row.previousUnit&&row.previousUnit){try{row.price=round(row.price*S.unitFactor(row.sku,row.unit)/S.unitFactor(row.sku,row.previousUnit));row.quantity=round(row.quantity*S.unitFactor(row.sku,row.previousUnit)/S.unitFactor(row.sku,row.unit));row.previousUnit=row.unit}catch{}}
    }U.redraw();
  }
  function addRow(group){U.collect();const m=U.top().model;const sample=m[group].at(-1);m[group].push(m.operation==='purchase'?{sku:'',unit:'',quantity:1,price:0}:m.operation==='receipt'?{...copy(sample),quantity:0,delivered:0,batch:'',udi:'',codes:'',reason:''}:{...copy(sample)});U.redraw()}
  function removeRow(group,index){U.collect();const rows=U.top().model[group];must(rows.length>1,'至少保留一项明细');rows.splice(index,1);U.redraw()}
  function purchase(id,application){
    const old=S.get('purchases',id),a=S.get('applications',application),m={id:old?.id||'',supplier:old?.supplier||'',store:old?.store||a?.store||'',delivery:old?.delivery||S.day(3),note:old?.note||'',application:application||'',operation:'purchase',lines:old?copy(S.purchaseLines(old)):a?[{sku:a.sku,unit:S.get('skus',a.sku).unit,quantity:a.quantity,price:S.get('skus',a.sku).cost}]:[{sku:'',unit:'',quantity:1,price:0}]};
    for(const row of m.lines){row.previousSku=row.sku;row.previousUnit=row.unit}
    const defs=[ref('supplier','供应商','suppliers'),ref('store','收货机构','stores'),req('delivery','计划到货','date'),f('note','采购说明','textarea')];
    U.open(old?'修改采购申请':'新建多明细采购订单',r=>U.form(defs,r)+r.lines.map((l,i)=>contentModule('采购明细 '+(i+1),rowsForm([ref('sku','采购物料','skus'),f('unit','采购单位','select',S.unitsFor(l.sku),true),req('quantity','采购数量','number'),req('price','当前单位单价（元）','number')],l,i,'lines'),U.link('移除此项','businessRemoveRow','lines',i))).join('')+U.button('添加采购明细','businessAddRow',['lines']),r=>{U.validate(defs,r);S.savePurchase(r);U.saved('采购单已提交审核')},m,1120,'提交审核');U.top().read=(el,m)=>readRows(el,m,'lines');
  }
  function receive(id){
    const po=S.get('purchases',id),m={deliveryNo:'',invoiceNo:'',invoiceAmount:'',operation:'receipt',lines:S.purchaseLines(po).filter(l=>(l.received||0)<l.quantity).map(l=>({line:l.id,sku:l.sku,quantity:round(l.quantity-(l.received||0)),delivered:round(l.quantity-(l.received||0)),unit:l.unit,batch:'',produced:'',expiry:'',warehouse:'',udi:'',codes:'',boxCode:'',temperature:'',quality:'合格',reason:''}))};
    const defs=[req('deliveryNo','本次送货单号'),f('invoiceNo','关联发票号（可后补）'),f('invoiceAmount','本次发票金额（元）','number')];
    U.open('分批到货验收',r=>kv({'采购订单':U.text(po.id),'供应商':U.text(U.names('suppliers',po.supplier)),'收货机构':U.text(U.names('stores',po.store))})+U.form(defs,r)+r.lines.map((l,i)=>{const k=S.get('skus',l.sku);return contentModule(k.name+' / 本次批次 '+(i+1),rowsForm([f('line','采购明细','select',S.purchaseLines(po).map(x=>[x.id,U.names('skus',x.sku)]),true),f('unit','本次单位','select',S.unitsFor(l.sku),true),req('delivered','送达数量','number'),req('quantity','接收数量','number'),req('batch','生产批号'),req('produced','生产日期','date'),req('expiry','有效期','date'),f('warehouse','入库实物库位','select',S.data.warehouses.filter(w=>w.store===po.store&&w.type!=='虚拟库位'&&w.status==='启用').map(w=>[w.id,w.name]),true),f('quality','验收质量','select',['合格','待确认'],true),...(k.cold?[req('temperature','到货交接温度（℃）','number')]:[]),...(k.udiRequired?[f('udi','批次 UDI'),f('codes','单支追溯码（每行一码）','textarea')]:[]),f('reason','差异 / 拒收说明','textarea')],l,i,'lines'),U.link('移除此批','businessRemoveRow','lines',i))}).join('')+U.button('增加到货批次','businessAddRow',['lines']),r=>{U.validate(defs,r);for(const l of r.lines){must(l.quantity!==''&&l.delivered!=='','请填写到货数量');l.sku=S.purchaseLines(po).find(x=>x.id===l.line)?.sku}S.purchaseReceive(id,r);U.saved('本次验收已入账，剩余订单可继续收货')},m,1120,'确认本次验收');U.top().read=(el,m)=>{readRows(el,m,'lines');for(const l of m.lines){const line=S.purchaseLines(po).find(x=>x.id===l.line);if(line&&line.sku!==l.sku){l.sku=line.sku;l.unit=line.unit;l.quantity=0;l.delivered=0}}};
  }
  function transferCreate(){const defs=[ref('batch','调出批次','batches'),ref('to','接收机构','stores'),req('sendQuantity','发出数量','number'),ref('sendUnit','发出单位','unitNames'),req('reason','调拨原因','textarea')],m={batch:'',to:'',sendQuantity:'',sendUnit:'',reason:''};simple('调拨申请',defs,m,r=>S.createTransfer(r),860,'提交审核')}
  function transfer(id,action){
    const t=S.get('transfers',id),b=S.get('batches',t.batch),k=S.get('skus',b.sku);
    if(action==='receive'){const m={warehouse:'',receiveUnit:k.stockUnit,receiveQuantity:0,damaged:0,missing:0,temperature:'',reason:''};simple('调拨分批与差异收货',[f('warehouse','收货实物库位','select',S.data.warehouses.filter(w=>w.store===t.to&&w.type!=='虚拟库位').map(w=>[w.id,w.name]),true),f('receiveUnit','接收单位','select',S.unitsFor(k.id),true),req('receiveQuantity','合格接收量','number'),req('damaged','破损隔离量','number'),req('missing','本次确认短少','number'),...(k.cold?[req('temperature','交接温度（℃）','number')]:[]),f('reason','差异原因 / 交接说明','textarea')],m,r=>S.transferAction(id,action,r),860,'确认本次收货');return}
    if(action==='resolve')return simple('调拨差异责任认定',[f('result','处理结果','select',['确认运输损失','继续追货'],true),req('responsible','责任方'),req('reason','认定与处理依据','textarea')],{result:'继续追货',responsible:'',reason:''},r=>S.transferAction(id,action,r),560);
    if(action==='ship')return simple('调拨发运登记',[req('carrier','承运 / 交接人'),req('voucher','发运凭据号'),...(k.cold?[req('temperature','发出温度（℃）','number')]:[])],{carrier:'',voucher:'',temperature:''},r=>S.transferAction(id,action,r),560,'确认发货');
    if(action==='reject')return simple('调拨拒收',[req('reason','拒收原因','textarea')],{reason:''},r=>S.transferAction(id,action,r));
    U.confirm('确认调拨处理',action==='return'?'退回实物进入质量待确认，验收后才能放行。':'审批将占用对应库存，发运时转为在途。',()=>S.transferAction(id,action));
  }
  function reconciliation(){const defs=[ref('supplier','供应商','suppliers'),req('start','开始日期','date'),req('end','结束日期','date'),f('orders','采购单','multi',[]),req('statement','供应商对账凭据'),req('supplierAmount','供应商确认截止日余额（元）','number'),f('reason','差异处理依据','textarea')],m={supplier:'',start:S.today().slice(0,7)+'-01',end:S.today(),orders:[],statement:'',supplierAmount:'',reason:''};U.open('供应商对账',r=>{defs.find(x=>x.key==='orders').options=S.data.purchases.filter(p=>p.supplier===r.supplier&&(p.receivedAmount||p.status==='已入库')).map(p=>[p.id,p.id+' / 应付 '+S.purchaseBalance(p.id).balance]);return U.form(defs,r).replace('name=\"supplier\"','onchange=\"PCModules[&quot;supply-chain&quot;].businessChange()\" name=\"supplier\"')},r=>{U.validate(defs,r);S.saveReconciliation(r);U.saved('对账结果已登记，差异保留待处理')},m,860,'生成对账单')}
  function sellCard(){simple('售卡与患者权益登记',[ref('card','卡项','cards'),ref('customerId','持卡患者','patients'),ref('store','售卡机构','stores')],{card:'',customerId:'',store:''},r=>S.sellCard(r),560,'登记售卡')}
  function cardEvent(id){simple('卡项权益处理',[f('kind','处理事项','select',['冻结','解冻','延期','授权代用','退还剩余权益'],true),ref('patient','代用患者','patients',false),f('expires','新的有效期','date'),f('voucher','原系统退款凭据'),req('reason','处理依据','textarea')],{kind:'冻结',patient:'',expires:'',voucher:'',reason:''},r=>S.cardEvent(id,r),860,'确认处理')}
  const previousActions=S.extraActions;
  S.extraActions=(type,r)=>{
    if(type==='purchases'){let out=U.link('详情','detail',type,r.id);if(['待审批','已驳回'].includes(r.status))out+=U.link('修改','businessPurchase',r.id);if(r.status==='待审批')out+=U.link('通过','businessPurchaseReview',r.id,true)+U.link('驳回','businessPurchaseReview',r.id,false);if(['待收货','部分入库'].includes(r.status))out+=U.link('到货验收','receive',r.id)+U.link('关闭剩余','businessPurchaseClose',r.id);return out}
    if(type==='transfers'){let out=U.link('详情','detail',type,r.id);const acts={'待审批':[['通过','approve'],['驳回','deny']],'待发货':[['发货','ship']],'在途':[['收货','receive'],['拒收','reject']],'部分收货':[['继续收货','receive'],['拒收余货','reject']],'差异待处理':[['认定差异','resolve']],'退回在途':[['退回签收','return']]};return out+(acts[r.status]||[]).map(([label,a])=>U.link(label,'transfer',r.id,a)).join('')}
    if(type==='cardSales')return U.link('详情','detail',type,r.id)+U.link('权益处理','businessCardEvent',r.id);
    if(type==='purchaseReturns'&&r.status==='待审批')return U.link('详情','detail',type,r.id)+U.link('确认退货','businessPurchaseReturn',r.id)+U.link('驳回','workflow',type,r.id,'deny');
    if(type==='payments'&&r.status==='待付款')return U.link('详情','detail',type,r.id)+U.link('登记付款','businessPayment',r.id);
    return previousActions?.(type,r);
  };
  const previousCell=S.extraCell;
  S.extraCell=(r,key,type)=>{
    if(type==='purchases'){
      const lines=S.purchaseLines(r),balance=S.purchaseBalance(r.id);
      if(key==='sku')return lines.map(l=>U.names('skus',l.sku)).join('；');
      if(key==='quantity')return lines.map(l=>l.quantity+' '+l.unit).join('；');
      if(key==='baseQuantity')return lines.map(l=>(l.conversion?.baseQuantity??S.convertUnits(l.sku,l.quantity,l.unit))+' '+S.get('skus',l.sku).unit).join('；');
      if(['received','returns','paid','balance','net'].includes(key))return balance[key];
    }
    if(type==='cardSales'&&key==='balance')return round(r.amount-r.recognized-(r.refunded||0));
    return previousCell?.(r,key,type);
  };
  S.columns.purchases=S.columns.purchases.filter(x=>!x.startsWith('unit:')).concat(['received:已入库金额','returns:退货抵扣','paid:已付款','balance:未付 / 待收回']);
  S.columns.purchaseReceipts=['id:验收入库单','purchase:采购订单','supplier:供应商','store:机构','deliveryNo:送货单','amount:本次入库金额','invoiceNo:发票号','match:三单核对','time:验收时间','status:状态'];
  S.columns.purchaseReconciliations=['id:对账单号','supplier:供应商','start:起始日期','end:截止日期','amount:账面应付余额','supplierAmount:供应商确认金额','difference:差异','status:状态'];
  S.columns.cardEvents=['cardSale:售卡记录','kind:处理事项','amount:退款登记金额','reason:依据','time:办理时间','status:状态'];
  S.pages['sc-purchases'].tabs.find(t=>t.key==='receipts').entity='purchaseReceipts';S.pages['sc-purchases'].tabs.find(t=>t.key==='receipts').filter=null;
  S.pages['sc-purchases'].tabs.find(t=>t.key==='accept').filter=r=>['待收货','部分入库','已入库','已关闭'].includes(r.status);
  S.pages['sc-procurement'].tabs.find(t=>t.key==='check').entity='purchaseReconciliations';Object.assign(S.pages['sc-procurement'].tabs.find(t=>t.key==='check'),{filter:null,readonly:false,create:'reconciliation'});
  S.pages['sc-finance'].tabs.find(t=>t.key==='payable').filter=r=>S.purchaseBalance(r.id).received>0;
  S.pages['sc-cards'].tabs.push({key:'events',title:'权益售后记录',entity:'cardEvents',readonly:true});
  S.pages['sc-transfers'].tabs.find(t=>t.key==='transit').filter=r=>['待发货','在途','部分收货','差异待处理','退回在途'].includes(r.status);
  S.pages['sc-inventory'].tabs.find(t=>t.key==='transit').filter=r=>['在途','部分收货','差异待处理','退回在途'].includes(r.status);
  U.storeEntities.add('purchaseReceipts');U.storeEntities.add('purchaseReconciliations');
  S.details.purchaseReconciliations=id=>{const r=S.get('purchaseReconciliations',id);U.open('供应商期间对账详情',kv({'期间':U.text(r.start+' 至 '+r.end),'凭据':U.text(r.statement),'差异':U.text(r.difference),'处理依据':U.text(r.reason)})+table(['采购单','期初未付','期间入库','期间退货','期间付款','期末未付'],r.lines.map(l=>[U.text(l.purchase),money(l.opening),money(l.receivedDuring),money(l.returnedDuring),money(l.paidDuring),money(l.balance)])),null,null,1120)};
  S.details.purchaseReceipts=id=>{const r=S.get('purchaseReceipts',id);U.open('到货验收详情',kv({'验收单':U.text(r.id),'采购单':U.text(r.purchase),'送货单':U.text(r.deliveryNo),'发票':U.text(r.invoiceNo),'三单核对':U.text(r.match)})+table(['物料','生产批号','送达基本量','接收基本量','单位','质量','入库金额','差异说明'],r.lines.map(l=>[U.text(U.names('skus',l.sku)),U.text(l.batch),l.baseDelivered,l.baseQuantity,U.text(l.baseUnit),U.text(l.quality),money(l.amount),U.text(l.reason)])),null,null,1120)};
  Object.assign(S.creators,{purchases:()=>purchase(),transfers:transferCreate,reconciliation,'sell-card':sellCard});
  Object.assign(S,{businessChange:change,businessAddRow:addRow,businessRemoveRow:removeRow,businessPurchase:purchase,receive,transfer,purchaseFrom:id=>purchase(null,id),businessCardEvent:cardEvent,
    businessPurchaseReview:(id,approved)=>simple(approved?'采购审核通过':'采购审核驳回',[req('note','审核意见','textarea')],{note:''},r=>S.approvePurchase(id,approved,r.note)),
    businessPurchaseClose:id=>simple('关闭采购剩余量',[req('note','关闭依据','textarea')],{note:''},r=>S.closePurchase(id,r.note)),
    businessPurchaseReturn:id=>simple('供应商确认退货',[req('voucher','供应商确认 / 退货凭据'),req('note','退货及抵款依据','textarea')],{voucher:'',note:''},r=>S.confirmPurchaseReturn(id,r)),
    businessPayment:id=>simple('登记实际付款',[req('voucher','付款凭据号'),req('paidAt','实际付款日期','date')],{voucher:'',paidAt:S.today()},r=>S.recordPayment(id,r))
  });
})();
