# Name operations

Doichain inherits names from Namecoin: a transaction output can carry a name and a value, and whoever can spend that output holds the name. This guide explains how doichainjs-lib reads, builds and spends such outputs.

The examples use `networks.doichain`, see [Networks](../README.md#networks) in the README.

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
- **Value:** at most 520 bytes. Doichain Core accepts values up to 1023 bytes, but an output with a longer value can never be spent: spending runs the whole output script, and the script interpreter refuses every push longer than 520 bytes. The name keeps that value until it expires, and its locked coin is lost. Core's own RPCs stop at 520 bytes for this reason.
- **Version:** name transactions use version `0x7100`.

The byte limits are `MAX_NAME_LENGTH` and `MAX_VALUE_LENGTH_UI` in Doichain Core's `src/names/main.h`, and `nameops.MAX_NAME_LENGTH` and `nameops.MAX_VALUE_LENGTH` in this library. Limits count bytes, not characters: `ö` takes two bytes in UTF-8. Names that look alike can still differ byte for byte, so normalize text (for example to Unicode NFC) before you encode it.

## Building a name output

```ts
import { address, nameops, networks, Psbt } from '@doichain/doichainjs-lib';

const nameScript = nameops.nameDoiScript(
  name.normalize('NFC'),
  value,
  address.toOutputScript(holderAddress, networks.doichain),
);

const psbt = new Psbt({ network: networks.doichain });
psbt.setVersion(0x7100);
psbt.addOutput({ script: nameScript, value: 1_000_000 });
```

`nameops.nameDoiScript` writes `OP_NAME_DOI <name> <value> OP_2DROP OP_DROP <owner's script>` and throws if the name or the value is longer than Doichain Core accepts.

- **Pushes:** name and value are pushed with their length in bytes. An empty value or a one-byte value such as `0x05` still makes a name script. `script.compile` would write such a value as a number opcode like `OP_5`, and the output would no longer carry a name.
- **Strings:** they are encoded as UTF-8 exactly as given, so normalize names before you pass them in.
- **Owner:** `address.toOutputScript` builds the owner's script for every address type and checks the network. Only a real address of the recipient keeps the name spendable: taking just the hash out of a P2SH or Taproot address and wrapping it in a P2PKH or P2WPKH script makes the name output unspendable. `Psbt` signs name inputs held by P2PKH and P2WPKH scripts.
- **Version:** set `0x7100` before anybody signs, because a signed PSBT refuses to change its version.

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

Once a `SIGHASH_ALL` signature exists, the library refuses to change the version, inputs or outputs. It throws `Can not modify transaction, signatures exist.`

## Looking up a name

ElectrumX indexes every operation on a name under the script hash of `OP_NAME_UPDATE <name> <empty value> OP_2DROP OP_DROP OP_RETURN`. `nameops.nameIndexScript` builds that script, and `nameops.nameIndexScriptHash` returns its Electrum script hash:

```ts
import { nameops } from '@doichain/doichainjs-lib';

const history = await electrum.request('blockchain.scripthash.get_history', [
  nameops.nameIndexScriptHash(name.normalize('NFC')),
]);
```

1. `blockchain.scripthash.get_history` lists every transaction that operated on the name, with its block height (0 or −1 while in the mempool).
2. `blockchain.transaction.get(txid, true)` returns each transaction. On Doichain's ElectrumX servers, the name's output carries `scriptPubKey.nameOp` with `op`, `name`, `value` and their encodings.
3. The newest operation holds the name. Its output is the input that a transfer or a purchase has to spend, and its address is the holder.
4. A name expires 36,000 blocks after its newest operation (`NameExpirationDepth` in Doichain Core's `src/consensus/params.h`). After that, anybody can register it again.

The functions don't normalize. Normalize a name that a user types the way you register names, and pass the bytes of a name read from a transaction unchanged. Pushes are written the way ElectrumX writes them, so a one-byte name stays a push.

## Tests

`test/nameops.spec.ts` covers the parser for all four operations, the addresses of names held by every standard owner type, the payments for name outputs, the PSBT checks and the index scripts for looking up names.

`test/fixtures/nameindex.json` holds index scripts and script hashes computed with ElectrumX's own algorithm. Two of them were also checked against a Doichain mainnet ElectrumX server.

The PSBTs in `test/fixtures/nameops.json` are registrations, purchases and value updates for names held by P2PKH and by P2WPKH addresses. Each was built with [names-on-chain](https://github.com/Doichain/names-on-chain) and accepted by a Doichain Core v31.1.5 regtest node. The tests sign them again and compare the result with the accepted transactions, byte for byte.
