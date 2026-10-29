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
    const seen=new Set();p.materials.forEach(x=>{const k=M.key(x.pid,x.sid);assert(!seen.has(k),'同一库存规格不能重复关联。');seen.add(k);assert(M.product(s,x.pid)&&M.spec(s,x.pid,x.sid),'关联的库存产品或规格不存在，请重新选择。');x.qty=positive(x.qty,'单次服务消耗次数');});
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

;
(function(P,M){
  'use strict';
  const assert=(v,m)=>{if(!v)throw Error(m);},q=M.quantity;
  P.flags=()=>({sms:true,miniVisible:true,orderCheck:true,serviceCheck:true});
  P.specDefault=()=>({id:M.uid('SPEC'),name:'默认',type:'常规',booking:false,gift:false,standardPrice:false,high:0,price:0,low:0,deposit:'',items:[],alias:'',departments:[],...P.flags()});
  P.listingDefault=()=>({name:'',brief:'',department:'',type:'服务',category:'',duration:30,attribute:'常规',enabled:true,sort:0,specs:[P.specDefault()],thumbnail:'',pictures:[],description:''});
  P.seedListings=c=>{
    c.listings=c.basics.slice(0,7).map((b,i)=>({...P.listingDefault(),id:'listing'+i,no:1670+i,name:b.name,type:b.type,category:b.category,department:b.department,sort:100-i,updatedAt:M.now(),specs:[{...P.specDefault(),id:'sale-spec'+i,high:b.price*1.5,price:b.price,low:b.price*.8,deposit:b.price,items:[{source:'基础',id:b.id,qty:1,days:365,ratio:100,actualRatio:100}]}]}));
    c.listings[0].specs.push({...P.specDefault(),id:'sale-spec-multi',name:'3选2组合',high:500,price:300,low:200,deposit:100,items:[{source:'多选',id:'multi1',qty:1,days:365,ratio:100,actualRatio:100}]});
  };
  P.rows=c=>c.listings.flatMap(product=>product.specs.map(spec=>({id:product.id+':'+spec.id,product,spec})));
  P.row=(c,id)=>P.rows(c).find(x=>x.id===id);
  P.item=(c,x)=>(x.source==='基础'?c.basics:c.multiples).find(b=>b.id===x.id);
  P.deptNodes=s=>[{id:'market',name:'市场中心',parent:''},{id:'east',name:'华东区域',parent:'market'},...s.warehouses.filter(x=>x.id!=='w0').map(x=>({id:'store-'+x.id,name:x.name,parent:'east'})),{id:'front',name:'前端咨询',parent:''},{id:'front-consult',name:'咨询组',parent:'front'},{id:'back',name:'后端咨询',parent:''},{id:'back-consult',name:'客服组',parent:'back'}];
  P.settings=(c,category)=>c.categorySettings?.[category]||{departments:[],stores:{}};
  P.handlers['sales.listing']=(s,{value})=>{
    const c=P.validate(s),v=M.copy(value);assert(v.name?.trim(),'请填写上架产品名称。');v.name=v.name.trim();assert(v.category,'请选择所属分类。');assert(['服务','商品'].includes(v.type),'请选择类型。');assert(['常规','外协-他方','内推','外协-我方'].includes(v.attribute),'请选择产品属性。');
    v.duration=q(v.duration,'耗时');v.sort=q(v.sort,'排序');v.enabled=v.enabled===true||v.enabled==='true';assert(v.specs?.length,'请至少添加一个规格。');const ids=new Set();
    v.specs.forEach(sp=>{
      assert(sp.name?.trim(),'请填写规格名称。');sp.id=sp.id||M.uid('SPEC');assert(!ids.has(sp.id),'规格标识重复，请重新添加规格。');ids.add(sp.id);assert(['常规','体验'].includes(sp.type),'请选择规格类型。');
      for(const key of ['high','price','low'])sp[key]=q(sp[key],{high:'高价',price:'原价',low:'底价'}[key]);if(sp.deposit!=='')sp.deposit=q(sp.deposit,'预约金');
      for(const key of ['booking','gift','standardPrice'])sp[key]=sp[key]===true||sp[key]==='true';
      assert(sp.items?.length,'每个规格至少需要一个组成项目。');sp.items.forEach(x=>{
        assert(['基础','多选'].includes(x.source)&&P.item(c,x),'组成项目不存在，请重新选择。');x.qty=q(x.qty,'组成项目数量',false);assert(Number.isInteger(x.qty),'组成项目数量须为整数。');x.days=q(x.days,'有效天数');assert(Number.isInteger(x.days),'有效天数须为整数。');x.ratio=q(x.ratio,'占比');x.actualRatio=q(x.actualRatio,'单项实收占比');assert(x.ratio<=100&&x.actualRatio<=100,'占比不能超过 100%。');
      });
      const previous=c.listings.find(x=>x.id===v.id)?.specs.find(x=>x.id===sp.id);
      // Pricing edits never replace permission/notification settings edited elsewhere.
      for(const key of ['alias','departments',...Object.keys(P.flags())])sp[key]=M.copy(previous?.[key]??sp[key]??(key==='alias'?'':key==='departments'?[]:true));
    });
    v.id=v.id||M.uid('SALE');v.no=v.no||++c.sequence;v.updatedAt=M.now();const at=c.listings.findIndex(x=>x.id===v.id);at<0?c.listings.unshift(v):c.listings.splice(at,1,v);return v.id;
  };
  const targets=(c,p)=>{const rows=p.category?P.rows(c).filter(x=>P.inCategory(x.product.category,p.category)):(p.ids||[]).map(id=>{const row=P.row(c,id);assert(row,'产品规格已不存在，请刷新后重试。');return row;});assert(rows.length,'请选择产品规格或包含产品的分类。');return rows;};
  P.handlers['sales.flags']=(s,p)=>{const c=P.validate(s);targets(c,p).forEach(({spec})=>{for(const k of Object.keys(P.flags())){assert(typeof p.value[k]==='boolean','功能配置值无效。');spec[k]=p.value[k];}});};
  P.handlers['sales.alias']=(s,p)=>{const row=P.row(P.validate(s),p.id);assert(row,'产品规格已不存在。');row.spec.alias=String(p.value||'').trim();};
  P.handlers['sales.departments']=(s,p)=>{
    const c=P.validate(s),nodes=P.deptNodes(s),ids=[...new Set(p.value)];ids.forEach(id=>assert(nodes.some(x=>x.id===id),'所选部门已不存在。'));
    if(p.category){assert(P.categories.includes(p.category),'请选择分类。');c.categorySettings=c.categorySettings||{};c.categorySettings[p.category]={...P.settings(c,p.category),departments:ids};P.rows(c).filter(x=>P.inCategory(x.product.category,p.category)).forEach(x=>x.spec.departments=M.copy(ids));}
    else targets(c,p).forEach(x=>x.spec.departments=M.copy(ids));
  };
  P.handlers['sales.store']=(s,p)=>{
    const c=P.validate(s);assert(P.categories.includes(p.category),'请选择分类。');assert(P.storeCatalog(s).some(x=>x.id===p.wid),'门店不存在。');assert(typeof p.value==='boolean','可服务状态无效。');c.categorySettings=c.categorySettings||{};const config=M.copy(P.settings(c,p.category));config.stores[p.wid]=p.value;c.categorySettings[p.category]=config;
  };
})(WeidSalesModel,WeidStockModel);

;
/* Department hierarchy observed in the source product permission picker.
 * Store permissions use a store catalog, independent of inventory warehouses. */
