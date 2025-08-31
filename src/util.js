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

/**
 * @param {number} start
 * @param {number} end
 * @param {number} [step = 1]
 */
export function* range(start, end, step = 1) {
	for(let i = start; i <= end; i += step) {
		yield i
	}
}
