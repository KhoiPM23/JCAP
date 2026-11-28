# **JCAP Project Context & Architecture Guidelines**

**Project Name:** Japanese Conversation AI Platform (JCAP)  
**Project Code:** SEP490-SE\_54 (FPT University Da Nang)  
**Tech Stack:** ASP.NET Core 8 Web API, React 19 + TypeScript, SQL Server, Google Gemini API (with OpenAI-compatible fallback), Self-hosted Faster-Whisper (STT/ASR), VOICEVOX Engine (TTS), ONNX Runtime (HuBERT), payOS, Cloudinary  
**Target Audience:** Vietnamese learners of Japanese at JLPT N5–N3 levels

## **1\. Project Overview & Objectives**

JCAP is an AI-powered web platform designed to provide scenario-based Japanese conversation practice with adaptive learning and automated performance evaluation. It addresses the gap between theoretical knowledge (grammar, vocabulary) and practical speaking (Kaiwa) by simulating real-world Japanese communication scenarios with custom AI personas.

> * **Scenario-Based AI Roleplay:** Simulate real-life situations (e.g., ordering food, job interviews, reporting to supervisors using Keigo) with context-aware AI characters.  
> * **Multi-Dimensional Performance Evaluation:** Evaluate AI roleplay responses across content/task fulfillment, grammar accuracy, vocabulary range, and register/Keigo appropriateness; evaluate shadowing sessions across Kana/Mora content accuracy (ASR) and reference fluency/pacing, plus AI-generated session review.  
> * **Adaptive Learning Engine:** Automatically detect recurring learner weaknesses and recommend targeted flashcards, grammar exercises, and follow-up scenarios.  
> * **Shadowing & Content Practice:** Provide audio-visual shadowing practice aligned with Japanese textbooks and native/VOICEVOX reference audio, combining Kana/Mora content scoring with fluency analysis.

## **2\. Project Team & Responsibilities**

| Name | Role | Core Responsibilities   |
| :---- | :---- | :---- |
| **Nguyen Thi Anh Dao** | Mentor | Academic Advisor (daonta14@fe.edu.vn) |
| **Nguyen Van Hoang** | Team Leader | Overall System Architecture, Backlog & Project Management |
| **Phan Minh Khoi** | Member | Frontend Architecture (React/TS) |
| **Nguyen Quang Gia Khoi** | Member | Requirements Analysis, Use Case Specification, Content Management |
| **Nguyen Dinh Manh** | Member | Backend API Development (ASP.NET Core), Token/Credit & Payment Gateway Integration |
| **Nguyen Xuan Truong** | Member | Database Design (SQL Server ERD), Quality Assurance, Quality Management Strategy |

## **3\. High-Level Architecture & Tech Stack**

```
┌────────────────────────────────────────────────────────────────────────────┐
│                   React 19 + TypeScript Frontend (jcap-web)                │
└─────────────────────────────────────┬──────────────────────────────────────┘
                                      │ HTTP / REST JSON
                                      ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              ASP.NET Core 8 Web API Backend (Layered Architecture)         │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌───────────────────┐  │
│  │ Auth, Credit & Forum│  │ AI Roleplay,         │  │ Self-Study,       │  │
│  │ (Identity/JWT/payOS)│  │ Placement & Adaptive │  │ Explore & Shadow  │  │
│  └─────────────────────┘  └──────────────────────┘  └───────────────────┘  │
└───┬───────────────────────┬──────────────────────────┬──────────────────┬──┘
    │                       │                          │                  │
    ▼                       ▼                          ▼                  ▼
┌──────────────┐   ┌──────────────────┐   ┌───────────────────────┐   ┌──────────────────┐
│ SQL Server   │   │ LLM Cloud API    │   │ Local Speech Services │   │ External Services│
│ 2022         │   │ Google Gemini    │   │ VOICEVOX (:50021)     │   │ payOS, Cloudinary│
│ (EF Core 8,  │   │ (Primary) /      │   │ Faster-Whisper (:50022│   │ Google OAuth 2.0,│
│  59 DbSets)  │   │ OpenAI-compatible│   │ Shadowing ASR (:50023)│   │ SMTP / MailKit   │
│              │   │                  │   │ ONNX HuBERT (CPU)     │   │                  │
└──────────────┘   └──────────────────┘   └───────────────────────┘   └──────────────────┘
```

