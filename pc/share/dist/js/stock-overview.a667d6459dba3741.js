/* Read the existing inventory ledger; the overview owns no separate stock data. */
(function(root){
  'use strict';
  const round=n=>Math.round(n*1000)/1000;
  const chosen=(values,id)=>!values||!values.length||values.includes(id);
  function inCategory(s,id,parent){
    if(!parent)return true;
    const visited=new Set();
    while(id&&!visited.has(id)){if(id===parent)return true;visited.add(id);id=s.categories.find(x=>x.id===id)?.parent;}
    return false;
  }
  function metrics(s,pid,sid,wids=[],f={}){
    let current=0,closing=0,inbound=0,outbound=0;
    for(const e of s.ledger){
      if(e.pid!==pid||e.sid!==sid||!chosen(wids,e.wid))continue;
      const day=e.at.slice(0,10);current+=e.delta;
      if(!f.dateTo||day<=f.dateTo)closing+=e.delta;
      if(e.type==='期初库存'||f.dateFrom&&day<f.dateFrom||f.dateTo&&day>f.dateTo)continue;
      if(e.delta>0)inbound+=e.delta;else outbound-=e.delta;
    }
    return Object.fromEntries(Object.entries({current,closing,inbound,outbound}).map(([k,v])=>[k,round(v)]));
  }
  function rows(s,f={}){
    return root.WeidStockModel.catalog(s).filter(x=>chosen(f.pid,x.pid)&&inCategory(s,x.product.category,f.category)).map(x=>({...x,...metrics(s,x.pid,x.sid,f.wid,f)}));
  }
  function stockUnits(s){
    const M=root.WeidStockModel;
    return s?[...new Set(M.catalog(s).map(x=>M.defaultUnit(s,x.pid,x.sid,'stock')))]:[];
  }
  function defaults(s){
    const today=root.WeidStockModel.now().slice(0,10),[year,month]=today.split('-').map(Number),last=new Date(year,month,0).getDate();
    const units=stockUnits(s);
    return {dateFrom:today.slice(0,7)+'-01',dateTo:today.slice(0,7)+'-'+last,wid:[],pid:[],category:'',stockUnit:units.includes('盒')?'盒':units[0]||''};
  }
  root.WeidStockOverview={metrics,rows,stockUnits,defaults};
})(typeof window==='undefined'?globalThis:window);

