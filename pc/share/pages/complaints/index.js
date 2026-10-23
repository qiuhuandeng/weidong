/* Route lifecycle; the complaint workflow stays in ./business.js. */
window.PCModules.complaints = {
  render() {
    document.body.classList.remove('approval-h5');
    document.querySelector('#main').innerHTML = '<div class="ub-workspace"><div id="pc-complaints"></div></div><div class="app-footer">WEID微动 · 示例数据</div>';
    PCComplaints.mount(document.querySelector('#pc-complaints'));
  },
  leave() { PCComplaints.leave(); }
};
