/* Inventory business rules. V3 carries an inline copy; neither UI imports the other project.
 * Quantities are per product specification. Ledger entries are append-only and tied to
 * a document operation; drafts, reviews and shipment plans never move inventory.
 */
(function(root){
  'use strict';
  const copy=x=>JSON.parse(JSON.stringify(x));
  const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).format(new Date());
  const uid=prefix=>prefix+'-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,9);
  const assert=(ok,message)=>{if(!ok)throw Error(message);};
  const quantity=(n,label='数量',zero=true)=>{n=Number(n);assert(Number.isFinite(n)&&n>=0&&(zero||n>0),label+(zero?'不能小于 0':'必须大于 0'));return Math.round(n*1000)/1000;};
  const sum=(rows,key)=>Math.round(rows.reduce((a,x)=>a+Number(x[key]||0),0)*1000)/1000;
  const key=(pid,sid)=>pid+':'+sid;
  const warehouse=(s,id)=>s.warehouses.find(x=>x.id===id);
  const product=(s,id)=>s.products.find(x=>x.id===id);
  const spec=(s,pid,sid)=>product(s,pid)?.specs.find(x=>x.id===sid);
  const balance=(s,wid,pid,sid,until='')=>Math.round(s.ledger.filter(x=>(!wid||x.wid===wid)&&x.pid===pid&&(!sid||x.sid===sid)&&(!until||x.at.slice(0,10)<=until)).reduce((n,x)=>n+x.delta,0)*1000)/1000;
  const catalog=s=>s.products.flatMap(p=>p.specs.map(v=>({...v,pid:p.id,sid:v.id,key:key(p.id,v.id),product:p})));

  const round=n=>Math.round(n*1000)/1000;
  const unitRoles={purchase:'采购',stock:'库存',sale:'销售',consume:'消耗'};
  function skuDefaults(p,v){
    const base=v.baseUnit||p.unit||'个';
    return {...v,code:v.code||p.code+'-'+String(p.specs.findIndex(x=>x.id===v.id)+1).padStart(2,'0'),baseUnit:base,units:v.units||[],defaults:{purchase:base,stock:base,sale:base,consume:base,...v.defaults},step:v.step??0.001,allowFraction:v.allowFraction!==false,enabled:v.enabled!==false,offers:v.offers||[]};
  }
  function unitTable(v){
    assert(String(v.baseUnit||'').trim(),'请填写最小计量单位。');
    const result={[v.baseUnit]:{name:v.baseUnit,factor:1,allowFraction:v.allowFraction!==false}},rows=v.units||[],seen=new Set([v.baseUnit]);
    rows.forEach(x=>{assert(x.name?.trim()&&!seen.has(x.name),'包装单位不能为空或重复。');seen.add(x.name);});
    function resolve(name,path=[]){
      if(result[name])return result[name];
      assert(!path.includes(name),'包装换算不能循环引用。');
      const x=rows.find(x=>x.name===name);assert(x,'包装换算的下级单位不存在。');
      const ratio=Number(x.ratio);assert(Number.isFinite(ratio)&&ratio>0,'包装换算系数必须大于 0。');
      const factor=ratio*resolve(x.parent,[...path,name]).factor;
      assert(Number.isFinite(factor)&&factor<=1e9&&Math.abs(factor-round(factor))<1e-7,'换算到最小单位须为最多三位小数，且不能超过十亿。');
      return result[name]={name,factor:round(factor),allowFraction:x.allowFraction===true||x.allowFraction==='true'};
    }
    rows.forEach(x=>resolve(x.name));for(const u of Object.values(result)){assert(v.allowFraction!==false||Number.isInteger(u.factor),'最小单位不允许小数时，包装换算必须为整数。');}return result;
  }
  function defaultUnit(s,pid,sid,kind='stock'){
    const v=skuDefaults(product(s,pid),spec(s,pid,sid));
    return v.defaults[({inbound:'purchase',purchase:'purchase',issue:'consume',consume:'consume',sale:'sale'})[kind]||kind]||v.defaults.stock;
  }
  function conversion(s,pid,sid,unit){
    const p=product(s,pid),v=spec(s,pid,sid);assert(p&&v,'物料规格不存在。');
    const c=skuDefaults(p,v),u=unitTable(c)[unit||c.baseUnit];assert(u,'所选单位未在该 SKU 中配置。');
    return {...u,baseUnit:c.baseUnit,step:Number(c.step)};
  }
  function convert(n,c,zero=true){
    const raw=Number(n);n=quantity(n,'业务数量',zero);assert(Math.abs(raw-n)<1e-7,'业务数量最多三位小数。');assert(zero||n>0,'业务数量必须大于 0。');
    assert(c.allowFraction||Number.isInteger(n),'单位“'+c.name+'”不允许小数，请使用已配置的拆零单位。');
    const b=n*c.factor;assert(Math.abs(b-round(b))<1e-7,'换算结果不能超过三位小数。');
    assert(!c.step||Math.abs(b/c.step-Math.round(b/c.step))<1e-6,'数量须符合最小单位步长 '+c.step+' '+c.baseUnit+'。');return round(b);
  }
  const lineBase=(l,n)=>convert(n,l.conversion||{name:l.unit,factor:1,baseUnit:l.unit,allowFraction:true,step:0.001});
  function referenced(s,pid,sid){return s.ledger.some(x=>x.pid===pid&&x.sid===sid)||s.documents.some(d=>d.lines.some(x=>x.pid===pid&&x.sid===sid))||s.tasks.some(t=>t.products.includes(pid))||(s.salesProducts?.basics||[]).some(b=>b.materials.some(x=>x.pid===pid&&x.sid===sid));}
  function migrate(s){
    if(s.materialVersion===1){assert(Array.isArray(s.brands)&&Array.isArray(s.suppliers),'物料主档格式不兼容，原数据已保留。');return s;}
    s.brands=s.brands||[];s.suppliers=s.suppliers||[];
    s.products.forEach(p=>{p.specs=p.specs.map(v=>skuDefaults(p,v));p.deductionMode=p.deductionMode||'issue';p.saleEnabled=p.saleEnabled===true;});
    s.documents.forEach(d=>d.lines.forEach(l=>{if(!l.conversion){l.unit=l.unit||product(s,l.pid)?.unit||spec(s,l.pid,l.sid)?.baseUnit;l.conversion={name:l.unit,factor:1,baseUnit:l.unit,step:0.001,allowFraction:true,legacy:true};l.baseQty=l.qty;l.unitPrice=l.purchasePrice??l.cost??0;}}));
    s.materialVersion=1;return s;
  }
  function averageCost(s,wid,pid,sid){
    let qty=0,value=0,estimated=false;
    const v=spec(s,pid,sid),fallback=Number(v?.cost||0);
    for(const x of s.ledger.filter(x=>x.wid===wid&&x.pid===pid&&x.sid===sid)){
      const cost=Number.isFinite(x.unitCost)?x.unitCost:(x.delta<0&&qty>0?value/qty:fallback);
      if(!Number.isFinite(x.unitCost)||x.costEstimated)estimated=true;
      qty+=x.delta;value+=x.delta*cost;if(Math.abs(qty)<1e-7)value=0;
    }
    return {qty:round(qty),value:Math.round(value*100)/100,cost:qty>0?value/qty:fallback,estimated};
  }
  function quantityText(lines,field='qty',base=false){
    const totals={};for(const l of lines){const u=base?(l.conversion?.baseUnit||l.baseUnit||l.unit):l.unit;totals[u||'未注明单位']=(totals[u||'未注明单位']||0)+Number(l[field]||0);}
    return Object.entries(totals).map(([u,n])=>round(n)+' '+u).join(' / ')||'0';
  }
  function validate(s){
    assert(s?.schema===1&&Number.isInteger(s.revision)&&['products','warehouses','categories','tags','documents','tasks','ledger'].every(k=>Array.isArray(s[k])),'库存数据格式不兼容，原记录已保留。');
    return migrate(s);
  }
  function log(d,action,note='',actor='当前用户'){d.logs=d.logs||[];d.logs.push({at:now(),actor,action,note});}
  function entry(s,wid,line,delta,type,doc,operation,note=''){
    if(!delta)return;
    assert(warehouse(s,wid),'仓库不存在，请重新选择。');
    assert(spec(s,line.pid,line.sid),'产品规格不存在。');
    const token=doc+':'+operation+':'+wid+':'+key(line.pid,line.sid);
    assert(!s.ledger.some(x=>x.token===token),'该库存操作已经完成，请刷新查看。');
    const stock=averageCost(s,wid,line.pid,line.sid);
    if(delta<0)assert(stock.qty+delta>=-1e-7,'“'+product(s,line.pid).name+' / '+spec(s,line.pid,line.sid).name+'”库存不足。');
    const sourceCost=line.stockCost,unitCost=delta<0?stock.cost:(sourceCost??(line.unitPrice!==undefined?Number(line.unitPrice)/(line.conversion?.factor||1):stock.cost));
    const costEstimated=sourceCost!==undefined?!!line.costEstimated:delta<0?stock.estimated:!!line.priceEstimated||line.unitPrice===undefined||!!line.conversion?.legacy&&line.purchasePrice===undefined;
    s.ledger.push({id:uid('L'),token,wid,pid:line.pid,sid:line.sid,delta:round(delta),baseUnit:line.conversion?.baseUnit||spec(s,line.pid,line.sid).baseUnit||product(s,line.pid).unit,unitCost,costEstimated,value:Math.round(delta*unitCost*100)/100,type,doc,at:now(),note});
    return {unitCost,costEstimated};
  }
  function normalizeLines(s,lines,strict=true,kind=''){
    assert(Array.isArray(lines)&&(!strict||lines.length),'请至少添加一项物品。');
    const seen=new Set();
    return lines.map(l=>{
      const p=product(s,l.pid),v=spec(s,l.pid,l.sid);
      assert(p&&v,'所选产品或规格已不存在。');
      if(strict){assert(p.enabled,'产品“'+p.name+'”已停用。');if(kind==='issue')assert(p.useEnabled,'产品“'+p.name+'”未启用领用。');}
      const k=key(p.id,v.id);assert(!seen.has(k),'同一产品规格不能重复添加。');seen.add(k);
      if(strict){assert(v.enabled!==false,'规格已停用。');if(kind==='sale')assert(p.saleEnabled,'物料未启用销售。');if(kind==='consume')assert(p.deductionMode==='consume','该物料按领用出库扣减，不能再次消耗扣库。');if(kind==='issue')assert(p.deductionMode!=='consume','该物料按实际消耗扣减，请登记服务消耗。');}
      const unit=l.unit||defaultUnit(s,p.id,v.id,kind),c=conversion(s,p.id,v.id,unit),qty=quantity(l.qty,p.name+'数量',!strict),baseQty=convert(qty,c,!strict);
      const offer=(v.offers||[]).find(o=>o.supplier===l.supplier&&o.unit===unit);
      if(l.supplier)assert(s.suppliers?.some(x=>x.id===l.supplier&&x.enabled!==false),'供应商已停用或不存在。');
      return {...copy(l),key:k,qty,baseQty,conversion:c,unit,cost:Number(v.cost)*c.factor,priceEstimated:l.priceEstimated??(l.unitPrice===undefined||!!l.conversion?.legacy&&l.purchasePrice===undefined),unitPrice:quantity(l.unitPrice??offer?.price??Number(v.cost)*c.factor,'单价'),name:p.name,code:p.code,spec:v.name};
    });
  }
  const docStatus={
    transfer:['待提交','待审核','待发货','待收货','已撤销','已完成','已拒绝'],
    inbound:['待提交','待审核','待入库','部分入库','完全入库','已拒绝'],
    purchase:['待提交','待审核','待采购','部分采购','全部采购','待入库','部分入库','完全入库','已拒绝','已完成'],
    replenish:['待审核','待核数','待发货','在途','部分收货','已完成','已拒绝','已取消'],
    issue:['已出库'],sale:['已出库'],consume:['已出库'],returnIn:['已完成'],returnOut:['已完成']
  };
  function newDocument(s,p){
    const strict=p.submit!==false,kind=p.kind;
    assert(Object.hasOwn(docStatus,kind)&&!['returnIn','returnOut'].includes(kind),'未知单据类型。');
    const d=p.id?s.documents.find(x=>x.id===p.id):null;
    if(p.id)assert(d&&d.status==='待提交','仅待提交单据可以编辑。');
    if(strict){
      assert(warehouse(s,p.wid)?.enabled,'请选择启用的门店仓库。');
      if(kind==='transfer'){assert(warehouse(s,p.to)?.enabled,'请选择启用的调入仓库。');assert(p.wid!==p.to,'调出仓库和调入仓库不能相同。');}
      if(kind==='inbound')assert(['调拨入库','退货入库','采购入库','归还入库','盘盈入库'].includes(p.type),'请选择入库类型。');
    }
    const lines=normalizeLines(s,p.lines,strict,kind),prefix={transfer:'DB',inbound:'RK',purchase:'CG',replenish:'BH',issue:'LY',sale:'XS',consume:'XH',returnIn:'TH',returnOut:'CT'}[kind];
    assert(lines.length||p.wid,'请先填写申请内容。');
    const result=d||{id:uid(prefix),no:prefix+now().replace(/\D/g,'')+String(++s.sequence).padStart(3,'0'),kind,createdAt:now(),createdBy:p.actor||'当前用户',comments:[],shipments:[],logs:[]};
    Object.assign(result,{wid:p.wid||'',to:p.to||'',type:p.type||'',lines,status:strict?(kind==='issue'?'已出库':'待审核'):'待提交'});
    if(!d)s.documents.unshift(result);
    if(['issue','sale','consume'].includes(kind)&&strict){
      if(kind!=='issue'){assert(p.source?.trim(),'请填写销售订单号或服务记录号。');assert(!s.documents.some(x=>x.id!==result.id&&x.kind===kind&&x.source===p.source.trim()),'该业务记录已扣库，请勿重复登记。');result.source=p.source.trim();}
      for(const l of lines)entry(s,result.wid,l,-l.baseQty,({issue:'领用出库',sale:'销售出库',consume:'服务消耗'})[kind],result.id,kind);result.completedAt=now();result.status='已出库';
    }
    log(result,strict?'提交申请':'保存草稿','',p.actor);
    return result.id;
  }
  function requireStatus(d,status){assert(d&&status.includes(d.status),'单据状态已变化，请刷新后重新操作。');}
  function updateReplenishment(d){
    const expected=sum(d.lines,'expected'),sent=sum(d.shipments.filter(x=>x.status!=='待发货'),'qty');
    const received=d.shipments.filter(x=>x.status==='已收货');
    d.sentQty=sent;d.receivedQty=sum(received,'actual');
    if(sent>=expected&&d.shipments.every(x=>x.status==='已收货')&&sent>0){d.status='已完成';d.completedAt=now();}
    else if(received.length)d.status='部分收货';
    else if(sent)d.status='在途';
    else d.status='待发货';
  }
  function documentAction(s,p){
    const d=s.documents.find(x=>x.id===p.id);assert(d,'单据不存在。');
    const actor=p.actor||'当前用户',at=now();
    switch(p.action){
      case 'approve':{
        requireStatus(d,['待审核']);
        if(d.kind==='replenish'){
          const lines=normalizeLines(s,p.lines||d.lines,true);
          d.lines=lines.map(l=>({...l,approved:(lineBase(l,l.approved??l.qty),quantity(l.approved??l.qty,'审核数量'))}));
          d.status='待核数';
        }else d.status=({transfer:'待发货',inbound:'待入库',purchase:'待采购'})[d.kind];
        assert(d.status,'此单据不支持审核。');d.reviewAt=at;d.reviewer=actor;break;
      }
      case 'reviewDraft':
        requireStatus(d,['待审核']);assert(d.kind==='replenish','当前单据不能保存审核草稿。');
        d.lines=normalizeLines(s,p.lines,false).map(l=>({...l,approved:(lineBase(l,l.approved??l.qty),quantity(l.approved??l.qty,'审核数量'))}));break;
      case 'reject':
        requireStatus(d,['待审核']);d.status='已拒绝';d.reviewAt=at;d.reviewer=actor;d.reason=p.reason||'';break;
      case 'revoke':
        requireStatus(d,['待提交','待审核']);d.status=d.kind==='transfer'?'已撤销':'已取消';break;
      case 'receiveInbound':{
        requireStatus(d,['待入库','部分入库']);assert(d.kind==='inbound','此单据不能直接入库。');
        let total=0;const op=uid('receive');
        for(const l of d.lines){const n=quantity(p.quantities?.[l.key]??0,'本次入库数量');assert(n<=round(l.qty-(l.received||0)),'本次入库数量超过剩余数量。');total+=n;l.received=round((l.received||0)+n);entry(s,d.wid,l,lineBase(l,n),d.type||'采购入库',d.id,op,p.note);}
        assert(total>0,'请填写本次入库数量。');d.status=d.lines.every(l=>l.received===l.qty)?'完全入库':'部分入库';d.receivedAt=at;d.receiver=actor;
        if(d.status==='完全入库')d.completedAt=at;
        if(d.purchaseId){const parent=s.documents.find(x=>x.id===d.purchaseId);if(parent){const children=s.documents.filter(x=>x.purchaseId===parent.id);parent.status=children.every(x=>x.status==='完全入库')&&parent.lines.every(x=>['已采购','不采购'].includes(x.purchaseStatus))?'已完成':'部分入库';}}
        break;
      }
      case 'shipTransfer':
        requireStatus(d,['待发货']);assert(d.kind==='transfer','此单据不是调拨单。');
        for(const l of d.lines){const cost=entry(s,d.wid,l,-lineBase(l,l.qty),'调拨出库',d.id,'ship');l.stockCost=cost.unitCost;l.costEstimated=cost.costEstimated;}
        d.status='待收货';d.shippedAt=at;d.shipper=actor;break;
      case 'receiveTransfer':
        requireStatus(d,['待收货']);assert(d.kind==='transfer','此单据不是调拨单。');
        for(const l of d.lines)entry(s,d.to,l,lineBase(l,l.qty),'调拨入库',d.id,'receive');
        d.status='已完成';d.receivedAt=at;d.completedAt=at;d.receiver=actor;break;
      case 'verify':
        requireStatus(d,['待核数']);assert(d.kind==='replenish','当前单据不能核数。');
        d.lines.forEach(l=>{l.expected=quantity(p.quantities?.[l.key]??l.approved,'应发数量');lineBase(l,l.expected);});
        assert(sum(d.lines,'expected')>0,'应发总数必须大于 0。');d.status='待发货';d.verifiedAt=at;d.verifier=actor;break;
      case 'saveShipments':{
        requireStatus(d,['待发货','在途','部分收货']);assert(d.kind==='replenish','当前单据不能分批发货。');
        const sent=d.shipments.filter(x=>x.status!=='待发货'),drafts=(p.shipments||[]).map(x=>{
          assert(d.lines.some(l=>l.key===x.lineKey),'发货物品不存在。');assert(warehouse(s,x.wid)?.enabled,'请选择启用的发货仓库。');
          return {id:x.id||uid('SH'),lineKey:x.lineKey,wid:x.wid,qty:(lineBase(d.lines.find(l=>l.key===x.lineKey),x.qty),quantity(x.qty,'实发数量',false)),tracking:String(x.tracking||'').trim(),status:'待发货'};
        });
        for(const l of d.lines)assert(sum(sent.concat(drafts).filter(x=>x.lineKey===l.key),'qty')<=l.expected,'“'+l.name+'”的发货总数超过应发数量。');
        d.shipments=sent.concat(drafts);break;
      }
      case 'shipReplenishment':{
        requireStatus(d,['待发货','在途','部分收货']);const selected=d.shipments.filter(x=>x.status==='待发货'&&(p.ids||[]).includes(x.id));
        assert(selected.length,'请选择待发货的记录。');
        for(const x of selected){const l=d.lines.find(l=>l.key===x.lineKey);const cost=entry(s,x.wid,l,-lineBase(l,x.qty),'补货出库',d.id,x.id);x.stockCost=cost.unitCost;x.costEstimated=cost.costEstimated;x.status='在途';x.shippedAt=at;}
        d.shippedAt=at;updateReplenishment(d);break;
      }
      case 'receiveReplenishment':{
        requireStatus(d,['在途','部分收货']);let count=0;
        for(const x of d.shipments.filter(x=>x.status==='在途'&&Object.hasOwn(p.quantities||{},x.id))){
          const actual=quantity(p.quantities[x.id],'实收数量');assert(actual<=x.qty,'实收数量不能超过本批发货数量。');
          const l=d.lines.find(l=>l.key===x.lineKey);x.actual=actual;x.status='已收货';x.receivedAt=at;x.difference=round(x.qty-actual);x.note=p.note||'';
          entry(s,d.wid,{...l,stockCost:x.stockCost,costEstimated:x.costEstimated},lineBase(l,actual),'补货入库',d.id,x.id);count++;
        }
        assert(count,'请选择在途记录并填写实收数量。');updateReplenishment(d);break;
      }
      case 'purchaseItem':{
        requireStatus(d,['待采购','部分采购','全部采购','待入库','部分入库']);
        const l=d.lines.find(x=>x.key===p.lineKey);assert(l,'采购物品不存在。');assert(!['已采购','不采购'].includes(l.purchaseStatus),'此物品已处理。');
        assert(['待付款','已采购','不采购'].includes(p.status),'请选择采购状态。');
        if(p.supplier)assert(s.suppliers.some(x=>x.id===p.supplier&&x.enabled!==false),'请选择启用的供应商。');l.supplier=p.supplier||l.supplier||'';l.purchaseStatus=p.status;l.purchasePrice=quantity(p.price??l.cost,'采购单价');l.purchaser=actor;l.purchasedAt=at;l.tracking=p.tracking||'';l.purchaseNote=p.note||'';
        if(p.status==='已采购'){
          const inboundId=newDocument(s,{kind:'inbound',wid:d.wid,type:'采购入库',lines:[{...copy(l),unitPrice:l.purchasePrice,priceEstimated:false,supplier:p.supplier||l.supplier}],submit:true,actor});
          const inbound=s.documents.find(x=>x.id===inboundId);inbound.status='待入库';inbound.purchaseId=d.id;inbound.reviewAt=at;inbound.reviewer=actor;l.inboundId=inboundId;
        }
        d.status=d.lines.every(x=>['已采购','不采购'].includes(x.purchaseStatus))?(d.lines.every(x=>x.purchaseStatus==='不采购')?'已完成':'待入库'):d.lines.some(x=>x.purchaseStatus==='已采购')?'部分采购':'待采购';
        break;
      }
      case 'comment':
        assert(String(p.text||'').trim()||p.files?.length,'请输入评论内容或添加图片。');assert(String(p.text||'').length<=200,'评论最多 200 字。');
        d.comments.push({id:uid('C'),at,actor,text:String(p.text||'').trim(),files:p.files||[]});break;
      default:throw Error('不支持的单据操作。');
    }
    log(d,({approve:'审核通过',reviewDraft:'保存审核草稿',reject:'审核拒绝',revoke:'撤销申请',receiveInbound:'确认入库',shipTransfer:'确认发货',receiveTransfer:'确认收货',verify:'核对完成',saveShipments:'保存发货明细',shipReplenishment:'确认发货',receiveReplenishment:'确认收货',purchaseItem:'采购处理',comment:'评论'})[p.action],p.reason||p.note||'',actor);
    return d.id;
  }
  function saveCatalog(s,p){
    const type=p.type,list=s[type];assert(['warehouses','products','categories','tags','brands','suppliers'].includes(type),'未知资料类型。');
    const old=list.find(x=>x.id===p.value.id),v={...copy(p.value)};
    assert(String(v.name||'').trim(),'请填写名称。');v.name=v.name.trim();
    if(type==='warehouses'){assert(v.store,'请选择关联门店。');assert(v.receiver,'请选择收货人。');v.enabled=v.enabled!==false;}
    if(type==='products'){
      if(!old&&!v.code?.trim()){do{v.code='WL'+String(++s.sequence).padStart(6,'0');}while(list.some(x=>x.code===v.code));}v.code=old?.code||v.code?.trim();assert(v.code?.trim(),'请填写物料编号。');assert(!list.some(x=>x.id!==v.id&&x.code===v.code),'产品编号已存在。');
      assert(s.categories.some(x=>x.id===v.category),'请选择所属分类。');v.unit=v.specs?.[0]?.baseUnit||v.unit;assert(v.unit,'请选择计量单位。');if(v.brand)assert(s.brands.some(x=>x.id===v.brand),'所属品牌不存在。');
      assert(v.specs?.length,'至少保留一个规格。');
      const names=new Set();v.specs=v.specs.map(x=>{assert(String(x.name||'').trim(),'请填写规格型号。');assert(!names.has(x.name),'规格名称不能重复。');names.add(x.name);return {...x,id:x.id||uid('SP'),price:quantity(x.price,'销售原价'),cost:quantity(x.cost,'成本价'),uses:quantity(x.uses||1,'使用次数',false)};});
      if(old)for(const sp of old.specs){if(!v.specs.some(x=>x.id===sp.id))assert(!s.ledger.some(x=>x.pid===old.id&&x.sid===sp.id)&&!s.documents.some(d=>d.lines.some(x=>x.pid===old.id&&x.sid===sp.id)),'已有库存记录的规格不能删除。');}
      const skuCodes=new Set((old?.specs||[]).map(x=>x.code));
      v.specs=v.specs.map(x=>{
        const sp=skuDefaults(v,x);sp.allowFraction=sp.allowFraction===true||sp.allowFraction==='true';const units=unitTable(sp),previous=old?.specs.find(o=>o.id===sp.id);
        if(previous)sp.code=previous.code;else{let n=1;do{sp.code=v.code+'-'+String(n++).padStart(2,'0');}while(skuCodes.has(sp.code));}skuCodes.add(sp.code);sp.step=quantity(sp.step,'数量步长',false);sp.allowFraction=sp.allowFraction===true||sp.allowFraction==='true';sp.enabled=sp.enabled===true||sp.enabled==='true';
        for(const role of Object.keys(unitRoles))assert(units[sp.defaults[role]],'请选择默认'+unitRoles[role]+'单位。');
        if(previous&&referenced(s,old.id,sp.id)){
          const before=unitTable(skuDefaults(old,previous));assert(previous.baseUnit===sp.baseUnit,'已有引用的规格不能改变最小单位。');
          for(const name of Object.keys(before))assert(units[name]&&before[name].factor===units[name].factor&&before[name].allowFraction===units[name].allowFraction,'已有引用的包装单位不能删除或修改，请新建规格。');
          assert(previous.step===sp.step,'已有引用的数量步长不能修改。');
        }
        const offers=new Set();sp.offers.forEach(o=>{assert(s.suppliers.some(x=>x.id===o.supplier),'请选择供应商。');assert(units[o.unit],'请选择报价单位。');assert(!offers.has(o.supplier+':'+o.unit),'同一供应商及单位不能重复报价。');offers.add(o.supplier+':'+o.unit);o.price=quantity(o.price,'参考采购价');});return sp;
      });
      if(old)for(const sp of old.specs)if(!v.specs.some(x=>x.id===sp.id))assert(!referenced(s,old.id,sp.id),'被单据、盘点或服务引用的规格不能删除，请停用。');
      v.deductionMode=v.deductionMode||'issue';assert(['issue','consume'].includes(v.deductionMode),'请选择库存扣减时点。');
      if(old&&old.deductionMode!==v.deductionMode)assert(!s.ledger.some(x=>x.pid===old.id),'已有库存流水的物料不能直接更改扣减时点，请新建物料。');
      v.saleEnabled=v.saleEnabled===true||v.saleEnabled==='true';v.tags=v.tags||[];v.pictures=v.pictures||[];
    }
    if(type==='categories'){assert(!list.some(x=>x.id!==v.id&&x.name===v.name&&x.parent===(v.parent||'')),'同级分类名称已存在。');v.parent=v.parent||'';v.stores=v.stores||[];}
    if(['brands','suppliers'].includes(type)){assert(!list.some(x=>x.id!==v.id&&x.name===v.name),'名称已存在。');v.enabled=v.enabled!==false&&v.enabled!=='false';}
    if(type==='tags')assert(!list.some(x=>x.id!==v.id&&x.name===v.name),'标签名称已存在。');
    if(!v.id)v.id=uid(type.slice(0,2));
    if(old)Object.assign(old,v);else list.push(v);
    return v.id;
  }
  function taskRows(s,wid,products,mode){
    return catalog(s).filter(x=>products.includes(x.pid)&&x.product.enabled&&(mode!=='stock'||balance(s,wid,x.pid,x.sid)!==0)).map(x=>({key:x.key,pid:x.pid,sid:x.sid,baseline:balance(s,wid,x.pid,x.sid),baselineAt:now(),counted:null,processed:false,note:''}));
  }
  function saveTask(s,p){
    const old=s.tasks.find(x=>x.id===p.id);if(old)assert(old.status==='待发送','只有待发送任务可以编辑。');
    assert(String(p.name||'').trim(),'请填写任务名称。');assert(p.warehouses?.length,'请选择盘点门店。');assert(p.products?.length,'请选择盘点产品。');
    assert(p.warehouses.every(id=>warehouse(s,id)?.enabled),'所选仓库中包含已停用仓库。');
    const t={id:old?.id||uid('T'),name:p.name.trim(),createdAt:old?.createdAt||now(),actor:p.actor||'当前用户',status:'待发送',mode:p.mode||'all',warehouses:[...new Set(p.warehouses)],products:[...new Set(p.products)],stores:[],logs:old?.logs||[]};
    if(old)Object.assign(old,t);else s.tasks.unshift(t);log(t,old?'修改任务':'创建任务');return t.id;
  }
  function taskAction(s,p){
    const t=s.tasks.find(x=>x.id===p.id);assert(t,'盘点任务不存在。');
    const st=t.stores.find(x=>x.wid===p.wid);
    switch(p.action){
      case 'send':
        assert(t.status==='待发送','任务已经发送或作废。');
        t.stores=t.warehouses.map(wid=>({wid,status:'进行中',rows:taskRows(s,wid,t.products,t.mode)}));
        t.stores.filter(x=>!x.rows.length).forEach(x=>x.status='已完成');
        t.status=t.stores.every(x=>x.status==='已完成')?'已完成':'进行中';t.sentAt=now();break;
      case 'void':
        assert(['待发送','进行中'].includes(t.status),'当前任务不能作废。');t.status='已作废';t.stores.forEach(x=>{if(x.status==='进行中')x.status='已取消';});break;
      case 'cancelStore':
        assert(st&&st.status==='进行中','门店任务已结束。');st.status='已取消';break;
      case 'recount':
        assert(t.status!=='已作废'&&st,'当前任务不能重新盘点。');
        st.history=st.history||[];st.history.push({at:now(),rows:copy(st.rows)});st.rows=taskRows(s,st.wid,t.products,t.mode);st.status='进行中';t.status='进行中';break;
      case 'count':{
        assert(t.status==='进行中'&&st?.status==='进行中','当前盘点任务已结束。');
        const r=st.rows.find(x=>x.key===p.lineKey);assert(r&&r.counted===null,'此物品已盘点，请刷新查看。');
        const c=conversion(s,r.pid,r.sid,p.unit||spec(s,r.pid,r.sid).baseUnit);const remainder=convert(p.remainder||0,conversion(s,r.pid,r.sid,c.baseUnit));assert(c.factor===1?remainder===0:remainder<c.factor,'零散数量须小于一个所选包装，请计入整包装数量。');r.counted=round(convert(p.quantity,c)+remainder);r.countInput={quantity:p.quantity,unit:c.name,remainder,conversion:c};r.countedAt=now();r.countedBalance=balance(s,st.wid,r.pid,r.sid);r.counter=p.actor||'当前用户';break;
      }
      case 'process':{
        assert(t.status!=='已作废'&&st&&st.status!=='已取消','当前任务不能上报损益。');
        const rows=st.rows.filter(x=>x.counted!==null&&!x.processed&&Object.hasOwn(p.rows||{},x.key));assert(rows.length,'没有可上报的盘点记录。');
        for(const r of rows){
          const v=p.rows[r.key],confirmed=convert(v.confirmed,conversion(s,r.pid,r.sid,spec(s,r.pid,r.sid).baseUnit));
          // Count-time differences are applied to the current balance so later receipts/issues survive.
          const delta=confirmed-r.countedBalance;
          entry(s,st.wid,r,delta,delta>=0?'盘盈入库':'盘亏出库',t.id,r.key+':'+r.countedAt+':'+(st.history?.length||0),v.note||'');
          r.confirmed=confirmed;r.difference=delta;r.processed=true;r.processedAt=now();r.note=v.note||'';r.processor=p.actor||'当前用户';
        }
        if(st.rows.every(x=>x.processed)){st.status='已完成';st.completedAt=now();}
        break;
      }
      default:throw Error('不支持的盘点操作。');
    }
    if(t.status==='进行中'&&t.stores.every(x=>['已完成','已取消'].includes(x.status)))t.status='已完成';
    log(t,({send:'确认发送',void:'作废任务',cancelStore:'取消门店任务',recount:'重新盘点',count:'提交实盘库存',process:'上报损益'})[p.action],warehouse(s,p.wid)?.name||'',p.actor);
    return t.id;
  }

  function fromSales(s,p){
    const basic=s.salesProducts?.basics.find(x=>x.id===p.basicId);assert(basic,'请先在产品模块维护基础产品。');
    assert(basic.materials.length,'该产品尚未关联物料。');const times=quantity(p.times,'销售 / 服务数量',false);
    const kind=basic.type==='商品'?'sale':'consume';
    const lines=basic.materials.filter(x=>kind==='sale'||product(s,x.pid)?.deductionMode==='consume').map(x=>{
      assert(x.unit,'关联物料的用量单位尚未确认，请先编辑基础产品。');return {...copy(x),qty:quantity(x.qty*times,'物料数量'),unitPrice:undefined};
    });assert(lines.length,'关联物料均按领用扣库，无需重复登记消耗。');
    return newDocument(s,{...p,kind,lines,submit:true});
  }
  function returnDocument(s,p){
    const origin=s.documents.find(x=>x.id===p.id);assert(origin,'原单据不存在。');
    const incoming=['sale','issue'].includes(origin.kind);assert(incoming||origin.kind==='inbound','此单据不支持退回。');
    const lines=[],kind=incoming?'returnIn':'returnOut';
    for(const l of origin.lines){
      const qty=quantity(p.quantities?.[l.key]||0,'本次退回数量');if(!qty)continue;
      const original=s.ledger.filter(x=>x.doc===origin.id&&x.pid===l.pid&&x.sid===l.sid&&(incoming?x.delta<0:x.delta>0));
      const moved=round(original.reduce((a,x)=>a+Math.abs(x.delta),0)),returned=s.documents.filter(x=>x.originId===origin.id).flatMap(x=>x.lines).filter(x=>x.key===l.key).reduce((a,x)=>a+x.baseQty,0),baseQty=lineBase(l,qty);
      assert(baseQty+returned<=moved+1e-7,'退回数量超过原单剩余可退数量。');
      const cost=original.reduce((a,x)=>a+Math.abs(x.delta)*(x.unitCost??spec(s,l.pid,l.sid).cost),0)/(moved||1);
      lines.push({...copy(l),qty,baseQty,stockCost:cost,costEstimated:original.some(x=>x.costEstimated||x.unitCost===undefined)});
    }
    assert(lines.length,'请填写本次退回数量。');assert(String(p.reason||'').trim(),'请填写退回原因。');
    const d={id:uid('TH'),no:'TH'+now().replace(/\D/g,'')+String(++s.sequence),kind,originId:origin.id,wid:origin.wid,lines,status:'已完成',reason:p.reason,createdAt:now(),completedAt:now(),createdBy:p.actor||'当前用户',comments:[],shipments:[],logs:[]};
    for(const l of lines)entry(s,d.wid,l,(incoming?1:-1)*l.baseQty,incoming?'退货入库':'退货出库',d.id,'return',p.reason);
    log(d,'退回登记',origin.no);s.documents.unshift(d);return d.id;
  }
  function apply(s,command,p={}){
    validate(s);let result;
    if(command==='document.save')result=newDocument(s,p);
    else if(command==='document.fromSales')result=fromSales(s,p);
    else if(command==='document.return')result=returnDocument(s,p);
    else if(command==='document.action')result=documentAction(s,p);
    else if(command==='catalog.save')result=saveCatalog(s,p);
    else if(command==='catalog.delete'){
      assert(['categories','tags'].includes(p.type),'此资料不支持删除。');
      if(p.type==='categories')assert(!s.categories.some(x=>x.parent===p.id)&&!s.products.some(x=>x.category===p.id),'分类包含下级或产品，不能删除。');
      s[p.type]=s[p.type].filter(x=>x.id!==p.id);
      if(p.type==='tags')s.products.forEach(x=>x.tags=x.tags.filter(id=>id!==p.id));
    }else if(command==='products.batchUse'){
      assert(p.ids?.length,'请选择产品。');s.products.filter(x=>p.ids.includes(x.id)).forEach(x=>x.useEnabled=!!p.enabled);
    }else if(command==='task.save')result=saveTask(s,p);
    else if(command==='task.action')result=taskAction(s,p);
    else if(command==='batch'){
      assert(p.operations?.length,'请选择要处理的记录。');
      result=p.operations.map(x=>apply(s,x.command,x.payload));
    }else throw Error('未知库存操作。');
    return result;
  }
  function seed(){
    const s={schema:1,revision:0,sequence:100,products:[],warehouses:[],categories:[],tags:[],documents:[],tasks:[],ledger:[]};
    s.warehouses=[['w0','总仓','总部'],['w1','上海徐汇店','上海徐汇店'],['w2','上海静安店','上海静安店'],['w3','上海浦东店','上海浦东店']].map(([id,name,store])=>({id,name,store,address:store==='总部'?'总部仓储中心':store+'收货区',receiver:'仓库管理员',phone:'138****0000',enabled:true}));
    s.categories=[{id:'c1',name:'皮肤',parent:'',stores:['w1','w2','w3']},{id:'c2',name:'常规产品',parent:'',stores:[]},{id:'c3',name:'固定资产',parent:'',stores:[]},{id:'c4',name:'精华护理',parent:'c1',stores:[]}];
    s.tags=[{id:'tag1',name:'常用'},{id:'tag2',name:'门店专用'}];
    const names=['精华A','修护面膜','保湿精华液','舒缓洁面乳','一次性手套','护理棉片','洁面海绵','消毒湿巾','收纳盒','护理毛巾','保湿喷雾','按摩乳','修护霜','护理刷','量杯','美容仪'];
    s.products=names.map((name,i)=>({id:'p'+i,code:'CP'+String(i+1).padStart(4,'0'),name,category:i<4?'c4':i===15?'c3':'c2',unit:i<4?'盒':i===15?'台':'件',tags:i%3?[]:['tag1'],enabled:true,useEnabled:i!==15,origin:'公司',shelfLife:'24个月',thumbnail:'',pictures:[],specs:[{id:'s'+i,name:i<4?'30ml':i===15?'标准款':'默认',price:80+i*5,cost:30+i*2,uses:1},...(i===0?[{id:'s0b',name:'50ml',price:128,cost:55,uses:1}]:[])]}));
    for(const w of s.warehouses)for(const x of catalog(s))s.ledger.push({id:uid('L'),token:'opening:'+w.id+':'+x.key,wid:w.id,pid:x.pid,sid:x.sid,delta:w.id==='w0'?500:40,type:'期初库存',doc:'',at:now().slice(0,7)+'-01 00:00:00',note:'期初示例库存'});
    const lines=[{pid:'p0',sid:'s0',qty:10},{pid:'p1',sid:'s1',qty:5}],create=(kind,wid='w1',extra={})=>newDocument(s,{kind,wid,to:'w2',type:'采购入库',lines:copy(lines),submit:true,actor:'示例申请人',...extra});
    create('transfer');const td=create('transfer','w2',{to:'w1'});documentAction(s,{id:td,action:'approve'});
    const tr=create('transfer','w0',{to:'w1'});documentAction(s,{id:tr,action:'approve'});documentAction(s,{id:tr,action:'shipTransfer'});
    create('transfer','w1',{submit:false});
    create('inbound');const inbound=create('inbound');documentAction(s,{id:inbound,action:'approve'});documentAction(s,{id:inbound,action:'receiveInbound',quantities:{'p0:s0':3,'p1:s1':0}});
    create('inbound','w2',{submit:false});const ip=create('inbound','w0');documentAction(s,{id:ip,action:'approve'});
    create('purchase');const purchase=create('purchase','w0');documentAction(s,{id:purchase,action:'approve'});create('purchase','w1',{submit:false});
    create('replenish');const rn=create('replenish','w2');documentAction(s,{id:rn,action:'approve'});
    const ready=create('replenish');documentAction(s,{id:ready,action:'approve'});documentAction(s,{id:ready,action:'verify'});
    const shipment=create('replenish');documentAction(s,{id:shipment,action:'approve'});documentAction(s,{id:shipment,action:'verify'});documentAction(s,{id:shipment,action:'saveShipments',shipments:[{lineKey:'p0:s0',wid:'w0',qty:6,tracking:'DEMO10001'},{lineKey:'p1:s1',wid:'w0',qty:5,tracking:'DEMO10001'}]});documentAction(s,{id:shipment,action:'shipReplenishment',ids:s.documents.find(x=>x.id===shipment).shipments.map(x=>x.id)});
    create('issue');create('issue','w1',{lines:[{pid:'p2',sid:'s2',qty:2}]});
    const task=saveTask(s,{name:'门店月度库存盘点',warehouses:['w1','w2'],products:['p0','p1','p2','p3','p4','p5'],mode:'all'});
    taskAction(s,{id:task,action:'send'});taskAction(s,{id:task,wid:'w1',action:'count',lineKey:'p0:s0',quantity:balance(s,'w1','p0','s0')-1});
    saveTask(s,{name:'常规用品专项盘点',warehouses:['w1','w2','w3'],products:['p4','p5','p6'],mode:'stock'});
    return migrate(s);
  }
  root.WeidStockModel={copy,now,uid,quantity,sum,key,warehouse,product,spec,balance,catalog,validate,apply,seed,docStatus,skuDefaults,unitTable,defaultUnit,conversion,convert,lineBase,referenced,averageCost,quantityText};
  if(typeof module==='object'&&module.exports)module.exports=root.WeidStockModel;
})(typeof window==='undefined'?globalThis:window);