> * **Frontend:** React 19, TypeScript 6, Tailwind CSS 3.4, React Router 7, Vite 8.  
> * **Backend:** ASP.NET Core 8 Web API, Entity Framework Core 8 (Code First), Layered Architecture (`Controllers` → `Services/Interfaces` & `Services/Implementations` → `Data/AppDbContext`, `Models`, `DTOs`) in a single project (`JCAP.csproj`) with `Microsoft.AspNetCore.SpaProxy` for `jcap-web/`.  
> * **Database:** SQL Server 2022 (`Microsoft.EntityFrameworkCore.SqlServer`).  
> * **AI & Speech Services:**  
>   * **LLM:** Google Gemini API (`GeminiAiClient` with model fallback chain and `GeminiModelCooldownTracker`) as the default provider; pluggable OpenAI-compatible / Groq client (`OpenAiCompatibleAiClient` via `AiClientResolver`).  
>   * **Roleplay STT:** Self-hosted Faster-Whisper service (`tools/whisper_engine`, FastAPI/Uvicorn on `127.0.0.1:50022`, `WhisperSttService`) with browser Web Speech API fallback.  
>   * **Japanese TTS:** Self-hosted VOICEVOX Engine (`127.0.0.1:50021`, `VoiceVoxService` with in-memory & disk cache in `wwwroot/audio-cache/voicevox`) with browser Web Speech API fallback.  
>   * **Shadowing Assessment (Shadowing V2 — no Azure AI Speech):** Self-hosted open-source backend pipeline (`ShadowingEvaluationService`): `ShadowingAudioValidator` → dedicated Faster-Whisper + `pyopenjtalk-plus` ASR service (`tools/shadowing-asr`, `127.0.0.1:50023`, `FasterWhisperSpeechRecognitionService`) + Kana/Mora comparison (`KanaMoraComparer`, `StoredKanaReader` / `VoiceVoxKanaReader`), optional CPU ONNX Runtime (`Microsoft.ML.OnnxRuntime`) HuBERT phoneme-CTC model (`OnnxPhonemeRecognizer`), reference fluency/pacing analysis (`FluencyAnalyzer`), and LLM post-session review (`ShadowingSessionReviewService`).  
> * **External Integrations & Supporting Libraries:**  
>   * **Payment Gateway:** payOS (`payOS` SDK v2.1.0) with Webhook/IPN handling (`CreditService`).  
>   * **Auth & Email:** ASP.NET Core Identity + JWT Bearer + Google OAuth 2.0; MailKit SMTP (`SmtpEmailService`).  
>   * **Media Storage & Cleanup:** Cloudinary (`CloudinaryDotNet`, `CloudinaryStorageService`) + local temporary audio cleanup via `BackgroundAudioCleanupService` (24-hour retention for `stt_*` files).  
>   * **Import & Rate Limiting:** ClosedXML (Excel batch import for vocabulary/grammar) and ASP.NET Core Rate Limiter (`shadowing-evaluate`, `community-write`, `feedback-write`, `attachment-upload`).

## **4\. Core Feature Breakdown (WBS Scope)**

### **FE-01: Account and User Management**

> * Account registration, authentication, password management, and Google login.
> * Learner Profile setup and management, including Japanese learning level.

**Use Cases:**
* **UC-01:** Register Account
* **UC-02:** Log In
* **UC-03:** Log In with Google
* **UC-04:** Log Out
* **UC-05:** Reset Password
* **UC-06:** Change Password
* **UC-07:** View Learner Profile
* **UC-08:** Update Learner Profile

### **FE-02: Credit and Payment**

> * Credit package browsing, credit balance indicator, credit purchase, and credit transaction/usage history.
> * Admin credit package management: Create, Edit, Delete credit packages.

