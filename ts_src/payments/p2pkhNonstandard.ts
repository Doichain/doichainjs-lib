import { nameScriptOwner } from '../nameops';
import { Payment, PaymentOpts } from './index';
import { p2pkh } from './p2pkh';

// output: {name operation} {pushes} OP_2DROP/OP_DROP OP_DUP OP_HASH160 {hash160(pubkey)} OP_EQUALVERIFY OP_CHECKSIG
// input: {signature} {pubkey}
/**
 * Creates a payment for a name output held by a Pay-to-Public-Key-Hash (P2PKH)
 * address.
 *
 * The name output is spent like the holder's P2PKH output, so `address`,
 * `hash`, `pubkey`, `signature` and `input` work as in {@link p2pkh} and are
 * checked against the owner's script behind the name prefix. `output` is the
 * whole name script; it is only set when it was passed in, because the name
 * and its value cannot be derived from the other fields.
 *
 * @param a - The payment object. `output`, if given, must be a name script
 * held by a P2PKH address.
 * @param opts - Optional payment options.
 * @returns The payment object of the holder, with `output` set to the name script.
 * @throws {TypeError} If `output` is not a name script held by a P2PKH address,
 * or if the other data does not match it.
 */
export function p2pkhNonstandard(a: Payment, opts?: PaymentOpts): Payment {
  const { output, ...holder } = a;
  let owner: Buffer | undefined;
  if (output !== undefined) {
    owner = nameScriptOwner(output);
    if (!owner) throw new TypeError('Output is not a name script');
  }

  const payment = p2pkh(owner ? { ...holder, output: owner } : holder, opts);
  payment.output = output;
  return payment;
}
