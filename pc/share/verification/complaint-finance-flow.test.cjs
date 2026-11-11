// Permanent, isolated regression checks for read-only finance approval rendering.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const context={window:{PCModules:{}}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../pages/complaint-detail/index.js'),'utf8'),context);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const view=context.window.PCModules['complaint-detail'].create({
  esc,valueText:value=>Array.isArray(value)?value.join('、'):String(value??''),
  workOrderStatus:value=>value,currentHandler:r=>r.currentHandler||'',currentTask:r=>r.currentTask||'',
  financeApproval:r=>r.financeApprovals?.at(-1),canAssess:()=>false,
  section:(title,body)=>`<section><h4>${title}</h4>${body}</section>`,
  detail:(label,value)=>`<div>${esc(label)}：${esc(value)}</div>`,
  link:(text,action,attributes)=>`<button data-uc="${action}" ${attributes}>${text}</button>`,
  fmt:value=>String(value??''),empty:text=>`<p>${text}</p>`,filesView:()=>'',solutionRead:()=>'<p>已提交退款方案</p>',
  approvalLabels:{pending:'处理中',rejected:'财务驳回',withdrawn:'审批已撤销'},
  isDemoRecord:r=>r.demoDetailsVersion==='fixture'
});
const child=(name,status,assignees=[{name:name+'人',status}])=>({name,status,assignees});
function ticket(nodes){
  const approval={id:'finance-1',round:1,status:'pending',submittedAt:'2026-11-11 09:00',submittedBy:'客服甲',customerSolution:{},...(nodes?{subprocess:{source:'钉钉',syncedAt:'2026-11-11 10:08',nodes}}:{})};
  return {id:'test',status:'财务审批中',follows:[],logs:[],financeApprovals:[approval],execution:{index:0,steps:[{id:'step-1',approvalId:approval.id,kind:'financeApproval',type:'approval',title:'财务审批 · 第 1 次',status:'财务审批中',approvalResult:'处理中'}]}};
}
const render=r=>view.processView(r);
const currentSummary=html=>html.split('<div class="uc-finance-current">').slice(1).map(part=>part.split('<details')[0]).join('\n');

