/* Complaint option editing reuses the existing layered drawer and company adapters. */
window.PCModules['complaint-options']={render(){},create({dictionary,getLayers,getEditor,getRecords,responsibleOptions,assessmentChoices,multiValues,multiSelect,responsibilityRule,select,openLayer,closeLayer,refreshOptionConsumers,btn,link,esc,section,field,input,toast}){
  async function openOptions(){
    if(getLayers().length)return;
    const layer=openLayer('投诉配置','<p class="uc-muted">正在读取配置…</p>',btn('取消','dismiss'));
    layer.el.querySelector('.uc-drawer').dataset.size='small';
    layer.el.querySelector('.uc-drawer').style.setProperty('--archive-drawer-width','560px');
    try{
      const saved=await dictionary.read();if(!getLayers().includes(layer)||layer.closing)return;
      layer.options={draft:saved,baseline:JSON.stringify(saved),tab:'demands',entries:{demands:{index:null,name:''},types:{index:null,name:''}},saving:false};
      renderOptions(layer);
    }catch(error){if(getLayers().includes(layer)&&!layer.closing)layer.el.querySelector('.uc-drawer-body').innerHTML=`<div class="uc-error" role="alert">配置读取失败：${esc(error.message)}。原配置已保留，请关闭后重试。</div>`}
  }
  function optionsDirty(config){return JSON.stringify(config.draft)!==config.baseline||Object.entries(config.entries).some(([key,entry])=>entry.name!==(entry.index===null?'':config.draft[key][entry.index]))}
  function renderOptions(layer){
    const c=layer.options,key=c.tab,items=c.draft[key],entry=c.entries[key],busy=c.saving?'disabled':'';
    layer.el.querySelector('.uc-drawer-body').innerHTML=`<nav class="pc-tabs" role="tablist" aria-label="投诉配置字段">${Object.entries(dictionary.LABELS).map(([key,label])=>`<button type="button" class="pc-tab" id="uc-options-tab-${key}" role="tab" aria-selected="${key===c.tab}" aria-controls="uc-options-panel" tabindex="${key===c.tab?'0':'-1'}" data-uc="options-tab" data-key="${key}" ${busy}>${label}</button>`).join('')}</nav><div role="tabpanel" id="uc-options-panel" aria-labelledby="uc-options-tab-${key}">${section(entry.index===null?'新增'+dictionary.LABELS[key]:'编辑'+dictionary.LABELS[key],`<div class="ub-form">${field('optionName','选项名称',`<div class="uc-actions">${input('optionName',entry.name,'请输入选项名称','text',`maxlength="50" aria-label="选项名称" style="flex:1;min-width:0" ${busy}`)}${btn(entry.index===null?'添加':'确认修改','options-apply',busy,true)}${entry.index===null?'':btn('取消编辑','options-cancel-edit',busy)}</div>`,true,'',true)}</div>`)}<div class="table-wrap"><table data-pc-scroll="parent" data-pc-align="left" data-pc-min-height="0" aria-label="${dictionary.LABELS[key]}选项"><colgroup><col style="width:50px"><col><col style="width:190px"></colgroup><thead><tr><th>序号</th><th data-pc-min-width="160">选项名称</th><th>操作</th></tr></thead><tbody>${items.map((name,index)=>`<tr><td>${index+1}</td><td>${esc(name)}</td><td><div class="uc-actions">${link('编辑','options-edit',`data-index="${index}" ${busy}`)}${link('删除','options-remove',`data-index="${index}" ${busy}`)}${link('上移','options-move',`data-index="${index}" data-offset="-1" ${index===0||c.saving?'disabled':''}`)}${link('下移','options-move',`data-index="${index}" data-offset="1" ${index===items.length-1||c.saving?'disabled':''}`)}</div></td></tr>`).join('')}</tbody></table></div><p class="uc-help">保存后用于后续选择；改名或删除不会改写历史工单。可通过上移、下移调整下拉顺序。</p></div>`;
    layer.el.querySelector('.uc-drawer-foot').innerHTML=btn('取消','dismiss',busy)+btn(c.saving?'保存中…':'保存配置','options-save',busy,true);
    layer.oldFoot=null;
  }
  function applyOption(layer,key=layer.options.tab,render=true){
    const c=layer.options,entry=c.entries[key],items=c.draft[key],name=entry.name.trim();
    if(!name||name.length>50){toast('请输入 1–50 个字符的'+dictionary.LABELS[key]+'选项名称');return false}
    if(items.some((value,index)=>value===name&&index!==entry.index)){toast(dictionary.LABELS[key]+'已存在同名选项');return false}
    if(entry.index===null)items.push(name);else items[entry.index]=name;
    c.entries[key]={index:null,name:''};if(render)renderOptions(layer);return true;
  }
  async function saveOptions(layer){
    const c=layer.options;if(!c||c.saving)return;
    for(const key of Object.keys(dictionary.LABELS)){const entry=c.entries[key];if((entry.index!==null||entry.name)&&!applyOption(layer,key,false)){c.tab=key;renderOptions(layer);return}}
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
    if(action==='options-tab'){c.tab=button.dataset.key;renderOptions(layer);layer.el.querySelector('[aria-selected="true"]')?.focus({preventScroll:true})}
    else if(action==='options-save')saveOptions(layer);
    else if(action==='options-apply')applyOption(layer);
    else if(action==='options-cancel-edit'){c.entries[key]={index:null,name:''};renderOptions(layer)}
    else if(action==='options-edit'){
      if(entry.name!==(entry.index===null?'':items[entry.index])){toast('请先确认当前选项修改，或取消编辑');return}
      c.entries[key]={index,name:items[index]};renderOptions(layer);
    }else if(action==='options-remove'){
      if(items.length===1){toast(dictionary.LABELS[key]+'至少保留一个选项');return}
      PCUI.confirm({title:'删除选项',content:`确定删除“${esc(items[index])}”？保存配置后生效，历史工单保持原值。`,onConfirm:()=>{
        if(!getLayers().includes(layer)||layer.closing)return;
        items.splice(index,1);if(entry.index===index)c.entries[key]={index:null,name:''};else if(entry.index>index)entry.index--;
        renderOptions(layer);
      }});
    }else if(action==='options-move'){
      const target=index+Number(button.dataset.offset);if(target<0||target>=items.length)return;
      [items[index],items[target]]=[items[target],items[index]];
      if(entry.index===index)entry.index=target;else if(entry.index===target)entry.index=index;
      renderOptions(layer);
    }
  }
  function syncOptionDraft(el){const c=getLayers().at(-1)?.options;if(!c||c.saving||el.name!=='optionName')return false;c.entries[c.tab].name=el.value;return true}
  function contactForm(){const d=getEditor().draft,contacts=responsibleOptions([d.firstContact,...getRecords().map(r=>r.firstContact)].filter(Boolean));return `<div class="uc-grid ub-form" data-pc-columns="2">${field('firstContact','第一联系人',select('firstContact',contacts,d.firstContact,'请选择员工，支持姓名搜索','data-filterable'),false)}${field('contactTime','投诉时间',input('contactTime',d.contactTime,'客户陈述的投诉时间','datetime-local'),false)}${field('customerDemand','客户诉求',select('customerDemand',dictionary.options('demands',d.customerDemand),d.customerDemand,'请选择客户诉求','data-filterable'),false,'',true)}${field('customerStatement','客户陈述',`<textarea id="uc-customerStatement" name="customerStatement" class="uc-input" rows="3" maxlength="500" show-word-limit placeholder="补充客户原话（选填）">${esc(d.customerStatement)}</textarea>`,false,'',true)}</div>`}
  function responsibilityForm(){const d=getEditor().draft,hasDepartment=multiValues(d.department).length>0,closed=d.type==='闭店';return `<div class="ub-form">${field('department','责任部门',assessmentChoices('department','责任部门',['推广','销售','门店'],d.department,true),true,'',true)}${field('type','售后类型',select('type',dictionary.options('types',d.type),d.type,hasDepartment?'请选择售后类型':'请先选择责任部门',`required aria-required="true" ${hasDepartment?'':'disabled'}`),true,'',true)}<div class="uc-full uc-rule" ${responsibilityRule(d.type)?'':'hidden'}><span>归因参考：</span><span id="uc-rule-text">${responsibilityRule(d.type)}</span></div>${field('responsible','责任人',multiSelect('responsible','责任人',responsibleOptions(d.responsible),d.responsible,hasDepartment&&d.type&&!closed?'required aria-required="true"':'disabled'),true,'',true).replace('data-field="responsible"','data-field="responsible"'+(closed?' hidden':''))}${field('reason','责任原因',`<textarea id="uc-reason" name="reason" class="uc-input" rows="3" maxlength="1000" show-word-limit placeholder="填写责任原因">${esc(d.reason)}</textarea>`,false,'',true)}</div>`}
  return {optionsDirty,optionAction,syncOptionDraft,contactForm,responsibilityForm};
}};
