// Manual production diagnosis. No writes, audio artifacts, transcripts, or media identifiers in output.
import pg from 'pg';
import {chromium} from '@playwright/test';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {readMedia} from './analysis-worker.mjs';
const require=createRequire(import.meta.url),MAX_BYTES=250*1024*1024;
export class DiagnosticError extends Error {constructor(code){super(code);this.code=code;}}
export const parseSize=value=>{const n=Number(value);if(!Number.isSafeInteger(n)||n<44||n>MAX_BYTES)throw new DiagnosticError('invalid-size');return n;};
const codes=new Set(['invalid-size','selection-ambiguous','song-ambiguous','no-references','source-size-mismatch','selection-content-differs','reference-too-large','synthetic-failed']);
export const safeFailure=error=>({status:'failed',code:error instanceof DiagnosticError&&codes.has(error.code)?error.code:'operation-failed'});

export async function loadBundle(db,size,read=readMedia){
 size=parseSize(size);let rows,tracks;
 await db.query('BEGIN READ ONLY');
 try{
  await db.query("SET LOCAL statement_timeout='15s'");
  ({rows}=await db.query("select user_id,metadata from public.vocal_media where metadata->>'size'=$1 and metadata->>'storageProvider'='r2' order by updated_at desc limit 3",[String(size)]));
  if(!rows.length||rows.length>2||new Set(rows.map(r=>r.user_id+':'+r.metadata.songId)).size!==1)throw new DiagnosticError('selection-ambiguous');
  const song=await db.query("select s->'mrTracks' as tracks from public.vocal_data d cross join lateral jsonb_array_elements(d.payload->'songs') s where d.user_id=$1 and s->>'id'=$2",[rows[0].user_id,rows[0].metadata.songId]);
  if(song.rows.length!==1)throw new DiagnosticError('song-ambiguous');
  tracks=(song.rows[0].tracks||[]).filter(t=>!t.deleted&&t.kind==='file'&&t.r2Key).slice(0,3);
  if(!tracks.length)throw new DiagnosticError('no-references');
 }finally{await db.query('ROLLBACK');}
 const recordings=[];
 for(const row of rows){const b=await read(row.metadata,row.user_id);if(b.length!==size)throw new DiagnosticError('source-size-mismatch');recordings.push(b);}
 if(new Set(recordings.map(b=>createHash('sha256').update(b).digest('hex'))).size!==1)throw new DiagnosticError('selection-content-differs');
 const references=[];
 for(const track of tracks){if(Number(track.size)>MAX_BYTES)throw new DiagnosticError('reference-too-large');const b=await read({storageProvider:'r2',r2Key:track.r2Key},rows[0].user_id);if(b.length>MAX_BYTES)throw new DiagnosticError('reference-too-large');references.push(b);}
 return {recording:recordings[0],references};
}

