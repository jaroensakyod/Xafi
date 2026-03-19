# 2026-03-19 Knowledge Base

เอกสารนี้เป็นสรุปความรู้ของ snapshot ปัจจุบันของ `Xaffi Auto` แบบ grounded จากโค้ดที่มีอยู่จริงใน repo เพื่อใช้เป็นฐานอ้างอิงเวลาพัฒนา, debug, review, หรือ handoff งานต่อ

## 1. ภาพรวมระบบ

`Xaffi Auto` คือ Chrome Extension แบบ Manifest V3 สำหรับ workflow นี้:

1. หาโพสต์บน X ที่น่าสนใจ
2. เก็บเข้า `Found`
3. ส่งเข้า `Queue`
4. สร้าง `Draft` ด้วย AI provider แบบไม่ใช้ API
5. โพสต์/Quote ต่อบน X แบบ manual หรือ automation

ระบบนี้ถูกออกแบบเป็น operator tool มากกว่าผลิตภัณฑ์ mass-market เพราะพึ่งพา DOM ของ X, Grok, และ Gemini สูงมาก

## 2. โครงสร้างไฟล์หลัก

### `background.js`

ศูนย์กลาง orchestration ของระบบ

- จัดการ `settings`
- จัดการ `processQueue`
- จัดการ drafts/results
- คุม lifecycle ของ AI popup
- คุม Auto Scout
- คุม Full Auto campaign
- คุม Auto Quote scheduler ผ่าน `chrome.alarms`
- ทำ normalization ของข้อความก่อนบันทึก draft/final result

### `content_x.js`

รันบน X/Twitter

- scan tweet/article
- parse views และคัดเลือกโพสต์
- inject ปุ่มสร้างโพสต์
- เปิด quote composer
- เติมข้อความลง compose box
- submit โพสต์อัตโนมัติพร้อม verification
- คุม Auto Scout/search flow ในหน้า X

### `content_ai.js`

รันบน Grok และ Gemini

- หา composer/input แบบ heuristic
- พิมพ์ prompt แบบ human-like
- หา send button แบบ fallback หลายชั้น
- รอ response และกรอง prompt echo / tool status lines
- ส่งผลลัพธ์กลับ background พร้อม `requestId`

### `sidepanel.html` / `sidepanel.js` / `sidepanel.css`

แดชบอร์ดใช้งานหลัก

- Automation
- Full Auto
- Drafts
- Results
- Trends
- Found
- Queue
- Settings

## 3. Storage Keys สำคัญ

ค่าหลักที่ใช้อยู่จริงใน `chrome.storage.local`:

- `settings`
- `drafts`
- `results`
- `viralPosts`
- `processQueue`
- `autoScoutProgress`
- `autoQuoteState`
- `campaign`
- `googleTrends`

## 4. Runtime Model ปัจจุบัน

### 4.1 Found -> Queue -> Draft -> Quote

runtime ที่ตั้งใจสำหรับ Full Auto ในรอบนี้คือ:

1. เก็บ source post เข้า `Found`
2. ส่งเข้า `processQueue`
3. ให้ AI สร้าง draft
4. ส่ง draft เข้า Auto Quote ตาม policy

จุดสำคัญคือไม่ควร generate ข้าม Found/Queue ตรง ๆ เพราะจะทำให้ตาม context ของ campaign/topic ยาก

### 4.2 AI Queue

AI queue ยังใช้ทั้ง state ใน storage และ memory ร่วมกัน:

- `processQueue` อยู่ใน storage
- `pendingPrompt` อยู่ใน memory
- `isProcessingAIQueue` อยู่ใน memory
- popup/tab ของ AI provider ถูกคุมใน background

นี่เป็นจุดที่ใช้งานได้จริง แต่ยังเป็น technical debt สำคัญ

### 4.3 Auto Quote

Auto Quote ใช้ `chrome.alarms` แล้ว เพื่อให้เหมาะกับ lifecycle ของ MV3 มากกว่า `setTimeout`

state ปัจจุบันมีอย่างน้อย:

