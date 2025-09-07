(function () {
  'use strict';

  // 👇 ЗАМЕНИТЕ на имя вашего бота (без @)
  const BOT_USERNAME = "WhatMuseumBot";

  const tg = window.Telegram?.WebApp;
  try { tg?.ready?.(); tg?.expand?.(); } catch (_) {}

  // --- Universal link opener (no checks) ---
  let currentSourceUrl = '';
  function openLinkUniversal(rawUrl) {
    const url = String(rawUrl || '').trim();
    if (!url) return;
    try {
      if (window?.Telegram?.WebApp?.openLink) {
        window.Telegram.WebApp.openLink(url, { try_instant_view: true });
        return;
      }
    } catch (_) {}
    try {
      const a = document.createElement('a');
      a.href = url;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (_) {
      try { window.open(url, '_blank', 'noopener'); } catch {}
    }
  }

  // Elements
  const imgEl = document.getElementById('painting-img');
  const titleEl = document.getElementById('title');
  const artistEl = document.getElementById('artist');
  const yearEl = document.getElementById('year');
  const progressEl = document.getElementById('progress');
  const streakEl = document.getElementById('streak');
  const cardEl = document.getElementById('card');
  const actionsEl = document.getElementById('actions');
  const btnTretyakov = document.getElementById('btn-tretyakov');
  const btnRusmuseum = document.getElementById('btn-rusmuseum');
  const btnRestart = document.getElementById('btn-restart');
  const errEl = document.getElementById('error');
  const loaderEl = document.getElementById('loader');

  const resultsEl = document.getElementById('results');
  const resCorrect = document.getElementById('res-correct');
  const resTotal = document.getElementById('res-total');
  const resAcc = document.getElementById('res-acc');
  const resBest = document.getElementById('res-best');
  const resTitle = document.getElementById('res-title');
  const resSub = document.getElementById('res-sub');
  const btnShare = document.getElementById('btn-share');

  // Game state
  let items = [];
  let index = 0;
  let correct = 0;
  let streak = 0;
  let bestStreak = 0;

  function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
  }

  function normalizeItem(raw) {
    const title = raw.title || raw.name || raw.painting || raw.caption || '';
    const artist = raw.artist || raw.author || raw.painter || raw.creator || '';
    const year = raw.year || raw.date || raw.created || raw.when || '';
    const museum = raw.museum || raw.collection || raw.gallery || '';
    const image = raw.image_url || raw.image || raw.img || raw.url || raw.photo || '';
    return { title, artist, year, museum, image_url: image };
  }

  function looksLikePainting(x) {
    return x && typeof x === 'object' && (
      ('title' in x || 'name' in x || 'painting' in x || 'caption' in x) ||
      ('artist' in x || 'author' in x || 'creator' in x || 'painter' in x) ||
      ('image_url' in x || 'image' in x || 'img' in x || 'url' in x || 'photo' in x)
    );
  }

  function pickItems(json) {
    if (Array.isArray(json)) return json;
    if (json && typeof json === 'object') {
      const keys = ['items', 'paintings', 'data', 'artworks', 'cards'];
      for (const k of keys) {
        if (Array.isArray(json[k]) && json[k].length) return json[k];
      }
      for (const k of Object.keys(json)) {
        const v = json[k];
        if (Array.isArray(v) && v.some(looksLikePainting)) return v;
      }
    }
    return [];
  }

  async function fetchFirst(urls) {
    for (const u of urls) {
      try {
        const res = await fetch(u, { cache: 'no-store' });
        if (!res.ok) continue;
        const json = await res.json();
        const arr = pickItems(json);
        if (arr.length) return arr;
      } catch (_) {}
    }
    return [];
  }

  // Image helpers
  const isDirectImage = (url) => /\.(jpg|jpeg|png|webp|avif)(\?|#|$)/i.test(url || '');
  const isGoogleusercontent = (url) => /(^|\.)(googleusercontent\.com)/i.test(url || '');
  const isWikimediaThumb = (url) => /upload\.wikimedia\.org\/.*\/thumb\//i.test(url || '');
  const isDataImage = (url) => /^data:image\//i.test(url || '');
  const isArtsPage = (url) => /artsandculture\.google\.com\/asset\//i.test(url || '');
  const isRussianMuseumPage = (url) => /rusmuseumvrm\.ru\/data\/collections\/painting\/.+\/index\.php/i.test(url || '');

  function isLikelyImage(url) {
    return isDirectImage(url) || isGoogleusercontent(url) || isWikimediaThumb(url) || isDataImage(url);
  }

  async function resolveImage(url) {
    if (!url) return '';
    if (isLikelyImage(url)) return url;
    if (isArtsPage(url) || isRussianMuseumPage(url)) {
      // читаем HTML страницы через безопасный прокси и достаем og:image
      const prox = 'https://r.jina.ai/http/' + url.replace(/^https?:\/\//, '');
      try {
        const res = await fetch(prox, { cache: 'reload' });
        if (!res.ok) return '';
        const html = await res.text();
        const m = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
        if (m && m[1]) return m[1];
      } catch (_) {}
    }
    // как есть — пусть <img> попробует загрузить
    return url;
  }

  function setViewGame() {
    resultsEl.style.display = 'none';
    resultsEl.hidden = true;
    cardEl.style.display = '';
    actionsEl.style.display = '';
  }

  function setViewResults() {
    cardEl.style.display = 'none';
    actionsEl.style.display = 'none';
    resultsEl.style.display = 'block';
    resultsEl.hidden = false;
  }

  // ---------- NEW: чтение и парсинг start_param ----------
  function getStartParam() {
    // из Telegram при открытии по t.me/<bot>/app?startapp=...
    const p = window.Telegram?.WebApp?.initDataUnsafe?.start_param;
    if (p) return p;
    // для тестов в браузере: ?startapp=2_10 или ?start_param=2_10
    const qs = new URLSearchParams(location.search);
    return qs.get("startapp") || qs.get("start_param") || null;
  }

  function parseSharedResult(p) {
    const m = /^(\d+)_(\d+)$/.exec(p);
    if (!m) return null;
    const c = Math.min(parseInt(m[1], 10), parseInt(m[2], 10));
    const t = parseInt(m[2], 10);
    if (!t) return null;
    return { c, t, acc: Math.round((c / t) * 100) };
  }
  // ------------------------------------------------------

  async function load() {
    errEl.hidden = true;
    setViewGame();

    // ---------- NEW: показать результат из start_param ----------
    const sp = getStartParam();
    const shared = sp && parseSharedResult(sp);
    if (shared) {
      resCorrect.textContent = String(shared.c);
      resTotal.textContent = String(shared.t);
      resAcc.textContent = shared.acc + "%";
      resBest.textContent = "—"; // чужую лучшую серию не знаем
      resTitle.textContent = "Результат друга";
      resSub.textContent = `Он/она угадал(а) ${shared.c} из ${shared.t}`;
      setViewResults();
      return; // важно: не загружаем игру
    }
    // -----------------------------------------------------------

    loaderEl.classList.add('show');
    items = await fetchFirst(['./paintings.json', './data/paintings.json', './assets/paintings.json', 'paintings.json']);
    if (!items.length) {
      errEl.hidden = false;
      errEl.textContent = 'Не удалось загрузить список картин. Проверьте путь и формат paintings.json';
      loaderEl.classList.remove('show');
      btnTretyakov.disabled = true;
      btnRusmuseum.disabled = true;
      return;
    }
    items = shuffle(items.map(normalizeItem));
    index = 0; correct = 0; streak = 0; bestStreak = 0;
    render();
  }

  async function render() {
    loaderEl.classList.remove('show');

    if (index >= items.length) {
      showResults();
      return;
    }

    setViewGame();

    const p = items[index];
    currentSourceUrl = p.image_url || '';
    titleEl.textContent = p.title || 'Без названия';
    artistEl.textContent = p.artist ? `${p.artist}` : '—';
    yearEl.textContent = p.year ? `Год: ${p.year}` : '';

    progressEl.textContent = `${index + 1} / ${items.length}`;
    streakEl.textContent = `серия: ${streak}`;
    btnTretyakov.disabled = false;
    btnRusmuseum.disabled = false;
    cardEl.classList.remove('correct', 'wrong');

    loaderEl.classList.add('show');
    try {
      const src = await resolveImage(p.image_url);
      if (src) {
        imgEl.src = src;
        imgEl.alt = p.title || 'Картина';
        imgEl.onerror = () => { imgEl.removeAttribute('src'); };
      } else {
        imgEl.removeAttribute('src');
      }
    } finally {
      loaderEl.classList.remove('show');
    }
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
      alert(`${title}\n\n${message}`);
    } catch (_) {}
  }

  function onAnswer(choice) {
    if (index >= items.length) return;
    const p = items[index];
    currentSourceUrl = p.image_url || '';
    const isTretyakov = /Третьяков/i.test(p.museum);
    const ok = (choice === 'tretyakov' && isTretyakov) || (choice === 'rusmuseum' && !isTretyakov);

    if (ok) {
      correct += 1;
      streak += 1;
      bestStreak = Math.max(bestStreak, streak);
      cardEl.classList.add('correct'); haptic('success');
      showPopupSafe('Верно ✅', `${p.title}${p.museum ? ' — ' + p.museum : ''}`);
    } else {
      streak = 0;
      cardEl.classList.add('wrong'); haptic('error');
      showPopupSafe('Неверно ❌', `${p.title}${p.museum ? ' — ' + p.museum : ''}`);
    }

    btnTretyakov.disabled = true; btnRusmuseum.disabled = true;
    setTimeout(() => { cardEl.classList.remove('correct', 'wrong'); index += 1; render(); }, 450);
  }

  function percent(n, d) { return d ? Math.round((n/d)*100) + '%' : '0%'; }

  function showResults() {
    resCorrect.textContent = String(correct);
    resTotal.textContent = String(items.length);
    resAcc.textContent = percent(correct, items.length);
    resBest.textContent = String(bestStreak);
    resTitle.textContent = correct === items.length ? 'Идеально! 🎉' : 'Игра завершена!';
    resSub.textContent = `Правильных ответов: ${correct} из ${items.length}`;
    setViewResults();
  }

  // 🔗 Телеграм-шаринг карточки мини-аппа
  async function share() {
    const text = `Я угадал(а) ${correct} из ${items.length} в игре «Третьяковка vs Русский музей». Попробуй и ты!`;

    // payload с результатом (например "7_10")
    const payload = `${correct}_${items.length}`;
    const appLink = `https://t.me/${BOT_USERNAME}/app?startapp=${encodeURIComponent(payload)}`;

    // 1) system share (если доступен)
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Мой результат', text, url: appLink });
        return;
      }
    } catch (_) { /* fallthrough */ }

    // 2) Telegram share-диалог (даёт карточку мини-аппа)
    const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(appLink)}&text=${encodeURIComponent(text)}`;
    try {
      if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
      else window.open(shareUrl, "_blank");
    } catch (_) {
      // 3) запасной вариант — копируем ссылку
      try {
        await navigator.clipboard.writeText(`${text}\n${appLink}`);
        showPopupSafe('Скопировано', 'Ссылка на мини-апп в буфере обмена.');
      } catch {}
    }
  }

  btnTretyakov.addEventListener('click', () => onAnswer('tretyakov'));
  btnRusmuseum.addEventListener('click', () => onAnswer('rusmuseum'));
  btnRestart.addEventListener('click', () => load());
  btnShare.addEventListener('click', () => share());

  // Open source page on title or image click
  if (imgEl) {
    imgEl.style.cursor = 'pointer';
    imgEl.addEventListener('click', (e) => { e.preventDefault(); openLinkUniversal(currentSourceUrl); });
  }
  if (titleEl) {
    titleEl.style.cursor = 'pointer';
    titleEl.addEventListener('click', (e) => { e.preventDefault(); openLinkUniversal(currentSourceUrl); });
  }


  // Start
  load();
})();
