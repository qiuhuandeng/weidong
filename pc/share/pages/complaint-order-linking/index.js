/* Customer verification and order selection; no persistence or cross-module customer imports. */
window.PCModules['complaint-order-linking']={render(){},create({getRecords,getEditor,orders,customerIdOf,CUSTOMER_KEYWORDS,clone,phoneView,section,esc,link,input,btn,empty,tag,listValue,pagination,orderProjects,ACTOR}){
  function orderPickerTitle(e){return (e.orderBindingRequired?'关联客户及订单':e.selectionBaseline!=='[]'?'调整关联订单':'关联订单')+(e.exampleRecord?'（示例）':'')}
  function customerDirectory(){
    const grouped=new Map();
    for(const item of [...orders,...getRecords()]){
      const id=customerIdOf(item);if(!id)continue;
      let customer=grouped.get(id);
      if(!customer){customer={customerId:id,name:item.name||'',phone:item.phone||'',fullPhone:item.fullPhone||'',member:item.member||'',customerWechat:item.customerWechat||'',stores:[]};grouped.set(id,customer)}
      for(const key of ['name','phone','fullPhone','member','customerWechat'])if(!customer[key]&&item[key])customer[key]=item[key];
      if(item.store&&!customer.stores.includes(item.store))customer.stores.push(item.store);
    }
    return [...grouped.values()];
  }
  function matchingCustomers(criteria){
    const key=CUSTOMER_KEYWORDS.some(([value])=>value===criteria.keywordType)?criteria.keywordType:'phone',query=String(criteria.keyword||'').trim().toLowerCase();if(!query||/[*＊•]/.test(query))return [];
    return customerDirectory().filter(customer=>(key==='phone'?[customer.fullPhone,customer.phone]:[customer[key]]).some(value=>String(value||'').toLowerCase().includes(query)));
  }
  function orderPickerState(record,linked=record.linked||[]){
    const orderCustomerId=customerIdOf(record),phone=[record.fullPhone,record.phone].map(value=>String(value||'').trim()).find(value=>/^1\d{10}$/.test(value))||'';
    const customerSearch={keywordType:'phone',keyword:orderCustomerId?'':phone};
    return {multipleOrders:record.orderSelectionMode==='multiple',orderCustomerId,initialCustomerId:orderCustomerId,orderBindingRequired:!orderCustomerId,selectedCustomer:null,customerPage:1,customerPageSize:10,customerSearch,customerFilters:clone(customerSearch),orderPage:1,orderPageSize:10,selection:orderCustomerId?clone(linked):[],selectionBaseline:JSON.stringify(linked)};
  }
  function orderPickerDirty(e){return e.orderCustomerId!==e.initialCustomerId||JSON.stringify(e.selection)!==e.selectionBaseline}
  function orderPickerCustomers(e){return matchingCustomers(e.customerFilters)}
  function orderPickerOrders(e){return e.orderCustomerId?orders.filter(order=>String(order.customerId??'')===e.orderCustomerId):[]}
  function selectPickerCustomer(e,id){
    if(!e.orderBindingRequired)return false;
    const customer=orderPickerCustomers(e).find(item=>item.customerId===id);if(!customer)return false;
    e.selectedCustomer=clone(customer);e.orderCustomerId=customer.customerId;e.selection=[];e.orderPage=1;return true;
  }
  function changePickerCustomer(e){if(!e.orderBindingRequired)return;e.selectedCustomer=null;e.orderCustomerId='';e.selection=[];e.orderPage=1}
  function selectPickerOrder(e,id){
    const order=orderPickerOrders(e).find(o=>o.id===id);if(!order)return false;
    const existing=e.selection.find(item=>item.id===id)||e.draft?.linked.find(item=>item.id===id);
    if(e.multipleOrders){if(e.selection.some(item=>item.id===id))e.selection=e.selection.filter(item=>item.id!==id);else e.selection.push(existing?clone(existing):{id:order.id,wechatId:order.bookingWechatId||''})}else e.selection=[existing?clone(existing):{id:order.id,wechatId:order.bookingWechatId||''}];return true;
  }
  function customerSearchView(e){
    const q=e.customerSearch,matches=orderPickerCustomers(e),label=CUSTOMER_KEYWORDS.find(([key])=>key===q.keywordType)?.[1]||'客户手机';
    e.customerPage=Math.min(e.customerPage,Math.max(1,Math.ceil(matches.length/e.customerPageSize)));const offset=(e.customerPage-1)*e.customerPageSize;
    const search=`<div class="query-module uc-customer-search"><form class="filterbar" id="uc-customer-search"><div class="refund-keyword" data-pc-label="查找客户"><select id="uc-customerKeywordType" name="keywordType" aria-label="客户查找方式">${CUSTOMER_KEYWORDS.map(([key,text])=>`<option value="${key}"${q.keywordType===key?' selected':''}>${text}</option>`).join('')}</select>${input('customerKeyword',q.keyword,'输入'+label,'text','aria-label="客户搜索关键词"').replace('name="customerKeyword"','name="keyword"')}</div><div class="query-actions">${btn('重置','customer-reset')}<button type="submit" form="uc-customer-search" class="btn primary">搜索</button></div></form><div id="uc-customer-search-error" class="uc-error" role="alert"></div></div>`;
    const emptyText=e.customerFilters.keyword?.trim()?'未找到匹配客户，可修改条件重试；暂不关联也可继续处理工单':'请先搜索客户，核对后选择对应会员';
    return search+section('确认客户',`<div class="table-wrap uc-table-wrap"><table data-pc-align="left" data-pc-min-height="0" data-pc-scroll="parent" aria-label="匹配客户"><colgroup><col style="width:120px"><col style="width:140px"><col style="width:120px"><col><col style="width:100px"></colgroup><thead><tr><th>客户姓名</th><th>手机号</th><th>会员号</th><th data-pc-min-width="140">所属门店</th><th>操作</th></tr></thead><tbody>${matches.length?matches.slice(offset,offset+e.customerPageSize).map(customer=>`<tr><td>${listValue(customer.name)}</td><td>${esc(phoneView(customer).value)}</td><td>${listValue(customer.member)}</td><td>${listValue(customer.stores.join('、'))}</td><td>${link('选择','select-order-customer',`data-customer="${esc(customer.customerId)}" aria-label="选择客户 ${esc(customer.name)}，会员号 ${esc(customer.member)}"`)}</td></tr>`).join(''):`<tr><td colspan="5">${empty(emptyText)}</td></tr>`}</tbody></table></div>${pagination(matches.length,e.customerPage,e.customerPageSize,'order-customers')}`);
  }
  function orderPickerView(e=getEditor()){
    const example=e.exampleRecord?'':`<div class="uc-order-example">${link('查看未关联客户示例','order-example')}</div>`;
    if(!e.orderCustomerId)return customerSearchView(e)+example;
    const matches=orderPickerOrders(e);e.orderPage=Math.min(e.orderPage,Math.max(1,Math.ceil(matches.length/e.orderPageSize)));const offset=(e.orderPage-1)*e.orderPageSize;
    const customer=e.selectedCustomer,selected=customer?section('已选客户',`<div class="uc-actions"><strong>${esc(customer.name)}</strong><span>${esc(phoneView(customer).value)}</span><span class="uc-muted">会员号 ${esc(customer.member||'—')}</span><span class="uc-muted">${esc(customer.stores.join('、'))}</span></div>`,link('更换客户','change-order-customer')):'';
    const columns=[['选择',48],['订单 / 项目',0],['门店',140],['状态',90]];
    return selected+`<div class="uc-order-picker-results"><div class="uc-section-head"><h4>选择关联订单</h4></div><div class="table-wrap uc-table-wrap"><table class="uc-table uc-picker-table" data-pc-align="left" data-pc-min-height="0" data-pc-scroll="parent"><colgroup>${columns.map(([,width])=>`<col${width?' style="width:'+width+'px"':''}>`).join('')}</colgroup><thead><tr>${columns.map(([label,width])=>`<th data-pc-min-width="${width||220}">${label}</th>`).join('')}</tr></thead><tbody>${matches.length?matches.slice(offset,offset+e.orderPageSize).map(o=>{
      const checked=e.selection.some(item=>item.id===o.id);
      return `<tr><td><input type="${e.multipleOrders?'checkbox':'radio'}" name="uc-order-selection" value="${esc(o.id)}" data-order-choice="${esc(o.id)}" aria-label="选择订单 ${esc(o.id)}" ${checked?'checked':''}></td><td>${listValue(o.id)}<span class="pc-block uc-block uc-muted">${esc(orderProjects(o).map(project=>project.name).filter(Boolean).join('、'))}</span></td><td>${listValue(o.store)}</td><td>${o.state?tag(o.state,o.state==='已到店'?'green':'gray'):listValue('')}</td></tr>`;
    }).join(''):`<tr><td colspan="${columns.length}">${empty('该客户暂无订单，可稍后再关联')}</td></tr>`}</tbody></table></div>${pagination(matches.length,e.orderPage,e.orderPageSize,'orders')}</div>`+example;
  }
  function recordOrderAssociation(r,e,time){
    if(r.status==='已结案'||(!e.multipleOrders&&e.selection.length!==1)||!e.orderCustomerId)return null;
    const own=orderPickerOrders(e),order=own.find(item=>item.id===e.selection[0]?.id);if(e.selection.some(item=>!own.some(order=>order.id===item.id))||customerIdOf(r)!==e.initialCustomerId)return null;if(!e.multipleOrders&&!order)return null;
    const customer=e.orderBindingRequired?customerDirectory().find(item=>item.customerId===e.selectedCustomer?.customerId&&item.customerId===e.orderCustomerId):null;
    if(e.orderBindingRequired&&!customer)return null;
    if(!orderPickerDirty(e))return null;
    const before={customerId:r.customerId||'',member:r.member||'',linked:clone(r.linked)};
    if(customer){
      r.originalContact??={name:r.name||'',phone:r.phone||'',fullPhone:r.fullPhone||''};
      Object.assign(r,{customerId:customer.customerId,name:customer.name,phone:customer.phone,fullPhone:customer.fullPhone,member:customer.member,customerWechat:customer.customerWechat,customerAssociation:{customerId:customer.customerId,member:customer.member,time,actor:ACTOR}});
    }
    r.linked=clone(e.selection);
    const entry={id:r.id+'-association-'+Date.now()+'-'+r.follows.length,kind:'association',action:customer?'关联客户及订单':before.linked.length?'调整关联订单':'关联订单',actor:ACTOR,time,before,customer:{name:r.name,phone:r.phone,member:r.member,customerId:r.customerId},originalContact:clone(r.originalContact||null),orderId:order?.id||'',orderIds:e.selection.map(item=>item.id),files:[]};
    r.follows.unshift(entry);return entry;
  }
  return {orderPickerTitle,customerDirectory,matchingCustomers,orderPickerState,orderPickerDirty,orderPickerCustomers,orderPickerOrders,selectPickerCustomer,changePickerCustomer,selectPickerOrder,orderPickerView,recordOrderAssociation};
}};
