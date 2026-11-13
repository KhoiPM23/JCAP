# **JCAP Project Context & Architecture Guidelines**

**Project Name:** Japanese Conversation AI Platform (JCAP)  
**Project Code:** SEP490-SE\_54 (FPT University Da Nang)  
**Tech Stack:** ASP.NET Core 8 Web API, React \+ TypeScript, SQL Server, OpenAI API (STT/LLM/TTS), Azure AI Speech (Pronunciation Assessment / Pitch Accent)  
**Target Audience:** Vietnamese learners of Japanese at JLPT N5–N3 levels

## **1\. Project Overview & Objectives**

JCAP is an AI-powered web platform designed to provide scenario-based Japanese conversation practice with adaptive learning and automated performance evaluation. It addresses the gap between theoretical knowledge (grammar, vocabulary) and practical speaking (Kaiwa) by simulating real-world Japanese communication scenarios with custom AI personas.

> * **Scenario-Based AI Roleplay:** Simulate real-life situations (e.g., ordering food, job interviews, reporting to supervisors using Keigo) with context-aware AI characters.  
> * **Multi-Dimensional Performance Evaluation:** Evaluate learner responses across pronunciation, pitch accent/prosody, fluency, vocabulary, grammar, and Keigo appropriateness.  
> * **Adaptive Learning Engine:** Automatically detect recurring learner weaknesses and recommend targeted flashcards, grammar exercises, and follow-up scenarios.  
> * **Shadowing & Pronunciation Practice:** Provide audio-visual shadowing practice aligned with Japanese textbooks and native audio references.

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

┌────────────────────────────────────────────────────────────────────────┐  
│                        React \+ TypeScript Frontend                      │  
└───────────────────────────────────┬────────────────────────────────────┘  
                                    │ HTTP / REST / WebSockets  
                                    ▼  
┌────────────────────────────────────────────────────────────────────────┐  
│                       ASP.NET Core 8 Web API Backend                   │  
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │  
│  │ Auth & Credit    │  │ AI Roleplay Engine│  │ Adaptive Learning    │  │  
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │  
└──────────┬────────────────────────┬────────────────────────┬───────────┘  
           │                        │                        │  
           ▼                        ▼                        ▼  
┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐  
│ SQL Server Database│   │ OpenAI API         │   │ Azure AI Speech    │  
│ (ERD Core Schema)  │   │ (Whisper/LLM/TTS)  │   │ (Pronunciation/    │  
│                    │   │                    │   │  Pitch Accent)     │  
└────────────────────┘   └────────────────────┘   └────────────────────┘

> * **Frontend:** React, TypeScript, Tailwind CSS / Ant Design, Vite.  
> * **Backend:** ASP.NET Core 8 Web API, Entity Framework Core (Code First), Clean Architecture.  
> * **Database:** SQL Server 2022\.  
> * **AI & External Services:**  
  * **OpenAI API:** Whisper (Speech-to-Text), GPT-4o / GPT-3.5-Turbo (Roleplay Chat & Feedback), OpenAI TTS (Voice Generation).  
  * **Azure AI Speech:** Pronunciation Assessment API (Accuracy, Fluency, Prosody/Pitch Accent, Completeness).  
  * **Payment Gateway:** Domestic Payment Gateway Webhook/IPN for Credit top-up.

## **4\. Core Feature Breakdown (WBS Scope)**

### **FE-01: Account and User Management**

> * Account registration, authentication, password management, and Google login.
> * Learner Profile setup and management, including Japanese learning level.
> * Admin user management: Search, Filter, Ban/Unban learner accounts.

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

> * Credit package browsing, credit purchase, and credit transaction/usage history.
> * Admin credit package management: Create, Edit, Delete credit packages.

**Use Cases:**
* **UC-09:** View Credit Packages
* **UC-10:** Purchase Credits
* **UC-11:** View Credit History
* **UC-12:** Add Credit Package
* **UC-13:** Edit Credit Package
* **UC-14:** Delete Credit Package

### **FE-03: Scenario-based Conversation Learning**

> * Scenario discovery and management, including scenario search, details, difficulty levels, roles, learning objectives, and related learning content.
> * AI-powered multi-turn Japanese conversation practice through text and/or speech based on predefined real-world scenarios.
> * Conversation performance evaluation, results, and AI-generated feedback after completed practice sessions.
> * Adaptive learning support: Analyze learner performance and provide personalized recommendations for subsequent learning activities and practice.

**Use Cases:**
* **UC-15:** View Scenarios List (Learner/Admin)
* **UC-16:** Search a Scenario
* **UC-17:** View Scenario Details
* **UC-18:** Practice AI Scenario Conversation
* **UC-19:** View Conversation Result History
* **UC-20:** View Conversation Result Detail
* **UC-21:** Add Scenario
* **UC-22:** Edit Scenario
* **UC-23:** Delete Scenario

