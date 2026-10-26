/* 投诉处理业务移植自 index.html 内嵌 unified-complaints/app.js。
 * UI 仅通过 PCUI 公共组件；数据独立保存，不修改源入口。 */
(function () {
  'use strict';
  // Independent PC records; import the source prototype once when available.
  const KEY = 'weid.pc.complaints.v1';
  const SOURCE_KEY = 'weidong.unified-complaints.v1';
  const TYPES = ['闭店','咨询报价','前端话术','门店环境','门店多收','祛斑反黑','顾客自身','光电操作','脱毛操作','门店服务','医美效果','皮肤效果','脱毛效果','光电效果','广告宣传','前后端服务','仪器资质','产品价格','负面新闻','门店加单','顾客交钱没做','抗衰效果','产品过敏'];
  const LEVELS = ['1级','2级','3级','4级','5级'];
  const LEVEL4_TYPES = ['报警','卫生局','监管局'];
  const level4Type = record => record.level==='4级'&&LEVEL4_TYPES.includes(record.level4Type)?record.level4Type:'';
  const CHANNELS = {'mini':'客户小程序','staff':'移动工作台','wechat':'微信支付'};
  const ACTOR = '林晓（售后客服）';
  const ASSESSMENT_FIELDS=[['department','责任部门'],['type','售后类型'],['responsible','责任人'],['level','客诉等级'],['level4Type','风险类型'],['reason','责任原因']];
  const CONTACT_FIELDS=[['firstContact','客诉第一联系人'],['contactTime','投诉时间'],['complaintStore','投诉门店'],['customerStatement','客户陈述']];
  const RECOGNITION_FIELDS=[...CONTACT_FIELDS,...ASSESSMENT_FIELDS];
  const MULTI_FIELDS=['department','responsible'];
  const multiValues=value=>[...new Set((Array.isArray(value)?value:value?[value]:[]).map(item=>String(item).trim()).filter(Boolean))];
  const valueText=value=>Array.isArray(value)?multiValues(value).join('、'):String(value??'');
  const STATUS_TABS=[['','全部'],['待处理','待处理'],['处理中','处理中'],['已完成','已完成']];
  const HANDLING_PLANS=[['resolved','已解决，立即结案'],['unresolved','未解决，继续沟通']];
  const HANDLING_FILE_TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',pdf:'application/pdf',doc:'application/msword',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xls:'application/vnd.ms-excel',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',mp3:'audio/mpeg',m4a:'audio/mp4',wav:'audio/wav',amr:'audio/amr'};
  const handlingFileType=file=>HANDLING_FILE_TYPES[file.name.split('.').at(-1).toLowerCase()];
  const isAudioFile=file=>String(file.type||'').startsWith('audio/')||String(file.data||'').startsWith('data:audio/');
  function validHandlingFile(file){const expected=handlingFileType(file),actual=(file.type||'').toLowerCase(),aliases={'audio/mp4':['audio/x-m4a','audio/m4a','video/mp4'],'audio/wav':['audio/x-wav','audio/wave','audio/vnd.wave'],'audio/mpeg':['audio/mp3','audio/x-mp3']};return Boolean(expected&&(!actual||actual==='application/octet-stream'||actual===expected||aliases[expected]?.includes(actual)))}
  const planText=value=>HANDLING_PLANS.find(([key])=>key===value)?.[1]||'未填写';
  const validPlan=value=>HANDLING_PLANS.some(([key])=>key===value);
  // Local prototype roster; employment labels are demonstration data, not HR records.
  const EMPLOYEES = ['林晓','李江','陈敏','王珊','周雨','刘静','杨晓燕','吴鲜娇','张婷婷','陈琳','许悦','李婷','陈佳','赵敏','李雯','张宁'].map(name=>({name,employmentStatus:name==='张宁'?'离职':'在职'}));
  const ORDER_KEYWORDS=[['phone','客户手机'],['name','客户姓名'],['customerWechat','客户微信'],['member','会员号'],['id','订单号']];
  const ORDER_DATE_PRESETS=[['lastMonth','上月'],['yesterday','昨天'],['today','今天'],['week','本周'],['month','本月']];
  const clone = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmt = value => value ? String(value).replace('T',' ').slice(0,16) : '未填写';
  const money = value => Number(value).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const paymentMoney = value => value!==null&&value!==undefined&&String(value).trim()!==''&&Number.isFinite(Number(value))?'¥ '+money(value):'—';
  const now = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());
  const iconClose = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18"/></svg>';
  const iconFile = '<svg viewBox="0 0 24 26" aria-hidden="true"><path d="M5 2h9l5 5v17H5zM14 2v6h5M8 13h8M8 17h6"/></svg>';
  const btn = (text,action,extra='',primary=false) => `<button type="button" class="btn${primary?' primary':''}" data-uc="${action}" ${extra}>${text}</button>`;
  const link = (text,action,extra='') => `<button type="button" class="btn text uc-link" data-uc="${action}" ${extra}>${text}</button>`;
  const opt = (items,value,placeholder='全部') => `<option value="">${placeholder}</option>`+items.map(item=>{const [v,t]=Array.isArray(item)?item:[item,item];return `<option value="${esc(v)}"${v===value?' selected':''}>${esc(t)}</option>`}).join('');
  const tag = (text,color='gray') => `<span class="pill ${color}">${esc(text)}</span>`;
  const levelTag = level => level?tag(level,{'1级':'green','2级':'blue','3级':'orange','4级':'red','5级':'red'}[level]||'gray'):'<span class="uc-muted">未定级</span>';
  const complaintTitle = r => ['退款沟通与剩余疗程核实','预约承诺与到店收费不一致','门店操作与服务沟通争议','项目体验与广告宣传不符','疗程效果与退款诉求','项目后皮肤不适需复查','取消预约未及时回复','原门店地址与服务去向核实','光电操作过程不适','预约报价与门店收费不一致','广告疗程内容咨询','因客户自身原因申请处理','闭店后的未完成疗程处理','门店服务沟通不满','线上承诺与门店服务不一致'][Number(r.id)-31001]||r.content.slice(0,36);
  const statusTag = status => `<span class="pill ${{'待处理':'orange','处理中':'blue','已完成':'green'}[status]||'gray'}">${esc(status)}</span>`;
  function wechatStatusTag(status){
    // Older prototype records used 待处理 for a received, ongoing WeChat case.
    const state=status==='待处理'?'处理中':status;
    if(!['处理中','已完成'].includes(state))return `<span>微信工单状态</span>${tag(state||'未返回')}`;
    const icon=state==='已完成'?'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
    return `<span>微信工单状态</span><span class="pill uc-wechat-status ${state==='已完成'?'green':'blue'}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><strong>${state}</strong></span>`;
  }
  const channelTag = channel => tag(CHANNELS[channel],{mini:'blue',staff:'purple',wechat:'green'}[channel]);
  const field = (name,label,control,required=false,help='',full=false) => `<div class="field uc-field${full?' ub-span uc-full':''}" data-field="${name}"><label for="uc-${name}" class="${required?'required':''}">${label}</label>${control}${help?`<div class="uc-help">${help}</div>`:''}<div class="uc-error" id="uc-error-${name}"></div></div>`;
  const input = (name,value='',placeholder='',type='text',extra='') => `<input id="uc-${name}" name="${name}" class="uc-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}>`;
  const select = (name,items,value='',placeholder='全部',extra='') => `<select id="uc-${name}" name="${name}" class="uc-input" ${extra}>${opt(items,value,placeholder)}</select>`;
  const detail = (label,value,full=false,raw=false) => `<div class="uc-detail-field${full?' uc-full':''}"><span class="uc-detail-label">${label}</span><div class="uc-detail-value">${raw?value:esc(value||'未记录')}</div></div>`;
  const section = (title,content,actions='') => `<section class="uc-section"><div class="uc-section-head"><h4>${title}</h4>${actions}</div><div class="uc-section-content">${content}</div></section>`;
  const empty = text => `<div class="uc-empty">${text}</div>`;
  const listValue = value => valueText(value).trim()?esc(valueText(value)):'<span class="uc-muted">—</span>';
  const error = (scope,name,text) => {const el=scope.querySelector(`#uc-error-${name}`);if(el)el.textContent=text;const control=scope.querySelector(`#uc-${name}`)||scope.querySelector(`[name="${name}"]`);if(control){const visible=control.hidden?control.closest('.pc-island')?.querySelector('input:not([hidden]),button,[tabindex="0"]'):control;for(const target of new Set([control,visible].filter(Boolean))){target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby','uc-error-'+name)}}};
  const clearErrors = scope => {scope.querySelectorAll('.uc-error').forEach(e=>e.textContent='');scope.querySelectorAll('[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid'))};

  const customers = [
    ['王秀珍','150****3858','河源源城店','staff','这个顾客想退款，需要售后打电话协助沟通。已做两次项目，补了5800元疗程，顾客不愿继续到店。','2026-10-19 16:23','杨晓燕','待处理','',null],
    ['小海军','136****1211','厦门湖里店','wechat','购买时承诺免费提供扁平疣治疗，到店后告知需要另付费，希望按原承诺提供服务。','2026-10-19 14:37','客户本人','待处理','',null],
    ['付婧','191****8186','上海静安店','mini','门店没有按照顾客要求操作，对沟通过程和服务态度不满意，希望客服协助处理。','2026-10-18 14:10','客户本人','待处理','',null],
    ['李焰','139****2002','厦门思明店','wechat','项目体验与广告介绍不一致，希望退回未消费的费用。','2026-10-18 19:39','客户本人','处理中','推广','广告宣传'],
    ['日暮林间','182****4727','乐山市中店','staff','顾客反馈项目效果不符合预期，希望核对已做项目和剩余疗程后协商退款。','2026-10-19 16:23','吴鲜娇','处理中','门店','皮肤效果'],
    ['张丽华','137****7297','福州台江店','staff','顾客做完项目后反馈皮肤不适，希望售后回电，协助核实操作记录并安排复查。','2026-10-19 16:18','张婷婷','待处理','',null],
    ['陈女士','176****5776','南京建邺店','mini','我想取消预约，一直不回消息。之前已经和邀约人说明原因，希望尽快回复。','2026-10-14 01:46','客户本人','处理中','销售','前端话术'],
    ['邵瑞琴','138****5132','厦门湖里店','wechat','做的项目说第二次可以做，但是找不到地址了，希望联系原门店确认。','2026-10-18 18:37','客户本人','待处理','',null],
    ['祝老师','182****4065','十堰茅箭店','staff','项目报废，申请维护，客户反馈光电操作过程不适，希望核实当日操作老师。','2026-10-19 16:04','朱玲玲','处理中','门店','光电操作'],
    ['陈小悦','186****9108','杭州上城店','mini','交了20元定金，预约前咨询的价格和门店实际报价不同，希望说明收费项目。','2026-10-13 14:20','客户本人','已完成','销售','咨询报价'],
    ['阮淑贞','136****6947','厦门思明店','wechat','对广告中的项目效果有疑问，希望核实疗程内容和宣传依据。','2026-10-18 18:34','客户本人','处理中','推广','广告宣传'],
    ['岑秀清','134****7926','成都百里湿江店','staff','顾客因自身原因无法继续项目，申请核实剩余服务并协商处理。','2026-10-19 16:07','王晓凤','已完成','门店','顾客自身'],
    ['林女士','130****3650','杭州临平店','mini','原门店已搬迁，希望确认新的服务门店，并处理未完成的疗程。','2026-10-14 09:12','客户本人','待处理','',null],
    ['谢国森','180****7661','南京建邺店','wechat','对服务沟通不满意，希望客服尽快联系并协商未消费部分。','2026-10-18 18:12','客户本人','已完成','门店','门店服务'],
    ['鑫鑫航航','183****3898','南昌东湖店','staff','客服承诺的服务内容与到店沟通有差异，需要核对预约微信记录及门店沟通情况。','2026-10-19 16:03','肖玉红','待处理','',null],
    ['刘晴','138****6219','杭州上城店','mini','客户已提出取消预约，但尚未收到明确回复，希望客服协助确认。','2026-10-19 17:10','客户本人','待处理','',null],
    ['周女士','159****3076','苏州姑苏店','staff','客户反馈项目后不适，门店已上报，希望售后协助核实操作过程并安排复查。','2026-10-19 17:05','杨晓燕','待处理','',null],
    ['林小溪','137****9082','厦门思明店','wechat','广告宣传的服务范围与到店说明不一致，希望核对预约承诺并提供解决方案。','2026-10-19 17:00','客户本人','待处理','',null]
  ];
  const orders = customers.flatMap((c,i)=>{
    const makeOrder = suffix => ({id:'2610'+String(190000000000+i*127+suffix),customerId:'C'+i,name:c[0],phone:c[1],member:String(15275350+i*227),customerWechat:'wx_'+String(203150+i),store:c[2],intention:['色斑改善','肤质改善','脱毛','舒缓修护'][i%4],consultant:['陈敏','王珊','周雨'][i%3],receptionSales:['杨晓燕','张婷婷','赵敏'][i%3],project:['S10祛斑护理','光电皮肤管理','冰点脱毛体验','肌肤修护疗程'][i%4],amount:[5800,5000,2980,189,1200,680][i%6],state:'已到店',created:'2026-10-10 10:30',appointment:'2026-10-12 14:00',arrived:'2026-10-12 14:06',inviter:['陈敏','王珊','周雨'][i%3],reception:['刘静','杨晓燕','吴鲜娇'][i%3],operator:['陈琳','许悦','李婷'][i%3],manager:['陈佳','赵敏','李雯'][i%3],maintainers:['陈琳（操作老师）','陈佳（店长）'],bookingWechatId:'wx'+i+(suffix===2?'b':'a'),wechatChoices:[{id:'wx'+i+'a',name:'美丽顾问 · '+['陈敏','王珊','周雨'][i%3],account:'meiye_'+String(1031+i),record:'JW'+(52010+i),added:'2026-10-08 10:25',promoter:['李江','张宁','陈敏'][i%3],source:['抖音 · 皮肤护理','视频号 · 到店体验','朋友圈 · 皮肤管理'][i%3],campaign:'皮肤管理 · 十月体验',costKey:'2026-10 / 华东推广 / '+(52010+i)},{id:'wx'+i+'b',name:'门店服务 · '+c[2],account:'store_'+String(201+i),record:'JW'+(62010+i),added:'2026-10-11 09:12',promoter:'周雨',source:'视频号 · 门店活动',campaign:'门店十月活动',costKey:'2026-10 / 门店推广 / '+(62010+i)}]});
    const current=makeOrder(1);
    current.projects=[{id:current.id+'-1',name:current.project,reception:current.reception,operator:current.operator}];
    // Local multi-project examples: each project owns its reception and operation staff.
    if(i<2)current.projects.push({id:current.id+'-2',name:'舒缓修护护理',reception:['吴鲜娇','刘静'][i],operator:['李婷','陈琳'][i]});
    // Complete local project fixtures, including the first complaint’s two consumed sessions.
    current.projects.forEach((project,index)=>{
      const price=current.projects.length===1?Math.round(current.amount*100):index===0?Math.round(current.amount*100)-30000:30000,quantity=i===0&&index===0?5:1;
      Object.assign(project,{type:index===0&&(i<2||i%2===0)?'消费':'维护',quantity,consumedQuantity:i===0&&index===0?2:0,refundedQuantity:0,unitPrice:price/quantity,totalAmount:price,paid:price,refunded:0,consultant:current.consultant,collaborator:['李婷','陈琳','许悦'][(i+index)%3],biller:current.receptionSales});
    });
    if(i>=4)return [current];
    const previous={...makeOrder(2),intention:'舒缓修护',project:'舒缓修护护理',amount:299,state:'已完成',created:'2026-09-18 09:20',appointment:'2026-09-20 10:00',arrived:'2026-09-20 10:08'};
    previous.projects=[{id:previous.id+'-1',name:previous.project,type:i%2?'消费':'维护',quantity:1,consumedQuantity:0,refundedQuantity:0,unitPrice:29900,totalAmount:29900,paid:29900,refunded:0,consultant:previous.consultant,collaborator:['许悦','李婷','陈琳'][i%3],biller:previous.receptionSales,reception:previous.reception,operator:previous.operator}];
    return [current,previous];
  });
  // Local prototype fixtures. Existing manually saved values are retained during migration.
  const DEMO_DETAILS_VERSION = 'status-matched-plans-20261019';
  const demoScenarios = [
    ['门店','门店服务','manager','2级','我已经做了两次，不想继续疗程，请帮我核对还能退多少。','门店未及时说明剩余疗程的处理方式，退款诉求多次转交后未明确回复。','已与门店核对两次消费记录和剩余项目，整理可协商方案，等待客户确认。','客户已确认剩余项目处理方案，回访确认无其他诉求。'],
    ['推广','广告宣传','promoter','3级','预约时说包含扁平疣治疗，到店又说要收费，我希望按承诺处理。','预约引流内容未明确免费服务范围，与到店实际收费口径不一致。','已定位预约微信及对应加微记录，要求推广核对宣传内容，并与门店确认服务范围。','已向客户说明服务范围并落实协商方案，客户确认处理结果。'],
    ['门店','脱毛操作','operator','2级','我提前说明了操作要求，但老师没有确认就开始了，沟通时也没有解释清楚。','操作前未充分确认客户需求，操作后的解释与安抚不及时。','已联系操作老师核对当日记录，由店长与客户确认后续复查和服务安排。','客户已完成回访，对后续服务安排表示认可。'],
    ['推广','广告宣传','promoter','3级','体验和广告介绍有差别，未消费的部分我想申请退回。','广告对体验内容的描述不够完整，客户预期与实际交付存在差异。','已核对广告页面和预约沟通，整理已消费与未消费项目，等待退款方案确认。','已完成未消费部分的协商处理，客户确认无其他问题。'],
    ['门店','皮肤效果','operator','2级','做完疗程后没有达到当时沟通的预期，希望核对项目并协商剩余疗程。','门店未持续跟进阶段性反馈，对疗程效果和预期的沟通不足。','已核对疗程进度，安排接待老师回访客户，并协商剩余项目的处理方式。','客户已确认剩余疗程处理方案，回访结束。'],
    ['门店','光电操作','operator','3级','做完项目后皮肤不舒服，我先联系了邀约老师，希望尽快安排复查。','操作后的注意事项说明及回访不充分，客户反馈后未及时安排复查。','已协调操作老师核对当次记录，联系客户确认可到店的复查时间。','客户已完成复查并确认后续安排，门店持续回访。'],
    ['销售','前端话术','inviter','1级','我已经说过要取消预约，但一直没有收到回复。','邀约人未及时响应客户取消预约的明确诉求，沟通记录中缺少处理反馈。','已定位原预约微信，通知邀约人核对取消诉求并向客户明确答复。','取消预约事项已处理，客户确认收到回复。'],
    ['门店','闭店','manager','2级','上次说第二次还可以做，但我找不到原门店了，请帮我确认去哪里。','门店地址变更后未及时通知存量客户，也未明确后续服务承接安排。','已由店长核对未完成疗程，联系承接门店确认地址和可预约时间。','客户已确认承接门店及预约安排，后续服务衔接完成。'],
    ['门店','光电操作','operator','3级','光电操作时感觉不舒服，希望核实当天是哪位老师操作，并说明后续安排。','操作中未及时记录并处理客户的不适反馈，需由当次操作老师核实服务过程。','已调取操作维护记录并联系操作老师，安排店长协调复查及后续服务。','复查及后续服务已确认，客户回访结束。'],
    ['销售','咨询报价','inviter','1级','我交了定金，预约前说的价格和门店报的价格不一样。','预约报价未明确包含项目和额外费用，前端沟通口径不完整。','已核对预约报价和门店项目明细，向客户逐项说明收费内容。','已按协商口径确认费用，客户认可说明并确认本次投诉结束。'],
    ['推广','广告宣传','promoter','2级','广告中的疗程内容和效果我没有理解清楚，希望提供准确的说明。','广告对项目适用范围和效果表述不清，客户未获得充分说明。','已联系对应推广人核对宣传依据，整理疗程说明后向客户回电解释。','客户已收到完整疗程说明，确认无其他疑问。'],
    ['门店','顾客自身','manager','1级','我个人时间安排有变化，没办法继续做，想协商剩余服务。','客户个人安排变更导致无法继续履约，由门店负责剩余服务核实与协商。','已核对剩余权益及有效期，与客户沟通延期或调整服务的可选方案。','客户已选择并确认延期服务方案，门店完成登记，回访无异议。'],
    ['门店','闭店','manager','4级','原门店搬走了，还有没做完的疗程，请帮我安排后续服务。','原门店搬迁后的客户告知及疗程承接不及时，未形成明确服务安排。','已核实剩余疗程，协调临近门店承接，等待客户确认新的到店时间。','新的承接门店及疗程安排已获客户确认。'],
    ['门店','门店服务','manager','2级','门店沟通的态度让我不满意，未消费的部分希望有人明确处理。','门店接待沟通不充分，客户表达诉求后未得到清晰的处理反馈。','已由店长复核接待过程，并就未消费部分与客户协商处理方式。','店长已完成回访及协商处理，客户确认接受结果。'],
    ['销售','前后端服务','inviter','2级','线上说的服务和到店说的不一样，希望把预约时的聊天记录核对清楚。','线上预约承诺与门店交接信息不一致，邀约环节未完整同步服务内容。','已核对预约微信记录及门店接待记录，协调销售和店长统一处理口径。','服务内容已核对并落实，客户确认后续安排。'],
    ['销售','前端话术','inviter','1级','我已经说了取消预约，一直没有收到回复。','咨询未及时响应客户取消预约的请求。','已联系咨询核对预约状态，等待客户确认取消结果。','预约已取消，客户确认无需其他协助。'],
    ['门店','光电操作','operator','3级','做完项目后感觉不舒服，希望核实当天的操作情况。','操作后的注意事项说明及回访不充分。','已联系操作老师核对记录，正在协调复查时间。','客户已完成复查，确认后续服务安排。'],
    ['推广','广告宣传','promoter','2级','广告说包含的项目，到店后却说不包含，请核对清楚。','宣传服务范围不明确，与门店执行口径存在差异。','已定位预约微信及推广人，核对广告内容与门店服务范围。','服务范围已核对并按协商方案落实，客户确认接受。']
  ];
  function demoTime(value,minutes=0){return new Date(Date.parse(value.slice(0,16).replace(' ','T')+':00Z')+minutes*60000).toISOString().slice(0,16).replace('T',' ')}
  function demoImage(r,o,kind){
    const rows=kind==='conversation'?[['客户',r.customerStatement||r.content],['客服','已收到您的反馈，我们会核对订单和服务记录，并与您确认处理安排。']]:[['服务项目',o.project],['服务门店',o.store],['到店时间',o.arrived],['接待老师',o.reception],['操作老师',o.operator],['订单号',o.id]];
    let y=128;
    const content=rows.map(([label,value])=>{const lines=String(value).match(/.{1,21}/gu)||[''];const height=48+lines.length*27;const part=`<rect x="28" y="${y}" width="424" height="${height}" rx="10" fill="${label==='客户'?'#eaf3ff':'#ffffff'}"/><text x="48" y="${y+26}" font-size="14" fill="#66788c">${esc(label)}</text>${lines.map((line,i)=>`<text x="48" y="${y+55+i*27}" font-size="17" fill="#24364b">${esc(line)}</text>`).join('')}`;y+=height+14;return part}).join('');
    const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="480" height="${y+66}" viewBox="0 0 480 ${y+66}"><rect width="480" height="100%" fill="#f1f4f8"/><rect width="480" height="100" fill="#fff"/><g font-family="PingFang SC,Microsoft YaHei,sans-serif"><text x="28" y="42" font-size="23" font-weight="600" fill="#24364b">${kind==='conversation'?'客户沟通记录':'到店服务记录'}</text><text x="28" y="74" font-size="14" fill="#7b8c9f">${esc(r.name)} · ${esc(r.phone)}</text>${content}<text x="28" y="${y+32}" font-size="12" fill="#93a1b2">模拟资料 · 仅用于页面展示</text></g></svg>`;
    return {name:kind==='conversation'?'客户沟通记录':'到店服务记录',data:'data:image/svg+xml;charset=UTF-8,'+encodeURIComponent(svg),mock:true};
  }
  function completeDemoDetails(items){
    let changed=false;
    for(const r of items){
      const i=Number(r.id)-31001,scenario=demoScenarios[i],own=orders.filter(o=>o.customerId===r.customerId);
      if(!scenario||!own.length||r.demoDetailsVersion===DEMO_DETAILS_VERSION)continue;
      const [department,type,role,level,statement,reason,progress,resolution]=scenario;
      const untouched=r.logs.every(log=>log.action==='收到投诉');
      if(untouched)r.status=customers[i][7];
      if(!r.linked.length)r.linked=own.map(o=>({id:o.id,wechatId:o.bookingWechatId}));
      const o=orders.find(o=>o.id===r.linked[0].id)||own[0],wx=o.wechatChoices.find(w=>w.id===(r.linked[0].wechatId||o.bookingWechatId))||o.wechatChoices[0];
      const defaults={department,type,level,firstContact:o.inviter,contactTime:demoTime(r.created,-30).replace(' ','T'),customerStatement:statement,responsible:role==='promoter'?wx.promoter:o[role],reason,assessedAt:demoTime(r.created,15),assessedBy:ACTOR};
      if(!untouched&&r.status==='待处理'&&isAssessed(r))r.status='处理中';
      if(r.status==='待处理'){
        if(untouched)for(const [key]of RECOGNITION_FIELDS)r[key]='';
        r.handlingPlan='';delete r.assessedAt;delete r.assessedBy;delete r.closedAt;delete r.closedBy;
        if(untouched)r.follows=[];
      }else{
        for(const [key,value]of Object.entries(defaults))if(!String(r[key]||'').trim())r[key]=value;
        r.handlingPlan=r.status==='已完成'?'resolved':'unresolved';
        if(untouched){
          const directClose=r.status==='已完成'&&i===9,firstTime=demoTime(r.created,15),firstStatus=directClose?'已完成':'处理中',firstPlan=directClose?'resolved':'unresolved';
          const snapshot=recognitionSnapshot(r),before={...Object.fromEntries(RECOGNITION_FIELDS.map(([key])=>[key,''])),linked:clone(r.linked),handlingPlan:''};
          r.follows=[{id:r.id+'-demo-handling',kind:'handling',action:'处理',time:firstTime,actor:ACTOR,note:r.reason,beforeStatus:'待处理',status:firstStatus,before,...clone(snapshot),handlingPlan:firstPlan,files:[],mock:true}];
          if(!directClose)r.follows.unshift({id:r.id+'-demo-progress',kind:'follow',time:demoTime(r.created,25),actor:ACTOR,note:progress,beforeStatus:'处理中',status:'处理中',...clone(snapshot),handlingPlan:'unresolved',files:[],mock:true});
          if(r.status==='已完成'){
            r.closedAt=directClose?firstTime:demoTime(r.created,50);r.closedBy=ACTOR;
            if(!directClose)r.follows.unshift({id:r.id+'-demo-closure',kind:'closure',time:r.closedAt,actor:ACTOR,note:resolution,beforeStatus:'处理中',status:'已完成',...clone(snapshot),files:[],mock:true});
          }else{delete r.closedAt;delete r.closedBy}
        }else if(r.status==='已完成'){
          r.closedAt??=r.follows.find(f=>f.status==='已完成')?.time||demoTime(r.created,50);r.closedBy??=ACTOR;
        }
      }
      if(!r.files?.length)r.files=[demoImage(r,o,'conversation'),...(i%3===0?[demoImage(r,o,'service')]:[])];
      r.demoDetailsVersion=DEMO_DETAILS_VERSION;changed=true;
    }
    return changed;
  }
  function seed(){return customers.map((c,i)=>{
    const own=orders.filter(o=>o.customerId==='C'+i);
    const payment=c[3]==='wechat'?{wechatNickname:c[0],paymentAmount:own[0].amount,problemType:'其他',problemDescription:'不满意商家服务',complaintCount:1,riskStatus:'正常'}:{};
    return {id:String(31001+i),sourceId:c[3]==='wechat'?'200000020261019140532'+String(473535+i):String(22135-i),customerId:'C'+i,name:c[0],phone:c[1],member:String(15275350+i*227),customerWechat:own[0].customerWechat,store:c[2],channel:c[3],content:c[4],created:c[5],submitter:c[6],status:c[7],handlingPlan:'',level:'',level4Type:'',department:'',type:'',firstContact:'',contactTime:'',customerStatement:'',responsible:'',reason:'',linked:[],files:[],follows:[],logs:[{time:c[5],actor:c[6],action:'收到投诉',text:'通过'+CHANNELS[c[3]]+'提交投诉，进入统一客诉列表。'}],channelStatus:c[3]==='wechat'?(c[7]==='已完成'?'已完成':'处理中'):c[7],merchant:i%2?'厦门尚妃美容有限公司':'厦门宜颜佳科技有限公司',merchantId:i%2?'173092199':'844905329',payOrder:'420005788820241102764073'+String(6622+i),externalOrder:own[0].id,refund:i%4===0?own[0].amount:0,...payment,messages:[{time:c[5],actor:'客户',text:c[4],type:'用户提交投诉'}]};
  })}
  function completeWechatDetails(items){const fixtures=seed();let changed=false;for(const r of items){if(r.channel!=='wechat')continue;const fixture=fixtures.find(f=>f.id===r.id&&f.channel==='wechat'&&f.externalOrder===r.externalOrder);if(!fixture)continue;for(const key of ['wechatNickname','paymentAmount','problemType','problemDescription','complaintCount','riskStatus'])if(!Object.hasOwn(r,key)){r[key]=fixture[key];changed=true}}return changed}
  let records,readFailure=false;
  try{const saved=JSON.parse(localStorage.getItem(KEY)||localStorage.getItem(SOURCE_KEY));records=Array.isArray(saved)&&saved.length&&saved.every(r=>r.id&&Array.isArray(r.logs)&&Array.isArray(r.follows)&&Array.isArray(r.linked))?saved:seed()}catch(e){records=seed();readFailure=true}
  // Add new pending fixtures once; never reset previously handled complaints.
  records.push(...seed().filter(r=>Number(r.id)>=31016&&!records.some(existing=>existing.id===r.id)));
  records.forEach(r=>{r.files=(r.files||[]).filter(f=>!f.sample&&f.data);r.follows.forEach((f,i)=>{f.id??=r.id+'-history-'+i;f.files=(f.files||[]).filter(file=>!file.sample&&file.data)});r.messages=(r.messages||[]).filter(m=>!String(m.type||'').includes('示例')).map(m=>({...m,files:(m.files||[]).filter(f=>!f.sample&&f.data)}))});
  const demoChanged=completeDemoDetails(records),wechatChanged=completeWechatDetails(records);
  try{if(demoChanged||wechatChanged||!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(records))}catch(e){readFailure=true}
  let root,portal,filters={},filterDraft={},page=1,pageSize=10,more=false,layers=[],main=null;
  function persist(next){try{localStorage.setItem(KEY,JSON.stringify(next));records=next;return true}catch(e){toast('本地保存失败，请减少附件后重试；已保留当前输入。');return false}}
  function toast(message){ElementPlus.ElMessage({message,type:'info',duration:4000,showClose:true});}
  function interval(record){if(!record.contactTime)return '待补充客户陈述';const delta=new Date(record.created.replace(' ','T')+':00+08:00')-new Date(record.contactTime+':00+08:00');if(!Number.isFinite(delta))return '—';const minutes=Math.round(Math.abs(delta)/60000),duration=minutes<60?minutes+'分钟':minutes<1440?Math.floor(minutes/60)+'小时'+(minutes%60?minutes%60+'分':''):Math.floor(minutes/1440)+'天'+(Math.floor(minutes%1440/60)?Math.floor(minutes%1440/60)+'小时':'');return delta>=0?'联系至上报 '+duration:'提交后联系 '+duration}
  function complaintKeywordMatch(r,criteria){
    const query=(criteria.keyword||'').trim().toLowerCase();if(!query)return true;
    const key=ORDER_KEYWORDS.some(([value])=>value===criteria.keywordType)?criteria.keywordType:'phone';
    const values=key==='id'?[...r.linked.map(order=>order.id),...(r.channel==='wechat'?[r.externalOrder,r.payOrder]:[])]:key==='name'?[r.name,...(r.channel==='wechat'?[r.wechatNickname]:[])]:key==='customerWechat'?[r.customerWechat??orders.find(order=>order.customerId===r.customerId)?.customerWechat]:[r[key]];
    return values.some(value=>String(value??'').toLowerCase().includes(query));
  }
  function complaintKeywordControl(){const key=filterDraft.keywordType||'phone',label=ORDER_KEYWORDS.find(([value])=>value===key)?.[1]||'客户手机';return `<div class="refund-keyword" data-pc-label="关键词"><select id="uc-keywordType" name="keywordType" class="uc-input" aria-label="关键词类型">${ORDER_KEYWORDS.map(([value,text])=>`<option value="${value}"${key===value?' selected':''}>${text}</option>`).join('')}</select>${input('keyword',filterDraft.keyword,'输入'+label,'text','aria-label="投诉关键词"')}</div>`}
  function filtered(criteria=filters){return records.filter(r=>{
    return complaintKeywordMatch(r,criteria)&&(!criteria.channel||r.channel===criteria.channel)&&(!criteria.status||r.status===criteria.status)&&(!criteria.department||multiValues(r.department).includes(criteria.department))&&(!criteria.type||r.type===criteria.type)&&(!criteria.level||r.level===criteria.level)&&(!criteria.store||r.store===criteria.store)&&(!criteria.linked||(criteria.linked==='yes'?r.linked.length>0:r.linked.length===0))&&(!criteria.contact||(criteria.contact==='yes'?r.firstContact&&r.contactTime:!r.firstContact||!r.contactTime))&&(!criteria.start||r.created.slice(0,10)>=criteria.start)&&(!criteria.end||r.created.slice(0,10)<=criteria.end)
  }).sort((a,b)=>b.created.localeCompare(a.created))}
  function pagination(total,current,size,scope='list'){
    return `<div class="pagination" data-pc-pager='${esc(JSON.stringify({total,page:current,size,sizes:[10,20,50],action:'complaints',scope}))}'></div>`;
  }
  function renderList(){const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/pageSize)),statusCounts=filtered({...filters,status:''}).reduce((counts,r)=>{counts[r.status]=(counts[r.status]||0)+1;return counts},{});page=Math.min(page,pages);root.innerHTML=`
    <section class="uc-search-card"><nav class="uc-list-tabs" role="tablist" aria-label="工单状态">${STATUS_TABS.map(([value,label],i)=>`<button type="button" class="uc-list-tab" role="tab" id="uc-status-${i}" aria-controls="uc-list-panel" aria-selected="${(filters.status||'')===value}" tabindex="${(filters.status||'')===value?'0':'-1'}" data-uc="status-tab" data-status="${value}">${label}</button>`).join('')}</nav><div class="query-module"><form id="uc-search" class="filterbar">
      ${complaintKeywordControl()}
      ${select('channel',Object.entries(CHANNELS),filterDraft.channel,'全部渠道','aria-label="投诉渠道"')}
      ${select('level',LEVELS,filterDraft.level,'全部等级','aria-label="客诉等级"')}
      ${more?[
        select('department',['推广','销售','门店'],filterDraft.department,'全部责任部门','aria-label="责任部门"'),
        select('type',TYPES,filterDraft.type,'全部售后类型','aria-label="售后类型"'),
        select('store',[...new Set(records.map(r=>r.store))],filterDraft.store,'全部门店','aria-label="投诉门店" data-filterable'),
        select('linked',[['yes','已关联订单'],['no','未关联订单']],filterDraft.linked,'全部关联状态','aria-label="关联订单"'),
        select('contact',[['no','首次联系待补充'],['yes','首次联系已填写']],filterDraft.contact,'全部联系信息','aria-label="首次联系信息"'),
        `<div class="mr-date" data-pc-label="投诉时间">${input('start',filterDraft.start,'开始日期','date','aria-label="投诉开始日期"')}<span>至</span>${input('end',filterDraft.end,'结束日期','date','aria-label="投诉结束日期"')}</div>`
      ].join(''):''}
      <div class="query-actions"><button class="btn primary" type="submit" form="uc-search">搜索</button>${btn('重置','reset')}${link(more?'收起筛选':'更多筛选','more','aria-expanded="'+more+'"')}</div>
    </form><div id="uc-query-error" class="uc-error" role="alert"></div></div></section>
    <section class="panel content-module uc-card" role="tabpanel" id="uc-list-panel" aria-labelledby="uc-status-${STATUS_TABS.findIndex(([value])=>value===(filters.status||''))}"><div class="panel-head uc-card-head"><h3>投诉列表</h3><div class="uc-actions">${btn('导出','export')}</div></div>
      <div class="table-wrap uc-table-wrap"><table class="uc-table uc-main-table" data-pc-align="left"><colgroup><col><col><col><col><col style="width:80px"><col style="width:90px"><col style="width:155px"><col style="width:120px"><col style="width:70px"></colgroup>
      <thead><tr>${['客户信息','门店 / 关联订单','投诉渠道','投诉内容','客诉等级','工单状态','第一联系人 / 联系时间','责任人 / 部门','操作'].map((t,i)=>`<th data-pc-min-width="${[150,180,145,250,80,90,155,120,70][i]}"${i===8?' class="uc-fixed"':''}>${t}</th>`).join('')}</tr></thead>
      <tbody>${rows.length?rows.slice((page-1)*pageSize,page*pageSize).map(r=>`<tr><td class="uc-list-customer">${valueText(r.name).trim()?link(esc(r.name),'customer-detail',`data-customer="${esc(r.customerId||'')}" aria-label="查看客户详情：${esc(r.name)}"`):listValue('')}<span class="pc-block uc-block uc-muted">会员号 ${listValue(r.member)}</span><span class="pc-block uc-block uc-muted">${listValue(r.phone)}</span></td><td class="uc-list-store-order"><span class="pc-block uc-block">${listValue(r.store)}</span><span class="pc-block uc-block">${r.linked.length?link(r.linked[0].id,'order-detail',`data-order="${esc(r.linked[0].id)}"`):listValue('')}</span>${r.linked.length>1?'<span class="pc-block uc-block uc-muted">共 '+r.linked.length+' 笔</span>':''}</td><td>${listValue(CHANNELS[r.channel])}<span class="pc-block uc-block uc-muted">${listValue(r.created?fmt(r.created):'')}</span>${paymentListSummary(r)}</td><td><div class="uc-complaint-content">${listValue(r.content)}</div>${r.type?'<span class="pc-block uc-block uc-muted">'+esc(r.type)+'</span>':''}</td><td>${levelTag(r.level)}${level4Type(r)?'<span class="pc-block uc-block uc-muted">'+esc(level4Type(r))+'</span>':''}</td><td>${r.status?statusTag(r.status):listValue('')}</td><td>${listValue(r.firstContact)}<span class="pc-block uc-block uc-muted">${listValue(r.contactTime?fmt(r.contactTime):'')}</span></td><td>${listValue(r.type==='闭店'?'无需填写':r.responsible)}<span class="pc-block uc-block uc-muted">${listValue(r.department)}</span></td><td class="uc-fixed"><div class="uc-actions">${link('详情','detail',`data-id="${r.id}"`)}</div></td></tr>`).join(''):`<tr><td colspan="9">${empty('暂无符合条件的数据')}</td></tr>`}</tbody></table></div>
      ${pagination(rows.length,page,pageSize)}
    </section>`;
    root.querySelectorAll('#uc-search [id]').forEach(el=>el.id=el.id.replace(/^uc-/,'uc-filter-'));
    root.querySelectorAll('#uc-search label[for]').forEach(el=>el.htmlFor=el.htmlFor.replace(/^uc-/,'uc-filter-'));
  }

  function lockBackground(){syncDrawerInteraction();}
  function unlockBackground(){syncDrawerInteraction();}
  function openLayer(title,body,footer,level=1){
    const trigger=document.activeElement,parent=layers.at(-1),parentView=parent?{scroll:parent.el.querySelector('.uc-drawer-body').scrollTop,tab:main?.tab}:null;
    if(parent)parent.el.inert=true;
    const el=document.createElement('div');el.className='uc-scope uc-layer merge-drawer-backdrop';el.dataset.overlayLayer='complaint-'+layers.length;el.dataset.uc='dismiss';el.style.zIndex=String(120+layers.length*10);
    el.innerHTML=`<section class="merge-drawer ub-drawer uc-drawer" style="--archive-drawer-width:860px" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><header class="merge-drawer-head uc-drawer-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-uc="dismiss" aria-label="关闭${esc(title)}">${iconClose}</button></header><div class="uc-layer-top"></div><div class="merge-drawer-body uc-drawer-body">${body}</div><footer class="merge-drawer-foot uc-drawer-foot">${footer}</footer></section>`;
    portal.appendChild(el);bind(el);const layer={el,trigger,title,closing:false,parentView};layers.push(layer);lockBackground();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.classList.add('show');el.querySelector('.uc-drawer').focus({preventScroll:true})}));return layer;
  }
  function closeLayer(force=false){const layer=layers.at(-1);if(!layer||layer.closing)return;if(!force&&dirty(layer)){showDiscard(layer);return}layer.closing=true;layer.el.classList.remove('show');layer.el.classList.add('is-closing');setTimeout(()=>{if(!layers.includes(layer))return;layer.el.remove();layers.pop();if(main?.editor?.layer===layer)main.editor=null;if(layers.length){const parent=layers.at(-1);parent.el.inert=false;if(layer.parentView){parent.el.querySelector('.uc-drawer-body').scrollTop=layer.parentView.scroll;if(main?.layer===parent)setDetailTab(layer.parentView.tab)}}else{unlockBackground();main=null}if(layer.trigger?.isConnected)layer.trigger.focus({preventScroll:true});else if(layers.length)layers.at(-1).el.querySelector('.uc-drawer').focus({preventScroll:true});else root.querySelector('input,button')?.focus({preventScroll:true})},matchMedia('(prefers-reduced-motion: reduce)').matches?0:290)}
  function dirty(layer){const e=main?.editor;return Boolean(e?.layer===layer&&(e.uploading||JSON.stringify(e.draft)!==e.baseline||(e.selectingOrders&&JSON.stringify(e.selection)!==e.selectionBaseline)))}
  function showDiscard(layer,action='close'){layer.discardAction=action;const foot=layer.el.querySelector('.uc-drawer-foot');if(foot.querySelector('.uc-discard'))return;layer.oldFoot=foot.innerHTML;foot.innerHTML=`<div class="uc-discard" role="alert"><span>有尚未保存的修改，是否放弃？</span>${link('继续填写','keep')}${btn('放弃修改','discard')}</div>`;foot.querySelector('button').focus()}
  function restoreFoot(layer){if(layer.oldFoot){layer.el.querySelector('.uc-drawer-foot').innerHTML=layer.oldFoot;layer.oldFoot=null;layer.discardAction=null}}
  function recordById(id){return records.find(r=>r.id===id)}
  function isAssessed(r){return ASSESSMENT_FIELDS.every(([key])=>key==='level4Type'?r.level!=='4级'||Boolean(level4Type(r)):key==='responsible'&&r.type==='闭店'?true:valueText(r[key]).trim())}
  function valuesFrom(r,fields){return Object.fromEntries(fields.map(([key])=>[key,MULTI_FIELDS.includes(key)?multiValues(r[key]):r[key]||'']))}
  function recognitionSnapshot(r){return {...Object.fromEntries(RECOGNITION_FIELDS.map(([key])=>[key,MULTI_FIELDS.includes(key)?multiValues(r[key]):String(r[key]||'').trim()])),level4Type:level4Type(r),linked:clone(r.linked),handlingPlan:r.handlingPlan||'',handlingFiles:clone(r.handlingFiles||[]),customerSolution:r.customerSolution?clone(r.customerSolution):null}}
  function recognitionLog(snapshot){return {...snapshot,handlingFiles:(snapshot.handlingFiles||[]).map(({name,type,size})=>({name,type,size}))}}
  function handlingMissing(draft){return [['department',multiValues(draft.department).length,'请选择责任部门'],['type',String(draft.type||'').trim(),'请选择售后类型'],['responsible',draft.type==='闭店'||multiValues(draft.responsible).length,'请选择责任人'],['level',LEVELS.includes(draft.level),'请选择客诉等级'],['level4Type',draft.level!=='4级'||Boolean(level4Type(draft)),'请选择风险类型'],['handlingPlan',validPlan(draft.handlingPlan),'请选择处理结果']].filter(([,value])=>!value).map(([name,,message])=>[name,message])}
  function recordRecognition(r,draft,time){
    if(r.status!=='处理中'||handlingMissing(draft).length)return null;
    const before=recognitionSnapshot(r),after=recognitionSnapshot({...draft,complaintStore:r.complaintStore,responsible:draft.type==='闭店'?[]:draft.responsible,linked:r.linked,customerSolution:r.customerSolution}),wasAssessed=Boolean(r.assessedAt||r.follows.some(f=>['handling','assessment'].includes(f.kind))),beforeStatus=r.status;
    after.handlingPlan=draft.handlingPlan;
    const unchanged=JSON.stringify(before)===JSON.stringify(after);
    if(unchanged&&wasAssessed&&beforeStatus!=='待处理')return null;
    Object.assign(r,clone(after),{assessedAt:time,assessedBy:ACTOR,status:after.handlingPlan==='resolved'?'已完成':'处理中'});
    if(r.status==='已完成'&&beforeStatus!=='已完成'){r.closedAt=time;r.closedBy=ACTOR}
    const entry={id:r.id+'-handling-'+Date.now()+'-'+r.follows.length,kind:'handling',action:wasAssessed?'修改责任认定':'责任认定',time,actor:ACTOR,note:after.reason,status:r.status,beforeStatus,before,...clone(after),files:[]};
    r.follows.unshift(entry);return entry;
  }
  function recordCompensation(r,solution,time){
    const before=r.customerSolution?clone(r.customerSolution):null;
    if(JSON.stringify(before)===JSON.stringify(solution))return null;
    r.customerSolution=clone(solution);r.compensatedAt=time;r.compensatedBy=ACTOR;
    const entry={id:r.id+'-compensation-'+Date.now()+'-'+r.follows.length,kind:'compensation',action:'保存解决方案',time,actor:ACTOR,beforeStatus:r.status,status:r.status,before,customerSolution:clone(solution),files:[]};
    r.follows.unshift(entry);return entry;
  }
  function recordStartProcessing(r,time){if(r.status!=='待处理')return null;const beforeStatus=r.status;r.status='处理中';r.startedAt=time;r.startedBy=ACTOR;const entry={id:r.id+'-start-'+Date.now(),kind:'start',action:'开始处理',time,actor:ACTOR,note:'已确认开始处理客诉。',beforeStatus,status:r.status,files:[]};r.follows.unshift(entry);return entry}
  function recordFollow(r,d,time){if(!['处理中','已完成'].includes(r.status))return null;const beforeStatus=r.status;const entry={id:r.id+'-'+Date.now()+'-'+r.follows.length,kind:'follow',time,actor:ACTOR,note:d.note.trim(),files:clone(d.files),beforeStatus,status:r.status,...recognitionSnapshot(r)};r.follows.unshift(entry);return entry}
  function hasHandlingScheme(r){return validPlan(r.handlingPlan)&&Boolean(r.assessedAt||(r.follows||[]).some(f=>['handling','assessment'].includes(f.kind)))}
  function canClose(r){return r.status==='处理中'&&hasHandlingScheme(r)}
  function recordClosure(r,time){if(!canClose(r))return null;const beforeStatus=r.status;r.status='已完成';r.handlingPlan='resolved';r.closedAt=time;r.closedBy=ACTOR;const entry={id:r.id+'-close-'+Date.now(),kind:'closure',time,actor:ACTOR,note:'已确认客诉处理完成，予以结案。',status:r.status,beforeStatus,...recognitionSnapshot(r),files:[]};r.follows.unshift(entry);return entry}
  function replyAction(){return `<div class="uc-footer-reply">${btn('回复客户','reply-customer')}</div>`}
  function detailActions(r){const actions=r.status==='已完成'?btn('关闭','dismiss'):r.status==='待处理'?btn('开始处理','start-processing','',true):(canClose(r)?btn('结案','close-case'):'')+btn('责任认定','begin-assessment','',true);return replyAction()+btn('解决方案','begin-compensation')+actions}
  function followPanel(r){return (['处理中','已完成'].includes(r.status)?`<div class="uc-actions uc-follow-actions">${btn('写跟进','write-follow')}</div>`:'')+followHistory(r)+(r.channel==='wechat'?wechatView(r):'')}
  function openComplaint(id,tab='attribution'){
    if(layers.length)return;main={record:recordById(id),tab:tab==='follows'?'follows':'attribution',scrollPositions:{},references:{complaint:false,orders:false,payment:false},layer:null,editor:null};
    main.layer=openLayer('投诉详情','','');renderDetail();
  }
  function summary(r){return `<div class="uc-case-context"><div class="uc-case-customer"><strong>${esc(r.name)}</strong><span>${esc(r.phone)}</span><div class="uc-actions">${statusTag(r.status)}${levelTag(r.level)}${level4Type(r)?tag(level4Type(r)): ''}</div></div><div class="uc-case-meta"><span>${CHANNELS[r.channel]}</span><span>${fmt(r.created)}</span><span>工单号：${r.id}</span><span>发起人：${esc(r.submitter)}</span>${r.channel==='wechat'?'':`<span>原单号：${esc(r.sourceId)}</span>`}${r.contactTime?`<span>${esc(interval(r))}</span>`:''}</div></div>`}
  function detailReference(key,label,text,content,closedLabel,actions=''){
    const open=main.references[key],id='uc-detail-reference-'+key,expandable=Boolean(content)||(key==='complaint'&&text.length>80),multiline=key==='complaint';
    return `<div class="uc-reference-group${open?' is-open':''}"><div class="uc-reference-row"><span class="uc-reference-label">${label}</span><span class="uc-reference-summary${multiline?(expandable?' uc-feedback-summary':' uc-reference-text'):''}" title="${esc(text)}">${esc(text)}</span><div class="uc-actions uc-reference-actions">${expandable?link(open?'收起':closedLabel,'detail-reference',`data-reference="${key}" data-closed-label="${closedLabel}" aria-expanded="${open}" aria-controls="${id}"`):''}${actions}</div></div><div class="uc-reference-content" id="${id}" ${open&&content?'':'hidden'}>${content}</div></div>`;
  }
  function detailCommon(r){
    const orderStores=[...new Set(r.linked.map(item=>resolveLink(item).order?.store).filter(Boolean))],orderText=r.linked.length?`${r.linked.length} 笔订单${orderStores.length?' · '+orderStores.join('、'):''}`:'暂未关联订单';
    return `<div class="uc-detail-references">${detailReference('complaint','投诉内容',r.content||'未填写',filesView(r.files,'original'),r.files?.length?'查看附件':'展开全文')}<div class="uc-feedback-read" aria-label="客户反馈">${recognitionFieldsView(r,CONTACT_FIELDS)}</div>${detailReference('orders','关联订单',orderText,r.linked.length?orderCards(r.linked):'','查看订单信息',r.status==='已完成'?'':link(r.linked.length?'调整订单':'关联订单','pick-orders'))}${r.channel==='wechat'?detailReference('payment','微信支付',`订单 ${paymentMoney(r.paymentAmount)} · 申请退款 ${paymentMoney(r.refund)}`,paymentView(r),'查看支付资料'):''}</div>`;
  }
  function toggleDetailReference(button){
    const key=button.dataset.reference;if(!main||!Object.hasOwn(main.references,key))return;
    const open=main.references[key]=!main.references[key],group=button.closest('.uc-reference-group'),content=main.layer.el.querySelector('#'+button.getAttribute('aria-controls'));
    group.classList.toggle('is-open',open);content.hidden=!open||!content.innerHTML;button.setAttribute('aria-expanded',String(open));button.textContent=open?'收起':button.dataset.closedLabel;
  }
  function sections(){return [['attribution','责任认定'],['follows','跟进记录']]}
  function detailTabs(){return `<nav class="uc-tabs" role="tablist" aria-label="投诉详情">${sections().map(([id,label])=>`<button type="button" role="tab" class="uc-tab" id="uc-tab-${id}" aria-selected="${main.tab===id}" tabindex="${main.tab===id?'0':'-1'}" aria-controls="uc-section-${id}" data-uc="tab" data-tab="${id}">${label}</button>`).join('')}</nav>`}
  function panel(id,content){return `<section class="uc-tab-panel" role="tabpanel" id="uc-section-${id}" aria-labelledby="uc-tab-${id}" ${main.tab===id?'':'hidden'}>${content}</section>`}
  function setDetailTab(key){if(!main?.layer)return;main.tab=key;main.layer.el.querySelectorAll('.uc-tab').forEach(b=>{const active=b.dataset.tab===key;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1});main.layer.el.querySelectorAll('.uc-tab-panel').forEach(p=>p.hidden=p.id!=='uc-section-'+key)}
  function selectDetailTab(key,focus=true){const body=main.layer.el.querySelector('.uc-drawer-body'),scroll=body.scrollTop,tabTop=body.querySelector('.uc-detail-common').offsetHeight;main.scrollPositions[main.tab]=scroll;setDetailTab(key);body.scrollTop=scroll<=tabTop?scroll:Math.max(tabTop,main.scrollPositions[key]||0);if(focus)main.layer.el.querySelector('#uc-tab-'+key)?.focus({preventScroll:true})}
  function renderDetail(){if(!main.layer)return;const r=main.record,layer=main.layer,body=layer.el.querySelector('.uc-drawer-body');if(body.children.length)main.scrollPositions[main.tab]=body.scrollTop;layer.el.querySelector('.uc-drawer').classList.add('uc-detail-drawer','uc-workspace');layer.el.querySelector('.uc-layer-top').innerHTML='';body.classList.add('uc-detail-body');body.innerHTML=`<section class="uc-detail-common" aria-label="公共客户资料">${summary(r)}${detailCommon(r)}</section>${detailTabs()}<div class="uc-detail-panels">${panel('attribution',handlingSchemeView(r))}${panel('follows',followPanel(r))}</div>`;body.scrollTop=main.scrollPositions[main.tab]||0;layer.el.querySelector('.uc-drawer-foot').innerHTML=detailActions(r)}
  function paymentListSummary(r){return r.channel==='wechat'?`<div class="uc-payment-list-summary"><span>订单 ${esc(paymentMoney(r.paymentAmount))}</span><span>申请退款 ${esc(paymentMoney(r.refund))}</span></div>`:''}
  function paymentView(r){const read=(label,value,full=false)=>detail(label,valueText(value).trim()||'—',full);return `<section class="uc-channel-payment" aria-label="微信支付信息"><div class="uc-section-head"><h4>微信支付信息</h4><div class="uc-channel-state">${wechatStatusTag(r.channelStatus)}</div></div><div class="uc-details uc-payment-facts">${read('商户名称',r.merchant)}${read('商户号',r.merchantId)}${read('微信投诉单号',r.sourceId)}${read('投诉时间',r.created?fmt(r.created):'')}${read('外部单号',r.externalOrder)}${read('客户昵称',r.wechatNickname)}${read('问题类型',r.problemType)}${read('问题描述',r.problemDescription)}${read('订单金额',paymentMoney(r.paymentAmount))}${read('申请退款金额',paymentMoney(r.refund))}</div><details class="uc-inline-details uc-payment-more"><summary>更多支付资料</summary><div class="uc-details">${read('微信支付订单号',r.payOrder,true)}${read('投诉次数',r.complaintCount===undefined||r.complaintCount===null?'':r.complaintCount+' 次')}${read('风险状态',r.riskStatus)}</div></details></section>`}
  function resolveLink(item){const order=orders.find(o=>o.id===item.id);return {order,wx:order?.wechatChoices.find(w=>w.id===(item.wechatId||order.bookingWechatId))}}
  function orderProjects(order){return Array.isArray(order.projects)?order.projects:order.project?[{name:order.project,reception:order.reception,operator:order.operator}]:[]}
  function orderCards(linked){
    const present=value=>value!==undefined&&value!==null&&value!=='',
      read=value=>esc(present(value)?value:'—'),
      amount=value=>present(value)&&Number.isFinite(Number(value))?money(Number(value)/100):'—',
      time=value=>present(value)?String(value).replace('T',' '):'—',
      fact=(label,value)=>`<div><dt>${label}：</dt><dd>${read(value)}</dd></div>`;
    return `<div class="uc-order-detail-list">${linked.map(item=>{
      const {order:o,wx}=resolveLink(item);
      if(!o)return `<div class="uc-order-detail">${empty('订单 '+esc(item.id)+' 的资料暂不可用')}</div>`;
      const projects=orderProjects(o),rows=projects.map(project=>{
        const type=project.type,staff=[...new Set([project.biller,project.operator].filter(Boolean))].join(' / ');
        return `<tr><td>${project.category?`<span class="uc-muted">${esc(project.category)}：</span>`:''}${read(project.name)}</td><td>${type?tag(type,type==='消费'?'green':type==='维护'?'orange':'gray'):'—'}</td><td>${read(project.quantity)}</td><td>${amount(project.unitPrice)}</td><td>${amount(project.totalAmount??project.paid)}</td><td>${read(project.consultant??o.consultant)}</td><td>${read(project.collaborator)}</td><td>${read(staff)}</td></tr>`;
      }).join('');
      return `<article class="uc-order-detail" aria-label="订单 ${esc(o.id)} 的信息">
        <dl class="uc-order-detail-summary">${fact('所属门店',o.store)}${fact('订单意向',o.intention)}${fact('到店时间',time(o.arrived))}${fact('前端推广',wx?.promoter)}${fact('咨询老师',o.consultant)}${fact('门店接待',o.receptionSales)}${fact('门店店长',o.manager)}</dl>
        <h4 class="uc-order-project-heading">项目信息</h4>
        <div class="table-wrap uc-table-wrap uc-order-project-table-wrap" role="region" aria-label="订单 ${esc(o.id)} 的项目信息，可横向滚动" tabindex="0"><table class="uc-table uc-order-project-table" aria-label="订单 ${esc(o.id)} 的项目信息"><colgroup><col style="width:156px"><col style="width:60px"><col style="width:48px"><col style="width:84px"><col style="width:84px"><col style="width:64px"><col style="width:76px"><col style="width:108px"></colgroup><thead><tr>${['项目名称','类型','数量','单价','总金额','顾问','协作老师','开单/操作老师'].map(label=>`<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${rows||`<tr><td colspan="8">${empty('暂无项目明细')}</td></tr>`}</tbody></table></div>
      </article>`;
    }).join('')}</div>`;
  }
  function responsibilityRule(type){if(type==='广告宣传')return '广告效果 → 推广人';if(['光电操作','脱毛操作'].includes(type))return '操作问题 → 操作老师';if(type==='门店服务')return '服务态度 → 门店';return ''}
  function recognitionFieldsView(r,fields){return `<div class="uc-details">${fields.filter(([key])=>key!=='level4Type'||r.level==='4级').map(([key,label])=>detail(label,key==='contactTime'?(r[key]?fmt(r[key]):'未填写'):(key==='responsible'&&r.type==='闭店'?'无需填写':valueText(r[key])||'未填写'),['customerStatement','reason'].includes(key))).join('')}</div>`}
  function assessmentView(r){return section('责任认定',recognitionFieldsView(r,ASSESSMENT_FIELDS))+section('处理结果',`<div class="uc-details uc-plan-detail">${detail('处理结果',planText(r.handlingPlan),true)}${r.handlingFiles?.length?detail('附件',filesView(r.handlingFiles,'handling'),true,true):''}</div>`,r.status==='已完成'?'':link('编辑','begin-assessment','aria-label="编辑责任认定"'))}
  function handlingSchemeView(r){if(r.status==='待处理')return empty('尚未开始处理');if(r.status==='处理中'&&!hasHandlingScheme(r))return empty('已开始处理，请填写责任认定');return `<article class="uc-scheme-card" aria-label="责任认定"><div class="uc-scheme-content">${assessmentView(r)}</div>${r.assessedAt||r.closedAt?`<footer class="uc-scheme-meta">${r.assessedAt?`<span>处理人：${esc(r.assessedBy||ACTOR)}</span><span>处理时间：${fmt(r.assessedAt)}</span>`:''}${r.closedAt?`<span>结案时间：${fmt(r.closedAt)}</span>`:''}</footer>`:''}</article>`}
  function events(items,render){return `<div class="uc-timeline">${items.map(item=>`<article class="uc-event"><time class="uc-event-time">${esc(fmt(item.time))}</time><div class="uc-event-content">${render(item)}</div></article>`).join('')}</div>`}
  function followHistory(r){return r.follows.length?events(r.follows,f=>{
    if(['assessment','handling'].includes(f.kind))return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag(String(f.action||'').includes('修改')?'修改责任认定':'责任认定','blue')}</div><div class="uc-recognition-summary">${[f.department,f.type,f.responsible,f.level,level4Type(f)].map(valueText).filter(Boolean).map(value=>`<span>${esc(value)}</span>`).join('')}</div><div class="uc-event-text">责任原因：${esc(f.reason||'未填写')}</div>${f.handlingPlan?`<div class="uc-event-text">处理结果：${esc(planText(f.handlingPlan))}</div>`:''}${f.customerSolution?`<details class="uc-inline-details"><summary>查看解决方案</summary>${solutionRead(f.customerSolution,r.follows.indexOf(f))}</details>`:''}${filesView(f.handlingFiles||[],'handling-history',r.follows.indexOf(f))}<div class="uc-saved-meta">首次反馈：${esc(f.firstContact||'未填写')} · ${fmt(f.contactTime)}</div>`;
    if(f.kind==='compensation')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('解决方案','blue')}</div>${solutionRead(f.customerSolution,r.follows.indexOf(f))||'<span class="uc-muted">未选择处理方式</span>'}`;
    if(f.kind==='start')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('开始处理','blue')}</div><div class="uc-event-text">${esc(f.note)}</div>`;
    if(f.kind==='reply')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('回复客户','green')}</div>${f.note?`<div class="uc-event-text">${esc(f.note)}</div>`:''}${filesView(f.files||[],'follow',r.follows.indexOf(f))}`;
    if(f.kind==='closure')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('结案','green')}</div><div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>`;
    return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('沟通跟进')}${f.actor===ACTOR?link('编辑','edit-follow-record',`data-follow="${esc(f.id)}" aria-label="编辑跟进 ${esc(fmt(f.time))}"`):''}</div><div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>${filesView(f.files||[],'follow',r.follows.indexOf(f))}${f.updatedAt?`<div class="uc-saved-meta">修改于 ${fmt(f.updatedAt)}</div>`:''}`;
  }):empty('暂无跟进记录')}
  function wechatView(r){return r.messages?.length?`<details class="uc-inline-details uc-channel-disclosure"><summary>微信协商记录</summary>${events([...r.messages].reverse(),m=>`<div class="uc-event-title"><strong>${esc(m.actor)}</strong>${tag(m.type,'blue')}</div><div class="uc-event-text">${esc(m.text)}</div>${filesView(m.files||[],'message',r.messages.indexOf(m))}`)}</details>`:''}
  function filesView(files,kind,index=''){return files?.length?`<div class="uc-attachments uc-image-gallery">${files.map((f,i)=>String(f.data||'').startsWith('data:image/')?`<button type="button" class="uc-image-thumb" data-uc="file" data-kind="${kind}" data-index="${index}" data-file="${i}" aria-label="查看图片：${esc(f.name)}"><img src="${esc(f.data)}" alt="${esc(f.name)}" loading="lazy"><span>${esc(f.name)}</span></button>`:`<button type="button" class="uc-file uc-file-download" data-uc="file" data-kind="${kind}" data-index="${index}" data-file="${i}" aria-label="${isAudioFile(f)?'播放录音':'下载附件'}：${esc(f.name)}">${iconFile}<span>${esc(f.name)}</span><span class="uc-link">${isAudioFile(f)?'播放':'下载'}</span></button>`).join('')}</div>`:''}
  function draftFiles(files,preview=false){return files.length?`<div class="uc-attachments">${files.map((f,i)=>`<div class="uc-file">${preview?`<img class="uc-reply-image" src="${esc(f.data)}" alt="${esc(f.name)}">`:''}<span>${esc(f.name)}</span>${link('移除','remove-file',`data-file="${i}"`)}</div>`).join('')}</div>`:''}

  function openEditor(kind,draft,followId=null){if(main.editor)return;const e={kind,draft,baseline:JSON.stringify(draft),followId,references:{orders:false},selectingOrders:kind==='orders',uploading:false};if(kind==='orders'){e.orderPage=1;e.orderPageSize=10;e.selection=clone(draft.linked);e.selectionBaseline=JSON.stringify(e.selection);e.orderSearch={start:'',end:'',keywordType:'phone',keyword:main.record.phone||'',consultant:''};e.orderFilters=clone(e.orderSearch)}main.editor=e;e.layer=openLayer(kind==='orders'?(draft.linked.length?'调整关联订单':'关联订单'):kind==='assessment'?'责任认定':kind==='compensation'?'解决方案':kind==='reply'?'回复客户':followId?'编辑跟进':'写跟进','','',main.layer?2:1);e.layer.editor=true;e.layer.el.querySelector('.uc-drawer').dataset.size=['reply','follow'].includes(kind)?'small':'medium';e.layer.el.querySelector('.uc-drawer').style.setProperty('--archive-drawer-width',['reply','follow'].includes(kind)?'560px':'860px');e.layer.el.querySelector('.uc-drawer').classList.add('uc-operation-drawer',kind==='orders'?'uc-orders-editor':kind==='assessment'?'uc-assessment-drawer':kind==='compensation'?'uc-compensation-drawer':kind==='reply'?'uc-reply-editor':'uc-follow-editor');renderEditor()}
  function editorContext(){const r=main.record;return `<div class="uc-editor-context"><div><strong>${esc(r.name)}</strong><span>${esc(r.phone)}</span><span>${esc(r.store)}</span></div><div class="uc-muted">投诉 ${r.id} · ${CHANNELS[r.channel]} · ${fmt(r.created)}${statusTag(r.status)}</div></div>`}
  function renderEditor(resetScroll=false){const e=main.editor;if(!e)return;const body=e.layer.el.querySelector('.uc-drawer-body'),scroll=resetScroll?0:body.scrollTop;e.layer.el.querySelector('.uc-layer-top').innerHTML=editorContext();body.classList.add('uc-editor-body');body.innerHTML=e.kind==='orders'?orderPickerView():e.kind==='assessment'?assessmentForm():e.kind==='compensation'?`<div id="uc-compensation-form" data-draft="compensation" novalidate>${solutionForm()}</div>`:e.kind==='reply'?replyForm():followForm();body.scrollTop=scroll;renderEditorFooter()}
  function renderEditorFooter(){const e=main.editor;if(!e)return;const foot=e.layer.el.querySelector('.uc-drawer-foot');if(foot.querySelector('.uc-discard'))return;
    if(e.kind==='orders'){foot.innerHTML=btn('取消','dismiss')+btn('保存关联','confirm-orders','',true);return}
    if(e.kind==='reply'){foot.innerHTML=btn('取消','dismiss')+btn('保存回复','save-reply',e.uploading?'disabled':'',true);return}
    if(e.kind==='assessment'){foot.innerHTML=btn('取消','dismiss')+btn(e.draft.handlingPlan==='resolved'?'提交并结案':'提交认定','save-assessment',e.uploading?'disabled':'',true);return}
    if(e.kind==='compensation'){foot.innerHTML=solutionFoot()+btn('取消','dismiss')+btn('确认方案','save-compensation',e.uploading?'disabled':'',true);return}
    foot.innerHTML=btn('取消','dismiss')+btn(e.followId?'保存修改':'保存跟进','save-follow',e.uploading?'disabled':'',true);
  }
  // Adapted from complaint-prototype/workflow proposalForm and ticket-operations.
  // The unified module uses its own customers, orders and saved handling records.
  const SOLUTION_METHODS={refund:'退款',exchange:'商品置换'};
  const SOLUTION_PRODUCTS=[{id:'repair-cream',name:'舒缓修护霜 50g',unitPrice:18000},{id:'repair-mask',name:'舒缓修护面膜 5片装',unitPrice:12000},{id:'hydrating-serum',name:'保湿精华 30ml',unitPrice:26000}];
  const PAYOUT_METHODS={bank:'银行卡',alipay:'支付宝',wechat:'微信'};
  const centsText=value=>(Number(value||0)/100).toFixed(2);
  function toCents(value){const text=String(value??'').trim();if(!/^\d+(\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(amount)?amount:null}
  const centsMoney=value=>'¥'+money(Number(value||0)/100);
  function savedRefundOrders(p){if(Array.isArray(p?.refundOrders))return p.refundOrders;if(p?.refundOrderId)return [{orderId:p.refundOrderId,refund:p.refund||0,refundItems:p.refundItems||[]}];return []}
  function refundKey(orderId,itemId){return orderId+':'+itemId}
  let solutionLoading;
  function loadSolutionTools(){
    if(window.PCModules['complaint-solutions'])return Promise.resolve();
    if(solutionLoading)return solutionLoading;
    solutionLoading=new Promise((resolve,reject)=>{const script=document.createElement('script'),fail=()=>{clearTimeout(timer);script.remove();solutionLoading=null;reject(new Error('解决方案加载失败，请重试'))},timer=setTimeout(fail,30000);script.src=window.PC_ASSETS.modules['complaint-solutions'].script;script.onload=()=>{clearTimeout(timer);window.PCModules['complaint-solutions']?resolve():fail()};script.onerror=fail;document.head.append(script)});
    return solutionLoading;
  }
  function solutionTools(){return window.PCModules['complaint-solutions'].create({clone,solutionOrders,savedRefundOrders,refundEntries,refundKey,centsText,getRecord:()=>main.record,SOLUTION_METHODS,toCents,refundAvailable,SOLUTION_PRODUCTS,PAYOUT_METHODS,validHandlingFile,getRecords:()=>records,selectedRefundEntries,esc,centsMoney,input,link,field,select,empty,solutionTotals,renderSolutionFields})}
  function solutionDraft(saved){return solutionTools().solutionDraft(saved)}
  function validateCustomerSolution(draft){return solutionTools().validateCustomerSolution(draft)}
  function solutionOrders(){const r=main.record;return r.customerId?orders.filter(order=>order.customerId===r.customerId):orders.filter(order=>(r.linked||[]).some(link=>link.id===order.id))}
  function selectedRefundEntries(p){return refundEntries().filter(row=>p.refundOrderIds.includes(row.order.id))}
  function refundItems(order){return (order?.projects||[]).map(p=>({...p,paid:p.paid||0,refunded:p.refunded||0}))}
  function refundEntries(){return solutionOrders().flatMap((order,orderIndex)=>refundItems(order).map((item,itemIndex)=>({order,item,key:refundKey(order.id,item.id),field:'refund-'+orderIndex+'-'+itemIndex})))}
  function refundAvailable(order,item){const reserved=records.filter(r=>r.id!==main.record.id).flatMap(r=>savedRefundOrders(r.customerSolution)).filter(group=>group.orderId===order.id).reduce((sum,group)=>sum+(item?(group.refundItems||[]).filter(i=>i.itemId===item.id).reduce((n,i)=>n+(i.amount||0),0):group.refund||0),0);return Math.max(0,(item?item.paid-(item.refunded||0):refundItems(order).reduce((n,i)=>n+i.paid-i.refunded,0))-reserved)}
  function solutionTotals(p){return {refund:p.methods.includes('refund')?selectedRefundEntries(p).reduce((n,row)=>n+(toCents(p.refundAmounts[row.key])||0),0):0,exchange:p.methods.includes('exchange')?p.exchangeItems.reduce((n,row)=>n+(SOLUTION_PRODUCTS.find(item=>item.id===row.productId)?.unitPrice||0)*(Number.isInteger(+row.quantity)&&+row.quantity>0?+row.quantity:0),0):0}}
  function solutionControl(name,label,value,placeholder='',options={}){const {type='text',required=true,full=false,max=100,items}=options;const attr=`data-solution="${name}" maxlength="${max}"${required?' required aria-required="true"':''}`;const control=items?select('solution-'+name,items,value,placeholder,attr):type==='textarea'?`<textarea id="uc-solution-${name}" class="uc-input" rows="3" placeholder="${esc(placeholder)}" ${attr}>${esc(value)}</textarea>`:input('solution-'+name,value,placeholder,type,attr+(type==='number'?' min="0.01" step="0.01" inputmode="decimal"':''));return field('solution-'+name,label,control,required,'',full)}
  function solutionForm(){const p=main.editor.draft.customerSolution;const methods=`<div class="uc-solution-choices" id="uc-solutionMethods" role="group" aria-label="处理方式" tabindex="-1">${Object.entries(SOLUTION_METHODS).map(([key,label])=>`<label><input type="checkbox" data-solution-method value="${label}" ${p.methods.includes(key)?'checked':''}><span>${label}</span></label>`).join('')}</div>`;return `<div class="uc-solution-method">${field('solutionMethods','处理方式',methods,true)}</div><div id="uc-solution-fields">${solutionFields()}</div>`}
  function solutionFields(){const p=main.editor.draft.customerSolution,has=key=>p.methods.includes(key),funded=has('refund');return [
    has('refund')?section('订单退款',refundEditor()):'',
    has('exchange')?section('商品置换',exchangeEditor()+`<div class="uc-grid ub-form" data-pc-columns="2">${solutionControl('delivery-name','收货姓名',p.delivery.name,'填写收货姓名',{max:50})}${solutionControl('delivery-phone','收货电话',p.delivery.phone,'填写收货电话',{type:'tel',max:30})}${solutionControl('delivery-address','收货地址',p.delivery.address,'填写完整收货地址',{max:300,full:true})}</div>`,btn('添加商品','solution-add-product')):'',
    funded?section('收款信息',`<div class="uc-grid ub-form" data-pc-columns="2">${solutionControl('payout-name',p.payout.method==='bank'?'开户姓名':'收款人姓名',p.payout.name,p.payout.method==='bank'?'填写与银行卡一致的开户姓名':'填写收款人姓名',{max:50})}${solutionControl('payout-account','收款账号',p.payout.account,'填写对应的收款账号')}${p.payout.method==='bank'?solutionControl('payout-bank','开户银行',p.payout.bank,'银行名称及支行',{full:true}):''}</div>`,`<div class="uc-solution-radios" role="group" aria-label="收款方式">${Object.entries(PAYOUT_METHODS).map(([key,label])=>`<label><input type="radio" name="solutionPayout" data-solution="payout-method" value="${key}"${p.payout.method===key?' checked':''}>${label}</label>`).join('')}</div>`):'',
    section('方案附件',`<div class="uc-upload-row">${btn('上传附件','upload-solution',main.editor.uploading?'disabled':'')}<input type="file" id="uc-solution-upload" accept="${Object.keys(HANDLING_FILE_TYPES).map(ext=>'.'+ext).join(',')}" multiple hidden data-upload="solution"><span class="uc-muted">支持图片、PDF、Word、Excel、录音，最多 4 个，每个 5MB 以内</span></div><div id="uc-upload-list" aria-live="polite">${draftFiles(p.attachments)}</div><div class="uc-error" id="uc-error-solution-attachments"></div>`),
  ].join('')}
  function refundEditor(){return solutionTools().refundEditor(main.editor.draft.customerSolution)}
  function exchangeEditor(){const p=main.editor.draft.customerSolution;return `<div class="uc-solution-projects" data-field="solution-exchangeItems"><div class="table-wrap uc-table-wrap"><table class="uc-table uc-exchange-table" data-pc-align="left" data-pc-min-height="0"><colgroup><col><col style="width:130px"><col style="width:110px"><col style="width:140px"><col style="width:65px"></colgroup><thead><tr><th>商品名称</th><th>单价</th><th>数量</th><th>商品价值</th><th>操作</th></tr></thead><tbody>${p.exchangeItems.length?p.exchangeItems.map((row,index)=>{const product=SOLUTION_PRODUCTS.find(i=>i.id===row.productId);return `<tr><td>${select('solution-product-'+index,SOLUTION_PRODUCTS.map(i=>[i.id,i.name]),row.productId,'请选择商品',`data-filterable data-exchange-product="${index}" aria-label="第 ${index+1} 项置换商品"`)}</td><td>${product?centsMoney(product.unitPrice):'—'}</td><td>${input('solution-quantity-'+index,row.quantity,'数量','number',`data-exchange-quantity="${index}" min="1" max="9999" step="1" aria-label="第 ${index+1} 项商品数量"`)}</td><td data-exchange-subtotal="${index}">${centsMoney((product?.unitPrice||0)*(Number.isInteger(+row.quantity)&&+row.quantity>0?+row.quantity:0))}</td><td>${link('移除','solution-remove-product',`data-index="${index}"`)}</td></tr>`}).join(''):`<tr><td colspan="5">${empty('请添加置换商品')}</td></tr>`}</tbody></table></div><div class="uc-solution-subtotal"><span>商品价值不计入应付款</span><span>商品总价值 <strong data-solution-total="exchange">${centsMoney(solutionTotals(p).exchange)}</strong></span></div><div class="uc-error" id="uc-error-solution-exchangeItems"></div></div>`}
  function renderSolutionFields(focusId){const e=main.editor,body=e.layer.el.querySelector('.uc-drawer-body'),scroll=body.scrollTop;e.layer.el.querySelector('#uc-solution-fields').innerHTML=solutionFields();body.scrollTop=scroll;updateSolutionTotals();if(focusId)e.layer.el.querySelector('#'+focusId)?.focus({preventScroll:true})}
  function solutionFoot(){const p=main.editor.draft.customerSolution,totals=solutionTotals(p),funded=p.methods.includes('refund');return `<div class="uc-solution-total" aria-live="polite">${funded?`<span>应付款合计</span><strong>${centsMoney(totals.refund)}</strong>`:p.methods.includes('exchange')?`<span>商品总价值</span><strong>${centsMoney(totals.exchange)}</strong>`:''}</div>`}
  function updateSolutionTotals(){const e=main.editor,p=e.draft.customerSolution,totals=solutionTotals(p);e.layer.el.querySelectorAll('[data-solution-total]').forEach(el=>el.textContent=centsMoney(totals[el.dataset.solutionTotal]));e.layer.el.querySelectorAll('[data-exchange-subtotal]').forEach(el=>{const row=p.exchangeItems[+el.dataset.exchangeSubtotal];el.textContent=centsMoney((SOLUTION_PRODUCTS.find(i=>i.id===row.productId)?.unitPrice||0)*(Number.isInteger(+row.quantity)&&+row.quantity>0?+row.quantity:0))});e.layer.el.querySelectorAll('[data-refund-all]').forEach(all=>{const boxes=[...all.closest('.uc-refund-order-group').querySelectorAll('[data-refund-item]:not(:disabled)')];all.indeterminate=boxes.some(i=>i.checked)&&!boxes.every(i=>i.checked)});solutionTools().updateRefundQuantities(p,e.layer.el);renderEditorFooter()}
  function syncSolution(el){const e=main?.editor;if(e?.kind!=='compensation')return false;const p=e.draft.customerSolution;
    if(el.hasAttribute('data-solution-method')){const key=Object.keys(SOLUTION_METHODS).find(key=>SOLUTION_METHODS[key]===el.value);if(!key)return true;p.methods=el.checked?[...new Set([...p.methods,key])]:p.methods.filter(i=>i!==key);p.methods=Object.keys(SOLUTION_METHODS).filter(key=>p.methods.includes(key));const widget=el.closest('.uc-solution-choices');widget.querySelectorAll('input[data-solution-method]').forEach(i=>i.checked=p.methods.some(k=>SOLUTION_METHODS[k]===i.value));e.layer.el.querySelector('#uc-error-solutionMethods').textContent='';widget.removeAttribute('aria-invalid');renderSolutionFields();return true}
    if(el.hasAttribute('data-solution')){const key=el.dataset.solution,parts=key.split('-'),old=parts.length===2?p[parts[0]][parts[1]]:p[key];if(old===el.value)return true;if(parts.length===2)p[parts[0]][parts[1]]=el.value;else p[key]=el.value;el.removeAttribute('aria-invalid');const err=e.layer.el.querySelector('#uc-error-solution-'+key);if(err)err.textContent='';if(key==='payout-method'){renderSolutionFields();e.layer.el.querySelector('[data-solution="payout-method"]:checked')?.focus({preventScroll:true})}else updateSolutionTotals();return true}
    if(solutionTools().syncRefund(el,p,e.layer.el)){updateSolutionTotals();return true}
    if(el.hasAttribute('data-exchange-product')){p.exchangeItems[+el.dataset.exchangeProduct].productId=el.value;renderSolutionFields(el.id);return true}
    if(el.hasAttribute('data-exchange-quantity')){p.exchangeItems[+el.dataset.exchangeQuantity].quantity=el.value;e.layer.el.querySelector('#uc-error-solution-exchangeItems').textContent='';el.removeAttribute('aria-invalid');updateSolutionTotals();return true}return false;
  }
  function solutionAction(action,b){const e=main?.editor;if(e?.kind!=='compensation')return;const p=e.draft.customerSolution;
    if(action==='solution-full-refund'){const row=refundEntries().find(row=>row.key===b.dataset.item);if(row)solutionTools().selectFullRefund(p,row);renderSolutionFields();e.layer.el.querySelector('[data-refund-amount="'+b.dataset.item+'"]')?.focus({preventScroll:true})}
    if(action==='solution-add-product'){if(p.exchangeItems.length>=20){toast('最多添加 20 项商品');return}p.exchangeItems.push({productId:'',quantity:'1'});renderSolutionFields('uc-solution-product-'+(p.exchangeItems.length-1))}
    if(action==='solution-remove-product'){p.exchangeItems.splice(+b.dataset.index,1);renderSolutionFields();e.layer.el.querySelector('[data-uc=solution-add-product]')?.focus({preventScroll:true})}
  }
  function solutionRead(p,historyIndex=''){
    if(!p)return '<span class="uc-muted">暂未填写解决方案</span>';
    const methods=p.handlingMethods||[],has=key=>methods.includes(key),labels=methods.map(key=>key==='compensation'?'赔偿（历史）':SOLUTION_METHODS[key]).filter(Boolean),details=[];
    if(labels.length)details.push(detail('处理方式',labels.join('、'),true));
    if(has('refund')){details.push(detail('退款金额',centsMoney(p.refund),true));for(const order of savedRefundOrders(p))details.push(detail('退款订单',order.orderId,true),detail('退款项目',(order.refundItems||[]).map(i=>i.name+' · '+centsMoney(i.amount)+(Number.isSafeInteger(i.refundQuantity)?' · 本次退款数量 '+i.refundQuantity+' · 退款前剩余 '+i.remainingBefore+' → 退款后剩余 '+i.remainingAfter:' · 退款数量未记录')).join('；'),true),...(order.refundStore?[detail('退款所属门店',order.refundStore),detail('业绩归属人员',order.performanceId),detail('退款原因备注',order.refundReason,true)]:[]))}
    if(has('compensation'))details.push(detail('赔偿金额',centsMoney(p.compensation)),detail('赔偿原因备注',p.compensationReason,true));
    if(has('exchange'))details.push(detail('置换商品',(p.exchangeItems||[]).map(i=>i.name+' × '+i.quantity+' · '+centsMoney(i.unitPrice*i.quantity)).join('；'),true),detail('收货人',(p.delivery?.name||'')+' · '+(p.delivery?.phone||'')),detail('收货地址',p.delivery?.address,true));
    if(p.payout)details.push(detail('收款方式',PAYOUT_METHODS[p.payout.method]),detail('收款人',p.payout.name),detail('收款账号',p.payout.account),...(p.payout.method==='bank'?[detail('开户银行',p.payout.bank)]:[]));
    if(has('service')&&p.content)details.push(detail('处理说明',p.content,true));
    return (details.length?`<div class="uc-details">${details.join('')}</div>`:'')+filesView(p.attachments||[],'solution-history',historyIndex);
  }
  function contactForm(){const d=main.editor.draft;return `<div class="uc-grid ub-form" data-pc-columns="2">${field('firstContact','第一联系人',input('firstContact',d.firstContact,'以客户陈述为准','text','maxlength="80"'),false)}${field('contactTime','投诉时间',input('contactTime',d.contactTime,'','datetime-local'),false)}${field('customerStatement','客户陈述',`<textarea id="uc-customerStatement" name="customerStatement" class="uc-input" rows="3" maxlength="500" placeholder="补充客户原话（选填）">${esc(d.customerStatement)}</textarea>`,false,'',true)}</div>`}
  function responsibleOptions(selected=[],directory=EMPLOYEES,items=records,orderItems=orders){
    const names=new Map();
    const add=(value,status='')=>multiValues(value).forEach(name=>{if(!names.has(name)||status)names.set(name,status)});
    directory.forEach(person=>add(person.name,person.employmentStatus));
    // Historical names remain searchable even after they leave or vanish from a current roster.
    items.forEach(record=>{add(record.responsible);(record.follows||[]).forEach(f=>{add(f.responsible);add(f.before?.responsible)})});
    orderItems.forEach(order=>{['consultant','receptionSales','manager','inviter','reception','operator'].forEach(key=>add(order[key]));(order.wechatChoices||[]).forEach(w=>add(w.promoter));orderProjects(order).forEach(project=>['consultant','collaborator','biller','operator','reception'].forEach(key=>add(project[key])))});
    add(selected);
    return [...names].map(([name,status])=>[name,name+(status==='离职'?'（离职）':'')]);
  }
  function multiSelect(name,label,options,value,attrs=''){const selected=multiValues(value),items=new Map(options.map(item=>Array.isArray(item)?item:[item,item]));selected.forEach(item=>{if(!items.has(item))items.set(item,item)});return `<select id="uc-${name}" name="${name}" multiple data-filterable placeholder="${name==='responsible'?'搜索姓名，含离职人员':'请选择'+label}" aria-label="${label}，必填，可多选" ${attrs}>${[...items].map(([value,text])=>`<option value="${esc(value)}"${selected.includes(value)?' selected':''}>${esc(text)}</option>`).join('')}</select>`;}
  function levelFields(d){return field('level','客诉等级',select('level',LEVELS,d.level,'请选择客诉等级','required aria-required="true"'),true)+field('level4Type','风险类型',select('level4Type',LEVEL4_TYPES,level4Type(d),'请选择风险类型',d.level==='4级'?'required aria-required="true"':'disabled'),true).replace('data-field="level4Type"','data-field="level4Type"'+(d.level==='4级'?'':' hidden'))}
  function responsibilityForm(){const d=main.editor.draft,hasDepartment=multiValues(d.department).length>0,closed=d.type==='闭店';return `<div class="uc-grid ub-form" data-pc-columns="2">${field('department','责任部门',multiSelect('department','责任部门',['推广','销售','门店'],d.department),true)}${field('type','售后类型',select('type',TYPES,d.type,hasDepartment?'请选择售后类型':'请先选择责任部门',`required aria-required="true" ${hasDepartment?'':'disabled'}`),true)}<div class="uc-full uc-rule" ${responsibilityRule(d.type)?'':'hidden'}><span>归因参考：</span><span id="uc-rule-text">${responsibilityRule(d.type)}</span></div>${field('responsible','责任人',multiSelect('responsible','责任人',responsibleOptions(d.responsible),d.responsible,hasDepartment&&d.type&&!closed?'required aria-required="true"':'disabled'),true).replace('data-field="responsible"','data-field="responsible"'+(closed?' hidden':''))}${levelFields(d)}${field('reason','责任原因',`<textarea id="uc-reason" name="reason" class="uc-input" rows="3" maxlength="1000" placeholder="填写责任原因">${esc(d.reason)}</textarea>`,false,'',true)}</div>`}
  function handlingPlanForm(){const d=main.editor.draft;return `<div class="uc-plan-field">${field('handlingPlan','处理结果',select('handlingPlan',HANDLING_PLANS,d.handlingPlan,'请选择','required aria-required="true"'),true)}</div><div class="uc-handling-attachments"><div class="uc-field-label">附件<span class="uc-muted">（选填）</span></div><div class="uc-upload-row"><button type="button" class="btn" data-uc="upload-handling">上传附件</button><input type="file" id="uc-handling-upload" accept="${Object.keys(HANDLING_FILE_TYPES).map(ext=>'.'+ext).join(',')}" multiple hidden data-upload="handling"><span class="uc-muted">支持图片、PDF、Word、Excel、录音，最多 4 个，每个 5MB 以内</span></div><div id="uc-upload-list" aria-live="polite">${draftFiles(d.handlingFiles)}</div></div>`}
  function assessmentCommon(){const e=main.editor,linked=main.record.linked,orderNames=linked.map(item=>resolveLink(item).order).filter(Boolean).map(o=>o.store||o.id),orderText=linked.length?linked.length+' 笔订单 · '+[...new Set(orderNames)].join('、'):'暂未关联订单';return `<section class="uc-assessment-common" aria-label="公共订单与客户反馈">
    <div class="uc-feedback-editor" aria-label="客户反馈"><div class="uc-feedback-original"><span class="uc-reference-label">投诉内容</span><div>${esc(main.record.content||'未填写')}</div></div>${contactForm()}</div>
    <div class="uc-reference-group"><div class="uc-reference-row"><span class="uc-reference-label">关联订单</span><span class="uc-reference-summary" title="${esc(orderText)}">${esc(orderText)}</span>${linked.length?link(e.references.orders?'收起':'查看订单信息','assessment-reference',`data-reference="orders" aria-expanded="${e.references.orders}" aria-controls="uc-reference-orders"`):''}</div><div class="uc-reference-content" id="uc-reference-orders" ${e.references.orders?'':'hidden'}>${linked.length?orderCards(linked):''}</div></div>
  </section>`}
  function toggleAssessmentReference(button){const e=main?.editor;if(e?.kind!=='assessment'||button.dataset.reference!=='orders')return;e.references.orders=!e.references.orders;e.layer.el.querySelector('#uc-reference-orders').hidden=!e.references.orders;button.setAttribute('aria-expanded',String(e.references.orders));button.textContent=e.references.orders?'收起':'查看订单信息'}
  function assessmentForm(){return `<div id="uc-assessment-form" data-draft="assessment" novalidate>${assessmentCommon()}${section('责任认定',responsibilityForm())}${section('提交信息',handlingPlanForm())}</div>`}
  function followForm(){const d=main.editor.draft;return `<div id="uc-follow-form" data-draft="follow" novalidate>${field('note','跟进内容',`<textarea id="uc-note" name="note" class="uc-input uc-follow-note" rows="6" maxlength="2000" placeholder="记录沟通情况、处理进展或下一步安排">${esc(d.note)}</textarea>`,false)}<div class="uc-upload-row">${btn('添加图片','upload-follow')}<input type="file" id="uc-upload" accept="image/png,image/jpeg" multiple hidden data-upload="follow"><span class="uc-muted">最多 4 张，每张 5MB 以内</span></div><div id="uc-upload-list">${draftFiles(d.files)}</div></div>`}
  function replyForm(){const d=main.editor.draft;return `<div id="uc-reply-form" data-draft="reply" novalidate>${field('note','回复内容',`<textarea id="uc-note" name="note" class="uc-input" rows="6" maxlength="2000" placeholder="填写回复客户的内容">${esc(d.note)}</textarea>`)}${field('replyImages','图片',`<div><div class="uc-upload-row">${btn('添加图片','upload-reply','id="uc-replyImages"')}<input type="file" id="uc-reply-upload" accept="image/png,image/jpeg" multiple hidden data-upload="reply"></div><div class="uc-help">最多 4 张，每张 5MB 以内，支持 JPG、PNG</div><div id="uc-upload-list" aria-live="polite">${draftFiles(d.files,true)}</div></div>`)}</div>`}
  function beginReply(){if(!main||main.editor)return;openEditor('reply',{note:'',files:[]})}
  function askStartProcessing(){if(!main||main.editor||main.record.status!=='待处理')return;PCUI.confirm({title:'开始处理',content:'确认开始处理客诉吗',onConfirm:()=>{const next=clone(records),r=next.find(r=>r.id===main.record.id);if(!recordStartProcessing(r,now()))return;if(commitRecord(next,'开始处理','确认开始处理客诉'))toast('已开始处理，请填写责任认定')}})}
  function beginAssessment(){if(main.record.status!=='处理中'){toast(main.record.status==='已完成'?'该客诉已结案':'请先确认开始处理该客诉');return}openEditor('assessment',{...valuesFrom(main.record,RECOGNITION_FIELDS),handlingPlan:main.record.handlingPlan||'',handlingFiles:clone(main.record.handlingFiles||[])})}
  async function beginCompensation(){if(!main||main.editor)return;const detail=main;try{await loadSolutionTools();if(main!==detail||main.editor||main.layer.closing)return;openEditor('compensation',{customerSolution:solutionDraft(main.record.customerSolution)})}catch(error){if(main===detail)toast(error.message)}}
  function beginFollow(){if(!['处理中','已完成'].includes(main.record.status)){toast('请先处理该客诉');return}openEditor('follow',{note:'',files:[]})}
  function editFollowRecord(id){const f=main.record.follows.find(f=>f.id===id);if(f&&!['start','assessment','handling','compensation','closure','reply'].includes(f.kind)&&f.actor===ACTOR)openEditor('follow',{note:f.note,files:clone(f.files||[])},id)}
  function syncDraft(el){if(syncSolution(el))return;const e=main?.editor;if(e?.kind==='orders'&&el.closest('#uc-order-search')){readOrderSearch();updateOrderDateButtons();e.layer.el.querySelector('#uc-order-search-error').textContent='';return}if(!e||!el.closest('[data-draft]')||!Object.hasOwn(e.draft,el.name))return;e.draft[el.name]=el.multiple?[...el.selectedOptions].map(option=>option.value):el.value;el.removeAttribute('aria-invalid');e.layer.el.querySelector('#uc-'+el.name)?.removeAttribute('aria-invalid');const err=e.layer.el.querySelector('#uc-error-'+el.name);if(err)err.textContent='';if(e.kind==='assessment'){
    if(el.name==='level'){const related=e.layer.el.querySelector('#uc-level4Type'),active=e.draft.level==='4级';if(!active)e.draft.level4Type='';related.value=level4Type(e.draft);related.disabled=!active;related.required=active;related.setAttribute('aria-required',String(active));related.closest('[data-field]').hidden=!active;related.removeAttribute('aria-invalid');related.removeAttribute('aria-describedby');e.layer.el.querySelector('#uc-error-level4Type').textContent='';PCUI.syncControl(related)}
    if(el.name==='handlingPlan'){e.layer.el.querySelectorAll('[name=handlingPlan]').forEach(input=>input.removeAttribute('aria-invalid'));renderEditorFooter()}
    if(el.name==='department'){const type=e.layer.el.querySelector('[name=type]'),hasDepartment=multiValues(e.draft.department).length>0;type.disabled=!hasDepartment;if(!hasDepartment){e.draft.type='';type.value=''}type.options[0].textContent=hasDepartment?'请选择售后类型':'请先选择责任部门';PCUI.syncControl(type)}
    if(['department','type'].includes(el.name)){const responsible=e.layer.el.querySelector('[name=responsible]'),closed=e.draft.type==='闭店';responsible.disabled=!multiValues(e.draft.department).length||!e.draft.type||closed;responsible.required=!responsible.disabled;responsible.setAttribute('aria-required',String(responsible.required));responsible.closest('[data-field]').hidden=closed;e.layer.el.querySelector('#uc-error-responsible').textContent='';PCUI.syncControl(responsible)}
    const rule=e.layer.el.querySelector('#uc-rule-text');if(rule){rule.textContent=responsibilityRule(e.draft.type);rule.parentElement.hidden=!rule.textContent}
  }}
  function commitRecord(next,action,text){const r=next.find(r=>r.id===main.record.id);r.logs.unshift({time:now(),actor:ACTOR,action,text});if(!persist(next))return false;main.record=r;renderList();renderDetail();return true}
  function saveAssessment(){
    const e=main.editor;
    if(e.uploading){toast('附件正在读取，请稍后保存');return}
    clearErrors(e.layer.el);const missing=handlingMissing(e.draft);
    if(missing.length){const [first]=missing[0];missing.forEach(([name,message])=>error(e.layer.el,name,message));const control=e.layer.el.querySelector('#uc-'+first)||e.layer.el.querySelector('[data-field="'+first+'"] input')||e.layer.el.querySelector('[data-field="'+first+'"] select');PCUI.focusControl(control);(control||e.layer.el.querySelector('#uc-error-'+first))?.scrollIntoView({block:'center'});return}
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=recordRecognition(r,e.draft,now());
    if(!entry){closeLayer(true);toast('处理信息未变更');return}
    if(!commitRecord(next,entry.action,JSON.stringify(recognitionLog(entry.before))+' → '+JSON.stringify(recognitionLog(recognitionSnapshot(r)))))return;
    closeLayer(true);toast(r.status==='已完成'?'责任认定已保存，客诉已结案':'责任认定已保存，继续沟通');
  }
  function saveCompensation(){
    const e=main?.editor;if(e?.kind!=='compensation')return;if(e.uploading){toast('附件正在读取，请稍后保存');return}
    clearErrors(e.layer.el);const solution=validateCustomerSolution(e.draft.customerSolution);
    if(solution.errors.length){solution.errors.forEach(([name,message])=>error(e.layer.el,name,message));const [first]=solution.errors[0],control=e.layer.el.querySelector('#uc-'+first)||e.layer.el.querySelector('[data-field="'+first+'"] input')||e.layer.el.querySelector('[data-uc=solution-add-product]');PCUI.focusControl(control);(control||e.layer.el.querySelector('#uc-error-'+first))?.scrollIntoView({block:'center'});return}
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=recordCompensation(r,solution.value,now());
    if(!entry){closeLayer(true);toast('解决方案未变更');return}
    if(!commitRecord(next,'保存解决方案',JSON.stringify(entry.before)+' → '+JSON.stringify(entry.customerSolution)))return;
    closeLayer(true);toast('解决方案已保存');
  }
  function saveReply(){const e=main?.editor;if(e?.kind!=='reply')return;if(e.uploading){toast('图片正在读取，请稍后保存');return}clearErrors(e.layer.el);const note=e.draft.note.trim();if(!note&&!e.draft.files.length){error(e.layer.el,'note','请填写回复内容或添加图片');e.layer.el.querySelector('#uc-note').focus();return}const next=clone(records),r=next.find(r=>r.id===main.record.id);r.follows.unshift({id:r.id+'-reply-'+Date.now()+'-'+r.follows.length,kind:'reply',time:now(),actor:ACTOR,note,files:clone(e.draft.files),beforeStatus:r.status,status:r.status});if(!commitRecord(next,'回复客户',note||(e.draft.files.length+' 张图片')))return;closeLayer(true);toast('回复已保存，可在跟进记录中查看')}
  function saveFollow(){const e=main.editor;if(e.uploading){toast('图片正在读取，请稍后保存');return}const d=e.draft,next=clone(records),r=next.find(r=>r.id===main.record.id),time=now();let log;
    if(e.followId){const f=r.follows.find(f=>f.id===e.followId);if(!f||['start','assessment','handling','compensation','closure','reply'].includes(f.kind)||f.actor!==ACTOR)return;log=f.note+' → '+d.note.trim();f.revisions??=[];f.revisions.push({time,actor:ACTOR,note:f.note,files:clone(f.files||[])});f.note=d.note.trim();f.files=clone(d.files);f.updatedAt=time;f.updatedBy=ACTOR}
    else{if(!recordFollow(r,d,time)){toast('请先处理该客诉');return}log=d.note.trim()}
    if(!commitRecord(next,e.followId?'修改跟进':'新增跟进',log))return;closeLayer(true);toast('跟进已保存');
  }
  function askClosure(){if(!canClose(main.record))return;PCUI.confirm({title:'确认结案',content:'确认该客诉已处理完成并结案？',onConfirm:confirmClosure});}
  function confirmClosure(){const next=clone(records),r=next.find(r=>r.id===main.record.id);if(!recordClosure(r,now()))return;if(!commitRecord(next,'结案','已确认客诉处理完成'))return;main.layer.el.querySelector('.uc-drawer-foot button')?.focus();toast('客诉已结案')}
  function openPicker(){if(main.record.status==='已完成')return;openEditor('orders',{linked:clone(main.record.linked)});main.editor.layer.el.querySelector('#uc-orderKeyword').focus()}
  function orderDateRange(preset,today=now().slice(0,10)){
    const [year,month,day]=today.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day)),format=value=>value.toISOString().slice(0,10);let start=new Date(date),end=new Date(date);
    if(preset==='lastMonth'){start=new Date(Date.UTC(year,month-2,1));end=new Date(Date.UTC(year,month-1,0))}
    else if(preset==='yesterday'){start.setUTCDate(day-1);end=new Date(start)}
    else if(preset==='week'){start.setUTCDate(day-(date.getUTCDay()+6)%7);end=new Date(start);end.setUTCDate(start.getUTCDate()+6)}
    else if(preset==='month'){start=new Date(Date.UTC(year,month-1,1));end=new Date(Date.UTC(year,month,0))}
    return {start:format(start),end:format(end)};
  }
  function matchingOrders(criteria){const key=ORDER_KEYWORDS.some(([value])=>value===criteria.keywordType)?criteria.keywordType:'phone',keyword=(criteria.keyword||'').trim().toLowerCase(),consultant=(criteria.consultant||'').trim().toLowerCase();return orders.filter(o=>{const arrived=(o.arrived||'').slice(0,10);return (!keyword||String(o[key]||'').toLowerCase().includes(keyword))&&(!consultant||String(o.consultant||'').toLowerCase().includes(consultant))&&(!criteria.start||(arrived&&arrived>=criteria.start))&&(!criteria.end||(arrived&&arrived<=criteria.end))})}
  function readOrderSearch(){const e=main.editor,form=e.layer.el.querySelector('#uc-order-search');if(form)e.orderSearch=Object.fromEntries(new FormData(form));return e.orderSearch}
  function updateOrderDateButtons(){const e=main?.editor;if(e?.kind!=='orders')return;const q=e.orderSearch;e.layer.el.querySelectorAll('[data-uc=order-date]').forEach(button=>{const range=orderDateRange(button.dataset.preset);button.setAttribute('aria-pressed',String(q.start===range.start&&q.end===range.end))})}
  function togglePickedOrder(id){const e=main.editor;readOrderSearch();const index=e.selection.findIndex(l=>l.id===id);if(index>=0)e.selection.splice(index,1);else{const order=orders.find(o=>o.id===id),existing=e.draft.linked.find(l=>l.id===id);if(!order)return;e.selection.push(existing?clone(existing):{id:order.id,wechatId:order.bookingWechatId||''})}renderEditor();e.layer.el.querySelector('.uc-order-picker-results [data-order="'+id+'"]')?.focus({preventScroll:true})}
  function orderPickerView(){
    const e=main.editor,q=e.orderSearch,matches=matchingOrders(e.orderFilters),keywordLabel=ORDER_KEYWORDS.find(([key])=>key===q.keywordType)?.[1]||'客户手机';
    e.orderPage=Math.min(e.orderPage,Math.max(1,Math.ceil(matches.length/e.orderPageSize)));const offset=(e.orderPage-1)*e.orderPageSize;
    return `<div class="query-module"><form class="filterbar" id="uc-order-search">
      <div class="mr-date" data-pc-label="到店时间">${input('orderStart',q.start,'开始日期','date','aria-label="到店开始日期"').replace('name="orderStart"','name="start"')}<span>至</span>${input('orderEnd',q.end,'结束日期','date','aria-label="到店结束日期"').replace('name="orderEnd"','name="end"')}</div>
      <div class="refund-quick">${ORDER_DATE_PRESETS.map(([key,label])=>link(label,'order-date',`data-preset="${key}"`)).join('')}</div>
      <div class="refund-keyword" data-pc-label="关键词"><select id="uc-orderKeywordType" name="keywordType" aria-label="关键词类型">${ORDER_KEYWORDS.map(([key,label])=>`<option value="${key}"${q.keywordType===key?' selected':''}>${label}</option>`).join('')}</select>${input('orderKeyword',q.keyword,'输入'+keywordLabel,'text','aria-label="订单关键词"').replace('name="orderKeyword"','name="keyword"')}</div>
      ${input('orderConsultant',q.consultant,'输入咨询姓名','text','aria-label="关联咨询"').replace('name="orderConsultant"','name="consultant"')}
      <div class="query-actions"><button type="submit" form="uc-order-search" class="btn primary">搜索</button>${btn('重置','order-reset')}</div>
    </form><div id="uc-order-search-error" class="uc-error" role="alert"></div></div><div class="uc-order-picker-results"><div class="uc-section-head"><h4>选择关联订单</h4></div><div class="table-wrap uc-table-wrap"><table class="uc-table uc-picker-table"><colgroup><col style="width:44px"><col style="width:83px"><col style="width:90px"><col style="width:105px"><col style="width:160px"><col style="width:115px"><col style="width:70px"><col style="width:78px"><col style="width:91px"></colgroup><thead><tr>${['序号','客户姓名','会员号','客户手机','订单号','门店','咨询','状态','操作'].map(label=>'<th>'+label+'</th>').join('')}</tr></thead><tbody>${matches.length?matches.slice(offset,offset+e.orderPageSize).map((o,i)=>{const selected=e.selection.some(l=>l.id===o.id);return `<tr class="${selected?'uc-picker-selected':''}"><td class="uc-muted">${offset+i+1}</td><td>${listValue(o.name)}${e.orderFilters.keywordType==='customerWechat'?'<span class="pc-block uc-block uc-muted">'+esc(o.customerWechat)+'</span>':''}</td><td>${listValue(o.member)}</td><td>${listValue(o.phone)}</td><td>${listValue(o.id)}<span class="pc-block uc-block uc-muted">${esc(orderProjects(o).map(project=>project.name).filter(Boolean).join('、'))}</span></td><td>${listValue(o.store)}</td><td>${listValue(o.consultant)}</td><td>${o.state?tag(o.state,o.state==='已到店'?'green':'gray'):listValue('')}</td><td>${link(selected?'取消选择':'选择','order-pick',`data-order="${o.id}" aria-pressed="${selected}" aria-label="${selected?'取消选择':'选择'}订单 ${o.id}"`)}</td></tr>`}).join(''):`<tr><td colspan="9">${empty('暂无符合条件的订单')}</td></tr>`}</tbody></table></div>${pagination(matches.length,e.orderPage,e.orderPageSize,'orders')}</div><div class="uc-order-selected" id="uc-selected-orders"><span class="uc-muted">已选 ${e.selection.length} 笔订单</span>${e.selection.map(item=>{const order=orders.find(o=>o.id===item.id);return `<span class="uc-selected-order"><span>${esc(order?.name||'')} · ${esc(item.id)}</span>${link('×','order-pick',`data-order="${item.id}" aria-label="取消选择订单 ${item.id}"`)}</span>`}).join('')}</div>`;
  }
  function confirmOrders(){const e=main.editor;if(e?.kind!=='orders'||main.record.status==='已完成')return;if(JSON.stringify(e.selection)===e.selectionBaseline){closeLayer(true);return}const next=clone(records),r=next.find(r=>r.id===main.record.id),before=clone(r.linked);r.linked=clone(e.selection);if(!commitRecord(next,before.length?'调整关联订单':'关联订单',JSON.stringify(before)+' → '+JSON.stringify(r.linked)))return;closeLayer(true);toast('关联订单已保存')}
  function previewFile(button){const kind=button.dataset.kind,index=Number(button.dataset.index),i=Number(button.dataset.file),r=main.record;const f=kind==='original'?r.files[i]:kind==='handling'?r.handlingFiles?.[i]:kind==='handling-history'?r.follows[index]?.handlingFiles?.[i]:kind==='solution-history'?r.follows[index]?.customerSolution?.attachments?.[i]:kind==='follow'?r.follows[index]?.files[i]:kind==='message'?r.messages[index]?.files[i]:null;if(!f?.data)return;if(isAudioFile(f)){openLayer('录音附件',`<div class="uc-audio-preview"><h4>${esc(f.name)}</h4>${/\.amr$/i.test(f.name)?'<p class="uc-muted">此录音格式请下载后播放</p>':`<audio controls preload="metadata" src="${esc(f.data)}" aria-label="${esc(f.name)}"></audio>`}<a class="uc-link" href="${esc(f.data)}" download="${esc(f.name)}">下载录音</a></div>`,btn('关闭','dismiss'),2);return}if(!String(f.data).startsWith('data:image/')){const a=document.createElement('a');a.href=f.data;a.download=f.name;a.click();return}openLayer('证明材料',`<img class="uc-preview-img" src="${esc(f.data)}" alt="${esc(f.name)}">`,btn('关闭','dismiss'),2)}
  async function uploadFiles(el){const e=main.editor;if(!e||e.uploading)return;const handling=['assessment','compensation'].includes(e.kind),list=e.kind==='compensation'?e.draft.customerSolution.attachments:handling?e.draft.handlingFiles:e.draft.files,files=[...el.files];if(!files.length)return;if(files.length+list.length>4){toast(handling?'最多添加 4 个附件':'最多添加 4 张图片');el.value='';return}if(files.some(f=>f.size>5*1024*1024||(handling?!validHandlingFile(f):!['image/jpeg','image/png'].includes(f.type)))){toast(handling?'请上传不超过 5MB 的图片、PDF、Word、Excel 或 MP3、M4A、WAV、AMR 录音':'请上传不超过 5MB 的 JPG 或 PNG 图片');el.value='';return}e.uploading=true;el.disabled=true;e.layer.el.querySelector('[data-uc=upload-handling],[data-uc=upload-solution]')?.setAttribute('disabled','');renderEditorFooter();try{const results=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const type=handling?handlingFileType(file):file.type;resolve({name:file.name,data:handling?String(reader.result).replace(/^data:[^;]*;/,'data:'+type+';'):reader.result,type,size:file.size})};reader.onerror=reject;reader.readAsDataURL(file)})));if(main?.editor!==e||e.layer.closing)return;list.push(...results);const host=e.layer.el.querySelector('#uc-upload-list');if(host)host.innerHTML=draftFiles(list,e.kind==='reply');if(e.kind==='reply')clearErrors(e.layer.el)}catch(err){toast(handling?'附件读取失败，请重试':'图片读取失败，请重试')}finally{e.uploading=false;el.disabled=false;el.value='';e.layer.el.querySelector('[data-uc=upload-handling],[data-uc=upload-solution]')?.removeAttribute('disabled');if(main?.editor===e)renderEditorFooter()}}
  function complaintCSV(rows){const headers=['序号','投诉单号','客户','手机号','门店','渠道','投诉时间','投诉内容','客诉第一联系人','联系时间','责任部门','售后类型','客诉等级','风险类型','责任人','责任原因','关联订单','工单状态'];const cell=value=>'"'+valueText(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';return '\uFEFF'+[headers,...rows.map((r,i)=>[i+1,r.id,r.name,r.phone,r.store,CHANNELS[r.channel],r.created,r.content,r.firstContact,fmt(r.contactTime),r.department,r.type,r.level,level4Type(r),r.responsible,r.reason,r.linked.map(l=>l.id).join(' / '),r.status])].map(row=>row.map(cell).join(',')).join('\r\n')}
  function exportRows(){const csv=complaintCSV(filtered());const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='统一客诉列表_'+now().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选结果')}

  function handleClick(event){event.stopPropagation();const b=event.target.closest('[data-uc]');if(!b||b.disabled)return;const action=b.dataset.uc,layer=layers.at(-1);if(layer?.closing)return;
    if(action==='detail')openComplaint(b.dataset.id);
    else if(action==='order-detail')openOrderSnapshot(b.dataset.order);
    else if(action==='customer-detail')openCustomerSnapshot(b.dataset.customer);
    else if(action==='write-follow')beginFollow();
    else if(action==='reply-customer')beginReply();
    else if(action==='save-reply')saveReply();
    else if(action==='upload-follow')main.editor.layer.el.querySelector('#uc-upload').click();
    else if(action==='upload-reply')main.editor.layer.el.querySelector('#uc-reply-upload').click();
    else if(action==='dismiss'){if(b.classList.contains('uc-layer')&&event.target!==b)return;closeLayer()}
    else if(action==='keep')restoreFoot(layer);
    else if(action==='discard'){restoreFoot(layer);closeLayer(true)}
    else if(action==='tab')selectDetailTab(b.dataset.tab);
    else if(action==='save-follow')saveFollow();
    else if(action==='edit-follow-record')editFollowRecord(b.dataset.follow);
    else if(action==='assessment-reference')toggleAssessmentReference(b);
    else if(action==='detail-reference')toggleDetailReference(b);
    else if(action.startsWith('solution-'))solutionAction(action,b);
    else if(action==='save-assessment')saveAssessment();
    else if(action==='save-compensation')saveCompensation();
    else if(action==='start-processing')askStartProcessing();
    else if(action==='begin-assessment')beginAssessment();
    else if(action==='begin-compensation')beginCompensation();
    else if(action==='close-case')askClosure();
    else if(action==='cancel-close')main.layer.el.querySelector('.uc-drawer-foot').innerHTML=detailActions(main.record);
    else if(action==='confirm-close')confirmClosure();
    else if(action==='pick-orders')openPicker();
    else if(action==='confirm-orders')confirmOrders();
    else if(action==='order-reset'){const e=main.editor;e.orderSearch={start:'',end:'',keywordType:'phone',keyword:'',consultant:''};e.orderFilters=clone(e.orderSearch);e.orderPage=1;renderEditor(true)}
    else if(action==='order-date'){const e=main.editor;readOrderSearch();Object.assign(e.orderSearch,orderDateRange(b.dataset.preset));renderEditor()}
    else if(action==='order-pick')togglePickedOrder(b.dataset.order);
    else if(action==='file')previewFile(b);
    else if(action==='upload-handling')main.editor.layer.el.querySelector('#uc-handling-upload').click();
    else if(action==='upload-solution')main.editor.layer.el.querySelector('#uc-solution-upload').click();
    else if(action==='remove-file'){const e=main.editor;if(e.uploading)return;const files=e.kind==='compensation'?e.draft.customerSolution.attachments:e.kind==='assessment'?e.draft.handlingFiles:e.draft.files;files.splice(Number(b.dataset.file),1);e.layer.el.querySelector('#uc-upload-list').innerHTML=draftFiles(files,e.kind==='reply')}
    else if(action==='status-tab'){filterDraft={...filterDraft,...Object.fromEntries(new FormData(root.querySelector('#uc-search')))};filters={...filterDraft,status:b.dataset.status};page=1;renderList();root.querySelector('.uc-list-tab[aria-selected=true]')?.focus({preventScroll:true})}
    else if(action==='reset'){filters={status:filters.status||''};filterDraft={};page=1;renderList()}
    else if(action==='more'){filterDraft={...filterDraft,...Object.fromEntries(new FormData(root.querySelector('#uc-search')))};more=!more;renderList()}
    else if(action==='page'){const target=Number(b.dataset.page);if(b.dataset.pagination==='orders'){const e=main.editor;readOrderSearch();e.orderPage=Math.max(1,Math.min(target,Math.ceil(matchingOrders(e.orderFilters).length/e.orderPageSize)||1));renderEditor()}else{page=Math.max(1,Math.min(target,Math.ceil(filtered().length/pageSize)||1));renderList()}}
    else if(action==='export')exportRows();
  }
  function handleChange(event){event.stopPropagation();const el=event.target;syncDraft(el);if(el.id==='uc-orderKeywordType'){const e=main.editor;e.orderSearch.keyword='';const input=e.layer.el.querySelector('#uc-orderKeyword');input.value='';input.placeholder='输入'+(ORDER_KEYWORDS.find(([key])=>key===el.value)?.[1]||'客户手机');input.focus()}if(el.id==='uc-filter-keywordType'){const input=root.querySelector('#uc-filter-keyword');input.value='';input.placeholder='输入'+(ORDER_KEYWORDS.find(([key])=>key===el.value)?.[1]||'客户手机');input.focus()}if(el.dataset.pageSize==='list'){pageSize=Number(el.value);page=1;renderList()}if(el.dataset.pageSize==='orders'){const e=main.editor;readOrderSearch();e.orderPageSize=Number(el.value);e.orderPage=1;renderEditor()}if(el.dataset.upload)uploadFiles(el)}
  function handleSubmit(event){event.preventDefault();event.stopPropagation();if(event.target.id==='uc-search'){const values=Object.fromEntries(new FormData(event.target));filterDraft={...filterDraft,...values};if(filterDraft.start&&filterDraft.end&&filterDraft.start>filterDraft.end){root.querySelector('#uc-query-error').textContent='投诉结束日期不能早于开始日期';return}filters={...filterDraft,status:filters.status||''};page=1;renderList()}if(event.target.id==='uc-order-search'){const e=main.editor,q=readOrderSearch();if(q.start&&q.end&&q.start>q.end){e.layer.el.querySelector('#uc-order-search-error').textContent='到店结束日期不能早于开始日期';return}e.orderFilters=clone(q);e.orderPage=1;renderEditor()}}
  function keyboard(event){if(!root?.isConnected||document.querySelector('#modal .pc-company-dialog'))return;if(event.target.closest('.pc-tabs')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;if(event.key==='Escape'&&PCUI.isPopupOpen())return;if(!layers.length){if(event.target.matches('.uc-list-tab')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=[...root.querySelectorAll('.uc-list-tab')],i=tabs.indexOf(event.target);tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].click()}return;}const layer=layers.at(-1);if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeLayer();return}if(event.target.matches('.uc-tab')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=[...layer.el.querySelectorAll('.uc-tab')],i=tabs.indexOf(event.target);tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].click();return}if(event.key==='Tab'){const all=[...layer.el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(e=>e.getClientRects().length&&e.tabIndex>=0);if(!all.length){event.preventDefault();return}if(event.shiftKey&&(document.activeElement===all[0]||document.activeElement===layer.el.querySelector('.uc-drawer'))){event.preventDefault();all.at(-1).focus()}else if(!event.shiftKey&&(document.activeElement===all.at(-1)||!layer.el.contains(document.activeElement))){event.preventDefault();all[0].focus()}}}
  function openOrderSnapshot(id){const order=orders.find(item=>item.id===id);if(!order){toast('该订单暂无更多资料');return}openLayer('订单详情',section('订单 '+esc(id),orderCards([{id}])) ,btn('关闭','dismiss'),2);}
  function openCustomerSnapshot(id){const record=records.find(item=>item.customerId===id);if(!record){toast('该客户暂无更多资料');return}openLayer('客户资料',section('基本信息',`<div class="uc-details">${detail('客户姓名',record.name)}${detail('会员号',record.member)}${detail('客户手机',record.phone)}${detail('所属门店',record.store)}${detail('客户微信',record.customerWechat||orders.find(o=>o.customerId===id)?.customerWechat)}</div>`),btn('关闭','dismiss'),2);}
  function bind(el){el.addEventListener('click',handleClick);el.addEventListener('change',handleChange);el.addEventListener('input',event=>{event.stopPropagation();syncDraft(event.target)});el.addEventListener('submit',handleSubmit);}
  function mount(content){if(!content)return;root=content;root.classList.add('uc-scope');portal=document.getElementById('mergeDrawers');bind(root);renderList();if(readFailure)toast('本地记录读取失败，已恢复初始列表');}
  function leave(){for(const layer of layers)layer.el.remove();layers=[];main=null;unlockBackground();}
  PCUI.registerPager('complaints',(value,config)=>{if(config.scope==='orders'){const e=main?.editor;if(!e)return;readOrderSearch();e.orderPage=value.currentPage;e.orderPageSize=value.pageSize;renderEditor();}else{filterDraft={...filterDraft,...Object.fromEntries(new FormData(root.querySelector('#uc-search')))};page=value.currentPage;pageSize=value.pageSize;renderList();}});
  document.addEventListener('keydown',keyboard,true);
  window.addEventListener('beforeunload',event=>{if(layers.some(dirty)){event.preventDefault();event.returnValue=''}});
  window.PCComplaints={mount,leave};
  const initial=document.getElementById('pc-complaints');if(initial)mount(initial);
})();

;
/* Route lifecycle; the complaint workflow stays in ./business.js. */
window.PCModules.complaints = {
  render() {
    document.body.classList.remove('approval-h5');
    document.querySelector('#main').innerHTML = '<div class="ub-workspace"><div id="pc-complaints"></div></div><div class="app-footer">WEID微动 · 示例数据</div>';
    PCComplaints.mount(document.querySelector('#pc-complaints'));
  },
  leave() { PCComplaints.leave(); }
};
