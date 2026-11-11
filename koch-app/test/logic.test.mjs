import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAmount, fmtAmount, shoppingList, amountText, matchDishes, sharedWith, mondayOf, isoWeek, lastCooked } from '../js/logic.js';

const dishes = [
  { id: 'a', name: 'Bolognese', servings: 2, ingredients: [
    { name: 'Hackfleisch', amount: 600, unit: 'g' }, { name: 'Zwiebel', amount: 1, unit: 'Stück' },
    { name: 'Salz', amount: null, unit: '' }, { name: 'Gehackte Tomaten', amount: 1, unit: 'Dose' }] },
  { id: 'b', name: 'Chili', servings: 2, ingredients: [
    { name: 'hackfleisch ', amount: 0.5, unit: 'kg' }, { name: 'Gehackte Tomaten', amount: 0.5, unit: 'Dose' },
    { name: 'Reis', amount: 150, unit: 'g' }] },
];
const byId = id => dishes.find(d => d.id === id);

test('Mengen lesen', () => {
  assert.equal(parseAmount('1,5'), 1.5);
  assert.equal(parseAmount('1/2'), 0.5);
  assert.equal(parseAmount(''), null);
  assert.equal(parseAmount('etwas'), null);
});

test('Mengen anzeigen', () => {
  assert.equal(fmtAmount(1100, 'g'), '1,1 kg');
  assert.equal(fmtAmount(2, 'Dose'), '2 Dosen');
  assert.equal(fmtAmount(1, 'Dose'), '1 Dose');
});

test('Einkaufsliste zählt gleiche Zutaten zusammen und rechnet kg in g', () => {
  const list = shoppingList([{ dishId: 'a', servings: 2 }, { dishId: 'b', servings: 2 }], byId, ['salz']);
  const hack = list.find(i => i.key === 'hackfleisch');
  assert.equal(amountText(hack), '1,1 kg');
  assert.deepEqual(hack.dishes, ['Bolognese', 'Chili']);
  // 1,5 Dosen werden aufgerundet
  assert.equal(amountText(list.find(i => i.key === 'gehackte tomaten')), '2 Dosen');
  assert.equal(list.find(i => i.key === 'salz').staple, true);
});

test('Einkaufsliste rechnet auf Portionen um', () => {
  const list = shoppingList([{ dishId: 'a', servings: 4 }], byId);
  assert.equal(amountText(list.find(i => i.key === 'hackfleisch')), '1,2 kg');
});

test('Resteküche findet Zutaten am Wortanfang, aber nicht mitten im Wort', () => {
  const hits = matchDishes(dishes, ['hack'], ['salz']);
  assert.deepEqual(hits.map(r => r.dish.id).sort(), ['a', 'b']);
  assert.equal(matchDishes(dishes, ['ei']).length, 0); // nicht „Reis“
  assert.deepEqual(matchDishes(dishes, ['tomate'])[0].hits, ['Gehackte Tomaten']);
  // Salz ist Vorrat und fehlt deshalb nicht
  assert.ok(!matchDishes(dishes, ['hack'], ['salz']).find(r => r.dish.id === 'a').missing.includes('Salz'));
  // Vorrat ist auch kein Treffer: „Sa“ findet nicht das Salz
  assert.equal(matchDishes(dishes, ['sa'], ['salz']).length, 0);
});

test('Gemeinsame Zutaten ohne Vorrat', () => {
  assert.deepEqual(sharedWith(dishes[1], [dishes[0]], ['salz']), ['hackfleisch', 'Gehackte Tomaten']);
});

test('Datum: Montag und Kalenderwoche', () => {
  assert.equal(mondayOf('2026-11-08'), '2026-11-02'); // Sonntag
  assert.equal(mondayOf('2026-11-02'), '2026-11-02');
  assert.equal(isoWeek('2026-11-02'), 45);
  assert.equal(isoWeek('2027-01-01'), 53);
});

