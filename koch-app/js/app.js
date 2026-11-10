import { UNITS, keyOf, parseAmount, fmtAmount, shoppingList, amountText, matchDishes, sharedWith, knownIngredients, mergeDishes, RECIPE_FILE_KIND, CATEGORIES, categoryOf, groupByCategory, boughtAmounts, stillNeeded,
  ingredientCounts, iso, fromIso, addDays, mondayOf, weekDays, isoWeek, lastCooked } from './logic.js';
import { SAMPLE_DISHES, DEFAULT_STAPLES, demoWeeks } from './seed.js';
import { parseRecipeText, SAMPLE_RECIPE_TEXT } from './import.js';

const $app = document.getElementById('app');
const params = new URLSearchParams(location.search);
// Demo-Modus (Adresse mit ?demo): eigene Testdaten mit Beispielgerichten, getrennt von den echten Daten.
const DEMO = params.has('demo');
// Präfix "koch:", weil die Putzplan-App unter derselben Adresse liegt und denselben Speicher sieht.
const KEY = DEMO ? 'koch:demo' : 'koch:data';
// Bei jeder Veröffentlichung hochzählen.
const APP_VERSION = '0.7';
const WD = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
const NAV = [['week', 'calendar_month', 'Woche'], ['shop', 'shopping_cart', 'Einkauf'],
  ['dishes', 'menu_book', 'Gerichte'], ['find', 'kitchen', 'Resteküche']];
const FAST = 30; // Minuten für den Filter „schnell“

const today = () => iso(new Date());
const ui = {
  view: NAV.some(([v]) => v === params.get('view')) ? params.get('view') : 'week',
  week: mondayOf(today()),
  sheet: null, // { type: 'entry' | 'pick' | 'dish' | 'edit' | 'paste' | 'pantry', ... }
  dishSearch: '', dishSort: 'name', boughtOpen: false, pickSearch: '', pickFast: false, findFast: false,
  pasteText: '', // Rezepttext zum Erkennen
  have: [], // Resteküche: was noch da ist
  toast: null, focus: null,
};
let data; // wird ganz unten geladen, wenn alle Hilfsfunktionen stehen

// ---------- Daten ----------

// weeks: { montag: [{ id, dishId, servings, day }] }. Gerichte gehören zur Woche, ein Tag ist optional (day = null).
function emptyData() {
  return { version: 2, dishes: [], staples: [...DEFAULT_STAPLES], weeks: {}, shop: {}, categories: {} };
}
function load() {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY));
    if (stored?.dishes) return migrate({ ...emptyData(), ...stored });
  } catch { /* kaputte oder fehlende Daten: neu anfangen */ }
  const fresh = emptyData();
  if (DEMO) {
    fresh.dishes = structuredClone(SAMPLE_DISHES);
    fresh.weeks = demoWeeks(mondayOf(today()));
  }
  return fresh;
}
// Version 0.1 hatte einen Plan je Tag (plan[datum]); daraus werden Wochengerichte mit festem Tag
function migrate(d) {
  if (d.plan) {
    for (const [date, entry] of Object.entries(d.plan)) {
      if (entry?.dishId) (d.weeks[mondayOf(date)] ??= []).push({ id: uid(), dishId: entry.dishId, servings: entry.servings ?? 2, day: date });
    }
    delete d.plan;
    d.version = 2;
  }
  return d;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { toast('Speichern hat nicht geklappt'); }
}

const uid = () => (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`);
const dishById = id => data.dishes.find(d => d.id === id);
const cookedAgo = dish => lastCooked(data.weeks, dish.id, today(), dish.cooked);
const weekEntries = week => (data.weeks[week] ?? []).filter(e => dishById(e.dishId));
const entryById = (week, id) => data.weeks[week]?.find(e => e.id === id);
const inWeek = (week, dishId) => weekEntries(week).some(e => e.dishId === dishId);

// Gericht in die Woche aufnehmen oder wieder herausnehmen
function toggleInWeek(week, dish) {
  const list = data.weeks[week] ??= [];
  const at = list.findIndex(e => e.dishId === dish.id);
  if (at >= 0) list.splice(at, 1);
  else list.push({ id: uid(), dishId: dish.id, servings: dish.servings || 2, day: null });
  return at < 0;
}

// Einkaufszustand je Woche: im Wagen, „hab ich noch“, leere Vorratszutaten, eigene Zusätze.
// bought: nach „Einkauf erledigt“ ausgeblendet, gemerkt mit der damaligen Menge. Braucht man später mehr, taucht es wieder auf.
function shopState(week, create = false) {
  const blank = { done: {}, have: {}, need: {}, extra: [], bought: {} };
  if (create && !data.shop[week]) data.shop[week] = blank;
  const st = data.shop[week] ?? blank;
  st.bought ??= {};
  return st;
}
function shopGroups(week) {
  const s = shopState(week);
  const items = shoppingList(weekEntries(week), dishById, data.staples);
  const wanted = items.filter(i => (!i.staple || s.need[i.key]) && !s.have[i.key]);
  return {
    s, items,
    buy: wanted.map(i => stillNeeded(i, s.bought[i.key])).filter(Boolean),
    boughtItems: wanted.filter(i => s.bought[i.key]),
    extras: s.extra.filter(x => !x.bought),
    boughtExtras: s.extra.filter(x => x.bought),
    staples: items.filter(i => i.staple && !s.need[i.key] && !s.have[i.key]),
    have: items.filter(i => s.have[i.key]),
  };
}
const openCount = g => g.buy.filter(i => !g.s.done[i.key]).length + g.extras.filter(x => !x.done).length;

// ---------- Formatierung ----------

const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const icon = name => `<span class="ms" aria-hidden="true">${name}</span>`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const weekday = s => WD[(fromIso(s).getDay() + 6) % 7];
const fmtShort = s => `${weekday(s)} ${fromIso(s).getDate()}.`;
// „Heute gekocht“, „Gestern gekocht“, sonst „Gekocht am Mo 9.11.“
const cookedText = s => s === today() ? 'Heute gekocht' : s === addDays(today(), -1) ? 'Gestern gekocht'
  : `Gekocht am ${weekday(s)} ${fromIso(s).getDate()}.${fromIso(s).getMonth() + 1}.`;
const ago = days => days == null ? 'noch nie gekocht' : days === 0 ? 'zuletzt heute'
  : days === 1 ? 'zuletzt gestern' : `zuletzt vor ${days} Tagen`;
const linkify = text => esc(text).replace(/https?:\/\/[^\s<]+/g, url => `<a href="${url}" target="_blank" rel="noopener">${url}</a>`);

function weekRange(week) {
  const a = fromIso(week), b = fromIso(addDays(week, 6));
  const month = d => d.toLocaleDateString('de-DE', { month: 'long' });
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}.–${b.getDate()}. ${month(b)}`
    : `${a.getDate()}. ${month(a)} – ${b.getDate()}. ${month(b)}`;
}
function weekName(week) {
  const current = mondayOf(today());
  if (week === current) return 'Diese Woche';
  if (week === addDays(current, 7)) return 'Nächste Woche';
  if (week === addDays(current, -7)) return 'Letzte Woche';
  return `KW ${isoWeek(week)}`;
}

// ---------- Ansichten ----------

