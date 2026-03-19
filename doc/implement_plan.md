# Full Automate Home Plan

## 1. เป้าหมายรอบนี้
เปลี่ยนหน้าแรกของโปรแกรมจาก dashboard แบบแยกเครื่องมือ มาเป็นหน้า `Full Automate` ที่ใช้ตั้งงานเป็นชุดเดียวแล้วปล่อยระบบทำงานต่อเนื่องได้

สิ่งที่ต้องรองรับในรอบออกแบบนี้มี 3 ข้อหลัก:

1. เพิ่มหัวข้อ, สินค้า, และลิงก์ได้หลายหัวข้อ
2. กำหนดได้ว่าหัวข้อไหนจะหา/สร้างกี่โพสต์ และเลือกได้ว่าจะสลับหัวข้อ หรือทำหัวข้อเดียวให้ครบก่อน
3. กำหนดลำดับการ Quote ได้ว่าจะเรียงทีละสินค้า หรือสลับสินค้า

เอกสารนี้เป็นแผนก่อนลงมือเขียนโค้ด โดยยึดโครงสร้างจริงของโปรเจกต์ปัจจุบันที่มี `background.js`, `content_x.js`, `content_ai.js`, และ `sidepanel.*` เป็นแกนหลัก

## 2. ปัญหาของหน้าแรกปัจจุบัน
หน้าแรกใน side panel ตอนนี้ยังเป็นการวาง control หลายชิ้นต่อกัน เช่น query, product, product link, auto scout, tabs, queue, drafts และ auto quote

ข้อจำกัดของแนวทางเดิม:

- รองรับบริบทสินค้าได้ครั้งละ 1 ชุดเป็นหลัก
- queue มองเป็นรายการโพสต์ ไม่ได้มองเป็นแผนงานหลายหัวข้อ
- ไม่มี orchestration rule ระดับ campaign ว่าจะสลับหัวข้อหรือไล่ทีละหัวข้อ
- quote flow มองจาก draft ที่มีอยู่แล้ว แต่ยังไม่มี policy ชัดว่าให้กระจายสินค้าอย่างไร
- หน้าแรกยังเหมาะกับ operator mode มากกว่า full automate mode

สรุปคือระบบมี automation engine อยู่แล้ว แต่ยังไม่มี `control plane` ที่จัดการงานหลายหัวข้อแบบครบวงจร

## 3. เป้าหมาย UX ใหม่
หน้าแรกใหม่จะต้องเป็น `Campaign Builder + Run Control` ไม่ใช่แค่แผงตั้งค่า

ภาพใช้งานที่ต้องได้:

1. ผู้ใช้เปิดหน้าแรก
2. สร้างหลายหัวข้อในหน้าเดียว
3. แต่ละหัวข้อใส่สินค้าและลิงก์ของตัวเองได้
4. ระบุจำนวนโพสต์เป้าหมายต่อหัวข้อ
5. เลือก policy การรันของทั้ง campaign
6. กดเริ่ม แล้วระบบคิวหาโพสต์, ส่ง AI, สร้าง draft, และจัด quote ตาม policy ที่เลือก
7. ผู้ใช้เห็นสถานะรวมแบบ campaign และสถานะย่อยแบบต่อหัวข้อ

## 4. แนวคิดข้อมูลหลัก
แนะนำให้เพิ่มโมเดลข้อมูลระดับ `campaign` และ `topic` แยกจาก queue เดิม

### 4.1 Campaign
campaign คือชุดงาน full automate 1 รอบ

ข้อมูลหลักที่ควรมี:

- `id`
- `name`
- `status` เช่น `draft`, `running`, `paused`, `completed`, `error`
- `topicExecutionMode`
- `quoteDistributionMode`
- `createdAt`
- `updatedAt`
- `startedAt`
- `completedAt`
- `activeTopicIndex` หรือ pointer สำหรับ policy ที่ต้องสลับหัวข้อ

