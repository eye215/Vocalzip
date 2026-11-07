/* VOCAL.zip operations check — READ ONLY (docs/product/PRODUCT_DECISIONS_2026-11-07.md §12).
 * Run by .github/workflows/ops-audit.yml on demand. It never writes and never prints user data or secret values
 * (this repository's logs are public): only table/policy names, true/false checks, HTTP status codes and counts of
 * rows an *anonymous* visitor could read (which must be 0).
 *  1. Database (SUPABASE_DB_URL, inside a READ ONLY transaction): RLS on every public table, policy rules,
 *     primary keys, what the anon role may run, storage bucket privacy, scheduled jobs.
 *  2. As an outside visitor with the app's public anon key: try to read every table, call functions, list storage.
 *  3. R2 media Worker without a sign-in: every route must refuse.
 */
import pg from 'pg';
import {readFileSync, appendFileSync} from 'node:fs';

const env = process.env, lines = [], fails = [];
const say = s => { lines.push(s); console.log(s); };
const check = (name, pass, note = '') => { if (pass === false) fails.push(name); say((pass === true ? '✅ ' : pass === false ? '❌ ' : '⚠️ ') + name + (note ? ' — ' + note : '')); };
const src = readFileSync(new URL('../cloud-sync.js', import.meta.url), 'utf8');
const SUPA = src.match(/const url='(https:\/\/[a-z0-9]+\.supabase\.co)'/)?.[1];
const ANON = src.match(/const key='([^']+)'/)?.[1]; // public by design (shipped in the app)
const WORKER = readFileSync(new URL('../r2-config.js', import.meta.url), 'utf8').match(/VZIP_R2_ENDPOINT = '([^']+)'/)?.[1];
const TABLES_EXPECTED = ['vocal_data', 'vocal_media', 'vocal_history', 'vocal_song_texts', 'vocal_analysis_jobs', 'vocal_billing_documents', 'vzip_song_stt_quota', 'vzip_worker_wake'];

