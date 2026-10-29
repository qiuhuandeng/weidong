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
