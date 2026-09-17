import * as assert from 'assert';
import ECPairFactory from 'ecpair';
import { describe, it } from 'mocha';
import * as ecc from 'tiny-secp256k1';
import {
  address,
  initEccLib,
  nameops,
  payments,
  Psbt,
  script as bscript,
  Transaction,
} from '..';
import * as psbtutils from '../src/psbt/psbtutils';
import * as nameIndexFixtures from './fixtures/nameindex.json';
import * as fixtures from './fixtures/nameops.json';

const ECPair = ECPairFactory(ecc);
initEccLib(ecc);

const network = fixtures.network;
const OPS = bscript.OPS;

const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

/** OP_NAME_DOI <name> <value> OP_2DROP OP_DROP <owner> */
const nameDoiScript = (name: string, value: string, owner: Buffer): Buffer =>
  Buffer.concat([
    bscript.compile([
      OPS.OP_10,
      Buffer.from(name, 'utf8'),
      Buffer.from(value, 'utf8'),
      OPS.OP_2DROP,
      OPS.OP_DROP,
    ]),
    owner,
  ]);

/** Signs every input the key can sign, then finalizes the PSBT. */
const signAndExtract = (psbtBase64: string, wif: string): Transaction => {
  const psbt = Psbt.fromBase64(psbtBase64, { network });
  const key = ECPair.fromWIF(wif, network);
  psbt.signAllInputs(key);
  assert.strictEqual(psbt.validateSignaturesOfAllInputs(validator), true);
  psbt.finalizeAllInputs();
  return psbt.extractTransaction();
};

