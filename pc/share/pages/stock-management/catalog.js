(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const labels={warehouses:'仓库',products:'物料',categories:'分类',tags:'标签'};
  S.actions.catalog=(id,extra)=>{
    const config=extra.startsWith('{')?JSON.parse(extra):{type:extra},type=config.type,old=S.data[type].find(x=>x.id===id);
    const defaults={warehouses:{name:'',store:'',receiver:'',phone:'',address:'',enabled:true},products:{name:'',code:'',category:'',unit:'',tags:[],origin:'公司',shelfLife:'',thumbnail:'',pictures:[],useEnabled:true,enabled:false,specs:[{id:M.uid('SP'),name:'',price:0,cost:0,uses:1}]},categories:{name:'',parent:config.parent||'',stores:[]},tags:{name:''}};
    S.open('catalog',{type,value:old||defaults[type]},(id?'编辑':'新增')+labels[type],type==='products'?860:560);
  };
  S.drawers.catalog=l=>{
    const {type,value:v}=l.data,fields=[];
    if(type==='warehouses'){
      fields.push(F('仓库名称',I('仓库名称',v.name,'value.name'),true),F('关联门店',C('关联门店',[['','请选择'],...new Set(S.data.warehouses.map(x=>x.store))],v.store,'value.store'),true),F('详细地址',I('详细地址',v.address,'value.address')),F('收货人',C('收货人',[['','请选择'],'仓库管理员','门店负责人','当前用户'],v.receiver,'value.receiver'),true),F('手机号',I('手机号',v.phone,'value.phone','tel')),F('状态',C('状态',[['true','启用'],['false','禁用']],String(v.enabled),'value.enabled')));
    }else if(type==='products'){
      fields.push(F('物料编号',I('物料编号',v.code,'value.code'),true),F('物料名称',I('物料名称',v.name,'value.name'),true),F('标签',C('标签',S.data.tags.map(x=>[x.id,x.name]),v.tags,'value.tags','multiple')+L('管理标签','tags')),F('所属分类',C('所属分类',[['','请选择'],...S.categoryOptions().slice(1)],v.category,'value.category'),true),F('计量单位',C('计量单位',[['','请选择'],'个','盒','瓶','支','包','件','台','套','片','袋','箱','卷','双','毫升','克'],v.unit,'value.unit'),true));
    }else fields.push(F(labels[type]+'名称',I(labels[type]+'名称',v.name,'value.name'),true));
    let body=S.form(fields);
    if(type==='products'){
      body+=S.section('规格型号',S.table([['规格型号名称',(x,i)=>I('规格型号名称',x.name,'value.specs.'+i+'.name'),170],['销售原价（元）',(x,i)=>I('销售原价',x.price,'value.specs.'+i+'.price','number'),150],['成本价（元）',(x,i)=>I('成本价',x.cost,'value.specs.'+i+'.cost','number'),140],['使用次数',(x,i)=>I('使用次数',x.uses,'value.specs.'+i+'.uses','number'),130],['操作',(x,i)=>L('删除','specRemove',String(i)),90]],v.specs),B('添加','specAdd'));
      const imageField=(key,multiple)=>'<div class="stock-photos">'+(multiple?v.pictures:v.thumbnail?[{src:v.thumbnail,name:'缩略图'}]:[]).map((x,i)=>'<div><a href="'+E(x.src)+'" target="_blank"><img src="'+E(x.src)+'" alt="'+E(x.name)+'"></a>'+L('移除','imageRemove',key,String(i))+'</div>').join('')+'</div><input type="file" accept="image/png,image/jpeg,image/webp" '+(multiple?'multiple':'')+' aria-label="'+(multiple?'上传效果图':'上传缩略图')+'" data-stock-action="productImage" data-stock-id="'+key+'">';
      body+=S.form([F('保质期',I('保质期',v.shelfLife,'value.shelfLife')),F('缩略图',imageField('thumbnail',false)),F('效果图',imageField('pictures',true)),F('物料归属',C('物料归属',[['','请选择'],'公司','外部'],v.origin,'value.origin')),F('领用',C('领用',[['true','启用'],['false','禁用']],String(v.useEnabled),'value.useEnabled'),true),F('启用状态',C('启用状态',[['true','启用'],['false','禁用']],String(v.enabled),'value.enabled'))]);
    }
    return {body,footer:B('取消','close')+B('确定','saveCatalog','','','primary')};
  };
  S.actions.saveCatalog=()=>{
    const l=S.top,v=M.copy(l.data.value);for(const key of ['enabled','useEnabled'])if(Object.hasOwn(v,key))v[key]=v[key]===true||v[key]==='true';
    return S.run('catalog.save',{type:l.data.type,value:v},()=>{S.close();if(S.top?.type==='tags'){S.top.revision=S.data.revision;S.actions.drawRefresh();}else if(S.top?.type==='catalog'){S.top.revision=S.data.revision;S.actions.drawRefresh();}});
  };
  S.actions.specAdd=()=>{S.top.data.value.specs.push({id:M.uid('SP'),name:'',price:0,cost:0,uses:1});S.actions.drawRefresh();};
  S.actions.specRemove=id=>{if(S.top.data.value.specs.length===1)throw Error('至少保留一个规格。');S.top.data.value.specs.splice(Number(id),1);S.actions.drawRefresh();};
  S.readImages=async files=>{
    const selected=[...files];if(selected.length>6)throw Error('一次最多添加 6 张图片。');
    return Promise.all(selected.map(file=>new Promise((resolve,reject)=>{
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>2*1024*1024){reject(Error('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。'));return;}
      const reader=new FileReader();reader.onerror=()=>reject(Error('图片读取失败。'));reader.onload=()=>resolve({name:file.name,src:reader.result});reader.readAsDataURL(file);
    })));
  };
  S.actions.productImage=async(key,extra,input)=>{const l=S.top,images=await S.readImages(input.files);if(!S.state.layers.includes(l))return;if(key==='thumbnail')l.data.value.thumbnail=images[0]?.src||l.data.value.thumbnail;else l.data.value.pictures.push(...images);S.actions.drawRefresh();};
  S.actions.imageRemove=(key,index)=>{if(key==='thumbnail')S.top.data.value.thumbnail='';else S.top.data.value.pictures.splice(Number(index),1);S.actions.drawRefresh();};
  S.actions.toggleCatalog=(id,type,target)=>{
    const value=M.copy(S.data[type].find(x=>x.id===id));value.enabled=target.checked;return S.run('catalog.save',{type,value},undefined,S.data.revision);
  };
  S.actions.deleteCatalog=(id,type)=>S.confirm('删除'+labels[type],'确认删除“'+S.data[type].find(x=>x.id===id).name+'”？',()=>S.run('catalog.delete',{type,id},()=>{if(S.top){S.top.revision=S.data.revision;S.actions.drawRefresh();}}));
  S.actions.tags=()=>S.open('tags',{},'标签管理',560);
  S.drawers.tags=()=>({body:S.table([['标签名称',x=>E(x.name),220],['操作',x=>L('编辑','catalog',x.id,'tags')+L('移除','deleteCatalog',x.id,'tags'),170]],S.data.tags),footer:B('添加','catalog','','tags','primary')+B('关闭','close')});
  S.actions.bindCategory=id=>S.open('categoryStores',{value:M.copy(S.data.categories.find(x=>x.id===id))},'绑定门店',560);
  S.drawers.categoryStores=l=>({body:S.form([F('分类',E(l.data.value.name)),F('门店',C('绑定门店',S.whOptions(false),l.data.value.stores,'value.stores','multiple'))]),footer:B('取消','close')+B('确定','saveCategoryStores','','','primary')});
  S.actions.saveCategoryStores=()=>S.run('catalog.save',{type:'categories',value:S.top.data.value},()=>S.close());
  S.actions.batchUse=()=>{if(!S.page.selected.length)throw Error('请选择物料。');S.open('batchUse',{ids:[...S.page.selected],enabled:'true'},'批量领用',560);};
  S.drawers.batchUse=l=>({body:S.summary({'已选物料':l.data.ids.length})+S.form([F('领用',C('领用',[['true','启用'],['false','禁用']],l.data.enabled,'enabled'),true)]),footer:B('取消','close')+B('确定','saveBatchUse','','','primary')});
  S.actions.saveBatchUse=()=>S.run('products.batchUse',{ids:S.top.data.ids,enabled:S.top.data.enabled==='true'},()=>{S.close();S.page.selected=[];});
  S.actions.bulkQuery=key=>S.open('bulkQuery',{key,text:S.page.filters[key]||''},key==='code'?'批量物料编号':'批量物料名称',560);
  S.drawers.bulkQuery=l=>({body:'<textarea rows="8" aria-label="批量搜索" placeholder="多个用换行、逗号、分号、空格分隔" data-stock-bind="text">'+E(l.data.text)+'</textarea>',footer:B('取消','close')+B('确定','saveBulkQuery','','','primary')});
  S.actions.saveBulkQuery=()=>{S.page.filters[S.top.data.key]=S.top.data.text;S.close();S.render();};
})(StockPC);
