// Seats are just numbers 1..capacity. These helpers turn a number into what people
// read ("B-07") and split big zones into blocks; shared by the server and the seat map.

export const MAX_SEATS_PER_ORDER = 5;
export const SEATS_PER_ROW = 20;
/** the map shows one block at a time, since a zone can have 18,000 seats */
export const SEATS_PER_BLOCK = 400;

/** 0 → A, 25 → Z, 26 → AA, like spreadsheet columns */
export function rowName(index: number): string {
  let name = "";
  for (let n = index; n >= 0; n = Math.floor(n / 26) - 1) {
    name = String.fromCharCode(65 + (n % 26)) + name;
  }
  return name;
}

export function seatRow(seat: number): string {
  return rowName(Math.floor((seat - 1) / SEATS_PER_ROW));
}

export function seatColumn(seat: number): number {
  return ((seat - 1) % SEATS_PER_ROW) + 1;
}

export function seatLabel(seat: number): string {
  return `${seatRow(seat)}-${String(seatColumn(seat)).padStart(2, "0")}`;
}

export function blockCount(capacity: number): number {
  return Math.ceil(capacity / SEATS_PER_BLOCK);
}

/** first and last seat of a 0-based block */
export function blockRange(block: number, capacity: number): [number, number] {
  const first = block * SEATS_PER_BLOCK + 1;
  return [first, Math.min(first + SEATS_PER_BLOCK - 1, capacity)];
}

export function blockOf(seat: number): number {
  return Math.floor((seat - 1) / SEATS_PER_BLOCK);
}
