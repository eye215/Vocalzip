const test=require('node:test'),assert=require('node:assert/strict'),C=require('../core.js'),I=require('../import.js');
let seq=0;const context={uid:()=>String(++seq),now:'2026-11-05T02:00:00Z'};
function setup(){const state=C.reduce(C.empty('device'),{type:'pass.save',payload:{name:'합계 검증용',totalUnits:2000,amount:800000}},context);return {state,settings:{kind:'deduction',passId:state.passes[0].id,hash:'synthetic',sheet:'0'}}}
const headers=['수강생','레슨날짜','상태','레슨횟수 차감','비고','결제','레슨권이름'];
test('Notion deduction and notes columns map to the actual recorded values',()=>{
 const mapping=I.autoMap(headers,'deduction');assert.equal(mapping.units,3);assert.equal(mapping.memo,4);assert.equal(mapping.date,1);assert.equal(mapping.status,2);
 const {state,settings}=setup(),rows=I.drafts([headers,['테스트 학생','2026-10-01','완료',0,'차감 없음','',''],['테스트 학생','2026-10-02','완료',2,'연속 수강','','']],mapping,settings,state);
 const checked=I.inspect(rows,settings,state);assert.deepEqual(checked.map(r=>r.data.units),[0,200]);assert.equal(checked[1].data.memo,'연속 수강');
});
test('Notion zero/one/two deductions reconcile by quantity, never by row count',()=>{
 const {state,settings}=setup(),rows=I.drafts([headers,['A','2026-10-01','완료',0,'무료','',''],['A','2026-10-02','완료',1,'일반','',''],['A','2026-10-03','완료',2,'연속','',''],['A','2026-10-04','완료',2,'연속','','']],I.autoMap(headers,'deduction'),settings,state);
 const checked=I.inspect(rows,settings,state),next=C.reduce(state,{type:'import.commit',payload:{batchId:'batch',kind:'deduction',rows:checked.map(r=>({sourceRow:r.sourceRow,raw:r.raw,data:r.data}))}},context);
 assert.equal(next.deductions.length,4);assert.equal(C.totals(next).total.usedUnits,500);
});
test('Missing values in an explicitly mapped deduction column require review',()=>{
 const {state,settings}=setup(),rows=I.drafts([headers,['A','2026-10-01','완료','','차감 미확인','','']],I.autoMap(headers,'deduction'),settings,state);
 assert.equal(rows[0].units,'');assert.equal(I.inspect(rows,settings,state)[0].errors.length,1);
 const noUnits=['수강생','레슨날짜','상태'];const legacy=I.drafts([noUnits,['A','2026-10-01','완료']],I.autoMap(noUnits,'deduction'),settings,state);
 assert.equal(I.inspect(legacy,settings,state)[0].data.units,100);
});
test('Same-day lessons and multiple payment relations never multiply deductions',()=>{
 const {state,settings}=setup(),rows=I.drafts([headers,['A','2026-10-01','완료',2,'오전','결제 A, 결제 B','날짜 A, 날짜 B'],['A','2026-10-01','완료',1,'오후','결제 B','날짜 B']],I.autoMap(headers,'deduction'),settings,state);
 const checked=I.inspect(rows,settings,state);assert.equal(checked.length,2);assert.equal(checked.reduce((n,r)=>n+r.data.units,0),300);
 assert.deepEqual(checked.map(r=>r.suspected),[false,false]);assert.equal(rows[0].raw[5],'결제 A, 결제 B');
});
test('Whitespace variations in Notion headers preserve zero values',()=>{
 const {state,settings}=setup(),head=['레슨날짜','상태','레슨횟수차감','비고'],rows=I.drafts([head,['2026-10-01','완료','0','0회']],I.autoMap(head,'deduction'),settings,state);
 assert.equal(I.inspect(rows,settings,state)[0].data.units,0);
});
