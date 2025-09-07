import { DEFAULT_READ_PAGE_SIZE, DEFAULT_WRITE_PAGE_SIZE } from './defs.js'
import { range, split16 } from './util.js'

/**
 * @import {
 * I2CAddressedBus,
 * I2CBufferSource
 * } from '@johntalton/and-other-delights'
 */

/**
 * @typedef {Object} EEPROMOptions
 * @property {number} [readPageSize = DEFAULT_READ_PAGE_SIZE]
 * @property {number} [writePageSize = DEFAULT_WRITE_PAGE_SIZE]
 */

export class Common {
	/**
	 * @param {I2CAddressedBus} bus
	 * @param {number} address
	 * @param {number} length
	 * @param {I2CBufferSource} [into]
	 * */
	static async read(bus, address, length, into = undefined) {
		if(length <= 0) { throw new Error('invalid read length') }
		if(into !== undefined && into.byteLength < length) { throw new Error('invalid buffer length') }
		return bus.readI2cBlock(split16(address), length, into)
	}

	/**
	 * @param {I2CAddressedBus} bus
	 * @param {number} address
	 * @param {I2CBufferSource} buffer
	*/
	static async write(bus, address, buffer) {
		return bus.writeI2cBlock(split16(address), buffer)
	}
}

export class EEPROM {
	#abus
	#writePageSize
	#readPageSize

	/**
	 * @param {I2CAddressedBus} abus
	 * @param {EEPROMOptions} [options]
	 */
	static from(abus, options = undefined) { return new EEPROM(abus, options) }

	/**
	 * @param {I2CAddressedBus} abus
	 * @param {EEPROMOptions} [options]
	 */
	constructor(abus, options = undefined) {
		this.#writePageSize = options?.writePageSize ?? DEFAULT_WRITE_PAGE_SIZE
		this.#readPageSize = options?.readPageSize ?? DEFAULT_READ_PAGE_SIZE
		this.#abus = abus
	}

	get writePageSize() { return this.#writePageSize }
	set writePageSize(size) { this.#writePageSize = size }

	get readPageSize() { return this.#readPageSize }

	/**
	 * @param {number} address
	 * @param {number} length
	 * @param {I2CBufferSource} [into = undefined]
	 * @returns {Promise<I2CBufferSource>}
	 * */
	async read(address, length, into = undefined) {

		const initialBuffer = into ?? new ArrayBuffer(length)

		const futurePartFn = range(0, length - 1, this.#readPageSize).map(page => {
			return async targetBuffer => {
				const pageAddress = address + page
				const remainingLength = Math.min(this.#readPageSize, address + length - pageAddress)

				const pageInto = ArrayBuffer.isView(targetBuffer) ?
					new Uint8Array(targetBuffer.buffer, targetBuffer.byteOffset + page, remainingLength) :
					new Uint8Array(targetBuffer, page, remainingLength)

				if(pageInto !== undefined && pageInto.buffer.detached) { throw new Error('detached') }

				const readResult = await Common.read(this.#abus, pageAddress, remainingLength, pageInto)
				return ArrayBuffer.isView(readResult) ? readResult.buffer : readResult

			}
		})

		const resultBuffer = await futurePartFn.reduce((acc, next) => {
			return acc.then(previousBuffer => next(previousBuffer))
		}, Promise.resolve(initialBuffer))

		return ArrayBuffer.isView(resultBuffer) ? resultBuffer.buffer : resultBuffer
	}

	/**
	 * @param {number} address
	 * @param {I2CBufferSource} source
	 * @returns {Promise<void>}
	 */
	async write(address, source) {
		const u8 = ArrayBuffer.isView(source) ?
			new Uint8Array(source.buffer, source.byteOffset, source.byteLength) :
			new Uint8Array(source, 0, source.byteLength)

		const wps = this.#writePageSize
		const nextPageBoundary = Math.floor((address + wps) / wps) * wps
		const firstLength = nextPageBoundary - address

		const firstBuffer = u8.subarray(0, firstLength)
		await Common.write(this.#abus, address, firstBuffer)

		const remainingStart = firstLength
		const remainingLength = source.byteLength - firstLength

		for(const page of range(remainingStart, remainingLength, this.#writePageSize)) {
			const pageEnd = Math.min(page + this.#writePageSize, u8.byteLength)
			const buffer = u8.subarray(page, pageEnd)
			const pageAddress = address + page

			await Common.write(this.#abus, pageAddress, buffer)
		}
	}
}

