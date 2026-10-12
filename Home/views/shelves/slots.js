// RECORDS → the fifteen slots. The middle shelf (eye level) takes the records in
// order; the top and bottom shelves take whatever is left, then Coming Soon
// placeholders cycling the Coming Soon plates. Change SLOT_ORDER to rearrange.

import { COLS, ROWS } from './layout.js';

/** Slots in fill order: middle row, then top, then bottom; left to right. */
export const SLOT_ORDER = (() => {
  const out = [];
  for (const row of [1, 0, 2]) for (let col = 0; col < COLS; col++) out.push({ row, col });
  return out;
})();

/**
 * @returns {Array<{row, col, record, index, placeholder}>} — `index` is the record's
 * position in RECORDS (−1 for a placeholder); `record` is the record whose cover
 * and title the slot shows.
 */
export function buildSlots(records) {
  const soon = records.filter((r) => r.status !== 'available');
  const slots = [];
  SLOT_ORDER.forEach(({ row, col }, i) => {
    if (i < records.length) slots.push({ row, col, record: records[i], index: i, placeholder: false });
    else {
      const k = i - records.length;
      const r = soon.length ? soon[k % soon.length] : records[records.length - 1];
      slots.push({ row, col, record: r, index: -1, placeholder: true });
    }
  });
  // row-major order (top shelf first, left to right): the keyboard grid's order
  slots.sort((a, b) => a.row - b.row || a.col - b.col);
  return slots;
}

export const SLOT_COUNT = COLS * ROWS;
export const shelfName = (row) => ['Top shelf', 'Middle shelf', 'Bottom shelf'][row];
