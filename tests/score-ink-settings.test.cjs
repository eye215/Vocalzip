const {test}=require('node:test'),assert=require('node:assert/strict');
const {create,PALETTES}=require('../app/score-ink-settings.js');
function fixture(){
 let identity={owner:'alice',session:'one'};const memory=new Map(),hooks={};
 const storage={getItem:k=>memory.get(k)||null,setItem:(k,v)=>{hooks.write?.();memory.set(k,v);}};
 const options={storage,identity:()=>identity};return {api:create(options),options,memory,hooks,setIdentity:v=>identity=v};
}
test('pen uses dark colors and highlighter uses a distinct pastel palette',()=>{
 const f=fixture(),settings=f.api.read();assert.equal(PALETTES.pen.length,8);assert.equal(PALETTES.highlighter.length,8);
 assert.equal(settings.pen.color,'#101828');assert.equal(settings.highlighter.color,'#fef08a');assert.equal(settings.highlighter.opacity,.55);
});
test('custom colors, recent choices, width and opacity survive reopening independently for each tool',()=>{
 const f=fixture();f.api.write('pen',{color:'#123ABC',width:.012,opacity:.4},{custom:true,recent:true});
 f.api.write('highlighter',{color:'#C0FFEE',width:.042,opacity:.8},{custom:true,recent:true});
 f.api.write('input',{penOnly:true});const settings=create(f.options).read();
 assert.deepEqual(settings.pen,{color:'#123abc',width:.012,opacity:.4,recent:['#123abc'],custom:['#123abc']});
 assert.equal(settings.highlighter.color,'#c0ffee');assert.equal(settings.penOnly,true);
 assert.equal(JSON.stringify([...f.memory.values()]).includes('access_token'),false);
});
test('recent colors deduplicate and stay bounded without silently deleting custom colors',()=>{
 const f=fixture();
 for(let n=0;n<24;n++)f.api.write('pen',{color:'#'+n.toString(16).padStart(6,'0')},{custom:true,recent:true});
 const before=[...f.memory.values()][0];assert.throws(()=>f.api.write('pen',{color:'#ffffff'},{custom:true}));
 assert.equal([...f.memory.values()][0],before);assert.equal(f.api.read().pen.custom.length,24);assert.equal(f.api.read().pen.recent.length,8);
 f.api.write('pen',{color:'#000001'},{custom:true,recent:true});assert.equal(f.api.read().pen.custom.length,24);assert.equal(f.api.read().pen.recent[0],'#000001');
 f.api.write('pen',{},{removeCustom:true});assert.equal(f.api.read().pen.custom.includes('#000001'),false);
});
test('invalid color/width/opacity and quota errors preserve the prior preferences',()=>{
 const f=fixture();f.api.write('pen',{color:'#123456'});const before=[...f.memory.values()][0];
 for(const patch of [{color:'url(bad)'},{color:'#fff'},{width:0},{width:.5},{opacity:0},{opacity:2}])assert.throws(()=>f.api.write('pen',patch));
 assert.equal([...f.memory.values()][0],before);
 f.hooks.write=()=>{throw Error('full');};assert.throws(()=>f.api.write('pen',{color:'#abcdef'}));assert.equal([...f.memory.values()][0],before);
});
test('another account never reads these preferences and an old login cannot write after handoff',()=>{
 const f=fixture();f.api.write('pen',{color:'#123456'});
 f.setIdentity({owner:'alice',session:'two'});assert.throws(()=>f.api.write('pen',{color:'#abcdef'}));
 f.setIdentity({owner:'bob',session:'two'});assert.equal(create(f.options).read().pen.color,'#101828');assert.equal(f.memory.size,1);
});
test('malformed and future preferences fall back without rewriting raw storage or note data',()=>{
 const f=fixture();
 for(const text of ['bad JSON',JSON.stringify({version:2,owner:'alice'}),JSON.stringify({version:1,owner:'alice',pen:{color:'bad',custom:['#123456',{}]}})]){
  f.memory.set(f.api.key,text);assert.match(f.api.read().pen.color,/^#[0-9a-f]{6}$/);assert.equal(f.memory.get(f.api.key),text);
 }
});
