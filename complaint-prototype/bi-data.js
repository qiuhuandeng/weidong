/* National BI demonstration model. Pure read-only analytics; never uses the operational store. */
(function(root){
'use strict';
const H=3600000,D=24*H,START=Date.parse('2026-07-25T00:00:00+08:00'),END=Date.parse('2026-10-08T00:00:00+08:00')-1;
const SOURCES=['400电话','经理热线','微动','小程序','企微'];
const REASONS=['服务效果未达预期','服务态度与沟通','退款与费用争议','预约与履约','产品使用反馈','操作规范'];
const STAGES=['等待派单','门店办理','售后办理','方案审批','付款办理','采购办理','客服结案'];
const EFFICIENCY_TARGET=95; // Prototype target; replace with the approved business rule.
const COLORS=['#3478f6','#20a59a','#8d78d1','#efa34a'];
const structure=[['华东大区',['沪苏区域','浙江区域','安徽区域'],[['上海徐汇','上海静安','南京新街口','苏州中心'],['杭州湖滨','杭州滨江','宁波天一','温州鹿城'],['合肥政务','合肥包河','芜湖镜湖','蚌埠万达']]],['华南大区',['广东区域','福建区域','湘赣区域'],[['广州天河','深圳南山','佛山千灯湖','东莞东城'],['福州鼓楼','厦门思明','泉州丰泽','漳州龙文'],['长沙五一','株洲天元','南昌红谷滩','赣州章贡']]],['华北大区',['京津区域','山东区域','豫冀区域'],[['北京朝阳','北京海淀','天津和平','天津南开'],['济南历下','青岛市南','烟台芝罘','潍坊奎文'],['郑州金水','洛阳西工','石家庄长安','保定竞秀']]],['华西大区',['川渝区域','云贵区域','陕西区域'],[['成都春熙','成都高新','重庆观音桥','重庆渝中'],['昆明盘龙','昆明五华','贵阳南明','贵阳观山湖'],['西安高新','西安雁塔','咸阳秦都','宝鸡渭滨']]]];
const stores=structure.flatMap(([district,regions,names],di)=>regions.flatMap((region,ri)=>names[ri].map((name,si)=>({id:`s${di}${ri}${si}`,name:name+'店',district,region,di,ri,si,color:COLORS[di]}))));
let seed=817;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
const choose=a=>a[Math.floor(random()*a.length)];const round=n=>Math.round(n*10)/10;
const date=n=>new Date(n+8*H).toISOString().slice(0,10);
const parse=s=>Date.parse(s+'T00:00:00+08:00');
const personnel={门店办理:['王敏','李晓','张敏','周妍'],售后办理:['陈悦','周宁','许宁','赵晴','蒋琴','林岚'],方案审批:['陆清','顾岚','沈青','陈卓'],付款办理:['孙琳','陆清'],采购办理:['顾欣','吴静'],客服结案:['陈悦','周宁','许宁','赵晴']};
const department={等待派单:'派单队列',门店办理:'门店运营',售后办理:'售后服务部',方案审批:'审批中心',付款办理:'财务部',采购办理:'采购部',客服结案:'售后服务部'};
const tickets=[],services=[];let seq=0;
for(let day=START;day<END;day+=D){for(const store of stores){
 const service=Math.round(165+random()*170+store.si*12);services.push({store:store.id,day,count:service});
 const risk=(store.di===0&&store.ri===0?1.85:store.di===3?1.25:1)+(day>parse('2026-09-18')&&store.di===0?0.25:0);
 const expected=service*(2.65+store.ri*.18)*risk/1000,count=Math.floor(expected)+(random()<expected%1?1:0);
 for(let j=0;j<count;j++){
  const created=day+(9+random()*12)*H,channel=choose(SOURCES),level=choose([1,1,2,2,2,3,3,4,5]),repeat=random()<.13;
  const reason=choose(store.di===0&&store.ri===0?[REASONS[0],REASONS[0],REASONS[2],REASONS[1]]:REASONS);
  const t={id:'BI'+date(day).replaceAll('-','')+String(++seq).padStart(5,'0'),store:store.id,created,channel,level,repeat,reason,project:choose(['面部护理','肌肤修护','身体护理','光电项目','产品零售']),customer:'演示客户 '+String(seq).padStart(4,'0'),isNew:random()<.36,limit:[0,24,48,72,96,120][level]*H,nodes:[],refund:0,compensation:0,closed:null};
  let cursor=created;
  const add=(stage,base,limit)=>{let hours=base*(.35+random()*1.65),pause=0;
   if(stage==='方案审批'&&store.di===0)hours*=1.8;
   if(random()<.065)hours*=4;
   if(stage==='售后办理'&&random()<.1){pause=(8+random()*38)*H;hours+=pause/H;}
   if(stage==='售后办理'&&random()<.023)hours+=240+random()*960;
   const name=stage==='等待派单'?'自动派单':choose(personnel[stage]);
   const n={id:t.id+'-'+t.nodes.length,ticketId:t.id,stage,department:department[stage],person:name,personId:stage==='门店办理'?store.id+name:department[stage]+name,started:cursor,ended:cursor+hours*H,limit:limit*H,pause,pauseStart:cursor+Math.min(2,hours/4)*H,returned:stage==='方案审批'&&random()<.12};
   t.nodes.push(n);cursor=n.ended;return n;
  };
  add('等待派单',channel==='微动'?2.5:.45,4);t.assigned=t.nodes[0].ended;t.contact=t.assigned+(.15+random()*3.2)*H;t.firstLimit=2*H;
  let local=false;if(channel!=='微动'){const n=add('门店办理',5,8);t.contact=Math.min(t.contact,n.ended);local=random()<.27;}
  t.localResolved=local;
  if(!local){const n=add('售后办理',8,12);t.contact=Math.min(t.contact,n.ended);
   if(random()<.77){let a=add('方案审批',9,12);if(a.returned){add('售后办理',4,12);add('方案审批',6,12);}
    if(random()<.78){t.refund=choose([0,280,580,980,1580,2980]);t.compensation=choose([0,0,0,100,200,500]);if(t.refund+t.compensation===0)t.refund=580;t.paidAt=add('付款办理',7,12).ended;}
    if(random()<.22)add('采购办理',13,24);
   }
   add('客服结案',3,8);
  }
  t.closed=cursor;tickets.push(t);
 }
}}
const byStore=Object.fromEntries(stores.map(s=>[s.id,s])),byTicket=Object.fromEntries(tickets.map(t=>[t.id,t]));
const pct=(a,b)=>b?a/b*100:null;
const quantile=(a,q)=>{if(!a.length)return null;const sorted=a.slice().sort((a,b)=>a-b);return sorted[Math.max(0,Math.ceil(sorted.length*q)-1)];};
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
function pauseAt(n,end){return Math.max(0,Math.min(n.pause,Math.min(end,n.ended)-n.pauseStart));}
function net(n,end=n.ended){return Math.max(0,Math.min(n.ended,end)-n.started-pauseAt(n,end));}
function inScope(t,f){const s=byStore[t.store];return(!f.district||s.district===f.district)&&(!f.region||s.region===f.region)&&(!f.store||s.id===f.store)&&(!f.level||t.level===Number(f.level))&&(!f.source||t.channel===f.source);}
function scopedStores(f){return stores.filter(s=>(!f.district||s.district===f.district)&&(!f.region||s.region===f.region)&&(!f.store||s.id===f.store));}
function summarize(f){const start=parse(f.start),end=Math.min(parse(f.end)+D-1,END),all=tickets.filter(t=>t.created<=end&&inScope(t,f)),cohort=all.filter(t=>t.created>=start),closed=all.filter(t=>t.closed>=start&&t.closed<=end),open=all.filter(t=>t.closed>end),overdue=open.filter(t=>end-t.created>t.limit),nodes=all.flatMap(t=>t.nodes.filter(n=>n.started<=end));
 const completed=nodes.filter(n=>n.ended>=start&&n.ended<=end),pending=nodes.filter(n=>n.ended>end),approved=completed.filter(n=>n.stage==='方案审批'),observed=all.filter(t=>t.assigned>=start&&t.assigned<=end&&(t.contact<=end||t.assigned+t.firstLimit<=end));
 const ids=new Set(scopedStores(f).map(s=>s.id)),volume=services.filter(s=>ids.has(s.store)&&s.day>=start&&s.day<=end).reduce((v,s)=>v+s.count,0);
 const paid=all.filter(t=>t.paidAt>=start&&t.paidAt<=end),due=all.filter(t=>t.created+t.limit>=start&&t.created+t.limit<=end);
 return {start,end,all,cohort,closed,open,overdue,nodes,completed,pending,approved,observed,volume,rate:volume?cohort.length/volume*1000:null,repeat:pct(cohort.filter(t=>t.repeat).length,cohort.length),first:pct(observed.filter(t=>t.contact<=end&&t.contact-t.assigned<=t.firstLimit).length,observed.length),closure:pct(due.filter(t=>t.closed<=t.created+t.limit).length,due.length),due,approvalMean:mean(approved.map(n=>net(n)/H)),approvalP90:quantile(approved.map(n=>net(n)/H),.9),elapsedMean:mean(closed.map(t=>(t.closed-t.created)/H)),paid,refund:paid.reduce((v,t)=>v+t.refund,0),compensation:paid.reduce((v,t)=>v+t.compensation,0)};
}
function previous(f){const days=(parse(f.end)-parse(f.start))/D+1;return {...f,start:date(parse(f.start)-days*D),end:date(parse(f.start)-D)};}
function groups(f,dimension){let list=dimension==='district'?[...new Set(scopedStores(f).map(s=>s.district))]:dimension==='region'?[...new Set(scopedStores(f).map(s=>s.region))]:scopedStores(f).map(s=>s.id);
 return list.map(key=>({key,name:dimension==='store'?byStore[key].name:key,...summarize({...f,[dimension]:key})}));}
// Only observed suspension before the SLA expires can extend its deadline.
// A later suspension cannot undo an existing breach or move it to another period.
function nodeDeadline(n,end){const base=n.started+n.limit;return base+(n.pauseStart<=base?pauseAt(n,end):0);}
function compliance(nodes,start,end){
 const visible=nodes.filter(n=>n.started<=end),done=visible.filter(n=>n.ended>=start&&n.ended<=end),pending=visible.filter(n=>n.ended>end);
 const due=visible.filter(n=>{const deadline=nodeDeadline(n,end);return deadline>=start&&deadline<=end&&(n.ended<=end||net(n,end)>n.limit);});
 const onTime=due.filter(n=>n.ended<=end&&net(n)<=n.limit),late=due.filter(n=>!(n.ended<=end&&net(n)<=n.limit));
 const overdue=pending.filter(n=>net(n,end)>n.limit),longestOverdue=overdue.length?Math.max(...overdue.map(n=>(net(n,end)-n.limit)/H)):null;
 const longest=overdue.filter(n=>(net(n,end)-n.limit)/H===longestOverdue),timely=pct(onTime.length,due.length),target=EFFICIENCY_TARGET;
 const sample=[...new Map([...due,...done,...pending].map(n=>[n.id,n])).values()];
 const rules=[...new Map(sample.map(n=>[n.stage+'|'+n.limit,{stage:n.stage,limit:n.limit}])).values()];
 return {done,pending,due,onTime,late,overdue,longest,longestOverdue,rules,target,timely,lateRate:pct(late.length,due.length),gap:timely==null?null:timely-target,met:timely==null?null:timely>=target,mean:mean(done.map(n=>net(n)/H)),p90:quantile(done.map(n=>net(n)/H),.9),returned:done.filter(n=>n.returned).length};
}
function efficiency(s,dimension='stage'){
 const nodes=s.nodes.filter(n=>dimension==='stage'||n.stage!=='等待派单'),field=dimension==='person'?'personId':dimension;
 const rows=[...new Set(nodes.map(n=>n[field]))].map(key=>{
  const members=nodes.filter(n=>n[field]===key),sample=members[0],stats=compliance(members,s.start,s.end);
  return {key,name:dimension==='person'?sample.person:key,department:sample.department,store:dimension==='person'&&sample.stage==='门店办理'?byStore[byTicket[sample.ticketId].store].name:'',...stats};
 });
 return rows.filter(r=>r.done.length||r.pending.length||r.due.length);
}
function distribution(rows,key){return [...new Set(rows.map(t=>t[key]))].map(name=>({name,value:rows.filter(t=>t[key]===name).length})).sort((a,b)=>b.value-a.value);}
function trend(f){const start=parse(f.start),end=parse(f.end),span=(end-start)/D+1,size=span>14?Math.ceil(span/10):1,rows=[];const selected=tickets.filter(t=>inScope(t,f)),ids=new Set(scopedStores(f).map(s=>s.id));for(let at=start;at<=end;at+=size*D){const to=Math.min(end+D,at+size*D),count=selected.filter(t=>t.created>=at&&t.created<to).length,service=services.filter(s=>ids.has(s.store)&&s.day>=at&&s.day<to).reduce((v,s)=>v+s.count,0);rows.push({label:date(at).slice(5),full:date(at)+' 至 '+date(to-D),count,rate:service?count/service*1000:0});}return rows;}
function activeNode(t,end){return t.nodes.find(n=>n.started<=end&&n.ended>end);}
// Snapshot-safe ticket lineage: repeated stages remain separate node instances.
function ticketFlow(t,end=END){
 const cutoff=Math.min(end,END);if(t.created>cutoff)return null;
 const occurrences={};
 const nodes=t.nodes.filter(n=>n.started<=cutoff).slice().sort((a,b)=>a.started-b.started).map((n,index)=>{
  const done=n.ended!=null&&n.ended<=cutoff,elapsed=Math.max(0,(done?n.ended:cutoff)-n.started),pause=pauseAt(n,cutoff),effective=elapsed-pause;
  const suspended=!done&&n.pause>0&&cutoff>=n.pauseStart&&cutoff<n.pauseStart+n.pause;
  return {id:n.id,sequence:index+1,stage:n.stage,label:n.stage==='等待派单'?'分派':n.stage,occurrence:occurrences[n.stage]=(occurrences[n.stage]||0)+1,person:n.person,department:n.department,started:n.started,ended:done?n.ended:null,elapsed,pause,effective,limit:n.limit,overdue:effective>n.limit,returned:done&&n.returned,status:done?(n.returned?'已退回':'已完成'):suspended?'已挂起':n.stage==='等待派单'?'待分派':'办理中'};
 });
 const closed=t.closed!=null&&t.closed<=cutoff?t.closed:null,elapsed=(closed??cutoff)-t.created;
 return {ticket:t,cutoff,created:t.created,assigned:t.assigned<=cutoff?t.assigned:null,closed,elapsed,nodes,status:closed!=null?'已结案':nodes.at(-1)?.status==='已挂起'?'已挂起':nodes.at(-1)?.label||'待处理'};
}
function ticketFlows(s){return s.all.filter(t=>t.closed==null||t.closed>=s.start).map(t=>ticketFlow(t,s.end)).sort((a,b)=>b.created-a.created);}
function flowRecords(flow){
 const event=(name,at,sequence,id)=>({id,sequence,stage:name,label:name,occurrence:1,person:'',department:'',started:at,ended:at,elapsed:0,pause:0,effective:0,limit:null,overdue:false,returned:false,status:'已发生',type:'里程碑'});
 return [event('工单创建',flow.created,0,flow.ticket.id+'-created'),...flow.nodes.map(n=>({...n,type:'办理节点'})),...(flow.closed!=null?[event('工单结案',flow.closed,flow.nodes.length+1,flow.ticket.id+'-closed')]:[])];
}
const API={H,D,START,END,SOURCES,REASONS,STAGES,EFFICIENCY_TARGET,COLORS,stores,tickets,services,byStore,byTicket,date,parse,round,pct,quantile,mean,net,pauseAt,nodeDeadline,compliance,inScope,scopedStores,summarize,previous,groups,efficiency,distribution,trend,activeNode,ticketFlow,ticketFlows,flowRecords};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ComplaintBI=API;
})(typeof window!=='undefined'?window:globalThis);
