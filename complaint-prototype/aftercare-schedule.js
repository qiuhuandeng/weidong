/* Aftercare shifts and dispatch windows, stored with the shared configuration. */
(function(root){
'use strict';
function create({STAFF,Assignment,Rules}){
 const copy=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m);},DAY=86400000,ZONE=8*3600000;
 const defaults=()=>({version:0,shifts:[{id:'early',name:'早班',start:'09:00',end:'18:00'},{id:'late',name:'晚班',start:'14:00',end:'22:00'}],roster:{},dispatchStart:'09:00'});
 const get=c=>copy(c.aftercareSchedule||defaults()),dateKey=(now=Date.now())=>new Date(now+ZONE).toISOString().slice(0,10);
 const dayStart=day=>Date.parse(day+'T00:00:00+08:00'),addDays=(day,n)=>dateKey(dayStart(day)+n*DAY);
 const isDate=day=>/^\d{4}-\d{2}-\d{2}$/.test(day)&&Number.isFinite(dayStart(day))&&dateKey(dayStart(day))===day;
 const minutes=s=>/^([01]\d|2[0-3]):[0-5]\d$/.test(s)?Number(s.slice(0,2))*60+Number(s.slice(3)):NaN;
 const isAftercare=id=>['售后专员','售后主管'].includes(STAFF.find(p=>p.id===id)?.role);
 function staff(c){
  const config=Assignment.get(c),positionIds=new Set(['aftercare']),personIds=new Set();
  if(config.nodes.contact.source==='position')positionIds.add(config.nodes.contact.position);else if(config.nodes.contact.source==='person')personIds.add(config.nodes.contact.person);
  for(const scene of Rules.sceneList(c)){const n=scene.config.ticketFlow?.nodes.find(n=>n.kind==='sales');if(n?.kind==='sales'&&scene.level!==5){if(n.source==='position')positionIds.add(n.positionId);if(n.source==='person')personIds.add(n.personId);}}
  const positions=config.positions.filter(p=>positionIds.has(p.id));positions.forEach(p=>p.members.forEach(id=>personIds.add(id)));
  const active=new Set(Rules.Flow.organization(c).appointments.filter(a=>a.active).map(a=>a.personId));
  return [...personIds].filter(id=>isAftercare(id)&&active.has(id)).map(id=>({...STAFF.find(p=>p.id===id),positions:positions.filter(p=>p.members.includes(id)).map(p=>p.name)}));
 }
 function interval(schedule,day,id){const shift=schedule.shifts.find(s=>s.id===schedule.roster[day]?.[id]);if(!shift)return null;const start=minutes(shift.start),end=minutes(shift.end);return {day,shift,start:dayStart(day)+start*60000,end:dayStart(day)+(end+(end<start?1440:0))*60000};}
 function duty(c,id,now=Date.now()){
  const schedule=get(c),day=dateKey(now);for(const date of [addDays(day,-1),day]){const row=interval(schedule,date,id);if(row&&now>=row.start&&now<row.end)return row;}return null;
 }
 function canReceive(c,id,now=Date.now()){const row=duty(c,id,now);return !!row&&now>=dayStart(row.day)+minutes(get(c).dispatchStart)*60000;}
 function validate(d){
  assert(Number.isFinite(minutes(d.dispatchStart)),'请选择每日开始派单时间');assert(Array.isArray(d.shifts)&&d.shifts.length>0&&d.shifts.length<=12,'请保留 1 至 12 个班次');
  const ids=new Set(),names=new Set();for(const s of d.shifts){s.name=String(s.name||'').trim();assert(s.id&&s.id!=='rest'&&!ids.has(s.id),'班次标识重复');assert(s.name&&s.name.length<=20&&s.name!=='休息'&&!names.has(s.name),'班次名称须为 1 至 20 字且不能重复');assert(Number.isFinite(minutes(s.start))&&Number.isFinite(minutes(s.end))&&s.start!==s.end,'班次起止时间须有效且不能相同');ids.add(s.id);names.add(s.name);}
  assert(d.roster&&typeof d.roster==='object'&&!Array.isArray(d.roster),'排班数据无效');
  for(const [day,rows] of Object.entries(d.roster)){assert(isDate(day),'排班日期无效');for(const [id,shift] of Object.entries(rows)){assert(STAFF.some(p=>p.id===id)&&isAftercare(id),'仅支持售后人员排班');assert(shift==='rest'||ids.has(shift),'班次已删除，请先调整引用它的排班');const a=interval(d,day,id),b=interval(d,addDays(day,1),id);assert(!a||!b||a.end<=b.start,'相邻日期的班次时间重叠，请调整排班');}}
  return d;
 }
 function save(c,actor,draft,version,now=Date.now()){
  assert(actor==='manager','只有售后主管可以维护排班');assert(get(c).version===version,'排班已被其他页面更新，请重新打开后编辑');
  const d=validate(copy(draft)),next=copy(c);d.version=version+1;d.updatedAt=now;d.updatedBy=actor;next.aftercareSchedule=d;next.revision=(next.revision||0)+1;return next;
 }
 function batch(c,draft,{people,start,end,weekdays,shift}){
  assert(isDate(start)&&isDate(end)&&end>=start&&(dayStart(end)-dayStart(start))/DAY<366,'请选择有效日期范围，最多 366 天');
  const allowed=new Set(staff(c).map(p=>p.id));assert(people.length&&people.every(id=>allowed.has(id)),'请选择有效的售后员工');assert(weekdays.length&&weekdays.every(n=>Number.isInteger(n)&&n>=0&&n<=6),'请至少选择一个星期');
  assert(shift===''||shift==='rest'||draft.shifts.some(s=>s.id===shift),'请选择有效班次');const d=copy(draft);let count=0;
  for(let day=start;day<=end;day=addDays(day,1)){if(!weekdays.includes(new Date(day+'T12:00:00+08:00').getUTCDay()))continue;d.roster[day]??={};for(const id of people){if(shift)d.roster[day][id]=shift;else delete d.roster[day][id];count++;}if(!Object.keys(d.roster[day]).length)delete d.roster[day];}
  assert(count,'所选日期范围内没有匹配的星期');return validate(d);
 }
 return {get,defaults,staff,isAftercare,dateKey,addDays,isDate,dayStart,minutes,interval,duty,canReceive,validate,save,batch};
}
if(typeof module!=='undefined'&&module.exports)module.exports=create;else root.createAftercareSchedule=create;
})(typeof window!=='undefined'?window:globalThis);
