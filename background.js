importScripts('api-parser.js');
const ALARM='chatgpt-usage-background';
let inFlight=null;
let authToken=null,authValidUntil=0;
async function loadSessionToken(){
 const response=await fetch('https://chatgpt.com/api/auth/session',{credentials:'include',cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw new Error('無法讀取登入工作階段（HTTP '+response.status+'），請先登入 ChatGPT。');
 let session;
 try{session=await response.json();}catch{throw new Error('登入工作階段未回傳預期格式，請先在 ChatGPT 完成登入。');}
 if(typeof session?.accessToken!=='string'||!session.accessToken)throw new Error('目前工作階段未提供可用憑證，請重新登入 ChatGPT 後按更新。');
 authToken=session.accessToken;
 const expires=Date.parse(session.expires);
 authValidUntil=Math.min(Date.now()+300000,Number.isFinite(expires)?expires-60000:Date.now()+300000);
}
function requestUsage(){
 const headers={Accept:'application/json'};
 if(authToken&&authValidUntil>Date.now())headers.Authorization='Bearer '+authToken;
 return fetch('https://chatgpt.com/backend-api/wham/usage',{method:'GET',credentials:'include',headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
}
async function ensureAlarm(){
 const existing=await chrome.alarms.get(ALARM);
 if(!existing||existing.periodInMinutes!==0.5)await chrome.alarms.create(ALARM,{periodInMinutes:0.5});
}
async function syncUsage(manual=false){
 if(inFlight)return inFlight;
 inFlight=(async()=>{
  const {syncStatus}=await chrome.storage.local.get('syncStatus');
  if(!manual&&syncStatus?.ok&&Date.now()-syncStatus.checkedAt<25000)return {ok:true,cached:true};
  if(!manual&&syncStatus?.retryAt>Date.now())return {ok:false,error:syncStatus.error};
  try{
   let response=await requestUsage();
   if(response.status===401){
    authToken=null;authValidUntil=0;
    await loadSessionToken();
    response=await requestUsage();
   }
   if(!response.ok){
    if(response.status===401||response.status===403){authToken=null;authValidUntil=0;throw new Error('登入驗證失敗（'+response.status+'）。請重新登入 ChatGPT 後按更新；若仍失敗，此介面可能需要額外驗證。');}
    if(response.status===429)throw new Error('請求過於頻繁（429），將稍後重試。');
    throw new Error('用量請求失敗（HTTP '+response.status+'）。');
   }
   const parsed=parseUsageResponse(await response.json());
   if(!parsed)throw new Error('用量回傳格式與預期不同，未覆蓋舊紀錄。');
   await chrome.storage.local.set({usage:parsed,syncStatus:{ok:true,checkedAt:Date.now()}});
   return {ok:true};
  }catch(e){
   const raw=e.name==='TimeoutError'?'請求逾時，保留上次紀錄。':e.message||'無法連線，保留上次紀錄。';
   const error=authToken?raw.split(authToken).join('[已遮蔽]'):raw;
   await chrome.storage.local.set({syncStatus:{ok:false,error,checkedAt:Date.now(),retryAt:Date.now()+300000}});
   return {ok:false,error};
  }
 })();
 try{return await inFlight;}finally{inFlight=null;}
}
chrome.runtime.onInstalled.addListener(()=>{ensureAlarm().then(()=>syncUsage()).catch(()=>{});});
chrome.runtime.onStartup.addListener(()=>{ensureAlarm().then(()=>syncUsage()).catch(()=>{});});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name===ALARM)syncUsage().catch(()=>{});});
chrome.runtime.onMessage.addListener((message,sender,reply)=>{
 if(message?.type!=='refreshUsage')return;
 syncUsage(message.automatic!==true).then(reply).catch(()=>reply({ok:false,error:'背景更新失敗。'}));return true;
});
ensureAlarm().then(()=>syncUsage()).catch(()=>{});
