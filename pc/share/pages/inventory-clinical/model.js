/* Intra-clinic custody, dispensing, tray verification and actual execution. */
(() => {
  const S=PCModules['supply-chain'],{get,must,positive,round,copy,uid}=S;
  const C={}, active=t=>!['已关闭','已取消'].includes(t.status);
  const record=(kind,m,d)=>({id:uid(kind),...copy(m),time:S.stamp(),createdBy:S.actor(d).id});
  const clinicalLots=(id,d=S.data)=>d.batches.filter(b=>b.assignedTreatment===id&&b.quantity>0);
  function patient(id,d){const p=get('patients',id,d);must(p&&p.status==='启用','请选择有效患者档案');return p}
  function doctor(id,store,d){const a=get('staff',id,d);must(a&&a.status==='启用'&&a.post==='医生','操作医生不可用');must(a.store===store||(a.practiceStores||[]).includes(store),'医生未登记在当前机构执业');must(d.qualifications.some(q=>q.staff===id&&q.name==='医师执业证'&&q.status==='有效'&&q.expiry>=S.today()),'医师资质无效或已到期');return a}
  function buildPlans(m,d=S.data){
    const p=patient(m.patient,d);must(get('stores',m.store,d)?.status==='启用','机构不可用');
    must(m.items?.length,'至少选择一个治疗项目');const plans=[],items=[];
    for(const [index,line] of m.items.entries()){
      const spec=get('specs',line.spec,d),service=get('services',spec?.service,d),bom=S.activeBom(line.spec,d);
      must(spec&&spec.status==='启用'&&service&&!['停用','归档'].includes(service.status),'项目或规格不可用');
      must(line.cardSale||service.status==='已上架','项目已停止新售');must(service.visibility!=='仅后台','内部结算项目不能用于治疗');
      if(service.visibility==='店长授权')must(get('staff',m.authorizer,d)?.post==='店长','该项目须登记授权店长');
      const st=get('stores',m.store,d);must(line.cardSale||['全部门店',m.store,st.brand,st.region,st.grade].includes(service.scope),'项目未在当前机构开放');
      must(Number.isInteger(Number(line.times))&&line.times>0,'治疗次数须为正整数');must(bom,'项目缺少已生效配方');
      const item={id:'ITEM-'+index,spec:spec.id,times:Number(line.times),name:service.name+' / '+spec.name,bom:copy(bom),cardSale:line.cardSale||'',price:line.cardSale?{price:get('cardSales',line.cardSale,d)?.unitValues?.[spec.id]||0,strategy:'已售卡权益快照',time:S.stamp()}:S.quotePrice(spec.id,m.store,p.member||'普通会员',false,S.today(),d)};
      if(item.cardSale){
        const cs=get('cardSales',item.cardSale,d),card=cs?.cardSnapshot||get('cards',cs?.card,d);must(cs&&cs.status==='有效'&&cs.expires>=S.today(),'卡项已失效或冻结');must(!d.cardEvents.some(e=>e.cardSale===cs.id&&['待审批','待退款'].includes(e.status)),'该卡有退款申请在处理');
        must(cs.customerId===p.id||cs.authorizedPatients?.includes(p.id),'该患者不是持卡人，且未获得代用授权');
        must(card.cross==='全部门店'||cs.store===m.store||card.cross==='同品牌'&&get('stores',cs.store,d).brand===st.brand,'不允许跨此机构核销');
        const held=(d.treatments||[]).filter(active).flatMap(t=>t.items).filter(i=>i.cardSale===cs.id&&i.spec===spec.id).reduce((n,i)=>n+i.times,0)+d.consumptions.filter(c=>c.cardSale===cs.id&&c.spec===spec.id&&['已预占','待偏差审批'].includes(c.status)).reduce((n,c)=>n+c.times,0)+items.filter(i=>i.cardSale===cs.id&&i.spec===spec.id).reduce((n,i)=>n+i.times,0);
        must((cs.remaining.find(x=>x.spec===spec.id)?.times||0)-held>=item.times,'卡内剩余次数不足或已被其他治疗单占用');
      }
      items.push(item);
      for(const [i,l] of bom.lines.entries()){
        const chosen=line.alternatives?.[i]||l.item;
        must(chosen===l.item||(l.alternatives||[]).includes(chosen),'物料不在允许替代范围内');
        const plan={id:item.id+'-'+i,item:item.id,type:l.type,sku:chosen,standard:round((l.baseQuantity??l.quantity)*item.times),min:round((l.baseMin??l.quantity)*item.times),max:round((l.baseMax??l.quantity)*item.times),unit:l.unit};
        if(l.type==='equipment'){
          const reference=get('equipment',l.item,d),candidates=d.equipment.filter(e=>e.store===m.store&&e.status==='使用中'&&(e.model||e.name)===(reference?.model||reference?.name));
          const eq=S.usableEquipment(line.equipment?.[i]||candidates[0]?.id,m.store,d);plan.equipment=eq.id;plan.sku=eq.id;plan.unit=eq.unit;
          must(eq.shots-S.heldShots(eq.id,d)-plans.filter(x=>x.equipment===eq.id).reduce((n,x)=>n+x.standard,0)>=plan.standard,'可预约发数不足');
          const heads=d.heads.filter(h=>h.equipment===eq.id&&h.status==='使用中');
          const head=get('heads',line.heads?.[i],d)||(heads.length===1?heads[0]:null);
          if(heads.length){must(head&&head.equipment===eq.id&&head.status==='使用中','请选择本次实际使用的治疗头');plan.head=head.id;const need=head.lifeUnit&&head.lifeUnit!=='次'?plan.standard:item.times;must(head.used+S.heldHeads(head.id,d)+need<=head.life,'治疗头寿命不足')}
        }else{const k=get('skus',chosen,d);must(k&&k.status==='启用','配方物料已停用');plan.unit=k.unit}
        plans.push(plan);
      }
    }
    if(plans.some(l=>l.type==='sku'&&get('skus',l.sku,d).doctor)){doctor(m.doctor,m.store,d);must(m.caseNo?.trim()&&m.consent?.trim(),'请关联病例号及知情同意记录')}
    return {items,plans};
  }
  function updateStatus(t,d){
    if(!t||['已关闭','已取消'].includes(t.status))return;
    if(t.cancelled){t.status=clinicalLots(t.id,d).length||d.internalIssues.some(x=>x.treatment===t.id&&x.status==='待签收')?'取消待退料':'待核对';return}
    if(t.executed){const x=get('clinicalExecutions',t.executed,d);t.status=x.status==='待偏差复核'?'待偏差复核':clinicalLots(t.id,d).length?'待余料处理':'待核对';return}
    if(t.trayApproved){t.status='已配台';return}
    if(t.traySubmitted){t.status='配台待复核';return}
    const ready=t.plans.filter(p=>p.type==='sku').every(p=>{
      const k=get('skus',p.sku,d),cap=k.trackOpened?S.unitFactor(k.id,k.containerUnit,d):1,need=k.trackOpened?p.requested??p.standard:p.requested??p.standard;
      return clinicalLots(t.id,d).filter(b=>b.planId===p.id&&!b.hold).reduce((n,b)=>n+b.quantity,0)>=need;
    });
    t.status=ready?'待配台':t.reservations.some(a=>a.issued>0)?'领料中':t.shortages?.length?'缺料待补':'待发料';
  }
  function reserveMissing(t,d){
    t.shortages=[];
    for(const p of t.plans.filter(p=>p.type==='sku')){
      const k=get('skus',p.sku,d),cap=k.trackOpened?S.unitFactor(k.id,k.containerUnit,d):1;
      const existing=t.reservations.filter(a=>a.plan===p.id).reduce((n,a)=>n+a.quantity-a.issued,0)+clinicalLots(t.id,d).filter(b=>b.planId===p.id&&!b.returnRequest).reduce((n,b)=>n+b.quantity,0);
      let left=round(Math.max(0,(p.requested??p.standard)-existing));
      const lots=d.batches.filter(b=>b.sku===k.id&&b.store===t.store&&!b.assignedTreatment&&S.usable(b,d,t.patient)&&get('warehouses',b.warehouse,d)?.status==='启用').sort((a,b)=>Number(!!b.customerId)-Number(!!a.customerId)||String(a.openExpiry||a.expiry).localeCompare(String(b.openExpiry||b.expiry)));
      for(const b of lots){
        if(!left)break;let q=Math.min(left,S.available(b));
        if(k.trackOpened&&!b.openedAt)q=Math.min(Math.ceil(left/cap)*cap,Math.floor(S.available(b)/cap)*cap);
        if(!q)continue;
        t.reservations.push({id:uid('ALLOC'),plan:p.id,sku:k.id,batch:b.id,quantity:q,issued:0});
        b.reserved=round(b.reserved+q);left=round(Math.max(0,left-q));
      }
      if(left)t.shortages.push({plan:p.id,sku:k.id,quantity:left,unit:k.unit});
    }
    updateStatus(t,d);return t;
  }
  function createTreatment(m){return S.transaction('院内 / 新建治疗领料单',d=>{
    const a=S.requirePermission('领用',m.store,d);must(m.sourceOrder?.trim()&&m.executionNo?.trim(),'请填写来源订单号和本次治疗执行号');
    must(!d.treatments.some(t=>t.executionNo===m.executionNo.trim()),'该治疗执行号已登记，请查看原单，避免重复领料');
    const p=patient(m.patient,d),plan=buildPlans(m,d);
    const t=record('TREAT',{...m,...plan,patient:p.id,customerId:p.id,customer:p.name,sourceOrder:m.sourceOrder.trim(),executionNo:m.executionNo.trim(),status:'待发料',reservations:[],shortages:[],sourceSnapshot:copy(m),createdBy:a.id},d);
    d.treatments.unshift(t);reserveMissing(t,d);return t;
  })}
  function replenish(id){return S.transaction('院内 / 补足领料',d=>{const t=get('treatments',id,d);S.requirePermission('领用',t.store,d);must(!t.executed&&!t.cancelled&&!t.traySubmitted,'当前阶段不能重新分配物料');return reserveMissing(t,d)})}
  function dispatch(id,m){return S.transaction('院内 / 发料',d=>{
    const t=get('treatments',id,d),a=S.requirePermission('院内发料',t?.store,d);
    must(t&&!t.executed&&!t.cancelled&&!t.traySubmitted,'治疗单已进入执行阶段');must(m.lines?.some(l=>l.quantity>0),'至少发出一项物料');
    const receiver=get('staff',m.receiver,d);must(receiver&&receiver.status==='启用'&&receiver.id!==a.id,'请选择另一位有效接收人');
    const doc=record('ISSUE',{treatment:id,store:t.store,receiver:receiver.id,status:'待签收',lines:[]},d);
    for(const line of m.lines.filter(l=>l.quantity>0)){
      const allocation=t.reservations.find(x=>x.id===line.allocation);must(allocation,'领料明细不存在');
      const b=get('batches',allocation.batch,d),k=get('skus',b.sku,d);S.checkQuantity(k.id,Number(line.quantity),d);
      must(S.usable(b,d,t.patient)&&line.quantity<=round(allocation.quantity-allocation.issued)&&line.quantity<=b.reserved,'批次不可用或发料超过剩余申请量');
      const zone=S.zoneAccepts(line.warehouse,k.id,t.store,d);must(['治疗室','科室'].includes(zone.purpose),'请选择治疗室的实物接收库位');
      const cap=k.trackOpened&&!b.openedAt?S.unitFactor(k.id,k.containerUnit,d):line.quantity;
      must(Math.abs(line.quantity/cap-Math.round(line.quantity/cap))<1e-7,'未开封物料须按完整容器发料');
      for(let left=line.quantity;left>0;left=round(left-cap)){
        const quantity=Math.min(cap,left),dest={...copy(b),id:uid('WARD'),quantity:0,reserved:0,originBatch:b.id,originWarehouse:b.warehouse,physicalWarehouse:b.warehouse,targetWarehouse:zone.id,assignedTreatment:id,planId:allocation.plan,hold:'院内待签收',locationKind:'院内交接',source:doc.id};
        if(k.trackOpened)dest.containerCode=b.containerCode||uid('BOTTLE');if(k.udiRequired)must(b.udi,'物料缺少追溯码，须补齐入库追溯记录');
        b.reserved=round(b.reserved-quantity);S.movement(d,b,-quantity,'院内发料转出',doc.id);d.batches.push(dest);S.movement(d,dest,quantity,'院内发料转入',doc.id);dest.reserved=quantity;
        doc.lines.push({allocation:allocation.id,batch:dest.id,sku:b.sku,quantity,unit:k.unit,warehouse:zone.id,containerCode:dest.containerCode||'',origin:b.id});
      }
      allocation.issued=round(allocation.issued+line.quantity);
    }
    d.internalIssues.unshift(doc);updateStatus(t,d);return doc;
  })}
  function receiveIssue(id,m={}){return S.transaction('院内 / 签收发料',d=>{
    const doc=get('internalIssues',id,d),t=get('treatments',doc?.treatment,d),a=S.requirePermission('院内签收',doc?.store,d);
    must(doc?.status==='待签收','发料单已处理');must(a.id===doc.receiver,'须由指定接收人登录当前办理账号签收');must(a.id!==doc.createdBy,'发料人与签收人须分离');
    for(const line of doc.lines){const b=get('batches',line.batch,d);S.zoneAccepts(line.warehouse,b.sku,doc.store,d);b.warehouse=line.warehouse;b.physicalWarehouse=line.warehouse;b.hold='';b.locationKind=t?'治疗室待配台':'科室备货'}
    Object.assign(doc,{status:'已签收',receivedBy:a.id,receivedAt:S.stamp(),note:m.note||''});updateStatus(t,d);return doc;
  })}
  function submitTray(id,m){return S.transaction('院内 / 配台核对',d=>{
    const t=get('treatments',id,d),a=S.requirePermission('配台',t?.store,d);updateStatus(t,d);
    must(t.status==='待配台','物料须全部签收后再配台');must(m.patientConfirmed===true&&m.orderConfirmed===true,'请核对患者身份与治疗单');
    const lots=clinicalLots(id,d);
    for(const b of lots){must(S.usable(b,d,t.patient,id),'配台物料已锁定或失效');const k=get('skus',b.sku,d),entry=m.checks?.find(x=>x.batch===b.id);must(entry&&entry.confirmed===true,'请逐项核对物料、规格、批号和效期');if(k.trackOpened||k.udiRequired)must(entry.code===(b.containerCode||b.udi),'瓶号 / 追溯码与发料实物不一致')}
    const doc=record('TRAY',{treatment:id,store:t.store,patient:t.patient,status:'待复核',checks:copy(m.checks),note:m.note||''},d);
    d.trayChecks.unshift(doc);t.traySubmitted=doc.id;updateStatus(t,d);return doc;
  })}
  function reviewTray(id,m){return S.transaction('院内 / 配台独立复核',d=>{
    const doc=get('trayChecks',id,d),t=get('treatments',doc?.treatment,d);must(doc?.status==='待复核','配台已处理');
    const a=S.differentReviewer(doc.createdBy,'配台复核',doc.store,d);must(m.note?.trim(),'请填写复核结果');
    if(m.result==='退回'){doc.status='已退回';delete t.traySubmitted;delete t.trayApproved;updateStatus(t,d)}
    else{for(const b of clinicalLots(t.id,d))must(S.usable(b,d,t.patient,t.id),'物料已锁定或失效，请重新处理');doc.status='已复核';t.trayApproved=doc.id;updateStatus(t,d)}
    Object.assign(doc,{reviewer:a.id,reviewedAt:S.stamp(),reviewNote:m.note});return doc;
  })}
  function openLot(d,t,b,code){
    if(b.openedAt)return b;const k=get('skus',b.sku,d);must(k.trackOpened,'该物料不按瓶管理');
    const reserve=b.reserved;b.reserved=0;
    const opened=S.openContainer(d,b,t.id,code);opened.assignedTreatment=t.id;opened.planId=b.planId;opened.physicalWarehouse=b.warehouse;opened.reserved=opened.quantity;b.reserved=round(Math.max(0,reserve-opened.quantity));
    return opened;
  }
  function openForTreatment(id,m){return S.transaction('院内 / 单支开封登记',d=>{
    const t=get('treatments',id,d);S.requirePermission('治疗执行',t?.store,d);must(t.trayApproved&&!t.executed&&!t.cancelled,'请先完成配台复核');
    let b=get('batches',m.batch,d);must(b?.assignedTreatment===id&&!b.hold,'瓶号不属于本次治疗');b=openLot(d,t,b,m.code);
    if(m.reconstitution){
      const k=get('skus',b.sku,d);must(k.reconstitutionRequired&&k.unit==='U','此物料未配置按剂量配制');must(!b.preparation,'本瓶已登记配制记录');
      const r=m.reconstitution;positive(r.volume,'配制后体积');must(r.reference?.trim()&&r.solvent?.trim(),'请填写医生确认记录与配制用液批号');
      doctor(t.doctor,t.store,d);b.preparation={...copy(r),units:b.capacity,concentration:round(b.capacity/Number(r.volume)),doctor:t.doctor,operator:S.actor(d).id,time:S.stamp()};
    }
    return b;
  })}
  function actualBase(b,e,d){const k=get('skus',b.sku,d);if(k.reconstitutionRequired&&e.unit==='ml'){must(b.preparation&&b.preparation.concentration>0,'请先登记本瓶经医生确认的配制记录');return S.checkQuantity(k.id,round(Number(e.quantity)*b.preparation.concentration),d,true)}return S.convertUnits(k.id,Number(e.quantity),e.unit||k.unit,d,true)}
  function execute(id,m){return S.transaction('院内 / 登记实际治疗用量',d=>{
    const t=get('treatments',id,d),a=S.requirePermission('治疗执行',t?.store,d);must(t?.trayApproved&&!t.executed&&!t.cancelled,'该治疗单不可重复执行');
    must(['完成','中断'].includes(m.outcome),'请选择治疗结果');if(m.outcome==='中断')must(m.reason?.trim(),'请填写治疗中断原因');
    const lots=clinicalLots(id,d);must(!d.internalIssues.some(x=>x.treatment===id&&x.status==='待签收'),'仍有未签收物料');
    const allEntries=[],totals=new Map(t.plans.map(p=>[p.id,0])),allocations=[],shots=[],seen=new Set();
    for(const e of m.entries||[]){
      const origin=get('batches',e.batch,d);must(origin&&origin.assignedTreatment===id&&!seen.has(e.batch),'瓶号 / 批次无效或重复');seen.add(e.batch);
      must(S.usable(origin,d,t.patient,id),'当前物料已失效、隔离或停用');let b=origin;const k=get('skus',b.sku,d),q=actualBase(b,e,d);
      must(q<=b.quantity,'实际使用量超过本瓶 / 本批实物量');if(q>0&&k.trackOpened&&!b.openedAt)b=openLot(d,t,b,e.code);
      if(q>0&&k.reconstitutionRequired)must(b.preparation,'须先登记本瓶配制依据及剂量换算');
      if(q>0){const x={batch:b.id,sku:b.sku,quantity:q,cost:b.cost,line:b.planId,containerCode:b.containerCode||'',businessQuantity:Number(e.quantity),businessUnit:e.unit||k.unit};allocations.push(x);b.reserved=round(Math.max(0,b.reserved-q));S.movement(d,b,-q,'项目消耗',id);totals.set(b.planId,round((totals.get(b.planId)||0)+q))}
      allEntries.push({...copy(e),actual:q,baseUnit:k.unit,batch:b.id,plan:b.planId,containerCode:b.containerCode||''});
    }
    must(lots.every(b=>seen.has(b.id)),'所有已配台物料均须填写实际用量；未使用填 0');
    for(const p of t.plans.filter(p=>p.type==='equipment')){
      const e=m.shots?.find(x=>x.plan===p.id);must(e&&Number.isInteger(Number(e.quantity))&&e.quantity>=0,'请填写每台仪器的实际发数，未使用填 0');
      const eq=S.usableEquipment(p.equipment,t.store,d),q=Number(e.quantity);must(eq.shots-S.heldShots(eq.id,d,id)>=q,'实际发数超出未被其他治疗单占用的余额');
      if(p.head){const h=get('heads',p.head,d),times=t.items.find(x=>x.id===p.item).times,used=h.lifeUnit&&h.lifeUnit!=='次'?q:q>0?times:0;must(h.status==='使用中'&&h.used+S.heldHeads(h.id,d,id)+used<=h.life,'本次治疗头不可用或寿命不足');h.used+=used}
      eq.shots-=q;shots.push({equipment:eq.id,quantity:q,cost:round(q*(eq.shotCost||0)),line:p.id});totals.set(p.id,q);if(q)d.shotLogs.unshift({id:uid('SHOT'),equipment:eq.id,quantity:-q,amount:round(q*(eq.shotCost||0)),kind:'项目消耗',source:id,time:S.stamp(),status:'已入账'});
    }
    if(allocations.some(x=>get('skus',x.sku,d).doctor))doctor(t.doctor,t.store,d);
    const deviations=t.plans.filter(p=>totals.get(p.id)<p.min||totals.get(p.id)>p.max).map(p=>({...copy(p),actual:totals.get(p.id)}));
    if(deviations.length)must(m.reason?.trim(),'实际用量超出范围，请记录原因');
    const doc=record('EXEC',{treatment:id,store:t.store,patient:t.patient,customer:t.customer,outcome:m.outcome,entries:allEntries,allocations,shots,reason:m.reason||'',deviations,status:deviations.length?'待偏差复核':'已确认',cost:round(allocations.reduce((n,x)=>n+x.quantity*x.cost,0)+shots.reduce((n,x)=>n+x.cost,0))},d);
    d.clinicalExecutions.unshift(doc);t.executed=doc.id;t.outcome=m.outcome;t.executionAt=S.stamp();
    for(const b of clinicalLots(id,d)){b.reserved=0;b.locationKind=b.openedAt?'治疗后余量':'未开封待退'}
    for(const item of t.items){
      const planIds=new Set(t.plans.filter(p=>p.item===item.id).map(p=>p.id)),used=allocations.filter(x=>planIds.has(x.line)),shotRows=shots.filter(x=>planIds.has(x.line));
      const c=record('USE',{sourceTreatment:id,sourceOrder:t.sourceOrder,executionNo:t.executionNo,customer:t.customer,customerId:t.patient,store:t.store,spec:item.spec,times:item.times,name:item.name,bom:item.bom,doctor:t.doctor,caseNo:t.caseNo,consent:t.consent,operator:a.id,reviewer:get('trayChecks',t.trayApproved,d)?.reviewer,allocations:copy(used),shots:copy(shotRows),status:'已消耗',confirmed:S.stamp(),cost:round(used.reduce((n,x)=>n+x.quantity*x.cost,0)+shotRows.reduce((n,x)=>n+x.cost,0)),actualTotals:t.plans.filter(p=>planIds.has(p.id)).map(p=>({...p,actual:totals.get(p.id),sku:p.type==='equipment'?p.equipment:p.sku})),deviations:deviations.filter(p=>planIds.has(p.id)),actualReason:m.reason||'',clinicalReview:doc.status},d);d.consumptions.unshift(c);
    }
    updateStatus(t,d);return doc;
  })}
  function reviewExecution(id,m){return S.transaction('院内 / 实际用量差异复核',d=>{
    const e=get('clinicalExecutions',id,d),t=get('treatments',e?.treatment,d);must(e?.status==='待偏差复核','该执行记录已复核');
    const a=S.differentReviewer(e.createdBy,'临床复核',e.store,d);must(m.note?.trim(),'请填写差异认定及处理意见');
    e.status='已确认';e.reviewer=a.id;e.reviewNote=m.note;e.reviewedAt=S.stamp();d.consumptions.filter(c=>c.sourceTreatment===t.id).forEach(c=>{c.clinicalReview='已确认';c.actualReview={reviewer:a.id,note:m.note,time:S.stamp()}});updateStatus(t,d);return e;
  })}
  function cancelTreatment(id,m){return S.transaction('院内 / 取消治疗',d=>{
    const t=get('treatments',id,d);S.requirePermission('领用',t?.store,d);must(t&&!t.executed&&!t.cancelled,'已执行治疗须登记中断结果并按实核对');must(m.reason?.trim(),'请填写取消原因');
    for(const a of t.reservations){const b=get('batches',a.batch,d),unissued=round(a.quantity-a.issued);b.reserved=round(b.reserved-unissued);a.quantity=a.issued}
    t.cancelled=S.stamp();t.cancelReason=m.reason;t.outcome='取消';for(const b of clinicalLots(id,d))b.reserved=0;updateStatus(t,d);return t;
  })}
  function requestReturn(id,m){return S.transaction('院内 / 退料及余量处理',d=>{
    const t=get('treatments',id,d),a=S.requirePermission('院内签收',t?.store,d);must(t&&(t.executed||t.cancelled),'先登记治疗结果或取消治疗，再处理剩余物料');
    const b=get('batches',m.batch,d);must(b&&b.assignedTreatment===id&&!b.returnRequest&&!b.hold,'物料不属于本单或已进入处置');
    positive(m.quantity);const q=S.checkQuantity(b.sku,Number(m.quantity),d);must(q<=b.quantity,'处理量超过剩余量');must(m.reason?.trim(),'请填写退料 / 余量处理依据');
    const k=get('skus',b.sku,d),doc=record('RETURN',{...copy(m),treatment:id,store:t.store,sku:b.sku,sourceBatch:b.id,unit:k.unit,status:'待验收'},d);
    if(m.kind==='未开封退库'){
      must(!b.openedAt,'已开封物料不得作为未开封退库');if(k.trackOpened)must(Number.isInteger(q/S.unitFactor(k.id,k.containerUnit,d)),'退库须按完整容器');
      const z=S.zoneAccepts(m.warehouse,b.sku,t.store,d);const dest={...copy(b),id:uid('RETLOT'),quantity:0,reserved:0,returnRequest:doc.id,hold:'院内退料待验收',targetWarehouse:z.id,source:doc.id};
      b.reserved=0;S.movement(d,b,-q,'院内退料转出',doc.id);d.batches.push(dest);S.movement(d,dest,q,'院内退料转入',doc.id);doc.batch=dest.id;
    }else if(['客户寄存','继续本班次使用','保留治疗头'].includes(m.kind)){
      must(b.openedAt&&q===b.quantity,'开封余量须整瓶登记去向');must(S.usable(b,d,t.patient,id),'已失效或隔离的余量不能留存');
      S.zoneAccepts(m.warehouse,b.sku,t.store,d);b.warehouse=m.warehouse;b.physicalWarehouse=m.warehouse;b.reserved=0;
      S.setRemainder(d,b,m.kind,{customerId:t.patient,customer:t.customer,shiftEnd:m.shiftEnd},id);
      b.assignedTreatment='';doc.batch=b.id;doc.status='已登记';
    }else{
      must(m.kind==='报损销毁','请选择有效的处理方式');must(q===b.quantity,'待处置余量须整瓶 / 批次登记');
      b.reserved=0;b.hold='待报损';b.assignedTreatment='';b.locationKind='报损待处置';
      const loss=record('LOSS',{batch:b.id,store:t.store,quantity:q,reason:t.cancelled?'治疗取消余量':t.outcome==='中断'?'治疗中断':'治疗后余量销毁',subject:'存货损失',note:m.reason,status:'待审批',source:id,returnRequest:doc.id},d);
      d.losses.unshift(loss);doc.batch=b.id;doc.loss=loss.id;doc.status='待销毁复核';
    }
    d.internalReturns.unshift(doc);updateStatus(t,d);return doc;
  })}
  function acceptReturn(id,m){return S.transaction('院内 / 验收退料',d=>{
    const r=get('internalReturns',id,d),a=S.differentReviewer(r?.createdBy,'退料验收',r?.store,d);must(r?.status==='待验收','退料已处理');
    must(m.note?.trim(),'请填写包装、效期与储存条件检查结果');const b=get('batches',r.batch,d);
    if(m.result==='合格退库'){
      must(m.packaging===true&&m.temperature===true&&!b.openedAt&&S.daysLeft(b)>=0,'包装、储存及效期不满足退库条件');S.zoneAccepts(r.warehouse,b.sku,r.store,d);
      b.warehouse=r.warehouse;b.physicalWarehouse=r.warehouse;b.hold='';b.quality='合格';b.locationKind='门店库存';r.status='已退库';
    }else{b.hold='';b.quality='待确认';b.locationKind='质量隔离';r.status='已转质量隔离'}
    b.assignedTreatment='';b.reserved=0;Object.assign(r,{reviewer:a.id,reviewNote:m.note,reviewedAt:S.stamp()});updateStatus(get('treatments',r.treatment,d),d);return r;
  })}
  function reconciliation(id,d=S.data){
    const t=get('treatments',id,d),issued=d.internalIssues.filter(x=>x.treatment===id&&!x.status.startsWith('已拒收')).flatMap(x=>x.lines);
    return t.plans.filter(p=>p.type==='sku').map(p=>{
      const received=issued.filter(x=>get('batches',x.batch,d)?.planId===p.id).reduce((n,x)=>n+x.quantity,0);
      const used=d.clinicalExecutions.filter(x=>x.treatment===id).flatMap(x=>x.allocations).filter(x=>x.line===p.id).reduce((n,x)=>n+x.quantity,0);
      const returns=d.internalReturns.filter(x=>x.treatment===id&&get('batches',x.sourceBatch,d)?.planId===p.id);
      const returned=returns.filter(x=>['已退库','已转质量隔离'].includes(x.status)).reduce((n,x)=>n+x.quantity,0);
      const kept=returns.filter(x=>x.status==='已登记').reduce((n,x)=>n+x.quantity,0);
      const lost=returns.filter(x=>x.loss&&get('losses',x.loss,d)?.status==='已报损').reduce((n,x)=>n+x.quantity,0);
      return {plan:p.id,sku:p.sku,unit:p.unit,issued:round(received),used:round(used),returned:round(returned),kept:round(kept),lost:round(lost),unresolved:round(received-used-returned-kept-lost)};
    });
  }
  function closeTreatment(id,m){return S.transaction('院内 / 核销结算核对',d=>{
    const t=get('treatments',id,d),a=S.requirePermission('财务',t?.store,d);must(t&&active(t)&&(t.executed||t.cancelled),'治疗尚未完成或已经关闭');
    must(!clinicalLots(id,d).length&&!d.internalIssues.some(x=>x.treatment===id&&x.status==='待签收'),'仍有院内物料未签收或未处理');
    must(!d.internalReturns.some(r=>r.treatment===id&&!['已登记','已退库','已转质量隔离','已销毁'].includes(r.status)&&!(r.loss&&get('losses',r.loss,d)?.status==='已报损')),'仍有退料或销毁未完成');
    must(reconciliation(id,d).every(x=>x.unresolved===0),'领用、实际使用与余料去向尚未对平');
    if(t.executed)must(get('clinicalExecutions',t.executed,d).status==='已确认','实际用量偏差尚未复核');
    must(m.note?.trim(),'请填写核销 / 收费核对依据');
    const billing=[];
    for(const item of t.items){
      const row=m.items?.find(x=>x.item===item.id);must(row&&Number.isInteger(Number(row.times))&&row.times>=0&&row.times<=item.times,'请逐项确认实际核销次数');must(!t.cancelled||row.times===0,'取消治疗不得扣卡次数');
      if(t.outcome!=='完成'||row.times!==item.times)must(m.note.trim(),'非完整治疗须明确核销处理依据');
      let amount=round(row.times*item.price.price);
      if(item.cardSale&&row.times>0){
        const cs=get('cardSales',item.cardSale,d),right=cs?.remaining.find(x=>x.spec===item.spec);must(cs&&right&&right.times>=row.times,'卡权益已变化，请重新核对');must(cs.status==='有效','卡项已冻结或失效，请先处理权益');
        amount=round(row.times*(cs.unitValues?.[item.spec]??cs.amount/cs.initialTimes));right.times-=row.times;
        if(cs.remaining.every(x=>x.times===0))amount=round(cs.amount-cs.recognized-(cs.refunded||0));
        cs.recognized=round(cs.recognized+amount);must(cs.recognized+(cs.refunded||0)<=cs.amount+.0001,'卡项结转金额异常');
        const redemption=record('RD',{cardSale:cs.id,customer:cs.customer,customerId:t.patient,item:item.id,spec:item.spec,store:t.store,saleStore:cs.store,times:row.times,amount,source:id,status:'已核销'},d);d.redemptions.unshift(redemption);
        if(cs.store!==t.store){must(Number.isFinite(Number(m.performerShare))&&m.performerShare!==''&&m.performerShare>=0&&m.performerShare<=100,'跨店核销须确认执行店分摊比例');d.settlements.unshift(record('SET',{from:cs.store,to:t.store,source:id,redemption:redemption.id,recognized:amount,ratio:Number(m.performerShare),amount:round(amount*m.performerShare/100),status:'待确认',basis:m.note},d))}
      }
      billing.push({item:item.id,spec:item.spec,times:Number(row.times),amount,cardSale:item.cardSale});
    }
    t.billing=billing;t.billingNote=m.note;t.billingBy=a.id;t.closedAt=S.stamp();t.status=t.cancelled?'已取消':'已关闭';t.sourceSync='待原订单核对';
    return t;
  })}

  function supplement(id,m){return S.transaction('院内 / 追加领料',d=>{
    const t=get('treatments',id,d);S.requirePermission('领用',t?.store,d);must(t&&active(t)&&!t.executed&&!t.cancelled,'治疗已执行或取消，不能追加领料');must(m.reason?.trim()&&m.reference?.trim(),'请记录追加原因及医生确认 / 医嘱依据');
    const p=t.plans.find(p=>p.id===m.plan&&p.type==='sku');must(p,'请选择本单配方物料');const q=S.convertUnits(p.sku,Number(m.quantity),m.unit,d);positive(q);
    t.amendments||=[];t.amendments.push(record('ADD',{...m,quantity:q,unit:p.unit,previous:p.requested??p.standard},d));p.requested=round((p.requested??p.standard)+q);
    if(t.traySubmitted){const tray=get('trayChecks',t.traySubmitted,d);tray.status='追加后待重配';delete t.traySubmitted;delete t.trayApproved}
    reserveMissing(t,d);return t;
  })}
  function wardMove(m){return S.transaction('院内 / 科室备货移库',d=>{
    const b=get('batches',m.batch,d),a=S.requirePermission('院内发料',b?.store,d);must(b&&S.usable(b,d)&&!b.openedAt&&!b.assignedTreatment,'请选择未开封且未分配治疗的库存');
    const q=S.convertUnits(b.sku,Number(m.quantity),m.unit,d),k=get('skus',b.sku,d);must(q<=S.available(b),'移库量超过可用库存');if(k.trackOpened)must(Number.isInteger(q/S.unitFactor(k.id,k.containerUnit,d)),'按完整容器移库');
    const z=S.zoneAccepts(m.warehouse,b.sku,b.store,d);must(z.id!==b.warehouse,'调出与接收库位不能相同');must(get('staff',m.receiver,d)?.status==='启用'&&m.receiver!==a.id,'请选择另一位接收人员');must(m.reason?.trim(),'请记录科室领用用途');
    const doc=record('WARD-ISSUE',{store:b.store,receiver:m.receiver,reason:m.reason,status:'待签收',kind:'科室备货',lines:[]},d),dest={...copy(b),id:uid('WARD-STOCK'),quantity:0,reserved:0,hold:'院内待签收',physicalWarehouse:b.warehouse,targetWarehouse:z.id,originWarehouse:b.warehouse,originBatch:b.id,source:doc.id};
    d.batches.push(dest);S.movement(d,b,-q,'院内移库转出',doc.id);S.movement(d,dest,q,'院内移库转入',doc.id);doc.lines.push({batch:dest.id,sku:b.sku,quantity:q,unit:k.unit,warehouse:z.id,origin:b.id});d.internalIssues.unshift(doc);return doc;
  })}
  function rejectIssue(id,m){return S.transaction('院内 / 拒收交接',d=>{
    const doc=get('internalIssues',id,d),a=S.requirePermission('院内签收',doc?.store,d),t=get('treatments',doc?.treatment,d);must(doc?.status==='待签收'&&a.id===doc.receiver,'须由指定接收人处理未签收单据');must(m.reason?.trim(),'请填写拒收及退回实物情况');
    for(const l of doc.lines){const b=get('batches',l.batch,d);b.reserved=0;b.hold='';b.quality='待确认';b.assignedTreatment='';b.locationKind='交接拒收待验';if(t){const allocation=t.reservations.find(x=>x.id===l.allocation);allocation.issued=round(allocation.issued-l.quantity);allocation.quantity=round(allocation.quantity-l.quantity)}}
    doc.status='已拒收待验';doc.rejectReason=m.reason;doc.receivedBy=a.id;doc.receivedAt=S.stamp();if(t)reserveMissing(t,d);return doc;
  })}
  function sourceConfirm(id,m){return S.transaction('院内 / 原订单核对',d=>{const t=get('treatments',id,d);S.requirePermission('财务',t?.store,d);must(t&&!active(t)&&t.sourceSync==='待原订单核对','请先完成治疗核对或此单已经确认');must(m.voucher?.trim()&&m.note?.trim(),'请填写原系统核销 / 订单核对凭据');t.sourceSync='已人工核对';t.sourceConfirmation={...copy(m),actor:S.actor(d).id,time:S.stamp()};return t})}
  Object.assign(C,{supplement,wardMove,rejectIssue,sourceConfirm,active,buildPlans,clinicalLots,createTreatment,replenish,dispatch,receiveIssue,submitTray,reviewTray,openForTreatment,execute,reviewExecution,cancelTreatment,requestReturn,acceptReturn,reconciliation,closeTreatment,updateStatus});
  S.clinic=C;
})();
