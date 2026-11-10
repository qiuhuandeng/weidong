/* Customer communication records. Workflow stages and confirmed solutions stay separate. */
window.PCModules['complaint-follow']={render(){},create({ACTOR,canAssess,canFollow,canGrade,hasAssessment,handlingMissing,recordRecognition,recordCompensation,recordClosure,handlingOperations,LEVELS,LEVEL4_TYPES,error,clearErrors,markProcessing,recognitionSnapshot,clone,esc,fmt,field,input,select,detail,section,tag,link,btn,empty,events,filesView,draftFiles,solutionRead,level4Type,valueText,planText,valuesFrom,RECOGNITION_FIELDS,solutionDraft,assessmentChoices,dictionary,assessmentOrders,contactForm,responsibilityForm,assessmentAttachments}){
  const RESULTS={agreed:'客户已确认解决方案',ongoing:'正在沟通解决方案'};
  const LEGACY_REASONS={unreachable:'联系不上客户',amount:'客户不认可方案金额',method:'客户不接受处理方式',considering:'客户需要考虑，等待回复',internal:'等待内部核实或确认',other:'其他'};
  const OPERATIONS=handlingOperations;
  const CLOSED_REASONS=['无需赔付，已解决','客户主动撤回','无法达成方案','联系无果，终止跟进','重复或误建工单','其他'];
  const waitingPayment=value=>/已和客户达成退款金额[，,、]?待付款/.test(value);
  const availableReasons=(value,old)=>dictionary.options('demands',value).filter(([key])=>!waitingPayment(key)||old?.communication?.reason===key);
  const isCommunication=f=>f?.kind==='follow'&&['ongoing','agreed'].includes(f.communication?.result);
  const editable=f=>f&&(!f.kind||f.kind==='follow')&&f.actor===ACTOR;
  function needsInlineAssessment(r,kind){return canAssess(r)&&['compensation','closure'].includes(kind)&&!hasAssessment(r)}
  function inlineAssessmentForm(r,e){
    if(!e||!needsInlineAssessment(r,e.kind))return '';
    if(!e.assessmentDraft){e.assessmentDraft=operationDraft('assessment',r);e.assessmentBaseline=JSON.stringify(e.assessmentDraft)}
    const d=e.assessmentDraft;
    return `<div class="uc-inline-assessment uc-assessment-layout" data-inline-assessment data-draft="assessment">${section('责任认定',assessmentOrders(r,e.assessmentOrdersOpen)+contactForm(d)+responsibilityForm(d)+`<div class="ub-form">${assessmentAttachments(d,true)}</div>`)}</div>`;
  }
  function inlineAssessmentErrors(r,e){return needsInlineAssessment(r,e.kind)?handlingMissing(e.assessmentDraft||{}).filter(([name])=>name!=='handlingPlan'):[]}
  function recordHandlingOutcome(r,e,time,solution){
    if(!['compensation','closure'].includes(e.kind)||inlineAssessmentErrors(r,e).length)return null;
    const next=clone(r);
    if(needsInlineAssessment(next,e.kind)&&!recordRecognition(next,e.assessmentDraft,time,{assessmentOnly:true,handlingPlan:'unresolved'}))return null;
    const entry=e.kind==='compensation'?recordCompensation(next,solution,time):recordClosure(next,time,e.draft.note,canAssess(next)?'no-payout':'',e.draft.closeReason);
    if(!entry)return null;
    Object.keys(r).forEach(key=>{if(!Object.hasOwn(next,key))delete r[key]});Object.assign(r,next);return entry;
  }
  function draft(r,f){return {note:f?.note||'',files:clone(f?.files||[]),unresolvedReason:f?.communication?.reason||'',reasonSource:f?f.communication?.reasonSource||'':'demands',...(f?{followResult:f.communication?.result||'note',nextFollowAt:f.communication?.nextFollowAt||''}:!canAssess(r)?{followResult:'note'}:{operation:'unresolved'})}}
  function operationDraft(kind,r){return kind==='follow'?draft(r):kind==='closure'?{closeReason:'',note:'',files:[]}:kind==='assessment'?{...valuesFrom(r,RECOGNITION_FIELDS),handlingPlan:r.handlingPlan||'',handlingFiles:clone(r.handlingFiles||[])}:{customerSolution:solutionDraft(r.customerSolution)}}
  function switchOperation(e,kind,r){
    e.operations??={};e.operations[e.kind]={draft:e.draft,baseline:e.baseline};
    const next=e.operations[kind]||{draft:operationDraft(kind,r)};
    e.kind=kind;e.followId=null;e.draft=next.draft;e.baseline=next.baseline??JSON.stringify(next.draft);
  }
  function operationDirty(e){return Boolean(e.assessmentDraft&&JSON.stringify(e.assessmentDraft)!==e.assessmentBaseline)||JSON.stringify(e.draft)!==e.baseline||Object.entries(e.operations||{}).some(([kind,saved])=>kind!==e.kind&&JSON.stringify(saved.draft)!==saved.baseline)}
  function gradeValue(d){return {level:d?.level||'',level4Type:level4Type(d||{})}}
  function gradeErrors(d){return !LEVELS.includes(d?.level)?[['level','请选择客诉等级']]:d.level==='4级'&&!level4Type(d)?[['level4Type','请选择风险类型']]:[]}
  function recordGrade(r,d,time){
    if(!canGrade(r)||gradeErrors(d).length)return null;
    const before=gradeValue(r),after=gradeValue(d);if(JSON.stringify(before)===JSON.stringify(after))return null;
    Object.assign(r,after);
    const entry={id:r.id+'-grade-'+Date.now()+'-'+r.follows.length,kind:'grading',action:'修改客诉等级',time,actor:ACTOR,before,...after,beforeStatus:r.status,status:r.status,files:[]};
    r.follows.unshift(entry);return entry;
  }
  function levelFields(d){return field('level','客诉等级',assessmentChoices('level','客诉等级',LEVELS,d.level),true,'',true)+field('level4Type','风险类型',assessmentChoices('level4Type','风险类型',LEVEL4_TYPES,level4Type(d)),true,'',true).replace('data-field="level4Type"','data-field="level4Type"'+(d.level==='4级'?'':' hidden'))}
  function gradeDialog(r,accept,save){
    const d=gradeValue(r);
    PCUI.dialog({title:accept?'客服接单':'修改客诉等级',content:`<div class="uc-scope"><div id="uc-grade-form" class="ub-form">${levelFields(d)}</div></div>`,buttons:[{text:'取消',action:()=>PCUI.closeDialog()},{text:accept?'确认等级并接单':'保存等级',primary:true,action:()=>{
      const form=document.getElementById('uc-grade-form');if(!form)return;
      for(const name of ['level','level4Type'])d[name]=form.querySelector(`input[name="${name}"]:checked`)?.value||'';
      clearErrors(form);const errors=gradeErrors(d);
      if(errors.length){errors.forEach(([name,message])=>error(form,name,message));PCUI.focusControl(form.querySelector(`[name="${errors[0][0]}"]`));return}
      if(save(gradeValue(d)))PCUI.closeDialog();
    }}]});
    requestAnimationFrame(()=>document.getElementById('uc-grade-form')?.addEventListener('change',event=>{
      const form=event.currentTarget,control=event.target;if(!['level','level4Type'].includes(control.name)||!control.checked)return;
      d[control.name]=control.value;clearErrors(form);
      if(control.name==='level'){
        const active=d.level==='4级';form.querySelector('[data-field="level4Type"]').hidden=!active;
        if(!active){d.level4Type='';for(const radio of form.querySelectorAll('[name="level4Type"]')){radio.checked=false;PCUI.syncControl(radio)}}
      }
    }));
  }
  function communication(d){const result=Object.hasOwn(d,'followResult')?d.followResult:d.operation==='unresolved'?'ongoing':'note';return result==='note'?null:{result,reason:result==='ongoing'?d.unresolvedReason||'':'',nextFollowAt:result==='ongoing'?d.nextFollowAt||'':'',...(result==='ongoing'&&d.reasonSource!==''?{reasonSource:'demands'}:{})}}
  function reasonText(c){return c.reasonSource==='demands'?c.reason:LEGACY_REASONS[c.reason]||c.reason}
  function validate(r,d,old){
    const errors=[],result=Object.hasOwn(d,'followResult')?d.followResult:d.operation==='unresolved'?'ongoing':'note',value=communication(d),note=String(d.note||'').trim();
    if(!canFollow(r))errors.push(['unresolvedReason','请先接单后再跟进']);
    if(result!=='note'&&!Object.hasOwn(RESULTS,result))errors.push(['unresolvedReason','当前本次操作不可保存跟进']);
    if(old){if(!editable(old)||result!==(old.communication?.result||'note')||(value?.nextFollowAt||'')!==(old.communication?.nextFollowAt||''))errors.push(['unresolvedReason','进展变化请新增跟进记录']);}
    else if(result!=='note'&&!canAssess(r))errors.push(['unresolvedReason','当前环节仅可补充跟进记录']);
    if(result==='ongoing'){
      const retained=old?.communication?.result==='ongoing'&&d.unresolvedReason===old.communication.reason;
      if(!d.unresolvedReason||!retained&&(!dictionary.current.demands.includes(d.unresolvedReason)||waitingPayment(d.unresolvedReason)))errors.push(['unresolvedReason','请选择配置中的当前处理卡点']);
      if(d.unresolvedReason==='其他'&&!note)errors.push(['note','请在沟通内容中填写当前处理卡点的具体说明']);
      if(d.nextFollowAt){const time=new Date(d.nextFollowAt+':00Z');if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(d.nextFollowAt)||!Number.isFinite(time.getTime())||time.toISOString().slice(0,16)!==d.nextFollowAt)errors.push(['nextFollowAt','请选择有效的下次跟进时间']);}
    }
    if(result==='note'&&!note&&!d.files?.length)errors.push(['note','请填写跟进内容或添加图片']);
    if(note.length>2000)errors.push(['note','跟进内容不能超过 2000 字']);
    return errors;
  }
  function record(r,d,time){
    if(validate(r,d).length)return null;
    const beforeStatus=r.status,value=communication(d);
    if(value)markProcessing(r,time);
    const entry={id:r.id+'-'+Date.now()+'-'+r.follows.length,kind:'follow',time,actor:ACTOR,note:String(d.note||'').trim(),files:clone(d.files||[]),beforeStatus,status:r.status,...recognitionSnapshot(r)};
    if(value){entry.communication=value;if(value.result==='ongoing')value.periodId=startPeriod(r,value.reason,time,entry.id);else stopPeriod(r,time,'客户已同意解决方案')}
    r.follows.unshift(entry);return entry;
  }
  function activePeriod(r){return (r.communicationPeriods||[]).find(period=>!period.endedAt)}
  function stopPeriod(r,time,result){
    const period=activePeriod(r);if(!period)return;
    period.endedAt=time;period.endReason=result;
  }
  function startPeriod(r,reason,time,id){
    const active=activePeriod(r);if(active?.reason===reason)return active.id;
    stopPeriod(r,time,'未达成原因变更');
    const config=dictionary.current,{timing,source}=dictionary.resolveTiming(config,reason,r.level);
    // Business timestamps are China local wall time; adding elapsed hours here
    // keeps the persisted minute format and makes one day exactly 24 hours.
    const dueAt=timing?new Date(Date.parse(time.replace(' ','T').slice(0,16)+':00Z')+timing.value*(timing.unit==='days'?86400000:3600000)).toISOString().slice(0,16).replace('T',' '):'';
    const period={id,reason,level:r.level,startedAt:time,dueAt,timing,timingSource:source,configRevision:config.revision??0,endedAt:'',endReason:''};
    (r.communicationPeriods??=[]).push(period);return id;
  }
  function startAcceptedPeriod(r,entry){
    const reason=r.customerDemand||'';
    if(dictionary.timingFor(dictionary.current,reason,r.level))entry.timingPeriodId=startPeriod(r,reason,entry.time,entry.id);
  }
  function periodFields(r,f){
    const period=(r.communicationPeriods||[]).find(item=>item.id===(f?.communication?.periodId||f?.timingPeriodId));
    if(!period)return [];
    return [['处理时效',dictionary.timingText(period.timing)+(period.level?'（按 '+period.level+'）':'')],['本轮开始',fmt(period.startedAt)],...(period.dueAt?[['处理截止',fmt(period.dueAt)]]:[]),...(period.endedAt?[['本轮结束',fmt(period.endedAt)+' · '+period.endReason]]:[])];
  }
  function edit(r,id,d,time){
    const f=r.follows.find(f=>f.id===id);if(!f||validate(r,d,f).length)return null;
    f.revisions??=[];f.revisions.push({time,actor:ACTOR,note:f.note,files:clone(f.files||[]),...(f.communication?{communication:clone(f.communication)}:{})});
    if(f.communication?.result==='ongoing'&&f.communication.reason!==d.unresolvedReason){f.communication.reason=d.unresolvedReason;f.communication.reasonSource='demands'}
    f.note=String(d.note||'').trim();f.files=clone(d.files||[]);f.updatedAt=time;f.updatedBy=ACTOR;return f;
  }
  // Records are newest first. Notes and edits do not replace the last actual
  // communication result; confirming a solution ends the preceding blocker.
  function current(r){
    if(r.status==='已结案')return null;
    for(const f of r.follows||[]){
      if(['compensation','closure'].includes(f.kind))return null;
      if(isCommunication(f))return r.compensatedAt&&r.compensatedAt>=f.time?null:f;
    }
    return null;
  }
  function progressText(r){const follow=current(r);if(!follow)return '';return follow.communication.result==='ongoing'?reasonText(follow.communication):'客户已同意解决方案，待确认具体方案';}
  function metadata(f,r){const c=f.communication;if(!c)return '';return `<div class="uc-recognition-summary"><span>沟通结果：${esc(RESULTS[c.result]||c.result)}</span>${c.reason?`<span>客户主要诉求卡点：${esc(reasonText(c))}</span>`:''}${c.nextFollowAt?`<span>下次跟进：${esc(fmt(c.nextFollowAt))}</span>`:''}${periodFields(r,f).map(([label,value])=>`<span>${esc(label)}：${esc(value)}</span>`).join('')}</div>`}
  function overview(r){const f=current(r);if(!f)return '';const c=f.communication;return section('沟通进展',`<div class="uc-details">${detail('当前进展',RESULTS[c.result])}${detail('最近沟通',fmt(f.time))}${c.reason?detail('客户主要诉求卡点',reasonText(c),true):''}${c.nextFollowAt?detail('下次跟进',fmt(c.nextFollowAt)):''}${detail('跟进人',f.actor)}${periodFields(r,f).map(([label,value])=>detail(label,value)).join('')}</div>`,c.result==='agreed'&&canAssess(r)?link('填写解决方案','begin-compensation'):'')}
  function form(r,d,f){const controls=f?f.communication?.result==='ongoing':canAssess(r),reasons=controls?availableReasons(d.unresolvedReason,f).map(([value,label])=>[value,f?.communication?.reasonSource!=='demands'&&LEGACY_REASONS[value]&&value===f?.communication?.reason?reasonText(f.communication):label]):[];return `<div id="uc-follow-form" class="ub-form" data-draft="follow" novalidate>${controls?field('unresolvedReason','当前处理卡点',select('unresolvedReason',reasons,d.unresolvedReason,'请选择当前处理卡点','required aria-required="true" aria-label="当前处理卡点"'),true):f?.communication?metadata(f,r):''}${field('note','沟通内容',`<textarea id="uc-note" name="note" class="uc-input uc-follow-note" rows="6" maxlength="2000" show-word-limit placeholder="记录本次联系情况、客户反馈及下一步安排">${esc(d.note)}</textarea>`,false,'',true)}${field('followImages','图片',`<div><div class="uc-upload-row">${btn('添加图片','upload-follow','id="uc-followImages"')}<input type="file" id="uc-upload" accept="image/png,image/jpeg" multiple hidden data-upload="follow"><span class="uc-muted">最多 4 张，每张 5MB 以内</span></div><div id="uc-upload-list">${draftFiles(d.files)}</div></div>`)}</div>`}
  function closureForm(d,requireReason=true){return `<div id="uc-closure-form" class="ub-form" data-draft="closure" novalidate>${requireReason?field('closeReason','结案原因',select('closeReason',CLOSED_REASONS,d.closeReason,'请选择结案原因','required aria-required="true" aria-label="结案原因"'),true,'',true):''}${field('note','结案说明',`<textarea id="uc-note" name="note" class="uc-input" rows="5" maxlength="1000" placeholder="填写本次处理结果（选填）">${esc(d.note)}</textarea>`,false,'',true)}</div>`}
  function operationChoice(active,operations=OPERATIONS){return `<div class="uc-operation-choice"><div class="ub-form">${field('operation','本次跟进结果',assessmentChoices('operation','本次跟进结果（单选）',Object.entries(operations).map(([key,[label]])=>[key,label]),active),false,'',true)}</div></div>`}
  function resetOperation(e){for(const input of e.layer.el.querySelectorAll('[name=operation]')){input.checked=input.value===e.kind;PCUI.syncControl(input)}}
  function editorFooter(e,totals=''){
    const cancel=btn('取消','dismiss'),busy=e.uploading?'disabled':'';
    if(e.kind==='orders')return (e.exampleRecord?btn('返回当前工单','return-order-example'):cancel)+btn('确定','confirm-orders',e.orderCustomerId&&e.selection.length===1?'':'disabled',true);
    if(e.kind==='reply')return cancel+btn('保存回复','save-reply',busy,true);
    if(e.kind==='assessment')return cancel+btn(!e.assessmentOnly&&e.draft.handlingPlan==='resolved'?'保存并结案':'保存责任认定','save-assessment',busy,true);
    if(e.kind==='compensation')return totals+cancel+btn(e.submitLabel||'确认方案并提交','save-compensation',busy,true);
    if(e.kind==='closure')return cancel+btn('确认结案','save-closure',busy,true);
    return cancel+btn(e.followId?'保存修改':'保存跟进','save-follow',busy,true);
  }
  // Project business outcomes without deleting the original operation history.
  // Keep source indices so filtered/sorted records still open the right attachment.
  function historyRecords(r,executionResults=[]){
    const follows=r.follows||[],records=[],closed=status=>['已结案','已完成'].includes(status);
    const time=value=>String(value||'').replace('T',' '),fieldValue=(f,label)=>(f.fields||[]).find(([name])=>name===label)?.[1];
    const append=(f,historyKind,index,extra={})=>records.push({...f,historyKind,historyIndex:index,...extra});
    for(const [index,f]of follows.entries()){
      if(!f.kind||f.kind==='follow')append(f,'communication',index);
      else if(f.kind==='reply')append(f,'reply',index);
      else if(f.kind==='compensation')append(f,'solution',index);
      else if(f.kind==='closure')append(f,'closure',index);
      else if(['assessment','handling'].includes(f.kind)){
        if(!String(f.action||'').includes('责任认定')&&f.customerSolution&&JSON.stringify(f.customerSolution)!==JSON.stringify(f.before?.customerSolution)&&!follows.some(item=>item.kind==='compensation'&&time(item.time)===time(f.time)&&JSON.stringify(item.customerSolution)===JSON.stringify(f.customerSolution)))append(f,'solution',index);
        if(f.handlingPlan==='resolved'&&closed(f.status)&&!closed(f.beforeStatus)&&!follows.some(item=>item.kind==='closure')&&!records.some(item=>item.historyKind==='closure'))append(f,'closure',index,{note:f.closeNote||(time(f.time)===time(r.closedAt)?r.closeNote:'')||'',fileKind:'handling-history',files:f.handlingFiles||[]});
      }else if(f.kind==='workflow'){
        if(f.action==='客服复核'&&(f.reviewInfo||fieldValue(f,'客户反馈')||fieldValue(f,'复核结果')&&!/^(待|正在)/.test(fieldValue(f,'复核结果'))))append(f,'review',index);
        else if(f.action==='财务付款'&&fieldValue(f,'付款结果')&&!/^(待|等待|处理中|付款中)/.test(fieldValue(f,'付款结果')))append(f,'payment',index);
        else if(f.action==='采购发货'&&(fieldValue(f,'物流单号')||fieldValue(f,'交付单据号')))append(f,'shipment',index);
      }
    }
    if(r.customerSolution&&r.compensatedAt&&!records.some(item=>item.historyKind==='solution'))append({customerSolution:r.customerSolution,time:r.compensatedAt,actor:r.compensatedBy},'solution','');
    for(const f of executionResults){
      if(!f.historyKind||f.historyKind==='attribution')continue;
      if(f.mock&&['solution','communication'].includes(f.historyKind)&&records.some(item=>item.historyKind==='solution'||item.historyKind==='communication'&&item.communication))continue;
      if(f.mock&&f.historyKind==='closure'&&records.some(item=>item.historyKind==='closure'))continue;
      if(f.mock&&f.historyKind==='review'&&records.some(item=>item.historyKind==='review'))continue;
      const duplicate=records.findIndex(item=>item.historyKind===f.historyKind&&time(f.time)&&time(item.time)===time(f.time)&&(
        f.historyKind==='closure'||
        f.sourceId&&f.sourceId===(item.id||item.sourceId)&&JSON.stringify(f.fields)===JSON.stringify(item.fields)||
        item.kind==='workflow'&&['交易流水号','物流单号','交付单据号'].some(label=>fieldValue(f,label)&&fieldValue(f,label)===fieldValue(item,label))&&fieldValue(f,'付款结果')===fieldValue(item,'付款结果')&&fieldValue(f,'发货内容')===fieldValue(item,'发货内容')
      ));
      if(duplicate<0)append(f,f.historyKind,-1);
      else if(records[duplicate].kind==='workflow')records[duplicate]={...f,historyIndex:-1};
    }
    if(closed(r.status)&&r.closedAt&&!records.some(item=>item.historyKind==='closure'))append({time:r.closedAt,actor:r.closedBy,note:r.closeNote||'',files:[]},'closure',-1);
    return records.sort((a,b)=>time(b.time).localeCompare(time(a.time)));
  }
  function history(r,executionResults=[]){
    const records=historyRecords(r,executionResults),labels={communication:'沟通跟进',reply:'回复客户',solution:'客户已确认解决方案',payment:'财务付款',shipment:'采购发货',review:'客服复核',closure:'结案'};
    const body=(fields,attachments='')=>`<div class="uc-follow-body">${fields.length?`<div class="uc-details">${fields.map(([label,value,full])=>detail(label,value,full)).join('')}</div>`:''}${attachments}</div>`;
    return records.length?events(records,f=>{
      const index=f.historyIndex,result=f.communication?.result;
      const title=f.historyKind==='communication'?(result==='ongoing'?'正在沟通解决方案':result==='agreed'?'客户已确认解决方案':'沟通跟进'):f.historyKind==='closure'&&f.closureType==='early'?'提前结案':f.historyKind==='closure'&&f.closureType==='no-payout'?'直接结案':labels[f.historyKind];
      const edit=f.historyKind==='communication'&&f.kind!=='execution-result'&&editable(f)?link('编辑','edit-follow-record',`data-follow="${esc(f.id)}" aria-label="编辑跟进 ${esc(fmt(f.time))}"`):'';
      const heading=`<div class="uc-event-title"><strong>${esc(f.actor||'未记录')}</strong>${tag(title,['reply','closure'].includes(f.historyKind)?'green':'blue')}${edit?`<span class="uc-event-actions">${edit}</span>`:''}</div>`;
      if(f.kind==='execution-result')return heading+body(f.fields,filesView(f.files||[],f.fileKind,f.fileIndex));
      if(f.historyKind==='solution')return heading+`<div class="uc-follow-body">${solutionRead(f.customerSolution,index,f.kind==='compensation'&&f.note?[['方案说明',f.note,true]]:[])}</div>`;
      if(f.historyKind==='closure')return heading+body([...(f.closeReason?[['结案原因',f.closeReason,true]]:[]),['结案说明',f.note||'未填写结案说明',true]],filesView(f.files||[],f.fileKind||'follow',index));
      if(f.historyKind==='reply')return heading+body(f.note?[['回复内容',f.note,true]]:[],filesView(f.files||[],'follow',index));
      if(['review','payment','shipment'].includes(f.historyKind))return heading+body([...(f.fields||[]),...(f.note?[[{review:'复核说明',payment:'付款说明',shipment:'发货说明'}[f.historyKind],f.note,true]]:[])],filesView(f.files||[],'follow',index));
      const c=f.communication,fields=c?[['沟通结果',RESULTS[c.result]||c.result],...(c.reason?[['客户主要诉求卡点',reasonText(c),true]]:[]),...(c.nextFollowAt?[['下次跟进',fmt(c.nextFollowAt)]]:[]),...periodFields(r,f)]:[];
      fields.push(['沟通内容',f.note||'未填写沟通内容',true]);
      if(f.updatedAt)fields.push(['修改时间',fmt(f.updatedAt)]);
      return heading+body(fields,filesView(f.files||[],'follow',index));
    }):empty('暂无跟进记录');
  }
  return {RESULTS,OPERATIONS,CLOSED_REASONS,needsInlineAssessment,inlineAssessmentForm,inlineAssessmentErrors,recordHandlingOutcome,availableReasons,draft,operationDraft,switchOperation,operationDirty,gradeValue,gradeErrors,recordGrade,gradeDialog,validate,record,edit,current,progressText,activePeriod,stopPeriod,startAcceptedPeriod,overview,form,closureForm,operationChoice,resetOperation,editorFooter,historyRecords,history,editable};
},createReview({ACTOR,getRecords,getRoot,getMain,clone,esc,opt,btn,fmt,now,persist,renderList,renderDetail,toast}){
  const REVIEW_TYPES=['置换商品','超额赔偿','其他'],reviewDrafts=new Map();
  const needsReviewInfo=r=>r.status==='客服复核中'&&r.customerSolution?.handlingMethods?.includes('other');
  function reviewForm(r,context='list'){
    if(!needsReviewInfo(r))return '';
    const d=reviewDrafts.get(r.id)||r.reviewInfo||{},prefix='uc-review-'+context+'-'+r.id;
    return `<div class="uc-review-form pc-form pc-form-single" data-review-id="${esc(r.id)}">
      <div class="pc-form-item"><label class="pc-form-label" for="${prefix}-type">复核类型：</label><div class="pc-field-content"><select id="${prefix}-type" name="reviewType" aria-label="复核类型" data-review-field="type">${opt(REVIEW_TYPES,d.type,'请选择')}</select></div></div>
      <div class="pc-form-item"><label class="pc-form-label" for="${prefix}-note">复核说明：</label><div class="pc-field-content"><input id="${prefix}-note" name="reviewNote" value="${esc(d.note||'')}" maxlength="1000" placeholder="填写复核说明（选填）" aria-label="复核说明" data-review-field="note"></div></div>
      <div class="uc-actions">${btn('保存复核','save-review',`data-id="${esc(r.id)}"`)}</div>
      ${r.reviewInfo?`<div class="uc-muted uc-review-saved">${esc(r.reviewInfo.actor)} · ${esc(fmt(r.reviewInfo.time))}</div>`:''}
    </div>`;
  }
  function syncReview(el){
    const scope=el.closest('[data-review-id]');if(!scope||!el.dataset.reviewField)return false;
    const r=getRecords().find(r=>r.id===scope.dataset.reviewId);if(!r||!needsReviewInfo(r))return true;
    const d=reviewDrafts.get(r.id)||{type:r.reviewInfo?.type||'',note:r.reviewInfo?.note||''};d[el.dataset.reviewField]=el.value;reviewDrafts.set(r.id,d);
    for(const surface of [getRoot(),getMain()?.layer?.el].filter(Boolean))for(const control of surface.querySelectorAll('[data-review-id="'+r.id+'"] [data-review-field="'+el.dataset.reviewField+'"]'))if(control!==el){control.value=el.value;PCUI.syncControl(control)}
    return true;
  }
  function saveReview(id){
    const existing=getRecords().find(r=>r.id===id);if(!existing||!needsReviewInfo(existing))return;
    const d=reviewDrafts.get(id)||existing.reviewInfo||{};
    if(!REVIEW_TYPES.includes(d.type)){toast('请选择复核类型');return}
    const next=clone(getRecords()),r=next.find(item=>item.id===id),time=now();
    r.reviewInfo={type:d.type,note:String(d.note||'').trim(),actor:ACTOR,time};
    const node=r.execution?.steps?.[r.execution.index];
    r.follows.unshift({id:id+'-review-info-'+Date.now(),kind:'workflow',action:'客服复核',reviewInfo:true,time,actor:ACTOR,beforeStatus:r.status,status:r.status,...(node?.kind==='close'?{nodeId:node.id}:{}),fields:[['复核类型',r.reviewInfo.type],['复核说明',r.reviewInfo.note||'未填写']],files:[]});
    r.logs.unshift({time,actor:ACTOR,action:'保存复核信息',text:JSON.stringify(r.reviewInfo)});
    if(!persist(next))return;
    reviewDrafts.delete(id);renderList();if(getMain()?.record.id===id){getMain().record=r;renderDetail()}toast('复核信息已保存，工单保持客服复核中');
  }
  return {reviewForm,syncReview,saveReview,needsReviewInfo};
}};
