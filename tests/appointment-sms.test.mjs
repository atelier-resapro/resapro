import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = readFileSync(new URL('../supabase/functions/envoyer-sms/index.ts', import.meta.url), 'utf8')
  .replace(/^import .*\r?\n/m, '');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const rdvId = '00000000-0000-0000-0000-00000000dd01';

function server(options = {}) {
  let handler;
  const sent = [], acknowledged = [], logs = [], calls = [];
  const rows = options.rows ?? ['client', 'employe'].map((destinataire, i) => ({
    id: `event-${i}`, reservation: `lease-${i}`, telephone: i ? '0739989802' : '0639989801',
    destinataire, client_nom: 'Camille', prestation: 'Coupe',
    ancien_debut: '2030-10-22T08:00:00Z', debut: '2030-10-23T09:00:00Z',
  }));
  const admin = {
    auth: { getUser: async () => ({ data: { user: options.invalidToken ? null : { id: 'user-id' } } }) },
    rpc: async () => { calls.push('claim'); return { data: rows }; },
    from: table => {
      const query = {
        select: () => query, eq: () => query, is: () => query,
        limit: async () => ({ data: options.pending ? [{ id: 'pending' }] : [] }),
        maybeSingle: async () => ({ data: table === 'profils' ? { role: options.role ?? 'client' }
          : options.notOwner ? null : options.appointment ?? { clients: { user_id: 'user-id' } } }),
        update: value => { acknowledged.push(value); return query; },
        then: resolve => resolve({ error: null }),
      };
      return query;
    },
  };
  vm.runInNewContext(compiled, {
    Deno: { env: { get: key => key === 'SITE_URL' ? 'https://salon.example'
      : options.missingSecret && key === 'SMS_API_KEY' ? undefined : 'secret-fixture' },
      serve: callback => { handler = callback; } },
    createClient: () => admin, Response, AbortSignal,
    console: { error: (...args) => logs.push(args.join(' ')) },
    fetch: async (_url, init) => {
      const sms = JSON.parse(init.body); sent.push(sms);
      if (options.networkError && sent.length === 1) throw new Error('contains-sensitive-details');
      return new Response(null, { status: sent.length === 1 ? options.status ?? 200 : 200 });
    },
  });
  return { sent, acknowledged, logs, calls, request: (type = 'deplacement', token = 'valid') => handler(new Request('https://edge.test', {
    method: 'POST', headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: JSON.stringify({ rendez_vous_id: rdvId, type }),
  })) };
}

for (const type of ['deplacement', 'annulation']) {
  test(`${type} : envoie au client et à l’employé, avec heures de Paris`, async () => {
    const s = server();
    assert.equal((await s.request(type)).status, 200);
    assert.deepEqual(s.sent.map(x => x.recipient), ['33639989801', '33739989802']);
    assert.match(s.sent[0].content, /votre rendez-vous Coupe/);
    assert.match(s.sent[1].content, /rendez-vous de Camille/);
    assert.match(s.sent[0].content, /10 h 00/);
    if (type === 'deplacement') assert.match(s.sent[0].content, /11 h 00/);
    assert.equal(s.acknowledged.length, 2);
    assert.ok(s.sent.every(x => !JSON.stringify(x).includes('secret-fixture')));
  });
}
for (const options of [{ role: 'employe' }, { role: 'client', notOwner: true }, { role: 'unknown' }]) {
  test(`interdit les appels non autorisés ${JSON.stringify(options)}`, async () => {
    const s = server(options);
    assert.equal((await s.request()).status, 403);
    assert.equal(s.sent.length, 0);
    assert.deepEqual(s.calls, []);
  });
}
test('JWT absent ou invalide : aucun envoi', async () => {
  for (const [s, token] of [[server(), ''], [server({ invalidToken: true }), 'invalid']]) {
    assert.equal((await s.request('annulation', token)).status, 401);
    assert.equal(s.sent.length, 0);
  }
});
for (const options of [{ status: 503 }, { networkError: true }]) {
  test(`échec partiel : tente aussi le second SMS et ne journalise aucun secret ${JSON.stringify(options)}`, async () => {
    const s = server(options);
    assert.equal((await s.request()).status, 502);
    assert.equal(s.sent.length, 2);
    assert.equal(s.acknowledged.length, 1);
    assert.doesNotMatch(s.logs.join(' '), /0639989801|secret-fixture|sensitive-details/);
  });
}
test('employé sans téléphone : signale l’échec', async () => {
  const s = server({ rows: [{ telephone: null }] });
  assert.equal((await s.request()).status, 502);
  assert.equal(s.sent.length, 0);
});
test('un nouvel appel sans événements réclamables ne renvoie aucun SMS', async () => {
  const s = server({ rows: [] });
  assert.equal((await s.request()).status, 200);
  assert.equal(s.sent.length, 0);
});
test('un envoi en cours ou épuisé ne produit pas de faux succès', async () => {
  const s = server({ rows: [], pending: true });
  assert.equal((await s.request()).status, 503);
});
test('clé serveur absente : aucun appel Brevo', async () => {
  const s = server({ missingSecret: true });
  assert.equal((await s.request()).status, 500);
  assert.equal(s.sent.length, 0);
});

test('la confirmation publique continue d’envoyer seulement au client', async () => {
  const s = server({ appointment: { statut: 'confirme', cree_le: new Date().toJSON(),
    debut: '2030-10-22T08:00:00Z', clients: { telephone: '0639989801' }, prestations: { nom: 'Coupe' } } });
  assert.equal((await s.request('confirmation', '')).status, 200);
  assert.equal(s.sent.length, 1);
  assert.equal(s.sent[0].recipient, '33639989801');
  assert.deepEqual(s.calls, []);
});
for (const appointment of [
  { statut: 'annule', cree_le: new Date().toJSON() },
  { statut: 'confirme', cree_le: '2020-01-01T00:00:00Z' },
]) {
  test(`la confirmation refuse une réservation ancienne ou annulée ${JSON.stringify(appointment)}`, async () => {
    const s = server({ appointment });
    assert.equal((await s.request('confirmation')).status, 403);
    assert.equal(s.sent.length, 0);
  });
}
