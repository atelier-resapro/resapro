import { test } from 'node:test';
import assert from 'node:assert/strict';
import { telephoneMobileInternational, messageErreurCode } from '../src/lib/client-auth.ts';

for (const input of ['06 39 98 99 01', '0639989901', '+33 6 39 98 99 01', '0033639989901']) {
  test(`normalise le mobile ${input}`, () => assert.equal(telephoneMobileInternational(input), '+33639989901'));
}
test('accepte un mobile 07', () => assert.equal(telephoneMobileInternational('0739989901'), '+33739989901'));
for (const input of ['', '0139989901', '+441234567890', '063998990', '06399899011', 'texte']) {
  test(`refuse le numéro ${JSON.stringify(input)}`, () => assert.equal(telephoneMobileInternational(input), null));
}
test('un mauvais code affiche une erreur française claire', () => {
  assert.match(messageErreurCode('otp_expired'), /Code incorrect ou expiré/);
});
test('la limite de tentatives affiche une invitation à patienter', () => {
  assert.match(messageErreurCode('over_request_rate_limit'), /Patientez/);
});
test('les erreurs inconnues ne dévoilent pas de détails internes', () => {
  assert.equal(messageErreurCode('unexpected_failure'), 'Connexion impossible pour le moment. Veuillez réessayer.');
});
