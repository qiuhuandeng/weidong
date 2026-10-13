(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.GroupTiming=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
const HOUR=3600000,OPEN=['pending','handling','returned'];
const defaults=(overall=false)=>({enabled:!overall,hours:overall?72:24,before:2,remind:true,repeat:24,supervisors:[],escalateAfter:4,returned:'keep'});
// Historical definitions keep their original node deadline and gain no new reminders.
const node=n=>({...defaults(),before:0,remind:false,...n.timing,hours:Number(n.hours??n.timing?.hours??24)});
const overall=t=>({...defaults(true),...t?.settings?.timing});
function validate(p,people,label='审批时限'){
 if(!p.enabled)return true;
 const assert=(v,m)=>{if(!v)throw Error(label+'：'+m);},num=x=>Number.isFinite(Number(x));
 assert(num(p.hours)&&Number(p.hours)>=0.25&&Number(p.hours)<=8760,'时限须为 0.25 至 8760 小时');
 assert(num(p.before)&&Number(p.before)>=0&&Number(p.before)<Number(p.hours),'提前提醒须小于时限，0 表示不提醒');
 assert(num(p.repeat)&&(Number(p.repeat)===0||Number(p.repeat)>=0.25&&Number(p.repeat)<=8760),'重复提醒间隔须为 0 或 0.25 至 8760 小时');
 assert(num(p.escalateAfter)&&Number(p.escalateAfter)>=0&&Number(p.escalateAfter)<=8760,'督办延迟须为 0 至 8760 小时');
 assert(Array.isArray(p.supervisors)&&p.supervisors.every(id=>people.some(p=>p.id===id&&p.active)),'请选择有效督办人');
 assert(['keep','restart'].includes(p.returned),'退回后的计时方式无效');return true;
}
function start(r,now){const p=overall(r.snapshot);if(!p.enabled)return;if(!r.totalStartedAt||p.returned==='restart'){r.totalStartedAt=now;r.totalDueAt=now+Number(p.hours)*HOUR;}}
function activate(t,now){const p=node(t);t.startedAt=now;t.dueAt=p.enabled?now+Number(p.hours)*HOUR:null;}
function overdue(r,now=Date.now()){if(!OPEN.includes(r.status))return false;const t=r.steps.find(t=>t.status==='active');return !!(r.totalDueAt&&r.totalDueAt<=now||t?.dueAt&&t.dueAt<=now);}
function duration(h){return h>=24&&h%24===0?h/24+' 天':h+' 小时';}
function remaining(due,now=Date.now()){if(!due)return '不限时';if(due===now)return '已到期';const round=due<now?Math.floor:Math.ceil,mins=Math.max(1,round(Math.abs(due-now)/60000)),time=mins<60?mins+' 分钟':round(mins/60)+' 小时';return (due<now?'已超时 ':'剩余 ')+time;}
// One delivery per recipient / timer / reminder window, persisted with the request.
// Reopening a prototype sends the currently relevant reminder, not a backlog of old windows.
function pendingNotices(s,now=Date.now()){
 const notices=[];
 for(const r of s.requests){if(!OPEN.includes(r.status))continue;const t=r.steps.find(t=>t.status==='active'),pending=t?t.members.filter(p=>!t.approvals.some(a=>a.person===p)):[],lanes=[];
  if(r.totalDueAt)lanes.push({id:'total-'+r.totalStartedAt,p:overall(r.snapshot),due:r.totalDueAt,label:'整单',recipients:[r.applicant,...pending]});
  if(t?.dueAt)lanes.push({id:t.id,p:node(t),due:t.dueAt,label:t.title,recipients:pending});
  for(const lane of lanes){const {p,due,label}=lane;if(!p.enabled)continue;const elapsed=(now-due)/HOUR;
   const add=(stage,recipients,title,kind)=>{for(const person of new Set(recipients)){if(!s.people.some(p=>p.id===person&&p.active))continue;const key=lane.id+':'+stage+':'+person;if(r.timingSent?.[key])continue;notices.push({id:'timing:'+r.id+':'+key,key,person,request:r.id,title:title+' · '+label+'：'+r.title,kind,at:now,read:false});}};
   if(elapsed<0&&p.before>0&&elapsed>=-p.before)add('before',lane.recipients,'即将到期','timing');
   if(elapsed>=0&&p.remind)add('overdue-'+(p.repeat>0?Math.floor(elapsed/p.repeat):0),lane.recipients,'审批已超时','timing');
   if(elapsed>=Number(p.escalateAfter)&&p.supervisors.length)add('escalation',p.supervisors,'超时督办','timing-escalation');
  }
 }
 return notices;
}
function sweep(s,now=Date.now()){
 const notices=pendingNotices(s,now);for(const n of notices){const r=s.requests.find(r=>r.id===n.request);r.timingSent=r.timingSent||{};r.timingSent[n.key]=now;s.notifications.unshift(n);
  if(n.kind==='timing-escalation'){r.events.push({id:n.id,actor:'system',action:'超时督办',note:'通知 '+(s.people.find(p=>p.id===n.person)?.name||n.person)+' · '+n.title,at:now,round:r.round||1});}
 }return notices.length;
}
return {HOUR,OPEN,defaults,node,overall,validate,start,activate,overdue,duration,remaining,pendingNotices,sweep};
});
