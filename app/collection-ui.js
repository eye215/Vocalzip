/* Approved My Songs / Library presentation over the existing records and actions. */
(()=>{
'use strict';
const V=window.VZ,M=V.media,E=V.esc;
V.collectionCount=(n,unit)=>{
 const h=document.querySelector('#top h1');if(!h)return;
 const headingRow=h.parentElement;let badge=headingRow.querySelector('[data-collection-count]');if(!badge){badge=document.createElement('span');badge.dataset.collectionCount='';headingRow.append(badge)}badge.textContent=n+unit;
};
V.collectionChoice=(title,choices,value,onSelect)=>V.menu({title,body:'<div class="vz-choice-list">'+choices.map(([id,label])=>'<button type="button" class="vz-choice" data-choice="'+E(id)+'" aria-pressed="'+(value===id)+'"><span>'+E(label)+'</span>'+(value===id?'<i class="ph ph-check"></i>':'')+'</button>').join('')+'</div>',onMount:(el,close)=>{el.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.choice);close();})}});
V.collectionSearch=(title,placeholder,value,onSearch)=>{
 document.querySelector('.vz-collection-search-overlay')?.remove();
 const overlay=document.createElement('div');overlay.className='vz-collection-search-overlay';
 overlay.innerHTML='<form class="vz-collection-search-field" data-collection-search role="search"><label class="sr-only" for="vz-collection-query">'+E(title)+'</label><input id="vz-collection-query" type="search" name="query" inputmode="search" enterkeyhint="search" autocomplete="off" placeholder="'+E(placeholder)+'" value="'+E(value)+'"></form>';
 document.body.append(overlay);
 const form=overlay.querySelector('form'),field=form.querySelector('input');
 const close=()=>{window.removeEventListener('hashchange',close);overlay.remove();};
 overlay.onclick=e=>{if(e.target===overlay)close();};
 overlay.onkeydown=e=>{if(e.key==='Escape')close();};
 form.onsubmit=e=>{e.preventDefault();onSearch(field.value.trim());close();};
 window.addEventListener('hashchange',close);
 field.focus({preventScroll:true});
};
let recordPlayer=null;
V.route('recording',{title:'녹음 재생',tab:'songs',back:true,noAutoRefresh:true,render(){return '<div class="vz-recording-page" data-recording><p class="muted">녹음을 불러오는 중…</p></div>'},leave(){recordPlayer?.destroy();recordPlayer=null;},async mount(main,r){
 const host=main.querySelector('[data-recording]');const all=await M.list().catch(()=>M.cached()),item=all.find(x=>x.id===r.params[0]);if(!host.isConnected)return;
 if(!item){host.innerHTML=V.empty('waveform','녹음을 찾을 수 없어요.','<a class="btn" href="#/library">전체 녹음으로</a>');return;}
 // Old links (#/recording/<id>): a recording of a song that is still here opens in 곡 분석's player with that take
 // (?a= selects it; 곡 분석 lists 연습 takes whatever its 연습 녹음 포함 switch says). replace(), so 뒤로 skips this page.
 // No song, or the song is gone: this playback page as before.
 if(item.songId&&V.song(item.songId)&&!(V.db.deleted?.songs||[]).map(String).includes(String(item.songId))){location.replace('#/growth-song/'+encodeURIComponent(item.songId)+'?a='+encodeURIComponent(item.id));return;}
 host.innerHTML='<div class="list">'+V.mediaRow(item)+'</div>';V.wireMedia(host,[item]);host.querySelector('[data-toggle]').click();recordPlayer=host.querySelector('.media-open')._player;
}});
const floating=document.createElement('a');floating.className='vz-collection-record';floating.href='#/record';floating.setAttribute('aria-label','녹음 시작');floating.title='녹음 시작';floating.innerHTML='<svg class="vz-mic-anim" width="40" height="40" viewBox="-3.5 0.5 31 23" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><g class="vz-mic-body"><rect x="9" y="2.5" width="6" height="12" rx="3"/><path d="M5.5 10.5a6.5 6.5 0 0 0 13 0"/><path d="M12 17v4"/></g><path class="vz-mic-wave" d="M2.5 6.5a8 8 0 0 0 0 9"/><path class="vz-mic-wave" d="M21.5 6.5a8 8 0 0 1 0 9"/><path class="vz-mic-wave vz-mic-wave2" d="M-0.5 4.5a11 11 0 0 0 0 13"/><path class="vz-mic-wave vz-mic-wave2" d="M24.5 4.5a11 11 0 0 1 0 13"/></svg>';floating.addEventListener('click',e=>{if(!window.VzipRecordTransition)return;e.preventDefault();window.VzipRecordTransition.open(floating,floating.getAttribute('href'));});document.body.append(floating);
})();

