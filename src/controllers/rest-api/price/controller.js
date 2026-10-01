/*
  REST API Controller for the /price routes.
*/

import wlogger from '../../../adapters/wlogger.js'

class PriceRESTController {
  constructor (localConfig = {}) {
    this.adapters = localConfig.adapters
    if (!this.adapters) {
      throw new Error(
        'Instance of Adapters library required when instantiating Price REST Controller.'
      )
    }

    this.useCases = localConfig.useCases
    if (!this.useCases || !this.useCases.price) {
      throw new Error(
        'Instance of Price use cases required when instantiating Price REST Controller.'
      )
    }

    this.priceUseCases = this.useCases.price

    // Bind functions
    this.root = this.root.bind(this)
    this.getBCHUSD = this.getBCHUSD.bind(this)
    this.getPsffppWritePrice = this.getPsffppWritePrice.bind(this)
    this.getPsfLiquidityPrice = this.getPsfLiquidityPrice.bind(this)
    this.handleError = this.handleError.bind(this)
  }

  /**
   * @api {get} /v6/price/ Service status
   * @apiName PriceRoot
   * @apiGroup Price
   *
   * @apiDescription Returns the status of the price service.
   *
   * @apiSuccess {String} status Service identifier
   */
  async root (req, res) {
    return res.status(200).json({ status: 'price' })
  }

  /**
   * @api {get} /v6/price/bchusd Get the USD price of BCH
   * @apiName GetBCHUSD
   * @apiGroup Price
   * @apiDescription Get the USD price of BCH from Bitstamp.
   *
   * @apiExample Example usage:
   * curl -X GET "https://api.fullstack.cash/v6/price/bchusd" -H "accept: application/json"
   *
   * @apiSuccess {Number} usd The USD price of BCH
   */
  async getBCHUSD (req, res) {
    try {
      const price = await this.priceUseCases.getBCHUSD()
      return res.status(200).json({ usd: price })
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/price/psffpp Get the PSF price for writing to the PSFFPP
   * @apiName GetPsffppWritePrice
   * @apiGroup Price
   * @apiDescription Get the price to pin 1MB of content to the PSFFPP pinning
   * network on IPFS. The price is denominated in PSF tokens.
   *
   * @apiExample Example usage:
   * curl -X GET "https://api.fullstack.cash/v6/price/psffpp" -H "accept: application/json"
   *
   * @apiSuccess {Number} writePrice The price in PSF tokens to write 1MB to PSFFPP
   */
  async getPsffppWritePrice (req, res) {
    try {
      const writePrice = await this.priceUseCases.getPsffppWritePrice()
      return res.status(200).json({ writePrice })
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  /**
   * @api {get} /v6/price/psf PSF token liquidity spot price (proxied)
   * @apiName GetPsfLiquidityPrice
   * @apiGroup Price
   * @apiDescription Proxies GET /price from the PSF token liquidity app when
   * `PSF_LIQUIDITY_PROXY_ENABLED` is true. Returns 503 when the proxy is disabled.
   *
   * @apiExample Example usage:
   * curl -X GET "https://api.fullstack.cash/v6/price/psf" -H "accept: application/json"
   *
   * @apiSuccess {Number} usdPerBCH USD price per 1 BCH
   * @apiSuccess {Number} bchBalance BCH balance (liquidity app)
   * @apiSuccess {Number} tokenBalance Effective PSF token balance
   * @apiSuccess {Number} usdPerToken USD price per 1 PSF token
   */
  async getPsfLiquidityPrice (req, res) {
    try {
      const payload = await this.priceUseCases.getPsfLiquidityPrice()
      return res.status(200).json(payload)
    } catch (err) {
      return this.handleError(err, res)
    }
  }

  handleError (err, res) {
    wlogger.error('Error in PriceRESTController:', err)

    const status = err.status || 500
    const message = err.message || 'Internal server error'

    return res.status(status).json({ error: message })
  }
}

export default PriceRESTController
