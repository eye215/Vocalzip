// Manual, read-only observation of an exact source with the existing pinned Demucs model.
// Synthetic tests have no production credentials. No media or identifiers leave the runner.
import pg from 'pg';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {loadBundle,parseSize,parseMonth,safeFailure} from './mr-runtime-diagnosis.mjs';
import {decode} from './analysis-worker.mjs';
const require=createRequire(import.meta.url),P=require('../app/voice-path-model.js');
export function dualMonoWav(x,rate){
 const b=Buffer.alloc(44+x.length*4);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(2,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*4,28);b.writeUInt16LE(4,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(x.length*4,40);
 for(let i=0;i<x.length;i++){const n=Math.max(-32768,Math.min(32767,Math.round(x[i]*32767)));b.writeInt16LE(n,44+i*4);b.writeInt16LE(n,46+i*4);}return b;
}
export async function inTemporaryDirectory(run){const dir=await mkdtemp(join(tmpdir(),'vz-vp-observe-'));try{return await run(dir);}finally{await rm(dir,{recursive:true,force:true});}}
export async function separate(input,output,{command='python -m demucs',timeout=20*60000}={}){
 const [bin,...pre]=command.split(' ').filter(Boolean);
 await new Promise((resolve,reject)=>{const child=spawn(bin,[...pre,'--two-stems','vocals','-n','htdemucs','-d','cpu','-o',output,input],{stdio:['ignore','ignore','ignore']}),timer=setTimeout(()=>child.kill('SIGKILL'),timeout);
  child.once('error',()=>{clearTimeout(timer);reject(Error('separation-failed'));});child.once('close',code=>{clearTimeout(timer);code===0?resolve():reject(Error('separation-failed'));});});
 return readFile(join(output,'htdemucs','take','vocals.wav'));
}
export async function observe(bytes,{separator=separate,decoder=decode}={}){
 return inTemporaryDirectory(async dir=>{
  const t=performance.now(),mono=await decoder(bytes,{rate:44100,seconds:900}),input=join(dir,'take.wav');await writeFile(input,dualMonoWav(mono,44100));
  const wav=await separator(input,join(dir,'out')),separateMs=Math.round(performance.now()-t),voice=await decoder(wav,{rate:16000,seconds:900}),r=P.analyze(voice,16000),c=r.confidence;
  return {status:'complete',model:'htdemucs',analysisVersion:P.VERSION,originalBytes:bytes.length,seconds:voice.length/16000,separateMs,voicedSeconds:r.voicedSeconds,confidence:{meanStrength:c.meanStrength,outsideBandShare:c.outsideBandShare,glitchShare:c.glitchShare,jumpsPerMin:c.jumpsPerMin},pitchGate:P.measurable(r,false),zones:Object.fromEntries(Object.entries(r.zones).map(([k,z])=>[k,{seconds:z.seconds,enough:z.enough}]))};
 });
}
async function main(){
 const size=parseSize(process.env.RECORDING_BYTES),month=parseMonth(process.env.RECORDING_MONTH),db=new pg.Client({connectionString:process.env.SUPABASE_DB_URL,ssl:{rejectUnauthorized:false}});let bundle;
 try{await db.connect();bundle=await loadBundle(db,size,undefined,month);}finally{await db.end();}
 console.log(JSON.stringify(await observe(bundle.recording)));
}
if(import.meta.url===pathToFileURL(process.argv[1]||'').href)main().catch(error=>{console.error(JSON.stringify(safeFailure(error)));process.exitCode=1;});
