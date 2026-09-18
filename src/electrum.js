'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.verifyChain =
  exports.blockHash =
  exports.CHECKPOINTS =
  exports.ElectrumClient =
  exports.KEEPALIVE_INTERVAL =
  exports.REQUEST_TIMEOUT =
    void 0;
/**
 * Talking to an ElectrumX server, the way a Doichain wallet or web page does:
 * a WebSocket carrying JSON-RPC, and a check that the server really follows
 * the Doichain chain.
 *
 * A server answers with whatever chain its node follows and sends no proof for
 * it. {@link verifyChain} asks for a block only the valid chain has, so a
 * server on the old chain is caught before anything it says is believed.
 *
 * @packageDocumentation
 */
const crypto_1 = require('./crypto');
/** How long a request may stay unanswered before it fails, in milliseconds. */
exports.REQUEST_TIMEOUT = 30000;
/** ElectrumX drops a silent client after about ten minutes; a ping keeps the connection open. */
exports.KEEPALIVE_INTERVAL = 90000;
/** the `readyState` of an open WebSocket */
const OPEN = 1;
/**
 * A client for one ElectrumX server.
 *
 * It answers requests, hands notifications to listeners, keeps an idle
 * connection open with a ping, and says when the connection is gone – it does
 * not reconnect: which server to use next is the application's decision.
 *
 * @example
 * ```ts
 * const client = new ElectrumClient('wss://electrum.example:50004/');
 * await client.connect();
 * const chain = await verifyChain(client, networks.doichain);
 * if (!chain.ok) throw new Error(`this server follows another chain: ${chain.reason}`);
 * const stop = client.on('blockchain.headers.subscribe', ([header]) => console.log(header));
 * const tip = await client.request('blockchain.headers.subscribe');
 * ```
 */
class ElectrumClient {
  constructor(url, options = {}) {
    this.url = url;
    /** Called when the connection drops without `close()`, so the caller can pick a new server. */
    this.onclose = null;
    this.waiting = new Map();
    this.listeners = new Map();
    this.nextId = 0;
    this.closedOnPurpose = false;
    this.timeout = options.timeout ?? exports.REQUEST_TIMEOUT;
    this.keepAliveInterval =
      options.keepAliveInterval ?? exports.KEEPALIVE_INTERVAL;
    const WebSocketClass = options.webSocket ?? globalThis.WebSocket;
    if (!WebSocketClass)
      throw new Error(
        'This runtime has no WebSocket; pass one as options.webSocket, for example from the ws package',
      );
    this.WebSocketClass = WebSocketClass;
  }
  /** True while the socket is open and requests can be sent. */
  get connected() {
    return this.socket?.readyState === OPEN;
  }
  /** Opens the connection. Resolves once the server accepted it. */
  connect() {
    if (this.connected) return Promise.resolve();
    this.closedOnPurpose = false;
    return new Promise((resolve, reject) => {
      const socket = new this.WebSocketClass(this.url);
      this.socket = socket;
      socket.onopen = () => {
        this.startKeepAlive();
        resolve();
      };
      socket.onmessage = event => this.receive(event.data);
      socket.onclose = event => this.dropped(event);
      socket.onerror = () => {
        // the error event carries no message, so at least name the server
        socket.close();
        reject(new Error(`WebSocket error on ${this.url}`));
      };
    });
  }
  /** Closes the connection. `onclose` is not called: this was on purpose. */
  close() {
    this.closedOnPurpose = true;
    this.stopKeepAlive();
    this.socket?.close();
    this.socket = undefined;
  }
  /**
   * Asks the server one question.
   *
   * @param method - an ElectrumX method, e.g. `blockchain.transaction.get`
   * @param params - its parameters
   * @returns whatever the server answers; a result of `0`, `false` or `null` stays that value
   * @throws Error `ESOCKET` without a connection, `ETIMEDOUT <method>` when the
   * answer stays away, or the server's own error message
   */
  request(method, params = []) {
    if (!this.connected) return Promise.reject(new Error('ESOCKET'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`ETIMEDOUT ${method}`));
      }, this.timeout);
      this.waiting.set(id, { resolve, reject, timer });
      try {
        this.socket.send(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
        );
      } catch (error) {
        this.waiting.delete(id);
        clearTimeout(timer);
        reject(error);
      }
    });
  }
  /**
   * Listens for a notification, e.g. `blockchain.headers.subscribe` after
   * subscribing to it with {@link request}.
   *
   * @returns a function that stops listening
   */
  on(method, listener) {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
    };
  }
  /** One message from the server: an answer, or a notification without an id. */
  receive(body) {
    let message;
    try {
      message = JSON.parse(String(body));
    } catch {
      return; // a gateway's HTML error page, or a truncated frame
    }
    if (message.id === undefined || message.id === null) {
      if (message.method)
        for (const listener of this.listeners.get(message.method) ?? [])
          listener(message.params);
      return;
    }
    const waiting = this.waiting.get(message.id);
    if (!waiting) return; // an answer to a request that already gave up
    this.waiting.delete(message.id);
    clearTimeout(waiting.timer);
    if (message.error) {
      const error = new Error(
        message.error.message ?? JSON.stringify(message.error),
      );
      error.code = message.error.code;
      waiting.reject(error);
    } else {
      // a result may be 0, false or null
      waiting.resolve('result' in message ? message.result : message);
    }
  }
  /** The connection is gone: nothing that was waiting can still be answered. */
  dropped(event) {
    this.stopKeepAlive();
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      this.waiting.delete(id);
      waiting.reject(new Error('ECONNCLOSED'));
    }
    this.socket = undefined;
    if (!this.closedOnPurpose && this.onclose) this.onclose(event);
  }
  startKeepAlive() {
    this.stopKeepAlive();
    if (!this.keepAliveInterval) return;
    this.keepAliveTimer = setInterval(() => {
      this.request('server.ping').catch(() => {
        // a server that stopped answering is treated like a dropped connection
        this.socket?.close();
      });
    }, this.keepAliveInterval);
    // a ping must not keep a Node process alive
    this.keepAliveTimer?.unref?.();
  }
  stopKeepAlive() {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }
}
exports.ElectrumClient = ElectrumClient;
/**
 * The first block that tells the two Doichain chains apart.
 *
 * The new rules of Doichain Core v31 took effect at height 431,017 on
 * 11 September 2026, but that block is on both chains: Doichain never enforced
 * `nBits`, so the old 0.20 nodes accepted it despite its new difficulty. Both
 * chains build their next block on it, and there they part – at **431,018**
 * the chain of the fork has `71d5…4b67`, the old one `bab4…2d34`. A checkpoint
 * at 431,017 would therefore pass on either chain.
 *
 * Testnet and regtest have no checkpoint. The key is the network's bech32
 * prefix, so a network object that carries extra fields of its own still
 * matches.
 */