### 4.2 Topic Item
แต่ละหัวข้อคือหน่วยย่อยใน campaign

ข้อมูลหลักที่ควรมี:

- `id`
- `topic`
- `productName`
- `productLink`
- `targetPostCount`
- `generatedCount`
- `quotedCount`
- `status` เช่น `pending`, `running`, `completed`, `error`
- `lastProcessedAt`
- `lastSourceUrl`
- `notes` หรือ `errorMessage`

### 4.3 Execution Queue
นอกจาก `processQueue` เดิม ควรมีคิวระดับ orchestration ที่บอกว่า next action คืออะไร

ตัวอย่าง action:

- `find-source-posts`
- `generate-draft`
- `enqueue-quote`
- `publish-quote`

ถ้าไม่แยกระดับนี้ หน้าแรกใหม่จะมี UI สวยขึ้นแต่ behavior ภายในยังผูกติดกับ queue เดิมมากเกินไป

## 5. โครงสร้างหน้าแรกใหม่
หน้าแรกควรมี 4 ส่วนหลักในหน้าเดียว

### 5.1 Campaign Header
แสดงข้อมูลระดับภาพรวม

- ชื่อ campaign
- สถานะ campaign
- จำนวนหัวข้อทั้งหมด
- เป้าหมายรวมทั้งหมด
- ทำไปแล้วกี่โพสต์
- ปุ่ม `เริ่ม`, `พัก`, `ทำต่อ`, `หยุด`

### 5.2 Topic Builder
เป็นส่วนสำคัญที่สุดของหน้าแรกใหม่

ต่อ 1 แถวหัวข้อควรมี field ดังนี้:

- `หัวข้อ`
- `สินค้า`
- `ลิงก์`
- `จำนวนโพสต์เป้าหมาย`
- สถานะปัจจุบัน
- ปุ่มลบแถว

ต้องมีความสามารถ:

- เพิ่มแถวหัวข้อได้หลายรายการ
- reorder หัวข้อขึ้น/ลงได้
- duplicate หัวข้อได้ เผื่อใช้สินค้าเดิมแต่เปลี่ยน target count
- validate ว่าหัวข้อว่างไม่ได้ และถ้าใส่ลิงก์ต้องเป็น URL ที่ถูกต้อง

### 5.3 Automation Rules
เป็นส่วนกำหนด policy ของทั้ง campaign

ต้องมีอย่างน้อย 2 กลุ่ม rule:

#### A. Topic Execution Mode
กำหนดว่าระบบจะวิ่งหัวข้ออย่างไร

ตัวเลือกที่ต้องรองรับ:

- `round-robin`: สลับหัวข้อไปทีละโพสต์ เช่น A1 -> B1 -> C1 -> A2
- `drain-topic`: ทำหัวข้อเดียวให้ครบก่อน เช่น A1 -> A2 -> A3 -> B1

#### B. Quote Distribution Mode
กำหนดว่าตอนเอา draft ไป quote จะจัดลำดับสินค้าอย่างไร

ตัวเลือกที่ต้องรองรับ:

- `sequential-by-product`: เรียงทีละสินค้าจนหมดก่อน
- `alternate-products`: สลับสินค้า/หัวข้อเพื่อลดการติด pattern เดิม

### 5.4 Runtime Monitor
ส่วนแสดงผลการทำงานจริงแบบ live

- ตอนนี้กำลังรันหัวข้ออะไร
- คิวถัดไปคืออะไร
- หัวข้อไหนเหลืออีกกี่โพสต์
- draft ที่สร้างแล้วต่อหัวข้อ
- quote ที่สำเร็จแล้วต่อหัวข้อ
- error ล่าสุด

## 6. กติกาการทำงานที่ต้องนิยามให้ชัด

### 6.1 การเพิ่มหลายหัวข้อ
หนึ่งหัวข้อผูกกับสินค้า 1 ชุดเพื่อให้ prompt และ quote context ชัดเจน