- `active`
- `phase`
- `campaignId`
- `pendingCount`
- `currentDraftId`
- `nextRunAt`
- `postedCount`
- `failedCount`
- `skippedCount`
- `lastPostedDraftId`
- `lastFailedDraftId`
- `lastFailedReason`
- `message`

## 5. Full Auto Campaign Knowledge

### 5.1 Data Model

campaign มีข้อมูลหลักเช่น:

- `id`
- `name`
- `status`
- `phase`
- `topicExecutionMode`
- `quoteDistributionMode`
- `topics`
- `activeTopicIndex`

topic มีข้อมูลหลักเช่น:

- `id`
- `topic`
- `productName`
- `productLink`
- `targetPostCount`
- `foundCount`
- `generatedCount`
- `quotedCount`
- `status`
- `errorMessage`

### 5.2 Topic Execution Modes

- `round-robin`: สลับ topic ทีละรอบ
- `drain-topic`: ทำ topic เดิมให้ครบก่อน

### 5.3 Quote Distribution Modes

- `sequential-by-product`: เรียง quote ตามสินค้าเดิมจนหมดก่อน
- `alternate-products`: สลับสินค้า/หัวข้อ

## 6. AI Provider Knowledge

### Grok และ Gemini

ตอนนี้ระบบรองรับสอง provider:

- Grok
- Gemini

flow สำคัญที่ harden แล้ว:

- content script ส่ง `requestId` กลับมาพร้อมผลลัพธ์
- background จะ reject response ที่ไม่ตรงกับ `pendingPrompt.requestId`
- มีการกรอง wrapper text เช่น `Gemini said`, `Grok said`, `assistant`
- มีการ normalize draft/final text อีกรอบฝั่ง background

### เหตุผลที่ต้องมี `requestId`

ปัญหาที่เคยเกิดจริงคือ AI ตอบช้า แล้ว response ของ request เก่าหลุดมาทับ item ใหม่ ทำให้ context topic/product ปนกัน

แนวทางปัจจุบันคือ:

1. สร้าง `requestId` ต่อ prompt
2. ส่ง `requestId` ไปที่ content script
3. content script ส่ง `requestId` กลับ
4. background รับเฉพาะ response ที่ `requestId` ตรงกัน

## 7. Prompt / Draft Normalization Knowledge

### สิ่งที่แก้แล้ว

- ใช้ `productName` และ `productLink` ต่อ item แทนการอิง global state อย่างเดียว
- `buildPrompt()` จะดึง link จาก `sourcePost.productLink` ก่อน
- `normalizeDraftStructure()` และ `buildFinalPostText()` strip wrapper text อีกรอบ

### เหตุผล

campaign หลายหัวข้อจะพังทันทีถ้า prompt ยังอิง `contextProduct` global แบบหลวม ๆ เพราะ item คนละ topic อาจใช้ prompt context เดียวกันผิดตัว

## 8. X Search / Scout Knowledge

### สิ่งที่ถูกแก้ในรอบนี้

- Full Auto ใช้ search แบบ `Top` ไม่ใช้ `Latest`
- campaign mode พิมพ์ query และกด Enter จริง
- มี no-results handling เพื่อข้ามหัวข้อได้
- มี heartbeat แยกระหว่าง `requestedAt` กับ `lastUpdated`
- มี pause behavior เมื่อชน session/daily limit

### หลักคิดที่ได้จากรอบนี้

- การเปิด URL search อย่างเดียวไม่พอ ต้อง trigger search interaction จริงด้วย
- ห้ามนับว่า scout healthy เพียงเพราะ background เพิ่งสั่งงาน ต้องรอ heartbeat จาก content script
- ถ้าหาไม่เจอ ต้องข้าม topic อย่างมีเหตุผล ไม่ใช่ reload วน

## 9. Auto Quote Knowledge

### พฤติกรรมปัจจุบัน

