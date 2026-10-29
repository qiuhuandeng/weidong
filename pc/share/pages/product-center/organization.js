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
