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
 return {state,scene,group,run:proposal=>F.plan(scene.config,state,{store:E.STORES[0],applicantId:'intake'},proposal)};
}
test('four proposal types select distinct type-only branches',()=>{
 const branches=Object.keys(F.planTypes).map(type=>({...rule([type]),title:type})),h=harness(branches);
 for(const type of Object.keys(F.planTypes))assert.equal(h.run({type,refund:['refund','combined'].includes(type)?300:0,compensation:['compensation','combined'].includes(type)?80:0}).path[0].title,type);
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
 const b=rule([],[{op:'gt',value:500}]);delete b.planTypes;
 const h=harness([b]);assert.equal(h.run(500).path[0].title,'默认条件');assert.equal(h.run(500.01).path[0].title,'方案分支');
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
