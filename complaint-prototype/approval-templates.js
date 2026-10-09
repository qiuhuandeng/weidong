/* DingTalk template configuration. Credentials and remote transport belong to the server. */
(function(root){
'use strict';
const Methods=typeof module!=='undefined'&&module.exports?require('./solution-methods.js'):root.SolutionMethods;
const clone=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m);};
const uid=()=> 'at-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
const config=s=>s.configuration||s, integration=s=>config(s).approvalIntegration;
const field=(id,label,type,source,required=false,children)=>({id,label,type,source,required,...(children?{children}:{})});
const common=[field('ticket','工单编号','text','ticket.id',true),field('customer','客户姓名','text','ticket.customer',true),field('store','所属门店','text','ticket.store',true),field('plan','处理方式','text','solution.type',true),field('reason','处理方案','textarea','solution.content',true)];
const refundRows=[field('project','项目名称','text','row.name',true),field('paid','实付金额','money','row.paid',true),field('amount','本次退款','money','row.amount',true),field('quantity','项目数量','number','row.quantity'),field('refund-store','退款所属门店','text','refund.store'),field('performance','业绩归属人员','text','refund.person')];
const exchangeRows=[field('product','商品名称','text','row.name',true),field('quantity','数量','number','row.quantity',true),field('price','方案单价','money','row.unitPrice',true),field('value','方案价值','money','row.value',true)];
const LEGACY_CATALOG=[
 {processCode:'PROC-COMPLAINT-PAYMENT',name:'客诉付款申请',schemaVersion:1,fields:[...common,field('order','订单编号','text','order.number'),field('refund','退款金额','money','solution.refund'),field('compensation','赔偿金额','money','solution.compensation'),field('total','申请付款金额','money','solution.total',true),field('refund-detail','退款明细','table','refund.items',false,refundRows),field('method','收款方式','select','receipt.method',true),field('payee','收款户名','text','receipt.name',true),field('account','收款账号','text','receipt.account',true),field('bank','开户银行','text','receipt.bank')]},
 {processCode:'PROC-COMPLAINT-PURCHASE',name:'客诉商品采购申请',schemaVersion:1,fields:[...common,field('products','采购商品明细','table','exchange.items',true,exchangeRows),field('exchange-total','商品总价值','money','solution.exchangeValue',true)]}
];
LEGACY_CATALOG[0].fields.find(f=>f.id==='method').options=['银行卡','支付宝','微信'];
// Field titles follow the two supplied printed forms. Widget IDs are local prototype IDs.
const CATALOG=[
 {processCode:'PROC-COMPLAINT-PAYMENT',name:'市场客户退款（赔款）申请',approvalType:'payment',schemaVersion:3,fields:[
  field('category','客诉类别','text','ticket.category'),field('related','关联审批单','approval','ticket.relatedApproval'),field('ticket','客户ID号','text','ticket.customerId',true),
  field('reason','客户消费情况与诉求','textarea','solution.customerContext',true),field('classification','退赔分类','text','solution.repaymentClass'),
  field('project-category','项目类别','text','crm.projectCategory'),field('responsibility','责任人判定','text','ticket.responsibility'),
  field('services','客户所购服务项目','textarea','crm.services'),field('deposit-date','客户定金缴纳日期','date','crm.depositAt'),field('visit-date','客户进店消费日期','date','crm.consumedAt'),
  field('purchased-products','客户所购买产品','textarea','crm.products'),{id:'instruction',label:'说明',type:'note',required:false,defaultValue:'以下为最终申请退赔客户信息'},
  field('expense','支出类别','text','solution.expenseType'),field('total','付款金额（元）','money','solution.total',true),field('amount-words','大写','text','solution.amountWords'),
  field('tax','税额（元）','money','finance.tax'),field('invoice','发票','file','finance.invoice'),field('finance-files','附件','file','finance.attachments'),
  field('remark','备注','textarea','solution.reasonNotes'),field('store','项目','text','refund.store'),field('account','收款账户','textarea','receipt.fullAccount',true),
  field('images','图片','image','solution.images'),field('attachments','附件','file','solution.attachments'),field('department','所在部门','text','applicant.department')
 ]},
 {processCode:'PROC-COMPLAINT-PURCHASE',name:'门店赠送或店耗申请',approvalType:'purchase',schemaVersion:3,fields:[
  field('store','店铺名称','text','ticket.store',true),field('reason','申请原因','textarea','solution.content',true),
  {id:'application-type',label:'申请类型',type:'text',required:true,defaultValue:'店耗'},
  field('products','赠品品名','textarea','exchange.names',true),field('quantity','数量','textarea','exchange.quantities',true),
  field('customer','客户姓名','text','ticket.customer',true),field('member','会员号','text','ticket.member',true),
  {id:'instruction',label:'说明',type:'note',required:false,defaultValue:'提示：上传客户消费页面截图及回访备注赠送原因、品名、数量'},
  field('images','图片','image','solution.images'),field('department','所在部门','text','applicant.department')
 ]}
];
const APPROVAL_TYPES={payment:'退款赔款申请',purchase:'商品赠送或店耗申请'};
const SOURCES=[
 ['ticket.relatedApproval','关联审批单','approval','审批信息'],['solution.amountWords','付款金额大写','text','处理方案'],['applicant.department','发起人所在部门','text','审批信息'],
 ['ticket.customerId','客户ID号','text','客户资料'],['ticket.member','会员号','text','客户资料'],['ticket.category','客诉类别','text','工单信息'],['ticket.responsibility','责任人判定','text','工单信息'],
 ['solution.customerContext','客户消费情况与诉求','textarea','处理方案'],['solution.repaymentClass','退赔分类','text','处理方案'],['solution.expenseType','支出类别','text','处理方案'],['solution.reasonNotes','退款赔偿原因备注','textarea','处理方案'],
 ['crm.projectCategory','项目类别','text','客户资料'],['crm.services','客户所购服务项目','textarea','客户资料'],['crm.depositAt','客户定金缴纳日期','date','客户资料'],['crm.consumedAt','客户进店消费日期','date','客户资料'],['crm.products','客户所购买产品','textarea','客户资料'],
 ['finance.tax','税额','money','财务资料'],['finance.invoice','发票','file','财务资料'],['finance.attachments','财务附件','file','财务资料'],['receipt.fullAccount','收款账户','textarea','收款信息'],
 ['solution.images','方案图片','image','方案附件'],['solution.attachments','方案附件','file','方案附件'],['exchange.names','置换商品名称（逐项）','textarea','置换商品'],['exchange.quantities','置换商品数量（逐项）','textarea','置换商品'],
 ['ticket.id','工单编号','text','工单信息'],['ticket.title','工单摘要','text','工单信息'],['ticket.customer','客户姓名','text','工单信息'],['ticket.store','所属门店','text','工单信息'],['ticket.level','客诉等级','text','工单信息'],['ticket.source','工单来源','text','工单信息'],
 ['solution.type','处理方式','text','处理方案'],['solution.content','处理方案与依据','textarea','处理方案'],['solution.refund','退款金额','money','处理方案'],['solution.compensation','赔偿金额','money','处理方案'],['solution.total','退款＋赔偿合计','money','处理方案'],['solution.exchangeValue','置换商品总价值','money','处理方案'],
 ['order.number','退款订单编号','text','退款信息'],['refund.store','退款所属门店','text','退款信息'],['refund.person','退款业绩归属人员','text','退款信息'],
 ['receipt.method','收款方式','select','收款信息'],['receipt.name','收款户名','text','收款信息'],['receipt.account','收款账号','text','收款信息'],['receipt.bank','开户银行','text','收款信息'],
 ['refund.items','退款项目明细','table','明细数据'],['exchange.items','置换商品明细','table','明细数据']
].map(([key,label,type,group])=>({key,label,type,group}));
const ROW_SOURCES={
 'refund.items':[['row.name','项目名称','text'],['row.paid','实付金额','money'],['row.amount','本次退款金额','money'],['row.quantity','项目数量','number']],
 'exchange.items':[['row.name','商品名称','text'],['row.quantity','商品数量','number'],['row.unitPrice','商品单价','money'],['row.value','商品金额','money']]
};
const TYPE_LABELS={text:'文本',textarea:'多行文本',number:'数字',money:'金额',select:'单选',table:'明细',date:'日期',file:'附件',image:'图片',note:'说明',approval:'关联审批单'};
const STATUS={running:'审批中',approved:'已通过',refused:'已拒绝',terminated:'已撤销',failed:'发起失败',uncertain:'状态待确认'};
function optionsFor(f,parentSource){
 const rows=(ROW_SOURCES[parentSource]||[]).map(([key,label,type])=>({key,label,type,group:'当前明细行'}));
 return [...rows,...SOURCES].filter(s=>f.type==='table'?s.type==='table':f.type==='money'?s.type==='money':f.type==='number'?s.type==='number':f.type==='select'?s.type==='select':['file','image','date','approval'].includes(f.type)?s.type===f.type:!['table','file','image','approval'].includes(s.type));
}
function defaultMappings(fields){return Object.fromEntries(fields.map(f=>[f.id,{...(Object.hasOwn(f,'defaultValue')?{mode:'constant',value:f.defaultValue}:{mode:'field',source:f.source}),...(f.children?{children:defaultMappings(f.children)}:{})}]));}
function fromCatalog(item,name){return {id:uid(),name,processCode:item.processCode,schemaProcessCode:item.processCode,dingName:item.name,enabled:true,version:1,schemaVersion:item.schemaVersion,approvalType:item.approvalType,fields:clone(item.fields),mappings:defaultMappings(item.fields),updatedAt:Date.parse('2026-10-07T09:00:00+08:00'),syncedAt:Date.parse('2026-10-07T09:00:00+08:00')};}
function ensure(s){
 const c=config(s);let changed=false;
 if(!c.approvalIntegration){const payment=fromCatalog(CATALOG[0],'付款申请'),purchase=fromCatalog(CATALOG[1],'商品赠送或店耗申请');payment.id='approval-payment';purchase.id='approval-purchase';
  c.approvalIntegration={version:1,revision:0,templates:[payment,purchase],connection:{corpId:'',appKey:'',agentId:'',status:'disconnected',eventStatus:'disconnected'},history:[]};changed=true;
 }
 for(const t of c.approvalIntegration.templates){
  const item=CATALOG.find(x=>x.processCode===t.processCode);if(!t.approvalType&&item){t.approvalType=item.approvalType;changed=true;}
  const legacy=LEGACY_CATALOG.find(x=>x.processCode===t.processCode);
  if(['approval-payment','approval-purchase'].includes(t.id)&&t.schemaVersion===1&&legacy&&JSON.stringify(t.fields.map(f=>f.id))===JSON.stringify(legacy.fields.map(f=>f.id))){
   c.approvalIntegration.referenceTemplateBackup??={};c.approvalIntegration.referenceTemplateBackup[t.id]??=clone(t);
   // New reference fields receive their matching sources; retain administrator constants by shared ID.
   const previousDefaults=defaultMappings(legacy.fields),constants=Object.entries(t.mappings||{}).filter(([id,m])=>JSON.stringify(m)!==JSON.stringify(previousDefaults[id]));
   t.fields=clone(item.fields);t.mappings=defaultMappings(item.fields);for(const [id,m] of constants)if(t.mappings[id]&&item.fields.find(f=>f.id===id)?.type===legacy.fields.find(f=>f.id===id)?.type)t.mappings[id]=clone(m);
   t.schemaVersion=3;t.schemaProcessCode=t.processCode;t.dingName=item.name;t.version++;t.updatedAt=Date.now();t.syncedAt=t.updatedAt;
   if(t.name==='商品采购申请')t.name='商品赠送或店耗申请';changed=true;
  }
  if(['approval-payment','approval-purchase'].includes(t.id)&&t.schemaVersion===2&&item){
   const old=new Map(t.fields.map(f=>[f.id,f]));t.fields=[...item.fields.map(f=>old.get(f.id)||clone(f)),...t.fields.filter(f=>!item.fields.some(x=>x.id===f.id))];
   for(const f of t.fields)if(!t.mappings[f.id])t.mappings[f.id]=defaultMappings([f])[f.id];t.schemaVersion=3;changed=true;
  }
  for(const f of t.fields||[])if(f.id==='plan'&&f.label==='方案类型'&&f.source==='solution.type'){f.label='处理方式';changed=true;}
 }
 if(s.tickets&&!s.approvalRecordExamplesVersion){s.approvalRecords??=[];seedRecords(s);s.approvalRecordExamplesVersion=1;changed=true;}return changed;
}
function list(s){return integration(s)?.templates||[];}
function get(s,id){return list(s).find(t=>t.id===id);}
function newTemplate(){return {id:'',name:'',processCode:'',dingName:'',enabled:false,version:0,fields:[],mappings:{},approvalType:'',schemaVersion:0,syncedAt:null};}
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
 t.processCode=item.processCode;t.schemaProcessCode=item.processCode;t.dingName=item.name;t.fields=clone(item.fields);t.mappings=next;t.approvalType=item.approvalType||t.approvalType;t.schemaVersion=item.schemaVersion||1;t.syncedAt=Date.now();return t;
}
const tagFor=key=>'$'+String(key).replaceAll('.','_');
function sourceForTag(tag){return [...SOURCES,...Object.values(ROW_SOURCES).flat().map(([key,label,type])=>({key,label,type}))].find(s=>tagFor(s.key)===tag)?.key;}
function templateContent(t){
 const rows=(fields,mappings)=>fields.map(f=>{const m=mappings?.[f.id]||{};return {id:f.id,label:f.label,type:f.type,...(f.required?{required:true}:{}),...(f.options?{options:f.options}:{}),value:m.mode==='skip'?null:m.mode==='constant'?m.value??'':m.source?tagFor(m.source):'',...(f.children?{children:rows(f.children,m.children)}:{})};});
 return JSON.stringify({name:t.dingName||t.name,fields:rows(t.fields||[],t.mappings)},null,2);
}
function applyContent(t,text){
 let doc;try{doc=JSON.parse(text);}catch{throw Error('模板内容不是有效的 JSON，请检查格式');}
 assert(Array.isArray(doc?.fields)&&doc.fields.length,'模板内容须包含 fields 字段列表');
 function parse(rows){const ids=new Set(),fields=[],mappings={};for(const row of rows){
  assert(row&&typeof row.id==='string'&&/^[a-zA-Z0-9_-]+$/.test(row.id)&&!ids.has(row.id),'字段标识不能为空或重复');ids.add(row.id);
  assert(typeof row.label==='string'&&row.label.trim(),'请填写字段标题');assert(TYPE_LABELS[row.type],'字段类型不支持：'+row.label);
  const f={id:row.id,label:row.label.trim(),type:row.type,required:row.required===true};if(row.type==='select'){assert(Array.isArray(row.options),'单选字段须包含 options');f.options=row.options.map(String);}
  const val=row.value;let m;if(val===null)m={mode:'skip'};else if(typeof val==='string'&&val.startsWith('$')){const source=sourceForTag(val);assert(source,'未找到系统标签：'+val);f.source=source;m={mode:'field',source};}else{assert(val==null||['string','number','boolean'].includes(typeof val),'固定值须为文本或数字：'+f.label);m={mode:'constant',value:val??''};}
  if(f.type==='table'){assert(Array.isArray(row.children)&&row.children.length,'明细字段须包含 children');const child=parse(row.children);f.children=child.fields;m.children=child.mappings;}
  fields.push(f);mappings[f.id]=m;
 }return {fields,mappings};}
 const result=parse(doc.fields);t.fields=result.fields;t.mappings=result.mappings;t.dingName=String(doc.name||t.dingName||t.name);t.schemaProcessCode=t.processCode;t.schemaVersion=Math.max(2,t.schemaVersion||0);return t;
}
function tagsFor(t){
 const keys=new Set();const scan=fields=>{for(const f of fields||[]){if(f.source)keys.add(f.source);if(f.children)scan(f.children);}};scan(CATALOG.find(x=>x.approvalType===t.approvalType)?.fields||t.fields);
 if(t.approvalType==='payment')for(const key of ['solution.refund','solution.compensation','refund.person'])keys.add(key);
 return SOURCES.filter(s=>keys.has(s.key)).map(s=>({...s,tag:tagFor(s.key)}));
}
function amountWords(cents){
 const n=Math.round(Number(cents));if(!Number.isSafeInteger(n)||n<0||n>=1e14)return '';
 const digits='零壹贰叁肆伍陆柒捌玖',units=['','拾','佰','仟'],groups=['','万','亿','万亿'];
 const block=v=>String(v).split('').map((c,i,a)=>c==='0'?'零':digits[Number(c)]+units[a.length-1-i]).join('').replace(/零+/g,'零').replace(/零$/,'');
 let whole=Math.floor(n/100),parts=[],index=0;while(whole){const piece=whole%10000;parts.unshift(piece?block(piece)+groups[index]:'零');whole=Math.floor(whole/10000);if(piece&&piece<1000&&whole)parts.unshift('零');index++;}
 const yuan=(parts.join('').replace(/零+/g,'零').replace(/零$/,'')||'零')+'元',jiao=Math.floor(n%100/10),fen=n%10;
 return yuan+(jiao?digits[jiao]+'角':fen?'零':'')+(fen?digits[fen]+'分':jiao?'整':'整');
}
function value(key,t,row,state){const p=t.proposal||{},payout=p.payout||{},context=t.approvalContext||{},profile=(state?.crmProfiles||[]).find(x=>t.crmCustomerId?x.id===t.crmCustomerId:t.member&&x.member===t.member),order=(state?.orders||[]).find(o=>o.id===(p.refundOrderId||t.order)),crmOrder=profile?.orders?.find(o=>o.id===(p.refundOrderId||t.order)),refund=Number(p.refund)>0,compensation=Number(p.compensation)>0;
 const services=(crmOrder?.items||order?.items||p.refundItems||[]).map(x=>(x.name||x.project)+' × '+(x.quantity||1)).join('\n')||t.project;
 const notes=[refund&&p.refundReason&&'退款原因：'+p.refundReason,compensation&&p.compensationReason&&'赔款原因：'+p.compensationReason,refund&&compensation&&'退款 '+(p.refund/100).toFixed(2)+' 元；赔款 '+(p.compensation/100).toFixed(2)+' 元'].filter(Boolean).join('\n');
 const values={
 'ticket.relatedApproval':context.relatedApproval||null,'solution.amountWords':amountWords((p.refund||0)+(p.compensation||0)),'applicant.department':context.initiatorDepartment||'市场运营中心-售后服务部',
 'ticket.customerId':t.crmCustomerId||profile?.id||t.member,'ticket.member':t.member||profile?.member,'ticket.category':context.category||t.category,'ticket.responsibility':context.responsibility||t.responsibility,
 'solution.customerContext':[t.description,p.content].filter(Boolean).join('\n'),'solution.repaymentClass':refund&&compensation?'退款＋赔款':compensation?'赔款（超过总消费金额）':'退款','solution.expenseType':refund&&compensation?'客户退款＋客户赔款':compensation?'客户赔款':'客户退款','solution.reasonNotes':notes,
 'crm.projectCategory':context.projectCategory||order?.projectCategory,'crm.services':services,'crm.depositAt':context.depositAt||crmOrder?.depositAt,'crm.consumedAt':context.consumedAt||crmOrder?.consumedAt,'crm.products':context.purchasedProducts||crmOrder?.purchasedProducts,
 'finance.tax':p.finance?.tax==null?undefined:p.finance.tax/100,'finance.invoice':p.finance?.invoice||[],'finance.attachments':p.finance?.attachments||[],
 'receipt.fullAccount':payout.account&&payout.name?[payout.name,(({bank:payout.bank,alipay:'支付宝',wechat:'微信'})[payout.method]||payout.method),payout.account].filter(Boolean).join(' · '):'',
 'solution.images':(p.attachments||[]).filter(x=>String(x.type||'').startsWith('image/')),'solution.attachments':(p.attachments||[]).filter(x=>!String(x.type||'').startsWith('image/')),
 'exchange.names':(p.exchangeItems||[]).map(x=>x.name).join('\n'),'exchange.quantities':(p.exchangeItems||[]).map(x=>x.quantity).join('\n'),
 'ticket.id':t.id,'ticket.title':t.title,'ticket.customer':t.name,'ticket.store':t.store,'ticket.level':t.level?['','一级','二级','三级','四级','五级'][t.level]:'待定级','ticket.source':t.channel,
 'solution.type':Methods.keyOf(p)?Methods.normalize(p).type:p.type,'solution.content':(p.content||'')+(p.procurementNote?'\n采购调整：'+p.procurementNote:''),'solution.refund':(p.refund||0)/100,'solution.compensation':(p.compensation||0)/100,'solution.total':((p.refund||0)+(p.compensation||0))/100,'solution.exchangeValue':(p.exchangeValue||0)/100,
 'order.number':p.refundOrderNo||t.order,'refund.store':p.refundStore||t.store,'refund.person':p.performanceName||root.Engine?.user(p.performanceId)?.name||p.performanceId,
 'receipt.method':({bank:'银行卡',alipay:'支付宝',wechat:'微信'})[payout.method]||payout.method,'receipt.name':payout.name,'receipt.account':payout.account,'receipt.bank':payout.bank,
 'refund.items':p.refundItems||[],'exchange.items':p.exchangeItems||[]
 };if(key?.startsWith('row.')){const k=key.slice(4),v=row?.[k];return ['paid','amount','unitPrice','value'].includes(k)?(v==null?'':v/100):v;}return values[key];}
