(function(root){
'use strict';
const scenarios=[
['S01','简单合并','一方活跃订单；确认身份后保留有效业务。','store','E-MB-01','advisor'],
['S02','单方预约金','保留有预约金一方，另一线上订单合并预约流退。','pc','P-MG-03','ops'],
['S03','双方预约金有效','按先付款优先，核对保护期与订单处置。','pc','P-MG-03','ops'],
['S04','双方预约金过期','按最近支付优先，区别于双方有效规则。','pc','P-MG-03','ops'],
['S05','无预约金难裁决','双方都有排客人，进入人工仲裁。','pc','P-MG-03','ops'],
['S06','子订单已到店','拦截并保护签到、到店与消耗事实。','pc','P-MG-03','ops'],
['S07','资产或充值拦截','须先财务核查，再确认合并方案。','pc','P-MG-03','finance'],
['S08','同号至少三档案','展示多档案拦截，不自动串联合并。','pc','P-MG-03','ops'],
['S09','身份维度冲突','手机号与同平台身份指向第三方，人工核查。','pc','P-MG-03','ops'],
['S10','确认独立客户','建立排除记录，后续检测跳过该档案对。','pc','P-MG-03','ops'],
['S11','冷静期可撤销','预览后恢复原快照，保留撤销记录。','pc','P-MR-02','ops'],
['S12','冷静期禁止撤销','已有后续业务，阻断覆盖式恢复。','pc','P-MR-02','ops'],
['S13','普通纠错全流程','店长审批后，进入快照、三类数据、拆回与确认。','approval','A-EC-01','manager'],
['S14','高风险与退款冲销','6000 元冲销与 -500 元退款；店长→运营→财务。','approval','A-EC-01','manager'],
['S15','跨门店调整确认','财务、静安店长和徐汇店长全部确认才完成。','approval','A-AD-01','finance'],
['S16','快照过期手工调账','超过 12 个月，不显示完整快照恢复能力。','pc','P-MR-02','ops'],
['S17','人工判断归属','补充依据后分流至直接转移或冲销清单。','store','M-CO-02','manager'],
['S18','白条不一致','暂停处理；填写修复和复核依据后恢复。','pc','P-EC-09','ops'],
['S19','部分执行失败','已成功项目保留，仅重试失败项。','pc','P-EC-05','ops'],
['S20','重复确认与旧版本','同一调整单跨窗口处理，只允许有效且未完成的确认。','approval','A-AD-01','finance'],
['S21','纠错补录订单','创建关联原流退单的新订单，原状态保持。','pc','P-EC-05','ops'],
['S22','发布规则新版本','草稿试算后发布，在途工单保留原规则快照。','pc','P-RC-02','admin']
].map(([id,title,description,port,page,actor])=>({id,title,description,port,page,actor}));
function create(id){const s=CMSeed.create(),n=+id.slice(1),r=s.requests[0],a=s.customers.find(x=>x.id===r.a),b=s.customers.find(x=>x.id===r.b),oa=s.orders.find(x=>x.customerId===a.id),ob=s.orders.find(x=>x.customerId===b.id),days=d=>new Date(Date.now()-d*86400000).toISOString();let record=r.id;
if(n<=10){r.source='手机号录入';r.assignee='manager';if(n===1){ob.status='已超时';ob.deposit=0;b.name=a.name;b.birthday=a.birthday}if(n===2){oa.deposit=500;ob.deposit=0}if(n===3){oa.deposit=ob.deposit=500;oa.paidAt=days(20);ob.paidAt=days(10)}if(n===4){oa.deposit=ob.deposit=500;oa.paidAt=days(150);ob.paidAt=days(120)}if(n===5){oa.deposit=ob.deposit=0;oa.scheduler='林悦';ob.scheduler='何嘉宁'}if(n===6){ob.status='已到店';ob.arrived=true}if(n===7){b.balance=1800;b.rechargedAt=days(40)}if(n===8){s.customers[4].phone=a.phone;s.customers[4].identities[0].value=a.phone}if(n===9){s.customers[4].identities[1].value=b.identities[1].value}if(n===10){r.reason='请核实家人共用手机号，确认是否为独立客户';}}
if(n===11||n===12)record=s.merges[n===11?1:2].id;
if(n===13){const c=s.corrections[0];s.customers=s.customers.filter(x=>x.id!==c.newId);c.newId=null;c.status='待审批';c.step=3;c.approved=false;c.assignee='manager';c.approvalStage=0;record=c.id}
if(n===14)record=s.corrections[1].id;
if(n===15||n===20)record=s.corrections[2].id;
if(n===16)record=s.merges[3].id;
if(n===17)record=s.corrections[5].id;
if(n===18)record=s.corrections[3].id;
if(n===19){const c=s.corrections[0];c.items.filter(x=>x.kind==='transfer').forEach(x=>x.confirmed=true);c.items[0].simulateFailure=true;record=c.id}
if(n===21){const c=s.corrections[5],o=s.orders.find(x=>x.originalCustomerId===c.child);o.status='已流退';o.arrived=false;o.mergeReturn=true;o.cancelledSchedule=true;record=c.id}
if(n===22)record='';s.activeScenario=id;return {state:s,record};}
root.CMScenarios={list:scenarios,create};if(typeof module!=='undefined')module.exports=root.CMScenarios;
})(typeof window!=='undefined'?window:globalThis);
