import { Network } from './networks';
/** How long a request may stay unanswered before it fails, in milliseconds. */
export declare const REQUEST_TIMEOUT = 30000;
/** ElectrumX drops a silent client after about ten minutes; a ping keeps the connection open. */
export declare const KEEPALIVE_INTERVAL = 90000;
/** What this client needs of a WebSocket, so a runtime without one can pass its own. */
export interface WebSocketLike {
    readyState: number;
    onopen: ((event: any) => void) | null;
    onmessage: ((event: {
        data: any;
    }) => void) | null;
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
export declare class ElectrumClient {
    readonly url: string;
    /** Called when the connection drops without `close()`, so the caller can pick a new server. */
    onclose: ((event: unknown) => void) | null;
    private readonly timeout;
    private readonly keepAliveInterval;
    private readonly WebSocketClass;
    private readonly waiting;
    private readonly listeners;
    private socket?;
    private nextId;
    private keepAliveTimer;
    private closedOnPurpose;
    constructor(url: string, options?: ElectrumClientOptions);
    /** True while the socket is open and requests can be sent. */
    get connected(): boolean;
    /** Opens the connection. Resolves once the server accepted it. */
    connect(): Promise<void>;
    /** Closes the connection. `onclose` is not called: this was on purpose. */
    close(): void;
    /**
     * Asks the server one question.
     *
     * @param method - an ElectrumX method, e.g. `blockchain.transaction.get`
     * @param params - its parameters
     * @returns whatever the server answers; a result of `0`, `false` or `null` stays that value
     * @throws Error `ESOCKET` without a connection, `ETIMEDOUT <method>` when the
     * answer stays away, or the server's own error message
     */
    request<T = any>(method: string, params?: unknown[]): Promise<T>;
    /**
     * Listens for a notification, e.g. `blockchain.headers.subscribe` after
     * subscribing to it with {@link request}.
     *
     * @returns a function that stops listening
     */
    on(method: string, listener: (params: any[]) => void): () => void;
    /** One message from the server: an answer, or a notification without an id. */
    private receive;
    /** The connection is gone: nothing that was waiting can still be answered. */
    private dropped;
    private startKeepAlive;
    private stopKeepAlive;
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
export declare const CHECKPOINTS: {
    [bech32: string]: {
        height: number;
        hash: string;
    };
};
/**
 * The hash of a block: SHA-256 twice over the first 80 bytes of its header,
 * written in reverse byte order like every block explorer shows it. ElectrumX
 * sends the merged-mining (AuxPoW) data of a Doichain block after those 80
 * bytes; it is not part of the hash.
 *
 * @param headerHex - the header as ElectrumX sends it
 */
export declare function blockHash(headerHex: string): string;
/**
 * Asks a server for the checkpoint block and compares its hash.
 *
 * This does not prove the newest blocks, but a server on the other chain, or
 * one that has not reached the split yet, fails it. A network without a
 * checkpoint (testnet, regtest) passes.
 *
 * @returns `{ok: true}`, or why the server cannot be trusted
 */
export declare function verifyChain(client: Pick<ElectrumClient, 'request'>, network: Pick<Network, 'bech32'>): Promise<{
    ok: boolean;
    reason?: 'wrongChain' | 'unverified';
}>;
