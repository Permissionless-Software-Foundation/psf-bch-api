/*
  Unit tests for SlpRESTController.
*/

import { assert } from 'chai'
import sinon from 'sinon'

import SlpRESTController from '../../../src/controllers/rest-api/slp/controller.js'
import {
  createMockRequest,
  createMockResponse
} from '../mocks/controller-mocks.js'

// Valid mainnet cash address for testing
const VALID_MAINNET_ADDRESS = 'bitcoincash:qrdka2205f4hyukutc2g0s6lykperc8nsu5u2ddpqf'

// Valid mainnet P2SH32 address (32-byte script hash, used by CashScript)
const P2SH32_MAINNET_ADDRESS = 'bitcoincash:pdk82s4d8v2yh85z5gu2zpsljmdz0vkegys22u7prv6p6hz73957uy47s9xup'

// The same 32-byte script hash as a testnet address
const P2SH32_TESTNET_ADDRESS = 'bchtest:pdk82s4d8v2yh85z5gu2zpsljmdz0vkegys22u7prv6p6hz73957u8j0wa4fn'

// Cash addresses with a valid checksum that are not standard BCH addresses
const P2PKH_32_BYTE_HASH_ADDRESS = 'bitcoincash:qdk82s4d8v2yh85z5gu2zpsljmdz0vkegys22u7prv6p6hz73957udgsyajys'
const P2SH_24_BYTE_HASH_ADDRESS = 'bitcoincash:p9k82s4d8v2yh85z5gu2zpsljmdz0vkegys22u7p9nqcdcyw'
const P2SH32_ECASH_ADDRESS = 'ecash:pdk82s4d8v2yh85z5gu2zpsljmdz0vkegys22u7prv6p6hz73957u7gemdpyt'

