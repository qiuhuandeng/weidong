(function(root){
  'use strict';
  const E=root.CaseEngine,LEGACY_KEY='meiye.complaint.prototype.a.v1',KEY=LEGACY_KEY+'.workflow3';
  function decode(raw){
    const s=JSON.parse(raw);
    if(s.schema!==1||!Array.isArray(s.cases))throw new Error('本地数据格式不支持，请在演示入口检查数据');
    return s;
  }
  function load(){
    const raw=localStorage.getItem(KEY);
    if(raw){let s=decode(raw);const version=s.workflowVersion,revision=s.revision;E.normalize(s);s=E.refresh(s);if(version!==s.workflowVersion||revision!==s.revision)save(s);return s;}
    // Old open tabs may still normalize workflowVersion back to 2. Migrate once
    // into an isolated key; never write the upgraded state back to their key.
    const legacy=localStorage.getItem(LEGACY_KEY);
    const s=legacy?E.refresh(E.normalize(decode(legacy))):E.addRefundSamples(E.demo());
    for(const suffix of ['.drafts','.actor']){
      const value=localStorage.getItem(LEGACY_KEY+suffix);
      if(value!==null&&localStorage.getItem(KEY+suffix)===null){
        localStorage.setItem(KEY+suffix,value);
      }
    }
    save(s);return s;
  }
  function save(s){const raw=JSON.stringify(s);if(raw.length>3500000)throw new Error('附件空间不足，请减少附件后再提交');localStorage.setItem(KEY,raw);}
  async function exclusive(fn){return navigator.locks?navigator.locks.request(KEY,fn):fn();}
  root.CaseStore={KEY,load,save,exclusive};
})(window);
