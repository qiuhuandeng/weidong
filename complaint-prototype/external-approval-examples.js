/* Persisted local fixtures for the external approval lifecycle; no network calls. */
(function(root){
'use strict';
function create(E,C,P){
 const specs=[
  ['D01','审批中','付款审批中，等待钉钉审批结果','payment'],
  ['D02','付款办理','付款审批已通过，等待财务付款','approved'],
  ['D03','审批中','退款已到账，采购审批中','purchase'],
  ['D04','处理中','付款审批拒绝，售后调整方案','refused'],
  ['D05','处理中','已付款，采购拒绝后调整商品','paid-refused'],
  ['D06','审批中','申请发起失败，等待重新发起','failed'],
  ['D07','审批中','审批状态待同步，保留当前节点','pending'],
  ['D08','采购办理','采购审批通过，等待采购交付','purchase-approved'],
  ['D09','处理中','审批已撤销，售后重新确认方案','terminated'],
  ['D10','审批中','申请结果待确认，先同步后重试','uncertain'],
  ['D11','审批中','仅置换商品，直接进入采购审批','exchange'],
  ['D12','审批中','付款申请字段未关联，等待修复模板','template-fields'],
  ['D13','审批中','收款账号缺失，等待售后补充方案','application-data'],
  ['D14','采购办理','总部已发出部分商品，等待继续发货','shipment-partial'],
  ['D15','待结案','门店已完成发货，等待售后结案','shipment-store'],
  ['D16','已结案','供应商发货完成，售后已结案','shipment-other'],
  ['D17','采购办理','采购办理：待发货','purchase-shipping'],
  ['D18','采购办理','采购办理：部分发货','shipment-pending']
 ];
 const catalog=specs.map(([suffix,state,title,kind])=>({id:'KS20261007-'+suffix,state,title,kind:'dingtalk-'+kind}));
 function ensureExternalApprovalExamples(s){
  if(s.externalApprovalExamplesVersion>=4)return false;
  const existingExamples=s.externalApprovalExamplesVersion>=1;
  const source=s.tickets.find(t=>t.id==='KS20261007-P41');if(!source?.proposal)return false;
  // Retain first-step display-only records as an archive. Linked instances below
  // now provide both the approval list and the corresponding ticket detail.
  if(!existingExamples)s.approvalRecordExampleArchive=(s.approvalRecords||[]).filter(r=>/^approval-record-[1-6]$/.test(r.id));
  s.approvalRecords=(s.approvalRecords||[]).filter(r=>!/^approval-record-[1-6]$/.test(r.id));
  for(const [suffix,,title,kind] of specs){
   const id='KS20261007-'+suffix;if(s.tickets.some(t=>t.id===id))continue;
   const t=E.clone(source),o=E.clone(s.orders.find(o=>o.id===source.proposal.refundOrderId));
   t.id=id;t.title=title;t.scenarioKey='dingtalk-'+kind;t.proposal.version=1;t.proposal.revision=1;t.proposal.status='已确认';t.proposalHistory=[];t.executionHistory=[];t.approvalHistory=[];t.approval=null;t.payments=[];t.handlingRecords=[];t.logs=[];t.related=[];delete t.suspension;delete t.pendingAssignment;
   o.id='ORDER-'+suffix;o.external='DD20261007'+suffix;o.refunded=0;
   o.items.forEach((item,i)=>{item.id=o.id+'-'+(i+1);item.refunded=0;t.proposal.refundItems[i].itemId=item.id;});
   t.order=o.id;t.proposal.refundOrderId=o.id;t.proposal.refundOrderNo=o.external;
   const scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(x=>x.level===2)),sales=P.node('sales',s.configuration,scene),payment=P.node('payment',s.configuration,scene),proc=P.node('procurement',s.configuration,scene),close=P.node('close',s.configuration,scene);
   sales.source='person';sales.personId=t.owner;sales.done=true;sales.people=[t.owner];sales.startedAt=Date.now()-2*E.H;sales.completedAt=Date.now()-E.H;sales.completedBy=t.owner;
   payment.source='person';payment.personId='finance';
   const exchangeOnly=kind==='exchange';
   if(exchangeOnly){Object.assign(t.proposal,{typeKey:'exchange',type:'商品置换',refund:0,refundItems:[],compensation:0,payout:{},account:'',content:'已与客户确认置换修护霜及面膜，无退款赔偿事项。'});}
   let paymentTemplate='approval-payment';
   if(kind==='template-fields'){
    paymentTemplate='approval-payment-store';const integration=s.configuration.approvalIntegration;
    if(!integration.templates.some(x=>x.id===paymentTemplate)){
     const template=E.clone(integration.templates.find(x=>x.id==='approval-payment'));template.id=paymentTemplate;template.name='门店付款申请';template.version=1;template.mappings.ticket.source='';integration.templates.push(template);integration.revision++;
    }
   }
   if(kind==='application-data')t.proposal.payout.account='';
   const steps=[sales,...(exchangeOnly?[]:[E.externalApprovalNode(paymentTemplate,'付款审批',12),payment]),E.externalApprovalNode('approval-purchase','采购审批',12),proc,close];
   const flow=E.clone(t.flow);flow.config.ticketFlow={schema:1,start:'ticket-created',procurementVersion:2,externalApprovalVersion:1,nodes:E.clone(steps)};t.flow=flow;t.execution={schema:1,proposalVersion:1,steps,index:1,path:[],at:Date.now()};t.created=Date.now()-3*E.H;t.updated=Date.now();t.firstContact=t.created+E.H;t.deadline=t.created+48*E.H;delete t.nodeTiming;delete t.nodeTimings;
   s.orders.push(o);s.tickets.push(t);E.log(t,t.owner,'确认解决方案',t.proposal.content);E.enterFlowNode(s,t);
   let tick=0;
   const launch=()=>E.externalApprovalRecord(s,t);
   const result=(r,result,reason='')=>E.applyApprovalEvent(s,{id:id+'-event-'+(++tick),instanceId:r.instanceId,scope:'instance',type:result==='terminate'?'terminate':'finish',result,reason,at:Math.max(Date.now(),r.at)+tick,actor:result==='terminate'?E.user(t.owner).name:r.templateId==='approval-purchase'?'顾宁':'陆清'});
   if(kind==='failed'){const r=E.externalApprovalRecord(s,t);Object.assign(r,{status:'failed',instanceId:'',people:[],error:'审批申请发送失败，请重新发起'});r.events=[{title:'发起审批失败',actor:'系统',at:r.at,note:r.error}];t.approval.status='发起失败';t.approval.people=[];}
   else if(kind==='uncertain'){const r=E.externalApprovalRecord(s,t);r.status='uncertain';r.instanceId='';r.people=[];r.error='发起请求已发送，尚未确认是否生成审批实例';r.syncStatus='pending';t.approval.status='状态待确认';}
   else if(kind!=='failed'){
    let r=launch();
    if(['approved','purchase','paid-refused','purchase-approved','purchase-shipping','shipment-pending','shipment-partial','shipment-store','shipment-other'].includes(kind)){
     result(r,'agree');
     if(kind!=='approved'){
      E.pay(s,t,E.taskPeople(s,t)[0],{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'PAY-'+suffix,proof:[{name:'付款凭证.txt',data:'data:text/plain;charset=utf-8,paid'}]});r=launch();
      if(kind==='paid-refused')result(r,'refuse','修护霜库存不足，请更换商品并重新确认采购。');
      if(['purchase-approved','purchase-shipping'].includes(kind)||kind.startsWith('shipment-'))result(r,'agree');
      if(kind.startsWith('shipment-')){
       const partial=['shipment-partial','shipment-pending'].includes(kind),items=E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:partial?1:x.remaining}));
       E.finishProcurement(s,t,t.currentAssignee,{method:partial?'总部发货':kind==='shipment-store'?'门店发货':'其他',items:partial?items.slice(0,1):items,trackingNumber:kind==='shipment-store'?'JD202610071502':'SF20261007'+suffix,note:partial?'修护霜先发 1 件，其余商品到货后继续发出。':kind==='shipment-store'?'门店核对商品数量后寄出。':'供应商直接发货，已核实商品明细。'});
       if(kind==='shipment-other')E.closeTicket(s,t,t.owner,{note:'客户已收到全部置换商品，款项已到账，确认结案。',completed:true});
      }
     }
    }else if(kind==='refused')result(r,'refuse','退款项目依据不足，请补充已使用与未使用项目的说明。');
    else if(kind==='terminated')result(r,'terminate','客户调整处理要求，撤销本次申请。');
    else if(kind==='pending')r.syncStatus='pending';
    else if(kind==='payment')E.applyApprovalEvent(s,{id:id+'-task',instanceId:r.instanceId,scope:'task',type:'finish',result:'agree',people:['孙琳'],actor:'陆清',title:'财务负责人同意',at:Date.now()+1});
   }
   t.state=E.ticketStatus(t);E.trackNodeClock(t,null);
  }
  // Upgrade only the three untouched approval sample tickets, with full backups.
  if(!existingExamples)s.externalApprovalSampleBackup=[];
  for(const suffix of existingExamples?[]:['P06','P07','P08']){
   const t=s.tickets.find(t=>t.id==='KS20261007-'+suffix),n=t&&E.currentFlowNode(t);
   if(n?.type!=='approval'||n.provider==='dingtalk'||!['all','sequential','any'].includes(t.scenarioKey))continue;
   const latest=t.logs[0],untouched=suffix==='P08'?latest?.title==='进入财务事项核实':latest?.title==='部门审批同意'&&latest.body==='财务事项核实；已核实相关事项，继续按节点要求办理。';if(!untouched)continue;
   s.externalApprovalSampleBackup.push(E.clone(t));const localEvents=t.logs.filter(log=>log.title==='部门审批同意').map(log=>({title:'审批人同意',actor:log.actor,note:log.body,at:log.at}));Object.assign(n,{provider:'dingtalk',templateId:'approval-payment',title:'付款审批'});
   E.enterFlowNode(s,t);const r=E.externalApprovalRecord(s,t);r.people=suffix==='P08'?['陆清','孙琳']:['孙琳'];t.approval.people=E.clone(r.people);r.events.push(...localEvents);t.title='钉钉付款审批，等待审批结果';t.state=E.ticketStatus(t);
  }
  s.externalApprovalExamplesVersion=4;return true;
 }
 return {EXTERNAL_APPROVAL_EXAMPLES:catalog,ensureExternalApprovalExamples};
}
if(typeof module!=='undefined'&&module.exports)module.exports=create;else root.createExternalApprovalExamples=create;
})(typeof window!=='undefined'?window:globalThis);
