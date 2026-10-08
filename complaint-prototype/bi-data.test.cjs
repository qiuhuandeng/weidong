'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),B=require('./bi-data.js');
const f={start:'2026-09-08',end:'2026-10-07'},s=B.summarize(f);
test('national totals reconcile to four districts, 12 regions and 48 stores',()=>{
 for(const [dim,n] of [['district',4],['region',12],['store',48]]){const rows=B.groups(f,dim);assert.equal(rows.length,n);for(const key of ['cohort','open','overdue','closed','due'])assert.equal(rows.reduce((v,r)=>v+r[key].length,0),s[key].length);assert.equal(rows.reduce((v,r)=>v+r.volume,0),s.volume);assert.equal(rows.reduce((v,r)=>v+r.refund+r.compensation,0),s.refund+s.compensation);}
});
test('historical snapshot includes carryover and never counts future completion or payments',()=>{
 const old=B.summarize({...f,start:'2026-09-01',end:'2026-09-30'});assert(old.open.some(t=>t.created<old.start));assert(old.open.every(t=>t.created<=old.end&&t.closed>old.end));assert(old.completed.every(n=>n.ended>=old.start&&n.ended<=old.end));assert(old.paid.every(t=>t.paidAt>=old.start&&t.paidAt<=old.end));assert.equal(old.pending.length,old.open.length);assert.equal(new Set(old.pending.map(n=>n.ticketId)).size,old.open.length);
});
test('due cohort includes unresolved overdue tickets and first-contact denominator excludes immature samples',()=>{
 assert(s.due.some(t=>t.closed>s.end));assert.equal(s.closure,B.pct(s.due.filter(t=>t.closed<=t.created+t.limit).length,s.due.length));assert(s.observed.every(t=>t.assigned>=s.start&&t.assigned<=s.end&&(t.contact<=s.end||t.assigned+t.firstLimit<=s.end)));
});
test('net time clips suspension at snapshot and preserves customer wall time',()=>{
 const n={started:0,ended:100,pauseStart:20,pause:50};assert.equal(B.net(n,10),10);assert.equal(B.net(n,40),20);assert.equal(B.net(n,85),35);assert.equal(B.net(n,150),50);assert.equal(B.quantile([1,9,2,4,7,3,6,8,5,10],.9),9);assert.equal(B.mean([]),null);assert.equal(B.pct(0,0),null);
});
test('incident filters narrow numerators without shrinking organizational service denominator',()=>{
 const scoped=B.summarize({...f,district:'华东大区',region:'沪苏区域',level:'5',source:'微动'});assert(scoped.cohort.length>0);assert(scoped.all.every(t=>t.level===5&&t.channel==='微动'&&B.byStore[t.store].region==='沪苏区域'));assert.equal(scoped.volume,B.summarize({...f,region:'沪苏区域'}).volume);assert.equal(scoped.rate,scoped.cohort.length/scoped.volume*1000);
});
test('person/department task totals reconcile and exclude automatic dispatch',()=>{
 const completed=s.completed.filter(n=>n.stage!=='等待派单'),pending=s.pending.filter(n=>n.stage!=='等待派单');for(const dim of ['person','department']){const rows=B.efficiency(s,dim);assert.equal(rows.reduce((v,r)=>v+r.done.length,0),completed.length);assert.equal(rows.reduce((v,r)=>v+r.pending.length,0),pending.length);assert(rows.every(r=>r.done.every(n=>n.stage!=='等待派单')));}
});
test('trend counts reconcile to cohort and comparison is adjacent equal-length period',()=>{
 assert.equal(B.trend(f).reduce((v,r)=>v+r.count,0),s.cohort.length);const prior=B.previous(f);assert.equal(prior.end,'2026-09-07');assert.equal(B.parse(prior.end)-B.parse(prior.start),B.parse(f.end)-B.parse(f.start));
});
