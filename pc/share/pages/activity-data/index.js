window.PCModules['activity-data']=(()=>{
  const store=WeidActivityStorage.create();let error;
  const ready=Promise.resolve().then(()=>store.initialize()).catch(e=>{error=e;});
  return {store,ready,get error(){return error;},async reload(){try{await store.read();error=null;}catch(e){error=e;throw e;}}};
})();
