/* Isolated browser session: does not modify the user's browser profile. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),{pathToFileURL}=require('node:url');
const url=file=>pathToFileURL(path.resolve(__dirname,file)).href;
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'Asia/Shanghai',reducedMotion:'reduce'}),errors=[];
  context.on('page',p=>{p.setDefaultTimeout(10000);p.on('pageerror',e=>errors.push(e.message));});
  const page=await context.newPage();await page.goto(url('../index.html')+'#complaint-tickets',{waitUntil:'domcontentloaded'});
  const pc=page.frameLocator('#page-complaint-tickets iframe');await pc.locator('.tickets-table').waitFor();
  const read=(surface,id)=>surface.locator('body').evaluate((el,id)=>ComplaintStore.load().tickets.find(t=>t.id===id),id);
  async function open(suffix){
   const close=pc.getByRole('button',{name:'关闭详情',exact:true});if(await close.count())await close.click();
   const id='KS20261007-'+suffix;await pc.locator('#filter-form [name=q]').fill(id);await pc.locator('#filter-form [type=submit]').click();await pc.locator('[data-action=detail][data-id="'+id+'"]').click();await pc.locator('.pc-footer-actions').waitFor();return id;
  }
  async function transfer(surface){
   const more=surface.locator('.ticket-more-menu');
   if(await more.count()){assert.equal(await surface.locator('.pc-footer-actions>[data-action=transferAftercare],.mobile-detail-actions>[data-action=transferAftercare]').count(),0);await more.locator('summary').click();assert(await more.getByRole('button',{name:'转派',exact:true}).isVisible());}
   await surface.getByRole('button',{name:'转派',exact:true}).click();const form=surface.locator('[data-form=transferAftercare],[data-form=transferHandling]');assert.equal(await form.locator('select[name=person]').count(),0);assert.equal(await form.locator('input[role=combobox]').count(),1);return form;
  }
  async function submit(form){await form.locator('[type=submit]').click();await form.waitFor({state:'detached'});}
  async function choose(form,query,id){const input=form.getByRole('combobox',{name:'接收人',exact:true});await input.fill(query);assert((await form.locator('.transfer-recipient-list').getByRole('option').allTextContents()).every(name=>name.includes(query)));await form.locator('[data-transfer-person="'+id+'"]').click();assert.equal(await form.locator('[name=person]').inputValue(),id);assert.equal(await input.getAttribute('aria-expanded'),'false');}
  const id=await open('P39'),original=await read(pc,id);let form=await transfer(pc);
  assert.deepEqual(await form.locator('[name=transferTarget] option').allTextContents(),['转售后其他人','转给门店']);
  await form.getByRole('combobox',{name:'接收人',exact:true}).fill('周宁');assert.equal(await form.locator('[name=person]').inputValue(),'');await form.locator('[name=note]').fill('交接办理');await form.locator('[type=submit]').click();assert(await form.isVisible());assert.equal((await read(pc,id)).owner,original.owner);await form.getByRole('combobox',{name:'接收人',exact:true}).press('ArrowDown');await form.getByRole('combobox',{name:'接收人',exact:true}).press('Enter');assert.equal(await form.locator('[name=person]').inputValue(),'zhou');await form.locator('[name=note]').fill('');await form.locator('[type=submit]').click();assert(await form.isVisible());assert.equal((await read(pc,id)).owner,original.owner);
  await form.locator('[name=note]').fill('当前同事繁忙，由周宁接手');await submit(form);assert.equal((await read(pc,id)).owner,'zhou');assert.equal((await read(pc,id)).currentAssignee,'zhou');
  form=await transfer(pc);await form.locator('[name=transferTarget]').selectOption('store');assert.equal(await form.locator('[name=store]').inputValue(),'');
  await form.getByRole('combobox',{name:'接收人',exact:true}).click();const recipients=await form.locator('.transfer-recipient-list').getByRole('option').allTextContents();assert(recipients.some(v=>v.includes('南京浦口店')));assert(recipients.some(v=>v.includes('上海徐汇店')));
  await choose(form,'林薇','advisor1');await form.locator('[name=store]').selectOption('上海徐汇店');assert.equal(await form.locator('[name=person]').inputValue(),'');await form.getByRole('combobox',{name:'接收人',exact:true}).click();assert(!(await form.locator('.transfer-recipient-list').getByRole('option').allTextContents()).some(v=>v.includes('林薇')));
  await form.locator('[name=store]').selectOption('');await choose(form,'林薇','advisor1');await form.locator('[name=note]').fill('请门店顾问核实服务记录');await form.locator('[name=note]').focus();await page.screenshot({path:'/tmp/complaint-transfer-pc-20261014.png'});await submit(form);
  let t=await read(pc,id);assert.equal(t.owner,'zhou');assert.equal(t.currentAssignee,'advisor1');assert.equal(t.store,'上海徐汇店');assert.equal(t.storeAssistance.store,'南京浦口店');assert.equal(t.deadline,original.deadline);assert.equal(t.taskDeadline,original.taskDeadline);
  assert(await pc.getByRole('button',{name:'完成门店办理',exact:true}).isVisible());assert.match(await pc.locator('.aftercare-context').innerText(),/工单负责人[\s\S]*周宁/);
  await page.reload({waitUntil:'domcontentloaded'});await pc.locator('.tickets-table').waitFor();await open('P39');assert.equal((await read(pc,id)).currentAssignee,'advisor1');
  form=await transfer(pc);assert.equal(await form.locator('[name=transferTarget]').count(),0);await form.getByRole('combobox',{name:'接收人',exact:true}).click();assert.deepEqual(await form.locator('.transfer-recipient-list').getByRole('option').evaluateAll(es=>es.map(e=>e.dataset.transferPerson)),['store1']);await choose(form,'王敏','store1');await form.locator('[name=note]').fill('由本门店店长补核');await submit(form);assert.equal((await read(pc,id)).owner,'zhou');
  const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(url('workflow/index.html')+'?view=h5#/mobile/'+id,{waitUntil:'domcontentloaded'});
  form=await transfer(mobile);await choose(form,'林薇','advisor1');await form.locator('[name=note]').fill('店长已核实，由顾问补齐结果');await mobile.screenshot({path:'/tmp/complaint-transfer-h5-20261014.png'});await submit(form);
  assert.equal((await read(mobile,id)).owner,'zhou');await mobile.reload({waitUntil:'domcontentloaded'});assert.equal((await read(mobile,id)).currentAssignee,'advisor1');
  await mobile.getByRole('button',{name:'完成门店办理',exact:true}).click();form=mobile.locator('[data-form=finishStoreAssistance]');await form.locator('[name=note]').fill('记录已核实，请负责人继续办理');await submit(form);
  t=await read(mobile,id);assert.equal(t.owner,'zhou');assert.equal(t.currentAssignee,'zhou');assert.equal(t.phase,'处理中');assert.equal(t.storeAssistance,undefined);assert.equal(t.storeAssistanceHistory[0].handoffs.length,2);
  await mobile.setViewportSize({width:320,height:700});assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const footer=await mobile.locator('.mobile-detail-footer').evaluate(el=>[...el.querySelectorAll('summary, .mobile-detail-actions>button')].map(button=>{const r=button.getBoundingClientRect();return {left:r.left,right:r.right};}));assert(footer.every(r=>r.left>=0&&r.right<=320));assert(footer.every((r,i)=>!i||r.left>=footer[i-1].right));await mobile.screenshot({path:'/tmp/complaint-transfer-h5-footer-20261014.png'});
  // H5 also offers both aftercare targets, global store search and correct empty-state handling.
  form=await transfer(mobile);await form.locator('[name=transferTarget]').selectOption('store');await form.locator('[name=recipientSearch]').fill('不存在的名字');assert.equal(await form.locator('.transfer-recipient-list').getByRole('option').count(),0);assert(await form.locator('[data-transfer-empty]').isVisible());await form.getByRole('combobox',{name:'接收人',exact:true}).press('Escape');assert(await form.isVisible());assert.equal(await form.getByRole('combobox',{name:'接收人',exact:true}).getAttribute('aria-expanded'),'false');await choose(form,'陈蓉','advisor2');assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await form.getByRole('combobox',{name:'接收人',exact:true}).click();await mobile.screenshot({path:'/tmp/complaint-transfer-h5-search-20261014.png'});await mobile.getByRole('button',{name:'返回上一页'}).click();
  for(const [suffix,to,query,kind] of [['D02','finance2','许敏','payment'],['D17','procurement2','何宁','procurement'],['P10','advisor2','陈蓉','store'],['P37','advisor2','陈蓉','store'],['D15','chen','陈悦','aftercare'],['P18','zhou','周宁','aftercare']]){
   await page.reload({waitUntil:'domcontentloaded'});await pc.locator('.tickets-table').waitFor();const ticketId=await open(suffix),before=await read(pc,ticketId);form=await transfer(pc);
   assert.equal(await form.locator('[name=transferTarget]').count(),kind==='aftercare'?1:0);await choose(form,query,to);await form.locator('[name=note]').fill('同事繁忙，交由可用成员办理');await submit(form);
   const after=await read(pc,ticketId);assert.equal(after.currentAssignee,to);assert.equal(after.owner,kind==='aftercare'?to:before.owner);assert.equal(after.phase,before.phase);assert.equal(after.taskDeadline,before.taskDeadline);assert.equal(after.deadline,before.deadline);
   console.log('PASS PC '+suffix+': searchable transfer and correct ownership');
  }
  assert.deepEqual(errors,[]);console.log('PASS PC/H5 transfer targets, all-store name search, store-internal handoffs, reload, automatic return to owner, empty-state and narrow layout');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
