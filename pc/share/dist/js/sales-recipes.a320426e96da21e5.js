/* Recipes use the existing basic-product material mapping and inventory transaction. */
(function(root){
  'use strict';
  const M=root.WeidStockModel,P=root.WeidSalesModel;
  function line(s,value){
    const product=M.product(s,value.pid),spec=M.spec(s,value.pid,value.sid);
    let baseQty=null,cost=null,error='';
    try{
      if(!product||!spec)throw Error('物料或规格已不存在，请重新选择。');
      if(!value.unit)throw Error('请确认用量单位。');
      baseQty=M.convert(value.qty,M.conversion(s,value.pid,value.sid,value.unit),false);
      if(Number.isFinite(Number(spec.cost)))cost=baseQty*Number(spec.cost);
    }catch(e){error=e.message;}
    return {...value,product,spec,baseQty,cost,error,disabled:product?.enabled===false||spec?.enabled===false};
  }
  function describe(s,basic){
    const lines=(basic.materials||[]).map(x=>line(s,x)),seen=new Set();
    lines.forEach(x=>{const key=M.key(x.pid,x.sid);if(seen.has(key))x.error='同一物料规格重复配置。';seen.add(key);});
    const status=!lines.length?'未配置':lines.some(x=>x.error)?'待完善':lines.some(x=>x.disabled)?'含停用物料':'已配置';
    const cost=lines.length&&lines.every(x=>!x.error&&x.cost!==null)?Math.round(lines.reduce((n,x)=>n+x.cost,0)*100)/100:null;
    return {basic,lines,status,cost};
  }
  function usages(s,pid,sid){
    return P.validate(s).basics.flatMap(basic=>(basic.materials||[]).filter(x=>x.pid===pid&&x.sid===sid).map(x=>({basic,line:line(s,x)})));
  }
  P.handlers['sales.recipe']=(s,p)=>{
    const basic=P.validate(s).basics.find(x=>x.id===p.basicId);
    if(!basic)throw Error('基础产品已不存在，请重新选择。');
    const rows=P.materials(s,p.materials);
    basic.materials=rows;basic.updatedAt=M.now();return basic.id;
  };
  const model={line,describe,usages};
  root.PCModules=root.PCModules||{};root.PCModules['sales-recipes']=model;
  if(typeof module==='object'&&module.exports)module.exports=model;
})(typeof window==='undefined'?globalThis:window);

