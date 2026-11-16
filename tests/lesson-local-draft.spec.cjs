const {test,expect}=require('@playwright/test');
const {A,B,setup,feedback,schedule,close,drafts}=require('./helpers/lesson-local-draft.cjs');
const receiptState=page=>page.evaluate(()=>{
 const s=VzipAccountScope.storage,key='vzip_lesson_draft_receipts_v1:'+VzipAccountScope.owner;
 return JSON.parse(s.getItem(key)||'{"pending":{},"done":{}}');
});
test.afterEach(async({page})=>expect(page.__draftErrors||[]).toEqual([]));

test('leaving feedback preserves separate drafts and offers explicit restoration',async({page})=>{
 await setup(page);await feedback(page);
 await page.locator('[name=feedback]').fill('초안 피드백');await page.locator('[name=memo]').fill('초안 메모');
 await close(page);await feedback(page);
 await expect(page.locator('[data-lesson-draft=feedback]')).toContainText('저장 안 된 초안이 있어요 ·');
 await expect(page.locator('[name=feedback]')).toHaveValue('확정 피드백');
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=feedback] button').click();
 await expect(page.locator('[name=feedback]')).toHaveValue('초안 피드백');
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();
 await expect(page.locator('[name=memo]')).toHaveValue('초안 메모');
 await expect(page.locator('[name=song_song-test]')).toHaveValue('곡별 확정 피드백');
 expect((await drafts(page)).filter(r=>r.text==='초안 피드백'||r.text==='초안 메모')).toHaveLength(4);
 expect(await page.evaluate(()=>VZ.db.lessons[0].feedback)).toBe('확정 피드백');
});

test('server acknowledgement completes the submitted revisions without deleting draft text',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('확정할 새 메모');
 await page.locator('button[form=fb-form]').click();
 expect(Object.keys((await receiptState(page)).pending)).toHaveLength(1);
 await expect.poll(async()=>Object.keys((await receiptState(page)).pending).length).toBe(0);
 expect((await drafts(page)).some(r=>r.text==='확정할 새 메모')).toBe(true);
 await feedback(page);await expect(page.locator('[name=memo]')).toHaveValue('확정할 새 메모');
 await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
 await page.reload();await feedback(page);await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
});

test('a failed local final save leaves both input and durable draft intact',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('저장 실패 복구 메모');
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k.endsWith(':vocal-zip_mvp_v1'))throw new DOMException('fake quota','QuotaExceededError');return original.call(this,k,v);};
 });
 await page.locator('button[form=fb-form]').click();
 await expect(page.locator('#fb-form [name=memo]')).toHaveValue('저장 실패 복구 메모');
 expect(await page.evaluate(()=>VZ.db.lessons.find(l=>l.id==='lesson-test-a').memo)).toBe('확정 메모');
 expect(Object.keys((await receiptState(page)).pending)).toHaveLength(0);
 expect((await drafts(page)).some(r=>r.text==='저장 실패 복구 메모')).toBe(true);
});

test('a failed server save preserves a recoverable draft across reload and completes after retry',async({page})=>{
 await setup(page);await page.evaluate(()=>window.__failServer=true);await feedback(page);
 await page.locator('[name=memo]').fill('서버 실패 복구 메모');await page.locator('button[form=fb-form]').click();
 await expect.poll(()=>page.evaluate(()=>window.__serverWrites)).toBeGreaterThan(0);
 await expect(page.locator('#cloud-status')).toContainText('동기화 실패');
 expect(Object.keys((await receiptState(page)).pending)).toHaveLength(1);
 await page.addInitScript(()=>{window.__failServer=true;});await page.reload();await feedback(page);
 await expect(page.locator('[name=memo]')).toHaveValue('서버 실패 복구 메모');
 await expect(page.locator('[data-lesson-draft=memo]')).toBeVisible();
 await close(page);
 await page.evaluate(()=>{window.__failServer=false;document.getElementById('cloud-upload').click();});
 await expect.poll(async()=>Object.keys((await receiptState(page)).pending).length).toBe(0);
 await feedback(page);await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
});

