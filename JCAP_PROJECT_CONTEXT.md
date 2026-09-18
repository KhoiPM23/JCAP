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

### **FE-02: Credit and Payment**

> * Credit package browsing, credit purchase, and credit transaction/usage history.
> * Admin credit package management: Create, Edit, Delete credit packages.

### **FE-03: Scenario-based Conversation Learning**

> * Scenario discovery and management, including scenario search, details, difficulty levels, roles, learning objectives, and related learning content.
> * AI-powered multi-turn Japanese conversation practice through text and/or speech based on predefined real-world scenarios.
> * Conversation performance evaluation, results, and AI-generated feedback after completed practice sessions.
> * Adaptive learning support: Analyze learner performance and provide personalized recommendations for subsequent learning activities and practice.

### **FE-04: Shadowing Learning**

> * Shadowing content discovery and search based on scenario-related learning topics.
> * Scenario-related shadowing practice with sentence-by-sentence listening and voice recording.
> * Pronunciation assessment and assessment history for completed shadowing practice.
> * Admin shadowing content management: Create, Edit, Delete content associated with existing scenarios.

### **FE-05: Self-study Learning**

> * Vocabulary and grammar learning through organized learning groups.
> * Vocabulary and grammar search, individual study, and flashcard-based review activities.
> * Bookmark learning contents and view bookmarked contents.
> * Access recommended learning materials and review activities.
> * Admin vocabulary and grammar content management, including group assignment and organization.

### **FE-06: Platform Administration**

> * Admin user administration: Search, Filter, Ban/Unban learner accounts.
> * Learner feedback and issue report submission and review.
> * Admin learning and system analytics for monitoring learner activity, engagement, learning performance, and system usage.


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

## **7\. Current Project Status & Sprint Roadmap**

> * **Current Milestone:** Sprint 1 (31/08/2026 – 13/09/2026)  
> * **Sprint 1 Focus:** Core foundation, Auth (Login/Register/OAuth), Learner Profile, Token Balance, Initial DB Schemas, API/FE Integration.  
> * **Sprint 2 (14/09/2026 – 27/09/2026):** Scenario browsing, details view, text-based AI roleplay session initialization, prompt engineering.  
> * **Sprint 3 (28/09/2026 – 12/10/2026):** Voice recording, Whisper STT, TTS audio playback, streaming audio integration.

## **8. File Encoding Convention**

> * All files created or modified in this project must be saved as **UTF-8 without signature (without BOM)** to ensure consistent encoding across agents and development environments.
