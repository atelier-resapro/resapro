// Runs SQL on the TEST database and returns the rows of its last select.
// TESTS_BASE picks the database:
// - "distant" (default): the linked Supabase project, which is a test project,
//   through `supabase db query --linked` (CLI 2.121 or later, no Docker);
// - "locale": the local stack started by `supabase start` (GitHub Actions),
//   through psql: `db query --local` sends one prepared statement, which
//   refuses several commands.
// Never link or point these tests at a production project.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = fileURLToPath(new URL('..', import.meta.url));
// Machine settings (CLI path, test project URL and public key), never committed.
if (existsSync(join(racine, '.env.tests.local'))) process.loadEnvFile(join(racine, '.env.tests.local'));

export const base = process.env.TESTS_BASE ?? 'distant';
if (!['distant', 'locale'].includes(base)) throw new Error('TESTS_BASE doit valoir « distant » ou « locale ».');
const cli = process.env.SUPABASE_CLI ?? 'supabase';
const urlLocale = process.env.TESTS_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

/** Reference of the linked test project, or null for the local stack. */
export function projetDeTest() {
  if (base === 'locale') return null;
  const fichier = join(racine, 'supabase', '.temp', 'project-ref');
  if (!existsSync(fichier)) throw new Error('Aucun projet lié : lancer `supabase link` vers le projet de TEST.');
  return readFileSync(fichier, 'utf8').trim();
}

/** Splits SQL into statements, ignoring ; inside strings, comments and $$ bodies. */
export function instructions(sql) {
  const resultat = [];
  let debut = 0;
  for (let i = 0; i < sql.length; i++) {
    const c = sql[i];
    if (c === "'" || c === '"') {
      i = sql.indexOf(c, i + 1);
      while (i >= 0 && sql[i + 1] === c) i = sql.indexOf(c, i + 2);
    } else if (c === '-' && sql[i + 1] === '-') {
      i = sql.indexOf('\n', i);
      if (i < 0) i = sql.length;
    } else if (c === '/' && sql[i + 1] === '*') {
      i = sql.indexOf('*/', i) + 1;
    } else if (c === '$') {
      const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))?.[0];
      if (tag) i = sql.indexOf(tag, i + tag.length) + tag.length - 1;
    } else if (c === ';') {
      resultat.push(sql.slice(debut, i));
      debut = i + 1;
    }
    if (i < 0) throw new Error('Chaîne, commentaire ou bloc $$ non terminé.');
  }
  if (sql.slice(debut).trim()) resultat.push(sql.slice(debut));
  return resultat;
}

export const sansCommentaires = (instruction) => instruction.replace(/^(\s*--[^\n]*(\n|$))+/, '').trim();

export const repere = '@@resultat@@';

/** For psql: the last select prints its rows as one JSON line after a marker. */
export function marquerDernierSelect(sql) {
  const liste = instructions(sql).map(sansCommentaires).filter(Boolean);
  const dernier = liste.findLastIndex((instruction) => /^(select|with|values)\b/i.test(instruction));
  if (dernier >= 0) {
    liste[dernier] = `select '${repere}' || coalesce(jsonb_agg(to_jsonb(resultat)), '[]'::jsonb)::text\nfrom (${liste[dernier]}) resultat`;
  }
  return liste.join(';\n') + ';\n';
}

/** Reads the rows printed after the marker (none when the SQL has no select). */
export function lireResultat(sortie) {
  const ligne = sortie.split(/\r?\n/).find((l) => l.startsWith(repere));
  return ligne ? JSON.parse(ligne.slice(repere.length)) : [];
}

function lancer(arguments_) {
  // One command line: on Windows the CLI is a .cmd that needs a shell.
  const commande = arguments_.map((arg) => (/[\s&|<>^]/.test(arg) ? `"${arg}"` : arg)).join(' ');
  return spawnSync(commande, { cwd: racine, encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });
}

/** Runs the SQL text and returns the rows of its last select. */
export function executerSql(sql, nom = 'requete') {
  mkdirSync(join(racine, '.test-runtime'), { recursive: true });
  const fichier = join('.test-runtime', `${nom}.sql`);
  writeFileSync(join(racine, fichier), base === 'locale' ? marquerDernierSelect(sql) : sql);
  const resultat = base === 'locale'
    ? lancer(['psql', urlLocale, '-X', '-q', '-t', '-A', '-v', 'ON_ERROR_STOP=1', '-f', fichier])
    : lancer([cli, 'db', 'query', '--linked', '-o', 'json', '--file', fichier]);
  const sortie = resultat.stdout ?? '';
  if (resultat.status !== 0) {
    const message = (resultat.stderr || sortie || resultat.error?.message || '').trim();
    const aide = /unknown command|Unrecognized|unknown flag/i.test(message)
      ? '\nSUPABASE_CLI doit désigner une CLI Supabase 2.121 ou plus récente (voir README).' : '';
    throw new Error(`${base === 'locale' ? 'psql' : 'supabase db query'} a échoué :\n${message}${aide}`);
  }
  if (base === 'locale') return lireResultat(sortie);
  const debut = [sortie.indexOf('{'), sortie.indexOf('[')].filter((i) => i >= 0);
  if (!debut.length) return [];
  const json = JSON.parse(sortie.slice(Math.min(...debut)));
  return Array.isArray(json) ? json : json.rows ?? [];
}
