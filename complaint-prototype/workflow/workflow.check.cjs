// Run with NODE_PATH pointing to a Playwright installation. Uses an isolated browser profile.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');
const E = require('./engine');
const KEY = 'meiye.complaint.reference.v4';
const root = path.resolve(__dirname, '../..');
const url = pathToFileURL(path.join(__dirname, 'index.html')).href;
const output = path.join(root, 'artifacts/complaint-sync-20260930');
const seed = () => E.seed();
(async () => {
  const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
  try {
    const context = await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url);
    async function load(state, route='#/tickets') {
      await page.evaluate(({key,state}) => localStorage.setItem(key, JSON.stringify(state)), {key:KEY,state});
      await page.goto(url + route);
      await page.reload();
      await page.waitForSelector('#app > *');
    }
    const state = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
    const current = async id => (await state()).tickets.find(t => t.id === id);
    const action = name => page.locator(`#modal-root [data-action=${name}], .drawer-footer [data-action=${name}], .mobile-footer [data-action=${name}], .page-head [data-action=${name}], .mobile-top [data-action=${name}]`).first().click();
    const set = (name,value) => page.locator(`#modal-root [name="${name}"]`).fill(value);
    async function submit(type) {
      const form = page.locator(`[data-form="${type}"]`);
      assert(await form.evaluate(el => el.checkValidity()), 'Invalid form: '+type);
      await form.locator('[type=submit]').click();
      await page.waitForTimeout(100);
      assert.equal(await page.locator('.error-inline').count(), 0, await page.locator('.error-slot').allTextContents());
    }
    await load(seed());
    assert.equal(await page.locator('.tickets-table tbody tr').count(),8);
    await page.locator('#filter-form [name=q]').fill('13800001002');
    await page.locator('#filter-form [type=submit]').click();
    assert((await page.locator('.tickets-table tbody tr').count()) > 0);
    assert((await page.locator('.tickets-table tbody').innerText()).includes('林女士'));
    await page.locator('[data-action=resetFilters]').click();
    await page.locator('[data-action=moreFilters]').click();
    await page.locator('#filter-form [name=state]').selectOption('已结案');
    await page.locator('#filter-form [type=submit]').click();
    assert.equal(await page.locator('.tickets-table tbody tr').count(),1);
    await page.locator('[data-action=resetFilters]').click();
    await page.locator('[data-action=page][data-id="2"]').first().click();
    assert.equal(await page.locator('.tickets-table tbody tr').count(),4);
    console.log('PASS: PC keyword/status filters, reset and pagination');

    await action('create');
    await set('phone','13800001001');
    assert((await page.locator('#duplicate-candidates').innerText()).includes('发现关联工单'));
    await set('description','新的来电补充记录');
    const old = await state(), originalId = old.tickets[0].id;
    await page.locator(`[data-action=appendExisting][data-id="${originalId}"]`).click();
    await page.waitForTimeout(100);
    assert.equal((await state()).tickets.length,old.tickets.length);
    assert((await current(originalId)).sources.some(x => x.content === '新的来电补充记录'));
    console.log('PASS: intake duplicate detection and append to original ticket');

    await load(seed());
    await action('create');
    await set('name','测试客户');await set('phone','13912345678');await set('title','一级服务沟通');await set('description','预约时间需要重新协调');
    await page.locator('[data-form=create] [name=level]').selectOption('1');
    await submit('create');
    let created=(await state()).tickets[0],id=created.id;
    assert.equal(created.state,'待首联');assert.equal(created.owner,'li');
    await page.goto(url+'#/mobile/'+id);await page.waitForSelector('.mobile-footer');
    await action('follow');await set('content','已与客户确认新的服务安排');await submit('follow');assert.equal((await current(id)).state,'处理中');
    await action('complete');await set('note','已完成预约协调并告知客户');await submit('complete');assert.equal((await current(id)).state,'待回访');
    await action('review');await set('note','客户认可本次处理');await submit('review');assert.equal((await current(id)).state,'已结案');
    await page.reload();assert((await page.locator('.mobile-content').innerText()).includes('已结案'));
    await action('repeat');await set('note','同一事项再次反馈');await submit('repeat');
    const repeated=(await state()).tickets[0];assert.notEqual(repeated.id,id);assert(repeated.related.includes(id));assert(repeated.repeat);
    console.log('PASS: PC create → H5 first contact → resolution → review → persistent closure → repeat complaint');

    let s=seed();id=s.tickets[1].id;await load(s,'#/tickets/'+id);
    await action('follow');await set('content','客户同意退还部分未使用项目');await submit('follow');
    await action('proposal');await set('refund','100');await set('content','未使用项目退款100元');
    await page.locator('[data-action=previewMatch]').click();assert((await page.locator('#match-preview').innerText()).includes('审批'));
    await submit('proposal');assert.equal((await current(id)).state,'待方案审批');
    await page.goto(url+'#/mobile/'+id);await page.waitForSelector('.mobile-footer');
    await action('reject');await set('note','补充订单核实依据');await submit('reject');assert.equal((await current(id)).state,'处理中');
    await action('proposal');await set('refund','100');await set('content','已补充订单凭证，申请退款100元');await submit('proposal');
    let loops=0;while((await current(id)).state==='待方案审批' && loops++<5){await action('approve');await set('note','核实后同意');await submit('approve');}
    assert.equal((await current(id)).state,'待打款');
    await action('pay');await page.locator('[name=result]').selectOption('失败');await set('reason','支付渠道暂不可用');await submit('pay');assert.equal((await current(id)).state,'待打款');
    await action('pay');await set('reference','CHECK-REFUND-100');await page.locator('[name=proof]').setInputFiles({name:'付款凭证.txt',mimeType:'text/plain',buffer:Buffer.from('测试付款成功凭证')});await submit('pay');assert.equal((await current(id)).state,'待回访');
    await action('review');await set('note','客户确认退款到账');await submit('review');assert.equal((await current(id)).state,'已结案');
    const funded=await current(id);assert.equal(funded.payments.filter(x=>x.result==='成功').length,1);assert(funded.approvalHistory.length);
    console.log('PASS: proposal preview → rejection/revision → H5 approval → failed payment/retry with proof → closure');

    s=seed();id=s.tickets[0].id;await load(s,'#/mobile/'+id);
    await action('risk');await set('note','负责人已联系客户并记录风险处置');await submit('risk');assert((await current(id)).riskAccepted);
    await load(seed(),'#/mobile');await page.locator('[aria-label="筛选工单"]').click();await page.locator('[data-form=mobileFilters] [name=state]').selectOption('待方案审批');await submit('mobileFilters');assert.equal(await page.locator('.mobile-ticket').count(),1);
    await page.locator('.mobile-ticket').click();await page.waitForSelector('.mobile-footer [data-action=approve]');assert.equal(await page.locator('.mobile-top strong').innerText(),'钉钉审批详情');
    console.log('PASS: risk response, mobile filters and DingTalk approval entry');

    // Same-origin standalone windows share local state and refresh each other.
    await load(seed(),'#/tickets');const other=await page.context().newPage();await other.goto(url+'#/mobile');
    await action('create');await set('name','跨端同步客户');await set('phone','13912345001');await set('title','跨窗口同步验证');await set('description','同步列表状态');await submit('create');
    await other.waitForFunction(()=>S.tickets.some(t => t.title === '跨窗口同步验证'));
    await other.locator('[data-form=mobileSearch] [name=q]').fill('跨窗口同步验证');
    await other.locator('[data-form=mobileSearch] [type=submit]').click();
    assert((await other.locator('.mobile-ticket').innerText()).includes('跨窗口同步验证'));
    await other.close();console.log('PASS: local-file PC/H5 storage synchronization');

    fs.mkdirSync(output,{recursive:true});
    await page.goto(pathToFileURL(path.join(root,'zuhu.html')).href+'#complaint-tickets');await page.waitForTimeout(400);
    let f=page.frames().find(f=>f.url().includes('workflow/index')&&f.url().includes('page=tickets'));
    assert(page.frames().some(frame => frame.url().includes('complaint-prototype/index.html') && frame.url().includes('page=rules')), 'Rules must keep the original implementation');
    assert(page.frames().some(frame => frame.url().includes('complaint-prototype/demo.html')), 'Demo must keep its original implementation');
    assert(f);assert.equal(await f.locator('.page-head h1').innerText(),'客诉工单');
    await page.screenshot({path:path.join(output,'pc.png')});
    await f.locator('[data-action=create]').click();await page.waitForTimeout(250);await page.screenshot({path:path.join(output,'create.png')});await f.locator('[data-action=closeModal]').first().click();
    await f.evaluate(() => { location.hash = '#/demo/approval'; });await page.waitForTimeout(150);await page.screenshot({path:path.join(output,'approval.png')});
    for(const width of [390,320]){
      await page.setViewportSize({width,height:844});await page.reload();await page.waitForTimeout(300);
      f=page.frames().find(f=>f.url().includes('workflow/index')&&f.url().includes('page=tickets'));
      assert.equal(await f.evaluate(()=>location.hash),'#/mobile');
      assert(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      if(width===390)await page.screenshot({path:path.join(output,'mobile.png')});
      await f.evaluate(() => { location.hash = '#/demo/approval'; });await page.waitForTimeout(100);
      assert(await f.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
      await f.locator('.mobile-footer [data-action=approve]').click();
      assert(await f.locator('[data-form=approve] [type=submit]').isVisible());
      if(width===390)await page.screenshot({path:path.join(output,'mobile-approval.png')});
    }
    assert.deepEqual(errors,[]);
    console.log('PASS: host navigation, original blue theme, 390px/320px layouts and mobile approval form; no uncaught JS errors');
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
