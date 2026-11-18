# JCAP Domain Glossary

The Japanese Conversation & Pronunciation Assistant Platform (JCAP) domain model and canonical terminology.

## Language

**CreditPackage**:
A purchasable credit tier configured by administrators containing a credit balance amount, price, and active status.
_Avoid_: Coin bundle, token tier, credit item

**Credit**:
The virtual balance used by learners to access AI-powered conversation roleplay sessions and deep pronunciation diagnostics.
_Avoid_: Token, coin, point

**SoftDelete**:
The persistence pattern where an entity is deactivated by toggling `IsActive = false` rather than permanently erasing the record.
_Avoid_: Purge, hard delete, physical delete

**ShadowingDialogue**:
A curated Japanese conversation scenario partitioned into sequential speaker lines practiced for speech rhythm, pitch, and accuracy.
_Avoid_: Speech lesson, audio tape, transcript

**RoleplaySession**:
An interactive conversational exchange between a learner and the AI system acting out a defined scenario and mission objectives.
_Avoid_: Chat thread, bot conversation

**ShadowingPracticeSession**:
An immutable historical record capturing a completed learner shadowing practice session with weighted scores, performance rank, and audio duration.
_Avoid_: Practice log, attempt, drill result

**ShadowingPracticeProgress**:
The server-side record of a learner's ongoing shadowing practice for one dialogue and one role (current sentence, status in_progress/completed/abandoned); resumable on any device, and turned into an immutable ShadowingPracticeSession when completed.
_Avoid_: Draft session, temp session, local progress

**ShadowingSentenceEvaluation**:
A backend-produced, stored result of one submission of a sentence spoken by a learner — scored, or not scorable (null scores plus an error code, never 0); the only source of scores when a ShadowingPracticeSession is completed.
_Avoid_: Sentence attempt, client score, sentence log

**AiPronunciationDiagnostic**:
A deep 5-dimension AI speech evaluation report assessing Tokyo Intonation, Vowel Clarity, Rhythm Tempo, Pitch Accent, and Long Vowel Precision.
_Avoid_: AI check, audio grade, phonetic score

