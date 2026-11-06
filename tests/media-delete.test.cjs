const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const Merge=require('../data-merge.js');
function setup({provider='supabase',fail='',conflict=false,path='alice/f.wav'}={}){
 const events=[],payload={categories:[],songs:[],assignments:[],lessons:[{id:'l',memo:'keep',recordings:[{id:'m'}]}],practices:[{id:'p',minutes:20,mediaIds:['m','other']}],comparisonReports:[{id:'c',firstId:'m',secondId:'other',notes:'keep'}]};
 let row={metadata:provider==='r2'?{storageProvider:'r2',r2Key:'u/alice/m',legacyStorage:{path}}:{path},updated_at:'v1'};
 const client={storage:{from:()=>({remove:async paths=>{events.push(['storage',Array.from(paths)]);return {error:fail==='storage'?Error('offline'):null}}})},from:table=>{
  const q={action:'read',args:null};for(const m of ['select','eq','is'])q[m]=()=>q;
  q.update=x=>{q.action='update';q.args=x;return q};q.delete=()=>{q.action='delete';return q};q.maybeSingle=()=>q;
  q.then=resolve=>{
   if(q.action==='read')return resolve({data:table==='vocal_media'?row:{payload,updated_at:'v1'}});
   events.push([table,q.action,q.args]);
   if(fail===table)return resolve({error:Error('failure')});
   if(table==='vocal_data'){Object.assign(payload,q.args.payload);return resolve({data:[{user_id:'alice'}]})}
   if(table==='vocal_media'){if(!conflict)row=null;return resolve({data:conflict?[]:[{id:'m'}]})}
   resolve({data:[]});
  };return q;
 }};
 const context={client,user:{id:'alice'},Merge,structuredClone,Error,Event,Date,navigator:{},sameVersion:q=>q,listCache:async()=>null,window:{dispatchEvent(){},VzipR2:{remove:async key=>events.push(['r2',key])}}};
 const code=fs.readFileSync('cloud-sync.js','utf8');
 vm.runInNewContext(code.slice(code.indexOf('async function unlinkCloudMedia'),code.indexOf('/* ---------- R2 move')),context);
 return {events,payload,run:()=>context.window.vzipCloudMediaDelete({id:'m',path:'attacker/stale'}),row:()=>row};
}
test('file deletion uses server paths, cleans links, preserves records, removes row last',async()=>{
 const x=setup();await x.run();assert.deepEqual(x.events[0],['storage',['alice/f.wav']]);
 assert.deepEqual(x.payload.practices[0].mediaIds,['other']);assert.equal(x.payload.practices[0].minutes,20);
 assert.equal(x.payload.lessons[0].memo,'keep');assert.deepEqual(x.payload.lessons[0].recordings,[]);
 assert.equal(x.payload.comparisonReports[0].firstId,'');assert.equal(x.payload.comparisonReports[0].notes,'keep');
 assert.deepEqual(x.events.at(-1).slice(0,2),['vocal_media','delete']);assert.equal(x.row(),null);
});
test('R2 original and legacy Supabase copy are both removed',async()=>{const x=setup({provider:'r2'});await x.run();assert.deepEqual(x.events.slice(0,2),[['r2','u/alice/m'],['storage',['alice/f.wav']]])});
test('foreign storage path fails before any mutation',async()=>{const x=setup({path:'bob/file'});await assert.rejects(x.run());assert.equal(x.events.length,0)});
for(const fail of ['storage','vocal_data','vocal_song_texts'])test(fail+' failure keeps media row for retry',async()=>{const x=setup({fail});await assert.rejects(x.run());assert.ok(x.row());assert.ok(!x.events.some(e=>e[0]==='vocal_media'&&e[1]==='delete'))});
test('concurrent row update is reported instead of false success',async()=>{const x=setup({conflict:true});await assert.rejects(x.run(),/다른 기기/);assert.ok(x.row())});
test('deleted media links cannot return from a newer offline record; input stays unchanged',()=>{
 const old={categories:[],songs:[],assignments:[],lessons:[],practices:[{id:'p',updatedAt:999,mediaIds:['m','n'],memo:'new'}]};
 const fresh={...structuredClone(old),deleted:{media:['m']}};const result=Merge.merge(fresh,old).data;
 assert.deepEqual(result.practices[0].mediaIds,['n']);assert.deepEqual(old.practices[0].mediaIds,['m','n']);assert.equal(result.practices[0].memo,'new');
});
