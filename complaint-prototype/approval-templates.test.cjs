'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration'),T=require('./approval-templates'),Store=require('./shared-store');
const P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
function fixture(){const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);E.ensureSolutionExamples(s);T.ensure(s);return s;}
test('initialization is additive and repeatable; records retain independent solution snapshots',()=>{
 const s=fixture(),before=JSON.stringify(s.tickets),records=JSON.stringify(s.approvalRecords);assert.equal(T.list(s).length,2);assert.equal(s.approvalRecords.length,6);assert.equal(T.ensure(s),false);assert.equal(JSON.stringify(s.tickets),before);
 const t=s.tickets.find(x=>x.id==='KS20261007-P41');t.proposal.refund=1;T.get(s,'approval-payment').name='新名称';assert.equal(JSON.stringify(s.approvalRecords),records);
});
test('multi-item refunds and products have independent rows, exact yuan conversion and cash total',()=>{
 const s=fixture(),t=s.tickets.find(x=>x.id==='KS20261007-P41'),payment=T.preview(T.get(s,'approval-payment'),t),purchase=T.preview(T.get(s,'approval-purchase'),t);
 assert.deepEqual(payment.missing,[]);assert.equal(payment.fields.find(f=>f.id==='refund-detail').rows.length,2);assert.equal(payment.fields.find(f=>f.id==='total').value,500);assert.equal(purchase.fields.find(f=>f.id==='products').rows.length,2);assert.equal(purchase.fields.find(f=>f.id==='exchange-total').value,480);
 const both=T.preview(T.get(s,'approval-payment'),s.tickets.find(x=>x.id==='KS20261007-P40'));assert.equal(both.fields.find(f=>f.id==='total').value,600);assert.equal(both.fields.find(f=>f.id==='refund').value,500);assert.equal(both.fields.find(f=>f.id==='compensation').value,100);
});
test('required fields, scalar types, table row context, options and schema identity are checked',()=>{
 const s=fixture(),t=T.clone(T.get(s,'approval-payment'));t.mappings.ticket.source='';assert.match(T.issues(t).join(','),/工单编号/);t.mappings.ticket.source='ticket.id';t.mappings.total.source='ticket.customer';assert.match(T.issues(t).join(','),/申请付款金额/);t.mappings.total.source='solution.total';t.mappings['refund-detail'].children.amount.source='row.unitPrice';assert.match(T.issues(t).join(','),/本次退款/);t.mappings['refund-detail'].children.amount.source='row.amount';t.mappings.method={mode:'constant',value:'现金'};assert.match(T.issues(t).join(','),/有效选项/);t.processCode='PROC-OTHER';assert.match(T.issues(t).join(','),/重新同步/);
});
test('preview exposes missing required data without changing tickets',()=>{const s=fixture(),t=T.clone(s.tickets.find(x=>x.id==='KS20261007-P41'));delete t.proposal.payout.account;const before=JSON.stringify(t),result=T.preview(T.get(s,'approval-payment'),t);assert(result.missing.includes('收款账号'));assert.equal(JSON.stringify(t),before);});
test('configuration has authorization, revision conflicts, duplicate name and enable validation',()=>{
 const s=fixture(),d=T.newTemplate();d.name='新付款申请';T.loadSchema(d,T.CATALOG[0]);d.enabled=true;
 assert.throws(()=>T.saveTemplate(s,'aftercare',d,0),/授权/);const saved=T.saveTemplate(s,'manager',d,0);assert.equal(saved.version,1);assert.throws(()=>T.saveTemplate(s,'manager',d,0),/更新/);assert.throws(()=>T.saveTemplate(s,'manager',d,1),/名称已存在/);
 const bad=T.newTemplate();bad.name='未完成配置';bad.enabled=true;assert.throws(()=>T.saveTemplate(s,'manager',bad,1),/钉钉模板/);bad.enabled=false;assert.equal(T.saveTemplate(s,'manager',bad,1).version,1);
});
test('referenced templates cannot be disabled and only eligible templates may bind to a node',()=>{
 const s=fixture(),scene=C.Rules.sceneList(s.configuration)[0],n={id:'external-approval',type:'approval',provider:'dingtalk',title:'付款审批',templateId:'approval-payment',handling:{hours:24}};
 scene.config.ticketFlow={nodes:[n]};s.configuration.ruleScenes=[scene];assert.equal(T.references(s,n.templateId).length,1);P.validNode(n,s.configuration);
 const d=T.clone(T.get(s,n.templateId));d.enabled=false;assert.throws(()=>T.saveTemplate(s,'manager',d,0),/启用规则引用/);n.handling.hours=0;assert.throws(()=>P.validNode(n,s.configuration),/办理时效/);n.handling.hours=24;n.templateId='missing';assert.throws(()=>P.validNode(n,s.configuration),/配置不完整/);
});
test('schema synchronization retains surviving mappings and exposes added required fields',()=>{
 const s=fixture(),t=T.clone(T.get(s,'approval-payment'));t.mappings.reason={mode:'constant',value:'已线下确认'};const schema=T.clone(T.CATALOG[0]);schema.fields.push({id:'new-required',label:'付款主体',type:'text',required:true});T.loadSchema(t,schema);assert.equal(t.mappings.reason.value,'已线下确认');assert.match(T.issues(t).join(','),/付款主体/);
});
test('shared-store upgrades once and preserves all saved ticket workflows',()=>{
 const s=fixture();delete s.configuration.approvalIntegration;delete s.approvalRecordExamplesVersion;delete s.approvalRecords;s._revision=10;const tickets=JSON.stringify(s.tickets),values=new Map([[Store.KEY,JSON.stringify(s)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},store=Store.createStore(storage,{...E,ensureExternalApprovalExamples:()=>false,ensureApprovalPresentation:()=>false},C),loaded=store.load();assert.equal(loaded._revision,11);assert.equal(JSON.stringify(loaded.tickets),tickets);assert.equal(store.load()._revision,11);
});
test('incomplete application fields stay visible and do not fall back to local approver buttons',()=>{
 const s=C.initialize(E.seed());T.ensure(s);const scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(x=>x.level===2));
 scene.config.ticketFlow.nodes.splice(1,scene.config.ticketFlow.nodes.length-2,{id:'ding-pay',type:'approval',provider:'dingtalk',title:'付款审批',templateId:'approval-payment',handling:{hours:18}},P.node('payment',s.configuration,scene));P.validate(scene,s.configuration);s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const t=E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款处理',description:'客户要求退款'});E.follow(s,t,t.currentAssignee,{connected:true,content:'线下已核实处理事项'});const before=E.clone(s);
 E.confirmSolution(s,t,E.taskPeople(s,t)[0],{typeKey:'refund',refund:10000,compensation:0,content:'按线下沟通结果处理',account:'原支付渠道',exchangeItems:[]});assert.equal(t.proposal.status,'已确认');assert.equal(E.currentFlowNode(t).provider,'dingtalk');assert.equal(E.externalApprovalRecord(s,t).status,'failed');assert.match(E.externalApprovalRecord(s,t).error,/申请资料缺失/);assert.doesNotMatch(E.externalApprovalRecord(s,t).error,/未连接/);assert.equal(t.state,'审批中');assert.deepEqual(E.taskPeople(s,t),[]);
});