;
/* PC and the self-contained V3 use the same origin-scoped inventory database.
 * A read/modify/write transaction compares the version before committing.
 */
(function(root){
  'use strict';
  function create(options={}){
    const M=root.WeidStockModel,DB=options.name||'weid-store-inventory-v1',STORE='state',KEY='inventory',listeners=new Set();
    let dbPromise,current,initializing,channel;
    const failure=(prefix,e)=>Error(prefix+'：'+(e?.message||e?.name||'未知存储错误')+'。原记录及当前填写内容已保留。');
    function open(){
      if(dbPromise)return dbPromise;
      dbPromise=new Promise((resolve,reject)=>{
        let r,done=false;const finish=(e,db)=>{if(done){db?.close();return}done=true;clearTimeout(timer);e?reject(e):resolve(db);};
        const timer=setTimeout(()=>finish(Error('库存数据库打开超时，请关闭旧页面后重试。')),5000);
        try{r=(options.indexedDB||root.indexedDB).open(DB,1);}catch(e){finish(failure('无法打开库存数据库',e));return;}
        r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains(STORE))r.result.createObjectStore(STORE);};
        r.onerror=()=>finish(failure('无法打开库存数据库',r.error));
        r.onblocked=()=>finish(Error('库存数据库被旧页面占用，请关闭旧页面后重试。'));
        r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();dbPromise=null;};finish(null,db);};
      }).catch(e=>{dbPromise=null;throw e;});
      return dbPromise;
    }
    function accept(s){M.validate(s);if(!current||s.revision>=current.revision)current=s;return current;}
    function initialize(){
      if(initializing)return initializing;
      initializing=open().then(db=>new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let value,error;
        r.onsuccess=()=>{try{const version=r.result?.materialVersion;value=r.result===undefined?M.seed():M.validate(r.result);if(r.result===undefined)store.add(value,KEY);else if(version!==value.materialVersion){value.revision++;store.put(value,KEY);}}catch(e){error=e;tx.abort();}};
        tx.oncomplete=()=>resolve(accept(value));tx.onabort=tx.onerror=()=>reject(error||failure('库存初始化失败',tx.error));
      })).catch(e=>{initializing=null;throw e;});
      return initializing;
    }
    async function read(){
      await initialize();const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);let value;
        r.onsuccess=()=>value=r.result;
        tx.oncomplete=()=>{try{resolve(accept(value));}catch(e){reject(e);}};
        tx.onabort=tx.onerror=()=>reject(failure('库存读取失败',tx.error));
      });
    }
    async function commit(command,payload,expected=current?.revision){
      await initialize();const db=await open();
      const result=await new Promise((resolve,reject)=>{
        const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let next,result,error;
        r.onsuccess=()=>{try{
          const saved=M.validate(r.result);
          if(expected!==saved.revision)throw Error('另一页面已更新库存数据，本次未保存。请保留当前填写内容，刷新数据后重新核对。');
          next=M.copy(saved);result=M.apply(next,command,payload);next.revision=saved.revision+1;store.put(next,KEY);
        }catch(e){error=e;tx.abort();}};
        tx.oncomplete=()=>{accept(next);resolve(result);};
        tx.onabort=tx.onerror=()=>reject(error||failure('库存保存失败',tx.error));
      });
      try{channel?.postMessage({revision:current.revision});}catch{}
      listeners.forEach(fn=>{try{fn(current);}catch(e){console.warn(e);}});
      return result;
    }
    async function refresh(){if(!current)return;const revision=current.revision;try{await read();if(current.revision>revision)listeners.forEach(fn=>fn(current));}catch(e){console.warn(e.message);}}
    try{channel=new root.BroadcastChannel(DB);channel.onmessage=refresh;}catch{}
    root.addEventListener?.('focus',refresh);
    return {initialize,read,commit,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},get current(){return current;},close(){channel?.close();dbPromise?.then(db=>db.close());root.removeEventListener?.('focus',refresh);}};
  }
  root.WeidStockStorage={create};
})(typeof window==='undefined'?globalThis:window);

