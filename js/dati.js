// dati.js – valute e categorie: i valori di partenza e come leggerli o salvarli.
//
// La prima volta l'app usa gli elenchi scritti qui sotto. Appena ne modifichi
// uno dalle Impostazioni, la tua versione viene salvata sul telefono e da quel
// momento è quella a valere.

import { leggiImpostazione, salvaImpostazione } from './db.js';

/** Tutti i totali vengono calcolati in questa valuta. */
export const VALUTA_BASE = 'EUR';

const VALUTE_INIZIALI = ['NZD', 'EUR', 'THB', 'TRY'];

const CATEGORIE_INIZIALI = [
  { id: 'alloggio', nome: 'Alloggio', emoji: '🛏️' },
  { id: 'alimentari', nome: 'Spesa alimentare', emoji: '🛒' },
  { id: 'ristoranti', nome: 'Ristoranti e bar', emoji: '🍽️' },
  { id: 'trasporti', nome: 'Trasporti', emoji: '🚌' },
  { id: 'carburante', nome: 'Carburante', emoji: '⛽' },
  { id: 'attivita', nome: 'Attività ed escursioni', emoji: '🥾' },
  { id: 'telefono', nome: 'Telefono/SIM', emoji: '📱' },
  { id: 'salute', nome: 'Salute', emoji: '💊' },
  { id: 'altro', nome: 'Altro', emoji: '🏷️' },
];

// structuredClone() fa una copia: chi riceve l'elenco può modificarlo
// senza toccare i valori di partenza scritti qui sopra.

/** Elenco dei codici delle valute, es. ['NZD', 'EUR', 'THB', 'TRY']. */
export const leggiValute = () => leggiImpostazione('valute', structuredClone(VALUTE_INIZIALI));
export const salvaValute = (valute) => salvaImpostazione('valute', valute);

/** Elenco delle categorie: oggetti { id, nome, emoji }. */
export const leggiCategorie = () => leggiImpostazione('categorie', structuredClone(CATEGORIE_INIZIALI));
export const salvaCategorie = (categorie) => salvaImpostazione('categorie', categorie);
