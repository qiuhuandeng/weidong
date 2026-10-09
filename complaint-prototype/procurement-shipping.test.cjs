'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),E=require('./workflow/engine'),C=require('./configuration'),Store=require('./shared-store'),P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
function fixture(){const values=new Map(),store=Store.createStore({getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},E,C);return {store,s:store.load()};}
const ticket=(s,suffix)=>s.tickets.find(t=>t.id==='KS20261007-'+suffix);
const remaining=t=>E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining}));
test('five grade examples place procurement handling after purchase approval, following payment when funded',()=>{
 const {s}=fixture();assert.equal(P.handlingTypes.procurement,'采购办理');
 for(const scene of s.configuration.ruleScenes)for(const type of ['exchange','refund_exchange','compensation_exchange']){
  const proposal=C.Rules.Flow.proposalValues({type,refund:type==='refund_exchange'?100:0,compensation:type==='compensation_exchange'?100:0});
  for(const source of ['crm','wechat']){const route=P.entryPath(scene,{source,storeResult:'unresolved',proposal}),index=route.findIndex(n=>n.kind==='procurement');assert(index>0);assert.equal(route[index-1].provider,'dingtalk');assert.equal(route[index-1].templateId,'approval-purchase');assert.equal(route.filter(n=>n.kind==='procurement').length,1);if(type!=='exchange')assert(route.findIndex(n=>n.kind==='payment')<index-1);}
 }
});
test('partial shipment preserves current node clock and funds; final shipment completes the node once',()=>{
 const {s,store}=fixture(),t=ticket(s,'D08'),snapshot=E.clone({proposal:t.proposal,payments:t.payments,orders:s.orders}),node=E.clone(E.currentFlowNode(t)),timing=E.clone(t.nodeTiming),deadline=t.taskDeadline;
 E.finishProcurement(s,t,'procurement',{method:'总部发货',items:[{lineIndex:0,quantity:1}],trackingNumber:' SF10001 ',note:'先发修护霜一件'});
 assert.equal(E.currentFlowNode(t).id,node.id);assert.equal(!!E.currentFlowNode(t).done,false);assert.equal(t.state,'采购办理');assert.equal(t.currentAssignee,'procurement');assert.equal(t.taskDeadline,deadline);assert.deepEqual(t.nodeTiming,timing);assert.deepEqual(E.procurementItems(t).map(x=>x.remaining),[1,1]);assert.equal(t.handlingRecords.at(-1).trackingNumber,'SF10001');
 store.save(s);const loaded=store.load(),current=ticket(loaded,'D08');assert.deepEqual(current,t);E.finishProcurement(loaded,current,'procurement',{method:'门店发货',items:remaining(current),note:'余下商品由门店发出'});
 assert.equal(current.state,'待结案');assert.equal(current.currentAssignee,current.owner);assert.equal(current.handlingRecords.filter(r=>r.action==='shipment').length,2);assert.equal(current.logs.filter(l=>l.title==='完成采购办理').length,1);assert.deepEqual({proposal:current.proposal,payments:current.payments,orders:loaded.orders},snapshot);
 assert.throws(()=>E.finishProcurement(loaded,current,'procurement',{method:'总部发货',items:[{lineIndex:0,quantity:1}]}),/当前节点/);
});
test('invalid goods, quantities, methods and unauthorized or pre-approval shipment leave data intact',()=>{
 const {s}=fixture(),t=ticket(s,'D08'),base={method:'总部发货',items:remaining(t)};
 for(const data of [{...base,method:'未定义'},{...base,items:[]},{...base,items:[{lineIndex:99,quantity:1}]},{...base,items:[{lineIndex:0,quantity:1},{lineIndex:0,quantity:1}]},...[-1,0,.5,3,NaN].map(quantity=>({...base,items:[{lineIndex:0,quantity}]}))]){const before=E.clone(t);assert.throws(()=>E.finishProcurement(s,t,'procurement',data));assert.deepEqual(t,before);}
 assert.throws(()=>E.finishProcurement(s,t,t.owner,base),/当前节点/);assert.throws(()=>E.finishProcurement(s,ticket(s,'D03'),'procurement',base),/当前节点/);
});
test('shipping records freeze approved item names and prices, and previous revisions do not consume new quantities',()=>{
 const {s}=fixture(),t=ticket(s,'D08');t.handlingRecords.push({action:'shipment',nodeId:E.currentFlowNode(t).id,version:t.proposal.version,proposalRevision:0,items:[{lineIndex:0,quantity:1}]});
 // A genuine older proposal version is retained as history, without reducing this proposal's goods.
 t.handlingRecords.at(-1).version=0;assert.equal(E.procurementItems(t)[0].remaining,2);
 E.finishProcurement(s,t,'procurement',{method:'其他',items:[{lineIndex:0,quantity:1,name:'替换为未审批商品',unitPrice:1}],note:'供应商直发'});const record=t.handlingRecords.at(-1);assert.equal(record.items[0].name,t.proposal.exchangeItems[0].name);assert.equal(record.items[0].unitPrice,t.proposal.exchangeItems[0].unitPrice);assert.equal(record.items[0].quantity,1);
});
test('shipping examples cover all methods and load incrementally without changing existing work',()=>{
 const {s,store}=fixture();assert.equal(ticket(s,'D14').state,'采购办理');assert.equal(ticket(s,'D15').state,'待结案');assert.equal(ticket(s,'D16').state,'已结案');
 assert.deepEqual(['D14','D15','D16'].map(id=>ticket(s,id).handlingRecords.at(-1).method),['总部发货','门店发货','其他']);
 s.externalApprovalExamplesVersion=2;s.tickets=s.tickets.filter(t=>!/-D1[456]$/.test(t.id));s.orders=s.orders.filter(o=>!/-D1[456]$/.test(o.id));s.approvalRecords=s.approvalRecords.filter(r=>!/-D1[456]$/.test(r.ticketId));const existing=E.clone(s.tickets),orders=E.clone(s.orders),rules=E.clone(s.configuration);store.save(s);const next=store.load();assert.deepEqual(next.tickets.filter(t=>existing.some(x=>x.id===t.id)),existing);assert.deepEqual(next.orders.filter(o=>orders.some(x=>x.id===o.id)),orders);assert.deepEqual(next.configuration,rules);assert.deepEqual(store.load(),next);
});
test('new procurement entries remain ready to fill when older shipping examples have already been completed',()=>{
 const {s,store}=fixture(),old=ticket(s,'D08');E.finishProcurement(s,old,'procurement',{method:'门店发货',items:remaining(old),note:'已验收原工单'});
 s.externalApprovalExamplesVersion=3;s.tickets=s.tickets.filter(t=>!/-D1[78]$/.test(t.id));s.orders=s.orders.filter(o=>!/-D1[78]$/.test(o.id));s.approvalRecords=s.approvalRecords.filter(r=>!/-D1[78]$/.test(r.ticketId));
 const before=E.clone(s);store.save(s);const next=store.load();assert.equal(next.externalApprovalExamplesVersion,7);
 for(const suffix of ['D17','D18']){const t=ticket(next,suffix);assert.equal(E.currentFlowNode(t).kind,'procurement');assert.equal(t.currentAssignee,'procurement');assert.equal(remaining(t).length,2);assert.equal(E.taskPeople(next,t)[0],'procurement');assert.equal(next.approvalRecords.filter(r=>r.ticketId===t.id&&r.templateId==='approval-purchase').at(-1).status,'approved');}
 assert.deepEqual(remaining(ticket(next,'D17')).map(x=>x.quantity),[2,1]);assert.deepEqual(remaining(ticket(next,'D18')).map(x=>x.quantity),[1,1]);
 assert.deepEqual(next.tickets.filter(t=>before.tickets.some(x=>x.id===t.id)),before.tickets);assert.deepEqual(next.orders.filter(o=>before.orders.some(x=>x.id===o.id)),before.orders);assert.deepEqual(next.configuration,before.configuration);assert.deepEqual(next.crmProfiles,before.crmProfiles);assert.deepEqual(store.load(),next);
});
