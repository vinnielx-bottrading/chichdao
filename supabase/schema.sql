-- CHI.CH DAO. v0.3. Run once on a dedicated Supabase project.
-- Browser roles intentionally have NO table/RPC access. The Worker validates
-- Supabase access tokens with /auth/v1/user, then calls this service-only API.
begin;
create schema if not exists chich_private;
revoke all on schema chich_private from public, anon, authenticated;
grant usage on schema chich_private to service_role;

create table public.cd_profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null default '' check(length(name)<=40),
 age integer check(age between 18 and 80),
 city text not null default '' check(length(city)<=80),
 occupation text not null default '' check(length(occupation)<=80),
 body_type text not null default '' check(length(body_type)<=80),
 lifestyle text not null default '' check(length(lifestyle)<=80),
 training text not null default '' check(length(training)<=80),
 intent text not null default '' check(length(intent)<=80),
 bio text not null default '' check(length(bio)<=400),
 visible boolean not null default true,
 adult_accepted_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table chich_private.accounts (
 user_id uuid primary key references public.cd_profiles(id) on delete cascade,
 is_admin boolean not null default false, suspended boolean not null default false
);
create table public.cd_media (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.cd_profiles(id) on delete cascade,
 kind text not null check(kind in ('image','video')),
 purpose text not null default 'profile' check(purpose in ('profile','hero')),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 bytes integer not null check(bytes>0 and bytes<=20971520),
 object_key text not null unique,
 status text not null default 'pending' check(status in ('pending','uploading','ready','deleting')),
 caption text not null default '' check(length(caption)<=120),
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index cd_media_owner on public.cd_media(user_id,purpose,status);
create table public.cd_settings (
 id boolean primary key default true check(id),
 hero_media_id uuid references public.cd_media(id) on delete set null,
 hero_alt text not null default 'Sức hút từ những điều đời thường' check(length(hero_alt)<=160)
);
insert into public.cd_settings(id) values(true);
create table public.cd_likes (
 user_id uuid references public.cd_profiles(id) on delete cascade,
 target_id uuid references public.cd_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,target_id), check(user_id<>target_id)
);
create table public.cd_blocks (
 user_id uuid references public.cd_profiles(id) on delete cascade,
 target_id uuid references public.cd_profiles(id) on delete cascade,
 created_at timestamptz not null default now(), primary key(user_id,target_id), check(user_id<>target_id)
);
create index cd_blocks_target on public.cd_blocks(target_id,user_id);
create table public.cd_messages (
 id uuid primary key default gen_random_uuid(),
 sender_id uuid not null references public.cd_profiles(id) on delete cascade,
 recipient_id uuid not null references public.cd_profiles(id) on delete cascade,
 body text not null check(length(trim(body)) between 1 and 1000),
 created_at timestamptz not null default now(), check(sender_id<>recipient_id)
);
create index cd_message_pair on public.cd_messages(sender_id,recipient_id,created_at desc);
create index cd_message_recipient on public.cd_messages(recipient_id,created_at desc);
create table public.cd_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.cd_profiles(id) on delete cascade,
 target_id uuid not null references public.cd_profiles(id) on delete cascade,
 reason text not null check(length(reason) between 1 and 100),
 note text not null default '' check(length(note)<=500),
 resolved boolean not null default false, created_at timestamptz not null default now()
);
create index cd_reports_open on public.cd_reports(resolved,created_at desc);
create table chich_private.locations (
 user_id uuid primary key references public.cd_profiles(id) on delete cascade,
 lat numeric(5,2) not null check(lat between -90 and 90),
 lon numeric(6,2) not null check(lon between -180 and 180),
 updated_at timestamptz not null default now()
);
create index cd_location_lat on chich_private.locations(lat);
create table chich_private.rate_limits (
 user_id uuid references public.cd_profiles(id) on delete cascade,
 bucket text not null, window_start timestamptz not null, hits integer not null,
 primary key(user_id,bucket)
);

