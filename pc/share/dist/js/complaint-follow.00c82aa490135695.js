/* Customer communication records. Workflow stages and confirmed solutions stay separate. */
window.PCModules['complaint-follow']={render(){},create({ACTOR,canAssess,canFollow,markProcessing,recognitionSnapshot,clone,esc,fmt,field,input,select,detail,section,tag,link,btn,empty,events,filesView,draftFiles,solutionRead,level4Type,valueText,planText,valuesFrom,RECOGNITION_FIELDS,solutionDraft,assessmentChoices}){
  const RESULTS={ongoing:'继续沟通',agreed:'客户已同意方案',note:'仅补充记录'};
  const REASONS={unreachable:'联系不上客户',amount:'客户不认可方案金额',method:'客户不接受处理方式',considering:'客户需要考虑，等待回复',internal:'等待内部核实或确认',other:'其他'};
  const OPERATIONS={follow:['记录沟通','记录沟通情况、未达成原因和下次跟进时间'],assessment:['责任认定','明确责任部门、责任人及客诉等级'],compensation:['确认解决方案','填写与客户达成一致的退款或商品置换方案']};
  const isCommunication=f=>f?.kind==='follow'&&['ongoing','agreed'].includes(f.communication?.result);
  const editable=f=>f&&(!f.kind||f.kind==='follow')&&f.actor===ACTOR;
  function draft(r,f){return {note:f?.note||'',files:clone(f?.files||[]),followResult:f?.communication?.result||(f||!canAssess(r)?'note':'ongoing'),unresolvedReason:f?.communication?.reason||'',nextFollowAt:f?.communication?.nextFollowAt||''}}
  function operationDraft(kind,r){return kind==='follow'?draft(r):kind==='assessment'?{...valuesFrom(r,RECOGNITION_FIELDS),handlingPlan:r.handlingPlan||'',handlingFiles:clone(r.handlingFiles||[])}:{customerSolution:solutionDraft(r.customerSolution)}}
  function communication(d){const result=d.followResult??'note';return result==='note'?null:{result,reason:result==='ongoing'?d.unresolvedReason||'':'',nextFollowAt:result==='ongoing'?d.nextFollowAt||'':''}}
  function validate(r,d,old){
    const errors=[],result=d.followResult??'note',value=communication(d),note=String(d.note||'').trim();
    if(!canFollow(r))errors.push(['followResult','请先接单后再跟进']);
    if(!Object.hasOwn(RESULTS,result))errors.push(['followResult','请选择本次跟进结果']);
    if(old){if(!editable(old)||JSON.stringify(value)!==JSON.stringify(old.communication||null))errors.push(['followResult','进展变化请新增跟进记录']);}
    else if(result!=='note'&&!canAssess(r))errors.push(['followResult','当前环节仅可补充跟进记录']);
    if(result==='ongoing'){
      if(!Object.hasOwn(REASONS,d.unresolvedReason||''))errors.push(['unresolvedReason','请选择未达成原因']);
      if(d.unresolvedReason==='other'&&!note)errors.push(['note','请说明未达成方案的具体原因']);
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
  function metadata(f){const c=f.communication;if(!c)return '';return `<div class="uc-recognition-summary"><span>沟通结果：${esc(RESULTS[c.result]||c.result)}</span>${c.reason?`<span>未达成原因：${esc(REASONS[c.reason]||c.reason)}</span>`:''}${c.nextFollowAt?`<span>下次跟进：${esc(fmt(c.nextFollowAt))}</span>`:''}</div>`}
  function overview(r){const f=current(r);if(!f)return '';const c=f.communication;return section('沟通进展',`<div class="uc-details">${detail('当前进展',RESULTS[c.result])}${detail('最近沟通',fmt(f.time))}${c.reason?detail('未达成原因',REASONS[c.reason],true):''}${c.nextFollowAt?detail('下次跟进',fmt(c.nextFollowAt)):''}${detail('跟进人',f.actor)}</div>`,c.result==='agreed'&&canAssess(r)?link('填写解决方案','begin-compensation'):'')}
  function form(r,d,f){const ongoing=d.followResult==='ongoing',controls=!f&&canAssess(r);return `<div id="uc-follow-form" class="ub-form" data-draft="follow" novalidate>${controls?field('followResult','跟进结果',select('followResult',Object.entries(RESULTS),d.followResult,'请选择跟进结果','required aria-required="true"'),true)+field('unresolvedReason','未达成原因',select('unresolvedReason',Object.entries(REASONS),d.unresolvedReason,'请选择主要原因',ongoing?'required aria-required="true"':''),true).replace('data-field="unresolvedReason"','data-field="unresolvedReason"'+(ongoing?'':' hidden'))+field('nextFollowAt','下次跟进',input('nextFollowAt',d.nextFollowAt,'选择时间（选填）','datetime-local')).replace('data-field="nextFollowAt"','data-field="nextFollowAt"'+(ongoing?'':' hidden')):f?.communication?metadata(f):''}${field('note','跟进内容',`<textarea id="uc-note" name="note" class="uc-input uc-follow-note" rows="6" maxlength="2000" show-word-limit placeholder="记录客户反馈、本次沟通和下一步安排">${esc(d.note)}</textarea>`)}${field('followImages','图片',`<div><div class="uc-upload-row">${btn('添加图片','upload-follow','id="uc-followImages"')}<input type="file" id="uc-upload" accept="image/png,image/jpeg" multiple hidden data-upload="follow"><span class="uc-muted">最多 4 张，每张 5MB 以内</span></div><div id="uc-upload-list">${draftFiles(d.files)}</div></div>`)}</div>`}
  function operationChoice(active){return `<div class="ub-form">${field('operation','本次操作',assessmentChoices('operation','本次操作（单选）',Object.entries(OPERATIONS).map(([key,[label]])=>[key,label]),active),false,'',true)}</div>`}
  function resetOperation(e){for(const input of e.layer.el.querySelectorAll('[name=operation]')){input.checked=input.value===e.kind;PCUI.syncControl(input)}}
  function editorFooter(e,totals=''){
    const cancel=btn(e.inline?'返回详情':'取消',e.inline?'cancel-operation':'dismiss'),busy=e.uploading?'disabled':'';
    if(e.kind==='orders')return cancel+btn('保存关联','confirm-orders',e.selection.length===1?'':'disabled',true);
    if(e.kind==='reply')return cancel+btn('保存回复','save-reply',busy,true);
    if(e.kind==='assessment')return cancel+btn(e.draft.handlingPlan==='resolved'?'保存并结案':'保存责任认定','save-assessment',busy,true);
    if(e.kind==='compensation')return totals+cancel+btn('确认方案','save-compensation',busy,true);
    return cancel+btn(e.followId?'保存修改':'保存跟进','save-follow',busy,true);
  }
  function history(r){return r.follows.length?events(r.follows,f=>{
    if(['assessment','handling'].includes(f.kind))return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag(String(f.action||'').includes('修改')?'修改责任认定':'责任认定','blue')}</div><div class="uc-recognition-summary">${[f.department,f.type,f.responsible,f.level,level4Type(f)].map(valueText).filter(Boolean).map(value=>`<span>${esc(value)}</span>`).join('')}</div><div class="uc-event-text">责任原因：${esc(f.reason||'未填写')}</div>${f.handlingPlan?`<div class="uc-event-text">处理结果：${esc(planText(f.handlingPlan))}</div>`:''}${f.customerSolution?`<details class="uc-inline-details"><summary>查看解决方案</summary>${solutionRead(f.customerSolution,r.follows.indexOf(f))}</details>`:''}${filesView(f.handlingFiles||[],'handling-history',r.follows.indexOf(f))}<div class="uc-saved-meta">首次反馈：${esc(f.firstContact||'未填写')} · ${fmt(f.contactTime)}</div>`;
    if(f.kind==='transfer')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong><span>历史门店转派</span></div><div class="uc-event-text">${esc(f.store)} · ${esc(f.toHandler)}<br>转派原因：${esc(f.note)}</div>`;
    if(f.kind==='compensation')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('解决方案','blue')}</div>${solutionRead(f.customerSolution,r.follows.indexOf(f))||'<span class="uc-muted">未选择处理方式</span>'}`;
    if(['accept','start'].includes(f.kind))return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag(f.kind==='accept'?'客服接单':'开始处理','blue')}</div><div class="uc-event-text">${esc(f.note)}</div>`;
    if(f.kind==='reply')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('回复客户','green')}</div>${f.note?`<div class="uc-event-text">${esc(f.note)}</div>`:''}${filesView(f.files||[],'follow',r.follows.indexOf(f))}`;
    if(f.kind==='closure')return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('结案','green')}</div><div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>`;
    return `<div class="uc-event-title"><strong>${esc(f.actor)}</strong>${tag('沟通跟进')}${editable(f)?link('编辑','edit-follow-record',`data-follow="${esc(f.id)}" aria-label="编辑跟进 ${esc(fmt(f.time))}"`):''}</div>${metadata(f)}<div class="uc-event-text">${esc(f.note||'未填写跟进内容')}</div>${filesView(f.files||[],'follow',r.follows.indexOf(f))}${f.updatedAt?`<div class="uc-saved-meta">修改于 ${fmt(f.updatedAt)}</div>`:''}`;
  }):empty('暂无跟进记录')}
  return {RESULTS,REASONS,OPERATIONS,draft,operationDraft,validate,record,edit,current,overview,form,operationChoice,resetOperation,editorFooter,history,editable};
}};
