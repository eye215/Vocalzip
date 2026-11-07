// Read-only reference calibration. No service or user data access.
const fs=require('node:fs/promises');
const {chromium}=require('@playwright/test');
(async()=>{
 const source=await fs.readFile('design-system/assets/approved-reference.jpeg');
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  const palette=await page.evaluate(async data=>{
   const img=new Image();img.src='data:image/jpeg;base64,'+data;await img.decode();
   const canvas=document.createElement('canvas');canvas.width=709;canvas.height=1536;
   const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0,709,1536);
   const regions=[
    ['heading',105,510,190,35,'text'],['eventTitle',73,274,275,38,'text'],
    ['body',395,573,185,32,'ink'],['dayAccent',395,298,90,35,'pink'],
    ['practiceLow',79,887,40,40,'badge'],['practiceMet',164,887,40,40,'badge'],['practiceHigh',250,887,40,40,'badge']
   ];
   const result={size:[canvas.width,canvas.height]};
   for(const [name,x,y,w,h,kind]of regions){
    const pixels=ctx.getImageData(x,y,w,h).data,rows=[];
    for(let i=0;i<pixels.length;i+=4){
     const [r,g,b]=pixels.slice(i,i+3),chroma=Math.max(r,g,b)-Math.min(r,g,b);
     const ok=kind==='text'?b>r&&g<145&&chroma>30:
      kind==='ink'?r<90&&g<80&&b<125:
      kind==='pink'?r>185&&b>150&&g<155&&r>g+60:
      b>r&&r>90&&g>65&&chroma>25;
     if(ok)rows.push([r,g,b]);
    }
    const rgb=[0,1,2].map(c=>{const values=rows.map(p=>p[c]).sort((a,b)=>a-b);return values[Math.floor(values.length/2)]??null;});
    result[name]={rgb,samples:rows.length,hex:rgb.every(v=>v!=null)?'#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join(''):null};
   }
   return result;
  },source.toString('base64'));
  console.log('REFERENCE_PALETTE '+JSON.stringify(palette));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
