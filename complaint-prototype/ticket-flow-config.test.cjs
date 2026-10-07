const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('./configuration.js'),E=require('./workflow/engine.js');
const P=require('./ticket-flow-config.js')(C.Rules.Flow,C.STAFF,C.Assignment);
const fixture=()=>{const s=C.initialize(E.seed()).configuration,d=P.prepare(s,C.Rules.prepareScene(C.Rules.sceneList(s)[1]));return {s,d};};
function route(nodes,proposal){
 const amounts={refund:proposal.refund||0,compensation:proposal.compensation||0};amounts.total=amounts.refund+amounts.compensation;
 const matches=b=>(!b.planTypes?.length||b.planTypes.includes(proposal.type))&&(!b.conditions.length||b.conditions[b.match==='any'?'some':'every'](c=>{const a=amounts[c.field||'refund'],v=Number(c.value);return {gt:a>v,gte:a>=v,lt:a<v,lte:a<=v,eq:a===v}[c.op];}));
 return nodes.flatMap(n=>n.guard==='funded'&&!amounts.total?[]:n.type==='branch'?route(n.branches.find(b=>b.fallback||matches(b)).nodes,proposal):[n.id]);
}
test('creation-based configuration adds handling stages and retains original approval snapshots',()=>{
 const {s,d}=fixture(),old=JSON.parse(JSON.stringify(s.ruleScenes[1].config.approval.flow));P.validate(d,s);
 assert.equal(d.config.ticketFlow.start,'ticket-created');assert.equal(P.list(d)[0].kind,'sales');assert.equal(P.list(d).at(-1).kind,'close');assert.equal(P.list(d)[1].type,'branch');assert(P.all(P.list(d)).some(n=>n.kind==='payment'));
 const saved=C.Rules.saveScene(s,'manager',d,s.sceneRevision,Date.now());assert.deepEqual(saved.ruleScenes[1].config.approval.flow,old);assert.deepEqual(saved.ruleScenes[1].config.ticketFlow,d.config.ticketFlow);assert(!s.ruleScenes[1].config.ticketFlow);
});
test('store handling and department approvals retain separate configuration and timing',()=>{
 const {s,d}=fixture(),n=P.node('store',s,d);n.hours=8;P.list(d).splice(1,0,n);const a=P.all(P.list(d)).find(n=>n.type==='approval');a.handling.hours=2;P.validate(d,s);
 assert.equal(n.source,'store');assert.equal(n.hours,8);assert.equal(a.handling.hours,2);const saved=C.Rules.saveScene(s,'manager',d,s.sceneRevision,Date.now());assert.equal(P.all(saved.ruleScenes[1].config.ticketFlow.nodes).find(x=>x.id===n.id).hours,8);
});
test('payment handlers must be finance and final closure must return to sales owner',()=>{
 const {s,d}=fixture(),payment=P.all(P.list(d)).find(n=>n.kind==='payment'),close=P.list(d).at(-1);payment.source='person';payment.personId='aftercare';assert.throws(()=>P.validate(d,s),/财务人员/);payment.personId='finance';P.validate(d,s);close.source='person';close.personId='manager';assert.throws(()=>P.validate(d,s),/售后主负责人/);
});
test('default branches route funded proposals to payment and zero amounts to closure without node guards',()=>{
 const {s,d}=fixture(),nodes=P.list(d),payment=P.all(nodes).find(n=>n.kind==='payment');P.validate(d,s);
 assert(P.all(nodes).every(n=>!Object.hasOwn(n,'guard')));
 for(const proposal of [{type:'service'},{type:'refund',refund:0},{type:'combined',refund:0,compensation:0}])assert.deepEqual(route(nodes,proposal),[nodes[0].id,nodes.at(-1).id]);
 for(const proposal of [{type:'refund',refund:0.01},{type:'compensation',compensation:10},{type:'combined',refund:0,compensation:10},{type:'combined',refund:10,compensation:20},{type:'refund_exchange',refund:0.01},{type:'compensation_exchange',compensation:10}])assert(route(nodes,proposal).includes(payment.id));
});
test('level conditions do not suppress legacy funding guards and remain stable when saved',()=>{
 const {s,d}=fixture(),F=C.Rules.Flow,group=F.branch(),payment=P.node('payment',s,d);payment.guard='funded';
 Object.assign(group.branches[0],{judgeBy:'level',levels:[5],nodes:[payment]});
 d.config.ticketFlow.nodes=[P.node('sales',s,d),group,P.node('close',s,d)];
 const migrated=P.prepare(s,d);P.validate(migrated,s);const b=migrated.config.ticketFlow.nodes[1].branches[0];
 assert.equal(b.judgeBy,'level');assert.deepEqual(b.planTypes,[]);assert.deepEqual(b.conditions,[]);
 assert.equal(b.nodes[0].type,'branch');assert.equal(b.nodes[0].branches[0].nodes[0].id,payment.id);
 assert.deepEqual(P.prepare(s,migrated),migrated);
 const saved=C.Rules.saveScene(s,'manager',migrated,s.sceneRevision,Date.now());assert.deepEqual(saved.ruleScenes[1].config.ticketFlow,migrated.config.ticketFlow);
});
test('old guards migrate to editable branches preserving task order, configuration and repeated prepares',()=>{
 const {s,d}=fixture(),F=C.Rules.Flow,approval=P.all(P.list(d)).find(n=>n.type==='approval');
 const cc=F.node('cc'),store=P.node('store',s,d),payment=P.node('payment',s,d),fork=F.branch();
 const nested=F.node();nested.guard='funded';fork.branches[0].nodes=[nested];
 approval.guard=store.guard=payment.guard='funded';cc.guard='always';
 d.config.ticketFlow.nodes=[P.node('sales',s,d),cc,store,approval,fork,payment,P.node('close',s,d)];
 const original=JSON.parse(JSON.stringify(d)),migrated=P.prepare(s,d);P.validate(migrated,s);
 for(const proposal of [{type:'service'},{type:'refund',refund:0},{type:'refund',refund:0.01},{type:'refund',refund:500},{type:'refund',refund:501},{type:'compensation',compensation:50},{type:'combined',refund:0,compensation:50}])assert.deepEqual(route(P.list(migrated),proposal),route(P.list(original),proposal));
 assert.deepEqual(d,original);assert(P.all(P.list(migrated)).every(n=>!Object.hasOwn(n,'guard')));assert.deepEqual(P.prepare(s,migrated),migrated);
 assert.equal(P.all(P.list(migrated)).find(n=>n.id===fork.id).branches[0].nodes[0].id,nested.id);
});
test('handling, approval and cc nodes have no independent entry condition',()=>{
 const {s,d}=fixture(),nodes=P.all(P.list(d));
 for(const n of [...nodes.filter(n=>n.type!=='branch'),C.Rules.Flow.node('cc')]){n.guard='funded';P.validNode(n,s);assert.equal(n.guard,undefined);}
 const payment=nodes.find(n=>n.kind==='payment');d.config.ticketFlow.nodes=[P.list(d)[0],payment,P.list(d).at(-1)];P.validate(d,s);
 assert(route(P.list(d),{type:'service'}).includes(payment.id));
});
test('invalid flow endpoints, repeated payment paths and invalid time cannot publish',()=>{
 const {s,d}=fixture();P.list(d).unshift(P.node('store',s,d));assert.throws(()=>P.validate(d,s),/先进入售后/);P.list(d).shift();P.list(d).splice(1,0,P.node('payment',s,d));assert.throws(()=>P.validate(d,s),/最多一个付款/);P.list(d).splice(1,1);P.list(d)[0].hours=0;assert.throws(()=>P.validate(d,s),/节点时限/);
});
