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
    {id:'intent',name:'客户意愿异常',description:'客户否认申请或金额；申请前 7 天内变更联系方式。'},
    {id:'payer',name:'付款账户异常',description:'同一付款标识在 7 天内关联至少 3 位退款客户，或已有员工代付记录。仅作核实线索。'},
    {id:'period',name:'跨月业绩异常',description:'月末最后 5 天收款，次月前 15 天申请退款；结合提成及客户意愿核实。'},
    {id:'frequency',name:'频次与拆分异常',description:'同一客户 7 天内至少 3 笔退款申请，合计不低于 3,000 元。'},
    {id:'rights',name:'退款后业务不一致',description:'有明确证据表明已退款权益仍可使用，或应冲回的提成逾期未处理。'}
  ];
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
  // contribute to overall refunds and cohort rates, but never to risk thresholds.
  function riskAmount(data,a){return a&&!a.cancelled?sum(data.taskMap.get(a.id)||[],t=>t.method==='original'&&!['cancelled','rejected'].includes(t.status)?t.amountCents:0):0}
  function riskEligible(data,a){return riskAmount(data,a)>0}
  function stateFor(data,a,states){return states[data.source+':'+a.id]||{status:'待分配',owner:'',verification:null,history:[],conclusion:'',note:''}}
  function alerts(data,states={}){
    const candidates=data.applications.filter(a=>riskEligible(data,a));
    return candidates.flatMap(a=>{
      const o=data.orderMap.get(a.orderId);if(!o||a.cancelled)return [];
      const s=stateFor(data,a,states),v=s.verification?.result||a.verification?.result||'unknown';
      const matches=[],add=(id,detail,priority=2)=>matches.push({id,detail,priority,name:rules.find(x=>x.id===id).name});
      if(['denied','amount'].includes(v))add('intent',v==='denied'?'客户独立核实结果为“未要求退款”。':'客户反馈退款金额与申请金额不一致。',1);
      else if(a.phoneChangedAt&&days(a.phoneChangedAt,a.submittedAt)>=0&&days(a.phoneChangedAt,a.submittedAt)<=7)add('intent','申请前 7 天内客户联系方式发生变更，需通过可信历史联系方式核实。');
      const recent=candidates.filter(b=>days(b.submittedAt,a.submittedAt)>=0&&days(b.submittedAt,a.submittedAt)<=7);
      const payer=o.payerKey?recent.filter(b=>data.orderMap.get(b.orderId)?.payerKey===o.payerKey):[];
      const customers=unique(payer.map(b=>data.orderMap.get(b.orderId).customerId));
      if(o.payerEmployeeId)add('payer','原付款记录标注员工代付，关联员工：'+(data.personMap.get(o.payerEmployeeId)?.name||o.payerEmployeeId)+'；需核实客户实际交款方式。');
      else if(customers.length>=3)add('payer',`申请时点前 7 天，同一付款标识关联 ${customers.length} 位退款客户、${payer.length} 笔申请；付款关系待核实。`);
      if(Number.isFinite(days(o.paidAt,a.submittedAt))&&days(o.paidAt,monthEnd(o.paidAt))<5&&month(o.paidAt,1)===month(a.submittedAt)&&Number(date(a.submittedAt).slice(-2))<=15)add('period','原收款发生在月末最后 5 天，次月前 15 天申请退款。',3);
      const group=recent.filter(b=>data.orderMap.get(b.orderId)?.customerId===o.customerId);
      if(group.length>=3&&sum(group,b=>riskAmount(data,b))>=300000)add('frequency',`同一客户在 7 天内申请 ${group.length} 笔原路退款，累计 ${(sum(group,b=>riskAmount(data,b))/100).toFixed(2)} 元。`);
      if(paid(data,a,'original')>0&&(a.refundedRightsUsable===true||a.commissionOverdueCents>0))add('rights',[a.refundedRightsUsable?'已退项目权益仍可使用的记录待核对':'',a.commissionOverdueCents>0?'应冲回提成逾期未处理 '+(a.commissionOverdueCents/100).toFixed(2)+' 元':''].filter(Boolean).join('；'));
      // Preserve historical evidence without replaying old manual-account or mixed
      // population thresholds. Legacy payer/frequency signals must qualify anew.
      if(!matches.length&&s.evidence?.length)matches.push(...s.evidence.filter(m=>rules.some(r=>r.id===m.id)&&(s.riskScope==='original'||['intent','period','rights'].includes(m.id))));
      if(!matches.length)return [];
      return [{id:data.source+':'+a.id,application:a,order:o,amountCents:riskAmount(data,a),matches,priority:Math.min(...matches.map(x=>x.priority)),firstAt:s.firstAt||a.alertAt||a.submittedAt,state:s}];
    });
  }
  function metrics(data,filter,states){
    const apps=scope(data,filter),ids=new Set(apps.map(a=>a.id));
    const tasks=data.tasks.filter(t=>ids.has(t.applicationId)&&t.status==='success'&&within(t.completedAt,filter.from,filter.to));
    const allAlerts=alerts(data,states).filter(x=>ids.has(x.application.id));
    const current=allAlerts.filter(x=>x.state.status!=='已结案');
    const added=allAlerts.filter(x=>within(x.firstAt,filter.from,filter.to));
    return {apps,tasks,allAlerts,current,added,amount:sum(tasks,t=>t.amountCents),orders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length,customers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId)).length,alertAmount:sum(added,x=>x.amountCents)};
  }
  function cohort(data,orders,from,to){
    const batch=orders.filter(o=>within(o.paidAt,from,to));
    if(!data.completePayments)return {available:false,total:batch.length};
    const matured=batch.filter(o=>days(o.paidAt,data.asOf)>=30),ids=new Set(matured.map(o=>o.id));
    const tasks=data.tasks.filter(t=>{const a=data.applicationMap.get(t.applicationId),o=a&&data.orderMap.get(a.orderId);return t.status==='success'&&o&&ids.has(o.id)&&days(o.paidAt,t.completedAt)>=0&&days(o.paidAt,t.completedAt)<=30});
    const denominator=sum(matured,o=>o.paidCents),numerator=sum(tasks,t=>t.amountCents);
    const customers=unique(matured.map(o=>o.customerId)).length;
    return {available:true,total:batch.length,count:matured.length,observing:batch.length-matured.length,denominator,numerator,original:sum(tasks,t=>t.method==='original'?t.amountCents:0),manual:sum(tasks,t=>t.method==='transfer'?t.amountCents:0),unknown:sum(tasks,t=>!['original','transfer'].includes(t.method)?t.amountCents:0),rate:denominator?numerator/denominator:null,customers,refundCustomers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId)).length};
  }
  function matrix(data,orders,start,count=4){
    return Array.from({length:count},(_,i)=>{
      const m=month(start,i),batch=orders.filter(o=>o.paidAt?.startsWith(m)),ids=new Set(batch.map(o=>o.id)),denominator=sum(batch,o=>o.paidCents);
      return {month:m,denominator,count:batch.length,cells:Array.from({length:4},(_,offset)=>{
        const target=month(m+'-01',offset),end=monthEnd(target+'-01');
        const tasks=data.tasks.filter(t=>{const a=data.applicationMap.get(t.applicationId);return a&&ids.has(a.orderId)&&t.status==='success'&&date(t.completedAt).startsWith(target)});
        return {month:target,amount:sum(tasks,t=>t.amountCents),future:target>data.asOf.slice(0,7),complete:end<=data.asOf};
      })};
    });
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
      if(!orders.has(orderId))orders.set(orderId,{id:orderId,customerId:t.member||'unknown:'+orderId,customerName:t.name||'未记录客户',storeId,paidAt:date(t.paymentTime||t.sourcePayment?.paidAt),paidCents:Number.isFinite(t.orderReceived)?cents(t.orderReceived):null,project:t.projects?.map(i=>i.name||i.project).filter(Boolean).join('、')||t.type||'订单退款',sellerId:null,serviceId:null,payerKey:null});
      if(!apps.has(appId))apps.set(appId,{id:appId,orderId,amountCents:0,submittedAt:t.submittedAt||'',applicantId,applicantName:t.applicant||'待核实',operatorStoreId:storeId,reason:t.reason||'未记录',manualCents:0,originalSelectedCents:0,eligibleOriginalCents:null,financeIds:[],source:'business'});
      const a=apps.get(appId);a.amountCents+=cents(t.amount);a.financeIds.push(t.id);
      const method=t.refundMethod||({系统打款:'original',人工转账:'transfer',线下处理:'transfer'})[t.operation]||'unknown';if(method==='transfer')a.manualCents+=cents(t.amount);else if(method==='original')a.originalSelectedCents+=cents(t.amount);
      if(method==='unknown')a.unknownMethod=true;
      if(method==='transfer'&&t.transferBank?.account){const recipient=(t.transferBank.method||'bank')+':'+String(t.transferBank.account).trim();if(!a.recipientKey)a.recipientKey=recipient;else if(a.recipientKey!==recipient)a.recipientKey='mixed:'+appId;}
      const status=t.status==='已拒绝'?'rejected':t.recoveryStatus==='已退款'||t.status==='已退款'?'success':t.recoveryStatus==='已取消'||t.status==='已取消'?'cancelled':t.recoveryStatus==='原路退款失败'?'failed':'pending';
      tasks.push({id:String(t.id),applicationId:appId,amountCents:cents(t.amount),method,status,completedAt:status==='success'?t.withdrawnAt||t.processedAt||'':'',channel:t.pay||'未记录',recipient:method==='transfer'?t.transferBank?.name||'待核实':'原付款来源',recipientAccount:method==='transfer'?String(t.transferBank?.account||'').replace(/.(?=.{4})/g,'*'):'未接入',failureReason:t.failureReason||'',history:t.refundEvents||[]});
    }
    for(const a of apps.values())a.cancelled=tasks.filter(t=>t.applicationId===a.id).every(t=>['cancelled','rejected'].includes(t.status));
    return prepare({source:'business',asOf:today(),completePayments:false,stores:[...stores.values()],people:[...people.values()],orders:[...orders.values()],applications:[...apps.values()],tasks});
  }
  return {date,today,addDays,days,month,monthEnd,within,unique,sum,percent,cents,rules,prepare,scope,inScope,paid,riskAmount,riskEligible,stateFor,alerts,metrics,cohort,matrix,fromBusiness};
})();
