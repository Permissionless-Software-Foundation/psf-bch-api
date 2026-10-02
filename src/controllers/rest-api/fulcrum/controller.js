/*
  REST API Controller for the /fulcrum routes.
*/

import wlogger from '../../../adapters/wlogger.js'
import BCHJS from '@psf/bch-js'
import config from '../../../config/index.js'

const bchjs = new BCHJS({ restURL: config.restURL })

class FulcrumRESTController {
  constructor (localConfig = {}) {
    this.adapters = localConfig.adapters
    if (!this.adapters) {
      throw new Error(
        'Instance of Adapters library required when instantiating Fulcrum REST Controller.'
      )
    }

    this.useCases = localConfig.useCases
    if (!this.useCases || !this.useCases.fulcrum) {
      throw new Error(
        'Instance of Fulcrum use cases required when instantiating Fulcrum REST Controller.'
      )
    }

    this.fulcrumUseCases = this.useCases.fulcrum

    // Bind functions
    this.root = this.root.bind(this)
    this.getBalance = this.getBalance.bind(this)
    this.balanceBulk = this.balanceBulk.bind(this)
    this.getUtxos = this.getUtxos.bind(this)
    this.utxosBulk = this.utxosBulk.bind(this)
    this.getTransactionDetails = this.getTransactionDetails.bind(this)
    this.transactionDetailsBulk = this.transactionDetailsBulk.bind(this)
    this.broadcastTransaction = this.broadcastTransaction.bind(this)
    this.getBlockHeaders = this.getBlockHeaders.bind(this)
    this.blockHeadersBulk = this.blockHeadersBulk.bind(this)
    this.getTransactions = this.getTransactions.bind(this)
    this.transactionsBulk = this.transactionsBulk.bind(this)
    this.getMempool = this.getMempool.bind(this)
    this.mempoolBulk = this.mempoolBulk.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  /**
   * @api {get} /v6/fulcrum/ Service status
   * @apiName FulcrumRoot
   * @apiGroup Fulcrum
   *
   * @apiDescription Returns the status of the fulcrum service.
   *
   * @apiSuccess {String} status Service identifier
   */
  async root (req, res) {
    return res.status(200).json({ status: 'fulcrum' })
  }

  /**
   * Validates and converts an address to cash address format
   * @param {string} address - Address to validate and convert
   * @returns {string} Cash address
   * @throws {Error} If address is invalid or not mainnet
   */
  _validateAndConvertAddress (address) {
    if (!address) {
      throw new Error('address is empty')
    }

    // Convert legacy to cash address
    const cashAddr = bchjs.Address.toCashAddress(address)

    // Ensure it's a valid BCH address
    try {
      bchjs.Address.toLegacyAddress(cashAddr)
    } catch (err) {
      // P2SH32 addresses (used by CashScript contracts) have a 32-byte hash,
      // and the legacy format can only hold 20 bytes. Accept them, but keep
      // rejecting other hash sizes and non-BCH prefixes.
      const { prefix, type, hash } = bchjs.Address._decode(cashAddr)
      const isP2sh32 = ['bitcoincash', 'bchtest', 'bchreg'].includes(prefix) &&
        type === 'P2SH' && hash.length === 32

      if (!isP2sh32) {
        throw new Error(`Invalid BCH address. Double check your address is valid: ${address}`)
      }
    }

    // Ensure it's mainnet (no testnet support)
    const isMainnet = bchjs.Address.isMainnetAddress(cashAddr)
    if (!isMainnet) {
      throw new Error('Invalid network. Only mainnet addresses are supported.')
    }

    return cashAddr
  }

  _isValidTxid (txid) {
    return typeof txid === 'string' && /^[a-fA-F0-9]{64}$/.test(txid)
  }

  _isCommonMissingTxError (err) {
    return err?.status === 404 &&
      typeof err?.message === 'string' &&
      err.message.includes('Transaction not found')
  }

  /**
   * @api {get} /v6/fulcrum/balance/:address Get balance for a single address
   * @apiName GetBalance
   * @apiGroup Fulcrum
   * @apiDescription Returns an object with confirmed and unconfirmed balance associated with an address.
   */
  async getBalance (req, res) {
    try {
      const address = req.params.address

      if (Array.isArray(address)) {
        return res.status(400).json({
          success: false,
          error: 'address can not be an array. Use POST for bulk upload.'
        })
      }

      const cashAddr = this._validateAndConvertAddress(address)

      const result = await this.fulcrumUseCases.getBalance({ address: cashAddr })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/balance Get balances for an array of addresses
   * @apiName GetBalances
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of balances associated with an array of addresses. Limited to 20 items per request.
   */
  async balanceBulk (req, res) {
    try {
      const addresses = req.body.addresses

      if (!Array.isArray(addresses)) {
        return res.status(400).json({
          success: false,
          error: 'addresses needs to be an array. Use GET for single address.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(addresses.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      // Validate and convert all addresses
      const validatedAddresses = []
      for (let i = 0; i < addresses.length; i++) {
        try {
          const cashAddr = this._validateAndConvertAddress(addresses[i])
          validatedAddresses.push(cashAddr)
        } catch (err) {
          return res.status(400).json({
            success: false,
            error: err.message
          })
        }
      }

      const result = await this.fulcrumUseCases.getBalances({ addresses: validatedAddresses })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/fulcrum/utxos/:address Get utxos for a single address
   * @apiName GetUtxos
   * @apiGroup Fulcrum
   * @apiDescription Returns an object with UTXOs associated with an address.
   */
  async getUtxos (req, res) {
    try {
      const address = req.params.address

      if (Array.isArray(address)) {
        return res.status(400).json({
          success: false,
          error: 'address can not be an array. Use POST for bulk upload.'
        })
      }

      const cashAddr = this._validateAndConvertAddress(address)

      const result = await this.fulcrumUseCases.getUtxos({ address: cashAddr })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/utxos Get utxos for an array of addresses
   * @apiName GetUtxosBulk
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of objects with UTXOs associated with an address. Limited to 20 items per request.
   */
  async utxosBulk (req, res) {
    try {
      const addresses = req.body.addresses

      if (!Array.isArray(addresses)) {
        return res.status(400).json({
          success: false,
          error: 'addresses needs to be an array. Use GET for single address.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(addresses.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      // Validate and convert all addresses
      const validatedAddresses = []
      for (let i = 0; i < addresses.length; i++) {
        try {
          const cashAddr = this._validateAndConvertAddress(addresses[i])
          validatedAddresses.push(cashAddr)
        } catch (err) {
          return res.status(400).json({
            success: false,
            error: err.message
          })
        }
      }

      const result = await this.fulcrumUseCases.getUtxosBulk({ addresses: validatedAddresses })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/fulcrum/tx/data/:txid Get transaction details for a TXID
   * @apiName GetTransactionDetails
   * @apiGroup Fulcrum
   * @apiDescription Returns an object with transaction details of the TXID
   */
  async getTransactionDetails (req, res) {
    try {
      const txid = req.params.txid

      if (!this._isValidTxid(txid)) {
        return res.status(400).json({
          success: false,
          error: 'txid must be a 64-character hex string'
        })
      }

      const result = await this.fulcrumUseCases.getTransactionDetails({ txid })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/tx/data Get transaction details for an array of TXIDs
   * @apiName GetTransactionDetailsBulk
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of objects with transaction details of an array of TXIDs. Limited to 20 items per request.
   */
  async transactionDetailsBulk (req, res) {
    try {
      const txids = req.body.txids
      const verbose = req.body.verbose !== undefined ? req.body.verbose : true

      if (!Array.isArray(txids)) {
        return res.status(400).json({
          success: false,
          error: 'txids needs to be an array. Use GET for single txid.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(txids.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      const result = await this.fulcrumUseCases.getTransactionDetailsBulk({ txids, verbose })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/tx/broadcast Broadcast a raw transaction
   * @apiName BroadcastTransaction
   * @apiGroup Fulcrum
   * @apiDescription Broadcast a raw transaction and return the transaction ID on success or error on failure.
   */
  async broadcastTransaction (req, res) {
    try {
      const txHex = req.body.txHex

      if (typeof txHex !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'txHex must be a string'
        })
      }

      const result = await this.fulcrumUseCases.broadcastTransaction({ txHex })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/fulcrum/block/headers/:height Get block headers
   * @apiName GetBlockHeaders
   * @apiGroup Fulcrum
   * @apiDescription Returns an array with block headers starting at the block height
   *
   * @apiParam {Number} height Block height
   * @apiParam {Number} count Number of block headers to return (query parameter, default: 1)
   */
  async getBlockHeaders (req, res) {
    try {
      const heightRaw = req.params.height
      const countRaw = req.query.count

      const height = Number(heightRaw)
      const count = countRaw === undefined ? 1 : Number(countRaw)

      if (Number.isNaN(height) || height < 0) {
        return res.status(400).json({
          success: false,
          error: 'height must be a positive number'
        })
      }

      if (Number.isNaN(count) || count < 0) {
        return res.status(400).json({
          success: false,
          error: 'count must be a positive number'
        })
      }

      const result = await this.fulcrumUseCases.getBlockHeaders({ height, count })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/block/headers Get block headers for an array of height + count pairs
   * @apiName GetBlockHeadersBulk
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of objects with block headers. Limited to 20 items per request.
   */
  async blockHeadersBulk (req, res) {
    try {
      const heights = req.body.heights

      if (!Array.isArray(heights)) {
        return res.status(400).json({
          success: false,
          error: 'heights needs to be an array. Use GET for single height.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(heights.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      // Validate each height object
      for (const item of heights) {
        if (!item || typeof item.height !== 'number' || typeof item.count !== 'number') {
          return res.status(400).json({
            success: false,
            error: 'Each height object must have numeric height and count properties'
          })
        }
        if (item.height < 0 || item.count < 0) {
          return res.status(400).json({
            success: false,
            error: 'height and count must be positive numbers'
          })
        }
      }

      const result = await this.fulcrumUseCases.getBlockHeadersBulk({ heights })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/fulcrum/transactions/:address Get transaction history for a single address
   * @apiName GetTransactions
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of historical transactions associated with an address. Results are returned in descending order (most recent TX first). Passing allTxs=true will return the entire transaction history, otherwise, only the last 100 TXIDs will be returned.
   *
   * @apiParam {String} address Address
   * @apiParam {Boolean} allTxs Optional: return all transactions (default: false, limited to 100)
   */
  async getTransactions (req, res) {
    try {
      const address = req.params.address
      let allTxs = false

      // Check if allTxs is in params or query
      if (req.params.allTxs) {
        allTxs = req.params.allTxs === 'true'
      } else if (req.query.allTxs) {
        allTxs = req.query.allTxs === 'true'
      }

      if (Array.isArray(address)) {
        return res.status(400).json({
          success: false,
          error: 'address can not be an array. Use POST for bulk upload.'
        })
      }

      const cashAddr = this._validateAndConvertAddress(address)

      // Extract bearer token from request header if present
      let bearerToken = null
      if (req.headers && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ')
        if (parts.length === 2 && parts[0] === 'Bearer') {
          bearerToken = parts[1]
        }
      }

      const result = await this.fulcrumUseCases.getTransactions({
        address: cashAddr,
        allTxs,
        bearerToken
      })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/transactions Get the transaction history for an array of addresses
   * @apiName GetTransactionsBulk
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of transactions associated with an array of addresses. Limited to 20 items per request. Passing allTxs=true will return the entire transaction history, otherwise, only the last 100 TXIDs will be returned.
   */
  async transactionsBulk (req, res) {
    try {
      const addresses = req.body.addresses
      const allTxs = req.body.allTxs === true

      if (!Array.isArray(addresses)) {
        return res.status(400).json({
          success: false,
          error: 'addresses needs to be an array. Use GET for single address.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(addresses.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      // Validate and convert all addresses
      const validatedAddresses = []
      for (let i = 0; i < addresses.length; i++) {
        try {
          const cashAddr = this._validateAndConvertAddress(addresses[i])
          validatedAddresses.push(cashAddr)
        } catch (err) {
          return res.status(400).json({
            success: false,
            error: err.message
          })
        }
      }

      // Extract bearer token from request header if present
      let bearerToken = null
      if (req.headers && req.headers.authorization) {
        const parts = req.headers.authorization.split(' ')
        if (parts.length === 2 && parts[0] === 'Bearer') {
          bearerToken = parts[1]
        }
      }

      const result = await this.fulcrumUseCases.getTransactionsBulk({
        addresses: validatedAddresses,
        allTxs,
        bearerToken
      })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/fulcrum/unconfirmed/:address Get unconfirmed utxos for a single address
   * @apiName GetMempool
   * @apiGroup Fulcrum
   * @apiDescription Returns an object with unconfirmed UTXOs associated with an address.
   */
  async getMempool (req, res) {
    try {
      const address = req.params.address

      if (Array.isArray(address)) {
        return res.status(400).json({
          success: false,
          error: 'address can not be an array. Use POST for bulk upload.'
        })
      }

      const cashAddr = this._validateAndConvertAddress(address)

      const result = await this.fulcrumUseCases.getMempool({ address: cashAddr })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/fulcrum/unconfirmed Get unconfirmed utxos for an array of addresses
   * @apiName GetMempoolBulk
   * @apiGroup Fulcrum
   * @apiDescription Returns an array of objects with unconfirmed UTXOs associated with an address. Limited to 20 items per request.
   */
  async mempoolBulk (req, res) {
    try {
      const addresses = req.body.addresses

      if (!Array.isArray(addresses)) {
        return res.status(400).json({
          success: false,
          error: 'addresses needs to be an array. Use GET for single address.'
        })
      }

      if (!this.adapters.fullNode.validateArraySize(addresses.length)) {
        return res.status(400).json({
          success: false,
          error: 'Array too large.'
        })
      }

      // Validate and convert all addresses
      const validatedAddresses = []
      for (let i = 0; i < addresses.length; i++) {
        try {
          const cashAddr = this._validateAndConvertAddress(addresses[i])
          validatedAddresses.push(cashAddr)
        } catch (err) {
          return res.status(400).json({
            success: false,
            error: err.message
          })
        }
      }

      const result = await this.fulcrumUseCases.getMempoolBulk({ addresses: validatedAddresses })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  handleError (err, res) {
    const status = err.status || 500
    const isCommonMissingTxError = this._isCommonMissingTxError(err)

    if (isCommonMissingTxError) {
      wlogger.info(`Fulcrum transaction not found: ${err.message}`)
    } else if (status >= 500) {
      wlogger.error('Error in FulcrumRESTController:', err)
    } else {
      wlogger.warn(`Fulcrum client error (${status}): ${err.message}`)
    }

    const message = err.message || 'Internal server error'

    return res.status(status).json({ error: message })
  }
}

export default FulcrumRESTController
