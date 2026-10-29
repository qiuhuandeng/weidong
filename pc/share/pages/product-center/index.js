window.PCModules['product-center']=(()=>{
  const S=StockPC,P=WeidSalesModel;
  async function initialize(){
    await window.PCModules['stock-management'].ready;
    if(!S.data)throw S.state.error||Error('库存产品数据尚未加载，无法读取关联产品。');
    if(S.data.salesProducts===undefined){
      try{await S.db.commit('sales.initialize',{},S.data.revision);}
      catch(error){await S.db.read();if(S.data.salesProducts===undefined)throw error;}
    }
    P.validate(S.data);S.productError=null;
  }
  for(const route of ['sales-basics','sales-multiple','sales-listings','sales-prices']){
    const view=S.views[route];S.views[route]=()=>{try{P.validate(S.data);return view();}catch(error){return S.panel('产品数据暂时无法加载','<p role="alert">'+S.E(S.productError?.message||error.message)+'</p>'+S.button('重新读取','salesRetry'));}};
  }
  // Product-only content grouping; shared drawer sizing and controls stay in PCUI.
  for(const type of Object.keys(S.drawers).filter(type=>type.startsWith('sales'))){
    const drawer=S.drawers[type];
    S.drawers[type]=layer=>{const view=drawer(layer);return {...view,body:'<div class="sales-drawer-content">'+view.body+'</div>'};};
  }
  S.actions.salesRetry=async()=>{try{await S.db.initialize();await initialize();}catch(error){S.productError=error;}S.render();};
  const ready=Promise.resolve().then(initialize).catch(error=>{S.productError=error;});
  return {ready,render:()=>window.PCModules['stock-management'].render(),redraw:()=>S.render(),leave:()=>window.PCModules['stock-management'].leave()};
})();