describe('name operations', () => {
  describe('nameScriptOwner', () => {
    fixtures.nameScripts.forEach(f => {
      it(`finds the holder's script: ${f.description}`, () => {
        const owner = nameops.nameScriptOwner(Buffer.from(f.script, 'hex'));
        assert.strictEqual(owner!.toString('hex'), f.owner);
      });
    });

    fixtures.notNameScripts.forEach(f => {
      it(`finds nothing: ${f.description}`, () => {
        assert.strictEqual(
          nameops.nameScriptOwner(Buffer.from(f.script, 'hex')),
          undefined,
        );
      });
    });

    it('is also exported from psbtutils', () => {
      assert.strictEqual(psbtutils.nameScriptOwner, nameops.nameScriptOwner);
    });

    it('tells names held by P2WPKH addresses from names held by P2PKH addresses', () => {
      const [p2pkh, p2wpkh] = fixtures.nameScripts.map(f =>
        Buffer.from(f.script, 'hex'),
      );
      assert.strictEqual(psbtutils.isP2PKHNonStandard(p2pkh), true);
      assert.strictEqual(psbtutils.isP2WPKHNonStandard(p2pkh), false);
      assert.strictEqual(psbtutils.isP2WPKHNonStandard(p2wpkh), true);
      assert.strictEqual(psbtutils.isP2PKHNonStandard(p2wpkh), false);
    });
  });

  describe('payments for name outputs', () => {
    const key = ECPair.fromPrivateKey(Buffer.alloc(32, 2));
    const other = ECPair.fromPrivateKey(Buffer.alloc(32, 3));
    const signature = bscript.signature.encode(
      key.sign(Buffer.alloc(32, 4)),
      Transaction.SIGHASH_ALL,
    );
    const legacy = payments.p2pkh({ pubkey: key.publicKey, network });
    const witness = payments.p2wpkh({ pubkey: key.publicKey, network });
    const heldByLegacy = nameDoiScript('hello', 'world', legacy.output!);
    const heldByWitness = nameDoiScript('hello', 'world', witness.output!);

    it('p2pkhNonstandard: the holder of a name output, with the name script as output', () => {
      const payment = payments.p2pkhNonstandard({
        output: heldByLegacy,
        network,
      });
      assert.strictEqual(payment.address, legacy.address);
      assert.ok(payment.hash!.equals(legacy.hash!));
      assert.ok(payment.output!.equals(heldByLegacy));
    });

    it('p2pkhNonstandard: builds the scriptSig of the holder', () => {
      const payment = payments.p2pkhNonstandard({
        output: heldByLegacy,
        pubkey: key.publicKey,
        signature,
        network,
      });
      const expected = payments.p2pkh({
        output: legacy.output,
        pubkey: key.publicKey,
        signature,
      });
      assert.ok(payment.input!.equals(expected.input!));
    });

    it('p2pkhNonstandard: rejects a key that does not hold the name', () => {
      assert.throws(
        () =>
          payments.p2pkhNonstandard({
            output: heldByLegacy,
            pubkey: other.publicKey,
            network,
          }),
        /Hash mismatch/,
      );
    });

    it('p2pkhNonstandard: rejects scripts that are not names held by P2PKH', () => {
      assert.throws(
        () => payments.p2pkhNonstandard({ output: legacy.output, network }),
        /Output is not a name script/,
      );
      assert.throws(() =>
        payments.p2pkhNonstandard({ output: heldByWitness, network }),
      );
    });

    it('p2pkhNonstandard: has no output without a name script', () => {
      const payment = payments.p2pkhNonstandard({
        pubkey: key.publicKey,
        network,
      });
      assert.strictEqual(payment.address, legacy.address);
      assert.strictEqual(payment.output, undefined);
    });

    it('p2wpkhNonstandard: the holder of a name output and its witness', () => {
      const payment = payments.p2wpkhNonstandard({
        output: heldByWitness,
        pubkey: key.publicKey,
        signature,
        network,
      });
      assert.strictEqual(payment.address, witness.address);
      assert.ok(payment.output!.equals(heldByWitness));
      assert.strictEqual(payment.input!.length, 0);
      assert.deepStrictEqual(payment.witness, [signature, key.publicKey]);
    });

    it('p2wpkhNonstandard: has no output without a name script', () => {
      const payment = payments.p2wpkhNonstandard({
        pubkey: key.publicKey,
        network,
      });
      assert.strictEqual(payment.address, witness.address);
      assert.strictEqual(payment.output, undefined);
    });

    it('p2wpkhNonstandard: rejects scripts that are not name scripts', () => {
      assert.throws(
        () => payments.p2wpkhNonstandard({ output: witness.output, network }),
        /Output is not a name script/,
      );
    });

    it('p2wpkhNonstandard: rejects names held by P2PKH and keys of others', () => {
      assert.throws(() =>
        payments.p2wpkhNonstandard({ output: heldByLegacy, network }),
      );
      assert.throws(
        () =>
          payments.p2wpkhNonstandard({
            output: heldByWitness,
            pubkey: other.publicKey,
            network,
          }),
        /Hash mismatch/,
      );
    });
  });

  describe('address.fromOutputScript', () => {
    const key = ECPair.fromPrivateKey(Buffer.alloc(32, 1));
    const owners: { [type: string]: payments.Payment } = {
      P2PKH: payments.p2pkh({ pubkey: key.publicKey, network }),
      P2WPKH: payments.p2wpkh({ pubkey: key.publicKey, network }),
      P2SH: payments.p2sh({
        redeem: payments.p2wpkh({ pubkey: key.publicKey, network }),
        network,
      }),
      P2WSH: payments.p2wsh({
        redeem: payments.p2pk({ pubkey: key.publicKey, network }),
        network,
      }),
      P2TR: payments.p2tr({
        internalPubkey: key.publicKey.slice(1, 33),
        network,
      }),
    };

    Object.entries(owners).forEach(([type, owner]) => {
      it(`returns the holder's address for a name held by ${type}`, () => {
        assert.strictEqual(
          address.fromOutputScript(
            nameDoiScript('hello', 'world', owner.output!),
            network,
          ),
          owner.address,
        );
      });
    });

    it('returns the holder of a name with an empty value', () => {
      assert.strictEqual(
        address.fromOutputScript(
          nameDoiScript('hello', '', owners.P2PKH.output!),
          network,
        ),
        owners.P2PKH.address,
      );
    });

    it('returns the holder of every name operation', () => {
      fixtures.nameScripts.forEach(f => {
        assert.strictEqual(
          address.fromOutputScript(Buffer.from(f.script, 'hex'), network),
          address.fromOutputScript(Buffer.from(f.owner, 'hex'), network),
        );
      });
    });

    it('does not read an address out of a script that pays no one', () => {
      const script = bscript.compile([
        OPS.OP_1,
        OPS.OP_1,
        OPS.OP_1,
        OPS.OP_1,
        OPS.OP_1,
        OPS.OP_1,
        owners.P2WPKH.hash!,
      ]);
      assert.throws(
        () => address.fromOutputScript(script, network),
        /has no matching Address/,
      );
    });

    it('does not return an address for a name operation without its value', () => {
      // OP_NAME_DOI <name> OP_2DROP OP_DROP <owner>: one push instead of two,
      // so Doichain Core reads no name here.
      const script = Buffer.concat([
        bscript.compile([
          OPS.OP_10,
          Buffer.from('hello', 'utf8'),
          OPS.OP_2DROP,
          OPS.OP_DROP,
        ]),
        owners.P2PKH.output!,
      ]);
      assert.strictEqual(nameops.nameScriptOwner(script), undefined);
      assert.throws(
        () => address.fromOutputScript(script, network),
        /has no matching Address/,
      );
    });

    it('does not return an address for a name held by a non-standard script', () => {
      assert.throws(
        () =>
          address.fromOutputScript(
            nameDoiScript('hello', 'world', bscript.compile([OPS.OP_TRUE])),
            network,
          ),
        /has no matching Address/,
      );
    });
  });

  describe('registering a name (Doichain Core accepted these on regtest)', () => {
    fixtures.registrations.forEach(f => {
      it(`produces the accepted transaction: ${f.description}`, () => {
        const tx = signAndExtract(f.psbt, f.holderWif);
        assert.strictEqual(tx.toHex(), f.acceptedTransaction);
        assert.strictEqual(tx.version, 0x7100);
        assert.ok(
          tx.outs.some(out => nameops.nameScriptOwner(out.script)),
          'the transaction carries a name output',
        );
      });
    });
  });

  describe('selling a name: the holder signs the name input last', () => {
    fixtures.purchases.forEach(f => {
      it(`produces the accepted transaction: ${f.description}`, () => {
        const psbt = Psbt.fromBase64(f.psbt, { network });
        const holder = ECPair.fromWIF(f.sellerWif, network);
        psbt.signInput(f.nameInput, holder);
        assert.strictEqual(
          psbt.validateSignaturesOfInput(f.nameInput, validator),
          true,
        );
        psbt.finalizeAllInputs();
        assert.strictEqual(
          psbt.extractTransaction().toHex(),
          f.acceptedTransaction,
        );
      });
    });

    it('puts the signature for a name held by a P2WPKH address into the witness', () => {
      const f = fixtures.purchases.find(p =>
        p.description.includes('held by a P2WPKH address'),
      )!;
      const psbt = Psbt.fromBase64(f.psbt, { network });
      psbt.signInput(f.nameInput, ECPair.fromWIF(f.sellerWif, network));
      psbt.finalizeAllInputs();
      const input = psbt.extractTransaction().ins[f.nameInput];
      assert.strictEqual(input.script.length, 0);
      assert.strictEqual(input.witness.length, 2);
    });

    it('puts the signature for a name held by a P2PKH address into the scriptSig', () => {
      const f = fixtures.purchases.find(p =>
        p.description.includes('held by a P2PKH address'),
      )!;
      const psbt = Psbt.fromBase64(f.psbt, { network });
      psbt.signInput(f.nameInput, ECPair.fromWIF(f.sellerWif, network));
      psbt.finalizeAllInputs();
      const input = psbt.extractTransaction().ins[f.nameInput];
      assert.strictEqual(bscript.decompile(input.script)!.length, 2);
      assert.strictEqual(input.witness.length, 0);
    });
  });

  describe('writing a new value (Doichain Core accepted these on regtest)', () => {
    fixtures.updates.forEach(f => {
      it(`produces the accepted transaction: ${f.description}`, () => {
        const tx = signAndExtract(f.psbt, f.holderWif);
        assert.strictEqual(tx.toHex(), f.acceptedTransaction);
      });
    });
  });

  describe('the protections of bitcoinjs-lib stay in place for names', () => {
    const f = fixtures.updates.find(u =>
      u.description.includes('held by a P2PKH address'),
    )!;
    const holder = ECPair.fromWIF(f.holderWif, network);
    const unsigned = () => Psbt.fromBase64(f.psbt, { network });

    it('refuses to sign a P2PKH name input known only by a witnessUtxo', () => {
      const original = unsigned();
      const prevout = Transaction.fromBuffer(
        original.data.inputs[f.nameInput].nonWitnessUtxo!,
      ).outs[original.txInputs[f.nameInput].index];
      const psbt = new Psbt({ network });
      psbt.setVersion(0x7100);
      psbt.addInput({
        hash: original.txInputs[f.nameInput].hash,
        index: original.txInputs[f.nameInput].index,
        // a value that is not the real one: the legacy signature would not notice
        witnessUtxo: { script: prevout.script, value: 1 },
      });
      psbt.addOutput({ script: prevout.script, value: 1 });
      assert.throws(
        () => psbt.signInput(0, holder),
        /has witnessUtxo but non-segwit script/,
      );
    });

    it('refuses to change a transaction after the name input was signed', () => {
      const psbt = unsigned();
      psbt.signInput(f.nameInput, holder);
      assert.throws(
        () =>
          psbt.addOutput({
            script: bscript.compile([OPS.OP_RETURN]),
            value: 0,
          }),
        /Can not modify transaction, signatures exist/,
      );
    });

    it('refuses to finalize a P2PKH name input with a signature of another key', () => {
      const psbt = unsigned();
      psbt.signInput(f.nameInput, holder);
      const other = ECPair.fromPrivateKey(Buffer.alloc(32, 7));
      const [sig] = psbt.data.inputs[f.nameInput].partialSig!;
      psbt.data.inputs[f.nameInput].partialSig = [
        { pubkey: other.publicKey, signature: sig.signature },
      ];
      assert.throws(() => psbt.finalizeInput(f.nameInput));
    });

    it('does not accept a 36-byte buffer as a public key', () => {
      const notAKey = Buffer.concat([
        Buffer.from([0x07]),
        Buffer.alloc(32, 1),
        Buffer.from([1, 2, 3]),
      ]);
      assert.throws(
        () => payments.p2pkh({ pubkey: notAKey, network }),
        /isPoint/,
      );
    });
  });

  describe('looking up a name with ElectrumX', () => {
    type NameIndexFixture = {
      description: string;
      name?: string;
      nameHex?: string;
      script: string;
      scriptHash: string;
    };

    nameIndexFixtures.valid.forEach((f: NameIndexFixture) => {
      const name =
        f.name !== undefined ? f.name : Buffer.from(f.nameHex!, 'hex');

      it(`builds the index script: ${f.description}`, () => {
        assert.strictEqual(
          nameops.nameIndexScript(name).toString('hex'),
          f.script,
        );
      });

      it(`hashes the index script: ${f.description}`, () => {
        assert.strictEqual(nameops.nameIndexScriptHash(name), f.scriptHash);
      });
    });

    it('encodes a string as UTF-8, the same as its bytes', () => {
      assert.strictEqual(
        nameops.nameIndexScriptHash('münchen'),
        nameops.nameIndexScriptHash(Buffer.from('münchen', 'utf8')),
      );
    });

    it('does not normalize: "é" as one or as two code points are two names', () => {
      const composed = 'café';
      const decomposed = 'café';
      assert.notStrictEqual(
        nameops.nameIndexScriptHash(composed),
        nameops.nameIndexScriptHash(decomposed),
      );
      assert.strictEqual(
        nameops.nameIndexScriptHash(decomposed.normalize('NFC')),
        nameops.nameIndexScriptHash(composed),
      );
    });

    it('rejects a name that is neither a Buffer nor a string', () => {
      assert.throws(
        () => nameops.nameIndexScript(42 as unknown as string),
        /Expected the name as a Buffer or a string/,
      );
    });
  });

  describe('building a name output', () => {
    /** The pushes of an OP_NAME_DOI prefix, read byte by byte. */
    const pushesOf = (script: Buffer): Buffer[] => {
      const found: Buffer[] = [];
      let position = 1;
      while (script[position] !== OPS.OP_2DROP) {
        const opcode = script[position++];
        let length = opcode;
        if (opcode === OPS.OP_PUSHDATA1) {
          length = script[position++];
        } else if (opcode === OPS.OP_PUSHDATA2) {
          length = script.readUInt16LE(position);
          position += 2;
        }
        found.push(script.slice(position, position + length));
        position += length;
      }
      return found;
    };
    const owner = payments.p2wpkh({ hash: Buffer.alloc(20, 7), network })
      .output!;

    [
      ...fixtures.registrations,
      ...fixtures.purchases,
      ...fixtures.updates,
    ].forEach(f => {
      it(`writes the name output Doichain Core accepted: ${f.description}`, () => {
        const outputs = Transaction.fromHex(f.acceptedTransaction).outs.filter(
          o => nameops.nameScriptOwner(o.script),
        );
        assert.strictEqual(outputs.length, 1);
        const [name, value] = pushesOf(outputs[0].script);
        const holder = nameops.nameScriptOwner(outputs[0].script)!;
        assert.strictEqual(
          nameops.nameDoiScript(name, value, holder).toString('hex'),
          outputs[0].script.toString('hex'),
        );
      });
    });

    it('encodes strings as UTF-8, the same as their bytes', () => {
      assert.ok(
        nameops
          .nameDoiScript('münchen', 'wert', owner)
          .equals(
            nameops.nameDoiScript(
              Buffer.from('münchen', 'utf8'),
              Buffer.from('wert', 'utf8'),
              owner,
            ),
          ),
      );
    });

    it('pushes an empty value, so the script still carries a name', () => {
      const script = nameops.nameDoiScript('hello', '', owner);
      assert.strictEqual(
        script.toString('hex'),
        '5a0568656c6c6f006d75' + owner.toString('hex'),
      );
      assert.ok(nameops.nameScriptOwner(script)!.equals(owner));
    });

    it('pushes a one-byte value instead of writing a number opcode', () => {
      const script = nameops.nameDoiScript('hello', Buffer.from([0x05]), owner);
      assert.strictEqual(
        script.toString('hex'),
        '5a0568656c6c6f01056d75' + owner.toString('hex'),
      );
      assert.ok(nameops.nameScriptOwner(script)!.equals(owner));
    });

    it('accepts the longest name and value that Doichain Core allows', () => {
      const script = nameops.nameDoiScript(
        Buffer.alloc(nameops.MAX_NAME_LENGTH, 0x61),
        Buffer.alloc(nameops.MAX_VALUE_LENGTH, 0x62),
        owner,
      );
      assert.strictEqual(script.slice(0, 3).toString('hex'), '5a4cff');
      assert.strictEqual(script.slice(258, 261).toString('hex'), '4dff03');
      assert.ok(nameops.nameScriptOwner(script)!.equals(owner));
    });

    it('refuses a name or a value that Doichain Core would reject', () => {
      assert.throws(
        () => nameops.nameDoiScript(Buffer.alloc(256), '', owner),
        /The name takes 256 bytes, more than 255/,
      );
      assert.throws(
        () => nameops.nameDoiScript('ä'.repeat(128), '', owner),
        /The name takes 256 bytes/,
      );
      assert.throws(
        () => nameops.nameDoiScript('hello', Buffer.alloc(1024), owner),
        /The value takes 1024 bytes, more than 1023/,
      );
    });

    it('refuses an empty owner script and one that carries a name itself', () => {
      assert.throws(
        () => nameops.nameDoiScript('hello', '', Buffer.alloc(0)),
        /Expected the owner's output script as a Buffer/,
      );
      assert.throws(
        () =>
          nameops.nameDoiScript(
            'hello',
            '',
            nameops.nameDoiScript('other', '', owner),
          ),
        /The owner's script carries a name itself/,
      );
    });

    it('does not normalize: "é" as one or as two code points are two names', () => {
      assert.notStrictEqual(
        nameops.nameDoiScript('café', '', owner).toString('hex'),
        nameops.nameDoiScript('café', '', owner).toString('hex'),
      );
    });

    it('lets address.fromOutputScript return the holder of the name', () => {
      const holder = payments.p2pkh({ hash: Buffer.alloc(20, 9), network });
      assert.strictEqual(
        address.fromOutputScript(
          nameops.nameDoiScript('hello', 'world', holder.output!),
          network,
        ),
        holder.address,
      );
    });
  });
});