export async function measureBundle(bundle){
 const allowed=new Set(['voice-path-model.js','voice-path-worker.js','mr-cancel.js']);
 const server=createServer(async(req,res)=>{
  try{
   const path=new URL(req.url,'http://localhost').pathname;let data,type;
   if(path==='/'){data='<!doctype html><script src="/app/voice-path-model.js"></script>';type='text/html';}
   else if(path==='/input/recording'){data=bundle.recording;type='application/octet-stream';}
   else if(/^\/input\/reference-\d+$/.test(path)){data=bundle.references[Number(path.split('-').at(-1))];type='application/octet-stream';}
   else if(path.startsWith('/app/')&&allowed.has(path.slice(5))){data=await readFile(new URL('../app/'+path.slice(5),import.meta.url));type='application/javascript';}
   if(!data){res.writeHead(404).end();return;}
   res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store'});res.end(data);
  }catch{res.writeHead(500).end();}
 });
 let browser;
 try{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch(process.env.VZIP_DIAG_BROWSER?{executablePath:process.env.VZIP_DIAG_BROWSER}:{channel:'chrome'});
  const page=await browser.newPage();await page.goto('http://127.0.0.1:'+server.address().port);
  return await page.evaluate(async count=>{
   const input=(bytes,b)=>({bytes,sampleRate:b.sampleRate,channels:b.numberOfChannels,frames:b.length,seconds:b.length/b.sampleRate});
   async function decode(url,rate){const bytes=await(await fetch(url,{cache:'no-store'})).arrayBuffer(),size=bytes.byteLength,b=await new OfflineAudioContext(1,rate,rate).decodeAudioData(bytes);if(b.duration>900)throw Error('duration');return {b,input:input(size,b)};}
   function mono(b){return new Promise((resolve,reject)=>{const w=new Worker('/app/voice-path-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},60000);const end=()=>{clearTimeout(timer);w.terminate();};w.onmessage=e=>{end();e.data.error?reject(Error('mono')):resolve(e.data.mono);};w.onerror=()=>{end();reject(Error('mono'));};const channels=Array.from({length:b.numberOfChannels},(_,i)=>b.getChannelData(i).slice());w.postMessage({mono:{channels,rate:b.sampleRate}},channels.map(c=>c.buffer));});}
   const rec=await decode('/input/recording',16000),mrs=[],referenceInputs=[];
   for(let i=0;i<count;i++){const r=await decode('/input/reference-'+i,8000);referenceInputs.push(r.input);mrs.push({key:String(i),samples:await mono(r.b)});}
   const done=await new Promise((resolve,reject)=>{
    const w=new Worker('/app/voice-path-worker.js'),timer=setTimeout(()=>{w.terminate();reject(Error('timeout'));},180000);let at=0;
    const end=()=>{clearTimeout(timer);w.terminate();};
    const next=()=>{if(at>=rec.b.length){w.postMessage({end:{mrs}},mrs.map(m=>m.samples.buffer));return;}const block=Array.from({length:rec.b.numberOfChannels},(_,i)=>rec.b.getChannelData(i).slice(at,at+30*rec.b.sampleRate));at+=30*rec.b.sampleRate;w.postMessage({block},block.map(c=>c.buffer));};
    w.onmessage=e=>{const d=e.data;if(d.error){end();reject(Error('worker'));}else if(d.done){end();resolve(d.done);}else if(!d.stage&&d.progress!=null)next();};w.onerror=()=>{end();reject(Error('worker'));};w.postMessage({start:{rate:rec.b.sampleRate,keep8k:true}});next();
   });
   const gate=window.VzipVoicePath.measurable(done.mixed,false);
   // Use the existing diagnosis allowlist; do not return Worker keys, curves or other reading data.
   const safe=window.VzipVoicePath.diagnosis([{role:'base',result:done.mixed,clean:{clean:false,why:'not-analysed'},source:'mixed',measurable:gate,mr:done.removed?.report,mrTries:done.tries}]).takes[0];
   return {status:'complete',runtime:done.runtime,recordingInput:rec.input,referenceInputs,source:done.removed?'mr-removed':'mixed',measurable:!!done.removed||gate.ok,reason:done.removed?'song-mr-removed':gate.why,
    rawPitchStrength:done.mixed.confidence.meanStrength,removal:safe.mrRemoval,tries:safe.mrTries,stages:done.stages};
  },bundle.references.length);
 }finally{await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
}

async function main(){
 let bundle;
 if(process.argv.includes('--synthetic')){
  const Y=require('../tests/helpers/mr-synth.cjs'),A=require('../tests/helpers/voice-path-audio.cjs').make(),mr=Y.mr(45),rec=Y.record(Y.vocal(20).x,mr,{offset:5,db:6});
  bundle={recording:Buffer.from(A.wav(rec.x,Y.SR)),references:[Buffer.from(A.wav(mr,Y.SR))]};
 }else{
  const size=parseSize(process.env.RECORDING_BYTES),db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:process.env.SUPABASE_DB_SSL==='off'?false:{rejectUnauthorized:false}});
  try{await db.connect();bundle=await loadBundle(db,size);}finally{await db.end();}
 }
 const receipt=await measureBundle(bundle);console.log(JSON.stringify(receipt));
 if(process.argv.includes('--synthetic')&&!receipt.measurable)throw new DiagnosticError('synthetic-failed');
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(error=>{console.error(JSON.stringify(safeFailure(error)));process.exitCode=1;});
