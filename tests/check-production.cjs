/* Read-only checks against the published distribution and public project endpoints. */
const fs=require('node:fs');
const crypto=require('node:crypto');
const assert=require('node:assert/strict');
const origin='https://vocalzip.yullul.com/';
const report={origin,at:new Date().toISOString(),assets:[],backend:{}};
const sha=value=>crypto.createHash('sha256').update(value).digest('hex');
async function get(url,options={}){
 const response=await fetch(url,{...options,signal:AbortSignal.timeout(30000)});
 return {response,body:await response.text()};
}
(async()=>{
 const html=await get(origin+'?verify='+Date.now());
 assert.equal(html.response.status,200,'Published HTML must return 200');
 assert.ok(html.response.headers.get('content-type')?.includes('text/html'),'Published app must be HTML');
 assert.equal(sha(html.body),sha(fs.readFileSync('index.html','utf8')),'Published HTML differs from the release under test');
 const references=[...html.body.matchAll(/(?:src|href)="([^"]+\.(?:js|css)(?:\?[^"]*)?)"/g)]
  .map(match=>match[1]).filter(path=>!/^https?:/.test(path));
 references.push('share-worker.js','chunk-media-core.js','chunk-media.js','manifest.webmanifest','audio-extract-worker.js','bounded-byte-writer.js');
 for(const path of [...new Set(references)]){
  const localPath=path.split('?')[0];
  if(!fs.existsSync(localPath))throw Error('Missing local reference: '+localPath);
  const url=new URL(path,origin);url.searchParams.set('verify',Date.now());
  const {response,body}=await get(url);
  const entry={path:localPath,status:response.status,matches:sha(body)===sha(fs.readFileSync(localPath,'utf8'))};
  report.assets.push(entry);
  assert.equal(entry.status,200,'Failed published asset: '+localPath);
  assert.ok(entry.matches,'Published asset differs from checked source: '+localPath);
 }
 const source=fs.readFileSync('cloud-sync.js','utf8');
 const url=/const url='([^']+)'/.exec(source)?.[1],key=/const key='([^']+)'/.exec(source)?.[1];
 assert.ok(url&&key,'Public project configuration must exist');
 const headers={apikey:key,Authorization:'Bearer '+key};
 const settings=await get(url+'/auth/v1/settings',{headers});
 report.backend.authSettingsStatus=settings.response.status;
 assert.equal(settings.response.status,200,'Live authentication endpoint is unavailable');
 const rows=await get(url+'/rest/v1/vocal_media?select=id&limit=1',{headers});
 report.backend.anonymousMetadataStatus=rows.response.status;
 assert.ok([200,401,403].includes(rows.response.status),'Unexpected metadata endpoint response');
 if(rows.response.status===200){
  const data=JSON.parse(rows.body);
  assert.ok(Array.isArray(data),'Unexpected anonymous metadata response');
  report.backend.anonymousRows=data.length;
  assert.equal(data.length,0,'Anonymous access exposed private recording IDs');
 }
 report.result='passed';
 console.log(JSON.stringify(report,null,2));
})().catch(error=>{
 report.result='failed';report.error=error.message;
 console.error(JSON.stringify(report,null,2));process.exitCode=1;
}).finally(()=>fs.writeFileSync('production-distribution-report.json',JSON.stringify(report,null,2)));
