import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const files=['index.html','legacy.html','media-upload-recovery.js','cloud-sync.js','r2-storage.js'];
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
let failed=false;
await Promise.all(files.map(async path=>{
 try{
  const expected=hash(await readFile(path));
  const response=await fetch('https://vocalzip.yullul.com/'+path+'?verify='+process.env.GITHUB_SHA,{cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
  const same=response.ok&&hash(Buffer.from(await response.arrayBuffer()))===expected;
  console.log(JSON.stringify({path,status:response.status,sha256_match:same}));
  if(!same)failed=true;
 }catch{console.log(JSON.stringify({path,verified:false}));failed=true;}
}));
if(failed)process.exitCode=1;
