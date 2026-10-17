// Builds dist/i18n/<lang>.json from i18n-src/*.txt (one line per phrase: vi ¦ en ¦ fr ¦ es ¦ zh ¦ ja ¦ ko).
import {readFileSync,writeFileSync,readdirSync,mkdirSync} from 'node:fs';
const LANGS=['en','fr','es','zh','ja','ko'];const src=new URL('../i18n-src/',import.meta.url),out=new URL('../dist/i18n/',import.meta.url);
mkdirSync(out,{recursive:true});const dict=Object.fromEntries(LANGS.map(l=>[l,{}]));let n=0;
for(const f of readdirSync(src).filter(f=>f.endsWith('.txt')).sort())for(const [i,line] of readFileSync(new URL(f,src),'utf8').split('\n').entries()){
 if(!line.trim()||line.startsWith('#'))continue;const cols=line.split(' ¦ ').map(s=>s.trim());
 if(cols.length!==7)throw new Error(`${f}:${i+1} has ${cols.length} columns`);
 const holes=(cols[0].match(/\{\}/g)||[]).length;
 cols.slice(1).forEach((t,k)=>{const th=(t.match(/\{\d?\}/g)||[]).length;if(th!==holes)throw new Error(`${f}:${i+1} ${LANGS[k]} placeholders ${th}≠${holes}`);dict[LANGS[k]][cols[0]]=t;});n++;}
for(const l of LANGS)writeFileSync(new URL(`${l}.json`,out),JSON.stringify(dict[l]));
console.log(`i18n: ${n} phrases × ${LANGS.length} languages`);
