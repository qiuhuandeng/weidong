/* Native PC UI. Business elements, values and events remain the source of truth. */
window.PCUI = (() => {
  const scope='#main,#mergeDrawers,#modal',excluded='.phone,.mobile-stage,.ap-mobile-stage,.ap-sheet,[data-pc-native]';
  const adapters=[],cleanups=new Map(),controls=new WeakMap(),pagerActions=new Map(),failures=[];
  let sequence=0,scheduled=false,pendingTabFocus,popup,activeDialog;
  const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function node(tag,attributes={},children=[]) {
    const el=document.createElement(tag);
    for(const [name,value] of Object.entries(attributes)) {
      if(value==null||value===false)continue;
      if(name.startsWith('on')&&typeof value==='function')el.addEventListener(name.slice(2).toLowerCase(),value);
      else if(name==='class')el.className=value;
      else if(name==='text')el.textContent=value;
      else if(name==='html')el.innerHTML=value;
      else if(['checked','disabled','hidden','multiple','readOnly','indeterminate'].includes(name))el[name]=value;
      else el.setAttribute(name,value===true?'':String(value));
    }
    if(tag==='button'&&el.classList.contains('btn'))el.classList.add('pc-native-button');
    el.append(...(Array.isArray(children)?children:[children]).filter(child=>child!=null));return el;
  }
  const button=(label,action,extra={})=>node('button',{type:'button',class:'btn',text:label,onClick:action,...extra});
  function emit(source,type='change'){source.dispatchEvent(new Event(type,{bubbles:true}));}
  function wrap(source,kind){const host=node('span',{class:'pc-island pc-'+kind,'data-pc-ready':kind});source.before(host);host.append(source);return host;}
  function retain(source,host,visible,sync) {
    source.hidden=true;source.tabIndex=-1;source.classList.add('pc-native-value');source.setAttribute('aria-hidden','true');host.append(source);
    visible.id=(source.id||'pc-control-'+ ++sequence)+'-control';
    if(source.id)document.querySelectorAll('label').forEach(label=>{if(label.htmlFor===source.id)label.htmlFor=visible.id;});
    controls.set(source,{host,visible,sync});source.addEventListener('change',sync);
    source.addEventListener('invalid',event=>{event.preventDefault();visible.setAttribute('aria-invalid','true');visible.focus();message(source.validationMessage,{type:'error'});});
    const observer=new MutationObserver(sync);observer.observe(source,{attributes:true,childList:true,subtree:true,characterData:true});
    cleanups.set(host,()=>observer.disconnect());sync();
  }
  function closePopup(restore=false) {
    if(!popup)return;const current=popup;popup=null;
    current.box.remove();current.owner.setAttribute('aria-expanded','false');current.dispose?.();
    window.removeEventListener('resize',current.position);document.removeEventListener('scroll',current.position,true);
    if(restore&&current.owner.isConnected)current.owner.focus({preventScroll:true});
  }
  function openPopup(owner,content,{label='',role='dialog',width,dispose}={}) {
    closePopup();const box=node('div',{class:'pc-popover',role,'aria-label':label,id:'pc-popup-'+ ++sequence},content);
    document.body.append(box);owner.setAttribute('aria-expanded','true');owner.setAttribute('aria-controls',box.id);
    const position=()=>{
      if(!owner.isConnected){closePopup();return;}
      const r=owner.getBoundingClientRect();box.style.width=Math.min(width||Math.max(r.width,180),window.innerWidth-16)+'px';
      const height=box.getBoundingClientRect().height,below=window.innerHeight-r.bottom-8;
      box.style.left=Math.max(8,Math.min(r.left,window.innerWidth-box.offsetWidth-8))+'px';
      box.style.top=Math.max(8,below>=Math.min(height,240)?r.bottom+4:r.top-height-4)+'px';
      box.style.maxHeight=Math.max(120,Math.min(420,window.innerHeight-16))+'px';
    };
    popup={owner,box,position,dispose};position();window.addEventListener('resize',position);document.addEventListener('scroll',position,true);return box;
  }
  document.addEventListener('pointerdown',event=>{if(popup&&!popup.box.contains(event.target)&&!popup.owner.contains(event.target))closePopup();},true);
  document.addEventListener('keydown',event=>{
    if(!popup)return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();closePopup(true);return;}
    if(event.target.matches('.pc-calendar-day')&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
      const days=[...popup.box.querySelectorAll('.pc-calendar-day')],step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-7,ArrowDown:7}[event.key],target=days[days.indexOf(event.target)+step];
      event.preventDefault();if(target&&!target.disabled)target.focus();return;
    }
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key)||event.target.matches('input,textarea'))return;
    const items=[...popup.box.querySelectorAll('button:not(:disabled),[role=option]:not([aria-disabled=true])')].filter(el=>!el.hidden);
    if(!items.length)return;const i=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowUp'?-1:1)+items.length)%items.length;
    event.preventDefault();items[next].focus();
  },true);
  function menu(owner,actions,label) {
    owner.setAttribute('aria-haspopup','menu');owner.setAttribute('aria-expanded','false');
    const show=()=>{
      if(popup?.owner===owner){closePopup(true);return;}
      openPopup(owner,actions.map(action=>button(action.textContent,()=>{closePopup(true);action.click();},{class:'pc-menu-item',role:'menuitem',disabled:action.disabled})),{role:'menu',label});
    };
    owner.addEventListener('click',show);owner.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();show();popup?.box.querySelector('button:not(:disabled)')?.focus();}});
  }
  function actionMenu(source) {
    const actions=[...source.children].filter(el=>el.matches('button')&&!el.hidden);source.dataset.pcReady='menu';source.classList.add('pc-menu');
    if(!actions.length){source.hidden=true;return;}
    const owner=button((source.dataset.pcMenu||'更多')+' ▾');source.append(owner,node('span',{hidden:true},actions));menu(owner,actions,source.dataset.pcMenu||'更多');
  }
  function input(source) {
    if(source.type==='hidden'||source.type==='file')return;source.dataset.pcReady='input';source.classList.add('pc-control');
    if(source.tagName==='TEXTAREA'&&source.hasAttribute('show-word-limit')) {
      const host=wrap(source,'textarea'),count=node('span',{class:'pc-input-count'});host.append(count);
      const update=()=>count.textContent=source.value.length+(source.maxLength>=0?' / '+source.maxLength:'');source.addEventListener('input',update);update();
    }
    if(source.type==='number'&&source.hasAttribute('data-pc-stepper')) {
      const host=wrap(source,'number');
      const step=direction=>{
        if(source.disabled||source.readOnly)return;
        const amount=Number(source.step)>0?Number(source.step):1,min=source.min===''?-Infinity:Number(source.min),max=source.max===''?Infinity:Number(source.max);
        let value=(source.value===''?0:Number(source.value))+direction*amount;if(source.dataset.pcStepStrictly==='true')value=Math.round(value/amount)*amount;
        const precision=source.hasAttribute('data-pc-precision')?Number(source.dataset.pcPrecision):Math.max((String(amount).split('.')[1]||'').length,(source.value.split('.')[1]||'').length);
        source.value=String(Math.min(max,Math.max(min,Number(value.toFixed(Math.min(20,precision))))));emit(source,'input');emit(source);
      };
      const minus=button('−',()=>step(-1),{'aria-label':'减少'+(source.getAttribute('aria-label')||'数量'),class:'pc-step-button'}),plus=button('+',()=>step(1),{'aria-label':'增加'+(source.getAttribute('aria-label')||'数量'),class:'pc-step-button'});
      host.prepend(minus);host.append(plus);
      const sync=()=>{minus.disabled=source.disabled||source.readOnly||(source.value!==''&&source.min!==''&&Number(source.value)<=Number(source.min));plus.disabled=source.disabled||source.readOnly||(source.value!==''&&source.max!==''&&Number(source.value)>=Number(source.max));};
      source.addEventListener('change',()=>{
        if(source.value===''||source.disabled||source.readOnly)return;
        let value=Number(source.value),amount=Number(source.step)>0?Number(source.step):1;
        if(source.dataset.pcStepStrictly==='true')value=Math.round(value/amount)*amount;
        if(source.hasAttribute('data-pc-precision'))value=Number(value.toFixed(Math.max(0,Math.min(20,Number(source.dataset.pcPrecision)||0))));
        if(source.min!=='')value=Math.max(Number(source.min),value);if(source.max!=='')value=Math.min(Number(source.max),value);
        if(String(value)!==source.value){source.value=String(value);emit(source,'input');}sync();
      });
      controls.set(source,{host,visible:source,sync});source.addEventListener('input',sync);sync();
    }
  }
  function choice(source) {
    source.dataset.pcReady='choice';source.classList.add('pc-choice');const label=source.closest('label.switch');
    if(label){label.classList.add('pc-switch');if(!label.querySelector('span'))label.append(node('span',{'aria-hidden':'true'}));}
    if(source.dataset.pcIndeterminate==='true')source.indeterminate=true;
  }
  function select(source) {
    const focused=document.activeElement===source,host=wrap(source,'select');
    let refreshOptions;
    const owner=node(source.multiple?'div':'button',{...(source.multiple?{tabindex:0}:{type:'button'}),class:'pc-select-trigger',role:'combobox','aria-haspopup':'listbox','aria-expanded':'false','aria-label':source.getAttribute('aria-label')||source.name||'请选择'});
    const caption=node('span',{class:'pc-select-caption'});owner.append(caption,node('span',{class:'pc-select-arrow','aria-hidden':'true',text:'⌄'}));host.prepend(owner);
    const inline=!source.multiple&&!!host.closest('.query-module')&&/状态/.test(source.getAttribute('aria-label')||'');
    const group=node('span',{class:'pc-enum-options',role:'radiogroup','aria-label':owner.getAttribute('aria-label')});if(inline)host.prepend(group);
    function commit(option) {
      if(source.disabled||option.disabled)return;if(source.multiple)option.selected=!option.selected;else source.value=option.value;
      sync();emit(source,'input');emit(source);if(!source.multiple)closePopup(true);
    }
    function show() {
      if(source.disabled)return;if(popup?.owner===owner){closePopup(true);return;}
      const list=node('div',{class:'pc-select-options',role:'listbox','aria-multiselectable':String(source.multiple)}),search=node('input',{class:'pc-control pc-select-search',type:'search',placeholder:'请输入关键词','aria-label':'搜索选项'});
      function render() {
        const query=search.value.trim().toLowerCase();list.replaceChildren();
        for(const option of source.options){
          if(query&&!option.textContent.toLowerCase().includes(query))continue;
          const item=button(option.textContent,()=>{commit(option);if(source.multiple)render();},{class:'pc-select-option',role:'option','aria-selected':String(option.selected),disabled:option.disabled});
          if(source.multiple)item.prepend(node('span',{class:'pc-option-check'+(option.selected?' is-checked':''),'aria-hidden':'true'}));list.append(item);
        }
        if(!list.children.length)list.append(node('p',{class:'pc-select-empty',text:'暂无匹配选项'}));
      }
      search.addEventListener('input',render);render();openPopup(owner,[...(source.hasAttribute('data-filterable')||source.multiple?[search]:[]),list],{label:owner.getAttribute('aria-label'),dispose:()=>refreshOptions=null});refreshOptions=render;
      if(source.hasAttribute('data-filterable')||source.multiple)search.focus();else list.querySelector('[aria-selected=true]')?.focus();
    }
    function fitEnum() {
      if(!inline)return;const field=host.closest('.pc-search-item'),layout=host.closest('.pc-search-layout');if(!field||!layout)return;
      group.hidden=false;
      const required=[...group.children].reduce((sum,item)=>sum+item.getBoundingClientRect().width,0)+Math.max(0,group.children.length-1)*6+8;
      const width=source.options.length<=6?[280,320,400,480,560,640].find(size=>size>=required):null;
      const expanded=!!width&&layout.clientWidth-(field.querySelector('.pc-search-label')?.getBoundingClientRect().width||0)>=width;
      host.classList.toggle('pc-enum',expanded);owner.hidden=expanded;group.hidden=!expanded;field.style.setProperty('--pc-search-field-width',(expanded?width:280)+'px');
    }
    function sync() {
      caption.textContent=[...source.selectedOptions].map(option=>option.textContent).join('、')||source.getAttribute('placeholder')||'请选择';owner.disabled=source.disabled;host.classList.toggle('is-disabled',source.disabled);owner.setAttribute('aria-disabled',String(source.disabled));owner.setAttribute('aria-invalid',source.getAttribute('aria-invalid')||'false');
      if(source.multiple){
        host.classList.add('pc-select-multiple');owner.tabIndex=source.disabled?-1:0;caption.classList.add('pc-select-values');
        if(source.selectedOptions.length)caption.replaceChildren(...[...source.selectedOptions].map(option=>node('span',{class:'pc-select-tag'},[node('span',{text:option.textContent}),button('×',event=>{event.stopPropagation();commit(option);},{class:'pc-tag-close',disabled:source.disabled||option.disabled,'aria-label':'移除'+option.textContent})])));
      }
      if(inline){group.replaceChildren(...[...source.options].map(option=>button(option.textContent,()=>commit(option),{class:'pc-enum-option',role:'radio','aria-checked':String(option.selected),tabindex:option.selected?0:-1,disabled:source.disabled||option.disabled})));fitEnum();}
      if(source.disabled&&popup?.owner===owner)closePopup();else refreshOptions?.();
    }
    group.addEventListener('keydown',event=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      const options=[...source.options].filter(option=>!option.disabled);if(!options.length)return;event.preventDefault();
      const current=options.indexOf(source.selectedOptions[0]),index=event.key==='Home'?0:event.key==='End'?options.length-1:(current+(['ArrowLeft','ArrowUp'].includes(event.key)?-1:1)+options.length)%options.length;
      commit(options[index]);group.querySelector('[aria-checked=true]')?.focus({preventScroll:true});
    });
    owner.addEventListener('click',show);owner.addEventListener('keydown',event=>{if(event.key==='ArrowDown'||event.key==='ArrowUp'||source.multiple&&event.target===owner&&['Enter',' '].includes(event.key)){event.preventDefault();show();}});retain(source,host,owner,sync);
    if(inline&&typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(fitEnum);observer.observe(host.closest('.pc-search-layout')||host);const cleanup=cleanups.get(host);cleanups.set(host,()=>{cleanup?.();observer.disconnect();});}
    if(focused)owner.focus({preventScroll:true});
  }
  function date(source) {
    const host=wrap(source,'date'),type=source.type;
    const display=node('input',{type:'text',class:'pc-control pc-date-display',placeholder:source.getAttribute('placeholder')||source.getAttribute('aria-label')||(type==='time'?'选择时间':'选择日期'),'aria-label':source.getAttribute('aria-label')||source.name||'日期',autocomplete:'off'});
    const picker=button('',show,{class:'pc-date-open','aria-label':'打开'+(display.getAttribute('aria-label')),'aria-haspopup':'dialog'});
    picker.innerHTML='<svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v16H4z M4 10h16 M8 3v4 M16 3v4"/></svg>';host.prepend(display,picker);
    const pad=value=>String(value).padStart(2,'0'),key=d=>d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
    const valid=value=>!value||(!source.min||value>=source.min)&&(!source.max||value<=source.max);
    function commit(value,close=true){
      if(source.disabled||source.readOnly||!valid(value))return false;
      const before=source.value;source.value=value;
      if(value&&!source.value){source.value=before;return false;}
      display.setCustomValidity('');sync();emit(source,'input');emit(source);if(close){closePopup();if(display.isConnected)display.focus({preventScroll:true});}return true;
    }
    function sync(){display.value=source.value.replace('T',' ');display.disabled=source.disabled;display.readOnly=source.readOnly;picker.disabled=source.disabled||source.readOnly;display.setAttribute('aria-invalid',source.getAttribute('aria-invalid')||'false');}
    function typed(){const value=display.value.trim().replace(' ','T');if(!commit(value,false)){display.setCustomValidity('请输入有效日期，且在允许范围内');display.setAttribute('aria-invalid','true');}}
    display.addEventListener('change',typed);display.addEventListener('keydown',event=>{if(event.key==='Enter'){typed();closePopup();}if(event.key==='ArrowDown'){event.preventDefault();show();}});
    display.addEventListener('click',()=>{if(popup?.owner!==picker)show();});
    function show(){
      if(source.disabled||source.readOnly)return;if(popup?.owner===picker){closePopup();return;}
      const current=source.value?new Date(source.value.slice(0,10)+'T12:00'):new Date();
      let year=Number.isNaN(current.getTime())?new Date().getFullYear():current.getFullYear(),month=Number.isNaN(current.getTime())?new Date().getMonth():current.getMonth(),mode=type==='month'?'months':'days',draft=source.value;
      const content=node('div',{class:'pc-calendar'}),time=node('input',{type:'time',class:'pc-control','aria-label':'时间',value:type==='time'?source.value:source.value.slice(11,16)||'00:00'});
      const choose=value=>{draft=value;if(type==='datetime-local'){draft=value+'T'+(time.value||'00:00');render();}else commit(value);};
      function render(){
        content.replaceChildren();
        if(type!=='time'){
          const move=step=>{if(mode==='years')year+=step*12;else if(mode==='months')year+=step;else{month+=step;if(month<0){month=11;year--;}if(month>11){month=0;year++;}}render();};
          content.append(node('div',{class:'pc-calendar-head'},[button('«',()=>{year--;render();},{'aria-label':'上一年'}),button('‹',()=>move(-1),{'aria-label':'上一页'}),button(year+' 年',()=>{mode=mode==='years'?(type==='month'?'months':'days'):'years';render();},{class:'pc-calendar-heading'}),button(pad(month+1)+' 月',()=>{mode=mode==='months'?'days':'months';render();},{class:'pc-calendar-heading'}),button('›',()=>move(1),{'aria-label':'下一页'}),button('»',()=>{year++;render();},{'aria-label':'下一年'})]));
          if(mode==='years')content.append(node('div',{class:'pc-calendar-months'},Array.from({length:12},(_,i)=>{const value=Math.floor(year/12)*12+i;return button(value+'',()=>{year=value;mode='months';render();});})));
          else if(mode==='months')content.append(node('div',{class:'pc-calendar-months'},Array.from({length:12},(_,i)=>button((i+1)+' 月',()=>{month=i;if(type==='month')choose(year+'-'+pad(i+1));else{mode='days';render();}},{'aria-pressed':String(source.value.slice(0,7)===year+'-'+pad(i+1)),disabled:type==='month'&&!valid(year+'-'+pad(i+1))}))));
          else{
            const grid=node('div',{class:'pc-calendar-days',role:'grid','aria-label':'日期'});
            for(const day of ['日','一','二','三','四','五','六'])grid.append(node('span',{class:'pc-calendar-week',text:day,role:'columnheader'}));
            const first=new Date(year,month,1,12),start=1-first.getDay();
            for(let i=0;i<42;i++){
              const d=new Date(year,month,start+i,12),value=key(d),min=source.min.slice(0,10),max=source.max.slice(0,10);
              grid.append(button(String(d.getDate()),()=>choose(value),{class:'pc-calendar-day'+(d.getMonth()!==month?' is-other':'')+(value===key(new Date())?' is-today':''),role:'gridcell','aria-label':value,'aria-selected':String(value===(draft||source.value).slice(0,10)),disabled:!!(min&&value<min||max&&value>max)}));
            }content.append(grid);
          }
        }
        if(type==='time'||type==='datetime-local')content.append(node('label',{class:'pc-calendar-time'},['时间',time]));
        content.append(node('div',{class:'pc-calendar-foot'},[
          button('清空',()=>commit(''),{class:'btn text'}),
          button(type==='time'||type==='datetime-local'?'此刻':'今天',()=>{const d=new Date(),value=type==='month'?key(d).slice(0,7):type==='time'?pad(d.getHours())+':'+pad(d.getMinutes()):key(d)+(type==='datetime-local'?'T'+pad(d.getHours())+':'+pad(d.getMinutes()):'');commit(value);},{class:'btn text'}),
          ...(type==='time'||type==='datetime-local'?[button('确定',()=>commit(type==='time'?time.value:(draft||key(new Date())).slice(0,10)+'T'+(time.value||'00:00')),{class:'btn primary'})]:[])
        ]));
      }
      render();openPopup(picker,content,{label:display.getAttribute('aria-label'),width:320});
    }
    retain(source,host,display,sync);
  }
  function form(source) {
    if(source.dataset.pcForm||source.closest('[data-pc-ready]'))return;
    const fields=[...source.children].filter(el=>el.classList.contains('field'));
    if(!fields.length)return;
    if(fields.length!==source.children.length){
      let group;for(const child of [...source.children]){if(!child.classList.contains('field')){group=null;continue;}if(!group){group=node('div',{class:'pc-field-group'});child.before(group);}group.append(child);}source.querySelectorAll(':scope > .pc-field-group').forEach(form);return;
    }
    source.dataset.pcForm='true';source.classList.add('pc-form');
    if(source.closest('[data-size=small]')||source.classList.contains('pc-field-group')&&!source.closest('[data-pc-columns="2"]'))source.classList.add('pc-form-single');
    fields.forEach(field=>{
      field.classList.add('pc-form-item');
      const label=field.querySelector(':scope > label,:scope > .ub-label,:scope > .field-title,:scope > .ga-field-title');
      if(label){label.classList.add('pc-form-label');if(!label.textContent.trim().endsWith('：'))label.append('：');}
      const content=node('div',{class:'pc-field-content'});for(const child of [...field.childNodes])if(child!==label)content.append(child);field.append(content);
    });
  }
  function query(source) {
    if(source.dataset.pcQuery||source.closest(excluded))return;source.dataset.pcQuery='true';source.classList.add('pc-search-form');
    source.querySelectorAll(':scope > .seat-filter-line').forEach(group=>group.replaceWith(...group.childNodes));
    const search=[...source.querySelectorAll('button')].find(b=>b.textContent.trim()==='搜索'),reset=[...source.querySelectorAll('button')].find(b=>b.textContent.trim()==='重置');
    if(search){search.classList.add('primary');if(!search.querySelector('svg'))search.insertAdjacentHTML('afterbegin',icon('search'));}
    if(search&&reset&&search.parentElement===reset.parentElement)search.before(reset);
    const actions=source.querySelector('.query-actions')||source.querySelector('.actions:not(.seat-quick)');
    const layout=node('div',{class:'pc-search-layout'}),items=node('div',{class:'pc-search-items'}),extras=node('div',{class:'pc-query-extras'});
    let rangeField;
    for(const control of [...source.children]){
      if(control===actions)continue;
      if(control.matches('.refund-quick,.seat-quick,.rule-config-shortcuts')&&rangeField){
        const shortcuts=node('div',{class:'pc-query-shortcuts'},[...control.childNodes]);rangeField.append(shortcuts);control.remove();
        const owner=button('快捷日期 ▾',null,{class:'btn text pc-date-shortcut-menu','aria-label':'快捷日期'});rangeField.append(owner);menu(owner,[...shortcuts.querySelectorAll('button,a')],'快捷日期');continue;
      }
      const input=control.matches('input,select,button')?control:control.querySelector('input,select,button');
      if(!input||control.matches('.rule-config-shortcuts,.refund-quick,.seat-quick')||(control.tagName==='LABEL'&&input.type!=='date')||(control.tagName==='BUTTON'&&!input.getAttribute('aria-label'))){extras.append(control);continue;}
      let label=control.dataset.pcLabel||input.getAttribute('aria-label')||input.getAttribute('placeholder')||'';
      if(control.classList.contains('search')||label==='q')label='关键词';if(control.classList.contains('mr-date'))label=control.dataset.pcLabel||'日期';label=label.replace(/^(全部|筛选)/,'');if(!label||label.length>12)label=input.tagName==='SELECT'?'筛选':'关键词';
      if(!input.id)input.id='pc-query-'+ ++sequence;
      const range=control.querySelectorAll('input[type=date]').length>1,item=node('div',{class:'pc-search-item'}),content=node('div',{class:'pc-query-field'+(range?' pc-query-range':'')});
      item.append(node('label',{class:'pc-search-label',for:input.id,text:label+'：'}),content);items.append(item);
      if(control.tagName==='LABEL'){const box=node('div',{class:control.className},[...control.children]);control.remove();content.append(box);}else content.append(control);
      if(range)rangeField=content;
    }
    layout.append(items);if(extras.childNodes.length)layout.append(extras);
    if(actions){actions.classList.add('query-actions');layout.append(actions);}source.append(layout);
    const measure=()=>{const labels=[...items.querySelectorAll('.pc-search-label')];labels.forEach(label=>label.style.width='auto');const width=Math.ceil(Math.max(0,...labels.map(label=>label.getBoundingClientRect().width)));labels.forEach(label=>label.style.width=width+'px');};
    measure();if(document.fonts)document.fonts.ready.then(()=>source.isConnected&&measure());
  }
  function table(source) {
    if(source.dataset.pcTable||source.closest('[data-pc-ready],.seat-calendar'))return;
    const heads=[...source.querySelectorAll('thead th')];if(!heads.length)return;
    if([...source.querySelectorAll('[colspan],[rowspan]')].some(cell=>cell.hasAttribute('rowspan')||cell.colSpan!==heads.length||cell.parentElement.cells.length!==1))return;
    source.dataset.pcTable='true';
    const wrapper=source.parentElement,shop=wrapper.classList.contains('shop-list-table'),named=source.dataset.pcTableName;
    wrapper.classList.add('pc-table');wrapper.classList.toggle('pc-table-named',!!named);
    const scroll=node('div',{class:'pc-table-scroll'});source.before(scroll);scroll.append(source);
    if(!source.querySelector('tbody > tr')){const body=source.tBodies[0]||source.createTBody();body.append(node('tr',{},node('td',{colspan:heads.length,class:'pc-table-empty',text:'暂无符合条件的数据'})));}
    const fixed=()=>wrapper.classList.toggle('pc-table-wide',window.innerWidth>1024&&scroll.clientWidth>=1000);fixed();
    if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(fixed);observer.observe(scroll);cleanups.set(wrapper,()=>observer.disconnect());}
    source.style.textAlign=['left','center','right'].includes(source.dataset.pcAlign)?source.dataset.pcAlign:'center';
    scroll.style.minHeight=(source.hasAttribute('data-pc-min-height')?Math.max(0,Number(source.dataset.pcMinHeight)||0):160)+'px';
    if(source.dataset.pcScroll!=='parent')scroll.style.maxHeight=(shop?Math.max(260,window.innerHeight-310):720)+'px';
    let colgroup=source.querySelector('colgroup');if(!colgroup){colgroup=node('colgroup');source.prepend(colgroup);}while(colgroup.children.length<heads.length)colgroup.append(node('col'));
    const cols=[...colgroup.children],baseline=[],rows=[...source.querySelectorAll('tbody > tr')];
    heads.forEach((head,i)=>{
      const declared=cols[i].style.width||head.style.width;let width=declared.includes('%')?0:parseInt(declared)||0;
      if(shop)width=[48,60,70,150,120,250,100,90,130,140,95,95,85,120,95,110,90,100,230][i]||110;
      if(!width&&/^(序号|ID)$/.test(head.textContent.trim()))width=70;
      if(i===heads.length-1&&/操作/.test(head.textContent)){
        width=width||Math.max(150,Math.min(300,40+Math.max(0,...rows.map(row=>row.cells[i]?.querySelectorAll('button').length||0))*64));head.classList.add('pc-fixed-right');
        rows.forEach(row=>{if(row.cells.length===heads.length)row.cells[i].classList.add('pc-fixed-right');});
      }
      baseline[i]=width||Number(head.dataset.pcMinWidth)||110;cols[i].style.width=baseline[i]+'px';
    });
    const fit=()=>source.style.minWidth=cols.reduce((sum,col)=>sum+(parseFloat(col.style.width)||110),0)+'px';fit();
    let problem,storageWritable=true,stopDrag;
    function storageError(error){if(!problem){problem=node('p',{class:'pc-table-storage-error',role:'alert'});wrapper.after(problem);}problem.textContent='列宽配置未能保存或读取，原配置已保留：'+error.message;}
    if(named)try{const cached=JSON.parse(localStorage.getItem(named)||'[]');if(!Array.isArray(cached)||cached.some(value=>!value||!/^c\d+$/.test(value.field)||!Number.isFinite(Number(value.width))||Number(value.width)<=0))throw Error('列宽配置格式不兼容');for(const value of cached){const col=cols[Number(value.field.slice(1))];if(col)col.style.width=Number(value.width)+'px';}fit();}catch(error){storageWritable=false;storageError(error);}
    function save(){if(!named||!storageWritable)return;try{localStorage.setItem(named,JSON.stringify(cols.map((col,i)=>({field:'c'+i,width:parseFloat(col.style.width)}))));problem?.remove();problem=null;}catch(error){storageError(error);}}
    const cleanup=cleanups.get(wrapper);cleanups.set(wrapper,()=>{cleanup?.();stopDrag?.();problem?.remove();});
    heads.forEach((head,i)=>{
      const handle=node('span',{class:'pc-column-resize',role:'separator',tabindex:0,'aria-label':'调整'+head.textContent.trim()+'列宽','aria-orientation':'vertical'});head.append(handle);
      handle.addEventListener('pointerdown',event=>{
        if(event.button!==0)return;event.preventDefault();stopDrag?.();const x=event.clientX,width=head.getBoundingClientRect().width;
        const move=e=>{cols[i].style.width=Math.max(40,width+e.clientX-x)+'px';fit();};
        const stop=()=>{document.removeEventListener('pointermove',move);document.removeEventListener('pointerup',stop);document.removeEventListener('pointercancel',stop);stopDrag=null;if(source.isConnected)save();};stopDrag=stop;
        document.addEventListener('pointermove',move);document.addEventListener('pointerup',stop,{once:true});document.addEventListener('pointercancel',stop,{once:true});
      });
      handle.addEventListener('keydown',event=>{if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();cols[i].style.width=Math.max(40,parseFloat(cols[i].style.width)+(event.key==='ArrowRight'?10:-10))+'px';fit();save();});
    });
    if(named)wrapper.append(node('div',{class:'reset-button'},button('重置列宽',()=>{cols.forEach((col,i)=>col.style.width=baseline[i]+'px');fit();save();},{class:'btn text',disabled:!storageWritable})));
  }
  function drawPager(source,config,change) {
    source.dataset.pcReady='pager';source.classList.add('pc-pager');
    const total=Math.max(0,Number(config.total)||0),size=Math.max(1,Number(config.size)||10),pages=Math.max(1,Math.ceil(total/size)),page=Math.min(pages,Math.max(1,Number(config.page)||1));
    const send=(p,s=size)=>change({currentPage:Math.max(1,Math.min(Math.max(1,Math.ceil(total/s)),p)),pageSize:s});
    const content=node('div',{class:'pc-pager-content'});if(config.selected)content.append(node('span',{class:'pc-selection-summary',text:'已选 '+config.selected+' 项'}));
    content.append(node('span',{class:'pc-pager-total',text:'共 '+total+' 条'}),button('‹',()=>send(page-1),{class:'pc-page-button',disabled:page===1,'aria-label':'上一页'}));
    const included=new Set([1,pages,...Array.from({length:5},(_,i)=>page-2+i).filter(n=>n>0&&n<=pages)]);let previous=0;
    for(const p of [...included].sort((a,b)=>a-b)){
      if(previous&&p-previous>1)content.append(button('…',()=>send(p<page?page-5:page+5),{class:'pc-page-button','aria-label':p<page?'向前五页':'向后五页'}));
      content.append(button(String(p),()=>send(p),{class:'pc-page-button'+(p===page?' is-active':''),'aria-label':'第 '+p+' 页','aria-current':p===page?'page':null}));previous=p;
    }
    content.append(button('›',()=>send(page+1),{class:'pc-page-button',disabled:page===pages,'aria-label':'下一页'}));
    const sizes=node('select',{class:'pc-page-size','aria-label':'每页条数'},(config.sizes||[10,20,50,100]).map(s=>node('option',{value:s,text:s+'条/页'})));sizes.value=String(size);sizes.addEventListener('change',()=>send(1,Number(sizes.value)));
    const jump=node('input',{class:'pc-page-jump',type:'number',min:1,max:pages,value:page,'aria-label':'页'});jump.addEventListener('change',()=>send(Number(jump.value)||1));jump.addEventListener('keydown',event=>{if(event.key==='Enter'){event.preventDefault();send(Number(jump.value)||1);}});
    content.append(sizes,node('label',{class:'pc-pager-go'},['前往',jump,'页']));source.replaceChildren(content);
  }
  function pager(source){const config=JSON.parse(source.dataset.pcPager);drawPager(source,config,value=>{if(pagerActions.has(config.action))pagerActions.get(config.action)(value,config);else if(['shopPaging','turnPage','refundPaging','seatPaging','shopLogPage','seatSmartPage'].includes(config.action))UB[config.action](value.currentPage,value.pageSize);});}
  function legacyPager(source) {
    if(source.dataset.pcReady||source.dataset.pcPager)return;const total=Number(source.textContent.match(/共\s*(\d+)/)?.[1]);if(!Number.isFinite(total))return;
    const actions=[...source.querySelectorAll('[onclick]')].map(el=>el.getAttribute('onclick')).join(' ');let size,page,change;
    if(actions.includes('mrTurnPage(')){size=7;page=mrPage;change=mrTurnPage;}
    else if(actions.includes('mcTurn(')){size=6;page=mcPage;change=mcTurn;}
    else if(actions.includes('mgTurn(')){size=7;page=mgPageNo;change=mgTurn;}
    else if(actions.includes('pcCustomerTurn(')){size=8;page=pcPageNo;change=pcCustomerTurn;}
    else if(actions.includes('rvPage')){size=8;page=rvPage;change=p=>{rvPage=p;render();};}
    else if(actions.includes('pageNo')){size=7;page=pageNo;change=p=>{pageNo=p;render();};}
    else if(actions.includes('apTurn(')){size=10;page=apPage;change=p=>apTurn(p-apPage);}
    else if(actions.includes('UB.shopLogPage(')||actions.includes('UB.seatSmartPage(')){size=15;page=Number(source.textContent.match(/第\s*(\d+)/)?.[1]||1);change=p=>actions.includes('shopLogPage')?UB.shopLogPage(p):UB.seatSmartPage(p);}
    else if(!actions){size=Math.max(20,total);page=1;change=()=>{};}else return;
    const summary=source.querySelector('#mgSelectedSummary');drawPager(source,{total,size,page,sizes:[size]},value=>change(value.currentPage));if(summary)source.firstChild.prepend(summary);
  }
  function tabs(source) {
    if(source.matches('.ma-steps,.cl-steps'))return;const items=[...source.children].filter(el=>el.matches('button,[role=tab]'));if(!items.length)return;
    source.classList.add('pc-tabs');source.setAttribute('role','tablist');if(!source.hasAttribute('aria-label'))source.setAttribute('aria-label','业务视图');
    const next=source.nextElementSibling;source.classList.toggle('pc-tabs-with-search',!!(next&&(next.matches('.query-module,.filterbar')||next.firstElementChild?.matches('.query-module'))));
    items.forEach(item=>{item.classList.add('pc-tab');item.setAttribute('role','tab');if(item.tagName==='BUTTON')item.type='button';const selected=item.hasAttribute('aria-selected')?item.getAttribute('aria-selected')==='true':item.classList.contains('active');item.setAttribute('aria-selected',String(selected));item.tabIndex=selected?0:-1;});
    if(source.dataset.pcTabs)return;source.dataset.pcTabs='true';source.addEventListener('keydown',event=>{
      const current=event.target.closest('.pc-tab'),vertical=source.getAttribute('aria-orientation')==='vertical',previousKey=vertical?'ArrowUp':'ArrowLeft',nextKey=vertical?'ArrowDown':'ArrowRight';
      if(!current||current.parentElement!==source||current.hasAttribute('onkeydown')||![previousKey,nextKey,'Home','End'].includes(event.key))return;
      const enabled=[...source.children].filter(el=>el.matches('.pc-tab:not(:disabled)'));if(!enabled.length)return;event.preventDefault();
      const i=enabled.indexOf(current),target=event.key==='Home'?0:event.key==='End'?enabled.length-1:(i+(event.key===nextKey?1:-1)+enabled.length)%enabled.length,root=source.closest(scope);
      pendingTabFocus={root,index:root?[...root.querySelectorAll('.pc-tabs')].indexOf(source):-1};enabled[target].click();schedule();
    });
  }
  function register(selector,initialize){adapters.push([selector,initialize]);schedule();}
  function sweep() {
    scheduled=false;for(const [host,cleanup] of cleanups)if(!host.isConnected){cleanup();cleanups.delete(host);}if(popup&&!popup.owner.isConnected)closePopup();
    document.querySelectorAll(scope).forEach(root=>{
      root.querySelectorAll('.query-module .filterbar').forEach(query);
      root.querySelectorAll('.ap-query .ap-search').forEach(el=>{if(!el.dataset.pcQuery){el.classList.add('filterbar');el.parentElement.classList.add('query-module');query(el);}});
      root.querySelectorAll('[role=tablist],.page-tabs,.merge-rule-tabs,.ap-tabs,.mh-tabs,.mh-person-tabs,.tabs').forEach(el=>{if(!el.closest(excluded))tabs(el);});
      root.querySelectorAll('.ub-form,.rule-config-form,:is(div,section):has(> .field)').forEach(el=>{if(!el.closest(excluded))form(el);});
      root.querySelectorAll('.table-wrap > table').forEach(el=>{if(!el.closest(excluded))table(el);});
      root.querySelectorAll('[data-pc-pager]:not([data-pc-ready])').forEach(pager);
      root.querySelectorAll('.pagination:not([data-pc-ready])').forEach(el=>{if(!el.closest(excluded))legacyPager(el);});
      for(const [selector,initialize] of adapters)root.querySelectorAll(selector).forEach(el=>{
        if(!el.isConnected||el.closest(excluded)||el.closest('[data-pc-ready]'))return;
        try{initialize(el);}catch(error){failures.push(error.message);console.error('[PCUI]',error);throw error;}
      });
    });
    if(pendingTabFocus){const {root,index}=pendingTabFocus;pendingTabFocus=null;root?.querySelectorAll('.pc-tabs')[index]?.querySelector('[aria-selected=true]')?.focus({preventScroll:true});}
  }
  function schedule(){if(!scheduled){scheduled=true;queueMicrotask(sweep);}}
  function start(){document.querySelectorAll(scope).forEach(root=>new MutationObserver(schedule).observe(root,{childList:true,subtree:true}));sweep();}
  function syncControl(source){controls.get(source)?.sync();}
  document.addEventListener('reset',event=>{setTimeout(()=>event.target.querySelectorAll('input,select,textarea').forEach(syncControl),0);});
  function focusControl(source){(controls.get(source)?.visible||source)?.focus({preventScroll:true});}
  function message(text,{type='info',duration=4000}={}){const host=node('div',{class:'pc-message pc-message-'+type,role:'status'},[node('span',{text}),button('×',()=>host.remove(),{class:'pc-message-close','aria-label':'关闭提示'})]);document.body.append(host);setTimeout(()=>host.remove(),duration);}
  function disposeDialog(state){
    if(!state)return;clearTimeout(state.timer);state.host.remove();state.blocked.forEach(([el,inert])=>{if(el.isConnected)el.inert=inert;});if(activeDialog===state)activeDialog=null;
    syncDrawerInteraction();if(state.opener?.isConnected&&!state.opener.closest('[inert]'))state.opener.focus({preventScroll:true});
  }
  function dialog({title,content,footer='',wide=false,buttons}) {
    closePopup();if(activeDialog)disposeDialog(activeDialog);
    const host=node('div',{class:'pc-company-dialog show','data-overlay-layer':'modal'}),titleId='pc-dialog-title-'+ ++sequence;
    const panel=node('section',{class:'pc-dialog',role:'dialog','aria-modal':'true','aria-labelledby':titleId,tabindex:-1});panel.style.width=wide?'1120px':'600px';
    const state={host,panel,opener:document.activeElement,blocked:[...document.querySelectorAll('.ub-drawer')].map(el=>[el,el.inert])};activeDialog=state;state.blocked.forEach(([el])=>el.inert=true);
    const dismiss=()=>{if(typeof closeModal==='function')closeModal();else closeDialog();};
    panel.append(node('header',{class:'pc-dialog-header'},[node('h2',{id:titleId,text:title}),button('×',dismiss,{class:'pc-dialog-close','aria-label':'关闭弹窗'})]));
    const body=node('div',{class:'pc-dialog-body'},node('div',{class:'dialog-body',html:content})),foot=node('div',{class:'dialog-foot'});
    if(buttons)for(const spec of buttons)foot.append(button(spec.text,spec.action,{class:'btn'+(spec.primary?' primary':'')}));else foot.innerHTML=footer;
    body.append(foot);panel.append(body);host.append(panel);document.querySelector('#modal').append(host);syncDrawerInteraction();sweep();
    queueMicrotask(()=>{if(activeDialog===state)panel.focus({preventScroll:true});});
  }
  function closeDialog(){if(!activeDialog)return false;const state=activeDialog;if(state.timer)return true;closePopup();state.host.classList.add('is-closing');state.timer=setTimeout(()=>disposeDialog(state),300);return true;}
  function confirm({title,content,onConfirm}){dialog({title,content,buttons:[{text:'取消',action:closeDialog},{text:'确定',primary:true,action:async()=>{try{await onConfirm?.();closeDialog();}catch(error){message(error.message,{type:'error'});}}}]});}
  document.addEventListener('keydown',event=>{
    if(!activeDialog||popup||document.querySelector('.pc-richtext-frame.is-fullscreen'))return;
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();if(typeof closeModal==='function')closeModal();else closeDialog();}
    if(event.key==='Tab'){
      const items=[...activeDialog.panel.querySelectorAll('button:not(:disabled),input:not([hidden]):not(:disabled),textarea:not([hidden]):not(:disabled),[tabindex="0"]')].filter(el=>el.getClientRects().length);
      if(!items.length){event.preventDefault();return;}const first=items[0],last=items.at(-1);
      if(event.shiftKey&&(document.activeElement===first||document.activeElement===activeDialog.panel)){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
    }
  },true);
  register('button',source=>{if(!source.hasAttribute('type'))source.type='button';if(source.classList.contains('btn')&&!source.closest('.pc-tabs'))source.classList.add('pc-native-button');});
  register('[data-pc-menu]',actionMenu);register('input[type=checkbox],input[type=radio]',choice);
  register('input[type=date],input[type=time],input[type=month],input[type=datetime-local]',date);
  register('input[type=file][data-pc-upload]',source=>{const host=wrap(source,'upload'),owner=button(source.dataset.pcUpload||source.getAttribute('aria-label')||'选择文件',()=>source.click(),{disabled:source.disabled});host.prepend(owner);source.hidden=true;source.tabIndex=-1;controls.set(source,{host,visible:owner,sync:()=>owner.disabled=source.disabled});});
  register('select',select);register('input:not([type=hidden]):not([type=file]),textarea:not([data-pc-richtext])',input);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else queueMicrotask(start);
  return {version:'2.0.0',runtime:'native',register,sweep,schedule,form,query,table,confirm,dialog,closeDialog,isPopupOpen:()=>!!popup||!!document.querySelector('.pc-richtext-frame.is-fullscreen'),syncControl,focusControl,message,whenReady:()=>Promise.resolve().then(sweep),registerPager:(name,action)=>pagerActions.set(name,action),failures,dom:{node,button,escape,wrap,emit,openPopup,closePopup,menu,cleanups},get mountedCount(){return document.querySelectorAll('[data-pc-ready]').length;}};
})();