exports.CHECKPOINTS = {
  dc: {
    height: 431018,
    hash: '71d50ff12b090561cc918ddb560334b4350758c7eace3f058dd332fb112f4b67',
  },
};
/**
 * The hash of a block: SHA-256 twice over the first 80 bytes of its header,
 * written in reverse byte order like every block explorer shows it. ElectrumX
 * sends the merged-mining (AuxPoW) data of a Doichain block after those 80
 * bytes; it is not part of the hash.
 *
 * @param headerHex - the header as ElectrumX sends it
 */
function blockHash(headerHex) {
  const header = Buffer.from(headerHex.slice(0, 160), 'hex');
  return Buffer.from((0, crypto_1.hash256)(header))
    .reverse()
    .toString('hex');
}
exports.blockHash = blockHash;
/**
 * Asks a server for the checkpoint block and compares its hash.
 *
 * This does not prove the newest blocks, but a server on the other chain, or
 * one that has not reached the split yet, fails it. A network without a
 * checkpoint (testnet, regtest) passes.
 *
 * @returns `{ok: true}`, or why the server cannot be trusted
 */
async function verifyChain(client, network) {
  const checkpoint = exports.CHECKPOINTS[network?.bech32];
  if (!checkpoint) return { ok: true };
  let header;
  try {
    header = await client.request('blockchain.block.header', [
      checkpoint.height,
    ]);
  } catch {
    // no answer, or a server that has not reached the checkpoint yet
    return { ok: false, reason: 'unverified' };
  }
  if (typeof header !== 'string' || header.length < 160)
    return { ok: false, reason: 'unverified' };
  return blockHash(header) === checkpoint.hash
    ? { ok: true }
    : { ok: false, reason: 'wrongChain' };
}
exports.verifyChain = verifyChain;
