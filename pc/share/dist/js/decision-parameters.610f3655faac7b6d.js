/* Independent decision settings; no changes to other business stores. */
window.PCDecisionModel = (() => {
  const definitions = [
    {key:'disableWechat', group:'加微', label:'停用微信日限额', period:'day', value:5, enabled:true},
    {key:'replaceConsultant', group:'加微', label:'微信更换在职咨询日限额', period:'day', value:2, enabled:true},
    {key:'newCustomerWechat', group:'加微', label:'新增新客加微记录日限额', period:'day', value:null, enabled:false},
    {key:'existingCustomerWechat', group:'加微', label:'新增老客加微记录日限额', period:'day', value:null, enabled:false},
    {key:'skipPhoneCheck', group:'空号控制', label:'跳过空手机号验证月限额', period:'month', value:3, enabled:true},
    {key:'phoneCheckValidity', group:'空号控制', label:'跳过空手机号验证有效期', unit:'天', value:12},
    {key:'changePhone', group:'手机号管理', label:'修改手机号日限额', period:'day', value:null, enabled:false}
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({schema:1, revision:0, parameters:Object.fromEntries(definitions.map(item => [item.key,
    item.period ? {enabled:item.enabled, value:item.value} : {value:item.value}]))});
  function validateParameter(key, parameter) {
    const item = definitions.find(item => item.key === key);
    if (!item || !parameter || typeof parameter !== 'object' || Array.isArray(parameter)) throw Error('决策参数格式无效');
    const value = parameter.value;
    if (item.period) {
      if (typeof parameter.enabled !== 'boolean') throw Error(item.label+'的启用状态无效');
      if (value === null && !parameter.enabled) return copy(parameter);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value*100-Math.round(value*100)) > 1e-8)
        throw Error(item.label+'的百分比须为 0–100，最多两位小数');
    } else if (!Number.isSafeInteger(value) || value < 1) throw Error(item.label+'须为正整数天数');
    return copy(parameter);
  }
  function validate(data) {
    if (data?.schema !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.parameters || typeof data.parameters !== 'object' || Array.isArray(data.parameters))
      throw Error('决策参数数据格式不兼容，原数据已保留');
    definitions.forEach(item => validateParameter(item.key, data.parameters[item.key]));
    return copy(data);
  }
  function limit(data, key, activeMembers) {
    const item = definitions.find(item => item.key === key);
    if (!item?.period) throw Error('该参数不是额度配置');
    const parameter = validateParameter(key, data.parameters[key]);
    if (!parameter.enabled) return null;
    if (!Number.isSafeInteger(activeMembers) || activeMembers < 0) throw Error('管理在职成员数须为非负整数');
    const product = activeMembers * Math.round(parameter.value * 100);
    if (!Number.isSafeInteger(product)) throw Error('管理在职成员数超出可计算范围');
    return Math.round(product / 10000);
  }
  return {definitions, copy, defaults, validate, validateParameter, limit};
})();

;
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
    M.validateParameter(key, parameter);
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