function render() {
  const active = document.activeElement;
  const keep = active?.id && $app.contains(active) ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const sheetScroll = $app.querySelector('.sheet-body')?.scrollTop ?? 0;
  const views = { week: viewWeek, shop: viewShop, dishes: viewDishes, find: viewFind };

  $app.innerHTML = `
    <main class="page">
      ${DEMO ? '<p class="demo">Demo-Modus · Testdaten, getrennt von deinen echten Gerichten</p>' : ''}
      ${views[ui.view]()}
    </main>
    ${viewNav()}
    ${ui.sheet ? viewSheet() : ''}
    ${ui.toast ? `<div class="toast" role="status" style="animation-delay:${ui.toast.at - Date.now()}ms">${esc(ui.toast.text)}</div>` : ''}
    <datalist id="ing-list">${knownIngredients(data.dishes, data.staples).map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <input type="file" id="import-file" accept="application/json,.json" hidden>`;

  const body = $app.querySelector('.sheet-body');
  if (ui.sheet?.fresh) ui.sheet.fresh = false;
  else if (body) body.scrollTop = sheetScroll;

  const target = ui.focus ? { id: ui.focus } : keep;
  ui.focus = null;
  const el = target && document.getElementById(target.id);
  if (el) {
    el.focus({ preventScroll: true });
    if (target.start != null) try { el.setSelectionRange(target.start, target.end); } catch { /* z. B. Zahlenfeld */ }
  }
}

function viewNav() {
  const open = openCount(shopGroups(ui.week));
  return `<nav class="tabs">${NAV.map(([view, ic, label]) => `
    <button class="${ui.view === view ? 'on' : ''}" data-action="go" data-view="${view}">
      ${icon(ic)}<span>${label}</span>
      ${view === 'shop' && open ? `<i class="badge num">${open}</i>` : ''}
    </button>`).join('')}</nav>`;
}

function weekNav() {
  const back = ui.week !== mondayOf(today());
  return `<div class="weeknav">
    <button class="icon-btn" data-action="week" data-dir="-1" aria-label="Woche zurück">${icon('chevron_left')}</button>
    <button class="weeknav-label" data-action="week-today" ${back ? '' : 'disabled'}>
      <b>${weekName(ui.week)}</b><small>${weekRange(ui.week)}${back ? ' · zurück zu heute' : ''}</small>
    </button>
    <button class="icon-btn" data-action="week" data-dir="1" aria-label="Woche vor">${icon('chevron_right')}</button>
  </div>`;
}

function viewWeek() {
  const entries = weekEntries(ui.week);
  const open = openCount(shopGroups(ui.week));
  let lead;
  if (!data.dishes.length) {
    lead = `<div class="empty-card">
      <p>Leg zuerst ein paar Gerichte an, die du gern kochst. Dann kannst du sie hier auf die Tage verteilen.</p>
      <button class="btn primary" data-action="go" data-view="dishes">${icon('menu_book')}Zu den Gerichten</button>
    </div>`;
  } else if (entries.length) {
    lead = `<button class="summary" data-action="go" data-view="shop">
      ${icon('shopping_cart')}
      <span><b>${open ? `${plural(open, 'Sache', 'Sachen')} einkaufen` : 'Alles eingekauft'}</b>
      <small>${plural(entries.length, 'Gericht', 'Gerichte')} geplant</small></span>
      ${icon('chevron_right')}
    </button>`;
  } else {
    lead = `<p class="hint">${icon('lightbulb')}<span>Was möchtest du diese Woche kochen? Füg Gerichte hinzu, die Einkaufsliste entsteht dann von selbst. Einen Tag festlegen kannst du, musst du aber nicht.</span></p>`;
  }
  // Gerichte mit festem Tag nach Tag sortiert, die offenen danach in der Reihenfolge des Hinzufügens
  // Schon Gekochtes rutscht nach unten
  const sorted = [...entries].sort((a, b) => !!a.cooked - !!b.cooked
    || ((a.day ?? '9') < (b.day ?? '9') ? -1 : (a.day ?? '9') > (b.day ?? '9') ? 1 : 0));
  return `<header class="top"><h1>Essensplan</h1></header>
    ${weekNav()}
    ${lead}
    ${sorted.length ? `<div class="days">${sorted.map(entryCard).join('')}</div>` : ''}
    ${data.dishes.length ? `<button class="add-row" data-action="pick">${icon('add')}${entries.length ? 'Weiteres Gericht' : 'Gerichte für die Woche wählen'}</button>` : ''}`;
}

function entryCard(entry) {
  const t = today();
  const dish = dishById(entry.dishId);
  const meta = [dish.minutes && `${dish.minutes} Min.`, plural(entry.servings, 'Portion', 'Portionen')].filter(Boolean);
  const cls = ['day', entry.day === t && 'today', entry.day && entry.day < t && 'past', entry.cooked && 'cooked'].filter(Boolean).join(' ');
  if (entry.cooked) meta.unshift(`<em class="cooked-tag">${icon('check_circle')}${cookedText(entry.cooked)}</em>`);
  return `<button class="${cls}" data-action="entry" data-id="${entry.id}">
    <span class="day-date">${entry.day
      ? `<small>${entry.day === t ? 'Heute' : weekday(entry.day)}</small><b class="num">${fromIso(entry.day).getDate()}</b>`
      : `<span class="open-day">${icon('restaurant')}</span>`}</span>
    <span class="day-body"><b>${esc(dish.name)}</b><small>${meta.join(' · ')}</small></span>
    ${icon('chevron_right')}
  </button>`;
}

