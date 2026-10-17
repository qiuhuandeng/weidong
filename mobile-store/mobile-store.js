/* Native store-side screens. Domain state, validation, drafts and execution are shared with PC. */
const ms={view:'list',module:'merge',listTab:'applications',q:'',status:'',store:'',visible:20,recordId:'',recordTab:'overview',listScroll:0,error:'',edit:null,picker:null,returnKey:'',savedScroll:0};
function msIsMobile(){return typeof route!=='undefined'&&route==='mobile-store'}
function msCard(title,html,action=''){return '<section class="ms-card">'+(title?'<div class="ms-section-title"><h3>'+title+'</h3>'+action+'</div>':'')+html+'</section>'}
function msField(label,control,required=false){return '<label class="ms-field"><span>'+(required?'<i class="ms-required">*</i>':'')+label+'</span>'+control+'</label>'}
function msInput(label,value,action,type='text',required=false){if(type==='datetime-local')value=String(value||'').replace(' ','T').slice(0,16);return msField(label,`<input type="${type}" aria-label="${esc(label)}" value="${esc(value??'')}" oninput="${esc(action)}">`,required)}
function msText(label,value,action,required=false){return msField(label,`<textarea aria-label="${esc(label)}" rows="3" oninput="${esc(action)}">${esc(value||'')}</textarea>`,required)}
function msSelect(label,items,value,action,required=false){return msField(label,select(items,value,`aria-label="${esc(label)}" onchange="${esc(action)}"`),required)}
function msNote(text){return '<p class="ms-sub">'+esc(text)+'</p>'}
function msError(message){ms.error=message;render();$('.ms-errors')?.scrollIntoView({block:'nearest'})}
function msSetModule(module){if(ms.module!==module){ms.module=module;ms.listTab=module==='merge'?'applications':'tickets';ms.q='';ms.status='';ms.store=''}}
function msResetForm(){mrTask=null;clPlan=null;cxApplicationOpen=false;clDraftId=null;clErrors=[];apTask=null;apSheet=null;ms.error='';ms.edit=null;ms.picker=null}
function msHome(){msResetForm();ms.view='list';render();$('.ap-mobile-scroll').scrollTop=ms.listScroll||0}
function msSwitch(module){msResetForm();ms.module=module;ms.listTab=module==='merge'?'applications':'tickets';ms.q='';ms.status='';ms.store='';ms.visible=20;ms.listScroll=0;ms.view='list';render()}
function msBack(){if(apSheet){apDismiss();return}if(ms.view==='merge'&&mrTask?.dirty||ms.view==='correction'&&clHasContent()&&clFingerprint()!==clSavedFingerprint){apPrompt('保留这份申请？','<p class="ms-copy">可以先保存草稿，下次继续填写。</p>',btn('继续填写','apDismiss()')+btn('放弃修改','msHome()')+btn('保存草稿','msSaveDraft()','primary'));return}msHome()}
function msGoList(tab){ms.listTab=tab;ms.visible=20;ms.q='';ms.status='';render()}
function msToast(message){ms.notice=message;let el=$('.ms-shell .ms-toast');if(!el){el=document.createElement('div');el.className='ms-toast';el.setAttribute('role','status');$('.ms-shell')?.append(el)}el.textContent=message;clearTimeout(ms.noticeTimer);ms.noticeTimer=setTimeout(()=>{ms.notice='';$('.ms-shell .ms-toast')?.remove()},3200)}
function msTitle(){return ms.view==='merge'?'申请合并':ms.view==='correction'?'发起纠错':ms.view==='detail'?(apTask?.kind==='merge'?'合并申请详情':'纠错工单详情'):ms.view==='record'?'合并记录':'移动档案工作台'}
function msRender(){
 if(ms.view==='detail'&&!apTask||ms.view==='merge'&&!mrTask||ms.view==='correction'&&!cxApplicationOpen)ms.view='list';
 if(apTask){ms.view='detail';msSetModule(apTask.kind==='merge'?'merge':'correction')}
 const scroll=$('.ap-mobile-scroll')?.scrollTop||0,key=ms.view+':'+(apTask?.id||ms.recordId||'')+':'+(ms.view==='merge'?mrTask?.tab:ms.view==='correction'?clStep:'');
 nav();document.body.classList.toggle('approval-h5',new URLSearchParams(location.search).get('view')==='h5');
 let content=ms.view==='merge'?msMerge():ms.view==='correction'?msCorrection():ms.view==='detail'?'<div class="ap-detail-content">'+apMobileOverview(apObj())+'<section class="ap-workspace ap-merge-workspace">'+apTabs(apMobileReviewTabs(),apTask.mobileTab,k=>`apMobileTab('${k}')`)+'<div class="ap-workspace-content">'+apMobileContent()+'</div></section></div>':ms.view==='record'?msRecord():msList();
 $('#main').innerHTML='<div class="ap-mobile-stage"><section class="ap-mobile-shell ms-shell" aria-label="'+msTitle()+'"><div class="ap-device-status" aria-hidden="true"><span>9:41</span><i></i><span>▮▮▮　Wi-Fi　▰</span></div><header class="ap-mobile-header">'+(ms.view!=='list'?'<button class="ap-back" aria-label="返回" onclick="msBack()">'+icon('left')+'返回</button>':'<span></span>')+'<h2>'+msTitle()+'</h2><span></span></header>'+msTop()+'<div class="ap-mobile-scroll">'+content+'</div><footer class="ms-footer">'+msFooter()+'</footer><div class="ap-device-bottom" aria-hidden="true"><i></i></div><div id="apMobileSheet"></div>'+(ms.notice?'<div class="ms-toast" role="status">'+esc(ms.notice)+'</div>':'')+'</section></div>';
 $('#mergeDrawers').innerHTML='';$('#modal').innerHTML='';syncDrawerInteraction();if(ms.returnKey===key)$('.ap-mobile-scroll').scrollTop=scroll;ms.returnKey=key;apRenderSheet();uiNormalizeIds();document.title=msTitle()+' · 美业AI平台';
}
function msTop(){
 if(ms.view==='list')return '<div class="ms-tabs" role="tablist" aria-label="工作台功能">'+[['merge','档案合并'],['correction','纠错工单']].map(([key,label])=>`<button role="tab" aria-selected="${ms.module===key}" class="${ms.module===key?'active':''}" onclick="msSwitch('${key}')">${label}</button>`).join('')+'</div>';
 const steps=ms.view==='merge'?[['compare','确定主档案'],['plan','处理订单'],['confirm','合并确认']]:ms.view==='correction'?[[1,'申请依据'],[2,'客户档案'],[3,'业务调整'],[4,'提交确认']]:[];
 return steps.length?'<div class="ms-stepbar">'+steps.map(([key,label])=>`<button aria-current="${key===(ms.view==='merge'?mrTask?.tab:clStep)?'step':'false'}" class="${key===(ms.view==='merge'?mrTask?.tab:clStep)?'active':''}" onclick="msStep(${JSON.stringify(key).replaceAll('"','&quot;')})">${label}</button>`).join('')+'</div>':'';
}
function msFooter(){
 if(ms.view==='list')return btn(ms.module==='merge'?'申请合并':'发起纠错',ms.module==='merge'?'msNewMerge()':'msNewCorrection()','primary');
 if(ms.view==='merge'||ms.view==='correction'){const first=ms.view==='merge'?mrTask?.tab==='compare':clStep===1,last=ms.view==='merge'?mrTask?.tab==='confirm':clStep===4;return btn('存草稿','msSaveDraft()','text')+(!first?btn('上一步','msPrevious()'):'')+btn(last?'提交审核':'下一步',last?'msSubmit()':'msNext()','primary')}
 if(ms.view==='record')return msRecordFooter();
 const o=apObj();return btn('返回列表','msHome()')+(o.review?.status==='rejected'?btn('重新申请',`msRetry('${apTask.kind}',${mrQuote(o.id)})`,'primary'):o.recordId?btn('查看合并记录',`msOpenRecord(${mrQuote(o.recordId)})`,'primary'):'');
}
function msList(){
 const tabs=ms.module==='merge'?[['applications','合并申请'],['records','合并记录'],['drafts','草稿']]:[['tickets','全部工单'],['drafts','草稿']];
 let entries=[];
 if(ms.listTab==='drafts')entries=ms.module==='merge'?(state.mergeApplicationDraft?[{kind:'mergeDraft',o:state.mergeApplicationDraft}]:[]):(state.correctionDrafts||[]).map(o=>({kind:'correctionDraft',o}));
 else if(ms.listTab==='records')entries=state.mergeRecords.map(o=>({kind:'record',o}));
 else entries=(ms.module==='merge'?state.mergeApplications:state.cases).filter(o=>ms.module==='merge'?!o.supersededBy:!!(o.submittedPlan||o.resultData||o.review)).map(o=>({kind:ms.module,o}));
 const q=uiQuery(ms.q).toLowerCase();entries=entries.filter(({o,kind})=>{let status=kind==='record'?mrStatus(o):kind.includes('Draft')?'草稿':apStatus(o,kind),name=kind.startsWith('merge')||kind==='record'?(o.pair||[]).map(x=>x.name+' '+x.phone+' '+x.id).join(' '):[o.name,o.profileDraft?.name,o.form?.description,o.plan?.name].join(' ');return (!q||[o.id,o.reason,o.description,name,o.form?.description].join(' ').toLowerCase().includes(q))&&(!ms.status||status===ms.status)&&(!ms.store||(o.store||o.pair?.[0]?.store||o.plan?.store)===ms.store)}).sort((a,b)=>(b.o.time||b.o.submittedAt||b.o.date||b.o.savedAt||'').localeCompare(a.o.time||a.o.submittedAt||a.o.date||a.o.savedAt||''));
 return '<div class="ms-content"><div class="ms-subtabs">'+tabs.map(([key,label])=>`<button class="${ms.listTab===key?'active':''}" onclick="msGoList('${key}')">${label}</button>`).join('')+'</div><div class="ms-query"><input id="msSearch" onkeydown="if(event.key===&quot;Enter&quot;){ms.q=this.value;ms.visible=20;render()}" aria-label="搜索客户或工单" placeholder="客户、手机号或工单 ID" value="'+esc(ms.q)+'">'+btn('搜索',"ms.q=$('#msSearch').value;ms.visible=20;render()",'text')+btn('筛选','msFilter()','text')+'</div>'+((ms.q||ms.status||ms.store)?'<p class="ms-count-note">'+esc([ms.q,ms.status,ms.store].filter(Boolean).join(' · '))+' '+btn('重置',"ms.q='';ms.status='';ms.store='';render()",'text')+'</p>':'')+entries.slice(0,ms.visible).map(msTicket).join('')+(entries.length>ms.visible?btn('加载更多','ms.visible+=20;render()','wide'):'')+(!entries.length?'<div class="ms-empty">'+(ms.listTab==='drafts'?'暂无草稿<br>填写申请后可保存并继续编辑。':'暂无符合条件的记录')+'</div>':'')+'</div>';
}
function msTicket({o,kind}){
 const draft=kind.includes('Draft'),record=kind==='record',merge=kind==='merge'||kind==='mergeDraft'||record;
 const title=merge?(o.pair||[]).map(x=>x.name).join(' + ')||'未选择客户':o.name||o.plan?.name||'未选择合并记录',status=draft?'草稿':record?mrStatus(o):apStatus(o,kind),target=merge?(o.pair||[]).find(x=>x.id===o.plan?.mainId):o.profileDraft||o.plan?.profileDraft;
 const action=draft?kind==='mergeDraft'?'msNewMerge(true)':`msNewCorrection('',${mrQuote(o.id)})`:record?`msOpenRecord(${mrQuote(o.id)})`:`msOpenDetail('${kind}',${mrQuote(o.id)})`;
 return `<button class="ms-card ms-ticket" onclick="${esc(action)}"><div class="ms-ticket-top"><span>${draft?'未提交申请':(record?'合并记录':'工单')+' '+uiId(o.id)}</span>${apBadge(status)}</div><h3>${esc(title)}</h3><p class="ms-copy">${esc(draft?o.reason||o.form?.description||'继续完善申请':record?'合并后：'+(o.snapshot?.after?.name||target?.name||'已归档'):merge?'主档案：'+(target?.name||'待核实'):o.reason||'业务纠错')}</p><div class="ms-ticket-foot"><span>${esc(o.store||o.pair?.[0]?.store||o.plan?.store||'门店未记录')}</span><span>${esc((o.submittedAt||o.time||o.date||o.savedAt||'').slice(5,16))}</span></div></button>`;
}
function msFilter(){ms.filterDraft={status:ms.status,store:ms.store};apPrompt('筛选',msSelect('办理状态',[['','全部状态'],'待审核','待财务加签','待调整单确认','系统执行中','已完成','已合并','已驳回','执行失败','冷静期中','纠错中','部分已纠错','已纠错','已撤销','快照已归档','草稿'],ms.status,'ms.filterDraft.status=this.value')+msSelect('门店',[['','全部门店'],...new Set(state.mergeCustomers.map(c=>c.store).filter(Boolean))],ms.store,'ms.filterDraft.store=this.value'),btn('重置',"ms.status='';ms.store='';apDismiss();render()")+btn('确定','Object.assign(ms,ms.filterDraft);ms.visible=20;apDismiss();render()','primary'))}
function msOpenDetail(kind,id){if(ms.view==='list')ms.listScroll=$('.ap-mobile-scroll')?.scrollTop||0;msResetForm();ms.view='detail';apOpen(kind,id)}
function msNewMerge(resume=false,fromId=''){
 if(ms.view==='list')ms.listScroll=$('.ap-mobile-scroll')?.scrollTop||0;
 msResetForm();ms.view='merge';msSetModule('merge');if(!resume&&!fromId){mrTask={kind:'new',tab:'compare',pair:[],rule:mrRule(),reason:'',reasonType:'同一客户重复建档',evidence:[],candidateId:'',dirty:false};mrTask.plan=mrPlan([],mrTask.rule);maPrepare(mrTask,true);render()}else mrNew(fromId||undefined);ms.returnKey='';render();
}
function msNewCorrection(sourceId='',draftId=''){
 if(ms.view==='list')ms.listScroll=$('.ap-mobile-scroll')?.scrollTop||0;
 msResetForm();ms.view='correction';msSetModule('correction');newForm=clBlankForm();clStep=1;clSavedFingerprint='';flowTab='orders';cxApplicationOpen=true;
 if(draftId){clEditDraft(draftId);render();return}if(sourceId)msUseSource(sourceId);else render();
}
function msSaveDraft(){apSheet=null;if(ms.view==='merge'){if(!mrTask.pair.length&&!mrTask.reason.trim()){msError('请先选择客户或填写申请内容');return}maSaveDraft();msHome()}else if(ms.view==='correction'&&clSaveDraft()){msHome()}}
function msStep(step){ms.error='';if(ms.view==='merge'){maGoStep(step)}else{if(step>clStep){while(clStep<step){const old=clStep;clNext();if(clStep===old)break}}else clGoStep(step)}render()}
function msPrevious(){msStep(ms.view==='merge'?mrTask.tab==='confirm'?'plan':'compare':Math.max(1,clStep-1))}
function msNext(){msStep(ms.view==='merge'?mrTask.tab==='compare'?'plan':'confirm':Math.min(4,clStep+1))}
function msSubmit(){
 ms.error='';if(ms.view==='merge'){if(!mrTask.reason.trim()){msError('请填写核实说明，说明这些档案属于同一客户的依据');return}if(!mrImpact(mrTask.pair,mrTask.plan).after.name?.trim()){msError('请填写合并后客户姓名');return}maSubmit();if(!apTask&&mrTask?.kind==='application')msOpenDetail('merge',mrTask.id);else if(!apTask&&mrTask?.kind==='record')msOpenRecord(mrTask.id)}else{clSubmit()}if(apTask)ms.listTab=apTask.kind==='merge'?'applications':'tickets';render();
}
function msRetry(kind,id){const o=apItem(kind,id);if(kind==='merge'){msNewMerge(false,id);return}const source=cxSources().find(s=>s.merge===o.merge);if(!source){toast('原合并记录当前不可用于重新申请');return}msNewCorrection(source.id);newForm.reason=o.reason;newForm.description=o.description;newForm.evidence=clone(o.evidence||[]);if(o.profileDraft){clPlan.profileDraft=clone(o.profileDraft);clPlan.businessPlan.targetStore=o.businessPlan?.targetStore||o.store;ctSyncPhone(clPlan)}clSync();render()}
function msMerge(){
 if(!mrTask||mrTask.kind!=='new')return '<div class="ms-empty">请返回列表重新打开申请。</div>';
 const r=mrTask,p=maPrepare(r),error=ms.error?'<div class="ms-errors" role="alert">'+esc(ms.error)+'</div>':'';
 let html='';
 if(r.tab==='compare'){
 const selected=r.pair.find(c=>c.id===r.inspectCustomerId)||r.pair[0];if(selected)r.inspectCustomerId=selected.id;
 html=msCard('参与合并的客户',msNote('查看资料和订单后，明确选择一份主档案。')+(r.pair.length?'<div class="ms-person-strip">'+r.pair.map(c=>`<section class="ms-person-card ${selected?.id===c.id?'selected':''}"><div class="ms-person-head"><strong>${esc(c.name)}</strong>${p.mainId===c.id?'<span class="ms-state">主档案</span>':''}</div><p class="ms-sub">${uiId(c.id)} · ${esc(uiPhone(c.phone))}</p><p class="ms-copy">${esc(c.store)} · ${esc(c.consultant||'客服未记录')}</p><div class="ms-person-actions">${btn('查看资料',`msCustomer(${mrQuote(c.id)})`,'text')}${btn('移除',`mrRemoveMember(${mrQuote(c.id)})`,'text')}</div>${btn(selected?.id===c.id?(p.mainId===c.id?'已设为主档案':'设为主档案'):'查看此客户订单',selected?.id===c.id?`maSetMain(${mrQuote(c.id)})`:`mrTask.inspectCustomerId=${mrQuote(c.id)};render()`,p.mainId===c.id?'primary':'')}</section>`).join('')+'</div>':'<div class="ms-empty">添加需要合并的客户档案</div>'),btn('添加客户',"msPicker('merge')",'text'));
 if(selected)html+=msCard(esc(selected.name)+'的订单',(selected.orders||[]).slice().sort((a,b)=>Number(mrActive(b))-Number(mrActive(a))).map(o=>msOrderCard(selected,o,false)).join('')||msNote('该档案暂无订单'));
 }else if(r.tab==='plan'){
 const rows=maAllOrders(r).filter(x=>mrActive(x.o));html=msCard('进行中的订单',msNote('逐笔确认保留或合并流退，流退不自动退款。')+rows.map(({c,o})=>msOrderCard(c,o,true)).join('')+(rows.length?'':msNote('无进行中的订单，历史订单按原终态保留。')));
 }else{
 const after=mrImpact(r.pair,p).after,phones=maIdentityRows(r.pair).filter(x=>x.type==='phone'),im=mrImpact(r.pair,p);
 html=msCard('合并后客户资料',msNote('保留档案 '+uiId(p.mainId)+' · '+after.store)+msInput('姓名',after.name,"maSetProfile('name',this.value)",'text',true)+msSelect('主手机号',phones.map(x=>[x.value,uiPhone(x.value)+' · '+x.sources.map(c=>c.name).join(' / ')]),p.primaryPhone,'maSetPhone(this.value)',true)+'<div class="ms-form-row">'+msSelect('性别',[['','未填写'],'女','男'],after.gender||'',"maSetProfile('gender',this.value)")+msInput('生日',after.birthday,"maSetProfile('birthday',this.value)",'date')+'</div>'+msText('备注',after.remark,"maSetProfile('remark',this.value)"));
 html+=msCard('订单处理结果',apFacts([['保留订单',(im.all.length-im.returned.length)+' 笔'],['合并流退',im.returned.length+' 笔'],['取消排客',im.cancelled.length+' 项']])+im.returned.map(o=>msNote((o.name||'订单')+' · '+uiId(o.id)+' · '+(o.appointmentAt||o.scheduledAt||'无排客安排'))).join(''));
 html+=msCard('申请原因与依据',msSelect('申请原因',['同一客户重复建档','客户更换手机号','微信与手机号档案重复','其他'],r.reasonType,"mrTask.reasonType=this.value;maMarkDirty()",true)+msText('核实说明',r.reason,"mrTask.reason=this.value;maMarkDirty()",true)+msFiles('merge'));
 html+=msNote('提交后进入审核，全部审核通过后系统才会执行合并。');
 }
 return '<div class="ms-content">'+error+html+'</div>';
}
function msOrderCard(c,o,editable){
 const info=maOrderInfo(c,o),action=mrTask?.plan?.orderChoices?.[o.id]||'keep';
 return '<article class="ap-order-item"><div class="ap-order-title"><h4>'+esc(info.name)+'</h4>'+badge(o.status)+'</div><p class="ap-order-source">'+esc(c.name)+' · 订单 '+uiId(o.id)+'</p><div class="ap-order-context"><p>'+esc([info.appointment?'预约 '+info.appointment:'预约未安排',info.store||'订单门店未记录'].join(' · '))+'</p><p>'+esc(['预约：'+(info.bookingBy||'未记录'),'接待：'+(info.receiver||'未记录')].join(' · '))+'</p></div><div class="ap-order-bottom"><span>'+money(o.amount||0)+' · 预约金 '+money(o.deposit||0)+'</span>'+btn('订单资料',`msMergeOrder(${mrQuote(c.id)},${mrQuote(o.id)})`,'text')+'</div>'+(editable?'<div class="ms-options">'+[['keep','保留订单'],['return','合并流退']].map(([key,label])=>`<button class="${action===key?'active':''}" onclick="mrSetOrder(${esc(mrQuote(o.id))},'${key}')">${label}</button>`).join('')+'</div>'+(action==='return'?msNote((info.appointment?'将取消预约 '+info.appointment+'；':'')+'原订单与收退款记录保留。'):'')+msInput('处理依据（选填）',mrTask.plan.orderReasons?.[o.id]||'',`mrTask.plan.orderReasons[${mrQuote(o.id)}]=this.value;maMarkDirty()`):'')+'</article>';
}
function msMergeOrder(cid,id){const c=mrTask?.pair?.find(c=>c.id===cid)||state.mergeCustomers.find(c=>c.id===cid),o=c?.orders?.find(o=>o.id===id);if(!o)return;const i=maOrderInfo(c,o);apPrompt('订单资料',msCard(esc(i.name),apFacts([['客户',esc(c.name)],['状态',esc(o.status)],['金额',money(o.amount||0)],['预约金',money(o.deposit||0)],['门店',esc(i.store||'未记录')],['预约人员',esc(i.bookingBy||'未记录')],['接待人员',esc(i.receiver||'未记录')],['创建时间',esc(i.created||'未记录')],['预约时间',esc(i.appointment||'未安排')],['到店时间',esc(i.arrived||'未记录')],['支付时间',esc(i.paid||'未记录')]])),btn('返回','apDismiss()','primary'))}
function msCustomer(id){const c=mrTask?.pair?.find(c=>c.id===id)||state.mergeCustomers.find(c=>c.id===id);if(!c)return;apPrompt('客户资料',msCard(esc(c.name),apFacts([['档案 ID',uiId(c.id)],['手机号',esc(uiPhone(c.phone))],['备用手机号',esc(uiPhone(c.oldPhone)||'未填写')],['门店',esc(c.store)],['归属客服',esc(c.consultant||'未记录')],['性别 / 生日',esc([c.gender,c.birthday].filter(Boolean).join(' / ')||'未填写')],['备注',esc(c.remark||'未填写')]])),btn('返回','apDismiss()','primary'))}
function msPicker(kind){ms.picker={kind,q:'',selected:new Set()};msPickerRender()}
function msPickerRender(){
 const p=ms.picker;if(!p)return;const q=uiQuery(p.q).toLowerCase();let rows=[],title='选择客户';
 if(p.kind==='source'){title='选择合并记录';rows=[...new Map(cxSources().map(x=>[x.merge,x])).values()].filter(x=>{const r=state.mergeRecords.find(r=>r.id===x.merge);return r&&!r.revoked&&!mhArchived(r)&&mrTime(r.coolingUntil)<=Date.now()}).filter(x=>!q||[x.name,x.subname,x.merge,x.phone,...(state.mergeRecords.find(r=>r.id===x.merge)?.pair||[]).map(c=>c.name+' '+c.phone)].join(' ').toLowerCase().includes(q))}
 else if(p.kind==='history'){title='引用历史资料';rows=ctHistory(clPlan).filter(x=>!q||[x.id,x.name,x.phone].join(' ').toLowerCase().includes(q))}
 else rows=state.mergeCustomers.filter(c=>mrEligible(c)&&!c.inactive&&!c.mergedInto&&(p.kind==='merge'?!mrTask.pair.some(x=>x.id===c.id):c.id!==clPlan.cus)&&(!q||[c.id,c.name,c.phone,c.oldPhone,c.store].join(' ').toLowerCase().includes(q)));
 const query='<div class="ms-query"><input aria-label="搜索选择项" placeholder="姓名、手机号或 ID" value="'+esc(p.q)+'" oninput="ms.picker.q=this.value" onkeydown="if(event.key===\'Enter\')msPickerRender()">'+btn('搜索','msPickerRender()','text')+btn('重置',"ms.picker.q='';msPickerRender()",'text')+'</div>';
 const list=rows.slice(0,60).map(c=>{const record=p.kind==='source'?state.mergeRecords.find(r=>r.id===c.merge):null,name=record?record.pair.map(x=>x.name).join(' + ')+' → '+(record.snapshot?.after?.name||c.name):c.name,sub=record?record.pair.map(x=>uiPhone(x.phone)).filter(Boolean).join(' / '):uiPhone(c.phone),id=record?c.merge:c.id;
 if(p.kind==='merge')return '<label class="ms-picker"><input type="checkbox" '+(p.selected.has(c.id)?'checked':'')+' onchange="this.checked?ms.picker.selected.add('+esc(mrQuote(c.id))+'):ms.picker.selected.delete('+esc(mrQuote(c.id))+')"><span class="ms-row-main"><strong>'+esc(name)+'</strong><p class="ms-sub">'+uiId(id)+' · '+esc(sub)+'</p><p class="ms-sub">'+esc(c.store)+'</p></span></label>';
 return '<button class="ms-card ms-ticket" onclick="msChoose('+esc(mrQuote(c.id))+')"><h3>'+esc(name)+'</h3><p class="ms-sub">'+uiId(id)+' · '+esc(sub)+'</p><p class="ms-copy">'+esc(c.store)+(record&&ctActiveCase(c)?' · 已有进行中工单':'')+'</p></button>';
 }).join('');
 apPrompt(title,query+(list||'<div class="ms-empty">暂无可选记录</div>')+(rows.length>60?msNote('结果较多，请输入姓名或手机号缩小范围。'):''),btn('取消','apDismiss()')+(p.kind==='merge'?btn('添加所选客户','msAddCustomers()','primary'):''));
}
function msAddCustomers(){const additions=[...ms.picker.selected].map(id=>state.mergeCustomers.find(c=>c.id===id)).filter(Boolean);if(!additions.length){toast('请选择客户');return}mrTask.pair.push(...clone(additions));maPrepare(mrTask);maMarkDirty();apDismiss();ms.picker=null;render()}
function msChoose(id){const kind=ms.picker?.kind;if(kind==='source'){if(clPlan&&clHasContent()){apPrompt('更换合并记录','<p class="ms-copy">更换后将重新读取业务数据，已填写的客户资料和业务归属需重新确认。</p>',btn('继续当前申请','apDismiss()')+btn('确认更换',`msUseSource(${mrQuote(id)})`,'primary'));return}msUseSource(id)}else if(kind==='history'){if(Object.values(clPlan.profileDraft).some(Boolean))apPrompt('引用这份历史资料？','<p class="ms-copy">将替换当前填写的姓名、手机号等基本资料，引用后仍可核实修改。</p>',btn('返回选择','msPickerRender()')+btn('确认引用',`msCopyHistory(${mrQuote(id)})`,'primary'));else msCopyHistory(id)}else{bpSetTarget('existing',id);apDismiss();render()}}
function msUseSource(id){const source=clSource(id);if(!source)return;const record=state.mergeRecords.find(r=>r.id===source.merge);if(!record||record.revoked||mhArchived(record)||mrTime(record.coolingUntil)>Date.now()){toast('该合并记录当前不能直接纠错');return}const active=ctActiveCase(source);if(active){apPrompt('已有进行中的纠错工单','<p class="ms-copy">该当前档案已有工单 '+uiId(active.id)+'，可先查看处理进度。</p>',btn('返回选择',"msPicker('source')")+btn('查看工单',`msOpenDetail('correction',${mrQuote(active.id)})`,'primary'));return}newForm.sourceId=id;clPlan=clMakePlan(source);clStep=1;flowTab='orders';clTouch();apSheet=null;ms.picker=null;render()}
function msFiles(kind){const files=kind==='merge'?mrTask.evidence:newForm.evidence;return '<label class="ms-upload">'+icon('upload')+' 添加证据附件<input type="file" multiple aria-label="添加证据附件" onchange="msAddFiles(\''+kind+'\',this.files)"></label>'+files.map((name,i)=>'<div class="ms-row"><span class="ms-sub">'+esc(name)+'</span>'+btn('移除',`msRemoveFile('${kind}',${i})`,'text')+'</div>').join('')+msNote('原型保存附件名称；文件内容仅在当前会话中保留。')}
function msAddFiles(kind,files){const target=kind==='merge'?mrTask.evidence:newForm.evidence;for(const f of files){if(!target.includes(f.name))target.push(f.name);fileObjects.set((kind==='merge'?'merge:':'')+f.name,f)}kind==='merge'?maMarkDirty():clTouch();render()}
function msRemoveFile(kind,i){(kind==='merge'?mrTask.evidence:newForm.evidence).splice(i,1);kind==='merge'?maMarkDirty():clTouch();render()}
function msCorrection(){
 let c=clPlan,html='',errors=clErrors.map((e,i)=>`<button onclick="clLocateError(${i})">${esc(e.message)}</button>`).join('');
 if(clStep===1){html=msCard('关联合并记录',c?'<p class="ms-copy">'+esc(ctMergeTitle(c))+'</p>'+msNote('当前档案 '+c.name+' · '+uiId(c.cus)):'<p class="ms-sub">选择发生误合并的记录，读取当前有效业务。</p>',btn(c?'更换':'选择记录',"msPicker('source')",'text'))+msCard('申请原因与依据',msSelect('纠错原因',[['','请选择'],'合并了不同人','部分订单归属错误','资金或权益归属错误','客户资料错误','原计奖归属错误','其他'],newForm.reason,'newForm.reason=this.value;clTouch()',true)+msText('问题说明',newForm.description,'newForm.description=this.value;clTouch()',true)+msFiles('correction'));if(c)html+=msCard('本次处理范围',msSelect('纠错目的',[['split','分离误合并客户'],['partial','纠正部分业务'],['profile','纠正当前客户资料'],['performance','更正原计奖记录']],c.businessPlan.scope,'bpScope(this.value)'))}
 else if(clStep===2){html=msTarget()}
 else if(clStep===3){html=msBusiness()}
 else if(c){clSync();html=msCard('提交内容',apFacts([['关联合并',esc(ctMergeTitle(c))],['申请原因',esc(c.reason)],['核实依据',esc(c.description)],['本次客户',esc(bpHasTarget(c)?ctTargetLabel(c):c.name)],['建档安排',bpHasTarget(c)&&c.businessPlan.targetMode==='new'?'审核通过后新建 1 份':'不新建档案']]))+msCard('业务调整',apMobileMarkup(apCorrectionBusiness(c)).replaceAll('apCorrectionDetail(','msCorrectionRead('))+msCard('影响核对',apMobileMarkup(apCorrectionImpact(c)))+msNote('提交后方案锁定，全部审批通过后系统才会执行。')}
 return '<div class="ms-content">'+(ms.error?'<div class="ms-errors" role="alert">'+esc(ms.error)+'</div>':'')+(errors?'<div class="ms-errors" role="alert">'+errors+'</div>':'')+html+'</div>';
}
function msTarget(){
 const c=clPlan,p=c.businessPlan;if(!bpBusiness(c)){if(p.scope==='profile')return msCard('纠正客户资料',msProfileFields(p.primaryProfile,'clPlan.businessPlan.primaryProfile',false));return msCard('本次处理客户',apFacts([['客户',esc(c.name)+' · '+uiId(c.cus)],['处理方式','仅更正原计奖记录，不新建客户档案']]))}
 let html=msCard('档案来源',msSelect('建档方式',[['new','手工填写新档案'],['history','引用历史资料新建'],['existing','选择已有客户档案']],p.targetEntry||'new','ctSetEntry(this.value)'));
 if(p.targetEntry==='existing'){const who=p.targetSnapshot;html+=msCard('关联已有档案',who?apFacts([['姓名',esc(who.name)],['手机号',esc(uiPhone(who.phone))],['档案门店',esc(who.store)]]):msNote('选择经核实的已有客户，本次不创建新档案。'),btn(who?'重新选择':'选择客户',"msPicker('existing')",'text'))}
 else html+=msCard('新建客户档案',(p.targetEntry==='history'?btn('选择历史客户资料',"msPicker('history')",'text')+msNote('仅引用基本资料，可核实后修改；不会恢复旧业务。'):'')+msProfileFields(c.profileDraft,'clPlan.profileDraft',true)+msSelect('新档案门店',[['','请选择门店'],...ctStores(c)],p.targetStore,'clPlan.businessPlan.targetStore=this.value;bpTouch()',true));
 return html;
}
function msProfileFields(person,path,phone){const action=key=>path==='clPlan.profileDraft'?`ctSetProfile('${key}',this.value)`:`${path}.${key}=this.value;bpTouch()`;return msInput('姓名',person.name,action('name'),'text',true)+(phone?msInput('手机号',person.phone,action('phone'),'tel',true):'')+'<div class="ms-form-row">'+msSelect('性别',[['','未填写'],'女','男'],person.gender||'',action('gender'))+msInput('生日',person.birthday,action('birthday'),'date')+'</div>'+msText('备注（选填）',person.remark,action('remark'))}
function msBusiness(){
 const c=clPlan,p=c.businessPlan,tabs=bpSectionTabs(c);if(!tabs.some(x=>x[0]===flowTab))flowTab=tabs[0][0];
 const nav='<div class="ms-business-tabs" role="tablist">'+tabs.map(([key,label])=>`<button role="tab" aria-selected="${flowTab===key}" class="${flowTab===key?'active':''}" onclick="flowTab='${key}';ms.returnKey='';render()">${label}</button>`).join('')+'</div>';
 let html='',rows=[];
 const dest=to=>to==='target'?bpTargetName(c):c.name,record=(key,r,title,sub,status,action='调整')=>'<div class="ms-row"><div class="ms-row-main"><strong>'+esc(title)+'</strong><p class="ms-sub">'+esc(sub)+'</p><p class="ms-copy">'+esc(status)+'</p></div>'+btn(action,`msEdit('${key}',${mrQuote(r.id)})`,'text')+'</div>';
 if(flowTab==='orders'){
 rows=p.orders.slice().sort((a,b)=>Number(mrActive(b.record))-Number(mrActive(a.record)));html=msCard('订单归属',rows.map(r=>record('orders',r,r.record.name||'订单',uiId(r.id)+' · '+r.record.status+' · '+money(r.record.amount||0),(r.to==='target'?'转入 · ':'保留 · ')+dest(r.to),'调整归属')).join('')||msNote('暂无订单'));
 if(c.restoreOrders?.length)html+=msCard('原流退订单补录',c.restoreOrders.map(r=>record('restore',{...r,id:r.originalId},r.project||r.record?.name||'原订单','原订单 '+uiId(r.originalId),r.enabled?'将新建补录订单 · '+(r.scheduledAt||'暂不排客'):'本次不补录',r.enabled?'修改':'补录')).join(''));
 }else if(flowTab==='assets'){html=msCard('项目与资产',p.assets.map(r=>record('assets',r,r.record.name,uiId(r.id)+' · 剩余 '+r.record.remaining+' / 冻结 '+bpNum(r.record.frozen),bpAssetQty(c,r)?'转移 '+bpAssetQty(c,r)+(r.record.unit||'次')+' → '+bpTargetName(c):'保留当前档案')).join('')||msNote('暂无项目资产'))+msEvidenceControl('asset','项目资产')}
 else if(flowTab==='funds'){
 html=msCard('账户余额',bpAccountMoves(c).map(r=>record('accounts',r,r.label,'余额 '+money(r.balance)+' · 冻结 '+money(r.frozen),'拟转移 '+money(r.move)+' · 其中冻结 '+money(r.frozenTo),'核对冻结')).join('')||msNote('暂无独立账户'));
 html+=msCard('资金归属',p.funds.map(r=>record('funds',r,r.record.type,uiId(r.id)+' · 原金额 '+cxSign(r.signed),bpChosenAmount(r)?'内部归属调整 '+cxSign(bpChosenAmount(r))+' → '+bpTargetName(c):'保留原归属')).join('')||msNote('暂无资金流水'))+msNote('原交易保留。内部归属调整不新增实际收款，也不会再次退款。')+msEvidenceControl('wallet','账户流水');
 }else if(flowTab==='records'){
 html=msCard('服务记录',p.services.map(r=>record('services',r,r.record.name,uiId(r.id)+' · '+(r.actualEmployee||'服务员工待核实'),dest(r.to)+' · '+({none:'保留实际扣减',replace:'更正扣减来源',receivable:'恢复误扣并记待补收'})[r.repair])).join('')||msNote('暂无服务记录'));
 html+=msCard('回访与关联记录',p.records.map(r=>record('records',r,r.record.name||BP_RECORD_LABELS[r.key],(BP_RECORD_LABELS[r.key]||r.key)+' · '+uiId(r.id),dest(r.to)+(r.handler?' · '+r.handler:''))).join('')||msNote('暂无关联记录'));
 }else if(flowTab==='staff'){
 html=msCard('关联员工业绩',msNote('业绩随订单或资金迁移，员工分配默认保留。仅原计奖记录有误时更正。')+p.staff.map(r=>{const move=bpStaffRoute(c,r);return record('staff',r,r.record.metric,(r.record.orderId?'订单 '+uiId(r.record.orderId):'关联资金 '+uiId(move.reference))+' · '+r.beneficiaries.map(b=>b.employee).join('、'),r.amount+' '+(r.record.unit||'元')+' · '+(move.ratio>0?'随业务转入 '+bpTargetName(c):'保留当前档案'),bpStaffChanged(r)?'查看更正':'核对')}).join(''))+msEvidenceControl('staff','员工业绩');
 }else if(p.scope==='profile')html=msCard('客户资料',msProfileFields(p.primaryProfile,'clPlan.businessPlan.primaryProfile',false));
 else html=msCard('身份信息归属',c.identityRows.map((r,i)=>record('identity',{...r,id:String(i)},r.type,r.type.includes('手机')?uiPhone(r.value):r.value,r.move?'转入 · '+bpTargetName(c):'保留 · '+c.name)).join(''));
 return nav+html;
}
function msEvidenceControl(kind,label){const p=clPlan.businessPlan;if(p[kind+'Evidence']==='provided')return '';return msCard(label+'核实依据',msSelect('明细核实状态',[['pending','尚待核实'],['none','已核实，本次不涉及调整'],['limited','已核实本次范围']],p[kind+'Evidence'],`clPlan.businessPlan.${kind}Evidence=this.value;bpTouch()`)+msText('核实依据',p[kind+'EvidenceNote']||'',`clPlan.businessPlan.${kind}EvidenceNote=this.value;bpTouch()`,true))}
function msEdit(key,id){
 const c=clPlan;let source=key==='restore'?c.restoreOrders.find(x=>x.originalId===id):key==='identity'?c.identityRows[Number(id)]:c.businessPlan[key]?.find(x=>x.id===id);if(!source)return;
 ms.edit={key,id,data:clone(source),error:''};msEditRender();
}
function msEditSet(key,value,redraw=false){ms.edit.data[key]=value;ms.edit.error='';if(redraw)msEditRender()}
function msEditRender(){
 const e=ms.edit;if(!e)return;const r=e.data,c=clPlan,p=c.businessPlan,key=e.key,choices=[['main','保留 · '+c.name],['target','转入 · '+bpTargetName(c)]],to=msSelect('客户归属',choices,r.to,"msEditSet('to',this.value,true)",true);let title='',content='';
 const input=(label,k,type='text',required=false)=>msInput(label,r[k],`msEditSet('${k}',${type==='number'?'Number(this.value)':'this.value'})`,type,required);
 const reason=()=>msText('处理依据',r.reason,"msEditSet('reason',this.value)",true);
 if(key==='orders'){
 title='调整订单归属';content=msCard(esc(r.record.name),apFacts([['订单',uiId(r.id)],['状态',esc(r.record.status)],['金额',money(r.record.amount||0)]]))+msCard('本次处理',to+msSelect('处理场景',[['ownership','客户归属错误'],['wrongAsset','扣错项目或余额'],['validPayment','有效代付或赠与'],['resume','恢复服务']],r.scenario||'ownership',"msEditSet('scenario',this.value)")+reason()+msNote('订单归属变更会联动尚未单独修改的权益、资金、服务与回访记录。'));
 }else if(key==='assets'){
 title='调整项目权益';const choices=[['main','保留当前档案'],['target','转移全部剩余'],['split','转移部分剩余']];content=msCard(esc(r.record.name),apFacts([['当前剩余',r.record.remaining+' '+(r.record.unit||'次')],['其中冻结',bpNum(r.record.frozen)+' '+(r.record.unit||'次')]]))+msCard('本次分配',msSelect('处理方式',choices,r.to,"msEditSet('to',this.value);ms.edit.data.qty=this.value==='target'?ms.edit.data.record.remaining:0;ms.edit.data.frozen=this.value==='target'?Number(ms.edit.data.record.frozen||0):0;msEditRender()",true)+(r.to==='split'?input('转移数量','qty','number',true):'')+(r.to!=='main'?input('其中转移冻结数量','frozen','number',true):'')+reason());
 }else if(key==='funds'){
 title='调整资金归属';content=msCard(esc(r.record.type),apFacts([['原流水',uiId(r.id)],['原始金额',cxSign(r.signed)],['关联订单',uiId(r.record.orderId)],['交易状态',esc(r.record.status||'已记录')]]))+msCard('内部归属调整',msSelect('处理方式',[...choices,['split','部分转入目标档案']],r.to,"msEditSet('to',this.value,true)",true)+(r.to==='split'?input('转移金额','amount','number',true):'')+reason()+msNote('仅调整客户内部归属，原收款或退款不重复执行。'));
 }else if(key==='accounts'){
 title='核对冻结余额';const move=bpAccountMoves(c).find(a=>a.id===r.id);content=msCard(esc(r.label),apFacts([['当前余额',money(r.balance)],['当前冻结',money(r.frozen)],['拟转移余额',money(move.move)]]))+msCard('冻结分配',input('其中转入目标的冻结金额','frozenTo','number',true)+msNote('转移余额由上一步资金流水计算，冻结金额不能超过当前冻结和转移金额。'));
 }else if(key==='services'){
 title='调整服务记录';content=msCard(esc(r.record.name),apFacts([['关联订单',uiId(r.record.orderId)],['原扣减资产',uiId(r.record.assetId)],['服务数量',bpNum(r.record.qty)+' 次']]))+msCard('服务与扣减',to+input('实际服务员工','actualEmployee','text',true)+msSelect('扣减处理',[['none','保留实际扣减'],['replace','改扣正确资产'],['receivable','退回误扣，登记待补收']],r.repair,"msEditSet('repair',this.value,true)")+(r.repair==='replace'?msSelect('正确资产',[['','请选择'],...p.assets.filter(a=>a.id!==r.record.assetId).map(a=>[a.id,a.record.name+' · '+uiId(a.id)])],r.replacementAssetId,"msEditSet('replacementAssetId',this.value)",true):r.repair==='receivable'?input('待补收金额','receivable','number',true):'')+reason());
 }else if(key==='records'){
 title='调整关联记录';content=msCard(esc(r.record.name||BP_RECORD_LABELS[r.key]),apFacts([['类型',esc(BP_RECORD_LABELS[r.key])],['记录内容',esc(r.record.content||r.record.name||'未记录')],['状态',esc(r.record.status||'未记录')]]))+msCard('本次处理',to+(['followups','tickets'].includes(r.key)?input('任务负责人','handler','text',true):'')+reason());
 }else if(key==='restore'){
 title='补录服务订单';content=msCard(esc(r.project),apFacts([['原流退订单',uiId(r.originalId)],['补录项目',esc(r.project)]]))+msCard('补录安排',msSelect('是否补录',[['no','本次不补录'],['yes','新建补录订单']],r.enabled?'yes':'no',"msEditSet('enabled',this.value==='yes',true)")+(r.enabled?msSelect('排客安排',[['pending','暂不排客'],['scheduled','安排排客']],r.scheduledAt?'scheduled':r.scheduleMode||'pending',"msEditSet('scheduleMode',this.value);if(this.value==='pending')ms.edit.data.scheduledAt='';msEditRender()")+((r.scheduleMode==='scheduled'||r.scheduledAt)?input('排客时间','scheduledAt','datetime-local',true):'')+msText('补录依据',r.bpReason,"msEditSet('bpReason',this.value)",true):'')+msNote('审批通过后使用新编号补录，原订单终态不回退。'));
 }else if(key==='identity'){
 title='身份信息归属';content=msCard(esc(r.type),'<p class="ms-copy">'+esc(r.type.includes('手机')?uiPhone(r.value):r.value)+'</p>')+msCard('处理方式',msSelect('身份归属',[['keep','保留 · '+c.name],['move','转入 · '+bpTargetName(c)]],r.move?'move':'keep',"msEditSet('move',this.value==='move)",true));
 }else if(key==='staff'){
 title='核对关联业绩';const move=bpStaffRoute(c,r);content=msCard(esc(r.record.metric),apFacts([['关联业务',uiId(move.reference||r.record.orderId)],['迁移去向',move.ratio>0?esc(bpTargetName(c)):'保留当前档案'],['历史已发',money(r.record.paidAmount||0)]]));
 if(!e.staffEditing)content+=msCard('员工分配',r.beneficiaries.map(b=>'<div class="ms-row"><div class="ms-row-main"><strong>'+esc(b.employee)+'</strong><p class="ms-sub">'+esc(b.store)+' · '+b.share+'%</p></div><span class="ms-copy">'+money(b.commission)+'</span></div>').join('')+msNote('沿用原员工分配，随关联业务迁移。'),btn('更正原计奖记录','ms.edit.staffEditing=true;msEditRender()','text'));
 else content+=msCard('更正计奖记录',input('业绩基数','amount','number',true)+r.beneficiaries.map((b,i)=>'<div class="ms-divider"></div>'+msInput('员工',b.employee,`ms.edit.data.beneficiaries[${i}].employee=this.value`,'text',true)+msSelect('门店',ctStores(c),b.store,`ms.edit.data.beneficiaries[${i}].store=this.value`,true)+'<div class="ms-form-row">'+msInput('分成比例 %',b.share,`ms.edit.data.beneficiaries[${i}].share=Number(this.value)`,'number',true)+msInput('应计提成',b.commission,`ms.edit.data.beneficiaries[${i}].commission=Number(this.value)`,'number',true)+'</div>'+(r.beneficiaries.length>1?btn('移除此员工',`ms.edit.data.beneficiaries.splice(${i},1);msEditRender()`,'text'):'')).join('')+btn('添加分配员工',"ms.edit.data.beneficiaries.push({employee:'',store:clPlan.store,share:0,commission:0});msEditRender()",'text')+input('调整期','adjustmentPeriod','month',true)+reason());
 }
 apPrompt(title,(e.error?'<div class="ms-errors" role="alert">'+esc(e.error)+'</div>':'')+content,btn('取消','ms.edit=null;apDismiss()')+(key==='staff'&&!e.staffEditing?btn('核对完成','ms.edit=null;apDismiss()','primary'):btn('保存到方案','msSaveEdit()','primary')));
}
function msSaveEdit(){
 const e=ms.edit;if(!e)return;const c=clPlan,p=c.businessPlan,r=e.data,key=e.key;let error='';
 if(key==='orders'&&r.to==='target'&&!r.reason?.trim())error='请填写订单归属依据';
 if(['assets','funds'].includes(key)&&r.to==='split'&&(!r.reason?.trim()||!(Number(key==='assets'?r.qty:r.amount)>0)))error='请填写有效的转移数量或金额，以及部分调整依据';
 if(key==='assets'&&(bpNum(r.qty)<0||bpNum(r.qty)>bpNum(r.record.remaining)||bpNum(r.frozen)<0||bpNum(r.frozen)>bpNum(r.qty)||bpNum(r.frozen)>bpNum(r.record.frozen)))error='剩余与冻结分配超出当前可用范围';
 if(key==='funds'&&(r.to!=='main'&&(r.pending||r.record.status==='处理中')||bpNum(r.amount)<0||bpNum(r.amount)>Math.abs(r.signed)))error='流水处理中或分配金额超出可调整范围';
 if(key==='services'&&(!r.actualEmployee?.trim()||r.repair!=='none'&&!r.reason?.trim()||r.repair==='replace'&&!r.replacementAssetId||r.repair==='receivable'&&!(r.receivable>0)))error='请补全服务员工、扣减处理及依据';
 if(key==='restore'&&r.enabled&&(!r.bpReason?.trim()||r.scheduleMode==='scheduled'&&!r.scheduledAt))error='请填写补录依据，并确认排客时间';
 if(key==='staff'&&(!r.reason?.trim()||Math.abs(r.beneficiaries.reduce((n,b)=>n+Number(b.share),0)-100)>.001||r.beneficiaries.some(b=>!b.employee.trim()||!b.store||b.share<=0||b.commission<0)))error='员工、门店、提成与依据需完整，分成比例合计为 100%';
 if(error){e.error=error;msEditRender();return}
 if(key==='identity'){c.identityRows[Number(e.id)]={...r,phoneInputSuggested:false}}
 else if(key==='restore'){r.restoreUiVersion=1;r.scheduledAt=(r.scheduledAt||'').replace('T',' ');c.restoreOrders[c.restoreOrders.findIndex(x=>x.originalId===e.id)]=clone(r)}
 else if(key==='orders'){const to=r.to;bpSet('orders',e.id,'to',to);Object.assign(p.orders.find(x=>x.id===e.id),clone(r),{manualOverride:true});}
 else{const index=p[key].findIndex(x=>x.id===e.id);p[key][index]=clone(r);if(['assets','funds','services','records'].includes(key))p[key][index].manualOverride=true}
 ms.edit=null;bpTouch();apDismiss();render();
}
function msCorrectionRead(key,id=''){
 if(!clPlan)return;const html=key==='all'?apCorrectionBusiness(clPlan,true):key==='snapshot'?apCorrectionSource(clPlan):apCorrectionRecord(clPlan,key,id),parent=apSheet?{...apSheet,scroll:$('#apMobileSheet .ap-action-body')?.scrollTop||0}:null;
 apSheet={title:key==='all'?'全部业务':key==='orders'?'订单资料':'业务资料',content:apMobileMarkup(html).replaceAll('apCorrectionDetail(','msCorrectionRead('),footer:btn('返回','apDismiss()','primary'),parent};$('#apMobileSheet').innerHTML='';apRenderSheet();uiNormalizeIds();
}
function msOpenRecord(id){if(ms.view==='list')ms.listScroll=$('.ap-mobile-scroll')?.scrollTop||0;msResetForm();ms.view='record';ms.recordId=id;ms.recordTab='overview';msSetModule('merge');ms.returnKey='';render()}
function msRecord(){
 const r=state.mergeRecords.find(x=>x.id===ms.recordId);if(!r)return '<div class="ms-empty">该记录不存在</div>';const data=mhData(r),archived=mhArchived(r),tabs=[['overview','合并结果'],['orders','订单处理'],['snapshot','合并前快照'],['logs','操作记录']];let html='';
 if(ms.recordTab==='overview'){
 html=msCard(esc((r.pair||[]).map(c=>c.name).join(' + ')),apFacts([['合并记录',uiId(r.id)],['合并结果',esc(data.after?.name||'快照已归档')],['执行状态',mrBadge(mrStatus(r))],['执行时间',esc(r.time)],['执行方式',esc(r.method)],['保留档案',uiId(r.plan.mainId)]]));
 if(!archived&&data.after)html+=msCard('合并后客户资料',apFacts([['姓名',esc(data.after.name)],['手机号',esc(uiPhone(data.after.phone))],['门店',esc(data.after.store)],['客服',esc(data.after.consultant||'未记录')],['客户类型',esc(data.after.customerType||'未记录')]]));
 html+=msCard('业务迁移',(r.migrations||[]).map(x=>'<div class="ms-row"><span class="ms-copy">'+esc(x.name)+'</span><span class="ms-sub">'+esc(x.count)+'</span></div>').join('')||msNote('历史记录未保存迁移明细'));
 }else if(ms.recordTab==='orders'){
 html=archived?msCard('订单资料',msNote('完整快照已归档，当前仅可查看合并摘要。')):msCard('订单处理结果',mhOrderRows(r).sort((a,b)=>Number(mrActive(b.before||b.after))-Number(mrActive(a.before||a.after))).map(x=>{const o=x.before||x.after;return '<article class="ap-order-item"><div class="ap-order-title"><h4>'+esc(o.name||'订单')+'</h4><span class="ap-order-action '+(mhReturned(x)?'is-returned':'is-kept')+'">'+(mhReturned(x)?'合并流退':'保留订单')+'</span></div><p class="ap-order-source">订单 '+uiId(o.id)+' · '+esc(x.c?.name||'来源未保存')+'</p><p class="ms-copy">'+esc(mhAppointment(x))+'</p><div class="ap-order-bottom"><span>'+esc(x.before?.status||'未保存')+' → '+esc(x.after?.status||'结果未保存')+'</span>'+btn('订单资料',`msRecordOrder(${mrQuote(o.id)})`,'text')+'</div></article>'}).join('')||msNote('未保存订单明细'));
 }else if(ms.recordTab==='snapshot')html=archived?msCard('合并前快照',msNote('快照已归档，不能按历史数据恢复业务。')):mhSnapshotPeople(r).map(c=>msCard(esc(c.name)+(c.snapshotSupplemented?' · 示例资料':''),apFacts([['档案 ID',uiId(c.id)],['手机号',esc(uiPhone(c.phone))],['门店',esc(c.store)],['客服',esc(c.consultant||'未记录')],['订单',((c.orders||[]).length)+' 笔']]),btn('完整资料',`msRecordProfile(${mrQuote(c.id)})`,'text'))).join('');
 else html='<div class="ap-detail-card">'+apMobileMarkup(mhLogs(r))+'</div>';
 return '<div class="ms-content">'+apTabs(tabs,ms.recordTab,k=>`ms.recordTab='${k}';ms.returnKey='';render()`)+html+'</div>';
}
function msRecordOrder(id){const r=state.mergeRecords.find(x=>x.id===ms.recordId);if(!r||mhArchived(r))return;const x=mhOrderRows(r).find(x=>(x.before||x.after).id===id);if(!x)return;const o=x.before||x.after,i=maOrderInfo(x.c||{},o);apPrompt('订单处理资料',msCard(esc(i.name),apFacts([['订单',uiId(id)],['来源客户',esc(x.c?.name||'未记录')],['处理结果',mhReturned(x)?'合并流退':'保留订单'],['处理前状态',esc(x.before?.status||'未记录')],['处理后状态',esc(x.after?.status||'未记录')],['排客安排',esc(mhAppointment(x))],['订单门店',esc(i.store||'未记录')],['预约人员',esc(i.bookingBy||'未记录')],['接待人员',esc(i.receiver||'未记录')],['订单金额',money(o.amount||0)],['预约金',money(o.deposit||0)]])),btn('返回','apDismiss()','primary'))}
function msRecordProfile(id){const r=state.mergeRecords.find(x=>x.id===ms.recordId);if(!r||mhArchived(r))return;const c=mhSnapshotPeople(r).find(x=>x.id===id);if(!c)return;apPrompt('合并前客户资料',apMobileMarkup(mhProfile(c,'客户资料',true)+mhSnapshotBusiness(c)),btn('返回','apDismiss()','primary'))}
function msRecordFooter(){
 const r=state.mergeRecords.find(x=>x.id===ms.recordId);if(!r)return btn('返回列表','msHome()');const source=cxSources().find(x=>x.merge===r.id),active=source&&ctActiveCase(source);
 if(active)return btn('返回列表','msHome()')+btn('查看纠错工单',`msOpenDetail('correction',${mrQuote(active.id)})`,'primary');
 if(r.revoked||mhArchived(r))return btn('返回列表','msHome()');
 if(mrTime(r.coolingUntil)>Date.now())return !r.followUp?btn('撤销合并',`msUndoAsk(${mrQuote(r.id)})`,'danger'):btn('返回列表','msHome()');
 return btn('返回列表','msHome()')+(source?btn('发起纠错',`msNewCorrection(${mrQuote(source.id)})`,'primary'):'');
}
function msUndoAsk(id){const r=state.mergeRecords.find(x=>x.id===id);if(!r)return;apPrompt('撤销这次合并？','<p class="ms-copy">'+esc(r.pair.map(c=>c.name).join(' + '))+'</p>'+msNote('当前仍在冷静期内且没有后续业务，撤销后按保存快照恢复全部参与档案。'),btn('取消','apDismiss()')+btn('确认撤销',`mrUndo(${mrQuote(id)})`,'danger'))}

