/**
 * Name operations in Doichain (and Namecoin) output scripts.
 *
 * A name output is `<name operation> <pushes> OP_2DROP / OP_DROP <owner's script>`.
 * The prefix carries the name and its value; the owner's script behind it is an
 * ordinary output script (P2PKH, P2WPKH, …) that decides who can spend the name.
 *
 * @packageDocumentation
 */
import { OPS } from './ops';

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