**Use Cases:**
* **UC-09:** View Credit Packages
* **UC-10:** Purchase Credits
* **UC-11:** View Credit Balance Indicator
* **UC-12:** View Credit History
* **UC-13:** Add Credit Package
* **UC-14:** Edit Credit Package
* **UC-15:** Delete Credit Package

### **FE-03: Scenario-based Conversation Learning**

> * Scenario discovery and management, including scenario search, details, difficulty levels, roles, learning objectives, and related learning content.
> * AI-powered multi-turn Japanese conversation practice through text and/or speech based on predefined real-world scenarios.
> * Conversation performance evaluation, results, and AI-generated feedback after completed practice sessions.
> * Adaptive learning support: Analyze learner performance and provide personalized recommendations for subsequent learning activities and practice.

**Use Cases:**
* **UC-16:** View Scenarios List (Learner/Admin)
* **UC-17:** Search a Scenario
* **UC-18:** View Scenario Details
* **UC-19:** Practice AI Scenario Conversation
* **UC-20:** View Conversation Result History
* **UC-21:** View Conversation Result Detail
* **UC-22:** Add Scenario
* **UC-23:** Edit Scenario
* **UC-24:** Delete Scenario

### **FE-04: Shadowing Learning**

> * Shadowing content discovery and search based on scenario-related learning topics.
> * Scenario-related shadowing practice with sentence-by-sentence listening and voice recording.
> * Pronunciation assessment and assessment history for completed shadowing practice.
> * Admin shadowing content management: Create, Edit, Delete content associated with existing scenarios.

**Use Cases:**
* **UC-25:** View Shadowing Contents List
* **UC-26:** Search a Shadowing Content
* **UC-27:** View Shadowing Content Details
* **UC-28:** Practice Shadowing
* **UC-29:** View Shadowing Assessment History
* **UC-30:** Add Shadowing Content
* **UC-31:** Edit Shadowing Content
* **UC-32:** Delete Shadowing Content

### **FE-05: Self-study Learning**

> * Vocabulary and grammar learning structured by Learning Topics.
> * Vocabulary and grammar browsing, searching, and detailed study.
> * Learning topic management: create, edit, change status.
> * Content management: add, edit, remove, change content status, and batch import vocabulary/grammar from Excel.
> * Bookmark learning contents and review bookmarked contents through flashcards.
> * Flashcard set study, set details browsing, and flashcard review history tracking.

**Use Cases:**
* **UC-33:** View Vocabulary List of a Topic
* **UC-34:** Search a Vocabulary
* **UC-35:** View Vocabulary Details
* **UC-36:** View Grammar List of a Topic
* **UC-37:** Search a Grammar
* **UC-38:** View Grammar Details
* **UC-39:** Add Vocabulary
* **UC-40:** Edit Vocabulary
* **UC-41:** Remove Vocabulary
* **UC-42:** Add Grammar
* **UC-43:** Edit Grammar
* **UC-44:** Remove Grammar
* **UC-45:** View Learning Topic List
* **UC-46:** Add Learning Topic
* **UC-47:** Edit Learning Topic
* **UC-48:** Change Learning Topic Status
* **UC-49:** Import Vocabulary from Excel
* **UC-50:** Import Grammar from Excel
* **UC-51:** Change Learning Content Status
* **UC-52:** Add Learning Content to Bookmarks
* **UC-53:** View Bookmarked Learning Contents
* **UC-54:** Remove Learning Content from Bookmarks
* **UC-55:** View Flashcard Sets
* **UC-56:** View Flashcard Set Details
* **UC-57:** Study a Flashcard Set
* **UC-58:** View Flashcard Study History
* **UC-59:** View Flashcard Study Summary
* **UC-60:** Review Due Flashcards
* **UC-61:** Unlock Additional Flashcard Capacity
* **UC-62:** Do Flashcard Quiz
* **UC-63:** View Flashcard Quiz Results

### **FE-06: Explore Journey Map**

> * Interactive exploration of Japan's prefectures through a journey map and spot-based cultural lessons.
> * Gamified progression with stamp book collection and regional learning achievements.
> * Admin journey management: Chapter and prefecture organisation, spot content management, and explore statistics.

