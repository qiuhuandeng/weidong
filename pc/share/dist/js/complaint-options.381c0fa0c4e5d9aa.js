/* Configurable complaint dictionaries; separate from complaint records and other systems. */
window.PCComplaintOptions = (() => {
  // Temporarily hide request configuration and ticket entry; retain saved data.
  const REQUEST_ENTRY_ENABLED=false;
  const DEFAULTS={demands:['正和客户协商退款金额','正和门店协商退款业绩','已和客户达成退款金额，待付款','无法联系上客户','客户提出的赔偿金额不合理（退一赔三）','客户提出的赔偿金额不合理（退一赔十）'],types:['闭店','咨询报价','前端话术','门店环境','门店多收','祛斑反黑','顾客自身','光电操作','脱毛操作','门店服务','医美效果','皮肤效果','脱毛效果','光电效果','广告宣传','前后端服务','仪器资质','产品价格','负面新闻','门店加单','顾客交钱没做','抗衰效果','产品过敏']};
  const REQUEST_DEFAULTS=[
    {name:'申请退款',reasons:['暂时不需要了','时间不方便，无法到店','一直预约不上','门店无法继续提供服务','服务与介绍不符','服务体验或效果不满意','其他原因']},
    {name:'商品退换',reasons:['收到的商品不对','商品破损或包装异常','商品有质量问题','使用后不适合','不再需要了','其他原因']},
    {name:'调整预约或服务',reasons:['想更改预约时间','想更换门店','想更换服务人员','想调整服务项目','原预约无法正常安排','其他原因']},
    {name:'服务后需要帮助',reasons:['效果与预期有差异','服务后出现不适','服务没有完成','需要复查或后续护理指导','其他原因']},
    {name:'费用或权益有疑问',reasons:['不清楚收费或扣费明细','实际收费与介绍不一致','余额或剩余次数不清楚','优惠没有生效','承诺的项目或赠品未收到','其他原因']},
    {name:'其他帮助',reasons:['联系不上门店或服务人员','之前的问题一直没有解决','对服务沟通不满意','其他问题']}
  ];
  const LABELS={demands:'未达成原因',types:'售后类型'},copy=value=>JSON.parse(JSON.stringify(value));
  const LEVELS=['1级','2级','3级','4级','5级'];
  const LEVEL_FIELDS={criteria:{label:'定级条件',limit:2000},keywords:{label:'识别关键词',limit:500},exclusions:{label:'排除条件',limit:2000}};
  let current={schema:1,revision:0,...copy(DEFAULTS),requests:copy(REQUEST_DEFAULTS),demandTimings:{},defaultTimings:{},aiGradeEnabled:false,levelDefinitions:{}},failure='',database,channel;
  const listeners=new Set();
  function timingValue(value,unit='hours'){
    if(value===''||value===null||value===undefined)return null;
    const amount=Number(value),factor=unit==='hours'?3600000:unit==='days'?86400000:0;
    if(!factor||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(amount*factor))throw Error('处理时效须为正整数，单位为小时或天');
    return {value:amount,unit};
  }
  const timingText=timing=>timing?timing.value+' '+(timing.unit==='days'?'天':'小时'):'未设置';
  function dayValue(value){
    if(value===''||value===null||value===undefined)return null;
    const days=Number(value);
    if(!Number.isFinite(days)||days<=0||!Number.isSafeInteger(Math.round(days*86400000))||days*86400000<60000)throw Error('处理天数须大于 0，且不少于 1 分钟');
    return days;
  }
  function daysByLevel(timing){
    if(!timing)return {};
    // Preserve existing uniform limits until the user changes a particular level.
    return timing.byLevel?copy(timing.byLevel):Object.fromEntries(LEVELS.map(level=>[level,timing.unit==='hours'?timing.value/24:timing.value]));
  }
  function resolveTiming(config,name,level){
    if(!LEVELS.includes(level))return {timing:null,source:''};
    if(name&&Object.hasOwn(config.demandTimings||{},name)){
      const timing=config.demandTimings[name];
      if(!timing.byLevel)return {timing:copy(timing),source:'demand'};
      if(Object.hasOwn(timing.byLevel,level))return {timing:{value:timing.byLevel[level],unit:'days'},source:'demand'};
    }
    return Object.hasOwn(config.defaultTimings||{},level)?{timing:{value:config.defaultTimings[level],unit:'days'},source:'default'}:{timing:null,source:''};
  }
  const timingFor=(config,name,level)=>resolveTiming(config,name,level).timing;
  function validateLevels(levels){
    if(!levels||typeof levels!=='object'||Array.isArray(levels))throw Error('等级时效配置格式无效，原配置已保留');
    for(const [level,days]of Object.entries(levels))if(!LEVELS.includes(level)||typeof days!=='number'||!dayValue(days))throw Error('等级时效配置无效，原配置已保留');
  }
  function validateRequests(items){
    const names=(values,label)=>{
      if(!Array.isArray(values)||!values.length)throw Error(label+'至少保留一个选项');
      if(values.some(value=>typeof value!=='string'||!value.trim()||value!==value.trim()||value.length>50))throw Error(label+'须为 1–50 个字符，且首尾不能有空格');
      if(new Set(values).size!==values.length)throw Error(label+'存在重复选项');
    };
    if(!Array.isArray(items))throw Error('客户诉求配置格式无效，原配置已保留');
    names(items.map(item=>item?.name),'客户诉求类型');
    items.forEach(item=>names(item.reasons,'“'+item.name+'”的具体原因'));
    return copy(items);
  }
  function validateDefinition(value){
    if(!value||typeof value!=='object'||Array.isArray(value))throw Error('客诉等级定义格式无效，原配置已保留');
    const definition={};
    for(const [key,{label,limit}]of Object.entries(LEVEL_FIELDS)){
      const text=value[key]===undefined?'':value[key];
      if(typeof text!=='string'||text.length>limit)throw Object.assign(Error(label+'须为不超过 '+limit+' 个字符的文本'),{field:key});
      definition[key]=text.trim();
    }
    if(!Object.values(definition).some(Boolean))return null;
    if(!definition.criteria)throw Object.assign(Error('配置该等级时请填写定级条件，或清空全部字段以移除定义'),{field:'criteria'});
    return definition;
  }
  function validate(value){
    if(value?.schema!==1||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('下拉选项配置格式不兼容，原配置已保留');
    for(const [key,label]of Object.entries(LABELS)){
      const items=value[key];
      if(!Array.isArray(items)||!items.length)throw Error(label+'至少保留一个选项');
      if(items.some(item=>typeof item!=='string'||!item.trim()||item!==item.trim()||item.length>50))throw Error(label+'的选项名称须为 1–50 个字符，且首尾不能有空格');
      if(new Set(items).size!==items.length)throw Error(label+'存在重复选项');
    }
    const timings=value.demandTimings??{};
    if(typeof timings!=='object'||Array.isArray(timings))throw Error('处理时效配置格式不兼容，原配置已保留');
    for(const [name,timing]of Object.entries(timings)){
      if(!value.demands.includes(name)||!timing||typeof timing!=='object'||Array.isArray(timing))throw Error('处理时效配置无效，原配置已保留');
      if(Object.hasOwn(timing,'byLevel')){
        validateLevels(timing.byLevel);
      }else if(!['hours','days'].includes(timing.unit)||typeof timing.value!=='number'||!timingValue(timing.value,timing.unit))throw Error('处理时效配置无效，原配置已保留');
    }
    const defaults=value.defaultTimings===undefined?{}:value.defaultTimings;validateLevels(defaults);
    // Add the independent request dictionary only when upgrading old configuration.
    const requests=validateRequests(value.requests===undefined?REQUEST_DEFAULTS:value.requests);
    const aiGradeEnabled=value.aiGradeEnabled===undefined?false:value.aiGradeEnabled;
    if(typeof aiGradeEnabled!=='boolean')throw Error('AI 识别开关配置格式无效，原配置已保留');
    const definitions=value.levelDefinitions===undefined?{}:value.levelDefinitions,levelDefinitions={};
    if(!definitions||typeof definitions!=='object'||Array.isArray(definitions))throw Error('客诉等级定义格式无效，原配置已保留');
    for(const [level,value]of Object.entries(definitions)){
      if(!LEVELS.includes(level))throw Error('客诉等级定义仅支持 1–5 级，原配置已保留');
      const definition=validateDefinition(value);if(definition)levelDefinitions[level]=definition;
    }
    return {...value,requests,demandTimings:copy(timings),defaultTimings:copy(defaults),aiGradeEnabled,levelDefinitions};
  }
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      let request,settled=false;
      const timer=setTimeout(()=>finish(Error('配置数据库打开超时，请关闭旧页面后重试')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{request=indexedDB.open('weid-pc-complaint-options-v1',1)}catch(error){finish(error);return}
      request.onupgradeneeded=()=>request.result.createObjectStore('options');
      request.onerror=()=>finish(request.error||Error('配置数据库无法打开'));
      request.onblocked=()=>finish(Error('配置数据库被旧页面占用，请关闭旧页面后重试'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(error=>{database=null;throw error});
    return database;
  }
  function accept(value){current=copy(validate(value));failure='';return copy(current)}
  async function read(){
    try{
      const db=await open();
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction('options','readonly'),request=tx.objectStore('options').get('dictionary');
        tx.oncomplete=()=>resolve(request.result===undefined?{schema:1,revision:0,...copy(DEFAULTS)}:request.result);
        tx.onabort=tx.onerror=()=>reject(tx.error||request.error||Error('配置读取失败'));
      });
      return accept(value);
    }catch(error){failure=error.message||String(error);throw error}
  }
  async function save(draft,expected){
    const next=validate({schema:1,revision:expected+1,demands:copy(draft.demands),types:copy(draft.types),requests:copy(draft.requests??current.requests),demandTimings:copy(draft.demandTimings||{}),defaultTimings:copy(draft.defaultTimings??{}),aiGradeEnabled:draft.aiGradeEnabled===undefined?current.aiGradeEnabled:draft.aiGradeEnabled,levelDefinitions:copy(draft.levelDefinitions===undefined?current.levelDefinitions:draft.levelDefinitions)}),db=await open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('options','readwrite'),store=tx.objectStore('options'),request=store.get('dictionary');let cause;
      request.onsuccess=()=>{try{
        const saved=request.result;
        if((saved===undefined?0:validate(saved).revision)!==expected)throw Error('其他页面已更新配置，请关闭后重新打开配置；当前修改尚未保存');
        store.put(next,'dictionary');
      }catch(error){cause=error;tx.abort()}};
      tx.oncomplete=resolve;
      tx.onabort=tx.onerror=()=>reject(cause||tx.error||request.error||Error('配置保存失败'));
    });
    accept(next);
    // Notification failures cannot undo an already committed configuration.
    try{channel?.postMessage(next.revision)}catch{}
    return copy(current);
  }
  function options(key,selected='',history=[]){
    const items=current[key].map(value=>[value,value]);
    for(const value of [...history,selected])if(value&&!items.some(([item])=>item===value))items.push([value,value+'（历史）']);
    return items;
  }
  async function refresh(){try{const before=JSON.stringify(current);await read();if(before!==JSON.stringify(current))listeners.forEach(listener=>listener())}catch{}}
  try{channel=new BroadcastChannel('weid.pc.complaint-options');channel.onmessage=refresh}catch{}
  window.addEventListener('focus',refresh);
  const requestTypes=()=>current.requests.map(item=>item.name);
  const requestReasons=name=>[...(current.requests.find(item=>item.name===name)?.reasons||[])];
  return {requestEntryEnabled:REQUEST_ENTRY_ENABLED,LABELS,LEVELS,LEVEL_FIELDS,read,save,validate,validateDefinition,validateRequests,requestTypes,requestReasons,timingValue,timingText,dayValue,daysByLevel,timingFor,resolveTiming,options,refresh,subscribe:listener=>listeners.add(listener),get current(){return copy(current)},get error(){return failure}};
})();

