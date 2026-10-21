import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

// Execute the actual Edge handler with isolated network/Auth dependencies.
const source = readFileSync(new URL('../supabase/functions/demander-code-client/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*\n/, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;

function gateway(options = {}) {
  let handler;
  const calls = [];
  const env = {
    SUPABASE_URL: 'https://project.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server-only',
    TURNSTILE_SECRET_KEY: 'real-secret-fixture', TURNSTILE_HOSTNAME: 'salon.example', SMS_API_KEY: 'sms-fixture',
    TEST_PHONE_NUMBERS: '33639989901,33639989902',
    ...options.env,
  };
  const admin = {
    rpc: async () => { calls.push('quota'); return { data: options.allowed ?? true }; },
    auth: {
      admin: { createUser: async () => { calls.push('account'); return { error: options.creationError ?? null }; } },
      signInWithOtp: async () => { calls.push('otp'); return { error: options.otpError ?? null }; },
      resend: async () => { calls.push('confirmation'); return { error: null }; },
    },
    from: () => ({
      select: () => ({ eq: () => ({ single: async () => ({ data: { code: options.code ?? null } }) }) }),
      update: () => ({ eq: async () => { calls.push('clear'); return { error: null }; } }),
    }),
  };
  vm.runInNewContext(compiled, {
    Deno: { env: { get: key => env[key] }, serve: callback => { handler = callback; } },
    createClient: () => admin, Response, URLSearchParams,
    fetch: async url => {
      if (url.includes('siteverify')) {
        calls.push('captcha');
        return Response.json(options.captcha ?? { success: true, hostname: 'salon.example', action: 'connexion-client' });
      }
      if (url.includes('brevo.com')) { calls.push('sms'); return new Response(null, { status: options.smsStatus ?? 200 }); }
      throw new Error('Unexpected external request');
    },
  });
  return {
    calls,
    request: (body = { phone: '+33639989901', captchaToken: 'token' }) => handler(new Request('http://edge.test', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    })),
  };
}

test('serveur : mobile invalide refusé avant tout appel externe', async () => {
  const g = gateway();
  assert.equal((await g.request({ phone: '+33123456789', captchaToken: 'token' })).status, 400);
  assert.deepEqual(g.calls, []);
});
test('serveur : CAPTCHA absent refusé même avec un numéro valide', async () => {
  const g = gateway();
  assert.equal((await g.request({ phone: '+33639989901' })).status, 400);
  assert.deepEqual(g.calls, []);
});
test('serveur : CAPTCHA invalide ne consomme aucun quota et ne crée aucun compte', async () => {
  const g = gateway({ captcha: { success: false } });
  assert.equal((await g.request()).status, 403);
  assert.deepEqual(g.calls, ['captcha']);
});
for (const captcha of [
  { success: true, hostname: 'attacker.example', action: 'connexion-client' },
  { success: true, hostname: 'salon.example', action: 'another-form' },
]) {
  test(`serveur : refuse un jeton destiné à ${captcha.hostname}/${captcha.action}`, async () => {
    const g = gateway({ captcha });
    assert.equal((await g.request()).status, 403);
    assert.deepEqual(g.calls, ['captcha']);
  });
}
test('serveur : quota épuisé interdit le provisionnement et le SMS', async () => {
  const g = gateway({ allowed: false });
  assert.equal((await g.request()).status, 429);
  assert.deepEqual(g.calls, ['captcha', 'quota']);
});
test('serveur : aucun faux succès si le hook manque en production', async () => {
  const g = gateway();
  assert.equal((await g.request()).status, 503);
  assert.ok(!g.calls.includes('sms'));
});
test('serveur : numéro de test local ne déclenche aucun SMS', async () => {
  const g = gateway({ env: {
    SUPABASE_URL: 'http://kong:8000', TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', SMS_API_KEY: undefined,
  }, captcha: { success: true, hostname: 'localhost', action: 'test' } });
  assert.equal((await g.request()).status, 200);
  assert.deepEqual(g.calls, ['captcha', 'quota', 'account', 'confirmation', 'clear']);
});
test('serveur : le mode CAPTCHA factice est refusé sur un projet hébergé', async () => {
  const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
    captcha: { success: true, hostname: 'localhost', action: 'test' } });
  assert.equal((await g.request()).status, 403);
});
test('serveur : accepte la réponse Turnstile exacte sans action avec metadata.result_with_testing_key true', async () => {
  const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', SMS_API_KEY: undefined },
    captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
  assert.equal((await g.request()).status, 200);
  assert.deepEqual(g.calls, ['captcha', 'quota', 'account', 'confirmation', 'clear']);
});
for (const captcha of [
  { success: false, hostname: 'example.com', metadata: { result_with_testing_key: true } },
  { success: true, hostname: 'attacker.example', metadata: { result_with_testing_key: true } },
  { success: true, hostname: 'example.com' },
  { success: true, hostname: 'example.com', metadata: {} },
  { success: true, hostname: 'example.com', metadata: { result_with_testing_key: false } },
  { success: true, hostname: 'example.com', metadata: { result_with_testing_key: 'true' } },
  { success: true, hostname: 'example.com', action: 'result_with_testing_key' },
]) {
  test(`serveur : refuse la réponse de test incomplète ${JSON.stringify(captcha)}`, async () => {
    const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' }, captcha });
    assert.equal((await g.request()).status, 403);
    assert.deepEqual(g.calls, ['captcha']);
  });
}
test('serveur : refuse la réponse Turnstile de test avec une clé secrète réelle', async () => {
  const g = gateway({ captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
  assert.equal((await g.request()).status, 403);
  assert.deepEqual(g.calls, ['captcha']);
});
test('serveur : la réponse de test hébergée ne dispense pas les autres numéros du hook', async () => {
  const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA' },
    captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
  assert.equal((await g.request({ phone: '+33639989903', captchaToken: 'token' })).status, 503);
  assert.ok(!g.calls.includes('sms'));
});
test('serveur : utilise le numéro hébergé configuré dans TEST_PHONE_NUMBERS sans envoyer de SMS', async () => {
  const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    TEST_PHONE_NUMBERS: '33639981234', SMS_API_KEY: undefined },
    captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
  assert.equal((await g.request({ phone: '+33639981234', captchaToken: 'token' })).status, 200);
  assert.deepEqual(g.calls, ['captcha', 'quota', 'account', 'confirmation', 'clear']);
});
for (const configured of [undefined, '', '33639981234', '336399899010', 'texte']) {
  test(`serveur : aucun numéro implicite avec TEST_PHONE_NUMBERS=${JSON.stringify(configured)}`, async () => {
    const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', TEST_PHONE_NUMBERS: configured },
      captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
    assert.equal((await g.request()).status, 503);
    assert.ok(!g.calls.includes('sms'));
  });
}
test('serveur : accepte une liste de numéros séparés par des virgules avec espaces', async () => {
  const g = gateway({ env: { TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    TEST_PHONE_NUMBERS: ' 33639981234, 33639989901 ' },
    captcha: { success: true, hostname: 'example.com', metadata: { result_with_testing_key: true } } });
  assert.equal((await g.request()).status, 200);
  assert.ok(!g.calls.includes('sms'));
});
test('serveur : la liste de test ne contourne pas le hook avec une clé CAPTCHA réelle', async () => {
  const g = gateway({ env: { TEST_PHONE_NUMBERS: '33639989901' } });
  assert.equal((await g.request()).status, 503);
  assert.ok(!g.calls.includes('sms'));
});
test('serveur : un compte existant peut redemander un OTP, nettoyé avant envoi', async () => {
  const g = gateway({ creationError: { code: 'phone_exists' }, code: '987654' });
  assert.equal((await g.request()).status, 200);
  assert.deepEqual(g.calls, ['captcha', 'quota', 'account', 'otp', 'clear', 'sms']);
});
test('serveur : une panne Brevo est signalée sans dévoiler le code', async () => {
  const g = gateway({ code: '987654', smsStatus: 503 });
  const response = await g.request();
  assert.equal(response.status, 502);
  assert.ok(!(await response.text()).includes('987654'));
});
test('serveur : un compte non confirmé utilise resend sans réouvrir les inscriptions', async () => {
  const g = gateway({ creationError: { code: 'phone_exists' }, otpError: { code: 'signup_disabled' }, code: '987654' });
  assert.equal((await g.request()).status, 200);
  assert.deepEqual(g.calls, ['captcha', 'quota', 'account', 'otp', 'confirmation', 'clear', 'sms']);
});
