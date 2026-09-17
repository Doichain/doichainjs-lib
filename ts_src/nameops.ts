/**
 * Name operations in Doichain (and Namecoin) output scripts.
 *
 * A name output is `<name operation> <pushes> OP_2DROP / OP_DROP <owner's script>`.
 * The prefix carries the name and its value; the owner's script behind it is an
 * ordinary output script (P2PKH, P2WPKH, …) that decides who can spend the name.
 *
 * @packageDocumentation
 */
import * as bcrypto from './crypto';
import { OPS } from './ops';
import * as pushdata from './push_data';

/**
 * Opcodes that start a name operation: `OP_NAME_NEW` (`OP_1`),
 * `OP_NAME_FIRSTUPDATE` (`OP_2`), `OP_NAME_UPDATE` (`OP_3`) and Doichain's
 * `OP_NAME_DOI` (`OP_10`).
 */
export const NAME_OPCODES: readonly number[] = [
  OPS.OP_1,
  OPS.OP_2,
  OPS.OP_3,
  OPS.OP_10,
];

const SEPARATORS: readonly number[] = [OPS.OP_DROP, OPS.OP_2DROP, OPS.OP_NOP];

/**
 * Returns the owner's script of a name output: the output script behind the
 * name prefix.
 *
 * The prefix is parsed like Namecoin's `CNameScript`: pushes up to the first
 * `OP_DROP`, `OP_2DROP` or `OP_NOP`, then any further `OP_DROP`, `OP_2DROP` or
 * `OP_NOP`. Pushes are read with their real length, so empty and one-byte
 * values do not shift the result. An opcode that is not a push (such as `OP_1`
 * for a value) makes the script a non-name script, as in Doichain Core.
 *
 * @example
 * ```ts
 * const owner = nameops.nameScriptOwner(output);
 * if (owner) console.log(address.fromOutputScript(owner, network));
 * ```
 *
 * @param script - The output script.
 * @returns The owner's script, or `undefined` if the script carries no name.
 */
export function nameScriptOwner(script: Buffer): Buffer | undefined {
  if (!Buffer.isBuffer(script) || !NAME_OPCODES.includes(script[0]))
    return undefined;

  let position = 1;
  for (;;) {
    if (position >= script.length) return undefined;
    const opcode = script[position];
    if (SEPARATORS.includes(opcode)) break;
    position += 1;

    let length: number;
    if (opcode < OPS.OP_PUSHDATA1) {
      length = opcode;
    } else if (opcode === OPS.OP_PUSHDATA1) {
      if (position + 1 > script.length) return undefined;
      length = script.readUInt8(position);
      position += 1;
    } else if (opcode === OPS.OP_PUSHDATA2) {
      if (position + 2 > script.length) return undefined;
      length = script.readUInt16LE(position);
      position += 2;
    } else if (opcode === OPS.OP_PUSHDATA4) {
      if (position + 4 > script.length) return undefined;
      length = script.readUInt32LE(position);
      position += 4;
    } else {
      return undefined;
    }
    position += length;
  }

  while (position < script.length && SEPARATORS.includes(script[position]))
    position += 1;
  if (position >= script.length) return undefined;
  return script.slice(position);
}

/** Writes a push the way ElectrumX does: never as a number opcode. */
function push(data: Buffer): Buffer {
  const prefix = Buffer.allocUnsafe(pushdata.encodingLength(data.length));
  pushdata.encode(prefix, data.length, 0);
  return Buffer.concat([prefix, data]);
}

/**
 * Returns the script under which ElectrumX indexes every operation on a name:
 * `OP_NAME_UPDATE <name> <empty value> OP_2DROP OP_DROP OP_RETURN`.
 *
 * Pushes are written like ElectrumX's `Script.push_data`: a length byte, or
 * `OP_PUSHDATA1`, `OP_PUSHDATA2` or `OP_PUSHDATA4` with the length, never a
 * number opcode such as `OP_5`. A one-byte name therefore stays a push.
 *
 * A string is encoded as UTF-8 exactly as given. Names that look alike can
 * differ byte for byte, so normalize a name that a user types the way your
 * application registers names (for example with `name.normalize('NFC')`), and
 * pass the bytes of a name read from a transaction unchanged.
 *
 * @param name - The name, as bytes or as a string.
 * @returns The index script.
 */
export function nameIndexScript(name: Buffer | string): Buffer {
  let bytes: Buffer;
  if (typeof name === 'string') bytes = Buffer.from(name, 'utf8');
  else if (Buffer.isBuffer(name)) bytes = name;
  else throw new TypeError('Expected the name as a Buffer or a string');

  return Buffer.concat([
    Buffer.from([OPS.OP_3]), // OP_NAME_UPDATE
    push(bytes),
    push(Buffer.alloc(0)),
    Buffer.from([OPS.OP_2DROP, OPS.OP_DROP, OPS.OP_RETURN]),
  ]);
}

/**
 * Returns the Electrum script hash of a name's index script: its SHA-256 hash
 * with the bytes reversed, as hex. `blockchain.scripthash.get_history` with this
 * hash lists every transaction that operated on the name; the newest one holds
 * the name.
 *
 * @example
 * ```ts
 * const history = await electrum.request('blockchain.scripthash.get_history', [
 *   nameops.nameIndexScriptHash('doichain'),
 * ]);
 * ```
 *
 * @param name - The name, as bytes or as a string. See {@link nameIndexScript}.
 * @returns The script hash as hex.
 */
export function nameIndexScriptHash(name: Buffer | string): string {
  return Buffer.from(bcrypto.sha256(nameIndexScript(name)))
    .reverse()
    .toString('hex');
}
