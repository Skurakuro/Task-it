// Conexão P2P (WebRTC via PeerJS). O servidor público do PeerJS só serve para
// os dois aparelhos se "acharem" (sinalização); as notas vão direto de um para
// o outro, criptografadas (DTLS). Não depende de Bluetooth nem da mesma rede.
(function () {
  function startSync({ code, host, getNotes, applyRemote, onStatus }) {
    const conns = new Set();
    let peer = null;
    let destroyed = false;
    let retryTimer = null;
    const status = (s) => onStatus && onStatus({ peers: conns.size, ...s });

    function schedule(fn, ms) {
      clearTimeout(retryTimer);
      retryTimer = setTimeout(fn, ms);
    }

    function wire(conn) {
      let dropped = false;
      conn.on('open', () => {
        conns.add(conn);
        status({ state: 'connected' });
        conn.send({ type: 'sync', notes: getNotes() });
      });
      conn.on('data', async (msg) => {
        if (msg && msg.type === 'sync' && Array.isArray(msg.notes)) await applyRemote(msg.notes);
      });
      const drop = () => {
        if (dropped) return;
        dropped = true;
        conns.delete(conn);
        status({ state: conns.size ? 'connected' : host ? 'waiting' : 'offline' });
        if (!host && !destroyed) schedule(connect, 3000);
      };
      conn.on('close', drop);
      conn.on('error', drop);
    }

    function connect() {
      if (destroyed || !peer || peer.destroyed || conns.size) return;
      if (peer.disconnected) return peer.reconnect();
      status({ state: 'connecting' });
      wire(peer.connect(code, { reliable: true }));
    }

    function init() {
      if (destroyed) return;
      peer = host ? new Peer(code, { debug: 0 }) : new Peer({ debug: 0 });
      peer.on('open', () => {
        if (host) status({ state: conns.size ? 'connected' : 'waiting' });
        else connect();
      });
      if (host) peer.on('connection', wire);
      peer.on('disconnected', () => {
        if (!destroyed) setTimeout(() => peer && !peer.destroyed && peer.reconnect(), 3000);
      });
      peer.on('error', (err) => {
        if (err.type === 'peer-unavailable') {
          status({ state: 'offline' }); // o outro aparelho está desligado
          schedule(connect, 5000);
        } else if (err.type === 'unavailable-id') {
          status({ state: 'error', error: 'código em uso, tentando de novo…' });
          peer.destroy();
          setTimeout(init, 5000);
        } else {
          status({ state: 'error', error: err.type });
        }
      });
    }

    init();

    return {
      push(notes) {
        for (const c of conns) if (c.open) c.send({ type: 'sync', notes });
      },
      destroy() {
        destroyed = true;
        clearTimeout(retryTimer);
        if (peer) peer.destroy();
      },
    };
  }

  window.PostitNet = { startSync };
})();