;
/* Small, dependency-free OOXML/CSV exchange for the inventory templates.
 * All rows are previewed and validated before an atomic import.
 */
window.StockExchange=(()=>{
  const enc=new TextEncoder(),dec=new TextDecoder();
  const xml=s=>String(s??'').replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&apos;'}[c]));
  const crcTable=Array.from({length:256},(_,i)=>{for(let j=0;j<8;j++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
  const crc=bytes=>{let c=0xffffffff;for(const b of bytes)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
  const column=n=>{let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
  function zip(files){
    let offset=0;const chunks=[],central=[];
    for(const [name,text] of Object.entries(files)){
      const filename=enc.encode(name),data=enc.encode(text),checksum=crc(data),head=new Uint8Array(30+filename.length),v=new DataView(head.buffer);
      v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,checksum,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);head.set(filename,30);
      const c=new Uint8Array(46+filename.length),cv=new DataView(c.buffer);cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint32(16,checksum,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,filename.length,true);cv.setUint32(42,offset,true);c.set(filename,46);
      chunks.push(head,data);central.push(c);offset+=head.length+data.length;
    }
    const end=new Uint8Array(22),ev=new DataView(end.buffer);ev.setUint32(0,0x06054b50,true);ev.setUint16(8,central.length,true);ev.setUint16(10,central.length,true);ev.setUint32(12,central.reduce((n,x)=>n+x.length,0),true);ev.setUint32(16,offset,true);
    return new Blob([...chunks,...central,end],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  }
  function download(name,headers,rows){
    const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const sheet='<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="'+ns+'"><sheetData>'+[headers,...rows].map((row,i)=>'<row r="'+(i+1)+'">'+row.map((value,j)=>'<c r="'+column(j)+(i+1)+'"'+(typeof value==='number'?' t="n"><v>'+value+'</v>':' t="inlineStr"><is><t xml:space="preserve">'+xml(value)+'</t></is>')+'</c>').join('')+'</row>').join('')+'</sheetData></worksheet>';
    const blob=zip({
      '[Content_Types].xml':'<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
      '_rels/.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
      'xl/workbook.xml':'<workbook xmlns="'+ns+'" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="库存数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
      'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
      'xl/worksheets/sheet1.xml':sheet
    });
    const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function csv(text){
    const rows=[];let row=[],cell='',quote=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quote&&text[i+1]==='"'){cell+='"';i++;}else quote=!quote;}else if(c===','&&!quote){row.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(Boolean))rows.push(row);row=[];cell='';}else cell+=c;}
    if(quote)throw Error('CSV 引号未闭合。');row.push(cell);if(row.some(Boolean))rows.push(row);return rows;
  }
  async function unzip(buffer){
    const bytes=new Uint8Array(buffer),v=new DataView(buffer);let end=bytes.length-22;
    while(end>=0&&v.getUint32(end,true)!==0x06054b50)end--;
    if(end<0)throw Error('不是有效的 xlsx 文件。');
    let pos=v.getUint32(end+16,true),count=v.getUint16(end+10,true),total=0;const files={};
    for(let n=0;n<count;n++){
      if(v.getUint32(pos,true)!==0x02014b50)throw Error('Excel 压缩目录损坏。');
      const method=v.getUint16(pos+10,true),size=v.getUint32(pos+20,true),length=v.getUint32(pos+24,true),nl=v.getUint16(pos+28,true),extra=v.getUint16(pos+30,true),comment=v.getUint16(pos+32,true),off=v.getUint32(pos+42,true),name=dec.decode(bytes.slice(pos+46,pos+46+nl));
      total+=length;if(total>30*1024*1024)throw Error('工作簿解压后超过 30 MB，请拆分导入。');
      const start=off+30+v.getUint16(off+26,true)+v.getUint16(off+28,true),data=bytes.slice(start,start+size);
      if(name.endsWith('.xml')||name.endsWith('.rels')){
        if(method===0)files[name]=dec.decode(data);
        else if(method===8){const stream=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));files[name]=await new Response(stream).text();}
        else throw Error('不支持此 Excel 压缩方式，请另存为标准 xlsx。');
      }
      pos+=46+nl+extra+comment;
    }
    return files;
  }
  async function read(file){
    if(file.size>8*1024*1024)throw Error('文件超过 8 MB，请拆分导入。');
    let rows;
    if(/\.csv$/i.test(file.name))rows=csv((await file.text()).replace(/^\uFEFF/,''));
    else if(/\.xlsx$/i.test(file.name)){
      const files=await unzip(await file.arrayBuffer()),parse=s=>{const doc=new DOMParser().parseFromString(s||'','application/xml');if(doc.querySelector('parsererror'))throw Error('Excel 内容格式错误。');return doc;};
      const strings=files['xl/sharedStrings.xml']?[...parse(files['xl/sharedStrings.xml']).getElementsByTagName('si')].map(x=>[...x.getElementsByTagName('t')].map(t=>t.textContent).join('')):[];
      const book=parse(files['xl/workbook.xml']),first=book.getElementsByTagName('sheet')[0],rel=first?.getAttribute('r:id');
      const relationships=parse(files['xl/_rels/workbook.xml.rels']),target=[...relationships.getElementsByTagName('Relationship')].find(x=>x.getAttribute('Id')===rel)?.getAttribute('Target');
      const path=target?.startsWith('/')?target.slice(1):'xl/'+target;
      if(!files[path])throw Error('未找到 Excel 第一个工作表。');
      rows=[...parse(files[path]).getElementsByTagName('row')].map(row=>{const cells=[];for(const c of row.getElementsByTagName('c')){const letters=c.getAttribute('r')?.replace(/\d/g,'')||'A';let index=0;for(const l of letters)index=index*26+l.charCodeAt(0)-64;const v=c.getElementsByTagName('v')[0]?.textContent||'';cells[index-1]=c.getAttribute('t')==='s'?strings[Number(v)]||'':c.getAttribute('t')==='inlineStr'?[...c.getElementsByTagName('t')].map(x=>x.textContent).join(''):v;}return cells;});
    }else throw Error('请选择 .xlsx 或 UTF-8 .csv 文件。');
    rows=rows.filter(row=>row.some(x=>String(x??'').trim()));
    if(rows.length<2)throw Error('文件没有待导入的数据。');
    const headers=rows.shift().map(x=>String(x).trim());
    if(new Set(headers).size!==headers.length)throw Error('表头存在重名列。');
    return rows.map((row,index)=>({line:index+2,...Object.fromEntries(headers.map((h,i)=>[h,String(row[i]??'').trim()]))}));
  }
  return {read,download};
})();

;
/* Inventory UI uses existing PCUI islands; only inventory-specific layout lives here. */
window.StockPC=(()=>{
  const M=WeidStockModel,db=WeidStockStorage.create(),E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const pages={'stock-reports':'库存报表','stock-ledger':'出入库明细','stock-transfers':'库存调拨','stock-inbound':'物料入库','stock-outbound':'物料出库','stock-purchases':'采购管理','stock-tasks':'任务中心','stock-warehouses':'仓库管理','stock-products':'物料管理','stock-categories':'分类管理'};
  const state={active:false,route:'stock-reports',pages:{},layers:[],busy:false,error:null,exportRows:[],exportHeads:[],opener:null};
  const S={M,db,E,pages,state,views:{},drawers:{},actions:{},get data(){return db.current;},get page(){return state.pages[state.route]||(state.pages[state.route]={tab:'',filters:{},applied:{},page:1,size:10,selected:[]});},get top(){return state.layers.at(-1);}};
  S.button=(text,action,id='',extra='',cls='',disabled=false)=>'<button type="button" class="btn '+cls+'" data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(extra)+'"'+(disabled?' disabled':'')+'>'+E(text)+'</button>';
  S.link=(text,action,id='',extra='')=>S.button(text,action,id,extra,'text');
  S.input=(label,value,bind='',type='text',extra='')=>'<input type="'+type+'" aria-label="'+E(label)+'" value="'+E(value)+'"'+(bind?' data-stock-bind="'+E(bind)+'"':'')+(type==='number'?' min="0" step="0.001"':'')+' '+extra+'>';
  S.select=(label,options,value,bind='',extra='')=>'<select aria-label="'+E(label)+'" data-filterable'+(bind?' data-stock-bind="'+E(bind)+'"':'')+' '+extra+'>'+options.map(o=>{const [id,name]=Array.isArray(o)?o:[o,o];return '<option value="'+E(id)+'"'+((Array.isArray(value)?value.includes(id):String(value??'')===String(id))?' selected':'')+'>'+E(name)+'</option>';}).join('')+'</select>';
  S.check=(label,checked,action,id='',extra='')=>'<label><input type="checkbox" aria-label="'+E(label||'选择此行')+'" '+(checked?'checked':'')+' data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(extra)+'">'+E(label)+'</label>';
  S.field=(label,control,required=false)=>'<div class="field"><label class="'+(required?'required':'')+'">'+E(label)+'</label>'+control+'</div>';
  S.form=fields=>'<div class="ub-form">'+fields.join('')+'</div>';
  S.tag=status=>'<span class="pill '+(/^(已完成|完全入库|已出库|已采购|已收货|启用)$/.test(status)?'green':/拒绝|撤销|取消|作废|禁用/.test(status)?'red':'blue')+'">'+E(status)+'</span>';
  S.wh=id=>M.warehouse(S.data,id)?.name||'—';
  S.cat=id=>S.data.categories.find(x=>x.id===id)?.name||'—';
  S.whOptions=(empty=true)=>[...(empty?[['','全部']]:[]),...S.data.warehouses.map(x=>[x.id,x.name+(x.enabled?'':'（禁用）')])];
  S.productOptions=()=>[['','全部'],...S.data.products.map(x=>[x.id,x.name])];
  S.categoryOptions=()=>{
    const out=[['','全部']];function walk(parent,depth){S.data.categories.filter(x=>x.parent===parent).forEach(x=>{out.push([x.id,'　'.repeat(depth)+x.name]);walk(x.id,depth+1);});}walk('',0);return out;
  };
  S.table=(columns,rows,tableName='')=>'<div class="table-wrap"><table '+(tableName?'data-pc-table-name="'+E(tableName)+'" ':'')+'data-pc-align="left" data-pc-min-height="0"><thead><tr>'+columns.map(c=>'<th data-pc-min-width="'+(c[2]||110)+'">'+c[0]+'</th>').join('')+'</tr></thead><tbody>'+(rows.length?rows.map((r,i)=>'<tr>'+columns.map(c=>'<td>'+c[1](r,i)+'</td>').join('')+'</tr>').join(''):'<tr><td colspan="'+columns.length+'">暂无符合条件的数据</td></tr>')+'</tbody></table></div>';
  S.exportable=(columns,rows)=>{state.exportHeads=columns.filter(x=>!x[3]).map(x=>String(x[0]).replace(/<[^>]*>/g,''));state.exportRows=rows.map((r,i)=>columns.filter(x=>!x[3]).map(x=>{const d=document.createElement('div');d.innerHTML=x[1](r,i);return d.textContent;}));};
  S.paged=(columns,rows,exportable=true,tableName='')=>{
    const p=S.page;p.page=Math.max(1,Math.min(p.page,Math.ceil(rows.length/p.size)||1));
    if(exportable)S.exportable(columns,rows);
    return S.table(columns,rows.slice((p.page-1)*p.size,p.page*p.size),tableName)+'<div data-pc-pager="'+E(JSON.stringify({total:rows.length,page:p.page,size:p.size,action:'stock',selected:p.selected.length}))+'"></div>';
  };
  S.panel=(title,content,actions='')=>'<section class="panel content-module"><div class="panel-head"><h2>'+E(title)+'</h2><div class="actions">'+actions+'</div></div>'+content+'</section>';
  S.tabs=(items,selected,action='tab',id='')=>'<div class="pc-tabs" role="tablist" aria-label="库存业务页签">'+items.map(x=>'<button type="button" class="pc-tab'+(selected===x?' active':'')+'" role="tab" aria-selected="'+(selected===x)+'" data-stock-action="'+E(action)+'" data-stock-id="'+E(id)+'" data-stock-extra="'+E(x)+'">'+E(x)+'</button>').join('')+'</div>';
  S.layerSearch=controls=>'<section class="panel query-module" aria-label="当前抽屉搜索"><div class="filterbar">'+controls.join('')+'<div class="query-actions">'+S.button('重置','layerReset')+S.button('搜索','drawRefresh')+'</div></div></section>';
  S.filter=(label,key,type='text',options=[])=>{
    const value=S.page.filters[key]??'';
    if(type==='select'||type==='multi')return S.select(label,type==='multi'?options.filter(x=>!Array.isArray(x)||x[0]!==''):options,type==='multi'?(Array.isArray(value)?value:[]):value,'filter.'+key,type==='multi'?'multiple':'');
    if(type==='range')return '<div class="mr-date" data-pc-label="'+E(label)+'">'+S.input(label+'开始日期',S.page.filters[key+'From']||'','filter.'+key+'From','date')+'<span>至</span>'+S.input(label+'结束日期',S.page.filters[key+'To']||'','filter.'+key+'To','date')+'</div><div class="refund-quick">'+['上月','昨天','今天','本周','本月'].map(x=>S.button(x,'date',key,x,'text')).join('')+'</div>';
    return S.input(label,value,'filter.'+key,'text','placeholder="'+E(label)+'"');
  };
  S.search=controls=>'<section class="panel query-module" aria-label="搜索区"><form class="filterbar" data-stock-search>'+controls.join('')+'<div class="query-actions">'+S.button('重置','reset')+S.button('搜索','search','','','primary')+'</div></form></section>';
  S.matches=(value,query)=>!query||String(value??'').toLowerCase().includes(String(query).toLowerCase());
  S.chosen=(selection,value)=>Array.isArray(selection)?!selection.length||selection.includes(value):!selection||selection===value;
  S.inCategory=(category,selected)=>{if(!selected)return true;let id=category;while(id){if(id===selected)return true;id=S.data.categories.find(x=>x.id===id)?.parent;}return false;};
  S.inDate=(at,key,f=S.page.applied)=>!f[key+'From']&&!f[key+'To']||!!at&&(!f[key+'From']||at.slice(0,10)>=f[key+'From'])&&(!f[key+'To']||at.slice(0,10)<=f[key+'To']);
  S.filteredDocs=kind=>{
    const f=S.page.applied;
    return S.data.documents.filter(d=>d.kind===kind&&(!f.wid||d.wid===f.wid)&&(!f.to||d.to===f.to)&&(!f.status||d.status===f.status)&&(!f.type||d.type===f.type)&&S.matches(d.no,f.no)&&S.matches((d[f.personField||'createdBy']||'')+' '+(d.createdPhone||''),f.person)&&(!f.pid||d.lines.some(x=>x.pid===f.pid))&&S.inDate(d[f.dateField||(kind==='inbound'?'receivedAt':'createdAt')],'date')&&S.inDate(d.reviewAt,'review')&&S.inDate(d.verifiedAt,'verify')&&S.inDate(d.completedAt,'complete')&&S.inDate(d.shippedAt||d.completedAt,'out'));
  };
  S.open=(type,data={},title='',width=860)=>{
    if(!state.layers.length)state.opener=document.activeElement;
    state.layers.push({type,data:M.copy(data),title,width,revision:S.data.revision,error:'',selection:[],query:'',category:''});
    S.renderLayer(state.layers.length-1);
  };
  S.renderLayer=index=>{
    const l=state.layers[index];if(!l)return;const render=S.drawers[l.type];if(!render)throw Error('未找到库存页面：'+l.type);
    const content=render(l,index),id='stock-layer-'+index;
    syncDrawerLayer(document.querySelector('#mergeDrawers'),id,'<div class="merge-drawer-backdrop stock-module" data-stock-depth="'+index+'"><section id="'+id+'" class="merge-drawer ub-drawer stock-drawer" data-size="'+(l.width===560?'small':l.width===860?'medium':'large')+'" style="--archive-drawer-width:'+l.width+'px" role="dialog" aria-modal="true" aria-label="'+E(l.title)+'" tabindex="-1"><header class="merge-drawer-head"><h2>'+E(l.title)+'</h2><button type="button" class="icon-btn" aria-label="关闭'+E(l.title)+'" data-stock-action="close">'+icon('close')+'</button></header><div class="merge-drawer-body">'+content.body+'<p class="stock-error" role="alert">'+E(l.error)+'</p></div><footer class="merge-drawer-foot"><div class="actions">'+(content.footer||S.button('关闭','close'))+'</div></footer></section></div>');
    document.querySelectorAll('[data-stock-depth]').forEach(el=>{el.firstElementChild.inert=Number(el.dataset.stockDepth)!==state.layers.length-1;});
    syncDrawerInteraction();PCUI.sweep();requestAnimationFrame(()=>document.querySelector('#'+id)?.focus({preventScroll:true}));
  };
  S.close=()=>{
    const index=state.layers.length-1;if(index<0)return;
    const closing=state.layers.pop();syncDrawerLayer(document.querySelector('#mergeDrawers'),'stock-layer-'+index,'');
    const parent=document.querySelector('#stock-layer-'+(index-1));if(parent)parent.inert=false;
    if(closing.type==='tags'&&S.top?.type==='catalog')S.renderLayer(index-1);
    syncDrawerInteraction();setTimeout(()=>{if(parent)parent.focus({preventScroll:true});else state.opener?.isConnected&&state.opener.focus({preventScroll:true});},300);
  };
  S.fail=error=>{if(S.top){S.top.error=error.message;const el=document.querySelector('#stock-layer-'+(state.layers.length-1)+' .stock-error');if(el){el.textContent=error.message;el.scrollIntoView({block:'nearest'});}}else{state.error=error;S.render();}};
  S.run=async(command,payload,after,expected=S.top?.revision??S.data.revision)=>{
    if(state.busy)return;state.busy=true;
    try{const result=await db.commit(command,payload,expected);state.error=null;state.layers.forEach(l=>{if(l.revision===expected)l.revision=S.data.revision;});await after?.(result);S.render();toast('已保存');}
    catch(e){S.fail(e);}finally{state.busy=false;}
  };
  S.confirm=(title,message,action)=>PCUI.dialog({title,content:'<p>'+E(message)+'</p>',buttons:[{text:'取消',action:()=>PCUI.closeDialog()},{text:'确定',primary:true,action:()=>{PCUI.closeDialog();action();}}]});
  S.render=()=>{
    if(!state.active)return;
    const root=document.querySelector('#main');
    if(!S.data){root.innerHTML='<section class="panel"><div class="empty"><div>库存数据暂时无法加载</div><p>'+E(state.error?.message||'正在加载…')+'</p>'+S.button('重新加载','retry')+'</div></section>';return;}
    const content=S.views[state.route]?.()||'';
    root.innerHTML='<div class="stock-module ub-workspace"><div class="page-head"><h1>'+E(pages[state.route])+'</h1></div>'+(state.error?'<div class="stock-error" role="alert">'+E(state.error.message)+S.button('重新读取','reload')+'</div>':'')+content+'</div>';PCUI.sweep();
  };
  S.actions.close=()=>S.close();
  S.actions.tab=(id,value)=>{S.page.tab=value;S.page.page=1;S.page.selected=[];S.page.filters={};S.page.applied={};S.render();};
  S.actions.search=()=>{S.page.applied=M.copy(S.page.filters);S.page.page=1;S.page.selected=[];S.render();};
  S.actions.reset=()=>{S.page.filters={};S.page.applied={};S.page.page=1;S.page.selected=[];S.render();};
  S.actions.layerReset=()=>{for(const key of ['query','category','status'])if(Object.hasOwn(S.top.data,key))S.top.data[key]='';S.renderLayer(S.state.layers.length-1);};
  S.actions.date=(key,preset)=>{
    const d=new Date(),start=new Date(d);let end=new Date(d);
    if(preset==='昨天'){start.setDate(d.getDate()-1);end=new Date(start);}
    if(preset==='上月'){start.setMonth(d.getMonth()-1,1);end=new Date(d.getFullYear(),d.getMonth(),0);}
    if(preset==='本月'){start.setDate(1);end=new Date(d.getFullYear(),d.getMonth()+1,0);}
    if(preset==='本周')start.setDate(d.getDate()-(d.getDay()+6)%7);
    const fmt=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
    S.page.filters[key+'From']=fmt(start);S.page.filters[key+'To']=fmt(end);S.render();
  };
  S.actions.selected=(id,extra,target)=>{const set=new Set(S.page.selected);target.checked?set.add(id):set.delete(id);S.page.selected=[...set];};
  S.actions.selectAll=(id,extra,target)=>{S.page.selected=target.checked?(S.visibleIds||[]):[];S.render();};
  S.actions.export=()=>StockExchange.download(pages[state.route],state.exportHeads,state.exportRows);
  S.actions.reload=async()=>{try{await db.read();state.error=null;S.render();}catch(e){S.fail(e);}};
  S.actions.retry=async()=>{try{await db.initialize();state.error=null;S.render();}catch(e){S.fail(e);}};
  function bind(event){
    const el=event.target.closest('[data-stock-bind]');if(!el||!el.closest('.stock-module'))return;
    const binding=el.dataset.stockBind,depth=el.closest('[data-stock-depth]')?.dataset.stockDepth,l=depth!==undefined?state.layers[Number(depth)]:null;
    let value=el.type==='checkbox'?el.checked:el.multiple?[...el.selectedOptions].map(x=>x.value):el.type==='number'?(el.value===''?'':Number(el.value)):el.value;
    if(binding.startsWith('filter.')){S.page.filters[binding.slice(7)]=value;return;}
    if(!l)return;
    const parts=binding.split('.');let obj=l.data;for(const part of parts.slice(0,-1)){if(!obj[part])obj[part]={};obj=obj[part];}obj[parts.at(-1)]=value;
  }
  document.addEventListener('input',bind);document.addEventListener('change',bind);
  document.addEventListener('click',event=>{
    const el=event.target.closest('[data-stock-action]');if(!el||!el.closest('.stock-module')||el.matches('input')||el.disabled||state.busy)return;
    event.preventDefault();try{const result=S.actions[el.dataset.stockAction]?.(el.dataset.stockId,el.dataset.stockExtra,el);if(result?.catch)result.catch(S.fail);}catch(e){S.fail(e);}
  });
  document.addEventListener('change',event=>{
    const el=event.target;if(el.matches('[data-stock-action]')&&el.closest('.stock-module'))try{const result=S.actions[el.dataset.stockAction]?.(el.dataset.stockId,el.dataset.stockExtra,el);if(result?.catch)result.catch(S.fail);}catch(e){S.fail(e);}
  });
  document.addEventListener('submit',event=>{if(event.target.matches('[data-stock-search]')){event.preventDefault();S.actions.search();}});
  document.addEventListener('keydown',event=>{
    if(!state.active)return;
    if(event.key==='Enter'&&event.target.closest('[data-stock-search]')&&event.target.tagName==='INPUT'){event.preventDefault();S.actions.search();}
    if(event.key==='Enter'&&event.target.closest('[data-stock-depth] .query-module')&&event.target.tagName==='INPUT'){event.preventDefault();S.actions.drawRefresh();}
    if(event.key==='Escape'&&state.layers.length&&!PCUI.isPopupOpen()&&!document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){event.preventDefault();event.stopImmediatePropagation();S.close();}
    if(event.key==='Tab'&&state.layers.length){const layer=document.querySelector('#stock-layer-'+(state.layers.length-1)),items=[...layer.querySelectorAll('button,input,select,textarea,[tabindex="0"]')].filter(x=>!x.disabled&&!x.hidden&&x.getClientRects().length);if(!items.length)return;const first=items[0],last=items.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}}
  },true);
  PCUI.registerPager('stock',(v)=>{S.page.page=v.currentPage;S.page.size=v.pageSize;S.page.selected=[];S.render();});
  db.subscribe(()=>{if(state.active&&!state.busy){S.render();if(S.top){S.top.error='库存数据已在其他页面更新。当前填写内容已保留，提交前请重新打开单据核对。';const el=document.querySelector('#stock-layer-'+(state.layers.length-1)+' .stock-error');if(el)el.textContent=S.top.error;}}});
  return S;
})();

