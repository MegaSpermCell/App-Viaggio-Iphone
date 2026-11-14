// db.js – salvataggio dei dati sul telefono con IndexedDB.
//
// IndexedDB è un piccolo database dentro il browser: i dati restano sul
// telefono e non vengono mandati da nessuna parte. Usiamo tre "archivi":
//
//   spese         una riga per ogni spesa               (chiave: id)
//   giorni        una riga per ogni giorno di viaggio,
//                 con dentro la sua scaletta di attività (chiave: id)
//   impostazioni  coppie chiave → valore                 (chiave: chiave)
//
// IndexedDB lavora "a eventi" (onsuccess, onerror). Per poter scrivere il più
// comodo `await`, ogni richiesta viene trasformata in una Promise da attendi().

const NOME_DB = 'viaggio';
const VERSIONE_DB = 1;

export const ARCHIVI = ['spese', 'giorni', 'impostazioni'];

let promessaDb = null; // il database si apre una volta sola, poi si riusa

function attendi(richiesta) {
  return new Promise((risolvi, rifiuta) => {
    richiesta.onsuccess = () => risolvi(richiesta.result);
    richiesta.onerror = () => rifiuta(richiesta.error);
  });
}

function apri() {
  if (!promessaDb) {
    const richiesta = indexedDB.open(NOME_DB, VERSIONE_DB);
    // Scatta solo la prima volta (o quando VERSIONE_DB aumenta): qui si creano gli archivi.
    richiesta.onupgradeneeded = () => {
      const db = richiesta.result;
      for (const nome of ARCHIVI) {
        if (!db.objectStoreNames.contains(nome)) {
          db.createObjectStore(nome, { keyPath: nome === 'impostazioni' ? 'chiave' : 'id' });
        }
      }
    };
    promessaDb = attendi(richiesta);
  }
  return promessaDb;
}

async function archivio(nome, modo = 'readonly') {
  const db = await apri();
  return db.transaction(nome, modo).objectStore(nome);
}

// ---------- Operazioni di base ----------------------------------------------

/** Tutte le righe di un archivio, es. tutti('spese'). */
export async function tutti(nome) {
  return attendi((await archivio(nome)).getAll());
}

/** Una riga sola, cercata per chiave. Se non esiste restituisce undefined. */
export async function leggi(nome, chiave) {
  return attendi((await archivio(nome)).get(chiave));
}

/** Aggiunge una riga, o la sostituisce se esiste già una riga con la stessa chiave. */
export async function salva(nome, oggetto) {
  return attendi((await archivio(nome, 'readwrite')).put(oggetto));
}

export async function elimina(nome, chiave) {
  return attendi((await archivio(nome, 'readwrite')).delete(chiave));
}

// ---------- Impostazioni -----------------------------------------------------

/** Legge un'impostazione; se non è mai stata salvata restituisce `predefinito`. */
export async function leggiImpostazione(chiave, predefinito) {
  const riga = await leggi('impostazioni', chiave);
  return riga ? riga.valore : predefinito;
}

export async function salvaImpostazione(chiave, valore) {
  return salva('impostazioni', { chiave, valore });
}

// ---------- Backup e protezione dei dati -------------------------------------

/**
 * Sostituisce TUTTI i dati con quelli di un backup. Tutto avviene in un'unica
 * "transazione": se qualcosa va storto a metà, i dati di prima restano intatti.
 */
export async function sostituisciTutto(dati) {
  const db = await apri();
  const transazione = db.transaction(ARCHIVI, 'readwrite');
  for (const nome of ARCHIVI) {
    const archivioAperto = transazione.objectStore(nome);
    archivioAperto.clear();
    for (const riga of dati[nome] ?? []) archivioAperto.put(riga);
  }
  return new Promise((risolvi, rifiuta) => {
    transazione.oncomplete = () => risolvi();
    transazione.onerror = () => rifiuta(transazione.error);
    transazione.onabort = () => rifiuta(transazione.error);
  });
}

/**
 * Chiede al browser di non cancellare mai i dati per fare spazio.
 * Restituisce true se la protezione è attiva.
 */
export async function chiediPersistenza() {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted()) return true;
  return navigator.storage.persist();
}

export async function datiProtetti() {
  return (await navigator.storage?.persisted?.()) ?? false;
}
