/* Activity pricing contract. The standalone V3 embeds this same domain code. */
(function(root){
  'use strict';
  const copy=v=>JSON.parse(JSON.stringify(v));
  const now=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date()).replace(' ','T');
  const cents=v=>Math.round(Number(v||0)*100);
  const day=(offset=0)=>{const d=new Date(now().slice(0,10)+'T12:00:00+08:00');d.setUTCDate(d.getUTCDate()+offset);return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(d);};
  const uid=()=> 'ACT'+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  const stores=()=>['上海徐汇店','上海静安店','上海浦东店'].map((name,i)=>({id:'w'+(i+1),name}));
  function demoCatalog(){
    const names=['眼部舒缓护理','净颜清洁护理','舒缓修护护理','水润保湿护理','身体舒缓护理','修护面膜（盒）','精华护理（单次）'];
    const rows=names.map((name,i)=>({key:'listing'+i+':sale-spec'+i,productId:'listing'+i,specId:'sale-spec'+i,name,specName:'默认',category:['S10','M10','半永久女','W10','K10','K20','K30'][i],type:i===5?'商品':'服务',normalPrice:100+i*20,floorPrice:(100+i*20)*.8,enabled:true,disabledStores:[]}));
    rows.splice(1,0,{...rows[0],key:'listing0:sale-spec-multi',specId:'sale-spec-multi',specName:'3选2组合',normalPrice:300,floorPrice:200});return rows;
  }
  function catalog(s){
    if(!s?.salesProducts)return demoCatalog();
    return s.salesProducts.listings.flatMap(p=>p.specs.map(sp=>({key:p.id+':'+sp.id,productId:p.id,specId:sp.id,name:p.name,specName:sp.name,category:p.category,type:p.type,normalPrice:Number(sp.price),floorPrice:Number(sp.low),enabled:p.enabled!==false,disabledStores:Object.entries(s.salesProducts.categorySettings?.[p.category]?.stores||{}).filter(([,v])=>v===false).map(([id])=>id)})));
  }
  const status=(a,at=now())=>a.endedAt||at>=a.end?'已结束':at<a.start?'未开始':'进行中';
  const limitText=a=>a.limitMode==='times'?'每人限购 '+a.limitValue+' 次':a.limitMode==='quantity'?'每人每规格限购 '+a.limitValue+' 件':'不限购';
  const defaults=()=>({id:'',name:'',start:day()+'T00:00',end:day(7)+'T23:59',audience:'不限',stores:[],limitMode:'none',limitValue:1,stackable:true,items:[],note:'',logs:[]});
  function seed(){
    const c=demoCatalog(),make=(id,name,start,end,items,audience='不限',limitMode='none')=>({...defaults(),id,name,start,end,audience,limitMode,stores:stores(),items:items.map(i=>({...c[i],activityPrice:Math.max(c[i].floorPrice,c[i].normalPrice-20),participating:true})),createdAt:now(),updatedAt:now(),logs:[{at:now(),action:'创建活动',actor:'总部运营'}]});
    return {schema:1,revision:0,activities:[make('ACT-DEMO-CURRENT','冬日焕肤护理活动',day(-2)+'T00:00',day(7)+'T23:59',[0,2,3,6]),make('ACT-DEMO-NEXT','新客护理体验周',day(8)+'T00:00',day(14)+'T23:59',[1,4],'新客','times'),make('ACT-DEMO-PAST','会员感恩护理季',day(-10)+'T00:00',day(-3)+'T23:59',[3,5],'老客','quantity')]};
  }
  function validate(value,rows){
    const a=copy(value);if(!a.name.trim())throw Error('请填写活动名称');
    if(!a.start||!a.end||a.end<=a.start)throw Error('结束时间须晚于开始时间');
    if(!a.stores.length)throw Error('请选择活动门店');if(!a.items.length)throw Error('请选择活动商品规格');
    if(a.limitMode!=='none'&&(!Number.isInteger(Number(a.limitValue))||Number(a.limitValue)<1))throw Error('限购数量或次数须为正整数');
    a.items=a.items.map(item=>{const latest=rows.find(r=>r.key===item.key)||item,p=Number(item.activityPrice);
      if(!Number.isFinite(p)||p<=0)throw Error('请填写 '+item.name+' 的有效活动价');
      if(cents(p)<cents(latest.floorPrice))throw Error(item.name+' · '+item.specName+' 的活动价不能低于底价 ¥'+Number(latest.floorPrice).toFixed(2));
      return {...item,...latest,activityPrice:cents(p)/100,participating:item.participating!==false};});
    a.name=a.name.trim();a.limitValue=Number(a.limitValue);a.stackable=true;return a;
  }
  function match(activities,key,store,customerType,at=now()){
    for(const a of activities){if(status(a,at)!=='进行中'||!a.stores.some(s=>s.id===store||s.name===store)||a.audience!=='不限'&&a.audience!==customerType)continue;
      const item=a.items.find(x=>x.key===key&&x.participating!==false);if(item)return {activity:a,item};}
    return null;
  }
  function priceLine(row,quantity,activities,store,customerType,at=now(),type='开发'){
    const hit=type==='赠送'?null:match(activities,row.key,store,customerType,at),normal=cents(row.normalPrice),sale=type==='赠送'?0:hit?cents(hit.item.activityPrice):normal;
    return {productId:row.productId,specId:row.specId,productKey:row.key,name:row.name+'（'+row.specName+'）',specName:row.specName,normalPrice:normal/100,activityPrice:hit?sale/100:null,price:sale/100,quantity,type,category:'消费',amount:sale*quantity/100,activity:hit?{id:hit.activity.id,name:hit.activity.name,start:hit.activity.start,end:hit.activity.end,audience:hit.activity.audience,limit:limitText(hit.activity)}:null};
  }
  function totals(items,discount=0){
    const normal=items.reduce((n,x)=>n+(x.type==='赠送'?0:cents(x.normalPrice??x.price))*x.quantity,0),subtotal=items.reduce((n,x)=>n+cents(x.price)*x.quantity,0),extra=Math.min(subtotal,Math.max(0,cents(discount)));
    return {normalTotal:normal/100,activityDiscount:(normal-subtotal)/100,subtotal:subtotal/100,extraDiscount:extra/100,total:(subtotal-extra)/100};
  }
  function allocate(items,discount=0){
    const t=totals(items,discount),weights=items.map(x=>cents(x.price)*x.quantity),sum=weights.reduce((a,b)=>a+b,0),target=cents(t.total),parts=weights.map(w=>sum?Math.floor(target*w/sum):0);
    let remainder=target-parts.reduce((a,b)=>a+b,0);const order=weights.map((w,i)=>({i,r:sum?target*w/sum-parts[i]:0})).sort((a,b)=>b.r-a.r);
    for(const {i}of order){if(!remainder)break;parts[i]++;remainder--;}
    return items.map((x,i)=>({...x,amount:parts[i]/100,extraDiscount:(weights[i]-parts[i])/100}));
  }
  root.WeidActivityModel={copy,now,cents,day,uid,stores,demoCatalog,catalog,status,limitText,defaults,seed,validate,match,priceLine,totals,allocate};
})(typeof window==='undefined'?globalThis:window);

