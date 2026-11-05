const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=name=>fs.readFileSync(path.join(__dirname,'../pages/complaint-options',name),'utf8');
const copy=value=>value===undefined?undefined:JSON.parse(JSON.stringify(value));

function storage(initial){
  let saved=copy(initial),writeFailure=false,openFailure=false,notifyFailure=false;
  const db={transaction(){
    let candidate,aborted=false;
    const tx={abort(){aborted=true;queueMicrotask(()=>tx.onabort?.())},objectStore(){return {
      get(){const request={};queueMicrotask(()=>{request.result=copy(saved);request.onsuccess?.();queueMicrotask(()=>{if(aborted)return;if(candidate)saved=candidate;tx.oncomplete?.()})});return request},
      put(value){if(writeFailure){tx.error=Error('QuotaExceededError');tx.abort()}else candidate=copy(value)}
    }}};return tx;
  }};
  const channels=[];
  const context={setTimeout,clearTimeout,indexedDB:{open(){if(openFailure)throw Error('SecurityError');const request={result:db};queueMicrotask(()=>request.onsuccess());return request}},BroadcastChannel:class{constructor(){channels.push(this)}postMessage(){if(notifyFailure)throw Error('notification failed');for(const other of channels)if(other!==this)other.onmessage?.()}},window:{addEventListener(){}}};
  const create=()=>{const isolated={...context,window:{addEventListener(){}}};vm.runInNewContext(source('storage.js'),isolated);return isolated.window.PCComplaintOptions};
  return {dictionary:create(),create,get saved(){return copy(saved)},set writeFailure(value){writeFailure=value},set openFailure(value){openFailure=value},set notifyFailure(value){notifyFailure=value}};
}

test('level configuration upgrades old data without enabling AI or changing existing fields',()=>{
  const {dictionary:d}=storage(),old={schema:1,revision:4,demands:['原因甲'],types:['门店服务'],defaultTimings:{'2级':3}},before=copy(old);
  const upgraded=d.validate(old);
  assert.equal(upgraded.aiGradeEnabled,false);assert.deepEqual(copy(upgraded.levelDefinitions),{});assert.deepEqual(old,before);
  assert.deepEqual(copy(upgraded.defaultTimings),before.defaultTimings);
  const definition={criteria:'  服务效果有差异\n需进一步核实  ',keywords:'效果差，未改善',exclusions:'仅咨询预约'};
  assert.deepEqual(copy(d.validateDefinition(definition)),{...definition,criteria:definition.criteria.trim()});
  assert.equal(d.validateDefinition({criteria:' \n',keywords:' ',exclusions:''}),null);
  assert.throws(()=>d.validateDefinition({criteria:'',keywords:'效果差'}),/定级条件/);
  for(const [key,limit]of [['criteria',2000],['keywords',500],['exclusions',2000]]){
    assert.doesNotThrow(()=>d.validateDefinition({criteria:'条件',[key]:'字'.repeat(limit)}));
    assert.throws(()=>d.validateDefinition({criteria:'条件',[key]:'字'.repeat(limit+1)}));
    assert.throws(()=>d.validateDefinition({criteria:'条件',[key]:null}));
  }
  for(const aiGradeEnabled of [null,0,'false'])assert.throws(()=>d.validate({...old,aiGradeEnabled}),/开关/);
  for(const levelDefinitions of [null,[],{'6级':definition},{'1级':null}])assert.throws(()=>d.validate({...old,levelDefinitions}),/等级/);
  assert.deepEqual(copy(d.validate({...old,aiGradeEnabled:false,levelDefinitions:{'1级':definition}}).levelDefinitions['1级']),copy(d.validateDefinition(definition)));
});

