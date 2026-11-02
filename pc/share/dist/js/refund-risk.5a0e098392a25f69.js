/* Refund analytics uses integer cents, original order IDs and explicit evidence.
 * Source payments, requests and payout tasks have separate identities. */
window.RefundRiskModel = (() => {
  const DAY=86400000;
  const date=v=>String(v||'').slice(0,10);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const addDays=(v,n)=>new Date(Date.parse(date(v)+'T00:00:00Z')+n*DAY).toISOString().slice(0,10);
  const days=(a,b)=>(Date.parse(date(b)+'T00:00:00Z')-Date.parse(date(a)+'T00:00:00Z'))/DAY;
  const month=(v,n=0)=>{const d=new Date(date(v).slice(0,7)+'-01T00:00:00Z');d.setUTCMonth(d.getUTCMonth()+n);return d.toISOString().slice(0,7)};
  const monthEnd=v=>addDays(month(v,1)+'-01',-1);
  const within=(v,from,to)=>!!date(v)&&(!from||date(v)>=from)&&(!to||date(v)<=to);
  const unique=xs=>[...new Set(xs)];
  const sum=(rows,fn)=>rows.reduce((n,r)=>n+(Number(fn(r))||0),0);
  const percent=(a,b)=>b>0?(a/b*100).toFixed(1)+'%':'—';
  const cents=v=>Number.isFinite(Number(v))?Math.round(Number(v)*100):0;
  const rules=[
    {id:'frequency',name:'同一客户频繁退款',description:'默认阈值：同一客户连续 7 个自然日内，在至少 3 笔不同订单发起原路退款，原路申请金额合计至少 3,000 元。按客户编号聚合，不按姓名猜测。'},
    {id:'payer',name:'多客户同账户退款',description:'默认阈值：连续 7 个自然日内，至少 2 位不同客户的原路退款申请指向同一原付款账户。按支付渠道、标识作用域及账户唯一标识关联，覆盖不同门店；不按姓名、支付方式、交易流水号或账号尾号猜测。'}
  ];
  const identity=v=>v!=null&&!['','undefined','null','—'].includes(String(v).trim())?String(v).trim():null;
  const knownRequest=a=>a.requestIdKnown!==false;
  const knownCustomer=o=>!!identity(o?.customerId)&&!String(o.customerId).startsWith('unknown:');
  const knownOrder=o=>!!o&&o.orderIdKnown!==false;
  const moment=v=>{let text=String(v||'').replace(' ','T');if(text.length===10)text+='T00:00:00';if(!/(Z|[+-]\d{2}:?\d{2})$/.test(text))text+='+08:00';return Date.parse(text)};
  // Adapter contract for payment-side identity, not a field inferred from the
  // current refund records. Scope identifies where the provider's ID is unique
  // (for example an app/merchant namespace). Never use payment/transaction IDs.
  function paymentPayer(value){
    if(!value||typeof value!=='object')return null;
    const parts=[value.provider,value.scope,value.id];
    if(parts.some(v=>typeof v!=='string'||!identity(v)||/[*＊●•]/.test(v)))return null;
    const [provider,scope,id]=parts.map(v=>v.trim());
    return {key:JSON.stringify([provider,scope,id]),label:provider+' / '+scope+' / '+(id.length>4?'***'+id.slice(-4):'***')};
  }
  function sourcePayer(task){
    const values=[task.sourcePayment?.payerIdentity,task.receipt?.payerIdentity].filter(v=>v!=null);
    const identities=values.map(paymentPayer);
    return identities.length&&identities.every(Boolean)&&unique(identities.map(v=>v.key)).length===1?identities[0]:null;
  }
  function prepare(data){
    data.orderMap=new Map(data.orders.map(x=>[x.id,x]));
    data.storeMap=new Map(data.stores.map(x=>[x.id,x]));
    data.personMap=new Map(data.people.map(x=>[x.id,x]));
    data.taskMap=new Map();
    for(const t of data.tasks){if(!data.taskMap.has(t.applicationId))data.taskMap.set(t.applicationId,[]);data.taskMap.get(t.applicationId).push(t)}
    data.applicationMap=new Map(data.applications.map(x=>[x.id,x]));
    return data;
  }
  function scope(data,filter){return data.applications.filter(a=>inScope(data.orderMap.get(a.orderId),filter,data))}
  function inScope(order,f,data){if(!order)return false;const s=data.storeMap.get(order.storeId)||{};return (!f.district||s.district===f.district)&&(!f.area||s.area===f.area)&&(!f.store||s.id===f.store)}
  function paid(data,a,method){return sum(data.taskMap.get(a.id)||[],t=>t.status==='success'&&(!method||t.method===method)?t.amountCents:0)}
  // Risk review covers the original-payment portion only. Manual payouts still
  // contribute to overall refunds, but never to risk thresholds.
  function originalTasks(data,a){return a&&!a.cancelled?(data.taskMap.get(a.id)||[]).filter(t=>t.method==='original'&&!['cancelled','rejected'].includes(t.status)&&t.amountCents>0):[]}
  function riskAmount(data,a){return sum(originalTasks(data,a),t=>t.amountCents)}
  function riskEligible(data,a){return riskAmount(data,a)>0}
  function payerCoverage(data,apps=data.applications){const tasks=apps.flatMap(a=>originalTasks(data,a)),identified=tasks.filter(t=>t.payerKey).length;return {total:tasks.length,identified,missing:tasks.length-identified}}
  function alerts(data){
    const candidates=data.applications.filter(a=>riskEligible(data,a)&&knownRequest(a)&&Number.isFinite(moment(a.submittedAt)));
    return candidates.flatMap(a=>{
      const o=data.orderMap.get(a.orderId);if(!o||a.cancelled)return [];
      const matches=[];
      const add=(id,group,detail)=>matches.push({id,detail,name:rules.find(x=>x.id===id).name,applicationIds:group.map(b=>b.id)});
      // Evaluate only requests already submitted at this event. A later request
      // must not backdate an alert onto an earlier one.
      const recent=candidates.filter(b=>days(b.submittedAt,a.submittedAt)>=0&&days(b.submittedAt,a.submittedAt)<7&&moment(b.submittedAt)<=moment(a.submittedAt));
      const group=knownCustomer(o)?recent.filter(b=>{const other=data.orderMap.get(b.orderId);return knownOrder(other)&&knownCustomer(other)&&other.customerId===o.customerId}):[];
      const orderCount=unique(group.map(b=>b.orderId)).length,amount=sum(group,b=>riskAmount(data,b));
      if(orderCount>=3&&amount>=300000)add('frequency',group,`客户编号 ${o.customerId}，截至本次申请，7 个自然日内有 ${orderCount} 笔不同订单、${group.length} 次原路退款申请，合计 ${(amount/100).toFixed(2)} 元；达到默认阈值 3 笔订单且 3,000 元。`);
      const accounts=knownCustomer(o)?unique(originalTasks(data,a).map(t=>t.payerKey).filter(Boolean)).flatMap(key=>{
        const linked=recent.filter(b=>knownCustomer(data.orderMap.get(b.orderId))).flatMap(b=>originalTasks(data,b).filter(t=>t.payerKey===key).map(t=>({task:t,application:b,order:data.orderMap.get(b.orderId)})));
        const customerCount=unique(linked.map(x=>x.order.customerId)).length;
        if(customerCount<2)return [];
        return [{key,label:linked[0].task.payerLabel,customerCount,applicationIds:unique(linked.map(x=>x.application.id)),taskIds:linked.map(x=>x.task.id),amountCents:sum(linked,x=>x.task.amountCents),successCents:sum(linked,x=>x.task.status==='success'?x.task.amountCents:0)}];
      }):[];
      if(accounts.length)matches.push({id:'payer',name:rules.find(r=>r.id==='payer').name,accounts,applicationIds:unique(accounts.flatMap(x=>x.applicationIds)),taskIds:unique(accounts.flatMap(x=>x.taskIds)),detail:accounts.map(x=>`原付款账户 ${x.label}：截至本次申请，7 个自然日内关联 ${x.customerCount} 位不同客户、${x.applicationIds.length} 次原路退款申请，指向该账户的申请金额 ${(x.amountCents/100).toFixed(2)} 元，其中已成功 ${(x.successCents/100).toFixed(2)} 元。`).join('；')+'达到默认阈值 2 位客户；家庭代付等情况仍需核实，不代表已确认违规。'});
      // Retired labels and manually entered conclusions cannot create automatic
      // alerts. Historical review records are never used or modified here.
      if(!matches.length)return [];
      return [{id:data.source+':'+a.id,application:a,order:o,amountCents:riskAmount(data,a),matches,firstAt:a.submittedAt}];
    });
  }
  function metrics(data,filter){
    const apps=scope(data,filter),ids=new Set(apps.map(a=>a.id));
    const tasks=data.tasks.filter(t=>ids.has(t.applicationId)&&t.status==='success'&&within(t.completedAt,filter.from,filter.to));
    const allAlerts=alerts(data).filter(x=>ids.has(x.application.id));
    const added=allAlerts.filter(x=>within(x.firstAt,filter.from,filter.to));
    return {apps,tasks,allAlerts,added,amount:sum(tasks,t=>t.amountCents),orders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length,customers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId).filter(Boolean)).length,alertAmount:sum(added,x=>x.amountCents)};
  }
  function periodSummary(data,orders,from,to){
    const ids=new Set(orders.map(o=>o.id)),receipts=orders.filter(o=>within(o.paidAt,from,to));
    const tasks=data.tasks.filter(t=>t.status==='success'&&ids.has(data.applicationMap.get(t.applicationId)?.orderId)&&within(t.completedAt,from,to));
    const available=data.completePayments&&receipts.every(o=>Number.isFinite(o.paidCents)),denominator=sum(receipts,o=>o.paidCents),numerator=sum(tasks,t=>t.amountCents);
    return {available,receipts,tasks,count:receipts.length,denominator,numerator,rate:available&&denominator>0?numerator/denominator:null,original:sum(tasks,t=>t.method==='original'?t.amountCents:0),manual:sum(tasks,t=>t.method==='transfer'?t.amountCents:0),unknown:sum(tasks,t=>!['original','transfer'].includes(t.method)?t.amountCents:0),refundOrders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length};
  }
  function sameDay(data,orders,from,to){
    const receipts=orders.filter(o=>within(o.paidAt,from,to)),ids=new Set(receipts.map(o=>o.id)),allIds=new Set(orders.map(o=>o.id));
    const relevant=data.tasks.filter(t=>t.status==='success'&&t.method==='original'&&allIds.has(data.applicationMap.get(t.applicationId)?.orderId)&&within(t.completedAt,from,to));
    const unknownDateCount=relevant.filter(t=>{const a=data.applicationMap.get(t.applicationId),o=data.orderMap.get(a.orderId);return !Number.isFinite(days(o.paidAt,a.submittedAt))}).length;
    const tasks=relevant.filter(t=>{const a=data.applicationMap.get(t.applicationId),o=data.orderMap.get(a.orderId);return ids.has(o.id)&&date(a.submittedAt)===date(o.paidAt)&&date(t.completedAt)===date(o.paidAt)});
    // Eligibility is the original amount of that day's payment, not the remaining
    // refundable balance after refunds. Missing eligibility never becomes zero.
    const available=data.completePayments&&!unknownDateCount&&receipts.every(o=>Number.isFinite(o.paidCents)&&Number.isFinite(o.originalEligibleCents)&&o.originalEligibleCents>=0&&o.originalEligibleCents<=o.paidCents);
    const denominator=sum(receipts,o=>o.originalEligibleCents),numerator=sum(tasks,t=>t.amountCents);
    return {available,unknownDateCount,receipts,tasks,denominator,numerator,rate:available&&denominator>0?numerator/denominator:null,count:receipts.filter(o=>o.originalEligibleCents>0).length,refundOrders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length};
  }
  // Detect across the full source first, then attribute the triggering request.
  // A cross-store account match must survive organization/date filtering.
  function anomalyRows(data,f){
    return alerts(data).filter(x=>inScope(x.order,f,data)&&within(x.firstAt,f.from,f.to)&&(!f.rule||x.matches.some(m=>m.id===f.rule)));
  }
  function anomalySummary(rows){
    const items=[...new Map(rows.map(x=>[x.id,x])).values()];
    return {count:items.length,amountCents:sum(items,x=>x.amountCents),customers:unique(items.filter(x=>knownCustomer(x.order)).map(x=>x.order.customerId)).length,stores:unique(items.map(x=>x.order.storeId)).length,frequency:items.filter(x=>x.matches.some(m=>m.id==='frequency')).length,payer:items.filter(x=>x.matches.some(m=>m.id==='payer')).length,lastAt:items.map(x=>x.firstAt).sort((a,b)=>moment(a)-moment(b)).at(-1)||'—'};
  }
  function anomalyGroup(data,order,dimension){
    const s=data.storeMap.get(order.storeId)||{},district=s.district||'大区未接入',area=s.area||'区域未接入',store=s.name||'门店未接入';
    if(dimension==='districts')return {key:JSON.stringify(['districts',district]),name:district,parents:[]};
    if(dimension==='areas')return {key:JSON.stringify(['areas',district,area]),name:area,parents:[district]};
    if(dimension==='stores')return {key:JSON.stringify(['stores',order.storeId]),name:store,parents:[district,area]};
    const id=identity(order.receptionSalesId),p=data.personMap.get(id);
    return {key:JSON.stringify(['employees',id]),name:id?(p?.name||'员工 '+id):'接待销售未接入',employeeId:id,parents:[]};
  }
  function anomalyGroups(data,f,dimension){
    const groups=new Map();
    for(const row of anomalyRows(data,f)){
      const meta=anomalyGroup(data,row.order,dimension);
      if(!groups.has(meta.key))groups.set(meta.key,{...meta,rows:[],apps:[]});
      groups.get(meta.key).rows.push(row);
    }
    for(const a of scope(data,f).filter(a=>riskEligible(data,a)&&within(a.submittedAt,f.from,f.to))){
      const key=anomalyGroup(data,data.orderMap.get(a.orderId),dimension).key;
      groups.get(key)?.apps.push(a);
    }
    const keyword=String(f.keyword||'').trim().toLocaleLowerCase();
    return [...groups.values()].map(g=>{
      if(dimension==='employees')g.parents=unique(g.rows.map(x=>data.storeMap.get(x.order.storeId)?.name||'门店未接入'));
      return {...g,summary:anomalySummary(g.rows),coverage:payerCoverage(data,g.apps)};
    }).filter(g=>!keyword||[g.name,...g.parents,g.employeeId||''].some(v=>String(v).toLocaleLowerCase().includes(keyword)))
      .sort((a,b)=>b.summary.count-a.summary.count||b.summary.amountCents-a.summary.amountCents||a.name.localeCompare(b.name,'zh-CN'));
  }
  function fromBusiness(pc={},mobile={}){
    const taskById=new Map();
    for(const t of mobile.refundTasks||[])if(t?.id)taskById.set(t.id,t);
    // A task already imported into PC takes precedence over its older V3 snapshot.
    for(const t of pc.refunds||[])if(t?.id)taskById.set(t.id,t);
    const stores=new Map(),orders=new Map(),apps=new Map(),tasks=[],people=new Map();
    for(const t of taskById.values()){
      if(!Number.isFinite(t.amount)||t.amount<=0)continue;
      const appId=String(t.sourceRefundId||t.id),orderId=String(t.sourceOrderId||t.order||'unknown-'+appId);
      const storeId=String(t.storeId||'unmapped:'+String(t.store||'未记录门店'));
      if(!stores.has(storeId))stores.set(storeId,{id:storeId,name:t.store||'未记录门店',district:t.bigRegion||'组织待映射',area:t.area||'区域待映射',category:'未知'});
      const applicantId=t.applicantId||null;
      if(applicantId)people.set(applicantId,{id:applicantId,name:t.applicant||'申请人待核实',role:'applicant',storeId});
      if(!orders.has(orderId))orders.set(orderId,{id:orderId,customerId:identity(t.member),orderIdKnown:!!identity(t.sourceOrderId||t.order),customerName:t.name||'未记录客户',storeId,paidAt:date(t.paymentTime||t.sourcePayment?.paidAt),paidCents:Number.isFinite(t.orderReceived)?cents(t.orderReceived):null,project:t.projects?.map(i=>i.name||i.project).filter(Boolean).join('、')||t.type||'订单退款',receptionSalesId:null,serviceId:null,payerKey:null});
      if(!apps.has(appId))apps.set(appId,{id:appId,orderId,requestIdKnown:!!identity(t.sourceRefundId),amountCents:0,submittedAt:t.submittedAt||'',applicantId,applicantName:t.applicant||'待核实',operatorStoreId:storeId,reason:t.reason||'未记录',manualCents:0,originalSelectedCents:0,eligibleOriginalCents:null,financeIds:[],source:'business'});
      const a=apps.get(appId);a.amountCents+=cents(t.amount);a.financeIds.push(t.id);
      const method=t.refundMethod||({系统打款:'original',人工转账:'transfer',线下处理:'transfer'})[t.operation]||'unknown';if(method==='transfer')a.manualCents+=cents(t.amount);else if(method==='original')a.originalSelectedCents+=cents(t.amount);
      if(method==='unknown')a.unknownMethod=true;
      if(method==='transfer'&&t.transferBank?.account){const recipient=(t.transferBank.method||'bank')+':'+String(t.transferBank.account).trim();if(!a.recipientKey)a.recipientKey=recipient;else if(a.recipientKey!==recipient)a.recipientKey='mixed:'+appId;}
      const status=t.status==='已拒绝'?'rejected':t.recoveryStatus==='已退款'||t.status==='已退款'?'success':t.recoveryStatus==='已取消'||t.status==='已取消'?'cancelled':t.recoveryStatus==='原路退款失败'?'failed':'pending';
      const payer=method==='original'?sourcePayer(t):null;
      tasks.push({id:String(t.id),applicationId:appId,amountCents:cents(t.amount),method,status,payerKey:payer?.key||null,payerLabel:payer?.label||'',completedAt:status==='success'?t.withdrawnAt||t.processedAt||'':'',channel:t.pay||'未记录',recipient:method==='transfer'?t.transferBank?.name||'待核实':'原付款来源',recipientAccount:method==='transfer'?String(t.transferBank?.account||'').replace(/.(?=.{4})/g,'*'):payer?.label||'未接入',failureReason:t.failureReason||'',history:t.refundEvents||[]});
    }
    for(const a of apps.values())a.cancelled=tasks.filter(t=>t.applicationId===a.id).every(t=>['cancelled','rejected'].includes(t.status));
    return prepare({source:'business',asOf:today(),completePayments:false,stores:[...stores.values()],people:[...people.values()],orders:[...orders.values()],applications:[...apps.values()],tasks});
  }
  return {date,today,addDays,days,month,monthEnd,within,unique,sum,percent,cents,rules,prepare,scope,inScope,paid,originalTasks,riskAmount,riskEligible,payerCoverage,paymentPayer,alerts,metrics,periodSummary,sameDay,anomalyRows,anomalySummary,anomalyGroup,anomalyGroups,fromBusiness,knownRequest,knownCustomer,knownOrder,moment};
})();