;
/* Dedicated, origin-scoped activity records; product and order records stay in their own stores. */
(function(root){
  'use strict';
  root.WeidActivityStorage={create(){
    const M=root.WeidActivityModel,DB='weid-sales-activities-v1',listeners=new Set();let opening,initializing,current,channel;
    const valid=s=>{if(s?.schema!==1||!Array.isArray(s.activities)||!Number.isInteger(s.revision))throw Error('活动数据无法读取，原记录已保留');return s;};
    function open(){return opening||(opening=new Promise((resolve,reject)=>{
      let r;try{r=root.indexedDB.open(DB,1);}catch(e){reject(e);return;}
      r.onupgradeneeded=()=>r.result.createObjectStore('state');r.onerror=()=>reject(r.error);r.onblocked=()=>reject(Error('活动数据库被旧窗口占用，请关闭旧窗口后重试'));
      r.onsuccess=()=>{const db=r.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
    }).catch(e=>{opening=null;throw e;}));}
    function transact(write,change){return open().then(db=>new Promise((resolve,reject)=>{
      const tx=db.transaction('state',write?'readwrite':'readonly'),store=tx.objectStore('state'),req=store.get('activities');let value,result,failure;
      req.onsuccess=()=>{try{value=req.result===undefined?M.seed():valid(req.result);if(change){const next=M.copy(value);result=change(next);next.revision=value.revision+1;value=next;store.put(value,'activities');}else if(write&&req.result===undefined)store.add(value,'activities');}catch(e){failure=e;tx.abort();}};
      tx.oncomplete=()=>{current=value;resolve(result??M.copy(value));};tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('活动保存失败，当前填写内容已保留'));
    }));}
    const initialize=()=>initializing||(initializing=transact(true).catch(e=>{initializing=null;throw e;}));
    async function read(){await initialize();return transact(false);}
    async function commit(change,expected=current?.revision){await initialize();const result=await transact(true,s=>{if(expected!==s.revision)throw Error('活动已在其他窗口更新，请保留填写内容并重新读取');return change(s);});try{channel?.postMessage(current.revision);}catch{}listeners.forEach(fn=>fn(current));return result;}
    async function refresh(){if(!current)return;try{const old=current.revision;await read();if(old!==current.revision)listeners.forEach(fn=>fn(current));}catch{}}
    try{channel=new root.BroadcastChannel(DB);channel.onmessage=refresh;}catch{}
    return {initialize,read,commit,refresh,get current(){return current;},subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},close(){channel?.close();opening?.then(db=>db.close());}};
  }};
})(typeof window==='undefined'?globalThis:window);

;
window.PCModules['activity-data']=(()=>{
  const store=WeidActivityStorage.create();let error;
  const ready=Promise.resolve().then(()=>store.initialize()).catch(e=>{error=e;});
  return {store,ready,get error(){return error;},async reload(){try{await store.read();error=null;}catch(e){error=e;throw e;}}};
})();
