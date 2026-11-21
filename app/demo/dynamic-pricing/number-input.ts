import type { KeyboardEvent } from "react";

// Vietnamese style, like every price on the site: 1.600.000 with dots between thousands, and a
// comma before any fraction (120,5).
const GROUP = ".";
const DECIMAL = ",";
export const integerFormat = new Intl.NumberFormat("vi-VN");
/** whole numbers: 1.600.000 */
export const INTEGER_PATTERN = "[0-9]{1,3}(\\.[0-9]{3})*";
/** numbers that may have a fraction: 1.000 or 120,5 or ,5 */
export const DECIMAL_PATTERN = "([0-9]{1,3}(\\.[0-9]{3})*(,[0-9]*)?|,[0-9]+)";

export function readAmount(form: FormData, key: string) {
  return Number(String(form.get(key)).replaceAll(GROUP, "").replace(DECIMAL, "."));
}

export function groupAmount(input: HTMLInputElement) {
  const raw = input.value;
  const [integer, fraction, extra] = raw.replaceAll(GROUP, "").split(DECIMAL);
  if (!/^\d{1,10}$/.test(integer) || extra !== undefined) return;
  if (fraction !== undefined && (input.inputMode !== "decimal" || !/^\d*$/.test(fraction))) return;
  const formatted = integerFormat.format(Number(integer)) + (fraction === undefined ? "" : DECIMAL + fraction);
  if (formatted === raw) return;
  const digitsLeft = raw.slice(0, input.selectionStart ?? raw.length).replaceAll(GROUP, "").length;
  input.value = formatted;
  let caret = 0;
  let seen = 0;
  while (seen < digitsLeft && caret < formatted.length) {
    if (formatted[caret++] !== GROUP) seen++;
  }
  input.setSelectionRange(caret, caret);
}

export function skipGroupSeparator(e: KeyboardEvent<HTMLInputElement>) {
  const input = e.currentTarget;
  const at = input.selectionStart;
  if (at === null || at !== input.selectionEnd || e.altKey || e.metaKey || e.ctrlKey) return;
  if (e.key === "Backspace" && input.value[at - 1] === GROUP) input.setSelectionRange(at - 1, at - 1);
  if (e.key === "Delete" && input.value[at] === GROUP) input.setSelectionRange(at + 1, at + 1);
}
