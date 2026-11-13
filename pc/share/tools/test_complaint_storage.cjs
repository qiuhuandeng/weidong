/* Uses only in-memory fixtures, never real browser records. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../pages/complaint-storage/index.js');
const fixture=()=>[{id:'1',name:'Customer',created:'2026-11-13 12:00',channel:'hotline',status:'pending',logs:[],follows:[],linked:[],extra:{keep:true}}];
function setup(target=null,source=null){
  const values=new Map([['weid.pc.complaints.v1',target],['weidong.unified-complaints.v1',source]]);
  const store={writes:0,getItem:key=>values.get(key)??null,setItem(key,value){this.writes++;values.set(key,value)}};
  return {values,store,api:create(()=>store)};
}
test('absence, valid empty lists and existing records are distinct',()=>{
  assert.equal(setup().api.read(),null);
  for(const value of [[],fixture()]){const raw=JSON.stringify(value,null,2),{store,api}=setup(raw);assert.deepEqual(api.read(),value);assert.equal(api.save(value),false);assert.equal(store.writes,0);assert.equal(store.getItem(api.key),raw)}
});
test('corrupt or incompatible targets never fall back to source examples',()=>{
  for(const raw of ['', 'null', '{bad', '{}', '[{"id":"1"}]',JSON.stringify([{...fixture()[0],files:{}}])]){
    const {api,store}=setup(raw,JSON.stringify(fixture()));assert.throws(()=>api.read(),/原记录已保留/);assert.throws(()=>api.save(fixture()),/阻止保存/);assert.equal(store.writes,0);assert.equal(store.getItem(api.key),raw);
  }
});
test('legacy migration preserves source bytes and failed migrations stay retryable',()=>{
  const raw=JSON.stringify(fixture(),null,2),{api,store}=setup(null,raw),value=api.read(),set=store.setItem;
  store.setItem=()=>{throw Error('quota full')};assert.throws(()=>api.save(value),/quota full/);assert.equal(store.getItem(api.key),null);
  store.setItem=set;api.save(value);assert.deepEqual(JSON.parse(store.getItem(api.key)),value);assert.equal(store.getItem(api.sourceKey),raw);
});
test('invalid legacy data and denied reads block initialization and writes',()=>{
  const {api,store}=setup(null,'{bad');assert.throws(()=>api.read(),/读取失败/);assert.throws(()=>api.save([]),/阻止保存/);assert.equal(store.writes,0);
  const denied=create(()=>{throw Error('Access denied')});assert.throws(()=>denied.read(),/Access denied/);assert.throws(()=>denied.save([]),/阻止保存/);
});
test('source or target changes during editing reject stale saves',()=>{
  for(const legacy of [false,true]){const {api,store}=setup(legacy?null:'[]',legacy?'[]':null);api.read();store.setItem(legacy?api.sourceKey:api.key,JSON.stringify(fixture()));assert.throws(()=>api.save([]),/其他页面/);assert.equal(store.writes,1)}
});
