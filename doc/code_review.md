# Code Review

เอกสารนี้รีวิวจากโค้ดจริงใน repo snapshot ปัจจุบัน ไม่ได้รีวิวจากแผนเก่าหรือเจตนาการออกแบบเพียงอย่างเดียว

## Snapshot Update 2026-03-18

รอบนี้มีการเปลี่ยนแปลงที่สำคัญและควรนับว่าเป็น improvement จริงใน architecture ของ flow ปัจจุบัน:

- เพิ่ม `promptMode` (`soft-sell`, `hot-take`) และปรับ default prompt ให้คุมโทนกับโครงสร้างได้แม่นขึ้น
- เพิ่ม post-processing ฝั่ง background เพื่อ normalize output ให้กลับมาเป็น 4 บรรทัดก่อน save draft
- `Post to X` เปลี่ยนจาก prepare compose อย่างเดียวไปเป็น auto submit พร้อม success/error verification
- `Auto Quote` เปลี่ยนจาก loop ที่อิง memory timer ไปเป็น stateful flow ที่เก็บสถานะและ countdown ใน storage
- scheduler ของ `Auto Quote` ย้ายไปใช้ `chrome.alarms` แทน `setTimeout` เพื่อรับมือ lifecycle ของ MV3 service worker ได้ดีขึ้น

สรุปเชิง review สำหรับ snapshot นี้: ไม่พบ blocking issue ใหม่จากชุดแก้ล่าสุดเมื่อดูจากโค้ดและ static validation แต่ยังมี residual risk เดิมจาก DOM fragility และการไม่มี test harness

## สรุปภาพรวม

โปรเจกต์นี้มีแกนหลักชัดเจนและเดินมาถูกทางสำหรับงาน automation แบบ browser-only:

- ใช้ `background.js` เป็น coordinator กลางได้เหมาะกับ Manifest V3
- มีการแยก concern ระหว่าง X, Grok, Side Panel, Results page ชัดพอสมควร
- state สำคัญถูกเก็บใน `chrome.storage.local` ทำให้ UI หลายส่วน sync กันได้
- มีการ harden หลายจุดแล้ว เช่น queue status, prompt echo filtering, quote compose fallback

แต่ในมุม review เพื่อพร้อมใช้งานต่อเนื่อง ยังมีจุดเสี่ยงหลักจาก 3 เรื่อง:

- automation พึ่งพา DOM และ selector หนักมาก
- ไม่มี test harness หรือ observability ที่พอสำหรับจับ regression
- business state กระจายทั้ง memory และ storage ทำให้ recovery บางกรณียังเปราะ

## จุดที่ทำได้ดี

### 1. แยกบทบาทของไฟล์ค่อนข้างชัด

- `background.js` คุม orchestration, queue, persistence, routing
- `content_x.js` ดูเฉพาะ X scanning และ compose flow
- `content_ai.js` ดูเฉพาะ Grok typing และ response extraction
- `sidepanel.js` ดูเฉพาะ UI interactions

ผลคือแม้ไฟล์จะยาว แต่ mental model ของระบบยังตามได้

### 2. Queue model พัฒนามาถูกทาง

จุดที่ดีใน implementation ปัจจุบัน:

- มี persistent queue ผ่าน `processQueue`
- มี status ชัดเจน `queued`, `processing`, `done`, `error`
- มี update timestamp และ error field
- queue item ไม่หายจาก UI ทันทีหลังทำงานเสร็จ

นี่เป็นการยกระดับจาก “ยิงทีละโพสต์” ไปเป็น workflow จริงที่ผู้ใช้ตรวจสอบย้อนหลังได้

### 3. Grok extraction ดีขึ้นกว่าระดับ prototype มาก

ใน `content_ai.js` มีการเพิ่ม logic ที่จำเป็นจริง:

- baseline snapshot ของข้อความก่อนส่ง
- prompt echo filtering
- candidate ranking
- suspicious response filtering
- fallback รอ response รอบถัดไป

ชุดนี้ทำให้ปัญหา “เอา prompt กลับมาแทน answer” ลดลงในเชิงโครงสร้าง ไม่ใช่แก้แค่ปลายเหตุ

