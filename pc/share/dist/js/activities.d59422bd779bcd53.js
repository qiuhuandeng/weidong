window.PCModules.activities=(()=>{
  'use strict';
  const M=WeidActivityModel,D=PCModules['activity-data'],db=D.store,E=esc;
  const state={active:false,status:'全部',filters:{},applied:{},page:1,size:20,layers:[],busy:false,error:''};
  const call=(a,...args)=>'PCModules.activities.run('+[a,...args].map(x=>JSON.stringify(x)).join(',')+')';
  const B=(t,a,args=[],cls='')=>btn(E(t),call(a,...args),cls);
  const I=(label,name,value='',type='text',extra='')=>'<input aria-label="'+E(label)+'" name="'+E(name)+'" type="'+type+'" value="'+E(value)+'" '+extra+'>';
  const C=(label,name,options,value,extra='')=>select(options,value,'aria-label="'+E(label)+'" name="'+name+'" '+extra);
  const T=(heads,rows)=>table(heads,rows.length?rows:[heads.map((_,i)=>i?'':'暂无符合条件的数据')]).replace('<table>','<table data-pc-align="left" data-pc-min-height="0" data-pc-scroll="parent">');
  const section=(title,html,actions='')=>'<section class="activity-section"><div class="activity-section-head"><h3>'+E(title)+'</h3><div class="actions">'+actions+'</div></div>'+html+'</section>';
  const catalog=()=>M.catalog(StockPC.data),stores=()=>WeidSalesModel.storeCatalog(StockPC.data).filter(x=>x.enabled),rows=()=>db.current?.activities||[];
  const itemName=x=>E(x.name)+'<div class="activity-muted">'+E(x.specName)+'</div>';
  const moneyText=v=>'¥'+Number(v||0).toFixed(2);
  const stateTag=a=>badge(M.status(a),M.status(a)==='进行中'?'green':M.status(a)==='未开始'?'blue':'gray');
  const limits=[['none','不限购'],['times','每人限购次数'],['quantity','每人每规格限购数量']];
  function capture(){
    const l=state.layers.at(-1);if(!l||l.type!=='edit')return;
    const form=document.querySelector('#activity-form');if(!form)return;
    const v=Object.fromEntries(new FormData(form));for(const k of ['name','start','end','audience','limitMode','note'])l.value[k]=v[k]??l.value[k];
    l.value.limitValue=Number(v.limitValue||1);l.value.items.forEach((x,i)=>{if(v['price-'+i]!==undefined)x.activityPrice=v['price-'+i];});
  }
  function render(){
    if(!state.active)return;
    if(!db.current||!StockPC.data){document.querySelector('#main').innerHTML=contentModule('活动管理','<p role="alert">'+E(state.error||D.error?.message||'活动数据暂时无法读取')+'</p>',B('重新读取','reload'));return;}
    const f=state.applied,list=rows().filter(a=>(state.status==='全部'||M.status(a)===state.status)&&(!f.name||a.name.includes(f.name))&&(!f.product||a.items.some(x=>(x.name+x.specName).includes(f.product)))&&(!f.store||a.stores.some(s=>s.id===f.store))&&(!f.audience||a.audience===f.audience)&&(!f.from||a.end.slice(0,10)>=f.from)&&(!f.to||a.start.slice(0,10)<=f.to));
    state.page=Math.min(state.page,Math.max(1,Math.ceil(list.length/state.size)));
    const p=state.filters,controls=I('活动名称','name',p.name)+I('活动商品','product',p.product)+C('活动门店','store',[['','全部'],...stores().map(s=>[s.id,s.name])],p.store||'')+C('参与限制','audience',[['','全部'],'不限','新客','老客'],p.audience||'')+'<div class="mr-date" data-pc-label="活动日期">'+I('开始日期','from',p.from,'date')+'<span>至</span>'+I('结束日期','to',p.to,'date')+'</div>';
    const tabs=pageTabs(['全部','未开始','进行中','已结束'].map(s=>[s,s,call('status',s)]),state.status,'活动状态');
    const search=queryModule(controls,call('search'),call('reset')).replace('<div class="filterbar">','<form id="activity-search" class="filterbar">').replace('</div></section>','</form></section>');
    const tableRows=list.slice((state.page-1)*state.size,state.page*state.size).map((a,i)=>[String((state.page-1)*state.size+i+1),B(a.name,'view',[a.id],'text'),E(a.start.replace('T',' '))+'<br>'+E(a.end.replace('T',' ')),E(a.audience),a.items.length,a.stores.length<=2?a.stores.map(s=>E(s.name)).join('<br>'):E(a.stores[0].name)+' 等 '+a.stores.length+' 家',stateTag(a),'<div class="actions">'+B('查看','view',[a.id],'text')+(M.status(a)==='未开始'?B('编辑','edit',[a.id],'text'):'')+B('复制','copy',[a.id],'text')+(M.status(a)!=='已结束'?B(M.status(a)==='未开始'?'取消':'结束','end',[a.id],'text'):'')+'</div>']);
    const pager='<div data-pc-pager="'+E(JSON.stringify({total:list.length,page:state.page,size:state.size,action:'activities'}))+'"></div>';
    document.querySelector('#main').innerHTML='<div class="pc-page-activities">'+tabs+search+(state.error?'<p role="alert">'+E(state.error)+'</p>':'')+contentModule('活动管理',T(['序号','活动名称','活动时间','参与限制','商品规格数','活动门店','状态','操作'],tableRows)+pager,B('新建活动','edit',[],'primary'))+'</div>';PCUI.sweep();
  }
  function open(type,value,title,width=1120){capture();state.layers.push({type,value:M.copy(value),title,width,opener:document.activeElement,revision:db.current.revision,error:'',query:'',selected:[]});draw();}
  function close(){const l=state.layers.pop();if(!l)return;syncDrawerLayer(document.querySelector('#mergeDrawers'),'activity-'+state.layers.length,'');const parent=document.querySelector('#activity-panel-'+(state.layers.length-1));if(parent)parent.inert=false;syncDrawerInteraction();setTimeout(()=>{if(parent)parent.focus({preventScroll:true});else l.opener?.isConnected&&l.opener.focus({preventScroll:true});},300);}
  function draw(){
    const l=state.layers.at(-1);if(!l)return;const index=state.layers.length-1;let html='',foot=B('关闭','close');
    if(l.type==='edit'){
      const a=l.value;html='<form id="activity-form">'+section('活动信息','<div class="pc-form">'+field('活动名称',I('活动名称','name',a.name,'text','maxlength="60"'),true)+field('参与限制',C('参与限制','audience',['不限','新客','老客'],a.audience),true)+field('开始时间',I('开始时间','start',a.start,'datetime-local'),true)+field('结束时间',I('结束时间','end',a.end,'datetime-local'),true)+field('限购设置',C('限购设置','limitMode',limits,a.limitMode,'data-activity-limit'))+(a.limitMode!=='none'?field(a.limitMode==='times'?'限购次数':'限购数量',I('限购值','limitValue',a.limitValue,'number','min="1" step="1"'),true):'')+field('叠加优惠','<span>允许叠加其他优惠</span>')+field('活动说明','<textarea name="note" aria-label="活动说明" rows="2">'+E(a.note||'')+'</textarea>')+'</div>')+
        section('活动门店',a.stores.length?'<div>已选择 '+a.stores.length+' 家门店</div>':'<p class="activity-muted">请选择参与活动的门店</p>',B('选择门店','stores'))+
        section('活动商品',T(['产品 / 规格','原价','底价','活动价','操作'],a.items.map((x,i)=>[itemName(x),moneyText(x.normalPrice),moneyText(x.floorPrice),I(x.name+' 活动价','price-'+i,x.activityPrice,'number','min="'+x.floorPrice+'" step="0.01"'),B('移除','remove',[i],'text')])),B('添加商品','products'))+'</form>';
      foot=B('取消','close')+B('保存并发布','save',[],'primary');
    }else if(l.type==='stores'){
      html='<div data-activity-stores data-pc-hierarchy="'+E(JSON.stringify({nodes:WeidSalesModel.storeTree(StockPC.data),value:l.selected,query:l.query,entityLabel:'门店'}))+'"></div>';
      foot=B('取消','close')+B('确定选择','confirmStores',[],'primary');
    }else if(l.type==='products'){
      const list=catalog().filter(x=>x.enabled&&(!l.query||(x.name+x.specName).includes(l.query)));
      html=queryModule(I('产品名称 / 规格','query',l.query),call('productSearch'),call('productReset'))+T(['选择','产品 / 规格','类型','原价','底价'],list.map(x=>['<input type="checkbox" aria-label="选择 '+E(x.name+' '+x.specName)+'" data-activity-product="'+E(x.key)+'" '+(l.selected.includes(x.key)?'checked':'')+'>',itemName(x),E(x.type),moneyText(x.normalPrice),moneyText(x.floorPrice)]));
      foot=B('取消','close')+B('确定选择','confirmProducts',[],'primary');
    }else{
      const a=rows().find(x=>x.id===l.value.id)||l.value;
      html=section('活动信息','<div class="activity-detail">'+kv({'活动名称':E(a.name),'活动状态':stateTag(a),'活动时间':E(a.start.replace('T',' ')+' 至 '+a.end.replace('T',' ')),'参与限制':E(a.audience),'限购设置':E(M.limitText(a)),'叠加优惠':'允许','活动说明':E(a.note||'—'),...(a.endedAt?{'实际结束':E(a.endedAt.replace('T',' '))}:{})})+'</div>')+
        section('活动门店','<div class="activity-store-list">'+a.stores.map(s=>'<span>'+E(s.name)+'</span>').join('')+'</div>')+
        section('活动商品',T(['产品 / 规格','原价','底价','活动价','参与状态','操作'],a.items.map((x,i)=>[itemName(x),moneyText(x.normalPrice),moneyText(x.floorPrice),moneyText(x.activityPrice),x.participating===false?'已停止':'参与活动',M.status(a)==='进行中'&&x.participating!==false?B('停止参与','stopItem',[a.id,i],'text'):'—'])))+
        section('操作记录',T(['时间','操作','操作人'],[...(a.logs||[])].reverse().map(x=>[E(x.at.replace('T',' ')),E(x.action),E(x.actor)])));
      foot=B('关闭','close')+B('复制活动','copy',[a.id]);
    }
    syncDrawerLayer(document.querySelector('#mergeDrawers'),'activity-'+index,'<div class="merge-drawer-backdrop pc-page-activities" data-activity-layer="'+index+'"><section class="merge-drawer ub-drawer" id="activity-panel-'+index+'" data-size="'+(l.width===860?'medium':'large')+'" style="--archive-drawer-width:'+l.width+'px" role="dialog" aria-modal="true" aria-label="'+E(l.title)+'" tabindex="-1"><header class="merge-drawer-head"><h2>'+E(l.title)+'</h2>'+B('关闭','close',[],'text')+'</header><div class="merge-drawer-body">'+html+'<p id="activity-error" class="activity-error" role="alert">'+E(l.error)+'</p></div><footer class="merge-drawer-foot"><div class="actions">'+foot+'</div></footer></section></div>');
    document.querySelectorAll('[data-activity-layer]').forEach(el=>el.firstElementChild.inert=Number(el.dataset.activityLayer)!==index);syncDrawerInteraction();PCUI.sweep();
  }
  async function commit(fn,expected=db.current.revision){if(state.busy)return false;state.busy=true;try{await db.commit(fn,expected);state.error='';return true;}catch(e){fail(e);return false;}finally{state.busy=false;}}
  function fail(e){const l=state.layers.at(-1);if(l){l.error=e.message;const p=document.querySelector('#activity-panel-'+(state.layers.length-1)+' #activity-error');if(p)p.textContent=e.message;}else{state.error=e.message;render();}}
  const actions={
    status(value){state.status=value;state.page=1;render();},
    search(){state.filters=Object.fromEntries(new FormData(document.querySelector('#activity-search')));state.applied=M.copy(state.filters);state.page=1;render();},
    reset(){state.filters={};state.applied={};state.page=1;render();},
    async reload(){await D.reload();await StockPC.db.read();state.error='';render();},
    edit(id){open('edit',rows().find(x=>x.id===id)||M.defaults(),id?'编辑活动':'新建活动');},
    view(id){const a=rows().find(x=>x.id===id);if(a)open('view',a,'活动详情');},
    copy(id){const a=M.copy(rows().find(x=>x.id===id));a.id='';a.name+='（副本）';a.start=M.defaults().start;a.end=M.defaults().end;delete a.endedAt;a.logs=[];a.items.forEach(x=>x.participating=true);while(state.layers.length)close();open('edit',a,'复制活动');},close,
    stores(){capture();open('stores',{},'选择活动门店',860);state.layers.at(-1).selected=state.layers.at(-2).value.stores.map(s=>s.id);draw();},
    confirmStores(){const l=state.layers.at(-1);state.layers.at(-2).value.stores=stores().filter(s=>l.selected.includes(s.id)).map(({id,name})=>({id,name}));close();draw();},
    products(){capture();open('products',{},'选择上架商品规格',860);state.layers.at(-1).selected=state.layers.at(-2).value.items.map(x=>x.key);draw();},
    productSearch(){state.layers.at(-1).query=document.querySelector('[data-activity-layer="'+(state.layers.length-1)+'"] input[name="query"]').value.trim();draw();},
    productReset(){state.layers.at(-1).query='';draw();},
    confirmProducts(){const l=state.layers.at(-1),p=state.layers.at(-2).value;p.items=catalog().filter(x=>l.selected.includes(x.key)).map(x=>p.items.find(i=>i.key===x.key)||{...x,activityPrice:x.normalPrice,participating:true});close();draw();},
    remove(i){capture();state.layers.at(-1).value.items.splice(i,1);draw();},
    async save(){capture();const l=state.layers.at(-1),a=M.validate(l.value,catalog());a.id=a.id||M.uid();a.createdAt=a.createdAt||M.now();a.updatedAt=M.now();a.logs.push({at:M.now(),actor:'总部运营',action:l.value.id?'修改活动':'创建活动'});if(await commit(s=>{const i=s.activities.findIndex(x=>x.id===a.id);if(i<0)s.activities.unshift(a);else s.activities[i]=a;},l.revision)){close();render();toast('活动已保存');}},
    end(id){const a=rows().find(x=>x.id===id);PCUI.confirm({title:M.status(a)==='未开始'?'取消活动':'提前结束活动',content:'<p>确认结束“'+E(a.name)+'”？已结算订单保留原成交价格。</p>',onConfirm:()=>actions.finish(id)});},
    async finish(id){if(await commit(s=>{const a=s.activities.find(x=>x.id===id);a.endedAt=M.now();a.logs.push({at:M.now(),actor:'总部运营',action:'结束活动'});})){render();if(state.layers.length)draw();toast('活动已结束');}},
    stopItem(id,i){PCUI.dialog({title:'停止商品参与活动',content:'<p>停止后，该规格恢复普通售价，已结算订单保持原价。</p>',buttons:[{text:'取消',action:()=>PCUI.closeDialog()},{text:'确定',primary:true,action:async()=>{PCUI.closeDialog();if(await commit(s=>{const a=s.activities.find(x=>x.id===id);a.items[i].participating=false;a.logs.push({at:M.now(),actor:'总部运营',action:'停止商品：'+a.items[i].name});})){draw();render();}}}]});}
  };
  document.addEventListener('submit',e=>{if(e.target.id==='activity-search'||e.target.id==='activity-form'){e.preventDefault();run(e.target.id==='activity-form'?'save':'search');}});
  document.addEventListener('change',e=>{if(e.target.matches('[data-activity-limit]')){capture();draw();}if(e.target.matches('[data-activity-product]')){const l=state.layers.at(-1),key=e.target.dataset.activityProduct;l.selected=e.target.checked?[...new Set([...l.selected,key])]:l.selected.filter(x=>x!==key);}});
  document.addEventListener('pc-hierarchy-change',e=>{if(e.target.matches('[data-activity-stores]'))state.layers.at(-1).selected=[...e.detail];});
  document.addEventListener('pc-hierarchy-query',e=>{if(e.target.matches('[data-activity-stores]'))state.layers.at(-1).query=e.detail;});
  document.addEventListener('click',e=>{if(e.target.matches('[data-activity-layer]'))close();});
  document.addEventListener('keydown',e=>{if(!state.active||!state.layers.length)return;if(e.key==='Escape'&&!PCUI.isPopupOpen()&&!document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){e.preventDefault();e.stopImmediatePropagation();close();}if(e.key==='Tab'){const panel=document.querySelector('#activity-panel-'+(state.layers.length-1)),els=[...panel.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&x.getClientRects().length),first=els[0],last=els.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}},true);
  PCUI.registerPager('activities',v=>{state.page=v.currentPage;state.size=v.pageSize;render();});
  db.subscribe(()=>{if(state.active&&!state.busy)render();});
  function focusRefresh(){if(state.active)db.refresh();}
  function run(name,...args){try{const p=actions[name]?.(...args);p?.catch(fail);}catch(e){fail(e);}}
  return {ready:Promise.resolve(),run,render(){state.active=true;window.addEventListener('focus',focusRefresh);render();const id=new URLSearchParams(location.hash.split('?')[1]||'').get('id');if(id&&!state.layers.length)actions.view(id);},redraw:render,leave(){state.active=false;window.removeEventListener('focus',focusRefresh);while(state.layers.length)close();}};
})();
