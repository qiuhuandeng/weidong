/* Welcome route; all navigation and appearance use the shared PC shell. */
window.PCModules.home = {
  render() {
    document.querySelector('#main').innerHTML = '<section class="panel pc-welcome" aria-label="欢迎首页">' +
      '<div class="pc-welcome-content"><div class="pc-welcome-mark" aria-hidden="true">'+icon('layers')+'</div>' +
      '<h1 class="pc-welcome-title">欢迎使用 <span>WEID微动</span></h1>' +
      '<p class="pc-welcome-description">从左侧菜单开始今天的工作</p></div></section>';
  }
};
