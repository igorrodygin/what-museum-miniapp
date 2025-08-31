
(function () {
  const tg = window.Telegram?.WebApp;
  if (tg) {
    tg.expand();
    tg.ready();
    // Apply theme parameters
    document.documentElement.style.setProperty('--bg', tg.themeParams.bg_color || getComputedStyle(document.documentElement).getPropertyValue('--bg'));
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

  async function load() {
    const res = await fetch('./paintings.json', { cache: 'no-store' });
    items = await res.json();
    shuffle(items);
    index = 0;
    correct = 0;
    streak = 0;
    render();
  }

  function render() {
    if (index >= items.length) {
      // End screen
      titleEl.textContent = 'Игра завершена!';
      artistEl.textContent = `Правильных ответов: ${correct} из ${items.length}`;
      yearEl.textContent = 'Нажмите «Начать заново», чтобы сыграть ещё раз.';
      imgEl.src = '';
      imgEl.alt = 'Конец игры';
      progressEl.textContent = `${items.length} / ${items.length}`;
      streakEl.textContent = `серия: ${streak}`;
      btnTretyakov.disabled = true;
      btnRusmuseum.disabled = true;
      return;
    }

    const p = items[index];
    imgEl.src = p.image_url;
    imgEl.alt = p.title;
    titleEl.textContent = p.title;
    artistEl.textContent = `${p.artist}`;
    yearEl.textContent = p.year ? `Год: ${p.year}` : '';
    progressEl.textContent = `${index + 1} / ${items.length}`;
    streakEl.textContent = `серия: ${streak}`;
    btnTretyakov.disabled = false;
    btnRusmuseum.disabled = false;
    cardEl.classList.remove('correct', 'wrong');
  }

  function vibrate(type) {
    try {
      if (tg?.HapticFeedback) {
        if (type === 'success') tg.HapticFeedback.notificationOccurred('success');
        else if (type === 'error') tg.HapticFeedback.notificationOccurred('error');
        else tg.HapticFeedback.impactOccurred('light');
      }
    } catch {}
  }

  function onAnswer(choice) {
    const p = items[index];
    const isTretyakov = /Третьяков/.test(p.museum);
    const ok = (choice === 'tretyakov' && isTretyakov) || (choice === 'rusmuseum' && !isTretyakov);

    if (ok) {
      correct += 1;
      streak += 1;
      cardEl.classList.add('correct');
      vibrate('success');
      tg?.showPopup?.({ title: 'Верно ✅', message: `${p.title} — ${p.museum}`, buttons: [{type:'close'}] });
    } else {
      streak = 0;
      cardEl.classList.add('wrong');
      vibrate('error');
      tg?.showPopup?.({ title: 'Неверно ❌', message: `${p.title} — ${p.museum}`, buttons: [{type:'close'}] });
    }

    btnTretyakov.disabled = true;
    btnRusmuseum.disabled = true;

    setTimeout(() => {
      index += 1;
      render();
    }, 500);
  }

  btnTretyakov.addEventListener('click', () => onAnswer('tretyakov'));
  btnRusmuseum.addEventListener('click', () => onAnswer('rusmuseum'));
  btnRestart.addEventListener('click', () => load());

  load();
})();
