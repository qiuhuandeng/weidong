/* Deterministic, isolated business examples. Never merged into payment records. */
window.RefundRiskSeed = (asOf) => {
  const M=RefundRiskModel,stores=[],people=[],orders=[],applications=[],tasks=[];
  const areas=[['华东大区','沪苏区域',['上海徐汇店','苏州园区店']],['华东大区','浙皖区域',['杭州西湖店','合肥政务店']],['华南大区','广佛区域',['广州天河店','佛山南海店']],['华南大区','深莞区域',['深圳南山店','东莞南城店']],['华北大区','京津区域',['北京朝阳店','天津和平店']],['华北大区','山东区域',['济南历下店','青岛市南店']],['华西大区','川渝区域',['成都锦江店','重庆渝北店']],['华西大区','云贵区域',['昆明盘龙店','贵阳观山湖店']]];
  const names=['林悦','陈敏','赵宁','周晴','沈佳','许岚','李晨','王琳','何静','刘洋','孙颖','徐宁','张怡','郭欣','梁欣','宋佳'];
  const projects=['面部护理疗程','身体护理套餐','头皮养护疗程','储值充值'];
  areas.forEach(([district,area,ns])=>ns.forEach(name=>{const i=stores.length,id='sample-s'+i;stores.push({id,name,district,area,category:i%3?'成熟综合店':'新开综合店'});people.push({id:'sample-sales'+i,name:names[i],role:'seller',storeId:id},{id:'sample-service'+i,name:names[(i+5)%16]+' · 技师',role:'service',storeId:id});}));
  people.push({id:'sample-customer-service',name:'售后客服组',role:'applicant',storeId:null},{id:'sample-audit',name:'财务审核组',role:'auditor',storeId:null});
  let sequence=0;
  function request(o,at,kind='normal',amount=o.paidCents){
    if(at>asOf)return;
    const id='S-RF'+String(++sequence).padStart(5,'0'),manual=kind==='manual',pending=kind==='intent';
    const a={id,orderId:o.id,amountCents:amount,submittedAt:at+' 10:20:00',applicantId:manual?'sample-customer-service':o.sellerId,applicantName:manual?'售后客服组':people.find(p=>p.id===o.sellerId).name,operatorStoreId:o.storeId,reason:kind==='intent'?'客户申请退卡':kind==='rights'?'疗程调整':'客户行程变更',manualCents:manual?amount:0,originalSelectedCents:manual?0:amount,eligibleOriginalCents:amount,auditorId:'sample-audit',approvedAt:at+' 14:10:00',commissionOverdueCents:kind==='rights'?Math.round(amount*.08):0,refundedRightsUsable:kind==='rights',verification:manual?{result:'confirmed',by:'售后客服组',at:at+' 11:20:00',channel:'电话回访',note:'已电话确认客户申请退款及收款信息。'}:kind==='intent'?{result:'denied',by:'总部客服',at:at+' 11:20:00',note:'回访客户表示未要求退款，需进一步核实。'}:null,phoneChangedAt:kind==='intent'?M.addDays(at,-1):'',source:'sample'};
    applications.push(a);
    tasks.push({id:id+'-1',applicationId:id,amountCents:amount,method:manual?'transfer':'original',status:pending?'pending':'success',completedAt:pending?'':at+' 15:30:00',channel:'微信支付',recipient:manual?'客户确认的收款人':'原付款来源',recipientAccount:manual?'**** 4826':'原交易账户',history:[]});
    return a;
  }
  stores.forEach((s,i)=>{
    for(let mo=-3;mo<=0;mo++)for(let j=0;j<24;j++){
      const m=M.month(asOf,mo),d=String(1+(j*7+i*3)%28).padStart(2,'0'),at=m+'-'+d;
      if(at>asOf)continue;
      const id=`S-OD-${i}-${mo+3}-${j}`,o={id,customerId:'S-C'+i+'-'+j,customerName:names[(i+j)%16].slice(0,1)+'女士',storeId:s.id,paidAt:at,paidCents:[98000,168000,298000,500000][(j+i)%4],project:projects[(i+j)%4],sellerId:'sample-sales'+i,serviceId:'sample-service'+i,payerKey:'sample-payer:'+i+':'+j,consumed:j%3,remaining:10-j%3,commissionCents:0};
      orders.push(o);
      if(j%(i===0?4:i===4?5:9)===0)request(o,M.addDays(at,3+j%12),(i===2||i===4)&&j===0?'manual':i===6&&j===0?'rights':'normal',j%2?o.paidCents:Math.round(o.paidCents*.6));
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
