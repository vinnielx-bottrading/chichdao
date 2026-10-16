-- CHI.CH DAO. nâng cấp database lên v0.8 — GIỮ NGUYÊN dữ liệu. Cần đã chạy upgrade-v0.6 và v0.7 trước.
begin;
alter table public.cd_settings add column if not exists theme text not null default 'navy_coral';
alter table public.cd_settings drop constraint if exists cd_settings_theme_check;
alter table public.cd_settings add constraint cd_settings_theme_check check(theme in ('navy_coral','navy_orange','black_red','charcoal_gold','forest_cream','cobalt_lime','cream_burgundy'));
create table if not exists public.cd_feedback (
 id uuid primary key default gen_random_uuid(),
 body text not null check(length(trim(body)) between 5 and 1000),
 user_id uuid references auth.users(id) on delete set null,
 client_hash text not null default '', ip_hash text not null default '', device text not null default '',
 resolved boolean not null default false,
 created_at timestamptz not null default now()
);
create index if not exists cd_feedback_time on public.cd_feedback(created_at desc);
create index if not exists cd_feedback_client on public.cd_feedback(client_hash,created_at desc);
create index if not exists cd_feedback_ip on public.cd_feedback(ip_hash,created_at desc);
create table if not exists chich_private.secrets (id boolean primary key default true check(id), feedback_salt text not null default md5(random()::text||clock_timestamp()::text));
insert into chich_private.secrets(id) values(true) on conflict do nothing;
alter table public.cd_feedback enable row level security;
alter table chich_private.secrets enable row level security;
revoke all on public.cd_feedback from public,anon,authenticated;
grant select,insert,update,delete on public.cd_feedback to service_role;
grant select,insert,update,delete on chich_private.secrets to service_role;
create or replace function public.cd_feedback_submit(p_body text, p_client text default '') returns jsonb
language plpgsql security definer set search_path='' as $$
declare salt text; hdr json; ip text; v_uid uuid; ch text; ih text;
begin
 if coalesce(length(trim(p_body)),0) not between 5 and 1000 then raise exception 'Góp ý cần từ 5 đến 1000 ký tự.'; end if;
 select feedback_salt into salt from chich_private.secrets where id;
 hdr:=coalesce(nullif(current_setting('request.headers',true),''),'{}')::json;
 ip:=trim(split_part(coalesce(hdr->>'cf-connecting-ip',hdr->>'x-forwarded-for',hdr->>'x-real-ip',''),',',1));
 begin v_uid:=nullif(current_setting('request.jwt.claims',true)::json->>'sub','')::uuid; exception when others then v_uid:=null; end;
 if v_uid is not null and not exists(select 1 from auth.users where id=v_uid) then v_uid:=null; end if;
 ch:=case when coalesce(p_client,'')~'^[A-Za-z0-9-]{8,64}$' then md5(salt||'c'||p_client) else '' end;
 ih:=case when ip<>'' then md5(salt||'i'||ip) else '' end;
 if (ch<>'' and exists(select 1 from public.cd_feedback where client_hash=ch and created_at>now()-interval '24 hours'))
  or (v_uid is not null and exists(select 1 from public.cd_feedback where user_id=v_uid and created_at>now()-interval '24 hours'))
  or (ih<>'' and (select count(*) from public.cd_feedback where ip_hash=ih and created_at>now()-interval '24 hours')>=5)
 then raise exception 'Bạn đã gửi góp ý trong 24 giờ qua. Cảm ơn bạn, hẹn bạn lần sau!'; end if;
 if (select count(*) from public.cd_feedback where created_at>now()-interval '10 minutes')>=300 then raise exception 'Hệ thống đang nhận quá nhiều góp ý, vui lòng thử lại sau.'; end if;
 insert into public.cd_feedback(body,user_id,client_hash,ip_hash,device) values(trim(p_body),v_uid,ch,ih,left(coalesce(hdr->>'user-agent',''),200));
 return jsonb_build_object('ok',true);
