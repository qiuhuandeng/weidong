window.PCModules['stock-management']=(()=>{
  const S=StockPC;
  const ready=Promise.resolve().then(()=>S.db.initialize()).catch(error=>{S.state.error=error;});
  return {
    ready,
    render(){
      S.state.active=true;S.state.route=location.hash.slice(1).split('?')[0];
      if(S.state.route==='stock-ledger'&&location.hash.includes('?')&&S.ledgerLink!==location.hash){
        const query=new URLSearchParams(location.hash.split('?')[1]),pid=query.get('pid'),sid=query.get('sid'),wid=query.get('wid');
        if(S.data&&S.M.spec(S.data,pid,sid)&&S.M.warehouse(S.data,wid)){
          const filters={pid:[pid],sku:S.M.key(pid,sid),wid:[wid]};
          for(const key of ['dateFrom','dateTo'])if(/^\d{4}-\d{2}-\d{2}$/.test(query.get(key)||''))filters[key]=query.get(key);
          S.page.filters=filters;S.page.applied=S.M.copy(filters);S.page.page=1;
        }
        S.ledgerLink=location.hash;
      }
      S.render();
    },
    redraw(){S.render();},
    go(path,id){location.hash=path+(id?'?id='+encodeURIComponent(id):'');},
    leave(){S.ledgerLink='';S.state.active=false;while(S.state.layers.length)S.close();}
  };
})();
