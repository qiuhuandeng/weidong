/* Whole-ticket flow configuration. Kept separately from legacy in-flight approval snapshots. */
(function(root){
'use strict';
function create(F,STAFF,Assignment){
 const Templates=typeof module!=='undefined'&&module.exports?require('./approval-templates.js'):root.ApprovalTemplates;
 const copy=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m);};
 const kinds={sales:'专员办理',store:'门店办理',payment:'付款办理',close:'售后结案',procurement:'采购办理'};
 const handlingTypes={store:'门店办理',sales:'专员办理',manager:'经理办理',payment:'付款办理',store_close:'门店结案',close:'售后结案',procurement:'采购办理'};
 const methods={round_robin:'按顺序轮排'};
 const sourceTypes={hotline:'400客服 / 总经理热线',crm:'CRM系统',wechat:'微信小程序 / AI企微'};
 const sourceDescriptions={hotline:'两个坐席分别接听 400 和总经理热线，由 400 客服统一发起。',crm:'门店店长、市场部、销售部；归口门店 / 网咨发起，已沟通但未解决。',wechat:'客户点击链接自助提交，由客户发起。'};
 function useRotation(n){n.method='round_robin';n.allMembers=true;n.members=[];delete n.manualBy;return n;}
 const descriptions={procurement:'按审批通过的商品明细登记发货方式、发货数量、物流单号及备注，全部发货后进入下一节点。',sales:'先填写跟进记录，再录入线下沟通确认的解决方案；提交后完成本节点。',store:'核实本门店的客户与订单情况，记录沟通及处理结果，提交后进入下一节点。',payment:'根据已确认的退款、赔偿事项登记付款结果和凭证；付款成功后完成本节点。',close:'由售后主负责人线下确认各部门及商品事项已处理完成，填写结果并手动结案。'};
 function node(kind,s,scene){
  const c=Assignment.get(s),key=kind==='payment'?'execution':kind==='close'?'callback':'contact';let r=kind==='payment'?c.nodes.execution.payment:c.nodes[key];
  if(r?.source==='inherit')r=c.nodes.contact;
  const n={id:F.uid(),type:'handling',kind,title:kinds[kind],source:r?.source==='person'?'person':'position',positionId:r?.position||'aftercare',personId:r?.person||'',method:'round_robin',allMembers:true,members:[],fallbackId:r?.fallback||'manager',hours:scene?.config?.timing?.[kind==='payment'?'refundHours':kind==='close'?'visitHours':'processingHours']||24,actions:{transfer:true,store:true,suspend:true}};
  if(kind==='procurement')Object.assign(n,{source:'position',positionId:'procurement',personId:'',fallbackId:'procurement'});if(kind==='store'){n.source='store';n.positionId='';n.personId='';n.fallbackId='';}if(kind==='close')n.source='owner';if(kind==='payment')n.fallbackId='finance';if(kind==='sales'&&scene?.level===5){n.source='person';n.personId='manager';}return n;
 }
 function handlingType(n){return n.type==='end'?'store_close':n.kind==='sales'&&n.entryRole==='manager'?'manager':n.kind;}
 function handlingNode(type,s,scene){
  assert(Object.hasOwn(handlingTypes,type),'请选择有效的办理类型');
  if(type==='store_close')return endNode();
  if(type==='sales'||type==='manager'){const manager=type==='manager';return {...node('sales',s,scene),title:manager?'售后经理办理':'售后专员办理',entryRole:manager?'manager':'specialist',source:manager?'person':'position',positionId:manager?'':'aftercare',personId:manager?'manager':'',fallbackId:manager?'manager':'aftercare',actions:{transfer:true,store:false,suspend:true}};}
  return node(type,s,scene);
 }
 function fundedBranch(nodes){return {id:F.uid(),type:'branch',title:'按款项分流',branches:[{id:F.uid(),title:'退款或赔偿',judgeBy:'plan',planTypes:['refund','compensation','combined','refund_exchange','compensation_exchange'],match:'any',conditions:[{field:'refund',op:'gt',value:0},{field:'compensation',op:'gt',value:0}],nodes},{id:F.uid(),title:'默认条件',fallback:true,conditions:[],nodes:[]}]};}
 function exchangeBranch(s,scene){return {id:F.uid(),type:'branch',title:'按商品置换分流',branches:[{id:F.uid(),title:'涉及商品置换',judgeBy:'plan',planTypes:['exchange','refund_exchange','compensation_exchange'],match:'all',conditions:[],nodes:[node('procurement',s,scene)]},{id:F.uid(),title:'默认条件',fallback:true,conditions:[],nodes:[]}]};}
 function prepareProcurement(s,d){const flow=d.config.ticketFlow;if(flow.procurementVersion>=2)return;
  const index=flow.nodes.findIndex(n=>n.title==='按商品置换分流'&&n.type==='branch'&&all([n]).some(x=>x.kind==='procurement'));
  if(index>=0){const [branch]=flow.nodes.splice(index,1);flow.nodes.splice(flow.nodes.length-1,0,branch);}
  else if(!flow.procurementVersion&&!all(flow.nodes).some(n=>n.kind==='procurement'))flow.nodes.splice(flow.nodes.length-1,0,exchangeBranch(s,d));
  flow.procurementVersion=2;
 }
 function requiresFunds(b){return !b.fallback&&!F.conditionsOverlap(b,{planTypes:[],match:'all',conditions:[{field:'total',op:'eq',value:0}]});}
 // Convert former per-node guards into visible branches without changing task IDs or order.
 function normalizeFlow(nodes,funded=false){
  const result=[];let pending=[];const flush=()=>{if(pending.length){result.push(fundedBranch(pending));pending=[];}};
  for(const n of nodes){const gated=n.guard==='funded'&&!funded;delete n.guard;if(n.type==='handling')useRotation(n);
   if(n.type==='branch')n.branches.forEach(b=>{b.nodes=normalizeFlow(b.nodes,funded||requiresFunds(b));});
   if(gated)pending.push(n);else{flush();result.push(n);}
  }flush();return result;
 }
 function prepare(s,scene){
  const d=copy(scene);if(d.config.ticketFlow){d.config.ticketFlow.nodes=normalizeFlow(d.config.ticketFlow.nodes);return d;}
  const approvals=copy(d.config.approval.flow||[]);
  d.config.ticketFlow={schema:1,start:'ticket-created',procurementVersion:2,nodes:normalizeFlow([node('sales',s,d),fundedBranch([...approvals,node('payment',s,d)]),exchangeBranch(s,d),node('close',s,d)])};return d;
 }
 // Upgrade only the editor draft; in-flight ticket snapshots keep their saved version.
 function foldLevels(nodes,level){
  return nodes.flatMap(n=>{
   if(n.type!=='branch')return [n];
   n.branches.forEach(b=>{b.nodes=foldLevels(b.nodes,level);});
   const branches=[];
   for(const b of n.branches){
    if(!b.fallback&&b.judgeBy==='level'){
     if(!(b.levels||[]).map(Number).includes(Number(level)))continue;
     branches.push({id:b.id,title:'默认条件',fallback:true,conditions:[],nodes:b.nodes});break;
    }
    branches.push(b);if(b.fallback)break;
   }
   if(branches.length===1&&branches[0].fallback)return branches[0].nodes;
   n.branches=branches;return [n];
  });
 }
 function condition(title,judgeBy,values,nodes=[]){return {...F.condition(),title,judgeBy,[judgeBy==='source'?'sources':'results']:values,planTypes:[],conditions:[],nodes};}
 const fallback=nodes=>({id:F.uid(),title:'默认条件',fallback:true,conditions:[],nodes});
 function endNode(){return {id:F.uid(),type:'end',outcome:'store-closed',title:'门店直接结案'};}
 function prepareSettings(d){
  const config=d.config,timing=config.timing,flow=config.ticketFlow,nodes=all(flow?.nodes||[]);
  if(config.contactTimingVersion!==1){
   const role=Number(d.level)===5?'manager':'specialist',sales=flow?.entryRouting?.[role]||nodes.find(n=>n.kind==='sales');
   timing.firstContactHours=sales?.firstHours??timing.firstContactHours;config.contactTimingVersion=1;
  }
  delete timing.storeFirstContactHours;
  for(const n of [...nodes,...Object.values(flow?.entryRouting||{})]){delete n.firstHours;if(n.kind==='store'){if(!['store','receptionist'].includes(n.source))n.source='store';n.positionId='';n.members=[];n.personId='';n.fallbackId='';}if(n.kind==='close')n.source='owner';if(n.kind==='sales'&&n.entryRole==='manager'){n.source='person';n.personId||='manager';n.positionId='';}}
  return d;
 }
 function prepareEntry(s,d){
  prepareSettings(d);
  const flow=d.config.ticketFlow;flow.nodes=foldLevels(flow.nodes,Number(d.level));prepareProcurement(s,d);
  if(flow.schema===2){
   const sales=flow.nodes.find(n=>n.kind==='sales'),role=Number(d.level)===5?'manager':'specialist';
   if(sales&&sales.entryRole!==role){const defaults=node('sales',s,d);Object.assign(sales,{entryRole:role,title:role==='manager'?'售后经理办理':'售后专员办理',source:role==='manager'?'person':'position',personId:role==='manager'?'manager':'',positionId:defaults.positionId,fallbackId:role==='manager'?'manager':'aftercare'});sales.actions??={};sales.actions.store=false;}
   prepareSettings(d);return flow.nodes;
  }
  const legacy=flow.entryRouting,role=Number(d.level)===5?'manager':'specialist';
  let sales=copy(legacy?.[role]||flow.nodes[0]),store=copy(legacy?.store||node('store',s,d));
  Object.assign(store,{entryRole:'store',title:legacy?.store?.title||'门店首次办理',source:store.source,fallbackId:''});
  Object.assign(sales,{id:flow.nodes[0].id,entryRole:role,title:legacy?.[role]?.title||(role==='manager'?'售后经理办理':'售后专员办理')});
  sales.actions??={transfer:true,suspend:true};sales.actions.store=false;
  if(role==='specialist'&&STAFF.find(p=>p.id===sales.fallbackId)?.role!=='售后专员')sales.fallbackId='aftercare';
  const results={id:F.uid(),type:'branch',title:'门店处理结果',branches:[condition('门店已解决','storeResult',['resolved'],[endNode()]),fallback([])]};
  const source={id:F.uid(),type:'branch',title:'工单来源',branches:[condition('非 CRM 来源','source',['hotline','wechat'],[store,results]),fallback([])]};
  flow.nodes=[source,sales,...flow.nodes.slice(1)];flow.schema=2;delete flow.entryRouting;prepareSettings(d);return flow.nodes;
 }
 function validEntryNode(n,s){
  validNode(n,s);const role=n.entryRole,allowed=role==='specialist'?'售后专员':'售后主管';
  if(role==='store'){assert(n.kind==='store'&&['store','receptionist'].includes(n.source)&&!n.fallbackId,'门店首次办理须由所属门店负责人或客户接待老师处理，无人时保留待分派');return n;}
  assert(['specialist','manager'].includes(role)&&n.kind==='sales','请选择有效的售后办理角色');
  const ids=n.source==='person'?[n.personId]:F.positions(s).find(p=>p.id===n.positionId)?.members||[];
  assert(ids.length&&ids.every(id=>STAFF.find(p=>p.id===id)?.role===allowed),role==='specialist'?'一至四级须由售后专员承接':'五级须由售后经理承接');
  if(n.fallbackId)assert(STAFF.find(p=>p.id===n.fallbackId)?.role===allowed,'兜底人员须与本节点售后角色一致');n.actions.store=false;return n;
 }
 // Both route preview and saved conditions use the shared condition evaluator.
 function entryPath(d,{source,storeResult,proposal}={}){
  assert(Object.hasOwn(sourceTypes,source),'请选择有效工单来源');
  assert(!storeResult||Object.hasOwn(F.storeResults,storeResult),'请选择门店处理结果');
  const steps=[],context={source,storeResult,level:d.level,proposal};
  function walk(nodes){for(const n of nodes){
   if(n.type==='branch'){
    let selected;for(const b of n.branches){const match=b.fallback?true:F.matchesCondition(b,context);if(match===null)return false;if(match){selected=b;break;}}
    assert(selected,'条件分支缺少默认路径');if(!walk(selected.nodes))return false;
   }else{steps.push(copy(n));if(n.type==='end'||n.kind==='close')return false;}
  }return true;}
  walk(d.config.ticketFlow.nodes);return steps;
 }
 function aftercareNodes(flow){const index=flow.nodes.findIndex(n=>n.kind==='sales');return flow.nodes.slice(Math.max(index,0));}
 function list(d){return d.config.ticketFlow?.nodes||d.config.approval.flow;}
 function all(nodes){return nodes.flatMap(n=>[n,...(n.type==='branch'?n.branches.flatMap(b=>all(b.nodes)):[])]);}
 function sourceLabel(n,positions){if(n.type!=='handling')return F.sourceLabel(n,positions);return n.source==='owner'?'工单售后主负责人':n.source==='store'?'工单所属门店负责人':n.source==='receptionist'?'客户的接待老师':n.source==='person'?'指定人员 · '+(STAFF.find(p=>p.id===n.personId)?.name||'未指定'): '指定岗位 · '+(positions.find(p=>p.id===n.positionId)?.name||'未指定');}
 function validNode(n,s){
  const ps=F.positions(s),person=id=>STAFF.find(p=>p.id===id);delete n.guard;
  if(n.type==='approval'&&n.provider==='dingtalk')return Templates.validateNode(n,s);
  if(n.type==='end'){assert(n.outcome==='store-closed'&&n.title?.trim()&&n.title.length<=40,'请填写有效的门店结案节点名称');return n;}
  if(n.type!=='handling'){F.validNode(n);if(n.source==='position')assert(ps.some(p=>p.id===n.positionId&&p.members.length),'请选择有成员的岗位');return n;}
  useRotation(n);assert(kinds[n.kind],'请选择办理类型');assert(n.title?.trim()&&n.title.length<=40,'节点名称须为 1 至 40 字');
  assert(Number.isFinite(Number(n.hours))&&Number(n.hours)>=0.25&&Number(n.hours)<=720,'节点时限须在 0.25 至 720 小时之间');n.hours=Number(n.hours);
  assert(['position','person','store','receptionist','owner'].includes(n.source),'请选择办理人来源');
  if(n.source==='owner')assert(n.kind==='close','仅售后结案可沿用售后主负责人');if(['store','receptionist'].includes(n.source))assert(n.kind==='store','仅门店办理可使用门店负责人或客户接待老师');
  if(handlingType(n)==='manager')assert(n.source==='person','经理办理须指定人员');
  if(n.source==='position'){const p=ps.find(x=>x.id===n.positionId);assert(p&&p.members.length,'请选择岗位人员中已配置的岗位');}
  if(n.source==='person')assert(person(n.personId),'请选择有效办理人');if(n.fallbackId)assert(person(n.fallbackId),'请选择有效兜底人员');
  if(n.kind==='sales'){n.actions??={};for(const key of ['transfer','store','suspend']){n.actions[key]??=false;assert(typeof n.actions[key]==='boolean','请选择有效的售后操作权限');}}
  if(n.kind==='close')assert(n.source==='owner','结案必须由售后主负责人办理');
  if(['payment','procurement'].includes(n.kind)){const role=n.kind==='payment'?'财务审核':'采购专员',label=n.kind==='payment'?'付款':'采购';const ids=n.source==='person'?[n.personId]:ps.find(p=>p.id===n.positionId)?.members||[];assert(ids.length&&ids.every(id=>person(id)?.role===role),label+'办理须由'+(n.kind==='payment'?'财务人员':'采购专员')+'承接');if(n.fallbackId)assert(person(n.fallbackId)?.role===role,label+'兜底人员须为'+role);}
  return n;
 }
 function validate(d,s){
  const config=d.config.ticketFlow;assert([1,2].includes(config?.schema)&&config.start==='ticket-created','流程必须从工单创建开始');config.nodes=normalizeFlow(config.nodes);const ids=new Set();let count=0;
  function walk(nodes,depth){assert(Array.isArray(nodes)&&depth<=4,'条件分支最多嵌套 4 层');for(const n of nodes){assert(n.id&&!ids.has(n.id),'流程节点标识重复');ids.add(n.id);assert(++count<=40,'流程最多 40 个节点');if(n.type==='branch'){assert(n.branches?.length>=2&&n.branches.length<=F.maxBranches,'条件组须有 2 至 8 条分支（含默认条件）');assert(n.branches.at(-1).fallback&&n.branches.filter(b=>b.fallback).length===1,'最后一条须为唯一默认条件');for(const b of n.branches){assert(b.id&&!ids.has(b.id),'分支标识重复');ids.add(b.id);if(!b.fallback){assert(config.schema!==2||b.judgeBy!=='level','客诉等级已在规则列表匹配，请移除等级条件');F.validCondition(b);}walk(b.nodes,depth+1);}}else if(config.schema===2&&n.entryRole)validEntryNode(n,s);else validNode(n,s);}}
  walk(config.nodes,0);const salesIndex=config.nodes.findIndex(n=>n.kind==='sales');
  assert(config.schema===2?salesIndex>=0:config.nodes[0]?.kind==='sales','公共售后阶段须先进入售后办理');assert(config.nodes.at(-1)?.kind==='close','最后一个节点须为售后结案');
  if(config.schema===2){
   const sales=config.nodes[salesIndex];assert(sales.entryRole===(Number(d.level)===5?'manager':'specialist'),'售后办理角色须与当前规则等级一致');
   assert(all(config.nodes).filter(n=>n.kind==='sales').length===1,'当前等级规则只能保留一个公共售后办理节点');
   for(const n of all(config.nodes.slice(0,salesIndex)))if(n.type==='branch')assert(n.branches.every(b=>b.fallback||['source','storeResult'].includes(b.judgeBy)),'售后办理前仅可按工单来源或门店处理结果判断');
   for(const n of all(config.nodes.slice(salesIndex)))if(n.type==='branch')assert(n.branches.every(b=>b.fallback||(b.judgeBy||'plan')==='plan'),'售后办理后的条件请使用适用方案类型');
  }
  function paths(nodes){let result=[[]];for(const n of nodes){const items=n.type==='branch'?n.branches.flatMap(b=>paths(b.nodes)):[[n]];result=result.flatMap(x=>x.at(-1)?.type==='end'?[x]:items.map(y=>x.concat(y)));assert(result.length<=100,'流程分支路径过多');}return result;}
  for(const path of paths(config.nodes)){
   if(path.at(-1)?.type==='end'){assert(config.schema===2&&path.some(n=>n.entryRole==='store')&&!path.some(n=>['sales','payment','procurement','close'].includes(n.kind)||n.type==='approval'),'门店直接结案须位于门店首次办理之后、售后办理之前');continue;}
   assert(path.filter(n=>n.kind==='sales').length===1,'每条路径只能有一个售后办理节点');assert(path.filter(n=>n.kind==='close').length===1,'每条路径只能有一个售后结案节点');assert(path.filter(n=>n.kind==='payment').length<=1,'每条路径最多一个付款办理节点');assert(path.filter(n=>n.kind==='procurement').length<=1,'每条路径最多一个采购办理节点');
  }
  if(config.schema===2){
   function contextWalk(nodes,hasStore=false){for(let i=0;i<nodes.length;i++){const n=nodes[i];if(n.type==='end'){assert(i===nodes.length-1,'结案节点后不能再添加节点');return null;}if(n.entryRole==='store')hasStore=true;if(n.type==='branch'){assert(hasStore||n.branches.every(b=>b.fallback||b.judgeBy!=='storeResult'),'门店处理结果条件须在门店首次办理之后');const exits=n.branches.map(b=>contextWalk(b.nodes,hasStore)).filter(v=>v!==null);if(!exits.length){assert(i===nodes.length-1,'所有分支均已结案，后面不能再添加节点');return null;}hasStore=exits.every(Boolean);}}return hasStore;}contextWalk(config.nodes);
  }return d;
 }
 return {prepareSettings,handlingTypes,handlingType,handlingNode,sourceTypes,sourceDescriptions,prepareEntry,foldLevels,validEntryNode,entryPath,aftercareNodes,endNode,useRotation,kinds,methods,descriptions,node,prepare,list,all,sourceLabel,validNode,validate};
}
if(typeof module!=='undefined'&&module.exports)module.exports=create;else {root.createTicketFlowConfig=create;if(root.CaseEngine)root.TicketFlowConfig=create(root.CaseEngine.Rules.Flow,root.CaseEngine.STAFF,root.NodeAssignment);}
})(typeof window!=='undefined'?window:globalThis);