;
/* Inventory overview: native PCUI, shared stock domain and local ledger. */
window.PCModules['stock-overview']=(()=>{
  'use strict';
  const S=StockPC,O=WeidStockOverview,{M,E}=S,B=S.button,L=S.link,F=S.field,route='stock-overview';
  S.pages[route]='库存总览';
  const state=()=>S.state.pages[route]||(S.state.pages[route]={filters:O.defaults(S.data),applied:O.defaults(S.data),page:1,size:10,selected:[],activeWid:''});
  const scopedFilters=()=>({...state().applied,wid:state().activeWid?[state().activeWid]:state().applied.wid});
  const currentRows=()=>O.rows(S.data,scopedFilters());
  const eligibleRows=()=>state().activeWid?currentRows().filter(x=>x.current>0):[];
  const search=S.actions.search,reset=S.actions.reset;
  S.actions.search=()=>{
    if(S.state.route!==route)return search();
    const f=S.page.filters;
    if(f.dateFrom&&f.dateTo&&f.dateFrom>f.dateTo){S.fail(Error('开始日期不能晚于结束日期。'));return;}
    const p=state();p.activeWid=f.wid?.length===1?f.wid[0]:S.chosen(f.wid,p.activeWid)?p.activeWid:'';
    S.state.error=null;search();
  };
  S.actions.reset=()=>{
    if(S.state.route!==route)return reset();
    const p=state();p.filters=O.defaults(S.data);p.applied=M.copy(p.filters);p.page=1;p.selected=[];p.activeWid='';S.state.error=null;S.render();
  };
  const quantityColumns=[
    ['当前库存',x=>x.current,100],
    ['<span title="截至所选结束日期的库存结存；未选结束日期时为当前库存">时间库存</span>',x=>x.closing,100],
    ['<span title="所选日期内的入库数量，不含期初库存">入库总量</span>',x=>x.inbound,100],
    ['<span title="所选日期内的出库数量">出库总量</span>',x=>x.outbound,100]
  ];
  function inventoryTotal(rows,wid,f){
    const unit=f.stockUnit,quantities=rows.filter(x=>M.defaultUnit(S.data,x.pid,x.sid,'stock')===unit).map(x=>{
      const conversion=M.conversion(S.data,x.pid,x.sid,unit);
      return {qty:O.metrics(S.data,x.pid,x.sid,wid?[wid]:f.wid,f).current/conversion.factor};
    });
    return M.sum(quantities,'qty')+(unit?' '+unit:'');
  }
  S.views[route]=()=>{
    const p=state(),f=p.applied,rows=currentRows(),single=!!p.activeWid;
    const eligible=eligibleRows().map(x=>x.key);p.selected=p.selected.filter(k=>eligible.includes(k));
    p.page=Math.max(1,Math.min(p.page,Math.ceil(rows.length/p.size)||1));
    const pageRows=rows.slice((p.page-1)*p.size,p.page*p.size),pageIds=pageRows.filter(x=>single&&x.current>0).map(x=>x.key),pageSelected=pageIds.filter(k=>p.selected.includes(k)).length;
    const warehouses=S.data.warehouses.filter(w=>S.chosen(f.wid,w.id));
    const warehouseRows=[{id:'',name:'合计',total:inventoryTotal(rows,'',f)},...warehouses.map(w=>({...w,total:inventoryTotal(rows,w.id,f)}))];
    const warehouseTable=S.table([['门店仓库',w=>L(w.name+(w.id&&!w.enabled?'（停用）':''),'overviewWarehouse',w.id),135],['库存总量',w=>E(w.total),120]],warehouseRows,'库存总览仓库汇总');
    const selectPage='<input type="checkbox" aria-label="选择本页有库存的规格" data-stock-action="overviewSelectPage"'+(pageIds.length&&pageSelected===pageIds.length?' checked':'')+(pageSelected&&pageSelected<pageIds.length?' data-pc-indeterminate="true"':'')+(!pageIds.length?' disabled':'')+'>';
    const columns=[[selectPage,x=>'<input type="checkbox" aria-label="选择 '+E(x.product.name+' / '+x.name)+'" data-stock-action="overviewSelect" data-stock-id="'+E(x.key)+'"'+(p.selected.includes(x.key)?' checked':'')+(!single||x.current<=0?' disabled':'')+'>',48],['SKU编号',x=>E(M.skuDefaults(x.product,x).code),125],['物料名称',x=>E(x.product.name),160],['所属分类',x=>E(S.cat(x.product.category)),115],['最小单位',x=>E(x.baseUnit),85],['规格型号',x=>E(x.name),110],['<span title="物料规格中配置的参考成本">成本价（元）</span>',x=>Number(x.cost||0).toFixed(2),120],['保质期',x=>E(x.product.shelfLife||'—'),95],...quantityColumns,
      ['操作',x=>'<div class="actions">'+L('库存分布','overviewDistribution',x.pid,x.sid)+(single?L('盘盈','overviewAdjust',x.key,'gain')+L('盘亏','overviewAdjust',x.key,'loss')+L('近30天明细','overviewLedger',x.pid,x.sid):'')+'</div>',single?310:110]];
    const selection=single?'<div class="stock-overview-selection actions"><span>已选 '+p.selected.length+' 项规格</span>'+B('选择全部有库存结果（'+eligible.length+'）','overviewSelectAll','','','text',!eligible.length)+B('清空选择','overviewClear','','','text',!p.selected.length)+'</div>':'';
    const table=selection+S.table(columns,pageRows,'库存总览')+'<div data-pc-pager="'+E(JSON.stringify({total:rows.length,page:p.page,size:p.size,action:'stockOverview',selected:p.selected.length}))+'"></div>';
    const actions=B('批量调拨','overviewBulk','transfer','','primary',!p.selected.length)+B('批量盘亏','overviewBulk','loss','','',!p.selected.length);
    return S.search([S.filter('物料分类','category','select',S.categoryOptions()),S.filter('门店仓库','wid','multi',S.whOptions()),S.filter('物料名称','pid','multi',S.productOptions()),S.filter('汇总单位','stockUnit','select',O.stockUnits(S.data)),S.filter('日期时间','date','range')])+
      '<div class="stock-overview-layout">'+S.panel('门店仓库',warehouseTable)+S.panel(single?'库存总览 · '+S.wh(p.activeWid):'库存总览',table,actions)+'</div>';
  };
  S.actions.overviewWarehouse=wid=>{
    const p=state();if(wid&&!S.chosen(p.applied.wid,wid)){p.filters.wid=[];p.applied.wid=[];}
    p.activeWid=wid;p.page=1;p.selected=[];S.state.error=null;S.render();
  };
  PCUI.registerPager('stockOverview',v=>{const p=state();p.page=v.currentPage;p.size=v.pageSize;S.render();});
  S.actions.overviewSelect=(key,extra,el)=>{const p=state();if(!eligibleRows().some(x=>x.key===key))return;p.selected=el.checked?[...new Set([...p.selected,key])]:p.selected.filter(k=>k!==key);S.render();};
  S.actions.overviewSelectPage=(id,extra,el)=>{const p=state(),ids=currentRows().slice((p.page-1)*p.size,p.page*p.size).filter(x=>p.activeWid&&x.current>0).map(x=>x.key);p.selected=el.checked?[...new Set([...p.selected,...ids])]:p.selected.filter(k=>!ids.includes(k));S.render();};
  S.actions.overviewSelectAll=()=>{state().selected=eligibleRows().map(x=>x.key);S.render();};
  S.actions.overviewClear=()=>{state().selected=[];S.render();};
  S.actions.overviewBulk=mode=>{
    const p=state();if(!p.activeWid)throw Error('请先选择一个门店仓库。');
    const lines=eligibleRows().filter(x=>p.selected.includes(x.key)).map(x=>({pid:x.pid,sid:x.sid,key:x.key,code:M.skuDefaults(x.product,x).code,name:x.product.name,spec:x.name,unit:M.skuDefaults(x.product,x).baseUnit,before:x.current,qty:x.current}));
    if(!lines.length)throw Error('请勾选当前库存大于 0 的物料规格。');
    S.open('overviewBulk',{requestId:M.uid('cleanup'),mode,wid:p.activeWid,to:'',note:'闭店库存清理',lines},mode==='transfer'?'批量调拨':'批量盘亏',1120);
  };
  const remaining=x=>Number.isFinite(Number(x.qty))&&x.qty!==''?Math.round((x.before-Number(x.qty))*1000)/1000:'—';
  S.drawers.overviewBulk=l=>{
    const d=l.data,transfer=d.mode==='transfer',label=transfer?'调拨数量':'盘亏数量';
    const fields=[...(transfer?[F('调入仓库',S.select('调入仓库',[['','请选择调入仓库'],...S.data.warehouses.filter(w=>w.enabled&&w.id!==d.wid).map(w=>[w.id,w.name])],d.to,'to'),true)]:[]),F('操作原因','<textarea aria-label="操作原因" data-stock-bind="note" rows="2" placeholder="填写本次批量操作原因">'+E(d.note)+'</textarea>',true)];
    const columns=[['SKU编号',x=>E(x.code),125],['物料名称',x=>E(x.name),150],['规格型号',x=>E(x.spec),95],['最小单位',x=>E(x.unit),85],['当前库存',x=>x.before,100],[label,(x,i)=>S.input(label+' '+x.name+' / '+x.spec,x.qty,'lines.'+i+'.qty','number','max="'+x.before+'" data-overview-quantity="'+i+'"'),140],[transfer?'预计调出后剩余':'盘亏后剩余',(x,i)=>'<span data-overview-remaining="'+i+'">'+E(remaining(x))+'</span>',135],['操作',(x,i)=>L('移除','overviewBulkRemove',String(i)),70]];
    return {body:S.summary({[transfer?'调出仓库':'盘亏仓库']:S.wh(d.wid),'已选规格':d.lines.length+' 项'})+S.form(fields)+'<p class="stock-overview-guidance">'+(transfer?'提交后生成一张调拨单，审核通过并确认发货时扣减调出仓库存，收货后计入调入仓。':'确认后按填写数量直接盘亏出库，并生成库存调整记录。')+' 数量以当前库存为准，不受页面日期筛选影响。</p>'+S.table(columns,d.lines,'批量库存清理').replace('data-pc-min-height="0"','data-pc-min-height="0" data-pc-scroll="parent"'),footer:B('取消','close')+B(transfer?'提交调拨':'确认盘亏','overviewBulkSave','','','primary',!d.lines.length)};
  };
  S.actions.overviewBulkRemove=index=>{S.top.data.lines.splice(Number(index),1);S.renderLayer(S.state.layers.length-1);};
  document.addEventListener('input',event=>{
    if(S.top?.type!=='overviewBulk'||!event.target.matches('[data-overview-quantity]'))return;
    const index=Number(event.target.dataset.overviewQuantity),output=event.target.closest('.stock-drawer').querySelector('[data-overview-remaining="'+index+'"]');
    if(output)output.textContent=remaining(S.top.data.lines[index]);
  });
  S.actions.overviewBulkSave=()=>{
    const l=S.top,payload=M.copy(l.data),revision=l.revision,transfer=payload.mode==='transfer';
    M.apply(M.copy(S.data),'inventory.cleanup',payload);
    const description=S.wh(payload.wid)+(transfer?' → '+S.wh(payload.to):'')+'，共 '+payload.lines.length+' 项规格、'+M.quantityText(payload.lines)+'。'+(transfer?'提交后进入待审核，确认发货时扣库。':'确认后立即扣减当前库存。');
    S.confirm(transfer?'确认批量调拨':'确认批量盘亏',description,()=>S.run('inventory.cleanup',payload,id=>{state().selected=[];S.close();S.actions.document(id);},revision));
  };
  S.actions.overviewDistribution=(pid,sid)=>S.open('overviewDistribution',{pid,sid,dates:M.copy(state().applied)},'库存分布',860);
  S.drawers.overviewDistribution=l=>{
    const d=l.data,product=M.product(S.data,d.pid),sku=M.spec(S.data,d.pid,d.sid);
    const rows=S.data.warehouses.map(w=>({wid:w.id,...O.metrics(S.data,d.pid,d.sid,[w.id],d.dates)}));
    rows.unshift({wid:'',...O.metrics(S.data,d.pid,d.sid,[],d.dates)});
    return {body:S.summary({'物料名称':product.name,'规格型号':sku.name,'SKU编号':M.skuDefaults(product,sku).code,'最小单位':S.baseUnit(d.pid,d.sid),'开始日期':d.dates.dateFrom||'不限','结束日期':d.dates.dateTo||'不限'})+
      S.table([['门店仓库',x=>E(x.wid?S.wh(x.wid):'合计'),160],...quantityColumns,['操作',x=>x.wid?L('查看','overviewDistributionView',x.wid):'',80]],rows,'库存分布').replace('data-pc-min-height="0"','data-pc-min-height="0" data-pc-scroll="parent"'),footer:B('关闭','close')};
  };
  S.actions.overviewDistributionView=wid=>{S.close();S.actions.overviewWarehouse(wid);};
  S.actions.overviewAdjust=(key,direction)=>{
    const [pid,sid]=key.split(':'),wid=state().activeWid;
    if(!wid)throw Error('请先选择一个门店仓库。');
    S.open('overviewAdjust',{requestId:M.uid('adjust'),pid,sid,wid,direction,before:M.balance(S.data,wid,pid,sid),qty:'',note:''},direction==='gain'?'盘盈入库':'盘亏出库',560);
  };
  S.drawers.overviewAdjust=l=>{
    const d=l.data,p=M.product(S.data,d.pid),sku=M.spec(S.data,d.pid,d.sid),unit=S.baseUnit(d.pid,d.sid),label=d.direction==='gain'?'盘盈数量':'盘亏数量';
    return {body:S.summary({'门店仓库':S.wh(d.wid),'物料名称':p.name,'规格型号':sku.name,'SKU编号':M.skuDefaults(p,sku).code,'当前库存':d.before+' '+unit,'最小单位':unit})+
      S.form([F(label,S.input(label,d.qty,'qty','number','placeholder="请输入本次调整数量"'),true),F('备注','<textarea aria-label="调整备注" data-stock-bind="note" rows="3" placeholder="填写调整说明">'+E(d.note)+'</textarea>')]),footer:B('取消','close')+B('确定','overviewSave','','','primary')};
  };
  S.actions.overviewSave=()=>{
    const l=S.top,payload=M.copy(l.data),revision=l.revision;
    M.apply(M.copy(S.data),'inventory.adjust',payload);
    const unit=S.baseUnit(payload.pid,payload.sid),after=Math.round((payload.before+(payload.direction==='gain'?1:-1)*Number(payload.qty))*1000)/1000;
    S.confirm('确认库存调整',S.wh(payload.wid)+' / '+M.product(S.data,payload.pid).name+' / '+M.spec(S.data,payload.pid,payload.sid).name+'：库存将从 '+payload.before+' '+unit+' 调整为 '+after+' '+unit+'。确认提交？',()=>S.run('inventory.adjust',payload,()=>S.close(),revision));
  };
  S.actions.overviewLedger=(pid,sid)=>{
    const end=M.now().slice(0,10),start=new Date(end+'T12:00:00');start.setDate(start.getDate()-29);
    const from=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0')+'-'+String(start.getDate()).padStart(2,'0');
    const params=new URLSearchParams({wid:state().activeWid,pid,sid,dateFrom:from,dateTo:end});
    location.hash='stock-ledger?'+params;
  };
  return {ready:Promise.resolve(),render(){state();window.PCModules['stock-management'].render();},redraw:()=>S.render(),leave(){window.PCModules['stock-management'].leave();}};
})();
