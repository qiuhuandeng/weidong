/* Preserve existing customer records when reading, decoding or saving fails. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.PCCustomerStorage = factory(() => root.localStorage, () => root.navigator?.locks);
})(globalThis, function (getStorage, getLocks) {
  'use strict';
  const key = 'weidong-correction-prototype-v1';
  let loaded = false, previous, snapshot, locked = false;
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  function fail(message, cause) {
    const error = new Error(message + (cause?.message ? '：' + cause.message : ''), {cause});
    error.customerStorage = true;return error;
  }
  function decode(text) {
    const saved = JSON.parse(text);
    if (saved?.storageFormat !== 'weidong-pool-v1') return saved;
    if (!Array.isArray(saved.pool) || !Object.hasOwn(saved, 'root')) throw Error('数据引用表不完整');
    const active = new Set();
    function unpack(value) {
      if (!value || typeof value !== 'object') return value;
      if (object(value) && Object.keys(value).length === 1 && Object.hasOwn(value, '$wdRef')) {
        const index = value.$wdRef;
        if (!Number.isInteger(index) || index < 0 || index >= saved.pool.length || active.has(index)) {
          throw Error('数据引用无效或存在循环');
        }
        active.add(index);
        try { return unpack(saved.pool[index]); } finally { active.delete(index); }
      }
      return Array.isArray(value) ? value.map(unpack)
        : Object.fromEntries(Object.entries(value).map(([name, item]) => [name, unpack(item)]));
    }
    return unpack(saved.root);
  }
  function validate(value) {
    if (!object(value) || value.version !== 1 || !object(value.config) || !object(value.drafts) ||
        !Array.isArray(value.history) || !Array.isArray(value.cases) || !value.cases.length ||
        value.cases.some(item => !object(item) || typeof item.id !== 'string' || !item.id)) {
      throw Error('客户数据版本或结构不兼容');
    }
    return value;
  }
  function read() {
    loaded = false;
    let raw;
    try { raw = getStorage().getItem(key); }
    catch (error) { throw fail('客户数据暂时无法读取，未创建或覆盖任何记录，请恢复存储权限后重试', error); }
    let value = null;
    if (raw !== null) {
      try { value = validate(decode(raw)); }
      catch (error) { throw fail('客户数据无法解析，原记录已保留，请先备份并修复后重试', error); }
    }
    previous = raw;
    snapshot = value === null ? null : JSON.stringify(value);
    loaded = true;
    return value;
  }
  function save(text) {
    if (!loaded) throw Error('客户数据尚未成功读取，已阻止保存');
    try {
      if (!locked) throw Error('客户保存必须在排他锁内执行');
      const storage = getStorage();
      if (storage.getItem(key) !== previous) throw Error('其他页面已更新客户数据，请刷新后重新操作');
      if (text === previous) return false;
      storage.setItem(key, text);
      previous = text;
      snapshot = null;
      return true;
    } catch (error) {
      throw fail('客户数据未保存，原记录和当前填写内容已保留', error);
    }
  }
  function saveState(value) {
    if (!loaded) throw Error('客户数据尚未成功读取，已阻止保存');
    const next = JSON.stringify(value);
    // Compare before building the reference pool. Reading an unchanged record
    // preserves its original bytes, including older supported storage formats.
    if (next === snapshot) return false;
    // Locate object/array spans in the already serialized snapshot. Strings are
    // skipped with their escapes, so brackets in text never become structure.
    const stack = []; let root;
    for (let index = 0; index < next.length; index++) {
      const char = next[index];
      if (char === '"') {
        for (index++; index < next.length; index++) {
          if (next[index] === '\\') index++;
          else if (next[index] === '"') break;
        }
      } else if (char === '{' || char === '[') {
        const node = {start:index, end:0, children:[]};
        if (stack.length) stack[stack.length - 1].children.push(node); else root = node;
        stack.push(node);
      } else if (char === '}' || char === ']') stack.pop().end = index + 1;
    }
    const pool = [], seen = new Map();
    function pack(node) {
      const signature = next.slice(node.start, node.end);
      if (signature.length < 120) return signature;
      if (seen.has(signature)) return '{"$wdRef":' + seen.get(signature) + '}';
      const index = pool.length; seen.set(signature, index); pool.push('');
      const pieces = []; let cursor = node.start;
      for (const child of node.children) {
        pieces.push(next.slice(cursor, child.start), pack(child)); cursor = child.end;
      }
      pieces.push(next.slice(cursor, node.end)); pool[index] = pieces.join('');
      return '{"$wdRef":' + index + '}';
    }
    const packed = root ? pack(root) : next;
    const changed = save('{"storageFormat":"weidong-pool-v1","root":' + packed + ',"pool":[' + pool.join(',') + ']}');
    snapshot = next;
    return changed;
  }
  function restore(){return snapshot!==null?JSON.parse(snapshot):previous===null?null:decode(previous)}
  async function run(callback){
    let locks;
    try{locks=getLocks?.();if(!locks)throw Error('浏览器未提供安全保存锁')}
    catch(error){throw fail('客户数据未保存',error)}
    let callbackError;
    try{return await locks.request(key,{mode:'exclusive'},()=>{
      try{
        if(!loaded)throw fail('客户数据尚未成功读取，已阻止保存');
        if(getStorage().getItem(key)!==previous)throw fail('其他页面已更新客户数据，请刷新后重新操作');
        locked=true;return callback();
      }catch(error){callbackError=error;throw error}
      finally{locked=false}
    })}catch(error){if(error===callbackError)throw error;throw fail('无法取得客户保存锁，原记录和当前输入已保留',error)}
  }
  return {key, read, save, saveState, restore, run, get locked(){return locked}};
});

;
/* Extracted from the customer workflow; existing business globals and stored records stay compatible. */
'use strict';
let customerInitializing=true, customerPersistencePending=false;
const defaults={primary:[{name:'有进行中订单的一方为主',field:'进行中订单数',logic:'大于0',conflict:'进入订单仲裁',enabled:true,note:'双方都有进行中订单时，进入订单仲裁'},{name:'有手机号的一方为主',field:'手机号',logic:'不为空',conflict:'看下一级',enabled:true,note:'双方都有手机号时，跳过此条'},{name:'有加微记录的一方为主',field:'加微记录数',logic:'大于0',conflict:'看下一级',enabled:true,note:'双方都有加微记录时，跳过此条'},{name:'建档时间更早的一方为主',field:'建档时间',logic:'更早',conflict:'看下一级',enabled:true,note:'兜底规则，优先保留更早创建的客户档案'}],intercept:[{name:'手机号关联客户数',field:'手机号关联客户数',condition:'≥阈值',value:3,on:true,hits:24,reason:'同一手机号关联3个及以上客户'},{name:'子客户白条余额不为零',field:'白条余额',condition:'不为零',value:0,on:true,hits:42,reason:'子客户白条余额不为零，需人工核对'},{name:'子客户有充值余额或近期充值',field:'充值记录',condition:'有余额或时间窗口内有记录',value:6,on:true,hits:31,reason:'有未消耗充值余额或近6个月充值记录'},{name:'子客户有已完成订单',field:'已完成订单数',condition:'存在即拦截',value:1,on:true,hits:28,reason:'子客户存在已完成订单'},{name:'子客户有进行中投诉',field:'进行中投诉数',condition:'存在即拦截',value:1,on:true,hits:8,reason:'子客户存在进行中投诉'},{name:'子客户有进行中售后 / 申述',field:'进行中售后/申述工单数',condition:'存在即拦截',value:1,on:true,hits:11,reason:'子客户有进行中售后或申述工单'},{name:'子客户进行中订单已到店',field:'进行中订单状态',condition:'状态=指定值',value:'已到店',on:true,hits:12,reason:'子订单已到店，关联重度业务数据'}],deposit:{active:3,left:1},arbitration:{A:['进入第二步：有效期仲裁','保留主，流退子','保留子，流退主','进入第三步：看排客人','保留子，流退主','保留主，流退子','推人工审核','推人工审核'],B:['触发前置拦截，推人工审核','两笔都保留'],C:['两笔都保留','保留主，流退子','保留子，主超时订单作为历史保留'],D:['触发前置拦截，推人工审核','两笔都保留','触发前置拦截，推人工审核','两笔都保留']},threshold:{hours:2,months:12,single:5000,total:10000,age:3,commission:true,limits:[true,true,true,true],checks:[true,true,true,true]},migrate:[true,true,true,true]};
function initCase(i){const names=['王小明','赵大海','陈雨桐','周晓敏','刘佳','宋婉清','林悦','何嘉宁'];let status=i===0?'处理中':i===1?'待财务确认':i<7?'待审批':i<14?'处理中':i<16?'待财务确认':'已完成';let step=status==='待审批'?2:status==='待财务确认'?8:status==='已完成'?9:5;let n=String(i+1).padStart(3,'0');let amount=i===0?12500:i===1?3200:[3300,4800,8500,1200][i%4];let high=amount>=5000;return {id:'EC-202610'+String(15-i%12).padStart(2,'0')+'-'+n,merge:'MG-20260901-'+n,cus:'CUS-'+(10086+i*23),sub:'CUS-'+(20099+i*19),newId:step>2?'ECF-20261015-'+n:'',name:names[i%8],subname:['李四','刘小花','张雅','陈芳'][i%4],phone:'1380000'+String(1234+i),amount,store:['A01 · 静安店','B02 · 徐汇店','C03 · 浦东店'][i%3],author:['张三','李四','周敏'][i%3],reason:i%3===0?'合并了不同人':i%3===1?'订单仲裁错误':'数据迁移错误',description:'客户反馈档案中存在不属于本人的消费记录。核对到店信息与通话记录后，确认原子档案为另一位客户，申请分离并纠正数据归属。',evidence:['客户投诉微信截图.png','不同门店到店记录对比.jpg','客户来电通话录音.mp3'],date:'2026-10-'+String(15-i%12).padStart(2,'0')+' 09:30',high,status,step,approval:step>2?(high?3:1):0,transfer:Array.from({length:8},(_,j)=>({to:j<5||step>5?'new':'',executed:step>5})),finance:[500,2000,amount===3200?700:800,0].map((n,j)=>({amount:n,original:n,reason:'',confirmed:step>5,generated:step>5,type:['预约金收取','白条充值','消耗项目','已发放提成'][j]})),manual:[{to:step>5?'main':'',reason:step>5?'经客服核实，属于主档案客户。':'',confirmed:step>5},{to:step>5?'main':'',reason:step>5?'优惠券使用订单属于主档案。':'',confirmed:step>5}],identity:[true,true,true],cross:i===0,storeConfirm:[false,false],financeApproved:status==='已完成',logs:[{at:'2026-10-15 11:05:22',by:'张三',step:step,content:step>2?'进入数据处理，核对快照与当前档案':'提交纠错申请',before:'',after:''}],paused:false}}
const STORAGE=PCCustomerStorage.key;
let saved=null,customerReadError=null;
try{saved=PCCustomerStorage.read()}catch(error){customerReadError=error}
let state=saved&&saved.version===1?saved:{version:1,config:clone(defaults),drafts:{},history:[{time:'2026-10-10 14:30:00',user:'张三',module:'订单仲裁规则',summary:'组合B：子订单已到店时转人工审核',before:{处理方式:'两笔都保留'},after:{处理方式:'触发前置拦截，推人工审核'}},{time:'2026-10-01 09:15:00',user:'李四',module:'前置拦截规则',summary:'新增子订单已到店拦截条件',before:{启用条件:6},after:{启用条件:7}},{time:'2026-09-15 16:00:00',user:'张三',module:'预约金有效期',summary:'确认在职3个月、离职1个月',before:{在职:3,离职:1},after:{在职:3,离职:1}}],cases:Array.from({length:42},(_,i)=>initCase(i)),role:'总部运营'};
let activeId=state.cases[0].id,configDraft=clone(state.config),dataTab='transfer',detailTab='info',filter={status:'',risk:'',store:'',author:'',q:'',from:'',to:''},pageNo=1,historyFilter={module:'',user:'',from:'',to:''},rvFilter={q:'',customer:'',type:'',from:'',to:'',min:'',max:''},newForm={reason:'合并了不同人',description:'',expect:'',evidence:[]},fileObjects=new Map(),mobileFilter='全部',mobileCustomerTab='合并历史';
if(!saved){state.cases.forEach(c=>{let date=c.date.slice(0,10),events=[{at:date+' 09:30:00',by:c.author,step:1,content:'发起纠错申请，上传证据材料',before:'未创建',after:'待审批'}];if(c.step>2){events.push({at:date+' 10:15:00',by:'张三',step:2,content:'申请核实通过，已核对证据与影响范围',before:'待核实',after:'待制定方案'});events.push({at:date+' 11:01:00',by:'系统',step:3,content:'创建纠错分离档案 '+c.newId,before:'未创建',after:c.newId});events.push({at:date+' 11:05:00',by:'张三',step:4,content:'完成合并前快照与当前数据对比',before:'待核对',after:'已核对'});if(c.step>=5)events.push({at:date+' 11:10:00',by:'张三',step:5,content:c.step>5?'完成三类数据处理':'进入数据处理，确认5项系统建议',before:'待处理',after:c.step>5?'已处理':'处理中'});if(c.step>=8){events.push({at:date+' 14:20:00',by:'张三',step:6,content:'完成识别维度拆回，主档案保留有效凭证',before:'识别维度合并在主档案',after:'按真实归属拆分'});events.push({at:date+' 14:25:00',by:'系统',step:7,content:'完成统计字段与客户类型重算',before:'合并状态统计',after:'分别重算'});events.push({at:date+' 14:30:00',by:'系统',step:8,content:'生成纠错调整单并推送财务',before:'未生成',after:'待财务确认'})}if(c.step===9)events.push({at:date+' 16:30:00',by:'张三',step:9,content:'确认调整单，关闭工单并标记原合并记录已纠错',before:'待财务确认',after:'已完成'})}c.logs=events.reverse()})}
function persist(){
 if(customerReadError)throw customerReadError;
 if(customerInitializing){customerPersistencePending=true;return}
 try{PCCustomerStorage.saveState(state)}
 catch(error){error.customerStorage=true;customerRollback();throw error}
}
function customerRollback(source=PCCustomerStorage.restore()){
 if(!source)return;
 const same=(a,b)=>a&&b&&typeof a==='object'&&typeof b==='object'&&Array.isArray(a)===Array.isArray(b);
 function restore(target,value){
  if(Array.isArray(value)){const old=target.slice();target.splice(0,target.length,...value.map((item,i)=>{const previous=item?.id===undefined?old[i]:old.find(x=>x?.id===item.id);return same(previous,item)?restore(previous,item):item}))}
  else{for(const key of Object.keys(target))if(!Object.hasOwn(value,key))delete target[key];for(const [key,item]of Object.entries(value))target[key]=same(target[key],item)?restore(target[key],item):item}
  return target;
 }
 restore(state,source);uiIdsReady=false;uiIdsChanged=false;
}
function customerWrite(action,{background=false,onError}={}){
 if(PCCustomerStorage.locked)return action();
 const hash=location.hash,current=PCApp.current,editor=mergeEditor,dialog=document.querySelector('.pc-dialog');
 const context=PCModules['customer-engine']?.writeContext?.(),valid=()=>background||(hash===location.hash&&current===PCApp.current&&editor===mergeEditor&&dialog===document.querySelector('.pc-dialog')&&!dialog?.closest('.is-closing')&&(!context||context()));
 return PCCustomerStorage.run(()=>{
  if(!valid())return false;
  try{return action()}catch(error){customerRollback();throw error}
 }).catch(error=>{onError?.(error);if(valid())toast(error.message);return false});
}
function customerSavePresentation(){return customerWrite(()=>persist(),{background:true})}
function customerUpdateCase(key,value){return customerWrite(()=>{const c=current();if(key.startsWith('profileDraft.'))c.profileDraft[key.slice(13)]=value;else c[key]=value;persist()})}
function now(){return new Date().toLocaleString('sv-SE',{timeZone:'Asia/Shanghai'})}
let mergeEditor=null,arbEditing=null,mergeListQuery='',mergeListFilter='all',arbListQuery='',mergeDrawerFocus=null,historyProfileId=null;
function initializeModuleHistory(){state.history||=[];state.mergeProfiles.forEach(p=>{if(p.moduleHistorySamplesVersion===1)return;let examples=[
 ['基本信息','调整合并后冷静期及快照保留期限',{'合并后冷静期（小时）':1,'快照保留期限（月）':6},{'合并后冷静期（小时）':2,'快照保留期限（月）':12}],
 ['主客户判定规则','调整有有效订单时的冲突处理',{'判定条件':'有有效订单','双方均满足':'推人工审核'},{'判定条件':'有有效订单','双方均满足':'进入订单仲裁'}],
 ['前置拦截规则','启用子订单已到店拦截条件',{'拦截条件':'子订单已到店','启用':false},{'拦截条件':'子订单已到店','启用':true}],
 ['预约金有效期','调整离职成员有效期与双方过期处理动作',{'离职成员有效期（月）':2,'双方预约金均已过期':'转人工审核'},{'离职成员有效期（月）':1,'双方预约金均已过期':'保留最近支付预约金的一方'}],
 ['订单仲裁规则','调整未命中规则时的处理动作',{'未命中规则时':'两笔订单都保留'},{'未命中规则时':'转人工审核'}]
 ];examples.forEach(([module,summary,before,after],i)=>state.history.push({time:'2026-10-'+String(14-i).padStart(2,'0')+' 10:30:00',user:i%2?'李四':'张三',module,profileId:p.id,sample:true,summary:'示例：'+summary,before,after}));p.moduleHistorySamplesVersion=1});state.history.sort((a,b)=>b.time.localeCompare(a.time))}
