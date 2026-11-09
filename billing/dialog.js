/* Project B: in-page confirmation sheet with the same tone as the main app (no native confirm()). */
(()=>{
'use strict';
let open=null;
/** Resolves true when confirmed. {title, message, ok, cancel, danger} */
function ask({title,message='',ok='확인',cancel='취소',danger=false,option='',selectedOk=ok}){
 open?.(false);
 return new Promise(resolve=>{
  const previous=document.activeElement,back=document.createElement('div');back.className='bd-back';
  const sheet=document.createElement('section');sheet.className='bd-sheet';sheet.setAttribute('role','alertdialog');sheet.setAttribute('aria-modal','true');
  const h=document.createElement('h2');h.id='bd-title-'+Date.now();h.textContent=title;sheet.setAttribute('aria-labelledby',h.id);
  const p=document.createElement('p');p.textContent=message;p.id=h.id+'-d';sheet.setAttribute('aria-describedby',p.id);
  const choice=option?document.createElement('input'):null;
  if(choice){choice.type='checkbox';choice.dataset.lessonChoice='';const label=document.createElement('label');label.className='check';label.append(choice,document.createTextNode(option));sheet.append(label);}
  const row=document.createElement('div');row.className='bd-actions';
  const no=document.createElement('button');no.type='button';no.className='bd-ghost';no.dataset.cancel='';no.textContent=cancel;
  const yes=document.createElement('button');yes.type='button';yes.className=danger?'bd-danger':'bd-primary';yes.dataset.ok='';yes.textContent=ok;
  if(choice)choice.onchange=()=>{yes.textContent=choice.checked?selectedOk:ok;};
  row.append(no,yes);sheet.append(Object.assign(document.createElement('div'),{className:'bd-grab'}),h,p);if(choice)sheet.append(choice.parentElement);sheet.append(row);back.append(sheet);
  const done=value=>{if(open!==finish)return;open=null;back.remove();document.removeEventListener('keydown',key,true);if(previous?.isConnected)previous.focus();resolve(option?{confirmed:value,selected:!!value&&choice.checked}:value)};
  const finish=done;open=finish;
  const key=e=>{if(e.key==='Escape'){e.preventDefault();done(false)}if(e.key==='Tab'){const nodes=[...sheet.querySelectorAll('button,input')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus()}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus()}}};
  no.onclick=()=>done(false);yes.onclick=()=>done(true);back.onclick=e=>{if(e.target===back)done(false)};
  document.addEventListener('keydown',key,true);document.body.append(back);(danger?no:yes).focus();
 });
}
window.VzipBillingDialog={ask};
})();
