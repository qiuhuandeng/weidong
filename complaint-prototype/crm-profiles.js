/* Read-only CRM snapshots for the local prototype. No CRM requests or ticket mutations. */
(function(root){
'use strict';
const copy=v=>JSON.parse(JSON.stringify(v)),DAY=86400000;
const identity=x=>x.crmCustomerId?'id:'+x.crmCustomerId:x.member?'member:'+x.member:'';
const profileKey=(s,t)=>identity(t)||identity((s.orders||[]).find(o=>o.id===t.order)||{})||(t.id?'ticket:'+t.id:'');
const findProfile=(s,key)=>(s.crmProfiles||[]).find(p=>p.key===key||key.startsWith('id:')&&p.id===key.slice(3));
function imagesFor(customer,o){return ['left','right'].map((side,i)=>({id:customer.id+'-image-'+side,orderId:o.id,project:o.project,at:o.at+DAY,stage:'术后',label:i?'右侧面部':'左侧面部',src:'../assets/crm/aftercare-'+side+'.png',by:customer.staff||'刘欣',store:o.store}));}
function visitsFor(customer,o,history){return [
 {id:customer.id+'-visit-1',orderId:o.id,at:o.at+3*DAY,staff:customer.staff||'刘欣',method:'电话',result:'已接通',content:'已电话回访客户，恢复情况良好，对本次护理服务满意，已确认后续护理安排。',nextAt:o.at+5*DAY},
 {id:customer.id+'-visit-2',orderId:o.id,at:o.at+2*DAY,staff:customer.staff||'刘欣',method:'电话',result:'已接通',content:'已向客户确认护理后的日常注意事项，客户表示已了解，目前体验良好。'},
 {id:customer.id+'-visit-3',orderId:history.id,at:history.at+DAY,staff:customer.staff||'刘欣',method:'企业微信',result:'已回复',content:'客户已完成本次护理，对到店服务表示认可，相关沟通已归档。'}
 ];}
function seedProfiles(s){
 if(s.crmProfilesVersion>=1)return false;
 const now=Date.now(),groups=new Map();
 for(const order of s.orders||[]){const key=identity(order);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(order);}
 s.crmProfiles??=[];
 for(const [key,source] of groups){
  if(findProfile(s,key))continue;
  const first=source[0],customer={id:first.crmCustomerId||'CRM-'+first.member,key,name:first.name,phone:first.phone,member:first.member,store:first.store,staff:first.staff||'刘欣',updatedAt:now-15*60000,status:'ready'};
  const linked=source.map((o,index)=>{const at=(s.tickets||[]).find(t=>t.order===o.id)?.created||now;return {id:o.id,number:o.external,at:at-7*DAY-index*DAY,store:o.store,project:o.project,paid:o.paid,refunded:o.refunded||0,status:'已支付',items:(o.items?.length?o.items:[{id:o.id+'-item',name:o.project,quantity:5,paid:o.paid}]).map((x,i)=>({id:x.id,name:x.name,quantity:x.quantity,used:Math.min(x.quantity,i?0:1),remaining:Math.max(0,x.quantity-(i?0:1)),paid:x.paid}))};});
  const code=String(first.member||first.crmCustomerId),last=Math.min(...linked.map(o=>o.at)),history=[{id:customer.id+'-history-1',number:'CRM202607'+code.slice(1),at:last-35*DAY,store:first.store,project:'舒缓修护护理',paid:128000,refunded:0,status:'已完成',items:[{id:'care',name:'舒缓修护护理',quantity:3,used:3,remaining:0,paid:128000}]},{id:customer.id+'-history-2',number:'CRM202605'+code.slice(1),at:last-85*DAY,store:first.store,project:'肌肤检测与基础护理',paid:68000,refunded:0,status:'已完成',items:[{id:'basic',name:'基础护理',quantity:2,used:2,remaining:0,paid:68000}]}];
  customer.orders=[...linked,...history];customer.payments=customer.orders.flatMap((o,i)=>paymentsFor(customer,o,i));
  customer.images=imagesFor(customer,linked[0]);customer.visits=visitsFor(customer,linked[0],history[0]);s.crmProfiles.push(customer);
 }
 s.crmProfilesVersion=1;return true;
}
function paymentsFor(customer,o,index=0){return [
 {id:o.id+'-pay',orderId:o.id,at:o.at+60000,type:'收款',action:'结算收款',amount:o.paid,method:index%2?'支付宝':'微信支付',status:'支付成功',voided:false,reference:'CRM-PAY-'+o.number,store:o.store,operator:customer.staff||'刘欣'},
 ...(o.refunded?[{id:o.id+'-refund',orderId:o.id,at:o.at+2*DAY,type:'退款',action:'原路退款',amount:o.refunded,method:'原路退回',status:'退款成功',voided:false,reference:'CRM-REFUND-'+o.number,store:o.store,operator:customer.staff||'刘欣'}]:[])
 ];}
function fillFields(s,customer){
 for(const o of customer.orders){
  const source=(s.orders||[]).find(row=>row.id===o.id);
  o.intention||=(/身体|养生/.test(o.project)?'养生':'皮肤管理');o.receptionSales||=source?.staff||customer.staff||'刘欣';
  if(!o.serviceTeam?.length)o.serviceTeam=[...new Set([o.receptionSales,'护理老师 · 许晴'])];
  o.deposit??=/定金/.test(o.project)?o.paid:0;o.outstanding??=0;
  if(!o.items?.length)o.items=[{id:o.id+'-item',name:o.project,quantity:1,paid:o.paid}];
  for(const x of o.items){x.businessType||='消费';x.openedBy||=o.receptionSales;x.amount??=x.paid;x.salePrice??=x.amount;x.originalPrice??=Math.round(x.salePrice*1.2/100)*100;}
 }
 for(const r of customer.payments){r.action??=r.type==='退款'?(r.method==='余额'?'退款至余额':'原路退款'):'结算收款';r.voided??=false;}
}
function buildProfile(s,t,key=profileKey(s,t)){
 const sources=(s.orders||[]).filter(o=>identity(o)===key),code=String(t.member||t.crmCustomerId||t.id||'10001').replace(/[^a-z0-9]/gi,''),member=t.member||'M'+code;
 const order={id:'CRM-ORDER-'+code,external:'CRM'+code,name:t.name||'林女士',phone:t.phone||'13800001002',member,crmCustomerId:t.crmCustomerId,store:t.store||'上海徐汇店',staff:t.staff||'刘欣',project:t.project||'面部护理套餐',paid:t.amount>0?t.amount:398000,refunded:0};
 const sample={orders:sources.length?sources:[order],tickets:[{...t,order:sources.length?t.order:order.id}]};seedProfiles(sample);
 const customer=sample.crmProfiles[0];customer.key=key;fillFields(s,customer);return customer;
}
function ensure(s){
 if(s.crmProfilesVersion>=3)return false;
 seedProfiles(s);
 // Complete all saved tickets, including customers without a complaint order.
 // These separate CRM examples never bind an order to a ticket or change its funds.
 for(const t of s.tickets||[]){const key=profileKey(s,t);if(key&&!findProfile(s,key))s.crmProfiles.push(buildProfile(s,t,key));}
 for(const customer of s.crmProfiles||[]){
  customer.status='ready';
  if(!customer.orders?.length)customer.orders=buildProfile(s,customer,customer.key).orders;
  const voided=new Set((customer.payments||[]).filter(r=>r.voided||/失败|异常|作废/.test(r.status||'')).map(r=>r.id));
  customer.payments=(customer.payments||[]).filter(r=>!voided.has(r.id)&&!voided.has(r.relatedPaymentId));
  customer.orders.forEach((o,i)=>{if(!customer.payments.some(r=>r.orderId===o.id))customer.payments.push(...paymentsFor(customer,o,i));});
  const first=customer.orders[0],history=customer.orders.find(o=>o.id===customer.id+'-history-1')||first;
  if(!customer.images?.length)customer.images=imagesFor(customer,first);
  const normalVisits=visitsFor(customer,first,history);
  if(!customer.visits?.length)customer.visits=normalVisits;
  else customer.visits=customer.visits.map(row=>{
   const example=normalVisits.find(r=>r.id===row.id);
   if(row.result==='未接通'||example&&/局部泛红|转交门店负责人/.test(row.content))return {...row,result:example?.result||'已接通',content:example?.content||normalVisits[0].content};
   return row;
  });
  fillFields(s,customer);
 }
 s.crmProfilesVersion=3;return true;
}
function read(s,t){
 const key=profileKey(s,t);let profile=key?findProfile(s,key):null;
 // Newly created tickets can immediately display complete examples without
 // causing a persistence revision or matching an unrelated customer by phone.
 if(!profile&&key&&(s.tickets||[]).some(row=>row.id===t.id&&profileKey(s,row)===key))profile=buildProfile(s,t,key);
 if(!profile)return {status:'unlinked',customer:null,orders:[],payments:[],images:[],visits:[]};
 const result=copy(profile);result.status='ready';
 result.orders.sort((a,b)=>Number(b.id===t.order)-Number(a.id===t.order)||b.at-a.at);
 for(const type of ['payments','images','visits'])result[type].sort((a,b)=>b.at-a.at);
 return result;
}
function records(profile,type,orderId=''){if(!['orders','payments','images','visits'].includes(type))return [];return profile[type].filter(row=>!orderId||(type==='orders'?row.id:row.orderId)===orderId);}
const API={identity,ensure,read,records};if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.CRMProfiles=API;
})(typeof window!=='undefined'?window:globalThis);
