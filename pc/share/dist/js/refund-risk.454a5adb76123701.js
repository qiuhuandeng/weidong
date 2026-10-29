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
    {id:'path',name:'退款路径异常',description:'存在可用原路额度却申请人工，或人工收款账户关联多位客户。'},
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
  function paid(data,a){return sum(data.taskMap.get(a.id)||[],t=>t.status==='success'?t.amountCents:0)}
  function stateFor(data,a,states){return states[data.source+':'+a.id]||{status:'待分配',owner:'',verification:null,history:[],conclusion:'',note:''}}
  function alerts(data,states={}){
    return data.applications.flatMap(a=>{
      const o=data.orderMap.get(a.orderId);if(!o||a.cancelled)return [];
      const s=stateFor(data,a,states),v=s.verification?.result||a.verification?.result||'unknown';
      const matches=[],add=(id,detail,priority=2)=>matches.push({id,detail,priority,name:rules.find(x=>x.id===id).name});
      if(['denied','amount'].includes(v))add('intent',v==='denied'?'客户独立核实结果为“未要求退款”。':'客户反馈退款金额与申请金额不一致。',1);
      else if(a.phoneChangedAt&&days(a.phoneChangedAt,a.submittedAt)>=0&&days(a.phoneChangedAt,a.submittedAt)<=7)add('intent','申请前 7 天内客户联系方式发生变更，需通过可信历史联系方式核实。');
      const recent=data.applications.filter(b=>!b.cancelled&&days(b.submittedAt,a.submittedAt)>=0&&days(b.submittedAt,a.submittedAt)<=7);
      const payer=o.payerKey?recent.filter(b=>data.orderMap.get(b.orderId)?.payerKey===o.payerKey):[];
      const customers=unique(payer.map(b=>data.orderMap.get(b.orderId).customerId));
      if(o.payerEmployeeId)add('payer','原付款记录标注员工代付，关联员工：'+(data.personMap.get(o.payerEmployeeId)?.name||o.payerEmployeeId)+'；需核实客户实际交款方式。');
      else if(customers.length>=3)add('payer',`申请时点前 7 天，同一付款标识关联 ${customers.length} 位退款客户、${payer.length} 笔申请；付款关系待核实。`);
      if(Number.isFinite(days(o.paidAt,a.submittedAt))&&days(o.paidAt,monthEnd(o.paidAt))<5&&month(o.paidAt,1)===month(a.submittedAt)&&Number(date(a.submittedAt).slice(-2))<=15)add('period','原收款发生在月末最后 5 天，次月前 15 天申请退款。',3);
      if(a.manualCents>0&&Number.isFinite(a.eligibleOriginalCents)&&a.eligibleOriginalCents>(a.originalSelectedCents||0))add('path','申请人工退款时仍存在未选用的原路可退额度：'+((a.eligibleOriginalCents-(a.originalSelectedCents||0))/100).toFixed(2)+' 元。');
      else if(a.recipientKey&&unique(recent.filter(b=>b.recipientKey===a.recipientKey).map(b=>data.orderMap.get(b.orderId)?.customerId)).length>=3)add('path','同一人工收款账户在 7 天内关联至少 3 位退款客户。');
      const group=recent.filter(b=>data.orderMap.get(b.orderId)?.customerId===o.customerId);
      if(group.length>=3&&sum(group,b=>b.amountCents)>=300000)add('frequency',`同一客户在 7 天内申请 ${group.length} 笔，累计 ${(sum(group,b=>b.amountCents)/100).toFixed(2)} 元。`);
      if(paid(data,a)>0&&(a.refundedRightsUsable===true||a.commissionOverdueCents>0))add('rights',[a.refundedRightsUsable?'已退项目权益仍可使用的记录待核对':'',a.commissionOverdueCents>0?'应冲回提成逾期未处理 '+(a.commissionOverdueCents/100).toFixed(2)+' 元':''].filter(Boolean).join('；'));
      // Keep closed/persisted cases and their original evidence even if later verification clears a signal.
      if(!matches.length&&s.evidence?.length)matches.push(...s.evidence);
      if(!matches.length)return [];
      return [{id:data.source+':'+a.id,application:a,order:o,matches,priority:Math.min(...matches.map(x=>x.priority)),firstAt:s.firstAt||a.alertAt||a.submittedAt,state:s}];
    });
  }
  function metrics(data,filter,states){
    const apps=scope(data,filter),ids=new Set(apps.map(a=>a.id));
    const tasks=data.tasks.filter(t=>ids.has(t.applicationId)&&t.status==='success'&&within(t.completedAt,filter.from,filter.to));
    const allAlerts=alerts(data,states).filter(x=>ids.has(x.application.id));
    const current=allAlerts.filter(x=>x.state.status!=='已结案');
    const added=allAlerts.filter(x=>within(x.firstAt,filter.from,filter.to));
    return {apps,tasks,allAlerts,current,added,amount:sum(tasks,t=>t.amountCents),orders:unique(tasks.map(t=>data.applicationMap.get(t.applicationId).orderId)).length,customers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId)).length,alertAmount:sum(added,x=>x.application.amountCents)};
  }
  function cohort(data,orders,from,to){
    const batch=orders.filter(o=>within(o.paidAt,from,to));
    if(!data.completePayments)return {available:false,total:batch.length};
    const matured=batch.filter(o=>days(o.paidAt,data.asOf)>=30),ids=new Set(matured.map(o=>o.id));
    const tasks=data.tasks.filter(t=>{const a=data.applicationMap.get(t.applicationId),o=a&&data.orderMap.get(a.orderId);return t.status==='success'&&o&&ids.has(o.id)&&days(o.paidAt,t.completedAt)>=0&&days(o.paidAt,t.completedAt)<=30});
    const denominator=sum(matured,o=>o.paidCents),numerator=sum(tasks,t=>t.amountCents);
    const customers=unique(matured.map(o=>o.customerId)).length;
    return {available:true,total:batch.length,count:matured.length,observing:batch.length-matured.length,denominator,numerator,rate:denominator?numerator/denominator:null,customers,refundCustomers:unique(tasks.map(t=>data.orderMap.get(data.applicationMap.get(t.applicationId).orderId).customerId)).length};
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
  return {date,today,addDays,days,month,monthEnd,within,unique,sum,percent,cents,rules,prepare,scope,inScope,paid,stateFor,alerts,metrics,cohort,matrix,fromBusiness};
})();

