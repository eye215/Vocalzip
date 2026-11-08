/* D20 session management. Native dialog provides focus trapping and background inertness. */
(()=>{
'use strict';
if(!window.VZIP_DEVICE_SESSIONS_ENABLED)return;
let closeCurrent=null;
const style=document.createElement('style');
style.textContent=`#vzip-device-dialog{box-sizing:border-box;width:min(100% - 24px,480px);max-height:85dvh;overflow:auto;border:1px solid #e8def9;border-radius:24px;padding:24px;color:#302742;background:#fcfaff;padding-bottom:max(24px,env(safe-area-inset-bottom))}#vzip-device-dialog::backdrop{background:#24163870}#vzip-device-dialog h2{font-size:21px;margin:0 0 14px}#vzip-device-dialog p{line-height:1.6}#vzip-device-dialog button,#vzip-device-dialog select{min-height:44px;width:100%;margin-top:10px;border:1px solid #dcd0ed;border-radius:12px;padding:10px;background:white;color:#533383;font:inherit}#vzip-device-dialog button[data-primary]{background:var(--accent,#7A32F5);color:white}#vzip-device-dialog li{padding:12px 0;border-bottom:1px solid #e8def9;list-style:none}#vzip-device-dialog ul{padding:0}#vzip-device-dialog [role=status]{color:#754080;min-height:1.5em}`;
document.head.appendChild(style);
function modal(title){
 closeCurrent?.();
 const box=document.createElement('dialog');box.id='vzip-device-dialog';
 const heading=document.createElement('h2');heading.id='vzip-device-title';heading.textContent=title;
 box.setAttribute('aria-labelledby',heading.id);box.appendChild(heading);
 const body=document.createElement('div');box.appendChild(body);
 const status=document.createElement('p');status.setAttribute('role','status');box.appendChild(status);
 let busy=false,done=false,settle;
 const promise=new Promise(resolve=>{settle=resolve;});
 const finish=value=>{if(done)return;done=true;box.close();box.remove();if(closeCurrent===cancel)closeCurrent=null;settle(value);};
 const cancel=()=>finish(null);closeCurrent=cancel;
 box.addEventListener('cancel',e=>{e.preventDefault();if(!busy)cancel();});
 document.body.appendChild(box);box.showModal();
 return{box,body,status,promise,finish,cancel,get busy(){return busy;},set busy(value){busy=value;box.querySelectorAll('button,select').forEach(el=>{el.disabled=value;});}};
}
function paragraph(host,text){const p=document.createElement('p');p.textContent=text;host.appendChild(p);return p;}
function button(host,label,fn,primary=false){
 const b=document.createElement('button');b.type='button';b.textContent=label;
 if(primary)b.dataset.primary='';b.onclick=fn;host.appendChild(b);return b;
}
function describe(s){const time=new Date(s.created_at);return s.label+' · '+(Number.isNaN(time.getTime())?'등록 시각 없음':time.toLocaleString('ko-KR'));}
window.VzipDeviceSessions={
 close:()=>closeCurrent?.(),
 async chooseReplacement(snapshot){
  const view=modal('로그인 세션 한도');
  paragraph(view.body,'이 계정에 '+snapshot.limit+'개의 로그인 세션이 있어요. 종료할 로그인을 직접 선택해 주세요. 종료된 기기의 미전송 녹음은 그 기기에 보존됩니다.');
  paragraph(view.body,'같은 기기의 브라우저와 설치형 웹앱은 별도 로그인으로 표시될 수 있어요.');
  const label=document.createElement('label');label.textContent='종료할 로그인';label.htmlFor='vzip-replace-session';view.body.appendChild(label);
  const select=document.createElement('select');select.id=label.htmlFor;
  const placeholder=new Option('로그인을 선택하세요','');select.appendChild(placeholder);
  for(const session of snapshot.sessions)select.appendChild(new Option(describe(session),session.session_id));
  view.body.appendChild(select);
  const cancel=button(view.body,'취소',view.cancel);
  const approve=button(view.body,'선택한 로그인 종료하고 계속',()=>{
   if(select.value)view.finish({session_id:select.value,revision:snapshot.revision});
  },true);
  approve.disabled=true;select.onchange=()=>{approve.disabled=!select.value;};
  cancel.focus();
  return view.promise;
 },
 async manage(snapshot,actions){
  const view=modal('로그인 기기 관리');
  const safe=()=>actions.isCurrent()&&view.box.isConnected;
  const run=async fn=>{
   if(view.busy||!safe())return;
   view.busy=true;view.status.textContent='처리 중…';
   try{await fn();}catch(e){if(view.box.isConnected)view.status.textContent=e.message;}
   finally{if(view.box.isConnected)view.busy=false;}
  };
  const render=data=>{
   if(!safe())return;
   snapshot=data;view.body.replaceChildren();view.status.textContent='';
   paragraph(view.body,'현재 '+data.sessions.length+'개 / 한도 '+data.limit+'개 로그인. 로그아웃해도 이 기기에 남은 녹음·초안은 삭제하지 않아요.');
   const list=document.createElement('ul');view.body.appendChild(list);
   for(const session of data.sessions){
    const li=document.createElement('li');paragraph(li,describe(session)+(session.session_id===data.current_session?' · 이 로그인':''));
    button(li,session.session_id===data.current_session?'이 기기 로그아웃':'이 로그인 로그아웃',()=>confirmAction(session));list.appendChild(li);
   }
   button(view.body,'목록 새로고침',()=>run(async()=>render(await actions.refresh())));
   button(view.body,'모든 기기 로그아웃',()=>confirmAction(null));
   button(view.body,'닫기',view.cancel);
  };
  const confirmAction=session=>{
   view.body.replaceChildren();
   paragraph(view.body,session?'이 로그인을 종료할까요? '+describe(session):'현재 기기를 포함한 모든 로그인을 종료할까요?');
   paragraph(view.body,'미전송 녹음은 해당 기기에 남으며, 다음 로그인 후 같은 계정으로 복구할 수 있어요.');
   button(view.body,'취소',()=>render(snapshot));
   button(view.body,'로그아웃 확인',()=>run(async()=>{
    const result=await actions.revoke(session?.session_id||null,snapshot.revision);
    if(!safe())return;
    if(result?.status==='sessions_changed'){render(result);view.status.textContent='로그인 목록이 바뀌었어요. 다시 선택해 주세요.';return;}
    render(result);
   }),true);
  };
  render(snapshot);view.box.querySelector('button')?.focus();
  return view.promise;
 }
};
})();
