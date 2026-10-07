'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine.js'),C=require('./configuration.js'),F=C.Rules.Flow,P=require('./ticket-flow-config.js')(F,C.STAFF,C.Assignment);
const fixture=(level=2)=>{let s=C.initialize(E.seed()).configuration;if(!C.Rules.sceneList(s).some(r=>r.level===level)){const rule=C.Rules.newScene(s);rule.level=level;rule.name='五级客诉';s=C.Rules.saveScene(s,'manager',rule,s.sceneRevision,Date.now());}const d=P.prepare(s,C.Rules.sceneList(s).find(r=>r.level===level));P.prepareEntry(s,d);return {s,d};};
const byKind=(d,kind)=>P.all(P.list(d)).find(n=>n.kind===kind),sourceBranch=d=>P.list(d)[0].branches[0],resultBranch=d=>sourceBranch(d).nodes[1].branches[0];
const proposal=F.proposalValues({type:'service'}),route=(d,source,storeResult='unresolved')=>P.entryPath(d,{source,storeResult,proposal});
test('editable tree contains real source/result branches and just the current rule sales role',()=>{
 for(let level=1;level<=5;level++){const {s,d}=fixture(level);P.validate(d,s);const old=E.clone(d);P.prepareEntry(s,d);assert.deepEqual(d,old);assert.equal(d.config.ticketFlow.schema,2);assert(!d.config.ticketFlow.entryRouting);assert.equal(sourceBranch(d).judgeBy,'source');assert.equal(resultBranch(d).judgeBy,'storeResult');assert.equal(P.all(P.list(d)).filter(n=>n.kind==='sales').length,1);assert.equal(byKind(d,'sales').entryRole,level===5?'manager':'specialist');}
});
test('all three sources follow their configured first handling and fixed rule grade',()=>{
 for(let level=1;level<=5;level++){const {d}=fixture(level),sales=byKind(d,'sales'),direct=route(d,'crm');assert.equal(direct[0].id,sales.id);assert.equal(direct.at(-1).kind,'close');for(const source of ['hotline','wechat']){assert.deepEqual(route(d,source).slice(1),direct);assert.equal(route(d,source)[0].entryRole,'store');assert.deepEqual(route(d,source,''),[byKind(d,'store')]);}}
});
test('a store terminal ends the entire path, without reaching sales or funding nodes',()=>{
 const {d}=fixture();for(const source of ['hotline','wechat']){const path=route(d,source,'resolved');assert.equal(path.length,2);assert.equal(path[0].kind,'store');assert.equal(path[1].type,'end');assert.equal(path[1].outcome,'store-closed');}
});
test('editing source choices changes routing and survives save/reload; paths are not hardcoded',()=>{
 const {s,d}=fixture();sourceBranch(d).sources=['wechat'];P.validate(d,s);assert.equal(route(d,'hotline')[0].kind,'sales');assert.equal(route(d,'wechat')[0].kind,'store');const next=C.Rules.saveScene(s,'manager',d,s.sceneRevision,Date.now()),saved=next.ruleScenes.find(r=>r.id===d.id);assert.deepEqual(saved.config.ticketFlow,d.config.ticketFlow);const loaded=P.prepare(next,saved);P.prepareEntry(next,loaded);assert.deepEqual(route(loaded,'hotline'),route(d,'hotline'));
});
test('result choices and branch priority drive terminal selection, including after reload',()=>{
 const {s,d}=fixture();resultBranch(d).results=['unresolved'];P.validate(d,s);assert.equal(route(d,'wechat','unresolved').at(-1).type,'end');assert.equal(route(d,'wechat','resolved').at(-1).kind,'close');const a=F.clone(sourceBranch(d)),b=F.duplicate(a);b.sources=['hotline'];b.nodes=[];P.list(d)[0].branches.unshift(b);P.validate(d,s);assert.equal(route(d,'hotline')[0].kind,'sales');assert.equal(route(d,'wechat')[0].kind,'store');
});
test('saved store times and sales assignments are genuine node configuration',()=>{
 for(const level of [2,5]){const {s,d}=fixture(level),store=byKind(d,'store'),sales=byKind(d,'sales');store.hours=8;d.config.timing.firstContactHours=1;sales.source='person';sales.personId=level===5?'manager':'chen';P.validate(d,s);assert.equal(sales.actions.store,false);const next=C.Rules.saveScene(s,'manager',d,s.sceneRevision,Date.now());assert.deepEqual(next.ruleScenes.find(r=>r.id===d.id).config.ticketFlow,d.config.ticketFlow);sales.personId=level===5?'aftercare':'manager';assert.throws(()=>P.validate(d,s),/五级|一至四级/);}
});
test('old dedicated entry settings migrate once and preserve node IDs, hours and downstream',()=>{
 const {s}=fixture(),d=P.prepare(s,C.Rules.sceneList(s)[1]),oldNodes=E.clone(P.list(d)),store=P.node('store',s,d),specialist=E.clone(oldNodes[0]);store.hours=9;store.firstHours=1;specialist.hours=13;specialist.source='person';specialist.personId='chen';d.config.ticketFlow.entryRouting={store,specialist,manager:P.node('sales',s,{...d,level:5})};const before=E.clone(d);P.prepareEntry(s,d);P.validate(d,s);assert.equal(byKind(d,'store').hours,9);assert.equal(byKind(d,'sales').hours,13);assert.equal(byKind(d,'sales').id,oldNodes[0].id);assert.deepEqual(P.list(d).slice(2),oldNodes.slice(1));assert(before.config.ticketFlow.entryRouting);const once=E.clone(d);P.prepareEntry(s,d);assert.deepEqual(d,once);
});
test('old level branches resolve against this rule once while keeping earlier plan priority',()=>{
 for(const level of [2,5]){const {s}=fixture(level),d=P.prepare(s,C.Rules.sceneList(s).find(r=>r.level===level)),branch=F.branch(),matched=F.node('cc'),other=F.node('cc');Object.assign(branch.branches[0],{judgeBy:'level',levels:[5],nodes:[matched]});branch.branches[1].nodes=[other];d.config.ticketFlow.nodes.splice(1,0,branch);P.prepareEntry(s,d);P.validate(d,s);assert(P.all(P.list(d)).some(n=>n.id===(level===5?matched.id:other.id)));assert(!P.all(P.list(d)).some(n=>n.id===(level===5?other.id:matched.id)));assert(!P.all(P.list(d)).some(n=>n.type==='branch'&&n.branches.some(b=>b.judgeBy==='level')));}
 const a=F.branch(),plan=a.branches[0],grade={...F.condition(),judgeBy:'level',levels:[2],nodes:[F.node('cc')]};a.branches.splice(1,0,grade);const folded=P.foldLevels([a],2)[0];assert.equal(folded.branches[0].id,plan.id);assert(folded.branches[1].fallback);assert.deepEqual(folded.branches[1].nodes,grade.nodes);
});
test('invalid source/result conditions, misplaced result decisions and nodes after terminal cannot save',()=>{
 for(const kind of ['source','storeResult']){const b={...F.condition(),judgeBy:kind,[kind==='source'?'sources':'results']:[]};assert.throws(()=>F.validCondition(b),/至少选择/);b[kind==='source'?'sources':'results']=['unknown'];assert.throws(()=>F.validCondition(b),/有效/);}
 let {s,d}=fixture();const branch=sourceBranch(d);branch.nodes.reverse();assert.throws(()=>P.validate(d,s),/门店首次办理之后|门店处理结果条件/);
 ({s,d}=fixture());resultBranch(d).nodes.push(P.node('store',s,d));assert.throws(()=>P.validate(d,s),/结案节点后/);
 ({s,d}=fixture());Object.assign(sourceBranch(d),{judgeBy:'level',levels:[2]});assert.throws(()=>P.validate(d,s),/规则列表/);
 assert.throws(()=>P.entryPath(d,{source:'unknown'}),/工单来源/);assert.throws(()=>P.entryPath(d,{source:'crm',storeResult:'other'}),/门店处理结果/);
});
test('shared matcher and overlap checks evaluate enum choices without solution values',()=>{
 const a={...F.condition(),judgeBy:'source',sources:['wechat']},b={...F.condition(),judgeBy:'source',sources:['crm']},r={...F.condition(),judgeBy:'storeResult',results:['resolved']};[a,b,r].forEach(F.validCondition);assert.equal(F.conditionsOverlap(a,b),false);assert.equal(F.conditionsOverlap(a,r),true);assert.equal(F.matchesCondition(a,{source:'wechat'}),true);assert.equal(F.matchesCondition(b,{source:'wechat'}),false);assert.equal(F.matchesCondition(r,{}),null);assert.equal(F.matchesCondition(r,{storeResult:'unresolved'}),false);
});
test('solution previews follow amount branches and common aftercare remains compatible',()=>{
 const {d}=fixture(),flow=d.config.ticketFlow;assert.equal(P.aftercareNodes(flow)[0].kind,'sales');assert.equal(P.aftercareNodes(flow).at(-1).kind,'close');assert(!route(d,'crm').some(n=>n.kind==='payment'));const funded=P.entryPath(d,{source:'crm',proposal:F.proposalValues({type:'refund',refund:100})});assert(funded.some(n=>n.kind==='payment'));assert.equal(funded.at(-1).kind,'close');
});
test('changing the rule grade updates the single sales role without losing node time or branches',()=>{
 const {s,d}=fixture();d.level=5;d.name='五级规则';byKind(d,'sales').hours=17;const storeBefore=E.clone(byKind(d,'store'));const next=C.Rules.saveScene(s,'manager',d,s.sceneRevision,Date.now()),saved=next.ruleScenes.find(r=>r.id===d.id);P.validate(saved,next);assert.equal(byKind(saved,'sales').entryRole,'manager');assert.equal(byKind(saved,'sales').personId,'manager');assert.equal(byKind(saved,'sales').hours,17);assert.deepEqual(byKind(saved,'store'),storeBefore);assert.equal(byKind(d,'sales').entryRole,'specialist');
});
test('handling type options cover every example node and create the matching handler configuration',()=>{
 const {s,d}=fixture();assert.deepEqual(Object.keys(P.handlingTypes),['store','sales','manager','payment','store_close','close','procurement']);
 for(const type of Object.keys(P.handlingTypes)){const n=P.handlingNode(type,s,d);assert.equal(P.handlingType(n,d),type);if(n.entryRole)P.validEntryNode(n,s);else P.validNode(n,s);if(type==='store_close')assert.equal(n.type,'end');else assert.equal(n.type,'handling');}
 for(const level of [1,2,3,4,5]){const {d:rule}=fixture(level);for(const n of P.all(P.list(rule)).filter(n=>['handling','end'].includes(n.type)))assert(Object.hasOwn(P.handlingTypes,P.handlingType(n,rule)));}
 assert.equal(P.handlingNode('store',s,d).source,'store');assert.equal(P.handlingNode('manager',s,{...d,level:5}).personId,'manager');assert.equal(P.handlingNode('close',s,d).source,'owner');assert.equal(P.handlingNode('procurement',s,d).positionId,'procurement');assert.throws(()=>P.handlingNode('unknown',s,d),/有效的办理类型/);
});
