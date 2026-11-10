/* Route lifecycle; the complaint workflow stays in ./business.js. */
window.PCModules.complaints = {
  render() {
    document.body.classList.remove('approval-h5');
    document.querySelector('#main').innerHTML = '<div class="ub-workspace"><div id="pc-complaints"></div></div><div class="app-footer">WEID微动 · 示例数据</div>';
    const customerId=new URLSearchParams(location.hash.split('?')[1]||'').get('customer');
    PCComplaints.mount(document.querySelector('#pc-complaints'),{customerId});
  },
  leave() { PCComplaints.leave(); }
};
window.PCModules.complaints.ready = PCComplaintOptions.refresh();
