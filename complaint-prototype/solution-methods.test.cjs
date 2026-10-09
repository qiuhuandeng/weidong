'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const M=require('./solution-methods'),E=require('./workflow/engine'),C=require('./configuration'),Store=require('./shared-store'),T=require('./approval-templates');
const F=C.Rules.Flow,P=require('./ticket-flow-config')(F,C.STAFF,C.Assignment);
function fresh(){const map=new Map(),store=Store.createStore({getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)},E,C);return {store,s:store.load()};}
const condition=(methods,match='any')=>({id:'methods',title:'处理方式',judgeBy:'plan',methodFilter:{methods,match},match:'all',conditions:[],nodes:[]});
test('legacy combinations become separate reporting flags with an exclusive service option',()=>{
 for(const key of Object.keys(M.types)){const p=M.normalize({typeKey:key});assert.equal(M.keyOf(p),key);assert.equal(p.type,M.types[key]);assert.deepEqual(p.handlingMethods,M.combinations[key]);for(const method of ['refund','compensation','exchange'])assert.equal(p.handlingFlags[method],M.combinations[key].includes(method));}
 assert.equal(M.normalize({type:'无退赔'}).type,'无需退赔或置换');
 for(const handlingMethods of [[],['service','refund'],['unknown']])assert.throws(()=>M.normalize({handlingMethods}));
 assert.equal(M.normalize({handlingMethods:['exchange','refund','compensation']}).type,'退款+赔偿+商品置换');
});
test('any/all handling filters combine with amount limits and report overlap correctly',()=>{
 const any=condition(['refund','compensation']),all=condition(['refund','compensation'],'all'),exchange=condition(['exchange']);
 for(const b of [any,all,exchange])F.validCondition(b);
 for(const type of Object.keys(M.types)){const p={type,refund:10000,compensation:2000,total:12000};assert.equal(F.matchesProposal(any,p),M.includes(type,'refund')||M.includes(type,'compensation'));assert.equal(F.matchesProposal(all,p),M.includes(type,'refund')&&M.includes(type,'compensation'));assert.equal(F.matchesProposal(exchange,p),M.includes(type,'exchange'));}
 all.conditions=[{field:'total',op:'gte',value:120}];F.validCondition(all);assert(F.matchesProposal(all,{type:'combined_exchange',total:12000}));assert(!F.matchesProposal(all,{type:'combined_exchange',total:11999}));
 assert(F.conditionsOverlap(any,exchange));assert(!F.conditionsOverlap(condition(['service']),exchange));assert.throws(()=>F.validCondition(condition(['service','refund'],'all')),/同时满足/);
});
test('legacy compound conditions retain conjunctions instead of expanding to unrelated handling methods',()=>{
 const b={title:'组合条件',planTypes:['combined','exchange'],match:'all',conditions:[]};M.upgradeCondition(b);F.validCondition(b);
 assert.equal(F.matchesProposal(b,{type:'refund'}),false);assert.equal(F.matchesProposal(b,{type:'compensation'}),false);assert.equal(F.matchesProposal(b,{type:'combined'}),true);assert.equal(F.matchesProposal(b,{type:'refund_exchange'}),true);
 assert.deepEqual(M.filterFromLegacy(['refund','compensation','combined','refund_exchange','compensation_exchange']),{methods:['refund','compensation'],match:'any'});
});
test('all eight selections follow payment then procurement as needed, across every grade and source',()=>{
 const {s}=fresh();
 for(const scene of C.Rules.sceneList(s.configuration))for(const type of Object.keys(M.types))for(const source of ['crm','hotline']){
  const d=P.prepare(s.configuration,scene);P.prepareEntry(s.configuration,d);P.validate(d,s.configuration);
  const proposal=F.proposalValues({type,refund:M.includes(type,'refund')?100:0,compensation:M.includes(type,'compensation')?20:0}),route=P.entryPath(d,{source,storeResult:'unresolved',proposal}),kinds=route.map(n=>n.kind);
  assert.equal(kinds.filter(k=>k==='payment').length,M.includes(type,'refund')||M.includes(type,'compensation')?1:0,type);
  assert.equal(kinds.filter(k=>k==='procurement').length,M.includes(type,'exchange')?1:0,type);
  if(kinds.includes('payment')&&kinds.includes('procurement'))assert(kinds.indexOf('payment')<kinds.indexOf('procurement'));
 }
});
test('triple-method solution completes external approval, one combined payment, procurement and closure',()=>{
 const {s,store}=fresh();s.tickets=[];
 const t=E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'微动',title:'退款并补偿',description:'客户要求退还未消费项目费用'});
 E.follow(s,t,t.owner,{connected:true,content:'已确认退款、赔偿和商品置换'});
 const item=E.orderItems(s.orders.find(o=>o.id==='O2'))[0],before=E.clone(t);
 const p={detailsVersion:2,handlingMethods:['refund','compensation','exchange'],refund:10000,compensation:2000,refundOrderId:'O2',refundItems:[{itemId:item.id,amount:10000}],refundStore:'上海徐汇店',performanceId:'zhang',refundReason:'未消费部分退款',compensationReason:'交通费用赔偿',exchangeItems:[{productId:'repair-cream',quantity:1}],delivery:{name:'林女士',phone:'13800001002',address:'上海市徐汇区漕溪北路88号602室'},payout:{method:'alipay',name:'林女士',account:'13800001002'},content:'按已确认事项处理',attachments:[{name:'确认记录.txt',data:'data:text/plain,confirmed'}]};
 assert.throws(()=>E.confirmSolution(s,t,t.owner,{...p,delivery:{}}),/收货姓名/);assert.deepEqual(t,before);
 E.confirmSolution(s,t,t.owner,p);assert.deepEqual(t.proposal.handlingFlags,{refund:true,compensation:true,exchange:true});assert.equal(t.proposal.type,'退款+赔偿+商品置换');
 const visited=[];let i=0;
 while(t.phase!=='已结案'){
  assert(i++<12);const node=E.currentFlowNode(t);visited.push(node.kind||node.title);
  if(node.provider==='dingtalk'){const r=E.externalApprovalRecord(s,t);assert.equal(r.snapshot.fields.find(f=>f.id==='plan').value,p.handlingMethods.map(k=>M.labels[k]).join('+'));E.applyApprovalEvent(s,{id:'triple-event-'+i,instanceId:r.instanceId,scope:'instance',type:'finish',result:'agree',at:Math.max(Date.now(),r.at)+i,actor:'审批人'});}
  else if(node.kind==='payment')E.pay(s,t,E.taskPeople(s,t)[0],{result:'成功',amount:12000,reference:'TRIPLE-PAY',proof:[{name:'凭证'}]});
  else if(node.kind==='procurement')E.finishProcurement(s,t,E.taskPeople(s,t)[0],{method:'总部发货',items:[{lineIndex:0,quantity:1}],trackingNumber:'SF-TRIPLE',note:'按确认地址发货'});
  else E.closeTicket(s,t,t.owner,{note:'款项到账，商品签收',completed:true});
 }
 assert.equal(t.payments.length,1);assert(visited.indexOf('payment')<visited.indexOf('procurement'));
 store.save(s);const loaded=store.load().tickets.find(x=>x.id===t.id);assert.deepEqual(loaded.proposal,t.proposal);assert.equal(loaded.state,'已结案');
});
test('saved solutions gain reporting metadata without changing money, records or active steps',()=>{
 const {s}=fresh(),t=s.tickets.find(x=>x.id==='KS20261007-D20');assert(t.proposal.handlingFlags.refund&&t.proposal.handlingFlags.compensation&&t.proposal.handlingFlags.exchange);
 const before=E.clone(t);delete t.proposal.handlingMethods;delete t.proposal.handlingFlags;M.normalizeTickets(s);assert.deepEqual(t,before);
 const tpl=T.get(s,'approval-payment');assert.equal(T.preview(tpl,t).fields.find(f=>f.id==='total').value,600);
});
test('new conditions are empty; exchange price thresholds are separate from cash and survive reload',()=>{
 const empty=F.condition();assert.deepEqual(empty.planTypes,[]);assert.deepEqual(empty.conditions,[]);assert.throws(()=>F.validCondition(empty));
 const b=condition(['exchange']);b.conditions=[{field:'exchangeValue',op:'gte',value:480}];F.validCondition(b);
 for(const type of ['exchange','refund_exchange','compensation_exchange','combined_exchange']){
  const p={type,exchangeValue:480,refund:M.includes(type,'refund')?100:0,compensation:M.includes(type,'compensation')?20:0},values=F.proposalValues(p);
  assert.equal(values.exchangeValue,48000);assert.equal(values.total,values.refund+values.compensation);assert(F.matchesProposal(b,values));assert(!F.matchesProposal(b,{...values,exchangeValue:47999}));
 }
 assert(F.matchesProposal(b,{type:'exchange',exchangeItems:[{unitPrice:18000,quantity:2},{unitPrice:12000,quantity:1}]}));
 assert.throws(()=>F.validCondition({...condition(['refund']),conditions:[{field:'exchangeValue',op:'gt',value:0}]}),/不适用/);
 const low={...b,conditions:[{field:'exchangeValue',op:'lt',value:480}]};assert(!F.conditionsOverlap(b,low));assert(F.conditionsOverlap(b,{...low,conditions:[{field:'exchangeValue',op:'lte',value:480}]}));
 const {s,store}=fresh(),scene=C.Rules.sceneList(s.configuration).find(x=>x.level===2),draft=P.prepare(s.configuration,scene),fork=P.list(draft).find(n=>n.type==='branch'&&n.branches.some(branch=>branch.methodFilter?.methods.includes('exchange')));
 assert(fork);fork.branches[0].conditions=b.conditions;P.validate(draft,s.configuration);s.configuration=C.Rules.saveScene(s.configuration,'manager',draft,s.configuration.sceneRevision,Date.now());store.save(s);
 const loaded=store.load(),saved=P.prepare(loaded.configuration,C.Rules.sceneList(loaded.configuration).find(x=>x.id===scene.id));
 for(const exchangeValue of [479.99,480]){
  const route=P.entryPath(saved,{source:'crm',proposal:F.proposalValues({type:'exchange',exchangeValue})});assert.equal(route.some(node=>node.kind==='procurement'),exchangeValue>=480);
 }
});
