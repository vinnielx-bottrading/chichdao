import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222';
test('inbox: unread counts per sender, cleared when the conversation is opened, hidden when blocked',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
  insert into auth.users(id,email) values ('${a}','a@example.test'),('${b}','b@example.test');`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const rpc=async(u,action,data={})=>(await db.query('select public.cd_api($1,$2,$3::jsonb) as value',[u,action,JSON.stringify(data)])).rows[0].value;
  for(const id of [a,b]){await rpc(id,'accept_adult');await rpc(id,'profile_save',{name:id===a?'An':'Bình',age:30,city:'Hà Nội',intent:'x',bio:'Mình thích những câu chuyện chân thành.'});
   const m=await rpc(id,'reserve_media',{kind:'image',bytes:15,mime:'image/jpeg'});await rpc(id,'claim_media',{id:m.id});await rpc(id,'finish_media',{id:m.id});}
  assert.equal((await rpc(a,'inbox')).unread,0);
  await rpc(b,'send',{id:a,text:'xin chào'});await rpc(b,'send',{id:a,text:'bạn tên gì'});
  let ib=await rpc(a,'inbox');assert.equal(Number(ib.unread),2);assert.equal(ib.threads[0].name,'Bình');assert.equal(ib.threads[0].preview,'bạn tên gì');
  assert.equal(Number((await rpc(b,'inbox')).unread),0);
  await rpc(a,'messages',{id:b});assert.equal(Number((await rpc(a,'inbox')).unread),0);
  await rpc(b,'send',{id:a,text:'còn đó không'});assert.equal(Number((await rpc(a,'inbox')).unread),1);
  await rpc(a,'block',{id:b});ib=await rpc(a,'inbox');assert.equal(Number(ib.unread),0);assert.deepEqual(ib.threads,[]);
 }finally{await db.close();}
});
