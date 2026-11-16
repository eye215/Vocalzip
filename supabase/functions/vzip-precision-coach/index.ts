// Source only: do not deploy as part of this PR. Reuses verified Auth and existing owner RPC, no schema writes.
import {createHandler} from './handler.mjs';
const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'';
const allowed=(Deno.env.get('STT_ALLOWED_USER_IDS')||'').split(',').map(x=>x.trim()).filter(Boolean);
const handler=createHandler({
 async authenticate(token:string){
  const headers={apikey:anon,authorization:'Bearer '+token};
  const user=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});if(!user.ok)return null;const data=await user.json();if(!data.id||!allowed.includes(data.id))return null;
  const rpc=await fetch(url+'/rest/v1/rpc/vzip_ai_owner_allowed',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});
  return {allowed:rpc.ok&&(await rpc.json())===true};
 },
 async generate(evidence:unknown,system:string,signal:AbortSignal){
  const key=Deno.env.get('nemotron_ultra');if(!key)throw Error('provider not configured');
  const response=await fetch('https://integrate.api.nvidia.com/v1/chat/completions',{method:'POST',headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:'nvidia/nemotron-3-ultra-550b-a55b',stream:false,temperature:.1,max_tokens:1200,messages:[{role:'system',content:system},{role:'user',content:JSON.stringify(evidence)}]}),signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
  if(!response.ok)throw Error('provider failed');const data=await response.json();return JSON.parse(String(data.choices?.[0]?.message?.content||'').replace(/^```(?:json)?\s*|\s*```$/g,''));
 }
});
Deno.serve(handler);
