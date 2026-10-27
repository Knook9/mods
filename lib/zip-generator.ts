import zlib from "node:zlib";

/**
 * Creates a valid ZIP archive containing files in memory without external dependencies.
 */
export function buildZip(files: Array<{ name: string; content: Buffer | string }>): Buffer {
  const fileEntries: Array<{
    nameBuf: Buffer;
    dataBuf: Buffer;
    crc: number;
    offset: number;
  }> = [];

  const chunks: Buffer[] = [];
  let currentOffset = 0;

  for (const file of files) {
    const nameBuf = Buffer.from(file.name, "utf8");
    const dataBuf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(file.content, "utf8");
    const crc = zlib.crc32(dataBuf);

    const lfh = Buffer.alloc(30 + nameBuf.length);
    lfh.writeUInt32LE(0x04034b50, 0); // local file header signature
    lfh.writeUInt16LE(20, 4); // version needed
    lfh.writeUInt16LE(0, 6); // general purpose bit flag
    lfh.writeUInt16LE(0, 8); // compression method (0 = store)
    lfh.writeUInt16LE(0, 10); // file last mod time
    lfh.writeUInt16LE(0, 12); // file last mod date
    lfh.writeUInt32LE(crc, 14); // crc-32
    lfh.writeUInt32LE(dataBuf.length, 18); // compressed size
    lfh.writeUInt32LE(dataBuf.length, 22); // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26); // file name length
    lfh.writeUInt16LE(0, 28); // extra field length
    nameBuf.copy(lfh, 30);

    fileEntries.push({
      nameBuf,
      dataBuf,
      crc,
      offset: currentOffset,
    });

    chunks.push(lfh);
    chunks.push(dataBuf);
    currentOffset += lfh.length + dataBuf.length;
  }

  const centralDirStart = currentOffset;
  let centralDirSize = 0;

  for (const entry of fileEntries) {
    const cdfh = Buffer.alloc(46 + entry.nameBuf.length);
    cdfh.writeUInt32LE(0x02014b50, 0); // central directory header signature
    cdfh.writeUInt16LE(20, 4); // version made by
    cdfh.writeUInt16LE(20, 6); // version needed
    cdfh.writeUInt16LE(0, 8); // flags
    cdfh.writeUInt16LE(0, 10); // compression method
    cdfh.writeUInt16LE(0, 12); // time
    cdfh.writeUInt16LE(0, 14); // date
    cdfh.writeUInt32LE(entry.crc, 16);
    cdfh.writeUInt32LE(entry.dataBuf.length, 20);
    cdfh.writeUInt32LE(entry.dataBuf.length, 24);
    cdfh.writeUInt16LE(entry.nameBuf.length, 28);
    cdfh.writeUInt16LE(0, 30); // extra field length
    cdfh.writeUInt16LE(0, 32); // comment length
    cdfh.writeUInt16LE(0, 34); // disk number start
    cdfh.writeUInt16LE(0, 36); // internal file attributes
    cdfh.writeUInt32LE(0, 38); // external file attributes
    cdfh.writeUInt32LE(entry.offset, 42); // relative offset of local header
    entry.nameBuf.copy(cdfh, 46);

    chunks.push(cdfh);
    centralDirSize += cdfh.length;
    currentOffset += cdfh.length;
  }

  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // end of central dir signature
  eocd.writeUInt16LE(0, 4); // disk number
  eocd.writeUInt16LE(0, 6); // start disk
  eocd.writeUInt16LE(fileEntries.length, 8); // records on disk
  eocd.writeUInt16LE(fileEntries.length, 10); // total records
  eocd.writeUInt32LE(centralDirSize, 12); // size of central directory
  eocd.writeUInt32LE(centralDirStart, 16); // offset of central directory
  eocd.writeUInt16LE(0, 20); // comment length

  chunks.push(eocd);

  return Buffer.concat(chunks);
}
