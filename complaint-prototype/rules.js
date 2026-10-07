(function (root) {
  'use strict';
  function createRulesModule(STAFF, STORES, HOUR) {
    const Flow=(typeof module!=='undefined'&&module.exports?require('./approval-flow.js'):root.createApprovalFlow)(STAFF,STORES);
    const copy = value => JSON.parse(JSON.stringify(value));
    const requireValue = (ok, message) => { if (!ok) throw new Error(message); };
    const sections = { classification:'分类与分级', timing:'办理时限', routing:'派单与人员', approval:'审批与授权', notifications:'通知设置', closure:'回访与结案' };
    function defaults() {
      return {
        version:1, updatedAt:null, updatedBy:null,
        classification:{ categories:['服务态度','预约等待','服务体验','环境设施','其他'].map((name,i)=>({id:'category'+i,name,level:1,enabled:true})), keywords:[], keywordLevel:3 },
        timing:{ assignMinutes:15, acceptMinutes:30, firstContactHours:2, planHours:12, confirmHours:24, serviceHours:6, targetHours:24, visitHours:24, qualityHours:24, approvalHours:24, refundHours:24 },
        routing:{ mode:'auto', fallbackId:'manager', stores:STORES.map((store,i)=>({store,primaryId:'store'+(i+1),backupId:'aftercare'})), available:{store1:true,store2:true,aftercare:true,manager:true} },
        approval:{ refundManagerAbove:500, compensationManagerAbove:0, managerId:'manager', financeId:'finance', delegateId:'director' },
        notifications:{ task:true, ownerCopy:false, overdue:true, supervisor:true, customer:true, escalationId:'manager' },
        closure:{ callbackId:'callback', qualityId:'quality', retryHours:4, reviewMode:'multiple', lowScoreThreshold:0 }
      };
    }
    function normalize(s) {
      if (!s.rules) s.rules=defaults();
      if (!s.ruleHistory) s.ruleHistory=[];
      // Legacy cases always retain the original A-batch rules, even after later configuration updates.
      s.cases.forEach(c=>{if(!c.rulesSnapshot)c.rulesSnapshot=defaults();});
      [s.rules,...s.cases.map(c=>c.rulesSnapshot)].forEach(r=>{
        if(r.timing.approvalHours===undefined)r.timing.approvalHours=24;
        if(r.timing.refundHours===undefined)r.timing.refundHours=24;
        if(r.approval.delegateId===undefined)r.approval.delegateId='director';
      });
      return s;
    }
    function approvalNodes(flow,path='config.approval.flow',branch='') {
      return (flow||[]).flatMap((node,i)=>node.type==='branch'?node.branches.flatMap((b,j)=>approvalNodes(b.nodes,path+'.'+i+'.branches.'+j+'.nodes',branch+(branch?' / ':'')+(b.fallback?'默认条件':b.title))):node.type==='approval'?[{node,path:path+'.'+i,branch}]:[]);
    }
    function prepareScene(scene) {
      const d=Flow.prepare(scene),r=d.config;
      if(!r.handling){
        r.handling={version:1,empty:{mode:'block',duty:'公司负责人'},departed:{mode:'block',duty:'公司负责人'},repeat:'every',remindPercent:80,acceptAction:'supervisor',overdue:{contact:'supervisor',plan:'supervisor',confirm:'supervisor',service:'supervisor',refund:'supervisor',visit:'supervisor'}};
      }
      r.timing.processingHours ??= r.timing.planHours;
      if(r.timing.riskHours===undefined)r.timing.riskHours=0.5;
      r.handling.overdue.risk ??= 'supervisor';
      r.handling.overdue.processing ??= r.handling.overdue.plan||'supervisor';
      r.closure.callbackOnly=true;
      r.notifications.task=true;r.notifications.overdue=true;r.notifications.supervisor=true;
      approvalNodes(r.approval.flow).forEach(({node})=>{if(node.hierarchy)node.hierarchy.empty='block';if(!node.handling)node.handling={hours:r.timing.approvalHours,overdue:'supervisor'};});
      return d;
    }
    function taskPolicy(r,kind,nodeId) {
      if(!r.handling)return null;
      if(kind==='refundApproval'){const n=approvalNodes(r.approval.flow).find(x=>x.node.id===nodeId)?.node;return n?.handling||{hours:r.timing.approvalHours,overdue:'supervisor'};}
      const key=kind.startsWith('refund')?'refund':kind;
      return {overdue:key==='accept'?r.handling.acceptAction:r.handling.overdue[key]||'supervisor'};
    }
    function validateHandling(r) {
      if(!r.handling)return;
      const h=r.handling;
      for(const key of ['empty','departed']){requireValue(['block','replace'].includes(h[key]?.mode),'请选择人员异常处理方式');if(h[key].mode==='replace')requireValue(['客诉主管','公司负责人','财务审核'].includes(h[key].duty),'请选择有效的备用审批职责');}
      requireValue(['every','consecutive'].includes(h.repeat),'请选择重复审批规则');
      requireValue(['remind','supervisor','transfer'].includes(h.acceptAction),'请选择接单超时处理方式');
      requireValue(h.remindPercent!==''&&Number.isFinite(Number(h.remindPercent))&&Number(h.remindPercent)>=1&&Number(h.remindPercent)<=99,'临期提醒比例须在1至99之间');h.remindPercent=Number(h.remindPercent);
      for(const key of ['contact','plan','confirm','service','refund','visit','processing'])requireValue(['remind','supervisor'].includes(h.overdue[key]),'请选择节点超时处理方式');
      approvalNodes(r.approval.flow).forEach(({node})=>{requireValue(Number.isFinite(Number(node.handling?.hours))&&Number(node.handling.hours)>=0.25&&Number(node.handling.hours)<=720,node.title+'办理时限须在0.25至720小时之间');node.handling.hours=Number(node.handling.hours);requireValue(['remind','supervisor'].includes(node.handling.overdue),'请选择审批超时处理方式');});
    }
    function validate(input) {
      const r=copy(input), staff=id=>STAFF.find(p=>p.id===id);
      const personRole=(id,roles,label)=>requireValue(staff(id)&&roles.includes(staff(id).role),'请选择有效的'+label);
      const number=(object,key,min,max,label)=>{ const value=object[key]; requireValue(value!==''&&value!==null&&Number.isFinite(Number(value))&&Number(value)>=min&&Number(value)<=max,label+'须在'+min+'至'+max+'之间'); object[key]=Number(value); };
      Object.keys(sections).forEach(key=>requireValue(r[key]&&typeof r[key]==='object','缺少'+sections[key]));
      const cats=r.classification.categories;
      requireValue(Array.isArray(cats)&&cats.length>0&&cats.length<=20,'投诉分类须保留1至20项');
      cats.forEach(c=>{c.name=String(c.name||'').trim();requireValue(c.name&&c.name.length<=20,'分类名称须为1至20个字');requireValue(typeof c.id==='string'&&c.id,'分类标识无效');requireValue([1,2,3].includes(Number(c.level)),'分类等级须为一、二或三级');c.level=Number(c.level);requireValue(typeof c.enabled==='boolean','分类启用状态无效');});
      requireValue(new Set(cats.map(c=>c.name)).size===cats.length,'投诉分类名称不能重复');
      requireValue(new Set(cats.map(c=>c.id)).size===cats.length,'分类标识不能重复');
      requireValue(cats.some(c=>c.enabled),'至少启用一个投诉分类');
      requireValue(Array.isArray(r.classification.keywords)&&r.classification.keywords.length<=20,'升级关键词最多20个');
      r.classification.keywords=[...new Set(r.classification.keywords.map(k=>String(k).trim()).filter(Boolean))];
      requireValue(r.classification.keywords.every(k=>k.length<=30),'升级关键词每个不超过30字');
      requireValue([2,3].includes(Number(r.classification.keywordLevel)),'关键词升级等级请选择二级或三级');
      r.classification.keywordLevel=Number(r.classification.keywordLevel);
      Object.keys(defaults().timing).forEach(key=>number(r.timing,key,key.endsWith('Minutes')?1:0.25,key.endsWith('Minutes')?1440:720,'办理时限'));
      if(r.contactTimingVersion!==1){requireValue(r.timing.assignMinutes<=r.timing.firstContactHours*60,'派单时限不能晚于首次联系时限');requireValue(r.timing.acceptMinutes<=r.timing.firstContactHours*60,'接单时限不能晚于首次联系时限');}
      requireValue(r.timing.firstContactHours<=r.timing.targetHours,'首次联系时限不能晚于整体处理目标');
      delete r.timing.storeFirstContactHours;
      requireValue(r.timing.planHours<=r.timing.targetHours,'方案制定时限不能超过整体处理目标');
      requireValue(r.timing.serviceHours<=r.timing.targetHours,'默认履行时长不能超过整体处理目标');
      requireValue(['auto','manual'].includes(r.routing.mode),'请选择派单方式');
      personRole(r.routing.fallbackId,['售后主管'],'兜底主管');
      requireValue(r.routing.available&&typeof r.routing.available==='object','缺少人员接单状态');
      ['store1','store2','aftercare','manager'].forEach(id=>requireValue(typeof r.routing.available[id]==='boolean','人员接单状态无效'));
      requireValue(r.routing.available[r.routing.fallbackId],'兜底主管必须保持可承接');
      requireValue(Array.isArray(r.routing.stores)&&r.routing.stores.length===STORES.length&&new Set(r.routing.stores.map(row=>row.store)).size===STORES.length,'请为每家门店配置派单规则');
      r.routing.stores.forEach(row=>{
        requireValue(STORES.includes(row.store),'门店范围无效');
        [row.primaryId,row.backupId].forEach(id=>{personRole(id,['门店店长','售后专员','售后主管'],'承接人员');requireValue(staff(id).store==='*'||staff(id).store===row.store,'承接人不在对应门店范围');});
        requireValue(row.primaryId!==row.backupId,'首选人员和替补人员不能相同');
      });
      number(r.approval,'refundManagerAbove',0,1000000,'退款主管审批阈值');number(r.approval,'compensationManagerAbove',0,1000000,'赔偿主管审批阈值');
      personRole(r.approval.managerId,['售后主管'],'审批主管');personRole(r.approval.financeId,['财务审核'],'财务审核人');
      personRole(r.approval.delegateId,['审批主管','品控复核'],'同人审批替代人');
      if(r.approval.flow){Flow.validate(r.approval.flow);requireValue(Flow.duties.includes(r.approval.delegateDuty),'请选择同人审批代审职责');}
      if(r.approval.nodes&&!r.approval.flow){
        const nodes=r.approval.nodes;
        requireValue(Array.isArray(nodes)&&nodes.length>=1&&nodes.length<=5,'审批流程须保留1至5个节点');
        nodes.forEach(n=>{
          personRole(n.assigneeId,['售后主管','审批主管','品控复核','财务审核'],'审批人');
          requireValue(['always','amountAbove'].includes(n.condition),'请选择节点审批条件');
          if(n.condition==='amountAbove')number(n,'amount',0,1000000,'审批金额条件');
        });
        requireValue(new Set(nodes.map(n=>n.assigneeId)).size===nodes.length,'审批流程不能重复安排同一个人');
        requireValue(nodes.at(-1).assigneeId===r.approval.financeId&&nodes.at(-1).condition==='always','最后一个节点须为财务审核，且所有退款均需经过');
        requireValue(!nodes.some(n=>n.assigneeId===r.approval.delegateId),'替代审批人不能同时出现在审批流程中');
      }
      ['task','ownerCopy','overdue','supervisor','customer'].forEach(key=>requireValue(typeof r.notifications[key]==='boolean','通知开关状态无效'));
      personRole(r.notifications.escalationId,['售后主管'],'超时升级接收人');
      personRole(r.closure.callbackId,['400回访','品控复核'],'独立回访人');if(!r.closure.callbackOnly){personRole(r.closure.qualityId,['400回访','品控复核'],'品控复核人');
      requireValue(r.closure.callbackId!==r.closure.qualityId,'回访人与品控复核人需要相互独立');}
      number(r.closure,'retryHours',0.25,168,'再次联系间隔');
      if(!r.closure.callbackOnly){requireValue(['multiple','all','risk'].includes(r.closure.reviewMode),'请选择结案复核范围');
      requireValue([0,1,2,3,4].includes(Number(r.closure.lowScoreThreshold)),'低分复核阈值须为0至4');r.closure.lowScoreThreshold=Number(r.closure.lowScoreThreshold);}
      if(r.timing.processingHours!==undefined){number(r.timing,'processingHours',0.25,720,'处理阶段时限');requireValue(r.timing.processingHours<=r.timing.targetHours,'处理阶段时限不能超过整单时限');}
      validateHandling(r);
      return r;
    }
    function changes(before,after) { return Object.keys(sections).filter(key=>JSON.stringify(before[key])!==JSON.stringify(after[key])).map(key=>sections[key]); }
    function save(original,actorId,draft,expectedVersion,reason,now) {
      requireValue(actorId==='manager','只有授权售后主管可以保存规则');
      const s=normalize(copy(original));
      requireValue(s.rules.version===expectedVersion,'规则已被其他窗口更新，请保留修改内容并载入最新版本后再编辑');
      const rules=validate(draft), changed=changes(s.rules,rules);
      requireValue(changed.length,'没有需要保存的规则变更');
      const note=String(reason||'').trim();requireValue(note&&note.length<=300,'请填写300字以内的变更说明');
      rules.version=s.rules.version+1;rules.updatedAt=now;rules.updatedBy=actorId;
      s.ruleHistory.unshift({version:rules.version,at:now,actorId,reason:note,changed,before:copy(s.rules),after:copy(rules)});
      s.rules=rules;s.revision++;return s;
    }
    function route(r,data,now) {
      const category=r.classification.categories.find(c=>c.enabled&&c.name===(data.category||r.classification.categories.find(c=>c.enabled)?.name));
      requireValue(category,'所选分类已停用或不存在，请重新选择');
      const words=(data.title||'')+' '+(data.description||'');
      const matched=r.classification.keywords.filter(k=>words.toLowerCase().includes(k.toLowerCase()));
      const level=r.scene? r.scene.level : Math.max(category.level,matched.length?r.classification.keywordLevel:1);
      const row=r.routing.stores.find(row=>row.store===data.store);requireValue(row,'请选择已配置的门店');
      let assigneeId=r.routing.fallbackId,stage='unassigned',reason='主管人工分配';
      if((r.scene&&r.routing.sceneMode==='manager')||(!r.scene&&level>=2)) {stage='accept';reason=r.scene?'按场景安排主管承接':'二、三级投诉由主管承接';}
      else if(data.autoAssign!==false&&r.routing.mode==='auto') {
        if(r.routing.available[row.primaryId]) {assigneeId=row.primaryId;stage='accept';reason='按门店分配首选人员';}
        else if(r.routing.available[row.backupId]) {assigneeId=row.backupId;stage='accept';reason='首选人员不可接单，启用替补';}
        else reason='首选与替补均不可接单，进入主管分配队列';
      }
      return {category:category.name,level,matched,assigneeId,stage,reason,firstContactDue:now+r.timing.firstContactHours*HOUR,targetAt:now+r.timing.targetHours*HOUR,taskDue:now+(stage==='accept'?r.timing.acceptMinutes:r.timing.assignMinutes)*60000};
    }
    function approvalPreview(r,type,amount) {
      requireValue(['refund','compensation'].includes(type),'请选择退款或赔偿');
      requireValue(Number.isFinite(Number(amount))&&Number(amount)>0,'请输入大于0的退款或赔偿金额');
      if(type==='refund'&&r.approval.nodes)return r.approval.nodes.filter(n=>n.condition==='always'||Number(amount)>n.amount).map(n=>n.assigneeId);
      const threshold=r.approval[type==='refund'?'refundManagerAbove':'compensationManagerAbove'];
      return Number(amount)>threshold?[r.approval.managerId,r.approval.financeId]:[r.approval.financeId];
    }
    const needsQuality=(c,score)=>!c.rulesSnapshot.closure.callbackOnly&&(c.rulesSnapshot.closure.reviewMode==='all'||(c.rulesSnapshot.closure.reviewMode==='multiple'&&c.round>1)||(c.rulesSnapshot.closure.reviewMode==='risk'&&(c.level>=2||c.round>1))||(score!==null&&c.rulesSnapshot.closure.lowScoreThreshold>0&&score<=c.rulesSnapshot.closure.lowScoreThreshold));

    function sceneList(s){
      if(s.ruleScenes)return copy(s.ruleScenes);
      return [1,2,3,4].map(level=>{
        const config=copy(s.rules||defaults());
        config.routing.sceneMode=level===1?'store':'manager';
        Object.assign(config.timing,{targetHours:level===1?24:72,planHours:level===1?8:12,confirmHours:level===1?2:4,serviceHours:8,visitHours:4,approvalHours:4});
        if(level===4){config.timing.firstContactHours=0.5;config.timing.acceptMinutes=10;config.timing.planHours=4;config.timing.confirmHours=2;config.timing.visitHours=2;config.timing.approvalHours=1;}
        config.approval.nodes=[{assigneeId:config.approval.managerId,condition:'amountAbove',amount:config.approval.refundManagerAbove},{assigneeId:config.approval.financeId,condition:'always',amount:0}];
        return {id:'scene-level-'+level,name:['','一级客诉','二级客诉','三级客诉','四级客诉'][level],level,description:'',enabled:true,version:1,updatedAt:null,updatedBy:null,config};
      });
    }
    function newScene(s){
      const scene=sceneList(s)[0];scene.id='';scene.name='';scene.description='';scene.version=0;scene.enabled=true;scene.updatedAt=null;scene.updatedBy=null;return scene;
    }
    function validateScene(s,draft){
      let d=copy(draft);if(d.config?.handling)d=prepareScene(d);d.name=String(d.name||'').trim();d.description=String(d.description||'').trim();d.level=Number(d.level);
      requireValue(d.name&&d.name.length<=30,'请填写1至30字的场景名称');
      requireValue([1,2,3,4,5].includes(d.level),'请选择一级至五级客诉等级');
      requireValue(d.description.length<=300,'场景说明最多300字');requireValue(typeof d.enabled==='boolean','场景状态无效');
      requireValue(!sceneList(s).some(x=>x.id!==d.id&&x.name===d.name),'场景名称不能重复');
      requireValue(['store','manager'].includes(d.config?.routing?.sceneMode),'请选择场景承接方式');
      requireValue(Array.isArray(d.config?.approval?.nodes),'请配置场景审批流程');
      if(d.config.routing.organizationDriven){
        [d.config.routing.backupDuty,d.config.routing.fallbackDuty,d.config.closure.callbackDuty,...(d.config.closure.callbackOnly?[]:[d.config.closure.qualityDuty])].forEach(duty=>requireValue(Flow.duties.includes(duty),'请选择有效组织职责'));
        if(!d.config.closure.callbackOnly)requireValue(d.config.closure.callbackDuty!==d.config.closure.qualityDuty,'回访与复核须使用不同职责');
      }
      d.config=validate(d.config);if(d.config.approval.flow)Flow.validate(d.config.approval.flow,Flow.positions(s));return d;
    }
    function saveScene(original,actorId,draft,expectedRevision,now){
      requireValue(actorId==='manager','只有授权售后主管可以保存场景');
      const s=normalize(copy(original));requireValue((s.sceneRevision||0)===expectedRevision,'场景已被其他窗口更新，请返回列表后重新配置');
      const d=validateScene(s,draft),list=sceneList(s),old=list.find(x=>x.id===d.id);
      requireValue(!d.id||old,'场景已不存在，请返回列表');
      if(!d.id){s.sequence++;d.id='scene-'+s.sequence;}
      d.version=(old?.version||0)+1;d.updatedAt=now;d.updatedBy=actorId;
      if(old)list[list.findIndex(x=>x.id===d.id)]=d;else list.push(d);
      requireValue(list.some(x=>x.enabled),'至少保留一个启用场景');
      s.ruleScenes=list;s.sceneRevision=(s.sceneRevision||0)+1;s.revision++;
      s.sceneHistory=s.sceneHistory||[];s.sceneHistory.unshift({sceneId:d.id,at:now,actorId,before:old||null,after:copy(d)});
      return s;
    }
    function toggleScene(s,actorId,id,expectedRevision,now){const d=sceneList(s).find(x=>x.id===id);requireValue(d,'场景不存在');d.enabled=!d.enabled;return saveScene(s,actorId,d,expectedRevision,now);}
    function resolve(s,data){
      // Existing integrations without scenario selection keep their original global routing.
      if(!data.sceneId&&!s.ruleScenes)return copy(s.rules);
      const list=sceneList(s),scene=data.sceneId?list.find(x=>x.id===data.sceneId):list.find(x=>x.enabled);
      requireValue(scene&&scene.enabled,'所选场景已停用或不存在，请重新选择');
      const r=prepareScene(scene).config;r.scene={id:scene.id,name:scene.name,level:scene.level,version:scene.version};return Flow.bindRouting(r,s,data);
    }
    return {defaults,normalize,validate,changes,save,route,approvalPreview,needsQuality,sections,sceneList,newScene,validateScene,saveScene,toggleScene,resolve,Flow,prepareScene,approvalNodes,taskPolicy};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createRulesModule;
  else root.createCaseRules=createRulesModule;
})(typeof window!=='undefined'?window:globalThis);
