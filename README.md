# doichainjs-lib

[![npm](https://img.shields.io/npm/v/@doichain/doichainjs-lib.svg)](https://www.npmjs.com/package/@doichain/doichainjs-lib)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A JavaScript library for [Doichain](https://github.com/Doichain) in Node.js and the browser. It builds, signs and checks addresses, scripts, transactions and PSBTs, including Doichain's name operations. Private keys never leave your code.

doichainjs-lib is a fork of [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) 6.1.6, written in TypeScript. Everything bitcoinjs-lib does works the same way here, including its safety checks for PSBTs. This README covers what Doichain adds.

## What Doichain adds

| API | What it does |
| --- | --- |
| `networks.doichain`, `networks.doichainTestnet`, `networks.doichainRegtest` | Doichain's network parameters from Doichain Core. |
| `nameops.nameDoiScript(name, value, owner)` | Builds the output script that registers, transfers or updates a name (`OP_NAME_DOI`), with the byte limits of Doichain Core. |
| `nameops.nameScriptOwner(script)` | Returns the owner's script behind a name prefix (`OP_NAME_DOI`, `OP_NAME_NEW`, `OP_NAME_FIRSTUPDATE`, `OP_NAME_UPDATE`), parsed like Namecoin's `CNameScript`. |
| `address.fromOutputScript(script, network)` | Also returns the holder's address for a name output, for every standard owner type. |
| `Psbt` | Signs and finalizes name inputs held by P2PKH addresses (signature in the scriptSig) and by P2WPKH addresses (BIP143, signature in the witness). |
| `payments.p2pkhNonstandard`, `payments.p2wpkhNonstandard` | Payments for name outputs held by P2PKH and P2WPKH addresses. |
| `nameops.nameIndexScript(name)`, `nameops.nameIndexScriptHash(name)` | The script and the Electrum script hash under which ElectrumX indexes a name, for looking names up with `blockchain.scripthash.get_history`. |

## Installation

```bash
npm install @doichain/doichainjs-lib ecpair tiny-secp256k1
```

`ecpair` handles single keys and `tiny-secp256k1` provides the elliptic curve. Add `bip32` for HD keys.

## Networks

`networks` holds Doichain's parameters next to Bitcoin's. The prefixes come from `chainparams.cpp` in Doichain Core:

| | `networks.doichain` | `networks.doichainTestnet` | `networks.doichainRegtest` |
| --- | --- | --- | --- |
| bech32 prefix | `dc` | `td` | `ncrt` |
| P2PKH / P2SH version | 52 / 13 | 111 / 196 | 111 / 196 |
| WIF version | 180 | 239 | 239 |
| BIP32 public / private | `0x0488b21e` / `0x0488ade4` | `0x043587cf` / `0x04358394` | `0x043587cf` / `0x04358394` |

Pass the network to every function that takes one, since the default is Bitcoin.

## Usage

### Register a name

```ts
import { address, nameops, networks, Psbt } from '@doichain/doichainjs-lib';

const psbt = new Psbt({ network: networks.doichain });
psbt.setVersion(0x7100); // name transactions
psbt.addOutput({
  script: nameops.nameDoiScript(
    name.normalize('NFC'),
    value,
    address.toOutputScript(holderAddress, networks.doichain),
  ),
  value: 1_000_000, // locked in the name output
});
```

### Find out who holds a name

```ts
import { address, nameops, networks } from '@doichain/doichainjs-lib';

const owner = nameops.nameScriptOwner(output); // undefined if the output carries no name
const holder = address.fromOutputScript(output, networks.doichain);
```

### Talk to an ElectrumX server

```ts
import { electrum, nameops, networks } from '@doichain/doichainjs-lib';

const client = new electrum.ElectrumClient('wss://electrum.example:50004/');
await client.connect();

// a server answers with whatever chain its node follows, so check it first
const chain = await electrum.verifyChain(client, networks.doichain);
if (!chain.ok) throw new Error(`this server is on another chain: ${chain.reason}`);

const history = await client.request('blockchain.scripthash.get_history', [
  nameops.nameIndexScriptHash('my-name'),
]);
client.on('blockchain.headers.subscribe', ([header]) => console.log(header.height));
await client.request('blockchain.headers.subscribe');
```

The client keeps an idle connection open with a ping and says through `onclose` when the connection is gone; which server to try next is the application's decision. Node 22 and every browser have a `WebSocket`; an older runtime can pass one (`new electrum.ElectrumClient(url, { webSocket })`).

### Sign the name input of a purchase

```ts
import { networks, Psbt } from '@doichain/doichainjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);
const psbt = Psbt.fromBase64(psbtBase64, { network: networks.doichain });
psbt.signInput(nameInputIndex, ECPair.fromWIF(holderWif, networks.doichain));
const tx = psbt.finalizeAllInputs().extractTransaction();
```

Inputs spent without a witness, including names held by P2PKH addresses, need `nonWitnessUtxo`, the full previous transaction. Inputs spent with a witness can use `witnessUtxo` instead. Building and spending name outputs is covered in [Name operations](guides/name-operations.md).

## Documentation

- [Name operations](guides/name-operations.md): the script layout and its limits, and how to build, spend and trade names.
- [API reference](https://doichain.github.io/doichainjs-lib/), built from the JSDoc. `npm run doc` writes it to `docs/`.
- For everything that is not specific to Doichain, the [bitcoinjs-lib documentation](https://bitcoinjs.github.io/bitcoinjs-lib/) and its [examples](https://github.com/bitcoinjs/bitcoinjs-lib/tree/v6.1.6/test/integration) apply.

## Security

- Read bitcoinjs-lib's [usage notes](https://github.com/bitcoinjs/bitcoinjs-lib/tree/v6.1.6#usage) on random numbers, `Buffer` and best practice. They apply here unchanged.
- Show users a freshly decoded version of every transaction before they sign it, including the name, value and holder of every name output.
- Keep the PSBT checks on. Signing a non-segwit input without its previous transaction lets a PSBT lie about amounts, and so about the fee.
- From 6.2.0 on, releases are published by GitHub Actions with npm provenance. `npm audit signatures` checks that the version you installed was built from this repository. Earlier versions were uploaded by hand and carry no provenance.
- Report security problems privately through [a security advisory](https://github.com/Doichain/doichainjs-lib/security/advisories/new), not in a public issue. See [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run build   # compiles ts_src/ into src/, which is committed too
npm run unit    # build, then unit tests
npm test        # build, format check, lint and coverage
```

Change the TypeScript sources in `ts_src/` and commit the regenerated `src/` with them. The tests in `test/nameops.spec.ts` compare signatures with transactions that a Doichain Core regtest node accepted (`test/fixtures/nameops.json`).

To release, raise `version` in `package.json` and add a CHANGELOG entry in a pull request. Once it is merged, publish a GitHub release tagged `v<version>` on `master`. The [publish workflow](.github/workflows/publish.yml) runs the tests and publishes to npm. A release marked as pre-release goes to the `next` tag.

## License

MIT, see [LICENSE](LICENSE). Based on [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) by its contributors.
