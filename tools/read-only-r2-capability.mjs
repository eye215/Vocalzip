// Read-only Cloudflare deployment capability check. Never logs API bodies or credentials.
const token=process.env.CLOUDFLARE_API_TOKEN||process.env.CF_API_TOKEN;
const legacy=process.env.CLOUDFLARE_API_KEY||process.env.CF_API_KEY,email=process.env.CLOUDFLARE_EMAIL||process.env.CF_EMAIL;
const configured=process.env.CLOUDFLARE_ACCOUNT_ID||process.env.CF_ACCOUNT_ID;
const summary={token_configured:!!token,account_configured:!!configured,legacy_key_configured:!!legacy,email_configured:!!email};
async function get(path){
 const response=await fetch('https://api.cloudflare.com/client/v4'+path,{headers:token?{Authorization:'Bearer '+token}:{'X-Auth-Key':legacy,'X-Auth-Email':email},signal:AbortSignal.timeout(10000)});
 if(!response.ok)return null;const body=await response.json();return body.success?body.result:null;
}
try{
 if(token||(legacy&&email)){
  let accounts=configured&&/^[a-f0-9]{32}$/i.test(configured)?[{id:configured}]:await get('/accounts?per_page=50');
  summary.accounts_readable=Array.isArray(accounts);
  let target=null;
  for(const account of accounts||[]){
   if(!/^[a-f0-9]{32}$/i.test(account.id))continue;
   const subdomain=await get('/accounts/'+account.id+'/workers/subdomain');
   if(subdomain?.subdomain==='eye215'){target=account.id;break;}
  }
  summary.target_account_found=!!target;
  if(target){
   const settings=await get('/accounts/'+target+'/workers/scripts/vocalzip-media/settings');
   summary.settings_readable=!!settings;
   const bindings=settings?.bindings||[];
   summary.r2_binding=bindings.some(b=>b.name==='MEDIA'&&b.type==='r2_bucket'&&b.bucket_name==='vocalzip-media');
   summary.session_guard=bindings.some(b=>b.name==='SESSION_GUARD_ENABLED'&&b.text==='true');
   summary.stt_disabled=bindings.some(b=>b.name==='STT_CLIP_ENABLED'&&b.text==='false');
   summary.v2_enabled=bindings.some(b=>b.name==='UPLOADS_V2_ENABLED'&&b.text==='true');
  }
 }
}catch{summary.checked=false;}
console.log(JSON.stringify(summary));
