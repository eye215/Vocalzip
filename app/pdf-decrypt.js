/* Opens a PDF that is encrypted but needs no password to open, so pdf-lib can copy its pages.
 *
 * Many bought or downloaded scores are saved with an owner password only: anyone can open and read them (GoodNotes,
 * Preview and pdf.js do without asking), but the content is stored encrypted with a key derived from an empty user
 * password, and pdf-lib refuses such files. This reads the file the same way a viewer does, on this device, and gives
 * pdf-lib the readable objects. A file that really needs a password to open is refused, never guessed at.
 *
 * Standard security handler (PDF 32000-1 §7.6, ISO 32000-2 for AES-256): RC4 40–128 bit (R2–R4), AES-128 (R4),
 * AES-256 (R5, R6). Strings and streams of top-level objects are decrypted; objects inside object streams are not
 * encrypted separately, so those streams are decrypted first and then unpacked. Nothing is written back to the file. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.VzipPdfDecrypt=api;})(typeof window==='object'?window:globalThis,function(){
'use strict';
const subtle=()=>{const s=globalThis.crypto&&globalThis.crypto.subtle;if(!s)throw fail('이 브라우저에서는 잠긴 PDF를 열 수 없어요.','crypto');return s;};
const fail=(message,code)=>Object.assign(new Error(message),{code});
const PAD=Uint8Array.from([0x28,0xbf,0x4e,0x5e,0x4e,0x75,0x8a,0x41,0x64,0x00,0x4e,0x56,0xff,0xfa,0x01,0x08,0x2e,0x2e,0x00,0xb6,0xd0,0x68,0x3e,0x80,0x2f,0x0c,0xa9,0xfe,0x64,0x53,0x69,0x7a]);
const ENDOBJ=[101,110,100,111,98,106];
const cat=(...parts)=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const same=(a,b,n)=>{if(a.length<n||b.length<n)return false;for(let i=0;i<n;i++)if(a[i]!==b[i])return false;return true;};

/** MD5 (RFC 1321). WebCrypto has no MD5, and the RC4/AES-128 handlers are built on it. */
const MD5_S=[7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,5,9,14,20,5,9,14,20,5,9,14,20,5,9,14,20,4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21];
const MD5_K=Array.from({length:64},(_,i)=>Math.floor(Math.abs(Math.sin(i+1))*2**32)>>>0);
function md5(data){
 const n=data.length,total=((n+8)>>>6<<6)+64,m=new Uint8Array(total);m.set(data);m[n]=0x80;
 const bits=n*8;for(let i=0;i<8;i++)m[total-8+i]=i<4?(bits>>>(8*i))&255:Math.floor(bits/2**(8*i))&255;
 let a0=0x67452301,b0=0xefcdab89,c0=0x98badcfe,d0=0x10325476;const w=new Int32Array(16);
 for(let off=0;off<total;off+=64){
  for(let i=0;i<16;i++)w[i]=m[off+i*4]|m[off+i*4+1]<<8|m[off+i*4+2]<<16|m[off+i*4+3]<<24;
  let a=a0,b=b0,c=c0,d=d0;
  for(let i=0;i<64;i++){
   let f,g;
   if(i<16){f=(b&c)|(~b&d);g=i;}else if(i<32){f=(d&b)|(~d&c);g=(5*i+1)&15;}else if(i<48){f=b^c^d;g=(3*i+5)&15;}else{f=c^(b|~d);g=(7*i)&15;}
   const t=d;d=c;c=b;const x=(a+f+MD5_K[i]+w[g])|0;b=(b+((x<<MD5_S[i])|(x>>>(32-MD5_S[i]))))|0;a=t;
  }
  a0=(a0+a)|0;b0=(b0+b)|0;c0=(c0+c)|0;d0=(d0+d)|0;
 }
 const out=new Uint8Array(16);[a0,b0,c0,d0].forEach((v,i)=>{for(let k=0;k<4;k++)out[i*4+k]=(v>>>(8*k))&255;});return out;
}
function rc4(key,data){
 const s=new Uint8Array(256);for(let i=0;i<256;i++)s[i]=i;
 for(let i=0,j=0;i<256;i++){j=(j+s[i]+key[i%key.length])&255;const t=s[i];s[i]=s[j];s[j]=t;}
 const out=new Uint8Array(data.length);
 for(let k=0,i=0,j=0;k<data.length;k++){i=(i+1)&255;j=(j+s[i])&255;const t=s[i];s[i]=s[j];s[j]=t;out[k]=data[k]^s[(s[i]+s[j])&255];}
 return out;
}
const aesKey=(key,use)=>subtle().importKey('raw',key,{name:'AES-CBC'},false,[use]);
/** AES-CBC without padding (used by the R6 password hash). */
async function aesEncryptRaw(key,iv,data){return new Uint8Array(await subtle().encrypt({name:'AES-CBC',iv},await aesKey(key,'encrypt'),data)).subarray(0,data.length);}
/** AES-CBC decryption that does not reject bad padding: a block of valid padding is appended, so WebCrypto always
 *  succeeds and returns the raw plaintext; the PDF's own padding is then removed only when it is well-formed. */
