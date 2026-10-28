(() => {
  const ID='chatgpt-usage-helper-sidebar';
  let record=null,host=null,root=null,timer=null;
  const visible=el=>el.getClientRects().length>0 && getComputedStyle(el).visibility!=='hidden' && !el.closest('[hidden],[aria-hidden="true"],[inert]');
  function findSidebar(){
    const eligible=e=>!e.closest('[role="dialog"],dialog') && visible(e) && e.getBoundingClientRect().width>=180 && e.getBoundingClientRect().width<=420;
    const explicit=['#stage-slideover-sidebar','#sidebar','[data-testid="sidebar"]','aside'];
    for(const selector of explicit){const el=[...document.querySelectorAll(selector)].find(e=>eligible(e));if(el)return el;}
    return [...document.querySelectorAll('nav')].find(e=>{const r=e.getBoundingClientRect();return eligible(e)&&r.left<50&&r.width>=180&&r.width<=420&&r.height>250&&/新對話|新聊天|New chat|最近項目|Recent/i.test(e.innerText);});
  }
  function draw(){
    if(!root)return;
    const get=id=>root.getElementById(id);
    for(const key of ['five','week']){
      const row=record?.rows?.[key];get(key).textContent=row?`剩餘 ${row.remaining}%`:'尚無紀錄';get(key+'-bar').value=row?.remaining??0;
      let reset='請先開啟設定 → 用量';
      if(row){const ms=row.resetAt-Date.now();if(!row.resetAt)reset=row.resetText;else if(ms<=0)reset='已到預估重置時間，請更新';else{const m=Math.ceil(ms/60000),d=Math.floor(m/1440),h=Math.floor(m%1440/60);reset=`約 ${d?d+'天 ':''}${h?h+'小時 ':''}${m%60}分後重置`;}}
      get(key+'-reset').textContent=reset;
    }
    get('stamp').textContent=record?'讀取於 '+new Date(record.capturedAt).toLocaleString('zh-TW',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'尚未讀取官方頁面';
  }
  function readOfficialUsage(){
    const dialogs=[...document.querySelectorAll('[role="dialog"],dialog')].filter(visible);
    const panel=dialogs.find(d=>/5\s*小時|5[- ]hour/i.test(d.innerText)&&/每週|weekly/i.test(d.innerText));
    const text=panel?.innerText ?? (/settings|usage/i.test(location.pathname+location.hash)?document.body.innerText:null);
    // Our own card uses different headings so it cannot be parsed as official limits.
    return text?parseUsage(text):null;
  }
  let lastAutoRead=0;
  async function autoUpdate(){
    if(document.visibilityState==='hidden'||Date.now()-lastAutoRead<15000)return;
    const parsed=readOfficialUsage();
    if(!parsed)return;
    lastAutoRead=Date.now();
    try{
      await chrome.storage.local.set({usage:parsed});
      record=parsed;draw();
      if(root)root.getElementById('status').textContent='已自動更新官方頁面資料。';
    }catch(e){/* Extension reload: leave the last successful record intact. */}
  }
  async function capture(){
    const status=root.getElementById('status');
    try{
      status.textContent='正在更新…';
      const direct=await chrome.runtime.sendMessage({type:'refreshUsage'});
      if(direct?.ok){status.textContent='背景同步成功。';return;}
      const parsed=readOfficialUsage();
      if(!parsed){status.textContent=direct?.error||'背景更新失敗，請稍後再試。';return;}
      await chrome.storage.local.set({usage:parsed});record=parsed;draw();status.textContent='已讀取官方頁面。';
    }catch(e){status.textContent='擴充功能可能已更新，請重新整理 ChatGPT 後重試。';}
  }
  function findSlot(sidebar){
    const bounds=sidebar.getBoundingClientRect();
    const candidates=[sidebar,...sidebar.querySelectorAll('nav,div')].filter(el=>{
      if(el===host||el.closest('#'+ID)||!visible(el))return false;
      const css=getComputedStyle(el),r=el.getBoundingClientRect();
      return css.display==='flex'&&css.flexDirection==='column'&&r.width>=180&&r.width<=bounds.width+2&&r.height>=Math.max(240,bounds.height*.6);
    });
    // Prefer the vertical layout that owns the scrollable conversation list.
    const score=el=>[...el.children].some(c=>/auto|scroll/.test(getComputedStyle(c).overflowY))?2:el.matches('nav')?1:0;
    candidates.sort((a,b)=>score(b)-score(a));
    let target=candidates[0];
    if(!target){
      const nav=sidebar.matches('nav')?sidebar:sidebar.querySelector('nav');
      if(nav&&visible(nav)&&getComputedStyle(nav).display!=='flex')target=nav;
      else if(getComputedStyle(sidebar).display!=='flex')target=sidebar;
    }
    if(!target)return null; // Never insert into a horizontal flex container.
    const children=[...target.children].filter(c=>c!==host&&visible(c));
    const last=children.at(-1);
    const footer=last&&last.getBoundingClientRect().height<=120?last:null;
    return {target,footer};
  }
  function placeCard(slot){
    const {target,footer}=slot;
    if(host.parentElement!==target||(footer&&host.nextElementSibling!==footer)||(!footer&&target.lastElementChild!==host))target.insertBefore(host,footer);
    if(host.style.display!=='block')host.style.display='block';
    // Allow the existing list to give up height while the card occupies its
    // own normal-flow row. No absolute/fixed positioning or overlay.
    for(const child of target.children){
      if(child!==host&&/auto|scroll/.test(getComputedStyle(child).overflowY)){
        if(child.style.minHeight!=='0px')child.style.minHeight='0px';
        if(child.style.flexShrink!=='1')child.style.flexShrink='1';
      }
    }
  }
  function mount(){
    const sidebar=findSidebar();
    const slot=sidebar?findSlot(sidebar):null;
    if(!slot){if(host&&host.style.display!=='none')host.style.display='none';return;}
    if(host){placeCard(slot);return;}
    host=document.createElement('div');host.id=ID;host.style.cssText='display:block;flex:0 0 auto;min-width:0;align-self:stretch;box-sizing:border-box;margin:8px 10px 64px;';
    root=host.attachShadow({mode:'open'});
    root.innerHTML=`<style>
      :host{color-scheme:light dark;font:12px system-ui,sans-serif;color:light-dark(#242424,#ededed)}*{box-sizing:border-box}.box{border-top:1px solid color-mix(in srgb,currentColor 18%,transparent);padding:10px 2px;background:transparent}header{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:13px;font-weight:600}button{font:inherit;color:inherit;background:transparent;border:1px solid color-mix(in srgb,currentColor 25%,transparent);border-radius:6px;padding:5px 9px;cursor:pointer}button:focus-visible{outline:2px solid currentColor;outline-offset:2px}.row{display:flex;justify-content:space-between;margin-top:8px;gap:6px}.value{font-variant-numeric:tabular-nums}progress{display:block;width:100%;height:6px;margin:7px 0;accent-color:#36ad91}.muted{opacity:.75;font-size:11px;line-height:1.5;overflow-wrap:anywhere}#stamp{margin-top:12px}#status{margin-top:6px}p{margin:0}
      </style><section class="box" aria-label="ChatGPT 用量紀錄"><header>用量<button id="capture" type="button">更新</button></header><div class="row"><span>5 小時</span><span class="value" id="five">尚無紀錄</span></div><progress id="five-bar" max="100" value="0" aria-label="5 小時剩餘額度"></progress><div class="row"><span>每週</span><span class="value" id="week">尚無紀錄</span></div><progress id="week-bar" max="100" value="0" aria-label="每週剩餘額度"></progress><details><summary style="cursor:pointer;font-size:11px;margin-top:8px;opacity:.75">倒數與紀錄時間</summary><p class="muted" id="five-reset"></p><p class="muted" id="week-reset"></p><p class="muted" id="stamp"></p><p class="muted">每 30 秒自動同步；此處為最後成功讀取值。</p></details><p class="muted" id="status" role="status"></p></section>`;
    placeCard(slot);
    root.getElementById('capture').addEventListener('click',capture);draw();
  }
  chrome.storage.local.get('usage').then(data=>{record=data.usage;mount();draw();chrome.runtime.sendMessage({type:'refreshUsage',automatic:true}).catch(()=>{});chrome.storage.local.get('syncStatus').then(({syncStatus:s})=>{if(root&&s&&!s.ok)root.getElementById('status').textContent=s.error;});}).catch(()=>{});
  chrome.storage.onChanged.addListener((changes,area)=>{if(area==='local'&&changes.usage){record=changes.usage.newValue;draw();}if(area==='local'&&changes.syncStatus&&root){const s=changes.syncStatus.newValue;root.getElementById('status').textContent=s?.ok?'自動更新已啟用 · 約每 30 秒同步。':s?.error||'';}});
  function scheduleMount(){if(!timer)timer=setTimeout(()=>{timer=null;mount();},150);}
  const observer=new MutationObserver(scheduleMount);
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style','hidden','aria-hidden','inert']});
  window.addEventListener('popstate',scheduleMount);
  window.addEventListener('hashchange',scheduleMount);
  window.addEventListener('resize',scheduleMount);
  document.addEventListener('visibilitychange',()=>{scheduleMount();if(document.visibilityState==='visible')chrome.runtime.sendMessage({type:'refreshUsage',automatic:true}).catch(()=>{});});
  // Also recover when framework navigation changes no observed attributes.
  setInterval(()=>{mount();},2000);
  setInterval(draw,30000);
})();
