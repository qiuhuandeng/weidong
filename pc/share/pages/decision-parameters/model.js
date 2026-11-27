/* Independent decision settings; no changes to other business stores. */
window.PCDecisionModel = (() => {
  const definitions = [
    {key:'disableWechat', group:'加微', label:'停用微信日限额', period:'day', value:5, enabled:true},
    {key:'replaceConsultant', group:'加微', label:'微信更换在职咨询日限额', period:'day', value:2, enabled:true},
    {key:'newCustomerWechat', group:'加微', label:'新增新客加微记录限额', period:'day', selectablePeriod:true, value:null, enabled:false},
    {key:'existingCustomerWechat', group:'加微', label:'新增老客加微记录限额', period:'day', selectablePeriod:true, value:null, enabled:false},
    {key:'skipPhoneCheck', group:'手机号管理', label:'跳过空手机号验证月限额', period:'month', value:3, enabled:true},
    {key:'phoneCheckValidity', group:'手机号管理', label:'跳过空手机号验证有效期', unit:'天', value:12},
    {key:'changePhone', group:'手机号管理', label:'修改手机号限额', period:'day', selectablePeriod:true, value:null, enabled:false}
  ];
  const copy = value => JSON.parse(JSON.stringify(value));
  const defaults = () => ({schema:1, revision:0, parameters:Object.fromEntries(definitions.map(item => [item.key,
    item.period ? {enabled:item.enabled, value:item.value, ...(item.selectablePeriod ? {period:item.period} : {})} : {value:item.value}]))});
  function validateParameter(key, parameter) {
    const item = definitions.find(item => item.key === key);
    if (!item || !parameter || typeof parameter !== 'object' || Array.isArray(parameter)) throw Error('决策参数格式无效');
    // Existing settings predate the period selector and retain their daily limit.
    parameter = {...parameter};
    if (item.selectablePeriod) {
      if (parameter.period === undefined) parameter.period = item.period;
      if (!['day', 'month'].includes(parameter.period)) throw Error(item.label+'的周期须选择按日或按月');
    }
    const value = parameter.value;
    if (item.period) {
      if (typeof parameter.enabled !== 'boolean') throw Error(item.label+'的启用状态无效');
      if (value === null && !parameter.enabled) return copy(parameter);
      if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100 || Math.abs(value*100-Math.round(value*100)) > 1e-8)
        throw Error(item.label+'的百分比须为 0–100，最多两位小数');
    } else if (!Number.isSafeInteger(value) || value < 1) throw Error(item.label+'须为正整数天数');
    return copy(parameter);
  }
  function validate(data) {
    if (data?.schema !== 1 || !Number.isSafeInteger(data.revision) || data.revision < 0 || !data.parameters || typeof data.parameters !== 'object' || Array.isArray(data.parameters))
      throw Error('决策参数数据格式不兼容，原数据已保留');
    const next = copy(data);
    definitions.forEach(item => { next.parameters[item.key] = validateParameter(item.key, data.parameters[item.key]); });
    return next;
  }
  function limit(data, key, activeMembers) {
    const item = definitions.find(item => item.key === key);
    if (!item?.period) throw Error('该参数不是额度配置');
    const parameter = validateParameter(key, data.parameters[key]);
    if (!parameter.enabled) return null;
    if (!Number.isSafeInteger(activeMembers) || activeMembers < 0) throw Error('管理在职成员数须为非负整数');
    const product = activeMembers * Math.round(parameter.value * 100);
    if (!Number.isSafeInteger(product)) throw Error('管理在职成员数超出可计算范围');
    return Math.round(product / 10000);
  }
  return {definitions, copy, defaults, validate, validateParameter, limit};
})();
