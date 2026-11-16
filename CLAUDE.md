# Viaggio – istruzioni per Claude

App personale di viaggio: spese ed entrate, convertitore di valuta, itinerario con mappa. È una PWA usata su iPhone (Safari, aggiunta alla schermata Home) e pubblicata con GitHub Pages dal ramo `main`. Chi la usa sta imparando a programmare e vuole capire il codice.

Rispondi sempre in italiano.

## Regole che non si cambiano senza chiedere

- **Solo HTML, CSS e JavaScript vanilla (moduli ES).** Niente framework, niente TypeScript, niente build step, niente bundler, niente `package.json` per l'app.
- **Niente backend e niente chiavi API.** I dati stanno solo sul telefono, in IndexedDB.
- **Librerie esterne solo copiate nel repository** (cartella `vendor/`), mai caricate da un CDN: l'app deve funzionare offline.
- **Servizi esterni solo gratuiti e senza registrazione**, e l'app deve continuare a funzionare se uno sparisce. Oggi: Frankfurter (cambi), OpenStreetMap (tessere della mappa e ricerca Nominatim, al massimo una richiesta al secondo e solo su richiesta dell'utente).
- **Il repository è pubblico:** mai metterci dati personali, spese, itinerari o backup.

## Stile del codice

- Nomi di variabili, funzioni e file **in italiano**; commenti **in italiano** che spiegano il perché, pensati per chi sta imparando.
- Codice semplice e leggibile prima che compatto: niente trucchi sintattici difficili da seguire.
- Il testo scritto dall'utente passa sempre da `esc()` (in `js/util.js`) prima di finire nell'HTML.
- Date e ore si salvano come testo "da orologio" (`2026-11-14T09:30`), senza fuso orario: vedi la spiegazione in `js/util.js`.
- Interfaccia pensata per il pollice: tasti alti almeno 44 px, campi con testo da 16 px in su (altrimenti iOS ingrandisce la pagina), rispetto delle safe area, tema chiaro e scuro.

## Com'è organizzato

- `index.html` – la pagina; `js/app.js` – sceglie la schermata in base all'indirizzo (`#/spese`, `#/cambio`, …).
- `js/viste/` – una schermata per file, ognuna con una funzione `mostra(contenitore, parametro)`.
- `js/db.js` – IndexedDB; `js/scheda.js` – le finestre a tutto schermo; il resto è descritto nel `README.md`.
- `sw.js` – service worker: copia i file sul telefono per l'uso offline.
- `strumenti/` – script per chi sviluppa, non fanno parte dell'app.

Per aggiungere una schermata: crea il file in `js/viste/`, importalo in `js/app.js` e aggiungi una riga a `ROTTE`.

## Prima di ogni push

1. **Cambia `VERSIONE` in cima a `sw.js`** (v5 → v6…). Senza questo i telefoni continuano a usare la copia vecchia.
2. **Se hai aggiunto un file all'app, aggiungilo all'elenco `FILE` in `sw.js`**, altrimenti non sarà disponibile offline.
3. **Esegui la verifica** e pubblica solo se dice «Tutto a posto»:

   ```bash
   node strumenti/verifica.cjs
   ```

   Serve Playwright. Controlla console senza errori, service worker, funzioni principali, uso offline e aggiornamento di versione. Se aggiungi una funzione, aggiungi anche il suo controllo qui.
4. Commit piccoli, con messaggi chiari in italiano.

## Limiti da tenere presenti

- La verifica gira in Chromium: **Safari su iPhone non si può provare da qui.** Quando una modifica tocca gesti, tastiera, safe area, condivisione di file o link verso altre app, dillo esplicitamente e chiedi di provarla sul telefono.
- Eliminare l'icona dalla schermata Home cancella i dati dell'app: non suggerirlo mai senza aver prima fatto fare un backup.
