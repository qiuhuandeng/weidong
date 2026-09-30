(function(root){
'use strict';
function createApprovalFlow(STAFF,STORES){
  const clone=x=>JSON.parse(JSON.stringify(x)),assert=(ok,msg)=>{if(!ok)throw Error(msg);};
  const duties=['客诉主管','财务审核','公司负责人','品控复核','售后受理','独立回访'];
  const sources={position:'指定岗位',department:'指定部门负责人',manager:'指定上级',duty:'公司审批人员'};
  const modes={all:'会签（全部同意）',any:'或签（一人同意）',sequential:'依次审批'};
  const planTypes={service:'普通处理',refund:'退款',compensation:'赔偿',combined:'退款＋赔偿'};
  const amountFields={refund:'退款金额',compensation:'赔偿金额',total:'申请总额'};
  const compareLabels={gt:'>',gte:'≥',lt:'<',lte:'≤',eq:'='};
  const uid=()=> 'flow-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
  const legacyDuty={manager:'客诉主管',finance:'财务审核',director:'公司负责人',quality:'品控复核',aftercare:'售后受理',callback:'独立回访'};
  function positions(s){const model=typeof module!=='undefined'&&module.exports?require('./node-assignment.js')({STAFF}):root.NodeAssignment;return clone(s.nodeAssignmentRules?.positions||model.defaults().positions);}
  function organization(s){const org=clone(s.organization||{
    version:1,company:{id:'company',name:'艺施集团'},
    departments:[{id:'company',name:'集团总部',parent:null,leaders:['director']},{id:'operations',name:'门店运营中心',parent:'company',leaders:['manager']},{id:'aftercare',name:'售后服务部',parent:'company',leaders:['manager']},{id:'finance',name:'财务部',parent:'company',leaders:['finance']},{id:'quality',name:'品控部',parent:'company',leaders:['quality']},...STORES.map((store,i)=>({id:'store'+(i+1),name:store,store,parent:'operations',leaders:['store'+(i+1)]}))],
    appointments:STAFF.map(p=>({personId:p.id,departmentId:p.store==='*'?(['finance','quality'].includes(p.id)?p.id:p.id==='director'?'company':'aftercare'):p.id,managerId:p.id==='director'?null:p.id==='manager'?'director':p.id==='finance'||p.id==='quality'?'director':'manager',active:true})),
    arrangements:STAFF.filter(p=>legacyDuty[p.id]).map(p=>({duty:legacyDuty[p.id],departmentId:p.id==='director'?'company':p.id==='finance'||p.id==='quality'?p.id:'aftercare',position:p.role,members:[p.id]}))
  });org.positions=positions(s);org.arrangements.forEach(row=>{row.members=org.appointments.filter(a=>a.active&&a.departmentId===row.departmentId&&STAFF.find(p=>p.id===a.personId)?.role===row.position).map(a=>a.personId);});return org;}
  function getList(flow,id){if(id==='root')return flow;for(const n of flow){if(n.type==='branch')for(const b of n.branches){if(b.id===id)return b.nodes;const found=getList(b.nodes,id);if(found)return found;}}return null;}
  function find(flow,id){for(const n of flow){if(n.id===id)return n;if(n.type==='branch')for(const b of n.branches){if(b.id===id)return b;const found=find(b.nodes,id);if(found)return found;}}return null;}
  function node(type='approval'){return {id:uid(),type,title:type==='cc'?'抄送人':'部门审核',source:'department',mode:'all',hierarchy:{base:'business',mode:'single',origin:'bottom',level:1,empty:'block'}};}
  function condition(){return {id:uid(),title:'方案条件',planTypes:['refund'],match:'all',conditions:[{field:'refund',op:'gt',value:500}],nodes:[]};}
  function branch(){return {id:uid(),type:'branch',title:'按方案条件分流',branches:[condition(),{id:uid(),title:'默认条件',fallback:true,conditions:[],nodes:[]}]};}
  function duplicate(value){const d=clone(value);function walk(n){n.id=uid();if(n.branches)n.branches.forEach(walk);if(n.nodes)n.nodes.forEach(walk);}walk(d);return d;}
  function fromLegacy(a){return (a.nodes||[{assigneeId:a.managerId,condition:'amountAbove',amount:a.refundManagerAbove},{assigneeId:a.financeId,condition:'always'}]).map(n=>{
    const made={...node(),title:legacyDuty[n.assigneeId]||'门店审核',source:legacyDuty[n.assigneeId]?'duty':'department',duty:legacyDuty[n.assigneeId]};
    if(n.condition!=='amountAbove')return made;const fork=branch();fork.branches[0].conditions[0].value=n.amount;fork.branches[0].nodes=[made];return fork;
  });}
  function prepare(scene){const d=clone(scene),r=d.config;r.approval.flow=r.approval.flow||fromLegacy(r.approval);r.approval.delegateDuty=r.approval.delegateDuty||legacyDuty[r.approval.delegateId]||'公司负责人';r.routing.organizationDriven=true;r.routing.backupDuty=r.routing.backupDuty||'售后受理';r.routing.fallbackDuty=r.routing.fallbackDuty||'客诉主管';r.closure.callbackDuty=r.closure.callbackDuty||legacyDuty[r.closure.callbackId]||'独立回访';r.closure.qualityDuty=r.closure.qualityDuty||legacyDuty[r.closure.qualityId]||'品控复核';return d;}
  function sourceLabel(n,roles){if(n.source==='position')return '指定岗位 · '+(roles?.find(p=>p.id===n.positionId)?.name||n.positionName||'岗位已删除');if(n.source==='duty')return '公司审批人员 · '+n.duty;const h=n.hierarchy||{};return sources[n.source]+' · '+(h.base==='receptionist'?'客户的接待老师':h.base==='business'?'工单客户所属门店':'申请人任职')+' · '+(h.mode==='continuous'?'逐级至':'指定')+(h.origin==='top'?'最高层起':'')+'第'+h.level+'级';}
  function summary(flow){return flow.map(n=>n.type==='branch'?'条件分支':(n.type==='cc'?'抄送：':'')+n.title).join(' → ');}
  function validNode(n){if(n.type==='approval'&&n.handling){assert(n.handling.hours!==''&&Number.isFinite(Number(n.handling.hours))&&Number(n.handling.hours)>=0.25&&Number(n.handling.hours)<=720,'办理时限须在0.25至720小时之间');n.handling.hours=Number(n.handling.hours);if(n.handling.emptyAssigneeId)assert(STAFF.some(p=>p.id===n.handling.emptyAssigneeId),'请选择有效的空节点承接人');}assert(n.title?.trim()&&n.title.length<=40,'请填写1至40字的节点名称');assert(['approval','cc'].includes(n.type),'节点类型无效');assert(sources[n.source],'请选择组织架构中的人员来源');assert(modes[n.mode],'请选择多人办理方式');if(n.source==='position')assert(typeof n.positionId==='string'&&n.positionId,'请选择审批岗位');else if(n.source==='duty')assert(duties.includes(n.duty),'请选择有效审批职责');else{const h=n.hierarchy;assert(h&&['business','applicant','receptionist'].includes(h.base)&&['single','continuous'].includes(h.mode)&&['top','bottom'].includes(h.origin),'请配置审批层级');assert(Number.isInteger(Number(h.level))&&h.level>=1&&h.level<=10,'审批层级须在1至10级');assert(['block','parent'].includes(h.empty),'请选择无人负责时的处理方式');}return n;}
  function allowedFields(types=[]){
    if(!types.length)return Object.keys(amountFields);
    if(types.length===1)return ({service:[],refund:['refund'],compensation:['compensation'],combined:['refund','compensation','total']})[types[0]]||[];
    return Object.keys(amountFields).filter(key=>key==='refund'?types.some(t=>['refund','combined'].includes(t)):key==='compensation'?types.some(t=>['compensation','combined'].includes(t)):types.some(t=>t!=='service'));
  }
  function conditionSummary(b){
    const scope=b.planTypes?.length?'方案类型为「'+b.planTypes.map(t=>planTypes[t]||t).join('、')+'」':'不限方案类型';
    const amounts=(b.conditions||[]).map(c=>(amountFields[c.field||'refund']||'未知金额')+' '+(compareLabels[c.op]||'')+' '+(c.value===''?'待填写':c.value)+' 元').join(b.match==='any'?' 或 ':' 且 ');
    return scope+(amounts?'，且'+(b.conditions.length>1?'（'+amounts+'）':amounts):'');
  }
  // Integer cents keep strict/inclusive boundaries stable, including total = refund + compensation.
  function clauses(b){return !b.conditions?.length?[[]]:b.match==='any'?b.conditions.map(c=>[c]):[b.conditions];}
  function feasible(type,conditions){
    const bounds={refund:[0,Infinity],compensation:[0,Infinity],total:[0,Infinity]};
    if(['service','compensation'].includes(type))bounds.refund[1]=0;
    if(['service','refund'].includes(type))bounds.compensation[1]=0;
    for(const c of conditions){const b=bounds[c.field||'refund'],v=Math.round(Number(c.value)*100);if(!b||!Number.isFinite(v))return false;
      if(c.op==='gt')b[0]=Math.max(b[0],v+1);if(c.op==='gte'||c.op==='eq')b[0]=Math.max(b[0],v);
      if(c.op==='lt')b[1]=Math.min(b[1],v-1);if(c.op==='lte'||c.op==='eq')b[1]=Math.min(b[1],v);
    }
    return Object.values(bounds).every(([lo,hi])=>lo<=hi)&&Math.max(bounds.total[0],bounds.refund[0]+bounds.compensation[0])<=Math.min(bounds.total[1],bounds.refund[1]+bounds.compensation[1]);
  }
  function conditionsOverlap(a,b){return Object.keys(planTypes).some(type=>(!a.planTypes?.length||a.planTypes.includes(type))&&(!b.planTypes?.length||b.planTypes.includes(type))&&clauses(a).some(x=>clauses(b).some(y=>feasible(type,[...x,...y]))));}
  function validCondition(b){
    assert(b.title?.trim()&&b.title.length<=40,'请填写1至40字的分支名称');assert(['all','any'].includes(b.match),'请选择金额条件匹配方式');
    assert(b.planTypes===undefined||Array.isArray(b.planTypes),'方案类型无效');const types=b.planTypes||[];
    assert(types.every(t=>Object.hasOwn(planTypes,t)),'请选择有效的方案类型');
    assert(Array.isArray(b.conditions)&&(b.conditions.length>0||types.length>0),'请选择适用方案类型或添加金额条件；兜底请使用默认分支');
    const allowed=allowedFields(types);
    b.conditions.forEach(c=>{const key=c.field||'refund';assert(allowed.includes(key),'金额字段与所选方案类型不适用，请调整或删除该条件');assert(Object.hasOwn(compareLabels,c.op),'比较方式无效');assert(String(c.value).trim()!==''&&Number.isFinite(Number(c.value))&&Number(c.value)>=0&&Number(c.value)<=1000000,'条件金额须为0至1000000元');assert(Math.abs(Number(c.value)*100-Math.round(Number(c.value)*100))<0.000001,'条件金额最多保留两位小数');c.value=Number(c.value);});
    assert((types.length?types:Object.keys(planTypes)).some(type=>clauses(b).some(cs=>feasible(type,cs))),'金额条件互相矛盾，无法命中，请检查金额范围');
  }
  function proposalValues(proposal){
    // Numeric calls are legacy refund submissions, in yuan.
    const p=typeof proposal==='number'?{type:'refund',refund:proposal,compensation:0}:proposal;
    assert(p&&Object.hasOwn(planTypes,p.type),'请传入本次提交的方案类型');
    const refund=Number(p.refund??0),compensation=Number(p.compensation??0);
    assert([refund,compensation].every(n=>Number.isFinite(n)&&n>=0&&Math.abs(n*100-Math.round(n*100))<0.000001),'方案金额须为非负数且最多两位小数');
    assert(p.type==='combined'||p.type==='refund'&&compensation===0||p.type==='compensation'&&refund===0||p.type==='service'&&refund+compensation===0,'方案类型与金额不一致');
    return {type:p.type,refund:Math.round(refund*100),compensation:Math.round(compensation*100),total:Math.round(refund*100)+Math.round(compensation*100)};
  }
  function matchesProposal(b,p){
    if(b.planTypes?.length&&!b.planTypes.includes(p.type))return false;
    if(!b.conditions.length)return true;
    return b.conditions[b.match==='any'?'some':'every'](c=>{const amount=p[c.field||'refund'],v=Math.round(Number(c.value)*100);return ({gt:amount>v,gte:amount>=v,lt:amount<v,lte:amount<=v,eq:amount===v})[c.op];});
  }
  function validate(flow,roles){const ids=new Set();let count=0;function walk(list,depth){assert(Array.isArray(list)&&depth<=4,'条件分支最多嵌套4层');for(const n of list){count++;assert(n.id&&!ids.has(n.id),'流程节点标识重复');ids.add(n.id);if(n.type==='branch'){assert(n.branches.length>=2&&n.branches.length<=6,'每组分支须保留2至6条条件');assert(n.branches.at(-1).fallback&&n.branches.filter(b=>b.fallback).length===1,'最后一条须为默认条件');for(const b of n.branches){assert(b.id&&!ids.has(b.id),'条件标识重复');ids.add(b.id);if(!b.fallback)validCondition(b);walk(b.nodes,depth+1);}}else validNode(n);}}
    walk(flow,0);assert(count<=30,'流程最多30个节点');const last=flow.filter(n=>n.type!=='cc').at(-1);assert(last?.type==='approval'&&((last.source==='duty'&&last.duty==='财务审核')||last.source==='position'),'退款流程最后一个审批节点须为公司财务审核');if(roles){const check=list=>list.forEach(n=>{if(n.type==='branch')n.branches.forEach(b=>check(b.nodes));else if(n.source==='position')assert(roles.some(p=>p.id===n.positionId),'审批岗位已删除，请重新选择');});check(flow);if(last.source==='position'){const p=roles.find(p=>p.id===last.positionId);assert(p?.members.length&&p.members.every(id=>STAFF.find(x=>x.id===id)?.role==='财务审核'),'退款流程最后一个审批岗位须由财务审核人员承担');}}return flow;
  }
  function personnelError(ids,message){const error=Error(message);error.personnel=ids.length?'departed':'empty';throw error;}
  function delegated(org,id,now=Date.now()) {
    const rule=(org.delegations||[]).find(x=>x.from===id&&x.active!==false&&Number(x.startAt)<=now&&Number(x.endAt)>now);
    return rule&&org.appointments.some(a=>a.personId===rule.to&&a.active)&&STAFF.some(p=>p.id===rule.to)?rule.to:id;
  }
  function resolveSource(org,n,context){
    const active=id=>STAFF.some(p=>p.id===id)&&org.appointments.some(a=>a.personId===id&&a.active);
    if(n.source==='position'){const role=org.positions?.find(p=>p.id===n.positionId),raw=role?.members||[],ids=[...new Set(raw.map(id=>delegated(org,id,context.now)).filter(active))];if(!ids.length)personnelError(raw,'指定岗位没有有效人员，请维护岗位与人员');return [ids];}
    if(n.source==='duty'){const row=org.arrangements.find(a=>a.duty===n.duty);const raw=org.appointments.filter(a=>a.departmentId===row?.departmentId&&STAFF.find(p=>p.id===a.personId)?.role===row?.position).map(a=>a.personId);const ids=raw.map(id=>delegated(org,id,context.now)).filter(active);if(!ids.length)personnelError(raw,'组织架构未安排“'+n.duty+'”的有效人员，请先维护任职');return [[...new Set(ids)]];}
    const h=n.hierarchy,levels=[],originalLevels=[];const seen=new Set();
    if(n.source==='manager'){
      const starts=h.base==='business'?(org.departments.find(d=>d.store===context.store)?.leaders||[]):[context.applicantId];
      const validStarts=starts.filter(active);if(!validStarts.length)personnelError(starts.filter(Boolean),'起始部门没有有效负责人，请维护组织任职');
      for(const start of validStarts){let current=start,depth=0;const chainSeen=new Set();while(current){assert(!chainSeen.has(current),'直属上级关系存在循环');chainSeen.add(current);const job=org.appointments.find(a=>a.personId===current&&a.active);current=job?.managerId;if(current){originalLevels[depth]??=[];levels[depth]??=[];if(!originalLevels[depth].includes(current))originalLevels[depth].push(current);const id=delegated(org,current,context.now);if(active(id)&&!levels[depth].includes(id))levels[depth].push(id);depth++;}}}
    }
    else{if(h.base==='receptionist'&&!active(context.receptionistId))personnelError(context.receptionistId?[context.receptionistId]:[],'客户未配置有效的接待老师');let current=h.base==='business'?org.departments.find(d=>d.store===context.store)?.id:org.appointments.find(a=>a.personId===(h.base==='receptionist'?context.receptionistId:context.applicantId)&&a.active)?.departmentId;while(current){assert(!seen.has(current),'部门层级存在循环');seen.add(current);const dep=org.departments.find(d=>d.id===current);assert(dep,'所属部门不存在，请维护组织架构');originalLevels.push(dep.leaders||[]);levels.push((dep.leaders||[]).map(id=>delegated(org,id,context.now)).filter(active));current=dep.parent;}}
    const index=h.origin==='top'?levels.length-Number(h.level):Number(h.level)-1;assert(index>=0&&index<levels.length,'组织架构不存在所选的第'+h.level+'级，请调整节点层级');
    const result=[];for(let i=h.mode==='continuous'?0:index;i<=index;i++){let members=levels[i];if(!members.length&&h.empty==='parent')members=levels.slice(i+1).find(x=>x.length)||[];if(!members.length)personnelError(originalLevels[i]||[],'所选层级没有有效负责人，请维护组织架构');result.push(members);}return result;
  }
  function resolveApprovers(r,org,n,context) {
    let groups;
    try{groups=resolveSource(org,n,context);}catch(error){
      if(error.personnel&&Object.prototype.hasOwnProperty.call(n.handling||{},'emptyAssigneeId')){
        if(!n.handling.emptyAssigneeId)throw error;
        const id=delegated(org,n.handling.emptyAssigneeId,context.now);
        assert(STAFF.some(p=>p.id===id)&&org.appointments.some(a=>a.personId===id&&a.active),'空节点承接人已失效，请重新配置');
        assert(id!==context.applicantId,'空节点承接人不能是方案申请人，请重新配置');
        groups=[[id]];
      }else{
        const policy=r.handling?.[error.personnel];
        if(!policy||policy.mode!=='replace')throw error;
        groups=resolveSource(org,{source:'duty',duty:policy.duty},context);assert(groups.flat().every(id=>id!==context.applicantId),'备用审批职责匹配到申请人，请维护组织任职');
      }
    }
    return groups.map(ids=>[...new Set(ids.flatMap(id=>id===context.applicantId?resolveSource(org,{source:'duty',duty:r.approval.delegateDuty},context).flat():[id]))]).map(ids=>{assert(ids.every(id=>id!==context.applicantId),'代审职责仍匹配到申请人，请调整组织任职');return ids;});
  }
  function plan(r,s,context,proposal){context={...context,receptionistId:context.receptionistId||s.customers?.find(c=>c.id===context.customerId)?.receptionistId};validate(r.approval.flow,positions(s));const org=organization(s),steps=[],values=proposalValues(proposal);let path=[];
    const matches=b=>matchesProposal(b,values);
    function walk(list){for(const n of list){if(n.type==='branch'){const selected=n.branches.find(b=>b.fallback||matches(b));path.push({nodeId:n.id,branchId:selected.id,title:selected.title});walk(selected.nodes);continue;}
      const groups=n.type==='approval'?resolveApprovers(r,org,n,context):resolveSource(org,n,context);groups.forEach((members,i)=>{if(n.type==='approval')members=members.flatMap(id=>id===context.applicantId?resolveSource(org,{source:'duty',duty:r.approval.delegateDuty},context).flat():[id]);members=[...new Set(members)];assert(n.type==='cc'||members.every(id=>id!==context.applicantId),'代审职责仍匹配到申请人，请调整组织任职');if(n.mode==='sequential'&&n.type==='approval')members.forEach(id=>steps.push({nodeId:n.id,title:n.title,members:[id],mode:'all',type:n.type,source:sourceLabel(n,org.positions),sourceNode:clone(n)}));else steps.push({nodeId:n.id,title:n.title+(groups.length>1?' · 第'+(i+1)+'层':''),members,mode:n.mode,type:n.type,source:sourceLabel(n,org.positions),sourceNode:clone(n)});});}}
    walk(r.approval.flow);assert(steps.some(x=>x.type==='approval'),'请至少设置一个审批节点');return {steps,path,organizationVersion:org.version};
  }
  function bindRouting(r,s,data){if(!r.routing.organizationDriven)return r;const org=organization(s),context={store:data.store,applicantId:data.applicantId||'intake'},one=duty=>{const ids=resolveSource(org,{source:'duty',duty},context)[0];assert(ids.length===1,'“'+duty+'”需要唯一办理人，请维护组织任职');return ids[0];};
    r.routing.fallbackId=one(r.routing.fallbackDuty);const backup=one(r.routing.backupDuty);r.routing.stores=STORES.map(store=>{const dep=org.departments.find(d=>d.store===store),leaders=(dep?.leaders||[]).filter(id=>org.appointments.some(a=>a.personId===id&&a.active));assert(leaders.length===1,store+'须配置唯一有效门店负责人');return {store,primaryId:leaders[0],backupId:backup};});
    STAFF.forEach(p=>{if(!org.appointments.some(a=>a.personId===p.id&&a.active))r.routing.available[p.id]=false;else if(r.routing.available[p.id]===undefined)r.routing.available[p.id]=true;});
    r.closure.callbackId=one(r.closure.callbackDuty);if(!r.closure.callbackOnly){r.closure.qualityId=one(r.closure.qualityDuty);assert(r.closure.callbackId!==r.closure.qualityId,'回访与复核职责不能由同一人办理');}r.approval.financeId=one('财务审核');return r;
  }
  return {clone,uid,duties,sources,modes,planTypes,amountFields,compareLabels,allowedFields,conditionSummary,conditionsOverlap,positions,organization,node,condition,branch,duplicate,getList,find,prepare,fromLegacy,sourceLabel,summary,validNode,validCondition,validate,resolveSource,resolveApprovers,delegated,plan,bindRouting};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createApprovalFlow;else root.createApprovalFlow=createApprovalFlow;
})(typeof window!=='undefined'?window:globalThis);
