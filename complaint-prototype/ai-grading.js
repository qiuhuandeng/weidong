/* Grading configuration and local rule evaluator. No external AI service is called. */
(function(root){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),assert=(v,m)=>{if(!v)throw Error(m);};
const defaults=()=>({version:0,enabled:true,inputs:['title','description'],levels:[
 {level:1,name:'一般反馈',criteria:'一般服务反馈或咨询，经解释、安抚即可处理，没有退款、赔偿或外部投诉诉求。',keywords:'服务态度,等待时间,预约问题',exclusions:'退款,赔偿,外部投诉'},
 {level:2,name:'退款诉求',criteria:'客户提出退款或退费诉求，未涉及额外赔偿或更高等级风险。',keywords:'退款,退费,退钱',exclusions:'无需退款,不要求退款'},
 {level:3,name:'赔偿诉求',criteria:'客户提出赔偿诉求，或同时要求退款与赔偿。',keywords:'赔偿,赔款,退一赔三',exclusions:'无需赔偿,不要求赔偿'},
 {level:4,name:'外部投诉',criteria:'涉及监管投诉、媒体曝光等外部投诉事项，需结合客户陈述和实际情况判断。',keywords:'工商投诉,监管投诉,媒体曝光',exclusions:'未向外部投诉'},
 {level:5,name:'紧急风险',criteria:'出现严重人身伤害、警方或监管到店等紧急风险，需要售后经理直接协调。',keywords:'严重人身伤害,警方到店,监管到店',exclusions:'没有人员受伤,警方未到店'}
]});
function get(state){const config=copy(state.aiGrading||defaults());config.inputs=[...new Set(config.inputs.map(key=>key==='request'?'description':key))];
 if(state.ruleSetupVersion){config.enabled=true;config.inputs=['title','description'];config.version=state.sceneRevision||0;config.levels=[1,2,3,4,5].flatMap(level=>{const rows=(state.ruleScenes||[]).filter(s=>Number(s.level)===level),scene=rows.find(s=>s.enabled)||rows[0];return scene?.grading?[{level,name:scene.name,...copy(scene.grading)}]:[];});}
 return config;}
function classify(state,data){
 const config=get(state),split=value=>String(value||'').split(/[、,，;；\n]/).map(x=>x.trim()).filter(Boolean);
 const clauses=config.inputs.flatMap(key=>String(data[key]||'').split(/[。！!？?；;\n，,]/)).map(x=>x.trim()).filter(Boolean),matches=[];
 const base={method:'configured-keywords',configVersion:config.version,at:Date.now()};
 if(!config.enabled)return {...base,status:'review',level:null,matches,reason:'自动定级未启用，待售后经理确认等级'};
 let uncertain=false;
 for(const row of config.levels){const words=split(row.keywords),excluded=split(row.exclusions),hits=[];
  for(const clause of clauses){
   if(excluded.some(word=>clause.includes(word)))continue;
   for(const word of words){let start=0,index;while((index=clause.indexOf(word,start))>=0){
    const before=clause.slice(0,index),after=clause.slice(index+word.length);start=index+word.length;
    if(/(?:不(?:再)?(?:想|要|需要|要求|申请|涉及)?|无需|没有(?:发生|出现|要求)?|尚未|并未|未(?:发生|出现|向)?)\s*$/.test(before)||/^(?:已)?(?:不需要|不要求|无需)/.test(after))continue;
    if(row.level>=4&&/如果|否则|准备|打算|扬言|将要|就要/.test(clause)){uncertain=true;continue;}
    hits.push(word);
   }}
  }
  if(hits.length)matches.push({level:row.level,name:row.name,keywords:[...new Set(hits)],criteria:row.criteria});
 }
 matches.sort((a,b)=>b.level-a.level);const best=matches[0];
 if(!best||uncertain)return {...base,status:'review',level:null,matches,reason:uncertain?'投诉中包含尚未发生的风险描述，待售后经理结合实际情况确认等级':'现有定级标准未明确命中，待售后经理确认等级'};
 return {...base,status:'resolved',level:best.level,matches,reason:'匹配“'+best.name+'”，依据：'+best.keywords.join('、')+(matches.length>1?'；同时符合多项标准，取较高等级':'')};
}
function validate(config){
 const d=copy(config);assert(typeof d.enabled==='boolean','请选择是否启用 AI 定级');
 assert(Array.isArray(d.inputs)&&d.inputs.length&&new Set(d.inputs).size===d.inputs.length&&d.inputs.every(x=>['title','description','request'].includes(x)),'请至少选择一项识别内容');
 assert(Array.isArray(d.levels)&&d.levels.length===5&&new Set(d.levels.map(x=>x.level)).size===5,'请完整配置一级至五级客诉');
 for(const row of d.levels){assert([1,2,3,4,5].includes(row.level),'客诉等级无效');row.name=String(row.name||'').trim();row.criteria=String(row.criteria||'').trim();row.keywords=String(row.keywords||'').trim();row.exclusions=String(row.exclusions||'').trim();assert(row.name&&row.name.length<=20,'等级名称须为 1 至 20 字');assert(row.criteria&&row.criteria.length<=1000,'请填写定级条件，最多 1000 字');assert(row.keywords.length<=500&&row.exclusions.length<=500,'识别关键词及排除条件各最多 500 字');}
 d.levels.sort((a,b)=>a.level-b.level);return d;
}
function save(state,actor,draft,version,now=Date.now()){
 assert(actor==='manager','暂无 AI 定级配置权限');assert(get(state).version===version,'AI 定级配置已被其他页面更新，请重新载入后再编辑');
 const d=validate(draft),next=copy(state);d.version=version+1;d.updatedAt=now;d.updatedBy=actor;next.aiGrading=d;return next;
}
const api={get,classify,validate,save};if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.AIGrading=api;
})(typeof window!=='undefined'?window:globalThis);
