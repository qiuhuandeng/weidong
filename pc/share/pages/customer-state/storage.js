/* Preserve existing customer records when reading, decoding or saving fails. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PCCustomerStorage = factory(() => root.localStorage, () => root.navigator?.locks);
})(globalThis, function (getStorage, getLocks) {
  'use strict';
  const key = 'weidong-correction-prototype-v1';
  let loaded = false, previous, snapshot, locked = false;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message, cause) {
    const error = new Error(message + (cause?.message ? '：' + cause.message : ''), {cause});
    error.customerStorage = true;return error;
  }
  function decode(text) {
    const saved = JSON.parse(text);
    if (saved?.storageFormat !== 'weidong-pool-v1') return saved;
    if (!Array.isArray(saved.pool) || !Object.hasOwn(saved, 'root')) throw Error('数据引用表不完整');
    const active = new Set();
    function unpack(value) {
      if (!value || typeof value !== 'object') return value;
      if (object(value) && Object.keys(value).length === 1 && Object.hasOwn(value, '$wdRef')) {
        const index = value.$wdRef;
        if (!Number.isInteger(index) || index < 0 || index >= saved.pool.length || active.has(index)) {
          throw Error('数据引用无效或存在循环');
        }
        active.add(index);
        try { return unpack(saved.pool[index]); } finally { active.delete(index); }
      }
      return Array.isArray(value) ? value.map(unpack)
        : Object.fromEntries(Object.entries(value).map(([name, item]) => [name, unpack(item)]));
    }
    return unpack(saved.root);
  }
  function validate(value) {
    if (!object(value) || value.version !== 1 || !object(value.config) || !object(value.drafts) ||
        !Array.isArray(value.history) || !Array.isArray(value.cases) || !value.cases.length ||
        value.cases.some(item => !object(item) || typeof item.id !== 'string' || !item.id)) {
      throw Error('客户数据版本或结构不兼容');
    }
    return value;
  }
  function read() {
    loaded = false;
    let raw;
    try { raw = getStorage().getItem(key); }
    catch (error) { throw fail('客户数据暂时无法读取，未创建或覆盖任何记录，请恢复存储权限后重试', error); }
    let value = null;
    if (raw !== null) {
      try { value = validate(decode(raw)); }
      catch (error) { throw fail('客户数据无法解析，原记录已保留，请先备份并修复后重试', error); }
    }
    previous = raw;
    snapshot = value === null ? null : JSON.stringify(value);
    loaded = true;
    return value;
  }
  function save(text) {
    if (!loaded) throw Error('客户数据尚未成功读取，已阻止保存');
    try {
      if (!locked) throw Error('客户保存必须在排他锁内执行');
      const storage = getStorage();
      if (storage.getItem(key) !== previous) throw Error('其他页面已更新客户数据，请刷新后重新操作');
      if (text === previous) return false;
      storage.setItem(key, text);
      previous = text;
      snapshot = null;
      return true;
    } catch (error) {
      throw fail('客户数据未保存，原记录和当前填写内容已保留', error);
    }
  }
  function saveState(value) {
    if (!loaded) throw Error('客户数据尚未成功读取，已阻止保存');
    const next = JSON.stringify(value);
    // Compare before building the reference pool. Reading an unchanged record
    // preserves its original bytes, including older supported storage formats.
    if (next === snapshot) return false;
    // Locate object/array spans in the already serialized snapshot. Strings are
    // skipped with their escapes, so brackets in text never become structure.
    const stack = []; let root;
    for (let index = 0; index < next.length; index++) {
      const char = next[index];
      if (char === '"') {
        for (index++; index < next.length; index++) {
          if (next[index] === '\\') index++;
          else if (next[index] === '"') break;
        }
      } else if (char === '{' || char === '[') {
        const node = {start:index, end:0, children:[]};
        if (stack.length) stack[stack.length - 1].children.push(node); else root = node;
        stack.push(node);
      } else if (char === '}' || char === ']') stack.pop().end = index + 1;
    }
    const pool = [], seen = new Map();
    function pack(node) {
      const signature = next.slice(node.start, node.end);
      if (signature.length < 120) return signature;
      if (seen.has(signature)) return '{"$wdRef":' + seen.get(signature) + '}';
      const index = pool.length; seen.set(signature, index); pool.push('');
      const pieces = []; let cursor = node.start;
      for (const child of node.children) {
        pieces.push(next.slice(cursor, child.start), pack(child)); cursor = child.end;
      }
      pieces.push(next.slice(cursor, node.end)); pool[index] = pieces.join('');
      return '{"$wdRef":' + index + '}';
    }
    const packed = root ? pack(root) : next;
    const changed = save('{"storageFormat":"weidong-pool-v1","root":' + packed + ',"pool":[' + pool.join(',') + ']}');
    snapshot = next;
    return changed;
  }
  function restore(){return snapshot!==null?JSON.parse(snapshot):previous===null?null:decode(previous)}
  async function run(callback){
    let locks;
    try{locks=getLocks?.();if(!locks)throw Error('浏览器未提供安全保存锁')}
    catch(error){throw fail('客户数据未保存',error)}
    let callbackError;
    try{return await locks.request(key,{mode:'exclusive'},()=>{
      try{
        if(!loaded)throw fail('客户数据尚未成功读取，已阻止保存');
        if(getStorage().getItem(key)!==previous)throw fail('其他页面已更新客户数据，请刷新后重新操作');
        locked=true;return callback();
      }catch(error){callbackError=error;throw error}
      finally{locked=false}
    })}catch(error){if(error===callbackError)throw error;throw fail('无法取得客户保存锁，原记录和当前输入已保留',error)}
  }
  return {key, read, save, saveState, restore, run, get hasSavedState(){return loaded&&previous!==null}, get locked(){return locked}};
});