function msCopyHistory(id){const c=ctHistory(clPlan).find(c=>c.id===id);if(!c)return;for(const key of ['name','phone','gender','birthday','remark'])clPlan.profileDraft[key]=c[key]||'';Object.assign(clPlan.businessPlan,{targetMode:'new',targetEntry:'history',referenceProfileId:id,historyRefs:[id],targetStore:c.store||clPlan.store});ctSyncPhone(clPlan);bpTouch();apDismiss();render()}
function msLeaving(r,id){if(!msIsMobile()||r==='mobile-store')return false;const dirty=ms.view==='merge'&&mrTask?.dirty||ms.view==='correction'&&clHasContent()&&clFingerprint()!==clSavedFingerprint;if(dirty){apPrompt('离开前保存申请？','<p class="ms-copy">当前申请尚未提交，可以保存草稿后继续其他工作。</p>',btn('继续填写','apDismiss()')+btn('放弃修改',`msNavigate('discard',${mrQuote(r)},${mrQuote(id||'')})`)+btn('保存并离开',`msNavigate('save',${mrQuote(r)},${mrQuote(id||'')})`,'primary'));return true}msResetForm();ms.view='list';return false}
function msNavigate(action,r,id){if(action==='save'){msSaveDraft();if(ms.view!=='list')return}else msHome();go(r,id||undefined)}

document.addEventListener('keydown',event=>{if(!msIsMobile()||!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;const button=event.target.closest?.('.ms-tabs>button,.ms-business-tabs>button,.ms-stepbar>button');if(!button)return;event.preventDefault();const buttons=[...button.parentElement.querySelectorAll('button')],i=buttons.indexOf(button),next=buttons[event.key==='Home'?0:event.key==='End'?buttons.length-1:(i+(event.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length],action=next.getAttribute('onclick');next.click();[...document.querySelectorAll('.ms-shell button')].find(b=>b.getAttribute('onclick')===action)?.focus({preventScroll:true})});
