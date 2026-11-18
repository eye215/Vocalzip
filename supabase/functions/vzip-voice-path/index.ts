import '../../../app/voice-path-separation-model.js';
import {createHandler} from './handler.mjs';
const contract=(globalThis as any).VzipVoicePathSeparation;
const url=Deno.env.get('SUPABASE_URL')||'',anon=Deno.env.get('SUPABASE_ANON_KEY')||'',service=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
const allowed=(Deno.env.get('STT_ALLOWED_USER_IDS')||'').split(',').map(x=>x.trim()).filter(Boolean);
const admin={apikey:service,authorization:'Bearer '+service,'content-type':'application/json'};
const address=(owner:string,id:string)=>url+'/rest/v1/vocal_media?user_id=eq.'+encodeURIComponent(owner)+'&id=eq.'+encodeURIComponent(id);
Deno.serve(createHandler({contract,
 async authenticate(token:string){
  const headers={apikey:anon,authorization:'Bearer '+token};
  const response=await fetch(url+'/auth/v1/user',{headers,signal:AbortSignal.timeout(10000)});if(!response.ok)return null;const user=await response.json();if(!allowed.includes(user.id))return null;
  const rpc=await fetch(url+'/rest/v1/rpc/vzip_ai_owner_allowed',{method:'POST',headers:{...headers,'content-type':'application/json'},body:'{}',signal:AbortSignal.timeout(10000)});return {id:user.id,allowed:rpc.ok&&(await rpc.json())===true};
 },
 async load(owner:string,id:string){const response=await fetch(address(owner,id)+'&select=metadata,updated_at',{headers:admin,signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error('load');const rows=await response.json();return rows.length===1?rows[0]:null;},
 async save(owner:string,id:string,row:any,q:any){
  const stamp=Date.parse(row.updated_at);if(!Number.isFinite(stamp))throw Error('version');
  const response=await fetch(address(owner,id)+'&updated_at=eq.'+encodeURIComponent(row.updated_at)+'&select=id',{method:'PATCH',headers:{...admin,prefer:'return=representation'},body:JSON.stringify({metadata:{...row.metadata,[contract.FIELD]:q},updated_at:new Date(Math.max(Date.now(),stamp+1)).toISOString()}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('save');return (await response.json()).length===1;
 }
}));