test('serial progress shows the current approver outside a native disclosure and does not mutate data',()=>{
  const r=ticket([child('初审','approved'),child('复核','approved'),child('经理','pending'),child('总监','waiting'),child('负责人','waiting')]);
  const before=JSON.stringify(r),html=render(r);
  assert.equal((html.match(/<li class="uc-finance-node /g)||[]).length,5);assert.match(currentSummary(html),/经理 · 经理人/);
  assert.doesNotMatch(html,/uc-finance-disclosure" open/);assert.doesNotMatch(html,/最近同步|来源：|查看审批/);
  assert.match(currentSummary(html),/审批中/);assert.doesNotMatch(currentSummary(html),/当前审批：|最近同步|已通过 2 \/ 5/);
  assert.doesNotMatch(html,/uc-process-results/);assert.doesNotMatch(html,/uc-process-people/);
  assert.equal((html.match(/<li class="uc-process-node[^>]*aria-current="step"/g)||[]).length,1);
  assert.equal((html.match(/<li class="uc-finance-node[^>]*aria-current="step"/g)||[]).length,1);
  assert.match(html,/未开始/);assert.equal(JSON.stringify(r),before);
  const detail=view.financeApprovalView(r,r.financeApprovals[0]);assert.match(detail,/审批子流程/);assert.match(detail,/经理 · 经理人/);
});
test('parallel nodes and countersigners identify only the people still reviewing',()=>{
  const r=ticket([{...child('金额会签','pending',[{name:'已审甲',status:'approved'},{name:'待审乙',status:'pending'}]),mode:'all'},child('账户复核','pending',[{name:'待审丙',status:'pending'}])]);
  const html=render(r),summary=currentSummary(html);
  assert.match(summary,/金额会签 · 待审乙/);assert.match(summary,/账户复核 · 待审丙/);assert.doesNotMatch(summary,/已审甲/);
  assert.match(html,/会签/);assert.match(html,/已审甲/);assert.match(html,/已通过/);
});
test('finished rounds remain collapsed and never reuse the current round snapshot',()=>{
  const r=ticket([child('旧复核','rejected',[{name:'旧审批人',status:'rejected'}])]);
  Object.assign(r.financeApprovals[0],{status:'rejected',reason:'退回核对'});
  Object.assign(r.execution.steps[0],{approvalReturned:true,returnedAt:'2026-11-11 10:00',approvalResult:'财务驳回'});
  r.financeApprovals.push({id:'finance-2',round:2,status:'pending',subprocess:{nodes:[child('新经理','pending',[{name:'新审批人',status:'pending'}])]}});
  r.execution.steps.push({id:'step-2',approvalId:'finance-2',kind:'financeApproval',type:'approval',title:'财务审批 · 第 2 次',status:'财务审批中'});r.execution.index=1;
  const html=render(r),first=html.split('财务审批 · 第 2 次')[0];
  assert.match(first,/旧审批人/);assert.doesNotMatch(first,/新审批人/);assert.doesNotMatch(first,/uc-finance-disclosure" open/);
  assert.match(currentSummary(html),/新经理 · 新审批人/);
  const detail=view.financeApprovalView(r,r.financeApprovals[0]);assert.match(detail,/旧审批人/);assert.doesNotMatch(detail,/新审批人/);
});
test('missing, empty and unknown snapshots do not fabricate nodes or current assignees',()=>{
  assert.match(render(ticket()),/子流程暂未同步/);
  const r=ticket([]);assert.match(render(r),/子流程暂未同步/);
  r.financeApprovals[0].subprocess.nodes=[{name:'未知节点',status:'new-upstream-status',assignees:[{name:'已知姓名'}]}];
  const html=render(r);assert.match(html,/状态待同步/);assert.doesNotMatch(currentSummary(html),/已知姓名/);
});
test('node count is dynamic and child completion cannot approve the parent',()=>{
  for(const count of [1,3,7]){
    const r=ticket(Array.from({length:count},(_,i)=>child('节点'+i,'approved'))),before=JSON.stringify(r),html=render(r);
    assert.equal((html.match(/<li class="uc-finance-node /g)||[]).length,count);assert.match(html,/等待审批结果同步/);assert.equal(JSON.stringify(r),before);assert.equal(r.status,'财务审批中');
    assert.ok(currentSummary(html).includes('节点'+(count-1)));assert.match(currentSummary(html),/已通过/);
  }
});
test('stale child states after rejection are marked unsynced, not currently reviewing',()=>{
  const r=ticket([child('金额复核','pending'),child('后续节点','waiting')]);r.financeApprovals[0].status='withdrawn';
  Object.assign(r.execution.steps[0],{approvalReturned:true,returnedAt:'2026-11-11 10:00'});
  const html=render(r);assert.match(currentSummary(html),/审批已撤销 · 子节点状态待同步/);assert.doesNotMatch(html,/uc-finance-node is-pending/);
  assert.match(html,/状态待同步/);
});
test('external names and long opinions are escaped and fully available in a disclosure',()=>{
  const note='<img src=x onerror=alert(1)>\n'+('需要核对退款资料。'.repeat(20));
  const r=ticket([{...child('<script>初审</script>','pending',[{name:'<b>人员</b>',status:'pending',opinion:note}]),opinion:note}]);
  const html=render(r);assert.doesNotMatch(html,/<script>|<img|<b>/);assert.match(html,/&lt;script&gt;/);
  assert.ok(html.includes(esc(note)));assert.match(html,/uc-finance-opinion/);
});
test('execution snapshots work without an approval array and take no data from other records',()=>{
  const r=ticket();delete r.financeApprovals;
  r.execution.steps[0].external={subprocess:{nodes:[child('外部复核','pending')]}};
  const before=JSON.stringify(r),html=render(r);assert.match(html,/外部复核 · 外部复核人/);assert.equal(JSON.stringify(r),before);
  assert.doesNotMatch(render(ticket()),/外部复核/);
});
test('examples are restricted to demo route nodes and supplied snapshots always win',()=>{
  const r=ticket();r.execution.steps[0].demo=true;r.execution.steps[0].startedAt='2026-11-11 09:00';
  assert.doesNotMatch(render(r),/财务初审/);
  r.demoDetailsVersion='fixture';const before=JSON.stringify(r),html=render(r);assert.doesNotMatch(html,/子流程示例/);assert.equal((html.match(/<li class="uc-finance-node /g)||[]).length,5);assert.equal(JSON.stringify(r),before);
  r.financeApprovals[0].subprocess={nodes:[]};assert.doesNotMatch(render(r),/财务初审/);
  r.financeApprovals[0].subprocess={nodes:[child('真实复核','pending')]};assert.match(render(r),/真实复核/);assert.doesNotMatch(render(r),/子流程示例/);
});
test('latest handled child is chosen by recorded time rather than the last future node',()=>{
  const r=ticket([{...child('经理复核','rejected'),completedAt:'2026-11-11 11:00'},{...child('财务初审','approved'),completedAt:'2026-11-11 09:00'},child('财务总监','waiting')]);
  const summary=currentSummary(render(r));assert.match(summary,/经理复核 · 经理复核人/);assert.match(summary,/已驳回/);assert.doesNotMatch(summary,/财务初审|财务总监/);
  r.financeApprovals[0].status='rejected';Object.assign(r.execution.steps[0],{approvalReturned:true,returnedAt:'2026-11-11 11:00'});
  assert.match(currentSummary(render(r)),/经理复核 · 经理复核人/);
});
test('finance removes parent waiting copy, sync metadata and the approval link while retaining child opinions',()=>{
  const r=ticket([child('财务经理','pending')]);r.currentTask='待财务审批反馈';
  r.execution.steps[0].result='已提交审批，等待审批意见。';
  r.financeApprovals[0].subprocess.nodes[0].opinion='请核对收款账号。';
  const html=render(r),visible=html.split('<details')[0];
  assert.match(visible,/财务经理 · 财务经理人/);assert.doesNotMatch(visible,/待财务审批反馈|已提交审批|审批结果|审批意见/);
  assert.doesNotMatch(html,/已提交审批|审批说明|最近同步|来源：|查看审批|view-finance-approval/);assert.match(html,/请核对收款账号。/);assert.match(html,/审批记录/);assert.doesNotMatch(html,/uc-process-results/);
});

function rejectedExample(){
  const r=ticket();r.id='31038';r.demoDetailsVersion='fixture';r.status='客服处理中';
  Object.assign(r.financeApprovals[0],{id:'31038-finance-legacy',status:'rejected',submittedAt:'2026-11-06 09:30',returnedAt:'2026-11-06 09:40',returnedBy:'陆清（财务）',reason:'退款金额与未消费项目明细不一致，请核对后重新提交。'});
  Object.assign(r.execution.steps[0],{approvalId:'31038-finance-legacy',approvalReturned:true,terminated:true,returnedAt:'2026-11-06 09:40',approvalResult:'财务驳回'});
  return r;
}
test('original rejected fixture retains all five child nodes and puts the reason on the rejecting node',()=>{
  const r=rejectedExample(),before=JSON.stringify(r),html=render(r),summary=currentSummary(html);
  assert.equal((html.match(/<li class="uc-finance-node /g)||[]).length,5);
  assert.equal((html.match(/<li class="uc-finance-node is-approved/g)||[]).length,2);
  assert.equal((html.match(/<li class="uc-finance-node is-rejected/g)||[]).length,1);
  assert.equal((html.match(/<li class="uc-finance-node is-terminated/g)||[]).length,2);
  assert.match(summary,/财务经理 · 陆清/);assert.match(summary,/已驳回/);assert.doesNotMatch(summary,/财务负责人|暂未同步/);
  assert.match(html,/未执行/);assert.match(html,/钉钉审批记录/);assert.match(html,/2026-11-06 09:40/);
  assert.equal(html.split(r.financeApprovals[0].reason).length-1,1);
  assert.doesNotMatch(html,/uc-finance-disclosure" open|查看审批|最近同步/);
  assert.equal(JSON.stringify(r),before);
  assert.equal((view.financeApprovalView(r,r.financeApprovals[0]).match(/<li class="uc-finance-node /g)||[]).length,5);
});
test('rejection example never fills another round, an unrelated ticket or a supplied snapshot',()=>{
  const r=rejectedExample();r.financeApprovals[0].round=2;assert.doesNotMatch(render(r),/财务初审/);
  r.financeApprovals[0].round=1;r.id='manual-ticket';assert.doesNotMatch(render(r),/财务初审/);
  r.id='31038';delete r.demoDetailsVersion;assert.doesNotMatch(render(r),/财务初审/);
  r.demoDetailsVersion='fixture';r.financeApprovals[0].subprocess={nodes:[]};assert.doesNotMatch(render(r),/财务初审/);
  r.financeApprovals[0].subprocess={nodes:[child('实际审批节点','rejected')]};const html=render(r);assert.match(html,/实际审批节点/);assert.doesNotMatch(html,/财务初审/);
});
test('a rejected outcome stays in the summary when later nodes are automatically terminated',()=>{
  const r=ticket([{...child('经理复核','rejected'),completedAt:'2026-11-11 10:00'},{...child('后续审批','terminated'),completedAt:'2026-11-11 10:01'}]);
  r.financeApprovals[0].status='rejected';Object.assign(r.execution.steps[0],{approvalReturned:true,returnedAt:'2026-11-11 10:00',approvalResult:'财务驳回'});
  const summary=currentSummary(render(r));assert.match(summary,/经理复核 · 经理复核人/);assert.match(summary,/已驳回/);assert.doesNotMatch(summary,/后续审批/);
});