test('level editors isolate drafts, validate conditions, clear definitions and retain changes across tabs',async()=>{
  const base=storage().dictionary;
  let persisted=copy(base.current),saveCalls=0,failSave=false;
  const dictionary={...base,read:async()=>copy(persisted),save:async(draft,revision)=>{saveCalls++;if(failSave)throw Error('QuotaExceededError');persisted=copy(base.validate({...draft,revision:revision+1}));return copy(persisted)}};
  const layers=[],messages=[],focused=[];
  function openLayer(title){
    const nodes={'.uc-drawer':{dataset:{},style:{setProperty(){}}},'.uc-drawer-body':{},'.uc-drawer-foot':{},'[data-ai-grade-state]':{},'[data-level-definitions]':{hidden:true}};
    for(const key of Object.keys(base.LEVEL_FIELDS)){
      nodes[`[name="level-${key}"]`]={setAttribute(){}};
      nodes['#uc-error-level-'+key]={textContent:''};
    }
    const layer={title,nodes,el:{querySelector:selector=>nodes[selector]||null}};layers.push(layer);return layer;
  }
  const context={window:{PCModules:{}},PCUI:{focusControl:control=>focused.push(control)}};
  vm.runInNewContext(source('index.js'),context);
  const escape=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
  const helper=context.window.PCModules['complaint-options'].create({dictionary,getLayers:()=>layers,openLayer,closeLayer:()=>layers.pop(),refreshOptionConsumers(){},esc:escape,btn:(label,action)=>`<button data-uc="${action}">${label}</button>`,link:(label,action,extra)=>`<button data-uc="${action}" ${extra}>${label}</button>`,section:(title,content)=>title+content,field:(id,label,control)=>label+control,input:(id,value)=>`<input name="${id}" value="${escape(value)}">`,toast:message=>messages.push(message)});
  const action=(name,dataset={})=>helper.optionAction(name,{dataset},layers.at(-1));
  const set=(name,value)=>helper.syncOptionDraft({name,value,checked:value,removeAttribute(){}});
  await action('options-open');const parent=layers[0],body=parent.nodes['.uc-drawer-body'];
  action('options-tab',{key:'levels'});
  assert.equal((body.innerHTML.match(/data-uc="options-level-edit"/g)||[]).length,5);
  assert.ok(body.innerHTML.includes('data-pc-scroll="parent"'));assert.ok(body.innerHTML.includes('开启 AI 识别客诉等级'));
  assert.ok(body.innerHTML.includes('data-level-definitions hidden'));assert.ok(!body.innerHTML.includes('uc-help'));
  assert.equal(helper.optionsDirty(parent.options),false);
  set('aiGradeEnabled',true);assert.equal(parent.options.draft.aiGradeEnabled,true);assert.equal(helper.optionsDirty(parent.options),true);assert.equal(persisted.aiGradeEnabled,false);assert.equal(parent.nodes['[data-level-definitions]'].hidden,false);
  action('options-level-edit',{level:'1级'});const child=layers.at(-1);
  assert.equal(child.title,'客诉等级定义 · 1级');
  set('level-keywords','效果差');await action('options-save');assert.equal(layers.length,2);assert.equal(focused.length,1);assert.equal(saveCalls,0);assert.ok(messages.at(-1).includes('定级条件'));
  set('level-criteria',' 服务效果与预期有差异\n需进一步核实 ');set('level-exclusions','<script>不执行</script>');
  await action('options-save');assert.equal(layers.length,1);assert.equal(saveCalls,0);
  const definition=copy(parent.options.draft.levelDefinitions['1级']);assert.equal(definition.criteria,'服务效果与预期有差异\n需进一步核实');assert.ok(body.innerHTML.includes('&lt;script>'));assert.ok(!body.innerHTML.includes('<script>'));
  action('options-tab',{key:'types'});action('options-tab',{key:'levels'});assert.deepEqual(copy(parent.options.draft.levelDefinitions['1级']),definition);assert.equal(parent.options.draft.aiGradeEnabled,true);
  action('options-level-edit',{level:'1级'});set('level-criteria','应被丢弃');assert.equal(helper.optionsDirty(layers.at(-1).options),true);layers.pop();assert.deepEqual(copy(parent.options.draft.levelDefinitions['1级']),definition);
  action('options-level-edit',{level:'2级'});set('level-criteria','第二级定义');await action('options-save');
  action('options-level-edit',{level:'2级'});for(const key of Object.keys(base.LEVEL_FIELDS))set('level-'+key,'');await action('options-save');assert.equal(Object.hasOwn(parent.options.draft.levelDefinitions,'2级'),false);
  set('aiGradeEnabled',false);assert.deepEqual(copy(parent.options.draft.levelDefinitions['1级']),definition);assert.equal(parent.nodes['[data-level-definitions]'].hidden,true);
  failSave=true;await action('options-save');assert.equal(layers.length,1);assert.equal(parent.options.saving,false);assert.deepEqual(copy(parent.options.draft.levelDefinitions['1级']),definition);assert.deepEqual(persisted.levelDefinitions,{});assert.ok(messages.at(-1).includes('QuotaExceededError'));
  failSave=false;await action('options-save');assert.equal(layers.length,0);assert.deepEqual(persisted.levelDefinitions['1级'],definition);assert.equal(persisted.aiGradeEnabled,false);
  await action('options-open');assert.deepEqual(copy(layers[0].options.draft.levelDefinitions['1级']),definition);assert.equal(helper.optionsDirty(layers[0].options),false);
});

