# Jotform Frontend Challenge Project

## User Information
Please fill in your information after forking this repository:

- **Name**: Ali Çağan Tanrıverdi

## Project Description
This app turns the five Jotform data sources into a single investigation dashboard for the Missing Podo challenge. It still fetches the raw source data, but now adds deterministic person linking, a Podo route timeline, and a simple suspicion model to guide the user toward the strongest lead without overengineering the stack.

## Getting Started
1. Install dependencies:

```bash
npm install
```

2. Start the dev server:

```bash
npm run dev
```

3. Open [http://localhost:3000](http://localhost:3000)

The challenge repo already includes a working `.env.local` so it runs immediately after install.

## What This MVP Includes
- Fetches only these 5 sources:
  - Checkins
  - Messages
  - Sightings
  - Personal Notes
  - Anonymous Tips
- Uses only:
  - `GET /form/{id}/questions`
  - `GET /form/{id}/submissions?offset=0&limit=1000`
- Normalizes:
  - question objects into arrays
  - answer objects into arrays
  - count from `submissions.length`
- Builds one investigation screen with:
  - summary findings
  - suspect list
  - Podo route timeline
  - linked evidence detail panel
- Uses deterministic alias handling for dataset variants like `Kağan`, `Kagan`, and `Kağan A.`
- Uses readable suspicion rules instead of fuzzy matching
- Handles loading and error states
- Exposes a single internal endpoint at `/api/case-data`

## Notes
- Form metadata count is intentionally not used.
- Raw source payloads are still returned for confidence and debugging.
- The transformation layer is intentionally thin and local to the challenge dataset.
- This stays focused on the core investigation flow. Map and extra bonus features are deferred.

# 🚀 Challenge Duyurusu

## 📅 Tarih ve Saat
Cumartesi günü başlama saatinden itibaren üç saattir.

## 🎯 Challenge Konsepti
Bu challenge'da, size özel hazırlanmış bir senaryo üzerine web uygulaması geliştirmeniz istenecektir. Challenge başlangıcında senaryo detayları paylaşılacaktır.Katılımcılar, verilen GitHub reposunu fork ederek kendi geliştirme ortamlarını oluşturacaklardır.

## 📦 GitHub Reposu
Challenge için kullanılacak repo: https://github.com/cemjotform/2026-frontend-challenge-ankara

## 🛠️ Hazırlık Süreci
1. GitHub reposunu fork edin
2. Tercih ettiğiniz framework ile geliştirme ortamınızı hazırlayın
3. Hazırladığınız setup'ı fork ettiğiniz repoya gönderin

## 💡 Önemli Notlar
- Katılımcılar kendi tercih ettikleri framework'leri kullanabilirler
