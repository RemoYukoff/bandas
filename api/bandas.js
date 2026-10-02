// Vercel function: returns the whole band series as JSON.
// - From 2026: read straight from BCRA's xlsx. BCRA serves it without CORS headers,
//   so the browser can't fetch it directly.
// - 2025: not published as a series, so computed from the BCRA rule (start 14/04/2025
//   at $1.000 / $1.400, -1% / +1% per month compounded over calendar days).
//   Matches the published 31/12/2025 ceiling of $1.526,60.
// No dependencies: the xlsx (a zip) is unpacked with zlib and the sheet XML read with regexes.
const zlib = require("zlib");

const XLSX_URL = "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/serie-completa-bandas-cambiarias.xlsx";
const FIRST_DATA_ROW = 8; // C7:E7 holds the headers (Fecha, Banda inferior, Banda superior)
const BAND_START = "2025-04-14";
const DAY = 86400000;

// Weekdays from the band start up to (not including) the first xlsx date.
function computedBand(until) {
  const rows = [];
  const start = Date.parse(BAND_START);
  for (let t = start; new Date(t).toISOString().slice(0, 10) < until; t += DAY) {
    if (new Date(t).getUTCDay() % 6 === 0) continue;
    const months = (t - start) / DAY / 30;
    rows.push({
      fecha: new Date(t).toISOString().slice(0, 10),
      piso: Math.round(1000 * 0.99 ** months * 100) / 100,
      techo: Math.round(1400 * 1.01 ** months * 100) / 100,
      calc: true
    });
  }
  return rows;
}

function unzip(buf) {
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("not a zip file");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = {};
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(p + 10);
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = buf.subarray(start, start + size);
    files[name] = method === 8 ? zlib.inflateRawSync(raw) : raw;
    p += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function parseSheet(xml) {
  const cells = {};
  for (const m of xml.matchAll(/<c r="([A-Z]+)(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = m[3] && m[3].match(/<v>([^<]*)<\/v>/);
    if (v) (cells[m[2]] ||= {})[m[1]] = Number(v[1]);
  }
  const rows = [];
  for (const [r, c] of Object.entries(cells)) {
    if (Number(r) < FIRST_DATA_ROW || !(c.C > 0 && c.D > 0 && c.E > 0)) continue;
    // Excel serial date -> ISO date (1900 system, epoch 1899-12-30).
    const fecha = new Date(Date.UTC(1899, 11, 30) + Math.round(c.C) * 86400000).toISOString().slice(0, 10);
    rows.push({ fecha, piso: Math.round(c.D * 100) / 100, techo: Math.round(c.E * 100) / 100 });
  }
  return rows.sort((a, b) => a.fecha.localeCompare(b.fecha));
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(XLSX_URL, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!r.ok) throw new Error(`BCRA respondió HTTP ${r.status}`);
    const files = unzip(Buffer.from(await r.arrayBuffer()));
    const sheet = files["xl/worksheets/sheet1.xml"];
    if (!sheet) throw new Error("hoja no encontrada en el xlsx");
    const published = parseSheet(sheet.toString("utf8"));
    if (!published.length) throw new Error("el xlsx no tiene filas de datos");
    const rows = [...computedBand(published[0].fecha), ...published];
    // Cache on Vercel's CDN for an hour; serve stale for a day while it refreshes.
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
    res.status(200).json({ source: XLSX_URL, rows });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};