;
window.PCModules['decision-parameters'] = (() => {
  const M = PCDecisionModel, S = PCDecisionStorage;
  const action = "PCModules['decision-parameters']";
  let saved, drafts = {}, busy = false, active = false, failure = '', channel;
  const ready = Promise.resolve().then(initialize);
  async function initialize() {
    try { saved = await S.read(); failure = ''; }
    catch (error) { failure = error.message || String(error); }
    try {
      channel = new BroadcastChannel('weid.pc.decision-parameters');
      channel.onmessage = () => {
        if (!active) return;
        if (busy || Object.keys(drafts).length) toast('其他页面已更新决策参数，请取消编辑并刷新后重试');
        else refresh();
      };
    } catch {}
  }
  function row(item) {
    const draft = drafts[item.key], parameter = draft || saved.parameters[item.key], editing = !!draft;
    const id = 'decision-'+item.key, call = method => action+'.'+method+'('+JSON.stringify(item.key)+')';
    const toggle = item.period ? switcher(parameter.enabled, call('toggle'), '启用'+item.label) : '';
    const input = '<input class="pc-control" id="'+id+'" name="value" type="number" min="'+(item.period?'0':'1')+'" '+
      (item.period?'max="100" step="0.01"':'step="1"')+' aria-label="'+item.label+(item.period?'百分比':'天数')+'" placeholder="待设置" value="'+
      esc(parameter.value ?? '')+'" '+(!editing?'disabled':'')+' oninput="'+esc(action+'.input('+JSON.stringify(item.key)+', this.value)')+'">';
    const button = (label, method, mark, danger = false) => '<button type="button" class="btn text pc-icon-only" aria-label="'+label+'" title="'+label+'" onclick="'+esc(call(method))+'">'+
      (danger ? icon(mark).replace('<svg ', '<svg style="color:var(--pc-danger)" ') :
        mark === 'edit' ? icon(mark).replace('<svg ', '<svg style="width:14px;height:14px" ') : icon(mark))+'</button>';
    const controls = editing ? '<button type="submit" class="btn text pc-icon-only" aria-label="保存" title="保存">'+icon('check')+'</button>'+button('取消','cancel','close',true) : button('编辑','edit','edit');
    return '<form class="decision-row" data-key="'+item.key+'" onsubmit="event.preventDefault();'+esc(call('save'))+'">'+
      '<fieldset class="decision-fields" '+(busy?'disabled':'')+'>'+toggle+
      '<label class="decision-label" for="'+id+'">'+item.label+(item.period?'（四舍五入）':'')+'</label>'+
      '<div class="decision-value">'+(item.period?'<span>＝ 管理在职成员数 ×</span>':'')+
      '<div class="input-with-unit">'+input+'<span>'+(item.period?'%':'天')+'</span></div></div>'+
      '<div class="actions">'+controls+'</div></fieldset></form>';
  }
  function paint() {
    if (!active) return;
    const refreshButton = '<button class="btn primary" onclick="'+esc(action+'.refresh()')+'" '+(busy?'disabled':'')+'>刷新</button>';
    const message = failure ? '<p class="decision-error" role="alert">'+esc(failure)+'</p>' : '';
    const groups = saved ? [...new Set(M.definitions.map(item => item.group))].map(group =>
      '<section class="decision-group" aria-label="'+group+'"><h3>'+group+'</h3>'+M.definitions.filter(item => item.group === group).map(row).join('')+'</section>').join('') : '';
    document.querySelector('#main').innerHTML = '<div class="pc-page-decision-parameters">'+
      contentModule('决策参数','<div class="panel-body">'+message+groups+'</div>',refreshButton)+'</div>';
  }
  function focus(key, editing = true) {
    const row = document.querySelector('.decision-row[data-key="'+key+'"]');
    (editing ? row?.querySelector('input[name="value"]') : row?.querySelector('.actions button'))?.focus();
  }
  function edit(key) {
    if (busy || !saved) return;
    drafts[key] = M.copy(saved.parameters[key]); paint(); focus(key);
  }
  function input(key, value) {
    if (drafts[key]) drafts[key].value = value === '' ? null : Number(value);
  }
  function cancel(key) {
    if (busy) return;
    delete drafts[key]; failure = ''; paint(); focus(key, false);
  }
  async function commit(key, parameter) {
    if (busy) return;
    try { M.validateParameter(key, parameter); }
    catch (error) { failure = error.message; paint(); focus(key); return; }
    busy = true; failure = ''; paint();
    try {
      const next = await S.save(key, parameter, saved.revision);
      saved = next; delete drafts[key];
      try { channel?.postMessage(next.revision); } catch {}
      if (active) toast('决策参数已保存');
    } catch (error) { failure = '保存失败：'+(error.message || String(error)); }
    finally { busy = false; paint(); if (active) focus(key, !!drafts[key]); }
  }
  function save(key) { if (drafts[key]) return commit(key, M.copy(drafts[key])); }
  function toggle(key) {
    if (busy) return;
    if (drafts[key]) { drafts[key].enabled = !drafts[key].enabled; paint(); return; }
    const parameter = M.copy(saved.parameters[key]); parameter.enabled = !parameter.enabled;
    if (parameter.enabled && parameter.value === null) {
      drafts[key] = parameter; paint(); focus(key); return;
    }
    return commit(key, parameter);
  }
  async function refresh() {
    if (busy) return;
    if (Object.keys(drafts).length) { toast('请先保存或取消正在编辑的参数'); return; }
    busy = true; paint();
    try { saved = await S.read(); failure = ''; }
    catch (error) { failure = '刷新失败：'+(error.message || String(error)); }
    finally { busy = false; paint(); }
  }
  return {ready, render() { active = true; paint(); if (saved && !Object.keys(drafts).length) refresh(); },
    redraw:paint, edit, input, cancel, save, toggle, refresh,
    leave() { active = false; drafts = {}; failure = ''; }};
})();
