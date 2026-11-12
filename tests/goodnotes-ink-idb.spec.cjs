// Dedicated IndexedDB stroke-store regression coverage. No cloud writes.
const {test,expect}=require('@playwright/test');
const path=require('node:path');
async function storePage(page){
 await page.goto('/');
 await page.addScriptTag({path:path.join(__dirname,'../app/score-ink-idb.js')});
}
test('editable strokes persist past the old 900-stroke cap and survive reopen',async({page})=>{
 await storePage(page);
 const result=await page.evaluate(async()=>{
  const owner='idb-test-owner',identity=()=>({owner}),valid=x=>x?.id&&x.ownerId===owner&&x.points?.length>0;
  const b={ownerId:owner,songId:'song',scoreId:'score',r2Key:'u/idb-test-owner/score/file',pdfHash:'a'.repeat(64)};
  const rows=Array.from({length:1100},(_,i)=>({id:'s'+i,...b,page:i%3+1,tool:'pen',points:[[.1,.2,.5]]}));
  const db=await window.VzipScoreInkIDB.create({owner,identity,valid});
  const migrated=await db.migrateLegacy(b,rows);
  const all=await db.list(b),perPage=await db.list(b,2);
  db.close();
  const reopened=await window.VzipScoreInkIDB.create({owner,identity,valid});
  const persisted=(await reopened.list(b)).length;
  const duplicate=await reopened.migrateLegacy(b,rows);
  const afterDuplicate=(await reopened.list(b)).length;
  await reopened.commit(b,{remove:['s0']});
  const afterDelete=(await reopened.list(b)).length;
  reopened.close();
  return {migrated,persisted,all:all.length,perPage:perPage.length,duplicate,afterDuplicate,afterDelete};
 });
 expect(result.migrated).toEqual({copied:1100,legacyRetained:true});
 expect(result).toMatchObject({all:1100,persisted:1100,afterDuplicate:1100,afterDelete:1099});
 expect(result.perPage).toBeGreaterThan(300);
});
test('different account and score cannot read or erase each other\'s strokes',async({page})=>{
 await storePage(page);
 const result=await page.evaluate(async()=>{
  let currentOwner='alpha';const identity=()=>({owner:currentOwner}),valid=x=>Boolean(x?.id&&x?.ownerId&&x?.points);
  const bind={ownerId:'alpha',songId:'song',scoreId:'score',r2Key:'u/alpha/score/key',pdfHash:'b'.repeat(64)};
  const ink={...bind,id:'private-one',page:1,points:[[.1,.2,.5]]};
  const alpha=await window.VzipScoreInkIDB.create({owner:'alpha',identity,valid});
  await alpha.commit(bind,{add:[ink]});
  const other={...bind,scoreId:'other',r2Key:'u/alpha/other/key'};
  let crossScoreDenied=false;
  try{await alpha.commit(other,{remove:['private-one']});}catch(e){crossScoreDenied=e.code==='identity';}
  currentOwner='beta';let changedAccountDenied=false;
  try{await alpha.list(bind);}catch(e){changedAccountDenied=e.code==='identity';}
  alpha.close();
  const beta=await window.VzipScoreInkIDB.create({owner:'beta',identity,valid});
  const own={...bind,ownerId:'beta',r2Key:'u/beta/score/key'};
  const betaRows=(await beta.list(own)).length;
  beta.close();
  currentOwner='alpha';
  const reopened=await window.VzipScoreInkIDB.create({owner:'alpha',identity,valid});
  const remains=(await reopened.list(bind)).length;reopened.close();
  return {crossScoreDenied,changedAccountDenied,betaRows,remains};
 });
 expect(result).toEqual({crossScoreDenied:true,changedAccountDenied:true,betaRows:0,remains:1});
});
test('conflicting duplicate IDs abort atomically and legacy data stays untouched',async({page})=>{
 await storePage(page);
 const result=await page.evaluate(async()=>{
  const owner='conflict-test',identity=()=>({owner}),valid=x=>Boolean(x?.id&&x?.ownerId&&x?.points);
  const b={ownerId:owner,songId:'s',scoreId:'score',r2Key:'u/conflict-test/score/file',pdfHash:'c'.repeat(64)};
  const one={...b,id:'one',page:1,points:[[.1,.1,.5]]};
  const conflicting={...one,points:[[.9,.9,.5]]};
  const two={...b,id:'two',page:1,points:[[.2,.2,.5]]};
  const legacy=JSON.stringify([one,conflicting]);
  const db=await window.VzipScoreInkIDB.create({owner,identity,valid});
  await db.commit(b,{add:[one]});
  let conflict=false;try{await db.commit(b,{add:[two,conflicting]});}catch(e){conflict=e.code==='conflict';}
  const rows=await db.list(b);db.close();
  return {conflict,rows:rows.map(x=>x.id),legacyIntact:legacy===JSON.stringify([one,conflicting])};
 });
 expect(result).toEqual({conflict:true,rows:['one'],legacyIntact:true});
});

test('one-time legacy migration keeps deliberate erasures deleted after reopening',async({page})=>{
 await storePage(page);
 const result=await page.evaluate(async()=>{
  const owner='legacy-copy',identity=()=>({owner}),valid=x=>Boolean(x?.id&&x?.ownerId&&x?.points);
  const b={ownerId:owner,songId:'old-song',scoreId:'old-score',r2Key:'u/legacy-copy/old-score/pdf',pdfHash:'d'.repeat(64)};
  const legacy=[{...b,id:'old-1',page:1,points:[[.1,.1,.5]]},{...b,id:'old-2',page:1,points:[[.2,.2,.5]]}];
  const db=await window.VzipScoreInkIDB.create({owner,identity,valid});
  const first=await db.ensureMigrated(b,legacy);
  await db.commit(b,{remove:['old-1']});db.close();
  const again=await window.VzipScoreInkIDB.create({owner,identity,valid});
  const repeat=await again.ensureMigrated(b,legacy),rows=await again.list(b);again.close();
  return {first,repeat,ids:rows.map(x=>x.id)};
 });
 expect(result.first).toMatchObject({copied:2,already:false,legacyRetained:true});
 expect(result.repeat).toMatchObject({copied:0,already:true,legacyRetained:true});
 expect(result.ids).toEqual(['old-2']);
});
