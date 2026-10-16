-- CHI.CH DAO. — FILE SQL DUY NHẤT (v0.11). Dán toàn bộ vào Supabase → SQL Editor → Run, 1 lần là đủ.
-- • Database trống            → cài mới đầy đủ v0.11.
-- • Đã có app (v0.5 → v0.11)  → nâng cấp lên v0.11, GIỮ NGUYÊN dữ liệu và tài khoản.
-- • Chạy lại lần nữa vẫn an toàn. Tất cả nằm trong 1 transaction: lỗi ở đâu thì không có gì bị thay đổi.
-- Không xóa bảng auth.users (tài khoản đăng nhập).
do $cd_main$
begin
 if to_regclass('public.cd_profiles') is null then
  raise notice 'CHI.CH DAO.: database trống → cài mới v0.11';
  execute $cd_step$
-- CHI.CH DAO. v0.11. Run once on a dedicated Supabase project.
-- Browser roles intentionally have NO table/RPC access. The Worker validates
-- Supabase access tokens with /auth/v1/user, then calls this service-only API.
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
 is_admin boolean not null default false, suspended boolean not null default false,
 app_installed_at timestamptz,
 last_seen_at timestamptz, last_country text not null default '', last_city text not null default '', last_device text not null default ''
);
-- Single admin, identified by the verified Supabase Auth email (Google or email login).
create table chich_private.settings (
 id boolean primary key default true check(id),
 admin_email text not null check(admin_email=lower(admin_email))
);
insert into chich_private.settings(id,admin_email) values(true,'vinnielx@gmail.com');
-- Account activity: sign-in/out, app opens and actions. Geo is Cloudflare's IP-level
-- country/region/city estimate; GPS coordinates are never written here.
create table chich_private.activity (
 id bigint generated always as identity primary key,
 user_id uuid not null references public.cd_profiles(id) on delete cascade,
 event text not null check(length(event)<=40),
 target_id uuid,
 country text not null default '', region text not null default '', city text not null default '', device text not null default '',
 created_at timestamptz not null default now()
);
create index cd_activity_user on chich_private.activity(user_id,created_at desc);
create index cd_activity_time on chich_private.activity(created_at desc);
-- Every admin read of private data and every admin change is recorded here.
create table chich_private.admin_audit (
 id bigint generated always as identity primary key,
 admin_id uuid not null, action text not null, target_id uuid, detail jsonb not null default '{}',
 created_at timestamptz not null default now()
);
create index cd_audit_time on chich_private.admin_audit(created_at desc);
create table public.cd_media (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.cd_profiles(id) on delete cascade,
 kind text not null check(kind in ('image','video')),
 purpose text not null default 'profile' check(purpose in ('profile','hero','chat','slide','sample')),
 mime text not null check(mime in ('image/jpeg','image/png','image/webp','video/mp4','video/webm')),
 bytes integer not null check(bytes>0 and bytes<=20971520),
 object_key text not null unique,
 -- Optional small preview (~480 px) stored next to the original on B2; cards/lists use it, full image opens on tap.
 thumb_key text not null default '', thumb_mime text not null default '' check(thumb_mime in ('','image/jpeg','image/webp')),
 thumb_bytes integer not null default 0 check(thumb_bytes between 0 and 307200), thumb_ready boolean not null default false,
 status text not null default 'pending' check(status in ('pending','uploading','ready','deleting')),
 caption text not null default '' check(length(caption)<=120),
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index cd_media_owner on public.cd_media(user_id,purpose,status);
create table public.cd_settings (
 id boolean primary key default true check(id),
 hero_media_id uuid references public.cd_media(id) on delete set null,
 hero_alt text not null default 'Sức hút từ những điều đời thường' check(length(hero_alt)<=160),
 -- Signed-out page: admin images on the right side, as a single image or a slideshow.
 login_mode text not null default 'slide' check(login_mode in ('single','slide')),
 login_interval integer not null default 6 check(login_interval between 3 and 30),
 -- Auto-delete chat photos/videos older than N days (0 = keep forever). Message text is kept.
 chat_media_days integer not null default 0 check(chat_media_days between 0 and 3650),
 -- Site colour theme, chosen by the admin (brand guideline schemes + navy/coral).
 theme text not null default 'navy_coral' check(theme in ('navy_coral','navy_orange','black_red','charcoal_gold','forest_cream','cobalt_lime','cream_burgundy')),
 -- Clearly-labelled illustration profiles in Discover (cannot be messaged/liked). Off by default.
 samples_enabled boolean not null default false,
 -- Discover grid: profile cards per row (desktop / phone).
 grid_cols integer not null default 3 check(grid_cols between 2 and 6),
 grid_cols_mobile integer not null default 2 check(grid_cols_mobile between 1 and 2)
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
 body text not null default '' check(length(body)<=1000),
 media_id uuid unique references public.cd_media(id) on delete set null,
 -- Self-destructing attachment: 0 = normal. Countdown starts when the recipient opens it; unopened ones vanish after 24h.
 ephemeral_seconds integer not null default 0 check(ephemeral_seconds in (0,60,300,600,3600)),
 viewed_at timestamptz, expires_at timestamptz,
 -- When the recipient opened the conversation (unread badges / new-message notices).
 read_at timestamptz,
 kind text not null default 'text' check(kind in ('text','tease')),
 created_at timestamptz not null default now(), check(sender_id<>recipient_id)
);
-- Flirty one-tap lines ("thả thính") written by the admin; users pick one and send it as a 🔥 message.
create table public.cd_teasers (
 id uuid primary key default gen_random_uuid(),
 body text not null check(length(trim(body)) between 1 and 200),
 active boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
insert into public.cd_teasers(body,position) values
 ('Ảnh của anh làm em quên luôn mình định nói gì 🔥',1),
 ('Nhìn anh là thấy nóng hơn cả Sài Gòn trưa nắng 🔥',2),
 ('Tập ở đâu mà body chuẩn vậy anh? Chỉ em với 😏',3),
 ('Cuối tuần này anh rảnh đi cà phê không?',4),
 ('Cho em xin một nụ cười để làm quen nha 😉',5),
 ('Anh có tin vào tiếng sét ái tình không, hay để em lướt qua lần nữa?',6);
create index cd_message_pair on public.cd_messages(sender_id,recipient_id,created_at desc);
create index cd_message_recipient on public.cd_messages(recipient_id,created_at desc);
create index cd_message_unread on public.cd_messages(recipient_id,sender_id) where read_at is null;
create table public.cd_reports (
 id uuid primary key default gen_random_uuid(),
 reporter_id uuid not null references public.cd_profiles(id) on delete cascade,
 target_id uuid not null references public.cd_profiles(id) on delete cascade,
 reason text not null check(length(reason) between 1 and 100),
 note text not null default '' check(length(note)<=500),
 resolved boolean not null default false, created_at timestamptz not null default now()
);
create index cd_reports_open on public.cd_reports(resolved,created_at desc);

-- Guest/user feedback from the sign-in page. Browsers may only call cd_feedback_submit (rate-limited);
-- they cannot read the table. IP and device id are stored only as salted hashes.
create table public.cd_feedback (
 id uuid primary key default gen_random_uuid(),
 body text not null check(length(trim(body)) between 5 and 1000),
 user_id uuid references auth.users(id) on delete set null,
 client_hash text not null default '', ip_hash text not null default '', device text not null default '',
 resolved boolean not null default false,
 created_at timestamptz not null default now()
);
create index cd_feedback_time on public.cd_feedback(created_at desc);
create index cd_feedback_client on public.cd_feedback(client_hash,created_at desc);
create index cd_feedback_ip on public.cd_feedback(ip_hash,created_at desc);
-- Illustration profiles ("Hồ sơ minh họa"): admin-made, always shown with a visible label, never messageable.
-- Not linked to auth.users, so they can never send/receive messages, likes or reports.
create table public.cd_samples (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 40),
 age integer not null check(age between 18 and 80),
 city text not null default '' check(length(city)<=80),
 occupation text not null default '' check(length(occupation)<=80),
 body_type text not null default '' check(length(body_type)<=80),
 lifestyle text not null default '' check(length(lifestyle)<=80),
 training text not null default '' check(length(training)<=80),
 intent text not null default '' check(length(intent)<=80),
 bio text not null default '' check(length(bio)<=400),
 media_id uuid references public.cd_media(id) on delete set null,
 active boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index cd_samples_order on public.cd_samples(position,created_at);
-- B2 objects whose DB rows vanished outside the normal cleanup (e.g. an account deleted in Supabase Auth cascades
-- through cd_media). The cron job deletes these files from B2.
create table chich_private.storage_trash (id uuid primary key default gen_random_uuid(), object_key text not null, thumb_key text not null default '', created_at timestamptz not null default now());
create table chich_private.secrets (id boolean primary key default true check(id), feedback_salt text not null default md5(random()::text||clock_timestamp()::text));
insert into chich_private.secrets(id) values(true);
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
alter table public.cd_teasers enable row level security;
alter table public.cd_feedback enable row level security;
alter table public.cd_samples enable row level security;
alter table chich_private.secrets enable row level security;
alter table chich_private.storage_trash enable row level security;
alter table chich_private.accounts enable row level security;
alter table chich_private.locations enable row level security;
alter table chich_private.rate_limits enable row level security;
alter table chich_private.settings enable row level security;
alter table chich_private.activity enable row level security;
alter table chich_private.admin_audit enable row level security;
revoke all on public.cd_profiles,public.cd_media,public.cd_settings,public.cd_likes,public.cd_blocks,public.cd_messages,public.cd_reports,public.cd_teasers,public.cd_feedback,public.cd_samples from public,anon,authenticated;
grant select,insert,update,delete on public.cd_profiles,public.cd_media,public.cd_settings,public.cd_likes,public.cd_blocks,public.cd_messages,public.cd_reports,public.cd_teasers,public.cd_feedback,public.cd_samples to service_role;
grant select,insert,update,delete on all tables in schema chich_private to service_role;

create function chich_private.is_blocked(a uuid,b uuid) returns boolean
language sql stable security invoker set search_path='' as $$
 select exists(select 1 from public.cd_blocks where (user_id=a and target_id=b) or (user_id=b and target_id=a))
$$;
-- service_role has no SELECT on auth.users in hosted Supabase. This narrow
-- definer helper (owned by the migration owner) only answers "does this ID exist".
create function chich_private.user_exists(uid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from auth.users where id=uid)
$$;
create function chich_private.auth_email(uid uuid) returns text
language sql stable security definer set search_path='' as $$
 select lower(email) from auth.users where id=uid
$$;
-- Admin directory of Auth users. Only service_role may execute (see grants below).
create function chich_private.auth_directory() returns table(id uuid,email text,provider text,created_at timestamptz,last_sign_in_at timestamptz,confirmed boolean)
language sql stable security definer set search_path='' as $$
 select u.id,lower(u.email),coalesce(u.raw_app_meta_data->>'provider',''),u.created_at,u.last_sign_in_at,(u.email_confirmed_at is not null) from auth.users u
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
 'complete',chich_private.complete(p),'photos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'caption',m.caption,'position',m.position,'thumb',m.thumb_ready) order by m.position,m.created_at)
 from public.cd_media m where m.user_id=p.id and m.purpose='profile' and m.status='ready'),'[]'::jsonb))