### 4. X compose flow มี verification ไม่ใช่ blind write

ใน `content_x.js` การเติมข้อความมีการ:

- clear input
- ลอง paste/insert ก่อน
- ตรวจว่าข้อความเข้า compose จริง
- fallback ไป human-like typing
- throw error ถ้าเขียนไม่เข้า

นี่เป็น design ที่ถูกต้องสำหรับ UI automation ที่ DOM เปลี่ยนได้

### 5. Side Panel ใช้งานจริงได้

UI ไม่ใช่แค่ demo:

- มี progress panel
- มี queue tab
- มี Google Trends helper
- มี result preview
- มี settings ครบทั้ง AI, scout, quote timing

สำหรับ internal tool หรือ operator-facing tool ถือว่า usable แล้ว

## จุดที่ยังไม่ดีพอ

### 1. `background.js` ใหญ่เกินและรับผิดชอบหลายเรื่องเกินไป

ตอนนี้ไฟล์นี้ทำพร้อมกันหลายบทบาท:

- settings store
- message router
- queue manager
- Grok window lifecycle
- draft/result persistence
- auto quote scheduler
- Google Trends fetcher
- text normalization helpers

ผลเสีย:

- เปลี่ยน feature หนึ่งอาจกระทบ flow อื่นง่าย
- regression tracing ยาก
- testing แบบแยกส่วนแทบทำไม่ได้

ข้อเสนอแนะ:

- แยกอย่างน้อยเป็น `queue`, `drafts`, `grok-session`, `auto-scout`, `utils/text`

### 2. queue ใช้ทั้ง in-memory และ storage พร้อมกัน

โครงสร้างปัจจุบันมีทั้ง:

- `processQueue` ใน storage
- `aiProcessQueue` ใน memory
- `pendingPrompt` ใน memory
- `isProcessingAIQueue` ใน memory

ข้อดีคือ runtime ง่ายขึ้น แต่ข้อเสียคือ recovery หลัง service worker sleep/restart ยังไม่แข็งแรงพอ

ตัวอย่างความเสี่ยง:

- worker หลุดตอน item เป็น `processing`
- `pendingPrompt` หาย แต่ storage ยังบอกว่ากำลังทำงาน
- queue กลับมาทำงานซ้ำหรือค้างได้ถ้า state ไม่ sync สมบูรณ์

ข้อเสนอแนะ:

- เพิ่ม watchdog และ recovery pass ตอน worker start
- เก็บ `pendingPrompt` บางส่วนใน storage
- มี `lease` หรือ `processingStartedAt` timeout สำหรับ item ที่ค้าง

### 3. selector strategy ยัง fragile ตามธรรมชาติของ target site

แม้จะมีหลาย fallback แล้ว แต่ยังเป็น heuristic-heavy logic เช่น:

- finding send button บน Grok
- หา quote action บน X
- หา source tweet article
- parse views จาก engagement DOM

จุดนี้ไม่ใช่ “โค้ดผิด” แต่เป็น technical risk สูงโดยธรรมชาติของงานประเภทนี้

ข้อเสนอแนะ:

- สร้าง selector registry แยกไฟล์
- ทำ debug mode ที่แสดง selector hit/miss
- log ว่า fail ที่ stage ไหน เช่น `find-input`, `send-click`, `wait-response`, `open-quote`, `fill-compose`

### 4. Side Panel ยังมี blocking popup อยู่หลายจุด

แม้ popup บางส่วนถูกถอดออกแล้ว แต่ใน `sidepanel.js` ยังมี `alert` และ `confirm` หลายจุด

ผลกระทบ:

- UX สะดุด
- ยากต่อ automation ต่อเนื่อง
- inconsistent กับแนวทางที่เลี่ยง popup ใน queue flow ไปแล้ว

ข้อเสนอแนะ:

- เปลี่ยน `alert` เป็น inline toast/status ทั้งหมด
- ใช้ modal ของ UI เองแทน `confirm`

### 5. ไม่มี test coverage และไม่มี deterministic simulation