ข้อเสนอ:

- 1 แถว = 1 หัวข้อ + 1 สินค้า + 1 ลิงก์
- ถ้าผู้ใช้ต้องการหัวข้อเดียวแต่หลายสินค้า ให้เพิ่มหลายแถวโดยใช้หัวข้อซ้ำได้

เหตุผล:

- data model ตรงกว่า
- prompt builder ง่ายกว่า
- quote distribution คุมได้ง่ายกว่า

### 6.2 การกำหนดจำนวนโพสต์ต่อหัวข้อ
แต่ละหัวข้อต้องมี `targetPostCount`

กติกาแนะนำ:

- ค่าต่ำสุดคือ 1
- ถ้าครบ target แล้ว topic เปลี่ยนเป็น `completed`
- ถ้าแหล่งโพสต์ไม่พอ ให้ค้างที่ `waiting-source` หรือ `partial`

### 6.3 การสลับหัวข้อหรือทำหัวข้อเดียวให้หมดก่อน
นี่คือ business rule หลักของ campaign

นิยามชัดเจน:

- `round-robin`: เลือกหัวข้อถัดไปที่ยังไม่ครบ target และไม่ติด error
- `drain-topic`: เลือกหัวข้อเดิมซ้ำไปเรื่อย ๆ จนกว่าจะครบ target หรือหา source ไม่ได้

ต้องกัน edge case:

- หัวข้อหนึ่ง error ไม่ควรทำให้ campaign ทั้งก้อนหยุด ถ้าเลือกได้ควรข้ามไปหัวข้อถัดไป
- ถ้าทุกหัวข้อ error หรือครบหมดแล้ว campaign จึงค่อยปิดรอบ

### 6.4 การจัด Quote แบบเรียงทีละสินค้า หรือสลับกัน
ต้องแยกจากกติกาการ generate draft เพราะบางกรณีผู้ใช้ต้องการ generate แบบสลับหัวข้อ แต่ quote แบบเรียงสินค้า

นิยามชัดเจน:

- `sequential-by-product`: quote งานของสินค้า/หัวข้อเดียวกันให้ครบก่อน แล้วค่อยย้ายไปหัวข้อถัดไป
- `alternate-products`: quote แบบวนลูปข้ามหัวข้อ เช่น A quote 1 -> B quote 1 -> C quote 1

ผลดี:

- ผู้ใช้คุม pattern การเผยแพร่ได้ละเอียดขึ้น
- ไม่บังคับให้ quote behavior ต้องเหมือน generation behavior

## 7. Workflow ใหม่ของระบบ

### Phase A: Setup Campaign
1. ผู้ใช้เปิดหน้า `Full Automate`
2. กรอกชื่อ campaign
3. เพิ่มหลายหัวข้อ
4. ระบุ target post count ของแต่ละหัวข้อ
5. เลือก topic execution mode
6. เลือก quote distribution mode
7. กดเริ่มรัน

### Phase B: Find and Generate
1. ระบบเลือกหัวข้อถัดไปตาม `topicExecutionMode`
2. ไปหา source post บน X ตามหัวข้อ
3. ส่ง context ไป AI พร้อม product name และ product link ของหัวข้อนั้น
4. บันทึกผลเป็น draft พร้อม tag ว่ามาจาก campaign/topic ไหน
5. เพิ่มตัวนับ `generatedCount`
6. ประเมินว่าหัวข้อนั้นครบ target หรือยัง

### Phase C: Quote Scheduling
1. ระบบหยิบ draft ที่พร้อม quote
2. จัดลำดับตาม `quoteDistributionMode`
3. เปิด quote composer
4. เติมข้อความและ submit ตาม flow เดิม
5. อัปเดต `quotedCount` ของหัวข้อ

### Phase D: Completion
campaign จะจบเมื่อ:

