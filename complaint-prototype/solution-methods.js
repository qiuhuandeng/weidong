/* Shared handling items for forms, routing, approval fields and reporting. */
(function(root){
'use strict';
const labels={refund:'退款',compensation:'赔偿',exchange:'商品置换',service:'无需退赔或置换'};
const combinations={service:['service'],refund:['refund'],compensation:['compensation'],combined:['refund','compensation'],exchange:['exchange'],refund_exchange:['refund','exchange'],compensation_exchange:['compensation','exchange'],combined_exchange:['refund','compensation','exchange']};
const types=Object.fromEntries(Object.entries(combinations).map(([key,items])=>[key,items.map(k=>labels[k]).join('+')]));
const aliases={'普通处理':'service','无退赔':'service','退款＋赔偿':'combined'};
function selection(value){
 if(!Array.isArray(value)||!value.length)throw Error('请至少选择一种处理方式');
 if(value.some(k=>!Object.hasOwn(labels,k)))throw Error('请选择有效的处理方式');
 const items=Object.keys(labels).filter(k=>value.includes(k));
 if(items.includes('service')&&items.length>1)throw Error('无需退赔或置换不能与其他处理方式同时选择');
 return items;
}
function methodsOf(p){
 if(Array.isArray(p))return selection(p);
 if(p&&Object.hasOwn(p,'handlingMethods'))return selection(p.handlingMethods);
 const value=typeof p==='string'?p:p?.typeKey||p?.type;
 const key=combinations[value]?value:Object.keys(types).find(k=>types[k]===value)||aliases[value];
 return key?[...combinations[key]]:[];
}
function keyOf(p){const items=methodsOf(p);return Object.keys(combinations).find(k=>combinations[k].length===items.length&&combinations[k].every(x=>items.includes(x)));}
function normalize(p){const handlingMethods=selection(methodsOf(p)),typeKey=keyOf(handlingMethods);return {handlingMethods,handlingFlags:Object.fromEntries(['refund','compensation','exchange'].map(k=>[k,handlingMethods.includes(k)])),typeKey,type:types[typeKey]};}
const includes=(p,key)=>methodsOf(p).includes(key);
// Old combinations become groups of included items; retain AND within each combination.
function filterFromLegacy(types){
 if(!types?.length)return null;
 let groups=types.map(key=>methodsOf(key));
 groups=groups.filter((g,i)=>g.length&&!groups.some((other,j)=>j!==i&&other.every(k=>g.includes(k))&&(other.length<g.length||j<i)));
 if(groups.length===1)return {methods:groups[0],match:'all'};
 if(groups.every(g=>g.length===1))return {methods:groups.flat(),match:'any'};
 return {groups};
}
function matchesFilter(filter,p){
 if(!filter)return true;
 const items=methodsOf(p),has=key=>items.includes(key);
 if(filter.groups)return filter.groups.some(group=>group.every(has));
 return (filter.methods||[])[filter.match==='all'?'every':'some'](has);
}
function upgradeCondition(b){if(!b.fallback&&(!b.judgeBy||b.judgeBy==='plan')&&!b.methodFilter&&b.planTypes?.length){b.methodFilter=filterFromLegacy(b.planTypes);delete b.planTypes;}return b;}
function normalizeTickets(s){let changed=false;for(const t of s.tickets||[])for(const p of [t.proposal,...(t.proposalHistory||[])]){if(!p||!keyOf(p))continue;const fields=normalize(p);if(Object.entries(fields).some(([k,v])=>JSON.stringify(p[k])!==JSON.stringify(v))){Object.assign(p,fields);changed=true;}}return changed;}
const API={labels,combinations,types,selection,methodsOf,keyOf,normalize,includes,filterFromLegacy,matchesFilter,upgradeCondition,normalizeTickets};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.SolutionMethods=API;
})(typeof window!=='undefined'?window:globalThis);