;
(function(S){
  'use strict';
  const {E,M}=S,B=S.button,L=S.link,F=S.filter;
  const cols={no:['单据编号',d=>E(d.no),190],wid:['门店仓库',d=>E(S.wh(d.wid)),140],status:['状态',d=>S.tag(d.status)],applicant:['申请人',d=>E(d.createdBy)],created:['申请时间',d=>E(d.createdAt),170],reviewer:['审核人',d=>E(d.reviewer||'—')],reviewed:['审核时间',d=>E(d.reviewAt||'—'),170],detail:['操作',d=>L('详情','document',d.id),130,true]};
  function selection(rows){S.visibleIds=rows.map(x=>x.id);return [S.check('全选',rows.length>0&&rows.every(x=>S.page.selected.includes(x.id)),'selectAll'),d=>S.check('',S.page.selected.includes(d.id),'selected',d.id),55,true];}
  function docSearch(kind,extra=[]){
    const p=S.page.filters,person='<div class="refund-keyword" data-pc-label="人员">'+S.select('人员类型',[['createdBy','申请人'],['reviewer','审核人']],p.personField||'createdBy','filter.personField')+S.input('姓名 / 手机号',p.person||'','filter.person','text','placeholder="姓名 / 手机号"')+'</div>';
    return S.search([F(kind==='transfer'?'调出门店仓库':'门店仓库','wid','select',S.whOptions()),...(kind==='transfer'?[F('调入门店仓库','to','select',S.whOptions())]:[]),F('单据编号','no'),F('状态','status','select',[['','全部'],...M.docStatus[kind]]),...(kind==='inbound'?[F('入库类型','type','select',[['','全部'],'调拨入库','退货入库','采购入库','归还入库','盘盈入库'])]:[]),person,...(kind==='transfer'?[F('日期类型','dateField','select',[['createdAt','申请时间'],['receivedAt','入库时间'],['shippedAt','出库时间']])]:[]),F(kind==='inbound'?'入库时间':'申请时间','date','range'),...extra]);
  }
  function rowsTotal(d,key='qty'){return E(M.quantityText(d.lines,key));}
  S.views['stock-transfers']=()=>{
    const rows=S.filteredDocs('transfer');
    return docSearch('transfer')+S.panel('调拨单',S.paged([cols.no,['调出门店仓库',d=>E(S.wh(d.wid)),160],['调入门店仓库',d=>E(S.wh(d.to)),160],['调拨状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,cols.detail],rows),B('申请调拨','newDocument','transfer','','primary'));
  };
  S.views['stock-inbound']=()=>{
    const tab=S.page.tab||'物料入库',tabs=S.tabs(['物料入库','门店补货','发货管理'],tab);
    if(tab==='门店补货')return tabs+replenishment();
    if(tab==='发货管理')return tabs+shipping();
    const rows=S.filteredDocs('inbound');
    return tabs+docSearch('inbound')+S.panel('入库单',S.paged([selection(rows),cols.no,cols.wid,['入库类型',d=>E(d.type)],['入库数量',d=>rowsTotal(d)],['已入库数量',d=>rowsTotal(d,'received')],['入库状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,['入库人',d=>E(d.receiver||'—')],['入库时间',d=>E(d.receivedAt||'—'),170],cols.detail],rows),B('申请入库','newDocument','inbound','','primary')+B('导入数据','import','inbound')+B('批量审核','batch','approve')+B('批量入库','batch','receiveInbound'));
  };
  function replenishment(){
    const rows=S.filteredDocs('replenish');
    const search=S.search([F('申请时间','date','range'),F('单据编号','no'),F('申请门店','wid','select',S.whOptions()),F('审核时间','review','range'),F('核数时间','verify','range'),F('完成时间','complete','range'),F('状态','status','select',[['','全部'],...M.docStatus.replenish])]);
    return search+S.panel('门店补货单',S.paged([['序号',(d,i)=>(S.page.page-1)*S.page.size+i+1,65],['补货单号',cols.no[1],210],cols.wid,['申请总数',d=>rowsTotal(d)],['审核总数',d=>rowsTotal(d,'approved')],['应发总数',d=>rowsTotal(d,'expected')],['实发总数',d=>E(M.quantityText(d.shipments.filter(x=>x.status!=='待发货').map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'qty'))],['实收总数',d=>E(M.quantityText(d.shipments.map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'actual'))],['差异总数',d=>E(M.quantityText(d.shipments.map(x=>({...x,unit:d.lines.find(l=>l.key===x.lineKey)?.unit})),'difference'))],cols.status,cols.applicant,cols.created,cols.reviewer,cols.reviewed,['核对人',d=>E(d.verifier||'—')],['核对时间',d=>E(d.verifiedAt||'—'),170],['完成时间',d=>E(d.completedAt||'—'),170],['操作',d=>L(d.status==='待审核'?'审批':d.status==='待核数'?'核对数量':['待发货','在途','部分收货'].includes(d.status)?'发货管理':'详情','document',d.id),140,true]],rows),B('新增门店补货单','newDocument','replenish','','primary')+B('导入','import','replenish'));
  }
  S.shippingRows=()=>{
    const f=S.page.applied;
    return S.data.documents.filter(d=>d.kind==='replenish'&&['待发货','在途','部分收货','已完成'].includes(d.status)&&(!f.wid||d.wid===f.wid)&&S.matches(d.no,f.no)&&S.inDate(d.verifiedAt,'date')&&S.inDate(d.shippedAt,'out')).flatMap(d=>d.lines.filter(l=>(!f.pid||l.pid===f.pid)&&S.inCategory(M.product(S.data,l.pid)?.category,f.category)&&(!f.tag?.length||(Array.isArray(f.tag)?f.tag:[f.tag]).some(id=>M.product(S.data,l.pid)?.tags.includes(id)))).map(l=>{
      const shipments=d.shipments.filter(x=>x.lineKey===l.key),sent=M.sum(shipments.filter(x=>x.status!=='待发货'),'qty');
      return {id:d.id+'|'+l.key,d,l,shipments,sent,status:sent>=l.expected?'已发货':'待发货'};
    })).filter(x=>(!f.status||x.status===f.status)&&S.matches(x.shipments.map(s=>s.tracking).join(','),f.tracking));
  };
  function shipping(){
    const rows=S.shippingRows();
    return S.search([F('应发时间','date','range'),F('最近发货','out','range'),F('补货单号','no'),F('申请门店','wid','select',S.whOptions()),F('物料分类','category','select',S.categoryOptions()),F('物料名称','pid','select',S.productOptions()),F('状态','status','select',[['','全部'],'待发货','已发货']),F('物流单号','tracking'),F('标签','tag','multi',[['','全部'],...S.data.tags.map(t=>[t.id,t.name])])])+S.panel('发货明细',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['补货单号',x=>E(x.d.no),210],['门店',x=>E(S.wh(x.d.wid)),140],['物料编号',x=>E(x.l.code)],['物料名称',x=>E(x.l.name),150],['规格型号',x=>E(x.l.spec)],['应发数量',x=>x.l.expected||0],['待发数量',x=>(x.l.expected||0)-x.sent],['实发数量',x=>x.sent],['单位',x=>E(x.l.unit)],['状态',x=>S.tag(x.status)],['发货仓库',x=>E([...new Set(x.shipments.map(s=>S.wh(s.wid)))].join('、')||'—'),150],['物流单号',x=>E(x.shipments.map(s=>s.tracking).filter(Boolean).join('、')||'—'),170],['创建应发时间',x=>E(x.d.verifiedAt),170],['最近发货时间',x=>E(x.d.shippedAt||'—'),170],['操作',x=>L('详情','shipping',x.d.id,x.l.key)+(x.status==='待发货'?L('确认发货','shipping',x.d.id,x.l.key):''),170,true]],rows),B('下载待发清单','exportPending')+B('导入发货单','import','shipping')+B('批量确认发货','batchShipping'));
  }
  S.views['stock-outbound']=()=>{
    const tab=S.page.tab||'领用出库',kinds={'领用出库':'issue','销售出库':'sale','服务消耗':'consume','退回入库':'returnIn','退回出库':'returnOut'},kind=kinds[tab],rows=S.filteredDocs(kind);
    return S.tabs(Object.keys(kinds),tab)+docSearch(kind,[F('出库时间','out','range'),F('物料名称','pid','select',S.productOptions())])+S.panel(tab,S.paged([cols.no,cols.wid,['业务记录号',d=>E(d.source||'—'),170],['数量',d=>rowsTotal(d),160],['规格数',d=>d.lines.length],cols.status,cols.applicant,cols.created,cols.detail],rows),(['issue','sale','consume'].includes(kind)?B('新增'+tab,'newDocument',kind,'','primary'):'')+B('按产品 / 服务扣库','fromSales'));
  };
  S.views['stock-purchases']=()=>{
    const tab=S.page.tab||'采购管理',tabs=S.tabs(['采购管理','物料管理'],tab);
    if(tab==='物料管理'){
      const f=S.page.applied,rows=S.data.documents.filter(d=>d.kind==='purchase'&&!['待审核','待提交','已拒绝'].includes(d.status)).flatMap(d=>d.lines.map(l=>({d,l,id:d.id+'|'+l.key}))).filter(x=>(!f.status||(x.l.purchaseStatus||'待采购')===f.status)&&S.matches(x.l.name+' '+x.l.code+' '+S.wh(x.d.wid),f.q)&&S.inDate(f.dateField==='purchasedAt'?x.l.purchasedAt:x.d.createdAt,'date'));
      return tabs+S.search([F('日期类型','dateField','select',[['createdAt','申请时间'],['purchasedAt','采购时间']]),F('日期','date','range'),F('采购状态','status','select',[['','全部'],'待采购','待付款','已采购','不采购']),F('关键词','q')])+S.panel('采购物料',S.paged([['申请时间',x=>E(x.d.createdAt),170],['门店仓库',x=>E(S.wh(x.d.wid)),140],['物料名称',x=>E(x.l.name),160],['单位',x=>E(x.l.unit)],['规格型号',x=>E(x.l.spec)],['采购数量',x=>x.l.qty],['采购单价',x=>Number(x.l.purchasePrice??x.l.unitPrice??x.l.cost).toFixed(2)],['总金额',x=>(x.l.qty*(x.l.purchasePrice??x.l.unitPrice??x.l.cost)).toFixed(2)],['采购状态',x=>S.tag(x.l.purchaseStatus||'待采购')],['采购人',x=>E(x.l.purchaser||'—')],['采购时间',x=>E(x.l.purchasedAt||'—'),170],['快递 / 物流',x=>E(x.l.tracking||'—'),150],['备注',x=>E(x.l.purchaseNote||'—'),160],['操作',x=>L(['已采购','不采购'].includes(x.l.purchaseStatus)?'详情':'采购处理','purchaseItem',x.d.id,x.l.key),140,true]],rows));
    }
    return tabs+docSearch('purchase')+S.panel('采购申请',S.paged([cols.no,cols.wid,['采购状态',cols.status[1]],cols.applicant,cols.created,cols.reviewer,cols.reviewed,cols.detail],S.filteredDocs('purchase')),B('申请采购','newDocument','purchase','','primary'));
  };
  S.views['stock-ledger']=()=>{
    const f=S.page.applied,types=['调拨入库','退货入库','采购入库','归还入库','盘盈入库','补货入库','差异入库','销售出库','服务消耗','调拨出库','退货出库','借出出库','盘亏出库','领用出库','补货出库','差异出库'];
    const rows=S.data.ledger.filter(x=>x.type!=='期初库存'&&S.chosen(f.wid,x.wid)&&S.chosen(f.pid,x.pid)&&(!f.direction||(f.direction==='入库'?x.delta>0:x.delta<0))&&(!f.type||x.type===f.type)&&S.inDate(x.at,'date')).slice().reverse();
    return S.search([F('操作时间','date','range'),F('物料名称','pid','multi',S.productOptions()),F('门店仓库','wid','multi',S.whOptions()),F('出入库','direction','select',[['','全部'],'出库','入库']),F('类型','type','select',[['','全部'],...types])])+S.panel('出入库明细',S.paged([['门店仓库',x=>E(S.wh(x.wid)),150],['物料名称',x=>E(M.product(S.data,x.pid)?.name),170],['单位',x=>E(x.baseUnit||S.baseUnit(x.pid,x.sid))],['规格型号',x=>E(M.spec(S.data,x.pid,x.sid)?.name)],['出入库类型',x=>E(x.type)],['出库数量',x=>x.delta<0?-x.delta:0],['入库数量',x=>x.delta>0?x.delta:0],['单位成本（元）',x=>x.unitCost===undefined?'—':Number(x.unitCost).toFixed(4),140],['金额（元）',x=>x.value===undefined?'—':Number(x.value).toFixed(2),130],['成本来源',x=>x.unitCost===undefined?'历史未记录':x.costEstimated?'含参考估值':'实际入库成本',140],['操作时间',x=>E(x.at),170],['备注',x=>E(x.note||'—'),180]],rows),B('导出','export'));
  };
  S.reportMetrics=(wid,pid,sid='',unit='')=>{
    const f=S.page.applied,match=x=>S.chosen(wid,x.wid)&&S.chosen(pid,x.pid)&&(!sid||x.sid===sid)&&(!unit||(x.baseUnit||S.baseUnit(x.pid,x.sid))===unit),entries=S.data.ledger.filter(x=>match(x)&&S.inDate(x.at,'date'));
    const qty=type=>entries.filter(x=>x.type===type).reduce((n,x)=>n+Math.abs(x.delta),0),current=S.data.ledger.filter(x=>match(x)&&(!f.dateTo||x.at.slice(0,10)<=f.dateTo)).reduce((n,x)=>n+x.delta,0);
    return {current,purchase:qty('采购入库'),transferIn:qty('调拨入库'),returned:qty('退货入库'),sales:qty('销售出库'),consume:qty('服务消耗'),issue:qty('领用出库'),transferOut:qty('调拨出库')};
  };
  S.reportColumns=[['当前库存','current'],['采购入库','purchase'],['调拨入库','transferIn'],['退回入库','returned'],['销售出库','sales'],['服务消耗','consume'],['领用出库','issue'],['调拨出库','transferOut']].map(([label,k])=>[label,x=>Math.round(x.metrics[k]*1000)/1000,110]);
  S.lossRows=()=>S.data.tasks.flatMap(t=>t.stores.flatMap(st=>st.rows.filter(r=>r.counted!==null).map(r=>({id:t.id+'|'+st.wid+'|'+r.key,t,st,r})))).filter(x=>{const f=S.page.applied;return S.chosen(f.wid,x.st.wid)&&S.chosen(f.pid,x.r.pid)&&(!f.status||(x.r.processed?'已处理':'待处理')===f.status)&&S.inDate(x.r.countedAt,'date');});
  S.views['stock-reports']=()=>{
    const tab=S.page.tab||'物料报表',f=S.page.applied;
    const search=S.search([F('日期','date','range'),F('门店仓库','wid','multi',S.whOptions()),F('物料名称','pid','multi',S.productOptions()),...(tab==='损益报表'?[F('状态','status','select',[['','全部'],'待处理','已处理'])]:[F('空数据','hide','select',[['','隐藏空数据'],['show','显示空数据']])])]);
    if(tab==='损益报表')return S.tabs(['物料报表','仓库报表','损益报表'],tab)+search+S.panel('盘点损益',S.paged([['门店名称',x=>E(S.wh(x.st.wid)),140],['物料名称',x=>E(M.product(S.data,x.r.pid)?.name),160],['规格',x=>E(M.spec(S.data,x.r.pid,x.r.sid)?.name)],['最小单位',x=>E(S.baseUnit(x.r.pid,x.r.sid))],['期初盘点数',x=>x.r.baseline],['损益',x=>(x.r.processed?x.r.difference:x.r.counted-x.r.countedBalance)],['期末结存',x=>x.r.processed?x.r.confirmed:x.r.counted],['状态',x=>S.tag(x.r.processed?'已处理':'待处理')],['操作时间',x=>E(x.r.processedAt||x.r.countedAt),170],['备注',x=>E(x.r.note||'—'),180],['操作',x=>L('查看','countDetail',x.t.id,x.st.wid),100,true]],S.lossRows()));
    const isProduct=tab==='物料报表',units=[...new Set(M.catalog(S.data).filter(x=>S.chosen(f.pid,x.pid)).map(x=>x.baseUnit))];
    const rows=(isProduct?M.catalog(S.data).filter(x=>S.chosen(f.pid,x.pid)).map(x=>({id:x.pid+'|'+x.sid,name:x.product.name,spec:x.name,unit:x.baseUnit,metrics:S.reportMetrics(f.wid,x.pid,x.sid)})):S.data.warehouses.filter(w=>S.chosen(f.wid,w.id)).flatMap(w=>units.map(unit=>({id:w.id,name:w.name,spec:'',unit,metrics:S.reportMetrics(w.id,f.pid,'',unit)})))).filter(x=>f.hide==='show'||Object.values(x.metrics).some(Number));
    const totals=units.map(unit=>({id:'total',name:'合计',spec:'',unit,metrics:Object.fromEntries(['current','purchase','transferIn','returned','sales','consume','issue','transferOut'].map(k=>[k,rows.filter(x=>x.unit===unit).reduce((n,r)=>n+r.metrics[k],0)]))}));
    const columns=[[isProduct?'物料名称':'仓库名称',x=>E(x.name),170],...(isProduct?[['规格',x=>E(x.spec),130]]:[]),['最小单位',x=>E(x.unit),90],...S.reportColumns,['操作',x=>x.id==='total'?'':L('查看','reportDetail',x.id,isProduct?'product':'warehouse'),100,true]],all=[...rows,...totals];S.exportable(columns,all);return S.tabs(['物料报表','仓库报表','损益报表'],tab)+search+S.panel(tab,S.table(columns,all),B('导出','export'));
  };
  S.views['stock-warehouses']=()=>{
    const f=S.page.applied,rows=S.data.warehouses.filter(x=>S.matches(x.name+' '+x.store+' '+x.receiver,f.q)&&(!f.status||String(x.enabled)===f.status));
    return S.search([F('关键词','q'),F('状态','status','select',[['','全部'],['true','启用'],['false','禁用']])])+S.panel('仓库列表',S.paged([['仓库名称',x=>E(x.name),160],['关联门店',x=>E(x.store),150],['负责人',x=>E(x.receiver)],['手机号',x=>E(x.phone||'—'),140],['详细地址',x=>E(x.address||'—'),220],['状态',x=>'<label class="switch"><input type="checkbox" aria-label="启用'+E(x.name)+'" '+(x.enabled?'checked':'')+' data-stock-action="toggleCatalog" data-stock-id="'+x.id+'" data-stock-extra="warehouses"><span></span></label>'],['操作',x=>L('修改','catalog',x.id,'warehouses'),110,true]],rows),B('添加仓库','catalog','','warehouses','primary'));
  };
  S.views['stock-products']=()=>{
    const f=S.page.applied,matchMany=(v,q)=>!q||q.split(/[\s,，;；]+/).map(x=>x.trim()).filter(Boolean).some(x=>S.matches(v,x));
    const rows=S.data.products.filter(x=>matchMany(x.code,f.code)&&matchMany(x.name,f.name)&&S.inCategory(x.category,f.category)&&(!f.enabled||String(x.enabled)===f.enabled)&&(!f.use||String(x.useEnabled)===f.use)&&(!f.tag?.length||(Array.isArray(f.tag)?f.tag:[f.tag]).some(id=>x.tags.includes(id))));
    return S.search([F('物料编号','code'),F('物料名称','name'),F('物料分类','category','select',S.categoryOptions()),F('仓库启用','enabled','select',[['','全部'],['true','启用'],['false','禁用']]),F('标签','tag','multi',[['','全部'],...S.data.tags.map(x=>[x.id,x.name])]),F('领用','use','select',[['','全部'],['true','启用'],['false','禁用']])])+S.panel('物料列表',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['编号',x=>E(x.code)],['分类',x=>E(S.cat(x.category))],['物料名称',x=>E(x.name),170],['最小单位',x=>E([...new Set(x.specs.map(v=>v.baseUnit))].join(' / '))],['规格 / 成本价（元）',x=>x.specs.map(v=>E(v.name)+' / '+Number(v.cost).toFixed(2)+' 元 / '+E(v.baseUnit)).join('<br>'),190],['物料标签',x=>E(x.tags.map(id=>S.data.tags.find(t=>t.id===id)?.name).filter(Boolean).join('、')||'—'),140],['启用状态',x=>'<label class="switch"><input type="checkbox" aria-label="启用'+E(x.name)+'" '+(x.enabled?'checked':'')+' data-stock-action="toggleCatalog" data-stock-id="'+x.id+'" data-stock-extra="products"><span></span></label>'],['领用',x=>S.tag(x.useEnabled?'启用':'禁用')],['操作',x=>L('编辑','catalog',x.id,'products'),100,true]],rows),B('添加物料','catalog','','products','primary')+B('批量编号搜索','bulkQuery','code')+B('批量名称搜索','bulkQuery','name')+B('导入数据','import','products')+B('批量领用','batchUse')+B('标签管理','tags'));
  };
  S.views['stock-categories']=()=>{
    const f=S.page.applied,rows=[],collapsed=S.page.collapsed||[];function walk(parent,depth){S.data.categories.filter(x=>x.parent===parent).forEach(x=>{if(!f.q||S.matches(x.name,f.q))rows.push({...x,depth});if(f.q||!collapsed.includes(x.id))walk(x.id,depth+1);});}walk('',0);
    return S.search([F('分类名称','q')])+S.panel('分类列表',S.paged([['名称',x=>'<span style="padding-left:'+x.depth*20+'px">'+(S.data.categories.some(c=>c.parent===x.id)?B(collapsed.includes(x.id)?'展开':'收起','categoryToggle',x.id,'','text'):'')+E(x.name)+'</span>',300],['操作',x=>L('绑定门店','bindCategory',x.id)+L('添加下级','catalog','',JSON.stringify({type:'categories',parent:x.id}))+L('编辑','catalog',x.id,'categories')+L('删除','deleteCatalog',x.id,'categories'),300,true]],rows),B('新增分类','catalog','','categories','primary'));
  };
  S.actions.categoryToggle=id=>{const set=new Set(S.page.collapsed||[]);set.has(id)?set.delete(id):set.add(id);S.page.collapsed=[...set];S.render();};
  S.views['stock-tasks']=()=>{
    const f=S.page.applied,rows=S.data.tasks.filter(x=>S.matches(x.name,f.q)&&(!f.status||x.status===f.status)),progress=t=>{const all=t.stores.flatMap(s=>s.rows);return all.filter(x=>x.counted!==null).length+'/'+all.length;};
    return S.search([F('任务名称','q'),F('任务状态','status','select',[['','全部'],'待发送','进行中','已完成','已作废'])])+S.panel('盘点任务',S.paged([selection(rows),['序号',(x,i)=>(S.page.page-1)*S.page.size+i+1],['任务名称',x=>E(x.name),210],['发起日期',x=>E(x.createdAt),170],['任务进度',progress],['处理进度',x=>{const all=x.stores.flatMap(s=>s.rows);return all.filter(r=>r.processed).length+'/'+all.length;}],['任务状态',x=>S.tag(x.status)],['操作人',x=>E(x.actor)],['操作',x=>(x.status==='待发送'?L('编辑','taskEdit',x.id):L('查看','taskStores',x.id))+L('盘点详情','countDetail',x.id)+(x.status==='待发送'?L('确认发送','taskAction',x.id,'send'):L('复制','taskCopy',x.id))+(['待发送','进行中'].includes(x.status)?L('作废','taskAction',x.id,'void'):''),320,true]],rows),B('添加任务','taskEdit','','','primary'));
  };
  S.actions.reportDetail=(id,type)=>S.open('report',{id,type},type==='product'?M.product(S.data,id.split('|')[0]).name:S.wh(id),1120);
  S.drawers.report=l=>{
    const d=l.data,isProduct=d.type==='product',[pid,sid]=d.id.split('|'),rows=isProduct?S.data.warehouses.map(w=>({name:w.name,spec:M.spec(S.data,pid,sid).name,unit:S.baseUnit(pid,sid),wid:w.id,pid,sid,metrics:S.reportMetrics(w.id,pid,sid)})):M.catalog(S.data).map(x=>({name:x.product.name,spec:x.name,unit:x.baseUnit,wid:d.id,pid:x.pid,sid:x.sid,metrics:S.reportMetrics(d.id,x.pid,x.sid)}));
    return {body:S.table([[isProduct?'仓库名称':'物料名称',x=>E(x.name),160],['规格',x=>E(x.spec),120],['最小单位',x=>E(x.unit),90],...S.reportColumns,['当前参考库存金额',x=>M.averageCost(S.data,x.wid,x.pid,x.sid).value.toFixed(2),170],['成本来源',x=>M.averageCost(S.data,x.wid,x.pid,x.sid).estimated?'含历史参考估值':'实际入库成本',150]],rows)};
  };
})(StockPC);

;
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const titles={transfer:'调拨',inbound:'入库',purchase:'采购',replenish:'补货',issue:'领用',sale:'销售',consume:'消耗',returnIn:'退回入库',returnOut:'退回出库'};
  const section=(title,body,actions='')=>'<section class="stock-section"><div class="stock-section-head"><h3>'+E(title)+'</h3><div class="actions">'+actions+'</div></div>'+body+'</section>';
  const summary=values=>'<div class="stock-summary">'+Object.entries(values).map(([k,v])=>'<div><span>'+E(k)+'：</span><div>'+E(v||'—')+'</div></div>').join('')+'</div>';
  S.section=section;S.summary=summary;
  const lineCols=[['序号',(l,i)=>i+1,65],['编号',l=>E(l.code||M.product(S.data,l.pid)?.code)],['物料名称',l=>E(l.name||M.product(S.data,l.pid)?.name),150],['规格型号',l=>E(l.spec||M.spec(S.data,l.pid,l.sid)?.name)],['单位',l=>E(l.unit||M.product(S.data,l.pid)?.unit),65]];
  S.lineCols=lineCols;
  S.actions.newDocument=kind=>S.open('docForm',{kind,wid:'',to:'',type:'',lines:[],step:kind==='replenish'?1:2},'申请'+titles[kind],860);
  S.actions.document=id=>{
    const d=S.data.documents.find(x=>x.id===id);if(!d)throw Error('单据不存在。');
    if(d.status==='待提交')S.open('docForm',{...d,step:2},'编辑'+titles[d.kind]+'申请',860);
    else S.open('document',{...d,quantities:Object.fromEntries(d.lines.map(l=>[l.key,d.kind==='replenish'?(l.expected??l.approved??l.qty):l.qty-(l.received||0)])),comment:''},titles[d.kind]+'单详情',d.kind==='replenish'?1120:860);
  };
  S.drawers.docForm=l=>{
    const d=l.data,kind=d.kind;
    if(kind==='replenish'&&d.step===1)return {body:S.form([F('申请补货仓库',C('申请补货仓库',[['','请选择'],...S.whOptions(false)],d.wid,'wid','data-stock-action="drawRefresh"'),true)]),footer:B('取消','close')+B('下一步','replenishNext','','','primary')};
    const controls=[F(kind==='transfer'?'调出门店仓库':'门店仓库',C('门店仓库',[['','请选择'],...S.whOptions(false)],d.wid,'wid','data-stock-action="drawRefresh"'),true)];
    if(kind==='transfer')controls.push(F('调入门店仓库',C('调入门店仓库',[['','请选择'],...S.whOptions(false)],d.to,'to'),true));
    if(['sale','consume'].includes(kind))controls.push(F('业务记录号',I('销售订单号 / 服务记录号',d.source||'','source'),true));
    if(kind==='inbound')controls.push(F('入库类型',C('入库类型',[['','请选择'],'调拨入库','退货入库','采购入库','归还入库','盘盈入库'],d.type,'type'),true));
    const columns=[...lineCols.slice(0,-1),['业务单位',(x,i)=>C('业务单位 '+(i+1),S.unitOptions(x.pid,x.sid),x.unit,'lines.'+i+'.unit','data-stock-action="documentUnit" data-stock-id="'+i+'"'),130],['本仓库存',x=>d.wid?M.balance(S.data,d.wid,x.pid,x.sid)+' '+E(S.baseUnit(x.pid,x.sid)):'—',140],...(['inbound','purchase'].includes(kind)?[['供应商',(x,i)=>C('供应商 '+(i+1),[['','请选择'],...S.data.suppliers.filter(v=>v.enabled).map(v=>[v.id,v.name])],x.supplier||'','lines.'+i+'.supplier','data-stock-action="documentUnit" data-stock-id="'+i+'"'),180],['采购单价（元 / 业务单位）',(x,i)=>I('采购单价 '+(i+1),x.unitPrice,'lines.'+i+'.unitPrice','number'),160]]:[]),['申请数量',(x,i)=>I('申请数量 '+(i+1),x.qty,'lines.'+i+'.qty','number','data-stock-action="drawRefresh"'),140],['折合库存数量',(x,i)=>'<span data-stock-doc-preview="'+i+'">'+E(S.unitPreview(x.pid,x.sid,x.unit,x.qty))+'</span>',170],['操作',(x,i)=>L('移除','removeLine',String(i)),80]];
    return {body:S.form(controls)+section('物料信息',S.table(columns,d.lines),B('选择物料','pickProducts','','','primary')),footer:B('取消','close')+(kind==='replenish'?B('上一步','replenishBack'):B('保存草稿','saveDocument','draft'))+B(kind==='replenish'?'提交补货单':['issue','sale','consume'].includes(kind)?'确认出库':'提交审核','saveDocument','submit','','primary')};
  };
  S.actions.replenishNext=()=>{if(!M.warehouse(S.data,S.top.data.wid)?.enabled)throw Error('请选择启用的申请仓库。');S.top.data.step=2;S.renderLayer(S.state.layers.length-1);};
  S.actions.replenishBack=()=>{S.top.data.step=1;S.renderLayer(S.state.layers.length-1);};
  S.actions.removeLine=id=>{S.top.data.lines.splice(Number(id),1);S.renderLayer(S.state.layers.length-1);};
  S.actions.saveDocument=mode=>{
    const l=S.top,p={...l.data,submit:mode==='submit'};
    return S.run('document.save',p,()=>S.close(),l.revision);
  };
  S.actions.pickProducts=()=>{
    const parent=S.top;S.open('picker',{query:'',category:'',selected:(parent.data.lines||[]).map(x=>M.key(x.pid,x.sid))},'添加物料',860);
  };
  const selectable=x=>{const kind=S.state.layers.at(-2)?.data.kind,p=x.product;return p.enabled&&x.enabled!==false&&(kind!=='issue'||p.useEnabled&&p.deductionMode!=='consume')&&(kind!=='sale'||p.saleEnabled)&&(kind!=='consume'||p.deductionMode==='consume');};
  S.drawers.picker=l=>{
    const d=l.data,rows=M.catalog(S.data).filter(x=>selectable(x)&&S.matches(x.product.name+' '+x.product.code,d.query)&&(!d.category||x.product.category===d.category));
    return {body:S.layerSearch([I('物料名称',d.query,'query'),C('物料分类',S.categoryOptions(),d.category,'category')])+B('全选当前结果','pickAll')+B('清空选择','pickNone')+S.table([[S.check('选择',rows.length>0&&rows.every(x=>d.selected.includes(x.key)),'pickAll'),x=>S.check('',d.selected.includes(x.key),'pick',x.key),60],['编号',x=>E(x.product.code)],['物料名称',x=>E(x.product.name),170],['所属分类',x=>E(S.cat(x.product.category))],['单位',x=>E(x.baseUnit)],['规格型号',x=>E(x.name)]],rows),footer:'<span data-stock-picked>已选 '+d.selected.length+' 项</span>'+B('取消','close')+B('确定','pickConfirm','','','primary')};
  };
  S.actions.drawRefresh=()=>S.renderLayer(S.state.layers.length-1);
  S.actions.pick=(id,extra,target)=>{const set=new Set(S.top.data.selected);target.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];const counter=document.querySelector('#stock-layer-'+(S.state.layers.length-1)+' [data-stock-picked]');if(counter)counter.textContent='已选 '+set.size+' 项';};
  S.actions.pickAll=()=>{const d=S.top.data;d.selected=[...new Set([...d.selected,...M.catalog(S.data).filter(x=>selectable(x)&&S.matches(x.product.name+' '+x.product.code,d.query)&&(!d.category||x.product.category===d.category)).map(x=>x.key)])];S.actions.drawRefresh();};
  S.actions.pickNone=()=>{S.top.data.selected=[];S.actions.drawRefresh();};
  S.actions.pickConfirm=()=>{
    const picked=S.top.data.selected,parent=S.state.layers.at(-2),existing=parent.data.lines||[];
    parent.data.lines=picked.map(k=>existing.find(x=>M.key(x.pid,x.sid)===k)||(()=>{const x=M.catalog(S.data).find(x=>x.key===k);return {pid:x.pid,sid:x.sid,key:k,name:x.product.name,code:x.product.code,spec:x.name,unit:M.defaultUnit(S.data,x.pid,x.sid,parent.data.kind),unitPrice:Number(x.cost)*M.conversion(S.data,x.pid,x.sid,M.defaultUnit(S.data,x.pid,x.sid,parent.data.kind)).factor,qty:0,approved:0};})());
    S.close();S.renderLayer(S.state.layers.length-1);
  };
  function comments(d){
    return section('评论记录',(d.comments||[]).map(x=>'<article class="stock-comment"><small>'+E(x.actor)+' · '+E(x.at)+'</small><p>'+E(x.text)+'</p><div class="stock-photos">'+(x.files||[]).map(file=>'<a href="'+E(file.src)+'" target="_blank"><img src="'+E(file.src)+'" alt="'+E(file.name)+'"></a>').join('')+'</div></article>').join('')+'<textarea aria-label="评论内容" data-stock-bind="comment" maxlength="200" rows="3" placeholder="请输入评论，最多 200 字">'+E(d.comment||'')+'</textarea>'+B('发送','comment'));
  }
  S.comments=comments;
  S.drawers.document=l=>{
    const d=l.data,review=d.kind==='replenish'&&d.status==='待审核',verify=d.kind==='replenish'&&d.status==='待核数',receive=d.kind==='inbound'&&['待入库','部分入库'].includes(d.status);
    let columns=[...lineCols,['本仓库存',x=>d.wid?M.balance(S.data,d.wid,x.pid,x.sid)+' '+E(S.baseUnit(x.pid,x.sid)):'—',140],['折合库存数量',x=>(x.baseQty??x.qty)+' '+E(x.conversion?.baseUnit||x.unit),150],['申请数量',x=>x.qty]];
    if(d.kind==='inbound')columns.push(['采购单价（元）',x=>x.unitPrice??x.cost,140],['已入库数量',x=>x.received||0],['确认入库数量',x=>receive?I('本次入库数量',d.quantities[x.key],'quantities.'+x.key,'number'):x.received||0,160]);
    if(d.kind==='replenish'){
      columns.push(['审核数量',(x,i)=>review?I('审核数量',x.approved??x.qty,'lines.'+i+'.approved','number'):x.approved??'—',140],['应发数量',x=>verify?I('应发数量',d.quantities[x.key],'quantities.'+x.key,'number'):x.expected??'—',140],['实发数量',x=>M.sum(d.shipments.filter(sh=>sh.lineKey===x.key&&sh.status!=='待发货'),'qty')],['实收数量',x=>M.sum(d.shipments.filter(sh=>sh.lineKey===x.key),'actual')]);
      if(review)columns.push(['操作',(x,i)=>L('移除','removeLine',String(i)),90]);
    }
    if(d.kind==='purchase')columns.push(['采购状态',x=>E(x.purchaseStatus||(['待提交','待审核'].includes(d.status)?'—':'待采购'))],['操作',x=>['待采购','部分采购','待入库','部分入库','已完成'].includes(d.status)?L('采购处理','purchaseItem',d.id,x.key):'—',120]);
    const info={...(d.source?{'业务记录号':d.source}:{}),...(d.originId?{'原单据':S.data.documents.find(x=>x.id===d.originId)?.no,'退回原因':d.reason}:{}),'单据编号':d.no,'状态':d.status,'门店仓库':S.wh(d.wid),...(d.kind==='transfer'?{'调入门店仓库':S.wh(d.to)}:{}),'申请人':d.createdBy,'申请时间':d.createdAt,'审核人':d.reviewer,'审核时间':d.reviewAt,...(d.kind==='inbound'?{'入库类型':d.type,'入库时间':d.receivedAt}:{}),...(d.kind==='replenish'?{'核对人':d.verifier,'核对时间':d.verifiedAt,'完成时间':d.completedAt}:{})};
    let footer=B('关闭','close');
    if(['sale','issue','inbound'].includes(d.kind)&&S.data.ledger.some(x=>x.doc===d.id))footer+=B('退回登记','returnForm',d.id);
    if(d.status==='待审核')footer+=(review?B('保存草稿','docAction','reviewDraft'):'')+B('通过审核','docAction','approve','','primary')+B('拒绝申请','docAction','reject');
    if(verify)footer+=B('核对完成','docAction','verify','','primary');
    if(receive)footer+=B('确认入库','docAction','receiveInbound','','primary');
    if(d.kind==='transfer'&&d.status==='待发货')footer+=B('确认发货','docAction','shipTransfer','','primary');
    if(d.kind==='transfer'&&d.status==='待收货')footer+=B('确认收货','docAction','receiveTransfer','','primary');
    if(d.kind==='transfer'&&d.status==='待审核')footer+=B('撤销申请','docAction','revoke');
    if(d.kind==='replenish'&&['待发货','在途','部分收货','已完成'].includes(d.status))footer+=B('发货管理','shipping',d.id,'','primary');
    const history=section('操作记录',S.table([['时间',x=>E(x.at),170],['操作人',x=>E(x.actor)],['操作',x=>E(x.action)],['备注',x=>E(x.note||'—'),200]],d.logs||[]));
    return {body:summary(info)+(d.reason?'<p>拒绝原因：'+E(d.reason)+'</p>':'')+section('物料信息',S.table(columns,d.lines),review?B('添加物料','pickProducts'):'')+(d.kind==='replenish'?comments(d):'')+history,footer};
  };
  S.actions.docAction=action=>{
    const l=S.top,p={id:l.data.id,action,lines:l.data.lines,quantities:l.data.quantities};
    if(action==='reject'){S.open('reject',{id:l.data.id,reason:''},'拒绝申请',560);return;}
    const run=()=>S.run('document.action',p,()=>{const id=p.id;S.close();S.actions.document(id);},l.revision);
    if(['approve','shipTransfer','receiveTransfer','revoke','receiveInbound','verify'].includes(action))S.confirm('确认操作','确认'+({approve:'通过该申请',shipTransfer:'发货并扣减调出仓库库存',receiveTransfer:'收货并增加调入仓库库存',revoke:'撤销该申请',receiveInbound:'按填写数量入库',verify:'完成应发数量核对'})[action]+'？',run);else return run();
  };
  S.drawers.reject=l=>({body:S.form([F('拒绝原因','<textarea rows="4" aria-label="拒绝原因" data-stock-bind="reason">'+E(l.data.reason)+'</textarea>')]),footer:B('取消','close')+B('拒绝申请','rejectConfirm','','','primary')});
  S.actions.rejectConfirm=()=>S.run('document.action',{id:S.top.data.id,action:'reject',reason:S.top.data.reason},()=>{S.close();S.close();});
  S.actions.comment=()=>{
    const l=S.top;return S.run('document.action',{id:l.data.id,action:'comment',text:l.data.comment},()=>{
      l.data.comments=M.copy(S.data.documents.find(x=>x.id===l.data.id).comments);l.data.comment='';l.revision=S.data.revision;S.actions.drawRefresh();
    },l.revision);
  };
  S.actions.batch=action=>{
    const docs=S.data.documents.filter(x=>S.page.selected.includes(x.id));if(!docs.length)throw Error('请选择入库单。');
    if(docs.some(x=>x.kind!=='inbound'||!(action==='approve'?['待审核']:['待入库','部分入库']).includes(x.status)))throw Error(action==='approve'?'批量审核只能选择待审核入库单。':'批量入库只能选择待入库或部分入库单。');
    const operations=docs.map(d=>({command:'document.action',payload:{id:d.id,action,quantities:Object.fromEntries(d.lines.map(l=>[l.key,l.qty-(l.received||0)]))}}));
    S.confirm(action==='approve'?'批量审核':'批量入库','确认处理已选 '+docs.length+' 张单据'+(action==='receiveInbound'?'，将全部剩余数量入库':'')+'？',()=>S.run('batch',{operations},()=>S.page.selected=[]));
  };
  S.actions.purchaseItem=(id,lineKey)=>{
    const d=S.data.documents.find(x=>x.id===id),line=d.lines.find(x=>x.key===lineKey);
    S.open('purchaseItem',{id,lineKey,line,status:line.purchaseStatus||'待付款',price:line.purchasePrice??line.unitPrice??line.cost,supplier:line.supplier||'',tracking:line.tracking||'',note:line.purchaseNote||'',readonly:['已采购','不采购'].includes(line.purchaseStatus)},'采购物料',560);
  };
  S.drawers.purchaseItem=l=>{
    const d=l.data,disabled=d.readonly?'disabled':'';
    return {body:summary({'物料名称':d.line.name,'规格型号':d.line.spec,'采购数量':d.line.qty+' '+d.line.unit})+S.form([F('供应商',C('供应商',[['','请选择'],...S.data.suppliers.filter(x=>x.enabled||x.id===d.supplier).map(x=>[x.id,x.name])],d.supplier,'supplier',disabled+' data-stock-action="purchaseSupplier"')),F('采购状态',C('采购状态',['待付款','已采购','不采购'],d.status,'status',disabled)),F('采购单价（元）',I('采购单价',d.price,'price','number',disabled)),F('快递 / 物流',I('快递 / 物流',d.tracking,'tracking','text',disabled)),F('备注','<textarea aria-label="采购备注" data-stock-bind="note" '+disabled+'>'+E(d.note)+'</textarea>')]),footer:B('关闭','close')+(d.readonly?'':B('保存','savePurchaseItem','','','primary'))};
  };
  S.actions.savePurchaseItem=()=>S.run('document.action',{...S.top.data,action:'purchaseItem'},()=>{
    S.close();if(S.top?.type==='document'){const id=S.top.data.id;S.close();S.actions.document(id);}
  });
  S.actions.shipping=(id,lineKey)=>{
    const d=S.data.documents.find(x=>x.id===id);S.open('shipping',{...d,lineKey,selected:[],comment:''},'发货管理',1120);
  };
  S.drawers.shipping=l=>{
    const d=l.data,rows=d.shipments.filter(x=>!d.lineKey||x.lineKey===d.lineKey),readonly=d.status==='已完成',columns=[
      [S.check('全选',rows.length>0&&rows.filter(x=>x.status==='待发货').every(x=>d.selected.includes(x.id)),'shipAll'),x=>x.status==='待发货'?S.check('',d.selected.includes(x.id),'shipPick',x.id):'',55],
      ['序号',(x,i)=>i+1,65],['物料名称',x=>E(d.lines.find(l=>l.key===x.lineKey)?.name),160],['规格型号',x=>E(d.lines.find(l=>l.key===x.lineKey)?.spec)],
      ['发货仓库',x=>x.status==='待发货'?C('发货仓库',[['','请选择'],...S.whOptions(false)],x.wid,'shipments.'+d.shipments.indexOf(x)+'.wid'):E(S.wh(x.wid)),190],
      ['单位',x=>E(d.lines.find(l=>l.key===x.lineKey)?.unit),70],
      ['实发数量',x=>x.status==='待发货'?I('实发数量',x.qty,'shipments.'+d.shipments.indexOf(x)+'.qty','number'):x.qty,140],
      ['物流单号',x=>x.status==='待发货'?I('物流单号',x.tracking,'shipments.'+d.shipments.indexOf(x)+'.tracking'):E(x.tracking||'—'),190],
      ['状态',x=>S.tag(x.status)],['发货时间',x=>E(x.shippedAt||'—'),170],['实收数量',x=>x.actual??'—'],['差异数量',x=>x.difference??'—'],['操作',x=>x.status==='待发货'?L('移除','shipRemove',x.id):'',90]];
    const totals=d.lines.filter(x=>!d.lineKey||x.key===d.lineKey).map(x=>({name:x.name,spec:x.spec,unit:x.unit,expected:x.expected,sent:M.sum(d.shipments.filter(sh=>sh.lineKey===x.key&&sh.status!=='待发货'),'qty')}));
    return {body:summary({'补货单号':d.no,'申请门店':S.wh(d.wid),'状态':d.status})+S.table([['物料名称',x=>E(x.name),170],['规格型号',x=>E(x.spec)],['单位',x=>E(x.unit)],['应发数量',x=>x.expected],['待发数量',x=>x.expected-x.sent],['实发数量',x=>x.sent]],totals)+section('发货明细',S.table(columns,rows),readonly?'':B('添加','shipAdd')+B('批量移除','shipRemoveSelected')+B('批量确认发货','shipConfirm'))+comments(d),footer:B('关闭','close')+(readonly?'':B('保存','shipSave','','','primary'))};
  };
  S.actions.shipAdd=()=>{
    const d=S.top.data,line=d.lines.find(x=>x.key===d.lineKey)||d.lines[0];
    if(d.lineKey){d.shipments.push({id:M.uid('SH'),lineKey:line.key,wid:'',qty:Math.max(0,line.expected-M.sum(d.shipments.filter(x=>x.lineKey===line.key),'qty')),tracking:'',status:'待发货'});S.actions.drawRefresh();}
    else S.open('shipProduct',{lineKey:line.key,options:d.lines.map(x=>[x.key,x.name+' / '+x.spec])},'选择发货物料',560);
  };
  S.drawers.shipProduct=l=>({body:S.form([F('物料规格',C('物料规格',l.data.options,l.data.lineKey,'lineKey'))]),footer:B('取消','close')+B('添加','shipProductConfirm','','','primary')});
  S.actions.shipProductConfirm=()=>{const key=S.top.data.lineKey;S.close();const d=S.top.data,l=d.lines.find(x=>x.key===key);d.shipments.push({id:M.uid('SH'),lineKey:key,wid:'',qty:Math.max(0,l.expected-M.sum(d.shipments.filter(x=>x.lineKey===key),'qty')),tracking:'',status:'待发货'});S.actions.drawRefresh();};
  S.actions.shipPick=(id,extra,target)=>{const set=new Set(S.top.data.selected);target.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];};
  S.actions.shipAll=()=>{const d=S.top.data;d.selected=d.shipments.filter(x=>x.status==='待发货'&&(!d.lineKey||x.lineKey===d.lineKey)).map(x=>x.id);S.actions.drawRefresh();};
  S.actions.shipRemove=id=>{S.top.data.shipments=S.top.data.shipments.filter(x=>x.id!==id||x.status!=='待发货');S.actions.drawRefresh();};
  S.actions.shipRemoveSelected=()=>{const d=S.top.data;d.shipments=d.shipments.filter(x=>x.status!=='待发货'||!d.selected.includes(x.id));d.selected=[];S.actions.drawRefresh();};
  function shipmentPayload(){const d=S.top.data;return {id:d.id,action:'saveShipments',shipments:d.shipments.filter(x=>x.status==='待发货')};}
  function refreshShipping(){const l=S.top,d=S.data.documents.find(x=>x.id===l.data.id),key=l.data.lineKey;l.data={...M.copy(d),lineKey:key,selected:[],comment:''};l.revision=S.data.revision;S.actions.drawRefresh();}
  S.actions.shipSave=()=>S.run('document.action',shipmentPayload(),refreshShipping);
  S.actions.shipConfirm=()=>{
    const d=S.top.data;if(!d.selected.length)throw Error('请选择待发货记录。');
    const payload={operations:[{command:'document.action',payload:shipmentPayload()},{command:'document.action',payload:{id:d.id,action:'shipReplenishment',ids:d.selected}}]},rev=S.top.revision;
    S.confirm('确认发货','确认发出已选记录，并扣减对应发货仓库库存？',()=>S.run('batch',payload,refreshShipping,rev));
  };
  S.actions.batchShipping=()=>{
    const selected=S.page.selected;if(!selected.length)throw Error('请选择待发货明细。');
    const rows=S.shippingRows().filter(x=>selected.includes(x.id)),operations=[];
    const ids=[...new Set(rows.map(x=>x.d.id))];
    ids.forEach(id=>{const d=S.data.documents.find(x=>x.id===id),keys=rows.filter(x=>x.d.id===id).map(x=>x.l.key),pending=d.shipments.filter(x=>x.status==='待发货'&&keys.includes(x.lineKey));if(!pending.length)throw Error('单据 '+d.no+' 尚未填写发货仓库与数量，请先打开详情添加发货明细。');operations.push({command:'document.action',payload:{id,action:'shipReplenishment',ids:pending.map(x=>x.id)}});});
    S.confirm('批量确认发货','确认发出已选物料中已保存的待发货记录？',()=>S.run('batch',{operations},()=>S.page.selected=[]));
  };
  S.actions.exportPending=()=>{
    const rows=S.shippingRows().filter(x=>x.status==='待发货');
    StockExchange.download('待发清单',['补货单号','物料编号','物料名称','规格型号','单位','应发数量','待发数量','申请门店'],rows.map(x=>[x.d.no,x.l.code,x.l.name,x.l.spec,x.l.unit,x.l.expected,x.l.expected-x.sent,S.wh(x.d.wid)]));
  };

  S.actions.documentUnit=id=>{const l=S.top.data.lines[Number(id)],v=M.spec(S.data,l.pid,l.sid),c=M.conversion(S.data,l.pid,l.sid,l.unit);l.unitPrice=(v.offers||[]).find(x=>x.supplier===l.supplier&&x.unit===l.unit)?.price??v.cost*c.factor;delete l.conversion;S.actions.drawRefresh();};
  S.actions.purchaseSupplier=()=>{const d=S.top.data,v=M.spec(S.data,d.line.pid,d.line.sid),offer=v.offers.find(x=>x.supplier===d.supplier&&x.unit===d.line.unit);if(offer)d.price=offer.price;S.actions.drawRefresh();};
  S.actions.returnForm=id=>{const d=S.data.documents.find(x=>x.id===id);S.open('returnForm',{id,lines:d.lines,quantities:{},reason:''},'退回登记 · '+d.no,860);};
  S.drawers.returnForm=l=>({body:S.table([...lineCols,['可退数量',x=>{const moved=S.data.ledger.filter(e=>e.doc===l.data.id&&e.pid===x.pid&&e.sid===x.sid).reduce((n,e)=>n+Math.abs(e.delta),0),returned=S.data.documents.filter(d=>d.originId===l.data.id).flatMap(d=>d.lines).filter(y=>y.key===x.key).reduce((n,y)=>n+y.baseQty,0);return Math.round((moved-returned)/(x.conversion?.factor||1)*1000)/1000;}],['本次退回',x=>I('本次退回 '+x.name,l.data.quantities[x.key]||0,'quantities.'+x.key,'number'),160]],l.data.lines)+S.form([F('退回原因',I('退回原因',l.data.reason,'reason'),true)]),footer:B('取消','close')+B('确认退回','saveReturn','','','primary')});
  S.actions.saveReturn=()=>S.run('document.return',S.top.data,id=>{S.close();S.actions.document(id);});
  S.actions.fromSales=()=>S.open('fromSales',{basicId:'',times:1,wid:'',source:''},'销售 / 服务扣库',860);
  S.drawers.fromSales=l=>({body:S.form([F('门店仓库',C('门店仓库',[['','请选择'],...S.whOptions(false)],l.data.wid,'wid'),true),F('基础产品',C('基础产品',[['','请选择'],...(S.data.salesProducts?.basics||[]).map(x=>[x.id,x.name+'（'+x.type+'）'])],l.data.basicId,'basicId','data-stock-action="drawRefresh"'),true),F('销售 / 服务数量',I('销售或服务数量',l.data.times,'times','number','data-stock-action="drawRefresh"'),true),F('业务记录号',I('销售订单号 / 服务记录号',l.data.source,'source'),true)])+S.section('扣库明细',S.table([['物料',x=>E(M.product(S.data,x.pid)?.name),180],['规格',x=>E(M.spec(S.data,x.pid,x.sid)?.name)],['每份数量',x=>E(x.qty)+' '+E(x.unit||'待确认单位')],['本次数量',(x,i)=>'<span data-stock-sales-qty="'+i+'">'+E(x.qty*l.data.times)+' '+E(x.unit||'待确认单位')+'</span>'],['扣减时点',x=>E(M.product(S.data,x.pid)?.deductionMode==='consume'?'实际消耗':'领用时扣库')]],(S.data.salesProducts?.basics.find(x=>x.id===l.data.basicId)?.materials||[])))+'<p>商品按全部子物料扣库；服务仅扣除配置为“实际消耗时扣库”的物料。请使用真实业务记录号，重复记录不能再次扣库。</p>',footer:B('取消','close')+B('确认扣库','saveFromSales','','','primary')});
  S.actions.saveFromSales=()=>S.run('document.fromSales',S.top.data,id=>{S.close();S.actions.document(id);});
  document.addEventListener('input',event=>{const el=event.target,b=el.dataset?.stockBind;if(!el.closest('.stock-module')||!S.top)return;const match=/^lines\.(\d+)\.qty$/.exec(b||'');if(S.top.type==='docForm'&&match){const i=Number(match[1]),l=S.top.data.lines[i],preview=document.querySelector('#stock-layer-'+(S.state.layers.length-1)+' [data-stock-doc-preview="'+i+'"]');if(preview)preview.textContent=S.unitPreview(l.pid,l.sid,l.unit,l.qty);}if(S.top.type==='fromSales'&&b==='times'){const d=S.top.data,lines=S.data.salesProducts?.basics.find(x=>x.id===d.basicId)?.materials||[];document.querySelectorAll('[data-stock-sales-qty]').forEach(node=>{const x=lines[Number(node.dataset.stockSalesQty)];if(x)node.textContent=x.qty*d.times+' '+(x.unit||'待确认单位');});}});
})(StockPC);

