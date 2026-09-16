'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.p2wpkhNonstandard = void 0;
const nameops_1 = require('../nameops');
const p2wpkh_1 = require('./p2wpkh');
// output: {name operation} {pushes} OP_2DROP/OP_DROP OP_0 {hash160(pubkey)}
// witness: {signature} {pubkey}
// input: <>
/**
 * Creates a payment for a name output held by a Pay-to-Witness-Public-Key-Hash
 * (P2WPKH) address.
 *
 * The name output is spent like the holder's P2WPKH output, so `address`,
 * `hash`, `pubkey`, `signature`, `input` and `witness` work as in
 * {@link p2wpkh} and are checked against the owner's script behind the name
 * prefix. `output` is the whole name script; it is only set when it was passed
 * in, because the name and its value cannot be derived from the other fields.
 *
 * @param a - The payment object. `output`, if given, must be a name script
 * held by a P2WPKH address.
 * @param opts - Optional payment options.
 * @returns The payment object of the holder, with `output` set to the name script.
 * @throws {TypeError} If `output` is not a name script held by a P2WPKH
 * address, or if the other data does not match it.
 */
function p2wpkhNonstandard(a, opts) {
  const { output, ...holder } = a;
  let owner;
  if (output !== undefined) {
    owner = (0, nameops_1.nameScriptOwner)(output);
    if (!owner) throw new TypeError('Output is not a name script');
  }
  const payment = (0, p2wpkh_1.p2wpkh)(
    owner ? { ...holder, output: owner } : holder,
    opts,
  );
  payment.output = output;
  return payment;
}
exports.p2wpkhNonstandard = p2wpkhNonstandard;
