/* refunds: page code loaded by the shared PC module loader. */
(()=>{
'use strict';
const managementContext=UB.context;const {stack,e,input,actions,save,history,tableHTML,open,close,error,section,topPanel,collect,redraw,key,stamp,uid,refresh,details,today,link,views,b,sel,tabs,panelHTML,companyPager,exportCSV,shopProjectCategories}=managementContext;
const refundPaymentConfig={yinsheng:{enabled:false,days:null}};
const refundTabs=[['manage','退款管理'],['withdrawal','提现管理'],['list','退款列表'],['detail','退款明细']];
const refundStages=['主管审核','售后审核','财务审核'];
const refundPaymentMethods=[['yinsheng','银盛反扫',true],['scanner','扫码枪',false],['pos','POS机',false],['wecom','企微对外收款',false],['personal','个人收款码',false],['cash','现金',false]];
// Rules are data-driven; the legacy tiers below are read only when opening an older configuration.
function refundConfigModel(config){
    const value=x=>x==null?'':String(x),supported=refundPaymentMethods.filter(x=>x[2]);
    const payments=Object.fromEntries(supported.map(([id])=>{const saved=config[id]||{};return [id,{enabled:!!saved.enabled,days:value(saved.days)}]}));
    let rules=config.rules;
    if(rules===undefined){
      rules=[];
      for(const [id] of supported){
        const saved=config[id]||{},days=Number(saved.days);
        if(!Number.isSafeInteger(days)||days<1)continue;
        if(Object.hasOwn(saved,'day2MaxAmount')||Object.hasOwn(saved,'day3MaxAmount')){
          rules.push({paymentMethod:id,fromDay:1,toDay:1,amountMode:'unlimited'});
          if(days>=2)rules.push({paymentMethod:id,fromDay:2,toDay:2,amountMode:'limited',maxAmount:saved.day2MaxAmount});
          if(days>=3)rules.push({paymentMethod:id,fromDay:3,toDay:null,amountMode:'limited',maxAmount:saved.day3MaxAmount});
        }else rules.push({paymentMethod:id,fromDay:1,toDay:null,amountMode:'unlimited'});
      }
    }
    const normalized=refundConfigNormalizeRules(rules);if(!normalized)return null;
    return {tab:'payments',payments,blockedProjectCategories:[...(config.blockedProjectCategories||[])],rules:normalized.map(r=>({fromDay:value(r.fromDay),toDay:value(r.toDay),amountMode:r.amountMode,maxAmount:value(r.maxAmount)}))};
  }
// Keep saved amounts while converting the terminal interval to a per-payment deadline.
// Previously unconfigured gaps remain explicit, unfilled limits for the user to resolve.
function refundConfigNormalizeRules(source){
    const defaults=()=>[{fromDay:1,toDay:1,amountMode:'unlimited',maxAmount:null},{fromDay:2,toDay:null,amountMode:'limited',maxAmount:null}];
    if(!source.length)return defaults();
    const rows=source.map(r=>({...r,fromDay:Number(r.fromDay),toDay:r.toDay==null||r.toDay===''?null:Number(r.toDay)})).sort((a,b)=>a.fromDay-b.fromDay);
    if(rows.some((r,i)=>!Number.isSafeInteger(r.fromDay)||r.fromDay<1||r.toDay!==null&&(!Number.isSafeInteger(r.toDay)||r.toDay<r.fromDay)||i&&r.fromDay<=(rows[i-1].toDay??Infinity)))return null;
    const first=rows.find(r=>r.fromDay===1),result=[{fromDay:1,toDay:1,amountMode:first?.amountMode||'limited',maxAmount:first?.maxAmount??null}];
    let next=2;
    for(const row of rows){
      if(row.toDay!==null&&row.toDay<2)continue;
      const from=Math.max(2,row.fromDay);
      if(from>next)result.push({fromDay:next,toDay:from-1,amountMode:'limited',maxAmount:null});
      result.push({...row,fromDay:from});next=row.toDay===null?Infinity:row.toDay+1;
    }
    if(result.length===1)result.push(defaults()[1]);
    result.at(-1).toDay=null;
    return result;
  }
function refundConfigSyncStarts(model){
    model.rules.forEach((rule,index)=>{rule.fromDay=index===0?'1':index===1?'2':(/^\d+$/.test(model.rules[index-1].toDay)&&Number.isSafeInteger(Number(model.rules[index-1].toDay)+1)?String(Number(model.rules[index-1].toDay)+1):'')});
  }
function refundConfigPeriod(rule,index,last){
    if(index===0)return '支付当天';
    if(last)return `<span data-refund-tail title="包含起始当天，截止日期按对应支付方式的退款期限计算">${rule.fromDay?'第 '+e(rule.fromDay)+' 天以后':'后续时间'}</span>`;
    return `<div class="input-with-unit"><span>第 <span data-refund-start="${index}">${e(rule.fromDay)||'—'}</span> 天至第</span>${input(`rule-${index}-toDay`,rule.toDay,'number',`min="${e(rule.fromDay)||2}" step="1" style="width:80px;flex:0 0 80px" required oninput="UB.refundConfigDaysChange()"`).replace(`aria-label="rule-${index}-toDay"`,`aria-label="第 ${index+1} 条规则结束天数"`)}<span>天</span></div>`;
  }
function refundConfig(){
    const config=managementContext.data.refundPaymentConfig;
    if(config.rules!==undefined&&(!Array.isArray(config.rules)||config.rules.some(r=>!r||typeof r!=='object'||Array.isArray(r))))return toast('退款规则格式不兼容，原配置已保留');
    if(config.blockedProjectCategories!==undefined&&(!Array.isArray(config.blockedProjectCategories)||config.blockedProjectCategories.some(category=>typeof category!=='string')))return toast('禁用项目分类格式不兼容，原配置已保留');
    const model=refundConfigModel(config);if(!model)return toast('原退款时间段存在重叠或格式错误，原配置已保留');
    open('退款配置',item=>tabs([['payments','支付方式设置'],['rules','退款规则']],item.model.tab,id=>`UB.refundConfigTab('${id}')`)+(item.model.tab==='rules'?refundConfigRules(item.model):refundConfigPayments(item.model)),refundConfigSave,860,model);
    stack.at(-1).read=(root,r)=>{
      for(const [id,payment] of Object.entries(r.payments)){
        const enabled=root.querySelector(`[name="payment-${id}-enabled"]`),days=root.querySelector(`[name="payment-${id}-days"]`);
        if(enabled)payment.enabled=enabled.checked;if(days)payment.days=days.value;
      }
      r.rules.forEach((rule,index)=>{for(const field of ['toDay','amountMode','maxAmount']){
        const control=root.querySelector(`[name="rule-${index}-${field}"]`);if(control)rule[field]=control.value;
      }});
      refundConfigSyncStarts(r);
      const categories=root.querySelector('[name="blockedProjectCategories"]');
      if(categories)r.blockedProjectCategories=[...categories.selectedOptions].map(option=>option.value);
    };
  }
function refundConfigPayments(model){
    return section('支付方式原路退回',tableHTML(['支付方式','原路退回','最长可退天数'],refundPaymentMethods.map(([id,name,supported])=>{
      const payment=model.payments[id]||{};
      const control=switcher(supported&&payment.enabled,"this.closest('td').querySelector('[data-refund-payment-state]').textContent=this.checked?'已开启':'已关闭'",name+'原路退回').replace('<input ',supported?`<input name="payment-${id}-enabled" `:'<input disabled ');
      const days=supported?`<div class="input-with-unit">${input(`payment-${id}-days`,payment.days,'number','min="1" step="1" placeholder="请输入天数"').replace(`aria-label="payment-${id}-days"`,`aria-label="${name}最长可退天数" aria-describedby="refund-config-help"`)}<span class="ub-unit">天</span></div>`:'<span class="muted">—</span>';
      return [e(name),actions(control,supported?`<span data-refund-payment-state>${payment.enabled?'已开启':'已关闭'}</span>`:'<span class="muted">不支持</span>'),days];
    })))+'<p class="ub-note" id="refund-config-help">按自然日计算，支付当天为第 1 天，最长可退天数包含支付当天及截止当天。金额与时间段条件在“退款规则”中配置，保存并开启对应支付方式后生效。</p>';
  }
function refundConfigRules(model){
    const hasSplits=model.rules.length>2;
    const rows=model.rules.map((rule,index)=>{
      const name=field=>`rule-${index}-${field}`,label=field=>`第 ${index+1} 条规则${field}`;
      const mode=sel(name('amountMode'),[['limited','限额'],['unlimited','不限金额']],rule.amountMode).replace('<select ',`<select onchange="UB.refundConfigRuleMode(${index})" `).replace(`aria-label="${name('amountMode')}"`,`aria-label="${label('金额条件')}"`);
      return [`<div class="input-with-unit">${refundConfigPeriod(rule,index,index===model.rules.length-1)}</div>`,mode,`<div data-refund-amount="${index}">${refundConfigAmount(rule,index)}</div>`,...(hasSplits?[index>0&&index<model.rules.length-1?b('删除',`UB.refundConfigRemoveRule(${index})`,'text').replace('<button ',`<button aria-label="删除第 ${index+1} 条时间段" `):'—']:[])];
    });
    let rules=tableHTML(['适用时间','金额条件','订单实付金额上限',...(hasSplits?['操作']:[])],rows);
    rules=rules.replace('<table','<table data-pc-scroll="parent" data-pc-min-height="0"').replace('<thead>','<colgroup>'+[250,150,hasSplits?310:388,...(hasSplits?[78]:[])].map(width=>`<col style="width:${width}px">`).join('')+'</colgroup><thead>');
    const categories=[...new Set([...shopProjectCategories,...model.blockedProjectCategories])];
    const categorySelect=`<select name="blockedProjectCategories" aria-label="禁用项目分类" multiple data-filterable placeholder="请选择禁用项目分类">${categories.map(category=>`<option value="${e(category)}" ${model.blockedProjectCategories.includes(category)?'selected':''}>${e(category)}</option>`).join('')}</select>`;
    return section('退款规则',rules,b('添加时间段','UB.refundConfigAddRule()','primary'))+section('禁用项目分类',`<div class="pc-form"><div class="pc-field-content" style="width:280px;max-width:100%">${categorySelect}</div></div>`);
  }
function refundConfigTab(tab){
    if(!['payments','rules'].includes(tab))return;collect();stack.at(-1).model.tab=tab;redraw();
    topPanel()?.querySelector('[role="tab"][aria-selected="true"]')?.focus({preventScroll:true});
  }
function refundConfigAddRule(){
    collect();const model=stack.at(-1).model;
    const issue=refundConfigRangeError(model);if(issue)return refundConfigIssue('rules',issue.message,issue.name);
    const last=model.rules.at(-1),start=Number(last.fromDay);
    if(!Number.isSafeInteger(start+1))return error('分界天数过大，请调整已有时间段');
    last.toDay=String(start);
    model.rules.push({...last,fromDay:String(start+1),toDay:''});
    redraw();topPanel()?.querySelector(`[name="rule-${model.rules.length-2}-toDay"]`)?.focus();
  }
function refundConfigRemoveRule(index){
    collect();const model=stack.at(-1).model,rules=model.rules;
    if(index<=0||index>=rules.length-1)return;
    rules.splice(index,1);refundConfigSyncStarts(model);redraw();
    topPanel()?.querySelector('button[onclick="UB.refundConfigAddRule()"]')?.focus({preventScroll:true});
  }
function refundConfigRuleMode(index){
    collect();const rule=stack.at(-1).model.rules[index],container=topPanel()?.querySelector(`[data-refund-amount="${index}"]`);if(rule&&container)container.innerHTML=refundConfigAmount(rule,index);
  }
function refundConfigAmount(rule,index){
    if(rule.amountMode==='unlimited')return '<span class="muted">—</span>';
    return `<div class="input-with-unit"><span>≤</span>${input(`rule-${index}-maxAmount`,rule.maxAmount,'number','min="0.01" step="0.01" placeholder="请输入金额上限" required').replace(`aria-label="rule-${index}-maxAmount"`,`aria-label="第 ${index+1} 条规则金额上限"`)}<span class="ub-unit">元</span></div>`;
  }
function refundConfigRangeError(model){
    const integer=value=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0;
    for(const [index,rule] of model.rules.entries()){
      const issue=message=>({message:`第 ${index+1} 条规则：${message}`,name:`rule-${index}-toDay`});
      if(!integer(rule.fromDay))return issue('请先填写上一时间段的有效结束天数');
      if(index===model.rules.length-1){if(rule.toDay!=='')return issue('最后一段应跟随各支付方式退款期限');continue}
      if(!integer(rule.toDay)||!Number.isSafeInteger(Number(rule.toDay)+1))return issue('结束天数须为有效的正整数');
      if(Number(rule.toDay)<Number(rule.fromDay))return issue('时间段重复或重叠，结束天数不能小于开始天数');
    }
    return null;
  }
function refundConfigDaysChange(){
    collect();const root=topPanel(),model=stack.at(-1).model,issue=refundConfigRangeError(model);
    root.querySelectorAll('input[name^="rule-"]').forEach(control=>{control.setCustomValidity('');control.removeAttribute('aria-invalid')});
    model.rules.forEach((rule,index)=>{
      const start=root.querySelector(`[data-refund-start="${index}"]`),end=root.querySelector(`[name="rule-${index}-toDay"]`);
      if(start)start.textContent=rule.fromDay||'—';if(end)end.min=rule.fromDay||'2';
    });
    const tail=root.querySelector('[data-refund-tail]');if(tail)tail.outerHTML=refundConfigPeriod(model.rules.at(-1),model.rules.length-1,true);
    if(issue){const control=root.querySelector(`[name="${issue.name}"]`);control?.setCustomValidity(issue.message);control?.setAttribute('aria-invalid','true')}
    error(issue?.message||'');
  }
function refundConfigIssue(tab,message,name){
    const model=stack.at(-1).model;if(model.tab!==tab){model.tab=tab;redraw()}
    error(message);if(name)PCUI.whenReady().then(()=>{const control=topPanel()?.querySelector(`[name="${name}"]`);if(control)PCUI.focusControl(control)});return false;
  }
function refundConfigSave(model){
    const integer=value=>/^\d+$/.test(value)&&Number.isSafeInteger(Number(value))&&Number(value)>0;
    const payments={},rules=[];
    for(const [id,payment] of Object.entries(model.payments)){
      const name=refundPaymentMethods.find(x=>x[0]===id)[1];
      if((payment.enabled||payment.days!=='')&&!integer(payment.days))return refundConfigIssue('payments',`请输入${name}大于 0 的整数天数`,`payment-${id}-days`);
      payments[id]={enabled:payment.enabled,days:payment.days===''?null:Number(payment.days)};
    }
    const rangeIssue=refundConfigRangeError(model);if(rangeIssue)return refundConfigIssue('rules',rangeIssue.message,rangeIssue.name);
    for(const [index,rule] of model.rules.entries()){
      const issue=(message,field)=>refundConfigIssue('rules',`第 ${index+1} 条规则：${message}`,`rule-${index}-${field}`);
      if(!['limited','unlimited'].includes(rule.amountMode))return issue('请选择金额条件','amountMode');
      const amount=Number(rule.maxAmount),validAmount=/^\d+(\.\d{1,2})?$/.test(rule.maxAmount)&&amount>0&&Number.isSafeInteger(Math.round(amount*100));
      if(rule.amountMode==='limited'&&!validAmount)return issue('金额上限须大于 0 且最多两位小数','maxAmount');
      rules.push({fromDay:Number(rule.fromDay),toDay:rule.toDay===''?null:Number(rule.toDay),amountMode:rule.amountMode,maxAmount:validAmount?amount:null});
    }
    const before=clone(managementContext.data.refundPaymentConfig),next={...before,rules,blockedProjectCategories:[...new Set(model.blockedProjectCategories)],deadlineBasis:'payment-method',dayBasis:'natural-day',amountBasis:'order-paid'};
    for(const [id,payment] of Object.entries(payments)){
      const {day2MaxAmount,day3MaxAmount,dayBasis,amountBasis,...retained}=before[id]||{};
      next[id]={...retained,...payment};
    }
    managementContext.data.refundPaymentConfig=next;
    history('refund-config','payment-methods','更新支付方式与退款规则',before,next);
    managementContext.persist();toast('退款配置已保存');close(true);
  }
const refundSeedRows=[
    ['2509301732009322','4633199','rock࿐ོ₂₀₂3','130****2379',170,'454','2509301618298501','456'],
    ['2509301609491303','9631270','肖小洁','',1000,'1111','2509301520240649','1111'],
    ['2509301601596770','9631270','肖小洁','',100,'1111','2509301518180221','111'],
    ['2509301427445950','9631265','墨墨','156****9447',70,'45654','2509301014197151','46'],
    ['2509301406022574','9631265','墨墨','156****9447',100,'5646','2509301014197151','4654'],
    ['2509301401573838','9631265','墨墨','156****9447',10,'5646','2509301014197151','4654'],
    ['2509291915136785','9631265','墨墨','156****9447',20,'45647','2509291850573690','65464'],
    ['2509291911269321','9631265','墨墨','156****9447',4000,'4564','2509291850573690','4646'],
    ['2509291910315194','9631265','墨墨','156****9447',100,'5646','2509291849296351','4564'],
    ['2509291909262321','9631265','墨墨','156****9447',100,'41564','2509291849296351','5464'],
    ['2509291854176604','9631265','墨墨','156****9447',1000,'4564','2509291849296351',''],
    ['2509291806298294','9631280','内推测试','',50,'4564','2509291747300282',''],
    ['2509291804558242','9631280','内推测试','',1100,'5464','2509291747300282',''],
    ['2509291749517161','9631280','内推测试','',100,'254654','2509291745480221',''],
    ['2509291627390623','9631280','内推测试','',1100,'124','2509291048525224',''],
    ['2509291055502694','9631280','内推测试','',100,'46456','2509291030163871',''],
    ['2509261718545850','7376659','李四','130****4123',10,'2121','2509261605284231',''],
    ['2509261654357350','7376659','李四','130****4123',10,'4546564','2509261605284231',''],
    ['2509221117477499','9631270','肖小洁','',100,'757','2509221102087151',''],
    ['2509191037316827','9631265','墨墨','156****9447',20,'212','2509191015314971',''],
    ['2509191034266838','9631265','墨墨','156****9447',30,'dasada','2509191015314971',''],
    ['2509191003301311','43293','王晓丽','180****7770',29,'21323113','2509181618314179','']
  ];
function refundInit(){if(!Array.isArray(managementContext.data.refunds)){managementContext.data.refunds=refundSeedRows.map((v,i)=>{let [number,member,name,phone,amount,account,order,reason]=v,day='20'+number.slice(0,2)+'-'+number.slice(2,4)+'-'+number.slice(4,6);return {id:String(19564-i),number,member,name,phone,amount,account,order,reason,type:'订单项目退款',typeFilter:'项目退款',pay:i===10?'银行卡':'支付宝',applicant:[1,2,18].includes(i)?'黄玲':'张煜桐',submittedAt:i===0?'2025-09-30 17:31':day,approvedAt:day,withdrawnAt:'',processedAt:'',operation:'',status:'处理中',merchant:'',merchantNo:'',note:'',channelSerial:'',acceptSerial:i===0?'5612051':'',audit:refundStages.map((stage,n)=>({stage,status:'已审核',by:i===0?'张煜桐':'',at:i===0?'2025-09-30 '+(n===2?'17:32':'17:31'):''})),projects:i===0?[{name:'内推体验卡(399体验卡)',qty:1,price:170,received:170,teacher:'周美玲'}]:[],orderItems:i===0?['丝雾眉(商品) × 1','内推体验卡(399体验卡) × 1']:[],arrivedAt:i===0?'2025-09-30 16:18':'',orderReceived:i===0?220:null,voucher:i===0}});managementContext.data.refunds.push({id:'19542',number:'',member:'9631266',name:'7657678',phone:'138****3534',amount:29,account:'',order:'2505130927144371',reason:'',type:'预约流退退款',typeFilter:'预约流退',pay:'',applicant:'黄玲',submittedAt:'2025-08-15',approvedAt:'',withdrawnAt:'',processedAt:'',operation:'',status:'审核中',merchant:'',merchantNo:'',note:'',audit:refundStages.map((stage,i)=>({stage,status:i?'无需审批':'待审核',by:'',at:''})),projects:[],orderItems:[]})}}
function refundExecution(r){if(r?.status==='已拒绝')return '已拒绝';return r?.recoveryStatus||r?.status||''}
function refundSyncStatus(r){const state=refundExecution(r);r.status=state==='已退款'?'已退款':state==='已取消'?'已取消':state==='原路退款失败'?'退款异常':r.sourceV3Refund&&r.audit?.some(a=>a.status==='待审核')?'审核中':'处理中';r.withdrawalStatus=state==='已退款'?'已提现':state==='已取消'?'已取消':['待财务确认','待门店补充银行卡'].includes(state)?'待确认':'待提现'}
function refundMethod(r){return r.refundMethod||({系统打款:'original',人工转账:'transfer',线下处理:'transfer'})[r.operation]||''}
function refundMethodText(r){return ({original:'原路退款',transfer:'人工转账'})[refundMethod(r)]||'未确认'}
function refundPayoutComplete(v){const method=v?.method||'bank';return !!(v?.name?.trim()&&String(v?.account||'').trim()&&(method==='bank'?v?.bank?.trim()&&/^\d{12,30}$/.test(String(v.account).replace(/\s/g,'')):['alipay','wechat'].includes(method)))}
function refundPayoutLabel(v){return ({bank:'银行卡',alipay:'支付宝',wechat:'微信'})[v?.method||'bank']||'收款账户'}
function refundPayoutRows(v){const bank=(v?.method||'bank')==='bank';return [['收款方式',refundPayoutLabel(v)],[bank?'开户姓名':'收款人姓名',v?.name||'待门店填写'],[bank?'银行卡号':v?.method==='alipay'?'支付宝账号':'微信账号',v?.account||'待门店填写'],...(bank?[['开户银行',v?.bank||'待门店填写']]:[])].map(([k,value])=>[k,e(value)])}
function refundNextStep(r){return refundExecution(r)==='待财务确认'?(r.audit?.some(a=>a.status==='待审核')?'等待财务审核':'审核已通过，请财务确认提现'):refundExecution(r)==='待原路退款'?'已确认提现，可发起原路退款打款':refundExecution(r)==='已取消'?'退款申请已撤销':refundExecution(r)==='原路退款失败'?'等待门店处理退款异常':refundExecution(r)==='原路退款中'?'等待原支付渠道返回结果，请勿重复退款':refundExecution(r)==='待门店补充银行卡'?'门店待补充开户姓名、银行卡号及开户银行':refundExecution(r)==='待人工转账'?'收款信息已提交，请财务转账后确认':refundExecution(r)==='已退款'?'退款已完成':''}
function refundRecoveryInit(){
    if(managementContext.data.refundRecoveryVersion===2)return;
    const day='2026-10-22',rows=[
      ['retry-success','示例·余额不足',398,'上海徐汇店','商户账户余额不足，充值后可重试','original','原路退款失败'],
      ['retry-failed','示例·账户受限',680,'上海徐汇店','原支付账户受限，无法完成扣款','original','原路退款失败'],
      ['await-bank','示例·待门店补卡',260,'上海徐汇店','原支付账户已停用，财务要求改用转账','transfer','待门店补充银行卡'],
      ['bank-ready','示例·待人工转账',520,'上海徐汇店','原路退款失败，门店已提交银行卡','transfer','待人工转账'],
      ['await-confirm','示例·待确认提现',199,'上海徐汇店','','original','待财务确认'],
      ['ready-original','示例·待原路打款',299,'上海徐汇店','','original','待原路退款']
    ].map(([scenario,name,amount,store,failureReason,refundMethod,status],i)=>{
      const id='RF-RECOVERY-'+scenario,at=day+' 10:'+String(10+i).padStart(2,'0'),bank={method:'bank',name:'演示客户',account:'0000000000000000',bank:'示例银行演示支行'};
      return {id,number:'RF20261022'+String(i+1).padStart(4,'0'),member:'DEMO-RF-'+(i+1),name,phone:'',amount,store,account:'',order:'DEMO-ORDER-RF-'+(i+1),reason:'未消费项目退款',type:'订单项目退款',typeFilter:'项目退款',pay:'银盛反扫',applicant:'门店员工',submittedAt:at,approvedAt:at,withdrawnAt:'',processedAt:'',operation:refundMethod==='original'?'系统打款':'人工转账',refundMethod,status,recoveryStatus:status,confirmedAt:status==='待财务确认'?'':at,merchant:store,merchantNo:'',note:'',failureReason,failedAt:at,channelSerial:'',acceptSerial:'DEMO-'+(i+1),audit:refundStages.map(stage=>({stage,status:'已审核',by:'演示审核人',at})),projects:[{name:'护理项目',qty:1,price:amount,received:amount,teacher:'—'}],orderItems:['护理项目 × 1'],orderReceived:amount,refundDemoScenario:scenario,retryCount:0,refundAttempts:[],refundEvents:[{time:at,by:failureReason?'支付渠道':'门店',action:failureReason?'原路退款失败':'申请提现',detail:failureReason||'审核已通过，待财务处理'}],...(refundMethod==='transfer'?{bankRequest:{id:'BANK-'+id,status:status==='待人工转账'?'submitted':'pending',reason:failureReason,requestedAt:at,requestedBy:'财务 · 张三',...(status==='待人工转账'?{submittedAt:at,submittedBy:store}:{} )},transferBank:status==='待人工转账'?bank:null}:{} )};
    });
    const ids=new Set(managementContext.data.refunds.map(r=>r.id));managementContext.data.refunds.unshift(...rows.filter(r=>!ids.has(r.id)));for(const r of managementContext.data.refunds.filter(r=>r.refundDemoScenario)){r.recoveryStatus||=r.status;refundSyncStatus(r)}managementContext.data.refundRecoveryVersion=2;
    
  }
function refundLatest(){managementContext.assertCurrent();return managementContext.data}
function refundRecoveryChange(ids,guard,action,mutate){
    ids=Array.isArray(ids)?ids:[ids];const next=clone(refundLatest()),rows=ids.map(id=>next.refunds.find(r=>r.id===id));
    if(!ids.length||new Set(ids).size!==ids.length||rows.some(r=>!r)||!rows.every(guard)){toast('退款状态已变化，请刷新后重新核对');return false}
    const at=stamp();for(const r of rows){const before=clone(r);mutate(r,at);refundSyncStatus(r);(r.refundEvents??=[]).push({time:at,by:action.includes('回执')?'支付渠道（示例）':'财务 · 张三',action,detail:refundExecution(r)==='原路退款失败'?r.failureReason:refundNextStep(r)});next.history.unshift({id:uid('h'),module:'refunds',target:r.id,time:at,summary:action,before,after:clone(r)})}
    managementContext.persist(next);
    managementContext.data=next;refundPicked.clear();refresh();if(stack.length)redraw();return true;
  }
function refundFinishRetry(id,requestId){const r=refundLatest().refunds.find(r=>r.id===id);if(refundExecution(r)!=='原路退款中'||r.originalRequest?.id!==requestId||!r.refundDemoScenario)return false;
    const success=['retry-success','ready-original','await-confirm'].includes(r.refundDemoScenario);return refundRecoveryChange(id,r=>refundExecution(r)==='原路退款中'&&r.originalRequest?.id===requestId,success?'原路退款成功（示例回执）':'原路退款再次失败（示例回执）',(r,at)=>{r.recoveryStatus=success?'已退款':'原路退款失败';if(success)r.withdrawnAt=at;r.processedAt=success?at:'';if(!success){r.failureReason='原支付账户受限，扣款失败';r.failedAt=at}r.originalRequest={...r.originalRequest,status:success?'success':'failed',completedAt:at,message:success?'渠道确认扣款及原路退款成功':r.failureReason};const attempt=r.refundAttempts.find(a=>a.id===requestId);Object.assign(attempt||{},r.originalRequest);if(success)r.channelSerial='DEMO-'+requestId});
  }
function refundStoreEntry(id){const r=refundLatest().refunds.find(r=>r.id===id);if(refundExecution(r)!=='待门店补充银行卡')return toast('当前无需门店补充银行卡');open('门店补充银行卡',details([['门店',e(r.store||'所属门店')],['客户',e(r.name)],['退款金额',money(r.amount)],['转账原因',e(r.bankRequest?.reason||'—')],['当前状态','等待门店填写并提交银行卡信息']])+`<p class="ub-note">门店在工作台的“退款补卡”待办中填写。提交后，提现管理显示银行卡已补充，等待人工转账。</p><a class="btn primary" href="../v3/v3.html#refund-bank?id=${encodeURIComponent(id)}" target="_blank" rel="noopener">打开门店填写页</a>`,null,560)}
function refundImportMobile(){let mobile;try{mobile=JSON.parse(localStorage.getItem('weidong-v3-standalone-release-1'))}catch{return false}if(!Array.isArray(mobile?.refundTasks))return false;
    const next=clone(managementContext.data),seen=new Set(next.refunds.map(r=>r.id)),rows=mobile.refundTasks.filter(r=>r.sourceV3Refund===true&&typeof r.id==='string'&&r.id&&!seen.has(r.id)&&Number.isFinite(r.amount)&&r.amount>0&&Array.isArray(r.audit)&&['original','transfer'].includes(r.refundMethod));
    if(!rows.length)return false;for(const row of rows){if(seen.has(row.id))continue;const r=clone(row);refundSyncStatus(r);next.refunds.unshift(r);seen.add(r.id)}
    managementContext.persist(next);managementContext.data=next;return true;
  }
async function refundRecoveryReload(){const turn=refundLifecycle;if(!refundListening)return;try{managementContext.reload();await managementContext.run(()=>{if(refundListening&&turn===refundLifecycle)refundImportMobile()});if(!refundListening||turn!==refundLifecycle||route!=='refunds')return;refresh();if(stack.length)redraw();refundResumeRetries()}catch(error){managementContext.report(error)}}
const refundTimers=new Map();let refundListening=false,refundLifecycle=0;
function refundSchedule(id,requestId){const token=id+':'+requestId;if(refundTimers.has(token)||!refundListening)return;refundTimers.set(token,setTimeout(()=>{refundTimers.delete(token);if(refundListening)managementContext.background(()=>refundFinishRetry(id,requestId))},1600))}
function refundResumeRetries(){for(const r of managementContext.data.refunds)if(r.refundDemoScenario&&refundExecution(r)==='原路退款中'&&r.originalRequest?.id)refundSchedule(r.id,r.originalRequest.id)}
function refundStorageEvent(event){if([key,'weidong-v3-standalone-release-1'].includes(event.key))refundRecoveryReload()}
function refundEnter(){if(!refundListening){refundListening=true;refundLifecycle++;window.addEventListener('storage',refundStorageEvent);window.addEventListener('focus',refundRecoveryReload);refundRecoveryReload()}refundResumeRetries()}
function refundLeave(){refundListening=false;refundLifecycle++;window.removeEventListener('storage',refundStorageEvent);window.removeEventListener('focus',refundRecoveryReload);for(const timer of refundTimers.values())clearTimeout(timer);refundTimers.clear()}
const withdrawalStates=['待确认','待提现','已提现','已取消'];
function withdrawalDefaults(){const day=today(),date=new Date(day+'T12:00:00'),end=new Date(date.getFullYear(),date.getMonth()+1,0,12);return {dateKind:'submittedAt',from:day.slice(0,7)+'-01',to:day.slice(0,7)+'-'+end.getDate(),withdrawalStatus:'',status:'',refundMethod:'',type:'',keywordKind:'customer',keyword:''}}
function withdrawalRows(){const f=refundFilter();return managementContext.data.refunds.filter(r=>{if(!r.withdrawalStatus)return false;const day=String(r[f.dateKind]||'').slice(0,10);if((f.from||f.to)&&(!day||f.from&&day<f.from||f.to&&day>f.to))return false;if(f.withdrawalStatus&&r.withdrawalStatus!==f.withdrawalStatus||f.status&&r.status!==f.status||f.refundMethod&&refundMethod(r)!==f.refundMethod||f.type&&r.typeFilter!==f.type)return false;const value=({customer:r.name+' '+r.phone,applicant:r.applicant,order:r.order,member:r.member,number:r.number})[f.keywordKind]||'';return !f.keyword||value.toLowerCase().includes(f.keyword.trim().toLowerCase())})}
function withdrawalCanConfirm(r){return !!r&&r.withdrawalStatus==='待确认'&&refundExecution(r)==='待财务确认'&&r.audit.every(a=>['已审核','无需审批'].includes(a.status))}
function withdrawalCanPay(r){return !!r&&refundMethod(r)==='original'&&r.withdrawalStatus==='待提现'&&refundExecution(r)==='待原路退款'}
function withdrawalCanTransfer(r){return !!r&&refundMethod(r)==='transfer'&&refundExecution(r)==='待人工转账'&&r.bankRequest?.status==='submitted'&&refundPayoutComplete(r.transferBank)}
function withdrawalCanCancel(r){return !!r&&['待财务确认','待原路退款','待门店补充银行卡','待人工转账'].includes(refundExecution(r))&&!r.originalRequest?.id}
function withdrawalColumns(){return [['customer','客户',138],['amount','退款金额',100],['refundMethod','退款方式',104],['withdrawalStatus','提现状态',104],['status','退款状态',104],['recovery','失败原因 / 处理提示',236],['member','会员号',100],['type','退款类型',130],['pay','原始支付方式',112],['confirmedAt','确认时间',126],['withdrawnAt','提现时间',126],['applicant','申请人',96],['approvedAt','审核时间',126],['order','关联单号',176],['reason','退款说明',144],['number','退款订单号',176],['store','门店',130]]}
function withdrawalValue(r,key,html=true){if(key==='refundMethod')return refundMethodText(r);if(key==='withdrawalStatus')return html?refundBadge(r.withdrawalStatus):r.withdrawalStatus;if(key==='recovery'){const reason=['原路退款失败','退款异常'].includes(refundExecution(r))?r.failureReason:'',hint=refundNextStep(r);return html?(reason?e(reason)+'<div class="muted">'+e(hint)+'</div>':e(hint||'—')):[reason,hint].filter(Boolean).join('；')||'—'}return refundValue(r,key,html)}
function withdrawalActions(r,includeView=true){const items=[...(includeView?[link('查看',`UB.refundDetail('${r.id}')`)]:[]),...(refundExecution(r)==='待门店补充银行卡'?[link('门店补卡',`UB.refundStoreEntry('${r.id}')`)]:[]),...(withdrawalCanConfirm(r)?[link('确认提现',`UB.withdrawalConfirm('${r.id}')`)]:[]),...(withdrawalCanPay(r)?[link('打款',`UB.withdrawalPay('${r.id}')`)]:[]),...(withdrawalCanTransfer(r)?[link('确认已转账',`UB.withdrawalTransfer('${r.id}')`)]:[])];return items.length?actions(...items):''}
function withdrawalSelected(id){return (id?[id]:[...refundPicked]).map(id=>refundLatest().refunds.find(r=>r.id===id)).filter(Boolean)}
function withdrawalConfirm(id){const r=refundLatest().refunds.find(r=>r.id===id);if(!withdrawalCanConfirm(r))return toast('该记录当前不能确认提现');managementContext.dialog({title:'确认提现',content:details([['客户',e(r.name)],['退款金额',money(r.amount)],['退款方式',refundMethodText(r)]])+'<p class="ub-note">确认后进入待提现，由财务执行打款。本操作不会立即扣款。</p>',buttons:[{text:'取消',action:closeModal},{text:'确认提现',primary:true,action:()=>{if(refundRecoveryChange(id,withdrawalCanConfirm,'财务确认提现',(r,at)=>{r.confirmedAt=at;r.recoveryStatus=refundMethod(r)==='original'?'待原路退款':refundPayoutComplete(r.transferBank)?'待人工转账':'待门店补充银行卡'}))closeModal()}}]})}
function withdrawalPay(id){const rows=withdrawalSelected(id);if(!rows.length||!rows.every(withdrawalCanPay))return toast('请选择待原路退款的待提现记录');managementContext.dialog({title:id?'原路退款打款':'批量打款',content:tableHTML(['客户','退款金额','退款方式'],rows.map(r=>[e(r.name),money(r.amount),'原路退款']))+'<p class="ub-note">确认后向原支付渠道申请退款，到账结果以渠道回执为准。</p>',buttons:[{text:'取消',action:closeModal},{text:'确认打款',primary:true,action:()=>{const requests=[];if(!refundRecoveryChange(rows.map(r=>r.id),r=>withdrawalCanPay(r)&&!!r.refundDemoScenario,'发起原路退款打款',(r,at)=>{const requestId=uid('RF-REQUEST');r.recoveryStatus='原路退款中';r.originalRequest={id:requestId,status:'processing',requestedAt:at};(r.refundAttempts??=[]).push(clone(r.originalRequest));requests.push([r.id,requestId])}))return;closeModal();for(const [id,requestId] of requests)refundSchedule(id,requestId)}}]})}
function withdrawalTransfer(id){const rows=withdrawalSelected(id);if(!rows.length||!rows.every(withdrawalCanTransfer))return toast('请选择门店已提交收款信息、等待人工转账的记录');managementContext.dialog({title:id?'确认人工转账完成':'批量人工转账',wide:true,content:tableHTML(['客户','退款金额','收款方式','收款人','收款账号','开户银行'],rows.map(r=>[e(r.name),money(r.amount),e(refundPayoutLabel(r.transferBank)),e(r.transferBank.name),e(r.transferBank.account),e((r.transferBank.method||'bank')==='bank'?r.transferBank.bank:'—')]))+'<p class="ub-note">请在实际转账并核对到账后确认。此操作仅登记退款完成，不发起转账。</p>',buttons:[{text:'取消',action:closeModal},{text:'确认已转账',primary:true,action:()=>{if(refundRecoveryChange(rows.map(r=>r.id),withdrawalCanTransfer,'财务确认人工转账完成',(r,at)=>{r.recoveryStatus='已退款';r.processedAt=at;r.withdrawnAt=at;r.transferConfirmedBy='财务 · 张三'})){closeModal();toast('已记录转账完成')}}}]})}
function withdrawalCancel(){const rows=withdrawalSelected();if(!rows.length||!rows.every(withdrawalCanCancel))return toast('仅可撤销尚未发起打款的流退申请');managementContext.dialog({title:'撤销流退',content:tableHTML(['客户','退款金额'],rows.map(r=>[e(r.name),money(r.amount)]))+'<p class="ub-note">确认撤销所选退款申请及未完成的银行卡待办。此操作不恢复订单消费记录，已打款或正在退款的申请不能撤销。</p>',buttons:[{text:'取消',action:closeModal},{text:'确认撤销',primary:true,action:()=>{if(refundRecoveryChange(rows.map(r=>r.id),withdrawalCanCancel,'财务撤销流退申请',(r,at)=>{r.recoveryStatus='已取消';r.cancelledAt=at;if(r.bankRequest)r.bankRequest.status='cancelled'}))closeModal()}}]})}
function withdrawalsPage(){
    const f=refundDraft(),{rows,visible,page,size}=refundSlice(),picked=rows.filter(r=>refundPicked.has(r.id)),select=(name,values,label)=>sel(name,values,f[name],label).replace(`aria-label="${name}"`,`aria-label="${label||({dateKind:'日期类型',keywordKind:'关键词类型'})[name]||name}"`);
    const controls=select('dateKind',[['submittedAt','申请日期'],['confirmedAt','确认日期'],['withdrawnAt','提现日期']])+`<div class="mr-date">${input('from',f.from,'date').replace('aria-label="from"','aria-label="开始日期"')}<span>至</span>${input('to',f.to,'date').replace('aria-label="to"','aria-label="结束日期"')}</div><div class="refund-quick">${['上月','昨天','今天','本周','本月'].map(x=>link(x,`UB.refundQuick('${x}')`)).join('')}</div>`+select('withdrawalStatus',withdrawalStates,'全部提现状态')+select('type',['余额退款','预约流退','到店流退','项目退款'],'全部退款类型')+select('status',['审核中','处理中','已退款','退款异常','已取消'],'全部退款状态')+select('refundMethod',[['original','原路退款'],['transfer','人工转账']],'全部退款方式')+`<div class="refund-keyword">${select('keywordKind',[['customer','客户'],['applicant','申请人'],['order','关联单号'],['member','会员号'],['number','退款单号']])}${input('keyword',f.keyword,'search','placeholder="请输入关键词"').replace('aria-label="keyword"','aria-label="提现关键词"')}</div>`;
    const filter=tabs(refundTabs,views.refunds,v=>`UB.refundTab('${v}')`)+queryModule(controls,'UB.refundSearch()','UB.refundSearch(true)').replace('class="panel query-module"','class="panel query-module ub-query"').replace('<div class="filterbar">','<form class="filterbar" oninput="UB.refundDraftChange(this)" onchange="UB.refundDraftChange(this)" onsubmit="event.preventDefault();UB.refundSearch()">').replace('</div></div></section>','</div></form></section>').replaceAll('<button ','<button type="button" ');
    const columns=withdrawalColumns(),widths=[40,52,...columns.map(c=>c[2]),230],heads=[`<input type="checkbox" aria-label="选择本页提现记录" ${visible.length&&visible.every(r=>refundPicked.has(r.id))?'checked':''} onchange="UB.refundPick(this.checked)">`,'序号',...columns.map(c=>c[1]),'操作'];
    const values=visible.map((r,i)=>[`<input type="checkbox" aria-label="选择提现 ${r.id}" ${refundPicked.has(r.id)?'checked':''} onchange="UB.refundPick(this.checked,'${r.id}')">`,(page-1)*size+i+1,...columns.map(c=>withdrawalValue(r,c[0])),withdrawalActions(r)]);
    const grid=tableHTML(heads,values).replace('class="table-wrap ub-table"','class="table-wrap ub-table refund-table" tabindex="0" aria-label="提现记录，可横向滚动查看全部字段"').replace('<table>',`<table style="table-layout:fixed;width:${widths.reduce((a,b)=>a+b,0)}px"><colgroup>${widths.map(w=>`<col style="width:${w}px">`).join('')}</colgroup>`);
    const sum=done=>rows.filter(r=>done?r.status==='已退款':!['已退款','已取消','已拒绝'].includes(r.status)).reduce((n,r)=>n+Math.round(r.amount*100),0)/100;
    const summary=`<div class="refund-summary"><span>已退款 <strong>${sum(true).toFixed(2)}</strong></span><span>待退款 <strong>${sum(false).toFixed(2)}</strong></span>${picked.length?`<span>已选 ${picked.length} 条</span>`:''}</div>`;
    const buttons=refundButton('批量人工转账','UB.withdrawalTransfer()',!picked.length||!picked.every(withdrawalCanTransfer),'primary')+refundButton('批量打款','UB.withdrawalPay()',!picked.length||!picked.every(withdrawalCanPay),'primary')+refundButton('撤销流退','UB.withdrawalCancel()',!picked.length||!picked.every(withdrawalCanCancel))+b('导出','UB.withdrawalExport()');
    return filter+panelHTML('提现管理',summary+grid+companyPager(rows.length,page,size,'refundPaging',[5,10,20,30,50]),buttons);
  }
function withdrawalExport(){const cols=withdrawalColumns();exportCSV('提现管理',['序号',...cols.map(c=>c[1])],withdrawalRows().map((r,i)=>[i+1,...cols.map(c=>withdrawalValue(r,c[0],false))]))}
const refundFilters={};
const refundDrafts={};
const refundPicked=new Set();
const refundPages={};
const refundSizes={};
views.refunds='manage';
function refundDefaults(view=views.refunds){if(view==='withdrawal')return withdrawalDefaults();return {dateKind:view==='manage'?'submittedAt':'approvedAt',from:'2025-08-04',to:'2025-09-30',keywordKind:'customer',keyword:'',type:'',status:'',operation:'',audit0:'',audit1:'',audit2:''}}
function refundFilter(){return refundFilters[views.refunds]||=refundDefaults()}
function refundDraft(){return refundDrafts[views.refunds]||=clone(refundFilter())}
function refundDraftChange(form){refundDrafts[views.refunds]=Object.fromEntries(new FormData(form))}
function refundSearch(reset=false){if(reset)refundDrafts[views.refunds]=refundDefaults();let f=clone(refundDraft());if(f.from&&f.to&&f.from>f.to)return toast('开始日期不能晚于结束日期');refundFilters[views.refunds]=f;refundPages[views.refunds]=1;refundPicked.clear();refresh()}
function refundTab(view){if(!refundTabs.some(t=>t[0]===view))return;views.refunds=view;refundPicked.clear();refresh()}
function refundQuick(kind){let end=new Date(today()+'T12:00:00'),start=new Date(end),fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(kind==='昨天'){start.setDate(start.getDate()-1);end=new Date(start)}if(kind==='本周')start.setDate(start.getDate()-((start.getDay()+6)%7));if(kind==='本月')start.setDate(1);if(kind==='上月'){start=new Date(end.getFullYear(),end.getMonth()-1,1,12);end=new Date(end.getFullYear(),end.getMonth(),0,12)}Object.assign(refundDraft(),{from:fmt(start),to:fmt(end)});refresh()}
function refundRows(){if(views.refunds==='withdrawal')return withdrawalRows();let f=refundFilter(),view=views.refunds;return managementContext.data.refunds.filter(r=>{if(view==='list'&&!['处理中','已退款','退款异常'].includes(r.status))return false;let day=(r[f.dateKind]||'').slice(0,10);if((f.from||f.to)&&(!day||f.from&&day<f.from||f.to&&day>f.to))return false;if(f.type&&r.typeFilter!==f.type||f.status&&r.status!==f.status||f.operation&&r.operation!==f.operation)return false;if(view==='manage'&&r.audit.some((a,i)=>f['audit'+i]&&a.status!==f['audit'+i]))return false;let value=({customer:r.name+' '+r.phone,applicant:r.applicant,auditor:r.audit.map(a=>a.by).join(' '),member:r.member,order:r.order,number:r.number,product:r.projects.map(p=>p.name).join(' '),merchant:r.merchant})[f.keywordKind]||'';return !f.keyword||value.toLowerCase().includes(f.keyword.trim().toLowerCase())})}
function refundBadge(value){return badge(value,['已审核','已退款','已提现'].includes(value)?'green':['已拒绝','退款异常','原路退款失败'].includes(value)?'red':['待审核','审核中','处理中','待确认','待提现'].includes(value)?'orange':'')}
function refundButton(label,action,disabled=false,cls=''){return b(label,action,cls).replace('<button ',`<button ${disabled?'disabled ':''}`)}
function refundSlice(){let rows=refundRows(),size=refundSizes[views.refunds]||10,pages=Math.max(1,Math.ceil(rows.length/size)),page=refundPages[views.refunds]=Math.max(1,Math.min(refundPages[views.refunds]||1,pages));return {rows,size,pages,page,visible:rows.slice((page-1)*size,page*size)}}
function refundPick(on,id){let ids=id?[id]:refundSlice().visible.map(r=>r.id);ids.forEach(id=>on?refundPicked.add(id):refundPicked.delete(id));refresh()}
function refundPaging(page,size){if(size){refundSizes[views.refunds]=Number(size);page=1}refundPages[views.refunds]=page;refundPicked.clear();refresh()}
function refundEligible(r,stage){return !!r&&r.status==='审核中'&&r.audit[stage]?.status==='待审核'&&r.audit.slice(0,stage).every(a=>['已审核','无需审批'].includes(a.status))}
function refundCanPaid(r){if(r?.withdrawalStatus)return false;return !!r&&r.status==='处理中'&&['人工转账','线下处理'].includes(r.operation)}
function refundColumns(view=views.refunds){let cols=view==='manage'?[['id','ID',78],['customer','客户',150],['member','会员号',100],['type','退款类型',130],['amount','退款金额',104],['pay','退款方式',96],['account','客户账户',128],['reason','退款说明',130],['order','关联单号',174],['submittedAt','申请时间',122],['applicant','申请人',96],['audit0','主管审核状态',118],['audit1','售后审核状态',118],['audit2','财务审核状态',118]]:view==='list'?[['number','退款订单号',176],['customer','客户',150],['member','会员号',100],['type','退款类型',130],['amount','退款金额',104],['pay','支付方式',96],['account','客户账户',128],['operation','退款操作',104],['status','退款状态',104],['order','关联单号',176],['withdrawnAt','提现时间',126],['applicant','申请人',96],['processedAt','处理时间',126],['note','备注',144]]:[['number','退款订单号',176],['customer','客户',150],['member','会员号',100],['merchant','商户名称',130],['merchantNo','商户号',100],['type','退款类型',130],['amount','退款金额',104],['pay','原始支付方式',112],['status','退款状态',104],['order','关联单号',176],['submittedAt','提交时间',122],['processedAt','处理时间',126],['note','备注',144]];return cols}
function refundValue(r,key,html=true){if(key==='customer')return html?link(e(r.name),`UB.refundCustomer('${r.id}')`)+(r.phone?`<div class="muted">${e(r.phone)}</div>`:''):r.name+(r.phone?' '+r.phone:'');if(key==='amount')return r.amount.toFixed(2);if(key.startsWith('audit'))return html?refundBadge(r.audit[Number(key.slice(-1))].status):r.audit[Number(key.slice(-1))].status;if(key==='status'&&html)return refundBadge(r.status);let value=r[key]||'—';if(key.endsWith('At'))value=value.slice(0,10);return html?e(value):value}
function refundsPage(){if(views.refunds==='withdrawal')return withdrawalsPage();let view=views.refunds,f=refundDraft(),{rows,visible,page,pages,size}=refundSlice(),picked=rows.filter(r=>refundPicked.has(r.id)),manage=view==='manage';let select=(name,values,label)=>sel(name,values,f[name],label).replace(`aria-label="${name}"`,`aria-label="${label||({dateKind:'日期类型',keywordKind:'关键词类型'})[name]||name}"`);let dateKinds=manage?[['submittedAt','申请日期']]:[['approvedAt','审批日期'],['withdrawnAt','提现日期'],['processedAt','处理日期']],keywordKinds=manage?[['customer','客户'],['applicant','申请人'],['auditor','审核人'],['member','会员号'],['order','关联单号']]:[['customer','客户'],['number','退款订单号'],['order','关联订单号'],['member','会员号'],[view==='list'?'product':'merchant',view==='list'?'商品名称':'商户名称']];
    let controls=select('dateKind',dateKinds)+`<div class="mr-date">${input('from',f.from,'date').replace('aria-label="from"','aria-label="开始日期"')}<span>至</span>${input('to',f.to,'date').replace('aria-label="to"','aria-label="结束日期"')}</div><div class="refund-quick">${['上月','昨天','今天','本周','本月'].map(x=>link(x,`UB.refundQuick('${x}')`)).join('')}</div>`+(manage?refundStages.map((s,i)=>select('audit'+i,['待审核','已审核','已拒绝'],'全部'+s+'状态')).join(''):select('status',view==='list'?['处理中','已退款','退款异常']:['审核中','处理中','已退款','已拒绝','退款异常','已取消'],'全部退款状态')+select('operation',view==='list'?['系统打款','人工转账','线下处理']:['系统打款','人工转账'],'全部退款操作'))+select('type',['余额退款','预约流退','到店流退','项目退款',...(manage?['余额分润']:[])],'全部退款类型')+`<div class="refund-keyword">${select('keywordKind',keywordKinds)}${input('keyword',f.keyword,'search','placeholder="请输入关键词"').replace('aria-label="keyword"','aria-label="退款关键词"')}</div>`;
    let filter=tabs(refundTabs,view,v=>`UB.refundTab('${v}')`)+queryModule(controls,'UB.refundSearch()','UB.refundSearch(true)').replace('class="panel query-module"','class="panel query-module ub-query"').replace('<div class="filterbar">','<form class="filterbar" oninput="UB.refundDraftChange(this)" onchange="UB.refundDraftChange(this)" onsubmit="event.preventDefault();UB.refundSearch()">').replace('</div></div></section>','</div></form></section>').replaceAll('<button ','<button type="button" ');
    let buttons=manage?refundStages.map((stage,i)=>refundButton(stage+'通过',`UB.refundAudit(${i},true)`,!picked.length||!picked.every(r=>refundEligible(r,i)))+refundButton(stage+'拒绝',`UB.refundAudit(${i},false)`,!picked.length||!picked.every(r=>refundEligible(r,i)))).join(''):view==='list'?refundButton('批量已退款','UB.refundPaid()',!picked.length||!picked.every(refundCanPaid)):'';buttons+=b('导出','UB.refundExport()')+b('退款配置','UB.refundConfig()');
    let columns=refundColumns(),widths=[40,52,...columns.map(c=>c[2]),manage&&visible.some(r=>refundStages.some((_,i)=>refundEligible(r,i)))?220:82],heads=[`<input type="checkbox" aria-label="选择本页退款记录" ${visible.length&&visible.every(r=>refundPicked.has(r.id))?'checked':''} onchange="UB.refundPick(this.checked)">`,'序号',...columns.map(c=>c[1]),'操作'];
    let values=visible.map((r,i)=>[`<input type="checkbox" aria-label="选择退款 ${r.id}" ${refundPicked.has(r.id)?'checked':''} onchange="UB.refundPick(this.checked,'${r.id}')">`,(page-1)*size+i+1,...columns.map(c=>refundValue(r,c[0])),actions(link('查看',`UB.refundDetail('${r.id}')`),...(manage?refundStages.flatMap((s,n)=>refundEligible(r,n)?[link(s.replace('审核','')+'通过',`UB.refundAudit(${n},true,'${r.id}')`),link(s.replace('审核','')+'拒绝',`UB.refundAudit(${n},false,'${r.id}')`)]:[]):[]))]);
    let grid=tableHTML(heads,values).replace('class="table-wrap ub-table"','class="table-wrap ub-table refund-table" tabindex="0" aria-label="退款记录，可横向滚动查看全部字段"').replace('<table>',`<table style="table-layout:fixed;width:${widths.reduce((a,b)=>a+b,0)}px"><colgroup>${widths.map(w=>`<col style="width:${w}px">`).join('')}</colgroup>`),sum=state=>rows.filter(r=>state==='paid'?r.status==='已退款':['审核中','处理中','退款异常'].includes(r.status)).reduce((n,r)=>n+Math.round(r.amount*100),0)/100;
    let summary=`<div class="refund-summary"><span>已退款 <strong>${sum('paid').toFixed(2)}</strong></span><span>待退款 <strong>${sum('pending').toFixed(2)}</strong></span>${picked.length?`<span>已选 ${picked.length} 条</span>`:''}</div>`;
    let pager=companyPager(rows.length,page,size,'refundPaging',[5,10,20,30,50]);
    return filter+panelHTML(manage?'退款申请':refundTabs.find(t=>t[0]===view)[1],summary+grid+pager,buttons)
  }
function refundAudit(stage,approve,id){let ids=id?[id]:[...refundPicked],rows=managementContext.data.refunds.filter(r=>ids.includes(r.id));if(!rows.length||!rows.every(r=>refundEligible(r,stage)))return toast('请选择该环节待审核的记录');let title=refundStages[stage]+(approve?'通过':'拒绝');open(title,details([['申请数量',rows.length+' 条'],['退款金额',money(rows.reduce((n,r)=>n+r.amount,0))]])+tableHTML(['客户','关联单号','退款金额'],rows.map(r=>[e(r.name),e(r.order),money(r.amount)])),()=>{if(!rows.every(r=>refundEligible(r,stage)))return error('记录状态已变化，请关闭后重新选择');rows.forEach(r=>{let before=clone(r);r.audit[stage]={stage:refundStages[stage],status:approve?'已审核':'已拒绝',by:'张三',at:stamp()};if(!approve)r.status='已拒绝';else if(r.audit.every(a=>['已审核','无需审批'].includes(a.status))){r.status='处理中';r.approvedAt=stamp()}history('refunds',r.id,title,before,r)});refundPicked.clear();save(title+'已完成');close(true);if(stack.length)redraw();refresh()},560);stack.at(-1).saveLabel=approve?'确认通过':'确认拒绝';redraw()}
function refundPaid(){let rows=managementContext.data.refunds.filter(r=>refundPicked.has(r.id));if(!rows.length||!rows.every(refundCanPaid))return toast('仅可确认人工转账或线下处理且处于处理中的记录');open('批量确认已退款',tableHTML(['客户','退款订单号','退款金额'],rows.map(r=>[e(r.name),e(r.number||'—'),money(r.amount)]))+'<p class="ub-note">请在实际退款并核对到账后确认。</p>',()=>{if(!rows.every(refundCanPaid))return error('记录状态已变化，请重新选择');rows.forEach(r=>{let before=clone(r);r.status='已退款';r.processedAt=stamp();history('refunds',r.id,'确认已退款',before,r)});refundPicked.clear();save('已记录退款完成');close(true);refresh()},560);stack.at(-1).saveLabel='确认已退款';redraw()}
function refundExport(){let columns=refundColumns();exportCSV(refundTabs.find(t=>t[0]===views.refunds)[1],['序号',...columns.map(c=>c[1])],refundRows().map((r,i)=>[i+1,...columns.map(c=>refundValue(r,c[0],false))]))}
function refundDetail(id){let r=managementContext.data.refunds.find(r=>r.id===id);if(!r)return;open('订单退款详细记录',()=>{r=managementContext.data.refunds.find(x=>x.id===id);const withdrawalControls=r.withdrawalStatus&&views.refunds==='withdrawal'?withdrawalActions(r,false):'';let pairs=[['退款订单号',r.number],['退款受理流水号',r.acceptSerial],['原订单号',r.order],...(r.receipt?[['原支付流水',r.receipt.reference||r.receipt.paymentId]]:[]),['退款金额',r.amount.toFixed(2)],['客户',r.name],['会员号',r.member],['商户名称',r.merchant],['商户号',r.merchantNo],['退款渠道',r.pay],...(r.withdrawalStatus?[['退款方式',refundMethodText(r)],['提现状态',r.withdrawalStatus],['处理状态',refundExecution(r)],['门店',r.store],['失败原因',r.failureReason],['原路重试次数',String(r.retryCount||0)],['下一步',refundNextStep(r)]]:[]),['交易类型',r.type],['退款渠道流水号',r.channelSerial],['退款状态',r.status],['提交时间',r.submittedAt],['处理时间',r.processedAt],['退款说明',r.reason],['备注',r.note]];return section('退款信息',`<div class="refund-detail-grid">${pairs.map(([label,value])=>details([[label,e(value||'—')]])).join('')}</div>`)+(withdrawalControls?section('提现处理',withdrawalControls):'')+(r.bankRequest?section('门店收款信息',details([['转账原因',e(r.bankRequest.reason)],['要求转账时间',e(r.bankRequest.requestedAt)],['门店提交时间',e(r.bankRequest.submittedAt||'尚未提交')],...refundPayoutRows(r.transferBank)])):r.fallbackPayout?section('备用收款信息',details(refundPayoutRows(r.fallbackPayout))):'')+(r.refundAttempts?.length?section('原路退款请求',tableHTML(['请求编号','发起时间','结果','返回说明'],r.refundAttempts.map(a=>[e(a.id),e(a.requestedAt),e(({processing:'等待渠道回执',success:'退款成功',failed:'退款失败'})[a.status]),e(a.message||'等待支付渠道返回结果')]))):'')+(r.voucher?section('凭证',`<button type="button" class="refund-voucher-thumb" aria-label="预览退款凭证" onclick="UB.refundVoucher()">${refundVoucherSVG()}<span>示例凭证 · 点击预览</span></button>`):'')+section('审核情况',tableHTML(['审核类型','审核状态','审核人','审核时间'],r.audit.map(a=>[e(a.stage),refundBadge(a.status),e(a.by||'—'),e(a.at||'—')])))+section('退款项目',r.projects.length?tableHTML(['申请退款项目','数量','售价','实收','老师'],r.projects.map(p=>[e(p.name),p.qty,money(p.price),money(p.received),e(p.teacher||'—')])):'<p class="ub-note">暂无项目明细</p>')+section('订单信息',tableHTML(['单号','到店时间','购买项目','实收'],[[e(r.order),e(r.arrivedAt||'—'),r.orderItems?.map(e).join('<br>')||'—',r.orderReceived==null?'—':money(r.orderReceived)]]))+section('操作记录',r.refundEvents?.length?tableHTML(['时间','操作人','操作','说明'],[...r.refundEvents].reverse().map(h=>[e(h.time),e(h.by),e(h.action),e(h.detail||'—')])):managementContext.data.history.some(h=>h.module==='refunds'&&h.target===id)?tableHTML(['时间','内容'],managementContext.data.history.filter(h=>h.module==='refunds'&&h.target===id).map(h=>[e(h.time),e(h.summary)])):'<p class="ub-note">暂无本地操作记录</p>')},null,1120)}
function refundCustomer(id){let r=managementContext.data.refunds.find(r=>r.id===id),rows=managementContext.data.refunds.filter(x=>x.member===r.member);open('客户资料',section('基本资料',details([['客户',e(r.name)],['手机号',e(r.phone||'—')],['会员号',e(r.member)]]))+section('关联退款记录',tableHTML(['申请日期','退款类型','金额','状态','操作'],rows.map(x=>[e(x.submittedAt.slice(0,10)),e(x.type),money(x.amount),refundBadge(x.status),link('查看',`UB.refundDetail('${x.id}')`)]))),null,860)}
function refundVoucherSVG(){return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" role="img" aria-label="源页面蓝底微徒示例凭证"><rect width="160" height="160" fill="#3985f7"/><text x="80" y="96" text-anchor="middle" font-family="sans-serif" font-size="56" fill="white">微徒</text></svg>'}
function refundVoucher(){let content=item=>`<div class="refund-voucher-controls">${item.refundPrevious?b('返回退款详情','UB.refundVoucherBack()'):''}${b('缩小',"UB.refundVoucherView('out')")}${b('放大',"UB.refundVoucherView('in')")}${b('向左旋转',"UB.refundVoucherView('left')")}${b('向右旋转',"UB.refundVoucherView('right')")}${b('还原',"UB.refundVoucherView('reset')")}</div><div class="refund-voucher-preview"><div style="transform:scale(${item.zoom||1}) rotate(${item.angle||0}deg)">${refundVoucherSVG()}</div></div><p class="ub-note">示例凭证预览。</p>`;if(stack.length===2){let item=stack.at(-1);item.refundPrevious={title:item.title,content:item.content,width:item.width};item.title='退款凭证';item.content=content;item.width=860;redraw()}else open('退款凭证',content,null,860)}
function refundVoucherBack(){let item=stack.at(-1);if(!item?.refundPrevious)return;Object.assign(item,item.refundPrevious);delete item.refundPrevious;redraw()}
function refundVoucherView(action){let item=stack.at(-1);if(action==='reset'){item.zoom=1;item.angle=0}else if(action==='in'||action==='out')item.zoom=Math.max(.5,Math.min(3,(item.zoom||1)+(action==='in'?.25:-.25)));else item.angle=(item.angle||0)+(action==='left'?-90:90);redraw()}
UB.register("refunds",{"refunds":refundsPage},{refundConfig,refundConfigTab,refundConfigDaysChange,refundConfigAddRule,refundConfigRemoveRule,refundConfigRuleMode,refundStoreEntry,withdrawalConfirm,withdrawalPay,withdrawalTransfer,withdrawalCancel,withdrawalExport,refundDraftChange,refundSearch,refundTab,refundQuick,refundPick,refundPaging,refundAudit,refundPaid,refundExport,refundDetail,refundCustomer,refundVoucher,refundVoucherBack,refundVoucherView},()=>{

if(!Object.hasOwn(managementContext.data,'refundPaymentConfig'))managementContext.data.refundPaymentConfig=clone(refundPaymentConfig);refundInit();refundRecoveryInit();refundImportMobile();
},()=>{refundEnter();const id=new URLSearchParams(location.hash.split('?')[1]||'').get('riskRefund');if(id)refundDetail(id)},refundLeave);
})();
