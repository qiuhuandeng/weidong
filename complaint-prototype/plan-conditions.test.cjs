'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const E=require('./engine.js'),F=E.Rules.Flow;
const NOW=Date.parse('2026-09-30T10:00:00+08:00');
const rule=(types,conditions=[],match='all')=>({...F.condition(),title:'方案分支',planTypes:types,conditions,match});
const amount=(field,op,value)=>({field,op,value});
function harness(branches){
 const state=E.seed(NOW),scene=F.prepare(E.Rules.sceneList(state)[0]),group=F.branch();
 group.branches=[...branches,group.branches.at(-1)];
 scene.config.approval.flow=[group,{...F.node(),source:'duty',duty:'财务审核'}];
 return {state,scene,group,run:(proposal,level)=>F.plan(scene.config,state,{store:E.STORES[0],applicantId:'intake',level},proposal)};
}
test('all eight combinations retain legacy exact-match conditions',()=>{
 assert.equal(Object.keys(F.planTypes).length,8);assert.equal(F.planTypes.service,'无需退赔或置换');assert.equal(F.planTypes.combined_exchange,'退款+赔偿+商品置换');
 for(const type of Object.keys(F.planTypes)){const h=harness([{...rule([type]),title:type}]);assert.equal(h.run({type,refund:F.Methods.includes(type,'refund')?300:0,compensation:F.Methods.includes(type,'compensation')?80:0}).path[0].title,type);}
 const h=harness(Array.from({length:8},()=>rule(['refund'])));assert.throws(()=>h.run(300),/2至8/);
});
test('type scope is required even when any amount condition is satisfied',()=>{
 const h=harness([rule(['combined'],[amount('refund','gte',5000),amount('compensation','gte',1000)],'any')]);
 assert.equal(h.run({type:'refund',refund:6000}).path[0].title,'默认条件');
 assert.equal(h.run({type:'combined',refund:5000,compensation:1}).path[0].title,'方案分支');
 assert.equal(h.run({type:'combined',refund:1,compensation:1000}).path[0].title,'方案分支');
 assert.equal(h.run({type:'combined',refund:4999.99,compensation:999.99}).path[0].title,'默认条件');
});
test('all amount conditions, exact total and cent boundaries',()=>{
 const h=harness([rule(['combined'],[amount('refund','gt',0.1),amount('compensation','gte',0.2)],'all')]);
 assert.equal(h.run({type:'combined',refund:0.1,compensation:0.2}).path[0].title,'默认条件');
 assert.equal(h.run({type:'combined',refund:0.11,compensation:0.2}).path[0].title,'方案分支');
 h.group.branches[0]=rule(['combined'],[amount('total','eq',0.3)]);
 assert.equal(h.run({type:'combined',refund:0.1,compensation:0.2}).path[0].title,'方案分支');
});
test('legacy refund conditions and numeric callers preserve boundary behavior',()=>{
 const b=rule([],[{op:'gt',value:500}]);delete b.planTypes;delete b.judgeBy;
 const h=harness([b]);assert.equal(h.run(500).path[0].title,'默认条件');assert.equal(h.run(500.01).path[0].title,'方案分支');
});
test('exchange price and cash fields follow the selected components',()=>{
 assert.deepEqual(F.allowedFields(['service']),[]);assert.deepEqual(F.allowedFields(['exchange']),['exchangeValue']);
 assert.deepEqual(F.allowedFields(['refund_exchange']),['refund','exchangeValue']);assert.deepEqual(F.allowedFields(['compensation_exchange']),['compensation','exchangeValue']);
 for(const type of ['service','exchange'])assert.throws(()=>F.validCondition(rule([type],[amount('refund','gt',0)])),/不适用/);
 assert.throws(()=>F.validCondition(rule(['refund_exchange'],[amount('compensation','gte',1)])),/不适用/);
 const h=harness([rule(['refund_exchange'],[amount('refund','gte',500)])]);
 assert.equal(h.run({type:'refund_exchange',refund:499.99}).path[0].title,'默认条件');
 assert.equal(h.run({type:'refund_exchange',refund:500}).path[0].title,'方案分支');
 assert.throws(()=>h.run({type:'refund_exchange',refund:500,compensation:1}),/类型与金额/);
 assert.throws(()=>h.run({type:'exchange',refund:1}),/类型与金额/);
 assert.throws(()=>h.run({type:'compensation_exchange',refund:1}),/类型与金额/);
});
const grade=(levels,title='等级分支')=>({...F.condition(),title,judgeBy:'level',levels});
test('level branches support grades one to five and ignore solution filters',()=>{
 const h=harness([grade([1,2],'普通等级'),grade([3,4,5],'升级处理')]);
 for(const level of [1,2,3,4,5])for(const type of ['service','refund','exchange'])assert.equal(h.run({type,refund:type==='refund'?0.01:0},level).path[0].title,level<3?'普通等级':'升级处理');
 assert.equal(h.run({type:'refund',refund:999}).path[0].title,'默认条件');
 assert.equal(h.run({type:'refund',refund:999},6).path[0].title,'默认条件');
 const b=grade([5,1,5]);F.validCondition(b);assert.deepEqual(b.levels,[1,5]);assert.deepEqual(b.planTypes,[]);assert.deepEqual(b.conditions,[]);
 assert.equal(F.conditionSummary(b),'客诉等级为「一级、五级」');
 for(const levels of [[],[0],[6],[1.5],['invalid'],null])assert.throws(()=>F.validCondition(grade(levels)),/等级/);
 assert.throws(()=>F.validCondition({...grade([1]),judgeBy:'unknown'}),/判断方式/);
 b.judgeBy='plan';b.planTypes=['exchange'];F.validCondition(b);assert.equal(b.levels,undefined);
});
test('overlap compares grade intersections and mixed modes follow branch priority',()=>{
 assert.equal(F.conditionsOverlap(grade([1,2]),grade([3,4,5])),false);
 assert.equal(F.conditionsOverlap(grade([1,2]),grade([2,5])),true);
 const p=rule(['exchange']);assert.equal(F.conditionsOverlap(grade([5]),p),true);assert.equal(F.conditionsOverlap(p,grade([5])),true);
 const h=harness([grade([5]),p]);assert.equal(h.run({type:'exchange'},5).path[0].title,'等级分支');assert.equal(h.run({type:'exchange'},4).path[0].title,'方案分支');
 h.group.branches=[p,h.group.branches[0],h.group.branches.at(-1)];assert.equal(h.run({type:'exchange'},5).path[0].title,'方案分支');
});
test('saved mixed branches retain their mode and route correctly after reloading',()=>{
 const h=harness([grade([1,5]),rule(['refund_exchange'],[amount('refund','gte',20)])]);
 const saved=E.Rules.saveScene(h.state,'manager',h.scene,0,NOW),state=JSON.parse(JSON.stringify(saved));
 const config=E.Rules.prepareScene(E.Rules.sceneList(state).find(s=>s.id===h.scene.id)).config;
 const run=(level,type)=>F.plan(config,state,{store:E.STORES[0],applicantId:'intake',level},{type,refund:20});
 assert.equal(run(5,'refund').path[0].title,'等级分支');assert.equal(run(2,'refund_exchange').path[0].title,'方案分支');assert.equal(run(2,'refund').path[0].title,'默认条件');
});
test('reject invalid amounts, incompatible types and contradictory ranges',()=>{
 for(const value of ['', ' ', -1, 0.001, Infinity])assert.throws(()=>F.validCondition(rule(['refund'],[amount('refund','gte',value)])));
 assert.throws(()=>F.validCondition(rule(['service'],[amount('refund','gte',1)])),/不适用/);
 assert.throws(()=>F.validCondition(rule(['refund'],[amount('compensation','gt',1)])),/不适用/);
 assert.throws(()=>F.validCondition(rule(['refund'],[amount('refund','gte',500),amount('refund','lt',500)])),/矛盾/);
 assert.throws(()=>F.validCondition(rule(['combined'],[amount('refund','gt',500),amount('compensation','gte',100),amount('total','lte',600)])),/矛盾/);
 assert.doesNotThrow(()=>F.validCondition(rule(['refund'],[amount('refund','gt',1000000)])));
 assert.throws(()=>F.validCondition(rule([])),/默认分支/);
});
test('overlap considers type, AND/OR and inclusive boundaries; priority remains deterministic',()=>{
 const a=rule(['refund'],[amount('refund','gte',500)]),b=rule(['refund'],[amount('refund','lte',500)]);
 assert.equal(F.conditionsOverlap(a,b),true);b.conditions[0].op='lt';assert.equal(F.conditionsOverlap(a,b),false);
 assert.equal(F.conditionsOverlap(a,rule(['compensation'],[amount('compensation','gte',500)])),false);
 const h=harness([{...a,title:'第一优先'},{...rule(['refund']),title:'后续分支'}]);assert.equal(h.run(600).path[0].title,'第一优先');
});
test('saved and reloaded rules match the newly submitted proposal without altering prior paths',()=>{
 const h=harness([rule(['refund','combined'],[amount('refund','gte',500)])]);
 const saved=E.Rules.saveScene(h.state,'manager',h.scene,0,NOW);
 const reloaded=JSON.parse(JSON.stringify(saved));const config=E.Rules.prepareScene(E.Rules.sceneList(reloaded).find(s=>s.id===h.scene.id)).config;
 const run=p=>F.plan(config,reloaded,{store:E.STORES[0],applicantId:'intake'},p);
 const prior=run({type:'refund',refund:600});const snapshot=JSON.stringify(prior);
 assert.equal(run({type:'compensation',compensation:600}).path[0].title,'默认条件');
 assert.equal(run({type:'combined',refund:600,compensation:100}).path[0].title,'方案分支');
 assert.equal(JSON.stringify(prior),snapshot);
});
