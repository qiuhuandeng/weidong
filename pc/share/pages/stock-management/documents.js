(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const titles={transfer:'调拨',inbound:'入库',purchase:'采购',replenish:'补货',issue:'领用'};
  const section=(title,body,actions='')=>'<section class="stock-section"><div class="stock-section-head"><h3>'+E(title)+'</h3><div class="actions">'+actions+'</div></div>'+body+'</section>';
  const summary=values=>'<div class="stock-summary">'+Object.entries(values).map(([k,v])=>'<div><span>'+E(k)+'：</span><div>'+E(v||'—')+'</div></div>').join('')+'</div>';
  S.section=section;S.summary=summary;
  const lineCols=[['序号',(l,i)=>i+1,65],['编号',l=>E(l.code||M.product(S.data,l.pid)?.code)],['物品名称',l=>E(l.name||M.product(S.data,l.pid)?.name),150],['规格型号',l=>E(l.spec||M.spec(S.data,l.pid,l.sid)?.name)],['单位',l=>E(l.unit||M.product(S.data,l.pid)?.unit),65]];
  S.lineCols=lineCols;
  S.actions.newDocument=kind=>S.open('docForm',{kind,wid:'',to:'',type:'',lines:[],step:kind==='replenish'?1:2},'申请'+titles[kind],860);
  S.actions.document=id=>{
    const d=S.data.documents.find(x=>x.id===id);if(!d)throw Error('单据不存在。');
    if(d.status==='待提交')S.open('docForm',{...d,step:2},'编辑'+titles[d.kind]+'申请',860);
    else S.open('document',{...d,quantities:Object.fromEntries(d.lines.map(l=>[l.key,d.kind==='replenish'?(l.expected??l.approved??l.qty):l.qty-(l.received||0)])),comment:''},titles[d.kind]+'单详情',d.kind==='replenish'?1120:860);
  };
  S.drawers.docForm=l=>{
    const d=l.data,kind=d.kind;
    if(kind==='replenish'&&d.step===1)return {body:S.form([F('申请补货仓库',C('申请补货仓库',[['','请选择'],...S.whOptions(false)],d.wid,'wid'),true)]),footer:B('取消','close')+B('下一步','replenishNext','','','primary')};
    const controls=[F(kind==='transfer'?'调出门店仓库':'门店仓库',C('门店仓库',[['','请选择'],...S.whOptions(false)],d.wid,'wid'),true)];
    if(kind==='transfer')controls.push(F('调入门店仓库',C('调入门店仓库',[['','请选择'],...S.whOptions(false)],d.to,'to'),true));
    if(kind==='inbound')controls.push(F('入库类型',C('入库类型',[['','请选择'],'调拨入库','退货入库','采购入库','归还入库','盘盈入库'],d.type,'type'),true));
    const columns=[...lineCols,['本仓数量',x=>M.balance(S.data,d.wid,x.pid,x.sid)],...(kind==='inbound'?[['采购单价（元）',x=>M.spec(S.data,x.pid,x.sid)?.cost||0,140]]:[]),['申请'+titles[kind]+'数量',(x,i)=>I('申请数量',x.qty,'lines.'+i+'.qty','number'),150],['操作',(x,i)=>L('移除','removeLine',String(i)),90]];
    return {body:S.form(controls)+section('物品信息',S.table(columns,d.lines),B('新增物品','pickProducts','','','primary')),footer:B('取消','close')+(kind==='replenish'?B('上一步','replenishBack'):B('保存草稿','saveDocument','draft'))+B(kind==='replenish'?'提交补货单':'提交审核','saveDocument','submit','','primary')};
  };
  S.actions.replenishNext=()=>{if(!M.warehouse(S.data,S.top.data.wid)?.enabled)throw Error('请选择启用的申请仓库。');S.top.data.step=2;S.renderLayer(S.state.layers.length-1);};
  S.actions.replenishBack=()=>{S.top.data.step=1;S.renderLayer(S.state.layers.length-1);};
  S.actions.removeLine=id=>{S.top.data.lines.splice(Number(id),1);S.renderLayer(S.state.layers.length-1);};
  S.actions.saveDocument=mode=>{
    const l=S.top,p={...l.data,submit:mode==='submit'};
    return S.run('document.save',p,()=>S.close(),l.revision);
  };
  S.actions.pickProducts=()=>{
    const parent=S.top;S.open('picker',{query:'',category:'',selected:(parent.data.lines||[]).map(x=>M.key(x.pid,x.sid))},'添加物品',860);
  };
  S.drawers.picker=l=>{
    const d=l.data,rows=M.catalog(S.data).filter(x=>x.product.enabled&&S.matches(x.product.name+' '+x.product.code,d.query)&&(!d.category||x.product.category===d.category));
    return {body:S.layerSearch([I('物品名称',d.query,'query'),C('产品分类',S.categoryOptions(),d.category,'category')])+B('全选当前结果','pickAll')+B('清空选择','pickNone')+S.table([[S.check('选择',rows.length>0&&rows.every(x=>d.selected.includes(x.key)),'pickAll'),x=>S.check('',d.selected.includes(x.key),'pick',x.key),60],['编号',x=>E(x.product.code)],['物品名称',x=>E(x.product.name),170],['所属分类',x=>E(S.cat(x.product.category))],['单位',x=>E(x.product.unit)],['规格型号',x=>E(x.name)]],rows),footer:'<span data-stock-picked>已选 '+d.selected.length+' 项</span>'+B('取消','close')+B('确定','pickConfirm','','','primary')};
  };
  S.actions.drawRefresh=()=>S.renderLayer(S.state.layers.length-1);
  S.actions.pick=(id,extra,target)=>{const set=new Set(S.top.data.selected);target.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];const counter=document.querySelector('#stock-layer-'+(S.state.layers.length-1)+' [data-stock-picked]');if(counter)counter.textContent='已选 '+set.size+' 项';};
  S.actions.pickAll=()=>{const d=S.top.data;d.selected=[...new Set([...d.selected,...M.catalog(S.data).filter(x=>x.product.enabled&&S.matches(x.product.name+' '+x.product.code,d.query)&&(!d.category||x.product.category===d.category)).map(x=>x.key)])];S.actions.drawRefresh();};
  S.actions.pickNone=()=>{S.top.data.selected=[];S.actions.drawRefresh();};
  S.actions.pickConfirm=()=>{
    const picked=S.top.data.selected,parent=S.state.layers.at(-2),existing=parent.data.lines||[];
    parent.data.lines=picked.map(k=>existing.find(x=>M.key(x.pid,x.sid)===k)||(()=>{const x=M.catalog(S.data).find(x=>x.key===k);return {pid:x.pid,sid:x.sid,key:k,name:x.product.name,code:x.product.code,spec:x.name,unit:x.product.unit,qty:0,approved:0};})());
    S.close();S.renderLayer(S.state.layers.length-1);
  };
  function comments(d){
    return section('评论记录',(d.comments||[]).map(x=>'<article class="stock-comment"><small>'+E(x.actor)+' · '+E(x.at)+'</small><p>'+E(x.text)+'</p><div class="stock-photos">'+(x.files||[]).map(file=>'<a href="'+E(file.src)+'" target="_blank"><img src="'+E(file.src)+'" alt="'+E(file.name)+'"></a>').join('')+'</div></article>').join('')+'<textarea aria-label="评论内容" data-stock-bind="comment" maxlength="200" rows="3" placeholder="请输入评论，最多 200 字">'+E(d.comment||'')+'</textarea>'+B('发送','comment'));
  }
  S.comments=comments;
  S.drawers.document=l=>{
    const d=l.data,review=d.kind==='replenish'&&d.status==='待审核',verify=d.kind==='replenish'&&d.status==='待核数',receive=d.kind==='inbound'&&['待入库','部分入库'].includes(d.status);
    let columns=[...lineCols,['本仓数量',x=>M.balance(S.data,d.wid,x.pid,x.sid)],['申请数量',x=>x.qty]];
    if(d.kind==='inbound')columns.push(['采购单价（元）',x=>x.cost,140],['已入库数量',x=>x.received||0],['确认入库数量',x=>receive?I('本次入库数量',d.quantities[x.key],'quantities.'+x.key,'number'):x.received||0,160]);
    if(d.kind==='replenish'){
      columns.push(['审核数量',(x,i)=>review?I('审核数量',x.approved??x.qty,'lines.'+i+'.approved','number'):x.approved??'—',140],['应发数量',x=>verify?I('应发数量',d.quantities[x.key],'quantities.'+x.key,'number'):x.expected??'—',140],['实发数量',x=>M.sum(d.shipments.filter(sh=>sh.lineKey===x.key&&sh.status!=='待发货'),'qty')],['实收数量',x=>M.sum(d.shipments.filter(sh=>sh.lineKey===x.key),'actual')]);
      if(review)columns.push(['操作',(x,i)=>L('移除','removeLine',String(i)),90]);
    }
    if(d.kind==='purchase')columns.push(['采购状态',x=>E(x.purchaseStatus||(['待提交','待审核'].includes(d.status)?'—':'待采购'))],['操作',x=>['待采购','部分采购','待入库','部分入库','已完成'].includes(d.status)?L('采购处理','purchaseItem',d.id,x.key):'—',120]);
    const info={'单据编号':d.no,'状态':d.status,'门店仓库':S.wh(d.wid),...(d.kind==='transfer'?{'调入门店仓库':S.wh(d.to)}:{}),'申请人':d.createdBy,'申请时间':d.createdAt,'审核人':d.reviewer,'审核时间':d.reviewAt,...(d.kind==='inbound'?{'入库类型':d.type,'入库时间':d.receivedAt}:{}),...(d.kind==='replenish'?{'核对人':d.verifier,'核对时间':d.verifiedAt,'完成时间':d.completedAt}:{})};
    let footer=B('关闭','close');
    if(d.status==='待审核')footer+=(review?B('保存草稿','docAction','reviewDraft'):'')+B('通过审核','docAction','approve','','primary')+B('拒绝申请','docAction','reject');
    if(verify)footer+=B('核对完成','docAction','verify','','primary');
    if(receive)footer+=B('确认入库','docAction','receiveInbound','','primary');
    if(d.kind==='transfer'&&d.status==='待发货')footer+=B('确认发货','docAction','shipTransfer','','primary');
    if(d.kind==='transfer'&&d.status==='待收货')footer+=B('确认收货','docAction','receiveTransfer','','primary');
    if(d.kind==='transfer'&&d.status==='待审核')footer+=B('撤销申请','docAction','revoke');
    if(d.kind==='replenish'&&['待发货','在途','部分收货','已完成'].includes(d.status))footer+=B('发货管理','shipping',d.id,'','primary');
    const history=section('操作记录',S.table([['时间',x=>E(x.at),170],['操作人',x=>E(x.actor)],['操作',x=>E(x.action)],['备注',x=>E(x.note||'—'),200]],d.logs||[]));
    return {body:summary(info)+(d.reason?'<p>拒绝原因：'+E(d.reason)+'</p>':'')+section('物品信息',S.table(columns,d.lines),review?B('添加产品','pickProducts'):'')+(d.kind==='replenish'?comments(d):'')+history,footer};
  };
  S.actions.docAction=action=>{
    const l=S.top,p={id:l.data.id,action,lines:l.data.lines,quantities:l.data.quantities};
    if(action==='reject'){S.open('reject',{id:l.data.id,reason:''},'拒绝申请',560);return;}
    const run=()=>S.run('document.action',p,()=>{const id=p.id;S.close();S.actions.document(id);},l.revision);
    if(['approve','shipTransfer','receiveTransfer','revoke','receiveInbound','verify'].includes(action))S.confirm('确认操作','确认'+({approve:'通过该申请',shipTransfer:'发货并扣减调出仓库库存',receiveTransfer:'收货并增加调入仓库库存',revoke:'撤销该申请',receiveInbound:'按填写数量入库',verify:'完成应发数量核对'})[action]+'？',run);else return run();
  };
  S.drawers.reject=l=>({body:S.form([F('拒绝原因','<textarea rows="4" aria-label="拒绝原因" data-stock-bind="reason">'+E(l.data.reason)+'</textarea>')]),footer:B('取消','close')+B('拒绝申请','rejectConfirm','','','primary')});
  S.actions.rejectConfirm=()=>S.run('document.action',{id:S.top.data.id,action:'reject',reason:S.top.data.reason},()=>{S.close();S.close();});
  S.actions.comment=()=>{
    const l=S.top;return S.run('document.action',{id:l.data.id,action:'comment',text:l.data.comment},()=>{
      l.data.comments=M.copy(S.data.documents.find(x=>x.id===l.data.id).comments);l.data.comment='';l.revision=S.data.revision;S.actions.drawRefresh();
    },l.revision);
  };
  S.actions.batch=action=>{
    const docs=S.data.documents.filter(x=>S.page.selected.includes(x.id));if(!docs.length)throw Error('请选择入库单。');
    if(docs.some(x=>x.kind!=='inbound'||!(action==='approve'?['待审核']:['待入库','部分入库']).includes(x.status)))throw Error(action==='approve'?'批量审核只能选择待审核入库单。':'批量入库只能选择待入库或部分入库单。');
    const operations=docs.map(d=>({command:'document.action',payload:{id:d.id,action,quantities:Object.fromEntries(d.lines.map(l=>[l.key,l.qty-(l.received||0)]))}}));
    S.confirm(action==='approve'?'批量审核':'批量入库','确认处理已选 '+docs.length+' 张单据'+(action==='receiveInbound'?'，将全部剩余数量入库':'')+'？',()=>S.run('batch',{operations},()=>S.page.selected=[]));
  };
  S.actions.purchaseItem=(id,lineKey)=>{
    const d=S.data.documents.find(x=>x.id===id),line=d.lines.find(x=>x.key===lineKey);
    S.open('purchaseItem',{id,lineKey,line,status:line.purchaseStatus||'待付款',price:line.purchasePrice??line.cost,tracking:line.tracking||'',note:line.purchaseNote||'',readonly:['已采购','不采购'].includes(line.purchaseStatus)},'采购物品',560);
  };
  S.drawers.purchaseItem=l=>{
    const d=l.data,disabled=d.readonly?'disabled':'';
    return {body:summary({'产品名称':d.line.name,'规格型号':d.line.spec,'采购数量':d.line.qty})+S.form([F('采购状态',C('采购状态',['待付款','已采购','不采购'],d.status,'status',disabled)),F('采购单价（元）',I('采购单价',d.price,'price','number',disabled)),F('快递 / 物流',I('快递 / 物流',d.tracking,'tracking','text',disabled)),F('备注','<textarea aria-label="采购备注" data-stock-bind="note" '+disabled+'>'+E(d.note)+'</textarea>')]),footer:B('关闭','close')+(d.readonly?'':B('保存','savePurchaseItem','','','primary'))};
  };
  S.actions.savePurchaseItem=()=>S.run('document.action',{...S.top.data,action:'purchaseItem'},()=>{
    S.close();if(S.top?.type==='document'){const id=S.top.data.id;S.close();S.actions.document(id);}
  });
  S.actions.shipping=(id,lineKey)=>{
    const d=S.data.documents.find(x=>x.id===id);S.open('shipping',{...d,lineKey,selected:[],comment:''},'发货管理',1120);
  };
  S.drawers.shipping=l=>{
    const d=l.data,rows=d.shipments.filter(x=>!d.lineKey||x.lineKey===d.lineKey),readonly=d.status==='已完成',columns=[
      [S.check('全选',rows.length>0&&rows.filter(x=>x.status==='待发货').every(x=>d.selected.includes(x.id)),'shipAll'),x=>x.status==='待发货'?S.check('',d.selected.includes(x.id),'shipPick',x.id):'',55],
      ['序号',(x,i)=>i+1,65],['产品名称',x=>E(d.lines.find(l=>l.key===x.lineKey)?.name),160],['规格型号',x=>E(d.lines.find(l=>l.key===x.lineKey)?.spec)],
      ['发货仓库',x=>x.status==='待发货'?C('发货仓库',[['','请选择'],...S.whOptions(false)],x.wid,'shipments.'+d.shipments.indexOf(x)+'.wid'):E(S.wh(x.wid)),190],
      ['实发数量',x=>x.status==='待发货'?I('实发数量',x.qty,'shipments.'+d.shipments.indexOf(x)+'.qty','number'):x.qty,140],
      ['物流单号',x=>x.status==='待发货'?I('物流单号',x.tracking,'shipments.'+d.shipments.indexOf(x)+'.tracking'):E(x.tracking||'—'),190],
      ['状态',x=>S.tag(x.status)],['发货时间',x=>E(x.shippedAt||'—'),170],['实收数量',x=>x.actual??'—'],['差异数量',x=>x.difference??'—'],['操作',x=>x.status==='待发货'?L('移除','shipRemove',x.id):'',90]];
    const totals=d.lines.filter(x=>!d.lineKey||x.key===d.lineKey).map(x=>({name:x.name,spec:x.spec,expected:x.expected,sent:M.sum(d.shipments.filter(sh=>sh.lineKey===x.key&&sh.status!=='待发货'),'qty')}));
    return {body:summary({'补货单号':d.no,'申请门店':S.wh(d.wid),'状态':d.status})+S.table([['产品名称',x=>E(x.name),170],['规格型号',x=>E(x.spec)],['应发数量',x=>x.expected],['待发数量',x=>x.expected-x.sent],['实发数量',x=>x.sent]],totals)+section('发货明细',S.table(columns,rows),readonly?'':B('添加','shipAdd')+B('批量移除','shipRemoveSelected')+B('批量确认发货','shipConfirm'))+comments(d),footer:B('关闭','close')+(readonly?'':B('保存','shipSave','','','primary'))};
  };
  S.actions.shipAdd=()=>{
    const d=S.top.data,line=d.lines.find(x=>x.key===d.lineKey)||d.lines[0];
    if(d.lineKey){d.shipments.push({id:M.uid('SH'),lineKey:line.key,wid:'',qty:Math.max(0,line.expected-M.sum(d.shipments.filter(x=>x.lineKey===line.key),'qty')),tracking:'',status:'待发货'});S.actions.drawRefresh();}
    else S.open('shipProduct',{lineKey:line.key,options:d.lines.map(x=>[x.key,x.name+' / '+x.spec])},'选择发货物品',560);
  };
  S.drawers.shipProduct=l=>({body:S.form([F('产品规格',C('产品规格',l.data.options,l.data.lineKey,'lineKey'))]),footer:B('取消','close')+B('添加','shipProductConfirm','','','primary')});
  S.actions.shipProductConfirm=()=>{const key=S.top.data.lineKey;S.close();const d=S.top.data,l=d.lines.find(x=>x.key===key);d.shipments.push({id:M.uid('SH'),lineKey:key,wid:'',qty:Math.max(0,l.expected-M.sum(d.shipments.filter(x=>x.lineKey===key),'qty')),tracking:'',status:'待发货'});S.actions.drawRefresh();};
  S.actions.shipPick=(id,extra,target)=>{const set=new Set(S.top.data.selected);target.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];};
  S.actions.shipAll=()=>{const d=S.top.data;d.selected=d.shipments.filter(x=>x.status==='待发货'&&(!d.lineKey||x.lineKey===d.lineKey)).map(x=>x.id);S.actions.drawRefresh();};
  S.actions.shipRemove=id=>{S.top.data.shipments=S.top.data.shipments.filter(x=>x.id!==id||x.status!=='待发货');S.actions.drawRefresh();};
  S.actions.shipRemoveSelected=()=>{const d=S.top.data;d.shipments=d.shipments.filter(x=>x.status!=='待发货'||!d.selected.includes(x.id));d.selected=[];S.actions.drawRefresh();};
  function shipmentPayload(){const d=S.top.data;return {id:d.id,action:'saveShipments',shipments:d.shipments.filter(x=>x.status==='待发货')};}
  function refreshShipping(){const l=S.top,d=S.data.documents.find(x=>x.id===l.data.id),key=l.data.lineKey;l.data={...M.copy(d),lineKey:key,selected:[],comment:''};l.revision=S.data.revision;S.actions.drawRefresh();}
  S.actions.shipSave=()=>S.run('document.action',shipmentPayload(),refreshShipping);
  S.actions.shipConfirm=()=>{
    const d=S.top.data;if(!d.selected.length)throw Error('请选择待发货记录。');
    const payload={operations:[{command:'document.action',payload:shipmentPayload()},{command:'document.action',payload:{id:d.id,action:'shipReplenishment',ids:d.selected}}]},rev=S.top.revision;
    S.confirm('确认发货','确认发出已选记录，并扣减对应发货仓库库存？',()=>S.run('batch',payload,refreshShipping,rev));
  };
  S.actions.batchShipping=()=>{
    const selected=S.page.selected;if(!selected.length)throw Error('请选择待发货明细。');
    const rows=S.shippingRows().filter(x=>selected.includes(x.id)),operations=[];
    const ids=[...new Set(rows.map(x=>x.d.id))];
    ids.forEach(id=>{const d=S.data.documents.find(x=>x.id===id),keys=rows.filter(x=>x.d.id===id).map(x=>x.l.key),pending=d.shipments.filter(x=>x.status==='待发货'&&keys.includes(x.lineKey));if(!pending.length)throw Error('单据 '+d.no+' 尚未填写发货仓库与数量，请先打开详情添加发货明细。');operations.push({command:'document.action',payload:{id,action:'shipReplenishment',ids:pending.map(x=>x.id)}});});
    S.confirm('批量确认发货','确认发出已选物品中已保存的待发货记录？',()=>S.run('batch',{operations},()=>S.page.selected=[]));
  };
  S.actions.exportPending=()=>{
    const rows=S.shippingRows().filter(x=>x.status==='待发货');
    StockExchange.download('待发清单',['补货单号','产品编号','产品名称','规格型号','应发数量','待发数量','申请门店'],rows.map(x=>[x.d.no,x.l.code,x.l.name,x.l.spec,x.l.expected,x.l.expected-x.sent,S.wh(x.d.wid)]));
  };
})(StockPC);
