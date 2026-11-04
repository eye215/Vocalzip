/* CSV and XLSX readers. No formula execution or remote workbook requests. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipBillingFiles=api})(globalThis,()=>{
'use strict';const LIMIT=10*1024*1024,XML_LIMIT=16*1024*1024,ROW_LIMIT=2000;
function csv(text){
 text=String(text).replace(/^\uFEFF/,'');let best=',',count=-1;
 for(const delimiter of [',','\t',';']){let n=0,quoted=false;for(let i=0;i<text.length;i++){if(text[i]==='"'){if(quoted&&text[i+1]==='"'){i++;continue}quoted=!quoted}else if(!quoted&&text[i]===delimiter)n++;else if(!quoted&&/[\r\n]/.test(text[i]))break}if(n>count){count=n;best=delimiter}}
 const rows=[];let row=[],cell='',quoted=false,closed=false;
 const pushCell=()=>{row.push(cell);cell='';closed=false;if(row.length>256)throw Error('최대 256열까지 읽을 수 있어요.')};
 const pushRow=()=>{pushCell();if(row.some(cell=>cell.trim()!==''))rows.push(row);row=[];if(rows.length>ROW_LIMIT+1)throw Error('파일은 머리글 포함 최대 2,001행으로 나눠 주세요.')};
 for(let i=0;i<text.length;i++){
  const char=text[i];
  if(quoted){if(char==='"'){if(text[i+1]==='"'){cell+='"';i++}else{quoted=false;closed=true}}else cell+=char;continue}
  if(char==='"'){if(cell||closed)throw Error('CSV 따옴표 형식이 올바르지 않아요.');quoted=true}
  else if(char===best)pushCell();
  else if(char==='\n'||char==='\r'){if(char==='\r'&&text[i+1]==='\n')i++;pushRow()}
  else{if(closed&&!/\s/.test(char))throw Error('CSV 닫는 따옴표 뒤 값을 확인해 주세요.');if(!closed)cell+=char}
 }
 if(quoted)throw Error('CSV 따옴표가 닫히지 않았어요.');if(cell||row.length||closed)pushRow();return rows;
}
function decode(bytes,encoding='auto'){
 if(encoding!=='auto')return new TextDecoder(encoding,{fatal:true}).decode(bytes);
 if(bytes[0]===255&&bytes[1]===254)return new TextDecoder('utf-16le').decode(bytes);
 if(bytes[0]===254&&bytes[1]===255)return new TextDecoder('utf-16be').decode(bytes);
 try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes)}catch{return new TextDecoder('euc-kr',{fatal:true}).decode(bytes)}
}
const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0}
function zip(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===bytes.length){end=i;break}
 if(end<0)throw Error('XLSX ZIP 구조를 읽지 못했어요.');
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true))throw Error('분할 ZIP은 지원하지 않아요.');
 const entries=view.getUint16(end+10,true),files=new Map();let at=view.getUint32(end+16,true),expanded=0;
 if(entries>2000||at>bytes.length)throw Error('워크북 구조가 너무 커요.');
 for(let n=0;n<entries;n++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw Error('XLSX 디렉터리 형식 오류');
  const flags=view.getUint16(at+8,true),method=view.getUint16(at+10,true),crc=view.getUint32(at+16,true),packed=view.getUint32(at+20,true),size=view.getUint32(at+24,true),nameLength=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),offset=view.getUint32(at+42,true);
  const name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nameLength));at+=46+nameLength+extra+comment;expanded+=size;
  if(flags&1||![0,8].includes(method)||size===0xffffffff||offset===0xffffffff)throw Error('암호화·ZIP64·지원하지 않는 압축 파일이에요.');
  if(name.includes('..')||name.startsWith('/')||files.has(name)||expanded>50*1024*1024||at>bytes.length)throw Error('워크북 크기 또는 경로를 확인해 주세요.');
  files.set(name,{method,crc,packed,size,offset});
 }
 return async name=>{
  const item=files.get(name);if(!item)throw Error('워크북 구성 파일이 없어요: '+name);
  if(item.size>XML_LIMIT||item.offset+30>bytes.length||view.getUint32(item.offset,true)!==0x04034b50)throw Error('시트 크기/형식 제한을 초과했어요.');
  const start=item.offset+30+view.getUint16(item.offset+26,true)+view.getUint16(item.offset+28,true);
  if(start+item.packed>bytes.length)throw Error('잘린 XLSX 파일이에요.');
  const packed=bytes.subarray(start,start+item.packed);let output;
  if(item.method===0)output=packed;
  else{
   let stream;try{stream=new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))}catch{throw Error('이 브라우저의 XLSX 압축 해제가 지원되지 않아요. 최신 Safari 또는 CSV 내보내기를 사용해 주세요.')}
   const reader=stream.getReader(),chunks=[];let total=0;
   for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>item.size||total>XML_LIMIT){await reader.cancel();throw Error('압축 해제 크기 제한을 초과했어요.')}chunks.push(value)}
   output=new Uint8Array(total);let pos=0;for(const part of chunks){output.set(part,pos);pos+=part.length}
  }
  if(output.length!==item.size||crc32(output)!==item.crc)throw Error('XLSX 파일이 손상되었어요.');
  return new TextDecoder('utf-8',{fatal:true}).decode(output);
 };
}
function xml(text){if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('지원하지 않는 XML 선언이에요.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('XLSX XML 형식 오류');return doc}
const elements=(node,name)=>[...node.getElementsByTagNameNS('*',name)];
function path(base,target){if(/^[a-z]+:/i.test(target))throw Error('외부 시트 연결은 지원하지 않아요.');const pieces=(target.startsWith('/')?target.slice(1):base+target).split('/'),result=[];for(const part of pieces){if(part==='..'){if(!result.length)throw Error('잘못된 시트 경로');result.pop()}else if(part&&part!=='.')result.push(part)}return result.join('/')}
async function xlsx(bytes){
 const read=zip(bytes),book=xml(await read('xl/workbook.xml')),rels=xml(await read('xl/_rels/workbook.xml.rels'));
 const relationships=new Map(elements(rels,'Relationship').filter(row=>row.getAttribute('TargetMode')!=='External').map(row=>[row.getAttribute('Id'),path('xl/',row.getAttribute('Target'))]));
 let strings=[];const shared=elements(rels,'Relationship').find(row=>/\/sharedStrings$/.test(row.getAttribute('Type')));
 if(shared){const doc=xml(await read(path('xl/',shared.getAttribute('Target'))));strings=elements(doc,'si').map(node=>elements(node,'t').map(t=>t.textContent).join(''));if(strings.length>100000)throw Error('문자열이 너무 많은 워크북이에요.')}
 const sheets=elements(book,'sheet').map(node=>({name:node.getAttribute('name'),path:relationships.get(node.getAttribute('r:id')||node.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships','id'))}));
 if(!sheets.length||sheets.some(sheet=>!sheet.path))throw Error('읽을 수 있는 시트가 없어요.');
 const date1904=['1','true'].includes(elements(book,'workbookPr')[0]?.getAttribute('date1904'));
 return {sheets:sheets.map(sheet=>sheet.name),date1904,readSheet:async index=>{
  const doc=xml(await read(sheets[index].path)),rows=[];
  for(const row of elements(doc,'row')){
   const cells=[];for(const cell of elements(row,'c')){
    const letters=(cell.getAttribute('r')||'').match(/^[A-Z]+/)?.[0];if(!letters)throw Error('셀 주소가 없어요.');
    const column=[...letters].reduce((n,char)=>n*26+char.charCodeAt(0)-64,0)-1;if(column>255)throw Error('최대 256열까지 읽을 수 있어요.');
    const type=cell.getAttribute('t'),value=elements(cell,'v')[0]?.textContent??'';
    if(type==='e')cells[column]='';else if(type==='s')cells[column]=strings[Number(value)]??'';
    else if(type==='inlineStr')cells[column]=elements(cell,'t').map(node=>node.textContent).join('');
    else cells[column]=value!==''&&(!type||type==='n')?Number(value):value;
   }
   if(cells.some(value=>value!==''&&value!==undefined))rows.push(Array.from({length:cells.length},(_,i)=>cells[i]??''));
   if(rows.length>ROW_LIMIT+1)throw Error('시트는 머리글 포함 최대 2,001행으로 나눠 주세요.');
  }return rows;
 }};
}
async function open(file,encoding='auto'){
 if(file.size>LIMIT)throw Error('파일은 10MB 이하로 나눠 주세요.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
 if(/\.xlsx$/i.test(file.name))return {...await xlsx(bytes),hash};
 if(!/\.csv$/i.test(file.name))throw Error('CSV 또는 XLSX 파일을 선택해 주세요.');
 const rows=csv(decode(bytes,encoding));return {sheets:['CSV'],date1904:false,hash,readSheet:async()=>rows};
}
return {csv,decode,zip,xlsx,open,crc32};
});