- ทุกหัวข้อครบทั้ง generate target ที่กำหนด และ quote ตาม policy ที่เลือกแล้ว
- หรือผู้ใช้หยุดเอง
- หรือระบบเจอ error สะสมจนข้ามต่อไม่ได้

## 8. ผลกระทบต่อโค้ดเดิม
รอบนี้ยังไม่ลงมือแก้โค้ด แต่เพื่อให้ implementation ตรงจุด ต้องยอมรับว่าการเปลี่ยนหน้าแรกแบบนี้กระทบมากกว่าการเพิ่ม input field ธรรมดา

ไฟล์ที่คาดว่าจะได้รับผลกระทบ:

### 8.1 sidepanel.html
- เปลี่ยนหน้าแรกให้เป็น campaign-oriented layout
- ลดการยึดติดกับ input เดี่ยว `query/product/link`
- เพิ่ม topic list builder และ rules panel

### 8.2 sidepanel.js
- เปลี่ยนจาก single session controls ไปเป็น campaign state editor
- เพิ่ม logic add/remove/reorder topic
- เพิ่ม save/load campaign draft
- เพิ่ม runtime monitor ระดับ campaign

### 8.3 background.js
- เพิ่ม state machine สำหรับ campaign
- แยก topic scheduler ออกจาก AI queue เดิม
- เพิ่ม quote scheduler ที่รู้จัก `quoteDistributionMode`
- map draft/result กลับไปยัง campaign/topic ให้ครบ

### 8.4 content_x.js
- อาจต้องรองรับการรับคำสั่งค้นหาหลายหัวข้อแบบต่อเนื่อง
- อาจต้องแยก source selection ให้ผูกกับ topic context ชัดขึ้น

### 8.5 storage keys
ควรเพิ่ม key ใหม่ เช่น:

- `campaigns`
- `activeCampaignId`
- `campaignRuntime`

โดยไม่ควรยัดทุกอย่างเข้า key เดิมอย่าง `settings` หรือ `processQueue`

## 9. แผน implementation ที่แนะนำ

### Milestone 1: Data Model ก่อน UI
เป้าหมาย:

- นิยาม campaign schema
- นิยาม topic schema
- นิยาม execution mode และ quote mode เป็น enum ชัดเจน
- กำหนด migration จาก state เดิมให้ไม่พัง

เหตุผล:

- ถ้า UI มาก่อน data model จะย้อนแก้หนัก

### Milestone 2: หน้า Full Automate แบบ Static
เป้าหมาย:

- เปลี่ยนหน้าแรกให้มี Campaign Header, Topic Builder, Rules, Runtime Monitor
- ยังไม่ต้องรันจริงครบทุก flow
- เน้น save/load state ใน storage ให้เสถียรก่อน

### Milestone 3: Topic Scheduler
เป้าหมาย:

- เพิ่มตัวเลือก `round-robin` และ `drain-topic`
- ให้ background เลือกหัวข้อถัดไปได้ถูกต้อง
- ผูก generated drafts กลับเข้าหัวข้อที่ถูกต้อง

### Milestone 4: Quote Distribution Scheduler
เป้าหมาย:

- เพิ่ม `sequential-by-product` และ `alternate-products`
- ให้ quote flow ดึง draft ตาม policy จริง

### Milestone 5: Runtime Monitoring และ Recovery
เป้าหมาย:

- แสดง progress ต่อ topic แบบ live
- resume หลัง service worker sleep ได้ดีขึ้น
- แสดง error stage ให้รู้ว่าพังค้างตรงไหน

## 10. กติกา validation ที่ควรมีตั้งแต่วันแรก

### Validation ฝั่ง UI
- ต้องมีอย่างน้อย 1 หัวข้อก่อนเริ่ม
- หัวข้อห้ามว่าง
- target post count ต้องมากกว่า 0
- ลิงก์ถ้าใส่ต้อง parse ได้

