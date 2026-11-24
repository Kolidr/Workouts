const dayMilliseconds = 86400000;
const weekMilliseconds = 7 * dayMilliseconds;
const shortAnalyticsDate = new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'UTC' });
const analyticsSelection = { weeks: 4, movement: '' };

function analyticsWeek(date) {
  const time = Date.parse(date);
  const weekday = (new Date(time).getUTCDay() + 6) % 7;
  return time - weekday * dayMilliseconds;
}

function collectProgramAnalytics(program, workouts, weekCount) {
  const lastWeek = analyticsWeek(workouts.at(-1).date);
  const firstWeek = lastWeek - (weekCount - 1) * weekMilliseconds;
  const weeks = Array.from({ length: weekCount }, (_, index) => ({
    date: firstWeek + index * weekMilliseconds, count: 0
  }));
  const volume = program.days.map(() => ({ warm: 0, work: 0, known: 0 }));
  const movements = new Map();
  const rests = { betweenSets: [], betweenExercises: [] };

  for (const workout of workouts) {
    const week = (analyticsWeek(workout.date) - firstWeek) / weekMilliseconds;
    if (week < 0 || week >= weekCount) continue;
    weeks[week].count++;
    const slots = program.days[workout.day];
    workout.sets.forEach((set, index) => {
      const kind = set.kind === 'warm' ? 'warm' : 'work';
      const position = workout.mapping[index];
      const previous = workout.mapping[index - 1];
      const pause = workout.sets[index - 1]?.rest;
      const hasWeight = Number.isFinite(set.weight);
      if (week === weekCount - 1 && hasWeight && Number.isFinite(set.reps)) {
        volume[workout.day][kind] += set.weight * set.reps;
        volume[workout.day].known++;
      }
      if (position >= 0 && previous >= 0 && Number.isFinite(pause)) {
        rests[position === previous ? 'betweenSets' : 'betweenExercises'].push(pause);
      }
      if (position < 0 || !hasWeight || !slots[position]) return;
      const movement = workout.performed?.[position] || describeMovement(slots[position], workout.variants?.[position]);
      if (!movements.has(movement.id)) movements.set(movement.id, { ...movement, sessions: new Map() });
      const sessions = movements.get(movement.id).sessions;
      if (!sessions.has(workout.id)) sessions.set(workout.id, { date: workout.date });
      const point = sessions.get(workout.id);
      const current = point[kind];
      if (!current || set.weight > current.weight || (set.weight === current.weight && (set.reps ?? -1) > (current.reps ?? -1))) {
        point[kind] = set;
      }
    });
  }
  return { weeks, volume, movements, rests };
}

function analyticsLegend(items) {
  return `<div class="analytics-legend">${items.map(([style, text]) =>
    `<span><i class="analytics-swatch ${style}" aria-hidden="true"></i>${text}</span>`).join('')}</div>`;
}

function chartDateIndexes(count) {
  const labels = Math.min(count, 5);
  return new Set(Array.from({ length: labels }, (_, index) => Math.round(index * (count - 1) / Math.max(1, labels - 1))));
}

function weeklyActivity(weeks, planned) {
  const total = weeks.reduce((sum, week) => sum + week.count, 0);
  const upper = Math.max(1, planned, ...weeks.map(week => week.count));
  const y = value => 104 - 80 * value / upper;
  const width = 316 / weeks.length;
  const x = index => 28 + width * (index + .5);
  const barWidth = Math.min(44, width * .57);
  const showDate = chartDateIndexes(weeks.length);
  const range = `${shortAnalyticsDate.format(weeks[0].date)} – ${displayDate(new Date(weeks.at(-1).date + 6 * dayMilliseconds).toISOString().slice(0, 10))}`;
  return `<section class="analytics-card">
    <div class="analytics-card-header"><h3>Тренировки по неделям</h3><span>${range}</span></div>
    <p class="analytics-metric"><strong>${total}</strong> Записи Garmin</p>
    <svg class="analytics-chart" viewBox="0 0 352 130" role="img"
      aria-label="${weeks.map(week => `${shortAnalyticsDate.format(week.date)} — ${week.count} трен.`).join(', ')}. План: ${planned} в неделю">
      <path class="analytics-grid" d="M28 104H344"/>
      <path class="analytics-target" d="M28 ${y(planned)}H344"/>
      <text class="analytics-axis" x="18" y="${y(planned) + 4}" text-anchor="end">${planned}</text>
      <text class="analytics-axis" x="18" y="107" text-anchor="end">0</text>
      ${weeks.map((week, index) => `
        <rect class="analytics-fill" x="${x(index) - barWidth / 2}" y="${y(week.count)}" width="${barWidth}" height="${104 - y(week.count)}" rx="4"/>
        <text class="analytics-number" x="${x(index)}" y="${y(week.count) - 6}" text-anchor="middle">${week.count}</text>
        ${showDate.has(index) ? `<text class="analytics-axis" x="${x(index)}" y="121" text-anchor="middle">${shortAnalyticsDate.format(week.date)}</text>` : ''}`).join('')}
    </svg>
    ${analyticsLegend([['work', 'Тренировки'], ['target', 'Дней в программе']])}
  </section>`;
}

