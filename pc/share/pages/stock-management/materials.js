/* Material master editing uses the inventory form/table/drawer adapters. */
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const originalCatalog=S.actions.catalog,originalClose=S.actions.close;
  S.actions.close=()=>{const refresh=['materialMasters','tags'].includes(S.top?.type);originalClose();if(refresh&&['material','materialSpec'].includes(S.top?.type))S.actions.drawRefresh();};
  S.actions.catalog=(id,extra)=>{
    if(extra!=='products')return originalCatalog(id,extra);
    const value=M.copy(S.data.products.find(x=>x.id===id)||{name:'',externalName:'',code:'',brand:'',category:'',materialType:'辅材',tags:[],origin:'公司',thumbnail:'',pictures:[],enabled:true,useEnabled:true,saleEnabled:false,deductionMode:'issue',specs:[]});
    S.open('material',{value,tab:'基本资料'},(id?'编辑':'新增')+'物料',1120);
  };
  const unitOptions=v=>Object.keys(M.unitTable(v)).map(x=>[x,x]);
  S.unitOptions=(pid,sid)=>unitOptions(M.spec(S.data,pid,sid));
  S.baseUnit=(pid,sid)=>M.spec(S.data,pid,sid)?.baseUnit||M.product(S.data,pid)?.unit;
  S.unitPreview=(pid,sid,unit,n)=>{try{const c=M.conversion(S.data,pid,sid,unit);return M.convert(n,c)+' '+c.baseUnit;}catch(e){return e.message;}};
  S.actions.materialTab=(id,tab)=>{S.top.data.tab=tab;S.actions.drawRefresh();};
  S.drawers.material=l=>{
    const v=l.data.value,tab=l.data.tab;
    let body=S.tabs(['基本资料','规格与单位'],tab,'materialTab');
    if(tab==='基本资料')body+=S.form([
      F('物料编码',I('物料编码',v.code||'保存后自动生成','value.code','text','disabled')),
      F('物料名称',I('物料名称',v.name,'value.name'),true),F('对外名称',I('对外名称',v.externalName||'','value.externalName')),
      F('物料类型',C('物料类型',[['','请选择'],'药械品','仪器耗材','辅材','零售品'],v.materialType||'','value.materialType'),true),
      F('所属分类',C('所属分类',[['','请选择'],...S.categoryOptions().slice(1)],v.category,'value.category'),true),
      F('所属品牌',C('所属品牌',[['','请选择'],...S.data.brands.map(x=>[x.id,x.name+(x.enabled?'':'（停用）')])],v.brand||'','value.brand')+L('管理品牌','materialMasters')),
      F('标签',C('标签',S.data.tags.map(x=>[x.id,x.name]),v.tags,'value.tags','multiple')+L('管理标签','tags')),
      F('物料归属',C('物料归属',['公司','外部'],v.origin,'value.origin')),
      F('状态',C('物料状态',[['true','启用'],['false','停用']],String(v.enabled),'value.enabled')),
      F('外观描述',I('外观描述',v.description||'','value.description')),
      F('缩略图',(v.thumbnail?'<div class="stock-photos"><img src="'+E(v.thumbnail)+'" alt="物料缩略图"></div>':'')+'<input type="file" accept="image/png,image/jpeg,image/webp" data-pc-upload="上传缩略图" aria-label="上传缩略图" data-stock-action="productImage" data-stock-id="thumbnail">'),
      F('物料图片','<div class="stock-photos">'+v.pictures.map((x,i)=>'<div><img src="'+E(x.src)+'" alt="'+E(x.name)+'">'+L('移除','imageRemove','pictures',String(i))+'</div>').join('')+'</div><input type="file" multiple accept="image/png,image/jpeg,image/webp" data-pc-upload="添加物料图片" aria-label="添加物料图片" data-stock-action="productImage" data-stock-id="pictures">')]);
    if(tab==='规格与单位')body+=S.section('SKU 规格',S.table([
      ['规格名称',x=>E(x.name),200],['销售单位',x=>E(x.defaults.sale),120],
      ['销售原价',x=>E(x.price)+' 元',160],['成本价',x=>E(x.cost)+' 元 / '+E(x.baseUnit),160],
      ['启用状态',(x,i)=>'<label class="switch"><input type="checkbox" aria-label="启用规格 '+E(x.name)+'" '+(x.enabled?'checked':'')+' data-stock-bind="value.specs.'+i+'.enabled"><span></span></label>',110],
      ['操作',(x,i)=>'<div class="actions">'+L('编辑','materialSpec',String(i))+L('移除','materialRemoveSpec',String(i))+'</div>',120]],v.specs),B('新增规格','materialSpec'));
    return {body,footer:B('取消','close')+B('保存物料','saveMaterial','','','primary')};
  };
  S.actions.saveMaterial=()=>{const v=M.copy(S.top.data.value);['enabled','useEnabled','saleEnabled'].forEach(k=>v[k]=v[k]===true||v[k]==='true');return S.run('catalog.save',{type:'products',value:v},()=>S.close());};
  S.actions.materialRemoveSpec=id=>{const v=S.top.data.value,x=v.specs[Number(id)];if(v.id&&M.referenced(S.data,v.id,x.id))throw Error('规格已被引用，请在 SKU 规格列表中停用。');v.specs.splice(Number(id),1);S.actions.drawRefresh();};
  const roleLabels={purchase:'默认采购单位',stock:'默认库存单位',sale:'默认销售单位',consume:'默认消耗单位'};
  const commonUnits=['个','片','支','瓶','盒','包','袋','箱','件','套','台','卷','双','对','板','次','ml','L','g','kg','毫升','升','克','千克'];
  // Reuse names only. Every specification owns its hierarchy and ratios.
  const unitNames=v=>[...new Set([...commonUnits,...(S.data.unitGroups||[]).flatMap(g=>[g.baseUnit,...(g.levels||[])]),...S.data.products.flatMap(p=>p.specs.flatMap(x=>[x.baseUnit,...(x.units||[]).map(u=>u.name)])),v.baseUnit,...v.units.map(x=>x.name)].filter(Boolean))];
  const fraction=x=>x===true||x==='true';
  S.actions.materialSpec=id=>{
    const p=S.top.data.value,index=id===''?-1:Number(id),base='个',v=index>=0?p.specs[index]:{id:M.uid('SP'),code:'',name:'',baseUnit:base,units:[],defaults:{purchase:base,stock:base,sale:base,consume:base},step:1,allowFraction:false,enabled:true,price:0,cost:0,uses:1,offers:[]};
    const data={value:v,index,pid:p.id,locked:!!p.id&&M.referenced(S.data,p.id,v.id),tab:'单位与换算',baseWas:v.baseUnit,unitNames:v.units.map(x=>x.name)};
    S.open('materialSpec',data,index>=0?'编辑规格':'新增规格',860);
  };
  S.actions.specTab=(id,tab)=>{S.top.data.tab=tab;S.actions.drawRefresh();};
  function reconcileBase(d){
    const v=d.value;if(d.baseWas===v.baseUnit||d.locked)return;
    const before=d.baseWas;
    if(v.units.some(x=>x.name===v.baseUnit)){v.baseUnit=before;throw Error('该单位已在上级换算中使用，请先移除对应层级。');}
    Object.keys(v.defaults).forEach(k=>{if(v.defaults[k]===before)v.defaults[k]=v.baseUnit;});
    v.units.forEach(x=>{if(x.parent===before)x.parent=v.baseUnit;});
    v.offers.forEach(o=>{if(o.unit===before)o.unit=v.baseUnit;});d.baseWas=v.baseUnit;
  }
  function conversionText(v,row){
    if(!row.name)return '请选择换算单位';
    if(row.ratio===''||row.ratio===null||row.ratio===undefined)return '请填写换算数量';
    try{
      const chain=[],seen=new Set();let item=row;
      while(item){if(seen.has(item.name))throw Error('单位不能循环换算');if(item!==row&&(item.ratio===''||item.ratio===null||item.ratio===undefined))return '请先填写“'+item.name+'”的换算数量';seen.add(item.name);chain.push(item);if(item.parent===v.baseUnit)break;item=v.units.find(x=>x.name===item.parent);}
      const result=M.unitTable({...v,allowFraction:fraction(v.allowFraction),units:chain})[row.name];
      return '1 '+row.name+' = '+row.ratio+' '+row.parent+(row.parent===v.baseUnit?'':' = '+result.factor+' '+v.baseUnit);
    }catch(e){return e.message.replaceAll('下级单位','折算单位');}
  }
  S.drawers.materialSpec=l=>{
    reconcileBase(l.data);
    const d=l.data,v=d.value,locked=d.locked?'disabled':'',names=[v.baseUnit,...v.units.map(x=>x.name)].filter(Boolean),options=names.map(x=>[x,x]),dictionary=unitNames(v);
    const rowLocked=i=>d.locked&&i<(M.spec(S.data,d.pid,v.id)?.units.length||0);
    let body=S.form([F('规格名称',I('规格名称',v.name,'value.name'),true)]);
    body+=S.tabs(['单位与换算','价格设置'],d.tab,'specTab');
    if(d.tab==='单位与换算'){
      const fields=[F('最小单位',C('最小单位',[['','请选择'],...dictionary],v.baseUnit,'value.baseUnit',locked+' data-stock-action="materialBaseChange"'),true)];
      const columns=[
        ['上一级单位',(x,i)=>C('上一级单位 '+(i+1),[['','请选择'],...dictionary.filter(name=>name!==v.baseUnit&&!v.units.some((u,j)=>j!==i&&u.name===name)).map(name=>[name,'1 '+name])],x.name,'value.units.'+i+'.name',(rowLocked(i)?'disabled':'')+' data-stock-action="materialUnitName" data-stock-id="'+i+'"'),125],
        ['等于数量',(x,i)=>I('换算数量 '+(i+1),x.ratio,'value.units.'+i+'.ratio','number',rowLocked(i)?'disabled':''),110],
        ['对应单位',x=>E(x.parent||'—'),110],
        ['换算结果',(x,i)=>'<span data-material-unit-preview="'+i+'">'+E(conversionText(v,x))+'</span>',190],
        ['可填小数',(x,i)=>C('该单位可填小数 '+(i+1),[['false','否'],['true','是']],String(x.allowFraction),'value.units.'+i+'.allowFraction',rowLocked(i)?'disabled':''),100],
        ['操作',(x,i)=>rowLocked(i)?'已引用':L('移除','materialUnitRemove',String(i)),80]
      ];
      body+=S.section('最小单位与多单位换算',S.form(fields)+(v.units.length?S.table(columns,v.units):''),B('添加上一级','materialUnitAdd'));
      if(d.locked)body+='<p>该规格已有引用，最小单位及已有换算关系已锁定；可增加新单位，或调整默认业务单位。</p>';
      if(v.uses>1)body+='<p>历史使用次数：'+E(v.uses)+'。此值仅保留历史含义，不参与单位换算。</p>';
      body+=S.section('业务计量单位',S.form(Object.entries(roleLabels).map(([k,label])=>F(label,C(label,[['','请选择'],...options],v.defaults[k],'value.defaults.'+k),true))));
    }else{
      body+=S.form([F('参考成本（元 / '+v.baseUnit+'）',I('最小单位参考成本',v.cost,'value.cost','number')),F('建议售价（元 / '+v.defaults.sale+'）',I('建议售价',v.price,'value.price','number'))]);
    }
    return {body,footer:B('取消','close')+B('确定规格','saveMaterialSpec','','','primary')};
  };
  S.actions.materialBaseChange=()=>{try{reconcileBase(S.top.data);}finally{S.actions.drawRefresh();}};
  S.actions.materialUnitAdd=()=>{
    const d=S.top.data,v=d.value,previous=v.units.at(-1);
    if(!v.baseUnit)throw Error('请先选择最小单位。');
    if(previous&&!previous.name)throw Error('请先选择上一层的单位，再添加上一级。');
    v.units.push({name:'',ratio:'',parent:previous?.name||v.baseUnit,allowFraction:false});d.unitNames.push('');S.actions.drawRefresh();
  };
  S.actions.materialUnitName=id=>{
    const d=S.top.data,v=d.value,i=Number(id),row=v.units[i],before=d.unitNames[i];
    if(row.name===v.baseUnit||v.units.some((u,j)=>i!==j&&u.name===row.name)){row.name=before;S.actions.drawRefresh();throw Error('该单位已存在，请选择其他单位。');}
    if(before&&before!==row.name){
      if(!row.name){row.name=before;S.actions.drawRefresh();throw Error('请选择换算单位；不需要的关系可使用“移除”。');}
      Object.keys(v.defaults).forEach(k=>{if(v.defaults[k]===before)v.defaults[k]=row.name;});
      v.units.forEach(x=>{if(x!==row&&x.parent===before)x.parent=row.name;});v.offers.forEach(x=>{if(x.unit===before)x.unit=row.name;});
    }
    d.unitNames=v.units.map(x=>x.name);S.actions.drawRefresh();
  };
  S.actions.materialUnitRemove=id=>{
    const d=S.top.data,v=d.value,i=Number(id),row=v.units[i];
    if(d.locked&&(M.spec(S.data,d.pid,v.id)?.units||[]).some(x=>x.name===row.name))throw Error('已有引用的换算单位不能移除。');
    // Legacy quotes have no editor here now; removing their unit also removes
    // the corresponding draft quote so hidden data cannot block unit editing.
    if(row.name)v.offers=v.offers.filter(x=>x.unit!==row.name);
    // Removing a middle level connects the next level to the remaining lower
    // unit. Preserve its factor only when both existing quantities are known.
    v.units.filter(x=>x!==row&&x.parent===row.name).forEach(x=>{
      x.parent=row.parent;
      x.ratio=Number(x.ratio)>0&&Number(row.ratio)>0?Number((Number(x.ratio)*Number(row.ratio)).toPrecision(12)):'';
    });
    Object.keys(v.defaults).forEach(k=>{if(row.name&&v.defaults[k]===row.name)v.defaults[k]=v.baseUnit;});
    v.units.splice(i,1);d.unitNames.splice(i,1);S.actions.drawRefresh();
  };
  document.addEventListener('input',event=>{
    if(S.top?.type!=='materialSpec'||!event.target.closest('.stock-module'))return;
    const binding=event.target.dataset?.stockBind,d=S.top.data,root=document.querySelector('#stock-layer-'+(S.state.layers.length-1));
    if(/^value\.units\.\d+\.ratio$/.test(binding||''))root?.querySelectorAll('[data-material-unit-preview]').forEach(node=>{const row=d.value.units[Number(node.dataset.materialUnitPreview)];if(row)node.textContent=conversionText(d.value,row);});
  });
  S.actions.saveMaterialSpec=()=>{
    const d=S.top.data;reconcileBase(d);const v=M.copy(d.value);
    if(!v.name.trim())throw Error('请填写规格名称。');
    ['enabled','allowFraction'].forEach(k=>v[k]=fraction(v[k]));v.units.forEach(x=>x.allowFraction=fraction(x.allowFraction));
    if(!Number.isFinite(Number(v.step))||Number(v.step)<0.001||Math.abs(Number(v.step)*1000-Math.round(Number(v.step)*1000))>1e-6)throw Error('数量增量须大于或等于 0.001，最多保留三位小数。');
    for(const row of v.units){if(!row.name)throw Error('请选择换算单位。');if(!Number.isFinite(Number(row.ratio))||Number(row.ratio)<=0)throw Error('请填写“1 '+row.name+' = 多少 '+row.parent+'”的换算数量。');}
    let units;try{units=M.unitTable(v);}catch(e){throw Error(e.message.replaceAll('下级单位','折算单位'));}
    Object.keys(v.defaults).forEach(k=>{if(!units[v.defaults[k]])throw Error(roleLabels[k]+'尚未配置换算关系。');});
    const parent=S.state.layers.at(-2).data.value;d.index<0?parent.specs.push(v):parent.specs.splice(d.index,1,v);S.close();S.actions.drawRefresh();
  };
  S.actions.materialMasters=()=>S.open('materialMasters',{type:'brands'},'品牌管理',860);
  S.drawers.materialMasters=l=>({body:S.table([['名称',x=>E(x.name),200],['联系人',x=>E(x.contact||'—')],['电话',x=>E(x.phone||'—')],['状态',x=>S.tag(x.enabled?'启用':'停用')],['操作',x=>L('编辑','materialMaster',x.id),90]],S.data[l.data.type]),footer:B('关闭','close')+B('新增','materialMaster','','','primary')});
  S.actions.materialMaster=id=>S.open('materialMaster',{type:S.top.data.type,value:S.data[S.top.data.type].find(x=>x.id===id)||{name:'',contact:'',phone:'',enabled:true}},'维护资料',560);
  S.drawers.materialMaster=l=>({body:S.form([F('名称',I('名称',l.data.value.name,'value.name'),true),F('状态',C('资料状态',[['true','启用'],['false','停用']],String(l.data.value.enabled),'value.enabled'))]),footer:B('取消','close')+B('保存','saveMaterialMaster','','','primary')});
  S.actions.saveMaterialMaster=()=>S.run('catalog.save',S.top.data,()=>{S.close();S.actions.drawRefresh();});
})(StockPC);
