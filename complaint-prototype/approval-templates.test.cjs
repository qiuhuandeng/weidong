'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration'),T=require('./approval-templates'),Store=require('./shared-store');
const P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment);
function fixture(){const s=C.initialize(E.seed());E.ensureIntakeExamples(s);E.prepareTickets(s);E.ensureWorkflowExamples(s);E.ensureSolutionExamples(s);T.ensure(s);return s;}
test('initialization is additive and repeatable; records retain independent solution snapshots',()=>{
 const s=fixture(),before=JSON.stringify(s.tickets),records=JSON.stringify(s.approvalRecords);assert.equal(T.list(s).length,2);assert.equal(s.approvalRecords.length,6);assert.equal(T.ensure(s),false);assert.equal(JSON.stringify(s.tickets),before);
 const t=s.tickets.find(x=>x.id==='KS20261007-P41');t.proposal.refund=1;T.get(s,'approval-payment').name='新名称';assert.equal(JSON.stringify(s.approvalRecords),records);
});
test('reference forms retain the PDF fields and match product names to quantities without adding financial columns',()=>{
 const s=fixture(),t=s.tickets.find(x=>x.id==='KS20261007-P41'),payment=T.preview(T.get(s,'approval-payment'),t),purchase=T.preview(T.get(s,'approval-purchase'),t);
 assert.deepEqual(payment.missing,[]);assert.equal(payment.fields.find(f=>f.id==='total').value,500);
 assert.equal(purchase.fields.find(f=>f.id==='products').value,'舒缓修护霜 50g\n舒缓修护面膜 5片装');assert.equal(purchase.fields.find(f=>f.id==='quantity').value,'2\n1');
 assert(!purchase.fields.some(f=>f.type==='money'));assert(!payment.fields.some(f=>f.label==='工单编号'||f.label==='退款明细'));
 assert.equal(payment.fields.filter(f=>f.label==='附件').length,2);assert(payment.fields.some(f=>f.label==='客户ID号'));
 const both=T.preview(T.get(s,'approval-payment'),s.tickets.find(x=>x.id==='KS20261007-P40'));assert.equal(both.fields.find(f=>f.id==='total').value,600);assert.equal(both.fields.find(f=>f.id==='classification').value,'退款＋赔款');assert.match(both.fields.find(f=>f.id==='remark').value,/退款 500.00 元；赔款 100.00 元/);
});
test('required fields, scalar types, table row context, options and schema identity are checked',()=>{
 const s=fixture(),t=T.clone(T.get(s,'approval-payment'));t.fields=[];t.mappings={};T.loadSchema(t,T.LEGACY_CATALOG[0]);t.mappings.ticket.source='';assert.match(T.issues(t).join(','),/工单编号/);t.mappings.ticket.source='ticket.id';t.mappings.total.source='ticket.customer';assert.match(T.issues(t).join(','),/申请付款金额/);t.mappings.total.source='solution.total';t.mappings['refund-detail'].children.amount.source='row.unitPrice';assert.match(T.issues(t).join(','),/本次退款/);t.mappings['refund-detail'].children.amount.source='row.amount';t.mappings.method={mode:'constant',value:'现金'};assert.match(T.issues(t).join(','),/有效选项/);t.processCode='PROC-OTHER';assert.match(T.issues(t).join(','),/重新同步/);
});
test('preview exposes missing required data without changing tickets',()=>{const s=fixture(),t=T.clone(s.tickets.find(x=>x.id==='KS20261007-P41'));delete t.proposal.payout.account;const before=JSON.stringify(t),result=T.preview(T.get(s,'approval-payment'),t);assert(result.missing.includes('收款账户'));assert.equal(JSON.stringify(t),before);});
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
 const s=fixture();delete s.configuration.approvalIntegration;delete s.approvalRecordExamplesVersion;delete s.approvalRecords;s._revision=10;E.solutionMethods.normalizeTickets(s);const tickets=JSON.stringify(s.tickets),values=new Map([[Store.KEY,JSON.stringify(s)]]),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)},store=Store.createStore(storage,{...E,ensureExternalApprovalExamples:()=>false,ensureApprovalPresentation:()=>false},C),loaded=store.load();assert.equal(loaded._revision,11);assert.equal(JSON.stringify(loaded.tickets),tickets);assert.equal(store.load()._revision,11);
});
test('incomplete application fields stay visible and do not fall back to local approver buttons',()=>{
 const s=C.initialize(E.seed());T.ensure(s);const scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(x=>x.level===2));
 scene.config.ticketFlow.nodes.splice(1,scene.config.ticketFlow.nodes.length-2,{id:'ding-pay',type:'approval',provider:'dingtalk',title:'付款审批',templateId:'approval-payment',handling:{hours:18}},P.node('payment',s.configuration,scene));P.validate(scene,s.configuration);s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision,Date.now());
 const t=E.create(s,'chen',{name:'林女士',phone:'13800001002',order:'O2',store:'上海徐汇店',channel:'门店H5 / A3',title:'退款处理',description:'客户要求退款'});E.follow(s,t,t.currentAssignee,{connected:true,content:'线下已核实处理事项'});const before=E.clone(s);
 E.confirmSolution(s,t,E.taskPeople(s,t)[0],{typeKey:'refund',refund:10000,compensation:0,content:'按线下沟通结果处理',account:'原支付渠道',exchangeItems:[]});assert.equal(t.proposal.status,'已确认');assert.equal(E.currentFlowNode(t).provider,'dingtalk');assert.equal(E.externalApprovalRecord(s,t).status,'failed');assert.match(E.externalApprovalRecord(s,t).error,/申请资料缺失/);assert.doesNotMatch(E.externalApprovalRecord(s,t).error,/未连接/);assert.equal(t.state,'审批中');assert.deepEqual(E.taskPeople(s,t),[]);
});

