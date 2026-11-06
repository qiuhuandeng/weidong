/* Complaint-only demonstration fixtures. No stored data is written here. */
(() => {
  const customers = [
    ['王秀珍','150****3858','河源源城店','staff','这个顾客想退款，需要售后打电话协助沟通。已做两次项目，补了5800元疗程，顾客不愿继续到店。','2026-10-19 16:23','杨晓燕','待处理','',null],
    ['小海军','136****1211','厦门湖里店','wechat','购买时承诺免费提供扁平疣治疗，到店后告知需要另付费，希望按原承诺提供服务。','2026-10-19 14:37','客户本人','待处理','',null],
    ['付婧','191****8186','上海静安店','mini','门店没有按照顾客要求操作，对沟通过程和服务态度不满意，希望客服协助处理。','2026-10-18 14:10','客户本人','待处理','',null],
    ['李焰','139****2002','厦门思明店','wechat','项目体验与广告介绍不一致，希望退回未消费的费用。','2026-10-18 19:39','客户本人','处理中','推广','广告宣传'],
    ['日暮林间','182****4727','乐山市中店','staff','顾客反馈项目效果不符合预期，希望核对已做项目和剩余疗程后协商退款。','2026-10-19 16:23','吴鲜娇','处理中','门店','皮肤效果'],
    ['张丽华','137****7297','福州台江店','staff','顾客做完项目后反馈皮肤不适，希望售后回电，协助核实操作记录并安排复查。','2026-10-19 16:18','张婷婷','待处理','',null],
    ['陈女士','176****5776','南京建邺店','mini','我想取消预约，一直不回消息。之前已经和邀约人说明原因，希望尽快回复。','2026-10-14 01:46','客户本人','处理中','销售','前端话术'],
    ['邵瑞琴','138****5132','厦门湖里店','wechat','做的项目说第二次可以做，但是找不到地址了，希望联系原门店确认。','2026-10-18 18:37','客户本人','待处理','',null],
    ['祝老师','182****4065','十堰茅箭店','staff','项目报废，申请维护，客户反馈光电操作过程不适，希望核实当日操作老师。','2026-10-19 16:04','朱玲玲','处理中','门店','光电操作'],
    ['陈小悦','186****9108','杭州上城店','mini','交了20元定金，预约前咨询的价格和门店实际报价不同，希望说明收费项目。','2026-10-13 14:20','客户本人','已完成','销售','咨询报价'],
    ['阮淑贞','136****6947','厦门思明店','wechat','对广告中的项目效果有疑问，希望核实疗程内容和宣传依据。','2026-10-18 18:34','客户本人','处理中','推广','广告宣传'],
    ['岑秀清','134****7926','成都百里湿江店','staff','顾客因自身原因无法继续项目，申请核实剩余服务并协商处理。','2026-10-19 16:07','王晓凤','已完成','门店','顾客自身'],
    ['林女士','130****3650','杭州临平店','mini','原门店已搬迁，希望确认新的服务门店，并处理未完成的疗程。','2026-10-14 09:12','客户本人','待处理','',null],
    ['谢国森','180****7661','南京建邺店','wechat','对服务沟通不满意，希望客服尽快联系并协商未消费部分。','2026-10-18 18:12','客户本人','已完成','门店','门店服务'],
    ['鑫鑫航航','183****3898','南昌东湖店','staff','客服承诺的服务内容与到店沟通有差异，需要核对预约微信记录及门店沟通情况。','2026-10-19 16:03','肖玉红','待处理','',null],
    ['刘晴','138****6219','杭州上城店','mini','客户已提出取消预约，但尚未收到明确回复，希望客服协助确认。','2026-10-19 17:10','客户本人','待处理','',null],
    ['周女士','159****3076','苏州姑苏店','staff','客户反馈项目后不适，门店已上报，希望售后协助核实操作过程并安排复查。','2026-10-19 17:05','杨晓燕','待处理','',null],
    ['林小溪','137****9082','厦门思明店','wechat','广告宣传的服务范围与到店说明不一致，希望核对预约承诺并提供解决方案。','2026-10-19 17:00','客户本人','待处理','',null],
    ['顾女士','139****0286','杭州上城店','mini','预约前已提出取消服务，希望核对未消费项目并协商退款，请售后回电。','2026-11-03 09:20','客户本人','待处理','',null],
    ['许女士','158****6312','苏州姑苏店','staff','客户对到店收费说明有疑问，门店已提交反馈，请售后核实预约时的报价。','2026-11-03 09:35','杨晓燕','待处理','',null],
    ['赵女士','135****7208','杭州上城店','mini','购买疗程后因工作调动无法继续到店，希望核对未消费项目并申请退款，请售后联系说明办理方式。','2026-11-03 10:20','客户本人','待处理','',null],
    ['陈晓雨','137****6049','苏州姑苏店','staff','客户反馈上次到店等待时间较长，预约项目未能按时完成，希望门店说明原因并重新安排服务，已提交售后协助。','2026-11-03 10:35','张婷婷','待处理','',null],
    ['林女士','159****8176','厦门思明店','wechat','微信支付购买的服务与预约时介绍不一致，希望核实原订单及服务范围，并协商未消费部分的处理。','2026-11-03 10:50','客户本人','待处理','',null],
    ['唐女士','138****6241','厦门思明店','staff','已确认未消费项目退款金额，请尽快完成审批。','2026-11-03 11:05','陈琳','财务审批中','门店','门店多收'],
    ['赵先生','159****3816','杭州上城店','mini','客户同意以商品置换处理，请确认采购安排。','2026-11-03 11:18','客户本人','采购审批中','门店','门店服务'],
    ['吴女士','136****5903','苏州姑苏店','wechat','退款方案已确认，客户在等待付款到账。','2026-11-03 11:32','客户本人','待财务付款','销售','咨询报价'],
    ['孙女士','187****2409','成都百里湿江店','staff','置换商品已确认，请按地址安排发货。','2026-11-03 11:46','杨晓燕','待采购发货','门店','门店服务'],
    ['钱女士','135****7062','南京建邺店','mini','退款已到账，请客服回访确认处理结果。','2026-11-03 12:02','客户本人','客服复核中','推广','广告宣传']
  ];
  const demoScenarios = [
    ['门店','门店服务','manager','2级','我已经做了两次，不想继续疗程，请帮我核对还能退多少。','门店未及时说明剩余疗程的处理方式，退款诉求多次转交后未明确回复。','已与门店核对两次消费记录和剩余项目，整理可协商方案，等待客户确认。','客户已确认剩余项目处理方案，回访确认无其他诉求。'],
    ['推广','广告宣传','promoter','3级','预约时说包含扁平疣治疗，到店又说要收费，我希望按承诺处理。','预约引流内容未明确免费服务范围，与到店实际收费口径不一致。','已定位预约微信及对应加微记录，要求推广核对宣传内容，并与门店确认服务范围。','已向客户说明服务范围并落实协商方案，客户确认处理结果。'],
    ['门店','脱毛操作','operator','2级','我提前说明了操作要求，但老师没有确认就开始了，沟通时也没有解释清楚。','操作前未充分确认客户需求，操作后的解释与安抚不及时。','已联系操作老师核对当日记录，由店长与客户确认后续复查和服务安排。','客户已完成回访，对后续服务安排表示认可。'],
    ['推广','广告宣传','promoter','3级','体验和广告介绍有差别，未消费的部分我想申请退回。','广告对体验内容的描述不够完整，客户预期与实际交付存在差异。','已核对广告页面和预约沟通，整理已消费与未消费项目，等待退款方案确认。','已完成未消费部分的协商处理，客户确认无其他问题。'],
    ['门店','皮肤效果','operator','2级','做完疗程后没有达到当时沟通的预期，希望核对项目并协商剩余疗程。','门店未持续跟进阶段性反馈，对疗程效果和预期的沟通不足。','已核对疗程进度，安排接待老师回访客户，并协商剩余项目的处理方式。','客户已确认剩余疗程处理方案，回访结束。'],
    ['门店','光电操作','operator','3级','做完项目后皮肤不舒服，我先联系了邀约老师，希望尽快安排复查。','操作后的注意事项说明及回访不充分，客户反馈后未及时安排复查。','已协调操作老师核对当次记录，联系客户确认可到店的复查时间。','客户已完成复查并确认后续安排，门店持续回访。'],
    ['销售','前端话术','inviter','1级','我已经说过要取消预约，但一直没有收到回复。','邀约人未及时响应客户取消预约的明确诉求，沟通记录中缺少处理反馈。','已定位原预约微信，通知邀约人核对取消诉求并向客户明确答复。','取消预约事项已处理，客户确认收到回复。'],
    ['门店','闭店','manager','2级','上次说第二次还可以做，但我找不到原门店了，请帮我确认去哪里。','门店地址变更后未及时通知存量客户，也未明确后续服务承接安排。','已由店长核对未完成疗程，联系承接门店确认地址和可预约时间。','客户已确认承接门店及预约安排，后续服务衔接完成。'],
    ['门店','光电操作','operator','3级','光电操作时感觉不舒服，希望核实当天是哪位老师操作，并说明后续安排。','操作中未及时记录并处理客户的不适反馈，需由当次操作老师核实服务过程。','已调取操作维护记录并联系操作老师，安排店长协调复查及后续服务。','复查及后续服务已确认，客户回访结束。'],
    ['销售','咨询报价','inviter','1级','我交了定金，预约前说的价格和门店报的价格不一样。','预约报价未明确包含项目和额外费用，前端沟通口径不完整。','已核对预约报价和门店项目明细，向客户逐项说明收费内容。','已按协商口径确认费用，客户认可说明并确认本次投诉结束。'],
    ['推广','广告宣传','promoter','2级','广告中的疗程内容和效果我没有理解清楚，希望提供准确的说明。','广告对项目适用范围和效果表述不清，客户未获得充分说明。','已联系对应推广人核对宣传依据，整理疗程说明后向客户回电解释。','客户已收到完整疗程说明，确认无其他疑问。'],
    ['门店','顾客自身','manager','1级','我个人时间安排有变化，没办法继续做，想协商剩余服务。','客户个人安排变更导致无法继续履约，由门店负责剩余服务核实与协商。','已核对剩余权益及有效期，与客户沟通延期或调整服务的可选方案。','客户已选择并确认延期服务方案，门店完成登记，回访无异议。'],
    ['门店','闭店','manager','4级','原门店搬走了，还有没做完的疗程，请帮我安排后续服务。','原门店搬迁后的客户告知及疗程承接不及时，未形成明确服务安排。','已核实剩余疗程，协调临近门店承接，等待客户确认新的到店时间。','新的承接门店及疗程安排已获客户确认。'],
    ['门店','门店服务','manager','2级','门店沟通的态度让我不满意，未消费的部分希望有人明确处理。','门店接待沟通不充分，客户表达诉求后未得到清晰的处理反馈。','已由店长复核接待过程，并就未消费部分与客户协商处理方式。','店长已完成回访及协商处理，客户确认接受结果。'],
    ['销售','前后端服务','inviter','2级','线上说的服务和到店说的不一样，希望把预约时的聊天记录核对清楚。','线上预约承诺与门店交接信息不一致，邀约环节未完整同步服务内容。','已核对预约微信记录及门店接待记录，协调销售和店长统一处理口径。','服务内容已核对并落实，客户确认后续安排。'],
    ['销售','前端话术','inviter','1级','我已经说了取消预约，一直没有收到回复。','咨询未及时响应客户取消预约的请求。','已联系咨询核对预约状态，等待客户确认取消结果。','预约已取消，客户确认无需其他协助。'],
    ['门店','光电操作','operator','3级','做完项目后感觉不舒服，希望核实当天的操作情况。','操作后的注意事项说明及回访不充分。','已联系操作老师核对记录，正在协调复查时间。','客户已完成复查，确认后续服务安排。'],
    ['推广','广告宣传','promoter','2级','广告说包含的项目，到店后却说不包含，请核对清楚。','宣传服务范围不明确，与门店执行口径存在差异。','已定位预约微信及推广人，核对广告内容与门店服务范围。','服务范围已核对并按协商方案落实，客户确认接受。'],
    ['销售','前端话术','inviter','1级','请核对还没有消费的项目，回电说明退款如何处理。','','',''],
    ['销售','咨询报价','inviter','2级','到店后说明的费用和预约报价不一致，请帮忙核实。','','',''],
    ['门店','顾客自身','manager','1级','工作调动后无法继续到店，希望核对剩余项目并说明退款方式。','','',''],
    ['门店','门店服务','manager','2级','预约了却等了很久，希望说明原因，并重新安排服务。','','',''],
    ['推广','广告宣传','promoter','2级','支付购买的服务与预约介绍不一致，请核对订单和服务范围。','','',''],
    ['门店','门店多收','manager','2级','已确认未消费项目退款金额，请尽快完成审批。','已核对订单实收与未消费项目，提交退款方案等待财务审批。','退款金额及收款资料已核对，等待财务审批意见。',''],
    ['门店','门店服务','manager','2级','客户同意以商品置换处理，请确认采购安排。','已确认置换商品、收货地址及库存需求，提交采购审批。','置换商品清单已确认，等待采购审批结果。',''],
    ['销售','咨询报价','inviter','2级','退款方案已确认，客户在等待付款到账。','退款金额与收款账户已核对，财务审批通过后等待付款。','已完成审批，等待财务登记付款结果。',''],
    ['门店','门店服务','manager','2级','置换商品已确认，请按地址安排发货。','采购审批已通过，待采购按客户确认的地址安排发货。','待登记发货方式、物流单号及本次发货数量。',''],
    ['推广','广告宣传','promoter','2级','退款已到账，请客服回访确认处理结果。','财务已登记付款凭证，待客服联系客户确认到账和处理结果。','待核对付款结果并回访客户确认。','']
  ];
  // One complete example per status. Existing customer records are never replaced.
  const lifecycleStatuses=['待处理','客服已接单','客服处理中','财务审批中','采购审批中','待财务付款','待采购发货','客服复核中','已结案'];
  const lifecycleCustomers=[['何女士','138****2901'],['郑女士','139****2902'],['冯女士','137****2903'],['蒋女士','136****2904'],['韩女士','135****2905'],['许先生','134****2906'],['宋女士','133****2907'],['沈女士','132****2908'],['陆女士','131****2909']];
  const lifecycleContent=[
    '客户反馈服务介绍与到店体验有差异，希望核对未消费项目并协商处理。',
    '客服已接单并确认客诉等级，待进一步联系客户核实诉求。',
    '客户暂不接受退款金额，客服正在沟通退款及商品置换方案。',
    '客户已确认退款及商品置换方案，待财务审核退款金额。',
    '财务审批已通过，待采购审核置换商品清单。',
    '退款及置换方案均已审批通过，待财务执行退款。',
    '退款已支付，待采购按确认的商品及数量安排发货。',
    '退款已到账、商品已发货，客服正在核实客户是否签收及有无其他诉求。',
    '退款已到账、商品已签收，客户确认处理完成，工单已结案。'
  ];
  lifecycleCustomers.forEach(([name,phone],i)=>{
    customers.push([name,phone,'杭州上城店',['mini','staff','wechat'][i%3],lifecycleContent[i],`2026-11-03 13:${String(i).padStart(2,'0')}`,'客户本人',lifecycleStatuses[i],'门店','门店服务']);
    demoScenarios.push(['门店','门店服务','manager','2级',lifecycleContent[i],'服务介绍与实际交付存在差异，门店解释及跟进不及时。','客户希望核对退款金额并确认置换商品。','客户确认退款到账、商品签收，同意结案。']);
  });
  for(const [name,phone,content]of [['魏女士','138****2910','退款方案被财务驳回，请客服核对未消费项目后重新提交。'],['姚女士','139****2911','退款审批已在钉钉撤销，待客服修正收款账号后重新提交。']]){
    customers.push([name,phone,'杭州上城店','mini',content,'2026-11-06 09:00','客户本人','客服处理中','门店','门店服务']);
    demoScenarios.push(['门店','门店服务','manager','2级',content,'退款资料需要进一步核实。','','']);
  }
  function completeLifecycleExample(r,order){
    const i=['31038','31039'].includes(r.id)?3:Number(r.id)-31029;if(i<0||i>=lifecycleStatuses.length)return false;
    const actor='林晓（售后客服）',staff=['',actor,actor,'陆清（财务）','王珊（采购）','陈敏（财务）','李江（采购）',actor,actor];
    const at=minutes=>new Date(Date.parse(r.created.replace(' ','T')+':00Z')+minutes*60000).toISOString().slice(0,16).replace('T',' ');
    const add=(kind,minutes,data)=>r.follows.unshift({id:`${r.id}-lifecycle-${kind}-${minutes}`,kind,time:at(minutes),actor,files:[],mock:true,...data});
    const status=lifecycleStatuses[i],refund=Math.min(120000,order.projects[0].paid),product={id:'repair-cream',productId:'repair-cream',name:'舒缓修护霜 50g',unitPrice:18000,quantity:2};
    Object.assign(r,{status,level:'2级',linked:[{id:order.id,wechatId:order.bookingWechatId}],currentHandler:staff[i]});
    if(i===0)return true;
    Object.assign(r,{acceptedAt:at(5),acceptedBy:actor});
    add('accept',5,{action:'客服接单',beforeStatus:'待处理',status:'客服已接单',level:r.level,note:'已接单，确认客诉等级为 2级。'});
    if(i===1)return true;
    Object.assign(r,{startedAt:at(10),startedBy:actor,department:['门店'],type:'门店服务',responsible:[order.manager],reason:'服务介绍与实际交付存在差异，门店解释及跟进不及时。',assessedAt:at(10),assessedBy:actor,handlingPlan:'unresolved'});
    add('assessment',10,{action:'责任认定',beforeStatus:'客服已接单',status:'客服处理中',department:r.department,type:r.type,responsible:r.responsible,reason:r.reason,handlingPlan:r.handlingPlan});
    add('follow',20,{beforeStatus:'客服处理中',status:'客服处理中',communication:{result:'ongoing',reason:'正和客户协商退款金额',reasonSource:'demands'},note:'客户认为退款金额偏低，已核对消费明细，继续协商退款及商品置换方案。'});
    if(i===2)return true;
    const item=order.projects[0],solution={detailsVersion:5,handlingMethods:['refund','exchange'],refund,refundOrders:[{orderId:order.id,store:order.store,customerName:r.name,refund,refundItems:[{itemId:item.id,name:item.name,quantity:item.quantity,consumedQuantity:0,refundedQuantity:0,reservedQuantity:0,remainingBefore:1,refundQuantity:1,remainingAfter:0,paid:item.paid,amount:refund}]}],exchangeItems:[product],delivery:{name:r.name,phone:r.phone,address:'杭州市上城区客户确认收货地址（示例）'},payout:{method:'wechat',name:r.name,account:'示例客户微信收款账户'},attachments:[]};
    if(['31038','31039'].includes(r.id))solution.delivery.phone=r.id==='31038'?'13800002910':'13900002911';
    Object.assign(r,{customerSolution:solution,compensatedAt:at(30),compensatedBy:actor});
    add('compensation',30,{action:'保存解决方案',beforeStatus:'客服处理中',status:'财务审批中',customerSolution:solution,note:'客户确认退款及商品置换方案。'});
    for(const [step,minutes,action,next]of [[3,40,'财务审批','采购审批中'],[4,50,'采购审批','待财务付款']]){
      if(i<step)continue;
      const passed=i>step;
      add('workflow',passed?minutes:minutes-5,{action,actor:staff[step],beforeStatus:lifecycleStatuses[step],status:passed?next:lifecycleStatuses[step],fields:[['审批结果',passed?'已通过':'审批中']],note:passed?(step===3?'退款金额及收款资料核对通过。':'置换商品及数量审核通过。'):'已提交审批，等待审批意见。'});
    }
    if(i>=5)add('workflow',55,{action:'财务付款',actor:staff[5],beforeStatus:'待财务付款',status:'待财务付款',fields:[['付款结果','待执行'],['待付金额',`¥ ${(refund/100).toFixed(2)}`]],note:'审批已通过，待财务执行付款。'});
    if(i>=6){
      r.payments=[{id:`${r.id}-payment`,nodeId:'example-payment',at:at(60),actor:staff[5],result:'成功',amount:refund,reference:`DEMO-PAY-${r.id}`,proof:[],mock:true}];
      add('workflow',65,{action:'采购发货',actor:staff[6],beforeStatus:'待采购发货',status:'待采购发货',fields:[['发货内容',`${product.name} × 2`],['发货进度','待安排发货']],note:'退款已完成，待采购安排商品发货。'});
    }
    if(i>=7){
      r.handlingRecords=[{id:`${r.id}-shipment`,nodeId:'example-procurement',kind:'procurement',action:'shipment',at:at(70),actor:staff[6],method:'总部发货',items:[product],trackingNumber:`DEMO-SF-${r.id}`,note:'按客户确认地址发货。',files:[],mock:true}];
      add('workflow',80,{action:'客服复核',beforeStatus:'客服复核中',status:i===8?'已结案':'客服复核中',fields:[['复核结果',i===8?'客户确认处理完成':'退款已确认到账，商品签收待确认'],['客户反馈',i===8?'商品已签收，客户无其他诉求。':'客户确认退款已到账，等待签收置换商品。']],note:i===8?'客户确认退款到账、商品签收，同意结案。':'已核实退款到账，继续跟进商品签收。'});
    }
    if(i===8){
      Object.assign(r,{closedAt:at(90),closedBy:actor,closeNote:'退款及商品置换已完成，客户确认无其他诉求，同意结案。',handlingPlan:'resolved'});
      add('closure',90,{nodeId:'example-closed',beforeStatus:'客服复核中',status:'已结案',note:r.closeNote});
    }
    return true;
  }
  // A read-only deadline example for existing prototype rows without a saved clock.
  // Never seed configuration or attach demonstration clocks to customer-created rows.
  function timingExample(r,configuredTiming=null){
    const index=Number(r.id)-31001,customer=customers[index];
    if(!r.demoDetailsVersion||!customer||customer[0]!==r.name||customer[1]!==r.phone||r.customerId!=='C'+index)return null;
    const follows=r.follows||[],lastCommunication=follows.find(item=>item.kind==='follow'&&item.communication?.result==='ongoing');
    const startedAt=lastCommunication?.time||r.acceptedAt||follows.find(item=>item.kind==='accept')?.time||r.startedAt||r.assessedAt||r.created;
    const start=Date.parse(String(startedAt||'').replace(' ','T').slice(0,16)+':00+08:00');
    const timing=configuredTiming||{value:({'1级':3,'2级':2,'3级':1,'4级':0.5,'5级':0.25})[r.level],unit:'days'};
    if(!Number.isFinite(start)||!timing.value)return null;
    const endings=[r.compensatedAt,r.closedAt,...follows.filter(item=>['compensation','closure'].includes(item.kind)||item.communication?.result==='agreed').map(item=>item.time)].filter(Boolean).sort();
    return {startedAt,dueAt:start+timing.value*(timing.unit==='days'?86400000:3600000),endedAt:endings.find(value=>String(value).replace('T',' ')>=String(startedAt).replace('T',' '))||'',mock:true};
  }
  window.PCModules['complaint-fixtures']={render(){},customers,demoScenarios,completeLifecycleExample,timingExample};
})();
