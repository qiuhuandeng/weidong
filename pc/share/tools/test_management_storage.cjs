/* Isolated tests; no browser or user storage is read. */
const {test}=require('node:test'),assert=require('node:assert/strict');
const create=require('../pages/management-core/storage.js');
const fixture=()=>({version:1,history:[],shops:[{id:'s1',name:'原门店',enabled:true}],unknown:{preserve:'保留旧扩展字段'}});
function setup(raw=null){
  const store={raw,writes:0,getItem(){return this.raw},setItem(key,value){this.writes++;this.raw=value}};
  let queue=Promise.resolve();
  const locks={request(key,options,callback){const next=queue.then(callback);queue=next.catch(()=>{});return next}};
  return {store,locks,api:create(()=>store,()=>locks)};
}
test('only an absent key allows a new dataset',async()=>{
  const {store,api}=setup();assert.equal(api.read(),null);assert.equal(store.writes,0);
  await api.run(()=>api.save(fixture()));assert.deepEqual(api.read(),fixture());
});
test('existing records and unknown fields retain their original bytes on unchanged initialization',async()=>{
  const raw=JSON.stringify(fixture(),null,2),{store,api}=setup(raw),data=api.read();
  await api.run(()=>assert.equal(api.save(data),false));assert.equal(store.raw,raw);assert.equal(store.writes,0);
});
test('invalid data cannot be replaced with defaults',async()=>{
  for(const raw of ['', '{bad','null','[]','{"version":2,"history":[]}',JSON.stringify({...fixture(),shops:null}),JSON.stringify({...fixture(),refunds:[null]}),JSON.stringify({...fixture(),storeSeats:[]})]){
    const {store,api}=setup(raw);assert.throws(()=>api.read(),/原记录已保留/);
    await assert.rejects(api.run(()=>api.save(fixture())),/尚未成功读取/);assert.equal(store.raw,raw);assert.equal(store.writes,0);
  }
});
test('denied reads preserve the cause and block subsequent writes',async()=>{
  const cause=Error('Access denied'),{store,api}=setup(JSON.stringify(fixture()));store.getItem=()=>{throw cause};
  assert.throws(()=>api.read(),error=>error.cause===cause&&error.managementStorage);
  await assert.rejects(api.run(()=>api.save(fixture())),/尚未成功读取/);assert.equal(store.writes,0);
});
test('capacity failure preserves the committed snapshot and supports an explicit retry',async()=>{
  const raw=JSON.stringify(fixture()),{store,api}=setup(raw),data=api.read(),set=store.setItem;
  data.shops[0].name='修改内容';store.setItem=()=>{throw Error('QuotaExceededError')};
  await assert.rejects(api.run(()=>api.save(data)),/QuotaExceededError/);
  assert.equal(store.raw,raw);assert.deepEqual(api.restore(),fixture());
  store.setItem=set;await api.run(()=>api.save(data));assert.deepEqual(api.read(),data);
});
test('two simultaneous edits serialize and reject the stale writer before mutation',async()=>{
  const {store,api,locks}=setup(JSON.stringify(fixture())),other=create(()=>store,()=>locks),first=api.read(),second=other.read();let called=false;
  first.shops[0].name='第一个窗口';second.shops[0].name='旧窗口';
  const results=await Promise.allSettled([api.run(()=>api.save(first)),other.run(()=>{called=true;other.save(second)})]);
  assert.equal(results[0].status,'fulfilled');assert.equal(results[1].status,'rejected');assert.match(results[1].reason.message,/其他页面已更新/);
  assert.equal(called,false);assert.equal(JSON.parse(store.raw).shops[0].name,'第一个窗口');assert.equal(store.writes,1);
});
test('external writers are detected again at commit even while holding the lock',async()=>{
  const {store,api}=setup(JSON.stringify(fixture())),data=api.read(),external=JSON.stringify({...fixture(),external:true});
  await assert.rejects(api.run(()=>{store.raw=external;api.save(data)}),/其他页面已更新/);assert.equal(store.raw,external);
});
test('unlocked or unavailable-lock writes are blocked without losing drafts',async()=>{
  const {store,api}=setup(JSON.stringify(fixture()));const data=api.read();data.shops[0].name='草稿';
  assert.throws(()=>api.save(data),/未取得保存锁/);
  const unavailable=create(()=>store,()=>null);unavailable.read();await assert.rejects(unavailable.run(()=>unavailable.save(data)),/Web Locks/);
  const denied=create(()=>store,()=>({request(){throw Error('Lock denied')}}));denied.read();await assert.rejects(denied.run(()=>denied.save(data)),/Lock denied/);
  assert.equal(store.writes,0);assert.equal(data.shops[0].name,'草稿');
});
test('business exceptions are not mislabeled as lock failures and release the lock',async()=>{
  const {api}=setup(JSON.stringify(fixture()));api.read();const cause=Error('Business validation');
  await assert.rejects(api.run(()=>{throw cause}),error=>error===cause);
  await api.run(()=>api.save({...fixture(),ok:true}));assert.equal(api.read().ok,true);
});
