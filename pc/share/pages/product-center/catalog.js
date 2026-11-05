(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  Object.assign(S.pages,{'sales-basics':'基础产品','sales-multiple':'多选产品','sales-listings':'产品上架','sales-prices':'产品售价表（新版）'});
  Object.defineProperty(S,'sales',{get:()=>P.validate(S.data)});
  S.salesSelection=rows=>{S.visibleIds=rows.map(x=>x.id);return [S.check('全选',rows.length>0&&rows.every(x=>S.page.selected.includes(x.id)),'selectAll'),x=>S.check('',S.page.selected.includes(x.id),'selected',x.id),55,true];};
  S.salesFeeText=f=>!f?.enabled?'无':f.mode==='percent'?'第一次 '+f.first+'%，之后 '+f.next+'%':f.mode==='first'?'第一次 '+f.first+' 元，之后 '+f.next+' 元':f.mode==='fixed'?'固定每次 '+f.fixed+' 元':f.tiers.map(x=>x.from+' ≤ 实收'+(x.to===null?'':' < '+x.to)+'：'+x.fee+' 元').join('；');
  S.salesBasic=id=>S.sales.basics.find(x=>x.id===id);
  S.views['sales-basics']=()=>{
    const f=S.page.applied,rows=S.sales.basics.filter(x=>S.matches(x.name,f.name)&&(P.inCategory(x.category,f.category))&&(!f.type||x.type===f.type));
    return S.search([S.filter('产品名称','name'),S.filter('所属分类','category','select',[['','全部'],...P.categoryOptions()]),S.filter('类型','type','select',[['','全部'],'服务','商品'])])+S.panel('基础产品',S.paged([S.salesSelection(rows),['ID',x=>x.no],['名称',x=>E(x.name),190],['类型',x=>E(x.type)],['所属分类',x=>E(P.categoryLabel(x.category))],['耗时（分钟）',x=>x.duration,120],['手工费',x=>E(S.salesFeeText(x.fee)),240],['配台',x=>E(x.trays.map(t=>(S.salesBasic(t.id)?.name||'—')+' '+(S.salesBasic(t.id)?.trayRatio||0)+'%（'+t.type+'）').join('、')||'—'),250],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesBasic',x.id),100,true]],rows),B('新增基础产品','salesBasic','','','primary')+B('批量修改手工费','salesFee')+B('配台','salesTrays'));
  };
  S.views['sales-multiple']=()=>{
    const rows=S.sales.multiples.filter(x=>S.matches(x.name,S.page.applied.name));
    return S.search([S.filter('名称','name')])+S.panel('多选产品',S.paged([['ID',x=>x.no],['名称',x=>E(x.name),190],['可选项',x=>x.options.map(id=>E(S.salesBasic(id)?.name||'—')+' × '+E(x.optionQuantities?.[id]??1)).join('<br>'),300],['可选项目数',x=>x.count,120],['耗时（分钟）',x=>x.duration,120],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesMultiple',x.id),100,true]],rows),B('新增多选产品','salesMultiple','','','primary'));
  };
  S.actions.salesBasic=id=>S.open('salesBasic',{value:M.copy(S.salesBasic(id)||P.basicDefault())},id?'编辑基础产品':'新增基础产品',1120);
  S.salesPhotos=(v,key,multiple=false)=>'<div class="sales-photo-field"><div class="stock-photos">'+(multiple?v[key]:v[key]?[{src:v[key],name:'缩略图'}]:[]).map((x,i)=>'<div class="sales-photo-item"><a href="'+E(x.src)+'" target="_blank" rel="noopener"><img src="'+E(x.src)+'" alt="'+E(x.name)+'"></a>'+L('移除','salesImageRemove',key,String(i))+'</div>').join('')+'</div><input type="file" accept="image/png,image/jpeg,image/webp" '+(multiple?'multiple':'')+' aria-label="上传'+(multiple?'效果图':'缩略图')+'" data-pc-upload="'+(multiple?'添加效果图':v[key]?'更换缩略图':'上传缩略图')+'" data-stock-action="salesImage" data-stock-id="'+key+'"><p class="sales-field-hint">PNG / JPG / WebP，单张不超过 2 MB'+(multiple?'；一次最多添加 6 张':'')+'</p></div>';
  S.salesWideField=(label,control,required=false)=>F(label,control,required).replace('class="field"','class="field ub-span"');
  S.salesStorePicker=stores=>'<button type="button" class="btn rule-config-picker" aria-label="选择可维护门店" data-stock-action="salesStores"><span>'+E(stores.length?'已选 '+stores.length+' 家门店':'请选择门店')+'</span>'+icon('down')+'</button>';
  S.salesFeeFields=(f,prefix='value.fee')=>{
    const fields=[F('是否有手工费',C('是否有手工费',[['false','否'],['true','是']],String(f.enabled),prefix+'.enabled','data-stock-action="salesDynamic"'))];
    if(f.enabled===true||f.enabled==='true'){
      fields.push(F('计算方式',C('手工费计算方式',[['percent','按项目实收比例'],['first','按次数：首次 / 之后'],['fixed','按次数：固定每次'],['tier','按单次实收业绩区间']],f.mode,prefix+'.mode','data-stock-action="salesDynamic"')));
      if(f.mode==='percent'||f.mode==='first')fields.push(F('第一次（'+(f.mode==='percent'?'%':'元')+'）',I('第一次手工费',f.first,prefix+'.first','number')),F('之后（'+(f.mode==='percent'?'%':'元')+'）',I('之后手工费',f.next,prefix+'.next','number')));
      if(f.mode==='fixed')fields.push(F('固定每次（元）',I('固定每次手工费',f.fixed,prefix+'.fixed','number')));
    }
    let html=S.form(fields);
    if((f.enabled===true||f.enabled==='true')&&f.mode==='tier')html+=S.table([['实收业绩下限（元）',(x,i)=>i?E(f.tiers[i-1].to):0,160],['实收业绩上限（元）',(x,i)=>i===f.tiers.length-1?'不限':I('区间上限 '+(i+1),x.to,prefix+'.tiers.'+i+'.to','number'),190],['操作手工费（元）',(x,i)=>I('区间手工费 '+(i+1),x.fee,prefix+'.tiers.'+i+'.fee','number'),190],['操作',(x,i)=>i===f.tiers.length-1?'':L('删除','salesFeeTierRemove',String(i)),90]],f.tiers)+'<div class="sales-table-actions">'+B('添加区间','salesFeeTierAdd')+'</div>';
    return html;
  };
  S.drawers.salesBasic=l=>{
    const v=l.data.value,materials=v.materials.map(x=>({...x,product:M.product(S.data,x.pid),spec:M.spec(S.data,x.pid,x.sid)}));
    let body=S.section('基本信息',S.form([F('名称',I('基础产品名称',v.name,'value.name'),true),F('类型',C('产品类型',['服务','商品'],v.type,'value.type','data-stock-action="salesDynamic"'),true),F('所属分类',C('所属分类',[['','请选择'],...P.categoryOptions()],v.category,'value.category'),true),F('耗时（分钟）',I('耗时（分钟）',v.duration,'value.duration','number'),true),F('科室',C('科室',[['','请选择'],...P.departments],v.department,'value.department')),F('项目属性',C('项目属性',[['','请选择'],...P.attributes],v.attribute,'value.attribute')),F('品类',C('品类',[['','请选择'],...P.classes],v.productClass,'value.productClass')),F('单项实收价格',I('单项实收价格',v.price,'value.price','number'),true),...(v.type==='服务'?[F('可维护门店',S.salesStorePicker(v.stores))]:[])]));
    body+=S.section('关联物料',S.table([['编号',x=>E(x.product?.code)],['物料名称',x=>E(x.product?.name),170],['规格',x=>E(x.spec?.name)],['用量单位',(x,i)=>C('用量单位 '+(i+1),[['','请确认单位'],...S.unitOptions(x.pid,x.sid)],x.unit||'','value.materials.'+i+'.unit','data-stock-action="salesDynamic"'),150],['每份用量',(x,i)=>I('每份物料用量 '+(i+1),x.qty,'value.materials.'+i+'.qty','number','data-stock-action="salesDynamic"'),150],['折合库存',(x,i)=>'<span data-stock-bom-preview="'+i+'">'+(x.unit?E(S.unitPreview(x.pid,x.sid,x.unit,x.qty)):'待确认单位')+'</span>',150],['操作',(x,i)=>L('移除','salesMaterialRemove',String(i)),90]],materials),B('选择物料','salesMaterials'));
    body+=S.section('图片资料',S.form([F('缩略图',S.salesPhotos(v,'thumbnail')),F('效果图',S.salesPhotos(v,'pictures',true))]));
    body+=S.section('内容介绍','<textarea data-pc-richtext aria-label="内容介绍" data-stock-bind="value.description">'+E(v.description)+'</textarea>');
    body+=S.section('手工费与配台',S.salesFeeFields(v.fee)+S.form([F('配台占比（%）',I('配台占比',v.trayRatio,'value.trayRatio','number'))]));
    return {body,footer:B('取消','close')+B('保存数据','salesSaveBasic','','','primary')};
  };
  S.actions.salesSaveBasic=()=>S.run('sales.basic',{value:S.top.data.value},()=>S.close());
  S.actions.salesDynamic=()=>S.actions.drawRefresh();
  S.actions.salesMaterialRemove=id=>{S.top.data.value.materials.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesImage=async(key,extra,input)=>{const l=S.top,images=await S.readImages(input.files);if(!S.state.layers.includes(l))return;if(key==='thumbnail')l.data.value.thumbnail=images[0]?.src||l.data.value.thumbnail;else l.data.value[key].push(...images);S.actions.drawRefresh();};
  S.actions.salesImageRemove=(key,index)=>{if(key==='thumbnail')S.top.data.value[key]='';else S.top.data.value[key].splice(Number(index),1);S.actions.drawRefresh();};
  S.actions.salesMaterials=()=>S.open('salesMaterials',{query:'',category:'',selected:S.top.data.value.materials.map(x=>M.key(x.pid,x.sid))},'选择库存物料',860);
  S.drawers.salesMaterials=l=>{
    const d=l.data,rows=M.catalog(S.data).filter(x=>x.product.enabled&&x.enabled!==false&&S.matches(x.product.name+' '+x.product.code,d.query)&&S.inCategory(x.product.category,d.category));
    return {body:S.layerSearch([I('物料名称',d.query,'query','text','placeholder="物料名称 / 编号"'),C('所属分类',S.categoryOptions(),d.category,'category')])+S.table([['选择',x=>S.check('',d.selected.includes(x.key),'salesPickMaterial',x.key),70],['编号',x=>E(x.product.code)],['物料名称',x=>E(x.product.name),180],['所属分类',x=>E(S.cat(x.product.category))],['单位',x=>E(x.baseUnit)],['规格型号',x=>E(x.name),140]],rows),footer:B('取消','close')+B('确定','salesConfirmMaterials','','','primary')};
  };
  S.actions.salesPickMaterial=(id,extra,input)=>{const set=new Set(S.top.data.selected);input.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];};
  S.actions.salesConfirmMaterials=()=>{const ids=S.top.data.selected,parent=S.state.layers.at(-2).data.value,old=parent.materials;parent.materials=ids.map(id=>{const [pid,sid]=id.split(':');return old.find(x=>M.key(x.pid,x.sid)===id)||{pid,sid,qty:1,unit:M.defaultUnit(S.data,pid,sid,parent.type==='商品'?'sale':'consume')};});S.close();S.actions.drawRefresh();};
  S.actions.salesStores=()=>S.open('salesStores',{query:'',selected:[...S.top.data.value.stores]},'维护门店选择',860);
  S.drawers.salesStores=l=>({body:'<div data-sales-maintenance-stores data-pc-hierarchy="'+E(JSON.stringify({nodes:P.storeTree(S.data),value:l.data.selected,query:l.data.query,entityLabel:'门店'}))+'"></div>',footer:B('取消','close')+B('确定','salesConfirmStores','','','primary')});
  document.addEventListener('pc-hierarchy-change',e=>{if(e.target.matches('[data-sales-maintenance-stores]')&&S.top?.type==='salesStores')S.top.data.selected=e.detail;});
  document.addEventListener('pc-hierarchy-query',e=>{if(e.target.matches('[data-sales-maintenance-stores]')&&S.top?.type==='salesStores')S.top.data.query=e.detail;});
  S.actions.salesConfirmStores=()=>{S.state.layers.at(-2).data.value.stores=[...S.top.data.selected];S.close();S.actions.drawRefresh();};
  S.actions.salesFee=()=>{if(!S.page.selected.length)throw Error('请选择基础产品。');S.open('salesFee',{ids:[...S.page.selected],value:{fee:M.copy(S.salesBasic(S.page.selected[0]).fee)}},'批量修改手工费',860);};
  S.drawers.salesFee=l=>({body:S.summary({'已选基础产品':l.data.ids.length})+S.section('手工费设置',S.salesFeeFields(l.data.value.fee)),footer:B('取消','close')+B('确定','salesSaveFee','','','primary')});
  S.actions.salesSaveFee=()=>S.run('sales.fee',{ids:S.top.data.ids,value:S.top.data.value.fee},()=>S.close());
  S.actions.salesFeeTierAdd=()=>{const tiers=S.top.data.value.fee.tiers,last=tiers.at(-1);last.to=(Number(tiers.at(-2)?.to)||0)+100;tiers.push({from:last.to,to:null,fee:0});S.actions.drawRefresh();};
  S.actions.salesFeeTierRemove=id=>{S.top.data.value.fee.tiers.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesTrays=()=>{if(!S.page.selected.length)throw Error('请选择基础产品。');S.open('salesTrays',{ids:[...S.page.selected],value:M.copy(S.salesBasic(S.page.selected[0]).trays)},'配台产品',860);};
  S.drawers.salesTrays=l=>({body:S.summary({'已选基础产品':l.data.ids.length})+S.section('配台明细',S.table([['配台产品',(x,i)=>C('配台产品 '+(i+1),[['','请输入产品名称'],...S.sales.basics.filter(b=>!l.data.ids.includes(b.id)).map(b=>[b.id,b.name])],x.id,'value.'+i+'.id'),280],['配台类型',(x,i)=>C('配台类型 '+(i+1),[['','请选择'],'主配台','辅配台'],x.type,'value.'+i+'.type'),200],['操作',(x,i)=>L('删除','salesTrayRemove',String(i)),100]],l.data.value),B('新增配台','salesTrayAdd')),footer:B('取消','close')+B('确定','salesSaveTrays','','','primary')});
  S.actions.salesTrayAdd=()=>{S.top.data.value.push({id:'',type:''});S.actions.drawRefresh();};
  S.actions.salesTrayRemove=id=>{S.top.data.value.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesSaveTrays=()=>S.run('sales.trays',{ids:S.top.data.ids,value:S.top.data.value},()=>S.close());
  S.actions.salesMultiple=async id=>{
    const v=M.copy(S.sales.multiples.find(x=>x.id===id)||{name:'',options:[],count:1,duration:0,thumbnail:''}),revision=S.data.revision;
    v.optionQuantities=Object.fromEntries(v.options.map(key=>[key,v.optionQuantities?.[key]===undefined?1:v.optionQuantities[key]]));
    let pending=[],saving=false,reading=false,root;
    // Keep this form's draft separate from the inventory drawer stack.
    const controls=html=>html.replaceAll('data-stock-bind','data-sales-multiple-bind').replaceAll('data-stock-action','data-sales-multiple-action');
    const integer=(label,value,bind)=>I(label,value,bind,'number').replace('min="0" step="0.001"','min="1" step="1" data-pc-stepper data-pc-precision="0" data-pc-step-strictly="true"');
    const photos=()=>controls(S.salesPhotos(v,'thumbnail'));
    const options=()=>controls('<div class="sales-multiple-options"><div class="sales-multiple-picker">'+C('选择添加项目',S.sales.basics.filter(x=>!v.options.includes(x.id)).map(x=>[x.id,x.name]),pending,'pending','multiple placeholder="请选择项目，可搜索"')+B('添加','add')+'</div>'+S.table([['项目名称',key=>E(S.salesBasic(key)?.name||'—'),130],['数量',key=>integer((S.salesBasic(key)?.name||'项目')+'数量',v.optionQuantities[key],'qty.'+key),150],['操作',key=>L('移除','remove',key),70]],v.options)+'</div>');
    const active=()=>root?.isConnected&&!root.closest('.is-closing');
    const error=message=>{if(!active())return;const el=root.querySelector('[data-sales-multiple-error]');el.textContent=message;el.hidden=!message;if(message)el.scrollIntoView({block:'nearest'});};
    const refresh=part=>{root.querySelector('[data-sales-multiple-'+part+']').innerHTML=part==='options'?options():photos();PCUI.sweep();};
    const save=async()=>{
      if(saving||S.state.busy)return;
      if(reading){error('缩略图正在读取，请稍后保存。');return;}
      if(pending.length){error('请先添加已选择的项目，或清除待添加项。');return;}
      saving=true;S.state.busy=true;error('');
      try{await S.db.commit('sales.multiple',{value:M.copy(v)},revision);if(active())PCUI.closeDialog();S.state.error=null;S.render();toast('已保存');}
      catch(e){error(e.message);}
      finally{saving=false;S.state.busy=false;}
    };
    PCUI.dialog({title:id?'编辑多选产品':'新增多选产品',content:'<div class="sales-multiple-editor" data-sales-multiple-editor>'+controls(S.form([
      S.salesWideField('名称',I('多选产品名称',v.name,'name'),true),
      S.salesWideField('缩略图','<div data-sales-multiple-photos>'+photos()+'</div>'),
      S.salesWideField('可选项','<div data-sales-multiple-options>'+options()+'</div>',true),
      S.salesWideField('可选项目数',integer('可选项目数',v.count,'count'),true),
      S.salesWideField('耗时（分钟）',I('耗时（分钟）',v.duration,'duration','number'),true)
    ]))+'<p class="stock-error" data-sales-multiple-error role="alert" hidden></p></div>',buttons:[{text:'取消',action:()=>{if(!saving)PCUI.closeDialog();}},{text:'确定',primary:true,action:save}]});
    await PCUI.whenReady();
    root=document.querySelector('[data-sales-multiple-editor]');
    const bind=event=>{
      const el=event.target;if(!el.matches('input,select,textarea')||!el.dataset.salesMultipleBind)return;
      const key=el.dataset.salesMultipleBind,value=el.type==='number'?(el.value===''?'':Number(el.value)):el.value;
      if(key==='pending')pending=[...el.selectedOptions].map(x=>x.value);
      else if(key.startsWith('qty.'))v.optionQuantities[key.slice(4)]=value;
      else v[key]=value;
    };
    root.addEventListener('input',bind);root.addEventListener('change',bind);
    root.addEventListener('click',event=>{
      const el=event.target.closest('button[data-sales-multiple-action]');if(!el||saving||reading)return;
      const action=el.dataset.salesMultipleAction;error('');
      if(action==='add'){
        if(!pending.length){error('请选择要添加的项目。');return;}
        pending.forEach(key=>{if(!v.options.includes(key)){v.options.push(key);v.optionQuantities[key]=1;}});pending=[];refresh('options');
      }else if(action==='remove'){
        const key=el.dataset.stockId;v.options=v.options.filter(x=>x!==key);delete v.optionQuantities[key];refresh('options');
      }else if(action==='salesImageRemove'){v.thumbnail='';refresh('photos');}
    });
    root.addEventListener('change',async event=>{
      const el=event.target;if(!el.matches('input[type="file"]')||saving||reading)return;
      reading=true;error('');
      try{const images=await S.readImages(el.files);if(active()){v.thumbnail=images[0]?.src||v.thumbnail;refresh('photos');}}
      catch(e){error(e.message);el.value='';}
      finally{reading=false;}
    });
  };
  document.addEventListener('input',event=>{const el=event.target,m=/^value\.materials\.(\d+)\.qty$/.exec(el.dataset?.stockBind||'');if(m&&S.top?.type==='salesBasic'){const i=Number(m[1]),x=S.top.data.value.materials[i],preview=document.querySelector('#stock-layer-'+(S.state.layers.length-1)+' [data-stock-bom-preview="'+i+'"]');if(preview)preview.textContent=x.unit?S.unitPreview(x.pid,x.sid,x.unit,x.qty):'待确认单位';}});
})(StockPC,WeidSalesModel);