(function(P){
  const groups={
    '慧娟大区':{
      '华东区域':'南京浦口店 昆山玉山店 扬州邗江店 常州天宁店 徐州云龙店 测试',
      '文莉区域':'上海徐汇店 上海静安店 上海松江店 上海宝山店 上海嘉定店 上海浦东二店 上海黄浦店',
      '韩春区域':'宁波海曙店 金华金东店 宁波鄞州店 嘉兴海宁店 湖州吴兴店 盐城盐都店',
      '云凤区域':'上海浦东店 合肥政务店 合肥瑶海店 上海杨浦店 上海奉贤店 合肥蜀山店 合肥包河店',
      '梅梅区域':'南京玄武店 南京江宁店 南京江浦店 南京建邺店 赣州章贡店 苏州工业园区店 泰州海陵店 上海普陀店 苏州高新店',
      '全威区域':'杭州萧山店 杭州余杭店 温州鹿城店 杭州上城店 温州龙湾店 金华义乌店 台州椒江店 金华永康店 温州乐清店',
      '桂珠区域':'福州晋安店 南昌红谷滩店 泉州晋江店 厦门思明店 福州台江店 南昌高新店 泉州石狮店 九江浔阳店 南昌东湖店 福州仓山店',
      '腾峰区域':'杭州西湖店 绍兴柯桥店 嘉兴经开店 绍兴越城店 杭州余杭二店 杭州上城二店 杭州富阳店 杭州钱塘店 杭州临安店 杭州桐庐店 杭州建德店 杭州滨江店 杭州西湖二店',
      '甜甜区域':'上海闵行店 苏州昆山店 南通崇川店 无锡梁溪二店 上海静安二店 上海闵行二店'
    },
    '顾伟大区':{
      '顾伟区域':'',
      '陈蕾区域':'昆明五华店 昆明官渡店 曲靖麒麟店 玉溪红塔店 大理下关店 丽江古城店 昆明官渡二店 昭通昭阳店',
      '滕亚区域':'成都武侯店 成都锦江店 成都金牛店 成都青羊店 成都天府新区店 成都成华店 成都龙泉店 成都新都店',
      '张露区域':'重庆江北店 重庆渝北店 重庆沙坪坝店 重庆渝中店 北京海淀店 重庆渝北二店 重庆万州店 宜宾莱茵店 泸州江阳二店 银川兴庆店 自贡自流井店',
      '黄丽区域':'重庆南岸店 重庆巴南店 重庆九龙坡店 绵阳涪城店 德阳旌阳店 乐山市中店 重庆江津店 重庆永川店 长沙浏阳店',
      '黄希区域':'十堰张湾店 成都温江店 遂宁船山店 成都双流店 成都郫都店 成都简阳店 成都武侯二店',
      '吴晴区域':'昆明五华二店 红河蒙自店 楚雄鹿城店 昆明西山店 版纳景洪店 北京大兴店 北京亦庄店 北京顺义店 北京丰台二店',
      '贤孟区域':'贵阳南明店 贵阳金阳店 贵阳花溪店 贵阳云岩店 贵阳白云店',
      '西南区域':'内江东兴店 广元利州店 眉山东坡店'
    },
    '琳淋大区':{
      '李琳区域':'龙岩新罗店 厦门集美店 福州福清店 宁德蕉城店 漳州龙文店',
      '赵燕区域':'西安高新店 大同平城店 渭南临渭店',
      '秀红区域':'太原杏花岭店 长治潞州店 太原万柏林店 临汾尧都店 运城盐湖店 晋城城区店',
      '会容区域':'天津河西店 北京朝阳店 北京丰台店 天津滨海店 北京朝阳二店 北京通州店 北京石景山店 天津南开店',
      '婷婉区域':'西安南门店 乌鲁木齐店 郑州二七店 郑州郑东店 乌鲁木齐新市店 郑州金水店',
      '天梅区域':'西宁海湖店 太原小店 银川金凤店 兰州城关店 西安未央店 西安小寨店 兰州七里河店 汉中汉台店'
    },
    '娟琴大区':{
      '春玉区域':'长沙芙蓉店 长沙星沙店 湘潭岳塘店 常德武陵店 恩施银河店 孝感孝南店 随州曾都店 长沙浏阳店',
      '美祯区域':'武汉汉阳店 长沙岳麓店 襄阳樊城店 郴州北湖店 邵阳双清店 武汉硚口店 长沙开福店 长沙宁乡店',
      '晓迪区域':'武汉光谷店 武汉汉街店 武汉江夏店 衡阳雁峰店 永州冷水滩店 娄底娄星店 武汉青山店 怀化鹤城店',
      '满峰区域':'武汉江汉店 荆州万达店 黄石黄石港店 鄂州鄂城店 黄冈黄州店 仙桃沙嘴店 武汉南湖店 武汉江岸店',
      '欣欣区域':'长沙雨花店 株洲芦淞店 岳阳五里牌店 宜昌伍家岗店 咸宁咸安店 荆门掇刀店 长沙天心店'
    },
    '弃用集合':{'弃用':'杭州下城店 浙江温州店 贵阳花溪店 湘潭岳塘二店 无锡梁溪一店 苏州工业园店 哈尔滨道外店 长春红旗店 北京西城店 石家庄裕华店 广州天河二店'},
    '春丽大区':{
      '素华区域':'深圳罗湖店 深圳龙岗店 汕头龙湖店 肇庆端州店 揭阳榕城店 玉林玉州店 百色右江店 深圳龙岗二店',
      '海兰区域':'广州番禺店 东莞南城店 东莞莞城店 东莞长安店 韶关武江店 东莞松山湖店 广州南沙店 广州番禺二店',
      '欧意区域':'南宁青秀店 惠州惠城店 中山石岐店 惠州惠阳店 潮州枫溪店 河源源城店 中山小揽店 梅州梅江二店',
      '结惠区域':'柳州城中店 桂林七星店 南宁江南店 北海海城店 南宁西乡塘店 钦州钦南店 柳州柳南店 南宁良庆店 贵港港北店',
      '小霞区域':'深圳福田店 深圳龙华店 海口龙华店 三亚吉阳店 湛江霞山店 深圳光明店 深圳南山店 江门蓬江店',
      '燕军区域':'广州天河店 深圳宝安店 佛山南海店 广州花都店 佛山顺德店 广州越秀店 佛山三水店 佛山高明店 佛山顺德二店 佛山禅城店 广州海珠店',
      '延鑫区域':'广州白云店 珠海香洲店 珠海斗门店 遵义汇川店 安顺西秀店 兴义汇金店 东莞常平店 广州白云二店',
      '梦玲区域':'深圳沙井店 清远清城店 广州增城店 东莞虎门店 惠州仲恺店 广州黄埔店'
    }
  };
  Object.assign(groups,{
    '多项目组':{'新项目区域-1':'医美外协'},
    '双美事业部':{'医美科':'厦门百星 泉州百星店 成都百星店 杭州百星 成都百星二店','生美科':'泉州丰泽店 厦门二店','医美科项目组':'长沙百星店 上海百星店'},
    '大麦区':{'山东战队':'济南历下店 济南槐荫店','东北战队':'长春宽城店 大连中山店 长春南关店 大连中山二店'}
  });
  const front={
    '月冰战区':{'高超区域':'邹忍战队 高超战队 肖彬战队 晓辉战队 高超储备战队 秋楠战队 彭强战队 周备战队 光照战队 旭林战队 高超测试1组 高超测试2组 高超测试3组','月冰区域':'月冰测试1组 月冰测试2组 月冰测试3组','小丽区域':'小淋战队 佳彬战队 四川战队 吴涵战队 婉钰战队 小丽储备战队 施狄战队 小丽测试1组 小丽测试2组 小丽测试3组','青坪区域':'青坪储备战队 智谋战队 婷婷战队 冰艳战队 东瑶战队 红华战队 小宇战队 夏子战队 青坪测试1组 青坪测试2组 青坪测试3组','志超区域':'志超储备战队 羽茜战队 张彬战队 黄辞战队 小炜战队 韦明战队 江海战队 林岩战队 志超测试1组 志超测试2组 志超测试3组'},
    '王星战区':{'王星区域':'王星储备战队 金华战队 李寅战队 王星测试1组 王星测试2组 王星测试3组','汉立区域':'郭晨战队 晓森战队 宝平战队 汉立储备战队 唐臣战队 怡欣战队 汉立测试1组 汉立测试2组 汉立测试3组','家松区域':'家松储备战队 清治战队 鸥文战队 王境战队 林琦战队 志鹏战队 雨晴战队 贺淼战队 家松测试1组 家松测试2组 家松测试3组','雯欣区域':'冬华战队 雯欣储备战队 艺霞战队 慧珊战队 雨欢战队 文彬战队 林洲战队 文辉战队 杰豪战队 卫琦战队 雯欣测试1组 雯欣测试2组 雯欣测试3组','保财区域':'陈木战队 志轩战队 尉杰战队 金锋战队 热云战队 保财储备战队 保财测试1组 保财测试2组 保财测试3组'},
    '从江战区':{'亮亮区域':'诗庭战队 亮亮储备战队 潇杰战队 红辉战队 刘琛战队 明辉战队 宗建战队 亮亮测试1组 亮亮测试2组 亮亮测试3组','从江区域':'从江储备战队 王铭战队 从江测试1组 从江测试2组 从江测试3组','黄润区域':'荆涛战队 佳豪战队 黄润储备战队 黄润测试1组 黄润测试2组 黄润测试3组','晓佳区域':'伟杰战队 晓佳储备战队 永龙战队 少卿战队 晓佳测试1组 晓佳测试2组 晓佳测试3组'},
    '江西战区':{'叔群区域':'叔群储备战队 仁斌战队 叔群测试1组 叔群测试2组 叔群测试3组','太武区域':'海琨战队 其威战队 太武储备战队 梦婷战队 少奇战队 太武测试1组 太武测试2组 太武测试3组','美娟区域':'美娟储备战队 功南战队 明子战队 贵丽战队 文鸿战队 鲜娇战队 泮归战队 美娟测试1组 美娟测试2组 美娟测试3组'},
    '广州战区':{'希婷区域':'秦东战队 晶晶战队 梦飞战队 希婷储备战队 希婷测试1组 希婷测试2组 希婷测试3组'},
    '01战区':{'01新区':'金华组 惠雅组 梁兴组 浩辉大组 先纯组 玉章组 凯文组 静婷组 01测试1组 01测试2组 01测试3组'},
    '双美战区':{'金鑫区域':'诗琦战队 义兰战队 奕恺战队 金鑫测试1组 金鑫测试2组 金鑫测试3组'},'督导运营部':{}
  };
  const back={'客服组':'','艺霞区域':'江伟战队 夏威战队 饶俊战队','蔡琴区域':'孝东战队 陈燕战队 文辉战队 小冬战队','客户管理部':'台州临海店','大麦战队':''};
  P.organizationGroups=groups;
  P.storeCatalog=s=>{
    const stores=new Map();
    for(const [area,regions] of Object.entries(groups))for(const [region,names] of Object.entries(regions))for(const name of names.split(' ').filter(Boolean)){
      const old=stores.get(name),warehouse=s.warehouses.find(x=>x.id!=='w0'&&x.name===name);
      if(old){old.memberships.push({area,region});continue;}
      stores.set(name,{id:warehouse?.id||'sales-store:'+name,name,enabled:warehouse?.enabled??true,memberships:[{area,region}]});
    }
    for(const w of s.warehouses.filter(x=>x.id!=='w0'))if(!stores.has(w.name))stores.set(w.name,{...w,memberships:[{area:w.area||'',region:w.region||''}]});
    return [...stores.values()];
  };
  P.departmentTree=s=>{
    const areaNodes=(data,prefix)=>Object.entries(data).map(([area,regions])=>({
      value:prefix+area,label:area,
      children:Object.entries(regions).map(([region,names])=>({
        value:prefix+area+'/'+region,label:region,
        children:names.split(' ').filter(Boolean).map(name=>({value:prefix+area+'/'+region+'/'+name,label:name}))
      }))
    }));
    const nodes=[{value:'market',label:'市场中心',children:areaNodes(groups,'department:')}];
    nodes.push({value:'front',label:'前端咨询',children:areaNodes(front,'front:')});
    nodes.push({value:'back',label:'后端咨询',children:Object.entries(back).map(([name,children])=>({value:name==='客服组'?'back-consult':'back:'+name,label:name,children:children.split(' ').filter(Boolean).map(label=>({value:'back:'+name+'/'+label,label}))}))});
    const marketNames=new Set(Object.values(groups).flatMap(regions=>Object.values(regions).flatMap(names=>names.split(' ').filter(Boolean))));
    const extra=s.warehouses.filter(w=>w.id!=='w0'&&!marketNames.has(w.name));
    if(extra.length)nodes[0].children.push({value:'unassigned-stores',label:'未分组门店',children:extra.map(w=>({value:'store-'+w.id,label:w.name}))});
    const current=new Set(),visit=ns=>ns.forEach(n=>{current.add(n.value);if(n.children)visit(n.children);});visit(nodes);
    const saved=[...Object.values(s.salesProducts?.categorySettings||{}).flatMap(x=>x.departments||[]),...(s.salesProducts?.listings||[]).flatMap(x=>x.specs.flatMap(sp=>sp.departments||[]))];
    const historical=[...new Set(saved)].filter(id=>!current.has(id)&&!['east'].includes(id)&&!(id.startsWith('store-')&&s.warehouses.some(w=>w.id===id.slice(6)&&marketNames.has(w.name))));
    if(historical.length)nodes.push({value:'historical-departments',label:'历史配置',children:historical.map(id=>({value:id,label:id==='front-consult'?'咨询组':id}))});
    return nodes;
  };
  P.deptNodes=s=>{const out=[];const walk=(nodes,parent='')=>nodes.forEach(n=>{out.push({id:n.value,name:n.label,parent,leaf:!n.children?.length});if(n.children)walk(n.children,n.value);});walk(P.departmentTree(s));return out;};
  P.storeTree=s=>{
    const stores=P.storeCatalog(s),tree=P.departmentTree(s)[0],known=new Set();
    const convert=n=>{if(n.children?.length){const children=n.children.map(convert).filter(Boolean);return children.length?{...n,children}:null;}const store=stores.find(x=>x.name===n.label);if(!store||known.has(store.id))return null;known.add(store.id);return {value:store.id,label:store.name};};
    const root=convert(tree),additional=stores.filter(x=>!known.has(x.id)).map(x=>({value:x.id,label:x.name}));
    return [...(root?[root]:[]),...additional];
  };
  P.departmentValues=(s,ids)=>{
    const nodes=P.deptNodes(s),out=[];
    for(const id of ids||[]){const n=nodes.find(n=>n.id===id);if(n?.leaf){out.push(id);continue;}
      if(id.startsWith('store-')){const name=s.warehouses.find(w=>w.id===id.slice(6))?.name;nodes.filter(n=>n.leaf&&n.name===name).forEach(n=>out.push(n.id));}
    }
    return [...new Set(out)];
  };
  const categoryChildren={
    X10:['K10'],
    '脱毛女':['修复','四肢部','套餐','保养','私密部分','躯干部分','面颈部'],
    '抖团':['抖团疗程','抖团单次'],
    Y10:['外协项目-公司收款（Y10）','外协项目(Y10)','体验卡项目(Y10)','专场升单(Y10)'],
    '外协项目':['体验卡项目(外协)','专场升单(外协)'],
    '居家产品':['Dr.Meelan系列','深层清洁','化妆水','洁肤','补水搭配','冻干粉','面膜','OF系列','凝胶软膜','防护系列','美白搭配','镇静系列','抗衰修复搭配','祛痘搭配'],
    '皮肤':['基础保湿','清洁类','蛇皮焕肤','抗衰修复','基础祛痘','基础美白','焕肤管理','身体放松','节日套餐','基础眼唇部'],
    '养生':['正骨'],'养生/正骨':['腿型调整','骨盆调整','脊柱调整','脸型调整']
  };
  const roots=[...P.categories];
  const node=(label,value)=>({value,label,...(categoryChildren[value]?{children:categoryChildren[value].map(name=>node(name,value+'/'+name))}:{})});
  P.categoryTree=()=>[{value:'',label:'全部',children:roots.map(label=>node(label,label))}];
  P.categoryOptions=()=>{const out=[];const walk=(nodes,depth)=>nodes.forEach(n=>{out.push([n.value,'　'.repeat(depth)+n.label]);if(n.children)walk(n.children,depth+1);});walk(P.categoryTree()[0].children,0);return out;};
  P.categories.splice(0,P.categories.length,...P.categoryOptions().map(x=>x[0]));
  P.categoryLabel=value=>String(value||'全部').split('/').at(-1);
  P.inCategory=(value,category)=>!category||value===category||value.startsWith(category+'/');
})(WeidSalesModel);

