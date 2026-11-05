const $ = (s) => document.querySelector(s);
const C = PostitColors;
const STATUS_TEXT = {
  starting: 'iniciando…',
  waiting: 'online, aguardando o celular',
  connected: 'celular conectado ✔',
  offline: 'offline',
  error: 'erro',
};
const PIN_SVG = '<svg viewBox="0 0 24 24"><path d="M15 3l6 6-2 1-3.5 3.5L16 18l-2 2-4-4-5 5H4v-1l5-5-4-4 2-2 4.5.5L15 6z"/></svg>';
const PIN_NEXT = { false: 'top', top: 'place', place: false };
const PIN_TITLE = {
  false: 'Fixar na tela (clique para escolher o modo)',
  top: 'Fixado VERMELHO: sempre por cima. Clique → azul',
  place: 'Fixado AZUL: preso no lugar, some com Alt+Tab. Clique → desafixar',
};

let notes = [];
let query = '';
const filter = { color: null, theme: null }; // theme: null = todas, '' = sem título
const selected = new Set();

const fmtDate = (t) => new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
const themeKey = (n) => (n.title || '').trim().toLowerCase();
const live = () => notes.filter((n) => !n.deleted);
// Cor que a nota mostra agora: par de dia/noite conforme o modo (ou a exceção da nota).
const effColor = (n) => C.effective(n.color, n.shade || settings.theme);