test('an older server acknowledgement cannot consume edits made after final save',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('첫 확정 메모');
 await page.locator('button[form=fb-form]').click();await feedback(page);
 await page.locator('[name=memo]').fill('그 뒤의 미저장 메모');await close(page);
 await expect.poll(async()=>Object.keys((await receiptState(page)).pending).length).toBe(0);
 await feedback(page);await expect(page.locator('[name=memo]')).toHaveValue('첫 확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();
 await expect(page.locator('[name=memo]')).toHaveValue('그 뒤의 미저장 메모');
});

test('a submission cannot consume another editor draft written after this form opened',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('내가 저장하는 메모');
 await page.evaluate(()=>{
  const other=VzipFieldDraftOutbox.create({owner:VzipAccountScope.owner,editorId:crypto.randomUUID(),sessionId:vzipCloudSessionId(),storage:VzipAccountScope.storage,
   getOwner:()=>VzipAccountScope.owner,getSessionId:()=>vzipCloudSessionId(),send:async()=>{throw Error('local only');}});
  other.start({entityId:'lesson-test-a',field:'memo'},'확정 메모');other.edit({entityId:'lesson-test-a',field:'memo'},'다른 편집기의 미확인 초안');
 });
 await page.locator('button[form=fb-form]').click();
 await expect.poll(async()=>Object.keys((await receiptState(page)).pending).length).toBe(0);
 await feedback(page);await expect(page.locator('[data-lesson-draft=memo]')).toBeVisible();
 await page.locator('[data-lesson-draft=memo] button').click();await expect(page.locator('[name=memo]')).toHaveValue('다른 편집기의 미확인 초안');
});

test('acknowledgement completes each field independently when another field changes on the server',async({page})=>{
 await setup(page);await page.evaluate(()=>window.__failServer=true);await feedback(page);
 await page.locator('[name=memo]').fill('서버 확인된 메모');await page.locator('[name=feedback]').fill('아직 서버와 다른 피드백');
 await page.locator('button[form=fb-form]').click();
 await page.evaluate(owner=>{
  const key='__draft_server_'+owner,row=JSON.parse(localStorage.getItem(key));
  row.payload.lessons[0].memo='서버 확인된 메모';row.payload.lessons[0].feedback='서버에서 달라진 피드백';localStorage.setItem(key,JSON.stringify(row));
  window.dispatchEvent(new Event('focus'));
 },A);
 await expect.poll(async()=>Object.keys((await receiptState(page)).done).length).toBe(1);
 await feedback(page);await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
 await expect(page.locator('[data-lesson-draft=feedback]')).toBeVisible();
});

test('another lesson never offers the first lesson drafts',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('A 전용 메모');await close(page);
 await page.goto('/#/lesson/lesson-test-b');await feedback(page);
 await expect(page.locator('[name=memo]')).toHaveValue('다른 메모');
 await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
 await page.locator('[name=feedback]').fill('B 전용 피드백');await close(page);
 await page.goto('/#/lesson/lesson-test-a');await feedback(page);
 await expect(page.locator('[data-lesson-draft=feedback]')).toBeHidden();
 await page.locator('[data-lesson-draft=memo] button').click();await expect(page.locator('[name=memo]')).toHaveValue('A 전용 메모');
});

test('a changed confirmed value stays visible until explicit restore and untouched fields stay current on save',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('과거 기준 초안');await close(page);
 await page.evaluate(()=>VZ.change(db=>{db.lessons[0].memo='다른 기기의 새 확정 메모';},{silent:true}));
 await feedback(page);
 await expect(page.locator('[name=memo]')).toHaveValue('다른 기기의 새 확정 메모');
 await expect(page.locator('[data-lesson-draft=memo]')).toContainText('확정 내용이 바뀌었어요');
 await page.evaluate(()=>VZ.change(db=>{db.lessons[0].feedback='화면을 연 뒤 갱신된 피드백';},{silent:true}));
 await page.locator('[data-lesson-draft=memo] button').click();await page.locator('button[form=fb-form]').click();
 expect(await page.evaluate(()=>({memo:VZ.db.lessons[0].memo,feedback:VZ.db.lessons[0].feedback}))).toEqual({memo:'과거 기준 초안',feedback:'화면을 연 뒤 갱신된 피드백'});
});

