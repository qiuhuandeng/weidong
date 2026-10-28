/* Register only the PC lifecycle; the group module never installs another shell. */
window.PCModules['group-approval'] = (() => {
  let timer,initialError;
  GA.actions['pc-page-close']=()=>GA.go(PCGroupUI.returnRoute());
  PCUI.registerPager('group-approval',(value,config)=>{
    if(config.scope==='organization')GA.setOrgPage(value.currentPage,value.pageSize);
    else GA.setListPage(value.currentPage,value.pageSize);
  });
  GA.actions['pc-upload']=button=>button.closest('.ga-upload-control').querySelector('input[type=file]').click();
  const ready=Promise.resolve().then(()=>PCGroupStorage.initialize()).then(()=>GA.boot()).catch(error=>{initialError=error;});
  return {
    ready,
    render(){
      if(initialError){document.querySelector('#main').innerHTML='<section class="panel"><div class="empty"><div>审批数据暂时无法加载</div><p>'+GA.esc(initialError.message)+'</p><button type="button" class="btn" onclick="location.reload()">重新加载</button></div></section>';return;}
      GA.enter();clearInterval(timer);timer=setInterval(()=>GA.checkTimers(),30000);
    },
    redraw(){if(!initialError)GA.render();},
    go(path,id){
      const target=path+(id?'?id='+encodeURIComponent(id):'');
      if(initialError){if(location.hash==='#'+target)location.reload();else location.hash=target;return;}
      GA.go('@'+target);
    },
    leave(){clearInterval(timer);PCGroupUI.leave();}
  };
})();
