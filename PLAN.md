# A-variant — Avtomat agentlik hisoboti — BEPUL, 0 dan 100 gacha

Yo'l: **marketing/SMM/SEO agentliklari uchun mijoz-hisoboti avtomatlashtirish.**
Butun build + demo + birinchi pilotlar — **$0** (lokal n8n). Pulli hosting'ga
faqat pulli mijoz kelganda o'tiladi (uning to'lovi qoplaydi).

Bu reja **bajarilsa** qiymatli. Har fazada chiqadigan natija bor. 1-oy oxirida
kamida 1 pilot bo'lmasa — §10 TO'XTASH belgisiga qara.

---

## 1 · MAHSULOT

Agentlik har oy har mijozi uchun qo'lda hisobot yasaydi: GA4 + Meta Ads +
Google Ads + qo'lda Sheet'dan raqam yig'ib, brendlangan slayd/PDF qilib yuboradi.
1 hisobot ≈ 1–3 soat; 10 mijoz = oyiga 20–30 soat.

Siz sotasiz: **"hisobotlar o'zi yasaladi va yuboriladi"** — manbalar bir marta
ulanadi, keyin har oy avtomat.

---

## 2 · ARXITEKTURA (bepul, config-driven, multi-tenant)

Tamoyil: bitta n8n tizimi N mijozga xizmat qiladi. Yangi mijoz = config'ga
**1 qator** + manbasini ulash. Yangi workflow qurilmaydi. **PDF-server yo'q** —
Google Slides API'dan foydalaniladi (nol hosting).

```
[Config: Google Sheet "Clients" varag'i]
 client_id | agency | report_name | ga4_property | meta_acct | gads_id | extra_sheet_url
 | kpis | schedule(cron) | recipients | logo_url | brand_color | slides_template_id

      │  n8n har kuni o'qiydi
      ▼
[wf_scheduler]  cron → muddati kelgan mijozlar → har biri uchun ↓
      ▼
[wf_build_report]  (mijoz bo'yicha)
   ├─ GA4 pull        (Google Analytics Data API — n8n HTTP node)
   ├─ Meta Ads pull   (Meta Marketing API)
   ├─ Google Ads pull (Google Ads API)
   ├─ extra Sheet pull
   ├─ Code node (Codex): normalize + KPI + oldingi davrga delta
   ├─ LLM node (Groq, bepul): "shu oy nima o'zgardi" — 3 jumla
   └─ Slides render: shablon deck nusxa → {{placeholder}} almashtirish (Slides API)
      → Drive API: PDF export
      ▼
[deliver]  Gmail node (mijozga, PDF ilova) + Telegram (agentlik menejeri) + Sheet arxiv
      ▼
[wf_alert]  har xatoda → Telegram + Clients qatoriga status
```

**Hamma komponent lokal/bepul:**

| Komponent | Nima | Narx |
|---|---|---|
| n8n | Lokal, Docker (`docker run ... n8nio/n8n` + volume) | $0 |
| Config | Google Sheet "Clients" varag'i (n8n nativ o'qiydi) | $0 |
| Manbalar | GA4/Meta/GAds API + mijoz Sheet — hammasi outbound API (webhook shart emas) | $0 |
| Transform | Code node (Codex yozadi, JS) | $0 |
| LLM xulosa | n8n OpenAI/HTTP node → Groq free tier | $0 |
| Render | Google Slides API (shablon + placeholder) → Drive PDF export | $0 |
| Deliver | Gmail node + Telegram node | $0 |
| Landing | Vercel statik/Next sahifa (`*.vercel.app`) | $0 |

**Pulli hosting — faqat 1-mijozdan keyin:** n8n'ni $5 VPS yoki n8n Cloud'ga
ko'chir (PC yoqiq bo'lmasa ham 24/7 ishlashi uchun). Mijoz retainer'i qoplaydi.

---

## 3 · AI AGENTLARDAN MAKSIMAL FOYDALANISH (aniq bo'linish)

| Agent | Rejim | Nima qiladi |
|---|---|---|
| **Codex** | Async, prompt → kod/fayl → patch | `wf_build_report` Code nodelari (har manba normalizer + KPI + delta); Slides placeholder-mapping logikasi; "Clients" schema + validator CLI; workflow JSON skeletonlar; **Vercel landing sahifasi**; README/testlar |
| **Claude Code / ChatGPT** | Interaktiv co-pilot | n8n UI wiring paytida jonli yordam; xato/expression debug; Slides shablon dizayni; outreach matni iteratsiyasi; qo'ng'iroq tayyorgarligi |
| **n8n LLM node (Groq)** | Runtime | Har hisobotdagi "shu oy nima o'zgardi" 3 jumlali xulosa |

Ish oqimi: Codex fonda kod/JSON yozadi → siz n8n UI'da import qilib, kredensial
ulab, real datada test qilasiz. Kutib o'tirmaysiz — parallel ishlaysiz.

---

## 4 · BUILD PLAN (kunlar)

### FAZA 0 — Setup (1 kun)
- Docker'da lokal n8n (`-v n8n_data:/home/node/.n8n` — persistent)
- Google Cloud project → GA4 Data API, Slides API, Drive API, Sheets API yoqilgan → OAuth client
- Telegram bot (@BotFather), Groq API key
- "Clients" Google Sheet (schema §2)
- GitHub repo `n8n-automation`
- **Codex prompt #1:** repo scaffold + Clients schema + validator + KPI Code node spec
- **Done:** n8n `localhost:5678`da ishlaydi, repo tayyor

