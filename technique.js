const techniqueFormat = 'local-panel-technique';
const techniqueChunkSize = 768 * 1024;
const techniqueMetadataKey = programId => `technique-library:${programId}`;
const techniqueVideoKey = (batch, index, kind) => `technique-video:${batch}:${index}:${kind}`;

function techniqueBatchRange(batch) {
  const prefix = `technique-video:${batch}:`;
  return IDBKeyRange.bound(prefix, `${prefix}\uffff`);
}

async function techniqueStorage(mode, operate) {
  const database = await openStorage();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction('workspace', mode);
    const request = operate(transaction.objectStore('workspace'));
    transaction.oncomplete = () => resolve(request?.result);
    transaction.onabort = () => reject(transaction.error || new Error('Хранилище видео недоступно.'));
  });
}

function readTechniqueLibrary(programId) {
  return techniqueStorage('readonly', store => store.get(techniqueMetadataKey(programId)));
}

function readTechniqueVideo(batch, index, kind) {
  return techniqueStorage('readonly', store => store.get(techniqueVideoKey(batch, index, kind)));
}

async function* techniqueLines(file) {
  const reader = file.stream().getReader();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  let remainder = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      const text = remainder + decoder.decode(value, { stream: !done });
      let from = 0;
      let end;
      while ((end = text.indexOf('\n', from)) !== -1) {
        if (end - from > techniqueChunkSize * 4 / 3 + 4) throw new Error('Строка в пакете видео слишком длинная.');
        yield text.slice(from, end).replace(/\r$/, '');
        from = end + 1;
      }
      remainder = text.slice(from);
      if (remainder.length > techniqueChunkSize * 4 / 3 + 4) throw new Error('Строка в пакете видео слишком длинная.');
      if (done) {
        if (remainder) yield remainder;
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function parseTechniqueHeader(line, programId, fail) {
  const suffix = ',"data":[';
  if (!line?.endsWith(suffix)) fail();
  const header = JSON.parse(`${line.slice(0, -suffix.length)}}`);
  if (header?.format !== techniqueFormat || header.version !== 1) fail();
  if (header.programId !== programId) throw new Error('Этот пакет видео предназначен для другой программы.');
  if (!Array.isArray(header.videos) || !header.videos.length) fail();
  return header.videos.map((entry, index) => {
    if (!isObject(entry) || typeof entry.movement !== 'string' || !/^[\w-]{1,60}$/.test(entry.movement) ||
        typeof entry.title !== 'string' || !entry.title.trim() || entry.title.length > 150 ||
        typeof entry.filename !== 'string' || !/^[^\\/\u0000-\u001f]{1,240}\.(mov|mp4)$/i.test(entry.filename) ||
        ![entry.originalBytes, entry.playbackBytes].every(bytes => Number.isSafeInteger(bytes) && bytes > 0)) fail();
    const { movement, title, filename, originalBytes, playbackBytes } = entry;
    return { index, movement, title, filename, originalBytes, playbackBytes };
  });
}

async function readTechniqueAsset(next, bytes, type, last, fail) {
  if (await next() !== '[') fail();
  const parts = [];
  for (let remaining = bytes; remaining > 0;) {
    const size = Math.min(remaining, techniqueChunkSize);
    remaining -= size;
    const line = await next();
    const suffix = remaining ? '",' : '"';
    if (!line?.startsWith('"') || !line.endsWith(suffix) || line.length !== Math.ceil(size / 3) * 4 + suffix.length + 1) fail();
    const encoded = line.slice(1, -suffix.length);
    let part;
    if (typeof Uint8Array.fromBase64 === 'function') {
      part = Uint8Array.fromBase64(encoded);
    } else {
      const binary = atob(encoded);
      part = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) part[i] = binary.charCodeAt(i);
    }
    if (part.byteLength !== size) fail();
    parts.push(part);
  }
  if (await next() !== (last ? ']' : '],')) fail();
  return new Blob(parts, { type });
}

async function importTechniqueLibrary(file, programId, report) {
  const fail = () => { throw new Error('Файл полной техники повреждён или имеет другой формат.'); };
  const lines = techniqueLines(file);
  const next = async () => (await lines.next()).value;
  const batch = crypto.randomUUID();
  let staged = false;

  try {
    const videos = parseTechniqueHeader(await next(), programId, fail);
    report(0, videos.length);
    for (const { index, filename, originalBytes, playbackBytes } of videos) {
      const original = await readTechniqueAsset(next, originalBytes, /\.mov$/i.test(filename) ? 'video/quicktime' : 'video/mp4', false, fail);
      await techniqueStorage('readwrite', store => store.put(original, techniqueVideoKey(batch, index, 'original')));
      staged = true;
      const playback = await readTechniqueAsset(next, playbackBytes, 'video/mp4', index === videos.length - 1, fail);
      await techniqueStorage('readwrite', store => store.put(playback, techniqueVideoKey(batch, index, 'playback')));
      report(index + 1, videos.length);
    }
    if (await next() !== ']}' || await next() !== undefined) fail();
    const library = { batch, videos };
    await techniqueStorage('readwrite', store => {
      const key = techniqueMetadataKey(programId);
      const previous = store.get(key);
      previous.onsuccess = () => {
        if (previous.result) store.delete(techniqueBatchRange(previous.result.batch));
        store.put(library, key);
      };
    });
    return library;
  } catch (error) {
    if (staged) await techniqueStorage('readwrite', store => store.delete(techniqueBatchRange(batch))).catch(() => {});
    if (error.name === 'QuotaExceededError' || error.name === 'UnknownError') {
      throw new Error('Браузеру не хватило места для видео. Освободите место и повторите загрузку.');
    }
    if (error instanceof SyntaxError || error.name === 'InvalidCharacterError') fail();
    throw error;
  } finally {
    await lines.return();
  }
}