;
/* Deterministic, isolated business examples. Never merged into payment records. */
window.RefundRiskSeed = (asOf) => {
  const M=RefundRiskModel,stores=[],people=[],orders=[],applications=[],tasks=[];
  const areas=[['华东大区','沪苏区域',['上海徐汇店','苏州园区店']],['华东大区','浙皖区域',['杭州西湖店','合肥政务店']],['华南大区','广佛区域',['广州天河店','佛山南海店']],['华南大区','深莞区域',['深圳南山店','东莞南城店']],['华北大区','京津区域',['北京朝阳店','天津和平店']],['华北大区','山东区域',['济南历下店','青岛市南店']],['华西大区','川渝区域',['成都锦江店','重庆渝北店']],['华西大区','云贵区域',['昆明盘龙店','贵阳观山湖店']]];
  const names=['林悦','陈敏','赵宁','周晴','沈佳','许岚','李晨','王琳','何静','刘洋','孙颖','徐宁','张怡','郭欣','梁欣','宋佳'];
  const projects=['面部护理疗程','身体护理套餐','头皮养护疗程','储值充值'];
  areas.forEach(([district,area,ns])=>ns.forEach(name=>{const i=stores.length,id='sample-s'+i;stores.push({id,name,district,area,category:i%3?'成熟综合店':'新开综合店'});people.push({id:'sample-sales'+i,name:names[i],role:'seller',storeId:id},{id:'sample-service'+i,name:names[(i+5)%16]+' · 技师',role:'service',storeId:id});}));
  people.push({id:'sample-audit',name:'财务审核组',role:'auditor',storeId:null});
  let sequence=0;
  function request(o,at,kind='normal',amount=o.paidCents){
    if(at>asOf)return;
    const id='S-RF'+String(++sequence).padStart(5,'0'),manual=kind==='path',pending=kind==='intent';
    const a={id,orderId:o.id,amountCents:amount,submittedAt:at+' 10:20:00',applicantId:o.sellerId,applicantName:people.find(p=>p.id===o.sellerId).name,operatorStoreId:o.storeId,reason:kind==='intent'?'客户申请退卡':kind==='rights'?'疗程调整':'客户行程变更',manualCents:manual?amount:0,originalSelectedCents:manual?0:amount,eligibleOriginalCents:amount,auditorId:'sample-audit',approvedAt:at+' 14:10:00',commissionOverdueCents:kind==='rights'?Math.round(amount*.08):0,refundedRightsUsable:kind==='rights',verification:kind==='intent'?{result:'denied',by:'总部客服',at:at+' 11:20:00',note:'回访客户表示未要求退款，需进一步核实。'}:null,phoneChangedAt:kind==='intent'?M.addDays(at,-1):'',source:'sample'};
    applications.push(a);
    tasks.push({id:id+'-1',applicationId:id,amountCents:amount,method:manual?'transfer':'original',status:pending?'pending':'success',completedAt:pending?'':at+' 15:30:00',channel:'微信支付',recipient:manual?'收款人待核实':'原付款来源',recipientAccount:manual?'**** 4826':'原交易账户',history:[]});
    return a;
  }
  stores.forEach((s,i)=>{
    for(let mo=-3;mo<=0;mo++)for(let j=0;j<24;j++){
      const m=M.month(asOf,mo),d=String(1+(j*7+i*3)%28).padStart(2,'0'),at=m+'-'+d;
      if(at>asOf)continue;
      const id=`S-OD-${i}-${mo+3}-${j}`,o={id,customerId:'S-C'+i+'-'+j,customerName:names[(i+j)%16].slice(0,1)+'女士',storeId:s.id,paidAt:at,paidCents:[98000,168000,298000,500000][(j+i)%4],project:projects[(i+j)%4],sellerId:'sample-sales'+i,serviceId:'sample-service'+i,payerKey:'sample-payer:'+i+':'+j,consumed:j%3,remaining:10-j%3,commissionCents:0};
      orders.push(o);
      if(j%(i===0?4:i===4?5:9)===0)request(o,M.addDays(at,3+j%12),(i===2||i===4)&&j===0?'path':i===6&&j===0?'rights':'normal',j%2?o.paidCents:Math.round(o.paidCents*.6));
    }
  });
  // Evidence-rich recent examples are independent orders, not edits to a real ledger.
  for(let j=0;j<8;j++){
    const s=stores[0],at=M.addDays(asOf,-8+j),o={id:'S-OD-ACCOUNT-'+j,customerId:'S-C-ACCOUNT-'+j,customerName:names[j].slice(0,1)+'女士',storeId:s.id,paidAt:at,paidCents:300000,project:'面部护理疗程',sellerId:'sample-sales0',serviceId:'sample-service0',payerKey:'sample-payer-shared',payerEmployeeId:j===7?'sample-sales0':null,consumed:0,remaining:10};
    orders.push(o);request(o,M.addDays(at,1),j===7?'intent':'normal');
  }
  for(let i=0;i<4;i++)for(let j=0;j<3;j++){
    const paidAt=M.addDays(M.monthEnd(M.month(asOf,-1)+'-01'),-j),o={id:`S-OD-PERIOD-${i}-${j}`,customerId:`S-C-PERIOD-${i}-${j}`,customerName:names[i+j].slice(0,1)+'女士',storeId:stores[i*4].id,paidAt,paidCents:500000,project:'储值充值',sellerId:'sample-sales'+i*4,serviceId:'sample-service'+i*4,payerKey:`sample-period:${i}:${j}`,consumed:0,remaining:0};
    orders.push(o);request(o,M.month(asOf)+'-0'+(j+2),i===1?'rights':'normal');
  }
  const split={id:'S-OD-SPLIT',customerId:'S-C-SPLIT',customerName:'周女士',storeId:stores[5].id,paidAt:M.addDays(asOf,-18),paidCents:500000,project:'身体护理套餐',sellerId:'sample-sales5',serviceId:'sample-service5',payerKey:'sample-split',consumed:0,remaining:10};orders.push(split);
  for(let j=0;j<3;j++)request(split,M.addDays(asOf,-3+j),'normal',100000);
  return M.prepare({source:'sample',asOf,completePayments:true,stores,people,orders,applications,tasks});
};

;
/* Only case work is persisted. Loading analytics never writes payment stores. */
window.RefundRiskStorage = (() => {
  const name='weid-pc-refund-risk-v1',listeners=new Set();let dbPromise,channel,current;
  const copy=x=>JSON.parse(JSON.stringify(x));
  function validate(v){if(v?.schema!==1||!Number.isInteger(v.revision)||!v.cases||typeof v.cases!=='object'||Array.isArray(v.cases)||!/^\d{4}-\d{2}-\d{2}$/.test(v.sampleDate))throw Error('退款核查记录格式不兼容，原记录已保留。');return v}
  function open(){
    if(dbPromise)return dbPromise;
    dbPromise=new Promise((resolve,reject)=>{
      let req,settled=false;const timer=setTimeout(()=>finish(Error('核查数据库打开超时，请关闭旧页面后重试。')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=indexedDB.open(name,1)}catch(e){finish(Error('核查记录暂时无法读取：'+e.message));return}
      req.onupgradeneeded=()=>req.result.createObjectStore('state');
      req.onerror=()=>finish(Error('核查数据库不可用：'+(req.error?.message||'请检查浏览器存储权限')));
      req.onblocked=()=>finish(Error('核查数据库被旧页面占用，请关闭旧页面后重试。'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();dbPromise=null};finish(null,db)};
    }).catch(e=>{dbPromise=null;throw e});return dbPromise;
  }
  async function read(){
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('current');let value,error;
      req.onsuccess=()=>{try{value=req.result===undefined?{schema:1,revision:0,sampleDate:RefundRiskModel.today(),cases:{}}:validate(req.result);if(req.result===undefined)store.add(value,'current')}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{current=value;resolve(copy(value))};tx.onabort=tx.onerror=()=>reject(error||Error('核查记录读取失败，原数据未改动：'+(tx.error?.message||'存储事务未完成')));
    });
  }
  async function save(value,expected){
    validate(value);const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('state','readwrite'),store=tx.objectStore('state'),req=store.get('current');let error;
      req.onsuccess=()=>{try{if(validate(req.result).revision!==expected||value.revision!==expected+1)throw Error('其他页面已更新核查记录，本次修改尚未保存。请保留填写内容并重新载入最新记录。');store.put(value,'current')}catch(e){error=e;tx.abort()}};
      tx.oncomplete=()=>{current=copy(value);try{channel?.postMessage({revision:current.revision})}catch{}resolve(copy(value))};
      tx.onabort=tx.onerror=()=>reject(error||Error('保存失败，原记录和当前填写内容已保留：'+(tx.error?.message||'存储事务未完成')));
    });
  }
  try{channel=new BroadcastChannel(name);channel.onmessage=()=>listeners.forEach(fn=>fn())}catch{}
  return {read,save,subscribe(fn){listeners.add(fn);return ()=>listeners.delete(fn)},get current(){return current}};
})();

