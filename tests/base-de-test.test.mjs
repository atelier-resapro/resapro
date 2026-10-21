import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { instructions, lireResultat, marquerDernierSelect, repere } from '../scripts/base-de-test.mjs';
import { preparer } from '../scripts/tests-base.mjs';

test('le découpage ignore les ; des chaînes, commentaires et blocs $$', () => {
  const sql = `select 'a;b'; -- c;d\ndo $$ begin perform 1; end $$; select $f$x;y$f$`;
  assert.deepEqual(instructions(sql).map((i) => i.trim()),
    [`select 'a;b'`, `-- c;d\ndo $$ begin perform 1; end $$`, 'select $f$x;y$f$']);
});

test('psql : seul le dernier select est marqué', () => {
  const sql = marquerDernierSelect('begin; select 1; update t set a = 1; select a from t; rollback;');
  assert.equal(sql.split(repere).length, 2);
  assert.match(sql, /from \(select a from t\) resultat;\nrollback;\n$/);
  assert.match(sql, /^begin;\nselect 1;/);
});

test('psql : le résultat est lu après le repère, ou vide sans select', () => {
  assert.deepEqual(lireResultat(`\n${repere}[{"statut": "annule"}]\n`), [{ statut: 'annule' }]);
  assert.deepEqual(lireResultat(''), []);
});

for (const fichier of readdirSync('supabase/tests').filter((f) => f.endsWith('.sql'))) {
  test(`psql : ${fichier} renvoie les lignes TAP juste avant le rollback`, () => {
    const sql = marquerDernierSelect(preparer(readFileSync(`supabase/tests/${fichier}`, 'utf8')));
    assert.equal(sql.split(repere).length, 2);
    assert.match(sql, /from \(select ligne from pg_temp\._tap order by id\) resultat;\nrollback;\n$/);
  });
}