function initializeMergeProfiles(){
 normalizeMergeConfiguration(defaults);normalizeMergeConfiguration(state.config);delete state.drafts.return;
 if(!Array.isArray(state.mergeProfiles)||!state.mergeProfiles.length){state.mergeProfiles=[{id:'merge-profile-1',name:'通用客户合并规则',isDefault:true,version:1,updatedAt:now(),updatedBy:'张三',config:{...clone(state.config),...clone(state.drafts)}}];state.drafts={}}
 let chosen=state.mergeProfiles.find(p=>p.isDefault)||state.mergeProfiles[0];state.mergeProfiles.forEach(p=>{p.isDefault=p.id===chosen.id;p.config=normalizeMergeConfiguration(p.config)});state.config=clone(chosen.config);configDraft=clone(state.config);initializeModuleHistory();persist();
}
let rvScope='all',ruleListQueries={primary:'',intercept:''};
function movePageActions(){let main=$('#main');if(!main)return;Array.from(main.querySelectorAll('.page-head')).forEach(h=>{let actions=h.querySelector('.actions'),target=main.querySelector('.panel-head');if(actions?.children.length&&target){let right=target.querySelector(':scope > .actions');if(!right){right=document.createElement('div');right.className='actions';let extra=Array.from(target.children).filter(x=>x.tagName!=='H2');extra.forEach(x=>right.appendChild(x));target.appendChild(right)}while(actions.firstChild)right.appendChild(actions.firstChild)}h.remove()})}
function defaultDepositPolicy(){return {schema:2,rules:[
 {id:'deposit-expired',name:'双方预约金均已过期',enabled:true,when:arbGroup('all',[arbLeaf('main.valid','eq','过期'),arbLeaf('child.valid','eq','过期')]),action:'latest',note:''},
 {id:'deposit-one-valid',name:'仅一方预约金在有效期内',enabled:true,when:arbGroup('any',[arbGroup('all',[arbLeaf('main.valid','eq','有效'),arbLeaf('child.valid','eq','过期')]),arbGroup('all',[arbLeaf('main.valid','eq','过期'),arbLeaf('child.valid','eq','有效')])]),action:'valid',note:''},
 {id:'deposit-both-valid',name:'双方预约金均在有效期内',enabled:true,when:arbGroup('all',[arbLeaf('main.valid','eq','有效'),arbLeaf('child.valid','eq','有效')]),action:'earliest',note:''}
]}}
function normalizeMergeConfiguration(c){
 delete c.return;c.threshold={...clone(defaults.threshold),...c.threshold};c.deposit={...clone({active:defaults.deposit.active,left:defaults.deposit.left}),...c.deposit};
 let previous=c.deposit.policy,policy=defaultDepositPolicy(),actions=['keepMain','keepChild','keepBoth','manual','latest','earliest','valid','continue'];
 policy.rules.forEach(r=>{let saved=previous?.rules?.find(x=>x.id===r.id);if(saved&&actions.includes(saved.action))r.action=saved.action});c.deposit.policy=policy;
 c.arbitration=migrateArbitration(c.arbitration);
 if(previous?.schema!==2&&['keepMain','keepChild','keepBoth'].includes(previous?.fallback)&&(!c.arbitration.fallback||c.arbitration.fallback==='manual'))c.arbitration.fallback=previous.fallback;
 if(!['manual','keepMain','keepChild','keepBoth'].includes(c.arbitration.fallback))c.arbitration.fallback='manual';
 let links={'双方预约金过期，保留最近支付方':['latest','双方预约金过期，按预约金规则处理'],'仅一方预约金有效，保留有效方':['valid','仅一方预约金有效，按预约金规则处理'],'双方预约金有效，保留先支付方':['earliest','双方预约金有效，按预约金规则处理']};
 c.arbitration.rules.forEach(r=>{let l=links[r.name];if(l&&r.action===l[0]){r.action='validity';r.source='depositPolicy';r.name=l[1]}if(r.action==='validity')r.note='按预约金有效期页面配置的固定条件和处理动作执行'});return c
}
function depositPolicyConfig(){return configDraft.deposit.policy||=defaultDepositPolicy()}
function resolveDepositPolicy(data){for(let r of depositPolicyConfig().rules){if(!arbMatches(r.when,data))continue;let result=arbResolve(r.action,data);return {...result,reason:'预约金条件“'+r.name+'”：'+result.reason}}return {action:'continue',reason:'未命中预约金条件，继续匹配订单仲裁规则'}}
const ARB_FIELDS={
 'main.stage':{label:'主订单 · 所处阶段',type:'enum',values:['线上','线下']},'child.stage':{label:'子订单 · 所处阶段',type:'enum',values:['线上','线下']},
 'main.status':{label:'主订单 · 订单状态',type:'enum',values:['待排客','已排客','已到店','已超时']},'child.status':{label:'子订单 · 订单状态',type:'enum',values:['待排客','已排客','已到店','已超时']},
 'main.deposit':{label:'主订单 · 预约金金额',type:'number'},'child.deposit':{label:'子订单 · 预约金金额',type:'number'},
 'main.valid':{label:'主订单 · 预约金有效性',type:'enum',values:['有效','过期','无预约金']},'child.valid':{label:'子订单 · 预约金有效性',type:'enum',values:['有效','过期','无预约金']},
 'main.assignee':{label:'主订单 · 排客人',type:'enum',values:['有','无']},'child.assignee':{label:'子订单 · 排客人',type:'enum',values:['有','无']},
 'main.member':{label:'主订单 · 成员状态',type:'enum',values:['在职','离职']},'child.member':{label:'子订单 · 成员状态',type:'enum',values:['在职','离职']},
 'main.paidAt':{label:'主订单 · 预约金支付时间',type:'date'},'child.paidAt':{label:'子订单 · 预约金支付时间',type:'date'}
};
const ARB_OPS={eq:'等于',ne:'不等于',in:'属于任一',notin:'不属于',gt:'大于',gte:'大于等于',lt:'小于',lte:'小于等于',before:'早于',after:'晚于'};
const arbLeaf=(field,operator='eq',value='')=>({field,operator,value,mode:'value'});
const arbGroup=(join,children)=>({join,children});
function arbLegacyAction(s){return ({'保留主，流退子':'keepMain','流退子，保留主':'keepMain','保留子，流退主':'keepChild','流退主，保留子':'keepChild','两笔都保留':'keepBoth','推人工审核':'manual','触发前置拦截，推人工审核':'intercept','保留最近支付方':'latest','保留先支付方':'earliest','保留有效期内方':'valid','保留子，主超时订单作为历史保留':'childHistory','进入第二步：有效期仲裁':'validity','进入下一步':'continue'})[s]||'manual'}
function migrateArbitration(old){
 if(old?.schema===2)return clone(old);
 const source=clone(old||defaults.arbitration),A=source.A||[],B=source.B||[],C=source.C||[],D=source.D||[],rules=[];
 const c=arbLeaf,g=arbGroup,online=[c('main.stage','eq','线上'),c('child.stage','eq','线上')],paid=[...online,c('main.deposit','gt',0),c('child.deposit','gt',0)],unpaid=[...online,c('main.deposit','eq',0),c('child.deposit','eq',0)];
 const add=(name,children,action,note='')=>rules.push({id:'arb-'+(rules.length+1),name,enabled:true,when:g('all',clone(children)),action,note});
 if(B[0]===D[0]&&B[0]===D[2])add('子订单已到店，先核对业务数据',[c('child.status','eq','已到店')],arbLegacyAction(B[0]),'到店订单关联签到、消耗与现场照片，优先交由人工核实。');
 else{add('主线上、子已到店',[c('main.stage','eq','线上'),c('child.status','eq','已到店')],arbLegacyAction(B[0]));add('双方均已到店',[c('main.status','eq','已到店'),c('child.status','eq','已到店')],arbLegacyAction(D[0]));add('主已超时、子已到店',[c('main.status','eq','已超时'),c('child.status','eq','已到店')],arbLegacyAction(D[2]));}
 add('线上订单，仅主订单有预约金',[...online,c('main.deposit','gt',0),c('child.deposit','eq',0)],arbLegacyAction(A[1]),'优先保留有预约金保护的主订单。');
 add('线上订单，仅子订单有预约金',[...online,c('main.deposit','eq',0),c('child.deposit','gt',0)],arbLegacyAction(A[2]));
 if(A[0]==='进入第二步：有效期仲裁'){
  add('双方预约金过期，保留最近支付方',[...paid,c('main.valid','eq','过期'),c('child.valid','eq','过期')],'latest');
  add('仅一方预约金有效，保留有效方',[...paid,g('any',[g('all',[c('main.valid','eq','有效'),c('child.valid','eq','过期')]),g('all',[c('main.valid','eq','过期'),c('child.valid','eq','有效')])])],'valid');
  add('双方预约金有效，保留先支付方',[...paid,c('main.valid','eq','有效'),c('child.valid','eq','有效')],'earliest');
 }else add('线上订单，双方都有预约金',paid,arbLegacyAction(A[0]));
 if(A[3]==='进入第三步：看排客人'){
  add('无预约金，仅主订单有排客人',[...unpaid,c('main.assignee','eq','有'),c('child.assignee','eq','无')],arbLegacyAction(A[5]));
  add('无预约金，仅子订单有排客人',[...unpaid,c('main.assignee','eq','无'),c('child.assignee','eq','有')],arbLegacyAction(A[4]));
  if(A[6]===A[7])add('无预约金，排客信息无法区分',[...unpaid,g('any',[g('all',[c('main.assignee','eq','有'),c('child.assignee','eq','有')]),g('all',[c('main.assignee','eq','无'),c('child.assignee','eq','无')])])],arbLegacyAction(A[6]),'双方都有排客人，或者双方都无排客人时，转人工判断。');
  else{add('无预约金，双方有排客人',[...unpaid,c('main.assignee','eq','有'),c('child.assignee','eq','有')],arbLegacyAction(A[6]));add('无预约金，双方无排客人',[...unpaid,c('main.assignee','eq','无'),c('child.assignee','eq','无')],arbLegacyAction(A[7]));}
 }else add('线上订单，双方均无预约金',unpaid,arbLegacyAction(A[3]));
 add('主订单在线上，子订单已超时',[c('main.stage','eq','线上'),c('child.status','eq','已超时')],arbLegacyAction(B[1]));
 add('主已到店，子线上订单有预约金',[c('main.status','eq','已到店'),c('child.stage','eq','线上'),c('child.deposit','gt',0)],arbLegacyAction(C[0]));
 add('主已到店，子线上订单无预约金',[c('main.status','eq','已到店'),c('child.stage','eq','线上'),c('child.deposit','eq',0)],arbLegacyAction(C[1]));
 add('主已超时，保留子的线上订单',[c('main.status','eq','已超时'),c('child.stage','eq','线上')],arbLegacyAction(C[2]));
 if(D[1]===D[3])add('主订单在线下，子订单已超时',[c('main.stage','eq','线下'),c('child.status','eq','已超时')],arbLegacyAction(D[1]));
 else{add('主已到店，子已超时',[c('main.status','eq','已到店'),c('child.status','eq','已超时')],arbLegacyAction(D[1]));add('双方均已超时',[c('main.status','eq','已超时'),c('child.status','eq','已超时')],arbLegacyAction(D[3]));}
 return {schema:2,match:'first',fallback:'manual',rules,previousConfiguration:source};
}
function initializeArbitration(){const legacy=clone(defaults.arbitration);state.config.arbitration=migrateArbitration(state.config.arbitration||legacy);if(state.drafts.arbitration)state.drafts.arbitration=migrateArbitration(state.drafts.arbitration);defaults.arbitration=migrateArbitration(legacy);configDraft.arbitration=clone(state.config.arbitration)}
function arbActionHint(action){return ({keepMain:'子订单按所处阶段标记合并流退，支付流水保留，不自动退款。',keepChild:'主订单按所处阶段标记合并流退，客户主档案关系保持独立判断。',keepBoth:'两笔订单同时保留；已超时订单作为历史保留。',manual:'停止自动仲裁，生成待审核工单。',intercept:'记录拦截原因并推送人工审核，不自动处理订单。',latest:'比较两笔预约金的支付时间，保留较晚的一方；时间相同转人工审核。',earliest:'比较两笔预约金的支付时间，保留较早的一方；时间相同转人工审核。',valid:'按在职 / 离职有效期，保留唯一有效的一方；无法区分则转人工审核。',childHistory:'保留子的线上订单，主订单须为已超时状态并作为历史保留。',validity:'按预约金有效期页面配置的条件、顺序和处理动作执行。',continue:'命中后继续检查下一条规则，不在此处执行订单处理。'})[action]||''}
function arbDescribe(n){if(n.children){if(!n.children.length)return '<span class="negative">未配置条件</span>';return '（'+n.children.map(arbDescribe).join(n.join==='all'?' <span class="arb-logic-inline">且</span> ':' <span class="arb-logic-inline any">或</span> ')+'）'}return '<span>'+esc(ARB_FIELDS[n.field]?.label||'未知字段')+' '+esc(ARB_OPS[n.operator])+' <b>'+esc(n.mode==='field'?ARB_FIELDS[n.value]?.label||'未选择':Array.isArray(n.value)?n.value.join(' / '):n.value)+'</b></span>'}
function arbDerived(data){let out={};for(let side of ['main','child']){let o=data[side],ref=Date.parse(data.reference+'T12:00:00'),paid=Date.parse(o.paidAt+'T12:00:00'),expiry=new Date(paid);let months=Number(o.member==='离职'?configDraft.deposit.left:configDraft.deposit.active);let day=expiry.getDate();expiry.setDate(1);expiry.setMonth(expiry.getMonth()+months);let last=new Date(expiry.getFullYear(),expiry.getMonth()+1,0).getDate();expiry.setDate(Math.min(day,last));Object.entries(o).forEach(([k,v])=>out[side+'.'+k]=v);out[side+'.deposit']=Number(o.deposit);out[side+'.stage']=['待排客','已排客'].includes(o.status)?'线上':'线下';out[side+'.valid']=Number(o.deposit)<=0?'无预约金':ref<=expiry.getTime()?'有效':'过期'}return out}
function arbMatches(n,data){if(n.children)return n.children.length>0&&(n.join==='all'?n.children.every(x=>arbMatches(x,data)):n.children.some(x=>arbMatches(x,data)));let a=data[n.field],b=n.mode==='field'?data[n.value]:n.value;if(ARB_FIELDS[n.field].type==='number'){a=Number(a);if(!Array.isArray(b))b=Number(b)}if(ARB_FIELDS[n.field].type==='date'){a=Date.parse(a);b=Date.parse(b);if(!Number.isFinite(a)||!Number.isFinite(b))return false}return ({eq:()=>a===b,ne:()=>a!==b,in:()=>Array.isArray(b)&&b.includes(a),notin:()=>Array.isArray(b)&&!b.includes(a),gt:()=>a>b,gte:()=>a>=b,lt:()=>a<b,lte:()=>a<=b,before:()=>a<b,after:()=>a>b}[n.operator]||(()=>false))()}
function arbResolve(action,data){let main=Number(data['main.deposit'])>0,child=Number(data['child.deposit'])>0,validMain=data['main.valid']==='有效',validChild=data['child.valid']==='有效',a=Date.parse(data['main.paidAt']),b=Date.parse(data['child.paidAt']);if(action==='validity'){if(!main||!child)return {action:'manual',reason:'预约金数据不完整，交由人工核实'};return resolveDepositPolicy(data)}if(action==='valid'){if(!main||!child||validMain===validChild)return {action:'manual',reason:'无法区分唯一有效方，转人工审核'};return {action:validMain?'keepMain':'keepChild',reason:'仅'+(validMain?'主':'子')+'订单预约金在有效期内'}}if(action==='latest'||action==='earliest'){if(!main||!child||!Number.isFinite(a)||!Number.isFinite(b)||a===b)return {action:'manual',reason:'支付时间相同或预约金数据不足，转人工审核'};let keep=action==='latest'?a>b:a<b;return {action:keep?'keepMain':'keepChild',reason:'比较支付时间，保留'+(action==='latest'?'较晚':'较早')+'支付的一方'}}if(action==='childHistory'&&data['main.status']!=='已超时')return {action:'manual',reason:'主订单并非已超时，需人工核实后处理'};return {action,reason:arbActionHint(action)}}
function evaluateArbitration(cfg,data){let trace=[],chosen=null;for(let i=0;i<cfg.rules.length;i++){let r=cfg.rules[i],hit=r.enabled&&arbMatches(r.when,data),result=!chosen&&hit?arbResolve(r.action,data):null,status=!r.enabled?'已停用':chosen?'未执行':hit?result.action==='continue'?'命中 · 继续':'命中执行':'不满足';trace.push({id:r.id,name:r.name,status,hit,index:i+1});if(result&&result.action!=='continue')chosen={rule:r,index:i+1,...result}}let fallback=arbResolve(['manual','keepMain','keepChild','keepBoth'].includes(cfg.fallback)?cfg.fallback:'manual',data);return {chosen,trace,action:chosen?.action||fallback.action,reason:chosen?.reason||'所有启用规则均未命中执行动作，'+fallback.reason}}
const UI_ID_PATTERN=/\b(?:[A-Z][A-Z0-9]{1,14}|merge|arb|source)-(?:[A-Za-z0-9_]+-)*[A-Za-z0-9_]+\b/g;
let uiIdsReady=false,uiIdsUsed=new Set(),uiIdsChanged=false,uiIdObserver=null;
function uiAssignId(id){let map=state.uiIds.map;if(map[id])return map[id];let preferred=/^CUS-(\d{5})$/.exec(id)?.[1],candidate=preferred&&!uiIdsUsed.has(preferred)?preferred:'';if(!candidate){let next=state.uiIds.next||60000;while(uiIdsUsed.has(String(next))&&next<=99999)next++;if(next>99999){next=10000;while(uiIdsUsed.has(String(next))&&next<=99999)next++}if(next>99999)throw Error('五位 ID 已用完');candidate=String(next);state.uiIds.next=next+1}map[id]=candidate;uiIdsUsed.add(candidate);uiIdsChanged=true;return candidate}
function uiEnsureIds(){if(uiIdsReady)return;const indexed=Object.keys(state.uiIds?.map||{}).length>0;state.uiIds||={map:{},next:60000};state.uiIds.map||={};uiIdsUsed=new Set(Object.values(state.uiIds.map));uiIdsReady=true;if(indexed)return;let ids=[...new Set(JSON.stringify(state).match(UI_ID_PATTERN)||[])];ids.filter(x=>/^CUS-\d{5}$/.test(x)).sort().forEach(uiAssignId);ids.forEach(uiAssignId)}
function uiId(id){if(!id)return '—';if(/^\d{5}$/.test(String(id)))return String(id);uiEnsureIds();return uiAssignId(String(id))}
function uiDisplayText(text){uiEnsureIds();return String(text??'').replace(UI_ID_PATTERN,id=>uiAssignId(id))}
function uiQuery(value){uiEnsureIds();let query=String(value||'').trim();if(/^\d{5}$/.test(query)){let key=Object.keys(state.uiIds.map).find(key=>state.uiIds.map[key]===query);if(key)return key}return query}
function uiPhone(value){let phone=String(value||'').replace(/^\+86[ -]?/,'').replace(/\s/g,'');return /^\d{11}$/.test(phone)?phone.slice(0,3)+'****'+phone.slice(-4):phone||'无手机号'}
function uiNormalizeIds(roots){
 if(!document.body||!document.createTreeWalker)return;
 uiEnsureIds();
 const targets=roots||['#main','#mergeDrawers','#modal'].map(selector=>$(selector)).filter(Boolean);
 for(const root of targets){
  const update=node=>{if(node.parentElement?.closest('script,style,textarea,input,.ub-workspace,.ub-drawer'))return;const next=uiDisplayText(node.nodeValue);if(next!==node.nodeValue)node.nodeValue=next};
  if(root.nodeType===3){update(root);continue}
  if(root.nodeType!==1)continue;
  const walker=document.createTreeWalker(root,4);let node;while(node=walker.nextNode())update(node);
  for(const el of [root,...root.querySelectorAll('[aria-label],[title],[placeholder]')]){
   if(el.closest('.ub-workspace,.ub-drawer'))continue;
   for(const key of ['aria-label','title','placeholder']){const value=el.getAttribute(key);if(value){const next=uiDisplayText(value);if(next!==value)el.setAttribute(key,next)}}
  }
 }
 if(document.title)document.title=uiDisplayText(document.title);
 if(uiIdsChanged){uiIdsChanged=false;customerSavePresentation()}
}
function uiObserveIds(){
 if(typeof MutationObserver==='undefined'||!document.body)return;
 if(!uiIdObserver){
  uiIdObserver=new MutationObserver(records=>{
   const roots=new Set();
   for(const record of records){if(record.type==='characterData')roots.add(record.target);else for(const node of record.addedNodes)roots.add(node)}
   const connected=[...roots].filter(node=>node.isConnected);
   uiNormalizeIds(connected.filter(node=>!connected.some(other=>other!==node&&other.contains(node))));
  });
  for(const selector of ['#main','#mergeDrawers','#modal']){const root=$(selector);if(root)uiIdObserver.observe(root,{subtree:true,childList:true,characterData:true})}
 }
 uiNormalizeIds();
}
function uiStopObservingIds(){uiIdObserver?.disconnect();uiIdObserver=null}
function customerCloseModal(){if(typeof apIsMobile==='function'&&apIsMobile()&&apSheet){apDismiss();return;}if(typeof pcModalCustomer!=='undefined')pcModalCustomer=null;if(typeof pcRecordModalState!=='undefined')pcRecordModalState=null;if(!PCUI.closeDialog())syncDrawerLayer($('#modal'),'modal','');setTimeout(()=>{if(modalFocus?.isConnected&&!modalFocus.closest('[inert]'))modalFocus.focus();else{let restored=modalFocusAction?[...document.querySelectorAll('.merge-drawer-backdrop.show button')].find(x=>x.getAttribute('onclick')===modalFocusAction):null;(restored||$('.merge-drawer-backdrop.show .icon-btn'))?.focus()}},drawerMotionTime()+16)}
function resetPageSearch(){if(historyProfileId)historyFilter={module:'',user:'',from:'',to:''};render()}
window.PCModules['customer-state']={
 ready:Promise.resolve().then(()=>{if(customerReadError)throw customerReadError;return PCCustomerStorage.run(()=>{initializeArbitration();initializeMergeProfiles();})}),
 finishInitialization(work){
  return PCCustomerStorage.run(()=>{
   if(customerReadError)throw customerReadError;
   const before=clone(state);customerInitializing=true;
   try{work();uiEnsureIds();if(uiIdsChanged){uiIdsChanged=false;customerPersistencePending=true}
    if(customerPersistencePending){PCCustomerStorage.saveState(state);customerPersistencePending=false}
   }catch(error){customerRollback(PCCustomerStorage.restore()||before);throw error}
   finally{customerInitializing=false}
  });
 }
};