$$;
create function chich_private.sample_json(s public.cd_samples) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'sample',true,'name',s.name,'age',s.age,'city',s.city,'occupation',s.occupation,
 'bodyType',s.body_type,'lifestyle',s.lifestyle,'training',s.training,'intent',s.intent,'bio',s.bio,'active',s.active,'position',s.position,
 'photos',coalesce((select jsonb_build_array(jsonb_build_object('id',m.id,'kind','image','caption','','thumb',m.thumb_ready)) from public.cd_media m where m.id=s.media_id and m.status='ready'),'[]'::jsonb))
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

create function chich_private.daily(kind text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_agg(jsonb_build_object('label',to_char(d,'DD/MM'),'value',case kind
  when 'signup' then (select count(*) from public.cd_profiles where (created_at at time zone 'Asia/Ho_Chi_Minh')::date=d)
  when 'active' then (select count(distinct user_id) from chich_private.activity where (created_at at time zone 'Asia/Ho_Chi_Minh')::date=d)
  when 'message' then (select count(*) from public.cd_messages where (created_at at time zone 'Asia/Ho_Chi_Minh')::date=d)
  else (select count(*) from public.cd_media where purpose='profile' and (created_at at time zone 'Asia/Ho_Chi_Minh')::date=d) end) order by d)
 from (select generate_series((now() at time zone 'Asia/Ho_Chi_Minh')::date-29,(now() at time zone 'Asia/Ho_Chi_Minh')::date,interval '1 day')::date d) s
$$;
create function chich_private.dist(col text) returns jsonb
language sql stable security invoker set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('label',x.k,'value',x.n) order by x.n desc),'[]') from (
  select coalesce(nullif(case col when 'city' then q.city when 'intent' then q.intent when 'occupation' then q.occupation when 'body_type' then q.body_type
   when 'lifestyle' then q.lifestyle when 'training' then q.training
   when 'age' then case when q.age is null then '' when q.age<25 then '18–24' when q.age<30 then '25–29' when q.age<35 then '30–34' when q.age<40 then '35–39' when q.age<50 then '40–49' else '50+' end
   when 'geo_country' then a.last_country when 'geo_city' then a.last_city when 'device' then a.last_device end,''),'Chưa có') k,count(*) n
  from public.cd_profiles q left join chich_private.accounts a on a.user_id=q.id group by 1 order by 2 desc limit 25) x
$$;


-- The ONLY function browsers may call directly (anon + authenticated). One feedback per device per 24h,
-- at most 5 per network address per 24h (shared mobile IPs), plus a global flood cap.
create function public.cd_feedback_submit(p_body text, p_client text default '') returns jsonb
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


-- Media rows whose files must be removed from B2 now.
create function chich_private.media_due() returns setof public.cd_media
language sql stable security invoker set search_path='' as $$
 select md.* from public.cd_media md where
  (md.status in ('pending','uploading') and md.created_at<now()-interval '1 hour')
  or md.status='deleting'
  or (md.purpose='chat' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_messages mm where mm.media_id=md.id))
  or (md.purpose='chat' and md.status='ready' and exists(select 1 from public.cd_messages mm where mm.media_id=md.id and mm.ephemeral_seconds>0
       and ((mm.expires_at is not null and mm.expires_at<now()) or (mm.viewed_at is null and mm.created_at<now()-interval '24 hours'))))
  or (md.purpose='chat' and md.status='ready' and (select chat_media_days from public.cd_settings where id)>0
       and md.created_at<now()-make_interval(days=>(select chat_media_days from public.cd_settings where id)))
  or (md.purpose='sample' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_samples s where s.media_id=md.id))
$$;
-- Remember B2 keys when media rows disappear outside cleanup_done (account deletion cascades etc.).
create function chich_private.media_trash() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('chich.cleanup',true),'')<>'1' and old.status in ('ready','uploading','deleting') then
  insert into chich_private.storage_trash(object_key,thumb_key) values(old.object_key,old.thumb_key);
 end if;
 return old;
end $$;
create trigger cd_media_trash after delete on public.cd_media for each row execute function chich_private.media_trash();


-- One chat message as JSON for a viewer. Self-destructing media is only included for the recipient while it is open.
create function chich_private.message_json(mm public.cd_messages, viewer uuid, as_admin boolean) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',mm.id,'sender_id',mm.sender_id,'recipient_id',mm.recipient_id,'body',mm.body,'kind',mm.kind,'created_at',mm.created_at,
  'ephemeral',mm.ephemeral_seconds,'viewedAt',mm.viewed_at,'expiresAt',mm.expires_at,
  'expired',mm.ephemeral_seconds>0 and (mm.media_id is null or (mm.expires_at is not null and mm.expires_at<=now()) or (mm.viewed_at is null and mm.created_at<now()-interval '24 hours')),
  'media',case when md.id is null then '[]'::jsonb
   when mm.ephemeral_seconds>0 and not as_admin and not coalesce(mm.recipient_id=viewer and mm.expires_at>now(),false) then '[]'::jsonb
   else jsonb_build_array(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes,'thumb',md.thumb_ready and mm.ephemeral_seconds=0)) end)
 from (select 1) one left join public.cd_media md on md.id=mm.media_id and md.status='ready'
$$;

