/* Customer business code split by dependency; shared records and existing handlers stay compatible. */
'use strict';
async function pcOpenCustomerLoaded(id,tab='orders'){const request=++pcArchiveRequest,origin=location.hash,task=mrTask;try{await PCApp.loadModule('customer-archive')}catch(error){toast('客户详情加载失败：'+error.message);return}if(request!==pcArchiveRequest||location.hash!==origin||mrTask!==task)return;let c=pcCustomers().find(c=>c.id===id);if(!c)return toast('未找到该客户档案');if(mrTask&&mrTask.kind!=='customer'||cxWorkbenchId||cxApplicationOpen||document.querySelector('#modal>[data-overlay-layer]:not(.is-closing)')){pcModalCustomer={id,tab:tab==='orders'?'overview':tab};pcCustomerModal();return}pcModalCustomer=null;if(!mrTask)mrFocus=document.activeElement;mrTask={kind:'customer',id,tab,dirty:false};render();$('#mergeRecordPanel .icon-btn')?.focus()}

window.PCModules["customer-detail"]=PCModules['customer-engine'].page({},{pcOpenCustomer:pcOpenCustomerLoaded});
