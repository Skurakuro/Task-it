// Cores das notas: predefinidas (claras e escuras) ou um código livre (#RRGGBB / rgb).
(function (api) {
  const PRESETS = {
    yellow: { name: 'Amarelo', bg: '#fff7b1', bar: '#f4e27a', accent: '#f4d34b' },
    green: { name: 'Verde', bg: '#e4f9e0', bar: '#b9e7a9', accent: '#6cc04a' },
    pink: { name: 'Rosa', bg: '#ffe4f1', bar: '#f6bcd8', accent: '#f28cb1' },
    purple: { name: 'Roxo', bg: '#f2e6ff', bar: '#d6bdf5', accent: '#b48cf2' },
    blue: { name: 'Azul', bg: '#e2f1ff', bar: '#b5d8f6', accent: '#5fb3f2' },
    gray: { name: 'Cinza', bg: '#f3f2f1', bar: '#d6d4d1', accent: '#9a9a9a' },
    'dark-yellow': { name: 'Amarelo escuro', bg: '#4a3f10', bar: '#3a310a', accent: '#d4b12a' },
    'dark-green': { name: 'Verde escuro', bg: '#1d4424', bar: '#15341b', accent: '#4caf50' },
    'dark-pink': { name: 'Rosa escuro', bg: '#561d38', bar: '#44152b', accent: '#e05a94' },
    'dark-purple': { name: 'Roxo escuro', bg: '#36235a', bar: '#2a1a48', accent: '#9a6be0' },
    'dark-blue': { name: 'Azul escuro', bg: '#163a59', bar: '#0f2d46', accent: '#4a9be0' },
    'dark-gray': { name: 'Cinza escuro', bg: '#333333', bar: '#262626', accent: '#8a8a8a' },
  };
  const LIGHT = ['yellow', 'green', 'pink', 'purple', 'blue', 'gray'];
  const DARK = LIGHT.map((c) => 'dark-' + c);

  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  const toHex = (r, g, b) => '#' + [r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('');

  // Aceita: #abc, abc, #aabbcc, aabbcc, rgb(1,2,3), 1,2,3, "1 2 3"
  function parseColor(input) {
    const s = String(input || '').trim().toLowerCase();
    let m = s.match(/^#?([0-9a-f]{6})$/);
    if (m) return '#' + m[1];
    m = s.match(/^#?([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m) return '#' + m[1] + m[1] + m[2] + m[2] + m[3] + m[3];
    m = s.match(/^(?:rgb\s*\()?\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*\)?$/);
    if (m && [m[1], m[2], m[3]].every((v) => +v <= 255)) return toHex(+m[1], +m[2], +m[3]);
    return null;
  }

  function rgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function luminance(hex) {
    const [r, g, b] = rgb(hex).map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  function shade(hex, amt) {
    const [r, g, b] = rgb(hex);
    const f = (v) => (amt < 0 ? v * (1 + amt) : v + (255 - v) * amt);
    return toHex(f(r), f(g), f(b));
  }

  const isValid = (c) => !!PRESETS[c] || !!parseColor(c);

  function resolve(c) {
    let base = PRESETS[c];
    if (!base) {
      const hex = parseColor(c);
      if (!hex) base = PRESETS.yellow;
      else {
        const dark = luminance(hex) < 0.18;
        base = { name: hex, bg: hex, bar: shade(hex, dark ? 0.12 : -0.14), accent: dark ? shade(hex, 0.45) : hex };
      }
    }
    const darkBg = luminance(base.bg) < 0.18;
    return { ...base, dark: darkBg, text: darkBg ? '#f2f2f2' : '#222222', muted: darkBg ? 'rgba(255,255,255,.55)' : 'rgba(0,0,0,.45)' };
  }

  function mix(a, b, t) {
    const x = rgb(a);
    const y = rgb(b);
    return toHex(x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t);
  }

  // Tema da janela da lista: 3 cores editáveis por modo.
  const THEMES = {
    dark: { bg: '#202020', card: '#2b2b2b', text: '#e8e8e8' },
    light: { bg: '#f3f3f3', card: '#ffffff', text: '#1f1f1f' },
  };
  const THEME_PRESETS = {
    dark: [
      { name: 'Padrão', bg: '#202020', card: '#2b2b2b', text: '#e8e8e8' },
      { name: 'Azul noite', bg: '#0b1424', card: '#15233b', text: '#dbe6f7' },
      { name: 'Preto', bg: '#000000', card: '#121212', text: '#eeeeee' },
      { name: 'Roxo noite', bg: '#160f24', card: '#231936', text: '#e9defa' },
      { name: 'Verde floresta', bg: '#0e1a12', card: '#18291d', text: '#dcefe0' },
    ],
    light: [
      { name: 'Padrão', bg: '#f3f3f3', card: '#ffffff', text: '#1f1f1f' },
      { name: 'Creme', bg: '#f4eee0', card: '#fffaf0', text: '#2b2118' },
      { name: 'Azul claro', bg: '#e6eefa', card: '#ffffff', text: '#1a2b45' },
      { name: 'Rosa claro', bg: '#f8e9ef', card: '#fff7fa', text: '#3a1f2a' },
    ],
  };

  // Cada cor predefinida tem um par de dia (claro) e de noite (escuro).
  // A nota mostra o par do modo do app, a não ser que tenha exceção própria (shade).
  const shadeOf = (c) => (PRESETS[c] ? (c.startsWith('dark-') ? 'dark' : 'light') : null);
  function effective(c, shade) {
    if (!PRESETS[c]) return c; // cor personalizada (#RRGGBB) não muda
    const fam = c.replace(/^dark-/, '');
    return shade === 'dark' ? 'dark-' + fam : fam;
  }

  Object.assign(api, { shadeOf, effective, PRESETS, LIGHT, DARK, THEMES, THEME_PRESETS, parseColor, resolve, isValid, mix, shade, luminance });
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.PostitColors = {}));
