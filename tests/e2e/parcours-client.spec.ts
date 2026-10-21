import { test, expect } from '@playwright/test';
import { executerSql } from '../../scripts/base-de-test.mjs';

// Real journey in Chrome on the TEST database (playwright.parcours.config.ts):
// Supabase, Auth and Turnstile are real. Only the SMS function is answered
// here, so that no paid SMS leaves. The test number must be a Supabase Auth
// test number (fixed code, no SMS) listed in TEST_PHONE_NUMBERS.
const telephone = process.env.E2E_TELEPHONE ?? '';
const code = process.env.E2E_CODE ?? '';
if (!/^0[67]\d{8}$/.test(telephone) || !/^\d{6}$/.test(code)) {
  throw new Error('Définir E2E_TELEPHONE (06/07 sur 10 chiffres) et E2E_CODE (6 chiffres) : voir README.');
}

const prestation = '00000000-0000-0000-0000-00000000e2a1';
const employes = ['00000000-0000-0000-0000-00000000e2e1', '00000000-0000-0000-0000-00000000e2e2'];
const liste = employes.map((id) => `'${id}'`).join(', ');

// Also run before, in case a previous run stopped half-way.
const nettoyage = `
delete from public.rendez_vous where prestation_id = '${prestation}';
delete from public.employes where id in (${liste});
delete from public.prestations where id = '${prestation}';
-- Quota of codes of the test number (60 seconds between codes, 3 per hour).
delete from public.envois_codes_clients where telephone = '33${telephone.slice(1)}';
`;

// A service done by two hairdressers with no appointment, every day 9:00-18:00.
const preparation = `${nettoyage}
insert into public.prestations (id, nom, duree_minutes, prix) values ('${prestation}', 'Parcours de test', 30, 1);
insert into public.employes (id, nom) values ('${employes[0]}', 'Parcours Alice'), ('${employes[1]}', 'Parcours Bruno');
insert into public.employe_prestations (employe_id, prestation_id)
select e, '${prestation}' from unnest(array[${liste}]::uuid[]) e;
insert into public.horaires (employe_id, jour_semaine, heure_debut, heure_fin)
select e, j, '09:00', '18:00' from unnest(array[${liste}]::uuid[]) e, generate_series(1, 7) j;
`;

test.beforeAll(() => { executerSql(preparation, 'parcours-preparation'); });
test.afterAll(() => { executerSql(nettoyage, 'parcours-nettoyage'); });

test('parcours client : réserver avec « indifférent », retrouver le rendez-vous puis l’annuler', async ({ page }) => {
  const sms: unknown[] = [];
  await page.route('**/functions/v1/envoyer-sms', (route) => {
    sms.push(route.request().postDataJSON());
    return route.fulfill({ json: { ok: true } });
  });

  // Booking, as the public.
  await page.goto('/reserver');
  await page.getByRole('button', { name: /Parcours de test/ }).click();
  await page.getByRole('button', { name: /Indifférent/ }).click();
  // The last day offered, so that the cancellation delay is not reached.
  await page.getByRole('group', { name: 'Choisir un jour' }).getByRole('button').last().click();
  await page.getByRole('list', { name: 'Horaires libres' }).getByRole('button', { name: '9 h 00' }).click();
  await expect(page.getByText('avec le premier coiffeur disponible')).toBeVisible();
  await page.getByLabel('Votre nom').fill('Client parcours');
  await page.getByLabel('Votre téléphone').fill(telephone);
  await page.getByRole('button', { name: 'Je réserve' }).click();
  await expect(page.getByRole('heading', { name: 'Rendez-vous confirmé' })).toBeVisible();
  await expect(page.getByText('Parcours de test', { exact: true })).toBeVisible();
  // Both are free all day with no appointment: the alphabetical order decides.
  await expect(page.getByText('Parcours Alice', { exact: true })).toBeVisible();

  // Client space, with the code of the test number.
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill(telephone);
  const recevoir = page.getByRole('button', { name: 'Recevoir un code par SMS' });
  await expect(recevoir).toBeEnabled({ timeout: 30_000 }); // Turnstile test key
  await recevoir.click();
  await page.getByLabel('Code reçu par SMS').fill(code);
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();

  const aVenir = page.getByRole('region', { name: 'À venir', exact: true });
  const carte = aVenir.getByRole('listitem').filter({ hasText: 'Parcours de test · Parcours Alice' });
  await expect(carte).toBeVisible();
  await carte.getByRole('button', { name: 'Annuler', exact: true }).click();
  await carte.getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.getByText('Rendez-vous annulé', { exact: true })).toBeVisible();
  await expect(carte).toHaveCount(0);
  await expect(page.getByRole('listitem').filter({ hasText: 'Parcours de test · Parcours Alice' })).toContainText('Annulé');

  // The database itself has the cancellation.
  const lignes = executerSql(`select r.statut, e.nom from public.rendez_vous r
    join public.employes e on e.id = r.employe_id where r.prestation_id = '${prestation}'`, 'parcours-verification');
  expect(lignes).toEqual([{ statut: 'annule', nom: 'Parcours Alice' }]);
  expect(sms).toEqual([
    { rendez_vous_id: expect.any(String), type: 'confirmation' },
    { rendez_vous_id: expect.any(String), type: 'annulation' },
  ]);
});
