# Release Readiness

เอกสารนี้สรุปว่า snapshot ปัจจุบันควรปล่อยในระดับไหน และก่อน push/public share ควรเก็บงานอะไรเพิ่ม

## สถานะปัจจุบัน

ระดับความพร้อม: `usable with caution`

ความหมาย:

- ใช้งานจริงได้ใน flow หลัก
- เหมาะกับ internal use หรือใช้งานโดยคนที่เข้าใจระบบ
- ยังไม่ควรสื่อสารว่าเป็น extension ที่ stable ต่อ UI changes ของ X/Grok

## สิ่งที่พร้อมแล้ว

- manifest และ permission ครบสำหรับ flow ปัจจุบัน
- side panel ใช้งานจริงได้
- draft/result persistence มีแล้ว
- queue persistence มีแล้ว
- auto quote มีการกันไม่ให้ชนกับ AI queue
- auto quote scheduler ใช้ `chrome.alarms` แล้ว จึงเหมาะกับ MV3 กว่าเดิม
- side panel มี countdown และสถานะ Auto Quote ตาม state จริง
- prompt mode และ output normalization ทำให้ draft มีรูปแบบสม่ำเสมอขึ้น
- prompt และข้อความสุดท้ายมี normalization ฝั่ง background
- error diagnostics จาก editor ตอนนี้ไม่มี

## สิ่งที่ยังเป็นหนี้เทคนิค

### 1. ไม่มี automated tests

ผลกระทบ:

- regression จับช้า
- refactor `background.js` ยาก
- parser/formatter เปลี่ยนแล้วมั่นใจยาก

### 2. ไม่มี `.git` แยกในโฟลเดอร์นี้แต่แรก

จากการตรวจ git พบว่าโฟลเดอร์นี้อยู่ภายใต้ parent repo ที่ใหญ่และ dirty มาก

ผลกระทบ:

- ถ้าจะ push โปรเจกต์นี้แยก ต้องสร้าง git repo ของตัวเองในโฟลเดอร์นี้
- ห้ามใช้ parent repo ต่อโดยตรงถ้าต้องการอัปขึ้น GitHub repo ใหม่ของโปรเจกต์นี้

### 3. DOM change risk สูง

ระบบนี้จะพังได้จาก:

- เปลี่ยน `data-testid`
- เปลี่ยน menu order
- เปลี่ยน composer structure
- เปลี่ยนข้อความ aria-label

### 4. Debug support ยังไม่พอ

เวลาผู้ใช้บอกว่า:

- เข้าคิวแล้วไม่ไปต่อ
- Grok เปิดแล้วไม่ส่ง
- Quote เปิดแล้วไม่พิมพ์

ตอนนี้ยังต้องไล่ผ่าน console และ code เป็นหลัก

### 5. ยังไม่มี end-to-end verification harness

แม้ `content_x.js` จะมี post verification หลังคลิก submit แล้ว แต่การยืนยันยังเป็น heuristic จาก DOM/live-region ของ X ไม่ใช่ browser test แบบ deterministic

## สิ่งที่ควรทำก่อน public release

1. เพิ่ม `.gitignore` และแยก repo ให้ชัด
2. เพิ่ม watchdog queue timeout สำหรับ AI generation flow
3. เพิ่ม debug stage logging ที่อ่านได้จาก UI
4. ลดการใช้ popup blocking ใน side panel
5. เพิ่ม smoke test checklist ก่อนปล่อยทุกครั้ง
6. ทดสอบ Auto Quote หลัง `chrome://extensions` reload เพื่อยืนยัน permission `alarms` ทำงานตามคาด

## Smoke Test Checklist

### X scan

- เปิด X แล้วสแกน tweet ได้
- tweet ที่เกิน threshold ถูก highlight
- ปุ่ม `AI Create Post` ถูก inject ถูกตำแหน่ง

### AI generation

- เปิด Grok popup ได้
- หาช่อง input ได้
- พิมพ์ prompt ได้
- ส่ง prompt ได้
- ได้ response จริง ไม่ใช่ prompt echo

### Queue

- add หลายรายการเข้าคิวได้
- start queue แล้ว item แรกเปลี่ยนเป็น `processing`
- item ถัดไปทำต่ออัตโนมัติ
- item ที่พังกลายเป็น `error`
- item เสร็จแล้วคงอยู่ใน UI เป็น `done`

### Draft and Results

- draft ถูกบันทึก
- result page เปิดได้
- copy ใช้งานได้
- edit draft แล้ว state อัปเดตจริง

### Quote flow

- เปิด source tweet ได้
- เปิด quote composer ได้
- เติมข้อความเข้า compose ได้จริง
- กดโพสต์อัตโนมัติได้จริง
- countdown หมดเวลาแล้วรอบถัดไปยังทำงานต่อได้

## Recommended Next Milestone

milestone ถัดไปที่คุ้มที่สุด:

- refactor service worker
- add queue watchdog
- add debug mode
- add unit tests for text utilities

## Snapshot Notes

- ถ้าอัปเดตจาก snapshot เก่ามายังรอบนี้ ต้อง `Reload` extension เพื่อรับ permission `alarms`
- ในเชิง grounded review รอบนี้ Auto Quote ดีขึ้นชัดเจน แต่ยังไม่ควรสื่อสารว่า stable ต่อ DOM changes ของ X

ถ้าทำ 4 อย่างนี้ก่อน release รอบใหญ่ ความเสี่ยงหลักของโปรเจกต์จะลดลงชัดเจน