test('Zuletzt gekocht zählt nur bis heute, ohne Tag ab Wochenende', () => {
  const weeks = {
    '2026-10-19': [{ dishId: 'a', day: '2026-10-20' }],
    '2026-10-26': [{ dishId: 'a', day: '2026-10-30' }, { dishId: 'b', day: null }],
    '2026-11-02': [{ dishId: 'a', day: '2026-11-05' }, { dishId: 'c', day: null }],
  };
  assert.equal(lastCooked(weeks, 'a', '2026-11-02'), 3);
  assert.equal(lastCooked(weeks, 'b', '2026-11-02'), 1); // Sonntag 1.11.
  assert.equal(lastCooked(weeks, 'c', '2026-11-02'), null); // diese Woche, noch nicht dran
});

test('Rezeptdatei fügt hinzu und überspringt gleichnamige Gerichte', async () => {
  const { mergeDishes } = await import('../js/logic.js');
  let n = 0;
  const incoming = [{ id: 'x', name: ' bolognese ', ingredients: [] }, { id: 'y', name: 'Ramen', ingredients: [] },
    { id: 'z', name: 'Ramen', ingredients: [] }, { name: '', ingredients: [] }];
  const r = mergeDishes(dishes, incoming, () => `neu-${++n}`);
  assert.equal(r.added, 1);
  assert.equal(r.skipped, 3);
  assert.deepEqual(r.dishes.map(d => d.id), ['a', 'b', 'neu-1']);
  assert.equal(incoming[1].id, 'y'); // Eingabe bleibt unverändert
});

test('Als gekocht markiert zählt das Kochdatum', () => {
  const weeks = { '2026-11-02': [{ dishId: 'c', day: null, cooked: '2026-11-03' }] };
  assert.equal(lastCooked(weeks, 'c', '2026-11-05'), 2); // nicht erst Sonntag
  assert.equal(lastCooked({}, 'd', '2026-11-05', ['2026-10-30', '2026-11-04']), 1); // ohne Plan, nur Verlauf
});

test('Nach dem Einkauf fehlt nur der Rest', async () => {
  const { boughtAmounts, stillNeeded } = await import('../js/logic.js');
  const item = { key: 'hack', amounts: { g: 500, Dose: 0.5 } };
  const bought = boughtAmounts(item);
  assert.deepEqual(bought, { g: 500, Dose: 1 });
  assert.equal(stillNeeded(item, bought), null);
  assert.deepEqual(stillNeeded({ ...item, amounts: { g: 750, Dose: 1 } }, bought).amounts, { g: 250 });
  assert.equal(stillNeeded({ key: 'salz', amounts: {} }, {}), null); // ohne Menge: gekauft ist gekauft
});

test('Zutaten landen im passenden Supermarkt-Bereich', async () => {
  const { categoryOf, groupByCategory } = await import('../js/logic.js');
  assert.equal(categoryOf('Tomaten'), 'obst');
  assert.equal(categoryOf('Gehackte Tomaten'), 'konserven');
  assert.equal(categoryOf('Paprikapulver'), 'gewuerze');
  assert.equal(categoryOf('Hähnchenbrust'), 'fleisch');
  assert.equal(categoryOf('Reis'), 'trocken');
  assert.equal(categoryOf('Eier'), 'kuehl');
  assert.equal(categoryOf('Klopapier'), 'sonst');
  assert.equal(categoryOf('Kokosmilch', { kokosmilch: 'kuehl' }), 'kuehl'); // eigene Zuordnung geht vor
  const groups = groupByCategory([{ n: 'Reis' }, { n: 'Zwiebel' }, { n: 'Lachs' }], x => x.n);
  assert.deepEqual(groups.map(g => g.id), ['obst', 'fleisch', 'trocken']);
});

test('Resteküche: am besten passende Gerichte zuerst, komplett passende markiert', () => {
  // Bolognese braucht Hack, Zwiebel, Tomaten (Salz ist Vorrat), Chili Hack, Tomaten, Reis
  const r = matchDishes(dishes, ['Hackfleisch', 'Gehackte Tomaten', 'Reis'], ['salz']);
  assert.deepEqual(r.map(x => x.dish.id), ['b', 'a']);
  assert.equal(r[0].complete, true);
  assert.equal(r[1].complete, false);
  assert.ok(Math.abs(r[1].share - 2 / 3) < 1e-9);
});
