import { test, expect, type Page } from '@playwright/test';

async function captcha(page: Page) {
  // UI tests isolate browser behavior; the separate local suite uses real Auth.
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*', route => route.fulfill({
    contentType: 'application/javascript',
    body: `window.turnstile = { render(el, options) { setTimeout(() => options.callback('test-token'), 0); return 'widget'; }, remove() {} };`,
  }));
}

test.beforeEach(async ({ page }) => { await captcha(page); });

test('normalise le numéro avant de demander un code', async ({ page }) => {
  let payload;
  await page.route('**/functions/v1/demander-code-client', async route => {
    payload = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('06 39 98 99 01');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await expect(page.getByLabel('Code reçu par SMS')).toBeVisible();
  expect(payload).toEqual({ phone: '+33639989901', captchaToken: 'test-token' });
  await expect(page.getByRole('button', { name: 'Renvoyer un code' })).toBeDisabled();
});

test('un mauvais code garde le formulaire ouvert et affiche une erreur claire', async ({ page }) => {
  await page.route('**/functions/v1/demander-code-client', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/auth/v1/verify', route => route.fulfill({ status: 403, headers: {
    'x-supabase-api-version': '2024-01-01', 'access-control-expose-headers': 'x-supabase-api-version',
  }, json: { code: 'otp_expired', msg: 'Token has expired or is invalid' } }));
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('0639989901');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await page.getByLabel('Code reçu par SMS').fill('000000');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Code incorrect ou expiré');
  await expect(page.getByLabel('Code reçu par SMS')).toBeVisible();
});

test('un téléphone fixe est refusé sans appel serveur', async ({ page }) => {
  let calls = 0;
  await page.route('**/functions/v1/demander-code-client', route => { calls++; return route.abort(); });
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('0139989901');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await expect(page.getByRole('alert')).toContainText('numéro mobile français valide');
  expect(calls).toBe(0);
});

test('la limite serveur reste visible après un refus', async ({ page }) => {
  await page.route('**/functions/v1/demander-code-client', route => route.fulfill({ status: 429, json: { error: 'Limite atteinte : 3 codes par heure.' } }));
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('0639989901');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await expect(page.getByRole('alert')).toContainText('3 codes par heure');
});

test('la panne du CAPTCHA bloque les envois', async ({ page }) => {
  await page.route('https://challenges.cloudflare.com/turnstile/v0/api.js?*', route => route.abort());
  await page.goto('/client/connexion');
  await expect(page.getByRole('alert')).toContainText('Protection anti-robot indisponible');
  await expect(page.getByRole('button', { name: 'Recevoir un code par SMS' })).toBeDisabled();
});

test('une session client validée affiche le succès et permet la déconnexion', async ({ page }) => {
  const id = '00000000-0000-0000-0000-00000000ca01';
  const jwt = [
    Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ sub: id, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'test-signature',
  ].join('.');
  await page.route('**/functions/v1/demander-code-client', route => route.fulfill({ json: { ok: true } }));
  await page.route('**/auth/v1/verify', route => route.fulfill({ json: {
    access_token: jwt, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600,
    user: { id, aud: 'authenticated', role: 'authenticated', phone: '33639989901',
      app_metadata: { provider: 'phone' }, user_metadata: {}, created_at: new Date().toISOString() },
  } }));
  await page.route('**/rest/v1/profils?*', route => route.fulfill({ json: [{ role: 'client' }] }));
  await page.route('**/rest/v1/rpc/mes_rendez_vous', route => route.fulfill({ json: [] }));
  await page.route('**/auth/v1/logout?*', route => route.fulfill({ status: 204 }));
  await page.goto('/client/connexion');
  await expect(page.locator('input[type=password]')).toHaveCount(0);
  await page.getByLabel('Numéro de téléphone').fill('0639989901');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await page.getByLabel('Code reçu par SMS').fill('123456');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion client' })).toBeVisible();
});