;
/* User-approved BI visual exception; isolated from all ordinary PC controls. */
window.RefundRiskApp = (() => {
  const M=RefundRiskModel,E=esc;
  const S={tab:'overview',source:'sample',filters:{},view:'performance',role:'seller',page:1,size:10,selected:new Set(),stack:[],active:false,error:'',sourceError:'',storageError:'',stored:{schema:1,revision:0,sampleDate:M.today(),cases:{}}};
  const datasets={},tabs=[['overview','风险总览'],['stores','门店分析'],['employees','员工分析'],['cases','异常核查']],owners=['总部核查组','客服回访组','财务核对组'];
  const results=[['unknown','尚未核实'],['confirmed','客户确认申请及金额'],['denied','客户否认申请'],['amount','客户反馈金额不符'],['unreachable','暂未联系上']],conclusions=['正常退款','服务或销售问题','操作错误','违规行为','证据不足'];
  let lastURL='',refreshing=false;
  const call=(method,...args)=>'RefundRiskApp.'+method+'('+args.map(x=>JSON.stringify(x)).join(',')+')';
  const button=(label,method,args=[],cls='',attrs='')=>`<button type="button" class="rr-btn ${cls}" onclick="${E(call(method,...args))}" ${attrs}>${E(label)}</button>`;
  const link=(label,method,args=[],attrs='')=>button(label,method,args,'rr-link',attrs);
  const currency=n=>Number.isFinite(n)?(n/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2}):'—';
  const note=t=>`<p class="rr-note">${E(t)}</p>`;
  const tag=(t,type='')=>`<span class="rr-tag ${type}">${E(t)}</span>`;
  const data=()=>datasets[S.source],person=id=>data().personMap.get(id)?.name||'身份待核实',store=id=>data().storeMap.get(id)?.name||'门店待核实';
  const resultLabel=v=>results.find(x=>x[0]===v)?.[1]||'尚未核实';
  const filter=()=>S.filters[S.tab]||(S.filters[S.tab]=defaults(S.tab));
  function defaults(tab){const end=data()?.asOf||M.today(),cohort=['stores','employees'].includes(tab);return {from:M.addDays(end,cohort?-89:-29),to:cohort?M.addDays(end,-30):end,district:'',area:'',store:'',period:cohort?'custom':'30',rule:'',status:tab==='cases'?'open':'',keyword:'',current:tab==='cases'};}
  function options(values,value){return values.map(x=>{const [v,l]=Array.isArray(x)?x:[x,x];return `<option value="${E(v)}" ${String(v)===String(value)?'selected':''}>${E(l)}</option>`}).join('')}
  function select(label,key,values,value){return `<label class="rr-filter"><span>${E(label)}</span><select aria-label="${E(label)}" data-filter="${E(key)}" onchange="${E(call('change',key))}">${options(values,value)}</select></label>`}
  function card(title,html,actions=''){return `<section class="rr-card"><div class="rr-card-head"><h2>${E(title)}</h2><div class="rr-actions">${actions}</div></div>${html}</section>`}
  function table(headers,rows){return `<div class="rr-table-scroll" role="region" aria-label="数据明细，可横向滚动"><table class="rr-table"><thead><tr>${headers.map(h=>`<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>'<tr>'+row.map(c=>`<td>${c}</td>`).join('')+'</tr>').join(''):`<tr><td colspan="${headers.length}" class="rr-empty">暂无符合条件的数据</td></tr>`}</tbody></table></div>`}
  function segments(items,selected,method){return `<div class="rr-segmented" role="tablist" aria-label="${method==='setTab'?'分析视角':'分析维度'}">${items.map(([id,label])=>`<button type="button" role="tab" aria-selected="${id===selected}" tabindex="${id===selected?0:-1}" class="${id===selected?'rr-active':''}" onclick="${E(call(method,id))}">${E(label)}</button>`).join('')}</div>`}
  function paginate(rows,scope='main'){const h=scope==='main'?S:S.stack.at(-1),size=h.size||10;h.page=Math.max(1,Math.min(h.page||1,Math.ceil(rows.length/size)||1));return {rows:rows.slice((h.page-1)*size,h.page*size),footer:`<div class="rr-table-footer"><span>共 ${rows.length} 条</span><div class="rr-actions"><label>每页 <select aria-label="${scope==='main'?'列表':'抽屉'}每页条数" onchange="${E(call('pageSize',scope))}">${options([10,20,50],size)}</select> 条</label>${button('上一页','paging',[scope,-1],'',h.page===1?'disabled':'')}<span>${h.page} / ${Math.max(1,Math.ceil(rows.length/size))}</span>${button('下一页','paging',[scope,1],'',h.page*size>=rows.length?'disabled':'')}</div></div>`};}
  function readBusiness(){S.sourceError='';try{const read=key=>{const raw=localStorage.getItem(key);return raw?JSON.parse(raw):{}},pc=read('weidong-unified-backend-v1')||{},mobile=read('weidong-v3-standalone-release-1')||{};if(pc.refunds&&!Array.isArray(pc.refunds)||mobile.refundTasks&&!Array.isArray(mobile.refundTasks))throw Error('退款业务记录格式不兼容');datasets.business=M.fromBusiness(pc,mobile)}catch(e){S.sourceError='退款业务记录暂时无法读取，原记录未改动：'+e.message;datasets.business=M.fromBusiness()}}
  async function initialize(){try{S.stored=await RefundRiskStorage.read()}catch(e){S.storageError=e.message}datasets.sample=RefundRiskSeed(S.stored.sampleDate);readBusiness();RefundRiskStorage.subscribe(refreshExternal);window.addEventListener('focus',refreshExternal);window.addEventListener('storage',event=>{if(['weidong-unified-backend-v1','weidong-v3-standalone-release-1'].includes(event.key))refreshExternal()});document.addEventListener('keydown',keydown,true);}
  async function refreshExternal(){if(!S.active||refreshing)return;refreshing=true;readBusiness();try{const next=await RefundRiskStorage.read();if(next.revision!==S.stored.revision){S.stored=next;if(S.stack.length)toast('其他页面已更新记录，编辑中的内容保留；保存前可重新载入最新记录。');else render()}}catch(e){S.storageError=e.message}finally{refreshing=false}}
  function url(){const f=filter(),p=new URLSearchParams({tab:S.tab,source:S.source,from:f.from,to:f.to,view:S.view,role:S.role});for(const k of ['district','area','store','rule','status','keyword'])if(f[k])p.set(k,f[k]);p.set('current',f.current?'1':'0');if(f.monthEnd)p.set('monthEnd','1');history.replaceState(null,'','#refund-risk?'+p);lastURL=location.hash;}
  function enter(){S.active=true;readBusiness();if(lastURL!==location.hash){const p=new URLSearchParams(location.hash.split('?')[1]||'');S.tab=tabs.some(x=>x[0]===p.get('tab'))?p.get('tab'):'overview';S.source=p.get('source')==='business'?'business':'sample';S.view=['performance','period','operations'].includes(p.get('view'))?p.get('view'):'performance';S.role=['seller','service','applicant','auditor'].includes(p.get('role'))?p.get('role'):'seller';const f=defaults(S.tab);for(const k of ['district','area','store','rule','status','keyword'])if(p.has(k))f[k]=p.get(k);for(const k of ['from','to'])if(/^\d{4}-\d{2}-\d{2}$/.test(p.get(k)||''))f[k]=p.get(k);if(f.from>f.to||!Number.isFinite(M.days(f.from,f.to))||M.days(f.from,f.to)>366)Object.assign(f,defaults(S.tab));if(p.has('current'))f.current=p.get('current')==='1';f.monthEnd=p.get('monthEnd')==='1';if(p.has('from'))f.period='custom';S.filters[S.tab]=f;S.page=1;S.selected.clear();}render();}
  function filters(){const f=filter(),d=data(),stores=d.stores.filter(s=>(!f.district||s.district===f.district)&&(!f.area||s.area===f.area));const label=S.tab==='stores'||S.tab==='employees'&&['seller','service'].includes(S.role)?'原收款日期':S.tab==='employees'?'申请 / 审核日期':'统计周期';return `<div class="rr-filter-shell"><div class="rr-filters">${select(label,'period',[['7','近 7 天'],['30','近 30 天'],['month','本月'],['last','上月'],['custom','自定义日期']],f.period)}<div class="rr-dates"><input type="date" aria-label="开始日期" value="${E(f.from)}" onchange="${E(call('dateChange'))}"><span>至</span><input type="date" aria-label="结束日期" value="${E(f.to)}" onchange="${E(call('dateChange'))}"></div>${select('大区','district',[['','全部大区'],...M.unique(d.stores.map(s=>s.district))],f.district)}${select('区域','area',[['','全部区域'],...M.unique(d.stores.filter(s=>!f.district||s.district===f.district).map(s=>s.area))],f.area)}${select('门店','store',[['','全部门店'],...stores.map(s=>[s.id,s.name])],f.store)}${select('数据范围','source',[['sample','经营样例'],['business','退款业务记录']],S.source)}${link('重置','reset')}${link('刷新数据','reload')}</div></div>`}
  function render(){if(!S.active)return;url();$('#main').innerHTML=`<div id="rr-app" class="rr" data-pc-native><header class="rr-header"><div class="rr-head-left"><span class="rr-brand">${icon('chart')}</span><h1>退款风险看板</h1></div><div class="rr-actions"><span class="rr-badge">${S.source==='sample'?'全国经营样例':'退款业务记录'}</span>${button('指标说明','definitions')}${button('导出当前分析','exportCurrent')}</div></header>${filters()}${S.error?`<div class="rr-error" role="alert">${E(S.error)}</div>`:''}${S.storageError?`<div class="rr-error" role="alert">${E(S.storageError)} 当前可查看分析，核查修改尚不可保存。${link('重试读取','reload')}</div>`:''}${S.source==='business'&&S.sourceError?`<div class="rr-error" role="alert">${E(S.sourceError)}</div>`:''}<div class="rr-dashboard"><div class="rr-primary-tabs">${segments(tabs,S.tab,'setTab')}</div><div class="rr-dashboard-content" role="tabpanel" aria-label="${E(tabs.find(x=>x[0]===S.tab)[1])}">${A.views[S.tab]()}</div></div><footer class="rr-foot">数据来源：${S.source==='sample'?'独立经营样例，不与退款业务记录合并':'PC 退款记录 / 同源门店退款申请'} · 分析截至 ${E(data().asOf)} · 预警是待核实线索，不等于确认违规</footer></div>`;}
  function open(item){if(S.stack.length>=2){if(['ledger','analysis'].includes(S.stack.at(-1).type)&&item.type==='detail')S.stack.pop();else return;}item.page=1;item.size=10;item.opener=document.activeElement;S.stack.push(item);draw();queueMicrotask(()=>document.getElementById('rr-drawer-'+(S.stack.length-1))?.focus({preventScroll:true}));}
  function draw(){S.stack.forEach((item,i)=>{const scroll=document.querySelector('#rr-drawer-'+i+' .rr-drawer-content')?.scrollTop||0;syncDrawerLayer($('#mergeDrawers'),'rr-'+i,`<div class="rr rr-overlay" data-pc-native onclick="if(event.target===this&&!this.dataset.closing)${E(call('close'))}"><section id="rr-drawer-${i}" class="rr-drawer ${item.width===560?'rr-narrow':''}" role="dialog" aria-modal="true" aria-label="${E(item.title)}" tabindex="-1"><header class="rr-drawer-header"><h2>${E(item.title)}</h2><button type="button" class="rr-close" aria-label="关闭${E(item.title)}" onclick="${E(call('close'))}">×</button></header><div class="rr-drawer-content">${A.views.drawer(item)}</div><footer class="rr-drawer-footer"><div class="rr-error" role="alert">${E(item.error||'')}</div><div class="rr-actions">${footer(item)}</div></footer></section></div>`);document.querySelector('#rr-drawer-'+i+' .rr-drawer-content').scrollTop=scroll;});for(let i=S.stack.length;i<3;i++)syncDrawerLayer($('#mergeDrawers'),'rr-'+i,'');sync();}
  function sync(){syncDrawerInteraction();S.stack.forEach((_,i)=>{const p=document.getElementById('rr-drawer-'+i);if(p)p.inert=i!==S.stack.length-1})}
  function collect(){const item=S.stack.at(-1);if(item?.type!=='edit')return;document.querySelector('#rr-drawer-'+(S.stack.length-1))?.querySelectorAll('input[name],select[name],textarea[name]').forEach(el=>item.model[el.name]=el.type==='checkbox'?el.checked:el.value)}
  function close(force=false){const item=S.stack.at(-1);if(!item||item.saving)return;collect();if(!force&&item.type==='edit'&&JSON.stringify(item.model)!==item.initial){item.error='有未保存的修改，是否放弃？';item.discard=true;draw();return;}S.stack.pop();draw();setTimeout(()=>{sync();if(item.opener?.isConnected&&!item.opener.closest('[inert]'))item.opener.focus({preventScroll:true});else document.getElementById('rr-drawer-'+(S.stack.length-1))?.focus({preventScroll:true})},drawerMotionTime()+20)}
  function footer(item){if(item.discard)return button('继续编辑','continueEditing')+button('放弃修改','close',[true],'rr-primary');if(item.type==='edit')return button('重新载入最新记录','reloadEditor')+button('取消','close')+button(item.kind==='review'?'保存结案结论':'保存','save',[],'rr-primary',item.saving?'disabled':'');if(item.type==='detail'){const a=data().applicationMap.get(item.id),s=M.stateFor(data(),a,S.stored.cases);return button('关闭','close')+(s.status==='已结案'?'':button('分配核查','assign',[[data().source+':'+a.id]])+(s.status==='待复核'?button('记录结论','review',[a.id],'rr-primary'):button('提交复核','submit',[a.id],'rr-primary')))+(S.source==='business'?button('前往退款管理','finance',[a.id]):'')}return button('关闭','close');}
  function field(label,name,value,type='text',values){return `<label class="rr-field"><span>${E(label)}</span>${values?`<select aria-label="${E(label)}" name="${E(name)}">${options(values,value)}</select>`:type==='textarea'?`<textarea aria-label="${E(label)}" name="${E(name)}" rows="4">${E(value)}</textarea>`:`<input aria-label="${E(label)}" name="${E(name)}" type="${E(type)}" value="${E(value)}">`}</label>`}
  function edit(kind,ids,model,title){if(S.storageError)return toast(S.storageError);if(S.stack.length===2&&S.stack.at(-1).type==='detail'){const parent=S.stack.shift();syncDrawerLayer($('#mergeDrawers'),'rr-1','');S.stack[0].opener=parent.opener;}open({type:'edit',kind,ids,model,initial:JSON.stringify(model),expected:S.stored.revision,title,width:560})}
  async function persist(ids,action,change,expected=S.stored.revision){const next=JSON.parse(JSON.stringify(S.stored));next.revision=expected+1;const now=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());for(const id of ids){const a=data().applicationMap.get(id.slice(id.indexOf(':')+1));if(!a)throw Error('关联退款记录不存在，请刷新后重试。');if(a.applicantId==='hq-risk')throw Error('申请人不能核查自己的退款申请。');const alert=M.alerts(data(),next.cases).find(x=>x.id===id),s=JSON.parse(JSON.stringify(M.stateFor(data(),a,next.cases)));if(s.status==='已结案')throw Error('核查事项已结案，不能覆盖原结论。');s.firstAt ||= alert?.firstAt||now;s.evidence ||= alert?.matches||[];change(s,a,now);(s.history||=[]).push({at:now,by:'总部核查员',action,note:s.note||''});next.cases[id]=s;}S.stored=await RefundRiskStorage.save(next,expected);}
  async function save(){collect();const item=S.stack.at(-1);if(item?.type!=='edit'||item.saving)return;const r=item.model;item.error='';if(item.kind==='verify'&&(r.result==='unknown'||!r.contactBasis.trim()||!r.note.trim()))item.error='请选择实际核实结果，并填写联系依据和核实记录。';if(item.kind==='review'&&(!r.conclusion||!r.note.trim()))item.error='请选择结案结论并填写核查依据及处理结果。';if(item.error){draw();return}item.saving=true;draw();try{await persist(item.ids,({assign:'分配核查',verify:'登记客户核实',review:'核查结案'})[item.kind],(s,a,at)=>{if(item.kind==='assign'){s.owner=r.owner;s.status='核查中';s.note=r.note}if(item.kind==='verify'){s.verification={...r,by:'总部核查员',at};s.owner ||= '总部核查组';s.status='核查中';s.note=r.note}if(item.kind==='review'){if(s.status!=='待复核')throw Error('当前事项不是待复核状态，请重新载入最新记录。');s.status='已结案';s.conclusion=r.conclusion;s.note=r.note;s.closedAt=at}},item.expected);item.saving=false;close(true);S.stack.forEach(x=>x.error='');S.selected.clear();render();draw();toast('核查记录已保存')}catch(e){item.saving=false;item.error=e.message;draw()}}
  function csv(name,headers,rows){const cell=v=>'"'+String(v??'').replace(/^[\s]*[=+@\-]/,"'$&").replaceAll('"','""')+'"',blob=new Blob(['\ufeff'+[headers,...rows].map(r=>r.map(cell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function exportApplications(ids,title){csv(title,['数据来源','客户','门店','原订单','退款申请','申请人','申请日期','申请金额 / 元','累计成功退款 / 元'],ids.map(id=>data().applicationMap.get(id)).filter(Boolean).map(a=>[S.source==='sample'?'经营样例':'退款业务记录',data().orderMap.get(a.orderId).customerName,store(data().orderMap.get(a.orderId).storeId),a.orderId,a.id,a.applicantName,a.submittedAt,(a.amountCents/100).toFixed(2),(M.paid(data(),a)/100).toFixed(2)]))}
  function keydown(event){if(!S.active)return;const tab=event.target.closest('.rr-segmented [role=tab]');if(tab&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();const bs=[...tab.parentElement.children],idx=bs.indexOf(tab),next=event.key==='Home'?0:event.key==='End'?bs.length-1:(idx+(event.key==='ArrowRight'?1:-1)+bs.length)%bs.length,label=bs[next].textContent,root=tab.closest('.rr-drawer')?.id||'rr-app';bs[next].click();document.querySelectorAll('#'+root+' .rr-segmented button').forEach(el=>{if(el.textContent===label)el.focus()});return}if(!S.stack.length)return;const panel=document.getElementById('rr-drawer-'+(S.stack.length-1));if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();close();return}if(event.key==='Tab'){const els=[...panel.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]')].filter(el=>el.getClientRects().length);if(event.shiftKey&&(document.activeElement===els[0]||document.activeElement===panel)){event.preventDefault();els.at(-1)?.focus()}else if(!event.shiftKey&&(document.activeElement===els.at(-1)||document.activeElement===panel)){event.preventDefault();els[0]?.focus()}}}
  const A={S,M,E,tabs,results,conclusions,owners,call,button,link,currency,note,tag,data,person,store,resultLabel,filter,options,select,card,table,segments,paginate,field,open,draw,render,persist,csv,exportApplications,views:{},initialize,enter,
    setTab(tab){const f=filter();S.tab=tab;Object.assign(filter(),{district:f.district,area:f.area,store:f.store});S.page=1;S.selected.clear();render()},
    change(key){const value=document.querySelector('#rr-app [data-filter="'+key+'"]').value;if(key==='source'){readBusiness();S.source=value;S.filters={};S.selected.clear();S.page=1;render();return}const f=filter();f[key]=value;if(key==='district'){f.area='';f.store=''}if(key==='area')f.store='';if(key==='period'){const now=data().asOf;if(['7','30'].includes(value)){f.from=M.addDays(now,1-Number(value));f.to=now}else if(value==='month'){f.from=M.month(now)+'-01';f.to=now}else if(value==='last'){f.from=M.month(now,-1)+'-01';f.to=M.monthEnd(f.from)}}S.page=1;S.selected.clear();S.error='';render()},
    dateChange(){const from=$('#rr-app [aria-label="开始日期"]').value,to=$('#rr-app [aria-label="结束日期"]').value;if(!from||!to||from>to||M.days(from,to)>366){S.error='请选择有效日期，结束日期不得早于开始日期，单次最多分析 366 天。';render();return}Object.assign(filter(),{from,to,period:'custom'});S.error='';S.page=1;render()},
    reset(){S.filters[S.tab]=defaults(S.tab);S.error='';S.page=1;S.selected.clear();render()},
    async reload(){try{S.stored=await RefundRiskStorage.read();S.storageError='';datasets.sample=RefundRiskSeed(S.stored.sampleDate)}catch(e){S.storageError=e.message}readBusiness();render()},
    keyword(){filter().keyword=$('#rr-app input[type=search]')?.value.trim()||'';S.page=1;render()},
    setView(view){S.view=view;const now=data().asOf;Object.assign(filter(),view==='performance'?{from:M.addDays(now,-89),to:M.addDays(now,-30)}:{from:M.month(now,-3)+'-01',to:now});filter().period='custom';S.page=1;render()},
    setRole(role){S.role=role;const now=data().asOf;Object.assign(filter(),['seller','service'].includes(role)?{from:M.addDays(now,-89),to:M.addDays(now,-30)}:{from:M.addDays(now,-29),to:now});filter().period='custom';S.page=1;render()},
    monthEndOnly(){filter().monthEnd=!filter().monthEnd;render()},currentCases(){filter().current=!filter().current;S.page=1;render()},
    drillOrg(level,value){const f=filter();f[level]=value;if(level==='district'){f.area='';f.store=''}if(level==='area')f.store='';if(level==='store'){const s=data().storeMap.get(value);f.district=s.district;f.area=s.area}render()},
    orgBack(){const f=filter();if(f.store)f.store='';else if(f.area)f.area='';else f.district='';render()},
    showCases(kind,id){const f={...filter()};S.tab='cases';S.filters.cases={...f,keyword:'',status:kind==='current'?'open':'',rule:kind==='rule'?id:'',current:kind==='current'};S.selected.clear();S.page=1;render()},
    paging(scope,delta){(scope==='main'?S:S.stack.at(-1)).page+=delta;scope==='main'?render():draw()},
    pageSize(scope){const el=document.querySelector(`[aria-label="${scope==='main'?'列表':'抽屉'}每页条数"]`),h=scope==='main'?S:S.stack.at(-1);h.size=Number(el.value);h.page=1;scope==='main'?render():draw()},
    pick(id){S.selected.has(id)?S.selected.delete(id):S.selected.add(id);render()},selectPage(){const rows=A.views.caseRows().slice((S.page-1)*S.size,S.page*S.size).filter(x=>x.state.status!=='已结案'),all=rows.every(x=>S.selected.has(x.id));rows.forEach(x=>all?S.selected.delete(x.id):S.selected.add(x.id));render()},
    openLedger(kind,from,to){const m=M.metrics(data(),filter(),S.stored.cases),ids=['success','period'].includes(kind)?M.unique(m.tasks.filter(t=>kind!=='period'||M.within(t.completedAt,from,to)).map(t=>t.applicationId)):m.apps.filter(a=>M.within(a.submittedAt,filter().from,filter().to)).map(a=>a.id);open({type:'ledger',title:['success','period'].includes(kind)?'成功退款关联申请':'退款申请明细',ids,intro:'申请金额与该申请累计成功退款分别展示；部分成功保留全部任务。'})},
    matrixDetail(paidMonth,refundMonth){const f=filter(),ids=M.unique(data().tasks.filter(t=>{const a=data().applicationMap.get(t.applicationId),o=data().orderMap.get(a.orderId);return M.inScope(o,f,data())&&M.within(o.paidAt,f.from,f.to)&&(!f.monthEnd||M.days(o.paidAt,M.monthEnd(o.paidAt))<5)&&o.paidAt?.startsWith(paidMonth)&&t.status==='success'&&t.completedAt.startsWith(refundMonth)}).map(t=>t.applicationId));open({type:'ledger',title:paidMonth+' 收款 → '+refundMonth+' 退款',ids})},
    detail(id){open({type:'detail',title:'退款异常核查 · '+id,id,tab:'evidence'})},detailTab(tab){S.stack.at(-1).tab=tab;draw()},
    drawerSearch(){const item=S.stack.at(-1);item.keyword=$('#rr-drawer-'+(S.stack.length-1)+' input[type=search]').value.trim();item.page=1;draw()},
    assign(ids){ids=ids||[...S.selected];if(!ids.length)return toast('请先选择核查事项');edit('assign',ids,{owner:'总部核查组',note:''},'分配核查')},
    verify(id){const a=data().applicationMap.get(id),v=M.stateFor(data(),a,S.stored.cases).verification||a.verification||{};edit('verify',[data().source+':'+id],{result:v.result||'unknown',paidMethod:v.paidMethod||'待核实',received:v.received||'待核实',channel:v.channel||'电话回访',contactBasis:v.contactBasis||'',note:v.note||''},'登记客户核实')},
    async submit(id){const item=S.stack.at(-1),a=data().applicationMap.get(id),s=M.stateFor(data(),a,S.stored.cases);if(!s.verification){item.error='请先在“客户核实”中登记独立核实结果。';draw();return}try{await persist([data().source+':'+id],'提交复核',s=>s.status='待复核');item.error='';render();draw();toast('已提交复核')}catch(e){item.error=e.message;draw()}},
    review(id){edit('review',[data().source+':'+id],{conclusion:'',note:''},'记录核查结论')},save,
    async reloadEditor(){collect();const item=S.stack.at(-1);try{S.stored=await RefundRiskStorage.read();item.expected=S.stored.revision;item.error='已载入最新记录，当前填写内容保留。';draw()}catch(e){item.error=e.message;draw()}},
    close,continueEditing(){const item=S.stack.at(-1);item.error='';item.discard=false;draw()},
    exportDrawer(){const item=S.stack.at(-1);exportApplications(item.ids.filter(id=>{const a=data().applicationMap.get(id);return a&&(!item.keyword||[a.id,a.orderId,a.applicantName,data().orderMap.get(a.orderId).customerName].some(v=>String(v).includes(item.keyword)))}),'退款关联明细')},
    finance(id){const a=data().applicationMap.get(id);while(S.stack.length)close(true);location.hash='#refunds?riskRefund='+encodeURIComponent(a.financeIds?.[0]||'')},
    leave(){S.active=false;S.stack=[];draw()}
  };return A;
})();

;
(() => {
  const A=RefundRiskApp,{S,M,E,call,button:b,link,currency:money,note,tag,data,person,store,resultLabel,filter,options,select,card,table,segments,paginate,field,open}=A;
  const sort=(a,b)=>a.priority-b.priority||a.firstAt.localeCompare(b.firstAt);
  const priority=x=>tag(['','优先核查','重点核查','持续观察'][x.priority],x.priority===1?'rr-danger':x.priority===2?'rr-warn':'');
  const coverage=()=>S.source==='business'?note('当前接入退款记录；完整实收、付款人标识、原销售及服务人员、权益与提成尚未接入。相关比率和规则显示“未接入”，没有预警不代表已排除风险。'):'';
  const scopedOrders=()=>data().orders.filter(o=>M.inScope(o,filter(),data()));
  const cohortCell=c=>!c.available?'未接入完整实收':c.count<10?c.count?'样本不足（'+c.count+' 单）':c.observing?'观察中':'—':M.percent(c.numerator,c.denominator);
  function metric(label,value,unit,foot,action){return `<button type="button" class="rr-metric" onclick="${E(action)}" aria-label="${E(label+'，'+value+unit+'，查看明细')}"><span class="rr-metric-label">${E(label)}<span>↗</span></span><span class="rr-metric-value">${E(value)}<small>${E(unit)}</small></span><span class="rr-metric-foot">${E(foot)}</span></button>`}
  function bars(rows){const values=M.rules.map(r=>({...r,count:rows.filter(x=>x.matches.some(m=>m.id===r.id)).length})),max=Math.max(1,...values.map(x=>x.count));return `<div class="rr-card-body"><div class="rr-bars">${values.map(r=>`<button type="button" class="rr-bar-row" onclick="${E(S.tab==='stores'?call('openStoreRule',r.id):call('showCases','rule',r.id))}"><span>${E(r.name)}</span><span class="rr-bar-track"><i style="width:${r.count/max*100}%"></i></span><span>${r.count} 笔</span></button>`).join('')}</div></div>`}
  function trend(tasks){const f=filter(),n=Math.max(1,Math.ceil((M.days(f.from,f.to)+1)/8)),bins=[];for(let i=0;i<8;i++){const start=M.addDays(f.from,i*n);if(start>f.to)break;const end=[M.addDays(start,n-1),f.to].sort()[0],rows=tasks.filter(t=>M.within(t.completedAt,start,end));bins.push({start,end,original:M.sum(rows,t=>t.method==='original'?t.amountCents:0),manual:M.sum(rows,t=>t.method==='transfer'?t.amountCents:0),unknown:M.sum(rows,t=>t.method==='unknown'?t.amountCents:0)})}const max=Math.max(1,...bins.map(x=>x.original+x.manual+x.unknown));return `<div class="rr-card-body"><div class="rr-legend"><span><i></i>原路退款</span><span><i class="rr-manual"></i>人工转账</span>${bins.some(x=>x.unknown)?'<span><i class="rr-unknown"></i>方式待核实</span>':''}</div><div class="rr-trend" role="group" aria-label="退款成功金额趋势">${bins.map(x=>`<button type="button" class="rr-trend-col" onclick="${E(call('openLedger','period',x.start,x.end))}" aria-label="${x.start} 至 ${x.end}，原路 ${money(x.original)} 元，人工 ${money(x.manual)} 元，方式待核实 ${money(x.unknown)} 元"><span class="rr-trend-value">${money(x.original+x.manual+x.unknown)}</span><span class="rr-trend-track"><span class="rr-trend-stack" style="height:${(x.original+x.manual+x.unknown)/max*100}%"><i class="rr-unknown" style="height:${(x.original+x.manual+x.unknown?x.unknown/(x.original+x.manual+x.unknown):0)*100}%"></i><i class="rr-manual" style="height:${(x.original+x.manual+x.unknown?x.manual/(x.original+x.manual+x.unknown):0)*100}%"></i><i style="height:${(x.original+x.manual+x.unknown?x.original/(x.original+x.manual+x.unknown):0)*100}%"></i></span></span><span>${x.start.slice(5)}</span></button>`).join('')}</div><p class="rr-caption">按退款成功日期统计；点击日期查看对应时段明细。</p></div>`}
  function caseTable(rows,paging=true){const p=paging?paginate(rows):{rows,footer:''},assignable=p.rows.filter(x=>x.state.status!=='已结案');return table([S.tab==='cases'?`<input type="checkbox" aria-label="选择本页全部预警" ${assignable.length&&assignable.every(x=>S.selected.has(x.id))?'checked':''} ${assignable.length?'':'disabled'} onchange="${E(call('selectPage'))}">`:'序号','优先级','门店 / 申请人','客户 / 退款申请','涉及金额 / 元','命中原因','客户核实','负责人 / 状态','操作'],p.rows.map((x,i)=>[S.tab==='cases'?`<input type="checkbox" aria-label="选择 ${E(x.application.id)}" ${x.state.status==='已结案'?'disabled':''} ${S.selected.has(x.id)?'checked':''} onchange="${E(call('pick',x.id))}">`:i+1,priority(x),E(store(x.order.storeId))+`<small>${E(x.application.applicantName)}</small>`,E(x.order.customerName)+`<small>${E(x.application.id)}</small>`,money(x.application.amountCents),`<div class="rr-tags">${x.matches.map(m=>tag(m.name)).join('')}</div>`,E(resultLabel(x.state.verification?.result||x.application.verification?.result)),E(x.state.owner||'未分配')+`<small>${E(x.state.status)}</small>`,link('查看核查','detail',[x.application.id])]))+p.footer;}
  function caseRows(){const f=filter();return M.alerts(data(),S.stored.cases).filter(x=>M.inScope(x.order,f,data())&&(f.current||M.within(x.firstAt,f.from,f.to))&&(!f.rule||x.matches.some(m=>m.id===f.rule))&&(!f.status||(f.status==='open'?x.state.status!=='已结案':x.state.status===f.status))&&(!f.keyword||[x.application.id,x.order.id,x.order.customerName,x.application.applicantName,store(x.order.storeId)].some(v=>String(v).includes(f.keyword)))).sort(sort)}
  function ledgerRows(rows){return table(['客户 / 原订单','门店','申请人','申请日期','申请金额 / 元','累计成功退款 / 元','方式','操作'],rows.map(a=>{const o=data().orderMap.get(a.orderId);return [E(o.customerName)+`<small>${E(o.id)}</small>`,E(store(o.storeId)),E(a.applicantName),E(M.date(a.submittedAt)),money(a.amountCents),money(M.paid(data(),a)),a.unknownMethod?'方式未记录':a.manualCents>0?(a.originalSelectedCents>0?'原路 + 人工':'人工转账'):'原路退款',link('查看','detail',[a.id])]}))}
  function overview(){const d=data(),f=filter(),m=M.metrics(d,f,S.stored.cases),original=M.sum(m.tasks,t=>t.method==='original'?t.amountCents:0);
    const manual=M.sum(m.tasks,t=>t.method==='transfer'?t.amountCents:0),unknown=m.amount-original-manual;
    const metrics=`<div class="rr-metrics">${metric('成功退款金额',money(m.amount),'元','原路 '+money(original)+' / 人工 '+money(manual)+(unknown?' / 方式待核实 '+money(unknown):''),call('openLedger','success'))}${metric('退款订单数',m.orders,'单','涉及 '+m.customers+' 位客户 · 原订单去重',call('openLedger','success'))}${metric('新增预警申请数',m.added.length,'笔','按首次触发日期 · 申请去重',call('showCases','new'))}${metric('预警涉及金额',money(m.alertAmount),'元','申请金额去重，不代表已损失金额',call('showCases','new'))}</div>`;
    const brief=`<div class="rr-brief"><span>当前待核查 <strong>${m.current.length}</strong></span><span>优先核查 <strong class="rr-red">${m.current.filter(x=>x.priority===1).length}</strong></span><span>超过 48 小时 <strong class="rr-red">${m.current.filter(x=>M.days(x.firstAt,d.asOf)>2).length}</strong></span><span class="rr-muted">当前未结事项，包含历史积压</span>${link('核查清单 →','showCases',['current'])}</div>`;
    const groups=f.store?[['store',f.store]]:f.area?d.stores.filter(s=>s.area===f.area&&(!f.district||s.district===f.district)).map(s=>['store',s.id]):f.district?M.unique(d.stores.filter(s=>s.district===f.district).map(s=>s.area)).map(v=>['area',v]):M.unique(d.stores.map(s=>s.district)).map(v=>['district',v]);
    const rows=groups.map(([level,value])=>{const sm=M.metrics(d,{...f,[level]:value},S.stored.cases);return [link(level==='store'?store(value):value,'drillOrg',[level,value]),money(sm.amount),sm.orders,sm.added.length,money(sm.alertAmount),tag(sm.current.filter(x=>x.priority===1).length+' 笔',sm.current.some(x=>x.priority===1)?'rr-danger':''),link('查看','drillOrg',[level,value])];});
    return metrics+brief+`<div class="rr-grid">${card('退款金额趋势',trend(m.tasks),'<span class="rr-muted">单位：元</span>')}${card('异常类型分布',bars(m.added),'<span class="rr-muted">同一申请可命中多类</span>')}</div>`+card('组织对比',table(['组织','成功退款金额 / 元','退款订单数','新增预警数','预警涉及金额 / 元','优先核查待处理','操作'],rows),f.district||f.area||f.store?link('返回上级','orgBack'):'')+card('当前重点待核查',caseTable(m.current.sort(sort).slice(0,5),false),link('查看全部 →','showCases',['current']))+coverage();
  }
  function storeStats(){const f=filter(),d=data();return d.stores.filter(s=>(!f.district||s.district===f.district)&&(!f.area||s.area===f.area)&&(!f.store||s.id===f.store)).map(s=>{const os=d.orders.filter(o=>o.storeId===s.id);return {s,c:M.cohort(d,os,f.from,f.to),previous:M.cohort(d,os,M.addDays(f.from,-(M.days(f.from,f.to)+1)),M.addDays(f.from,-1))}})}
  function periodMatrix(){const f=filter(),os=scopedOrders().filter(o=>M.within(o.paidAt,f.from,f.to)&&(!f.monthEnd||M.days(o.paidAt,M.monthEnd(o.paidAt))<5)),count=(Number(f.to.slice(0,4))-Number(f.from.slice(0,4)))*12+Number(f.to.slice(5,7))-Number(f.from.slice(5,7))+1;return M.matrix(data(),os,f.from.slice(0,7)+'-01',count)}
  function operationRows(){const f=filter();return M.alerts(data(),S.stored.cases).filter(x=>M.inScope(x.order,f,data())&&M.within(x.order.paidAt,f.from,f.to)).sort(sort)}
  function stores(){const f=filter(),d=data();let html='';
    if(S.view==='performance'){const stats=storeStats(),p=paginate(stats),rows=p.rows.map(({s,c,previous})=>{const peers=stats.filter(x=>x.s.category===s.category&&x.c.count>=10&&x.c.rate!==null).map(x=>x.c.rate).sort((a,b)=>a-b),middle=Math.floor(peers.length/2),median=peers.length?(peers.length%2?peers[middle]:(peers[middle-1]+peers[middle])/2):null;return [link(s.name,'storeDetail',[s.id]),E(s.district+' / '+s.area),c.available?money(c.denominator):'未接入',c.available?c.count+' / '+c.observing:'—',cohortCell(c),c.available?M.percent(c.refundCustomers,c.customers):'—',peers.length>=3?M.percent(median,1):'样本不足',c.count>=10&&previous.count>=10?(c.rate-previous.rate>=0?'+':'')+((c.rate-previous.rate)*100).toFixed(1)+'pp':'—',link('查看','storeDetail',[s.id])];});html=note('按原销售门店、原收款批次比较 30 天成功退款。观察未满 30 天的订单不计比率；成熟订单不足 10 单时不作异常判断。')+card('门店退款表现',table(['门店','组织','成熟批次实收 / 元','成熟 / 观察中订单','30 天退款金额率','退款客户比例','同类型门店中位数','较上一批次','操作'],rows)+p.footer);}
    else if(S.view==='period'){const rows=periodMatrix().map(r=>[E(r.month),d.completePayments?money(r.denominator):'未接入',...r.cells.map(c=>c.future?'<span class="rr-muted">未到观察期</span>':link(money(c.amount)+(d.completePayments?' / '+M.percent(c.amount,r.denominator):'')+(c.complete?'':' · 观察中'),'matrixDetail',[r.month,c.month],`style="background:rgba(51,112,255,${d.completePayments&&r.denominator?Math.min(.2,c.amount/r.denominator):0})"`))]);html=`<div class="rr-brief"><label><input type="checkbox" ${f.monthEnd?'checked':''} onchange="${E(call('monthEndOnly'))}"> 仅看月末最后 5 天收款</label><span class="rr-muted">每行对应同一批原收款；当前退款月份尚未结束时标记“观察中”</span></div>`+card('收款月份 × 退款月份',table(['原收款月份','原批次实收 / 元','当月退款','次月退款','第三个月退款','第四个月退款'],rows))+note('点击单元格查看关联退款。跨月预警另外检核“月末最后 5 天收款、次月前 15 天申请”，需结合业绩与客户核实判断。');}
    else{const rows=operationRows();html=card('门店操作异常',bars(rows))+card('异常申请明细',caseTable(rows.sort(sort)));}
    return `<div class="rr-analysis-head"><h2>门店分析</h2>${segments([['performance','退款表现'],['period','跨月退款'],['operations','操作异常']],S.view,'setView')}</div>`+html+coverage();
  }
  function employeeRows(){const d=data(),f=filter(),r=S.role,sales=['seller','service'].includes(r),ids=M.unique(sales?scopedOrders().filter(o=>M.within(o.paidAt,f.from,f.to)).map(o=>o[r+'Id']).filter(Boolean):M.scope(d,f).filter(a=>M.within(r==='auditor'?a.approvedAt:a.submittedAt,f.from,f.to)).map(a=>a[r+'Id']).filter(Boolean));return ids.filter(id=>!f.keyword||person(id).includes(f.keyword)||id.includes(f.keyword)).map(id=>{const os=scopedOrders().filter(o=>o[r+'Id']===id),c=M.cohort(d,os,f.from,f.to),as=M.scope(d,f).filter(a=>sales?d.orderMap.get(a.orderId)[r+'Id']===id&&M.within(d.orderMap.get(a.orderId).paidAt,f.from,f.to):a[r+'Id']===id&&M.within(r==='auditor'?a.approvedAt:a.submittedAt,f.from,f.to)),set=new Set(as.map(a=>a.id)),al=M.alerts(d,S.stored.cases).filter(x=>set.has(x.application.id));return {id,c,as,al,amount:M.sum(as,a=>M.paid(d,a)),manual:M.sum(as,a=>a.manualCents)}})}
  function employees(){const p=paginate(employeeRows()),sales=['seller','service'].includes(S.role),rows=p.rows.map(x=>[link(person(x.id),'employeeDetail',[x.id]),E(data().personMap.get(x.id)?.storeId?store(data().personMap.get(x.id).storeId):'总部 / 待核实'),sales?x.c.count:x.as.length,money(x.amount),sales?cohortCell(x.c):money(x.manual),x.al.filter(a=>a.matches.some(m=>m.id==='period')).length,x.al.filter(a=>a.matches.some(m=>m.id==='payer')).length,link(x.al.length+' 笔','employeeDetail',[x.id]),link('查看','employeeDetail',[x.id])]);return `<div class="rr-analysis-head"><h2>员工分析</h2>${segments([['seller','原销售人员'],['service','服务人员'],['applicant','退款申请人'],['auditor','财务审核人']],S.role,'setRole')}</div><div class="rr-ledger-toolbar"><span>${sales?'按原收款批次分析；经办量不计为销售质量':'按申请 / 审核日期分析；经办量不等于违规风险'}</span><input type="search" aria-label="员工姓名或编号" placeholder="员工姓名或编号" value="${E(filter().keyword)}" onchange="${E(call('keyword'))}" onkeydown="if(event.key==='Enter')${E(call('keyword'))}"></div>`+card('员工退款关联分析',table(['员工','所属门店',sales?'成熟收款订单数':'经办申请数','关联成功退款 / 元',sales?'30 天退款金额率':'申请人工退款 / 元','跨月预警','付款账户预警','关联预警','操作'],rows)+p.footer)+coverage();}
  function cases(){const f=filter();return `<div class="rr-ledger-toolbar">${select('异常类型','rule',[['','全部类型'],...M.rules.map(x=>[x.id,x.name])],f.rule)}${select('处理状态','status',[['','全部状态'],['open','全部未结案'],...['待分配','核查中','待复核','已结案']],f.status)}<input type="search" aria-label="客户、申请人或单号" placeholder="客户、申请人或单号" value="${E(f.keyword)}" onchange="${E(call('keyword'))}" onkeydown="if(event.key==='Enter')${E(call('keyword'))}"><label><input type="checkbox" ${f.current?'checked':''} onchange="${E(call('currentCases'))}"> 不限预警日期</label></div>`+card('异常核查清单',caseTable(caseRows()),b('批量分配','assign',[],'',!S.selected.size?'disabled':'')+link('退款申请明细','openLedger',['all']))+note(f.current?'当前展示所选组织全部匹配事项，不受顶部日期范围限制。':'当前按预警首次触发日期筛选。')+coverage();}
  function definition(pairs){return `<dl class="rr-definition">${pairs.map(([a,b])=>`<dt>${E(a)}</dt><dd>${E(b)}</dd>`).join('')}</dl>`}
  function detail(item){const a=data().applicationMap.get(item.id);if(!a)return note('关联退款申请已不在当前数据源中。');const d=data(),o=d.orderMap.get(a.orderId),s=M.stateFor(d,a,S.stored.cases),alert=M.alerts(d,S.stored.cases).find(x=>x.application.id===a.id);let html='';
    const top=`<div class="rr-detail-kpis"><div><small>申请退款</small><b>¥${money(a.amountCents)}</b></div><div><small>已成功退款</small><b>¥${money(M.paid(d,a))}</b></div><div><small>客户</small><b>${E(o.customerName)}</b></div><div><small>核查状态</small><b>${E(s.status)}</b></div></div>`+definition([['原销售门店',store(o.storeId)],['原销售 / 申请人',person(o.sellerId)+' / '+a.applicantName],['原订单 / 退款申请',o.id+' / '+a.id]]);
    if(item.tab==='evidence'){const related=o.payerKey?d.applications.filter(a=>d.orderMap.get(a.orderId)?.payerKey===o.payerKey):[];html=(alert?alert.matches.map(m=>`<section class="rr-evidence"><h3>${E(m.name)}</h3><p>${E(m.detail)}</p></section>`).join(''):note('尚未命中已接入的规则；缺少数据的项目不作正常判断。'))+note('关系线索不等于违规结论。员工代付、家属代付与正常跨月售后应分别核实。')+card('同付款账户关联申请',o.payerKey?table(['客户','原订单','申请金额 / 元','申请日期','申请人'],related.map(a=>[E(d.orderMap.get(a.orderId).customerName),E(a.orderId),money(a.amountCents),E(M.date(a.submittedAt)),E(a.applicantName)])):note('原付款人稳定标识尚未接入，无法判断账户关联关系。'));}
    if(item.tab==='funds')html=card('原订单与权益',table(['原收款日期','原实收 / 元','项目','已消费次数','剩余次数','权益核对'],[[E(o.paidAt||'未接入'),money(o.paidCents),E(o.project),o.consumed??'未接入',o.remaining??'未接入',a.refundedRightsUsable?tag('已退项目仍可使用，待核对','rr-warn'):S.source==='sample'?'未发现已知冲突':'未接入']]))+card('退款执行明细',table(['任务编号','方式','金额 / 元','状态','完成时间','去向 / 账号'],(d.taskMap.get(a.id)||[]).map(t=>[E(t.id),t.method==='transfer'?'人工转账':t.method==='original'?'原路退款':'方式未记录',money(t.amountCents),E(({success:'已退款',pending:'待处理',failed:'退款失败',cancelled:'已取消',rejected:'已拒绝'})[t.status]),E(t.completedAt||'—'),E(t.recipient)+'<small>'+E(t.recipientAccount)+'</small>'])))+card('权益与提成处理',note(a.commissionOverdueCents>0?'应冲回提成逾期未处理：¥'+money(a.commissionOverdueCents):S.source==='sample'?'当前记录未发现已知提成冲回异常。':'提成及权益数据尚未接入。'));
    if(item.tab==='verification'){const v=s.verification||a.verification;html=definition([['核实结果',resultLabel(v?.result)],['客户实际付款',v?.paidMethod||'待核实'],['是否收到退款',v?.received||'待核实'],['核实渠道 / 联系依据',(v?.channel||'未记录')+' / '+(v?.contactBasis||'未记录')],['核实人 / 时间',(v?.by||'—')+' / '+(v?.at||'—')],['核实记录',v?.note||'暂无记录']])+note('登记独立核实结果，不会自动致电或发送消息。应核实真实客户，不能仅凭原付款人的退款通知或顾问提供的截图。')+(s.status==='已结案'?'':b('登记客户核实','verify',[a.id]));}
    if(item.tab==='history')html=`<div class="rr-timeline">${[{at:a.submittedAt,by:a.applicantName,action:'门店提交退款申请',note:a.reason},...(s.history||[])].map(h=>`<div class="rr-timeline-item"><strong>${E(h.action)}</strong><p>${E(h.at)} · ${E(h.by)}</p><p>${E(h.note||'')}</p></div>`).join('')}</div>`+(s.conclusion?note('结案结论：'+s.conclusion+'；'+s.note):'');
    return top+segments([['evidence','异常依据'],['funds','订单与资金'],['verification','客户核实'],['history','处理记录']],item.tab,'detailTab')+`<div class="rr-detail-content">${html}</div>`;
  }
  function edit(item){const r=item.model;if(item.kind==='assign')return note('分配 '+item.ids.length+' 笔核查事项，不改变退款出款状态。')+field('核查负责人','owner',r.owner,'select',A.owners)+field('分配说明','note',r.note,'textarea');if(item.kind==='verify')return field('客户核实结果','result',r.result,'select',A.results)+field('实际付款方式','paidMethod',r.paidMethod,'select',['待核实','客户本人线上支付','现金交门店 / 顾问','家属或朋友代付','员工代付','其他'])+field('客户是否收到退款','received',r.received,'select',['待核实','已收到','未收到','尚未出款'])+field('独立核实渠道','channel',r.channel,'select',['电话回访','已验证客户账号','当面核实','其他'])+field('联系依据','contactBasis',r.contactBasis)+field('核实记录','note',r.note,'textarea')+note('联系方式近期变更时，应注明可信历史联系方式或独立身份核实依据。');return field('结案结论','conclusion',r.conclusion,'select',[['','请选择结案结论'],...A.conclusions])+field('核查依据及处理结果','note',r.note,'textarea')+note('仅结案本次核查事项，不执行退款、扣款或员工处罚。');}
  function drawer(item){if(item.type==='detail')return detail(item);if(item.type==='analysis')return item.content;if(item.type==='edit')return edit(item);if(item.type==='ledger'){const rows=item.ids.map(id=>data().applicationMap.get(id)).filter(Boolean).filter(a=>!item.keyword||[a.id,a.orderId,a.applicantName,data().orderMap.get(a.orderId).customerName].some(v=>String(v).includes(item.keyword))),p=paginate(rows,'drawer');return (item.intro?note(item.intro):'')+`<div class="rr-drawer-toolbar"><input type="search" aria-label="抽屉内搜索" placeholder="客户、申请人或单号" value="${E(item.keyword||'')}" onchange="${E(call('drawerSearch'))}" onkeydown="if(event.key==='Enter')${E(call('drawerSearch'))}">${b('导出明细','exportDrawer')}</div>`+ledgerRows(p.rows)+p.footer}return '';}
  A.openStoreRule=id=>{const f=filter(),rows=M.alerts(data(),S.stored.cases).filter(x=>M.inScope(x.order,f,data())&&M.within(x.order.paidAt,f.from,f.to)&&x.matches.some(m=>m.id===id));open({type:'ledger',title:M.rules.find(x=>x.id===id).name+' · 关联申请',ids:rows.map(x=>x.application.id)})};
  A.views={overview,stores,employees,cases,caseRows,drawer};
  A.storeDetail=id=>{const d=data(),f=filter(),s=d.storeMap.get(id),os=d.orders.filter(o=>o.storeId===id),c=M.cohort(d,os,f.from,f.to),as=d.applications.filter(a=>d.orderMap.get(a.orderId).storeId===id&&M.within(d.orderMap.get(a.orderId).paidAt,f.from,f.to));open({type:'analysis',title:s.name+' · 退款分析',content:`<div class="rr-brief"><span>${E(s.district+' / '+s.area)}</span><span>成熟实收 <strong>${c.available?'¥'+money(c.denominator):'未接入'}</strong></span><span>30 天退款金额率 <strong>${cohortCell(c)}</strong></span></div>`+ledgerRows(as)})};
  A.employeeDetail=id=>{const row=employeeRows().find(x=>x.id===id);if(!row)return;open({type:'analysis',title:person(id)+' · 关联退款',content:note('角色：'+({seller:'原销售人员',service:'服务人员',applicant:'退款申请人',auditor:'财务审核人'})[S.role])+ledgerRows(row.as)+card('付款账户关联',table(['付款标识','关联退款客户数','申请数','申请金额 / 元'],M.unique(row.as.map(a=>data().orderMap.get(a.orderId).payerKey).filter(Boolean)).map(key=>{const as=row.as.filter(a=>data().orderMap.get(a.orderId).payerKey===key);return [E(key),M.unique(as.map(a=>data().orderMap.get(a.orderId).customerId)).length,as.length,money(M.sum(as,a=>a.amountCents))]})))})};
  A.definitions=()=>open({type:'analysis',title:'指标与预警说明',content:definition([['成功退款金额','按支付任务成功完成时间统计，仅计实际成功部分。'],['退款订单数','本期成功退款关联的原订单去重；拆分任务、重试不重复计数。'],['新增预警','按首次触发日期、退款申请去重。一个申请可命中多条规则，类型分布不可直接相加。'],['当前待核查','组织范围尚未结案的事项，含历史积压，不受日期筛选限制。超过 48 小时作为优先联系提示。'],['30 天退款金额率','成熟批次收款后 30 天内成功退款 ÷ 同批次实际收款。未满 30 天排除，少于 10 单不作比较；充值与余额消费不重复计实收。'],['同类中位数','当前范围同类型、成熟订单不少于 10 单的门店比率中位数，至少 3 家才显示。'],['组织与人员','经营分析按原销售门店；申请人、销售及服务人员分别归属。缺失身份和组织不按姓名猜测匹配。']])+M.rules.map(r=>`<section class="rr-evidence"><h3>${E(r.name)}</h3><p>${E(r.description)}</p></section>`).join('')});
  A.exportCurrent=()=>{if(S.tab==='cases'){A.csv('退款异常核查',['数据来源','申请编号','门店','客户','金额 / 元','优先级','异常类型','负责人','状态','结论'],caseRows().map(x=>[S.source,x.application.id,store(x.order.storeId),x.order.customerName,x.application.amountCents/100,x.priority,x.matches.map(m=>m.name).join('、'),x.state.owner,x.state.status,x.state.conclusion]));return}if(S.tab==='employees'){A.csv('员工退款分析',['数据来源','角色','员工','关联成功退款 / 元','关联申请数','关联预警数'],employeeRows().map(x=>[S.source,S.role,person(x.id),x.amount/100,x.as.length,x.al.length]));return}if(S.tab==='stores'&&S.view==='performance'){A.csv('门店退款表现',['数据来源','门店','大区','区域','成熟批次实收 / 元','成熟订单数','观察中订单数','30天退款金额率'],storeStats().map(x=>[S.source,x.s.name,x.s.district,x.s.area,x.c.available?x.c.denominator/100:'未接入',x.c.count??'',x.c.observing??'',cohortCell(x.c)]));return}if(S.tab==='overview'){const m=M.metrics(data(),filter(),S.stored.cases);A.exportApplications(M.unique(m.tasks.map(t=>t.applicationId)),'本期成功退款关联申请');return}if(S.view==='period'){A.csv('跨月退款分析',['数据来源','月末收款筛选','原收款月份','原批次实收 / 元','退款月份','成功退款 / 元','占原批次实收','观察状态'],periodMatrix().flatMap(r=>r.cells.map(c=>[S.source,filter().monthEnd?'仅月末最后5天':'全部',r.month,data().completePayments?r.denominator/100:'未接入',c.month,c.future?'':c.amount/100,!c.future&&data().completePayments?M.percent(c.amount,r.denominator):'—',c.future?'未到观察期':c.complete?'已完整观察':'观察中'])));return}A.exportApplications(operationRows().map(x=>x.application.id),'门店操作异常');};
})();

;
/* Register synchronously. The loader awaits initialization without top-level writes. */
window.PCModules['refund-risk']={
  ready:Promise.resolve().then(()=>RefundRiskApp.initialize()),
  render:()=>RefundRiskApp.enter(),
  leave:()=>RefundRiskApp.leave()
};
