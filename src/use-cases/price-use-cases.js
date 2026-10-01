/*
  Use cases for price-related operations.
*/

// Global npm libraries
import axios from 'axios'
import SlpWallet from 'minimal-slp-wallet'
import PSFFPP from 'psffpp'

// Local libraries
import wlogger from '../adapters/wlogger.js'
import config from '../config/index.js'

class PriceUseCases {
  constructor (localConfig = {}) {
    this.adapters = localConfig.adapters

    if (!this.adapters) {
      throw new Error('Adapters instance required when instantiating Price use cases.')
    }

    // Get config
    this.config = localConfig.config || config

    // Bitstamp API URL for BCH/USD
    this.bchBitstampPriceUrl =
      'https://www.bitstamp.net/api/v2/ticker/bchusd/'

    // Allow axios to be injected for testing
    this.axios = localConfig.axios || axios

    this.psfLiquidityPriceKeys = [
      'usdPerBCH',
      'bchBalance',
      'tokenBalance',
      'usdPerToken'
    ]
  }

  /**
   * Get the USD price of BCH from Bitstamp.
   * @returns {Promise<number>} The USD price of BCH
   */
  async getBCHUSD () {
    try {
      // Request options
      const opt = {
        method: 'get',
        baseURL: this.bchBitstampPriceUrl,
        timeout: 15000
      }

      const response = await this.axios.request(opt)

      const price = Number(response.data.last)

      return price
    } catch (err) {
      wlogger.error('Error in PriceUseCases.getBCHUSD()', err)
      throw err
    }
  }

  /**
   * Get the PSF price for writing to the PSFFPP.
   * Returns the price to pin 1MB of content to the PSFFPP pinning
   * network on IPFS. The price is denominated in PSF tokens.
   * @returns {Promise<number>} The write price in PSF tokens
   */
  async getPsffppWritePrice () {
    try {
      const wallet = new SlpWallet(undefined, {
        interface: 'rest-api',
        restURL: this.config.restURL
      })
      await wallet.walletInfoPromise

      const psffpp = new PSFFPP({ wallet })

      const writePrice = await psffpp.getMcWritePrice()

      return writePrice
    } catch (err) {
      wlogger.error('Error in PriceUseCases.getPsffppWritePrice()', err)
      throw err
    }
  }

  /**
   * Proxies PSF token liquidity spot price from the token-liquidity app (GET /price).
   * @returns {Promise<Object>} usdPerBCH, bchBalance, tokenBalance, usdPerToken
   */
  async getPsfLiquidityPrice () {
    try {
      const proxy = this.config.psfLiquidityProxy
      if (!proxy || !proxy.enabled) {
        const err = new Error('PSF liquidity price proxy is disabled')
        err.status = 503
        throw err
      }

      const baseUrl = String(proxy.baseUrl).replace(/\/$/, '')
      const fullUrl = `${baseUrl}/price`

      const opt = {
        method: 'get',
        url: fullUrl,
        timeout: 15000
      }

      const response = await this.axios.request(opt)
      const data = response.data

      if (
        !data ||
        typeof data !== 'object' ||
        Array.isArray(data) ||
        !this.psfLiquidityPriceKeys.every(
          (k) => typeof data[k] === 'number' && !Number.isNaN(data[k])
        )
      ) {
        const err = new Error('Invalid response from PSF liquidity price service')
        err.status = 502
        throw err
      }

      return {
        usdPerBCH: data.usdPerBCH,
        bchBalance: data.bchBalance,
        tokenBalance: data.tokenBalance,
        usdPerToken: data.usdPerToken
      }
    } catch (err) {
      wlogger.error('Error in PriceUseCases.getPsfLiquidityPrice()', err)
      throw err
    }
  }
}

export default PriceUseCases
