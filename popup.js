const $ = id => document.getElementById(id);
let record;
function render() {
  $('updated').textContent = record ? '讀取時間：' + new Date(record.capturedAt).toLocaleString('zh-TW') : '尚無資料';
  for (const key of ['five','week']) {
    const row = record?.rows[key];
    $(key+'-value').textContent = row ? `剩餘 ${row.remaining}%` : '—';
    $(key+'-bar').value = row?.remaining ?? 0;
    if (!row) {$(key+'-reset').textContent='請先讀取用量頁';continue;}
    if (!row.resetAt) {$(key+'-reset').textContent='頁面顯示：'+row.resetText;continue;}
    const seconds=Math.ceil((row.resetAt-Date.now())/1000);
    if(seconds<=0){$(key+'-reset').textContent='已到推估重置時間，請重新讀取';continue;}
    const days=Math.floor(seconds/86400),hours=Math.floor(seconds%86400/3600),minutes=Math.floor(seconds%3600/60);
    $(key+'-reset').textContent=`約 ${days ? days+' 天 ' : ''}${hours ? hours+' 小時 ' : ''}${minutes} 分 ${seconds%60} 秒後重置`;
  }
}
$('capture').addEventListener('click',async()=>{
 $('capture').disabled=true;
 try {
  const direct=await chrome.runtime.sendMessage({type:'refreshUsage'});
  if(direct?.ok){record=(await chrome.storage.local.get('usage')).usage;render();$('status').textContent='背景同步成功。';return;}
  $('status').textContent=direct?.error||'背景同步失敗，嘗試頁面讀取。';
  const [tab]=await chrome.tabs.query({active:true,currentWindow:true});
  if(!tab?.url || new URL(tab.url).hostname!=='chatgpt.com') throw new Error(direct?.error||'請先登入 ChatGPT。');
  const results=await chrome.scripting.executeScript({target:{tabId:tab.id},func:()=>{
   const visible=el=>!!(el.getClientRects().length)&&getComputedStyle(el).visibility!=='hidden';
   const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);
   // Never scan conversation text; accept a settings dialog or explicit settings/usage route.
   const candidate=dialogs.find(d=>/5\s*小時|5[- ]hour/i.test(d.innerText)&&/每週|weekly/i.test(d.innerText));
   if(candidate)return candidate.innerText;
   if(/settings|usage/i.test(location.pathname+location.hash))return document.body.innerText;
   return null;
  }});
  const text=results[0]?.result;
  if(!text)throw new Error('找不到用量面板。請開啟「設定 → 用量」並確認兩項額度都已顯示。');
  const parsed=parseUsage(text);
  if(!parsed)throw new Error('無法辨識兩項額度。頁面格式可能不同；未覆蓋上次紀錄。支援繁體中文及英文標籤。');
  record=parsed;await chrome.storage.local.set({usage:record});render();$('status').textContent='已更新本機紀錄。數值只代表這次讀取。';
 }catch(e){$('status').textContent=e.message || '讀取失敗，請重新整理頁面後重試。';}
 finally{$('capture').disabled=false;}
});
$('open').addEventListener('click',()=>chrome.tabs.create({url:'https://chatgpt.com/'}));
$('clear').addEventListener('click',async()=>{await chrome.storage.local.remove('usage');record=null;render();$('status').textContent='已清除本機紀錄。';});
chrome.storage.local.get('usage').then(data=>{record=data.usage;render();}).catch(()=>{$('status').textContent='無法讀取本機紀錄。';});
setInterval(render,1000);

chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.usage){record=changes.usage.newValue;render();}if(area==='local'&&changes.syncStatus){const s=changes.syncStatus.newValue;$('status').textContent=s?.ok?'自動更新已啟用 · 約每 30 秒同步。':s?.error||'';}});
chrome.storage.local.get('syncStatus').then(({syncStatus:s})=>{if(s)$('status').textContent=s.ok?'背景同步成功。':s.error;});

chrome.runtime.sendMessage({type:'refreshUsage',automatic:true}).catch(()=>{});
