const app = document.querySelector('#app');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const state = {
  screen: 'programs', day: 0, exercise: 0, progress: {}, focus: {}, notes: {}, variants: {}, links: {},
  draft: null, imported: [], importError: '', fileRequest: 0, program: null, media: {}, revision: 0, updatedAt: 0,
  pendingRestore: null, pendingGarmin: null, garminDeleted: [], busy: false, techniqueJob: null
};
let days = [];
let writes = Promise.resolve();
const mediaUrls = new Map();
const choosePackage = '<label class="button primary file-label" data-file-drop="workspace-file">Загрузить файл<input type="file" id="workspace-file" accept=".json,application/json"></label>';
const iconParts = {
  plus: '<path d="M12 5v14M5 12h14"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.3"/><rect x="14" y="3" width="7" height="7" rx="1.3"/><rect x="3" y="14" width="7" height="7" rx="1.3"/><rect x="14" y="14" width="7" height="7" rx="1.3"/>',
  barbell: '<path d="M9 12h6M2 12h2m16 0h2"/><rect x="4" y="6" width="5" height="12" rx="1.5"/><rect x="15" y="6" width="5" height="12" rx="1.5"/>',
  download: '<path d="M12 3v12m-4-4 4 4 4-4M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
  archive: '<rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8m-9 4h4"/>',
  notes: '<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z"/><path d="M7.5 9h9m-9 4h6"/>',
  play: '<path d="m9 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M9 5v14m6-14v14" stroke-width="2.5"/>',
  external: '<path d="M13 5h6v6m0-6-9 9"/><path d="M19 14v5H5V5h5"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h11"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  undo: '<path d="M9 4 4 9l5 5M4 9h10a5 5 0 0 1 0 10h-3"/>',
  history: '<path d="M3 10a9 9 0 1 1 1.5 7M3 4v6h6m3-3v5l3 2"/>',
  skip: '<path d="M7 6l8 6-8 6zM17 6v12"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z"/><path d="M14 3v6h6M8 13h8m-8 4h5"/>'
};
const tabs = [
  ['programs', 'grid', 'Программы'], ['workout', 'barbell', 'Тренировка'],
  ['garmin', 'download', 'Garmin'], ['data', 'archive', 'Данные']
];
let noticeTimer;

