// ==========================================================================
// Rateio de Faturas — Estado global da aplicação
// ==========================================================================
import { mesAtual } from './format.js';

// Estado global da aplicação
export const S = {
  tab: 'inicio',
  fat: null,
  pessoa: null,
  mes: mesAtual(),
  msgs: [],
  g: {},
  l: null,
  imp: null,
  ff: 'todas',
  editP: null,
  rmode: 'v',
  rt: [],
  ps: [],
  fatTab: 'lancamentos' // 'lancamentos' | 'resumo'
};
