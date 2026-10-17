import {normalizeHouseAddress} from './election.js';

// Reviewed exceptions stay in a server-only environment variable, never public
// assets or source control. Bind each correction to its source, row and input.
export function readAddressCorrections(text, spreadsheetId, gid) {
  if (!text) return [];
  const config = JSON.parse(text);
  if (!config || typeof config.spreadsheetId !== 'string' ||
      !Number.isSafeInteger(config.gid) || !Array.isArray(config.entries) ||
      config.entries.length > 1000) throw new Error('CONFIG_INVALID');
  const seen = new Set();
  const entries = config.entries.map(entry => {
    if (!entry || !Number.isSafeInteger(entry.row) || entry.row < 2 || seen.has(entry.row) ||
        typeof entry.expectedAddress !== 'string' || !entry.expectedAddress.trim() || entry.expectedAddress.length > 256 ||
        typeof entry.correctedAddress !== 'string' || !/^[1-9]\d*\/[1-9]\d*[A-Z]?$/.test(entry.correctedAddress) ||
        !normalizeHouseAddress(entry.correctedAddress)) throw new Error('CONFIG_INVALID');
    seen.add(entry.row);
    return {row:entry.row, expectedAddress:entry.expectedAddress, correctedAddress:entry.correctedAddress};
  });
  return config.spreadsheetId === spreadsheetId && config.gid === gid ? entries : [];
}

export function applyAddressCorrections(rows, addressColumn, corrections) {
  if (!corrections.length) return rows;
  const result = rows.slice();
  for (const correction of corrections) {
    const index = correction.row - 2;
    const row = result[index];
    if (!row) throw new Error('CORRECTION_STALE');
    // An owner can also fix the source cell to the same reviewed house.
    if (normalizeHouseAddress(row[addressColumn])?.key === correction.correctedAddress) continue;
    if (row[addressColumn] !== correction.expectedAddress) throw new Error('CORRECTION_STALE');
    result[index] = row.slice();
    result[index][addressColumn] = correction.correctedAddress;
  }
  return result;
}