function icon(name) {
  return `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconParts[name]}</svg>`;
}
function escapeText(value) {
  const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(value).replace(/[&<>"']/g, symbol => entities[symbol]);
}
function button(text, action, kind = 'secondary', attributes = '') {
  return `<button type="button" class="button ${kind}" data-action="${action}" ${attributes}>${text}</button>`;
}
function setCount(exercise) {
  return (exercise.warm || 0) + exercise.work;
}
function setSummary(exercise) {
  const warm = exercise.warm ? `${exercise.warm} разм. + ` : '';
  const work = exercise.optional ? `${exercise.work}–${exercise.work + 1}` : exercise.work;
  return `${warm}${work} × ${exercise.reps}`;
}
function nameForSets(count) {
  const end = count % 10;
  if (count % 100 >= 11 && count % 100 <= 14) return `${count} подходов`;
  return `${count} ${end === 1 ? 'подход' : end >= 2 && end <= 4 ? 'подхода' : 'подходов'}`;
}
const slotKey = (day, exercise) => `${day}-${exercise}`;
const selectedVariant = (day, exercise) => state.variants[slotKey(day, exercise)] || 0;
function movementAt(day, position, variant = 0) {
  const item = days[day][position];
  return { ...item, ...movementChoice(item, variant) };
}
const exercise = () => movementAt(state.day, state.exercise, selectedVariant(state.day, state.exercise));
const exerciseKey = () => `${slotKey(state.day, state.exercise)}-${selectedVariant(state.day, state.exercise)}`;
const noteKey = () => slotKey(state.day, state.exercise);
const displayDate = date => date.split('-').reverse().join('.');
const listWeight = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 3 });
function setResult(set) {
  if (!set || (set.weight === null && set.reps === null)) return '—';
  if (set.weight === null) return `${set.reps} повт.`;
  if (set.reps === null) return `${listWeight.format(set.weight)} кг`;
  return `${listWeight.format(set.weight)} кг × ${set.reps}`;
}
function restTime(seconds) {
  const total = Math.round(seconds);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function workspaceRecord() {
  const { program, notes, variants, imported, garminDeleted, progress, focus, links, updatedAt } = state;
  return { program, notes, variants, imported, garminDeleted, progress, focus, links, updatedAt };
}

function saveLocal() {
  state.updatedAt = Date.now();
  const record = structuredClone(workspaceRecord());
  const write = writes.then(async () => { state.revision = await writeWorkspace(record, undefined, state.revision); });
  writes = write.catch(error => announce(error.message));
  return write;
}

function mediaUrl(id) {
  if (!id || !state.media[id]) return '';
  if (!mediaUrls.has(id)) mediaUrls.set(id, URL.createObjectURL(state.media[id]));
  return mediaUrls.get(id);
}

function applyWorkspace(record, media) {
  for (const url of mediaUrls.values()) URL.revokeObjectURL(url);
  mediaUrls.clear();
  state.media = media;
  state.program = record.program;
  state.revision = record.revision;
  state.updatedAt = record.updatedAt || 0;
  for (const key of ['variants', 'progress', 'focus', 'links']) state[key] = record[key] || {};
  state.notes = cleanExerciseNotes(record.notes, record.program);
  Object.assign(state, mergeGarmin({ imported: record.imported || [], garminDeleted: record.garminDeleted }, { imported: [] }));
  state.draft = null;
  state.day = 0;
  state.exercise = 0;
  days = record.program.days;
  document.title = record.program.brand || 'Local Panel';
  document.querySelector('.wordmark').textContent = document.title;
  const banner = mediaUrl(record.program.banner);
  if (banner) document.documentElement.style.setProperty('--personal-banner', `url("${banner}")`);
  else document.documentElement.style.removeProperty('--personal-banner');
}

function banner() {
  return `<div class="workout-banner">
    <div class="workout-banner-copy"><button class="text-button program-link" type="button" data-action="days">${escapeText(state.program.title)}</button>
    <p>${escapeText(state.program.author)}</p></div>
  </div>`;
}

function dayTabs() {
  return `<div class="day-tabs" aria-label="День программы">${days.map((_, index) => `
    <button type="button" data-action="day" data-index="${index}" aria-pressed="${index === state.day}">День ${index + 1}</button>
  `).join('')}</div>`;
}

function exercises() {
  return `<ol class="exercise-list">${days[state.day].map((item, index) => `
    <li><button type="button" data-action="exercise" data-index="${index}" aria-current="${index === state.exercise}">
      <span class="list-number">${index + 1}</span><span><strong>${escapeText(movementAt(state.day, index, selectedVariant(state.day, index)).title)}</strong><small>${escapeText(setSummary(item))}</small></span>
    </button></li>
  `).join('')}</ol>`;
}

function technique(item) {
  const preview = `<figure>
      ${item.clip ? `
      <button class="video-surface" type="button" data-action="toggle-video" aria-label="Пауза">
        <video id="technique-video" src="${mediaUrl(item.clip)}" ${item.poster ? `poster="${mediaUrl(item.poster)}"` : ''}
          muted autoplay loop playsinline preload="auto"></video>
        <span class="video-control">${icon('pause')}</span>
      </button>` : ''}
      <figcaption class="technique-copy ${item.clip ? '' : 'text-technique'}">
        <h2>Техника</h2>
        <ul>${item.tips.map(tip => `<li>${escapeText(tip)}</li>`).join('')}</ul>
      </figcaption>
    </figure>`;
  return `<section class="media" aria-label="Техника упражнения">${preview}
    <button type="button" class="technique-link" data-action="full-technique">Полная техника ${icon('play')}</button>
  </section>`;
}

function recordedHistory() {
  const slot = days[state.day][state.exercise];
  const matches = workout => workout.day === state.day && workout.mapping.includes(state.exercise);
  return state.imported.filter(matches).sort(compareGarmin).map(workout => ({
      date: workout.date,
      movement: workout.performed?.[state.exercise] || describeMovement(slot, workout.variants?.[state.exercise]),
      sets: withRestBefore(workout).filter((_, index) => workout.mapping[index] === state.exercise)
    }));
}

function movementLabel(move) {
  return `${move.alternative ? 'Аналог' : 'Основное'} · ${escapeText(move.title)}`;
}

function withRestBefore(workout) {
  return workout.sets.map((set, position) => ({
    ...set, restBefore: position === 0 ? workout.initialRest : workout.sets[position - 1].rest
  }));
}

function progressFor(item) {
  const key = exerciseKey();
  const statuses = state.progress[key] || {};
  const limit = setCount(item) + Number(Boolean(item.optional));
  const pending = Array.from({ length: limit }, (_, index) => index).filter(index => !statuses[index]);
  const chosen = state.focus[key];
  const active = pending.includes(chosen) ? chosen : pending[0];
  return { key, statuses, limit, pending, active };
}

function historyDialog(item) {
  const records = recordedHistory();
  if (!records.length) {
    openDialog('История упражнения', `<p class="intro">${escapeText(item.title)}</p><p class="intro">Здесь появятся подходы из подтверждённых тренировок Garmin.</p>`, 'history-dialog');
    return;
  }
  const byKind = (record, kind) => record.sets.filter((set, position) => (
    set.kind || (position < (item.warm || 0) ? 'warm' : 'work')
  ) === kind);
  const historyRows = ['warm', 'work'].map(kind => {
    const columns = records.map(record => byKind(record, kind));
    const rowCount = Math.max(...columns.map(sets => sets.length));
    const rows = Array.from({ length: rowCount }, (_, index) => `
      <tr><th scope="row" class="history-number">${index + 1}</th>${columns.map(sets => {
        const set = sets[index];
        if (!set) return '<td>—</td>';
        const rest = set.restBefore == null ? '—' : restTime(set.restBefore);
        return `<td><small class="rest-before">Отдых перед подходом ${rest}</small><span>${setResult(set)}</span></td>`;
      }).join('')}</tr>`
    ).join('');
    return `<tbody><tr class="history-section"><th class="history-type" scope="rowgroup" rowspan="${rowCount + 1}">${kind === 'warm' ? 'Разминка' : 'Рабочие'}</th>
      <th class="history-number" scope="row">Всего</th>${columns.map(sets => `<td>${sets.length ? nameForSets(sets.length) : '—'}</td>`).join('')}</tr>${rows}</tbody>`;
  }).join('');
  openDialog('История упражнения', `<p class="intro">${escapeText(item.title)}</p>
    <div class="history-scroll" tabindex="0" aria-label="История по датам, таблица прокручивается">
      <table class="history-table">
        <thead><tr><th scope="col" class="history-type">Тип</th><th scope="col" class="history-number">Подход</th>${records.map(record => `<th scope="col"><time datetime="${record.date}">${displayDate(record.date)}</time><small class="history-movement">${movementLabel(record.movement)}</small></th>`).join('')}</tr></thead>
        ${historyRows}
      </table>
    </div>`, 'history-dialog');
}

function plan(item) {
  const warm = item.warm || 0;
  const { limit: count, active, statuses } = progressFor(item);
  const history = recordedHistory().at(-1);
  const showMovement = history && (history.movement.alternative || history.movement.id !== item.id);
  const rowCount = Math.max(count, history?.sets.length || 0);
  const rows = Array.from({ length: rowCount }, (_, index) => {
    const isWarm = index < warm;
    const recorded = history?.sets[index];
    const isActive = index === active && index < count;
    const status = statuses[index];
    const rest = recorded?.restBefore;
    const type = isWarm ? 'Разминка' : index >= setCount(item) ? 'Доп. подход' : 'Рабочий';
    return `${rest == null ? '' : `<div class="rest-row"><span aria-label="Отдых перед подходом ${index + 1}, ${restTime(rest)}">Отдых ${restTime(rest)}</span></div>`}
    <div class="set-row ${isActive ? 'is-current' : ''}" ${isActive ? 'aria-current="step"' : ''}>
      ${index < count ? `
      <button type="button" class="set-name set-picker ${status || ''}" data-action="${status ? 'undo-set' : 'select-set'}"
        data-index="${index}" aria-label="${status === 'done' ? 'Отменить выполнение подхода' : status === 'skipped' ? 'Вернуть пропущенный подход' : 'Выбрать подход'} ${index + 1}">
        <span class="set-index">${status === 'done' ? icon('check') : status === 'skipped' ? icon('skip') : index + 1}</span>
        <span>${type}${status ? `<small>${status === 'done' ? 'Выполнен' : 'Пропущен'} ${icon('undo')}</small>` : ''}</span>
      </button>` : `<span class="set-name">${type}</span>`}
      <strong>${index >= count ? '—' : isWarm ? ['15–20', '10–12'][index] : escapeText(item.reps)}</strong>
      <span class="history-value">${setResult(recorded)}</span>
    </div>`;
  }).join('');
  const next = active !== undefined ? 'mark' : 'next';
  return `<section class="plan" aria-labelledby="plan-title">
    <div class="plan-header"><h2 id="plan-title">Подходы</h2>
      <span class="current-status">${active !== undefined ? `<i></i> Сейчас ${active + 1} из ${count}` : 'Подходы отмечены'}</span>
    </div>
    ${showMovement ? `<p class="previous-movement">Прошлая тренировка · ${movementLabel(history.movement)}</p>` : ''}
    <div class="table-head">
      <span>Подход</span><span>Повт.</span>
      <span>${history ? `<time datetime="${history.date}">${displayDate(history.date)}</time>` : 'Нет истории'}</span>
    </div>
    <div class="set-table">${rows}</div>
    <div class="plan-footer">
      <div class="plan-actions">
        ${next === 'mark' ? button('Пропустить подход', 'skip-set') : ''}
        ${button(next === 'mark' ? 'Отметить подход' : 'Следующее упражнение', next, 'primary',
        next === 'next' && state.exercise === days[state.day].length - 1 ? 'disabled' : '')}
      </div>
      ${Object.keys(statuses).length ? button(`${icon('undo')} Снять все отметки`, 'reset-exercise', 'quiet reset-exercise') : ''}
    </div>
  </section>`;
}

function workout() {
  const item = exercise();
  const variant = selectedVariant(state.day, state.exercise);
  return `${banner()}
    <div class="workout-layout">
      <aside class="day-panel" aria-label="Программа на день">
        ${dayTabs()}
        <div class="desktop-list">${exercises()}</div>
        ${button(`Упражнение ${state.exercise + 1} из ${days[state.day].length} ${icon('menu')}`, 'exercise-menu', 'mobile-list')}
      </aside>
      <article class="exercise">
        <div class="exercise-heading">
          <div><h1>${escapeText(item.title)}</h1><p class="exercise-prescription">${escapeText(setSummary(item))}</p>
            ${item.alternative ? `<p class="alternative">${escapeText(item.alternative)}</p>` : ''}</div>
          <div class="exercise-tools">
            <button type="button" class="button secondary exercise-note ${state.notes[noteKey()] ? 'has-note' : ''}" data-action="note" aria-label="Комментарий к упражнению">${icon('notes')} Заметка</button>
            <button type="button" class="button secondary history-link" data-action="history" aria-label="История упражнения">${icon('history')} История</button>
          </div>
        </div>
        ${item.variants.length ? `<label class="variant-control" for="movement-variant">Аналог
          <select id="movement-variant"><option value="0" ${variant === 0 ? 'selected' : ''}>${escapeText(days[state.day][state.exercise].title)}</option>
            ${item.variants.map((entry, index) => `<option value="${index + 1}" ${variant === index + 1 ? 'selected' : ''}>${escapeText(entry.title)}</option>`).join('')}
          </select>
        </label>` : ''}
        <div class="workout-content"><div class="exercise-media">${technique(item)}${muscles(item)}</div>${plan(item)}</div>
        <div class="exercise-footer">
          ${button(`${icon('chevron')} Предыдущее`, 'previous', 'quiet previous', state.exercise === 0 ? 'disabled' : '')}
          ${button(`Следующее ${icon('chevron')}`, 'next', 'quiet', state.exercise === days[state.day].length - 1 ? 'disabled' : '')}
        </div>
        <div class="complete-day">${button(`${icon('check')} Завершить тренировку`, 'finish-day')}</div>
      </article>
    </div>`;
}

function programs() {
  if (!state.program) {
    return `<section class="page transfer" data-file-drop="workspace-file"><h1>Локальное пространство</h1>
      <p class="intro">Перетащите сюда файл программы или выберите его.</p>
      ${choosePackage}</section>`;
  }
  return `<section class="page programs">
    <div class="programs-header"><h1>Программы</h1>
      <label class="button secondary file-label" data-file-drop="workspace-file">${icon('plus')} Добавить программу
        <input type="file" id="workspace-file" accept=".json,application/json" aria-label="Добавить программу файлом JSON"></label>
    </div>
    <div class="cover">
      <div class="cover-copy"><h2>${escapeText(state.program.title)}</h2><p>${escapeText(state.program.author)}</p>
        <p class="cover-meta">Дней: ${days.length} · Упражнений: ${days.flat().length}</p>
        ${button('Выбрать программу', 'days', 'primary')}
      </div>
      ${state.program.cover ? `<div class="cover-art"><img src="${mediaUrl(state.program.cover)}" alt="Обложка программы"></div>` : ''}
    </div>
  </section>`;
}

function chooseDay() {
  return `<section class="page day-picker">
    <button type="button" class="text-button back" data-action="programs">${icon('chevron')} Программы</button>
    <h1>${escapeText(state.program.title)}</h1><p class="intro">${escapeText(state.program.author)}</p>
    <div class="day-cards" aria-label="Выберите день">${days.map((day, index) => `
      <article class="day-choice">
        <button type="button" class="day-card" data-action="day" data-index="${index}">
          <span class="day-card-number">${index + 1}</span>
          <span><strong>День ${index + 1}</strong><small>${day.length} упражнений</small></span>${icon('chevron')}
        </button>
        ${dayMuscles(index, day.map((_, position) => movementAt(index, position, selectedVariant(index, position))))}
      </article>`).join('')}
    </div>
  </section>`;
}

function dayOptions(selected, allowEmpty = true) {
  return `${allowEmpty ? '<option value="">Выберите день</option>' : ''}${days.map((_, day) =>
    `<option value="${day}" ${selected === day ? 'selected' : ''}>День ${day + 1}</option>`
  ).join('')}`;
}

function garmin() {
  const draft = state.draft;
  const editing = draft?.editing;
  return `<section class="page transfer" ${editing ? '' : 'data-file-drop="fit-file"'}>
    <h1>${editing ? 'Редактировать тренировку Garmin' : 'Импорт Garmin'}</h1>
    ${editing ? '' : `<p class="intro">Перетащите FIT-файл тренировки или выберите его.</p>
    <div class="file-panel">
      <div class="file-icon">${icon('file')}</div>
      <div><strong>${draft ? escapeText(draft.filename) : 'Файл тренировки .FIT'}</strong>
      <p>${draft ? `<time datetime="${draft.date}">${displayDate(draft.date)}</time> · ${nameForSets(draft.sets.length)}` : 'Дата и подходы будут прочитаны из файла'}</p></div>
      <label class="button ${draft ? 'secondary' : 'primary'} file-label">${draft ? 'Заменить файл' : 'Выбрать файл'}
        <input id="fit-file" type="file" accept=".fit,application/octet-stream"></label>
    </div>`}
    ${state.importError ? `<p class="error" role="alert">${escapeText(state.importError)}</p>` : ''}
    ${draft ? `
      <div class="import-fields">
        ${editing ? `<label for="fit-date">Дата тренировки
          <input id="fit-date" type="date" value="${draft.date}" required>
        </label>` : `<label for="fit-program">Программа
          <select id="fit-program"><option value="">Выберите программу</option>
            <option value="current" ${draft.program ? 'selected' : ''}>${escapeText(state.program.title)}</option></select>
        </label>`}
        <label for="fit-day">День программы
          <select id="fit-day" ${draft.program ? '' : 'disabled'}>${dayOptions(draft.day, !editing)}</select>
        </label>
        ${editing ? `<label for="fit-initial-rest">Отдых перед первым подходом, с
          <input id="fit-initial-rest" type="number" min="0" step="any" value="${draft.initialRest ?? ''}">
        </label>` : ''}
      </div>
      <div id="import-review">${draft.day === null ? '' : review(draft)}</div>
    ` : ''}
    ${!draft && state.imported.length ? garminWorkouts() : ''}
  </section>`;
}

function garminWorkouts() {
  const newestFirst = [...state.imported].sort((first, second) => compareGarmin(second, first));
  return `<section class="import-receipt">
    <h2>Тренировки Garmin</h2>
    <ul class="garmin-workouts">${newestFirst.map(row => `
      <li class="garmin-workout">
        <div><time datetime="${row.date}">${displayDate(row.date)}</time>
          <p>День ${row.day + 1} · ${nameForSets(row.sets.length)}</p></div>
        <div class="garmin-actions">
          ${button('Изменить', 'edit-garmin', 'secondary', `data-record="${escapeText(row.id)}"`)}
          ${button('Удалить', 'delete-garmin', 'quiet', `data-record="${escapeText(row.id)}"`)}
        </div>
      </li>`).join('')}</ul>
  </section>`;
}

function autoMap(draft) {
  const recipe = days[draft.day].flatMap((item, index) => Array(setCount(item)).fill(index));
  draft.mapping = draft.sets.map((_, index) => recipe[index] ?? -1);
}

function fitSetKind(draft, position) {
  const set = draft.sets[position];
  if (set.kind) return set.kind;
  const slot = draft.mapping[position];
  const ordinal = draft.mapping.slice(0, position).filter(index => index === slot).length;
  return slot >= 0 && ordinal < (days[draft.day][slot].warm || 0) ? 'warm' : 'work';
}

function importVariantControl(slot, index, selected) {
  if (!slot?.variants.length) return '';
  return `<label class="import-variant">Выполненный вариант
    <select data-import-variant="${index}" aria-label="Выполненный вариант · ${escapeText(slot.title)}">
    ${[slot, ...slot.variants].map((_, variant) => `<option value="${variant}" ${selected === variant ? 'selected' : ''}>${movementLabel(describeMovement(slot, variant))}</option>`).join('')}
    </select></label>`;
}

function fitEditField(label, field, position, value, step) {
  return `<label>${label}<input data-fit-field="${field}" data-position="${position}" type="number"
    min="0" step="${step}" value="${value ?? ''}" placeholder="—"></label>`;
}

function editableSet(draft, position, index) {
  const set = draft.sets[position];
  const programDay = days[draft.day];
  const kind = fitSetKind(draft, position);
  return `<fieldset class="import-set">
    <legend>Подход ${position + 1} <span>${setResult(set)}</span></legend>
    <div class="set-edit-values">
      ${fitEditField('Вес, кг', 'weight', position, set.weight, 'any')}
      ${fitEditField('Повторения', 'reps', position, set.reps, '1')}
      ${fitEditField('Отдых после, с', 'rest', position, set.rest === null ? null : Math.round(set.rest), 'any')}
    </div>
    <div class="set-edit-options">
      <label>Тип подхода<select data-fit-kind="${position}"><option value="warm" ${kind === 'warm' ? 'selected' : ''}>Разминка</option>
        <option value="work" ${kind === 'work' ? 'selected' : ''}>Рабочий</option></select></label>
      <label>Упражнение<select data-set-index="${position}" aria-label="Упражнение для подхода ${position + 1}">
        ${programDay.map((_, option) => `<option value="${option}" ${option === index ? 'selected' : ''}>${escapeText(movementAt(draft.day, option, draft.variants[option]).title)}</option>`).join('')}
        <option value="-1" ${index === -1 ? 'selected' : ''}>Без упражнения</option>
      </select></label>
      ${button('Убрать', 'remove-fit-set', 'quiet remove-set', `data-index="${position}" aria-label="Убрать подход ${position + 1}"`)}
    </div>
  </fieldset>`;
}

function review(draft, expanded = new Set()) {
  const programDay = days[draft.day];
  const groups = [...programDay.map((_, index) => ({
    item: movementAt(draft.day, index, draft.variants[index]), index
  })), { item: null, index: -1 }];
  const assigned = draft.mapping.filter(index => index !== -1).length;
  const rows = groups.map(({ item, index }) => {
    const setIndexes = draft.mapping.flatMap((placement, position) => placement === index ? [position] : []);
    if (!item && !setIndexes.length) return '';
    const planned = item ? setCount(item) : 0;
    const matching = item && (setIndexes.length === planned || (item.optional && setIndexes.length === planned + 1));
    return `<div class="import-group">
      ${importVariantControl(programDay[index], index, draft.variants[index])}
      <details class="import-exercise" data-exercise="${index}" ${expanded.has(index) ? 'open' : ''}>
      <summary><span class="review-index">${item ? index + 1 : '—'}</span>
        <span class="review-title"><strong>${escapeText(item?.title || 'Без упражнения')}</strong>
          <small>${item ? escapeText(setSummary(item)) : 'Подходы сохранятся в тренировке'}</small></span>
        <span class="review-amount ${matching ? '' : 'review-mismatch'}">${item ? `${setIndexes.length} из ${item.optional ? `${planned}–${planned + 1}` : planned}` : setIndexes.length}</span>
        ${icon('down')}
      </summary>
      <div class="import-sets">
        ${setIndexes.length ? setIndexes.map(position => editableSet(draft, position, index)).join('') : '<p>Подходов пока нет.</p>'}
        ${item ? button('Добавить подход', 'add-fit-set', 'secondary add-set', `data-index="${index}"`) : ''}
      </div>
    </details></div>`;
  }).join('');
  return `<section class="review">
    <div class="review-header"><h2>Проверка подходов</h2><span>${assigned} из ${draft.sets.length} распределено</span></div>
    <p class="intro">Выберите выполненный вариант. Раскройте упражнение, чтобы изменить подходы, вес, повторения и отдых.</p>
    <div class="review-list">${rows}</div>
    <div class="import-actions">${button(draft.editing ? 'Сохранить изменения' : 'Подтвердить тренировку',
      'confirm-fit', 'primary', draft.sets.length ? '' : 'disabled')}
      ${button('Распределить заново', 'reset-fit', 'secondary')}
      ${draft.editing ? button('Отмена', 'cancel-fit-edit', 'quiet') : ''}</div>
  </section>`;
}

function dataScreen() {
  return `<section class="page transfer">
    <h1>Данные</h1>
    <p class="intro">Переносите записи Garmin между устройствами с помощью JSON.</p>
    ${state.program ? `<div class="data-panel"><div><h2>Выгрузить записи Garmin</h2><p>Скачайте резервную копию или перетащите кнопку выгрузки.</p></div>
      ${button('Выгрузить', 'backup', 'secondary', 'draggable="true"')}</div>
    <div class="data-panel" data-file-drop="garmin-backup-file"><div><h2>Восстановить записи Garmin</h2>
      <p>Перетащите JSON сюда или выберите файл.</p></div>
      <label class="button primary file-label">Выбрать файл<input type="file" id="garmin-backup-file" accept=".json,application/json"></label></div>`
      : `<div class="data-panel"><p>Сначала загрузите файл программы.</p>${button('Открыть программы', 'programs')}</div>`}
    ${state.program ? `<div class="data-panel" data-file-drop="technique-file"><div><h2>Видео с полной техникой</h2>
      <p id="technique-status" role="status">Проверяем локальное хранилище…</p></div>
      <label class="button secondary file-label technique-file-label">Загрузить видео с полной техникой
        <input id="technique-file" type="file" accept=".json,application/json" ${state.techniqueJob ? 'disabled' : ''}>
      </label></div>` : ''}
  </section>`;
}

function setupVideo() {
  const video = document.querySelector('#technique-video');
  if (!video) return;
  const control = video.closest('button');
  const setControl = () => {
    control.setAttribute('aria-label', video.paused ? 'Воспроизвести' : 'Пауза');
    control.querySelector('.video-control').innerHTML = icon(video.paused ? 'play' : 'pause');
  };
  video.addEventListener('play', setControl);
  video.addEventListener('pause', setControl);
  video.muted = true;
  video.play().catch(setControl);
}

function render(scroll = true) {
  const screens = { workout, programs, days: chooseDay, garmin, data: dataScreen };
  const current = state.screen === 'days' ? 'programs' : state.screen;
  document.querySelector('.navigation').innerHTML = tabs.filter(([action]) => state.program || ['programs', 'data'].includes(action)).map(([action, symbol, text]) => `
    <button type="button" data-action="${action}" ${action === current ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${text}</span></button>
  `).join('');
  app.innerHTML = screens[state.screen]();
  if (scroll) window.scrollTo(0, 0);
  setupVideo();
  if (state.screen === 'data' && state.program) refreshTechniqueStatus();
}

function openDialog(title, content, className = '') {
  dialog.className = className;
  dialog.innerHTML = `<div class="dialog-header"><h2 id="dialog-title">${title}</h2>
    <button type="button" class="icon-button" data-action="close" aria-label="Закрыть">${icon('close')}</button></div>${content}`;
  dialog.showModal();
}

function openNote() {
  const key = noteKey();
  openDialog('Комментарий к упражнению', `
    <p class="intro">День ${state.day + 1} · ${escapeText(exercise().title)}</p>
    <form id="note-form" data-key="${key}"><label for="note-text">Комментарий</label>
      <textarea id="note-text" rows="4" maxlength="${exerciseNoteLimit}" autofocus>${escapeText(state.notes[key] || '')}</textarea>
      <button class="button primary" type="submit">Сохранить</button>
    </form>`);
}

function announce(message) {
  clearTimeout(noticeTimer);
  notice.textContent = message;
  notice.hidden = false;
  noticeTimer = setTimeout(() => { notice.hidden = true; }, 4300);
}

function loadDraft(workout) {
  state.importError = '';
  state.draft = { ...workout, program: '', day: null, mapping: [], variants: [] };
  render(false);
  document.querySelector('#fit-program').focus();
}

function updatePlan(action, index) {
  const item = exercise();
  const { key, statuses, active, pending } = progressFor(item);
  if (action === 'select-set') state.focus[key] = index;
  if (action === 'undo-set') {
    delete statuses[index];
    state.focus[key] = index;
  }
  if ((action === 'mark' || action === 'skip-set') && active !== undefined) {
    state.progress[key] = statuses;
    statuses[active] = action === 'mark' ? 'done' : 'skipped';
    state.focus[key] = pending.find(position => position > active);
  }
  if (action === 'confirm-reset-exercise') {
    delete state.progress[key];
    delete state.focus[key];
  }
  document.querySelector('.plan').outerHTML = plan(item);
  const next = progressFor(item).active;
  const nextControl = action === 'select-set' || action === 'undo-set'
    ? document.querySelector(`.set-picker[data-index="${next}"]`)
    : document.querySelector(`.plan-actions [data-action="${action === 'skip-set' ? 'skip-set' : 'mark'}"]:not(:disabled)`);
  nextControl?.focus({ preventScroll: true });
  saveLocal();
}

function openedImportExercises() {
  return new Set([...app.querySelectorAll('.import-exercise[open]')].map(row => Number(row.dataset.exercise)));
}

function refreshReview(expanded = openedImportExercises()) {
  document.querySelector('#import-review').innerHTML = review(state.draft, expanded);
}

function validateSetFields() {
  const invalid = [...app.querySelectorAll('[data-fit-field]')].find(input => !input.validity.valid);
  if (!invalid) return true;
  invalid.closest('details').open = true;
  invalid.reportValidity();
  return false;
}

async function readPersonalFile(file) {
  if (state.busy) return;
  state.busy = true;
  try {
    if (file.size > 160 * 1024 * 1024) throw new Error('Выберите файл меньше 160 МБ.');
    const pending = unpackDocument(JSON.parse(await file.text()));
    state.pendingRestore = pending;
    const sameProgram = state.program?.id === pending.program.id;
    const importCount = pending.snapshot?.imported.length || 0;
    const update = sameProgram && !pending.snapshot;
    const replace = Boolean(state.program && (!sameProgram || pending.snapshot));
    openDialog('Загрузка данных', `<p class="intro">${escapeText(pending.program.title)} · Записей в файле: ${importCount}</p>
      <div class="dialog-actions">
        ${sameProgram ? button(update ? 'Обновить программу' : 'Объединить', 'confirm-merge', 'primary') : ''}
        ${update ? '' : button(replace ? 'Заменить данные' : 'Загрузить', 'confirm-restore', replace ? 'secondary' : 'primary')}
      </div>`);
  } catch (error) {
    announce(error instanceof SyntaxError ? 'Файл не удалось прочитать как JSON.' : error.message);
  } finally {
    state.busy = false;
  }
}

function mergeRecords(current, incoming) {
  const merged = { ...current, ...mergeGarmin(current, incoming) };
  const later = incoming.updatedAt >= current.updatedAt ? incoming : current;
  for (const key of ['notes', 'variants', 'links']) merged[key] = { ...current[key], ...incoming[key], ...later[key] };
  merged.progress = later.progress;
  merged.focus = later.focus;
  return merged;
}

async function restoreWorkspace(merge) {
  const pending = state.pendingRestore;
  if (!pending || state.busy) return;
  state.busy = true;
  try {
    await writes;
    const blank = { notes: {}, links: {}, variants: {}, progress: {}, focus: {}, imported: [], garminDeleted: [], updatedAt: 0 };
    const incoming = pending.snapshot || blank;
    const keepProgram = merge && (state.program.edition || 1) > pending.program.edition;
    const program = keepProgram ? state.program : pending.program;
    const media = keepProgram ? state.media : pending.media;
    const record = merge ? mergeRecords(alignProgramRecord(workspaceRecord(), state.program, program),
      alignProgramRecord(incoming, pending.program, program)) : incoming;
    const next = { ...record, program, updatedAt: Date.now() };
    next.revision = await writeWorkspace(next, media, state.revision);
    applyWorkspace(next, media);
    state.pendingRestore = null;
    state.screen = 'programs';
    dialog.close();
    render();
    announce('Данные загружены.');
  } catch (error) {
    announce(error.message);
  } finally {
    state.busy = false;
  }
}

function garminArchive() {
  const blob = garminBackupDocument(workspaceRecord());
  const filename = `garmin-${new Intl.DateTimeFormat('sv-SE').format(new Date())}.json`;
  return new File([blob], filename, { type: blob.type });
}

async function exportGarmin() {
  if (!state.program || state.busy) return;
  try {
    await writes;
    const file = garminArchive();
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    announce(error.message);
  }
}

async function readGarminBackup(file) {
  if (state.busy || !state.program) return;
  state.busy = true;
  const program = state.program;
  try {
    if (file.size > 160 * 1024 * 1024) throw new Error('Выберите резервную копию Garmin размером до 160 МБ.');
    const records = unpackGarminBackup(JSON.parse(await file.text()), program);
    if (state.screen !== 'data' || state.program !== program) return;
    state.pendingGarmin = records;
    openDialog('Восстановить записи Garmin?', `<p class="intro">Тренировок в файле: ${records.imported.length}.
      Отметок об удалении: ${records.garminDeleted.length}.</p>
      ${button('Восстановить записи', 'confirm-garmin-restore', 'primary')}`);
  } catch (error) {
    announce(error instanceof SyntaxError ? 'Файл не удалось прочитать как JSON.' : error.message);
  } finally {
    state.busy = false;
  }
}

async function commitGarmin(incoming) {
  if (state.busy) return false;
  state.busy = true;
  const before = { imported: state.imported, garminDeleted: state.garminDeleted };
  Object.assign(state, mergeGarmin(before, incoming));
  try {
    await saveLocal();
    return true;
  } catch {
    Object.assign(state, before);
    return false;
  } finally {
    state.busy = false;
  }
}

function garminChangeTime(id) {
  const recorded = state.imported.find(row => row.id === id);
  const deleted = state.garminDeleted.find(row => row.id === id);
  return Math.max(Date.now(), (recorded?.updatedAt || 0) + 1, (deleted?.updatedAt || 0) + 1);
}

async function refreshTechniqueStatus() {
  const status = document.querySelector('#technique-status');
  if (!status) return;
  const { techniqueJob, program } = state;
  if (techniqueJob?.programId === program.id) {
    status.textContent = techniqueJob.message;
    return;
  }
  try {
    const library = await readTechniqueLibrary(program.id);
    status.textContent = library ? `Загружено видео: ${library.videos.length}.` : 'Загрузите отдельный JSON с полными видео для этой программы.';
  } catch {
    status.textContent = 'Не удалось прочитать хранилище видео.';
  }
}

async function loadTechniqueFile(file) {
  if (state.techniqueJob || !state.program) return;
  const job = { programId: state.program.id, message: 'Читаем пакет видео…' };
  state.techniqueJob = job;
  render(false);
  try {
    const library = await importTechniqueLibrary(file, job.programId, (loaded, count) => {
      job.message = `Загружаем видео: ${loaded} из ${count}.`;
      if (state.screen === 'data') refreshTechniqueStatus();
    });
    announce(`Загружено видео: ${library.videos.length}.`);
  } catch (error) {
    announce(error.message || 'Не удалось загрузить видео.');
  } finally {
    state.techniqueJob = null;
    if (state.screen === 'data') render(false);
  }
}

let fullVideoUrl;
let fullVideoRequest = 0;
let fullVideoLibrary;

function releaseFullVideo() {
  if (fullVideoUrl) URL.revokeObjectURL(fullVideoUrl);
  fullVideoUrl = undefined;
}

function mountFullVideo(slot, blob) {
  releaseFullVideo();
  fullVideoUrl = URL.createObjectURL(blob);
  const video = document.createElement('video');
  video.src = fullVideoUrl;
  video.controls = true;
  video.playsInline = true;
  video.preload = 'metadata';
  slot.replaceChildren(video);
}

async function showFullVideo(index) {
  const library = fullVideoLibrary;
  const entry = library?.videos.find(video => video.index === index);
  const slot = dialog.querySelector('#full-video-slot');
  if (!entry || !slot) return;
  const request = ++fullVideoRequest;
  releaseFullVideo();
  for (const choice of dialog.querySelectorAll('[data-action="choose-full-video"]')) {
    choice.setAttribute('aria-pressed', String(Number(choice.dataset.index) === index));
  }
  const original = dialog.querySelector('[data-action="download-full-original"]');
  original.dataset.index = index;
  slot.textContent = 'Открываем видео…';
  try {
    const blob = await readTechniqueVideo(library.batch, index, 'playback');
    if (!slot.isConnected || !dialog.open || request !== fullVideoRequest) return;
    if (!blob) throw new Error();
    mountFullVideo(slot, blob);
  } catch {
    if (slot.isConnected && request === fullVideoRequest) slot.textContent = 'Не удалось открыть видео. Можно скачать оригинал.';
  }
}

async function downloadFullOriginal(index) {
  const library = fullVideoLibrary;
  const entry = library?.videos.find(video => video.index === index);
  if (!entry) return;
  try {
    const blob = await readTechniqueVideo(library.batch, index, 'original');
    if (!blob) throw new Error();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = entry.filename;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    announce('Не удалось скачать оригинал видео.');
  }
}

async function fullTechnique(item) {
  const link = cleanLink(state.links[item.id]) || item.source;
  const slot = days[state.day][state.exercise];
  const moves = [slot, ...slot.variants];
  const matching = new Map(moves.flatMap(move => [move.id, ...(move.previousIds || [])].map(id => [id, move])));
  openDialog('Полная техника', `<p class="intro">${escapeText(item.title)}</p>
    <div id="full-video-library">Ищем загруженные видео…</div>
    <div id="full-video-slot"></div>
    <details class="other-video" data-file-drop="full-video-file"><summary>Открыть другое видео</summary>
      ${link ? `<p><a href="${escapeText(link)}" target="_blank" rel="noopener noreferrer">Открыть сохранённую ссылку</a></p>` : ''}
      <label class="button secondary file-label">Открыть видео с устройства
        <input id="full-video-file" type="file" accept="video/*,.mov,.mp4"></label>
      <form id="link-form" data-id="${item.id}">
      <label for="technique-url">Ссылка на видео</label>
      <input id="technique-url" type="url" maxlength="2048" value="${escapeText(link || '')}" placeholder="https://…">
      <button type="submit" class="button primary">Сохранить ссылку</button>
    </form></details>`);
  const list = dialog.querySelector('#full-video-library');
  try {
    const library = await readTechniqueLibrary(state.program.id);
    if (!list.isConnected || !dialog.open) return;
    const videos = library?.videos.filter(video => matching.has(video.movement)) || [];
    if (!videos.length) {
      list.innerHTML = `<p class="intro">Видео для этого упражнения можно загрузить во вкладке «Данные».</p>
        ${button('Перейти в «Данные»', 'load-technique-screen')}`;
      return;
    }
    fullVideoLibrary = { batch: library.batch, videos };
    const options = moves.flatMap(move => {
      const choices = videos.filter(video => matching.get(video.movement) === move);
      return choices.map((video, index) => ({
        ...video, label: choices.length > 1 ? `${move.title} · Видео ${index + 1}` : move.title
      }));
    });
    list.innerHTML = `<div class="full-video-choices" aria-label="Видео упражнения">${options.length > 1 ?
      options.map(video => button(escapeText(video.label), 'choose-full-video', 'secondary',
        `data-index="${video.index}" aria-pressed="false" title="${escapeText(video.filename)}"`)).join('') : ''}</div>
      ${button('Скачать оригинал', 'download-full-original', 'quiet')}`;
    await showFullVideo((videos.find(video => matching.get(video.movement).id === item.id) || videos[0]).index);
  } catch {
    if (list.isConnected) list.textContent = 'Не удалось прочитать хранилище видео.';
  }
}

document.addEventListener('click', async event => {
  const control = event.target.closest('button[data-action]');
  if (!control) return;
  const { action, index } = control.dataset;
  switch (action) {
    case 'programs': case 'days': case 'workout': case 'garmin': case 'data':
      if (action === 'workout' && state.screen === 'workout') return;
      state.screen = action;
      break;
    case 'day':
      state.day = Number(index);
      state.exercise = 0;
      state.screen = 'workout';
      break;
    case 'exercise':
      state.exercise = Number(index);
      if (dialog.open) dialog.close();
      break;
    case 'previous': case 'next':
      state.exercise += action === 'next' ? 1 : -1;
      break;
    case 'exercise-menu':
      openDialog('Упражнения дня', exercises());
      return;
    case 'history':
      historyDialog(exercise());
      return;
    case 'full-technique':
      fullTechnique(exercise());
      return;
    case 'load-technique-screen':
      dialog.close();
      state.screen = 'data';
      break;
    case 'choose-full-video':
      await showFullVideo(Number(index));
      return;
    case 'download-full-original':
      await downloadFullOriginal(Number(index));
      return;
    case 'toggle-video': {
      const video = document.querySelector('#technique-video');
      if (video.paused) video.play().catch(() => announce('Не удалось запустить видео.'));
      else video.pause();
      return;
    }
    case 'note':
      openNote();
      return;
    case 'close':
      dialog.close();
      return;
    case 'mark': case 'skip-set': case 'select-set': case 'undo-set':
      updatePlan(action, Number(index));
      return;
    case 'reset-exercise':
      openDialog('Снять все отметки?', `<p class="intro">${escapeText(exercise().title)}</p>
        ${button('Снять отметки', 'confirm-reset-exercise', 'primary')}`);
      return;
    case 'confirm-reset-exercise':
      dialog.close();
      updatePlan(action);
      return;
    case 'finish-day':
      openDialog('Завершить тренировку?', `<p class="intro">Отметки всех подходов за день ${state.day + 1} будут сброшены.</p>
        ${button('Завершить тренировку', 'confirm-finish-day', 'primary')}`);
      return;
    case 'confirm-finish-day': {
      const progress = state.progress;
      const focus = state.focus;
      const keep = entries => Object.fromEntries(Object.entries(entries).filter(([key]) => !key.startsWith(`${state.day}-`)));
      control.disabled = true;
      state.progress = keep(progress);
      state.focus = keep(focus);
      try {
        await saveLocal();
      } catch {
        state.progress = progress;
        state.focus = focus;
        control.disabled = false;
        return;
      }
      dialog.close();
      state.exercise = 0;
      state.screen = 'days';
      announce('Тренировка завершена.');
      break;
    }
    case 'edit-garmin': {
      if (state.busy) return;
      const workout = state.imported.find(row => row.id === control.dataset.record);
      if (!workout) return;
      state.fileRequest++;
      state.importError = '';
      state.draft = { ...structuredClone(workout), program: 'current', editing: true };
      break;
    }
    case 'cancel-fit-edit':
      state.draft = null;
      break;
    case 'delete-garmin': {
      const workout = state.imported.find(row => row.id === control.dataset.record);
      if (!workout) return;
      openDialog('Удалить тренировку Garmin?', `<p class="intro">${displayDate(workout.date)} · День ${workout.day + 1}</p>
        ${button('Удалить тренировку', 'confirm-garmin-delete', 'primary', `data-record="${escapeText(workout.id)}"`)}`);
      return;
    }
    case 'confirm-garmin-delete': {
      const id = control.dataset.record;
      if (!state.imported.some(row => row.id === id)) return;
      if (await commitGarmin({ imported: [], garminDeleted: [{ id, updatedAt: garminChangeTime(id) }] })) {
        dialog.close();
        announce('Тренировка удалена из истории.');
        break;
      }
      return;
    }
    case 'reset-fit':
      if (!validateSetFields()) return;
      autoMap(state.draft);
      refreshReview();
      announce('Подходы распределены заново.');
      return;
    case 'add-fit-set': {
      if (!validateSetFields()) return;
      const draft = state.draft;
      const slot = Number(index);
      const after = draft.mapping.lastIndexOf(slot);
      const position = after < 0 ? draft.mapping.length : after + 1;
      draft.sets.splice(position, 0, { weight: null, reps: null, rest: null });
      draft.mapping.splice(position, 0, slot);
      refreshReview();
      document.querySelector(`[data-fit-field="weight"][data-position="${position}"]`).focus();
      return;
    }
    case 'remove-fit-set': {
      const draft = state.draft;
      draft.sets.splice(Number(index), 1);
      draft.mapping.splice(Number(index), 1);
      refreshReview();
      return;
    }
    case 'confirm-fit': {
      if (state.busy || !validateSetFields()) return;
      const workout = state.draft;
      const dateField = document.querySelector('#fit-date');
      const initialRestField = document.querySelector('#fit-initial-rest');
      if ((dateField && !dateField.reportValidity()) || (initialRestField && !initialRestField.reportValidity())) return;
      const { id, day, mapping, variants } = workout;
      const date = dateField?.value ?? workout.date;
      if (!validGarminDate(date)) return;
      const initialRest = initialRestField ? (initialRestField.value ? initialRestField.valueAsNumber : null) : workout.initialRest;
      const sets = workout.sets.map((set, position) => ({ ...set, kind: fitSetKind(workout, position) }));
      const previous = workout.editing && state.imported.find(row => row.id === id && row.day === day);
      const performed = days[day].map((slot, index) =>
        (previous?.variants?.[index] === variants[index] && previous?.performed?.[index]) || describeMovement(slot, variants[index]));
      const row = { id, date, day, mapping, variants, performed, sets, initialRest, startedAt: garminStart(workout),
        updatedAt: garminChangeTime(id) };
      control.disabled = true;
      if (await commitGarmin({ imported: [row] })) {
        state.draft = null;
        state.importError = '';
        announce(workout.editing ? 'Тренировка обновлена в истории.' : `Тренировка за ${displayDate(date)} добавлена в историю.`);
      }
      control.disabled = false;
      break;
    }
    case 'backup':
      await exportGarmin();
      return;
    case 'confirm-garmin-restore':
      if (state.pendingGarmin && await commitGarmin(state.pendingGarmin)) {
        state.pendingGarmin = null;
        dialog.close();
        announce('Записи Garmin синхронизированы.');
      }
      return;
    case 'confirm-restore': case 'confirm-merge':
      await restoreWorkspace(action === 'confirm-merge');
      return;
    default:
      return;
  }
  render();
});

async function receiveFile(id, file) {
  if (id === 'workspace-file') await readPersonalFile(file);
  else if (id === 'garmin-backup-file') await readGarminBackup(file);
  else if (id === 'technique-file') await loadTechniqueFile(file);
  else if (id === 'full-video-file') {
    fullVideoRequest++;
    for (const choice of dialog.querySelectorAll('[data-action="choose-full-video"]')) choice.setAttribute('aria-pressed', 'false');
    mountFullVideo(dialog.querySelector('#full-video-slot'), file);
  } else if (id === 'fit-file' && !state.busy && !state.draft?.editing) {
    const request = ++state.fileRequest;
    try {
      if (file.size > 32 * 1024 * 1024) throw new Error('Выберите FIT-файл размером до 32 МБ.');
      const workout = readFitWorkout(await file.arrayBuffer(), file.name);
      if (request === state.fileRequest && state.screen === 'garmin') loadDraft(workout);
    } catch (error) {
      if (request !== state.fileRequest || state.screen !== 'garmin') return;
      state.importError = error.message;
      render(false);
    }
  }
}

let activeFileDrop;
function highlightFileDrop(zone) {
  if (activeFileDrop === zone) return;
  activeFileDrop?.classList.remove('file-drop-active');
  activeFileDrop = zone;
  activeFileDrop?.classList.add('file-drop-active');
}

document.addEventListener('dragover', event => {
  if (!event.dataTransfer?.types.includes('Files')) return;
  event.preventDefault();
  const zone = event.target.closest('[data-file-drop]');
  event.dataTransfer.dropEffect = zone ? 'copy' : 'none';
  highlightFileDrop(zone);
});

document.addEventListener('dragleave', event => {
  if (activeFileDrop?.contains(event.target) && !activeFileDrop.contains(event.relatedTarget)) highlightFileDrop(null);
});

document.addEventListener('drop', event => {
  highlightFileDrop(null);
  const files = event.dataTransfer?.files;
  if (!files?.length) return;
  event.preventDefault();
  const zone = event.target.closest('[data-file-drop]');
  if (zone && files.length === 1) receiveFile(zone.dataset.fileDrop, files[0]);
  else if (zone) announce('Перетащите один файл за раз.');
});

document.addEventListener('dragstart', event => {
  if (!event.target.closest('[data-action="backup"]')) return;
  if (!state.program || state.busy) {
    event.preventDefault();
    return;
  }
  const file = garminArchive();
  const url = URL.createObjectURL(file);
  event.dataTransfer.effectAllowed = 'copy';
  event.dataTransfer.items.add(file);
  event.dataTransfer.setData('DownloadURL', `${file.type}:${file.name}:${url}`);
  setTimeout(() => URL.revokeObjectURL(url), 60000);
});

document.addEventListener('change', event => {
  const input = event.target;
  if (input.type !== 'file' || !input.closest('#app, #dialog')) return;
  const file = input.files[0];
  input.value = '';
  if (file) receiveFile(input.id, file);
});

app.addEventListener('change', async event => {
  const target = event.target;
  if (target.id === 'movement-variant') {
    state.variants[slotKey(state.day, state.exercise)] = Number(target.value);
    saveLocal();
    render(false);
    document.querySelector('#movement-variant').focus();
  } else if (target.id === 'fit-date') {
    if (validGarminDate(target.value)) state.draft.date = target.value;
  } else if (target.id === 'fit-initial-rest') {
    if (target.validity.valid) state.draft.initialRest = target.value ? target.valueAsNumber : null;
  } else if (target.id === 'fit-program') {
    state.draft.program = target.value;
    state.draft.day = null;
    state.draft.mapping = [];
    render(false);
    document.querySelector(target.value ? '#fit-day' : '#fit-program').focus();
  } else if (target.id === 'fit-day') {
    const draft = state.draft;
    draft.day = target.value === '' ? null : Number(target.value);
    if (draft.day !== null) {
      draft.variants = days[draft.day].map((_, index) => selectedVariant(draft.day, index));
      autoMap(draft);
    }
    document.querySelector('#import-review').innerHTML = draft.day === null ? '' : review(draft);
  } else if (target.dataset.fitField) {
    if (!target.validity.valid || target.validity.badInput) return;
    const set = state.draft.sets[Number(target.dataset.position)];
    set[target.dataset.fitField] = target.value === '' ? null : target.valueAsNumber;
    target.closest('fieldset').querySelector('legend span').textContent = setResult(set);
  } else if (target.dataset.fitKind !== undefined) {
    state.draft.sets[Number(target.dataset.fitKind)].kind = target.value;
  } else if (target.dataset.importVariant !== undefined) {
    const slot = Number(target.dataset.importVariant);
    if (!validateSetFields()) {
      target.value = String(state.draft.variants[slot]);
      return;
    }
    state.draft.variants[slot] = Number(target.value);
    refreshReview();
    document.querySelector(`[data-import-variant="${slot}"]`).focus();
  } else if (target.dataset.setIndex !== undefined) {
    const position = Number(target.dataset.setIndex);
    const exerciseIndex = Number(target.value);
    if (!validateSetFields()) {
      target.value = String(state.draft.mapping[position]);
      return;
    }
    const expanded = openedImportExercises();
    expanded.add(exerciseIndex);
    state.draft.mapping[position] = exerciseIndex;
    refreshReview(expanded);
    document.querySelector(`[data-set-index="${position}"]`).focus();
  }
});

dialog.addEventListener('close', () => {
  const video = dialog.querySelector('video');
  video?.pause();
  fullVideoRequest++;
  fullVideoLibrary = undefined;
  releaseFullVideo();
});

dialog.addEventListener('submit', async event => {
  if (!['note-form', 'link-form'].includes(event.target.id)) return;
  event.preventDefault();
  if (event.target.id === 'link-form') {
    const input = dialog.querySelector('#technique-url').value.trim();
    const link = input ? cleanLink(input) : '';
    if (input && !link) {
      announce('Укажите ссылку HTTPS.');
      return;
    }
    state.links[event.target.dataset.id] = link;
    try {
      await saveLocal();
      dialog.close();
      announce('Ссылка сохранена.');
    } catch {}
    return;
  }
  const key = event.target.dataset.key;
  const saved = dialog.querySelector('#note-text').value.trim();
  state.notes[key] = saved;
  try { await saveLocal(); } catch { return; }
  dialog.close();
  app.querySelector('.exercise-note')?.classList.toggle('has-note', Boolean(state.notes[noteKey()]));
  announce('Комментарий сохранён.');
});

async function start() {
  try {
    const { record, media } = await readWorkspace();
    if (record) applyWorkspace(record, media);
  } catch {
    announce('Локальное хранилище браузера недоступно.');
  }
  render();
}

start();