-- Sole service API. p_actor MUST come from verified Auth user, never request JSON.
create function public.cd_api(p_actor uuid, p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.cd_profiles; m public.cd_media; v_msg public.cd_messages; result jsonb; target uuid; v_media uuid; v_ids uuid[];
 admin boolean; n integer; k text; v_purpose text; loc chich_private.locations; radius integer;
begin
 if current_user<>'service_role' then raise exception 'Forbidden'; end if;
 -- Auth-independent public hero; returns only the selected, ready hero.
 if p_action='hero' then
  return (select jsonb_build_object('mediaId',s.hero_media_id,'alt',s.hero_alt,'theme',s.theme,'gridCols',s.grid_cols,'gridColsMobile',s.grid_cols_mobile,'loginMode',s.login_mode,'loginInterval',s.login_interval,
   'slides',coalesce((select jsonb_agg(md.id order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
 end if;
 if p_action='cleanup_list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
   (select id,object_key,thumb_key from chich_private.media_due() limit 100)
   union all (select id,object_key,thumb_key from chich_private.storage_trash order by created_at limit 100)) x),'[]');
 end if;
 if p_action='cleanup_expired' then
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  delete from chich_private.rate_limits where window_start<now()-interval '2 days';
  delete from chich_private.activity where created_at<now()-interval '365 days';
  return '{}';
 end if;
 if p_action='cleanup_done' then
  perform set_config('chich.cleanup','1',true);
  delete from public.cd_media where id=(p_data->>'id')::uuid and id in (select d.id from chich_private.media_due() d);
  delete from chich_private.storage_trash where id=(p_data->>'id')::uuid;
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
  if v_purpose in ('hero','slide','sample') and not admin then raise exception 'Forbidden'; end if;
  if v_purpose in ('hero','slide','sample') and k<>'image' then raise exception 'Ảnh trang chủ/đăng nhập/minh họa phải là ảnh.'; end if;
  if k is null or k not in ('image','video') or v_purpose not in ('profile','hero','chat','slide','sample') or coalesce(p_data->>'bytes','') !~ '^\d{1,9}$' then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if (p_data->>'bytes')::int<1 or (k='image' and ((p_data->>'bytes')::int>8388608 or coalesce(p_data->>'mime','') not in ('image/jpeg','image/png','image/webp'))) or (k='video' and ((p_data->>'bytes')::int>20971520 or coalesce(p_data->>'mime','') not in ('video/mp4','video/webm'))) then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if v_purpose='chat' then
   n=0; -- chat attachments: no album cap; limited by size + upload_chat throttle; unsent files are purged after 24h
  else
   select count(*) into n from public.cd_media where user_id=p_actor and kind=k and cd_media.purpose=v_purpose and status<>'deleting';
   if n>=(case when v_purpose='hero' then 3 when v_purpose='slide' then 12 when v_purpose='sample' then 200 when k='image' then 10 else 2 end) then raise exception 'Đã đạt giới hạn ảnh hoặc video.'; end if;
  end if;
  v_media=gen_random_uuid();
  insert into public.cd_media(id,user_id,kind,purpose,mime,bytes,object_key,position) values(v_media,p_actor,k,v_purpose,p_data->>'mime',(p_data->>'bytes')::int,
   -- B2 layout: site/hero/<id>.<ext> | users/<uid>/images|videos/<id>.<ext> | users/<uid>/chat/<id>.<ext>
   case when v_purpose='hero' then 'site/hero/' when v_purpose='slide' then 'site/login/' when v_purpose='sample' then 'site/samples/' when v_purpose='chat' then 'users/'||p_actor::text||'/chat/' else 'users/'||p_actor::text||case when k='image' then '/images/' else '/videos/' end end||v_media::text||'.'||case p_data->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else 'webm' end,n) returning * into m;
  if k='image' and coalesce(p_data->>'thumbBytes','') ~ '^\d{1,6}$' and (p_data->>'thumbBytes')::int between 1 and 307200 and coalesce(p_data->>'thumbMime','') in ('image/jpeg','image/webp') then
   update public.cd_media set thumb_bytes=(p_data->>'thumbBytes')::int,thumb_mime=p_data->>'thumbMime',
    thumb_key=regexp_replace(object_key,'\.[a-z0-9]+$','')||'_t.'||case when p_data->>'thumbMime'='image/webp' then 'webp' else 'jpg' end
   where id=v_media returning * into m;
  end if;
  return to_jsonb(m);
 elsif p_action='claim_media' then
  update public.cd_media set status='uploading' where id=(p_data->>'id')::uuid and user_id=p_actor and status='pending' and created_at>now()-interval '15 minutes' returning * into m;
  if m.id is null then raise exception 'Lượt tải lên hết hạn hoặc đã sử dụng.'; end if; return to_jsonb(m);
 elsif p_action='claim_thumb' then
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and user_id=p_actor and status='ready' and thumb_key<>'' and not thumb_ready and created_at>now()-interval '30 minutes';
  if m.id is null then raise exception 'Ảnh thu nhỏ không hợp lệ.'; end if; return to_jsonb(m);
 elsif p_action='finish_thumb' then
  update public.cd_media set thumb_ready=true where id=(p_data->>'id')::uuid and user_id=p_actor and thumb_key<>'' returning * into m;
  if m.id is null then raise exception 'Ảnh thu nhỏ không hợp lệ.'; end if; return jsonb_build_object('id',m.id);
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
     m.purpose not in ('profile','chat','sample')
     -- illustration photo: any signed-in user, only while the feature is on and the sample is active
     or (m.purpose='sample' and not ((select samples_enabled from public.cd_settings where id) and exists(select 1 from public.cd_samples s where s.media_id=m.id and s.active)))
     or (m.purpose='profile' and not chich_private.can_view(p_actor,m.user_id))
     -- chat attachment: only the sender, or the recipient of the message carrying it (and not blocked)
     or (m.purpose='chat' and not exists(select 1 from public.cd_messages mm where mm.media_id=m.id
          and ((mm.ephemeral_seconds=0 and (mm.sender_id=p_actor or (mm.recipient_id=p_actor and not chich_private.is_blocked(p_actor,mm.sender_id))))
            or (mm.ephemeral_seconds>0 and mm.recipient_id=p_actor and coalesce(mm.expires_at>now(),false) and not chich_private.is_blocked(p_actor,mm.sender_id)))))
  )) then raise exception 'Không tìm thấy ảnh/video.'; end if;
  return to_jsonb(m)||case when exists(select 1 from public.cd_messages mm where mm.media_id=m.id and mm.ephemeral_seconds>0) then jsonb_build_object('cache_control','no-store') else '{}'::jsonb end;

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
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes,'caption',md.caption,'status',md.status,'purpose',md.purpose,'createdAt',md.created_at,'thumb',md.thumb_ready) order by md.created_at desc) from public.cd_media md where md.user_id=target),'[]'),
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
     select least(sender_id,recipient_id) a,greatest(sender_id,recipient_id) b,count(*) n,max(created_at) last_at,left((array_agg(case when cm.kind='tease' then '🔥 '||cm.body when cm.ephemeral_seconds>0 and cm.body='' then '[Ảnh/video tự hủy]' when cm.body='' and cm.media_id is not null then '[Ảnh/video]' else cm.body end order by cm.created_at desc))[1],140) preview
     from public.cd_messages cm where target is null or target in (cm.sender_id,cm.recipient_id) group by 1,2) c
    join public.cd_profiles pa on pa.id=c.a join public.cd_profiles pb on pb.id=c.b
    order by c.last_at desc limit 50 offset least(5000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_messages' then
   target=(p_data->>'a')::uuid;v_media=(p_data->>'b')::uuid;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'view_chat',target,jsonb_build_object('with',v_media));
   return coalesce((select jsonb_agg(chich_private.message_json(mm,p_actor,true) order by mm.created_at) from (select * from public.cd_messages
    where (sender_id=target and recipient_id=v_media) or (sender_id=v_media and recipient_id=target) order by created_at desc limit 1000) mm),'[]');
  elsif p_action='admin_media' then
   return jsonb_build_object('media',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select md.id,md.user_id,md.kind,md.mime,md.bytes,md.caption,md.status,md.purpose,md.created_at,md.thumb_ready thumb,q.name owner_name,chich_private.auth_email(md.user_id) owner_email
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
   return (select jsonb_build_object('mode',s.login_mode,'interval',s.login_interval,'chatDays',s.chat_media_days,'gridCols',s.grid_cols,'gridColsMobile',s.grid_cols_mobile,
    'slides',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'position',md.position,'bytes',md.bytes,'createdAt',md.created_at) order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
  elsif p_action='admin_grid' then
   update public.cd_settings set grid_cols=least(6,greatest(2,coalesce((p_data->>'cols')::int,grid_cols))),grid_cols_mobile=least(2,greatest(1,coalesce((p_data->>'mobile')::int,grid_cols_mobile))) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'grid',jsonb_build_object('cols',p_data->>'cols','mobile',p_data->>'mobile'));
   return '{}';
  elsif p_action='admin_messages_cleanup' then
   -- Old messages between two people who have BOTH been inactive for at least N months (default 3).
   -- dry=true only counts. Attached files are then removed from B2 by the cleanup job.
   n=least(120,greatest(1,coalesce((p_data->>'months')::int,6)));radius=least(120,greatest(3,coalesce((p_data->>'inactiveMonths')::int,3)));
   select coalesce(array_agg(mm.id),'{}') into v_ids from public.cd_messages mm
    left join chich_private.accounts sa on sa.user_id=mm.sender_id left join chich_private.accounts ra on ra.user_id=mm.recipient_id
    where mm.created_at<now()-make_interval(months=>n)
     and coalesce(sa.last_seen_at,'-infinity'::timestamptz)<now()-make_interval(months=>radius)
     and coalesce(ra.last_seen_at,'-infinity'::timestamptz)<now()-make_interval(months=>radius);
   result=jsonb_build_object('messages',cardinality(v_ids),
    'conversations',(select count(distinct least(mm.sender_id::text,mm.recipient_id::text)||greatest(mm.sender_id::text,mm.recipient_id::text)) from public.cd_messages mm where mm.id=any(v_ids)),
    'media',(select count(*) from public.cd_messages mm where mm.id=any(v_ids) and mm.media_id is not null));
   if not coalesce((p_data->>'dry')::boolean,true) and cardinality(v_ids)>0 then
    update public.cd_media set status='deleting' where id in (select mm.media_id from public.cd_messages mm where mm.id=any(v_ids) and mm.media_id is not null);
    delete from public.cd_messages where id=any(v_ids);
    insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'messages_cleanup',result||jsonb_build_object('months',n,'inactiveMonths',radius));
   end if;
   return result;
  elsif p_action='admin_teasers_save_all' then
   -- Save the whole list in one go; order = position (1, 2, 3…). Rows without id are new; empty new rows are skipped.
   if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')>300 then raise exception 'Danh sách không hợp lệ.'; end if;
   if exists(select 1 from jsonb_array_elements(p_data->'items') x where length(trim(coalesce(x->>'body','')))>200 or (coalesce(x->>'id','')<>'' and length(trim(coalesce(x->>'body','')))=0)) then raise exception 'Mỗi câu thả thính cần 1–200 ký tự.'; end if;
   n=0;
   for result in select x from jsonb_array_elements(p_data->'items') x loop
    if length(trim(coalesce(result->>'body','')))=0 then continue; end if;
    n=n+1;
    if coalesce(result->>'id','')='' then
     insert into public.cd_teasers(body,active,position) values(trim(result->>'body'),coalesce((result->>'active')::boolean,true),n);
    else
     update public.cd_teasers set body=trim(result->>'body'),active=coalesce((result->>'active')::boolean,active),position=n where id=(result->>'id')::uuid;
    end if;
   end loop;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'teaser_save',jsonb_build_object('count',n));
   return jsonb_build_object('count',n);
  elsif p_action='admin_chat_retention' then
   update public.cd_settings set chat_media_days=least(3650,greatest(0,coalesce((p_data->>'days')::int,0))) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'chat_retention',jsonb_build_object('days',p_data->>'days'));
   return '{}';
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
  elsif p_action='admin_samples' then
   return jsonb_build_object('enabled',(select samples_enabled from public.cd_settings where id),
    'items',coalesce((select jsonb_agg(chich_private.sample_json(q) order by q.position,q.created_at) from public.cd_samples q),'[]'));
  elsif p_action='admin_samples_toggle' then
   update public.cd_settings set samples_enabled=coalesce((p_data->>'enabled')::boolean,false) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_toggle',jsonb_build_object('enabled',coalesce((p_data->>'enabled')::boolean,false)));
   return '{}';
  elsif p_action='admin_sample_save' then
   v_media=nullif(p_data->>'mediaId','')::uuid;
   if v_media is not null and not exists(select 1 from public.cd_media where id=v_media and purpose='sample' and status='ready') then raise exception 'Ảnh minh họa chưa tải xong.'; end if;
   if coalesce(length(trim(p_data->>'name')),0) not between 2 and 40 or coalesce(p_data->>'age','') !~ '^\d{1,3}$' or (p_data->>'age')::int not between 18 and 80 or length(coalesce(p_data->>'bio',''))>400 then raise exception 'Điền tên 2–40 ký tự, tuổi 18–80, giới thiệu tối đa 400 ký tự.'; end if;
   if coalesce(p_data->>'id','')='' then
    if (select count(*) from public.cd_samples)>=200 then raise exception 'Tối đa 200 hồ sơ minh họa.'; end if;
    insert into public.cd_samples(name,age,city,occupation,body_type,lifestyle,training,intent,bio,media_id,active,position)
    values(trim(p_data->>'name'),(p_data->>'age')::int,left(coalesce(p_data->>'city',''),80),left(coalesce(p_data->>'occupation',''),80),left(coalesce(p_data->>'bodyType',''),80),left(coalesce(p_data->>'lifestyle',''),80),left(coalesce(p_data->>'training',''),80),left(coalesce(p_data->>'intent',''),80),trim(coalesce(p_data->>'bio','')),v_media,coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'position')::int,(select coalesce(max(position),0)+1 from public.cd_samples)))
    returning id into target;
   else
    target=(p_data->>'id')::uuid;
    -- replacing the photo: the old file is removed from B2 by the cleanup job
    update public.cd_media set status='deleting' where purpose='sample' and v_media is not null and id=(select media_id from public.cd_samples where id=target) and id<>v_media;
    update public.cd_samples set name=trim(p_data->>'name'),age=(p_data->>'age')::int,city=left(coalesce(p_data->>'city',''),80),occupation=left(coalesce(p_data->>'occupation',''),80),body_type=left(coalesce(p_data->>'bodyType',''),80),lifestyle=left(coalesce(p_data->>'lifestyle',''),80),training=left(coalesce(p_data->>'training',''),80),intent=left(coalesce(p_data->>'intent',''),80),bio=trim(coalesce(p_data->>'bio','')),
     media_id=coalesce(v_media,media_id),active=coalesce((p_data->>'active')::boolean,active),position=coalesce((p_data->>'position')::int,position) where id=target;
    if not found then raise exception 'Không tìm thấy hồ sơ minh họa.'; end if;
   end if;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'sample_save',jsonb_build_object('sample',target));
   return (select chich_private.sample_json(q) from public.cd_samples q where q.id=target);
  elsif p_action='admin_samples_bulk' then
   if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Danh sách không hợp lệ.'; end if;
   if (select count(*) from public.cd_samples)+jsonb_array_length(p_data->'items')>200 then raise exception 'Tối đa 200 hồ sơ minh họa.'; end if;
   insert into public.cd_samples(name,age,city,occupation,body_type,lifestyle,training,intent,bio,position)
   select trim(x->>'name'),(x->>'age')::int,left(coalesce(x->>'city',''),80),left(coalesce(x->>'occupation',''),80),left(coalesce(x->>'bodyType',''),80),left(coalesce(x->>'lifestyle',''),80),left(coalesce(x->>'training',''),80),left(coalesce(x->>'intent',''),80),left(trim(coalesce(x->>'bio','')),400),
    (select coalesce(max(position),0) from public.cd_samples)+o::int
   from jsonb_array_elements(p_data->'items') with ordinality t(x,o);
   get diagnostics n=row_count;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_bulk',jsonb_build_object('count',n));
   return jsonb_build_object('count',n);
  elsif p_action='admin_sample_delete' then
   delete from public.cd_samples where id=(p_data->>'id')::uuid returning media_id into v_media;
   update public.cd_media set status='deleting' where id=v_media and purpose='sample';
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'sample_delete',jsonb_build_object('sample',p_data->>'id'));
   return '{}';
  elsif p_action='admin_samples_clear' then
   with d as (delete from public.cd_samples returning media_id) update public.cd_media set status='deleting' where purpose='sample' and id in (select media_id from d);
   update public.cd_media set status='deleting' where purpose='sample' and status='ready';
   update public.cd_settings set samples_enabled=false where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_clear','{}');
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
   if coalesce(p_data->>'ephemeral','0') not in ('0','60','300','600','3600') then raise exception 'Thời gian tự hủy không hợp lệ.';end if;
   if coalesce(p_data->>'ephemeral','0')<>'0' and v_media is null then raise exception 'Chỉ ảnh/video mới đặt được tự hủy.';end if;
   insert into public.cd_messages(sender_id,recipient_id,body,media_id,ephemeral_seconds) values(p_actor,target,coalesce(trim(p_data->>'text'),''),v_media,coalesce(p_data->>'ephemeral','0')::int);
  end if; return '{}';
 elsif p_action='inbox' then
  -- Unread incoming messages grouped by sender (polled by the app for badges and new-message notices).
  return jsonb_build_object('unread',coalesce((select sum(x.n) from (select count(*) n from public.cd_messages mm where mm.recipient_id=p_actor and mm.read_at is null and chich_private.can_view(p_actor,mm.sender_id) group by mm.sender_id) x),0),
   'threads',coalesce((select jsonb_agg(jsonb_build_object('id',t.sender_id,'name',q.name,'count',t.n,'lastAt',t.last_at,
     'preview',case when lm.kind='tease' then '🔥 '||left(lm.body,80) when lm.media_id is not null and lm.body='' then '📷 Ảnh/video' else left(lm.body,80) end) order by t.last_at desc)
    from (select mm.sender_id,count(*) n,max(mm.created_at) last_at from public.cd_messages mm where mm.recipient_id=p_actor and mm.read_at is null group by mm.sender_id) t
    join public.cd_profiles q on q.id=t.sender_id
    cross join lateral (select * from public.cd_messages l where l.sender_id=t.sender_id and l.recipient_id=p_actor order by l.created_at desc limit 1) lm
    where chich_private.can_view(p_actor,t.sender_id)),'[]'));
 elsif p_action='samples' then
  -- Illustration profiles for Discover: only on page 1, never for "nearby" searches (they have no location).
  if not (select samples_enabled from public.cd_settings where id) or coalesce((p_data->>'radius')::int,0)>0 or coalesce((p_data->>'offset')::int,0)>0 then return '[]'; end if;
  return coalesce((select jsonb_agg(chich_private.sample_json(q) order by q.position,q.created_at) from (select * from public.cd_samples q where q.active
   and (coalesce(p_data->>'city','all') in ('all','') or chich_private.search_key(q.city) like '%'||chich_private.search_key(left(p_data->>'city',80))||'%')
   and (coalesce(p_data->>'occupation','all')='all' or q.occupation=p_data->>'occupation')
   and (coalesce(p_data->>'bodyType','all')='all' or q.body_type=p_data->>'bodyType')
   and (coalesce(p_data->>'lifestyle','all')='all' or q.lifestyle=p_data->>'lifestyle')
   and (coalesce(p_data->>'training','all')='all' or q.training=p_data->>'training')
   and (coalesce(p_data->>'intent','all')='all' or q.intent=p_data->>'intent')
   and q.age between greatest(18,coalesce((p_data->>'minAge')::int,18)) and least(80,coalesce((p_data->>'maxAge')::int,80))
   and (coalesce(p_data->>'query','')='' or chich_private.search_key(q.name||' '||q.occupation||' '||q.bio) like '%'||chich_private.search_key(left(p_data->>'query',100))||'%')
   order by q.position,q.created_at limit 60) q),'[]');
 elsif p_action='teasers' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body) order by t.position,t.created_at) from public.cd_teasers t where t.active),'[]');
 elsif p_action='liked' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q join public.cd_likes l on l.target_id=q.id where l.user_id=p_actor and chich_private.can_view(p_actor,q.id)),'[]');
 elsif p_action='blocked' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name)) from public.cd_profiles q join public.cd_blocks b on b.target_id=q.id where b.user_id=p_actor),'[]');
 elsif p_action='contacts' then
  -- Conversations, newest first, with a one-line preview of the last message.
  return coalesce((select jsonb_agg(x.j order by x.last_at desc) from (
   select chich_private.profile_json(q)||jsonb_build_object('lastAt',lm.created_at,'lastMine',lm.sender_id=p_actor,
    'preview',case when lm.kind='tease' then '🔥 '||left(lm.body,80) when lm.media_id is not null and lm.body='' then '📷 Ảnh/video' when lm.ephemeral_seconds>0 and lm.body='' then '⏱ Ảnh/video tự hủy' else left(lm.body,80) end) j,lm.created_at last_at
   from public.cd_profiles q cross join lateral (select * from public.cd_messages mm where (mm.sender_id=p_actor and mm.recipient_id=q.id) or (mm.recipient_id=p_actor and mm.sender_id=q.id) order by mm.created_at desc limit 1) lm
   where q.id<>p_actor and chich_private.can_view(p_actor,q.id)) x),'[]');
 elsif p_action='messages' then
  target=(p_data->>'id')::uuid;
  if not chich_private.can_view(p_actor,target) then raise exception 'Cuộc trò chuyện không khả dụng.';end if;
  update public.cd_messages set read_at=now() where sender_id=target and recipient_id=p_actor and read_at is null;
  return coalesce((select jsonb_agg(chich_private.message_json(mm,p_actor,false) order by mm.created_at) from (select * from public.cd_messages
    where (sender_id=p_actor and recipient_id=target) or (sender_id=target and recipient_id=p_actor) order by created_at desc limit 100) mm),'[]');
 elsif p_action='open_ephemeral' then
  select * into v_msg from public.cd_messages where id=(p_data->>'id')::uuid and recipient_id=p_actor and ephemeral_seconds>0;
  if v_msg.id is null or chich_private.is_blocked(p_actor,v_msg.sender_id) then raise exception 'Không tìm thấy tin nhắn.'; end if;
  if v_msg.media_id is null or (v_msg.expires_at is not null and v_msg.expires_at<=now()) or (v_msg.viewed_at is null and v_msg.created_at<now()-interval '24 hours') then raise exception 'Ảnh/video đã tự hủy.'; end if;
  if v_msg.viewed_at is null then
   update public.cd_messages set viewed_at=now(),expires_at=now()+make_interval(secs=>ephemeral_seconds) where id=v_msg.id returning * into v_msg;
  end if;
  return chich_private.message_json(v_msg,p_actor,false);
 end if;
 raise exception 'Unknown action';
