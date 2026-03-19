# Xaffi Auto

Chrome Extension (Manifest V3) สำหรับ workflow หาโพสต์ viral บน X, สร้างคอนเทนต์ด้วย AI provider แบบไม่ใช้ API, และปล่อย automation flow ต่อเนื่องจาก side panel.

snapshot ปัจจุบันรองรับ:

- viral scan บน X/Twitter
- AI generation ผ่าน Grok หรือ Gemini
- Full Auto campaign orchestration หลายหัวข้อ
- queue, drafts, results, และ auto quote
- manual recovery ด้วยปุ่ม `บังคับหยุด AI`
- Google Trends helper สูงสุด 20 รายการพร้อม compact labels

สถานะปัจจุบันไม่ใช่ prototype แล้ว แต่ยังเป็น automation-heavy extension ที่พึ่งพา DOM ของ X และ AI provider สูง จึงเหมาะกับ internal / operator usage มากกว่าการอ้างว่า stable เต็มรูปแบบ

## ฟีเจอร์หลัก

- Viral post detection จากหน้า X/Twitter
- Queue-based AI generation ผ่าน Grok หรือ Gemini
- Human-like typing บนหน้า AI provider
- Draft management ใน Side Panel
- Results library แยกหน้าเก็บผลงาน
- Automation tab สำหรับ Auto Scout และ runtime progress
- Full Auto campaign tab สำหรับหลายหัวข้อ/หลายสินค้า
- Auto Scout พร้อม Google Trends helper
- Auto Quote workflow สำหรับโพสต์ที่มี source tweet พร้อม countdown และสถานะคิว
- Prompt และ behavior ปรับได้จาก Settings รวม AI provider และ prompt mode
- Auto submit ไปที่ X พร้อม verification หลังคลิกโพสต์
- Auto Quote scheduler แบบ `chrome.alarms` เพื่อให้คิวต่อรอบหลังยังเดินได้ใน MV3
- หยุด Auto Scout เมื่อเจอครบจำนวนโพสต์ที่ตั้งไว้ได้
- ปุ่ม `บังคับหยุด AI` สำหรับเคลียร์ state ค้างของ AI queue / pending prompt

## โครงสร้างไฟล์

```text
Xafi/
├── manifest.json
├── background.js
├── content_ai.js
├── content_x.js
├── content_x.css
├── sidepanel.html
├── sidepanel.js
├── sidepanel.css
├── results.html
├── results.js
├── results.css
├── README.md
└── doc/
    ├── 2026-03-19-update.md
    ├── 2026-03-19-full-auto-stability.md
    ├── code_review.md
    ├── implement_plan.md
    └── release_readiness.md
```

## สถาปัตยกรรมโดยย่อ

### 1. `background.js`

ศูนย์กลางของ extension

- เก็บ settings และ state ใน `chrome.storage.local`
- เปิด popup window ของ AI provider ที่เลือกไว้
- ควบคุมคิว `processQueue` และ in-memory queue
- รับผลลัพธ์จาก Grok แล้วบันทึกเป็น drafts/results
- ประสานงาน Auto Scout, Full Auto campaign, และ Auto Quote
- เก็บ `autoQuoteState` และ schedule รอบถัดไปผ่าน `chrome.alarms`

### 2. `content_x.js`

รันบน `x.com` และ `twitter.com`

- สแกน tweet article
- parse view count จากหลาย selector
- inject ปุ่ม `AI Create Post`
- เติมข้อความลง X compose / quote composer
- กดโพสต์ให้อัตโนมัติและตรวจ feedback หลัง submit
- ทำ auto-scrolling สำหรับ Auto Scout

### 3. `content_ai.js`

รันบน `grok.com` และ `gemini.google.com`

- หา input composer ของ AI provider
- พิมพ์ prompt แบบ human-like
- หา send button แบบ heuristic
- รอคำตอบและคัดกรอง prompt echo
- ส่ง response กลับ background

### 4. `sidepanel.*`

แดชบอร์ดหลักของผู้ใช้

- Automation tab
- Full Auto campaign tab
- Drafts
- Results preview
- Found viral posts
- Queue management
- Settings
- Auto Scout controls พร้อม stop-after-N-found
- Auto Quote status/countdown
- Google Trends tab แยกจาก Found