function viewShop() {
  const g = shopGroups(ui.week);
  const { s } = g;
  const header = `<header class="top"><h1>Einkauf</h1>
    ${g.buy.length || g.extras.length ? `<span class="top-actions">
      <button class="icon-btn" data-action="cats" aria-label="Bereiche zuordnen">${icon('category')}</button>
      <button class="icon-btn" data-action="share" aria-label="Liste teilen">${icon('ios_share')}</button></span>` : ''}
  </header>${weekNav()}`;

  if (!g.items.length && !s.extra.length) {
    return `${header}<div class="empty-card">
      <p>Für diese Woche ist noch nichts geplant. Sobald Gerichte im Plan stehen, sammelt sich hier alles, was du dafür brauchst.</p>
      <button class="btn primary" data-action="go" data-view="week">${icon('calendar_month')}Zum Essensplan</button>
    </div>${extraForm()}`;
  }

  const total = g.buy.length + g.extras.length;
  const done = total - openCount(g);
  // Nach Supermarkt-Bereichen, im Bereich Offenes zuerst
  const isDone = x => (x.key ? !!s.done[x.key] : !!x.done);
  const sections = groupByCategory([...g.buy, ...g.extras], x => x.name, data.categories).map(sec =>
    `<h3 class="cat-head">${esc(sec.name)}<small>${sec.items.filter(x => !isDone(x)).length || '✓'}</small></h3>
    <div class="list">${[...sec.items].sort((a, b) => isDone(a) - isDone(b)).map(x => x.key ? itemRow(x, s) : extraRow(x)).join('')}</div>`).join('');
  const boughtCount = g.boughtItems.length + g.boughtExtras.length;
  const started = done > 0 || g.have.length > 0 || boughtCount > 0;

  return `${header}
    ${total ? `<div class="progress"><div class="bar"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
      <small class="num">${done} von ${total} im Wagen</small></div>` : ''}
    ${started || !total ? '' : `<p class="hint">${icon('lightbulb')}<span>Schau vorher kurz in Kühlschrank und Schrank: Was noch da ist, tippst du auf <b>Hab ich</b>.</span></p>`}
    ${!total && boughtCount ? `<div class="empty-card done-card">${icon('check_circle')}<p><b>Alles eingekauft.</b> Kommt diese Woche noch etwas dazu, steht es wieder hier.</p></div>` : ''}
    ${sections}
    ${done ? `<button class="btn primary wide" data-action="shop-finish">${icon('check_circle')}Einkauf erledigt</button>
      <p class="small muted center">Blendet ${plural(done, 'abgehakte Sache', 'abgehakte Sachen')} aus. Der Rest bleibt auf der Liste.</p>` : ''}
    ${extraForm()}
    ${g.staples.length ? `<h2>Vorrat prüfen</h2>
      <p class="small muted">Brauchst du auch, hast du aber meist da. Tippe an, was leer ist.</p>
      <div class="chips">${g.staples.map(i => `<button class="chip" data-action="need" data-key="${esc(i.key)}">${icon('add')}${esc(i.name)}</button>`).join('')}</div>` : ''}
    ${g.have.length ? `<h2>Schon zu Hause</h2>
      <div class="list">${g.have.map(i => `<div class="item have">
        <span class="item-main">${icon('check')}<span class="item-text"><b>${esc(i.name)}</b><small>${esc(amountText(i))}</small></span></span>
        <button class="item-side ghost" data-action="unhave" data-key="${esc(i.key)}">Doch kaufen</button>
      </div>`).join('')}</div>` : ''}
    ${boughtCount ? `<div class="bought ${ui.boughtOpen ? 'open' : ''}"><button class="bought-head" data-action="toggle" data-key="boughtOpen" aria-expanded="${!!ui.boughtOpen}">${icon('shopping_cart')}Eingekauft (${boughtCount})</button>
      ${ui.boughtOpen ? `<div class="list">${[
        ...g.boughtItems.map(i => [i.name, amountText({ amounts: g.s.bought[i.key] }), `data-action="unbuy" data-key="${esc(i.key)}"`]),
        ...g.boughtExtras.map(x => [x.name, 'selbst dazugeschrieben', `data-action="unbuy-extra" data-id="${x.id}"`]),
      ].map(([name, sub, attrs]) => `<div class="item have">
        <span class="item-main">${icon('check')}<span class="item-text"><b>${esc(name)}</b><small>${esc(sub)}</small></span></span>
        <button class="item-side ghost" ${attrs}>Zurückholen</button>
      </div>`).join('')}</div>` : ''}</div>` : ''}`;
}

function itemRow(i, s) {
  const done = !!s.done[i.key];
  const sub = [amountText(i) && (i.more ? `noch ${amountText(i)} dazu` : amountText(i)), i.dishes.join(', ')].filter(Boolean).join(' · ');
  const side = i.staple
    ? `<button class="item-side ghost" data-action="unneed" data-key="${esc(i.key)}">Doch da</button>`
    : `<button class="item-side" data-action="have" data-key="${esc(i.key)}">Hab ich</button>`;
  return `<div class="item ${done ? 'done' : ''}">
    <button class="item-main" data-action="toggle-done" data-key="${esc(i.key)}" aria-pressed="${done}">
      <span class="ms tick" aria-hidden="true">${done ? 'check_circle' : 'radio_button_unchecked'}</span>
      <span class="item-text"><b>${esc(i.name)}</b><small>${esc(sub)}</small></span>
    </button>
    ${done ? '' : side}
  </div>`;
}

function extraRow(x) {
  return `<div class="item ${x.done ? 'done' : ''}">
    <button class="item-main" data-action="extra-done" data-id="${x.id}" aria-pressed="${!!x.done}">
      <span class="ms tick" aria-hidden="true">${x.done ? 'check_circle' : 'radio_button_unchecked'}</span>
      <span class="item-text"><b>${esc(x.name)}</b><small>selbst dazugeschrieben</small></span>
    </button>
    <button class="icon-btn" data-action="extra-remove" data-id="${x.id}" aria-label="Entfernen">${icon('close')}</button>
  </div>`;
}

const extraForm = () => `<form class="inline-form" data-form="extra">
  <input id="extra-input" name="extra" placeholder="Noch etwas dazu, z. B. Milch" autocomplete="off" enterkeyhint="done">
  <button class="icon-btn filled" aria-label="Hinzufügen">${icon('add')}</button>
</form>`;

function viewDishes() {
  const q = keyOf(ui.dishSearch);
  const list = data.dishes
    .filter(d => !q || keyOf(d.name).includes(q) || d.tags?.some(t => keyOf(t).includes(q))
      || d.ingredients.some(i => keyOf(i.name).includes(q)))
    .sort((a, b) => (ui.dishSort === 'name' ? 0 : (b.rating?.[ui.dishSort] ?? 0) - (a.rating?.[ui.dishSort] ?? 0))
      || a.name.localeCompare(b.name, 'de'));
  const header = `<header class="top"><h1>Gerichte</h1>
    <span class="top-actions">
      <button class="btn small" data-action="paste-open">${icon('content_paste')}Einfügen</button>
      <button class="btn primary small" data-action="new-dish">${icon('add')}Neu</button>
    </span></header>`;
  const more = `<h2>Mehr</h2>
    <div class="menu">
      <button data-action="pantry">${icon('inventory_2')}<span><b>Vorrat</b><small>${plural(data.staples.length, 'Zutat', 'Zutaten')}, die du meist im Haus hast</small></span>${icon('chevron_right')}</button>
      <button data-action="export">${icon('download')}<span><b>Daten sichern</b><small>Als Datei speichern, z. B. in iCloud Drive</small></span></button>
      <button data-action="import">${icon('upload')}<span><b>Datei laden</b><small>Sicherung ersetzt die Daten, Rezeptdatei fügt Gerichte hinzu</small></span></button>
    </div>
    <p class="small muted center">Kochplan ${APP_VERSION} · Deine Daten liegen nur auf diesem Gerät.</p>`;

  if (!data.dishes.length) {
    return `${header}<div class="empty-card">
      <p>Hier sammelst du Gerichte, die du gern kochst: mit Zutaten und Dauer. Daraus entstehen dein Wochenplan und die Einkaufsliste.</p>
      <div class="btn-row">
        <button class="btn primary" data-action="new-dish">${icon('add')}Erstes Gericht anlegen</button>
        <button class="btn" data-action="paste-open">${icon('photo_camera')}Aus Foto-Text</button>
        <button class="btn" data-action="samples">Mit ${SAMPLE_DISHES.length} Beispielen starten</button>
      </div>
    </div>${more}`;
  }
  return `${header}
    <label class="search">${icon('search')}<input id="dish-search" type="search" data-bind="dishSearch" value="${esc(ui.dishSearch)}"
      placeholder="Gericht, Zutat oder Schlagwort" autocomplete="off"></label>
    <div class="chips sort">${[['name', 'A–Z'], ['taste', 'Am leckersten'], ['ease', 'Am einfachsten']].map(([k, label]) =>
      `<button class="chip ${ui.dishSort === k ? 'on' : ''}" data-action="sort" data-sort="${k}">${label}</button>`).join('')}</div>
    <div class="list">${list.map(dishRow).join('') || '<p class="muted center pad">Nichts gefunden.</p>'}</div>
    ${more}`;
}