function latestTrainingVolume(volume, week) {
  const max = Math.max(1, ...volume.map(day => day.warm + day.work));
  const bars = volume.map(({ warm, work, known }, index) => `
    <div class="analytics-bar-row">
      <span>День ${index + 1}</span>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" role="img"
        aria-label="${known ? `Разминка ${listWeight.format(warm)}, рабочие подходы ${listWeight.format(work)}` : 'Нет данных о нагрузке'}">
        <rect class="analytics-bar-track" width="100" height="8" rx="3"/>
        <rect class="analytics-warm-fill" width="${warm / max * 100}" height="8"/>
        <rect class="analytics-fill" x="${warm / max * 100}" width="${work / max * 100}" height="8"/>
      </svg>
      <strong>${known ? listWeight.format(warm + work) : '—'}</strong>
    </div>`).join('');
  return `<section class="analytics-card">
    <div class="analytics-card-header"><h3>Объём нагрузки</h3><span>Неделя с ${shortAnalyticsDate.format(week.date)}</span></div>
    <p class="analytics-caption">Вес × повторения, кг·повт.</p>
    <div class="analytics-bars">${bars}</div>
    ${analyticsLegend([['warm', 'Разминка'], ['work', 'Рабочие подходы']])}
  </section>`;
}

function exerciseTrend(points) {
  const values = points.flatMap(point => [point.warm?.weight, point.work?.weight].filter(Number.isFinite));
  const low = Math.min(...values);
  const high = Math.max(...values);
  const rawStep = Math.max(1, (high - low) / 3);
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.ceil(rawStep / magnitude) * magnitude;
  const floor = Math.floor(low / step) * step;
  const ticks = Array.from({ length: 5 }, (_, i) => floor + step * i);
  const y = weight => 111 - 88 * (weight - floor) / (4 * step);
  const x = index => points.length === 1 ? 192 : 51 + 277 * index / (points.length - 1);
  const showDate = chartDateIndexes(points.length);
  return `<svg class="analytics-chart" viewBox="0 0 352 141" role="img" aria-label="Максимальный вес по тренировкам, кг. Точные значения под графиком">
    ${ticks.map(weight => `<path class="analytics-grid" d="M38 ${y(weight)}H344"/>
      <text class="analytics-axis" x="33" y="${y(weight) + 4}" text-anchor="end">${listWeight.format(weight)}</text>`).join('')}
    ${['warm', 'work'].map(kind => {
      const known = points.flatMap((point, index) => point[kind] ? [[x(index), y(point[kind].weight)]] : []);
      return `<polyline class="analytics-series ${kind}" points="${known.map(pair => pair.join(',')).join(' ')}"/>
        ${known.map(([cx, cy]) => `<circle class="analytics-point ${kind}" cx="${cx}" cy="${cy}" r="3.4"/>`).join('')}`;
    }).join('')}
    ${points.map((point, index) => showDate.has(index)
      ? `<text class="analytics-axis" x="${x(index)}" y="129" text-anchor="middle">${shortAnalyticsDate.format(Date.parse(point.date))}</text>` : '').join('')}
  </svg>`;
}

