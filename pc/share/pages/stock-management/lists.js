(function(S){
  'use strict';
  const {E,M}=S,B=S.button,L=S.link,F=S.filter;
  const cols={no:['单据编号',d=>E(d.no),190],wid:['门店仓库',d=>E(S.wh(d.wid)),140],status:['状态',d=>S.tag(d.status)],applicant:['申请人',d=>E(d.createdBy)],created:['申请时间',d=>E(d.createdAt),170],reviewer:['审核人',d=>E(d.reviewer||'—')],reviewed:['审核时间',d=>E(d.reviewAt||'—'),170],detail:['操作',d=>L('详情','document',d.id),130,true]};
  function selection(rows){S.visibleIds=rows.map(x=>x.id);return [S.check('全选',rows.length>0&&rows.every(x=>S.page.selected.includes(x.id)),'selectAll'),d=>S.check('',S.page.selected.includes(d.id),'selected',d.id),55,true];}
  function docSearch(kind,extra=[]){
    const p=S.page.filters,person='<div class="refund-keyword" data-pc-label="人员">'+S.select('人员类型',[['createdBy','申请人'],['reviewer','审核人']],p.personField||'createdBy','filter.personField')+S.input('姓名 / 手机号',p.person||'','filter.person','text','placeholder="姓名 / 手机号"')+'</div>';
    return S.search([F(kind==='transfer'?'调出门店仓库':'门店仓库','wid','select',S.whOptions()),...(kind==='transfer'?[F('调入门店仓库','to','select',S.whOptions())]:[]),F('单据编号','no'),F('状态','status','select',[['','全部'],...M.docStatus[kind]]),...(kind==='inbound'?[F('入库类型','type','select',[['','全部'],'调拨入库','退货入库','采购入库','归还入库','盘盈入库'])]:[]),person,...(kind==='transfer'?[F('日期类型','dateField','select',[['createdAt','申请时间'],['receivedAt','入库时间'],['shippedAt','出库时间']])]:[]),F(kind==='inbound'?'入库时间':'申请时间','date','range'),...extra]);
  }
  function rowsTotal(d,key='qty'){return E(M.quantityText(d.lines,key));}
  S.views['stock-transfers']=()=>{
    const rows=S.filteredDocs('transfer');
    return docSearch('transfer')+S.panel('调拨单',S.paged([cols.no,['调出门店仓库',d=>E(S.wh(d.wid)),160],['调入门店仓库',d=>E(S.wh(d.to)),160],['调拨状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,cols.detail],rows),B('申请调拨','newDocument','transfer','','primary'));
  };
  S.views['stock-inbound']=()=>{
    const tab=S.page.tab||'物料入库',tabs=S.tabs(['物料入库','门店补货','发货管理'],tab);
    if(tab==='门店补货')return tabs+replenishment();
    if(tab==='发货管理')return tabs+shipping();
    const rows=S.filteredDocs('inbound');
    return tabs+docSearch('inbound')+S.panel('入库单',S.paged([selection(rows),cols.no,cols.wid,['入库类型',d=>E(d.type)],['入库数量',d=>rowsTotal(d)],['已入库数量',d=>rowsTotal(d,'received')],['入库状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,['入库人',d=>E(d.receiver||'—')],['入库时间',d=>E(d.receivedAt||'—'),170],cols.detail],rows),B('申请入库','newDocument','inbound','','primary')+B('导入数据','import','inbound')+B('批量审核','batch','approve')+B('批量入库','batch','receiveInbound'));
  };
  function replenishment(){
    const rows=S.filteredDocs('replenish');
    const search=S.search([F('申请时间','date','range'),F('单据编号','no'),F('申请门店','wid','select',S.whOptions()),F('审核时间','review','range'),F('核数时间','verify','range'),F('完成时间','complete','range'),F('状态','status','select',[['','全部'],...M.docStatus.replenish])]);
    return search+S.panel('门店补货单',S.paged([['序号',(d,i)=>(S.page.page-1)*S.page.size+i+1,65],['补货单号',cols.no[1],210],cols.wid,['申请总数',d=>rowsTotal(d)],['审核总数',d=>rowsTotal(d,'approved')],['应发总数',d=>rowsTotal(d,'expected')],['实发总数',d=>E(M.quantityText(d.shipments.filter(x=>x.status!=='待发货').map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'qty'))],['实收总数',d=>E(M.quantityText(d.shipments.map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'actual'))],['差异总数',d=>E(M.quantityText(d.shipments.map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'difference'))],cols.status,cols.applicant,cols.created,cols.reviewer,cols.reviewed,['核对人',d=>E(d.verifier||'—')],['核对时间',d=>E(d.verifiedAt||'—'),170],['完成时间',d=>E(d.completedAt||'—'),170],['操作',d=>L(d.status==='待审核'?'审批':d.status==='待核数'?'核对数量':['待发货','在途','部分收货'].includes(d.status)?'发货管理':'详情','document',d.id),140,true]],rows),B('新增门店补货单','newDocument','replenish','','primary')+B('导入','import','replenish'));
  }
  S.shippingRows=()=>{
    const f=S.page.applied;
    return S.data.documents.filter(d=>d.kind==='replenish'&&['待发货','在途','部分收货','已完成'].includes(d.status)&&(!f.wid||d.wid===f.wid)&&S.matches(d.no,f.no)&&S.inDate(d.verifiedAt,'date')&&S.inDate(d.shippedAt,'out')).flatMap(d=>d.lines.filter(l=>(!f.pid||l.pid===f.pid)&&S.inCategory(M.product(S.data,l.pid)?.category,f.category)&&(!f.tag?.length||(Array.isArray(f.tag)?f.tag:[f.tag]).some(id=>M.product(S.data,l.pid)?.tags.includes(id)))).map(l=>{
      const shipments=d.shipments.filter(x=>x.lineKey===l.key),sent=M.sum(shipments.filter(x=>x.status!=='待发货'),'qty');
      return {id:d.id+'|'+l.key,d,l,shipments,sent,status:sent>=l.expected?'已发货':'待发货'};
    })).filter(x=>(!f.status||x.status===f.status)&&S.matches(x.shipments.map(s=>s.tracking).join(','),f.tracking));
  };
  function shipping(){
    const rows=S.shippingRows();
    return S.search([F('应发时间','date','range'),F('最近发货','out','range'),F('补货单号','no'),F('申请门店','wid','select',S.whOptions()),F('物料分类','category','select',S.categoryOptions()),F('物料名称','pid','select',S.productOptions()),F('状态','status','select',[['','全部'],'待发货','已发货']),F('物流单号','tracking'),F('标签','tag','multi',[['','全部'],...S.data.tags.map(t=>[t.id,t.name])])])+S.panel('发货明细',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['补货单号',x=>E(x.d.no),210],['门店',x=>E(S.wh(x.d.wid)),140],['物料编号',x=>E(x.l.code)],['物料名称',x=>E(x.l.name),150],['规格型号',x=>E(x.l.spec)],['应发数量',x=>x.l.expected||0],['待发数量',x=>(x.l.expected||0)-x.sent],['实发数量',x=>x.sent],['单位',x=>E(x.l.unit)],['状态',x=>S.tag(x.status)],['发货仓库',x=>E([...new Set(x.shipments.map(s=>S.wh(s.wid)))].join('、')||'—'),150],['物流单号',x=>E(x.shipments.map(s=>s.tracking).filter(Boolean).join('、')||'—'),170],['创建应发时间',x=>E(x.d.verifiedAt),170],['最近发货时间',x=>E(x.d.shippedAt||'—'),170],['操作',x=>L('详情','shipping',x.d.id,x.l.key)+(x.status==='待发货'?L('确认发货','shipping',x.d.id,x.l.key):''),170,true]],rows),B('下载待发清单','exportPending')+B('导入发货单','import','shipping')+B('批量确认发货','batchShipping'));
  }
  S.views['stock-outbound']=()=>{
    const tab=S.page.tab||'领用出库',kinds={'领用出库':'issue','销售出库':'sale','服务消耗':'consume','退回入库':'returnIn','退回出库':'returnOut'},kind=kinds[tab],rows=S.filteredDocs(kind);
    return S.tabs(Object.keys(kinds),tab)+docSearch(kind,[F('出库时间','out','range'),F('物料名称','pid','select',S.productOptions())])+S.panel(tab,S.paged([cols.no,cols.wid,['业务记录号',d=>E(d.source||'—'),170],['数量',d=>rowsTotal(d),160],['规格数',d=>d.lines.length],cols.status,cols.applicant,cols.created,cols.detail],rows),(['issue','sale','consume'].includes(kind)?B('新增'+tab,'newDocument',kind,'','primary'):'')+B('按产品 / 服务扣库','fromSales'));
  };
  S.views['stock-purchases']=()=>{
    const tab=S.page.tab||'采购管理',tabs=S.tabs(['采购管理','物料管理'],tab);
    if(tab==='物料管理'){
      const f=S.page.applied,rows=S.data.documents.filter(d=>d.kind==='purchase'&&!['待审核','待提交','已拒绝'].includes(d.status)).flatMap(d=>d.lines.map(l=>({d,l,id:d.id+'|'+l.key}))).filter(x=>(!f.status||(x.l.purchaseStatus||'待采购')===f.status)&&S.matches(x.l.name+' '+x.l.code+' '+S.wh(x.d.wid),f.q)&&S.inDate(f.dateField==='purchasedAt'?x.l.purchasedAt:x.d.createdAt,'date'));
      return tabs+S.search([F('日期类型','dateField','select',[['createdAt','申请时间'],['purchasedAt','采购时间']]),F('日期','date','range'),F('采购状态','status','select',[['','全部'],'待采购','待付款','已采购','不采购']),F('关键词','q')])+S.panel('采购物料',S.paged([['申请时间',x=>E(x.d.createdAt),170],['门店仓库',x=>E(S.wh(x.d.wid)),140],['物料名称',x=>E(x.l.name),160],['单位',x=>E(x.l.unit)],['规格型号',x=>E(x.l.spec)],['采购数量',x=>x.l.qty],['采购单价',x=>Number(x.l.purchasePrice??x.l.unitPrice??x.l.cost).toFixed(2)],['总金额',x=>(x.l.qty*(x.l.purchasePrice??x.l.unitPrice??x.l.cost)).toFixed(2)],['采购状态',x=>S.tag(x.l.purchaseStatus||'待采购')],['采购人',x=>E(x.l.purchaser||'—')],['采购时间',x=>E(x.l.purchasedAt||'—'),170],['快递 / 物流',x=>E(x.l.tracking||'—'),150],['备注',x=>E(x.l.purchaseNote||'—'),160],['操作',x=>L(['已采购','不采购'].includes(x.l.purchaseStatus)?'详情':'采购处理','purchaseItem',x.d.id,x.l.key),140,true]],rows));
    }
    return tabs+docSearch('purchase')+S.panel('采购申请',S.paged([cols.no,cols.wid,['采购状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,cols.detail],S.filteredDocs('purchase')),B('申请采购','newDocument','purchase','','primary'));
  };
  S.views['stock-ledger']=()=>{
    const f=S.page.applied,types=['调拨入库','退货入库','采购入库','归还入库','盘盈入库','补货入库','差异入库','销售出库','服务消耗','调拨出库','退货出库','借出出库','盘亏出库','领用出库','补货出库','差异出库'];
    const rows=S.data.ledger.filter(x=>x.type!=='期初库存'&&S.chosen(f.wid,x.wid)&&S.chosen(f.pid,x.pid)&&(!f.direction||(f.direction==='入库'?x.delta>0:x.delta<0))&&(!f.type||x.type===f.type)&&S.inDate(x.at,'date')).slice().reverse();
    return S.search([F('操作时间','date','range'),F('物料名称','pid','multi',S.productOptions()),F('门店仓库','wid','multi',S.whOptions()),F('出入库','direction','select',[['','全部'],'出库','入库']),F('类型','type','select',[['','全部'],...types])])+S.panel('出入库明细',S.paged([['门店仓库',x=>E(S.wh(x.wid)),150],['物料名称',x=>E(M.product(S.data,x.pid)?.name),170],['单位',x=>E(x.baseUnit||S.baseUnit(x.pid,x.sid))],['规格型号',x=>E(M.spec(S.data,x.pid,x.sid)?.name)],['出入库类型',x=>E(x.type)],['出库数量',x=>x.delta<0?-x.delta:0],['入库数量',x=>x.delta>0?x.delta:0],['单位成本（元）',x=>x.unitCost===undefined?'—':Number(x.unitCost).toFixed(4),140],['金额（元）',x=>x.value===undefined?'—':Number(x.value).toFixed(2),130],['成本来源',x=>x.unitCost===undefined?'历史未记录':x.costEstimated?'含参考估值':'实际入库成本',140],['操作时间',x=>E(x.at),170],['备注',x=>E(x.note||'—'),180]],rows),B('导出','export'));
  };
  S.reportMetrics=(wid,pid,sid='',unit='')=>{
    const f=S.page.applied,match=x=>S.chosen(wid,x.wid)&&S.chosen(pid,x.pid)&&(!sid||x.sid===sid)&&(!unit||(x.baseUnit||S.baseUnit(x.pid,x.sid))===unit),entries=S.data.ledger.filter(x=>match(x)&&S.inDate(x.at,'date'));
    const qty=type=>entries.filter(x=>x.type===type).reduce((n,x)=>n+Math.abs(x.delta),0),current=S.data.ledger.filter(x=>match(x)&&(!f.dateTo||x.at.slice(0,10)<=f.dateTo)).reduce((n,x)=>n+x.delta,0);
    return {current,purchase:qty('采购入库'),transferIn:qty('调拨入库'),returned:qty('退货入库'),sales:qty('销售出库'),consume:qty('服务消耗'),issue:qty('领用出库'),transferOut:qty('调拨出库')};
  };
  S.reportColumns=[['当前库存','current'],['采购入库','purchase'],['调拨入库','transferIn'],['退回入库','returned'],['销售出库','sales'],['服务消耗','consume'],['领用出库','issue'],['调拨出库','transferOut']].map(([label,k])=>[label,x=>Math.round(x.metrics[k]*1000)/1000,110]);
  S.lossRows=()=>S.data.tasks.flatMap(t=>t.stores.flatMap(st=>st.rows.filter(r=>r.counted!==null).map(r=>({id:t.id+'|'+st.wid+'|'+r.key,t,st,r})))).filter(x=>{const f=S.page.applied;return S.chosen(f.wid,x.st.wid)&&S.chosen(f.pid,x.r.pid)&&(!f.status||(x.r.processed?'已处理':'待处理')===f.status)&&S.inDate(x.r.countedAt,'date');});
  S.views['stock-reports']=()=>{
    const tab=S.page.tab||'物料报表',f=S.page.applied;
    const search=S.search([F('日期','date','range'),F('门店仓库','wid','multi',S.whOptions()),F('物料名称','pid','multi',S.productOptions()),...(tab==='损益报表'?[F('状态','status','select',[['','全部'],'待处理','已处理'])]:[F('空数据','hide','select',[['','隐藏空数据'],['show','显示空数据']])])]);
    if(tab==='损益报表')return S.tabs(['物料报表','仓库报表','损益报表'],tab)+search+S.panel('盘点损益',S.paged([['门店名称',x=>E(S.wh(x.st.wid)),140],['物料名称',x=>E(M.product(S.data,x.r.pid)?.name),160],['规格',x=>E(M.spec(S.data,x.r.pid,x.r.sid)?.name)],['最小单位',x=>E(S.baseUnit(x.r.pid,x.r.sid))],['期初盘点数',x=>x.r.baseline],['损益',x=>(x.r.processed?x.r.difference:x.r.counted-x.r.countedBalance)],['期末结存',x=>x.r.processed?x.r.confirmed:x.r.counted],['状态',x=>S.tag(x.r.processed?'已处理':'待处理')],['操作时间',x=>E(x.r.processedAt||x.r.countedAt),170],['备注',x=>E(x.r.note||'—'),180],['操作',x=>L('查看','countDetail',x.t.id,x.st.wid),100,true]],S.lossRows()));
    const isProduct=tab==='物料报表',units=[...new Set(M.catalog(S.data).filter(x=>S.chosen(f.pid,x.pid)).map(x=>x.baseUnit))];
    const rows=(isProduct?M.catalog(S.data).filter(x=>S.chosen(f.pid,x.pid)).map(x=>({id:x.pid+'|'+x.sid,name:x.product.name,spec:x.name,unit:x.baseUnit,metrics:S.reportMetrics(f.wid,x.pid,x.sid)})):S.data.warehouses.filter(w=>S.chosen(f.wid,w.id)).flatMap(w=>units.map(unit=>({id:w.id,name:w.name,spec:'',unit,metrics:S.reportMetrics(w.id,f.pid,'',unit)})))).filter(x=>f.hide==='show'||Object.values(x.metrics).some(Number));
    const totals=units.map(unit=>({id:'total',name:'合计',spec:'',unit,metrics:Object.fromEntries(['current','purchase','transferIn','returned','sales','consume','issue','transferOut'].map(k=>[k,rows.filter(x=>x.unit===unit).reduce((n,r)=>n+r.metrics[k],0)]))}));
    const columns=[[isProduct?'物料名称':'仓库名称',x=>E(x.name),170],...(isProduct?[['规格',x=>E(x.spec),130]]:[]),['最小单位',x=>E(x.unit),90],...S.reportColumns,['操作',x=>x.id==='total'?'':L('查看','reportDetail',x.id,isProduct?'product':'warehouse'),100,true]],all=[...rows,...totals];S.exportable(columns,all);return S.tabs(['物料报表','仓库报表','损益报表'],tab)+search+S.panel(tab,S.table(columns,all),B('导出','export'));
  };
  S.views['stock-warehouses']=()=>{
    const f=S.page.applied,rows=S.data.warehouses.filter(x=>S.matches(x.name+' '+x.store+' '+x.receiver,f.q)&&(!f.status||String(x.enabled)===f.status));
    return S.search([F('关键词','q'),F('状态','status','select',[['','全部'],['true','启用'],['false','禁用']])])+S.panel('仓库列表',S.paged([['仓库名称',x=>E(x.name),160],['关联门店',x=>E(x.store),150],['负责人',x=>E(x.receiver)],['手机号',x=>E(x.phone||'—'),140],['详细地址',x=>E(x.address||'—'),220],['状态',x=>'<label class="switch"><input type="checkbox" aria-label="启用'+E(x.name)+'" '+(x.enabled?'checked':'')+' data-stock-action="toggleCatalog" data-stock-id="'+x.id+'" data-stock-extra="warehouses"><span></span></label>'],['操作',x=>L('修改','catalog',x.id,'warehouses'),110,true]],rows),B('添加仓库','catalog','','warehouses','primary'));
  };
  S.views['stock-products']=()=>{
    const f=S.page.applied,matchMany=(v,q)=>!q||q.split(/[\s,，;；]+/).map(x=>x.trim()).filter(Boolean).some(x=>S.matches(v,x));
    const rows=S.data.products.filter(x=>matchMany(x.code,f.code)&&matchMany(x.name,f.name)&&S.inCategory(x.category,f.category)&&(!f.enabled||String(x.enabled)===f.enabled)&&(!f.use||String(x.useEnabled)===f.use)&&(!f.tag?.length||(Array.isArray(f.tag)?f.tag:[f.tag]).some(id=>x.tags.includes(id))));
    return S.search([F('物料编号','code'),F('物料名称','name'),F('物料分类','category','select',S.categoryOptions()),F('仓库启用','enabled','select',[['','全部'],['true','启用'],['false','禁用']]),F('标签','tag','multi',[['','全部'],...S.data.tags.map(x=>[x.id,x.name])]),F('领用','use','select',[['','全部'],['true','启用'],['false','禁用']])])+S.panel('物料列表',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['编号',x=>E(x.code)],['分类',x=>E(S.cat(x.category))],['物料名称',x=>E(x.name),170],['最小单位',x=>E([...new Set(x.specs.map(v=>v.baseUnit))].join(' / '))],['规格 / 成本价（元）',x=>x.specs.map(v=>E(v.name)+' / '+Number(v.cost).toFixed(2)+' 元 / '+E(v.baseUnit)).join('<br>'),190],['物料标签',x=>E(x.tags.map(id=>S.data.tags.find(t=>t.id===id)?.name).filter(Boolean).join('、')||'—'),140],['启用状态',x=>'<label class="switch"><input type="checkbox" aria-label="启用'+E(x.name)+'" '+(x.enabled?'checked':'')+' data-stock-action="toggleCatalog" data-stock-id="'+x.id+'" data-stock-extra="products"><span></span></label>'],['领用',x=>S.tag(x.useEnabled?'启用':'禁用')],['操作',x=>L('编辑','catalog',x.id,'products'),100,true]],rows),B('添加物料','catalog','','products','primary')+B('批量编号搜索','bulkQuery','code')+B('批量名称搜索','bulkQuery','name')+B('导入数据','import','products')+B('批量领用','batchUse')+B('标签管理','tags'));
  };
  S.views['stock-categories']=()=>{
    const f=S.page.applied,rows=[],collapsed=S.page.collapsed||[];function walk(parent,depth){S.data.categories.filter(x=>x.parent===parent).forEach(x=>{if(!f.q||S.matches(x.name,f.q))rows.push({...x,depth});if(f.q||!collapsed.includes(x.id))walk(x.id,depth+1);});}walk('',0);
    return S.search([F('分类名称','q')])+S.panel('分类列表',S.paged([['名称',x=>'<span style="padding-left:'+x.depth*20+'px">'+(S.data.categories.some(c=>c.parent===x.id)?B(collapsed.includes(x.id)?'展开':'收起','categoryToggle',x.id,'','text'):'')+E(x.name)+'</span>',300],['操作',x=>L('绑定门店','bindCategory',x.id)+L('添加下级','catalog','',JSON.stringify({type:'categories',parent:x.id}))+L('编辑','catalog',x.id,'categories')+L('删除','deleteCatalog',x.id,'categories'),300,true]],rows),B('新增分类','catalog','','categories','primary'));
  };
  S.actions.categoryToggle=id=>{const set=new Set(S.page.collapsed||[]);set.has(id)?set.delete(id):set.add(id);S.page.collapsed=[...set];S.render();};
  S.views['stock-tasks']=()=>{
    const f=S.page.applied,rows=S.data.tasks.filter(x=>S.matches(x.name,f.q)&&(!f.status||x.status===f.status)),progress=t=>{const all=t.stores.flatMap(s=>s.rows);return all.filter(x=>x.counted!==null).length+'/'+all.length;};
    return S.search([F('任务名称','q'),F('任务状态','status','select',[['','全部'],'待发送','进行中','已完成','已作废'])])+S.panel('盘点任务',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['任务名称',x=>E(x.name),210],['发起日期',x=>E(x.createdAt),170],['任务进度',progress],['处理进度',x=>{const all=x.stores.flatMap(s=>s.rows);return all.filter(r=>r.processed).length+'/'+all.length;}],['任务状态',x=>S.tag(x.status)],['操作人',x=>E(x.actor)],['操作',x=>(x.status==='待发送'?L('编辑','taskEdit',x.id):L('查看','taskStores',x.id))+L('盘点详情','countDetail',x.id)+(x.status==='待发送'?L('确认发送','taskAction',x.id,'send'):L('复制','taskCopy',x.id))+(['待发送','进行中'].includes(x.status)?L('作废','taskAction',x.id,'void'):''),320,true]],rows),B('添加任务','taskEdit','','','primary'));
  };
  S.actions.reportDetail=(id,type)=>S.open('report',{id,type},type==='product'?M.product(S.data,id.split('|')[0]).name:S.wh(id),1120);
  S.drawers.report=l=>{
    const d=l.data,isProduct=d.type==='product',[pid,sid]=d.id.split('|'),rows=isProduct?S.data.warehouses.map(w=>({name:w.name,spec:M.spec(S.data,pid,sid).name,unit:S.baseUnit(pid,sid),wid:w.id,pid,sid,metrics:S.reportMetrics(w.id,pid,sid)})):M.catalog(S.data).map(x=>({name:x.product.name,spec:x.name,unit:x.baseUnit,wid:d.id,pid:x.pid,sid:x.sid,metrics:S.reportMetrics(d.id,x.pid,x.sid)}));
    return {body:S.table([[isProduct?'仓库名称':'物料名称',x=>E(x.name),160],['规格',x=>E(x.spec),120],['最小单位',x=>E(x.unit),90],...S.reportColumns,['当前参考库存金额',x=>M.averageCost(S.data,x.wid,x.pid,x.sid).value.toFixed(2),170],['成本来源',x=>M.averageCost(S.data,x.wid,x.pid,x.sid).estimated?'含历史参考估值':'实际入库成本',150]],rows)};
  };
})(StockPC);
