# Trust in Motion (TiM)

[![Build status](https://travis-ci.org/tradle/tim.svg)](https://travis-ci.org/tradle/tim)

TiM is Tradle's SDK that provides real-time messaging with an option for messages to be sealed on the blockchain. Mesages can be plain or structured messages. TiM is designed to work on mobiles, desktops and servers. Having one code base is important to minimize security reviews. 

TiM is designed to work with intermittent connections, common on mobile devices. For that it keeps an internal log of all actions and events, and resumes operations as soon as network connection is restored.

TiM's operations are covered by a patent. The tatent is filed only for defensive purposes, so you are welcome to use it in your open source projects.

_this module is used by [Tradle](https://github.com/tradle/about/wiki)_  
_this npm module's name was graciously donated by [Sean Robertson](https://www.npmjs.com/~spro)_

TiM provides a higher level API to a number of low level Tradle components. A UI is developed separately. Currently we focus on [React Native based UI](https://github.com/pgmemk/TiM) (on iOS, the Android version of TiM is in works), see the [preview video](https://www.youtube.com/watch?v=S66T0dPNn5I) and the [screenshots](https://docs.google.com/document/d/10eV6wgKr_vmfrXR4bDZ5XuylWJMNIJxziXM9T2CzCew). 

Prior to React Native, we developed the UI for Tim as a [Chrome App](https://github.com/tradle/chromeapp), see this [Identity verification video](https://www.youtube.com/watch?v=rrt8U4M-yMg) and a [work completion video](https://www.youtube.com/watch?v=mRnaw4pdifA). And prior to that we developed a very cool node-webkit-based [craigslist on-chain concept app](https://github.com/tradle/craigslist-on-chain) on TiM, but it is very much behind now. We plan work on desktop version of TiM soon, let us know if you are interested in these environments and we will prioritize this work for you.

## TiM uses the following Tradle components:

### [zlorp](https://github.com/tradle/zlorp)

[Zlorp](https://github.com/tradle/zlorp) is just the core chat module. It uses OTR for secure sessions (later will add support for Axolotl, used in [TextSecure](https://github.com/WhisperSystems/TextSecure/) and [Pond](https://pond.imperialviolet.org/)). Peer discovery today is done via bittorrent-dht. But DHT's regular announce messages leak IP/Port, so we will see if we can use BEP 44 to encrypt them. Zlorp provides UDP NAT traversal (firewall hole-punching), and a direct connection via rUDP (later via uTP). We plan to further investigate anonymous packet delivery, possibly via I2P (TOR does not support UDP).

### [bitkeeper-js](https://github.com/tradle/bitkeeper-js)

[Bitkeeper](https://github.com/tradle/bitkeeper-js) module uses [WebTorrent](https://github.com/feross/webtorrent) for storing and ensuring replication of arbitrary files. In Tradle, bitkeeper is used to store the original (encrypted) versions of on-chain objects (structured messages).

### [chained-obj](https://github.com/tradle/chained-obj)

[Chained-obj](https://github.com/tradle/chained-obj) is object builder and parser. Currently uses multipart to store arbitrary JSON data + attachments. These objects are later encrypted and put on-chain.

### [bitjoe-js](https://github.com/tradle/bitjoe-js) (to be renamed to: chainwriter)

A collection of requests that can be used to put an object "on chain": encrypt an object for its recipients, store/seed it from a bitkeeper node and put private links on blockchain.

### [tradle-constants](https://github.com/tradle/tradle-constants)

Wait for it...a bunch of constants

### [tradle-utils](https://github.com/tradle/tradle-utils)

A small set of crypto and torrent-related functions used by a number of Tradle components

### [Identity](https://github.com/tradle/identity)

[Identity](https://github.com/tradle/identity) is wrapper around an OpenName-compatible Identity schema. Used for building/parsing/validating identity objects.

### [kiki](https://github.com/tradle/kiki)

[kiki](https://github.com/tradle/kiki) Wrappers for DSA, EC, Bitcoin and other keys to provide a common API for signing/verifying/importing/exporting.

### [chainloader](https://github.com/tradle/chainloader)

Parses bitcoin transactions, attempts to process embedded links, loads intermediate files and original files from a bitkeeper node, decrypts and returns files and metadata. Implements stream.Transform.

### [simple-wallet](https://github.com/tradle/simple-wallet)

One-key [common blockchain](https://github.com/common-blockchain/common-blockchain) based wallet.

### [tradle-tx-data](https://github.com/tradle/tx-data)

For building/parsing bitcoin-transaction-embedded data

### [tradle-verifier](https://github.com/tradle/tradle-verifier)

Plugin-based verifier for on-chain objects. Implements several default plugins:  
    Signature Check  
    Identity verification  
    Previous Version verification  

## Exports

### Datalog

This module uses a datalog, a log-based database of experienced activity that you can write to and use to bootstrap your own databases from.

### Messaging API

Details to follow

## Usage

### Identity Identifiers

When you want to communicate with someone else on the network, you need to identify them uniquely. You can identify them by a fingerprint of one of their public keys, a public key string, or by their identity's root hash:

```js
// if this is the identity of your friend Bill:
{
  "_t": "tradle.Identity",
  "pubkeys": [
    {
      "fingerprint": "mvDNdZFbCCmnAPCBmLY91LnfKWoMH39Q2c",
      "networkName": "testnet",
      "purpose": "payment",
      "type": "bitcoin",
      "value": "03a45ede4be12a812e6e2ef1650ecbd8900152b1c6e3fe47f427ee5d9323759fe3"
    }
  ]
}

// the following are equivalent identifiers for Bill:
{
  fingerprint: 'mvDNdZFbCCmnAPCBmLY91LnfKWoMH39Q2c' 
}

{
  _r: 'whatever the infoHash of the above JSON object is'
}
```

### Initialization

```js
var path = require('path')
var levelup = require('levelup')
var leveldown = require('leveldown') // or asyncstorage-down or whatever you're using
var Blockchain = require('cb-blockr') // use tradle/cb-blockr fork
var Identity = require('@tradle/identity').Identity
var defaultKeySet = require('@tradle/identity').defaultKeySet
var Keeper = require('@tradle/http-keeper')
var Tim = require('tim')

// Setup components:
var networkName = 'testnet'
var blockchain = new Blockchain(networkName)
//   Create an identity or load an existing one (see tradle/identity readme):
var jack = new Identity()
var jackPrivKeys = defaultKeySet({ networkName: networkName })
jackPrivKeys.forEach(jack.addKey, jack)
//   to export private keys:    jackPrivKeys.forEach(k => k.exportPrivate())
//   to export public identity: jack.toJSON()

var myDir = path.join(process.env.HOME, 'myTradle')
//   content-address storage for your encrypted messages
var keeper = new Keeper({
  db: levelup(path.resolve(myDir, 'keeper'), { db: leveldown, valueEncoding: 'binary' }),
  fallbacks: ['http://tradle.io:25667']
})

// the API
var tim = new Tim({
  pathPrefix: path.join(myDir, 'tim'), // for playing nice with other levelup-based storage
  leveldown: leveldown,
  networkName: networkName,
  identity: jack,
  keys: jackPrivKeys, 
  keeper: keeper,
  blockchain: blockchain,
  // optional
  syncInterval: 600000 // how often to bother cb-blockr
})

// define a _send function that will determine the transport to use
// to deliver a message to a particular recipient
tim._send = function (recipientRootHash, msg, recipientInfo) {
  // return a Promise that resolves when the message is delivered
  // e.g. tim2.receiveMsg(msg, { _r: recipientRootHash })
  // 
  // tradle has several network-adapters for message delivery that you can use here. 
  // They are all open source on Github:
  //   tradle/zlorp - pure p2p messaging with OTR over UDP
  //   tradle/http-client & tradle/http-server
  //   tradle/ws-client & tradle/ws-relay - OTR over websockets
  //   
  //   latest, but unstable:
  //   tradle/sendy, tradle/sendy-otr
  //     reliable delivery over network of choice. 
  //     websockets implementation: tradle/sendy-ws, tradle/sendy-ws-relay
}

tim.send({
  to: [{ fingerprint: 'one of their fingerprints' }],
  msg: { hey: 'ho' },
  deliver: true,  
  chain: false
})

```

### Publishing your identity

```js
tim.publishMyIdentity()
```

### Sending messages

```js

tim.send({
  msg: Object|Buffer,
  // record message on chain
  chain: true,
  // send message p2p
  deliver: true,
  to: [
    identityIdentitifier // see Identity Identifiers
  ]
})

```

### Sharing existing messages (via the blockchain)

```js

var constants = require('@tradle/constants')
var curHash = '...' // the infoHash of the existing message, see tradle/utils `getStorageKeyFor`
var shareOpts = {
  // record message on chain
  chain: true,
  // send message p2p
  deliver: true,
  to: [
    identityIdentitifier // see Identity Identifiers  
  ]
}

shareOpts[constants.CUR_HASH] = curHash
tim.share(shareOpts)

```

### Publishing on chain

Same as sending a message, but use tim.publish instead of tim.send

```js

tim.publish({
  msg: Object|Buffer,
  to: [
    identityIdentitifier // see Identity Identifiers
  ]
})

```

## Messages

```js
var db = tim.messages() // read-only levelup instance

// e.g.
db.createValueStream()
  .on('data', function (err, msg) {
    // issue tim.lookupObject(msg) to get decrypted metadata and contents
  })
```

## Identities (loaded from chain)

```js
var db = tim.identities() // read-only levelup instance

// e.g.
db.createValueStream()
  .on('data', function (err, identityJSON) {
    // do something with "identity"
    // console.log('yo', identityJSON.name.firstName)
  })

// additional convenience methods
db.byRootHash(identityRootHash, callback)
db.byFingerprint(fingerprint, callback)
```

## Events

### tim.on('ready', function () {...})

Tim's ready to do stuff

### tim.on('chained', function (info) {...}

An object was successfully put on chain<sup>1</sup>

### tim.on('unchained', function (info) {...}

An object was read off chain<sup>1</sup>

### tim.on('message', function (info) {...}

A message was received peer-to-peer<sup>1</sup>

### tim.on('sent', function (info) {...}

A message was delivered<sup>1</sup>

### tim.on('resolved', function (info) {...}

An object was both received peer-to-peer and read from the chain<sup>1</sup>

<sup>1</sup> Note: does NOT contain chained-object contents. Use tim.lookupObject(info) to obtain those.
