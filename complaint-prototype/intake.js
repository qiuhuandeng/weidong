/* Intake and grading lifecycle; later handling stages retain their current executor. */
(function(root){
'use strict';
function createIntake(E,C,Grading){
 const Sources=typeof module!=='undefined'&&module.exports?require('./ticket-sources.js'):root.TicketSources;
 const assert=(ok,message)=>{if(!ok)throw Error(message);};
 function manager(s){return C.STAFF.find(p=>p.role==='售后主管'&&C.active(s,p.id))?.id||'manager';}
 function canConfirmGrading(s,t,actor){return C.STAFF.some(p=>p.id===actor&&p.role==='售后主管')&&C.active(s,actor)&&E.canView(s,t,actor);}
 function route(s,t){
  const now=Date.now();delete t.pendingAssignment;t.currentAssignee='';t.owner='';
  try{
   C.bind(s,t);t.deadline=t.created+t.flow.doc.totalHours*E.H;t.phase='待首联';t.taskDeadline=null;
   E.log(t,'系统','匹配处理场景',t.flow.name+' · V'+t.flow.version);
   if(E.routeStoreEntry?.(s,t))return true;
   E.dispatchPending(s,now);C.activate(s,t,'contact',now);
   if(t.owner){t.assignedAt=now;t.taskDeadline=now+(t.firstContact?t.flow.doc.stage.process:t.flow.doc.stage.first)*E.H;t.participants=[...new Set([...t.participants,t.owner])];}
   return true;
  }catch(error){
   const dispatcher=manager(s);t.phase='待分派';t.taskDeadline=null;t.currentAssignee=dispatcher;
   t.pendingAssignment={mode:'configuration',dispatcher,reason:error.message};
   t.participants=[...new Set([...t.participants,dispatcher])];E.log(t,'系统','受理待处理',error.message);return false;
  }
 }
 function create(s,actor,data){
  C.initialize(s);const u=E.user(actor),now=Date.now(),o=s.orders.find(o=>o.id===data.order);
  assert(['agent','lead','store','sales'].includes(u?.role),'当前人员不可新增工单');
  assert(data.name?.trim(),'请填写客户姓名');assert(/^1\d{10}$/.test(data.phone),'请输入11位手机号');
  assert(data.title?.trim()&&data.description?.trim(),'请填写投诉摘要和内容');assert(data.store,'请选择门店');
  if(o)assert(o.phone===data.phone,'订单与客户手机号不一致');
  const store=o?.store||data.store;
  if(['store','sales'].includes(u.role))assert(store===u.store,'只能为本店订单发起');
  const related=data.related?s.tickets.find(t=>t.id===data.related):null;
  if(data.related)assert(related&&(related.phone===data.phone||(data.member&&related.member===data.member)),'关联工单不属于同一客户');
  const channel=Sources.normalize(['sales','store'].includes(u.role)?'微动':data.channel);
  const grading=Grading.classify(s.configuration,{title:data.title,description:data.description}),t={
   id:'KS'+new Date(now).toISOString().slice(0,10).replaceAll('-','')+'-'+String(s.sequence++).padStart(3,'0'),
   name:data.name.trim(),phone:data.phone,member:o?.member||data.member||'',isNew:o?.isNew||data.isNew||'待核实',
   store,order:o?.id||'',project:o?.project||data.project||'待核实',amount:o?.paid||0,staff:o?.staff||data.staff||'',
   channel,title:data.title.trim(),description:data.description.trim(),
   level:grading.level,grading,gradeReason:grading.reason,repeat:!!data.repeat,riskAck:!data.repeat&&grading.level<4,
   owner:'',creator:actor,phase:'待定级',created:now,updated:now,deadline:null,taskDeadline:null,
   participants:[actor],sources:[{channel,at:now,content:data.description}],
   logs:[],attachments:data.attachments||[],proposal:null,approval:null,payments:[],related:[],firstContact:null
  };
  E.log(t,actor,'受理工单',t.description);
  E.log(t,'系统',grading.status==='resolved'?'自动定级完成':'待确认客诉等级',grading.reason);
  if(grading.status==='resolved')route(s,t);
  else{t.currentAssignee=manager(s);t.participants=[...new Set([...t.participants,t.currentAssignee])];}
  if(related){related.repeat=true;related.riskAck=false;related.related.push(t.id);t.related.push(related.id);t.repeat=true;t.riskAck=false;E.log(related,actor,'再次投诉关联',t.id);}
  s.tickets.unshift(t);return t;
 }
 function confirmGrading(s,t,actor,level,note){
  assert(t.phase==='待定级'&&t.grading?.status==='review','该工单已完成定级，请刷新后查看');
  assert(canConfirmGrading(s,t,actor),'只有售后经理可以确认客诉等级');
  level=Number(level);assert([1,2,3,4,5].includes(level),'请选择一至五级客诉等级');assert(note?.trim(),'请填写定级依据');
  t.level=level;t.gradeReason='经理确认：'+note.trim();t.riskAck=!t.repeat&&level<4;
  t.grading={...t.grading,status:'confirmed',level,confirmedBy:actor,confirmedAt:Date.now(),confirmation:note.trim()};
  E.log(t,actor,'确认客诉等级',level+'级；'+note.trim());route(s,t);
 }
 function retryIntake(s,t,actor){
  assert(t.phase==='待分派'&&t.pendingAssignment?.mode==='configuration','当前工单无需重新匹配规则');
  assert(canConfirmGrading(s,t,actor),'只有售后经理可以重新匹配规则');route(s,t);
 }
 const previousAssign=E.assign;
 function assign(s,t,actor,person,reason){
  assert(t.phase!=='待定级'&&t.pendingAssignment?.mode!=='configuration','请先完成定级及规则匹配');
  const waiting=t.grading&&t.pendingAssignment?.node==='contact';previousAssign(s,t,actor,person,reason);
  if(waiting&&t.phase!=='待分派'){t.assignedAt=Date.now();t.taskDeadline=t.assignedAt+t.flow.doc.stage.first*E.H;}
 }
 function ensureIntakeExamples(s){
  if(s.intakeExamplesVersion>=1)return false;
  // Build historical intake snapshots separately; never disable the user's live rules.
  const fixture=E.clone(s);fixture.tickets=[];fixture.configuration.aiGrading=Grading.get({});
  fixture.configuration.ruleScenes=C.Rules.sceneList(fixture.configuration).map(scene=>({...scene,enabled:scene.level===5?false:scene.enabled}));
  const examples=[
   {id:'KS20261007-G01',name:'陈女士',phone:'13800002081',store:'上海徐汇店',channel:'400电话',title:'护理后不适，待核实具体情况',description:'客户反映护理后皮肤出现短暂泛红，尚未提供持续时间、照片及检查资料，希望工作人员进一步联系核实，具体处理要求尚未明确。'},
   {id:'KS20261007-R01',name:'刘女士',phone:'13800002082',store:'上海徐汇店',channel:'微动',title:'警方到店协调纠纷，待匹配处理规则',description:'客户因护理纠纷在门店争执，警方到店协助协调，门店负责人请求售后经理尽快介入处理。'}
  ];
  const added=[];
  for(const data of examples){
   if(s.tickets.some(t=>t.id===data.id))continue;
   const t=create(fixture,'intake',data);t.id=data.id;
   if(t.pendingAssignment?.mode==='configuration'){
    t.pendingAssignment.reason='受理时未找到启用的五级处理规则，请核对当前配置后重新匹配';
    t.logs.find(l=>l.title==='受理待处理').body=t.pendingAssignment.reason;
   }
   added.push(t);
  }
  s.tickets.unshift(...added);s.intakeExamplesVersion=1;return true;
 }
 return {create,confirmGrading,retryIntake,canConfirmGrading,assign,ensureIntakeExamples};
}
if(typeof module!=='undefined'&&module.exports)module.exports=createIntake;else root.createComplaintIntake=createIntake;
})(typeof window!=='undefined'?window:globalThis);
