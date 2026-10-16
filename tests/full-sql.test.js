import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const uid='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const file=n=>readFile(new URL(n,import.meta.url),'utf8');
async function base(){const db=new PGlite();await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email text,raw_app_meta_data jsonb default '{}',created_at timestamptz default now(),last_sign_in_at timestamptz,email_confirmed_at timestamptz default now());grant usage on schema auth to service_role;
 insert into auth.users(id,email) values ('${uid}','a@example.test'),('${other}','b@example.test');`);return db;}
async function sig(db){const q=async s=>(await db.query(s)).rows.map(r=>JSON.stringify(r)).sort().join('\n');
 return {cols:await q(`select table_schema,table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema in ('public','chich_private')`),
  cons:await q(`select conrelid::regclass::text t,pg_get_constraintdef(oid) d from pg_constraint where connamespace in ('public'::regnamespace,'chich_private'::regnamespace)`),
  funcs:await q(`select p.oid::regprocedure::text f,md5(pg_get_functiondef(p.oid)) h,p.prosecdef from pg_proc p where pronamespace in ('public'::regnamespace,'chich_private'::regnamespace)`),
  trig:await q(`select tgrelid::regclass::text t,tgname from pg_trigger where not tgisinternal`),
  idx:await q(`select indexdef from pg_indexes where schemaname in ('public','chich_private')`),
  grants:await q(`select table_schema,table_name,grantee,privilege_type from information_schema.role_table_grants where table_schema in ('public','chich_private') and grantee in ('anon','authenticated','service_role')`),
  rls:await q(`select relname,relrowsecurity from pg_class where relnamespace in ('public'::regnamespace,'chich_private'::regnamespace) and relkind='r'`)};}
test('chichdao-full.sql: empty DB, re-run, and v0.5 upgrade all end at the v0.10 schema',async()=>{
 const full=await file('../supabase/chichdao-full.sql');
 const ref=await base();await ref.exec(await file('../supabase/schema.sql'));const want=await sig(ref);
 const fresh=await base();await fresh.exec(full);assert.deepEqual(await sig(fresh),want,'fresh');
 await fresh.exec(full);assert.deepEqual(await sig(fresh),want,'re-run');
 const old=await base();await old.exec(await file('./fixtures/v0.5-schema.sql'));
 await old.query(`insert into public.cd_profiles(id,name) values ($1,'Minh')`,[uid]);
 await old.exec(full);const got=await sig(old);
 for(const k of Object.keys(want))assert.deepEqual(got[k],want[k],'v0.5→ '+k);
 assert.equal((await old.query(`select name from public.cd_profiles where id=$1`,[uid])).rows[0].name,'Minh');
 await old.exec(full);assert.equal((await old.query(`select count(*)::int n from public.cd_profiles`)).rows[0].n,1);
 for(const stop of ['0.6','0.8','0.9']){const mid=await base();await mid.exec(await file('./fixtures/v0.5-schema.sql'));
  for(const v of ['0.6','0.7','0.8','0.9'].slice(0,['0.6','0.7','0.8','0.9'].indexOf(stop)+1))await mid.exec(await file(`../supabase/upgrade-v${v}.sql`));
  await mid.exec(full);const g=await sig(mid);for(const k of Object.keys(want))assert.deepEqual(g[k],want[k],`v${stop}→ `+k);}
});
