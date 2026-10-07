/* Shared configuration domain. Both the existing rule editor and ticket engine use this model. */
(function(root){
'use strict';
const HOUR=3600000,copy=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m)};
const STAFF=[
 {id:'intake',name:'陈悦',role:'400受理',store:'*'},
 {id:'manager',name:'林岚',role:'售后主管',store:'*'},
 {id:'store1',name:'王敏',role:'门店店长',store:'南京浦口店'},
 {id:'store2',name:'周妍',role:'门店店长',store:'上海徐汇店'},
 {id:'aftercare',name:'许宁',role:'售后专员',store:'*'},
 {id:'callback',name:'赵晴',role:'400回访',store:'*'},
 {id:'quality',name:'沈青',role:'品控复核',store:'*'},
 {id:'finance',name:'陆清',role:'财务审核',store:'*'},
 {id:'procurement',name:'顾欣',role:'采购专员',store:'*'},
 {id:'director',name:'陈卓',role:'审批主管',store:'*'},
 {id:'chen',name:'陈悦',role:'售后专员',store:'*'},
 {id:'zhou',name:'周宁',role:'售后专员',store:'*'},
 {id:'jiang',name:'蒋琴',role:'售后主管',store:'*'},
 {id:'gu',name:'顾岚',role:'审批主管',store:'*'},
 {id:'li',name:'李晓',role:'门店店长',store:'杭州湖滨店'},
 {id:'zhang',name:'张敏',role:'门店店长',store:'上海徐汇店'},
 {id:'sun',name:'孙琳',role:'财务审核',store:'*'},
 {id:'wu',name:'吴桐',role:'业务员',store:'杭州湖滨店'},
 {id:'wang',name:'王言',role:'系统管理员',store:'*'}
];
const STORES=['南京浦口店','上海徐汇店'];
const makeRules=typeof module!=='undefined'&&module.exports?require('./rules.js'):root.createCaseRules;
const makeAssignment=typeof module!=='undefined'&&module.exports?require('./node-assignment.js'):root.createNodeAssignment;
const baseRules=makeRules(STAFF,STORES,HOUR),Rules={...baseRules};
Rules.saveScene=function(s,actor,draft,revision,now){
 const create=typeof module!=='undefined'&&module.exports?require('./ticket-flow-config.js'):root.createTicketFlowConfig,P=create(baseRules.Flow,STAFF,Assignment);draft=P.prepareSettings(copy(draft));
 if(draft.config?.ticketFlow?.schema===2){draft=P.prepare(s,draft);P.prepareEntry(s,draft);P.validate(draft,s);}
 const next=baseRules.saveScene(s,actor,draft,revision,now);
 // Intake selects a grade, so a new ambiguous grade cannot be activated silently.
 if(draft.enabled){const count=next.ruleScenes.filter(x=>x.enabled&&x.level===Number(draft.level)).length;assert(count<=1,'该等级已有启用规则，请先停用原规则，再启用新规则');}
 return next;
};
Rules.toggleScene=function(s,actor,id,revision,now){const d=Rules.sceneList(s).find(x=>x.id===id);assert(d,'规则不存在');d.enabled=!d.enabled;return Rules.saveScene(s,actor,d,revision,now);};
const facade={STAFF,STORES,HOUR,Rules,person:(_,id)=>STAFF.find(p=>p.id===id)};
const Assignment=makeAssignment(facade);
const Schedule=(typeof module!=='undefined'&&module.exports?require('./aftercare-schedule.js'):root.createAftercareSchedule)({STAFF,Assignment,Rules});
function upgrade(state){
 const c=state.configuration;if(!c||c.procurementConfigVersion>=1)return false;
 const assignment=Assignment.get(c);if(!assignment.positions.some(p=>p.id==='procurement'))assignment.positions.push({id:'procurement',name:'商品采购岗',members:['procurement']});c.nodeAssignmentRules=assignment;
 const org=Rules.Flow.organization(c);if(!org.departments.some(d=>d.id==='procurement'))org.departments.push({id:'procurement',name:'采购部',parent:'company',leaders:['procurement']});
 if(!org.appointments.some(a=>a.personId==='procurement'))org.appointments.push({personId:'procurement',departmentId:'procurement',managerId:'director',active:true});
 c.organization=org;c.procurementConfigVersion=1;return true;
}
function initialize(state,legacy){
 if(state.configuration){upgrade(state);return state;}
 const c=legacy?copy(legacy):{schema:1,sequence:0,revision:0,offset:0,cases:[],customers:[],rules:Rules.defaults(),ruleHistory:[]};
 assert(c.schema===1&&Array.isArray(c.cases),'旧规则数据格式不支持，已保留原始数据');
 c.rules??=Rules.defaults();c.sceneRevision??=0;c.revision??=0;c.sequence??=0;
 c.ruleScenes=Rules.sceneList(c).map(Rules.prepareScene);
 c.nodeAssignmentRules=Assignment.get(c);
 // Preserve existing appointments. Add only the staff used by the current ticket samples.
 const org=Rules.Flow.organization(c);
 for(const store of ['杭州湖滨店','南京新街口店','成都春熙店'])if(!org.departments.some(d=>d.store===store))org.departments.push({id:'store-'+org.departments.length,name:store,store,parent:'operations',leaders:store==='杭州湖滨店'?['li']:['jiang']});
 for(const p of STAFF){
  let job=org.appointments.find(j=>j.personId===p.id);
  const departmentId=p.store!=='*'?org.departments.find(d=>d.store===p.store)?.id:p.role==='采购专员'?'procurement':p.role==='财务审核'?'finance':p.id==='director'||p.id==='gu'?'company':'aftercare';
  if(!job)org.appointments.push({personId:p.id,departmentId,managerId:p.id==='director'?null:'manager',active:true});
  else if(!org.departments.some(d=>d.id===job.departmentId))job.departmentId=departmentId;
 }
 c.organization=org;
 state.configuration=c;state.assignmentCursors??={};state.unifiedVersion=1;upgrade(state);
 return state;
}
function scene(state,level){
 const matches=Rules.sceneList(state.configuration).filter(s=>s.enabled&&s.level===Number(level));
 assert(matches.length,'该等级没有启用的规则，请在规则配置中启用对应规则');
 assert(matches.length===1,'该等级有多条启用规则，请在规则配置中保留一条，避免派单歧义');
 return Rules.prepareScene(matches[0]);
}
function bind(state,ticket){
 const prepareFlow=typeof module!=='undefined'&&module.exports?require('./ticket-flow-config.js'):root.createTicketFlowConfig;
 const P=prepareFlow(Rules.Flow,STAFF,Assignment),original=scene(state,ticket.level),s=P.prepareSettings(P.prepare(state.configuration,original)),r=s.config;
 if(!original.config.ticketFlow)P.prepareEntry(state.configuration,s);
 ticket.flow={id:s.id,name:s.name,level:s.level,version:s.version,wholeFlowConfigured:!!original.config.ticketFlow,at:Date.now(),config:copy(r),assignment:Assignment.get(state.configuration),doc:{version:s.version,stage:{first:r.timing.firstContactHours,process:r.timing.processingHours,payment:r.timing.refundHours,review:r.timing.visitHours},totalHours:r.timing.targetHours,finance:r.approval.financeId,supervisor:r.notifications.escalationId,cc:[]}};
 const sales=r.ticketFlow?.nodes.find(n=>n.kind==='sales');if((state.configuration.aftercareSchedule||ticket.flow.wholeFlowConfigured)&&sales?.kind==='sales'){ticket.flow.doc.stage.process=sales.hours;}
 ticket.gradePolicy=copy(state.rules.grading);
}
function active(state,id){return STAFF.some(p=>p.id===id)&&Rules.Flow.organization(state.configuration).appointments.some(a=>a.personId===id&&a.active);}
function allocate(state,ticket,key,now=Date.now()){
 const config=ticket.flow?.assignment;if(!config)return null;
 let rule=key==='payment'?config.nodes.execution.payment:config.nodes[key];
 const scheduled=key==='contact'&&!!state.configuration.aftercareSchedule,sales=ticket.flow.config?.ticketFlow?.nodes.find(n=>n.kind==='sales');
 if((scheduled||ticket.flow.wholeFlowConfigured)&&sales?.kind==='sales'&&key==='contact')rule={source:sales.source,position:sales.positionId,person:sales.personId,fallback:sales.fallbackId,method:'round_robin',allMembers:true,members:[]};
 if(key==='proposal'&&ticket.flow.wholeFlowConfigured){assert(active(state,ticket.owner),'售后办理人已失效，请维护人员配置');return {person:ticket.owner,reason:'继续由售后办理人跟进'};}
 if(scheduled)rule={...rule,method:'round_robin',allMembers:true,members:[]};
 if(key==='contact'&&ticket.level>=5){const person=sales?.source==='person'&&STAFF.find(p=>p.id===sales.personId)?.role==='售后主管'?sales.personId:'manager';assert(active(state,person),'售后经理不可用，请维护人员配置');return {person,reason:'紧急工单直达售后经理'};}
 assert(rule,'节点未配置指派规则');
 const eligible=id=>{const p=STAFF.find(x=>x.id===id);return p&&active(state,id)&&(p.store==='*'||p.store===ticket.store)&&(key!=='payment'||p.role==='财务审核');};
 if(rule.source==='inherit'){
  const person=ticket.nodeOwners?.[rule.from]||(rule.from==='proposal'||rule.from==='contact'?ticket.owner:null);
  assert(eligible(person),'沿用的办理人已失效，请主管安排交接');return {person,reason:'沿用前序办理人'};
 }
 if(rule.source==='person')return eligible(rule.person)?(scheduled&&Schedule.isAftercare(rule.person)?scheduledAllocation([rule.person]):{person:rule.person,reason:'固定指定人员'}):fallback();
 const live={...config,positions:Assignment.get(state.configuration).positions};
 const pool=Assignment.people(state.configuration,live,rule).filter(eligible);
 if(!pool.length)return fallback();
 if(scheduled&&pool.some(Schedule.isAftercare))return scheduledAllocation(pool.filter(Schedule.isAftercare));
 if(rule.method==='manual'){
  assert(active(state,rule.manualBy),'手动分派负责人已失效，请维护规则');
  return {person:null,dispatcher:rule.manualBy,candidates:pool,reason:'等待手动分派'};
 }
 const cursorKey=key+':'+rule.position+':'+(rule.allMembers?'all':rule.members.join(','));
 if(rule.method==='least_load'){
  const loads={};for(const t of state.tickets){if(!['已结案','已合并'].includes(t.phase)&&t.activeNode===key&&t.currentAssignee)loads[t.currentAssignee]=(loads[t.currentAssignee]||0)+1;}
  return {person:pool.reduce((a,b)=>(loads[b]||0)<(loads[a]||0)?b:a),reason:'当前节点待办量最少'};
 }
 state.assignmentCursors??={};const cursor=state.assignmentCursors[cursorKey]||0;state.assignmentCursors[cursorKey]=cursor+1;
 return {person:pool[cursor%pool.length],reason:'按岗位顺序轮排'};
 function scheduledAllocation(ordered){
  const allowed=ordered.filter(id=>Schedule.canReceive(state.configuration,id,now));
  if(!allowed.length)return {person:null,scheduled:true,dispatcher:active(state,rule.fallback)?rule.fallback:'manager',candidates:ordered,reason:'等待开派时间及售后当班人员'};
  state.aftercareCursors??={};const key=rule.source==='person'?'person:'+rule.person:'position:'+rule.position,last=state.aftercareCursors[key],start=ordered.indexOf(last);
  const rotated=ordered.slice(start+1).concat(ordered.slice(0,start+1)),person=rotated.find(id=>allowed.includes(id));state.aftercareCursors[key]=person;return {person,scheduled:true,reason:'按当班售后人员顺序轮排'};
 }
 function fallback(){assert(eligible(rule.fallback),'节点没有有效候选人或兜底人员，请主管维护指派规则');return {person:rule.fallback,reason:'无可用候选人，使用兜底人员'};}
}
function activate(state,ticket,key,now=Date.now()){
 if(!ticket.flow?.assignment)return;
 const result=allocate(state,ticket,key,now);ticket.nodeOwners??={};ticket.activeNode=key;
 if(result.scheduled&&!result.person){ticket.pendingAssignment={mode:'schedule',node:key,dispatcher:result.dispatcher,candidates:result.candidates,reason:result.reason,resumeState:'待首联',queuedAt:ticket.created};ticket.currentAssignee='';ticket.owner='';ticket.phase='待分派';ticket.taskDeadline=null;ticket.participants=[...new Set([...ticket.participants,result.dispatcher])];return;}
 const wasWaiting=ticket.pendingAssignment?.mode==='schedule';
 if(!result.person){ticket.pendingAssignment={node:key,dispatcher:result.dispatcher,candidates:result.candidates,resumeState:ticket.phase};ticket.currentAssignee=result.dispatcher;ticket.participants=[...new Set([...ticket.participants,result.dispatcher])];ticket.phase='待分派';return;}
 ticket.nodeOwners[key]=result.person;ticket.currentAssignee=result.person;delete ticket.pendingAssignment;
 if(key==='contact'){ticket.owner=result.person;if(result.scheduled||wasWaiting||ticket.level>=5){ticket.assignedAt=now;ticket.taskDeadline=now+ticket.flow.doc.stage.first*HOUR;if(wasWaiting)ticket.phase='待首联';}}
 if(key==='payment'){ticket.flow.doc.finance=result.person;ticket.nodeOwners.execution=result.person;}
 ticket.participants=[...new Set([...ticket.participants,result.person])];
}
function assignPending(state,ticket,person){
 const p=ticket.pendingAssignment;if(!p)return false;
 assert(p.candidates.includes(person)&&active(state,person),'请选择当前节点的有效候选人');
 ticket.nodeOwners??={};ticket.nodeOwners[p.node]=person;ticket.currentAssignee=person;ticket.activeNode=p.node;ticket.phase=p.resumeState;
 if(p.node==='contact')ticket.owner=person;if(p.node==='payment'){ticket.flow.doc.finance=person;ticket.nodeOwners.execution=person;}
 delete ticket.pendingAssignment;return true;
}
function approvals(state,ticket,actor,proposal){
 const r=ticket.flow.config,order=state.orders.find(o=>o.id===ticket.order);
 const types={'普通处理':'service','无退赔':'service','退款':'refund','赔偿':'compensation','退款＋赔偿':'combined','退款+赔偿':'combined','商品置换':'exchange','退款+商品置换':'refund_exchange','赔偿+商品置换':'compensation_exchange'};
 const plan=Rules.Flow.plan(r,state.configuration,{store:ticket.store,level:ticket.level,applicantId:actor,receptionistId:order?.receptionistId,now:Date.now()},{type:types[proposal.type],refund:proposal.refund/100,compensation:proposal.compensation/100});
 return {...plan,steps:plan.steps.map((n,i)=>({id:n.nodeId+'-'+i,nodeId:n.nodeId,name:n.title,type:n.type,people:n.members,mode:n.mode,hours:n.sourceNode.handling?.hours||r.timing.approvalHours,votes:[],done:false}))};
}
const API={...facade,Assignment,Schedule,initialize,upgrade,scene,bind,active,allocate,activate,assignPending,approvals};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else {root.ComplaintConfiguration=API;root.CaseEngine=facade;root.NodeAssignment=Assignment;root.AftercareSchedule=Schedule;}
})(typeof window!=='undefined'?window:globalThis);