function dishRow(d) {
  const meta = [d.minutes && `${d.minutes} Min.`, ago(cookedAgo(d))];
  const rated = ratingText(d);
  return `<button class="card-row" data-action="dish" data-id="${d.id}">
    <span class="card-text"><b>${esc(d.name)}</b><small>${esc(meta.filter(Boolean).join(' · '))}</small>
      ${rated.length ? `<small class="rated">${icon('star')}${rated.join(' · ')}</small>` : ''}
      ${d.tags?.length ? `<span class="tags">${d.tags.map(t => `<i>${esc(t)}</i>`).join('')}</span>` : ''}</span>
    ${icon('chevron_right')}
  </button>`;
}

function viewFind() {
  const haveKeys = ui.have.map(keyOf);
  const suggestions = ingredientCounts(data.dishes)
    .filter(c => !data.staples.includes(c.key) && !haveKeys.includes(c.key)).slice(0, 10);
  const results = matchDishes(data.dishes, ui.have, data.staples)
    .filter(r => !ui.findFast || (r.dish.minutes ?? 0) <= FAST);

  let out;
  if (!ui.have.length) {
    out = `<p class="hint">${icon('lightbulb')}<span>Trag ein, was weg muss oder noch da ist. Du siehst dann, welche deiner Gerichte das nutzen und was noch fehlt.</span></p>`;
  } else if (!results.length) {
    out = `<p class="muted center pad">Keins deiner Gerichte nutzt ${ui.have.length > 1 ? 'diese Zutaten' : 'diese Zutat'}${ui.findFast ? ` in bis zu ${FAST} Minuten` : ''}.</p>`;
  } else {
    out = `<div class="list">${results.map(r => `<button class="card-row match" data-action="dish" data-id="${r.dish.id}">
      <span class="card-text"><b>${esc(r.dish.name)}</b>
        <small>${r.dish.minutes ? `${r.dish.minutes} Min. · ` : ''}${esc(ago(cookedAgo(r.dish)))}</small>
        <small class="hits">${icon('check')}${esc(r.hits.join(', '))}</small>
        <small class="${r.missing.length ? 'miss' : 'hits'}">${r.missing.length ? `Fehlt: ${esc(r.missing.join(', '))}` : 'Sonst alles da (außer Vorrat)'}</small>
      </span>${icon('chevron_right')}
    </button>`).join('')}</div>`;
  }

  return `<header class="top"><h1>Resteküche</h1></header>
    <form class="inline-form" data-form="have">
      <input id="have-input" name="have" list="ing-list" placeholder="Was ist noch da? z. B. Hackfleisch" autocomplete="off" enterkeyhint="done">
      <button class="icon-btn filled" aria-label="Hinzufügen">${icon('add')}</button>
    </form>
    ${ui.have.length ? `<div class="chips">${ui.have.map((h, i) => `<button class="chip on" data-action="have-remove" data-i="${i}">${esc(h)}${icon('close')}</button>`).join('')}
      <button class="chip ${ui.findFast ? 'on' : ''}" data-action="toggle" data-key="findFast">${icon('schedule')}bis ${FAST} Min.</button></div>` : ''}
    ${suggestions.length ? `<p class="small muted">Häufig in deinen Gerichten:</p>
      <div class="chips">${suggestions.map(c => `<button class="chip" data-action="have-add" data-name="${esc(c.name)}">${esc(c.name)}</button>`).join('')}</div>` : ''}
    ${out}`;
}

// ---------- Fenster (Bottom Sheets) ----------

function viewSheet() {
  const s = ui.sheet;
  const content = { entry: sheetEntry, pick: sheetPick, dish: sheetDish, edit: sheetEdit, paste: sheetPaste, pantry: sheetPantry, rate: sheetRate, cats: sheetCats }[s.type]();
  return `<div class="sheet-wrap ${s.fresh ? 'enter' : ''} ${['edit', 'paste'].includes(s.type) ? 'top' : ''}" data-action="backdrop">
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(content.title)}">
      <header><h2>${esc(content.title)}</h2>
        <button class="icon-btn" data-action="close" aria-label="Schließen">${icon('close')}</button></header>
      <div class="sheet-body">${content.body}</div>
    </section>
  </div>`;
}

function ingredientList(dish, servings = dish.servings) {
  const factor = (servings || 1) / (dish.servings || 1);
  return `<ul class="ings">${dish.ingredients.map(i => `<li>
    <span>${esc(i.name)}${data.staples.includes(keyOf(i.name)) ? ' <i class="tag-vorrat">Vorrat</i>' : ''}</span>
    <span class="num muted">${esc(i.amount ? fmtAmount(i.amount * factor, i.unit) : '')}</span>
  </li>`).join('')}</ul>`;
}

function sheetEntry() {
  const { week, id } = ui.sheet;
  const entry = entryById(week, id);
  const dish = entry && dishById(entry.dishId);
  if (!dish) return { title: 'Gericht', body: '<p class="muted">Dieses Gericht steht nicht mehr im Plan.</p>' };
  const t = today();
  return {
    title: dish.name,
    body: `${dish.minutes ? `<p class="muted">${icon('schedule')} ${dish.minutes} Minuten</p>` : ''}
      ${cookedBlock(entry.cooked)}
      <h4>Tag (optional)</h4>
      <div class="chips">
        <button class="chip ${entry.day ? '' : 'on'}" data-action="entry-day" data-day="">Irgendwann</button>
        ${weekDays(week).map(d => `<button class="chip ${entry.day === d ? 'on' : ''}" data-action="entry-day" data-day="${d}">${d === t ? 'Heute' : fmtShort(d)}</button>`).join('')}
      </div>
      <div class="stepper">
        <span>Portionen</span>
        <button class="icon-btn" data-action="servings" data-delta="-1" aria-label="Weniger" ${entry.servings <= 1 ? 'disabled' : ''}>${icon('remove')}</button>
        <b class="num">${entry.servings}</b>
        <button class="icon-btn" data-action="servings" data-delta="1" aria-label="Mehr">${icon('add')}</button>
      </div>
      ${ingredientList(dish, entry.servings)}
      ${dish.notes ? `<p class="notes">${linkify(dish.notes)}</p>` : ''}
      <div class="btn-row">
        <button class="btn" data-action="dish" data-id="${dish.id}">${icon('menu_book')}Zum Gericht</button>
        <button class="btn ghost danger" data-action="entry-remove">${icon('delete')}Aus der Woche nehmen</button>
      </div>`,
  };
}

