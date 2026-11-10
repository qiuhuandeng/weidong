/* 投诉处理业务移植自 index.html 内嵌 unified-complaints/app.js。
 * UI 仅通过 PCUI 公共组件；数据独立保存，不修改源入口。 */
(function () {
  'use strict';
  // Independent PC records; import the source prototype once when available.
  const KEY = 'weid.pc.complaints.v1';
  const SOURCE_KEY = 'weidong.unified-complaints.v1';
  const dictionary = window.PCComplaintOptions;
  const {customers,demoScenarios,completeLifecycleExample,timingExample,clearProcessingAssessments}=window.PCModules['complaint-fixtures'];
  const LEVELS = ['1级','2级','3级','4级','5级'];
  const LEVEL4_TYPES = ['报警','卫生局','监管局'];
  const level4Type = record => record.level==='4级'&&LEVEL4_TYPES.includes(record.level4Type)?record.level4Type:'';
  const CHANNELS = {
    staff:'门店发起售后',
    hotline:'400客服热线',
    mini:'微信小程序',
    wecom:'销售企微头像',
    sales:'销售企微侧边栏',
    salesBackend:'销售微动后台',
    finance:'财务业绩核对',
    advertising:'广告平台投诉',
    wechat:'微信支付投诉',
    yinsheng:'银盛支付投诉',
    legal:'工商/法人投诉',
    originalRefund:'原路退款'
  };
  const ACTOR = '林晓（售后客服）';
  const ASSESSMENT_FIELDS=[['type','售后类型'],['department','责任归属'],['responsible','责任人'],['reason','责任原因']];
  const CONTACT_FIELDS=[['firstContact','客诉第一联系人'],['contactTime','投诉时间'],['complaintStore','投诉门店'],['customerDemand','未达成原因'],['customerStatement','客户陈述']];
  const RECOGNITION_FIELDS=[...CONTACT_FIELDS,...ASSESSMENT_FIELDS];
  const MULTI_FIELDS=['department','responsible'];
  const multiValues=value=>[...new Set((Array.isArray(value)?value:value?[value]:[]).map(item=>String(item).trim()).filter(Boolean))];
  const valueText=value=>Array.isArray(value)?multiValues(value).join('、'):String(value??'');
  // Match the Zhongtai workflow vocabulary; fault attribution is not the current handler.
  const STATUS_ALIASES={'客服待处理':'待处理','客服接单':'客服已接单','处理中':'客服处理中','门店待处理':'客服处理中','门店处理中':'客服处理中','待结案':'客服复核中','客服待结案':'客服复核中','已完成':'已结案','财务付款中':'待财务付款','财务付款失败':'待财务付款','采购执行中':'待采购发货','采购待发货':'待采购发货','采购部分发货':'待采购发货','门店交付中':'客服处理中','财务审批发起失败':'财务审批中','财务审批待同步':'财务审批中','采购审批发起失败':'采购审批中','采购审批待同步':'采购审批中'};
  function workOrderStatus(status,r={}){
    if(status!=='已挂起'&&!['门店处理中','门店待处理','门店交付中'].includes(status))return STATUS_ALIASES[status]||status||'待处理';
    const node=r.execution?.steps?.[r.execution.index],kind=node?.kind;
    if(node?.type==='approval')return /采购/.test(node.title||node.templateId||'')||node.templateId==='approval-purchase'?'采购审批中':'财务审批中';
    const stage={payment:'待财务付款',procurement:'待采购发货',store:'客服处理中',close:'客服复核中',store_close:'客服复核中',sales:'客服处理中'}[kind];
    const previous=[r.suspension?.returnState,r.resumeStatus,r.beforeStatus,...(r.follows||[]).map(f=>f.beforeStatus)].find(value=>value&&value!=='已挂起');
    return stage||STATUS_ALIASES[status]||(previous?workOrderStatus(previous):r.startedAt||r.assessedAt?'客服处理中':r.acceptedAt?'客服已接单':'待处理');
  }
  const workflow=window.PCModules['complaint-workflow'].create({normalizeStatus:workOrderStatus,hasAssessment});
  const WORK_ORDER_STATUSES=workflow.statuses.map(([status])=>status);
  const statusScope=status=>['待处理','客服已接单'].includes(workOrderStatus(status))?'pending':workOrderStatus(status)==='已结案'?'closed':'active';
  const STATUS_TABS=workflow.tabs;
  const canAssess=r=>workflow.can(r,'assess');
  const canEditAssessment=r=>canAssess(r)||workflow.can(r,'editAssessment');
  const canFollow=r=>workflow.can(r,'follow');
  const canGrade=r=>workflow.can(r,'grade');
  function normalizeRecordStatus(r){const before=r.status;r.status=workOrderStatus(before,r);if(['门店处理中','门店待处理','门店交付中'].includes(before)&&r.status==='客服处理中'){r.legacyStoreAssignment??={status:before,handler:r.currentHandler,department:r.currentDepartment,task:r.currentTask,deadline:r.taskDeadline};r.currentHandler=r.acceptedBy||r.startedBy||r.assessedBy||r.transfer?.fromHandler||'';r.currentDepartment='售后客服';r.currentTask='待客服继续处理';delete r.statusDetail;r.taskDeadline=null;}if(before==='已挂起')r.legacySuspended=true;if(before!==r.status&&/失败|部分发货|待同步/.test(before))r.statusDetail ||= before;}
  function currentHandler(r){return r.currentHandler||(['客服已接单','客服处理中','客服复核中'].includes(r.status)?r.acceptedBy||r.startedBy||r.assessedBy:'')||'';}
  function currentTask(r){
    if(r.status==='已结案')return '已结案';
    if(r.status==='客服处理中')return listProgressText(r)||'待客服继续沟通';
    if(r.statusDetail||r.currentTask)return r.statusDetail||r.currentTask;
    return {'待处理':'待客服接单','客服已接单':'待责任认定或填写解决方案','财务审批中':'待财务审批反馈','采购审批中':'待采购审批反馈','待财务付款':'审批已通过，待财务执行付款','待采购发货':'审批已通过，待采购安排发货','客服复核中':'待客服核对执行结果并联系客户确认'}[r.status]||'—';
  }
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
  const ORDER_STATUSES=['已排客','已到店','已超时','已完成','已流退'];
  const CUSTOMER_KEYWORDS=[['phone','客户手机'],['name','客户姓名'],['member','会员号']];
  const customerIdOf=record=>{const id=String(record.customerId??'').trim();return id&&!id.startsWith('manual-')?id:''};
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
  const levelTag = level => level?tag(level,{'1级':'green','2级':'blue','3级':'orange','4级':'red','5级':'red'}[level]||'gray'):'<span class="uc-muted">—</span>';
  const statusTag = status => tag(workOrderStatus(status),{pending:'orange',active:'blue',closed:'green',suspended:'gray'}[statusScope(status)]||'gray');
  function wechatStatusTag(status){
    // Older prototype records used 待处理 for a received, ongoing WeChat case.
    const state=status==='待处理'?'处理中':status;
    if(!['处理中','已完成'].includes(state))return `<span>微信工单状态</span>${tag(state||'未返回')}`;
    const icon=state==='已完成'?'<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>':'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>';
    return `<span>微信工单状态</span><span class="pill uc-wechat-status ${state==='已完成'?'green':'blue'}"><svg viewBox="0 0 24 24" aria-hidden="true">${icon}</svg><strong>${state}</strong></span>`;
  }
  const channelTag = channel => tag(CHANNELS[channel],{mini:'blue',staff:'purple',wechat:'green'}[channel]);
  const field = (name,label,control,required=false,help='',full=false) => `<div class="field uc-field${full?' ub-span uc-full':''}" data-field="${name}"><label for="uc-${name}" class="${required?'required':''}">${label}</label>${control}${help?`<div class="uc-help">${help}</div>`:''}<div class="uc-error" id="uc-error-${name}"></div></div>`;
  const input = (name,value='',placeholder='',type='text',extra='',fieldName=name) => `<input id="uc-${name}" name="${esc(fieldName)}" class="uc-input" type="${type}" value="${esc(value)}" placeholder="${esc(placeholder)}" ${extra}>`;
  const select = (name,items,value='',placeholder='全部',extra='') => `<select id="uc-${name}" name="${name}" class="uc-input" ${extra}>${opt(items,value,placeholder)}</select>`;
  const detail = (label,value,full=false,raw=false) => `<div class="uc-detail-field${full?' uc-full':''}"><span class="uc-detail-label">${label}</span><div class="uc-detail-value">${raw?value:esc(value||'未记录')}</div></div>`;
  const section = (title,content,actions='') => `<section class="uc-section"><div class="uc-section-head"><h4>${title}</h4>${actions}</div><div class="uc-section-content">${content}</div></section>`;
  const empty = text => `<div class="uc-empty">${text}</div>`;
  const listValue = value => valueText(value).trim()?esc(valueText(value)):'<span class="uc-muted">—</span>';
  const error = (scope,name,text) => {const el=scope.querySelector(`#uc-error-${name}`);if(el)el.textContent=text;const control=scope.querySelector(`#uc-${name}`)||scope.querySelector(`[name="${name}"]`);if(control){const visible=control.hidden?control.closest('.pc-island')?.querySelector('input:not([hidden]),button,[tabindex="0"]'):control;for(const target of new Set([control,visible].filter(Boolean))){target.setAttribute('aria-invalid','true');target.setAttribute('aria-describedby','uc-error-'+name)}}};
  const clearErrors = scope => {scope.querySelectorAll('.uc-error').forEach(e=>e.textContent='');scope.querySelectorAll('[aria-invalid]').forEach(e=>e.removeAttribute('aria-invalid'))};


  const orders = customers.flatMap((c,i)=>{
    const makeOrder = suffix => ({id:'2610'+String(190000000000+i*127+suffix),customerId:'C'+i,name:c[0],phone:c[1],member:String(15275350+i*227),customerWechat:'wx_'+String(203150+i),store:c[2],intention:['色斑改善','肤质改善','脱毛','舒缓修护'][i%4],consultant:['陈敏','王珊','周雨'][i%3],receptionSales:['杨晓燕','张婷婷','赵敏'][i%3],project:['S10祛斑护理','光电皮肤管理','冰点脱毛体验','肌肤修护疗程'][i%4],amount:[5800,5000,2980,189,1200,680][i%6],state:'已到店',created:'2026-10-10 10:30',appointment:'2026-10-12 14:00',arrived:'2026-10-12 14:06',inviter:['陈敏','王珊','周雨'][i%3],reception:['刘静','杨晓燕','吴鲜娇'][i%3],operator:['陈琳','许悦','李婷'][i%3],manager:['陈佳','赵敏','李雯'][i%3],maintainers:['陈琳（操作老师）','陈佳（店长）'],bookingWechatId:'wx'+i+(suffix===2?'b':'a'),wechatChoices:[{id:'wx'+i+'a',name:'美丽顾问 · '+['陈敏','王珊','周雨'][i%3],account:'meiye_'+String(1031+i),record:'JW'+(52010+i),added:'2026-10-08 10:25',promoter:['李江','张宁','陈敏'][i%3],source:['抖音 · 皮肤护理','视频号 · 到店体验','朋友圈 · 皮肤管理'][i%3],campaign:'皮肤管理 · 十月体验',costKey:'2026-10 / 华东推广 / '+(52010+i)},{id:'wx'+i+'b',name:'门店服务 · '+c[2],account:'store_'+String(201+i),record:'JW'+(62010+i),added:'2026-10-11 09:12',promoter:'周雨',source:'视频号 · 门店活动',campaign:'门店十月活动',costKey:'2026-10 / 门店推广 / '+(62010+i)}]});
    const current=makeOrder(1);
    // Explicit fictional contact for the isolated customer-linking example.
    if(i===28)current.fullPhone='13800002901';
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
  const DEMO_DETAILS_VERSION = 'workflow-stage-records-20261103';

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
      if(untouched&&!r.follows.some(item=>!item.mock)&&Number(r.id)>=31029&&completeLifecycleExample(r,own[0])){
        if(['31038','31039'].includes(r.id)){const approval=workflow.financeApproval(r),rejected=r.id==='31038';workflow.returnFinance(r,{approvalId:approval.id,result:rejected?'rejected':'withdrawn',reason:rejected?'退款金额与未消费项目明细不一致，请核对后重新提交。':'收款账号填写有误，已在钉钉撤销审批，待修正后重新提交。',actor:rejected?'陆清（财务）':ACTOR,time:demoTime(r.created,40)});}
        r.demoDetailsVersion=DEMO_DETAILS_VERSION;changed=true;continue;
      }
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
          const stageRecords={
            '财务审批中':['财务审批','周雨','退款金额：¥ 1,680.00；收款账户已核对，等待财务审批意见。',[['处理方式','退款'],['退款金额','¥ 1,680.00'],['审批意见','等待财务审批']]],
            '采购审批中':['采购审批','陈敏','置换商品：舒缓修护霜 50g × 2；收货地址已确认，等待采购审批。',[['处理方式','商品置换'],['商品明细','舒缓修护霜 50g × 2'],['审批意见','等待采购审批']]],
            '待财务付款':['财务付款','李江','财务审批已通过，待登记实际付款金额、交易流水号及付款凭证。',[['审批结果','已通过'],['待付金额','¥ 1,680.00'],['付款状态','待财务付款']]],
            '待采购发货':['采购发货','陈敏','采购审批已通过，待登记发货方式、发货数量、物流单号及备注。',[['审批结果','已通过'],['发货商品','舒缓修护霜 50g × 2'],['发货状态','待采购发货']]],
            '客服复核中':['客服复核','林晓（售后客服）','财务已登记付款凭证，待联系客户确认到账，并填写复核结论与结案说明。',[['付款结果','成功'],['交易流水号','PAY-20261103-01'],['复核状态','待客户确认']]]
          };
          const stage=stageRecords[r.status];
          if(stage)r.follows.unshift({id:r.id+'-demo-workflow',kind:'workflow',action:stage[0],time:demoTime(r.created,35),actor:stage[1],note:stage[2],fields:stage[3],beforeStatus:'客服处理中',status:r.status,files:[],mock:true});
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
  // Normalize in memory; changing status labels alone must not trigger another storage write.
  records.forEach(r=>{normalizeRecordStatus(r);const i=Number(r.id)-31001;if(!r.level&&customers[i]?.[0]===r.name)r.level=demoScenarios[i]?.[3]||'';});
  const financeChanged=records.reduce((changed,r)=>workflow.reconcileFinance(r)||changed,false);
  const assessmentExamplesChanged=clearProcessingAssessments(records);
  try{if(demoChanged||wechatChanged||financeChanged||assessmentExamplesChanged||!localStorage.getItem(KEY))localStorage.setItem(KEY,JSON.stringify(records))}catch(e){readFailure=true}
  let root,portal,filters={},filterDraft={},page=1,pageSize=10,more=false,layers=[],main=null,listClock;
  let storageVersion;try{storageVersion=localStorage.getItem(KEY)}catch(e){readFailure=true}
  function persist(next){try{if(localStorage.getItem(KEY)!==storageVersion)throw Error('工单已在其他页面更新，请刷新后重试');const data=JSON.stringify(next);localStorage.setItem(KEY,data);storageVersion=data;records=next;return true}catch(e){toast('保存失败：'+e.message+'；已保留当前输入。');return false}}
  function toast(message){PCUI.message(message,{type:'info',duration:4000});}
  function interval(record){if(!record.contactTime)return '待补充客户陈述';const delta=new Date(record.created.replace(' ','T')+':00+08:00')-new Date(record.contactTime+':00+08:00');if(!Number.isFinite(delta))return '—';const minutes=Math.round(Math.abs(delta)/60000),duration=minutes<60?minutes+'分钟':minutes<1440?Math.floor(minutes/60)+'小时'+(minutes%60?minutes%60+'分':''):Math.floor(minutes/1440)+'天'+(Math.floor(minutes%1440/60)?Math.floor(minutes%1440/60)+'小时':'');return delta>=0?'联系至上报 '+duration:'提交后联系 '+duration}
  function complaintKeywordMatch(r,criteria){
    const query=(criteria.keyword||'').trim().toLowerCase();if(!query)return true;
    const key=ORDER_KEYWORDS.some(([value])=>value===criteria.keywordType)?criteria.keywordType:'phone';
    const values=key==='id'?[...r.linked.map(order=>order.id),...(r.channel==='wechat'?[r.externalOrder,r.payOrder]:[])]:key==='name'?[r.name,...(r.channel==='wechat'?[r.wechatNickname]:[])]:key==='customerWechat'?[r.customerWechat??orders.find(order=>order.customerId===r.customerId)?.customerWechat]:key==='phone'?[r.phone,r.originalContact?.phone,r.consumptionPhone]:[r[key]];
    return values.some(value=>String(value??'').toLowerCase().includes(query));
  }
  function complaintKeywordControl(){const key=filterDraft.keywordType||'phone',label=ORDER_KEYWORDS.find(([value])=>value===key)?.[1]||'客户手机';return `<div class="refund-keyword" data-pc-label="关键词"><select id="uc-keywordType" name="keywordType" class="uc-input" aria-label="关键词类型">${ORDER_KEYWORDS.map(([value,text])=>`<option value="${value}"${key===value?' selected':''}>${text}</option>`).join('')}</select>${input('keyword',filterDraft.keyword,'输入'+label,'text','aria-label="投诉关键词"')}</div>`}
  function linkedOrderState(item){return orders.find(order=>order.id===item.id)?.state||item.state||''}
  function acceptanceActor(r){return r.acceptedBy||(r.follows||[]).find(f=>f.kind==='accept')?.actor||''}
  function readListSearch(form=root.querySelector('#uc-search')){const data=new FormData(form);return {...Object.fromEntries(data),orderStatus:data.getAll('orderStatus')}}
  function filtered(criteria=filters){const orderStatuses=multiValues(criteria.orderStatus);return records.filter(r=>{
    return complaintKeywordMatch(r,criteria)&&(!criteria.channel||r.channel===criteria.channel)&&(!criteria.status||r.status===workOrderStatus(criteria.status))&&(!criteria.scope||statusScope(r.status)===criteria.scope)&&(!criteria.acceptedBy||acceptanceActor(r)===criteria.acceptedBy)&&(!criteria.department||multiValues(r.department).includes(criteria.department))&&(!criteria.type||r.type===criteria.type)&&(!criteria.level||r.level===criteria.level)&&(!criteria.store||r.store===criteria.store)&&(!orderStatuses.length||r.linked.some(item=>orderStatuses.includes(linkedOrderState(item))))&&(!criteria.start||r.created.slice(0,10)>=criteria.start)&&(!criteria.end||r.created.slice(0,10)<=criteria.end)
  }).sort((a,b)=>b.created.localeCompare(a.created))}
  function pagination(total,current,size,scope='list'){
    return `<div class="pagination" data-pc-pager='${esc(JSON.stringify({total,page:current,size,sizes:[10,20,50],action:'complaints',scope}))}'></div>`;
  }
  function timingEpoch(value){
    if(typeof value==='number')return value;
    if(typeof value!=='string'||!value.trim())return NaN;
    const iso=value.trim().replace(' ','T');
    return Date.parse(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(iso)?iso+'+08:00':iso);
  }
  function complaintTiming(r,referenceTime=Date.now()){
    if(workOrderStatus(r.status,r)==='待处理')return null;
    const periods=Array.isArray(r.communicationPeriods)?r.communicationPeriods:[];
    const reason=(r.follows||[]).find(item=>item.kind==='follow'&&item.communication?.result==='ongoing')?.communication.reason||r.customerDemand||'';
    const period=periods.find(item=>!item.endedAt)||periods.at(-1)||timingExample(r,dictionary.timingFor(dictionary.current,reason,r.level));
    if(!period)return null;
    const due=timingEpoch(period.dueAt);if(!Number.isFinite(due))return null;
    const closed=workOrderStatus(r.status,r)==='已结案',ended=Boolean(period.endedAt)||closed;
    const end=period.endedAt||(closed?(r.closedAt||(r.follows||[]).find(item=>item.kind==='closure')?.time):'');
    const until=ended?timingEpoch(end):referenceTime,overdue=Number.isFinite(until)?Math.max(0,until-due):0;
    const minutes=Math.floor(overdue/60000),days=Math.floor(minutes/1440),hours=Math.floor(minutes%1440/60),remaining=minutes%60;
    const duration=days?days+'天'+(hours?hours+'小时':''):hours?hours+'小时'+(remaining?remaining+'分钟':''):minutes?minutes+'分钟':overdue?'不足1分钟':'';
    const dueAt=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(due));
    return {dueAt,ended,overdue,duration,mock:Boolean(period.mock)};
  }
  function complaintTimingHTML(r,referenceTime=Date.now()){
    const timing=complaintTiming(r,referenceTime);if(!timing)return '<span class="uc-muted">—</span>';
    return `<span class="pc-block uc-block uc-muted" title="${timing.mock?'示例时效：':''}${esc(timing.dueAt)}">截止 ${esc(timing.dueAt.slice(5))}</span>${timing.overdue?`<span class="pc-block uc-block uc-list-overdue" title="${timing.ended?'本轮计时已结束；':''}超时 ${Math.floor(timing.overdue/60000)} 分钟">已超时 ${esc(timing.duration)}</span>`:''}`;
  }
  function refreshListTimings(){
    if(!root?.isConnected)return;
    const referenceTime=Date.now();
    for(const cell of root.querySelectorAll('[data-complaint-timing]')){
      const record=records.find(item=>String(item.id)===cell.dataset.complaintTiming);if(!record)continue;
      const html=complaintTimingHTML(record,referenceTime);if(cell.innerHTML!==html)cell.innerHTML=html;
    }
  }
  function listProgressText(r){
    const status=workOrderStatus(r.status,r);
    if(['财务审批中','采购审批中'].includes(status)){
      return workflow.approvalProgress(r,status);
    }
    if(status==='客服已接单'){
      const actor=acceptanceActor(r);
      return actor?'接单人：'+actor:'';
    }
    if(status==='客服处理中'){
      const follow=followTools().current(r),returned=workflow.financeHint(r,follow);
      if(returned)return workflow.approvalLabels[returned.status];
      if(follow)return follow.communication.result==='ongoing'?followTools().progressText(r):'';
      return r.customerSolution||r.compensatedAt||(r.follows||[]).some(f=>['compensation','closure'].includes(f.kind))?'':r.customerDemand||'';
    }
    return '';
  }
  const {reviewForm,syncReview,saveReview,needsReviewInfo}=window.PCModules['complaint-follow'].createReview({ACTOR,getRecords:()=>records,getRoot:()=>root,getMain:()=>main,clone,esc,opt,btn,fmt,now,persist,renderList,renderDetail,toast});
  function complaintRow(r){
    const progress=listProgressText(r),orderInfo=r.linked.length?r.linked.map(item=>{const order=orders.find(order=>order.id===item.id),state=linkedOrderState(item);return `<div><span class="pc-block uc-block">${listValue(order?.store||r.store)} ${state?tag(state,{'已排客':'blue','已到店':'green','已超时':'orange','已完成':'gray','已流退':'gray'}[state]||'gray'):''}</span><span class="pc-block uc-block">${link(esc(item.id),'order-detail',`data-order="${esc(item.id)}"`)}</span></div>`}).join(''):`<span class="pc-block uc-block">${listValue(r.store)}</span><span class="pc-block uc-block uc-muted">未关联订单</span>`;
    return `<tr><td class="uc-list-customer">${customerIdOf(r)?link(esc(r.name),'customer-detail',`data-customer="${esc(customerIdOf(r))}" aria-label="查看客户详情：${esc(r.name)}"`):listValue(r.name)}<span class="pc-block uc-block uc-muted">${customerIdOf(r)?'会员号 '+listValue(r.member):'未关联客户'}</span><span class="pc-block uc-block uc-muted">${listValue(r.phone)}</span></td>
      <td class="uc-list-store-order">${orderInfo}</td>
      <td>${listValue(CHANNELS[r.channel])}<span class="pc-block uc-block uc-muted">${listValue(r.created?fmt(r.created):'')}</span></td>
      <td><span class="pc-block uc-block uc-muted">工单号：${listValue(r.id)}</span><div class="uc-complaint-content">${listValue(r.content)}</div></td>
      <td>${levelTag(r.level)}${level4Type(r)?'<span class="pc-block uc-block uc-muted">'+esc(level4Type(r))+'</span>':''}<div class="uc-list-timing" data-complaint-timing="${esc(r.id)}">${complaintTimingHTML(r)}</div></td>
      <td>${statusTag(r.status)}${reviewForm(r)}${progress?`<div class="uc-progress-task ${(/^(财务|采购)审批中$/.test(r.status)||workflow.financeHint(r,followTools().current(r)))&&/^(财务|采购)驳回$/.test(progress)?'uc-error':'uc-muted'}" title="${esc(progress)}">${esc(progress)}</div>`:''}</td>
      <td>${listValue(valueText(r.department)||'待认定')}<span class="pc-block uc-block uc-muted">售后类型：${listValue(r.type)}</span>${customerResponsibility(r)?'':`<span class="pc-block uc-block">责任人：${listValue(r.responsible)}</span>`}</td>
      <td class="uc-fixed"><div class="uc-actions">${link('详情','detail',`data-id="${r.id}"`)}</div></td></tr>`;
  }
  function renderList(){const rows=filtered(),pages=Math.max(1,Math.ceil(rows.length/pageSize));page=Math.min(page,pages);root.innerHTML=`
    <section class="uc-search-card"><nav class="uc-list-tabs pc-tabs pc-tabs-with-search" role="tablist" aria-label="工单状态">${STATUS_TABS.map(([value,label],i)=>`<button type="button" class="uc-list-tab pc-tab" role="tab" id="uc-status-${i}" aria-controls="uc-list-panel" aria-selected="${(filters.status||'')===value}" tabindex="${(filters.status||'')===value?'0':'-1'}" data-uc="status-tab" data-status="${value}">${label}</button>`).join('')}</nav><div class="query-module"><form id="uc-search" class="filterbar" data-pc-query-align="columns">
      <div class="mr-date" data-pc-label="投诉时间">${input('start',filterDraft.start,'开始日期','date','aria-label="投诉开始日期"')}<span>至</span>${input('end',filterDraft.end,'结束日期','date','aria-label="投诉结束日期"')}</div>
      ${select('level',LEVELS,filterDraft.level,'全部等级','aria-label="客诉等级"')}
      ${select('channel',Object.entries(CHANNELS),filterDraft.channel,'全部来源','aria-label="售后来源"')}
      ${complaintKeywordControl()}
      <select id="uc-orderStatus" name="orderStatus" class="uc-input" multiple placeholder="全部订单状态" aria-label="订单状态">${ORDER_STATUSES.map(state=>`<option value="${esc(state)}"${multiValues(filterDraft.orderStatus).includes(state)?' selected':''}>${esc(state)}</option>`).join('')}</select>
      ${select('acceptedBy',[...new Set(records.map(acceptanceActor).filter(Boolean))],filterDraft.acceptedBy,'全部接单人','aria-label="接单人" data-filterable')}
      ${more?[
        select('department',['推广','销售','门店','客户自身'],filterDraft.department,'全部责任归属','aria-label="责任归属"'),
        select('type',dictionary.options('types',filterDraft.type,records.map(r=>r.type)),filterDraft.type,'全部售后类型','aria-label="售后类型"'),
        select('store',[...new Set(records.map(r=>r.store))],filterDraft.store,'全部门店','aria-label="投诉门店" data-filterable')
      ].join(''):''}
      <div class="query-actions"><button class="btn primary" type="submit" form="uc-search">搜索</button>${btn('重置','reset')}${link(more?'收起筛选':'更多筛选','more','aria-expanded="'+more+'"')}</div>
    </form><div id="uc-query-error" class="uc-error" role="alert"></div></div></section>
    <section class="panel content-module uc-card" role="tabpanel" id="uc-list-panel" aria-labelledby="uc-status-${STATUS_TABS.findIndex(([value])=>value===(filters.status||''))}"><div class="panel-head uc-card-head"><div class="uc-actions" role="group" aria-label="投诉列表操作">${btn('新增工单','new-ticket','',true)}${btn('配置','options-open')}${btn('导出','export')}</div></div>
      <div class="table-wrap uc-table-wrap"><table class="uc-table uc-main-table" data-pc-align="left"><colgroup><col><col><col><col><col style="width:180px"><col style="width:190px"><col><col style="width:70px"></colgroup>
      <thead><tr>${['客户信息','关联订单 / 门店','售后来源 / 渠道','投诉内容','客诉等级 / 时效','工单状态','责任认定','操作'].map((t,i)=>`<th data-pc-min-width="${[150,180,175,250,180,190,160,70][i]}"${i===7?' class="uc-fixed"':''}>${t}</th>`).join('')}</tr></thead>
      <tbody>${rows.length?rows.slice((page-1)*pageSize,page*pageSize).map(complaintRow).join(''):`<tr><td colspan="8">${empty('暂无符合条件的数据')}</td></tr>`}</tbody></table></div>
      ${pagination(rows.length,page,pageSize)}
    </section>`;
    root.querySelectorAll('#uc-search [id]').forEach(el=>el.id=el.id.replace(/^uc-/,'uc-filter-'));
    root.querySelectorAll('#uc-search label[for]').forEach(el=>el.htmlFor=el.htmlFor.replace(/^uc-/,'uc-filter-'));
  }

  const {optionsDirty,optionAction,syncOptionDraft,responsibilityForm,assessmentAttachments,handlingMissing,assessmentValues,assessmentSummary,assessmentFields,syncResponsibility}=window.PCModules['complaint-options'].create({dictionary,getLayers:()=>layers,getEditor:()=>main?.editor,getRecords:()=>records,getLinkedOrders:()=>(main?.record?.linked||[]).map(resolveLink),orderProjects,customerResponsibility,responsibleOptions,assessmentChoices,multiValues,multiSelect,responsibilityRule,select,openLayer,closeLayer,refreshOptionConsumers,btn,link,esc,section,field,input,toast,draftFiles,HANDLING_FILE_TYPES,validPlan});
  function refreshOptionConsumers(){
    if(!root?.isConnected)return;
    filterDraft={...filterDraft,...readListSearch()};
    renderList();
    const creation=layers.find(layer=>layer.creation);if(creation)syncCreateRequestFields(creation.el);
    const e=main?.editor;for(const [name,key]of e?.kind==='assessment'?[['type','types']]:e?.kind==='follow'?[['unresolvedReason','demands']]:[]){
      const control=e.layer.el.querySelector('[name="'+name+'"]');if(!control)continue;
      control.innerHTML=opt(name==='unresolvedReason'?followTools().availableReasons(e.draft[name],main.record.follows.find(f=>f.id===e.followId)):dictionary.options(key,e.draft[name]),e.draft[name],control.options[0]?.textContent||'请选择');PCUI.syncControl(control);
    }
  }
  dictionary?.subscribe(refreshOptionConsumers);
  function lockBackground(){syncDrawerInteraction();}
  function unlockBackground(){syncDrawerInteraction();}
  function openLayer(title,body,footer,level=1){
    const trigger=document.activeElement,parent=layers.at(-1),parentView=parent?{scroll:parent.el.querySelector('.uc-drawer-body').scrollTop,tab:main?.tab}:null;
    if(parent)parent.el.inert=true;
    const el=document.createElement('div');el.className='uc-scope uc-layer merge-drawer-backdrop';el.dataset.overlayLayer='complaint-'+layers.length;el.dataset.uc='dismiss';el.style.zIndex=String(120+layers.length*10);
    el.innerHTML=`<section class="merge-drawer ub-drawer uc-drawer" style="--archive-drawer-width:860px" role="dialog" aria-modal="true" aria-label="${esc(title)}" tabindex="-1"><header class="merge-drawer-head uc-drawer-head"><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-uc="dismiss" aria-label="关闭${esc(title)}">${iconClose}</button></header><div class="uc-layer-top"></div><div class="merge-drawer-body uc-drawer-body">${body}</div><footer class="merge-drawer-foot uc-drawer-foot">${footer}</footer></section>`;
    portal.appendChild(el);bind(el);const layer={el,trigger,title,closing:false,parentView};layers.push(layer);lockBackground();
    requestAnimationFrame(()=>requestAnimationFrame(()=>{el.classList.add('show');if(layer.creation)PCUI.focusControl(el.querySelector('[name="consumptionPhone"]'));else el.querySelector('.uc-drawer').focus({preventScroll:true})}));return layer;
  }
  function closeLayer(){const layer=layers.at(-1);if(!layer||layer.closing||layer.options?.saving)return;layer.closing=true;layer.el.classList.remove('show');layer.el.classList.add('is-closing');setTimeout(()=>{if(!layers.includes(layer))return;layer.el.remove();layers.pop();if(main?.editor?.layer===layer)main.editor=null;if(layers.length){const parent=layers.at(-1);parent.el.inert=false;if(layer.parentView){parent.el.querySelector('.uc-drawer-body').scrollTop=layer.parentView.scroll;if(main?.layer===parent)setDetailTab(layer.parentView.tab)}}else{unlockBackground();main=null}if(layer.trigger?.isConnected)layer.trigger.focus({preventScroll:true});else if(layers.length)layers.at(-1).el.querySelector('.uc-drawer').focus({preventScroll:true});else root.querySelector('input,button')?.focus({preventScroll:true});layer.afterClose?.()},matchMedia('(prefers-reduced-motion: reduce)').matches?0:290)}
  function dirty(layer){if(layer.options)return layer.options.saving||optionsDirty(layer.options);if(layer.creation){const form=layer.el.querySelector('[data-ticket-form]');return Boolean(form&&[...form.querySelectorAll('input,select,textarea')].some(control=>control.name&&control.name!=='lookupType'&&control.value.trim()&&(control.name!=='channel'||control.value!=='hotline')))}const e=main?.editor;return Boolean(e?.layer===layer&&(e.uploading||followTools().operationDirty(e)||(e.selectingOrders&&(orderPickerDirty(e)||(e.exampleReturn&&orderPickerDirty(e.exampleReturn))))))}
  function recordById(id){return records.find(r=>r.id===id)}
  function customerResponsibility(r){return multiValues(r.department).includes('客户自身')}
  function isAssessed(r){return Boolean(r.type&&String(r.reason||'').trim()&&multiValues(r.department).length&&(customerResponsibility(r)||multiValues(r.responsible).length))}
  function hasAssessment(r){return Boolean(r.assessedAt||(r.follows||[]).some(f=>['handling','assessment'].includes(f.kind))||isAssessed(r))}
  function valuesFrom(r,fields){return Object.fromEntries(fields.map(([key])=>[key,MULTI_FIELDS.includes(key)?multiValues(r[key]):r[key]||'']))}
  function recognitionSnapshot(r){return {...Object.fromEntries(RECOGNITION_FIELDS.map(([key])=>[key,MULTI_FIELDS.includes(key)?multiValues(r[key]):String(r[key]||'').trim()])),...(r.responsibleByDepartment?{responsibleByDepartment:clone(r.responsibleByDepartment)}:{}),level:r.level||'',level4Type:level4Type(r),linked:clone(r.linked),handlingPlan:r.handlingPlan||'',handlingFiles:clone(r.handlingFiles||[]),customerSolution:r.customerSolution?clone(r.customerSolution):null}}
  function recognitionLog(snapshot){return {...snapshot,handlingFiles:(snapshot.handlingFiles||[]).map(({name,type,size})=>({name,type,size}))}}
  function recordRecognition(r,draft,time,{assessmentOnly=false,handlingPlan=r.handlingPlan||''}={}){
    if(!canEditAssessment(r))return null;
    assessmentOnly=assessmentOnly||!canAssess(r);
    if(assessmentOnly)draft={...draft,handlingPlan};
    if(handlingMissing(draft).some(([name])=>!assessmentOnly||name!=='handlingPlan')||(!assessmentOnly&&draft.handlingPlan==='resolved'&&!closureReady({...r,...draft,assessedAt:time})))return null;
    const before=recognitionSnapshot(r),after=recognitionSnapshot({...draft,level:r.level,level4Type:r.level4Type,complaintStore:r.complaintStore,...assessmentValues(draft),linked:r.linked,customerSolution:r.customerSolution}),wasAssessed=Boolean(r.assessedAt||r.follows.some(f=>['handling','assessment'].includes(f.kind))),beforeStatus=r.status;
    after.handlingPlan=draft.handlingPlan;delete after.responsibleByDepartment;
    const unchanged=JSON.stringify(before)===JSON.stringify(after);
    if(unchanged&&wasAssessed)return null;
    if(!assessmentOnly)markProcessing(r,time);
    delete r.responsibleByDepartment;
    Object.assign(r,clone(after),{assessedAt:time,assessedBy:ACTOR,status:!assessmentOnly&&after.handlingPlan==='resolved'?'已结案':r.status});
    if(r.status==='已结案'&&beforeStatus!=='已结案'){r.closedAt=time;r.closedBy=ACTOR;delete r.statusDetail;delete r.currentTask;followTools().stopPeriod(r,time,'已处理并结案')}
    const entry={id:r.id+'-handling-'+Date.now()+'-'+r.follows.length,kind:'handling',action:wasAssessed?'修改责任认定':'责任认定',time,actor:ACTOR,note:after.reason,status:r.status,beforeStatus,before,...clone(after),files:[]};
    r.follows.unshift(entry);return entry;
  }
  function recordCompensation(r,solution,time){
    if(!canAssess(r))return null;
    const before=r.customerSolution?clone(r.customerSolution):null;
    const requiresFinance=(solution.handlingMethods||solution.methods||[]).some(key=>['refund','compensation'].includes(key));
    const beforeStatus=r.status;markProcessing(r,time);r.customerSolution=clone(solution);r.compensatedAt=time;r.compensatedBy=ACTOR;followTools().stopPeriod(r,time,'已确认解决方案');
    const entry={id:r.id+'-compensation-'+Date.now()+'-'+r.follows.length,kind:'compensation',action:'保存解决方案',time,actor:ACTOR,beforeStatus,status:r.status,before,customerSolution:clone(solution),files:[]};
    const sales=r.execution?.steps?.[r.execution.index];if(sales?.kind==='sales')entry.nodeId=sales.id;
    if(requiresFinance){const approval=workflow.submitFinance(r,solution,time,ACTOR);if(approval){entry.approvalId=approval.id;entry.status=r.status;entry.nodeId??=r.execution.steps[r.execution.index-1]?.id;}}
    else{workflow.submitReview(r,time,ACTOR);entry.status=r.status;}
    delete r.reviewInfo;
    r.follows.unshift(entry);return entry;
  }
  function recordAccept(r,time,grade){if(r.suspension||r.legacySuspended||r.status!=='待处理'||followTools().gradeErrors(grade).length)return null;const beforeStatus=r.status,before=followTools().gradeValue(r);Object.assign(r,followTools().gradeValue(grade));r.status='客服已接单';r.acceptedAt=time;r.acceptedBy=ACTOR;delete r.statusDetail;delete r.currentTask;const entry={id:r.id+'-accept-'+Date.now(),kind:'accept',action:'客服接单',time,actor:ACTOR,note:'客服已接单，确认客诉等级为 '+r.level+(level4Type(r)?'（'+level4Type(r)+'）':'')+'。',before,...followTools().gradeValue(r),beforeStatus,status:r.status,files:[]};followTools().startAcceptedPeriod(r,entry);r.follows.unshift(entry);return entry}
  function markProcessing(r,time){if(r.status==='客服已接单'){r.status='客服处理中';r.startedAt??=time;r.startedBy??=ACTOR;delete r.statusDetail;delete r.currentTask}}
  function followTools(){return window.PCModules['complaint-follow'].create({ACTOR,canAssess,canFollow,canGrade,hasAssessment,handlingMissing,recordRecognition,recordCompensation,recordClosure,handlingOperations:workflow.handlingOperations,LEVELS,LEVEL4_TYPES,error,clearErrors,markProcessing,recognitionSnapshot,clone,esc,fmt,field,input,select,detail,section,tag,link,btn,empty,events,filesView,draftFiles,solutionRead,level4Type,valueText,planText,valuesFrom,RECOGNITION_FIELDS,solutionDraft,assessmentChoices,dictionary,assessmentOrders,responsibilityForm,assessmentAttachments,assessmentSummary})}
  function recordFollow(r,d,time){return followTools().record(r,d,time)}
  function hasHandlingScheme(r){return validPlan(r.handlingPlan)&&Boolean(r.assessedAt||(r.follows||[]).some(f=>['handling','assessment'].includes(f.kind)))}
  function canClose(r){if(canAssess(r))return true;return workflow.can(r,'close')&&(workflow.can(r,'closeDirectly')||closureReady(r))}
  function recordClosure(r,time,note='',closureType='',closeReason=''){const early=workflow.can(r,'closeEarly'),requireReason=workflow.closureReasonRequired(r);if(!requireReason)closeReason='';if(!canClose(r)||requireReason&&(early||closureType==='no-payout')&&!closeReason||closeReason&&!followTools().CLOSED_REASONS.includes(closeReason))return null;if(early)closureType='early';const beforeStatus=r.status;r.status='已结案';delete r.statusDetail;delete r.currentTask;r.handlingPlan='resolved';r.closedAt=time;r.closedBy=ACTOR;r.closedFromStatus=beforeStatus;followTools().stopPeriod(r,time,'已处理并结案');const entry={id:r.id+'-close-'+Date.now(),kind:'closure',time,actor:ACTOR,note:!requireReason||closeReason?String(note||'').trim():String(note||'').trim()||'已确认客诉处理完成，予以结案。',status:r.status,beforeStatus,...(['no-payout','early'].includes(closureType)?{closureType}:{}),...(closeReason?{closeReason}:{}),...recognitionSnapshot(r),files:[]};r.closeNote=entry.note;if(closeReason)r.closeReason=closeReason;else if(!requireReason)delete r.closeReason;r.follows.unshift(entry);return entry}
  function replyAction(){return `<div class="uc-footer-reply">${btn('回复客户','reply-customer')}</div>`}

  function followPanel(r){return followTools().history(r,executionResultRecords(r))+(r.channel==='wechat'?wechatView(r):'')}
  function openComplaint(id,tab='info'){
    if(layers.length)return;main={record:recordById(id),tab:detailTabKey(tab),scrollPositions:{},references:{payment:false},layer:null,editor:null};
    main.layer=openLayer('投诉详情','','');renderDetail();
  }
  const {createTicketForm,syncCreateRequestFields,newTicketErrors,openCreateTicket,saveNewTicket,syncCreateInput,createTicketAction,lookupCreateCustomer,createOrderPickerView,setCreateOrder,createTicketState,createCustomerMatches,createCustomerOrders,setCreateCustomer,createTicketAssociation,createOrderTable,updateCreateOrderCount}=window.PCModules['complaint-intake'].create({CHANNELS,ACTOR,dictionary,field,input,opt,select,section,btn,link,esc,clone,orders,customerDirectory:(...args)=>customerDirectory(...args),phoneView:(...args)=>phoneView(...args),orderProjects,paymentMoney,tag,listValue,empty,pagination,fmt,openLayer,closeLayer,toast,clearErrors,error,now,getLayers:()=>layers,getRecords:()=>records,persist,onCreated(record,layer){layer.afterClose=()=>openComplaint(record.id);closeLayer(true);page=1;renderList();toast('工单已创建，等待客服接单')}});
  function detailReference(key,label,text,content,closedLabel='',actions=''){
    const expandable=key==='payment'&&Boolean(content),open=expandable?main.references[key]:true,id='uc-detail-reference-'+key;
    return `<div class="uc-reference-group${open?' is-open':''}"><div class="uc-reference-row"><span class="uc-reference-label">${label}</span><span class="uc-reference-summary${key==='complaint'?' uc-reference-text':''}" title="${esc(text)}">${esc(text)}</span><div class="uc-actions uc-reference-actions">${expandable?link(open?'收起':closedLabel,'detail-reference',`data-reference="${key}" data-closed-label="${closedLabel}" aria-expanded="${open}" aria-controls="${id}"`):''}${actions}</div></div><div class="uc-reference-content" id="${id}" ${open&&content?'':'hidden'}>${content}</div></div>`;
  }
  function detailCommon(r){return informationView(r)}
  function togglePhone(button){
    if(!main)return;
    const visible=!main.phoneVisible,r=main.record,phone=phoneView(Object.hasOwn(r,'consumptionPhone')&&r.originalContact?r.originalContact:r,visible);
    if(!phone.canReveal){toast('该工单仅保存了脱敏号码，暂无完整号码');return;}
    main.phoneVisible=visible;
    for(const layer of [main.layer,main.editor?.layer].filter(Boolean)){
      const value=layer.el.querySelector('#uc-phone-value'),trigger=layer.el.querySelector('[data-uc="toggle-phone"]');if(!value||!trigger)continue;
      value.textContent=phone.value;trigger.setAttribute('aria-expanded',String(visible));
      (trigger.querySelector('.pc-button-content')||trigger).textContent=visible?'收起号码':'查看完整号码';
    }
  }
  function toggleDetailReference(button){
    const key=button.dataset.reference;if(!main||!Object.hasOwn(main.references,key))return;
    const open=main.references[key]=!main.references[key],group=button.closest('.uc-reference-group'),content=main.layer.el.querySelector('#'+button.getAttribute('aria-controls'));
    group.classList.toggle('is-open',open);content.hidden=!open||!content.innerHTML;button.setAttribute('aria-expanded',String(open));button.textContent=open?'收起':button.dataset.closedLabel;
  }
  function sections(){return [['info','工单信息'],['follows','跟进记录'],['attribution','责任认定']]}
  function detailTabKey(key){return key==='plan'?'attribution':key==='solution'?'follows':sections().some(([id])=>id===key)?key:'info'}
  function detailTabs(){return `<nav class="uc-tabs" role="tablist" aria-label="投诉详情">${sections().map(([id,label])=>`<button type="button" role="tab" class="uc-tab" id="uc-tab-${id}" aria-selected="${main.tab===id}" tabindex="${main.tab===id?'0':'-1'}" aria-controls="uc-section-${id}" data-uc="tab" data-tab="${id}">${label}</button>`).join('')}</nav>`}
  function panel(id,content){return `<section class="uc-tab-panel" role="tabpanel" id="uc-section-${id}" aria-labelledby="uc-tab-${id}" ${main.tab===id?'':'hidden'}>${content}</section>`}
  function setDetailTab(key){if(!main?.layer)return;key=detailTabKey(key);main.tab=key;main.layer.el.querySelectorAll('.uc-tab').forEach(b=>{const active=b.dataset.tab===key;b.setAttribute('aria-selected',active);b.tabIndex=active?0:-1});main.layer.el.querySelectorAll('.uc-tab-panel').forEach(p=>p.hidden=p.id!=='uc-section-'+key)}
  function selectDetailTab(key,focus=true){key=detailTabKey(key);const body=main.layer.el.querySelector('.uc-drawer-body'),scroll=body.scrollTop,tabTop=body.querySelector('.uc-detail-common').offsetHeight;main.scrollPositions[main.tab]=scroll;setDetailTab(key);body.scrollTop=scroll<=tabTop?scroll:Math.max(tabTop,main.scrollPositions[key]||0);if(focus)main.layer.el.querySelector('#uc-tab-'+key)?.focus({preventScroll:true})}
  function attributionPanel(r){
    const fields=[
      ...assessmentFields(r),
      ['附件',r.handlingFiles?.length?filesView(r.handlingFiles,'handling'):'无',true,true],
      ...(r.assessedAt?[['认定人',r.assessedBy||'未记录'],['认定时间',fmt(r.assessedAt)]]:[])
    ];
    return section('责任认定',`<div class="uc-details">${fields.map(args=>detail(...args)).join('')}</div>`,canEditAssessment(r)?btn(hasAssessment(r)?'编辑':'填写责任认定','begin-assessment','aria-label="填写或编辑责任认定"'):'');
  }
  function detailPanels(r){return panel('info',detailCommon(r)+(r.customerSolution?section('已确认解决方案',solutionRead(r.customerSolution)):'')+(needsReviewInfo(r)?section('客服复核',reviewForm(r,'detail')):'')+(r.status==='已结案'?section('结案信息',`<div class="uc-details">${r.closedFromStatus==='客服复核中'&&!r.closeReason?'':detail('结案原因',r.closeReason||'未记录',true)}${detail('结案说明',r.closeNote||'未填写',true)}${detail('操作人',r.closedBy||'未记录')}${detail('结案时间',fmt(r.closedAt))}</div>`):'')+processView(r))+panel('follows',followPanel(r))+panel('attribution',attributionPanel(r))}
  function renderDetail(){if(!main.layer)return;const r=main.record,layer=main.layer,body=layer.el.querySelector('.uc-drawer-body');if(body.children.length)main.scrollPositions[main.tab]=body.scrollTop;layer.el.querySelector('.uc-drawer').classList.add('uc-detail-drawer','uc-workspace');layer.el.querySelector('.uc-layer-top').innerHTML='';body.classList.add('uc-detail-body');body.innerHTML=`<section class="uc-detail-common" aria-label="工单概况">${summary(r,main.phoneVisible)}</section>${detailTabs()}<div class="uc-detail-panels">${detailPanels(r)}</div>`;body.scrollTop=main.scrollPositions[main.tab]||0;layer.el.querySelector('.uc-drawer-foot').innerHTML=detailActions(r)}
  const {customerPageView,financeApprovalView,summary,phoneView,informationView,orderCards,assessmentOrders,processingDepartment,processRecords,processView,executionResultRecords,detailActions,closureReady}=window.PCModules['complaint-detail'].create({btn,replyAction,canFollow,canAssess,canGrade,canClose,workflowActions:workflow.detailActions,workflowDepartment:workflow.department,financeApproval:workflow.financeApproval,financeReturn:workflow.financeReturn,hasHandlingScheme,handlingMissing,icon,workOrderStatus,valueText,planText,detail,statusTag,currentHandler,currentTask,events,esc,empty,section,fmt,levelTag,level4Type,CHANNELS,interval,filesView,solutionRead,approvalLabels:workflow.approvalLabels,link,tag,resolveLink,orderProjects,money,iconFile,paymentView,paymentMoney,detailReference,customerIdOf,isDemoRecord:r=>r.demoDetailsVersion===DEMO_DETAILS_VERSION&&customers[Number(r.id)-31001]?.[0]===r.name&&r.customerId==='C'+(Number(r.id)-31001)});
  function openFinanceApproval(id){
    if(!main||main.editor||layers.length>1)return;
    const approval=(main.record.financeApprovals||[]).find(item=>item.id===id)||workflow.financeApproval(main.record);if(!approval)return;
    openLayer('财务审批详情',financeApprovalView(main.record,approval),btn('关闭','dismiss'),2);
  }
  function paymentListSummary(r){return r.channel==='wechat'?`<div class="uc-payment-list-summary"><span>订单 ${esc(paymentMoney(r.paymentAmount))}</span><span>申请退款 ${esc(paymentMoney(r.refund))}</span></div>`:''}
  function paymentView(r){const read=(label,value,full=false)=>detail(label,valueText(value).trim()||'—',full);return `<section class="uc-channel-payment" aria-label="微信支付信息"><div class="uc-section-head"><h4>微信支付信息</h4><div class="uc-channel-state">${wechatStatusTag(r.channelStatus)}</div></div><div class="uc-details uc-payment-facts">${read('商户名称',r.merchant)}${read('商户号',r.merchantId)}${read('微信投诉单号',r.sourceId)}${read('投诉时间',r.created?fmt(r.created):'')}${read('外部单号',r.externalOrder)}${read('客户昵称',r.wechatNickname)}${read('问题类型',r.problemType)}${read('问题描述',r.problemDescription)}${read('订单金额',paymentMoney(r.paymentAmount))}${read('申请退款金额',paymentMoney(r.refund))}</div><details class="uc-inline-details uc-payment-more"><summary>更多支付资料</summary><div class="uc-details">${read('微信支付订单号',r.payOrder,true)}${read('投诉次数',r.complaintCount===undefined||r.complaintCount===null?'':r.complaintCount+' 次')}${read('风险状态',r.riskStatus)}</div></details></section>`}
  function resolveLink(item){const order=orders.find(o=>o.id===item.id);return {order,wx:order?.wechatChoices.find(w=>w.id===(item.wechatId||order.bookingWechatId))}}
  function orderProjects(order){return Array.isArray(order.projects)?order.projects:order.project?[{name:order.project,reception:order.reception,operator:order.operator}]:[]}
  function responsibilityRule(type){if(type==='广告宣传')return '广告效果 → 推广人';if(['光电操作','脱毛操作'].includes(type))return '操作问题 → 操作老师';if(type==='门店服务')return '服务态度 → 门店';return ''}
  function events(items,render){return `<div class="uc-timeline">${items.map(item=>`<article class="uc-event"><time class="uc-event-time">${esc(fmt(item.time))}</time><div class="uc-event-content">${render(item)}</div></article>`).join('')}</div>`}
  function wechatView(r){return r.messages?.length?`<details class="uc-inline-details uc-channel-disclosure"><summary>微信协商记录</summary>${events([...r.messages].reverse(),m=>`<div class="uc-event-title"><strong>${esc(m.actor)}</strong>${tag(m.type,'blue')}</div><div class="uc-event-text">${esc(m.text)}</div>${filesView(m.files||[],'message',r.messages.indexOf(m))}`)}</details>`:''}
  function filesView(files,kind,index=''){return files?.length?`<div class="uc-attachments uc-image-gallery">${files.map((f,i)=>String(f.data||'').startsWith('data:image/')?`<button type="button" class="uc-image-thumb" data-uc="file" data-kind="${kind}" data-index="${index}" data-file="${i}" aria-label="查看图片：${esc(f.name)}"><img src="${esc(f.data)}" alt="${esc(f.name)}" loading="lazy"><span>${esc(f.name)}</span></button>`:`<button type="button" class="uc-file uc-file-download" data-uc="file" data-kind="${kind}" data-index="${index}" data-file="${i}" aria-label="${isAudioFile(f)?'播放录音':'下载附件'}：${esc(f.name)}">${iconFile}<span>${esc(f.name)}</span><span class="uc-link">${isAudioFile(f)?'播放':'下载'}</span></button>`).join('')}</div>`:''}
  function draftFiles(files,preview=false,scope=''){return files.length?`<div class="uc-attachments">${files.map((f,i)=>`<div class="uc-file">${preview?`<img class="uc-reply-image" src="${esc(f.data)}" alt="${esc(f.name)}">`:''}<span>${esc(f.name)}</span>${link('移除','remove-file',`data-file="${i}"${scope?` data-files="${scope}"`:''}`)}</div>`).join('')}</div>`:''}

  function openEditor(kind,draft,followId=null){
    if(main.editor)return;
    const handling=Object.hasOwn(followTools().OPERATIONS,kind),e={kind,draft,baseline:JSON.stringify(draft),followId,handling,selectingOrders:kind==='orders',uploading:false};
    if(kind==='orders')Object.assign(e,orderPickerState(main.record,draft.linked));main.editor=e;
    e.layer=openLayer(kind==='closure'&&workflow.state(main.record)==='客服复核中'?'结案':handling?'跟进处理':kind==='orders'?orderPickerTitle(e):kind==='assessment'?'责任认定':'回复客户','','',2);e.layer.editor=true;e.layer.el.querySelector('.uc-drawer').classList.add('uc-operation-drawer','uc-'+kind+'-editor');
    renderEditor(true);
  }
  function finishEditor(target){
    const e=main?.editor;if(target&&e?.layer.parentView)e.layer.parentView.tab=target;
    closeLayer(true);
  }
  function editorContext(r=main.record){return `<div class="uc-editor-context"><div><strong>${esc(r.name)}</strong><span>${esc(phoneView(r).value)}</span><span>${esc(r.store)}</span></div><div class="uc-muted">投诉 ${r.id} · ${CHANNELS[r.channel]} · ${fmt(r.created)}${statusTag(r.status)}</div></div>`}
  function renderEditor(resetScroll=false){
    const e=main.editor;if(!e)return;
    const operations=workflow.handlingOptions(main.record);
    const body=e.layer.el.querySelector('.uc-drawer-body'),scroll=resetScroll?0:body.scrollTop,small=e.kind==='reply',drawer=e.layer.el.querySelector('.uc-drawer');
    drawer.dataset.size=small?'small':'medium';drawer.style.setProperty('--archive-drawer-width',small?'560px':'860px');
    if(e.kind==='orders'){const title=orderPickerTitle(e);e.layer.el.querySelector('h2').textContent=title;drawer.setAttribute('aria-label',title);e.layer.el.querySelector('.uc-drawer-head button').setAttribute('aria-label','关闭'+title);}
    e.layer.el.querySelector('.uc-layer-top').innerHTML=e.handling?'':editorContext(e.exampleRecord||main.record);body.classList.add('uc-editor-body');body.classList.toggle('uc-handling-body',Boolean(e.handling));
    let content=e.kind==='orders'?orderPickerView():e.kind==='assessment'?assessmentForm():e.kind==='compensation'?`<div id="uc-compensation-form" data-draft="compensation" novalidate>${solutionForm()}</div>`:e.kind==='closure'?followTools().closureForm(e.draft,workflow.closureReasonRequired(main.record)):e.kind==='reply'?replyForm():followForm();
    content=followTools().handlingPanel(e,content)+inlineAssessmentForm();
    if(e.handling)content=`<div class="uc-handling-content"><section class="uc-detail-common" aria-label="工单概况">${summary(main.record,main.phoneVisible,true)}</section>`+(!e.followId&&Object.keys(operations).length>1?followTools().operationChoice(e.kind,operations):'')+`<section id="uc-operation-panel" aria-label="${(operations[e.kind]||followTools().OPERATIONS[e.kind])[0]}">${content}</section></div>`;
    body.innerHTML=content;body.scrollTop=scroll;renderEditorFooter();
  }
  function renderEditorFooter(){const e=main.editor;if(!e)return;e.submitLabel=e.draft.customerSolution?.methods.some(key=>['refund','compensation'].includes(key))?'提交财务审批':'提交客服复核';const foot=e.layer.el.querySelector('.uc-drawer-foot');foot.innerHTML=followTools().editorFooter(e,e.kind==='compensation'?solutionFoot():'',main.record);followTools().updateAssessmentState(main.record,e)}
  // Adapted from complaint-prototype/workflow proposalForm and ticket-operations.
  // The unified module uses its own customers, orders and saved handling records.
  const SOLUTION_METHODS={refund:'退款',compensation:'退款+赔偿',exchange:'置换商品',other:'其他'};
  const PAYOUT_METHODS={bank:'银行卡',alipay:'支付宝',wechat:'微信'};
  const centsText=value=>(Number(value||0)/100).toFixed(2);
  function toCents(value){const text=String(value??'').trim();if(!/^\d+(\.\d{1,2})?$/.test(text))return null;const [whole,fraction='']=text.split('.'),amount=Number(whole)*100+Number(fraction.padEnd(2,'0'));return Number.isSafeInteger(amount)?amount:null}
  const centsMoney=value=>'¥'+money(Number(value||0)/100);
  function savedRefundOrders(p){if(Array.isArray(p?.refundOrders))return p.refundOrders;if(p?.refundOrderId)return [{orderId:p.refundOrderId,refund:p.refund||0,refundItems:p.refundItems||[]}];return []}
  function refundKey(orderId,itemId){return orderId+':'+itemId}
  function loadSolutionTools(){
    return window.PCApp.loadModule('complaint-solutions');
  }
  function solutionTools(){return window.PCModules['complaint-solutions'].create({clone,solutionOrders,savedRefundOrders,refundEntries,refundKey,centsText,getRecord:()=>main.record,SOLUTION_METHODS,toCents,refundAvailable,PAYOUT_METHODS,validHandlingFile,getRecords:()=>records,selectedRefundEntries,esc,centsMoney,input,link,field,select,empty,solutionTotals,renderSolutionFields})}
  function solutionDraft(saved){return solutionTools().solutionDraft(saved)}
  function validateCustomerSolution(draft){return solutionTools().validateCustomerSolution(draft)}
  function solutionOrders(){const r=main.record,id=customerIdOf(r);return id?orders.filter(order=>order.customerId===id):orders.filter(order=>(r.linked||[]).some(link=>link.id===order.id))}
  function selectedRefundEntries(p){return refundEntries().filter(row=>p.refundOrderIds.includes(row.order.id))}
  function refundItems(order){return (order?.projects||[]).map(p=>({...p,paid:p.paid||0,refunded:p.refunded||0}))}
  function refundEntries(){return solutionOrders().flatMap((order,orderIndex)=>refundItems(order).map((item,itemIndex)=>({order,item,key:refundKey(order.id,item.id),field:'refund-'+orderIndex+'-'+itemIndex})))}
  function refundAvailable(order,item){const reserved=records.filter(r=>r.id!==main.record.id).flatMap(r=>savedRefundOrders(r.customerSolution)).filter(group=>group.orderId===order.id).reduce((sum,group)=>sum+(item?(group.refundItems||[]).filter(i=>i.itemId===item.id).reduce((n,i)=>n+(i.amount||0),0):group.refund||0),0);return Math.max(0,(item?item.paid-(item.refunded||0):refundItems(order).reduce((n,i)=>n+i.paid-i.refunded,0))-reserved)}
  function solutionTotals(p){return {refund:solutionTools().hasRefund(p)?selectedRefundEntries(p).reduce((n,row)=>n+(toCents(p.refundAmounts[row.key])||0),0):0,compensation:p.methods.includes('compensation')?(toCents(p.compensationAmount)||0):0}}
  function solutionControl(name,label,value,placeholder='',options={}){const {type='text',required=true,full=false,max=100,items}=options;const attr=`data-solution="${name}" maxlength="${max}"${required?' required aria-required="true"':''}`;const control=items?select('solution-'+name,items,value,placeholder,attr):type==='textarea'?`<textarea id="uc-solution-${name}" class="uc-input" name="solution-${name}" rows="3" placeholder="${esc(placeholder)}" ${attr}>${esc(value)}</textarea>`:input('solution-'+name,value,placeholder,type,attr+(type==='number'?' min="0.01" step="0.01" inputmode="decimal"':''));return field('solution-'+name,label,control,required,'',full)}
  function solutionForm(){const p=main.editor.draft.customerSolution,methods=multiSelect('solutionMethods','处理方式',Object.entries(SOLUTION_METHODS),p.methods,'data-solution-method required aria-required="true"');return `<div class="uc-solution-method ub-form pc-form-single">${solutionControl('customerContext','消费与诉求',p.customerContext,'填写客户消费情况及本次诉求',{type:'textarea',full:true,max:2000})}${field('solutionMethods','处理方式',methods,true,'',true)}</div><div id="uc-solution-fields">${solutionFields()}</div>`}
  function solutionFields(){const p=main.editor.draft.customerSolution,has=key=>p.methods.includes(key),refund=solutionTools().hasRefund(p);return [
    refund?section(`<span class="uc-actions">${has('compensation')?SOLUTION_METHODS.compensation:'订单退款'}${link('添加订单','solution-add-orders','id="uc-add-refund-orders"')}</span>`,refundEditor()+(has('compensation')?`<div class="ub-form">${solutionControl('compensationAmount','额外赔偿',p.compensationAmount,'填写额外赔偿金额',{type:'number',full:true})}</div>`:'')):'',
    has('exchange')?section('置换商品',`<div class="ub-form">${solutionControl('exchangeDescription','置换说明',p.exchangeDescription,'填写置换商品及数量',{type:'textarea',full:true,max:2000})}</div>`):'',
    has('other')?section('其他方案',`<div class="ub-form">${solutionControl('otherDescription','方案说明',p.otherDescription,'填写其他方案说明',{type:'textarea',full:true,max:2000})}</div>`):'',
    refund?section('收款信息',`<div class="ub-form pc-form-single">${field('solution-payout-method','收款方式',`<div class="uc-solution-radios" role="radiogroup" aria-label="收款方式">${Object.entries(PAYOUT_METHODS).map(([key,label],index)=>`<label><input type="radio" id="uc-solution-payout-method${index?'-'+key:''}" name="solutionPayout" data-solution="payout-method" value="${key}"${p.payout.method===key?' checked':''}>${label}</label>`).join('')}</div>`,true,'',true)}${solutionControl('payout-name',p.payout.method==='bank'?'开户姓名':'收款人姓名',p.payout.name,p.payout.method==='bank'?'填写与银行卡一致的开户姓名':'填写收款人姓名',{max:50,full:true})}${solutionControl('payout-account','收款账号',p.payout.account,'填写对应的收款账号',{full:true})}${p.payout.method==='bank'?solutionControl('payout-bank','开户银行',p.payout.bank,'银行名称及支行',{full:true}):''}</div>`):'',
    `<div class="ub-form pc-form-single">${field('solution-attachments','方案附件',`<div><div class="uc-upload-row">${btn('上传附件','upload-solution',main.editor.uploading?'disabled':'')}<input type="file" id="uc-solution-upload" accept="${Object.keys(HANDLING_FILE_TYPES).map(ext=>'.'+ext).join(',')}" multiple hidden data-upload="solution"><span class="uc-muted">支持图片、PDF、Word、Excel、录音，最多 4 个，每个 5MB 以内</span></div><div id="uc-upload-list" aria-live="polite">${draftFiles(p.attachments)}</div></div>`,false,'',true)}</div>`,
  ].join('')}
  function refundEditor(){return solutionTools().refundEditor(main.editor.draft.customerSolution)}
  function renderSolutionFields(focusId){const e=main.editor,body=e.layer.el.querySelector('.uc-drawer-body'),scroll=body.scrollTop;e.layer.el.querySelector('#uc-solution-fields').innerHTML=solutionFields();body.scrollTop=scroll;updateSolutionTotals();if(focusId)e.layer.el.querySelector('#'+focusId)?.focus({preventScroll:true})}
  function solutionFoot(){const totals=solutionTotals(main.editor.draft.customerSolution);return `<div class="uc-solution-total" aria-live="polite"><span>应付款合计</span><strong>${centsMoney(totals.refund+totals.compensation)}</strong></div>`}
  function updateSolutionTotals(){const e=main.editor,p=e.draft.customerSolution,totals=solutionTotals(p);e.layer.el.querySelectorAll('[data-solution-total]').forEach(el=>el.textContent=centsMoney(totals[el.dataset.solutionTotal]));e.layer.el.querySelectorAll('[data-refund-all]').forEach(all=>{const boxes=[...all.closest('.uc-refund-order-group').querySelectorAll('[data-refund-item]:not(:disabled)')];all.indeterminate=boxes.some(i=>i.checked)&&!boxes.every(i=>i.checked)});solutionTools().updateRefundQuantities(p,e.layer.el);renderEditorFooter()}
  function syncSolution(el){const e=main?.editor;if(e?.kind!=='compensation')return false;const p=e.draft.customerSolution;
    if(el.hasAttribute('data-solution-method')){const selected=[...el.selectedOptions].map(option=>option.value);p.methods=Object.keys(SOLUTION_METHODS).filter(key=>selected.includes(key));e.layer.el.querySelector('#uc-error-solutionMethods').textContent='';el.removeAttribute('aria-invalid');renderSolutionFields();return true}
    if(el.hasAttribute('data-solution')){const key=el.dataset.solution,parts=key.split('-'),old=parts.length===2?p[parts[0]][parts[1]]:p[key];if(old===el.value)return true;if(parts.length===2)p[parts[0]][parts[1]]=el.value;else p[key]=el.value;el.removeAttribute('aria-invalid');const err=e.layer.el.querySelector('#uc-error-solution-'+key);if(err)err.textContent='';if(key==='payout-method'){renderSolutionFields();e.layer.el.querySelector('[data-solution="payout-method"]:checked')?.focus({preventScroll:true})}else updateSolutionTotals();return true}
    if(solutionTools().syncRefund(el,p,e.layer.el)){updateSolutionTotals();return true}
    return false;
  }
  function solutionAction(action,b){const e=main?.editor;if(e?.kind!=='compensation')return;if(!canAssess(main.record)){toast('当前状态不可修改解决方案');return}const p=e.draft.customerSolution;
    if(action==='solution-add-orders')solutionTools().openRefundOrderPicker(p,{isCurrent:()=>main?.editor===e&&canAssess(main.record),onAdded:()=>{renderSolutionFields();setTimeout(()=>{if(main?.editor===e)e.layer.el.querySelector('#uc-add-refund-orders')?.focus({preventScroll:true})},320)}});
    if(action==='solution-full-refund'){const row=refundEntries().find(row=>row.key===b.dataset.item);if(row)solutionTools().selectFullRefund(p,row);renderSolutionFields();e.layer.el.querySelector('[data-refund-amount="'+b.dataset.item+'"]')?.focus({preventScroll:true})}
  }
  function solutionRead(p,historyIndex='',extraFields=[]){
    if(!p)return '<span class="uc-muted">暂未填写解决方案</span>';
    const methods=p.handlingMethods||[],has=key=>methods.includes(key),refund=has('refund')||has('compensation')&&savedRefundOrders(p).length>0,labels=methods.filter(key=>key!=='refund'||!has('compensation')).map(key=>SOLUTION_METHODS[key]).filter(Boolean),details=[];
    if(p.customerContext)details.push(detail('客户消费情况与诉求',p.customerContext,true));
    if(labels.length)details.push(detail('处理方式',labels.join('、'),true));
    if(refund){details.push(detail('退款金额',centsMoney(p.refund),true));for(const order of savedRefundOrders(p))details.push(detail('退款订单',order.orderId,true),detail('退款项目',(order.refundItems||[]).map(i=>i.name+' · '+centsMoney(i.amount)+(Number.isSafeInteger(i.refundQuantity)?' · 本次退款数量 '+i.refundQuantity+' · 退款前剩余 '+i.remainingBefore+' → 退款后剩余 '+i.remainingAfter:' · 退款数量未记录')).join('；'),true),...(order.refundStore?[detail('退款所属门店',order.refundStore),detail('业绩归属人员',order.performanceId),detail('退款原因备注',order.refundReason,true)]:[]))}
    if(has('compensation'))details.push(detail('额外赔偿金额',centsMoney(p.compensation)),...(p.compensationReason?[detail('赔偿原因备注',p.compensationReason,true)]:[]));
    if(has('exchange')&&p.exchangeDescription)details.push(detail('置换商品说明',p.exchangeDescription,true));
    else if(has('exchange'))details.push(detail('置换商品',(p.exchangeItems||[]).map(i=>i.name+' × '+i.quantity+' · '+centsMoney(i.unitPrice*i.quantity)).join('；'),true),detail('收货人',(p.delivery?.name||'')+' · '+(p.delivery?.phone||'')),detail('收货地址',p.delivery?.address,true));
    if(has('other'))details.push(detail('其他方案说明',p.otherDescription,true));
    if(has('refund')||has('compensation'))details.push(detail('应付款合计',centsMoney((refund?p.refund||0:0)+(has('compensation')?p.compensation||0:0)),true));
    if(p.payout)details.push(detail('收款方式',PAYOUT_METHODS[p.payout.method]),detail('收款人',p.payout.name),detail('收款账号',p.payout.account),...(p.payout.method==='bank'?[detail('开户银行',p.payout.bank)]:[]));
    if(has('service')&&p.content)details.push(detail('处理说明',p.content,true));
    details.push(...extraFields.map(([label,value,full])=>detail(label,value,full)));
    return (details.length?`<div class="uc-details">${details.join('')}</div>`:'')+filesView(p.attachments||[],historyIndex===''?'solution':'solution-history',historyIndex);
  }
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
  function assessmentChoices(name,label,items,value,multiple=false){const selected=multiValues(value),options=items.map(item=>Array.isArray(item)?item:[item,item]);if(multiple)selected.forEach(value=>{if(!options.some(([key])=>key===value))options.push([value,value])});return `<div class="uc-solution-${multiple?'choices':'radios'}" role="${multiple?'group':'radiogroup'}" aria-label="${label}">${options.map(([key,text],index)=>`<label><input type="${multiple?'checkbox':'radio'}" id="uc-${name}${index?'-'+index:''}" name="${name}" value="${esc(key)}"${selected.includes(key)?' checked':''}>${esc(text)}</label>`).join('')}</div>`}

  function inlineAssessmentForm(){return followTools().inlineAssessmentForm(main?.record,main?.editor)}
  function assessmentForm(){const r=main.record,linked=r.linked;return `<div id="uc-assessment-form" class="uc-assessment-layout" data-draft="assessment" novalidate>${section('关联订单',linked.length?orderCards(linked):empty('暂未关联订单'),`<span class="uc-muted">${linked.length} 笔</span>`)}${section('处理信息',`<div class="pc-form pc-form-single">${responsibilityForm()}<div class="ub-form pc-form-single">${assessmentAttachments(main.editor.draft)}</div></div>`)}</div>`}
  function followForm(){const e=main.editor;return followTools().form(main.record,e.draft,main.record.follows.find(f=>f.id===e.followId))}
  function replyForm(){const d=main.editor.draft;return `<div id="uc-reply-form" data-draft="reply" novalidate>${field('note','回复内容',`<textarea id="uc-note" name="note" class="uc-input" rows="6" maxlength="2000" placeholder="填写回复客户的内容">${esc(d.note)}</textarea>`)}${field('replyImages','图片',`<div><div class="uc-upload-row">${btn('添加图片','upload-reply','id="uc-replyImages"')}<input type="file" id="uc-reply-upload" accept="image/png,image/jpeg" multiple hidden data-upload="reply"></div><div class="uc-help">最多 4 张，每张 5MB 以内，支持 JPG、PNG</div><div id="uc-upload-list" aria-live="polite">${draftFiles(d.files,true)}</div></div>`)}</div>`}
  function beginReply(){if(!main||main.editor)return;openEditor('reply',{note:'',files:[]})}
  function editGrade(accept=false){
    if(!main||main.editor||(accept?main.record.status!=='待处理':!canGrade(main.record)))return;
    const current=main;followTools().gradeDialog(main.record,accept,grade=>{
      if(main!==current)return false;const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=accept?recordAccept(r,now(),grade):followTools().recordGrade(r,grade,now());
      if(!entry){toast(accept?'当前工单已不可接单':'客诉等级未变更');return !accept}
      if(!commitRecord(next,entry.action,JSON.stringify(entry.before)+' → '+JSON.stringify(grade)))return false;
      toast(accept?'等级已确认，客服已接单':'客诉等级已更新');return true;
    });
  }
  function askAccept(){editGrade(true)}

  function beginAssessment(){if(!canEditAssessment(main.record)){toast(main.record.status==='已结案'?'该客诉已结案':main.record.status==='待处理'?'请先接单':'当前状态不可修改责任认定');return}openEditor('assessment',followTools().operationDraft('assessment',main.record))}
  async function beginCompensation(){if(!main||main.editor||!canAssess(main.record))return;const detail=main;try{await loadSolutionTools();if(main!==detail||main.editor||main.layer.closing||!canAssess(main.record))return;openEditor('compensation',followTools().operationDraft('compensation',main.record))}catch(error){if(main===detail)toast(error.message)}}
  function beginHandling(){if(!main||main.editor||!Object.hasOwn(workflow.handlingOptions(main.record),'follow'))return;openEditor('follow',followTools().draft(main.record))}
  async function chooseOperation(kind){
    const e=main?.editor;if(!e||e.followId||!Object.hasOwn(workflow.handlingOptions(main.record),kind))return;
    if(e.uploading){toast('附件正在读取，请稍后切换');return}const previous=e.kind;
    if(kind===e.kind)return;
    try{if(kind==='compensation')await loadSolutionTools();if(main?.editor!==e||e.kind!==previous||e.layer.closing||!Object.hasOwn(workflow.handlingOptions(main.record),kind))return;
      followTools().switchOperation(e,kind,main.record);renderEditor(true);
    }catch(error){toast(error.message)}
  }
  function editFollowRecord(id){const f=main.record.follows.find(f=>f.id===id);if(followTools().editable(f))openEditor('follow',followTools().draft(main.record,f),id)}
  function syncDraft(el){if(syncReview(el)||syncCreateInput(el))return;if(syncOptionDraft(el)||syncSolution(el))return;const e=main?.editor;if(e?.kind==='orders'&&el.closest('#uc-customer-search')){readCustomerSearch();e.layer.el.querySelector('#uc-customer-search-error').textContent='';return}const inline=Boolean(el.closest('[data-inline-assessment]')),d=inline?e?.assessmentDraft:e?.draft;if(!d||!el.closest('[data-draft]')||!Object.hasOwn(d,el.name)||el.type==='radio'&&!el.checked)return;d[el.name]=el.type==='checkbox'?[...e.layer.el.querySelectorAll('input[type="checkbox"][name="'+el.name+'"]:checked')].map(input=>input.value):el.multiple?[...el.selectedOptions].map(option=>option.value):el.value;el.removeAttribute('aria-invalid');e.layer.el.querySelector('#uc-'+el.name)?.removeAttribute('aria-invalid');const err=e.layer.el.querySelector('#uc-error-'+el.name);if(err)err.textContent='';if(e.kind==='assessment'||inline){
    syncResponsibility(el,d);
    if(inline)followTools().updateAssessmentState(main.record,e);
  }}
  function commitRecord(next,action,text){const r=next.find(r=>r.id===main.record.id);r.logs.unshift({time:now(),actor:ACTOR,action,text});if(!persist(next))return false;main.record=r;renderList();renderDetail();return true}
  function saveAssessment(){
    const e=main.editor;
    if(!canEditAssessment(main.record)){toast('当前状态不可修改责任认定');return}
    if(e.uploading){toast('附件正在读取，请稍后保存');return}
    clearErrors(e.layer.el);const missing=handlingMissing(e.draft).filter(([name])=>name!=='handlingPlan');
    if(missing.length){const [first]=missing[0];missing.forEach(([name,message])=>error(e.layer.el,name,message));const control=e.layer.el.querySelector('#uc-'+first)||e.layer.el.querySelector('[data-field="'+first+'"] input')||e.layer.el.querySelector('[data-field="'+first+'"] select');PCUI.focusControl(control);(control||e.layer.el.querySelector('#uc-error-'+first))?.scrollIntoView({block:'center'});return}
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=recordRecognition(r,e.draft,now(),{assessmentOnly:true,handlingPlan:r.handlingPlan||'unresolved'});
    if(!entry){finishEditor('attribution');toast('处理信息未变更');return}
    if(!commitRecord(next,entry.action,JSON.stringify(recognitionLog(entry.before))+' → '+JSON.stringify(recognitionLog(recognitionSnapshot(r)))))return;
    finishEditor('attribution');toast('责任认定已保存');
  }
  function saveCompensation(){
    const e=main?.editor;if(e?.kind!=='compensation')return;if(!canAssess(main.record)){toast('当前状态不可修改解决方案');return}if(e.uploading){toast('附件正在读取，请稍后保存');return}
    clearErrors(e.layer.el);const solution=validateCustomerSolution(e.draft.customerSolution);solution.errors.push(...followTools().inlineAssessmentErrors(main.record,e));
    if(followTools().showHandlingErrors(main.record,e,solution.errors))return;
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=followTools().recordHandlingOutcome(r,e,now(),solution.value);
    if(!entry){toast('当前工单暂不可提交，请检查方案与责任认定');return}
    if(!commitRecord(next,'保存解决方案',JSON.stringify(entry.before)+' → '+JSON.stringify(entry.customerSolution)))return;
    finishEditor(r.status==='财务审批中'?'info':'follows');toast(r.status==='财务审批中'?'解决方案已确认，已提交财务审批':'解决方案已确认，已提交客服复核');
  }
  function saveReply(){const e=main?.editor;if(e?.kind!=='reply')return;if(e.uploading){toast('图片正在读取，请稍后保存');return}clearErrors(e.layer.el);const note=e.draft.note.trim();if(!note&&!e.draft.files.length){error(e.layer.el,'note','请填写回复内容或添加图片');e.layer.el.querySelector('#uc-note').focus();return}const next=clone(records),r=next.find(r=>r.id===main.record.id);r.follows.unshift({id:r.id+'-reply-'+Date.now()+'-'+r.follows.length,kind:'reply',time:now(),actor:ACTOR,note,files:clone(e.draft.files),beforeStatus:r.status,status:r.status});if(!commitRecord(next,'回复客户',note||(e.draft.files.length+' 张图片')))return;closeLayer(true);toast('回复已保存，可在跟进记录中查看')}
  function saveFollow(){
    const e=main?.editor;if(e?.kind!=='follow')return;if(e.uploading){toast('图片正在读取，请稍后保存');return}
    clearErrors(e.layer.el);const old=main.record.follows.find(f=>f.id===e.followId),errors=followTools().validate(main.record,e.draft,old);
    if(errors.length){errors.forEach(([name,message])=>error(e.layer.el,name,message));PCUI.focusControl(e.layer.el.querySelector('#uc-'+errors[0][0]));return}
    const next=clone(records),r=next.find(r=>r.id===main.record.id),time=now(),entry=e.followId?followTools().edit(r,e.followId,e.draft,time):recordFollow(r,e.draft,time);
    if(!entry){toast('该记录已不可修改，请重新查看工单');return}
    const log=JSON.stringify({note:entry.note,communication:entry.communication});
    if(!commitRecord(next,e.followId?'修改跟进':'新增跟进',log))return;
    finishEditor('follows');toast(e.followId?'跟进记录已更新':entry.communication?.result==='ongoing'?'当前处理卡点已记录':'跟进记录已保存');
  }
  function saveClosure(){
    const e=main?.editor;if(e?.kind!=='closure')return;if(e.uploading){toast('附件正在读取，请稍后保存');return}
    if(!canClose(main.record)){toast('请先完成责任认定及后续待办流程后再结案');return}
    clearErrors(e.layer.el);const missing=followTools().inlineAssessmentErrors(main.record,e);
    if(workflow.closureReasonRequired(main.record)&&!followTools().CLOSED_REASONS.includes(e.draft.closeReason))missing.unshift(['closeReason','请选择结案原因']);
    if(followTools().showHandlingErrors(main.record,e,missing))return;
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=followTools().recordHandlingOutcome(r,e,now());
    if(!entry){toast('当前工单暂不可结案');return}
    if(!commitRecord(next,entry.closureType==='early'?'提前结案':'结案',entry.note))return;
    finishEditor('follows');toast('工单已结案');
  }
  function askClosure(){if(!main||main.editor||!canClose(main.record))return;openEditor('closure',followTools().operationDraft('closure',main.record))}
  function confirmClosure(){saveClosure()}
  function openPicker(){if(main.record.status==='已结案')return;openEditor('orders',{linked:clone(main.record.linked)});main.editor.layer.el.querySelector('#uc-customerKeyword')?.focus()}
  function orderDateRange(preset,today=now().slice(0,10)){
    const [year,month,day]=today.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day)),format=value=>value.toISOString().slice(0,10);let start=new Date(date),end=new Date(date);
    if(preset==='lastMonth'){start=new Date(Date.UTC(year,month-2,1));end=new Date(Date.UTC(year,month-1,0))}
    else if(preset==='yesterday'){start.setUTCDate(day-1);end=new Date(start)}
    else if(preset==='week'){start.setUTCDate(day-(date.getUTCDay()+6)%7);end=new Date(start);end.setUTCDate(start.getUTCDate()+6)}
    else if(preset==='month'){start=new Date(Date.UTC(year,month-1,1));end=new Date(Date.UTC(year,month,0))}
    return {start:format(start),end:format(end)};
  }
  const {orderPickerTitle,customerDirectory,matchingCustomers,orderPickerState,orderPickerDirty,orderPickerCustomers,orderPickerOrders,selectPickerCustomer,changePickerCustomer,selectPickerOrder,orderPickerView,recordOrderAssociation}=window.PCModules['complaint-order-linking'].create({getRecords:()=>records,getEditor:()=>main?.editor,orders,customerIdOf,CUSTOMER_KEYWORDS,clone,phoneView,section,esc,link,input,btn,empty,tag,listValue,pagination,orderProjects,ACTOR});
  function matchingOrders(criteria){const key=ORDER_KEYWORDS.some(([value])=>value===criteria.keywordType)?criteria.keywordType:'phone',keyword=(criteria.keyword||'').trim().toLowerCase(),consultant=(criteria.consultant||'').trim().toLowerCase();return orders.filter(o=>{const arrived=(o.arrived||'').slice(0,10);return (!keyword||String(o[key]||'').toLowerCase().includes(keyword))&&(!consultant||String(o.consultant||'').toLowerCase().includes(consultant))&&(!criteria.start||(arrived&&arrived>=criteria.start))&&(!criteria.end||(arrived&&arrived<=criteria.end))})}
  function readCustomerSearch(){const e=main.editor,form=e.layer.el.querySelector('#uc-customer-search');if(form)e.customerSearch=Object.fromEntries(new FormData(form));return e.customerSearch}
  function confirmOrders(){
    const e=main.editor;if(e?.kind!=='orders')return;
    if((!e.multipleOrders&&e.selection.length!==1)||!e.orderCustomerId){toast('请先确认客户并选择关联订单');return}
    if(!orderPickerDirty(e)){if(e.exampleRecord)returnFromOrderExample();else closeLayer(true);return}
    if(e.exampleRecord){const example=clone(e.exampleRecord);if(!recordOrderAssociation(example,e,now()))return;returnFromOrderExample();toast('示例关联已完成，当前工单未变更');return}
    const next=clone(records),r=next.find(r=>r.id===main.record.id),entry=recordOrderAssociation(r,e,now());
    if(!entry){toast('客户或订单信息已变更，请重新选择');return}
    if(!commitRecord(next,entry.action,JSON.stringify(entry.before)+' → '+JSON.stringify({customerId:r.customerId,member:r.member,linked:r.linked})))return;
    main.phoneVisible=false;closeLayer(true);toast(entry.action+'已保存');
  }
  function openOrderExample(){
    const previous=main.editor;if(previous?.kind!=='orders'||previous.exampleRecord)return;
    const exampleRecord={id:'未关联客户示例',name:'何女士',phone:'13800002901',customerId:'',member:'',store:'',channel:'legal',created:now(),status:'待处理',linked:[],follows:[],logs:[]},draft={linked:[]};
    main.editor={...previous,...orderPickerState(exampleRecord),draft,baseline:JSON.stringify(draft),exampleRecord,exampleReturn:previous};renderEditor(true);
  }
  function returnFromOrderExample(){const e=main.editor;if(!e?.exampleReturn)return;main.editor=e.exampleReturn;renderEditor(true)}
  function previewFile(button){const kind=button.dataset.kind,index=Number(button.dataset.index),i=Number(button.dataset.file),r=main.record;const f=kind==='approval'?r.financeApprovals?.[index]?.customerSolution?.attachments?.[i]:kind==='original'?r.files[i]:kind==='handling'?r.handlingFiles?.[i]:kind==='handling-history'?r.follows[index]?.handlingFiles?.[i]:kind==='solution'?r.customerSolution?.attachments?.[i]:kind==='solution-history'?r.follows[index]?.customerSolution?.attachments?.[i]:kind==='follow'?r.follows[index]?.files[i]:kind==='payment-proof'?r.payments?.[index]?.proof?.[i]:kind==='handling-record'?r.handlingRecords?.[index]?.files?.[i]:kind==='message'?r.messages[index]?.files[i]:null;if(!f?.data)return;if(isAudioFile(f)){openLayer('录音附件',`<div class="uc-audio-preview"><h4>${esc(f.name)}</h4>${/\.amr$/i.test(f.name)?'<p class="uc-muted">此录音格式请下载后播放</p>':`<audio controls preload="metadata" src="${esc(f.data)}" aria-label="${esc(f.name)}"></audio>`}<a class="uc-link" href="${esc(f.data)}" download="${esc(f.name)}">下载录音</a></div>`,btn('关闭','dismiss'),2);return}if(!String(f.data).startsWith('data:image/')){const a=document.createElement('a');a.href=f.data;a.download=f.name;a.click();return}openLayer('证明材料',`<img class="uc-preview-img" src="${esc(f.data)}" alt="${esc(f.name)}">`,btn('关闭','dismiss'),2)}
  async function uploadFiles(el){
    const e=main.editor;if(!e||e.uploading)return;
    const inline=el.dataset.upload==='inline-assessment',handling=inline||['assessment','compensation'].includes(e.kind),list=inline?e.assessmentDraft.handlingFiles:e.kind==='compensation'?e.draft.customerSolution.attachments:handling?e.draft.handlingFiles:e.draft.files,files=[...el.files];
    if(!files.length)return;
    if(files.length+list.length>4){toast(handling?'最多添加 4 个附件':'最多添加 4 张图片');el.value='';return}
    if(files.some(f=>f.size>5*1024*1024||(handling?!validHandlingFile(f):!['image/jpeg','image/png'].includes(f.type)))){toast(handling?'请上传不超过 5MB 的图片、PDF、Word、Excel 或 MP3、M4A、WAV、AMR 录音':'请上传不超过 5MB 的 JPG 或 PNG 图片');el.value='';return}
    e.uploading=true;el.disabled=true;e.layer.el.querySelectorAll('[data-uc=upload-handling],[data-uc=upload-solution]').forEach(button=>button.disabled=true);renderEditorFooter();
    try{
      const results=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>{const type=handling?handlingFileType(file):file.type;resolve({name:file.name,data:handling?String(reader.result).replace(/^data:[^;]*;/,'data:'+type+';'):reader.result,type,size:file.size})};reader.onerror=reject;reader.readAsDataURL(file)})));
      if(main?.editor!==e||e.layer.closing)return;
      list.push(...results);const host=e.layer.el.querySelector(inline?'#uc-assessment-upload-list':'#uc-upload-list');if(host)host.innerHTML=draftFiles(list,e.kind==='reply',inline?'assessment':'');if(e.kind==='reply')clearErrors(e.layer.el);
    }catch(err){toast(handling?'附件读取失败，请重试':'图片读取失败，请重试')}
    finally{e.uploading=false;el.disabled=false;el.value='';e.layer.el.querySelectorAll('[data-uc=upload-handling],[data-uc=upload-solution]').forEach(button=>button.disabled=false);if(main?.editor===e)renderEditorFooter()}
  }
  function complaintCSV(rows){const headers=['序号','投诉单号','客户','手机号','门店','售后来源 / 渠道','投诉时间','投诉内容','客户诉求类型','具体原因','未达成原因','客诉第一联系人','联系时间','责任归属','售后类型','客诉等级','风险类型','责任人','责任原因','关联订单','工单状态','当前办理人','当前事项 / 卡点'];const cell=value=>'"'+valueText(value).replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';return '\uFEFF'+[headers,...rows.map((r,i)=>[i+1,r.id,r.name,r.phone,r.store,CHANNELS[r.channel],r.created,r.content,r.requestType,r.requestReason,r.customerDemand,r.firstContact,fmt(r.contactTime),r.department,r.type,r.level,level4Type(r),r.responsible,r.reason,r.linked.map(l=>l.id).join(' / '),workOrderStatus(r.status),currentHandler(r),currentTask(r)])].map(row=>row.map(cell).join(',')).join('\r\n')}
  function exportRows(){const csv=complaintCSV(filtered());const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='统一客诉列表_'+now().slice(0,10)+'.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast('已导出当前筛选结果')}

  function handleClick(event){event.stopPropagation();
    const row=event.target.closest('tr[data-intake-order]'),active=layers.at(-1);
    if(row&&(active?.creation||active?.creationOrders)&&!event.target.closest('input,button,a,label,[data-pc-ready]')){const choice=row.querySelector('input[type="checkbox"]');if(choice&&!choice.disabled)choice.click();return}
    const b=event.target.closest('[data-uc]');if(!b||b.disabled)return;const action=b.dataset.uc,layer=layers.at(-1);if(layer?.closing)return;
    if(action.startsWith('options-'))optionAction(action,b,layer);
    else if(action==='detail')openComplaint(b.dataset.id);
    else if(action==='save-review')saveReview(b.dataset.id);
    else if(action==='new-ticket')openCreateTicket();
    else if(action==='save-new-ticket')saveNewTicket();
    else if(action.startsWith('create-'))createTicketAction(action,b,layer);
    else if(action==='order-detail')openOrderSnapshot(b.dataset.order);
    else if(action==='customer-detail')openCustomerSnapshot(b.dataset.customer);
    else if(action==='toggle-phone')togglePhone(b);
    else if(action==='view-finance-approval')openFinanceApproval(b.dataset.approval);
    else if(action==='begin-handling')beginHandling();
    else if(action==='reply-customer')beginReply();
    else if(action==='save-reply')saveReply();
    else if(action==='upload-follow')main.editor.layer.el.querySelector('#uc-upload').click();
    else if(action==='upload-reply')main.editor.layer.el.querySelector('#uc-reply-upload').click();
    else if(action==='dismiss'){if(b.classList.contains('uc-layer')&&event.target!==b)return;closeLayer()}
    else if(action==='tab')selectDetailTab(b.dataset.tab);
    else if(action==='save-follow')saveFollow();
    else if(action==='edit-follow-record')editFollowRecord(b.dataset.follow);
    else if(action==='detail-reference')toggleDetailReference(b);
    else if(action.startsWith('inline-assessment-'))followTools().inlineAssessmentAction(action,main.record,main.editor);
    else if(action.startsWith('solution-'))solutionAction(action,b);
    else if(action==='save-assessment')saveAssessment();
    else if(action==='save-compensation')saveCompensation();
    else if(action==='save-closure')saveClosure();
    else if(action==='accept-case')askAccept();
    else if(action==='edit-grade')editGrade();
    else if(action==='begin-assessment')beginAssessment();
    else if(action==='begin-compensation')beginCompensation();
    else if(action==='close-case')askClosure();
    else if(action==='cancel-close')main.layer.el.querySelector('.uc-drawer-foot').innerHTML=detailActions(main.record);
    else if(action==='confirm-close')confirmClosure();
    else if(action==='pick-orders')openPicker();
    else if(action==='confirm-orders')confirmOrders();
    else if(action==='customer-reset'){const e=main.editor;e.customerSearch={keywordType:'phone',keyword:''};e.customerFilters=clone(e.customerSearch);e.customerPage=1;renderEditor(true)}
    else if(action==='select-order-customer'){if(selectPickerCustomer(main.editor,b.dataset.customer))renderEditor(true)}
    else if(action==='change-order-customer'){changePickerCustomer(main.editor);renderEditor(true)}
    else if(action==='order-example')openOrderExample();
    else if(action==='return-order-example')returnFromOrderExample();
    else if(action==='file')previewFile(b);
    else if(action==='upload-handling')main.editor.layer.el.querySelector('#uc-handling-upload').click();
    else if(action==='upload-solution')main.editor.layer.el.querySelector('#uc-solution-upload').click();
    else if(action==='remove-file'){const e=main.editor;if(e.uploading)return;const inline=b.dataset.files==='assessment',files=inline?e.assessmentDraft.handlingFiles:e.kind==='compensation'?e.draft.customerSolution.attachments:e.kind==='assessment'?e.draft.handlingFiles:e.draft.files;files.splice(Number(b.dataset.file),1);e.layer.el.querySelector(inline?'#uc-assessment-upload-list':'#uc-upload-list').innerHTML=draftFiles(files,e.kind==='reply',inline?'assessment':'');if(inline)followTools().updateAssessmentState(main.record,e)}
    else if(action==='status-tab'){filterDraft={...filterDraft,...readListSearch()};filters={...filters,status:b.dataset.status};page=1;renderList();root.querySelector('.uc-list-tab[aria-selected=true]')?.focus({preventScroll:true})}
    else if(action==='reset'){filters={status:filters.status||''};filterDraft={};page=1;renderList()}
    else if(action==='more'){filterDraft={...filterDraft,...readListSearch()};more=!more;renderList()}
    else if(action==='page'){const target=Number(b.dataset.page);if(b.dataset.pagination==='orders'){const e=main.editor;e.orderPage=Math.max(1,Math.min(target,Math.ceil(orderPickerOrders(e).length/e.orderPageSize)||1));renderEditor()}else{page=Math.max(1,Math.min(target,Math.ceil(filtered().length/pageSize)||1));renderList()}}
    else if(action==='export')exportRows();
  }
  function handleChange(event){event.stopPropagation();const el=event.target;
    const layer=layers.at(-1);
    if(layer?.creationOrders&&el.dataset.createPickerChoice){setCreateOrder(layer.creationOrders.state,el.dataset.createPickerChoice,el.checked);layer.el.querySelector('#uc-create-order-count').textContent='已选 '+layer.creationOrders.state.linked.length+' 笔';return}
    if(layer?.creation&&el.dataset.createOrderChoice){setCreateOrder(layer.creation,el.dataset.createOrderChoice,el.checked);updateCreateOrderCount(layer);return}
    if(layers.at(-1)?.creation&&['requestType','requestReason'].includes(el.name)){syncCreateRequestFields(layers.at(-1).el,el.name==='requestType');return;}if(el.name==='operation'&&el.checked){const e=main.editor,kind=el.value;followTools().resetOperation(e);if(kind!==e.kind)chooseOperation(kind);return}if(el.dataset.orderChoice&&(el.checked||main?.editor?.multipleOrders)){if(selectPickerOrder(main.editor,el.dataset.orderChoice))renderEditorFooter();return}syncDraft(el);if(el.id==='uc-customerKeywordType'){const e=main.editor;e.customerSearch.keyword='';const input=e.layer.el.querySelector('#uc-customerKeyword');input.value='';input.placeholder='输入'+(CUSTOMER_KEYWORDS.find(([key])=>key===el.value)?.[1]||'客户手机');PCUI.syncControl(input);PCUI.focusControl(input)}if(el.id==='uc-filter-keywordType'){const input=root.querySelector('#uc-filter-keyword');input.value='';input.placeholder='输入'+(ORDER_KEYWORDS.find(([key])=>key===el.value)?.[1]||'客户手机');input.focus()}if(el.dataset.pageSize==='list'){pageSize=Number(el.value);page=1;renderList()}if(el.dataset.pageSize==='orders'){const e=main.editor;e.orderPageSize=Number(el.value);e.orderPage=1;renderEditor()}if(el.dataset.upload)uploadFiles(el)}
  function handleSubmit(event){event.preventDefault();event.stopPropagation();const layer=layers.at(-1);if(layer?.options){if(!layer.options.saving&&layer.options.entries[layer.options.tab])optionAction('options-apply',event.target,layer);return}if(layer?.creationOrders){
      if(event.target.id!=='uc-create-order-search')return;
      const values=Object.fromEntries(new FormData(event.target));
      if(values.start&&values.end&&values.start>values.end){layer.el.querySelector('#uc-create-orders-error').textContent='下单结束日期不能早于开始日期';return}
      layer.el.querySelector('#uc-create-orders-error').textContent='';layer.creationOrders.filters={keyword:values.keyword,store:values.createOrderStore,start:values.start,end:values.end};layer.creationOrders.page=1;createOrderPickerView(layer);return;
    }
    if(layer?.creation){if(event.target.id==='uc-create-customer-search')lookupCreateCustomer(layer);return}
    if(event.target.id==='uc-search'){const values=readListSearch(event.target);filterDraft={...filterDraft,...values};if(filterDraft.start&&filterDraft.end&&filterDraft.start>filterDraft.end){root.querySelector('#uc-query-error').textContent='投诉结束日期不能早于开始日期';return}filters={...filterDraft,status:filters.status||''};page=1;renderList()}if(event.target.id==='uc-customer-search'){const e=main.editor,q=readCustomerSearch();if(!q.keyword?.trim()){e.layer.el.querySelector('#uc-customer-search-error').textContent='请输入客户手机号、姓名或会员号';return}e.customerFilters=clone(q);e.customerPage=1;renderEditor()}}
  function keyboard(event){if(!root?.isConnected||document.querySelector('#modal .pc-company-dialog'))return;if(event.target.closest('.pc-tabs')&&['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;if(PCUI.isPopupOpen())return;if(!layers.length){if(event.target.matches('.uc-list-tab')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=[...root.querySelectorAll('.uc-list-tab')],i=tabs.indexOf(event.target);tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].click()}return;}const layer=layers.at(-1);if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closeLayer();return}if(event.target.matches('.uc-tab')&&['ArrowLeft','ArrowRight'].includes(event.key)){event.preventDefault();const tabs=[...layer.el.querySelectorAll('.uc-tab')],i=tabs.indexOf(event.target);tabs[(i+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length].click();return}if(event.key==='Tab'){const all=[...layer.el.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]')].filter(e=>e.getClientRects().length&&e.tabIndex>=0);if(!all.length){event.preventDefault();return}if(event.shiftKey&&(document.activeElement===all[0]||document.activeElement===layer.el.querySelector('.uc-drawer'))){event.preventDefault();all.at(-1).focus()}else if(!event.shiftKey&&(document.activeElement===all.at(-1)||!layer.el.contains(document.activeElement))){event.preventDefault();all[0].focus()}}}
  function openOrderSnapshot(id){const order=orders.find(item=>item.id===id);if(!order){toast('该订单暂无更多资料');return}openLayer('订单详情',section('订单 '+esc(id),orderCards([{id}])) ,btn('关闭','dismiss'),2);}
  function openCustomerSnapshot(id){const record=records.find(item=>item.customerId===id);if(!record){toast('该客户暂无更多资料');return}openLayer('客户资料',section('基本信息',`<div class="uc-details">${detail('客户姓名',record.name)}${detail('会员号',record.member)}${detail('客户手机',record.phone)}${detail('所属门店',record.store)}${detail('客户微信',record.customerWechat||orders.find(o=>o.customerId===id)?.customerWechat)}</div>`),btn('关闭','dismiss'),2);}
  function bind(el){el.addEventListener('click',handleClick);el.addEventListener('change',handleChange);el.addEventListener('input',event=>{event.stopPropagation();syncDraft(event.target)});el.addEventListener('submit',handleSubmit,true);}
  function customerPage(customerId){
    const customer=customerDirectory().find(item=>item.customerId===customerId),linked=customer?orders.filter(order=>order.customerId===customer.customerId).map(order=>({id:order.id,wechatId:order.bookingWechatId||''})):[];
    return customerPageView(customer,linked);
  }
  function mount(content,options={}){if(!content)return;root=content;root.classList.add('uc-scope');portal=document.getElementById('mergeDrawers');bind(root);clearInterval(listClock);if(options.customerId!==undefined&&options.customerId!==null){root.innerHTML=customerPage(options.customerId);return}renderList();listClock=setInterval(refreshListTimings,60000);document.addEventListener('visibilitychange',refreshListTimings);if(readFailure)toast('本地记录读取失败，已恢复初始列表');if(dictionary.error)toast('下拉配置读取失败：'+dictionary.error+'；请在配置入口重试');}
  function leave(){clearInterval(listClock);document.removeEventListener('visibilitychange',refreshListTimings);for(const layer of layers)layer.el.remove();layers=[];main=null;unlockBackground();}
  PCUI.registerPager('complaints',(value,config)=>{if(config.scope==='create-orders'){const layer=layers.at(-1);if(!layer?.creationOrders)return;layer.creationOrders.page=value.currentPage;layer.creationOrders.size=value.pageSize;createOrderPickerView(layer);return}if(config.scope==='orders'||config.scope==='order-customers'){const e=main?.editor;if(!e)return;if(config.scope==='orders'){e.orderPage=value.currentPage;e.orderPageSize=value.pageSize}else{e.customerPage=value.currentPage;e.customerPageSize=value.pageSize}renderEditor();}else{filterDraft={...filterDraft,...readListSearch()};page=value.currentPage;pageSize=value.pageSize;renderList();}});
  document.addEventListener('keydown',keyboard,true);
  window.addEventListener('beforeunload',event=>{if(layers.some(dirty)){event.preventDefault();event.returnValue=''}});
  window.PCComplaints={mount,leave};
  const initial=document.getElementById('pc-complaints');if(initial)mount(initial);
})();