async function aesDecryptRaw(key,iv,body){
 if(!body.length)return new Uint8Array(0);
 const enc=await subtle().importKey('raw',key,{name:'AES-CBC'},false,['encrypt','decrypt']);
 const extra=new Uint8Array(await subtle().encrypt({name:'AES-CBC',iv:body.slice(body.length-16)},enc,new Uint8Array(16).fill(16))).subarray(0,16);
 return new Uint8Array(await subtle().decrypt({name:'AES-CBC',iv},enc,cat(body,extra)));
}
const unpad=data=>{const p=data[data.length-1];if(!p||p>16||p>data.length)return data;for(let i=1;i<=p;i++)if(data[data.length-i]!==p)return data;return data.subarray(0,data.length-p);};
/** AES-encrypted data starts with its 16-byte IV; a trailing partial block (seen in some writers) is ignored. */
async function aesData(key,data){
 if(data.length<16)return new Uint8Array(0);
 const body=data.subarray(16,16+Math.floor((data.length-16)/16)*16);
 return unpad(await aesDecryptRaw(key,data.slice(0,16),body));
}
const sha=async(name,data)=>new Uint8Array(await subtle().digest(name,data));
/** ISO 32000-2 Algorithm 2.B (R6), for an empty password and no user-key data. */
async function hash6(password,salt){
 let k=await sha('SHA-256',cat(password,salt)),e=new Uint8Array(0);
 for(let round=0;round<64||e[e.length-1]>round-32;round++){
  const one=cat(password,k),block=new Uint8Array(one.length*64);for(let i=0;i<64;i++)block.set(one,i*one.length);
  e=await aesEncryptRaw(k.subarray(0,16),k.subarray(16,32),block);
  let mod=0;for(let i=0;i<16;i++)mod+=e[i];
  k=await sha(['SHA-256','SHA-384','SHA-512'][mod%3],e);
 }
 return k.subarray(0,32);
}

/** The file key for an empty user password, or a 'password' error when the file needs a real password to open. */
async function fileKey(enc){
 const {V,R,O,U,UE,P,id,length,encryptMetadata}=enc,empty=new Uint8Array(0);
 if(R>=5){
  if(U.length<48||!UE||UE.length<32)throw fail('PDF 잠금 정보가 올바르지 않아요.','format');
  const check=R===5?await sha('SHA-256',cat(empty,U.subarray(32,40))):await hash6(empty,U.subarray(32,40));
  if(!same(check,U,32))throw fail('비밀번호가 있어야 열리는 PDF예요. 비밀번호를 풀고 다시 가져와 주세요.','password');
  const middle=R===5?await sha('SHA-256',cat(empty,U.subarray(40,48))):await hash6(empty,U.subarray(40,48));
  return aesDecryptRaw(middle,new Uint8Array(16),UE.subarray(0,32));
 }
 const n=R===2?5:Math.min(16,Math.max(5,length/8|0));
 const p=P>>>0,pb=Uint8Array.from([p&255,(p>>>8)&255,(p>>>16)&255,(p>>>24)&255]);
 let key=md5(cat(PAD,O.subarray(0,32),pb,id,R>=4&&!encryptMetadata?Uint8Array.from([255,255,255,255]):empty));
 if(R>=3)for(let i=0;i<50;i++)key=md5(key.subarray(0,n));
 key=key.slice(0,n);
 let ok;
 if(R===2)ok=same(rc4(key,PAD),U,32);
 else{let x=rc4(key,md5(cat(PAD,id)));for(let i=1;i<=19;i++)x=rc4(key.map(b=>b^i),x);ok=same(x,U,16);}
 if(!ok)throw fail('비밀번호가 있어야 열리는 PDF예요. 비밀번호를 풀고 다시 가져와 주세요.','password');
 return key;
}