;
/* Deterministic, isolated business examples. Never merged into payment records. */
window.RefundRiskSeed = (asOf) => {
  const M=RefundRiskModel,stores=[],people=[],orders=[],applications=[],tasks=[];
  const areas=[['华东大区','沪苏区域',['上海徐汇店','苏州园区店']],['华东大区','浙皖区域',['杭州西湖店','合肥政务店']],['华南大区','广佛区域',['广州天河店','佛山南海店']],['华南大区','深莞区域',['深圳南山店','东莞南城店']],['华北大区','京津区域',['北京朝阳店','天津和平店']],['华北大区','山东区域',['济南历下店','青岛市南店']],['华西大区','川渝区域',['成都锦江店','重庆渝北店']],['华西大区','云贵区域',['昆明盘龙店','贵阳观山湖店']]];
  const names=['林悦','陈敏','赵宁','周晴','沈佳','许岚','李晨','王琳','何静','刘洋','孙颖','徐宁','张怡','郭欣','梁欣','宋佳'];
  const projects=['面部护理疗程','身体护理套餐','头皮养护疗程','储值充值'];
  areas.forEach(([district,area,ns])=>ns.forEach(name=>{const i=stores.length,id='sample-s'+i;stores.push({id,name,district,area,category:i%3?'成熟综合店':'新开综合店'});people.push({id:'sample-sales'+i,name:names[i],role:'receptionSales',storeId:id},{id:'sample-service'+i,name:names[(i+5)%16]+' · 技师',role:'service',storeId:id});}));
  people.push({id:'sample-customer-service',name:'售后客服组',role:'applicant',storeId:null},{id:'sample-audit',name:'财务审核组',role:'auditor',storeId:null});
  let sequence=0;
  function request(o,at,kind='normal',amount=o.paidCents){
    if(at>asOf)return;
    const id='S-RF'+String(++sequence).padStart(5,'0'),manual=kind==='manual',pending=kind==='intent';
    // Keep existing sample identities; only original refunds occur on receipt day.
    if(!manual)at=o.paidAt;
    const a={id,orderId:o.id,amountCents:amount,submittedAt:at+' 10:20:00',applicantId:manual?'sample-customer-service':o.receptionSalesId,applicantName:manual?'售后客服组':people.find(p=>p.id===o.receptionSalesId).name,operatorStoreId:o.storeId,reason:kind==='intent'?'客户申请退卡':kind==='rights'?'疗程调整':'客户行程变更',manualCents:manual?amount:0,originalSelectedCents:manual?0:amount,eligibleOriginalCents:amount,auditorId:'sample-audit',approvedAt:at+' 14:10:00',commissionOverdueCents:kind==='rights'?Math.round(amount*.08):0,refundedRightsUsable:kind==='rights',verification:manual?{result:'confirmed',by:'售后客服组',at:at+' 11:20:00',channel:'电话回访',note:'已电话确认客户申请退款及收款信息。'}:kind==='intent'?{result:'denied',by:'总部客服',at:at+' 11:20:00',note:'回访客户表示未要求退款，需进一步核实。'}:null,phoneChangedAt:kind==='intent'?M.addDays(at,-1):'',source:'sample'};
    applications.push(a);
    tasks.push({id:id+'-1',applicationId:id,amountCents:amount,method:manual?'transfer':'original',status:pending?'pending':'success',completedAt:pending?'':at+' 15:30:00',channel:'微信支付',recipient:manual?'客户确认的收款人':'原付款来源',recipientAccount:manual?'**** 4826':'原交易账户',history:[]});
    return a;
  }
  stores.forEach((s,i)=>{
    for(let mo=-3;mo<=0;mo++)for(let j=0;j<24;j++){
      const m=M.month(asOf,mo),d=String(1+(j*7+i*3)%28).padStart(2,'0'),at=m+'-'+d;
      if(at>asOf)continue;
      const id=`S-OD-${i}-${mo+3}-${j}`,o={id,customerId:'S-C'+i+'-'+j,customerName:names[(i+j)%16].slice(0,1)+'女士',storeId:s.id,paidAt:at,paidCents:[98000,168000,298000,500000][(j+i)%4],project:projects[(i+j)%4],receptionSalesId:'sample-sales'+i,serviceId:'sample-service'+i,payerKey:'sample-payer:'+i+':'+j,consumed:j%3,remaining:10-j%3,commissionCents:0};
      orders.push(o);
      if(j%(i===0?4:i===4?5:9)===0)request(o,M.addDays(at,3+j%12),(i===2||i===4)&&j===0?'manual':i===6&&j===0?'rights':'normal',j%2?o.paidCents:Math.round(o.paidCents*.6));
    }
  });
  // Evidence-rich recent examples are independent orders, not edits to a real ledger.
  for(let j=0;j<8;j++){
    const s=stores[0],at=M.addDays(asOf,-8+j),o={id:'S-OD-ACCOUNT-'+j,customerId:'S-C-ACCOUNT-'+j,customerName:names[j].slice(0,1)+'女士',storeId:s.id,paidAt:M.addDays(at,1),paidCents:300000,project:'面部护理疗程',receptionSalesId:'sample-sales0',serviceId:'sample-service0',payerKey:'sample-payer-shared',payerEmployeeId:j===7?'sample-sales0':null,consumed:0,remaining:10};
    orders.push(o);request(o,M.addDays(at,1),j===7?'intent':'normal');
  }
  for(let i=0;i<4;i++)for(let j=0;j<3;j++){
    const paidAt=M.addDays(M.monthEnd(M.month(asOf,-1)+'-01'),-j),o={id:`S-OD-PERIOD-${i}-${j}`,customerId:`S-C-PERIOD-${i}-${j}`,customerName:names[i+j].slice(0,1)+'女士',storeId:stores[i*4].id,paidAt,paidCents:500000,project:'储值充值',receptionSalesId:'sample-sales'+i*4,serviceId:'sample-service'+i*4,payerKey:`sample-period:${i}:${j}`,consumed:0,remaining:0};
    orders.push(o);request(o,M.month(asOf)+'-0'+(j+2),'manual');
  }
  const split={id:'S-OD-SPLIT',customerId:'S-C-SPLIT',customerName:'周女士',storeId:stores[5].id,paidAt:M.addDays(asOf,-1),paidCents:500000,project:'身体护理套餐',receptionSalesId:'sample-sales5',serviceId:'sample-service5',payerKey:'sample-split',consumed:0,remaining:10};orders.push(split);
  for(let j=0;j<3;j++){const a=request(split,M.addDays(asOf,-3+j),'normal',100000);a.submittedAt=split.paidAt+' 10:'+String(20+j)+':00';}
  // New examples demonstrate only rules supported by recorded identifiers.
  for(let j=0;j<3;j++){const at=M.addDays(asOf,-3+j),o={id:'S-OD-FREQUENT-'+j,customerId:'S-C-FREQUENT',customerName:'吴女士',storeId:stores[0].id,paidAt:at,paidCents:120000,project:projects[j],receptionSalesId:'sample-sales0',serviceId:'sample-service0',consumed:0,remaining:10};orders.push(o);request(o,at,'normal');}
  orders.forEach(o=>o.originalEligibleCents=o.paidCents);
  // Only isolated examples have synthetic payer identity; real ledgers are not filled.
  tasks.filter(t=>t.method==='original').forEach(t=>{const a=applications.find(a=>a.id===t.applicationId),o=orders.find(o=>o.id===a.orderId),payer=M.paymentPayer({provider:'微信支付',scope:'演示应用',id:o.payerKey||'sample-customer:'+o.customerId});t.payerKey=payer.key;t.payerLabel=payer.label;t.recipientAccount=payer.label});
  return M.prepare({source:'sample',asOf,completePayments:true,stores,people,orders,applications,tasks});
};

