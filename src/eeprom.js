

/**
 * @import { I2CAddress } from '@johntalton/and-other-delights
 */

const SINGLE_BYTE_MASK = 0xff

/**
 * @returns {[ number, number ]}
 */
export function split16(reg16) {
	return [
		(reg16 >> 8) & SINGLE_BYTE_MASK,
		reg16 & SINGLE_BYTE_MASK
	]
}

export class Common {
	/**
	 * @param {number} address
	 * @param {number} length
	 * @param {I2CAddressedBus} bus
	 * */
	static async read(bus, address, length, into) {
		return bus.readI2cBlock(split16(address), length, into)
	}

	/**
	 * @param {number} address
	 * @param {I2CAddressedBus} bus
	 * @param {ArrayBufferLike|ArrayBufferView} buffer
	*/
	static async write(bus, address, buffer) {
		// console.log('---- common write', address, buffer.byteLength, buffer)
		return bus.writeI2cBlock(split16(address), buffer)
	}
}


export const DEFAULT_WRITE_PAGE_SIZE = 32
export const DEFAULT_READ_PAGE_SIZE = 32

export class EEPROM {
	#abus
	#writePageSize
	#readPageSize

	/** @param {I2CAddressedTransactionBus} abus  */
	static from(abus, options) { return new EEPROM(abus, options) }

	/** @param {I2CAddressedTransactionBus} abus  */
	constructor(abus, options) {
		this.#writePageSize = options?.pageSize ?? DEFAULT_WRITE_PAGE_SIZE
		this.#readPageSize = options?.readPageSize ?? DEFAULT_READ_PAGE_SIZE
		this.#abus = abus
	}

	get pageSize() { return this.#writePageSize }
	set pageSize(size) { this.#writePageSize = size }

	/**
	 * @param {number} address
	 * @param {number} length
	 * @param {ArrayBufferLike|ArrayBufferView} [into=undefined]
	 * @returns {Promise<ArrayBufferLike|ArrayBufferView>}
	 * */
	async read(address, length, into = undefined) {
		// console.log('read transaction')
		// return this.#abus.transaction(async atbus => {
			// console.log('reading', address, length)
			const parts = await Promise.all(range(0, length - 1, this.#readPageSize).map(async page => {
				const pageAddress = address + page

				const remainingLength = Math.min(page + this.#readPageSize, length - page)

				// console.log('read page', page, pageAddress, this.#readPageSize, remainingLength)
				const pageInto = (into === undefined) ? undefined : (ArrayBuffer.isView(into) ?
					new Uint8Array(into.buffer, into.byteOffset + page, remainingLength) :
					new Uint8Array(into, page, remainingLength))

				return await Common.read(this.#abus, pageAddress, remainingLength, pageInto)
			}))

			const blob = new Blob(parts)
			return blob.arrayBuffer()
		// })
	}

	/** @param {ArrayBufferLike|ArrayBufferView} source  */
	async write(address, source) {
		// console.log('writing to address', address, source.byteLength)
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

			// console.log('write page', page, pageAddress, buffer.byteLength, buffer)
			await Common.write(this.#abus, pageAddress, buffer)
		}
	}
}

