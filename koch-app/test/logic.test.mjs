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
  assert.equal(categoryOf('Klopapier'), 'haushalt');
  assert.equal(categoryOf('Batterien'), 'sonst');
  assert.equal(categoryOf('Zuckerschoten'), 'obst'); // nicht „Zucker“
  assert.equal(categoryOf('Grüne Bohnen'), 'obst'); // frisch, nicht Dose
  assert.equal(categoryOf('Räuchertofu'), 'kuehl');
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

test('Markt-Tag aus „Gibt\'s hier nicht“', async () => {
  const { storeTag } = await import('../js/logic.js');
  const rewe = { name: 'Rewe', missing: { lachs: true } }, lidl = { name: 'Lidl', missing: {} };
  assert.equal(storeTag([rewe, lidl], 'lachs'), 'nur Lidl');
  assert.equal(storeTag([rewe, lidl], 'reis'), '');
  assert.equal(storeTag([rewe], 'lachs'), ''); // ein Markt allein: kein Tag
  assert.equal(storeTag([rewe, { name: 'Lidl', missing: { lachs: true } }], 'lachs'), 'in keinem Markt');
});

test('Schnell anpassen: Mengen in sinnvollen Schritten', async () => {
  const { stepAmount } = await import('../js/logic.js');
  assert.equal(stepAmount(1, 'Zehe', 1), 2);
  assert.equal(stepAmount(1, 'Zehe', -1), 1); // nicht unter einen Schritt
  assert.equal(stepAmount(150, 'g', 1), 200);
  assert.equal(stepAmount(100, 'g', -1), 90);
  assert.equal(stepAmount(30, 'g', -1), 20);
  assert.equal(stepAmount(1, 'EL', 1), 1.5);
});

test('Gerichte nach Eiweißquelle und Status filtern', async () => {
  const { proteinsOf, filterDishes } = await import('../js/logic.js');
  const ing = (...names) => names.map(name => ({ name, amount: 1, unit: 'Stück' }));
  const curry = { id: 'c', name: 'Curry', minutes: 30, ingredients: ing('Hähnchenbrust', 'Reis') };
  const chili = { id: 'h', name: 'Chili', minutes: 45, ingredients: ing('Rinderhackfleisch', 'Kidneybohnen') };
  const dal = { id: 'd', name: 'Dal', minutes: 20, rating: { taste: 5 }, ingredients: ing('Rote Linsen', 'Möhre') };
  const pasta = { id: 'p', name: 'Garnelen-Pasta', minutes: 20, ingredients: ing('Garnelen', 'Spaghetti') };
  assert.deepEqual([...proteinsOf(curry)], ['gefluegel']);
  assert.deepEqual([...proteinsOf(dal)], ['veggie']);
  assert.deepEqual([...proteinsOf(pasta)], ['fisch']);
  const all = [curry, chili, dal, pasta];
  const ids = (f, opts) => filterDishes(all, f, opts).map(d => d.id);
  assert.deepEqual(ids(['gefluegel', 'rind']), ['c', 'h']); // oder innerhalb der Gruppe
  assert.deepEqual(ids(['veggie', 'fast']), ['d']); // und zwischen den Gruppen
  assert.deepEqual(ids(['cooked'], { cookedAgo: d => d.id === 'h' ? 3 : null }), ['h']);
  assert.deepEqual(ids(['new'], { cookedAgo: d => d.id === 'h' ? 3 : null }), ['c', 'd', 'p']);
  assert.deepEqual(ids(['top']), ['d']);
});

test('Wochenvorschlag mischt Eiweißquellen und meidet gerade Gekochtes', async () => {
  const { suggestWeek } = await import('../js/logic.js');
  const ing = (...names) => names.map(name => ({ name, amount: 1, unit: 'Stück' }));
  const d = (id, ...names) => ({ id, name: id, ingredients: ing(...names) });
  const dishes = [d('h1', 'Hähnchenbrust', 'Reis'), d('h2', 'Hähnchenbrust', 'Paprika'), d('h3', 'Putenbrust', 'Reis'),
    d('r1', 'Rinderhackfleisch', 'Paprika'), d('f1', 'Lachs', 'Reis'), d('v1', 'Rote Linsen', 'Möhre')];
  const opts = { random: () => 0, cookedAgo: x => x.id === 'f1' ? 2 : null };
  const ids = suggestWeek(dishes, 3, opts).map(x => x.id);
  assert.equal(ids.length, 3);
  assert.ok(!ids.includes('f1')); // vor zwei Tagen gekocht
  const poultry = ids.filter(id => id.startsWith('h')).length;
  assert.ok(poultry <= 1, `zu viel Geflügel: ${ids}`); // Mix statt dreimal Hähnchen
  // abgelehnte und schon geplante Gerichte kommen nicht wieder
  const again = suggestWeek(dishes, 2, { ...opts, fixed: [dishes[0]], skip: ['r1'] }).map(x => x.id);
  assert.ok(!again.includes('h1') && !again.includes('r1'));
});

test('Kochmodus: Schritte, Timer und Zutaten je Schritt', async () => {
  const { cookSteps, stepMinutes, ingredientsInStep } = await import('../js/logic.js');
  const { steps, info } = cookSteps('1. Reis kochen.\n2. Hähnchen in Öl 4–5 Minuten braten.\n\nPro Portion ca. 520 kcal · 42 g Eiweiß');
  assert.deepEqual(steps, ['Reis kochen.', 'Hähnchen in Öl 4–5 Minuten braten.']);
  assert.deepEqual(info, ['Pro Portion ca. 520 kcal · 42 g Eiweiß']);
  assert.equal(stepMinutes(steps[1]), 5);
  assert.equal(stepMinutes('zugedeckt 12 Min. köcheln'), 12);
  assert.equal(stepMinutes('Reis kochen.'), null);
  const ings = [{ name: 'Hähnchenbrust' }, { name: 'Reis' }, { name: 'Paprika' }];
  assert.deepEqual(ingredientsInStep(steps[1], ings).map(i => i.name), ['Hähnchenbrust']);
  assert.deepEqual(ingredientsInStep(steps[0], ings).map(i => i.name), ['Reis']);
  const more = [{ name: 'Putenbrust' }, { name: 'Cherrytomaten' }, { name: 'Rote Currypaste' }, { name: 'Rote Zwiebel' }, { name: 'Öl' }];
  assert.deepEqual(ingredientsInStep('Pute in Streifen schneiden und in Öl anbraten', more).map(i => i.name), ['Putenbrust', 'Öl']);
  assert.deepEqual(ingredientsInStep('Tomaten halbieren, Zwiebel in Spalten', more).map(i => i.name), ['Cherrytomaten', 'Rote Zwiebel']);
});
