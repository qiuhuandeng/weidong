(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const flagLabels={sms:'短信消息通知',miniVisible:'小程序明细允许查看',orderCheck:'开单项目客户校验',serviceCheck:'维护项目客户校验'};
  const flagFieldLabels={sms:'短信通知',miniVisible:'小程序明细',orderCheck:'开单客户校验',serviceCheck:'维护客户校验'};
  const flagNotes={sms:'仅控制短信通知开关，发送内容沿用默认短信规则。',miniVisible:'控制顾客是否可在小程序查看该产品的消费明细。',orderCheck:'仅控制该规格作为开单项目时是否参与客户校验。',serviceCheck:'控制维护消费项目的客户校验，与开单项目独立设置。'};
  const rowName=r=>r.product.name+'（'+r.spec.name+'）';
  const category=()=>S.page.category||'';
  const rows=()=>P.rows(S.sales).filter(x=>P.inCategory(x.product.category,category()));
  const draft=()=>{const p=S.page,key=category();p.departmentDrafts=p.departmentDrafts||{};return p.departmentDrafts[key]||(p.departmentDrafts[key]={selected:P.departmentValues(S.data,P.settings(S.sales,key).departments),query:'',revision:S.data.revision});};
  const deptData=()=>S.top?.type==='salesDepartments'?S.top.data:draft();
  const departmentUI=d=>'<div data-sales-departments data-pc-hierarchy="'+E(JSON.stringify({nodes:P.departmentTree(S.data),value:d.selected,query:d.query}))+'"></div>';
  const namedTable=(markup,name)=>markup.replace('<table ','<table data-pc-table-name="pc.sales.'+name+'" ');
  const rememberContext=()=>{const p=S.page;p.priceContexts=p.priceContexts||{};p.priceContexts[category()+'|'+(p.tab||'产品明细')]=M.copy({filters:p.filters,applied:p.applied,page:p.page,size:p.size,selected:p.selected});};
  const restoreContext=()=>{const p=S.page,v=p.priceContexts?.[category()+'|'+(p.tab||'产品明细')];Object.assign(p,v?M.copy(v):{filters:{},applied:{},page:1,size:20,selected:[]});};
  const draw=()=>{const left=document.querySelector('.sales-category-tree'),scroll=left?.scrollTop||0;S.render();requestAnimationFrame(()=>{const el=document.querySelector('.sales-category-tree');if(el)el.scrollTop=scroll;});};
  const storeOptions=()=>{
    const f=S.page.filters,stores=P.storeCatalog(S.data),areas=Object.keys(P.organizationGroups),regions=[...new Set(Object.entries(P.organizationGroups).filter(([area])=>S.chosen(f.area,area)).flatMap(([,regions])=>Object.keys(regions)))];
    const visible=stores.filter(x=>x.memberships.some(m=>S.chosen(f.area,m.area)&&S.chosen(f.region,m.region)));
    return {areas,regions,stores:visible};
  };
  const storeFilters=()=>{
    const p=S.page,opts=storeOptions(),expanded=p.filterExpanded||{},fields=[['area','门店大区',opts.areas.map(x=>({value:x,label:x}))],['region','门店区域',opts.regions.map(x=>({value:x,label:x}))],['wid','门店名称',opts.stores.map(x=>({value:x.id,label:x.name}))]];
    return '<section class="panel sales-store-search"><div data-sales-store-filters data-pc-options="'+E(JSON.stringify(fields.map(([key,label,options])=>({key,label,options,value:Array.isArray(p.filters[key])?p.filters[key]:[],expanded:expanded[key]}))))+'"></div>'+S.search([S.filter('可服务','enabled','select',[['','全部'],['true','可服务'],['false','不可服务']])])+'</section>';
  };
  S.views['sales-prices']=()=>{
    const p=S.page,cat=category(),tab=p.tab||'产品明细',f=p.applied;
    let html='<div class="sales-category-caption">'+B(p.categoryHidden?'展开分类':'收起分类','salesToggleCategories','','','text')+'<strong>'+E(P.categoryLabel(cat))+'</strong></div>';
    let tabs=S.tabs(['产品明细','部门配置','门店配置'],tab,'salesPriceTab').replace('库存业务页签','产品售价页签');
    if(!cat)tabs=tabs.replace(/data-stock-extra="(部门配置|门店配置)"/g,'data-stock-extra="$1" disabled title="请先在左侧选择产品分类"');
    html+=tabs;
    if(tab==='部门配置'&&cat)html+=S.panel('设置项目允许被哪些部门使用',departmentUI(draft()),B('重置','salesDepartmentReset')+B('确定','salesSaveCategoryDepartments','','','primary'));
    else if(tab==='门店配置'&&cat){
      const config=P.settings(S.sales,cat),stores=P.storeCatalog(S.data).filter(x=>x.memberships.some(m=>S.chosen(f.area,m.area)&&S.chosen(f.region,m.region))&&S.chosen(f.wid,x.id)&&(!f.enabled||String(config.stores[x.id]!==false)===f.enabled));
      html+=storeFilters()+S.panel('门店配置','<div class="sales-store-table">'+namedTable(S.table([['序号',(x,i)=>i+1,70],['门店名称',x=>E(x.name),240],['可服务',x=>'<label class="switch"><input type="checkbox" aria-label="'+E(x.name)+'可服务" '+(config.stores[x.id]!==false?'checked':'')+' data-stock-action="salesStoreToggle" data-stock-id="'+E(x.id)+'"></label>',120]],stores),'stores')+'</div>');
    }else{
      html+=S.search([S.filter('产品名称','name'),...(!cat?[S.filter('科室分类','department','select',[['','全部'],...P.departments])]:[]),S.filter('状态','type','select',[['','全部'],'服务','商品'])]);
      const filtered=rows().filter(x=>S.matches(rowName(x),f.name)&&(!f.type||x.product.type===f.type)&&(!f.department||x.product.department===f.department));S.visibleIds=filtered.map(x=>x.id);
      const columns=[[S.check('全选',filtered.length>0&&filtered.every(x=>p.selected.includes(x.id)),'salesPriceAll'),x=>S.check('',p.selected.includes(x.id),'salesPriceSelected',x.id),55,true],['序号',(x,i)=>(p.page-1)*p.size+i+1,70],['产品名称',x=>E(rowName(x)),220],['产品内容',x=>x.spec.items.map(v=>E(v.source+' · '+(P.item(S.sales,v)?.name||'—')+' × '+v.qty)).join('<br>'),250],['通知与展示状态',x=>E((x.spec.sms?'短信开启':'短信关闭')+' / '+(x.spec.miniVisible?'小程序可见':'小程序隐藏')),220],['项目校验状态',x=>E((x.spec.orderCheck?'开单需校验':'开单免校验')+' / '+(x.spec.serviceCheck?'维护需校验':'维护免校验')),230],['小程序名称',x=>E(x.spec.alias||'—'),170],['所属类别',x=>E(P.categoryLabel(x.product.category)),130],['类型',x=>E(x.product.type)],['价格',x=>Number(x.spec.price).toFixed(2),110],['操作',x=>L('部门','salesDepartments',x.id)+L('编辑代称','salesAlias',x.id),170,true]];
      html+=S.panel('产品规格功能配置 · '+P.categoryLabel(cat),'<p>未选择产品时，对当前分类应用通知、展示及项目校验设置。</p>',B(p.selected.length?'配置已选产品（'+p.selected.length+'）':'配置当前分类','salesFlags','','','primary',!p.selected.length&&!cat)+(p.selected.length?B('取消选择','salesPriceClear'):''))+S.panel('产品明细',namedTable(S.paged(columns,filtered),'prices'));
    }
    return '<div class="sales-layout'+(p.categoryHidden?' is-category-hidden':'')+'">'+(!p.categoryHidden?'<aside class="panel sales-category-tree" aria-label="产品分类"><div data-sales-categories data-pc-tree="'+E(JSON.stringify({nodes:P.categoryTree(),value:cat,expanded:p.categoryExpanded||[''],label:'产品分类'}))+'"></div></aside>':'')+'<div class="sales-main">'+html+'</div></div>';
  };
  S.actions.salesToggleCategories=()=>{S.page.categoryHidden=!S.page.categoryHidden;draw();};
  S.actions.salesPriceCategory=(id,extra,el)=>{rememberContext();S.page.category=el?.value??id;S.page.selected=[];if(!category())S.page.tab='产品明细';restoreContext();draw();};
  S.actions.salesPriceTab=(id,value)=>{if(!category()&&value!=='产品明细')return;rememberContext();S.page.tab=value;restoreContext();draw();};
  document.addEventListener('pc-tree-select',e=>{if(e.target.matches('[data-sales-categories]'))S.actions.salesPriceCategory(e.detail);});
  document.addEventListener('pc-tree-expand',e=>{if(e.target.matches('[data-sales-categories]'))S.page.categoryExpanded=e.detail;});
  document.addEventListener('pc-hierarchy-change',e=>{if(e.target.matches('[data-sales-departments]'))deptData().selected=[...e.detail];});
  document.addEventListener('pc-hierarchy-query',e=>{if(e.target.matches('[data-sales-departments]'))deptData().query=e.detail;});
  document.addEventListener('pc-options-expand',e=>{if(e.target.matches('[data-sales-store-filters]')){const p=S.page;p.filterExpanded=p.filterExpanded||{};p.filterExpanded[e.detail.key]=e.detail.value;}});
  document.addEventListener('pc-options-change',e=>{if(!e.target.matches('[data-sales-store-filters]'))return;const p=S.page,{key,value}=e.detail;p.filters[key]=value;if(key==='area'){const regions=storeOptions().regions;p.filters.region=(p.filters.region||[]).filter(x=>regions.includes(x));}if(key!=='wid'){const stores=storeOptions().stores;p.filters.wid=(p.filters.wid||[]).filter(id=>stores.some(x=>x.id===id));}draw();});
  S.actions.salesPriceSelected=(id,extra,el)=>{S.actions.selected(id,extra,el);S.render();};
  S.actions.salesPriceAll=(id,extra,el)=>{S.actions.selectAll(id,extra,el);};
  S.actions.salesPriceClear=()=>{S.page.selected=[];S.render();};
  S.actions.salesFlags=()=>{
    const ids=[...S.page.selected],target=ids.length?ids.map(id=>P.row(S.sales,id)).filter(Boolean):rows();if(!target.length)throw Error('当前分类没有可配置的产品。');
    S.open('salesFlags',{ids,category:ids.length?'':category(),names:target.map(rowName),value:Object.fromEntries(Object.keys(flagLabels).map(k=>[k,target.every(r=>r.spec[k])]))},'产品规格功能配置',560);
  };
  S.drawers.salesFlags=l=>({body:S.summary({'配置范围':l.data.category?'【'+l.data.category+'】分类下所有项目':'所选产品','产品规格数':l.data.names.length})+'<details class="sales-config-targets"><summary>查看配置对象</summary><p>'+l.data.names.map(E).join('<br>')+'</p></details>'+S.form(Object.entries(flagLabels).map(([key,label])=>F(flagFieldLabels[key],C(label,[['true','开启'],['false','关闭']],String(l.data.value[key]),'value.'+key)+'<p class="sales-field-hint">'+E(flagNotes[key])+'</p>'))),footer:B('取消','close')+B('确认保存','salesSaveFlags','','','primary')});
  S.actions.salesSaveFlags=()=>{const d=S.top.data,value=Object.fromEntries(Object.keys(flagLabels).map(k=>[k,d.value[k]===true||d.value[k]==='true']));S.run('sales.flags',{ids:d.ids,category:d.category,value},()=>S.close());};
  S.actions.salesAlias=id=>{const r=P.row(S.sales,id);S.open('salesAlias',{id,value:r.spec.alias,name:rowName(r)},'编辑代称',560);};
  S.drawers.salesAlias=l=>({body:S.summary({'产品':l.data.name})+S.form([F('小程序名称',I('小程序名称',l.data.value,'value'))]),footer:B('取消','close')+B('确定','salesSaveAlias','','','primary')});
  S.actions.salesSaveAlias=()=>S.run('sales.alias',{id:S.top.data.id,value:S.top.data.value},()=>S.close());
  S.actions.salesDepartments=id=>{const r=P.row(S.sales,id);S.open('salesDepartments',{ids:[id],selected:P.departmentValues(S.data,r.spec.departments),query:'',name:rowName(r),category:r.product.category,type:r.product.type},'配置产品部门权限',860);};
  S.drawers.salesDepartments=l=>({body:S.summary({'产品名称':l.data.name,'所属项目':l.data.category,'类型':l.data.type})+departmentUI(l.data),footer:B('取消','close')+B('保存','salesSaveDepartments','','','primary')});
  S.actions.salesDepartmentReset=()=>{S.page.departmentDrafts[category()]={selected:P.departmentValues(S.data,P.settings(S.sales,category()).departments),query:'',revision:S.data.revision};S.render();};
  S.actions.salesSaveDepartments=()=>S.run('sales.departments',{ids:S.top.data.ids,value:S.top.data.selected},()=>S.close());
  S.actions.salesSaveCategoryDepartments=()=>{const d=draft();S.run('sales.departments',{category:category(),value:d.selected},()=>{d.revision=S.data.revision;},d.revision);};
  S.actions.salesStoreToggle=(wid,extra,el)=>{const scroll=[...document.querySelectorAll('.sales-store-table .vxe-table--body-inner-wrapper')].map(x=>[x.scrollTop,x.scrollLeft]);S.run('sales.store',{category:category(),wid,value:el.checked},()=>requestAnimationFrame(()=>document.querySelectorAll('.sales-store-table .vxe-table--body-inner-wrapper').forEach((x,i)=>{x.scrollTop=scroll[i]?.[0]||0;x.scrollLeft=scroll[i]?.[1]||0;})),S.data.revision);};
})(StockPC,WeidSalesModel);
