const packageFormat = 'local-panel-program';
const backupFormat = 'local-panel-backup';
const contentTypes = { video: 'video/mp4', jpeg: 'image/jpeg', png: 'image/png' };
let openedDatabase;

function openStorage() {
  if (!openedDatabase) {
    openedDatabase = new Promise((resolve, reject) => {
      const request = indexedDB.open('local-panel-v1', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('workspace');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  return openedDatabase;
}

async function readWorkspace() {
  const database = await openStorage();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('workspace');
    const storage = transaction.objectStore('workspace');
    const record = storage.get('state');
    const media = storage.get('media');
    transaction.oncomplete = () => resolve({ record: record.result || null, media: media.result || {} });
    transaction.onabort = () => reject(transaction.error);
  });
}

async function writeWorkspace(record, media, expectedRevision) {
  const database = await openStorage();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('workspace', 'readwrite');
    const storage = transaction.objectStore('workspace');
    const current = storage.get('state');
    let conflict = false;
    current.onsuccess = () => {
      const revision = current.result?.revision || 0;
      if (revision !== expectedRevision) {
        conflict = true;
        transaction.abort();
        return;
      }
      storage.put({ ...record, revision: revision + 1 }, 'state');
      if (media !== undefined) storage.put(media, 'media');
    };
    transaction.oncomplete = () => resolve(expectedRevision + 1);
    transaction.onabort = () => reject(conflict
      ? new Error('Данные обновились на другой вкладке. Перезагрузите страницу, чтобы продолжить.')
      : new Error('Браузер не смог сохранить данные. Проверьте свободное место и настройки хранилища.'));
  });
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function cleanLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return '';
}

function unpackDocument(document) {
  const fail = () => { throw new Error('Файл не соответствует формату приложения.'); };
  const string = (value, max) => typeof value === 'string' && value.length <= max ? value : fail();
  const key = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(value) ? value : fail();
  if (!isObject(document) || document.version !== 1 ||
      ![packageFormat, backupFormat].includes(document.format) || !isObject(document.program) ||
      !isObject(document.media) || Object.keys(document.media).length > 200) fail();
  const knownIds = new Set();
  const media = Object.create(null);
  for (const [name, entry] of Object.entries(document.media)) {
    key(name);
    if (!isObject(entry) || !Object.hasOwn(contentTypes, entry.type) ||
        typeof entry.data !== 'string' || entry.data.length > 48 * 1024 * 1024) fail();
    const bytes = Uint8Array.fromBase64 ? Uint8Array.fromBase64(entry.data) :
      Uint8Array.from(atob(entry.data), char => char.charCodeAt(0));
    media[name] = new Blob([bytes], { type: contentTypes[entry.type] });
  }
  const mediaId = (value, type) => {
    if (value == null || value === '') return null;
    if (!media[key(value)]?.type.startsWith(type)) fail();
    return value;
  };
  function cleanMovement(move, isPlan) {
    if (!isObject(move)) fail();
    const id = key(move.id);
    if (knownIds.has(id)) fail();
    knownIds.add(id);
    const movement = { id, title: string(move.title, 150), source: cleanLink(move.source) };
    for (const field of ['major', 'minor']) {
      if (!Array.isArray(move[field]) || move[field].some(region => !Object.hasOwn(muscleNames, region))) fail();
      movement[field] = [...new Set(move[field])];
    }
    if (!Array.isArray(move.tips) || move.tips.length > 8) fail();
    movement.tips = move.tips.map(tip => string(tip, 600));
    movement.clip = mediaId(move.clip, 'video/');
    movement.poster = mediaId(move.poster, 'image/');
    if (isPlan) {
      if (!Number.isInteger(move.warm) || move.warm < 0 || move.warm > 2 ||
          !Number.isInteger(move.work) || move.work < 1 || move.work > 30) fail();
      movement.warm = move.warm;
      movement.work = move.work;
      movement.reps = string(move.reps, 30);
      movement.optional = Boolean(move.optional);
      movement.alternative = string(move.alternative || '', 300);
      if (!Array.isArray(move.variants) || move.variants.length > 10) fail();
      movement.variants = move.variants.map(variant => cleanMovement(variant, false));
    }
    return movement;
  }
  const raw = document.program;
  if (!Array.isArray(raw.days) || !raw.days.length || raw.days.length > 40) fail();
  const program = {
    id: key(raw.id), brand: string(raw.brand, 60), title: string(raw.title, 150), author: string(raw.author, 120),
    cover: mediaId(raw.cover, 'image/'), banner: mediaId(raw.banner, 'image/'),
    days: raw.days.map(day => {
      if (!Array.isArray(day) || !day.length || day.length > 40) fail();
      return day.map(move => cleanMovement(move, true));
    })
  };
  const snapshot = document.format === backupFormat ? cleanSnapshot(document.snapshot, program, knownIds, fail) : null;
  return { program, media, snapshot };
}