## Workflow ปัจจุบัน

1. ผู้ใช้เปิด X แล้วปล่อยให้ extension สแกนโพสต์
2. `content_x.js` ตรวจโพสต์ที่ view ถึง threshold
3. ผู้ใช้กดสร้างคอนเทนต์ หรือเลือกหลายโพสต์เข้า Queue
4. `background.js` เปิด/ใช้หน้าต่าง AI provider เดิม
5. `content_ai.js` พิมพ์ prompt และรอ response
6. ผลลัพธ์ถูกบันทึกเป็น Draft และ Result
7. ผู้ใช้แก้ไข, copy, post หรือ quote ต่อจาก Side Panel
8. ถ้าเปิด Auto Quote ระบบจะโพสต์ draft ที่มี source tweet ให้อัตโนมัติทีละรายการตามเวลาที่ตั้งไว้

## Full Auto Workflow

1. ไปแท็บ `Full Auto`
2. ตั้งชื่อ campaign
3. เพิ่มหลายหัวข้อ โดยแต่ละหัวข้อมี hashtag, product, product link, และ target post count ของตัวเอง
4. เลือก topic execution mode ระหว่าง `round-robin` กับ `drain-topic`
5. เลือก quote distribution mode ระหว่าง `sequential-by-product` กับ `alternate-products`
6. กดเริ่ม campaign เพื่อให้ระบบทำงานตามลำดับ `Found -> Queue -> Draft -> Quote`

รายละเอียด runtime ปัจจุบัน:

- campaign จะเก็บโพสต์เข้า `Found` และ `Queue` ก่อนเสมอ ไม่ยิง AI ข้าม queue โดยตรง
- metadata ของหัวข้อ เช่น `campaignId`, `topicId`, `topic`, `productName`, `productLink` จะถูกติดไปกับ Found post ตั้งแต่ตอนเจอโพสต์
- campaign mode จะเปิดหน้า search ของ X แบบ `Top` ไม่ใช้ `Latest`
- เมื่อหัวข้อใดเจอโพสต์แล้ว ระบบจะสลับหรือทำต่อให้ตรงกับ `round-robin` / `drain-topic`
- เมื่อไม่พบผลลัพธ์ใน X ต่อเนื่อง ระบบจะ mark หัวข้อนั้นเป็นข้ามและไปหัวข้อถัดไปแทนการ reload วน
- เมื่อชน `session limit` หรือ `daily limit` ระหว่าง collect phase ระบบจะ pause campaign พร้อมสถานะ แทนการเริ่มหาใหม่ซ้ำ
- ถ้า AI queue หรือ popup ค้าง ผู้ใช้สามารถกด `บังคับหยุด AI` เพื่อเคลียร์ state และค่อยเริ่มใหม่ได้

## การติดตั้ง

1. เปิด Chrome ไปที่ `chrome://extensions/`
2. เปิด `Developer mode`
3. กด `Load unpacked`
4. เลือกโฟลเดอร์นี้
5. ตรวจสอบว่าอนุญาตสิทธิ์ตาม `manifest.json`

ถ้าอัปเดตจาก snapshot เก่าที่ยังไม่เคยมี permission `alarms` ให้กด `Reload` extension หนึ่งครั้งหลังอัปเดตโค้ด

## การใช้งานแบบย่อ

### Viral scan

1. เปิดหน้า X feed หรือ explore/trending
2. รอให้ extension ไฮไลต์โพสต์ที่เข้าเกณฑ์
3. กด `AI Create Post` หรือเลือกหลายโพสต์เข้าคิว

### Queue processing

1. ไปแท็บ `Found`
2. เลือกหลายโพสต์ด้วย checkbox
3. กด `เข้าคิว AI`
4. ไปแท็บ `Queue`
5. กด `สร้างคอนเทนต์ตามคิว`

### Automation / Auto Scout

1. ไปแท็บ `Automation`
2. ตั้ง hashtag, product, และ product link
3. เปิด `Auto Scout`
4. ถ้าต้องการให้หยุดเมื่อเจอครบจำนวนหนึ่ง ให้เปิด `หยุดเมื่อเจอโพสต์ที่เข้าเงื่อนไข` และกำหนดจำนวนใน Settings
5. ถ้างาน AI ค้างหรือขึ้นสถานะว่ากำลังทำงานอยู่ตลอด ให้ใช้ปุ่ม `⛔ บังคับหยุด AI`

