/* Inventory UI uses existing PCUI islands; only inventory-specific layout lives here. */
window.StockPC=(()=>{
  const M=WeidStockModel,db=WeidStockStorage.create(),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pages={'stock-reports':'库存报表','stock-ledger':'出入库明细','stock-transfers':'库存调拨','stock-inbound':'物料入库','stock-outbound':'物料出库','stock-purchases':'采购管理','stock-tasks':'任务中心','stock-warehouses':'仓库管理','stock-products':'物料管理','stock-categories':'分类管理'};
  const state={active:false,route:'stock-reports',pages:{},layers:[],busy:false,error:null,exportRows:[],exportHeads:[],opener:null};
  const S={M,db,E,pages,state,views:{},drawers:{},actions:{},get data(){return db.current;},get page(){return state.pages[state.route]||(state.pages[state.route]={tab:'',filters:{},applied:{},page:1,size:10,selected:[]});},get top(){return state.layers.at(-1);}};
  S.button=(text,action,id='',extra='',cls='',disabled=false)=>'<button type="button" class="btn '+cls+'" data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(extra)+'"'+(disabled?' disabled':'')+'>'+E(text)+'</button>';
  S.link=(text,action,id='',extra='')=>S.button(text,action,id,extra,'text');
  S.input=(label,value,bind='',type='text',extra='')=>'<input type="'+type+'" aria-label="'+E(label)+'" value="'+E(value)+'"'+(bind?' data-stock-bind="'+E(bind)+'"':'')+(type==='number'?' min="0" step="0.001"':'')+' '+extra+'>';
  S.select=(label,options,value,bind='',extra='')=>'<select aria-label="'+E(label)+'" data-filterable'+(bind?' data-stock-bind="'+E(bind)+'"':'')+' '+extra+'>'+options.map(o=>{const [id,name]=Array.isArray(o)?o:[o,o];return '<option value="'+E(id)+'"'+((Array.isArray(value)?value.includes(id):String(value??'')===String(id))?' selected':'')+'>'+E(name)+'</option>';}).join('')+'</select>';
  S.check=(label,checked,action,id='',extra='')=>'<label><input type="checkbox" aria-label="'+E(label||'选择此行')+'" '+(checked?'checked':'')+' data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(extra)+'">'+E(label)+'</label>';
  S.field=(label,control,required=false)=>'<div class="field"><label class="'+(required?'required':'')+'">'+E(label)+'</label>'+control+'</div>';
  S.form=fields=>'<div class="ub-form">'+fields.join('')+'</div>';
  S.tag=status=>'<span class="pill '+(/^(已完成|完全入库|已出库|已采购|已收货|启用)$/.test(status)?'green':/拒绝|撤销|取消|作废|禁用/.test(status)?'red':'blue')+'">'+E(status)+'</span>';
  S.wh=id=>M.warehouse(S.data,id)?.name||'—';
  S.cat=id=>S.data.categories.find(x=>x.id===id)?.name||'—';
  S.whOptions=(empty=true)=>[...(empty?[['','全部']]:[]),...S.data.warehouses.map(x=>[x.id,x.name+(x.enabled?'':'（禁用）')])];
  S.productOptions=()=>[['','全部'],...S.data.products.map(x=>[x.id,x.name])];
  S.categoryOptions=()=>{
    const out=[['','全部']];function walk(parent,depth){S.data.categories.filter(x=>x.parent===parent).forEach(x=>{out.push([x.id,'　'.repeat(depth)+x.name]);walk(x.id,depth+1);});}walk('',0);return out;
  };
  S.table=(columns,rows,tableName='')=>'<div class="table-wrap"><table '+(tableName?'data-pc-table-name="'+E(tableName)+'" ':'')+'data-pc-align="left" data-pc-min-height="0"><thead><tr>'+columns.map(c=>'<th data-pc-min-width="'+(c[2]||110)+'">'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map((r,i)=>'<tr>'+columns.map(c=>'<td>'+c[1](r,i)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+columns.length+'">暂无符合条件的数据</td></tr>')+'</tbody></table></div>';
  S.exportable=(columns,rows)=>{state.exportHeads=columns.filter(x=>!x[3]).map(x=>String(x[0]).replace(/<[^>]*>/g,''));state.exportRows=rows.map((r,i)=>columns.filter(x=>!x[3]).map(x=>{const d=document.createElement('div');d.innerHTML=x[1](r,i);return d.textContent;}));};
  S.paged=(columns,rows,exportable=true,tableName='')=>{
    const p=S.page;p.page=Math.max(1,Math.min(p.page,Math.ceil(rows.length/p.size)||1));
    if(exportable)S.exportable(columns,rows);
    return S.table(columns,rows.slice((p.page-1)*p.size,p.page*p.size),tableName)+'<div data-pc-pager="'+E(JSON.stringify({total:rows.length,page:p.page,size:p.size,action:'stock',selected:p.selected.length}))+'"></div>';
  };
  S.panel=(title,content,actions='')=>'<section class="panel content-module"><div class="panel-head"><h2>'+E(title)+'</h2><div class="actions">'+actions+'</div></div>'+content+'</section>';
  S.tabs=(items,selected,action='tab',id='')=>'<div class="pc-tabs" role="tablist" aria-label="库存业务页签">'+items.map(x=>'<button type="button" class="pc-tab'+(selected===x?' active':'')+'" role="tab" aria-selected="'+(selected===x)+'" data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(x)+'">'+E(x)+'</button>').join('')+'</div>';
  S.layerSearch=controls=>'<section class="panel query-module" aria-label="当前抽屉搜索"><div class="filterbar">'+controls.join('')+'<div class="query-actions">'+S.button('重置','layerReset')+S.button('搜索','drawRefresh')+'</div></div></section>';
  S.filter=(label,key,type='text',options=[])=>{
    const value=S.page.filters[key]??'';
    if(type==='select'||type==='multi')return S.select(label,type==='multi'?options.filter(x=>!Array.isArray(x)||x[0]!==''):options,type==='multi'?(Array.isArray(value)?value:[]):value,'filter.'+key,type==='multi'?'multiple':'');
    if(type==='range')return '<div class="mr-date" data-pc-label="'+E(label)+'">'+S.input(label+'开始日期',S.page.filters[key+'From']||'','filter.'+key+'From','date')+'<span>至</span>'+S.input(label+'结束日期',S.page.filters[key+'To']||'','filter.'+key+'To','date')+'</div><div class="refund-quick">'+['上月','昨天','今天','本周','本月'].map(x=>S.button(x,'date',key,x,'text')).join('')+'</div>';
    return S.input(label,value,'filter.'+key,'text','placeholder="'+E(label)+'"');
  };
  S.search=controls=>'<section class="panel query-module" aria-label="搜索区"><form class="filterbar" data-stock-search>'+controls.join('')+'<div class="query-actions">'+S.button('重置','reset')+S.button('搜索','search','','','primary')+'</div></form></section>';
  S.matches=(value,query)=>!query||String(value??'').toLowerCase().includes(String(query).toLowerCase());
  S.chosen=(selection,value)=>Array.isArray(selection)?!selection.length||selection.includes(value):!selection||selection===value;
  S.inCategory=(category,selected)=>{if(!selected)return true;let id=category;while(id){if(id===selected)return true;id=S.data.categories.find(x=>x.id===id)?.parent;}return false;};
  S.inDate=(at,key,f=S.page.applied)=>!f[key+'From']&&!f[key+'To']||!!at&&(!f[key+'From']||at.slice(0,10)>=f[key+'From'])&&(!f[key+'To']||at.slice(0,10)<=f[key+'To']);
  S.filteredDocs=kind=>{
    const f=S.page.applied;
    return S.data.documents.filter(d=>d.kind===kind&&(!f.wid||d.wid===f.wid)&&(!f.to||d.to===f.to)&&(!f.status||d.status===f.status)&&(!f.type||d.type===f.type)&&S.matches(d.no,f.no)&&S.matches((d[f.personField||'createdBy']||'')+' '+(d.createdPhone||''),f.person)&&(!f.pid||d.lines.some(x=>x.pid===f.pid))&&S.inDate(d[f.dateField||(kind==='inbound'?'receivedAt':'createdAt')],'date')&&S.inDate(d.reviewAt,'review')&&S.inDate(d.verifiedAt,'verify')&&S.inDate(d.completedAt,'complete')&&S.inDate(d.shippedAt||d.completedAt,'out'));
  };
  S.open=(type,data={},title='',width=860)=>{
    if(!state.layers.length)state.opener=document.activeElement;
    state.layers.push({type,data:M.copy(data),title,width,revision:S.data.revision,error:'',selection:[],query:'',category:''});
    S.renderLayer(state.layers.length-1);
  };
  S.renderLayer=index=>{
    const l=state.layers[index];if(!l)return;const render=S.drawers[l.type];if(!render)throw Error('未找到库存页面：'+l.type);
    const content=render(l,index),id='stock-layer-'+index;
    syncDrawerLayer(document.querySelector('#mergeDrawers'),id,'<div class="merge-drawer-backdrop stock-module" data-stock-depth="'+index+'"><section id="'+id+'" class="merge-drawer ub-drawer stock-drawer" data-size="'+(l.width===560?'small':l.width===860?'medium':'large')+'" style="--archive-drawer-width:'+l.width+'px" role="dialog" aria-modal="true" aria-label="'+E(l.title)+'" tabindex="-1"><header class="merge-drawer-head"><h2>'+E(l.title)+'</h2><button type="button" class="icon-btn" aria-label="关闭'+E(l.title)+'" data-stock-action="close">'+icon('close')+'</button></header><div class="merge-drawer-body">'+content.body+'<p class="stock-error" role="alert">'+E(l.error)+'</p></div><footer class="merge-drawer-foot"><div class="actions">'+(content.footer||S.button('关闭','close'))+'</div></footer></section></div>');
    document.querySelectorAll('[data-stock-depth]').forEach(el=>{el.firstElementChild.inert=Number(el.dataset.stockDepth)!==state.layers.length-1;});
    syncDrawerInteraction();PCUI.sweep();requestAnimationFrame(()=>document.querySelector('#'+id)?.focus({preventScroll:true}));
  };
  S.close=()=>{
    const index=state.layers.length-1;if(index<0)return;
    const closing=state.layers.pop();syncDrawerLayer(document.querySelector('#mergeDrawers'),'stock-layer-'+index,'');
    const parent=document.querySelector('#stock-layer-'+(index-1));if(parent)parent.inert=false;
    if(closing.type==='tags'&&S.top?.type==='catalog')S.renderLayer(index-1);
    syncDrawerInteraction();setTimeout(()=>{if(parent)parent.focus({preventScroll:true});else state.opener?.isConnected&&state.opener.focus({preventScroll:true});},300);
  };
  S.fail=error=>{if(S.top){S.top.error=error.message;const el=document.querySelector('#stock-layer-'+(state.layers.length-1)+' .stock-error');if(el){el.textContent=error.message;el.scrollIntoView({block:'nearest'});}}else{state.error=error;S.render();}};
  S.run=async(command,payload,after,expected=S.top?.revision??S.data.revision)=>{
    if(state.busy)return;state.busy=true;
    try{const result=await db.commit(command,payload,expected);state.error=null;state.layers.forEach(l=>{if(l.revision===expected)l.revision=S.data.revision;});await after?.(result);S.render();toast('已保存');}
    catch(e){S.fail(e);}finally{state.busy=false;}
  };
  S.confirm=(title,message,action)=>PCUI.dialog({title,content:'<p>'+E(message)+'</p>',buttons:[{text:'取消',action:()=>PCUI.closeDialog()},{text:'确定',primary:true,action:()=>{PCUI.closeDialog();action();}}]});
  S.render=()=>{
    if(!state.active)return;
    const root=document.querySelector('#main');
    if(!S.data){root.innerHTML='<section class="panel"><div class="empty"><div>库存数据暂时无法加载</div><p>'+E(state.error?.message||'正在加载…')+'</p>'+S.button('重新加载','retry')+'</div></section>';return;}
    const content=S.views[state.route]?.()||'';
    root.innerHTML='<div class="stock-module ub-workspace"><div class="page-head"><h1>'+E(pages[state.route])+'</h1></div>'+(state.error?'<div class="stock-error" role="alert">'+E(state.error.message)+S.button('重新读取','reload')+'</div>':'')+content+'</div>';PCUI.sweep();
  };
  S.actions.close=()=>S.close();
  S.actions.tab=(id,value)=>{S.page.tab=value;S.page.page=1;S.page.selected=[];S.page.filters={};S.page.applied={};S.render();};
  S.actions.search=()=>{S.page.applied=M.copy(S.page.filters);S.page.page=1;S.page.selected=[];S.render();};
  S.actions.reset=()=>{S.page.filters={};S.page.applied={};S.page.page=1;S.page.selected=[];S.render();};
  S.actions.layerReset=()=>{for(const key of ['query','category','status'])if(Object.hasOwn(S.top.data,key))S.top.data[key]='';S.renderLayer(S.state.layers.length-1);};
  S.actions.date=(key,preset)=>{
    const d=new Date(),start=new Date(d);let end=new Date(d);
    if(preset==='昨天'){start.setDate(d.getDate()-1);end=new Date(start);}
    if(preset==='上月'){start.setMonth(d.getMonth()-1,1);end=new Date(d.getFullYear(),d.getMonth(),0);}
    if(preset==='本月'){start.setDate(1);end=new Date(d.getFullYear(),d.getMonth()+1,0);}
    if(preset==='本周')start.setDate(d.getDate()-(d.getDay()+6)%7);
    const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    S.page.filters[key+'From']=fmt(start);S.page.filters[key+'To']=fmt(end);S.render();
  };
  S.actions.selected=(id,extra,target)=>{const set=new Set(S.page.selected);target.checked?set.add(id):set.delete(id);S.page.selected=[...set];};
  S.actions.selectAll=(id,extra,target)=>{S.page.selected=target.checked?(S.visibleIds||[]):[];S.render();};
  S.actions.export=()=>StockExchange.download(pages[state.route],state.exportHeads,state.exportRows);
  S.actions.reload=async()=>{try{await db.read();state.error=null;S.render();}catch(e){S.fail(e);}};
  S.actions.retry=async()=>{try{await db.initialize();state.error=null;S.render();}catch(e){S.fail(e);}};
  function bind(event){
    const el=event.target.closest('[data-stock-bind]');if(!el||!el.closest('.stock-module'))return;
    const binding=el.dataset.stockBind,depth=el.closest('[data-stock-depth]')?.dataset.stockDepth,l=depth!==undefined?state.layers[Number(depth)]:null;
    let value=el.type==='checkbox'?el.checked:el.multiple?[...el.selectedOptions].map(x=>x.value):el.type==='number'?(el.value===''?'':Number(el.value)):el.value;
    if(binding.startsWith('filter.')){S.page.filters[binding.slice(7)]=value;return;}
    if(!l)return;
    const parts=binding.split('.');let obj=l.data;for(const part of parts.slice(0,-1)){if(!obj[part])obj[part]={};obj=obj[part];}obj[parts.at(-1)]=value;
  }
  document.addEventListener('input',bind);document.addEventListener('change',bind);
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-stock-action]');if(!el||!el.closest('.stock-module')||el.matches('input')||el.disabled||state.busy)return;
    event.preventDefault();try{const result=S.actions[el.dataset.stockAction]?.(el.dataset.stockId,el.dataset.stockExtra,el);if(result?.catch)result.catch(S.fail);}catch(e){S.fail(e);}
  });
  document.addEventListener('change',event=>{
    const el=event.target;if(el.matches('[data-stock-action]')&&el.closest('.stock-module'))try{const result=S.actions[el.dataset.stockAction]?.(el.dataset.stockId,el.dataset.stockExtra,el);if(result?.catch)result.catch(S.fail);}catch(e){S.fail(e);}
  });
  document.addEventListener('submit',event=>{if(event.target.matches('[data-stock-search]')){event.preventDefault();S.actions.search();}});
  document.addEventListener('keydown',event=>{
    if(!state.active)return;
    if(event.key==='Enter'&&event.target.closest('[data-stock-search]')&&event.target.tagName==='INPUT'){event.preventDefault();S.actions.search();}
    if(event.key==='Enter'&&event.target.closest('[data-stock-depth] .query-module')&&event.target.tagName==='INPUT'){event.preventDefault();S.actions.drawRefresh();}
    if(event.key==='Escape'&&state.layers.length&&!PCUI.isPopupOpen()&&!document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){event.preventDefault();event.stopImmediatePropagation();S.close();}
    if(event.key==='Tab'&&state.layers.length){const layer=document.querySelector('#stock-layer-'+(state.layers.length-1)),items=[...layer.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  },true);
  PCUI.registerPager('stock',(v)=>{S.page.page=v.currentPage;S.page.size=v.pageSize;S.page.selected=[];S.render();});
  db.subscribe(()=>{if(state.active&&!state.busy){S.render();if(S.top){S.top.error='库存数据已在其他页面更新。当前填写内容已保留，提交前请重新打开单据核对。';const el=document.querySelector('#stock-layer-'+(state.layers.length-1)+' .stock-error');if(el)el.textContent=S.top.error;}}});
  return S;
})();
