# Kochplan-App: Übergabe für Claude

Persönliche Koch-App als PWA (zweite App neben dem Putzplan, gleiche Bauweise): eigene Gerichte sammeln,
Woche planen, Einkaufsliste bekommen, Resteküche („Was kann ich mit Hackfleisch kochen?“).

## Stand (11.11.2026)

- **Version 0.14.** Eigenes Git-Repo `kochplan` (seit 02.11.2026), getrennt vom Putzplan.
- 0.2: Gerichte gehören zur **Woche**, ein Tag ist optional (Matthes' Wunsch: „Diese Woche koche ich das und das“).
  Daten: `weeks[montag] = [{ id, dishId, servings, day|null }]`; 0.1-Daten (`plan[datum]`) werden beim Laden umgestellt.
- 0.3: **Rezept aus Foto-Text** (Gerichte → Einfügen). Text per iPhone-Livetext kopieren, einfügen, `js/import.js`
  erkennt Name, Portionen, Gesamtzeit, Zutatenzeilen und Arbeitsschritte (→ Notizen) mit Regeln, ohne KI. Ergebnis landet
  als Entwurf im Formular zum Prüfen. Im Demo-Modus gibt es einen „Beispieltext“. KI-Bilderkennung bewusst noch nicht
  (kostet pro Foto, braucht einen Server für den Schlüssel).
- 0.4: **Rezeptdatei** (`{ kind: 'kochplan-rezepte', dishes }`) über „Datei laden“ fügt Gerichte hinzu
  (`mergeDishes`, gleichnamige übersprungen), eine normale Sicherung ersetzt weiter alles. Erste Datei:
  `rezepte-gesund-proteinreich.json` (15 gesunde, schnelle, eiweißreiche Gerichte, Quelltext in der gleichnamigen `.md`).
- 0.5: **„Gerade gekocht“** im Wochen-Eintrag und beim Gericht (`entry.cooked`, Verlauf `dish.cooked[]`), Woche zeigt
  „Heute/Gestern gekocht“ bzw. „Gekocht am …“. `lastCooked` nutzt das echte Kochdatum.
- 0.6: **Bewertung** `dish.rating = { taste, ease }` (1–5). Nach dem ersten Kochen fragt das Fenster „Wie war’s?“,
  änderbar beim Gericht; Gerichteliste sortiert nach A–Z, Geschmack oder Einfachheit.
- 0.7: **„Einkauf erledigt“** blendet Abgehaktes aus (`shop[montag].bought[key]` = gekaufte Mengen), „Eingekauft“
  holt es zurück. Braucht der Plan später mehr, steht nur der Rest auf der Liste (`stillNeeded`).
- 0.8: **Einkaufsliste nach Supermarkt-Bereichen** (`CATEGORIES`, `categoryOf` per Wortanfang, längster Treffer gewinnt),
  eigene Zuordnung je Zutat in `data.categories`, Knopf „Bereiche zuordnen“ oben auf der Einkaufsliste.
- 0.9: **Supermärkte** (`data.stores[{ id, name, has, missing }]`, gewählter Markt `data.store`). Abgehakt im Markt = gibt es dort, durchgestrichener Wagen = gibt es nicht; Fehlendes steht unten mit Hinweis auf andere Märkte. Eine Bereichs-Reihenfolge für alle Märkte (so gewünscht).
- 0.10: **Resteküche als Vorratsliste** (`data.home = [{ name, since }]`, bleibt gespeichert bis „Aufgebraucht“), nach Bereichen, Älteres zuerst, je Zutat „in N Gerichten“. Antippen filtert die Gerichte. Gerichte sortiert nach Passgenauigkeit (`matchDishes`: complete, share), „Alles zu Hause“ grün.
- 0.11: **Basics** für den normalen Einkauf (`data.basics = [{ id, name }]`, ohne Mengen, getrennt vom Vorrat).
  „Basics prüfen“ oben auf der Einkaufsliste: nichts vorausgewählt, Fehlendes antippen, „Auf die Liste“ legt sie als
  `extra` mit `basic: true` an. Startliste `DEFAULT_BASICS` in `seed.js` (Skyr, Brot, Eier, Griechischer Joghurt, Joghurt,
  Bananen), greift auch bei vorhandenen Daten ohne `basics`. Neuer Bereich „Drogerie & Haushalt“.
- 0.12: **Markt-Tags** statt Lernen beim Abhaken: „Gibt's hier nicht“ im gewählten Markt setzt `missing`, daraus leitet
  `storeTag` den Tag „nur Lidl“ ab (nur bei ≥ 2 Märkten). Tag steht auf der Einkaufsliste und in der Zutatenliste des Gerichts.
  Matthes' Flow: Woche planen → Einkaufsliste → zu Hause „Hab ich“/Basics → im Laden Markt wählen, Fehlendes markieren.
- 0.13: **„Wie war's?“ nach jedem Kochen** (Vollbild): Sterne, Zutaten mit − / + / × (`stepAmount`), „Zutat dazu“
  (per `parseIngredientLine`), Notiz `dish.nextTime` („Fürs nächste Mal“, oben im Gericht und Wochen-Eintrag hervorgehoben).
  Alles speichert sofort. Beim Gericht derselbe Dialog als „Schnell anpassen“. Vollbild-Fenster: `.sheet-body > *` darf nicht
  schrumpfen (`flex-shrink: 0`), sonst wird gequetscht statt gescrollt.
- 0.13.1: **Rezepte Runde 2** (`rezepte-runde-2.md/.json`, 24 Gerichte, davon 8 Rind), ausgewählt aus
  `rezept-kandidaten.md` (Quellen: eatsmarter, einfachkochen, lecker, susannafuhrmann, emmikochteinfach), in eigenen
  Worten neu geschrieben. Neue Zutaten in `CATEGORIES` (Zuckerschoten/Grüne Bohnen → Obst & Gemüse, Räuchertofu/Falafel →
  Kühlregal, Balsamico/Hoisin/Teriyaki/Speisestärke → Gewürze). Matthes mag keinen Kabeljau.
- 0.14: **Filter in den Gerichten** im Stil einer Food-App: Suchfeld + Filter-Knopf mit Zähler, Kategorie-Symbole
  (Alle, Geflügel, Rind & Hack, Fisch, Veggie), aktive Zusatzfilter als Chips, Sortieren als Auswahlmenü, Filter-Fenster mit
  Kacheln und Trefferzahl je Option. Eiweißquelle wird aus den Zutaten abgeleitet (`proteinsOf`), nicht aus Tags;
  `filterDishes`: „oder“ innerhalb der Eiweißquellen, „und“ zwischen den Gruppen. Matthes will, dass es wie eine richtige App aussieht.
- Matthes nutzt sie vorerst **allein**, deshalb kein Supabase: Daten liegen in `localStorage` (`koch:data`),
  Sicherung als JSON-Datei über „Daten sichern“.
- Kein KI-Dialog gewünscht. Die App soll die Antworten über gute Ansichten liefern.

## Arbeitsweise

- **Code:** `koch-app/` (Vanilla JS, keine Abhängigkeiten). Reine Logik in `js/logic.js` (mit Node testbar),
  Beispielgerichte und Standard-Vorrat in `js/seed.js`, Oberfläche in `js/app.js`.
- **Vorschau:** Launch-Konfiguration `koch-app` (Port 8782) aus `Claude Projekte/.claude/launch.json`.
  `?demo` startet mit Beispielgerichten und Beispielwoche, getrennt von den echten Daten (`koch:demo`).
  `?view=week|shop|dishes|find` öffnet direkt eine Ansicht.
- **Tests:** `node --test koch-app/test/logic.test.mjs koch-app/test/import.test.mjs` nach jeder Logikänderung.
  Neue Rezepttexte, die nicht sauber erkannt werden, als Testfall in `import.test.mjs` aufnehmen.
- **Gleiche Adresse wie der Putzplan** (`vb4fdvgf5v-lgtm.github.io`): Speicher-Schlüssel immer mit `koch:`,
  Cache-Namen mit `kochplan-`. Der Service Worker löscht nur eigene Caches.
- **Nach jeder Änderung** `VERSION` in `koch-app/sw.js` hochzählen, sichtbare Änderungen zusätzlich `APP_VERSION` in `js/app.js`.
- Der Service Worker registriert sich nur über https (GitHub Pages), lokal nicht.
- **Deploy:** Claude committet (lokale Git-Identität ist die anonyme GitHub-Noreply-Adresse, nie die Firmenadresse).
  Pushen macht Matthes selbst über GitHub Desktop („Push origin“). GitHub Pages (Branch `main`, Ordner root)
  veröffentlicht unter https://vb4fdvgf5v-lgtm.github.io/kochplan/koch-app/. Repo ist öffentlich: keine persönlichen Daten committen.
- **Icons:** Material Symbols, in `index.html` nur die verwendeten per `icon_names=` (alphabetisch).
- **`min-height: 100lvh` auf `html` und `body` nicht entfernen.** Sonst schwebt die Tab-Leiste in der
  Home-Bildschirm-App auf kurzen Seiten etwa um die Statusleistenhöhe zu hoch (iOS, `black-translucent`).
  In der Vorschau am Mac ist das nicht sichtbar, nur auf dem iPhone (in 0.3.2 so behoben, von Matthes bestätigt).
- Gleiche Stolpersteine wie beim Putzplan: `render()` baut per `innerHTML` neu (Fokus und Scrollposition werden
  gerettet), iOS-Eingabefelder mindestens 16 px, Formular-Fenster oben verankert.

## Fachliche Regeln

- Zutaten werden über den Namen erkannt (`keyOf`: klein, Leerzeichen bereinigt). Gleiche Zutat gleich schreiben,
  die Auswahlliste im Formular hilft dabei.
- Einkaufsliste: Mengen je Einheit summiert, kg→g und l→ml umgerechnet, Dose/Packung/Becher/Bund aufgerundet,
  auf die geplanten Portionen umgerechnet.
- **Vorrat** (Salz, Öl …) steht nicht automatisch auf der Liste, sondern unter „Vorrat prüfen“; antippen = leer = kaufen.
- „Hab ich“ verschiebt eine Zutat für diese Woche nach „Schon zu Hause“. Einkaufszustand gilt je Woche (`shop[montag]`).
- Wochenauswahl: mehrere Gerichte an-/abwählen, Gewählte oben; Vorschläge sortiert nach gemeinsamen Zutaten mit der
  Auswahl, dann lange nicht gekocht. „Zuletzt gekocht“ zählt den festen Tag, sonst den Sonntag der Woche.
- Resteküche: Treffer am Wortanfang („hack“ → Hackfleisch, „ei“ nicht → Reis), Vorrat zählt weder als Treffer noch als fehlend.

## Ideen für später

Einkaufsliste nach Supermarkt-Abteilungen sortieren, Rezept-Import aus einem Link, Wochenvorlage wiederverwenden,
Mittagessen zusätzlich zum Abendessen, Sync über Supabase falls zu zweit, Bewertung/Favoriten.
