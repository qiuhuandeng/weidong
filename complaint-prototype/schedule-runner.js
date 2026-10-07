/* Local dispatch scheduler. Each pass reloads and locks the shared record. */
(function(){
'use strict';
let running=false;
async function run(now=Date.now()){
 if(running)return 0;running=true;
 try{return await ComplaintStore.exclusive(()=>{const revision=JSON.parse(localStorage.getItem(ComplaintStore.KEY)||'{}')._revision,s=ComplaintStore.load();const count=s.configuration.aftercareSchedule?Engine.dispatchPending(s,now):0;if(count)ComplaintStore.save(s);if(count||s._revision!==revision)window.dispatchEvent(new CustomEvent('complaint-dispatch',{detail:{count,maintenance:true}}));return count;});}
 catch(error){window.dispatchEvent(new CustomEvent('complaint-dispatch-error',{detail:error.message}));return 0;}finally{running=false;}
}
// Other tabs already notify the views via storage events. Dispatch on the
// clock/configuration triggers, not in response to another tab's write.
window.AftercareDispatch={run};setInterval(()=>run(),15000);window.addEventListener('focus',()=>run());document.addEventListener('visibilitychange',()=>{if(!document.hidden)run();});window.addEventListener('complaint-schedule-updated',()=>run());run();
})();
