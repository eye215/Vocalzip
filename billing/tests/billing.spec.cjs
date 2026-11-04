const {test,expect}=require('@playwright/test');
const {deflateRawSync}=require('node:zlib');
const {crc32}=require('../files.js');
const legacy={lessons:[{id:'lesson-existing',date:'2026-11-04',status:'completed',feedback:'원래 피드백'}],practices:[{id:'practice-untouched'}],songs:[{id:'song-untouched'}]};
async function open(page){
 await page.addInitScript(data=>{if(!localStorage.getItem('vocal-zip_mvp_v1'))localStorage.setItem('vocal-zip_mvp_v1',JSON.stringify(data))},legacy);
 await page.goto('/billing/');await expect(page.locator('#message')).toContainText('불러왔어요');
 page.on('dialog',dialog=>dialog.accept());
}
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
 await page.locator('#batch-list').getByRole('button',{name:'이 업로드 되돌리기'}).click();await expect(page.locator('#message')).toContainText('되돌렸어요');
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
 await tab(page,'imports');await page.locator('#batch-list').getByRole('button',{name:'이 업로드 되돌리기'}).click();await expect(page.locator('#message')).toContainText('수정된 기록');
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
