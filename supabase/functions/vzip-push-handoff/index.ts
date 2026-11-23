// 휴대폰으로 녹음 알림 (2026-11-23): the signed-in person's 휴대폰으로 녹음 on one device becomes a notification on their
// OTHER devices that allowed notifications (app/push-handoff.js registers them; supabase/migrations/
// 20261123_push_subscriptions.sql keeps them). Only the person's own devices; never another account's.
// Secrets (Supabase dashboard → Edge Functions → Secrets; never in the browser, GitHub or logs):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY   the key pair whose public half the app has (push-config.js)
//   VAPID_SUBJECT                         e.g. https://vocalzip.yullul.com
// Nothing about the request is stored. A device whose endpoint the push service says is gone (404/410) is removed.
import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL') || '';
const ANON = Deno.env.get('SUPABASE_ANON_KEY') || '';
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const PUB = Deno.env.get('VAPID_PUBLIC_KEY') || '', PRIV = Deno.env.get('VAPID_PRIVATE_KEY') || '';
const SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'https://vocalzip.yullul.com';
const ORIGINS = new Set(['https://vocalzip.yullul.com', 'https://eye215.github.io', 'http://localhost:3000']);
const cors = (req: Request) => {
  const origin = req.headers.get('Origin') || '';
  return origin && ORIGINS.has(origin) ? {'Access-Control-Allow-Origin':origin, 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods':'GET, POST, OPTIONS', 'Vary':'Origin'} : {};
};
const reply = (req: Request, status: number, data: Record<string, unknown>) => new Response(JSON.stringify(data), {status, headers:{...cors(req), 'Content-Type':'application/json; charset=utf-8'}});
const text = (v: unknown, max: number) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response(null, {status:204, headers:cors(req)});
  if (req.headers.get('Origin') && !ORIGINS.has(req.headers.get('Origin')!)) return reply(req, 403, {error:'허용되지 않은 사이트예요.'});
  if (!PUB || !PRIV || !SERVICE) return reply(req, 503, {error:'알림이 아직 준비되지 않았어요.'});
  const token = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return reply(req, 401, {error:'로그인이 필요해요.'});
  const auth = createClient(URL_, ANON, {auth:{persistSession:false, autoRefreshToken:false}});
  const {data:who, error:whoError} = await auth.auth.getUser(token);
  if (whoError || !who?.user) return reply(req, 401, {error:'로그인 세션을 확인할 수 없어요.'});
  // GET: is it set up (the app shows 알림 받기 only then).
  if (req.method === 'GET') return reply(req, 200, {available:true, publicKey:PUB});
  if (req.method !== 'POST') return reply(req, 405, {error:'GET/POST만 지원해요.'});
  let body: Record<string, unknown>;
  try { body = JSON.parse(await req.text()); } catch { return reply(req, 400, {error:'요청 형식이 올바르지 않아요.'}); }
  const songId = text(body.songId, 100), title = text(body.title, 120), fromName = text(body.fromName, 20) || '다른 기기', from = text(body.from, 100);
  const at = Number(body.at) || Date.now();
  if (!songId || !title || !from) return reply(req, 400, {error:'곡과 기기를 확인해 주세요.'});
  const admin = createClient(URL_, SERVICE, {auth:{persistSession:false, autoRefreshToken:false}});
  const {data:rows, error} = await admin.from('vzip_push_subscriptions').select('endpoint,p256dh,auth,device_id').eq('user_id', who.user.id).neq('device_id', from).limit(10);
  if (error) return reply(req, 503, {error:'알림 받을 기기를 확인할 수 없어요.'});
  webpush.setVapidDetails(SUBJECT, PUB, PRIV);
  const payload = JSON.stringify({type:'record-handoff', songId, title, fromName, at, from});
  let sent = 0;
  for (const r of rows || []) {
    try {
      await webpush.sendNotification({endpoint:r.endpoint, keys:{p256dh:r.p256dh, auth:r.auth}}, payload, {TTL:600, urgency:'high', topic:'record-handoff'});
      sent++;
    } catch (e) {
      const status = (e as {statusCode?: number})?.statusCode;
      if (status === 404 || status === 410) await admin.from('vzip_push_subscriptions').delete().eq('endpoint', r.endpoint).eq('user_id', who.user.id);
    }
  }
  return reply(req, 200, {sent, devices:(rows || []).length});
});
