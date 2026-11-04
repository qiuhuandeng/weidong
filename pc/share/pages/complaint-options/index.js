/* Complaint option editing reuses the existing layered drawer and company adapters. */
window.PCModules['complaint-options']={render(){},create({dictionary,getLayers,getEditor,getRecords,responsibleOptions,assessmentChoices,multiValues,multiSelect,responsibilityRule,select,openLayer,closeLayer,refreshOptionConsumers,btn,link,esc,section,field,input,toast}){
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
  const optionTabs={demands:dictionary.LABELS.demands,...(dictionary.requestEntryEnabled?{requests:'客户诉求'}:{}),types:dictionary.LABELS.types,timings:'时效配置'};
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
      layer.el.querySelector('.uc-drawer-body').innerHTML=optionPanel(c,busy);
      layer.el.querySelector('.uc-drawer-foot').innerHTML=btn('取消','dismiss')+btn('确定','options-save','',true);
      layer.oldFoot=null;return;
    }
    layer.el.querySelector('.uc-drawer-body').innerHTML=`<nav class="pc-tabs" role="tablist" aria-label="投诉配置字段">${Object.entries(optionTabs).map(([key,label])=>`<button type="button" class="pc-tab" id="uc-options-tab-${key}" role="tab" aria-selected="${key===c.tab}" aria-controls="uc-options-panel" tabindex="${key===c.tab?'0':'-1'}" data-uc="options-tab" data-key="${key}" ${busy}>${label}</button>`).join('')}</nav><div role="tabpanel" id="uc-options-panel" aria-labelledby="uc-options-tab-${key}">${key==='timings'?timingPanel(c,busy):optionPanel(c,busy)}</div>`;
    layer.el.querySelector('.uc-drawer-foot').innerHTML=btn('取消','dismiss',busy)+btn(c.saving?'保存中…':'保存配置','options-save',busy,true);
    layer.oldFoot=null;
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
    if(action==='options-open'){openOptions();return}
    const c=layer?.options;if(!c||c.saving)return;
    const key=c.tab,entry=c.entries[key],index=Number(button.dataset.index),items=c.draft[key];
    if(action==='options-tab'){if(!Object.hasOwn(optionTabs,button.dataset.key))return;c.tab=button.dataset.key;renderOptions(layer);layer.el.querySelector('[aria-selected="true"]')?.focus({preventScroll:true})}
    else if(action==='options-save')return saveOptions(layer);
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
  function contactForm(){const d=getEditor().draft,contacts=responsibleOptions([d.firstContact,...getRecords().map(r=>r.firstContact)].filter(Boolean));return `<div class="uc-grid ub-form" data-pc-columns="2">${field('firstContact','第一联系人',select('firstContact',contacts,d.firstContact,'请选择员工，支持姓名搜索','data-filterable'),false)}${field('contactTime','投诉时间',input('contactTime',d.contactTime,'客户陈述的投诉时间','datetime-local'),false)}${field('customerDemand','未达成原因',select('customerDemand',dictionary.options('demands',d.customerDemand),d.customerDemand,'请选择未达成原因','data-filterable'),false,'',true)}${field('customerStatement','客户陈述',`<textarea id="uc-customerStatement" name="customerStatement" class="uc-input" rows="3" maxlength="500" show-word-limit placeholder="补充客户原话（选填）">${esc(d.customerStatement)}</textarea>`,false,'',true)}</div>`}
  function responsibilityForm(){const d=getEditor().draft,hasDepartment=multiValues(d.department).length>0,closed=d.type==='闭店';return `<div class="ub-form">${field('department','责任部门',assessmentChoices('department','责任部门',['推广','销售','门店'],d.department,true),true,'',true)}${field('type','售后类型',select('type',dictionary.options('types',d.type),d.type,hasDepartment?'请选择售后类型':'请先选择责任部门',`required aria-required="true" ${hasDepartment?'':'disabled'}`),true,'',true)}<div class="uc-full uc-rule" ${responsibilityRule(d.type)?'':'hidden'}><span>归因参考：</span><span id="uc-rule-text">${responsibilityRule(d.type)}</span></div>${field('responsible','责任人',multiSelect('responsible','责任人',responsibleOptions(d.responsible),d.responsible,hasDepartment&&d.type&&!closed?'required aria-required="true"':'disabled'),true,'',true).replace('data-field="responsible"','data-field="responsible"'+(closed?' hidden':''))}${field('reason','责任原因',`<textarea id="uc-reason" name="reason" class="uc-input" rows="3" maxlength="1000" show-word-limit placeholder="填写责任原因">${esc(d.reason)}</textarea>`,false,'',true)}</div>`}
  return {optionsDirty,optionAction,syncOptionDraft,contactForm,responsibilityForm};
}};
