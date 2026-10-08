'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const V=require('./approval-detail-view'),E=require('./workflow/engine'),C=require('./configuration'),T=require('./approval-templates');
function fixture(){const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);E.ensureSolutionExamples(s);T.ensure(s);E.ensureExternalApprovals(s);E.ensureExternalApprovalExamples(s);return s;}
const get=(s,suffix)=>{const t=s.tickets.find(t=>t.id==='KS20261007-'+suffix);return [E.externalApprovalRecord(s,t),t];};
test('payment summary reads the submitted template fields and leaves detailed data unchanged',()=>{
 const s=fixture(),[r,t]=get(s,'D01'),before=JSON.stringify(r);t.proposal.refund=12345;t.name='后来修改的客户';
 const html=V.detail(r,t,{detailLink:'<a href="#detail">查看详情</a>'});
 assert.match(html,/¥500.00/);assert.doesNotMatch(html,/后来修改的客户|123.45|订单编号|实付金额|收款账号|审批编号|最近同步/);assert.match(html,/查看详情/);
 assert.equal(JSON.stringify(r),before);assert.equal(r.snapshot.fields.find(f=>f.id==='refund-detail').rows.length,2);
 const field=r.snapshot.fields.find(f=>f.id==='reason');field.label='付款依据';field.value='模板固定值';assert.match(V.detail(r,t),/付款依据[\s\S]*模板固定值/);
});
test('procurement summary retains every product and quantity without rendering the full row table',()=>{
 const s=fixture(),[r,t]=get(s,'D03'),html=V.detail(r,t);assert.match(html,/¥480.00/);assert.match(html,/舒缓修护霜 50g/);assert.match(html,/舒缓修护面膜 5片装/);assert.match(html,/× 2/);assert.match(html,/× 1/);assert.doesNotMatch(html,/<table|方案单价|方案价值|退款明细/);
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
