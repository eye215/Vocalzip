#!/usr/bin/env node
/* Verify Figma handoff manifest is still in sync with the CSS design tokens.
 * Checks code values only; does NOT write or publish anything to Figma.
 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
const css=fs.readFileSync(new URL('./tokens.css',import.meta.url),'utf8');
const manifest=JSON.parse(fs.readFileSync(new URL('./figma-manifest.json',import.meta.url),'utf8'));
const section=(re,label)=>{
  const m=css.match(re);assert(m,'missing CSS section: '+label);return m[1];
};
const student=section(/:root,\s*\[data-vz-theme="student"\]\s*\{([\s\S]*?)\n\}/,'student theme');
const teacher=section(/\[data-vz-theme="teacher"\]\s*\{([\s\S]*?)\n\}/,'teacher theme');
const base=section(/:root\s*\{([\s\S]*?)\n\}/,'base spacing/radius');
const getValue=(block,name)=>{
 const escaped=name.replace(/[.*+?^$\{\}()|[\]\\]/g,'\\$&');
 const match=block.match(new RegExp('(?:^|\\n)\\s*'+escaped+'\\s*:\\s*([^;]+);'));
 assert(match,'Missing '+name);return match[1].trim();
};
let checked=0;
for(const coll of manifest.collections){
 for(const variable of coll.variables){
  assert.equal(variable.codeSyntax,`var(${variable.cssName})`,variable.name+' WEB code syntax');
  const entries=Object.entries(variable.values);
  for(const [mode,expected] of entries){
   const block=mode==='Student'?student:mode==='Teacher'?teacher:base;
   const raw=getValue(block,variable.cssName);
   const actual=variable.type==='FLOAT'?Number.parseFloat(raw):raw.toLowerCase();
   assert.equal(actual,expected,variable.name+' / '+mode+' disagrees with CSS');
   checked++;
  }
  assert(variable.scopes?.length>0,variable.name+' requires explicit Figma scopes');
 }
}
console.log('DS/Figma manifest verified:',checked,'values across',manifest.collections.length,'collections');