**Use Cases:**
* **UC-64:** View Explore Journey Map
* **UC-65:** View Prefecture Spots
* **UC-66:** Study a Spot Lesson
* **UC-67:** View Stamp Book
* **UC-68:** View Explore Map Overview
* **UC-69:** Change Prefecture Status
* **UC-70:** Assign Prefecture to Chapter
* **UC-71:** Add Chapter
* **UC-72:** Edit Chapter
* **UC-73:** Reorder Chapters
* **UC-74:** Deactivate Chapter
* **UC-75:** View Prefecture Content
* **UC-76:** Add Spot
* **UC-77:** Edit Spot
* **UC-78:** Change Spot Status
* **UC-79:** Deactivate Spot
* **UC-80:** Edit Province Word
* **UC-81:** View Spot Content List
* **UC-82:** View Explore Statistics

### **FE-07: Placement Test and Adaptive Learning Recommendations**

> * Initial Japanese proficiency evaluation via diagnostic placement tests.
> * Placement test scoring, level classification, and detailed result analysis.
> * Adaptive learning profile maintenance tracking learner performance, strengths, and areas for improvement.
> * Personalized learning recommendations guiding learners to appropriate scenarios, shadowing lessons, and self-study materials.

**Use Cases:**
* **UC-83:** Start Placement Test
* **UC-84:** View Placement Test Results
* **UC-85:** View Adaptive Learning Profile
* **UC-86:** View Learning Recommendations

### **FE-08: Forum**

> * Community discussion forum for Japanese learners to share experiences, ask questions, and collaborate.
> * Post creation, viewing, editing, deletion, and response threads.
> * Community interaction through responses and upvoting.

**Use Cases:**
* **UC-87:** View Forum Posts
* **UC-88:** Post a Forum
* **UC-89:** Response a Forum Post
* **UC-90:** Upvote a Forum Post
* **UC-91:** Delete a Forum Post
* **UC-92:** Edit a Forum Post

## **5\. Global Database Schema (Unified ERD Overview)**

The database is managed in SQL Server 2022 via EF Core 8 (`AppDbContext` with 59 `DbSet` entities plus ASP.NET Core Identity tables), grouped across the 8 platform modules:

> 1. **Auth & Identity:** `ApplicationUser` (Identity user with JLPT level, `CreditBalance`, subscription metadata, and placement test status).  
> 2. **Credit & Payment (`FE-02`):** `CreditPackage`, `CreditTransaction` (logs credit purchases, top-ups, subscriptions, and per-turn session deductions).  
> 3. **Scenario & AI Roleplay (`FE-03` & Placement sessions):** `Scenario`, `ScenarioLevelConfiguration`, `Mission`, `TargetVocabulary`, `TargetGrammar`, `RoleplaySession`, `RoleplayMessage`, `RoleplaySessionMission`, `RoleplayResult`.  
> 4. **Shadowing (`FE-04`):** `ShadowingDialogue`, `ShadowingSentence`, `ShadowingDialogueVocabulary`, `ShadowingDialogueGrammar`, `ShadowingSentenceAsset`, `ShadowingPracticeSession`, `ShadowingSentenceEvaluation`, `ShadowingPracticeProgress`.  
> 5. **Self-Study, Bookmarks, Flashcards & Quizzes (`FE-05`):** `LearningTopic`, `Vocabulary`, `VocabularyExample`, `Grammar`, `GrammarExample`, `TopicVocabulary`, `TopicGrammar`, `LearningContentSource`, `VocabularySource`, `GrammarSource`, `LearningContentSeedState`, `LearnerBookmark`, `LearnerFlashcardProgress`, `FlashcardStudySession`, `FlashcardReviewLog`, `LearnerDailyFlashcardQuota`, `FlashcardQuizAttempt`, `FlashcardQuizAttemptItem`.  
> 6. **Explore Journey Map (`FE-06`):** `ExploreChapter`, `ExplorePrefecture`, `ExploreChapterPrefecture`, `ExploreSpot`, `ExploreSpotLesson`, `ExploreSpotLessonVocabulary`, `ExploreSpotLessonGrammar`, `ExploreSpotActivity`, `ExploreProvinceWord`, `ExploreProgress`.  
> 7. **Placement & Adaptive Learning (`FE-07`):** Placement sessions persisted via `RoleplaySession` / `RoleplayMessage` + `ApplicationUser`; adaptive telemetry & memory stored in `LearnerIntelligenceProfile`, `LearnerSkillMastery`, `LearnerBehaviorSignal`, `UserNpcRelationship`, `LearnerMemory`, `CharacterMemory`.  
> 8. **Community Forum & Feedback (`FE-08` & Support):** `CommunityPost`, `CommunityComment`, `CommunityAttachment`, `CommunityPostUpvote`; `FeedbackTicket`, `FeedbackMessage`, `FeedbackAttachment`.

