import { createHash } from 'node:crypto';
import { GoogleAuth } from 'google-auth-library';
import { calculateVoteTotals, normalizeCandidateAnswer } from './election.js';

const DEFAULT_SOURCE = '1SxVEYKqNxORxU3oqHrEFWq4_eJio0eFDEU8_g16gZAk';
const READ_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';
const HEADER_LABELS = {
  choice: ['Daftar Calon Ketua Paguyuban Periode 2026-2027'],
  address: ['Blok & Nomor Rumah'],
  timestamp: ['Timestamp', 'Stempel waktu', 'Cap waktu']
};

export class SourceError extends Error {
  constructor(code) { super(code); this.code = code; }
}

export function sourceMode(env = process.env) {
  return env.ELECTION_MODE === 'production' ? 'production' : 'dummy';
}

export function readConfiguration(env = process.env) {
  const spreadsheetId = env.GOOGLE_SPREADSHEET_ID || DEFAULT_SOURCE;
  const gidText = env.GOOGLE_SHEET_GID || '861129643';
  if (!/^[A-Za-z0-9_-]{20,}$/.test(spreadsheetId) || !/^\d+$/.test(gidText) ||
      (env.ELECTION_MODE && !['dummy','production'].includes(env.ELECTION_MODE))) throw new SourceError('CONFIG_INVALID');
  if (!Number.isSafeInteger(Number(gidText))) throw new SourceError('CONFIG_INVALID');
  if (env.ELECTION_MODE === 'production' && (!env.GOOGLE_SPREADSHEET_ID || !env.GOOGLE_SHEET_GID || spreadsheetId === DEFAULT_SOURCE)) throw new SourceError('CONFIG_INVALID');
  const registeredVoters = env.REGISTERED_VOTERS ? Number(env.REGISTERED_VOTERS) : null;
  if (registeredVoters !== null && (!Number.isSafeInteger(registeredVoters) || registeredVoters < 1)) throw new SourceError('CONFIG_INVALID');
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new SourceError('SOURCE_NOT_CONFIGURED');
  let raw;
  try { raw = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON); } catch { throw new SourceError('GOOGLE_AUTH_INVALID'); }
  if (raw.type !== 'service_account' || typeof raw.client_email !== 'string' ||
      !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(raw.client_email) ||
      typeof raw.private_key !== 'string' || !raw.private_key.startsWith('-----BEGIN PRIVATE KEY-----')) throw new SourceError('GOOGLE_AUTH_INVALID');
  // Keep only needed fields. The JSON cannot change token hosts or OAuth scopes.
  const credentials = { type: 'service_account', client_email: raw.client_email,
    private_key: raw.private_key.replace(/\\n/g,'\n'), project_id: raw.project_id };
  return { spreadsheetId, gid: Number(gidText), registeredVoters, credentials,
    mode: sourceMode(env), headers: { choice: env.CHOICE_HEADER || '',
      address: env.ADDRESS_HEADER || '', timestamp: env.TIMESTAMP_HEADER || '' } };
}

export function resolveColumns(headers, overrides = {}) {
  const columns = {};
  for (const key of ['choice','address','timestamp']) {
    const allowed = (overrides[key] ? [overrides[key]] : HEADER_LABELS[key]).map(normalizeCandidateAnswer);
    const positions = headers.flatMap((header,index) => allowed.includes(normalizeCandidateAnswer(header)) ? [index] : []);
    if (positions.length !== 1) throw new SourceError('HEADER_INVALID');
    columns[key] = positions[0];
  }
  if (new Set(Object.values(columns)).size !== 3) throw new SourceError('HEADER_INVALID');
  return columns;
}

export function sheetTimestamp(value) {
  // Sheets returns date/time serials with UNFORMATTED_VALUE. Comparing these
  // preserves source timestamp order; no locale-dependent text parsing.
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  const date = new Date(Math.round((value - 25569) * 86400000));
  return Number.isFinite(date.getTime()) ? date : null;
}

function columnName(number) {
  let name = '';
  while (number > 0) { number--; name = String.fromCharCode(65 + number % 26) + name; number = Math.floor(number / 26); }
  return name;
}

async function googleJson(url, token, fetchImpl) {
  let response;
  try { response = await fetchImpl(url, { headers: { Authorization: 'Bearer ' + token }, signal: AbortSignal.timeout(10000) }); }
  catch { throw new SourceError('SOURCE_UNAVAILABLE'); }
  if (!response.ok) {
    let details = {};
    try { details = await response.json(); } catch { /* sanitize unknown upstream body */ }
    const disabled = details.error?.details?.some(item => item.reason === 'SERVICE_DISABLED');
    if (disabled) throw new SourceError('GOOGLE_API_DISABLED');
    if (response.status === 403) throw new SourceError('SHEET_ACCESS_DENIED');
    if (response.status === 404) throw new SourceError('SHEET_NOT_FOUND');
    if (response.status === 429) throw new SourceError('SOURCE_BUSY');
    throw new SourceError('SOURCE_UNAVAILABLE');
  }
  try { return await response.json(); } catch { throw new SourceError('SOURCE_UNAVAILABLE'); }
}

