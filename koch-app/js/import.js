// Rezepttext erkennen, z. B. per iPhone-Livetext aus einem Foto kopiert. Ohne KI, nur mit Regeln, mit Node testbar.
// Ergebnis ist ein Vorschlag fürs Formular, kein fertiges Gericht: Man prüft es danach kurz.

const FRACTIONS = { '½': 1 / 2, '¼': 1 / 4, '¾': 3 / 4, '⅓': 1 / 3, '⅔': 2 / 3, '⅛': 1 / 8 };
const UNIT_WORDS = [
  [/^(g|gr|gramm)\.?$/i, 'g'], [/^(kg|kilo|kilogramm)\.?$/i, 'kg'], [/^ml\.?$/i, 'ml'], [/^(l|liter)\.?$/i, 'l'],
  [/^(el|essl|esslöffel)\.?$/i, 'EL'], [/^(tl|teel|teelöffel)\.?$/i, 'TL'], [/^prisen?$/i, 'Prise'],
  [/^bunde?$/i, 'Bund'], [/^dosen?$/i, 'Dose'], [/^(packung|packungen|pck|pkg|päckchen|pack)\.?$/i, 'Packung'],
  [/^becher$/i, 'Becher'], [/^zehen?$/i, 'Zehe'], [/^scheiben?$/i, 'Scheibe'], [/^(stück|stk|st)\.?$/i, 'Stück'],
];
// Menge am Zeilenanfang: 200 · 1,5 · 1/2 · ½ · 1½ · 2-3
const AMOUNT_RE = /^(\d+\s*[½¼¾⅓⅔⅛]|[½¼¾⅓⅔⅛]|\d+\/\d+|\d+(?:[.,]\d+)?(?:\s*[-–]\s*\d+(?:[.,]\d+)?)?)/;
const BULLET_RE = /^[\s•·\-–*▢☐□○●◦✓✔]+/;
const INGREDIENTS_HEAD = /^(zutaten|einkaufsliste|ingredients)\b/i;
const STEPS_HEAD = /^(zubereitung|anleitung|so geht|so wird|arbeitsschritte|schritte|instructions|method)\b/i;
const META_RE = /(portion|personen|\bpers\b|min\b|minuten|\bstd\b|stunde|schwierig|kcal|kalorien|bewertung|zeit\b|zeit:)/i;

function amountOf(token) {
  const t = token.replace(/\s+/g, '');
  const mixed = t.match(/^(\d+)([½¼¾⅓⅔⅛])$/);
  if (mixed) return Number(mixed[1]) + FRACTIONS[mixed[2]];
  if (FRACTIONS[t]) return FRACTIONS[t];
  const frac = t.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[2]) ? Number(frac[1]) / Number(frac[2]) : null;
  // Bei „2-3“ lieber die größere Menge einkaufen
  const range = t.split(/[-–]/).map(x => Number(x.replace(',', '.')));
  const n = Math.max(...range);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// „1 Zwiebel, fein gewürfelt“ → „Zwiebel“, „Ingwer (ca. 2 cm)“ → „Ingwer“, „rote Linsen“ → „Rote Linsen“
function cleanName(text) {
  const name = text.replace(/\([^)]*\)/g, ' ').split(/,|;| – | - /)[0].replace(/\s+/g, ' ').trim()
    .replace(/^(von|vom|an)\s+/i, '').replace(/[.:]$/, '');
  return name ? name[0].toUpperCase() + name.slice(1) : '';
}

// Eine Zutatenzeile mit Menge; ohne Menge am Anfang null
export function parseIngredientLine(line) {
  const m = line.match(AMOUNT_RE);
  if (!m) return null;
  let rest = line.slice(m[0].length);
  if (/^[.)]/.test(rest)) return null; // „1. Zwiebel schälen“ ist ein Arbeitsschritt
  rest = rest.trim();
  let unit = '';
  const word = rest.match(/^([A-Za-zÄÖÜäöüß]+\.?)(?=\s|$)/);
  const hit = word && UNIT_WORDS.find(([re]) => re.test(word[1]));
  if (hit) { unit = hit[1]; rest = rest.slice(word[1].length).trim(); }
  return { amount: amountOf(m[0]), unit: unit || 'Stück', name: cleanName(rest) };
}

