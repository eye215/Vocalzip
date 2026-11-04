/* Random-access output fallback for browsers without OPFS; allocation is strictly capped. */
((root)=>{
'use strict';
function create(limit=24*1024*1024,blockSize=65536){
 const blocks=new Map();let size=0;
 return {
  write({data,position}){
   const end=position+data.byteLength;
   if(!Number.isSafeInteger(position)||position<0||!Number.isSafeInteger(end)||end>limit)throw Error('이 브라우저에서는 추출한 음원이 24MB 이하일 때 가져올 수 있어요. 음원 파일로 가져와 주세요.');
   let read=0;
   while(read<data.byteLength){
    const offset=position+read,index=Math.floor(offset/blockSize),start=offset%blockSize;
    let block=blocks.get(index);if(!block){block=new Uint8Array(Math.min(blockSize,limit-index*blockSize));blocks.set(index,block)}
    const count=Math.min(block.length-start,data.byteLength-read);block.set(data.subarray(read,read+count),start);read+=count;
   }
   size=Math.max(size,end);
  },
  parts(){const result=[];for(let at=0;at<size;at+=blockSize){const index=Math.floor(at/blockSize),length=Math.min(blockSize,size-at);result.push((blocks.get(index)||new Uint8Array(length)).subarray(0,length))}return result},
  get size(){return size},
  clear(){blocks.clear();size=0}
 };
}
root.VzipBoundedBytes={create};if(typeof module!=='undefined'&&module.exports)module.exports={create};
})(typeof self!=='undefined'?self:globalThis);
