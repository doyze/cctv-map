// Usage: node import-csv.mjs <csv-file>
// Supports both formats:
//   No,Name,Status,Lat,Lon,Stream URL     (udon)
//   id,name,lat,lng,streamUrl              (pattaya)

import { readFileSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";
import Database from "better-sqlite3";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const dbPath = join(__dirname, "data", "cctv.db");
const csvFile = process.argv[2];

if (!csvFile) {
  console.error("Usage: node import-csv.mjs <csv-file>");
  process.exit(1);
}

const db = new Database(dbPath);
const insert = db.prepare(
  "INSERT INTO cameras (name, status, lat, lon, stream_url) VALUES (?, ?, ?, ?, ?)"
);

const csv = readFileSync(csvFile, "utf-8");
const lines = csv.trim().split("\n");
const header = lines[0].toLowerCase();

// Detect format
const isPattaya = header.includes("streamurl");

let count = 0;
const tx = db.transaction(() => {
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Parse CSV
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
      // id,name,lat,lng,streamUrl
      name = fields[1] || "";
      status = "online";
      lat = parseFloat(fields[2]);
      lon = parseFloat(fields[3]);
      url = fields[4] || "";
    } else {
      // No,Name,Status,Lat,Lon,Stream URL
      name = fields[1] || "";
      status = fields[2] || "online";
      lat = parseFloat(fields[3]);
      lon = parseFloat(fields[4]);
      url = fields[5] || "";
    }

    if (!name || isNaN(lat) || isNaN(lon) || !url) continue;
    insert.run(name, status, lat, lon, url);
    count++;
  }
});

tx();
db.close();
console.log(`Imported ${count} cameras from ${csvFile}`);