// Mehrere Gerichte für die Woche an- und abwählen. Gewählte stehen oben, darunter Vorschläge.
function sheetPick() {
  const { week } = ui.sheet;
  const chosen = weekEntries(week).map(e => dishById(e.dishId));
  const q = keyOf(ui.pickSearch);
  const rows = data.dishes
    .filter(d => !q || keyOf(d.name).includes(q) || d.ingredients.some(i => keyOf(i.name).includes(q)))
    .filter(d => !ui.pickFast || (d.minutes ?? 0) <= FAST)
    .map(d => {
      const shared = sharedWith(d, chosen.filter(o => o.id !== d.id), data.staples);
      const days = cookedAgo(d);
      // Oben: teilt Zutaten mit dem schon Gewählten, lange nicht gekocht
      const score = shared.length * 3 + (days == null ? 2 : Math.min(days, 28) / 7);
      return { d, shared, days, score, on: chosen.some(c => c.id === d.id) };
    })
    .sort((a, b) => b.score - a.score || a.d.name.localeCompare(b.d.name, 'de'));

  const row = ({ d, shared, days, on }) => `<button class="card-row ${on ? 'chosen' : ''}" data-action="pick-toggle" data-id="${d.id}" aria-pressed="${on}">
    <span class="card-text"><b>${esc(d.name)}</b>
      <small>${esc([d.minutes && `${d.minutes} Min.`, ago(days)].filter(Boolean).join(' · '))}</small>
      ${shared.length ? `<small class="hits">Nutzt auch: ${esc(shared.join(', '))}</small>` : ''}
    </span><span class="ms pick-mark" aria-hidden="true">${on ? 'check_circle' : 'add'}</span>
  </button>`;
  const on = rows.filter(r => r.on), off = rows.filter(r => !r.on);

  return {
    title: `${weekName(week)}: Was kochst du?`,
    body: `<label class="search">${icon('search')}<input id="pick-search" type="search" data-bind="pickSearch"
        value="${esc(ui.pickSearch)}" placeholder="Gericht oder Zutat" autocomplete="off"></label>
      <div class="chips">
        <button class="chip ${ui.pickFast ? 'on' : ''}" data-action="toggle" data-key="pickFast">${icon('schedule')}bis ${FAST} Min.</button>
      </div>
      ${on.length ? `<h4>Gewählt</h4><div class="list">${on.map(row).join('')}</div>` : ''}
      ${off.length ? `<h4>${on.length ? 'Passt gut dazu' : 'Deine Gerichte'}</h4>
        ${on.length && off.some(r => r.shared.length) ? '<p class="small muted">Oben stehen Gerichte, die Zutaten mit deiner Auswahl teilen.</p>' : ''}
        <div class="list">${off.map(row).join('')}</div>` : ''}
      ${rows.length ? '' : '<p class="muted center pad">Kein passendes Gericht.</p>'}
      <div class="btn-row">
        <button class="btn primary" data-action="close">${icon('check')}Fertig${chosen.length ? ` · ${plural(chosen.length, 'Gericht', 'Gerichte')}` : ''}</button>
        <button class="btn ghost" data-action="new-dish">${icon('add')}Neues Gericht</button>
      </div>`,
  };
}

function sheetDish() {
  const dish = dishById(ui.sheet.id);
  if (!dish) return { title: 'Gericht', body: '<p class="muted">Dieses Gericht gibt es nicht mehr.</p>' };
  const current = mondayOf(today());
  const weeks = [[current, 'Diese Woche'], [addDays(current, 7), 'Nächste Woche']];
  const meta = [dish.minutes && `${icon('schedule')} ${dish.minutes} Min.`, `${icon('group')} ${plural(dish.servings, 'Portion', 'Portionen')}`,
    esc(ago(cookedAgo(dish)))];
  return {
    title: dish.name,
    body: `<p class="meta muted">${meta.filter(Boolean).join('<span class="sep"></span>')}</p>
      ${dish.tags?.length ? `<p class="tags">${dish.tags.map(x => `<i>${esc(x)}</i>`).join('')}</p>` : ''}
      ${cookedBlock(dish.cooked?.includes(today()) ? today() : null)}
      <h4>Bewertung</h4>
      ${ratingRows(dish)}
      <h4>Zutaten</h4>
      ${dish.ingredients.length ? ingredientList(dish) : '<p class="muted">Noch keine Zutaten eingetragen.</p>'}
      ${dish.notes ? `<h4>Notizen</h4><p class="notes">${linkify(dish.notes)}</p>` : ''}
      <h4>Einplanen</h4>
      <div class="chips">${weeks.map(([w, label]) => {
        const on = inWeek(w, dish.id);
        return `<button class="chip ${on ? 'on' : ''}" data-action="plan-dish" data-week="${w}" aria-pressed="${on}">${icon(on ? 'check' : 'add')}${label}</button>`;
      }).join('')}</div>
      <div class="btn-row">
        <button class="btn" data-action="edit-dish">${icon('edit')}Bearbeiten</button>
        <button class="btn ghost danger" data-action="delete-dish">${icon('delete')}Löschen</button>
      </div>`,
  };
}

// Bewertung: dish.rating = { taste: 1–5, ease: 1–5 }
const RATING = {
  taste: { label: 'Geschmack', short: 'Lecker', words: ['Noch nicht bewertet', 'Geht so', 'Okay', 'Gut', 'Sehr gut', 'Lieblingsgericht'] },
  ease: { label: 'Einfachheit', short: 'Einfach', words: ['Noch nicht bewertet', 'Sehr aufwendig', 'Aufwendig', 'Mittel', 'Einfach', 'Ganz einfach'] },
};
const isRated = dish => !!(dish.rating?.taste && dish.rating?.ease);
function ratingRows(dish) {
  return Object.entries(RATING).map(([kind, r]) => {
    const value = dish.rating?.[kind] ?? 0;
    return `<div class="rate-row">
      <span class="rate-label"><b>${r.label}</b><small>${r.words[value]}</small></span>
      <span class="stars">${[1, 2, 3, 4, 5].map(n => `<button class="${n <= value ? 'on' : 'off'}" data-action="rate" data-kind="${kind}" data-value="${n}"
        aria-label="${r.label} ${n} von 5">${icon('star')}</button>`).join('')}</span>
    </div>`;
  }).join('');
}
const ratingText = dish => Object.entries(RATING).filter(([k]) => dish.rating?.[k]).map(([k, r]) => `${r.short} ${dish.rating[k]}/5`);

// Bereiche zuordnen: alles, was gerade auf der Liste steht, mit Auswahl des Bereichs. Gilt dauerhaft für die Zutat.
function sheetCats() {
  const g = shopGroups(ui.week);
  const names = [...new Map([...g.buy, ...g.extras].map(x => [keyOf(x.name), x.name])).values()];
  const groups = groupByCategory(names, n => n, data.categories);
  return {
    title: 'Bereiche zuordnen',
    body: `<p class="muted">Steht etwas im falschen Bereich? Wähl den richtigen aus. Die App merkt sich das für diese Zutat.</p>
      ${groups.map(sec => `<h4>${esc(sec.name)}</h4>
        <div class="list">${sec.items.map(n => `<label class="item cat-row"><span class="item-text"><b>${esc(n)}</b></span>
          <select data-cat="${esc(keyOf(n))}">${CATEGORIES.map(([id, label]) =>
            `<option value="${id}" ${id === sec.id ? 'selected' : ''}>${label}</option>`).join('')}</select></label>`).join('')}</div>`).join('')}`,
  };
}

