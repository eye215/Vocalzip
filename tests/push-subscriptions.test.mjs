// 휴대폰으로 녹음 알림 — supabase/migrations/20261123_push_subscriptions.sql on a disposable local PostgreSQL only
// (VZ_PUSH_TEST_DB, CI's service container). No real user, endpoint or key: fake values.
import {test, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const url = process.env.VZ_PUSH_TEST_DB, skip = !url;
const U = '11111111-1111-4111-8111-111111111111', V = '22222222-2222-4222-8222-222222222222';
const sql = readFileSync('supabase/migrations/20261123_push_subscriptions.sql', 'utf8');
let admin, db, name;
async function as(user, query, args = []) {
  await db.query('begin');
  try {
    await db.query('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [user || '']);
    const r = await db.query(query, args); await db.query('commit'); return r.rows;
  } catch (error) { await db.query('rollback'); throw error; }
}
const reg = (user, endpoint, device, name = '아이폰') => as(user, 'select public.vzip_push_register($1,$2,$3,$4,$5) ok', [endpoint, 'p'.repeat(40), 'a'.repeat(16), device, name]);
const mine = user => as(user, 'select endpoint, device_id, device_name from public.vzip_push_subscriptions order by endpoint');
const all = () => db.query('select endpoint, user_id, device_id from public.vzip_push_subscriptions order by endpoint').then(r => r.rows);
before(async () => {
  if (skip) return;
  const parsed = new URL(url); assert.ok(['localhost', '127.0.0.1'].includes(parsed.hostname), 'test DB must be local');
  admin = new pg.Client({connectionString:url}); await admin.connect(); name = 'push_' + Date.now();
  await admin.query('create database ' + name); parsed.pathname = '/' + name;
  db = new pg.Client({connectionString:parsed.toString()}); await db.connect();
  await db.query("do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;");
  await db.query(`create schema auth; create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth, public to anon, authenticated;
    insert into auth.users values ('${U}'), ('${V}');`);
  await db.query(sql); await db.query(sql);   // applying it twice is harmless
});
after(async () => { if (skip) return; await db.end(); await admin.query('drop database ' + name); await admin.end(); });

test('a person registers their devices and sees only their own; the same device again replaces its endpoint', {skip}, async () => {
  assert.deepEqual(await reg(U, 'https://push.example/1', 'phone'), [{ok:true}]);
  await reg(U, 'https://push.example/2', 'pad', '아이패드');
  await reg(V, 'https://push.example/9', 'other');
  assert.deepEqual((await mine(U)).map(r => r.endpoint), ['https://push.example/1', 'https://push.example/2']);
  assert.deepEqual((await mine(V)).map(r => r.endpoint), ['https://push.example/9']);
  // The phone got a new endpoint: the old one of that device goes.
  await reg(U, 'https://push.example/3', 'phone');
  assert.deepEqual((await mine(U)).map(r => [r.endpoint, r.device_id]), [['https://push.example/2', 'pad'], ['https://push.example/3', 'phone']]);
});

test('another account signing in on a device takes its endpoint over; nobody else can delete or write rows', {skip}, async () => {
  await reg(V, 'https://push.example/2', 'v-pad');
  assert.deepEqual((await mine(U)).map(r => r.endpoint), ['https://push.example/3']);
  assert.ok((await mine(V)).some(r => r.endpoint === 'https://push.example/2'));
  // Direct writes are not allowed; deleting another's row does nothing.
  await assert.rejects(as(U, "insert into public.vzip_push_subscriptions(endpoint,user_id,device_id,p256dh,auth) values ('https://x.example/1',$1,'d',repeat('p',40),repeat('a',16))", [U]));
  await assert.rejects(as(U, "update public.vzip_push_subscriptions set device_name='x'"));
  await as(U, "delete from public.vzip_push_subscriptions where endpoint='https://push.example/9'");
  assert.ok((await all()).some(r => r.endpoint === 'https://push.example/9'));
  // Unregister: only one's own.
  assert.deepEqual(await as(U, 'select public.vzip_push_unregister($1) ok', ['https://push.example/9']), [{ok:false}]);
  assert.deepEqual(await as(V, 'select public.vzip_push_unregister($1) ok', ['https://push.example/9']), [{ok:true}]);
});

test('signed out cannot register; bad values are refused; at most 10 devices a person', {skip}, async () => {
  await assert.rejects(reg(null, 'https://push.example/x', 'd'));
  await assert.rejects(reg(U, 'http://insecure.example/1', 'd'));
  await assert.rejects(reg(U, 'https://push.example/long', 'x'.repeat(101)));
  for (let i = 0; i < 12; i++) await reg(U, 'https://push.example/many-' + String(i).padStart(2, '0'), 'dev-' + i);
  assert.equal((await mine(U)).length, 10);
  assert.ok(!(await mine(U)).some(r => r.endpoint === 'https://push.example/3'));   // the oldest went
});