### **FE-04: Shadowing Learning**

> * Shadowing content discovery and search based on scenario-related learning topics.
> * Scenario-related shadowing practice with sentence-by-sentence listening and voice recording.
> * Pronunciation assessment and assessment history for completed shadowing practice.
> * Admin shadowing content management: Create, Edit, Delete content associated with existing scenarios.

**Use Cases:**
* **UC-24:** View Shadowing Contents List
* **UC-25:** Search a Shadowing Content
* **UC-26:** View Shadowing Content Details
* **UC-27:** Practice Shadowing
* **UC-28:** View Shadowing Assessment History
* **UC-29:** Add Shadowing Content
* **UC-30:** Edit Shadowing Content
* **UC-31:** Delete Shadowing Content

### **FE-05: Self-study Learning**

> * Vocabulary and grammar learning structured by Learning Topics.
> * Vocabulary and grammar browsing, searching, and detailed study.
> * Learning topic management: create, edit, change status.
> * Content management: add, edit, remove, change content status, and batch import vocabulary/grammar from Excel.
> * Bookmark learning contents and review bookmarked contents through flashcards.
> * Flashcard set study, set details browsing, and flashcard review history tracking.

**Use Cases:**
* **UC-32:** View Vocabulary List of a Topic
* **UC-33:** Search a Vocabulary
* **UC-34:** View Vocabulary Details
* **UC-35:** View Grammar List of a Topic
* **UC-36:** Search a Grammar
* **UC-37:** View Grammar Details
* **UC-38:** Add Vocabulary
* **UC-39:** Edit Vocabulary
* **UC-40:** Remove Vocabulary
* **UC-41:** Add Grammar
* **UC-42:** Edit Grammar
* **UC-43:** Remove Grammar
* **UC-44:** View Learning Topic List
* **UC-45:** Add Learning Topic
* **UC-46:** Edit Learning Topic
* **UC-47:** Change Learning Topic Status
* **UC-48:** Import Vocabulary from Excel
* **UC-49:** Import Grammar from Excel
* **UC-50:** Change Learning Content Status
* **UC-51:** Add Learning Content to Bookmarks
* **UC-52:** View Bookmarked Learning Contents
* **UC-53:** Remove Learning Content from Bookmarks
* **UC-54:** View Flashcard Sets
* **UC-55:** View Flashcard Set Details
* **UC-56:** Study a Flashcard Set
* **UC-57:** View Flashcard Study History
* **UC-58:** View Flashcard Study Summary
* **UC-59:** Review Due Flashcards
* **UC-60:** Unlock Additional Flashcard Capacity
* **UC-61:** Do Flashcard Quiz
* **UC-62:** View Flashcard Quiz Results

### **FE-06: Explore Journey Map**

> * Interactive exploration of Japan's prefectures through a journey map and spot-based cultural lessons.
> * Gamified progression with explore stamps, stamp book collection, and regional learning achievements.
> * Admin journey management: Chapter and prefecture organisation, spot content management, and explore statistics.

**Use Cases:**
* **UC-63:** View Explore Journey Map
* **UC-64:** View Prefecture Spots
* **UC-65:** Study a Spot Lesson
* **UC-66:** Receive Explore Stamps
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

                          ┌───────────────────────────┐  
                          │       User / Learner      │  
                          │ (UserID, JLPT, CreditBal) │  
                          └─────────────┬─────────────┘  
                                        │  
      ┌─────────────────┬───────────────┼───────────────┬─────────────────┐  
      │ (1-n)           │ (1-n)         │ (1-n)         │ (1-n)           │ (1-n)  
      ▼                 ▼               ▼               ▼                 ▼  
┌───────────┐   ┌───────────────┐ ┌───────────┐ ┌───────────────┐ ┌────────────────┐  
│  Credit   │   │  Flashcard    │ │  Learner  │ │ Shadowing     │ │ Roleplay       │  
│Transaction│   │  (Bookmarked) │ │ Progress  │ │ Session       │ │ Session        │  
└───────────┘   └───────────────┘ └───────────┘ └───────┬───────┘ └───────┬────────┘  
                                                        │ (n-1)           │ (n-1)  
                                                        ▼                 ▼  
                                                ┌───────────────┐ ┌────────────────┐  
                                                │ Shadowing     │ │ Roleplay       │  
                                                │ Dialogue      │ │ Scenario       │  
                                                └───────────────┘ └───────┬────────┘  
                                                                          │ (n-n)  
                                                        ┌─────────────────┴────────────────┐  
                                                        ▼                                  ▼  
                                                ┌───────────────┐                  ┌───────────────┐  
                                                │  Vocabulary   │                  │    Grammar    │  
                                                └───────────────┘                  └───────────────┘

