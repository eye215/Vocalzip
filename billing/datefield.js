/* Project B: dates are typed as digits and shown as YYYY/MM/DD everywhere in billing.
 * Stored values stay YYYY-MM-DD (core.date accepts both), so existing data needs no rewrite. */
(()=>{
'use strict';
const C=window.VzipBilling;
const pad=n=>String(n).padStart(2,'0');
/** Any date we can read → "YYYY/MM/DD"; unreadable text is returned unchanged. */
function show(value){
 if(value==null||value==='')return '';
 const text=String(value).trim();
 if(/^\d{4}\/\d{2}\/\d{2}$/.test(text))return text;
 try{return C.date(text).replace(/-/g,'/')}catch{return text}
}
/** Digits typed so far → "YYYY/MM/DD" shape (slashes added automatically). */
function shape(text){
 const d=String(text).replace(/\D/g,'').slice(0,8);
 return d.length>6?d.slice(0,4)+'/'+d.slice(4,6)+'/'+d.slice(6):d.length>4?d.slice(0,4)+'/'+d.slice(4):d;
}
const native=Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value');
/** Turn a date input into a numeric text field that reads and writes YYYY/MM/DD. */
function enhance(input){
 if(input.dataset.billingDate)return input;
 input.dataset.billingDate='1';
 input.type='text';input.inputMode='numeric';input.autocomplete='off';input.placeholder='YYYY/MM/DD';
 input.pattern='\\d{4}/\\d{2}/\\d{2}';
 Object.defineProperty(input,'value',{configurable:true,get(){return native.get.call(this)},set(v){native.set.call(this,show(v))}});
 input.value=native.get.call(input);
 input.addEventListener('input',()=>{
  const raw=native.get.call(input);
  // Typing or pasting digits: keep the YYYY/MM/DD shape. Pasted text (e.g. "January 26, 2026") is converted on blur.
  if(/^[\d/.\- ]*$/.test(raw)){const next=shape(raw);if(next!==raw)native.set.call(input,next)}
  else{const next=show(raw);if(/^\d{4}\/\d{2}\/\d{2}$/.test(next))native.set.call(input,next)}
  input.removeAttribute('aria-invalid');
 });
 input.addEventListener('blur',()=>{const raw=native.get.call(input);if(!raw)return;const next=show(raw);native.set.call(input,next);if(!/^\d{4}\/\d{2}\/\d{2}$/.test(next))input.setAttribute('aria-invalid','true')});
 return input;
}
window.VzipBillingDate={show,shape,enhance};
})();
