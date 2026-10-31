(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,F=S.field,I=S.input,C=S.select;
  S.actions.taskEdit=id=>{
    const t=S.data.tasks.find(x=>x.id===id)||{name:'',warehouses:[],products:[],mode:'all'};
    S.open('taskForm',{...t,storeQuery:'',productQuery:'',category:''},id?'编辑盘点任务':'发起盘点任务',860);
  };
  S.actions.taskCopy=id=>{const t=M.copy(S.data.tasks.find(x=>x.id===id));delete t.id;t.name+='（复制）';t.storeQuery='';t.productQuery='';t.category='';S.open('taskForm',t,'复制盘点任务',860);};
  S.drawers.taskForm=l=>{
    const d=l.data,warehouses=S.data.warehouses.filter(x=>x.enabled&&S.matches(x.name,d.storeQuery)),products=S.data.products.filter(x=>x.enabled&&S.matches(x.name,d.productQuery)&&(!d.category||x.category===d.category));
    return {body:S.form([F('任务名称',I('任务名称',d.name,'name'),true)])+'<div class="stock-pickers"><section>'+S.section('门店',I('搜索门店',d.storeQuery,'storeQuery')+B('查询','drawRefresh')+B('全选','taskSelectAll','warehouses')+B('清空','taskClear','warehouses')+'<p>已选 '+d.warehouses.length+' 家</p><div class="stock-choice-list">'+warehouses.map(w=>S.check(w.name,d.warehouses.includes(w.id),'taskPick',w.id,'warehouses')).join('')+'</div>')+'</section><section>'+S.section('物料',C('物料分类',S.categoryOptions(),d.category,'category')+I('搜索物料',d.productQuery,'productQuery')+B('查询','drawRefresh')+B('全选','taskSelectAll','products')+B('清空','taskClear','products')+'<p>已选 '+d.products.length+' 项</p><div class="stock-choice-list">'+products.map(p=>S.check(p.name,d.products.includes(p.id),'taskPick',p.id,'products')).join('')+'</div>')+'</section></div>'+S.form([F('盘点方式',C('盘点方式',[['all','全部盘点'],['stock','按门店库存盘点']],d.mode,'mode'))]),footer:B('取消','close')+B('确定','taskSave','','','primary')};
  };
  S.actions.taskPick=(id,type,target)=>{const set=new Set(S.top.data[type]);target.checked?set.add(id):set.delete(id);S.top.data[type]=[...set];};
  S.actions.taskSelectAll=type=>{const d=S.top.data,rows=type==='warehouses'?S.data.warehouses.filter(x=>x.enabled&&S.matches(x.name,d.storeQuery)):S.data.products.filter(x=>x.enabled&&S.matches(x.name,d.productQuery)&&(!d.category||x.category===d.category));d[type]=[...new Set([...d[type],...rows.map(x=>x.id)])];S.actions.drawRefresh();};
  S.actions.taskClear=type=>{S.top.data[type]=[];S.actions.drawRefresh();};
  S.actions.taskSave=()=>S.run('task.save',S.top.data,()=>S.close());
  S.actions.taskAction=(id,action)=>S.confirm(action==='send'?'确认发送':'作废任务',action==='send'?'确认向所选门店下发盘点任务？':'确认作废任务？未完成的门店任务将停止，已有盘点及损益记录保留。',()=>S.run('task.action',{id,action}));
  S.actions.taskStores=id=>S.open('taskStores',{id,query:'',status:''},S.data.tasks.find(x=>x.id===id).name,1120);
  S.drawers.taskStores=l=>{
    const t=S.data.tasks.find(x=>x.id===l.data.id),rows=t.stores.filter(x=>S.matches(S.wh(x.wid),l.data.query)&&(!l.data.status||x.status===l.data.status));
    return {body:S.layerSearch([I('门店名称',l.data.query,'query'),C('任务状态',[['','全部'],'进行中','已完成','已取消'],l.data.status,'status')])+S.table([['序号',(x,i)=>i+1],['门店',x=>E(S.wh(x.wid)),180],['任务盘点进度',x=>x.rows.filter(r=>r.counted!==null).length+'/'+x.rows.length],['任务处理进度',x=>x.rows.filter(r=>r.processed).length+'/'+x.rows.length],['任务状态',x=>S.tag(x.status)],['操作人',x=>E(x.rows.find(r=>r.counter)?.counter||'—')],['操作',x=>L('详情','countDetail',t.id,x.wid)+(x.status==='进行中'?L('取消','storeTaskAction',t.id,x.wid+'|cancelStore'):'')+(t.status!=='已作废'?L('重新盘点','storeTaskAction',t.id,x.wid+'|recount'):''),260]],rows)};
  };
  S.actions.storeTaskAction=(id,extra)=>{
    const [wid,action]=extra.split('|');S.confirm(action==='recount'?'重新盘点':'取消门店任务',action==='recount'?'保留此前盘点记录，并重新下发该门店的盘点任务？':'确认取消该门店的未完成任务？',()=>S.run('task.action',{id,wid,action},()=>{if(S.top){S.top.revision=S.data.revision;S.actions.drawRefresh();}}));
  };
  S.actions.countDetail=(id,wid='')=>{
    const t=S.data.tasks.find(x=>x.id===id),values={};
    t.stores.forEach(st=>st.rows.forEach(r=>values[st.wid+'|'+r.key]={confirmed:r.confirmed??r.counted??0,note:r.note||''}));
    S.open('countDetail',{id,wid,status:'',values},'盘点详情',1120);
  };
  S.drawers.countDetail=l=>{
    const d=l.data,t=S.data.tasks.find(x=>x.id===d.id),rows=t.stores.filter(st=>!d.wid||st.wid===d.wid).flatMap(st=>st.rows.map(r=>({st,r}))).filter(x=>!d.status||(d.status==='未盘点'?x.r.counted===null:d.status==='待处理'?x.r.counted!==null&&!x.r.processed:x.r.processed));
    const editable=x=>x.r.counted!==null&&!x.r.processed&&t.status!=='已作废'&&x.st.status!=='已取消';
    const movement=(x,positive)=>S.data.ledger.filter(e=>e.wid===x.st.wid&&e.pid===x.r.pid&&e.sid===x.r.sid&&e.at>=x.r.baselineAt&&(positive?e.delta>0:e.delta<0)).reduce((n,e)=>n+Math.abs(e.delta),0);
    return {body:S.layerSearch([C('门店',[['','全部'],...t.stores.map(x=>[x.wid,S.wh(x.wid)])],d.wid,'wid'),C('盘点状态',[['','全部'],'未盘点','待处理','已处理'],d.status,'status')])+S.table([['门店',x=>E(S.wh(x.st.wid)),150],['物料名称',x=>E(M.product(S.data,x.r.pid)?.name),160],['规格型号',x=>E(M.spec(S.data,x.r.pid,x.r.sid)?.name)],['单位',x=>E(S.baseUnit(x.r.pid,x.r.sid))],['本仓数量',x=>x.r.baseline],['实盘录入',x=>x.r.countInput?E(x.r.countInput.quantity)+' '+E(x.r.countInput.unit):'—',140],['盘点数量',x=>x.r.counted??'—'],['当前库存',x=>M.balance(S.data,x.st.wid,x.r.pid,x.r.sid)],['差异数',x=>x.r.counted===null?'—':x.r.counted-x.r.countedBalance],['上次盘点数',x=>x.st.history?.at(-1)?.rows.find(r=>r.key===x.r.key)?.counted??'—'],['期间入库数',x=>movement(x,true)],['期间出库数',x=>movement(x,false)],['盘点时间',x=>E(x.r.countedAt||'—'),170],['状态',x=>S.tag(x.r.processed?'已处理':x.r.counted===null?'未盘点':'待处理')],['损益定责',x=>editable(x)?I('损益定责',d.values[x.st.wid+'|'+x.r.key].note,'values.'+x.st.wid+'|'+x.r.key+'.note'):E(x.r.note||'—'),180],['确认库存',x=>editable(x)?I('确认库存',d.values[x.st.wid+'|'+x.r.key].confirmed,'values.'+x.st.wid+'|'+x.r.key+'.confirmed','number'):x.r.confirmed??'—',150]],rows),footer:B('关闭','close')+B('上报损益','processCount','','','primary',!rows.some(editable))};
  };
  S.actions.processCount=()=>{
    const l=S.top,d=l.data,t=S.data.tasks.find(x=>x.id===d.id),operations=[];
    t.stores.filter(st=>(!d.wid||st.wid===d.wid)&&st.status!=='已取消').forEach(st=>{
      const rows=Object.fromEntries(st.rows.filter(r=>r.counted!==null&&!r.processed&&(!d.status||d.status==='待处理')).map(r=>[r.key,d.values[st.wid+'|'+r.key]]));
      if(Object.keys(rows).length)operations.push({command:'task.action',payload:{id:t.id,wid:st.wid,action:'process',rows}});
    });
    if(!operations.length)throw Error('没有可上报的盘点记录。');
    S.confirm('上报损益','确认按填写的库存数量上报损益？盘点后的出入库流水将继续保留。',()=>S.run('batch',{operations},()=>{l.revision=S.data.revision;S.actions.drawRefresh();},l.revision));
  };
})(StockPC);
