// Isolated HTML/form integration checks; requires jsdom 26+, no real browser state is read.
const {JSDOM,VirtualConsole}=require('jsdom');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),E=require('./engine');
const ROOT=__dirname,KEY='meiye.complaint.prototype.a.v1';
const tick=()=>new Promise(r=>setImmediate(r));
function fixture(){const now=Date.now();return E.apply(E.seed(now),'intake',{type:'create',data:{sceneId:'scene-level-1',customerId:'customer1',store:E.STORES[0],orderId:'order-r1',title:'跨端表单验证',description:'验证页面真实表单提交'}},now).state;}
function load(state,actor='store1',view='pc',route='tickets'){
 const errors=[],vc=new VirtualConsole();vc.on('jsdomError',e=>errors.push(e.message));
 const dom=new JSDOM('<!doctype html><div id="application"></div><div id="modal-root"></div><div id="toast"></div>',{url:`http://localhost:8765/complaint-prototype/index.html?actor=${actor}&view=${view}#${route}`,runScripts:'outside-only',virtualConsole:vc});
 const w=dom.window,doc=w.document;w.scrollTo=()=>{};w.HTMLElement.prototype.scrollIntoView=()=>{};w.ResizeObserver=class{observe(){}disconnect(){}};w.confirm=()=>true;
 w.localStorage.setItem(KEY,JSON.stringify(state));for(const file of [...fs.readFileSync(path.join(ROOT,'index.html'),'utf8').matchAll(/<script src="([^?]+)\?/g)].map(m=>m[1]))w.eval(fs.readFileSync(path.join(ROOT,file),'utf8'));
 return {w,doc,errors,get s(){return JSON.parse(w.localStorage.getItem(w.CaseStore.KEY));},get c(){return this.s.cases[0];},set(name,value){const f=doc.querySelector('#task-form'),el=f.elements[name];assert(el,'缺少 '+name);if(el.type==='checkbox')el.checked=!!value;else el.value=value;el.dispatchEvent(new w.Event('change',{bubbles:true}));},async submit(){const f=doc.querySelector('#task-form');assert(f.checkValidity(),'可见表单有未满足的原生校验：'+[...f.elements].filter(e=>!e.disabled&&e.willValidate&&!e.validity.valid).map(e=>e.name));f.dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));await tick();assert.equal(doc.querySelector('#task-error')?.textContent||'','');assert.deepEqual(errors,[]);},close(){assert.deepEqual(errors,[]);w.close();}};
}
async function accept(x){x.doc.querySelector('[data-open-case]').click();assert.equal(x.doc.querySelector('#dialog-title').textContent,'接单确认');await x.submit();assert.equal(x.c.stage,'contact');}
function open(x){x.doc.querySelector('[data-form="process"]').click();assert.equal(x.doc.querySelector('#dialog-title').textContent,'联系与处理');}
function result(x){x.set('intent','resolved');x.set('contactResult','connected');x.set('content','已电话沟通并完成解释');x.set('customerAgreed',true);x.set('evidence','客户明确认可本次处理');x.set('fulfillment','已解释并致歉，没有剩余服务事项');}
(async()=>{
 let rulesCheck=load(fixture(),'manager','pc','rules');
 rulesCheck.doc.querySelector('[data-scene-action="edit"]').click();
 assert(rulesCheck.doc.querySelector('#rules-form'));
 for(let i=0;i<20;i++)rulesCheck.w.dispatchEvent(new rulesCheck.w.StorageEvent('storage',{key:KEY,newValue:JSON.stringify({...rulesCheck.s,workflowVersion:2})}));
 assert(rulesCheck.doc.querySelector('#rules-form'),'旧窗口写入不能关闭配置页');
 rulesCheck.w.dispatchEvent(new rulesCheck.w.StorageEvent('storage',{key:rulesCheck.w.CaseStore.KEY,newValue:JSON.stringify(rulesCheck.s)}));
 assert(rulesCheck.doc.querySelector('#rules-form'),'其他工单更新不能关闭配置页');
 rulesCheck.close();console.log('通过：新旧版本跨窗口通知不会把已打开的配置页刷回列表');
 let x=load(fixture());await accept(x);open(x);x.set('contactResult','unreachable');x.set('content','客户暂未接听');x.set('waitingReason','按约明日再联系');await x.submit();assert(!x.c.firstConnectedAt);assert(x.c.nextFollowupAt);assert.equal(x.c.stage,'contact');assert.match(x.doc.body.textContent,/办理时效与责任记录/);
 let state=x.s,id=x.c.id,period=x.c.processingPeriods[0];x.close();x=load(state,'store1','staff','detail/'+id);open(x);assert(x.doc.querySelector('#task-form [name=waitingReason]').value.includes('明日'));result(x);await x.submit();assert.equal(x.c.stage,'visit');assert.equal(x.c.processingPeriods[0].id,period.id);state=x.s;x.close();
 x=load(state,'callback','staff','detail/'+id);x.doc.querySelector('[data-form=visit]').click();x.set('content','已回访，问题解决');await x.submit();assert.equal(x.c.stage,'closed');assert(!x.doc.body.textContent.includes('品控复核'));x.close();console.log('通过：PC接单与未接通跟进 → H5一次解决 → 400 H5回访结案');
 x=load(fixture());await accept(x);open(x);x.set('intent','service');x.set('content','与客户约定补做');x.set('customerAgreed',true);x.set('evidence','客户同意次日到店');x.set('itemDescription','安排补做护理');x.set('executorId','aftercare');await x.submit();assert.equal(x.c.stage,'service');state=x.s;id=x.c.id;x.close();x=load(state,'aftercare','staff','detail/'+id);x.doc.querySelector('[data-form=service]').click();x.set('content','已按约完成补做');await x.submit();assert.equal(x.c.stage,'visit');x.close();console.log('通过：服务安排不会提前回访，执行人H5履行后流转');
 x=load(fixture());await accept(x);open(x);x.set('intent','refund');x.set('content','客户要求退还未消费金额');x.set('refundAmount','600');x.set('refundReason','未消费服务');assert(!x.doc.querySelector('[name=customerAgreed]').required||x.doc.querySelector('[name=customerAgreed]').disabled);await x.submit();assert.equal(x.c.stage,'approval');state=x.s;id=x.c.id;x.close();
 while(state.cases[0].stage==='approval'){const t=E.pending(state.cases[0])[0];x=load(state,t.assigneeId,'approval','detail/'+id+'/'+t.id);assert(x.doc.querySelector('#approval-action #task-form'));x.set('content','已核实，同意当前版本');await x.submit();assert.match(x.doc.body.textContent,/本次任务已办理/);state=x.s;x.close();}
 x=load(state,'store1','staff','detail/'+id);open(x);x.set('intent','confirm');x.set('contactResult','connected');x.set('content','客户电话同意V1退款600元，确认原路退回');await x.submit();assert.equal(x.c.stage,'refund');state=x.s;x.close();
 let t=E.pending(state.cases[0])[0];x=load(state,'finance','approval','detail/'+id+'/'+t.id);await x.submit();state=x.s;x.close();t=E.pending(state.cases[0])[0];x=load(state,'finance','approval','detail/'+id+'/'+t.id);x.set('result','unknown');x.set('content','渠道尚未明确返回');await x.submit();assert.equal(E.pending(x.c)[0].kind,'refundVerify');state=x.s;x.close();t=E.pending(state.cases[0])[0];x=load(state,'finance','approval','detail/'+id+'/'+t.id);x.set('result','success');x.set('content','核查到账成功');x.set('reference','UI-FLOW-001');await x.submit();assert.equal(x.c.stage,'visit');state=x.s;x.close();x=load(state,'callback','staff','detail/'+id);x.doc.querySelector('[data-form=visit]').click();x.set('content','客户确认退款到账并解决');await x.submit();assert.equal(x.c.stage,'closed');x.close();console.log('通过：PC退款申请 → 独立审批 → H5本版客户确认 → 独立财务核查 → H5回访');
 console.log('完成跨端表单、条件字段、原生校验与持久化验证。');
})().catch(e=>{console.error(e);process.exit(1);});
