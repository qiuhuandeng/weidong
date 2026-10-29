window.PCModules['stock-management']=(()=>{
  const S=StockPC;
  const ready=Promise.resolve().then(()=>S.db.initialize()).catch(error=>{S.state.error=error;});
  return {
    ready,
    render(){S.state.active=true;S.state.route=location.hash.slice(1).split('?')[0];S.render();},
    redraw(){S.render();},
    go(path,id){location.hash=path+(id?'?id='+encodeURIComponent(id):'');},
    leave(){S.state.active=false;while(S.state.layers.length)S.close();}
  };
})();