test('template JSON round trip resolves source tags, constants, skipped fields and nested legacy tables',()=>{
 const s=fixture();for(const original of T.list(s)){const draft=T.clone(original),body=T.templateContent(draft);T.applyContent(draft,body);assert.deepEqual(draft.mappings,original.mappings);assert.deepEqual(T.issues(draft),[]);assert.deepEqual(T.preview(draft,s.tickets.find(t=>t.id==='KS20261007-P41')).fields,T.preview(original,s.tickets.find(t=>t.id==='KS20261007-P41')).fields);}
 const draft=T.clone(T.list(s)[0]),doc=JSON.parse(T.templateContent(draft));doc.fields.find(f=>f.id==='total').value='$solution_refund';doc.fields.find(f=>f.id==='tax').value=0;doc.fields.find(f=>f.id==='invoice').value=null;T.applyContent(draft,JSON.stringify(doc));assert.equal(draft.mappings.total.source,'solution.refund');assert.equal(draft.mappings.tax.value,0);assert.equal(draft.mappings.invoice.mode,'skip');
 assert.throws(()=>T.applyContent(draft,'{'),/JSON/);doc.fields[0].value='$unknown';assert.throws(()=>T.applyContent(draft,JSON.stringify(doc)),/未找到系统标签/);
 const legacy=T.newTemplate();T.loadSchema(legacy,T.LEGACY_CATALOG[0]);T.applyContent(legacy,T.templateContent(legacy));assert.equal(legacy.mappings['refund-detail'].children.amount.source,'row.amount');
});
test('reference upgrade preserves application snapshots, custom templates and existing fixed mappings',()=>{
 const s=fixture(),original=T.get(s,'approval-payment');original.fields=[];original.mappings={};T.loadSchema(original,T.LEGACY_CATALOG[0]);original.mappings.reason={mode:'constant',value:'既有依据'};const custom=T.clone(original);custom.id='custom-payment';T.list(s).push(custom);
 const tickets=JSON.stringify(s.tickets),records=JSON.stringify(s.approvalRecords),customBefore=JSON.stringify(custom);assert(T.ensure(s));assert.equal(original.schemaVersion,3);assert.equal(original.mappings.reason.value,'既有依据');assert.equal(JSON.stringify(custom),customBefore);assert.equal(JSON.stringify(s.tickets),tickets);assert.equal(JSON.stringify(s.approvalRecords),records);assert.equal(T.ensure(s),false);
});

test('uppercase payment values preserve yuan/jiao/fen and zero without changing cash totals',()=>{
 for(const [value,text] of [[0,'零元整'],[50000,'伍佰元整'],[60000,'陆佰元整'],[10001,'壹佰元零壹分'],[123456,'壹仟贰佰叁拾肆元伍角陆分'],[100000001,'壹佰万元零壹分']])assert.equal(T.amountWords(value),text);
});
