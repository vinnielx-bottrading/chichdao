import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uid='11111111-1111-4111-8111-111111111111',adminId='44444444-4444-4444-8444-444444444444';
test('illustration profiles: admin-only, labelled, toggle, filters, photo access, cleanup',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
  insert into auth.users(id,email) values ('${uid}','a@example.test'),('${adminId}','vinnielx@gmail.com');`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const rpc=async(a,action,data={})=>(await db.query('select public.cd_api($1,$2,$3::jsonb) as value',[a,action,JSON.stringify(data)])).rows[0].value;
  await assert.rejects(()=>rpc(uid,'admin_samples'),/Forbidden/);
  await assert.rejects(()=>rpc(uid,'reserve_media',{kind:'image',purpose:'sample',bytes:15,mime:'image/jpeg'}),/Forbidden/);
  const m=await rpc(adminId,'reserve_media',{kind:'image',purpose:'sample',bytes:15,mime:'image/webp',thumbBytes:5,thumbMime:'image/webp'});
  assert.match(m.object_key,/^site\/samples\/.+\.webp$/);
  await rpc(adminId,'claim_media',{id:m.id});await rpc(adminId,'finish_media',{id:m.id});
  const s=await rpc(adminId,'admin_sample_save',{name:'Huy',age:28,city:'Hà Nội',bodyType:'Vạm vỡ',intent:'Hẹn hò thoải mái',bio:'Thích leo núi.',mediaId:m.id});
  assert.equal(s.sample,true);assert.equal(s.photos[0].id,m.id);
  assert.equal((await rpc(adminId,'admin_samples_bulk',{items:[{name:'Long',age:31,city:'TP. Hồ Chí Minh',bio:'Mê cà phê.'},{name:'Tú',age:25,city:'Đà Nẵng',bio:'Chạy bộ biển.'}]})).count,2);
  // off by default: nothing shown, photo not viewable
  assert.deepEqual(await rpc(uid,'samples',{}),[]);
  await assert.rejects(()=>rpc(uid,'media_file',{id:m.id}),/Không tìm thấy/);
  await rpc(adminId,'admin_samples_toggle',{enabled:true});
  assert.equal((await rpc(uid,'samples',{})).length,3);
  assert.deepEqual((await rpc(uid,'samples',{city:'ha noi'})).map(x=>x.name),['Huy']);
  assert.deepEqual(await rpc(uid,'samples',{radius:25}),[]);
  assert.deepEqual(await rpc(uid,'samples',{offset:48}),[]);
  assert.equal((await rpc(uid,'media_file',{id:m.id})).id,m.id);
  // not real users: cannot be messaged, liked or opened as profiles
  await assert.rejects(()=>rpc(uid,'like',{id:s.id,liked:true}));
  await assert.rejects(()=>rpc(uid,'send',{id:s.id,text:'hi'}));
  // inactive sample hides it and its photo
  await rpc(adminId,'admin_sample_save',{id:s.id,name:'Huy',age:28,active:false});
  assert.equal((await rpc(uid,'samples',{})).length,2);
  await assert.rejects(()=>rpc(uid,'media_file',{id:m.id}),/Không tìm thấy/);
  // delete everything: photo queued for B2 deletion, feature switched off
  await rpc(adminId,'admin_samples_clear');
  assert.deepEqual((await rpc(adminId,'admin_samples')).items,[]);
  assert.equal((await rpc(adminId,'admin_samples')).enabled,false);
  assert.ok((await rpc(null,'cleanup_list')).some(r=>r.id===m.id));
 }finally{await db.close();}
});
