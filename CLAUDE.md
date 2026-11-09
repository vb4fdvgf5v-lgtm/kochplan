# Kochplan-App: Übergabe für Claude

Persönliche Koch-App als PWA (zweite App neben dem Putzplan, gleiche Bauweise): eigene Gerichte sammeln,
Woche planen, Einkaufsliste bekommen, Resteküche („Was kann ich mit Hackfleisch kochen?“).

## Stand (09.11.2026)

- **Version 0.3.** Eigenes Git-Repo `kochplan` (seit 02.11.2026), getrennt vom Putzplan.
- 0.2: Gerichte gehören zur **Woche**, ein Tag ist optional (Matthes' Wunsch: „Diese Woche koche ich das und das“).
  Daten: `weeks[montag] = [{ id, dishId, servings, day|null }]`; 0.1-Daten (`plan[datum]`) werden beim Laden umgestellt.
- 0.3: **Rezept aus Foto-Text** (Gerichte → Einfügen). Text per iPhone-Livetext kopieren, einfügen, `js/import.js`
  erkennt Name, Portionen, Gesamtzeit, Zutatenzeilen und Arbeitsschritte (→ Notizen) mit Regeln, ohne KI. Ergebnis landet
  als Entwurf im Formular zum Prüfen. Im Demo-Modus gibt es einen „Beispieltext“. KI-Bilderkennung bewusst noch nicht
  (kostet pro Foto, braucht einen Server für den Schlüssel).
- 0.4: **Rezeptdatei** (`{ kind: 'kochplan-rezepte', dishes }`) über „Datei laden“ fügt Gerichte hinzu
  (`mergeDishes`, gleichnamige übersprungen), eine normale Sicherung ersetzt weiter alles. Erste Datei:
  `rezepte-gesund-proteinreich.json` (15 gesunde, schnelle, eiweißreiche Gerichte, Quelltext in der gleichnamigen `.md`).
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