end $$;
revoke all on all functions in schema chich_private from public,anon,authenticated;
revoke all on function chich_private.user_exists(uuid),chich_private.auth_email(uuid),chich_private.auth_directory() from public,anon,authenticated;
grant execute on all functions in schema chich_private to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;
revoke all on function public.cd_feedback_submit(text,text) from public;
grant execute on function public.cd_feedback_submit(text,text) to anon,authenticated,service_role;

$cd_step$;
 else
  raise notice 'CHI.CH DAO.: đã có dữ liệu → nâng cấp lên v0.11, giữ dữ liệu';
  -- ===== upgrade-v0.6.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.6 — GIỮ NGUYÊN dữ liệu. Chạy 1 lần trong Supabase SQL Editor.
alter table public.cd_messages add column if not exists kind text not null default 'text';
alter table public.cd_messages drop constraint if exists cd_messages_kind_check;
alter table public.cd_messages add constraint cd_messages_kind_check check(kind in ('text','tease'));
create table if not exists public.cd_teasers (
 id uuid primary key default gen_random_uuid(),
 body text not null check(length(trim(body)) between 1 and 200),
 active boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
insert into public.cd_teasers(body,position) select v.body,v.position from (values ('Ảnh của anh làm em quên luôn mình định nói gì 🔥',1),
 ('Nhìn anh là thấy nóng hơn cả Sài Gòn trưa nắng 🔥',2),
 ('Tập ở đâu mà body chuẩn vậy anh? Chỉ em với 😏',3),
 ('Cuối tuần này anh rảnh đi cà phê không?',4),
 ('Cho em xin một nụ cười để làm quen nha 😉',5),
 ('Anh có tin vào tiếng sét ái tình không, hay để em lướt qua lần nữa?',6)) v(body,position) where not exists(select 1 from public.cd_teasers);
alter table public.cd_teasers enable row level security;
revoke all on public.cd_teasers from public,anon,authenticated;
grant select,insert,update,delete on public.cd_teasers to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
  -- ===== upgrade-v0.7.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.7 — GIỮ NGUYÊN dữ liệu. Cần đã chạy upgrade-v0.6.sql trước.
-- Chạy 1 lần trong Supabase SQL Editor (chạy lại cũng an toàn).
alter table public.cd_media drop constraint if exists cd_media_purpose_check;
alter table public.cd_media add constraint cd_media_purpose_check check(purpose in ('profile','hero','chat','slide','sample'));
alter table public.cd_settings add column if not exists login_mode text not null default 'slide';
alter table public.cd_settings add column if not exists login_interval integer not null default 6;
alter table public.cd_settings drop constraint if exists cd_settings_login_mode_check;
alter table public.cd_settings add constraint cd_settings_login_mode_check check(login_mode in ('single','slide'));
alter table public.cd_settings drop constraint if exists cd_settings_login_interval_check;
alter table public.cd_settings add constraint cd_settings_login_interval_check check(login_interval between 3 and 30);
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
  -- ===== upgrade-v0.8.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.8 — GIỮ NGUYÊN dữ liệu. Cần đã chạy upgrade-v0.6 và v0.7 trước.
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
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
  -- ===== upgrade-v0.9.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.9 (ảnh thu nhỏ) — GIỮ NGUYÊN dữ liệu. Cần đã chạy v0.6 → v0.8.
alter table public.cd_media add column if not exists thumb_key text not null default '';
alter table public.cd_media add column if not exists thumb_mime text not null default '';
alter table public.cd_media add column if not exists thumb_bytes integer not null default 0;
alter table public.cd_media add column if not exists thumb_ready boolean not null default false;
alter table public.cd_media drop constraint if exists cd_media_thumb_mime_check;
alter table public.cd_media add constraint cd_media_thumb_mime_check check(thumb_mime in ('','image/jpeg','image/webp'));
alter table public.cd_media drop constraint if exists cd_media_thumb_bytes_check;
alter table public.cd_media add constraint cd_media_thumb_bytes_check check(thumb_bytes between 0 and 307200);
create or replace function chich_private.profile_json(p public.cd_profiles) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',p.id,'name',p.name,'age',p.age,'city',p.city,'occupation',p.occupation,
 'bodyType',p.body_type,'lifestyle',p.lifestyle,'training',p.training,'intent',p.intent,'bio',p.bio,'visible',p.visible,
 'complete',chich_private.complete(p),'photos',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'caption',m.caption,'position',m.position,'thumb',m.thumb_ready) order by m.position,m.created_at)
 from public.cd_media m where m.user_id=p.id and m.purpose='profile' and m.status='ready'),'[]'::jsonb))