;
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const labels={warehouses:'仓库',products:'物料',categories:'分类',tags:'标签'};
  S.actions.catalog=(id,extra)=>{
    const config=extra.startsWith('{')?JSON.parse(extra):{type:extra},type=config.type,old=S.data[type].find(x=>x.id===id);
    const defaults={warehouses:{name:'',store:'',receiver:'',phone:'',address:'',enabled:true},products:{name:'',code:'',category:'',unit:'',tags:[],origin:'公司',shelfLife:'',thumbnail:'',pictures:[],useEnabled:true,enabled:false,specs:[{id:M.uid('SP'),name:'',price:0,cost:0,uses:1}]},categories:{name:'',parent:config.parent||'',stores:[]},tags:{name:''}};
    S.open('catalog',{type,value:old||defaults[type]},(id?'编辑':'新增')+labels[type],type==='products'?860:560);
  };
  S.drawers.catalog=l=>{
    const {type,value:v}=l.data,fields=[];
    if(type==='warehouses'){
      fields.push(F('仓库名称',I('仓库名称',v.name,'value.name'),true),F('关联门店',C('关联门店',[['','请选择'],...new Set(S.data.warehouses.map(x=>x.store))],v.store,'value.store'),true),F('详细地址',I('详细地址',v.address,'value.address')),F('收货人',C('收货人',[['','请选择'],'仓库管理员','门店负责人','当前用户'],v.receiver,'value.receiver'),true),F('手机号',I('手机号',v.phone,'value.phone','tel')),F('状态',C('状态',[['true','启用'],['false','禁用']],String(v.enabled),'value.enabled')));
    }else if(type==='products'){
      fields.push(F('物料编号',I('物料编号',v.code,'value.code'),true),F('物料名称',I('物料名称',v.name,'value.name'),true),F('标签',C('标签',S.data.tags.map(x=>[x.id,x.name]),v.tags,'value.tags','multiple')+L('管理标签','tags')),F('所属分类',C('所属分类',[['','请选择'],...S.categoryOptions().slice(1)],v.category,'value.category'),true),F('计量单位',C('计量单位',[['','请选择'],'个','盒','瓶','支','包','件','台','套','片','袋','箱','卷','双','毫升','克'],v.unit,'value.unit'),true));
    }else fields.push(F(labels[type]+'名称',I(labels[type]+'名称',v.name,'value.name'),true));
    let body=S.form(fields);
    if(type==='products'){
      body+=S.section('规格型号',S.table([['规格型号名称',(x,i)=>I('规格型号名称',x.name,'value.specs.'+i+'.name'),170],['销售原价（元）',(x,i)=>I('销售原价',x.price,'value.specs.'+i+'.price','number'),150],['成本价（元）',(x,i)=>I('成本价',x.cost,'value.specs.'+i+'.cost','number'),140],['使用次数',(x,i)=>I('使用次数',x.uses,'value.specs.'+i+'.uses','number'),130],['操作',(x,i)=>L('删除','specRemove',String(i)),90]],v.specs),B('添加','specAdd'));
      const imageField=(key,multiple)=>'<div class="stock-photos">'+(multiple?v.pictures:v.thumbnail?[{src:v.thumbnail,name:'缩略图'}]:[]).map((x,i)=>'<div><a href="'+E(x.src)+'" target="_blank"><img src="'+E(x.src)+'" alt="'+E(x.name)+'"></a>'+L('移除','imageRemove',key,String(i))+'</div>').join('')+'</div><input type="file" accept="image/png,image/jpeg,image/webp" '+(multiple?'multiple':'')+' aria-label="'+(multiple?'上传效果图':'上传缩略图')+'" data-stock-action="productImage" data-stock-id="'+key+'">';
      body+=S.form([F('保质期',I('保质期',v.shelfLife,'value.shelfLife')),F('缩略图',imageField('thumbnail',false)),F('效果图',imageField('pictures',true)),F('物料归属',C('物料归属',[['','请选择'],'公司','外部'],v.origin,'value.origin')),F('领用',C('领用',[['true','启用'],['false','禁用']],String(v.useEnabled),'value.useEnabled'),true),F('启用状态',C('启用状态',[['true','启用'],['false','禁用']],String(v.enabled),'value.enabled'))]);
    }
    return {body,footer:B('取消','close')+B('确定','saveCatalog','','','primary')};
  };
  S.actions.saveCatalog=()=>{
    const l=S.top,v=M.copy(l.data.value);for(const key of ['enabled','useEnabled'])if(Object.hasOwn(v,key))v[key]=v[key]===true||v[key]==='true';
    return S.run('catalog.save',{type:l.data.type,value:v},()=>{S.close();if(S.top?.type==='tags'){S.top.revision=S.data.revision;S.actions.drawRefresh();}else if(S.top?.type==='catalog'){S.top.revision=S.data.revision;S.actions.drawRefresh();}});
  };
  S.actions.specAdd=()=>{S.top.data.value.specs.push({id:M.uid('SP'),name:'',price:0,cost:0,uses:1});S.actions.drawRefresh();};
  S.actions.specRemove=id=>{if(S.top.data.value.specs.length===1)throw Error('至少保留一个规格。');S.top.data.value.specs.splice(Number(id),1);S.actions.drawRefresh();};
  S.readImages=async files=>{
    const selected=[...files];if(selected.length>6)throw Error('一次最多添加 6 张图片。');
    return Promise.all(selected.map(file=>new Promise((resolve,reject)=>{
      if(!/^image\/(png|jpeg|webp)$/.test(file.type)||file.size>2*1024*1024){reject(Error('请选择不超过 2 MB 的 PNG、JPEG 或 WebP 图片。'));return;}
      const reader=new FileReader();reader.onerror=()=>reject(Error('图片读取失败。'));reader.onload=()=>resolve({name:file.name,src:reader.result});reader.readAsDataURL(file);
    })));
  };
  S.actions.productImage=async(key,extra,input)=>{const l=S.top,images=await S.readImages(input.files);if(!S.state.layers.includes(l))return;if(key==='thumbnail')l.data.value.thumbnail=images[0]?.src||l.data.value.thumbnail;else l.data.value.pictures.push(...images);S.actions.drawRefresh();};
  S.actions.imageRemove=(key,index)=>{if(key==='thumbnail')S.top.data.value.thumbnail='';else S.top.data.value.pictures.splice(Number(index),1);S.actions.drawRefresh();};
  S.actions.toggleCatalog=(id,type,target)=>{
    const value=M.copy(S.data[type].find(x=>x.id===id));value.enabled=target.checked;return S.run('catalog.save',{type,value},undefined,S.data.revision);
  };
  S.actions.deleteCatalog=(id,type)=>S.confirm('删除'+labels[type],'确认删除“'+S.data[type].find(x=>x.id===id).name+'”？',()=>S.run('catalog.delete',{type,id},()=>{if(S.top){S.top.revision=S.data.revision;S.actions.drawRefresh();}}));
  S.actions.tags=()=>S.open('tags',{},'标签管理',560);
  S.drawers.tags=()=>({body:S.table([['标签名称',x=>E(x.name),220],['操作',x=>L('编辑','catalog',x.id,'tags')+L('移除','deleteCatalog',x.id,'tags'),170]],S.data.tags),footer:B('添加','catalog','','tags','primary')+B('关闭','close')});
  S.actions.bindCategory=id=>S.open('categoryStores',{value:M.copy(S.data.categories.find(x=>x.id===id))},'绑定门店',560);
  S.drawers.categoryStores=l=>({body:S.form([F('分类',E(l.data.value.name)),F('门店',C('绑定门店',S.whOptions(false),l.data.value.stores,'value.stores','multiple'))]),footer:B('取消','close')+B('确定','saveCategoryStores','','','primary')});
  S.actions.saveCategoryStores=()=>S.run('catalog.save',{type:'categories',value:S.top.data.value},()=>S.close());
  S.actions.batchUse=()=>{if(!S.page.selected.length)throw Error('请选择物料。');S.open('batchUse',{ids:[...S.page.selected],enabled:'true'},'批量领用',560);};
  S.drawers.batchUse=l=>({body:S.summary({'已选物料':l.data.ids.length})+S.form([F('领用',C('领用',[['true','启用'],['false','禁用']],l.data.enabled,'enabled'),true)]),footer:B('取消','close')+B('确定','saveBatchUse','','','primary')});
  S.actions.saveBatchUse=()=>S.run('products.batchUse',{ids:S.top.data.ids,enabled:S.top.data.enabled==='true'},()=>{S.close();S.page.selected=[];});
  S.actions.bulkQuery=key=>S.open('bulkQuery',{key,text:S.page.filters[key]||''},key==='code'?'批量物料编号':'批量物料名称',560);
  S.drawers.bulkQuery=l=>({body:'<textarea rows="8" aria-label="批量搜索" placeholder="多个用换行、逗号、分号、空格分隔" data-stock-bind="text">'+E(l.data.text)+'</textarea>',footer:B('取消','close')+B('确定','saveBulkQuery','','','primary')});
  S.actions.saveBulkQuery=()=>{S.page.filters[S.top.data.key]=S.top.data.text;S.close();S.render();};
})(StockPC);

