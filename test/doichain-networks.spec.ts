import * as assert from 'assert';
import BIP32Factory from 'bip32';
import ECPairFactory from 'ecpair';
import { describe, it } from 'mocha';
import * as ecc from 'tiny-secp256k1';
import { address, Network, networks, payments } from '..';
import * as fixtures from './fixtures/nameops.json';

const bip32 = BIP32Factory(ecc);
const ECPair = ECPairFactory(ecc);

/** Everything of a network except its message prefix. */
const prefixesOf = (network: Omit<Network, 'messagePrefix'>) => ({
  bech32: network.bech32,
  bip32: { public: network.bip32.public, private: network.bip32.private },
  pubKeyHash: network.pubKeyHash,
  scriptHash: network.scriptHash,
  wif: network.wif,
});

describe('Doichain networks', () => {
  // base58Prefixes and bech32_hrp in src/kernel/chainparams.cpp of Doichain Core
  const core = {
    doichain: {
      bech32: 'dc',
      bip32: { public: 0x0488b21e, private: 0x0488ade4 },
      pubKeyHash: 52,
      scriptHash: 13,
      wif: 180,
    },
    doichainTestnet: {
      bech32: 'td',
      bip32: { public: 0x043587cf, private: 0x04358394 },
      pubKeyHash: 111,
      scriptHash: 196,
      wif: 239,
    },
    doichainRegtest: {
      bech32: 'ncrt',
      bip32: { public: 0x043587cf, private: 0x04358394 },
      pubKeyHash: 111,
      scriptHash: 196,
      wif: 239,
    },
  };

  Object.entries(core).forEach(([name, expected]) => {
    it(`${name} has the prefixes of Doichain Core`, () => {
      const network = networks[name as keyof typeof core];
      assert.deepStrictEqual(prefixesOf(network), expected);
      assert.strictEqual(
        network.messagePrefix,
        '\x19Doichain Signed Message:\n',
      );
    });
  });

  it('doichainRegtest matches the network of the regtest fixtures', () => {
    assert.deepStrictEqual(
      prefixesOf(networks.doichainRegtest),
      prefixesOf(fixtures.network),
    );
  });

  it('writes bech32 addresses with the Doichain prefixes', () => {
    const hash = Buffer.alloc(20, 1);
    const addressOn = (network: Network) =>
      payments.p2wpkh({ hash, network }).address!;
    assert.ok(addressOn(networks.doichain).startsWith('dc1q'));
    assert.ok(addressOn(networks.doichainTestnet).startsWith('td1q'));
    assert.ok(addressOn(networks.doichainRegtest).startsWith('ncrt1q'));
  });

  it('writes P2PKH and P2SH addresses with the Doichain versions', () => {
    const hash = Buffer.alloc(20, 2);
    const p2pkh = payments.p2pkh({ hash, network: networks.doichain }).address!;
    const p2sh = payments.p2sh({ hash, network: networks.doichain }).address!;
    assert.strictEqual(address.fromBase58Check(p2pkh).version, 52);
    assert.strictEqual(address.fromBase58Check(p2sh).version, 13);
    assert.throws(() => address.toOutputScript(p2pkh, networks.bitcoin));
  });

  it('writes mainnet extended keys that start with xprv and xpub', () => {
    const seed = Buffer.from('000102030405060708090a0b0c0d0e0f', 'hex'); // BIP32 test vector 1
    const root = bip32.fromSeed(seed, networks.doichain);
    const xprv = root.toBase58();
    assert.ok(xprv.startsWith('xprv'));
    assert.ok(root.neutered().toBase58().startsWith('xpub'));
    assert.strictEqual(
      bip32.fromBase58(xprv, networks.doichain).toBase58(),
      xprv,
    );
  });

  it('reads back its own WIF private keys', () => {
    const key = ECPair.fromPrivateKey(Buffer.alloc(32, 1), {
      network: networks.doichain,
    });
    assert.strictEqual(
      ECPair.fromWIF(key.toWIF(), networks.doichain).privateKey!.toString(
        'hex',
      ),
      '01'.repeat(32),
    );
  });
});
