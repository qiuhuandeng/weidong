/* New PC module: define business data/actions here; reuse shared UI and router.
 * No separate theme is needed for a standard search/table page.
 * Do not import vendor libraries, copy the navigation or add hash listeners. */
window.PCModules[__MODULE_KEY__] = (() => {
  const moduleName = __MODULE_KEY__;
  const title = __PAGE_TITLE__;
  const state = { keyword: '' };
  const records = []; // Supply this module's business data; escape user text with esc().
  const action = method => 'PCModules[' + JSON.stringify(moduleName) + '].' + method + '()';
  // Register synchronously, then initialize. The loader awaits ready and displays
  // its rejection reason. Never write persistent business data at module top level.
  const ready = Promise.resolve().then(initialize);

  async function initialize() {
    // Load business data here when needed. Use IndexedDB for growing records;
    // migrate existing data once and update UI state only after a successful commit.
    // See the spec's initialization/storage section and tools/test_loading.cjs.
  }

  function render() {
    const rows = records.filter(row => !state.keyword || String(row.name).includes(state.keyword));
    document.querySelector('#main').innerHTML = '<div class="pc-page-__MODULE_NAME__">' +
      queryModule('<input id="pc-__MODULE_NAME__-keyword" class="search" placeholder="搜索名称" value="' + esc(state.keyword) + '">', action('search'), action('reset')) +
      contentModule(esc(title), table(['序号', '名称'], rows.map((row, index) => [index + 1, esc(row.name)]))) + '</div>';
    // The shared adapter mounts real ByForm / ByCommonInput / ByTable instances.
  }

  return {
    ready,
    render,
    search() {
      state.keyword = document.querySelector('#pc-__MODULE_NAME__-keyword').value.trim();
      render();
    },
    reset() { state.keyword = ''; render(); },
    leave() {
      // Release listeners, timers and requests owned by this module when added.
      // Parent/child drafts and pagination must be scoped to this module's state.
    }
  };
})();
