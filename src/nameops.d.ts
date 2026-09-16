/// <reference types="node" />
/**
 * Name operations: OP_NAME_NEW (OP_1), OP_NAME_FIRSTUPDATE (OP_2),
 * OP_NAME_UPDATE (OP_3) and Doichain's OP_NAME_DOI (OP_10).
 */
export declare const NAME_OPCODES: number[];
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
export declare function nameScriptOwner(script: Buffer): Buffer | undefined;
