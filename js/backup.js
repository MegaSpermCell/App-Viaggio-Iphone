// backup.js – esportare e importare i dati.
//
// I dati dell'app vivono solo sul telefono. Il backup è un file JSON (testo
// leggibile) con dentro tutto: spese, giorni e impostazioni. Tenerne una copia
// su iCloud/File o mandarsela per email è l'unica vera protezione se il
// telefono si rompe o se l'app viene tolta dalla schermata Home.

import { tutti, sostituisciTutto, salvaImpostazione, ARCHIVI } from './db.js';
import { leggiCategorie } from './dati.js';
import { oggi } from './util.js';

/** Prepara il file di backup con tutti i dati. */
export async function preparaBackup() {
  const backup = { app: 'viaggio', formato: 1, creato: new Date().toISOString() };
  for (const nome of ARCHIVI) backup[nome] = await tutti(nome);

  // JSON.stringify trasforma l'oggetto in testo; "null, 2" lo manda a capo e lo rende leggibile.
  const testo = JSON.stringify(backup, null, 2);
  return new File([testo], `viaggio-backup-${oggi()}.json`, { type: 'application/json' });
}

/**
 * Prepara il file CSV di spese ed entrate, da aprire con Numbers o Excel.
 * Usa il punto e virgola fra le colonne e la virgola nei decimali, come si
 * aspettano i fogli di calcolo impostati in italiano.
 */
export async function preparaCsv() {
  const spese = (await tutti('spese')).sort((a, b) => a.data.localeCompare(b.data) || a.creata - b.creata);
  const nomeCategoria = new Map((await leggiCategorie()).map((categoria) => [categoria.id, categoria.nome]));
  const numero = (valore, decimali = 2) => valore.toFixed(decimali).replace('.', ',');

  const righe = [['Data', 'Ora', 'Tipo', 'Importo', 'Valuta', 'Cambio (per 1 EUR)', 'Importo in EUR', 'Categoria', 'Nota']];
  for (const spesa of spese) {
    righe.push([
      spesa.data.slice(0, 10),
      spesa.data.slice(11),
      spesa.tipo === 'entrata' ? 'Entrata' : 'Spesa',
      numero(spesa.importo),
      spesa.valuta,
      numero(spesa.cambio, 4),
      numero(spesa.importoEur),
      nomeCategoria.get(spesa.categoriaId) ?? '',
      spesa.nota ?? '',
    ]);
  }

  // Una cella che contiene ; " o un "a capo" va chiusa fra virgolette (raddoppiando quelle interne).
  const cella = (valore) => (/[;"\n\r]/.test(valore) ? `"${valore.replaceAll('"', '""')}"` : valore);
  const testo = righe.map((riga) => riga.map(cella).join(';')).join('\r\n');

  // ﻿ è un segno invisibile che dice a Excel che il file è in UTF-8 (lettere accentate giuste).
  return new File([`﻿${testo}`], `viaggio-spese-${oggi()}.csv`, { type: 'text/csv' });
}

/**
 * Consegna un file all'utente. Restituisce false se l'utente ha annullato.
 * Su iPhone apre il foglio "Condividi" (da lì: Salva su File, AirDrop, Mail…);
 * dove non è possibile, fa partire un normale download.
 */
export async function consegnaFile(file) {
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (errore) {
      if (errore.name === 'AbortError') return false; // foglio chiuso senza scegliere nulla
      // altri errori: si prova con il download qui sotto
    }
  }

  const indirizzo = URL.createObjectURL(file);
  const link = document.createElement('a');
  link.href = indirizzo;
  link.download = file.name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(indirizzo), 60_000); // libera la memoria dopo un minuto
  return true;
}

/** Ricorda quando è stato fatto l'ultimo backup (serve al promemoria nella schermata Spese). */
export function segnaBackupFatto() {
  return salvaImpostazione('ultimoBackup', Date.now());
}

/** Legge un file di backup e controlla che sia valido. Se non lo è, lancia un errore. */
export async function leggiBackup(file) {
  let dati;
  try {
    dati = JSON.parse(await file.text());
  } catch {
    throw new Error('Il file non è leggibile.');
  }
  const valido = dati?.app === 'viaggio' && ARCHIVI.every((nome) => Array.isArray(dati[nome]));
  if (!valido) throw new Error('Questo file non è un backup di Viaggio.');
  return dati;
}

/** Sostituisce i dati sul telefono con quelli del backup. */
export function ripristinaBackup(dati) {
  return sostituisciTutto(dati);
}
