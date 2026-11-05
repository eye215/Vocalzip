/* Project B: lessons from the main app that still need a settlement decision.
 * Reads lesson_id/lesson_date/lesson_status only; never writes app lesson data. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBillingPending=api})(typeof globalThis!=='undefined'?globalThis:this,()=>{
'use strict';
const activeRows=rows=>rows.filter(row=>!row.voidedAt);

/** Split app lessons into: completed without a deduction (toDeduct), status-less legacy
 * lessons without a deduction (toConfirm), and active charged deductions whose lesson is
 * now scheduled/cancelled in the app (toRestore). Future lessons are never pending. */
function classify(lessons,state,today){
 const deductions=activeRows(state.deductions||[]),byLesson=new Map(),activeIds=new Set(deductions.map(row=>row.id));
 for(const row of deductions)if(row.lessonId)byLesson.set(row.lessonId,row);
 const toDeduct=[],toConfirm=[],toRestore=[];
 for(const lesson of lessons){
  const id=lesson.lesson_id,existing=byLesson.get(id),date=lesson.lesson_date||'';
  // A lesson the app created from this ledger's own attendance record is settled by that record. If the record is gone
  // (deleted, or the ledger was rebuilt), it is still not asked again: deducting it would count the same lesson twice.
  if(lesson.billing_deduction_id)continue;
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

/** Pass for a new deduction. With an hourly rate (hourly = VzipBilling.hourlyTotals(state)) lessons left come from
 * payments, so: the pass of the latest payment while at least one paid session is left. Otherwise the
 * first-registered active pass that still has at least one full session left (FIFO). */
function defaultPass(state,balances,hourly){
 if(state.hourlyRate&&hourly){
  if(hourly.remainingUnits<100)return '';
  const live=activeRows(state.passes||[]),ids=new Set(live.map(pass=>pass.id));
  const paid=activeRows(state.payments||[]).filter(row=>row.kind==='payment'&&ids.has(row.passId)).sort((a,b)=>String(a.date||'').localeCompare(String(b.date||''))||String(a.createdAt||'').localeCompare(String(b.createdAt||''))).at(-1);
  return paid?.passId||live.slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||''))).at(-1)?.id||'';
 }
 const remaining=new Map(balances.passes.map(row=>[row.id,row.remainingUnits]));
 const passes=activeRows(state.passes||[]).slice().sort((a,b)=>String(a.createdAt||'').localeCompare(String(b.createdAt||'')));
 return passes.find(pass=>(remaining.get(pass.id)||0)>=100)?.id||'';
}

function deductionFor(lesson,passId,{status='completed',units=100}={}){
 return {type:'deduction.save',payload:{passId,lessonId:lesson.lesson_id,date:lesson.lesson_date,status,units,start:lesson.lesson_start||'',end:lesson.lesson_end||'',memo:''}};
}

/** Lessons to deduct automatically: completed in the app after auto-deduction was turned on (and dated at most a
 * week before that), with no attendance record of any kind on that date (a date-only record may be the same lesson,
 * so that stays a manual decision). Units follow the lesson's own time: 1 hour = 1회, 2 hours = 2회 (default 1회). */
function unitsFor(lesson){
 const m=t=>/^\d{2}:\d{2}$/.test(t||'')?Number(t.slice(0,2))*60+Number(t.slice(3)):null,a=m(lesson.lesson_start),b=m(lesson.lesson_end);
 if(a===null||b===null||b<=a)return 100;
 return Math.max(50,Math.round((b-a)/30)*50);
}
function autoCandidates(lessons,state,today,since){
 const d=new Date(since-7*86400000),from=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 const dated=new Set(activeRows(state.deductions||[]).map(row=>row.date));
  // A lesson whose deduction was deleted in billing was undone on purpose: it waits in 정산 대기, never re-deducted automatically.
 const undone=new Set((state.deductions||[]).filter(row=>row.voidedAt&&row.lessonId).map(row=>row.lessonId));
 // Lessons the app made from a ledger record that was later deleted: also an undo, never re-deducted.
 const voided=new Set((state.deductions||[]).filter(row=>row.voidedAt).map(row=>row.id));
 return classify(lessons,state,today).toDeduct.filter(l=>!undone.has(l.lesson_id)&&!voided.has(l.billing_deduction_id)&&(l.lesson_date||'')>=from&&(Number(l.lesson_touched)||0)>=since&&!dated.has(l.lesson_date)).map(lesson=>({lesson,units:unitsFor(lesson)}));
}

