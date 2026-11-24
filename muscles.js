const muscleNames = {
  chest: 'Грудные', frontDelts: 'Передние дельты', sideDelts: 'Средние дельты', rearDelts: 'Задние дельты',
  triceps: 'Трицепсы', biceps: 'Бицепсы', forearms: 'Мышцы предплечья', lats: 'Широчайшие мышцы спины',
  midBack: 'Мышцы верхней части спины', quads: 'Квадрицепсы', adductors: 'Приводящие мышцы бедра',
  glutes: 'Ягодичные', hamstrings: 'Задняя поверхность бедра', calves: 'Икроножные',
  abs: 'Мышцы живота', obliques: 'Косые мышцы живота', traps: 'Трапециевидные',
  lowerBack: 'Разгибатели спины', serratus: 'Передние зубчатые', shins: 'Мышцы голени'
};

const bodyHalf = 'M52 31L52 40Q49 43 39 46Q27 48 23 62Q21 69 21 78Q15 90 12 103Q9 115 3 122Q1 124 0 129L3 129L1 133Q4 137 10 137Q13 133 16 125Q18 119 24 110Q29 102 34 89L38 81Q39 91 43 101Q43 108 39 117Q36 129 38 147L42 169Q44 178 41 187Q38 198 44 218Q47 228 45 233L41 238Q40 242 46 242L54 242Q58 242 57 237L57 224L58 204Q59 192 55 179Q58 163 60 135L64 134L64 39Z';
const frontRegions = {
  traps: 'M53 38Q56 41 62 42L60 48Q53 46 45 47Z',
  sideDelts: 'M37 47Q27 49 24 61Q29 57 33 55L42 49Z',
  frontDelts: 'M42 48Q31 50 25 62L23 72Q32 67 39 58L47 50Z',
  chest: 'M60 51Q51 48 42 55Q35 59 35 65Q36 72 45 75Q54 78 61 72Z',
  serratus: 'M40 76Q47 79 49 83L47 93Q43 91 40 83Z',
  abs: 'M61 77Q52 75 51 82L50 95Q50 106 57 114Q60 116 62 115Z',
  obliques: 'M44 92Q49 98 50 107L55 114Q48 112 42 106Z',
  biceps: 'M34 68Q34 78 30 87Q25 95 20 94Q16 93 21 84Q24 74 34 68Z',
  forearms: 'M20 96Q26 96 22 105Q17 115 11 119Q7 121 10 113Q13 102 20 96Z',
  quads: 'M43 119Q49 119 54 128Q56 137 53 151Q51 167 46 170Q41 164 40 150Q37 131 43 119Z',
  adductors: 'M55 125Q59 126 61 133L57 151Q56 159 52 161Q56 143 55 125Z',
  shins: 'M49 181Q53 177 54 185Q58 199 53 223Q51 223 49 210Q47 195 49 181Z',
  calves: 'M45 184Q48 185 47 195L48 211Q43 205 43 196Q42 190 45 184Z'
};
const backRegions = {
  traps: 'M60 38Q52 44 40 48L50 54L60 71Z',
  midBack: 'M46 52Q54 54 60 66L61 85Q57 82 53 74Q48 63 46 52Z',
  rearDelts: 'M39 49Q28 49 25 61L23 68Q32 65 42 54Z',
  sideDelts: 'M31 52Q24 55 22 69L25 68Q28 60 31 52Z',
  lats: 'M46 58Q48 73 58 86Q53 91 46 100Q40 92 39 82L38 66Z',
  lowerBack: 'M60 87Q55 89 49 101Q53 106 61 111Z',
  triceps: 'M35 66Q33 77 30 85Q25 92 22 92Q24 87 24 82Q20 86 19 87Q22 73 35 66Z',
  forearms: 'M20 96Q26 96 22 105Q17 115 11 119Q7 121 10 113Q13 102 20 96Z',
  glutes: 'M48 107Q57 108 61 121Q64 130 56 133L43 133Q38 129 42 118Q44 110 48 107Z',
  hamstrings: 'M43 136Q49 135 55 137Q56 151 53 162Q51 174 46 174Q41 167 40 151Q39 142 43 136Z',
  calves: 'M46 184Q51 178 54 186Q58 195 53 213Q51 223 48 219Q44 215 43 202Q41 190 46 184Z'
};

function muscleFigure(item, rear) {
  const regions = rear ? backRegions : frontRegions;
  const regionPaths = Object.entries(regions).map(([group, coordinates]) => {
    const emphasis = item.major.includes(group) ? 'muscle-major' : item.minor.includes(group) ? 'muscle-minor' : 'muscle-inactive';
    return `<path class="${emphasis}" d="${coordinates}"/>`;
  }).join('');
  const half = `<path class="body-outline" d="${bodyHalf}" />${regionPaths}`;
  return `<figure class="muscle-figure">
    <svg viewBox="-2 0 132 246" aria-hidden="true">
      <g>
        ${half}<g transform="translate(128 0) scale(-1 1)">${half}</g>
      </g>
      <path class="body-outline" d="M53 27Q51 24 51 16Q51 5 64 4Q77 5 77 16Q77 24 75 27L72 32L72 38Q64 41 56 38L56 32Z"/>
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