;
/* Material master editing uses the inventory form/table/drawer adapters. */
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const originalCatalog=S.actions.catalog,originalClose=S.actions.close;
  S.actions.close=()=>{const refresh=['materialMasters','tags'].includes(S.top?.type);originalClose();if(refresh&&['material','materialSpec'].includes(S.top?.type))S.actions.drawRefresh();};
  S.actions.catalog=(id,extra)=>{
    if(extra!=='products')return originalCatalog(id,extra);
    const value=M.copy(S.data.products.find(x=>x.id===id)||{name:'',externalName:'',code:'',brand:'',category:'',materialType:'辅材',tags:[],origin:'公司',thumbnail:'',pictures:[],enabled:true,useEnabled:true,saleEnabled:false,deductionMode:'issue',specs:[]});
    S.open('material',{value,tab:'基本资料'},(id?'编辑':'新增')+'物料',1120);
  };
  const unitOptions=v=>Object.keys(M.unitTable(v)).map(x=>[x,x]);
  S.unitOptions=(pid,sid)=>unitOptions(M.spec(S.data,pid,sid));
  S.baseUnit=(pid,sid)=>M.spec(S.data,pid,sid)?.baseUnit||M.product(S.data,pid)?.unit;
  S.unitPreview=(pid,sid,unit,n)=>{try{const c=M.conversion(S.data,pid,sid,unit);return M.convert(n,c)+' '+c.baseUnit;}catch(e){return e.message;}};
  S.actions.materialTab=(id,tab)=>{S.top.data.tab=tab;S.actions.drawRefresh();};
  S.drawers.material=l=>{
    const v=l.data.value,tab=l.data.tab;
    let body=S.tabs(['基本资料','规格与单位','销售与消耗'],tab,'materialTab');
    if(tab==='基本资料')body+=S.form([
      F('物料编码',I('物料编码',v.code||'保存后自动生成','value.code','text','disabled')),
      F('物料名称',I('物料名称',v.name,'value.name'),true),F('对外名称',I('对外名称',v.externalName||'','value.externalName')),
      F('物料类型',C('物料类型',[['','请选择'],'药械品','仪器耗材','辅材','零售品'],v.materialType||'','value.materialType'),true),
      F('所属分类',C('所属分类',[['','请选择'],...S.categoryOptions().slice(1)],v.category,'value.category'),true),
      F('所属品牌',C('所属品牌',[['','请选择'],...S.data.brands.map(x=>[x.id,x.name+(x.enabled?'':'（停用）')])],v.brand||'','value.brand')+L('管理品牌','materialMasters','brands')),
      F('标签',C('标签',S.data.tags.map(x=>[x.id,x.name]),v.tags,'value.tags','multiple')+L('管理标签','tags')),
      F('物料归属',C('物料归属',['公司','外部'],v.origin,'value.origin')),
      F('状态',C('物料状态',[['true','启用'],['false','停用']],String(v.enabled),'value.enabled')),
      F('外观描述',I('外观描述',v.description||'','value.description')),
      F('缩略图',(v.thumbnail?'<div class="stock-photos"><img src="'+E(v.thumbnail)+'" alt="物料缩略图"></div>':'')+'<input type="file" accept="image/png,image/jpeg,image/webp" data-pc-upload="上传缩略图" aria-label="上传缩略图" data-stock-action="productImage" data-stock-id="thumbnail">'),
      F('物料图片','<div class="stock-photos">'+v.pictures.map((x,i)=>'<div><img src="'+E(x.src)+'" alt="'+E(x.name)+'">'+L('移除','imageRemove','pictures',String(i))+'</div>').join('')+'</div><input type="file" multiple accept="image/png,image/jpeg,image/webp" data-pc-upload="添加物料图片" aria-label="添加物料图片" data-stock-action="productImage" data-stock-id="pictures">')]);
    if(tab==='规格与单位')body+=S.section('SKU 规格',S.table([
      ['规格编码',x=>E(x.code||'保存后生成'),150],['规格名称',x=>E(x.name),160],['基本单位',x=>E(x.baseUnit)],
      ['采购 / 库存单位',x=>E(x.defaults.purchase+' / '+x.defaults.stock),160],['销售 / 消耗单位',x=>E(x.defaults.sale+' / '+x.defaults.consume),160],
      ['参考成本',x=>E(x.cost)+' 元 / '+E(x.baseUnit),150],['状态',x=>S.tag(x.enabled?'启用':'停用')],
      ['操作',(x,i)=>L('编辑','materialSpec',String(i))+L('移除','materialRemoveSpec',String(i)),120]],v.specs),B('新增规格','materialSpec')+B('管理供应商','materialMasters','suppliers'));
    if(tab==='销售与消耗'){
      const refs=(S.data.salesProducts?.basics||[]).filter(b=>b.materials.some(x=>x.pid===v.id));
      body+=S.form([F('允许零售',C('允许零售',[['false','否'],['true','是']],String(v.saleEnabled),'value.saleEnabled')),F('允许领用',C('允许领用',[['true','是'],['false','否']],String(v.useEnabled),'value.useEnabled')),F('库存扣减时点',C('库存扣减时点',[['issue','领用时扣库'],['consume','实际消耗时扣库']],v.deductionMode,'value.deductionMode',v.id&&S.data.ledger.some(x=>x.pid===v.id)?'disabled':''))]);
      body+=S.section('关联的销售产品与服务',S.table([['产品 / 服务',x=>E(x.name),220],['类型',x=>E(x.type)],['物料用量',x=>x.materials.filter(a=>a.pid===v.id).map(a=>E(M.spec(S.data,a.pid,a.sid)?.name)+'：'+E(a.qty)+' '+E(a.unit||'待确认单位')).join('<br>'),250]],refs));
      body+='<p>在产品模块的基础产品中配置销售组合或服务用料。组合按子物料扣库，不建立独立库存。按领用扣库的物料不再重复登记服务消耗。</p>';
    }
    return {body,footer:B('取消','close')+B('保存物料','saveMaterial','','','primary')};
  };
  S.actions.saveMaterial=()=>{const v=M.copy(S.top.data.value);['enabled','useEnabled','saleEnabled'].forEach(k=>v[k]=v[k]===true||v[k]==='true');return S.run('catalog.save',{type:'products',value:v},()=>S.close());};
  S.actions.materialRemoveSpec=id=>{const v=S.top.data.value,x=v.specs[Number(id)];if(v.id&&M.referenced(S.data,v.id,x.id))throw Error('规格已被引用，请在编辑规格中停用。');v.specs.splice(Number(id),1);S.actions.drawRefresh();};
  const roleLabels={purchase:'默认采购单位',stock:'默认库存单位',sale:'默认销售单位',consume:'默认消耗单位'};
  // Use selectable unit names throughout; retain uncommon names already used in this catalog.
  const unitNames=v=>[...new Set(['个','片','支','瓶','盒','包','袋','箱','件','套','台','卷','双','对','板','次','ml','L','g','kg','毫升','升','克','千克',...S.data.products.flatMap(p=>p.specs.flatMap(x=>[x.baseUnit,...(x.units||[]).map(u=>u.name)])),v.baseUnit,...v.units.map(x=>x.name),...Object.values(v.defaults)].filter(Boolean))];
  const fraction=x=>x===true||x==='true';
  const ruleOf=v=>!fraction(v.allowFraction)&&Number(v.step)===1?'integer':fraction(v.allowFraction)&&({0.1:'decimal1',0.01:'decimal2',0.001:'decimal3'})[Number(v.step)]||'custom';
  const ruleOptions=[['integer','只填整数（如 1、2）'],['decimal1','最多 1 位小数（如 0.1）'],['decimal2','最多 2 位小数（如 0.01）'],['decimal3','最多 3 位小数（如 0.001）'],['custom','自定义数量增量']];
  S.actions.materialSpec=id=>{
    const p=S.top.data.value,index=id===''?-1:Number(id),v=index>=0?p.specs[index]:{id:M.uid('SP'),code:'',name:'',baseUnit:'个',units:[],defaults:{purchase:'个',stock:'个',sale:'个',consume:'个'},step:1,allowFraction:false,enabled:true,price:0,cost:0,uses:1,offers:[]};
    S.open('materialSpec',{value:v,index,pid:p.id,locked:!!p.id&&M.referenced(S.data,p.id,v.id),tab:'单位与换算',baseWas:v.baseUnit,quantityRule:ruleOf(v),unitNames:v.units.map(x=>x.name),autoUnits:[]},index>=0?'编辑规格':'新增规格',860);
  };
  S.actions.specTab=(id,tab)=>{S.top.data.tab=tab;S.actions.drawRefresh();};
  function reconcileBase(d){
    const v=d.value;if(!d.baseWas||d.baseWas===v.baseUnit||d.locked)return;
    if(v.units.some(x=>x.name===v.baseUnit)){v.baseUnit=d.baseWas;throw Error('此单位已有换算关系，请先移除该关系再设为基本单位。');}
    Object.keys(v.defaults).forEach(k=>{if(v.defaults[k]===d.baseWas)v.defaults[k]=v.baseUnit;});
    v.units.forEach(u=>{if(u.parent===d.baseWas)u.parent=v.baseUnit;});
    v.offers.forEach(o=>{if(o.unit===d.baseWas)o.unit=v.baseUnit;});d.baseWas=v.baseUnit;
  }
  function ensureRoleUnits(d){
    const v=d.value,used=new Set(Object.values(v.defaults));
    // An unfilled row created for a former default can be discarded; completed relations are kept.
    v.units=v.units.filter(x=>!(d.autoUnits.includes(x.name)&&!used.has(x.name)&&x.ratio===''&&!v.units.some(y=>y!==x&&y.parent===x.name)&&!v.offers.some(o=>o.unit===x.name)));
    for(const name of used)if(name&&name!==v.baseUnit&&!v.units.some(x=>x.name===name)){v.units.push({name,parent:v.baseUnit,ratio:'',allowFraction:false});d.autoUnits.push(name);}
    d.unitNames=v.units.map(x=>x.name);
  }
  function targetOptions(v,row){
    const dependsOnRow=name=>{const seen=new Set();while(name&&name!==v.baseUnit){if(name===row.name)return true;if(seen.has(name))return true;seen.add(name);name=v.units.find(x=>x.name===name)?.parent;}return false;};
    return [v.baseUnit,...v.units.map(x=>x.name)].filter(name=>name&&name!==row.name&&!dependsOnRow(name));
  }
  function conversionText(v,row){
    if(!row.name)return '请选择换算单位';
    if(row.ratio===''||row.ratio===null||row.ratio===undefined)return '请填写换算数量';
    try{
      const chain=[],seen=new Set();let item=row;
      while(item){if(seen.has(item.name))throw Error('单位不能循环换算');if(item!==row&&(item.ratio===''||item.ratio===null||item.ratio===undefined))return '请先填写“'+item.name+'”的换算数量';seen.add(item.name);chain.push(item);if(item.parent===v.baseUnit)break;item=v.units.find(x=>x.name===item.parent);}
      const result=M.unitTable({...v,allowFraction:fraction(v.allowFraction),units:chain})[row.name];
      return '1 '+row.name+' = '+row.ratio+' '+row.parent+(row.parent===v.baseUnit?'':' = '+result.factor+' '+v.baseUnit);
    }catch(e){return e.message.replaceAll('下级单位','折算单位').replaceAll('最小单位','基本单位');}
  }
  function ruleText(d){
    const v=d.value,unit=v.baseUnit;
    if(d.quantityRule==='integer')return '基本单位数量只能填整数，例如 1 '+unit+'、2 '+unit+'。';
    const step=Number(v.step),fmt=n=>Math.round(n*1000)/1000;
    if(!Number.isFinite(step)||step<=0)return '请填写大于 0 的数量增量。';
    return d.quantityRule==='custom'?'填写数量须为 '+step+' '+unit+' 的整数倍，例如 '+step+'、'+fmt(step*2)+'、'+fmt(step*3)+' '+unit+'；此处不填写库存数量。':'基本单位数量可填到 '+step+' '+unit+'，例如 '+step+'、'+fmt(step*2)+' '+unit+'。';
  }
  S.drawers.materialSpec=l=>{
    reconcileBase(l.data);
    const d=l.data,v=d.value,locked=d.locked?'disabled':'',names=[v.baseUnit,...v.units.map(x=>x.name)].filter(Boolean),options=names.map(x=>[x,x]),dictionary=unitNames(v);
    const rowLocked=i=>d.locked&&i<(M.spec(S.data,d.pid,v.id)?.units.length||0);
    let body=S.form([F('规格名称',I('规格名称',v.name,'value.name'),true),F('规格状态',C('规格状态',[['true','启用'],['false','停用']],String(v.enabled),'value.enabled'))]);
    body+=S.tabs(['单位与换算','价格与供应商'],d.tab,'specTab');
    if(d.tab==='单位与换算'){
      const fields=[F('基本单位',C('基本单位',dictionary,v.baseUnit,'value.baseUnit',locked+' data-stock-action="materialBaseChange"'),true),...Object.entries(roleLabels).map(([k,label])=>F(label,C(label,dictionary,v.defaults[k],'value.defaults.'+k,'data-stock-action="materialDefaultUnit"'),true)),F('数量填写规则',C('数量填写规则',ruleOptions,d.quantityRule,'quantityRule',locked+' data-stock-action="materialQuantityRule"'))];
      if(d.quantityRule==='custom')fields.push(F('数量增量（'+v.baseUnit+'）',I('数量增量',v.step,'value.step','number',locked),true));
      body+=S.section('计量单位',S.form(fields)+'<p>库存统一按基本单位记账。例如基本单位选“片”，采购可选“箱”，库存与销售可选“盒”，消耗可选“片”。</p><p data-material-rule>'+E(ruleText(d))+'</p>');
      const columns=[
        ['换算单位',(x,i)=>C('换算单位 '+(i+1),[['','请选择'],...dictionary.filter(name=>name!==v.baseUnit&&!v.units.some((u,j)=>j!==i&&u.name===name)).map(name=>[name,'1 '+name])],x.name,'value.units.'+i+'.name',(rowLocked(i)?'disabled':'')+' data-stock-action="materialUnitName" data-stock-id="'+i+'"'),125],
        ['等于数量',(x,i)=>I('换算数量 '+(i+1),x.ratio,'value.units.'+i+'.ratio','number',rowLocked(i)?'disabled':''),110],
        ['折算单位',(x,i)=>C('折算单位 '+(i+1),targetOptions(v,x),x.parent,'value.units.'+i+'.parent',(rowLocked(i)?'disabled':'')+' data-stock-action="drawRefresh"'),125],
        ['换算结果',(x,i)=>'<span data-material-unit-preview="'+i+'">'+E(conversionText(v,x))+'</span>',190],
        ['可填小数',(x,i)=>C('该单位可填小数 '+(i+1),[['false','否'],['true','是']],String(x.allowFraction),'value.units.'+i+'.allowFraction',rowLocked(i)?'disabled':''),100],
        ['操作',(x,i)=>rowLocked(i)?'已引用':L('移除','materialUnitRemove',String(i)),80]
      ];
      body+=S.section('多单位换算',(v.units.length?'<p>按等式填写：1 箱 = 12 盒，1 盒 = 5 片，系统自动算出 1 箱 = 60 片。</p>'+S.table(columns,v.units):'<p>当前各业务均使用基本单位，无需额外换算。选择不同的默认单位后，会在这里自动增加待填写的换算关系。</p>'),B('新增换算','materialUnitAdd'));
      if(d.locked)body+='<p>该规格已有引用，基本单位、数量规则及已有换算关系已锁定；可增加新单位，或调整默认业务单位。</p>';
      if(v.uses>1)body+='<p>历史使用次数：'+E(v.uses)+'。此值仅保留历史含义，不参与单位换算。</p>';
    }else{
      body+=S.form([F('参考成本（元 / '+v.baseUnit+'）',I('基本单位参考成本',v.cost,'value.cost','number')),F('建议售价（元 / '+v.defaults.sale+'）',I('建议售价',v.price,'value.price','number'))]);
      body+=S.section('供应商报价',S.table([['供应商',(x,i)=>C('供应商 '+(i+1),[['','请选择'],...S.data.suppliers.map(s=>[s.id,s.name+(s.enabled?'':'（停用）')])],x.supplier,'value.offers.'+i+'.supplier'),210],['报价单位',(x,i)=>C('报价单位 '+(i+1),options,x.unit,'value.offers.'+i+'.unit'),130],['参考单价（元）',(x,i)=>I('参考采购单价 '+(i+1),x.price,'value.offers.'+i+'.price','number'),150],['操作',(x,i)=>L('移除','materialOfferRemove',String(i)),90]],v.offers),B('添加报价','materialOfferAdd')+B('管理供应商','materialMasters','suppliers'));
    }
    return {body,footer:B('取消','close')+B('确定规格','saveMaterialSpec','','','primary')};
  };
  S.actions.materialBaseChange=()=>{const d=S.top.data;try{reconcileBase(d);ensureRoleUnits(d);}finally{S.actions.drawRefresh();}};
  S.actions.materialDefaultUnit=()=>{ensureRoleUnits(S.top.data);S.actions.drawRefresh();};
  S.actions.materialQuantityRule=()=>{
    const d=S.top.data,v=d.value,step={integer:1,decimal1:0.1,decimal2:0.01,decimal3:0.001}[d.quantityRule];
    v.allowFraction=d.quantityRule!=='integer';if(step!==undefined)v.step=step;S.actions.drawRefresh();
  };
  S.actions.materialUnitAdd=()=>{const d=S.top.data;d.value.units.push({name:'',ratio:'',parent:d.value.baseUnit,allowFraction:false});d.unitNames.push('');S.actions.drawRefresh();};
  S.actions.materialUnitName=id=>{
    const d=S.top.data,v=d.value,i=Number(id),row=v.units[i],before=d.unitNames[i];
    if(row.name===v.baseUnit||v.units.some((u,j)=>i!==j&&u.name===row.name)){row.name=before;S.actions.drawRefresh();throw Error('该单位已存在，请选择其他单位。');}
    if(before&&before!==row.name){
      if(!row.name){row.name=before;S.actions.drawRefresh();throw Error('请选择换算单位；不需要的关系可使用“移除”。');}
      Object.keys(v.defaults).forEach(k=>{if(v.defaults[k]===before)v.defaults[k]=row.name;});
      v.units.forEach(x=>{if(x!==row&&x.parent===before)x.parent=row.name;});v.offers.forEach(x=>{if(x.unit===before)x.unit=row.name;});
      d.autoUnits=d.autoUnits.map(name=>name===before?row.name:name);
    }
    d.unitNames[i]=row.name;S.actions.drawRefresh();
  };
  S.actions.materialUnitRemove=id=>{
    const d=S.top.data,v=d.value,i=Number(id),row=v.units[i];
    if(row.name){const roles=Object.entries(roleLabels).filter(([k])=>v.defaults[k]===row.name).map(([,label])=>label);if(roles.length)throw Error('“'+row.name+'”用于'+roles.join('、')+'，请先在上方更换默认单位。');if(v.units.some((x,j)=>j!==i&&x.parent===row.name)||v.offers.some(x=>x.unit===row.name))throw Error('其他换算关系或供应商报价正在使用“'+row.name+'”，请先调整。');}
    v.units.splice(i,1);d.unitNames.splice(i,1);S.actions.drawRefresh();
  };
  document.addEventListener('input',event=>{
    if(S.top?.type!=='materialSpec'||!event.target.closest('.stock-module'))return;
    const binding=event.target.dataset?.stockBind,d=S.top.data,root=document.querySelector('#stock-layer-'+(S.state.layers.length-1));
    if(/^value\.units\.\d+\.ratio$/.test(binding||''))root?.querySelectorAll('[data-material-unit-preview]').forEach(node=>{const row=d.value.units[Number(node.dataset.materialUnitPreview)];if(row)node.textContent=conversionText(d.value,row);});
    if(binding==='value.step'){const hint=root?.querySelector('[data-material-rule]');if(hint)hint.textContent=ruleText(d);}
  });
  S.actions.materialOfferAdd=()=>{const v=S.top.data.value;v.offers.push({supplier:'',unit:v.defaults.purchase,price:0});S.actions.drawRefresh();};
  S.actions.materialOfferRemove=id=>{S.top.data.value.offers.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.saveMaterialSpec=()=>{
    const d=S.top.data;reconcileBase(d);const v=M.copy(d.value);
    if(!v.name.trim())throw Error('请填写规格名称。');
    ['enabled','allowFraction'].forEach(k=>v[k]=fraction(v[k]));v.units.forEach(x=>x.allowFraction=fraction(x.allowFraction));
    if(!Number.isFinite(Number(v.step))||Number(v.step)<0.001||Math.abs(Number(v.step)*1000-Math.round(Number(v.step)*1000))>1e-6)throw Error('数量增量须大于或等于 0.001，最多保留三位小数。');
    for(const row of v.units){if(!row.name)throw Error('请选择换算单位。');if(!Number.isFinite(Number(row.ratio))||Number(row.ratio)<=0)throw Error('请填写“1 '+row.name+' = 多少 '+row.parent+'”的换算数量。');}
    let units;try{units=M.unitTable(v);}catch(e){throw Error(e.message.replaceAll('下级单位','折算单位').replaceAll('最小单位','基本单位'));}
    Object.keys(v.defaults).forEach(k=>{if(!units[v.defaults[k]])throw Error(roleLabels[k]+'尚未配置换算关系。');});
    const parent=S.state.layers.at(-2).data.value;d.index<0?parent.specs.push(v):parent.specs.splice(d.index,1,v);S.close();S.actions.drawRefresh();
  };
  S.actions.materialMasters=type=>S.open('materialMasters',{type},type==='brands'?'品牌管理':'供应商管理',860);
  S.drawers.materialMasters=l=>({body:S.table([['名称',x=>E(x.name),200],['联系人',x=>E(x.contact||'—')],['电话',x=>E(x.phone||'—')],['状态',x=>S.tag(x.enabled?'启用':'停用')],['操作',x=>L('编辑','materialMaster',x.id),90]],S.data[l.data.type]),footer:B('关闭','close')+B('新增','materialMaster','','','primary')});
  S.actions.materialMaster=id=>S.open('materialMaster',{type:S.top.data.type,value:S.data[S.top.data.type].find(x=>x.id===id)||{name:'',contact:'',phone:'',enabled:true}},'维护资料',560);
  S.drawers.materialMaster=l=>({body:S.form([F('名称',I('名称',l.data.value.name,'value.name'),true),...(l.data.type==='suppliers'?[F('联系人',I('联系人',l.data.value.contact||'','value.contact')),F('电话',I('联系电话',l.data.value.phone||'','value.phone'))]:[]),F('状态',C('资料状态',[['true','启用'],['false','停用']],String(l.data.value.enabled),'value.enabled'))]),footer:B('取消','close')+B('保存','saveMaterialMaster','','','primary')});
  S.actions.saveMaterialMaster=()=>S.run('catalog.save',S.top.data,()=>{S.close();S.actions.drawRefresh();});
})(StockPC);