function sheetRate() {
  const dish = dishById(ui.sheet.id);
  return {
    title: 'Wie war’s?',
    body: `<p class="muted">Du hast <b>${esc(dish.name)}</b> zum ersten Mal gekocht. Wie hat es geschmeckt, und wie einfach ging es?</p>
      ${ratingRows(dish)}
      <div class="btn-row">
        <button class="btn primary" data-action="close" ${isRated(dish) ? '' : 'disabled'}>${icon('check')}Fertig</button>
        <button class="btn ghost" data-action="close">Später</button>
      </div>`,
  };
}

// Großer Knopf „Gerade gekocht“, danach die Bestätigung mit Rückgängig
function cookedBlock(cookedOn) {
  if (!cookedOn) return `<button class="btn primary wide" data-action="cooked">${icon('check_circle')}Gerade gekocht</button>`;
  return `<div class="cooked-note">${icon('check_circle')}<span>${cookedText(cookedOn)}</span>
    <button class="btn small ghost" data-action="uncook">Rückgängig</button></div>`;
}

const blankIngredient = () => ({ amount: '', unit: 'g', name: '' });

function sheetEdit() {
  const d = ui.sheet.draft;
  return {
    title: d.id ? 'Gericht bearbeiten' : 'Neues Gericht',
    body: `<form class="edit" data-form="dish" autocomplete="off">
      ${d.imported ? `<p class="hint">${icon('lightbulb')}<span>Aus dem Text erkannt. Prüf kurz Name, Mengen und Zutaten, bevor du speicherst.</span></p>` : ''}
      <label class="field"><span>Name</span><input id="f-name" data-draft="name" value="${esc(d.name)}" placeholder="z. B. Linsencurry"></label>
      <div class="row2">
        <label class="field"><span>Dauer in Minuten</span><input id="f-minutes" data-draft="minutes" inputmode="numeric" value="${esc(d.minutes)}" placeholder="30"></label>
        <label class="field"><span>Portionen</span><input id="f-servings" data-draft="servings" inputmode="numeric" value="${esc(d.servings)}"></label>
      </div>
      <fieldset class="ing-edit"><legend>Zutaten</legend>
        ${d.ingredients.map((i, n) => `<div class="ing-row">
          <input id="ing-amount-${n}" class="amt" data-ing="${n}" data-prop="amount" inputmode="decimal" placeholder="Menge" value="${esc(i.amount)}" aria-label="Menge">
          <select id="ing-unit-${n}" data-ing="${n}" data-prop="unit" aria-label="Einheit">${UNITS.map(u => `<option ${u === i.unit ? 'selected' : ''}>${u}</option>`).join('')}</select>
          <input id="ing-name-${n}" data-ing="${n}" data-prop="name" list="ing-list" placeholder="Zutat" value="${esc(i.name)}" aria-label="Zutat" enterkeyhint="next">
          <button type="button" class="icon-btn" data-action="ing-remove" data-i="${n}" aria-label="Zutat entfernen">${icon('close')}</button>
        </div>`).join('')}
        <button type="button" class="btn ghost" data-action="ing-add">${icon('add')}Zutat</button>
        <p class="small muted">Ohne Menge geht auch, z. B. für Salz. Gleiche Zutaten immer gleich schreiben, dann zählt die Einkaufsliste sie zusammen.</p>
      </fieldset>
      <label class="field"><span>Schlagworte</span><input id="f-tags" data-draft="tags" value="${esc(d.tags)}" placeholder="z. B. schnell, vegetarisch"></label>
      <label class="field"><span>Notizen oder Link zum Rezept</span><textarea id="f-notes" data-draft="notes" rows="3">${esc(d.notes)}</textarea></label>
      <button class="btn primary wide" type="submit">${icon('check')}Speichern</button>
    </form>`,
  };
}

function sheetPaste() {
  return {
    title: 'Rezept aus Foto-Text',
    body: `<ol class="how">
        <li>Foto vom Rezept machen, oder einen Screenshot.</li>
        <li>In Fotos lange auf den Text tippen, <b>Alle auswählen</b>, dann <b>Kopieren</b>.</li>
        <li>Hier einfügen und auf <b>Erkennen</b> tippen. Danach prüfst du das Formular kurz.</li>
      </ol>
      <textarea id="paste-text" class="paste" data-ui="pasteText" rows="9" placeholder="Rezepttext hier einfügen">${esc(ui.pasteText)}</textarea>
      <div class="btn-row">
        ${navigator.clipboard?.readText ? `<button class="btn" data-action="paste-clipboard">${icon('content_paste')}Aus Zwischenablage</button>` : ''}
        ${DEMO ? `<button class="btn ghost" data-action="paste-sample">Beispieltext</button>` : ''}
      </div>
      <button class="btn primary wide" data-action="paste-parse">${icon('check')}Erkennen</button>`,
  };
}

// Erkanntes Rezept als Entwurf ins Formular. Bekannte Zutaten bekommen die schon benutzte Schreibweise.
function draftFromText(text) {
  const r = parseRecipeText(text);
  const known = new Map(knownIngredients(data.dishes, data.staples).map(n => [keyOf(n), n]));
  const amount = a => a == null ? '' : String(Math.round(a * 100) / 100).replace('.', ',');
  return {
    imported: true, name: r.name, minutes: r.minutes ? String(r.minutes) : '', servings: String(r.servings ?? 2),
    tags: '', notes: r.notes,
    ingredients: [...r.ingredients.map(i => ({ amount: amount(i.amount), unit: i.unit || 'g', name: known.get(keyOf(i.name)) ?? i.name })),
      blankIngredient()],
  };
}

function sheetPantry() {
  const names = knownIngredients(data.dishes, data.staples);
  return {
    title: 'Vorrat',
    body: `<p class="muted">Was du meist im Haus hast, steht nicht automatisch auf der Einkaufsliste. Du siehst es dort unter „Vorrat prüfen“ und tippst an, was leer ist.</p>
      <div class="chips">${names.map(n => {
        const on = data.staples.includes(keyOf(n));
        return `<button class="chip ${on ? 'on' : ''}" data-action="staple" data-key="${esc(keyOf(n))}" aria-pressed="${on}">${on ? icon('check') : ''}${esc(n)}</button>`;
      }).join('')}</div>`,
  };
}

// ---------- Aktionen ----------

function toast(text) {
  ui.toast = { text, at: Date.now() };
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { ui.toast = null; render(); }, 2600);
}
const openSheet = sheet => { ui.sheet = { ...sheet, fresh: true }; };
const commit = () => { save(); render(); };

function draftFrom(dish) {
  if (!dish) return { name: '', minutes: '', servings: '2', tags: '', notes: '', ingredients: [blankIngredient(), blankIngredient(), blankIngredient()] };
  return {
    id: dish.id, name: dish.name, minutes: dish.minutes ? String(dish.minutes) : '', servings: String(dish.servings ?? 2),
    tags: (dish.tags ?? []).join(', '), notes: dish.notes ?? '',
    ingredients: [...dish.ingredients.map(i => ({
      amount: i.amount != null ? String(i.amount).replace('.', ',') : '', unit: i.unit || 'g', name: i.name,
    })), blankIngredient()],
  };
}

