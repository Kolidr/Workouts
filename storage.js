const packageFormat = 'local-panel-program';
const backupFormat = 'local-panel-backup';
const garminBackupFormat = 'local-panel-garmin';
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

function movementChoice(slot, variant = 0) {
  return slot.variants[variant - 1] || slot;
}

function describeMovement(slot, variant = 0) {
  const move = movementChoice(slot, variant);
  return { id: move.id, title: move.title, alternative: move !== slot };
}

const exerciseNoteLimit = 32000;

function joinExerciseNotes(notes) {
  return [...new Set(notes.filter(Boolean))].join('\n\n');
}

function cleanExerciseNotes(raw, program) {
  const byExercise = new Map();
  for (const [key, text] of Object.entries(isObject(raw) ? raw : {})) {
    const match = key.match(/^(\d+)-(\d+)(?:-\d+-(?:exercise|\d+))?$/);
    if (!match || !program.days[Number(match[1])]?.[Number(match[2])] || typeof text !== 'string' ||
        text.length > exerciseNoteLimit) continue;
    const slot = `${match[1]}-${match[2]}`;
    if (!byExercise.has(slot)) byExercise.set(slot, []);
    byExercise.get(slot).push(text);
  }
  return Object.fromEntries([...byExercise].map(([slot, notes]) => [slot, joinExerciseNotes(notes)]));
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
    if (move.previousIds !== undefined) {
      if (!Array.isArray(move.previousIds) || move.previousIds.length > 10) fail();
      movement.previousIds = [...new Set(move.previousIds.map(key))];
    }
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
    edition: Number.isInteger(raw.edition) && raw.edition > 0 ? raw.edition : 1,
    cover: mediaId(raw.cover, 'image/'), banner: mediaId(raw.banner, 'image/'),
    days: raw.days.map(day => {
      if (!Array.isArray(day) || !day.length || day.length > 40) fail();
      return day.map(move => cleanMovement(move, true));
    })
  };
  const snapshot = document.format === backupFormat ? cleanSnapshot(document.snapshot, program, knownIds, fail) : null;
  return { program, media, snapshot };
}

function validGarminDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date;
}

function garminStart(row) {
  return row.startedAt ?? Number(/^(\d+):\d+:\d+$/.exec(row.id)?.[1] || 0);
}

function compareGarmin(first, second) {
  return first.date.localeCompare(second.date) || garminStart(first) - garminStart(second) || first.id.localeCompare(second.id);
}

function cleanGarminRows(rows, program, fail) {
  if (!Array.isArray(rows)) fail();
  const number = value => value === null || value === undefined ? null :
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fail();
  return rows.map(row => {
    if (!isObject(row)) fail();
    const day = program.days[row.day];
    if (!day || !Number.isInteger(row.day) || typeof row.id !== 'string' || !row.id || row.id.length > 150 ||
        !validGarminDate(row.date) || !Array.isArray(row.mapping) || !Array.isArray(row.sets) || row.mapping.length !== row.sets.length ||
        row.mapping.some(index => !Number.isInteger(index) || index < -1 || index >= day.length)) fail();
    const variants = day.map((item, index) => {
      const variant = row.variants?.[index] || 0;
      return Number.isInteger(variant) && variant >= 0 && variant <= item.variants.length ? variant : 0;
    });
    const performed = day.map((item, index) => {
      const move = row.performed?.[index];
      if (isObject(move) && typeof move.id === 'string' && /^[a-zA-Z0-9_-]{1,60}$/.test(move.id) &&
          typeof move.title === 'string' && move.title.length <= 150) {
        return { id: move.id, title: move.title, alternative: Boolean(move.alternative) };
      }
      return describeMovement(item, variants[index]);
    });
    return {
      id: row.id, date: row.date, day: row.day, startedAt: number(row.startedAt), updatedAt: number(row.updatedAt) ?? 0,
      variants, performed, mapping: row.mapping, initialRest: number(row.initialRest), sets: row.sets.map(set => {
        if (!isObject(set)) fail();
        return { weight: number(set.weight), reps: number(set.reps), rest: number(set.rest), kind: set.kind === 'warm' ? 'warm' : 'work' };
      })
    };
  });
}

