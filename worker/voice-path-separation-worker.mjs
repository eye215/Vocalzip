// On-demand voice-path fallback only. Original media and metadata.analysis are never written.
import pg from 'pg';
import {createRequire} from 'node:module';
import {writeFile,appendFile} from 'node:fs/promises';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {readMedia,decode} from './analysis-worker.mjs';
import {dualMonoWav,inTemporaryDirectory,separate} from './voice-path-separation-diagnosis.mjs';
import {loadBundle,parseSize,parseMonth} from './mr-runtime-diagnosis.mjs';
const require=createRequire(import.meta.url),P=require('../app/voice-path-model.js'),S=require('../app/voice-path-separation-model.js');
export async function analyze(bytes,{separator=separate,decoder=decode}={}){
 return inTemporaryDirectory(async dir=>{
  const t=performance.now(),mono=await decoder(bytes,{rate:44100,seconds:901}),input=join(dir,'take.wav');if(mono.length/44100>900)throw Error('duration-limit');await writeFile(input,dualMonoWav(mono,44100));
  const voice=await decoder(await separator(input,join(dir,'out')),{rate:16000,seconds:901});if(Math.abs(voice.length/16000-mono.length/44100)>.1)throw Error('duration-changed');const raw=P.analyze(voice,16000);
  return {result:P.gate(raw,false),quality:S.quality(raw),processingMs:Math.round(performance.now()-t)};
 });
}
async function patch(db,row,expected,next){
 const src=S.source(row.metadata);if(!src)return false;
 const {rowCount}=await db.query("update public.vocal_media set metadata=jsonb_set(metadata, '{voicePathSeparation}', $6::jsonb), updated_at=greatest(clock_timestamp(),updated_at+interval '1 millisecond') where id=$1 and user_id=$2 and coalesce(metadata->'voicePathSeparation','null'::jsonb)=$3::jsonb and metadata->>'r2Key'=$4 and metadata->>'size'=$5 and metadata->>'storageProvider'='r2'",
  [row.id,row.user_id,JSON.stringify(expected),src.key,String(src.bytes),JSON.stringify(next)]);return rowCount===1;
}
export async function processRow(db,row,{read=readMedia,analyze:measure=analyze}={}){
 const q=S.current(row.metadata);if(q?.state!=='queued')return 'changed';
 const running={...q,state:'running',startedAt:Date.now()};if(!await patch(db,row,q,running))return 'changed';
 let next;
 try{
  const bytes=await read(row.metadata,row.user_id);if(bytes.length!==q.source.bytes)throw Error('size');
  const measured=await measure(bytes),quality=S.quality(measured.result),good=quality.ok;
  next={...running,state:good?'done':'withheld',finishedAt:Date.now(),quality,processingMs:measured.processingMs??null,engine:{model:'htdemucs',demucs:'4.0.1',torch:'2.3.1',voicePath:P.VERSION,profile:'cpu-dualmono44100'},
   ...(good?{result:measured.result}:{})};
  if(Buffer.byteLength(JSON.stringify(next),'utf8')>512000)throw Error('output-limit');
 }catch{next={...running,state:'failed',finishedAt:Date.now(),reason:'separation-failed'};}
 return await patch(db,row,running,next)?next.state:'changed';
}
export async function waiting(db,selector=null){
 const {rows}=await db.query("select id,user_id,metadata from public.vocal_media where metadata->'voicePathSeparation'->>'version'=$1 and metadata->'voicePathSeparation'->>'state' in ('queued','running') and metadata->'voicePathSeparation'->'source'->>'key'=metadata->>'r2Key' and metadata->'voicePathSeparation'->'source'->>'bytes'=metadata->>'size' and ($2::text is null or (metadata->>'size'=$2 and left(metadata->>'recordedDate',7)=$3)) order by updated_at limit 100",[S.VERSION,selector?String(selector.size):null,selector?.month??null]);
 const queued=[];for(const row of rows){const q=S.current(row.metadata);if(!q)continue;if(q.state==='queued')queued.push(row);
  else if(Number.isFinite(q.startedAt)&&Date.now()-q.startedAt>30*60000)await patch(db,row,q,{...q,state:'failed',finishedAt:Date.now(),reason:'interrupted'});}
 return queued;
}
// Operational validation selects the same exact source as the read-only diagnosis. No IDs in logs.
async function queueDiagnosedSource(db){
 const size=parseSize(process.env.RECORDING_BYTES),month=parseMonth(process.env.RECORDING_MONTH);await loadBundle(db,size,undefined,month);
 const {rows}=await db.query("select id,user_id,metadata from public.vocal_media where metadata->>'size'=$1 and left(metadata->>'recordedDate',7)=$2 and metadata->>'storageProvider'='r2' limit 3",[String(size),month]);
 if(!rows.length||rows.length>2||new Set(rows.map(r=>r.user_id+':'+r.metadata.songId)).size!==1)throw Error('selection');
 for(const row of rows){const q=S.request(row.metadata,crypto.randomUUID(),Date.now());if(q)await patch(db,row,row.metadata[S.FIELD]??null,q);}
}
async function main(){
 const db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});
 try{await db.connect();if(process.argv.includes('--queue-diagnosis'))await queueDiagnosedSource(db);
  const selector=process.env.RECORDING_BYTES?{size:parseSize(process.env.RECORDING_BYTES),month:parseMonth(process.env.RECORDING_MONTH)}:null;
  const rows=await waiting(db,selector);if(process.argv.includes('--peek')){console.log('voice path waiting: '+rows.length);if(process.env.GITHUB_OUTPUT)await appendFile(process.env.GITHUB_OUTPUT,'waiting='+rows.length+'\n');return;}
  const counts={done:0,withheld:0,failed:0,changed:0};for(const row of rows.slice(0,1)){counts[await processRow(db,row)]++;
   if(selector){const after=await db.query('select metadata from public.vocal_media where id=$1 and user_id=$2',[row.id,row.user_id]),before={...row.metadata},fresh={...after.rows[0]?.metadata};delete before[S.FIELD];delete fresh[S.FIELD];console.log('voice path preservation: '+JSON.stringify({sourceAndExistingMetadataUnchanged:JSON.stringify(before)===JSON.stringify(fresh)}));}}
  console.log('voice path settled: '+JSON.stringify(counts));
 }finally{await db.end();}
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(()=>{console.error('voice path operation failed');process.exitCode=1;});
