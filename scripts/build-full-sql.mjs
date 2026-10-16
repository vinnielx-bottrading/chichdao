// Gộp schema.sql + upgrade-v0.6…v0.10 thành 1 file chạy 1 lần: supabase/chichdao-full.sql
import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('../supabase/',import.meta.url);
const body=async f=>{const s=await readFile(new URL(f,dir),'utf8');
 const lines=s.split('\n');const out=lines.filter(l=>!/^(begin|commit);\s*$/i.test(l));
 const t=out.join('\n');if(t.includes('$cd_step$'))throw new Error('tag clash '+f);return t;};
const steps=['upgrade-v0.6.sql','upgrade-v0.7.sql','upgrade-v0.8.sql','upgrade-v0.9.sql','upgrade-v0.10.sql'];
let sql=`-- CHI.CH DAO. — FILE SQL DUY NHẤT (v0.10). Dán toàn bộ vào Supabase → SQL Editor → Run, 1 lần là đủ.
-- • Database trống            → cài mới đầy đủ v0.10.
-- • Đã có app (v0.5 → v0.10)  → nâng cấp lên v0.10, GIỮ NGUYÊN dữ liệu và tài khoản.
-- • Chạy lại lần nữa vẫn an toàn. Tất cả nằm trong 1 transaction: lỗi ở đâu thì không có gì bị thay đổi.
-- Không xóa bảng auth.users (tài khoản đăng nhập).
do $cd_main$
begin
 if to_regclass('public.cd_profiles') is null then
  raise notice 'CHI.CH DAO.: database trống → cài mới v0.10';
  execute $cd_step$
${await body('schema.sql')}
$cd_step$;
 else
  raise notice 'CHI.CH DAO.: đã có dữ liệu → nâng cấp lên v0.10, giữ dữ liệu';
`;
for(const f of steps)sql+=`  -- ===== ${f} =====\n  execute $cd_step$\n${await body(f)}\n$cd_step$;\n`;
sql+=` end if;
end
$cd_main$;
`;
if((sql.match(/\$cd_main\$/g)||[]).length!==2)throw new Error('main tag clash');
await writeFile(new URL('chichdao-full.sql',dir),sql);
console.log('supabase/chichdao-full.sql',sql.length,'bytes');