function cleanGarminDeleted(deleted, fail) {
  if (!Array.isArray(deleted)) fail();
  return deleted.map(row => {
    if (!isObject(row) || typeof row.id !== 'string' || !row.id || row.id.length > 150 ||
        !Number.isFinite(row.updatedAt) || row.updatedAt < 0) fail();
    return { id: row.id, updatedAt: row.updatedAt };
  });
}

function mergeGarmin(current, incoming) {
  const latest = rows => {
    const byId = new Map();
    for (const row of rows) {
      const known = byId.get(row.id);
      if ((known?.updatedAt || 0) <= (row.updatedAt || 0)) byId.set(row.id, row);
    }
    return byId;
  };
  const deleted = latest([...(current.garminDeleted || []), ...(incoming.garminDeleted || [])]);
  const imported = [...latest([...current.imported, ...incoming.imported]).values()]
    .filter(row => !deleted.has(row.id) || ((row.updatedAt || 0) > deleted.get(row.id).updatedAt)).sort(compareGarmin);
  return { imported, garminDeleted: [...deleted.values()] };
}

function cleanSnapshot(raw, program, knownIds, fail) {
  if (!isObject(raw) || !Array.isArray(raw.imported)) fail();
  const stringEntries = value => Object.fromEntries(Object.entries(isObject(value) ? value : {}).filter(
    ([key, text]) => /^[a-zA-Z0-9_-]+$/.test(key) && typeof text === 'string' && text.length <= 2048
  ));
  const imported = cleanGarminRows(raw.imported, program, fail);
  const garminDeleted = cleanGarminDeleted(raw.garminDeleted ?? [], fail);
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
  return { ...mergeGarmin({ imported, garminDeleted }, { imported: [] }), variants: variantChoices, progress, focus,
    notes: cleanExerciseNotes(raw.notes, program), links, updatedAt: Number.isFinite(raw.updatedAt) && raw.updatedAt >= 0 ? raw.updatedAt : 0 };
}

function alignProgramRecord(record, source, target) {
  if (source === target) return record;
  const ids = new Map();
  const layouts = source.days.map((oldDay, dayIndex) => {
    const positions = new Map();
    target.days[dayIndex]?.forEach((slot, index) => {
      [slot, ...slot.variants].forEach((move, variant) => {
        [move.id, ...(move.previousIds || [])].forEach(id => {
          positions.set(id, { index, variant });
          ids.set(id, move.id);
        });
      });
    });
    return oldDay.map(slot => [slot, ...slot.variants].map(move => positions.get(move.id)));
  });
  const variants = {};
  for (const [key, choice] of Object.entries(record.variants)) {
    const [day, position] = key.split('-').map(Number);
    const next = layouts[day]?.[position]?.[choice];
    if (next) variants[`${day}-${next.index}`] = next.variant;
  }
  function remap(entries, combine) {
    const mapped = {};
    for (const [key, value] of Object.entries(entries)) {
      const match = key.match(/^(\d+)-(\d+)-(\d+)(.*)$/);
      if (!match) continue;
      const [, day, position, variant, suffix] = match;
      const next = layouts[day]?.[position]?.[variant];
      if (!next) continue;
      const newKey = `${day}-${next.index}-${next.variant}${suffix}`;
      mapped[newKey] = Object.hasOwn(mapped, newKey) ? combine(mapped[newKey], value) : value;
    }
    return mapped;
  }
  const imported = record.imported.flatMap(workout => {
    const layout = layouts[workout.day];
    const newDay = target.days[workout.day];
    if (!layout || !newDay) return [];
    const pair = position => layout[position]?.[workout.variants?.[position] || 0] || layout[position]?.find(Boolean);
    const mapping = workout.mapping.map(position => pair(position)?.index ?? -1);
    const choices = newDay.map(() => 0);
    const performed = newDay.map(slot => describeMovement(slot));
    for (const position of new Set(workout.mapping)) {
      const next = pair(position);
      if (!next) continue;
      choices[next.index] = next.variant;
      performed[next.index] = workout.performed?.[position] ||
        describeMovement(source.days[workout.day][position], workout.variants?.[position]);
    }
    return [{ ...workout, mapping, variants: choices, performed }];
  });
  const links = {};
  for (const [id, link] of Object.entries(record.links)) {
    const next = ids.get(id);
    if (next && (id === next || !Object.hasOwn(links, next))) links[next] = link;
  }
  const notes = {};
  for (const [key, text] of Object.entries(cleanExerciseNotes(record.notes, source))) {
    const [day, index] = key.split('-').map(Number);
    const next = layouts[day]?.[index]?.find(Boolean);
    if (next) {
      const newKey = `${day}-${next.index}`;
      notes[newKey] = joinExerciseNotes([notes[newKey], text]);
    }
  }
  return {
    ...record, variants, imported, notes,
    progress: remap(record.progress, (first, second) => ({ ...first, ...second })),
    focus: remap(record.focus, first => first),
    links
  };
}

