/* Isolated browser acceptance: actual rule forms -> actual ticket forms, including local-file hosting. */
'use strict';
const assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),{pathToFileURL}=require('node:url');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..'),output=process.env.QA_OUTPUT||'/tmp/complaint-unification-20261006/browser';
const KEY=require('./shared-store.js').KEY;
const url=relative=>pathToFileURL(path.join(root,relative)).href;
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
  context.on('page',p=>p.on('pageerror',e=>errors.push(e.message)));page.on('pageerror',e=>errors.push(e.message));
  await page.goto(url('zuhu.html')+'#complaint-rules');
  const rules=page.frameLocator('#page-complaint-rules iframe');
  await rules.locator('[data-scene-action="assignment"][data-id="scene-level-2"]').click();
  await rules.locator('[data-node-rule="tab"][data-id="timing"]').click();
  await rules.locator('[data-scene="config.timing.firstContactHours"]').fill('3');
  await rules.locator('#assignment-timing-form [type="submit"]').click();
  await rules.locator('#toast').filter({hasText:'办理时效已保存'}).waitFor();
  await rules.locator('[data-node-rule="tab"][data-id="nodes"]').click();
  await rules.locator('[data-node-rule="edit"][data-id="contact"]').click();
  await rules.locator('[data-na="nodes.contact.source"]').selectOption('person');
  await rules.locator('[data-na="nodes.contact.person"]').selectOption('zhou');
  await rules.locator('#node-assignment-form [type="submit"]').click();
  await rules.locator('#toast').filter({hasText:'指派规则已保存'}).waitFor();
  console.log('PASS rule page: save first-contact deadline and fixed handler through existing controls');
  await page.evaluate(()=>showPage('complaint-tickets'));
  const tickets=page.frameLocator('#page-complaint-tickets iframe');
  await tickets.locator('[data-action="create"]').click();
  const create=tickets.locator('[data-form="create"]');
  assert.equal(await create.locator('[name="owner"]').count(),0,'Keep the existing automatic-assignment intake form');
  await create.locator('[name="order"]').selectOption('O2');
  await create.locator('[name="title"]').fill('统一规则浏览器验收');
  await create.locator('[name="description"]').fill('核实剩余项目退款，独立测试事件');
  await create.locator('[name="distinct"]').check();
  await create.locator('[type="submit"]').click();
  await create.waitFor({state:'detached'});
  const state=()=>page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  let s=await state(),t=s.tickets.find(x=>x.title==='统一规则浏览器验收');assert(t);const id=t.id;
  assert.equal(t.owner,'zhou');assert.equal(t.taskDeadline-t.created,3*3600000);assert.equal(t.flow.version,2);
  assert.equal(s.configuration.nodeAssignmentRules.nodes.contact.person,'zhou');
  console.log('PASS host: rule changes determine real intake handler, deadline and snapshot');
  async function act(name){await tickets.locator('.drawer-footer [data-action="'+name+'"], .mobile-footer [data-action="'+name+'"]').click();}
  async function submit(type){const f=tickets.locator('[data-form="'+type+'"]');await f.locator('[type="submit"]').click();await f.waitFor({state:'detached'});}
  await act('follow');await tickets.locator('[data-form="follow"] [name="content"]').fill('已核实订单，客户认可本次退款');await tickets.locator('[data-form=follow] [name=result]').selectOption('plan');await submit('follow');
  await tickets.locator('[data-form="proposal"] [name="refund"]').fill('100');await tickets.locator('[data-form="proposal"] [name="content"]').fill('原路退回未消费项目100元');await submit('proposal');
  t=(await state()).tickets.find(x=>x.id===id);assert.equal(t.state,'待方案审批');assert.equal(t.approval.steps[0].people[0],'finance');
  await act('approve');await submit('approve');
  t=(await state()).tickets.find(x=>x.id===id);assert.equal(t.state,'待打款');assert.equal(t.flow.doc.finance,'finance');
  await act('pay');await tickets.locator('[data-form="pay"] [name="reference"]').fill('BROWSER-UNIFIED-ONLY');await tickets.locator('[data-form="pay"] [name="proof"]').setInputFiles({name:'test-proof.txt',mimeType:'text/plain',buffer:Buffer.from('Isolated prototype payment evidence')});await submit('pay');
  t=(await state()).tickets.find(x=>x.id===id);assert.equal(t.state,'待回访');assert.equal(t.currentAssignee,'callback');
  await act('review');await tickets.locator('[data-form="review"] [name="note"]').fill('客户确认收到退款，认可本轮处理');await submit('review');
  assert.equal((await state()).tickets.find(x=>x.id===id).state,'已结案');
  console.log('PASS PC forms: contact -> configured approval -> configured finance -> configured callback -> closure');
  fs.mkdirSync(output,{recursive:true});await page.screenshot({path:path.join(output,'host-ticket.png')});
  await tickets.locator('.drawer-header [data-action="closeDrawer"]').click();
  await page.evaluate(()=>showPage('complaint-rules'));await rules.locator('[data-scene-action="back"]').click();await rules.locator('[data-scene-action="edit"][data-id="scene-level-2"]').click();
  await rules.locator('.ac-node-body[data-flow-action="edit"]').first().click();await rules.locator('[data-flow-close]').first().click();await page.screenshot({path:path.join(output,'host-approval-editor.png')});
  const mobile=await context.newPage();await mobile.setViewportSize({width:390,height:844});await mobile.goto(url('complaint-prototype/workflow/index.html')+'?view=h5#/mobile/'+id);
  assert((await mobile.locator('.mobile-overview').innerText()).includes('已结案'));assert.equal(await mobile.locator('.mobile-footer [data-action="pay"]').count(),0);await mobile.screenshot({path:path.join(output,'mobile-closed.png')});
  for(const entry of ['first','store','follow','approval','payment','review','risk','repeat','closed']){await mobile.goto(url('complaint-prototype/workflow/index.html')+'?view=h5#/demo/'+entry);await mobile.locator('.mobile-detail-shell').waitFor();assert(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  console.log('PASS H5: cross-page shared state and all nine task/scenario entries');
  // Opening an old rule route now reaches the same editor, not the removed duplicate.
  await mobile.goto(url('complaint-prototype/workflow/index.html')+'#/rules');await mobile.waitForURL(/complaint-prototype\/index\.html/);assert.equal(await mobile.locator('h1').innerText(),'规则配置');
  await mobile.goto(url('complaint-prototype/index.html')+'?view=customer#detail/old');assert.equal(await mobile.locator('h3').innerText(),'客户入口已停用');
  assert.deepEqual(errors,[]);console.log('PASS no uncaught page errors; duplicate rule route redirects to the single editor');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