### FAZA 1 — Flagman pipeline, 1 hardcoded mijoz (3–4 kun)
- **1-kun:** `wf_build_report` — faqat GA4 → data obyekt. Codex Code node: KPI + MoM delta. O'z GA4'ingiz (yoki demo property) bilan test
- **2-kun:** Meta Ads + Google Ads pull qo'shish; Codex: merge/normalize. Groq LLM xulosa node
- **3-kun:** Slides render — {{placeholder}}li shablon deck, n8n Slides API bilan almashtiradi, Drive PDF export, Gmail ilova + Telegram
- **4-kun:** `wf_scheduler` (Clients Sheet'dan o'qiydi, muddati kelganlarni loop) + `wf_alert`; 2 soxta mijoz bilan uchdan-uchgacha test
- **Done:** 1 ishga tushirish → 2 mijoz uchun brendlangan PDF email+Telegram'ga tushadi

### FAZA 2 — Portfolio (2 kun)
- Bitta chiroyli namuna hisobot (realistik data)
- Loom: qo'lda hisobot og'rig'i → tizim → PDF email'ga tushishi (60–90s)
- **Codex prompt #2:** Vercel landing — 3 keys, video embed, narx, "bepul pilot" CTA
- **Done:** demo video + `*.vercel.app` landing jonli

---

## 5 · SOTUV PLAN (2–5-hafta — ASOSIY FOKUS)

- **Nishon:** kichik marketing/SMM/SEO agentliklari — Instagram/LinkedIn (asoschiga DM),
  Upwork/Kwork ("Looker Studio", "reporting automation"), RU Telegram/FB guruhlari, cold email (Hunter.io)
- **100 targeted outreach**, kuniga 20–30
- **Xabar shabloni:**
  > "Salom [ism], [agentlik]ni ko'rdim. Jamoangiz har oy mijoz hisobotlariga
  > qancha vaqt sarflaydi? Men uni avtomat qilaman — GA4/Meta/Sheet bir marta
  > ulanadi, keyin brendlangan hisobotlar o'zi yuboriladi. Sizning bittangizni
  > bepul avtomat qilay — vaqt tejasa, qolganini gaplashamiz. 60s demo: [Loom]"
- **Qo'ng'iroq (15 daq):** qaysi hisobotlar, qancha tez-tez, manbalar, format,
  kim oladi, hozir qancha vaqt → eng kichigini scope qil
- **Bepul pilot:** o'sha mijozni tizimga onboard (Clients'ga 1 qator + data ulash,
  ~yarim kun) → yetkaz → 1 hafta kuzat → **retainer:**
  "$200–300/oy: hamma hisobot avtomat + oyiga 1 o'zgarish"
- **Raqamlar:** 100 outreach → 10–20 javob → 3–6 qo'ng'iroq → 1–3 pilot → 1–2 to'lovchi

---

## 6 · 1-MIJOZDAN KEYIN — hosting'ga ko'chirish (yarim kun)

- n8n workflow JSON'larni export → yangi joyga import
- $5 VPS (Hetzner/Contabo) + Docker + Caddy + `nip.io` bepul HTTPS, YOKI n8n Cloud
- Kredensiallarni qayta ulash, `wf_scheduler` cron'ni tekshir
- Render service kerak bo'lsa (branded PDF upsell) — Render/Fly free tier
- **Mijoz retainer'i bu $5/oyni qoplaydi**

---

## 7 · SCALE (2–3-oy)

- Har yangi mijoz = Clients qatori + kredensial ulash, **~2–4 soat**
- Mijoz so'ragan sari yangi Slides shablon / maxsus KPI
- 3–5 retainer → $600–1500/oy barqaror
- Har yopilgan mijozdan otziv + referral
- Bitta sub-nisha ("PPC agentliklari" / "Shopify agentliklari") — takrorlanadi

---

## 8 · XARAJAT

| Faza | Xarajat |
|---|---|
| Build + demo + birinchi pilotlar | **$0** (lokal n8n, Vercel free, Groq free) |
| 1-mijozdan keyin hosting | ~$5/oy (mijoz qoplaydi) |
| Karta | faqat hosting bosqichida (yoki n8n Cloud trial) |

---

## 9 · HAFTALIK O'LCHOV

| Hafta | Bo'lishi kerak |
|---|---|
| 1 | Lokal n8n + flagman pipeline (2 soxta mijoz uchun PDF chiqadi) |
| 2 | Portfolio (Loom + Vercel landing) + 50 outreach yuborilgan |
| 3–4 | 1+ pilot tizimga onboard + otziv |
| 8 | 2–3 retainer (hosting'ga ko'chirilgan) |
| 12 | 3–5 retainer, sub-nisha, shablon kutubxonasi |

---

## 10 · TO'XTASH BELGISI

Ishlaydigan demo + 80+ outreach bo'lib, 4 haftada 0 pilot → taklif yoki bozor
noto'g'ri. Nishanni almashtir (agentliklar → Ozon/WB sotuvchilar → buxgalterlar),
yoki narxni tushir, yoki lokal bizneslarga jonli chiq. Yana 4 hafta shunday bo'lsa
— bu yo'l emas, orqaga (ish qidirish + SQL).

---

## BOSHLASH — birinchi 3 qadam (bugun)

1. Docker'da n8n: `docker volume create n8n_data && docker run -d --name n8n -p 5678:5678 -v n8n_data:/home/node/.n8n n8nio/n8n` → `localhost:5678`
2. Google Cloud project + GA4/Slides/Drive/Sheets API + OAuth client; "Clients" Sheet yarat
3. Menga ayt — **Codex prompt #1** (repo scaffold + Clients schema + validator + KPI Code node) ni yozib beraman
