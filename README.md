# EEPROM

Generic EEPROM abstraction over [`I2CBus`](https://github.com/johntalton/and-other-delights) interface.


[![npm Version](http://img.shields.io/npm/v/@johntalton/eeprom.svg)](https://www.npmjs.com/package/@johntalton/eeprom)
![GitHub package.json version](https://img.shields.io/github/package-json/v/johntalton/eeprom)
![CI](https://github.com/johntalton/eeprom/workflows/CI/badge.svg)
![GitHub](https://img.shields.io/github/license/johntalton/eeprom)

# File Systems

While most EEPROM are use as "raw" memeoy devices.  Simple File System implmentation can be used:

- [EEFS](https://github.com/johntaton/eefs) A implementation NASA EEFS that supports tradition filename style access
- [CyclicFS](https://github.com/johntaton/cyclic-fs) As circular buffer with versioned slots of fixed used defined size


# Paging and Alignment

EEPROMs typically are divided into "pages" of some small number of bytes (32 to 128 in most cases).

Further each underlying `I2CBus` implementation also have a maximum transfer bytes (implementation specific).

This library provides a way to abstract a single `read`/`write` requests to satisfy those requirements, by spanning over multiple `read`/`write` calls.

Most EEPROM also require that page writes end be aligned to a end boundary, thus writes that cross over page boundaries will also be chunked (even if the total bytes does not exceed a page size)

# Addressing

EEPROM in most cases have 16-bit addressing.  This library assume as much as splits the address into [ MSB, LSB ] and passes to the `I2CBus` (not all implementation can handle multi-byte addressing).

# Example

```javascript
import { EEPROM, DEFAULT_EEPROM_ADDRESS } from '@johntalton/eeprom'

const bus = /* I2CBus instance */

const abus = new I2CAddressedBus(bus, DEFAULT_EEPROM_ADDRESS)
const eeprom = new EEPROM(abus, { writePageSize: 64 })

// write a blob to offset 60
// with a boundary at 64 this will result in 2 writes
await eeprom.write(60, Uint32Array.from([ 1, 2, 3, 4 ]))

//
const ab = new ArrayBuffer(128)
const buffer = await eeprom.read(60, ab.byteLength, ab)
```

# Transaction

This library does not (yet?) provide a transactional safe way of calling `read` or `write`.  That is - multiple calls will occurred async and can be interrupted by other task executed by the user.