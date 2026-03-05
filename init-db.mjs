import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dbPath = join(__dirname, "data", "cctv.db");

const db = new Database(dbPath);

db.exec(`
  DROP TABLE IF EXISTS cameras;
  CREATE TABLE cameras (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    status TEXT DEFAULT 'online',
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    stream_url TEXT NOT NULL
  );
`);

const insert = db.prepare(
  "INSERT INTO cameras (name, status, lat, lon, stream_url) VALUES (?, ?, ?, ?, ?)"
);

function parseCSV(text) {
  const lines = text.trim().split("\n");
  const header = lines[0].toLowerCase();
  const isPattaya = header.includes("streamurl");
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const fields = [];
    let field = "";
    let inQ = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') inQ = !inQ;
      else if (c === "," && !inQ) { fields.push(field); field = ""; }
      else field += c;
    }
    fields.push(field);

    let name, status, lat, lon, url;
    if (isPattaya) {
      name = fields[1] || "";
      status = "online";
      lat = parseFloat(fields[2]);
      lon = parseFloat(fields[3]);
      url = fields[4] || "";
    } else {
      name = fields[1] || "";
      status = fields[2] || "online";
      lat = parseFloat(fields[3]);
      lon = parseFloat(fields[4]);
      url = fields[5] || "";
    }

    if (name && !isNaN(lat) && !isNaN(lon) && url) {
      rows.push({ name, status, lat, lon, url });
    }
  }
  return rows;
}

// Find all CSV files: data/cctv.csv + *.csv in root
const csvFiles = [];
const dataCsv = join(__dirname, "data", "cctv.csv");
try { readFileSync(dataCsv); csvFiles.push(dataCsv); } catch {}

const rootFiles = readdirSync(__dirname);
for (const f of rootFiles) {
  if (f.endsWith("_cctv.csv")) csvFiles.push(join(__dirname, f));
}

let total = 0;
const tx = db.transaction(() => {
  for (const csvFile of csvFiles) {
    const text = readFileSync(csvFile, "utf-8");
    const rows = parseCSV(text);
    for (const r of rows) {
      insert.run(r.name, r.status, r.lat, r.lon, r.url);
    }
    console.log(`  ${csvFile}: ${rows.length} cameras`);
    total += rows.length;
  }
});
tx();
db.close();

console.log(`Total: ${total} cameras imported into ${dbPath}`);
