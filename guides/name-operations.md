# Name operations

Doichain inherits names from Namecoin: a transaction output can carry a name and a value, and whoever can spend that output holds the name. This guide explains how doichainjs-lib reads, builds and spends such outputs.

The examples use the `DOICHAIN` network from the [README](../README.md#networks).

## The script of a name output

A name output puts a prefix in front of an ordinary output script:

```text
<name operation> <arguments> OP_2DROP / OP_DROP <owner's script>
```

The prefix only pushes data and drops it again. What remains is the owner's script, for example P2PKH or P2WPKH, and it decides who can spend the output.

| Operation | Opcode | Arguments |
| --- | --- | --- |
| `OP_NAME_DOI` | `OP_10` (`0x5a`) | `<name> <value>`, then `OP_2DROP OP_DROP` |
| `OP_NAME_NEW` | `OP_1` (`0x51`) | `<hash>`, then `OP_DROP` |
| `OP_NAME_FIRSTUPDATE` | `OP_2` (`0x52`) | `<name> <rand> <value>`, then `OP_2DROP OP_2DROP` |
| `OP_NAME_UPDATE` | `OP_3` (`0x53`) | `<name> <value>`, then `OP_2DROP OP_DROP` |

The test fixtures cover `OP_NAME_DOI`, which Doichain uses to register, transfer and update names.

`nameops.nameScriptOwner` returns the owner's script, or `undefined` for any other script. It reads the prefix like Namecoin's `CNameScript`: data pushes up to the first `OP_DROP`, `OP_2DROP` or `OP_NOP`. An opcode that is not a data push, such as `OP_1` in place of a value, turns the whole script into a non-name script. So does a wrong number of pushes, for example `OP_NAME_DOI` with a name but no value: Doichain Core reads no name in such a script.

## Limits

- **Name:** at most 255 bytes.
- **Value:** at most 1023 bytes. Doichain Core's wallet allows 520.
- **Version:** name transactions use version `0x7100`.

The byte limits are `MAX_NAME_LENGTH` and `MAX_VALUE_LENGTH` in Doichain Core's `src/names/main.h`. Limits count bytes, not characters: `ö` takes two bytes in UTF-8. Names that look alike can still differ byte for byte, so normalize text (for example to Unicode NFC) before you encode it.

## Building a name output

```ts
import { address, opcodes, Psbt, script } from '@doichain/doichainjs-lib';

const nameScript = Buffer.concat([
  script.compile([
    opcodes.OP_10,
    Buffer.from(name.normalize('NFC'), 'utf8'),
    Buffer.from(value, 'utf8'),
    opcodes.OP_2DROP,
    opcodes.OP_DROP,
  ]),
  address.toOutputScript(holderAddress, DOICHAIN),
]);

const psbt = new Psbt({ network: DOICHAIN });
psbt.setVersion(0x7100);
psbt.addOutput({ script: nameScript, value: 1_000_000 });
```

`script.compile` writes the shortest encoding for each item. An empty value becomes `OP_0`, which is a valid push. A one-byte value from `0x01` to `0x10`, or `0x81`, becomes an opcode such as `OP_1` instead of a push, and the output would no longer carry a name. Write the push yourself for such values.

The regtest fixtures lock 0.01 DOI (1,000,000 swartz) in each name output.

## Spending a name output

A name output is spent like its owner's script:

- **Held by P2PKH:** the input needs `nonWitnessUtxo`, the full previous transaction. The signature commits to the whole name script and goes into the scriptSig.
- **Held by P2WPKH:** the input needs `witnessUtxo` with the whole name script and its value, or `nonWitnessUtxo`; names-on-chain sets both. The signature follows BIP143, using the P2PKH template of the holder's key hash, and goes into the witness.

```ts
psbt.addInput({
  hash: nameTxid,
  index: nameVout,
  nonWitnessUtxo: previousTransaction,
  // only for names held by P2WPKH addresses:
  witnessUtxo: { script: nameScript, value: lockedAmount },
});
psbt.signInput(0, holderKey);
psbt.finalizeAllInputs();
```

`address.fromOutputScript` returns the holder's address for a name output. A wallet can use it to recognise its own name inputs.

## Trading a name in one transaction

A purchase can happen in a single transaction, so either both sides get what they agreed on or nothing happens:

1. The buyer builds the PSBT:
   - **Inputs:** the buyer's coins and the name output.
   - **Outputs:** the price to the seller, the name with its locked amount to the buyer, and the change back to the buyer.
2. The buyer signs their coins with `SIGHASH_ALL` and hands the PSBT to the holder.
3. The holder checks the outputs, signs the name input last and finalizes.

Once a `SIGHASH_ALL` signature exists, the library refuses to change inputs or outputs. It throws `Can not modify transaction, signatures exist.`

## Tests

`test/nameops.spec.ts` covers the parser for all four operations, the addresses of names held by every standard owner type, the payments for name outputs and the PSBT checks.

The PSBTs in `test/fixtures/nameops.json` are registrations, purchases and value updates for names held by P2PKH and by P2WPKH addresses. Each was built with [names-on-chain](https://github.com/Doichain/names-on-chain) and accepted by a Doichain Core v31.1.5 regtest node. The tests sign them again and compare the result with the accepted transactions, byte for byte.
