/* Configurable complaint dictionaries; separate from complaint records and other systems. */
window.PCComplaintOptions = (() => {
  const DEFAULTS={demands:['正和客户协商退款金额','正和门店协商退款业绩','已和客户达成退款金额，待付款','无法联系上客户','客户提出的赔偿金额不合理（退一赔三）','客户提出的赔偿金额不合理（退一赔十）'],types:['闭店','咨询报价','前端话术','门店环境','门店多收','祛斑反黑','顾客自身','光电操作','脱毛操作','门店服务','医美效果','皮肤效果','脱毛效果','光电效果','广告宣传','前后端服务','仪器资质','产品价格','负面新闻','门店加单','顾客交钱没做','抗衰效果','产品过敏']};
  const LABELS={demands:'客户诉求',types:'售后类型'},copy=value=>JSON.parse(JSON.stringify(value));
  const LEVELS=['1级','2级','3级','4级','5级'];
  let current={schema:1,revision:0,...copy(DEFAULTS),demandTimings:{}},failure='',database,channel;
  const listeners=new Set();
  function timingValue(value,unit='hours'){
    if(value===''||value===null||value===undefined)return null;
    const amount=Number(value),factor=unit==='hours'?3600000:unit==='days'?86400000:0;
    if(!factor||!Number.isSafeInteger(amount)||amount<=0||!Number.isSafeInteger(amount*factor))throw Error('处理时效须为正整数，单位为小时或天');
    return {value:amount,unit};
  }
  const timingText=timing=>timing?timing.value+' '+(timing.unit==='days'?'天':'小时'):'未设置';
  function dayValue(value){
    if(value===''||value===null||value===undefined)return null;
    const days=Number(value);
    if(!Number.isFinite(days)||days<=0||!Number.isSafeInteger(Math.round(days*86400000))||days*86400000<60000)throw Error('处理天数须大于 0，且不少于 1 分钟');
    return days;
  }
  function daysByLevel(timing){
    if(!timing)return {};
    // Preserve existing uniform limits until the user changes a particular level.
    return timing.byLevel?copy(timing.byLevel):Object.fromEntries(LEVELS.map(level=>[level,timing.unit==='hours'?timing.value/24:timing.value]));
  }
  function timingFor(config,name,level){
    if(!LEVELS.includes(level)||!Object.hasOwn(config.demandTimings||{},name))return null;
    const timing=config.demandTimings[name];
    if(!timing.byLevel)return copy(timing);
    return Object.hasOwn(timing.byLevel,level)?{value:timing.byLevel[level],unit:'days'}:null;
  }
  function validate(value){
    if(value?.schema!==1||!Number.isSafeInteger(value.revision)||value.revision<0)throw Error('下拉选项配置格式不兼容，原配置已保留');
    for(const [key,label]of Object.entries(LABELS)){
      const items=value[key];
      if(!Array.isArray(items)||!items.length)throw Error(label+'至少保留一个选项');
      if(items.some(item=>typeof item!=='string'||!item.trim()||item!==item.trim()||item.length>50))throw Error(label+'的选项名称须为 1–50 个字符，且首尾不能有空格');
      if(new Set(items).size!==items.length)throw Error(label+'存在重复选项');
    }
    const timings=value.demandTimings??{};
    if(typeof timings!=='object'||Array.isArray(timings))throw Error('处理时效配置格式不兼容，原配置已保留');
    for(const [name,timing]of Object.entries(timings)){
      if(!value.demands.includes(name)||!timing||typeof timing!=='object'||Array.isArray(timing))throw Error('处理时效配置无效，原配置已保留');
      if(Object.hasOwn(timing,'byLevel')){
        if(!timing.byLevel||typeof timing.byLevel!=='object'||Array.isArray(timing.byLevel))throw Error('等级时效配置格式无效，原配置已保留');
        for(const [level,days]of Object.entries(timing.byLevel))if(!LEVELS.includes(level)||typeof days!=='number'||!dayValue(days))throw Error('等级时效配置无效，原配置已保留');
      }else if(!['hours','days'].includes(timing.unit)||typeof timing.value!=='number'||!timingValue(timing.value,timing.unit))throw Error('处理时效配置无效，原配置已保留');
    }
    return {...value,demandTimings:copy(timings)};
  }
  function open(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      let request,settled=false;
      const timer=setTimeout(()=>finish(Error('配置数据库打开超时，请关闭旧页面后重试')),5000);
      function finish(error,db){if(settled){db?.close();return}settled=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{request=indexedDB.open('weid-pc-complaint-options-v1',1)}catch(error){finish(error);return}
      request.onupgradeneeded=()=>request.result.createObjectStore('options');
      request.onerror=()=>finish(request.error||Error('配置数据库无法打开'));
      request.onblocked=()=>finish(Error('配置数据库被旧页面占用，请关闭旧页面后重试'));
      request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(error=>{database=null;throw error});
    return database;
  }
  function accept(value){current=copy(validate(value));failure='';return copy(current)}
  async function read(){
    try{
      const db=await open();
      const value=await new Promise((resolve,reject)=>{
        const tx=db.transaction('options','readonly'),request=tx.objectStore('options').get('dictionary');
        tx.oncomplete=()=>resolve(request.result===undefined?{schema:1,revision:0,...copy(DEFAULTS)}:request.result);
        tx.onabort=tx.onerror=()=>reject(tx.error||request.error||Error('配置读取失败'));
      });
      return accept(value);
    }catch(error){failure=error.message||String(error);throw error}
  }
  async function save(draft,expected){
    const next=validate({schema:1,revision:expected+1,demands:copy(draft.demands),types:copy(draft.types),demandTimings:copy(draft.demandTimings||{})}),db=await open();
    await new Promise((resolve,reject)=>{
      const tx=db.transaction('options','readwrite'),store=tx.objectStore('options'),request=store.get('dictionary');let cause;
      request.onsuccess=()=>{try{
        const saved=request.result;
        if((saved===undefined?0:validate(saved).revision)!==expected)throw Error('其他页面已更新配置，请关闭后重新打开配置；当前修改尚未保存');
        store.put(next,'dictionary');
      }catch(error){cause=error;tx.abort()}};
      tx.oncomplete=resolve;
      tx.onabort=tx.onerror=()=>reject(cause||tx.error||request.error||Error('配置保存失败'));
    });
    accept(next);
    // Notification failures cannot undo an already committed configuration.
    try{channel?.postMessage(next.revision)}catch{}
    return copy(current);
  }
  function options(key,selected='',history=[]){
    const items=current[key].map(value=>[value,value]);
    for(const value of [...history,selected])if(value&&!items.some(([item])=>item===value))items.push([value,value+'（历史）']);
    return items;
  }
  async function refresh(){try{const before=JSON.stringify(current);await read();if(before!==JSON.stringify(current))listeners.forEach(listener=>listener())}catch{}}
  try{channel=new BroadcastChannel('weid.pc.complaint-options');channel.onmessage=refresh}catch{}
  window.addEventListener('focus',refresh);
  return {LABELS,LEVELS,read,save,validate,timingValue,timingText,dayValue,daysByLevel,timingFor,options,refresh,subscribe:listener=>listeners.add(listener),get current(){return copy(current)},get error(){return failure}};
})();
