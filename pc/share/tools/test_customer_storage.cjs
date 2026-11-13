/* Customer storage compatibility and failure protection; never uses user data. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../pages/customer/storage.js');
const fixture=()=>({version:1,config:{primary:[]},drafts:{},history:[],cases:[{id:'case-1',note:'原始数据'}]});
function setup(raw=null){
  const store={raw,writes:0,getItem(){return this.raw},setItem(key,value){this.writes++;this.raw=value}};
  return {store,api:create(()=>store)};
}
test('only an absent key permits a fresh dataset',()=>{
  const {store,api}=setup();assert.equal(api.read(),null);assert.equal(store.writes,0);
  const data=JSON.stringify(fixture());api.save(data);assert.equal(store.raw,data);assert.deepEqual(api.read(),fixture());
});
test('existing plain records are returned without changing their stored bytes',()=>{
  const data=JSON.stringify(fixture(),null,2),{store,api}=setup(data);
  assert.deepEqual(api.read(),fixture());assert.equal(store.raw,data);assert.equal(store.writes,0);
});
test('pooled records remain compatible, including repeated non-cyclic references',()=>{
  const value=fixture();value.drafts={first:{$wdRef:1},second:{$wdRef:1}};
  const raw=JSON.stringify({storageFormat:'weidong-pool-v1',root:{$wdRef:0},pool:[value,{note:'原草稿'}]});
  const {store,api}=setup(raw);const decoded=api.read();
  assert.deepEqual(decoded.drafts,{first:{note:'原草稿'},second:{note:'原草稿'}});
  assert.notEqual(decoded.drafts.first,decoded.drafts.second);assert.equal(store.raw,raw);assert.equal(store.writes,0);
});
test('malformed, null and unsupported records cannot be replaced with defaults',()=>{
  for(const raw of ['', '{bad', 'null', '[]', JSON.stringify({...fixture(),version:2}), JSON.stringify({...fixture(),cases:[]}), JSON.stringify({...fixture(),config:null})]){
    const {store,api}=setup(raw);assert.throws(()=>api.read(),/原记录已保留/);
    assert.throws(()=>api.save(JSON.stringify(fixture())),/阻止保存/);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  }
});
test('invalid or cyclic pool references fail before any write',()=>{
  for(const root of [{$wdRef:9},{$wdRef:-1},{$wdRef:'0'},{$wdRef:0}]){
    const raw=JSON.stringify({storageFormat:'weidong-pool-v1',root,pool:[{$wdRef:0}]}),{store,api}=setup(raw);
    assert.throws(()=>api.read(),/引用无效或存在循环/);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  }
});
test('denied storage access keeps its cause and blocks saving',()=>{
  const cause=new Error('Access denied'),api=create(()=>{throw cause});
  assert.throws(()=>api.read(),error=>error.cause===cause && /未创建或覆盖/.test(error.message));
  assert.throws(()=>api.save('{}'),/阻止保存/);
});
test('a failed save preserves old bytes and supports retry after recovery',()=>{
  const raw=JSON.stringify(fixture()),{store,api}=setup(raw);api.read();
  const cause=new Error('QuotaExceededError'),set=store.setItem;store.setItem=()=>{throw cause};
  const next=JSON.stringify({...fixture(),role:'门店店长'});
  assert.throws(()=>api.save(next),error=>error.cause===cause && /未保存/.test(error.message));assert.equal(store.raw,raw);
  store.setItem=set;api.save(next);assert.equal(store.raw,next);
});
test('changes committed by another page are not overwritten by a stale snapshot',()=>{
  const {store,api}=setup(JSON.stringify(fixture())),second=create(()=>store);api.read();second.read();
  const next=JSON.stringify({...fixture(),role:'门店店长'});second.save(next);
  assert.throws(()=>api.save(JSON.stringify({...fixture(),role:'总部财务'})),/其他页面已更新/);
  assert.equal(store.raw,next);assert.equal(store.writes,1);
});