ไม่มี unit test, integration test, หรือ mock DOM test สำหรับ logic สำคัญ เช่น:

- `buildPrompt`
- `buildFinalPostText`
- `normalizeDraftStructure`
- `parseViewCount`
- queue transition
- response extraction ranking

ผลคือทุก regression ต้องจับจาก manual testing เป็นหลัก

ข้อเสนอแนะ:

- แยก pure functions ไปไฟล์ utility
- เริ่มด้วย test ของ text transformation ก่อน
- ใช้ fixture HTML สำหรับ parser บางส่วน

### 6. observability ยังเบาเกินไป

ตอนนี้มี console log บางจุด แต่ยังไม่พอสำหรับ debug production issues แบบผู้ใช้รายงานว่า “ไม่ทำงาน”

ควรมีอย่างน้อย:

- last action
- current queue item id
- current stage
- last error
- timestamps สำคัญ

และให้ดูได้จาก side panel หรือ results/debug tab

## ความเสี่ยงเชิงพฤติกรรม

### Risk A: Auto Quote อาจชนกับ UI timing ของ X

แม้ตอนนี้มี guard ไม่ให้เริ่มพร้อม AI queue และมี fallback การพิมพ์ แต่ X เป็น React app ที่ timing sensitive มาก จุดนี้ยังถือว่า fragile

### Risk B: Grok response ready detection ยังพึ่ง heuristic

ถ้า Grok เปลี่ยน UI หรือเพิ่ม system text ใหม่ logic `waitForAIResponse` อาจรับข้อความผิดอีกได้

### Risk C: Auto Scout ถูกจำกัดด้วยการ normalize เป็น hashtag เสมอ

`sidepanel.js` บังคับ prefix `#` ให้ query ทุกครั้ง ซึ่งเหมาะกับบางเคส แต่จำกัด use case ที่ต้องการค้นหาคำปกติหรือ phrase search

### Risk D: service worker lifecycle ดีขึ้นสำหรับ Auto Quote แต่ AI queue ยังพึ่ง memory

Auto Quote ได้ลดความเสี่ยงลงชัดเจนเพราะใช้ `chrome.alarms` และมี restore pass ตอน worker ตื่นขึ้นมาใหม่แล้ว

อย่างไรก็ตาม AI generation queue ยังมี state สำคัญที่พึ่ง in-memory เช่น `pendingPrompt`, `aiProcessQueue`, `isProcessingAIQueue` จึงยังไม่ถือว่า recoverable เต็มรูปแบบทั้งระบบ

## ความพร้อมเชิง release

### พร้อมในระดับไหน

พร้อมสำหรับ:

- internal use
- operator-driven workflow
- iterative testing กับผู้ใช้กลุ่มเล็ก

ยังไม่พร้อมสำหรับ:

- public release แบบไม่ต้อง support ใกล้ชิด
- long unattended automation
- claim ว่า stable ต่อ DOM changes

## ข้อเสนอแนะลำดับถัดไป

1. แยก `background.js` เป็น module ย่อย
2. เพิ่ม watchdog สำหรับ AI queue item ที่ค้าง
3. ถอด popup blocking ใน side panel ออกทั้งหมด
4. แยก pure utilities แล้วเริ่มเขียน tests
5. เพิ่ม debug/diagnostics panel
6. แยก selector registry เพื่ออัปเดต DOM change ง่ายขึ้น

## บทสรุป

จุดแข็งของ codebase นี้คือมี workflow ครบจริง ไม่ได้หยุดแค่การ scrape หรือ generate text แต่ไปถึง queue, drafts, results, quote flow และ settings control แล้ว

จุดอ่อนหลักไม่ใช่ logic พื้นฐาน แต่เป็นความเปราะของ browser automation, การรวมความรับผิดชอบไว้ในไฟล์ใหญ่, และการขาดเครื่องมือ test/diagnostics สำหรับจับ regression

ถ้าจะพัฒนาต่อ โปรเจกต์นี้ควรขยับจาก “ทำให้ใช้งานได้” ไปสู่ “ทำให้ recoverable, observable, และ maintainable”