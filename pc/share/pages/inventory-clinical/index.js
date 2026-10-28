/* Clinical screens reuse the inventory ByForm / ByTable / layered drawer adapters. */
(() => {
  const S=PCModules['supply-chain'],C=S.clinic,U=S.ui,{copy,must,uid}=S;
  const {form,open,top,collect,redraw,saved,validate,names,text,link}=U;
  const f=S.f,req=S.req,ref=S.ref, v=(key,title,entity,filter=null,create)=>({key,title,entity,filter,readonly:!create,create});
  S.pages['sc-treatments']={title:'治疗单与领料',tabs:[v('list','治疗单','treatments',null,'treatment'),v('short','缺料待补','treatments',t=>t.shortages?.length&&!t.executed&&!t.cancelled),v('patients','患者关联档案','patients',null,'patients')]};
  S.pages['sc-internal']={title:'院内出库与退料',tabs:[v('dispatch','待发料','treatments',t=>['待发料','缺料待补','领料中'].includes(t.status)),v('issues','发料与签收','internalIssues',null,'ward-move'),v('returns','未开封退料','internalReturns'),v('ward','治疗室实物库存','batches',b=>S.get('warehouses',b.warehouse)?.purpose==='治疗室'&&b.quantity>0)]};
  S.pages['sc-trays']={title:'针剂配台',tabs:[v('pending','待配台','treatments',t=>['待配台','配台待复核','已配台'].includes(t.status)),v('history','配台核对记录','trayChecks')]};
  S.pages['sc-execution']={title:'按量使用与核对',tabs:[v('pending','待治疗执行','treatments',t=>t.status==='已配台'),v('actual','实际用量记录','clinicalExecutions'),v('left','退料与余量','treatments',t=>!!(t.executed||t.cancelled)&&C.active(t)),v('check','治疗核对','treatments',t=>!!(t.executed||t.cancelled)&&C.active(t)),v('closed','已完成','treatments',t=>!C.active(t))]};
  for(const key of ['treatments','internalIssues','internalReturns','trayChecks','clinicalExecutions'])U.storeEntities.add(key);
  S.fields.patients=[req('patientCode','原系统患者 ID'),req('name','患者姓名'),f('member','会员等级','select',['普通会员','银卡','金卡','钻石']),f('status','状态','select',['启用','停用'])];
  S.columns.patients=['patientCode:原系统患者 ID','name:患者','member:会员等级','status:状态'];
  S.columns.treatments=['id:治疗单号','sourceOrder:来源订单','executionNo:治疗执行号','customer:患者','store:机构','clinicalItems:本次治疗项目','doctor:医生','clinicalProgress:领料进度','status:阶段'];
  S.columns.internalIssues=['id:院内出库单','treatment:治疗单','store:机构','clinicalMaterials:发出物料','createdBy:发料人','receiver:指定接收人','time:发料时间','status:状态'];
  S.columns.internalReturns=['id:退料 / 处置单','treatment:治疗单','sku:物料','kind:处理方式','quantity:基本数量','unit:单位','warehouse:退回库位','createdBy:经办人','reviewer:验收 / 复核人','status:状态'];
  S.columns.trayChecks=['id:配台单号','treatment:治疗单','patient:患者','store:机构','createdBy:配台人','reviewer:复核人','time:配台时间','status:状态'];
  S.columns.clinicalExecutions=['id:执行记录','treatment:治疗单','customer:患者','store:机构','outcome:治疗结果','clinicalUse:实际物料 / 发数','cost:实际使用成本','createdBy:记录人','status:复核状态'];
  const previousCell=S.extraCell;
  S.extraCell=(r,key,type)=>{
    if(key==='clinicalItems')return (r.items||[]).map(i=>i.name+' × '+i.times+' 次').join('；');
    if(key==='clinicalMaterials')return (r.lines||[]).map(l=>names('skus',l.sku)+' '+l.quantity+' '+l.unit).join('；');
    if(key==='clinicalProgress')return r.shortages?.length?'缺料 '+r.shortages.map(x=>names('skus',x.sku)+' '+x.quantity+' '+x.unit).join('；'):(r.reservations||[]).filter(x=>x.issued>=x.quantity).length+' / '+(r.reservations||[]).length+' 项已发';
    if(key==='clinicalUse')return [...(r.allocations||[]).map(x=>names('skus',x.sku)+' '+x.quantity+' '+S.get('skus',x.sku).unit),...(r.shots||[]).map(x=>names('equipment',x.equipment)+' '+x.quantity+' '+S.get('equipment',x.equipment).unit)].join('；');
    if(['createdBy','receiver','doctor'].includes(key))return names('staff',r[key]);
    if(key==='patient')return names('patients',r[key]);
    return previousCell?.(r,key,type);
  };
  const previousActions=S.extraActions;
  S.extraActions=(type,r)=>{
    if(type==='treatments'){
      let out=link('详情','clinicalDetail',r.id);
      if(['待发料','缺料待补','领料中'].includes(r.status))out+=link('发料','clinicalAction','dispatch',r.id)+link('补足领料','clinicalAction','replenish',r.id);
      if(r.status==='待配台')out+=link('配台核对','clinicalAction','tray',r.id);
      if(r.status==='配台待复核')out+=link('独立复核','clinicalAction','trayReview',r.traySubmitted);
      if(r.status==='已配台')out+=link('开封 / 配制','clinicalAction','open',r.id)+link('登记实际用量','clinicalAction','execute',r.id);
      if(r.status==='待偏差复核')out+=link('用量复核','clinicalAction','executionReview',r.executed);
      if((r.executed||r.cancelled)&&C.active(r))out+=link('退料 / 余量','clinicalAction','return',r.id)+link('治疗核对','clinicalAction','close',r.id);
      if(!C.active(r)&&r.sourceSync==='待原订单核对')out+=link('原订单核对','clinicalAction','sourceConfirm',r.id);if(!r.executed&&!r.cancelled&&C.active(r))out+=link('追加领料','clinicalAction','supplement',r.id); if(!r.executed&&!r.cancelled&&C.active(r))out+=link('取消治疗','clinicalAction','cancel',r.id);
      return out;
    }
    if(type==='internalIssues')return link('详情','clinicalDocument','internalIssues',r.id)+(r.status==='待签收'?link('接收签收','clinicalAction','receive',r.id)+link('拒收隔离','clinicalAction','rejectIssue',r.id):'');
    if(type==='trayChecks')return link('详情','clinicalDocument',type,r.id)+(r.status==='待复核'?link('独立复核','clinicalAction','trayReview',r.id):'');
    if(type==='clinicalExecutions')return link('详情','clinicalDocument',type,r.id)+(r.status==='待偏差复核'?link('用量复核','clinicalAction','executionReview',r.id):'');
    if(type==='internalReturns')return link('详情','clinicalDocument',type,r.id)+(r.status==='待验收'?link('验收退料','clinicalAction','acceptReturn',r.id):r.status==='待销毁复核'?link('报损复核','workflow','losses',r.loss,'approve'):'');
    return previousActions?.(type,r);
  };
  const onChange=html=>html.replaceAll(/name="([^"]+)"/g,(all,name)=>'onchange="PCModules[&quot;supply-chain&quot;].clinicalChange()" '+all);
  function rowForm(defs,row,index,group){const prefix=group+'-'+index+'-';return onChange(form(defs.map(x=>({...x,key:prefix+x.key})),Object.fromEntries(Object.entries(row).map(([k,v])=>[prefix+k,v]))))}
  function readRows(el,m,group){for(const [i,row]of (m[group]||[]).entries()){const prefix=group+'-'+i+'-';el.querySelectorAll('input[name],select[name],textarea[name]').forEach(c=>{if(!c.name.startsWith(prefix))return;const key=c.name.slice(prefix.length);row[key]=c.type==='checkbox'?c.checked:c.type==='number'?(c.value===''?'':Number(c.value)):c.value})}}
  function change(){collect();const m=top().model;if(m.batch&&Object.hasOwn(m,'kind')&&m.previousBatch!==m.batch){const b=S.get('batches',m.batch);if(b){m.quantity=b.quantity;m.kind=b.openedAt?'报损销毁':'未开封退库';m.warehouse=b.openedAt?b.warehouse:b.originWarehouse||'';m.previousBatch=m.batch}}for(const item of m.items||[]){if(item.spec&&item.previousSpec!==item.spec){for(const key of Object.keys(item))if(/^(alt|eq|head)\d+$/.test(key))delete item[key];item.previousSpec=item.spec}}redraw()}
  function addItem(){collect();top().model.items.push({spec:'',times:1,cardSale:''});redraw()}
  function removeItem(index){collect();must(top().model.items.length>1,'至少保留一项治疗');top().model.items.splice(index,1);redraw()}
  function newTreatment(){
    const defs=[req('sourceOrder','来源订单号'),req('executionNo','本次治疗执行号'),ref('patient','患者','patients'),ref('store','执行机构','stores'),ref('doctor','操作医生','doctors',false),req('caseNo','病例号 / 治疗记录号'),req('consent','知情同意记录'),ref('authorizer','授权店长','managers',false),f('appointment','计划治疗时间','datetime-local'),f('note','备注','textarea')];
    const m={sourceOrder:'',executionNo:'',patient:'',store:'XM',doctor:'EMP01',caseNo:'',consent:'',authorizer:'',appointment:S.stamp().slice(0,16).replace(' ','T'),note:'',items:[{spec:'',times:1,cardSale:''}]};
    open('新建治疗单与领料申请',r=>{
      let html=onChange(form(defs,r));
      for(const [i,item]of r.items.entries()){
        const rowDefs=[ref('spec','治疗项目规格','specs'),req('times','治疗次数','number'),f('cardSale','扣减卡项','select',[['','按原订单收费'],...S.data.cardSales.filter(c=>c.customerId===r.patient||c.authorizedPatients?.includes(r.patient)).map(c=>[c.id,names('cards',c.card)+' / '+c.customer])])];
        const bom=S.activeBom(item.spec);if(bom)for(const [j,line]of bom.lines.entries()){
          if(line.type==='sku'&&line.alternatives?.length){item['alt'+j]||=line.item;rowDefs.push(f('alt'+j,'使用物料 '+(j+1),'select',[line.item,...line.alternatives].map(id=>[id,names('skus',id)]),true));}
          if(line.type==='equipment'){
            const original=S.get('equipment',line.item),eqs=S.data.equipment.filter(e=>e.store===r.store&&e.status==='使用中'&&(e.model||e.name)===(original?.model||original?.name));
            rowDefs.push(f('eq'+j,'执行仪器 '+(j+1),'select',eqs.map(e=>[e.id,e.name+' / '+e.asset]),true));
            rowDefs.push(f('head'+j,'本次治疗头','select',S.data.heads.filter(h=>h.status==='使用中'&&eqs.some(e=>e.id===h.equipment)).map(h=>[h.id,h.name]),false));
          }
        }
        html+=contentModule('治疗项目 '+(i+1),rowForm(rowDefs,item,i,'items'),r.items.length>1?link('移除此项','clinicalRemoveItem',i):'');
      }
      return html+U.button('添加治疗项目','clinicalAddItem');
    },r=>{
      validate(defs,r);for(const item of r.items){item.alternatives={};item.equipment={};item.heads={};for(const [key,value]of Object.entries(item)){if(/^alt\d+$/.test(key)&&value)item.alternatives[key.slice(3)]=value;if(/^eq\d+$/.test(key)&&value)item.equipment[key.slice(2)]=value;if(/^head\d+$/.test(key)&&value)item.heads[key.slice(4)]=value}}
      C.createTreatment(r);saved('治疗单已建立，按完整容器预占；缺料可补足后分次发料');
    },m,1120,'提交领料');top().read=(el,m)=>readRows(el,m,'items');
  }
  function summary(t){return kv({'治疗单':text(t.id),'来源订单 / 执行号':text(t.sourceOrder+' / '+t.executionNo),'患者':text(t.customer+' / '+t.patient),'机构':text(names('stores',t.store)),'医生':text(names('staff',t.doctor)),'当前阶段':text(t.status)})}
  function stockTable(rows){return table(['物料','瓶号 / 批号','实物库位','余量','预占','状态'],rows.map(b=>[text(names('skus',b.sku)),text((b.containerCode||b.udi||'')+' / '+b.batch),text(names('warehouses',b.warehouse)),text(b.quantity+' '+S.get('skus',b.sku).unit),text(b.reserved),text(S.batchState(b))]))}
  function reconTable(t){return table(['物料','单位','领出','实际使用','退库 / 隔离','留存','销毁','未处理'],C.reconciliation(t.id).map(r=>[text(names('skus',r.sku)),text(r.unit),r.issued,r.used,r.returned,r.kept,r.lost,r.unresolved]))}
  function clinicalDetail(id){const t=S.get('treatments',id);if(!t)return;const docs=[...S.data.internalIssues,...S.data.trayChecks,...S.data.clinicalExecutions,...S.data.internalReturns].filter(r=>r.treatment===id);open('治疗单详情',summary(t)+contentModule('项目与标准用料',table(['项目','物料 / 仪器','标准量','允许范围','单位'],t.plans.map(p=>[text(t.items.find(i=>i.id===p.item)?.name),text(names(p.type==='sku'?'skus':'equipment',p.sku)),p.standard,p.min+'–'+p.max,text(p.unit)])))+contentModule('领用与实物核对',reconTable(t))+contentModule('当前院内实物',stockTable(C.clinicalLots(id)))+contentModule('关联办理记录',table(['单号','状态','办理人','时间'],docs.map(d=>[text(d.id),text(d.status),text(names('staff',d.createdBy)),text(d.time)])))+(t.billing?contentModule('核销与原订单核对',table(['项目','核销次数','核销金额','卡项'],t.billing.map(b=>[text(names('specs',b.spec)),b.times,money(b.amount),text(b.cardSale)])))+kv({'核对意见':text(t.billingNote),'原订单同步':text(t.sourceSync)}):''),null,null,1120)}
  function clinicalDocument(type,id){const r=S.get(type,id);let html=kv({'单号':text(r.id),'治疗单':text(r.treatment),'状态':text(r.status),'经办人':text(names('staff',r.createdBy)),'复核人':text(names('staff',r.reviewer)),'说明':text(r.note||r.reason||r.reviewNote),'时间':text(r.time)});if(r.lines)html+=stockTable(r.lines.map(l=>S.get('batches',l.batch)).filter(Boolean));if(r.entries)html+=table(['瓶 / 批次','登记用量','基本用量'],r.entries.map(e=>[text(e.containerCode||e.batch),text(e.quantity+' '+e.unit),text(e.actual+' '+e.baseUnit)]));if(r.deviations?.length)html+=table(['物料 / 仪器','标准','范围','实际'],r.deviations.map(p=>[text(names(p.type==='sku'?'skus':'equipment',p.sku)),p.standard,p.min+'–'+p.max,p.actual]));if(r.checks)html+=table(['物料 / 瓶号','扫码值','逐项核对'],r.checks.map(c=>[text(names('skus',S.get('batches',c.batch)?.sku)),text(c.code),c.confirmed?'已核对':'未核对']));open('办理记录详情',html,null,null,1120)}
  function simple(title,defs,model,fn,width=560,label='确认'){open(title,form(defs,model),r=>{validate(defs,r);fn(r);saved()},model,width,label)}
  function dispatch(id){
    const t=S.get('treatments',id),allocations=t.reservations.filter(a=>a.quantity>a.issued),m={receiver:'INV-NURSE',note:'',lines:allocations.map(a=>{const k=S.get('skus',a.sku),unit=k.stockUnit||k.unit;const zone=S.data.warehouses.find(z=>z.store===t.store&&z.purpose==='治疗室'&&(!k.cold||z.cold)&&(!k.controlled||z.controlled));return {allocation:a.id,sku:a.sku,batch:a.batch,quantity:S.round((a.quantity-a.issued)/S.unitFactor(k.id,unit)),unit,warehouse:zone?.id||''}})};
    must(m.lines.length,'没有可发出的预占明细，请先补足领料');
    const defs=[ref('receiver','指定接收人','staff'),f('note','交接备注','textarea')];
    open('院内发料',r=>summary(t)+form(defs,r)+r.lines.map((l,i)=>contentModule(names('skus',l.sku)+' / '+S.get('batches',l.batch).batch,rowForm([req('quantity','本次发出数量','number'),f('unit','发料单位','select',S.unitsFor(l.sku),true),f('warehouse','治疗室接收库位','select',S.data.warehouses.filter(z=>z.store===t.store&&z.purpose==='治疗室'&&z.status==='启用').map(z=>[z.id,z.name]),true)],l,i,'lines'))).join(''),r=>{
      validate(defs,r);for(const l of r.lines){must(l.quantity!==''&&l.quantity>=0,'未发物料填 0');l.quantity=S.convertUnits(l.sku,l.quantity,l.unit,S.data,true)}C.dispatch(id,r);saved('院内出库已生成，等待指定人员签收；机构总库存不变');
    },m,1120,'发料并交接');top().read=(el,m)=>readRows(el,m,'lines');
  }
  function tray(id){
    const t=S.get('treatments',id),m={patientConfirmed:false,orderConfirmed:false,note:'',checks:C.clinicalLots(id).map(b=>({batch:b.id,code:'',confirmed:false}))},defs=[f('patientConfirmed','患者身份已核对','checkbox'),f('orderConfirmed','治疗项目与执行单已核对','checkbox'),f('note','配台备注','textarea')];
    open('针剂与耗材配台核对',r=>summary(t)+form(defs,r)+r.checks.map((c,i)=>{const b=S.get('batches',c.batch),k=S.get('skus',b.sku);return contentModule(k.name+' / '+b.quantity+' '+k.unit,kv({'瓶 / 批次':text(b.containerCode||b.batch),'生产批号':text(b.batch),'有效期':text(b.expiry),'物理位置':text(names('warehouses',b.warehouse))})+rowForm([...(k.trackOpened||k.udiRequired?[req('code','扫描瓶号 / 追溯码')]:[]),f('confirmed','规格、数量、批号及效期已核对','checkbox')],c,i,'checks'))}).join(''),r=>{C.submitTray(id,r);saved('配台记录已提交，请由另一位人员独立复核')},m,1120,'提交配台复核');top().read=(el,m)=>readRows(el,m,'checks');
  }
  function openContainer(id){
    const t=S.get('treatments',id),lots=C.clinicalLots(id).filter(b=>S.get('skus',b.sku).trackOpened),m={batch:'',code:'',volume:'',reference:'',solvent:''};
    const defs=[f('batch','待开封瓶 / 支','select',lots.map(b=>[b.id,names('skus',b.sku)+' / '+(b.containerCode||b.batch)]),true),f('code','单支追溯码')];
    open('开封及配制记录',r=>{const b=S.get('batches',r.batch),k=S.get('skus',b?.sku);return summary(t)+onChange(form(defs,r))+(k?.reconstitutionRequired?form([req('volume','配制后实测体积（ml）','number'),req('solvent','配制用液名称 / 批号'),req('reference','医生确认 / 产品依据记录')],r)+(b?kv({'原瓶剂量':text(b.quantity+' U'),'本次换算':text(r.volume>0?S.round(b.quantity/r.volume)+' U/ml':'请登记实测体积')}):''):'')},r=>{validate(defs,r);const k=S.get('skus',S.get('batches',r.batch)?.sku);C.openForTreatment(id,{batch:r.batch,code:r.code,reconstitution:k.reconstitutionRequired?{volume:Number(r.volume),reference:r.reference,solvent:r.solvent}:null});saved('已记录单瓶开封时间与依据')},m,860,'确认开封');
  }
  function execute(id){
    const t=S.get('treatments',id),m={outcome:'完成',reason:'',entries:C.clinicalLots(id).map(b=>({batch:b.id,quantity:'',unit:S.get('skus',b.sku).consumptionUnit||S.get('skus',b.sku).unit})),shots:t.plans.filter(p=>p.type==='equipment').map(p=>({plan:p.id,quantity:''}))};
    const defs=[f('outcome','治疗结果','select',['完成','中断'],true),f('reason','偏差 / 中断原因','textarea')];
    open('按瓶登记实际使用',r=>summary(t)+r.entries.map((e,i)=>{const b=S.get('batches',e.batch),k=S.get('skus',b.sku),units=S.unitsFor(k.id);if(b.preparation&&!units.includes('ml'))units.push('ml');return contentModule(k.name+' / '+(b.containerCode||b.batch),kv({'当前余量':text(b.quantity+' '+k.unit),'开封状态':text(b.openedAt?'已开封':'未开封'),'本瓶配制换算':text(b.preparation?b.preparation.concentration+' U/ml':'—')})+rowForm([req('quantity','实际使用量（未用填0）','number'),f('unit','登记单位','select',units,true)],e,i,'entries'))}).join('')+r.shots.map((e,i)=>{const p=t.plans.find(p=>p.id===e.plan);return contentModule(names('equipment',p.equipment)+' / 标准 '+p.standard+' '+p.unit,rowForm([req('quantity','实际发数（未用填0）','number')],e,i,'shots'))}).join('')+form(defs,r),r=>{
      validate(defs,r);must([...r.entries,...r.shots].every(e=>e.quantity!==''&&Number.isFinite(e.quantity)&&e.quantity>=0),'请逐项登记实际量，未使用填 0');
      const result=C.execute(id,r);saved(result.status==='待偏差复核'?'实际使用已记账，差异等待独立复核':'实际使用已记账，请继续处理未用物料和余量');
    },m,1120,'确认实际使用');top().read=(el,m)=>{readRows(el,m,'entries');readRows(el,m,'shots')};
  }
  function returnMaterial(id){
    const t=S.get('treatments',id),lots=C.clinicalLots(id).filter(b=>!b.hold&&!b.returnRequest),m={batch:'',quantity:'',kind:'未开封退库',warehouse:'',reason:'',shiftEnd:''};
    must(lots.length,'当前没有待退料余量，请核对关联处置单');
    open('退料与余量去向',r=>{const b=S.get('batches',r.batch),k=S.get('skus',b?.sku);const kinds=b?.openedAt?[...(b.policySnapshot?.modes||k?.remainderModes||[]).filter(x=>!['合规销毁','超时报损'].includes(x)),'报损销毁']:['未开封退库','报损销毁'];return summary(t)+onChange(form([f('batch','剩余物料 / 瓶号','select',lots.map(b=>[b.id,names('skus',b.sku)+' / '+(b.containerCode||b.batch)+' / 余 '+b.quantity+' '+S.get('skus',b.sku).unit]),true),req('quantity','处理量（基本单位）','number'),f('kind','余料去向','select',kinds,true),f('warehouse','实际存放 / 退回库位','select',S.data.warehouses.filter(z=>z.store===t.store&&z.type!=='虚拟库位'&&z.status==='启用').map(z=>[z.id,z.name])),req('reason','处理依据','textarea'),...(r.kind==='继续本班次使用'?[req('shiftEnd','班次截止时间','datetime-local')]:[])],r))},r=>{must(r.batch&&r.quantity!==''&&r.kind,'请选择物料并填写处理量及去向');C.requestReturn(id,r);saved('余料去向已登记，退库 / 销毁须由另一位人员核验')},m,860,'提交处理');
  }
  function closeTreatment(id){
    const t=S.get('treatments',id),m={note:'',performerShare:'',items:t.items.map(i=>({item:i.id,times:t.outcome==='完成'?i.times:0}))};
    open('治疗用料与核销核对',r=>summary(t)+contentModule('实物去向核对',reconTable(t))+r.items.map((x,i)=>contentModule(t.items.find(y=>y.id===x.item).name,rowForm([req('times','本次确认核销次数','number')],x,i,'items'))).join('')+form([f('performerShare','跨店执行店分摊（%）','number'),req('note','核销 / 收费处理依据','textarea')],r),r=>{C.closeTreatment(id,r);saved('本次治疗用料已闭合，核销记录待与原订单核对')},m,1120,'确认核对');top().read=(el,m)=>readRows(el,m,'items');
  }
  function action(kind,id){
    try{
      if(kind==='dispatch')return dispatch(id);if(kind==='tray')return tray(id);if(kind==='open')return openContainer(id);if(kind==='execute')return execute(id);if(kind==='return')return returnMaterial(id);if(kind==='close')return closeTreatment(id);
      if(kind==='replenish')return U.confirm('补足领料','按当前可用库存补足未分配的申请量。',()=>C.replenish(id));
      if(kind==='rejectIssue')return simple('院内交接拒收',[req('reason','拒收及实物退回记录','textarea')],{reason:''},r=>C.rejectIssue(id,r));
      if(kind==='sourceConfirm')return simple('原系统订单核对',[req('voucher','原系统核销 / 订单凭据'),req('note','核对结果','textarea')],{voucher:'',note:''},r=>C.sourceConfirm(id,r));
      if(kind==='supplement'){const t=S.get('treatments',id);return simple('追加治疗用料',[f('plan','本单配方物料','select',t.plans.filter(p=>p.type==='sku').map(p=>[p.id,names('skus',p.sku)+' / 标准 '+p.standard+' '+p.unit]),true),req('quantity','追加领料数量','number'),ref('unit','数量单位','unitNames'),req('reference','医生确认 / 医嘱依据'),req('reason','追加领料原因','textarea')],{plan:'',quantity:'',unit:'',reference:'',reason:''},r=>C.supplement(id,r),860)}
      if(kind==='receive')return simple('接收院内发料',[req('note','实物交接核对记录','textarea')],{note:''},r=>C.receiveIssue(id,r));
      if(kind==='trayReview')return simple('配台独立复核',[f('result','复核结果','select',['通过','退回'],true),req('note','复核意见','textarea')],{result:'通过',note:''},r=>C.reviewTray(id,r));
      if(kind==='executionReview')return simple('实际用量差异复核',[req('note','差异认定及处理意见','textarea')],{note:''},r=>C.reviewExecution(id,r));
      if(kind==='cancel')return simple('取消治疗',[req('reason','取消原因','textarea')],{reason:''},r=>C.cancelTreatment(id,r));
      if(kind==='acceptReturn')return simple('未开封退料验收',[f('result','验收结论','select',['合格退库','转质量隔离'],true),f('packaging','包装及封签完好','checkbox'),f('temperature','储存及运输条件符合要求','checkbox'),req('note','验收依据','textarea')],{result:'合格退库',packaging:false,temperature:false,note:''},r=>C.acceptReturn(id,r),860);
    }catch(e){toast(e.message)}
  }
  S.creators.treatment=newTreatment;
  S.creators['ward-move']=()=>simple('科室备货 / 院内移库',[ref('batch','调出库存批次','batches'),req('quantity','移库数量','number'),ref('unit','发出单位','unitNames'),ref('warehouse','接收实物库位','warehouses'),ref('receiver','指定接收人','staff'),req('reason','用途与交接说明','textarea')],{batch:'',quantity:'',unit:'',warehouse:'',receiver:'',reason:''},r=>C.wardMove(r),860,'发料并交接');
  Object.assign(S,{clinicalAction:action,clinicalChange:change,clinicalAddItem:addItem,clinicalRemoveItem:removeItem,clinicalDetail,clinicalDocument});
  for(const type of ['treatments','internalIssues','internalReturns','trayChecks','clinicalExecutions'])S.details[type]=id=>type==='treatments'?clinicalDetail(id):clinicalDocument(type,id);
  PCModules['inventory-clinical']={ready:S.ready,render:S.render,redraw:S.render,leave:S.leave};
})();
