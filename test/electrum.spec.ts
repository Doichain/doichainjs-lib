import * as assert from 'assert';
import { describe, it } from 'mocha';
import { electrum, networks } from '..';
import { ElectrumClient, WebSocketLike } from '../src/electrum';

/** A WebSocket the test drives by hand: open it, fail it, drop it, let the server talk. */
class FakeWebSocket implements WebSocketLike {
  static last: FakeWebSocket;

  readyState = 0;
  sent: any[] = [];
  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: { data: any }) => void) | null = null;
  onclose: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  url: string;

  constructor(url: string) {
    this.url = url;
    FakeWebSocket.last = this;
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.({});
  }

  fail(): void {
    this.onerror?.({ type: 'error' });
  }

  send(data: string): void {
    this.sent.push(JSON.parse(data));
  }

  close(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: 1006 });
  }

  receive(message: unknown): void {
    this.onmessage?.({
      data: typeof message === 'string' ? message : JSON.stringify(message),
    });
  }
}

/** A client whose connection is open, with the socket the test can talk through. */
async function connected(options = {}): Promise<{
  client: ElectrumClient;
  socket: FakeWebSocket;
}> {
  const client = new electrum.ElectrumClient('wss://electrum.example:50004/', {
    webSocket: FakeWebSocket,
    keepAliveInterval: 0,
    ...options,
  });
  const opening = client.connect();
  FakeWebSocket.last.open();
  await opening;
  return { client, socket: FakeWebSocket.last };
}

