/// <reference types="node" />
/**
 * bitcoin address decode and encode tools, include base58、bech32 and output script
 *
 * networks support bitcoin、bitcoin testnet and bitcoin regtest
 *
 * addresses support P2PKH、P2SH、P2WPKH、P2WSH、P2TR and so on
 *
 * @packageDocumentation
 */
import { Network } from './networks';
/** base58check decode result */
export interface Base58CheckResult {
    /** address hash */
    hash: Buffer;
    /** address version: 0x00 for P2PKH, 0x05 for P2SH */
    version: number;
}
/** bech32 decode result */
export interface Bech32Result {
    /** address version: 0x00 for P2WPKH、P2WSH, 0x01 for P2TR*/
    version: number;
    /** address prefix: bc for P2WPKH、P2WSH、P2TR */
    prefix: string;
    /** address data：20 bytes for P2WPKH, 32 bytes for P2WSH、P2TR */
    data: Buffer;
}
/**
 * decode address with base58 specification,  return address version and address hash if valid
 */
export declare function fromBase58Check(address: string): Base58CheckResult;
/**
 * decode address with bech32 specification,  return address version、address prefix and address data if valid
 */
export declare function fromBech32(address: string): Bech32Result;
/**
 * encode address hash to base58 address with version
 */
export declare function toBase58Check(hash: Buffer, version: number): string;
/**
 * encode address hash to bech32 address with version and prefix
 */
export declare function toBech32(data: Buffer, version: number, prefix: string): string;
/**
 * Returns the address an output script pays to.
 *
 * Standard scripts (P2PKH, P2SH, P2WPKH, P2WSH, P2TR and future segwit
 * versions) map to their address. A name output maps to the address of the
 * owner's script behind its name prefix, see {@link nameScriptOwner}.
 *
 * @param output - The output script.
 * @param network - The network whose address prefixes to use. Defaults to Bitcoin.
 * @returns The address.
 * @throws {Error} If the script does not pay to an address.
 */
export declare function fromOutputScript(output: Buffer, network?: Network): string;
/**
 * Returns the output script that pays to an address.
 *
 * @param address - A base58check or bech32/bech32m address.
 * @param network - The network the address must belong to. Defaults to Bitcoin.
 * @returns The output script.
 * @throws {Error} If the address is invalid or belongs to another network.
 */
export declare function toOutputScript(address: string, network?: Network): Buffer;
