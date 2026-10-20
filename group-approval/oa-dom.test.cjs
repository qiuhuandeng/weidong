'use strict';
// DOM integration tests, without controlling or launching a browser.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {JSDOM}=require('jsdom');
const files=['timing','form-model','engine','seed','app','configuration','oa-designer','oa-runtime','management'];
const tick=()=>new Promise(resolve=>setTimeout(resolve,15));
async function fixture(t,route='rule/seal/form',storage){
  const dom=new JSDOM('<!doctype html><div id="application"></div><div id="modal-root"></div><div id="toast"></div>',{url:'http://localhost/group-approval/index.html#'+route,runScripts:'outside-only',pretendToBeVisual:true});
  const w=dom.window,d=w.document;
  w.matchMedia=()=>({matches:false,addEventListener(){}});
  w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};
  if(storage)w.localStorage.setItem('meiye.group-approval.prototype.v1',storage);
  for(const file of files)w.eval(fs.readFileSync(path.join(__dirname,file+'.js'),'utf8'));
  w.GA.boot();await tick();
  t.after(()=>w.close());
  const A=w.GA;
  const act=async(name,data={})=>{await A.actions[name]({dataset:data});await tick();};
  const set=(name,value,scope=d)=>{const matches=[...scope.querySelectorAll('[name]')].filter(el=>el.name===name),el=matches[0]?.type==='radio'?matches.find(el=>el.value===String(value)):matches[0];assert(el,'missing input '+name);el.focus();if(el.type==='checkbox')el.checked=value;else if(el.type==='radio')el.checked=true;else el.value=value;el.dispatchEvent(new w.Event('input',{bubbles:true}));el.dispatchEvent(new w.Event('change',{bubbles:true}));return el;};
  const save=async()=>{assert(A.modal?.onSave);await A.modal.onSave(d.querySelector('#modal-form'));await tick();};
  return {w,d,A,act,set,save,go:async route=>{A.go(route);await tick();}};
}

test('all 24 controls open editable properties and retain edits across selection',async t=>{
  const {A,d,act,set}=await fixture(t);
  assert.equal(Object.keys(A.E.TYPES).length,24);
  for(const type of Object.keys(A.E.TYPES)){
    await act('field-new',{type});
    const f=A.config.editor.draft.fields.at(-1),title='验收 '+A.E.TYPES[type];
    assert(d.querySelector('#oa-field-properties'),'properties for '+type);
    set('label',title,d.querySelector('#oa-field-properties'));
    set('print',false,d.querySelector('#oa-field-properties'));
    assert.equal(f.label,title);assert.equal(f.print,false);
    assert(d.querySelector('.oa-field.selected .oa-field-title').textContent.includes(title));
    await act('oa-select',{id:A.config.editor.draft.fields[0].id});
    await act('oa-select',{id:f.id});
    assert.equal(d.querySelector('#oa-field-properties [name=label]').value,title);
  }
});

test('undo/redo edits work immediately and discarded editor history does not leak',async t=>{
  const {A,d,act,set,go}=await fixture(t);
  const original=A.config.editor.draft.fields[0].label;
  assert(d.querySelector('[data-action=oa-undo]').disabled);
  set('label','临时标题',d.querySelector('#oa-field-properties'));
  assert(!d.querySelector('[data-action=oa-undo]').disabled);
  await act('oa-undo');assert.equal(A.config.editor.draft.fields[0].label,original);
  await act('oa-redo');assert.equal(A.config.editor.draft.fields[0].label,'临时标题');
  await act('editor-discard');await go('rule/seal/form');
  assert.equal(A.config.editor.draft.fields[0].label,original);
  assert(d.querySelector('[data-action=oa-undo]').disabled);
});

test('dropping a field on itself preserves order; copy has an independent ID',async t=>{
  const {A,w,d,act}=await fixture(t);
  const before=A.config.editor.draft.fields.map(f=>f.id).join(',');
  const card=d.querySelector('.oa-field');
  const start=new w.Event('dragstart',{bubbles:true});start.dataTransfer={setData(){}};
  card.dispatchEvent(start);card.dispatchEvent(new w.Event('drop',{bubbles:true,cancelable:true}));
  assert.equal(A.config.editor.draft.fields.map(f=>f.id).join(','),before);
  await act('oa-copy-field',{id:A.config.editor.draft.fields[0].id});
  assert.notEqual(A.config.editor.draft.fields.at(-1).id,A.config.editor.draft.fields[0].id);
  await act('oa-undo');assert.equal(A.config.editor.draft.fields.map(f=>f.id).join(','),before);
});