;
/* Complaint option editing reuses the existing layered drawer and company adapters. */
window.PCModules['complaint-options']={render(){},create({dictionary,getLayers,getEditor,getRecords,responsibleOptions,assessmentChoices,multiValues,multiSelect,responsibilityRule,select,openLayer,closeLayer,refreshOptionConsumers,btn,link,esc,section,field,input,toast,draftFiles,HANDLING_FILE_TYPES,validPlan}){
  const blankEntry=()=>({index:null,name:''});
  const labels={...dictionary.LABELS,requests:'客户诉求类型',reasons:'具体原因'};
  const itemName=item=>typeof item==='string'?item:item?.name||'';
  async function openOptions(){
    if(getLayers().length)return;
    const layer=openLayer('投诉配置','<p class="uc-muted">正在读取配置…</p>',btn('取消','dismiss'));
    layer.el.querySelector('.uc-drawer').dataset.size='medium';
    layer.el.querySelector('.uc-drawer').style.setProperty('--archive-drawer-width','860px');
    try{
      const saved=await dictionary.read();if(!getLayers().includes(layer)||layer.closing)return;
      layer.options={draft:saved,baseline:JSON.stringify(saved),tab:'demands',entries:{demands:blankEntry(),...(dictionary.requestEntryEnabled?{requests:blankEntry()}:{}),types:blankEntry()},saving:false};
      renderOptions(layer);
    }catch(error){if(getLayers().includes(layer)&&!layer.closing)layer.el.querySelector('.uc-drawer-body').innerHTML=`<div class="uc-error" role="alert">配置读取失败：${esc(error.message)}。原配置已保留，请关闭后重试。</div>`}
  }
  function optionsDirty(config){return !!config.timingErrors?.length||JSON.stringify(config.draft)!==config.baseline||Object.entries(config.entries).some(([key,entry])=>entry.name!==(entry.index===null?'':itemName(config.draft[key][entry.index])))}
  const optionTabs={demands:dictionary.LABELS.demands,...(dictionary.requestEntryEnabled?{requests:'客户诉求'}:{}),types:dictionary.LABELS.types,levels:'客诉等级',timings:'时效配置'};
  function openLevelDefinition(parent,level){
    if(!dictionary.LEVELS.includes(level)||parent.options.parent)return;
    const layer=openLayer('客诉等级定义 · '+level,'','',2);
    layer.el.querySelector('.uc-drawer').dataset.size='small';
    layer.el.querySelector('.uc-drawer').style.setProperty('--archive-drawer-width','560px');
    const draft={criteria:'',keywords:'',exclusions:'',...parent.options.draft.levelDefinitions[level]};
    layer.options={draft,baseline:JSON.stringify(draft),tab:'level-definition',entries:{},saving:false,parent,level};
    renderOptions(layer);
  }
  function levelDefinitionPanel(c){
    const placeholders={criteria:'填写 AI 判断为该等级的具体情况、事实依据、适用边界及条件之间的关系',keywords:'填写典型用词或表达，多个关键词可用换行或逗号分隔',exclusions:'填写不应判入该等级的情况，以及容易误判的边界'};
    return `<div class="ub-form">${field('definitionLevel','客诉等级',`<span>${esc(c.level)}</span>`,false,'',true)}${Object.entries(dictionary.LEVEL_FIELDS).map(([key,{label,limit}])=>field('level-'+key,label,`<textarea id="uc-level-${key}" name="level-${key}" class="uc-input" rows="${key==='keywords'?3:4}" maxlength="${limit}" show-word-limit placeholder="${placeholders[key]}">${esc(c.draft[key])}</textarea>`,false,'',true)).join('')}</div>`;
  }
  function levelsPanel(c,busy){
    const switchControl=`<div class="uc-actions"><label class="switch"><input type="checkbox" id="uc-aiGradeEnabled" name="aiGradeEnabled" aria-label="开启 AI 识别客诉等级" ${c.draft.aiGradeEnabled?'checked':''} ${busy}></label><span data-ai-grade-state>${c.draft.aiGradeEnabled?'已开启':'已关闭'}</span></div>`;
    return `<div class="ub-form">${field('aiGradeEnabled','AI 识别等级',switchControl,false,'',true)}</div><div class="table-wrap" data-level-definitions ${c.draft.aiGradeEnabled?'':'hidden'}><table data-pc-scroll="parent" data-pc-align="left" data-pc-min-height="0" aria-label="客诉等级定义"><colgroup><col style="width:80px"><col><col><col><col style="width:70px"></colgroup><thead><tr><th>客诉等级</th>${Object.values(dictionary.LEVEL_FIELDS).map(({label})=>`<th data-pc-min-width="150">${label}</th>`).join('')}<th>操作</th></tr></thead><tbody>${dictionary.LEVELS.map(level=>`<tr><td>${esc(level)}</td>${Object.keys(dictionary.LEVEL_FIELDS).map(key=>`<td><div class="uc-complaint-content">${c.draft.levelDefinitions[level]?.[key]?esc(c.draft.levelDefinitions[level][key]):'<span class="uc-muted">未配置</span>'}</div></td>`).join('')}<td>${link('编辑','options-level-edit',`data-level="${level}" aria-label="编辑${level}客诉等级定义" ${busy}`)}</td></tr>`).join('')}</tbody></table></div>`;
  }
  function openReasons(parent,index){
    if(!dictionary.requestEntryEnabled)return;
    const request=parent.options.draft.requests[index];if(!request)return;
    const layer=openLayer('配置原因 · '+request.name,'','',2);
    layer.el.querySelector('.uc-drawer').dataset.size='small';
    layer.el.querySelector('.uc-drawer').style.setProperty('--archive-drawer-width','560px');
    const draft={reasons:[...request.reasons]};
    layer.options={draft,baseline:JSON.stringify(draft),tab:'reasons',entries:{reasons:blankEntry()},saving:false,parent,requestIndex:index};
    renderOptions(layer);
  }
  const timingName=(row,index)=>`timing-${row===null?'default':row}-${index}`;
  const demandDays=(c,name)=>dictionary.daysByLevel(Object.hasOwn(c.draft.demandTimings,name)?c.draft.demandTimings[name]:null);
  function timingCell(c,name,row,level,index,busy){
    const days=name===null?c.draft.defaultTimings:demandDays(c,name);
    const invalid=c.timingErrors?.find(error=>error.name===name&&error.level===level),value=invalid?.value??days[level]??'';
    const controlName=timingName(row,index),label=(name??'默认时效')+'，'+level+'处理天数';
    return `<td${name===null?' data-timing-default':''}><div class="uc-timing-cell" data-timing-field="${controlName}">${input(controlName,value,'','text',`inputmode="decimal" aria-label="${esc(label)}" ${invalid?'aria-invalid="true"':''} ${busy}`)}</div></td>`;
  }
  function optionPanel(c,busy){
    const key=c.tab,items=c.draft[key],entry=c.entries[key];
    const add=btn(entry.index===null?'添加':'确认修改','options-apply',busy,true)+(entry.index===null?'':btn('取消编辑','options-cancel-edit',busy));
    const controlName=c.parent?'reasonOptionName':'optionName';
    const nameControl=input(controlName,entry.name,'请输入选项名称','text',`maxlength="50" aria-label="选项名称" style="flex:1;min-width:0" ${busy}`);
    const form=field(controlName,'选项名称',`<div class="uc-actions">${nameControl}${add}</div>`,true,'',true);
    const requests=key==='requests';
    return `${section((entry.index===null?'新增':'编辑')+labels[key],`<div class="ub-form">${form}</div>`)}<div class="table-wrap"><table data-pc-scroll="parent" data-pc-align="left" data-pc-min-height="0" aria-label="${labels[key]}选项"><colgroup><col style="width:50px"><col>${requests?'<col>':''}<col style="width:${requests?250:190}px"></colgroup><thead><tr><th>序号</th><th data-pc-min-width="${requests?140:160}">${requests?'客户诉求类型':'选项名称'}</th>${requests?'<th data-pc-min-width="220">具体原因</th>':''}<th>操作</th></tr></thead><tbody>${items.map((item,index)=>`<tr><td>${index+1}</td><td>${esc(itemName(item))}</td>${requests?`<td>${item.reasons.length?item.reasons.map(reason=>esc(reason)).join('；'):'<span class="uc-muted">未配置</span>'}</td>`:''}<td><div class="uc-actions">${requests?link('配置原因','options-reasons',`data-index="${index}" ${busy}`):''}${link('编辑','options-edit',`data-index="${index}" ${busy}`)}${link('删除','options-remove',`data-index="${index}" ${busy}`)}${link('上移','options-move',`data-index="${index}" data-offset="-1" ${index===0||c.saving?'disabled':''}`)}${link('下移','options-move',`data-index="${index}" data-offset="1" ${index===items.length-1||c.saving?'disabled':''}`)}</div></td></tr>`).join('')}</tbody></table></div><p class="uc-help">${requests?'用于新增工单的客户诉求类型及具体原因。':''}保存后用于后续选择；改名或删除不会改写历史工单。可通过上移、下移调整下拉顺序。</p>`;
  }
  function timingPanel(c,busy){
    const defaults=`<tr><td data-timing-default><strong>默认时效</strong><span class="uc-muted">（未单独配置时使用）</span></td>${dictionary.LEVELS.map((level,index)=>timingCell(c,null,null,level,index,busy)).join('')}</tr>`;
    const demands=c.draft.demands.map((name,row)=>`<tr><td>${esc(name)}</td>${dictionary.LEVELS.map((level,index)=>timingCell(c,name,row,level,index,busy)).join('')}</tr>`).join('');
    const error=c.showTimingErrors?c.timingErrors?.[0]:null;
    return `<p class="uc-help">按客诉等级设置默认时效；未达成原因可单独覆盖，留空沿用默认。单位：天。</p><div class="table-wrap uc-timing-table"><table data-pc-scroll="parent" data-pc-align="left" data-pc-min-height="0" aria-label="时效配置"><colgroup><col>${dictionary.LEVELS.map(()=>'<col style="width:110px">').join('')}</colgroup><thead><tr><th data-pc-min-width="220">未达成原因</th>${dictionary.LEVELS.map(level=>`<th data-pc-min-width="100">${esc(level)}</th>`).join('')}</tr></thead><tbody>${defaults}${demands}</tbody></table></div><p class="uc-error" data-timing-error role="alert" ${error?'':'hidden'}>${error?esc((error.name??'默认时效')+' · '+error.level+'：'+error.message):''}</p><p class="uc-help">1 天按 24 小时计算；调整配置仅影响后续新开始的计时。</p>`;
  }
  function renderOptions(layer){
    const c=layer.options,key=c.tab,busy=c.saving?'disabled':'';
    if(c.parent){
      layer.el.querySelector('.uc-drawer-body').innerHTML=c.level?levelDefinitionPanel(c):optionPanel(c,busy);
      layer.el.querySelector('.uc-drawer-foot').innerHTML=btn('取消','dismiss')+btn('确定','options-save','',true);
      return;
    }
    layer.el.querySelector('.uc-drawer-body').innerHTML=`<nav class="pc-tabs" role="tablist" aria-label="投诉配置字段">${Object.entries(optionTabs).map(([key,label])=>`<button type="button" class="pc-tab" id="uc-options-tab-${key}" role="tab" aria-selected="${key===c.tab}" aria-controls="uc-options-panel" tabindex="${key===c.tab?'0':'-1'}" data-uc="options-tab" data-key="${key}" ${busy}>${label}</button>`).join('')}</nav><div role="tabpanel" id="uc-options-panel" aria-labelledby="uc-options-tab-${key}">${key==='levels'?levelsPanel(c,busy):key==='timings'?timingPanel(c,busy):optionPanel(c,busy)}</div>`;
    layer.el.querySelector('.uc-drawer-foot').innerHTML=btn('取消','dismiss',busy)+btn(c.saving?'保存中…':'保存配置','options-save',busy,true);
  }
  function applyOption(layer,key=layer.options.tab,render=true,entry=layer.options.entries[key]){
    const c=layer.options,items=c.draft[key],name=entry.name.trim();
    if(!name||name.length>50){toast('请输入 1–50 个字符的'+labels[key]+'选项名称');return false}
    if(items.some((value,index)=>itemName(value)===name&&index!==entry.index)){toast(labels[key]+'已存在同名选项');return false}
    const previous=entry.index===null?'':itemName(items[entry.index]),added=entry.index===null;
    if(added)items.push(key==='requests'?{name,reasons:[]}:name);else if(key==='requests')items[entry.index].name=name;else items[entry.index]=name;
    if(key==='demands'&&previous!==name&&Object.hasOwn(c.draft.demandTimings,previous)){
      const timing=c.draft.demandTimings[previous];delete c.draft.demandTimings[previous];
      Object.defineProperty(c.draft.demandTimings,name,{value:timing,enumerable:true,writable:true,configurable:true});
    }
    if(key==='demands'&&previous!==name)for(const error of c.timingErrors||[])if(error.name===previous)error.name=name;
    if(entry===c.entries[key])c.entries[key]=blankEntry();if(render){renderOptions(layer);if(key==='requests'&&added)openReasons(layer,items.length-1)}return true;
  }
  async function saveOptions(layer){
    const c=layer.options;if(!c||c.saving)return;
    for(const key of Object.keys(c.entries)){const entry=c.entries[key];if((entry.index!==null||entry.name)&&!applyOption(layer,key,false)){c.tab=key;renderOptions(layer);return}}
    if(c.parent){
      if(!getLayers().includes(c.parent)||c.parent.closing)return;
      if(c.level){
        let definition;
        try{definition=dictionary.validateDefinition(c.draft)}catch(error){
          const control=layer.el.querySelector(`[name="level-${error.field||'criteria'}"]`),message=layer.el.querySelector('#uc-error-level-'+(error.field||'criteria'));
          control?.setAttribute('aria-invalid','true');if(message)message.textContent=error.message;
          PCUI.focusControl(control);toast(error.message);return;
        }
        if(definition)c.parent.options.draft.levelDefinitions[c.level]=definition;else delete c.parent.options.draft.levelDefinitions[c.level];
        c.baseline=JSON.stringify(c.draft);renderOptions(c.parent);closeLayer(true);return;
      }
      const request=c.parent.options.draft.requests[c.requestIndex];
      try{dictionary.validateRequests([{...request,reasons:c.draft.reasons}])}catch(error){toast(error.message);return}
      request.reasons=[...c.draft.reasons];c.baseline=JSON.stringify(c.draft);renderOptions(c.parent);closeLayer(true);return;
    }
    const unconfigured=dictionary.requestEntryEnabled?c.draft.requests.findIndex(item=>!item.reasons.length):-1;
    if(unconfigured>=0){c.tab='requests';renderOptions(layer);openReasons(layer,unconfigured);toast('请先配置该诉求类型的具体原因');return}
    if(c.timingErrors?.length){
      c.tab='timings';c.showTimingErrors=true;renderOptions(layer);
      const error=c.timingErrors[0],row=error.name===null?null:c.draft.demands.indexOf(error.name);
      PCUI.focusControl(layer.el.querySelector(`[name="${timingName(row,dictionary.LEVELS.indexOf(error.level))}"]`));return;
    }
    c.saving=true;renderOptions(layer);
    try{
      await dictionary.save(c.draft,c.draft.revision);
    }catch(error){c.saving=false;if(getLayers().includes(layer))renderOptions(layer);toast('配置保存失败：'+error.message+'；已保留当前修改。');return}
    c.saving=false;c.baseline=JSON.stringify(c.draft);
    if(!getLayers().includes(layer)||layer.closing)return;
    closeLayer(true);refreshOptionConsumers();toast('配置已保存');
  }
  function optionAction(action,button,layer){
    if(action==='options-open')return openOptions();
    const c=layer?.options;if(!c||c.saving)return;
    const key=c.tab,entry=c.entries[key],index=Number(button.dataset.index),items=c.draft[key];
    if(action==='options-tab'){if(!Object.hasOwn(optionTabs,button.dataset.key))return;c.tab=button.dataset.key;renderOptions(layer);layer.el.querySelector('[aria-selected="true"]')?.focus({preventScroll:true})}
    else if(action==='options-save')return saveOptions(layer);
    else if(action==='options-level-edit')openLevelDefinition(layer,button.dataset.level);
    else if(action==='options-reasons')openReasons(layer,index);
    else if(action==='options-apply')applyOption(layer);
    else if(action==='options-cancel-edit'){c.entries[key]=blankEntry();renderOptions(layer)}
    else if(action==='options-edit'){
      if(entry.name!==(entry.index===null?'':itemName(items[entry.index]))){toast('请先确认当前选项修改，或取消编辑');return}
      c.entries[key]={...blankEntry(),index,name:itemName(items[index])};renderOptions(layer);
    }
    else if(action==='options-remove'){
      if(items.length===1){toast(labels[key]+'至少保留一个选项');return}
      PCUI.confirm({title:'删除选项',content:`确定删除“${esc(itemName(items[index]))}”${key==='requests'?'及其具体原因':''}？保存配置后生效，历史工单保持原值。`,onConfirm:()=>{
        if(!getLayers().includes(layer)||layer.closing)return;
        if(key==='demands'){delete c.draft.demandTimings[items[index]];c.timingErrors=c.timingErrors?.filter(error=>error.name!==items[index]);}
        items.splice(index,1);if(entry.index===index)c.entries[key]=blankEntry();else if(entry.index>index)entry.index--;
        renderOptions(layer);
      }});
    }else if(action==='options-move'){
      const target=index+Number(button.dataset.offset);if(target<0||target>=items.length)return;
      [items[index],items[target]]=[items[target],items[index]];
      if(entry.index===index)entry.index=target;else if(entry.index===target)entry.index=index;
      renderOptions(layer);
    }
  }
  function syncOptionDraft(el){
    const layer=getLayers().at(-1),c=layer?.options;if(!c||c.saving)return false;
    if(c.tab==='levels'&&el.name==='aiGradeEnabled'){
      c.draft.aiGradeEnabled=el.checked;
      const state=layer.el.querySelector('[data-ai-grade-state]');if(state)state.textContent=el.checked?'已开启':'已关闭';
      const table=layer.el.querySelector('[data-level-definitions]');if(table)table.hidden=!el.checked;
      return true;
    }
    if(c.level&&el.name?.startsWith('level-')){
      const key=el.name.slice(6);if(!Object.hasOwn(dictionary.LEVEL_FIELDS,key))return false;
      c.draft[key]=el.value;el.removeAttribute('aria-invalid');
      const message=layer.el.querySelector('#uc-error-'+el.name);if(message)message.textContent='';
      return true;
    }
    const match=/^timing-(default|\d+)-(\d+)$/.exec(el.closest?.('[data-timing-field]')?.dataset.timingField||el.name);
    if(match&&c.tab==='timings'){
      const row=match[1]==='default'?null:Number(match[1]),name=row===null?null:c.draft.demands[row],level=dictionary.LEVELS[Number(match[2])];
      if(!level||name===undefined)return false;
      c.timingErrors=(c.timingErrors||[]).filter(error=>error.name!==name||error.level!==level);
      try{
        const value=dictionary.dayValue(el.value.trim()),days=name===null?c.draft.defaultTimings:demandDays(c,name);
        if(value===null)delete days[level];else days[level]=value;
        if(name!==null)Object.defineProperty(c.draft.demandTimings,name,{value:{byLevel:days},enumerable:true,writable:true,configurable:true});
        el.removeAttribute('aria-invalid');
      }catch(error){c.timingErrors.push({name,level,value:el.value,message:error.message});el.setAttribute('aria-invalid','true');}
      const message=layer.el.querySelector('[data-timing-error]'),error=c.showTimingErrors?c.timingErrors[0]:null;
      if(message){message.hidden=!error;message.textContent=error?(error.name??'默认时效')+' · '+error.level+'：'+error.message:'';}
      return true;
    }
    if(el.name!==(c.parent?'reasonOptionName':'optionName')||!c.entries[c.tab])return false;c.entries[c.tab].name=el.value;return true;
  }
  function handlingMissing(draft){return [['department',multiValues(draft.department).length,'请选择责任部门'],['type',String(draft.type||'').trim(),'请选择售后类型'],['responsible',draft.type==='闭店'||multiValues(draft.responsible).length,'请选择责任人'],['reason',String(draft.reason||'').trim().length>0&&String(draft.reason||'').trim().length<=2000,String(draft.reason||'').trim().length>2000?'责任原因不能超过 2000 字':'请填写责任原因'],['handlingPlan',validPlan(draft.handlingPlan),'请选择处理结果']].filter(([,value])=>!value).map(([name,,message])=>[name,message])}
  function assessmentAttachments(d,inline=false){return field('handlingFiles','附件',`<div><div class="uc-upload-row">${btn('上传附件','upload-handling','id="uc-handlingFiles"')}<input type="file" id="uc-handling-upload" accept="${Object.keys(HANDLING_FILE_TYPES).map(ext=>'.'+ext).join(',')}" multiple hidden data-upload="${inline?'inline-assessment':'handling'}"><span class="uc-muted">最多 4 个，每个不超过 5MB</span></div><div id="${inline?'uc-assessment-upload-list':'uc-upload-list'}" aria-live="polite">${draftFiles(d.handlingFiles,false,inline?'assessment':'')}</div></div>`,false,'',true)}
  function responsibilityForm(d=getEditor().draft){const hasDepartment=multiValues(d.department).length>0,closed=d.type==='闭店';return `<div class="ub-form pc-form-single">${field('department','责任部门',assessmentChoices('department','责任部门',['推广','销售','门店'],d.department,true),true,'',true)}${field('type','售后类型',select('type',dictionary.options('types',d.type),d.type,hasDepartment?'请选择售后类型':'请先选择责任部门',`required aria-required="true" ${hasDepartment?'':'disabled'}`)+`<div class="uc-help" ${responsibilityRule(d.type)?'':'hidden'}><span>归因参考：</span><span id="uc-rule-text">${responsibilityRule(d.type)}</span></div>`,true,'',true)}${field('responsible','责任人',multiSelect('responsible','责任人',responsibleOptions(d.responsible),d.responsible,hasDepartment&&d.type&&!closed?'required aria-required="true"':'disabled'),true,'',true).replace('data-field="responsible"','data-field="responsible"'+(closed?' hidden':''))}${field('reason','责任原因',`<textarea id="uc-reason" name="reason" class="uc-input" rows="3" maxlength="2000" show-word-limit required aria-required="true" placeholder="填写责任原因">${esc(d.reason)}</textarea>`,true,'',true)}</div>`}
  return {optionsDirty,optionAction,syncOptionDraft,responsibilityForm,assessmentAttachments,handlingMissing};
}};
