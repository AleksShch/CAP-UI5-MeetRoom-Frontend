// Read dimensions from the image itself; client-supplied dimensions are not trusted.
module.exports = function imageSize(dataUrl) {
  const match =
    typeof dataUrl === 'string' &&
    dataUrl.match(/^data:image\/(png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match || match[2].length > 7 * 1024 * 1024) throw new Error('PLAN_IMAGE_INVALID');
  const bytes = Buffer.from(match[2], 'base64');
  if (bytes.length > 5 * 1024 * 1024 || bytes.toString('base64') !== match[2])
    throw new Error('PLAN_IMAGE_INVALID');
  let width,
    height,
    orientation = 1;
  if (match[1] === 'png') {
    if (
      bytes.length < 33 ||
      bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
      bytes.readUInt32BE(8) !== 13 ||
      bytes.toString('ascii', 12, 16) !== 'IHDR' ||
      !bytes.includes(Buffer.from('IEND'))
    )
      throw new Error('PLAN_IMAGE_INVALID');
    width = bytes.readUInt32BE(16);
    height = bytes.readUInt32BE(20);
  } else {
    if (bytes.length < 4 || bytes.readUInt16BE(0) !== 0xffd8) throw new Error('PLAN_IMAGE_INVALID');
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) throw new Error('PLAN_IMAGE_INVALID');
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if (marker === 0xda || marker === 0xd9) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) throw new Error('PLAN_IMAGE_INVALID');
      if (
        [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(
          marker
        )
      ) {
        if (length < 8) throw new Error('PLAN_IMAGE_INVALID');
        height = bytes.readUInt16BE(offset + 3);
        width = bytes.readUInt16BE(offset + 5);
      }
      if (marker === 0xe1 && bytes.toString('ascii', offset + 2, offset + 8) === 'Exif\0\0') {
        const tiff = bytes.subarray(offset + 8, offset + length);
        if (tiff.length >= 8) {
          const little = tiff.toString('ascii', 0, 2) === 'II';
          const u16 = at => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
          const u32 = at => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
          const ifd = u32(4);
          if (ifd + 2 <= tiff.length)
            for (let n = 0, at = ifd + 2; n < u16(ifd) && at + 12 <= tiff.length; n++, at += 12) {
              if (u16(at) === 0x0112 && u16(at + 2) === 3 && u32(at + 4) === 1)
                orientation = u16(at + 8);
            }
        }
      }
      offset += length;
    }
    if (orientation >= 5 && orientation <= 8) [width, height] = [height, width];
  }
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 100 ||
    height < 100 ||
    width > 10000 ||
    height > 10000
  )
    throw new Error('PLAN_IMAGE_DIMENSIONS');
  return { width, height };
};
