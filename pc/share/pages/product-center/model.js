/* Sales products reference the inventory catalog; all writes share its transaction. */
(function(root){
  'use strict';
  const M=root.WeidStockModel,copy=M.copy,assert=(v,m)=>{if(!v)throw Error(m);};
  const amount=(v,label='金额')=>M.quantity(v,label),positive=(v,label)=>M.quantity(v,label,false);
  const categories=['S10','M10','半永久女','W10','K10','K20','K30','S10N','S10N1','S10Y','S20','S30','S40','S50','S10A','S10男','L10','T10','X10','脱毛女','脱毛男','抖团','Y10','R10','F10','Z10','P10','J10','外协项目','居家产品','美甲美睫','皮肤','养生','体验'];
  const departments=['半永久','居家产品','美容皮肤科','美容外科','美容无创科','渠道(外)','脱毛'];
  const attributes=['半永久','居家产品','美白嫩肤','皮肤','祛斑(S10)','身体塑形','生活护理','手术抗衰','脱毛','仪器抗衰','注射抗衰'];
  const classes=['半永久','玻尿酸','蛋白线','光电仪器','居家产品','肉毒','生活护理','手术','水光针','脱毛','再生材料'];
  const feeDefault=()=>({enabled:false,mode:'percent',first:0,next:0,fixed:0,tiers:[{from:0,to:100,fee:0},{from:100,to:null,fee:0}]});
  const basicDefault=()=>({name:'',type:'服务',category:'',duration:30,department:'',attribute:'',productClass:'',materials:[],thumbnail:'',pictures:[],price:0,stores:[],description:'',fee:feeDefault(),trayRatio:0,trays:[]});
  function seed(s){
    const names=['眼部舒缓护理','净颜清洁护理','舒缓修护护理','水润保湿护理','身体舒缓护理','修护面膜（盒）','精华护理（单次）','洗脸服务','皮肤检测','日常护理组合'];
    const basics=names.map((name,i)=>({...basicDefault(),id:'base'+i,no:2600+i,name,type:i===5?'商品':'服务',category:categories[i%categories.length],duration:i===8?10:30,department:i===5?'居家产品':'美容皮肤科',attribute:'生活护理',productClass:i===5?'居家产品':'生活护理',price:100+i*20,stores:i===5?[]:['w1','w2','w3'],materials:i<7?[{pid:i===5?'p1':'p0',sid:i===5?'s1':'s0',qty:1}]:[],updatedAt:M.now()}));
    basics[0].trays=[{id:'base8',type:'主配台'},{id:'base2',type:'辅配台'}];basics[8].trayRatio=20;basics[2].trayRatio=70;
    basics[3].fee={...feeDefault(),enabled:true,mode:'percent',first:10,next:5};
    const c={schema:1,sequence:2610,basics,multiples:[{id:'multi1',no:94,name:'明眸卡（3选2）',options:['base0','base1','base2'],count:2,duration:60,thumbnail:'',updatedAt:M.now()},{id:'multi2',no:96,name:'居家护理多选组合',options:['base3','base5','base6'],count:2,duration:60,thumbnail:'',updatedAt:M.now()}],listings:[],categorySettings:{}};
    P.seedListings?.(c,s);return c;
  }
  function validate(s){
    const c=s.salesProducts;assert(c&&c.schema===1&&Array.isArray(c.basics)&&Array.isArray(c.multiples)&&Array.isArray(c.listings),'产品数据格式不兼容，原数据已保留。');
    return c;
  }
  function fee(value){
    const f=copy(value||feeDefault());f.enabled=f.enabled===true||f.enabled==='true';
    if(!f.enabled)return f;
    assert(['percent','first','fixed','tier'].includes(f.mode),'请选择手工费计算方式。');
    if(f.mode==='percent'||f.mode==='first'){f.first=amount(f.first,'首次手工费');f.next=amount(f.next,'后续手工费');if(f.mode==='percent')assert(f.first<=100&&f.next<=100,'手工费比例不能超过 100%。');}
    if(f.mode==='fixed')f.fixed=amount(f.fixed,'固定手工费');
    if(f.mode==='tier'){
      assert(f.tiers?.length,'请设置实收业绩区间。');let last=0;
      f.tiers.forEach((t,i)=>{t.from=last;t.to=i===f.tiers.length-1?null:positive(t.to,'区间上限');t.fee=amount(t.fee,'操作手工费');if(t.to!==null){assert(t.to>last,'实收业绩区间须从小到大且连续。');last=t.to;}});
    }
    return f;
  }
  function basic(s,v){
    const c=validate(s),p=copy(v);assert(p.name?.trim(),'请填写产品名称。');p.name=p.name.trim();assert(['服务','商品'].includes(p.type),'请选择产品类型。');assert(p.category,'请选择所属分类。');p.duration=amount(p.duration,'耗时');p.price=amount(p.price,'单项实收价格');p.trayRatio=amount(p.trayRatio,'配台占比');assert(p.trayRatio<=100,'配台占比不能超过 100%。');
    assert(!c.basics.some(x=>x.id!==p.id&&x.name===p.name),'基础产品名称已存在。');
    const seen=new Set();p.materials.forEach(x=>{const k=M.key(x.pid,x.sid);assert(!seen.has(k),'同一库存规格不能重复关联。');seen.add(k);assert(M.product(s,x.pid)&&M.spec(s,x.pid,x.sid),'关联的库存产品或规格不存在，请重新选择。');assert(x.unit,'请确认关联物料的用量单位。');x.qty=positive(x.qty,'每份物料数量');x.conversion=M.conversion(s,x.pid,x.sid,x.unit);x.baseQty=M.convert(x.qty,x.conversion,false);});
    p.stores=p.type==='商品'?[]:[...new Set(p.stores||[])];p.stores.forEach(id=>assert(P.storeCatalog(s).some(x=>x.id===id),'可维护门店不存在。'));p.fee=fee(p.fee);
    p.id=p.id||M.uid('BASE');p.no=p.no||++c.sequence;p.updatedAt=M.now();p.trays=p.trays||[];
    const at=c.basics.findIndex(x=>x.id===p.id);at<0?c.basics.unshift(p):c.basics.splice(at,1,p);return p.id;
  }
  function multiple(s,v){
    const c=validate(s),p=copy(v);assert(p.name?.trim(),'请填写多选产品名称。');p.name=p.name.trim();assert(!c.multiples.some(x=>x.id!==p.id&&x.name===p.name),'多选产品名称已存在。');
    p.options=[...new Set(p.options||[])];assert(p.options.length,'请至少选择一个基础产品。');p.options.forEach(id=>assert(c.basics.some(x=>x.id===id),'可选基础产品不存在。'));
    p.count=positive(p.count,'可选项目数');assert(Number.isInteger(p.count)&&p.count<=p.options.length,'可选项目数须为整数且不能超过可选项数量。');p.duration=amount(p.duration,'耗时');p.id=p.id||M.uid('MULTI');p.no=p.no||++c.sequence;p.updatedAt=M.now();
    const at=c.multiples.findIndex(x=>x.id===p.id);at<0?c.multiples.unshift(p):c.multiples.splice(at,1,p);return p.id;
  }
  function apply(s,command,p={}){
    if(command==='sales.initialize'){if(s.salesProducts===undefined)s.salesProducts=seed(s);validate(s);return;}
    const c=validate(s);
    if(command==='sales.basic')return basic(s,p.value);
    if(command==='sales.multiple')return multiple(s,p.value);
    if(command==='sales.fee'){
      assert(p.ids?.length,'请选择基础产品。');const f=fee(p.value);p.ids.forEach(id=>{const x=c.basics.find(x=>x.id===id);assert(x,'基础产品已不存在。');x.fee=copy(f);x.updatedAt=M.now();});return;
    }
    if(command==='sales.trays'){
      assert(p.ids?.length,'请选择基础产品。');const seen=new Set();p.value.forEach(x=>{assert(c.basics.some(b=>b.id===x.id),'请选择配台产品。');assert(!seen.has(x.id),'配台产品不能重复。');seen.add(x.id);assert(['主配台','辅配台'].includes(x.type),'请选择配台类型。');assert(!p.ids.includes(x.id),'产品不能给自己配台。');});
      p.ids.forEach(id=>{const b=c.basics.find(x=>x.id===id);assert(b,'基础产品已不存在。');b.trays=copy(p.value);b.updatedAt=M.now();});return;
    }
    if(command==='sales.batch')return p.operations.map(x=>apply(s,x.command,x.payload));
    if(P.handlers[command])return P.handlers[command](s,p);
    throw Error('未知产品操作。');
  }
  const P={categories,departments,attributes,classes,feeDefault,basicDefault,validate,seed,apply,fee,handlers:{}};
  const original=M.apply;M.apply=(s,command,p)=>command.startsWith('sales.')?apply(s,command,p):original(s,command,p);
  root.WeidSalesModel=P;
  if(typeof module==='object'&&module.exports)module.exports=P;
})(typeof window==='undefined'?globalThis:window);
