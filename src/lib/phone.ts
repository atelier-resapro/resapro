/**
 * French phone number check. Same rules as the `reserver` SQL function:
 * accepts 06 12 34 56 78, 0612345678, +33 6 12 34 56 78, 0033612345678
 * and returns the normalised form 0612345678 (or null if invalid).
 */
export function normaliserTelephone(input: string): string | null {
  let tel = input.replace(/[\s.-]/g, "");
  if (/^\+33[1-9]\d{8}$/.test(tel)) tel = "0" + tel.slice(3);
  else if (/^0033[1-9]\d{8}$/.test(tel)) tel = "0" + tel.slice(4);
  return /^0[1-9]\d{8}$/.test(tel) ? tel : null;
}

/** 0612345678 -> "06 12 34 56 78" */
export function formatTelephone(tel: string): string {
  return tel.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}
