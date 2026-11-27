window.PCDecisionStorage = (() => {
  const M = PCDecisionModel;
  let connection;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      let request;
      try { request = indexedDB.open('weid-pc-decision-parameters-v1', 1); }
      catch (error) { reject(error); return; }
      let settled = false;
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onerror = () => { settled = true; reject(request.error || Error('决策参数数据库无法打开')); };
      request.onblocked = () => { settled = true; reject(Error('决策参数数据库被旧页面占用，请关闭旧页面后重试')); };
      request.onsuccess = () => {
        const db = request.result;
        if (settled) { db.close(); return; }
        settled = true;
        db.onversionchange = () => { db.close(); connection = null; };
        resolve(db);
      };
    }).catch(error => { connection = null; throw error; });
    return connection;
  }
  async function read() {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readonly'), request = tx.objectStore('settings').get('parameters');
      tx.oncomplete = () => {
        try { resolve(request.result === undefined ? M.defaults() : M.validate(request.result)); }
        catch (error) { reject(error); }
      };
      tx.onabort = tx.onerror = () => reject(tx.error || request.error || Error('决策参数读取失败'));
    });
  }
  async function save(key, parameter, expectedRevision) {
    parameter = M.validateParameter(key, parameter);
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite'), store = tx.objectStore('settings'), request = store.get('parameters');
      let next, cause;
      request.onsuccess = () => {
        try {
          next = request.result === undefined ? M.defaults() : M.validate(request.result);
          if (next.revision !== expectedRevision) throw Error('其他页面已更新决策参数。当前修改已保留，请取消编辑并刷新后重试');
          next.parameters[key] = M.copy(parameter);
          next.revision++;
          M.validate(next);
          store.put(next, 'parameters');
        } catch (error) { cause = error; tx.abort(); }
      };
      tx.oncomplete = () => resolve(M.copy(next));
      tx.onabort = tx.onerror = () => reject(cause || tx.error || request.error || Error('决策参数保存失败'));
    });
  }
  return {read, save};
})();
