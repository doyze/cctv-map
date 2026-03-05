import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const csvPath = join(__dirname, "data", "cctv.csv");
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

const csv = readFileSync(csvPath, "utf-8");
const lines = csv.trim().split("\n");

const insert = db.prepare(
  "INSERT INTO cameras (name, status, lat, lon, stream_url) VALUES (?, ?, ?, ?, ?)"
);

const insertAll = db.transaction((rows) => {
  for (const row of rows) {
    insert.run(row.name, row.status, row.lat, row.lon, row.url);
  }
});

const rows = [];
for (let i = 1; i < lines.length; i++) {
  const line = lines[i];
  const fields = [];
  let field = "";
  let inQuotes = false;
  for (let j = 0; j < line.length; j++) {
    const c = line[j];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === "," && !inQuotes) {
      fields.push(field);
      field = "";
    } else {
      field += c;
    }
  }
  fields.push(field);
  if (fields.length >= 6) {
    rows.push({
      name: fields[1],
      status: fields[2],
      lat: parseFloat(fields[3]),
      lon: parseFloat(fields[4]),
      url: fields[5],
    });
  }
}

insertAll(rows);
db.close();

console.log(`Imported ${rows.length} cameras into ${dbPath}`);
