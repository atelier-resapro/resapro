// Runs SQL on the TEST database with `supabase db query` (CLI 2.121 or later),
// which needs no Docker and returns the rows of the last statement.
// TESTS_BASE picks the database:
// - "distant" (default): the linked Supabase project, which is a test project;
// - "locale": the local stack started by `supabase start` (GitHub Actions).
// Never link or point these tests at a production project.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = fileURLToPath(new URL('..', import.meta.url));
// Machine settings (CLI path, test project URL and public key), never committed.
if (existsSync(join(racine, '.env.tests.local'))) process.loadEnvFile(join(racine, '.env.tests.local'));

export const base = process.env.TESTS_BASE ?? 'distant';
const cible = { distant: '--linked', locale: '--local' }[base];
if (!cible) throw new Error('TESTS_BASE doit valoir « distant » ou « locale ».');
const cli = process.env.SUPABASE_CLI ?? 'supabase';

/** Reference of the linked test project, or null for the local stack. */
export function projetDeTest() {
  if (base === 'locale') return null;
  const fichier = join(racine, 'supabase', '.temp', 'project-ref');
  if (!existsSync(fichier)) throw new Error('Aucun projet lié : lancer `supabase link` vers le projet de TEST.');
  return readFileSync(fichier, 'utf8').trim();
}

/** Runs the SQL text and returns the rows of its last statement. */
export function executerSql(sql, nom = 'requete') {
  mkdirSync(join(racine, '.test-runtime'), { recursive: true });
  const fichier = join('.test-runtime', `${nom}.sql`);
  writeFileSync(join(racine, fichier), sql);
  // One command line: on Windows the CLI is a .cmd that needs a shell.
  const commande = [cli, 'db', 'query', cible, '-o', 'json', '--file', fichier]
    .map((arg) => (/\s/.test(arg) ? `"${arg}"` : arg)).join(' ');
  const resultat = spawnSync(commande, { cwd: racine, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
  const sortie = resultat.stdout ?? '';
  if (resultat.status !== 0) {
    const message = (resultat.stderr || sortie || resultat.error?.message || '').trim();
    const aide = /unknown command|Unrecognized|unknown flag/i.test(message)
      ? '\nSUPABASE_CLI doit désigner une CLI Supabase 2.121 ou plus récente (voir README).' : '';
    throw new Error(`supabase db query a échoué :\n${message}${aide}`);
  }
  const debut = [sortie.indexOf('{'), sortie.indexOf('[')].filter((i) => i >= 0);
  if (!debut.length) return [];
  const json = JSON.parse(sortie.slice(Math.min(...debut)));
  return Array.isArray(json) ? json : json.rows ?? [];
}
