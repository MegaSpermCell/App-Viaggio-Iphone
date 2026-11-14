# Viaggio

App personale per il viaggio (vendemmia in Nuova Zelanda, con soste a Istanbul e Bangkok): **spese**, **convertitore di valuta** e **itinerario** giorno per giorno.

È una PWA: una pagina web che si aggiunge alla schermata Home dell'iPhone e si usa come un'app. È gratuita, funziona anche offline e non scade: non ci sono account, abbonamenti né chiavi da rinnovare. I dati restano solo sul tuo telefono.

**Indirizzo dell'app:** https://megaspermcell.github.io/App-Viaggio-Iphone/

## Cosa fa

- **Spese** – tocchi `+`, scrivi l'importo, tocchi la categoria: salvata. La valuta proposta è l'ultima usata, data e ora sono automatiche. Ogni spesa viene convertita in euro con il cambio di quel momento.
- **Entrate** – con `＋ Entrata` aggiungi i soldi ricevuti (per esempio lo stipendio). In alto vedi quanto ti resta: entrate meno spese.
- **Cambio** – scrivi un importo in una valuta e lo vedi in tutte le altre. Tocca un'altra riga per scrivere in quella valuta. Funziona offline con gli ultimi cambi scaricati.
- **Itinerario** – giorni con titolo e note, raccolti se vuoi in **cartelle** (es. «Istanbul»): basta scrivere il nome della cartella nella scheda del giorno. Ogni giorno ha una scaletta di attività con orario, luogo, note e fatto/da fare.
- **Luoghi e percorsi** – il luogo di un'attività si trova cercandone il nome, toccando la mappa o incollando coordinate o un link di Google Maps. Un'attività può avere **più tappe** (passeggiate, giri): il tasto «Percorso» apre Apple Maps o Google Maps con tutte le tappe in ordine.
- **Mappa** – tutti i luoghi dell'itinerario, numerati e uniti da una linea, con un colore per giorno. Si può guardare un giorno solo.
- **Impostazioni** – valute e cambi (anche scritti a mano), categorie, backup, aggiornamenti.

**Scaletta incollata da un testo** – una riga per attività; orario e luogo sono facoltativi, le tappe si separano con `>`:

```
9:00 Colazione
10:30 Santa Sofia @ Sultanahmet
16:00 Giro @ Galata > Karaköy > Eminönü
```

## a) Attivare GitHub Pages

Va fatto una volta sola. Si può fare anche dal telefono, con Safari.

1. Apri https://github.com/MegaSpermCell/App-Viaggio-Iphone/settings/pages (entra con il tuo account GitHub).
2. Alla voce **Source** scegli **Deploy from a branch**.
3. Alla voce **Branch** scegli **main** e la cartella **/ (root)**, poi tocca **Save**.
4. Aspetta un paio di minuti: l'app sarà all'indirizzo scritto qui sopra.

Il repository deve restare **pubblico** (con un account GitHub gratuito Pages funziona solo così). È pubblico il codice, non i tuoi dati.

## b) Installare l'app su iPhone

