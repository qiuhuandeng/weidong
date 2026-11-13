/* Preserve existing customer records when reading, decoding or saving fails. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PCCustomerStorage = factory(() => root.localStorage);
})(globalThis, function (getStorage) {
  'use strict';
  const key = 'weidong-correction-prototype-v1';
  let loaded = false, previous;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message, cause) {
    return new Error(message + (cause?.message ? '：' + cause.message : ''), {cause});
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
    loaded = true;
    return value;
  }
  function save(text) {
    if (!loaded) throw Error('客户数据尚未成功读取，已阻止保存');
    try {
      const storage = getStorage();
      if (storage.getItem(key) !== previous) throw Error('其他页面已更新客户数据，请刷新后重新操作');
      storage.setItem(key, text);
      previous = text;
    } catch (error) {
      throw fail('客户数据未保存，原记录和当前填写内容已保留', error);
    }
  }
  return {key, read, save};
});