function visible() {
  return live()
    .filter((n) => !query || (n.title + '\n' + n.text).toLowerCase().includes(query))
    .filter((n) => filter.color === null || effColor(n) === filter.color)
    .filter((n) => filter.theme === null || themeKey(n) === filter.theme)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render() {
  const list = $('#list');
  const vis = visible();
  for (const id of [...selected]) if (!live().some((n) => n.id === id)) selected.delete(id);
  list.replaceChildren();
  if (!vis.length) {
    const filtered = query || filter.color !== null || filter.theme !== null;
    list.append(el('p', 'empty', filtered ? 'Nada encontrado.' : 'Nenhuma nota ainda. Clique em ＋ para criar.'));
  }
  for (const n of vis) {
    const c = C.resolve(effColor(n));
    const card = el('article', 'card' + (selected.has(n.id) ? ' selected' : ''));
    card.style.setProperty('--c', c.accent);

    const top = el('div', 'card-top');
    const pin = el('button', 'pin ' + (n.pinned ? 'pin-' + n.pinned : ''));
    pin.innerHTML = PIN_SVG;
    pin.title = PIN_TITLE[n.pinned || false];
    pin.onclick = (e) => {
      e.stopPropagation();
      api.pin(n.id, PIN_NEXT[n.pinned || false]);
    };
    top.append(pin);
    if (n.audios && n.audios.length) top.append(el('span', 'badge', '🎙 ' + n.audios.length));
    top.append(el('span', 'grow'), el('span', 'date', fmtDate(n.updatedAt)));

    card.append(top);
    if (n.title) card.append(el('div', 'card-title', n.title));
    const body = el('div', 'card-body', n.text || (n.title ? '' : 'Nota vazia'));
    if (!n.text && !n.title) body.classList.add('muted');
    if (n.text || !n.title) card.append(body);

    card.onclick = (e) => {
      if (e.ctrlKey || e.metaKey || selected.size) toggleSelect(n.id);
      else api.open(n.id);
    };
    list.append(card);
  }
  renderSelBar();
  renderFilter();
}

// ---------- seleção múltipla ----------
function toggleSelect(id) {
  selected.has(id) ? selected.delete(id) : selected.add(id);
  render();
}
function renderSelBar() {
  $('#selBar').hidden = selected.size === 0;
  $('#selCount').textContent = selected.size === 1 ? '1 selecionada' : `${selected.size} selecionadas`;
  const vis = visible();
  const all = vis.length > 0 && vis.every((n) => selected.has(n.id));
  $('#selAll').textContent = all ? 'Desmarcar todas' : 'Selecionar todas';
}
$('#selAll').onclick = () => {
  const vis = visible();
  const all = vis.every((n) => selected.has(n.id));
  for (const n of vis) all ? selected.delete(n.id) : selected.add(n.id);
  render();
};
$('#selClear').onclick = () => {
  selected.clear();
  render();
};
function deleteSelected() {
  if (!selected.size) return;
  const msg = selected.size === 1 ? 'Excluir a nota selecionada?' : `Excluir ${selected.size} notas?`;
  if (!confirm(msg)) return;
  api.remove([...selected]);
  selected.clear();
}
$('#selDel').onclick = deleteSelected;

// ---------- filtro ----------
function chip(label, active, onclick, swatch) {
  const b = el('button', 'chip' + (active ? ' active' : ''));
  if (swatch) {
    const s = el('span', 'sw');
    s.style.background = swatch;
    b.append(s);
  }
  if (label) b.append(document.createTextNode(label));
  b.onclick = onclick;
  return b;
}
function renderFilter() {
  const active = filter.color !== null || filter.theme !== null;
  $('#filterDot').hidden = !active;
  $('#filterBtn').classList.toggle('on', active);
  if ($('#filterPanel').hidden) return;

  const colors = [...new Set(live().map(effColor))];
  const fc = $('#fpColors');
  fc.replaceChildren(chip('Todas', filter.color === null, () => setFilter('color', null)));
  for (const col of colors) {
    const r = C.resolve(col);
    const b = chip('', filter.color === col, () => setFilter('color', col), r.bg);
    b.title = r.name;
    fc.append(b);
  }

  const themes = new Map();
  for (const n of live()) {
    const k = themeKey(n);
    if (!themes.has(k)) themes.set(k, { label: (n.title || '').trim(), count: 0 });
    themes.get(k).count++;
  }
  const ft = $('#fpThemes');
  ft.replaceChildren(chip('Todas', filter.theme === null, () => setFilter('theme', null)));
  for (const [k, t] of [...themes].sort((a, b) => a[1].label.localeCompare(b[1].label))) {
    ft.append(chip(`${k ? t.label : 'Sem título'} (${t.count})`, filter.theme === k, () => setFilter('theme', k)));
  }
}
function setFilter(k, v) {
  filter[k] = v;
  render();
}
$('#filterBtn').onclick = () => {
  $('#filterPanel').hidden = !$('#filterPanel').hidden;
  renderFilter();
};
$('#fpClear').onclick = () => {
  filter.color = null;
  filter.theme = null;
  render();
};

// ---------- tema (claro/escuro + Fundo / Cartões / Texto) ----------
const MOON = '<svg viewBox="0 0 24 24"><path d="M20.5 14.6A8.6 8.6 0 0 1 9.4 3.5a8.6 8.6 0 1 0 11.1 11.1z"/></svg>';
const SUN = '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4.5"/><path d="M11 1h2v3h-2zm0 19h2v3h-2zM1 11h3v2H1zm19 0h3v2h-3zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4zM4.2 18.4l2.1-2.1 1.4 1.4-2.1 2.1zM16.3 6.3l2.1-2.1 1.4 1.4-2.1 2.1z"/></svg>';
let settings = { theme: 'dark', palettes: {} };
const palette = () => ({ ...C.THEMES[settings.theme], ...((settings.palettes || {})[settings.theme] || {}) });

function applyTheme() {
  const p = palette();
  const r = document.body.style;
  r.setProperty('--app-bg', p.bg);
  r.setProperty('--card', p.card);
  r.setProperty('--fg', p.text);
  r.setProperty('--card-hover', C.mix(p.card, p.text, 0.07));
  r.setProperty('--input', C.mix(p.bg, p.text, 0.08));
  r.setProperty('--input-hover', C.mix(p.bg, p.text, 0.15));
  r.setProperty('--muted', C.mix(p.text, p.bg, 0.45));
  r.setProperty('--line', C.mix(p.bg, p.text, 0.2));
  r.setProperty('--sel', C.mix(p.card, '#6cc04a', 0.2));
  api.setWindowBg(p.bg);

  const dark = settings.theme === 'dark';
  $('#themeBtn').innerHTML = dark ? MOON : SUN;
  $('#themeBtn').title = dark ? 'Modo noturno (clique para o modo claro)' : 'Modo claro (clique para o modo noturno)';
  $('#themeHead').textContent = dark ? 'Cores do modo noturno' : 'Cores do modo claro';
  for (const i of document.querySelectorAll('#themePanel [data-k]')) {
    if (document.activeElement !== i) i.value = p[i.dataset.k];
    i.classList.remove('bad');
  }
  const box = $('#themePresets');
  box.replaceChildren();
  for (const t of C.THEME_PRESETS[settings.theme]) {
    const active = t.bg === p.bg && t.card === p.card && t.text === p.text;
    box.append(chip(t.name, active, () => savePalette({ bg: t.bg, card: t.card, text: t.text }), t.bg));
  }
  const more = chip('⋯', !$('#themeCustom').hidden, () => {
    $('#themeCustom').hidden = !$('#themeCustom').hidden;
    applyTheme();
  });
  more.title = 'Cores personalizadas (código RGB)';
  box.append(more);
}

function savePalette(changes) {
  const cur = { ...palette(), ...changes };
  settings.palettes = { ...(settings.palettes || {}), [settings.theme]: cur };
  applyTheme();
  api.setSettings({ palettes: { [settings.theme]: cur } });
}

for (const i of document.querySelectorAll('#themePanel .tcode')) {
  i.oninput = () => {
    const hex = C.parseColor(i.value);
    i.classList.toggle('bad', !!i.value && !hex);
    if (hex) savePalette({ [i.dataset.k]: hex });
  };
}
for (const i of document.querySelectorAll('#themePanel .tpick')) i.oninput = () => savePalette({ [i.dataset.k]: i.value });
$('#themeBtn').onclick = () => {
  settings.theme = settings.theme === 'dark' ? 'light' : 'dark';
  applyTheme();
  render();
  api.setSettings({ theme: settings.theme });
};
$('#themeMore').onclick = () => ($('#themePanel').hidden = !$('#themePanel').hidden);
$('#themeReset').onclick = () => {
  delete settings.palettes[settings.theme];
  applyTheme();
  api.setSettings({ palettes: { [settings.theme]: null } });
};
api.onSettings((s) => {
  settings = s;
  applyTheme();
  render();
});

// ---------- copiar link / código ----------
for (const b of document.querySelectorAll('[data-copy]')) {
  b.onclick = () => {
    api.copy($('#' + b.dataset.copy).textContent);
    const old = b.textContent;
    b.textContent = 'Copiado ✔';
    b.classList.add('active');
    setTimeout(() => {
      b.textContent = old;
      b.classList.remove('active');
    }, 1400);
  };
}

// ---------- resto ----------
function showStatus(s) {
  const st = s.state;
  $('#dot').className = 'dot ' + st;
  $('#status').textContent = (STATUS_TEXT[st] || st) + (s.error ? ` (${s.error})` : '');
}

$('#new').onclick = () => api.create();
$('#close').onclick = () => api.close();
$('#min').onclick = () => api.minimize();
$('#q').oninput = (e) => {
  query = e.target.value.toLowerCase();
  render();
};
$('#syncBtn').onclick = () => ($('#syncPanel').hidden = !$('#syncPanel').hidden);
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.key.toLowerCase() === 'n') api.create();
  if (e.key === 'Escape' && selected.size) {
    selected.clear();
    render();
  }
  if (e.key === 'Delete' && selected.size && document.activeElement !== $('#q')) deleteSelected();
  if (e.ctrlKey && e.key.toLowerCase() === 'a' && selected.size) {
    e.preventDefault();
    $('#selAll').click();
  }
});

(async () => {
  settings = await api.getSettings();
  applyTheme();
  notes = await api.list();
  render();

  const info = await api.syncInfo();
  $('#qr').src = info.qr;
  $('#url').textContent = info.url;
  $('#code').textContent = info.code;

  const changesOf = PostitSync.makeChangeTracker();
  changesOf(notes); // o que já existe vai no envio inicial de cada conexão

  // O computador é o "anfitrião": fica escutando no código de pareamento.
  const sync = PostitNet.startSync({
    code: info.code,
    host: true,
    getNotes: () => PostitSync.shareable(notes),
    applyRemote: (remote) => api.merge(remote),
    onStatus: (s) => {
      api.setSyncStatus(s);
      showStatus(s);
    },
  });

  let pushTimer;
  api.onChanged((n) => {
    notes = n;
    render();
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      const diff = changesOf(notes);
      if (diff.length) sync.push(diff);
    }, 300);
  });
})();