describe('#slp-controller.js', () => {
  let sandbox
  let mockUseCases
  let mockAdapters
  let uut

  const createSlpUseCaseStubs = () => ({
    getStatus: sandbox.stub().resolves({ status: 'ok' }),
    getAddress: sandbox.stub().resolves({ balance: 1000 }),
    getTxid: sandbox.stub().resolves({ txid: 'abc' }),
    getTokenStats: sandbox.stub().resolves({ tokenData: {} }),
    getTokenData: sandbox.stub().resolves({ genesisData: {}, immutableData: '', mutableData: '' })
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockAdapters = {}
    mockUseCases = {
      slp: createSlpUseCaseStubs()
    }

    uut = new SlpRESTController({
      adapters: mockAdapters,
      useCases: mockUseCases
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('#constructor()', () => {
    it('should require adapters', () => {
      assert.throws(() => {
        // eslint-disable-next-line no-new
        new SlpRESTController({ useCases: mockUseCases })
      }, /Adapters library required/)
    })

    it('should require slp use cases', () => {
      assert.throws(() => {
        // eslint-disable-next-line no-new
        new SlpRESTController({ adapters: mockAdapters, useCases: {} })
      }, /SLP use cases required/)
    })
  })

  describe('#root()', () => {
    it('should return service status', async () => {
      const req = createMockRequest()
      const res = createMockResponse()

      await uut.root(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { status: 'psf-slp-indexer' })
    })
  })

  describe('#getStatus()', () => {
    it('should return status on success', async () => {
      const req = createMockRequest()
      const res = createMockResponse()

      await uut.getStatus(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { status: 'ok' })
      assert.isTrue(mockUseCases.slp.getStatus.calledOnce)
    })

    it('should handle errors via handleError', async () => {
      const error = new Error('failure')
      error.status = 503
      mockUseCases.slp.getStatus.rejects(error)
      const req = createMockRequest()
      const res = createMockResponse()

      await uut.getStatus(req, res)

      assert.equal(res.statusValue, 503)
      assert.deepEqual(res.jsonData, { error: 'failure' })
    })
  })

  describe('#getAddress()', () => {
    it('should return address balance on success', async () => {
      const req = createMockRequest({
        body: { address: VALID_MAINNET_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { balance: 1000 })
      assert.isTrue(mockUseCases.slp.getAddress.calledOnce)
    })

    it('should return error if address is empty', async () => {
      const req = createMockRequest({
        body: { address: '' }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
      assert.include(res.jsonData.error, 'can not be empty')
    })

    it('should return error if address is missing', async () => {
      const req = createMockRequest({
        body: {}
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
    })

    it('should handle errors via handleError', async () => {
      const error = new Error('Invalid address')
      error.status = 400
      mockUseCases.slp.getAddress.rejects(error)
      const req = createMockRequest({
        body: { address: VALID_MAINNET_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.equal(res.statusValue, 400)
      assert.deepEqual(res.jsonData, { error: 'Invalid address' })
    })

    it('should accept a P2SH32 address', async () => {
      const req = createMockRequest({
        body: { address: P2SH32_MAINNET_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { balance: 1000 })
      assert.isTrue(mockUseCases.slp.getAddress.calledOnce)
      assert.isTrue(mockUseCases.slp.getAddress.calledWithMatch({ address: P2SH32_MAINNET_ADDRESS }))
    })

    it('should reject a testnet P2SH32 address', async () => {
      const req = createMockRequest({
        body: { address: P2SH32_TESTNET_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.include(res.jsonData.error, 'Only mainnet addresses are supported')
      assert.isTrue(mockUseCases.slp.getAddress.notCalled)
    })

    it('should reject a P2PKH address with a 32-byte hash', async () => {
      const req = createMockRequest({
        body: { address: P2PKH_32_BYTE_HASH_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.include(res.jsonData.error, 'Invalid BCH address')
      assert.isTrue(mockUseCases.slp.getAddress.notCalled)
    })

    it('should reject a P2SH address with a 24-byte hash', async () => {
      const req = createMockRequest({
        body: { address: P2SH_24_BYTE_HASH_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.include(res.jsonData.error, 'Invalid BCH address')
      assert.isTrue(mockUseCases.slp.getAddress.notCalled)
    })

    it('should reject a P2SH32 address with an eCash prefix', async () => {
      const req = createMockRequest({
        body: { address: P2SH32_ECASH_ADDRESS }
      })
      const res = createMockResponse()

      await uut.getAddress(req, res)

      assert.include(res.jsonData.error, 'Invalid BCH address')
      assert.isTrue(mockUseCases.slp.getAddress.notCalled)
    })
  })

  describe('#getTxid()', () => {
    it('should return transaction data on success', async () => {
      const req = createMockRequest({
        body: { txid: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTxid(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { txid: 'abc' })
      assert.isTrue(mockUseCases.slp.getTxid.calledOnce)
    })

    it('should return error if txid is empty', async () => {
      const req = createMockRequest({
        body: { txid: '' }
      })
      const res = createMockResponse()

      await uut.getTxid(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
      assert.include(res.jsonData.error, 'can not be empty')
    })

    it('should return error if txid is not 64 characters', async () => {
      const req = createMockRequest({
        body: { txid: 'abc' }
      })
      const res = createMockResponse()

      await uut.getTxid(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
      assert.include(res.jsonData.error, 'not a txid')
    })

    it('should handle errors via handleError', async () => {
      const error = new Error('Transaction not found')
      error.status = 404
      mockUseCases.slp.getTxid.rejects(error)
      const req = createMockRequest({
        body: { txid: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTxid(req, res)

      assert.equal(res.statusValue, 404)
      assert.deepEqual(res.jsonData, { error: 'Transaction not found' })
    })
  })

  describe('#getTokenStats()', () => {
    it('should return token stats on success', async () => {
      const req = createMockRequest({
        body: { tokenId: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTokenStats(req, res)

      assert.equal(res.statusValue, 200)
      assert.deepEqual(res.jsonData, { tokenData: {} })
      assert.isTrue(mockUseCases.slp.getTokenStats.calledOnce)
    })

    it('should pass withTxHistory flag', async () => {
      const req = createMockRequest({
        body: { tokenId: 'a'.repeat(64), withTxHistory: true }
      })
      const res = createMockResponse()

      await uut.getTokenStats(req, res)

      assert.isTrue(mockUseCases.slp.getTokenStats.calledWith({
        tokenId: 'a'.repeat(64),
        withTxHistory: true
      }))
    })

    it('should return error if tokenId is empty', async () => {
      const req = createMockRequest({
        body: { tokenId: '' }
      })
      const res = createMockResponse()

      await uut.getTokenStats(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
    })

    it('should handle errors via handleError', async () => {
      const error = new Error('Token not found')
      error.status = 404
      mockUseCases.slp.getTokenStats.rejects(error)
      const req = createMockRequest({
        body: { tokenId: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTokenStats(req, res)

      assert.equal(res.statusValue, 404)
      assert.deepEqual(res.jsonData, { error: 'Token not found' })
    })
  })

  describe('#getTokenData()', () => {
    it('should return token data on success', async () => {
      const req = createMockRequest({
        body: { tokenId: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTokenData(req, res)

      assert.equal(res.statusValue, 200)
      assert.property(res.jsonData, 'genesisData')
      assert.property(res.jsonData, 'immutableData')
      assert.property(res.jsonData, 'mutableData')
      assert.isTrue(mockUseCases.slp.getTokenData.calledOnce)
    })

    it('should return error if tokenId is empty', async () => {
      const req = createMockRequest({
        body: { tokenId: '' }
      })
      const res = createMockResponse()

      await uut.getTokenData(req, res)

      assert.equal(res.statusValue, 400)
      assert.property(res.jsonData, 'error')
    })

    it('should handle errors via handleError', async () => {
      const error = new Error('Token data not found')
      error.status = 404
      mockUseCases.slp.getTokenData.rejects(error)
      const req = createMockRequest({
        body: { tokenId: 'a'.repeat(64) }
      })
      const res = createMockResponse()

      await uut.getTokenData(req, res)

      assert.equal(res.statusValue, 404)
      assert.deepEqual(res.jsonData, { error: 'Token data not found' })
    })
  })
})
