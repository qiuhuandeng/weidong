/* DingTalk template configuration. Credentials and remote transport belong to the server. */
(function(root){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m);};
const uid=()=> 'at-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const config=s=>s.configuration||s, integration=s=>config(s).approvalIntegration;
const field=(id,label,type,source,required=false,children)=>({id,label,type,source,required,...(children?{children}:{})});
const common=[field('ticket','工单编号','text','ticket.id',true),field('customer','客户姓名','text','ticket.customer',true),field('store','所属门店','text','ticket.store',true),field('plan','方案类型','text','solution.type',true),field('reason','处理方案','textarea','solution.content',true)];
const refundRows=[field('project','项目名称','text','row.name',true),field('paid','实付金额','money','row.paid',true),field('amount','本次退款','money','row.amount',true),field('quantity','项目数量','number','row.quantity'),field('refund-store','退款所属门店','text','refund.store'),field('performance','业绩归属人员','text','refund.person')];
const exchangeRows=[field('product','商品名称','text','row.name',true),field('quantity','数量','number','row.quantity',true),field('price','方案单价','money','row.unitPrice',true),field('value','方案价值','money','row.value',true)];
const CATALOG=[
 {processCode:'PROC-COMPLAINT-PAYMENT',name:'客诉付款申请',schemaVersion:1,fields:[...common,field('order','订单编号','text','order.number'),field('refund','退款金额','money','solution.refund'),field('compensation','赔偿金额','money','solution.compensation'),field('total','申请付款金额','money','solution.total',true),field('refund-detail','退款明细','table','refund.items',false,refundRows),field('method','收款方式','select','receipt.method',true),field('payee','收款户名','text','receipt.name',true),field('account','收款账号','text','receipt.account',true),field('bank','开户银行','text','receipt.bank')]},
 {processCode:'PROC-COMPLAINT-PURCHASE',name:'客诉商品采购申请',schemaVersion:1,fields:[...common,field('products','采购商品明细','table','exchange.items',true,exchangeRows),field('exchange-total','商品总价值','money','solution.exchangeValue',true)]}
];
CATALOG[0].fields.find(f=>f.id==='method').options=['银行卡','支付宝','微信'];
const SOURCES=[
 ['ticket.id','工单编号','text','工单信息'],['ticket.title','工单摘要','text','工单信息'],['ticket.customer','客户姓名','text','工单信息'],['ticket.store','所属门店','text','工单信息'],['ticket.level','客诉等级','text','工单信息'],['ticket.source','工单来源','text','工单信息'],
 ['solution.type','方案类型','text','处理方案'],['solution.content','处理方案与依据','textarea','处理方案'],['solution.refund','退款金额','money','处理方案'],['solution.compensation','赔偿金额','money','处理方案'],['solution.total','退款＋赔偿合计','money','处理方案'],['solution.exchangeValue','置换商品总价值','money','处理方案'],
 ['order.number','退款订单编号','text','退款信息'],['refund.store','退款所属门店','text','退款信息'],['refund.person','退款业绩归属人员','text','退款信息'],
 ['receipt.method','收款方式','select','收款信息'],['receipt.name','收款户名','text','收款信息'],['receipt.account','收款账号','text','收款信息'],['receipt.bank','开户银行','text','收款信息'],
 ['refund.items','退款项目明细','table','明细数据'],['exchange.items','置换商品明细','table','明细数据']
].map(([key,label,type,group])=>({key,label,type,group}));
const ROW_SOURCES={
 'refund.items':[['row.name','项目名称','text'],['row.paid','实付金额','money'],['row.amount','本次退款金额','money'],['row.quantity','项目数量','number']],
 'exchange.items':[['row.name','商品名称','text'],['row.quantity','商品数量','number'],['row.unitPrice','商品单价','money'],['row.value','商品金额','money']]
};
const TYPE_LABELS={text:'文本',textarea:'多行文本',number:'数字',money:'金额',select:'单选',table:'明细'};
const STATUS={running:'审批中',approved:'已通过',refused:'已拒绝',terminated:'已撤销',failed:'发起失败',uncertain:'状态待确认'};
function optionsFor(f,parentSource){
 const rows=(ROW_SOURCES[parentSource]||[]).map(([key,label,type])=>({key,label,type,group:'当前明细行'}));
 return [...rows,...SOURCES].filter(s=>f.type==='table'?s.type==='table':f.type==='money'?s.type==='money':f.type==='number'?s.type==='number':f.type==='select'?s.type==='select':s.type!=='table');
}
function defaultMappings(fields){return Object.fromEntries(fields.map(f=>[f.id,{mode:'field',source:f.source,...(f.children?{children:defaultMappings(f.children)}:{})}]));}
function fromCatalog(item,name){return {id:uid(),name,processCode:item.processCode,schemaProcessCode:item.processCode,dingName:item.name,enabled:true,version:1,schemaVersion:item.schemaVersion,fields:clone(item.fields),mappings:defaultMappings(item.fields),updatedAt:Date.parse('2026-10-07T09:00:00+08:00'),syncedAt:Date.parse('2026-10-07T09:00:00+08:00')};}
function ensure(s){
 const c=config(s);let changed=false;
 if(!c.approvalIntegration){const payment=fromCatalog(CATALOG[0],'付款申请'),purchase=fromCatalog(CATALOG[1],'商品采购申请');payment.id='approval-payment';purchase.id='approval-purchase';
  c.approvalIntegration={version:1,revision:0,templates:[payment,purchase],connection:{corpId:'',appKey:'',agentId:'',status:'disconnected',eventStatus:'disconnected'},history:[]};changed=true;
 }
 if(s.tickets&&!s.approvalRecordExamplesVersion){s.approvalRecords??=[];seedRecords(s);s.approvalRecordExamplesVersion=1;changed=true;}return changed;
}
function list(s){return integration(s)?.templates||[];}
function get(s,id){return list(s).find(t=>t.id===id);}
function newTemplate(){return {id:'',name:'',processCode:'',dingName:'',enabled:false,version:0,fields:[],mappings:{},schemaVersion:0,syncedAt:null};}
function issues(t){
 const errors=[];if(!t.name?.trim())errors.push('请填写模板名称');if(!t.processCode?.trim())errors.push('请选择或填写钉钉模板编码');if(!t.fields?.length)errors.push('请先同步钉钉模板字段');
 if(t.fields?.length&&t.schemaProcessCode!==t.processCode)errors.push('模板编码已变更，请重新同步字段');
 function check(fields,mappings,parent){for(const f of fields){const m=mappings?.[f.id],label=parent?parent+' / '+f.label:f.label;if(!TYPE_LABELS[f.type]){errors.push(label+'控件暂不支持');continue;}
   if(!m||m.mode==='skip'){if(f.required)errors.push(label+'为必填字段，请配置关联');continue;}
   if(m.mode==='constant'){if(f.type==='table'){errors.push(label+'须关联明细数据');continue;}if(f.required&&!String(m.value??'').trim())errors.push(label+'请填写固定值');if(['money','number'].includes(f.type)&&(!String(m.value??'').trim()||!Number.isFinite(Number(m.value))))errors.push(label+'固定值须为数字');if(f.type==='select'&&!f.options?.includes(m.value))errors.push(label+'请选择模板中的有效选项');continue;}
   if(!optionsFor(f,parent?.source).some(s=>s.key===m.source)){errors.push(label+'请选择匹配类型的系统字段');continue;}
   if(f.children)check(f.children,m.children,{toString:()=>label,source:m.source});
 }}check(t.fields||[],t.mappings);return errors;
}
function ready(t){return !!t?.enabled&&!issues(t).length;}
function collect(nodes){return (nodes||[]).flatMap(n=>[n,...(n.type==='branch'?n.branches.flatMap(b=>collect(b.nodes)):[])]);}
function references(s,id){return (config(s).ruleScenes||[]).flatMap(r=>collect(r.config.ticketFlow?.nodes).filter(n=>n.type==='approval'&&n.templateId===id).map(n=>({sceneId:r.id,name:r.name,node:n.title,enabled:r.enabled})));}
function checkRevision(s,revision,actor){assert(actor==='manager','只有授权管理员可以维护审批模板');assert(integration(s)?.revision===revision,'审批配置已在其他页面更新，请重新打开后保存');}
function saveTemplate(s,actor,draft,revision,now=Date.now()){
 checkRevision(s,revision,actor);const i=integration(s),t=clone(draft),old=get(s,t.id);t.name=String(t.name||'').trim();t.processCode=String(t.processCode||'').trim();
 assert(t.name&&t.name.length<=40,'模板名称须为 1 至 40 字');assert(!list(s).some(x=>x.id!==t.id&&x.name===t.name),'模板名称已存在');assert(!t.id||old,'审批模板不存在');
 const errors=issues(t);if(t.enabled)assert(!errors.length,errors[0]);
 if(old?.enabled&&!t.enabled)assert(!references(s,t.id).some(r=>r.enabled),'该模板仍被启用规则引用，请先更换流程中的关联模板');
 if(old&&references(s,t.id).some(r=>r.enabled))assert(t.processCode===old.processCode,'该模板已被启用规则引用，请新增模板后在流程中替换');
 t.id=t.id||uid();t.version=(old?.version||0)+1;t.updatedAt=now;t.updatedBy=actor;delete t.secret;
 if(old)i.templates[i.templates.indexOf(old)]=t;else i.templates.push(t);i.revision++;i.history.unshift({at:now,actor,templateId:t.id,before:old?clone(old):null,after:clone(t)});return t;
}
function loadSchema(t,item){
 assert(item?.fields?.length,'该模板暂未取得字段信息');const old=t.mappings||{},next={};
 for(const f of item.fields){const previous=t.fields?.find(x=>x.id===f.id);next[f.id]=previous?.type===f.type&&old[f.id]?clone(old[f.id]):defaultMappings([f])[f.id];
  if(f.children){const previousChildren=next[f.id].children||{};next[f.id].children=Object.fromEntries(f.children.map(child=>[child.id,previousChildren[child.id]||defaultMappings([child])[child.id]]));}}
 t.processCode=item.processCode;t.schemaProcessCode=item.processCode;t.dingName=item.name;t.fields=clone(item.fields);t.mappings=next;t.schemaVersion=item.schemaVersion||1;t.syncedAt=Date.now();return t;
}
function value(key,t,row){const p=t.proposal||{},payout=p.payout||{};const values={
 'ticket.id':t.id,'ticket.title':t.title,'ticket.customer':t.name,'ticket.store':t.store,'ticket.level':t.level?['','一级','二级','三级','四级','五级'][t.level]:'待定级','ticket.source':t.channel,
 'solution.type':p.type,'solution.content':p.content+(p.procurementNote?'\n采购调整：'+p.procurementNote:''),'solution.refund':(p.refund||0)/100,'solution.compensation':(p.compensation||0)/100,'solution.total':((p.refund||0)+(p.compensation||0))/100,'solution.exchangeValue':(p.exchangeValue||0)/100,
 'order.number':p.refundOrderNo||t.order,'refund.store':p.refundStore,'refund.person':p.performanceName||root.Engine?.user(p.performanceId)?.name||p.performanceId,
 'receipt.method':({bank:'银行卡',alipay:'支付宝',wechat:'微信'})[payout.method]||payout.method,'receipt.name':payout.name,'receipt.account':payout.account,'receipt.bank':payout.bank,
 'refund.items':p.refundItems||[],'exchange.items':p.exchangeItems||[]
 };if(key?.startsWith('row.')){const k=key.slice(4),v=row?.[k];return ['paid','amount','unitPrice','value'].includes(k)?(v==null?'':v/100):v;}return values[key];}