;
(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  Object.assign(S.pages,{'sales-basics':'基础产品','sales-multiple':'多选产品','sales-listings':'产品上架','sales-prices':'产品售价表（新版）'});
  Object.defineProperty(S,'sales',{get:()=>P.validate(S.data)});
  S.salesSelection=rows=>{S.visibleIds=rows.map(x=>x.id);return [S.check('全选',rows.length>0&&rows.every(x=>S.page.selected.includes(x.id)),'selectAll'),x=>S.check('',S.page.selected.includes(x.id),'selected',x.id),55,true];};
  S.salesFeeText=f=>!f?.enabled?'无':f.mode==='percent'?'第一次 '+f.first+'%，之后 '+f.next+'%':f.mode==='first'?'第一次 '+f.first+' 元，之后 '+f.next+' 元':f.mode==='fixed'?'固定每次 '+f.fixed+' 元':f.tiers.map(x=>x.from+' ≤ 实收'+(x.to===null?'':' < '+x.to)+'：'+x.fee+' 元').join('；');
  S.salesBasic=id=>S.sales.basics.find(x=>x.id===id);
  S.views['sales-basics']=()=>{
    const f=S.page.applied,rows=S.sales.basics.filter(x=>S.matches(x.name,f.name)&&(P.inCategory(x.category,f.category))&&(!f.type||x.type===f.type));
    return S.search([S.filter('产品名称','name'),S.filter('所属分类','category','select',[['','全部'],...P.categoryOptions()]),S.filter('类型','type','select',[['','全部'],'服务','商品'])])+S.panel('基础产品',S.paged([S.salesSelection(rows),['ID',x=>x.no],['名称',x=>E(x.name),190],['类型',x=>E(x.type)],['所属分类',x=>E(P.categoryLabel(x.category))],['耗时（分钟）',x=>x.duration,120],['手工费',x=>E(S.salesFeeText(x.fee)),240],['配台',x=>E(x.trays.map(t=>(S.salesBasic(t.id)?.name||'—')+' '+(S.salesBasic(t.id)?.trayRatio||0)+'%（'+t.type+'）').join('、')||'—'),250],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesBasic',x.id),100,true]],rows),B('新增基础产品','salesBasic','','','primary')+B('批量修改手工费','salesFee')+B('配台','salesTrays'));
  };
  S.views['sales-multiple']=()=>{
    const rows=S.sales.multiples.filter(x=>S.matches(x.name,S.page.applied.name));
    return S.search([S.filter('名称','name')])+S.panel('多选产品',S.paged([['ID',x=>x.no],['名称',x=>E(x.name),190],['可选项',x=>x.options.map(id=>E(S.salesBasic(id)?.name||'—')).join('<br>'),300],['可选项目数',x=>x.count,120],['耗时（分钟）',x=>x.duration,120],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesMultiple',x.id),100,true]],rows),B('新增多选产品','salesMultiple','','','primary'));
  };
  S.actions.salesBasic=id=>S.open('salesBasic',{value:M.copy(S.salesBasic(id)||P.basicDefault())},id?'编辑基础产品':'新增基础产品',1120);
  S.salesPhotos=(v,key,multiple=false)=>'<div class="sales-photo-field"><div class="stock-photos">'+(multiple?v[key]:v[key]?[{src:v[key],name:'缩略图'}]:[]).map((x,i)=>'<div class="sales-photo-item"><a href="'+E(x.src)+'" target="_blank" rel="noopener"><img src="'+E(x.src)+'" alt="'+E(x.name)+'"></a>'+L('移除','salesImageRemove',key,String(i))+'</div>').join('')+'</div><input type="file" accept="image/png,image/jpeg,image/webp" '+(multiple?'multiple':'')+' aria-label="上传'+(multiple?'效果图':'缩略图')+'" data-pc-upload="'+(multiple?'添加效果图':v[key]?'更换缩略图':'上传缩略图')+'" data-stock-action="salesImage" data-stock-id="'+key+'"><p class="sales-field-hint">PNG / JPG / WebP，单张不超过 2 MB'+(multiple?'；一次最多添加 6 张':'')+'</p></div>';
  S.salesWideField=(label,control,required=false)=>F(label,control,required).replace('class="field"','class="field ub-span"');
  S.salesStorePicker=stores=>'<button type="button" class="btn rule-config-picker" aria-label="选择可维护门店" data-stock-action="salesStores"><span>'+E(stores.length?'已选 '+stores.length+' 家门店':'请选择门店')+'</span>'+icon('down')+'</button>';
  S.salesFeeFields=(f,prefix='value.fee')=>{
    const fields=[F('是否有手工费',C('是否有手工费',[['false','否'],['true','是']],String(f.enabled),prefix+'.enabled','data-stock-action="salesDynamic"'))];
    if(f.enabled===true||f.enabled==='true'){
      fields.push(F('计算方式',C('手工费计算方式',[['percent','按项目实收比例'],['first','按次数：首次 / 之后'],['fixed','按次数：固定每次'],['tier','按单次实收业绩区间']],f.mode,prefix+'.mode','data-stock-action="salesDynamic"')));
      if(f.mode==='percent'||f.mode==='first')fields.push(F('第一次（'+(f.mode==='percent'?'%':'元')+'）',I('第一次手工费',f.first,prefix+'.first','number')),F('之后（'+(f.mode==='percent'?'%':'元')+'）',I('之后手工费',f.next,prefix+'.next','number')));
      if(f.mode==='fixed')fields.push(F('固定每次（元）',I('固定每次手工费',f.fixed,prefix+'.fixed','number')));
    }
    let html=S.form(fields);
    if((f.enabled===true||f.enabled==='true')&&f.mode==='tier')html+=S.table([['实收业绩下限（元）',(x,i)=>i?E(f.tiers[i-1].to):0,160],['实收业绩上限（元）',(x,i)=>i===f.tiers.length-1?'不限':I('区间上限 '+(i+1),x.to,prefix+'.tiers.'+i+'.to','number'),190],['操作手工费（元）',(x,i)=>I('区间手工费 '+(i+1),x.fee,prefix+'.tiers.'+i+'.fee','number'),190],['操作',(x,i)=>i===f.tiers.length-1?'':L('删除','salesFeeTierRemove',String(i)),90]],f.tiers)+'<div class="sales-table-actions">'+B('添加区间','salesFeeTierAdd')+'</div>';
    return html;
  };
  S.drawers.salesBasic=l=>{
    const v=l.data.value,materials=v.materials.map(x=>({...x,product:M.product(S.data,x.pid),spec:M.spec(S.data,x.pid,x.sid)}));
    let body=S.section('基本信息',S.form([F('名称',I('基础产品名称',v.name,'value.name'),true),F('类型',C('产品类型',['服务','商品'],v.type,'value.type','data-stock-action="salesDynamic"'),true),F('所属分类',C('所属分类',[['','请选择'],...P.categoryOptions()],v.category,'value.category'),true),F('耗时（分钟）',I('耗时（分钟）',v.duration,'value.duration','number'),true),F('科室',C('科室',[['','请选择'],...P.departments],v.department,'value.department')),F('项目属性',C('项目属性',[['','请选择'],...P.attributes],v.attribute,'value.attribute')),F('品类',C('品类',[['','请选择'],...P.classes],v.productClass,'value.productClass')),F('单项实收价格',I('单项实收价格',v.price,'value.price','number'),true),...(v.type==='服务'?[F('可维护门店',S.salesStorePicker(v.stores))]:[])]));
    body+=S.section('关联产品',S.table([['编号',x=>E(x.product?.code)],['物品名称',x=>E(x.product?.name),170],['规格',x=>E(x.spec?.name)],['单位',x=>E(x.product?.unit)],['分多次使用',x=>x.spec?.uses||1,120],['单次服务消耗次数',(x,i)=>I('单次服务消耗次数 '+(i+1),x.qty,'value.materials.'+i+'.qty','number'),180],['操作',(x,i)=>L('移除','salesMaterialRemove',String(i)),90]],materials),B('选择产品','salesMaterials'));
    body+=S.section('图片资料',S.form([F('缩略图',S.salesPhotos(v,'thumbnail')),F('效果图',S.salesPhotos(v,'pictures',true))]));
    body+=S.section('内容介绍','<textarea data-pc-richtext aria-label="内容介绍" data-stock-bind="value.description">'+E(v.description)+'</textarea>');
    body+=S.section('手工费与配台',S.salesFeeFields(v.fee)+S.form([F('配台占比（%）',I('配台占比',v.trayRatio,'value.trayRatio','number'))]));
    return {body,footer:B('取消','close')+B('保存数据','salesSaveBasic','','','primary')};
  };
  S.actions.salesSaveBasic=()=>S.run('sales.basic',{value:S.top.data.value},()=>S.close());
  S.actions.salesDynamic=()=>S.actions.drawRefresh();
  S.actions.salesMaterialRemove=id=>{S.top.data.value.materials.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesImage=async(key,extra,input)=>{const l=S.top,images=await S.readImages(input.files);if(!S.state.layers.includes(l))return;if(key==='thumbnail')l.data.value.thumbnail=images[0]?.src||l.data.value.thumbnail;else l.data.value[key].push(...images);S.actions.drawRefresh();};
  S.actions.salesImageRemove=(key,index)=>{if(key==='thumbnail')S.top.data.value[key]='';else S.top.data.value[key].splice(Number(index),1);S.actions.drawRefresh();};
  S.actions.salesMaterials=()=>S.open('salesMaterials',{query:'',category:'',selected:S.top.data.value.materials.map(x=>M.key(x.pid,x.sid))},'选择库存产品',860);
  S.drawers.salesMaterials=l=>{
    const d=l.data,rows=M.catalog(S.data).filter(x=>x.product.enabled&&S.matches(x.product.name+' '+x.product.code,d.query)&&S.inCategory(x.product.category,d.category));
    return {body:S.layerSearch([I('物品名称',d.query,'query','text','placeholder="物品名称 / 编号"'),C('所属分类',S.categoryOptions(),d.category,'category')])+S.table([['选择',x=>S.check('',d.selected.includes(x.key),'salesPickMaterial',x.key),70],['编号',x=>E(x.product.code)],['物品名称',x=>E(x.product.name),180],['所属分类',x=>E(S.cat(x.product.category))],['单位',x=>E(x.product.unit)],['规格型号',x=>E(x.name),140]],rows),footer:B('取消','close')+B('确定','salesConfirmMaterials','','','primary')};
  };
  S.actions.salesPickMaterial=(id,extra,input)=>{const set=new Set(S.top.data.selected);input.checked?set.add(id):set.delete(id);S.top.data.selected=[...set];};
  S.actions.salesConfirmMaterials=()=>{const ids=S.top.data.selected,parent=S.state.layers.at(-2).data.value,old=parent.materials;parent.materials=ids.map(id=>{const [pid,sid]=id.split(':');return old.find(x=>M.key(x.pid,x.sid)===id)||{pid,sid,qty:1};});S.close();S.actions.drawRefresh();};
  S.actions.salesStores=()=>S.open('salesStores',{query:'',selected:[...S.top.data.value.stores]},'维护门店选择',860);
  S.drawers.salesStores=l=>({body:'<div data-sales-maintenance-stores data-pc-hierarchy="'+E(JSON.stringify({nodes:P.storeTree(S.data),value:l.data.selected,query:l.data.query,entityLabel:'门店'}))+'"></div>',footer:B('取消','close')+B('确定','salesConfirmStores','','','primary')});
  document.addEventListener('pc-hierarchy-change',e=>{if(e.target.matches('[data-sales-maintenance-stores]')&&S.top?.type==='salesStores')S.top.data.selected=e.detail;});
  document.addEventListener('pc-hierarchy-query',e=>{if(e.target.matches('[data-sales-maintenance-stores]')&&S.top?.type==='salesStores')S.top.data.query=e.detail;});
  S.actions.salesConfirmStores=()=>{S.state.layers.at(-2).data.value.stores=[...S.top.data.selected];S.close();S.actions.drawRefresh();};
  S.actions.salesFee=()=>{if(!S.page.selected.length)throw Error('请选择基础产品。');S.open('salesFee',{ids:[...S.page.selected],value:{fee:M.copy(S.salesBasic(S.page.selected[0]).fee)}},'批量修改手工费',860);};
  S.drawers.salesFee=l=>({body:S.summary({'已选基础产品':l.data.ids.length})+S.section('手工费设置',S.salesFeeFields(l.data.value.fee)),footer:B('取消','close')+B('确定','salesSaveFee','','','primary')});
  S.actions.salesSaveFee=()=>S.run('sales.fee',{ids:S.top.data.ids,value:S.top.data.value.fee},()=>S.close());
  S.actions.salesFeeTierAdd=()=>{const tiers=S.top.data.value.fee.tiers,last=tiers.at(-1);last.to=(Number(tiers.at(-2)?.to)||0)+100;tiers.push({from:last.to,to:null,fee:0});S.actions.drawRefresh();};
  S.actions.salesFeeTierRemove=id=>{S.top.data.value.fee.tiers.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesTrays=()=>{if(!S.page.selected.length)throw Error('请选择基础产品。');S.open('salesTrays',{ids:[...S.page.selected],value:M.copy(S.salesBasic(S.page.selected[0]).trays)},'配台产品',860);};
  S.drawers.salesTrays=l=>({body:S.summary({'已选基础产品':l.data.ids.length})+S.section('配台明细',S.table([['配台产品',(x,i)=>C('配台产品 '+(i+1),[['','请输入产品名称'],...S.sales.basics.filter(b=>!l.data.ids.includes(b.id)).map(b=>[b.id,b.name])],x.id,'value.'+i+'.id'),280],['配台类型',(x,i)=>C('配台类型 '+(i+1),[['','请选择'],'主配台','辅配台'],x.type,'value.'+i+'.type'),200],['操作',(x,i)=>L('删除','salesTrayRemove',String(i)),100]],l.data.value),B('新增配台','salesTrayAdd')),footer:B('取消','close')+B('确定','salesSaveTrays','','','primary')});
  S.actions.salesTrayAdd=()=>{S.top.data.value.push({id:'',type:''});S.actions.drawRefresh();};
  S.actions.salesTrayRemove=id=>{S.top.data.value.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesSaveTrays=()=>S.run('sales.trays',{ids:S.top.data.ids,value:S.top.data.value},()=>S.close());
  S.actions.salesMultiple=id=>S.open('salesMultiple',{value:M.copy(S.sales.multiples.find(x=>x.id===id)||{name:'',options:[],count:1,duration:0,thumbnail:''})},id?'编辑多选产品':'新增多选产品',860);
  S.drawers.salesMultiple=l=>{
    const v=l.data.value;
    return {body:S.section('基本信息',S.form([F('名称',I('多选产品名称',v.name,'value.name'),true),F('耗时（分钟）',I('耗时（分钟）',v.duration,'value.duration','number'),true),S.salesWideField('可选项',C('可选基础产品',S.sales.basics.map(x=>[x.id,x.name]),v.options,'value.options','multiple'),true),F('可选项目数',I('可选项目数',v.count,'value.count','number'),true)]))+S.section('图片资料',S.form([F('缩略图',S.salesPhotos(v,'thumbnail'))])),footer:B('取消','close')+B('确定','salesSaveMultiple','','','primary')};
  };
  S.actions.salesSaveMultiple=()=>S.run('sales.multiple',{value:S.top.data.value},()=>S.close());
})(StockPC,WeidSalesModel);

;
(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const yes=[['true','是'],['false','否']],itemName=x=>P.item(S.sales,x)?.name||'—';
  S.views['sales-listings']=()=>{
    const f=S.page.applied,rows=S.sales.listings.filter(x=>S.matches(x.name,f.name)&&(P.inCategory(x.category,f.category))&&(!f.type||x.type===f.type)).sort((a,b)=>b.sort-a.sort);
    return S.search([S.filter('产品名称','name'),S.filter('所属分类','category','select',[['','全部'],...P.categoryOptions()]),S.filter('类型','type','select',[['','全部'],'服务','商品'])])+S.panel('产品上架',S.paged([['ID',x=>x.no],['产品名称',x=>E(x.name),220],['类型',x=>E(x.type)],['所属分类',x=>E(P.categoryLabel(x.category)),140],['状态',x=>S.tag(x.enabled?'上架':'下架')],['排序值',x=>x.sort],['更新时间',x=>E(x.updatedAt),170],['操作',x=>L('编辑','salesListing',x.id),100,true]],rows),B('上架产品','salesListing','','','primary'));
  };
  S.actions.salesListing=id=>S.open('salesListing',{value:M.copy(S.sales.listings.find(x=>x.id===id)||P.listingDefault())},id?'编辑上架产品':'上架产品',1120);
  S.drawers.salesListing=l=>{
    const v=l.data.value;
    let body=S.section('基本信息',S.form([F('名称',I('上架产品名称',v.name,'value.name'),true),F('类型',C('上架产品类型',['服务','商品'],v.type,'value.type'),true),F('所属分类',C('所属分类',[['','请选择'],...P.categoryOptions()],v.category,'value.category'),true),F('耗时（分钟）',I('耗时（分钟）',v.duration,'value.duration','number'),true),F('科室分类',C('科室分类',[['','请选择'],...P.departments],v.department,'value.department')),F('产品属性',C('产品属性',['常规','外协-他方','内推','外协-我方'],v.attribute,'value.attribute'),true),F('状态',C('上架状态',[['true','上架'],['false','下架']],String(v.enabled),'value.enabled')),F('排序',I('排序值',v.sort,'value.sort','number','placeholder="数字越高越靠前"')),S.salesWideField('描述',I('描述',v.brief,'value.brief'))]));
    let specs='';
    v.specs.forEach((sp,i)=>{
      const p='value.specs.'+i;
      specs+='<div class="sales-spec">'+S.section('规格 '+(i+1),S.form([F('名称',I('规格名称 '+(i+1),sp.name,p+'.name'),true),F('规格类型',C('规格类型 '+(i+1),['常规','体验'],sp.type,p+'.type')),F('自助预约',C('自助预约 '+(i+1),yes,String(sp.booking),p+'.booking')),F('赠送',C('赠送 '+(i+1),yes,String(sp.gift),p+'.gift')),F('价格标准化',C('价格标准化 '+(i+1),yes,String(sp.standardPrice),p+'.standardPrice')),F('小程序预约金',I('预约金 '+(i+1),sp.deposit,p+'.deposit','number')),F('高价（一档）',I('高价 '+(i+1),sp.high,p+'.high','number')),F('原价（二档）',I('原价 '+(i+1),sp.price,p+'.price','number')),F('底价（三档）',I('底价 '+(i+1),sp.low,p+'.low','number'))])+S.section('组成产品',S.table([['来源',x=>E(x.source)],['产品',x=>E(itemName(x))+' × '+x.qty,220],['有效天数',x=>x.days],['占比（%）',(x,j)=>I('占比 '+(i+1)+'-'+(j+1),x.ratio,p+'.items.'+j+'.ratio','number'),150],['单项实收占比（%）',(x,j)=>I('单项实收占比 '+(i+1)+'-'+(j+1),x.actualRatio,p+'.items.'+j+'.actualRatio','number'),180],['操作',(x,j)=>L('移除','salesItemRemove',String(i),String(j)),90]],sp.items),B('添加产品','salesItem',String(i))),B('移除规格','salesSpecRemove',String(i)))+'</div>';
    });
    body+=S.section('产品规格',specs,B('添加规格','salesSpecAdd'));
    body+=S.section('图片资料',S.form([F('缩略图',S.salesPhotos(v,'thumbnail')),F('效果图',S.salesPhotos(v,'pictures',true))]))+S.section('内容介绍','<textarea data-pc-richtext aria-label="内容介绍" data-stock-bind="value.description">'+E(v.description)+'</textarea>');
    return {body,footer:B('取消','close')+B('保存数据','salesSaveListing','','','primary')};
  };
  S.actions.salesSpecAdd=()=>{S.top.data.value.specs.push(P.specDefault());S.actions.drawRefresh();};
  S.actions.salesSpecRemove=id=>{S.top.data.value.specs.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.salesItemRemove=(id,j)=>{S.top.data.value.specs[Number(id)].items.splice(Number(j),1);S.actions.drawRefresh();};
  S.actions.salesItem=id=>S.open('salesItem',{spec:Number(id),value:{source:'基础',id:'',qty:1,ratio:0,actualRatio:100,days:365}},'添加组成产品',560);
  S.drawers.salesItem=l=>{
    const v=l.data.value,options=v.source==='基础'?S.sales.basics:S.sales.multiples;
    return {body:S.form([F('产品来源',C('产品来源',['基础','多选'],v.source,'value.source','data-stock-action="salesItemSource"')),F('产品',C('组成产品',[['','请输入产品名称'],...options.map(x=>[x.id,x.name])],v.id,'value.id'),true),F('数量',I('组成产品数量',v.qty,'value.qty','number'),true),F('占比（%）',I('组成产品占比',v.ratio,'value.ratio','number'),true),F('有效天数',I('有效天数',v.days,'value.days','number'))]),footer:B('取消','close')+B('确定','salesItemConfirm','','','primary')};
  };
  S.actions.salesItemSource=()=>{S.top.data.value.id='';S.actions.drawRefresh();};
  S.actions.salesItemConfirm=()=>{
    const d=S.top.data,v=d.value;if(!P.item(S.sales,v))throw Error('请选择组成产品。');v.qty=M.quantity(v.qty,'数量',false);if(!Number.isInteger(v.qty))throw Error('数量须为整数。');v.days=M.quantity(v.days,'有效天数');v.ratio=M.quantity(v.ratio,'占比');if(v.ratio>100)throw Error('占比不能超过 100%。');
    S.state.layers.at(-2).data.value.specs[d.spec].items.push(M.copy(v));S.close();S.actions.drawRefresh();
  };
  S.actions.salesSaveListing=()=>S.run('sales.listing',{value:S.top.data.value},()=>S.close());
})(StockPC,WeidSalesModel);

;
(function(S,P){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const flagLabels={sms:'短信消息通知',miniVisible:'小程序明细允许查看',orderCheck:'开单项目客户校验',serviceCheck:'维护项目客户校验'};
  const flagFieldLabels={sms:'短信通知',miniVisible:'小程序明细',orderCheck:'开单客户校验',serviceCheck:'维护客户校验'};
  const flagNotes={sms:'仅控制短信通知开关，发送内容沿用默认短信规则。',miniVisible:'控制顾客是否可在小程序查看该产品的消费明细。',orderCheck:'仅控制该规格作为开单项目时是否参与客户校验。',serviceCheck:'控制维护消费项目的客户校验，与开单项目独立设置。'};
  const rowName=r=>r.product.name+'（'+r.spec.name+'）';
  const category=()=>S.page.category||'';
  const rows=()=>P.rows(S.sales).filter(x=>P.inCategory(x.product.category,category()));
  const draft=()=>{const p=S.page,key=category();p.departmentDrafts=p.departmentDrafts||{};return p.departmentDrafts[key]||(p.departmentDrafts[key]={selected:P.departmentValues(S.data,P.settings(S.sales,key).departments),query:'',revision:S.data.revision});};
  const deptData=()=>S.top?.type==='salesDepartments'?S.top.data:draft();
  const departmentUI=d=>'<div data-sales-departments data-pc-hierarchy="'+E(JSON.stringify({nodes:P.departmentTree(S.data),value:d.selected,query:d.query}))+'"></div>';
  const namedTable=(markup,name)=>markup.replace('<table ','<table data-pc-table-name="pc.sales.'+name+'" ');
  const rememberContext=()=>{const p=S.page;p.priceContexts=p.priceContexts||{};p.priceContexts[category()+'|'+(p.tab||'产品明细')]=M.copy({filters:p.filters,applied:p.applied,page:p.page,size:p.size,selected:p.selected});};
  const restoreContext=()=>{const p=S.page,v=p.priceContexts?.[category()+'|'+(p.tab||'产品明细')];Object.assign(p,v?M.copy(v):{filters:{},applied:{},page:1,size:20,selected:[]});};
  const draw=()=>{const left=document.querySelector('.sales-category-tree'),scroll=left?.scrollTop||0;S.render();requestAnimationFrame(()=>{const el=document.querySelector('.sales-category-tree');if(el)el.scrollTop=scroll;});};
  const storeOptions=()=>{
    const f=S.page.filters,stores=P.storeCatalog(S.data),areas=Object.keys(P.organizationGroups),regions=[...new Set(Object.entries(P.organizationGroups).filter(([area])=>S.chosen(f.area,area)).flatMap(([,regions])=>Object.keys(regions)))];
    const visible=stores.filter(x=>x.memberships.some(m=>S.chosen(f.area,m.area)&&S.chosen(f.region,m.region)));
    return {areas,regions,stores:visible};
  };
  const storeFilters=()=>{
    const p=S.page,opts=storeOptions(),expanded=p.filterExpanded||{},fields=[['area','门店大区',opts.areas.map(x=>({value:x,label:x}))],['region','门店区域',opts.regions.map(x=>({value:x,label:x}))],['wid','门店名称',opts.stores.map(x=>({value:x.id,label:x.name}))]];
    return '<section class="panel sales-store-search"><div data-sales-store-filters data-pc-options="'+E(JSON.stringify(fields.map(([key,label,options])=>({key,label,options,value:Array.isArray(p.filters[key])?p.filters[key]:[],expanded:expanded[key]}))))+'"></div>'+S.search([S.filter('可服务','enabled','select',[['','全部'],['true','可服务'],['false','不可服务']])])+'</section>';
  };
  S.views['sales-prices']=()=>{
    const p=S.page,cat=category(),tab=p.tab||'产品明细',f=p.applied;
    let html='<div class="sales-category-caption">'+B(p.categoryHidden?'展开分类':'收起分类','salesToggleCategories','','','text')+'<strong>'+E(P.categoryLabel(cat))+'</strong></div>';
    let tabs=S.tabs(['产品明细','部门配置','门店配置'],tab,'salesPriceTab').replace('库存业务页签','产品售价页签');
    if(!cat)tabs=tabs.replace(/data-stock-extra="(部门配置|门店配置)"/g,'data-stock-extra="$1" disabled title="请先在左侧选择产品分类"');
    html+=tabs;
    if(tab==='部门配置'&&cat)html+=S.panel('设置项目允许被哪些部门使用',departmentUI(draft()),B('重置','salesDepartmentReset')+B('确定','salesSaveCategoryDepartments','','','primary'));
    else if(tab==='门店配置'&&cat){
      const config=P.settings(S.sales,cat),stores=P.storeCatalog(S.data).filter(x=>x.memberships.some(m=>S.chosen(f.area,m.area)&&S.chosen(f.region,m.region))&&S.chosen(f.wid,x.id)&&(!f.enabled||String(config.stores[x.id]!==false)===f.enabled));
      html+=storeFilters()+S.panel('门店配置','<div class="sales-store-table">'+namedTable(S.table([['序号',(x,i)=>i+1,70],['门店名称',x=>E(x.name),240],['可服务',x=>'<label class="switch"><input type="checkbox" aria-label="'+E(x.name)+'可服务" '+(config.stores[x.id]!==false?'checked':'')+' data-stock-action="salesStoreToggle" data-stock-id="'+E(x.id)+'"></label>',120]],stores),'stores')+'</div>');
    }else{
      html+=S.search([S.filter('产品名称','name'),...(!cat?[S.filter('科室分类','department','select',[['','全部'],...P.departments])]:[]),S.filter('状态','type','select',[['','全部'],'服务','商品'])]);
      const filtered=rows().filter(x=>S.matches(rowName(x),f.name)&&(!f.type||x.product.type===f.type)&&(!f.department||x.product.department===f.department));S.visibleIds=filtered.map(x=>x.id);
      const columns=[[S.check('全选',filtered.length>0&&filtered.every(x=>p.selected.includes(x.id)),'salesPriceAll'),x=>S.check('',p.selected.includes(x.id),'salesPriceSelected',x.id),55,true],['序号',(x,i)=>(p.page-1)*p.size+i+1,70],['产品名称',x=>E(rowName(x)),220],['产品内容',x=>x.spec.items.map(v=>E(v.source+' · '+(P.item(S.sales,v)?.name||'—')+' × '+v.qty)).join('<br>'),250],['通知与展示状态',x=>E((x.spec.sms?'短信开启':'短信关闭')+' / '+(x.spec.miniVisible?'小程序可见':'小程序隐藏')),220],['项目校验状态',x=>E((x.spec.orderCheck?'开单需校验':'开单免校验')+' / '+(x.spec.serviceCheck?'维护需校验':'维护免校验')),230],['小程序名称',x=>E(x.spec.alias||'—'),170],['所属类别',x=>E(P.categoryLabel(x.product.category)),130],['类型',x=>E(x.product.type)],['价格',x=>Number(x.spec.price).toFixed(2),110],['操作',x=>L('部门','salesDepartments',x.id)+L('编辑代称','salesAlias',x.id),170,true]];
      html+=S.panel('产品规格功能配置 · '+P.categoryLabel(cat),'<p>未选择产品时，对当前分类应用通知、展示及项目校验设置。</p>',B(p.selected.length?'配置已选产品（'+p.selected.length+'）':'配置当前分类','salesFlags','','','primary',!p.selected.length&&!cat)+(p.selected.length?B('取消选择','salesPriceClear'):''))+S.panel('产品明细',namedTable(S.paged(columns,filtered),'prices'));
    }
    return '<div class="sales-layout'+(p.categoryHidden?' is-category-hidden':'')+'">'+(!p.categoryHidden?'<aside class="panel sales-category-tree" aria-label="产品分类"><div data-sales-categories data-pc-tree="'+E(JSON.stringify({nodes:P.categoryTree(),value:cat,expanded:p.categoryExpanded||[''],label:'产品分类'}))+'"></div></aside>':'')+'<div class="sales-main">'+html+'</div></div>';
  };
  S.actions.salesToggleCategories=()=>{S.page.categoryHidden=!S.page.categoryHidden;draw();};
  S.actions.salesPriceCategory=(id,extra,el)=>{rememberContext();S.page.category=el?.value??id;S.page.selected=[];if(!category())S.page.tab='产品明细';restoreContext();draw();};
  S.actions.salesPriceTab=(id,value)=>{if(!category()&&value!=='产品明细')return;rememberContext();S.page.tab=value;restoreContext();draw();};
  document.addEventListener('pc-tree-select',e=>{if(e.target.matches('[data-sales-categories]'))S.actions.salesPriceCategory(e.detail);});
  document.addEventListener('pc-tree-expand',e=>{if(e.target.matches('[data-sales-categories]'))S.page.categoryExpanded=e.detail;});
  document.addEventListener('pc-hierarchy-change',e=>{if(e.target.matches('[data-sales-departments]'))deptData().selected=[...e.detail];});
  document.addEventListener('pc-hierarchy-query',e=>{if(e.target.matches('[data-sales-departments]'))deptData().query=e.detail;});
  document.addEventListener('pc-options-expand',e=>{if(e.target.matches('[data-sales-store-filters]')){const p=S.page;p.filterExpanded=p.filterExpanded||{};p.filterExpanded[e.detail.key]=e.detail.value;}});
  document.addEventListener('pc-options-change',e=>{if(!e.target.matches('[data-sales-store-filters]'))return;const p=S.page,{key,value}=e.detail;p.filters[key]=value;if(key==='area'){const regions=storeOptions().regions;p.filters.region=(p.filters.region||[]).filter(x=>regions.includes(x));}if(key!=='wid'){const stores=storeOptions().stores;p.filters.wid=(p.filters.wid||[]).filter(id=>stores.some(x=>x.id===id));}draw();});
  S.actions.salesPriceSelected=(id,extra,el)=>{S.actions.selected(id,extra,el);S.render();};
  S.actions.salesPriceAll=(id,extra,el)=>{S.actions.selectAll(id,extra,el);};
  S.actions.salesPriceClear=()=>{S.page.selected=[];S.render();};
  S.actions.salesFlags=()=>{
    const ids=[...S.page.selected],target=ids.length?ids.map(id=>P.row(S.sales,id)).filter(Boolean):rows();if(!target.length)throw Error('当前分类没有可配置的产品。');
    S.open('salesFlags',{ids,category:ids.length?'':category(),names:target.map(rowName),value:Object.fromEntries(Object.keys(flagLabels).map(k=>[k,target.every(r=>r.spec[k])]))},'产品规格功能配置',560);
  };
  S.drawers.salesFlags=l=>({body:S.summary({'配置范围':l.data.category?'【'+l.data.category+'】分类下所有项目':'所选产品','产品规格数':l.data.names.length})+'<details class="sales-config-targets"><summary>查看配置对象</summary><p>'+l.data.names.map(E).join('<br>')+'</p></details>'+S.form(Object.entries(flagLabels).map(([key,label])=>F(flagFieldLabels[key],C(label,[['true','开启'],['false','关闭']],String(l.data.value[key]),'value.'+key)+'<p class="sales-field-hint">'+E(flagNotes[key])+'</p>'))),footer:B('取消','close')+B('确认保存','salesSaveFlags','','','primary')});
  S.actions.salesSaveFlags=()=>{const d=S.top.data,value=Object.fromEntries(Object.keys(flagLabels).map(k=>[k,d.value[k]===true||d.value[k]==='true']));S.run('sales.flags',{ids:d.ids,category:d.category,value},()=>S.close());};
  S.actions.salesAlias=id=>{const r=P.row(S.sales,id);S.open('salesAlias',{id,value:r.spec.alias,name:rowName(r)},'编辑代称',560);};
  S.drawers.salesAlias=l=>({body:S.summary({'产品':l.data.name})+S.form([F('小程序名称',I('小程序名称',l.data.value,'value'))]),footer:B('取消','close')+B('确定','salesSaveAlias','','','primary')});
  S.actions.salesSaveAlias=()=>S.run('sales.alias',{id:S.top.data.id,value:S.top.data.value},()=>S.close());
  S.actions.salesDepartments=id=>{const r=P.row(S.sales,id);S.open('salesDepartments',{ids:[id],selected:P.departmentValues(S.data,r.spec.departments),query:'',name:rowName(r),category:r.product.category,type:r.product.type},'配置产品部门权限',860);};
  S.drawers.salesDepartments=l=>({body:S.summary({'产品名称':l.data.name,'所属项目':l.data.category,'类型':l.data.type})+departmentUI(l.data),footer:B('取消','close')+B('保存','salesSaveDepartments','','','primary')});
  S.actions.salesDepartmentReset=()=>{S.page.departmentDrafts[category()]={selected:P.departmentValues(S.data,P.settings(S.sales,category()).departments),query:'',revision:S.data.revision};S.render();};
  S.actions.salesSaveDepartments=()=>S.run('sales.departments',{ids:S.top.data.ids,value:S.top.data.selected},()=>S.close());
  S.actions.salesSaveCategoryDepartments=()=>{const d=draft();S.run('sales.departments',{category:category(),value:d.selected},()=>{d.revision=S.data.revision;},d.revision);};
  S.actions.salesStoreToggle=(wid,extra,el)=>{const scroll=[...document.querySelectorAll('.sales-store-table .vxe-table--body-inner-wrapper')].map(x=>[x.scrollTop,x.scrollLeft]);S.run('sales.store',{category:category(),wid,value:el.checked},()=>requestAnimationFrame(()=>document.querySelectorAll('.sales-store-table .vxe-table--body-inner-wrapper').forEach((x,i)=>{x.scrollTop=scroll[i]?.[0]||0;x.scrollLeft=scroll[i]?.[1]||0;})),S.data.revision);};
})(StockPC,WeidSalesModel);

;
window.PCModules['product-center']=(()=>{
  const S=StockPC,P=WeidSalesModel;
  async function initialize(){
    await window.PCModules['stock-management'].ready;
    if(!S.data)throw S.state.error||Error('库存产品数据尚未加载，无法读取关联产品。');
    if(S.data.salesProducts===undefined){
      try{await S.db.commit('sales.initialize',{},S.data.revision);}
      catch(error){await S.db.read();if(S.data.salesProducts===undefined)throw error;}
    }
    P.validate(S.data);S.productError=null;
  }
  for(const route of ['sales-basics','sales-multiple','sales-listings','sales-prices']){
    const view=S.views[route];S.views[route]=()=>{try{P.validate(S.data);return view();}catch(error){return S.panel('产品数据暂时无法加载','<p role="alert">'+S.E(S.productError?.message||error.message)+'</p>'+S.button('重新读取','salesRetry'));}};
  }
  // Product-only content grouping; shared drawer sizing and controls stay in PCUI.
  for(const type of Object.keys(S.drawers).filter(type=>type.startsWith('sales'))){
    const drawer=S.drawers[type];
    S.drawers[type]=layer=>{const view=drawer(layer);return {...view,body:'<div class="sales-drawer-content">'+view.body+'</div>'};};
  }
  S.actions.salesRetry=async()=>{try{await S.db.initialize();await initialize();}catch(error){S.productError=error;}S.render();};
  const ready=Promise.resolve().then(initialize).catch(error=>{S.productError=error;});
  return {ready,render:()=>window.PCModules['stock-management'].render(),redraw:()=>S.render(),leave:()=>window.PCModules['stock-management'].leave()};
})();
