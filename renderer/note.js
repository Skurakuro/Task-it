const $ = (s) => document.querySelector(s);
const C = PostitColors;
const id = new URLSearchParams(location.search).get('id');
const ta = $('#text');
const titleIn = $('#title');
const MAX_REC_SECONDS = 300;
const PIN_TITLE = {
  false: 'Fixar na tela',
  top: 'Fixado (vermelho): sempre por cima',
  place: 'Fixado (azul): preso no lugar',
};
let note = null;

// ---------- aparência ----------
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z"/></svg>';
const MOON = '<svg viewBox="0 0 24 24"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';
let settings = { theme: 'dark' };
let builtShade = null;
// Dia/noite desta nota: a exceção dela (note.shade) ou o modo do app.
const wantedShade = () => note.shade || settings.theme;
const effColor = () => C.effective(note.color, wantedShade());

function apply() {
  if (!note) return;
  const eff = effColor();
  const c = C.resolve(eff);
  const root = document.documentElement.style;
  root.setProperty('--bg', c.bg);
  root.setProperty('--bar', c.bar);
  root.setProperty('--fg', c.text);
  root.setProperty('--muted', c.muted);
  document.body.classList.toggle('dark', c.dark);
  // Atualiza o texto vindo de outro lugar (ex.: celular) só se não estiver digitando aqui.
  if (document.activeElement !== ta && ta.value !== note.text) ta.value = note.text;
  if (document.activeElement !== titleIn && titleIn.value !== (note.title || '')) titleIn.value = note.title || '';
  const mode = note.pinned || false;
  $('#pin').className = 'icon pin-btn ' + (mode ? 'pin-' + mode : '');
  $('#pin').title = PIN_TITLE[mode];
  document.body.classList.toggle('locked', !!mode);

  // Só mostra as cores do modo atual (escuras de noite, claras de dia).
  const shade = C.shadeOf(eff) || wantedShade();
  if (shade !== builtShade) buildSwatches(shade);
  for (const b of document.querySelectorAll('#sw [data-c]')) b.classList.toggle('active', b.dataset.c === eff);
  const t = $('#dayNight');
  t.hidden = !C.PRESETS[note.color]; // cor personalizada não tem par dia/noite
  t.innerHTML = shade === 'dark' ? SUN : MOON;
  t.title = (shade === 'dark' ? 'Clarear só esta nota (dia)' : 'Escurecer só esta nota (noite)') +
    (note.shade ? ' — esta nota é uma exceção ao modo do app' : '');
  t.classList.toggle('exception', !!note.shade);
  renderAudios();
}

function buildSwatches(shade) {
  builtShade = shade;
  const make = (c) => {
    const b = document.createElement('button');
    b.dataset.c = c;
    b.title = C.PRESETS[c].name;
    b.style.background = C.PRESETS[c].bg;
    b.onclick = () => api.update(id, { color: c });
    return b;
  };
  const custom = document.createElement('button');
  custom.className = 'custom-btn';
  custom.title = 'Cor personalizada (código RGB)';
  custom.textContent = '⋯';
  custom.onclick = () => {
    $('#customRow').hidden = !$('#customRow').hidden;
    if (!$('#customRow').hidden) {
      $('#customInput').value = C.PRESETS[note.color] ? '' : note.color;
      previewCustom();
      $('#customInput').focus();
    }
  };
  const dayNight = document.createElement('button');
  dayNight.id = 'dayNight';
  dayNight.className = 'daynight-btn';
  dayNight.onclick = () => {
    const next = (C.shadeOf(effColor()) || wantedShade()) === 'dark' ? 'light' : 'dark';
    api.shade(id, next === settings.theme ? null : next);
  };
  $('#sw').replaceChildren(...(shade === 'dark' ? C.DARK : C.LIGHT).map(make), custom, dayNight);
}

function previewCustom() {
  const hex = C.parseColor($('#customInput').value);
  $('#customPreview').style.background = hex || 'transparent';
  $('#customInput').classList.toggle('bad', !!$('#customInput').value && !hex);
}
function applyCustom() {
  const hex = C.parseColor($('#customInput').value);
  if (!hex) return previewCustom();
  api.update(id, { color: hex });
  $('#customRow').hidden = true;
}
$('#customInput').oninput = previewCustom;
$('#customInput').onkeydown = (e) => e.key === 'Enter' && applyCustom();
$('#customApply').onclick = applyCustom;

// ---------- texto e título ----------
function debounced(field, input) {
  let t = null;
  const flush = () => {
    if (!t) return;
    clearTimeout(t);
    t = null;
    api.update(id, { [field]: input.value });
  };
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = setTimeout(flush, 250);
  });
  input.addEventListener('blur', flush);
  window.addEventListener('beforeunload', flush);
  return flush;
}
const flushText = debounced('text', ta);
const flushTitle = debounced('title', titleIn);
titleIn.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    ta.focus();
  }
});

// ---------- áudio ----------
let rec = null;
let recStart = 0;
let recTick = null;
let player = null;
let playingId = null;
let renderedKey = '';

const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