;
/* Read legacy sample settings only. Existing review records are preserved unchanged. */
window.RefundRiskStorage = (() => {
  const name='weid-pc-refund-risk-v1',listeners=new Set();let dbPromise,channel,current;
  const copy=x=>JSON.parse(JSON.stringify(x));
  function validate(v){if(v?.schema!==1||!Number.isInteger(v.revision)||!v.cases||typeof v.cases!=='object'||Array.isArray(v.cases)||!/^\d{4}-\d{2}-\d{2}$/.test(v.sampleDate))throw Error('历史看板配置格式不兼容，原记录已保留。');return v}
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let req,settled=false;const timer=setTimeout(()=>finish(Error('看板配置数据库打开超时，请关闭旧页面后重试。')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=indexedDB.open(name,1)}catch(e){finish(Error('看板配置暂时无法读取：'+e.message));return}
      req.onupgradeneeded=()=>req.result.createObjectStore('state');
      req.onerror=()=>finish(Error('看板配置数据库不可用：'+(req.error?.message||'请检查浏览器存储权限')));
      req.onblocked=()=>finish(Error('看板配置数据库被旧页面占用，请关闭旧页面后重试。'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};finish(null,db)};
    }).catch(e=>{dbPromise=null;throw e});return dbPromise;
  }
  async function read(){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readonly'),store=tx.objectStore('state'),req=store.get('current');let value,error;
      req.onsuccess=()=>{try{value=req.result===undefined?{schema:1,revision:0,sampleDate:RefundRiskModel.today(),cases:{}}:validate(req.result)}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{current=value;resolve(copy(value))};tx.onabort=tx.onerror=()=>reject(error||Error('看板配置读取失败，原数据未改动：'+(tx.error?.message||'存储事务未完成')));
    });
  }
  try{channel=new BroadcastChannel(name);channel.onmessage=()=>listeners.forEach(fn=>fn())}catch{}
  return {read,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},get current(){return current}};
})();