$$;
revoke all on all functions in schema chich_private from public,anon,authenticated;
revoke all on function chich_private.user_exists(uuid),chich_private.auth_email(uuid),chich_private.auth_directory() from public,anon,authenticated;
grant execute on all functions in schema chich_private to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
  -- ===== upgrade-v0.10.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.10 (ảnh/video tự hủy, dọn file mồ côi, hạn lưu ảnh chat) — GIỮ NGUYÊN dữ liệu.
-- Cần đã chạy v0.6 → v0.9.
alter table public.cd_settings add column if not exists chat_media_days integer not null default 0;
alter table public.cd_settings drop constraint if exists cd_settings_chat_media_days_check;
alter table public.cd_settings add constraint cd_settings_chat_media_days_check check(chat_media_days between 0 and 3650);
alter table public.cd_messages add column if not exists ephemeral_seconds integer not null default 0;
alter table public.cd_messages add column if not exists viewed_at timestamptz;
alter table public.cd_messages add column if not exists expires_at timestamptz;
alter table public.cd_messages drop constraint if exists cd_messages_ephemeral_seconds_check;
alter table public.cd_messages add constraint cd_messages_ephemeral_seconds_check check(ephemeral_seconds in (0,60,300,600,3600));
create table if not exists chich_private.storage_trash (id uuid primary key default gen_random_uuid(), object_key text not null, thumb_key text not null default '', created_at timestamptz not null default now());
alter table chich_private.storage_trash enable row level security;
grant select,insert,update,delete on chich_private.storage_trash to service_role;
create or replace function chich_private.media_due() returns setof public.cd_media
language sql stable security invoker set search_path='' as $$
 select md.* from public.cd_media md where
  (md.status in ('pending','uploading') and md.created_at<now()-interval '1 hour')
  or md.status='deleting'
  or (md.purpose='chat' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_messages mm where mm.media_id=md.id))
  or (md.purpose='chat' and md.status='ready' and exists(select 1 from public.cd_messages mm where mm.media_id=md.id and mm.ephemeral_seconds>0
       and ((mm.expires_at is not null and mm.expires_at<now()) or (mm.viewed_at is null and mm.created_at<now()-interval '24 hours'))))
  or (md.purpose='chat' and md.status='ready' and (select chat_media_days from public.cd_settings where id)>0
       and md.created_at<now()-make_interval(days=>(select chat_media_days from public.cd_settings where id)))
$$;
-- Remember B2 keys when media rows disappear outside cleanup_done (account deletion cascades etc.).
create or replace function chich_private.media_trash() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if coalesce(current_setting('chich.cleanup',true),'')<>'1' and old.status in ('ready','uploading','deleting') then
  insert into chich_private.storage_trash(object_key,thumb_key) values(old.object_key,old.thumb_key);
 end if;
 return old;
end $$;

drop trigger if exists cd_media_trash on public.cd_media;
create trigger cd_media_trash after delete on public.cd_media for each row execute function chich_private.media_trash();
create or replace function chich_private.message_json(mm public.cd_messages, viewer uuid, as_admin boolean) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',mm.id,'sender_id',mm.sender_id,'recipient_id',mm.recipient_id,'body',mm.body,'kind',mm.kind,'created_at',mm.created_at,
  'ephemeral',mm.ephemeral_seconds,'viewedAt',mm.viewed_at,'expiresAt',mm.expires_at,
  'expired',mm.ephemeral_seconds>0 and (mm.media_id is null or (mm.expires_at is not null and mm.expires_at<=now()) or (mm.viewed_at is null and mm.created_at<now()-interval '24 hours')),
  'media',case when md.id is null then '[]'::jsonb
   when mm.ephemeral_seconds>0 and not as_admin and not coalesce(mm.recipient_id=viewer and mm.expires_at>now(),false) then '[]'::jsonb
   else jsonb_build_array(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes,'thumb',md.thumb_ready and mm.ephemeral_seconds=0)) end)
 from (select 1) one left join public.cd_media md on md.id=mm.media_id and md.status='ready'
$$;
revoke all on all functions in schema chich_private from public,anon,authenticated;
grant execute on all functions in schema chich_private to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
  -- ===== upgrade-v0.11.sql =====
  execute $cd_step$
