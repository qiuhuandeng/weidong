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
  function defaults(){
    const today=root.WeidStockModel.now().slice(0,10),[year,month]=today.split('-').map(Number),last=new Date(year,month,0).getDate();
    return {dateFrom:today.slice(0,7)+'-01',dateTo:today.slice(0,7)+'-'+last,wid:[],pid:[],category:''};
  }
  root.WeidStockOverview={metrics,rows,defaults};
})(typeof window==='undefined'?globalThis:window);

;
/* Inventory overview: native PCUI, shared stock domain and local ledger. */
window.PCModules['stock-overview']=(()=>{
  'use strict';
  const S=StockPC,O=WeidStockOverview,{M,E}=S,B=S.button,L=S.link,F=S.field,route='stock-overview';
  S.pages[route]='库存总览';
  const state=()=>S.state.pages[route]||(S.state.pages[route]={filters:O.defaults(),applied:O.defaults(),page:1,size:10,selected:[]});
  const search=S.actions.search,reset=S.actions.reset;
  S.actions.search=()=>{
    if(S.state.route!==route)return search();
    const f=S.page.filters;
    if(f.dateFrom&&f.dateTo&&f.dateFrom>f.dateTo){S.fail(Error('开始日期不能晚于结束日期。'));return;}
    S.state.error=null;search();
  };
  S.actions.reset=()=>{
    if(S.state.route!==route)return reset();
    const p=state();p.filters=O.defaults();p.applied=M.copy(p.filters);p.page=1;S.state.error=null;S.render();
  };
  const quantityColumns=[
    ['当前库存',x=>x.current,100],
    ['<span title="截至所选结束日期的库存结存；未选结束日期时为当前库存">时间库存</span>',x=>x.closing,100],
    ['<span title="所选日期内的入库数量，不含期初库存">入库总量</span>',x=>x.inbound,100],
    ['<span title="所选日期内的出库数量">出库总量</span>',x=>x.outbound,100]
  ];
  function inventoryTotal(rows,wid,f){
    return M.quantityText(rows.map(x=>({unit:x.baseUnit,qty:O.metrics(S.data,x.pid,x.sid,wid?[wid]:f.wid,f).current})));
  }
  S.views[route]=()=>{
    const p=state(),f=p.applied,rows=O.rows(S.data,f),single=Array.isArray(f.wid)&&f.wid.length===1;
    const warehouses=S.data.warehouses.filter(w=>S.chosen(f.wid,w.id));
    const warehouseRows=[{id:'',name:'合计',total:inventoryTotal(rows,'',f)},...warehouses.map(w=>({...w,total:inventoryTotal(rows,w.id,f)}))];
    const warehouseTable=S.table([['门店仓库',w=>w.id?L(w.name,'overviewWarehouse',w.id):E(w.name),135],['库存总量',w=>E(w.total),120]],warehouseRows,'库存总览仓库汇总');
    const columns=[['物料名称',x=>E(x.product.name),160],['所属分类',x=>E(S.cat(x.product.category)),115],['最小单位',x=>E(x.baseUnit),85],['规格型号',x=>E(x.name),110],['<span title="物料规格中配置的参考成本">成本价（元）</span>',x=>Number(x.cost||0).toFixed(2),120],['保质期',x=>E(x.product.shelfLife||'—'),95],...quantityColumns,
      ['操作',x=>'<div class="actions">'+L('库存分布','overviewDistribution',x.pid,x.sid)+(single?L('盘盈','overviewAdjust',x.key,'gain')+L('盘亏','overviewAdjust',x.key,'loss')+L('近30天明细','overviewLedger',x.pid,x.sid):'')+'</div>',single?310:110]];
    return S.search([S.filter('物料分类','category','select',S.categoryOptions()),S.filter('门店仓库','wid','multi',S.whOptions()),S.filter('物料名称','pid','multi',S.productOptions()),S.filter('日期时间','date','range')])+
      '<div class="stock-overview-layout">'+S.panel('门店仓库',warehouseTable)+S.panel(single?'库存总览 · '+S.wh(f.wid[0]):'库存总览',S.paged(columns,rows,false,'库存总览'))+'</div>';
  };
  S.actions.overviewWarehouse=wid=>{
    const p=state();p.filters=M.copy(p.applied);p.filters.wid=[wid];p.applied=M.copy(p.filters);p.page=1;S.state.error=null;S.render();
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
    const [pid,sid]=key.split(':'),wid=state().applied.wid?.[0];
    if(!wid||state().applied.wid.length!==1)throw Error('请先选择一个门店仓库。');
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
    const params=new URLSearchParams({wid:state().applied.wid[0],pid,sid,dateFrom:from,dateTo:end});
    location.hash='stock-ledger?'+params;
  };
  return {ready:Promise.resolve(),render(){state();window.PCModules['stock-management'].render();},redraw:()=>S.render(),leave(){window.PCModules['stock-management'].leave();}};
})();
