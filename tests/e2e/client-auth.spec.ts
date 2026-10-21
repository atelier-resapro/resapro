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

test('Supabase local : un numéro sans rendez-vous peut se connecter et ouvrir son agenda vide', async ({ page }) => {
  if (!process.env.SUPABASE_TEST_ANON_KEY) throw new Error('Définir SUPABASE_TEST_ANON_KEY avec la clé anon de Supabase LOCAL (voir README).');
  // Second native local test number, absent from seed.sql; use a fresh local
  // test database and never create bookings for this number in this scenario.
  await page.goto('/client/connexion');
  await page.getByLabel('Numéro de téléphone').fill('06 39 98 99 02');
  await page.getByRole('button', { name: 'Recevoir un code par SMS' }).click();
  await page.getByLabel('Code reçu par SMS').fill('654321');
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await expect(page.getByText('Aucun rendez-vous à venir.', { exact: true })).toBeVisible();
  await expect(page.getByText('Aucun rendez-vous passé.', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Mes rendez-vous' })).toBeVisible();
  await expect(page.getByText('Aucun rendez-vous à venir.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('heading', { name: 'Connexion client' })).toBeVisible();
});
