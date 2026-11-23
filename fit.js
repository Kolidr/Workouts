// Garmin FIT profile: file ID (0), session (18), activity (34), and strength set (225).
const FIT_EPOCH_MS = Date.UTC(1989, 11, 31);
const FIT_DATE_MIN = 0x10000000;

function fitChecksum(bytes) {
  let checksum = 0;
  for (const byte of bytes) {
    checksum ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      checksum = (checksum >>> 1) ^ (checksum & 1 ? 0xa001 : 0);
    }
  }
  return checksum;
}

function readFitMessages(buffer) {
  const view = new DataView(buffer);
  const invalid = () => new Error('Файл FIT повреждён или загружен не полностью.');
  if (view.byteLength < 14 || view.getUint32(8) !== 0x2e464954) {
    throw new Error('Выберите исходный файл тренировки Garmin в формате .FIT.');
  }
  let cursor = view.getUint8(0);
  const end = cursor + view.getUint32(4, true);
  if (![12, 14].includes(cursor) || end + 2 !== view.byteLength ||
      fitChecksum(new Uint8Array(buffer, 0, end)) !== view.getUint16(end, true)) {
    throw invalid();
  }
  const definitions = new Map();
  const messages = new Map();
  const supported = new Map([
    [0, new Set([0, 4])], [18, new Set([2])], [34, new Set([5, 253])],
    [225, new Set([0, 3, 4, 5, 6, 10, 254])]
  ]);
  let timestamp;
  function requireBytes(size) {
    if (cursor + size > end) throw invalid();
  }
  function readValue({ id, size, type }, littleEndian) {
    if (id < 0) return undefined;
    const base = type & 31;
    if ((base === 0 || base === 2) && size === 1) {
      const value = view.getUint8(cursor);
      return value === 0xff ? undefined : value;
    }
    if (base === 4 && size === 2) {
      const value = view.getUint16(cursor, littleEndian);
      return value === 0xffff ? undefined : value;
    }
    if (base === 6 && size === 4) {
      const value = view.getUint32(cursor, littleEndian);
      return value === 0xffffffff ? undefined : value;
    }
    return undefined;
  }

  while (cursor < end) {
    const header = view.getUint8(cursor++);
    const compressed = Boolean(header & 0x80);
    const local = compressed ? (header >> 5) & 3 : header & 15;
    if (!compressed && header & 0x40) {
      requireBytes(5);
      const littleEndian = view.getUint8(cursor + 1) === 0;
      const number = view.getUint16(cursor + 2, littleEndian);
      const fieldCount = view.getUint8(cursor + 4);
      cursor += 5;
      requireBytes(fieldCount * 3);
      const fields = [];
      for (let field = 0; field < fieldCount; field++, cursor += 3) {
        fields.push({ id: view.getUint8(cursor), size: view.getUint8(cursor + 1), type: view.getUint8(cursor + 2) });
      }
      if (header & 0x20) {
        requireBytes(1);
        const developerCount = view.getUint8(cursor++);
        requireBytes(developerCount * 3);
        for (let field = 0; field < developerCount; field++, cursor += 3) {
          fields.push({ id: -1, size: view.getUint8(cursor + 1) });
        }
      }
      definitions.set(local, { fields, littleEndian, number });
      continue;
    }
    const definition = definitions.get(local);
    if (!definition) throw invalid();
    const { fields, number, littleEndian } = definition;
    const message = {};
    if (compressed) {
      if (fields[0]?.id !== 253 || timestamp === undefined) throw invalid();
      const shortTime = header & 31;
      const advance = (shortTime - (timestamp & 31) + 32) % 32;
      timestamp += advance;
      message[253] = timestamp;
    }
    for (const field of compressed ? fields.slice(1) : fields) {
      requireBytes(field.size);
      if (field.id === 253 || supported.get(number)?.has(field.id)) {
        const value = readValue(field, littleEndian);
        if (field.id === 253 && value !== undefined) timestamp = value;
        if (value !== undefined) message[field.id] = value;
      }
      cursor += field.size;
    }
    if (supported.has(number)) {
      if (!messages.has(number)) messages.set(number, []);
      messages.get(number).push(message);
    }
  }
  return { messages, checksum: view.getUint16(end, true) };
}

function fitDate(start, activity) {
  const end = activity?.[253];
  const localEnd = activity?.[5];
  const offset = localEnd >= FIT_DATE_MIN && end >= FIT_DATE_MIN ? localEnd - end : null;
  const date = new Date(FIT_EPOCH_MS + (start + (offset ?? 0)) * 1000);
  if (offset !== null && Math.abs(offset) <= 14 * 3600) return date.toISOString().slice(0, 10);
  const localDate = new Date(FIT_EPOCH_MS + start * 1000);
  const parts = [localDate.getFullYear(), localDate.getMonth() + 1, localDate.getDate()];
  return parts.map(part => String(part).padStart(2, '0')).join('-');
}

function readFitWorkout(buffer, filename) {
  const { messages, checksum } = readFitMessages(buffer);
  if (messages.get(0)?.[0]?.[0] !== 4) {
    throw new Error('Выберите FIT-файл записанной тренировки Garmin.');
  }
  const setMessages = (messages.get(225) || []).sort((a, b) => (
    (a[6] ?? a[254] ?? Infinity) - (b[6] ?? b[254] ?? Infinity) || (a[10] ?? 0) - (b[10] ?? 0)
  ));
  const sets = [];
  let initialRest = null;
  let previousSet;
  let previousEnd;
  for (const set of setMessages) {
    if (set[5] === 0 && set[0] !== undefined) {
      const duration = set[0] / 1000;
      if (previousSet) previousSet.rest = (previousSet.rest ?? 0) + duration;
      else initialRest = (initialRest ?? 0) + duration;
    }
    if (set[5] !== 1) continue;
    const setStart = set[6];
    if (previousSet && previousSet.rest === null && previousEnd !== undefined && setStart >= previousEnd) {
      previousSet.rest = setStart - previousEnd;
    }
    previousSet = { weight: set[4] === undefined ? null : set[4] / 16, reps: set[3] ?? null, rest: null };
    previousEnd = setStart === undefined || set[0] === undefined ? undefined : setStart + set[0] / 1000;
    sets.push(previousSet);
  }
  if (!sets.length) throw new Error('В этом файле нет силовых подходов.');
  const starts = [
    ...(messages.get(18) || []).map(session => session[2]),
    ...setMessages.filter(set => set[5] === 1).map(set => set[6] ?? set[254]),
    messages.get(0)?.[0]?.[4]
  ].filter(value => value >= FIT_DATE_MIN);
  if (!starts.length) throw new Error('В файле нет даты тренировки.');
  const date = fitDate(starts[0], messages.get(34)?.at(-1));
  return { date, filename, sets, initialRest, id: `${starts[0]}:${buffer.byteLength}:${checksum}` };
}
