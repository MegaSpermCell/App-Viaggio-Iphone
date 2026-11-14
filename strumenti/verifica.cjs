// verifica.cjs – prova l'app in un browser vero prima di pubblicarla.
//
// NON fa parte dell'app: serve solo a chi sviluppa. Controlla che non ci siano
// errori in console, che il service worker si registri, che le funzioni
// principali facciano il loro dovere e che tutto funzioni anche offline.
//
// Uso (dal computer, con Node e Playwright installati):
//     node strumenti/verifica.cjs                  solo controlli
//     node strumenti/verifica.cjs cartella/        salva anche le schermate in quella cartella

const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');

const RADICE = path.join(__dirname, '..');
const PREFISSO = '/App-Viaggio-Iphone/'; // come su GitHub Pages: l'app sta in una sottocartella
const CARTELLA_SCHERMATE = process.argv[2] ?? null;
const VERSIONE = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8').match(/const VERSIONE = '([^']+)'/)[1];

// iPhone 13: lo schermo è 390×844; tolte tacca e barra Home ne restano circa 763.
const SCHERMO = { width: 390, height: 844 };
const SCHERMO_UTILE = { width: 390, height: 763 };

const TIPI = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json',
};

// ---------- Risultati ---------------------------------------------------------

let falliti = 0;
function controllo(nome, riuscito, dettaglio = '') {
  if (!riuscito) falliti += 1;
  console.log(`${riuscito ? '  ok   ' : '  NO   '} ${nome}${dettaglio ? `  → ${dettaglio}` : ''}`);
}
const titolo = (testo) => console.log(`\n${testo}`);

// ---------- Piccolo server web --------------------------------------------------

// versioneFinta: se impostata, sw.js viene servito con quella versione al posto
// di quella vera. Serve a simulare "è uscita una versione nuova dell'app".
const server = { versioneFinta: null };

function avviaServer() {
  const istanza = http.createServer((richiesta, risposta) => {
    const percorso = decodeURIComponent(new URL(richiesta.url, 'http://x').pathname);
    if (!percorso.startsWith(PREFISSO)) {
      risposta.writeHead(404).end();
      return;
    }
    const relativo = percorso.slice(PREFISSO.length) || 'index.html';
    const file = path.join(RADICE, relativo);
    if (!file.startsWith(RADICE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      risposta.writeHead(404).end();
      return;
    }
    let contenuto = fs.readFileSync(file);
    if (relativo === 'sw.js' && server.versioneFinta) {
      contenuto = contenuto.toString().replace(/const VERSIONE = '[^']+'/, `const VERSIONE = '${server.versioneFinta}'`);
    }
    risposta.writeHead(200, { 'Content-Type': TIPI[path.extname(file)] ?? 'application/octet-stream' });
    risposta.end(contenuto);
  });
  return new Promise((risolvi) => {
    istanza.listen(0, '127.0.0.1', () => {
      risolvi({ indirizzo: `http://localhost:${istanza.address().port}${PREFISSO}`, chiudi: () => istanza.close() });
    });
  });
}

// ---------- Controlli senza browser ---------------------------------------------

function elencaFile(cartella, estensioni) {
  const trovati = [];
  for (const voce of fs.readdirSync(path.join(RADICE, cartella), { withFileTypes: true })) {
    const relativo = path.posix.join(cartella, voce.name);
    if (voce.isDirectory()) trovati.push(...elencaFile(relativo, estensioni));
    else if (estensioni.includes(path.extname(voce.name))) trovati.push(relativo);
  }
  return trovati;
}

function controllaElencoServiceWorker() {
  titolo('Elenco dei file nel service worker');
  const sw = fs.readFileSync(path.join(RADICE, 'sw.js'), 'utf8');
  const elenco = sw.slice(sw.indexOf('const FILE = ['), sw.indexOf('];')).match(/'([^']+)'/g).map((voce) => voce.slice(1, -1));
  const suDisco = ['index.html', 'manifest.webmanifest', ...elencaFile('css', ['.css']), ...elencaFile('js', ['.js']), ...elencaFile('icons', ['.png']), ...elencaFile('vendor', ['.js', '.css'])];

  const mancanti = suDisco.filter((file) => !elenco.includes(file));
  const inesistenti = elenco.filter((file) => file !== './' && !fs.existsSync(path.join(RADICE, file)));
  controllo('tutti i file dell’app sono nell’elenco FILE di sw.js', mancanti.length === 0, mancanti.join(', '));
  controllo('ogni voce dell’elenco esiste davvero', inesistenti.length === 0, inesistenti.join(', '));
}

