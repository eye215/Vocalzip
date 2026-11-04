(()=>{'use strict';
const C=window.VzipBilling,I=window.VzipBillingImport,F=window.VzipBillingFiles,S=window.VzipBillingStore;
const $=s=>document.querySelector(s),money=n=>new Intl.NumberFormat('ko-KR').format(n)+'원',sessions=n=>new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(n/100)+'회';
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const statusLabels={unconfirmed:'확인 필요',scheduled:'예정',completed:'완료',cancelled:'취소',noshow:'당일 취소',free:'무료'};
let state=null,pending=false,auditLimit=100,workbook=null,fileName='',sourceRows=[],draftRows=[],settings=null,page=0,parseRun=0;
const forms={};
function el(tag,text,cls){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node}
function notify(text,error=false){const box=$('#message');box.textContent=text;box.className=(error?'error ':'')+'show';clearTimeout(notify.timer);notify.timer=setTimeout(()=>box.classList.remove('show'),error?6000:3200)}
function button(text,fn){const b=el('button',text);b.type='button';b.onclick=fn;return b}
function selectOptions(select,options,previous=select.value){select.replaceChildren();for(const [value,label]of options)select.add(new Option(label,value));if(options.some(([value])=>value===previous))select.value=previous}
function passName(id){return state?.passes.find(row=>row.id===id)?.name||'레슨권 없음'}
function baseOptions(){return [['','레슨권 선택'],...C.active(state.passes).map(pass=>[pass.id,pass.name])]}
function table(headers,rows,empty='아직 기록이 없어요.'){
 if(!rows.length)return el('p',empty,'empty');
 const wrap=el('div',undefined,'table-wrap'),table=el('table'),head=el('thead'),tr=el('tr');
 for(const name of headers){const th=el('th',name);th.scope='col';tr.append(th)}head.append(tr);table.append(head);
 const body=el('tbody');for(const values of rows){const row=el('tr');for(const [index,value] of values.entries()){const td=el('td');if(headers[index])td.dataset.label=headers[index];if(value instanceof Node)td.append(value);else td.textContent=/^\d{4}-\d{2}-\d{2}$/.test(String(value??''))?window.VzipBillingDate.show(value):String(value??'');row.append(td)}body.append(row)}table.append(body);wrap.append(table);return wrap;
}
function flags(form,names){
 for(const [name,label]of names){const wrapper=el('label',undefined,'check'),input=el('input');input.type='checkbox';input.name=name;wrapper.append(input,document.createTextNode(label));form.append(wrapper)}
}
function makeForm(kind,fields,flagItems=[]){
 const form=el('form');form.id=kind+'-form';const grid=el('div',undefined,'form-grid');
 for(const [name,label,type,options]of fields){
  const wrap=el('label',label);let control;
  if(type==='select'||type==='pass'||type==='lesson'){control=el('select');if(type==='pass')control.dataset.passSelect='';if(options)selectOptions(control,options)}
  else{control=el(type==='textarea'?'textarea':'input');if(type!=='textarea')control.type=type;if(type==='date')window.VzipBillingDate.enhance(control);if(type==='number'){control.step=name.toLowerCase().includes('units')?'0.01':'1';if(!name.endsWith('Delta'))control.min='0'}}
  control.name=name;control.id=kind+'-'+name;wrap.htmlFor=control.id;
  if(['name','date','passId','amount','totalUnits'].includes(name))control.required=true;
  wrap.append(control);grid.append(wrap);
 }
 const id=el('input');id.type='hidden';id.name='id';const version=el('input');version.type='hidden';version.name='version';const legacy=el('input');legacy.type='hidden';legacy.name='legacyRef';
 form.append(id,version,legacy,grid);flags(form,flagItems);
 const impact=el('p','','help impact');impact.dataset.impact='';form.append(impact);
 const actions=el('div',undefined,'actions form-actions'),save=el('button','저장');save.type='submit';actions.append(save,button('새로 입력',()=>resetForm(form)));form.append(actions);
 form.addEventListener('input',()=>previewForm(kind));form.addEventListener('change',()=>previewForm(kind));
 form.onsubmit=async event=>{event.preventDefault();if(!form.reportValidity())return;try{await persist(commandFor(kind),()=>resetForm(form),'정산 기록을 저장했어요.')}catch(error){notify(error.message,true)}};
 $('#'+kind+'-form-slot').append(form);forms[kind]=form;resetForm(form);return form;
}
function resetForm(form){form.reset();form.elements.id.value='';form.elements.version.value='';form.elements.legacyRef.value='';if(form.elements.date)form.elements.date.value=today();form.querySelector('[data-impact]').textContent='';form.querySelector('[type=submit]').textContent='저장'}
const impactFlags=[['ackImpact','이력이 있는 레슨권의 단가·과거 사용 금액 변경을 확인했습니다.'],['allowOverdraw','잔여 횟수 초과를 확인했습니다.']];
makeForm('pass',[['name','레슨권 이름','text'],['totalUnits','총 횟수','number'],['amount','레슨권 금액 (원)','number'],['teacher','선생님','text'],['expires','유효기간','date'],['memo','메모','textarea']],impactFlags);
makeForm('payment',[['passId','연결 레슨권','pass'],['date','결제일','date'],['kind','유형','select',[['payment','결제'],['refund','환불']]],['amount','금액 (원)','number'],['method','결제 방법','text'],['reference','거래 번호 (선택)','text'],['memo','메모','textarea']],[['allowDuplicate','중복 의심 기록과 다른 결제임을 확인했습니다.']]);
const deduction=makeForm('deduction',[['lessonId','기존 레슨 연결 (선택)','lesson'],['passId','연결 레슨권','pass'],['date','레슨 날짜','date'],['status','진행 상태','select',Object.entries(statusLabels)],['units','차감 횟수','number'],['start','시작 시간 (선택)','time'],['end','종료 시간 (선택)','time'],['memo','레슨 메모','textarea']],[['allowOverdraw','잔여 횟수 초과를 확인했습니다.']]);
makeForm('adjustment',[['passId','연결 레슨권','pass'],['date','조정일','date'],['unitsDelta','충전 횟수 증감 (+/-)','number'],['amountDelta','레슨권 금액 증감 (+/- 원)','number'],['memo','조정 사유','textarea']],[['ackImpact','조정 후 단가와 과거 사용 금액이 다시 계산됨을 확인했습니다.'],['allowOverdraw','잔여 횟수 초과를 확인했습니다.']]);
deduction.elements.status.onchange=()=>{deduction.elements.units.value=deduction.elements.status.value==='completed'?'1':'0';previewForm('deduction')};
deduction.elements.lessonId.onchange=()=>{
 const id=deduction.elements.lessonId.value,existing=C.active(state.deductions).find(row=>id&&row.lessonId===id),lesson=S.lessons().find(row=>row.lesson_id===id);
 if(existing){edit('deduction',existing);notify('기존 레슨의 차감 이력을 수정합니다.');return}
 deduction.elements.id.value='';deduction.elements.version.value='';deduction.elements.legacyRef.value='';
 if(lesson){deduction.elements.date.value=lesson.lesson_date;deduction.elements.status.value=lesson.lesson_status;deduction.elements.units.value=lesson.lesson_status==='completed'?'1':'0'}
 previewForm('deduction');
};
function optionsFor(form){return Object.fromEntries(['ackImpact','allowDuplicate','allowOverdraw'].map(key=>[key,!!form.elements[key]?.checked]))}
function commandFor(kind){
 const f=forms[kind],data=Object.fromEntries(new FormData(f));if(!data.id)delete data.id;else data.expectedVersion=Number(data.version);delete data.version;
 if(kind==='pass'){data.totalUnits=C.units(data.totalUnits);data.amount=C.money(data.amount)}
 if(kind==='payment')data.amount=C.money(data.amount);
 if(kind==='deduction')data.units=C.units(data.units||'0');
 if(kind==='adjustment'){if(!f.elements.ackImpact.checked)throw Error('수동 조정의 정산 영향을 확인해 주세요.');data.unitsDelta=C.units(data.unitsDelta||'0');data.amountDelta=C.money(data.amountDelta||'0')}
 return {type:kind==='adjustment'?'adjustment.create':kind+'.save',payload:data,options:optionsFor(f)};
}
function previewForm(kind){
 if(!state)return;const output=forms[kind].querySelector('[data-impact]');
 try{let seq=0;const next=C.reduce(state,commandFor(kind),{uid:()=>('preview-'+seq++)}),before=C.totals(state).total,after=C.totals(next).total;
 output.textContent='저장 후 잔여 '+sessions(after.remainingUnits)+' · 사용 금액 '+money(before.usedAmount)+' → '+money(after.usedAmount)+' · 미납 '+money(after.unpaid);output.className='help impact';
 }catch(error){output.textContent=error.message;output.className='help impact'}
}
async function persist(command,after,message){
 if(pending||!state)return;pending=true;const disabled=[...document.querySelectorAll('button,input,select,textarea')].map(node=>[node,node.disabled]);disabled.forEach(([node])=>node.disabled=true);
 try{state=await S.save(command,state.revision);after?.();render();notify(message);window.dispatchEvent(new Event('billing:changed'));channel?.postMessage({owner:state.owner,revision:state.revision});}
 catch(error){notify(error.message,true);throw error}
 finally{disabled.forEach(([node,value])=>{if(node.isConnected)node.disabled=value});pending=false;updateImportSummary()}
}
function edit(kind,row){
 const f=forms[kind];resetForm(f);for(const [key,value]of Object.entries(row)){if(!f.elements[key])continue;f.elements[key].value=['totalUnits','units'].includes(key)?value/100:(value??'')}
 f.elements.version.value=row.version;f.querySelector('[type=submit]').textContent='수정 저장';
 show(kind==='pass'?'passes':kind==='payment'?'payments':'attendance');previewForm(kind);f.scrollIntoView({block:'start'});f.elements[kind==='pass'?'name':'date']?.focus();
}
async function toggle(collection,row){
 const restore=!!row.voidedAt;if(!await window.VzipBillingDialog.ask({title:restore?'기록을 복구할까요?':'기록을 취소할까요?',message:'정산 합계에 바로 반영되고, 변경 이력은 그대로 남아요.',ok:restore?'복구':'기록 취소',cancel:'닫기',danger:!restore}))return;
 try{await persist({type:restore?'entity.restore':'entity.void',payload:{collection,id:row.id,expectedVersion:row.version}},null,'기록을 '+(restore?'복구':'취소')+'했어요.')}catch{}
}
function rowActions(collection,kind,row){const box=el('div',undefined,'actions');if(kind&&!row.voidedAt)box.append(button('수정',()=>edit(kind,row)));box.append(button(row.voidedAt?'복구':'취소',()=>toggle(collection,row)));return box}
/** Records list newest date first; same day: most recently saved first. */
function newestFirst(rows){return rows.slice().sort((a,b)=>String(b.date||'').localeCompare(String(a.date||''))||String(b.createdAt||'').localeCompare(String(a.createdAt||'')))}
function render(){
 if(!state)return;const result=C.totals(state),labels={chargedUnits:'총 충전 횟수',usedUnits:'총 사용 횟수',remainingUnits:'잔여 횟수',amount:'총 레슨권 금액',paid:'실제 결제금액',refunded:'환불 금액',netPaid:'순결제금액',usedAmount:'사용 금액',unusedAmount:'미사용 금액',unpaid:'미납 금액'};
 $('#totals').replaceChildren(...Object.entries(labels).map(([key,label])=>{const box=el('div',undefined,'metric');box.dataset.total=key;box.append(el('span',label),el('strong',key.endsWith('Units')?sessions(result.total[key]):money(result.total[key]),result.total[key]<0?'negative':''));return box}));
 $('#balances').replaceChildren(table(['레슨권','충전','사용','잔여','레슨권 금액','회당 금액','순결제','사용 금액','미사용','미납'],result.passes.map(row=>[row.name,sessions(row.chargedUnits),sessions(row.usedUnits),sessions(row.remainingUnits),money(row.amount),new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format(row.rate)+'원',money(row.netPaid),money(row.usedAmount),money(row.unusedAmount),money(row.unpaid)])));
 for(const select of document.querySelectorAll('[data-pass-select]')){const previous=select.value;selectOptions(select,baseOptions(),previous||((C.active(state.passes).length===1)?C.active(state.passes)[0].id:''))}
 selectOptions(deduction.elements.lessonId,[['','날짜로 과거 수강 등록'],...S.lessons().map(row=>[row.lesson_id,[row.lesson_date,row.lesson_start,row.lesson_label||row.lesson_id.slice(0,8),statusLabels[row.lesson_status]].filter(Boolean).join(' · ')])]);
 $('#pass-list').replaceChildren(table(['레슨권','총 횟수','금액','선생님','유효기간','관리'],C.active(state.passes).map(row=>[row.name,sessions(row.totalUnits),money(row.amount),row.teacher,row.expires,button('수정',()=>edit('pass',row))])));
 $('#payment-list').replaceChildren(table(['날짜','레슨권','유형','금액','방법','메모','관리'],newestFirst(state.payments).map(row=>[row.date,passName(row.passId),(row.voidedAt?'취소됨 · ':'')+(row.kind==='refund'?'환불':'결제'),money(row.amount),row.method,row.memo,rowActions('payments','payment',row)])));
 $('#deduction-list').replaceChildren(table(['날짜','시간','레슨권','상태','차감','메모','관리'],newestFirst(state.deductions).map(row=>[row.date,[row.start,row.end].filter(Boolean).join('–'),passName(row.passId),(row.voidedAt?'취소됨 · ':'')+statusLabels[row.status],sessions(row.units),row.memo,rowActions('deductions','deduction',row)])));
 $('#adjustment-list').replaceChildren(table(['날짜','레슨권','횟수 증감','금액 증감','사유','관리'],newestFirst(state.adjustments).map(row=>[row.date,passName(row.passId),sessions(row.unitsDelta),money(row.amountDelta),(row.voidedAt?'취소됨 · ':'')+row.memo,rowActions('adjustments',null,row)])));
 renderBatches();renderAudit();
 window.VzipBillingPending?.render({state,lessons:S.lessons(),C,today:today(),app:pendingApp});
}
const pendingApp={
 persist:(command,message)=>persist(command,null,message).catch(()=>{}),
 notify,show:id=>show(id),
 edit:row=>edit('deduction',row),
 prefill:id=>{show('attendance');deduction.elements.lessonId.value=id;deduction.elements.lessonId.dispatchEvent(new Event('change'));deduction.scrollIntoView({block:'start'})}
};
function show(id){for(const section of document.querySelectorAll('main>section'))section.hidden=section.id!==id;for(const tab of document.querySelectorAll('[data-panel]'))tab.setAttribute('aria-pressed',String(tab.dataset.panel===id))}
for(const tab of document.querySelectorAll('[data-panel]'))tab.onclick=()=>show(tab.dataset.panel);
function renderAudit(){
 const rows=state.history.slice().reverse(),host=$('#audit-list');host.replaceChildren();
 for(const row of rows.slice(0,auditLimit)){const details=el('details',undefined,'audit'),summary=el('summary',row.at+' · '+row.action+' · '+row.entityId.slice(0,8));details.append(summary,el('pre',JSON.stringify({before:row.before,after:row.after},null,2)));host.append(details)}
 if(!rows.length)host.append(el('p','변경 이력이 없어요.','empty'));
 if(rows.length>auditLimit)host.append(button('이력 100개 더 보기',()=>{auditLimit+=100;renderAudit()}));
}
function renderBatches(){
 $('#batch-list').replaceChildren(table(['파일','업로드일','유형','성공/실패/중복 의심','작업 ID','관리'],state.imports.slice().reverse().map(batch=>{
 const details=el('details');details.append(el('summary','행별 결과'));
 const rows=state.importRows.filter(row=>row.batchId===batch.id);details.append(el('pre',rows.map(row=>row.sourceRow+'행 · '+row.status+(row.errors?.length?' · '+row.errors.join(', '):'')).join('\n')));
 const controls=el('div');controls.append(details);if(batch.status==='applied')controls.append(button('이 업로드 되돌리기',async()=>{if(!await window.VzipBillingDialog.ask({title:'업로드를 되돌릴까요?',message:'이 업로드로 새로 만든 '+batch.success+'행만 취소해요. 이후 수정되거나 다른 기록과 연결된 경우에는 안전을 위해 되돌리지 않아요.',ok:'되돌리기',cancel:'닫기',danger:true}))return;try{await persist({type:'import.undo',payload:{id:batch.id}},null,'업로드를 되돌렸어요.')}catch{}}));else controls.append(el('span','되돌림 완료'));
 return [batch.fileName,batch.at,batch.kind==='payment'?'결제':'수강',batch.success+' / '+batch.failed+' / '+batch.duplicates,batch.id,controls];
 })));
}
$('#reload').onclick=async()=>{try{state=await S.load();render();notify('정산 데이터를 다시 불러왔어요. 작성 중인 입력은 확인 후 저장해 주세요.')}catch(error){notify(error.message,true)}};
$('#export').onclick=()=>{if(!state)return;const url=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'})),link=el('a');link.href=url;link.download='vocalzip-billing-'+today()+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
let channel=null;try{channel=new BroadcastChannel('vocalzip-billing');channel.onmessage=event=>{if(event.data.owner===state?.owner&&event.data.revision!==state.revision)notify('다른 정산 탭에서 변경했어요. 다시 불러오기를 눌러 확인해 주세요.',true)}}catch{}
window.addEventListener('billing:account-changed',()=>{notify('로그인 계정이 변경됐어요. 이 화면을 새로고침해 주세요.',true);document.querySelectorAll('form button[type=submit],#commit-import').forEach(button=>button.disabled=true)});
// Import mapping and review
function clearPreview(){draftRows=[];settings=null;$('#import-preview').hidden=true;$('#commit-import').disabled=true}
function mappingUI(){
 clearPreview();const host=$('#mapping');host.replaceChildren();if(!sourceRows.length)return;
 const kind=$('#import-kind').value,headers=sourceRows[0].map(String),mapping=I.autoMap(headers,kind),grid=el('div',undefined,'mapping-grid');
 for(const key of Object.keys(I.fields[kind])){const label=el('label',I.labels[key]),select=el('select');select.dataset.mapping=key;selectOptions(select,[['-1','사용 안 함'],...headers.map((text,index)=>[String(index),text||'빈 머리글 '+(index+1)])],String(mapping[key]));label.append(select);grid.append(label)}
 host.append(el('p','첫 행을 머리글로 읽었습니다. 날짜·금액·횟수·수강생 매핑을 확인하세요.','help'),grid);$('#preview-import').disabled=false;
}
async function loadSheet(){const run=++parseRun;clearPreview();$('#preview-import').disabled=true;try{const rows=await workbook.readSheet(Number($('#import-sheet').value||0));if(run!==parseRun)return;sourceRows=rows;mappingUI();notify((sourceRows.length-1)+'행을 읽었어요. 아직 등록하지 않았습니다.')}catch(error){if(run!==parseRun)return;sourceRows=[];$('#mapping').replaceChildren();notify(error.message,true)}}
$('#import-file').onchange=async event=>{const files=[...(event.target.files||[])];
 if(!files.length)return;clearPreview();$('#preview-import').disabled=true;event.target.disabled=true;
 try{
  if(files.length===1){fileName=files[0].name;workbook=await F.open(files[0],$('#import-encoding').value);$('#import-sheet').disabled=false;selectOptions($('#import-sheet'),workbook.sheets.map((name,index)=>[String(index),name]),'0');await loadSheet();return}
  // Several files (e.g. one Notion CSV per month): read each first sheet and stack the rows,
  // matching columns by header name and keeping the source file name on every row.
  const books=[];for(const file of files)books.push({name:file.name,book:await F.open(file,$('#import-encoding').value)});
  const tables=[];for(const item of books)tables.push({name:item.name,rows:await item.book.readSheet(0)});
  const key=text=>String(text??'').replace(/\s+/g,'').toLowerCase(),header=[],index=new Map();
  for(const table of tables)for(const cell of table.rows[0]||[]){const k=key(cell);if(k&&!index.has(k)){index.set(k,header.length);header.push(String(cell).trim())}}
  header.push('원본 파일');const fileColumn=header.length-1,rows=[header];
  for(const table of tables){const map=(table.rows[0]||[]).map(cell=>index.get(key(cell)));for(const source of table.rows.slice(1)){if(!source.some(cell=>String(cell??'').trim()))continue;const row=new Array(header.length).fill('');source.forEach((cell,i)=>{if(map[i]!=null)row[map[i]]=cell});row[fileColumn]=table.name;rows.push(row)}}
  if(rows.length-1>2000)throw Error('여러 파일을 합쳐 최대 2,000행까지 가져올 수 있어요. 파일을 나눠서 올려 주세요.');
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(books.map(item=>item.book.hash).join(':')));
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  fileName=files.length+'개 파일 · '+files.map(file=>file.name).join(', ').slice(0,180);
  workbook={sheets:[files.length+'개 파일 합침'],date1904:books[0].book.date1904,hash,readSheet:async()=>rows};
  selectOptions($('#import-sheet'),[['0',workbook.sheets[0]]],'0');$('#import-sheet').disabled=true;
  await loadSheet();notify(files.length+'개 파일에서 '+(rows.length-1)+'행을 합쳤어요. 아직 등록하지 않았습니다.');
 }catch(error){workbook=null;sourceRows=[];$('#mapping').replaceChildren();notify(error.message,true)}finally{event.target.disabled=false}};
$('#import-encoding').onchange=()=>{if($('#import-file').files?.length)$('#import-file').dispatchEvent(new Event('change'))};
$('#import-sheet').onchange=()=>{if(workbook)loadSheet()};
$('#import-kind').onchange=()=>{if(sourceRows.length)mappingUI();$('#import-mode').disabled=$('#import-kind').value!=='payment'};
for(const id of ['import-pass','import-mode'])$('#'+id).onchange=clearPreview;
$('#preview-import').onclick=()=>{
 if(!state||sourceRows.length<2){notify('등록할 데이터 행이 없어요.',true);return}
 const mapping=Object.fromEntries([...document.querySelectorAll('[data-mapping]')].map(select=>[select.dataset.mapping,Number(select.value)]));
 settings={kind:$('#import-kind').value,mode:$('#import-mode').value,passId:$('#import-pass').value,hash:workbook.hash,sheet:$('#import-sheet').value,date1904:workbook.date1904,batchId:crypto.randomUUID()};
 draftRows=I.drafts(sourceRows,mapping,settings,state);const checked=I.inspect(draftRows,settings,state,S.lessons());draftRows.forEach((row,index)=>row.selected=!checked[index].errors.length&&!checked[index].suspected);
 page=0;for(const id of ['confirm-attendance','confirm-duplicates','confirm-overdraw'])$('#'+id).checked=false;$('#import-preview').hidden=false;renderPreview();
};
function inspected(){return settings?I.inspect(draftRows,settings,state,S.lessons()):[]}
function editCell(row,key,type='text',options){
 const input=el(options?'select':'input');if(options)selectOptions(input,options,String(row[key]??''));else{input.type=type;if(type==='date'||key==='date')window.VzipBillingDate.enhance(input);input.value=row[key]??''}
 input.setAttribute('aria-label',row.sourceRow+'행 '+(I.labels[key]||key));input.onchange=()=>{
  const target=draftRows.find(item=>item.sourceRow===row.sourceRow);target[key]=input.value;
  if(key==='status')target.units=input.value==='completed'?'1':'0';
  if(key==='passId'){target.newPass=input.value==='__new__';if(target.newPass)target.passId=''}
  renderPreview();
 };return input;
}
function renderPreview(){
 if(!settings)return;const checked=inspected(),host=$('#preview-rows'),slice=checked.slice(page*20,(page+1)*20);
 const rows=slice.map(row=>{
  const draft=draftRows.find(item=>item.sourceRow===row.sourceRow),box=el('input');box.type='checkbox';box.className='row-select';box.setAttribute('aria-label',row.sourceRow+'行 선택'.replace('行','행'));box.checked=draft.selected&&!row.errors.length;box.disabled=!!row.errors.length;
  box.onchange=()=>{draft.selected=box.checked;updateImportSummary()};
  const connection=el('div');const select=editCell({...draft,passId:draft.newPass?'__new__':draft.passId},'passId','text',[...baseOptions(),...(settings.kind==='payment'?[['__new__','새 레슨권 생성']]:[])]);connection.append(select);
  if(draft.newPass){connection.append(editCell(draft,'passName'),editCell(draft,'charged'),editCell(draft,'passAmount'));connection.append(el('small','이름 / 총 횟수 / 레슨권 금액 (빈 값은 결제금액)','muted'))}
  const detail=el('div');
  if(settings.kind==='payment')detail.append(editCell(draft,'kind','text',[['payment','결제'],['refund','환불']]),editCell(draft,'amount'));
  else detail.append(editCell(draft,'status','text',Object.entries(statusLabels)),editCell(draft,'units'),editCell(draft,'start'),editCell(draft,'end'));
  const checks=el('div');for(const error of row.errors)checks.append(el('p',error,'error'));for(const warning of row.warnings)checks.append(el('p',warning,'warning'));if(!row.errors.length&&!row.warnings.length)checks.append(el('span','정상'));
  return [box,row.sourceRow,editCell(draft,'date'),connection,detail,editCell(draft,'memo'),row.student||'',checks];
 });
 host.replaceChildren(table(['선택','행','날짜','레슨권','금액 / 상태·차감','메모','수강생','검증'],rows));
 $('#page-label').textContent=(page+1)+' / '+Math.max(1,Math.ceil(checked.length/20));$('#page-prev').disabled=page===0;$('#page-next').disabled=(page+1)*20>=checked.length;updateImportSummary();
}
function plan(){
 const all=inspected(),selected=all.filter(row=>row.selected&&!row.errors.length),skipped=all.filter(row=>!row.selected||row.errors.length);
 return {type:'import.commit',payload:{batchId:settings.batchId,fileName,fileHash:settings.hash,kind:settings.kind,
  rows:selected.map(row=>({sourceRow:row.sourceRow,raw:row.raw,sourceKey:row.sourceKey,suspected:row.suspected,data:row.data,newPass:row.newPass})),
  otherRows:skipped.map(row=>({sourceRow:row.sourceRow,raw:row.raw,errors:row.errors,warnings:row.warnings})),
  failed:all.filter(row=>row.errors.length).length,duplicates:all.filter(row=>row.suspected).length,skipped:skipped.filter(row=>!row.errors.length).length},
  options:{allowDuplicate:$('#confirm-duplicates').checked,allowOverdraw:$('#confirm-overdraw').checked}};
}
function updateImportSummary(){
 if(!settings||!state)return;const rows=inspected(),selected=rows.filter(row=>row.selected&&!row.errors.length);
 $('#import-summary').textContent='전체 '+rows.length+'행 · 선택 '+selected.length+'행 · 오류 '+rows.filter(row=>row.errors.length).length+'행 · 중복 의심 '+rows.filter(row=>row.suspected).length+'행';
 try{
  if(!selected.length)throw Error('등록할 정상 행을 선택해 주세요.');
  let seq=0;const next=C.reduce(state,plan(),{uid:()=>('preview-'+seq++)}),before=C.totals(state).total,after=C.totals(next).total;
  $('#reconciliation').textContent='등록 전 → 등록 후\n잔여 '+sessions(before.remainingUnits)+' → '+sessions(after.remainingUnits)+'\n순결제 '+money(before.netPaid)+' → '+money(after.netPaid)+'\n사용 금액 '+money(before.usedAmount)+' → '+money(after.usedAmount)+'\n미납 '+money(before.unpaid)+' → '+money(after.unpaid);
  $('#commit-import').disabled=pending||!$('#confirm-attendance').checked;
 }catch(error){$('#reconciliation').textContent=error.message;$('#commit-import').disabled=true}
}
$('#select-valid').onclick=()=>{const rows=inspected();draftRows.forEach((row,index)=>row.selected=!rows[index].errors.length&&!rows[index].suspected);renderPreview()};
$('#select-none').onclick=()=>{draftRows.forEach(row=>row.selected=false);renderPreview()};
$('#remap').onclick=clearPreview;$('#page-prev').onclick=()=>{page--;renderPreview()};$('#page-next').onclick=()=>{page++;renderPreview()};
for(const id of ['confirm-attendance','confirm-duplicates','confirm-overdraw'])$('#'+id).onchange=updateImportSummary;
$('#commit-import').onclick=async()=>{
 if(!settings||!$('#confirm-attendance').checked)return;
 try{const command=plan();if(!command.payload.rows.length)return;
  await persist(command,()=>{clearPreview();workbook=null;sourceRows=[];$('#import-file').value='';$('#mapping').replaceChildren();$('#preview-import').disabled=true},
   '일괄 등록 완료 · '+command.payload.rows.length+'행. 정산 현황과 업로드 이력에서 합계를 확인해 주세요.');
 }catch(error){notify(error.message,true)}
};
window.addEventListener('billing:replaced',()=>{S.load().then(data=>{state=data;for(const form of Object.values(forms))resetForm(form);clearPreview();render();channel?.postMessage({owner:state.owner,revision:state.revision})}).catch(error=>notify(error.message,true))});
$('#account-label').textContent=S.account.label+' · 정산 전용 저장소';
S.load().then(data=>{state=data;render();notify('정산 데이터를 불러왔어요.')}).catch(error=>notify('불러오기 실패: '+error.message,true));
})();
