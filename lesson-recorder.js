/* Retain the legacy library adapter; the shared capture component owns new lessons. */
(()=>{
'use strict';
const slot=document.querySelector('#vzip-lesson-recorder-slot');if(!slot)return;
const legacy=document.querySelector('#vzip-recorder');
if(legacy){legacy.id='vzip-legacy-recorder';legacy.hidden=true;legacy.style.setProperty('display','none','important')}
const host=document.createElement('div');host.id='vzip-recorder';slot.append(host);
})();
