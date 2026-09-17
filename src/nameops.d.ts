/// <reference types="node" />
/**
 * Opcodes that start a name operation: `OP_NAME_NEW` (`OP_1`),
 * `OP_NAME_FIRSTUPDATE` (`OP_2`), `OP_NAME_UPDATE` (`OP_3`) and Doichain's
 * `OP_NAME_DOI` (`OP_10`).
 */
export declare const NAME_OPCODES: readonly number[];
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
export declare function nameScriptOwner(script: Buffer): Buffer | undefined;
