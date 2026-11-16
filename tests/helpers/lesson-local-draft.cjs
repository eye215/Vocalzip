const {expect}=require('@playwright/test');
const A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const SESSION='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const seed=()=>({categories:[],songs:[{id:'song-test',title:'테스트 곡'}],lessons:[
 {id:'lesson-test-a',date:'2026-11-13',startTime:'13:00',status:'scheduled',prepMemo:'확정 준비',memo:'확정 메모',feedback:'확정 피드백',songIds:['song-test'],songFeedback:{'song-test':'곡별 확정 피드백'},recordings:[],updatedAt:1},
 {id:'lesson-test-b',date:'2026-11-14',startTime:'14:00',status:'scheduled',prepMemo:'다른 준비',memo:'다른 메모',feedback:'다른 피드백',recordings:[],updatedAt:1}
],assignments:[],practices:[],performances:[]});
const stub=`
window.__serverWrites=0;window.__serverReads=0;
const owner=()=>localStorage.getItem('__draft_user');
window.supabase={createClient:()=>({
 auth:{getUser:async()=>({data:{user:owner()?{id:owner(),email:'fake@test.invalid'}:null}}),
 getSession:async()=>({data:{session:{access_token:'fake-test-token'}}}),
 onAuthStateChange:fn=>{window.__draftAuth=fn;return{data:{subscription:{unsubscribe(){}}}}},
 signOut:async()=>{localStorage.setItem('__draft_user','');window.__draftAuth('SIGNED_OUT',null);return{};}},
 rpc:async name=>({data:name==='vzip_register_session'?{status:'active',current_session:'${SESSION}',sessions:[]}:name==='vzip_session_is_active'?true:null,error:null}),
 from:table=>{
  let write=null,requestedOwner=owner(),single=false;
  const q={};for(const method of ['select','eq','is','order','range','limit','in','upsert','insert','update','delete','maybeSingle'])q[method]=(...args)=>{
   if(method==='eq'&&args[0]==='user_id')requestedOwner=args[1];
   if(method==='maybeSingle')single=true;
   if(['upsert','insert','update','delete'].includes(method))write={method,value:args[0]};return q;
  };
  q.then=resolve=>{
   if(table!=='vocal_data')return resolve({data:[],error:null});
   if(write){window.__serverWrites++;if(window.__failServer)return resolve({data:null,error:{message:'fake server failure'}});
    localStorage.setItem('__draft_server_'+requestedOwner,JSON.stringify({payload:write.value.payload,updated_at:write.value.updated_at}));
    return resolve({data:[{user_id:requestedOwner}],error:null});}
   window.__serverReads++;
   const data=JSON.parse(localStorage.getItem('__draft_server_'+requestedOwner)||'null');
   return resolve({data:single?data:data?[data]:[],error:null});
  };return q;
 },storage:{from:()=>({})}
})};`;
async function setup(page,{owner=A}={}){
 page.__draftErrors=[];page.on('pageerror',e=>page.__draftErrors.push(e.message));
 await page.route('**/supabase.min.js',r=>r.fulfill({contentType:'application/javascript',body:stub}));
 await page.route('**/r2-config.js*',r=>r.fulfill({contentType:'application/javascript',body:"window.VZIP_R2_ENDPOINT='';"}));
 await page.route('**/tus.min.js',r=>r.fulfill({contentType:'application/javascript',body:'window.tus={}'}));
 await page.route('**/*.supabase.co/**',r=>r.abort());
 await page.addInitScript(({owner,data})=>{
  window.VZIP_DEVICE_SESSIONS_ENABLED=true;window.VZIP_ONE_ACCOUNT_PER_BROWSER=false;
  if(!sessionStorage.getItem('__draft_seeded')){
   sessionStorage.setItem('__draft_seeded','1');localStorage.setItem('__draft_user',owner);
   localStorage.setItem('vzip_account_scope_owner_v1',owner);
   for(const id of [owner,'22222222-2222-4222-8222-222222222222']){
    localStorage.setItem('vzip_account_v1:'+id+':vocal-zip_mvp_v1',JSON.stringify(data));
    localStorage.setItem('__draft_server_'+id,JSON.stringify({payload:data,updated_at:'2026-11-01T00:00:00Z'}));
   }
  }
 },{owner,data:seed()});
 await page.goto('/#/lesson/lesson-test-a');
 await expect(page.locator('#vzip-auth-screen')).toBeHidden();
 await expect(page.locator('[data-fb]')).toBeVisible();
}
const feedback=async page=>{await page.locator('[data-fb]').click();await expect(page.locator('#fb-form')).toBeVisible();};
const schedule=async page=>{await page.locator('[data-edit-lesson]').click();await expect(page.locator('#lesson-form')).toBeVisible();};
const close=async page=>{
 await page.locator('.sheet [data-close]').last().click();
 const confirm=page.getByRole('button',{name:'닫기',exact:true});
 if(await confirm.isVisible())await confirm.click();
};
const drafts=page=>page.evaluate(()=>{
 const s=VzipAccountScope.storage,rows=[];
 for(let i=0;i<s.length;i++){const k=s.key(i);if(k.startsWith('vzip_field_outbox_v1:'))rows.push(JSON.parse(s.getItem(k)));}
 return rows;
});
module.exports={A,B,SESSION,seed,setup,feedback,schedule,close,drafts};
