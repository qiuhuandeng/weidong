'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('./approval-detail-view'),E=require('./workflow/engine'),C=require('./configuration'),T=require('./approval-templates');
function fixture(){const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);E.ensureSolutionExamples(s);T.ensure(s);E.ensureExternalApprovals(s);E.ensureExternalApprovalExamples(s);return s;}
const get=(s,suffix)=>{const t=s.tickets.find(t=>t.id==='KS20261007-'+suffix);return [E.externalApprovalRecord(s,t),t];};
test('payment summary reads the submitted template fields and leaves detailed data unchanged',()=>{
 const s=fixture(),[r,t]=get(s,'D01'),before=JSON.stringify(r);t.proposal.refund=12345;t.name='后来修改的客户';
 const html=V.detail(r,t,{detailLink:'<a href="#detail">查看详情</a>'});
 assert.match(html,/¥500.00/);assert.doesNotMatch(html,/后来修改的客户|123.45|最近同步/);assert.match(html,/查看详情/);
 assert.equal(JSON.stringify(r),before);assert(r.snapshot.fields.some(f=>f.label==='客户ID号'));assert(r.snapshot.fields.some(f=>f.label==='收款账户'));assert(!r.snapshot.fields.some(f=>f.id==='refund-detail'));
 const field=r.snapshot.fields.find(f=>f.id==='reason');field.label='付款依据';field.value='模板固定值';assert.match(V.detail(r,t),/付款依据[\s\S]*模板固定值/);
});
test('procurement summary retains every product and quantity without rendering the full row table',()=>{
 const s=fixture(),[r,t]=get(s,'D03'),html=V.detail(r,t);assert.match(html,/店铺名称/);assert.match(html,/赠品品名/);assert.match(html,/会员号/);assert.doesNotMatch(html,/<dt>商品总价值|<dt>方案单价|<dt>方案价值/);assert.match(html,/舒缓修护霜 50g/);assert.match(html,/舒缓修护面膜 5片装/);assert.match(html,/<b>2<\/b>/);assert.match(html,/<b>1<\/b>/);assert.doesNotMatch(html,/<table|方案单价|方案价值|退款明细/);
 const custom={fields:[{id:'custom',type:'text',label:'付款主体',value:'公司'}]};assert.match(V.summary(custom,{processCode:'custom-template'}),/付款主体[\s\S]*公司/);
});
test('progress separates completed approvals from current people and synchronization does not reset waiting time',()=>{
 const s=fixture(),[r,t]=get(s,'D01'),before=JSON.stringify(s),nodes=V.processSteps(r),current=nodes.filter(n=>n.kind==='current');
 assert.equal(JSON.stringify(s),before);assert.equal(current.length,1);assert.deepEqual(current[0].people,['孙琳']);assert(nodes.some(n=>n.actor==='陆清'&&n.status==='已同意'));
 const now=current[0].since+90*60000;t.taskDeadline=now-30*60000;const html=V.process(r,t,{now});assert.match(html,/aria-current="step"/);assert.match(html,/已等待 1小时30分钟/);assert.match(html,/审批已超时 30分钟/);
 r.syncedAt=now;assert.equal(V.processSteps(r).at(-1).since,current[0].since);
 const unknown={...r,people:[]};assert.equal(V.processSteps(unknown).at(-1).status,'待分配审批人');assert.doesNotMatch(V.process(unknown,t,{now}),/孙琳/);
});
test('passed, refused, withdrawn and launch issues never show an active approver or use another node deadline',()=>{
 const s=fixture();for(const suffix of ['D02','D04','D05','D06','D09','D10']){const [r,t]=get(s,suffix),before=JSON.stringify(r),html=V.detail(r,t);assert.doesNotMatch(html,/aria-current="step"|已等待|审批剩余|审批已超时/);assert.equal(JSON.stringify(r),before);}
 const [r,t]=get(s,'D01'),historical={...t,approval:{recordId:'later-record'},taskDeadline:1};assert.doesNotMatch(V.detail(r,historical),/审批已超时/);
});
test('multiple current approvers stay pending and user-provided text is escaped',()=>{
 const r={id:'r',status:'running',name:'付款审批',initiator:'发起人',at:1000,people:['甲','乙<script>'],events:[{title:'审批人同意',actor:'丙',at:2000}],snapshot:{fields:[{id:'reason',label:'处理方案',type:'text',value:'<img onerror=x>'}]},processCode:'PROC-COMPLAINT-PAYMENT'};
 const html=V.detail(r,null,{now:62000});assert.match(html,/甲/);assert.match(html,/乙&lt;script&gt;/);assert.match(html,/&lt;img onerror=x&gt;/);assert.doesNotMatch(html,/<script>|<img|已通过/);assert.deepEqual(V.processSteps(r).at(-1).people,r.people);
});

