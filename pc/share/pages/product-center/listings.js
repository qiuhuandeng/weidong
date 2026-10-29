(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const yes=[['true','是'],['false','否']],itemName=x=>P.item(S.sales,x)?.name||'—';
  S.views['sales-listings']=()=>{
    const f=S.page.applied,rows=S.sales.listings.filter(x=>S.matches(x.name,f.name)&&(P.inCategory(x.category,f.category))&&(!f.type||x.type===f.type)).sort((a,b)=>b.sort-a.sort);
    return S.search([S.filter('产品名称','name'),S.filter('所属分类','category','select',[['','全部'],...P.categoryOptions()]),S.filter('类型','type','select',[['','全部'],'服务','商品'])])+S.panel('产品上架',S.paged([['ID',x=>x.no],['产品名称',x=>E(x.name),220],['类型',x=>E(x.type)],['所属分类',x=>E(P.categoryLabel(x.category)),140],['状态',x=>S.tag(x.enabled?'上架':'下架')],['排序值',x=>x.sort],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesListing',x.id),100,true]],rows),B('上架产品','salesListing','','','primary'));
  };
  S.actions.salesListing=id=>S.open('salesListing',{value:M.copy(S.sales.listings.find(x=>x.id===id)||P.listingDefault())},id?'编辑上架产品':'上架产品',1120);
  S.drawers.salesListing=l=>{
    const v=l.data.value;
    let body=S.section('基本信息',S.form([F('名称',I('上架产品名称',v.name,'value.name'),true),F('类型',C('上架产品类型',['服务','商品'],v.type,'value.type'),true),F('所属分类',C('所属分类',[['','请选择'],...P.categoryOptions()],v.category,'value.category'),true),F('耗时（分钟）',I('耗时（分钟）',v.duration,'value.duration','number'),true),F('科室分类',C('科室分类',[['','请选择'],...P.departments],v.department,'value.department')),F('产品属性',C('产品属性',['常规','外协-他方','内推','外协-我方'],v.attribute,'value.attribute'),true),F('状态',C('上架状态',[['true','上架'],['false','下架']],String(v.enabled),'value.enabled')),F('排序',I('排序值',v.sort,'value.sort','number','placeholder="数字越高越靠前"')),S.salesWideField('描述',I('描述',v.brief,'value.brief'))]));
    let specs='';
    v.specs.forEach((sp,i)=>{
      const p='value.specs.'+i;
      specs+='<div class="sales-spec">'+S.section('规格 '+(i+1),S.form([F('名称',I('规格名称 '+(i+1),sp.name,p+'.name'),true),F('规格类型',C('规格类型 '+(i+1),['常规','体验'],sp.type,p+'.type')),F('自助预约',C('自助预约 '+(i+1),yes,String(sp.booking),p+'.booking')),F('赠送',C('赠送 '+(i+1),yes,String(sp.gift),p+'.gift')),F('价格标准化',C('价格标准化 '+(i+1),yes,String(sp.standardPrice),p+'.standardPrice')),F('小程序预约金',I('预约金 '+(i+1),sp.deposit,p+'.deposit','number')),F('高价（一档）',I('高价 '+(i+1),sp.high,p+'.high','number')),F('原价（二档）',I('原价 '+(i+1),sp.price,p+'.price','number')),F('底价（三档）',I('底价 '+(i+1),sp.low,p+'.low','number'))])+S.section('组成产品',S.table([['来源',x=>E(x.source)],['产品',x=>E(itemName(x))+' × '+x.qty,220],['有效天数',x=>x.days],['占比（%）',(x,j)=>I('占比 '+(i+1)+'-'+(j+1),x.ratio,p+'.items.'+j+'.ratio','number'),150],['单项实收占比（%）',(x,j)=>I('单项实收占比 '+(i+1)+'-'+(j+1),x.actualRatio,p+'.items.'+j+'.actualRatio','number'),180],['操作',(x,j)=>L('移除','salesItemRemove',String(i),String(j)),90]],sp.items),B('添加产品','salesItem',String(i))),B('移除规格','salesSpecRemove',String(i)))+'</div>';
    });
    body+=S.section('产品规格',specs,B('添加规格','salesSpecAdd'));
    body+=S.section('图片资料',S.form([F('缩略图',S.salesPhotos(v,'thumbnail')),F('效果图',S.salesPhotos(v,'pictures',true))]))+S.section('内容介绍','<textarea data-pc-richtext aria-label="内容介绍" data-stock-bind="value.description">'+E(v.description)+'</textarea>');
    return {body,footer:B('取消','close')+B('保存数据','salesSaveListing','','','primary')};
  };
  S.actions.salesSpecAdd=()=>{S.top.data.value.specs.push(P.specDefault());S.actions.drawRefresh();};
  S.actions.salesSpecRemove=id=>{S.top.data.value.specs.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesItemRemove=(id,j)=>{S.top.data.value.specs[Number(id)].items.splice(Number(j),1);S.actions.drawRefresh();};
  S.actions.salesItem=id=>S.open('salesItem',{spec:Number(id),value:{source:'基础',id:'',qty:1,ratio:0,actualRatio:100,days:365}},'添加组成产品',560);
  S.drawers.salesItem=l=>{
    const v=l.data.value,options=v.source==='基础'?S.sales.basics:S.sales.multiples;
    return {body:S.form([F('产品来源',C('产品来源',['基础','多选'],v.source,'value.source','data-stock-action="salesItemSource"')),F('产品',C('组成产品',[['','请输入产品名称'],...options.map(x=>[x.id,x.name])],v.id,'value.id'),true),F('数量',I('组成产品数量',v.qty,'value.qty','number'),true),F('占比（%）',I('组成产品占比',v.ratio,'value.ratio','number'),true),F('有效天数',I('有效天数',v.days,'value.days','number'))]),footer:B('取消','close')+B('确定','salesItemConfirm','','','primary')};
  };
  S.actions.salesItemSource=()=>{S.top.data.value.id='';S.actions.drawRefresh();};
  S.actions.salesItemConfirm=()=>{
    const d=S.top.data,v=d.value;if(!P.item(S.sales,v))throw Error('请选择组成产品。');v.qty=M.quantity(v.qty,'数量',false);if(!Number.isInteger(v.qty))throw Error('数量须为整数。');v.days=M.quantity(v.days,'有效天数');v.ratio=M.quantity(v.ratio,'占比');if(v.ratio>100)throw Error('占比不能超过 100%。');
    S.state.layers.at(-2).data.value.specs[d.spec].items.push(M.copy(v));S.close();S.actions.drawRefresh();
  };
  S.actions.salesSaveListing=()=>S.run('sales.listing',{value:S.top.data.value},()=>S.close());
})(StockPC,WeidSalesModel);
