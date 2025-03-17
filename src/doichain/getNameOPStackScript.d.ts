/// <reference types="node" />

/**
 * @param nameId - The identifier for the name.
 * @param nameValue - The value associated with the name.
 * @param recipientAddress - The recipient's Doichain address.
 * @param network - The Doichain network (e.g., 'mainent', 'testnet', 'regtest').
 * @returns The compiled script as a Buffer.
 */
export function getNameOPStackScript(
  nameId: string,
  nameValue: string,
  recipientAddress: string,
  network: string
): Buffer;
