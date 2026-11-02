import { addDays } from './logic.js';

// Zutaten, die man meist im Haus hat. Sie landen nur auf der Einkaufsliste, wenn man sagt, dass sie leer sind.
export const DEFAULT_STAPLES = ['salz', 'pfeffer', 'öl', 'olivenöl', 'zucker', 'mehl', 'essig', 'gemüsebrühe',
  'paprikapulver', 'oregano', 'currypulver', 'senf'];

const ing = (amount, unit, name) => ({ amount, unit, name });

// Beispielgerichte für den Start und den Demo-Modus. Absichtlich mit gemeinsamen Zutaten (Hack, Paprika, Zwiebel).
export const SAMPLE_DISHES = [
  { id: 's-bolognese', name: 'Spaghetti Bolognese', minutes: 40, servings: 2, tags: ['Pasta'], notes: '',
    ingredients: [ing(250, 'g', 'Hackfleisch'), ing(250, 'g', 'Spaghetti'), ing(500, 'g', 'Passierte Tomaten'),
      ing(1, 'Stück', 'Zwiebel'), ing(1, 'Stück', 'Möhre'), ing(1, 'Zehe', 'Knoblauch'), ing(30, 'g', 'Parmesan'),
      ing(null, '', 'Olivenöl'), ing(null, '', 'Salz'), ing(null, '', 'Pfeffer')] },
  { id: 's-chili', name: 'Chili con Carne', minutes: 45, servings: 2, tags: ['Eintopf'], notes: '',
    ingredients: [ing(250, 'g', 'Hackfleisch'), ing(1, 'Dose', 'Kidneybohnen'), ing(1, 'Dose', 'Mais'),
      ing(1, 'Dose', 'Gehackte Tomaten'), ing(1, 'Stück', 'Zwiebel'), ing(1, 'Stück', 'Paprika'),
      ing(1, 'Zehe', 'Knoblauch'), ing(1, 'TL', 'Paprikapulver'), ing(null, '', 'Öl')] },
  { id: 's-curry', name: 'Hähnchen-Curry mit Reis', minutes: 30, servings: 2, tags: ['schnell'], notes: '',
    ingredients: [ing(300, 'g', 'Hähnchenbrust'), ing(1, 'Dose', 'Kokosmilch'), ing(2, 'EL', 'Rote Currypaste'),
      ing(150, 'g', 'Reis'), ing(1, 'Stück', 'Paprika'), ing(1, 'Stück', 'Zwiebel'), ing(null, '', 'Öl')] },
  { id: 's-ofengemuese', name: 'Ofengemüse mit Feta', minutes: 45, servings: 2, tags: ['vegetarisch'], notes: '',
    ingredients: [ing(600, 'g', 'Kartoffeln'), ing(1, 'Stück', 'Paprika'), ing(1, 'Stück', 'Zucchini'),
      ing(1, 'Stück', 'Rote Zwiebel'), ing(200, 'g', 'Feta'), ing(3, 'EL', 'Olivenöl'), ing(null, '', 'Salz')] },
  { id: 's-lachs', name: 'Nudeln mit Lachs-Sahne-Soße', minutes: 20, servings: 2, tags: ['schnell', 'Pasta'], notes: '',
    ingredients: [ing(250, 'g', 'Bandnudeln'), ing(200, 'g', 'Lachs'), ing(200, 'ml', 'Sahne'),
      ing(1, 'Stück', 'Zitrone'), ing(1, 'Bund', 'Dill'), ing(null, '', 'Salz')] },
  { id: 's-paprika', name: 'Gefüllte Paprika', minutes: 60, servings: 2, tags: [], notes: '',
    ingredients: [ing(4, 'Stück', 'Paprika'), ing(250, 'g', 'Hackfleisch'), ing(75, 'g', 'Reis'),
      ing(1, 'Dose', 'Gehackte Tomaten'), ing(1, 'Stück', 'Zwiebel'), ing(100, 'g', 'Reibekäse')] },
];

// Demo-Woche: drei Gerichte, eins davon mit festem Tag, damit Einkaufsliste und Vorschläge etwas zeigen
export const demoWeeks = monday => ({
  [monday]: [
    { id: 'demo-1', dishId: 's-bolognese', servings: 2, day: monday },
    { id: 'demo-2', dishId: 's-curry', servings: 2, day: null },
    { id: 'demo-3', dishId: 's-chili', servings: 4, day: null },
  ],
  [addDays(monday, -7)]: [{ id: 'demo-0', dishId: 's-lachs', servings: 2, day: addDays(monday, -4) }],
});
