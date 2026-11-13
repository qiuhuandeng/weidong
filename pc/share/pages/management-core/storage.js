/* The existing PC management key and JSON format remain the source of truth. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PCManagementStorage = factory(() => root.localStorage, () => root.navigator.locks);
})(globalThis, function (getStorage, getLocks) {
  'use strict';
  const key = 'weidong-unified-backend-v1';
  let loaded = false, previous, snapshot, locked = false;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function failure(message, cause) {
    const error = new Error(message + (cause?.message ? '：' + cause.message : ''), {cause});
    error.managementStorage = true;
    return error;
  }
  function validate(value) {
    if (!object(value) || value.version !== 1 || !Array.isArray(value.history)) throw Error('数据版本或结构不兼容');
    for (const field of ['devices','employees','partners','bedTypes','bedRules','schedules','bedChanges','finance','refunds','shops','shopLogs']) {
      if (Object.hasOwn(value, field) && (!Array.isArray(value[field]) || value[field].some(row => !object(row)))) throw Error(field + ' 数据结构不兼容');
    }
    for (const field of ['allocations','storeSeats','seatColumnWidths','refundPaymentConfig']) {
      if (Object.hasOwn(value, field) && !object(value[field])) throw Error(field + ' 数据结构不兼容');
    }
    return value;
  }
  function read() {
    loaded = false;
    let raw, value;
    try { raw = getStorage().getItem(key); }
    catch (cause) { throw failure('门店数据暂时无法读取，原记录未更改，请恢复存储权限后重试', cause); }
    try { value = raw === null ? null : validate(JSON.parse(raw)); }
    catch (cause) { throw failure('门店数据无法解析，原记录已保留，请先备份并修复后重试', cause); }
    previous = raw; snapshot = value === null ? null : JSON.stringify(value); loaded = true;
    return value;
  }
  function current() {
    if (!loaded) throw failure('门店数据尚未成功读取，已阻止保存');
    try {
      if (getStorage().getItem(key) !== previous) throw Error('其他页面已更新门店数据，请刷新后重新核对');
    } catch (cause) { throw failure('门店数据未保存，原记录和当前填写内容已保留', cause); }
  }
  function save(value) {
    current();
    if (!locked) throw failure('门店数据未取得保存锁，已阻止保存');
    try {
      validate(value);
      const next = JSON.stringify(value);
      if (next === snapshot) return false;
      getStorage().setItem(key, next);
      previous = next; snapshot = next;
      return true;
    } catch (cause) { throw failure('门店数据未保存，原记录和当前填写内容已保留', cause); }
  }
  function restore() { return snapshot === null ? {version:1, history:[]} : JSON.parse(snapshot); }
  async function run(callback) {
    let entered = false;
    try {
      const locks = getLocks?.();
      if (!locks?.request) throw Error('当前浏览器不支持 Web Locks');
      return await locks.request(key, {mode:'exclusive'}, () => {
        entered = true; current(); locked = true;
        try { return callback(); } finally { locked = false; }
      });
    } catch (cause) {
      if (entered || cause.managementStorage) throw cause;
      throw failure('无法取得门店数据保存锁，原记录和当前填写内容已保留', cause);
    }
  }
  return {key, read, current, save, restore, run};
});