describe('electrum.ElectrumClient', () => {
  it('resolves a result of 0 as 0, not as the whole message', async () => {
    const { client, socket } = await connected();
    const answer = client.request('blockchain.scripthash.get_balance', ['00']);
    socket.receive({ jsonrpc: '2.0', id: socket.sent[0].id, result: 0 });
    assert.strictEqual(await answer, 0);
  });

  it('sends the method and its parameters as JSON-RPC', async () => {
    const { client, socket } = await connected();
    client.request('blockchain.transaction.get', ['ff', true]).catch(() => {
      /* never answered */
    });
    assert.deepStrictEqual(socket.sent[0], {
      jsonrpc: '2.0',
      id: 1,
      method: 'blockchain.transaction.get',
      params: ['ff', true],
    });
  });

  it('hands a notification without an id to the listeners, until they stop', async () => {
    const { client, socket } = await connected();
    const seen: any[] = [];
    const stop = client.on('blockchain.headers.subscribe', params =>
      seen.push(params),
    );
    const header = { height: 431800, hex: '00' };
    socket.receive({
      jsonrpc: '2.0',
      method: 'blockchain.headers.subscribe',
      params: [header],
    });
    stop();
    socket.receive({
      jsonrpc: '2.0',
      method: 'blockchain.headers.subscribe',
      params: [header],
    });
    assert.deepStrictEqual(seen, [[header]]);
  });

  it("turns the server's error into an Error with its message and code", async () => {
    const { client, socket } = await connected();
    const answer = client.request('blockchain.transaction.get', ['ff']);
    socket.receive({
      jsonrpc: '2.0',
      id: socket.sent[0].id,
      error: { code: 2, message: 'no such transaction' },
    });
    await assert.rejects(answer, (error: Error & { code?: number }) => {
      assert.strictEqual(error.message, 'no such transaction');
      assert.strictEqual(error.code, 2);
      return true;
    });
  });

  it('gives up on a request the server never answers', async () => {
    const { client } = await connected({ timeout: 5 });
    await assert.rejects(client.request('server.banner'), /ETIMEDOUT server/);
  });

  it('fails the request when the socket refuses to send', async () => {
    const { client, socket } = await connected();
    socket.send = () => {
      throw new Error('the socket is in a bad state');
    };
    await assert.rejects(
      client.request('server.banner'),
      /the socket is in a bad state/,
    );
  });

  it('ignores a message that is not JSON', async () => {
    const { socket } = await connected();
    assert.doesNotThrow(() => socket.receive('<html>502 Bad Gateway</html>'));
  });

  it('rejects a connection that failed, naming the server', async () => {
    const client = new electrum.ElectrumClient(
      'wss://electrum.example:50004/',
      {
        webSocket: FakeWebSocket,
      },
    );
    const opening = client.connect();
    FakeWebSocket.last.fail();
    await assert.rejects(opening, /wss:\/\/electrum.example:50004\//);
    assert.strictEqual(client.connected, false);
  });

  it('pings a silent server so the connection stays open', async () => {
    const { socket } = await connected({ keepAliveInterval: 5 });
    await new Promise(resolve => setTimeout(resolve, 20));
    assert.ok(socket.sent.some(message => message.method === 'server.ping'));
  });

  it('reports a dropped connection and rejects what was still waiting', async () => {
    const { client, socket } = await connected();
    let dropped = 0;
    client.onclose = () => dropped++;
    const answer = client.request('server.banner');
    socket.close();
    await assert.rejects(answer, /ECONNCLOSED/);
    assert.strictEqual(dropped, 1);
    await assert.rejects(client.request('server.banner'), /ESOCKET/);
  });

  it('does not report a connection it was asked to close', async () => {
    const { client, socket } = await connected();
    let dropped = 0;
    client.onclose = () => dropped++;
    client.close();
    assert.strictEqual(socket.readyState, 3);
    assert.strictEqual(dropped, 0);
    assert.strictEqual(client.connected, false);
  });

  it('says so when the runtime has no WebSocket of its own', () => {
    const websocket = (globalThis as any).WebSocket;
    delete (globalThis as any).WebSocket;
    try {
      assert.throws(
        () => new electrum.ElectrumClient('wss://electrum.example:50004/'),
        /no WebSocket/,
      );
    } finally {
      if (websocket) (globalThis as any).WebSocket = websocket;
    }
  });
});

describe('electrum.verifyChain', () => {
  /** the header of block 431,017 of the valid chain, with its AuxPoW data cut off */
  const CHECKPOINT_HEADER =
    '00000020' +
    '0'.repeat(64) +
    '0'.repeat(64) +
    '00000000' +
    '00000000' +
    '00000000';

  const answering = (
    answer: unknown,
  ): { request: (method: string, params?: unknown[]) => Promise<any> } => ({
    request: async () => {
      if (answer instanceof Error) throw answer;
      return answer;
    },
  });

  it('accepts a network without a checkpoint', async () => {
    const seen = await electrum.verifyChain(
      answering(new Error('never asked')),
      networks.doichainRegtest,
    );
    assert.deepStrictEqual(seen, { ok: true });
  });

  it('accepts the server that has the checkpoint block', async () => {
    const header = CHECKPOINT_HEADER;
    const hash = electrum.blockHash(header);
    const checkpoint = electrum.CHECKPOINTS[networks.doichain.bech32];
    const original = checkpoint.hash;
    checkpoint.hash = hash;
    try {
      assert.deepStrictEqual(
        await electrum.verifyChain(answering(header), networks.doichain),
        { ok: true },
      );
    } finally {
      checkpoint.hash = original;
    }
  });

  it('refuses a server with another block at that height', async () => {
    assert.deepStrictEqual(
      await electrum.verifyChain(
        answering(CHECKPOINT_HEADER),
        networks.doichain,
      ),
      { ok: false, reason: 'wrongChain' },
    );
  });

  it('refuses a server that does not answer, or answers with nothing', async () => {
    assert.deepStrictEqual(
      await electrum.verifyChain(
        answering(new Error('no such block')),
        networks.doichain,
      ),
      { ok: false, reason: 'unverified' },
    );
    assert.deepStrictEqual(
      await electrum.verifyChain(answering('00'), networks.doichain),
      { ok: false, reason: 'unverified' },
    );
  });

  it('hashes only the first 80 bytes, not the merged-mining data behind them', () => {
    const auxpow = CHECKPOINT_HEADER + 'ff'.repeat(200);
    assert.strictEqual(
      electrum.blockHash(auxpow),
      electrum.blockHash(CHECKPOINT_HEADER),
    );
  });
});