function preview(template,t,state){
 const errors=issues(template);assert(!errors.length,errors[0]);assert(t?.proposal,'请选择已有处理方案的工单');
 const missing=[];function render(fields,mappings,row,parent=''){return fields.flatMap(f=>{const m=mappings?.[f.id];if(!m||m.mode==='skip')return [];
  const v=m.mode==='constant'?m.value:value(m.source,t,row,state),label=parent?parent+' / '+f.label:f.label;
  if(f.required&&(v==null||v===''||Array.isArray(v)&&!v.length))missing.push(label);
  if(f.type==='table')return [{id:f.id,label:f.label,type:f.type,columns:f.children.map(c=>({id:c.id,label:c.label,type:c.type})),rows:(Array.isArray(v)?v:[]).map(r=>render(f.children,m.children,r,label))}];
  if(f.type==='select'&&v&&!f.options.includes(v))missing.push(label+'选项不匹配');return [{id:f.id,label:f.label,type:f.type,value:v??''}];
 });}const fields=render(template.fields,template.mappings);return {fields,missing:[...new Set(missing)],ticketId:t.id,proposalVersion:t.proposal.version,templateVersion:template.version};
}
// Adapt saved prototype applications for the current detail layout without rewriting
// their submitted fields, approval events, amounts, people or clocks.
function detailSnapshot(record,t,state){
 const snapshot=record.snapshot,fields=snapshot?.fields||[];
 if(!t||fields.some(f=>['classification','application-type'].includes(f.id)))return snapshot;
 const catalog=CATALOG.find(x=>x.processCode===(record.templateSnapshot?.processCode||record.processCode));
 if(!catalog||!fields.some(f=>f.id==='reason'))return snapshot;
 const saved=id=>fields.find(f=>f.id===id),val=id=>saved(id)?.value;
 const version=record.proposalVersion||snapshot.proposalVersion;
 const original=[...(t.proposalHistory||[]),t.proposal].find(p=>p?.version===version);
 const p=clone(original||{}),view={...t,name:val('customer')||record.customer||t.name,store:val('store')||t.store,proposal:p};
 p.version=version;p.content=val('reason')??p.content;p.procurementNote='';
 for(const key of ['refund','compensation'])if(saved(key))p[key]=Math.round(Number(val(key)||0)*100);
 if(saved('plan'))Object.assign(p,Methods.normalize(val('plan')));
 if(saved('store'))p.refundStore=val('store');
 if(saved('order'))p.refundOrderNo=val('order');
 if(saved('account'))p.payout={method:({'银行卡':'bank','支付宝':'alipay','微信':'wechat'})[val('method')]||val('method'),name:val('payee')||'',account:val('account')||'',bank:val('bank')||''};
 const productRows=saved('products')?.rows;
 if(productRows)p.exchangeItems=productRows.map(row=>{const cell=id=>row.find(c=>c.id===id)?.value;return {name:cell('product'),quantity:Number(cell('quantity')),unitPrice:Math.round(Number(cell('price')||0)*100),value:Math.round(Number(cell('value')||0)*100)};});
 const refundRows=saved('refund-detail')?.rows;
 if(refundRows)p.refundItems=refundRows.map(row=>{const cell=id=>row.find(c=>c.id===id)?.value;return {name:cell('project'),quantity:Number(cell('quantity')||1),paid:Math.round(Number(cell('paid')||0)*100),amount:Math.round(Number(cell('amount')||0)*100)};});
 // Older bundled examples did not store CRM form fields. Reuse their CRM order
 // for dates and keep the missing nonfinancial example values explicit here.
 if(/^KS20261007-[PD]\d+$/.test(t.id)){
  const profile=(state?.crmProfiles||[]).find(x=>x.id===t.crmCustomerId||x.member===t.member),order=profile?.orders?.find(o=>o.id===(p.refundOrderId||t.order)),at=order?.at;
  const day=at?new Date(at).toLocaleDateString('sv-SE'):'',time=at?new Date(at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}):'';
  view.approvalContext={category:'其他',responsibility:'自身',projectCategory:'护理项目',purchasedProducts:'无',...(day?{depositAt:day+' '+time,consumedAt:day}:{}),...(t.approvalContext||{})};
 }
 const template={name:catalog.name,processCode:catalog.processCode,schemaProcessCode:catalog.processCode,version:record.templateVersion||snapshot.templateVersion,fields:catalog.fields,mappings:defaultMappings(catalog.fields)};
 const result=preview(template,view,state);
 if(catalog.approvalType==='payment'&&saved('total')){const total=Number(val('total')||0);result.fields.find(f=>f.id==='total').value=total;result.fields.find(f=>f.id==='amount-words').value=amountWords(Math.round(total*100));}
 return result;
}
function validateNode(n,s){assert(n.title?.trim()&&n.title.length<=40,'节点名称须为 1 至 40 字');const hours=n.handling?.hours;assert(hours!==''&&Number.isFinite(Number(hours))&&Number(hours)>=0.25&&Number(hours)<=720,'办理时效须为 0.25 至 720 小时');assert(n.templateId,'请选择关联审批模板');const t=get(s,n.templateId);assert(ready(t),'关联审批模板已停用或配置不完整，请重新选择');n.handling={hours:Number(hours)};n.templateName=t.name;return n;}
function seedRecords(s){
 const payment=get(s,'approval-payment'),purchase=get(s,'approval-purchase'),base=Date.parse('2026-10-07T14:00:00+08:00');
 const samples=[['running','付款审批','P40',payment,['陆清','孙琳']],['approved','付款审批','P41',payment,[]],['running','采购审批','P41',purchase,['顾宁']],['refused','付款审批','P40',payment,[]],['terminated','采购审批','P41',purchase,[]],['failed','付款审批','P40',payment,[]]];
 samples.forEach(([status,name,suffix,tpl,people],idx)=>{const ticket=s.tickets.find(t=>t.id==='KS20261007-'+suffix)||s.tickets.find(t=>t.proposal&&(!name.includes('采购')||t.proposal.exchangeItems?.length));if(!ticket)return;let snapshot;try{snapshot=preview(tpl,ticket,s);}catch{return;}
  const at=base-idx*3600000,end=['approved','refused','terminated'].includes(status)?at+1800000:null;
  s.approvalRecords.push({id:'approval-record-'+(idx+1),templateId:tpl.id,templateName:tpl.name,templateVersion:tpl.version,processCode:tpl.processCode,name,ticketId:ticket.id,customer:ticket.name,proposalVersion:ticket.proposal.version||1,round:idx>2?1:2,status,people,initiator:'许宁',at,finishedAt:end,instanceId:status==='failed'?'':'DD20261007-'+String(idx+1).padStart(4,'0'),url:'',snapshot:clone(snapshot),syncStatus:idx===2?'pending':'ok',syncedAt:at+1800000,
   error:status==='failed'?'发起人未关联有效的钉钉账号':'',reason:status==='refused'?'请补充退款项目对应的金额依据。':status==='terminated'?'商品规格需要调整，撤销后重新申请。':'',
   events:status==='failed'?[{title:'发起失败',actor:'系统',at,note:'发起人未关联有效的钉钉账号'}]:[{title:'发起审批',actor:'许宁',at,note:tpl.name},...(status==='running'?[{title:name.includes('采购')?'采购负责人审批':'财务负责人审批',actor:people.join('、'),at:at+60000,status:'审批中',note:''}]:[{title:status==='approved'?'审批通过':status==='refused'?'审批拒绝':'审批撤销',actor:status==='terminated'?'许宁':'陆清',at:end,note:status==='refused'?'请补充退款项目对应的金额依据。':status==='terminated'?'商品规格需要调整，撤销后重新申请。':'同意'}])]
  });});
}
const API={clone,uid,config,integration,CATALOG,LEGACY_CATALOG,APPROVAL_TYPES,SOURCES,TYPE_LABELS,STATUS,ROW_SOURCES,ensure,list,get,newTemplate,issues,ready,optionsFor,defaultMappings,amountWords,tagFor,templateContent,applyContent,tagsFor,references,saveTemplate,loadSchema,value,preview,detailSnapshot,validateNode};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.ApprovalTemplates=API;
})(typeof window!=='undefined'?window:globalThis);
