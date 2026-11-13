const {test,expect}=require('@playwright/test');
async function open(page){
 await page.route('**/__pitch-test',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app/app.css"><body><main id="test-host" style="max-width:560px;margin:auto"></main></body></html>'}));
 await page.goto('/__pitch-test');
 await page.evaluate(()=>{
  window.VZ={media:{},esc:s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),
   route:(name,route)=>window.analysisRoute=route,dateLabel:s=>s,songTitle:()=>'',clock:s=>String(s)};
  const old={v:1,at:1,metrics:{range:{high:'C6',highCents:8400},voicedSeconds:12},confidence:{voiceOverMrDb:12}};
  window.item={id:'synthetic-recording',name:'C5 reference',analysis:old};
  const sr=16000,n=sr,buf=new ArrayBuffer(44+n*2),v=new DataView(buf),txt=(p,s)=>[...s].forEach((c,i)=>v.setUint8(p+i,c.charCodeAt(0)));
  txt(0,'RIFF');v.setUint32(4,36+n*2,true);txt(8,'WAVEfmt ');v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,sr,true);v.setUint32(28,sr*2,true);v.setUint16(32,2,true);v.setUint16(34,16,true);txt(36,'data');v.setUint32(40,n*2,true);
  for(let i=0;i<n;i++)v.setInt16(44+i*2,Math.round(5000*Math.sin(2*Math.PI*523.251*i/sr)),true);
  const blob=new Blob([buf],{type:'audio/wav'}),M=VZ.media;
  M.src=async()=>({url:URL.createObjectURL(blob),revoke:true});M.list=async()=>[item];M.dateOf=()=> '2026-11-11';M.label=m=>m.name;
  M.update=async(m,patch)=>{window.saved=patch.analysis;localStorage.setItem('test-analysis',JSON.stringify(patch.analysis));};
  M.player=host=>{const audio=document.createElement('audio');host.append(audio);return{el:audio,play:()=>{window.played=(window.played||0)+1;}};};
 });
 await page.addScriptTag({url:'/app/analysis.js'});
}
test('real audio decoder and Worker render distinct range metrics and retain prior analysis on reload',async({page})=>{
 await open(page);
 await page.evaluate(()=>{const host=document.querySelector('#test-host');host.innerHTML=analysisRoute.render();return analysisRoute.mount(host,{params:['synthetic-recording'],query:new URLSearchParams()});});
 await expect(page.locator('#test-host')).toContainText('유효 최고 C5');
 await expect(page.locator('#test-host')).toContainText('안정 최고 C5');
 await expect(page.locator('#test-host')).toContainText('순간 검출 최고');
 // Evidence: the reported highest notes carry their time in the recording and play from there.
 const listen=page.locator('[data-seek-at]');
 await expect(listen.first()).toHaveAttribute('aria-label',/유효 최고음 .* 부분 듣기/);
 expect(await listen.count()).toBeGreaterThanOrEqual(2);
 await listen.first().click();
 expect(await page.evaluate(()=>window.played)).toBe(1);
 expect(await page.evaluate(()=>saved.history[0])).toMatchObject({v:1,at:1,metrics:{range:{high:'C6'}}});
 expect(await page.evaluate(()=>saved.v)).toBe(2);
 await page.setViewportSize({width:320,height:700});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
 await page.reload();
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('test-analysis')).history[0].metrics.range.high)).toBe('C6');
});
test('growth holds low confidence/version mismatch and shows a neutral four-semitone change',async({page})=>{
 await open(page);
 await page.addScriptTag({url:'/app/growth-metrics-model.js'});
 await page.addScriptTag({url:'/app/song-vocal-growth.js'});
 const render=async(weak=false,version=2)=>page.evaluate(({weak,version})=>{
  const a={v:2,at:2,metrics:{voicedSeconds:12,range:{validHigh:{note:'A#5',cents:8200},stableHigh:{note:'A5',cents:8100}}},confidence:{pitchConfidence:.95,voiceOverMrDb:12}};
  const b={...a,v:version,metrics:{...a.metrics,range:{validHigh:{note:'F#5',cents:7800},stableHigh:{note:'F5',cents:7700}}},confidence:{...a.confidence,pitchConfidence:weak?.4:.95}};
  document.querySelector('#test-host').innerHTML=VZ.measureTable({id:'a',songId:'same',analysis:a},{id:'b',songId:'same',analysis:b});
 },{weak,version});
 await render();await expect(page.locator('#test-host')).toContainText('4반음');await expect(page.locator('#test-host')).not.toContainText('나빠짐');
 await render(true);await expect(page.locator('#test-host')).toContainText('판정 보류');await expect(page.locator('#test-host')).not.toContainText('4반음');
 // Low confidence: the reason is written once under the table with that take's own number, not in every row, and it does not offer a re-analysis that cannot help.
 await expect(page.locator('#test-host [data-hold-why]')).toContainText('음높이 인식 신뢰도 40% (80% 이상 필요)');
 await expect(page.locator('#test-host [data-hold-why] li')).toHaveCount(1);
 expect(await page.locator('#test-host').evaluate(e=>(e.textContent.match(/측정 신뢰도가 낮아요/g)||[]).length)).toBe(1);
 await expect(page.locator('#test-host')).not.toContainText('v2로 재분석');
 await render(false,1);await expect(page.locator('#test-host')).toContainText('분석 버전');
});
