'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.nameScriptOwner = exports.NAME_OPCODES = void 0;
/**
 * Name operations in Doichain (and Namecoin) output scripts.
 *
 * A name output is `<name operation> <pushes> OP_2DROP / OP_DROP <owner's script>`.
 * The prefix carries the name and its value; the owner's script behind it is an
 * ordinary output script (P2PKH, P2WPKH, …) that decides who can spend the name.
 *
 * @packageDocumentation
 */
const ops_1 = require('./ops');
/**
 * Opcodes that start a name operation: `OP_NAME_NEW` (`OP_1`),
 * `OP_NAME_FIRSTUPDATE` (`OP_2`), `OP_NAME_UPDATE` (`OP_3`) and Doichain's
 * `OP_NAME_DOI` (`OP_10`).
 */
exports.NAME_OPCODES = [
  ops_1.OPS.OP_1,
  ops_1.OPS.OP_2,
  ops_1.OPS.OP_3,
  ops_1.OPS.OP_10,
];
const SEPARATORS = [ops_1.OPS.OP_DROP, ops_1.OPS.OP_2DROP, ops_1.OPS.OP_NOP];
/** How many pushes each name operation takes, as checked by Doichain Core. */
const ARGUMENT_COUNTS = {
  [ops_1.OPS.OP_1]: 1,
  [ops_1.OPS.OP_2]: 3,
  [ops_1.OPS.OP_3]: 2,
  [ops_1.OPS.OP_10]: 2, // OP_NAME_DOI <name> <value>
};
/**
 * Returns the owner's script of a name output: the output script behind the
 * name prefix.
 *
 * The prefix is parsed like Namecoin's `CNameScript`: pushes up to the first
 * `OP_DROP`, `OP_2DROP` or `OP_NOP`, then any further `OP_DROP`, `OP_2DROP` or
 * `OP_NOP`. Pushes are read with their real length, so empty and one-byte
 * values do not shift the result. As in Doichain Core, the script is a non-name
 * script if the prefix holds an opcode that is not a push (such as `OP_1` for a
 * value) or the wrong number of pushes for its operation: one for
 * `OP_NAME_NEW`, three for `OP_NAME_FIRSTUPDATE`, two for `OP_NAME_UPDATE` and
 * `OP_NAME_DOI`.
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
function nameScriptOwner(script) {
  if (!Buffer.isBuffer(script) || !exports.NAME_OPCODES.includes(script[0]))
    return undefined;
  let position = 1;
  let pushes = 0;
  for (;;) {
    if (position >= script.length) return undefined;
    const opcode = script[position];
    if (SEPARATORS.includes(opcode)) break;
    position += 1;
    pushes += 1;
    let length;
    if (opcode < ops_1.OPS.OP_PUSHDATA1) {
      length = opcode;
    } else if (opcode === ops_1.OPS.OP_PUSHDATA1) {
      if (position + 1 > script.length) return undefined;
      length = script.readUInt8(position);
      position += 1;
    } else if (opcode === ops_1.OPS.OP_PUSHDATA2) {
      if (position + 2 > script.length) return undefined;
      length = script.readUInt16LE(position);
      position += 2;
    } else if (opcode === ops_1.OPS.OP_PUSHDATA4) {
      if (position + 4 > script.length) return undefined;
      length = script.readUInt32LE(position);
      position += 4;
    } else {
      return undefined;
    }
    position += length;
  }
  if (pushes !== ARGUMENT_COUNTS[script[0]]) return undefined;
  while (position < script.length && SEPARATORS.includes(script[position]))
    position += 1;
  if (position >= script.length) return undefined;
  return script.slice(position);
}
exports.nameScriptOwner = nameScriptOwner;
