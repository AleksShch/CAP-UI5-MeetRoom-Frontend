const { deflateSync } = require('node:zlib');
// Small, valid PNG fixtures without a browser or native image dependency.
module.exports = function png(width = 320, height = 200) {
  function chunk(name, data) {
    const type = Buffer.from(name), content = Buffer.concat([type, data]);
    let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); }
    const size = Buffer.alloc(4), checksum = Buffer.alloc(4);size.writeUInt32BE(data.length);checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
    return Buffer.concat([size, content, checksum]);
  }
  const header = Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height, 4);header[8] = 8;header[9] = 2;
  const pixels = Buffer.alloc((width * 3 + 1) * height, 235);
  for (let y = 0; y < height; y++) pixels[y * (width * 3 + 1)] = 0;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0))]);
};