async function database() {
  say('\n## 1. 운영 DB (읽기 전용 트랜잭션)');
  if (!env.SUPABASE_DB_URL) { check('DB 접속 정보', null, 'SUPABASE_DB_URL 시크릿 없음 → 건너뜀'); return; }
  const db = new pg.Client({connectionString:env.SUPABASE_DB_URL, ssl:env.SUPABASE_DB_SSL === 'off' ? false : {rejectUnauthorized:false}});
  await db.connect();
  try {
    await db.query('begin transaction read only');
    const q = async (sql, args) => (await db.query(sql, args)).rows;
    // Parts that exist only on Supabase (storage, cron, vault): a missing one is skipped without ending the check.
    const opt = async sql => { await db.query('savepoint opt'); try { const r = (await db.query(sql)).rows; await db.query('release savepoint opt'); return r; } catch { await db.query('rollback to savepoint opt'); return null; } };
    const tables = await q(`select c.relname as t, c.relrowsecurity as rls, c.relforcerowsecurity as forced
      from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' order by 1`);
    const names = new Set(tables.map(r => r.t));
    for (const t of TABLES_EXPECTED) if (!names.has(t)) check('표 있음: ' + t, null, '운영 DB에 없음 (해당 SQL 미실행일 수 있음)');
    const grants = await q(`select table_name, string_agg(privilege_type, ',' order by privilege_type) p from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated') group by table_name`);
    const grantOf = new Map(grants.map(g => [g.table_name, g.p]));
    for (const r of tables) check('RLS 켜짐: public.' + r.t, r.rls, grantOf.has(r.t) ? '앱 역할 권한 ' + grantOf.get(r.t) : '앱 역할 권한 없음');
    const policies = await q(`select schemaname s, tablename t, policyname p, cmd, roles::text roles, coalesce(qual, '') u, coalesce(with_check, '') w
      from pg_policies where schemaname in ('public', 'storage') order by 1, 2, 3`);
    say('\n### 정책 (규칙만, 데이터 없음)');
    for (const p of policies) {
      const owner = /auth\.uid\(\)/.test(p.u + p.w) || /owner|user_id/.test(p.u + p.w);
      check(p.s + '.' + p.t + ' · ' + p.p + ' (' + p.cmd + ', ' + p.roles + ')', owner || /false/.test(p.u) ? true : null, (p.u ? 'USING ' + p.u : '') + (p.w ? ' CHECK ' + p.w : ''));
    }
    const pks = await q(`select tc.table_name t, string_agg(k.column_name, ',' order by k.ordinal_position) cols from information_schema.table_constraints tc
      join information_schema.key_column_usage k on k.constraint_name = tc.constraint_name and k.table_schema = tc.table_schema
      where tc.table_schema = 'public' and tc.constraint_type = 'PRIMARY KEY' group by 1`);
    say('\n### 기본 키');
    const pk = new Map(pks.map(r => [r.t, r.cols]));
    for (const r of tables) check('PK: ' + r.t, pk.has(r.t), pk.get(r.t) || '기본 키 없음');
    const fns = await q(`select p.proname n, p.prosecdef definer, p.prorettype = 'trigger'::regtype trig, has_function_privilege('anon', p.oid, 'execute') anon,
      has_function_privilege('authenticated', p.oid, 'execute') auth from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and (p.proname like 'vzip%' or p.proname like 'vocal%') order by 1`);
    say('\n### 함수 (누가 실행할 수 있나)');
    const serverOnly = /^(vzip_claim_analysis_jobs|vzip_fail_abandoned_jobs|vzip_wake_worker|vzip_wake_worker_status|vzip_queue_media)$/;
    // Trigger functions cannot be called on their own (only the database runs them), so their execute grant does not matter.
    for (const f of fns) check('함수 ' + f.n + (f.definer ? ' (security definer)' : '') + (f.trig ? ' · 트리거 전용' : ''), f.trig ? true : serverOnly.test(f.n) ? !f.anon && !f.auth : !f.anon,
      'anon ' + (f.anon ? '실행 가능' : '불가') + ' · 로그인 사용자 ' + (f.auth ? '가능' : '불가'));
    const buckets = await opt(`select id, public, file_size_limit from storage.buckets order by 1`);
    say('\n### Supabase Storage 버킷');
    if (!buckets) say('storage.buckets 없음 (Supabase가 아닌 DB)');
    for (const b of buckets || []) check('버킷 ' + b.id + ' 비공개', !b.public, b.file_size_limit ? '파일 한도 ' + b.file_size_limit : '');
    const ext = await q(`select extname from pg_extension order by 1`);
    say('\n확장: ' + ext.map(e => e.extname).join(', '));
    if (ext.some(e => e.extname === 'pg_cron')) {
      const jobs = await opt(`select jobname, schedule, active from cron.job order by 1`) || [];
      say('예약 작업: ' + (jobs.map(j => j.jobname + ' ' + j.schedule + (j.active ? '' : ' (꺼짐)')).join(', ') || '없음'));
    }
    const vault = await opt(`select count(*)::int n from vault.secrets where name = 'github_actions_token'`);
    if (vault) say('Vault github_actions_token: ' + (vault[0].n ? '있음' : '없음') + ' (값은 확인하지 않음)');
  } finally { await db.query('rollback').catch(() => {}); await db.end(); }
}

