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
test('ticket ledger includes in-period work and carryover but excludes older closed tickets',()=>{
 const flows=B.ticketFlows(s),ids=new Set(flows.map(f=>f.ticket.id));
 assert.equal(ids.size,flows.length);assert(s.open.filter(t=>t.created<s.start).every(t=>ids.has(t.id)));
 assert(s.cohort.every(t=>ids.has(t.id)));assert(s.closed.every(t=>ids.has(t.id)));
 assert(flows.every(f=>f.created<=s.end&&(f.ticket.closed==null||f.ticket.closed>=s.start)));
 assert(s.all.some(t=>t.closed<s.start&&!ids.has(t.id)));
});
test('lineage clips unfinished nodes, suspensions and future outcomes at historical cutoff',()=>{
 const t=B.tickets.find(t=>t.nodes.some(n=>n.pause>0));const n=t.nodes.find(n=>n.pause>0),cutoff=n.pauseStart+n.pause/2;
 const f=B.ticketFlow(t,cutoff),active=f.nodes.at(-1);
 assert.equal(f.closed,null);assert.equal(active.ended,null);assert.equal(active.status,'已挂起');assert.equal(active.returned,false);
 assert(Math.abs(active.pause-n.pause/2)<1);assert(f.nodes.every(n=>n.started<=cutoff&&(n.ended==null||n.ended<=cutoff)));
 assert.equal(f.nodes.length,t.nodes.filter(n=>n.started<=cutoff).length);
 assert(Math.abs(f.nodes.reduce((sum,n)=>sum+n.elapsed,0)-f.elapsed)<1);
 assert.equal(B.ticketFlow(t,t.created-1),null);
 const dispatch=B.ticketFlow(t,t.created+Math.min((t.assigned-t.created)/2,1));assert.equal(dispatch.assigned,null);
 assert.equal(B.flowRecords(dispatch).some(r=>r.label==='工单结案'),false);
});
test('returned/reentered stages remain distinct and all node durations reconcile',()=>{
 const t=B.tickets.find(t=>t.closed<=s.end&&t.nodes.filter(n=>n.stage==='方案审批').length>1),f=B.ticketFlow(t,s.end),records=B.flowRecords(f);
 const approvals=f.nodes.filter(n=>n.stage==='方案审批');assert.deepEqual(approvals.map(n=>n.occurrence),[1,2]);assert(approvals[0].returned);
 assert.equal(records.length,f.nodes.length+2);assert.equal(new Set(records.map(n=>n.id)).size,records.length);
 assert.equal(records[0].label,'工单创建');assert.equal(records.at(-1).label,'工单结案');
 for(const n of f.nodes){assert.equal(n.effective+n.pause,n.elapsed);assert(n.ended<=s.end);}
 assert(Math.abs(f.nodes.reduce((sum,n)=>sum+n.elapsed,0)-f.elapsed)<1);
 assert.equal(f.assigned,t.assigned);assert.equal(f.closed,t.closed);
});

test('management compliance includes late unfinished work and excludes immature completions',()=>{
 const node=(id,started,ended,limit=10,extra={})=>({id,started,ended,limit,pause:0,pauseStart:0,stage:'售后办理',...extra});
 const nodes=[node('on-time',0,5),node('late-done',0,12),node('late-open',0,30),node('early-future-due',14,15),node('not-due',15,30),node('old-backlog',-30,40),node('old-completion-due-now',-1,2)];
 const r=B.compliance(nodes,8,20);
 assert.deepEqual(r.due.map(n=>n.id),['on-time','late-done','late-open','old-completion-due-now']);
 assert.deepEqual(r.onTime.map(n=>n.id),['on-time','old-completion-due-now']);
 assert.deepEqual(r.late.map(n=>n.id),['late-done','late-open']);
 assert.equal(r.timely,50);assert.equal(r.lateRate,50);assert.equal(r.target,95);assert.equal(r.gap,-45);assert.equal(r.met,false);
 assert.deepEqual(r.overdue.map(n=>n.id),['late-open','old-backlog']);assert.deepEqual(r.longest.map(n=>n.id),['old-backlog']);assert.equal(r.longestOverdue,40/B.H);
 assert.equal(r.mean,6.5/B.H); // Completed in-period: 12 h-like units and 1, not the due cohort.
 const empty=B.compliance(nodes,50,60);assert.equal(empty.timely,null);assert.equal(empty.lateRate,null);assert.equal(empty.met,null);assert.equal(empty.longestOverdue,null);
});
test('effective deadlines use only observed suspension and preserve the original breach period',()=>{
 const n={id:'paused',started:0,ended:100,limit:10,pauseStart:2,pause:30};
 assert.equal(B.nodeDeadline(n,1),10);assert.equal(B.nodeDeadline(n,5),13);assert.equal(B.nodeDeadline(n,20),28);assert.equal(B.nodeDeadline(n,50),40);
 assert.equal(B.compliance([n],0,20).due.length,0);assert.equal(B.compliance([n],0,50).late.length,1);
 const futurePause={...n,pause:500};assert.equal(B.nodeDeadline(n,20),B.nodeDeadline(futurePause,20));
 const afterBreach={...n,pauseStart:15};assert.equal(B.nodeDeadline(afterBreach,50),10);assert.equal(B.compliance([afterBreach],20,50).due.length,0);assert.equal(B.compliance([afterBreach],20,50).overdue.length,1);
 const atBoundary={...n,pause:0,ended:10};assert.equal(B.compliance([atBoundary],0,10).onTime.length,1);
 const stillAllowed={...atBoundary,ended:30};assert.equal(B.compliance([stillAllowed],0,10).due.length,0);assert.equal(B.compliance([stillAllowed],0,11).late.length,1);
 const completedDuringPause={...n,ended:5};assert.equal(B.nodeDeadline(completedDuringPause,50),13);
});
test('employee due cohorts reconcile across departments and people, with per-task time limits',()=>{
 const national=B.compliance(s.nodes.filter(n=>n.stage!=='等待派单'),s.start,s.end);
 for(const dim of ['person','department']){
  const rows=B.efficiency(s,dim);
  for(const key of ['due','onTime','late','overdue'])assert.equal(rows.reduce((sum,r)=>sum+r[key].length,0),national[key].length);
  for(const r of rows){assert.equal(r.onTime.length+r.late.length,r.due.length);if(r.due.length)assert(Math.abs(r.timely+r.lateRate-100)<1e-10);assert.equal(new Set([...r.onTime,...r.late].map(n=>n.id)).size,r.due.length);}
 }
 const aftercare=B.efficiency(s,'department').find(r=>r.key==='售后服务部');assert.deepEqual(new Set(aftercare.rules.map(x=>x.limit/B.H)),new Set([8,12]));
 assert(aftercare.onTime.every(n=>B.net(n)<=n.limit));assert(aftercare.late.every(n=>B.net(n,s.end)>n.limit));
 assert(national.overdue.some(n=>B.nodeDeadline(n,s.end)<s.start));assert(national.late.some(n=>n.ended>s.end));
 const store=B.efficiency(s,'stage').find(r=>r.key==='门店办理');assert(store.rules.every(x=>x.limit===8*B.H));
 const historical=B.summarize({start:'2026-09-01',end:'2026-09-30'}),past=B.compliance(historical.nodes,historical.start,historical.end);
 assert(past.onTime.every(n=>n.ended<=historical.end));assert(past.due.every(n=>B.nodeDeadline(n,historical.end)>=historical.start&&B.nodeDeadline(n,historical.end)<=historical.end));
});