test('node source changes, field permissions, opinions and timing persist across tabs',async t=>{
  const {A,d,act,set,save}=await fixture(t,'rule/seal/flow');
  const n=A.config.editor.draft.flow[0],field=A.config.editor.draft.fields.find(f=>f.type==='text');
  await act('node-edit',{id:n.id});
  for(const source of Object.keys(A.E.SOURCE)){set('source',source);assert.equal(d.querySelector('[name=source]:checked').value,source);}
  set('source','selfSelect');set('selectMultiple',false);
  d.querySelector('[name=selectPeople][value=finance]').checked=true;
  await act('oa-node-tab',{tab:'permissions'});
  d.querySelector(`[name="permission:${field.id}"][value=edit]`).checked=true;
  await act('oa-node-tab',{tab:'advanced'});
  set('allowTransfer',false);set('opinionRequired',true);set('opinionTemplatesEnabled',true);set('template:approve','资料已核验');set('template:reject','请补充说明');
  set('node-duration','36');await save();
  assert.equal(n.source,'selfSelect');assert.equal(n.selectMultiple,false);assert.deepEqual([...n.selectPeople],['finance']);
  assert.equal(n.fieldPermissions[field.id],'edit');assert.equal(n.allowTransfer,false);assert.equal(n.opinionRequired,true);
  assert.equal(n.timing.hours,36);assert.deepEqual([...n.opinionTemplatesByAction.approve],['资料已核验']);assert.deepEqual([...n.opinionTemplatesByAction.reject],['请补充说明']);
});

test('advanced permissions, summary and process settings survive save and a fresh document',async t=>{
  const {A,w,act,set,save}=await fixture(t,'rule/seal/settings');
  set('withdrawDays','7');set('opinionRequired',true);
  await act('oa-advanced-tab',{tab:'permissions'});await act('oa-permission-add');
  const id=A.config.editor.draft.settings.permissions[0].id;
  set('permissionName:'+id,'审计组');set('permissionMembers:'+id,true);set('permissionScope:'+id,'group');set('permissionExport:'+id,true);
  await act('oa-advanced-tab',{tab:'summary'});set('titleMode','auto');set('titlePattern','{发起人}的{表单名称}');await act('oa-summary-edit');set('summaryFields',true);await save();
  await act('editor-save');
  const fresh=await fixture(t,'rule/seal/settings',w.localStorage.getItem(A.KEY));
  const s=fresh.A.config.editor.draft.settings;
  assert.equal(s.permissions[0].name,'审计组');assert(s.permissions[0].members.length);assert.equal(s.permissions[0].export,true);
  assert.equal(s.withdrawDays,7);assert.equal(s.opinionRequired,true);assert.equal(s.titleMode,'auto');assert.equal(s.titlePattern,'{发起人}的{表单名称}');assert(s.summaryFields.length);
});

test('summary picker cancels cleanly, caps five fields and saves the chosen order',async t=>{
  const {A,d,act,set,save}=await fixture(t,'rule/seal/settings');
  const draft=A.config.editor.draft;
  draft.fields=Array.from({length:7},(_,i)=>({id:'f'+i,type:'text',label:'字段'+i,required:i===6}));
  draft.settings.summaryMode='default';draft.settings.summaryFields=[];
  await act('oa-advanced-tab',{tab:'summary'});await act('oa-summary-edit');
  set('summaryFields',true);A.close();assert.equal(draft.settings.summaryFields.length,0);
  await act('oa-summary-edit');
  for(let i=0;i<5;i++)set('summaryFields',true,d.querySelector('[value="f'+i+'"]').parentElement);
  assert(d.querySelector('[value=f5]').disabled);
  await act('oa-summary-move',{index:'0',delta:'1'});await save();
  assert.deepEqual([...draft.settings.summaryFields],['f1','f0','f2','f3','f4']);
  const r={applicant:A.actor,values:Object.fromEntries(draft.fields.map(f=>[f.id,'值'+f.id])),snapshot:A.E.clone(draft),steps:[]};
  assert(A.summary(r).indexOf('字段1')<A.summary(r).indexOf('字段0'));
  assert(!A.summary(r).includes('字段5'));
  r.snapshot.settings.summaryMode='default';assert(A.summary(r).indexOf('字段6')<A.summary(r).indexOf('字段0'));
});