- โพสต์ draft ที่มี `sourceUrl` ได้อัตโนมัติ
- มี countdown ในหน้า Drafts
- แสดง summary ของงานที่สำเร็จ/ไม่สำเร็จ/ข้าม
- แสดงเหตุผลของ draft ที่โพสต์ไม่สำเร็จบน card โดยตรง
- ถ้า draft ตัวใด fail ระบบจะ mark เป็น `post_error` แล้วข้ามไปตัวถัดไปอัตโนมัติ

### สิ่งที่เพิ่งปรับเพิ่ม

- countdown แสดงเป็น `นาที + วินาที`
- ซ่อน status bar ด้านบนสำหรับข้อความ Auto Quote เพื่อให้ดู countdown ที่หน้า Drafts จุดเดียว

### หลักคิดที่ได้

- Auto Quote ไม่ควร fail ทั้ง run เพราะ draft เสียเพียงตัวเดียว
- operator ต้องเห็นทั้งภาพรวมและเหตุผลล่าสุดของ failure
- countdown ควรอยู่จุดเดียว มิฉะนั้น UI จะดูซ้ำและทำให้สับสน

## 10. Force Stop AI Knowledge

มีปุ่ม `บังคับหยุด AI` สำหรับ recovery งานค้าง

สิ่งที่คำสั่งนี้ทำ:

- เคลียร์ `pendingPrompt`
- ล้าง AI queue ใน memory
- reset flags ที่บอกว่ากำลังประมวลผล
- ปิด popup ของ AI
- mark queue item ที่กำลังค้างให้เป็น error
- pause campaign ถ้าค้างอยู่ใน phase generating

จุดนี้จำเป็น เพราะ runtime จริงของ DOM automation มีโอกาสค้างจากหน้าเว็บเปลี่ยนหรือ popup หลุดโฟกัส

## 11. Known Limits

ความเสี่ยงหลักของ snapshot ปัจจุบัน:

- DOM fragility ของ X, Grok, Gemini
- `background.js` ยังใหญ่และรับผิดชอบหลายเรื่องเกินไป
- AI queue ยังใช้ทั้ง storage และ memory
- ยังไม่มี automated tests
- sidepanel ยังมีบางจุดที่ใช้ `alert` / `confirm`
- Google Trends เป็น best-effort helper เท่านั้น

## 12. Smoke Test ที่ควรทำหลังแก้โค้ด

### AI

1. เปิด Grok/Gemini ได้
2. พิมพ์ prompt ได้
3. ได้ response จริง ไม่ใช่ prompt echo
4. draft ที่บันทึกแล้วไม่มี wrapper text เช่น `Gemini said`

### Full Auto

1. campaign เริ่มที่ topic แรกได้
2. collect เข้า Found ได้
3. queue ถูกเติมจริง
4. draft ถูกสร้างด้วย product/link ของ topic นั้นจริง
5. สลับ topic ได้ตาม execution mode

### Auto Quote

1. draft ที่พร้อม quote ถูกโพสต์ต่อเนื่องได้
2. countdown ลดลงจริง
3. ถ้า draft ใด fail จะถูก mark เป็น `post_error`
4. ระบบข้าม draft ที่ fail แล้วไปต่อได้
5. summary สำเร็จ/ไม่สำเร็จ/ข้าม แสดงตรงหน้า Drafts

## 13. Recommended Next Milestones

1. แยก `background.js` เป็นโมดูลตาม responsibility
2. เพิ่ม watchdog สำหรับ AI queue
3. เพิ่ม debug mode ที่อ่านสถานะ stage ล่าสุดได้จาก UI
4. เพิ่ม unit tests สำหรับ text normalization และ prompt builder
5. เพิ่ม smoke-test checklist แบบใช้งานก่อน release ทุกครั้ง

## 14. ข้อสรุป

snapshot ปัจจุบันไม่ใช่แค่ UI refresh แต่เป็นการย้ายระบบไปสู่ model ที่ชัดขึ้น:

- campaign-aware
- provider-aware
- state-aware มากขึ้น
- recovery-aware มากขึ้น

จุดแข็งของรอบนี้คือ runtime behavior ดีขึ้นจากปัญหาจริงที่เจอระหว่างใช้งาน ไม่ได้หยุดแค่ static review