### Validation ฝั่ง runtime
- ห้ามเริ่ม campaign ใหม่ถ้ามี AI queue กำลังทำงานโดยไม่รู้ที่มา
- draft ที่สร้างต้องมี `campaignId` และ `topicId`
- quote queue ต้องไม่หยิบ draft ข้าม campaign ผิดชุด

## 11. ความเสี่ยงหลัก

### 11.1 UI ซับซ้อนขึ้นมาก
จาก single-form กลายเป็น multi-topic editor ถ้า layout ไม่ดีจะรกเร็วมาก

แนวทางลดความเสี่ยง:

- ใช้ table-like card list ที่อ่านง่าย
- ซ่อน advanced settings ไว้ส่วน rules

### 11.2 Scheduler ซ้อนกัน 2 ชั้น
จะมีทั้ง AI generation scheduling และ quote distribution scheduling

แนวทางลดความเสี่ยง:

- แยก state machine ของ `generate` กับ `quote`
- ไม่ใช้ flag memory เดียวคุมทุกอย่าง

### 11.3 Recovery หลัง service worker sleep
ถ้ายังพึ่ง in-memory มากเกินไป campaign ใหม่จะค้างง่าย

แนวทางลดความเสี่ยง:

- persist campaign runtime ที่จำเป็นลง storage
- มี recovery pass ตอน service worker ฟื้น

## 12. ขอบเขตที่ยังไม่ทำในรอบนี้
เพื่อให้ scope ชัด รอบนี้ยังไม่รวม:

- การ redesign results page ทั้งหมด
- analytics เชิงสถิติขั้นสูง
- multi-campaign parallel run
- template prompt per topic แบบซับซ้อนหลาย preset

## 13. Definition of Done สำหรับงานรอบถัดไป
จะถือว่า feature นี้เริ่ม usable เมื่อครบอย่างน้อย:

1. หน้าแรกเพิ่มหัวข้อได้หลายรายการ
2. แต่ละหัวข้อใส่สินค้าและลิงก์ของตัวเองได้
3. ตั้ง target post count ต่อหัวข้อได้
4. เลือก `round-robin` หรือ `drain-topic` ได้
5. เลือก `sequential-by-product` หรือ `alternate-products` ได้
6. draft และ quote ทุกตัว trace กลับได้ว่าอยู่ topic ไหน
7. ผู้ใช้เห็น progress ต่อหัวข้อจากหน้าแรกได้

## 14. ข้อเสนอเชิงตัดสินใจก่อนเริ่มโค้ด
ก่อนเริ่ม implementation ควรยืนยัน 3 เรื่องนี้ให้ชัด:

1. 1 หัวข้อจะผูกได้แค่ 1 สินค้า 1 ลิงก์ หรือจะให้ 1 หัวข้อมีหลายสินค้าในตัวเอง
2. target post count หมายถึงจำนวน draft ที่สร้าง หรือจำนวน quote ที่โพสต์สำเร็จ
3. หน้าแรกใหม่จะมาแทนหน้าเดิมทั้งหมด หรือให้มี tab `Full Automate` เพิ่มเข้ามาก่อนแล้วค่อยย้าย default ในรอบถัดไป

## 15. ข้อเสนอแนะนำ
จากโค้ดปัจจุบัน แนวทางที่เสี่ยงต่ำสุดคือ:

1. ทำ `Full Automate` เป็นหน้าแรกใหม่ใน side panel
2. ใช้โมเดล `1 หัวข้อ = 1 สินค้า = 1 ลิงก์`
3. ให้ `targetPostCount` หมายถึงจำนวน draft ที่ต้องสร้างก่อน
4. แยก `quoteDistributionMode` ออกมาต่างหากจาก `topicExecutionMode`

แนวทางนี้ตรงกับความต้องการที่ขอ และยังต่อยอดจาก architecture เดิมได้โดยไม่ต้องรื้อทุก flow พร้อมกันในครั้งเดียว