### Draft to X

1. ไปแท็บ `Drafts`
2. ตรวจข้อความที่ได้
3. กด `Post to X` เพื่อให้ระบบพิมพ์และกดโพสต์เอง หรือใช้ Auto Quote ตาม flow

### Auto Quote

1. เตรียม draft ที่มี `sourceUrl`
2. ตั้งช่วงเวลา Auto Quote ใน Settings
3. กด `เริ่ม Auto Quote`
4. ดู countdown และสถานะคิวจากแถบด้านบนของแท็บ Drafts
5. ระบบจะโพสต์เองทีละรายการและรอเวลารอบถัดไปอัตโนมัติ

## อัปเดตล่าสุด

- รีแบรนด์ extension เป็น `Xaffi Auto`
- เพิ่มการเลือก AI provider ระหว่าง Grok และ Gemini
- เพิ่ม Full Auto campaign system สำหรับหลายหัวข้อ/หลายสินค้า
- แยกหน้า `Automation`, `Full Auto`, `Trends`, `Found` ออกจากกันชัดเจน
- จำกัด Auto Scout flow ให้สั่งผ่านหน้า Full Auto / Automation flow ที่กำหนดเท่านั้น
- เพิ่ม Google Trends fallback และ compact labels ให้รายการอ่านง่ายขึ้น
- เพิ่ม stop-after-N-found setting สำหรับ Auto Scout
- เพิ่ม footer `power by Copyright © 2026 AMTF inc.` ใน side panel
- ปรับ Full Auto runtime ให้ลำดับ collect เป็น `Found -> Queue` ก่อนเข้า generate/quote
- บังคับ X search ไปที่ `Top` และเพิ่มการพิมพ์/กดค้นหาจริงใน campaign mode
- ลดปัญหา reload loop ด้วย scout heartbeat, no-results skip, และ pause-on-limit behavior
- เพิ่มปุ่ม `บังคับหยุด AI` ใน side panel เพื่อเคลียร์ AI busy state ที่ค้างได้ทันที

## ข้อจำกัดสำคัญ

- พึ่งพา DOM ของ X และ AI provider สูงมาก
- ไม่มี automated tests
- ไม่มี retry policy แบบเต็มรูปแบบสำหรับ stuck DOM states
- queue state ของ AI generation ยังใช้ทั้ง in-memory และ storage จึงยังมี edge cases ที่ต้องเฝ้าดู
- Google Trends ยังเป็น best-effort helper เพราะ source endpoint ฝั่ง Google ไม่เสถียรทุกประเทศ/ทุกเวลา
- Full Auto ยังควรทดสอบด้วย campaign ขนาดเล็กหลัง X เปลี่ยน UI เพราะ selector ของ search/results page มีความเปราะบางสูง

## เอกสารเพิ่มเติม

- `doc/2026-03-19-update.md` สรุปงานของวันนี้แบบ changelog grounded จากโค้ดที่แก้จริง
- `doc/2026-03-19-full-auto-stability.md` สรุปปัญหาและวิธีแก้รอบล่าสุดของ Full Auto และ AI recovery
- `doc/code_review.md` รีวิวแบบ grounded จากโค้ดจริง พร้อมข้อดี ข้อเสีย และความเสี่ยง
- `doc/release_readiness.md` สรุปความพร้อมก่อนปล่อยและสิ่งที่ควรทำต่อ
- `doc/implement_plan.md` แผน Full Automate Home ที่ใช้เป็นฐานของรอบ implement นี้

## คำแนะนำก่อนใช้งานจริง

- ล็อกอิน X และ Grok ให้เรียบร้อยก่อน
- ทดสอบ queue ด้วยโพสต์ 2-3 รายการก่อนใช้งานยาว
- อย่าพึ่งถือว่า selector ปัจจุบัน stable ถ้า X หรือ Grok เพิ่งเปลี่ยน UI
- ถ้าจะปล่อยสู่สาธารณะ ควรมี logging/debug mode ที่เปิดปิดได้

## สถานะรีวิว

รีวิวเชิงโค้ดและ release readiness สำหรับ snapshot นี้ถูกสรุปไว้แล้วในโฟลเดอร์ `doc/`
