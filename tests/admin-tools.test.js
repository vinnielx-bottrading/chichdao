import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const a='11111111-1111-4111-8111-111111111111',b='22222222-2222-4222-8222-222222222222',c='33333333-3333-4333-8333-333333333333',adm='44444444-4444-4444-8444-444444444444';
test('grid setting, teasers save-all, old-message cleanup only for inactive people',async()=>{
 const db=new PGlite();
 try{
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
  create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
  insert into auth.users(id,email) values ('${a}','a@x.test'),('${b}','b@x.test'),('${c}','c@x.test'),('${adm}','vinnielx@gmail.com');`);
  await db.exec(await readFile(new URL('../supabase/schema.sql',import.meta.url),'utf8'));
  await db.exec('set role service_role');
  const rpc=async(u,action,data={})=>(await db.query('select public.cd_api($1,$2,$3::jsonb) as value',[u,action,JSON.stringify(data)])).rows[0].value;
  // grid
  let h=await rpc(null,'hero');assert.equal(h.gridCols,3);assert.equal(h.gridColsMobile,2);
  await assert.rejects(()=>rpc(a,'admin_grid',{cols:4}),/Forbidden/);
  await rpc(adm,'admin_grid',{cols:9,mobile:1});h=await rpc(null,'hero');assert.equal(h.gridCols,6);assert.equal(h.gridColsMobile,1);
  // teasers: one save for the whole list, positions renumbered, new rows added, empty new rows skipped
  const list=await rpc(adm,'admin_teasers');
  const items=[{body:'Câu mới đầu tiên',active:true},...list.slice(0,2).map(t=>({id:t.id,body:t.body+'!',active:false})),{body:'   '}];
  assert.equal((await rpc(adm,'admin_teasers_save_all',{items})).count,3);
  const after=await rpc(adm,'admin_teasers');assert.equal(after[0].body,'Câu mới đầu tiên');assert.equal(after[0].position,1);assert.equal(after[1].body,list[0].body+'!');assert.equal(after[1].active,false);
  await assert.rejects(()=>rpc(adm,'admin_teasers_save_all',{items:[{id:list[0].id,body:''}]}),/1–200/);
  // messages cleanup
  for(const id of [a,b,c]){await rpc(id,'accept_adult');await rpc(id,'profile_save',{name:'Anh',age:30,city:'HN',intent:'x',bio:'Mình thích những câu chuyện chân thành.'});const m=await rpc(id,'reserve_media',{kind:'image',bytes:15,mime:'image/jpeg'});await rpc(id,'claim_media',{id:m.id});await rpc(id,'finish_media',{id:m.id});}
  await rpc(a,'send',{id:b,text:'cũ a-b'});await rpc(a,'send',{id:c,text:'cũ a-c'});await rpc(b,'send',{id:a,text:'mới b-a'});
  await db.exec('reset role');
  await db.query(`update public.cd_messages set created_at=now()-interval '8 months' where body like 'cũ%'`);
  await db.query(`update chich_private.accounts set last_seen_at=now()-interval '5 months' where user_id in ($1,$2)`,[a,b]);
  await db.query(`update chich_private.accounts set last_seen_at=now()-interval '2 days' where user_id=$1`,[c]);
  await db.exec('set role service_role');
  const dry=await rpc(adm,'admin_messages_cleanup',{months:6});assert.equal(dry.messages,1);assert.equal(dry.conversations,1);
  assert.equal((await db.query(`select count(*)::int n from public.cd_messages`)).rows[0].n,3);
  await rpc(adm,'admin_messages_cleanup',{months:6,dry:false});
  const left=(await db.query(`select body from public.cd_messages order by body`)).rows.map(r=>r.body);assert.deepEqual(left,['cũ a-c','mới b-a']);
 }finally{await db.close();}
});