end $$;
revoke all on function public.cd_feedback_submit(text,text) from public;
grant execute on function public.cd_feedback_submit(text,text) to anon,authenticated,service_role;
create or replace function public.cd_api(p_actor uuid, p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.cd_profiles; m public.cd_media; result jsonb; target uuid; v_media uuid;
 admin boolean; n integer; k text; v_purpose text; loc chich_private.locations; radius integer;
begin
 if current_user<>'service_role' then raise exception 'Forbidden'; end if;
 -- Auth-independent public hero; returns only the selected, ready hero.
 if p_action='hero' then
  return (select jsonb_build_object('mediaId',s.hero_media_id,'alt',s.hero_alt,'theme',s.theme,'loginMode',s.login_mode,'loginInterval',s.login_interval,
   'slides',coalesce((select jsonb_agg(md.id order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
 end if;
 if p_action='cleanup_list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (select id,object_key from public.cd_media md where (status in ('pending','uploading') and created_at<now()-interval '1 hour') or status='deleting' or (purpose='chat' and status='ready' and created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_messages mm where mm.media_id=md.id)) limit 100) x),'[]');
 end if;
 if p_action='cleanup_expired' then
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  delete from chich_private.rate_limits where window_start<now()-interval '2 days';
  delete from chich_private.activity where created_at<now()-interval '365 days';
  return '{}';
 end if;
 if p_action='cleanup_done' then
  delete from public.cd_media md where md.id=(p_data->>'id')::uuid and (md.status='deleting' or (md.status in ('pending','uploading') and md.created_at<now()-interval '1 hour') or (md.purpose='chat' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_messages mm where mm.media_id=md.id)));
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  return '{}';
 end if;
 -- Public hero media reads are restricted to the current hero ID.
 if p_action='hero_file' then
  -- Public images only: the selected homepage hero, or a sign-in page slide.
  select mm.* into m from public.cd_media mm where mm.id=(p_data->>'id')::uuid and mm.status='ready'
   and (mm.purpose='slide' or (mm.purpose='hero' and mm.id=(select hero_media_id from public.cd_settings where id)));
  if m.id is null then raise exception 'Không tìm thấy ảnh.'; end if;
  return to_jsonb(m);
 end if;
 if p_actor is null or not chich_private.user_exists(p_actor) then raise exception 'Unauthenticated'; end if;
 insert into public.cd_profiles(id) values(p_actor) on conflict do nothing;
 insert into chich_private.accounts(user_id) values(p_actor) on conflict do nothing;
 admin:=coalesce(chich_private.auth_email(p_actor)=(select admin_email from chich_private.settings where id),false);
 if not admin and exists(select 1 from chich_private.accounts where user_id=p_actor and suspended) then raise exception 'Tài khoản hiện không khả dụng.'; end if;
 select * into p from public.cd_profiles where id=p_actor;
 -- Last seen + IP-level geo injected by the Worker (client-supplied _geo is stripped there).
 if p_data ? '_geo' then
  update chich_private.accounts set last_seen_at=now(),is_admin=admin,
   last_country=left(coalesce(p_data->'_geo'->>'country',''),8),last_city=left(coalesce(p_data->'_geo'->>'city',''),80),last_device=left(coalesce(p_data->'_geo'->>'device',''),120)
  where user_id=p_actor and (last_seen_at is null or last_seen_at<now()-interval '2 minutes' or p_action in ('session','logout'));
 end if;
 if p_action in ('session','logout','app_installed','profile_save','visibility','location','location_off','like','block','unblock','report','send','finish_media','delete_media','accept_adult') then
  if p_action in ('session','logout','app_installed') then perform chich_private.throttle(p_actor,'session',30,60); end if;
  insert into chich_private.activity(user_id,event,target_id,country,region,city,device)
  values(p_actor,case when p_action='session' then left(coalesce(nullif(p_data->>'event',''),'session'),40) when p_action='like' and not coalesce((p_data->>'liked')::boolean,false) then 'unlike' when p_action='send' and coalesce(p_data->>'teaserId','')<>'' then 'tease' else p_action end,
   case when p_action in ('like','block','unblock','report','send') and coalesce(p_data->>'id','') ~* '^[0-9a-f-]{36}$' then (p_data->>'id')::uuid end,
   left(coalesce(p_data->'_geo'->>'country',''),8),left(coalesce(p_data->'_geo'->>'region',''),80),left(coalesce(p_data->'_geo'->>'city',''),80),left(coalesce(p_data->'_geo'->>'device',''),120));
  if p_action='logout' then return '{}'; end if;
  if p_action='app_installed' then update chich_private.accounts set app_installed_at=coalesce(app_installed_at,now()) where user_id=p_actor; return jsonb_build_object('appInstalled',true); end if;
 end if;

 if p_action in ('me','session') then
  return chich_private.profile_json(p)||jsonb_build_object('admin',admin,'appInstalled',exists(select 1 from chich_private.accounts where user_id=p_actor and app_installed_at is not null),'nearbyEnabled',exists(select 1 from chich_private.locations where user_id=p_actor and updated_at>now()-interval '24 hours'),
  'likes',coalesce((select jsonb_agg(target_id) from public.cd_likes where user_id=p_actor),'[]'));
 elsif p_action='accept_adult' then
  update public.cd_profiles set adult_accepted_at=coalesce(adult_accepted_at,now()) where id=p_actor;
  return '{}';
 elsif p_action='profile_save' then
  perform chich_private.throttle(p_actor,'profile',20,60);
  if coalesce(length(trim(p_data->>'name')),0) not between 2 and 40 or coalesce(p_data->>'age','') !~ '^\d{1,3}$' or (p_data->>'age')::integer not between 18 and 80 or coalesce(length(trim(p_data->>'bio')),0) not between 20 and 400 then raise exception 'Điền tên 2–40 ký tự, tuổi từ 18–80 và giới thiệu 20–400 ký tự.'; end if;
  if greatest(length(coalesce(p_data->>'city','')),length(coalesce(p_data->>'occupation','')),length(coalesce(p_data->>'bodyType','')),length(coalesce(p_data->>'lifestyle','')),length(coalesce(p_data->>'training','')),length(coalesce(p_data->>'intent','')))>80 then raise exception 'Thông tin hồ sơ quá dài.'; end if;
  update public.cd_profiles set name=trim(p_data->>'name'),age=(p_data->>'age')::integer,city=coalesce(p_data->>'city',''),occupation=coalesce(p_data->>'occupation',''),body_type=coalesce(p_data->>'bodyType',''),lifestyle=coalesce(p_data->>'lifestyle',''),training=coalesce(p_data->>'training',''),intent=coalesce(p_data->>'intent',''),bio=trim(p_data->>'bio'),updated_at=now() where id=p_actor returning * into p;
  return chich_private.profile_json(p);
 elsif p_action='visibility' then
  update public.cd_profiles set visible=coalesce((p_data->>'visible')::boolean,visible) where id=p_actor;
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
   and (coalesce(p_data->>'city','all') in ('all','') or chich_private.search_key(q.city) like '%'||chich_private.search_key(left(p_data->>'city',80))||'%')
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
  k=p_data->>'kind';v_purpose=coalesce(p_data->>'purpose','profile');
  if v_purpose='chat' then perform chich_private.throttle(p_actor,'upload_chat',60,3600);
   if not chich_private.complete(p) then raise exception 'Hãy hoàn thiện hồ sơ trước khi gửi ảnh/video.'; end if;
  else perform chich_private.throttle(p_actor,'upload',30,3600); end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  if v_purpose in ('hero','slide') and not admin then raise exception 'Forbidden'; end if;
  if v_purpose in ('hero','slide') and k<>'image' then raise exception 'Ảnh trang chủ/đăng nhập phải là ảnh.'; end if;
  if k is null or k not in ('image','video') or v_purpose not in ('profile','hero','chat','slide') or coalesce(p_data->>'bytes','') !~ '^\d{1,9}$' then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if (p_data->>'bytes')::int<1 or (k='image' and ((p_data->>'bytes')::int>8388608 or coalesce(p_data->>'mime','') not in ('image/jpeg','image/png','image/webp'))) or (k='video' and ((p_data->>'bytes')::int>20971520 or coalesce(p_data->>'mime','') not in ('video/mp4','video/webm'))) then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if v_purpose='chat' then
   n=0; -- chat attachments: no album cap; limited by size + upload_chat throttle; unsent files are purged after 24h
  else
   select count(*) into n from public.cd_media where user_id=p_actor and kind=k and cd_media.purpose=v_purpose and status<>'deleting';
   if n>=(case when v_purpose='hero' then 3 when v_purpose='slide' then 12 when k='image' then 10 else 2 end) then raise exception 'Đã đạt giới hạn ảnh hoặc video.'; end if;
  end if;
  v_media=gen_random_uuid();
  insert into public.cd_media(id,user_id,kind,purpose,mime,bytes,object_key,position) values(v_media,p_actor,k,v_purpose,p_data->>'mime',(p_data->>'bytes')::int,
   -- B2 layout: site/hero/<id>.<ext> | users/<uid>/images|videos/<id>.<ext> | users/<uid>/chat/<id>.<ext>
   case when v_purpose='hero' then 'site/hero/' when v_purpose='slide' then 'site/login/' when v_purpose='chat' then 'users/'||p_actor::text||'/chat/' else 'users/'||p_actor::text||case when k='image' then '/images/' else '/videos/' end end||v_media::text||'.'||case p_data->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else 'webm' end,n) returning * into m;
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
  v_media=(p_data->>'id')::uuid;
  perform pg_advisory_xact_lock(hashtextextended(p_actor::text,0));
  select * into m from public.cd_media where id=v_media and user_id=p_actor and purpose='profile' and status='ready';
  if m.id is null then raise exception 'Không tìm thấy ảnh/video.'; end if;
  if coalesce((p_data->>'cover')::boolean,false) then
   if m.kind<>'image' then raise exception 'Ảnh đại diện phải là hình ảnh.'; end if;
   update public.cd_media set position=position+1 where user_id=p_actor and purpose='profile';
   update public.cd_media set position=0 where id=v_media;
  end if;
  if p_data ? 'caption' then update public.cd_media set caption=left(coalesce(p_data->>'caption',''),120) where id=v_media; end if;
  return '{}';
 elsif p_action='media_file' then
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and status='ready';
  if m.id is null or (not admin and (
     m.purpose not in ('profile','chat')
     or (m.purpose='profile' and not chich_private.can_view(p_actor,m.user_id))
     -- chat attachment: only the sender, or the recipient of the message carrying it (and not blocked)
     or (m.purpose='chat' and m.user_id<>p_actor and not exists(select 1 from public.cd_messages mm where mm.media_id=m.id and mm.recipient_id=p_actor and not chich_private.is_blocked(p_actor,mm.sender_id)))
  )) then raise exception 'Không tìm thấy ảnh/video.'; end if; return to_jsonb(m);

 -- ===================== Admin console (single admin by email) =====================
 elsif p_action like 'admin\_%' then
  if not admin then raise exception 'Forbidden'; end if;
  if p_action='admin_stats' then
   return jsonb_build_object(
    'totals',jsonb_build_object(
     'users',(select count(*) from chich_private.auth_directory()),
     'profiles',(select count(*) from public.cd_profiles),
     'complete',(select count(*) from public.cd_profiles q where chich_private.complete(q)),
     'visible',(select count(*) from public.cd_profiles where visible),
     'suspended',(select count(*) from chich_private.accounts where suspended),
     'active24h',(select count(*) from chich_private.accounts where last_seen_at>now()-interval '24 hours'),
     'active7d',(select count(*) from chich_private.accounts where last_seen_at>now()-interval '7 days'),
     'messages',(select count(*) from public.cd_messages),
     'messages24h',(select count(*) from public.cd_messages where created_at>now()-interval '24 hours'),
     'conversations',(select count(distinct (least(sender_id,recipient_id),greatest(sender_id,recipient_id))) from public.cd_messages),
     'images',(select count(*) from public.cd_media where kind='image' and purpose='profile' and status='ready'),
     'videos',(select count(*) from public.cd_media where kind='video' and purpose='profile' and status='ready'),
     'likes',(select count(*) from public.cd_likes),
     'blocks',(select count(*) from public.cd_blocks),
     'openReports',(select count(*) from public.cd_reports where not resolved),
     'nearby',(select count(*) from chich_private.locations where updated_at>now()-interval '24 hours'),
     'installed',(select count(*) from chich_private.accounts where app_installed_at is not null),
     'chatMedia',(select count(*) from public.cd_media where purpose='chat' and status='ready'),
     'teases',(select count(*) from public.cd_messages where kind='tease'),
     'feedbackOpen',(select count(*) from public.cd_feedback where not resolved)),
    'signups',chich_private.daily('signup'),
    'active',chich_private.daily('active'),
    'messagesDaily',chich_private.daily('message'),
    'uploadsDaily',chich_private.daily('upload'),
    'hours',(select jsonb_agg(jsonb_build_object('label',h||'h','value',(select count(*) from chich_private.activity a where a.created_at>now()-interval '30 days' and extract(hour from a.created_at at time zone 'Asia/Ho_Chi_Minh')=h)) order by h) from generate_series(0,23) h),
    'city',chich_private.dist('city'),'intent',chich_private.dist('intent'),'occupation',chich_private.dist('occupation'),
    'bodyType',chich_private.dist('body_type'),'lifestyle',chich_private.dist('lifestyle'),'training',chich_private.dist('training'),'age',chich_private.dist('age'),
    'geoCountry',chich_private.dist('geo_country'),'geoCity',chich_private.dist('geo_city'),'device',chich_private.dist('device'),
    'events',(select coalesce(jsonb_agg(jsonb_build_object('label',x.event,'value',x.n) order by x.n desc),'[]') from (select event,count(*) n from chich_private.activity where created_at>now()-interval '30 days' group by 1) x));
  elsif p_action='admin_users' then
   k=chich_private.search_key(left(coalesce(p_data->>'query',''),100));
   return coalesce((select jsonb_agg(x.row order by x.created_at desc) from (
    select u.created_at,jsonb_build_object('id',u.id,'email',u.email,'provider',u.provider,'createdAt',u.created_at,'lastSignIn',u.last_sign_in_at,
     'name',coalesce(q.name,''),'age',q.age,'city',coalesce(q.city,''),'intent',coalesce(q.intent,''),'complete',coalesce(chich_private.complete(q),false),'visible',coalesce(q.visible,false),
     'suspended',coalesce(a.suspended,false),'appInstalled',a.app_installed_at is not null,'lastSeen',a.last_seen_at,'lastCity',coalesce(a.last_city,''),'lastCountry',coalesce(a.last_country,''),
     'images',(select count(*) from public.cd_media md where md.user_id=u.id and md.kind='image' and md.purpose='profile' and md.status='ready'),
     'videos',(select count(*) from public.cd_media md where md.user_id=u.id and md.kind='video' and md.purpose='profile' and md.status='ready'),
     'sent',(select count(*) from public.cd_messages mm where mm.sender_id=u.id),
     'reported',(select count(*) from public.cd_reports r where r.target_id=u.id)) as row
    from chich_private.auth_directory() u left join public.cd_profiles q on q.id=u.id left join chich_private.accounts a on a.user_id=u.id
    where (k='' or chich_private.search_key(coalesce(u.email,'')||' '||coalesce(q.name,'')||' '||coalesce(q.city,'')||' '||coalesce(a.last_city,'')) like '%'||k||'%')
     and (coalesce(p_data->>'filter','all')='all' or (p_data->>'filter'='suspended' and coalesce(a.suspended,false)) or (p_data->>'filter'='incomplete' and not coalesce(chich_private.complete(q),false)) or (p_data->>'filter'='complete' and coalesce(chich_private.complete(q),false)))
    order by u.created_at desc limit 50 offset least(5000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_user' then
   target=(p_data->>'id')::uuid;
   insert into chich_private.admin_audit(admin_id,action,target_id) values(p_actor,'view_user',target);
   return jsonb_build_object(
    'auth',(select to_jsonb(u) from chich_private.auth_directory() u where u.id=target),
    'account',(select to_jsonb(a)-'user_id' from chich_private.accounts a where a.user_id=target),
    'profile',(select chich_private.profile_json(q)||jsonb_build_object('adultAcceptedAt',q.adult_accepted_at,'createdAt',q.created_at,'updatedAt',q.updated_at) from public.cd_profiles q where q.id=target),
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes,'caption',md.caption,'status',md.status,'purpose',md.purpose,'createdAt',md.created_at) order by md.created_at desc) from public.cd_media md where md.user_id=target),'[]'),
    'nearby',(select jsonb_build_object('enabled',true,'updatedAt',l.updated_at) from chich_private.locations l where l.user_id=target and l.updated_at>now()-interval '24 hours'),
    'activity',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (select id,event,target_id,country,region,city,device,created_at from chich_private.activity where user_id=target order by created_at desc limit 300) x),'[]'),
    'conversations',coalesce((select jsonb_agg(to_jsonb(x) order by x.last_at desc) from (
      select g.partner_id,g.n,g.last_at,pq.name partner_name,chich_private.auth_email(g.partner_id) partner_email from (
       select case when mm.sender_id=target then mm.recipient_id else mm.sender_id end as partner_id,count(*) n,max(mm.created_at) last_at
       from public.cd_messages mm where target in (mm.sender_id,mm.recipient_id) group by 1) g left join public.cd_profiles pq on pq.id=g.partner_id) x),'[]'),
    'likesGiven',(select count(*) from public.cd_likes where user_id=target),
    'likesReceived',(select count(*) from public.cd_likes where target_id=target),
    'blocksGiven',(select count(*) from public.cd_blocks where user_id=target),
    'blockedBy',(select count(*) from public.cd_blocks where target_id=target),
    'reportsAgainst',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.cd_reports r where r.target_id=target),'[]'),
    'reportsBy',coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from public.cd_reports r where r.reporter_id=target),'[]'));
  elsif p_action='admin_conversations' then
   target=nullif(p_data->>'userId','')::uuid;
   return coalesce((select jsonb_agg(to_jsonb(x) order by x.last_at desc) from (
    select c.a,c.b,c.n,c.last_at,c.preview,pa.name a_name,pb.name b_name,chich_private.auth_email(c.a) a_email,chich_private.auth_email(c.b) b_email from (
     select least(sender_id,recipient_id) a,greatest(sender_id,recipient_id) b,count(*) n,max(created_at) last_at,left((array_agg(case when cm.kind='tease' then '🔥 '||cm.body when cm.body='' and cm.media_id is not null then '[Ảnh/video]' else cm.body end order by cm.created_at desc))[1],140) preview
     from public.cd_messages cm where target is null or target in (cm.sender_id,cm.recipient_id) group by 1,2) c
    join public.cd_profiles pa on pa.id=c.a join public.cd_profiles pb on pb.id=c.b
    order by c.last_at desc limit 50 offset least(5000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_messages' then
   target=(p_data->>'a')::uuid;v_media=(p_data->>'b')::uuid;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'view_chat',target,jsonb_build_object('with',v_media));
   return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select mm.id,mm.sender_id,mm.recipient_id,mm.body,mm.kind,mm.created_at,case when md.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes)) end as media
    from public.cd_messages mm left join public.cd_media md on md.id=mm.media_id and md.status='ready'
    where (mm.sender_id=target and mm.recipient_id=v_media) or (mm.sender_id=v_media and mm.recipient_id=target) order by mm.created_at desc limit 1000) x),'[]');
  elsif p_action='admin_media' then
   return jsonb_build_object('media',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select md.id,md.user_id,md.kind,md.mime,md.bytes,md.caption,md.status,md.purpose,md.created_at,q.name owner_name,chich_private.auth_email(md.user_id) owner_email
    from public.cd_media md join public.cd_profiles q on q.id=md.user_id
    where md.status='ready' and md.purpose in ('profile','chat') and (coalesce(p_data->>'kind','all')='all' or md.kind=p_data->>'kind') and (coalesce(p_data->>'purpose','all')='all' or md.purpose=p_data->>'purpose')
    order by md.created_at desc limit 60 offset least(5000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]'));
  elsif p_action='admin_activity' then
   target=nullif(p_data->>'userId','')::uuid;
   return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select a.id,a.user_id,a.event,a.target_id,a.country,a.region,a.city,a.device,a.created_at,q.name,chich_private.auth_email(a.user_id) email
    from chich_private.activity a join public.cd_profiles q on q.id=a.user_id
    where (target is null or a.user_id=target) and (coalesce(p_data->>'event','all')='all' or a.event=p_data->>'event')
    order by a.created_at desc limit 100 offset least(10000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_suspend' then
   target=(p_data->>'id')::uuid;
   if target=p_actor then raise exception 'Không thể khóa tài khoản quản trị.'; end if;
   insert into public.cd_profiles(id) select target where chich_private.user_exists(target) on conflict do nothing;
   insert into chich_private.accounts(user_id) select target where exists(select 1 from public.cd_profiles where id=target) on conflict do nothing;
   update chich_private.accounts set suspended=coalesce((p_data->>'suspended')::boolean,true) where user_id=target;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'suspend',target,jsonb_build_object('suspended',coalesce((p_data->>'suspended')::boolean,true)));
   return '{}';
  elsif p_action='admin_delete_media' then
   update public.cd_media set status='deleting' where id=(p_data->>'id')::uuid returning * into m;
   if m.id is null then raise exception 'Không tìm thấy ảnh/video.'; end if;
   update public.cd_settings set hero_media_id=null where hero_media_id=m.id;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'delete_media',m.user_id,jsonb_build_object('media',m.id));
   return to_jsonb(m);
  elsif p_action='admin_audit_add' then
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,left(p_data->>'action',40),nullif(p_data->>'target','')::uuid,coalesce(p_data->'detail','{}'));
   return '{}';
  elsif p_action='admin_audit' then
   return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select au.*,q.name target_name,chich_private.auth_email(au.target_id) target_email from chich_private.admin_audit au left join public.cd_profiles q on q.id=au.target_id
    order by au.created_at desc limit 200 offset least(10000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_hero' then
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and purpose='hero' and kind='image' and status='ready';
  if m.id is null then raise exception 'Ảnh hero chưa sẵn sàng.'; end if;
  update public.cd_settings set hero_media_id=m.id,hero_alt=left(coalesce(nullif(trim(p_data->>'alt'),''),'Sức hút từ những điều đời thường'),160) where id;
  update public.cd_media set status='deleting' where purpose='hero' and id<>m.id;
  return '{}';
  elsif p_action='admin_slides' then
   return (select jsonb_build_object('mode',s.login_mode,'interval',s.login_interval,
    'slides',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'position',md.position,'bytes',md.bytes,'createdAt',md.created_at) order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
  elsif p_action='admin_slide_order' then
   update public.cd_media set position=coalesce((p_data->>'position')::int,position) where id=(p_data->>'id')::uuid and purpose='slide';
   return '{}';
  elsif p_action='admin_login_settings' then
   update public.cd_settings set login_mode=coalesce(nullif(p_data->>'mode',''),login_mode),login_interval=least(30,greatest(3,coalesce((p_data->>'interval')::int,login_interval))) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'login_settings',jsonb_build_object('mode',p_data->>'mode','interval',p_data->>'interval'));
   return '{}';
  elsif p_action='admin_theme' then
   if coalesce(p_data->>'theme','') not in ('navy_coral','navy_orange','black_red','charcoal_gold','forest_cream','cobalt_lime','cream_burgundy') then raise exception 'Giao diện không hợp lệ.'; end if;
   update public.cd_settings set theme=p_data->>'theme' where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'theme',jsonb_build_object('theme',p_data->>'theme'));
   return '{}';
  elsif p_action='admin_feedback' then
   return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select f.id,f.body,f.resolved,f.created_at,f.user_id,f.device,chich_private.auth_email(f.user_id) email,q.name
    from public.cd_feedback f left join public.cd_profiles q on q.id=f.user_id
    where (coalesce(p_data->>'filter','open')='all' or (p_data->>'filter'='done' and f.resolved) or (coalesce(p_data->>'filter','open')='open' and not f.resolved))
    order by f.created_at desc limit 100 offset least(10000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_feedback_resolve' then
   update public.cd_feedback set resolved=coalesce((p_data->>'resolved')::boolean,true) where id=(p_data->>'id')::uuid; return '{}';
  elsif p_action='admin_feedback_delete' then
   delete from public.cd_feedback where id=(p_data->>'id')::uuid;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'feedback_delete',jsonb_build_object('feedback',p_data->>'id')); return '{}';
  elsif p_action='admin_teasers' then
   return coalesce((select jsonb_agg(to_jsonb(t) order by t.position,t.created_at) from public.cd_teasers t),'[]');
  elsif p_action='admin_teaser_save' then
   if coalesce(length(trim(p_data->>'body')),0) not between 1 and 200 then raise exception 'Câu thả thính cần 1–200 ký tự.'; end if;
   if coalesce(p_data->>'id','')='' then
    insert into public.cd_teasers(body,active,position) values(trim(p_data->>'body'),coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'position')::int,(select coalesce(max(position),0)+1 from public.cd_teasers))) returning id into v_media;
   else
    update public.cd_teasers set body=trim(p_data->>'body'),active=coalesce((p_data->>'active')::boolean,active),position=coalesce((p_data->>'position')::int,position) where id=(p_data->>'id')::uuid returning id into v_media;
    if v_media is null then raise exception 'Không tìm thấy câu thả thính.'; end if;
   end if;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'teaser_save',jsonb_build_object('teaser',v_media));
   return jsonb_build_object('id',v_media);
  elsif p_action='admin_teaser_delete' then
   delete from public.cd_teasers where id=(p_data->>'id')::uuid;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'teaser_delete',jsonb_build_object('teaser',p_data->>'id'));
   return '{}';
  elsif p_action='admin_reports' then
   return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at) from (select r.*,rp.name reporter_name,tp.name target_name,chich_private.auth_email(r.reporter_id) reporter_email,chich_private.auth_email(r.target_id) target_email from public.cd_reports r join public.cd_profiles rp on rp.id=r.reporter_id join public.cd_profiles tp on tp.id=r.target_id where not r.resolved order by r.created_at limit 100) a),'[]');
  elsif p_action='admin_resolve' then
   update public.cd_reports set resolved=true where id=(p_data->>'id')::uuid returning target_id into target;
   if coalesce((p_data->>'suspend')::boolean,false) and target is not null and target<>p_actor then update chich_private.accounts set suspended=true where user_id=target;end if;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'resolve_report',target,jsonb_build_object('suspend',coalesce((p_data->>'suspend')::boolean,false)));return '{}';
  else raise exception 'Unknown action';
  end if;
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
   if coalesce(length(trim(p_data->>'reason')),0) not between 1 and 100 then raise exception 'Chọn lý do báo cáo.'; end if;
   insert into public.cd_reports(reporter_id,target_id,reason,note) values(p_actor,target,trim(p_data->>'reason'),left(coalesce(p_data->>'note',''),500));
  else
   if not chich_private.complete(p) then raise exception 'Hãy hoàn thiện hồ sơ trước khi gửi lời chào.';end if;
   if coalesce(p_data->>'teaserId','')<>'' then
    select body into k from public.cd_teasers where id=(p_data->>'teaserId')::uuid and active;
    if k is null then raise exception 'Câu thả thính không còn khả dụng.';end if;
    insert into public.cd_messages(sender_id,recipient_id,body,kind) values(p_actor,target,k,'tease');
    return '{}';
   end if;
   v_media=nullif(p_data->>'mediaId','')::uuid;
   if v_media is not null and not exists(select 1 from public.cd_media where id=v_media and user_id=p_actor and purpose='chat' and status='ready') then raise exception 'Ảnh/video đính kèm không hợp lệ hoặc chưa tải xong.';end if;
   if coalesce(length(trim(p_data->>'text')),0)>1000 or (v_media is null and coalesce(length(trim(p_data->>'text')),0)=0) then raise exception 'Tin nhắn cần từ 1 đến 1000 ký tự.';end if;
   insert into public.cd_messages(sender_id,recipient_id,body,media_id) values(p_actor,target,coalesce(trim(p_data->>'text'),''),v_media);
  end if; return '{}';
 elsif p_action='teasers' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body) order by t.position,t.created_at) from public.cd_teasers t where t.active),'[]');
 elsif p_action='liked' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q join public.cd_likes l on l.target_id=q.id where l.user_id=p_actor and chich_private.can_view(p_actor,q.id)),'[]');
 elsif p_action='blocked' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name)) from public.cd_profiles q join public.cd_blocks b on b.target_id=q.id where b.user_id=p_actor),'[]');
 elsif p_action='contacts' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q where q.id<>p_actor and chich_private.can_view(p_actor,q.id) and exists(select 1 from public.cd_messages mm where (mm.sender_id=p_actor and mm.recipient_id=q.id) or (mm.recipient_id=p_actor and mm.sender_id=q.id))),'[]');
 elsif p_action='messages' then
  target=(p_data->>'id')::uuid;
  if not chich_private.can_view(p_actor,target) then raise exception 'Cuộc trò chuyện không khả dụng.';end if;
  return coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at) from (select mm.id,mm.sender_id,mm.recipient_id,mm.body,mm.kind,mm.created_at,case when md.id is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes)) end as media
    from public.cd_messages mm left join public.cd_media md on md.id=mm.media_id and md.status='ready'
    where (mm.sender_id=p_actor and mm.recipient_id=target) or (mm.sender_id=target and mm.recipient_id=p_actor) order by mm.created_at desc limit 100) x),'[]');
 end if;
 raise exception 'Unknown action';
end $$;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;
commit;
