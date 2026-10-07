/* Read-only CRM snapshots for the local prototype. No CRM requests or ticket mutations. */
(function(root){
'use strict';
const copy=v=>JSON.parse(JSON.stringify(v)),DAY=86400000;
const identity=x=>x.crmCustomerId?'id:'+x.crmCustomerId:x.member?'member:'+x.member:'';
function ensure(s){
 if(s.crmProfilesVersion>=1)return false;
 const now=Date.now(),groups=new Map();
 for(const order of s.orders||[]){const key=identity(order);if(!key)continue;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(order);}
 s.crmProfiles??=[];
 for(const [key,source] of groups){
  if(s.crmProfiles.some(p=>p.key===key))continue;
  const first=source[0],customer={id:first.crmCustomerId||'CRM-'+first.member,key,name:first.name,phone:first.phone,member:first.member,store:first.store,staff:first.staff||'门店客服',updatedAt:now-15*60000,status:first.id==='O4'?'error':'ready'};
  const linked=source.map((o,index)=>{const at=(s.tickets||[]).find(t=>t.order===o.id)?.created||now;return {id:o.id,number:o.external,at:at-7*DAY-index*DAY,store:o.store,project:o.project,paid:o.paid,refunded:o.refunded||0,status:'已支付',items:(o.items?.length?o.items:[{id:o.id+'-item',name:o.project,quantity:5,paid:o.paid}]).map((x,i)=>({id:x.id,name:x.name,quantity:x.quantity,used:Math.min(x.quantity,i?0:1),remaining:Math.max(0,x.quantity-(i?0:1)),paid:x.paid}))};});
  const code=String(first.member||first.crmCustomerId),last=Math.min(...linked.map(o=>o.at)),history=[{id:customer.id+'-history-1',number:'CRM202607'+code.slice(1),at:last-35*DAY,store:first.store,project:'舒缓修护护理',paid:128000,refunded:0,status:'已完成',items:[{id:'care',name:'舒缓修护护理',quantity:3,used:3,remaining:0,paid:128000}]},{id:customer.id+'-history-2',number:'CRM202605'+code.slice(1),at:last-85*DAY,store:first.store,project:'肌肤检测与基础护理',paid:68000,refunded:0,status:'已完成',items:[{id:'basic',name:'基础护理',quantity:2,used:2,remaining:0,paid:68000}]}];
  customer.orders=[...linked,...history];
  customer.payments=customer.orders.flatMap((o,i)=>[{id:o.id+'-pay',orderId:o.id,at:o.at+60000,type:'收款',amount:o.paid,method:i%2?'支付宝':'微信支付',status:'支付成功',reference:'CRM-PAY-'+o.number,store:o.store,operator:first.staff||'门店收银'},...(o.refunded?[{id:o.id+'-refund',orderId:o.id,at:o.at+2*DAY,type:'退款',amount:o.refunded,method:'原路退回',status:'退款成功',reference:'CRM-REFUND-'+o.number,store:o.store,operator:first.staff||'门店收银'}]:[])]);
  customer.images=first.id==='O3'?[]:[{id:customer.id+'-image-left',orderId:linked[0].id,project:linked[0].project,at:linked[0].at+DAY,stage:'术后',label:'左侧面部',src:'../assets/crm/aftercare-left.png',by:first.staff||'门店客服',store:first.store},{id:customer.id+'-image-right',orderId:linked[0].id,project:linked[0].project,at:linked[0].at+DAY,stage:'术后',label:'右侧面部',src:'../assets/crm/aftercare-right.png',by:first.staff||'门店客服',store:first.store}];
  customer.visits=first.id==='O3'?[]:[{id:customer.id+'-visit-1',orderId:linked[0].id,at:linked[0].at+3*DAY,staff:first.staff||'门店客服',method:'电话',result:'已接通',content:'客户反馈术后局部泛红，已记录恢复情况和客户关注的问题，并转交门店负责人继续跟进。',nextAt:linked[0].at+5*DAY},{id:customer.id+'-visit-2',orderId:linked[0].id,at:linked[0].at+2*DAY,staff:first.staff||'门店客服',method:'电话',result:'未接通',content:'拨打客户预留电话未接通，已发送企微消息预约回访时间。'},{id:customer.id+'-visit-3',orderId:history[0].id,at:history[0].at+DAY,staff:first.staff||'门店客服',method:'企业微信',result:'已回复',content:'客户已完成本次护理，对到店服务表示认可，相关沟通已归档。'}];
  s.crmProfiles.push(customer);
 }
 s.crmProfilesVersion=1;return true;
}
function read(s,t,{retry=false}={}){
 const key=identity(t),order=(s.orders||[]).find(o=>o.id===t.order),orderKey=order&&identity(order);
 // Explicit identity never falls back to a different customer or to a shared phone number.
 const match=key||orderKey,profile=match?(s.crmProfiles||[]).find(p=>p.key===match||match.startsWith('id:')&&p.id===match.slice(3)):null;
 if(!profile)return {status:'unlinked',customer:null,orders:[],payments:[],images:[],visits:[]};
 const result=copy(profile);result.status=result.status==='error'&&!retry?'error':'ready';
 result.orders.sort((a,b)=>Number(b.id===t.order)-Number(a.id===t.order)||b.at-a.at);
 for(const type of ['payments','images','visits'])result[type].sort((a,b)=>b.at-a.at);
 return result;
}
function records(profile,type,orderId=''){if(!['orders','payments','images','visits'].includes(type))return [];return profile[type].filter(row=>!orderId||(type==='orders'?row.id:row.orderId)===orderId);}
const API={identity,ensure,read,records};if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.CRMProfiles=API;
})(typeof window!=='undefined'?window:globalThis);
