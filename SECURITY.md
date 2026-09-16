# Security policy

## Reporting a vulnerability

Please report security problems privately through a [security advisory](https://github.com/Doichain/doichainjs-lib/security/advisories/new) for this repository, not in a public issue or pull request.

Useful details:

- what an attacker can do, and what they need for it (for example a PSBT they build and a wallet signs),
- the version or commit you tested,
- a script, test or transaction that shows the problem.

## Supported versions

Fixes go into the newest release of `@doichain/doichainjs-lib`. Wallets and apps should update to it.

## Scope

This library builds, signs and checks Doichain transactions. Problems in bitcoinjs-lib itself that also affect this fork are in scope as well; if they are not Doichain-specific, please also report them to [bitcoinjs-lib](https://github.com/bitcoinjs/bitcoinjs-lib).
