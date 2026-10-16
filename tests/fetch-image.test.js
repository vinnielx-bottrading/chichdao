import test from 'node:test';import assert from 'node:assert/strict';
import worker from '../worker/index.js';
const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_x',MEDIA_SIGNING_SECRET:'a-secure-test-secret-32-characters',ALLOWED_ORIGINS:'https://app.test'};
const jpeg=Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0,1,2,3,4]);
async function call(admin,url,body){const real=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{const req=input instanceof Request?input:new Request(input,init);
  if(req.url.endsWith('/auth/v1/user'))return Response.json({id:'11111111-1111-4111-8111-111111111111'});
  if(req.url.endsWith('/rest/v1/rpc/cd_api'))return Response.json({admin});
  if(req.url==='https://img.test/a.jpg')return new Response(body,{headers:{'content-type':'image/jpeg'}});
  throw new Error('unexpected '+req.url);};
 try{return await worker.fetch(new Request('https://api.test/admin/fetch-image',{method:'POST',headers:{authorization:'Bearer t',origin:'https://app.test','content-type':'application/json'},body:JSON.stringify({url})}),env,{waitUntil(){}});}finally{globalThis.fetch=real;}}
test('admin can fetch an image by https link; others and bad links are refused',async()=>{
 const ok=await call(true,'https://img.test/a.jpg',jpeg);assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'image/jpeg');assert.equal((await ok.arrayBuffer()).byteLength,jpeg.length);
 assert.equal((await call(false,'https://img.test/a.jpg',jpeg)).status,403);
 assert.equal((await call(true,'http://img.test/a.jpg',jpeg)).status,400);
 assert.equal((await call(true,'https://localhost/a.jpg',jpeg)).status,400);
 assert.equal((await call(true,'https://img.test/a.jpg',new TextEncoder().encode('<html>not an image</html>'))).status,415);
});
