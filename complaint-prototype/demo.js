(function () {
  'use strict';
  const embedded = new URLSearchParams(location.search).get('embed') === '1' && parent !== window;
  document.body.classList.toggle('embedded', embedded);
  const paths = {
    mobile:'M7 2h10v20H7zM11 18h2',
    check:'m5 12 4 4 10-10', bell:'M6 9a6 6 0 0112 0v6l2 3H4l2-3V9M10 21h4',
    phone:'M5 3h4l2 5-3 2c2 3 3 4 6 6l2-3 5 2v4c-1 5-18-9-16-16',
    ticket:'M6 3h12v18H6zM9 8h6M9 12h6M9 16h4',
    shield:'M12 3 3 7v5c0 5 9 9 9 9s9-4 9-9V7zM12 8v5M12 16v1',
    repeat:'M20 7V3l-3 3a8 8 0 1 0 3 11M20 3h-5', arrow:'m9 5 7 7-7 7'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]}"/></svg>`;
  const url = route => 'workflow/index.html?view=h5' + route;
  const entries = [
    ['mobile', '移动工单', '移动端', '搜索筛选 · 移动填单 · 随时跟进', 'mobile', '#/mobile'],
    ['approval', '钉钉审批', '钉钉 H5', '处理方案 · 审批意见 · 审批记录', 'check', '#/demo/approval'],
  ];
  document.getElementById('entry-links').innerHTML = entries.map(([id,title,device,desc,symbol,route]) => `<article class="directory-card"><a class="directory-page-link" data-demo-entry="${id}" target="_blank" rel="noopener" href="${url(route)}"><span class="directory-icon">${icon(symbol)}</span><span class="directory-device">${device}</span><h3>${title}</h3><p>${desc}</p><span class="directory-arrow">${icon('arrow')}</span></a>${id==='mobile'?'<a class="directory-external" href="workflow/index.html?view=h5#/mobile" target="_blank" rel="noopener">独立打开 H5 ↗</a>':''}</article>`).join('');
  const scenes = [
    ['first','首次联系客户','移动端','phone'], ['store','门店处理详情','移动端','ticket'],
    ['follow','售后跟进详情','移动端','ticket'], ['payment','财务打款详情','钉钉 H5','check'],
    ['review','回访确认详情','移动端','phone'], ['risk','四级风险处置','移动端','shield'],
    ['repeat','重复投诉详情','移动端','repeat'], ['closed','已结案详情','移动端','check']
  ];
  document.getElementById('scene-links').innerHTML = scenes.map(([id,title,device,symbol]) => `<a class="directory-scene" data-demo-entry="${id}" target="_blank" rel="noopener" href="${url('#/demo/'+id)}"><span class="directory-icon">${icon(symbol)}</span><span class="grow"><span class="directory-device">${device}</span><h3>${title}</h3></span>${icon('arrow')}</a>`).join('');
})();
