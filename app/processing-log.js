/* Owner-scoped import journal plus the server's live analysis queue. No media bytes or transcripts are stored here. */
(() => {
'use strict';
const VZ=window.VZ, M=VZ?.media, esc=VZ?.esc;
if(!VZ||!M)return;
const storage=window.VzipAccountScope?.storage||window.localStorage, KEY='vzip_processing_log_v1';
const key=()=>KEY+':'+(window.vzipCloudUserId?.()||'device');
const read=()=>{try{const rows=JSON.parse(storage.getItem(key())||'[]');return Array.isArray(rows)?rows:[]}catch{return []}};
const safe=o=>Object.fromEntries(Object.entries(o).filter(([k])=>['originalName','savedName','size','savedSize','state','error','songId','songSource','date','dateSource','cloud','pendingUpload','audioExtraction','losslessFlac'].includes(k)).map(([k,v])=>[k,typeof v==='string'?v.slice(0,300):v]));
VZ.processingLog={record(id,patch){if(!id)return;try{const rows=read(),before=rows.find(r=>r.id===id)||{};rows.unshift({...before,id,...safe(patch),updatedAt:Date.now()});storage.setItem(key(),JSON.stringify(rows.filter((r,i)=>i===0||r.id!==id).slice(0,200)));window.dispatchEvent(new Event('vzip:processing-log'))}catch{}},read};
const size=n=>{n=Number(n)||0;return n>=1073741824?(n/1073741824).toFixed(2)+' GB':(n/1048576).toFixed(1)+' MB'};
const stateLabel=s=>({review:'가져오기 확인 대기',uploading:'업로드 중',waiting:'대기',failed:'실패',done:'완료',queued:'대기',running:'분석 중',skipped:'건너뜀'}[s]||'기록 없음');
const jobLine=(job,review)=>{
 if(!job)return '작업 기록 없음';
 let detail='';
 if(job.kind==='song'&&job.status==='review'){
  const r=review?.result||{};
  detail=r.reason==='no lyrics to compare'?'비교할 곡 가사·기준 녹음이 없어요.':r.requiresRequest?'인식된 가사가 없어요. 유료 전사는 직접 요청할 때만 실행돼요.':r.top3?.length?'인식된 가사를 기준 가사·기준 녹음과 비교했어요. 후보 확인이 필요해요.':'곡 확인이 필요해요.';
 }
 return stateLabel(job.status)+(detail?' · '+detail:'')+(job.status==='failed'?' · '+(job.last_error||'실패 이유를 확인할 수 없어요.'):'');
};
let stop=null;
VZ.route('processing-log',{title:'처리 내역',back:true,tab:'library',noAutoRefresh:true,
 render(){return '<div data-processing-log><p class="muted">처리 상태를 불러오는 중…</p></div>';},
 mount(main){stop?.();let live=true,busy=false;const host=main.querySelector('[data-processing-log]');
  async function refresh(){if(!live||busy||!host.isConnected)return;busy=true;
   try{
    const [media,jobs,usage]=await Promise.all([M.list(true).catch(()=>M.cached()),window.vzipAnalysisJobs?window.vzipAnalysisJobs().catch(()=>null):Promise.resolve(null),window.VzipR2?.configured?.()&&window.vzipCloudSignedIn?.()?window.VzipR2.usage().catch(()=>null):Promise.resolve(null)]);
    if(!live||!host.isConnected)return;
    const journal=read(),byId=new Map((media||[]).map(m=>[m.id,m]));
    const rows=new Map(journal.map(r=>[r.id,r]));
    for(const m of media||[])if(!rows.has(m.id))rows.set(m.id,{id:m.id,updatedAt:m.importedAt||m.created||0});
    const jobMap=new Map((jobs?.rows||[]).map(j=>[j.media_id+':'+j.kind,j]));
    const reviews=new Map((jobs?.review||[]).map(r=>[r.media_id,r]));
    const counts={queued:0,running:0,review:0,failed:0,done:0};
    for(const j of jobs?.rows||[])counts[j.status]=(counts[j.status]||0)+1;
    const tracked=(jobs?.rows||[]).reduce((n,j)=>n+(Number(j.cost_usd)||0),0);
    const r2Bytes=usage?.bytes, stored=(media||[]).filter(m=>m.storageProvider==='r2').reduce((n,m)=>n+(Number(m.savedSize||m.size)||0),0);
    const device=VZ.autoAnalysisStatus?.();
    const article=r=>{const m=byId.get(r.id),s=VZ.song(m?.songId||r.songId),v=jobMap.get(r.id+':vocal'),j=jobMap.get(r.id+':song'),original=m?.originalFilename||m?.originalMedia?.name||r.originalName||'',saved=m?.name||r.savedName||'',song=s?VZ.songLabel(s):(m?.song||'곡 미지정');
     const review=reviews.get(r.id)?.result, candidates=(review?.top3||[]).slice(0,3).map(x=>(x.title||VZ.songTitle(x.songId)||'제목 없음')+(Number.isFinite(Number(x.score))?' '+Math.round(Number(x.score)*100)+'%':'')).join(' · ');
     const lyrics=j?jobLine(j,reviews.get(r.id)):(m?.songId||r.songId?'곡이 지정됐어요. 가사 비교 작업은 없었어요.':'가사 비교 작업 기록 없음');
     const conversion=m?.audioExtraction||r.audioExtraction?'영상에서 음성 추출 완료':m?.losslessFlac||r.losslessFlac?'무손실 음성 변환 완료':'변환 기록 없음';
     const location=m?.storageProvider==='r2'?'R2 저장':m?.cloud||r.cloud?'클라우드 저장':m?.pendingUpload||r.pendingUpload?'기기 저장 · 백업 대기':'기기 저장';
     return '<article class="card stack" style="gap:7px;margin-bottom:12px"><div class="row between"><strong class="ellipsis">'+esc(saved||original||'이름 없음')+'</strong><span class="badge '+(r.state==='failed'?'danger':'')+'">'+esc(stateLabel(r.state|| (m?'done':'')))+'</span></div>'+
      '<div class="small muted">원본 '+esc(original||'기록 없음')+' → 저장 '+esc(saved||'기록 없음')+'</div><div class="small">곡 · '+esc(song)+(r.songSource?' ('+esc(r.songSource)+')':'')+'</div>'+
      '<div class="small">가사 매칭 · '+esc(lyrics)+'</div>'+(candidates?'<div class="small muted">비교 후보 · '+esc(candidates)+'</div>':'')+'<div class="small">보컬 분석 · '+esc(v?jobLine(v):m?.analysis?.v?'기기 분석 완료':device?.running&&m&&device.current===M.label(m)?'이 기기에서 분석 중':'작업 기록 없음')+'</div>'+
      '<div class="small muted">'+esc(conversion)+' · '+esc(location)+(m?.size||r.size?' · '+size(m?.savedSize||r.savedSize||m?.size||r.size):'')+'</div>'+
      (r.error?'<p class="small" style="color:var(--danger);margin:0">오류 · '+esc(r.error)+'</p>':'')+(j?.status==='failed'?'<p class="small" style="color:var(--danger);margin:0">곡 분석 오류 · '+esc(j.last_error||'원인을 확인할 수 없어요.')+'</p>':'')+'</article>'};
    host.innerHTML='<div class="card stack" style="margin-bottom:12px"><strong>현재 분석 상태</strong><p class="small" style="margin:0">서버 작업 · 대기 '+counts.queued+' · 진행 '+counts.running+' · 곡 확인 '+counts.review+' · 완료 '+counts.done+' · 실패 '+counts.failed+'</p><p class="small muted" style="margin:0">기기 분석 · '+esc(device?.running?'진행 중: '+device.current:device?.enabled?'대기 중 또는 완료':'꺼짐')+'</p></div>'+
     '<div class="card stack" style="margin-bottom:20px"><strong>사용량 · 비용</strong><p class="small" style="margin:0">R2 저장량 · '+(r2Bytes==null?'서버 조회 불가 (보관함 기준 '+size(stored)+')':size(r2Bytes))+'</p><p class="small" style="margin:0">서버 분석 작업에 기록된 비용 · '+(jobs?'$'+tracked.toFixed(4):'조회 불가')+'</p><p class="small muted" style="margin:0">실제 청구액은 확인할 수 없어요. 수동 유료 가사 인식, R2 요청·전송료, Supabase 요금은 이 수치에 포함되지 않아요.</p></div>'+
     '<h2 class="sec">파일별 처리 내역</h2>'+(rows.size?[...rows.values()].sort((a,b)=>(b.updatedAt||0)-(a.updatedAt||0)).slice(0,100).map(article).join(''):'<p class="muted">처리된 파일이 없어요.</p>');
   }finally{busy=false}}
  const on=()=>refresh().catch(()=>{});['vzip:processing-log','vzip:server-analysis-updated','vzip:cloud-media-changed','vzip:media-saved'].forEach(n=>window.addEventListener(n,on));
  const poll=setInterval(()=>{if(document.visibilityState==='visible')on()},60000);on();
  stop=()=>{live=false;clearInterval(poll);['vzip:processing-log','vzip:server-analysis-updated','vzip:cloud-media-changed','vzip:media-saved'].forEach(n=>window.removeEventListener(n,on))};
 },leave(){stop?.();stop=null}});
})();