-- CHI.CH DAO. nâng cấp database lên v0.11 — GIỮ NGUYÊN dữ liệu. Chạy lại nhiều lần vẫn an toàn.
-- v0.11: hồ sơ minh họa (luôn gắn nhãn, không nhắn tin/thích được), admin bật/tắt; tin nhắn mới tự hiện + số tin chưa đọc.
alter table public.cd_media drop constraint if exists cd_media_purpose_check;
alter table public.cd_media add constraint cd_media_purpose_check check(purpose in ('profile','hero','chat','slide','sample'));
alter table public.cd_settings add column if not exists samples_enabled boolean not null default false;
alter table public.cd_settings add column if not exists grid_cols integer not null default 3 check(grid_cols between 2 and 6);
alter table public.cd_settings add column if not exists grid_cols_mobile integer not null default 2 check(grid_cols_mobile between 1 and 2);
alter table public.cd_messages add column if not exists read_at timestamptz;
-- existing messages count as read, so nobody gets a flood of old notices after the upgrade
update public.cd_messages set read_at=created_at where read_at is null and created_at<now()-interval '1 day';
create index if not exists cd_message_unread on public.cd_messages(recipient_id,sender_id) where read_at is null;
create table if not exists public.cd_samples (
 id uuid primary key default gen_random_uuid(),
 name text not null check(length(trim(name)) between 2 and 40),
 age integer not null check(age between 18 and 80),
 city text not null default '' check(length(city)<=80),
 occupation text not null default '' check(length(occupation)<=80),
 body_type text not null default '' check(length(body_type)<=80),
 lifestyle text not null default '' check(length(lifestyle)<=80),
 training text not null default '' check(length(training)<=80),
 intent text not null default '' check(length(intent)<=80),
 bio text not null default '' check(length(bio)<=400),
 media_id uuid references public.cd_media(id) on delete set null,
 active boolean not null default true,
 position integer not null default 0,
 created_at timestamptz not null default now()
);
create index if not exists cd_samples_order on public.cd_samples(position,created_at);
alter table public.cd_samples enable row level security;
revoke all on public.cd_samples from public,anon,authenticated;
grant select,insert,update,delete on public.cd_samples to service_role;
create or replace function chich_private.sample_json(s public.cd_samples) returns jsonb
language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',s.id,'sample',true,'name',s.name,'age',s.age,'city',s.city,'occupation',s.occupation,
 'bodyType',s.body_type,'lifestyle',s.lifestyle,'training',s.training,'intent',s.intent,'bio',s.bio,'active',s.active,'position',s.position,
 'photos',coalesce((select jsonb_build_array(jsonb_build_object('id',m.id,'kind','image','caption','','thumb',m.thumb_ready)) from public.cd_media m where m.id=s.media_id and m.status='ready'),'[]'::jsonb))
$$;
create or replace function chich_private.media_due() returns setof public.cd_media
language sql stable security invoker set search_path='' as $$
 select md.* from public.cd_media md where
  (md.status in ('pending','uploading') and md.created_at<now()-interval '1 hour')
  or md.status='deleting'
  or (md.purpose='chat' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_messages mm where mm.media_id=md.id))
  or (md.purpose='chat' and md.status='ready' and exists(select 1 from public.cd_messages mm where mm.media_id=md.id and mm.ephemeral_seconds>0
       and ((mm.expires_at is not null and mm.expires_at<now()) or (mm.viewed_at is null and mm.created_at<now()-interval '24 hours'))))
  or (md.purpose='chat' and md.status='ready' and (select chat_media_days from public.cd_settings where id)>0
       and md.created_at<now()-make_interval(days=>(select chat_media_days from public.cd_settings where id)))
  or (md.purpose='sample' and md.status='ready' and md.created_at<now()-interval '24 hours' and not exists(select 1 from public.cd_samples s where s.media_id=md.id))
$$;
create or replace function public.cd_api(p_actor uuid, p_action text, p_data jsonb default '{}') returns jsonb
language plpgsql security invoker set search_path='' as $$
declare p public.cd_profiles; m public.cd_media; v_msg public.cd_messages; result jsonb; target uuid; v_media uuid; v_ids uuid[];
 admin boolean; n integer; k text; v_purpose text; loc chich_private.locations; radius integer;
