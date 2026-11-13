/* Customer storage compatibility and failure protection; never uses user data. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../pages/customer-state/storage.js');
let queue=Promise.resolve();
const locks={request(key,options,callback){const operation=queue.then(callback);queue=operation.catch(()=>{});return operation}};
const fixture=()=>({version:1,config:{primary:[]},drafts:{},history:[],cases:[{id:'case-1',note:'原始数据'}]});
function setup(raw=null){
  const store={raw,writes:0,getItem(){return this.raw},setItem(key,value){this.writes++;this.raw=value}};
  return {store,api:create(()=>store,()=>locks)};
}
test('only an absent key permits a fresh dataset',async()=>{
  const {store,api}=setup();assert.equal(api.hasSavedState,false);assert.equal(api.read(),null);assert.equal(api.hasSavedState,false);assert.equal(store.writes,0);
  const data=JSON.stringify(fixture());await api.run(()=>api.save(data));assert.equal(store.raw,data);assert.deepEqual(api.read(),fixture());
  assert.equal(api.hasSavedState,true);assert.deepEqual(api.restore(),fixture());
});
test('existing plain records are returned without changing their stored bytes',async()=>{
  const data=JSON.stringify(fixture(),null,2),{store,api}=setup(data);
  assert.deepEqual(api.read(),fixture());assert.equal(store.raw,data);assert.equal(store.writes,0);
  assert.equal(api.hasSavedState,true);assert.deepEqual(api.restore(),fixture());
});
test('pooled records remain compatible, including repeated non-cyclic references',async()=>{
  const value=fixture();value.drafts={first:{$wdRef:1},second:{$wdRef:1}};
  const raw=JSON.stringify({storageFormat:'weidong-pool-v1',root:{$wdRef:0},pool:[value,{note:'原草稿'}]});
  const {store,api}=setup(raw);const decoded=api.read();
  assert.deepEqual(decoded.drafts,{first:{note:'原草稿'},second:{note:'原草稿'}});
  assert.notEqual(decoded.drafts.first,decoded.drafts.second);assert.equal(store.raw,raw);assert.equal(store.writes,0);
});
test('malformed, null and unsupported records cannot be replaced with defaults',async()=>{
  for(const raw of ['', '{bad', 'null', '[]', JSON.stringify({...fixture(),version:2}), JSON.stringify({...fixture(),cases:[]}), JSON.stringify({...fixture(),config:null})]){
    const {store,api}=setup(raw);assert.throws(()=>api.read(),/原记录已保留/);
    await assert.rejects(()=>api.run(()=>api.save(JSON.stringify(fixture()))),/阻止保存/);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  }
});
test('invalid or cyclic pool references fail before any write',async()=>{
  for(const root of [{$wdRef:9},{$wdRef:-1},{$wdRef:'0'},{$wdRef:0}]){
    const raw=JSON.stringify({storageFormat:'weidong-pool-v1',root,pool:[{$wdRef:0}]}),{store,api}=setup(raw);
    assert.throws(()=>api.read(),/引用无效或存在循环/);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  }
});
test('denied storage access keeps its cause and blocks saving',async()=>{
  const cause=new Error('Access denied'),api=create(()=>{throw cause},()=>locks);
  assert.throws(()=>api.read(),error=>error.cause===cause && /未创建或覆盖/.test(error.message));
  await assert.rejects(()=>api.run(()=>api.save('{}')),/阻止保存/);
});
test('a failed save preserves old bytes and supports retry after recovery',async()=>{
  const raw=JSON.stringify(fixture()),{store,api}=setup(raw);api.read();
  const cause=new Error('QuotaExceededError'),set=store.setItem;store.setItem=()=>{throw cause};
  const next=JSON.stringify({...fixture(),role:'门店店长'});
  await assert.rejects(()=>api.run(()=>api.save(next)),error=>error.cause===cause && /未保存/.test(error.message));assert.equal(store.raw,raw);
  store.setItem=set;await api.run(()=>api.save(next));assert.equal(store.raw,next);
});
test('changes committed by another page are not overwritten by a stale snapshot',async()=>{
  const {store,api}=setup(JSON.stringify(fixture())),second=create(()=>store,()=>locks);api.read();second.read();
  const next=JSON.stringify({...fixture(),role:'门店店长'});await second.run(()=>second.save(next));
  await assert.rejects(()=>api.run(()=>api.save(JSON.stringify({...fixture(),role:'总部财务'}))),/其他页面已更新/);
  assert.equal(store.raw,next);assert.equal(store.writes,1);
});
test('unchanged state keeps the original format and skips storage writes',async()=>{
  const raw=JSON.stringify(fixture(),null,2),{store,api}=setup(raw),value=api.read();
  assert.equal(await api.run(()=>api.saveState(value)),false);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  value.role='总部财务';assert.equal(await api.run(()=>api.saveState(value)),true);
  const saved=store.raw;assert.equal(await api.run(()=>api.saveState(value)),false);
  assert.equal(store.writes,1);assert.equal(store.raw,saved);assert.deepEqual(api.read(),value);
});
test('state pooling preserves nested values and independent repeated objects',async()=>{
  const {store,api}=setup();api.read();
  const repeated={text:'明细'.repeat(80),rows:[{id:'订单',amount:32.5,active:true,extra:null}]};
  const value={...fixture(),drafts:{first:repeated,second:structuredClone(repeated)}};
  await api.run(()=>api.saveState(value));assert.equal(JSON.parse(store.raw).storageFormat,'weidong-pool-v1');
  const decoded=api.read();assert.deepEqual(decoded,value);assert.notEqual(decoded.drafts.first,decoded.drafts.second);
  assert.equal(await api.run(()=>api.saveState(decoded)),false);assert.equal(store.writes,1);
});
test('a failed state save stays retryable and cannot hide a concurrent update',async()=>{
  const raw=JSON.stringify(fixture()),{store,api}=setup(raw),value=api.read();value.role='店长';
  const set=store.setItem;store.setItem=()=>{throw new Error('quota full')};
  await assert.rejects(()=>api.run(()=>api.saveState(value)),/quota full/);assert.equal(store.raw,raw);
  store.setItem=set;assert.equal(await api.run(()=>api.saveState(value)),true);
  store.raw=JSON.stringify({...fixture(),role:'其他页面'});value.role='财务';
  await assert.rejects(()=>api.run(()=>api.saveState(value)),/其他页面已更新/);
  assert.equal(JSON.parse(store.raw).role,'其他页面');
});
test('pooling treats escaped keys, brackets and unicode as text and reuses equal containers',async()=>{
  const {store,api}=setup();api.read();
  const text='[文字] {"嵌套": "\\\\路径\\\""}\n\t💡\u0000'.repeat(20);
  const repeated={'key"\\[{':text,items:[null,true,false,-2.5,0,{label:'短对象'}]};
  const value={...fixture(),drafts:{one:repeated,two:structuredClone(repeated)},notes:[text,{nested:repeated}]};
  await api.run(()=>api.saveState(value));
  assert.deepEqual(api.read(),value);
  const packed=JSON.parse(store.raw);
  assert.deepEqual(packed.root,{$wdRef:0});
  assert.deepEqual(packed.pool[1],{one:{$wdRef:2},two:{$wdRef:2}});
  assert.deepEqual(packed.pool[2],repeated);
  assert.ok(store.raw.length<JSON.stringify(value).length);
});
test('unserializable changes cannot overwrite saved data and can be retried after correction',async()=>{
  const raw=JSON.stringify(fixture()),{store,api}=setup(raw),value=api.read();
  value.loop=value;
  await assert.rejects(()=>api.run(()=>api.saveState(value)),/circular/i);
  assert.equal(store.raw,raw);assert.equal(store.writes,0);
  delete value.loop;value.role='财务';await api.run(()=>api.saveState(value));
  assert.deepEqual(api.read(),value);assert.equal(store.writes,1);
});
test('all changed writes require an exclusive lock',async()=>{
  const {store,api}=setup(JSON.stringify(fixture()));api.read();
  assert.throws(()=>api.saveState({...fixture(),role:'changed'}),/排他锁/);
  const noLocks=create(()=>store);noLocks.read();
  await assert.rejects(noLocks.run(()=>noLocks.saveState({...fixture(),role:'changed'})),/安全保存锁/);
  assert.equal(store.writes,0);
});
test('two queued windows cannot both commit the same base version',async()=>{
  const {store,api}=setup(JSON.stringify(fixture())),second=create(()=>store,()=>locks);
  const a=api.read(),b=second.read();a.role='first';b.role='second';let entered=0;
  const results=await Promise.allSettled([api.run(()=>{entered++;api.saveState(a)}),second.run(()=>{entered++;second.saveState(b)})]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(entered,1);assert.equal(store.writes,1);assert.deepEqual(api.restore(),a);
});
