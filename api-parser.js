function parseUsageResponse(data,now=Date.now()){
  const limits=data?.rate_limit;
  const windows=[['five',limits?.primary_window,18000],['week',limits?.secondary_window,604800]];
  const rows={};
  for(const [key,w,seconds] of windows){
    if(!w||w.limit_window_seconds!==seconds||typeof w.used_percent!=='number'||!Number.isFinite(w.used_percent)||w.used_percent<0||w.used_percent>100)return null;
    let resetAt;
    if(typeof w.reset_at==='number'&&Number.isFinite(w.reset_at)&&w.reset_at>0)resetAt=w.reset_at*1000;
    else if(typeof w.reset_after_seconds==='number'&&Number.isFinite(w.reset_after_seconds)&&w.reset_after_seconds>=0)resetAt=now+w.reset_after_seconds*1000;
    else return null;
    rows[key]={remaining:Math.round((100-w.used_percent)*10)/10,resetAt,resetText:new Date(resetAt).toLocaleString('zh-TW')};
  }
  // Deliberately retain no user ID, email, account ID, token, or credits data.
  return {rows,capturedAt:now,source:'direct'};
}
if(typeof module!=='undefined')module.exports={parseUsageResponse};
