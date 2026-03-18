# Implementation Plan: X Viral Content Repurpose Extension

## 1. ภาพรวมโปรเจกต์ (Project Overview)
Chrome Extension สำหรับค้นหาโพสต์ Viral (500k+ views) บน X (Twitter) จากหน้า Trending แล้วนำเนื้อหาไปประมวลผลผ่าน x.ai โดยจำลองพฤติกรรมการพิมพ์ของมนุษย์ (เพื่อเลี่ยง Anti-bot) จากนั้นเก็บผลลัพธ์ที่ได้ไว้ในระบบ เพื่อให้ผู้ใช้งานนำไปกดโพสต์ด้วยตัวเอง (Manual Post) 

**จุดเด่นหลัก:**
- **ไม่ใช้ API ข้ามระบบ:** ทำงานบนหน้าเว็บ x.ai โดยตรงด้วยเทคนิค Human-like Typing Simulation
- **Half-Screen UI (Sidebar/Iframe):** แบ่งครึ่งหน้าจอ (หรือเปิดเป็น Side Panel ดึงหน้า x.ai มาแสดง) จะไม่มีการเด้งเปิด Tab ใหม่ให้เสียสมาธิ
- **Prompt Structure:** บังคับโครงสร้าง หัวเปิด -> Bullet -> สรุป ด้วยภาษาพูดแบบเพื่อนสนิท

---

## 2. สถาปัตยกรรมระบบ (Architecture & UI)

### 2.1 รูปแบบ Half-Screen UI
จะใช้เทคนิค **Chrome Side Panel API** หรือ **Injected Iframe** (แนะนำ Iframe ฝังขวาของจอ)
- **ฝั่งซ้าย (60%):** หน้าเว็บ X.com ปกติที่คุณกำลังเล่น
- **ฝั่งขวา (40%):** แผงของ Extension ที่โหลดหน้าเว็บ `x.ai` ซ้อนไว้ด้านใน หรือเป็น UI ของ Extension เองที่ซ่อน Iframe ของ x.ai ไว้ทำงานเบื้องหลัง
- *หมายเหตุ: การฝัง iframe ของ x.ai ต้องจัดการเรื่อง X-Frame-Options หาก x.ai บล็อก จะใช้ Chrome Side Panel API ดึงหน้า x.ai มาเปิดด้านข้างแทน*

### 2.2 โครงสร้างไฟล์
- `manifest.json` (Manifest V3)
- `content_script.js` (รันบน x.com เพื่อหาโพสต์ 500k+ และสร้างแผง UI)
- `ai_script.js` (รันบน x.ai เพื่อจำลองคนพิมพ์ และดูดผลลัพธ์กลับ)
- `background.js` (ตัวกลางสื่อสารข้อมูลระหว่าง x.com กับ x.ai และจัดการ Storage)
- `popup.html / popup.js` (หน้าต่างจัดการคิวโพสต์ที่รอคนมากดยืนยัน)
- `styles.css` (ตกแต่งปุ่มและ Half-screen UI)

---

## 3. Workflow การทำงาน (Step-by-Step)

### Step 1: ค้นหาและดักจับ (Scraping & Trigger)
1. `content_script.js` เฝ้ามอง (Observe) หน้าจอตอนสอดส่องหน้า Trending
2. หา Element ตัวเลข Views ถ้าเจอ `500K` หรือมากกว่า จะทำไฮไลต์โพสต์นั้น
3. แทรกปุ่ม **"🔥 Create Post (AI)"** ติดไว้ที่โพสต์นั้น
4. เมื่อผู้ใช้กดปุ่ม ระบบจะ Copy ข้อความต้นทาง (Context)

### Step 2: ประมวลผลแบบเนียนขั้นสุด (Human-like AI Prompting)
1. เมื่อกดปุ่ม Half-Screen ของ `x.ai` จะสไลด์เปิดออกมาด้านข้าง
2. โค้ดจะส่งค่าข้อความผ่าน `Message Passing` ไปยัง `ai_script.js` ที่ฝังอยู่ในครึ่งจอของ `x.ai`
3. **Typing Simulation:** `ai_script.js` เริ่มโฟกัสที่ช่อง Input ของ x.ai แล้วทำพฤติกรรม:
   - พิมพ์ทีละตัวอักษร ด้วยการสุ่ม Delay (หน่วงเวลา 30-150ms ต่อตัวอักษร)
   - มีการหยุดพักหายใจ (Pause) ทุกๆ 30-50 ตัวอักษร
   - ยิง Event: `keydown`, `input`, `keyup` ให้ครบถ้วนเพื่อไม่ให้ระบบจับได้ว่าเป็น Script วางข้อความ
