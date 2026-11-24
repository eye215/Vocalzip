// push-keys.html (휴대폰으로 녹음 알림 키 만들기, docs/push-handoff-setup.md 2단계): a VAPID key pair made on the device,
// in the formats web-push takes (public = uncompressed P-256 point, 65 bytes; private = the 32-byte scalar; base64url),
// the two halves belong together, and the page makes no network request.
const {test, expect} = require('@playwright/test');
const crypto = require('node:crypto');
const bytes = s => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
test('키 만들기: a matching VAPID pair, shown once, nothing sent', async ({page}) => {
  const requests = [];
  page.on('request', r => { if (!r.url().endsWith('/push-keys.html')) requests.push(r.url()); });
  await page.goto('/push-keys.html');
  await page.locator('#make').click();
  await expect(page.locator('#out')).toBeVisible();
  const pub = await page.locator('#pub').textContent(), priv = await page.locator('#priv').textContent();
  expect(pub).toMatch(/^[A-Za-z0-9_-]+$/); expect(priv).toMatch(/^[A-Za-z0-9_-]+$/);
  expect(bytes(pub).length).toBe(65); expect(bytes(pub)[0]).toBe(4); expect(bytes(priv).length).toBe(32);
  const ecdh = crypto.createECDH('prime256v1'); ecdh.setPrivateKey(bytes(priv));
  expect(ecdh.getPublicKey().equals(bytes(pub))).toBe(true);
  await expect(page.locator('#subj')).toHaveText('https://vocalzip.yullul.com');
  // 새로 만들기 gives another pair.
  await page.locator('#make').click();
  await expect(page.locator('#pub')).not.toHaveText(pub);
  expect(requests).toEqual([]);
});
