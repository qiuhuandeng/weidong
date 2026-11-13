/* management: page code loaded by the shared PC module loader. */
(()=>{
'use strict';
const managementContext=UB.context;const {q,matches,pageNumbers,stamp,uid,e,b,actions,link,searchBar,tableHTML,panelHTML,companyPager,shopSelected,refresh,save,shopPicker,stack,unique,collect,shopProjectCategories,field,sel,open,close,error,readForm,form,section,shopInput,redraw,topPanel,details,check,today}=managementContext;

const shopFlags=[['enabled','营业状态'],['promotion','门店推广'],['reservation','预约'],['newReservation','新客预约排客'],['visible','门店展示'],['verification','扫码及验证'],['ai','AI服务'],['expenses','门店开支']];
const shopPosts=['主任','店长','区域经理','大区总监','项目经理','纹绣师','特战队BD经理','特战队BD','项目总监','美牙项目主管','美牙师','现场咨询助理','皮肤管理师','大客户经理','市场咨询总监','区域督导'];
const shopDepartments=['慧娟大区 / 华东区域 / 南京浦口店','慧娟大区','顾伟大区','琳淋大区','娟琴大区','春丽大区','多项目组','双美事业部','大麦区','数据策略','东彪区域','威莹区域','赐福区域','旺城区域','小峰区域','小星区域','飞强区域','统秀区域','月冰战区','王星战区','从江战区','江西战区','广州战区','01战区','双美战区','督导运营部','客服组','艺霞区域','蔡琴区域','客户管理部','大麦战队'];
const shopCities=['北京市','北京城区','天津城区','石家庄市','唐山市','邯郸市','保定市','太原市','大同市','长治市','晋城市','运城市','临汾市','通辽市','沈阳市','大连市','长春市','延边朝鲜族自治州','哈尔滨市','伊春市','上海市','上海城区','南京市','无锡市','常州市','苏州市','南通市','连云港市','盐城市','扬州市','泰州市','杭州市','宁波市','温州市','嘉兴市','湖州市','绍兴市','金华市','台州市','合肥市','芜湖市','福州市','厦门市','泉州市','漳州市','龙岩市','宁德市','南昌市','九江市','赣州市','株洲市','乐山市','长沙市','成都市','广元市','南宁市','西双版纳傣族自治州','昭通市'];
const shopRuleDefault=()=>({reception:['主任','店长'],smartReception:['店长','主任'],standard:90,minimum:45,durations:[],orderMode:'all',orderPosts:[],maintainMode:'all',maintainPosts:[],blocked:[],beforeOff:false,syncShift:false,managerLimit:100,consent:'yes',outLimit:100,inLimit:100,itemSplit:false,regularSplit:false,internalSplit:true,externalSplit:false,orderSplit:true,collabMode:'include',collabPosts:['项目经理','纹绣师'],teamMode:'off',teamPosts:[],leaderMode:'all',leaderPosts:[],memberMode:'all',memberPosts:[],intervalPosts:['区域经理','店长','大区总监'],bedPosts:['区域经理','店长','大区总监'],realTimeRefund:false});
const shopEmpty=()=>({id:'',name:'',department:'',start:'10:00',end:'19:00',manager:'',city:'',founded:'',opened:'',type:'生美',property:'',phone:'',address:'',coordinates:'',mapLink:'',wecomLink:'',wecomAddress:'',parkingName:'',parkingAddress:'',parkingLink:'',description:'',cover:[],pictures:[],seal:[],h5Top:[],h5Bottom:[],videos:[],closedAt:'',...Object.fromEntries(shopFlags.map(([k])=>[k,true])),capacity:{newPosts:[],newCapacity:'',oldPosts:[],oldCapacity:''},shifts:[],rules:shopRuleDefault()});
function shopSeeds(){
    return [
      [442,'南京浦口店','北京市','1','权限测试','','06:00','20:30','11111111'],
      [441,'小星专家组','延边朝鲜族自治州','121','石维华','185****2093','10:30','12:30','10111001'],
      [440,'孝东战队','通辽市','212','王国旭','173****2897','06:00','15:45','01010000'],
      [436,'长沙浏阳店','株洲市','湖南省长沙市浏阳市集里区浏阳大道平鼎景都大厦12楼1201','','181****2813','08:00','21:30','01011101'],
      [435,'四川南充店','乐山市','四川省南充市顺庆区泰合·青年城一区1号楼15层1501室','石维华','','10:00','19:00','00011110'],
      [434,'长沙宁乡店','长沙市','长沙市宁乡县玉潭镇花明北路凝香华都11栋铺面009-109','辉龙','','10:00','19:00','01111010'],
      [433,'成都武侯二店','成都市','成都市武侯区人民南路四段45号新希望大厦7楼705室','','','10:00','19:00','10111000'],
      [432,'广元利州店','广元市','四川省广元市利州区万源新区万达华城(东区)4#栋2-6号及2-7号商铺','辉龙','','10:00','19:00','11110000'],
      [431,'杭州西湖二店','杭州市','杭州市西湖区三墩镇竞舟北路89号竞舟瑞泽商务中心4号楼317-1','王国旭','188****7300','10:00','19:00','11110000'],
      [430,'盐城盐都店','盐城市','盐城市盐都区中南购物中心银座505、506、507室','廖云婷','','10:00','19:00','01111001'],
      [429,'医美外协','伊春市','没有地址','','','06:30','07:00','11111100'],
      [428,'合肥滨湖店','合肥市','合肥市滨湖区佳源中心写字楼C座33楼3315室','石维华','','10:00','19:00','11111000'],
      [427,'台州临海店','台州市','浙江省台州市临海市古城街道耀达大厦1807室','','','10:00','19:00','11101001'],
      [426,'湖州吴兴店','湖州市','湖州市吴兴区苏宁嘉悦2502室','','','10:00','19:00','11111100'],
      [425,'南宁良庆店','南宁市','南宁市良庆区金龙路2号广西能源大厦D座18楼1835室','廖云婷','','10:00','19:00','11111111'],
      [424,'版纳景洪店','西双版纳傣族自治州','云南省西双版纳景洪市滨港国际现代服务产业园二楼G11','','','10:00','19:00','11111000'],
      [423,'嘉兴海宁店','嘉兴市','嘉兴市海宁市海洲街道海昌南路426号中海大厦2号楼804室','','','10:00','19:00','11111000'],
      [422,'杭州百星','杭州市','杭州市上城区公园路和解放东路路口迪凯银座1702室','黄丽红','','10:00','19:00','11111000'],
      [421,'自贡自流井店','昭通市','自贡市自流井区南湖国际·紫荆城邦11幢2楼5、6、7号商铺','','','10:00','19:00','11111000'],
      [420,'昭通昭阳店','昭通市','云南省昭通市昭阳区陡街蜜雪冰城旁边电梯上2楼美学中心','','','10:00','19:00','11111101']
    ].map(([id,name,city,address,manager,phone,start,end,flags])=>({...shopEmpty(),id:String(id),name,city,address,manager,phone,start,end,...Object.fromEntries(shopFlags.map(([k],i)=>[k,flags[i]==='1'])),...(id===442?{department:shopDepartments[0],founded:'2025-11-15',property:'合作',coordinates:'2',mapLink:'3',wecomLink:'4',wecomAddress:'5',shifts:[{name:'早班',start:'08:00',end:'17:00'}]}:{})}));
  }
let shopPageSize=20;
const shopById=id=>managementContext.data.shops.find(x=>x.id===String(id));
function shopRows(){let f=q.shops||{};return managementContext.data.shops.filter(r=>matches([r.id,r.name,r.city,r.address,r.manager,r.phone],f.q)&&(!f.status||(f.status==='yes')===r.enabled)&&(!f.cities?.length||f.cities.includes(r.city)))}
function shopPageRows(){let rows=shopRows(),p=pageNumbers['shops:']||1;return rows.slice((p-1)*shopPageSize,p*shopPageSize)}
function shopLog(r,item,description){managementContext.data.shopLogs.unshift({id:uid('shop-log'),shop:r.name,shopId:r.id,city:r.city,item,description,operator:'张三',time:stamp()})}
function shopsPage(){
    let rows=shopRows(),count=Math.max(1,Math.ceil(rows.length/shopPageSize)),current=pageNumbers['shops:']=Math.max(1,Math.min(pageNumbers['shops:']||1,count)),visible=shopPageRows(),f=q.shops||{};
    const cityControl=b(e(f.cities?.length?f.cities.join('、'):'全部城市'),"UB.shopCityFilter()").replace('<button ','<button aria-label="筛选城市" ');
    let search=searchBar('shops',[['status','状态',[['yes','开启'],['no','关闭']]]]).replace('输入名称、编号等关键词','输入门店名称、ID、地址或负责人').replace('<div class="query-actions">',cityControl+'<div class="query-actions">');
    const header=[`<input type="checkbox" aria-label="选择本页门店" ${visible.length&&visible.every(r=>shopSelected.has(r.id))?'checked':''} onchange="UB.shopSelect(this.checked)">`,'序号','ID','门店','城市','地址','负责人','关停天数','联系方式','营业时间',...shopFlags.map(x=>x[1]),'操作'];
    const cells=visible.map((r,i)=>[`<input type="checkbox" aria-label="选择${e(r.name)}" ${shopSelected.has(r.id)?'checked':''} onchange="UB.shopSelect(this.checked,'${r.id}')">`,(current-1)*shopPageSize+i+1,e(r.id),`<span class="ub-ellipsis" title="${e(r.name)}">${e(r.name)}</span>`,`<span class="ub-ellipsis" title="${e(r.city)}">${e(r.city)}</span>`,`<span class="ub-ellipsis" title="${e(r.address)}">${e(r.address)||'—'}</span>`,e(r.manager)||'—',!r.enabled&&r.closedAt?Math.max(0,Math.floor((Date.now()-Date.parse(r.closedAt))/86400000)):'—',e(r.phone)||'—',`${e(r.start)} – ${e(r.end)}`,...shopFlags.map(([k,label])=>`<div class="actions">${switcher(r[k],`UB.shopToggle('${r.id}','${k}',this.checked)`,r.name+' · '+label)}<span class="pc-switch-status">${r[k]?'开启':'关闭'}</span></div>`),actions(link('修改',`UB.shopEdit('${r.id}')`),link('床位',`UB.shopCapacity('${r.id}')`),link('班次',`UB.shopShifts('${r.id}')`),link('服务规则',`UB.shopRules('${r.id}')`))]);
    const pager=companyPager(rows.length,current,shopPageSize,'shopPaging',[10,20,50,100],shopSelected.size);
    return search+panelHTML('门店列表',tableHTML(header,cells).replace('<table>','<table><colgroup><col style="width:48px"><col style="width:60px"><col style="width:64px"><col style="width:164px"><col style="width:160px"><col><col style="width:100px"><col style="width:96px"><col style="width:136px"><col style="width:144px"><col style="width:112px"><col style="width:112px"><col style="width:96px"><col style="width:128px"><col style="width:112px"><col style="width:128px"><col style="width:112px"><col style="width:112px"><col style="width:224px"></colgroup>').replace('class="table-wrap ub-table"','class="table-wrap ub-table shop-list-table"')+pager,actions(b('新增门店','UB.shopEdit()','primary'),b('转出设置','UB.shopTransfer()').replace('<button ',`<button ${shopSelected.size?'':'disabled '}`),b('日志','UB.shopLogs()')));
  }
function shopPaging(p,size){if(size)shopPageSize=size;pageNumbers['shops:']=p;refresh()}
function shopSelect(on,id){(id?[shopById(id)]:shopPageRows()).filter(Boolean).forEach(r=>on?shopSelected.add(r.id):shopSelected.delete(r.id));refresh()}
function shopToggle(id,key,on){let r=shopById(id),label=shopFlags.find(x=>x[0]===key)?.[1];if(!r||!label)return;r[key]=on;if(key==='enabled')r.closedAt=on?'':stamp();shopLog(r,label,`${on?'开启':'关闭'}${label}`);save(label+'已'+(on?'开启':'关闭'));refresh()}
function shopCityFilter(){const f=q.shops||{};shopPicker('选择城市',shopCities,f.cities||[],true,values=>{q.shops={...Object.fromEntries(new FormData(document.querySelector('#main .ub-query form'))),cities:values};shopSelected.clear();pageNumbers['shops:']=1;refresh()})}
function shopPick(key,title,values,multi=false){collect();let parent=stack.at(-1).model;shopPicker(title,unique(values),parent[key],multi,chosen=>{parent[key]=chosen;if(key==='reception')parent.smartReception=parent.smartReception.filter(x=>chosen.includes(x))})}
function shopChoose(key,title,values,multi=false){const value=Array.isArray(values)?values.join('、'):values;return `<button type="button" class="btn rule-config-picker ${value?'':'is-empty'}" aria-label="${e(title)}" title="${e(value||title)}" onclick="UB.shopPickField('${key}')"><span>${e(value||title)}</span>${icon('down')}</button>`}
function shopPickField(key){
    const m=stack.at(-1).model,sets={
      department:['选择所在部门',unique([...shopDepartments,...managementContext.data.shops.map(x=>x.department)]),false],
      manager:['选择负责人',unique([...managementContext.data.shops.map(x=>x.manager),...managementContext.data.employees.map(x=>x.name)]),false],
      city:['选择城市',unique([...shopCities,...managementContext.data.shops.map(x=>x.city)]),false],
      blocked:['选择禁止老客再到店的项目分类',shopProjectCategories,true]
    };
    const config=sets[key]||['选择岗位',key==='smartReception'?m.reception:shopPosts,true];shopPick(key,...config);
  }
function shopConfigTabs(items,view){return `<div class="merge-rule-tabs ub-tabs" role="tablist" aria-label="配置分类">${items.map(([key,label])=>`<button type="button" id="shop-tab-${key}" class="merge-rule-tab ${view===key?'active':''}" role="tab" aria-selected="${view===key}" aria-controls="shop-config-content" tabindex="${view===key?0:-1}" onclick="UB.shopRuleTab('${key}')">${e(label)}</button>`).join('')}</div>`}
function shopConfigContent(view,content){return `<section id="shop-config-content" role="tabpanel" aria-labelledby="shop-tab-${view}">${content}</section>`}
function shopEdit(id){
    const current=shopById(id),m=clone(current||shopEmpty());
    open(current?'修改门店 · '+current.name:'新增门店',item=>{
      let r=item.model,view=item.view||'base',content='';
      if(view==='base')content=section('基础信息',form(
        field('门店名称',shopInput('name',r.name,'text','placeholder="请输入门店名称" maxlength="60"'))+
        field('所在部门',shopChoose('department','选择所在部门',r.department))+
        field('营业开始时间',shopInput('start',r.start,'time'))+field('营业结束时间',shopInput('end',r.end,'time'))+
        field('负责人',shopChoose('manager','选择负责人',r.manager))+
        field('城市',shopChoose('city','选择城市',r.city))+
        field('成立日期',shopInput('founded',r.founded,'date'))+field('开业日期',shopInput('opened',r.opened,'date'))+
        field('门店类型',sel('type',['生美','医美','双美'],r.type))+
        field('经营属性',sel('property',['自营','合作','加盟','外协'],r.property,'请选择经营属性'))+
        field('门店介绍',`<textarea name="description" placeholder="请输入门店介绍">${e(r.description)}</textarea>`,true)));
      if(view==='media')content=section('门店图片',form([['cover','封面'],['pictures','图片'],['seal','印章'],['h5Top','门店地址H5（上图）'],['h5Bottom','门店地址H5（下图）']].map(([key,label])=>field(label,shopMediaControl(key,r[key],key==='pictures'))).join('')));
      if(view==='guide')content=section('到店引导',form(field('地址',shopInput('address',r.address,'text','placeholder="请输入门店地址"'),true)+
          field('经纬度坐标',shopInput('coordinates',r.coordinates,'text','placeholder="经度,纬度"')+'<a class="btn text" href="https://lbs.amap.com/tools/picker" target="_blank" rel="noopener noreferrer">坐标查询</a>',true)+
          field('门店地图分享链接',shopInput('mapLink',r.mapLink,'text','placeholder="请输入门店地图分享链接"'),true)+
          field('企微地址链接',shopInput('wecomLink',r.wecomLink,'text','placeholder="请输入企微地址链接"'),true)+
          field('企微地址',shopInput('wecomAddress',r.wecomAddress,'text','placeholder="请输入企微地址"'),true)+
          field('停车场名字',shopInput('parkingName',r.parkingName,'text','placeholder="请输入停车场名字"'))+
          field('停车场地址',shopInput('parkingAddress',r.parkingAddress,'text','placeholder="请输入停车场地址"'))+
          field('停车场链接',shopInput('parkingLink',r.parkingLink,'text','placeholder="请输入停车场链接"'),true)+
          field('地图',b('查看地图','UB.shopMap()'),true)));
      if(view==='videos')content=section('指引视频',tableHTML(['序号','名称','视频','操作'],r.videos.map((v,i)=>[i+1,shopInput('_videoName-'+i,v.name,'text',`maxlength="5" placeholder="用途名称，最多5字" aria-label="指引视频名称 ${i+1}"`),shopMediaControl('video-'+i,v.file?[v.file]:[],false,true),link('删除',`UB.shopVideoRow(${i})`)])).replace(empty('暂无符合条件的数据','调整搜索条件或重置后再试。'),empty('暂无指引视频','点击新增指引视频，添加到店指引。')).replace('class="table-wrap ub-table"','class="table-wrap ub-table rule-config-editable"'),b('新增指引视频','UB.shopVideoRow()'),true);
      return shopConfigTabs([['base','基础信息'],['media','门店图片'],['guide','到店引导'],['videos','指引视频']],view)+shopConfigContent(view,content);
    },r=>{
      if(!r.name.trim())return error('请填写门店名称');
      if(!r.department||!r.city||!r.start||!r.end||!r.type)return error('请选择所在部门、城市、营业时间及门店类型');
      if(r.end<=r.start)return error('营业结束时间须晚于开始时间');
      if(!r.address.trim()||!r.coordinates.trim()||!r.mapLink.trim()||!r.wecomLink.trim()||!r.wecomAddress.trim())return error('请完整填写地址、经纬度坐标、地图链接及企微地址信息');
      if(r.videos.some(v=>!v.name.trim()||!v.file))return error('请填写每条指引视频的名称并选择视频文件');
      r.name=r.name.trim();if(!r.id)r.id=String(Math.max(442,...managementContext.data.shops.map(x=>Number(x.id)||0))+1);
      let i=managementContext.data.shops.findIndex(x=>x.id===r.id);if(i<0)managementContext.data.shops.unshift(clone(r));else managementContext.data.shops[i]=clone(r);
      shopLog(r,i<0?'新增门店':'修改门店',i<0?'新增门店资料':'更新基础信息与到店引导');save('门店资料已保存');close(true);refresh();
    },1120,m);
    stack.at(-1).read=(root,r)=>{readForm(root,r);r.videos.forEach((v,i)=>{v.name=root.querySelector(`[name="_videoName-${i}"]`)?.value??v.name})};
  }
function shopVideoRow(index){collect();let r=stack.at(-1).model;if(index===undefined)r.videos.push({name:'',file:null});else r.videos.splice(index,1);redraw()}
function shopMap(){collect();let r=stack.at(-1).model;try{let u=new URL(r.mapLink);if(!/^https?:$/.test(u.protocol))throw 0;window.open(u.href,'_blank','noopener,noreferrer')}catch{error('请先填写有效的门店地图分享链接')}}
let shopMediaDB=null;
function shopAssetDB(){return shopMediaDB||(shopMediaDB=new Promise((resolve,reject)=>{let request=indexedDB.open('weidong-shop-media-v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files');request.onsuccess=()=>resolve(request.result);request.onerror=()=>{shopMediaDB=null;reject(request.error)}}))}
function shopMediaControl(key,files=[],multi=false,video=false){
    return `<div class="shop-media-field"><div class="actions"><label class="btn">${video?'选择视频':'选择图片'}<input type="file" class="screen-reader" aria-label="${video?'上传竖版MP4视频':'上传'+({cover:'封面',pictures:'门店图片',seal:'印章',h5Top:'H5上图',h5Bottom:'H5下图'}[key]||'图片')}" accept="${video?'video/mp4':'image/png,image/jpeg,image/webp,image/gif'}" ${multi?'multiple':''} onchange="UB.shopUpload('${key}',this.files,${multi},${video})"></label>${video?'<span class="muted">竖版 MP4，小于 10 MB</span>':''}</div>${files.map((file,i)=>`<div class="file-row"><span class="ub-ellipsis" title="${e(file.name)}">${e(file.name)}</span>${link('预览',`UB.shopPreview('${key}',${i})`)}${link('移除',`UB.shopRemoveMedia('${key}',${i})`)}</div>`).join('')}</div>`;
  }
function shopMediaFiles(m,key){return key.startsWith('video-')?(m.videos[Number(key.slice(6))]?.file?[m.videos[Number(key.slice(6))].file]:[]):m[key]||[]}
async function shopUpload(key,files,multi,video){
    if(!files?.length)return;collect();const item=stack.at(-1),r=item.model,chosen=[...files].slice(0,multi?files.length:1),out=[];
    item.pendingMedia=(item.pendingMedia||0)+1;redraw();
    try{
      if(chosen.some(f=>video?(f.type!=='video/mp4'||f.size>=10*1024*1024):!/^image\/(png|jpeg|webp|gif)$/.test(f.type)))return error(video?'请选择小于 10 MB 的 MP4 视频':'请选择 PNG、JPG、WebP 或 GIF 图片');
      if(video){
        const portrait=await Promise.all(chosen.map(file=>new Promise(resolve=>{let media=document.createElement('video'),url=URL.createObjectURL(file),timer;const done=valid=>{clearTimeout(timer);media.removeAttribute('src');URL.revokeObjectURL(url);resolve(valid)};media.preload='metadata';media.onloadedmetadata=()=>done(media.videoHeight>media.videoWidth&&media.videoWidth>0);media.onerror=()=>done(false);timer=setTimeout(()=>done(false),10000);media.src=url})));
        if(portrait.some(valid=>!valid))return error('请选择可播放的竖版 MP4 视频');
      }
      const db=await shopAssetDB();
      for(let file of chosen){let id=uid('media');await new Promise((resolve,reject)=>{let tx=db.transaction('files','readwrite');tx.objectStore('files').put(file,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});out.push({id,name:file.name,type:file.type})}
      if(!stack.includes(item))return;
      if(key.startsWith('video-'))r.videos[Number(key.slice(6))].file=out[0];else r[key]=multi?[...r[key],...out]:out;
      redraw();
    }catch{error('文件保存失败，请检查浏览器存储空间后重试')}finally{item.pendingMedia--;if(stack.includes(item)){let saveButton=topPanel()?.querySelector('.merge-drawer-foot .primary');if(saveButton)saveButton.disabled=!!item.pendingMedia}}
  }
function shopRemoveMedia(key,index){collect();let m=stack.at(-1).model;if(key.startsWith('video-'))m.videos[Number(key.slice(6))].file=null;else m[key].splice(index,1);redraw()}
async function shopPreview(key,index){
    collect();let item=stack.at(-1),f=shopMediaFiles(item.model,key)[index];if(!f)return;
    try{let db=await shopAssetDB(),blob=await new Promise((resolve,reject)=>{let req=db.transaction('files').objectStore('files').get(f.id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});if(!blob)throw 0;if(stack.at(-1)!==item)return;
      let url=URL.createObjectURL(blob);open('预览 · '+f.name,f.type.startsWith('video/')?`<video class="shop-media-preview" controls src="${url}"></video>`:`<img class="shop-media-preview" src="${url}" alt="${e(f.name)}">`,null,860);stack.at(-1).cleanup=()=>URL.revokeObjectURL(url);
    }catch{error('未找到文件，请重新选择')}
  }
function shopCapacity(id){
    let store=shopById(id),m=clone(store.capacity);
    open('设置床位 · '+store.name,()=>section('新客排客',form(field('排客岗位',shopChoose('newPosts','选择新客排客岗位',m.newPosts))+field('每人每小时排客量（新客）',shopInput('newCapacity',m.newCapacity,'number','min="0" step="1" placeholder="请输入"'))))+section('老客排客',form(field('排客岗位',shopChoose('oldPosts','选择老客排客岗位',m.oldPosts))+field('每人每小时排客量（老客）',shopInput('oldCapacity',m.oldCapacity,'number','min="0" step="1" placeholder="请输入"')))),r=>{
      if(!r.newPosts.length||!r.oldPosts.length)return error('请选择新客和老客排客岗位');
      if(['newCapacity','oldCapacity'].some(k=>r[k]===''||!Number.isInteger(Number(r[k]))||Number(r[k])<0))return error('请填写新客和老客每人每小时排客量，须为非负整数');
      store.capacity=clone(r);shopLog(store,'床位设置','更新新老客排客岗位及每小时排客量');save('床位设置已保存');close(true);refresh();
    },560,m);stack.at(-1).read=(root,r)=>{readForm(root,r);['newCapacity','oldCapacity'].forEach(k=>{if(root.querySelector(`[name="${k}"]`).value==='')r[k]=''})};
  }
function shopShifts(id){
    let store=shopById(id),m={shifts:clone(store.shifts.length?store.shifts:[{name:'',start:'',end:''}])};
    open('班次设置 · '+store.name,()=>section('门店信息',details([['门店',e(store.name)],['营业时间',e(store.start)+' – '+e(store.end)]]))+section('班次设置',tableHTML(['班次','名称','上班时间','下班时间','操作'],m.shifts.map((s,i)=>['B'+(i+1),shopInput('_name-'+i,s.name,'text',`placeholder="请输入班次名称" aria-label="B${i+1}班次名称"`),shopInput('_start-'+i,s.start,'time',`aria-label="B${i+1}上班时间"`),shopInput('_end-'+i,s.end,'time',`aria-label="B${i+1}下班时间"`),link('移除',`UB.shopShiftRow(${i})`)])).replace('class="table-wrap ub-table"','class="table-wrap ub-table rule-config-editable"'),b('新增班次','UB.shopShiftRow()'),true),r=>{
      if(!r.shifts.length)return error('请至少添加一个班次');
      if(r.shifts.some(s=>!s.name.trim()||!s.start||!s.end||s.end<=s.start))return error('请填写班次名称，上班时间须早于下班时间');
      store.shifts=clone(r.shifts);shopLog(store,'班次设置',r.shifts.map((s,i)=>`B${i+1} ${s.name} ${s.start}–${s.end}`).join('；'));save('班次设置已保存');close(true);refresh();
    },860,m);stack.at(-1).read=(root,r)=>r.shifts.forEach((s,i)=>['name','start','end'].forEach(k=>s[k]=root.querySelector(`[name="_${k}-${i}"]`).value));
  }
function shopShiftRow(index){collect();let m=stack.at(-1).model;if(index===undefined)m.shifts.push({name:'',start:'',end:''});else m.shifts.splice(index,1);redraw()}
function shopTransfer(){
    let stores=managementContext.data.shops.filter(r=>shopSelected.has(r.id));if(!stores.length)return toast('请先选择门店');
    let m={outLimit:'',inLimit:''};open('转出设置',()=>section('适用门店',details([['所选门店',e(stores.map(s=>s.name).join('、'))]]))+section('转出与转入上限',form(field('员工每日转出上限（%）',shopInput('outLimit',m.outLimit,'number','min="0" max="100" placeholder="请输入"'))+field('店长岗每日转入上限（%）',shopInput('inLimit',m.inLimit,'number','min="0" max="100" placeholder="请输入"')))+'<p class="ub-note">已分配给员工的客户允许转出的比例，以及允许员工将客户转给店长的比例。100 代表不限制。</p>'),r=>{
      if(['outLimit','inLimit'].some(k=>r[k]===''||!Number.isFinite(Number(r[k]))||r[k]<0||r[k]>100))return error('请填写 0–100 之间的比例');
      stores.forEach(s=>{s.rules.outLimit=Number(r.outLimit);s.rules.inLimit=Number(r.inLimit);shopLog(s,'转出设置',`员工每日转出上限 ${r.outLimit}%，店长岗每日转入上限 ${r.inLimit}%`)});save('转出设置已保存');close(true);refresh();
    },560,m);stack.at(-1).read=(root,r)=>{for(let k of ['outLimit','inLimit'])r[k]=root.querySelector(`[name="${k}"]`).value};
  }
const shopModes=[['all','全部岗位'],['include','包含'],['exclude','不包含'],['off','停用']];
function shopMode(label,prefix,r){return field(label,`<div class="rule-config-role">${sel(prefix+'Mode',shopModes,r[prefix+'Mode']).replace('<select ',`<select onchange="UB.shopRuleChange()" `)}${['include','exclude'].includes(r[prefix+'Mode'])?shopChoose(prefix+'Posts','选择'+label,r[prefix+'Posts']):''}</div>`)}
function shopRuleContent(item,store){
    let r=item.model,view=item.view||'order',num=(label,key,max)=>field(label,shopInput(key,r[key],'number',`min="0" step="1" ${max?'max="'+max+'"':''}`));
    const tab=shopConfigTabs([['order','开单设置'],['transfer','转单设置'],['performance','业绩分配'],['mobile','移动端权限']],view);
    let content='';
    if(view==='order')content=
      section('接待岗位',form(field('新客订单接待老师岗位',shopChoose('reception','选择新客订单接待岗位',r.reception))+field('智能排客接待老师岗位',shopChoose('smartReception','选择智能排客岗位',r.smartReception)))+'<p class="ub-note">智能排客岗位从已选的新客订单接待岗位中选择。</p>')+
      section('客户接待时长',body('<p class="ub-note">未单独设置的床位类型，沿用统一时长。</p>')+tableHTML(['适用床位','标准时长（分钟）','最小时长（分钟）','操作'],[
        ['统一时长',shopInput('standard',r.standard,'number','min="1" step="1" aria-label="统一标准时长"'),shopInput('minimum',r.minimum,'number','min="1" step="1" aria-label="统一最小时长"'),'—'],
        ...r.durations.map((d,i)=>[sel('_bed-'+i,managementContext.data.bedTypes.filter(x=>x.enabled||x.id===d.type).map(x=>[x.id,x.name]),d.type,'选择床位类型').replace(`aria-label="_bed-${i}"`,`aria-label="床位类型 ${i+1}"`),shopInput('_standard-'+i,d.standard,'number','min="1" step="1" aria-label="床位标准时长"'),shopInput('_minimum-'+i,d.minimum,'number','min="1" step="1" aria-label="床位最小时长"'),link('删除',`UB.shopDuration(${i})`)])
      ]).replace('class="table-wrap ub-table"','class="table-wrap ub-table rule-config-editable shop-duration-table"'),b('添加床位类型','UB.shopDuration()'),true)+
      section('项目老师岗位',form(shopMode('项目开单老师岗位','order',r)+shopMode('项目维护老师岗位','maintain',r)+field('禁止老客再到店',shopChoose('blocked','选择项目分类',r.blocked),true))+'<p class="ub-note">禁止消费过所选项目分类的老客户再次预约到店。</p>')+
      section('其他接待规则',form(field('临时下班前排客',check('beforeOff','允许临时下班前排客',r.beforeOff))+field('床位与班次同步',check('syncShift','按早晚班预约床位',r.syncShift))+num('店长每日接待上限','managerLimit')));
    if(view==='transfer')content=section('转单设置',form(field('转单需接收者同意',sel('consent',[['yes','是'],['no','否']],r.consent))+num('员工每日转出上限（%）','outLimit',100)+num('店长岗每日转入上限（%）','inLimit',100))+'<p class="ub-note">员工转出上限按已分配客户计算；店长转入上限限制员工转给店长的客户比例。100 代表不限制。</p>');
    if(view==='performance')content=
      section('按品项分配开单老师业绩',form(field('启用状态',check('itemSplit','按服务品项拆分业绩',r.itemSplit)))+tableHTML(['角色类型','逻辑说明','启用状态'],[['常规','自营品项开单可以拆分业绩',check('regularSplit','启用',r.regularSplit)],['内推','内推品项开单可以拆分业绩',check('internalSplit','启用',true).replace('<input ','<input disabled ')],['外协','外协开单可以拆分业绩',check('externalSplit','启用',r.externalSplit)]]))+
      section('按订单分配协作人员业绩',form(field('启用状态',check('orderSplit','分配协作人员业绩',r.orderSplit))+shopMode('订单协作人员老师岗','collab',r)))+
      section('按服务团队分配人员业绩',form(shopMode('服务团队岗位','team',r)))+
      section('组长岗位',form(shopMode('组长岗位','leader',r)))+
      section('组员岗位',form(shopMode('组员岗位','member',r)));
    if(view==='mobile')content=section('移动端权限',form(field('允许修改时间间隔',shopChoose('intervalPosts','选择允许修改时间间隔的岗位',r.intervalPosts))+field('允许修改床位数量',shopChoose('bedPosts','选择允许修改床位数量的岗位',r.bedPosts))+field('实时退款',`<div class="actions">${switcher(r.realTimeRefund,'UB.shopRuleChange()','实时退款').replace('<input ','<input name="realTimeRefund" ')}<span>${r.realTimeRefund?'开启':'关闭'}</span></div>`,true))+'<p class="ub-note">开启后，该门店可在移动端申请退款。</p>');
    return tab+shopConfigContent(view,content);
  }
function shopRules(id){
    let store=shopById(id),m=clone({realTimeRefund:false,...store.rules});
    open('服务规则 · '+store.name,item=>shopRuleContent(item,store),r=>{
      if(!r.reception.length||!r.smartReception.length)return error('请选择新客订单及智能排客接待老师岗位');
      if(r.smartReception.some(x=>!r.reception.includes(x)))return error('智能排客岗位须属于新客订单接待岗位');
      if([r,...r.durations].some(d=>!Number.isInteger(d.standard)||!Number.isInteger(d.minimum)||d.minimum<=0||d.standard<d.minimum))return error('接待时长须为正整数，最小时长不能超过标准时长');
      if(r.durations.some(d=>!d.type)||unique(r.durations.map(d=>d.type)).length!==r.durations.length)return error('请选择床位类型，且不能重复设置');
      if(['outLimit','inLimit'].some(k=>!Number.isFinite(r[k])||r[k]<0||r[k]>100))return error('转出和转入上限须在 0–100% 之间');
      if(!Number.isInteger(r.managerLimit)||r.managerLimit<0)return error('店长每日接待上限须为非负整数');
      if(['order','maintain','collab','team','leader','member'].some(k=>['include','exclude'].includes(r[k+'Mode'])&&!r[k+'Posts'].length))return error('请为包含或不包含模式选择岗位');
      const refundChanged=!!store.rules.realTimeRefund!==r.realTimeRefund;store.rules=clone(r);shopLog(store,'服务规则','更新开单设置、转单设置、业绩分配及移动端权限'+(refundChanged?'；实时退款：'+(r.realTimeRefund?'开启':'关闭'):''));save('服务规则已保存');close(true);refresh();
    },860,m);
    stack.at(-1).view='order';stack.at(-1).read=(root,r)=>{readForm(root,r);if(root.querySelector('[name="standard"]'))r.durations.forEach((d,i)=>{d.type=root.querySelector(`[name="_bed-${i}"]`).value;d.standard=Number(root.querySelector(`[name="_standard-${i}"]`).value);d.minimum=Number(root.querySelector(`[name="_minimum-${i}"]`).value)})};
  }
function shopRuleTab(view){collect();stack.at(-1).view=view;redraw();let body=topPanel().querySelector('.merge-drawer-body');body.scrollTop=0;topPanel().querySelector('.merge-rule-tab[aria-selected="true"]')?.focus()}
function shopRuleChange(){collect();redraw()}
function shopDuration(index){collect();let r=stack.at(-1).model;if(index===undefined)r.durations.push({type:'',standard:r.standard,minimum:r.minimum});else r.durations.splice(index,1);redraw()}
function shopLogs(){
    open('门店操作日志',item=>{
      const f=item.filter||{},rows=managementContext.data.shopLogs.filter(r=>(!f.q||r.operator.includes(f.q))&&(!f.from||r.time.slice(0,10)>=f.from)&&(!f.to||r.time.slice(0,10)<=f.to)&&(!f.cities?.length||f.cities.includes(r.city))&&(!f.stores?.length||f.stores.includes(r.shop))&&(!f.items?.length||f.items.includes(r.item))),size=15,total=Math.max(1,Math.ceil(rows.length/size)),p=item.page=Math.min(item.page||1,total);
      let controls=`<div class="search">${icon('search')}${shopInput('q',f.q||'','search','placeholder="输入操作人" aria-label="操作人"')}</div><div class="mr-date">${shopInput('from',f.from||'','date','title="操作开始日期" aria-label="操作开始日期"')}<span>至</span>${shopInput('to',f.to||'','date','title="操作结束日期" aria-label="操作结束日期"')}</div>`+
        [['cities','城市'],['stores','门店'],['items','操作项']].map(([k,label])=>b(e(f[k]?.length?f[k].join('、'):'全部'+label),`UB.shopLogPick('${k}')`).replace('<button ',`<button aria-label="筛选${label}" title="${e(f[k]?.join('、')||'全部'+label)}" `)).join('')+
        `<div class="rule-config-shortcuts">${['上月','昨天','今天','本周','本月'].map((s,i)=>b(s,`UB.shopLogDate(${i})`,'text')).join('')}</div>`;
      const query=queryModule(controls,'UB.shopLogSearch(this.closest("section").querySelector("form"))','UB.shopLogSearch(null)').replace('<div class="filterbar">','<form class="filterbar" onsubmit="event.preventDefault();UB.shopLogSearch(this)">').replace('</div></div></section>','</div></form></section>').replaceAll('<button ','<button type="button" ');
      return query+section('操作记录',tableHTML(['序号','操作门店','操作项','操作说明','操作人','操作时间'],rows.slice((p-1)*size,p*size).map((r,i)=>[(p-1)*size+i+1,e(r.shop),e(r.item),e(r.description),e(r.operator),e(r.time)]))+
        `<div class="pagination"><span>共 ${rows.length} 条</span><div class="actions">${b('上一页',`UB.shopLogPage(${p-1})`).replace('<button ',`<button ${p===1?'disabled ':''}`)}<span>${p} / ${total}</span>${b('下一页',`UB.shopLogPage(${p+1})`).replace('<button ',`<button ${p===total?'disabled ':''}`)}</div></div>`,'',true);
    },null,1120);stack.at(-1).filter={from:today(),to:today()};redraw();
  }
function shopLogSearch(formEl){const item=stack.at(-1);item.filter=formEl?{...item.filter,...Object.fromEntries(new FormData(formEl))}:{from:today(),to:today()};item.page=1;redraw()}
function shopLogPage(page){stack.at(-1).page=Math.max(1,page);redraw()}
function shopLogPick(key){let parent=stack.at(-1);parent.filter={...parent.filter,...Object.fromEntries(new FormData(topPanel().querySelector('form')))};shopPicker('选择'+({cities:'城市',stores:'门店',items:'操作项'})[key],key==='cities'?shopCities:key==='stores'?unique(managementContext.data.shops.map(x=>x.name)):unique([...shopFlags.map(x=>x[1]),...managementContext.data.shopLogs.map(x=>x.item)]),parent.filter[key]||[],true,chosen=>{parent.filter[key]=chosen;parent.page=1})}
function shopLogDate(index){
    const item=stack.at(-1);item.filter={...item.filter,...Object.fromEntries(new FormData(topPanel().querySelector('form')))};
    let d=new Date(today()+'T12:00:00'),from=new Date(d),to=new Date(d),fmt=x=>x.getFullYear()+'-'+String(x.getMonth()+1).padStart(2,'0')+'-'+String(x.getDate()).padStart(2,'0');
    if(index===0){from=new Date(d.getFullYear(),d.getMonth()-1,1);to=new Date(d.getFullYear(),d.getMonth(),0)}
    if(index===1){from.setDate(d.getDate()-1);to=new Date(from)}
    if(index===3){from.setDate(d.getDate()-(d.getDay()+6)%7);to=new Date(from);to.setDate(from.getDate()+6)}
    if(index===4){from=new Date(d.getFullYear(),d.getMonth(),1);to=new Date(d.getFullYear(),d.getMonth()+1,0)}
    item.filter={...item.filter,from:fmt(from),to:fmt(to)};item.page=1;redraw();
  }
UB.register("management",{"shops":shopsPage},{shopPaging,shopSelect,shopToggle,shopCityFilter,shopPickField,shopEdit,shopVideoRow,shopMap,shopUpload,shopRemoveMedia,shopPreview,shopCapacity,shopShifts,shopShiftRow,shopTransfer,shopRules,shopRuleTab,shopRuleChange,shopDuration,shopLogs,shopLogSearch,shopLogPage,shopLogPick,shopLogDate},()=>{

managementContext.ensureEmployees();managementContext.ensureBedCatalog();
if(!Object.hasOwn(managementContext.data,'shops'))managementContext.data.shops=shopSeeds();if(!Object.hasOwn(managementContext.data,'shopLogs'))managementContext.data.shopLogs=[];
});
})();
