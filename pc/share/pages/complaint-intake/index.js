/* Phone/member work order intake. Customer and order selections remain local drafts until creation. */
window.PCModules['complaint-intake']={render(){},create({CHANNELS,ACTOR,dictionary,field,input,opt,select,section,btn,link,esc,clone,orders,customerDirectory,phoneView,orderProjects,paymentMoney,tag,listValue,empty,pagination,fmt,openLayer,closeLayer,toast,clearErrors,error,now,getLayers,getRecords,persist,onCreated}){
  function createTicketForm(){
    const modes=`<div class="pc-segmented" role="radiogroup" aria-label="客户匹配方式"><label><input type="radio" name="lookupType" value="phone" checked><span>手机号</span></label><label><input type="radio" name="lookupType" value="member"><span>会员号</span></label></div>`;
    const lookup=`<div id="uc-create-customer-lookup"><form id="uc-create-customer-search" class="pc-form pc-form-single" novalidate><div class="pc-form-item"><label id="uc-create-lookup-label" class="pc-form-label" for="uc-createConsumptionPhone">消费手机号：</label><div class="pc-field-content"><div class="uc-actions"><div class="pc-query-field" data-create-lookup-value="phone">${input('createConsumptionPhone','','输入消费手机号，自动查找客户','tel','inputmode="tel" autocomplete="off" aria-label="消费手机号" maxlength="18"','consumptionPhone')}</div><div class="pc-query-field" data-create-lookup-value="member" hidden>${input('createConsumptionMember','','输入完整会员号，自动查找客户','text','autocomplete="off" aria-label="会员号" maxlength="50"','consumptionMember')}</div><span id="uc-create-lookup-hint" class="uc-muted">示例 13800002901</span></div></div></div></form><div id="uc-create-customer-error" class="uc-error" role="alert"></div></div><div id="uc-create-customer-result"></div>`;
    const customerSection=`<section class="uc-section"><div class="uc-section-head pc-form pc-form-single"><div class="pc-form-item uc-intake-lookup-heading"><h4>客户信息</h4>${modes}</div></div><div class="uc-section-content">${lookup}</div></section>`;
    return `<div id="uc-create-ticket" class="uc-intake" data-ticket-form>${customerSection}<div id="uc-create-orders" hidden></div>${section('受理信息',`<div class="ub-form" data-pc-columns="2">
      ${field('createName','客户称呼',input('createName','','可填写姓名或称呼，暂缺可留空','text','autocomplete="off"','name'))}
      ${field('createPhone','联系手机号',input('createPhone','','默认同消费手机号，可修改','tel','inputmode="tel" autocomplete="off"','phone'),true)}
      ${field('createChannel','来源渠道',`<select id="uc-createChannel" name="channel" class="uc-input" aria-label="来源渠道">${Object.entries(CHANNELS).map(([value,label])=>`<option value="${esc(value)}"${value==='hotline'?' selected':''}>${esc(label)}</option>`).join('')}</select>`)}
      ${dictionary.requestEntryEnabled?field('createRequestType','客户诉求类型',`<select id="uc-createRequestType" name="requestType" class="uc-input" aria-label="客户诉求类型" aria-required="true">${opt(dictionary.requestTypes(),'','请选择客户诉求类型')}</select>`,true)+field('createRequestReason','具体原因',`<select id="uc-createRequestReason" name="requestReason" class="uc-input" aria-label="具体原因" aria-required="true" disabled>${opt([],'','请先选择客户诉求类型')}</select>`,true):''}
      ${field('createContent','补充说明',`<textarea id="uc-createContent" name="content" class="uc-input" rows="3" maxlength="2000" placeholder="记录客户反馈和希望如何处理"></textarea>`,false,'',true)}
    </div>`)}</div>`;
  }
  const normalizeCreatePhone=value=>String(value||'').replace(/[\s()-]/g,'').replace(/^\+86/,'');
  const lookupType=state=>state.lookupType==='member'?'member':'phone';
  const lookupField=type=>type==='member'?'consumptionMember':'consumptionPhone';
  const searchedField=type=>type==='member'?'searchedMember':'searchedPhone';
  const normalizeLookup=(value,type)=>type==='member'?String(value||'').trim():normalizeCreatePhone(value);
  const validLookup=(value,type)=>type==='member'?Boolean(value&&value.length<=50):/^1\d{10}$/.test(value);
  const customerPhone=customer=>[customer?.fullPhone,customer?.phone].map(normalizeCreatePhone).find(value=>/^1\d{10}$/.test(value))||'';
  function createTicketState(){return {lookupType:'phone',consumptionPhone:'',searchedPhone:'',consumptionMember:'',searchedMember:'',customerId:'',linked:[],contactEdited:false,autoName:'',lookupOpen:true}}
  function clearCreateCustomer(layer){
    const state=layer.creation,name=layer.el.querySelector('[name="name"]');
    if(state.autoName&&name.value===state.autoName){name.value='';PCUI.syncControl(name)}
    state.autoName='';state.customerId='';state.linked=[];state.lookupOpen=true;
  }
  function createCustomerMatches(phone,type='phone'){
    if(type==='member'){const member=normalizeLookup(phone,type);return validLookup(member,type)?customerDirectory().filter(customer=>String(customer.member||'').trim()===member):[];}
    if(!/^1\d{10}$/.test(phone))return [];
    return customerDirectory().filter(customer=>{
      const known=[customer.fullPhone,customer.phone].map(normalizeCreatePhone).filter(value=>/^1\d{10}$/.test(value));
      if(known.length)return known.includes(phone);
      const masked=String(customer.phone||'');return /^\d{3}[*＊•]{4}\d{4}$/.test(masked)&&phone.startsWith(masked.slice(0,3))&&phone.endsWith(masked.slice(-4));
    });
  }
  function createCustomer(state){return customerDirectory().find(customer=>customer.customerId===state.customerId)}
  function createCustomerOrders(state,filters={}){
    const keyword=String(filters.keyword||'').trim().toLowerCase();
    return orders.filter(order=>state.customerId&&order.customerId===state.customerId&&(!keyword||[order.id,...orderProjects(order).map(project=>project.name)].some(value=>String(value||'').toLowerCase().includes(keyword)))&&(!filters.store||order.store===filters.store)&&(!filters.start||String(order.created||'').slice(0,10)>=filters.start)&&(!filters.end||Boolean(order.created)&&String(order.created).slice(0,10)<=filters.end)).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
  }
  function setCreateCustomer(state,id){
    const type=lookupType(state);
    if(!createCustomerMatches(state[searchedField(type)],type).some(customer=>customer.customerId===id))return false;
    if(state.customerId===id){state.lookupOpen=false;return true}
    state.customerId=id;state.linked=[];state.lookupOpen=false;return true;
  }
  function setCreateOrder(state,id,checked){
    const order=createCustomerOrders(state).find(order=>order.id===id);if(!order)return false;
    state.linked=state.linked.filter(item=>item.id!==id);if(checked)state.linked.push({id:order.id,wechatId:order.bookingWechatId||''});return true;
  }
  function createOrderTable(items,selection,action='create-order-choice',removable=false){
    const headers=(removable?[]:[['选择',48]]).concat([['项目 / 订单',270],['门店 / 消费时间',158],['实付金额',105],['状态',80]],removable?[['操作',70]]:[]);
    const rows=items.map(order=>{
      const checked=selection.some(item=>item.id===order.id),choice=`<td><input type="checkbox" data-${action}="${esc(order.id)}" aria-label="选择售后订单 ${esc(order.id)}"${checked?' checked':''}></td>`;
      const remove=`<td>${link('移除','create-remove-order',`data-order="${esc(order.id)}" aria-label="移除订单 ${esc(order.id)}"`)}</td>`;
      return `<tr${removable?'':` data-intake-order="${esc(order.id)}" data-intake-choice="${action}"`}>${removable?'':choice}<td><div class="uc-intake-order-title">${esc(orderProjects(order).map(project=>project.name).join('、')||'未记录项目')}</div><span class="pc-block uc-block uc-muted uc-intake-order-meta">${esc(order.id)} · 下单：${esc(String(order.created||'').slice(0,10)||'—')}</span></td><td>${listValue(order.store)}<span class="pc-block uc-block uc-muted uc-intake-order-meta">消费：${order.arrived?esc(fmt(order.arrived)):'—'}</span></td><td>${paymentMoney(order.amount)}</td><td>${order.state?tag(order.state,order.state==='已到店'?'green':'gray'):'—'}</td>${removable?remove:''}</tr>`;
    }).join('');
    return `<div class="table-wrap uc-table-wrap"><table data-pc-align="left" data-pc-min-height="0" data-pc-scroll="parent" aria-label="售后订单"><thead><tr>${headers.map(([label,width])=>`<th data-pc-min-width="${width}">${label}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }
  function customerIdentity(customer,linked=false){
    const name=linked?`<a class="btn text pc-native-button uc-link" href="#complaints?customer=${encodeURIComponent(customer.customerId)}" target="_blank" rel="noopener noreferrer" aria-label="在新标签页查看客户 ${esc(customer.name||'未留姓名')} 的详情"><strong>${esc(customer.name||'未留姓名')}</strong></a>`:`<strong>${esc(customer.name||'未留姓名')}</strong>`;
    return `<span class="uc-info-avatar" aria-hidden="true">${esc(Array.from(customer.name||'客')[0])}</span><div class="uc-info-identity"><div class="uc-info-contact">${name}<span>${esc(phoneView(customer).value)}</span></div><div class="uc-info-context"><span>会员号 ${esc(customer.member||'—')}</span>${customer.stores.length?`<span>${esc(customer.stores.join('、'))}</span>`:''}</div></div>`;
  }
  function renderCreateCustomer(layer){
    const state=layer.creation,customer=createCustomer(state),result=layer.el.querySelector('#uc-create-customer-result'),lookup=layer.el.querySelector('#uc-create-customer-lookup');
    if(lookup)lookup.hidden=Boolean(customer&&!state.lookupOpen);
    if(customer&&!state.lookupOpen)result.innerHTML=`<div class="uc-intake-customer-summary">${customerIdentity(customer,true)}${link('更换客户','create-change-customer')}</div>`;
    else if(state[searchedField(lookupType(state))]){
      const type=lookupType(state),matches=createCustomerMatches(state[searchedField(type)],type);
      result.innerHTML=matches.length?`<div class="uc-intake-candidates" aria-label="匹配客户">${matches.map(item=>`<div class="uc-intake-candidate" data-uc="create-select-customer" data-customer="${esc(item.customerId)}">${customerIdentity(item)}<div class="uc-intake-candidate-action">${type==='phone'&&!customerPhone(item)?'<span class="uc-muted uc-intake-match-note">号码部分匹配，请核对</span>':''}${btn('关联客户','create-select-customer',`data-customer="${esc(item.customerId)}" aria-label="关联客户 ${esc(item.name)}，会员号 ${esc(item.member)}"`)}</div></div>`).join('')}</div>`:`<p class="uc-help" role="status">未找到客户，可直接填写下方信息创建工单。</p>`;
    }else result.innerHTML='';
    renderCreateOrders(layer);
  }
  function updateCreateOrderCount(layer){
    const count=layer.el.querySelector('#uc-create-selected-count');if(count)count.textContent=layer.creation.linked.length?'已选 '+layer.creation.linked.length+' 笔':'可多选';
  }
  function renderCreateOrders(layer){
    const state=layer.creation,container=layer.el.querySelector('#uc-create-orders');container.hidden=!state.customerId;
    if(!state.customerId){container.innerHTML='';return}
    const all=createCustomerOrders(state),visible=all.filter((order,index)=>index<3||state.linked.some(item=>item.id===order.id));
    const content=all.length?createOrderTable(visible,state.linked):'<p class="uc-help">该客户暂无订单，可先创建工单，后续补充。</p>';
    const count=state.linked.length?'已选 '+state.linked.length+' 笔':'可多选';
    container.innerHTML=section('售后订单',content,all.length?`<div class="uc-actions"><span id="uc-create-selected-count" class="uc-muted" role="status">${count}</span>${all.length>3?link('全部订单','create-pick-orders','aria-label="查看全部 '+all.length+' 笔订单"'):''}</div>`:'');
  }
  function lookupCreateCustomer(layer){
    const state=layer.creation,type=lookupType(state),name=lookupField(type),control=layer.el.querySelector('[name="'+name+'"]'),value=normalizeLookup(control.value,type),err=layer.el.querySelector('#uc-create-customer-error');
    if(!validLookup(value,type)){err.textContent=type==='member'?'请输入完整会员号（最多50字）':'请输入11位消费手机号';control.setAttribute('aria-invalid','true');PCUI.focusControl(control);return}
    control.value=value;PCUI.syncControl(control);control.removeAttribute('aria-invalid');err.textContent='';clearCreateCustomer(layer);state[name]=value;state[searchedField(type)]=value;
    if(!state.contactEdited){const contact=layer.el.querySelector('[name="phone"]');contact.value=type==='phone'?value:'';PCUI.syncControl(contact)}renderCreateCustomer(layer);
  }
  function syncCreateInput(el){
    const layer=getLayers().at(-1);if(!layer?.creation)return false;const state=layer.creation;
    if(el.name==='phone')state.contactEdited=Boolean(el.value.trim());
    if(el.name==='lookupType'){
      if(!el.checked||!['phone','member'].includes(el.value)||el.value===lookupType(state))return true;
      clearCreateCustomer(layer);state.lookupType=el.value;const type=lookupType(state),name=lookupField(type),control=layer.el.querySelector('[name="'+name+'"]');
      for(const region of layer.el.querySelectorAll('[data-create-lookup-value]'))region.hidden=region.dataset.createLookupValue!==type;
      const label=layer.el.querySelector('#uc-create-lookup-label');if(label){label.textContent=type==='phone'?'消费手机号：':'会员号：';label.htmlFor=control.id;}
      const hint=layer.el.querySelector('#uc-create-lookup-hint'),member=customerDirectory().find(customer=>customer.member)?.member;
      if(hint)hint.textContent=type==='phone'?'示例 13800002901':member?'示例 '+member:'输入完整会员号';
      const contact=layer.el.querySelector('[name="phone"]');contact.placeholder=type==='phone'?'默认同消费手机号，可修改':'填写联系手机号';
      state[searchedField(type)]='';state[name]=normalizeLookup(control.value,type);control.removeAttribute('aria-invalid');layer.el.querySelector('#uc-create-customer-error').textContent='';
      if(!state.contactEdited){contact.value=type==='phone'?state[name]:'';PCUI.syncControl(contact)}
      if(validLookup(state[name],type))lookupCreateCustomer(layer);else renderCreateCustomer(layer);
      return true;
    }
    if(el.name===lookupField(lookupType(state))){
      const type=lookupType(state),name=lookupField(type),value=normalizeLookup(el.value,type);if(value===state[name])return true;
      clearCreateCustomer(layer);state[name]=value;state[searchedField(type)]='';layer.el.querySelector('#uc-create-customer-error').textContent='';el.removeAttribute('aria-invalid');
      if(!state.contactEdited){const contact=layer.el.querySelector('[name="phone"]');contact.value=type==='phone'?value:'';PCUI.syncControl(contact)}
      if(validLookup(value,type))lookupCreateCustomer(layer);else renderCreateCustomer(layer);
    }
    return true;
  }
  function createOrderPickerView(layer){
    const picker=layer.creationOrders,all=createCustomerOrders(picker.state,picker.filters);picker.page=Math.min(picker.page,Math.max(1,Math.ceil(all.length/picker.size)));
    layer.el.querySelector('#uc-create-order-results').innerHTML=(all.length?createOrderTable(all.slice((picker.page-1)*picker.size,picker.page*picker.size),picker.state.linked,'create-picker-choice'):empty('未找到符合条件的订单，可调整条件或暂不关联'))+pagination(all.length,picker.page,picker.size,'create-orders');
    layer.el.querySelector('#uc-create-order-count').textContent='已选 '+picker.state.linked.length+' 笔';
  }
  function openCreateOrderPicker(parent){
    const state=clone(parent.creation),all=createCustomerOrders(state),customer=createCustomer(state);
    if(!customer)return;
    const search=`<div class="query-module"><form id="uc-create-order-search" class="filterbar">${input('createOrderKeyword','','输入订单号或项目名称','text','aria-label="订单 / 项目"','keyword')}${select('createOrderStore',[...new Set(all.map(order=>order.store).filter(Boolean))],'','全部门店','aria-label="订单门店" data-filterable')}<div class="mr-date" data-pc-label="下单日期">${input('createOrderStart','','开始日期','date','aria-label="下单开始日期"','start')}<span>至</span>${input('createOrderEnd','','结束日期','date','aria-label="下单结束日期"','end')}</div><div class="query-actions"><button type="submit" form="uc-create-order-search" class="btn primary">搜索</button>${btn('重置','create-orders-reset')}</div></form><div id="uc-create-orders-error" class="uc-error" role="alert"></div></div>`;
    const layer=openLayer('选择售后订单',`<div class="uc-case-context"><strong>${esc(customer.name)}</strong> · 会员号 ${esc(customer.member||'—')}</div>${search}<div id="uc-create-order-results"></div>`,`<span id="uc-create-order-count" class="uc-create-order-count" aria-live="polite"></span>${btn('取消','dismiss')}${btn('确定','create-confirm-orders','',true)}`,2);
    layer.el.classList.add('uc-intake-picker');layer.creationOrders={parent,state,filters:{},page:1,size:10};createOrderPickerView(layer);
  }
  function createTicketAssociation(state,values,time){
    const customer=state.customerId?createCustomer(state):null,type=lookupType(state),name=lookupField(type),value=normalizeLookup(values[name],type);
    if(state.customerId&&(!customer||(values.lookupType||type)!==type||state[name]!==value||!createCustomerMatches(value,type).some(item=>item.customerId===state.customerId)))throw Error('客户信息已变更，请重新查找并关联');
    const own=createCustomerOrders(state);if(state.linked.some(item=>!own.some(order=>order.id===item.id)))throw Error('订单不属于当前客户，请重新选择');
    const stores=[...new Set(own.filter(order=>state.linked.some(item=>item.id===order.id)).map(order=>order.store).filter(Boolean))];
    return {orderSelectionMode:'multiple',consumptionPhone:type==='phone'?normalizeCreatePhone(values.consumptionPhone):customerPhone(customer),...(type==='member'?{consumptionMember:value}:{}),customerId:customer?.customerId||'',name:customer?.name||values.name||'未留姓名',phone:customer?.phone||values.phone,fullPhone:customer?.fullPhone||(!customer?values.phone:''),member:customer?.member||'',customerWechat:customer?.customerWechat||'',store:stores.length===1?stores[0]:'',linked:clone(state.linked),...(customer?{originalContact:{name:values.name||customer.name,phone:values.phone,fullPhone:values.phone},customerAssociation:{customerId:customer.customerId,member:customer.member,lookupType:type,lookupValue:value,time,actor:ACTOR}}:{})};
  }
  function createTicketAction(action,button,layer){
    if(layer?.creation){
      const state=layer.creation;
      if(action==='create-reset-customer'){
        const type=lookupType(state),control=layer.el.querySelector('[name="'+lookupField(type)+'"]');control.value='';PCUI.syncControl(control);syncCreateInput(control);clearCreateCustomer(layer);state[searchedField(type)]='';layer.el.querySelector('#uc-create-customer-error').textContent='';control.removeAttribute('aria-invalid');renderCreateCustomer(layer);PCUI.focusControl(control);
      }
      if(action==='create-change-customer'){state.lookupOpen=true;renderCreateCustomer(layer);const control=layer.el.querySelector('[name="'+lookupField(lookupType(state))+'"]');PCUI.focusControl(control);control.select()}
      if(action==='create-select-customer'&&setCreateCustomer(state,button.dataset.customer)){
        const name=layer.el.querySelector('[name="name"]'),customer=createCustomer(state);if(!name.value.trim()||name.value===state.autoName){name.value=customer.name;state.autoName=customer.name;PCUI.syncControl(name)}if(lookupType(state)==='member'&&!state.contactEdited){const contact=layer.el.querySelector('[name="phone"]');contact.value=customerPhone(customer);PCUI.syncControl(contact)}renderCreateCustomer(layer);PCUI.focusControl(layer.el.querySelector('[data-create-order-choice]')||layer.el.querySelector('[name="phone"]'));
      }
      if(action==='create-pick-orders')openCreateOrderPicker(layer);
      if(action==='create-remove-order'){setCreateOrder(state,button.dataset.order,false);renderCreateOrders(layer);PCUI.focusControl(layer.el.querySelector('[data-uc="create-pick-orders"]'))}
    }
    if(layer?.creationOrders){
      const picker=layer.creationOrders;
      if(action==='create-orders-reset'){const form=layer.el.querySelector('#uc-create-order-search');form.reset();form.querySelectorAll('input,select').forEach(control=>PCUI.syncControl(control));picker.filters={};picker.page=1;layer.el.querySelector('#uc-create-orders-error').textContent='';createOrderPickerView(layer)}
      if(action==='create-confirm-orders'){
        const parent=picker.parent;if(!parent.el.isConnected||parent.creation.customerId!==picker.state.customerId||picker.state.linked.some(item=>!createCustomerOrders(parent.creation).some(order=>order.id===item.id))){toast('客户或订单信息已变更，请重新选择');return}
        parent.creation.linked=clone(picker.state.linked);renderCreateOrders(parent);closeLayer();
      }
    }
  }
  function syncCreateRequestFields(scope,resetReason=false){
    const type=scope.querySelector('[name="requestType"]'),reason=scope.querySelector('[name="requestReason"]');if(!type||!reason)return;
    const types=dictionary.requestTypes(),selectedType=types.includes(type.value)?type.value:'',reasons=dictionary.requestReasons(selectedType),selectedReason=!resetReason&&reasons.includes(reason.value)?reason.value:'';
    type.innerHTML=opt(types,selectedType,'请选择客户诉求类型');reason.innerHTML=opt(reasons,selectedReason,selectedType?'请选择具体原因':'请先选择客户诉求类型');reason.disabled=!selectedType;
    PCUI.syncControl(type);PCUI.syncControl(reason);
    const content=scope.querySelector('[name="content"]'),required=['其他原因','其他问题'].includes(selectedReason);
    content.setAttribute('aria-required',String(required));content.closest('[data-field]')?.querySelector('label')?.classList.toggle('required',required);
    for(const name of ['RequestType','RequestReason','Content']){scope.querySelector('#uc-error-create'+name).textContent='';scope.querySelector('#uc-create'+name)?.removeAttribute('aria-invalid')}
  }
  function newTicketErrors(values){
    const errors=values.phone?[]:[['phone','请输入联系手机号']];
    const type=values.lookupType||'phone';
    if(!['phone','member'].includes(type))errors.push(['lookupType','请选择手机号或会员号查询']);
    if(values.phone&&!/^1\d{10}$/.test(values.phone))errors.push(['phone','请输入11位联系手机号']);
    if(type==='phone'&&values.consumptionPhone&&!/^1\d{10}$/.test(values.consumptionPhone))errors.push(['consumptionPhone','请输入11位消费手机号']);
    if(type==='member'&&String(values.consumptionMember||'').length>50)errors.push(['consumptionMember','会员号不能超过50字']);
    if(dictionary.requestEntryEnabled){
      if(!dictionary.requestTypes().includes(values.requestType))errors.push(['requestType','请选择客户诉求类型']);
      if(!dictionary.requestReasons(values.requestType).includes(values.requestReason))errors.push(['requestReason','请选择该诉求类型对应的具体原因']);
      if(['其他原因','其他问题'].includes(values.requestReason)&&!values.content)errors.push(['content','请补充具体情况及希望如何处理']);
    }
    return errors;
  }
  function openCreateTicket(){
    if(getLayers().length)return;
    const layer=openLayer('新增工单',createTicketForm(),`${btn('取消','dismiss')}${btn('创建工单','save-new-ticket','',true)}`);
    layer.creation=createTicketState();layer.el.classList.add('uc-create-layer');
  }
  function saveNewTicket(){
    const layer=getLayers().at(-1),scope=layer?.el,form=scope?.querySelector('[data-ticket-form]');
    if(!layer?.creation||!form)return;
    const values=Object.fromEntries([...form.querySelectorAll('input,select,textarea')].filter(control=>control.name&&(control.type!=='radio'||control.checked)).map(control=>[control.name,control.value.trim()]));
    values.phone=normalizeCreatePhone(values.phone);values.consumptionPhone=normalizeCreatePhone(values.consumptionPhone);values.consumptionMember=normalizeLookup(values.consumptionMember,'member');
    clearErrors(scope);
    const missing=newTicketErrors(values);
    if(missing.length){
      missing.forEach(([name,message])=>error(scope,'create'+name[0].toUpperCase()+name.slice(1),message));
      const lookupError=missing.find(([name])=>['lookupType','consumptionPhone','consumptionMember'].includes(name));if(lookupError)scope.querySelector('#uc-create-customer-error').textContent=lookupError[1];
      const control=scope.querySelector(`[name="${missing[0][0]}"]`);PCUI.focusControl(control);control?.scrollIntoView({block:'center'});return;
    }
    const numericIds=getRecords().map(record=>Number(record.id)).filter(Number.isFinite),id=String((numericIds.length?Math.max(...numericIds):31000)+1),time=now();
    const requestType=dictionary.requestEntryEnabled?values.requestType||'':'',requestReason=dictionary.requestEntryEnabled?values.requestReason||'':'';
    let association;try{association=createTicketAssociation(layer.creation,values,time)}catch(err){toast(err.message);return}
    const record={id,sourceId:'',customerId:'',name:values.name,phone:values.phone,member:'',customerWechat:'',store:'',channel:values.channel||'hotline',content:values.content,requestType,requestReason,created:time,submitter:ACTOR,status:'待处理',handlingPlan:'',level:'',level4Type:'',department:'',type:'',firstContact:'',contactTime:'',complaintStore:'',customerDemand:'',customerStatement:values.content,responsible:'',reason:'',linked:[],files:[],follows:[],logs:[{time,actor:ACTOR,action:'新增工单',text:'手工创建工单，来源：'+(CHANNELS[values.channel]||CHANNELS.hotline)+(requestType?'；客户诉求：'+requestType+'；具体原因：'+requestReason:'')}],messages:[]};
    Object.assign(record,association);record.logs[0].text+=(association.customerId?'；已关联客户 '+association.member:'；未关联客户')+(association.linked.length?'；售后订单：'+association.linked.map(item=>item.id).join('、'):'；暂未关联订单');
    if(!persist([...getRecords(),record]))return;
    onCreated(record,layer);
  }
  return {createTicketForm,syncCreateRequestFields,newTicketErrors,openCreateTicket,saveNewTicket,syncCreateInput,createTicketAction,lookupCreateCustomer,createOrderPickerView,setCreateOrder,createTicketState,createCustomerMatches,createCustomerOrders,setCreateCustomer,createTicketAssociation,createOrderTable,updateCreateOrderCount};
}};