async function asVisitor() {
  say('\n## 2. 외부 방문자로 시도 (앱에 공개된 anon 키)');
  if (!SUPA || !ANON) { check('Supabase 주소/anon 키', null, 'cloud-sync.js에서 찾지 못함'); return; }
  const h = {apikey:ANON, authorization:'Bearer ' + ANON};
  const settings = await fetch(SUPA + '/auth/v1/settings', {headers:h}).then(r => r.json()).catch(() => null);
  if (settings) {
    check('회원가입 막힘 (disable_signup)', settings.disable_signup === true ? true : null, settings.disable_signup ? '닫힘' : '열림: 누구나 가입 가능 (정책 결정 필요)');
    say('이메일 확인 자동 통과(mailer_autoconfirm): ' + !!settings.mailer_autoconfirm + ' · 켜진 로그인 방식: ' + Object.entries(settings.external || {}).filter(([, v]) => v).map(([k]) => k).join(', '));
  }
  for (const t of TABLES_EXPECTED) {
    const r = await fetch(SUPA + '/rest/v1/' + t + '?select=*&limit=1', {headers:h});
    const body = await r.text(); let rows = null; try { const j = JSON.parse(body); rows = Array.isArray(j) ? j.length : null; } catch {}
    check('익명으로 ' + t + ' 읽기 차단', rows === null || rows === 0, 'HTTP ' + r.status + (rows != null ? ' · 읽힌 행 ' + rows : ''));
  }
  // Only functions that read: whether the others may run is checked in the database step, without calling them.
  for (const fn of ['vzip_song_stt_usage', 'vzip_wake_worker_status']) {
    const r = await fetch(SUPA + '/rest/v1/rpc/' + fn, {method:'POST', headers:{...h, 'content-type':'application/json'}, body:'{}'});
    const text = await r.text();
    const harmless = r.status >= 400 || /^\s*(\[\]|null|0|\[\{[^}]*"used_total":0)/.test(text);
    check('익명으로 함수 ' + fn + ' 실행', harmless, 'HTTP ' + r.status);
  }
  const ls = await fetch(SUPA + '/storage/v1/object/list/vocal-recordings', {method:'POST', headers:{...h, 'content-type':'application/json'}, body:JSON.stringify({prefix:'', limit:5})});
  const lsBody = await ls.text(); let n = null; try { const j = JSON.parse(lsBody); n = Array.isArray(j) ? j.length : null; } catch {}
  check('익명으로 Storage vocal-recordings 목록 보기 차단', n === null || n === 0, 'HTTP ' + ls.status + (n != null ? ' · 보인 항목 ' + n : ''));
}

async function worker() {
  say('\n## 3. R2 미디어 Worker (로그인 없이)');
  if (!WORKER) { check('Worker 주소', null, 'r2-config.js에서 찾지 못함'); return; }
  // Reads only (no upload or delete is attempted, even unauthenticated).
  const tries = [['GET', '/v1/me'], ['GET', '/v1/usage'], ['GET', '/v1/objects'], ['POST', '/v1/sign'], ['GET', '/v1/media/u/00000000-0000-4000-8000-000000000000/x/original.wav']];
  for (const [m, p] of tries) {
    const r = await fetch(WORKER + p, {method:m, headers:{'content-type':'application/json'}, body:m === 'GET' ? undefined : '{}'});
    check('로그인 없이 ' + m + ' ' + p, r.status === 401 || r.status === 403, 'HTTP ' + r.status);
  }
  const fake = await fetch(WORKER + '/v1/usage', {headers:{authorization:'Bearer not-a-real-token'}});
  check('가짜 토큰 거부', fake.status === 401 || fake.status === 403, 'HTTP ' + fake.status);
  const cors = await fetch(WORKER + '/v1/usage', {method:'OPTIONS', headers:{origin:'https://evil.example', 'access-control-request-method':'GET'}});
  check('다른 사이트(origin) 차단', !cors.headers.get('access-control-allow-origin'), 'HTTP ' + cors.status);
  if (env.R2_ACCOUNT_ID) {
    const raw = await fetch('https://' + env.R2_ACCOUNT_ID.trim() + '.r2.cloudflarestorage.com/vocalzip-media/');
    check('R2 버킷 서명 없이 목록 보기 차단', raw.status >= 400, 'HTTP ' + raw.status);
  }
  say('⚠️ R2 공개 도메인(r2.dev)·수명 주기·저장량은 Cloudflare API 권한이 필요해 이 점검으로 확인하지 못함');
}

for (const step of [database, asVisitor, worker]) {
  try { await step(); } catch (e) { check(step.name + ' 단계 실행', null, '오류: ' + String(e.message || e).slice(0, 160)); }
}
say('\n결과: 문제 ' + fails.length + '건' + (fails.length ? ' — ' + fails.join(' / ') : ''));
if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, '# 운영 보안 점검 (읽기 전용)\n\n' + lines.join('\n\n') + '\n');
