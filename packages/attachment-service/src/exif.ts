/**
 * EXIF strip for mobile photo uploads.
 * Removes all EXIF metadata (GPS, device info, timestamps) from JPEG files
 * before storing. Preserves the image content exactly.
 *
 * For non-JPEG files (PNG, PDF, etc.) returns the buffer unchanged.
 */

// JPEG markers
const JPEG_SOI = 0xffd8;      // Start of Image
const JPEG_EOI = 0xffd9;      // End of Image
const JPEG_APP1 = 0xffe1;     // APP1 marker — where EXIF lives
// APP2–APPF can also carry metadata; strip all APPn markers
const JPEG_APP_MIN = 0xffe0;
const JPEG_APP_MAX = 0xffef;
const JPEG_COM = 0xfffe;      // Comment marker

/**
 * Returns true if buffer starts with JPEG SOI marker (FF D8).
 */
export function isJpeg(buffer: Buffer): boolean {
  return buffer.length >= 2 && buffer.readUInt16BE(0) === JPEG_SOI;
}

/**
 * Strip all EXIF / APP metadata and comments from a JPEG buffer.
 * Keeps the image data (SOF, SOS, DQT, DHT etc.) intact.
 *
 * Returns the original buffer unchanged if not a JPEG.
 */
export function stripExif(buffer: Buffer): Buffer {
  if (!isJpeg(buffer)) return buffer;

  const output: Buffer[] = [];
  // Write SOI
  output.push(buffer.subarray(0, 2));

  let offset = 2;
  while (offset < buffer.length - 1) {
    // Each JPEG segment starts with 0xFF
    if (buffer[offset] !== 0xff) break;

    const marker = buffer.readUInt16BE(offset);

    // EOI — end of image, copy and stop
    if (marker === JPEG_EOI) {
      output.push(buffer.subarray(offset));
      break;
    }

    // Some markers (SOS, RST0–RST7) have no length field — just raw data follows
    if (marker === 0xffda /* SOS */) {
      // Copy everything from SOS to end (includes compressed image data)
      output.push(buffer.subarray(offset));
      break;
    }

    // Read segment length (includes the 2-byte length field itself, not the marker)
    if (offset + 4 > buffer.length) break;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    const segmentEnd = offset + 2 + segmentLength;

    // Strip APP0–APPF markers (EXIF in APP1, XMP in APP1/APP11, GPS in APP1, IPTC in APP13)
    // Also strip COM (comment) markers
    const isAppMarker = marker >= JPEG_APP_MIN && marker <= JPEG_APP_MAX;
    const isComment = marker === JPEG_COM;

    if (!isAppMarker && !isComment) {
      // Keep this segment
      output.push(buffer.subarray(offset, segmentEnd));
    }
    // If stripping: skip by advancing offset without copying

    offset = segmentEnd;
  }

  return Buffer.concat(output);
}

/**
 * Strip EXIF from a buffer if it's a JPEG from a mobile source.
 * For other formats (PNG, PDF, DOCX etc.) — returns unchanged.
 */
export function sanitizeForStorage(
  buffer: Buffer,
  mimeType: string,
  source?: 'mobile' | 'web',
): Buffer {
  const isPhoto = mimeType === 'image/jpeg' || mimeType === 'image/jpg';

  // Strip EXIF from JPEG uploads. Mobile is the primary privacy concern; web
  // uploads are stripped as well when source is omitted or explicitly web.
  if (isPhoto && (source === undefined || source === 'mobile' || source === 'web')) {
    return stripExif(buffer);
  }

  return buffer;
}

/**
 * Extract GPS coordinates from JPEG EXIF if present (before stripping).
 * Returns null if no GPS data found or not a JPEG.
 */
export function extractGps(buffer: Buffer): { lat: number; lng: number } | null {
  if (!isJpeg(buffer)) return null;

  // Find APP1 (EXIF) marker
  let offset = 2;
  while (offset < buffer.length - 3) {
    if (buffer[offset] !== 0xff) break;
    const marker = buffer.readUInt16BE(offset);
    const segLen = buffer.readUInt16BE(offset + 2);

    if (marker === JPEG_APP1) {
      const app1Data = buffer.subarray(offset + 4, offset + 2 + segLen);
      // Check for "Exif\0\0" header
      if (app1Data.subarray(0, 6).toString('ascii') === 'Exif\0\0') {
        const coords = parseExifGps(app1Data.subarray(6));
        if (coords) return coords;
      }
    }

    offset += 2 + segLen;
    if (marker === 0xffda) break; // SOS
  }

  return null;
}

/**
 * Minimal EXIF GPS parser — reads IFD0 to find GPS IFD sub-directory.
 * Returns lat/lng in decimal degrees, or null if absent.
 */
function parseExifGps(exifData: Buffer): { lat: number; lng: number } | null {
  try {
    // Determine byte order from TIFF header
    const byteOrder = exifData.subarray(0, 2).toString('ascii');
    const isLittleEndian = byteOrder === 'II';
    const readU16 = (buf: Buffer, off: number) =>
      isLittleEndian ? buf.readUInt16LE(off) : buf.readUInt16BE(off);
    const readU32 = (buf: Buffer, off: number) =>
      isLittleEndian ? buf.readUInt32LE(off) : buf.readUInt32BE(off);

    const ifd0Offset = readU32(exifData, 4);
    const numEntries = readU16(exifData, ifd0Offset);

    let gpsIfdOffset: number | null = null;

    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifd0Offset + 2 + i * 12;
      const tag = readU16(exifData, entryOffset);
      if (tag === 0x8825) {
        // GPS IFD pointer
        gpsIfdOffset = readU32(exifData, entryOffset + 8);
        break;
      }
    }

    if (gpsIfdOffset === null) return null;

    const gpsEntries = readU16(exifData, gpsIfdOffset);
    let latRef = 'N';
    let lngRef = 'E';
    let lat: number | null = null;
    let lng: number | null = null;

    for (let i = 0; i < gpsEntries; i++) {
      const entryOffset = gpsIfdOffset + 2 + i * 12;
      const tag = readU16(exifData, entryOffset);
      const valueOffset = readU32(exifData, entryOffset + 8);

      if (tag === 0x0001) latRef = String.fromCharCode(exifData[entryOffset + 8] ?? 78);
      if (tag === 0x0003) lngRef = String.fromCharCode(exifData[entryOffset + 8] ?? 69);
      if (tag === 0x0002 && lat === null) lat = rationalToDecimal(exifData, valueOffset, readU32, isLittleEndian);
      if (tag === 0x0004 && lng === null) lng = rationalToDecimal(exifData, valueOffset, readU32, isLittleEndian);
    }

    if (lat === null || lng === null) return null;

    return {
      lat: latRef === 'S' ? -lat : lat,
      lng: lngRef === 'W' ? -lng : lng,
    };
  } catch {
    return null;
  }
}

function rationalToDecimal(
  buf: Buffer,
  offset: number,
  readU32: (b: Buffer, o: number) => number,
  _le: boolean,
): number {
  // 3 rational values: degrees, minutes, seconds
  const degNum = readU32(buf, offset);
  const degDen = readU32(buf, offset + 4);
  const minNum = readU32(buf, offset + 8);
  const minDen = readU32(buf, offset + 12);
  const secNum = readU32(buf, offset + 16);
  const secDen = readU32(buf, offset + 20);

  const deg = degDen ? degNum / degDen : 0;
  const min = minDen ? minNum / minDen : 0;
  const sec = secDen ? secNum / secDen : 0;

  return deg + min / 60 + sec / 3600;
}
