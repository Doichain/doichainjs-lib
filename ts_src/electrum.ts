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
import { hash256 } from './crypto';
import { Network } from './networks';

/** How long a request may stay unanswered before it fails, in milliseconds. */
export const REQUEST_TIMEOUT = 30_000;

/** ElectrumX drops a silent client after about ten minutes; a ping keeps the connection open. */
export const KEEPALIVE_INTERVAL = 90_000;

/** the `readyState` of an open WebSocket */
const OPEN = 1;

/** What this client needs of a WebSocket, so a runtime without one can pass its own. */
export interface WebSocketLike {
  readyState: number;
  onopen: ((event: any) => void) | null;
  onmessage: ((event: { data: any }) => void) | null;
  onclose: ((event: any) => void) | null;
  onerror: ((event: any) => void) | null;
  send(data: string): void;
  close(): void;
}

export interface ElectrumClientOptions {
  /** milliseconds a request waits for its answer (default {@link REQUEST_TIMEOUT}) */
  timeout?: number;
  /** milliseconds between pings, 0 switches them off (default {@link KEEPALIVE_INTERVAL}) */
  keepAliveInterval?: number;
  /**
   * The WebSocket to open. Node 22 and every browser have one; older runtimes
   * can pass the one from the `ws` package.
   */
  webSocket?: new (url: string) => WebSocketLike;
}

type Waiting = {
  resolve: (value: any) => void;
  reject: (error: Error) => void;
  timer: any;
};

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
export class ElectrumClient {
  /** Called when the connection drops without `close()`, so the caller can pick a new server. */
  onclose: ((event: unknown) => void) | null = null;

  private readonly timeout: number;
  private readonly keepAliveInterval: number;
  private readonly WebSocketClass: new (url: string) => WebSocketLike;
  private readonly waiting = new Map<number, Waiting>();
  private readonly listeners = new Map<string, Set<(params: any[]) => void>>();
  private socket?: WebSocketLike;
  private nextId = 0;
  private keepAliveTimer: any;
  private closedOnPurpose = false;

  constructor(readonly url: string, options: ElectrumClientOptions = {}) {
    this.timeout = options.timeout ?? REQUEST_TIMEOUT;
    this.keepAliveInterval = options.keepAliveInterval ?? KEEPALIVE_INTERVAL;
    const WebSocketClass = options.webSocket ?? (globalThis as any).WebSocket;
    if (!WebSocketClass)
      throw new Error(
        'This runtime has no WebSocket; pass one as options.webSocket, for example from the ws package',
      );
    this.WebSocketClass = WebSocketClass;
  }

  /** True while the socket is open and requests can be sent. */
  get connected(): boolean {
    return this.socket?.readyState === OPEN;
  }

  /** Opens the connection. Resolves once the server accepted it. */
  connect(): Promise<void> {
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
  close(): void {
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
  request<T = any>(method: string, params: unknown[] = []): Promise<T> {
    if (!this.connected) return Promise.reject(new Error('ESOCKET'));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.waiting.delete(id)) reject(new Error(`ETIMEDOUT ${method}`));
      }, this.timeout);
      this.waiting.set(id, { resolve, reject, timer });
      try {
        this.socket!.send(
          JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n',
        );
      } catch (error) {
        this.waiting.delete(id);
        clearTimeout(timer);
        reject(error as Error);
      }
    });
  }

  /**
   * Listens for a notification, e.g. `blockchain.headers.subscribe` after
   * subscribing to it with {@link request}.
   *
   * @returns a function that stops listening
   */
  on(method: string, listener: (params: any[]) => void): () => void {
    const listeners = this.listeners.get(method) ?? new Set();
    listeners.add(listener);
    this.listeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
    };
  }

  /** One message from the server: an answer, or a notification without an id. */
  private receive(body: unknown): void {
    let message: any;
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
      const error: Error & { code?: number } = new Error(
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
  private dropped(event: unknown): void {
    this.stopKeepAlive();
    for (const [id, waiting] of this.waiting) {
      clearTimeout(waiting.timer);
      this.waiting.delete(id);
      waiting.reject(new Error('ECONNCLOSED'));
    }
    this.socket = undefined;
    if (!this.closedOnPurpose && this.onclose) this.onclose(event);
  }

  private startKeepAlive(): void {
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

  private stopKeepAlive(): void {
    if (this.keepAliveTimer) clearInterval(this.keepAliveTimer);
    this.keepAliveTimer = undefined;
  }
}

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
export const CHECKPOINTS: {
  [bech32: string]: { height: number; hash: string };
} = {
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
export function blockHash(headerHex: string): string {
  const header = Buffer.from(headerHex.slice(0, 160), 'hex');
  return Buffer.from(hash256(header)).reverse().toString('hex');
}

/**
 * Asks a server for the checkpoint block and compares its hash.
 *
 * This does not prove the newest blocks, but a server on the other chain, or
 * one that has not reached the split yet, fails it. A network without a
 * checkpoint (testnet, regtest) passes.
 *
 * @returns `{ok: true}`, or why the server cannot be trusted
 */
export async function verifyChain(
  client: Pick<ElectrumClient, 'request'>,
  network: Pick<Network, 'bech32'>,
): Promise<{ ok: boolean; reason?: 'wrongChain' | 'unverified' }> {
  const checkpoint = CHECKPOINTS[network?.bech32];
  if (!checkpoint) return { ok: true };
  let header: unknown;
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
