# CCTV Map - Udon Thani

แผนที่กล้อง CCTV เทศบาลนครอุดรธานี แสดงผลบนแผนที่พร้อมดู Live Stream

## วิธีรัน

```bash
npm install
node init-db.mjs   # สร้าง database (ครั้งแรก)
node serve.mjs      # เริ่ม server
```

หรือดับเบิลคลิก `run.bat` (สร้าง DB อัตโนมัติถ้ายังไม่มี)

## URL

| หน้า | URL |
|------|-----|
| แผนที่ | http://localhost:8090 |
| จัดการกล้อง | http://localhost:8090/admin.html |

## วิธีหยุด

กด `Ctrl+C` ที่ terminal

## API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/cameras` | ดึงกล้องทั้งหมด |
| GET | `/api/cameras/:id` | ดึงกล้อง 1 ตัว |
| POST | `/api/cameras` | เพิ่มกล้อง |
| PUT | `/api/cameras/:id` | แก้ไขกล้อง |
| DELETE | `/api/cameras/:id` | ลบกล้อง |

## โครงสร้างไฟล์

```
├── data/cctv.db     ← SQLite database
├── data/cctv.csv    ← ข้อมูลเริ่มต้น (import ครั้งแรก)
├── map.html         ← หน้าแผนที่
├── admin.html       ← หน้าจัดการกล้อง (CRUD)
├── serve.mjs        ← server + REST API
├── init-db.mjs      ← script สร้าง DB จาก CSV
├── run.bat          ← ตัวรัน (Windows)
```

## ต้องการ

- Node.js v18+