test('outbox storage failure keeps the current input and a same-account in-memory recovery copy',async({page})=>{
 await setup(page);await feedback(page);await page.evaluate(()=>{
  const original=Storage.prototype.setItem;window.__restoreStorage=()=>Storage.prototype.setItem=original;
  Storage.prototype.setItem=function(k,v){if(k.includes('vzip_field_outbox_v1:'))throw new DOMException('fake quota','QuotaExceededError');return original.call(this,k,v);};
 });
 await page.locator('[name=memo]').fill('로컬 실패 중 입력');
 await expect(page.locator('#fb-form')).toContainText('초안을 기기에 저장하지 못했어요');
 await expect(page.locator('[name=memo]')).toHaveValue('로컬 실패 중 입력');
 await close(page);await feedback(page);
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();
 await expect(page.locator('[name=memo]')).toHaveValue('로컬 실패 중 입력');
 await page.evaluate(()=>window.__restoreStorage());
 await page.locator('[name=memo]').fill('로컬 저장 복구 후 입력');
 expect((await drafts(page)).some(r=>r.text==='로컬 저장 복구 후 입력')).toBe(true);
});

test('Korean composition and lifecycle flush keep the final text without a debounce',async({page})=>{
 await setup(page);await feedback(page);
 await page.evaluate(()=>{
  const f=document.querySelector('[name=memo]');f.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  f.value='조합 중 한';f.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,inputType:'insertCompositionText'}));
  f.value='조합 중 한글';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('pagehide'));
 });
 await page.reload();await feedback(page);await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();await expect(page.locator('[name=memo]')).toHaveValue('조합 중 한글');
});

test('account switches and logout never expose or restore the former account drafts',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('계정 A 테스트 초안');
 await page.evaluate(async next=>{localStorage.setItem('__draft_user',next);await VzipAccountScope.switchTo(next);},B);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();await feedback(page);
 await expect(page.locator('[data-lesson-draft=memo]')).toBeHidden();
 await page.locator('[name=memo]').fill('계정 B 테스트 초안');
 await page.evaluate(async next=>{localStorage.setItem('__draft_user',next);await VzipAccountScope.switchTo(next);},A);
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();await feedback(page);
 await page.locator('[data-lesson-draft=memo] button').click();await expect(page.locator('[name=memo]')).toHaveValue('계정 A 테스트 초안');
 await page.evaluate(()=>{localStorage.setItem('__draft_user','');window.__draftAuth('SIGNED_OUT',null);});
 await expect(page.locator('#vzip-auth-screen')).toBeVisible();
 expect((await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('vzip_field_outbox_v1:')).length))).toBeGreaterThan(1);
});

test('new lessons have distinct provisional identities and selecting one resumes only that lesson',async({page})=>{
 await setup(page);await page.evaluate(()=>VZ.lessonSheet());
 await page.locator('[name=prep]').fill('신규 레슨 첫 초안');await close(page);
 await page.evaluate(()=>VZ.lessonSheet());await expect(page.locator('[name=prep]')).toHaveValue('');
 await page.locator('[name=prep]').fill('신규 레슨 둘째 초안');await close(page);
 const newDrafts=(await drafts(page)).filter(r=>r.entityId.startsWith('new:'));
 expect(new Set(newDrafts.map(r=>r.entityId)).size).toBe(2);
 await page.evaluate(()=>VZ.lessonSheet());
 const notice=page.locator('[data-lesson-draft=prepMemo]');await expect(notice.locator('option')).toHaveCount(2);
 // Most recent draft is first; selecting the older entry is an explicit choice.
 await notice.locator('select').selectOption('1');await notice.locator('button').click();
 await expect(page.locator('[name=prep]')).toHaveValue('신규 레슨 첫 초안');
 await page.locator('[name=start]').fill('16:00');await page.locator('button[form=lesson-form]').click();
 const added=await page.evaluate(()=>VZ.db.lessons.find(l=>l.prepMemo==='신규 레슨 첫 초안'));
 expect(added.id).toBe(newDrafts.find(r=>r.text==='신규 레슨 첫 초안').entityId.slice(4));
 await page.evaluate(()=>VZ.lessonSheet());
 await expect(page.locator('[data-lesson-draft=prepMemo] select')).toHaveCount(0);
 await page.locator('[data-lesson-draft=prepMemo] button').click();
 await expect(page.locator('[name=prep]')).toHaveValue('신규 레슨 둘째 초안');
 expect(await page.evaluate(()=>VZ.db.lessons.length)).toBe(3);
});

