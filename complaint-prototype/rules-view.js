(function(root){
  'use strict';
  const E=root.CaseEngine,R=E.Rules;
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const person=id=>E.STAFF.find(p=>p.id===id)?.name||id;
  const levels=[[1,'一级'],[2,'二级'],[3,'三级'],[4,'四级']];
  const input=(label,path,value,type='text',extra='')=>`<label class="rule-field"><span>${label}</span><input data-scene="${path}" aria-label="${label}" type="${type}" value="${esc(value)}" ${extra}></label>`;
  const select=(label,path,options,value)=>`<label class="rule-field"><span>${label}</span><select data-scene="${path}" aria-label="${label}">${options.map(([v,t])=>`<option value="${esc(v)}" ${String(value)===String(v)?'selected':''}>${esc(t)}</option>`).join('')}</select></label>`;
  const toggle=(label,path,value)=>`<label class="scene-check"><input type="checkbox" data-scene="${path}" ${value?'checked':''}>${label}</label>`;
  const people=ids=>E.STAFF.filter(p=>ids.includes(p.id)).map(p=>[p.id,p.name+' · '+p.role]);
  function flowSummary(d){return R.Flow.summary(R.Flow.prepare(d).config.approval.flow);}
  function filterBar(filters){return `<form id="scene-filters" class="filters"><input name="keyword" aria-label="审批场景名称" placeholder="搜索审批场景名称" value="${esc(filters.keyword)}"><select name="status" aria-label="审批场景状态"><option value="">全部状态</option><option value="true" ${filters.status==='true'?'selected':''}>启用</option><option value="false" ${filters.status==='false'?'selected':''}>停用</option></select><button class="btn" type="submit">查询</button><button class="btn quiet" type="button" data-scene-action="reset-filter">重置</button></form>`;}
  function list(state,filters){
    const all=R.sceneList(state),rows=all.filter(s=>(!filters.keyword||(s.name+' '+s.description).includes(filters.keyword))&&(!filters.status||String(s.enabled)===filters.status));
    return `<section class="panel"><div class="table-wrap"><table class="scene-table"><thead><tr><th>审批场景名称</th><th>客诉等级</th><th>整单办结时限</th><th>方案审批流程</th><th>状态</th><th>操作</th></tr></thead><tbody>${rows.map(s=>`<tr><td><strong>${esc(s.name)}</strong>${s.description?`<div class="sub">${esc(s.description)}</div>`:''}</td><td>${levels.find(([v])=>v===s.level)[1]}</td><td>${s.config.timing.targetHours} 小时</td><td class="scene-flow-summary">${esc(flowSummary(s))}</td><td><span class="badge ${s.enabled?'green':''}">${s.enabled?'启用':'停用'}</span></td><td class="nowrap scene-rule-actions"><button class="btn quiet compact blue" data-scene-action="assignment" data-id="${esc(s.id)}">指派规则</button><button class="btn quiet compact blue" data-scene-action="edit" data-id="${esc(s.id)}">方案审批</button><button class="btn quiet compact blue" data-scene-action="edit-basic" data-id="${esc(s.id)}">编辑</button><button class="btn quiet compact" data-scene-action="toggle" data-id="${esc(s.id)}">${s.enabled?'停用':'启用'}</button></td></tr>`).join('')||'<tr><td colspan="6"><div class="empty"><h3>暂无符合条件的审批场景</h3><p>可调整查询条件，或新建一个审批场景。</p></div></td></tr>'}</tbody></table></div><div class="table-foot">共 ${rows.length} 个审批场景</div></section><p class="small muted mt">配置修改仅用于新受理工单；已有工单继续按原审批场景规则办理。</p>`;
  }
  function basic(d){return `<section class="scene-section"><h2>审批场景信息</h2><div class="rule-grid">${input('审批场景名称','name',d.name,'text','maxlength="30" placeholder="例如：四级客诉" required')}${select('客诉等级','level',levels,d.level)}<label class="rule-field full"><span>审批场景说明</span><textarea data-scene="description" rows="3" maxlength="300" placeholder="说明什么情况下选择这个审批场景">${esc(d.description)}</textarea></label></div>${toggle('启用该审批场景，允许新工单选择','enabled',d.enabled)}</section>`;}
  function approval(d,state){return window.ApprovalFlowUI.canvas(d,state);}
  function timingEditor(scene){
    const d=R.prepareScene(scene),r=d.config;
    const hours=(path,value,label,min=0.25,max=720,step=0.25)=>`<span class="hr-hours"><input data-scene="${path}" aria-label="${esc(label)}" type="number" min="${min}" max="${max}" step="${step}" value="${esc(value)}" required><span>小时</span></span>`;
    const rows=[
      ['首联','工单受理','首次有效沟通','firstContactHours','contact'],
      ['处理','进入处理阶段','提交处理结果 / 有效方案','processingHours','processing'],
      ...(d.level>1?[['打款','审批及客户确认完成、付款任务生成','成功打款并登记凭证','refundHours','refund']]:[]),
      ['回访','处理完成 / 打款成功','完成客户回访并满足结案条件','visitHours','visit'],
    ];
    const approvals=d.level===1?'':R.approvalNodes(r.approval.flow).map(({node,path,branch})=>`<tr><td>${esc(node.title)}${branch?`<small class="muted">${esc(branch)}</small>`:''}</td><td>审批任务产生</td><td>同意 / 驳回</td><td>${hours(path+'.handling.hours',node.handling.hours,node.title+'时限')}</td></tr>`).join('');
    return `<div class="timing-editor-meta"><label><span>整单时限</span>${hours('config.timing.targetHours',r.timing.targetHours,'整单时限')}</label></div><h3 class="timing-editor-title">节点办理时限</h3><div class="table-wrap"><table class="timing-editor-table"><thead><tr><th>办理环节</th><th>起算</th><th>完成</th><th>时限</th></tr></thead><tbody>${rows.map(([label,start,end,key,action])=>`<tr><td>${label}</td><td>${start}</td><td>${end}</td><td>${hours('config.timing.'+key,r.timing[key],label+'时限')}</td></tr>`).join('')}${approvals}</tbody></table></div><p class="small muted mt">一级普通处理不设审批和打款时限。保存后新受理工单采用新时限。</p>`;
  }
  function editor(state,d,tab){
    return `<div class="approval-config-page"><div class="page-heading scene-editor-heading secondary-page-heading approval-config-heading"><div><button class="btn quiet blue secondary-page-back approval-back" data-scene-action="back">‹ 返回</button><h1>方案审批</h1></div><button class="btn primary" type="submit" form="rules-form">保存配置</button></div><section class="panel scene-editor"><form id="rules-form" novalidate><div id="rules-error" class="form-error callout error" role="alert"></div>${approval(d,state)}</form></section></div>`;
  }
  function read(form,draft){
    const d=JSON.parse(JSON.stringify(draft));form?.querySelectorAll('[data-scene]').forEach(el=>{if(el.type==='radio'&&!el.checked)return;const keys=el.dataset.scene.split('.'),key=keys.pop();let obj=d;keys.forEach(k=>obj=obj[k]||(obj[k]={}));obj[key]=el.type==='checkbox'?el.checked:el.type==='number'?(el.value===''?'':Number(el.value)):el.value;});d.level=Number(d.level);return d;
  }
  root.RuleSettingsView={list,editor,read,filterBar,timingEditor,basicEditor:basic};
})(window);
