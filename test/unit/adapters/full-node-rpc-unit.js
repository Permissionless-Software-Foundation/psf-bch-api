/*
  Unit tests for FullNodeRPCAdapter.
*/

import { assert } from 'chai'
import sinon from 'sinon'
import axios from 'axios'

import FullNodeRPCAdapter from '../../../src/adapters/full-node-rpc.js'

describe('#full-node-rpc.js', () => {
  let sandbox
  let axiosCreateStub
  let mockAxiosInstance

  const baseConfig = {
    fullNode: {
      rpcBaseUrl: 'http://127.0.0.1:8332',
      rpcUsername: 'user',
      rpcPassword: 'pass',
      rpcTimeoutMs: 1000,
      rpcRequestIdPrefix: 'test'
    }
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockAxiosInstance = {
      defaults: {
        baseURL: baseConfig.fullNode.rpcBaseUrl
      },
      post: sandbox.stub()
    }
    axiosCreateStub = sandbox.stub(axios, 'create').returns(mockAxiosInstance)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#constructor()', () => {
    it('should throw if full node config is missing', () => {
      assert.throws(() => {
        // eslint-disable-next-line no-new
        new FullNodeRPCAdapter({ config: {} })
      }, /Full node RPC configuration is required/)
    })

    it('should create axios client with provided configuration', () => {
      // eslint-disable-next-line no-new
      new FullNodeRPCAdapter({ config: baseConfig })

      assert.isTrue(axiosCreateStub.calledOnce)
      const options = axiosCreateStub.getCall(0).args[0]
      assert.equal(options.baseURL, baseConfig.fullNode.rpcBaseUrl)
      assert.equal(options.timeout, baseConfig.fullNode.rpcTimeoutMs)
      assert.deepEqual(options.auth, {
        username: baseConfig.fullNode.rpcUsername,
        password: baseConfig.fullNode.rpcPassword
      })
    })
  })

  describe('#call()', () => {
    it('should call RPC method and return result', async () => {
      mockAxiosInstance.post.resolves({ data: { result: 'hash' } })
      const uut = new FullNodeRPCAdapter({ config: baseConfig })

      const result = await uut.call('getbestblockhash', [])

      assert.equal(result, 'hash')
      assert.isTrue(mockAxiosInstance.post.calledOnce)
      const [, payload] = mockAxiosInstance.post.getCall(0).args
      assert.deepEqual(payload, {
        jsonrpc: '1.0',
        id: 'test-getbestblockhash',
        method: 'getbestblockhash',
        params: []
      })
    })

    it('should use custom request id when provided', async () => {
      mockAxiosInstance.post.resolves({ data: { result: 123 } })
      const uut = new FullNodeRPCAdapter({ config: baseConfig })

      await uut.call('getblockcount', [], 'custom-id')

      const [, payload] = mockAxiosInstance.post.getCall(0).args
      assert.equal(payload.id, 'custom-id')
    })

    it('should throw formatted error when RPC returns error', async () => {
      mockAxiosInstance.post.resolves({
        data: {
          error: { message: 'RPC error' }
        }
      })
      const uut = new FullNodeRPCAdapter({ config: baseConfig })

      try {
        await uut.call('failing', [])
        assert.fail('Unexpected success')
      } catch (err) {
        assert.equal(err.message, 'RPC error')
        assert.equal(err.status, 400)
      }
    })

    it('should translate network errors into 503 status', async () => {
      mockAxiosInstance.post.rejects(new Error('ENOTFOUND fullnode'))
      const uut = new FullNodeRPCAdapter({ config: baseConfig })

      try {
        await uut.call('getblockcount', [])
        assert.fail('Unexpected success')
      } catch (err) {
        assert.equal(
          err.message,
          'Network error: Could not communicate with full node or other external service.'
        )
        assert.equal(err.status, 503)
      }
    })
  })
})
