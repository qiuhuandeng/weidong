const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const source=file=>fs.readFileSync(path.join(__dirname,'../pages',file),'utf8');
function line(file,prefix){const found=source(file).split('\n').find(value=>value.trim().startsWith(prefix));assert.ok(found,prefix);return found;}
const forbidden=()=>{throw Error('Closing must not collect, save or ask to discard the draft');};

for(const module of ['management/index.js','supply-chain/index.js','refund-risk/app.js']){
  test(module+' closes only the edited layer without saving or showing a prompt',()=>{
    const parent={model:{name:'parent draft'}},child={type:'edit',model:{name:'unsaved child'},initial:'{}',onSave:forbidden},stack=[parent,child],timers=[];
    let cleanups=0,focuses=0;
    child.cleanup=()=>cleanups++;child.opener={isConnected:true,closest:()=>null,focus:()=>focuses++};
    const ctx={stack,S:{stack,saving:false},setTimeout:fn=>timers.push(fn),collect:forbidden,PCUI:{dialog:forbidden},persist:forbidden,draw(){},sync(){},syncDrawerLayer(){},drawerMotionTime:()=>0,$:()=>null,document:{querySelector:()=>null},toast(){}};
    vm.runInNewContext(line(module,'function close(')+'\nclose();',ctx);
    assert.equal(stack.length,1);assert.equal(stack[0],parent);assert.deepEqual(parent.model,{name:'parent draft'});
    timers.forEach(fn=>fn());assert.equal(focuses,1);
    if(module.startsWith('management'))assert.equal(cleanups,1);
    if(module.startsWith('supply-chain')||module.startsWith('refund-risk')){
      stack.push(child);ctx.S.saving=true;child.saving=true;
      vm.runInNewContext('close();',ctx);assert.equal(stack.length,2,'in-flight saves still hold the layer');
    }
  });
}

test('complaint child cancellation preserves the parent draft, scroll and focus',()=>{
  const parentBody={scrollTop:0},parent={el:{inert:true,querySelector:()=>parentBody},options:{draft:{types:['parent draft']}}};
  let removed=0,focused=0;
  const child={options:{draft:{criteria:'unsaved child'},saving:false},parentView:{scroll:84,tab:'follow'},trigger:{isConnected:true,focus:()=>focused++},el:{classList:{remove(){},add(){}},remove:()=>removed++}};
  const layers=[parent,child],timers=[],ctx={layers,main:{layer:parent,editor:{layer:child}},root:{querySelector:()=>null},setTimeout:fn=>timers.push(fn),matchMedia:()=>({matches:true}),setDetailTab(){},unlockBackground(){},dirty:forbidden,showDiscard:forbidden};
  vm.runInNewContext(line('complaints/business.js','function closeLayer(')+'\ncloseLayer();',ctx);
  assert.equal(child.closing,true);assert.equal(layers.length,2,'retain overlay until close animation finishes');
  timers.shift()();assert.equal(layers.length,1);assert.equal(removed,1);assert.equal(focused,1);assert.equal(ctx.main.editor,null);
  assert.equal(parent.el.inert,false);assert.equal(parentBody.scrollTop,84);assert.deepEqual(parent.options.draft,{types:['parent draft']});
  child.closing=false;child.options.saving=true;layers.push(child);vm.runInNewContext('closeLayer();',ctx);assert.equal(child.closing,false);assert.equal(timers.length,0);
});

test('customer, correction and approval drawers discard edited layer state directly',()=>{
  const ctx={mrTask:{dirty:true},mrFocus:null,cxApplicationOpen:true,clPlan:{unsaved:true},clDraftId:'existing-draft',clErrors:['validation'],cxApplicationFocus:null,apTask:{dirty:true,note:'unsaved'},apSheet:{},render(){},setTimeout(){},drawerMotionTime:()=>0,apIsMobile:()=>false,modal:forbidden,apPrompt:forbidden,clSaveDraft:forbidden};
  const file='customer/index.js';
  for(const name of ['mrClose','clCloseNow','clClose','apClose'])vm.runInNewContext(line(file,'function '+name+'('),ctx);
  vm.runInNewContext('mrClose();clClose();apClose();',ctx);
  assert.equal(ctx.mrTask,null);assert.equal(ctx.cxApplicationOpen,false);assert.equal(ctx.clPlan,null);assert.equal(ctx.clDraftId,null);assert.equal(ctx.apTask,null);assert.equal(ctx.apSheet,null);
});

test('group approval closes edited applications and rules without losing drafts during rule tab switches',()=>{
  const routes=[],A={actions:{},route:['rule','example','basic'],open:forbidden,mutate:forbidden};
  const ctx={A,route:['apply','example'],applicationDraft:{dirty:true,title:'unsaved'},editor:{id:'example',draft:{basic:{name:'unsaved'}}},unsaved:true,nodeDraft:{},nodeContext:{},branchDraft:{},branchContext:{},PCGroupUI:{navigate:to=>routes.push(to)}};
  vm.runInNewContext(line('group-approval/configuration.js','A.beforeNavigate=')+'\n'+line('group-approval/app.js','A.go='),ctx);
  vm.runInNewContext("A.go('rule/example/flow');",ctx);
  assert.equal(ctx.editor.draft.basic.name,'unsaved');assert.equal(ctx.unsaved,true);
  vm.runInNewContext("A.go('rules');",ctx);
  assert.equal(ctx.editor,null);assert.equal(ctx.unsaved,false);assert.equal(ctx.nodeDraft,null);assert.equal(ctx.branchDraft,null);assert.equal(routes.at(-1),'rules');
  A.route=['apply','example'];ctx.applicationDraft={dirty:true,title:'unsaved'};
  vm.runInNewContext("A.go('apply/example');",ctx);assert.ok(ctx.applicationDraft,'same route retains the application');
  vm.runInNewContext("A.go('list/mine');",ctx);assert.equal(ctx.applicationDraft,null);assert.equal(routes.at(-1),'list/mine');
});