function movementProgress(movements) {
  const options = [...movements.values()];
  const movement = movements.get(analyticsSelection.movement) ||
    options.reduce((best, move) => !best || move.sessions.size > best.sessions.size ? move : best, null);
  if (!movement) return `<section class="analytics-card"><h3>Прогресс в упражнении</h3><p class="analytics-caption">Для графика нужен хотя бы один подход с указанным весом.</p></section>`;
  const sessions = [...movement.sessions.values()];
  const points = sessions.slice(-12);
  const latest = points.at(-1);
  const selected = options.map(move =>
    `<option value="${escapeText(move.id)}" ${move === movement ? 'selected' : ''}>${escapeText(move.title)}${move.alternative ? ' · аналог' : ''}</option>`).join('');
  return `<section class="analytics-card">
    <h3>Прогресс в упражнении</h3>
    <label class="analytics-movement">Упражнение<select id="analytics-movement">${selected}</select></label>
    <p class="analytics-caption">Максимальный вес за тренировку, кг${sessions.length > points.length ? ' · последние 12 тренировок' : ''}</p>
    <div class="analytics-latest" aria-label="Последняя тренировка">
      <span>Разминка <strong>${setResult(latest.warm)}</strong></span>
      <span>Рабочие <strong>${setResult(latest.work)}</strong></span>
    </div>
    ${exerciseTrend(points)}
    ${analyticsLegend([['warm', 'Разминка'], ['work', 'Рабочие подходы']])}
    <details class="analytics-values">
      <summary>Значения по датам</summary>
      <table><thead><tr><th scope="col">Дата</th><th scope="col">Разминка</th><th scope="col">Рабочие</th></tr></thead>
      <tbody>${points.map(point => `<tr><th scope="row">${displayDate(point.date)}</th>
        <td>${setResult(point.warm)}</td><td>${setResult(point.work)}</td></tr>`).join('')}</tbody></table>
    </details>
  </section>`;
}

function analyticsMedian(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function recoveryAnalytics(rests) {
  const betweenSets = analyticsMedian(rests.betweenSets);
  const betweenExercises = analyticsMedian(rests.betweenExercises);
  const max = Math.max(1, betweenSets, betweenExercises);
  const bars = [['Между подходами', betweenSets], ['Между упражнениями', betweenExercises]];
  return `<section class="analytics-card">
    <h3>Медиана отдыха</h3>
    <div class="analytics-bars">${bars.map(([label, seconds]) => `<div class="analytics-bar-row">
      <span>${label}</span>
      <svg viewBox="0 0 100 8" preserveAspectRatio="none" aria-hidden="true"><rect class="analytics-bar-track" width="100" height="8" rx="3"/>
        <rect class="analytics-fill" width="${seconds / max * 100}" height="8" rx="3"/></svg>
      <strong>${seconds === null ? '—' : restTime(seconds)}</strong>
    </div>`).join('')}</div>
    <p class="analytics-caption">Паузы из Garmin, включая разминку.</p>
  </section>`;
}

function programAnalytics(program, workouts) {
  if (!workouts.length) {
    return `<section class="program-analytics" aria-labelledby="analytics-title"><h2 id="analytics-title">Аналитика программы</h2>
      <p class="intro">Графики появятся после импорта тренировок Garmin.</p>
      ${button('Импорт Garmin', 'garmin')}</section>`;
  }
  const { weeks, volume, movements, rests } = collectProgramAnalytics(program, workouts, analyticsSelection.weeks);
  return `<section class="program-analytics" aria-labelledby="analytics-title">
    <div class="analytics-header">
      <h2 id="analytics-title">Аналитика программы</h2>
      <label>Период <select id="analytics-weeks">
      ${[4, 8, 12].map(weeks => `<option value="${weeks}" ${weeks === analyticsSelection.weeks ? 'selected' : ''}>${weeks} ${weeks === 4 ? 'недели' : 'недель'}</option>`).join('')}
      </select></label>
    </div>
    <div class="analytics-grid-layout">
      ${weeklyActivity(weeks, program.days.length)}
      ${latestTrainingVolume(volume, weeks.at(-1))}
      ${movementProgress(movements)}
      ${recoveryAnalytics(rests)}
    </div>
  </section>`;
}
