/*
  REST API Controller for the /slp routes.
*/

import wlogger from '../../../adapters/wlogger.js'
import BCHJS from '@psf/bch-js'
import config from '../../../config/index.js'

const bchjs = new BCHJS({ restURL: config.restURL })

class SlpRESTController {
  constructor (localConfig = {}) {
    this.adapters = localConfig.adapters
    if (!this.adapters) {
      throw new Error(
        'Instance of Adapters library required when instantiating SLP REST Controller.'
      )
    }

    this.useCases = localConfig.useCases
    if (!this.useCases || !this.useCases.slp) {
      throw new Error(
        'Instance of SLP use cases required when instantiating SLP REST Controller.'
      )
    }

    this.slpUseCases = this.useCases.slp

    // Bind functions
    this.root = this.root.bind(this)
    this.getStatus = this.getStatus.bind(this)
    this.getAddress = this.getAddress.bind(this)
    this.getTxid = this.getTxid.bind(this)
    this.getTokenStats = this.getTokenStats.bind(this)
    this.getTokenData = this.getTokenData.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  /**
   * @api {get} /v6/slp/ Service status
   * @apiName SlpRoot
   * @apiGroup SLP
   *
   * @apiDescription Returns the status of the SLP service.
   *
   * @apiSuccess {String} status Service identifier
   */
  async root (req, res) {
    return res.status(200).json({ status: 'psf-slp-indexer' })
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
    const cashAddr = bchjs.SLP.Address.toCashAddress(address)

    // Ensure it's a valid BCH address
    try {
      bchjs.SLP.Address.toLegacyAddress(cashAddr)
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

  /**
   * @api {get} /v6/slp/status Get indexer status
   * @apiName GetStatus
   * @apiGroup SLP
   * @apiDescription Returns the status of the SLP indexer.
   */
  async getStatus (req, res) {
    try {
      const result = await this.slpUseCases.getStatus()
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/slp/address Get SLP balance for address
   * @apiName GetAddress
   * @apiGroup SLP
   * @apiDescription Returns SLP balance for an address.
   */
  async getAddress (req, res) {
    try {
      const address = req.body.address

      if (!address || address === '') {
        return res.status(400).json({
          success: false,
          error: 'address can not be empty'
        })
      }

      // Validate and convert address
      const cashAddr = this._validateAndConvertAddress(address)

      const result = await this.slpUseCases.getAddress({ address: cashAddr })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/slp/txid Get SLP transaction data
   * @apiName GetTxid
   * @apiGroup SLP
   * @apiDescription Returns SLP transaction data for a TXID.
   */
  async getTxid (req, res) {
    try {
      const txid = req.body.txid

      if (!txid || txid === '') {
        return res.status(400).json({
          success: false,
          error: 'txid can not be empty'
        })
      }

      if (txid.length !== 64) {
        return res.status(400).json({
          success: false,
          error: 'This is not a txid'
        })
      }

      const result = await this.slpUseCases.getTxid({ txid })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/slp/token Get token statistics
   * @apiName GetTokenStats
   * @apiGroup SLP
   * @apiDescription Returns statistics for a single SLP token.
   */
  async getTokenStats (req, res) {
    try {
      const tokenId = req.body.tokenId

      if (!tokenId || tokenId === '') {
        return res.status(400).json({
          success: false,
          error: 'tokenId can not be empty'
        })
      }

      // Flag to toggle tx history of the token
      const withTxHistory = req.body.withTxHistory === true

      const result = await this.slpUseCases.getTokenStats({ tokenId, withTxHistory })
      return res.status(200).json(result)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {post} /v6/slp/token/data Get token data
   * @apiName GetTokenData
   * @apiGroup SLP
   * @apiDescription Get mutable and immutable data if the token contains them.
   */
  async getTokenData (req, res) {
    try {
      const tokenId = req.body.tokenId

      if (!tokenId || tokenId === '') {
        return res.status(400).json({
          success: false,
          error: 'tokenId can not be empty'
        })
      }

      // Flag to toggle tx history of the token
      const withTxHistory = req.body.withTxHistory === true

      const result = await this.slpUseCases.getTokenData({ tokenId, withTxHistory })
      return res.status(200).json(result)
    } catch (err) {
      console.log('Error in /v6/slp/token/data getTokenData(): ', err)
      return this.handleError(err, res)
    }
  }

  handleError (err, res) {
    const isCommonMissingTxError =
      err?.status === 404 &&
      typeof err?.message === 'string' &&
      err.message.includes('Key not found in database')

    if (!isCommonMissingTxError) {
      wlogger.error('Error in SlpRESTController:', err)
    }

    const status = err.status || 500
    const message = err.message || 'Internal server error'

    return res.status(status).json({ error: message })
  }
}

export default SlpRESTController
