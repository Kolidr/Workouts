const muscleNames = {
  chest: 'Грудные', frontDelts: 'Передние дельты', sideDelts: 'Средние дельты', rearDelts: 'Задние дельты',
  triceps: 'Трицепсы', biceps: 'Бицепсы', forearms: 'Мышцы предплечья', lats: 'Широчайшие мышцы спины',
  midBack: 'Мышцы верхней части спины', quads: 'Квадрицепсы', adductors: 'Приводящие мышцы бедра',
  glutes: 'Ягодичные', hamstrings: 'Задняя поверхность бедра', calves: 'Икроножные',
  abs: 'Мышцы живота', obliques: 'Косые мышцы живота', traps: 'Трапециевидные',
  lowerBack: 'Разгибатели спины', serratus: 'Передние зубчатые', shins: 'Мышцы голени'
};

const bodyHalf = 'M50 33Q48 41 40 43L27 48Q20 50 17 60L13 80L9 101L7 118L3 131L0 140L3 147L8 147L15 137L17 124L23 111L28 92L32 75L35 69L38 80L43 93L46 106L38 121Q33 137 39 156L43 172L41 186Q40 195 45 211L46 224L41 232Q39 236 45 237L53 237Q57 236 56 230L56 214L57 198L54 184L56 173L58 154L60 138L60 40Z';
const frontRegions = {
  traps: 'M50 37L60 42L57 50L40 46Z',
  frontDelts: 'M28 49L37 50L32 58L27 67L21 71L21 60Q24 54 28 49Z',
  sideDelts: 'M27 49Q20 51 18 61L15 74L21 70L21 61Z',
  chest: 'M37 52Q47 48 58 53L58 67Q51 73 39 70L32 64Z',
  serratus: 'M37 72L47 76L44 82L49 86L44 92L40 83Z',
  abs: 'M51 73L58 71L59 110L53 116L49 103L49 88Z',
  obliques: 'M45 90L49 94L51 111L46 115L44 105Z',
  biceps: 'M19 75L29 70Q29 81 23 94L19 98L15 94Z',
  forearms: 'M14 100L22 98L17 117L12 131L8 128L10 116Z',
  quads: 'M43 117L52 124L51 145L49 160L46 172L42 156L39 138Q38 126 43 117Z',
  adductors: 'M53 122L59 135L55 158L53 166L51 152Z',
  shins: 'M47 183L52 182L54 198L52 221L49 218L47 205Z',
  calves: 'M45 183L47 195L47 209L44 207L42 194Z'
};
const backRegions = {
  traps: 'M49 37L59 41L59 66L53 62L45 50L38 46Z',
  midBack: 'M42 49L49 55L56 67L58 86L51 79L46 67L40 58Z',
  rearDelts: 'M27 49L37 49L39 56L31 62L25 69L20 73L21 60Z',
  sideDelts: 'M27 49Q20 51 18 61L15 75L20 72L21 61Z',
  lats: 'M35 64L42 61L47 73L55 87L55 106L47 101L43 88L38 78Z',
  lowerBack: 'M56 85L59 84L59 112L56 119L52 111L55 104Z',
  triceps: 'M24 67L30 71L26 89L20 99L15 96L17 79Z',
  forearms: 'M14 100L22 100L17 117L12 131L8 128L10 116Z',
  glutes: 'M44 109L54 111L59 123L58 133Q49 138 39 132L36 127Z',
  hamstrings: 'M39 136Q48 140 56 136L54 156L49 170L44 171L41 155Z',
  calves: 'M44 183Q50 180 54 187L55 200L50 216L46 210L43 198Z'
};

function muscleFigure(item, rear) {
  const regions = rear ? backRegions : frontRegions;
  const regionPaths = Object.entries(regions).map(([group, coordinates]) => {
    const emphasis = item.major.includes(group) ? 'muscle-major' : item.minor.includes(group) ? 'muscle-minor' : 'muscle-inactive';
    return `<path class="${emphasis}" d="${coordinates}"/>`;
  }).join('');
  const half = `<path class="body-outline" d="${bodyHalf}" />${regionPaths}`;
  const torso = rear ?
    '<path d="M60 45v73m-10-48 10 15 10-15m-20 67 3 26m17-26-3 26m-22 30 5 15m25-15-5 15"/>' :
    '<path d="M60 53v67m-10-42q10-4 20 0m-21 8q11-4 22 0m-20 8q9-4 18 0m-16 8q7-3 14 0m-23 25 2 31m30-31-2 31m-28 32 5 18m23-18-5 18"/>';
  return `<figure class="muscle-figure">
    <svg viewBox="-2 0 124 241" aria-hidden="true">
      <path class="body-outline" d="M49 27Q47 22 48 14Q50 4 60 3Q70 4 72 14Q73 22 71 27L67 34L62 37L58 37L53 34Z"/>
      ${rear ? '' : '<path class="body-detail" d="M53 19h3m8 0h3m-9 9 2 1 2-1m-6 4 4 1 4-1"/>'}
      <g transform="translate(5 0) scale(.92 1)">
        ${half}<g transform="translate(120 0) scale(-1 1)">${half}</g>
        <g class="body-detail">${torso}</g>
      </g>
    </svg><figcaption>${rear ? 'Сзади' : 'Спереди'}</figcaption>
  </figure>`;
}

function muscles(item) {
  const labels = groups => groups.map(group => muscleNames[group]).join(', ');
  return `<section class="muscles" aria-labelledby="muscles-heading">
    <h2 id="muscles-heading">Задействованные мышцы</h2>
    <div class="muscles-content">
      <div class="muscles-figures">${muscleFigure(item, false)}${muscleFigure(item, true)}</div>
      <dl class="muscle-labels">
        <div><dt><i class="major-key"></i> Основные</dt><dd>${labels(item.major)}</dd></div>
        ${item.minor.length ? `<div><dt><i class="minor-key"></i> Дополнительно</dt><dd>${labels(item.minor)}</dd></div>` : ''}
      </dl>
    </div>
  </section>`;
}
