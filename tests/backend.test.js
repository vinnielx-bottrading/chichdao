import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import worker,{boundedBody,sniffMime,signMedia,verifyMedia,allowedOrigin,hydrate,storageMode,deviceLabel,b2Endpoint,clientAction} from '../worker/index.js';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222',third='33333333-3333-4333-8333-333333333333',adminId='44444444-4444-4444-8444-444444444444';
test('database authorization, album limits, nearby privacy and ownership',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
 insert into auth.users(id,email) values ('${uid}','a@example.test'),('${other}','b@example.test'),('${third}','c@example.test'),('${adminId}','VinnieLX@gmail.com');`);
 await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
 const rpc=async(actor,action,data={})=>(await db.query('select public.cd_api($1,$2,$3::jsonb) as value',[actor,action,JSON.stringify(data)])).rows[0].value;
 await db.exec('set role anon');
 await assert.rejects(()=>rpc(uid,'me'),/permission denied/);
 await assert.rejects(()=>db.query('select * from public.cd_profiles'),/permission denied/);
 await db.exec('reset role;set role authenticated');
 await assert.rejects(()=>rpc(uid,'me'),/permission denied/);
 await assert.rejects(()=>db.query('select * from chich_private.locations'),/permission denied/);
 await db.exec('reset role;set role service_role');
 assert.equal((await db.query("select chich_private.search_key('Nông dân ĐỨC') as value")).rows[0].value,'nong dan duc');
 for(const id of [uid,other,third]){
  assert.equal((await rpc(id,'me')).complete,false);
  await rpc(id,'accept_adult');
  await rpc(id,'profile_save',{name:id===uid?'Anh A':'Anh B',age:29,city:'Hà Nội',bio:'Mình thích những câu chuyện chân thành.',intent:'Mối quan hệ nghiêm túc'});
 }
 await assert.rejects(()=>rpc(uid,'admin_reports'),/Forbidden/);
 await assert.rejects(()=>rpc(uid,'reserve_media',{kind:'image',purpose:'hero',bytes:15,mime:'image/jpeg'}),/Forbidden/);
 const add=async(id,kind='image')=>{
  const m=await rpc(id,'reserve_media',{kind,bytes:15,mime:kind==='image'?'image/jpeg':'video/mp4'});
  await rpc(id,'claim_media',{id:m.id});await rpc(id,'finish_media',{id:m.id});return m;
 };
 const first=await add(uid);await add(other);await add(third);
 assert.match(first.object_key,new RegExp(`^users/${uid}/images/${first.id}\\.jpg$`));
 assert.equal((await rpc(uid,'me')).complete,true);
 for(let i=1;i<10;i++)await add(uid);
 await assert.rejects(()=>add(uid),/giới hạn/);
 await add(uid,'video');await add(uid,'video');await assert.rejects(()=>add(uid,'video'),/giới hạn/);
 await assert.rejects(()=>rpc(other,'delete_media',{id:first.id}),/Không tìm/);
 await assert.rejects(()=>rpc(other,'claim_media',{id:first.id}),/hết hạn/);
 await rpc(uid,'location',{lat:21.02781,lon:105.83418});
 await rpc(other,'location',{lat:21.035,lon:105.840});
 await rpc(third,'location',{lat:10.8,lon:106.6});
 const nearby=await rpc(uid,'discover',{radius:5});
 assert.equal(nearby.length,1);assert.equal(nearby[0].id,other);
 assert.equal(nearby[0].distance,'Trong khoảng 5 km');
 assert.equal(JSON.stringify(nearby).includes('105.'),false);
 assert.equal('lat' in nearby[0],false);
 await assert.rejects(()=>rpc(uid,'location',{lat:22,lon:105}),/quá nhanh/);
 await assert.rejects(()=>rpc(uid,'send',{id:other,text:'   '}),/1 đến 1000/);
 await assert.rejects(()=>rpc(uid,'profile_save',{name:'A'}),/18–80/);
 await assert.rejects(()=>rpc(uid,'reserve_media',{kind:'video',bytes:20971521,mime:'video/mp4'}),/không hợp lệ/);
 await rpc(uid,'send',{id:other,text:'Xin chào'});
 // Chat attachment: stored under users/<uid>/chat/, visible only to sender + recipient
 const cm=await rpc(uid,'reserve_media',{kind:'image',purpose:'chat',bytes:15,mime:'image/jpeg'});
 assert.match(cm.object_key,new RegExp(`^users/${uid}/chat/${cm.id}\\.jpg$`));
 await assert.rejects(()=>rpc(uid,'send',{id:other,mediaId:cm.id}),/chưa tải xong/);
 await rpc(uid,'claim_media',{id:cm.id});await rpc(uid,'finish_media',{id:cm.id});
 await assert.rejects(()=>rpc(other,'send',{id:uid,mediaId:cm.id}),/không hợp lệ/);
 await assert.rejects(()=>rpc(other,'media_file',{id:cm.id}),/Không tìm/);
 await rpc(uid,'send',{id:other,mediaId:cm.id});
 const thread=await rpc(other,'messages',{id:uid});assert.equal(thread.length,2);assert.equal(thread[1].media[0].id,cm.id);assert.equal(thread[1].body,'');
 assert.equal((await rpc(other,'media_file',{id:cm.id})).id,cm.id);
 await assert.rejects(()=>rpc(third,'media_file',{id:cm.id}),/Không tìm/);
 assert.equal((await rpc(uid,'me')).photos.length,12);
 // Thả thính: admin-written lines, sent as kind='tease'; free text cannot be passed off as a teaser
 const teasers=await rpc(uid,'teasers');assert.ok(teasers.length>=5);
 await rpc(uid,'send',{id:other,teaserId:teasers[0].id,text:'ignored'});
 const t2=await rpc(other,'messages',{id:uid});assert.equal(t2.at(-1).kind,'tease');assert.equal(t2.at(-1).body,teasers[0].body);
 await assert.rejects(()=>rpc(uid,'send',{id:other,teaserId:'99999999-9999-4999-8999-999999999999'}),/không còn khả dụng/);
 // Worldwide free-text region, accent-insensitive contains match
 assert.equal((await rpc(uid,'discover',{city:'ha noi'})).length,2);
 assert.equal((await rpc(uid,'discover',{city:'Bangkok'})).length,0);
 assert.equal((await rpc(other,'messages',{id:uid})).length,3);
 assert.equal((await rpc(third,'messages',{id:uid})).length,0);
 await rpc(other,'block',{id:uid});
 await assert.rejects(async()=>rpc(uid,'media_file',{id:(await rpc(other,'me')).photos[0].id}),/Không tìm/);
 assert.equal((await rpc(uid,'discover',{radius:5})).length,0);
 await assert.rejects(()=>rpc(uid,'send',{id:other,text:'Bị chặn'}),/không khả dụng/);
 await rpc(other,'unblock',{id:uid});await rpc(other,'visibility',{visible:false});
 assert.equal((await rpc(uid,'discover',{radius:5})).length,0);
 await rpc(uid,'location_off');await assert.rejects(()=>rpc(uid,'discover',{radius:5}),/bật vị trí/);
 await db.exec('reset role');
 const insecure=(await db.query("select relname from pg_class where relnamespace in ('public'::regnamespace,'chich_private'::regnamespace) and relkind='r' and not relrowsecurity")).rows;
 assert.deepEqual(insecure,[]);
 await db.exec('set role service_role');
 // Admin is resolved from the verified Auth email only.
 assert.equal((await rpc(adminId,'session',{event:'SIGNED_IN',_geo:{country:'VN',city:'Ho Chi Minh City',device:'iPhone · Safari'}})).admin,true);
 await assert.rejects(()=>rpc(uid,'admin_stats'),/Forbidden/);
 await assert.rejects(()=>rpc(uid,'admin_messages',{a:uid,b:other}),/Forbidden/);
 await rpc(uid,'session',{event:'SIGNED_IN',_geo:{country:'VN',city:'Hanoi',device:'Android · Chrome'}});
 await rpc(uid,'logout',{_geo:{country:'VN',city:'Hanoi'}});
 assert.equal((await rpc(uid,'me')).appInstalled,false);await rpc(uid,'app_installed',{_geo:{country:'VN'}});assert.equal((await rpc(uid,'me')).appInstalled,true);
 assert.match((await rpc(uid,'reserve_media',{kind:'video',bytes:15,mime:'video/webm'}).catch(e=>({object_key:e.message}))).object_key,/giới hạn|^users\/.+\/videos\/.+\.webm$/);
 const stats=await rpc(adminId,'admin_stats');
 assert.equal(stats.totals.users,4);assert.equal(stats.totals.installed,1);assert.equal(stats.totals.messages,3);assert.equal(stats.totals.teases,1);assert.equal(stats.totals.chatMedia,1);assert.equal(stats.signups.length,30);
 assert.ok(stats.geoCity.some(x=>x.label==='Hanoi'));
 const users=await rpc(adminId,'admin_users',{query:'b@example'});
 assert.equal(users.length,1);assert.equal(users[0].email,'b@example.test');
 const detail=await rpc(adminId,'admin_user',{id:uid});
 assert.ok(detail.activity.some(a=>a.event==='logout'&&a.city==='Hanoi'));
 assert.ok(detail.activity.some(a=>a.event==='send'));
 assert.equal(JSON.stringify(detail).includes('21.0'),false);
 assert.equal((await rpc(adminId,'admin_messages',{a:uid,b:other}))[0].body,'Xin chào');
 assert.equal((await rpc(adminId,'admin_conversations')).length,1);
 assert.equal((await rpc(adminId,'admin_media',{kind:'video'})).media.length,2);
 const otherPhoto=(await rpc(other,'me')).photos[0].id;
 assert.equal((await rpc(adminId,'media_file',{id:otherPhoto})).id,otherPhoto);
 await rpc(adminId,'admin_suspend',{id:third,suspended:true});
 await assert.rejects(()=>rpc(third,'me'),/không khả dụng/);
 await rpc(adminId,'admin_suspend',{id:third,suspended:false});
 await assert.rejects(()=>rpc(adminId,'admin_suspend',{id:adminId}),/quản trị/);
 await assert.rejects(()=>rpc(uid,'admin_teaser_save',{body:'x'}),/Forbidden/);
 const nt=await rpc(adminId,'admin_teaser_save',{body:'Câu mới 🔥',position:0});
 assert.equal((await rpc(uid,'teasers'))[0].body,'Câu mới 🔥');
 await rpc(adminId,'admin_teaser_save',{id:nt.id,body:'Câu mới 🔥',active:false});
 assert.ok(!(await rpc(uid,'teasers')).some(t=>t.id===nt.id));
 assert.ok((await rpc(adminId,'admin_teasers')).some(t=>t.id===nt.id&&t.active===false));
 await rpc(adminId,'admin_teaser_delete',{id:nt.id});
 const audit=await rpc(adminId,'admin_audit');
 assert.ok(['view_user','view_chat','suspend'].every(a=>audit.some(x=>x.action===a)));
 const hero=await rpc(adminId,'reserve_media',{kind:'image',purpose:'hero',mime:'image/jpeg',bytes:15});
 assert.equal(hero.object_key,`site/hero/${hero.id}.jpg`);
 // Sign-in page slides: admin-only uploads, public reads, settings
 await assert.rejects(()=>rpc(uid,'reserve_media',{kind:'image',purpose:'slide',mime:'image/jpeg',bytes:15}),/Forbidden/);
 const sl=await rpc(adminId,'reserve_media',{kind:'image',purpose:'slide',mime:'image/jpeg',bytes:15});assert.equal(sl.object_key,`site/login/${sl.id}.jpg`);
 await rpc(adminId,'claim_media',{id:sl.id});await rpc(adminId,'finish_media',{id:sl.id});
 await rpc(adminId,'admin_login_settings',{mode:'single',interval:99});
 const pub=await rpc(null,'hero');assert.deepEqual(pub.slides,[sl.id]);assert.equal(pub.loginMode,'single');assert.equal(pub.loginInterval,30);
 assert.equal((await rpc(null,'hero_file',{id:sl.id})).id,sl.id);
 assert.equal((await rpc(adminId,'admin_slides')).slides.length,1);
 await assert.rejects(()=>rpc(uid,'admin_slides'),/Forbidden/);
 // Theme chosen by admin, exposed publicly
 await assert.rejects(()=>rpc(adminId,'admin_theme',{theme:'pink'}),/không hợp lệ/);
 await rpc(adminId,'admin_theme',{theme:'cream_burgundy'});assert.equal((await rpc(null,'hero')).theme,'cream_burgundy');
 // Feedback: anon may submit (rate-limited) but not read
 await db.exec("reset role;set role anon;select set_config('request.headers','{\"x-forwarded-for\":\"203.0.113.9\"}',false)");
 const fb=(body,client)=>db.query('select public.cd_feedback_submit($1,$2) v',[body,client]);
 await assert.rejects(()=>fb('hi','device-aaaa-1111'),/5 đến 1000/);
 await fb('Ứng dụng đẹp, thêm bộ lọc chiều cao nhé','device-aaaa-1111');
 await assert.rejects(()=>fb('Góp ý lần hai trong ngày','device-aaaa-1111'),/24 giờ/);
 for(let i=2;i<=5;i++)await fb('Góp ý từ thiết bị khác '+i,'device-bbbb-000'+i);
 await assert.rejects(()=>fb('Thiết bị thứ sáu cùng mạng','device-cccc-0006'),/24 giờ/);
 await assert.rejects(()=>db.query('select * from public.cd_feedback'),/permission denied/);
 await db.exec('reset role;set role service_role');
 const fl=await rpc(adminId,'admin_feedback');assert.equal(fl.length,5);assert.equal(JSON.stringify(fl).includes('203.0.113.9'),false);
 await rpc(adminId,'admin_feedback_resolve',{id:fl[0].id});assert.equal((await rpc(adminId,'admin_feedback')).length,4);
 await assert.rejects(()=>rpc(uid,'admin_feedback'),/Forbidden/);await rpc(adminId,'claim_media',{id:hero.id});await rpc(adminId,'finish_media',{id:hero.id});await rpc(adminId,'admin_hero',{id:hero.id,alt:'Vườn cây'});
 assert.equal((await rpc(null,'hero')).mediaId,hero.id);
 await assert.rejects(()=>rpc(null,'hero_file',{id:first.id}),/Không tìm/);
 await rpc(uid,'delete_media',{id:first.id});await rpc(null,'cleanup_done',{id:first.id});
 assert.equal((await rpc(uid,'me')).photos.filter(x=>x.kind==='image').length,9);
 }finally{await db.close();}
});
test('signed media tokens bind viewer, file and expiry',async()=>{
 const expiry=Math.floor(Date.now()/1000)+600,secret='a-secure-test-secret-32-characters';
 const sig=await signMedia(secret,uid,other,expiry);
 assert.equal(await verifyMedia(secret,uid,other,expiry,sig),true);
 assert.equal(await verifyMedia(secret,uid,third,expiry,sig),false);
 assert.equal(await verifyMedia(secret,uid,other,1,sig),false);
 assert.equal(await verifyMedia(secret,uid,other,expiry,'bad'),false);
});
test('uploads reject oversized streams and spoofed content',async()=>{
 const req=new Request('https://example.test',{method:'POST',body:new Uint8Array(30)});
 await assert.rejects(()=>boundedBody(req,20),/giới hạn/);
 assert.equal(sniffMime(new TextEncoder().encode('<svg onload=alert(1)>')),'');
 assert.equal(sniffMime(Uint8Array.from([255,216,255,0,0,0,0,0,0,0,0,0])),'image/jpeg');
 assert.equal(allowedOrigin('https://evil.test',{ALLOWED_ORIGINS:'https://example.test'}),false);
 const response=await worker.fetch(new Request('https://example.test/api',{method:'POST'}),{});
 assert.equal(response.status,503);
});
test('worker helpers: nested media signing, optional storage, device label',async()=>{
 const env={MEDIA_SIGNING_SECRET:'a-secure-test-secret-32-characters'};
 const out=await hydrate({profile:{photos:[{id:uid,kind:'image'}]},media:[{id:other,status:'pending'}]},third,'https://api.test',env);
 assert.match(out.profile.photos[0].src,/^https:\/\/api\.test\/media\//);
 assert.equal(out.media[0].src,undefined);
 assert.equal(clientAction('teasers'),true);assert.equal(clientAction('admin_teaser_save'),true);for(const a of ['media_file','admin_audit_add','claim_media','cleanup_done','hero_file','x;drop'])assert.equal(clientAction(a),false);
 assert.equal(storageMode({}),'');assert.equal(storageMode({B2_BUCKET:'b',B2_REGION:'us-west-004',B2_KEY_ID:'k',B2_APPLICATION_KEY:'s'}),'b2');assert.equal(b2Endpoint({B2_REGION:'us-west-004'}),'https://s3.us-west-004.backblazeb2.com');assert.equal(b2Endpoint({B2_REGION:'s3.ca-east-006.backblazeb2.com'}),'https://s3.ca-east-006.backblazeb2.com');assert.equal(b2Endpoint({B2_REGION:'https://s3.ca-east-006.backblazeb2.com/'}),'https://s3.ca-east-006.backblazeb2.com');
 assert.equal(deviceLabel('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit Version/17 Mobile Safari/604.1'),'iOS · Safari');
 const core={SUPABASE_URL:'x',SUPABASE_SERVICE_ROLE_KEY:'x',MEDIA_SIGNING_SECRET:'x',ALLOWED_ORIGINS:'https://a.test'};
 const health=await (await worker.fetch(new Request('https://api.test/health'),core)).json();
 assert.deepEqual(health,{ready:true,storage:'none'});
});
test('upload goes to Backblaze B2 with SigV4, SSE and the users/<uid>/images layout',async()=>{
 const mediaId='55555555-5555-4555-8555-555555555555',key=`users/${uid}/images/${mediaId}.jpg`,jpeg=Uint8Array.from([255,216,255,224,0,0,0,0,0,0,0,0,1,2,3,4]);
 const env={SUPABASE_URL:'https://db.test',SUPABASE_SERVICE_ROLE_KEY:'sb_secret_x',MEDIA_SIGNING_SECRET:'a-secure-test-secret-32-characters',ALLOWED_ORIGINS:'https://app.test',B2_BUCKET:'chich-media',B2_REGION:'s3.us-west-004.backblazeb2.com',B2_KEY_ID:'kid',B2_APPLICATION_KEY:'secret'};
 const calls=[];const real=globalThis.fetch;
 globalThis.fetch=async(input,init={})=>{const req=input instanceof Request?input:new Request(input,init);calls.push(req);
  if(req.url.endsWith('/auth/v1/user'))return Response.json({id:uid});
  if(req.url.endsWith('/rest/v1/rpc/cd_api')){const {p_action}=await req.clone().json();return Response.json(p_action==='claim_media'?{id:mediaId,object_key:key,mime:'image/jpeg',bytes:jpeg.length}:{id:mediaId});}
  if(req.url.includes('backblazeb2.com'))return new Response(null,{status:200});
  throw new Error('unexpected '+req.url);};
 try{
  const res=await worker.fetch(new Request(`https://api.test/uploads/${mediaId}`,{method:'PUT',headers:{authorization:'Bearer t',origin:'https://app.test','content-type':'image/jpeg'},body:jpeg}),env);
  assert.equal(res.status,200);
  const put=calls.find(r=>r.url.includes('backblazeb2.com'));
  assert.equal(put.url,`https://s3.us-west-004.backblazeb2.com/chich-media/${key}`);
  assert.match(put.headers.get('authorization'),/^AWS4-HMAC-SHA256 Credential=kid\//);
  assert.equal(put.headers.get('x-amz-server-side-encryption'),'AES256');
  const auth=calls.find(r=>r.url.endsWith('/auth/v1/user'));assert.equal(auth.headers.get('apikey'),'sb_secret_x');
  const rpcCall=calls.find(r=>r.url.endsWith('/rpc/cd_api'));assert.equal(rpcCall.headers.get('authorization'),null);
 }finally{globalThis.fetch=real;}
});

