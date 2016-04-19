var Q = require('q')
var extend = require('xtend')
var typeforce = require('typeforce')
var find = require('array-find')
var map = require('map-stream')
var constants = require('@tradle/constants')
var tutils = require('@tradle/utils')
var bitcoin = require('@tradle/bitcoinjs-lib')
var hrtime = require('monotonic-timestamp')
var Errors = require('./errors')
var Builder = require('@tradle/chained-obj').Builder
var Entry = require('logbase').Entry
var debug = require('debug')('tim-utils')
var NONCE = constants.NONCE
var CUR_HASH = constants.CUR_HASH
var ROOT_HASH = constants.ROOT_HASH
var PREV_HASH = constants.PREV_HASH
var TxData = require('@tradle/tx-data').TxData
var Entry = require('logbase').Entry
var MAX_ERRORS = 10

var PRIVATE_MSG_SCHEMA = {
  txType: 'Number',
  encryptedPermission: 'Buffer',
  encryptedData: 'Buffer',
  // txData: '?Buffer',
  v: '?String'
}

var PUBLIC_MSG_SCHEMA = {
  txType: 'Number',
  data: 'Buffer',
  // txData: '?Buffer',
  v: '?String'
}

var getMsgSchema = function (msg) {
  return msg.txType === TxData.types.public
    ? PUBLIC_MSG_SCHEMA
    : PRIVATE_MSG_SCHEMA
}

