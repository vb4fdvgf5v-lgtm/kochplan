// Reine Logik ohne Oberfläche: Mengen, Einkaufsliste, Resteküche, Datumsrechnung. Mit Node testbar.

export const UNITS = ['g', 'kg', 'ml', 'l', 'Stück', 'EL', 'TL', 'Prise', 'Bund', 'Dose', 'Packung', 'Becher', 'Zehe', 'Scheibe'];
const PLURAL = { Dose: 'Dosen', Packung: 'Packungen', Zehe: 'Zehen', Scheibe: 'Scheiben', Prise: 'Prisen' };
// Gekauft wird nur ganz: 1,5 Dosen werden auf der Einkaufsliste 2 Dosen
const WHOLE = ['Dose', 'Packung', 'Becher', 'Bund'];
// Zum Zusammenzählen auf eine Grundeinheit bringen
const BASE = { kg: ['g', 1000], l: ['ml', 1000] };

// Zutaten werden über den Namen erkannt, unabhängig von Groß-/Kleinschreibung und Leerzeichen
export const keyOf = name => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

// "1,5", "1.5" und "1/2" werden zu Zahlen, leer oder unlesbar zu null
export function parseAmount(text) {
  const t = String(text ?? '').trim().replace(',', '.');
  if (!t) return null;
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

const num = n => n.toLocaleString('de-DE', { maximumFractionDigits: 2 });

export function fmtAmount(amount, unit) {
  if (amount == null) return '';
  if (unit === 'g' && amount >= 1000) return `${num(amount / 1000)} kg`;
  if (unit === 'ml' && amount >= 1000) return `${num(amount / 1000)} l`;
  if (unit === 'g' || unit === 'ml') amount = Math.round(amount);
  const label = amount > 1 && PLURAL[unit] ? PLURAL[unit] : unit;
  return label ? `${num(amount)} ${label}` : num(amount);
}

// Einkaufsliste aus geplanten Gerichten. entries: [{ dishId, servings }], Mengen werden auf die Portionen umgerechnet.
export function shoppingList(entries, dishById, staples = []) {
  const items = new Map();
  for (const entry of entries) {
    const dish = dishById(entry.dishId);
    if (!dish) continue;
    const factor = (entry.servings || dish.servings || 1) / (dish.servings || 1);
    for (const ing of dish.ingredients ?? []) {
      const key = keyOf(ing.name);
      if (!key) continue;
      let item = items.get(key);
      if (!item) items.set(key, item = { key, name: ing.name.trim(), amounts: {}, dishes: [], staple: staples.includes(key) });
      if (ing.amount > 0) {
        const [factorBase, base] = BASE[ing.unit] ? [BASE[ing.unit][1], BASE[ing.unit][0]] : [1, ing.unit || ''];
        item.amounts[base] = (item.amounts[base] ?? 0) + ing.amount * factor * factorBase;
      }
      if (!item.dishes.includes(dish.name)) item.dishes.push(dish.name);
    }
  }
  return [...items.values()].sort((a, b) => a.name.localeCompare(b.name, 'de'));
}

// "800 g + 1 Packung"; leer, wenn nur ohne Menge eingetragen (z. B. Salz)
export const amountText = item => Object.entries(item.amounts)
  .map(([unit, amount]) => fmtAmount(WHOLE.includes(unit) ? Math.ceil(amount - 1e-9) : amount, unit))
  .join(' + ');

// "hack" findet "Hackfleisch", "tomate" findet "Passierte Tomaten", aber "ei" nicht "Reis"
const startsWord = (key, query) => key === query || key.split(/[\s-]+/).some(w => w.startsWith(query));
export const sameIngredient = (a, b) => startsWord(a, b) || startsWord(b, a);

// Resteküche: Gerichte, die mindestens eine der vorhandenen Zutaten nutzen. Vorratszutaten zählen weder als
// Treffer (sonst findet „Paprika“ das Paprikapulver) noch als fehlend.
export function matchDishes(dishes, have, staples = []) {
  const haveKeys = have.map(keyOf).filter(Boolean);
  return dishes.map(dish => {
    const ings = (dish.ingredients ?? []).map(i => ({ key: keyOf(i.name), name: i.name.trim() }))
      .filter(i => i.key && !staples.includes(i.key));
    const hits = ings.filter(i => haveKeys.some(h => sameIngredient(i.key, h)));
    const missing = ings.filter(i => !hits.includes(i));
    return { dish, hits: hits.map(i => i.name), missing: missing.map(i => i.name) };
  })
    .filter(r => r.hits.length)
    .sort((a, b) => b.hits.length - a.hits.length || a.missing.length - b.missing.length
      || (a.dish.minutes ?? 999) - (b.dish.minutes ?? 999));
}

// Zutaten eines Gerichts, die andere geplante Gerichte auch brauchen (ohne Vorrat)
export function sharedWith(dish, others, staples = []) {
  const otherKeys = new Set(others.flatMap(o => (o.ingredients ?? []).map(i => keyOf(i.name))));
  const names = (dish.ingredients ?? []).filter(i => {
    const key = keyOf(i.name);
    return key && otherKeys.has(key) && !staples.includes(key);
  }).map(i => i.name.trim());
  return [...new Set(names)];
}

// Alle bekannten Zutatennamen für die Auswahlliste, je Zutat die zuerst gesehene Schreibweise
export function knownIngredients(dishes, staples = []) {
  const names = new Map();
  for (const dish of dishes) for (const i of dish.ingredients ?? []) {
    const key = keyOf(i.name);
    if (key && !names.has(key)) names.set(key, i.name.trim());
  }
  for (const key of staples) if (!names.has(key)) names.set(key, key[0].toUpperCase() + key.slice(1));
  return [...names.values()].sort((a, b) => a.localeCompare(b, 'de'));
}

// Wie viele Gerichte eine Zutat nutzen, häufigste zuerst
export function ingredientCounts(dishes) {
  const counts = new Map();
  for (const dish of dishes) {
    const seen = new Set();
    for (const i of dish.ingredients ?? []) {
      const key = keyOf(i.name);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const c = counts.get(key) ?? { key, name: i.name.trim(), count: 0 };
      c.count++;
      counts.set(key, c);
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'de'));
}

// ---------- Datum (lokale Kalendertage als "JJJJ-MM-TT") ----------

export const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const fromIso = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (s, n) => { const d = fromIso(s); d.setDate(d.getDate() + n); return iso(d); };
export const mondayOf = s => addDays(s, -((fromIso(s).getDay() + 6) % 7));
export const weekDays = monday => Array.from({ length: 7 }, (_, i) => addDays(monday, i));
export const daysBetween = (a, b) => Math.round((fromIso(b) - fromIso(a)) / 864e5);

export function isoWeek(s) {
  const d = fromIso(s);
  d.setDate(d.getDate() + 3 - (d.getDay() + 6) % 7); // Donnerstag derselben Woche
  const jan4 = new Date(d.getFullYear(), 0, 4);
  return 1 + Math.round(((d - jan4) / 864e5 - 3 + (jan4.getDay() + 6) % 7) / 7);
}

// Vor wie vielen Tagen das Gericht zuletzt dran war (bis heute), sonst null.
// weeks: { montag: [{ dishId, day, cooked }] }. Als gekocht markiert zählt dieses Datum, sonst der feste Tag,
// ohne festen Tag der Sonntag der Woche. history: Tage, an denen das Gericht als gekocht markiert wurde.
export function lastCooked(weeks, dishId, today, history = []) {
  let last = null;
  const consider = date => { if (date && date <= today && (!last || date > last)) last = date; };
  for (const [monday, entries] of Object.entries(weeks)) for (const e of entries ?? []) {
    if (e.dishId === dishId) consider(e.cooked ?? e.day ?? addDays(monday, 6));
  }
  history.forEach(consider);
  return last ? daysBetween(last, today) : null;
}

// Rezeptdatei ({ kind: 'kochplan-rezepte', dishes }) zu den vorhandenen Gerichten hinzufügen.
// Gleichnamige Gerichte werden übersprungen, jedes neue bekommt eine eigene ID.
export const RECIPE_FILE_KIND = 'kochplan-rezepte';
export function mergeDishes(existing, incoming, makeId) {
  const names = new Set(existing.map(d => keyOf(d.name)));
  const added = [];
  for (const d of incoming) {
    const key = keyOf(d?.name);
    if (!key || names.has(key) || !Array.isArray(d.ingredients)) continue;
    names.add(key);
    added.push({ ...structuredClone(d), id: makeId() });
  }
  return { dishes: [...existing, ...added], added: added.length, skipped: incoming.length - added.length };
}

// Nach „Einkauf erledigt“: was wurde gekauft (Mengen wie auf der Liste, ganze Dosen/Packungen aufgerundet)
export const boughtAmounts = item => Object.fromEntries(Object.entries(item.amounts)
  .map(([unit, amount]) => [unit, WHOLE.includes(unit) ? Math.ceil(amount - 1e-9) : amount]));

// Was nach dem Einkauf noch fehlt: null, wenn genug gekauft wurde, sonst die Zutat mit der Restmenge
export function stillNeeded(item, bought) {
  if (!bought) return item;
  const rest = {};
  for (const [unit, amount] of Object.entries(item.amounts)) {
    const left = amount - (bought[unit] ?? 0);
    if (left > 1e-9) rest[unit] = left;
  }
  return Object.keys(rest).length ? { ...item, amounts: rest, more: true } : null;
}
