const {test,expect}=require('@playwright/test');
const {deflateRawSync}=require('node:zlib');
const {crc32}=require('../files.js');
const legacy={lessons:[{id:'lesson-existing',date:'2026-11-04',status:'completed',feedback:'원래 피드백'}],practices:[{id:'practice-untouched'}],songs:[{id:'song-untouched'}]};
async function open(page){
 await page.addInitScript(data=>{if(!localStorage.getItem('vocal-zip_mvp_v1'))localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data))},legacy);
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 page.on('dialog',dialog=>dialog.accept());
}
const confirmSheet=async page=>{const sheet=page.locator('.bd-sheet');await expect(sheet).toBeVisible();await sheet.locator('[data-ok]').click();await expect(sheet).toHaveCount(0)};
const tab=(page,name)=>page.locator('[data-panel="'+name+'"]').click();
async function pass(page,name='기본 10회권',count='10',amount='300000'){
 await tab(page,'passes');await page.locator('#pass-name').fill(name);await page.locator('#pass-totalUnits').fill(count);await page.locator('#pass-amount').fill(amount);
 await page.locator('#pass-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
}
async function payment(page,amount,date='2026-11-04',kind='payment'){
 await tab(page,'payments');await page.locator('#payment-amount').fill(amount);await page.locator('#payment-date').fill(date);await page.locator('#payment-kind').selectOption(kind);
 await page.locator('#payment-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
}
async function ledger(page){return page.evaluate(()=>VzipBillingStore.load())}
async function total(page,key,value){await tab(page,'dashboard');await expect(page.locator('[data-total="'+key+'"] strong')).toHaveText(value)}
async function csv(page,content,kind='payment',mode='existing'){
 await tab(page,'imports');await page.locator('#import-kind').selectOption(kind);if(kind==='payment')await page.locator('#import-mode').selectOption(mode);
 await page.locator('#import-file').setInputFiles({name:'노션.csv',mimeType:'text/csv',buffer:Buffer.from(content)});
 await expect(page.locator('#preview-import')).toBeEnabled();await page.locator('#preview-import').click();
}
async function commit(page){await page.locator('#confirm-attendance').check();await page.locator('#commit-import').click();await expect(page.locator('#message')).toContainText('일괄 등록 완료')}
test('installments, refund, linked lesson, cancellation and reload preserve Project A',async({page})=>{
 await open(page);await pass(page);await payment(page,'100000','2026-11-01');await payment(page,'200000','2026-11-02');await payment(page,'50000','2026-11-03','refund');
 await tab(page,'attendance');await page.locator('#deduction-lessonId').selectOption('lesson-existing');await expect(page.locator('#deduction-units')).toHaveValue('1');
 await page.locator('#deduction-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 await total(page,'remainingUnits','9회');await total(page,'unpaid','50,000원');await total(page,'usedAmount','30,000원');
 await page.reload();await expect(page.locator('[data-total=remainingUnits] strong')).toHaveText('9회');
 await tab(page,'attendance');await page.locator('#deduction-lessonId').selectOption('lesson-existing');
 await expect(page.locator('#deduction-form [type=submit]')).toHaveText('수정 저장');
 await page.locator('#deduction-status').selectOption('cancelled');await page.locator('#deduction-form [type=submit]').click();
 await total(page,'remainingUnits','10회');const data=await ledger(page);expect(data.deductions).toHaveLength(1);expect(data.history.at(-1).before.units).toBe(100);
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')))).toEqual(legacy);
});
test('duplicate payment stays unsaved and pass price edits require acknowledgement',async({page})=>{
 await open(page);await pass(page);await payment(page,'100000');
 await page.locator('#payment-amount').fill('100000');await page.locator('#payment-date').fill('2026-11-04');await page.locator('#payment-form [type=submit]').click();
 await expect(page.locator('#message')).toContainText('동일한 결제');expect((await ledger(page)).payments).toHaveLength(1);
 await tab(page,'passes');await page.locator('#pass-list').getByRole('button',{name:'수정',exact:true}).click();await page.locator('#pass-amount').fill('400000');await page.locator('#pass-form [type=submit]').click();
 await expect(page.locator('#message')).toContainText('영향');await page.locator('#pass-form [name=ackImpact]').check();await page.locator('#pass-form [type=submit]').click();
 await total(page,'amount','400,000원');
});
test('Notion payment CSV imports only valid rows, detects reimport, and safely undoes',async({page})=>{
 await open(page);const content='수강생,금액,레슨횟수충전,결제날짜,메모\n학생,"300,000",10,2026-11-04,첫 결제\n학생,100000,5,잘못된날짜,오류';
 await csv(page,content,'payment','new');await expect(page.locator('#import-summary')).toContainText('선택 1행 · 오류 1행');
 await commit(page);await total(page,'remainingUnits','10회');await total(page,'paid','300,000원');
 await csv(page,content,'payment','new');await expect(page.locator('#import-summary')).toContainText('중복 의심 1행');await expect(page.locator('#commit-import')).toBeDisabled();
 await page.locator('#batch-list').getByRole('button',{name:'이 업로드 되돌리기'}).click();await confirmSheet(page);await expect(page.locator('#message')).toContainText('되돌렸어요');
 await total(page,'chargedUnits','0회');const data=await ledger(page);expect(data.imports[0].status).toBe('undone');expect(data.importRows.map(row=>row.status)).toEqual(['undone','failed']);
});
test('Notion date-only attendance requires explicit status review and allows same-day records',async({page})=>{
 await open(page);await pass(page);
 await csv(page,'수강생,레슨날짜,레슨내용,시작시간,종료시간\n학생,2026-11-04,오전,,\n학생,2026-11-04,오후,,','deduction');
 await expect(page.locator('#import-summary')).toContainText('오류 2행');
 await page.getByLabel('2행 진행 상태',{exact:true}).selectOption('completed');await page.getByLabel('3행 진행 상태',{exact:true}).selectOption('completed');
 await page.locator('#select-valid').click();await expect(page.locator('#import-summary')).toContainText('선택 2행 · 오류 0행 · 중복 의심 0행');
 await commit(page);await total(page,'remainingUnits','8회');
 expect((await ledger(page)).deductions).toHaveLength(2);expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('vocal-zip_mvp_v1')).lessons.length)).toBe(1);
});
function workbook(){
 const entries={
 'xl/workbook.xml':'<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="1"/><sheets><sheet name="결제" sheetId="1" r:id="rId1"/></sheets></workbook>',
 'xl/_rels/workbook.xml.rels':'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="strings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>',
 'xl/sharedStrings.xml':'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>결제날짜</t></si><si><t>금액</t></si><si><t>레슨횟수충전</t></si></sst>',
 'xl/worksheets/sheet1.xml':'<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row><row r="2"><c r="A2" t="n"><v>1</v></c><c r="B2"><f>100000+200000</f><v>300000</v></c><c r="C2"><v>10</v></c></row></sheetData></worksheet>'
 };
 let offset=0;const locals=[],central=[];
 for(const [filename,xml]of Object.entries(entries)){const name=Buffer.from(filename),raw=Buffer.from(xml),data=deflateRawSync(raw),crc=crc32(raw);
 const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(8,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(data.length,18);header.writeUInt32LE(raw.length,22);header.writeUInt16LE(name.length,26);
 const directory=Buffer.alloc(46);directory.writeUInt32LE(0x02014b50);directory.writeUInt16LE(20,4);directory.writeUInt16LE(20,6);directory.writeUInt16LE(8,10);directory.writeUInt32LE(crc,16);directory.writeUInt32LE(data.length,20);directory.writeUInt32LE(raw.length,24);directory.writeUInt16LE(name.length,28);directory.writeUInt32LE(offset,42);
 locals.push(header,name,data);central.push(directory,name);offset+=header.length+name.length+data.length;}
 const dir=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
test('compressed XLSX supports shared strings, cached formulas and the 1904 date system',async({page})=>{
 await open(page);await tab(page,'imports');await page.locator('#import-mode').selectOption('new');
 await page.locator('#import-file').setInputFiles({name:'결제.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbook()});
 await expect(page.locator('#preview-import')).toBeEnabled();await page.locator('#preview-import').click();await expect(page.locator('#import-summary')).toContainText('오류 0행');await commit(page);
 const data=await ledger(page);expect(data.payments[0].date).toBe('1904-01-02');expect(data.payments[0].amount).toBe(300000);await total(page,'chargedUnits','10회');
});
test('undo blocks imported records edited after upload',async({page})=>{
 await open(page);await pass(page);await csv(page,'결제일,금액\n2026-11-04,100000');await commit(page);
 await tab(page,'payments');await page.locator('#payment-list').getByRole('button',{name:'수정',exact:true}).click();await page.locator('#payment-amount').fill('110000');await page.locator('#payment-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 await tab(page,'imports');await page.locator('#batch-list').getByRole('button',{name:'이 업로드 되돌리기'}).click();await confirmSheet(page);await expect(page.locator('#message')).toContainText('수정된 기록');
 expect((await ledger(page)).payments[0].amount).toBe(110000);
});
test('storage failure preserves form values and original ledger',async({page})=>{
 await open(page);await pass(page);await tab(page,'payments');await page.locator('#payment-amount').fill('50000');
 await page.evaluate(()=>{const original=IDBObjectStore.prototype.put;IDBObjectStore.prototype.put=function(...args){if(this.name==='documents'){IDBObjectStore.prototype.put=original;throw new DOMException('저장 공간 부족','QuotaExceededError')}return original.apply(this,args)}});
 await page.locator('#payment-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장 공간 부족');await expect(page.locator('#payment-amount')).toHaveValue('50000');expect((await ledger(page)).payments).toHaveLength(0);
 await page.locator('#payment-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');expect((await ledger(page)).payments).toHaveLength(1);
});
test('concurrent tabs cannot overwrite a newer ledger',async({page,context})=>{
 await open(page);await pass(page);const second=await context.newPage();await second.goto('/billing/');await expect(second.locator('#message')).toContainText('불러왔어요');
 await payment(page,'100000');await tab(second,'payments');await second.locator('#payment-amount').fill('50000');await second.locator('#payment-form [type=submit]').click();
 await expect(second.locator('#message')).toContainText('다른 정산 탭');expect((await ledger(page)).payments).toHaveLength(1);
 await second.locator('#reload').click();await expect(second.locator('#message')).toContainText('다시 불러왔어요');await second.locator('#payment-form [type=submit]').click();await expect(second.locator('#message')).toContainText('저장했어요');expect((await ledger(page)).payments).toHaveLength(2);
});
test('account storage is isolated and mobile layout stays within viewport',async({page})=>{
 await open(page);await pass(page);for(const section of ['dashboard','passes','payments','attendance','imports','history']){await tab(page,section);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true)}
 await page.evaluate(()=>localStorage.setItem('sb-chxnbtiyuyhiywzeshis-auth-token',JSON.stringify({user:{id:'other-user',email:'test@example.invalid'}})));await page.reload();
 await expect(page.locator('[data-total=chargedUnits] strong')).toHaveText('0회');
 await page.evaluate(()=>localStorage.removeItem('sb-chxnbtiyuyhiywzeshis-auth-token'));await page.reload();await expect(page.locator('[data-total=chargedUnits] strong')).toHaveText('10회');
});
test('CSV notes are rendered as inert text',async({page})=>{
 await open(page);await pass(page);await csv(page,'결제일,금액,메모\n2026-11-04,100000,<img src=x onerror=window.injected=true>');
 await commit(page);await tab(page,'payments');await expect(page.locator('#payment-list')).toContainText('<img src=x');expect(await page.evaluate(()=>window.injected)).toBeUndefined();
});

test('manual adjustment and deduction cancellation/restore keep audited totals',async({page})=>{
 await open(page);await pass(page);await tab(page,'attendance');await page.locator('#deduction-status').selectOption('completed');await page.locator('#deduction-units').fill('2');await page.locator('#deduction-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 await page.locator('#adjustment-unitsDelta').fill('10');await page.locator('#adjustment-amountDelta').fill('100000');await page.locator('#adjustment-memo').fill('추가 충전');await page.locator('#adjustment-form [name=ackImpact]').check();await page.locator('#adjustment-form [type=submit]').click();
 await total(page,'chargedUnits','20회');await total(page,'usedAmount','40,000원');
 await tab(page,'attendance');await page.locator('#deduction-list').getByRole('button',{name:'취소',exact:true}).click();await confirmSheet(page);await expect(page.locator('#message')).toContainText('취소했어요');await total(page,'usedUnits','0회');
 await tab(page,'attendance');await page.locator('#deduction-list').getByRole('button',{name:'복구',exact:true}).click();await confirmSheet(page);await expect(page.locator('#message')).toContainText('복구했어요');await total(page,'usedAmount','40,000원');
 const data=await ledger(page);expect(data.adjustments).toHaveLength(1);expect(data.history.at(-1).action).toBe('entity.restore');
});
test('app lessons waiting for settlement: one-tap deduction, status-less confirmation, restore after app cancel',async({page})=>{
 const appData={lessons:[
  {id:'v6-done',date:'2026-11-01',startTime:'19:00',endTime:'20:00',place:'강남',status:'done',feedback:'피드백'},
  {id:'legacy-nostatus',date:'2026-10-20',feedback:'예전 레슨'},
  {id:'v6-future',date:'2999-01-01',startTime:'10:00',status:'scheduled'}],practices:[],songs:[]};
 await page.addInitScript(data=>{if(!localStorage.getItem('vocal-zip_mvp_v1'))localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data))},appData);
 await open(page);
 const before=await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1'));
 await expect(page.locator('#pending-summary')).toContainText('정산 대기 2건');
 await pass(page);
 await tab(page,'attendance');
 const pending=page.locator('#pending-lessons');
 await expect(pending).toContainText('2026/11/01 · 19:00–20:00 · 강남');
 await expect(pending).not.toContainText('2999-01-01');
 await pending.locator('li').filter({hasText:'2026/11/01'}).getByRole('button',{name:'1회 차감'}).click();
 await expect(page.locator('#message')).toContainText('1회 차감했어요');
 await pending.locator('li').filter({hasText:'2026/10/20'}).getByRole('button',{name:'수강 안 함 · 0회'}).click();
 await expect(pending).toContainText('정산할 앱 레슨이 없어요');
 let data=await ledger(page);
 const charged=data.deductions.find(row=>row.lessonId==='v6-done');
 expect(charged).toMatchObject({status:'completed',units:100,start:'19:00',end:'20:00'});
 expect(data.deductions.find(row=>row.lessonId==='legacy-nostatus')).toMatchObject({status:'cancelled',units:0});
 await total(page,'usedUnits','1회');await total(page,'usedAmount','30,000원');
 // The lesson is cancelled later in the main app: offer to restore the charge.
 await page.evaluate(()=>{const d=JSON.parse(localStorage.getItem('vocal-zip_mvp_v1'));d.lessons[0].status='cancelled';localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(d))});
 await page.reload();await expect(page.locator('#message')).toContainText('불러왔어요');
 await tab(page,'attendance');
 await pending.getByRole('button',{name:'차감 취소(복구)'}).click();await confirmSheet(page);
 await expect(page.locator('#message')).toContainText('차감을 취소했어요');
 await total(page,'usedUnits','0회');
 data=await ledger(page);
 expect(data.deductions.find(row=>row.lessonId==='v6-done').voidedAt).toBeTruthy();
 // Billing never writes the main app's lesson data (apart from this test's own edit above).
 const after=JSON.parse(await page.evaluate(()=>localStorage.getItem('vocal-zip_mvp_v1')));
 const expected=JSON.parse(before);expected.lessons[0].status='cancelled';
 expect(after).toEqual(expected);
});
test('confirmation sheet matches the app tone: closing it changes nothing, Escape cancels',async({page})=>{
 await open(page);await pass(page);await payment(page,'100000');
 await tab(page,'payments');
 await page.locator('#payment-list').getByRole('button',{name:'취소',exact:true}).click();
 const sheet=page.locator('.bd-sheet');
 await expect(sheet).toBeVisible();await expect(sheet.getByRole('heading')).toHaveText('기록을 취소할까요?');
 await sheet.getByRole('button',{name:'닫기'}).click();await expect(sheet).toHaveCount(0);
 await page.locator('#payment-list').getByRole('button',{name:'취소',exact:true}).click();
 await page.keyboard.press('Escape');await expect(sheet).toHaveCount(0);
 const data=await ledger(page);expect(data.payments[0].voidedAt).toBeFalsy();
 await total(page,'paid','100,000원');
});
test('several Notion CSVs can be selected at once and their dates/times are converted automatically',async({page})=>{
 await open(page);await pass(page);
 await tab(page,'imports');await page.locator('#import-kind').selectOption('deduction');
 const oct='수강생,레슨날짜,레슨내용,진행상태\n학생,2026년 10월 7일 오후 7:00 → 8:00,호흡,완료\n학생,"October 14, 2026 7:30 PM → 8:30 PM",발성,완료\n';
 const nov='레슨날짜,수강생,진행상태,레슨내용\n2026/11/04 19:00 → 2026/11/04 20:00,학생,완료,고음\n';
 await page.locator('#import-file').setInputFiles([{name:'10월.csv',mimeType:'text/csv',buffer:Buffer.from(oct)},{name:'11월.csv',mimeType:'text/csv',buffer:Buffer.from(nov)}]);
 await expect(page.locator('#message')).toContainText('2개 파일에서 3행을 합쳤어요');
 await expect(page.locator('#import-sheet')).toBeDisabled();
 await expect(page.locator('#preview-import')).toBeEnabled();await page.locator('#preview-import').click();
 await expect(page.locator('#import-summary')).toContainText('오류 0행');
 await commit(page);
 const data=await ledger(page),rows=data.deductions.map(row=>[row.date,row.start,row.end,row.memo]).sort((a,b)=>a[0].localeCompare(b[0]));
 expect(rows).toEqual([['2026-10-07','19:00','20:00','호흡'],['2026-10-14','19:30','20:30','발성'],['2026-11-04','19:00','20:00','고음']]);
 expect(data.imports[0].fileName).toContain('10월.csv');expect(data.imports[0].fileName).toContain('11월.csv');
 // The source file name stays with every imported row.
 expect(data.importRows.filter(row=>row.status==='imported').map(row=>row.raw.at(-1)).sort()).toEqual(['10월.csv','10월.csv','11월.csv']);
 await total(page,'usedUnits','3회');
});
test('payments, deductions and adjustments list the newest date first',async({page})=>{
 await open(page);await pass(page);
 for(const date of ['2026-01-01','2026-03-01','2026-02-01'])await payment(page,'10000',date);
 const dates=await page.locator('#payment-list tbody tr td:first-child').allTextContents();
 expect(dates).toEqual(['2026/03/01','2026/02/01','2026/01/01']);
});

test('dates are typed as digits and shown as YYYY/MM/DD, including uploaded Notion dates',async({page})=>{
 await open(page);await pass(page);
 await tab(page,'payments');
 const date=page.locator('#payment-date');
 await expect(date).toHaveAttribute('inputmode','numeric');
 await date.fill('');await date.pressSequentially('20260126');
 await expect(date).toHaveValue('2026/01/26');
 await page.locator('#payment-amount').fill('150000');
 await page.locator('#payment-form [type=submit]').click();await expect(page.locator('#message')).toContainText('저장했어요');
 expect((await ledger(page)).payments[0].date).toBe('2026-01-26');
 await expect(page.locator('#payment-list')).toContainText('2026/01/26');
 // A pasted English date with trailing text becomes YYYY/MM/DD.
 await date.fill('January 26, 2026 7:00 PM (GMT+9)');await date.blur();
 await expect(date).toHaveValue('2026/01/26');
 await date.fill('1/26/2026');await date.blur();
 await expect(date).toHaveValue('2026/01/26');
 await date.fill('2026-01-26');await date.blur();
 await expect(date).toHaveValue('2026/01/26');
 // Uploaded rows: Notion English dates show as YYYY/MM/DD in the preview and after saving.
 await csv(page,'수강생,레슨날짜,레슨내용,진행상태\n학생,"January 26, 2026 7:00 PM",호흡,완료\n학생,26 January 2026,발성,완료\n','deduction');
 await expect(page.getByLabel('2행 날짜',{exact:true})).toHaveValue('2026/01/26');
 await commit(page);
 await tab(page,'attendance');
 await expect(page.locator('#deduction-list')).toContainText('2026/01/26');
 expect((await ledger(page)).deductions.map(row=>row.date)).toEqual(['2026-01-26','2026-01-26']);
});