/** Opens `bytes` with pdf-lib (`lib` = the PDFLib namespace), decrypting it first if it is encrypted. */
async function load(lib,bytes,options={}){
 const {PDFParser,PDFObjectStreamParser,PDFRawStream,PDFDict,PDFArray,PDFString,PDFHexString,PDFName,PDFRef,PDFNumber,PDFBool,PDFDocument}=lib;
 const parser=PDFParser.forBytesWithOptions(bytes,options.objectsPerTick||500,false,false),context=parser.context;
 const seq=new Map(),deferred=[],ObjStm=PDFName.of('ObjStm'),XRef=PDFName.of('XRef'),Type=PDFName.of('Type');
 let counter=0;
 const original=parser.parseIndirectObject;
 // Same as pdf-lib's own step, except that object streams are kept for later: they cannot be unpacked before
 // they are decrypted, and the key is only known once the trailer has been read.
 parser.parseIndirectObject=async function(){
  const start=this.bytes.offset(),ref=this.parseIndirectObjectHeader();
  this.skipWhitespaceAndComments();const object=this.parseObject();this.skipWhitespaceAndComments();this.matchKeyword(ENDOBJ);
  if(object instanceof PDFRawStream&&object.dict.lookup(Type)===XRef){this.bytes.moveTo(start);return original.call(this);}
  seq.set(ref.tag,++counter);
  if(object instanceof PDFRawStream&&object.dict.lookup(Type)===ObjStm)deferred.push({ref,stream:object,at:counter});
  else context.assign(ref,object);
  return ref;
 };
 await parser.parseDocument();

 const encRef=context.trailerInfo.Encrypt,encDict=encRef?context.lookup(encRef):null;
 let decryptString=null,decryptStream=null;
 if(encDict instanceof PDFDict){
  const get=k=>encDict.lookup(PDFName.of(k)),num=(k,d)=>{const v=get(k);return v instanceof PDFNumber?v.asNumber():d;};
  const bytesOf=v=>v instanceof PDFString||v instanceof PDFHexString?v.asBytes():null;
  const filter=get('Filter');if(filter!==PDFName.of('Standard'))throw fail('이 PDF는 지원하지 않는 방식으로 잠겨 있어요.','unsupported');
  const ids=context.lookup(context.trailerInfo.ID),id=ids instanceof PDFArray&&ids.size()?bytesOf(ids.lookup(0))||new Uint8Array(0):new Uint8Array(0);
  const em=get('EncryptMetadata');
  const enc={V:num('V',0),R:num('R',2),O:bytesOf(get('O'))||new Uint8Array(0),U:bytesOf(get('U'))||new Uint8Array(0),UE:bytesOf(get('UE')),P:num('P',0),id,length:num('Length',40),encryptMetadata:!(em instanceof PDFBool)||em.asBoolean()};
  if(![1,2,4,5].includes(enc.V)||![2,3,4,5,6].includes(enc.R))throw fail('이 PDF는 지원하지 않는 방식으로 잠겨 있어요.','unsupported');
  if(enc.V===4&&!get('Length'))enc.length=128;
  const key=await fileKey(enc);
  // Which cipher strings and streams use: V1/V2 always RC4; V4/V5 name a crypt filter (default Identity).
  const method=name=>{
   if(enc.V<4)return 'rc4';
   if(!name||name===PDFName.of('Identity'))return 'none';
   const cf=get('CF'),entry=cf instanceof PDFDict?cf.lookup(name):null,cfm=entry instanceof PDFDict?entry.lookup(PDFName.of('CFM')):null;
   if(cfm===PDFName.of('V2'))return 'rc4';if(cfm===PDFName.of('AESV2'))return 'aes128';if(cfm===PDFName.of('AESV3'))return 'aes256';
   throw fail('이 PDF는 지원하지 않는 방식으로 잠겨 있어요.','unsupported');
  };
  const stmMethod=method(get('StmF')),strMethod=method(get('StrF'));
  const objectKey=(ref,aes)=>{
   const n=ref.objectNumber,g=ref.generationNumber;
   return md5(cat(key,Uint8Array.from([n&255,(n>>8)&255,(n>>16)&255,g&255,(g>>8)&255]),aes?Uint8Array.from([0x73,0x41,0x6c,0x54]):new Uint8Array(0))).subarray(0,Math.min(key.length+5,16));
  };
  const run=(how,ref,data)=>how==='none'?data:how==='rc4'?rc4(objectKey(ref,false),data):how==='aes128'?aesData(objectKey(ref,true),data):aesData(key,data);
  decryptString=(ref,data)=>run(strMethod,ref,data);
  decryptStream=(ref,data)=>run(stmMethod,ref,data);
 }
 const toHex=b=>{let s='';for(let i=0;i<b.length;i++)s+=(b[i]<16?'0':'')+b[i].toString(16);return s;};
 /** Decrypts every string inside one top-level object, in place. */
 async function strings(ref,object){
  if(object instanceof PDFString||object instanceof PDFHexString)return PDFHexString.of(toHex(await decryptString(ref,object.asBytes())));
  if(object instanceof PDFDict){for(const [k,v] of object.entries())if(v instanceof PDFString||v instanceof PDFHexString||v instanceof PDFDict||v instanceof PDFArray)object.set(k,await strings(ref,v));}
  else if(object instanceof PDFArray){for(let i=0;i<object.size();i++){const v=object.get(i);if(v instanceof PDFString||v instanceof PDFHexString||v instanceof PDFDict||v instanceof PDFArray)object.set(i,await strings(ref,v));}}
  return object;
 }
 const Metadata=PDFName.of('Metadata'),Crypt=PDFName.of('Crypt'),Filter=PDFName.of('Filter');
 async function stream(ref,raw){
  const filters=raw.dict.lookup(Filter),list=filters instanceof PDFArray?filters.asArray():[filters];
  if(list.includes(Crypt))throw fail('이 PDF는 지원하지 않는 방식으로 잠겨 있어요.','unsupported');
  await strings(ref,raw.dict);
  if(raw.dict.lookup(Type)===Metadata&&encDict.lookup(PDFName.of('EncryptMetadata'))===PDFBool.False)return raw;
  return PDFRawStream.of(raw.dict,await decryptStream(ref,raw.contents));
 }
 if(decryptString){
  for(const [ref,object] of context.enumerateIndirectObjects()){
   if(ref===encRef||object===encDict)continue;
   if(object instanceof PDFRawStream)context.assign(ref,await stream(ref,object));
   else await strings(ref,object);
  }
  for(const item of deferred)item.stream=await stream(item.ref,item.stream);
 }
 // Unpack object streams in file order. An object rewritten later in the file (incremental save) keeps its newer copy.
 const assign=context.assign;
 try{
  for(const item of deferred){
   context.assign=function(ref,object){const was=seq.get(ref.tag);if(was!==undefined&&was>item.at)return;seq.set(ref.tag,item.at);return assign.call(this,ref,object);};
   await PDFObjectStreamParser.forStream(item.stream).parseIntoContext();
  }
 }finally{delete context.assign;} // back to pdf-lib's own method on the prototype
 if(encDict){if(encRef instanceof PDFRef)context.delete(encRef);delete context.trailerInfo.Encrypt;}
 return new PDFDocument(context,false,options.updateMetadata!==false);
}
const isEncrypted=error=>!!error&&(error.name==='EncryptedPDFError'||/is encrypted/i.test(String(error.message||'')));
return {load,isEncrypted,_internal:{md5,rc4,fileKey}};
});
