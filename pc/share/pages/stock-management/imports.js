(function(S){
  'use strict';
  const {M,E}=S,B=S.button,F=S.field,C=S.select;
  const headers={
    inbound:['门店仓库','产品编号','规格型号','入库数量','业务单位','采购单价','供应商'],
    replenish:['门店仓库','产品编号','规格型号','申请数量','业务单位'],
    shipping:['补货单号','产品编号','规格型号','发货仓库','实发数量','物流单号','业务单位'],
    products:['产品编号','产品名称','分类名称','计量单位','规格型号','销售原价','成本价','使用次数','产品归属','领用','启用状态','包装换算','默认采购单位','默认库存单位','默认销售单位','默认消耗单位','最小单位步长','允许小数']
  };
  S.actions.import=type=>S.open('import',{type,rows:[],operations:[],errors:[],filename:'',inboundType:'采购入库'},'导入'+({inbound:'入库单',replenish:'门店补货单',shipping:'发货单',products:'产品'})[type],1120);
  S.drawers.import=l=>{
    const d=l.data;
    return {body:(d.type==='inbound'?S.form([F('入库类型',C('入库类型',['调拨入库','退货入库','采购入库','归还入库','盘盈入库'],d.inboundType,'inboundType'),true)]):'')+'<div class="stock-inline">'+B('下载模板','template')+'<input type="file" accept=".xlsx,.csv" aria-label="选择导入文件" data-stock-action="importFile"></div>'+(d.filename?'<p>'+E(d.filename)+' · 共 '+d.rows.length+' 行</p>':'')+(d.errors.length?'<div class="stock-error" role="alert">'+d.errors.map(E).join('<br>')+'</div>':'')+(d.rows.length?S.table([['行号',x=>x.line,70],...headers[d.type].map(h=>[h,x=>E(x[h]),130])],d.rows):'<p>支持 xlsx 与 UTF-8 CSV。先校验全部数据，确认后保存；相同仓库的入库或补货行合并成一张单据。业务单位为空时按最小单位；包装换算示例：箱=12盒;盒=5片。</p>'),footer:B('取消','close')+B('重新校验','validateImport')+B('确认导入','confirmImport','','','primary',!d.rows.length||d.errors.length>0)};
  };
  S.actions.template=()=>StockExchange.download('库存'+S.top.data.type+'导入模板',headers[S.top.data.type].map(h=>h.replace('产品','物料')),[]);
  S.actions.importFile=async(id,extra,input)=>{
    const l=S.top,file=input.files[0];if(!file)return;
    const rows=await StockExchange.read(file);if(!S.state.layers.includes(l))return;
    l.data.rows=rows;l.data.filename=file.name;S.validateImport(l);S.actions.drawRefresh();
  };
  S.validateImport=l=>{
    const d=l.data,errors=[],ops=[],groups=new Map(),staged=M.copy(S.data);
    const wh=(name,row)=>{const w=staged.warehouses.find(x=>x.name===name&&x.enabled);if(!w)throw Error('第 '+row+' 行：仓库“'+name+'”不存在或未启用。');return w.id;};
    const item=r=>{const p=staged.products.find(x=>x.code===r['产品编号']);if(!p)throw Error('第 '+r.line+' 行：产品编号不存在。');const sp=p.specs.find(x=>x.name===r['规格型号']);if(!sp)throw Error('第 '+r.line+' 行：规格型号不存在。');return {pid:p.id,sid:sp.id,key:M.key(p.id,sp.id)};};
    for(const r of d.rows)try{
      for(const [modern,old] of [['物料编号','产品编号'],['物料名称','产品名称'],['物料归属','产品归属']])if(r[modern]&&!r[old])r[old]=r[modern];
      for(const h of headers[d.type].slice(0,d.type==='products'?5:d.type==='shipping'?5:4))if(!r[h])throw Error('第 '+r.line+' 行：请填写'+h+'。');
      if(d.type==='products'){
        let p=groups.get(r['产品编号']);
        if(!p){if(staged.products.some(x=>x.code===r['产品编号']))throw Error('第 '+r.line+' 行：产品编号已存在，请使用编辑修改。');const cat=staged.categories.find(x=>x.name===r['分类名称']);if(!cat)throw Error('第 '+r.line+' 行：分类名称不存在。');p={code:r['产品编号'],name:r['产品名称'],category:cat.id,unit:r['计量单位'],specs:[],tags:[],pictures:[],thumbnail:'',shelfLife:r['保质期'],origin:r['产品归属']||'公司',useEnabled:r['领用']!=='禁用',enabled:r['启用状态']==='启用'};groups.set(p.code,p);}
        const units=(r['包装换算']||'').split(/[;；]/).filter(Boolean).map(t=>{const m=t.trim().match(/^(.+?)\s*=\s*([0-9.]+)\s*(.+)$/);if(!m)throw Error('包装换算请按 箱=12盒;盒=5片 填写。');return {name:m[1].trim(),ratio:Number(m[2]),parent:m[3].trim(),allowFraction:false};});
        p.specs.push({baseUnit:p.unit,units,defaults:{purchase:r['默认采购单位']||p.unit,stock:r['默认库存单位']||p.unit,sale:r['默认销售单位']||p.unit,consume:r['默认消耗单位']||p.unit},step:Number(r['最小单位步长']||0.001),allowFraction:r['允许小数']!=='否',name:r['规格型号'],price:M.quantity(r['销售原价']||0,'销售原价'),cost:M.quantity(r['成本价']||0,'成本价'),uses:M.quantity(r['使用次数']||1,'使用次数',false)});
      }else if(d.type==='shipping'){
        const doc=staged.documents.find(x=>x.no===r['补货单号']&&x.kind==='replenish');if(!doc)throw Error('第 '+r.line+' 行：补货单号不存在。');
        const x=item(r),wid=wh(r['发货仓库'],r.line);const line=doc.lines.find(l=>l.key===x.key);if(r['业务单位']&&line&&r['业务单位']!==line.unit)throw Error('第 '+r.line+' 行：发货单位须与原单一致（'+line.unit+'）。');if(!doc.lines.some(l=>l.key===x.key))throw Error('第 '+r.line+' 行：该物品不属于此补货单。');
        if(!groups.has(doc.id))groups.set(doc.id,doc.shipments.filter(s=>s.status==='待发货'));
        groups.get(doc.id).push({id:M.uid('SH'),lineKey:x.key,wid,qty:M.quantity(r['实发数量'],'实发数量',false),tracking:r['物流单号']||'',status:'待发货'});
      }else{
        const wid=wh(r['门店仓库'],r.line),x=item(r),qty=M.quantity(r[d.type==='inbound'?'入库数量':'申请数量'],'申请数量',false);
        const unit=r['业务单位']||M.spec(staged,x.pid,x.sid).baseUnit,unitPrice=r['采购单价']===''||r['采购单价']===undefined?undefined:Number(r['采购单价']),supplier=r['供应商']?staged.suppliers.find(v=>v.name===r['供应商']&&v.enabled)?.id:'';if(r['供应商']&&!supplier)throw Error('供应商不存在或停用。');
        if(!groups.has(wid))groups.set(wid,[]);const lines=groups.get(wid),old=lines.find(l=>l.key===x.key);if(old){if(old.unit!==unit||old.unitPrice!==unitPrice||old.supplier!==supplier)throw Error('同一仓库同一规格的单位、单价和供应商须一致。');old.qty+=qty;}else lines.push({...x,qty,unit,unitPrice,supplier});
      }
    }catch(e){errors.push(e.message);}
    for(const [id,value] of groups){
      const op=d.type==='products'?{command:'catalog.save',payload:{type:'products',value}}:d.type==='shipping'?{command:'document.action',payload:{id,action:'saveShipments',shipments:value}}:{command:'document.save',payload:{kind:d.type==='inbound'?'inbound':'replenish',wid:id,type:d.inboundType,lines:value,submit:true}};
      try{M.apply(staged,op.command,op.payload);ops.push(op);}catch(e){errors.push(e.message);}
    }
    d.errors=errors;d.operations=ops;
  };
  S.actions.validateImport=()=>{S.validateImport(S.top);S.actions.drawRefresh();};
  S.actions.confirmImport=()=>{
    const l=S.top;S.validateImport(l);if(l.data.errors.length){S.actions.drawRefresh();return;}
    if(!l.data.operations.length)throw Error('没有可导入的数据。');
    return S.run('batch',{operations:l.data.operations},()=>S.close(),l.revision);
  };
})(StockPC);