## **6\. Development Rules & Antigravity Instructions**

### **ASP.NET Core Backend Conventions**

> * Layered Architecture (Single Web API Project): `Controllers`, `Services` (`Interfaces` / `Implementations`), `Data` (`AppDbContext`), `Models`, `DTOs`, `Hosting`.  
> * Entity Framework Core Code First with clear foreign keys connecting back to `ApplicationUser`.  
> * Store API keys and secrets strictly in `appsettings.Local.json` (gitignored) or Environment Variables (NEVER hardcode secrets in `appsettings.json`).  
> * Idempotency checks for Webhook handling (payOS Payment IPN).  
> * Built-in AI resilience: model fallback chain, per-model timeout, transient retry, and `GeminiModelCooldownTracker` for 429/503/timeout handling.

### **React / TypeScript Frontend Conventions**

> * Strict typing with TypeScript interfaces matching DTOs.  
> * Modular UI components (e.g., `AudioRecorder`, `JapanMap`, `RoleplayPracticeView`, `ShadowingHistoryPanel`).

### **Git Branching Strategy**

Feature Branch format: feature/{Function-Name} 
Example: feature/authentication-login

### **Business & AI Guardrails**

> * **BR-10 Guardrail:** AI roleplay prompts must strictly constrain the AI to its assigned persona and difficulty level.  
> * **BR-15 Compliance:** UI disclaimers stating AI feedback is for learning support, not official JLPT certification.  
> * **BR-24/25 Compliance:** Mandatory admin verification before scenarios become published.

## **7. File Encoding Convention**

> * All files created or modified in this project must be saved as **UTF-8 without signature (without BOM)** and **100% CRLF (`\r\n`)** line endings to match `.editorconfig` and `.gitattributes`.

## **8. Detailed Domain Specifications: FE-03 (Scenario AI) & FE-04 (Shadowing)**

### **FE-03: Scenario-Based AI Conversation Practice**
1. **Multi-JLPT Level Structure (Approach A - Topic-First Hierarchy):**
   - In "View Scenario List", scenarios are displayed independently by broad conversation topics (e.g., "At the Izakaya", "Job Interview", "Asking for Directions").
   - Upon viewing a Scenario, the learner selects their target JLPT level (N5, N4, or N3).
   - Each JLPT level possesses its own dedicated configuration (`ScenarioLevelDetail`):
     - **Specific AI Persona & System Prompt** calibrated for that level's speech complexity.
     - **Distinct Conversation Missions (Objectives/Tasks)** (e.g., N5 asks for simple price, N3 negotiates or asks for dietary recommendations).
     - **Specific Target Vocabulary & Grammar** bounding linguistic scope.
2. **Session Progression & Completion Criteria:**
   - Conversation length is dynamic (not strictly turn-capped). Session completes when:
     - All assigned conversation missions are completed ("ticked" off by AI).
     - OR reaching a natural dialogue conclusion (e.g., AI cashier/waiter states: *"The dish has been served, thank you for waiting"*).
3. **AI Responsibilities during Session:**
   - Roleplay strictly according to the assigned Persona and difficulty level.
   - Continuously evaluate learner responses and automatically track/tick off completed missions.
   - Provide an **On-Demand Next-Turn Hint / Suggestion** (hidden by default; learner clicks a button to reveal when stuck).
