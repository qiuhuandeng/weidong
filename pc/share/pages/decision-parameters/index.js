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
