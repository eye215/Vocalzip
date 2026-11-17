// Offline opt-in CLI, no database, uploads or queue changes. Requires the existing ffmpeg runtime.
const fs=require('node:fs'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const A=require('../../app/precision-acoustics.js');
const args=process.argv.slice(2),input=args[0];
if(!input){process.stderr.write('Usage: node tools/precision/analyze.cjs FILE [clean|mixed|unknown|separated]\n');process.exit(2);}
const bytes=fs.readFileSync(input),source=args[1]||'unknown';
if(!['clean','mixed','unknown','separated'].includes(source))throw Error('invalid source');
const decoded=spawnSync('ffmpeg',['-v','error','-i','pipe:0','-t','60.01','-ac','1','-ar','16000','-f','f32le','pipe:1'],{input:bytes,maxBuffer:8*1024*1024});
if(decoded.error||decoded.status!==0)throw Error('audio decoding failed');
const buffer=decoded.stdout,pcm=new Float32Array(buffer.length/4);for(let i=0;i<pcm.length;i++)pcm[i]=buffer.readFloatLE(i*4);
const result=A.analyze(pcm,16000,{sourceId:'local-file',sourceRevision:'sha256:'+crypto.createHash('sha256').update(bytes).digest('hex'),context:{source,task:'song'}});
process.stdout.write(JSON.stringify(result)+'\n');
