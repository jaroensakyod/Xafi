# 2026-03-19 Full Auto Stability Notes

เอกสารนี้สรุปการแก้ปัญหารอบล่าสุดของ `Xaffi Auto` หลังจากเริ่มมีการใช้งาน Full Auto แบบต่อเนื่องจริง และเจออาการค้าง/วนซ้ำใน runtime มากกว่าที่เห็นจาก static review ปกติ

## เป้าหมายของรอบนี้

ทำให้ Full Auto วิ่งตามลำดับนี้ได้เสถียรขึ้น:

1. ค้นหาโพสต์บน X
2. เก็บโพสต์เข้า `Found`
3. ส่งเข้า `Queue`
4. สร้าง `Draft`
5. เข้า `Auto Quote`

พร้อมทั้งทำให้ผู้ใช้มีปุ่ม recovery เมื่อ state ของ AI ค้าง

## อาการที่พบจริง

### 1. X เปิดที่ Latest แทน Top

ผลกระทบ:

- ได้ลำดับโพสต์ไม่ตรงกับที่ operator คาดหวัง
- Full Auto เหมือนวิ่งไปอีกหน้าหนึ่งจากที่ตั้งใจ

การแก้:

- ตัด `f=live` ออกจาก search URL
- เพิ่ม logic ตรวจว่า search page ต้องไม่ใช่ `Latest`

## 2. search page เปิดแล้ว แต่ไม่พิมพ์ค้นหาจริง

ผลกระทบ:

- เหมือนแค่เข้า URL แต่ไม่ trigger flow ค้นหาของ X แบบเต็ม
- บางรอบหน้า search ไม่ update ตาม query ใหม่

การแก้:

- ให้ campaign mode พิมพ์ query จริง
- กด Enter จริงก่อน fallback เป็น form submit หรือ direct URL

## 3. เจอโพสต์แล้วแต่ไม่ถูกเก็บต่อเป็น Found/Queue ตามหัวข้อ

ผลกระทบ:

- Found ไม่รู้ว่าโพสต์นี้มาจาก topic ไหน
- Queue และ Draft ขาด context ของ campaign/topic

การแก้:

- ใส่ `campaignId`, `topicId`, `topic`, `productName`, `productLink` ตั้งแต่ตอน save Found post
- ใช้ข้อมูลชุดเดียวกันต่อไปถึง queue/draft/quote

## 4. เจอโพสต์แล้วแต่เก็บไม่ครบ target ของหัวข้อ

ผลกระทบ:

- campaign ดูเหมือนวิ่ง แต่ยอด `foundCount` ไม่ครบตามเป้าหมาย
- บางหัวข้อถูกสลับออกเร็วเกินไปหรือไม่กลับมาเก็บต่อ

การแก้:

- เพิ่ม `foundCount` tracking ต่อ topic
- ใช้ `foundCount` แทน `generatedCount` ใน collect phase
- ปรับการสลับหัวข้อให้ตรงกับ `round-robin` และ `drain-topic`

## 5. ไปหัวข้อถัดไปแล้วค้าง หรือ reload วน

ผลกระทบ:

- X ถูก reload ซ้ำ
- หัวข้อถัดไปไม่เริ่มจริง
- campaign เหมือนอยู่ในสถานะวิ่งแต่ไม่คืบหน้า

การแก้:

- เพิ่ม heartbeat logic ใน `autoScoutProgress`
- แยก `requestedAt` ออกจาก `lastUpdated`
- ไม่ถือว่า scout healthy เพียงเพราะ background เพิ่งสั่งเริ่ม
- เพิ่ม guard ไม่ให้ `campaign.tick` re-activate scout ซ้ำเมื่อหัวข้อเดิมยัง healthy อยู่

## 6. ค้นหาไม่เจอหรือถึง limit แล้ววนซ้ำ

ผลกระทบ:

- ระบบ reload หัวข้อเดิมต่อ
- campaign ไม่ข้ามหัวข้อหรือหยุดอย่างมีเหตุผล

การแก้:

- ถ้าไม่พบผลลัพธ์ต่อเนื่อง จะส่ง `AUTO_SCOUT_NO_RESULTS` กลับ background
- topic นั้นจะถูก mark เป็นข้าม/ผิดพลาด แล้วไปหัวข้อถัดไป
- ถ้าชน `session limit` หรือ `daily limit` ระหว่าง collect phase จะ pause campaign แทนการวนใหม่

## 7. AI busy state ค้าง และเริ่มงานใหม่ไม่ได้

อาการที่ operator เจอ:

- alert ว่า `AI กำลังทำงานอยู่ กรุณารอให้เสร็จก่อน`
- แต่ในความเป็นจริง queue หรือ popup อาจค้างไปแล้ว

การแก้:

- เพิ่มคำสั่ง `FORCE_STOP_AI` ใน background
- เพิ่มปุ่ม `⛔ บังคับหยุด AI` ใน side panel
- คำสั่งนี้จะ:
  - เคลียร์ `pendingPrompt`
  - ล้าง in-memory AI queue
  - reset `isProcessingAIQueue`
  - ปิดหน้าต่าง AI popup
  - mark queue item ที่กำลัง `processing` เป็น `error`
  - pause campaign ถ้าค้างอยู่ใน phase `generating`

## สรุปเชิงสถาปัตยกรรม

รอบนี้ไม่ได้เพิ่ม feature ใหม่เป็นหลัก แต่เป็นการทำให้ state machine ของ Full Auto กับ AI queue สะท้อน runtime จริงมากขึ้น โดยเฉพาะ:

- collect phase ใช้ `Found -> Queue` จริง
- topic progress ใช้ตัวนับที่ถูกกับ phase
- search flow บน X ไม่อิงแค่ URL
- มี recovery path สำหรับ operator เมื่อ AI ค้าง

## ข้อจำกัดที่ยังเหลือ

- selector ของ X search/results ยังเปราะต่อการเปลี่ยน UI
- AI provider ยังพึ่ง DOM มาก
- ยังไม่มี automated test สำหรับ campaign runtime
- การยืนยันผลลัพธ์ที่ดีที่สุดยังต้องทำผ่าน live browser run

## ข้อแนะนำก่อนใช้งานจริง

1. เริ่มทดสอบด้วย campaign เล็กก่อน เช่น 2 หัวข้อ หัวข้อละ 1-2 โพสต์
2. ถ้าเจอ AI ค้าง ให้ใช้ `บังคับหยุด AI` ก่อนเริ่มใหม่
3. ถ้า X เปลี่ยน DOM ของ search page ควรทดสอบ `Top`, การพิมพ์ query, และ no-results behavior ใหม่ทันที