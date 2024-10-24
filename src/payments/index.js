'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.p2tr =
  exports.p2wsh =
  exports.p2wpkh =
  exports.p2sh =
  exports.p2pkh =
  exports.p2pk =
  exports.p2ms =
  exports.embed =
  exports.p2wpkhNonstandard =
    void 0;
const embed_1 = require('./embed');
Object.defineProperty(exports, 'embed', {
  enumerable: true,
  get: function () {
    return embed_1.p2data;
  },
});
const p2ms_1 = require('./p2ms');
Object.defineProperty(exports, 'p2ms', {
  enumerable: true,
  get: function () {
    return p2ms_1.p2ms;
  },
});
const p2pk_1 = require('./p2pk');
Object.defineProperty(exports, 'p2pk', {
  enumerable: true,
  get: function () {
    return p2pk_1.p2pk;
  },
});
const p2pkh_1 = require('./p2pkh');
Object.defineProperty(exports, 'p2pkh', {
  enumerable: true,
  get: function () {
    return p2pkh_1.p2pkh;
  },
});
const p2sh_1 = require('./p2sh');
Object.defineProperty(exports, 'p2sh', {
  enumerable: true,
  get: function () {
    return p2sh_1.p2sh;
  },
});
const p2wpkh_1 = require('./p2wpkh');
Object.defineProperty(exports, 'p2wpkh', {
  enumerable: true,
  get: function () {
    return p2wpkh_1.p2wpkh;
  },
});
const p2wsh_1 = require('./p2wsh');
Object.defineProperty(exports, 'p2wsh', {
  enumerable: true,
  get: function () {
    return p2wsh_1.p2wsh;
  },
});
const p2tr_1 = require('./p2tr');
Object.defineProperty(exports, 'p2tr', {
  enumerable: true,
  get: function () {
    return p2tr_1.p2tr;
  },
});
const p2wpkhNonstandard_1 = require('./p2wpkhNonstandard');
Object.defineProperty(exports, 'p2wpkhNonstandard', {
  enumerable: true,
  get: function () {
    return p2wpkhNonstandard_1.p2wpkhNonstandard;
  },
});
const p2pkhNonstandard_1 = require('./p2pkhNonstandard');
Object.defineProperty(exports, 'p2pkhNonstandard', {
  enumerable: true,
  get: function () {
    return p2pkhNonstandard_1.p2pkhNonstandard;
  },
});
// TODO
// witness commitment
