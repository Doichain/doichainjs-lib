'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.nameScriptOwner = exports.NAME_OPCODES = void 0;
/**
 * Name operations: OP_NAME_NEW (OP_1), OP_NAME_FIRSTUPDATE (OP_2),
 * OP_NAME_UPDATE (OP_3) and Doichain's OP_NAME_DOI (OP_10).
 */
exports.NAME_OPCODES = [0x51, 0x52, 0x53, 0x5a];
const OP_PUSHDATA1 = 0x4c;
const OP_PUSHDATA2 = 0x4d;
const OP_PUSHDATA4 = 0x4e;
const OP_NOP = 0x61;
const OP_2DROP = 0x6d;
const OP_DROP = 0x75;
/**
 * The script of the address that holds a name output:
 * `<name op> <pushes> OP_2DROP / OP_DROP ... <owner's script>`.
 *
 * Parsed like Namecoin's `CNameScript`: pushes up to the first `OP_DROP`,
 * `OP_2DROP` or `OP_NOP`, then any further `OP_DROP`, `OP_2DROP` or `OP_NOP`.
 * Pushes are read with their real length, so empty and one-byte values do not
 * shift the result, and an opcode that is not a push (such as `OP_1` for a
 * value) makes the script a non-name script, as in Doichain Core.
 *
 * @param script - The output script.
 * @returns The owner's script, or `undefined` if the script carries no name.
 */
function nameScriptOwner(script) {
  if (!Buffer.isBuffer(script) || !exports.NAME_OPCODES.includes(script[0]))
    return undefined;
  let position = 1;
  for (;;) {
    if (position >= script.length) return undefined;
    const opcode = script[position];
    if (opcode === OP_DROP || opcode === OP_2DROP || opcode === OP_NOP) break;
    position += 1;
    let length;
    if (opcode < OP_PUSHDATA1) {
      length = opcode;
    } else if (opcode === OP_PUSHDATA1) {
      if (position + 1 > script.length) return undefined;
      length = script.readUInt8(position);
      position += 1;
    } else if (opcode === OP_PUSHDATA2) {
      if (position + 2 > script.length) return undefined;
      length = script.readUInt16LE(position);
      position += 2;
    } else if (opcode === OP_PUSHDATA4) {
      if (position + 4 > script.length) return undefined;
      length = script.readUInt32LE(position);
      position += 4;
    } else {
      return undefined;
    }
    position += length;
  }
  while (
    position < script.length &&
    [OP_DROP, OP_2DROP, OP_NOP].includes(script[position])
  )
    position += 1;
  if (position >= script.length) return undefined;
  return script.slice(position);
}
exports.nameScriptOwner = nameScriptOwner;
