// Lógica de merge compartilhada entre desktop (Node + navegador) e celular.
// Regra: para cada nota, vence a versão com updatedAt mais recente.
// Campos locais do aparelho (pinned, bounds) nunca são sobrescritos pelo remoto.
(function (api) {
  const SHARED = ['id', 'title', 'text', 'color', 'audios', 'deleted', 'createdAt', 'updatedAt'];

  function shareable(notes) {
    return notes.map((n) => {
      const out = {};
      for (const k of SHARED) out[k] = n[k];
      return out;
    });
  }

  function cleanAudios(list) {
    if (!Array.isArray(list)) return [];
    return list
      .filter((a) => a && typeof a.id === 'string' && typeof a.data === 'string' && a.data.startsWith('data:audio'))
      .map((a) => ({ id: a.id, data: a.data, duration: Number(a.duration) || 0, createdAt: Number(a.createdAt) || 0 }));
  }

  function mergeNotes(local, remote) {
    const map = new Map(local.map((n) => [n.id, n]));
    let changed = false;
    for (const r of remote || []) {
      if (!r || typeof r.id !== 'string') continue;
      const l = map.get(r.id);
      if (!l || (r.updatedAt || 0) > (l.updatedAt || 0)) {
        map.set(r.id, {
          ...(l || { pinned: false }),
          id: r.id,
          title: String(r.title || ''),
          text: String(r.text || ''),
          color: typeof r.color === 'string' ? r.color : 'yellow',
          audios: cleanAudios(r.audios),
          deleted: !!r.deleted,
          createdAt: r.createdAt || r.updatedAt || Date.now(),
          updatedAt: r.updatedAt || Date.now(),
        });
        changed = true;
      }
    }
    return { merged: [...map.values()], changed };
  }

  // Envia só as notas que mudaram desde o último envio (áudios podem ser pesados).
  function makeChangeTracker() {
    const sent = new Map();
    return (notes) => {
      const out = notes.filter((n) => sent.get(n.id) !== n.updatedAt);
      for (const n of out) sent.set(n.id, n.updatedAt);
      return shareable(out);
    };
  }

  api.shareable = shareable;
  api.mergeNotes = mergeNotes;
  api.cleanAudios = cleanAudios;
  api.makeChangeTracker = makeChangeTracker;
})(typeof module !== 'undefined' && module.exports ? module.exports : (window.PostitSync = {}));
