/* Native tree, cascading selection and expanded filters. Business owns values. */
(() => {
  const {node,button,emit}=PCUI.dom;
  const send=(source,type,detail)=>source.dispatchEvent(new CustomEvent(type,{bubbles:true,detail}));
  PCUI.register('[data-pc-tree]',source=>{
    const config=JSON.parse(source.dataset.pcTree),expanded=new Set(config.expanded||[]);let value=config.value;
    source.dataset.pcReady='tree';source.classList.add('pc-tree');source.setAttribute('role','tree');source.setAttribute('aria-label',config.label||'分类');
    function render(){
      const walk=(nodes,depth=0)=>nodes.flatMap(item=>{
        const branch=!!item.children?.length,row=node('div',{class:'pc-tree-row',role:'treeitem','aria-level':depth+1,'aria-selected':String(item.value===value),'aria-expanded':branch?String(expanded.has(item.value)):null});row.style.paddingLeft=(depth*18)+'px';
        const toggle=()=>{expanded.has(item.value)?expanded.delete(item.value):expanded.add(item.value);send(source,'pc-tree-expand',[...expanded]);if(source.isConnected)render();};
        row.append(branch?button(expanded.has(item.value)?'▾':'▸',toggle,{class:'pc-tree-toggle','aria-label':(expanded.has(item.value)?'收起':'展开')+item.label}):node('span',{class:'pc-tree-spacer'}));
        const label=button(item.label,()=>{value=item.value;send(source,'pc-tree-select',value);if(source.isConnected)render();},{class:'pc-tree-label',disabled:item.disabled,tabindex:item.value===value?0:-1});row.append(label);
        label.addEventListener('keydown',event=>{
          const rows=[...source.querySelectorAll('.pc-tree-label:not(:disabled)')],index=rows.indexOf(label);
          if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();rows[event.key==='Home'?0:event.key==='End'?rows.length-1:Math.max(0,Math.min(rows.length-1,index+(event.key==='ArrowDown'?1:-1)))]?.focus();}
          else if(branch&&(event.key==='ArrowRight'&&!expanded.has(item.value)||event.key==='ArrowLeft'&&expanded.has(item.value))){event.preventDefault();toggle();}
        });
        return [row,...(branch&&expanded.has(item.value)?walk(item.children,depth+1):[])];
      });
      source.replaceChildren(...walk(config.nodes));if(!source.querySelector('[tabindex="0"]'))source.querySelector('.pc-tree-label')?.setAttribute('tabindex','0');
    }render();
  });
  PCUI.register('[data-pc-hierarchy]',source=>{
    const config=JSON.parse(source.dataset.pcHierarchy),entity=config.entityLabel||'部门';let selected=[...(config.value||[])],query=config.query||'',path=[];
    const all=[],leaves=item=>item.children?.length?item.children.flatMap(leaves):item.disabled?[]:[item.value];
    const walk=(nodes,parents=[])=>nodes.forEach(item=>{const names=[...parents,item.label];if(item.children?.length)walk(item.children,names);else if(!item.disabled)all.push({...item,path:names.join(' / ')});});walk(config.nodes);
    const compact=nodes=>nodes.flatMap(item=>{const ids=leaves(item);return ids.length&&ids.every(id=>selected.includes(id))?[item]:item.children?.length?compact(item.children):[];});
    const filtered=()=>{const terms=query.trim().toLowerCase().split(/[\n,，;；\s]+/).filter(Boolean);return all.filter(item=>!terms.length||terms.some(term=>item.path.toLowerCase().includes(term)));};
    source.dataset.pcReady='hierarchy';source.classList.add('pc-hierarchy');
    const search=node('input',{class:'pc-control',type:'search',value:query,placeholder:'请输入名称搜索','aria-label':entity+'名称'}),allCheck=node('input',{type:'checkbox',class:'pc-choice','aria-label':'全选'}),allCaption=node('span',{text:'全选'});
    const body=node('div',{class:'pc-hierarchy-columns'}),selectedList=node('div',{class:'pc-hierarchy-selected-list'}),count=node('span');
    const update=next=>{selected=[...new Set(next)];render();send(source,'pc-hierarchy-change',selected);};
    const toggle=(item,checked)=>{const ids=leaves(item),next=new Set(selected);ids.forEach(id=>checked?next.add(id):next.delete(id));update([...next]);};
    const checkbox=(item,label)=>{
      const ids=leaves(item),checked=ids.length>0&&ids.every(id=>selected.includes(id)),input=node('input',{type:'checkbox',class:'pc-choice',checked,disabled:item.disabled||!ids.length,indeterminate:!checked&&ids.some(id=>selected.includes(id)),'aria-label':label});
      input.addEventListener('change',()=>toggle(item,input.checked));return input;
    };
    function render(){
      const matches=filtered();allCheck.checked=matches.length>0&&matches.every(item=>selected.includes(item.value));allCheck.indeterminate=!allCheck.checked&&matches.some(item=>selected.includes(item.value));allCaption.textContent=query?'全选搜索结果':'全选';body.replaceChildren();
      if(query){body.className='pc-hierarchy-results';for(const item of matches)body.append(node('label',{class:'pc-hierarchy-result'},[checkbox(item,item.path),node('span',{text:item.path})]));if(!matches.length)body.append(node('p',{class:'pc-empty',text:'暂无匹配'+entity}));}
      else{
        body.className='pc-hierarchy-columns';let nodes=config.nodes,depth=0;
        while(nodes?.length){
          const column=node('div',{class:'pc-hierarchy-column',role:'group','aria-label':'第 '+(depth+1)+' 级'}),level=depth;
          for(const item of nodes){const row=node('div',{class:'pc-hierarchy-row'+(path[level]===item.value?' is-active':'')});row.append(checkbox(item,item.label));
            const label=button(item.label+(item.children?.length?' ›':''),()=>{if(item.children?.length){path=path.slice(0,level);path.push(item.value);render();}else toggle(item,!selected.includes(item.value));},{class:'pc-hierarchy-label',disabled:item.disabled});row.append(label);column.append(row);}
          body.append(column);nodes=nodes.find(item=>item.value===path[depth])?.children;depth++;
        }
      }
      const values=compact(config.nodes);count.textContent='已选（'+values.length+'）';selectedList.replaceChildren();
      for(const item of values)selectedList.append(node('span',{class:'pc-selected-tag'},[node('span',{text:item.label}),button('×',()=>toggle(item,false),{class:'pc-tag-close','aria-label':'移除'+item.label})]));
      if(!values.length)selectedList.append(node('p',{class:'pc-empty',text:'暂无选中项'}));
    }
    search.addEventListener('input',()=>{query=search.value;render();send(source,'pc-hierarchy-query',query);});
    allCheck.addEventListener('change',()=>{const next=new Set(selected);filtered().forEach(item=>allCheck.checked?next.add(item.value):next.delete(item.value));update([...next]);});
    const batch=button('批量输入',()=>PCUI.dialog({title:'批量搜索'+entity,content:'<textarea class="pc-control" id="pc-batch-query" rows="6" aria-label="批量名称" placeholder="多个名称用换行、逗号、分号、空格分隔"></textarea>',buttons:[{text:'取消',action:PCUI.closeDialog},{text:'查询',primary:true,action:()=>{query=document.querySelector('#pc-batch-query').value;search.value=query;render();send(source,'pc-hierarchy-query',query);PCUI.closeDialog();}}]}),{class:'btn text'});
    source.replaceChildren(node('div',{class:'pc-hierarchy-layout'},[
      node('div',{class:'pc-hierarchy-picker'},[node('div',{class:'pc-hierarchy-search'},[node('label',{class:'pc-hierarchy-search-field'},[entity+'名称：',search]),batch,node('label',{},[allCheck,allCaption])]),body]),
      node('aside',{class:'pc-hierarchy-selected','aria-label':'已选'+entity},[node('div',{class:'pc-hierarchy-selected-head'},[count,button('清除',()=>update([]),{class:'btn text'})]),selectedList])
    ]));render();
  });
  PCUI.register('[data-pc-options]',source=>{
    const config=JSON.parse(source.dataset.pcOptions);source.dataset.pcReady='options';source.classList.add('pc-option-filters');source.replaceChildren();
    for(const item of config){let selected=[...(item.value||[])],expanded=!!item.expanded;
      const row=node('div',{class:'pc-option-filter-row'}),line=node('div',{class:'pc-option-filter-line'}),values=node('div',{class:'pc-option-filter-values'});
      const change=value=>{selected=value;render();send(source,'pc-options-change',{key:item.key,value});};
      const all=button('全部',()=>change([]),{class:'pc-check-tag'}),more=button(expanded?'收起':'展开',()=>{expanded=!expanded;render();send(source,'pc-options-expand',{key:item.key,value:expanded});},{class:'btn text'});
      function render(){all.setAttribute('aria-pressed',String(!selected.length));values.classList.toggle('is-expanded',expanded);values.replaceChildren(...item.options.map(option=>button(option.label,()=>change(selected.includes(option.value)?selected.filter(v=>v!==option.value):[...selected,option.value]),{class:'pc-check-tag','aria-pressed':String(selected.includes(option.value))})));more.textContent=expanded?'收起':'展开';more.setAttribute('aria-expanded',String(expanded));}
      line.append(all,values);if(item.options.length>6)line.append(more);row.append(node('span',{class:'pc-search-label',text:item.label+'：'}),line);source.append(row);render();
    }
  });
})();