var utils = module.exports = {
  getMsgProps: function (info) {
    var schema = getMsgSchema(info)
    var props = utils.pick(info, Object.keys(schema))
    // if (info.encryptedKey) {
    //   props.txData = info.encryptedKey
    // }

    return props
  },

  validateMsg: function (msg) {
    try {
      typeforce(getMsgSchema(msg), msg)
      return true
    } catch (err) {
      console.log(err)
      return false
    }
  },

  msgToBuffer: function (msg) {
    if (!utils.validateMsg(msg)) throw new Error('invalid msg')

    var schema = getMsgSchema(msg)
    msg = extend(msg)
    for (var p in schema) {
      var type = schema[p]
      var val = msg[p]
      if (Buffer.isBuffer(val)) {
        msg[p] = val.toString('base64')
      }
    }

    return utils.toBuffer(msg, 'binary')
  },

  bufferToMsg: function (buf) {
    var msg = JSON.parse(buf.toString('binary'))
    var schema = getMsgSchema(msg)
    for (var p in schema) {
      var type = schema[p]
      var val = msg[p]
      if (val && type.indexOf('Buffer') !== -1) {
        msg[p] = new Buffer(val, 'base64')
      }
    }

    return msg
  },

  /**
   * get msg uid, currently:
   *  rootHash-curHash-senderRootHash-recipientRootHash
   *  OR
   *  rootHash-curHash-"public"
   * @param  {Entry} entry
   * @return {String}
   */
  getUID: function (entry) {
    var uid = utils.getEntryProp(entry, 'uid')
    if (uid) return uid

    var isPublic = utils.getEntryProp(entry, 'txType') === TxData.types.public
    var curHash = utils.getEntryProp(entry, CUR_HASH)
    var rootHash = utils.getEntryProp(entry, ROOT_HASH)
    if (!curHash || !rootHash) {
      throw new Error('missing one of required properties: ' + CUR_HASH + ', ' + ROOT_HASH)
    }

    var keyParts = [rootHash, curHash]
    if (isPublic) {
      keyParts.push('public')
    } else {
      var from = utils.getEntryProp(entry, 'from')
      from = from && from[ROOT_HASH]
      var to = utils.getEntryProp(entry, 'to')
      to = to && to[ROOT_HASH]
      if (!(from && to)) {
        throw new Error('unable to derive uid for entry: ' + JSON.stringify(entry))
      }

      keyParts.push(from, to)
    }

    return keyParts.join('-')
  },

  parseUID: function (uid) {
    var parts = uid.split('-')
    var parsed = {}
    parsed[ROOT_HASH] = parts.shift()
    parsed[CUR_HASH] = parts.shift()
    if (parts.indexOf('public') === -1) {
      parsed.from = parts.shift()
      parsed.to = parts.shift()
    } else {
      parsed.public = true
    }

    return parsed
  },

  toErrInstance: function (err) {
    var n = new Error(err.message)
    for (var p in err) {
      n[p] = err[p]
    }

    return n
  },

  pluck: function (arr, prop) {
    var vals = []
    for (var i = 0; i < arr.length; i++) {
      vals.push(arr[i][prop])
    }

    return vals
  },

  pick: function (obj) {
    var a = {}
    var props = Array.isArray(arguments[1])
      ? arguments[1]
      : [].slice.call(arguments, 1)

    for (var i = 0; i < props.length; i++) {
      var p = props[i]
      a[p] = obj[p]
    }

    return a
  },

  setUID: function (entry) {
    utils.setEntryProp(entry, 'uid', utils.getUID(entry))
  },

  firstKey: function (keys, where) {
    if (typeof where === 'string') where = { fingerprint: where }

    return find(keys, function (k) {
      for (var p in where) {
        var val = k.get ? k.get(p) : k[p]
        if (where[p] !== val) return
      }

      return true
    })
  },

  getDHTKey: function (obj, cb) {
    if (!obj[NONCE]) return Q.reject(new Error('missing nonce'))

    return new Builder()
      .data(obj)
      .build()
      .then(function (buf) {
        return Q.ninvoke(tutils, 'getStorageKeyFor', buf)
      })
      .then(function (key) {
        return key.toString('hex')
      })
  },

  addError: function (opts) {
    typeforce({
      group: 'String',
      entry: 'Object',
      error: 'Object'
    }, opts)

    var group = opts.group
    if (!(group in Errors.group)) {
      throw new Error('invalid error group')
    }

    var entry = opts.entry
    var errs = utils.getEntryProp(entry, 'errors') || {}
    errs[group] = errs[group] || []
    if (!errs[group]) errs[group] = []

    errs[group].push(utils.errToJSON(opts.error))
    utils.setEntryProp(entry, 'errors', errs)
    opts.error.progress = entry
  },

  getErrors: function (entry, group) {
    if (!(group in Errors.group)) {
      throw new Error('invalid error group')
    }

    var errs = utils.getEntryProp(entry, 'errors')
    return errs && errs[group]
  },

  countErrors: function (entry, group) {
    if (group) {
      var errs = utils.getErrors(entry, group)
      return errs ? errs.length : 0
    } else {
      var total = 0
      var errs = utils.getEntryProp(entry, 'errors')
      if (errs) {
        for (var g in errs) {
          total += errs[g].length
        }
      }

      return total
    }
  },

  updateEntry: function (older, newer, dontOverride) {
    var olderJSON = older.toJSON ? older.toJSON() : older
    var newerJSON = newer.toJSON ? newer.toJSON() : newer
    var mergedErrs = extend(olderJSON.errors)
    var newErrs = newerJSON.errors
    if (newErrs) {
      for (var group in newErrs) {
        var gErrs = mergedErrs[group] = (mergedErrs[group] || []).concat(newErrs[group])
        if (gErrs.length > MAX_ERRORS) {
          // keep first MAX_ERRORS - 1 plus the last one
          var last = gErrs.pop()
          gErrs = gErrs.slice(0, MAX_ERRORS - 1).concat(last)
          debug('avoiding saving too many errors to db')
        }
      }
    }

    var timesProcessed = (olderJSON.timesProcessed || 1) + 1
    var updated = Entry.fromJSON(olderJSON)
      .set(newerJSON)
      .set('timestamp', olderJSON.timestamp)
      .set('errors', mergedErrs)
      .set('timesProcessed', timesProcessed)

    if (dontOverride) {
      dontOverride.forEach(function (p) {
        if (olderJSON[p]) updated.set(p, olderJSON[p])
      })
    }

    return updated
  },

  now: Date.now.bind(Date),

  toObj: function (/* k1, v1, k2, v2... */) {
    var obj = {}
    for (var i = 0; i < arguments.length; i += 2) {
      obj[arguments[i]] = arguments[i + 1]
    }

    return obj
  },

  errToJSON: function (err) {
    if (!(err instanceof Error)) return err

    var json = {}

    Object.getOwnPropertyNames(err).forEach(function (key) {
      json[key] = err[key]
    })

    delete json.progress
    delete json.cause
    delete json.stack
    return json
  },

  toBuffer: function (data, enc) {
    if (typeof data.toBuffer === 'function') return data.toBuffer()
    if (Buffer.isBuffer(data)) return data
    if (typeof data === 'object') data = tutils.stringify(data)

    return new Buffer(data, enc || 'utf8')
  },

  getEntryProp: function (entry, prop) {
    return entry instanceof Entry ? entry.get(prop) : entry[prop]
  },

  setEntryProp: function (obj, name, val) {
    if (obj instanceof Entry) obj.set(name, val)
    else obj[name] = val
  },

  getOTRKeyFingerprint: function (identity) {
    return find(identity.pubkeys, function (k) {
      return k.type === 'dsa' && k.purpose === 'sign'
    }).fingerprint
  },

  keyForFingerprint: function (identityJSON, fingerprint) {
    return find(identityJSON.pubkeys, function (k) {
      return k.fingerprint === fingerprint
    })
  },

  updateChainedObj: function (obj, prevHash) {
    obj[ROOT_HASH] = obj[ROOT_HASH] || prevHash
    obj[PREV_HASH] = prevHash
    return obj
  },

  filterStream: function (filter) {
    return map(function (data, cb) {
      if (filter(data)) {
        return cb(null, data)
      } else {
        return cb()
      }
    })
  },

  promiseDelay: function (millis) {
    return Q.Promise(function (resolve) {
      setTimeout(resolve, millis)
    })
  },

  /**
   * rate limits a function that returns a promise
   * @param  {Function} fn     function that returns a promise
   * @param  {Integer}   millis [description]
   * @return {Function} rate limited fn
   */
  rateLimitPromiseFn: function (fn, millis) {
    var lastCalled = 0
    return function () {
      var now = utils.now()
      var timePassed = now - lastCalled
      var ctx = this
      var args = arguments
      if (timePassed >= millis) {
        return call()
      }

      var delay = millis - timePassed
      debug('rate limiting, delaying call by ' + delay + 'ms')
      return utils.promiseDelay(delay)
        .then(call)

      function call () {
        lastCalled = utils.now()
        return fn.apply(ctx, args)
      }
    }
  },

  jsonifyErrors: function (entry) {
    var errs = utils.getEntryProp(entry, 'errors')
    if (errs) {
      for (var group in errs) {
        errs[group] = errs[group].map(function (err) {
          if (!err.timestamp) err.timestamp = hrtime()

          return utils.errToJSON(err)
        })

        utils.setEntryProp(entry, 'errors', errs)
      }
    }

    return entry
  },

  jsonify: map.bind(null, function (entry, cb) {
    cb(null, utils.jsonifyErrors(entry))
  }),

  parseCommonBlockchainTxs: function (txInfos) {
    var parsed = [].concat(txInfos).map(function (txInfo) {
      var tx
      if (txInfo.txHex) tx = bitcoin.Transaction.fromHex(txInfo.txHex)
      else if (Buffer.isBuffer(txInfo.tx)) tx = bitcoin.Transaction.fromBuffer(txInfo.tx)
      else if (txInfo.tx instanceof bitcoin.Transaction) tx = txInfo.tx
      else throw new Error('unable to restore tx')

      return {
        txId: txInfo.txId,
        height: txInfo.height || txInfo.blockHeight,
        blockId: txInfo.blockId,
        confirmations: txInfo.confirmations || txInfo.__confirmations,
        blockTimestamp: txInfo.blockTimestamp || txInfo.__blockTimestamp,
        tx: tx
      }
    })

    return Array.isArray(txInfos) ? parsed : parsed[0]
  },

  argsToArray: function (args) {
    return Array.prototype.concat.apply([], args)
  }
}