;
/* User-approved BI visual exception; isolated from all ordinary PC controls. */
window.RefundRiskApp = (() => {
  const M=RefundRiskModel,E=esc;
  const S={tab:'districts',source:'sample',filters:{},page:1,size:10,stack:[],active:false,error:'',sourceError:'',storageError:'',stored:{schema:1,revision:0,sampleDate:M.today(),cases:{}}};
  const datasets={},tabs=[['districts','大区'],['areas','区域'],['stores','门店'],['employees','员工']];
  let lastURL='',refreshing=false;
  const call=(method,...args)=>'RefundRiskApp.'+method+'('+args.map(x=>JSON.stringify(x)).join(',')+')';
  const button=(label,method,args=[],cls='',attrs='')=>`<button type="button" class="rr-btn ${cls}" onclick="${E(call(method,...args))}" ${attrs}>${E(label)}</button>`;
  const link=(label,method,args=[],attrs='')=>button(label,method,args,'rr-link',attrs);
  const currency=n=>Number.isFinite(n)?(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const note=t=>`<p class="rr-note">${E(t)}</p>`;
  const tag=(t,type='')=>`<span class="rr-tag ${type}">${E(t)}</span>`;
  const data=()=>datasets[S.source],person=id=>data().personMap.get(id)?.name||(id?'员工 '+id:'接待销售未接入'),store=id=>data().storeMap.get(id)?.name||'门店待核实';
  const filter=()=>S.filters[S.tab]||(S.filters[S.tab]=defaults(S.tab));
  function defaults(tab){const end=data()?.asOf||M.today();return {from:M.addDays(end,-29),to:end,district:'',area:'',store:'',period:'30',rule:'',keyword:''};}
  function options(values,value){return values.map(x=>{const [v,l]=Array.isArray(x)?x:[x,x];return `<option value="${E(v)}" ${String(v)===String(value)?'selected':''}>${E(l)}</option>`}).join('')}
  function select(label,key,values,value){return `<label class="rr-filter"><span>${E(label)}</span><select aria-label="${E(label)}" data-filter="${E(key)}" onchange="${E(call('change',key))}">${options(values,value)}</select></label>`}
  function card(title,html,actions=''){return `<section class="rr-card"><div class="rr-card-head"><h2>${E(title)}</h2><div class="rr-actions">${actions}</div></div>${html}</section>`}
  function table(headers,rows){return `<div class="rr-table-scroll" role="region" aria-label="数据明细，可横向滚动"><table class="rr-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(c=>`<td>${c}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}" class="rr-empty">暂无符合条件的数据</td></tr>`}</tbody></table></div>`}
  function segments(items,selected,method){return `<div class="rr-segmented" role="tablist" aria-label="${method==='setTab'?'分析视角':'分析维度'}">${items.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===selected}" tabindex="${id===selected?0:-1}" class="${id===selected?'rr-active':''}" onclick="${E(call(method,id))}">${E(label)}</button>`).join('')}</div>`}
  function paginate(rows,scope='main'){const h=scope==='main'?S:S.stack.at(-1),size=h.size||10;h.page=Math.max(1,Math.min(h.page||1,Math.ceil(rows.length/size)||1));return {rows:rows.slice((h.page-1)*size,h.page*size),footer:`<div class="rr-table-footer"><span>共 ${rows.length} 条</span><div class="rr-actions"><label>每页 <select aria-label="${scope==='main'?'列表':'抽屉'}每页条数" onchange="${E(call('pageSize',scope))}">${options([10,20,50],size)}</select> 条</label>${button('上一页','paging',[scope,-1],'',h.page===1?'disabled':'')}<span>${h.page} / ${Math.max(1,Math.ceil(rows.length/size))}</span>${button('下一页','paging',[scope,1],'',h.page*size>=rows.length?'disabled':'')}</div></div>`};}
  function readBusiness(){S.sourceError='';try{const read=key=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):{}},pc=read('weidong-unified-backend-v1')||{},mobile=read('weidong-v3-standalone-release-1')||{};if(pc.refunds&&!Array.isArray(pc.refunds)||mobile.refundTasks&&!Array.isArray(mobile.refundTasks))throw Error('退款业务记录格式不兼容');datasets.business=M.fromBusiness(pc,mobile)}catch(e){S.sourceError='退款业务记录暂时无法读取，原记录未改动：'+e.message;datasets.business=M.fromBusiness()}}
  async function initialize(){try{S.stored=await RefundRiskStorage.read()}catch(e){S.storageError=e.message}datasets.sample=RefundRiskSeed(S.stored.sampleDate);readBusiness();RefundRiskStorage.subscribe(refreshExternal);window.addEventListener('focus',refreshExternal);window.addEventListener('storage',event=>{if(['weidong-unified-backend-v1','weidong-v3-standalone-release-1'].includes(event.key))refreshExternal()});document.addEventListener('keydown',keydown,true);}
  async function refreshExternal(){if(!S.active||refreshing)return;refreshing=true;try{readBusiness();const next=await RefundRiskStorage.read();if(next.sampleDate!==S.stored.sampleDate)datasets.sample=RefundRiskSeed(next.sampleDate);S.stored=next;S.storageError='';}catch(e){S.storageError=e.message}finally{refreshing=false;render();if(S.stack.length)draw()}}
  function url(){const f=filter(),p=new URLSearchParams({tab:S.tab,source:S.source,from:f.from,to:f.to});for(const k of ['district','area','store','rule','keyword'])if(f[k])p.set(k,f[k]);history.replaceState(null,'','#refund-risk?'+p);lastURL=location.hash;}
  function enter(){S.active=true;readBusiness();if(lastURL!==location.hash){const p=new URLSearchParams(location.hash.split('?')[1]||'');S.tab=tabs.some(x=>x[0]===p.get('tab'))?p.get('tab'):'districts';S.source=p.get('source')==='business'?'business':'sample';const f=defaults(S.tab);for(const k of ['district','area','store','rule','keyword'])if(p.has(k))f[k]=p.get(k);for(const k of ['from','to'])if(/^\d{4}-\d{2}-\d{2}$/.test(p.get(k)||''))f[k]=p.get(k);if(f.from>f.to||!Number.isFinite(M.days(f.from,f.to))||M.days(f.from,f.to)>366)Object.assign(f,defaults(S.tab));if(f.rule&&!M.rules.some(r=>r.id===f.rule))f.rule='';if(p.has('from'))f.period='custom';S.filters[S.tab]=f;S.page=1;}render();}
  function filters(){const f=filter(),d=data(),stores=d.stores.filter(s=>(!f.district||s.district===f.district)&&(!f.area||s.area===f.area));return `<div class="rr-filter-shell"><div class="rr-filters">${select('异常日期','period',[['today','今天'],['7','近 7 天'],['30','近 30 天'],['month','本月'],['last','上月'],['custom','自定义日期']],f.period)}<div class="rr-dates"><input type="date" aria-label="开始日期" value="${E(f.from)}" onchange="${E(call('dateChange'))}"><span>至</span><input type="date" aria-label="结束日期" value="${E(f.to)}" onchange="${E(call('dateChange'))}"></div>${select('大区','district',[['','全部大区'],...M.unique(d.stores.map(s=>s.district))],f.district)}${select('区域','area',[['','全部区域'],...M.unique(d.stores.filter(s=>!f.district||s.district===f.district).map(s=>s.area))],f.area)}${select('门店','store',[['','全部门店'],...stores.map(s=>[s.id,s.name])],f.store)}${select('异常类型','rule',[['','全部类型'],...M.rules.map(r=>[r.id,r.name])],f.rule)}${select('数据范围','source',[['sample','经营样例'],['business','退款业务记录']],S.source)}${link('重置','reset')}${link('刷新数据','reload')}</div></div>`}
  function render(){if(!S.active)return;url();$('#main').innerHTML=`<div id="rr-app" class="rr" data-pc-native><header class="rr-header"><div class="rr-head-left"><span class="rr-brand">${icon('chart')}</span><h1>退款风险看板</h1></div><div class="rr-actions"><span class="rr-badge">${S.source==='sample'?'全国经营样例':'退款业务记录'}</span>${button('指标说明','definitions')}${button('导出异常数据','exportCurrent')}</div></header>${filters()}${S.error?`<div class="rr-error" role="alert">${E(S.error)}</div>`:''}${S.storageError?`<div class="rr-error" role="alert">${E(S.storageError)} 历史样例配置暂不可读，当前数据仍可查看。${link('重试读取','reload')}</div>`:''}${S.source==='business'&&S.sourceError?`<div class="rr-error" role="alert">${E(S.sourceError)}</div>`:''}<div class="rr-dashboard"><div class="rr-primary-tabs">${segments(tabs,S.tab,'setTab')}</div><div class="rr-dashboard-content" role="tabpanel" aria-label="${E(tabs.find(x=>x[0]===S.tab)[1])}">${A.views.dimension()}</div></div><footer class="rr-foot">数据来源：${S.source==='sample'?'独立经营样例，不与退款业务记录合并':'PC 退款记录 / 同源门店退款申请'} · 分析截至 ${E(data().asOf)} · 预警是待核实线索，不等于确认违规</footer></div>`;}
  function open(item){if(S.stack.length>=2){if(['ledger','analysis'].includes(S.stack.at(-1).type)&&item.type==='detail')S.stack.pop();else return;}item.page=1;item.size=10;item.opener=document.activeElement;S.stack.push(item);draw();queueMicrotask(()=>document.getElementById('rr-drawer-'+(S.stack.length-1))?.focus({preventScroll:true}));}
  function draw(){S.stack.forEach((item,i)=>{const scroll=document.querySelector('#rr-drawer-'+i+' .rr-drawer-content')?.scrollTop||0;syncDrawerLayer($('#mergeDrawers'),'rr-'+i,`<div class="rr rr-overlay" data-pc-native onclick="if(event.target===this&&!this.dataset.closing)${E(call('close'))}"><section id="rr-drawer-${i}" class="rr-drawer ${item.width===560?'rr-narrow':''}" role="dialog" aria-modal="true" aria-label="${E(item.title)}" tabindex="-1"><header class="rr-drawer-header"><h2>${E(item.title)}</h2><button type="button" class="rr-close" aria-label="关闭${E(item.title)}" onclick="${E(call('close'))}">×</button></header><div class="rr-drawer-content">${A.views.drawer(item)}</div><footer class="rr-drawer-footer"><div class="rr-error" role="alert">${E(item.error||'')}</div><div class="rr-actions">${button('关闭','close')}</div></footer></section></div>`);document.querySelector('#rr-drawer-'+i+' .rr-drawer-content').scrollTop=scroll;});for(let i=S.stack.length;i<3;i++)syncDrawerLayer($('#mergeDrawers'),'rr-'+i,'');sync();}
  function sync(){syncDrawerInteraction();S.stack.forEach((_,i)=>{const p=document.getElementById('rr-drawer-'+i);if(p)p.inert=i!==S.stack.length-1})}
  function close(){const item=S.stack.pop();if(!item)return;draw();setTimeout(()=>{sync();if(item.opener?.isConnected&&!item.opener.closest('[inert]'))item.opener.focus({preventScroll:true});else document.getElementById('rr-drawer-'+(S.stack.length-1))?.focus({preventScroll:true})},drawerMotionTime()+20)}
  function csv(name,headers,rows){const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@\-]/,"'$&").replaceAll('"','""')+'"',blob=new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function keydown(event){if(!S.active)return;const tab=event.target.closest('.rr-segmented [role=tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const bs=[...tab.parentElement.children],idx=bs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?bs.length-1:(idx+(event.key==='ArrowRight'?1:-1)+bs.length)%bs.length,label=bs[next].textContent,root=tab.closest('.rr-drawer')?.id||'rr-app';bs[next].click();document.querySelectorAll('#'+root+' .rr-segmented button').forEach(el=>{if(el.textContent===label)el.focus()});return}if(!S.stack.length)return;const panel=document.getElementById('rr-drawer-'+(S.stack.length-1));if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return}if(event.key==='Tab'){const els=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);if(event.shiftKey&&(document.activeElement===els[0]||document.activeElement===panel)){event.preventDefault();els.at(-1)?.focus()}else if(!event.shiftKey&&(document.activeElement===els.at(-1)||document.activeElement===panel)){event.preventDefault();els[0]?.focus()}}}
  const A={S,M,E,tabs,call,button,link,currency,note,tag,data,person,store,filter,options,select,card,table,segments,paginate,open,draw,render,csv,views:{},initialize,enter,
    setTab(tab){if(!tabs.some(x=>x[0]===tab))return;const f={...filter()};S.tab=tab;S.filters[tab]={...f,keyword:''};S.page=1;S.error='';render()},
    change(key){const value=document.querySelector('#rr-app [data-filter="'+key+'"]').value;if(key==='source'){readBusiness();S.source=value;S.filters={};S.page=1;render();return}const f=filter();f[key]=value;if(key==='district'){f.area='';f.store=''}if(key==='area')f.store='';if(key==='period'){const now=data().asOf;if(value==='today'){f.from=now;f.to=now}else if(['7','30'].includes(value)){f.from=M.addDays(now,1-Number(value));f.to=now}else if(value==='month'){f.from=M.month(now)+'-01';f.to=now}else if(value==='last'){f.from=M.month(now,-1)+'-01';f.to=M.monthEnd(f.from)}}S.page=1;S.error='';render()},
    dateChange(){const from=$('#rr-app [aria-label="开始日期"]').value,to=$('#rr-app [aria-label="结束日期"]').value;if(!from||!to||from>to||M.days(from,to)>366){S.error='请选择有效日期，结束日期不得早于开始日期，单次最多分析 366 天。';render();return}Object.assign(filter(),{from,to,period:'custom'});S.error='';S.page=1;render()},
    reset(){S.filters[S.tab]=defaults(S.tab);S.error='';S.page=1;render()},
    async reload(){try{S.stored=await RefundRiskStorage.read();S.storageError='';datasets.sample=RefundRiskSeed(S.stored.sampleDate)}catch(e){S.storageError=e.message}readBusiness();render();if(S.stack.length)draw()},
    keyword(){filter().keyword=$('#rr-app input[type=search]')?.value.trim()||'';S.page=1;render()},
    paging(scope,delta){(scope==='main'?S:S.stack.at(-1)).page+=delta;scope==='main'?render():draw()},
    pageSize(scope){const el=document.querySelector(`[aria-label="${scope==='main'?'列表':'抽屉'}每页条数"]`),h=scope==='main'?S:S.stack.at(-1);h.size=Number(el.value);h.page=1;scope==='main'?render():draw()},
    detail(id){open({type:'detail',title:(M.riskEligible(data(),data().applicationMap.get(id))?'异常数据明细':'退款申请详情')+' · '+id,id,tab:M.riskEligible(data(),data().applicationMap.get(id))?'evidence':'funds'})},detailTab(tab){if(!['evidence','funds'].includes(tab))return;S.stack.at(-1).tab=tab;draw()},
    drawerSearch(){const item=S.stack.at(-1);item.keyword=$('#rr-drawer-'+(S.stack.length-1)+' input[type=search]').value.trim();item.page=1;draw()},
    close,
    leave(){S.active=false;S.stack=[];draw()}
  };return A;
})();

;
/* Four organizational views of the same automatically detected original refunds. */
(() => {
  const A=RefundRiskApp,{S,M,E,data,person,store,filter,call,button:b,link,currency:money,note,tag,card,table,segments,paginate,open}=A;
  const label=()=>A.tabs.find(x=>x[0]===S.tab)[1];
  const groups=()=>M.anomalyGroups(data(),filter(),S.tab);
  const sorted=rows=>[...rows].sort((a,b)=>M.moment(b.firstAt)-M.moment(a.firstAt)||a.id.localeCompare(b.id));
  const reason=x=>`<div class="rr-reason">${E(x.matches.map(m=>m.detail).join('；'))}</div>`;
  const types=x=>`<div class="rr-tags">${x.matches.map(m=>tag(m.name,'rr-warn')).join('')}</div>`;
  function definition(pairs){return `<dl class="rr-definition">${pairs.map(([a,b])=>`<dt>${E(a)}</dt><dd>${E(b)}</dd>`).join('')}</dl>`}
  function metric(title,value,unit,foot){return `<div class="rr-metric"><div class="rr-metric-label">${E(title)}</div><strong class="rr-metric-value">${E(value)}<small>${E(unit)}</small></strong><div class="rr-metric-foot">${E(foot)}</div></div>`}
  function payerCount(g){const c=g.coverage,n=g.summary.payer;return c.total&&!c.identified?'待接入账户标识':c.missing?n+'（部分可识别）':n}
  function coverage(){
    const d=data(),f=filter(),apps=M.scope(d,f).filter(a=>M.riskEligible(d,a)&&M.within(a.submittedAt,f.from,f.to)),c=M.payerCoverage(d,apps),messages=[];
    if(c.missing)messages.push(`${c.missing} 条原路退款任务缺少原付款账户唯一标识，多客户同账户退款${c.identified?'仅能部分识别':'暂不能识别'}`);
    const missing=apps.filter(a=>!M.knownRequest(a)||!M.knownCustomer(d.orderMap.get(a.orderId))||!M.knownOrder(d.orderMap.get(a.orderId))||!Number.isFinite(M.moment(a.submittedAt))).length;
    if(missing)messages.push(`${missing} 笔申请缺少识别所需的客户、订单、申请编号或有效时间，部分规则无法计算`);
    const undated=M.scope(d,f).filter(a=>M.riskEligible(d,a)&&!Number.isFinite(M.moment(a.submittedAt))).length;
    if(undated)messages.push(`${undated} 笔申请缺少有效申请时间，无法归入当前日期范围`);
    if(S.tab==='employees'){
      const unknown=apps.filter(a=>!d.orderMap.get(a.orderId).receptionSalesId).length;
      if(unknown)messages.push(`${unknown} 笔原路申请未接入接待销售；其中已识别的异常单列展示，不以退款申请人代替`);
    }
    return messages.length?note('数据完整性：'+messages.join('；')+'。当前仅展示已识别的异常，未识别不代表没有风险。'):'';
  }
  function groupHeaders(){return [S.tab==='employees'?'接待销售':label(),...(S.tab==='districts'?[]:S.tab==='areas'?['所属大区']:S.tab==='stores'?['所属大区 / 区域']:['订单所属门店']),'异常申请 / 笔','异常原路申请金额 / 元','涉及客户数',...(S.tab==='districts'||S.tab==='areas'?['涉及门店数']:[]),'同一客户频繁退款 / 笔','多客户同账户退款 / 笔','最近异常时间','操作']}
  function dimension(){
    const gs=groups(),summary=M.anomalySummary(gs.flatMap(g=>g.rows)),p=paginate(gs),f=filter();
    const rows=p.rows.map(g=>[link(g.name,'groupDetail',[g.key])+(g.employeeId?`<small>${E(g.employeeId)}</small>`:''),...(S.tab==='districts'?[]:[`<div class="rr-group-context">${E(g.parents.join(S.tab==='stores'?' / ':'、'))}</div>`]),g.summary.count,money(g.summary.amountCents),g.summary.customers,...(S.tab==='districts'||S.tab==='areas'?[g.summary.stores]:[]),g.summary.frequency,payerCount(g),E(g.summary.lastAt),link('异常明细','groupDetail',[g.key])]);
    return `<div class="rr-metrics">${metric('异常申请',summary.count,'笔','同一申请命中多类只计一次')}${metric('异常原路申请金额',money(summary.amountCents),'元','命中异常的原路申请金额')}${metric('涉及客户',summary.customers,'人','按客户编号去重')}${metric('涉及门店',summary.stores,'家','按订单所属门店去重')}</div>`+
      `<div class="rr-ledger-toolbar"><span>${S.tab==='employees'?'按订单接待销售汇总':'按订单所属'+label()+'汇总'} · 只显示已识别异常的数据</span><input type="search" aria-label="搜索${E(label())}" placeholder="${S.tab==='employees'?'接待销售、员工编号或门店':label()+'名称'}" value="${E(f.keyword)}" onchange="${E(call('keyword'))}" onkeydown="if(event.key==='Enter')${E(call('keyword'))}"></div>`+
      coverage()+card(label()+'退款异常',table(groupHeaders(),rows)+p.footer)+
      `<p class="rr-caption">按触发异常的申请日期统计，仅计算原路退款。金额为申请金额，包含未成功退款；同一申请可命中两类，类型笔数不能直接相加。</p>`;
  }
  function ledgerRows(item){
    const ids=new Set(item.ids),keyword=String(item.keyword||'').toLocaleLowerCase();
    return sorted(M.alerts(data()).filter(x=>ids.has(x.application.id)&&(!keyword||[x.application.id,x.order.id,x.order.customerName,x.order.customerId,store(x.order.storeId),person(x.order.receptionSalesId)].some(v=>String(v||'').toLocaleLowerCase().includes(keyword)))));
  }
  function anomalyTable(rows){return table(['客户 / 客户编号','门店 / 接待销售','原订单 / 退款申请','异常原路申请金额 / 元','异常类型','触发依据','异常时间','操作'],rows.map(x=>[
    E(x.order.customerName)+`<small>${E(x.order.customerId||'未接入')}</small>`,E(store(x.order.storeId))+`<small>${E(person(x.order.receptionSalesId))}</small>`,E(x.order.id)+`<small>${E(x.application.id)}</small>`,money(x.amountCents),types(x),reason(x),E(x.firstAt),link('查看','detail',[x.application.id])
  ]))}
  function detail(item){
    const d=data(),a=d.applicationMap.get(item.id);if(!a)return note('关联退款申请已不在当前数据源中。');
    const o=d.orderMap.get(a.orderId),s=d.storeMap.get(o.storeId)||{},alert=M.alerts(d).find(x=>x.application.id===a.id),ts=M.originalTasks(d,a);
    const top=`<div class="rr-detail-kpis"><div><small>原路申请金额 / 元</small><b>${money(M.riskAmount(d,a))}</b></div><div><small>其中已成功 / 元</small><b>${money(M.sum(ts,t=>t.status==='success'?t.amountCents:0))}</b></div><div><small>客户</small><b>${E(o.customerName)}</b></div><div><small>接待销售</small><b>${E(person(o.receptionSalesId))}</b></div></div>`+
      definition([['所属组织',[s.district,s.area,store(o.storeId)].filter(Boolean).join(' / ')],['原订单 / 退款申请',o.id+' / '+a.id],['申请时间',a.submittedAt||'未接入']]);
    let html='';
    if(item.tab==='evidence'){
      html=alert?alert.matches.map(m=>`<section class="rr-evidence"><h3>${E(m.name)}</h3><p>${E(m.detail)}</p></section>`).join(''):note('当前记录未命中自动识别规则。');
      const accounts=alert?.matches.find(m=>m.id==='payer')?.accounts||[],ids=new Set((alert?.matches||[]).flatMap(m=>m.applicationIds||[])),payerOnly=alert?.matches.every(m=>m.id==='payer'),taskIds=new Set(accounts.flatMap(x=>x.taskIds));
      if(accounts.length)html+=card('同一原付款账户关联数据',table(['原付款账户（脱敏）','不同客户数','关联申请数','关联原路申请 / 元','其中已成功 / 元'],accounts.map(x=>[E(x.label),x.customerCount,x.applicationIds.length,money(x.amountCents),money(x.successCents)])));
      if(ids.size)html+=card('触发异常的关联申请',table(['客户 / 客户编号','订单所属门店','接待销售','原订单 / 退款申请','原付款账户（脱敏）','关联原路申请 / 元','申请时间'],d.applications.filter(a=>ids.has(a.id)).map(a=>{
        const o=d.orderMap.get(a.orderId),tasks=M.originalTasks(d,a).filter(t=>!payerOnly||taskIds.has(t.id));
        return [E(o.customerName)+`<small>${E(o.customerId||'未接入')}</small>`,E(store(o.storeId)),E(person(o.receptionSalesId)),E(a.orderId)+`<small>${E(a.id)}</small>`,E(M.unique(tasks.map(t=>t.payerLabel||'待接入账户标识')).join('；')),money(M.sum(tasks,t=>t.amountCents)),E(a.submittedAt)];
      })))+note('关联申请用于说明触发依据，可能来自其他门店或早于当前筛选日期，不会重复计入当前汇总。人工转款不参与识别。');
    }else{
      html=card('原订单',table(['原收款日期','原实收 / 元','项目'],[[E(o.paidAt||'未接入'),money(o.paidCents),E(o.project||'未接入')]]))+
        card('原路退款执行记录',table(['任务编号','原路金额 / 元','退款状态','完成时间','原付款账户（脱敏）'],(d.taskMap.get(a.id)||[]).filter(t=>t.method==='original').map(t=>[E(t.id),money(t.amountCents),E(({success:'已退款',pending:'待处理',failed:'退款失败',cancelled:'已取消',rejected:'已拒绝'})[t.status]||'状态未接入'),E(t.completedAt||'—'),E(t.payerLabel||'待接入账户标识')])));
    }
    return top+segments([['evidence','异常依据'],['funds','订单与原路退款']],item.tab,'detailTab')+`<div class="rr-detail-content">${html}</div>`;
  }
  function drawer(item){
    if(item.type==='detail')return detail(item);
    if(item.type==='analysis')return item.content;
    if(item.type==='ledger'){
      const rows=ledgerRows(item),p=paginate(rows,'drawer');
      return note(item.intro)+`<div class="rr-drawer-toolbar"><input type="search" aria-label="抽屉内搜索" placeholder="客户、门店、接待销售或单号" value="${E(item.keyword||'')}" onchange="${E(call('drawerSearch'))}" onkeydown="if(event.key==='Enter')${E(call('drawerSearch'))}">${b('导出明细','exportDrawer')}</div>`+anomalyTable(p.rows)+p.footer;
    }
    return '';
  }
  A.views={dimension,drawer};
  A.groupDetail=key=>{
    const g=groups().find(x=>x.key===key);if(!g)return;
    open({type:'ledger',title:g.name+' · 退款异常',ids:g.rows.map(x=>x.application.id),intro:`异常日期：${filter().from} 至 ${filter().to}；异常类型：${M.rules.find(r=>r.id===filter().rule)?.name||'全部类型'}。按触发申请去重，仅展示已识别的原路退款异常。`});
  };
  A.exportCurrent=()=>A.csv(label()+'退款异常',['数据来源',...(S.tab==='employees'?['接待销售编号']:[]),...groupHeaders().slice(0,-1)],groups().map(g=>[
    S.source==='sample'?'经营样例':'退款业务记录',...(S.tab==='employees'?[g.employeeId||'未接入']:[]),g.name,...(S.tab==='districts'?[]:[g.parents.join(S.tab==='stores'?' / ':'、')]),g.summary.count,(g.summary.amountCents/100).toFixed(2),g.summary.customers,...(S.tab==='districts'||S.tab==='areas'?[g.summary.stores]:[]),g.summary.frequency,payerCount(g),g.summary.lastAt
  ]));
  A.exportDrawer=()=>A.csv('退款异常明细',['数据来源','客户','客户编号','大区','区域','门店','接待销售','接待销售编号','原订单','退款申请','异常原路申请金额 / 元','异常类型','触发依据','异常时间'],ledgerRows(S.stack.at(-1)).map(x=>{
    const s=data().storeMap.get(x.order.storeId)||{};
    return [S.source==='sample'?'经营样例':'退款业务记录',x.order.customerName,x.order.customerId,s.district,s.area,store(x.order.storeId),person(x.order.receptionSalesId),x.order.receptionSalesId||'未接入',x.order.id,x.application.id,(x.amountCents/100).toFixed(2),x.matches.map(m=>m.name).join('、'),x.matches.map(m=>m.detail).join('；'),x.firstAt];
  }));
  A.definitions=()=>open({type:'analysis',title:'异常数据口径',content:definition([
    ['统计范围','仅分析原路退款申请，人工转款不参与异常识别。待处理、退款失败和已成功的有效原路申请均可触发；已取消、已拒绝的部分排除。'],
    ['异常申请 / 金额','按触发自动规则的退款申请去重；同一申请命中两类只算一笔，原路金额也只算一次。金额是申请中的有效原路部分，不等于已成功退款或确认损失。'],
    ['日期与组织','按触发异常的申请日期筛选，归属原订单所在的大区、区域及门店。规则始终检查完整数据中的连续 7 个自然日，跨店关联和筛选开始日前的关联申请仍作为判断依据。'],
    ['员工归属','仅按订单接待销售的唯一员工编号汇总，不以原销售、服务人员、退款申请人或财务审核人代替。缺失接待销售的异常归入“接待销售未接入”。'],
    ['客户数 / 门店数','当前异常申请涉及的客户和门店分别按编号去重。同一客户跨店退款时，各组客户数相加可能大于总客户数。'],
    ['两类异常笔数','分别计算命中该规则的申请数，同一申请可以同时出现在两类中；不是关联订单数、支付任务数或确认违规数量。'],
    ['数据缺失','缺少客户、订单、原申请编号或有效时间时，相关规则可能无法计算。同账户识别还需支付渠道、作用域和稳定账户唯一标识；不按姓名、支付方式、流水号或脱敏尾号推断。']
  ])+M.rules.map(r=>`<section class="rr-evidence"><h3>${E(r.name)}</h3><p>${E(r.description)}</p></section>`).join('')});
})();

;
/* Register synchronously. The loader awaits initialization without top-level writes. */
window.PCModules['refund-risk']={
  ready:Promise.resolve().then(()=>RefundRiskApp.initialize()),
  render:()=>RefundRiskApp.enter(),
  leave:()=>RefundRiskApp.leave()
};
