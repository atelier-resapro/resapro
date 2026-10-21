import { test, expect } from '@playwright/test';

test('Supabase local : mauvais code refusé, code de test accepté sans SMS', async ({ page }) => {
  if (!process.env.SUPABASE_TEST_ANON_KEY) throw new Error('Définir SUPABASE_TEST_ANON_KEY avec la clé anon de Supabase LOCAL (voir README).');
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('06 39 98 99 01');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await page.getByLabel('Code reçu par SMS').fill('000000');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Code incorrect ou expiré');
  await page.getByLabel('Code reçu par SMS').fill('123456');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion client' })).toBeVisible();
});
