'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('./workflow/engine'),C=require('./configuration'),Store=require('./shared-store'),CRM=require('./crm-profiles');
function fixture(){const data=new Map(),store=Store.createStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},E,C);return {store,s:store.load()};}
test('CRM migration adds separate customer snapshots while preserving tickets, money and configuration',()=>{
 const {s,store}=fixture();delete s.crmProfilesVersion;delete s.crmProfiles;const before=E.clone(s);assert(CRM.ensure(s));assert.equal(s.crmProfilesVersion,3);const {crmProfiles,crmProfilesVersion,...rest}=s;assert.deepEqual(rest,before);assert(crmProfiles.length);assert.equal(CRM.ensure(s),false);store.save(s);assert.deepEqual(store.load(),s);
});
test('profile identity never joins customers by phone or falls back from an explicit CRM identity',()=>{
 const {s}=fixture(),t=s.tickets.find(t=>t.id.endsWith('-P41')),p=CRM.read(s,t);assert.equal(p.status,'ready');assert.equal(p.member,t.member);assert.equal(p.orders[0].id,t.order);assert(p.orders.length>1);
 assert.equal(CRM.read(s,{...t,crmCustomerId:p.id}).id,p.id);assert.equal(CRM.read(s,{...t,member:'NOT-FOUND'}).status,'unlinked');assert.equal(CRM.read(s,{...t,crmCustomerId:'NOT-FOUND'}).status,'unlinked');assert.equal(CRM.read(s,{phone:t.phone}).status,'unlinked');assert.equal(CRM.read(s,{order:t.order}).id,p.id);
});
test('four categories link through order ids and CRM payments remain independent of complaint payments',()=>{
 const {s}=fixture(),t=s.tickets.find(t=>t.id.endsWith('-P41')),before=E.clone(s),p=CRM.read(s,t);
 for(const type of ['orders','payments','images','visits']){assert(p[type].length>0,type);assert(CRM.records(p,type,t.order).every(r=>(type==='orders'?r.id:r.orderId)===t.order));assert.equal(CRM.records(p,type,'not-an-order').length,0);}
 assert(p.payments.every(p=>p.reference.startsWith('CRM-')));p.orders[0].paid=1;p.payments[0].amount=1;assert.deepEqual(s,before);
 const original=CRM.read(s,t).payments;t.payments.push({reference:'COMPLAINT-PAY',amount:900000});assert.deepEqual(CRM.read(s,t).payments,original);
});
test('every saved ticket has normal order, payment, image and visit examples',()=>{
 const {s}=fixture(),before=E.clone(s);
 for(const t of s.tickets){
  const p=CRM.read(s,t);assert.equal(p.status,'ready',t.id);for(const type of ['orders','payments','images','visits'])assert(p[type].length>0,t.id+' '+type);
  for(const o of p.orders){assert(o.items.length);assert(CRM.records(p,'payments',o.id).length);for(const key of ['intention','receptionSales','serviceTeam'])assert(o[key]?.length,t.id+' '+key);for(const x of o.items)for(const key of ['originalPrice','salePrice','amount'])assert(Number.isFinite(x[key]),t.id+' '+key);}
  assert(p.payments.every(r=>!r.voided&&!/失败|异常|作废/.test(r.status)));assert(p.visits.every(r=>['已接通','已回复'].includes(r.result)));
  for(const r of [...p.payments,...p.images,...p.visits])assert(p.orders.some(o=>o.id===r.orderId),r.id);
  for(const image of p.images)assert(require('node:fs').existsSync(require('node:path').resolve(__dirname,'workflow',image.src)));
 }
 assert.deepEqual(s,before);
});
test('old error, empty and voided examples become normal without changing complaint money or entered order values',()=>{
 const {s}=fixture(),p=s.crmProfiles[0],o=p.orders[0],item=o.items[0];
 s.crmProfilesVersion=2;p.status='error';p.images=[];p.visits=[];o.intention='养生';o.receptionSales='原接待';o.serviceTeam=['原团队'];o.deposit=0;o.outstanding=12000;item.originalPrice=0;item.salePrice=100;item.amount=80;item.openedBy='原开单';
 p.payments.push({id:'old-voided',orderId:o.id,amount:o.paid,voided:true,status:'结算作废'},{id:'old-return',orderId:o.id,amount:o.paid,type:'退款',relatedPaymentId:'old-voided',status:'退款成功'});
 const before=E.clone(s);assert(CRM.ensure(s));assert.equal(p.status,'ready');assert(p.images.length);assert(p.visits.length);assert.deepEqual(o,before.crmProfiles[0].orders[0]);assert.deepEqual(s.tickets,before.tickets);assert.deepEqual(s.orders,before.orders);assert.deepEqual(s.configuration,before.configuration);
 assert(!p.payments.some(r=>['old-voided','old-return'].includes(r.id)));assert.deepEqual(p.payments,before.crmProfiles[0].payments.slice(0,-2));
 const upgraded=E.clone(s);assert.equal(CRM.ensure(s),false);assert.deepEqual(s,upgraded);
});
test('new customers without complaint orders have independent normal CRM examples immediately',()=>{
 const {s,store}=fixture(),t=E.create(s,'chen',{name:'周女士',phone:'13800002008',store:'上海徐汇店',order:'',channel:'小程序',title:'护理安排咨询',description:'想了解护理安排'});
 const before=E.clone(s),p=CRM.read(s,t);assert.equal(p.status,'ready');assert.equal(p.name,t.name);assert(p.member);for(const type of ['orders','payments','images','visits'])assert(p[type].length);assert.equal(t.order,'');assert.deepEqual(s,before);
 store.save(s);const loaded=store.load();assert.equal(loaded._revision,s._revision);assert.equal(CRM.read(loaded,t).status,'ready');assert.deepEqual(loaded,s);
 const other={...t,id:'INDEPENDENT',name:'独立客户'};s.tickets.push(other);assert.notEqual(CRM.read(s,other).id,p.id);assert.notEqual(CRM.read(s,other).orders[0].id,p.orders[0].id);
});