async function controllaFunzioniPure() {
  titolo('Funzioni di calcolo');
  const carica = (file) => import(pathToFileURL(path.join(RADICE, file)).href);
  const { analizzaScaletta } = await carica('js/scaletta.js');
  const { premi } = await carica('js/tastierino.js');
  const { converti, tasso } = await carica('js/cambi.js');

  const scaletta = analizzaScaletta([
    '9:00 Colazione',
    '- 10.30 - Santa Sofia @ Sultanahmet',
    '13h Pranzo al Gran Bazar',
    '2. 9h45 Traghetto @Eminönü',
    'Scrivere a mario@example.com',
    '   ',
    '25:99 non è un orario',
  ].join('\n'));
  const atteso = [
    ['09:00', 'Colazione', null],
    ['10:30', 'Santa Sofia', 'Sultanahmet'],
    ['13:00', 'Pranzo al Gran Bazar', null],
    ['09:45', 'Traghetto', 'Eminönü'],
    ['', 'Scrivere a mario@example.com', null],
    ['', '25:99 non è un orario', null],
  ];
  const ottenuto = scaletta.map((voce) => [voce.ora, voce.titolo, voce.luogo?.nome ?? null]);
  controllo('scaletta incollata: orari, titoli e luoghi', JSON.stringify(ottenuto) === JSON.stringify(atteso), JSON.stringify(ottenuto));

  const digita = (tasti) => [...tasti].reduce((testo, tasto) => premi(testo, tasto), '');
  controllo('tastierino: "12,5" resta "12,5"', digita('12,5') === '12,5');
  controllo('tastierino: massimo due decimali', digita('1,234') === '1,23');
  controllo('tastierino: "05" diventa "5", "," da solo diventa "0,"', digita('05') === '5' && digita(',') === '0,');
  controllo('tastierino: ⌫ cancella l’ultimo carattere', digita('12⌫') === '1');

  const { leggiCoordinate, eLinkBreve, linkNaviga } = await carica('js/luoghi.js');
  const giro = analizzaScaletta('16:00 Giro @ Wat Pho > Wat Arun → Grand Palace')[0];
  controllo('scaletta: «A > B > C» diventa un luogo più due tappe', giro.luogo.nome === 'Wat Pho' && giro.tappe.map((tappa) => tappa.nome).join() === 'Wat Arun,Grand Palace');
  const passeggiata = { luogo: { nome: 'A', lat: 1.5, lon: 2.5 }, tappe: [{ nome: 'B b', lat: null, lon: null }, { nome: 'C', lat: 3.5, lon: 4.5 }] };
  controllo('percorso a tappe su Google Maps', linkNaviga(passeggiata, 'google') === 'https://www.google.com/maps/dir/?api=1&destination=3.5%2C4.5&waypoints=1.5%2C2.5%7CB%20b&travelmode=walking', linkNaviga(passeggiata, 'google'));
  controllo('percorso a tappe su Apple Maps', linkNaviga(passeggiata, 'apple') === 'https://maps.apple.com/directions?destination=3.5%2C4.5&waypoint=1.5%2C2.5&waypoint=B%20b&mode=walking', linkNaviga(passeggiata, 'apple'));
  controllo('percorso in auto e attività senza luoghi', linkNaviga({ ...passeggiata, mezzo: 'auto' }, 'google').endsWith('travelmode=driving') && linkNaviga({ luogo: null }, 'apple') === null);
  const coordinate = (testo) => { const c = leggiCoordinate(testo); return c ? `${c.lat},${c.lon}` : null; };
  controllo('coordinate incollate: "41.0086, 28.9802"', coordinate('41.0086, 28.9802') === '41.0086,28.9802');
  controllo('coordinate con segno meno (Nuova Zelanda)', coordinate('-41.5134 173.9612') === '-41.5134,173.9612');
  controllo('link Google Maps: vince il segnaposto (!3d…!4d…)', coordinate('https://www.google.com/maps/place/X/@41.0,28.9,17z/data=!3d41.0086!4d28.9802') === '41.0086,28.9802');
  controllo('link Google Maps con @lat,lon', coordinate('https://www.google.com/maps/@-36.8485,174.7633,15z') === '-36.8485,174.7633');
  controllo('link con ?q=lat,lon e link Apple con ll=', coordinate('https://maps.google.com/?q=13.7563,100.5018') === '13.7563,100.5018' && coordinate('https://maps.apple.com/?ll=41.01,28.97&z=10') === '41.01,28.97');
  controllo('testo normale e coordinate impossibili → nessuna posizione', coordinate('Santa Sofia') === null && coordinate('95.0, 200.0') === null);
  controllo('link breve riconosciuto', eLinkBreve('https://maps.app.goo.gl/abc123') && !eLinkBreve('https://www.google.com/maps/@1.5,2.5,3z'));

  const cambi = { tassi: { EUR: 1, NZD: 2, THB: 40 }, manuali: { THB: 50 } };
  controllo('conversione: 10 NZD = 5 EUR', converti(10, 'NZD', 'EUR', cambi) === 5);
  controllo('conversione: il cambio manuale vince su quello online', tasso(cambi, 'THB') === 50 && converti(10, 'NZD', 'THB', cambi) === 250);
  controllo('conversione: valuta senza cambio → null', converti(10, 'NZD', 'XXX', cambi) === null);
}

// ---------- Controlli nel browser -----------------------------------------------

/** Legge un'impostazione direttamente dal database della pagina. */
function leggiDalDb(pagina, archivio, chiave) {
  return pagina.evaluate(([nomeArchivio, chiaveCercata]) => new Promise((risolvi, rifiuta) => {
    const apertura = indexedDB.open('viaggio');
    apertura.onerror = () => rifiuta(apertura.error);
    apertura.onsuccess = () => {
      const db = apertura.result;
      const archivioAperto = db.transaction(nomeArchivio).objectStore(nomeArchivio);
      const richiesta = chiaveCercata ? archivioAperto.get(chiaveCercata) : archivioAperto.getAll();
      richiesta.onsuccess = () => {
        db.close();
        risolvi(richiesta.result);
      };
    };
  }), [archivio, chiave]);
}

async function digita(pagina, tasti) {
  for (const tasto of tasti) await pagina.click(`:is(dialog[open], #vista) [data-tasto="${tasto}"] >> visible=true`);
}

