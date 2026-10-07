/* Stable, editable scenario tickets. Build in isolated configuration; append once. */
(function(root){
'use strict';
function createWorkflowExamples(E,C,P){
 const catalog=[
  ['W04','待处理','定级依据不足，经理确认','grading'],['W05','待处理','规则未匹配，补齐后重试','matching'],
  ['W01','待处理','非派单时段，等待当班售后','waiting'],['W02','待处理','已分派，等待首次联系','first'],['W03','待处理','售后人员配置异常，等待重试','staffing'],
  ['P01','处理中','售后已联系，继续协商方案','follow'],['P02','处理中','同部门已转派，接收客服继续办理','transfer'],
  ['P03','处理中','门店已联系，待确认处理结果','store_first'],['P04','处理中','门店未解决，售后已接手跟进','store_escalated'],['P05','处理中','售后已安抚解决，可直接结案','sales_resolved'],
  ['P06','审批中','部门会签，一人通过等待另一人','all'],['P07','审批中','部门依次审批，等待下一位','sequential'],['P08','审批中','部门或签，任一负责人可办理','any'],
  ['P09','处理中','部门驳回，售后补充处理依据','rejected'],['P10','处理中','置换商品待门店交付','store'],['P11','付款办理','退款方案已确认，财务待付款','payment'],
  ['P12','付款办理','付款失败，待财务重新登记','failed'],['P13','处理中','付款退回，售后补充收款信息','returned'],
  ['P14','待结案','无退赔事项已完成，待客服结案','close_service'],['P15','待结案','退款已到账，待客服核实结案','close_refund'],['P16','待结案','商品已交付，待客服确认结案','close_exchange'],
  ['P17','处理中','挂起已恢复，继续售后办理','resumed'],['P18','处理中','五级客诉，售后经理直接办理','urgent'],['P19','处理中','门店节点缺少办理人，等待重新匹配','node_missing'],
  ['P20','付款办理','无资金事项，财务确认无需付款','zero_payment'],['P21','处理中','电话与门店多渠道补充同一工单','channels'],
  ['P22','处理中','首次联系未接通，等待继续跟进','unanswered'],['P23','待处理','非 CRM 来源，等待门店首次联系','store_waiting'],
  ['P24','待结案','赔偿已到账，待客服核实结案','close_compensation'],['P25','待结案','退款及赔偿已到账，待客服结案','close_combined'],
  ['P26','待结案','退款及商品交付已完成，待客服结案','close_refund_exchange'],['P27','待结案','赔偿及商品交付已完成，待客服结案','close_compensation_exchange'],
  ['P31','采购办理','商品置换方案已确认，等待采购办理','procurement_exchange'],['P32','采购办理','退款已完成，等待商品采购及交付','procurement_refund_exchange'],['P33','采购办理','赔偿已完成，等待商品采购及交付','procurement_compensation_exchange'],
  ['H01','已挂起','首次联系前挂起，等待客户方便联系','suspended_first'],['H02','已挂起','售后办理挂起，等待客户补充资料','suspended_sales'],
  ['H03','已挂起','节点已超时后挂起，恢复保留超时','suspended_node_overdue'],['H04','已挂起','工单挂起中，整单仍已超时','suspended_total_overdue'],
  ['H05','已挂起','再次挂起，由售后主管核实办理','suspended_manager'],['H06','已挂起','主管已延长挂起，保留原定恢复时间','suspended_extended'],['H07','已挂起','临近节点超时时挂起，待主管复核','suspended_near'],
  ['P28','处理中','挂起到期已自动恢复，客服继续跟进','auto_resumed'],['P29','处理中','主管纠正不合理挂起，时间计入办理耗时','invalidated'],['P30','处理中','自主挂起次数已用完，再次挂起须由主管办理','quota_used'],
  ['C08','已结案','门店安抚解决，直接结案','store_resolved'],['C09','已结案','售后安抚解决，直接结案','sales_closed'],
  ['P35','采购办理','退款已完成，待采购置换商品','procurement_refund_exchange'],['P36','采购办理','赔偿已完成，待采购置换商品','procurement_compensation_exchange'],
  ['P37','处理中','门店已联系，待确认是否解决','store_first'],['P38','待处理','微信来源，等待门店联系','store_waiting'],['P39','处理中','门店未解决，转售后继续跟进','store_escalated'],
  ['P34','付款办理','退款及置换，付款完成后进入采购','payment_exchange'],
  ['P40','审批中','两个项目退款并额外赔偿，等待付款','multi_refund'],['P41','付款办理','多项目退款及多商品置换，付款后采购','multi_exchange'],
  ['C01','已结案','服务协调完成，无退赔结案','service'],['C02','已结案','退款到账，客服确认结案','refund'],['C03','已结案','赔偿到账，客服确认结案','compensation'],
  ['C04','已结案','退款与赔偿到账，客服确认结案','combined'],['C05','已结案','置换商品已签收，客服确认结案','exchange'],['C06','已结案','退款及商品置换完成，客服结案','refund_exchange'],['C07','已结案','赔偿及商品置换完成，客服结案','compensation_exchange']
 ].map(([suffix,state,title,kind])=>({id:'KS20261007-'+suffix,suffix,state,title,kind}));
 const proof=name=>[{name,data:'data:text/plain;charset=utf-8,'+encodeURIComponent('处理事项已线下核实完成。')}];
 function build(s,entry){
  const x=C.initialize(E.seed());x.tickets=[];x.orders=[];x.sequence=1;
  if(['grading','matching'].includes(entry.kind)){E.ensureIntakeExamples(x);E.prepareTickets(x);const t=E.clone(x.tickets.find(t=>t.id==='KS20261007-'+(entry.kind==='grading'?'G01':'R01')));t.id=entry.id;t.title=entry.title;t.scenarioKey=entry.kind;return {ticket:t,order:null};}
  const finance=C.Assignment.get(x.configuration);finance.positions.find(p=>p.id==='finance').members=['finance','sun'];x.configuration=C.Assignment.save(x.configuration,'manager',finance,finance.version);
  const kind=entry.kind,solutionKind=kind.replace(/^(close_|procurement_)/,''),level=kind==='urgent'?5:['compensation','combined','compensation_exchange'].includes(solutionKind)?3:2;
  if(level===5){const rule=C.Rules.newScene(x.configuration);rule.level=5;rule.name='五级紧急客诉';x.configuration=C.Rules.saveScene(x.configuration,'manager',rule,x.configuration.sceneRevision,Date.now());}
  const scene=P.prepare(x.configuration,C.Rules.sceneList(x.configuration).find(r=>r.level===level));scene.enabled=true;
  const sales=P.node('sales',x.configuration,scene),close=P.node('close',x.configuration,scene),payment=P.node('payment',x.configuration,scene),store=P.node('store',x.configuration,scene),procurement=P.node('procurement',x.configuration,scene);
  sales.source='person';sales.personId=level===5?'manager':'aftercare';sales.hours=24;scene.config.timing.firstContactHours=2;
  payment.source='person';payment.personId='finance';store.fallbackId='store2';
  const approval={...C.Rules.Flow.node(),title:'财务事项核实',source:'position',positionId:'finance',mode:['all','sequential','any'].includes(kind)?kind:'all',handling:{hours:4}};
  let type=kind==='multi_refund'?'combined':['payment_exchange','multi_exchange'].includes(kind)?'refund_exchange':kind.startsWith('procurement_')?kind.slice('procurement_'.length):entry.state==='待结案'?solutionKind:entry.suffix.startsWith('C')?kind:['store','node_missing'].includes(kind)?'exchange':['follow','zero_payment'].includes(kind)?'service':'refund';
  const funded=E.solutionIncludes.refund(type)||E.solutionIncludes.compensation(type),exchange=E.solutionIncludes.exchange(type);
  let middle=[];
  if(['all','sequential','any','rejected'].includes(kind))middle=[approval,payment];
  else if(exchange)middle=[...(funded?[payment]:[]),procurement,...(['store','node_missing'].includes(kind)?[store]:[])];
  else if(funded||kind==='zero_payment')middle=[payment];
  if(!['all','sequential','any','rejected','store','payment','failed','returned','node_missing','zero_payment','payment_exchange','multi_refund','multi_exchange'].includes(kind)&&!kind.startsWith('procurement_')&&!['待结案','已结案'].includes(entry.state))middle=E.clone(scene.config.ticketFlow.nodes.slice(1,-1));
  scene.config.ticketFlow={schema:1,start:'ticket-created',nodes:[sales,...middle,close]};if(['store_first','store_waiting','store_escalated','store_resolved'].includes(kind))P.prepareEntry(x.configuration,scene);P.validate(scene,x.configuration);
  x.configuration=C.Rules.saveScene(x.configuration,'manager',scene,x.configuration.sceneRevision,Date.now());
  const order={id:'ORDER-'+entry.suffix,external:'DD20261007'+entry.suffix,system:'A3主系统',member:'M20261007'+entry.suffix,name:'林女士',phone:'13800001002',store:'上海徐汇店',project:exchange?'修护护理及配套商品':'面部护理套餐',paid:398000,refunded:0,staff:'刘欣',receptionistId:'zhang',isNew:'老客'};order.items=[{id:order.id+'-1',name:'面部护理疗程',quantity:5,paid:298000,refunded:0},{id:order.id+'-2',name:'配套修护护理',quantity:2,paid:100000,refunded:0}];x.orders.push(order);
  let t=E.create(x,'chen',{...order,order:order.id,channel:['store_first','store_waiting','store_escalated','store_resolved'].includes(kind)?(entry.suffix==='P38'?'微信小程序':'400电话'):'门店H5 / A3',title:entry.title,description:kind==='urgent'?'客户纠纷升级，警方到店协调，请售后经理介入。':'客户对已购护理项目提出退款相关诉求，请核实服务记录并协调处理。'});t.id=entry.id;
  if(E.isStoreIntake(t)){if(kind!=='store_waiting')E.follow(x,t,t.currentAssignee,{connected:true,content:'门店已电话联系客户，核实服务情况并沟通处理。'});if(kind==='store_resolved')E.closeEarly(x,t,t.currentAssignee,{note:'门店解释并安抚后客户问题已解决，无退赔及置换事项。',completed:true});if(kind==='store_escalated'){E.finishStoreIntake(x,t,t.currentAssignee,{note:'门店无法满足客户要求，请售后继续处理。'});E.follow(x,t,t.owner,{connected:true,content:'售后已重新联系客户并继续沟通。'});}E.prepareTickets(x);t.scenarioKey=kind;return {ticket:t,order};}
  if(kind==='waiting'){t.owner='';t.currentAssignee='';t.phase='待分派';t.taskDeadline=null;t.pendingAssignment={mode:'schedule',node:'contact',dispatcher:'manager',candidates:['aftercare','chen','zhou'],reason:'受理时未到开派时间，等待当班售后人员',resumeState:'待首联',queuedAt:t.created};}
  else if(kind==='staffing'){t.owner='';t.currentAssignee='manager';t.phase='待分派';t.taskDeadline=null;t.pendingAssignment={mode:'configuration',dispatcher:'manager',reason:'受理时售后岗位没有有效人员，请维护岗位人员后重新匹配规则'};}
  else if(kind==='unanswered')E.follow(x,t,t.owner,{connected:false,content:'电话暂未接通，已记录本次联系情况，将继续联系客户。'});
  else if(!['first','suspended_first','assistance_first'].includes(kind))E.follow(x,t,t.owner,{connected:true,content:'已与客户联系并核实订单，相关事项按线下沟通结果继续处理。'});
  const owner=()=>t.owner,actor=()=>E.taskPeople(x,t)[0];
  const proposal={detailsVersion:2,typeKey:type,refundOrderId:order.id,refundItems:[{itemId:order.items[0].id,amount:50000}],refundStore:order.store,performanceId:'zhang',payout:{method:'alipay',name:'林女士',account:'13800001002'},refund:E.solutionIncludes.refund(type)?50000:0,compensation:E.solutionIncludes.compensation(type)?10000:0,exchangeItems:exchange?[{productId:'repair-cream',name:'舒缓修护霜 50g',quantity:2,unitPrice:18000,remark:'按客户确认的规格安排交付'}]:[],content:'已线下沟通确认：'+E.SOLUTION_TYPES[type]+'，按约定完成处理事项。',account:'原支付渠道'};
  if(['multi_refund','multi_exchange'].includes(kind)){proposal.refundItems=[{itemId:order.items[0].id,amount:30000},{itemId:order.items[1].id,amount:20000}];proposal.content=kind==='multi_refund'?'已确认面部护理疗程退款300元、配套修护护理退款200元，另额外赔偿100元，应付款合计600元。':'已确认两个项目合计退款500元，另置换修护霜2件、面膜1件，商品总价值480元。付款完成后安排采购交付。';}
  if(kind==='multi_exchange')proposal.exchangeItems=[{productId:'repair-cream',quantity:2},{productId:'repair-mask',quantity:1}];
  const procure=()=>E.finishProcurement(x,t,actor(),{method:'总部发货',items:E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining})),trackingNumber:'SF20261007'+entry.suffix,note:'已按客户确认的商品及数量发货。'});
  const confirm=()=>E.confirmSolution(x,t,owner(),proposal),pay=()=>E.pay(x,t,actor(),{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'PAY-'+entry.suffix,proof:proof('付款凭证.txt')});
  if(kind==='transfer')E.transferAftercare(x,t,owner(),'chen','已线下完成交接，由陈悦继续联系客户。');
  if(kind==='sales_closed'){E.closeEarly(x,t,t.owner,{note:'售后已解释并安抚客户，无退赔及置换事项。',completed:true});E.prepareTickets(x);t.scenarioKey=kind;return {ticket:t,order};}

  if(['all','sequential','any','rejected','store','payment','failed','returned','node_missing','zero_payment','payment_exchange','multi_refund','multi_exchange'].includes(kind)||kind.startsWith('procurement_')||['待结案','已结案'].includes(entry.state)){
   if(kind==='node_missing'){store.source='person';store.personId='store2';store.fallbackId='store2';Object.assign(t.flow.config.ticketFlow.nodes.find(n=>n.kind==='store'),store);x.configuration.organization.appointments.find(a=>a.personId==='store2').active=false;}
   confirm();if(kind.startsWith('procurement_')&&funded)pay();if(['store','node_missing'].includes(kind))procure();
   if(['all','sequential'].includes(kind))E.approve(x,t,actor(),true,'已核实相关事项，继续按节点要求办理。');
   if(kind==='rejected')E.approve(x,t,actor(),false,'请补充客户剩余服务次数及协商金额依据。');
   if(kind==='failed')E.pay(x,t,actor(),{result:'失败',reason:'收款账户状态异常，请核实后重试。'});
   if(kind==='returned')E.pay(x,t,actor(),{result:'退回',reason:'请补充完整收款账户信息。'});
   if(entry.state==='待结案'){
    if(funded)pay();
    if(exchange)procure();
   }
   if(entry.state==='已结案'){
    if(E.currentFlowNode(t).kind==='payment')pay();
    if(E.currentFlowNode(t).kind==='procurement')procure();
    if(E.currentFlowNode(t).kind==='store')E.finishStore(x,t,actor(),{note:'置换商品已交付客户并签收。',files:proof('商品签收记录.txt')});
    if(E.currentFlowNode(t).kind==='payment')pay();
    E.closeTicket(x,t,owner(),{note:'已线下确认相关部门处理完成'+(exchange?'、商品已签收':'')+(funded?'、款项已到账':'')+'，客服确认结案。',completed:true});
   }
  }
  if(kind.startsWith('suspended_')||['resumed','auto_resumed','invalidated','quota_used'].includes(kind)){
   if(kind==='suspended_near')t.taskDeadline=Date.now()+30*60000;
   if(kind==='suspended_node_overdue')t.taskDeadline=Date.now()-E.H;
   if(kind==='suspended_total_overdue'){t.created=Date.now()-73*E.H;t.deadline=Date.now()-E.H;}
   E.suspendTicket(x,t,owner(),{reasonType:kind==='suspended_first'?'customer_time':'materials',evidenceId:E.suspensionEvidence(t)[0]?.id,basis:'已核实等待事项',note:kind==='suspended_first'?'客户暂时不便接听，约定后续联系。':'等待客户补充支付记录，节点暂停计时，整单继续计时。',expectedAt:Date.now()+24*E.H});
   if(kind==='suspended_extended')E.extendSuspension(x,t,'manager',{expectedAt:Date.now()+48*E.H,basis:'客户明确约定两天后提交资料，已核实沟通记录。'});
   if(kind==='auto_resumed'){t.created=Date.now()-4*E.H;t.firstContact=Date.now()-3*E.H;t.nodeTiming.startedAt=t.firstContact;t.suspension.at=Date.now()-2*E.H;t.suspension.expectedAt=Date.now()-E.H;E.prepareTickets(x);}
   if(kind==='invalidated')E.invalidateSuspension(x,t,'manager','实际等待内部处理，应正常流转，不符合挂起条件。');
   if(['resumed','quota_used','suspended_manager'].includes(kind)){t.suspension.at-=E.H;E.resumeTicket(x,t,owner(),'资料已补齐，恢复原售后节点继续办理。');if(kind==='suspended_manager')E.suspendTicket(x,t,'manager',{reasonType:'materials',evidenceId:E.suspensionEvidence(t)[0]?.id,note:'仍缺少客户必要材料，已核实继续等待。',basis:'已使用一次自主挂起，由主管核实后再次挂起。',expectedAt:Date.now()+12*E.H});}
  }
  if(kind==='channels'){t.sources.push({channel:'门店H5 / A3',at:Date.now(),content:'门店补充当日服务记录，合并到同一客诉工单继续办理。'});E.log(t,'store2','补充来源记录','门店已补充服务记录，沿用原工单处理。');}
  E.prepareTickets(x);t.scenarioKey=entry.kind;return {ticket:t,order};
 }
 // Upgrade saved prototype solutions as well as the initial catalogue. This is a
 // one-time data fill; it never confirms a solution or advances a workflow node.
 function ensureSolutionExamples(s){
  if(s.solutionExamplesVersion>=1)return false;
  const backup={version:1,proposals:{},orders:{}},positive=n=>Number.isSafeInteger(n)&&n>0;
  const archiveOrder=o=>{if(!backup.orders[o.id])backup.orders[o.id]=E.clone(o);};
  const split=(total,capacities)=>{
   const sum=capacities.reduce((a,b)=>a+b,0);if(!sum||total>sum)return null;
   const values=capacities.map(cap=>Math.floor(total*cap/sum));let rest=total-values.reduce((a,b)=>a+b,0);
   for(let i=0;i<values.length&&rest;i++){const add=Math.min(rest,capacities[i]-values[i]);values[i]+=add;rest-=add;}return values;
  };
  const seedOrderItems=o=>{
   if(o.items?.length)return;
   archiveOrder(o);
   // Preserve item IDs that have already been used in a saved detailed solution.
   const referenced=s.tickets.some(t=>(t.proposal?.refundOrderId||t.order)===o.id&&t.proposal?.refundItems?.length);
   if(referenced||o.paid<2){o.items=E.clone(E.orderItems(o));return;}
   const paid=[Math.ceil(o.paid*.7),o.paid-Math.ceil(o.paid*.7)],refunded=split(o.refunded||0,paid)||[o.refunded||0,0];
   o.items=paid.map((amount,i)=>({id:o.id+'-'+(i+1),name:i?'配套修护护理':o.project||'护理疗程',quantity:i?2:5,paid:amount,refunded:refunded[i]}));
  };
  const newOrder=(t,amount)=>{
   const id='SOLUTION-'+t.id,existing=s.orders.find(o=>o.id===id);if(existing)return existing;
   const o={id,external:'DD-'+t.id,system:'CRM系统',member:t.member||'',name:t.name,phone:t.phone,store:t.store,project:t.project||'面部护理套餐',paid:Math.max(398000,amount*2),refunded:0,staff:'刘欣',receptionistId:'',isNew:t.isNew||'老客'};
   s.orders.push(o);seedOrderItems(o);return o;
  };
  const paid=(t,p)=>(t.payments||[]).some(row=>row.result==='成功'&&(row.version===p.version||row.version==null));
  const capacity=(t,p,o)=>{
   if(['已结案','已合并'].includes(t.phase)||paid(t,p))return o.items.map(item=>item.paid);
   const reserved=s.tickets.filter(other=>other.id!==t.id&&(other.proposal?.refundOrderId||other.order)===o.id&&other.proposal?.status==='已确认'&&!['已结案','已合并'].includes(other.phase)&&!paid(other,other.proposal));
   return o.items.map(item=>Math.max(0,item.paid-(item.refunded||0)-reserved.reduce((sum,other)=>sum+(other.proposal.refundItems?.filter(row=>row.itemId===item.id).reduce((n,row)=>n+row.amount,0)||0),0)));
  };
  for(const t of s.tickets){
   const p=t.proposal;if(!p)continue;
   const key=E.solutionKey(p);if(!E.SOLUTION_TYPES[key])continue;
   const before=E.clone(p),refund=E.solutionIncludes.refund(key),compensation=E.solutionIncludes.compensation(key),exchange=E.solutionIncludes.exchange(key);
   // Correct the old form's zero-value refund/compensation placeholders only.
   if(refund&&!positive(p.refund))p.refund=50000;
   if(compensation&&!positive(p.compensation))p.compensation=10000;
   if(refund){
    let o=s.orders.find(o=>o.id===(p.refundOrderId||t.order)&&o.phone===t.phone);
    if(!o)o=newOrder(t,p.refund);seedOrderItems(o);
    const rows=p.refundItems||[],validRows=rows.length&&rows.every(row=>positive(row.amount)&&o.items.some(item=>item.id===row.itemId))&&rows.reduce((sum,row)=>sum+row.amount,0)===p.refund;
    if(validRows){p.refundItems=rows.map(row=>{const item=o.items.find(item=>item.id===row.itemId);return {itemId:item.id,name:item.name,quantity:item.quantity,paid:item.paid,...row};});}
    else{
     let amounts=split(p.refund,capacity(t,p,o));
     if(!amounts||!['已结案','已合并'].includes(t.phase)&&!paid(t,p)&&p.refund>E.refundBalance(s,t,o)){o=newOrder(t,p.refund);amounts=split(p.refund,capacity(t,p,o));}
     p.refundItems=o.items.map((item,i)=>({itemId:item.id,name:item.name,quantity:item.quantity,paid:item.paid,amount:amounts[i]})).filter(row=>row.amount>0);
    }
    p.refundOrderId=o.id;p.refundOrderNo||=o.external;p.refundStore||=o.store;
    if(!p.performanceId&&!p.performanceName){const staff=E.refundStaff(s,p.refundStore);p.performanceId=staff.find(person=>person.name===o.staff)?.id||staff.find(person=>person.id===o.receptionistId)?.id||staff[0]?.id||'';if(!p.performanceId)p.performanceName=o.staff||'刘欣';}
   }
   if(exchange){
    const items=p.exchangeItems?.length?p.exchangeItems:[{productId:'repair-cream',quantity:2},{productId:'repair-mask',quantity:1}];
    p.exchangeItems=items.map(item=>{const product=E.PRODUCTS.find(row=>row.id===item.productId||row.name===item.name),quantity=positive(item.quantity)?item.quantity:1,unitPrice=positive(item.unitPrice)?item.unitPrice:positive(item.value/quantity)?item.value/quantity:product?.unitPrice||18000;return {...item,...(product?{productId:product.id}:{}),name:item.name||product?.name||'舒缓修护霜 50g',quantity,unitPrice,value:quantity*unitPrice,remark:item.remark||''};});
    p.exchangeValue=p.exchangeItems.reduce((sum,item)=>sum+item.value,0);
   }
   if(refund||compensation){
    const existing=p.payout||{},legacy=String(p.account||''),method=existing.method||(/银行/.test(legacy)?'bank':/微信/.test(legacy)?'wechat':'alipay');
    const account=existing.account||legacy.match(/\d{12,30}/)?.[0]||(method==='bank'?'622202'+String(t.phone||'13800001002')+'8':method==='wechat'?'wx_'+String(t.phone||'13800001002').slice(-8):t.phone||'13800001002');
    p.payout={...existing,method,name:existing.name||t.name||'林女士',account,bank:method==='bank'?existing.bank||'中国工商银行上海徐汇支行':''};
    p.account=({bank:'银行卡',alipay:'支付宝',wechat:'微信'})[method]+' · '+p.payout.name+' · '+account+(p.payout.bank?' · '+p.payout.bank:'');
   }
   if(JSON.stringify(p)!==JSON.stringify(before)){
    backup.proposals[t.id]=before;p.detailsVersion=2;p.typeKey=key;p.type=E.SOLUTION_TYPES[key];p.refund??=0;p.compensation??=0;p.exchangeItems??=[];p.exchangeValue??=0;
    p.version??=1;p.status||='已确认';p.confirmedBy||=t.owner||t.creator||'aftercare';p.confirmedAt||=t.updated||t.created;
   }
  }
  s.solutionDetailsBackup=backup;s.solutionExamplesVersion=1;return true;
 }
 function ensureWorkflowExamples(s){
  if(s.workflowExamplesVersion>=7)return false;
  const additions=catalog.filter(row=>!s.tickets.some(t=>t.id===row.id)).map(entry=>{try{return build(s,entry);}catch(error){throw Error(entry.id+'：'+error.message,{cause:error});}});
  for(const built of additions){s.tickets.push(built.ticket);if(built.order&&!s.orders.some(o=>o.id===built.order.id))s.orders.push(built.order);}
  s.workflowExamplesVersion=7;return true;
 }
 return {WORKFLOW_EXAMPLES:catalog,ensureWorkflowExamples,ensureSolutionExamples};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createWorkflowExamples;else root.createWorkflowExamples=createWorkflowExamples;
})(typeof window!=='undefined'?window:globalThis);