/* ---------- browser UI ---------- */
let chosenPass='';
function render(ctx){
 if(typeof document==='undefined')return;
 const {state,lessons,C,today,app}=ctx,host=document.querySelector('#pending-lessons'),summary=document.querySelector('#pending-summary');
 if(!host||!state)return;
 const balances=C.totals(state),groups=classify(lessons,state,today),passes=activeRows(state.passes);
 if(!passes.some(pass=>pass.id===chosenPass))chosenPass=defaultPass(state,balances,C.hourlyTotals?.(state));
 const count=groups.toDeduct.length+groups.toConfirm.length+groups.toRestore.length;
 if(summary){
  summary.replaceChildren();
  if(count){
   const p=document.createElement('p');p.className='pending-summary';
   p.textContent='앱 레슨 정산 대기 '+count+'건 · '+[['차감',groups.toDeduct.length],['수강 확인',groups.toConfirm.length],['복구 확인',groups.toRestore.length]].filter(x=>x[1]).map(x=>x[0]+' '+x[1]).join(' · ')+' ';
   const go=document.createElement('button');go.type='button';go.textContent='수강·조정에서 처리';go.onclick=()=>app.show('attendance');
   p.append(go);summary.append(p);
  }
 }
 host.replaceChildren();
 const box=document.createElement('div');box.className='card pending';
 const h=document.createElement('h3');h.textContent='앱 레슨 정산 대기';box.append(h);
 if(ctx.auto){
  const row=document.createElement('label');row.className='check auto-deduct';const input=document.createElement('input');input.type='checkbox';input.checked=!!ctx.auto.on;input.id='auto-deduct';
  const d=new Date(ctx.auto.since);row.append(input,document.createTextNode('앱에서 완료한 레슨은 자동으로 차감 ('+(d.getMonth()+1)+'/'+d.getDate()+' 이후 완료한 레슨부터 · 1시간 = 1회)'));
  input.onchange=()=>ctx.auto.set(input.checked);box.append(row);
 }
 if(!count){const p=document.createElement('p');p.className='help';p.textContent='정산할 앱 레슨이 없어요. 앱에서 완료한 레슨이 여기에 표시돼요.';box.append(p);host.append(box);return}
 const help=document.createElement('p');help.className='help';
 help.textContent='차감 1회는 레슨 1시간이에요. 실제 수강 시간(0·1·2시간)을 선택해 주세요. 앱 레슨 기록 자체는 변경하지 않아요.';box.append(help);
 const label=document.createElement('label');label.textContent='차감할 레슨권';
 const select=document.createElement('select');select.name='pendingPass';
 select.append(new Option(passes.length?'레슨권 선택':'먼저 레슨권을 등록해 주세요',''));
 const remain=new Map(balances.passes.map(row=>[row.id,row.remainingUnits]));
 for(const pass of passes)select.append(new Option(pass.name+' · 잔여 '+new Intl.NumberFormat('ko-KR',{maximumFractionDigits:2}).format((remain.get(pass.id)||0)/100)+'회',pass.id));
 select.value=chosenPass;select.onchange=()=>{chosenPass=select.value};label.append(select);box.append(label);
 const need=()=>{if(!chosenPass){app.notify('차감할 레슨권을 선택해 주세요.',true);select.focus();return false}return true};
 const lessonText=lesson=>[window.VzipBillingDate?.show(lesson.lesson_date)||lesson.lesson_date,[lesson.lesson_start,lesson.lesson_end].filter(Boolean).join('–'),lesson.lesson_label].filter(Boolean).join(' · ');
 const list=(title,rows,actions)=>{
  if(!rows.length)return;
  const sub=document.createElement('h4');sub.textContent=title+' '+rows.length+'건';box.append(sub);
  const ul=document.createElement('ul');ul.className='pending-list';
  for(const row of rows){const li=document.createElement('li'),text=document.createElement('span');text.textContent=lessonText(row.lesson||row);const act=document.createElement('div');act.className='actions';
   for(const [name,fn] of actions(row)){const b=document.createElement('button');b.type='button';b.textContent=name;b.onclick=fn;act.append(b)}
   li.append(text,act);ul.append(li)}
  box.append(ul);
 };
 if(groups.toDeduct.length>1){
  const bulk=document.createElement('button');bulk.type='button';bulk.className='pending-bulk';bulk.textContent='완료 레슨 '+groups.toDeduct.length+'건 모두 1시간 차감';
  bulk.onclick=async()=>{
   if(!need())return;
   const rows=groups.toDeduct.slice(),pass=passes.find(p=>p.id===chosenPass);
   if(!await window.VzipBillingDialog.ask({title:rows.length+'건을 1시간씩 차감할까요?',message:(pass?pass.name:'선택한 레슨권')+'에서 '+rows.length+'시간이 차감돼요. 2시간·보강 레슨이 섞여 있다면 그 레슨만 먼저 처리한 뒤 사용해 주세요. 차감은 나중에 개별 취소할 수 있어요.',ok:rows.length+'건 차감',cancel:'닫기'}))return;
   for(const lesson of rows)await app.persist(deductionFor(lesson,chosenPass,{units:100}),lesson.lesson_date+' 1시간 차감');
  };
  box.append(bulk);
 }
 list('완료 · 차감 대기',groups.toDeduct,lesson=>[['1시간',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{units:100}),lesson.lesson_date+' 1시간 차감')],['2시간',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{units:200}),lesson.lesson_date+' 2시간 차감')],['0시간(보강)',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{units:0}),lesson.lesson_date+' 0시간 차감')],['직접 입력',()=>app.prefill(lesson.lesson_id)]]);
 list('상태 없음 · 수강 확인',groups.toConfirm,lesson=>[['1시간 수강',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{units:100}),lesson.lesson_date+' 1시간 차감')],['2시간 수강',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{units:200}),lesson.lesson_date+' 2시간 차감')],['수강 안 함 · 0회',()=>need()&&app.persist(deductionFor(lesson,chosenPass,{status:'cancelled',units:0}),lesson.lesson_date+' 레슨을 차감 없이 기록했어요.')],['직접 입력',()=>app.prefill(lesson.lesson_id)]]);
 list('앱에서 취소·예정으로 바뀐 차감',groups.toRestore,({lesson,deduction})=>[['차감 취소(복구)',async()=>{if(await window.VzipBillingDialog.ask({title:'차감을 취소할까요?',message:lesson.lesson_date+' 레슨이 앱에서 취소·예정으로 바뀌었어요. 차감을 취소하면 기록한 시간만큼 복구돼요. 변경 이력은 남아요.',ok:'차감 취소',cancel:'닫기',danger:true}))app.persist({type:'entity.void',payload:{collection:'deductions',id:deduction.id,expectedVersion:deduction.version}},'차감을 취소했어요.')}],['당일 취소 등으로 수정',()=>app.edit(deduction)]]);
 host.append(box);
 if(passes.length&&!chosenPass){const warn=document.createElement('p');warn.className='help error';warn.textContent='잔여 1회 이상인 레슨권이 없어요. 새 레슨권을 등록하거나 직접 선택해 주세요.';box.insertBefore(warn,box.querySelector('h4'))}
}
return {classify,defaultPass,deductionFor,autoCandidates,unitsFor,render};
});
