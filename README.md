# Xaffi Auto

Chrome Extension แบบ Manifest V3 สำหรับหาโพสต์บน X, สร้าง draft ด้วย Grok หรือ Gemini แบบ browser automation, และรัน workflow แบบ Full Auto ตั้งแต่ `Found -> Queue -> Draft -> Quote`

snapshot ปัจจุบันเหมาะกับ internal/operator usage และผ่านการ harden จากปัญหา runtime จริงหลายรอบแล้ว แต่ยังไม่ควรมองว่า stable ต่อการเปลี่ยน DOM ของ X หรือ AI provider

## What This Repo Does

- scan โพสต์บน X/Twitter
- เก็บโพสต์ที่เข้าเงื่อนไขไปไว้ใน `Found`
- ส่งโพสต์เข้า `Queue`
- เปิด Grok หรือ Gemini เพื่อสร้าง draft โดยไม่ใช้ API
- บันทึกเป็น `Drafts` และ `Results`
- โพสต์หรือ Quote ต่อบน X แบบอัตโนมัติ
- รัน campaign หลายหัวข้อผ่านหน้า `Full Auto`

## Current Feature Set

- AI provider switch ระหว่าง Grok และ Gemini
- Full Auto campaign หลายหัวข้อ/หลายสินค้า
- topic execution mode แบบ `round-robin` และ `drain-topic`
- quote distribution mode แบบ `sequential-by-product` และ `alternate-products`
- Auto Scout พร้อม Google Trends helper
- Auto Quote แบบ stateful ผ่าน `chrome.alarms`
- countdown Auto Quote แบบนาที+วินาที
- summary สำเร็จ/ไม่สำเร็จ/ข้าม ในหน้า Drafts
- skip failed draft อัตโนมัติระหว่าง Auto Quote
- ปุ่ม `บังคับหยุด AI` สำหรับ recovery งานค้าง
- stop-after-N-found สำหรับ Auto Scout

## Main Files

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
    ├── 2026-03-19-knowledge-base.md
    ├── 2026-03-19-update.md
    ├── 2026-03-19-full-auto-stability.md
    ├── code_review.md
    ├── implement_plan.md
    └── release_readiness.md
```

## Architecture Summary

### `background.js`

service worker ที่คุม orchestration กลางทั้งหมด

- settings/state persistence
- AI popup lifecycle
- queue processing
- drafts/results persistence
- campaign orchestration
- Auto Quote scheduling
- text normalization

### `content_x.js`

content script ฝั่ง X/Twitter

- scan tweet cards
- parse views
- inject action buttons
- open quote flow
- fill compose input
- auto submit พร้อม verification
- run search/scout behavior

### `content_ai.js`

content script ฝั่ง Grok/Gemini

- detect composer
- type prompt แบบ human-like
- click send
- wait/extract response
- strip tool-status noise
- send response กลับพร้อม `requestId`

### `sidepanel.*`

UI หลักของ operator

- Automation
- Full Auto
- Drafts
- Results
- Trends
- Found
- Queue
- Settings

## Key Runtime Behavior

### Full Auto

flow ที่ตั้งใจตอนนี้คือ:

1. เลือก topic จาก campaign
2. ค้นหาใน X แบบ `Top`
3. เก็บ source post เข้า `Found`
4. เติม `processQueue`
5. generate draft โดยใช้ product/productLink ของ topic นั้น
6. ส่งเข้า Auto Quote ตาม policy

behavior ที่ harden แล้ว:

- ไม่ใช้ `Latest`
- พิมพ์ query และกด Enter จริง
- no-results จะข้าม topic ได้
- ชน limit จะ pause campaign แทน reload วน
- หัวข้อแต่ละอันมี metadata ติดไปถึง found/queue/draft/quote

### AI Response Safety

สิ่งที่เพิ่มเพื่อกัน context ปน:

- `requestId` ต่อ prompt
- reject stale response
- strip ข้อความ wrapper เช่น `Gemini said`
- ใช้ `productName`/`productLink` ต่อ item แทนการอิง global state อย่างเดียว

### Auto Quote

สิ่งที่ทำได้ตอนนี้:

- schedule รอบถัดไปผ่าน `chrome.alarms`
- countdown แสดงในหน้า Drafts จุดเดียว
- แสดงนาที+วินาที
- ถ้า draft fail จะ mark เป็น `post_error` และข้ามรายการนั้นอัตโนมัติ
- มี summary ว่าสำเร็จกี่รายการ ไม่สำเร็จกี่รายการ ข้ามกี่รายการ
- แสดงเหตุผลล่าสุดของ draft ที่ fail

## Installation

1. เปิด Chrome ที่ `chrome://extensions/`
2. เปิด `Developer mode`
3. กด `Load unpacked`
4. เลือกโฟลเดอร์นี้
5. กด `Reload` หลังอัปเดตโค้ด หาก permission หรือ service worker เปลี่ยน

## Typical Usage

### Manual Flow

1. เปิด X feed หรือ search page
2. ให้ extension scan โพสต์
3. เลือกโพสต์เข้า `Found` หรือ `Queue`
4. สร้าง draft ด้วย AI
5. ตรวจ draft ในหน้า Drafts
6. กด `Post to X` หรือใช้ Auto Quote

### Full Auto Flow

1. ไปแท็บ `Full Auto`
2. ตั้งชื่อ campaign
3. เพิ่ม topic หลายรายการ พร้อมสินค้าและลิงก์
4. ตั้ง target ต่อ topic
5. เลือก execution/quote mode
6. กดเริ่ม campaign
7. ติดตามผลใน `Found`, `Queue`, `Drafts`, และ monitor ของ campaign

### Recovery Flow

ถ้า AI popup หรือ queue ค้าง:

1. กด `⛔ บังคับหยุด AI`
2. ตรวจ queue/draft state
3. เริ่ม run ต่อใหม่

## Current Limits

- พึ่งพา DOM ของ X, Grok, Gemini สูงมาก
- ไม่มี automated tests
- `background.js` ยังใหญ่และรวมหลาย responsibility
- AI queue ยังใช้ทั้ง memory และ storage
- Google Trends เป็น helper แบบ best-effort
- ถ้า X เปลี่ยน DOM ของ search/composer flow อาจต้องแก้ selector หรือ timing ใหม่

## Documentation

- `doc/2026-03-19-knowledge-base.md`: knowledge base หลักของ snapshot ปัจจุบัน
- `doc/2026-03-19-update.md`: changelog ของรอบ implement วันนี้
- `doc/2026-03-19-full-auto-stability.md`: ปัญหา runtime และแนวทางแก้ของ Full Auto
- `doc/code_review.md`: grounded code review
- `doc/release_readiness.md`: release risk และ smoke-test checklist
- `doc/implement_plan.md`: แผน Full Automate Home ที่ใช้เป็นฐาน implementation

## Recommended Next Work

1. แยก `background.js` เป็นหลายโมดูล
2. เพิ่ม queue watchdog
3. เพิ่ม debug mode ใน UI
4. เพิ่ม unit tests ให้ text utilities และ prompt builder
5. ทำ smoke test ทุกครั้งหลัง X หรือ AI provider เปลี่ยน UI
