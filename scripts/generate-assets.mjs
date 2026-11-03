// Pure Node.js PNG icon generator (No external dependencies required)
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const ICONS_DIR = path.resolve('./assets/icons');
fs.mkdirSync(ICONS_DIR, { recursive: true });

function createPng(size) {
  // Simple uncompressed or deflate PNG generator
  const width = size;
  const height = size;
  const buffer = Buffer.alloc(height * (1 + width * 4));

  const center = size / 2;
  const radius = size * 0.44;

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + width * 4);
    buffer[rowOffset] = 0; // Filter type: None

    for (let x = 0; x < width; x++) {
      const pixelOffset = rowOffset + 1 + x * 4;
      const dx = x - center;
      const dy = y - center;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Background rounded square or circle
      if (dist <= radius) {
        // Modern Teal to Indigo gradient
        const t = (x + y) / (width + height);
        const r = Math.round(14 + (99 - 14) * t);
        const g = Math.round(165 + (102 - 165) * t);
        const b = Math.round(233 + (241 - 233) * t);

        // Sign "X" gesture / visual mark in center
        const nx = (x - center) / (size * 0.28);
        const ny = (y - center) / (size * 0.28);
        const onDiag1 = Math.abs(nx - ny) < 0.35 && Math.abs(nx) < 1 && Math.abs(ny) < 1;
        const onDiag2 = Math.abs(nx + ny) < 0.35 && Math.abs(nx) < 1 && Math.abs(ny) < 1;

        if (onDiag1 || onDiag2) {
          buffer[pixelOffset] = 255;     // R
          buffer[pixelOffset + 1] = 255; // G
          buffer[pixelOffset + 2] = 255; // B
          buffer[pixelOffset + 3] = 255; // Alpha
        } else {
          buffer[pixelOffset] = r;
          buffer[pixelOffset + 1] = g;
          buffer[pixelOffset + 2] = b;
          buffer[pixelOffset + 3] = 255;
        }
      } else {
        // Transparent outer
        buffer[pixelOffset] = 0;
        buffer[pixelOffset + 1] = 0;
        buffer[pixelOffset + 2] = 0;
        buffer[pixelOffset + 3] = 0;
      }
    }
  }

  const deflated = zlib.deflateSync(buffer);

  function crc32(buf) {
    let c = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      c ^= buf[i];
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
      }
    }
    return (c ^ 0xffffffff) >>> 0;
  }

  function makeChunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // Bit depth
  ihdr[9] = 6; // Color type (RGBA)
  ihdr[10] = 0; // Compression
  ihdr[11] = 0; // Filter
  ihdr[12] = 0; // Interlace

  const ihdrChunk = makeChunk('IHDR', ihdr);
  const idatChunk = makeChunk('IDAT', deflated);
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

[16, 32, 48, 128].forEach(size => {
  const png = createPng(size);
  fs.writeFileSync(path.join(ICONS_DIR, `icon${size}.png`), png);
  console.log(`Generated icon${size}.png`);
});

// Also create SVG vector logo
const svgLogo = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="signx-grad" x1="0" y1="0" x2="128" y2="128" gradientUnits="userSpaceOnUse">
      <stop stop-color="#06b6d4"/>
      <stop offset="0.5" stop-color="#3b82f6"/>
      <stop offset="1" stop-color="#6366f1"/>
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>
  <rect width="128" height="128" rx="28" fill="url(#signx-grad)"/>
  <!-- Hand / Sign Symbol combined with X -->
  <path d="M40 36L88 92M88 36L40 92" stroke="#ffffff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="64" cy="64" r="8" fill="#10b981"/>
  <!-- Accessibility waves -->
  <path d="M28 64C28 44 44 28 64 28" stroke="rgba(255,255,255,0.4)" stroke-width="4" stroke-linecap="round"/>
  <path d="M100 64C100 84 84 100 64 100" stroke="rgba(255,255,255,0.4)" stroke-width="4" stroke-linecap="round"/>
</svg>`;

fs.writeFileSync(path.join(ICONS_DIR, 'logo.svg'), svgLogo);
console.log('Generated logo.svg');