function saveDish() {
  const { draft: d, planWeek } = ui.sheet;
  const name = d.name.trim();
  if (!name) { ui.focus = 'f-name'; toast('Bitte gib dem Gericht einen Namen'); render(); return; }
  const dish = {
    id: d.id ?? uid(), name,
    minutes: parseInt(d.minutes, 10) || null,
    servings: Math.max(1, parseInt(d.servings, 10) || 2),
    tags: d.tags.split(',').map(t => t.trim()).filter(Boolean),
    notes: d.notes.trim(),
    ingredients: d.ingredients.filter(i => i.name.trim()).map(i => {
      const amount = parseAmount(i.amount);
      return { name: i.name.trim(), amount, unit: amount == null ? '' : i.unit };
    }),
  };
  const at = data.dishes.findIndex(x => x.id === dish.id);
  if (at >= 0) data.dishes[at] = dish; else data.dishes.push(dish);
  if (planWeek) {
    // Aus der Wochenauswahl heraus angelegt: gleich mit auswählen und zurück zur Auswahl
    if (!inWeek(planWeek, dish.id)) toggleInWeek(planWeek, dish);
    openSheet({ type: 'pick', week: planWeek });
    toast('Gespeichert und für die Woche gewählt');
  } else {
    openSheet({ type: 'dish', id: dish.id });
    toast('Gespeichert');
  }
  commit();
}

