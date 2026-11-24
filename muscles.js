const muscleNames = {
  chest: 'Грудные', frontDelts: 'Передние дельты', sideDelts: 'Средние дельты', rearDelts: 'Задние дельты',
  triceps: 'Трицепсы', biceps: 'Бицепсы', forearms: 'Мышцы предплечья', lats: 'Широчайшие мышцы спины',
  midBack: 'Мышцы верхней части спины', quads: 'Квадрицепсы', adductors: 'Приводящие мышцы бедра',
  glutes: 'Ягодичные', hamstrings: 'Задняя поверхность бедра', calves: 'Икроножные',
  abs: 'Мышцы живота', obliques: 'Косые мышцы живота', traps: 'Трапециевидные',
  lowerBack: 'Разгибатели спины', serratus: 'Передние зубчатые', shins: 'Мышцы голени'
};

const bodyOutline = `M64 4C58 4 53 8 53 14V20C53 25 55 28 57 30L57 37
  C53 41 47 43 40 45C33 47 28 52 26 59C24 65 24 71 22 76
  C20 82 15 89 12 96L9 104C7 110 5 113 1 115L-2 117L-5 123H-3L-6 127
  C-6 130 0 132 4 132C6 132 7 129 9 126C12 122 13 118 14 115
  C19 108 24 103 28 96C32 89 36 82 39 75L43 94C42 102 39 107 38 116
  C35 131 36 145 38 161C40 172 38 181 38 188C35 197 36 212 40 228
  C41 232 39 234 40 237L37 241C29 243 30 246 38 246L46 245
  C50 245 49 241 49 237L50 218C51 211 51 201 52 194C52 186 54 181 55 174
  C56 163 60 150 61 139L62 128H66L67 139C68 150 72 163 73 174
  C74 181 76 186 76 194C77 201 77 211 78 218L79 237
  C79 241 78 245 82 245L90 246C98 246 99 243 91 241L88 237
  C89 234 87 232 88 228C92 212 93 197 90 188C90 181 88 172 90 161
  C92 145 93 131 90 116C89 107 86 102 85 94L89 75
  C92 82 96 89 100 96C104 103 109 108 114 115C115 118 116 122 119 126
  C121 129 122 132 124 132C128 132 134 130 134 127L131 123H133L130 117L127 115
  C123 113 121 110 119 104L116 96C113 89 108 82 106 76
  C104 71 104 65 102 59C100 52 95 47 88 45C81 43 75 41 71 37L71 30
  C73 28 75 25 75 20V14C75 8 70 4 64 4Z`;
const frontRegions = {
  traps: 'M57 39Q59 41 62 42L62 46Q56 44 50 45Z',
  sideDelts: 'M41 45Q30 47 26 62L25 66Q30 58 35 54Q39 49 46 47Z',
  frontDelts: 'M46 47Q39 49 35 54Q29 60 25 67Q32 62 38 58Q44 53 52 48Z',
  chest: 'M61 49C58 47 52 48 47 50C40 53 36 56 36 61C36 68 41 72 48 73C54 74 61 72 62 67L62 54Q62 50 61 49Z',
  serratus: 'M42 75Q45 77 49 76Q47 84 48 91Q48 98 50 102Q44 99 43 94Z',
  abs: 'M61 75C54 72 50 77 50 82L50 94C50 102 55 112 62 115L62 79Q62 76 61 75Z',
  obliques: 'M43 95Q47 103 54 106L59 115Q51 115 44 111Q39 107 43 95Z',
  biceps: 'M35 62C36 75 31 82 28 86C24 91 19 94 19 89C19 80 25 69 35 62Z',
  forearms: 'M22 92C28 90 28 97 23 104C20 111 14 117 11 119C6 122 9 114 10 110C13 101 16 94 22 92Z',
  quads: 'M43 123C46 124 50 130 53 135C59 144 57 152 54 160C52 167 48 173 45 171C40 168 39 156 38 145C38 137 39 128 43 123Z',
  adductors: 'M44 113Q51 115 58 120L62 126L58 145Q56 137 51 131Q45 124 44 113Z',
  shins: 'M50 186Q53 187 51 197L49 218Q47 225 46 218Q45 205 47 195Q48 189 50 186Z',
  calves: 'M42 188C46 186 46 195 45 201L44 217Q43 225 41 217C38 204 39 192 42 188Z'
};
const backRegions = {
  traps: 'M62 34C60 40 50 43 41 47L51 51Q55 51 56 58L62 71Z',
  midBack: 'M51 51Q57 50 62 54L62 78Q58 74 55 66Q53 59 51 51Z',
  rearDelts: 'M39 49Q33 50 29 57L26 65Q34 62 41 57L49 51Q44 51 39 49Z',
  sideDelts: 'M36 48Q29 52 26 60L25 66L28 65Q31 55 36 48Z',
  lats: 'M50 54C52 66 56 73 61 79C56 82 55 90 50 94C45 89 43 80 43 72L42 61Q47 58 50 54Z',
  lowerBack: 'M62 80C57 81 57 91 52 96Q54 101 62 104Z',
  triceps: 'M41 62Q41 75 34 83L34 75Q31 79 27 81Q30 68 41 62Z',
  forearms: 'M22 92C28 90 28 97 23 104C20 111 14 117 11 119C6 122 9 114 10 110C13 101 16 94 22 92Z',
  glutes: 'M51 101C55 100 61 111 62 117C64 126 57 126 51 126C45 127 40 127 40 121C39 114 45 102 51 101Z',
  hamstrings: 'M45 127Q49 126 55 127C58 136 57 153 54 163C52 172 49 179 45 175C41 170 40 158 39 148L38 138Q41 130 45 127Z',
  calves: 'M43 183C48 181 51 185 51 193C52 202 48 217 44 222C40 225 38 218 37 210C36 199 38 186 43 183Z'
};

function muscleFigure(item, rear) {
  const regions = rear ? backRegions : frontRegions;
  const regionPaths = Object.entries(regions).map(([group, coordinates]) => {
    const emphasis = item.major.includes(group) ? 'muscle-major' : item.minor.includes(group) ? 'muscle-minor' : 'muscle-inactive';
    return `<path class="${emphasis}" d="${coordinates}"/>`;
  }).join('');
  return `<figure class="muscle-figure">
    <svg viewBox="-8 0 144 250" aria-hidden="true">
      <path class="body-outline" d="${bodyOutline}"/>
      <g>${regionPaths}</g><g transform="translate(128 0) scale(-1 1)">${regionPaths}</g>
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
