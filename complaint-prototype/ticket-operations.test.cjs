'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const E=require('./workflow/engine'),C=require('./configuration'),P=require('./ticket-flow-config')(C.Rules.Flow,C.STAFF,C.Assignment),Store=require('./shared-store');
const base={name:'林女士',phone:'13800001002',store:'上海徐汇店',order:'O2',channel:'门店H5 / A3',title:'退款处理',description:'客户申请未使用项目退款'};
function fixture(){const s=C.initialize(E.seed());E.prepareTickets(s);const scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(r=>r.level===2));scene.config.ticketFlow.nodes=[P.node('sales',s.configuration,scene),P.node('payment',s.configuration,scene),P.node('procurement',s.configuration,scene),P.node('close',s.configuration,scene)];s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);const o=s.orders.find(o=>o.id==='O2');o.items=[{id:'line1',name:'面部护理',quantity:2,paid:200000,refunded:0},{id:'line2',name:'修护护理',quantity:1,paid:o.paid-200000,refunded:o.refunded}];const t=E.create(s,'chen',base);E.follow(s,t,t.owner,{connected:true,content:'线下已确认退款与置换事项'});return {s,t,o};}
function proposal(){return {detailsVersion:2,refundReason:'退还未消费项目费用',compensationReason:'额外赔偿客户损失',delivery:{name:'林女士',phone:'13800001002',address:'上海市徐汇区漕溪北路88号601室'},typeKey:'refund_exchange',refundOrderId:'O2',refundItems:[{itemId:'line1',amount:10000},{itemId:'line2',amount:5000}],refund:15000,compensation:0,refundStore:'上海徐汇店',performanceId:'zhang',payout:{method:'bank',name:'林女士',account:'6222000000000000',bank:'工商银行上海支行'},exchangeItems:[{productId:'repair-cream',quantity:2,remark:'两件同批次'},{productId:'repair-mask',quantity:1,remark:'与面霜一起交付'}],content:'按线下确认事项处理'};}
const actor=(s,t)=>E.taskPeople(s,t)[0];
function confirm(s,t,p=proposal()){return E.confirmSolution(s,t,t.owner,p);}
function pay(s,t){E.pay(s,t,actor(s,t),{result:'成功',amount:t.proposal.refund+t.proposal.compensation,reference:'PAY-'+t.id,proof:[{name:'付款凭证'}]});}
test('detailed refund and multiple products persist, payment updates each item then enters procurement',()=>{
 const {s,t,o}=fixture();confirm(s,t);assert.equal(t.phase,'待付款');assert.equal(t.proposal.refund,15000);assert.equal(t.proposal.exchangeValue,48000);assert.equal(t.proposal.exchangeItems[1].remark,'与面霜一起交付');assert.equal(t.proposal.refundItems.length,2);assert.equal(t.proposal.payout.bank,'工商银行上海支行');assert.equal(t.proposal.performanceId,'zhang');pay(s,t);assert.equal(o.items[0].refunded,10000);assert.equal(o.items[1].refunded,5000);assert.equal(t.phase,'待采购办理');assert.equal(E.canCloseEarly(s,t,t.owner),false);assert.throws(()=>E.closeTicket(s,t,t.owner,{note:'跳过采购',completed:true}),/当前节点/);E.finishProcurement(s,t,'procurement',{method:'总部发货',items:E.procurementItems(t).filter(x=>x.remaining>0).map(x=>({lineIndex:x.lineIndex,quantity:x.remaining})),trackingNumber:'SF-TEST',note:'商品已发出'});E.closeTicket(s,t,t.owner,{note:'款项到账、商品签收',completed:true});assert.equal(t.state,'已结案');const loaded=E.clone(s),lt=loaded.tickets.find(x=>x.id===t.id);E.prepareTickets(loaded);assert.deepEqual(lt.proposal,t.proposal);
});
test('refund plus compensation clearly separates order refunds from extra payout',()=>{
 const {s,t,o}=fixture(),p={...proposal(),typeKey:'combined',compensation:2000,exchangeItems:[]};confirm(s,t,p);assert.equal(t.proposal.refund,15000);assert.equal(t.proposal.compensation,2000);pay(s,t);assert.equal(o.refunded,15000);assert.equal(t.payments[0].amount,17000);
});
test('solution attachments survive confirmation, reload and revision without sharing file objects',()=>{
 const {s,t}=fixture(),files=[{name:'处理依据.txt',type:'text/plain',size:6,data:'data:text/plain;base64,YWdyZWVk'}];
 confirm(s,t,{...proposal(),attachments:files});assert.deepEqual(t.proposal.attachments,files);assert.notEqual(t.proposal.attachments[0],files[0]);
 const loaded=E.clone(s),saved=loaded.tickets.find(row=>row.id===t.id);E.prepareTickets(loaded);assert.deepEqual(saved.proposal.attachments,files);
 E.pay(s,t,actor(s,t),{result:'退回',reason:'补充最新确认记录'});
 const next=[{...files[0],name:'最新处理依据.txt'}];confirm(s,t,{...proposal(),attachments:next});
 assert.deepEqual(t.proposalHistory[0].attachments,files);assert.deepEqual(t.proposal.attachments,next);
 next[0].name='修改外部输入';assert.equal(t.proposal.attachments[0].name,'最新处理依据.txt');
});
test('bank payout requires the account holder name before changing ticket data',()=>{
 const {s,t}=fixture(),p=proposal(),before=E.clone(s);p.payout.name='  ';
 assert.throws(()=>confirm(s,t,p),/开户姓名/);assert.deepEqual(E.clone(s),before);
});
test('solution reasons and recipient fields are required only for the selected handling items, without partial writes',()=>{
 const {s,t}=fixture(),p=proposal(),before=E.clone(s);
 for(const bad of [{refundReason:'  '},{delivery:{...p.delivery,name:''}},{delivery:{...p.delivery,phone:''}},{delivery:{...p.delivery,address:'  '}},{delivery:{...p.delivery,phone:'不是电话号码'}}]){
  assert.throws(()=>confirm(s,t,{...p,...bad}),/退款原因备注|收货/);assert.deepEqual(E.clone(s),before);
 }
 assert.throws(()=>confirm(s,t,{...p,typeKey:'combined',exchangeItems:[],compensation:1000,compensationReason:''}),/赔偿原因备注/);assert.deepEqual(E.clone(s),before);
 confirm(s,t,{...p,typeKey:'service',refund:0,compensation:0,exchangeItems:[],refundReason:'',compensationReason:'',delivery:{}});
 assert.equal(t.proposal.refundReason,undefined);assert.equal(t.proposal.compensationReason,undefined);assert.equal(t.proposal.delivery,undefined);
});
test('recipient and reasons persist independently through payment return and solution revision',()=>{
 const {s,t}=fixture(),p=proposal();p.refundReason='  按剩余疗程退款  ';confirm(s,t,p);
 assert.equal(t.proposal.refundReason,'按剩余疗程退款');assert.deepEqual(t.proposal.delivery,p.delivery);assert.notEqual(t.proposal.delivery,p.delivery);
 E.pay(s,t,actor(s,t),{result:'退回',reason:'核实资料'});const first=E.clone(t.proposal);
 confirm(s,t,{...p,typeKey:'combined',compensation:2000,exchangeItems:[],compensationReason:'客户额外交通费用'});
 assert.equal(t.proposal.compensationReason,'客户额外交通费用');assert.equal(t.proposal.delivery,undefined);assert.deepEqual(t.proposalHistory[0],first);
 const loaded=E.clone(s);E.prepareTickets(loaded);assert.deepEqual(loaded.tickets.find(x=>x.id===t.id).proposal,t.proposal);
});
test('refund validation rejects foreign orders, duplicate items, hidden amounts and invalid attribution atomically',()=>{
 const {s,t}=fixture();const p=proposal(),before=E.clone(s);for(const invalid of [{refundOrderId:'O1'},{refundItems:[{itemId:'bad',amount:15000}]},{refundItems:[{itemId:'line1',amount:10000},{itemId:'line1',amount:5000}]},{refund:15001},{refundItems:[{itemId:'line1',amount:200001}],refund:200001},{performanceId:'finance'},{performanceId:'li'},{refundStore:'不存在的门店'},{refundItems:[]},{refundItems:[{itemId:'line1',amount:-1}],refund:-1}]){assert.throws(()=>confirm(s,t,{...p,...invalid}));assert.deepEqual(E.clone(s),before);}
});
test('each payout method requires an actual account; bank also requires bank and numeric card',()=>{
 for(const method of ['bank','alipay','wechat']){const {s,t}=fixture(),p=proposal();p.payout.method=method;p.payout.account=method==='bank'?'6222000000000000':'customer.account';confirm(s,t,p);assert.equal(t.proposal.payout.method,method);}
 const {s,t}=fixture(),p=proposal();for(const payout of [{...p.payout,name:''},{...p.payout,account:''},{...p.payout,account:'原支付渠道'},{...p.payout,bank:''},{...p.payout,method:'unknown'}])assert.throws(()=>confirm(s,t,{...p,payout}));
});
test('order and item reservations prevent concurrent over-refunds and release on return',()=>{
 const {s,t}=fixture(),p=proposal();s.tickets=[t];p.refundItems=[{itemId:'line1',amount:180000}];p.refund=180000;confirm(s,t,p);const b=E.create(s,'chen',base);E.follow(s,b,b.owner,{connected:true,content:'已核实'});assert.throws(()=>confirm(s,b,{...proposal(),refundItems:[{itemId:'line1',amount:30000}],refund:30000}),/可退余额/);E.pay(s,t,actor(s,t),{result:'退回',reason:'重新确认金额'});confirm(s,b,{...proposal(),refundItems:[{itemId:'line1',amount:30000}],refund:30000});assert.equal(b.proposal.refund,30000);
});
test('payment rechecks each line and never changes ledger or records when a line balance changed',()=>{
 const {s,t,o}=fixture();confirm(s,t);o.items[0].refunded=199999;const before=E.clone(s);assert.throws(()=>pay(s,t),/项目可退余额/);assert.deepEqual(E.clone(s),before);
});
test('refund selection may differ from complaint order and only the selected order is debited',()=>{
 const {s,t,o}=fixture(),other={...E.clone(o),id:'SECOND',external:'SECOND-ORDER',items:[{id:'second1',name:'另一订单项目',paid:o.paid,refunded:0,quantity:1}]};s.orders.push(other);confirm(s,t,{...proposal(),refundOrderId:'SECOND',refundItems:[{itemId:'second1',amount:15000}]});pay(s,t);assert.equal(t.order,'O2');assert.equal(o.refunded,0);assert.equal(other.refunded,15000);
});
test('catalog products and quantities are validated and displayed prices cannot be forged',()=>{
 const {s,t}=fixture(),p=proposal();assert.throws(()=>confirm(s,t,{...p,exchangeItems:[{productId:'bad',quantity:1}]}),/商品/);assert.throws(()=>confirm(s,t,{...p,exchangeItems:[{productId:'repair-cream',quantity:0}]}),/数量/);confirm(s,t,{...p,exchangeItems:[{productId:'repair-cream',quantity:2,unitPrice:1,name:'伪造'}]});assert.equal(t.proposal.exchangeValue,36000);assert.equal(t.proposal.exchangeItems[0].name,'舒缓修护霜 50g');
});
test('new hotline and wechat tickets enter configured store handling; CRM goes straight to aftercare',()=>{
 for(const channel of ['400电话','经理热线','微信小程序','售后保障 / 企微','门店H5 / A3']){const s=C.initialize(E.seed()),t=E.create(s,'chen',{...base,channel});assert.equal(E.isStoreIntake(t),channel!=='门店H5 / A3');assert.equal(t.state,'待处理');if(E.isStoreIntake(t)){assert.equal(actor(s,t),'store2');assert.equal(t.owner,'');assert.equal(t.taskDeadline-t.assignedAt,t.flow.doc.stage.first*E.H);}else assert.equal(t.owner,'aftercare');}
});
test('store can resolve and close after effective contact without creating a solution or aftercare task',()=>{
 const s=C.initialize(E.seed()),t=E.create(s,'chen',{...base,channel:'400电话'}),whole=t.deadline;assert.equal(E.canCloseEarly(s,t,'store2'),false);assert.throws(()=>E.closeEarly(s,t,'store2',{note:'尚未联系',completed:true}));E.follow(s,t,'store2',{connected:false,content:'客户未接'});assert.equal(t.state,'处理中');assert.equal(E.canCloseEarly(s,t,'store2'),false);E.follow(s,t,'store2',{connected:true,content:'门店解释服务安排，客户已理解'});assert.equal(E.canCloseEarly(s,t,'store1'),false);assert.equal(E.canCloseEarly(s,t,'store2'),true);E.closeEarly(s,t,'store2',{note:'安抚后问题解决',completed:true});assert.equal(t.state,'已结案');assert.equal(t.proposal,null);assert.equal(t.deadline,whole);assert.deepEqual(E.taskPeople(s,t),[]);assert.equal(t.closure.kind,'store');
});
test('unresolved store ticket retains history and earliest contact but aftercare must contact customer itself',()=>{
 const s=C.initialize(E.seed()),t=E.create(s,'chen',{...base,channel:'400电话'});E.follow(s,t,'store2',{connected:true,content:'门店无法解决'});const first=t.firstContact,whole=t.deadline;E.finishStoreIntake(s,t,'store2',{note:'需售后协调退款'});assert.equal(t.owner,'aftercare');assert.equal(t.storeIntake.result,'unresolved');assert.equal(t.deadline,whole);assert.throws(()=>E.confirmSolution(s,t,t.owner,{typeKey:'service',content:'未重新联系'}),/售后先记录/);E.follow(s,t,t.owner,{connected:true,content:'售后解释后已解决'});assert.equal(t.firstContact,first);assert(E.canCloseEarly(s,t,t.owner));E.closeEarly(s,t,t.owner,{note:'售后安抚解决',completed:true});assert.equal(t.closure.kind,'sales');
});
test('configured reception teacher receives store entry; missing teacher stays pending and can retry',()=>{
 const s=C.initialize(E.seed()),scene=P.prepare(s.configuration,C.Rules.sceneList(s.configuration).find(r=>r.level===2));P.prepareEntry(s.configuration,scene);P.all(scene.config.ticketFlow.nodes).find(n=>n.entryRole==='store').source='receptionist';s.configuration=C.Rules.saveScene(s.configuration,'manager',scene,s.configuration.sceneRevision);const o=s.orders.find(o=>o.id==='O2');o.receptionistId='zhang';const a=E.create(s,'chen',{...base,channel:'微信小程序'});assert.equal(actor(s,a),'zhang');o.receptionistId='';const t=E.create(s,'chen',{...base,channel:'400电话'});assert.equal(t.pendingAssignment.mode,'entry-node');assert.equal(t.state,'待处理');o.receptionistId='zhang';E.retryStoreEntry(s,t,'manager');assert.equal(actor(s,t),'zhang');assert.equal(t.pendingAssignment,undefined);
});
test('early closure is blocked for grading, dispatch, other departments, suspended and already closed cases',()=>{
 const s=C.initialize(E.seed());E.prepareTickets(s);E.ensureWorkflowExamples(s);for(const suffix of ['W04','W05','W01','W02','P06','P11','P35','H02','C08']){const t=s.tickets.find(t=>t.id.endsWith('-'+suffix));assert.equal(E.canCloseEarly(s,t,actor(s,t)||t.owner),false,suffix);}const t=s.tickets.find(t=>t.id.endsWith('-P05'));assert(E.canCloseEarly(s,t,t.owner));E.closeEarly(s,t,t.owner,{note:'已解决',completed:true});assert.equal(t.state,'已结案');
});
test('manual early dispatch validates active candidates and preserves total deadline and rotation',()=>{
 const s=C.initialize(E.seed());E.prepareTickets(s);E.ensureWorkflowExamples(s);const t=s.tickets.find(t=>t.id.endsWith('-W01')),whole=t.deadline,cursors=E.clone(s.aftercareCursors||{});assert.throws(()=>E.assign(s,t,'finance','aftercare','越权'));assert.throws(()=>E.assign(s,t,'manager','finance','跨部门'));s.configuration.organization.appointments.find(p=>p.personId==='chen').active=false;assert.throws(()=>E.assign(s,t,'manager','chen','人员停用'));E.assign(s,t,'manager','aftercare','值班前先安排处理');assert.equal(t.owner,'aftercare');assert.equal(t.state,'待处理');assert.equal(t.deadline,whole);assert.equal(t.taskDeadline,t.assignedAt+t.flow.doc.stage.first*E.H);assert.deepEqual(s.aftercareCursors||{},cursors);assert.equal(t.pendingAssignment,undefined);
});
