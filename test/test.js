import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

import { I2CAddressedBus } from '@johntalton/and-other-delights'
import { EEPROM, DEFAULT_WRITE_PAGE_SIZE, DEFAULT_READ_PAGE_SIZE } from '@johntalton/eeprom'
import { split16 } from '../src/util.js'

const mockbus = () => ({
	readList: [],
	writeList: [],

	async readI2cBlock(address, cmd, length, target) {
		this.readList.push({ cmd, length, hasTarget: target !== undefined })

		if(length === 0) { throw new Error('invalid length') }
		const buffer = target === undefined ? new ArrayBuffer(length) : (ArrayBuffer.isView(target) ? target.buffer.transfer() : target.transfer())

		return {
			bytesRead: length,
			buffer
		}
	},

	async writeI2cBlock(address, cmd, buffer) {
		this.writeList.push({ cmd, byteLength: buffer?.byteLength })
	}
})


describe('EEPROM', () => {
	describe('construct', () => {
		it('should construct with defaults', () => {
			const abus = new I2CAddressedBus(mockbus(), 0x00)
			const device = new EEPROM(abus)

			assert.equal(device.writePageSize, DEFAULT_WRITE_PAGE_SIZE)
			assert.equal(device.readPageSize, DEFAULT_READ_PAGE_SIZE)
		})

		it('should construct with custom values', () => {
			const abus = new I2CAddressedBus(mockbus(), 0x00)
			const device = new EEPROM(abus, { readPageSize: 128, writePageSize: 16 })

			assert.equal(device.writePageSize, 16)
			assert.equal(device.readPageSize, 128)
		})
	})

	describe('read', () => {
		it('should read non chunked', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const result = await device.read(0, 32)

			assert.equal(bus.readList.length, 1)
			assert.deepEqual(bus.readList[0].cmd, [ 0, 0 ])
			assert.equal(bus.readList[0].length, 32)
		})

		it('should read multiple chunk when data exceeds page length', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const result = await device.read(0, 64)

			assert.equal(bus.readList.length, 2)
			assert.deepEqual(bus.readList[0].cmd, [ 0, 0 ])
			assert.equal(bus.readList[0].length, 32)

			assert.deepEqual(bus.readList[1].cmd, [ 0, 32 ])
			assert.equal(bus.readList[1].length, 32)
		})

		it('should read single unaligned', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus, { readPageSize: 32 })

			const result = await device.read(30, 10)

			assert.equal(bus.readList.length, 1)
			assert.deepEqual(bus.readList[0].cmd, [ 0, 30 ])
			assert.equal(bus.readList[0].length, 10)
		})

		it('should read single unaligned large uneven length', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus, { readPageSize: 32 })

			const result = await device.read(30, 60)

			assert.equal(bus.readList.length, 2)
			assert.deepEqual(bus.readList[0].cmd, [ 0, 30 ])
			assert.equal(bus.readList[0].length, 32)

			assert.deepEqual(bus.readList[1].cmd, [ 0, 62 ])
			assert.equal(bus.readList[1].length, 28)
		})

		it('should support target TypedArray', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const target = new Uint32Array(5)
			const result = await device.read(30, 10, target)

			assert.equal(target.buffer.detached, true)
			assert.equal(result.byteLength, 5 * 4)
		})

		it('should support target ArrayBuffer', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const target = new ArrayBuffer(10)
			const result = await device.read(30, 10, target)

			assert.equal(target.detached, true)
			assert.equal(result.byteLength, 10)
		})

		it('should read 32kbit device sans 6 bytes', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus, { readPageSize: 32, writePageSize: 32 })

			const buffer = await device.read(0, 4090)

			assert.equal(buffer.byteLength, 4090)

			assert.equal(bus.readList.length, 128)
			assert.deepEqual(bus.readList[127].cmd, split16(4064))
			assert.equal(bus.readList[127].length, 26)
		})
	})

	describe('write', () => {
		it('should write single', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			await device.write(0, Uint32Array.from([ 1, 2, 3, 4 ]))

			assert.equal(bus.writeList.length, 1)
		})

		it('should write multiple when large data', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const source = new ArrayBuffer(64)
			await device.write(0, source)

			assert.equal(bus.writeList.length, 2)
		})

		it('should write multiple when not aligned', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const source = new ArrayBuffer(10)
			await device.write(30, source)

			assert.equal(bus.writeList.length, 2)
		})

		it('should write multiple when large and not aligned', async () => {
			const bus = mockbus()
			const abus = new I2CAddressedBus(bus, 0x00)
			const device = new EEPROM(abus)

			const source = new ArrayBuffer(40)
			await device.write(30, source)

			assert.equal(bus.writeList.length, 3)
		})

	})
})