-- Fail closed even if project-wide default grants change later.
alter table public.cd_profiles enable row level security;
alter table public.cd_media enable row level security;
alter table public.cd_settings enable row level security;
alter table public.cd_likes enable row level security;
alter table public.cd_blocks enable row level security;
alter table public.cd_messages enable row level security;
alter table public.cd_reports enable row level security;
alter table chich_private.accounts enable row level security;
alter table chich_private.locations enable row level security;
alter table chich_private.rate_limits enable row level security;
revoke all on public.cd_profiles,public.cd_media,public.cd_settings,public.cd_likes,public.cd_blocks,public.cd_messages,public.cd_reports from public,anon,authenticated;
grant select,insert,update,delete on public.cd_profiles,public.cd_media,public.cd_settings,public.cd_likes,public.cd_blocks,public.cd_messages,public.cd_reports to service_role;
grant select,insert,update,delete on all tables in schema chich_private to service_role;

create function chich_private.is_blocked(a uuid,b uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.cd_blocks where (user_id=a and target_id=b) or (user_id=b and target_id=a))
$$;
create function chich_private.search_key(t text) returns text
language sql immutable security invoker set search_path='' as $$
 select translate(regexp_replace(normalize(lower(t),NFD),U&'[\0300-\036F]','','g'),'đ','d')
$$;
create function chich_private.complete(p public.cd_profiles) returns boolean
language sql stable security invoker set search_path='' as $$
 select length(trim(p.name))>=2 and p.age between 18 and 80 and p.city<>'' and p.intent<>''
 and length(trim(p.bio))>=20 and p.adult_accepted_at is not null
 and exists(select 1 from public.cd_media m where m.user_id=p.id and m.purpose='profile' and m.kind='image' and m.status='ready')
$$;
create function chich_private.can_view(viewer uuid, target uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.cd_profiles p join chich_private.accounts a on a.user_id=p.id
 where p.id=target and not a.suspended and (p.id=viewer or (p.visible and chich_private.complete(p) and not chich_private.is_blocked(viewer,p.id))))
$$;
create function chich_private.profile_json(p public.cd_profiles) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'age',p.age,'city',p.city,'occupation',p.occupation,
 'bodyType',p.body_type,'lifestyle',p.lifestyle,'training',p.training,'intent',p.intent,'bio',p.bio,'visible',p.visible,
 'complete',chich_private.complete(p),'photos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'caption',m.caption,'position',m.position) order by m.position,m.created_at)
 from public.cd_media m where m.user_id=p.id and m.purpose='profile' and m.status='ready'),'[]'::jsonb))
$$;
create function chich_private.throttle(actor uuid, label text, max_hits integer, seconds integer) returns void
language plpgsql security invoker set search_path='' as $$
declare n integer;
begin
 insert into chich_private.rate_limits as r(user_id,bucket,window_start,hits) values(actor,label,clock_timestamp(),1)
 on conflict(user_id,bucket) do update set
 hits=case when r.window_start<clock_timestamp()-make_interval(secs=>seconds) then 1 else r.hits+1 end,
 window_start=case when r.window_start<clock_timestamp()-make_interval(secs=>seconds) then clock_timestamp() else r.window_start end
 returning hits into n;
 if n>max_hits then raise exception 'Bạn thao tác quá nhanh. Vui lòng thử lại sau.'; end if;
end $$;

