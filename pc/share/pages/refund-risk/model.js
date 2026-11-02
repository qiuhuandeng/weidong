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
  function stateFor(data,a,states){return states[data.source+':'+a.id]||{status:'待分配',owner:'',verification:null,history:[],conclusion:'',note:''}}
  function alerts(data,states={}){
    const candidates=data.applications.filter(a=>riskEligible(data,a)&&knownRequest(a)&&Number.isFinite(moment(a.submittedAt)));
    return candidates.flatMap(a=>{
      const o=data.orderMap.get(a.orderId);if(!o||a.cancelled)return [];
      const s=stateFor(data,a,states),matches=[];
      const add=(id,group,detail)=>matches.push({id,detail,priority:2,name:rules.find(x=>x.id===id).name,applicationIds:group.map(b=>b.id)});
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
      if(accounts.length)matches.push({id:'payer',name:rules.find(r=>r.id==='payer').name,priority:2,accounts,applicationIds:unique(accounts.flatMap(x=>x.applicationIds)),taskIds:unique(accounts.flatMap(x=>x.taskIds)),detail:accounts.map(x=>`原付款账户 ${x.label}：截至本次申请，7 个自然日内关联 ${x.customerCount} 位不同客户、${x.applicationIds.length} 次原路退款申请，指向该账户的申请金额 ${(x.amountCents/100).toFixed(2)} 元，其中已成功 ${(x.successCents/100).toFixed(2)} 元。`).join('；')+'达到默认阈值 2 位客户；家庭代付等情况仍需核实，不代表已确认违规。'});
      // Retired labels and manually entered conclusions cannot create automatic
      // alerts. Stored review notes remain untouched and visible in the ledger.
      if(!matches.length)return [];
      return [{id:data.source+':'+a.id,application:a,order:o,amountCents:riskAmount(data,a),matches,priority:2,firstAt:a.submittedAt,state:s}];
    });
  }
  function metrics(data,filter,states){
    const apps=scope(data,filter),ids=new Set(apps.map(a=>a.id));
    const tasks=data.tasks.filter(t=>ids.has(t.applicationId)&&t.status==='success'&&within(t.completedAt,filter.from,filter.to));
    const allAlerts=alerts(data,states).filter(x=>ids.has(x.application.id));
    const current=allAlerts.filter(x=>x.state.status!=='已结案');
    const added=allAlerts.filter(x=>within(x.firstAt,filter.from,filter.to));
    return {apps,tasks,allAlerts,current,added,amount:sum(tasks,t=>t.amountCents),orders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length,customers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId).filter(Boolean)).length,alertAmount:sum(added,x=>x.amountCents)};
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
  return {date,today,addDays,days,month,monthEnd,within,unique,sum,percent,cents,rules,prepare,scope,inScope,paid,originalTasks,riskAmount,riskEligible,payerCoverage,paymentPayer,stateFor,alerts,metrics,periodSummary,sameDay,fromBusiness,knownRequest,knownCustomer,knownOrder,moment};
})();
