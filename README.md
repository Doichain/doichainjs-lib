# doichainjs-lib

[![npm](https://img.shields.io/npm/v/@doichain/doichainjs-lib.svg)](https://www.npmjs.com/package/@doichain/doichainjs-lib)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![code style: prettier](https://img.shields.io/badge/code_style-prettier-ff69b4.svg?style=flat-square)](https://github.com/prettier/prettier)

A JavaScript library for [Doichain](https://github.com/Doichain) in Node.js and the browser. It builds, signs and checks addresses, scripts, transactions and PSBTs, including Doichain's name operations. Private keys never leave your code.

doichainjs-lib is a fork of [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) 6.1.6, written in TypeScript. Everything bitcoinjs-lib does works the same way here, including its safety checks for PSBTs. This README covers what Doichain adds.

## What Doichain adds

| API | What it does |
| --- | --- |
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

The library only ships Bitcoin's network parameters. These are Doichain's, from `chainparams.cpp` in Doichain Core:

```ts
import { Network } from '@doichain/doichainjs-lib';

export const DOICHAIN: Network = {
  messagePrefix: '\x19Doichain Signed Message:\n',
  bech32: 'dc',
  bip32: { public: 0x0488b21e, private: 0x0488ade4 },
  pubKeyHash: 52,
  scriptHash: 13,
  wif: 180,
};

export const DOICHAIN_REGTEST: Network = {
  messagePrefix: '\x19Doichain-Regtest Signed Message:\n',
  bech32: 'ncrt',
  bip32: { public: 0x043587cf, private: 0x04358394 },
  pubKeyHash: 111,
  scriptHash: 196,
  wif: 239,
};
```

Testnet uses the same prefixes as regtest, with `bech32: 'td'`.

## Usage

### Find out who holds a name

```ts
import { address, nameops } from '@doichain/doichainjs-lib';

const owner = nameops.nameScriptOwner(output); // undefined if the output carries no name
const holder = address.fromOutputScript(output, DOICHAIN);
```

### Sign the name input of a purchase

```ts
import { Psbt } from '@doichain/doichainjs-lib';
import ECPairFactory from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);
const psbt = Psbt.fromBase64(psbtBase64, { network: DOICHAIN });
psbt.signInput(nameInputIndex, ECPair.fromWIF(holderWif, DOICHAIN));
const tx = psbt.finalizeAllInputs().extractTransaction();
```

Inputs spent without a witness, including names held by P2PKH addresses, need `nonWitnessUtxo`, the full previous transaction. Inputs spent with a witness can use `witnessUtxo` instead. Building and spending name outputs is covered in [Name operations](guides/name-operations.md).

## Documentation

- [Name operations](guides/name-operations.md): the script layout and its limits, and how to build, spend and trade names.
- API reference: `npm run doc` writes it to `docs/`.
- For everything that is not specific to Doichain, the [bitcoinjs-lib documentation](https://bitcoinjs.github.io/bitcoinjs-lib/) and its [examples](https://github.com/bitcoinjs/bitcoinjs-lib/tree/v6.1.6/test/integration) apply.

## Security

- Read bitcoinjs-lib's [usage notes](https://github.com/bitcoinjs/bitcoinjs-lib/tree/v6.1.6#usage) on random numbers, `Buffer` and best practice. They apply here unchanged.
- Show users a freshly decoded version of every transaction before they sign it, including the name, value and holder of every name output.
- Keep the PSBT checks on. Signing a non-segwit input without its previous transaction lets a PSBT lie about amounts, and so about the fee.
- Nothing yet proves that the npm release matches this repository. Verify what you install.
- Report security problems privately through [a security advisory](https://github.com/Doichain/doichainjs-lib/security/advisories/new), not in a public issue. See [SECURITY.md](SECURITY.md).

## Development

```bash
npm ci
npm run build   # compiles ts_src/ into src/, which is committed too
npm run unit    # build, then unit tests
npm test        # build, format check, lint and coverage
```

Change the TypeScript sources in `ts_src/` and commit the regenerated `src/` with them. The tests in `test/nameops.spec.ts` compare signatures with transactions that a Doichain Core regtest node accepted (`test/fixtures/nameops.json`).

## License

MIT, see [LICENSE](LICENSE). Based on [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib) by its contributors.