;
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,F=S.field,I=S.input,C=S.select;
  S.actions.taskEdit=id=>{
    const t=S.data.tasks.find(x=>x.id===id)||{name:'',warehouses:[],products:[],mode:'all'};
    S.open('taskForm',{...t,storeQuery:'',productQuery:'',category:''},id?'编辑盘点任务':'发起盘点任务',860);
  };
  S.actions.taskCopy=id=>{const t=M.copy(S.data.tasks.find(x=>x.id===id));delete t.id;t.name+='（复制）';t.storeQuery='';t.productQuery='';t.category='';S.open('taskForm',t,'复制盘点任务',860);};
  S.drawers.taskForm=l=>{
    const d=l.data,warehouses=S.data.warehouses.filter(x=>x.enabled&&S.matches(x.name,d.storeQuery)),products=S.data.products.filter(x=>x.enabled&&S.matches(x.name,d.productQuery)&&(!d.category||x.category===d.category));
    return {body:S.form([F('任务名称',I('任务名称',d.name,'name'),true)])+'<div class="stock-pickers"><section>'+S.section('门店',I('搜索门店',d.storeQuery,'storeQuery')+B('查询','drawRefresh')+B('全选','taskSelectAll','warehouses')+B('清空','taskClear','warehouses')+'<p>已选 '+d.warehouses.length+' 家</p><div class="stock-choice-list">'+warehouses.map(w=>S.check(w.name,d.warehouses.includes(w.id),'taskPick',w.id,'warehouses')).join('')+'</div>')+'</section><section>'+S.section('物料',C('物料分类',S.categoryOptions(),d.category,'category')+I('搜索物料',d.productQuery,'productQuery')+B('查询','drawRefresh')+B('全选','taskSelectAll','products')+B('清空','taskClear','products')+'<p>已选 '+d.products.length+' 项</p><div class="stock-choice-list">'+products.map(p=>S.check(p.name,d.products.includes(p.id),'taskPick',p.id,'products')).join('')+'</div>')+'</section></div>'+S.form([F('盘点方式',C('盘点方式',[['all','全部盘点'],['stock','按门店库存盘点']],d.mode,'mode'))]),footer:B('取消','close')+B('确定','taskSave','','','primary')};
  };
  S.actions.taskPick=(id,type,target)=>{const set=new Set(S.top.data[type]);target.checked?set.add(id):set.delete(id);S.top.data[type]=[...set];};
  S.actions.taskSelectAll=type=>{const d=S.top.data,rows=type==='warehouses'?S.data.warehouses.filter(x=>x.enabled&&S.matches(x.name,d.storeQuery)):S.data.products.filter(x=>x.enabled&&S.matches(x.name,d.productQuery)&&(!d.category||x.category===d.category));d[type]=[...new Set([...d[type],...rows.map(x=>x.id)])];S.actions.drawRefresh();};
  S.actions.taskClear=type=>{S.top.data[type]=[];S.actions.drawRefresh();};
  S.actions.taskSave=()=>S.run('task.save',S.top.data,()=>S.close());
  S.actions.taskAction=(id,action)=>S.confirm(action==='send'?'确认发送':'作废任务',action==='send'?'确认向所选门店下发盘点任务？':'确认作废任务？未完成的门店任务将停止，已有盘点及损益记录保留。',()=>S.run('task.action',{id,action}));
  S.actions.taskStores=id=>S.open('taskStores',{id,query:'',status:''},S.data.tasks.find(x=>x.id===id).name,1120);
  S.drawers.taskStores=l=>{
    const t=S.data.tasks.find(x=>x.id===l.data.id),rows=t.stores.filter(x=>S.matches(S.wh(x.wid),l.data.query)&&(!l.data.status||x.status===l.data.status));
    return {body:S.layerSearch([I('门店名称',l.data.query,'query'),C('任务状态',[['','全部'],'进行中','已完成','已取消'],l.data.status,'status')])+S.table([['序号',(x,i)=>i+1],['门店',x=>E(S.wh(x.wid)),180],['任务盘点进度',x=>x.rows.filter(r=>r.counted!==null).length+'/'+x.rows.length],['任务处理进度',x=>x.rows.filter(r=>r.processed).length+'/'+x.rows.length],['任务状态',x=>S.tag(x.status)],['操作人',x=>E(x.rows.find(r=>r.counter)?.counter||'—')],['操作',x=>L('详情','countDetail',t.id,x.wid)+(x.status==='进行中'?L('取消','storeTaskAction',t.id,x.wid+'|cancelStore'):'')+(t.status!=='已作废'?L('重新盘点','storeTaskAction',t.id,x.wid+'|recount'):''),260]],rows)};
  };
  S.actions.storeTaskAction=(id,extra)=>{
    const [wid,action]=extra.split('|');S.confirm(action==='recount'?'重新盘点':'取消门店任务',action==='recount'?'保留此前盘点记录，并重新下发该门店的盘点任务？':'确认取消该门店的未完成任务？',()=>S.run('task.action',{id,wid,action},()=>{if(S.top){S.top.revision=S.data.revision;S.actions.drawRefresh();}}));
  };
  S.actions.countDetail=(id,wid='')=>{
    const t=S.data.tasks.find(x=>x.id===id),values={};
    t.stores.forEach(st=>st.rows.forEach(r=>values[st.wid+'|'+r.key]={confirmed:r.confirmed??r.counted??0,note:r.note||''}));
    S.open('countDetail',{id,wid,status:'',values},'盘点详情',1120);
  };
  S.drawers.countDetail=l=>{
    const d=l.data,t=S.data.tasks.find(x=>x.id===d.id),rows=t.stores.filter(st=>!d.wid||st.wid===d.wid).flatMap(st=>st.rows.map(r=>({st,r}))).filter(x=>!d.status||(d.status==='未盘点'?x.r.counted===null:d.status==='待处理'?x.r.counted!==null&&!x.r.processed:x.r.processed));
    const editable=x=>x.r.counted!==null&&!x.r.processed&&t.status!=='已作废'&&x.st.status!=='已取消';
    const movement=(x,positive)=>S.data.ledger.filter(e=>e.wid===x.st.wid&&e.pid===x.r.pid&&e.sid===x.r.sid&&e.at>=x.r.baselineAt&&(positive?e.delta>0:e.delta<0)).reduce((n,e)=>n+Math.abs(e.delta),0);
    return {body:S.layerSearch([C('门店',[['','全部'],...t.stores.map(x=>[x.wid,S.wh(x.wid)])],d.wid,'wid'),C('盘点状态',[['','全部'],'未盘点','待处理','已处理'],d.status,'status')])+S.table([['门店',x=>E(S.wh(x.st.wid)),150],['物料名称',x=>E(M.product(S.data,x.r.pid)?.name),160],['规格型号',x=>E(M.spec(S.data,x.r.pid,x.r.sid)?.name)],['单位',x=>E(S.baseUnit(x.r.pid,x.r.sid))],['本仓数量',x=>x.r.baseline],['实盘录入',x=>x.r.countInput?E(x.r.countInput.quantity)+' '+E(x.r.countInput.unit):'—',140],['盘点数量',x=>x.r.counted??'—'],['当前库存',x=>M.balance(S.data,x.st.wid,x.r.pid,x.r.sid)],['差异数',x=>x.r.counted===null?'—':x.r.counted-x.r.countedBalance],['上次盘点数',x=>x.st.history?.at(-1)?.rows.find(r=>r.key===x.r.key)?.counted??'—'],['期间入库数',x=>movement(x,true)],['期间出库数',x=>movement(x,false)],['盘点时间',x=>E(x.r.countedAt||'—'),170],['状态',x=>S.tag(x.r.processed?'已处理':x.r.counted===null?'未盘点':'待处理')],['损益定责',x=>editable(x)?I('损益定责',d.values[x.st.wid+'|'+x.r.key].note,'values.'+x.st.wid+'|'+x.r.key+'.note'):E(x.r.note||'—'),180],['确认库存',x=>editable(x)?I('确认库存',d.values[x.st.wid+'|'+x.r.key].confirmed,'values.'+x.st.wid+'|'+x.r.key+'.confirmed','number'):x.r.confirmed??'—',150]],rows),footer:B('关闭','close')+B('上报损益','processCount','','','primary',!rows.some(editable))};
  };
  S.actions.processCount=()=>{
    const l=S.top,d=l.data,t=S.data.tasks.find(x=>x.id===d.id),operations=[];
    t.stores.filter(st=>(!d.wid||st.wid===d.wid)&&st.status!=='已取消').forEach(st=>{
      const rows=Object.fromEntries(st.rows.filter(r=>r.counted!==null&&!r.processed&&(!d.status||d.status==='待处理')).map(r=>[r.key,d.values[st.wid+'|'+r.key]]));
      if(Object.keys(rows).length)operations.push({command:'task.action',payload:{id:t.id,wid:st.wid,action:'process',rows}});
    });
    if(!operations.length)throw Error('没有可上报的盘点记录。');
    S.confirm('上报损益','确认按填写的库存数量上报损益？盘点后的出入库流水将继续保留。',()=>S.run('batch',{operations},()=>{l.revision=S.data.revision;S.actions.drawRefresh();},l.revision));
  };
})(StockPC);

