import { test, expect, type Page } from '@playwright/test';

const userId = '00000000-0000-0000-0000-00000000da01';
const future = (hours: number) => new Date(Date.now() + hours * 3600000).toJSON();
function rendezVous(id: string, hours: number) {
  return { id, debut: future(hours), fin: future(hours + 0.5), statut: 'confirme',
    prestation: 'Coupe', coiffeur: 'Sophie', prix: 35, modification_jusqua: future(hours - 24) };
}
async function connecter(page: Page, role = 'client') {
  const jwt = [Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),
    Buffer.from(JSON.stringify({ sub: userId, aud: 'authenticated', role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url'),
    'test-signature'].join('.');
  await page.addInitScript(({ jwt, userId }) => {
    localStorage.setItem('sb-127-auth-token', JSON.stringify({ access_token: jwt, refresh_token: 'test',
      token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: userId, aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  }, { jwt, userId });
  await page.route('**/rest/v1/profils?*', route => route.fulfill({ json: [{ role }] }));
}

test('sur téléphone : à venir en haut, passés en dessous et actions masquées sous 24 h', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await connecter(page);
  await page.route('**/rest/v1/rpc/mes_rendez_vous', route => route.fulfill({ json: [rendezVous('1', 48), rendezVous('2', 12), rendezVous('3', -48)] }));
  await page.goto('/client');
  await expect(page.getByRole('heading', { name: 'À venir', exact: true })).toBeVisible();
  await expect(page.getByRole('tab')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Déplacer', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Annuler', exact: true })).toHaveCount(1);
  await expect(page.getByText('Pour ce rendez-vous, appelez le salon')).toBeVisible();
  const upcoming = page.getByRole('region', { name: 'À venir', exact: true });
  const box = await upcoming.boundingBox();
  expect(box!.y + box!.height).toBeLessThanOrEqual(667);
  const past = await page.getByRole('heading', { name: 'Passés', exact: true }).boundingBox();
  expect(past!.y).toBeGreaterThan(box!.y + box!.height);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('déplace puis annule avec confirmation, et rafraîchit les listes', async ({ page }) => {
  await connecter(page);
  const rdv = rendezVous('00000000-0000-0000-0000-00000000dd01', 72);
  const nouveauDebut = future(96);
  const calls: unknown[] = [];
  await page.route('**/rest/v1/rpc/mes_rendez_vous', route => route.fulfill({ json: [rdv] }));
  await page.route('**/rest/v1/rpc/creneaux_deplacement_client', route => route.fulfill({ json: [{ debut: nouveauDebut }] }));
  await page.route('**/rest/v1/rpc/modifier_mon_rendez_vous', route => {
    const body = route.request().postDataJSON(); calls.push(body);
    if (body.p_debut) { rdv.debut = body.p_debut; rdv.fin = future(96.5); }
    else rdv.statut = 'annule';
    return route.fulfill({ status: 204 });
  });
  await page.goto('/client');
  await page.getByRole('button', { name: 'Déplacer', exact: true }).click();
  await page.getByRole('group', { name: 'Horaires disponibles' }).getByRole('button').click();
  await page.getByRole('button', { name: 'Confirmer le déplacement' }).click();
  await expect(page.getByText('Rendez-vous déplacé', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.getByText('Aucun rendez-vous à venir.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Annulés', exact: true })).toBeVisible();
  expect(calls).toEqual([{ p_rendez_vous_id: rdv.id, p_debut: nouveauDebut }, { p_rendez_vous_id: rdv.id }]);
});

test('affiche un refus serveur sans annoncer un succès', async ({ page }) => {
  await connecter(page);
  await page.route('**/rest/v1/rpc/mes_rendez_vous', route => route.fulfill({ json: [rendezVous('1', 48)] }));
  await page.route('**/rest/v1/rpc/modifier_mon_rendez_vous', route => route.fulfill({ status: 400,
    json: { code: 'P0001', message: 'Pour ce rendez-vous, appelez le salon' } }));
  await page.goto('/client');
  await page.getByRole('button', { name: 'Annuler', exact: true }).click();
  await page.getByRole('button', { name: 'Oui', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Pour ce rendez-vous, appelez le salon');
  await expect(page.getByText('Rendez-vous annulé', { exact: true })).toHaveCount(0);
});

test('le gérant règle le délai du salon', async ({ page }) => {
  await connecter(page, 'gerant');
  let heures = 24;
  await page.route('**/rest/v1/parametres_salon?*', route => {
    if (route.request().method() === 'PATCH') {
      heures = route.request().postDataJSON().delai_modification_heures;
      return route.fulfill({ json: { id: true } });
    }
    return route.fulfill({ json: { delai_modification_heures: heures } });
  });
  await page.goto('/gerant/parametres');
  await page.getByLabel('Délai minimum avant déplacement ou annulation (heures)').fill('48');
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click();
  await expect(page.getByRole('status')).toHaveText('Délai enregistré.');
  expect(heures).toBe(48);
});

test('sans session, redirige vers la connexion', async ({ page }) => {
  await page.goto('/client');
  await expect(page).toHaveURL(/\/client\/connexion$/);
});