;
/* Product recipes: one mapping per basic product, with a reverse material lookup. */
(function(S,P,R){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,C=S.select;
  const route='sales-recipes',tabs=['产品配方','物料用途'];
  S.pages[route]='配方管理';
  const amount=value=>value===null?'—':Number(value).toFixed(2);
  const sequence=(x,i)=>(S.page.page-1)*S.page.size+i+1;
  const status=value=>'<span class="pill '+(value==='已配置'?'green':value==='未配置'?'':'orange')+'">'+E(value)+'</span>';
  const scope=body=>'<div class="recipe-drawer-content">'+body+'</div>';
  const baseText=x=>E(x.baseQty)+' '+E(x.spec.baseUnit);
  const deduction=(basic,product)=>basic.type==='商品'?'销售出库':product?.deductionMode==='consume'?'实际消耗':'领用出库';
  function productList(){
    const f=S.page.applied;
    const rows=P.validate(S.data).basics.map(b=>R.describe(S.data,b)).filter(x=>S.matches(x.basic.name+' '+x.basic.no,f.name)&&(!f.type||x.basic.type===f.type)&&P.inCategory(x.basic.category,f.category)&&(!f.config||x.status===f.config)&&(!f.material||x.lines.some(l=>S.matches((l.product?.name||'')+' '+(l.product?.code||'')+' '+(l.spec?.name||''),f.material))));
    return S.search([S.filter('基础产品','name'),S.filter('产品类型','type','select',[['','全部'],'服务','商品']),S.filter('所属分类','category','select',[['','全部'],...P.categoryOptions()]),S.filter('关联物料','material'),S.filter('配置情况','config','select',[['','全部'],'未配置','待完善','已配置','含停用物料'])])+S.panel('产品配方',S.paged([
      ['序号',sequence,65],['基础产品',x=>E(x.basic.name),180],['产品编号',x=>E(x.basic.no),100],['产品类型',x=>E(x.basic.type),90],['所属分类',x=>E(P.categoryLabel(x.basic.category)),110],
      ['关联物料',x=>x.lines.length?x.lines.map(l=>E(l.product?.name||'物料不存在')+' / '+E(l.spec?.name||l.sid)+' · '+E(l.qty)+' '+E(l.unit||'待确认单位')).join('<br>'):'—',260],
      ['配置情况',x=>status(x.status),120],['每份参考成本（元）',x=>amount(x.cost),150],['更新时间',x=>E(x.basic.updatedAt||'—'),165],
      ['操作',x=>L(x.lines.length?'编辑配方':'配置用料','recipeEdit',x.basic.id),100,true]
    ],rows),B('导出','export'));
  }
  function materialList(){
    const f=S.page.applied,rows=M.catalog(S.data).map(x=>({...x,usages:R.usages(S.data,x.pid,x.sid)})).filter(x=>S.matches(x.product.name+' '+x.product.code+' '+x.name,f.material)&&S.inCategory(x.product.category,f.category)&&(!f.product||x.usages.some(u=>S.matches(u.basic.name+' '+u.basic.no,f.product)))&&(!f.mapping||(f.mapping==='已关联'?x.usages.length:!x.usages.length)));
    return S.search([S.filter('物料名称','material'),S.filter('物料分类','category','select',S.categoryOptions()),S.filter('基础产品','product'),S.filter('关联情况','mapping','select',[['','全部'],'已关联','未关联'])])+S.panel('物料用途',S.paged([
      ['序号',sequence,65],['物料编号',x=>E(x.product.code),120],['物料名称',x=>E(x.product.name),180],['规格',x=>E(x.name),130],['最小单位',x=>E(x.baseUnit),90],['启用情况',x=>S.tag(x.product.enabled&&x.enabled!==false?'启用':'禁用'),100],
      ['关联产品数',x=>new Set(x.usages.map(u=>u.basic.id)).size,110],['基础产品',x=>x.usages.length?x.usages.map(u=>E(u.basic.name)).join('<br>'):'—',220],['操作',x=>L('查看用途','recipeUsage',x.pid,x.sid),100,true]
    ],rows),B('导出','export'));
  }
  S.views[route]=()=>{
    try{return '<div class="pc-page-sales-recipes">'+S.tabs(tabs,S.page.tab||tabs[0],'recipeTab')+((S.page.tab||tabs[0])===tabs[0]?productList():materialList())+'</div>';}
    catch(error){return S.panel('配方数据暂时无法加载','<p role="alert">'+E(S.productError?.message||error.message)+'</p>'+B('重新读取','salesRetry'));}
  };
  S.actions.recipeTab=(id,tab)=>{
    const p=S.page,current=p.tab||tabs[0];if(current===tab)return;
    p.recipeTabs=p.recipeTabs||{};p.recipeTabs[current]={filters:p.filters,applied:p.applied,page:p.page,size:p.size};
    Object.assign(p,p.recipeTabs[tab]||{filters:{},applied:{},page:1,size:10},{tab,selected:[]});S.render();
  };
  S.actions.recipeEdit=id=>{
    const basic=S.salesBasic(id);if(!basic)throw Error('基础产品已不存在，请重新选择。');
    S.open('recipeEdit',{value:{basicId:id,type:basic.type,materials:M.copy(basic.materials||[])}},'配置产品配方',1120);
  };
  function unitOptions(x){
    try{return [['','请确认单位'],...S.unitOptions(x.pid,x.sid)];}catch{return [[x.unit||'',x.unit||'请重新选择物料']];}
  }
  function clearResolvedError(layer,recipe){
    if(!layer.data.validationError||recipe.lines.some(x=>x.error))return false;
    const clear=layer.error===layer.data.validationError;if(clear)layer.error='';layer.data.validationError='';return clear;
  }
  S.drawers.recipeEdit=l=>{
    const v=l.data.value,basic=S.salesBasic(v.basicId);if(!basic)return {body:'<p role="alert">基础产品已不存在，请关闭后重新选择。</p>'};
    const recipe=R.describe(S.data,{...basic,materials:v.materials});
    clearResolvedError(l,recipe);
    const body=S.summary({'基础产品':basic.name,'产品编号':basic.no,'产品类型':basic.type,'所属分类':P.categoryLabel(basic.category)})+S.section('每'+(basic.type==='商品'?'份商品':'次服务')+'的标准用料',
      S.table([
        ['物料名称',x=>E(x.product?.name||'物料不存在')+(x.disabled?'<br>'+S.tag('禁用'):''),160],['规格',x=>E(x.spec?.name||x.sid),110],
        ['用量单位',(x,i)=>C('用量单位 '+(i+1),unitOptions(x),x.unit||'','value.materials.'+i+'.unit','data-stock-action="recipeRefresh"'),130],
        ['标准用量',(x,i)=>I('标准用量 '+(i+1),x.qty,'value.materials.'+i+'.qty','number'),110],
        ['折合最小单位',(x,i)=>'<span data-recipe-base="'+i+'">'+(x.error?E(x.error):baseText(x))+'</span>',155],
        ['参考成本（元）',(x,i)=>'<span data-recipe-cost="'+i+'">'+amount(x.cost)+'</span>',120],
        ['扣库环节',x=>E(deduction(basic,x.product)),100],['操作',(x,i)=>L('移除','salesMaterialRemove',String(i)),80]
      ],recipe.lines),B('选择物料','salesMaterials'))+
      '<div class="recipe-cost-summary"><span>每'+(basic.type==='商品'?'份商品':'次服务')+'参考成本：<strong data-recipe-total>'+amount(recipe.cost)+'</strong> 元</span><span>按物料规格参考成本与标准用量计算</span></div>';
    return {body:scope(body),footer:B('取消','close')+B('保存配方','recipeSave','','','primary')};
  };
  S.actions.recipeRefresh=()=>S.actions.drawRefresh();
  S.actions.recipeSave=()=>{
    const v=S.top.data.value;
    try{P.materials(S.data,v.materials);S.top.data.validationError='';}
    catch(error){S.top.data.validationError=error.message;throw error;}
    return S.run('sales.recipe',{basicId:v.basicId,materials:v.materials},()=>{S.close();if(S.top)S.actions.drawRefresh();});
  };
  S.actions.recipeUsage=(pid,sid)=>S.open('recipeUsage',{pid,sid},'物料用途',860);
  S.drawers.recipeUsage=l=>{
    const {pid,sid}=l.data,p=M.product(S.data,pid),v=M.spec(S.data,pid,sid),rows=R.usages(S.data,pid,sid);
    return {body:scope(S.summary({'物料名称':p?.name,'物料编号':p?.code,'规格':v?.name,'最小单位':v?.baseUnit})+S.section('使用该物料的基础产品',S.table([
      ['基础产品',x=>E(x.basic.name),180],['产品类型',x=>E(x.basic.type),90],['每份用量',x=>E(x.line.qty)+' '+E(x.line.unit||'待确认单位'),130],['折合最小单位',x=>x.line.error?E(x.line.error):baseText(x.line),170],['扣库环节',x=>E(deduction(x.basic,p)),110],['操作',x=>L('编辑配方','recipeEdit',x.basic.id),100]
    ],rows))),footer:B('关闭','close')};
  };
  function preview(event){
    if(S.top?.type!=='recipeEdit'||!/^value\.materials\.\d+\.qty$/.test(event.target.dataset.stockBind||''))return;
    const root=event.target.closest('.stock-drawer'),v=S.top.data.value,recipe=R.describe(S.data,{materials:v.materials});
    if(clearResolvedError(S.top,recipe))root.querySelector('.stock-error').textContent='';
    recipe.lines.forEach((x,i)=>{const base=root.querySelector('[data-recipe-base="'+i+'"]'),cost=root.querySelector('[data-recipe-cost="'+i+'"]');if(base)base.textContent=x.error||x.baseQty+' '+x.spec.baseUnit;if(cost)cost.textContent=amount(x.cost);});
    const total=root.querySelector('[data-recipe-total]');if(total)total.textContent=amount(recipe.cost);
  }
  S.actions.recipeRetry=async()=>{
    try{await S.db.initialize();S.state.error=null;await S.actions.salesRetry();}
    catch(error){S.state.error=error;R.render();}
  };
  Object.assign(R,{
    ready:Promise.resolve(),
    render(){
      document.removeEventListener('input',preview);document.addEventListener('input',preview);
      if(!S.data){
        S.state.active=true;S.state.route=route;
        document.querySelector('#main').innerHTML='<div class="stock-module">'+S.panel('配方数据暂时无法加载','<p role="alert">'+E(S.state.error?.message||S.productError?.message||'正在读取产品和物料…')+'</p>'+B('重新读取','recipeRetry'))+'</div>';
        PCUI.sweep();return;
      }
      window.PCModules['stock-management'].render();
    },
    redraw:()=>S.render(),
    leave(){document.removeEventListener('input',preview);window.PCModules['stock-management'].leave();}
  });
})(StockPC,WeidSalesModel,window.PCModules['sales-recipes']);
