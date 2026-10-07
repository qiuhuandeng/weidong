/* Eight lifecycle states, verified through the main PC entry and mobile pages. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=file=>pathToFileURL(path.resolve(__dirname,file)).href;
const states=['待处理','处理中','审批中','付款办理','采购办理','待结案','已挂起','已结案'];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),errors=[];
  context.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
  const page=await context.newPage();await page.goto(url('../index.html')+'#complaint-tickets',{waitUntil:'domcontentloaded'});
  const f=page.frameLocator('#page-complaint-tickets iframe');await f.locator('.tickets-table').waitFor();
  const original=await f.locator('body').evaluate(()=>ComplaintStore.load());
  assert.deepEqual(await f.locator('#filter-form [name=state] option').allTextContents(),['全部状态',...states]);
  for(const state of states){
   await f.locator('#filter-form [name=state]').selectOption(state);await f.locator('#filter-form [type=submit]').click();
   const badges=await f.locator('.tickets-table tbody tr td:nth-child(5) > .pill').allTextContents();assert(badges.length>0,state);assert(badges.every(x=>x===state));
   if(['付款办理','采购办理'].includes(state))await page.screenshot({path:'/tmp/complaint-eight-states-pc-'+state+'.png'});
  }
  await f.locator('#filter-form [name=state]').selectOption('');
  const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});
  const cases=[['W04','待处理','confirmGrading'],['P39','处理中','follow'],['P10','处理中','finishStore'],['D01','审批中','externalApproval'],['D02','付款办理','pay'],['D03','审批中','externalApproval'],['D04','处理中','proposal'],['D05','处理中','amendProcurement'],['D17','采购办理','finishProcurement'],['D18','采购办理','finishProcurement'],['D15','待结案','closeTicket'],['H02','已挂起','resumeTicket'],['D16','已结案','']];
  for(const [suffix,state,action] of cases){
   const id='KS20261007-'+suffix;
   await f.locator('#filter-form [name=q]').fill(id);await f.locator('#filter-form [type=submit]').click();await f.locator('[data-action=detail][data-id="'+id+'"]').click();
   assert.equal(await f.locator('.pc-ticket-badges>.pill').first().innerText(),state,id);if(action)await f.locator('.pc-footer-actions [data-action='+action+']').waitFor();
   if(state==='审批中')assert.equal(await f.locator('[data-action=pay],[data-action=finishProcurement]').count(),0);
   if(suffix==='D17')await page.screenshot({path:'/tmp/complaint-eight-states-pc-detail.png'});
   await f.getByRole('button',{name:'关闭详情',exact:true}).click();
   await mobile.goto(url('workflow/index.html')+'?view=h5#/mobile/'+id,{waitUntil:'domcontentloaded'});await mobile.locator('.mobile-overview .mobile-state').waitFor();
   assert.equal(await mobile.locator('.mobile-overview .mobile-state').innerText(),state,id);if(action)await mobile.locator('.mobile-detail-footer [data-action='+action+']').waitFor();
   if(state==='审批中')assert.equal(await mobile.locator('[data-action=pay],[data-action=finishProcurement]').count(),0);
   assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   if(suffix==='D18')await mobile.screenshot({path:'/tmp/complaint-eight-states-h5-detail.png'});
  }
  await mobile.goto(url('workflow/index.html')+'?view=h5#/mobile',{waitUntil:'domcontentloaded'});
  for(const state of states){
   await mobile.locator('[data-action=mobileFilter]').click();const form=mobile.locator('[data-form=mobileFilters]');
   assert.deepEqual(await form.locator('[name=state] option').allTextContents(),['全部状态',...states]);await form.locator('[name=state]').selectOption(state);await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});
   const badges=await mobile.locator('.mobile-ticket .mobile-state').allTextContents();assert(badges.length>0,state);assert(badges.every(x=>x===state));
   if(['付款办理','采购办理'].includes(state))await mobile.screenshot({path:'/tmp/complaint-eight-states-h5-'+state+'.png'});
  }
  await mobile.setViewportSize({width:320,height:700});assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const directory=await context.newPage();await directory.goto(url('demo.html'),{waitUntil:'domcontentloaded'});await directory.locator('.directory-state-group').first().waitFor();assert.deepEqual(await directory.locator('.directory-state-group h2').allTextContents(),states);
  for(const [suffix,state] of [['D02','付款办理'],['D03','审批中'],['D17','采购办理'],['D18','采购办理']]){
   const link=directory.locator('a[href$="/KS20261007-'+suffix+'"]');assert.equal(await link.count(),1);assert.equal(await link.locator('xpath=ancestor::section[1]').locator('h2').innerText(),state);
  }
  assert.deepEqual(await f.locator('body').evaluate(()=>ComplaintStore.load()),original);
  // Completing the remaining goods moves procurement to closure, and the directory follows the saved state.
  await mobile.setViewportSize({width:390,height:844});await mobile.goto(url('workflow/index.html')+'?view=h5#/mobile/KS20261007-D18',{waitUntil:'domcontentloaded'});
  await mobile.getByRole('button',{name:'采购发货',exact:true}).click();const shipment=mobile.locator('[data-form=finishProcurement]');await shipment.locator('[name=method]').selectOption('门店发货');await shipment.locator('[type=submit]').click();await shipment.waitFor({state:'detached'});
  assert.equal(await mobile.locator('.mobile-overview .mobile-state').innerText(),'待结案');assert.equal(await mobile.locator('[data-action=finishProcurement]').count(),0);
  await mobile.reload({waitUntil:'domcontentloaded'});assert.equal(await mobile.locator('.mobile-overview .mobile-state').innerText(),'待结案');
  await directory.reload({waitUntil:'domcontentloaded'});assert.equal(await directory.locator('a[href$="/KS20261007-D18"]').locator('xpath=ancestor::section[1]').locator('h2').innerText(),'待结案');
  await mobile.getByRole('button',{name:'确认结案',exact:true}).click();const close=mobile.locator('[data-form=closeTicket]');await close.locator('[name=note]').fill('客户已收到全部商品，处理完成。');await close.locator('[name=completed]').check();await close.locator('[type=submit]').click();await close.waitFor({state:'detached'});assert.equal(await mobile.locator('.mobile-overview .mobile-state').innerText(),'已结案');
  assert.deepEqual(errors,[]);console.log('PASS PC/H5 eight-state filters; approval/payment/procurement/return/closure/suspension details and actions; no premature shipping or payment; dynamic directory groups; procurement completion and persisted closure; read-only browsing; 320px layout.');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