function blobToDataURL(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

async function toggleRec() {
  if (rec) return rec.stop();
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  } catch {
    alert('Não consegui acessar o microfone. Verifique se há um microfone conectado e permitido no Windows.');
    return;
  }
  const chunks = [];
  rec = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus', audioBitsPerSecond: 32000 });
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  rec.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    clearInterval(recTick);
    const duration = Math.round((Date.now() - recStart) / 1000);
    rec = null;
    updateRecUI();
    if (duration < 1) return;
    const data = await blobToDataURL(new Blob(chunks, { type: 'audio/webm' }));
    const audios = [...(note.audios || []), { id: crypto.randomUUID(), data, duration, createdAt: Date.now() }];
    api.update(id, { audios });
  };
  recStart = Date.now();
  rec.start();
  recTick = setInterval(() => {
    updateRecUI();
    if ((Date.now() - recStart) / 1000 >= MAX_REC_SECONDS && rec) rec.stop();
  }, 500);
  updateRecUI();
}

function updateRecUI() {
  const on = !!rec;
  $('#rec').classList.toggle('recording', on);
  $('#recLabel').textContent = on ? `Parar ${fmtDur((Date.now() - recStart) / 1000)}` : 'Gravar áudio';
  renderedKey = ''; // força redesenhar o indicador
  renderAudios();
}

function togglePlay(a) {
  if (player && playingId === a.id) {
    player.pause();
    player = null;
    playingId = null;
  } else {
    if (player) player.pause();
    player = new Audio(a.data);
    playingId = a.id;
    player.onended = () => {
      player = null;
      playingId = null;
      renderedKey = '';
      renderAudios();
    };
    player.play();
  }
  renderedKey = '';
  renderAudios();
}

function renderAudios() {
  const list = (note && note.audios) || [];
  const key = list.map((a) => a.id).join() + '|' + playingId + '|' + !!rec + '|' + (rec ? Math.floor((Date.now() - recStart) / 1000) : '');
  if (key === renderedKey) return;
  renderedKey = key;
  const box = $('#audios');
  box.replaceChildren();
  if (rec) {
    const r = document.createElement('button');
    r.className = 'audio-chip rec-live';
    r.textContent = `● Gravando ${fmtDur((Date.now() - recStart) / 1000)} — clique para parar`;
    r.onclick = toggleRec;
    box.append(r);
  }
  list.forEach((a, i) => {
    const chip = document.createElement('span');
    chip.className = 'audio-chip' + (playingId === a.id ? ' playing' : '');
    const play = document.createElement('button');
    play.textContent = (playingId === a.id ? '❚❚ ' : '▶ ') + `Áudio ${i + 1} · ${fmtDur(a.duration)}`;
    play.onclick = () => togglePlay(a);
    const del = document.createElement('button');
    del.className = 'x';
    del.title = 'Apagar este áudio';
    del.textContent = '×';
    del.onclick = () => {
      if (!confirm('Apagar este áudio?')) return;
      if (playingId === a.id) togglePlay(a);
      api.update(id, { audios: note.audios.filter((x) => x.id !== a.id) });
    };
    chip.append(play, del);
    box.append(chip);
  });
  box.hidden = !box.children.length;
}
$('#rec').onclick = toggleRec;

// ---------- barra / menus ----------
function closePops(except) {
  for (const p of ['#menu', '#pinMenu']) if (p !== except) $(p).hidden = true;
}
$('#close').onclick = () => {
  flushText();
  flushTitle();
  api.close();
};
$('#listBtn').onclick = () => api.showMain();
$('#new').onclick = () => api.create();
$('#pin').onclick = () => {
  closePops('#pinMenu');
  $('#pinMenu').hidden = !$('#pinMenu').hidden;
  const cur = (note && note.pinned) || 'off';
  for (const b of document.querySelectorAll('#pinMenu [data-pin]')) b.classList.toggle('current', b.dataset.pin === cur);
};
for (const b of document.querySelectorAll('#pinMenu [data-pin]')) {
  b.onclick = () => {
    const cur = (note && note.pinned) || 'off';
    // Clicar no modo que já está ligado = desmarcar (desafixar), nunca fechar a nota.
    const next = b.dataset.pin === 'off' || b.dataset.pin === cur ? false : b.dataset.pin;
    api.pin(id, next);
    $('#pinMenu').hidden = true;
  };
}
$('#more').onclick = () => {
  closePops('#menu');
  $('#menu').hidden = !$('#menu').hidden;
};
$('#del').onclick = () => {
  if (confirm('Excluir esta nota?')) api.remove(id);
};
ta.addEventListener('focus', () => closePops());
titleIn.addEventListener('focus', () => closePops());

api.onChanged((all) => {
  note = all.find((n) => n.id === id);
  if (!note || note.deleted) return api.close();
  apply();
});

api.onSettings((s) => {
  settings = s;
  apply();
});

(async () => {
  settings = await api.getSettings();
  note = (await api.list()).find((n) => n.id === id);
  if (!note) return api.close();
  ta.value = note.text;
  titleIn.value = note.title || '';
  apply();
  (note.title || note.text ? ta : titleIn).focus();
})();
