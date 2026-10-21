// Runs the pgTAP files of supabase/tests on the test database (see
// base-de-test.mjs). `supabase db query` only returns the last result, so the
// output of every top-level select is kept in a temporary table and read just
// before the final rollback: nothing written by a test is ever committed.
//
//   node scripts/tests-base.mjs [fichier.sql ...]   all the files by default
//   node scripts/tests-base.mjs --sabotage          each rule broken on purpose
import { readFileSync, readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { base, executerSql, projetDeTest, racine } from './base-de-test.mjs';

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

const sansCommentaires = (instruction) => instruction.replace(/^(\s*--[^\n]*(\n|$))+/, '').trim();

/** Rewrites a pgTAP file so that its results are the last rows returned. */
export function preparer(sql, sabotage = '') {
  const liste = instructions(sql).map(sansCommentaires).filter(Boolean);
  if (!/^begin$/i.test(liste[0] ?? '') || !/^rollback$/i.test(liste.at(-1) ?? '')) {
    throw new Error('Un test doit commencer par begin; et finir par rollback;');
  }
  const corps = liste.slice(1, -1).map((instruction) => /^select\b/i.test(instruction)
    ? `insert into pg_temp._tap (ligne)\nselect valeur.value from (${instruction}) resultat, jsonb_each_text(to_jsonb(resultat)) valeur`
    : instruction);
  return [
    'begin',
    'create temp table _tap (id integer generated always as identity, ligne text)',
    // Tests switch to the anon and authenticated roles.
    'grant all on table pg_temp._tap to public',
    ...(sabotage ? [sabotage] : []),
    ...corps,
    'reset role',
    'select ligne from pg_temp._tap order by id',
    'rollback',
  ].join(';\n') + ';\n';
}

/** Runs one test file and returns its TAP lines and failed tests. */
export function executerTest(fichier, sabotage = '') {
  const sql = preparer(readFileSync(fichier, 'utf8'), sabotage);
  const lignes = executerSql(sql, basename(fichier, '.sql'))
    .flatMap((row) => String(row.ligne ?? '').split('\n'))
    .filter((ligne) => /^(not )?ok \d+|^#|^\d+\.\.\d+$/.test(ligne));
  const echecs = lignes.filter((ligne) => /^not ok \d+/.test(ligne) && !/# TODO/.test(ligne))
    .map((ligne) => ligne.replace(/^not ok \d+ - /, ''));
  const plan = lignes.filter((ligne) => /^# Looks like you planned/.test(ligne));
  return { lignes, echecs, plan, total: lignes.filter((ligne) => /^(not )?ok \d+/.test(ligne)).length };
}

const fichierRegles = join(racine, 'supabase', 'tests', 'regles_metier_test.sql');

// Replaces a fragment of a function, inside the test transaction only.
const remplacer = (fonction, avant, apres) => `do $sabotage$
declare definition text := pg_get_functiondef('${fonction}'::regprocedure);
begin
  if position('${avant}' in definition) = 0 then raise exception 'Sabotage sans effet sur ${fonction}'; end if;
  execute replace(definition, '${avant}', '${apres}');
end $sabotage$`;

// Each rule broken on purpose: only the tests whose description starts with
// the rule must fail.
export const sabotages = [
  { regle: 'chevauchement', explication: 'contrainte anti-chevauchement supprimée',
    sql: 'alter table public.rendez_vous drop constraint rendez_vous_sans_chevauchement' },
  { regle: 'indifférent', explication: '« indifférent » trie les coiffeurs par nom décroissant',
    sql: remplacer('public.reserver_employe(text, text, uuid, uuid, timestamptz)', 'order by (', 'order by l.employe_nom desc, (') },
  { regle: 'délai', explication: 'le délai du gérant est ignoré',
    sql: remplacer('public.modifier_mon_rendez_vous(uuid, timestamptz)', 'make_interval(hours => v_delai)', 'make_interval(hours => 0)') },
  { regle: 'accès', explication: 'tout compte connecté lit les fiches clients',
    sql: 'create policy "Sabotage" on public.clients for select to authenticated using (true)' },
];

function afficherEchecs(resultat) {
  for (const ligne of resultat.lignes) if (/^not ok|^#/.test(ligne)) console.log(`    ${ligne}`);
}

function lancerTests(fichiers) {
  let ko = 0;
  for (const fichier of fichiers) {
    // A hosted project refuses this role to the CLI: these files run on the local stack (GitHub Actions).
    if (base === 'distant' && /set\s+(local\s+)?role\s+supabase_auth_admin/i.test(readFileSync(fichier, 'utf8'))) {
      console.log(`- ${basename(fichier)} : ignoré sur le projet distant (rôle supabase_auth_admin), joué sur la pile locale`);
      continue;
    }
    try {
      const resultat = executerTest(fichier);
      const ok = resultat.total > 0 && !resultat.echecs.length && !resultat.plan.length;
      console.log(`${ok ? '✔' : '✘'} ${basename(fichier)} : ${resultat.total - resultat.echecs.length}/${resultat.total} réussis`);
      if (!ok) { ko++; afficherEchecs(resultat); }
    } catch (erreur) {
      ko++;
      console.log(`✘ ${basename(fichier)} : erreur\n    ${erreur.message.replaceAll('\n', '\n    ')}`);
    }
  }
  return ko;
}

function lancerSabotages() {
  let ko = 0;
  for (const sabotage of sabotages) {
    const resultat = executerTest(fichierRegles, sabotage.sql);
    const autres = resultat.echecs.filter((echec) => !echec.startsWith(sabotage.regle));
    const detecte = resultat.echecs.length > 0 && !autres.length;
    console.log(`${detecte ? '✔' : '✘'} ${sabotage.regle} (${sabotage.explication}) : ${resultat.echecs.length} test(s) en échec`);
    for (const echec of resultat.echecs) console.log(`    not ok - ${echec}`);
    if (!resultat.echecs.length) console.log('    Aucun test n’a vu la règle cassée.');
    if (autres.length) console.log('    Des tests d’une autre règle échouent aussi.');
    if (!detecte) ko++;
  }
  return ko;
}

if (process.argv[1] && import.meta.url.endsWith(basename(process.argv[1]))) {
  const projet = projetDeTest();
  console.log(`Base de test : ${projet ? `projet distant ${projet}` : 'pile locale'}\n`);
  const args = process.argv.slice(2);
  const dossier = join(racine, 'supabase', 'tests');
  const fichiers = args.filter((arg) => arg.endsWith('.sql'));
  const ko = args.includes('--sabotage')
    ? lancerSabotages()
    : lancerTests(fichiers.length ? fichiers : readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort().map((f) => join(dossier, f)));
  console.log(ko ? `\n${ko} en échec (base ${base}).` : '\nTout est vert.');
  process.exitCode = ko ? 1 : 0;
}