function portableGarminWorkouts(rows, program) {
  return rows.map(row => {
    const { id, date, day, updatedAt, initialRest, sets, mapping } = row;
    const exercises = [...new Set(mapping)].filter(position => position >= 0).map(position => {
      const slot = program.days[day][position];
      const movement = row.performed?.[position] || describeMovement(slot, row.variants?.[position]);
      return { position, slotId: slot.id, movement };
    });
    return { id, date, day, updatedAt, startedAt: garminStart(row), initialRest, sets, mapping, exercises };
  });
}

function garminBackupDocument(record) {
  return new Blob([JSON.stringify({
    format: garminBackupFormat, version: 1, programId: record.program.id,
    workouts: portableGarminWorkouts(record.imported, record.program), deleted: record.garminDeleted || []
  })], { type: 'application/json' });
}

function legacyGarminBackup(document, fail) {
  const source = document.program;
  if (!isObject(source) || !Array.isArray(source.days) || !isObject(document.snapshot)) fail();
  const identity = move => {
    if (!isObject(move) || typeof move.id !== 'string' || typeof move.title !== 'string') fail();
    return { id: move.id, title: move.title };
  };
  const program = { days: source.days.map(day => {
    if (!Array.isArray(day)) fail();
    return day.map(slot => {
      const base = identity(slot);
      if (!Array.isArray(slot.variants)) fail();
      return { ...base, variants: slot.variants.map(identity) };
    });
  }) };
  const rows = cleanGarminRows(document.snapshot.imported, program, fail);
  return { format: garminBackupFormat, version: 1, programId: source.id,
    workouts: portableGarminWorkouts(rows, program), deleted: document.snapshot.garminDeleted };
}

function unpackGarminBackup(document, program) {
  const fail = () => { throw new Error('Выберите JSON с резервной копией записей Garmin.'); };
  if (document?.format === backupFormat && document.version === 1) document = legacyGarminBackup(document, fail);
  if (!isObject(document) || document.format !== garminBackupFormat || document.version !== 1 ||
      !Array.isArray(document.workouts)) fail();
  if (document.programId !== program.id) throw new Error('Этот файл Garmin относится к другой программе.');
  const movementIndexes = program.days.map(day => new Map(day.flatMap((slot, position) =>
    [slot, ...slot.variants].flatMap((move, variant) =>
      [move.id, ...(move.previousIds || [])].map(id => [id, { position, variant }])))));
  const rows = document.workouts.map(row => {
    if (!isObject(row) || !Number.isInteger(row.day) || !movementIndexes[row.day] ||
        !Array.isArray(row.exercises) || !Array.isArray(row.mapping)) fail();
    const movements = movementIndexes[row.day];
    const positions = new Map();
    const variants = [];
    const performed = [];
    for (const entry of row.exercises) {
      if (!isObject(entry) || !Number.isInteger(entry.position) || entry.position < 0 || positions.has(entry.position) ||
          typeof entry.slotId !== 'string' || !isObject(entry.movement) || typeof entry.movement.id !== 'string') fail();
      const target = movements.get(entry.movement.id) || movements.get(entry.slotId);
      if (!target) throw new Error('В текущей версии программы нет упражнения из файла Garmin.');
      positions.set(entry.position, target.position);
      variants[target.position] = target.variant;
      performed[target.position] = entry.movement;
    }
    const mapping = row.mapping.map(position => {
      if (position === -1) return -1;
      if (!positions.has(position)) fail();
      return positions.get(position);
    });
    return { ...row, mapping, variants, performed };
  });
  return { imported: cleanGarminRows(rows, program, fail), garminDeleted: cleanGarminDeleted(document.deleted ?? [], fail) };
}
