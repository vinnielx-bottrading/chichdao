// CHI.CH DAO. — interface languages. Vietnamese is the source text in the markup; other languages are loaded
// on demand from i18n/<code>.json (built from i18n-src/ by `npm run build`) and applied to the page's text,
// placeholders and labels as they render. Member content (names, bios, messages) is never translated.
const F={
 vi:'<rect width="30" height="20" fill="#da251d"/><path fill="#ff0" d="m15 4.2 1.4 4.3h4.5l-3.6 2.7 1.4 4.3-3.7-2.7-3.6 2.7 1.4-4.3-3.7-2.7h4.5z"/>',
 en:'<rect width="30" height="20" fill="#012169"/><path stroke="#fff" stroke-width="4" d="M0 0l30 20M30 0 0 20"/><path stroke="#c8102e" stroke-width="1.6" d="M0 0l30 20M30 0 0 20"/><path stroke="#fff" stroke-width="6" d="M15 0v20M0 10h30"/><path stroke="#c8102e" stroke-width="3.4" d="M15 0v20M0 10h30"/>',
 fr:'<rect width="10" height="20" fill="#002654"/><rect x="10" width="10" height="20" fill="#fff"/><rect x="20" width="10" height="20" fill="#ce1126"/>',
 zh:'<rect width="30" height="20" fill="#de2910"/><path fill="#ffde00" d="m5 2.2.9 2.8h3l-2.4 1.7.9 2.8L5 7.8 2.6 9.5l.9-2.8L1.1 5h3z"/><circle cx="10" cy="2" r=".8" fill="#ffde00"/><circle cx="12" cy="4" r=".8" fill="#ffde00"/><circle cx="12" cy="7" r=".8" fill="#ffde00"/><circle cx="10" cy="9" r=".8" fill="#ffde00"/>',
 ja:'<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
 ko:'<rect width="30" height="20" fill="#fff"/><path fill="#cd2e3a" d="M10.5 10a4.5 4.5 0 0 1 9 0 2.25 2.25 0 0 1-4.5 0 2.25 2.25 0 0 0-4.5 0z"/><path fill="#0047a0" d="M19.5 10a4.5 4.5 0 0 1-9 0 2.25 2.25 0 0 1 4.5 0 2.25 2.25 0 0 0 4.5 0z"/><g stroke="#000" stroke-width="1"><path d="m5 5 3-3M6 6l3-3M7 7l3-3M21 13l3 3M22 12l3 3M23 11l3 3M21 7l3-3M23 9l3-3M5 15l3 3M7 13l3 3"/></g>',
 es:'<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>'
};
export const LANGS=[['vi','Tiếng Việt'],['en','English'],['fr','Français'],['zh','中文'],['ja','日本語'],['ko','한국어'],['es','Español']].map(([code,name])=>({code,name,flag:`<svg viewBox="0 0 30 20" width="30" height="20" aria-hidden="true" focusable="false">${F[code]}</svg>`}));
const CODES=LANGS.map(l=>l.code);
const KEY='chich.lang';
let lang='vi',dict=null,patterns=[];const cache={};const listeners=new Set();
const ATTRS=['placeholder','aria-label','title','alt'];
// Member-written content stays as written.
const SKIP='script,style,textarea,code,[data-no-i18n],.bubble-text,.bio,.tray-item,.lang-flags,#admin-root';
const orig=new WeakMap(),shown=new WeakMap(),origA=new WeakMap();
export function currentLang(){return lang;}
export function savedLang(){try{const v=localStorage.getItem(KEY);return CODES.includes(v)?v:'vi';}catch{return 'vi';}}
export function onLangChange(fn){listeners.add(fn);return()=>listeners.delete(fn);}
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
function compile(d){return Object.keys(d).filter(k=>k.includes('{}')).sort((a,b)=>b.length-a.length).map(k=>({re:new RegExp('^'+esc(k).replace(/\\\{\\\}/g,'(.+?)')+'$'),out:d[k]}));}
function fill(t,groups){let i=0;return t.replace(/\{(\d?)\}/g,(_,n)=>{const g=groups[n===''?i++:Number(n)]??'';return trPiece(g);});}
// A value captured by a pattern ("5 phút", "Tên, Tuổi") is itself translated when it is a known phrase.
function trPiece(g){if(dict[g]!=null)return dict[g];if(g.includes(', ')){const parts=g.split(', ');if(parts.every(p=>dict[p]!=null))return parts.map(p=>dict[p]).join(', ');}return g;}
export function t(s){if(lang==='vi'||!dict||!s)return s;const core=s.replace(/\s+/g,' ').trim();if(!core)return s;
 let out=dict[core];
 if(out==null){for(const p of patterns){const m=core.match(p.re);if(m){out=fill(p.out,m.slice(1));break;}}}
 if(out==null)return s;const lead=s.match(/^\s*/)[0],trail=s.match(/\s*$/)[0];return lead+out+trail;}
