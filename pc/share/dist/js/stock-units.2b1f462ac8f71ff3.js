/* Unit maintenance uses the inventory's shared company component adapters. */
(function(S){
  'use strict';
  const {M,E}=S,B=S.button,L=S.link,I=S.input,F=S.field,C=S.select;
  const chain=g=>[g.baseUnit,...g.levels].join(' → ');
  S.pages['stock-units']='单位维护';
  S.views['stock-units']=()=>{
    const f=S.page.applied,rows=S.data.unitGroups.filter(g=>S.matches(chain(g),f.q)&&(!f.status||String(g.enabled)===f.status));
    return S.search([S.filter('单位名称','q'),S.filter('状态','status','select',[['','全部'],['true','启用'],['false','停用']])])+S.panel('单位列表',S.paged([
      ['序号',(g,i)=>(S.page.page-1)*S.page.size+i+1,70],
      ['最小单位',g=>E(g.baseUnit),130],
      ['单位层级',g=>E(chain(g)),300],
      ['状态',g=>S.tag(g.enabled?'启用':'停用'),100],
      ['操作',g=>L('编辑','unitGroupEdit',g.id)+L(g.enabled?'停用':'启用','unitGroupStatus',g.id)+L('删除','unitGroupDelete',g.id),210]
    ],rows,false),B('新增最小单位','unitGroupEdit','','','primary'));
  };
  S.actions.unitGroupEdit=id=>S.open('unitGroup',{value:S.data.unitGroups.find(g=>g.id===id)||{baseUnit:'',levels:[],enabled:true}},id?'编辑单位层级':'新增最小单位',560);
  S.drawers.unitGroup=l=>{
    const v=l.data.value,used=!!v.id&&M.unitBaseUsed(S.data,S.data.unitGroups.find(g=>g.id===v.id)?.baseUnit);
    let body=S.form([
      F('最小单位',I('最小单位',v.baseUnit,'value.baseUnit','text',used?'disabled':''),true),
      F('状态',C('单位状态',[['true','启用'],['false','停用']],String(v.enabled),'value.enabled'))
    ]);
    body+=S.section('上一级',v.levels.length?S.table([
      ['当前单位',(x,i)=>'<span data-unit-from="'+i+'">'+E((i?v.levels[i-1]:v.baseUnit)||'待填写')+' →</span>',135],
      ['上一级',(x,i)=>I('第 '+(i+1)+' 级单位',x,'value.levels.'+i),240],
      ['操作',(x,i)=>L('移除','unitLevelRemove',String(i)),80]
    ],v.levels):'<div class="empty">暂未添加上一级</div>',B('新增上一级','unitLevelAdd'));
    return {body,footer:B('取消','close')+B('保存','unitGroupSave','','','primary')};
  };
  S.actions.unitLevelAdd=()=>{S.top.data.value.levels.push('');S.actions.drawRefresh();};
  S.actions.unitLevelRemove=id=>{S.top.data.value.levels.splice(Number(id),1);S.actions.drawRefresh();};
  S.actions.unitGroupSave=()=>{const value=M.copy(S.top.data.value);value.enabled=value.enabled===true||value.enabled==='true';return S.run('unitGroup.save',{value},()=>S.close());};
  S.actions.unitGroupStatus=id=>{
    const value=S.data.unitGroups.find(g=>g.id===id),revision=S.data.revision;
    if(!value.enabled)return S.run('unitGroup.status',{id,enabled:true},undefined,revision);
    return S.confirm('停用单位','停用“'+value.baseUnit+'”这组单位？新规格将不再提供该组单位，已有规格及历史记录保留。',()=>S.run('unitGroup.status',{id,enabled:false},undefined,revision));
  };
  S.actions.unitGroupDelete=id=>{
    const value=S.data.unitGroups.find(g=>g.id===id),revision=S.data.revision;
    if(M.unitBaseUsed(S.data,value.baseUnit))throw Error('该最小单位已被规格使用，请停用，不能删除。');
    return S.confirm('删除单位','确认删除“'+value.baseUnit+'”及其上一级配置？',()=>S.run('unitGroup.delete',{id},undefined,revision));
  };
  document.addEventListener('input',event=>{
    if(S.top?.type!=='unitGroup'||!event.target.closest('.stock-module'))return;
    const v=S.top.data.value;
    document.querySelectorAll('[data-unit-from]').forEach(node=>{const i=Number(node.dataset.unitFrom);node.textContent=((i?v.levels[i-1]:v.baseUnit)||'待填写')+' →';});
  });
  const inventory=window.PCModules['stock-management'];
  window.PCModules['stock-units']={ready:inventory.ready,render:inventory.render,redraw:inventory.redraw,leave:inventory.leave,go:inventory.go};
})(StockPC);
