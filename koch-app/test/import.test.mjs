import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseIngredientLine, parseRecipeText, SAMPLE_RECIPE_TEXT } from '../js/import.js';

test('Zutatenzeilen', () => {
  assert.deepEqual(parseIngredientLine('200 g rote Linsen'), { amount: 200, unit: 'g', name: 'Rote Linsen' });
  assert.deepEqual(parseIngredientLine('200g Mehl'), { amount: 200, unit: 'g', name: 'Mehl' });
  assert.deepEqual(parseIngredientLine('½ TL Kurkuma'), { amount: 0.5, unit: 'TL', name: 'Kurkuma' });
  assert.deepEqual(parseIngredientLine('1½ Liter Milch'), { amount: 1.5, unit: 'l', name: 'Milch' });
  assert.deepEqual(parseIngredientLine('2-3 Zehen Knoblauch'), { amount: 3, unit: 'Zehe', name: 'Knoblauch' });
  assert.deepEqual(parseIngredientLine('1 Zwiebel, fein gewürfelt'), { amount: 1, unit: 'Stück', name: 'Zwiebel' });
  assert.deepEqual(parseIngredientLine('1 Pck. Backpulver'), { amount: 1, unit: 'Packung', name: 'Backpulver' });
  assert.equal(parseIngredientLine('1. Zwiebel schälen'), null);
  assert.equal(parseIngredientLine('Salz'), null);
});

test('Beispielrezept mit Kopf, Zutaten und Zubereitung', () => {
  const r = parseRecipeText(SAMPLE_RECIPE_TEXT);
  assert.equal(r.name, 'Linsen-Dal mit Spinat');
  assert.equal(r.servings, 2);
  assert.equal(r.minutes, 35);
  assert.deepEqual(r.ingredients.map(i => i.name), ['Rote Linsen', 'Zwiebel', 'Knoblauchzehen', 'Ingwer', 'Kokosmilch',
    'Gehackte Tomaten', 'Babyspinat', 'Currypulver', 'Kurkuma', 'Salz', 'Pfeffer']);
  assert.deepEqual(r.ingredients.find(i => i.name === 'Kokosmilch'), { amount: 400, unit: 'ml', name: 'Kokosmilch' });
  assert.equal(r.notes.split('\n').length, 3);
});

test('Ohne Überschriften: Mengenzeilen sind Zutaten, lange Sätze Arbeitsschritte', () => {
  const r = parseRecipeText(`Schnelle Tomatensoße
für 4 Personen
• 2 Dosen Tomaten
• 1 Zwiebel
• 2 EL Olivenöl
Die Zwiebel würfeln und im Öl glasig dünsten, dann die Tomaten dazugeben.
Etwa 1 Std. 15 Min. Zeit einplanen`);
  assert.equal(r.name, 'Schnelle Tomatensoße');
  assert.equal(r.servings, 4);
  assert.equal(r.minutes, 75);
  assert.deepEqual(r.ingredients.map(i => i.name), ['Tomaten', 'Zwiebel', 'Olivenöl']);
  assert.match(r.notes, /glasig/);
});
