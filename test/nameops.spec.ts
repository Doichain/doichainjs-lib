import * as assert from 'assert';
import ECPairFactory from 'ecpair';
import { describe, it } from 'mocha';
import * as ecc from 'tiny-secp256k1';
import { Psbt } from '..';
import * as fixtures from './fixtures/nameops.json';

// nameScriptOwner exists only in the compiled src/, not in ts_src/
// eslint-disable-next-line @typescript-eslint/no-var-requires
const psbtutils = require('../src/psbt/psbtutils');

const ECPair = ECPairFactory(ecc);

const validator = (
  pubkey: Buffer,
  msghash: Buffer,
  signature: Buffer,
): boolean => ECPair.fromPublicKey(pubkey).verify(msghash, signature);

describe('name outputs', () => {
  describe('nameScriptOwner', () => {
    fixtures.nameScripts.forEach(f => {
      it(`finds the holder's script: ${f.description}`, () => {
        const owner = psbtutils.nameScriptOwner(Buffer.from(f.script, 'hex'));
        assert.strictEqual(owner.toString('hex'), f.owner);
      });
    });

    fixtures.notNameScripts.forEach(f => {
      it(`finds nothing: ${f.description}`, () => {
        assert.strictEqual(
          psbtutils.nameScriptOwner(Buffer.from(f.script, 'hex')),
          undefined,
        );
      });
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

  describe('selling a name: the holder signs the name input last', () => {
    fixtures.purchases.forEach(f => {
      it(`produces the transaction Doichain Core accepted: ${f.description}`, () => {
        const psbt = Psbt.fromBase64(f.psbt, { network: fixtures.network });
        const holder = ECPair.fromWIF(f.sellerWif, fixtures.network);
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
        p.description.includes('P2WPKH address'),
      )!;
      const psbt = Psbt.fromBase64(f.psbt, { network: fixtures.network });
      psbt.signInput(
        f.nameInput,
        ECPair.fromWIF(f.sellerWif, fixtures.network),
      );
      psbt.finalizeAllInputs();
      const input = psbt.extractTransaction().ins[f.nameInput];
      assert.strictEqual(input.script.length, 0);
      assert.strictEqual(input.witness.length, 2);
    });
  });
});