-- Sole service API. p_actor MUST come from verified Auth user, never request JSON.
create function public.cd_api(p_actor uuid, p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.cd_profiles; m public.cd_media; result jsonb; target uuid; media_id uuid;
 admin boolean; n integer; k text; v_purpose text; loc chich_private.locations; radius integer;
begin
 if current_user<>'service_role' then raise exception 'Forbidden'; end if;
 -- Auth-independent public hero; returns only the selected, ready hero.
 if p_action='hero' then
  return (select jsonb_build_object('mediaId',s.hero_media_id,'alt',s.hero_alt) from public.cd_settings s where id);
 end if;
 if p_action='cleanup_list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,object_key from public.cd_media where (status in ('pending','uploading') and created_at<now()-interval '1 hour') or status='deleting' limit 100) x),'[]');
 end if;
 if p_action='cleanup_expired' then
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  delete from chich_private.rate_limits where window_start<now()-interval '2 days';
  return '{}';
 end if;
 if p_action='cleanup_done' then
  delete from public.cd_media where id=(p_data->>'id')::uuid and (status='deleting' or (status in ('pending','uploading') and created_at<now()-interval '1 hour'));
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  return '{}';
 end if;
 -- Public hero media reads are restricted to the current hero ID.
 if p_action='hero_file' then
  select mm.* into m from public.cd_media mm join public.cd_settings s on s.hero_media_id=mm.id where mm.id=(p_data->>'id')::uuid and mm.status='ready' and mm.purpose='hero';
  if m.id is null then raise exception 'Không tìm thấy ảnh.'; end if;
  return to_jsonb(m);
 end if;
 if p_actor is null or not exists(select 1 from auth.users where id=p_actor) then raise exception 'Unauthenticated'; end if;
 insert into public.cd_profiles(id) values(p_actor) on conflict do nothing;
 insert into chich_private.accounts(user_id) values(p_actor) on conflict do nothing;
 select is_admin into admin from chich_private.accounts where user_id=p_actor and not suspended;
 if admin is null then raise exception 'Tài khoản hiện không khả dụng.'; end if;
 select * into p from public.cd_profiles where id=p_actor;

 if p_action='me' then
  return chich_private.profile_json(p)||jsonb_build_object('admin',admin,'nearbyEnabled',exists(select 1 from chich_private.locations where user_id=p_actor and updated_at>now()-interval '24 hours'),
  'likes',coalesce((select jsonb_agg(target_id) from public.cd_likes where user_id=p_actor),'[]'));
 elsif p_action='accept_adult' then
  update public.cd_profiles set adult_accepted_at=coalesce(adult_accepted_at,now()) where id=p_actor;
  return '{}';
 elsif p_action='profile_save' then
  perform chich_private.throttle(p_actor,'profile',20,60);
  if length(trim(p_data->>'name')) not between 2 and 40 or (p_data->>'age')::integer not between 18 and 80 or length(trim(p_data->>'bio'))<20 then raise exception 'Điền tên, tuổi từ 18–80 và giới thiệu ít nhất 20 ký tự.'; end if;
  update public.cd_profiles set name=trim(p_data->>'name'),age=(p_data->>'age')::integer,city=coalesce(p_data->>'city',''),occupation=coalesce(p_data->>'occupation',''),body_type=coalesce(p_data->>'bodyType',''),lifestyle=coalesce(p_data->>'lifestyle',''),training=coalesce(p_data->>'training',''),intent=coalesce(p_data->>'intent',''),bio=trim(p_data->>'bio'),updated_at=now() where id=p_actor returning * into p;
  return chich_private.profile_json(p);
 elsif p_action='visibility' then
  update public.cd_profiles set visible=(p_data->>'visible')::boolean where id=p_actor;
  return '{}';
 elsif p_action='location_off' then
  delete from chich_private.locations where user_id=p_actor; return '{}';
 elsif p_action='location' then
  perform chich_private.throttle(p_actor,'location',1,60);
  if not ((p_data->>'lat')::numeric between -90 and 90 and (p_data->>'lon')::numeric between -180 and 180) then raise exception 'Vị trí không hợp lệ.'; end if;
  insert into chich_private.locations values(p_actor,round((p_data->>'lat')::numeric,2),round((p_data->>'lon')::numeric,2),now())
  on conflict(user_id) do update set lat=excluded.lat,lon=excluded.lon,updated_at=now(); return '{}';
 elsif p_action='discover' then
  perform chich_private.throttle(p_actor,'discover',30,60);
  radius=coalesce((p_data->>'radius')::integer,0);
  if radius not in (0,5,10,25,50,100) then raise exception 'Bán kính không hợp lệ.'; end if;
  if radius>0 then
   select * into loc from chich_private.locations where user_id=p_actor and updated_at>now()-interval '24 hours';
   if loc.user_id is null then raise exception 'Hãy bật vị trí để tìm người ở gần.'; end if;
  end if;
  select coalesce(jsonb_agg(item),'[]') into result from (
   select chich_private.profile_json(q)||case when radius>0 then jsonb_build_object('distance',case when d.km<5 then 'Trong khoảng 5 km' when d.km<10 then 'Khoảng 5–10 km' when d.km<25 then 'Khoảng 10–25 km' when d.km<50 then 'Khoảng 25–50 km' else 'Khoảng 50–100 km' end) else '{}'::jsonb end as item
   from public.cd_profiles q left join chich_private.locations l on l.user_id=q.id and l.updated_at>now()-interval '24 hours'
   cross join lateral (select 6371.0*2*asin(sqrt(least(1.0,power(sin(radians((l.lat-loc.lat)::double precision)/2),2)+cos(radians(loc.lat::double precision))*cos(radians(l.lat::double precision))*power(sin(radians((l.lon-loc.lon)::double precision)/2),2)))) as km) d
   where q.id<>p_actor and chich_private.can_view(p_actor,q.id)
   and (radius=0 or (l.user_id is not null and abs(l.lat-loc.lat)<=radius/110.0+0.02 and d.km<=radius))
   and (coalesce(p_data->>'city','all')='all' or q.city=p_data->>'city')
   and (coalesce(p_data->>'occupation','all')='all' or q.occupation=p_data->>'occupation')
   and (coalesce(p_data->>'bodyType','all')='all' or q.body_type=p_data->>'bodyType')
   and (coalesce(p_data->>'lifestyle','all')='all' or q.lifestyle=p_data->>'lifestyle')
   and (coalesce(p_data->>'training','all')='all' or q.training=p_data->>'training')
   and (coalesce(p_data->>'intent','all')='all' or q.intent=p_data->>'intent')
   and q.age between greatest(18,coalesce((p_data->>'minAge')::int,18)) and least(80,coalesce((p_data->>'maxAge')::int,80))
   and (coalesce(p_data->>'query','')='' or chich_private.search_key(q.name||' '||q.occupation||' '||q.bio) like '%'||chich_private.search_key(left(p_data->>'query',100))||'%')
   order by q.created_at desc,q.id limit 48 offset least(480,greatest(0,coalesce((p_data->>'offset')::integer,0)))
  ) a;
  return result;
 elsif p_action='profile' then
  target=(p_data->>'id')::uuid;
  if not chich_private.can_view(p_actor,target) then raise exception 'Hồ sơ không khả dụng.'; end if;
  return (select chich_private.profile_json(q) from public.cd_profiles q where id=target);
 elsif p_action='reserve_media' then
  perform chich_private.throttle(p_actor,'upload',30,3600);
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  k=p_data->>'kind';v_purpose=coalesce(p_data->>'purpose','profile');
  if v_purpose='hero' and not admin then raise exception 'Forbidden'; end if;
  if v_purpose='hero' and k<>'image' then raise exception 'Hero phải là ảnh.'; end if;
  select count(*) into n from public.cd_media where user_id=p_actor and kind=k and cd_media.purpose=v_purpose and status<>'deleting';
  if n>=(case when v_purpose='hero' then 3 when k='image' then 10 else 2 end) then raise exception 'Đã đạt giới hạn ảnh hoặc video.'; end if;
  if (k='image' and ((p_data->>'bytes')::int>8388608 or p_data->>'mime' not in ('image/jpeg','image/png','image/webp'))) or (k='video' and p_data->>'mime' not in ('video/mp4','video/webm')) then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  media_id=gen_random_uuid();
  insert into public.cd_media(id,user_id,kind,purpose,mime,bytes,object_key,position) values(media_id,p_actor,k,v_purpose,p_data->>'mime',(p_data->>'bytes')::int,p_actor::text||'/'||media_id::text,n) returning * into m;
  return to_jsonb(m);
 elsif p_action='claim_media' then
  update public.cd_media set status='uploading' where id=(p_data->>'id')::uuid and user_id=p_actor and status='pending' and created_at>now()-interval '15 minutes' returning * into m;
  if m.id is null then raise exception 'Lượt tải lên hết hạn hoặc đã sử dụng.'; end if; return to_jsonb(m);
 elsif p_action='finish_media' then
  update public.cd_media set status='ready' where id=(p_data->>'id')::uuid and user_id=p_actor and status='uploading' returning * into m;
  if m.id is null then raise exception 'Lượt tải lên không hợp lệ.'; end if; return jsonb_build_object('id',m.id);
 elsif p_action='delete_media' then
  update public.cd_media set status='deleting' where id=(p_data->>'id')::uuid and user_id=p_actor returning * into m;
  if m.id is null then raise exception 'Không tìm thấy ảnh/video.'; end if;
  update public.cd_settings set hero_media_id=null where hero_media_id=m.id;
  return to_jsonb(m);
 elsif p_action='edit_media' then
  media_id=(p_data->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into m from public.cd_media where id=media_id and user_id=p_actor and purpose='profile' and status='ready';
  if m.id is null then raise exception 'Không tìm thấy ảnh/video.'; end if;
  if coalesce((p_data->>'cover')::boolean,false) then
   if m.kind<>'image' then raise exception 'Ảnh đại diện phải là hình ảnh.'; end if;
   update public.cd_media set position=position+1 where user_id=p_actor and purpose='profile';
   update public.cd_media set position=0 where id=media_id;
  end if;
  if p_data ? 'caption' then update public.cd_media set caption=p_data->>'caption' where id=media_id; end if;
  return '{}';
 elsif p_action='media_file' then
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and status='ready';
  if m.id is null or (m.purpose='hero' and not admin) or not chich_private.can_view(p_actor,m.user_id) then raise exception 'Không tìm thấy ảnh/video.'; end if; return to_jsonb(m);
 elsif p_action='admin_hero' then
  if not admin then raise exception 'Forbidden'; end if;
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and purpose='hero' and kind='image' and status='ready';
  if m.id is null then raise exception 'Ảnh hero chưa sẵn sàng.'; end if;
  update public.cd_settings set hero_media_id=m.id,hero_alt=coalesce(p_data->>'alt','Sức hút từ những điều đời thường') where id;
  update public.cd_media set status='deleting' where purpose='hero' and id<>m.id;
  return '{}';
 elsif p_action in ('like','block','unblock','report','send') then
  target=(p_data->>'id')::uuid;
  if target=p_actor then raise exception 'Không thể thao tác với chính mình.'; end if;
  if p_action='unblock' then delete from public.cd_blocks where user_id=p_actor and target_id=target;return '{}';end if;
  if not chich_private.can_view(p_actor,target) then raise exception 'Hồ sơ không khả dụng.'; end if;
  perform chich_private.throttle(p_actor,p_action,case when p_action='report' then 5 else 30 end,60);
  if p_action='like' then
   if coalesce((p_data->>'liked')::boolean,false) then insert into public.cd_likes values(p_actor,target,now()) on conflict do nothing; else delete from public.cd_likes where user_id=p_actor and target_id=target;end if;
  elsif p_action='block' then
   insert into public.cd_blocks values(p_actor,target,now()) on conflict do nothing;
   delete from public.cd_likes where (user_id=p_actor and target_id=target) or (user_id=target and target_id=p_actor);
  elsif p_action='report' then
   insert into public.cd_reports(reporter_id,target_id,reason,note) values(p_actor,target,p_data->>'reason',coalesce(p_data->>'note',''));
  else
   if not chich_private.complete(p) then raise exception 'Hãy hoàn thiện hồ sơ trước khi gửi lời chào.';end if;
   insert into public.cd_messages(sender_id,recipient_id,body) values(p_actor,target,trim(p_data->>'text'));
  end if; return '{}';
 elsif p_action='liked' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q join public.cd_likes l on l.target_id=q.id where l.user_id=p_actor and chich_private.can_view(p_actor,q.id)),'[]');
 elsif p_action='blocked' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name)) from public.cd_profiles q join public.cd_blocks b on b.target_id=q.id where b.user_id=p_actor),'[]');
 elsif p_action='contacts' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q where q.id<>p_actor and chich_private.can_view(p_actor,q.id) and exists(select 1 from public.cd_messages mm where (mm.sender_id=p_actor and mm.recipient_id=q.id) or (mm.recipient_id=p_actor and mm.sender_id=q.id))),'[]');
 elsif p_action='messages' then
  target=(p_data->>'id')::uuid;
  if not chich_private.can_view(p_actor,target) then raise exception 'Cuộc trò chuyện không khả dụng.';end if;
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from (select id,sender_id,body,created_at from public.cd_messages where (sender_id=p_actor and recipient_id=target) or (sender_id=target and recipient_id=p_actor) order by created_at desc limit 100) a),'[]');
 elsif p_action='admin_reports' then
  if not admin then raise exception 'Forbidden';end if;
  return coalesce((select jsonb_agg(to_jsonb(a)) from (select * from public.cd_reports where not resolved order by created_at limit 100) a),'[]');
 elsif p_action='admin_resolve' then
  if not admin then raise exception 'Forbidden';end if;
  update public.cd_reports set resolved=true where id=(p_data->>'id')::uuid returning target_id into target;
  if coalesce((p_data->>'suspend')::boolean,false) and target is not null and target<>p_actor then update chich_private.accounts set suspended=true where user_id=target and not is_admin;end if;return '{}';
 end if;
 raise exception 'Unknown action';
end $$;
revoke all on all functions in schema chich_private from public,anon,authenticated;
grant execute on all functions in schema chich_private to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;
commit;
