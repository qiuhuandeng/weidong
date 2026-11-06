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
  P.handlers['sales.recipe']=(s,p)=>{
    const basic=P.validate(s).basics.find(x=>x.id===p.basicId);
    if(!basic)throw Error('基础产品已不存在，请重新选择。');
    const rows=P.materials(s,p.materials);
    basic.materials=rows;basic.updatedAt=M.now();return basic.id;
  };
  const model={line,describe};
  root.PCModules=root.PCModules||{};root.PCModules['sales-recipes']=model;
  if(typeof module==='object'&&module.exports)module.exports=model;
})(typeof window==='undefined'?globalThis:window);
