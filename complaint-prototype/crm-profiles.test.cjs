'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('./workflow/engine'),C=require('./configuration'),Store=require('./shared-store'),CRM=require('./crm-profiles');
function fixture(){const data=new Map(),store=Store.createStore({getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)},E,C);return {store,s:store.load()};}
test('CRM migration adds separate customer snapshots while preserving tickets, money and configuration',()=>{
 const {s,store}=fixture();delete s.crmProfilesVersion;delete s.crmProfiles;const before=E.clone(s);assert(CRM.ensure(s));assert.equal(s.crmProfilesVersion,1);const {crmProfiles,crmProfilesVersion,...rest}=s;assert.deepEqual(rest,before);assert(crmProfiles.length);assert.equal(CRM.ensure(s),false);store.save(s);assert.deepEqual(store.load(),s);
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
test('unlinked, no clinical records and load failure states are available without mutating records',()=>{
 const {s}=fixture();assert.equal(CRM.read(s,s.tickets.find(t=>t.id.endsWith('-G01'))).status,'unlinked');const empty=CRM.read(s,s.tickets.find(t=>t.order==='O3'));assert.equal(empty.status,'ready');assert.equal(empty.images.length,0);assert.equal(empty.visits.length,0);
 const t=s.tickets.find(t=>t.order==='O4'),before=E.clone(s),failed=CRM.read(s,t);assert.equal(failed.status,'error');assert.equal(CRM.read(s,t,{retry:true}).status,'ready');assert.deepEqual(s,before);
});
