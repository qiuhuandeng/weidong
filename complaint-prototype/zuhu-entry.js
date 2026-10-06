(function () {
  'use strict';
  function mount() {
    if (document.getElementById('complaint-nav')) return;
    const sidebar = document.querySelector('.sidebar');
    const content = document.querySelector('.main > .content');
    if (!sidebar || !content || typeof window.showPage !== 'function') return;
    const entries = [
      ['complaint-tickets', '客诉工单', 'tickets'],
      ['complaint-rules', '规则配置', 'rules'],
      ['complaint-demo', '演示入口', 'demo']
    ];
    const entryURL=entry=>entry[2]==='tickets'?'complaint-prototype/workflow/index.html?v=20261006-unified&embed=1&page=tickets':entry[2]==='demo'?'complaint-prototype/demo.html?v=20260930-mobile-only&embed=1':'complaint-prototype/index.html?v=20261006-unified&embed=1&view=pc&actor=manager&page='+entry[2];
    const section = document.createElement('div');
    section.className = 'nav-section'; section.id = 'complaint-nav';
    section.innerHTML = '<div class="nav-group-title" onclick="toggleNavSection(this)"><span>客诉管理</span><span class="nav-group-arrow">⌄</span></div>' + entries.map(function (entry) {
      return '<div class="nav-item" role="button" tabindex="0" onclick="showPage(\'' + entry[0] + '\')"><span class="nav-icon"><svg viewBox="0 0 24 24"><path d="M5 3h14v18H5zM8 8h8M8 12h8M8 16h5"/></svg></span>' + entry[1] + '</div>';
    }).join('');
    const responsive = document.createElement('style');
    responsive.textContent = '@media(max-width:760px){body:has(#page-complaint-tickets.active,#page-complaint-demo.active) .layout>.sidebar,body:has(#page-complaint-tickets.active,#page-complaint-demo.active) .main>.header,body:has(#page-complaint-tickets.active,#page-complaint-demo.active) .recent-tabs{display:none}body:has(#page-complaint-tickets.active,#page-complaint-demo.active) .main>.content{padding:0}#page-complaint-tickets.active,#page-complaint-demo.active{height:100dvh!important;min-height:0!important}}';
    document.head.appendChild(responsive);
    const first = sidebar.querySelector('.nav-section');
    if (first) first.after(section); else sidebar.appendChild(section);
    entries.forEach(function (entry) {
      const page = document.createElement('div');
      page.id = 'page-' + entry[0]; page.className = 'page';
      page.style.height = 'calc(100vh - 144px)'; page.style.minHeight = entry[2] === 'tickets' ? '480px' : '660px';
      const frame = document.createElement('iframe');
      frame.title = entry[1] + '交互原型';
      frame.src = entryURL(entry) + (entry[2] === 'tickets' && matchMedia('(max-width:760px)').matches ? '&view=h5' : '');
      frame.style.cssText = 'display:block;width:100%;height:100%;border:0;background:transparent;';
      frame.loading = 'lazy'; page.appendChild(frame); content.appendChild(page);
    });
    const ticketFrame = document.querySelector('#page-complaint-tickets iframe');
    const overlayFrames = new Map();
    window.addEventListener('message', function (event) {
      if(event.source===ticketFrame?.contentWindow && event.data?.type==='complaint-demo-return')window.showPage('complaint-demo');
      if (event.data?.type !== 'complaint-overlay-state') return;
      const frame = entries.map(entry => document.querySelector('#page-' + entry[0] + ' iframe')).find(item => item?.contentWindow === event.source);
      if (!frame) return;
      if (event.data.open && !overlayFrames.has(frame)) {
        const rect = frame.getBoundingClientRect();
        overlayFrames.set(frame, {style:frame.style.cssText, overflow:document.body.style.overflow});
        frame.contentWindow.postMessage({type:'complaint-overlay-viewport',rect:{left:rect.left,top:rect.top,width:rect.width,height:rect.height}}, '*');
        frame.style.cssText = 'display:block;position:fixed;inset:0;margin:0;padding:0;width:100vw;height:100dvh;max-width:none;max-height:none;border:0;background:transparent;z-index:2147483647;';
        if (typeof frame.showPopover === 'function') { frame.setAttribute('popover', 'manual'); frame.showPopover(); }
        document.body.style.overflow = 'hidden';
      } else if (!event.data.open && overlayFrames.has(frame)) {
        const previous = overlayFrames.get(frame);
        if (frame.hasAttribute('popover')) { frame.hidePopover(); frame.removeAttribute('popover'); }
        frame.style.cssText = previous.style;
        document.body.style.overflow = previous.overflow;
        overlayFrames.delete(frame);
        frame.contentWindow.postMessage({type:'complaint-overlay-viewport',rect:null}, '*');
      }
    });
    section.addEventListener('keydown', function (event) { if ((event.key === 'Enter' || event.key === ' ') && event.target.classList.contains('nav-item')) { event.preventDefault(); event.target.click(); } });
    if (typeof window.syncPageTitleMapFromNav === 'function') window.syncPageTitleMapFromNav();
    const oldTarget=location.hash.slice(1);
    const target=['complaint-workbench','complaint-visits','complaint-finance'].includes(oldTarget)?'complaint-tickets':oldTarget;
    if (entries.some(function (entry) { return entry[0] === target; })) window.showPage(target);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