function preview(template,t){
 const errors=issues(template);assert(!errors.length,errors[0]);assert(t?.proposal,'请选择已有处理方案的工单');
 const missing=[];function render(fields,mappings,row,parent=''){return fields.flatMap(f=>{const m=mappings?.[f.id];if(!m||m.mode==='skip')return [];
  const v=m.mode==='constant'?m.value:value(m.source,t,row),label=parent?parent+' / '+f.label:f.label;
  if(f.required&&(v==null||v===''||Array.isArray(v)&&!v.length))missing.push(label);
  if(f.type==='table')return [{id:f.id,label:f.label,type:f.type,columns:f.children.map(c=>({id:c.id,label:c.label,type:c.type})),rows:(Array.isArray(v)?v:[]).map(r=>render(f.children,m.children,r,label))}];
  if(f.type==='select'&&v&&!f.options.includes(v))missing.push(label+'选项不匹配');return [{id:f.id,label:f.label,type:f.type,value:v??''}];
 });}const fields=render(template.fields,template.mappings);return {fields,missing:[...new Set(missing)],ticketId:t.id,proposalVersion:t.proposal.version,templateVersion:template.version};
}
function validateNode(n,s){assert(n.title?.trim()&&n.title.length<=40,'节点名称须为 1 至 40 字');const hours=n.handling?.hours;assert(hours!==''&&Number.isFinite(Number(hours))&&Number(hours)>=0.25&&Number(hours)<=720,'办理时效须为 0.25 至 720 小时');assert(n.templateId,'请选择关联审批模板');const t=get(s,n.templateId);assert(ready(t),'关联审批模板已停用或配置不完整，请重新选择');n.handling={hours:Number(hours)};n.templateName=t.name;return n;}
function seedRecords(s){
 const payment=get(s,'approval-payment'),purchase=get(s,'approval-purchase'),base=Date.parse('2026-10-07T14:00:00+08:00');
 const samples=[['running','付款审批','P40',payment,['陆清','孙琳']],['approved','付款审批','P41',payment,[]],['running','采购审批','P41',purchase,['顾宁']],['refused','付款审批','P40',payment,[]],['terminated','采购审批','P41',purchase,[]],['failed','付款审批','P40',payment,[]]];
 samples.forEach(([status,name,suffix,tpl,people],idx)=>{const ticket=s.tickets.find(t=>t.id==='KS20261007-'+suffix)||s.tickets.find(t=>t.proposal&&(!name.includes('采购')||t.proposal.exchangeItems?.length));if(!ticket)return;let snapshot;try{snapshot=preview(tpl,ticket);}catch{return;}
  const at=base-idx*3600000,end=['approved','refused','terminated'].includes(status)?at+1800000:null;
  s.approvalRecords.push({id:'approval-record-'+(idx+1),templateId:tpl.id,templateName:tpl.name,templateVersion:tpl.version,processCode:tpl.processCode,name,ticketId:ticket.id,customer:ticket.name,proposalVersion:ticket.proposal.version||1,round:idx>2?1:2,status,people,initiator:'许宁',at,finishedAt:end,instanceId:status==='failed'?'':'DD20261007-'+String(idx+1).padStart(4,'0'),url:'',snapshot:clone(snapshot),syncStatus:idx===2?'pending':'ok',syncedAt:at+1800000,
   error:status==='failed'?'发起人未关联有效的钉钉账号':'',reason:status==='refused'?'请补充退款项目对应的金额依据。':status==='terminated'?'商品规格需要调整，撤销后重新申请。':'',
   events:status==='failed'?[{title:'发起失败',actor:'系统',at,note:'发起人未关联有效的钉钉账号'}]:[{title:'发起审批',actor:'许宁',at,note:tpl.name},...(status==='running'?[{title:name.includes('采购')?'采购负责人审批':'财务负责人审批',actor:people.join('、'),at:at+60000,status:'审批中',note:''}]:[{title:status==='approved'?'审批通过':status==='refused'?'审批拒绝':'审批撤销',actor:status==='terminated'?'许宁':'陆清',at:end,note:status==='refused'?'请补充退款项目对应的金额依据。':status==='terminated'?'商品规格需要调整，撤销后重新申请。':'同意'}])]
  });});
}
const API={clone,uid,config,integration,CATALOG,SOURCES,TYPE_LABELS,STATUS,ROW_SOURCES,ensure,list,get,newTemplate,issues,ready,optionsFor,defaultMappings,references,saveTemplate,loadSchema,value,preview,validateNode};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ApprovalTemplates=API;
})(typeof window!=='undefined'?window:globalThis);
