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
  function stockUnits(s){
    const M=root.WeidStockModel;
    return s?[...new Set(M.catalog(s).map(x=>M.defaultUnit(s,x.pid,x.sid,'stock')))]:[];
  }
  function defaults(s){
    const today=root.WeidStockModel.now().slice(0,10),[year,month]=today.split('-').map(Number),last=new Date(year,month,0).getDate();
    const units=stockUnits(s);
    return {dateFrom:today.slice(0,7)+'-01',dateTo:today.slice(0,7)+'-'+last,wid:[],pid:[],category:'',stockUnit:units.includes('盒')?'盒':units[0]||''};
  }
  root.WeidStockOverview={metrics,rows,stockUnits,defaults};
})(typeof window==='undefined'?globalThis:window);
