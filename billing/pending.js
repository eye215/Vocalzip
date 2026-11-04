/* Project B: lessons from the main app that still need a settlement decision.
 * Reads lesson_id/lesson_date/lesson_status only; never writes app lesson data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBillingPending=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const activeRows=rows=>rows.filter(row=>!row.voidedAt);

/** Split app lessons into: completed without a deduction (toDeduct), status-less legacy
 * lessons without a deduction (toConfirm), and active charged deductions whose lesson is
 * now scheduled/cancelled in the app (toRestore). Future lessons are never pending. */
function classify(lessons,state,today){
 const deductions=activeRows(state.deductions||[]),byLesson=new Map();
 for(const row of deductions)if(row.lessonId)byLesson.set(row.lessonId,row);
 const toDeduct=[],toConfirm=[],toRestore=[];
 for(const lesson of lessons){
  const id=lesson.lesson_id,existing=byLesson.get(id),date=lesson.lesson_date||'';
  if(existing){
   // Only plain completed charges; a manual same-day-cancel (noshow) charge is intentional.
   if(existing.status==='completed'&&existing.units>0&&['scheduled','cancelled'].includes(lesson.lesson_status))toRestore.push({lesson,deduction:existing});
   continue;
  }
  if(!date||date>today)continue;
  if(lesson.lesson_status==='completed')toDeduct.push(lesson);
  else if(lesson.lesson_status==='unconfirmed')toConfirm.push(lesson);
 }
 const order=(a,b)=>(a.lesson_date||'').localeCompare(b.lesson_date||'')||(a.lesson_start||'').localeCompare(b.lesson_start||'');
 toDeduct.sort(order);toConfirm.sort(order);
 return {toDeduct,toConfirm,toRestore};
}

/** First-registered active pass that still has at least one full session left (FIFO). */
function defaultPass(state,balances){
 const remaining=new Map(balances.passes.map(row=>[row.id,row.remainingUnits]));
 const passes=activeRows(state.passes||[]).slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 return passes.find(pass=>(remaining.get(pass.id)||0)>=100)?.id||'';
}

function deductionFor(lesson,passId,{status='completed',units=100}={}){
 return {type:'deduction.save',payload:{passId,lessonId:lesson.lesson_id,date:lesson.lesson_date,status,units,start:lesson.lesson_start||'',end:lesson.lesson_end||'',memo:''}};
}

/* ---------- browser UI ---------- */
let chosenPass='';
function render(ctx){
 if(typeof document==='undefined')return;
 const {state,lessons,C,today,app}=ctx,host=document.querySelector('#pending-lessons'),summary=document.querySelector('#pending-summary');
 if(!host||!state)return;
 const balances=C.totals(state),groups=classify(lessons,state,today),passes=activeRows(state.passes);
 if(!passes.some(pass=>pass.id===chosenPass))chosenPass=defaultPass(state,balances);
 const count=groups.toDeduct.length+groups.toConfirm.length+groups.toRestore.length;
 if(summary){
  summary.replaceChildren();
  if(count){
   const p=document.createElement('p');p.className='pending-summary';
   p.textContent='앱 레슨 정산 대기 '+count+'건 (차감 '+groups.toDeduct.length+' · 확인 필요 '+groups.toConfirm.length+' · 복구 확인 '+groups.toRestore.length+') ';
   const go=document.createElement('button');go.type='button';go.textContent='수강·조정에서 처리';go.onclick=()=>app.show('attendance');
   p.append(go);summary.append(p);
  }
 }
 host.replaceChildren();
 const box=document.createElement('div');box.className='card pending';
 const h=document.createElement('h3');h.textContent='앱 레슨 정산 대기';box.append(h);
 if(!count){const p=document.createElement('p');p.className='help';p.textContent='정산할 앱 레슨이 없어요. 앱에서 완료한 레슨이 여기에 표시돼요.';box.append(p);host.append(box);return}
 const help=document.createElement('p');help.className='help';
 help.textContent='앱에서 완료한 레슨은 기본 1회 차감해요. 상태가 없는 기존 레슨은 실제 수강 여부를 확인해 주세요. 앱의 레슨 기록은 바뀌지 않아요.';box.append(help);
 const label=document.createElement('label');label.textContent='차감할 레슨권';
 const select=document.createElement('select');select.name='pendingPass';
 select.append(new Option(passes.length?'레슨권 선택':'먼저 레슨권을 등록해 주세요',''));
 const remain=new Map(balances.passes.map(row=>[row.id,row.remainingUnits]));
 for(const pass of passes)select.append(new Option(pass.name+' · 잔여 '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format((remain.get(pass.id)||0)/100)+'회',pass.id));
 select.value=chosenPass;select.onchange=()=>{chosenPass=select.value};label.append(select);box.append(label);
 const need=()=>{if(!chosenPass){app.notify('차감할 레슨권을 선택해 주세요.',true);select.focus();return false}return true};
 const lessonText=lesson=>[lesson.lesson_date,[lesson.lesson_start,lesson.lesson_end].filter(Boolean).join('–'),lesson.lesson_label].filter(Boolean).join(' · ');
 const list=(title,rows,actions)=>{
  if(!rows.length)return;
  const sub=document.createElement('h4');sub.textContent=title+' '+rows.length+'건';box.append(sub);
  const ul=document.createElement('ul');ul.className='pending-list';
  for(const row of rows){const li=document.createElement('li'),text=document.createElement('span');text.textContent=lessonText(row.lesson||row);const act=document.createElement('div');act.className='actions';
   for(const [name,fn] of actions(row)){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;act.append(b)}
   li.append(text,act);ul.append(li)}
  box.append(ul);
 };
 list('완료 · 차감 대기',groups.toDeduct,lesson=>[['1회 차감',()=>need()&&app.persist(deductionFor(lesson,chosenPass),lesson.lesson_date+' 레슨을 1회 차감했어요.')],['직접 입력',()=>app.prefill(lesson.lesson_id)]]);
 list('상태 없음 · 수강 확인',groups.toConfirm,lesson=>[['수강함 · 1회 차감',()=>need()&&app.persist(deductionFor(lesson,chosenPass),lesson.lesson_date+' 레슨을 수강으로 확인하고 1회 차감했어요.')],['수강 안 함 · 0회',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{status:'cancelled',units:0}),lesson.lesson_date+' 레슨을 차감 없이 기록했어요.')],['직접 입력',()=>app.prefill(lesson.lesson_id)]]);
 list('앱에서 취소·예정으로 바뀐 차감',groups.toRestore,({lesson,deduction})=>[['차감 취소(복구)',()=>{if(confirm(lesson.lesson_date+' 레슨의 차감을 취소할까요? 변경 이력은 보존됩니다.'))app.persist({type:'entity.void',payload:{collection:'deductions',id:deduction.id,expectedVersion:deduction.version}},'차감을 취소했어요.')}],['당일 취소 등으로 수정',()=>app.edit(deduction)]]);
 host.append(box);
 if(passes.length&&!chosenPass){const warn=document.createElement('p');warn.className='help error';warn.textContent='잔여 1회 이상인 레슨권이 없어요. 새 레슨권을 등록하거나 직접 선택해 주세요.';box.insertBefore(warn,box.querySelector('h4'))}
}
return {classify,defaultPass,deductionFor,render};
});
