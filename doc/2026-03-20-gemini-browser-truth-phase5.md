# Gemini Browser Truth Phase 5

เอกสารนี้เป็น manual smoke script สำหรับยืนยัน phase 5 ของแผน `Gemini Composer Readiness and Send Truth` บน Chrome จริง โดยใช้ unpacked extension จาก `dist/`

## เป้าหมาย

- พิสูจน์ว่า Gemini cold-open ไม่ส่ง prompt ก่อน visible composer พร้อมจริง
- แยกอาการ `send-ready control ยังไม่พร้อม` ออกจาก `พยายามส่งแล้วแต่ send-start ไม่เกิด`
- เทียบพฤติกรรมระหว่าง queue 1 item กับ queue 2 items ว่าไม่ต่างกันเพราะ race เดิม

## Preconditions

1. build ล่าสุดผ่านแล้วด้วย `npm run build:dist`
2. Chrome เปิด `chrome://extensions/`
3. เปิด `Developer mode`
4. กด `Load unpacked` หรือ `Reload` ที่ extension Xafi โดยชี้ไปที่โฟลเดอร์ `dist`
5. Gemini login พร้อมใช้งานใน profile ที่ใช้ทดสอบ

## Runtime Signals ที่ควรจับตา

เปิด DevTools ของแท็บ Gemini แล้วดู log ที่ขึ้นต้นด้วย `XVR-AI:gemini`

stage สำคัญ:

- `stage=page-ready`
- `stage=composer-found`
- `stage=composer-stable`
- `stage=prompt-visible`
- `stage=reacquire`
- `stage=retry-fill`
- `stage=send-ready controls=...`
- `stage=send-start ...`

## Case A: Single Queue Item Cold-Open

### Setup

1. ปิดแท็บ Gemini ที่ค้างอยู่ทั้งหมด
2. เตรียม queue ให้มี 1 item เท่านั้น
3. กด `สร้างจากคิว`

### Expected Browser Truth

- Gemini เปิดขึ้นมาหนึ่งแท็บ
- extension status ผ่านลำดับ `page-ready -> composer-found -> prompt-visible -> send-ready -> send-start`
- visible composer มีข้อความจริงก่อนส่ง
- มี actionable send control หรือ state transition ที่สมเหตุผล
- item จบเป็น `done` ไม่ใช่ `error`

### Failure Signals ที่ต้องจด

- visible composer ยังว่าง แต่ log ไปถึง `send-ready`
- เห็น `stage=reacquire` หรือ `stage=retry-fill` แล้วสุดท้ายยังไม่เกิด `prompt-visible`
- มีข้อความใน composer แล้ว แต่ error เป็น `ยังไม่พบ send-ready control`
- มีข้อความใน composer แล้ว และมีการกดส่ง แต่ error เป็น `send-start ไม่เกิดหลังพยายามกดส่ง`
- popup ถูกปิดเร็วเกินไปจนเก็บ evidence ไม่ทัน

### Capture

- screenshot ตอน fail
- console log ที่เห็น stage ล่าสุด
- queue item status สุดท้าย

## Case B: Two Queue Items Warm-Tab Continuation

### Setup

1. ปิดแท็บ Gemini ทั้งหมดก่อนเริ่ม
2. เตรียม queue 2 items
3. กด `สร้างจากคิว`

### Expected Browser Truth

- item แรกผ่าน stage เดียวกับ Case A
- item ที่สองไม่ควรผ่านเพราะ warm-tab luck อย่างเดียว
- ทั้งสอง items ควรมีพฤติกรรมสม่ำเสมอ หรืออย่างน้อยถ้าพังต้องพังคนละ stage อย่างมีเหตุผลชัด

### Regression Signals

- item แรก fail แต่ item สอง pass แบบไม่มี evidence ชี้ stage ต่างกัน
- item แรก prompt ไม่เข้า visible composer แต่ item สองเข้า
- item แรกต้องใช้ `reacquire/retry-fill` แต่ item สองไม่ต้องใช้เลย ให้ note stage difference ไว้ด้วย
- item แรกเจอ `send-ready control ยังไม่พร้อม` ซ้ำ ขณะที่ item สองกดส่งได้บนแท็บเดิม

## Decision Matrix

### GO

- Case A ผ่าน
- Case B ผ่าน
- ไม่มี false negative แบบ `ไม่พบปุ่มส่งของ Gemini` เก่า

### ITERATE

- prompt เข้า visible composer แล้ว แต่ fail ที่ `send-ready` หรือ `send-start`
- item แรกกับ item สอง behavior ดีขึ้นแต่ยังไม่สม่ำเสมอ
- evidence ชี้ DOM/state ใหม่ของ Gemini ที่ heuristic ปัจจุบันยังตีไม่แตก

### ROLLBACK

- กลับไปเจออาการเดิมแบบไม่มี stage evidence เพิ่ม
- warm-tab continuation regress หนักกว่าก่อน phase 3,4
- Grok path หรือ queue flow หลักมีผลกระทบข้างเคียงจากรอบนี้

## Evidence Template

- Build: `dist` reload แล้วหรือยัง
- Case: `A` หรือ `B`
- Result: `pass` | `iterate` | `rollback`
- Last stage log:
- Retry stage seen:
- Visible composer state:
- Send control state:
- Queue final state:
- Screenshot path or note:

## Suggested Operator Notes

- ถ้า fail ที่ `send-ready` ให้เก็บภาพบริเวณปุ่มข้าง composer ทั้งหมด
- ถ้า fail ที่ `send-start` ให้ดูว่าหลัง click แล้วปุ่มเดิม disable หรือเปลี่ยนเป็น stop control หรือไม่
- ถ้า popup ปิดเร็วเกินไป ให้ note เวลาประมาณก่อนปิด เพื่อใช้ตัดสินว่าควรชะลอ close-on-error ในรอบถัดไป