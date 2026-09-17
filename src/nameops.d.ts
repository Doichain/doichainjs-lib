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
export declare function nameIndexScript(name: Buffer | string): Buffer;
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
export declare function nameIndexScriptHash(name: Buffer | string): string;
