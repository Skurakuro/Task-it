// Copia a versão do celular (a mesma que o PC serve no Wi-Fi) para www/,
// que é o que o Capacitor empacota dentro do app Android/iPhone.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const www = path.join(__dirname, 'www');
const files = {
  'index.html': 'mobile/index.html',
  'manifest.json': 'mobile/manifest.json',
  'sw.js': 'mobile/sw.js',
  'apple-touch-icon.png': 'mobile/apple-touch-icon.png',
  'icon-192.png': 'mobile/icon-192.png',
  'icon-512.png': 'mobile/icon-512.png',
  'colors.js': 'shared/colors.js',
  'sync-core.js': 'shared/sync-core.js',
  'sync-net.js': 'shared/sync-net.js',
  'peerjs.min.js': 'node_modules/peerjs/dist/peerjs.min.js',
};

fs.mkdirSync(www, { recursive: true });
for (const [dest, src] of Object.entries(files)) {
  fs.copyFileSync(path.join(root, src), path.join(www, dest));
  console.log('copiado', src, '->', 'www/' + dest);
}
