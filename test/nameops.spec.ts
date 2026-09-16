import * as assert from 'assert';
import ECPairFactory from 'ecpair';
import { describe, it } from 'mocha';
import * as ecc from 'tiny-secp256k1';
import {
  address,
  initEccLib,
  payments,
  Psbt,
  script as bscript,
  Transaction,
} from '..';
import * as fixtures from './fixtures/nameops.json';

// The name operation helpers exist only in the compiled src/, not in ts_src/
// eslint-disable-next-line @typescript-eslint/no-var-requires
const nameops = require('../src/nameops');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const psbtutils = require('../src/psbt/psbtutils');

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
        assert.strictEqual(owner.toString('hex'), f.owner);
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
});