4. **Prompt Template ที่จะพิมพ์:**
   ```text
   กำหนดบทบาท: คุณคือวัยรุ่นที่ชอบเล่นทวิตเตอร์ ให้สรุปเนื้อหาด้านล่างนี้ โดยใช้ภาษาพูดเหมือนเพื่อนเล่าเรื่องให้เพื่อนฟัง ห้ามใช้ภาษาทางการเด็ดขาด 
   และต้องบังคับโครงสร้าง 3 ส่วนดังนี้:
   1. หัวเปิดเรื่องให้น่าสนใจ
   2. โครงสร้างเนื้อหาหลักเป็น Bullet (-) สั้นๆ กระชับ เข้าใจง่าย
   3. สรุปทิ้งท้ายที่เกี่ยวโยงกับโพสต์ต้นทาง

   เนื้อหาต้นทาง: [วางเนื้อหาที่ดูดมาจาก 500k views]
   ```
5. จำลองการกดปุ่ม Enter (Send) สุ่ม delay 500-1000ms

### Step 3: การรวบรวมข้อมูล (Extract & Store)
1. `ai_script.js` เฝ้ารอจนกว่า x.ai จะ generate ข้อความเสร็จ (สังเกตจากปุ่ม Stop Gen หายไป หรือมีปุ่ม Copy โผล่มา)
2. ดูดข้อความ Response สุดท้ายที่ AI ตอบกลับมา
3. ส่งข้อมูลกลับไปที่ `background.js` เพื่อเซฟลง `chrome.storage.local` เป็น "Draft (ร่าง)"
4. ปิดหรือซ่อนหน้าต่าง Half-screen

### Step 4: การโพสต์โดยมนุษย์ (Manual Review & Post)
1. ในเวลาที่ผู้ใช้ต้องการ ผู้ใช้กดเปิด Extension Popup (หรือหน้า Dashboard)
2. แถบ UI จะแสดงรายการ "ข้อความที่ AI เตรียมไว้ให้" ทั้งหมด
3. ผู้ใช้กดอ่าน และสามารถ Edit แก้ไขได้
4. กดปุ่ม `Post to X` -> Extension จะสลับหน้าจอไปที่กล่องตั้่งโพสต์ของ X แล้วพิมพ์/วาง ข้อความนั้นให้
5. **ผู้ใช้กดปุ่ม "Post" ด้วยตัวเอง** เป็นอันจบกระบวนการปลอดภัย 100%

---

## 4. แผนการพัฒนา (Development Phases)

- **Phase 1: Project Setup & Half-screen UI (25%)**
  - ตั้งค่า Manifest V3 
  - สร้างระบบแบ่งหน้าจอซ้าย-ขวา หรือ Side panel สำหรับ x.com และ x.ai

- **Phase 2: X.com Parser (50%)**
  - เขียน Logic หากล่อง Tweet และตัวเลขยอด View
  - ฝังปุ่ม Custom UI บนหน้าเว็บ

- **Phase 3: Human-like Typing Engine (75%)**
  - พัฒนาอัลกอริทึมการพิมพ์จำลองมนุษย์
  - นำ Prompt เข้าไปสั่งงาน x.ai โดยไม่พึ่ง API รอดูกลไก Anti-bot ของหน้าเว็บ

- **Phase 4: Output Extraction & Dashboard (100%)**
  - ดึงข้อมูลจาก x.ai ที่สร้างเสร็จ
  - สร้างหน้า UI สำหรับพักข้อมูล (Draft Queue)
  - สร้างปุ่มโยนข้อความกลับไปที่ช่อง Post ของ X

## 5. ความเสี่ยงและวิธีรับมือ (Risks & Mitigations)
1. **DOM Structure Changes:** ทั้ง X และ x.ai มีการเปลี่ยนชื่อ Class บ่อย ต้องใช้ CSS Selectors ที่ยืดหยุ่น เช่น การหาจาก `aria-label` หรือโครงสร้าง HTML ร่วมกับการใช้ MutationObserver
2. **Iframe Blocking:** หาก x.ai บล็อก iframe (`X-Frame-Options: DENY`) เราจะเปลี่ยนไปใช้ **Chrome Side Panel API** ซึ่งได้รับอนุญาตจาก Browser โดยตรง เปิดแผงด้านขวาเนียนๆ ได้เหมือนกัน