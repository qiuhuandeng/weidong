/* One versioned ledger per origin. Compare and replace inside one IndexedDB transaction. */
window.PCInventoryStorage = (() => {
  const KEY='weid-pc-supply-chain-v1', DB='weid-pc-inventory-v1', STORE='state';
  let database, mode='indexedDB', readFailed=false;
  const conflict=()=>Error('其他窗口已更新进销存数据。本次操作未保存，请刷新载入最新账后重试。');
  function openDatabase(){
    if(database)return database;
    database=new Promise((resolve,reject)=>{
      if(!window.indexedDB)return reject(Error('浏览器未提供 IndexedDB'));
      let req,done=false;const timer=setTimeout(()=>finish(Error('数据库打开超时')),5000);
      function finish(error,db){if(done){db?.close();return}done=true;clearTimeout(timer);error?reject(error):resolve(db)}
      try{req=indexedDB.open(DB,1)}catch(e){finish(e);return}
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE)};
      req.onerror=()=>finish(req.error);req.onblocked=()=>finish(Error('数据库被其他窗口占用'));
      req.onsuccess=()=>{const db=req.result;db.onversionchange=()=>{db.close();database=null};finish(null,db)};
    }).catch(e=>{database=null;throw e});return database;
  }
  function legacy(){try{return JSON.parse(localStorage.getItem(KEY))}catch{return null}}
  async function read(){try{const db=await openDatabase();return await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readonly'),r=tx.objectStore(STORE).get(KEY);let value;r.onsuccess=()=>value=r.result;tx.oncomplete=()=>resolve(value?.version===1?value:null);tx.onerror=()=>reject(tx.error)})}catch{readFailed=true;return null}}
  async function write(data,expected=0){
    let db;try{db=await openDatabase()}catch(e){
      if(!window.navigator?.locks)throw Error('进销存数据未能保存。请恢复浏览器数据库后重试；本次操作未记账。');
      return navigator.locks.request(KEY,()=>{const old=legacy();if((old?.revision||0)!==expected)throw conflict();try{localStorage.setItem(KEY,JSON.stringify(data));mode='localStorage'}catch{throw Error('进销存数据未能保存，原数据未覆盖。请重试。')}});
    }
    return new Promise((resolve,reject)=>{
      const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE),r=store.get(KEY);let failure;
      r.onsuccess=()=>{const old=r.result||legacy();if((old?.revision||0)!==expected){failure=conflict();tx.abort();return}store.put(data,KEY)};
      tx.oncomplete=()=>{mode='indexedDB';readFailed=false;resolve()};
      tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('进销存数据未能保存，原数据未覆盖。'));
    });
  }
  return {read,write,get mode(){return mode}};
})();

