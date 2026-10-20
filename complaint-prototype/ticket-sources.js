/* One source dictionary for intake, filtering and flow conditions. */
(function(root){
'use strict';
const labels={hotline:'400电话',manager_hotline:'经理热线',crm:'微动',miniapp:'小程序',wechat:'企微'};
const channels=Object.values(labels);
const aliases={'400客服 / 总经理热线':'400电话','总经理热线':'经理热线','门店H5 / A3':'微动','CRM系统':'微动','业务员代发起':'微动','微信小程序':'小程序','客户H5':'小程序','售后保障 / 企微':'企微','AI企微':'企微'};
const normalize=value=>aliases[value]||value;
const key=value=>Object.keys(labels).find(id=>labels[id]===normalize(value));
function upgradeFlow(flow){
 if(!flow||flow.sourceOptionsVersion>=1)return false;
 function walk(nodes){for(const n of nodes||[])if(n.type==='branch')for(const b of n.branches||[]){
  if(b.judgeBy==='source')b.sources=[...new Set((b.sources||[]).flatMap(v=>v==='hotline'?['hotline','manager_hotline']:v==='wechat'?['miniapp','wechat']:[v]))];
  if(b.title==='非 CRM 来源')b.title='非微动来源';
  walk(b.nodes);
 }}
 walk(flow.nodes);flow.sourceOptionsVersion=1;return true;
}
function ensure(s){
 if(s.ticketSourceVersion>=1)return false;
 for(const t of s.tickets||[]){
  t.channel=normalize(t.channel);
  for(const row of t.sources||[])row.channel=normalize(row.channel);
  upgradeFlow(t.flow?.config?.ticketFlow);
 }
 for(const scene of s.configuration?.ruleScenes||[])upgradeFlow(scene.config?.ticketFlow);
 s.ticketSourceVersion=1;return true;
}
const API={labels,channels,normalize,key,upgradeFlow,ensure};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.TicketSources=API;
})(typeof window!=='undefined'?window:globalThis);
