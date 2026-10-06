(function(root){
'use strict';
function createNodeAssignment(E){
 const copy=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m)};
 const definitions=[
  {id:'dispatch',name:'分派',action:'确定售后承办人',previous:[]},
  {id:'contact',name:'售后首联',action:'电话联系客户，核实诉求',previous:[]},
  {id:'proposal',name:'处理并提交方案',action:'核实情况、协调处理并提交方案',previous:['contact']},
  {id:'approval',name:'方案审批',action:'审核解决方案',locked:true},
  {id:'execution',name:'执行方案／付款',action:'落实服务方案；涉及款项时交财务',previous:['proposal','contact']},
  {id:'callback',name:'回访',action:'确认处理结果并登记客户反馈',previous:['proposal','contact','execution']},
  {id:'close',name:'结案',action:'回访满足结案条件后完成结案',locked:true}
 ];
 const methods={round_robin:'按顺序轮排',least_load:'按待办量最少',manual:'由负责人手动指定'};
 const roleRule=role=>({source:'position',position:role,method:'round_robin',manualBy:'manager',allMembers:true,members:[],person:'',from:'',fallback:'manager'});
 function defaults(){return {version:0,positions:[{id:'dispatch',name:'售后分派岗',members:['manager']},{id:'aftercare',name:'售后处理岗',members:['aftercare']},{id:'finance',name:'财务付款岗',members:['finance']},{id:'callback',name:'客户回访岗',members:['callback']}],nodes:{dispatch:roleRule('dispatch'),contact:roleRule('aftercare'),proposal:{...roleRule('aftercare'),source:'inherit',from:'contact'},execution:{...roleRule('aftercare'),source:'inherit',from:'proposal',payment:roleRule('finance')},callback:roleRule('callback')}};}
 function get(s){return copy(s.nodeAssignmentRules||defaults());}
 function people(s,config,rule){const position=config.positions.find(p=>p.id===rule.position);const active=new Set(E.Rules.Flow.organization(s).appointments.filter(a=>a.active).map(a=>a.personId));return (position?.members||[]).filter(id=>E.STAFF.some(p=>p.id===id)&&active.has(id)&&(rule.allMembers||rule.members.includes(id)));}
 function validate(s,c){assert(c.positions.length>0,'至少保留一个岗位');const ids=new Set(),names=new Set();for(const p of c.positions){p.name=String(p.name||'').trim();assert(p.name&&p.name.length<=30,'岗位名称须为1至30字');assert(!ids.has(p.id)&&!names.has(p.name),'岗位标识或名称不能重复');ids.add(p.id);names.add(p.name);assert(p.members.length&&new Set(p.members).size===p.members.length&&p.members.every(id=>E.STAFF.some(p=>p.id===id)),'请为岗位选择有效且不重复的人员');}
 function check(r,def){assert(r&&['position','person','inherit'].includes(r.source),'请选择办理人来源');if(r.source==='inherit'){assert(def.previous.includes(r.from),'请选择允许沿用的前序节点');return;}assert(E.STAFF.some(p=>p.id===r.fallback),'请指定无人可分配时的兜底人员');if(r.source==='person')assert(E.STAFF.some(p=>p.id===r.person),'请选择指定办理人');else{assert(ids.has(r.position),'请选择负责岗位');assert(methods[r.method],'请选择岗位内分配方式');if(r.method==='manual')assert(E.STAFF.some(p=>p.id===r.manualBy),'请选择手动分派负责人');assert(typeof r.allMembers==='boolean','请选择人员范围');assert(people(s,c,r).length,'该节点没有可用候选人，请维护岗位成员或调整人员范围');const role=c.positions.find(p=>p.id===r.position);assert(r.allMembers||r.members.every(id=>role.members.includes(id)),'节点候选人已不在岗位中，请调整人员范围');}}
 definitions.filter(d=>!d.locked).forEach(d=>check(c.nodes[d.id],d));check(c.nodes.execution.payment,{previous:[]});return c;
 }
 function save(original,actor,draft,expectedVersion,now=Date.now()){assert(actor==='manager','只有授权售后主管可以保存指派规则');assert(get(original).version===expectedVersion,'指派规则已在其他窗口更新，请关闭后重新配置');const s=copy(original),c=validate(s,copy(draft));c.version=expectedVersion+1;c.updatedAt=now;c.updatedBy=actor;s.nodeAssignmentHistory??=[];s.nodeAssignmentHistory.unshift({at:now,actor,before:s.nodeAssignmentRules?copy(s.nodeAssignmentRules):null,after:copy(c)});s.nodeAssignmentRules=c;s.revision++;return s;}
 // Read-only rule explanation; this does not enqueue or assign live ticket tasks.
 function preview(s,c,r,{cursor=0,loads={},previous={}}={}){if(r.source==='inherit')return {person:previous[r.from]||null,reason:'沿用'+definitions.find(d=>d.id===r.from).name+'办理人'};if(r.source==='person')return {person:r.person,reason:'固定指定人员'};const pool=people(s,c,r);if(!pool.length)return {person:r.fallback,reason:'无可用岗位成员，交兜底人员'};if(r.method==='manual')return {person:null,reason:'由'+(E.STAFF.find(p=>p.id===r.manualBy)?.name||'指定负责人')+'在候选人员中手动指定'};if(r.method==='least_load')return {person:[...pool].sort((a,b)=>(loads[a]||0)-(loads[b]||0))[0],reason:'选择当前待办量最少的人员；相同时按岗位顺序'};return {person:pool[cursor%pool.length],reason:'按岗位人员顺序轮排，末位之后回到首位'};}
 return {definitions,methods,defaults,get,people,validate,save,preview};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createNodeAssignment;else {root.createNodeAssignment=createNodeAssignment;if(root.CaseEngine)root.NodeAssignment=createNodeAssignment(root.CaseEngine);}
})(typeof window!=='undefined'?window:globalThis);
