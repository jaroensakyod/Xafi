# Xafi

Chrome Extension สำหรับ workflow นี้โดยตรง:

- สแกนโพสต์บน X ที่เข้าเกณฑ์ viral
- ส่งเนื้อหาไปให้ Grok สร้างคอนเทนต์ใหม่แบบไม่ใช้ API
- เก็บผลเป็น Draft และ Results
- จัดคิวหลายโพสต์แล้วประมวลผลต่อเนื่อง
- เปิด flow Quote post บน X พร้อมเติมข้อความให้อัตโนมัติ

สถานะปัจจุบันของโปรเจกต์ไม่ใช่ prototype แล้ว แต่ยังเป็น automation-heavy extension ที่พึ่งพา DOM ของ X และ Grok สูง จึงต้องมองว่าเป็นระบบที่ใช้งานได้จริงในบาง flow และต้องเฝ้าดูความเสถียรต่อเนื่องใน production-like usage

## ฟีเจอร์หลัก

- Viral post detection จากหน้า X/Twitter
- Queue-based AI generation ผ่าน Grok
- Human-like typing บนหน้า Grok
- Draft management ใน Side Panel
- Results library แยกหน้าเก็บผลงาน
- Auto Scout พร้อม Google Trends helper
- Auto Quote workflow สำหรับโพสต์ที่มี source tweet พร้อม countdown และสถานะคิว
- Prompt และ behavior ปรับได้จาก Settings รวม prompt mode
- Auto submit ไปที่ X พร้อม verification หลังคลิกโพสต์
- Auto Quote scheduler แบบ `chrome.alarms` เพื่อให้คิวต่อรอบหลังยังเดินได้ใน MV3

## โครงสร้างไฟล์

```text
Xfollowup/
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
    ├── code_review.md
    ├── implement_plan.md
    └── release_readiness.md
```

## สถาปัตยกรรมโดยย่อ

### 1. `background.js`

ศูนย์กลางของ extension

- เก็บ settings และ state ใน `chrome.storage.local`
- เปิด popup window ของ Grok
- ควบคุมคิว `processQueue` และ in-memory queue
- รับผลลัพธ์จาก Grok แล้วบันทึกเป็น drafts/results
- ประสานงาน Auto Scout และ Auto Quote
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

รันบน `grok.com`

- หา input composer ของ Grok
- พิมพ์ prompt แบบ human-like
- หา send button แบบ heuristic
- รอคำตอบและคัดกรอง prompt echo
- ส่ง response กลับ background

### 4. `sidepanel.*`

แดชบอร์ดหลักของผู้ใช้

- Drafts
- Results preview
- Found viral posts
- Queue management
- Settings
- Auto Scout controls
- Auto Quote status/countdown

## Workflow ปัจจุบัน

1. ผู้ใช้เปิด X แล้วปล่อยให้ extension สแกนโพสต์
2. `content_x.js` ตรวจโพสต์ที่ view ถึง threshold
3. ผู้ใช้กดสร้างคอนเทนต์ หรือเลือกหลายโพสต์เข้า Queue
4. `background.js` เปิด/ใช้หน้าต่าง Grok เดิม
5. `content_ai.js` พิมพ์ prompt และรอ response
6. ผลลัพธ์ถูกบันทึกเป็น Draft และ Result
7. ผู้ใช้แก้ไข, copy, post หรือ quote ต่อจาก Side Panel
8. ถ้าเปิด Auto Quote ระบบจะโพสต์ draft ที่มี source tweet ให้อัตโนมัติทีละรายการตามเวลาที่ตั้งไว้

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

- เพิ่ม `Prompt Mode` แบบ `soft-sell` และ `hot-take`
- ปรับ prompt pipeline ให้คุม output เป็น 4 บรรทัดมากขึ้น
- เพิ่ม auto submit ไปที่ X พร้อม success/error verification หลังคลิกโพสต์
- เพิ่มสถานะ draft สำหรับ `auto_quote_queued`, `auto_quote_posting`, `posted`, `post_error`
- เพิ่ม countdown ของ Auto Quote ใน side panel
- ย้าย scheduler ของ Auto Quote ไปใช้ `chrome.alarms` เพื่อให้ทำงานต่อได้แม้ service worker ถูกพัก

## ข้อจำกัดสำคัญ

- พึ่งพา DOM ของ X และ Grok สูงมาก
- ไม่มี automated tests
- ไม่มี retry policy แบบเต็มรูปแบบสำหรับ stuck DOM states
- queue state ของ AI generation ยังใช้ทั้ง in-memory และ storage จึงยังมี edge cases ที่ต้องเฝ้าดู
- `README` เดิมใน repo นี้ไม่สะท้อนสถานะปัจจุบันแล้ว จึงถูกเขียนใหม่ในรอบนี้

## เอกสารเพิ่มเติม

- `doc/code_review.md` รีวิวแบบ grounded จากโค้ดจริง พร้อมข้อดี ข้อเสีย และความเสี่ยง
- `doc/release_readiness.md` สรุปความพร้อมก่อนปล่อยและสิ่งที่ควรทำต่อ
- `doc/implement_plan.md` แผน implementation เดิมของโปรเจกต์

## คำแนะนำก่อนใช้งานจริง

- ล็อกอิน X และ Grok ให้เรียบร้อยก่อน
- ทดสอบ queue ด้วยโพสต์ 2-3 รายการก่อนใช้งานยาว
- อย่าพึ่งถือว่า selector ปัจจุบัน stable ถ้า X หรือ Grok เพิ่งเปลี่ยน UI
- ถ้าจะปล่อยสู่สาธารณะ ควรมี logging/debug mode ที่เปิดปิดได้

## สถานะรีวิว

รีวิวเชิงโค้ดและ release readiness สำหรับ snapshot นี้ถูกสรุปไว้แล้วในโฟลเดอร์ `doc/`
