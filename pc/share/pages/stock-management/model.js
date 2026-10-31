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
