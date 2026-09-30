/* Host integration only; the reference workflow lives in app.js / engine.js. */
(function () {
  'use strict';
  const originalRender = render;
  const originalRoleSelect = roleSelect;
  roleSelect = function () {
    return document.body.classList.contains('embedded') || mobile() ? '' : originalRoleSelect().replace('href="#/demo"', 'href="../demo.html?v=20260930-directory"');
  };
  render = function () {
    originalRender();
    const route = location.hash;
    const isMobile = route.startsWith('#/mobile');
    const current = ticket(route.split('/')[2]);
    const approval = isMobile && current?.state === '待方案审批';
    document.body.classList.toggle('workflow-mobile', isMobile);
    document.body.classList.toggle('workflow-portal', route === '#/demo');
    if (approval) document.querySelector('.mobile-top strong').textContent = '钉钉审批详情';
    const title = document.querySelector('.page-head h1');
    if (title?.textContent === '工单列表') title.textContent = '客诉工单';
    document.querySelectorAll('a[href="#/rules"]').forEach(el => el.href = '../index.html?v=20260929-filefix2&view=pc&actor=manager&page=rules');
    document.querySelectorAll('.brand strong').forEach(el => el.textContent = '美业AI平台');

  };
  document.addEventListener('click', event => {
    if (!event.target.closest('[data-demo-return]')) return;
    event.preventDefault();parent.postMessage({type:'complaint-demo-return'}, '*');
  });
  render();
})();