begin
 if current_user<>'service_role' then raise exception 'Forbidden'; end if;
 -- Auth-independent public hero; returns only the selected, ready hero.
 if p_action='hero' then
  return (select jsonb_build_object('mediaId',s.hero_media_id,'alt',s.hero_alt,'theme',s.theme,'gridCols',s.grid_cols,'gridColsMobile',s.grid_cols_mobile,'loginMode',s.login_mode,'loginInterval',s.login_interval,
   'slides',coalesce((select jsonb_agg(md.id order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
 end if;
 if p_action='cleanup_list' then
  return coalesce((select jsonb_agg(to_jsonb(x)) from (
   (select id,object_key,thumb_key from chich_private.media_due() limit 100)
   union all (select id,object_key,thumb_key from chich_private.storage_trash order by created_at limit 100)) x),'[]');
 end if;
 if p_action='cleanup_expired' then
  delete from chich_private.locations where updated_at<now()-interval '24 hours';
  delete from chich_private.rate_limits where window_start<now()-interval '2 days';
  delete from chich_private.activity where created_at<now()-interval '365 days';
  return '{}';
 end if;
 if p_action='cleanup_done' then
  perform set_config('chich.cleanup','1',true);
  delete from public.cd_media where id=(p_data->>'id')::uuid and id in (select d.id from chich_private.media_due() d);
  delete from chich_private.storage_trash where id=(p_data->>'id')::uuid;
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
  if v_purpose in ('hero','slide','sample') and not admin then raise exception 'Forbidden'; end if;
  if v_purpose in ('hero','slide','sample') and k<>'image' then raise exception 'Ảnh trang chủ/đăng nhập/minh họa phải là ảnh.'; end if;
  if k is null or k not in ('image','video') or v_purpose not in ('profile','hero','chat','slide','sample') or coalesce(p_data->>'bytes','') !~ '^\d{1,9}$' then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if (p_data->>'bytes')::int<1 or (k='image' and ((p_data->>'bytes')::int>8388608 or coalesce(p_data->>'mime','') not in ('image/jpeg','image/png','image/webp'))) or (k='video' and ((p_data->>'bytes')::int>20971520 or coalesce(p_data->>'mime','') not in ('video/mp4','video/webm'))) then raise exception 'Định dạng hoặc dung lượng không hợp lệ.'; end if;
  if v_purpose='chat' then
   n=0; -- chat attachments: no album cap; limited by size + upload_chat throttle; unsent files are purged after 24h
  else
   select count(*) into n from public.cd_media where user_id=p_actor and kind=k and cd_media.purpose=v_purpose and status<>'deleting';
   if n>=(case when v_purpose='hero' then 3 when v_purpose='slide' then 12 when v_purpose='sample' then 200 when k='image' then 10 else 2 end) then raise exception 'Đã đạt giới hạn ảnh hoặc video.'; end if;
  end if;
  v_media=gen_random_uuid();
  insert into public.cd_media(id,user_id,kind,purpose,mime,bytes,object_key,position) values(v_media,p_actor,k,v_purpose,p_data->>'mime',(p_data->>'bytes')::int,
   -- B2 layout: site/hero/<id>.<ext> | users/<uid>/images|videos/<id>.<ext> | users/<uid>/chat/<id>.<ext>
   case when v_purpose='hero' then 'site/hero/' when v_purpose='slide' then 'site/login/' when v_purpose='sample' then 'site/samples/' when v_purpose='chat' then 'users/'||p_actor::text||'/chat/' else 'users/'||p_actor::text||case when k='image' then '/images/' else '/videos/' end end||v_media::text||'.'||case p_data->>'mime' when 'image/jpeg' then 'jpg' when 'image/png' then 'png' when 'image/webp' then 'webp' when 'video/mp4' then 'mp4' else 'webm' end,n) returning * into m;
  if k='image' and coalesce(p_data->>'thumbBytes','') ~ '^\d{1,6}$' and (p_data->>'thumbBytes')::int between 1 and 307200 and coalesce(p_data->>'thumbMime','') in ('image/jpeg','image/webp') then
   update public.cd_media set thumb_bytes=(p_data->>'thumbBytes')::int,thumb_mime=p_data->>'thumbMime',
    thumb_key=regexp_replace(object_key,'\.[a-z0-9]+$','')||'_t.'||case when p_data->>'thumbMime'='image/webp' then 'webp' else 'jpg' end
   where id=v_media returning * into m;
  end if;
  return to_jsonb(m);
 elsif p_action='claim_media' then
  update public.cd_media set status='uploading' where id=(p_data->>'id')::uuid and user_id=p_actor and status='pending' and created_at>now()-interval '15 minutes' returning * into m;
  if m.id is null then raise exception 'Lượt tải lên hết hạn hoặc đã sử dụng.'; end if; return to_jsonb(m);
 elsif p_action='claim_thumb' then
  select * into m from public.cd_media where id=(p_data->>'id')::uuid and user_id=p_actor and status='ready' and thumb_key<>'' and not thumb_ready and created_at>now()-interval '30 minutes';
  if m.id is null then raise exception 'Ảnh thu nhỏ không hợp lệ.'; end if; return to_jsonb(m);
 elsif p_action='finish_thumb' then
  update public.cd_media set thumb_ready=true where id=(p_data->>'id')::uuid and user_id=p_actor and thumb_key<>'' returning * into m;
  if m.id is null then raise exception 'Ảnh thu nhỏ không hợp lệ.'; end if; return jsonb_build_object('id',m.id);
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
     m.purpose not in ('profile','chat','sample')
     -- illustration photo: any signed-in user, only while the feature is on and the sample is active
     or (m.purpose='sample' and not ((select samples_enabled from public.cd_settings where id) and exists(select 1 from public.cd_samples s where s.media_id=m.id and s.active)))
     or (m.purpose='profile' and not chich_private.can_view(p_actor,m.user_id))
     -- chat attachment: only the sender, or the recipient of the message carrying it (and not blocked)
     or (m.purpose='chat' and not exists(select 1 from public.cd_messages mm where mm.media_id=m.id
          and ((mm.ephemeral_seconds=0 and (mm.sender_id=p_actor or (mm.recipient_id=p_actor and not chich_private.is_blocked(p_actor,mm.sender_id))))
            or (mm.ephemeral_seconds>0 and mm.recipient_id=p_actor and coalesce(mm.expires_at>now(),false) and not chich_private.is_blocked(p_actor,mm.sender_id)))))
  )) then raise exception 'Không tìm thấy ảnh/video.'; end if;
  return to_jsonb(m)||case when exists(select 1 from public.cd_messages mm where mm.media_id=m.id and mm.ephemeral_seconds>0) then jsonb_build_object('cache_control','no-store') else '{}'::jsonb end;

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
    'media',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'kind',md.kind,'mime',md.mime,'bytes',md.bytes,'caption',md.caption,'status',md.status,'purpose',md.purpose,'createdAt',md.created_at,'thumb',md.thumb_ready) order by md.created_at desc) from public.cd_media md where md.user_id=target),'[]'),
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
     select least(sender_id,recipient_id) a,greatest(sender_id,recipient_id) b,count(*) n,max(created_at) last_at,left((array_agg(case when cm.kind='tease' then '🔥 '||cm.body when cm.ephemeral_seconds>0 and cm.body='' then '[Ảnh/video tự hủy]' when cm.body='' and cm.media_id is not null then '[Ảnh/video]' else cm.body end order by cm.created_at desc))[1],140) preview
     from public.cd_messages cm where target is null or target in (cm.sender_id,cm.recipient_id) group by 1,2) c
    join public.cd_profiles pa on pa.id=c.a join public.cd_profiles pb on pb.id=c.b
    order by c.last_at desc limit 50 offset least(5000,greatest(0,coalesce((p_data->>'offset')::int,0)))) x),'[]');
  elsif p_action='admin_messages' then
   target=(p_data->>'a')::uuid;v_media=(p_data->>'b')::uuid;
   insert into chich_private.admin_audit(admin_id,action,target_id,detail) values(p_actor,'view_chat',target,jsonb_build_object('with',v_media));
   return coalesce((select jsonb_agg(chich_private.message_json(mm,p_actor,true) order by mm.created_at) from (select * from public.cd_messages
    where (sender_id=target and recipient_id=v_media) or (sender_id=v_media and recipient_id=target) order by created_at desc limit 1000) mm),'[]');
  elsif p_action='admin_media' then
   return jsonb_build_object('media',coalesce((select jsonb_agg(to_jsonb(x) order by x.created_at desc) from (
    select md.id,md.user_id,md.kind,md.mime,md.bytes,md.caption,md.status,md.purpose,md.created_at,md.thumb_ready thumb,q.name owner_name,chich_private.auth_email(md.user_id) owner_email
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
   return (select jsonb_build_object('mode',s.login_mode,'interval',s.login_interval,'chatDays',s.chat_media_days,'gridCols',s.grid_cols,'gridColsMobile',s.grid_cols_mobile,
    'slides',coalesce((select jsonb_agg(jsonb_build_object('id',md.id,'position',md.position,'bytes',md.bytes,'createdAt',md.created_at) order by md.position,md.created_at) from public.cd_media md where md.purpose='slide' and md.status='ready'),'[]'::jsonb)) from public.cd_settings s where id);
  elsif p_action='admin_grid' then
   update public.cd_settings set grid_cols=least(6,greatest(2,coalesce((p_data->>'cols')::int,grid_cols))),grid_cols_mobile=least(2,greatest(1,coalesce((p_data->>'mobile')::int,grid_cols_mobile))) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'grid',jsonb_build_object('cols',p_data->>'cols','mobile',p_data->>'mobile'));
   return '{}';
  elsif p_action='admin_messages_cleanup' then
   -- Old messages between two people who have BOTH been inactive for at least N months (default 3).
   -- dry=true only counts. Attached files are then removed from B2 by the cleanup job.
   n=least(120,greatest(1,coalesce((p_data->>'months')::int,6)));radius=least(120,greatest(3,coalesce((p_data->>'inactiveMonths')::int,3)));
   select coalesce(array_agg(mm.id),'{}') into v_ids from public.cd_messages mm
    left join chich_private.accounts sa on sa.user_id=mm.sender_id left join chich_private.accounts ra on ra.user_id=mm.recipient_id
    where mm.created_at<now()-make_interval(months=>n)
     and coalesce(sa.last_seen_at,'-infinity'::timestamptz)<now()-make_interval(months=>radius)
     and coalesce(ra.last_seen_at,'-infinity'::timestamptz)<now()-make_interval(months=>radius);
   result=jsonb_build_object('messages',cardinality(v_ids),
    'conversations',(select count(distinct least(mm.sender_id::text,mm.recipient_id::text)||greatest(mm.sender_id::text,mm.recipient_id::text)) from public.cd_messages mm where mm.id=any(v_ids)),
    'media',(select count(*) from public.cd_messages mm where mm.id=any(v_ids) and mm.media_id is not null));
   if not coalesce((p_data->>'dry')::boolean,true) and cardinality(v_ids)>0 then
    update public.cd_media set status='deleting' where id in (select mm.media_id from public.cd_messages mm where mm.id=any(v_ids) and mm.media_id is not null);
    delete from public.cd_messages where id=any(v_ids);
    insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'messages_cleanup',result||jsonb_build_object('months',n,'inactiveMonths',radius));
   end if;
   return result;
  elsif p_action='admin_teasers_save_all' then
   -- Save the whole list in one go; order = position (1, 2, 3…). Rows without id are new; empty new rows are skipped.
   if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items')>300 then raise exception 'Danh sách không hợp lệ.'; end if;
   if exists(select 1 from jsonb_array_elements(p_data->'items') x where length(trim(coalesce(x->>'body','')))>200 or (coalesce(x->>'id','')<>'' and length(trim(coalesce(x->>'body','')))=0)) then raise exception 'Mỗi câu thả thính cần 1–200 ký tự.'; end if;
   n=0;
   for result in select x from jsonb_array_elements(p_data->'items') x loop
    if length(trim(coalesce(result->>'body','')))=0 then continue; end if;
    n=n+1;
    if coalesce(result->>'id','')='' then
     insert into public.cd_teasers(body,active,position) values(trim(result->>'body'),coalesce((result->>'active')::boolean,true),n);
    else
     update public.cd_teasers set body=trim(result->>'body'),active=coalesce((result->>'active')::boolean,active),position=n where id=(result->>'id')::uuid;
    end if;
   end loop;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'teaser_save',jsonb_build_object('count',n));
   return jsonb_build_object('count',n);
  elsif p_action='admin_chat_retention' then
   update public.cd_settings set chat_media_days=least(3650,greatest(0,coalesce((p_data->>'days')::int,0))) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'chat_retention',jsonb_build_object('days',p_data->>'days'));
   return '{}';
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
  elsif p_action='admin_samples' then
   return jsonb_build_object('enabled',(select samples_enabled from public.cd_settings where id),
    'items',coalesce((select jsonb_agg(chich_private.sample_json(q) order by q.position,q.created_at) from public.cd_samples q),'[]'));
  elsif p_action='admin_samples_toggle' then
   update public.cd_settings set samples_enabled=coalesce((p_data->>'enabled')::boolean,false) where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_toggle',jsonb_build_object('enabled',coalesce((p_data->>'enabled')::boolean,false)));
   return '{}';
  elsif p_action='admin_sample_save' then
   v_media=nullif(p_data->>'mediaId','')::uuid;
   if v_media is not null and not exists(select 1 from public.cd_media where id=v_media and purpose='sample' and status='ready') then raise exception 'Ảnh minh họa chưa tải xong.'; end if;
   if coalesce(length(trim(p_data->>'name')),0) not between 2 and 40 or coalesce(p_data->>'age','') !~ '^\d{1,3}$' or (p_data->>'age')::int not between 18 and 80 or length(coalesce(p_data->>'bio',''))>400 then raise exception 'Điền tên 2–40 ký tự, tuổi 18–80, giới thiệu tối đa 400 ký tự.'; end if;
   if coalesce(p_data->>'id','')='' then
    if (select count(*) from public.cd_samples)>=200 then raise exception 'Tối đa 200 hồ sơ minh họa.'; end if;
    insert into public.cd_samples(name,age,city,occupation,body_type,lifestyle,training,intent,bio,media_id,active,position)
    values(trim(p_data->>'name'),(p_data->>'age')::int,left(coalesce(p_data->>'city',''),80),left(coalesce(p_data->>'occupation',''),80),left(coalesce(p_data->>'bodyType',''),80),left(coalesce(p_data->>'lifestyle',''),80),left(coalesce(p_data->>'training',''),80),left(coalesce(p_data->>'intent',''),80),trim(coalesce(p_data->>'bio','')),v_media,coalesce((p_data->>'active')::boolean,true),coalesce((p_data->>'position')::int,(select coalesce(max(position),0)+1 from public.cd_samples)))
    returning id into target;
   else
    target=(p_data->>'id')::uuid;
    -- replacing the photo: the old file is removed from B2 by the cleanup job
    update public.cd_media set status='deleting' where purpose='sample' and v_media is not null and id=(select media_id from public.cd_samples where id=target) and id<>v_media;
    update public.cd_samples set name=trim(p_data->>'name'),age=(p_data->>'age')::int,city=left(coalesce(p_data->>'city',''),80),occupation=left(coalesce(p_data->>'occupation',''),80),body_type=left(coalesce(p_data->>'bodyType',''),80),lifestyle=left(coalesce(p_data->>'lifestyle',''),80),training=left(coalesce(p_data->>'training',''),80),intent=left(coalesce(p_data->>'intent',''),80),bio=trim(coalesce(p_data->>'bio','')),
     media_id=coalesce(v_media,media_id),active=coalesce((p_data->>'active')::boolean,active),position=coalesce((p_data->>'position')::int,position) where id=target;
    if not found then raise exception 'Không tìm thấy hồ sơ minh họa.'; end if;
   end if;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'sample_save',jsonb_build_object('sample',target));
   return (select chich_private.sample_json(q) from public.cd_samples q where q.id=target);
  elsif p_action='admin_samples_bulk' then
   if jsonb_typeof(p_data->'items')<>'array' or jsonb_array_length(p_data->'items') not between 1 and 100 then raise exception 'Danh sách không hợp lệ.'; end if;
   if (select count(*) from public.cd_samples)+jsonb_array_length(p_data->'items')>200 then raise exception 'Tối đa 200 hồ sơ minh họa.'; end if;
   insert into public.cd_samples(name,age,city,occupation,body_type,lifestyle,training,intent,bio,position)
   select trim(x->>'name'),(x->>'age')::int,left(coalesce(x->>'city',''),80),left(coalesce(x->>'occupation',''),80),left(coalesce(x->>'bodyType',''),80),left(coalesce(x->>'lifestyle',''),80),left(coalesce(x->>'training',''),80),left(coalesce(x->>'intent',''),80),left(trim(coalesce(x->>'bio','')),400),
    (select coalesce(max(position),0) from public.cd_samples)+o::int
   from jsonb_array_elements(p_data->'items') with ordinality t(x,o);
   get diagnostics n=row_count;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_bulk',jsonb_build_object('count',n));
   return jsonb_build_object('count',n);
  elsif p_action='admin_sample_delete' then
   delete from public.cd_samples where id=(p_data->>'id')::uuid returning media_id into v_media;
   update public.cd_media set status='deleting' where id=v_media and purpose='sample';
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'sample_delete',jsonb_build_object('sample',p_data->>'id'));
   return '{}';
  elsif p_action='admin_samples_clear' then
   with d as (delete from public.cd_samples returning media_id) update public.cd_media set status='deleting' where purpose='sample' and id in (select media_id from d);
   update public.cd_media set status='deleting' where purpose='sample' and status='ready';
   update public.cd_settings set samples_enabled=false where id;
   insert into chich_private.admin_audit(admin_id,action,detail) values(p_actor,'samples_clear','{}');
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
   if coalesce(p_data->>'ephemeral','0') not in ('0','60','300','600','3600') then raise exception 'Thời gian tự hủy không hợp lệ.';end if;
   if coalesce(p_data->>'ephemeral','0')<>'0' and v_media is null then raise exception 'Chỉ ảnh/video mới đặt được tự hủy.';end if;
   insert into public.cd_messages(sender_id,recipient_id,body,media_id,ephemeral_seconds) values(p_actor,target,coalesce(trim(p_data->>'text'),''),v_media,coalesce(p_data->>'ephemeral','0')::int);
  end if; return '{}';
 elsif p_action='inbox' then
  -- Unread incoming messages grouped by sender (polled by the app for badges and new-message notices).
  return jsonb_build_object('unread',coalesce((select sum(x.n) from (select count(*) n from public.cd_messages mm where mm.recipient_id=p_actor and mm.read_at is null and chich_private.can_view(p_actor,mm.sender_id) group by mm.sender_id) x),0),
   'threads',coalesce((select jsonb_agg(jsonb_build_object('id',t.sender_id,'name',q.name,'count',t.n,'lastAt',t.last_at,
     'preview',case when lm.kind='tease' then '🔥 '||left(lm.body,80) when lm.media_id is not null and lm.body='' then '📷 Ảnh/video' else left(lm.body,80) end) order by t.last_at desc)
    from (select mm.sender_id,count(*) n,max(mm.created_at) last_at from public.cd_messages mm where mm.recipient_id=p_actor and mm.read_at is null group by mm.sender_id) t
    join public.cd_profiles q on q.id=t.sender_id
    cross join lateral (select * from public.cd_messages l where l.sender_id=t.sender_id and l.recipient_id=p_actor order by l.created_at desc limit 1) lm
    where chich_private.can_view(p_actor,t.sender_id)),'[]'));
 elsif p_action='samples' then
  -- Illustration profiles for Discover: only on page 1, never for "nearby" searches (they have no location).
  if not (select samples_enabled from public.cd_settings where id) or coalesce((p_data->>'radius')::int,0)>0 or coalesce((p_data->>'offset')::int,0)>0 then return '[]'; end if;
  return coalesce((select jsonb_agg(chich_private.sample_json(q) order by q.position,q.created_at) from (select * from public.cd_samples q where q.active
   and (coalesce(p_data->>'city','all') in ('all','') or chich_private.search_key(q.city) like '%'||chich_private.search_key(left(p_data->>'city',80))||'%')
   and (coalesce(p_data->>'occupation','all')='all' or q.occupation=p_data->>'occupation')
   and (coalesce(p_data->>'bodyType','all')='all' or q.body_type=p_data->>'bodyType')
   and (coalesce(p_data->>'lifestyle','all')='all' or q.lifestyle=p_data->>'lifestyle')
   and (coalesce(p_data->>'training','all')='all' or q.training=p_data->>'training')
   and (coalesce(p_data->>'intent','all')='all' or q.intent=p_data->>'intent')
   and q.age between greatest(18,coalesce((p_data->>'minAge')::int,18)) and least(80,coalesce((p_data->>'maxAge')::int,80))
   and (coalesce(p_data->>'query','')='' or chich_private.search_key(q.name||' '||q.occupation||' '||q.bio) like '%'||chich_private.search_key(left(p_data->>'query',100))||'%')
   order by q.position,q.created_at limit 60) q),'[]');
 elsif p_action='teasers' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'body',t.body) order by t.position,t.created_at) from public.cd_teasers t where t.active),'[]');
 elsif p_action='liked' then
  return coalesce((select jsonb_agg(chich_private.profile_json(q)) from public.cd_profiles q join public.cd_likes l on l.target_id=q.id where l.user_id=p_actor and chich_private.can_view(p_actor,q.id)),'[]');
 elsif p_action='blocked' then
  return coalesce((select jsonb_agg(jsonb_build_object('id',q.id,'name',q.name)) from public.cd_profiles q join public.cd_blocks b on b.target_id=q.id where b.user_id=p_actor),'[]');
 elsif p_action='contacts' then
  -- Conversations, newest first, with a one-line preview of the last message.
  return coalesce((select jsonb_agg(x.j order by x.last_at desc) from (
   select chich_private.profile_json(q)||jsonb_build_object('lastAt',lm.created_at,'lastMine',lm.sender_id=p_actor,
    'preview',case when lm.kind='tease' then '🔥 '||left(lm.body,80) when lm.media_id is not null and lm.body='' then '📷 Ảnh/video' when lm.ephemeral_seconds>0 and lm.body='' then '⏱ Ảnh/video tự hủy' else left(lm.body,80) end) j,lm.created_at last_at
   from public.cd_profiles q cross join lateral (select * from public.cd_messages mm where (mm.sender_id=p_actor and mm.recipient_id=q.id) or (mm.recipient_id=p_actor and mm.sender_id=q.id) order by mm.created_at desc limit 1) lm
   where q.id<>p_actor and chich_private.can_view(p_actor,q.id)) x),'[]');
 elsif p_action='messages' then
  target=(p_data->>'id')::uuid;
  if not chich_private.can_view(p_actor,target) then raise exception 'Cuộc trò chuyện không khả dụng.';end if;
  update public.cd_messages set read_at=now() where sender_id=target and recipient_id=p_actor and read_at is null;
  return coalesce((select jsonb_agg(chich_private.message_json(mm,p_actor,false) order by mm.created_at) from (select * from public.cd_messages
    where (sender_id=p_actor and recipient_id=target) or (sender_id=target and recipient_id=p_actor) order by created_at desc limit 100) mm),'[]');
 elsif p_action='open_ephemeral' then
  select * into v_msg from public.cd_messages where id=(p_data->>'id')::uuid and recipient_id=p_actor and ephemeral_seconds>0;
  if v_msg.id is null or chich_private.is_blocked(p_actor,v_msg.sender_id) then raise exception 'Không tìm thấy tin nhắn.'; end if;
  if v_msg.media_id is null or (v_msg.expires_at is not null and v_msg.expires_at<=now()) or (v_msg.viewed_at is null and v_msg.created_at<now()-interval '24 hours') then raise exception 'Ảnh/video đã tự hủy.'; end if;
  if v_msg.viewed_at is null then
   update public.cd_messages set viewed_at=now(),expires_at=now()+make_interval(secs=>ephemeral_seconds) where id=v_msg.id returning * into v_msg;
  end if;
  return chich_private.message_json(v_msg,p_actor,false);
 end if;
 raise exception 'Unknown action';
end $$;
revoke all on all functions in schema chich_private from public,anon,authenticated;
grant execute on all functions in schema chich_private to service_role;
revoke all on function public.cd_api(uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.cd_api(uuid,text,jsonb) to service_role;

$cd_step$;
 end if;
end
$cd_main$;
