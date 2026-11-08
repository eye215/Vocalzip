/* Approved My Songs / Library presentation over the existing records and actions. */
(()=>{
'use strict';
const V=window.VZ,M=V.media,E=V.esc;
V.collectionCount=(n,unit)=>{
 const h=document.querySelector('#top h1');if(!h)return;
 const headingRow=h.parentElement;let badge=headingRow.querySelector('[data-collection-count]');if(!badge){badge=document.createElement('span');badge.dataset.collectionCount='';headingRow.append(badge)}badge.textContent=n+unit;
};
V.collectionChoice=(title,choices,value,onSelect)=>V.sheet({title,body:'<div class="vz-choice-list">'+choices.map(([id,label])=>'<button type="button" class="vz-choice" data-choice="'+E(id)+'" aria-pressed="'+(value===id)+'"><span>'+E(label)+'</span>'+(value===id?'<i class="ph ph-check"></i>':'')+'</button>').join('')+'</div>',onMount:(el,close)=>{el.querySelectorAll('[data-choice]').forEach(b=>b.onclick=()=>{onSelect(b.dataset.choice);close();})}});
V.collectionSearch=(title,placeholder,value,onSearch)=>V.sheet({title,body:'<form data-collection-search><label class="field"><span class="sr-only">'+E(title)+'</span><input type="search" name="query" placeholder="'+E(placeholder)+'" value="'+E(value)+'"></label><button class="btn block" type="submit">검색</button><button class="btn ghost block" type="button" data-clear>검색 초기화</button></form>',onMount:(el,close)=>{const form=el.querySelector('form');form.onsubmit=e=>{e.preventDefault();onSearch(form.elements.query.value.trim());close()};el.querySelector('[data-clear]').onclick=()=>{onSearch('');close()};}});
V.collectionLibraryMenu=main=>V.sheet({title:'보관함 메뉴',body:'<div class="stack"><button class="btn secondary" data-select>녹음 선택</button><button class="btn secondary" data-import>파일 가져오기</button><button class="btn secondary" data-bulk>기존 자료 한꺼번에 가져오기</button><label class="field"><span>파일 형식</span><select data-format>'+main.querySelector('[data-kind]').innerHTML+'</select></label><label class="field"><span>곡 필터</span><select data-library-song>'+main.querySelector('[data-song]').innerHTML+'</select></label></div>',onMount:(el,close)=>{
 for(const [target,source] of [['[data-format]','[data-kind]'],['[data-library-song]','[data-song]']]){const a=el.querySelector(target),b=main.querySelector(source);a.value=b.value;a.onchange=()=>{b.value=a.value;b.dispatchEvent(new Event('change'));};}
 el.querySelector('[data-select]').onclick=()=>{close();main.querySelector('[data-select-mode]').click()};
 el.querySelector('[data-import]').onclick=()=>{close();V.importSheet()};el.querySelector('[data-bulk]').onclick=()=>{close();V.openImportHub()};}});
let recordPlayer=null;
V.route('recording',{title:'녹음 재생',tab:'library',back:true,noAutoRefresh:true,render(){return '<div class="vz-recording-page" data-recording><p class="muted">녹음을 불러오는 중…</p></div>'},leave(){recordPlayer?.destroy();recordPlayer=null;},async mount(main,r){
 const host=main.querySelector('[data-recording]');const all=await M.list().catch(()=>M.cached()),item=all.find(x=>x.id===r.params[0]);if(!host.isConnected)return;
 if(!item){host.innerHTML=V.empty('waveform','녹음을 찾을 수 없어요.','<a class="btn" href="#/library">보관함으로</a>');return;}
 host.innerHTML='<div class="list">'+V.mediaRow(item)+'</div>';V.wireMedia(host,[item]);host.querySelector('[data-toggle]').click();recordPlayer=host.querySelector('.media-open')._player;
}});
const floating=document.createElement('a');floating.className='vz-collection-record';floating.href='#/record';floating.innerHTML='<i class="ph ph-microphone"></i><span>녹음 시작</span>';document.body.append(floating);
})();