;
/* Supply-chain domain. All writes are atomic, local to this PC prototype. */
window.PCModules['supply-chain'] = (() => {
  const S = {}, KEY = 'weid-pc-supply-chain-v1';
  const copy = value => JSON.parse(JSON.stringify(value));
  const today = () => new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const day = (n=0) => new Date(Date.parse(today()+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
  const stamp = () => new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',dateStyle:'short',timeStyle:'medium'}).format(new Date());
  const uid = prefix => prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+Math.random().toString(36).slice(2,6).toUpperCase();
  const round = n => Math.round((Number(n)+Number.EPSILON)*10000)/10000;
  const must = (ok,message) => {if(!ok)throw Error(message)};
  const positive = (n,label='数量') => must(Number.isFinite(Number(n))&&Number(n)>0,label+'须大于 0');
  function seed() {
    const d={version:1,history:[],movements:[],merges:[],applications:[],purchases:[],purchaseReturns:[],payments:[],transfers:[],counts:[],losses:[],consumptions:[],retail:[],redemptions:[],partnerOrders:[],adverse:[],recalls:[],qualityChecks:[],temperatures:[],controlledLogs:[],emptyVials:[],invoices:[],maintenance:[],firstReviews:[],settlements:[],approvals:[],reportPlans:[],alertActions:[],udi:[],adjustments:[]};
    d.stores=[['WH','厦门总仓','总部','华南','仓库'],['XM','厦门思明店','百星','华南','A'],['FZ','福州鼓楼店','百星','华南','A'],['SH','上海静安店','贝颜','华东','B']].map(([id,name,brand,region,grade])=>({id,name,brand,region,grade,status:'启用'}));
    d.serviceCategories=['皮肤','M10','S10A','K10','F10','BX10','R10','Y10','半永久女'].map((name,i)=>({id:'SC'+i,name,status:'启用'}));
    d.lines=['百星','贝颜','百星外协','渠道外协'].map((name,i)=>({id:'LINE'+i,name,status:'启用'}));
    d.categories=['针剂药品','项目耗材','辅材','仪器配件','居家正装','居家小样','非卖品'].map((name,i)=>({id:'CAT'+i,name,parent:'',status:'启用'}));
    d.brands=['海薇','艾莉薇','乔雅登','嗨体','润致','DEP','超皮','OF','Dr.Meelan'].map((name,i)=>({id:'BR'+i,name,status:'启用'}));
    d.dictionaries=[...['箱','件','盒','支','瓶','ml','次','片','个','g','发','线'].map(name=>({id:uid('UNIT'),kind:'单位',name,status:'启用'})),...['破损','超温','过期','开瓶余量过期','治疗中断','培训','赠送','福利'].map(name=>({id:uid('REASON'),kind:'损耗原因',name,status:'启用'})),...['主营业务成本','管理费用','市场费用','存货损失'].map(name=>({id:uid('SUBJECT'),kind:'财务科目',name,status:'启用'})),...['面部','颈部','眼周'].map(name=>({id:uid('PART'),kind:'治疗部位',name,status:'启用'})),...['补水','色素管理','抗衰'].map(name=>({id:uid('ATTR'),kind:'功能属性',name,status:'启用'}))];
    d.services=[['SV01','M10 针剂','M10 玻尿酸管理','M10','百星'],['SV02','DEP 超导水光','DEP 超导水光单次','皮肤','贝颜'],['SV03','S10 色素管理','S10 色素管理','S10A','百星'],['SV04','超皮秒净肤','S10A 超皮秒净肤','S10A','百星'],['SV05','Y10 外协体验','Y10 外协体验项目','Y10','渠道外协'],['SV06','富贵包（Y 专用，勿录）','富贵包内部结算','Y10','百星外协']].map(([id,name,internalName,category,line],i)=>({id,name,internalName,financeCode:'FW'+String(i+1).padStart(4,'0'),category,line,scope:'全部门店',visibility:i===5?'仅后台':'公开',status:i===3?'已下架':'已上架',gift:i!==5,card:i!==5,note:''}));
    d.specs=[['SP01','SV01','海薇 1ml',1980],['SP02','SV01','艾莉薇 1ml',2980],['SP03','SV02','单次 2ml',680],['SP04','SV03','面部单次 / 500 发',1280],['SP05','SV04','净肤单次 / 500 发',1280],['SP06','SV05','外协体验单次',99]].map(([id,service,name,price])=>({id,service,name,price,status:'启用'}));
    d.skus=[['SKU01','海薇玻尿酸 1ml','海薇','针剂药品','ml',360,'械字号',false,true],['SKU02','艾莉薇玻尿酸 1ml','艾莉薇','针剂药品','ml',620,'械字号',false,true],['SKU03','DEP 水光原液 2ml','DEP','项目耗材','支',120,'妆字号',false,false],['SKU04','一次性针头','DEP','辅材','个',8,'械字号',false,false],['SKU05','嗨体 2.5ml','嗨体','针剂药品','ml',180,'械字号',true,true],['SKU06','肉毒素 100 单位','润致','针剂药品','支',480,'药品',true,true],['SKU07','OF 修护面膜','OF','居家正装','片',18,'妆字号',false,false],['SKU08','Dr.Meelan 修护霜 50g','Dr.Meelan','居家正装','盒',88,'妆字号',false,false],['SKU09','OF 修护面膜小样','OF','居家小样','片',6,'妆字号',false,false],['SKU10','超皮秒治疗头','超皮','仪器配件','个',3000,'普通商品',false,false]].map(([id,name,brand,category,unit,cost,regulation,cold,doctor],i)=>({id,name,brand,category,unit,cost,regulation,cold,doctor,controlled:i===5,udiRequired:i<2,registration:'REG-'+String(i+1).padStart(5,'0'),low:10,high:300,openHours:i===4?24:0,lockDays:0,gift:i>=6,status:'启用',device:i===9?'EQ01':'',temperatureMin:2,temperatureMax:8}));
    d.units=[{id:'U01',sku:'SKU01',name:'支',factor:1},{id:'U02',sku:'SKU01',name:'盒',factor:1},{id:'U03',sku:'SKU01',name:'箱',factor:10},{id:'U04',sku:'SKU05',name:'支',factor:2.5},{id:'U05',sku:'SKU05',name:'盒',factor:2.5},{id:'U06',sku:'SKU05',name:'箱',factor:25},{id:'U07',sku:'SKU07',name:'盒',factor:5}];
    d.equipment=[{id:'EQ01',name:'超皮秒',asset:'ZC-2026-001',store:'XM',maker:'超皮设备厂商',warranty:day(365),shots:86000,totalShots:100000,unit:'发',low:10000,status:'使用中'},{id:'EQ02',name:'超声炮',asset:'ZC-2026-002',store:'SH',maker:'光电设备厂商',warranty:day(90),shots:1800,totalShots:20000,unit:'线',low:2000,status:'使用中'}];
    d.heads=[{id:'HD01',name:'超皮秒面部治疗头',equipment:'EQ01',life:500,used:463,status:'使用中'}];
    d.shotLogs=[{id:'SHOT01',equipment:'EQ01',quantity:100000,amount:30000,time:day(-30),kind:'采购充值',status:'已入账'}];
    d.boms=[{id:'BOM01',name:'海薇注射标准配方',spec:'SP01',version:1,effective:day(-30),status:'已发布',lines:[{type:'sku',item:'SKU01',quantity:1,alternatives:['SKU02']},{type:'sku',item:'SKU04',quantity:1,alternatives:[]}]},{id:'BOM02',name:'DEP 水光标准配方',spec:'SP03',version:1,effective:day(-30),status:'已发布',lines:[{type:'sku',item:'SKU03',quantity:1,alternatives:[]},{type:'sku',item:'SKU04',quantity:1,alternatives:[]}]},{id:'BOM03',name:'色素管理标准配方',spec:'SP04',version:1,effective:day(-30),status:'已发布',lines:[{type:'equipment',item:'EQ01',quantity:500,alternatives:[]}]},{id:'BOM04',name:'艾莉薇注射标准配方',spec:'SP02',version:1,effective:day(-30),status:'已发布',lines:[{type:'sku',item:'SKU02',quantity:1,alternatives:['SKU01']},{type:'sku',item:'SKU04',quantity:1,alternatives:[]}]}];
    d.cards=[{id:'CARD01',name:'DEP 焕肤体验卡',type:'体验卡',price:1280,days:180,cross:'同品牌',scope:'贝颜',status:'已上架',contents:[{spec:'SP03',times:3}]},{id:'CARD02',name:'双十一组合卡',type:'组合卡',price:2980,days:365,cross:'全部门店',scope:'全部门店',status:'已上架',contents:[{spec:'SP03',times:3},{spec:'SP04',times:2}]}];
    d.cardSales=[{id:'CS01',card:'CARD02',customer:'林女士 / HY1001',store:'XM',sold:day(-10),expires:day(355),amount:2980,remaining:[{spec:'SP03',times:3},{spec:'SP04',times:2}],initialTimes:5,recognized:0,status:'有效'}];
    d.prices=[{id:'PR01',name:'百星标准项目价',spec:'SP01',kind:'标准价',scope:'百星',member:'全部等级',price:1980,floor:1580,priority:10,start:day(-30),end:day(365),status:'已生效'},{id:'PR02',name:'双十一水光特价',spec:'SP03',kind:'促销价',scope:'全部门店',member:'全部等级',price:499,floor:399,priority:100,start:day(5),end:day(15),status:'待审批'}];
    d.suppliers=[{id:'SUP01',name:'华东医美供应链有限公司',contact:'陈经理',phone:'13800000001',scope:'医疗器械',status:'启用'},{id:'SUP02',name:'OF 品牌供应中心',contact:'李经理',phone:'13800000002',scope:'化妆品',status:'启用'}];
    d.credentials=[{id:'LIC01',supplier:'SUP01',name:'医疗器械经营许可证',code:'示范档案-MD001',expiry:day(42),file:'器械经营许可.pdf',status:'有效'},{id:'LIC02',supplier:'SUP01',name:'药品经营许可证',code:'示范档案-YP001',expiry:day(365),file:'药品经营许可.pdf',status:'有效'},{id:'LIC03',supplier:'SUP01',name:'GSP 证书',code:'示范档案-GSP001',expiry:day(365),file:'GSP证书.pdf',status:'有效'}];
    d.firstReviews=[{id:'FR01',name:'华东供应商首营审核',supplier:'SUP01',sku:'SKU01',kind:'首营企业',status:'已通过',note:'经营范围及资料已核对'}];
    d.warehouses=d.stores.flatMap(s=>['常温柜','冷藏柜','管制药柜'].map((type,i)=>({id:s.id+'-Z'+i,name:s.name+' · '+type,store:s.id,type,category:i===0?'全部类型':'针剂药品',status:'启用'})));
    let ix=0;d.batches=d.stores.flatMap((s,j)=>d.skus.map((k,i)=>({id:'LOT'+String(++ix).padStart(3,'0'),sku:k.id,store:s.id,warehouse:s.id+'-Z'+(k.controlled?2:k.cold?1:0),batch:'B2026'+String(i+1).padStart(2,'0')+(j+1),produced:day(-100),expiry:day(i===0&&j===1?25:i===4&&j===2?12:i===8&&j===3?-2:180+i*10),quantity:j===0?100:i===0&&j===2?3:20+i*3,reserved:0,cost:k.cost,supplier:i>=6?'SUP02':'SUP01',quality:i===4&&j===3?'待确认':'合格',udi:'(01)0690000000'+String(i).padStart(4,'0')+'(10)B'+(j+1),source:'期初建账',openedAt:'',openExpiry:''})));
    d.udi=d.batches.filter(b=>d.skus.find(s=>s.id===b.sku).udiRequired).map(b=>({id:uid('UDI'),sku:b.sku,batch:b.id,code:b.udi,status:'在库'}));
    d.staff=[{id:'EMP01',name:'周医生',post:'医生',store:'XM',department:'医疗部',account:'zhou',status:'启用'},{id:'EMP02',name:'王库管',post:'库管',store:'XM',department:'运营部',account:'wang',status:'启用'},{id:'EMP03',name:'陈复核',post:'店长',store:'XM',department:'运营部',account:'chen',status:'启用'},{id:'EMP04',name:'许美疗师',post:'美疗师',store:'SH',department:'服务部',account:'xu',status:'启用'}];
    d.qualifications=[{id:'Q01',staff:'EMP01',name:'医师执业证',code:'执业档案-001',expiry:day(280),scope:'医疗美容',status:'有效'},{id:'Q02',staff:'EMP04',name:'光电操作培训证明',code:'操作档案-002',expiry:day(20),scope:'光电操作',status:'有效'}];
    d.departments=[{id:'DP01',name:'医疗部',post:'医生',status:'启用'},{id:'DP02',name:'运营部',post:'库管',status:'启用'}];
    d.roles=[{id:'ROLE01',name:'总部采购',level:'总部',scope:'全部门店',permissions:['采购','库存查询','报表'],status:'启用'},{id:'ROLE02',name:'门店库管',level:'门店',scope:'XM',permissions:['库存查询','领用','盘点'],status:'启用'}];
    d.approvals=[{id:'AP01',name:'采购审批',kind:'采购',steps:'门店申请 → 区域审核 → 总部采购',threshold:10000,status:'启用'},{id:'AP02',name:'报损审批',kind:'报损',steps:'门店申请 → 总部审核',threshold:0,status:'启用'}];
    d.purchases=[{id:'PO202610001',supplier:'SUP01',store:'WH',sku:'SKU01',quantity:20,unit:'ml',price:360,amount:7200,delivery:day(3),status:'待审批',time:day(-1),note:''}];
    d.applications=[{id:'PA202610001',store:'FZ',sku:'SKU01',quantity:10,reason:'安全库存补货',status:'待审批',time:today()}];
    d.partnerOrders=[{id:'OUT001',name:'Y10 外协体验',customer:'陈女士 / HY1003',channel:'渠道外协',store:'XM',amount:1980,ratio:30,received:0,status:'待回款'}];
    return d;
  }
  let data;try {data=JSON.parse(localStorage.getItem(KEY));}catch{} if(!data||data.version!==1)data=seed();
  const persistence=window.PCInventoryStorage;let initializing=true,initializationChanged=false,pendingSave=null,persistedRevision=Number(data.revision||0);
  S.storageError='';
  S.ready=persistence.read().then(saved=>{if(saved)data=saved;persistedRevision=Number(data.revision||0)});
  const get=(type,id,d=data)=>d[type]?.find(r=>r.id===id);
  function persist(next,previous,keepOnFailure=false){
    let operation;
    try{operation=persistence.write(next,persistedRevision)}catch(error){if(!keepOnFailure)data=previous;S.storageError=error.message;throw error}
    if(!operation){S.storageError='';persistedRevision=Number(next.revision||0);return}
    const saving=Promise.resolve(operation).then(()=>{S.storageError='';persistedRevision=Number(next.revision||0)},error=>{
      if(!keepOnFailure&&data===next)data=previous;
      S.storageError=error.message;throw error;
    }).finally(()=>{if(pendingSave===saving)pendingSave=null});
    pendingSave=saving;saving.catch(()=>{});
  }
  function transaction(label,fn){
    must(!pendingSave,'正在保存，请稍候');must(initializing||!S.storageError,S.storageError);
    const previous=data,next=copy(data);if(!initializing)S.authorizeTransaction?.(label,next);const gate=S.approvalIntercept?.(next);const result=gate?.skip?gate.result:fn(next);S.reconcileLedger?.(next);next.revision=Number(previous.revision||0)+1;
    for(const b of next.batches)must(Number.isFinite(b.quantity)&&Number.isFinite(b.reserved)&&b.quantity>=0&&b.reserved>=0&&b.reserved<=b.quantity,'库存数量或预占数量异常');
    next.history.unshift({id:uid('H'),name:label,time:stamp(),operator:S.actor?.(next)?.name||'系统初始化',actor:S.actor?.(next)?.id||'',target:result?.id||'',detail:result?.detail||label});
    data=next;if(initializing)initializationChanged=true;else persist(next,previous);return result;
  }
  async function flush(){if(pendingSave)await pendingSave;if(S.storageError)throw Error(S.storageError)}
  async function finishInitialization(){
    initializing=false;if(!initializationChanged)return;
    try{persist(data,data,true);await flush()}catch{/* The screen and original records stay accessible even if both stores reject writes. */}
  }
  function retryPersist(){must(!pendingSave,'正在保存，请稍候');persist(data,data,true);return flush()}
  Object.assign(S,{flush,finishInitialization,retryPersist});
  Object.defineProperty(S,'saving',{get:()=>!!pendingSave});

  const available=b=>round(Math.max(0,b.quantity-b.reserved));
  function daysLeft(b){return Math.floor((Date.parse(b.expiry+'T00:00:00Z')-Date.parse(today()+'T00:00:00Z'))/86400000)}
  function batchState(b,d=data){const k=get('skus',b.sku,d);if(b.quantity<=0)return '已用尽';if(b.openExpiry&&Date.parse(b.openExpiry)<=Date.now())return '开瓶已到期';if(daysLeft(b)<0)return '已过期';if(b.hold)return b.hold;if(b.quality!=='合格')return '质量待确认';if((k?.lockDays||0)>0&&daysLeft(b)<=k.lockDays)return '已锁定';if(b.assignedTreatment)return '治疗待用';if(b.customerId)return '客户寄存';if(k?.status==='停用')return '商品停用';return '可用'}
  function movement(d,b,quantity,kind,source){if(S.checkQuantity)S.checkQuantity(b.sku,Math.abs(quantity),d,true);b.quantity=round(b.quantity+quantity);must(b.quantity>=0,'库存不足');d.movements.unshift({id:uid('IO'),sku:b.sku,batch:b.id,batchNo:b.batch,store:b.store,warehouse:b.warehouse,containerCode:b.containerCode||'',quantity,balance:b.quantity,unit:get('skus',b.sku,d).unit,cost:round(Math.abs(quantity)*b.cost),kind,source,time:stamp()})}
  function allocate(d,sku,store,quantity,batch,customerId=''){positive(quantity);let left=Number(quantity),out=[];const lots=d.batches.filter(b=>b.sku===sku&&b.store===store&&(!batch||b.id===batch)&&(S.usable?S.usable(b,d,customerId):batchState(b,d)==='可用')).sort((a,b)=>Number(!!b.customerId)-Number(!!a.customerId)||Number(!!b.openedAt)-Number(!!a.openedAt)||String(a.openExpiry||a.expiry).localeCompare(String(b.openExpiry||b.expiry)));for(const b of lots){let q=Math.min(available(b),left);if(q>0){out.push({batch:b.id,sku,quantity:round(q),cost:b.cost});left=round(left-q)}if(!left)break}must(left<=0,get('skus',sku,d)?.name+'可用库存不足，已排除锁定、过期及质量待确认批次');return out}
  function guardClinical(d,lines,record){const skus=lines.filter(l=>l.sku).map(l=>get('skus',l.sku,d));if(skus.some(k=>k.doctor)){must(record.doctor&&record.caseNo&&record.consent,'请填写操作医生、病例号及知情同意书编号');must(d.qualifications.some(q=>q.staff===record.doctor&&q.name==='医师执业证'&&q.status==='有效'&&q.expiry>=today()),'医生资质无效或已到期')}if(skus.some(k=>k.controlled)){must(record.operator&&record.reviewer&&record.operator!==record.reviewer,'管制物料须由两位不同人员登记和复核')}if(skus.some(k=>k.udiRequired))must(lines.filter(l=>get('skus',l.sku,d)?.udiRequired).every(l=>get('batches',l.batch,d)?.udi),'所选批次缺少 UDI 追溯码')}
  function activeBom(spec,d=data){return d.boms.filter(b=>b.spec===spec&&b.status==='已发布'&&b.effective<=today()).sort((a,b)=>b.effective.localeCompare(a.effective)||b.version-a.version)[0]}
  function save(type,record){return transaction('保存 / '+(record.name||type),d=>{must(d[type],'未知业务');const r=copy(record);if(type==='units'){S.validateUnit(r,d);if(r.isDefault){d.units.filter(u=>u.sku===r.sku&&u.id!==r.id).forEach(u=>u.isDefault=false);get('skus',r.sku,d).purchaseUnit=r.name}}if(type==='skus')S.validateSku(r,d);S.validateMaster?.(type,r,d);if(type==='purchases')r.conversion=S.unitSnapshot(r.sku,r.quantity,r.unit,d);r.id||=uid(type.slice(0,3).toUpperCase());r.updated=stamp();r.createdBy||=S.actor?.(d)?.id||'';const i=d[type].findIndex(x=>x.id===r.id);if(i<0)d[type].unshift(r);else d[type][i]=r;return r})}
  function purchaseReceive(id,r){return transaction('采购验收入库',d=>{const po=get('purchases',id,d);must(po&&po.status==='待收货','仅待收货订单可入库');positive(r.quantity);must(Number(r.quantity)<=po.quantity,'入库数量不得超过订单数量');must(r.quantity===po.quantity,'请按订单完整验收；差异请先退回采购修改订单');must(r.deliveryNo&&r.invoiceNo,'请填写送货单号和发票号');must(Number(r.deliveryQuantity)===po.quantity&&Number(r.invoiceAmount)===po.amount,'三单不一致：送货数量或发票金额与采购订单不符');must(r.batch&&r.produced&&r.expiry&&r.expiry>today()&&r.produced<=today()&&r.expiry>r.produced,'请核对生产批号及生产、有效日期');const sku=get('skus',po.sku,d);if(sku.udiRequired)must(sku.traceLevel==='单支'?r.unitCodes:r.udi,'该存货入库必须登记 UDI');const zone=get('warehouses',r.warehouse,d);must(zone&&zone.store===po.store&&zone.status==='启用'&&zone.type!=='虚拟库位','库位须属于收货门店且为启用状态');must(zone.category==='全部类型'||zone.category===sku.category,'商品类型与库位绑定类型不匹配');must(!sku.cold||['冷藏柜','管制药柜'].includes(zone.type),'冷链商品须入冷藏区域');must(!sku.controlled||zone.type==='管制药柜','管制商品须入管制药柜');const conversion=po.conversion||S.unitSnapshot(po.sku,po.quantity,po.unit,d),factor=conversion.factor;positive(factor,'单位换算系数');const total=conversion.baseQuantity,capacity=S.unitFactor(sku.id,sku.containerUnit||sku.stockUnit||sku.unit,d),codes=(r.unitCodes||'').split(/\s+/).filter(Boolean);if(sku.traceLevel==='单支'){must(Number.isInteger(total/capacity),'单支追溯入库量须为整支');must(codes.length===total/capacity&&new Set(codes).size===codes.length,'请逐支录入追溯码，数量须与验收入库支数一致');must(codes.every(code=>!d.udi.some(u=>u.code===code)&&!d.batches.some(b=>b.containerCode===code)),'单支追溯码已登记')}const lots=sku.traceLevel==='单支'?codes:[''];for(const code of lots){const b={...r,id:uid('LOT'),sku:po.sku,store:po.store,supplier:po.supplier,cost:po.price/factor,quantity:0,reserved:0,quality:'合格',source:po.id,containerCode:code,udi:code||r.udi,conversion:copy(conversion),stockSnapshot:{unit:sku.stockUnit||sku.unit,factor:S.unitFactor(sku.id,sku.stockUnit||sku.unit,d)}};d.batches.unshift(b);movement(d,b,sku.traceLevel==='单支'?capacity:total,'采购入库',po.id);if(b.udi)d.udi.push({id:uid('UDI'),sku:po.sku,batch:b.id,code:b.udi,parentCode:r.boxCode||'',status:'在库'})}Object.assign(po,{status:'已入库',receivedAt:stamp(),receipt:{...copy(r),baseQuantity:total,baseUnit:sku.unit,conversion:copy(conversion)}});return po})}
  function transferAction(id,action,r={}){return transaction('调拨'+action,d=>{const t=get('transfers',id,d),b=get('batches',t.batch,d);must(t,'调拨单不存在');if(action==='approve'){must(t.status==='待审批','状态已改变');t.status='待发货'}else if(action==='ship'){must(t.status==='待发货','仅待发货单据可发货');must(batchState(b,d)==='可用'&&!b.openedAt,'仅未开封可用库存可调拨');must(available(b)>=t.quantity,'可用库存不足');movement(d,b,-t.quantity,'调拨发货',t.id);t.status='在途';t.shipped=stamp()}else if(action==='receive'){must(t.status==='在途','仅在途单据可收货');const zone=get('warehouses',r.warehouse,d),sku=get('skus',b.sku,d);must(zone&&zone.store===t.to&&zone.status==='启用'&&zone.type!=='虚拟库位','请选择启用的接收门店库位');must(zone.category==='全部类型'||zone.category===sku.category,'商品类型与接收库位不匹配');must(!sku.cold||['冷藏柜','管制药柜'].includes(zone.type),'请选择冷藏库位');must(!sku.controlled||zone.type==='管制药柜','请选择管制药柜');const receiveUnit=r.receiveUnit||get('skus',b.sku,d).stockUnit||get('skus',b.sku,d).unit,receiveFactor=S.unitFactor(b.sku,receiveUnit,d);must(Math.abs(Number(r.receiveQuantity)*receiveFactor-t.quantity)<.00001,'实收数量换算后与发出基本数量不一致');t.receiveQuantity=Number(r.receiveQuantity);t.receiveUnit=receiveUnit;t.receiveConversion=S.unitSnapshot(b.sku,t.receiveQuantity,receiveUnit,d);const dest={...copy(b),id:uid('LOT'),store:t.to,warehouse:zone.id,quantity:0,reserved:0,source:t.id};d.batches.push(dest);movement(d,dest,t.quantity,'调拨收货',t.id);t.status='已收货';t.received=stamp()}else if(action==='reject'){must(t.status==='在途','仅在途单据可拒收');must(r.reason,'请填写拒收原因');t.status='退回在途';t.reason=r.reason}else if(action==='return'){must(t.status==='退回在途','仅退回在途可退回签收');movement(d,b,t.quantity,'调拨退回',t.id);t.status='已退回';t.returned=stamp()}else if(action==='deny'){must(t.status==='待审批','状态已改变');t.status='已驳回'}return t})}
  function reserve(r){return transaction('项目预占库存',d=>{const sp=get('specs',r.spec,d),service=get('services',sp?.service,d);must(sp&&service,'请选择服务规格');must(r.cardSale||service.status==='已上架','该项目当前不可开新单');must(!['停用','归档'].includes(service.status)&&sp.status==='启用','项目或规格已停用');must(service.visibility!=='仅后台','隐藏品项不允许开治疗消耗单');if(service.visibility==='店长授权')must(get('staff',r.authorizer,d)?.post==='店长','该项目需选择店长授权人');const store=get('stores',r.store,d);must(store&&store.status==='启用','请选择可用门店');if(!r.cardSale)must(!service.scope||['全部门店',store.id,store.brand,store.region,store.grade].includes(service.scope),'该项目未在所选门店上架');must(r.customerId?.trim(),'请填写客户 ID');positive(r.times,'服务次数');must(Number.isInteger(r.times),'服务次数须为整数');const bom=activeBom(sp.id,d);must(bom,'该规格尚无已生效的 BOM');if(r.cardSale){const cs=get('cardSales',r.cardSale,d),card=cs?.cardSnapshot||get('cards',cs?.card,d),from=get('stores',cs?.store,d),to=get('stores',r.store,d);must(cs&&cs.status==='有效'&&cs.expires>=today(),'卡项已失效');must(cs.customerId===r.customerId||cs.authorizedPatients?.includes(r.customerId),'患者与持卡人不一致，须先登记授权');must(card.cross==='全部门店'||cs.store===r.store||card.cross==='同品牌'&&from.brand===to.brand,'该卡不允许在当前门店核销');must((cs.remaining.find(c=>c.spec===r.spec)?.times||0)-d.consumptions.filter(c=>c.cardSale===cs.id&&c.spec===r.spec&&['已预占','待偏差审批'].includes(c.status)).reduce((n,c)=>n+c.times,0)>=r.times,'卡内可核销次数不足')}
      const record={...copy(r),id:uid('USE'),name:service.name+' / '+sp.name,status:'已预占',time:stamp(),bom:copy(bom),allocations:[],shots:[],serviceSnapshot:copy(service)};
      for(const [i,l]of bom.lines.entries()){const chosen=r.alternatives?.[i]||l.item;must(chosen===l.item||(l.alternatives||[]).includes(chosen),'所选替代料不在 BOM 允许范围内');const quantity=round((l.baseQuantity??l.quantity)*r.times);if(l.type==='equipment'){const ref=get('equipment',l.item,d),eq=d.equipment.find(e=>e.store===r.store&&(e.model||e.name)===(ref?.model||ref?.name)&&e.status==='使用中');if(eq)record.bom.lines[i].item=eq.id;must(eq&&eq.store===r.store&&eq.status==='使用中','BOM 关联仪器不在本门店或不可用');const held=d.consumptions.filter(c=>['已预占','待偏差审批'].includes(c.status)).flatMap(c=>c.shots).filter(x=>x.equipment===eq.id).reduce((n,x)=>n+x.quantity,0);must(eq.shots-held>=quantity,'仪器剩余发数不足');must(d.heads.filter(h=>h.equipment===eq.id&&h.status!=='已更换').every(h=>h.status==='使用中'&&h.used+r.times<=h.life),'治疗头寿命不足，请更换');record.shots.push({equipment:eq.id,quantity})}else{const a=S.reserveMaterial?S.reserveMaterial(d,chosen,r.store,quantity,r.customerId):allocate(d,chosen,r.store,quantity,undefined,r.customerId);a.forEach(x=>{get('batches',x.batch,d).reserved=round(get('batches',x.batch,d).reserved+x.quantity)});record.allocations.push(...a)}}
      guardClinical(d,record.allocations,record);d.consumptions.unshift(record);return record})}
  function consumeAction(id,action,proposal,review){return transaction(action==='confirm'?'确认项目消耗':'取消预占',d=>{const r=get('consumptions',id,d);must(r&&['已预占','待偏差审批'].includes(r.status),'此单已处理，请勿重复操作');if(action==='confirm'){if(r.status==='待偏差审批'){must(review?.reviewer&&review.note?.trim(),'实际用量超范围，须先审批');must(review.reviewer!==r.operator,'偏差审核人不能与登记人相同');r.actualReview={...copy(review),time:stamp()};proposal=r.actualProposal}S.prepareConsumption(d,r,proposal);must(!r.deviations.length||r.actualReview,'实际用量超范围，须先审批');guardClinical(d,r.allocations,r);for(const x of r.allocations){const b=get('batches',x.batch,d);must(S.usable(b,d,r.customerId),'预占批次已不可用，请取消后重新申请');must(b.quantity>=x.quantity&&b.reserved>=x.quantity,'库存已变化')}for(const x of r.shots){const eq=S.usableEquipment(x.equipment,r.store,d);must(eq.shots-S.heldShots(eq.id,d,r.id)>=x.quantity,'仪器可用发数不足，不能占用其他治疗单余额');must(d.heads.filter(h=>h.equipment===x.equipment&&h.status!=='已更换').every(h=>h.status==='使用中'&&h.used+r.times<=h.life),'治疗头寿命不足，请更换')}}for(const x of r.allocations){const b=get('batches',x.batch,d);b.reserved=round(b.reserved-x.quantity);if(action==='confirm')movement(d,b,-x.quantity,'项目消耗',r.id)}
      if(action==='confirm'){S.applyRemainders(d,r);for(const x of r.shots){const eq=get('equipment',x.equipment,d);eq.shots-=x.quantity;d.shotLogs.unshift({id:uid('SHOT'),equipment:eq.id,quantity:-x.quantity,amount:0,time:stamp(),kind:'项目消耗',source:r.id,status:'已入账'});d.heads.filter(h=>h.equipment===eq.id&&h.status==='使用中').forEach(h=>h.used+=r.times)}r.cost=round(r.allocations.reduce((n,x)=>n+x.quantity*x.cost,0));r.status='已消耗';r.confirmed=stamp();if(r.cardSale){const cs=get('cardSales',r.cardSale,d),c=cs.remaining.find(c=>c.spec===r.spec);must(c.times>=r.times,'卡内剩余次数不足');must(cs.status==='有效'&&cs.expires>=today(),'卡项已到期，请取消该预占');c.times-=r.times;const remaining=cs.remaining.reduce((n,c)=>n+c.times,0),amount=remaining===0?round(cs.amount-cs.recognized-(cs.refunded||0)):round((cs.unitValues?.[r.spec]??cs.amount/cs.initialTimes)*r.times);cs.recognized=round(cs.recognized+amount);d.redemptions.unshift({id:uid('RD'),cardSale:cs.id,customer:cs.customer,spec:r.spec,store:r.store,saleStore:cs.store,times:r.times,amount,cost:r.cost,source:r.id,time:stamp(),status:'已核销'});if(cs.store!==r.store)d.settlements.unshift({id:uid('SET'),name:'跨店核销分摊',from:cs.store,to:r.store,source:r.id,amount,status:'待确认'})}if(r.allocations.some(x=>get('skus',x.sku,d).controlled))d.controlledLogs.unshift({id:uid('CTL'),name:'管制药品领用',store:r.store,operator:r.operator,reviewer:r.reviewer,customer:r.customer,source:r.id,time:stamp(),status:'已复核'})}else r.status='已取消';return r})}
  function stockOut(r){return transaction(r.kind,d=>{S.requirePermission?.('领用',r.store,d);positive(r.quantity);must(r.customer||!['销售出库','销售退货'].includes(r.kind),'请填写客户');const sku=get('skus',r.sku,d);must(sku,'请选择商品');const conversion=S.unitSnapshot(r.sku,r.quantity,r.unit||sku.salesUnit||sku.unit,d);r={...r,businessQuantity:r.quantity,businessUnit:conversion.unit,quantity:conversion.baseQuantity,price:r.price/conversion.factor,conversion};must(sku.status==='启用','该物料已停用');must(r.kind!=='销售出库'||sku.retailAllowed,'该物料未开放零售，请走治疗领料');const rows=allocate({...d,batches:d.batches.filter(b=>!b.openedAt)},r.sku,r.store,r.quantity,r.batch);must(rows.every(x=>!get('batches',x.batch,d).openedAt),'销售和领用出库不能使用开瓶余量，请通过项目消耗登记');guardClinical(d,rows,r);if(r.kind==='赠送配赠')must(sku.gift,'该商品不允许配赠');const doc={...copy(r),id:uid('OUT'),status:'已出库',time:stamp(),allocations:rows,cost:round(rows.reduce((n,x)=>n+x.quantity*x.cost,0)),amount:r.kind==='销售出库'?round(r.quantity*r.price):0};for(const x of rows)movement(d,get('batches',x.batch,d),-x.quantity,r.kind,doc.id);d.retail.unshift(doc);return doc})}
  function approveLoss(id){return transaction('报损审核出库',d=>{const r=get('losses',id,d),b=get('batches',r?.batch,d);must(r&&r.status==='待审批','报损单已处理');S.differentReviewer?.(r.createdBy,'报损审批',b?.store,d);positive(r.quantity);must(b&&available(b)>=r.quantity,'报损数量超过可用余额（不含预占）');movement(d,b,-r.quantity,'报损 / '+r.reason,r.id);r.cost=round(r.quantity*b.cost);r.status='已报损';r.reviewer=S.actor?.(d)?.id;r.reviewedAt=stamp();S.updateCustody(d,b);return r})}
  function approveCount(id,review={}){return transaction('盘点审核调整',d=>{const c=get('counts',id,d),b=get('batches',c?.batch,d);must(c&&c.status==='待审核','盘点单未提交或已处理');must(Number.isFinite(c.actual)&&c.actual>=0,'实盘数量须为非负数');const intervening=d.movements.filter(x=>x.batch===b.id&&!x.transit&&!(c.movementIds||[]).includes(x.id)).reduce((n,x)=>n+x.quantity,0);const expected=round(c.book+intervening),adjusted=round(c.actual+intervening);must(b.quantity===expected,'账面流水不一致，请退回重盘');must(adjusted>=b.reserved,'调整后库存不足覆盖已预占量，请处理预占后重试');must(c.actual>=b.reserved,'实盘量不能少于已预占库存');S.checkQuantity(b.sku,c.actual,d,true);if(b.openedAt&&b.capacity)must(c.actual<=b.capacity,'单瓶实盘量不能超过容量');if(c.splitReview){must(review.reviewer&&review.note?.trim(),'拆零差异须专项复核并填写意见');must(review.reviewer!==c.person,'拆零差异复核人不能与盘点人相同');c.splitApproval={...copy(review),time:stamp()}}movement(d,b,round(c.actual-c.book),'盘点调整',c.id);c.intervening=intervening;c.adjustedActual=adjusted;c.reviewer=review.reviewer;c.reviewNote=review.note;S.updateCustody(d,b);c.difference=round(c.actual-c.book);c.status='已完成';return c})}
  function merge(r){return transaction('合并服务项目',d=>{const target=get('services',r.target,d);must(target&&target.status==='已上架','目标项目须为已上架项目');must(r.sources.length>0&&!r.sources.includes(r.target),'请选择来源项目，且不能包含目标项目');must(r.reason?.trim(),'请填写合并原因');const sources=r.sources.map(id=>get('services',id,d));must(sources.every(s=>s&&!s.mergedInto),'来源项目已合并或不存在');const record={...copy(r),id:uid('MERGE'),name:sources.map(s=>s.name).join('、')+' → '+target.name,before:copy(sources),targetSnapshot:copy(target),time:stamp(),status:'已完成'};for(const s of sources){s.status='已下架';s.mergedInto=target.id;d.specs.filter(p=>p.service===s.id).forEach(p=>{p.originalService||=s.id;p.service=target.id})}d.merges.unshift(record);return record})}
  function publishBom(record){return transaction('发布 BOM 版本',d=>{must(record.lines.length,'BOM 至少包含一个物料或仪器');must(record.effective,'请填写生效日期');must(!d.boms.some(b=>b.id!==record.id&&b.spec===record.spec&&b.effective===record.effective&&b.status==='已发布'),'同一规格同一生效日已有发布版本');const r=copy(record);S.normalizeBom(r,d);r.id=uid('BOM');for(const l of r.lines){positive(l.quantity);must(get(l.type==='sku'?'skus':'equipment',l.item,d),'配方包含无效物料或仪器')}r.version=Math.max(0,...d.boms.filter(b=>b.spec===r.spec).map(b=>b.version))+1;r.status='已发布';r.time=stamp();d.boms.unshift(r);return r})}
  function sellCard(r){return transaction('售卡预收',d=>{const card=get('cards',r.card,d);must(card&&card.status==='已上架','卡项未上架');must(card.contents.length,'卡项未配置可核销内容');const store=get('stores',r.store,d);must(store&&['全部门店',store.brand,store.id].includes(card.scope),'该卡未在所选门店上架');const record={...copy(r),id:uid('CS'),amount:card.price,remaining:copy(card.contents),initialTimes:card.contents.reduce((n,c)=>n+c.times,0),recognized:0,sold:today(),expires:day(card.days),status:'有效',cardSnapshot:copy(card)};must(record.customer,'请填写客户');d.cardSales.unshift(record);return record})}
  Object.assign(S,{KEY,today,day,stamp,uid,round,must,positive,copy,get,seed,transaction,available,daysLeft,batchState,activeBom,save,purchaseReceive,transferAction,reserve,consumeAction,stockOut,guardClinical,approveLoss,approveCount,merge,publishBom,sellCard,allocate,movement});
  Object.defineProperty(S,'data',{get:()=>data});return S;
})();

;
/* Unit chains, container stock and customer custody. Quantities in every ledger are base units. */
(() => {
  const S=PCModules['supply-chain'],{get,copy,must,positive,round,uid,stamp}=S;
  const modes=['客户寄存','继续本班次使用','超时报损','合规销毁','保留治疗头'];
  const held=c=>['已预占','待偏差审批'].includes(c.status);
  function factor(sku,unit,d=S.data,seen=new Set()) {
    const k=get('skus',sku,d);must(k,'存货不存在');if(unit===k.unit)return 1;
    must(unit&&!seen.has(unit),'单位换算存在循环或单位未选择');seen.add(unit);
    const rules=d.units.filter(u=>u.sku===sku&&u.name===unit);must(rules.length===1,'缺少或重复的换算关系：'+unit);
    const u=rules[0];positive(u.factor,'换算系数');const n=Number(u.factor)*factor(sku,u.target||k.unit,d,seen);
    must(Number.isFinite(n)&&n>0&&Math.abs(n-round(n))<1e-8,'换算结果须精确到基本单位小数点后 4 位');return round(n);
  }
  function unitsFor(sku,d=S.data){const k=get('skus',sku,d);return k?[k.unit,...d.units.filter(u=>u.sku===sku).map(u=>u.name)]:[]}
  function checkQuantity(sku,q,d=S.data,zero=false){const k=get('skus',sku,d);must(k&&Number.isFinite(q)&&(zero?q>=0:q>0),'数量须为'+(zero?'非负数':'正数'));const step=k.splitAllowed?Number(k.step||1):1;must(step>=.0001&&Math.abs(q/step-Math.round(q/step))<1e-7,'数量须为 '+step+' '+k.unit+' 的整数倍');return round(q)}
  function convert(sku,q,unit,d=S.data,zero=false){const f=factor(sku,unit,d),raw=Number(q)*f,u=d.units.find(u=>u.sku===sku&&u.name===unit);must(!u||u.allowSplit!==false||Number.isInteger(Number(q)),'该包装单位不允许拆零');must(Math.abs(raw-round(raw))<1e-8,'换算数量超过小数点后 4 位的记账精度');return checkQuantity(sku,round(raw),d,zero)}
  function snapshot(sku,q,unit,d=S.data){const k=get('skus',sku,d),f=factor(sku,unit,d);return {unit,quantity:Number(q),factor:f,baseUnit:k.unit,baseQuantity:convert(sku,q,unit,d),rules:copy(d.units.filter(u=>u.sku===sku)),time:stamp()}}
  function validateUnit(r,d=S.data){const next=copy(d),k=get('skus',r.sku,next);must(k,'请选择存货');positive(r.factor,'换算系数');must(r.name!==k.unit&&r.name!==r.target,'源单位不能是基本单位或目标单位');must(!next.units.some(u=>u.id!==r.id&&u.sku===r.sku&&u.name===r.name),'同一 SKU 的源单位只能有一种包装关系；不同包装请新建 SKU');const old=get('units',r.id,next);if(old){const changed=old.sku!==r.sku||old.name!==r.name||factor(old.sku,old.name,next)!==Number(r.factor)*(r.target===k.unit?1:factor(r.sku,r.target,next));must(!changed||!next.batches.some(b=>b.sku===old.sku)&&!next.purchases.some(p=>p.sku===old.sku||p.lines?.some(l=>l.sku===old.sku)),'已有库存或采购单的包装关系不可改写；标准装、促销装请使用独立 SKU')}
    next.units=next.units.filter(u=>u.id!==r.id);next.units.push(copy(r));next.units.filter(u=>u.sku===r.sku).forEach(u=>factor(r.sku,u.name,next));return r;
  }
  function validateSku(r,d=S.data){const old=get('skus',r.id,d);must(!old||old.unit===r.unit,'基本单位创建后不可变更，请新建 SKU');must(Number(r.step)>=.0001&&Number(r.step)<=1,'最小用量须在 0.0001 到 1 之间');must(r.splitAllowed||Number(r.step)===1,'不允许拆零的物料仅支持整数基本单位');must((r.remainderModes||[]).every(x=>modes.includes(x)),'余量策略无效');if(r.trackOpened){must(r.splitAllowed&&r.containerUnit,'按瓶管理须启用拆零并选择容器单位');must((r.remainderModes||[]).length,'请选择余量去向');if(r.remainderModes.some(x=>['客户寄存','继续本班次使用'].includes(x)))must(r.openHours>0&&r.policyBasis?.trim(),'留存余量须填写产品依据与开封有效小时数')}
    if(old){for(const key of ['purchaseUnit','stockUnit','consumptionUnit','containerUnit'])if(r[key])factor(r.id,r[key],d);if(d.batches.some(b=>b.sku===r.id&&b.openedAt&&b.quantity>0))must(old.trackOpened===r.trackOpened&&old.containerUnit===r.containerUnit,'仍有开瓶库存，不能改变按瓶管理方式')}
  }
  function normalizeBom(record,d=S.data){const seen=new Set();for(const l of record.lines){const k=get(l.type==='equipment'?'equipment':'skus',l.item,d);must(k,'配方对象不存在');must(!seen.has(l.type+l.item),'同一物料或仪器不可重复');seen.add(l.type+l.item);l.unit||=k.unit;l.min=l.min===''||l.min==null?Number(l.quantity):Number(l.min);l.max=l.max===''||l.max==null?Number(l.quantity):Number(l.max);positive(l.quantity,'标准用量');must(l.min>=0&&l.min<=l.quantity&&l.max>=l.quantity,'用量范围须满足 0 ≤ 下限 ≤ 标准用量 ≤ 上限');if(l.type==='sku'){l.conversion=snapshot(l.item,l.quantity,l.unit,d);l.baseQuantity=l.conversion.baseQuantity;l.baseMin=convert(l.item,l.min,l.unit,d,true);l.baseMax=convert(l.item,l.max,l.unit,d);must((l.alternatives||[]).every(id=>id!==k.id&&get('skus',id,d)?.unit===k.unit),'替代料须与主料使用相同基本单位');for(const id of l.alternatives||[])checkQuantity(id,l.baseQuantity,d)}else{must(l.unit===k.unit&&Number.isInteger(Number(l.quantity))&&Number.isInteger(l.min)&&Number.isInteger(l.max),'仪器发数须为整数且单位须与账户一致');l.baseQuantity=Number(l.quantity);l.baseMin=l.min;l.baseMax=l.max}}return record}
  function stockParts(b,d=S.data){const k=get('skus',b.sku,d),stock=b.stockSnapshot||{unit:k.stockUnit||k.unit,factor:factor(k.id,k.stockUnit||k.unit,d)},pack=k.purchaseUnit||stock.unit,pf=factor(k.id,pack,d),n=b.quantity;let packages=0,whole=0,remainder=n;if(!b.openedAt){if(pf>stock.factor){packages=Math.floor((n+1e-8)/pf);remainder=round(n-packages*pf)}whole=Math.floor((remainder+1e-8)/stock.factor);remainder=round(remainder-whole*stock.factor)}return {packages:packages+' '+pack,whole:whole+' '+stock.unit,remainder:(b.openedAt?'1'+(b.containerUnit||k.containerUnit||'瓶')+' 已开封 / ':'')+remainder+' '+k.unit,total:n+' '+k.unit}}
  function stockBalances(){const d=S.data,out=[];for(const store of d.stores)for(const k of d.skus){const lots=d.batches.filter(b=>b.store===store.id&&b.sku===k.id&&b.quantity>0);if(!lots.length)continue;const sealed=round(lots.filter(b=>!b.openedAt).reduce((n,b)=>n+b.quantity,0)),opened=lots.filter(b=>b.openedAt),part=stockParts({sku:k.id,quantity:sealed},d);out.push({id:store.id+k.id,sku:k.id,store:store.id,packages:part.packages,whole:part.whole,remainder:round(opened.reduce((n,b)=>n+b.quantity,0))+' '+k.unit+' / '+opened.length+' 支瓶',quantity:round(lots.reduce((n,b)=>n+b.quantity,0)),available:round(lots.filter(b=>S.batchState(b,d)==='可用').reduce((n,b)=>n+S.available(b),0)),custody:round(lots.filter(b=>!!b.customerId).reduce((n,b)=>n+b.quantity,0)),unit:k.unit,loose:part.remainder})}return out}
  function usable(b,d=S.data,customerId='',treatment=''){if(!b||get('skus',b.sku,d)?.status!=='启用')return false;const k=get('skus',b.sku,d);if(b.openedAt&&!b.assignedTreatment&&(b.customerId||b.locationKind==='班次余量')&&((b.policySnapshot?.useType||k.useType)!=='经核准多次使用'||!(b.policySnapshot?.approver||k.policyApprover)))return false;const state=S.batchState(b,d);return state==='可用'||state==='客户寄存'&&!!customerId&&b.customerId===customerId||state==='治疗待用'&&!!treatment&&b.assignedTreatment===treatment}
  function bottleOptions(sku,store,customerId,d=S.data){return d.batches.filter(b=>b.sku===sku&&b.store===store&&usable(b,d,customerId)&&b.quantity>0).sort((a,b)=>Number(!!b.customerId)-Number(!!a.customerId)||Number(!!b.openedAt)-Number(!!a.openedAt)||String(a.openExpiry||a.expiry).localeCompare(String(b.openExpiry||b.expiry)))}
  function openContainer(d,b,source,code=''){
    const k=get('skus',b.sku,d);must(k.trackOpened&&!b.openedAt&&usable(b,d,b.customerId,source),'请选择启用按瓶管理的未开封库存');const capacity=factor(k.id,k.containerUnit,d);must(S.available(b)>=capacity,'未预占库存不足一整瓶 / 支');if(k.traceLevel==='单支')must(b.containerCode||code,'该物料须登记单支追溯码');const containerCode=b.containerCode||code||uid('VIAL');must(!d.batches.some(x=>x.id!==b.id&&x.quantity>0&&x.containerCode===containerCode),'容器码已使用');const now=Date.now(),expires=Math.min(Date.parse(b.expiry+'T23:59:59+08:00'),k.openHours>0?now+k.openHours*3600000:Infinity);S.movement(d,b,-capacity,'开瓶转出',source);const opened={...copy(b),id:uid('OPEN'),parent:b.id,quantity:0,reserved:0,containerCode,capacity,containerUnit:k.containerUnit,policySnapshot:{modes:copy(k.remainderModes),hours:k.openHours,basis:k.policyBasis||'',useType:k.useType||'单次使用',approver:k.policyApprover||''},openedAt:new Date(now).toISOString(),openExpiry:new Date(expires).toISOString(),source,customerId:'',custodyId:'',locationKind:'门店库存'};d.batches.push(opened);S.movement(d,opened,capacity,'开瓶转入',source);return opened;
  }
  function setRemainder(d,b,mode,r,source){const k=get('skus',b.sku,d),allowed=b.policySnapshot?.modes||k.remainderModes;must(allowed.includes(mode),'该物料不允许所选余量去向');if(['客户寄存','继续本班次使用'].includes(mode))must((b.policySnapshot?.useType||k.useType)==='经核准多次使用'&&(b.policySnapshot?.approver||k.policyApprover),'留存须具备经核准的多次使用依据及责任人');must(!b.customerId||b.customerId===r.customerId,'客户寄存仅可由原客户使用');if(mode==='合规销毁'){must(!b.reserved,'余量仍被其他单据预占');const loss={id:uid('LOSS'),batch:b.id,store:b.store,quantity:b.quantity,reason:'治疗后余量销毁',subject:'存货损失',status:'已报损',time:stamp(),cost:round(b.quantity*b.cost),source};d.losses.unshift(loss);S.movement(d,b,-b.quantity,'报损 / 治疗后余量销毁',loss.id)}else if(mode==='超时报损'){must(!b.reserved,'余量仍被其他单据预占');b.hold='待报损';b.locationKind='报损待处置';b.physicalWarehouse=b.physicalWarehouse||b.warehouse;queueLoss(d,b,source)}else if(mode==='保留治疗头'){must(['发','线','次'].includes(k.unit)&&k.category==='仪器配件','仅按次数记账的治疗头可保留寿命账户');b.locationKind='治疗头账户'}else{must((b.policySnapshot?.hours||k.openHours)>0&&(b.policySnapshot?.basis||k.policyBasis),'留存余量缺少产品依据与开封时限');if(mode==='客户寄存'){must(r.customerId&&r.customer,'请填写客户 ID 和姓名');b.customerId=r.customerId;b.locationKind='客户寄存';b.physicalWarehouse=b.physicalWarehouse||b.warehouse;let c=get('custodies',b.custodyId,d);if(!c){c={id:uid('KEEP'),batch:b.id,sku:b.sku,store:b.store,customerId:r.customerId,customer:r.customer,source,time:stamp(),status:'寄存中',notifications:[]};d.custodies.unshift(c);b.custodyId=c.id}}else{must(!b.customerId,'客户寄存余量不能转为班次公用库存');const until=Date.parse(r.shiftEnd);must(until>Date.now(),'请填写有效的本班次截止时间');b.openExpiry=new Date(Math.min(Date.parse(b.openExpiry),until)).toISOString();b.locationKind='班次余量'}}b.remainderMode=mode;updateCustody(d,b);
  }
  function updateCustody(d,b){const c=get('custodies',b.custodyId,d);if(c){c.quantity=b.quantity;c.expires=b.openExpiry;c.updated=stamp();if(!b.quantity)c.status=b.remainderMode==='合规销毁'||b.hold?'已处置':'已用完'}}
  function queueLoss(d,b,source){if(b.expiryLoss&&get('losses',b.expiryLoss,d)?.status!=='已驳回')return;const r={id:uid('LOSS'),batch:b.id,store:b.store,quantity:b.quantity,reason:'开瓶余量过期',subject:'存货损失',status:'待审批',time:stamp(),source};d.losses.unshift(r);b.expiryLoss=r.id}
  function expire(d,now=Date.now()){let changed=0;for(const b of d.batches.filter(b=>b.openedAt&&b.quantity>0&&Date.parse(b.openExpiry)<=now&&b.hold!=='待报损')){for(const c of d.consumptions.filter(c=>held(c)&&c.allocations.some(x=>x.batch===b.id))){for(const x of c.allocations){const lot=get('batches',x.batch,d);lot.reserved=round(lot.reserved-x.quantity)}c.status='已取消';c.cancelReason='预占容器开封已失效';c.cancelled=stamp()}b.hold='待报损';b.locationKind='报损待处置';b.physicalWarehouse=b.physicalWarehouse||b.warehouse;queueLoss(d,b,b.id);if(b.assignedTreatment){const t=get('treatments',b.assignedTreatment,d);if(t){const loss=get('losses',b.expiryLoss,d);loss.source=t.id;const r={id:uid('RETURN'),treatment:t.id,store:t.store,sku:b.sku,sourceBatch:b.id,batch:b.id,quantity:b.quantity,unit:get('skus',b.sku,d).unit,kind:'报损销毁',reason:'开封效期到期自动隔离',loss:loss.id,time:stamp(),status:'待销毁复核',createdBy:'SYSTEM'};d.internalReturns||=[];d.internalReturns.unshift(r);if(!t.executed&&!t.cancelled){const tray=get('trayChecks',t.traySubmitted,d);if(tray)tray.status='物料失效待重配';delete t.traySubmitted;delete t.trayApproved;t.status='缺料待补';t.shortages||=[];t.shortages.push({plan:b.planId,sku:b.sku,quantity:b.quantity,unit:get('skus',b.sku,d).unit})}b.assignedTreatment='';b.reserved=0}}const c=get('custodies',b.custodyId,d);if(c){c.status='已失效待处置';c.quantity=b.quantity;c.notificationStatus='待通知';c.expires=b.openExpiry}changed++}return changed}
  function reconcileExpiry(){if(!S.data.batches.some(b=>b.openedAt&&b.quantity>0&&Date.parse(b.openExpiry)<=Date.now()&&b.hold!=='待报损'))return false;S.transaction('开瓶余量到期锁定',d=>({id:'EXPIRY',detail:'已锁定 '+expire(d)+' 支 / 瓶，生成报损待审记录'}));return true}
  function planRows(r,d=S.data){return r.bom.lines.map((l,i)=>({line:i,sku:r.alternatives?.[i]||l.item,type:l.type,standard:round((l.baseQuantity??l.quantity)*r.times),min:round((l.baseMin??l.quantity)*r.times),max:round((l.baseMax??l.quantity)*r.times),unit:l.type==='equipment'?get('equipment',l.item,d).unit:get('skus',r.alternatives?.[i]||l.item,d).unit}))}
  function prepareConsumption(d,r,proposal){must(proposal&&Array.isArray(proposal.entries),'请按瓶 / 批次登记实际用量');r.customerId||=proposal.customerId;must(r.customerId,'请填写稳定的客户 ID');for(const a of r.allocations){const b=get('batches',a.batch,d);b.reserved=round(b.reserved-a.quantity)}const plans=planRows(r,d),allocations=[],actual=[],remainders=[],totals=new Map();for(const entry of proposal.entries){const p=plans.find(p=>p.line===Number(entry.line));must(p,'消耗明细对应的配方行无效');const q=p.type==='equipment'?Number(entry.quantity):convert(p.sku,Number(entry.quantity),entry.unit||p.unit,d,true);if(p.type==='equipment'){must(Number.isInteger(q)&&q>=0,'发数须为非负整数');must(!actual.some(a=>a.line===p.line),'仪器行不能重复');actual.push({...copy(entry),quantity:q,unit:p.unit,sku:p.sku});totals.set(p.line,q);continue}checkQuantity(p.sku,q,d,true);if(q===0){actual.push({...copy(entry),quantity:0,unit:p.unit,sku:p.sku});totals.set(p.line,totals.get(p.line)||0);continue}let b=get('batches',entry.batch,d),k=get('skus',p.sku,d);must(b&&b.sku===p.sku&&b.store===r.store&&usable(b,d,r.customerId),'所选瓶 / 批次不可用或不属于此客户');if(k.trackOpened&&!b.openedAt)b=openContainer(d,b,r.id,entry.containerCode);must(!allocations.some(a=>a.batch===b.id),'同一瓶 / 批次请合并登记');must(q<=S.available(b),'实际用量超过当前可用余量');if(k.trackOpened)must(q<=b.capacity||!b.capacity,'用量超过单瓶容量');const a={batch:b.id,sku:k.id,quantity:q,cost:b.cost,unit:k.unit,businessUnit:entry.unit||k.unit,businessQuantity:entry.quantity,conversion:snapshot(k.id,entry.quantity,entry.unit||k.unit,d),containerCode:b.containerCode||'',line:p.line};allocations.push(a);b.reserved=round(b.reserved+q);actual.push({...copy(entry),...a});totals.set(p.line,round((totals.get(p.line)||0)+q));if(k.trackOpened&&b.quantity>q){must(entry.mode,'请选择余量去向');must(!b.customerId||entry.mode!=='继续本班次使用','客户寄存库存不得转供其他客户');remainders.push({batch:b.id,mode:entry.mode,shiftEnd:entry.shiftEnd})}}
    must(plans.every(p=>totals.has(p.line)),'每一项 BOM 用料和仪器均须登记实际数量');const deviations=plans.filter(p=>totals.get(p.line)<p.min||totals.get(p.line)>p.max).map(p=>({...p,actual:totals.get(p.line)}));if(deviations.length)must(proposal.reason?.trim(),'实际用量超出 BOM 范围，请填写偏差原因');r.allocations=allocations;r.shots=plans.filter(p=>p.type==='equipment').map(p=>({equipment:p.sku,quantity:totals.get(p.line)}));r.actualEntries=actual;r.actualTotals=plans.map(p=>({...p,actual:totals.get(p.line)}));r.remainders=remainders;r.deviations=deviations;r.actualReason=proposal.reason||'';S.guardClinical(d,allocations,r);return deviations;
  }
  function applyRemainders(d,r){for(const x of r.remainders||[]){const b=get('batches',x.batch,d);if(b.quantity)setRemainder(d,b,x.mode,{...r,shiftEnd:x.shiftEnd},r.id)}for(const a of r.allocations)updateCustody(d,get('batches',a.batch,d));r.disposalCost=round(d.losses.filter(l=>l.source===r.id&&l.status==='已报损').reduce((n,l)=>n+l.cost,0))}
  function submitConsumption(id,proposal){reconcileExpiry();const probe=copy(S.data),r=get('consumptions',id,probe);must(r?.status==='已预占','此单已处理');const deviations=prepareConsumption(probe,r,proposal);/* Validate all remainder policies before requesting approval or touching stock. */for(const x of r.allocations){const b=get('batches',x.batch,probe);b.quantity=round(b.quantity-x.quantity);b.reserved=round(b.reserved-x.quantity)}applyRemainders(probe,r);if(deviations.length)return S.transaction('提交实际用量偏差审批',d=>{const c=get('consumptions',id,d);c.customerId||=proposal.customerId;c.actualProposal=copy(proposal);c.deviations=deviations;c.status='待偏差审批';return c});return S.consumeAction(id,'confirm',proposal)}
  function approveConsumption(id,review){must(review.reviewer&&review.note?.trim(),'请填写审核人和审核意见');return S.consumeAction(id,'confirm',null,review)}
  function registerCount(id,r){return S.transaction('提交双单位盘点',d=>{const c=get('counts',id,d),b=get('batches',c?.batch,d),k=get('skus',b?.sku,d);must(c?.status==='待盘点','任务已处理');must(Number.isInteger(r.whole)&&r.whole>=0&&Number.isFinite(r.remainder)&&r.remainder>=0,'整件数须为非负整数，零量须为非负数');const f=factor(k.id,r.stockUnit,d);must(r.remainder<f,'零量须小于一个库存单位');const actual=checkQuantity(k.id,round(r.whole*f+r.remainder),d,true),difference=round(actual-b.quantity);if(difference)must(r.note?.trim(),'请填写盘点差异原因');Object.assign(c,r,{book:b.quantity,countedAt:stamp(),movementIds:d.movements.filter(x=>x.batch===b.id).map(x=>x.id),actual,difference,stockFactor:f,unit:k.unit,splitReview:!!difference&&(!!b.openedAt||Math.abs(difference)%f!==0),status:'待审核'});return c})}
  function notifyCustody(id,r){return S.transaction('登记寄存客户通知',d=>{const c=get('custodies',id,d);must(c&&r.result?.trim()&&r.person,'请填写通知结果和经办人');c.notifications.push({...copy(r),time:stamp()});c.notificationStatus='已记录';c.disposition=r.disposition||'';return c})}
  function initialize(){if(S.data.unitSchema===2)return;S.transaction('升级单位与开瓶管理',d=>{d.custodies||=[];if(get('skus','SKU02',d)?.name==='艾莉薇玻尿酸 1ml'&&!d.units.some(u=>u.sku==='SKU02'))d.units.push({id:uid('U'),sku:'SKU02',name:'支',target:'ml',factor:1});for(const k of d.skus){const known=d.units.filter(u=>u.sku===k.id).map(u=>u.name);k.splitAllowed=['ml','g'].includes(k.unit)||known.length>0;k.step=['ml','g'].includes(k.unit)?.1:1;k.trackOpened=['ml','g'].includes(k.unit);k.purchaseUnit=known.includes('箱')?'箱':known.includes('盒')?'盒':known.includes('支')?'支':k.unit;k.stockUnit=known.includes('支')?'支':known.includes('盒')?'盒':k.unit;k.salesUnit=k.stockUnit;k.consumptionUnit=k.unit;k.containerUnit=k.trackOpened?k.stockUnit:'';k.remainderModes=['合规销毁'];k.policyBasis='';k.traceLevel='批次'}for(const u of d.units){u.target||=get('skus',u.sku,d).unit;u.isDefault||=false;u.allowSplit=get('skus',u.sku,d).splitAllowed}
      /* Convert the known seed chain without changing any factor or inventory quantity. */
      for(const [id,target,n] of [['U05','支',1],['U06','盒',10]]){const u=get('units',id,d);if(u?.sku==='SKU05'&&factor(u.sku,u.name,d)===(id==='U05'?2.5:25)){u.target=target;u.factor=n}}
      const add=(id,name,unit,chain,extra={})=>{if(get('skus',id,d))return;const k={...copy(d.skus[3]),id,name,unit,brand:extra.brand||'OF',category:extra.category||'项目耗材',cost:0,low:10,high:300,cold:false,doctor:false,udiRequired:false,registration:'',controlled:false,gift:false,splitAllowed:true,step:['ml','g'].includes(unit)?.1:1,trackOpened:['ml','g','发'].includes(unit),remainderModes:['合规销毁'],openHours:0,policyBasis:'',traceLevel:'批次',purchaseUnit:'',stockUnit:'',salesUnit:'',consumptionUnit:unit,containerUnit:'',...extra};d.skus.push(k);for(const [source,target,n]of chain)d.units.push({id:uid('U'),sku:id,name:source,target,factor:n,isDefault:source===k.purchaseUnit,allowSplit:true});k.purchaseUnit||=chain.at(-1)?.[0]||unit;k.stockUnit||=chain[0]?.[0]||unit;k.salesUnit||=k.stockUnit;k.consumptionUnit=unit;k.containerUnit||=k.trackOpened?k.stockUnit:''};
      add('SKU-RZ2','润致 2号 1ml（单位示例）','ml',[['支','ml',1],['件','支',20]],{brand:'润致',category:'针剂药品',doctor:true});
      add('SKU-DEP-ML','DEP 水光 2ml（拆零独立 SKU）','ml',[['支','ml',2]],{brand:'DEP'});
      add('SKU-OF-BOX','OF 生物膜敷料标准装（5片）','片',[['盒','片',5],['箱','盒',50]],{brand:'OF',category:'居家正装'});
      add('SKU-OF-PROMO','OF 生物膜敷料促销装（6片）','片',[['盒','片',6]],{brand:'OF',category:'居家正装'});
      add('SKU-OF-SAMPLE','OF 生物膜敷料试用装（单片）','片',[],{brand:'OF',category:'居家小样',gift:true});
      add('SKU-LIDO','利多卡因乳膏（待配置每支克数）','g',[],{brand:'待维护',category:'针剂药品',doctor:true,trackOpened:false,status:'停用'});
      add('SKU-HEAD-300','超声炮治疗头（300发示例）','发',[['个','发',300]],{brand:'待维护',category:'仪器配件',trackOpened:true,remainderModes:['保留治疗头','合规销毁']});
      for(const b of d.boms)normalizeBom(b,d);for(const c of d.consumptions){if(c.bom)normalizeBom(c.bom,d);c.customerId||=(c.customer||'').match(/HY\d+/)?.[0]||''}for(const p of d.purchases)p.conversion||=snapshot(p.sku,p.quantity,p.unit,d);
      for(const b of d.batches){const k=get('skus',b.sku,d);b.stockSnapshot||={unit:k.stockUnit,factor:factor(k.id,k.stockUnit,d)};if(b.openedAt){b.containerCode||=uid('LEGACY');b.capacity||=Math.max(b.quantity,factor(k.id,k.containerUnit||k.unit,d));b.containerUnit||=k.containerUnit;b.policySnapshot||={modes:copy(k.remainderModes),hours:k.openHours,basis:k.policyBasis};b.locationKind||='门店库存'}}
      for(const store of d.stores)for(const [suffix,name]of [['CUSTODY','客户寄存虚拟库位'],['EXPIRED','报损待处置库位']])if(!get('warehouses',store.id+'-'+suffix,d))d.warehouses.push({id:store.id+'-'+suffix,name:store.name+' · '+name,store:store.id,type:'虚拟库位',category:'全部类型',status:'启用'});d.unitSchema=2;return {id:'unit-schema-2'}})}
  Object.assign(S,{unitFactor:factor,unitsFor,checkQuantity,convertUnits:convert,unitSnapshot:snapshot,validateUnit,validateSku,normalizeBom,stockParts,stockBalances,usable,bottleOptions,openContainer,setRemainder,updateCustody,expire,reconcileExpiry,planRows,prepareConsumption,applyRemainders,submitConsumption,approveConsumption,registerCount,notifyCustody,held,remainderModes:modes});S.ready=S.ready.then(async()=>{initialize();reconcileExpiry()});
})();

;
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

;
/* Receipt, transfer and settlement documents retain their business-unit snapshots. */
(() => {
  const S=PCModules['supply-chain'],{get,must,positive,round,copy,uid}=S;
  const rec=(prefix,r,d)=>({id:uid(prefix),...copy(r),createdBy:S.actor(d).id,time:S.stamp()});
  const purchaseLines=p=>p.lines||[{id:p.id+'-1',sku:p.sku,quantity:p.quantity,unit:p.unit,price:p.price,amount:p.amount,conversion:p.conversion,received:p.receivedQuantity??(p.status==='已入库'?p.quantity:0)}];
  function supplierAllowed(supplier,sku,d=S.data){
    const s=get('suppliers',supplier,d),k=get('skus',sku,d);must(s&&s.status==='启用','供应商不可用');must(k&&k.status==='启用','采购物料已停用');
    const credential=k.regulation==='药品'?'药品经营许可证':k.regulation==='械字号'?'医疗器械经营许可证':'营业执照';
    must(d.credentials.some(c=>c.supplier===supplier&&c.name===credential&&c.status==='有效'&&c.expiry>=S.today()),s.name+'缺少有效的'+credential);
    must(d.firstReviews.some(r=>r.supplier===supplier&&r.kind==='首营企业'&&r.status==='已通过'),'供应商首营企业审核未通过');
    must(d.firstReviews.some(r=>r.supplier===supplier&&r.kind==='首营品种'&&r.sku===sku&&r.status==='已通过'),k.name+'尚未完成该供应商的首营品种审核');
  }
  function savePurchase(m){return S.transaction('采购订单提交',d=>{
    S.requirePermission('采购',m.store,d);must(get('stores',m.store,d)?.status==='启用','收货机构不可用');must(m.lines?.length,'至少添加一项采购物料');
    const previous=get('purchases',m.id,d);if(previous){must(['待审批','已驳回'].includes(previous.status),'审核后请通过关闭剩余量或采购变更处理');must(previous.status==='已驳回'||!previous.approvalRun?.history.length,'已经进入逐级审核，请先驳回后修改重提')}
    const lines=m.lines.map((l,i)=>{supplierAllowed(m.supplier,l.sku,d);const conversion=S.unitSnapshot(l.sku,Number(l.quantity),l.unit,d);must(Number.isFinite(l.price)&&l.price>=0,'采购单价无效');return {...copy(l),id:l.id||'LINE-'+i,quantity:Number(l.quantity),price:Number(l.price),conversion,amount:round(l.quantity*l.price),received:0}});
    const r={...rec('PO',m,d),id:previous?.id||uid('PO'),lines,sku:lines[0].sku,quantity:lines.reduce((n,l)=>n+l.quantity,0),unit:lines.length===1?lines[0].unit:'多明细',price:lines[0].price,amount:round(lines.reduce((n,l)=>n+l.amount,0)),receivedAmount:0,status:'待审批'};
    delete r.approvalRun;if(m.application){const a=get('applications',m.application,d);must(a?.status==='已通过'&&!a.purchase,'采购申请已转单或未通过审核');a.purchase=r.id;a.status='已转采购'}
    if(previous)d.purchases[d.purchases.findIndex(x=>x.id===r.id)]=r;else d.purchases.unshift(r);return r;
  })}
  function approvePurchase(id,approved,note){return S.transaction('采购订单审核',d=>{
    const p=get('purchases',id,d);must(p?.status==='待审批','订单已处理');const a=S.differentReviewer(p.createdBy,'采购审批',p.store,d);must(note?.trim(),'请填写审核意见');
    if(approved)for(const l of purchaseLines(p))supplierAllowed(p.supplier,l.sku,d);
    p.status=approved?'待收货':'已驳回';p.approval={actor:a.id,note,time:S.stamp()};return p;
  })}
  function receivePurchase(id,m){return S.transaction('采购验收入库',d=>{
    const p=get('purchases',id,d);S.requirePermission('采购',p?.store,d);must(p&&['待收货','部分入库'].includes(p.status),'订单不在可收货状态');must(m.deliveryNo?.trim(),'请填写送货单号');must(!d.purchaseReceipts.some(r=>r.purchase===id&&r.deliveryNo===m.deliveryNo.trim()),'本采购单该送货凭据已验收，请勿重复入库');
    p.lines||=purchaseLines(p);const lines=m.lines||[{...m,line:p.lines[0].id,unit:p.lines[0].unit}],receipt=rec('RECEIPT',{purchase:id,store:p.store,supplier:p.supplier,deliveryNo:m.deliveryNo,invoiceNo:m.invoiceNo||'',invoiceAmount:m.invoiceAmount===''||m.invoiceAmount==null?null:Number(m.invoiceAmount),lines:[],status:'已验收'},d);
    must(lines.length,'至少登记一个到货批次');let amount=0;
    for(const row of lines){
      const l=p.lines.find(x=>x.id===row.line);must(l,'采购明细不存在');supplierAllowed(p.supplier,l.sku,d);
      const k=get('skus',l.sku,d),f=l.conversion?.factor||S.unitFactor(l.sku,l.unit,d),quantity=S.convertUnits(l.sku,Number(row.quantity),row.unit||l.unit,d,true),delivered=S.convertUnits(l.sku,Number(row.delivered??row.quantity),row.unit||l.unit,d,true);
      must(quantity<=delivered,'合格接收量不能大于送达量');must(quantity<=round((l.quantity-(l.received||0))*f),'累计入库量超过订单剩余量');
      if(delivered!==quantity)must(row.reason?.trim(),'请填写短少、拒收或差异原因');
      must(row.batch?.trim()&&row.produced&&row.expiry&&row.produced<=S.today()&&row.expiry>=S.today()&&row.expiry>row.produced,'请核对生产批号及日期');
      const zone=S.zoneAccepts(row.warehouse,k.id,p.store,d),codes=String(row.codes||row.unitCodes||'').split(/\s+/).filter(Boolean),capacity=S.unitFactor(k.id,k.containerUnit||k.stockUnit||k.unit,d);
      if(k.udiRequired)must(k.traceLevel==='单支'?codes.length:row.udi,'须登记相应追溯码');
      if(k.traceLevel==='单支'){must(Number.isInteger(quantity/capacity)&&codes.length===quantity/capacity&&new Set(codes).size===codes.length,'单支追溯码数量须与本次接收支数一致');must(codes.every(c=>!d.udi.some(u=>u.code===c)),'追溯码已入库')}
      if(k.cold)must(row.temperature!==''&&row.temperature!=null&&Number.isFinite(Number(row.temperature)),'冷链到货须登记交接温度');
      let quality=row.quality||'合格';if(k.cold&&(row.temperature<k.temperatureMin||row.temperature>k.temperatureMax))quality='待确认';
      const current={...copy(row),sku:k.id,unit:row.unit||l.unit,baseQuantity:quantity,baseDelivered:delivered,baseUnit:k.unit,cost:l.price/f,amount:round(quantity*l.price/f),batches:[],quality};amount+=current.amount;
      if(quantity>0)for(const code of k.traceLevel==='单支'?codes:['']){
        const b={id:uid('LOT'),sku:k.id,store:p.store,warehouse:zone.id,physicalWarehouse:zone.id,batch:row.batch,produced:row.produced,expiry:row.expiry,quantity:0,reserved:0,cost:l.price/f,supplier:p.supplier,quality,udi:code||row.udi||'',containerCode:code,source:p.id,purchase:p.id,purchaseLine:l.id,receipt:receipt.id,stockSnapshot:{unit:k.stockUnit,factor:S.unitFactor(k.id,k.stockUnit,d)}};
        b.traceRoot=b.id;d.batches.push(b);S.movement(d,b,k.traceLevel==='单支'?capacity:quantity,'采购入库',receipt.id);current.batches.push(b.id);
        if(b.udi)d.udi.push({id:uid('UDI'),sku:k.id,batch:b.id,code:b.udi,parentCode:row.boxCode||'',status:'在库'});
      }
      l.received=round((l.received||0)+quantity/f);receipt.lines.push(current);
    }
    receipt.amount=round(amount);receipt.match=receipt.invoiceAmount==null?'待到票':receipt.invoiceAmount===receipt.amount?'三单一致':'金额待核对';
    d.purchaseReceipts.unshift(receipt);p.receivedAmount=round((p.receivedAmount||0)+receipt.amount);p.receivedAt=S.stamp();p.status=p.lines.every(l=>l.received>=l.quantity)?'已入库':'部分入库';p.receiptIds||=[];p.receiptIds.push(receipt.id);return receipt;
  })}
  function closePurchase(id,note){return S.transaction('采购关闭剩余量',d=>{const p=get('purchases',id,d);S.requirePermission('采购审批',p?.store,d);must(p&&['待收货','部分入库'].includes(p.status),'当前订单不能关闭剩余量');must(note?.trim(),'请填写关闭原因');p.closedRemaining=purchaseLines(p).map(l=>({line:l.id,quantity:round(l.quantity-(l.received||0)),unit:l.unit}));p.status='已关闭';p.closeNote=note;p.closedAt=S.stamp();return p})}
  function purchaseOrigin(id,d=S.data){const b=get('batches',id,d);if(!b)return '';return b.purchase||(get('purchases',b.source,d)?b.source:'')||get('batches',b.traceRoot,d)?.purchase||get('batches',b.traceRoot,d)?.source||''}
  function confirmPurchaseReturn(id,m){return S.transaction('采购退货确认',d=>{
    const r=get('purchaseReturns',id,d),b=get('batches',r?.batch,d);must(r?.status==='待审批','退货已处理');const a=S.differentReviewer(r.createdBy,'采购审批',b?.store,d);
    must(m.note?.trim()&&m.voucher?.trim(),'请填写供应商退货确认号和处理意见');must(b&&!b.openedAt&&!b.assignedTreatment&&S.available(b)>=r.quantity,'仅可退回未开封、未占用实物');
    must(purchaseOrigin(b.id,d)===r.purchase,'批次与原采购来源不匹配');S.movement(d,b,-r.quantity,'采购退货',r.id);
    r.amount=round(r.quantity*b.cost);r.status='已退货';r.supplierConfirmation=m.voucher;r.note=m.note;r.reviewer=a.id;r.confirmedAt=S.stamp();return r;
  })}
  function saveReconciliation(m){return S.transaction('采购对账单确认',d=>{
    S.requirePermission('财务',null,d);must(m.orders?.length&&m.supplier&&m.start&&m.end&&m.start<=m.end,'请填写供应商、期间及采购单');must(m.statement?.trim(),'请填写供应商对账凭据');
    const at=(id,date)=>{const p=get('purchases',id,d),before=value=>(value||'9999').slice(0,10)<=date;const receipts=d.purchaseReceipts.filter(r=>r.purchase===id),received=receipts.length?receipts.filter(r=>before(r.time)).reduce((n,r)=>n+r.amount,0):before(p.receivedAt)?(p.receivedAmount??(p.status==='已入库'?p.amount:0)):0;const returns=d.purchaseReturns.filter(r=>r.purchase===id&&r.status==='已退货'&&before(r.confirmedAt||r.time)).reduce((n,r)=>n+(r.amount??r.quantity*(get('batches',r.batch,d)?.cost||0)),0),paid=(d.paymentEntries||[]).filter(r=>r.purchase===id&&before(r.date||r.time)).reduce((n,r)=>n+r.amount,0);return {received:round(received),returns:round(returns),paid:round(paid),balance:round(received-returns-paid)}};
    const previousDay=new Date(Date.parse(m.start+'T00:00:00Z')-86400000).toISOString().slice(0,10);
    const lines=[...new Set(m.orders)].map(id=>{const p=get('purchases',id,d);must(p&&p.supplier===m.supplier,'对账采购单不属于该供应商');const opening=at(id,previousDay),closing=at(id,m.end);return {purchase:id,opening:opening.balance,...closing,receivedDuring:round(closing.received-opening.received),returnedDuring:round(closing.returns-opening.returns),paidDuring:round(closing.paid-opening.paid)}});
    const amount=round(lines.reduce((n,l)=>n+l.balance,0));must(Number.isFinite(m.supplierAmount),'请填写供应商确认金额');const difference=round(m.supplierAmount-amount);if(difference)must(m.reason?.trim(),'账款有差异，须登记处理原因');
    const r=rec('RECON',{...m,lines,amount,difference,status:difference?'差异待处理':'已对账'},d);d.purchaseReconciliations.unshift(r);return r;
  })}
  function recordPayment(id,m){return S.transaction('付款登记核销',d=>{
    const p=get('payments',id,d);S.requirePermission('财务',null,d);must(p?.status==='待付款','付款申请不可重复登记');must(m.voucher?.trim()&&m.paidAt,'请填写实际付款凭据及日期');const balance=S.purchaseBalance(p.purchase,d);must(p.amount<=balance.balance,'当前应付不足，请先核对退货或已有付款');p.status='已付款';p.payment={...copy(m),actor:S.actor(d).id};return p;
  })}
  function createTransfer(m){return S.transaction('调拨申请',d=>{
    const b=get('batches',m.batch,d);S.requirePermission('调拨',b?.store,d);must(b&&S.batchState(b,d)==='可用'&&!b.openedAt&&!b.assignedTreatment,'请选择未开封可用库存');must(m.to!==b.store&&get('stores',m.to,d)?.status==='启用','请选择其他有效接收机构');
    const conversion=S.unitSnapshot(b.sku,m.sendQuantity,m.sendUnit,d);must(conversion.baseQuantity<=S.available(b),'调拨数量超过可用库存');const r=rec('TRANSFER',{...m,sku:b.sku,from:b.store,quantity:conversion.baseQuantity,sendConversion:conversion,status:'待审批',mode:b.store==='WH'?'总仓 → 门店':m.to==='WH'?'门店 → 总仓':'门店间平级'},d);d.transfers.unshift(r);return r;
  })}
  function transferAction(id,action,m={}){return S.transaction('调拨 / '+action,d=>{
    const t=get('transfers',id,d),b=get('batches',t?.batch,d),k=get('skus',b?.sku,d);must(t&&b,'调拨单不存在');
    if(action==='approve'){S.differentReviewer(t.createdBy,'调拨审批',t.from,d);must(t.status==='待审批'&&S.batchState(b,d)==='可用'&&S.available(b)>=t.quantity,'调拨状态或可用库存已变化');b.reserved=round(b.reserved+t.quantity);t.reserved=t.quantity;t.status='待发货'}
    else if(action==='deny'){S.requirePermission('调拨审批',t.from,d);must(t.status==='待审批','状态已变化');t.status='已驳回';t.reviewNote=m.reason||''}
    else if(action==='ship'){S.requirePermission('调拨',t.from,d);must(t.status==='待发货'&&S.batchState(b,d)==='可用','当前批次不能发货');if(k.cold)must(m.temperature!==''&&m.temperature!=null&&Number.isFinite(Number(m.temperature))&&m.temperature>=k.temperatureMin&&m.temperature<=k.temperatureMax,'冷链发货须记录符合该商品温区的交接温度');if(!t.reserved){must(S.available(b)>=t.quantity,'库存不足');b.reserved+=t.quantity;t.reserved=t.quantity}must(b.reserved>=t.quantity,'预占库存异常');b.reserved=round(b.reserved-t.quantity);t.reserved=0;S.movement(d,b,-t.quantity,'调拨发货',t.id);t.status='在途';t.shipped=S.stamp();t.transitRemaining=t.quantity;t.transport={carrier:m.carrier||'',voucher:m.voucher||'',temperature:m.temperature??null}}
    else if(action==='receive'){
      S.requirePermission('调拨',t.to,d);must(['在途','部分收货'].includes(t.status),'该单不在收货阶段');const remaining=t.transitRemaining??t.quantity,unit=m.receiveUnit||k.stockUnit,received=S.convertUnits(k.id,Number(m.receiveQuantity),unit,d,true),damaged=S.convertUnits(k.id,Number(m.damaged||0),unit,d,true),missing=S.convertUnits(k.id,Number(m.missing||0),unit,d,true);
      must(received+damaged+missing>0&&received+damaged+missing<=remaining,'本次收货及差异量超出在途余额');if(damaged||missing)must(m.reason?.trim(),'请登记差异原因及责任处理');
      if(k.cold)must(m.temperature!==''&&m.temperature!=null&&Number.isFinite(Number(m.temperature)),'请登记冷链收货温度');const z=S.zoneAccepts(m.warehouse,k.id,t.to,d);
      for(const [q,quality]of [[received,'合格'],[damaged,'待确认']])if(q){
        const dest={...copy(b),id:uid('LOT'),store:t.to,warehouse:z.id,physicalWarehouse:z.id,quantity:0,reserved:0,source:t.id,quality,hold:'',transfer:t.id};
        if(S.daysLeft(dest)<0)dest.quality='待确认';if(k.cold&&(m.temperature<k.temperatureMin||m.temperature>k.temperatureMax))dest.quality='待确认';
        if(d.recalls.some(r=>r.status==='执行中'&&get('batches',r.batch,d)?.sku===dest.sku&&get('batches',r.batch,d)?.batch===dest.batch))dest.quality='召回锁定';d.batches.push(dest);S.movement(d,dest,q,'调拨收货',t.id);
      }
      t.receipts||=[];t.receipts.push({...copy(m),received,damaged,missing,time:S.stamp(),actor:S.actor(d).id});t.receivedQuantity=round((t.receivedQuantity||0)+received+damaged);t.receiveQuantity=round(t.receivedQuantity/S.unitFactor(k.id,unit,d));t.receiveUnit=unit;
      t.transitRemaining=round(remaining-received-damaged);t.pendingDifference=round((t.pendingDifference||0)+missing);
      t.status=t.pendingDifference?'差异待处理':t.transitRemaining?'部分收货':'已收货';if(!t.transitRemaining)t.received=S.stamp();
    }else if(action==='resolve'){
      const a=S.differentReviewer(t.createdBy,'调拨审批',t.from,d);must(t.status==='差异待处理'&&t.pendingDifference>0,'没有待处理短少');must(m.reason?.trim()&&m.responsible?.trim(),'请填写差异认定及责任方');
      const q=t.pendingDifference;t.differenceResolution={...copy(m),quantity:q,reviewer:a.id,time:S.stamp()};
      if(m.result==='确认运输损失'){t.transitRemaining=round(t.transitRemaining-q);d.losses.unshift(rec('LOSS',{batch:b.id,store:t.from,quantity:q,cost:round(q*b.cost),reason:'运输短少',subject:'存货损失',status:'已报损',source:t.id,inTransit:true},d));d.movements.unshift({id:uid('IO'),sku:b.sku,batch:b.id,batchNo:b.batch,store:t.from,quantity:-q,balance:null,unit:k.unit,cost:round(q*b.cost),kind:'在途损耗',source:t.id,time:S.stamp(),transit:true})}
      t.pendingDifference=0;t.status=t.transitRemaining?'部分收货':'已收货';if(!t.transitRemaining)t.received=S.stamp();
    }else if(action==='reject'){S.requirePermission('调拨',t.to,d);must(['在途','部分收货'].includes(t.status),'不可拒收');must(m.reason?.trim(),'请填写拒收原因');t.status='退回在途';t.rejectReason=m.reason}
    else if(action==='return'){S.requirePermission('调拨',t.from,d);must(t.status==='退回在途','该单不在退回阶段');const q=t.transitRemaining??t.quantity;const dest={...copy(b),id:uid('LOT'),quantity:0,reserved:0,source:t.id,quality:'待确认'};d.batches.push(dest);S.movement(d,dest,q,'调拨退回',t.id);t.transitRemaining=0;t.status='已退回';t.returned=S.stamp()}
    return t;
  })}
  function sellCard(m){return S.transaction('售卡预收',d=>{
    S.requirePermission('财务',m.store,d);const card=get('cards',m.card,d),patient=get('patients',m.customerId,d),store=get('stores',m.store,d);
    must(card&&card.status==='已上架'&&card.contents.length,'卡项尚未上架或未配置权益');must(patient&&patient.status==='启用','请关联患者 ID');must(store&&['全部门店',store.id,store.brand].includes(card.scope),'本机构不能售此卡');
    const total=card.contents.reduce((n,l)=>n+l.times*(get('specs',l.spec,d)?.price||0),0),times=card.contents.reduce((n,l)=>n+l.times,0);
    const cs=rec('CS',{...m,customer:patient.name,amount:card.price,remaining:copy(card.contents),initialTimes:times,recognized:0,refunded:0,sold:S.today(),expires:S.day(card.days),status:'有效',cardSnapshot:copy(card),unitValues:Object.fromEntries(card.contents.map(l=>[l.spec,card.allocation==='按次数平均'||!total?round(card.price/times):round(card.price*get('specs',l.spec,d).price/total)]))},d);d.cardSales.unshift(cs);return cs;
  })}
  function cardEvent(id,m){return S.transaction('卡权益 / '+m.kind,d=>{
    const cs=get('cardSales',id,d);S.requirePermission('财务',cs?.store,d);must(cs&&m.reason?.trim(),'请填写处理依据');must(!d.treatments.some(t=>!['已关闭','已取消'].includes(t.status)&&t.items.some(i=>i.cardSale===id))&&!d.consumptions.some(c=>c.cardSale===id&&['已预占','待偏差审批'].includes(c.status)),'该卡存在未完成治疗，请先处理治疗及预占');
    if(m.kind==='冻结'){must(cs.status==='有效','卡状态不支持冻结');cs.status='已冻结'}else if(m.kind==='解冻'){must(cs.status==='已冻结','该卡未冻结');cs.status='有效'}
    else if(m.kind==='延期'){must(m.expires>cs.expires,'新有效期须晚于原有效期');cs.expires=m.expires}
    else if(m.kind==='授权代用'){must(get('patients',m.patient,d)?.status==='启用'&&m.patient!==cs.customerId,'请选择有效的代用患者');cs.authorizedPatients||=[];if(!cs.authorizedPatients.includes(m.patient))cs.authorizedPatients.push(m.patient)}
    else if(m.kind==='退还剩余权益'){must(m.voucher?.trim(),'请填写原系统退款处理凭据');const refund=round(cs.amount-cs.recognized-(cs.refunded||0));must(refund>=0,'卡余额异常');m.amount=refund;cs.refunded=round((cs.refunded||0)+refund);cs.remaining.forEach(x=>x.times=0);cs.status='已退款'}
    else must(false,'权益处理类型无效');
    const e=rec('CARD-EVENT',{...m,cardSale:id,store:cs.store,status:'已登记'},d);d.cardEvents.unshift(e);return e;
  })}
  Object.assign(S,{purchaseLines,supplierAllowed,savePurchase,approvePurchase,purchaseReceive:receivePurchase,closePurchase,purchaseOrigin,confirmPurchaseReturn,saveReconciliation,recordPayment,createTransfer,transferAction,sellCard,cardEvent});
})();

;
/* Inventory assurance documents keep physical findings separate from their review. */
(() => {
 const S=PCModules['supply-chain'],{get,must,copy,uid,round}=S;
 const record=(prefix,r)=>({id:uid(prefix),...copy(r),createdBy:S.actor().id,time:S.stamp()});
 function countPlan(m){return S.transaction('盘点计划下发',d=>{
  S.requirePermission('盘点',m.store,d);must(m.name?.trim()&&m.person&&m.date&&m.batches?.length,'请选择盘点机构、范围、盘点人及日期');must(get('staff',m.person,d)?.status==='启用','盘点人不可用');
  const p=record('COUNT-PLAN',{...m,status:'执行中',tasks:[]});
  for(const id of new Set(m.batches)){const b=get('batches',id,d),k=get('skus',b?.sku,d);must(b?.store===m.store,'盘点批次必须属于本机构');must(!d.counts.some(c=>c.batch===id&&['待盘点','待审核'].includes(c.status)),'范围内有未完成的盘点任务');const c=record('COUNT',{plan:p.id,name:m.name,kind:m.kind,batch:id,store:b.store,person:m.person,date:m.date,book:b.quantity,cutoff:S.stamp(),movementIds:d.movements.filter(x=>x.batch===id).map(x=>x.id),unit:k.unit,stockUnit:k.stockUnit,stockFactor:S.unitFactor(k.id,k.stockUnit,d),status:'待盘点'});d.counts.unshift(c);p.tasks.push(c.id)}
  d.countPlans.unshift(p);return p;
 })}
 const register=S.registerCount;
 S.registerCount=(id,r)=>{const c=get('counts',id);S.requirePermission('盘点',c?.store);must(S.actor().id===c.person,'请由任务指定盘点人登记');const result=register(id,r);return result};
 const approve=S.approveCount;
 S.approveCount=(id,r={})=>{const c=get('counts',id);const a=S.differentReviewer(c?.person,'盘点',c?.store);must(r.note?.trim(),'请填写盘点复核意见');return approve(id,{...r,reviewer:a.id})};
 function opening(m){return S.transaction('期初库存 / 发现实物建账',d=>{
  S.requirePermission('盘点',m.store,d);must(m.reason?.trim()&&m.batch&&m.produced&&m.expiry&&m.expiry>m.produced,'请记录批次效期及来源依据');const k=get('skus',m.sku,d);must(k&&k.status==='启用','物料不可用');S.zoneAccepts(m.warehouse,k.id,m.store,d);const conversion=S.unitSnapshot(k.id,m.quantity,m.unit,d);must(Number.isFinite(m.cost)&&m.cost>=0,'基本单位成本无效');if(k.udiRequired)must(m.udi?.trim(),'请登记追溯码');if(k.traceLevel==='单支')must(conversion.baseQuantity===S.unitFactor(k.id,k.containerUnit,d),'单支追溯物料须逐支建账');
  const r=record('OPENING',{...m,conversion,status:'待复核'});d.openingStocks.unshift(r);return r;
 })}
 function approveOpening(id,m){return S.transaction('期初盘盈实物复核',d=>{
  const r=get('openingStocks',id,d);must(r?.status==='待复核','建账申请已处理');const a=S.differentReviewer(r.createdBy,'盘点',r.store,d);must(m.note?.trim(),'请填写复核依据');
  if(m.result==='驳回'){r.status='已驳回';r.reviewNote=m.note;return r}
  const k=get('skus',r.sku,d);S.zoneAccepts(r.warehouse,k.id,r.store,d);if(r.udi)must(!d.udi.some(u=>u.code===r.udi),'追溯码已入账');
  const b={...copy(r),id:uid('LOT'),quantity:0,reserved:0,physicalWarehouse:r.warehouse,quality:'待确认',source:r.id,containerCode:k.traceLevel==='单支'?r.udi:'',traceRoot:''};b.traceRoot=b.id;d.batches.push(b);S.movement(d,b,r.conversion.baseQuantity,r.kind==='期初建账'?'期初建账':'发现实物盘盈',r.id);if(r.udi)d.udi.push({id:uid('UDI'),sku:r.sku,batch:b.id,code:r.udi,status:'在库'});r.status='已建账待质检';r.stockBatch=b.id;r.reviewer=a.id;r.reviewNote=m.note;return r;
 })}
 function receiptInvoice(id,m){return S.transaction('采购验收票据核对',d=>{const r=get('purchaseReceipts',id,d);S.requirePermission('财务',r?.store,d);must(r&&m.invoiceNo?.trim()&&Number.isFinite(m.invoiceAmount)&&m.invoiceAmount>=0&&m.note?.trim(),'请填写发票及核对依据');r.invoiceHistory||=[];r.invoiceHistory.push({invoiceNo:r.invoiceNo,invoiceAmount:r.invoiceAmount,match:r.match,time:S.stamp()});Object.assign(r,m);r.match=m.invoiceAmount===r.amount?'三单一致':'金额待核对';r.invoiceReviewer=S.actor(d).id;return r})}
 function saleReturn(m){return S.transaction('销售退货入库',d=>{
  const source=get('retail',m.source,d);S.requirePermission('财务',source?.store,d);must(source?.kind==='销售出库'&&m.reason?.trim(),'请选择原销售出库单并登记退货依据');const quantity=S.convertUnits(source.sku,Number(m.quantity),m.unit,d),already=d.retail.filter(x=>x.source===source.id&&x.kind==='销售退货').reduce((n,x)=>n+x.quantity,0);must(already+quantity<=source.quantity,'超过原单可退数量');let skip=already,left=quantity;const allocations=[];
  for(const a of source.allocations){let available=a.quantity;const n=Math.min(skip,available);skip-=n;available-=n;const q=Math.min(left,available);if(!q)continue;const old=get('batches',a.batch,d);const b={...copy(old),id:uid('RETLOT'),quantity:0,reserved:0,quality:'待确认',hold:'',assignedTreatment:'',source:source.id};d.batches.push(b);S.movement(d,b,q,'销售退货',source.id);allocations.push({batch:b.id,sku:b.sku,quantity:q,cost:b.cost});left=round(left-q);if(!left)break}
  const perBase=source.amount/source.quantity,r=record('RETURN',{...m,quantity,businessQuantity:m.quantity,businessUnit:m.unit,kind:'销售退货',sku:source.sku,store:source.store,customer:source.customer,customerId:source.customerId,amount:round(perBase*quantity),cost:round(allocations.reduce((n,a)=>n+a.cost*a.quantity,0)),allocations,refundStatus:'待原系统退款核对',status:'待质量确认'});d.retail.unshift(r);return r;
 })}
 function refundConfirm(id,m){return S.transaction('销售退货退款核对',d=>{const r=get('retail',id,d);S.requirePermission('财务',r?.store,d);must(r?.refundStatus==='待原系统退款核对'&&m.voucher?.trim(),'请选择未核对退货并填写原系统退款凭据');r.refundStatus='已人工核对';r.refund={...m,actor:S.actor(d).id,time:S.stamp()};return r})}
 function recallTasks(id){return S.transaction('召回任务展开',d=>{
  const r=get('recalls',id,d);S.requirePermission('质量',null,d);must(r?.status==='执行中','请先执行召回锁定');const source=get('batches',r.batch,d),same=b=>b&&b.sku===source.sku&&b.batch===source.batch;const tasks=[];
  d.batches.filter(b=>same(b)&&b.quantity>0).forEach(b=>tasks.push({key:'stock-'+b.id,type:'库存处置',source:b.id,store:b.store,subject:(b.containerCode||b.batch)+' / '+b.quantity+' '+get('skus',b.sku,d).unit}));
  d.transfers.filter(t=>same(get('batches',t.batch,d))&&['在途','部分收货','差异待处理','退回在途'].includes(t.status)).forEach(t=>tasks.push({key:'transit-'+t.id,type:'在途拦截',source:t.id,store:t.to,subject:t.id}));
  S.traceUses(r.batch,d).forEach(c=>tasks.push({key:'use-'+c.id,type:'患者 / 收货方跟进',source:c.id,store:c.store,subject:(c.customerId||c.customer||get('consumptions',c.source,d)?.customer||'待核对接收方')+' / '+c.id}));
  for(const task of tasks)if(!d.qualityTasks.some(t=>t.recall===id&&t.key===task.key))d.qualityTasks.push(record('Q-TASK',{...task,recall:id,owner:r.person,status:'待处理'}));r.tasksExpandedAt=S.stamp();return r;
 })}
 function resolveTask(id,m){return S.transaction('质量跟进处理',d=>{const t=get('qualityTasks',id,d);S.requirePermission('质量',t?.store,d);must(t&&m.result?.trim()&&m.evidence?.trim(),'请填写处置结果及联系 / 实物处理凭据');if(t.type==='库存处置')must(get('batches',t.source,d)?.quantity===0,'该批实物尚未完成退货或报损');if(t.type==='在途拦截')must(!(get('transfers',t.source,d)?.transitRemaining??get('transfers',t.source,d)?.quantity),'仍有未处理在途库存');Object.assign(t,m,{status:'已完成',closedBy:S.actor(d).id,closedAt:S.stamp()});return t})}
 function completeRecall(id){return S.transaction('召回处置完成',d=>{const r=get('recalls',id,d),source=get('batches',r.batch,d);S.requirePermission('质量',null,d);must(r.tasksExpandedAt,'请先展开召回任务并逐项处理');must(!d.batches.some(b=>b.sku===source.sku&&b.batch===source.batch&&b.quantity>0),'召回实物尚未清零');must(d.qualityTasks.filter(t=>t.recall===id).every(t=>t.status==='已完成'),'尚有在途拦截或患者跟进任务未完成');r.status='已完成';r.completedAt=S.stamp();return r})}
 function alertTask(m){return S.transaction('预警处理任务',d=>{S.requirePermission('库存查询',m.store,d);must(m.owner&&get('staff',m.owner,d)?.status==='启用'&&m.due&&m.note?.trim(),'请填写责任人、处理期限及措施');let r=d.alertTasks.find(t=>t.alert===m.alert&&t.status!=='已完成');if(r)Object.assign(r,m);else{r=record('ALERT-TASK',{...m,status:'处理中'});d.alertTasks.push(r)}return r})}
 function closeAlertTask(id,m){return S.transaction('预警处理结果',d=>{const r=get('alertTasks',id,d);S.requirePermission('库存查询',r?.store,d);must(r&&m.result?.trim(),'请填写处理结果');r.result=m.result;r.status='已完成';r.closedAt=S.stamp();r.closedBy=S.actor(d).id;return r})}
 function returnableVials(source,d=S.data){const c=get('consumptions',source,d);if(!c)return [];const recorded=new Set(d.emptyVials.filter(r=>r.status!=='已驳回').flatMap(r=>r.containers||[]));const lots=(c.allocations||[]).map(a=>get('batches',a.batch,d)).filter(b=>b&&get('skus',b.sku,d)?.controlled&&b.quantity===0);const legacy=d.emptyVials.filter(r=>r.source===source&&!r.containers&&r.status!=='已驳回').reduce((n,r)=>n+r.quantity,0);return [...new Map(lots.map(b=>[b.containerCode||b.id,b])).values()].filter(b=>!recorded.has(b.containerCode||b.id)).slice(legacy)}
 function controlledReview(type,id,m){return S.transaction('管制登记独立复核',d=>{must(['controlledLogs','emptyVials'].includes(type),'登记类型无效');const r=get(type,id,d);must(r?.status==='待复核','登记已复核');const a=S.differentReviewer(r.createdBy,'临床复核',r.store,d);must(a.id===r.requestedReviewer,'须由指定复核人员确认');must(m.note?.trim(),'请填写实物清点 / 空瓶核对意见');r.status='已复核';r.reviewer=a.id;r.reviewedAt=S.stamp();r.reviewNote=m.note;return r})}
 Object.assign(S,{returnableVials,controlledReview,countPlan,opening,approveOpening,receiptInvoice,saleReturn,refundConfirm,recallTasks,resolveTask,completeRecall,alertTask,closeAlertTask});
})();

;
/* Reviewed documents keep immutable approval and financial event histories. */
(() => {
 const S=PCModules['supply-chain'],{get,must,copy,uid,round}=S;
 const money=n=>Math.round((Number(n)+Number.EPSILON)*100)/100;
 const record=(prefix,m,d)=>({id:uid(prefix),...copy(m),createdBy:S.actor(d).id,time:S.stamp()});
 const reviewTypes={purchases:['采购','采购审批'],applications:['采购','采购审批'],firstReviews:['首营','采购审批'],purchaseReturns:['采购退货','采购审批'],transfers:['调拨','调拨审批'],losses:['报损','报损审批'],prices:['价格','主数据'],payments:['付款','财务'],adjustments:['消耗调整','临床复核'],cardEvents:['卡项退款','财务']};
 function reviewStore(type,r,d){return r.store||r.from||get('batches',r.batch,d)?.store||get('purchases',r.purchase,d)?.store||get('consumptions',r.source,d)?.store}
 function reviewAmount(type,r,d){return Math.abs(r.amount??(type==='prices'?r.price:['losses','transfers','purchaseReturns'].includes(type)?r.quantity*(get('batches',r.batch,d)?.cost||0):0))}
 function approvalSnapshot(type,r,d){
  const [kind,permission]=reviewTypes[type],amount=reviewAmount(type,r,d),flows=d.approvals.filter(a=>a.status==='启用'&&a.kind===kind&&a.nodes?.length&&amount>=a.threshold).sort((a,b)=>b.threshold-a.threshold);
  must(flows.length<2||flows[0].threshold!==flows[1].threshold,'同业务金额档存在重复审批流，请先停用冲突配置');
  const flow=flows[0];return {flow:flow?.id||'',name:flow?.name||'默认独立复核',kind,permission,amount,nodes:copy(flow?.nodes||[{role:'',reviewer:''}]),index:0,history:[],status:'审批中',submittedBy:r.createdBy||'SYSTEM',submittedAt:S.stamp()};
 }
 let reviewContext=null;
 S.approvalIntercept=d=>{
  if(!reviewContext)return null;
  const {type,id,approved,note}=reviewContext,r=get(type,id,d);must(r?.status==='待审批','该单据已处理');must(note?.trim(),'请填写审核意见');r.approvalRun||=approvalSnapshot(type,r,d);const run=r.approvalRun;
  must(run.status==='审批中','审批已结束，请重新提交');const a=S.differentReviewer(run.submittedBy,run.permission,reviewStore(type,r,d),d),node=run.nodes[run.index];must(node,'审批节点已结束');
  must(!run.history.some(h=>h.actor===a.id),'同一人员不能重复审核本单的不同节点');
  if(node.reviewer)must(a.id===node.reviewer,'须由当前节点指定人员审核');
  if(node.role)must((a.roles||[]).includes(node.role)&&get('roles',node.role,d)?.status==='启用','当前办理人不属于该审批节点角色');
  run.history.push({node:run.index+1,actor:a.id,approved,note,time:S.stamp()});
  if(!approved){run.status='已驳回';r.status='已驳回';return {skip:true,result:r}}
  run.index++;if(run.index<run.nodes.length)return {skip:true,result:r};run.status='已通过';return null;
 };
 function reviewCall(type,id,approved,note,fn){must(!reviewContext,'审核正在执行');reviewContext={type,id,approved,note};try{return fn()}finally{reviewContext=null}}
 const validate=S.validateMaster;
 S.validateMaster=(type,r,d)=>{
  validate(type,r,d);
  if(type==='approvals'){
   must(reviewTypes&&Object.values(reviewTypes).some(x=>x[0]===r.kind),'请选择支持的业务类型');must(Number.isFinite(r.threshold)&&r.threshold>=0,'金额阈值须为非负数');
   must(r.nodes?.length&&r.nodes.length<=6,'请配置 1–6 个顺序审批节点');const permission=Object.values(reviewTypes).find(x=>x[0]===r.kind)[1];
   r.nodes.forEach(n=>{must(n.role||n.reviewer,'每个节点须选择角色或指定人员');if(n.role){const role=get('roles',n.role,d);must(role?.status==='启用'&&(role.permissions.includes(permission)||role.permissions.includes('系统管理')),'节点角色须具有相应审核权限')}if(n.reviewer){const person=get('staff',n.reviewer,d);must(person?.status==='启用','指定审核人员不可用');must((person.roles||[]).some(id=>{const role=get('roles',id,d);return role?.status==='启用'&&(role.permissions.includes(permission)||role.permissions.includes('系统管理'))}),'指定审核人没有对应业务审核权限');if(n.role)must(person.roles?.includes(n.role),'指定人员不属于节点角色')}});
   const persons=r.nodes.map(n=>n.reviewer).filter(Boolean);must(new Set(persons).size===persons.length,'不同节点不能指定同一人员');
   if(r.status==='启用')must(!d.approvals.some(a=>a.id!==r.id&&a.status==='启用'&&a.kind===r.kind&&a.threshold===r.threshold&&a.nodes?.length),'该业务与金额档已存在启用流程');
   r.steps=r.nodes.map((n,i)=>(i+1)+'. '+(get('roles',n.role,d)?.name||'指定人员')+(n.reviewer?' / '+get('staff',n.reviewer,d).name:'')).join(' → ');
  }
  if(reviewTypes[type]&&r.status==='待审批'){const old=get(type,r.id,d);must(!old||old.status==='已驳回'||old.status==='待审批'&&!(old.approvalRun?.history.length),'已审核单据请先驳回后重新提交');r.createdBy=S.actor(d).id;r.approvalRun=approvalSnapshot(type,r,d)}
  if(type==='payments'){const p=get('purchases',r.purchase,d);must(p,'请选择采购单');const pending=d.payments.filter(p=>p.id!==r.id&&p.purchase===r.purchase&&['待审批','待付款','部分付款'].includes(p.status)).reduce((n,p)=>n+Math.max(0,p.amount-S.paymentPaid(p.id,d)),0);must(r.amount>0&&r.amount+pending<=S.purchaseBalance(r.purchase,d).balance,'申请金额超过扣除其他付款申请后的应付余额')}
 };
 const ledger=S.reconcileLedger;
 S.reconcileLedger=d=>{
  ledger(d);
  for(const [type] of Object.entries(reviewTypes))for(const r of d.inventorySchema>=2?d[type]||[]:[])if(r.status==='待审批'&&!r.approvalRun)r.approvalRun=approvalSnapshot(type,r,d);
  for(const p of d.countPlans||[]){const tasks=d.counts.filter(c=>c.plan===p.id);p.status=tasks.length&&tasks.every(c=>c.status==='已完成')?'已完成':'执行中'}
 };
 const purchaseReview=S.approvePurchase,transfer=S.transferAction,loss=S.approveLoss,returnReview=S.confirmPurchaseReturn;
 S.approvePurchase=(id,approved,note)=>reviewCall('purchases',id,approved,note,()=>purchaseReview(id,approved,note));
 S.transferAction=(id,action,m={})=>['approve','deny'].includes(action)?reviewCall('transfers',id,action==='approve',m.note||m.reason,()=>transfer(id,action,m)):transfer(id,action,m);
 S.approveLoss=(id,m={})=>reviewCall('losses',id,true,m.note,()=>loss(id));
 S.confirmPurchaseReturn=(id,m)=>reviewCall('purchaseReturns',id,true,m.note,()=>returnReview(id,m));
 function reviewDocument(type,id,approved,note){
  must(reviewTypes[type],'该业务没有通用审批入口');
  if(type==='purchases')return S.approvePurchase(id,approved,note);
  if(type==='transfers')return S.transferAction(id,approved?'approve':'deny',{note});
  if(type==='losses'&&approved)return S.approveLoss(id,{note});
  if(type==='cardEvents'&&approved)return reviewCardRefund(id,note);
  return reviewCall(type,id,approved,note,()=>S.transaction('业务单据审核',d=>{
   const r=get(type,id,d);
   if(type==='payments'){must(r.amount<=S.purchaseBalance(r.purchase,d).balance,'应付余额已变化');r.status='待付款'}
   else if(type==='prices')r.status='已生效';
   else if(type==='adjustments'){
    const c=get('consumptions',r.source,d);must(c?.status==='已消耗'&&r.quantity>0,'请关联已消耗单；负向冲回须通过实物盘点复核');const allocations=S.allocate(d,r.sku,c.store,r.quantity);S.guardClinical(d,allocations,c);allocations.forEach(a=>S.movement(d,get('batches',a.batch,d),-a.quantity,'消耗调整',r.id));r.allocations=allocations;r.cost=round(allocations.reduce((n,a)=>n+a.quantity*a.cost,0));r.status='已调整';
   }else if(['applications','firstReviews'].includes(type))r.status='已通过';
   else must(false,'请使用本业务专用审核入口');return r;
  }));
 }
 function resubmitLoss(id,m){return S.transaction('报损重新提交',d=>{const r=get('losses',id,d),b=get('batches',r?.batch,d);S.requirePermission('领用',b?.store,d);must(r?.status==='已驳回'&&m.note?.trim(),'请填写重新提交依据');must(b&&S.available(b)>=r.quantity,'实物可报损余量已变化');r.previousReviews||=[];r.previousReviews.push(copy(r.approvalRun));r.createdBy=S.actor(d).id;r.status='待审批';r.note=m.note;r.approvalRun=approvalSnapshot('losses',r,d);return r})}
 const paymentPaid=(id,d=S.data)=>money((d.paymentEntries||[]).filter(e=>e.payment===id).reduce((n,e)=>n+e.amount,0));
 S.purchaseBalance=(id,d=S.data)=>{const p=get('purchases',id,d);if(!p)return null;const received=p.receivedAmount??(p.status==='已入库'?p.amount:0),returns=d.purchaseReturns.filter(r=>r.purchase===id&&r.status==='已退货').reduce((n,r)=>n+(r.amount??r.quantity*(get('batches',r.batch,d)?.cost||0)),0),paid=(d.paymentEntries||[]).filter(e=>e.purchase===id).reduce((n,e)=>n+e.amount,0);return {received:money(received),returns:money(returns),net:money(received-returns),paid:money(paid),balance:money(received-returns-paid)}};
 function paymentEntry(m){return S.transaction('财务收付登记',d=>{
  const p=get('payments',m.payment,d),po=get('purchases',m.purchase||p?.purchase,d);S.requirePermission('财务',po?.store,d);must(po&&m.voucher?.trim()&&m.date&&m.date<=S.today()&&m.note?.trim(),'请填写采购来源、凭据、实际日期及依据');must(Number.isFinite(m.amount)&&m.amount>0&&money(m.amount)===m.amount,'金额须为正数且最多两位小数');
  must(!d.paymentEntries.some(e=>e.supplier===po.supplier&&e.voucher===m.voucher.trim()),'该供应商付款 / 收款凭据已登记');let amount=m.amount;
  if(m.kind==='供应商退款'){must(amount<=-S.purchaseBalance(po.id,d).balance,'超过应收回的供应商退款余额');amount=-amount}
  else{must(p&&['待付款','部分付款'].includes(p.status),'付款申请尚未审批或已付清');must(amount<=money(p.amount-paymentPaid(p.id,d))&&amount<=S.purchaseBalance(po.id,d).balance,'超过申请剩余量或当前应付余额')}
  const e=record('CASH',{...m,amount,purchase:po.id,payment:p?.id||'',supplier:po.supplier,store:po.store,status:'已登记'},d);d.paymentEntries.unshift(e);if(p){p.status=paymentPaid(p.id,d)>=p.amount?'已付款':'部分付款';p.payment={voucher:e.voucher,paidAt:e.date,actor:e.createdBy}}return e;
 })}
 function reversePayment(id,m){return S.transaction('财务付款冲正',d=>{
  const e=get('paymentEntries',id,d);must(e&&e.kind!=='冲正'&&!d.paymentEntries.some(x=>x.reversalOf===id),'该凭据不可重复冲正');S.differentReviewer(e.createdBy,'财务',e.store,d);must(m.note?.trim()&&m.voucher?.trim(),'请填写冲正依据与凭据');must(!d.paymentEntries.some(x=>x.supplier===e.supplier&&x.voucher===m.voucher.trim()),'凭据已登记');
  const r=record('CASH',{...m,kind:'冲正',date:S.today(),purchase:e.purchase,payment:e.payment,supplier:e.supplier,store:e.store,amount:-e.amount,reversalOf:id,status:'已登记'},d);d.paymentEntries.unshift(r);const p=get('payments',e.payment,d);if(p)p.status=paymentPaid(p.id,d)>0?'部分付款':'待付款';return r;
 })}
 S.recordPayment=(id,m)=>paymentEntry({...m,payment:id,kind:'付款',date:m.date||m.paidAt,amount:m.amount??money(get('payments',id).amount-paymentPaid(id)),note:m.note||'按已审批付款申请登记'});
 function resolveReconciliation(id,m){return S.transaction('财务对账差异复核',d=>{
  const r=get('purchaseReconciliations',id,d);must(r?.status==='差异待处理','该对账单没有待处理差异');S.differentReviewer(r.createdBy,'财务',null,d);must(m.note?.trim()&&m.voucher?.trim(),'请登记差异处理依据与双方确认凭据');
  if(m.result==='撤销重建'){r.status='已撤销';r.resolution={...m,actor:S.actor(d).id,time:S.stamp()};return r}
  must(Number.isFinite(m.confirmedAmount)&&money(m.confirmedAmount)===money(r.amount),'供应商更正金额须与本期账面一致；账面错误须补正原业务后撤销重建');r.resolution={...m,originalSupplierAmount:r.supplierAmount,actor:S.actor(d).id,time:S.stamp()};r.supplierAmount=m.confirmedAmount;r.difference=0;r.status='已对账';return r;
 })}
 function settle(id,m){return S.transaction('门店核销结算确认',d=>{
  const r=get('settlements',id,d);must(r&&r.status!=='已确认'&&r.status!=='已冲销','结算已结束');must(['from','to'].includes(m.side),'请选择本次确认方');S.requirePermission('财务',r[m.side],d);must(m.note?.trim()&&m.voucher?.trim(),'请填写对账依据和凭据');r.confirmations||=[];
  must(!r.confirmations.some(c=>c.side===m.side&&c.version===(r.version||0)),'本方本版本已确认');must(!r.confirmations.some(c=>c.side!==m.side&&c.version===(r.version||0)&&c.actor===S.actor(d).id),'收付双方须由不同人员确认');
  if(m.result==='提出差异'){r.status='差异待处理';r.disputes||=[];r.disputes.push({...m,actor:S.actor(d).id,time:S.stamp()});return r}
  must(r.status!=='差异待处理','请先处理双方差异');r.confirmations.push({...m,version:r.version||0,actor:S.actor(d).id,time:S.stamp()});r.status=new Set(r.confirmations.filter(c=>c.version===(r.version||0)).map(c=>c.side)).size===2?'已确认':'待对方确认';return r;
 })}
 function resolveSettlement(id,m){return S.transaction('门店结算差异处理',d=>{
  const r=get('settlements',id,d);must(r?.status==='差异待处理','没有待处理差异');S.requirePermission('财务',r.from,d);S.requirePermission('财务',r.to,d);must(m.note?.trim()&&m.voucher?.trim()&&Number.isFinite(m.ratio)&&m.ratio>=0&&m.ratio<=100,'请填写双方确认的分摊比例与依据');must(r.recognized!=null,'历史结算缺少核销金额，请先核对来源');r.revisions||=[];r.revisions.push({amount:r.amount,ratio:r.ratio,version:r.version||0,...m,actor:S.actor(d).id,time:S.stamp()});r.ratio=m.ratio;r.amount=money(r.recognized*m.ratio/100);r.version=(r.version||0)+1;r.status='待确认';return r;
 })}
 function cardIdle(cs,d){must(!d.treatments.some(t=>!['已关闭','已取消'].includes(t.status)&&t.items.some(i=>i.cardSale===cs.id))&&!d.consumptions.some(c=>c.cardSale===cs.id&&['已预占','待偏差审批'].includes(c.status)),'该卡存在未完成治疗或预占，请先完成处理')}
 function refundValue(cs,lines){const total=lines.reduce((n,l)=>n+l.times*(cs.unitValues?.[l.spec]??cs.amount/cs.initialTimes),0),all=cs.remaining.every(r=>lines.find(l=>l.spec===r.spec)?.times===r.times||r.times===0);return all?money(cs.amount-cs.recognized-(cs.refunded||0)):Math.min(money(total),money(cs.amount-cs.recognized-(cs.refunded||0)))}
 function requestCardRefund(id,m){return S.transaction('卡项退款申请',d=>{
  const cs=get('cardSales',id,d);S.requirePermission('财务',cs?.store,d);must(cs&&['有效','已冻结'].includes(cs.status),'卡状态不允许退款');cardIdle(cs,d);must(!d.cardEvents.some(e=>e.cardSale===id&&['待审批','待退款'].includes(e.status)),'该卡已有退款在处理');must(m.reason?.trim()&&m.lines?.length,'请填写退款权益及原因');
  const lines=m.lines.filter(l=>l.times>0).map(l=>{const r=cs.remaining.find(x=>x.spec===l.spec);must(r&&Number.isInteger(l.times)&&l.times>0&&l.times<=r.times,'退还次数超过未使用权益或不是整数');return {spec:l.spec,times:l.times}});must(lines.length&&new Set(lines.map(l=>l.spec)).size===lines.length,'请填写不重复的退权益明细');
  const e=record('CARD-EVENT',{cardSale:id,store:cs.store,kind:'部分 / 全部退权益',reason:m.reason,lines,amount:refundValue(cs,lines),status:'待审批'},d);d.cardEvents.unshift(e);return e;
 })}
 function reviewCardRefund(id,note){return reviewCall('cardEvents',id,true,note,()=>S.transaction('卡项退款审核',d=>{const e=get('cardEvents',id,d),cs=get('cardSales',e.cardSale,d);cardIdle(cs,d);must(e.lines.every(l=>cs.remaining.find(r=>r.spec===l.spec)?.times>=l.times),'剩余权益已变化');must(refundValue(cs,e.lines)===e.amount,'金额已变化，请驳回重提');e.status='待退款';return e}))}
 function completeCardRefund(id,m){return S.transaction('卡项退款核对',d=>{
  const e=get('cardEvents',id,d),cs=get('cardSales',e?.cardSale,d);S.requirePermission('财务',cs?.store,d);must(e?.status==='待退款'&&m.voucher?.trim(),'请关联已审批退款和原系统退款凭据');must(!d.cardEvents.some(x=>x.id!==id&&x.voucher===m.voucher.trim()),'退款凭据已登记');cardIdle(cs,d);must(e.lines.every(l=>cs.remaining.find(r=>r.spec===l.spec)?.times>=l.times),'权益已变化');e.lines.forEach(l=>cs.remaining.find(r=>r.spec===l.spec).times-=l.times);cs.refunded=money((cs.refunded||0)+e.amount);must(cs.refunded+cs.recognized<=cs.amount+.001,'退款超过未核销余额');if(cs.remaining.every(r=>!r.times))cs.status='已退款';Object.assign(e,{voucher:m.voucher.trim(),status:'已退款',paidAt:S.stamp(),paidBy:S.actor(d).id});return e;
 })}
 const oldCardEvent=S.cardEvent;
 S.cardEvent=(id,m)=>m.kind==='退还剩余权益'?requestCardRefund(id,{reason:m.reason,lines:copy(get('cardSales',id).remaining)}):oldCardEvent(id,m);
 function reverseRedemption(id,m){return S.transaction('卡项误核销冲正',d=>{
  const r=get('redemptions',id,d),cs=get('cardSales',r?.cardSale,d);must(r?.status==='已核销'&&cs,'该核销不可重复冲正');S.differentReviewer(r.createdBy||get('treatments',r.source,d)?.billingBy,'财务',r.store,d);must(m.note?.trim()&&m.voucher?.trim(),'请填写原系统冲正凭据及依据');must(!d.cardEvents.some(e=>e.voucher===m.voucher.trim()),'冲正凭据已登记');cardIdle(cs,d);must(!d.cardEvents.some(e=>e.cardSale===cs.id&&['待审批','待退款'].includes(e.status)),'请先处理该卡退款申请');must(cs.recognized>=r.amount,'已核销金额异常');
  const right=cs.remaining.find(x=>x.spec===r.spec);must(right,'卡权益快照缺失');right.times+=r.times;cs.recognized=money(cs.recognized-r.amount);if(cs.status==='已退款')cs.status='已冻结';r.status='已冲正';r.reversedAt=S.stamp();
  const e=record('CARD-EVENT',{cardSale:cs.id,store:r.store,kind:'误核销冲正',source:r.id,amount:-r.amount,lines:[{spec:r.spec,times:r.times}],reason:m.note,voucher:m.voucher,status:'已登记'},d);d.cardEvents.unshift(e);
  for(const settlement of d.settlements.filter(s=>s.redemption===id||!s.redemption&&s.source===r.source)){if(settlement.status==='已确认')d.settlements.unshift(record('SET',{...copy(settlement),id:uid('SET'),amount:-settlement.amount,recognized:-settlement.recognized,reversalOf:settlement.id,status:'待确认',confirmations:[],version:0,source:r.source},d));else{settlement.previousStatus=settlement.status;settlement.status='已冲销';settlement.reversal=e.id}}
  const t=get('treatments',r.source,d);if(t){t.billingReversals||=[];t.billingReversals.push(e.id);t.sourceSync='待原订单核对'}return e;
 })}

 function cancelTransfer(id,m){return S.transaction('调拨取消发货',d=>{const r=get('transfers',id,d);must(r&&['待审批','待发货'].includes(r.status),'发货后请走收货差异或拒收退回');S.requirePermission('调拨',r.from,d);must(S.actor(d).id===r.createdBy||S.can('调拨审批',r.from,d),'请由申请人或调拨审核人员取消');must(m.note?.trim(),'请填写取消依据');if(r.reserved){const b=get('batches',r.batch,d);must(b.reserved>=r.reserved,'预占库存异常');b.reserved=round(b.reserved-r.reserved);r.reserved=0}r.status='已取消';r.cancelNote=m.note;r.cancelledBy=S.actor(d).id;r.cancelledAt=S.stamp();if(r.approvalRun?.status==='审批中')r.approvalRun.status='已取消';return r})}
 S.cancelTransfer=cancelTransfer;
 Object.assign(S,{reviewTypes,approvalSnapshot,reviewDocument,resubmitLoss,paymentPaid,paymentEntry,reversePayment,resolveReconciliation,settle,resolveSettlement,requestCardRefund,completeCardRefund,reverseRedemption});
 const ready=S.ready;
 S.ready=ready.then(async()=>{if(S.data.workflowSchema===1||S.storageError)return;S.transaction('审批财务升级',d=>{
  d.paymentEntries||=[];for(const p of d.payments.filter(p=>p.status==='已付款'))if(!d.paymentEntries.some(e=>e.payment===p.id))d.paymentEntries.push({id:uid('CASH'),payment:p.id,purchase:p.purchase,supplier:get('purchases',p.purchase,d)?.supplier,store:get('purchases',p.purchase,d)?.store,kind:'付款',amount:p.amount,date:(p.payment?.paidAt||p.time||S.today()).slice(0,10),voucher:p.payment?.voucher||'历史记录 '+p.id,createdBy:p.payment?.actor||p.createdBy||'',time:p.time||S.stamp(),status:'已登记',legacy:true});
  for(const flow of d.approvals)if(!flow.nodes?.length){flow.status='待配置';flow.legacySteps=flow.steps;flow.steps='请配置可执行审批节点'}
  d.ledgerBaseline={time:S.stamp(),date:S.today(),batches:d.batches.map(b=>({id:b.id,store:b.store,sku:b.sku,quantity:b.quantity,cost:b.cost})),movementIds:d.movements.map(m=>m.id)};d.workflowSchema=1;return {id:'workflow-1'};
 });try{await S.flush()}catch(e){if(!S.storageError)throw e}}).catch(e=>{if(!S.storageError)throw e});PCModules['inventory-core'].ready=S.ready;
})();

;
/* Report rows carry source references; historical balances start at a recorded baseline. */
(() => {
 const S=PCModules['supply-chain'],{get,round,must}=S;
 const names=(type,id)=>get(type,id)?.name||id||'—',expiryText=s=>s||'—';
  function businessAlerts(kind){const d=S.data,out=[],add=(key,name,store,subject,value,threshold,level,target,entity)=>out.push({id:kind+'-'+key,name,store,subject,value,threshold,level,status:d.alertActions.some(a=>a.alert===kind+'-'+key)?'已知悉':'待处理',target,entity});if(kind===0)d.batches.filter(b=>b.quantity>0&&S.daysLeft(b)<=90).forEach(b=>add(b.id,'批号效期',b.store,names('skus',b.sku)+' / '+b.batch,S.daysLeft(b)+' 天','90 / 60 / 30 / 15 天',S.daysLeft(b)<=0?'已到期':S.daysLeft(b)<=15?'紧急':S.daysLeft(b)<=30?'高':S.daysLeft(b)<=60?'中':'关注',b.id,'batches'));if(kind===0)d.batches.filter(b=>b.openedAt&&b.quantity>0).forEach(b=>add('open-'+b.id,'开封效期',b.store,(b.containerCode||b.id)+(b.customerId?' / 客户寄存 '+b.customerId:''),expiryText(b.openExpiry),'SKU 开封时限',Date.parse(b.openExpiry)<=Date.now()?'已失效':'关注',b.id,'batches'));if(kind===7)d.consumptions.filter(c=>c.status==='待偏差审批'||c.clinicalReview==='待偏差复核').forEach(c=>add(c.id,'BOM 用量超范围',c.store,c.name,(c.deviations||[]).map(x=>x.actual+' '+x.unit).join(' / '),'BOM 浮动区间','待审批',c.id,'consumptions'));if(kind===1||kind===2)for(const k of d.skus.filter(k=>k.status==='启用'))for(const s of d.stores.filter(s=>s.status==='启用')){const q=round(d.batches.filter(b=>b.sku===k.id&&b.store===s.id&&S.batchState(b)==='可用').reduce((n,b)=>n+S.available(b),0));if(kind===1?q<k.low:q>k.high)add(k.id+s.id,kind===1?'低库存 / 缺货':'超储',s.id,k.name,q+k.unit,(kind===1?k.low:k.high)+k.unit,q===0?'紧急':'关注',k.id,'skus')}if(kind===3)d.temperatures.filter(t=>t.status==='超温待处理').forEach(t=>add(t.id,'冷链超温',S.get('warehouses',t.warehouse)?.store,names('warehouses',t.warehouse),t.temperature+'℃','商品配置温区','高',t.id,'temperatures'));if(kind===4)d.equipment.filter(e=>e.status==='使用中'&&e.shots-S.heldShots(e.id)<e.low).forEach(e=>add(e.id,'发数不足',e.store,e.name,round(e.shots-S.heldShots(e.id))+e.unit,e.low+e.unit,'高',e.id,'equipment'));if(kind===5)d.heads.filter(h=>h.status==='使用中'&&h.life-h.used-S.heldHeads(h.id)<=Math.ceil(h.life*.1)).forEach(h=>add(h.id,'治疗头寿命',S.get('equipment',h.equipment)?.store,h.name,round(h.life-h.used-S.heldHeads(h.id))+' '+(h.lifeUnit||'次'),'剩余 10%','关注',h.id,'heads'));if(kind===5)d.batches.filter(b=>b.openedAt&&b.locationKind==='治疗头账户'&&b.quantity>0&&b.quantity<=(S.get('skus',b.sku)?.low||0)).forEach(b=>add('head-'+b.id,'治疗头剩余发数',b.store,b.containerCode,b.quantity+' '+S.get('skus',b.sku).unit,S.get('skus',b.sku).low+' '+S.get('skus',b.sku).unit,'不足',b.id,'batches'));if(kind===6)[...d.qualifications,...d.credentials].filter(q=>q.expiry<=S.day(90)).forEach(q=>add(q.id,'资质到期',S.get('staff',q.staff)?.store||'WH',q.name+' / '+(q.code||''),q.expiry,'到期前 90 天','关注',q.id,q.staff?'qualifications':'credentials'));if(kind===7)(d.adjustments||[]).filter(a=>a.status==='待审批').forEach(a=>add(a.id,'实际消耗偏差',S.get('consumptions',a.source)?.store,a.source,a.quantity,'需审核差异量','关注',a.id,'adjustments'));for(const r of out){const task=d.alertTasks.find(t=>t.alert===r.id&&t.status!=='已完成');r.status=task?(task.due<S.today()?'已逾期':task.status):'待派单';r.incident=task?.id||''}return out}
 function businessReports(name,custom,f={}){
  const d=S.data,allowed=new Set(d.stores.filter(s=>S.can('报表',s.id)&&(!f.store||s.id===f.store)).map(s=>s.id)),base=d.ledgerBaseline;
  const start=f.from||(custom?.period==='今天'?S.today():custom?.period==='本月'?S.today().slice(0,7)+'-01':base?.date||S.today()),end=f.to||S.today(),period=start+' 至 '+end,out=[];
  const date=r=>(r.date||r.time||r.updated||'').slice(0,10),inside=r=>date(r)>=start&&date(r)<=end,ref=(type,rows)=>rows.map(r=>({type,id:r.id}));
  const add=(id,label,metric,value,unit,evidence=[],scope=period,note='')=>out.push({id,name:label,metric,value:value==null?null:round(value),unit,period:scope,evidence,note});
  if(start>end||end>S.today()){add('period','统计期间','请使用不晚于今天的有效起止日期',null,'');return out}
  const batches=d.batches.filter(b=>allowed.has(b.store)),allFlows=d.movements.filter(m=>allowed.has(m.store)),flows=allFlows.filter(inside),baselineIds=new Set(base?.movementIds||[]);
  const qtyAt=(b,day)=>round((base?.batches.find(x=>x.id===b.id)?.quantity||0)+allFlows.filter(m=>m.batch===b.id&&!m.transit&&!baselineIds.has(m.id)&&date(m)<=day).reduce((n,m)=>n+m.quantity,0));
  const stock=(store,day,sku)=>batches.filter(b=>(!store||b.store===store)&&(!sku||b.sku===sku)).reduce((n,b)=>n+qtyAt(b,day)*b.cost,0);
  const stockRefs=(store,sku,asof=end)=>[...batches.filter(b=>(!store||b.store===store)&&(!sku||b.sku===sku)).map(b=>({type:'batches',id:b.id,quantity:qtyAt(b,asof),amount:round(qtyAt(b,asof)*b.cost),time:asof})),...ref('movements',allFlows.filter(m=>(!store||m.store===store)&&(!sku||m.sku===sku)&&date(m)<=asof))];
  const stockReport=['库存金额','库存周转'].includes(name)||custom?.metric.includes('库存');
  if(stockReport&&(!base||start<base.date)){add('history','历史库存','该期间早于可追溯库存起点',null,'',[],period,'可追溯起点：'+(base?.time||'尚未建立')+'。早期存量未编造为历史余额；请从该日起查询。');return out}
  const salesKinds=['销售出库','项目消耗','消耗调整','销售退货'],costOf=rows=>rows.reduce((n,m)=>n+(m.quantity<0?m.cost:-m.cost),0);
  if(name==='库存金额'){
   let day=start,steps=0;while(day<=end&&steps++<366){if(f.granularity==='month'){const last=new Date(day.slice(0,7)+'-01T00:00:00Z');last.setUTCMonth(last.getUTCMonth()+1);last.setUTCDate(0);day=last.toISOString().slice(0,10);if(day>end)day=end}
    for(const st of d.stores.filter(s=>allowed.has(s.id)))add(day+st.id,st.name,'仓内库存金额',stock(st.id,day),'元',stockRefs(st.id,null,day),day,'库存起点 '+base.time+'，以入账流水回溯；客户寄存与治疗室实物均包含。');
    const transfers=d.transfers.filter(t=>allowed.has(t.from)&&t.shipped?.slice(0,10)<=day&&(!t.returned||t.returned.slice(0,10)>day));
    const transit=transfers.reduce((n,t)=>{const received=(t.receipts||[]).filter(r=>date(r)<=day).reduce((v,r)=>v+r.received+r.damaged,0),lost=d.losses.filter(l=>l.inTransit&&l.source===t.id&&date(l)<=day).reduce((v,l)=>v+l.quantity,0),remaining=t.receipts?Math.max(0,t.quantity-received-lost):t.received?.slice(0,10)<=day?0:t.quantity;return n+remaining*(get('batches',t.batch)?.cost||0)},0);add(day+'transit','调出机构在途','在途库存金额',transit,'元',ref('transfers',transfers),day,'在途计入调出方，不与门店仓内金额重复。');day=new Date(Date.parse(day+'T00:00:00Z')+86400000).toISOString().slice(0,10);
   }return out;
  }
  if(['临期货值','门店库存健康度'].includes(name)){
   for(const st of d.stores.filter(s=>allowed.has(s.id))){const bs=batches.filter(b=>b.store===st.id&&b.quantity>0),near=bs.filter(b=>S.daysLeft(b)<=90),healthy=bs.filter(b=>S.daysLeft(b)>90&&S.batchState(b)==='可用'),value=rs=>rs.reduce((n,b)=>n+b.quantity*b.cost,0),total=value(bs);add(st.id,st.name,name==='临期货值'?'90 天内及已过期货值':'非临期且可用货值占比',name==='临期货值'?value(near):total?value(healthy)/total*100:null,name==='临期货值'?'元':'%',ref('batches',name==='临期货值'?near:bs),'当前库存快照',total?'包括实物寄存、治疗室与隔离库存。':'当前无库存，不参与健康度排名。')}
  }else if(name==='消耗异常'){
   for(const c of d.consumptions.filter(c=>allowed.has(c.store)&&c.status==='已消耗'&&inside({time:c.confirmed||c.time})))for(const [i,a] of (c.actualTotals||[]).entries())if(a.actual<a.min||a.actual>a.max)add(c.id+i,c.id+' / '+names(a.type==='equipment'?'equipment':'skus',a.sku),'实际 '+a.actual+' / 标准 '+a.standard+' / 范围 '+a.min+'–'+a.max,a.actual-a.standard,a.unit,[{type:'consumptions',id:c.id}],period,c.clinicalReview||'已确认');
   for(const a of d.adjustments.filter(a=>a.status!=='已驳回'&&allowed.has(get('consumptions',a.source)?.store)&&inside(a)))add(a.id,a.source+' / '+a.status,'补扣登记差异',a.quantity,get('skus',a.sku)?.unit,ref('adjustments',[a]));
  }else if(name==='仪器发数产出'){
   for(const e of d.equipment.filter(e=>allowed.has(e.store))){const logs=d.shotLogs.filter(l=>l.equipment===e.id&&l.quantity<0&&inside(l)),uses=d.treatments.filter(t=>t.billing&&allowed.has(t.store)&&t.closedAt?.slice(0,10)<=end&&t.plans.some(p=>p.equipment===e.id));let revenue=0;
    const reversals=d.cardEvents.filter(c=>c.kind==='误核销冲正'&&inside(c)&&uses.some(t=>get('redemptions',c.source)?.source===t.id));
    for(const t of uses)for(const item of t.billing){const ids=[...new Set(t.plans.filter(p=>p.item===item.item&&p.type==='equipment').map(p=>p.equipment))];if(ids.includes(e.id)){const reversed=reversals.reduce((n,c)=>{const r=get('redemptions',c.source);if(r?.source!==t.id||r.spec!==item.spec)return n;const share=r.item?Number(r.item===item.item):item.amount/(t.billing.filter(b=>b.spec===item.spec).reduce((v,b)=>v+b.amount,0)||1);return n-c.amount*share},0);revenue+=((inside({time:t.closedAt})?item.amount:0)-reversed)/ids.length}}
    add(e.id,e.name,'实际消耗发数',logs.reduce((n,l)=>n-l.quantity,0),e.unit,ref('shotLogs',logs));add(e.id+'cost',e.name,'发数成本',logs.reduce((n,l)=>n+(l.amount||0),0),'元',ref('shotLogs',logs));add(e.id+'revenue',e.name,'核销额分摊（同项目按仪器数均分）',revenue,'元',ref('treatments',uses).concat(ref('cardEvents',reversals)));
   }
  }else if(name==='卡项核销进度'){
   for(const c of d.cardSales.filter(c=>allowed.has(c.store)&&(c.sold||date(c))<=end)){const used=d.redemptions.filter(r=>r.cardSale===c.id&&date(r)<=end),reversed=used.filter(r=>r.reversedAt?.slice(0,10)<=end),n=used.reduce((v,r)=>v+r.times,0)-reversed.reduce((v,r)=>v+r.times,0);add(c.id,names('cards',c.card)+' / '+c.customer,'净核销次数 / 初始权益次数',n/(c.initialTimes||1)*100,'%',ref('cardSales',[c]).concat(ref('redemptions',used)),'截至 '+end,'冲正扣除核销；退款不计为已核销。')}
  }else if(['成本结转','损耗分析','采购成本趋势'].includes(name)||custom){
   const groups={};const isStock=custom?.metric.includes('库存');const rows=isStock?batches:flows.filter(m=>name==='采购成本趋势'?m.kind==='采购入库':name==='损耗分析'||custom?.metric==='报损成本'?m.kind.startsWith('报损')||m.kind==='在途损耗':custom?m.kind==='项目消耗':salesKinds.concat(['赠送配赠','样品','培训','福利','在途损耗']).includes(m.kind)||m.kind.startsWith('报损'));
   for(const row of rows){const k=get('skus',row.sku),loss=get('losses',row.source),key=custom?(custom.dimension==='门店'?names('stores',row.store):custom.dimension==='品类'?k?.category:k?.name)+(custom.metric==='库存数量'?' / '+k?.unit:''):name==='采购成本趋势'?date(row).slice(0,7)+' / '+k?.name+' / '+k?.unit:name==='损耗分析'?names('stores',row.store)+' / '+k?.category+' / '+(loss?.reason||row.kind):loss?.subject||(['赠送配赠','样品'].includes(row.kind)?'市场费用':['培训','福利'].includes(row.kind)?'管理费用':'主营业务成本');
    const g=groups[key]||={value:0,quantity:0,refs:[],unit:k?.unit};g.value+=isStock?qtyAt(row,end)*(custom.metric==='库存数量'?1:row.cost):name==='采购成本趋势'?row.cost:costOf([row]);g.quantity+=row.quantity;g.refs.push({type:isStock?'batches':'movements',id:row.id});
   }
   for(const [key,g]of Object.entries(groups)){if(name==='采购成本趋势'){add(key,key,'加权采购单价',g.quantity?g.value/g.quantity:0,'元 / '+g.unit,g.refs);add(key+'amount',key,'采购入库金额',g.value,'元',g.refs)}else add(key,key,custom?.metric||name,g.value,custom?.metric==='库存数量'?g.unit:'元',g.refs,isStock?'截至 '+end:period)}
  }else for(const k of d.skus){const bs=batches.filter(b=>b.sku===k.id),ms=flows.filter(m=>m.sku===k.id&&salesKinds.includes(m.kind)&&(name!=='库存周转'||start!==base?.date||!baselineIds.has(m.id))),used=ms.reduce((n,m)=>n-m.quantity,0);if(!bs.length&&!ms.length)continue;
   if(name==='库存周转'){const prev=new Date(Date.parse(start+'T00:00:00Z')-86400000).toISOString().slice(0,10),opening=start===base.date?base.batches.filter(b=>allowed.has(b.store)&&b.sku===k.id).reduce((n,b)=>n+b.quantity*b.cost,0):stock(null,prev,k.id),average=(opening+stock(null,end,k.id))/2;add(k.id,k.name,'销耗成本 / 期初期末平均库存金额',average?costOf(ms)/average:null,'次',stockRefs(null,k.id).concat(ref('movements',ms)),period,'期初金额 '+round(opening)+'；期末金额 '+round(stock(null,end,k.id))+'；期间销耗成本 '+round(costOf(ms))+'。'+(start===base.date?'首日从库存起点 '+base.time+' 起算。':''))}
   else if(name==='滞销品'){if(ms.some(m=>m.quantity<0))continue;add(k.id,k.name,'期间无销耗的当前库存',bs.reduce((n,b)=>n+b.quantity,0),k.unit,ref('batches',bs),period+'；余额为当前快照')}
   else add(k.id,k.name,'净销耗数量（已扣销售退货）',used,k.unit,ref('movements',ms),period,'不同基本单位不合并排名。');
  }
  return out.sort((a,b)=>a.unit.localeCompare(b.unit)||Number(b.value)-Number(a.value));
 }
 const alertTask=S.alertTask;
 S.alertTask=m=>{const live=businessAlerts(Number(m.alert.split('-')[0])).find(a=>a.id===m.alert);must(live,'该风险已解除，请刷新列表');must(m.due>=S.today(),'处理期限不能早于今天');return alertTask({...m,observed:{value:live.value,threshold:live.threshold,time:S.stamp()}})};
 S.closeAlertTask=(id,m)=>S.transaction('预警处理结果',d=>{const r=get('alertTasks',id,d);S.requirePermission('库存查询',r?.store,d);must(r&&r.status!=='已完成'&&m.result?.trim(),'请填写尚未完成任务的处理结果');must(r.owner===S.actor(d).id||S.can('系统管理',r.store,d),'请由任务责任人登记处理结果');r.result=m.result;r.submittedAt=S.stamp();r.submittedBy=S.actor(d).id;r.status='待复核';return r});
 S.reviewAlertTask=(id,m)=>S.transaction('预警风险解除复核',d=>{const r=get('alertTasks',id,d);must(r?.status==='待复核'&&m.note?.trim(),'请填写处理结果复核意见');S.differentReviewer(r.submittedBy,'库存查询',r.store,d);must(!businessAlerts(Number(r.alert.split('-')[0])).some(a=>a.id===r.alert),'该风险仍存在，请先完成补货、质检、报损或其他关联业务处理');r.status='已完成';r.reviewNote=m.note;r.closedAt=S.stamp();r.closedBy=S.actor(d).id;return r});
 const complete=S.completeRecall;
 S.completeRecall=id=>{const r=get('recalls',id);must(r,'召回单不存在');const src=get('batches',r.batch),tracked=new Set(S.data.qualityTasks.filter(t=>t.recall===id).map(t=>t.key));must(!S.data.transfers.some(t=>{const b=get('batches',t.batch);return b?.sku===src.sku&&b.batch===src.batch&&(t.transitRemaining??(['在途','部分收货','差异待处理','退回在途'].includes(t.status)?t.quantity:0))>0}),'仍存在召回在途实物');must(S.traceUses(r.batch).every(c=>tracked.has('use-'+c.id)),'发现新的使用记录，请重新展开召回任务');return complete(id)};
 Object.assign(S,{businessAlerts,businessReports});
})();
