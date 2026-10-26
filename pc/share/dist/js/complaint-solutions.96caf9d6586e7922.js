/* Complaint solution refund editor, drafts and validation, loaded when the editor opens. */
window.PCModules['complaint-solutions']={create({clone,solutionOrders,savedRefundOrders,refundEntries,refundKey,centsText,getRecord,SOLUTION_METHODS,toCents,refundAvailable,SOLUTION_PRODUCTS,PAYOUT_METHODS,validHandlingFile,getRecords,selectedRefundEntries,esc,centsMoney,input,link,field,empty,solutionTotals,renderSolutionFields}){
  const knownQuantity=value=>Number.isSafeInteger(value)&&value>=0;
  function parseQuantity(value){const text=String(value??'').trim(),number=Number(text);return /^\d+$/.test(text)&&knownQuantity(number)?number:null}
  function refundQuantityState(order,item){
    const purchased=knownQuantity(item.quantity)?item.quantity:null,consumed=knownQuantity(item.consumedQuantity)?item.consumedQuantity:null,refunded=knownQuantity(item.refundedQuantity)?item.refundedQuantity:null;
    const groups=getRecords().filter(record=>record.id!==getRecord().id).flatMap(record=>savedRefundOrders(record.customerSolution)).filter(group=>group.orderId===order.id),other=groups.flatMap(group=>group.refundItems||[]).filter(row=>row.itemId===item.id);
    // Old monetary-only plans never imply a quantity; editing this plan excludes its own reservation.
    const reserved=!groups.some(group=>group.refund>0&&!group.refundItems?.length)&&other.every(row=>knownQuantity(row.refundQuantity))?other.reduce((sum,row)=>sum+row.refundQuantity,0):null;
    const remaining=[purchased,consumed,refunded,reserved].every(knownQuantity)?purchased-consumed-refunded-reserved:null;
    return {purchased,consumed,refunded,reserved,available:knownQuantity(remaining)?remaining:null};
  }
  function selectFullRefund(p,row){p.refundAmounts[row.key]=centsText(refundAvailable(row.order,row.item));p.refundQuantities[row.key]=String(refundQuantityState(row.order,row.item).available??'')}
  function remainingQuantity(p,row){
    const available=refundQuantityState(row.order,row.item).available;if(available===null)return '—';
    if(!Object.hasOwn(p.refundAmounts,row.key))return String(available);
    const quantity=parseQuantity(p.refundQuantities[row.key]);
    return quantity===null||quantity<Math.min(1,available)||quantity>available?'—':String(available-quantity);
  }
  function quantityControl(p,row){
    const {order,item,key,field}=row,selected=Object.hasOwn(p.refundAmounts,key),available=refundQuantityState(order,item).available,full=toCents(p.refundAmounts[key])===refundAvailable(order,item);
    return input('solution-'+field+'-quantity',p.refundQuantities[key]??'',full?'点击全额':'填写数量','number',`data-refund-quantity="${esc(key)}" aria-label="${esc(item.name)}本次退款数量（订单 ${esc(order.id)}）" min="${Math.min(1,available??0)}" max="${available??0}" step="1" inputmode="numeric" ${selected&&available!==null?'':'disabled'} ${full?'readonly':''}`);
  }
  function updateRefundQuantities(p,root){root.querySelectorAll('[data-refund-remaining]').forEach(el=>{const row=refundEntries().find(row=>row.key===el.dataset.refundRemaining);if(row)el.textContent=remainingQuantity(p,row)})}
  function syncRefund(el,p,root){
    const refresh=renderSolutionFields;
    if(el.hasAttribute('data-refund-all')){
      for(const row of selectedRefundEntries(p)){if(el.checked&&refundAvailable(row.order,row.item)>0){if(!Object.hasOwn(p.refundAmounts,row.key))selectFullRefund(p,row)}else{delete p.refundAmounts[row.key];delete p.refundQuantities[row.key]}}
      refresh();root.querySelector('[data-refund-all]')?.focus({preventScroll:true});return true;
    }
    if(el.hasAttribute('data-refund-item')){
      const key=el.dataset.refundItem,row=refundEntries().find(row=>row.key===key);if(!row)return true;
      if(el.checked)selectFullRefund(p,row);else{delete p.refundAmounts[key];delete p.refundQuantities[key]}
      refresh();root.querySelector('[data-refund-item="'+key+'"]')?.focus({preventScroll:true});return true;
    }
    if(!el.hasAttribute('data-refund-amount')&&!el.hasAttribute('data-refund-quantity'))return false;
    const amount=el.hasAttribute('data-refund-amount'),key=amount?el.dataset.refundAmount:el.dataset.refundQuantity,row=refundEntries().find(row=>row.key===key);if(!row)return true;
    if(amount){
      p.refundAmounts[key]=el.value;
      if(toCents(el.value)===refundAvailable(row.order,row.item))p.refundQuantities[key]=String(refundQuantityState(row.order,row.item).available??'');
      root.querySelector('[data-refund-quantity-control="'+key+'"]').innerHTML=quantityControl(p,row);
      root.querySelector('#uc-error-solution-'+row.field+'-quantity').textContent='';
    }else p.refundQuantities[key]=el.value;
    el.removeAttribute('aria-invalid');root.querySelector('#uc-error-'+el.id.slice(3)).textContent='';root.querySelector('#uc-error-solution-refundItems').textContent='';return true;
  }
  function solutionDraft(saved){
    const p=saved||{},available=solutionOrders(),groups=savedRefundOrders(p),keys=new Set(refundEntries().map(row=>row.key));
    const refundOrderIds=available.map(order=>order.id);
    return {methods:(p.handlingMethods||[]).filter(key=>Object.hasOwn(SOLUTION_METHODS,key)),refundOrderIds:[...new Set(refundOrderIds)],refundAmounts:Object.fromEntries(groups.flatMap(order=>(order.refundItems||[]).map(item=>[refundKey(order.orderId,item.itemId),centsText(item.amount)])).filter(([key])=>keys.has(key))),refundQuantities:Object.fromEntries(groups.flatMap(order=>(order.refundItems||[]).filter(item=>Number.isSafeInteger(item.refundQuantity)).map(item=>[refundKey(order.orderId,item.itemId),String(item.refundQuantity)])).filter(([key])=>keys.has(key))),compensation:p.compensation?centsText(p.compensation):'',compensationReason:p.compensationReason||'',exchangeItems:(p.exchangeItems||[]).map(i=>({productId:i.productId,quantity:String(i.quantity)})),delivery:{name:p.delivery?.name||'',phone:p.delivery?.phone||'',address:p.delivery?.address||''},payout:{method:p.payout?.method||'bank',name:p.payout?.name||'',account:p.payout?.account||'',bank:p.payout?.bank||''},attachments:clone(p.attachments||[])};
  }
  function validateCustomerSolution(p){const errors=[],add=(key,message)=>errors.push(['solution-'+key,message]),has=key=>p.methods.includes(key),funded=has('refund')||has('compensation');const value={detailsVersion:5,handlingMethods:clone(p.methods),refund:0,compensation:0,exchangeItems:[],attachments:clone(p.attachments||[])};
    if(!p.methods.length||p.methods.some(key=>!Object.hasOwn(SOLUTION_METHODS,key)))errors.push(['solutionMethods','请选择有效的处理方式']);
    if(has('refund')){
      const linked=solutionOrders(),entries=refundEntries(),groups=new Map(),selected=new Set(p.refundOrderIds);
      if(!selected.size)add('refundOrders','请选择退款订单');
      if(p.refundOrderIds.some(id=>!linked.some(order=>order.id===id)))add('refundOrders','退款订单不属于当前客户');
      for(const [key,text]of Object.entries(p.refundAmounts)){
        const row=entries.find(row=>row.key===key),amount=toCents(text);
        if(!row){add('refundItems','退款项目不属于当前客户订单');continue}
        if(!selected.has(row.order.id))continue;
        const {order,item,field}=row,state=refundQuantityState(order,item),quantity=parseQuantity(p.refundQuantities?.[key]);
        if(state.available===null)add(field+'-quantity','数量记录不完整，请先核对项目消费和退款数量');
        else if(quantity===null||quantity<Math.min(1,state.available)||quantity>state.available)add(field+'-quantity','退款数量须为 '+Math.min(1,state.available)+' 至 '+state.available+' 的整数');
        else if(amount===refundAvailable(order,item)&&quantity!==state.available)add(field+'-quantity','全额退款须退回全部剩余数量，请点击全额');
        if(amount===null||amount<=0)add(field,'退款金额须大于 0，最多两位小数');
        else if(amount>refundAvailable(order,item))add(field,'退款金额超过该项目可退金额');
        else{if(!groups.has(order.id))groups.set(order.id,{orderId:order.id,store:order.store,customerName:order.name,refund:0,refundItems:[]});const group=groups.get(order.id);group.refund+=amount;group.refundItems.push({itemId:item.id,name:item.name,quantity:item.quantity,consumedQuantity:state.consumed,refundedQuantity:state.refunded,reservedQuantity:state.reserved,remainingBefore:state.available,refundQuantity:quantity,remainingAfter:state.available===null||quantity===null?null:state.available-quantity,paid:item.paid,amount})}
      }
      if(!groups.size)add('refundItems','请选择退款项目并填写有效金额和数量');
      value.refundOrders=[...groups.values()];value.refund=value.refundOrders.reduce((sum,group)=>sum+group.refund,0);
      for(const group of value.refundOrders){const order=linked.find(o=>o.id===group.orderId);if(group.refund>refundAvailable(order))add('refundItems','订单 '+order.id+' 的退款合计超过可退金额')}
    }
    if(has('compensation')){const amount=toCents(p.compensation);if(amount===null||amount<=0)add('compensation','赔偿金额须大于 0，最多两位小数');if(!p.compensationReason.trim()||p.compensationReason.length>1000)add('compensationReason','请填写赔偿原因备注（最多 1000 字）');value.compensation=amount||0;value.compensationReason=p.compensationReason.trim()}
    if(has('exchange')){if(!p.exchangeItems.length||p.exchangeItems.length>20)add('exchangeItems','请选择 1 至 20 项置换商品');value.exchangeItems=p.exchangeItems.map(row=>{const product=SOLUTION_PRODUCTS.find(i=>i.id===row.productId),quantity=Number(row.quantity);if(!product||!Number.isInteger(quantity)||quantity<1||quantity>9999)add('exchangeItems','请选择商品，数量须为 1 至 9999 的整数');return {...product,productId:row.productId,quantity}});const delivery=Object.fromEntries(Object.entries(p.delivery).map(([key,v])=>[key,v.trim()]));if(!delivery.name||delivery.name.length>50)add('delivery-name','请填写收货姓名（最多 50 字）');if(!/^[+\d][\d\s()-]{5,29}$/.test(delivery.phone))add('delivery-phone','请填写有效的收货电话');if(!delivery.address||delivery.address.length>300)add('delivery-address','请填写完整收货地址（最多 300 字）');value.delivery=delivery}
    if(funded){const payout=Object.fromEntries(Object.entries(p.payout).map(([key,v])=>[key,v.trim()]));if(!Object.hasOwn(PAYOUT_METHODS,payout.method))add('payout-account','请选择有效的收款方式');if(!payout.name||payout.name.length>50)add('payout-name',payout.method==='bank'?'请填写开户姓名':'请填写收款人姓名');if(payout.method==='bank'){if(!/^\d{12,30}$/.test(payout.account))add('payout-account','请填写 12 至 30 位银行卡号');if(!payout.bank||payout.bank.length>100)add('payout-bank','请填写开户银行及支行')}else{payout.bank='';if(payout.account.length<3||payout.account.length>100)add('payout-account','请填写有效的收款账号')}value.payout=payout}
    if(value.attachments.length>4||value.attachments.some(file=>!validHandlingFile(file)||file.size>5*1024*1024))add('attachments','方案附件最多 4 个，每个不超过 5MB，请使用支持的格式');
    if(!Number.isSafeInteger(value.refund+value.compensation))add('compensation','申请金额超出有效范围');return {errors,value};
  }
  function refundEditor(p){
    const available=solutionOrders(),entries=selectedRefundEntries(p),availableRows=entries.filter(row=>refundAvailable(row.order,row.item)>0),count=entries.filter(row=>Object.hasOwn(p.refundAmounts,row.key)).length;
    const projectRow=row=>{
      const {order,item,key,field}=row,selected=Object.hasOwn(p.refundAmounts,key),balance=refundAvailable(order,item),state=refundQuantityState(order,item),show=value=>value??'—';
      return `<tr><td><input type="checkbox" data-refund-item="${esc(key)}" aria-label="选择退款项目 ${esc(item.name)}（订单 ${esc(order.id)}）" ${selected?'checked':''} ${balance?'':'disabled'}></td><td>${esc(item.name)}<span class="pc-block uc-block uc-muted">购买 ${show(state.purchased)} · 已消费 ${show(state.consumed)}</span><span class="pc-block uc-block uc-muted">已退 ${show(state.refunded)} · 可退数量 ${show(state.available)}</span>${state.reserved?`<span class="pc-block uc-block uc-muted">其他方案占用 ${state.reserved}</span>`:''}${state.available===null?'<span class="pc-block uc-block uc-muted">数量记录待核对</span>':''}</td><td>${centsMoney(item.paid)}</td><td>${centsMoney(balance)}</td><td><div class="uc-refund-amount">${input('solution-'+field,p.refundAmounts[key]||'','填写金额','number',`data-refund-amount="${esc(key)}" aria-label="${esc(item.name)}本次退款金额（订单 ${esc(order.id)}）" min="0.01" max="${centsText(balance)}" step="0.01" inputmode="decimal" ${selected?'':'disabled'}`)}${link('全额','solution-full-refund',`data-item="${esc(key)}" ${selected&&balance?'':'disabled'}`)}</div><div class="uc-error" id="uc-error-solution-${field}"></div></td><td><div data-refund-quantity-control="${esc(key)}">${quantityControl(p,row)}</div><div class="uc-error" id="uc-error-solution-${field}-quantity"></div></td><td><strong data-refund-remaining="${esc(key)}" aria-live="polite">${remainingQuantity(p,row)}</strong></td></tr>`;
    };
    const selectedCount=availableRows.filter(row=>Object.hasOwn(p.refundAmounts,row.key)).length;
    const selectAll=`<input type="checkbox" data-refund-all aria-label="全选退款项目" data-pc-indeterminate="${selectedCount>0&&selectedCount<availableRows.length}" ${availableRows.length&&selectedCount===availableRows.length?'checked':''} ${availableRows.length?'':'disabled'}>`;
    const groups=available.filter(order=>p.refundOrderIds.includes(order.id)).map(order=>{
      const rows=entries.filter(row=>row.order.id===order.id);
      return `<tr data-pc-full-row><td colspan="7"><div class="uc-actions"><strong>订单 ${esc(order.id)}</strong><span class="uc-muted">${esc(order.store)} · ${esc(order.name)}</span></div></td></tr>${rows.map(projectRow).join('')}`;
    }).join('');
    const summary=`<tr data-pc-full-row><td colspan="7"><div class="uc-solution-subtotal"><span>已选 ${count} 个项目</span><span>退款合计 <strong data-solution-total="refund">${centsMoney(solutionTotals(p).refund)}</strong></span></div></td></tr>`;
    return `<div class="uc-solution-projects" data-field="solution-refundItems"><div class="table-wrap uc-table-wrap"><table data-pc-align="left" data-pc-min-height="0" aria-label="订单退款项目"><colgroup><col style="width:48px"><col><col style="width:95px"><col style="width:95px"><col style="width:170px"><col style="width:110px"><col style="width:110px"></colgroup><thead><tr><th>${selectAll}</th><th data-pc-min-width="180">项目名称</th><th>实付金额</th><th>可退金额</th><th>本次退款（元）</th><th>退款数量</th><th>退款后剩余</th></tr></thead><tbody>${groups?groups+summary:`<tr><td colspan="7">${empty('暂无可退款的客户订单')}</td></tr>`}</tbody></table></div><div class="uc-error" id="uc-error-solution-refundItems"></div><div class="uc-error" id="uc-error-solution-refundOrders"></div></div>`;

  }
  return {solutionDraft,validateCustomerSolution,refundEditor,refundQuantityState,selectFullRefund,syncRefund,updateRefundQuantities};
}};