async function schermata(pagina, nome) {
  if (!CARTELLA_SCHERMATE) return;
  fs.mkdirSync(CARTELLA_SCHERMATE, { recursive: true });
  await pagina.waitForTimeout(350); // lascia finire le animazioni
  await pagina.screenshot({ path: path.join(CARTELLA_SCHERMATE, `${nome}.png`) });
}

async function provaNelBrowser(indirizzo) {
  // Se il computer esce su internet tramite un proxy lo usiamo, ma non per il server locale.
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ proxy });
  const contesto = await browser.newContext({
    viewport: SCHERMO,
    deviceScaleFactor: CARTELLA_SCHERMATE ? 2 : 1,
    isMobile: true,
    hasTouch: true,
    locale: 'it-IT',
    acceptDownloads: true,
  });
  const pagina = await contesto.newPage();

  // Tutto ciò che finisce in console come errore viene raccolto qui.
  const errori = [];
  pagina.on('console', (messaggio) => {
    if (messaggio.type() === 'error') errori.push(messaggio.text());
  });
  pagina.on('pageerror', (errore) => errori.push(String(errore)));
  pagina.on('dialog', (finestra) => finestra.accept()); // risponde "OK" ai confirm()

  // ---- Avvio e service worker ----
  titolo('Avvio e service worker');
  const rispostaCambi = pagina.waitForResponse(/frankfurter/, { timeout: 15_000 }).catch(() => null);
  await pagina.goto(indirizzo);
  await pagina.waitForSelector('#nuova-spesa');
  const swAttivo = await pagina.evaluate(async () => {
    const registrazione = await navigator.serviceWorker.ready;
    return registrazione.active?.state;
  });
  controllo('service worker registrato e attivo', swAttivo === 'activated' || swAttivo === 'activating', swAttivo);
  await pagina.waitForFunction(() => navigator.serviceWorker.controller !== null);
  const inCache = await pagina.evaluate(async (nome) => (await (await caches.open(nome)).keys()).length, `viaggio-${VERSIONE}`);
  controllo('file dell’app salvati in cache', inCache >= 20, `${inCache} file`);
  controllo('manifest collegato', (await pagina.locator('link[rel="manifest"]').count()) === 1);
  controllo('icona per iPhone presente', (await pagina.request.get(`${indirizzo}icons/apple-touch-icon.png`)).ok());

  // ---- Cambi scaricati da internet ----
  titolo('Cambi online');
  await rispostaCambi;
  let cambi = null;
  for (let tentativo = 0; tentativo < 20 && !cambi?.aggiornato; tentativo += 1) {
    await pagina.waitForTimeout(250); // il tempo di salvare la risposta nel database
    cambi = (await leggiDalDb(pagina, 'impostazioni', 'cambi'))?.valore;
  }
  controllo('cambi scaricati da Frankfurter', Boolean(cambi?.aggiornato), cambi ? `NZD ${cambi.tassi.NZD}, THB ${cambi.tassi.THB}, TRY ${cambi.tassi.TRY}` : 'nessuna risposta');
  const tassi = cambi?.tassi ?? { NZD: 1.9978, THB: 37.483, TRY: 55.6667 };

  // ---- Misure sullo schermo dell'iPhone (app appena installata) ----
  titolo('Spazio sullo schermo (iPhone 13, tolte tacca e barra Home)');
  await pagina.setViewportSize(SCHERMO_UTILE);
  await pagina.click('#nuova-spesa');
  await pagina.waitForSelector('dialog[open] .griglia-categorie');
  const scheda = await pagina.evaluate(() => {
    const corpo = document.querySelector('dialog[open] .scheda-corpo');
    return { contenuto: corpo.scrollHeight, spazio: corpo.clientHeight };
  });
  controllo('la scheda «nuova spesa» sta tutta in una schermata', scheda.contenuto <= scheda.spazio, `${scheda.contenuto} su ${scheda.spazio} px`);
  await pagina.click('dialog[open] [data-azione="annulla"]');
  const piccoli = await pagina.evaluate(() => [...document.querySelectorAll('button, a')]
    .filter((elemento) => elemento.offsetParent !== null)
    .filter((elemento) => elemento.getBoundingClientRect().height < 44)
    .map((elemento) => elemento.textContent.trim().slice(0, 20)));
  controllo('spese: tutti i tasti sono alti almeno 44 px', piccoli.length === 0, piccoli.join(', '));
  await pagina.setViewportSize(SCHERMO);

  // ---- Spese ----
  titolo('Spese');
  await schermata(pagina, '01-spese-vuota');
  await pagina.click('#nuova-spesa');
  await pagina.click('dialog[open] [data-categoria="ristoranti"]'); // senza importo: deve rifiutare
  controllo('senza importo la spesa non viene salvata', (await pagina.locator('dialog[open] .suggerimento.errore').count()) === 1);
  await digita(pagina, '25,5');
  await pagina.click('dialog[open] [data-valuta="NZD"]');
  const anteprima = await pagina.textContent('#importo-eur');
  await schermata(pagina, '02-nuova-spesa');
  await pagina.click('dialog[open] [data-categoria="ristoranti"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  await pagina.waitForSelector('[data-voce]');
  const riga = await pagina.textContent('[data-voce]');
  controllo('nuova spesa: 25,50 NZD in Ristoranti e bar', riga.includes('25,50') && riga.includes('NZD') && riga.includes('Ristoranti'), riga.replace(/\s+/g, ' ').trim());
  const salvata = (await leggiDalDb(pagina, 'spese'))[0];
  controllo('conversione in euro salvata con la spesa', Math.abs(salvata.importoEur - 25.5 / tassi.NZD) < 0.001, `${anteprima} · cambio ${salvata.cambio}`);
  controllo('data e ora automatiche', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(salvata.data), salvata.data);

  await pagina.click('[data-voce]');
  await pagina.fill('dialog[open] [name="nota"]', 'Cena <al> porto');
  await pagina.click('dialog[open] [data-categoria="alimentari"]');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  await pagina.waitForFunction(() => document.querySelector('[data-voce]')?.textContent.includes('Cena <al> porto'));
  controllo('modifica: nota e categoria cambiate', (await pagina.textContent('[data-voce]')).includes('Spesa alimentare'));
  controllo('modifica: il cambio del giorno della spesa non cambia', (await leggiDalDb(pagina, 'spese'))[0].cambio === salvata.cambio);

  // Una seconda spesa, in baht, per avere due valute nei totali
  await pagina.click('#nuova-spesa');
  await digita(pagina, '300');
  await pagina.click('dialog[open] [data-valuta="THB"]');
  await pagina.click('dialog[open] [data-categoria="trasporti"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  await pagina.waitForFunction(() => document.querySelectorAll('[data-voce]').length === 2);
  const totaleAtteso = 25.5 / tassi.NZD + 300 / tassi.THB;
  const totaleMostrato = await pagina.textContent('.evidenza strong');
  controllo('totale del viaggio in euro', totaleMostrato.startsWith(totaleAtteso.toFixed(2).replace('.', ',')), `${totaleMostrato} (atteso ${totaleAtteso.toFixed(2)})`);
  await schermata(pagina, '03-spese');

  // ---- Convertitore ----
  titolo('Convertitore di valuta');
  await pagina.click('.barra-bassa [data-scheda="cambio"]');
  await pagina.waitForSelector('.riga-valuta');
  const attiva = await pagina.getAttribute('.riga-valuta[aria-pressed="true"]', 'data-valuta');
  controllo('parte dall’ultima valuta usata', attiva === 'THB', attiva);
  await pagina.setViewportSize(SCHERMO_UTILE);
  const convertitore = await pagina.evaluate(() => {
    const elenco = document.querySelector('.righe-valute');
    const ultimoTasto = document.querySelector('#vista .tastierino button:last-child').getBoundingClientRect();
    const barra = document.querySelector('.barra-bassa').getBoundingClientRect();
    const bassi = [...document.querySelectorAll('#vista button')].filter((tasto) => tasto.getBoundingClientRect().height < 44).length;
    return { contenuto: elenco.scrollHeight, spazio: elenco.clientHeight, tastierinoVisibile: ultimoTasto.bottom <= barra.top, bassi };
  });
  controllo('le 4 valute si vedono tutte senza scorrere (iPhone 13)', convertitore.contenuto <= convertitore.spazio, `${convertitore.contenuto} su ${convertitore.spazio} px`);
  controllo('il tastierino è tutto visibile', convertitore.tastierinoVisibile);
  controllo('tutti i tasti sono alti almeno 44 px', convertitore.bassi === 0);
  await pagina.setViewportSize(SCHERMO);
  await pagina.click('[data-valuta="EUR"]');
  await digita(pagina, '100');
  const leggiRiga = async (valuta) => (await pagina.textContent(`[data-valuta="${valuta}"] .riga-importo strong`)).trim();
  const formato = (numero) => numero.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: 'always' });
  controllo('100 EUR → NZD', (await leggiRiga('NZD')) === formato(100 * tassi.NZD), await leggiRiga('NZD'));
  controllo('100 EUR → THB', (await leggiRiga('THB')) === formato(100 * tassi.THB), await leggiRiga('THB'));
  controllo('100 EUR → TRY', (await leggiRiga('TRY')) === formato(100 * tassi.TRY), await leggiRiga('TRY'));
  await schermata(pagina, '04-cambio');
  await pagina.click('[data-valuta="NZD"]'); // ora si scrive in NZD partendo dal valore mostrato
  controllo('toccando un’altra riga si scrive in quella valuta', (await pagina.getAttribute('.riga-valuta[aria-pressed="true"]', 'data-valuta')) === 'NZD');
  await digita(pagina, '50');
  controllo('il primo numero sostituisce il valore precedente', (await leggiRiga('NZD')) === '50', await leggiRiga('NZD'));
  controllo('50 NZD → EUR', (await leggiRiga('EUR')) === formato(50 / tassi.NZD), await leggiRiga('EUR'));

  await pagina.click('#come-spesa');
  controllo('«Salva come spesa» porta importo e valuta nella scheda', (await pagina.textContent('#importo')).replace(/\s/g, '') === '50NZD');
  await pagina.click('dialog[open] [data-categoria="alloggio"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  controllo('spesa creata dal convertitore', (await leggiDalDb(pagina, 'spese')).length === 3);

  // ---- Itinerario ----
  titolo('Itinerario');
  await pagina.click('.barra-bassa [data-scheda="itinerario"]');
  await pagina.click('#nuovo-giorno');
  await pagina.fill('dialog[open] [name="data"]', '2026-11-20');
  await pagina.fill('dialog[open] [name="titolo"]', 'Istanbul: centro storico');
  await pagina.fill('dialog[open] [name="note"]', 'Volo alle 22:40');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('#nuova-attivita');
  controllo('nuovo giorno: si apre la sua pagina con la data nel titolo', (await pagina.textContent('#titolo')) === 'venerdì 20 novembre', await pagina.textContent('#titolo'));

  await pagina.click('#nuova-attivita');
  await pagina.fill('dialog[open] [name="titolo"]', 'Cena sul Bosforo');
  await pagina.fill('dialog[open] [name="ora"]', '20:00');
  await pagina.fill('dialog[open] [name="luogo"]', 'Karaköy, Istanbul');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('.attivita');

  await pagina.click('#incolla-scaletta');
  await pagina.fill('dialog[open] [name="testo"]', '9:00 Colazione\n10:30 Santa Sofia @ Sultanahmet\n13h Pranzo al Gran Bazar\nPasseggiata');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForFunction(() => document.querySelectorAll('.attivita').length === 5);
  const titoli = await pagina.locator('.attivita strong').allTextContents();
  controllo('scaletta in ordine di orario', titoli.join('|') === 'Colazione|Santa Sofia|Pranzo al Gran Bazar|Cena sul Bosforo|Passeggiata', titoli.join(' | '));

  await pagina.click('.attivita:first-child .spunta');
  await pagina.waitForSelector('.attivita.fatta');
  controllo('spunta fatto/da fare', (await pagina.textContent('.titolo-sezione')).includes('1 di 5 fatte'));
  const naviga = await pagina.getAttribute('.attivita:nth-child(2) .tasto-naviga', 'href');
  controllo('«Naviga» apre Apple Maps verso il luogo', naviga === 'https://maps.apple.com/?daddr=Sultanahmet', naviga);
  await schermata(pagina, '05-giorno');

  await pagina.click('#indietro');
  await pagina.waitForSelector('.giorno-carta');
  controllo('elenco dei giorni con avanzamento', (await pagina.textContent('.giorno-carta')).includes('1 di 5 fatte'));
  await schermata(pagina, '06-itinerario');

  // ---- Mappa ----
  titolo('Mappa e posizione dei luoghi');
  await pagina.click('.giorno-carta');
  await pagina.click('.attivita:nth-child(2) .attivita-testo'); // Santa Sofia @ Sultanahmet
  await pagina.click('dialog[open] [data-azione="posizione"]');
  await pagina.waitForSelector('#mappa-luogo .leaflet-tile-loaded', { timeout: 20_000 });
  await pagina.fill('[name="ricerca"]', 'Santa Sofia, Istanbul');
  await pagina.click('[data-azione="cerca"]');
  await pagina.waitForSelector('[data-risultato="0"]', { timeout: 20_000 });
  controllo('ricerca del luogo per nome (Nominatim)', true, (await pagina.textContent('[data-risultato="0"]')).replace(/\s+/g, ' ').trim().slice(0, 70));
  await pagina.click('[data-risultato="0"]');
  await schermata(pagina, '11-scegli-luogo');
  await pagina.click('dialog:has(#mappa-luogo) button[type="submit"]');
  await pagina.waitForSelector('#mappa-luogo', { state: 'detached' });
  controllo('la scheda dell’attività mostra «Posizione impostata»', (await pagina.textContent('[data-azione="posizione"]')).includes('Posizione impostata'));
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  const santaSofia = (await leggiDalDb(pagina, 'giorni'))[0].attivita.find((voce) => voce.titolo === 'Santa Sofia').luogo;
  controllo('coordinate salvate (Istanbul)', Math.abs(santaSofia.lat - 41.0) < 0.1 && Math.abs(santaSofia.lon - 28.98) < 0.1, `${santaSofia.nome}: ${santaSofia.lat}, ${santaSofia.lon}`);
  controllo('«Naviga» ora usa le coordinate', (await pagina.getAttribute('.attivita:nth-child(2) .tasto-naviga', 'href')).includes(encodeURIComponent(`${santaSofia.lat},${santaSofia.lon}`)));

  await pagina.click('a[href^="#/mappa/"]'); // «Mappa del giorno»
  await pagina.waitForSelector('#mappa-viaggio .segnaposto');
  controllo('mappa del giorno: 1 luogo con posizione, 1 da trovare', (await pagina.locator('.segnaposto').count()) === 1 && (await pagina.textContent('.avviso')).includes('1 luogo'));
  await pagina.click('#trova-posizioni');
  await pagina.waitForFunction(() => document.querySelectorAll('.segnaposto').length === 2, null, { timeout: 25_000 });
  controllo('«Trovali» trova la posizione del luogo che aveva solo il nome', true);
  controllo('punti numerati in ordine e uniti da una linea', (await pagina.locator('.segnaposto').allTextContents()).join() === '1,2' && (await pagina.locator('#mappa-viaggio path.leaflet-interactive').count()) === 1);
  await pagina.waitForSelector('#mappa-viaggio .leaflet-tile-loaded', { timeout: 20_000 });
  await pagina.waitForTimeout(1500); // lascia arrivare (e salvare) tutte le tessere
  await pagina.click('.segnaposto >> nth=0');
  controllo('toccando un punto: titolo, orario e «Naviga»', (await pagina.textContent('.leaflet-popup-content')).includes('1. Santa Sofia') && (await pagina.locator('.leaflet-popup-content .popup-naviga').count()) === 2);
  await schermata(pagina, '12-mappa');
  await pagina.click('.barra-bassa [data-scheda="mappa"]');
  await pagina.waitForSelector('.filtro-giorni a[aria-current="true"]:has-text("Tutti")');
  controllo('mappa di tutto il viaggio', (await pagina.locator('.segnaposto').count()) === 2 && (await pagina.textContent('#titolo')) === 'Mappa');

  // ---- Impostazioni e backup ----
  titolo('Impostazioni e backup');
  await pagina.click('.barra-bassa [data-scheda="impostazioni"]');
  await pagina.waitForSelector('#esporta-backup');
  await schermata(pagina, '07-impostazioni');

  await pagina.click('[data-valuta="TRY"]');
  await pagina.fill('dialog[open] [name="cambio"]', '60');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForFunction(() => document.querySelector('[data-valuta="TRY"]')?.textContent.includes('manuale'));
  controllo('cambio manuale impostato', (await pagina.textContent('[data-valuta="TRY"]')).includes('60,0000'));

  await pagina.click('#aggiungi-valuta');
  await pagina.fill('dialog[open] [name="codice"]', 'usd');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('#vista [data-valuta="USD"]');
  controllo('valuta aggiunta (USD)', (await pagina.textContent('#vista [data-valuta="USD"]')).includes('dollaro statunitense'));

  await pagina.click('#aggiungi-categoria');
  await pagina.fill('dialog[open] [name="nome"]', 'Regali');
  await pagina.fill('dialog[open] [name="emoji"]', '🎁');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForFunction(() => document.querySelectorAll('#vista [data-categoria]').length === 10);
  controllo('categoria aggiunta (Regali)', (await pagina.locator('#vista [data-categoria]').last().textContent()).includes('Regali'));

  await pagina.click('[data-mappe="google"]');
  await pagina.waitForSelector('[data-mappe="google"][aria-pressed="true"]');

  const [scaricoBackup] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#esporta-backup')]);
  const fileBackup = await scaricoBackup.path();
  const backup = JSON.parse(fs.readFileSync(fileBackup, 'utf8'));
  controllo('backup JSON: nome del file', /^viaggio-backup-\d{4}-\d{2}-\d{2}\.json$/.test(scaricoBackup.suggestedFilename()), scaricoBackup.suggestedFilename());
  controllo('backup JSON: contiene spese, giorni e impostazioni', backup.app === 'viaggio' && backup.spese.length === 3 && backup.giorni.length === 1 && backup.impostazioni.length >= 4);
  await pagina.waitForFunction(() => document.querySelector('#vista')?.textContent.includes('Ultimo backup:'));

  const [scaricoCsv] = await Promise.all([pagina.waitForEvent('download'), pagina.click('#esporta-csv')]);
  const csv = fs.readFileSync(await scaricoCsv.path(), 'utf8');
  const righeCsv = csv.replace('﻿', '').split('\r\n');
  controllo('CSV: intestazione e una riga per spesa', righeCsv.length === 4 && righeCsv[0].startsWith('Data;Ora;Tipo;Importo;Valuta'), righeCsv[1]);
  const rigaCena = righeCsv.find((rigaCsv) => rigaCsv.includes(';Spesa;25,50;NZD;')) ?? '';
  controllo('CSV: decimali con la virgola e testo conservato', rigaCena.endsWith('Spesa alimentare;Cena <al> porto'), rigaCena);

  // Cancello una spesa e poi importo il backup: deve tornare tutto com'era.
  await pagina.click('.barra-bassa [data-scheda="spese"]');
  await pagina.click('[data-voce]');
  await pagina.click('dialog[open] [data-azione="elimina"]');
  await pagina.waitForFunction(() => document.querySelectorAll('[data-voce]').length === 2);
  await pagina.click('.barra-bassa [data-scheda="impostazioni"]');
  await pagina.waitForSelector('#importa-backup');
  await pagina.setInputFiles('#importa-backup', { name: 'backup.json', mimeType: 'application/json', buffer: fs.readFileSync(fileBackup) });
  await pagina.waitForFunction(() => document.querySelector('#toast')?.textContent === 'Backup importato');
  controllo('importazione del backup: le 3 spese sono tornate', (await leggiDalDb(pagina, 'spese')).length === 3);

  await pagina.setInputFiles('#importa-backup', { name: 'sbagliato.json', mimeType: 'application/json', buffer: Buffer.from('{"ciao":1}') });
  await pagina.waitForTimeout(300);
  controllo('un file che non è un backup viene rifiutato', (await leggiDalDb(pagina, 'spese')).length === 3);

  // ---- Offline ----
  titolo('Funzionamento offline');
  await pagina.click('.barra-bassa [data-scheda="spese"]');
  await contesto.setOffline(true);
  await pagina.reload();
  await pagina.waitForSelector('[data-voce]');
  controllo('offline: l’app si apre e i dati ci sono', (await pagina.locator('[data-voce]').count()) === 3);
  await pagina.click('#nuova-spesa');
  await digita(pagina, '12');
  await pagina.click('dialog[open] [data-valuta="TRY"]');
  await pagina.click('dialog[open] [data-categoria="altro"]');
  await pagina.waitForFunction(() => document.querySelectorAll('[data-voce]').length === 4);
  const speseOffline = await leggiDalDb(pagina, 'spese');
  controllo('offline: nuova spesa con il cambio manuale (60)', speseOffline.some((spesa) => spesa.valuta === 'TRY' && spesa.cambio === 60));
  await pagina.click('.barra-bassa [data-scheda="cambio"]');
  await pagina.waitForSelector('.riga-valuta');
  await pagina.click('[data-valuta="EUR"]');
  await digita(pagina, '10');
  controllo('offline: il convertitore usa i cambi salvati', (await leggiRiga('TRY')) === '600,00', await leggiRiga('TRY'));
  await pagina.click('#aggiorna-cambi');
  await pagina.waitForFunction(() => document.querySelector('#toast')?.textContent.includes('offline'));
  controllo('offline: «Aggiorna cambi» avvisa senza errori', true);
  await pagina.click('.barra-bassa [data-scheda="itinerario"]');
  await pagina.click('.giorno-carta');
  await pagina.waitForSelector('.attivita');
  controllo('offline: itinerario disponibile', (await pagina.locator('.attivita').count()) === 5);
  await pagina.click('.barra-bassa [data-scheda="mappa"]');
  await pagina.waitForSelector('#mappa-viaggio .segnaposto');
  await pagina.waitForSelector('#mappa-viaggio .leaflet-tile-loaded', { timeout: 10_000 }).catch(() => {});
  controllo('offline: la mappa già vista si rivede (punti e tessere salvate)', (await pagina.locator('.segnaposto').count()) === 2 && (await pagina.locator('#mappa-viaggio .leaflet-tile-loaded').count()) > 0);
  await pagina.click('.barra-bassa [data-scheda="itinerario"]');
  await pagina.click('.giorno-carta');
  await pagina.waitForSelector('.attivita');
  controllo('«Naviga» segue la scelta Google Maps', (await pagina.getAttribute('.tasto-naviga', 'href')).startsWith('https://www.google.com/maps/dir/?api=1&destination='));
  await contesto.setOffline(false);

  // ---- Aggiornamento dell'app ----
  titolo('Aggiornamento a una nuova versione');
  server.versioneFinta = 'v2-prova'; // una versione che ancora non esiste
  await pagina.goto(`${indirizzo}#/impostazioni`);
  await pagina.waitForSelector('#controlla-aggiornamenti');
  await pagina.click('#controlla-aggiornamenti');
  await pagina.waitForSelector('#avviso-aggiornamento:not([hidden])', { timeout: 15_000 });
  controllo('compare l’avviso «Nuova versione disponibile»', true);
  await Promise.all([pagina.waitForEvent('load'), pagina.click('#avviso-aggiornamento button')]);
  await pagina.waitForFunction(() => document.querySelector('#vista')?.textContent.includes('versione v2-prova'), null, { timeout: 15_000 });
  controllo('dopo «Aggiorna» è attiva la versione nuova', true);
  controllo('i dati sopravvivono all’aggiornamento', (await leggiDalDb(pagina, 'spese')).length === 4);
  const cacheRimaste = await pagina.evaluate(() => caches.keys());
  controllo('la cache della versione vecchia è stata eliminata', cacheRimaste.filter((nome) => nome.startsWith('viaggio-')).join() === 'viaggio-v2-prova', cacheRimaste.join());
  controllo('le tessere della mappa salvate restano', cacheRimaste.includes('mappe-viaggio'));
  server.versioneFinta = null;

  // ---- Entrate e saldo disponibile ----
  titolo('Entrate (soldi ricevuti)');
  await pagina.goto(`${indirizzo}#/spese`);
  await pagina.waitForSelector('#nuova-entrata');
  controllo('senza entrate si vede «Speso in totale»', (await pagina.textContent('.evidenza .etichetta')) === 'Speso in totale');
  const spesoPrima = (await leggiDalDb(pagina, 'spese')).reduce((totale, voce) => totale + voce.importoEur, 0);
  await pagina.click('#nuova-entrata');
  await pagina.waitForSelector('dialog[open] [data-azione="aggiungi-entrata"]');
  controllo('la scheda dell’entrata non chiede una categoria', (await pagina.locator('dialog[open] [data-categoria]').count()) === 0);
  await digita(pagina, '2000');
  await pagina.click('dialog[open] [data-valuta="NZD"]');
  await pagina.fill('dialog[open] [name="nota"]', 'Stipendio');
  await pagina.click('dialog[open] [data-azione="aggiungi-entrata"]');
  await pagina.waitForSelector('.riga.entrata');
  const tassoNzd = (await leggiDalDb(pagina, 'impostazioni', 'cambi')).valore.tassi.NZD;
  const disponibileAtteso = 2000 / tassoNzd - spesoPrima;
  const disponibileMostrato = await pagina.textContent('.evidenza strong');
  controllo('«Disponibile» = entrate − spese', (await pagina.textContent('.evidenza .etichetta')) === 'Disponibile' && disponibileMostrato === `${formato(disponibileAtteso)} €`, `${disponibileMostrato} (atteso ${disponibileAtteso.toFixed(2)})`);
  controllo('l’entrata è in elenco con il segno +', (await pagina.textContent('.riga.entrata')).includes('+ 2.000,00 NZD'));
  const totaleGiorno = await pagina.textContent('.titolo-sezione span:last-child');
  controllo('il totale del giorno conta solo le spese', totaleGiorno === `${formato(spesoPrima)} €`, totaleGiorno);
  await schermata(pagina, '13-spese-con-entrata');

  // ---- Cartelle e attività a tappe ----
  titolo('Cartelle e attività con più tappe');
  await pagina.click('.barra-bassa [data-scheda="itinerario"]');
  await pagina.click('#nuovo-giorno');
  await pagina.fill('dialog[open] [name="data"]', '2026-11-25');
  await pagina.fill('dialog[open] [name="titolo"]', 'Templi e fiume');
  await pagina.fill('dialog[open] [name="cartella"]', 'Bangkok');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('#nuova-attivita');
  controllo('dal giorno la freccia riporta alla sua cartella', (await pagina.getAttribute('#indietro', 'href')) === '#/itinerario/Bangkok');

  await pagina.click('#incolla-scaletta');
  await pagina.fill('dialog[open] [name="testo"]', '16:00 Giro dei templi @ Wat Pho Bangkok > Wat Arun Bangkok');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('.attivita');
  controllo('la scaletta mostra le tappe in fila', (await pagina.textContent('.attivita')).includes('Wat Pho Bangkok → Wat Arun Bangkok'));
  controllo('il tasto diventa «Percorso» e apre Google Maps con le tappe', (await pagina.textContent('.tasto-naviga')) === 'Percorso'
    && (await pagina.getAttribute('.tasto-naviga', 'href')) === 'https://www.google.com/maps/dir/?api=1&destination=Wat%20Arun%20Bangkok&waypoints=Wat%20Pho%20Bangkok&travelmode=walking', await pagina.getAttribute('.tasto-naviga', 'href'));

  await pagina.click('.attivita-testo');
  await pagina.waitForSelector('dialog[open] [data-tappa]');
  await pagina.click('dialog[open] [data-azione="aggiungi-tappa"]');
  await pagina.waitForSelector('#mappa-luogo.leaflet-container');
  await pagina.fill('[name="ricerca"]', '13.7500, 100.4913');
  await pagina.click('[data-azione="cerca"]');
  await pagina.waitForFunction(() => document.querySelector('#messaggio-luogo')?.textContent.includes('Posizione letta'));
  await pagina.fill('[name="ricerca"]', 'Grand Palace');
  await pagina.click('dialog:has(#mappa-luogo) button[type="submit"]');
  await pagina.waitForSelector('#mappa-luogo', { state: 'detached' });
  controllo('tappa aggiunta incollando le coordinate', (await pagina.locator('dialog[open] [data-tappa]').count()) === 2 && (await pagina.textContent('#elenco-tappe')).includes('Grand Palace'));
  await pagina.click('dialog[open] [data-mezzo="auto"]');
  await schermata(pagina, '14-attivita-con-tappe');
  await pagina.click('dialog[open] button[type="submit"]');
  await pagina.waitForSelector('dialog[open]', { state: 'detached' });
  const percorso = await pagina.getAttribute('.tasto-naviga', 'href');
  controllo('percorso con tre tappe, in auto', percorso === 'https://www.google.com/maps/dir/?api=1&destination=13.75%2C100.4913&waypoints=Wat%20Pho%20Bangkok%7CWat%20Arun%20Bangkok&travelmode=driving', percorso);

  await pagina.click('#indietro');
  await pagina.waitForFunction(() => document.querySelector('#titolo').textContent === 'Bangkok');
  controllo('dentro la cartella c’è il suo giorno', (await pagina.locator('.giorno-carta').count()) === 1 && (await pagina.textContent('.giorno-carta')).includes('Templi e fiume'));
  await pagina.click('#indietro');
  await pagina.waitForSelector('.cartella-carta');
  controllo('elenco principale: una cartella e un giorno sciolto', (await pagina.locator('.cartella-carta').count()) === 1 && (await pagina.locator('.giorno-carta').count()) === 2 && (await pagina.textContent('.cartella-carta')).includes('1 giorno'));
  await schermata(pagina, '15-itinerario-cartelle');
  await pagina.click('.barra-bassa [data-scheda="mappa"]');
  await pagina.waitForFunction(() => document.querySelectorAll('.segnaposto').length === 3);
  controllo('mappa: la tappa con coordinate compare, le altre sono «da trovare»', (await pagina.textContent('.avviso')).includes('2 luoghi'));

  // ---- Tema scuro (solo schermate) ----
  if (CARTELLA_SCHERMATE) {
    await pagina.setViewportSize(SCHERMO);
    await pagina.emulateMedia({ colorScheme: 'dark' });
    await pagina.goto(`${indirizzo}#/spese`);
    await pagina.waitForSelector('[data-voce]');
    await schermata(pagina, '08-spese-scuro');
    await pagina.click('.barra-bassa [data-scheda="cambio"]');
    await pagina.waitForSelector('.riga-valuta');
    await pagina.click('[data-valuta="EUR"]');
    await digita(pagina, '100');
    await schermata(pagina, '09-cambio-scuro');
    await pagina.click('.barra-bassa [data-scheda="spese"]');
    await pagina.click('#nuova-spesa');
    await pagina.waitForSelector('dialog[open] .griglia-categorie');
    await digita(pagina, '48');
    await schermata(pagina, '10-nuova-spesa-scuro');
  }

  titolo('Console del browser');
  controllo('nessun errore in console durante tutte le prove', errori.length === 0, errori.join(' | '));

  await browser.close();
}

// ---------- Si parte ------------------------------------------------------------

(async () => {
  controllaElencoServiceWorker();
  await controllaFunzioniPure();
  const web = await avviaServer();
  try {
    await provaNelBrowser(web.indirizzo);
  } catch (errore) {
    const riga = errore.stack?.match(/verifica\.cjs:(\d+)/)?.[1];
    controllo('le prove nel browser sono arrivate fino in fondo', false, `${String(errore).split('\n')[0]} (riga ${riga})`);
  } finally {
    web.chiudi();
  }
  console.log(falliti === 0 ? '\nTutto a posto.' : `\n${falliti} controlli non superati.`);
  process.exit(falliti === 0 ? 0 : 1);
})();
