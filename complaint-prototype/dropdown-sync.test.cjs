'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),Store=require('./shared-store.js'),Queue=require('./refresh-queue.js');
test('an old tab rewriting status labels cannot trigger a repeated write-back',()=>{
 const data=new Map();let writes=0;
 const storage={getItem:k=>data.get(k)??null,setItem(k,v){writes++;data.set(k,v);}};
 const current=Store.createStore(storage,E,C),second=Store.createStore(storage,E,C);
 const original=current.load(),before=E.clone(original);
 for(const t of original.tickets)if(['付款办理','采购办理'].includes(t.state))t.state='审批中';
 original._revision++;storage.setItem(Store.KEY,JSON.stringify(original));
 const raw=storage.getItem(Store.KEY),count=writes;
 for(let i=0;i<5;i++){
  const loaded=(i%2?current:second).load();
  assert.equal(loaded._revision,original._revision);
  assert.equal(loaded.tickets.find(t=>t.id==='KS20261007-D17').state,'采购办理');
  assert.equal(loaded.tickets.find(t=>t.id==='KS20261007-D02').state,'付款办理');
  assert.deepEqual(loaded.tickets,before.tickets);
 }
 assert.equal(writes,count);assert.equal(storage.getItem(Store.KEY),raw);
 const next=current.load(),t=next.tickets.find(t=>t.id==='KS20261007-D17');
 E.finishProcurement(next,t,E.taskPeople(next,t)[0],{method:'总部发货',items:[{lineIndex:0,quantity:1}]});
 current.save(next);assert.equal(writes,count+1);assert.deepEqual(second.load().tickets.find(x=>x.id===t.id),t);
});
test('background updates keep an active selection intact and flush the latest state once',()=>{
 let busy=true,version=0;const tasks=[],rendered=[];
 const q=Queue.create({blocked:()=>busy,refresh:()=>rendered.push(version),schedule:fn=>tasks.push(fn)});
 q.request();version=1;q.request();version=2;q.request();assert.equal(tasks.length,1);
 tasks.shift()();assert.deepEqual(rendered,[]);
 busy=false;q.flush();q.flush();assert.equal(tasks.length,1);tasks.shift()();
 assert.deepEqual(rendered,[2]);q.flush();assert.equal(tasks.length,0);
});
test('opening a form before a scheduled refresh also defers that refresh',()=>{
 let busy=false,renders=0;const tasks=[];
 const q=Queue.create({blocked:()=>busy,refresh:()=>renders++,schedule:fn=>tasks.push(fn)});
 q.request();busy=true;tasks.shift()();assert.equal(renders,0);
 busy=false;q.flush();tasks.shift()();assert.equal(renders,1);
});