export function createResultsService({env = process.env, fetchImpl = fetch, tokenProvider, now = Date.now} = {}) {
  let cached = null, pending = null, auth = null, authKey = '';
  async function accessToken(config, key) {
    if (tokenProvider) return tokenProvider(config);
    if (!auth || authKey !== key) {
      auth = new GoogleAuth({ credentials: config.credentials, scopes: [READ_SCOPE] }); authKey = key;
    }
    try { const token = await auth.getAccessToken(); if (!token) throw new Error('No token'); return token; }
    catch { throw new SourceError('GOOGLE_AUTH_INVALID'); }
  }
  return async function getResults() {
    const config = readConfiguration(env);
    const key = createHash('sha256').update(JSON.stringify(config)).digest('hex');
    const age = cached ? now() - Date.parse(cached.result.readAt) : Infinity;
    if (cached?.key === key && age >= 0 && age < 5000) return cached.result;
    if (pending?.key === key) return pending.promise;
    const promise = (async () => {
      const token = await accessToken(config, key);
      const base = 'https://sheets.googleapis.com/v4/spreadsheets/' + config.spreadsheetId;
      const metaUrl = new URL(base);
      metaUrl.searchParams.set('fields','sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)))');
      const metadata = await googleJson(metaUrl.toString(), token, fetchImpl);
      const sheet = metadata.sheets?.find(item => item.properties?.sheetId === config.gid)?.properties;
      if (!sheet) throw new SourceError('SHEET_NOT_FOUND');
      const grid = sheet.gridProperties;
      if (!grid || !Number.isSafeInteger(grid.rowCount) || grid.rowCount < 1 || !Number.isSafeInteger(grid.columnCount) || grid.columnCount < 1) throw new SourceError('SOURCE_UNAVAILABLE');
      const range = "'" + sheet.title.replace(/'/g,"''") + "'!A1:" + columnName(grid.columnCount) + grid.rowCount;
      const valuesUrl = new URL(base + '/values/' + encodeURIComponent(range));
      valuesUrl.searchParams.set('valueRenderOption','UNFORMATTED_VALUE');
      valuesUrl.searchParams.set('dateTimeRenderOption','SERIAL_NUMBER');
      const data = await googleJson(valuesUrl.toString(), token, fetchImpl);
      const readAt = new Date(now()).toISOString();
      const rows = data.values || [];
      if (!rows.length || !Array.isArray(rows[0])) throw new SourceError('HEADER_INVALID');
      const columns = resolveColumns(rows[0], config.headers);
      const responses = rows.slice(1).map(row => {
        const copy = row.slice(); copy[columns.timestamp] = sheetTimestamp(copy[columns.timestamp]); return copy;
      });
      const totals = calculateVoteTotals(responses, columns, config.registeredVoters);
      const result = { ok: true, mode: config.mode, readAt,
        label: config.mode === 'dummy' ? 'SIMULASI · DATA DUMMY' : 'HASIL SEMENTARA',
        statistics: totals.statistics, candidates: totals.candidates };
      cached = { key, result };
      return result;
    })();
    pending = { key, promise };
    try { return await promise; } finally { if (pending?.promise === promise) pending = null; }
  };
}

export function publicSourceError(error) {
  const messages = {
    SOURCE_NOT_CONFIGURED: 'Sumber data belum dihubungkan oleh panitia. Profil calon tetap dapat dilihat.',
    CONFIG_INVALID: 'Pengaturan sumber perlu diperiksa panitia.',
    GOOGLE_AUTH_INVALID: 'Akses sumber perlu diperiksa panitia.',
    GOOGLE_API_DISABLED: 'Layanan sumber belum diaktifkan oleh panitia.',
    SHEET_ACCESS_DENIED: 'Izin sumber belum tersedia. Panitia perlu memeriksa akses.',
    SHEET_NOT_FOUND: 'Sumber pemilihan belum ditemukan.',
    HEADER_INVALID: 'Kolom sumber belum sesuai. Panitia perlu memeriksa header.',
    SOURCE_BUSY: 'Sumber sedang sibuk. Sinkronisasi akan dicoba kembali.'
  };
  const code = error instanceof SourceError && messages[error.code] ? error.code : 'SOURCE_UNAVAILABLE';
  return { code, message: messages[code] || 'Sumber belum dapat dibaca. Sinkronisasi akan dicoba kembali.' };
}
