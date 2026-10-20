const assert=require('node:assert/strict');
const vm=require('node:vm'),fs=require('node:fs'),E=require('./engine');
const legacyKey='meiye.complaint.prototype.a.v1';
const values=new Map(),writes=[];
const localStorage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{writes.push(k);values.set(k,v);}};
const legacy=E.demo();legacy.workflowVersion=2;
const legacyRaw=JSON.stringify(legacy);
values.set(legacyKey,legacyRaw);
values.set(legacyKey+'.drafts',JSON.stringify({'manager:create':{values:{title:'保留未提交草稿'}}}));
values.set(legacyKey+'.actor','manager');
const ctx={window:{CaseEngine:E},localStorage,navigator:{}};
vm.runInNewContext(fs.readFileSync(__dirname+'/store.js','utf8'),ctx);
const store=ctx.window.CaseStore, migrated=store.load();
assert.notEqual(store.KEY,legacyKey);
assert.equal(migrated.workflowVersion,3);
assert.deepEqual(migrated.cases.map(c=>c.id),legacy.cases.map(c=>c.id));
assert.equal(values.get(legacyKey),legacyRaw,'升级不能向旧窗口使用的数据键回写');
assert.equal(values.get(store.KEY+'.drafts'),values.get(legacyKey+'.drafts'));
assert.equal(values.get(store.KEY+'.actor'),'manager');
const current=store.load();current.cases[0].title='新版编辑结果';store.save(current);
const saved=values.get(store.KEY),writeCount=writes.length;
// A still-open workflow-2 tab repeatedly writes its old data. New reads must
// neither import it again nor generate another storage notification.
for(let i=0;i<50;i++){
 values.set(legacyKey,legacyRaw);
 assert.equal(store.load().cases[0].title,'新版编辑结果');
}
assert.equal(values.get(store.KEY),saved);
assert.equal(writes.length,writeCount,'读取新版状态不应因旧版写入产生互相回写循环');
assert(!writes.includes(legacyKey));
console.log('通过：旧工单/草稿/身份一次性迁移；旧窗口反复写入不会覆盖新版或触发互写循环。');