test('reference previews include notes and optional attachment fields and detail follows the requested field list',()=>{
 const s=fixture(),[r,t]=get(s,'D21'),html=V.detail(r,t);assert.match(html,/客户消费与沟通记录.svg/);assert.doesNotMatch(html,/客户确认事项.txt/);assert.match(html,/退款＋赔款/);assert.match(html,/客户定金缴纳日期/);assert.doesNotMatch(html,/<dt>税额|审批编号|创建时间/);assert.match(html,/<dt>发票/);assert.match(html,/所在部门/);assert.match(html,/市场运营中心-售后服务部/);
 const full=V.formFields(r.snapshot,{showEmpty:true});assert.match(full,/税额（元）/);assert.match(full,/以下为最终申请退赔客户信息/);assert.doesNotMatch(full,/\[object Object\]/);
});

test('default detail field order matches both reference screenshots and keeps the existing detail entry and progress',()=>{
 const s=fixture(),[payment,t]=get(s,'D21'),[purchase,u]=get(s,'D22');const p=V.detail(payment,t,{detailLink:'<a href="#detail">查看详情</a>'}),q=V.detail(purchase,u,{detailLink:'<a href="#detail">查看详情</a>'});
 for(const label of ['客诉类别','关联审批单','客户ID号','客户消费情况与诉求','退赔分类','项目类别','责任人判定','客户所购服务项目','客户定金缴纳日期','客户进店消费日期','客户所购买产品','付款金额（元）','支出类别','大写','发票','项目','收款账户','图片','所在部门'])assert(p.includes(label),label);
 for(const label of ['店铺名称','申请原因','申请类型','赠品品名','数量','客户姓名','会员号','图片','所在部门'])assert(q.includes(label),label);
 for(const html of [p,q]){assert(html.indexOf('查看详情')<html.indexOf('审批过程'));assert.match(html,/data-ad-image/);assert.doesNotMatch(html,/审批编号|创建人部门|创建时间/);}
 assert.match(p,/陆佰元整/);assert.match(p,/data-approval-action="record"/);
});

test('saved legacy payment and purchase applications use the new detail layout without changing submitted records or progress',()=>{
 const s=fixture();for(const [suffix,catalog] of [['P06',T.LEGACY_CATALOG[0]],['D03',T.LEGACY_CATALOG[1]]]){
  const t=s.tickets.find(t=>t.id==='KS20261007-'+suffix),legacy=T.newTemplate();legacy.name=catalog.name;T.loadSchema(legacy,catalog);
  const r={id:'legacy-'+suffix,name:'审批',templateName:catalog.name,templateSnapshot:legacy,processCode:catalog.processCode,templateVersion:1,proposalVersion:t.proposal.version,status:'running',at:1000,people:['原审批人'],events:[{actor:'原审批人',at:1100,title:'审批人同意'}],snapshot:T.preview(legacy,t,s)};
  const saved=JSON.stringify(r),originalNames=t.proposal.exchangeItems.map(x=>x.name);t.proposal.refund=999900;t.proposal.exchangeItems=[{name:'后续修改的商品',quantity:99}];t.proposal.content='后续修改的方案';
  const before=JSON.stringify(t),process=V.process(r,t,{now:10000}),html=V.detail(r,t,{state:s,now:10000,detailLink:'<button>查看详情</button>'});
  assert.equal(JSON.stringify(r),saved);assert.equal(JSON.stringify(t),before);assert(html.includes(process));assert.doesNotMatch(html,/后续修改的商品|后续修改的方案|9,999/);assert.match(html,/所在部门/);assert.match(html,/查看详情/);
  if(suffix==='P06'){assert.match(html,/客诉类别|客户ID号/);assert.match(html,/付款金额（元）/);assert.match(html,/¥500.00/);assert.match(html,/伍佰元整/);assert.match(html,/客户进店消费日期/);}else{assert.match(html,/店铺名称/);assert.match(html,/赠品品名/);assert.match(html,/会员号/);for(const name of originalNames)assert(html.includes(name));}
 }
});