4. **Interaction Modes:**
   - Dual-input support: Speech (Voice recording/STT) OR direct Text-based input.
5. **Credit Deduction & Subscription Coverage (`RoleplaySessionService`):**
   - Implemented **Turn-Based Credit Deduction**: deducts `1–4` credits per learner turn (`EstimateCreditCost`) based on learner message length, AI reply length, and conversation context depth, plus hint usage cost when hints are requested.
   - Learners with an active monthly subscription (`SubscriptionExpiresAt > UtcNow`) are covered by their plan (`CoveredBySubscription = true`) instead of deducting pay-as-you-go credits.
6. **Session Resumption Rule:**
   - Learners are allowed to resume an interrupted/unfinished conversation session.
   - **Constraint:** Exactly ONE active unfinished session is preserved per Scenario (unified across JLPT levels of that scenario, not multiple drafts), solely for resumption purposes.
7. **Post-Conversation Evaluation:**
   - Content Assessment: Appropriateness of vocabulary and grammar used by the learner, mission completion, and Keigo/register suitability evaluated via `RoleplayEvaluationService` / `IAiClient`.
   - Evaluation metrics serve as direct reference data for the Adaptive Learning Engine (recommending remedial vocabulary, grammar, and shadowing exercises).

### **FE-04: Shadowing Module**
1. **Content Provenance & Structure:**
   - Dialogues are strictly fixed content extracted from textbooks (e.g., Minna no Nihongo) or native Japanese speaker videos.
   - The AI **does NOT generate or hallucinate** shadowing dialogue during practice; assessment is strictly backend-driven.
   - **Scenario Association:** Every shadowing content/dialogue is thematic and directly references the topic of an existing Scenario (1 Scenario topic $\rightarrow$ multiple Shadowing contents from diverse sources), tagged with a specific JLPT level.
2. **Detailed Content Preview (UC-27):**
   - Dedicated **View Shadowing Content Details (UC-27)** displaying full transcript, native/VOICEVOX reference audio preview, associated target vocabulary, and target grammar.
3. **Role Selection & Locking Rule:**
   - For multi-speaker dialogues (e.g., Speaker A & Speaker B), the learner selects their practicing role **prior to starting**.
   - **Constraint:** Once the shadowing session starts, role switching is locked (to switch roles, the learner must restart/retry the session).
4. **Session Resumption:**
   - Similar to Scenarios, unfinished shadowing sessions can be resumed.
5. **Evaluation Scope (Shadowing V2 — Open-Source Pipeline, no Azure AI Speech):**
   - Backend audio validation (`ShadowingAudioValidator`) is authoritative; browser checks never decide final scores.
   - **Content Dimension:** Self-hosted Faster-Whisper ASR (`tools/shadowing-asr`, `FasterWhisperSpeechRecognitionService`) compared against reference Kana/Mora (`KanaMoraComparer` using OpenJTalk/VOICEVOX G2P readings); optional CPU ONNX Runtime HuBERT phoneme-CTC model (`OnnxPhonemeRecognizer`) is retained only as a configurable transition option (`Shadowing:Content:Provider = "phoneme"`). Never grades from browser Web Speech API transcripts.
   - **Fluency Dimension:** Reference pacing/rhythm measurement (`FluencyAnalyzer`) compared against precomputed/VOICEVOX reference audio.
   - **Pronunciation / Pitch Accent:** Currently returns `UNAVAILABLE` (not implemented; never inferred from content score or rendered as `0`) since Azure AI Speech is not used.
   - **Post-Session AI Review:** Optional LLM summary review generated via `ShadowingSessionReviewService` (`IAiClient`).
6. **Media Storage & Caching:**
   - Persistent media files (native/reference audio, forum/feedback attachments) are stored on **Cloudinary** (`CloudinaryStorageService`), combined with local VOICEVOX synthesized audio caching (`wwwroot/audio-cache/voicevox`) and automated 24-hour cleanup of temporary STT recordings (`BackgroundAudioCleanupService`).