function minutesOf(text) {
  const h = text.match(/(\d+)\s*(std|stunden?|h)\b/i);
  const m = text.match(/(\d+)\s*min/i);
  const total = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return total || null;
}

// Zeilen ohne Menge im Zutatenteil: „Salz und Pfeffer“ wird zu zwei Zutaten, lange Sätze sind keine Zutat
function bareIngredients(line) {
  if (line.length > 40 || line.endsWith(':')) return [];
  return line.split(/,| und | & /).map(cleanName).filter(n => n && n.split(' ').length <= 4);
}

export function parseRecipeText(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.replace(BULLET_RE, '').trim()).filter(Boolean);
  const result = { name: '', minutes: null, servings: null, ingredients: [], notes: '' };
  const steps = [];
  const hasHead = lines.some(l => INGREDIENTS_HEAD.test(l));
  let section = hasHead ? 'intro' : 'auto';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (INGREDIENTS_HEAD.test(line)) { section = 'ingredients'; continue; }
    if (STEPS_HEAD.test(line)) { section = 'steps'; continue; }

    // Kopfdaten stehen meist oben, gelten aber überall außer in den Arbeitsschritten
    if (section !== 'steps') {
      // „4 Portionen“, „Portionen: 4“ oder „für 4“
      const servings = line.match(/(\d+)\s*(portion|personen|pers\b)/i)
        ?? line.match(/(?:portionen|personen)\s*:?\s*(\d+)/i) ?? line.match(/^für\s+(\d+)/i);
      if (servings && !result.servings) result.servings = Number(servings[1]);
      if (/zeit|dauer/i.test(line) && result.minutes == null) {
        const at = line.toLowerCase().indexOf('gesamt');
        result.minutes = minutesOf(at >= 0 ? line.slice(at) : line);
      }
      if (servings || /zeit|dauer|schwierig|kcal|kalorien/i.test(line)) continue;
    }

    if (section === 'steps') { steps.push(line); continue; }

    const ing = parseIngredientLine(line);
    if (ing && !ing.name && lines[i + 1] && !parseIngredientLine(lines[i + 1])) {
      // Livetext trennt Spalten oft: „400 ml“ in einer Zeile, „Kokosmilch“ in der nächsten
      ing.name = cleanName(lines[++i]);
    }
    if (ing?.name && (section === 'ingredients' || line.length <= 60)) { result.ingredients.push(ing); continue; }

    if (section === 'ingredients') {
      for (const name of bareIngredients(line)) result.ingredients.push({ amount: null, unit: '', name });
    } else if (!result.name && line.length <= 70 && !META_RE.test(line)) {
      result.name = line.replace(/[.:]$/, '');
    } else if (section === 'auto' && line.length > 40) {
      steps.push(line);
    }
  }
  result.notes = steps.join('\n');
  return result;
}

// Beispieltext zum Ausprobieren im Demo-Modus, aufgebaut wie ein per Livetext kopiertes Rezept
export const SAMPLE_RECIPE_TEXT = `Linsen-Dal mit Spinat
Portionen: 2
Arbeitszeit: 10 Min. · Gesamtzeit 35 Min.
Zutaten
200 g rote Linsen
1 Zwiebel, fein gewürfelt
2 Knoblauchzehen
1 Stück Ingwer (ca. 2 cm)
400 ml
Kokosmilch
1 Dose gehackte Tomaten
100 g Babyspinat
1 EL Currypulver
½ TL Kurkuma
Salz und Pfeffer
Zubereitung
1. Zwiebel, Knoblauch und Ingwer in etwas Öl anschwitzen.
2. Linsen, Gewürze, Kokosmilch und Tomaten dazugeben und 20 Minuten köcheln lassen.
3. Spinat unterheben und mit Salz und Pfeffer abschmecken.`;
