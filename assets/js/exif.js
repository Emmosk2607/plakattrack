// Foto-Analyse: EXIF (Zeitstempel + GPS), Dubletten-Hash, Komprimierung, Warnungen.
// Algorithmen 1:1 aus der bewaehrten Alt-Version uebernommen und als Modul gekapselt.

export function simpleHash(str) {
  let h = 0, step = Math.max(1, Math.floor(str.length / 500));
  for (let i = 0; i < str.length; i += step) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h.toString();
}

export function getExifData(file) {
  return Promise.race([
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onerror = () => resolve({});
      reader.onload = e => {
        try {
          const buf = e.target.result;
          const view = new DataView(buf);
          if (view.getUint16(0) !== 0xFFD8) { resolve({}); return; }
          let offset = 2, safety = 0;
          while (offset < buf.byteLength && safety++ < 50) {
            if (offset + 2 > buf.byteLength) break;
            const marker = view.getUint16(offset);
            offset += 2;
            if (offset + 2 > buf.byteLength) break;
            if (marker === 0xFFE1) {
              const exifLen = view.getUint16(offset);
              if (offset + 2 + exifLen > buf.byteLength) break;
              const exifBuf = buf.slice(offset + 2, offset + exifLen);
              const exifView = new DataView(exifBuf);
              if (exifView.byteLength >= 4 && exifView.getUint32(0) === 0x45786966) {
                try { resolve(parseExif(exifView)); } catch { resolve({}); }
                return;
              }
            }
            if (offset + 2 > buf.byteLength) break;
            const segLen = view.getUint16(offset);
            if (segLen < 2) break;
            offset += segLen;
          }
        } catch { /* ignore */ }
        resolve({});
      };
      reader.readAsArrayBuffer(file.slice(0, 65536));
    }),
    new Promise(resolve => setTimeout(() => resolve({}), 500))
  ]);
}

function parseExif(view) {
  try {
    const le = view.getUint16(6) === 0x4949;
    const ifdOffset = view.getUint32(10, le) + 6;
    const numEntries = view.getUint16(ifdOffset, le);
    const result = {};
    for (let i = 0; i < numEntries; i++) {
      const entryOffset = ifdOffset + 2 + i * 12;
      const tag = view.getUint16(entryOffset, le);
      if (tag === 0x9003 || tag === 0x0132) {
        const o = view.getUint32(entryOffset + 8, le) + 6;
        let str = '';
        for (let j = 0; j < 19; j++) str += String.fromCharCode(view.getUint8(o + j));
        result.timestamp = str;
      }
      if (tag === 0x8825) result.gpsOffset = view.getUint32(entryOffset + 8, le) + 6;
    }
    if (result.gpsOffset) result.gps = parseGPS(view, result.gpsOffset, le);
    return result;
  } catch { return {}; }
}

function parseGPS(view, offset, le) {
  try {
    const numEntries = view.getUint16(offset, le);
    let lat = null, lon = null, latRef = 'N', lonRef = 'E';
    for (let i = 0; i < numEntries; i++) {
      const e = offset + 2 + i * 12;
      const tag = view.getUint16(e, le);
      const valOffset = view.getUint32(e + 8, le) + 6;
      if (tag === 1) latRef = String.fromCharCode(view.getUint8(e + 8));
      if (tag === 3) lonRef = String.fromCharCode(view.getUint8(e + 8));
      if (tag === 2) lat = readRational3(view, valOffset, le);
      if (tag === 4) lon = readRational3(view, valOffset, le);
    }
    if (lat !== null && lon !== null) {
      const latD = lat[0] + lat[1] / 60 + lat[2] / 3600;
      const lonD = lon[0] + lon[1] / 60 + lon[2] / 3600;
      return { lat: latRef === 'S' ? -latD : latD, lon: lonRef === 'W' ? -lonD : lonD };
    }
  } catch { /* ignore */ }
  return null;
}

function readRational3(view, offset, le) {
  return [
    view.getUint32(offset, le) / view.getUint32(offset + 4, le),
    view.getUint32(offset + 8, le) / view.getUint32(offset + 12, le),
    view.getUint32(offset + 16, le) / view.getUint32(offset + 20, le)
  ];
}

// Komprimiert ein Bild und liefert { blob, dataUrl, previewUrl }
export function compressToDataUrl(file, maxW = 900, quality = 0.78) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > maxW) { h = Math.round(h * maxW / w); w = maxW; }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve({ dataUrl, previewUrl: dataUrl });
      };
      img.onerror = () => resolve({ dataUrl: null, previewUrl: null });
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Warnungen fuer eine Foto-Menge. photos: [{ gps, timestamp }]
export function detectWarnings(photos) {
  const warnings = [];
  const withTs = photos.filter(p => p.timestamp);
  if (withTs.length >= 10) {
    const times = withTs
      .map(p => new Date(p.timestamp.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3').replace(' ', 'T')))
      .filter(d => !isNaN(d));
    if (times.length >= 10) {
      times.sort((a, b) => a - b);
      const span = (times[times.length - 1] - times[0]) / 1000;
      if (span < 30) warnings.push('⚡ ' + withTs.length + ' Fotos in unter 30 Sekunden aufgenommen');
    }
  }
  const withGPS = photos.filter(p => p.gps);
  if (photos.length > 0 && withGPS.length === 0) warnings.push('📍 Keine GPS-Daten in den Fotos');
  if (withGPS.length >= 5) {
    const rounded = withGPS.map(p => `${Math.round(p.gps.lat * 1000)},${Math.round(p.gps.lon * 1000)}`);
    const freq = {};
    rounded.forEach(r => (freq[r] = (freq[r] || 0) + 1));
    const maxSame = Math.max(...Object.values(freq));
    if (maxSame >= 5) warnings.push('📌 ' + maxSame + ' Fotos vom exakt gleichen GPS-Standort');
  }
  const now = Date.now();
  let oldFound = false;
  photos.forEach(p => {
    if (p.timestamp) {
      const ts = new Date(p.timestamp.replace(/^(\d{4}):(\d{2}):(\d{2})/, '$1-$2-$3'));
      if (!isNaN(ts) && (now - ts) > 86400000) oldFound = true;
    }
  });
  if (oldFound) warnings.push('🕐 Mindestens ein Foto älter als 24 Stunden');
  return [...new Set(warnings)];
}
