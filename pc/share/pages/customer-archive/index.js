/* Customer detail workspace. All records remain scoped to the selected archive. */
'use strict';
const PC_ARCHIVE_TABS = [
  ['orders','订单'],['ledger','收支'],['payments','支付'],['arrears','欠款'],
  ['projects','项目'],['followups','回访'],['calls','通话'],['wechat','加微'],
  ['contracts','合同'],['consultations','问诊'],['images','影像'],['stores','门店'],
  ['complaints','投诉'],['operations','操作'],['children','子客户'],
  ['overview','基本信息'],['business','业务记录'],['history','合并历史']
];
function pcArchiveText(value){return esc(value===undefined||value===null||value===''?'—':String(value))}
function pcArchiveMoney(value){return value===undefined||value===null||value===''?'—':money(value)}
function pcArchiveTable(head,rows){return table(head,rows).replace('<table>','<table data-pc-scroll="parent">')}
function pcArchiveItems(c,key){return Array.isArray(c[key])?c[key]:[]}
function pcArchiveOrderPaid(c,o){
  if(o.paidAmount!==undefined)return Number(o.paidAmount);
  const rows=pcArchiveItems(c,'payments').filter(p=>p.orderId===o.id&&!p.isInternalAdjustment);
  return rows.length?pcRound(rows.reduce((sum,p)=>sum+pcPaymentAmount(p),0)):undefined;
}
function pcArchiveDebt(c){
  if(c.arrears!==undefined)return c.arrears;
  if(Array.isArray(c.receivables))return pcRound(c.receivables.filter(r=>!['已结清','已取消'].includes(r.status)).reduce((sum,r)=>sum+Number(r.remainingAmount??r.amount??0),0));
  return undefined;
}
function pcArchiveView(c,tab){
  const key=PC_ARCHIVE_TABS.some(([k])=>k===tab)?tab:'orders';
  return `<div class="ca-workspace"><aside class="ca-sidebar" aria-label="客户概览">${pcArchiveSummary(c)}</aside><div class="ca-main"><div class="pc-tabs" role="tablist" aria-label="客户档案分类">${PC_ARCHIVE_TABS.map(([k,t])=>`<button id="ca-tab-${k}" class="pc-tab ${key===k?'active':''}" role="tab" aria-selected="${key===k}" aria-controls="ca-tab-content" tabindex="${key===k?0:-1}" onclick="pcCustomerTab('${k}')">${t}</button>`).join('')}</div><div id="ca-tab-content" class="ca-tab-content" role="tabpanel" aria-labelledby="ca-tab-${key}">${pcArchiveContent(c,key)}</div></div></div>`;
}
function pcArchiveSummary(c){
  const stats=pcStats(c),wallets=pcArchiveItems(c,'walletAccounts'),hasWallet=Array.isArray(c.walletAccounts);
  const balance=hasWallet?wallets.reduce((sum,a)=>sum+Number(a.balance||0),0):c.white;
  const frozen=hasWallet?wallets.reduce((sum,a)=>sum+Number(a.frozen||0),0):c.frozen;
  const month=now().slice(0,7),visits=Array.isArray(c.checkins)?c.checkins.filter(r=>(r.at||r.time||'').startsWith(month)).length:undefined;
  const wechat=pcArchiveItems(c,'wechat').map(w=>w.at).filter(Boolean).sort()[0];
  const info=[['会员号',c.memberNo||c.id],['加微时间',wechat],['微信号',c.wechatNo],['所属门店',c.store],['推荐人',c.referrer],['会员生日',c.birthday]];
  const notes=[['初始意向项目',c.initialIntention],['本月到店次数',visits],['意向项目',c.intention],['创建时间',c.created],['最后到店',stats.lastVisitAt],['归属客服',c.consultant]];
  const tags=pcArchiveItems(c,'tags');
  return `<div class="ca-identity"><div class="ca-person"><div class="ca-avatar" aria-hidden="true">${esc((c.name||'客').slice(0,1))}</div><div class="ca-person-info"><strong>${pcArchiveText(c.name)}</strong><div class="ca-phone"><span id="ca-phone">${pcArchiveText(mrTask.phoneVisible?c.phone:uiPhone(c.phone))}</span>${c.phone?btn(mrTask.phoneVisible?'隐藏手机':'获取手机','pcArchiveTogglePhone()','text'):''}</div></div>${badge(c.customerType||stats.customerType,'blue')}</div><div class="ca-metrics">${[['余额',balance],['消费',stats.totalConsumption],['冻结',frozen],['欠款',pcArchiveDebt(c)]].map(([label,value])=>`<div><span>${label}</span><strong>${pcArchiveMoney(value)}</strong></div>`).join('')}</div><dl class="ca-identity-fields">${info.map(([label,value])=>`<div><dt>${label}</dt><dd>${pcArchiveText(value)}</dd></div>`).join('')}</dl></div><div class="ca-profile-body"><div class="actions ca-shortcuts">${btn('基本信息',"pcCustomerTab('overview')",'primary','users')}${btn('业务记录',"pcCustomerTab('business')",'','file')}${btn('合并历史',"pcCustomerTab('history')",'','history')}</div><dl class="ca-notes">${notes.map(([label,value])=>`<div><dt>${label}</dt><dd>${pcArchiveText(value)}</dd></div>`).join('')}</dl><section class="ca-section"><h3>会员标签</h3><div class="ca-tags">${tags.length?tags.map(t=>badge(typeof t==='string'?t:t.name||t.label||'—','green')).join(''):'<span class="muted">暂无会员标签</span>'}</div></section><section class="ca-section"><h3>消费占比</h3>${pcArchiveConsumption(c)}</section><section class="ca-section"><h3>档案关系</h3><div class="ca-relations">${badge(pcCustomerStatus(c),pcCustomerStatus(c)==='冷静期中'?'orange':'')}${c.mergedInto?`<div>主档案 ${btn(pcArchiveText(pcCustomers().find(x=>x.id===c.mergedInto)?.name||c.mergedInto),`pcCustomerSwitch(${mrQuote(c.mergedInto)})`,'text')}</div>`:''}${c.correctionCaseId?`<div>纠错来源 ${btn(pcArchiveText(c.correctionCaseId),`pcGoCase(${mrQuote(c.correctionCaseId)})`,'text')}</div>`:''}</div></section></div>`;
}
function pcArchiveTogglePhone(){if(mrTask?.kind!=='customer')return;mrTask.phoneVisible=!mrTask.phoneVisible;render();document.querySelector('.ca-phone button')?.focus({preventScroll:true})}
function pcArchiveConsumption(c){
  const groups=new Map();
  for(const o of pcArchiveItems(c,'orders').filter(o=>o.status==='已完成'&&Number(o.amount)>0)){
    const name=o.name||'未分类项目';groups.set(name,(groups.get(name)||0)+Number(o.amount));
  }
  const rows=[...groups].sort((a,b)=>b[1]-a[1]),total=rows.reduce((sum,r)=>sum+r[1],0);
  const colors=['var(--pc-primary)','var(--pc-success)','var(--pc-warning)','var(--pc-info)'];
  const shown=rows.length>4?[...rows.slice(0,3),['其他项目',rows.slice(3).reduce((sum,r)=>sum+r[1],0)]]:rows;
  let offset=0;
  const segments=shown.map(([name,value],i)=>{const start=offset;offset+=value/total*100;return `${colors[i]} ${start}% ${offset}%`});
  return `<div class="ca-consumption"><div class="ca-donut" role="img" aria-label="${esc(total?'消费占比：'+shown.map(([name,value])=>name+' '+(value/total*100).toFixed(1)+'%').join('，'):'暂无已完成订单消费')}" style="--ca-chart:${total?'conic-gradient('+segments.join(',')+')':'var(--pc-line)'}"><div><strong>${total?money(total):'—'}</strong><span>${total?'消费总额':'暂无消费'}</span></div></div><ul class="ca-legend">${shown.map(([name,value],i)=>`<li><span class="ca-dot" style="background:${colors[i]}"></span><span>${esc(name)}</span><strong>${(value/total*100).toFixed(1)}%</strong></li>`).join('')}</ul></div>`;
}
function pcArchiveOrders(c){
  return `<div class="actions ca-toolbar">${btn('刷新','pcArchiveRefresh()','primary','search')}</div>`+pcArchiveTable(['序号','门店 / 单号','到店时间 / 状态','订单意向','项目','金额','已付 / 欠款','操作'],pcArchiveItems(c,'orders').map((o,i)=>{
    const paid=pcArchiveOrderPaid(c,o),debt=o.arrears??o.receivableAmount;
    const checkin=pcArchiveItems(c,'checkins').find(x=>x.orderId===o.id);
    const arrival=o.arrivedAt||o.checkinAt||checkin?.at||checkin?.time;
    return [i+1,`${pcArchiveText(o.store||c.store)}<div class="muted mono">${pcArchiveText(o.id)}</div>${o.customerType?badge(o.customerType,'orange'):''}`,`${pcArchiveText(arrival)}<div>${badge(o.status||'未记录',o.status==='已完成'?'green':'orange')}</div>`,pcArchiveText(o.intention||o.intentionLevel),`${pcArchiveText(o.name)}${o.quantity!==undefined?' × '+pcArchiveText(o.quantity):''}`,`订单金额：${pcArchiveMoney(o.amount)}<div class="muted">预约金：${pcArchiveMoney(o.deposit)}</div>`,`已付：${pcArchiveMoney(paid)}<div>欠款：${pcArchiveMoney(debt)}</div><div>抵扣：${pcArchiveMoney(o.deductionAmount)}</div>`,btn('详情',`pcBusinessDetail('order',${mrQuote(c.id)},${mrQuote(o.id)})`,'text')];
  }));
}
function pcArchiveRefresh(){if(mrTask?.kind==='customer'){render();toast('已刷新当前客户档案')}}
function pcArchiveContent(c,key){
  if(['overview','business','history'].includes(key))return pcCustomerContent(c,key);
  if(key==='orders')return pcArchiveOrders(c);
  const t=pcArchiveText,m=pcArchiveMoney,rows=k=>pcArchiveItems(c,k);
  if(key==='ledger')return pcArchiveTable(['序号','流水编号','收支类型','金额','关联订单','发生时间','操作'],pcLedger(c).map((r,i)=>[i+1,t(r.id),t(r.type),cxSign(pcPaymentAmount(r)),t(r.orderId),t(r.at),btn('详情',`pcBusinessDetail('white',${mrQuote(c.id)},${mrQuote(r.id)})`,'text')]));
  if(key==='payments')return pcArchiveTable(['序号','支付编号','关联订单','支付类型','金额','支付方式','支付时间'],rows('payments').map((r,i)=>[i+1,t(r.id),t(r.orderId),t(r.type),m(r.amount),t(r.method||r.channel),t(r.businessAt||r.at||r.paidAt)]));
  if(key==='arrears')return pcArchiveTable(['序号','欠款记录','关联订单 / 服务','待收金额','状态'],rows('receivables').map((r,i)=>[i+1,t(r.id),t(r.orderId||r.serviceId),m(r.remainingAmount??r.amount),t(r.status)]));
  if(key==='projects')return contentModule('项目资产',pcArchiveTable(['序号','项目 / 资产编号','关联订单','剩余数量','冻结数量','有效期'],rows('assets').map((r,i)=>[i+1,t(r.name)+'<div class="muted mono">'+t(r.id)+'</div>',t(r.orderId),t(r.remaining)+(r.unit?' '+t(r.unit):''),t(r.frozen),t(r.expiresAt)])))+contentModule('项目记录',pcArchiveTable(['序号','项目','关联订单','数量','金额','发生时间'],rows('projects').map((r,i)=>[i+1,t(r.name||r.type),t(r.orderId),t(r.quantity??r.qty),m(r.amount),t(r.at||r.serviceDate)])));
  if(key==='followups')return pcArchiveTable(['序号','回访编号','回访内容','负责人','计划时间','状态'],rows('followups').map((r,i)=>[i+1,t(r.id),t(r.name)+'<div class="muted">'+t(r.content)+'</div>',t(r.handler),t(r.dueAt||r.at),t(r.status)]));
  if(key==='calls')return pcArchiveTable(['序号','通话编号','通话人员','通话时间','通话时长','记录'],rows('calls').map((r,i)=>[i+1,t(r.id),t(r.by||r.handler),t(r.at),t(r.duration),t(r.content||r.summary)]));
  if(key==='wechat')return pcArchiveTable(['序号','微信号','加微人员','加微时间','来源'],rows('wechat').map((r,i)=>[i+1,t(r.wechatNo||r.account),t(r.by),t(r.at),t(r.sourceName||r.sourceCustomerId)]));
  if(key==='contracts')return pcArchiveTable(['序号','合同编号','合同名称','关联订单','签署时间','状态'],rows('contracts').map((r,i)=>[i+1,t(r.id),t(r.name),t(r.orderId),t(r.signedAt||r.at),t(r.status)]));
  if(key==='consultations')return pcArchiveTable(['序号','问诊编号','问诊内容','问诊人员','问诊时间'],rows('consultations').map((r,i)=>[i+1,t(r.id),t(r.content||r.summary||r.name),t(r.by||r.doctor),t(r.at)]));
  if(key==='images')return pcArchiveTable(['序号','影像编号','影像类型','关联订单','记录时间','操作'],rows('images').map((r,i)=>[i+1,t(r.id),t(r.type||r.name),t(r.orderId),t(r.at),btn('查看资料',`pcArchiveImage(${mrQuote(c.id)},${i})`,'text')]));
  if(key==='stores'){
    const stores=[...new Set([c.store,...rows('orders').map(o=>o.store),...rows('checkins').map(v=>v.store)].filter(Boolean))];
    return pcArchiveTable(['序号','门店','归属关系','订单数','到店记录'],stores.map((store,i)=>[i+1,t(store),store===c.store?'所属门店':'业务关联门店',rows('orders').filter(o=>(o.store||c.store)===store).length,Array.isArray(c.checkins)?c.checkins.filter(v=>(v.store||c.store)===store).length:'—']));
  }
  if(key==='complaints')return pcArchiveTable(['序号','工单编号','类型','问题摘要','状态','处理人','操作'],rows('tickets').map((r,i)=>[i+1,t(r.id),t(r.type||'售后'),t(r.name||r.summary),t(r.status),t(r.handler),btn('详情',`pcBusinessDetail('ticket',${mrQuote(c.id)},${mrQuote(r.id)})`,'text')]));
  if(key==='operations'){
    const logs=[...rows('logs'),...state.mergeRecords.filter(r=>r.pair.some(p=>p.id===c.id)).flatMap(r=>(r.logs||[]).map(l=>({...l,source:r.id})))].sort((a,b)=>(b.at||'').localeCompare(a.at||''));
    return pcArchiveTable(['序号','操作时间','操作人','操作内容','关联记录'],logs.map((r,i)=>[i+1,t(r.at),t(r.by),t(r.content||r.note),t(r.source)]));
  }
  if(key==='children')return pcArchiveTable(['序号','客户 / 编号','手机号','门店','合并状态','操作'],pcCustomers().filter(x=>x.mergedInto===c.id).map((r,i)=>[i+1,t(r.name)+'<div class="muted mono">'+t(r.id)+'</div>',t(uiPhone(r.phone)),t(r.store),badge(pcCustomerStatus(r)),btn('查看档案',`pcCustomerSwitch(${mrQuote(r.id)})`,'text')]));
  return '';
}
function pcArchiveImage(cid,index){
  const c=pcCustomers().find(c=>c.id===cid),r=c&&pcArchiveItems(c,'images')[index];
  if(!r)return;
  // Historical fixtures may contain metadata only; do not invent an attachment.
  const url=typeof r.url==='string'&&/^(https?:\/\/|data:image\/(?:png|jpeg|webp);base64,)/i.test(r.url)?r.url:'';
  modal('影像资料',body(kv({'客户':pcArchiveText(c.name),'影像编号':pcArchiveText(r.id),'类型':pcArchiveText(r.type||r.name),'关联订单':pcArchiveText(r.orderId),'记录时间':pcArchiveText(r.at)}))+(url?`<img class="ca-image-preview" src="${esc(url)}" alt="${esc(r.name||r.type||'客户影像')}">`:body('<p class="muted">该记录仅保存了影像资料信息，暂无可查看的附件。</p>')),btn('关闭','closeModal()'),true);
}

window.PCModules['customer-archive']={};