test('reopening does not multiply input handlers or write untouched field drafts',async({page})=>{
 await setup(page);await page.evaluate(()=>{
  window.__outboxWrites=0;const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k.includes('vzip_field_outbox_v1:'))window.__outboxWrites++;return original.call(this,k,v);};
 });
 for(let i=0;i<5;i++){
  await feedback(page);await page.locator('[name=memo]').fill('반복 진입 '+i);await close(page);
 }
 expect(await page.evaluate(()=>window.__outboxWrites)).toBe(10); // one start + one edit per fresh editor
 expect((await drafts(page)).every(r=>r.field==='memo')).toBe(true);
});

test('an intentionally empty memo is a recoverable draft',async({page})=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('');await close(page);await feedback(page);
 await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[data-lesson-draft=memo] button').click();await expect(page.locator('[name=memo]')).toHaveValue('');
});

test('prepMemo survives an immediate reload without being confused with other fields',async({page})=>{
 await setup(page);await schedule(page);
 await page.locator('[name=prep]').fill('새 준비 초안');await page.reload();await schedule(page);
 await expect(page.locator('[name=prep]')).toHaveValue('확정 준비');
 await page.locator('[data-lesson-draft=prepMemo] button').click();
 await expect(page.locator('[name=prep]')).toHaveValue('새 준비 초안');
 expect((await drafts(page)).every(r=>r.field==='prepMemo')).toBe(true);
});

test('corrupt records are preserved and do not prevent the current field from being edited',async({page})=>{
 await setup(page);const key=await page.evaluate(()=>{
  const s=VzipAccountScope.storage,key='vzip_field_outbox_v1:'+VzipAccountScope.owner+':lesson-test-a:memo:bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  s.setItem(key,'{fake-corrupt');return key;
 });
 await feedback(page);await expect(page.locator('[name=memo]')).toHaveValue('확정 메모');
 await page.locator('[name=memo]').fill('손상과 별개인 입력');await close(page);
 expect(await page.evaluate(k=>VzipAccountScope.storage.getItem(k),key)).toBe('{fake-corrupt');
 await feedback(page);await page.locator('[data-lesson-draft=memo] button').click();
 await expect(page.locator('[name=memo]')).toHaveValue('손상과 별개인 입력');
});

test('receipt storage failure cannot turn a server failure into a completed draft',async({page})=>{
 await setup(page);await page.evaluate(()=>{window.__failServer=true;});await feedback(page);
 await page.locator('[name=memo]').fill('영수증 저장 실패 초안');
 await page.evaluate(()=>{
  const original=Storage.prototype.setItem;
  Storage.prototype.setItem=function(k,v){if(k.includes('vzip_lesson_draft_receipts_v1:'))throw new DOMException('fake receipt quota','QuotaExceededError');return original.call(this,k,v);};
 });
 await page.locator('button[form=fb-form]').click();await page.reload();await feedback(page);
 await expect(page.locator('[data-lesson-draft=memo]')).toBeVisible();
 expect((await drafts(page)).some(r=>r.text==='영수증 저장 실패 초안')).toBe(true);
});

test('draft guidance uses the shared components at phone widths and captures review evidence',async({page},testInfo)=>{
 await setup(page);await feedback(page);await page.locator('[name=memo]').fill('후렴은 호흡을 길게 이어 보기');await close(page);await feedback(page);
 for(const width of [320,390,430]){
  await page.setViewportSize({width,height:844});
  const box=await page.locator('[data-lesson-draft=memo] button').boundingBox();
  expect(box.height).toBeGreaterThanOrEqual(44);
  expect(await page.locator('.sheet').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
 }
 await page.setViewportSize({width:390,height:844});
 if(process.env.VZ_LESSON_DRAFT_SHOTS&&testInfo.project.name==='chromium-mobile'){
  await expect(page.locator('.toast')).toHaveCount(0);
  await page.locator('[data-lesson-draft=memo]').scrollIntoViewIfNeeded();
  await page.screenshot({path:process.env.VZ_LESSON_DRAFT_SHOTS+'/offer.png'});
  await page.locator('[data-lesson-draft=memo] button').click();
  await page.locator('[name=memo]').scrollIntoViewIfNeeded();
  await page.screenshot({path:process.env.VZ_LESSON_DRAFT_SHOTS+'/restored.png'});
 }
});