1. Apri l'indirizzo dell'app con **Safari** (non con Chrome o altre app).
2. Tocca **Condividi** (il quadrato con la freccia verso l'alto).
3. Scorri e tocca **Aggiungi alla schermata Home**, poi **Aggiungi**.
4. Apri l'app dall'icona **mentre hai ancora rete**: in quel momento scarica tutto ciò che le serve. Da lì in poi funziona anche offline.

Due cose da sapere:

- **Usa sempre l'icona sulla Home.** L'app sulla Home e la pagina aperta in Safari hanno dati separati: ciò che inserisci in una non compare nell'altra.
- **Non eliminare l'icona dalla Home senza aver fatto un backup:** eliminandola, iOS cancella anche i dati.

## c) Backup dei dati

I dati stanno solo sul telefono, quindi ogni tanto conviene metterli al sicuro.

**Fare il backup**

1. Apri **Impostazioni** (ultimo tasto in basso).
2. Tocca **Esporta backup (JSON)**.
3. Nel foglio che si apre scegli **Salva su File** (per esempio in iCloud Drive), oppure mandalo a te stesso per email.

Dopo una settimana senza backup l'app te lo ricorda nella schermata Spese.

**Ripristinare un backup** (telefono nuovo, app reinstallata)

1. **Impostazioni → Importa backup…** e scegli il file `viaggio-backup-….json`.
2. Conferma. Attenzione: i dati presenti in quel momento vengono sostituiti da quelli del backup.

**Spese in un foglio di calcolo** – **Esporta spese (CSV)** crea un file che si apre con Numbers o Excel. Usa il punto e virgola fra le colonne e la virgola nei decimali, come si aspettano i programmi in italiano.

## d) Aggiornare l'app

Per cambiare qualcosa nell'app si modifica il codice in questo repository. Pochi minuti dopo ogni modifica arrivata sul ramo `main`, GitHub Pages pubblica la versione nuova.

**Due regole, ogni volta che si modifica l'app** (stanno entrambe in cima a `sw.js`):

1. **Cambia il numero di versione**: `const VERSIONE = 'v1'` diventa `'v2'`, poi `'v3'`… È il segnale che dice ai telefoni di scaricare di nuovo i file. Senza questo passo il telefono continua a usare la copia vecchia.
2. **Se aggiungi un file all'app**, aggiungilo anche all'elenco `FILE`: altrimenti quel file non sarà disponibile offline.

**Sul telefono** non devi reinstallare nulla: apri l'app con la rete attiva e in alto compare **«Nuova versione disponibile»**; tocca **Aggiorna**. Se l'avviso non compare, vai in **Impostazioni → Controlla aggiornamenti**. I tuoi dati non vengono toccati dagli aggiornamenti.

## Com'è fatto il progetto

Solo HTML, CSS e JavaScript: non c'è nulla da compilare né da installare. Il codice è commentato in italiano.

```
index.html              la pagina: barra in alto, spazio per la schermata, barra in basso
manifest.webmanifest    nome, icone e colori per «Aggiungi alla schermata Home»
sw.js                   service worker: copia i file sul telefono per l'uso offline
css/style.css           tutto l'aspetto: tema chiaro e scuro, misure, schermate
js/
  app.js                punto di partenza: sceglie la schermata da mostrare
  db.js                 salvataggio dei dati sul telefono (IndexedDB)
  dati.js               valute e categorie di partenza
  cambi.js              download dei cambi e conversioni
  util.js               funzioni di aiuto: numeri, date, messaggi
  tastierino.js         il tastierino numerico
  scheda.js             le finestre a tutto schermo per inserire e modificare
  scheda-spesa.js       la scheda di spese ed entrate
  scheda-luogo.js       la scheda per mettere un luogo sulla mappa
  luoghi.js             ricerca dei luoghi, coordinate incollate, link per il navigatore
  mappa.js              creazione della mappa e dei segnaposto
  scaletta.js           legge una scaletta incollata come testo
  backup.js             esporta e importa il backup, esporta il CSV
  aggiornamenti.js      registra il service worker e gestisce le versioni nuove
  viste/                una schermata per file: spese, cambio, itinerario, giorno, mappa, impostazioni
vendor/leaflet/         la libreria delle mappe, copiata qui per funzionare offline
icons/                  le icone dell'app (icona.svg è il disegno originale)
strumenti/              script per chi sviluppa; l'app non ne ha bisogno
```

Un buon ordine per leggere il codice: `index.html` → `js/app.js` → `js/viste/cambio.js` (la schermata più semplice) → `js/cambi.js` → `js/db.js`.

## Servizi esterni

Tutti gratuiti e senza registrazione. Se uno smettesse di esistere, il resto dell'app continuerebbe a funzionare.

- **[Frankfurter](https://frankfurter.dev)** per i cambi. L'app li scarica da sola quando la apri (o la riporti in primo piano) con la rete attiva, se quelli salvati hanno più di sei ore; il tasto «Aggiorna cambi» lo fa subito. Sono cambi di riferimento, che alla fonte cambiano circa una volta al giorno: quello applicato da banca o bancomat è di solito un po' peggiore. Per conti più aderenti alla realtà, in **Impostazioni** tocca una valuta e scrivi il cambio a mano.
- **[OpenStreetMap](https://www.openstreetmap.org)** per le immagini della mappa e per la ricerca dei luoghi (Nominatim). La ricerca parte solo quando tocchi «Cerca», al massimo una al secondo, come chiedono le regole del servizio.
- **[Leaflet](https://leafletjs.com)**, la libreria che disegna la mappa, è copiata nella cartella `vendor/`: non viene scaricata da nessun altro sito.

## Limiti da sapere

- Niente sincronizzazione fra dispositivi: i dati sono su un solo telefono. Per spostarli si usa il backup.
- **Mappa offline:** si rivedono solo le zone già guardate con la rete (le ultime 600 immagini circa). Prima di partire per una zona senza rete, aprila sulla mappa e ingrandiscila. La ricerca dei luoghi richiede sempre la rete; toccare la mappa e incollare coordinate funzionano anche offline.
- **Link brevi di Google Maps** (`maps.app.goo.gl/…`): non contengono la posizione e l'app non può leggerli. Usa il link lungo, le coordinate o la ricerca.
- «Trovali», nella schermata Mappa, prende il primo risultato della ricerca per ogni luogo senza posizione: conviene dare un'occhiata alla mappa e correggere a mano quelli sbagliati. Aggiungere la città al nome aiuta («Wat Pho Bangkok»).

## Per chi sviluppa

Prima di pubblicare una modifica conviene provarla:

```bash
node strumenti/verifica.cjs
```

Apre l'app in un browser di prova (serve [Playwright](https://playwright.dev)) e controlla che non ci siano errori in console, che il service worker si registri, che spese, convertitore, itinerario e backup funzionino, che l'app regga offline e che l'aggiornamento a una nuova versione vada a buon fine.

## Prossima fase

**Budget e grafici** – budget per categoria; riepiloghi per giorno, settimana e categoria.
