(function(root){
  'use strict';
  function createRefundModule(STAFF,STORES,HOUR,Rules){
    const assert=(ok,msg)=>{if(!ok)throw new Error(msg);};
    const STATUS={approval:'待审批',awaiting_customer:'待记录客户意见',ready:'待退款',processing:'退款处理中',unknown:'结果待核实',failed:'退款失败',succeeded:'退款成功',returned:'待修订',rejected:'审批驳回',superseded:'方案已失效'};
    function cents(value){const str=String(value??'').trim();assert(/^\d+(\.\d{1,2})?$/.test(str),'退款金额须为正数，最多保留两位小数');const [whole,part='']=str.split('.');const n=Number(whole)*100+Number(part.padEnd(2,'0'));assert(Number.isSafeInteger(n)&&n>0&&n<=100000000,'退款金额须大于0且不超过100万元');return n;}
    const money=n=>'¥'+(Number(n||0)/100).toFixed(2);
    function normalize(s){
      if(!s.orders)s.orders=[
        {id:'order-r1',number:'DEMO-R-1001',customerId:'customer1',store:STORES[0],title:'面部护理服务套餐',paidCents:200000,priorRefundCents:20000,method:'微信支付'},
        {id:'order-r2',number:'DEMO-R-1002',customerId:'customer2',store:STORES[0],title:'美肤护理服务',paidCents:80000,priorRefundCents:0,method:'支付宝'},
        {id:'order-r3',number:'DEMO-R-2001',customerId:'customer1',store:STORES[1],title:'预约护理服务',paidCents:120000,priorRefundCents:0,method:'微信支付'},
        {id:'order-r4',number:'DEMO-R-2002',customerId:'customer2',store:STORES[1],title:'护理服务套餐',paidCents:300000,priorRefundCents:50000,method:'银行卡'}
      ];
      if(!s.refundLedger)s.refundLedger=[];
      return s;
    }
    function balance(s,orderId,exclude){
      const order=s.orders.find(o=>o.id===orderId);assert(order,'请选择有效的关联订单');
      const refunded=order.priorRefundCents+s.refundLedger.filter(x=>x.orderId===orderId&&x.status==='success').reduce((sum,x)=>sum+x.amountCents,0);
      const reserved=s.cases.reduce((sum,c)=>sum+c.plans.filter(p=>p.refund?.orderId===orderId&&p.refund.reservation==='held'&&!(exclude&&exclude.caseId===c.id&&exclude.version===p.version)).reduce((total,p)=>total+p.refund.amountCents,0),0);
      return {order,paid:order.paidCents,refunded,reserved,available:order.paidCents-refunded-reserved};
    }
    function eligibleOrders(s,c){return s.orders.filter(o=>o.customerId===c.customerId&&o.store===c.store);}
    function current(ctx){const p=ctx.c.plans.at(-1);assert(p?.type==='refund'&&p.refund,'当前方案不是退款方案');assert(!p.invalidatedAt,'该方案已失效，请查看最新版本');return p;}
    function cancel(ctx,p,status,reason){
      p.invalidatedAt=ctx.now;p.invalidatedReason=reason;p.refund.reservation='released';p.refund.status=status;
      if(p.confirmation)p.confirmation.invalidatedAt=ctx.now;
      ctx.c.tasks.filter(t=>t.status==='pending'&&t.version===p.version).forEach(t=>ctx.finish(t,ctx.now,'cancelled'));
    }
    function confirmationTask(ctx,p){
      const {s,c,now,rules}=ctx;p.customerReleasedAt=now;p.refund.status='awaiting_customer';c.stage='confirm';
      ctx.task(s,c,'confirm',c.ownerId,Math.min(now+rules.timing.confirmHours*HOUR,p.deadline,c.targetAt),now,{version:p.version});
      ctx.log(s,c,ctx.actorId,'退款方案审核通过',p.summary+'；拟退款 '+money(p.refund.amountCents)+'，由负责人联系客户并记录本版方案的沟通结果。',now,true);
    }
    function submit(ctx){
      const {s,c,d,now,rules,actorId}=ctx;ctx.ownTask('plan');
      const summary=ctx.text(d.summary,'处理方案'),reason=ctx.text(d.refundReason,'退款原因');
      const selected=s.orders.find(o=>o.id===d.orderId);
      assert(selected&&selected.customerId===c.customerId&&selected.store===c.store,'退款订单必须属于该客户与所属门店');
      const amount=cents(d.refundAmount),available=balance(s,selected.id).available;
      assert(amount<=available,'退款金额超过当前可申请退款金额 '+money(available));
      const deadline=Number(d.deadline);assert(Number.isFinite(deadline)&&deadline>now,'请选择未来的预计退款办理时间');
      assert(!c.plans.some(p=>p.refund?.reservation==='held'),'该工单已有未完成退款，请先处理或撤回原方案');
      const flowPlan=rules.approval.flow?Rules.Flow.plan(rules,s,{store:c.store,customerId:c.customerId,applicantId:actorId,now},{type:'refund',refund:amount/100,compensation:0}):null;
      const chain=flowPlan?[...new Set(flowPlan.steps.filter(x=>x.type==='approval').flatMap(x=>x.members))]:Rules.approvalPreview(rules,'refund',amount/100).map(id=>id===actorId?rules.approval.delegateId:id);
      assert(chain.every(id=>STAFF.some(p=>p.id===id)&&id!==actorId),'审批人员与方案提交人重复，请配置独立审批人');
      assert(new Set(chain).size===chain.length,'审批路径存在重复人员，请检查配置');
      const p={version:c.plans.length+1,type:'refund',summary,deadline,items:[],createdAt:now,createdBy:actorId,confirmation:null,approvals:chain.map((id,i)=>({assigneeId:id,status:i===0?'pending':'waiting'})),refund:{orderId:selected.id,orderNumber:selected.number,amountCents:amount,reason,method:'原路退回',channel:selected.method,reservation:'held',status:'approval',activeAttemptId:null}};
      if(flowPlan){const finance=Rules.Flow.resolveSource(Rules.Flow.organization(s),{source:'duty',duty:'财务审核'},{store:c.store,applicantId:actorId}).flat();assert(finance.length===1,'财务执行职责须有唯一有效办理人');p.refund.executionAssigneeId=finance[0];p.flowPlan=flowPlan;p.approvals=flowPlan.steps.flatMap((step,groupIndex)=>step.type==='cc'?[]:step.members.map(assigneeId=>({assigneeId,status:'waiting',groupIndex,nodeTitle:step.title,source:step.source})));}
      c.orderId=selected.id;c.order=selected.number;c.plans.push(p);ctx.finish(ctx.t,now);c.stage='approval';
      if(flowPlan)advanceFlow(ctx,p);else ctx.task(s,c,'refundApproval',chain[0],now+(rules.timing.approvalHours??24)*HOUR,now,{version:p.version,stepIndex:0});
      ctx.log(s,c,actorId,'退款方案提交审批','V'+p.version+' · '+money(amount)+' · '+selected.number+' · '+reason,now);
    }
    const approvalsComplete=p=>p.approvals.every(a=>['approved','skipped'].includes(a.status));
    function advanceFlow(ctx,p){
      const {s,c,rules,now}=ctx;
      for(let groupIndex=0;groupIndex<p.flowPlan.steps.length;groupIndex++){
        const group=p.flowPlan.steps[groupIndex];
        if(group.type==='cc'){
          if(!group.sentAt){group.sentAt=now;for(const id of group.members){if(!c.participants.includes(id))c.participants.push(id);ctx.notify(s,c,id,'审批抄送 · '+group.title,c.number+' · '+money(p.refund.amountCents),now,'','approvalCC');}ctx.log(s,c,ctx.actorId,'审批流程抄送',group.title+' · '+group.members.map(id=>STAFF.find(p=>p.id===id)?.name||id).join('、'),now);}continue;
        }
        const entries=p.approvals.filter(a=>a.groupIndex===groupIndex);
        if(entries.every(a=>['approved','skipped'].includes(a.status)))continue;
        if(rules.handling?.repeat==='consecutive'){
          const previous=p.flowPlan.steps.slice(0,groupIndex).map((g,i)=>({g,i})).filter(x=>x.g.type==='approval').at(-1);
          if(previous)entries.filter(a=>a.status==='waiting').forEach(a=>{const prior=p.approvals.find(x=>x.groupIndex===previous.i&&x.assigneeId===a.assigneeId&&x.status==='approved');if(prior){a.status='approved';a.at=now;a.note='沿用连续前一节点的同意结果';a.reused=true;ctx.log(s,c,a.assigneeId,'沿用连续审批结果',group.title+'：同一版本方案已同意，无需重复办理。',now);}});
          if(group.mode==='any'&&entries.some(a=>a.status==='approved'))entries.filter(a=>a.status==='waiting').forEach(a=>{a.status='skipped';a.note='同组已有沿用的同意结果';a.at=now;});
          if(entries.every(a=>['approved','skipped'].includes(a.status)))continue;
        }
        entries.filter(a=>a.status==='waiting').forEach(a=>{a.status='pending';ctx.task(s,c,'refundApproval',a.assigneeId,now+(rules.timing.approvalHours??24)*HOUR,now,{version:p.version,stepIndex:p.approvals.indexOf(a),groupIndex,nodeId:group.nodeId});});refresh(ctx);return;
      }
      confirmationTask(ctx,p);
    }
    function agree(ctx,p){
      assert(approvalsComplete(p),'当前退款方案尚未全部审批通过');assert(p.refund.reservation==='held','退款额度未保留，请重新制定方案');
      const {s,c,rules,now}=ctx;p.refund.status='ready';c.stage='refund';
      ctx.task(s,c,'refundExecute',p.refund.executionAssigneeId||rules.approval.financeId,Math.min(p.deadline,now+(rules.timing.refundHours??24)*HOUR),now,{version:p.version});
    }
    function rejectCustomer(ctx,p){cancel(ctx,p,'returned','客户不同意，需修订方案');}
    function review(ctx){
      const {s,c,d,t,actorId,now,rules}=ctx;ctx.ownTask('refundApproval');const p=current(ctx);
      assert(t.version===p.version&&c.stage==='approval','方案审批版本已变化');assert(actorId!==p.createdBy,'方案提交人不能审批自己的退款方案');
      if(rules.handling)assert(Rules.Flow.organization(s).appointments.some(a=>a.personId===actorId&&a.active),'审批任职已失效，请刷新并交管理员处理');
      const step=p.approvals[t.stepIndex];assert(step?.status==='pending'&&step.assigneeId===actorId,'当前审批节点已处理');
      assert(['approve','reject'].includes(d.decision),'请选择审批结论');const note=ctx.text(d.content,'审批意见');
      step.status=d.decision==='approve'?'approved':'rejected';step.note=note;step.at=now;ctx.finish(t,now);
      ctx.log(s,c,actorId,'退款审批'+(d.decision==='approve'?'通过':'驳回'),'V'+p.version+' · '+money(p.refund.amountCents)+' · '+note,now);
      if(d.decision==='reject'){cancel(ctx,p,'rejected','审批驳回：'+note);ctx.nextPlan();return;}
      if(p.flowPlan){
        const group=p.flowPlan.steps[step.groupIndex];
        if(group.mode==='any')p.approvals.forEach((other,i)=>{if(other!==step&&other.groupIndex===step.groupIndex&&['pending','paused'].includes(other.status)){other.status='skipped';other.note='同组已有审批人同意';other.at=now;c.tasks.filter(x=>['refundApproval','approvalException'].includes(x.kind)&&x.version===p.version&&x.stepIndex===i&&x.status==='pending').forEach(x=>ctx.finish(x,now,'cancelled'));}});
        advanceFlow(ctx,p);return;
      }
      const next=p.approvals[t.stepIndex+1];
      if(next){next.status='pending';ctx.task(s,c,'refundApproval',next.assigneeId,now+(rules.timing.approvalHours??24)*HOUR,now,{version:p.version,stepIndex:t.stepIndex+1});}
      else confirmationTask(ctx,p);
    }
    function revise(ctx){
      const {c,d,s,actorId,now}=ctx;assert(c.ownerId===actorId,'只有总负责人可以修改退款方案');const p=current(ctx);
      assert(['approval','awaiting_customer','ready','failed'].includes(p.refund.status),'退款已提交或成功，不能修改金额；结果待核实时请先核查');
      const reason=ctx.text(d.content,'修改原因');cancel(ctx,p,'superseded',reason);ctx.nextPlan();
      ctx.log(s,c,actorId,'退款方案撤回修订','V'+p.version+' 已失效：'+reason,now);
      if(p.customerReleasedAt)ctx.log(s,c,actorId,'退款方案正在调整','原方案已失效，新方案审核后将重新请您确认。',now,true);
    }
    function start(ctx){
      const {s,c,t,now,rules,actorId}=ctx;ctx.ownTask('refundExecute');const p=current(ctx),r=p.refund;
      assert(t.version===p.version&&r.status==='ready','该退款已提交，请查看当前处理或核查任务');
      assert(p.confirmation?.agreed&&!p.confirmation.invalidatedAt&&approvalsComplete(p),'退款方案须经审批并由客户确认');
      assert(r.amountCents<=balance(s,r.orderId,{caseId:c.id,version:p.version}).available,'订单可退余额已变化，请核实后修订方案');
      assert(!s.refundLedger.some(x=>x.caseId===c.id&&x.planVersion===p.version&&['processing','unknown','success'].includes(x.status)),'同一退款已有处理中、待核实或成功记录，不能重复执行');
      const entry={id:ctx.identity(s,'refund'),caseId:c.id,planVersion:p.version,orderId:r.orderId,amountCents:r.amountCents,status:'processing',createdAt:now,actorId,events:[]};
      s.refundLedger.push(entry);r.activeAttemptId=entry.id;r.status='processing';c.stage='refund_check';ctx.finish(t,now);
      ctx.task(s,c,'refundResult',p.refund.executionAssigneeId||rules.approval.financeId,Math.min(p.deadline,now+(rules.timing.refundHours??24)*HOUR),now,{version:p.version,attemptId:entry.id});
      ctx.log(s,c,actorId,'退款模拟已提交',entry.id+' · '+money(r.amountCents)+'；等待登记退款结果。',now);
      ctx.log(s,c,actorId,'退款办理中','已安排 '+money(r.amountCents)+' 原路退款，正在确认办理结果。',now,true);
    }
    function result(ctx,verify){
      const {s,c,d,t,actorId,now,rules}=ctx;ctx.ownTask(verify?'refundVerify':'refundResult');const p=current(ctx),r=p.refund;
      const entry=s.refundLedger.find(x=>x.id===t.attemptId);
      assert(entry&&entry.id===r.activeAttemptId&&t.version===p.version,'退款记录或方案版本不一致，请查看最新状态');
      assert(entry.status===(verify?'unknown':'processing'),'该退款结果已经处理，不能重复登记');
      assert(['success','failed','unknown'].includes(d.result),'请选择退款结果');
      const evidence=ctx.text(d.content,verify?'核查依据':'结果依据'),files=ctx.attachments(d);
      const at=Number(d.occurredAt);assert(Number.isFinite(at)&&at>=entry.createdAt-60000&&at<=now+60000,'结果时间须在退款发起后，且不能晚于当前时间');
      let reference=String(d.reference||'').trim();
      if(d.result==='success'){
        reference=ctx.text(reference,'退款凭证编号',80);
        assert(!s.refundLedger.some(x=>x.id!==entry.id&&x.reference===reference&&x.status==='success'),'该成功凭证已用于其他退款，请核对，不能重复入账');
      }
      entry.events.push({result:d.result,evidence,reference,attachments:files,at:now,occurredAt:at,actorId,verify});entry.updatedAt=now;entry.status=d.result;entry.reference=reference;
      ctx.log(s,c,actorId,verify?'退款结果核查':'登记退款结果',entry.id+' · '+({success:'成功',failed:'失败',unknown:'待核实'})[d.result]+' · '+evidence,now,false,files);
      if(d.result==='unknown'){
        r.status='unknown';c.stage='refund_check';
        if(!verify){ctx.finish(t,now);ctx.task(s,c,'refundVerify',p.refund.executionAssigneeId||rules.approval.financeId,now+(rules.timing.refundHours??24)*HOUR,now,{version:p.version,attemptId:entry.id});}
        return;
      }
      ctx.finish(t,now);
      if(d.result==='failed'){
        r.status='failed';c.stage='refund';ctx.task(s,c,'refundRetry',p.refund.executionAssigneeId||rules.approval.financeId,now+(rules.timing.refundHours??24)*HOUR,now,{version:p.version,attemptId:entry.id});
        ctx.notify(s,c,c.ownerId,'退款失败，请跟进处理',c.title,now);return;
      }
      r.status='succeeded';r.reservation='spent';r.completedAt=now;c.stage='visit';
      ctx.task(s,c,'visit',rules.closure.callbackId,now+rules.timing.visitHours*HOUR,now);
      ctx.log(s,c,actorId,'退款已完成',money(r.amountCents)+' 已按方案原路退回，接下来将由专人回访确认。',now,true);
    }
    function retry(ctx){
      const {s,c,d,t,actorId,now,rules}=ctx;ctx.ownTask('refundRetry');const p=current(ctx),r=p.refund;
      assert(t.version===p.version&&r.status==='failed','只有已确认失败的退款可以安排重试');
      assert(['retry','revise'].includes(d.decision),'请选择失败处理方式');const note=ctx.text(d.content,'失败处理说明');ctx.finish(t,now);
      if(d.decision==='revise'){cancel(ctx,p,'returned',note);ctx.nextPlan();ctx.log(s,c,actorId,'退款退回修订',note,now);return;}
      r.status='ready';c.stage='refund';ctx.task(s,c,'refundExecute',p.refund.executionAssigneeId||rules.approval.financeId,Math.min(p.deadline,now+(rules.timing.refundHours??24)*HOUR),now,{version:p.version});
      ctx.log(s,c,actorId,'确认失败后安排重试',note+'；原失败记录保留，重试将生成新退款记录。',now);
    }
    function replacement(ctx,p,entry,manual=false){
      const F=Rules.Flow,org=F.organization(ctx.s),h=ctx.rules.handling,group=p.flowPlan.steps[entry.groupIndex],context={store:ctx.c.store,receptionistId:ctx.s.customers.find(c=>c.id===ctx.c.customerId)?.receptionistId,applicantId:p.createdBy,now:ctx.now};
      const delegated=F.delegated(org,entry.assigneeId,ctx.now);
      if(delegated!==entry.assigneeId&&delegated!==p.createdBy)return delegated;
      let ids;
      if(h.departed.mode==='replace')ids=F.resolveSource(org,{source:'duty',duty:h.departed.duty},context).flat();
      else if(manual)ids=F.resolveApprovers(ctx.rules,org,group.sourceNode,context).flat();
      else throw Error('原审批人任职失效，需要管理员交接');
      const occupied=p.approvals.filter(a=>a!==entry&&a.groupIndex===entry.groupIndex&&!['rejected','skipped'].includes(a.status)).map(a=>a.assigneeId);
      const id=ids.find(id=>id!==p.createdBy&&!occupied.includes(id));assert(id,'接替职责没有独立且有效的审批人，请维护组织任职');return id;
    }
    function refresh(ctx){
      const {s,c,rules,now}=ctx;if(!rules.handling)return;
      const p=c.plans.at(-1);if(!p?.flowPlan||p.invalidatedAt||c.stage!=='approval')return;
      const org=Rules.Flow.organization(s);
      c.tasks.filter(t=>t.status==='pending'&&t.kind==='refundApproval'&&t.version===p.version).forEach(t=>{
        const entry=p.approvals[t.stepIndex],active=org.appointments.some(a=>a.personId===t.assigneeId&&a.active),delegate=Rules.Flow.delegated(org,t.assigneeId,now);
        if(active&&delegate===t.assigneeId)return;
        let id,reason;try{id=replacement(ctx,p,entry);}catch(error){reason=error.message;}
        ctx.finish(t,now,'transferred');entry.previousAssigneeId=t.assigneeId;
        if(id){entry.assigneeId=id;ctx.task(s,c,'refundApproval',id,now+rules.timing.approvalHours*HOUR,now,{version:p.version,stepIndex:t.stepIndex,groupIndex:t.groupIndex,nodeId:t.nodeId});ctx.log(s,c,'system','审批人员自动接替',t.assigneeId+' → '+id+'；原办理记录保留。',now);}
        else{entry.status='paused';const admin=[rules.routing.fallbackId,'director','intake'].find(id=>org.appointments.some(a=>a.personId===id&&a.active));assert(admin,'没有有效的异常处理管理员，请先维护组织任职');ctx.task(s,c,'approvalException',admin,now+rules.timing.assignMinutes*60000,now,{version:p.version,stepIndex:t.stepIndex,groupIndex:t.groupIndex,nodeId:t.nodeId,reason});ctx.log(s,c,'system','审批人员异常',entry.nodeTitle+'：'+reason,now);}
      });
    }
    function resume(ctx){
      ctx.ownTask('approvalException');const p=current(ctx),entry=p.approvals[ctx.t.stepIndex];assert(entry?.status==='paused','异常任务已处理');
      const id=replacement(ctx,p,entry,true);ctx.finish(ctx.t,ctx.now);entry.assigneeId=id;entry.status='pending';
      ctx.task(ctx.s,ctx.c,'refundApproval',id,ctx.now+ctx.rules.timing.approvalHours*HOUR,ctx.now,{version:p.version,stepIndex:ctx.t.stepIndex,groupIndex:ctx.t.groupIndex,nodeId:ctx.t.nodeId});
      ctx.log(ctx.s,ctx.c,ctx.actorId,'恢复审批',entry.nodeTitle+'：按有效组织任职交给'+id,ctx.now);
    }
    function handle(ctx){switch(ctx.command.type){case 'approvalException':resume(ctx);break;case 'refundApproval':review(ctx);break;case 'reviseRefund':revise(ctx);break;case 'refundStart':start(ctx);break;case 'refundResult':result(ctx,false);break;case 'refundVerify':result(ctx,true);break;case 'refundRetry':retry(ctx);break;default:return false;}return true;}
    return {STATUS,cents,money,normalize,balance,eligibleOrders,submit,agree,rejectCustomer,handle,refresh};
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=createRefundModule;else root.createRefundModule=createRefundModule;
})(typeof window!=='undefined'?window:globalThis);
