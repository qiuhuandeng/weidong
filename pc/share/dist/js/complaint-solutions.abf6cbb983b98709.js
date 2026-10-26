/* Complaint solution drafts and validation, loaded when the editor opens. */
window.PCModules['complaint-solutions']={create({clone,solutionOrders,savedRefundOrders,refundEntries,refundKey,centsText,getRecord,SOLUTION_METHODS,refundStores,refundStaff,toCents,refundAvailable,SOLUTION_PRODUCTS,PAYOUT_METHODS,validHandlingFile}){
  function solutionDraft(saved){
    const p=saved||{},available=solutionOrders(),groups=savedRefundOrders(p),keys=new Set(refundEntries().map(row=>row.key));
    const refundOrderIds=(groups.length?groups.map(group=>group.orderId):[(getRecord().linked||[]).find(link=>available.some(order=>order.id===link.id))?.id||available[0]?.id]).filter(id=>available.some(order=>order.id===id));
    return {methods:(p.handlingMethods||[]).filter(key=>Object.hasOwn(SOLUTION_METHODS,key)),refundOrderIds:[...new Set(refundOrderIds)],refundDetails:Object.fromEntries(available.map(order=>{const saved=groups.find(group=>group.orderId===order.id)||{};return [order.id,{store:saved.refundStore||p.refundStore||order.store,person:saved.performanceId||p.performanceId||'',reason:saved.refundReason||p.refundReason||''}]})),refundAmounts:Object.fromEntries(groups.flatMap(order=>(order.refundItems||[]).map(item=>[refundKey(order.orderId,item.itemId),centsText(item.amount)])).filter(([key])=>keys.has(key))),compensation:p.compensation?centsText(p.compensation):'',compensationReason:p.compensationReason||'',exchangeItems:(p.exchangeItems||[]).map(i=>({productId:i.productId,quantity:String(i.quantity)})),delivery:{name:p.delivery?.name||'',phone:p.delivery?.phone||'',address:p.delivery?.address||''},payout:{method:p.payout?.method||'bank',name:p.payout?.name||'',account:p.payout?.account||'',bank:p.payout?.bank||''},attachments:clone(p.attachments||[])};
  }
  function validateCustomerSolution(p){const errors=[],add=(key,message)=>errors.push(['solution-'+key,message]),has=key=>p.methods.includes(key),funded=has('refund')||has('compensation');const value={detailsVersion:4,handlingMethods:clone(p.methods),refund:0,compensation:0,exchangeItems:[],attachments:clone(p.attachments||[])};
    if(!p.methods.length||p.methods.some(key=>!Object.hasOwn(SOLUTION_METHODS,key)))errors.push(['solutionMethods','请选择有效的处理方式']);
    if(has('refund')){
      const linked=solutionOrders(),entries=refundEntries(),groups=new Map(),selected=new Set(p.refundOrderIds);
      if(!selected.size)add('refundOrders','请选择退款订单');
      if(p.refundOrderIds.some(id=>!linked.some(order=>order.id===id)))add('refundOrders','退款订单不属于当前客户');
      for(const [key,text]of Object.entries(p.refundAmounts)){
        const row=entries.find(row=>row.key===key),amount=toCents(text);
        if(!row){add('refundItems','退款项目不属于当前客户订单');continue}
        if(!selected.has(row.order.id))continue;
        const {order,item,field}=row;
        if(amount===null||amount<=0)add(field,'退款金额须大于 0，最多两位小数');
        else if(amount>refundAvailable(order,item))add(field,'退款金额超过该项目可退金额');
        else{if(!groups.has(order.id))groups.set(order.id,{orderId:order.id,store:order.store,customerName:order.name,refund:0,refundItems:[]});const group=groups.get(order.id);group.refund+=amount;group.refundItems.push({itemId:item.id,name:item.name,quantity:item.quantity,paid:item.paid,amount})}
      }
      for(const id of selected){const index=linked.findIndex(order=>order.id===id);if(index<0)continue;const group=groups.get(id),meta=p.refundDetails[id]||{},reason=String(meta.reason||'').trim();if(!group)add('refundItems-'+index,'请选择退款项目并填写有效金额');if(!refundStores().includes(meta.store))add('refund-store-'+index,'请选择退款所属门店');if(!refundStaff(meta.store).includes(meta.person))add('refund-person-'+index,'请选择退款门店的业绩归属人员');if(!reason||reason.length>1000)add('refund-reason-'+index,'请填写退款原因备注（最多 1000 字）');if(group)Object.assign(group,{refundStore:meta.store,performanceId:meta.person,refundReason:reason})}
      value.refundOrders=[...groups.values()];value.refund=value.refundOrders.reduce((sum,group)=>sum+group.refund,0);
      for(const group of value.refundOrders){const order=linked.find(o=>o.id===group.orderId);if(group.refund>refundAvailable(order))add('refundItems','订单 '+order.id+' 的退款合计超过可退金额')}
    }
    if(has('compensation')){const amount=toCents(p.compensation);if(amount===null||amount<=0)add('compensation','赔偿金额须大于 0，最多两位小数');if(!p.compensationReason.trim()||p.compensationReason.length>1000)add('compensationReason','请填写赔偿原因备注（最多 1000 字）');value.compensation=amount||0;value.compensationReason=p.compensationReason.trim()}
    if(has('exchange')){if(!p.exchangeItems.length||p.exchangeItems.length>20)add('exchangeItems','请选择 1 至 20 项置换商品');value.exchangeItems=p.exchangeItems.map(row=>{const product=SOLUTION_PRODUCTS.find(i=>i.id===row.productId),quantity=Number(row.quantity);if(!product||!Number.isInteger(quantity)||quantity<1||quantity>9999)add('exchangeItems','请选择商品，数量须为 1 至 9999 的整数');return {...product,productId:row.productId,quantity}});const delivery=Object.fromEntries(Object.entries(p.delivery).map(([key,v])=>[key,v.trim()]));if(!delivery.name||delivery.name.length>50)add('delivery-name','请填写收货姓名（最多 50 字）');if(!/^[+\d][\d\s()-]{5,29}$/.test(delivery.phone))add('delivery-phone','请填写有效的收货电话');if(!delivery.address||delivery.address.length>300)add('delivery-address','请填写完整收货地址（最多 300 字）');value.delivery=delivery}
    if(funded){const payout=Object.fromEntries(Object.entries(p.payout).map(([key,v])=>[key,v.trim()]));if(!Object.hasOwn(PAYOUT_METHODS,payout.method))add('payout-account','请选择有效的收款方式');if(!payout.name||payout.name.length>50)add('payout-name',payout.method==='bank'?'请填写开户姓名':'请填写收款人姓名');if(payout.method==='bank'){if(!/^\d{12,30}$/.test(payout.account))add('payout-account','请填写 12 至 30 位银行卡号');if(!payout.bank||payout.bank.length>100)add('payout-bank','请填写开户银行及支行')}else{payout.bank='';if(payout.account.length<3||payout.account.length>100)add('payout-account','请填写有效的收款账号')}value.payout=payout}
    if(value.attachments.length>4||value.attachments.some(file=>!validHandlingFile(file)||file.size>5*1024*1024))add('attachments','方案附件最多 4 个，每个不超过 5MB，请使用支持的格式');
    if(!Number.isSafeInteger(value.refund+value.compensation))add('compensation','申请金额超出有效范围');return {errors,value};
  }
  return {solutionDraft,validateCustomerSolution};
}};
