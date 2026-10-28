/* Shared inventory rules. UI modules use this ledger and never keep a second stock balance. */
(() => {
  const S=PCModules['supply-chain'],{get,must,positive,round,copy,uid}=S;
  const permissions=['主数据','采购','采购审批','库存查询','调拨','调拨审批','领用','院内发料','院内签收','配台','配台复核','治疗执行','临床复核','退料验收','盘点','报损审批','质量','报表','财务','系统管理'];
  let actorId;try{actorId=sessionStorage.getItem('weid-inventory-actor')}catch{}
  const actor=(d=S.data)=>get('staff',actorId||'INV-ADMIN',d);
  function setActor(id){must(get('staff',id)?.status==='启用','账号不可用');actorId=id;try{sessionStorage.setItem('weid-inventory-actor',id)}catch{}return actor()}
  function roles(d=S.data){const a=actor(d);return (a?.roles||[]).map(id=>get('roles',id,d)).filter(r=>r?.status==='启用')}
  function can(permission,store,d=S.data){const a=actor(d);if(!a||a.status!=='启用')return false;return roles(d).some(r=>(!permission||r.permissions.includes(permission)||r.permissions.includes('系统管理'))&&(!store||r.scope==='全部门店'||r.scope===store||(r.stores||[]).includes(store)))}
  function requirePermission(permission,store,d=S.data){must(can(permission,store,d),'当前办理人无'+permission+'权限或不在可见机构范围内');return actor(d)}
  function differentReviewer(previous,permission,store,d=S.data){const a=requirePermission(permission,store,d);must(a.id!==previous,'须由另一位有权限的人员独立复核');return a}
  function authorizeTransaction(label,d){
    if(/升级|初始化|开瓶余量到期锁定/.test(label))return;
    const p=/审批流|角色|账号权限/.test(label)?'系统管理':/采购.*审核|purchases \/ approve|applications \/ approve|firstReviews \/ approve/.test(label)?'采购审批':/报损审核/.test(label)?'报损审批':/调拨.*(approve|deny)/.test(label)?'调拨审批':/调拨/.test(label)?'调拨':/采购|purchases|purchaseReturns|applications/.test(label)?'采购':/付款|财务|payments|settlements|回款|售卡|核销结算/.test(label)?'财务':/盘点/.test(label)?'盘点':/召回|质量|冷链/.test(label)?'质量':/BOM|合并服务|服务项目批量/.test(label)?'主数据':null;
    if(p)requirePermission(p,null,d);
  }
  function zoneAccepts(zone,sku,store,d=S.data){const z=get('warehouses',zone,d),k=get('skus',sku,d);must(z&&z.status==='启用'&&z.store===store&&z.type!=='虚拟库位','请选择所属机构的有效实物库位');must(z.category==='全部类型'||z.category===k.category,'库位不接收该类物料');must(!k.cold||z.cold===true||['冷藏柜','管制药柜'].includes(z.type),'冷链物料须存放在受温度管理的库位');must(!k.controlled||z.controlled===true||z.type==='管制药柜','管制物料须存放在管制库位');return z}
  function usableEquipment(id,store,d=S.data){const e=get('equipment',id,d);must(e&&e.store===store&&e.status==='使用中','所选仪器不属于当前机构或不可使用');return e}
  function heldHeads(id,d=S.data,except=''){const h=get('heads',id,d);return (d.treatments||[]).filter(t=>t.id!==except&&!t.cancelled&&!t.executed&&activeHead(t)).reduce((n,t)=>n+t.plans.filter(p=>p.head===id).reduce((v,p)=>v+(h.lifeUnit&&h.lifeUnit!=='次'?p.standard:t.items.find(i=>i.id===p.item)?.times||0),0),0)}
  const activeHead=t=>!['已取消','已关闭'].includes(t.status);
  function heldShots(id,d=S.data,except=''){return d.consumptions.filter(c=>c.id!==except&&['已预占','待偏差审批'].includes(c.status)).flatMap(c=>c.shots||[]).filter(x=>x.equipment===id).reduce((n,x)=>n+x.quantity,0)+(d.treatments||[]).filter(t=>t.id!==except&&!t.executed&&!t.cancelled&&!['已取消','已关闭'].includes(t.status)).flatMap(t=>t.plans).filter(p=>p.type==='equipment'&&p.equipment===id).reduce((n,p)=>n+p.standard,0)}
  function traceBatches(id,d=S.data,exact=false){const source=get('batches',id,d);if(!source)return [];const root=source.traceRoot||source.id;return d.batches.filter(b=>exact?(source.containerCode?b.containerCode===source.containerCode:(b.traceRoot||b.id)===root):b.sku===source.sku&&b.batch===source.batch)}
  function traceUses(id,d=S.data,exact=false){const ids=new Set(traceBatches(id,d,exact).map(b=>b.id));return [...d.consumptions,...d.retail,...d.adjustments].filter(c=>c.allocations?.some(a=>ids.has(a.batch))&&['已消耗','已出库','已调整','已执行待复核'].includes(c.status))}
  function reconcileLedger(d){
    for(const b of d.batches){b.traceRoot||=b.parent?get('batches',b.parent,d)?.traceRoot||b.parent:b.id;if(b.physicalWarehouse)b.warehouse=b.physicalWarehouse}
    for(const u of d.udi){const b=get('batches',u.batch,d);if(!b)continue;const lots=d.batches.filter(x=>x.quantity>0&&((x.traceRoot||x.id)===(b.traceRoot||b.id)||b.containerCode&&x.containerCode===b.containerCode));u.status=lots.some(x=>x.quality==='召回锁定')?'已召回':lots.length?'在库':'已使用';u.currentLocations=lots.map(x=>x.warehouse)}
    for(const r of d.internalReturns||[])if(r.loss&&get('losses',r.loss,d)?.status==='已报损'){r.status='已销毁';r.reviewer=get('losses',r.loss,d).reviewer||r.reviewer;r.reviewedAt=get('losses',r.loss,d).reviewedAt||r.reviewedAt}
  }
  function reserveMaterial(d,sku,store,quantity,customerId){
    let left=quantity;const out=[],k=get('skus',sku,d),cap=k.trackOpened?S.unitFactor(sku,k.containerUnit,d):1;
    const lots=d.batches.filter(b=>b.sku===sku&&b.store===store&&S.usable(b,d,customerId)).sort((a,b)=>Number(!!b.customerId)-Number(!!a.customerId)||Number(!!b.openedAt)-Number(!!a.openedAt)||String(a.openExpiry||a.expiry).localeCompare(String(b.openExpiry||b.expiry)));
    for(const b of lots){let available=S.available(b);if(k.trackOpened&&!b.openedAt)available=Math.floor(available/cap)*cap;const planned=Math.min(left,available);if(!planned)continue;const held=k.trackOpened&&!b.openedAt?Math.ceil(planned/cap)*cap:planned;out.push({batch:b.id,sku,quantity:round(held),plannedQuantity:round(planned),cost:b.cost});left=round(left-planned);if(!left)break}
    must(left===0,k.name+'无足够的完整容器或可用余量');return out;
  }
  const masterTypes=new Set(['services','specs','serviceCategories','lines','brands','categories','skus','units','equipment','heads','cards','prices','dictionaries','warehouses']);
  function validateMaster(type,r,d){
    if(masterTypes.has(type))requirePermission('主数据',r.store,d);
    if(['roles','approvals','staff','stores','departments','qualifications'].includes(type))requirePermission('系统管理',r.store,d);
    const permission={applications:'采购',suppliers:'采购',credentials:'采购',firstReviews:'采购',purchaseReturns:'采购',payments:'财务',counts:'盘点',losses:'领用',adverse:'质量',recalls:'质量',qualityChecks:'质量',partnerOrders:'财务',reportPlans:'报表'}[type];if(permission)requirePermission(permission,r.store||get('batches',r.batch,d)?.store||get('purchases',r.purchase,d)?.store,d);
    const old=get(type,r.id,d);
    if(['brands','categories','serviceCategories','lines'].includes(type)&&old&&r.name!==old.name){const mapping={brands:['skus','brand'],categories:['skus','category'],serviceCategories:['services','category'],lines:['services','line']},[entity,key]=mapping[type];d[entity].filter(x=>x[key]===old.name).forEach(x=>x[key]=r.name);if(type==='categories')d.warehouses.filter(x=>x.category===old.name).forEach(x=>x.category=r.name)}
    if(type==='dictionaries'&&old&&old.name!==r.name&&old.kind==='单位')must(!d.skus.some(k=>[k.unit,k.stockUnit,k.purchaseUnit,k.salesUnit,k.consumptionUnit,k.containerUnit].includes(old.name))&&!d.units.some(u=>[u.name,u.target].includes(old.name)),'已引用的单位不能改名，请新增单位并保留历史单位');
    if(type==='warehouses'&&old&&(r.status==='停用'||r.store!==old.store||r.type!==old.type||r.category!==old.category))must(!d.batches.some(b=>b.warehouse===r.id&&b.quantity>0),'该库位仍有库存，请先移库或完成处置');
    if(type==='skus'){
      r.useType||='单次使用';if(r.useType==='单次使用')must(!(r.remainderModes||[]).some(m=>['客户寄存','继续本班次使用'].includes(m)),'单次使用产品不得配置寄存或跨患者复用');
      if((r.remainderModes||[]).some(m=>['客户寄存','继续本班次使用'].includes(m)))must(r.policyBasis?.trim()&&r.policyApprover&&get('staff',r.policyApprover,d)?.status==='启用','请登记经核准的产品依据及核准人');
      if(r.reconstitutionRequired)must(r.unit==='U'&&r.trackOpened,'配制剂量物料须以 U 为基本单位并按瓶管理');
    }
    if(type==='patients'){requirePermission('领用',null,d);must(r.patientCode?.trim()&&r.name?.trim(),'请填写原系统患者 ID 和姓名');must(!d.patients.some(x=>x.id!==r.id&&(x.patientCode||x.id)===r.patientCode),'患者 ID 已登记');if(old)must((old.patientCode||old.id)===r.patientCode,'患者 ID 不可改写');else r.id=r.patientCode.trim()}
    if(type==='staff')must(!d.staff.some(x=>x.id!==r.id&&x.account===r.account),'员工账号已存在');
    if(type==='firstReviews'&&r.kind==='首营品种')must(r.sku,'首营品种须选择具体物料');
    if(['controlledLogs','emptyVials'].includes(type)){const source=type==='emptyVials'?get('consumptions',r.source,d):get('batches',r.batch,d);must(source,'请关联真实业务单或批次');r.store=source.store;const a=requirePermission('库存查询',r.store,d);must(r.operator===a.id,'登记人员须为当前办理人');must(r.reviewer&&r.reviewer!==a.id&&get('staff',r.reviewer,d)?.status==='启用','请选择另一位有效复核人');r.requestedReviewer=r.reviewer;r.reviewer='';r.status='待复核';if(type==='emptyVials'){const lots=S.returnableVials(r.source,d);must(Number.isInteger(r.quantity)&&r.quantity>0&&r.quantity<=lots.length,'可回收空瓶不足；须已用尽或完成销毁，且不能重复回收');r.containers=lots.slice(0,r.quantity).map(b=>b.containerCode||b.id)}else{r.book=source.quantity;r.difference=round(r.quantity-source.quantity)}}
    if(type==='invoices'){must(!d.invoices.some(x=>x.id!==r.id&&x.name===r.name&&x.status!=='已作废'),'发票号码已登记');must(d.purchases.some(p=>p.id===r.source)||d.retail.some(p=>p.id===r.source),'请选择真实的关联单号')}
  }
  function quotePrice(spec,store,member='普通会员',employee=false,date=S.today(),d=S.data){const st=get('stores',store,d),sp=get('specs',spec,d);must(sp&&st,'项目或机构不存在');const rows=d.prices.filter(p=>p.spec===spec&&p.status==='已生效'&&p.start<=date&&p.end>=date&&['全部门店',store,st.brand].includes(p.scope)&&(p.member==='全部等级'||p.member===member)&&(p.kind!=='员工内购价'||employee));const floor=Math.max(0,...rows.map(p=>Number(p.floor||0)));const prices=rows.filter(p=>p.kind!=='底价').sort((a,b)=>b.priority-a.priority);must(prices.length<2||prices[0].priority!==prices[1].priority||prices[0].price===prices[1].price,'同优先级有效价格冲突，请先调整价格策略');const price=prices[0]?.price??sp.price;must(price>=floor,'当前执行价低于有效底价');return {price,floor,strategy:prices[0]?.id||'',time:S.stamp(),member,employee}}
  function purchaseBalance(id,d=S.data){const p=get('purchases',id,d);if(!p)return null;const received=p.receivedAmount??(p.status==='已入库'?p.amount:0),returns=d.purchaseReturns.filter(r=>r.purchase===id&&r.status==='已退货').reduce((n,r)=>n+(r.amount??r.quantity*(get('batches',r.batch,d)?.cost||0)),0),paid=d.payments.filter(x=>x.purchase===id&&x.status==='已付款').reduce((n,x)=>n+x.amount,0);return {received:round(received),returns:round(returns),net:round(received-returns),paid:round(paid),balance:round(received-returns-paid)}}
  function migrate(){if(S.data.inventorySchema===2)return;S.transaction('初始化院内业务账',d=>{
    for(const key of ['patients','treatments','internalIssues','internalReturns','trayChecks','clinicalExecutions','handoffs','purchaseReceipts','purchaseReconciliations','cardEvents','qualityTasks','openingStocks','countPlans','alertTasks'])d[key]||=[];
    if(!d.inventorySchema){
      d.roles.push({id:'INV-ROLE-ADMIN',name:'进销存管理员',level:'总部',scope:'全部门店',permissions:copy(permissions),status:'启用'},{id:'INV-ROLE-NURSE',name:'院内护理',level:'门店',scope:'XM',permissions:['库存查询','领用','院内签收','配台','配台复核','治疗执行','报表'],status:'启用'},{id:'INV-ROLE-REVIEW',name:'独立业务复核',level:'总部',scope:'全部门店',permissions:copy(permissions),status:'启用'});
      d.staff.push({id:'INV-ADMIN',name:'流程管理员',account:'inventory.admin',store:'WH',department:'总部',post:'管理员',status:'启用',roles:['INV-ROLE-ADMIN']},{id:'INV-NURSE',name:'护理经办',account:'inventory.nurse',store:'XM',department:'护理部',post:'护士',status:'启用',roles:['INV-ROLE-NURSE']},{id:'INV-REVIEW',name:'独立复核员',account:'inventory.review',store:'WH',department:'总部',post:'审核员',status:'启用',roles:['INV-ROLE-REVIEW']});
      for(const s of d.staff){s.roles||=s.id==='EMP02'?['ROLE02']:s.id==='EMP03'?['INV-ROLE-REVIEW']:s.id==='EMP01'?['INV-ROLE-NURSE']:[]}
      const keeper=get('roles','ROLE02',d);if(keeper)keeper.permissions=[...new Set([...keeper.permissions,'院内发料','退料验收','调拨'])];
      for(const st of d.stores.filter(s=>s.grade!=='仓库')){for(const [suffix,type,cold,controlled] of [['ROOM','治疗室',false,false],['ROOM-COLD','冷藏柜',true,false],['ROOM-CONTROL','管制药柜',true,true]])if(!get('warehouses',st.id+'-'+suffix,d))d.warehouses.push({id:st.id+'-'+suffix,name:st.name+' · '+(cold?'治疗室'+type:'治疗室备料柜'),store:st.id,type,category:'全部类型',status:'启用',purpose:'治疗室',cold,controlled,owner:''})}
      for(const b of d.batches){b.traceRoot||=b.parent||b.id;if(b.openedAt&&get('warehouses',b.warehouse,d)?.type==='虚拟库位'){const origin=get('batches',b.parent,d);if(origin)b.physicalWarehouse=origin.warehouse;else b.locationUnverified=true}}
      for(const k of d.skus){k.useType||='单次使用';k.reconstitutionRequired||=false;k.retailAllowed??=['居家正装','居家小样'].includes(k.category)}
      for(const e of d.equipment){e.model||=e.name;e.shotCost??=d.shotLogs.filter(x=>x.equipment===e.id&&x.quantity>0).reduce((n,x)=>n+x.amount,0)/(e.totalShots||1)}
      if(!d.dictionaries.some(x=>x.kind==='单位'&&x.name==='U'))d.dictionaries.push({id:'INV-UNIT-U',kind:'单位',name:'U',status:'启用'});
      for(const c of d.cardSales){const id=c.customerId||(c.customer||'').match(/HY\d+/)?.[0];if(id&&!d.patients.some(p=>p.id===id))d.patients.push({id,patientCode:id,name:c.customer.split('/')[0].trim(),member:'普通会员',status:'启用'});c.customerId||=id||'';const card=c.cardSnapshot||get('cards',c.card,d);const total=card?.contents?.reduce((n,l)=>n+l.times*(get('specs',l.spec,d)?.price||0),0)||0;c.unitValues||=Object.fromEntries((card?.contents||[]).map(l=>[l.spec,total?round(c.amount*(get('specs',l.spec,d)?.price||0)/total):round(c.amount/c.initialTimes)]))}
      d.inventorySchema=1;
    }
    for(const p of d.patients)p.patientCode||=p.id;d.inventorySchema=2;return {id:'inventory-schema'};
  })}
  Object.assign(S,{permissions,actor,setActor,can,requirePermission,differentReviewer,authorizeTransaction,zoneAccepts,usableEquipment,heldShots,heldHeads,traceBatches,traceUses,reconcileLedger,reserveMaterial,validateMaster,quotePrice,purchaseBalance});
  S.ready=S.ready.then(async()=>{migrate();await S.finishInitialization()});
  PCModules['inventory-core']={ready:S.ready,render(){}};
})();