test('AI settings survive reload and disabled saves, reject stale writes and retain data on storage failures',async()=>{
  const old={schema:1,revision:4,demands:['原因甲'],types:['门店服务']},store=storage(old),d=store.dictionary;
  const initial=await d.read();assert.equal(initial.aiGradeEnabled,false);assert.deepEqual(store.saved,old);
  const draft={...initial,aiGradeEnabled:true,levelDefinitions:{'2级':{criteria:'条件',keywords:'关键词',exclusions:'排除情况'}}};
  await d.save(draft,4);assert.equal(store.saved.revision,5);assert.equal(store.saved.aiGradeEnabled,true);
  const second=store.create(),reloaded=await second.read();assert.deepEqual(copy(reloaded.levelDefinitions),draft.levelDefinitions);assert.equal(reloaded.aiGradeEnabled,true);
  let notified;const notification=new Promise(resolve=>{notified=resolve});second.subscribe(()=>notified());
  await d.save({...d.current,aiGradeEnabled:false},5);await notification;
  assert.equal(second.current.aiGradeEnabled,false);assert.deepEqual(copy(second.current.levelDefinitions),draft.levelDefinitions);
  await assert.rejects(second.save({...reloaded,levelDefinitions:{}},5),/其他页面/);assert.equal(store.saved.revision,6);assert.deepEqual(store.saved.levelDefinitions,draft.levelDefinitions);
  store.writeFailure=true;await assert.rejects(d.save({...d.current,aiGradeEnabled:true,levelDefinitions:{}},6),/QuotaExceededError/);
  assert.equal(store.saved.aiGradeEnabled,false);assert.deepEqual(copy(d.current.levelDefinitions),draft.levelDefinitions);assert.equal(d.current.revision,6);
  store.writeFailure=false;store.notifyFailure=true;await d.save({...d.current,aiGradeEnabled:true},6);assert.equal(d.current.revision,7);assert.equal(store.saved.aiGradeEnabled,true);
  const unavailable=storage(old);unavailable.openFailure=true;await assert.rejects(unavailable.dictionary.read(),/SecurityError/);assert.deepEqual(unavailable.saved,old);assert.equal(unavailable.dictionary.error,'SecurityError');
  for(const malformed of [{...old,aiGradeEnabled:'true'},{...old,levelDefinitions:{'2级':{keywords:'缺少条件'}}}]){
    const broken=storage(malformed);await assert.rejects(broken.dictionary.read());assert.deepEqual(broken.saved,malformed);
  }
});
