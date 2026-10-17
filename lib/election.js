import CANDIDATES_ from '../config/candidates.json' with { type: 'json' };

function normalizeCandidateAnswer(answer) {
  return String(answer === null || answer === undefined ? '' : answer)
    .normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function romanToNumber_(text) {
  if (!text || !/^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(text)) return null;
  const digits = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let total = 0;
  for (let i = 0; i < text.length; i++) {
    const value = digits[text[i]];
    total += value < (digits[text[i + 1]] || 0) ? -value : value;
  }
  return total;
}

/** Parse hanya alamat lengkap dengan batas blok/nomor yang jelas. */
function normalizeHouseAddress_(input) {
  const text = String(input === null || input === undefined ? '' : input)
    .normalize('NFKC').trim().toUpperCase().replace(/\s+/g, ' ');
  const match = /^(?:BLOK\s*\.?\s*)?([IVXLCDM]+|\d+)(?:\s*[/,\-]\s*(?:(?:NOMOR|NO\.?|NMR\.?)\s*)?|\s*(?:NOMOR|NO\.?|NMR\.?)\s*|\s+)(\d+)\s*([A-Z]?)$/.exec(text);
  if (!match) return null;
  const block = /^\d+$/.test(match[1]) ? Number(match[1]) : romanToNumber_(match[1]);
  const house = Number(match[2]);
  if (!Number.isSafeInteger(block) || block < 1 || !Number.isSafeInteger(house) || house < 1) return null;
  return { key: block + '/' + house + match[3], block: block, house: house + match[3] };
}

/** Pure aggregation: never returns addresses, row numbers, or raw answers. */
function calculateVoteTotals(rows, columns, registeredVoters = null) {
  const answerMap = Object.create(null);
  CANDIDATES_.forEach(function (candidate, index) {
    candidate.answers.forEach(function (answer) {
      const key = normalizeCandidateAnswer(answer);
      if (!key || Object.prototype.hasOwnProperty.call(answerMap, key)) throw new Error('MAPPING_INVALID');
      answerMap[key] = index;
    });
  });
  const stats = { totalResponses: 0, validVotes: 0, duplicates: 0,
    unmappedResponses: 0, invalidMetadata: 0, excludedResponses: 0,
    candidateCount: CANDIDATES_.length, registeredVoters: registeredVoters,
    participation: null };
  const eligible = [];
  rows.forEach(function (row, index) {
    if (!row.some(function (value) { return value !== '' && value !== null && value !== undefined; })) return;
    stats.totalResponses++;
    const answer = normalizeCandidateAnswer(row[columns.choice]);
    if (!Object.prototype.hasOwnProperty.call(answerMap, answer)) {
      stats.unmappedResponses++;
      return;
    }
    const address = normalizeHouseAddress_(row[columns.address]);
    const date = row[columns.timestamp];
    // getValues() returns Date for real timestamp cells. Do not guess text date locales.
    const timestamp = Object.prototype.toString.call(date) === '[object Date]' ? date.getTime() : NaN;
    if (!address || !Number.isFinite(timestamp)) {
      stats.invalidMetadata++;
      return;
    }
    eligible.push({ key: address.key, time: timestamp, order: index, candidate: answerMap[answer] });
  });
  eligible.sort(function (a, b) { return a.time - b.time || a.order - b.order; });
  const counted = new Set();
  const votes = CANDIDATES_.map(function () { return 0; });
  eligible.forEach(function (response) {
    if (counted.has(response.key)) {
      stats.duplicates++;
    } else {
      counted.add(response.key);
      votes[response.candidate]++;
      stats.validVotes++;
    }
  });
  stats.excludedResponses = stats.duplicates + stats.unmappedResponses + stats.invalidMetadata;
  if (stats.registeredVoters !== null) stats.participation = stats.validVotes / stats.registeredVoters * 100;
  return { statistics: stats, candidates: CANDIDATES_.map(function (candidate, index) {
    return { id: candidate.id, votes: votes[index], percentage: stats.validVotes ? votes[index] / stats.validVotes * 100 : 0 };
  }) };
}


export { normalizeCandidateAnswer, normalizeHouseAddress_ as normalizeHouseAddress, romanToNumber_ as romanToNumber, calculateVoteTotals };