;
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,F=S.field,C=S.select;
  const headers={
    inbound:['门店仓库','产品编号','规格型号','入库数量','业务单位','采购单价','供应商'],
    replenish:['门店仓库','产品编号','规格型号','申请数量','业务单位'],
    shipping:['补货单号','产品编号','规格型号','发货仓库','实发数量','物流单号','业务单位'],
    products:['产品编号','产品名称','分类名称','计量单位','规格型号','销售原价','成本价','使用次数','产品归属','领用','启用状态','包装换算','默认采购单位','默认库存单位','默认销售单位','默认消耗单位','最小单位步长','允许小数']
  };
  S.actions.import=type=>S.open('import',{type,rows:[],operations:[],errors:[],filename:'',inboundType:'采购入库'},'导入'+({inbound:'入库单',replenish:'门店补货单',shipping:'发货单',products:'产品'})[type],1120);
  S.drawers.import=l=>{
    const d=l.data;
    return {body:(d.type==='inbound'?S.form([F('入库类型',C('入库类型',['调拨入库','退货入库','采购入库','归还入库','盘盈入库'],d.inboundType,'inboundType'),true)]):'')+'<div class="stock-inline">'+B('下载模板','template')+'<input type="file" accept=".xlsx,.csv" aria-label="选择导入文件" data-stock-action="importFile"></div>'+(d.filename?'<p>'+E(d.filename)+' · 共 '+d.rows.length+' 行</p>':'')+(d.errors.length?'<div class="stock-error" role="alert">'+d.errors.map(E).join('<br>')+'</div>':'')+(d.rows.length?S.table([['行号',x=>x.line,70],...headers[d.type].map(h=>[h,x=>E(x[h]),130])],d.rows):'<p>支持 xlsx 与 UTF-8 CSV。先校验全部数据，确认后保存；相同仓库的入库或补货行合并成一张单据。业务单位为空时按最小单位；包装换算示例：箱=12盒;盒=5片。</p>'),footer:B('取消','close')+B('重新校验','validateImport')+B('确认导入','confirmImport','','','primary',!d.rows.length||d.errors.length>0)};
  };
  S.actions.template=()=>StockExchange.download('库存'+S.top.data.type+'导入模板',headers[S.top.data.type].map(h=>h.replace('产品','物料')),[]);
  S.actions.importFile=async(id,extra,input)=>{
    const l=S.top,file=input.files[0];if(!file)return;
    const rows=await StockExchange.read(file);if(!S.state.layers.includes(l))return;
    l.data.rows=rows;l.data.filename=file.name;S.validateImport(l);S.actions.drawRefresh();
  };
  S.validateImport=l=>{
    const d=l.data,errors=[],ops=[],groups=new Map(),staged=M.copy(S.data);
    const wh=(name,row)=>{const w=staged.warehouses.find(x=>x.name===name&&x.enabled);if(!w)throw Error('第 '+row+' 行：仓库“'+name+'”不存在或未启用。');return w.id;};
    const item=r=>{const p=staged.products.find(x=>x.code===r['产品编号']);if(!p)throw Error('第 '+r.line+' 行：产品编号不存在。');const sp=p.specs.find(x=>x.name===r['规格型号']);if(!sp)throw Error('第 '+r.line+' 行：规格型号不存在。');return {pid:p.id,sid:sp.id,key:M.key(p.id,sp.id)};};
    for(const r of d.rows)try{
      for(const [modern,old] of [['物料编号','产品编号'],['物料名称','产品名称'],['物料归属','产品归属']])if(r[modern]&&!r[old])r[old]=r[modern];
      for(const h of headers[d.type].slice(0,d.type==='products'?5:d.type==='shipping'?5:4))if(!r[h])throw Error('第 '+r.line+' 行：请填写'+h+'。');
      if(d.type==='products'){
        let p=groups.get(r['产品编号']);
        if(!p){if(staged.products.some(x=>x.code===r['产品编号']))throw Error('第 '+r.line+' 行：产品编号已存在，请使用编辑修改。');const cat=staged.categories.find(x=>x.name===r['分类名称']);if(!cat)throw Error('第 '+r.line+' 行：分类名称不存在。');p={code:r['产品编号'],name:r['产品名称'],category:cat.id,unit:r['计量单位'],specs:[],tags:[],pictures:[],thumbnail:'',shelfLife:r['保质期'],origin:r['产品归属']||'公司',useEnabled:r['领用']!=='禁用',enabled:r['启用状态']==='启用'};groups.set(p.code,p);}
        const units=(r['包装换算']||'').split(/[;；]/).filter(Boolean).map(t=>{const m=t.trim().match(/^(.+?)\s*=\s*([0-9.]+)\s*(.+)$/);if(!m)throw Error('包装换算请按 箱=12盒;盒=5片 填写。');return {name:m[1].trim(),ratio:Number(m[2]),parent:m[3].trim(),allowFraction:false};});
        p.specs.push({baseUnit:p.unit,units,defaults:{purchase:r['默认采购单位']||p.unit,stock:r['默认库存单位']||p.unit,sale:r['默认销售单位']||p.unit,consume:r['默认消耗单位']||p.unit},step:Number(r['最小单位步长']||0.001),allowFraction:r['允许小数']!=='否',name:r['规格型号'],price:M.quantity(r['销售原价']||0,'销售原价'),cost:M.quantity(r['成本价']||0,'成本价'),uses:M.quantity(r['使用次数']||1,'使用次数',false)});
      }else if(d.type==='shipping'){
        const doc=staged.documents.find(x=>x.no===r['补货单号']&&x.kind==='replenish');if(!doc)throw Error('第 '+r.line+' 行：补货单号不存在。');
        const x=item(r),wid=wh(r['发货仓库'],r.line);const line=doc.lines.find(l=>l.key===x.key);if(r['业务单位']&&line&&r['业务单位']!==line.unit)throw Error('第 '+r.line+' 行：发货单位须与原单一致（'+line.unit+'）。');if(!doc.lines.some(l=>l.key===x.key))throw Error('第 '+r.line+' 行：该物品不属于此补货单。');
        if(!groups.has(doc.id))groups.set(doc.id,doc.shipments.filter(s=>s.status==='待发货'));
        groups.get(doc.id).push({id:M.uid('SH'),lineKey:x.key,wid,qty:M.quantity(r['实发数量'],'实发数量',false),tracking:r['物流单号']||'',status:'待发货'});
      }else{
        const wid=wh(r['门店仓库'],r.line),x=item(r),qty=M.quantity(r[d.type==='inbound'?'入库数量':'申请数量'],'申请数量',false);
        const unit=r['业务单位']||M.spec(staged,x.pid,x.sid).baseUnit,unitPrice=r['采购单价']===''||r['采购单价']===undefined?undefined:Number(r['采购单价']),supplier=r['供应商']?staged.suppliers.find(v=>v.name===r['供应商']&&v.enabled)?.id:'';if(r['供应商']&&!supplier)throw Error('供应商不存在或停用。');
        if(!groups.has(wid))groups.set(wid,[]);const lines=groups.get(wid),old=lines.find(l=>l.key===x.key);if(old){if(old.unit!==unit||old.unitPrice!==unitPrice||old.supplier!==supplier)throw Error('同一仓库同一规格的单位、单价和供应商须一致。');old.qty+=qty;}else lines.push({...x,qty,unit,unitPrice,supplier});
      }
    }catch(e){errors.push(e.message);}
    for(const [id,value] of groups){
      const op=d.type==='products'?{command:'catalog.save',payload:{type:'products',value}}:d.type==='shipping'?{command:'document.action',payload:{id,action:'saveShipments',shipments:value}}:{command:'document.save',payload:{kind:d.type==='inbound'?'inbound':'replenish',wid:id,type:d.inboundType,lines:value,submit:true}};
      try{M.apply(staged,op.command,op.payload);ops.push(op);}catch(e){errors.push(e.message);}
    }
    d.errors=errors;d.operations=ops;
  };
  S.actions.validateImport=()=>{S.validateImport(S.top);S.actions.drawRefresh();};
  S.actions.confirmImport=()=>{
    const l=S.top;S.validateImport(l);if(l.data.errors.length){S.actions.drawRefresh();return;}
    if(!l.data.operations.length)throw Error('没有可导入的数据。');
    return S.run('batch',{operations:l.data.operations},()=>S.close(),l.revision);
  };
})(StockPC);

;
window.PCModules['stock-management']=(()=>{
  const S=StockPC;
  const ready=Promise.resolve().then(()=>S.db.initialize()).catch(error=>{S.state.error=error;});
  return {
    ready,
    render(){S.state.active=true;S.state.route=location.hash.slice(1).split('?')[0];S.render();},
    redraw(){S.render();},
    go(path,id){location.hash=path+(id?'?id='+encodeURIComponent(id):'');},
    leave(){S.state.active=false;while(S.state.layers.length)S.close();}
  };
})();
