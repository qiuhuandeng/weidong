/* Customer communication records. Workflow stages and confirmed solutions stay separate. */
window.PCModules['complaint-follow']={render(){},create({ACTOR,canAssess,canFollow,canGrade,handlingOperations,LEVELS,LEVEL4_TYPES,error,clearErrors,markProcessing,recognitionSnapshot,clone,esc,fmt,field,input,select,detail,section,tag,link,btn,empty,events,filesView,draftFiles,solutionRead,level4Type,valueText,planText,valuesFrom,RECOGNITION_FIELDS,solutionDraft,assessmentChoices,dictionary}){
  const RESULTS={agreed:'客户已同意解决方案',ongoing:'未达成一致'};
  const LEGACY_REASONS={unreachable:'联系不上客户',amount:'客户不认可方案金额',method:'客户不接受处理方式',considering:'客户需要考虑，等待回复',internal:'等待内部核实或确认',other:'其他'};
  const OPERATIONS=handlingOperations;
  const isCommunication=f=>f?.kind==='follow'&&['ongoing','agreed'].includes(f.communication?.result);
  const editable=f=>f&&(!f.kind||f.kind==='follow')&&f.actor===ACTOR;
  function draft(r,f){return {note:f?.note||'',files:clone(f?.files||[]),unresolvedReason:f?.communication?.reason||'',reasonSource:f?f.communication?.reasonSource||'':'demands',...(f?{followResult:f.communication?.result||'note'}:!canAssess(r)?{followResult:'note'}:{operation:'unresolved'})}}
  function operationDraft(kind,r){return kind==='follow'?draft(r):kind==='closure'?{note:'',files:[]}:kind==='assessment'?{...valuesFrom(r,RECOGNITION_FIELDS),handlingPlan:r.handlingPlan||'',handlingFiles:clone(r.handlingFiles||[])}:{customerSolution:solutionDraft(r.customerSolution)}}
  function switchOperation(e,kind,r){
    e.operations??={};e.operations[e.kind]={draft:e.draft,baseline:e.baseline};
    const next=e.operations[kind]||{draft:operationDraft(kind,r)};
    e.kind=kind;e.followId=null;e.draft=next.draft;e.baseline=next.baseline??JSON.stringify(next.draft);
  }
  function operationDirty(e){return JSON.stringify(e.draft)!==e.baseline||Object.entries(e.operations||{}).some(([kind,saved])=>kind!==e.kind&&JSON.stringify(saved.draft)!==saved.baseline)}
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
    if(old){if(!editable(old)||JSON.stringify(value)!==JSON.stringify(old.communication||null))errors.push(['unresolvedReason','进展变化请新增跟进记录']);}
    else if(result!=='note'&&!canAssess(r))errors.push(['unresolvedReason','当前环节仅可补充跟进记录']);
    if(result==='ongoing'){
      if(!d.unresolvedReason||!old&&!dictionary.current.demands.includes(d.unresolvedReason))errors.push(['unresolvedReason','请选择配置中的未达成原因']);
      if(!old&&d.unresolvedReason==='其他'&&!note)errors.push(['note','请说明未达成方案的具体原因']);
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
    if(value)entry.communication=value;
    r.follows.unshift(entry);return entry;
  }
  function edit(r,id,d,time){
    const f=r.follows.find(f=>f.id===id);if(!f||validate(r,d,f).length)return null;
    f.revisions??=[];f.revisions.push({time,actor:ACTOR,note:f.note,files:clone(f.files||[]),...(f.communication?{communication:clone(f.communication)}:{})});
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
  function metadata(f){const c=f.communication;if(!c)return '';return `<div class="uc-recognition-summary"><span>沟通结果：${esc(RESULTS[c.result]||c.result)}</span>${c.reason?`<span>未达成原因：${esc(reasonText(c))}</span>`:''}${c.nextFollowAt?`<span>下次跟进：${esc(fmt(c.nextFollowAt))}</span>`:''}</div>`}
  function overview(r){const f=current(r);if(!f)return '';const c=f.communication;return section('沟通进展',`<div class="uc-details">${detail('当前进展',RESULTS[c.result])}${detail('最近沟通',fmt(f.time))}${c.reason?detail('未达成原因',reasonText(c),true):''}${c.nextFollowAt?detail('下次跟进',fmt(c.nextFollowAt)):''}${detail('跟进人',f.actor)}</div>`,c.result==='agreed'&&canAssess(r)?link('填写解决方案','begin-compensation'):'')}
  function form(r,d,f){const controls=!f&&canAssess(r);return `<div id="uc-follow-form" class="ub-form" data-draft="follow" novalidate>${controls?field('unresolvedReason','未达成原因',select('unresolvedReason',dictionary.options('demands',d.unresolvedReason),d.unresolvedReason,'请选择主要原因','required aria-required="true" aria-label="未达成原因"'),true):f?.communication?metadata(f):''}${field('note','沟通内容',`<textarea id="uc-note" name="note" class="uc-input uc-follow-note" rows="6" maxlength="2000" show-word-limit placeholder="记录客户反馈、本次沟通和下一步安排">${esc(d.note)}</textarea>`,false,'',true)}${field('followImages','图片',`<div><div class="uc-upload-row">${btn('添加图片','upload-follow','id="uc-followImages"')}<input type="file" id="uc-upload" accept="image/png,image/jpeg" multiple hidden data-upload="follow"><span class="uc-muted">最多 4 张，每张 5MB 以内</span></div><div id="uc-upload-list">${draftFiles(d.files)}</div></div>`)}</div>`}
  function closureForm(d){return `<div id="uc-closure-form" class="ub-form" data-draft="closure" novalidate><div class="uc-closure-note">确认后工单将进入已结案状态。</div>${field('note','结案说明',`<textarea id="uc-note" name="note" class="uc-input" rows="5" maxlength="1000" placeholder="填写本次处理结果（选填）">${esc(d.note)}</textarea>`,false,'',true)}</div>`}
  function operationChoice(active){return `<div class="uc-operation-choice"><div class="ub-form">${field('operation','本次操作',assessmentChoices('operation','本次操作（单选）',Object.entries(OPERATIONS).map(([key,[label]])=>[key,label]),active),false,'',true)}</div></div>`}
  function resetOperation(e){for(const input of e.layer.el.querySelectorAll('[name=operation]')){input.checked=input.value===e.kind;PCUI.syncControl(input)}}
  function editorFooter(e,totals=''){
    const cancel=btn('取消','dismiss'),busy=e.uploading?'disabled':'';
    if(e.kind==='orders')return cancel+btn('保存关联','confirm-orders',e.selection.length===1?'':'disabled',true);
    if(e.kind==='reply')return cancel+btn('保存回复','save-reply',busy,true);
    if(e.kind==='assessment')return cancel+btn(e.draft.handlingPlan==='resolved'?'保存并结案':'保存责任认定','save-assessment',busy,true);
    if(e.kind==='compensation')return totals+cancel+btn('确认方案','save-compensation',busy,true);
    if(e.kind==='closure')return cancel+btn('确认结案','save-closure',busy,true);
    return cancel+btn(e.followId?'保存修改':'保存跟进','save-follow',busy,true);
  }
  function history(r){return r.follows.length?events(r.follows,f=>{
    if(f.kind==='grading')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('修改客诉等级','blue')}</div><div class="uc-event-text">${esc([f.before?.level,level4Type(f.before||{})].filter(Boolean).join(' · ')||'未填写')} → ${esc([f.level,level4Type(f)].filter(Boolean).join(' · '))}</div>`;
    if(['assessment','handling'].includes(f.kind))return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag(String(f.action||'').includes('修改')?'修改责任认定':'责任认定','blue')}</div><div class="uc-recognition-summary">${[f.department,f.type,f.responsible,f.level,level4Type(f)].map(valueText).filter(Boolean).map(value=>`<span>${esc(value)}</span>`).join('')}</div><div class="uc-event-text">责任原因：${esc(f.reason||'未填写')}</div>${f.handlingPlan?`<div class="uc-event-text">处理结果：${esc(planText(f.handlingPlan))}</div>`:''}${f.customerSolution?`<details class="uc-inline-details"><summary>查看解决方案</summary>${solutionRead(f.customerSolution,r.follows.indexOf(f))}</details>`:''}${filesView(f.handlingFiles||[],'handling-history',r.follows.indexOf(f))}<div class="uc-saved-meta">首次反馈：${esc(f.firstContact||'未填写')} · ${fmt(f.contactTime)}</div>`;
    if(f.kind==='transfer')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong><span>历史门店转派</span></div><div class="uc-event-text">${esc(f.store)} · ${esc(f.toHandler)}<br>转派原因：${esc(f.note)}</div>`;
    if(f.kind==='compensation')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('解决方案','blue')}</div>${solutionRead(f.customerSolution,r.follows.indexOf(f))||'<span class="uc-muted">未选择处理方式</span>'}`;
    if(['accept','start'].includes(f.kind))return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag(f.kind==='accept'?'客服接单':'开始处理','blue')}</div><div class="uc-event-text">${esc(f.note)}</div>`;
    if(f.kind==='reply')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('回复客户','green')}</div>${f.note?`<div class="uc-event-text">${esc(f.note)}</div>`:''}${filesView(f.files||[],'follow',r.follows.indexOf(f))}`;
    if(f.kind==='closure')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('结案','green')}</div><div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>`;
    return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('沟通跟进')}${editable(f)?link('编辑','edit-follow-record',`data-follow="${esc(f.id)}" aria-label="编辑跟进 ${esc(fmt(f.time))}"`):''}</div>${metadata(f)}<div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>${filesView(f.files||[],'follow',r.follows.indexOf(f))}${f.updatedAt?`<div class="uc-saved-meta">修改于 ${fmt(f.updatedAt)}</div>`:''}`;
  }):empty('暂无跟进记录')}
  return {RESULTS,OPERATIONS,draft,operationDraft,switchOperation,operationDirty,gradeValue,gradeErrors,recordGrade,gradeDialog,validate,record,edit,current,overview,form,closureForm,operationChoice,resetOperation,editorFooter,history,editable};
}};
