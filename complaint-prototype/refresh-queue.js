/* Coalesce background changes and wait until the current interaction is over. */
(function(root){
'use strict';
function create({blocked,refresh,onError=()=>{},schedule=fn=>setTimeout(fn,0)}){
 let pending=false,scheduled=false;
 function flush(){
  if(!pending||scheduled)return;
  scheduled=true;
  schedule(()=>{
   scheduled=false;
   if(!pending||blocked())return;
   pending=false;
   try{refresh();}catch(error){onError(error);}
  });
 }
 return {request(){pending=true;flush();},flush};
}
if(typeof module!=='undefined'&&module.exports)module.exports={create};
else root.ComplaintRefreshQueue={create};
})(typeof window!=='undefined'?window:globalThis);
