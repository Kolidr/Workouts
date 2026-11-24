const updateViewKey = 'local-panel-update-view';
const appRelease = document.querySelector('meta[name="workouts-release"]').content;

function updateAssets(page) {
  return [...page.querySelectorAll('script[src], link[rel="stylesheet"]')]
    .map(element => element.getAttribute('src') || element.getAttribute('href')).join('|');
}

function readUpdateView(programId) {
  try {
    const value = sessionStorage.getItem(updateViewKey);
    sessionStorage.removeItem(updateViewKey);
    const view = JSON.parse(value);
    return view?.programId === programId ? view : null;
  } catch {
    return null;
  }
}

function installAppUpdater({ canRefresh, saveView, report }) {
  const control = document.querySelector('#update-app');
  const assets = updateAssets(document);
  if (!/^https?:$/.test(location.protocol)) {
    control.addEventListener('click', () => location.reload());
    return;
  }
  let inFlight;
  let lastCheck = 0;
  let reloading = false;

  async function checkRelease(manual = false) {
    if (reloading || navigator.onLine === false) {
      if (manual && !reloading) report('Подключитесь к интернету для обновления.');
      return;
    }
    if (!manual && (document.hidden || Date.now() - lastCheck < 8000)) return;
    if (manual && !canRefresh(true)) {
      report('Завершите текущее действие перед обновлением.');
      return;
    }
    if (!inFlight) {
      lastCheck = Date.now();
      const url = new URL('./', location.href);
      url.searchParams.set('_workouts', String(lastCheck));
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      inFlight = (async () => {
        const response = await fetch(url, { mode: 'same-origin', credentials: 'omit', cache: 'no-store',
          signal: controller.signal });
        if (!response.ok) throw new Error('Update check failed');
        const html = new DOMParser().parseFromString(await response.text(), 'text/html');
        const release = html.querySelector('meta[name="workouts-release"]')?.content;
        if (!release) throw new Error('Release information is missing');
        return { available: release !== appRelease || updateAssets(html) !== assets, url };
      })().finally(() => {
        clearTimeout(timeout);
        inFlight = undefined;
      });
    }
    try {
      const { available, url } = await inFlight;
      control.classList.toggle('has-update', available);
      control.title = available ? 'Доступна новая версия' : 'Обновить интерфейс';
      control.setAttribute('aria-label', available ? 'Обновить интерфейс. Доступна новая версия' : 'Обновить интерфейс');
      if (reloading || (!manual && (!available || document.hidden)) || !canRefresh(manual)) return;
      reloading = true;
      control.disabled = true;
      await saveView();
      if (!canRefresh(manual)) {
        reloading = false;
        control.disabled = false;
        return;
      }
      location.replace(url.href);
    } catch {
      reloading = false;
      control.disabled = false;
      if (manual) report('Не удалось обновить интерфейс. Попробуйте ещё раз.');
    }
  }

  control.addEventListener('click', () => checkRelease(true));
  document.addEventListener('visibilitychange', () => checkRelease());
  for (const event of ['pageshow', 'focus', 'online']) window.addEventListener(event, () => checkRelease());
  setInterval(() => checkRelease(), 120000);
  checkRelease();
}
