
var debug = require('debug')('txDB')
var typeforce = require('typeforce')
var levelup = require('levelup')
var LiveStream = require('level-live-stream')
// var CUR_HASH = constants.CUR_HASH
var lb = require('logbase')
var LogBase = lb.Simple
var EventType = require('./eventType')
var rebuf = require('./rebufEncoding')
var DEBUG = require('./debug')
var utils = require('./utils')
var ENTRY_TIMEOUT = DEBUG ? false : 5000

module.exports = function createTxDB (path, options) {
  typeforce('String', path)
  typeforce({
    leveldown: 'Function',
    log: 'Log'
  }, options)

  var db = levelup(path, {
    db: options.leveldown,
    valueEncoding: rebuf
  })

  db = LogBase({
    db: db,
    log: options.log,
    process: processEntry,
    timeout: typeof options.timeout === 'undefined' ? ENTRY_TIMEOUT : options.timeout,
    autostart: options.autostart,
  })

  var topics = [
    EventType.tx.new,
    EventType.tx.confirmation,
    EventType.tx.ignore,
    EventType.tx.watch,
    EventType.chain.writeSuccess,
    EventType.chain.readSuccess,
    EventType.chain.readError
  ]

  LiveStream.install(db)
  return db

  function myDebug () {
    var args = [].slice.call(arguments)
    args.unshift(db.name)
    return debug.apply(null, args)
  }

  function processEntry (entry, cb) {
    var eType = entry.get('type')
    if (topics.indexOf(eType) === -1) return cb()

    entry = entry.clone()

    var now = Date.now()

    switch (eType) {
      case EventType.tx.new:
        entry.set('dateDetected', now)
        myDebug('new tx')
        return updateOrPut(entry, cb)
      case EventType.tx.confirmation:
        // this may be the first confirmation
        // for a tx we put on chain
        entry.set('dateDetected', now)
        myDebug('confirmation tx')
        return updateOrPut(entry, cb)
      case EventType.tx.watch:
        entry.set('ignore', false)
        entry.set('watch', true)
        return updateOrPut(entry, cb)
      case EventType.tx.ignore:
        // this may be the first confirmation
        // for a tx we put on chain
        entry.set('dateDetected', now)
        entry.set('ignore', true)
        entry.set('watch', false)
        return updateOrPut(entry, cb)
      case EventType.chain.writeSuccess:
        entry.set('dateChained', now)
        myDebug('chain write success')
        return updateOrPut(entry, cb)
      case EventType.chain.readSuccess:
        entry.set('dateUnchained', now)
        myDebug('chain read success')
        return updateOrPut(entry, cb)
      case EventType.chain.readError:
        myDebug('chain read error')
        return updateOrPut(entry, cb)
      default:
        myDebug('ignoring entry of type', eType)
        return cb()
    }
  }

  function updateOrPut (entry, cb) {
    var key = getKey(entry)
    return db.get(key, function (err, root) {
      if (!db.isOpen()) return cb()
      if (err) {
        if (err.notFound) return put(entry, cb)
        else throw err // should never happen
      }

      doUpdate(root, entry, cb)
    })
  }

  // function update (entry, cb) {
  //   var key = getKey(entry)
  //   return db.get(key, function (err, root) {
  //     if (!db.isOpen()) return cb()
  //     if (err) return cb(err)

  //     // wtf is this?
  //     doUpdate(root, entry, cb)
  //   })
  // }

  function doUpdate (root, entry, cb) {
    entry = utils.updateEntry(root, entry, ['dateDetected'])

    // console.log('overwriting', root, 'with', entryJSON, 'resulting in', entry.toJSON())
    put(entry, cb)
  }

  function put (entry, cb) {
    myDebug('putting', entry.get('type'), entry.get('txId'))
    entry.unset('type')
    cb([{
      type: 'put',
      key: getKey(entry),
      value: entry.toJSON()
    }])
  }
}

function getKey (entry) {
  var txId = entry.get('txId')
  if (txId) return txId

  throw new Error('missing "txId"')
}