> 1. **User / Learner:** Identity, auth, JLPT level, preferences, Credit balance.  
> 2. **CreditTransaction:** Logs credit purchases, top-ups, voucher usage, session deductions.  
> 3. **RoleplayScenario:** Scenario context, AI role, difficulty, Keigo level, target vocab/grammar.  
> 4. **RoleplayTask:** Mission objectives for a scenario.  
> 5. **RoleplaySession:** Learner's roleplay practice session.  
> 6. **RoleplayRecording:** Audio recording files per turn.  
> 7. **RoleplayResult:** Multi-dimensional scores, feedback, Pass/Fail status.  
> 8. **Shadowing entities:** ShadowingDialogue, ShadowingSentence, ShadowingSession, ShadowingResult.  
> 9. **Learning materials:** Vocabulary, Grammar, GrammarExample.  
> 10. **Flashcard:** Personalized study cards from bookmarks/adaptive recommendations.

## **6\. Development Rules & Antigravity Instructions**

### **ASP.NET Core Backend Conventions**

> * Clean Architecture: Domain, Application, Infrastructure, API.  
> * Entity Framework Core Code First with clear foreign keys connecting back to User/Learner.  
> * Store API keys strictly in appsettings.json / Environment Variables (NEVER hardcode).  
> * Idempotency checks for Webhook handling (Payment IPN).  
> * Retry policies (Polly) for external AI service rate limits/timeouts.

### **React / TypeScript Frontend Conventions**

> * Strict typing with TypeScript interfaces matching DTOs.  
> * Modular UI components (AudioRecorder, TranscriptViewer, PitchAccentChart).

### **Git Branching Strategy**

Feature Branch format: feature/{Function-Name} 
Example: feature/authentication-login

### **Business & AI Guardrails**

> * **BR-10 Guardrail:** AI roleplay prompts must strictly constrain the AI to its assigned persona and difficulty level.  
> * **BR-15 Compliance:** UI disclaimers stating AI feedback is for learning support, not official JLPT certification.  
> * **BR-24/25 Compliance:** Mandatory admin verification before scenarios become published.

## **7. File Encoding Convention**

> * All files created or modified in this project must be saved as **UTF-8 without signature (without BOM)** to ensure consistent encoding across agents and development environments.

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
5. **Credit Deduction Strategies (Dual Mechanism Support):**
   - The system supports both models for testing/evaluation:
     - **Model 1 (Fixed Session Cost):** Deducts a predetermined credit amount upon initiating a session.
     - **Model 2 (Turn-Based Cost):** Deducts credits per learner turn, with a low-balance warning notification before starting or when balance is critically low.
6. **Session Resumption Rule:**
   - Learners are allowed to resume an interrupted/unfinished conversation session.
   - **Constraint:** Exactly ONE active unfinished session is preserved per Scenario (unified across JLPT levels of that scenario, not multiple drafts), solely for resumption purposes.
7. **Post-Conversation Evaluation:**
   - Content Assessment: Appropriateness of vocabulary and grammar used by the learner.
   - Acoustic/Speech Quality Assessment: Fluency, clarity, pronunciation (when voice mode is used).
   - Evaluation metrics serve as direct reference data for the Adaptive Learning Engine (recommending remedial vocabulary, grammar, and shadowing exercises).

### **FE-04: Shadowing Module**
1. **Content Provenance & Structure:**
   - Dialogues are strictly fixed content extracted from textbooks (e.g., Minna no Nihongo) or native Japanese speaker videos.
   - The AI **does NOT generate or hallucinate** shadowing dialogue; its role is strictly assessment.
   - **Scenario Association:** Every shadowing content/dialogue is thematic and directly references the topic of an existing Scenario (1 Scenario topic $\rightarrow$ multiple Shadowing contents from diverse sources), tagged with a specific JLPT level.
2. **Detailed Content Preview (UC-26b):**
   - Dedicated **View Shadowing Content Details (UC-26b)** displaying full transcript, native audio preview, associated target vocabulary, and target grammar.
3. **Role Selection & Locking Rule:**
   - For multi-speaker dialogues (e.g., Speaker A & Speaker B), the learner selects their practicing role **prior to starting**.
   - **Constraint:** Once the shadowing session starts, role switching is locked (to switch roles, the learner must restart/retry the session).
4. **Session Resumption:**
   - Similar to Scenarios, unfinished shadowing sessions can be resumed.
5. **AI Assessment Scope:**
   - Pronunciation assessment (Azure AI Speech) evaluating acoustic accuracy, fluency, completeness, and prosody/pitch accent against native reference audio.
6. **Media Storage:**
   - Native audio files (.mp3/.wav) and user recordings are stored via a cloud storage provider offering a free tier (e.g., Cloudinary / Supabase Storage / Azure Blob Storage).