test('permission export requires view and member search preserves hidden selections',async t=>{
  const {A,d,w,act,set}=await fixture(t,'rule/seal/settings');
  await act('oa-advanced-tab',{tab:'permissions'});await act('oa-permission-add');
  const id=A.config.editor.draft.settings.permissions[0].id;
  set('permissionView:'+id,false);set('permissionExport:'+id,true);
  assert(d.querySelector('[name="permissionView:'+id+'"]').checked);
  set('permissionView:'+id,false);assert(!d.querySelector('[name="permissionExport:'+id+'"]').checked);
  const picker=d.querySelector('[data-member-picker]');
  set('permissionMembers:'+id,true,picker);
  const search=picker.querySelector('[data-member-search]');search.value='不存在的人员';search.dispatchEvent(new w.Event('input',{bubbles:true}));
  assert([...picker.querySelectorAll('.ga-checkboxes label')].every(el=>el.hidden));
  assert.equal(picker.querySelectorAll('input[type=checkbox]:checked').length,1);
  assert.equal(A.config.editor.draft.settings.permissions[0].members.length,1);
});

test('node cancellation is isolated and bulk edit leaves protected fields read-only',async t=>{
  const {A,d,act,set,save}=await fixture(t,'rule/seal/flow');
  const draft=A.config.editor.draft,n=draft.flow[0],before=JSON.stringify(n);
  draft.fields.push({id:'protected',type:'serial',label:'编号'});
  await act('node-edit',{id:n.id});set('source','formPerson');set('approvalType','approve');
  await save();assert.equal(n.approvalType,'approve');
  for(const key of Object.keys(n))delete n[key];Object.assign(n,JSON.parse(before));
  await act('node-edit',{id:n.id});set('title','临时节点');await act('oa-node-tab',{tab:'advanced'});
  set('opinionTemplatesEnabled',true);set('template:approve','临时意见');A.close();assert.equal(JSON.stringify(n),before);
  await act('node-edit',{id:n.id});await act('oa-node-tab',{tab:'permissions'});await act('oa-permission-all',{mode:'edit'});
  assert(d.querySelector('[name="permission:protected"][value=read]').checked);
  assert(d.querySelector('[name="permission:protected"][value=edit]').disabled);
  assert.equal(d.querySelector('[name=permissionAll]:checked'),null);
  await act('oa-permission-all',{mode:'read'});assert(d.querySelector('[name=permissionAll][value=read]').checked);
  set('permission:protected','hidden');assert.equal(d.querySelector('[name=permissionAll]:checked'),null);
  A.close();
  const cc=A.E.newNode('cc');draft.flow.push(cc);await act('node-edit',{id:cc.id});await act('oa-node-tab',{tab:'permissions'});
  assert([...d.querySelectorAll('input[value=edit]')].every(el=>el.disabled));
});

test('removed configuration pages have no entry points and old routes resolve to basic settings',async t=>{
  const {A,d,w,act,go}=await fixture(t,'rule/seal/timing');
  assert.equal(w.location.hash,'#rule/seal/basic');assert(d.querySelector('#rule-basic'));
  assert.deepEqual([...d.querySelectorAll('[data-action=rule-tab]')].map(b=>b.dataset.tab),['basic','form','flow','settings']);
  await go('rule/seal/versions');assert.equal(w.location.hash,'#rule/seal/basic');
  await go('rule/seal/settings');
  assert.deepEqual([...d.querySelectorAll('[data-action=oa-advanced-tab]')].map(b=>b.dataset.tab),['process','summary','permissions']);
  for(const tab of ['ai','reminders','print']){
    await act('oa-advanced-tab',{tab});assert(d.querySelector('[name=withdrawDays]'));
    assert(!d.querySelector('[name=reminderMarker],[name=printTitle]'));
  }
  for(const action of ['version-view','version-restore','timing-node-edit','oa-reminder-add','oa-reminder-remove','oa-print-preview'])assert.equal(A.actions[action],undefined);
  await go('rules');await act('oa-form-more',{id:'seal'});
  assert(!d.querySelector('#modal-root [data-to$="/timing"]'));
});