function exportData() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `kochplan-${today()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function importData(file) {
  try {
    const parsed = JSON.parse(await file.text());
    if (!Array.isArray(parsed?.dishes)) throw new Error('keine Gerichte');
    if (parsed.kind === RECIPE_FILE_KIND) { addRecipes(parsed.dishes); return; }
    if (!confirm(`Sicherung mit ${plural(parsed.dishes.length, 'Gericht', 'Gerichten')} laden? Die jetzigen Daten auf diesem Gerät werden ersetzt.`)) return;
    data = { ...emptyData(), ...parsed };
    save();
    toast('Sicherung geladen');
  } catch {
    toast('Diese Datei ist keine Kochplan-Sicherung');
  }
  render();
}

// Rezeptdatei: Gerichte kommen dazu, Wochen, Einkauf und Vorrat bleiben unberührt
function addRecipes(incoming) {
  const result = mergeDishes(data.dishes, incoming, uid);
  if (!result.added) { toast('Diese Gerichte hast du schon alle'); render(); return; }
  if (!confirm(`${plural(result.added, 'Gericht', 'Gerichte')} hinzufügen? Deine bisherigen Gerichte und Wochen bleiben erhalten.`)) { render(); return; }
  data.dishes = result.dishes;
  ui.view = 'dishes';
  toast(`${plural(result.added, 'Gericht', 'Gerichte')} hinzugefügt${result.skipped ? `, ${result.skipped} schon vorhanden` : ''}`);
  commit();
}

function shareList() {
  const g = shopGroups(ui.week);
  const open = [...g.buy.filter(i => !g.s.done[i.key]), ...g.extras.filter(x => !x.done)];
  const lines = groupByCategory(open, x => x.name, data.categories).flatMap(sec => ['', sec.name,
    ...sec.items.map(x => `• ${x.name}${x.amounts && amountText(x) ? ` – ${amountText(x)}` : ''}`)]);
  const text = `Einkauf ${weekRange(ui.week)}\n${lines.join('\n')}`;
  if (navigator.share) navigator.share({ text }).catch(() => { /* abgebrochen */ });
  else navigator.clipboard?.writeText(text).then(() => { toast('Liste kopiert'); render(); });
}

const actions = {
  go: el => { ui.view = el.dataset.view; ui.sheet = null; render(); scrollTo(0, 0); },
  week: el => { ui.week = addDays(ui.week, 7 * Number(el.dataset.dir)); render(); },
  'week-today': () => { ui.week = mondayOf(today()); render(); },
  close: () => { ui.sheet = null; render(); },
  backdrop: (el, e) => { if (e.target === el) actions.close(); },
  toggle: el => { ui[el.dataset.key] = !ui[el.dataset.key]; render(); },

  // Woche
  pick: () => { ui.pickSearch = ''; openSheet({ type: 'pick', week: ui.week }); render(); },
  'pick-toggle': el => { toggleInWeek(ui.sheet.week, dishById(el.dataset.id)); commit(); },
  cooked: () => {
    const t = today();
    // Aus dem Plan: diesen Eintrag. Aus den Gerichten: den noch offenen Eintrag dieser Woche, falls es einen gibt.
    const entry = ui.sheet.type === 'entry' ? entryById(ui.sheet.week, ui.sheet.id)
      : weekEntries(mondayOf(t)).find(e => e.dishId === ui.sheet.id && !e.cooked);
    const dish = dishById(entry?.dishId ?? ui.sheet.id);
    dish.cooked = [...(dish.cooked ?? []), t];
    if (entry) entry.cooked = t;
    toast('Als gekocht gespeichert');
    // Noch nicht bewertet: gleich fragen, wie es war
    if (!isRated(dish)) openSheet({ type: 'rate', id: dish.id });
    commit();
  },
  rate: el => {
    const dish = dishById(ui.sheet.id);
    dish.rating = { ...dish.rating, [el.dataset.kind]: Number(el.dataset.value) };
    commit();
  },
  sort: el => { ui.dishSort = el.dataset.sort; render(); },
  uncook: () => {
    const entry = ui.sheet.type === 'entry' ? entryById(ui.sheet.week, ui.sheet.id)
      : weekEntries(mondayOf(today())).find(e => e.dishId === ui.sheet.id && e.cooked === today());
    const dish = dishById(entry?.dishId ?? ui.sheet.id);
    const date = entry?.cooked ?? today();
    const at = (dish.cooked ?? []).lastIndexOf(date);
    if (at >= 0) dish.cooked.splice(at, 1);
    if (entry) delete entry.cooked;
    commit();
  },
  entry: el => { openSheet({ type: 'entry', week: ui.week, id: el.dataset.id }); render(); },
  'entry-day': el => { entryById(ui.sheet.week, ui.sheet.id).day = el.dataset.day || null; commit(); },
  servings: el => {
    const entry = entryById(ui.sheet.week, ui.sheet.id);
    entry.servings = Math.max(1, entry.servings + Number(el.dataset.delta));
    commit();
  },
  'entry-remove': () => {
    const { week, id } = ui.sheet;
    data.weeks[week] = data.weeks[week].filter(e => e.id !== id);
    ui.sheet = null;
    commit();
  },

  // Einkauf
  'toggle-done': el => { const s = shopState(ui.week, true); s.done[el.dataset.key] = !s.done[el.dataset.key]; commit(); },
  have: el => { shopState(ui.week, true).have[el.dataset.key] = true; commit(); },
  unhave: el => { delete shopState(ui.week, true).have[el.dataset.key]; commit(); },
  need: el => { shopState(ui.week, true).need[el.dataset.key] = true; commit(); },
  unneed: el => { delete shopState(ui.week, true).need[el.dataset.key]; commit(); },
  'extra-done': el => { const x = shopState(ui.week).extra.find(y => y.id === el.dataset.id); x.done = !x.done; commit(); },
  'extra-remove': el => { const s = shopState(ui.week); s.extra = s.extra.filter(y => y.id !== el.dataset.id); commit(); },
  share: shareList,
  cats: () => { openSheet({ type: 'cats' }); render(); },
  'shop-finish': () => {
    const g = shopGroups(ui.week);
    let n = 0;
    for (const i of g.buy) if (g.s.done[i.key]) {
      // Bei „noch dazu“ addiert sich der Nachkauf zum ersten Einkauf
      const now = boughtAmounts(i), before = g.s.bought[i.key] ?? {};
      for (const [unit, amount] of Object.entries(before)) now[unit] = (now[unit] ?? 0) + amount;
      g.s.bought[i.key] = now; delete g.s.done[i.key]; n++;
    }
    for (const x of g.extras) if (x.done) { x.bought = true; n++; }
    toast(`Einkauf erledigt: ${plural(n, 'Sache', 'Sachen')} ausgeblendet`);
    commit();
  },
  unbuy: el => { delete shopState(ui.week, true).bought[el.dataset.key]; commit(); },
  'unbuy-extra': el => { const x = shopState(ui.week).extra.find(y => y.id === el.dataset.id); x.bought = false; x.done = false; commit(); },

  // Gerichte
  dish: el => { openSheet({ type: 'dish', id: el.dataset.id }); render(); },
  'new-dish': () => {
    // Aus der Wochenauswahl heraus angelegt: danach gleich für diese Woche wählen
    const planWeek = ui.sheet?.type === 'pick' ? ui.sheet.week : null;
    openSheet({ type: 'edit', draft: draftFrom(null), planWeek });
    ui.focus = 'f-name';
    render();
  },
  'edit-dish': () => { openSheet({ type: 'edit', draft: draftFrom(dishById(ui.sheet.id)) }); render(); },
  'delete-dish': () => {
    const dish = dishById(ui.sheet.id);
    if (!confirm(`„${dish.name}“ löschen? Es verschwindet auch aus dem Essensplan.`)) return;
    data.dishes = data.dishes.filter(d => d.id !== dish.id);
    for (const week of Object.keys(data.weeks)) data.weeks[week] = data.weeks[week].filter(e => e.dishId !== dish.id);
    ui.sheet = null;
    toast('Gelöscht');
    commit();
  },
  'plan-dish': el => {
    const week = el.dataset.week;
    const added = toggleInWeek(week, dishById(ui.sheet.id));
    toast(`${added ? 'Eingeplant für' : 'Herausgenommen aus'} ${weekName(week) === 'Diese Woche' ? 'diese Woche' : 'nächste Woche'}`);
    commit();
  },
  'ing-add': () => {
    const list = ui.sheet.draft.ingredients;
    list.push(blankIngredient());
    ui.focus = `ing-name-${list.length - 1}`;
    render();
  },
  'ing-remove': el => {
    const list = ui.sheet.draft.ingredients;
    list.splice(Number(el.dataset.i), 1);
    if (!list.length) list.push(blankIngredient());
    render();
  },
  'paste-open': () => { openSheet({ type: 'paste' }); render(); },
  'paste-clipboard': async () => {
    try {
      ui.pasteText = await navigator.clipboard.readText();
      render();
    } catch {
      toast('Tippe lange ins Feld und wähle „Einfügen“');
      ui.focus = 'paste-text';
      render();
    }
  },
  'paste-sample': () => { ui.pasteText = SAMPLE_RECIPE_TEXT; render(); },
  'paste-parse': () => {
    if (!ui.pasteText.trim()) { toast('Erst einen Rezepttext einfügen'); ui.focus = 'paste-text'; render(); return; }
    const draft = draftFromText(ui.pasteText);
    const found = draft.ingredients.length - 1;
    if (!draft.name && !found) { toast('Darin habe ich kein Rezept erkannt'); render(); return; }
    ui.pasteText = '';
    openSheet({ type: 'edit', draft });
    toast(`${plural(found, 'Zutat', 'Zutaten')} erkannt`);
    render();
  },
  samples: () => {
    data.dishes.push(...structuredClone(SAMPLE_DISHES).filter(s => !dishById(s.id)));
    toast('Beispiele geladen. Ändern oder löschen kannst du sie jederzeit.');
    commit();
  },
  pantry: () => { openSheet({ type: 'pantry' }); render(); },
  staple: el => {
    const key = el.dataset.key;
    data.staples = data.staples.includes(key) ? data.staples.filter(k => k !== key) : [...data.staples, key];
    commit();
  },
  export: exportData,
  import: () => document.getElementById('import-file').click(),

  // Resteküche
  'have-add': el => { addHave(el.dataset.name); render(); },
  'have-remove': el => { ui.have.splice(Number(el.dataset.i), 1); render(); },
};

function addHave(text) {
  for (const name of String(text).split(',').map(t => t.trim()).filter(Boolean)) {
    if (!ui.have.some(h => keyOf(h) === keyOf(name))) ui.have.push(name);
  }
}

const forms = {
  extra: form => {
    const name = form.extra.value.trim();
    if (!name) return;
    shopState(ui.week, true).extra.push({ id: uid(), name, done: false });
    ui.focus = 'extra-input';
    commit();
  },
  have: form => {
    addHave(form.have.value);
    ui.focus = 'have-input';
    render();
  },
  dish: saveDish,
};

$app.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el || el.disabled) return;
  actions[el.dataset.action]?.(el, e);
});

$app.addEventListener('submit', e => {
  e.preventDefault();
  forms[e.target.dataset.form]?.(e.target);
});

// Eingaben: Suchfelder zeichnen neu, das Formular merkt sich nur den Entwurf (kein Neuzeichnen beim Tippen)
function onInput(e) {
  const el = e.target;
  if (el.dataset.bind) { ui[el.dataset.bind] = el.value; render(); return; }
  if (el.dataset.ui) { ui[el.dataset.ui] = el.value; return; }
  const draft = ui.sheet?.draft;
  if (!draft) return;
  if (el.dataset.draft) draft[el.dataset.draft] = el.value;
  else if (el.dataset.ing) draft.ingredients[Number(el.dataset.ing)][el.dataset.prop] = el.value;
}
$app.addEventListener('input', onInput);
$app.addEventListener('change', e => {
  if (e.target.id === 'import-file' && e.target.files[0]) importData(e.target.files[0]);
  else if (e.target.dataset.cat) {
    // Eigene Zuordnung nur merken, wenn sie von der automatischen abweicht
    const key = e.target.dataset.cat;
    data.categories ??= {};
    delete data.categories[key];
    if (categoryOf(key) !== e.target.value) data.categories[key] = e.target.value;
    toast('Bereich gemerkt');
    commit();
  }
  else if (e.target.tagName === 'SELECT') onInput(e);
});

// Enter in einer Zutatenzeile springt zur nächsten (und legt am Ende eine neue an), statt zu speichern
$app.addEventListener('keydown', e => {
  if (e.key === 'Escape' && ui.sheet) { actions.close(); return; }
  const el = e.target;
  if (e.key !== 'Enter' || !el.dataset?.ing) return;
  e.preventDefault();
  const n = Number(el.dataset.ing);
  if (n === ui.sheet.draft.ingredients.length - 1) actions['ing-add']();
  else document.getElementById(`ing-name-${n + 1}`)?.focus();
});

// Offline-Fähigkeit nur auf GitHub Pages, lokal würde der Cache beim Entwickeln stören
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => { /* ohne Offline-Cache geht es auch */ });
}

data = load();
save(); // umgestellte Daten aus 0.1 gleich im neuen Format sichern
render();
