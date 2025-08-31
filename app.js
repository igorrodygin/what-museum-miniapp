
(function () {
  'use strict';

  const tg = window.Telegram?.WebApp;
  if (tg && typeof tg.ready === 'function') {
    try { tg.ready(); tg.expand(); } catch(_) {}
  }

  // Elements
  const imgEl = document.getElementById('painting-img');
  const titleEl = document.getElementById('title');
  const artistEl = document.getElementById('artist');
  const yearEl = document.getElementById('year');
  const progressEl = document.getElementById('progress');
  const streakEl = document.getElementById('streak');
  const cardEl = document.getElementById('card');
  const btnTretyakov = document.getElementById('btn-tretyakov');
  const btnRusmuseum = document.getElementById('btn-rusmuseum');
  const btnRestart = document.getElementById('btn-restart');
  const errEl = document.getElementById('error');
  const loaderEl = document.getElementById('loader');

  // Game state
  let items = [];
  let index = 0;
  let correct = 0;
  let streak = 0;

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function normalizeItem(raw) {
    // Map various possible field names to a common schema
    const title = raw.title || raw.name || raw.painting || raw.caption || '';
    const artist = raw.artist || raw.author || raw.painter || raw.creator || '';
    const year = raw.year || raw.date || raw.created || raw.when || '';
    const museum = raw.museum || raw.collection || raw.gallery || '';
    const image = raw.image_url || raw.image || raw.img || raw.url || raw.photo || '';

    return { title, artist, year, museum, image_url: image };
  }

  async function fetchFirst(urls) {
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        if (Array.isArray(json) && json.length) return json;
      } catch (e) {
        // continue trying next candidate
      }
    }
    return [];
  }

  async function load() {
    errEl.hidden = true;
    loaderEl.classList.add('show');
    items = await fetchFirst(['./paintings.json', './data/paintings.json', './assets/paintings.json', 'paintings.json']);
    if (!items.length) {
      errEl.hidden = false;
      errEl.textContent = 'Не удалось загрузить список картин. Проверьте, что paintings.json находится в корне репозитория (или в /data, /assets) и доступен по HTTPS.';
      loaderEl.classList.remove('show');
      // Disable gameplay to avoid undefined accesses
      btnTretyakov.disabled = true;
      btnRusmuseum.disabled = true;
      return;
    }
    // Normalize and shuffle
    items = shuffle(items.map(normalizeItem));
    index = 0;
    correct = 0;
    streak = 0;
    render();
  }

  function render() {
    loaderEl.classList.remove('show');
    if (index >= items.length) {
      titleEl.textContent = 'Игра завершена!';
      artistEl.textContent = `Правильных ответов: ${correct} из ${items.length}`;
      yearEl.textContent = 'Нажмите «Начать заново», чтобы сыграть ещё раз.';
      imgEl.removeAttribute('src');
      imgEl.alt = 'Конец игры';
      progressEl.textContent = `${items.length} / ${items.length}`;
      streakEl.textContent = `серия: ${streak}`;
      btnTretyakov.disabled = true;
      btnRusmuseum.disabled = true;
      return;
    }

    const p = items[index];
    // If some fields are empty, hide their rows gracefully
    imgEl.src = p.image_url || '';
    imgEl.alt = p.title || 'Картина';
    imgEl.onerror = () => { imgEl.removeAttribute('src'); }; // hide broken image icon

    titleEl.textContent = p.title || 'Без названия';
    artistEl.textContent = p.artist ? `${p.artist}` : '—';
    yearEl.textContent = p.year ? `Год: ${p.year}` : '';

    progressEl.textContent = `${index + 1} / ${items.length}`;
    streakEl.textContent = `серия: ${streak}`;
    btnTretyakov.disabled = false;
    btnRusmuseum.disabled = false;
    cardEl.classList.remove('correct', 'wrong');
  }

  function haptic(type) {
    try {
      if (tg?.HapticFeedback) {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred('light');
      }
    } catch (_) {}
  }

  function showPopupSafe(title, message) {
    try {
      if (tg?.showPopup) {
        tg.showPopup({ title, message, buttons: [{ type: 'close' }] });
        return;
      }
      // Fallback in browsers
      // eslint-disable-next-line no-alert
      alert(`${title}\n\n${message}`);
    } catch (_) {}
  }

  function onAnswer(choice) {
    if (index >= items.length) return;

    const p = items[index];
    const isTretyakov = /Третьяков/i.test(p.museum);
    const ok = (choice === 'tretyakov' && isTretyakov) || (choice === 'rusmuseum' && !isTretyakov);

    if (ok) {
      correct += 1;
      streak += 1;
      cardEl.classList.add('correct');
      haptic('success');
      showPopupSafe('Верно ✅', `${p.title}${p.museum ? ' — ' + p.museum : ''}`);
    } else {
      streak = 0;
      cardEl.classList.add('wrong');
      haptic('error');
      showPopupSafe('Неверно ❌', `${p.title}${p.museum ? ' — ' + p.museum : ''}`);
    }

    btnTretyakov.disabled = true;
    btnRusmuseum.disabled = true;

    setTimeout(() => {
      cardEl.classList.remove('correct', 'wrong');
      index += 1;
      render();
    }, 450);
  }

  btnTretyakov.addEventListener('click', () => onAnswer('tretyakov'));
  btnRusmuseum.addEventListener('click', () => onAnswer('rusmuseum'));
  btnRestart.addEventListener('click', () => load());

  // Kick off
  load();
})();