function skip(el){return !el||!!el.closest(SKIP);}
function doText(n){if(skip(n.parentElement))return;const cur=n.nodeValue;let o=orig.get(n);
 if(o===undefined||cur!==shown.get(n)){o=cur;orig.set(n,o);}
 const out=lang==='vi'?o:t(o);shown.set(n,out);if(out!==cur)n.nodeValue=out;}
function doAttrs(el){if(skip(el))return;let rec=origA.get(el);if(!rec){rec={};origA.set(el,rec);}
 for(const a of ATTRS){if(!el.hasAttribute(a))continue;const cur=el.getAttribute(a);if(rec[a]===undefined||cur!==rec['_'+a])rec[a]=cur;const out=lang==='vi'?rec[a]:t(rec[a]);rec['_'+a]=out;if(out!==cur)el.setAttribute(a,out);}}
function walk(root){if(!root)return;if(root.nodeType===3){doText(root);return;}if(root.nodeType!==1)return;if(root.closest&&root.closest(SKIP))return;
 doAttrs(root);const w=document.createTreeWalker(root,NodeFilter.SHOW_ELEMENT|NodeFilter.SHOW_TEXT,{acceptNode:n=>n.nodeType===1&&n.matches(SKIP)?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
 let n;while((n=w.nextNode()))n.nodeType===3?doText(n):doAttrs(n);}
let queued=new Set(),scheduled=false;
const obs=new MutationObserver(list=>{for(const m of list){if(m.type==='childList')m.addedNodes.forEach(n=>queued.add(n));else queued.add(m.target);}
 if(!scheduled){scheduled=true;queueMicrotask(()=>{scheduled=false;const q=[...queued];queued=new Set();q.forEach(n=>{if(n.isConnected)walk(n);});});}});
async function load(code){if(code==='vi')return {};if(cache[code])return cache[code];const r=await fetch(`i18n/${code}.json`,{cache:'no-cache'});if(!r.ok)throw new Error('lang');return (cache[code]=await r.json());}
// Switch language: translates everything already on screen, then everything rendered afterwards.
export async function setLang(code,{save=true}={}){if(!CODES.includes(code))code='vi';
 let d;try{d=await load(code);}catch{if(code!=='vi')return lang;d={};code='vi';}
 lang=code;dict=d;patterns=compile(d);document.documentElement.lang=code==='zh'?'zh-Hans':code;
 if(save){try{localStorage.setItem(KEY,code);}catch{}}
 walk(document.body);document.querySelectorAll('[data-lang]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.lang===code));b.classList.toggle('on',b.dataset.lang===code);});
 listeners.forEach(fn=>{try{fn(code);}catch{}});return code;}
export function flagButtons(extraClass=''){return `<div class="lang-flags ${extraClass}" role="group" aria-label="Ngôn ngữ / Language">${LANGS.map(l=>`<button type="button" class="lang-flag ${l.code===lang?'on':''}" data-lang="${l.code}" aria-pressed="${l.code===lang}" title="${l.name}" aria-label="${l.name}">${l.flag}</button>`).join('')}</div>`;}
export function startI18n(){obs.observe(document.body,{childList:true,subtree:true,characterData:true,attributes:true,attributeFilter:ATTRS});const s=savedLang();return s==='vi'?Promise.resolve('vi'):setLang(s,{save:false});}
