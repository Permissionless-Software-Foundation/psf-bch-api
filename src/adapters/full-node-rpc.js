/*
  Adapter library for interacting with a BCH full node over JSON-RPC.
*/

import axios from 'axios'
import wlogger from './wlogger.js'
import config from '../config/index.js'

class FullNodeRPCAdapter {
  constructor (localConfig = {}) {
    this.config = localConfig.config || config

    if (!this.config.fullNode || !this.config.fullNode.rpcBaseUrl) {
      throw new Error('Full node RPC configuration is required')
    }

    const {
      rpcBaseUrl,
      rpcUsername,
      rpcPassword,
      rpcTimeoutMs = 15000
    } = this.config.fullNode

    this.requestIdPrefix = this.config.fullNode.rpcRequestIdPrefix || 'psf-bch-api'

    this.http = axios.create({
      baseURL: rpcBaseUrl,
      timeout: rpcTimeoutMs,
      auth: {
        username: rpcUsername,
        password: rpcPassword
      }
    })

    this.defaultRequestPayload = {
      jsonrpc: '1.0'
    }
  }

  async call (method, params = [], requestId) {
    const id = requestId || `${this.requestIdPrefix}-${method}`
    console.log('full-node-rpc.js/call(): this.http.defaults.baseURL: ', this.http.defaults.baseURL)

    try {
      const response = await this.http.post('', {
        ...this.defaultRequestPayload,
        id,
        method,
        params
      })

      if (response.data && response.data.error) {
        const rpcError = this._formatError(response.data.error.message, 400)
        throw rpcError
      }

      return response.data.result
    } catch (err) {
      throw this._handleError(err)
    }
  }

  _handleError (err) {
    const { status, message } = this.decodeError(err)
    const error = new Error(message)
    error.status = status
    error.originalError = err
    return error
  }

  decodeError (err) {
    try {
      if (
        err.response &&
        err.response.data &&
        err.response.data.error &&
        err.response.data.error.message
      ) {
        return this._formatError(err.response.data.error.message, 400)
      }

      if (err.response && err.response.data) {
        return this._formatError(err.response.data, err.response.status || 500)
      }

      if (err.message) {
        if (err.message.includes('ENOTFOUND') || err.message.includes('ENETUNREACH') || err.message.includes('EAI_AGAIN')) {
          return this._formatError(
            'Network error: Could not communicate with full node or other external service.',
            503
          )
        }
      }

      if (err.code && (err.code === 'ECONNABORTED' || err.code === 'ECONNREFUSED')) {
        return this._formatError(
          'Network error: Could not communicate with full node or other external service.',
          503
        )
      }

      if (err.error && typeof err.error === 'string' && err.error.includes('429')) {
        return this._formatError('429 Too Many Requests', 429)
      }

      if (err.message) {
        return this._formatError(err.message, err.status || 422)
      }

      return this._formatError('Unhandled full node error', 500)
    } catch (decodeError) {
      wlogger.error('Unhandled error in FullNodeRPCAdapter.decodeError()', decodeError)
      return this._formatError('Internal server error', 500)
    }
  }

  validateArraySize (length) {
    const limit = 20
    return length <= limit
  }

  _formatError (message, status = 500) {
    return {
      message: message || 'Internal server error',
      status: status || 500
    }
  }
}

export default FullNodeRPCAdapter