test('preview updates computed fields, visibility and cascading choices without submitting',async t=>{
  const {A,d,act,set}=await fixture(t);
  A.config.editor.draft.fields=[{id:'kind',type:'select',label:'类型',options:['免费','收费'],defaultValue:'免费'},{id:'price',type:'money',label:'价格',showWhen:{field:'kind',value:'收费'}},{id:'total',type:'formula',label:'合计',expression:'{price} * 2'},{id:'category',type:'cascade',label:'分类',options:['办公 / 纸张','办公 / 设备','门店 / 床品']}];
  A.render();const count=A.state.requests.length;await act('oa-preview');
  assert(d.querySelector('[data-field-wrap=price]').hidden);
  set('f:kind','收费');set('f:price','12.5');assert.equal(d.querySelector('[data-formula=total]').textContent,'25');
  const cascade=(level,value)=>{const el=d.querySelector(`[data-cascade=category][data-level="${level}"]`);el.value=value;el.dispatchEvent(new d.defaultView.Event('change',{bubbles:true}));};
  cascade(0,'办公');cascade(1,'设备');assert.equal(d.querySelector('[name="f:category"]').value,'办公 / 设备');
  cascade(0,'门店');assert.equal(d.querySelector('[name="f:category"]').value,'');assert.equal(d.querySelector('[data-cascade][data-level="1"]').options[1].value,'床品');
  set('f:kind','免费');assert(d.querySelector('[data-field-wrap=price]').hidden);assert.equal(d.querySelector('[data-formula=total]').textContent,'0');
  assert.equal(A.state.requests.length,count);
});

test('publishing a configured form freezes advanced settings and creates a new version',async t=>{
  const {A,act,set,save}=await fixture(t,'rule/seal/settings');
  const oldVersion=A.state.templates.find(t=>t.id==='seal').version;
  await act('oa-advanced-tab',{tab:'summary'});set('titleMode','auto');set('titlePattern','{发起人}的{表单名称}');
  await act('editor-publish');await save();
  const template=A.state.templates.find(t=>t.id==='seal');
  assert.equal(template.version,oldVersion+1);assert.equal(template.published.settings.titleMode,'auto');
  template.draft.settings.titleMode='manual';assert.equal(template.published.settings.titleMode,'auto');
});

test('automatic-title application is usable without a title input',async t=>{
  const f=await fixture(t,'rules');const {A,d,go}=f;
  await A.mutate(s=>{const t=s.templates.find(t=>t.id==='seal');t.published.settings.titleMode='auto';});
  await go('apply/seal');assert(d.querySelector('#apply-form'));assert.equal(d.querySelector('[name=title]'),null);
  assert.doesNotThrow(()=>A.captureApplication());
});

test('explicit member scope stays selected when empty and cannot be published',async t=>{
  const {A,d,act,set}=await fixture(t,'rule/seal/basic');
  set('initiatorMode','selected');A.render();assert.equal(d.querySelector('[name=initiatorMode]').value,'selected');
  await assert.rejects(()=>act('editor-publish'),/发起成员/);
});

test('management sorting and moving save transactionally; batch cancellation does not stop forms',async t=>{
  const {A,d,act,set,save}=await fixture(t,'rules');
  const first=A.state.categories[0].id,second=A.state.categories[1].id;
  await act('oa-group-sort');await act('oa-sort-move',{index:'0',delta:'1'});await save();
  assert.equal(A.state.categories[0].id,second);assert.equal(A.state.categories[1].id,first);
  await act('oa-form-move',{id:'seal'});set('category',second);await save();
  assert.equal(A.state.templates.find(t=>t.id==='seal').draft.basic.category,second);
  await act('oa-batch');const checkbox=d.querySelector('[data-batch-id=seal]');checkbox.click();
  await act('oa-batch-confirm');A.close();assert.equal(A.state.templates.find(t=>t.id==='seal').enabled,true);
});