function cleanSnapshot(raw, program, knownIds, fail) {
  if (!isObject(raw) || !Array.isArray(raw.imported)) fail();
  const stringEntries = value => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(
    ([key, text]) => /^[a-zA-Z0-9_-]+$/.test(key) && typeof text === 'string' && text.length <= 2048
  ));
  const number = value => value === null || value === undefined ? null :
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail();
  const imported = raw.imported.map(row => {
    const day = program.days[row?.day];
    if (!day || typeof row.id !== 'string' || row.id.length > 150 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) ||
        !Array.isArray(row.mapping) || !Array.isArray(row.sets) || row.mapping.length !== row.sets.length ||
        row.mapping.some(index => !Number.isInteger(index) || index < -1 || index >= day.length)) fail();
    const variants = day.map((item, index) => {
      const variant = row.variants?.[index] || 0;
      return Number.isInteger(variant) && variant >= 0 && variant <= item.variants.length ? variant : 0;
    });
    return {
      id: row.id, date: row.date, day: row.day, updatedAt: number(row.updatedAt) ?? 0, variants, mapping: row.mapping,
      initialRest: number(row.initialRest), sets: row.sets.map(set => ({
        weight: number(set.weight), reps: number(set.reps), rest: number(set.rest), kind: set.kind === 'warm' ? 'warm' : 'work'
      }))
    };
  });
  const variantChoices = {};
  const progress = {};
  const focus = {};
  program.days.forEach((day, dayIndex) => day.forEach((move, position) => {
    const slot = `${dayIndex}-${position}`;
    const choice = raw.variants?.[slot];
    if (Number.isInteger(choice) && choice >= 0 && choice <= move.variants.length) variantChoices[slot] = choice;
    for (let variant = 0; variant <= move.variants.length; variant++) {
      const key = `${slot}-${variant}`;
      const count = move.warm + move.work + Number(move.optional);
      if (isObject(raw.progress?.[key])) {
        progress[key] = Object.fromEntries(Object.entries(raw.progress[key]).filter(([index, value]) =>
          /^\d+$/.test(index) && Number(index) < count && ['done', 'skipped'].includes(value)));
      }
      const active = raw.focus?.[key];
      if (Number.isInteger(active) && active >= 0 && active < count) focus[key] = active;
    }
  }));
  const links = Object.fromEntries(Object.entries(stringEntries(raw.links)).filter(([id, url]) => knownIds.has(id) && cleanLink(url)));
  return { imported, variants: variantChoices, progress, focus, notes: stringEntries(raw.notes),
    links, updatedAt: number(raw.updatedAt) ?? 0 };
}

function encodeMedia(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',', 2)[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function backupDocument(record, blobs) {
  const names = Object.fromEntries(Object.entries(contentTypes).map(([name, mime]) => [mime, name]));
  const media = Object.create(null);
  for (const [name, blob] of Object.entries(blobs)) {
    media[name] = { type: names[blob.type], data: await encodeMedia(blob) };
  }
  const { program, revision, ...snapshot } = record;
  return new Blob([JSON.stringify({ format: backupFormat, version: 1, program, media, snapshot })],
    { type: 'application/json' });
}