test('upgrade-v0.6.sql upgrades a live v0.5 database without losing data',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
  insert into auth.users(id,email) values ('${uid}','a@example.test'),('${other}','b@example.test');`);
  await db.exec(await readFile(new URL('./fixtures/v0.5-schema.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const rpc=async(actor,action,data={})=>(await db.query('select public.cd_api($1,$2,$3::jsonb) as value',[actor,action,JSON.stringify(data)])).rows[0].value;
  await rpc(uid,'accept_adult');await rpc(uid,'profile_save',{name:'Anh A',age:30,city:'Hà Nội',intent:'x',bio:'Mình thích những câu chuyện chân thành.'});
  await db.exec('reset role');
  await db.exec(await readFile(new URL('../supabase/upgrade-v0.6.sql',import.meta.url),'utf8'));
  await db.exec(await readFile(new URL('../supabase/upgrade-v0.6.sql',import.meta.url),'utf8')); // re-runnable
  for(const v of ['0.7','0.7','0.8','0.8'])await db.exec(await readFile(new URL(`../supabase/upgrade-v${v}.sql`,import.meta.url),'utf8'));
  await db.exec('set role service_role');
  assert.equal((await rpc(uid,'me')).name,'Anh A');
  assert.equal((await rpc(uid,'teasers')).length,6);
  assert.equal((await rpc(null,'hero')).loginMode,'slide');assert.equal((await rpc(null,'hero')).theme,'navy_coral');
  await db.exec('reset role;set role anon');
  await assert.rejects(()=>db.query('select * from public.cd_teasers'),/permission denied/);
 }finally{await db.close();}
});
