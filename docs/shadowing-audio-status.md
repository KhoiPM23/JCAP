# Shadowing: phần âm thanh đã làm được gì và còn cải tiến gì

Tài liệu này tóm tắt **riêng phần âm thanh** của Shadowing để nắm hiện trạng và chọn việc cải tiến tiếp.
Chi tiết kỹ thuật từng bước nằm ở [shadowing-evaluation.md](shadowing-evaluation.md); tài liệu này tập trung vào: đã có gì, đo được tin cậy đến đâu, chưa có gì, nên làm gì tiếp.

Trạng thái kiểm tra lúc viết: `dotnet test JCAP.Tests` 594/594 pass, `npm test` 154/154 pass, `npm run build` chạy được.
Mọi số liệu độ tin cậy dưới đây đo trên **giọng tổng hợp VOICEVOX**, không phải giọng người học thật.

## 1. Mục tiêu đang theo đuổi

Thước đo là **mức giống giọng mẫu VOICEVOX** (người học nói theo mẫu), không phải "đúng chuẩn người Nhật".
Nguyên tắc: mỗi nhận xét đưa ra phải có bằng chứng âm thanh đủ tin cậy; loại nhận xét nào chưa đủ thì ẩn, không hiện dạng đoán.

## 2. Tóm tắt hiện trạng

| Khía cạnh | Trạng thái | Có điểm? | Độ tin cậy đã đo |
|---|---|---|---|
| **Nhận dạng âm vị trên chính bản ghi của JCAP** (backend, ONNX) | Có, **nguồn chấm chính** | Đầu vào của điểm | Lỗi mora 3.8% trên giọng VOICEVOX; ít "sửa" lỗi phát âm hơn Web Speech; cùng micro người học chọn |
| Nhận dạng của trình duyệt (Web Speech) | Có | Chỉ hiện chữ trực tiếp khi nói; dự phòng khi thiếu mô hình/bản ghi | Luôn nghe micro mặc định của hệ điều hành; có thể tự "sửa" lỗi phát âm |
| **Độ khớp nội dung** (so mora theo từ, `kana-word-v1`) | Có, đang dùng | **Có, là điểm duy nhất** | Tốt về chữ viết, bỏ sót lỗi phát âm bị nhận dạng sửa |
| Cổng chất lượng âm thanh (trình duyệt) | Có | Không | Heuristic chưa hiệu chuẩn trên nhiều micro |
| Tốc độ nói so với giọng mẫu | Có | Không (nhận xét) | Khá ổn định trên giọng tổng hợp |
| Khoảng dừng thừa, nêu theo **từ** | Có | Không (nhận xét) | Sai số thường ±1 mora, có ca lệch 2–3 mora |
| Trường âm ngắn (DTW) | Có, nhãn "Thử nghiệm" | Không (nhận xét) | Bắt ~35% lỗi, báo nhầm ~1% trên giọng VOICEVOX |
| Phát âm từng âm vị | **Mới thăm dò, chưa tích hợp** | — | Xem mục 5 |
| Ngữ điệu, pitch accent, `っ`, `ん` | Chưa làm | — | — |
| Điểm phát âm, điểm lưu loát | Chưa có (`null`, hiển thị "Chưa đo") | — | — |

## 3. Luồng âm thanh hiện tại

```
Trình duyệt                                         Backend (ShadowingEvaluationService)
-----------                                         -------------------------------------
Ghi âm (MediaRecorder) + Web Speech (ja-JP)
Cổng âm thanh (RMS)  → needs_retry? dừng
Xuất WAV 16 kHz mono (OfflineAudioContext)
POST evaluate-audio: sentenceId, transcript final,  Lấy câu mẫu từ CSDL (không tin targetText)
  gate, analysisWav, referenceSpeakerId             Cổng needs_retry? → unavailable
                                                    So khớp theo từ (VOICEVOX G2P) → điểm, diff
                                                    Nếu Content Match ≥ 70 và transcript tương ứng câu mẫu:
                                                      - VAD + nhịp nói của người học (FluencyAnalyzer)
                                                      - Giọng mẫu VOICEVOX (đúng nhân vật đã chọn) → cùng bộ đo
                                                      - So tốc độ, khoảng dừng (FluencyComparer)
                                                      - Định vị khoảng dừng theo từ (PausePositionLocator)
                                                      - Trường âm ngắn (MoraDurationAnalyzer)
                                                    Trả điểm + nhận xét; lỗi ở phần nhịp không ảnh hưởng điểm
```

## 4. Chi tiết từng phần đã làm

### 4.1 Cổng chất lượng âm thanh — `jcap-web/src/utils/audioGate.ts`
- Chặn bản ghi im lặng, quá ngắn (< 400 ms), quá nhỏ (RMS giọng < 0.008 ≈ −42 dB), vỡ tiếng nặng (> 30% khung), SNR < 6 dB.
- **RMS giọng = trung vị các khung đang có tiếng** (khung ≥ 25% mức phân vị 95), nên bản ghi dài mà nói ít không còn bị chặn nhầm "mic quá nhỏ" như cách cũ (trung bình nửa khung to nhất).
- Thông báo tách riêng "nói trọn câu" (quá ngắn) và "âm lượng mic quá nhỏ"; mức đo nằm trong `volumeDb`.
- Bộ đo trực tiếp không đo được thì giải mã chính bản ghi để đo lại; vẫn không được thì `unmeasured` (không bao giờ coi là `good`).

### 4.2 Xuất WAV phân tích — `jcap-web/src/utils/wavEncoder.ts`
- `decodeAudioData` không đảm bảo 16 kHz, nên bản ghi được render lại qua `OfflineAudioContext` ở 16 kHz mono rồi mã hóa WAV PCM 16-bit. Backend (`WavPcmReader`) **từ chối** WAV sai tần số thay vì phân tích sai.

### 4.3 Nhịp nói — `FluencyAnalyzer.cs`, `FluencyComparer.cs` (cấu hình `Shadowing:Fluency:Comparison:*`)
- VAD theo năng lượng, khung 20 ms, ngưỡng thích nghi, có hysteresis 4 dB. Khoảng lặng < 120 ms được lấp (khoảng đóng âm tắc, `っ`); **khoảng dừng = khoảng lặng ≥ 250 ms giữa hai đoạn nói**; im lặng đầu/cuối bị loại.
- Cùng bộ VAD cho người học và giọng mẫu. Số mora luôn đếm từ câu mẫu.
- **Điều kiện so sánh** (thiếu thì ẩn, không nhận xét): kết quả `completed`; Content Match ≥ 70; số mora transcript / câu mẫu trong [0.8, 1.25]; đoạn nói cả hai phía ≥ 800 ms; có giọng mẫu.
- Nhận xét (tối đa 3 mỗi câu, mỗi nhận xét có mã, giá trị đo, ngưỡng, dữ liệu hỗ trợ):

| Mã | Điều kiện kích hoạt |
|---|---|
| `slow_vs_reference` | Tốc độ (không tính dừng) / mẫu ≤ 0.70 |
| `fast_vs_reference` | ≥ 1.40 |
| `extra_pause` | Dừng ≥ 400 ms ở chỗ mẫu không dừng (dung sai vị trí 0.12); 1/3 đầu và 1/3 cuối câu không bị báo |

### 4.4 Định vị khoảng dừng theo từ — `PausePositionLocator.cs`
- Cắt bản ghi người học tới lúc bắt đầu dừng, căn chỉnh với phần đầu của giọng mẫu bằng DTW đầu-mở, tra mốc mora của VOICEVOX để biết đã đọc xong bao nhiêu mora, rồi gióng với ranh giới từ → "dừng 2.7 giây sau 「棚に」, trước 「入れても」".
- Đặc trưng căn chỉnh là **log-năng lượng 4 dải tần**, không dùng MFCC (MFCC phụ thuộc âm sắc nên giọng nam lệch 2–4 mora).
- Không đủ tin cậy (chi phí căn chỉnh > `Shadowing:Pause:MaxAlignmentCost` = 2.5, thiếu mốc, lệch số mora) thì quay về nói chung "ở khoảng giữa câu", **không đoán từ**; lý do ghi trong `data.placementFailure`.

### 4.5 Trường âm ngắn (thử nghiệm) — `MoraDurationAnalyzer.cs`, `SpeechFeatures.cs`, `Dtw.cs`
- Mốc mora của giọng mẫu lấy từ `audio_query` (co giãn khớp khoảng nói thật; lệch quá ±15% thì bỏ).
- MFCC 13 hệ số + 13 delta (CMVN theo bản ghi) + DTW ràng buộc độ dốc (bước tối đa 1:3, dải Sakoe-Chiba).
- Với mỗi đoạn trường âm: `RelativeRatio = (thời lượng người học / mẫu) / tốc độ chung`; ≤ 0.55 thì nhận xét `chouon_short` (tối đa 2, có nhãn "Thử nghiệm").
- Lọc độ tin cậy: khoảng cách MFCC ≤ 5.5, độ phân tán tốc độ ≤ 0.4; vượt thì `ALIGNMENT_UNRELIABLE`, trả số đo nhưng không gắn cờ. Tắt bằng `Shadowing:Duration:Enabled=false`.

## 5. Bằng chứng đã đo (giọng VOICEVOX)

### 5.1 Trường âm bằng DTW (cấu hình sản phẩm)
Giọng mẫu ずんだもん; "người học" là 6 nhân vật khác × 2 tốc độ (x1.0, x1.3) × 7 cặp từ chỉ khác trường âm; mỗi loại 84 ca.

| Ca thử | Kết quả |
|---|---|
| Đọc đúng trường âm | không báo 66, **báo nhầm 1**, không đủ điều kiện 17 |
| Đọc ngắn trường âm | **phát hiện 29**, bỏ sót 33, không đủ điều kiện 22 |
| Đọc câu khác hẳn | báo lỗi 0, không đủ điều kiện 78 |

Quá trình chọn cấu hình: DTW không ràng buộc độ dốc cho 70% phát hiện nhưng báo nhầm 26%; thêm ràng buộc độ dốc và đặc trưng delta đưa báo nhầm về ~1% (ngưỡng 0.55).
Hai cách đã thử và **bỏ**: đo "độ dài nguyên âm ổn định" (kém hơn), dùng tốc độ cục bộ thay tốc độ chung (không cải thiện).

### 5.2 Vị trí khoảng dừng theo từ
Dừng 2.5 giây, 22 ca mỗi giọng: giọng nữ 20/22 ca lệch không quá ±1 mora (13 ca đúng mora); giọng nam 20/22 và 17/22; có ồn SNR 15 dB: 17/20 (2 ca bị từ chối). Có ca lệch 2–3 mora → tên từ là **ước lượng**.

### 5.3 Nhận dạng âm vị (chỉ thăm dò, **chưa nằm trong ứng dụng**)
- **Mô hình:** `prj-beatrice/japanese-hubert-base-phoneme-ctc` (Apache-2.0). Bản ONNX lượng tử hoá (≈123 MB) lấy từ `mnaoizyyy/charsiu-js-models`, thư mục `japanese-hubert-base-phoneme-ctc/model_quantized.onnx`. Đầu vào sóng 16 kHz, đầu ra 47 nhãn (`a i u e o`, `I U` = nguyên âm vô thanh, `cl` = `っ`, `N` = `ん`, `pau`, `sil`, các phụ âm…), khung 20 ms, giải mã CTC tham lam.
- **Cách đo:** âm vị mong đợi lấy từ `audio_query` của VOICEVOX; mô hình nghe bản ghi và cho chuỗi âm vị; căn chỉnh Levenshtein; "phát hiện" = có khác biệt trong vòng ±1 âm vị quanh vị trí lỗi; "báo nhầm" = đọc đúng mà vẫn có khác biệt ở vị trí đó. 11 loại lỗi × 10 nhân vật × 2 tốc độ = 20 ca mỗi loại (đọc đúng và đọc lỗi bằng cùng nhân vật).

| Loại lỗi | Phát hiện | Báo nhầm tại vị trí |
|---|---|---|
| Trường âm (`おばさん`) | 95% | 5% |
| `f→h` (`ふ→ひ`) | 100% | 0% |
| `k→g` | 95% | 25% |
| `z→j` (`ざ→じゃ`) | 85% | 15% |
| `t→d` | 80% | 0% |
| `っ` (`がこう`) | 90% | **50%** |
| `ts→ch` | 55% | 10% |
| `h→sh` | 45% | 5% |
| `sh→s` | 20% | 0% |
| `r→d` | 20% | 0% |
| `ん` | **0%** | 0% |
| Tổng | 62% | 10% |

Trên câu đọc đúng, mô hình tự nghe nhầm ~4.6% số âm (PER); 24% câu đúng có ít nhất một chỗ bị báo khác.
**Nhận xét:** chất lượng không đều giữa các loại. Trường âm tốt hơn hẳn cách DTW (95%/5% so với ~35%/~1%); `っ` và `ん` không dùng được; một số kết quả thấp (`r/d`, `sh/s`) có thể vì giọng VOICEVOX phát hai âm gần nhau, chưa tách bạch với lỗi của mô hình.
Script thăm dò **không được lưu trong repo** (thư mục tạm đã bị dọn); phương pháp ở trên đủ để làm lại.

### 5.4 Nhận dạng từ chính bản ghi của JCAP: âm vị (backend) so với ReazonSpeech (giai đoạn 0–1)
Mục đích: thay nhận dạng của trình duyệt (Web Speech luôn nghe micro mặc định của hệ điều hành, lệch với micro người học chọn; và hay "sửa" lỗi phát âm).

**Đã nối vào luồng chấm (nguồn chính, `recognitionSource = phoneme`):** `IPhonemeRecognizer` / `OnnxPhonemeRecognizer` (ONNX Runtime, nạp mô hình một lần, CPU) và `PhonemeKana` (âm vị → hiragana).
Mô hình tải bằng `scripts/download-speech-models.ps1` (hoặc `.sh`), có kiểm tra SHA-256, nằm ở `models/phoneme` (git bỏ qua). Thiếu mô hình thì `IsAvailable = false`, hệ thống chạy như cũ.
Cấu hình: `Shadowing:Phoneme:Enabled` (mặc định true), `Shadowing:Phoneme:ModelPath`, `Shadowing:Phoneme:VocabPath`.

**Bộ kiểm thử VOICEVOX** (`JCAP.Tests/Bench/SpeechRecognitionBench.cs`): 6 nhân vật × 24 câu N5–N3 + 13 cặp tối thiểu (đọc đúng/đọc sai một âm) + 5 mẫu im lặng/ồn.
Chạy: bật VOICEVOX, tải mô hình, rồi `JCAP_BENCH=1 dotnet test JCAP.Tests --filter "FullyQualifiedName~SpeechRecognitionBench"`
(audio cache và báo cáo `bench-report.md` ở `JCAP_BENCH_DIR`, mặc định `%TEMP%/jcap-bench`). Bộ nhận dạng khác được so bằng tệp `results-<tên>.json` sinh từ `manifest.json`.
ReazonSpeech (`sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01`, bản int8) được chạy ngoài repo bằng `sherpa-onnx` Python trên cùng audio; chưa đưa vào backend vì gói .NET của nó kèm ONNX Runtime riêng, có thể xung đột.

| Chỉ số (giọng VOICEVOX) | Âm vị HuBERT (backend) | ReazonSpeech |
|---|---|---|
| Lỗi mora, câu thường (n=144) | **3.8%** | 7.8% |
| Câu đúng hoàn toàn | **114/144** | 100/144 |
| Bịa chữ với im lặng/ồn (n=5) | 2/5 (một chữ 「あ」) | **5/5** (kể cả im lặng tuyệt đối → 「はい」) |
| Thời gian mỗi câu (trung vị / p95) | 61 / 93 ms | 40 / 56 ms |

Độ trung thực khi đọc SAI một âm (nghe ra đúng câu sai / "sửa" thành câu đúng), mỗi ô n=6, trường âm n=18, `っ` n=12:

| Loại lỗi | Âm vị HuBERT | ReazonSpeech |
|---|---|---|
| Trường âm | 14/18 trung thực, 4 bị sửa | 12/18, 6 bị sửa |
| `っ` | 11/12, 1 bị sửa (nhưng đọc ĐÚNG chỉ 7/12 được nghe đúng) | 11/12, 1 bị sửa |
| `ん` | 0/6, 6 bị sửa | 1/6, 5 bị sửa |
| `sh→s` | 0/6, 5 bị sửa | 0/6, 2 bị sửa |
| `ts→ch` | 0/6, 4 bị sửa | 0/6, 4 bị sửa |
| `z→j` | 3/6, 1 bị sửa | 0/6, 6 bị sửa |
| `t→d` | 3/6 | 0/6 |
| `k→g` | 2/6 | 1/6 |
| `f→h` | 2/6, 1 bị sửa | 1/6, 3 bị sửa |
| `r→d` | 0/6, 5 bị sửa | 0/6, 4 bị sửa |

**Kết luận:** mô hình âm vị tốt hơn ReazonSpeech ở độ chính xác, độ trung thực và việc bịa chữ, và chạy được ngay trong backend .NET. ReazonSpeech bịa chữ với **mọi** mẫu im lặng/ồn và "sửa" nhiều hơn (ra chữ có kanji nên lỗi phát âm bị che).
Cả hai đều yếu ở `ん`, `sh/s`, `ts/ch`, `r/d` (có thể một phần vì giọng VOICEVOX đọc các cặp này gần nhau). Mô hình âm vị vẫn còn bịa một chữ 「あ」 với nền ồn, nên cần giữ cổng âm thanh và lọc kết quả một mora có độ tự tin thấp.
Đã chọn mô hình âm vị làm nguồn chấm và nguồn "Bạn đã nói" (kana). Web Speech chỉ còn hiện chữ trực tiếp (từ M1 không còn làm nguồn chấm dự phòng). Chưa kiểm chứng trên giọng người thật.

**Điểm nội dung đầu-cuối** (kana từ mô hình → `KanaMoraComparer.CompareWithReadingAsync` với cách đọc câu mẫu của VOICEVOX thật): câu thường đọc đúng trung bình 91, đạt 100 điểm 114/144; cặp tối thiểu đọc đúng trung bình 87 (60/78 đạt 100); cố ý đọc sai một âm trung bình 57 (25/78 vẫn đạt 100, tức lỗi đó không bị phát hiện).
Khi nối vào đã phát hiện và sửa một lỗi so khớp: câu mẫu chuẩn hoá trường âm trong từng từ (`でんしゃが｜あります`) còn kana liền một chuỗi thì gộp `があ` thành trường âm, nên câu nghe đúng vẫn bị trừ (96/144 → 114/144 sau khi sửa). Nay `ー` và nguyên âm lặp cùng âm (a→あ, i→い, u→う, e→え/い, o→お/う) được coi là khớp; bỏ hẳn một mora vẫn là lỗi.

### 5.5 Cải thiện độ chính xác đầu vào và đối chiếu câu mẫu
**Xử lý trước khi nhận dạng** (`PhonemePreprocessing`), chọn bằng `JCAP.Tests/Bench/RecognitionRobustnessBench.cs`: 144 câu VOICEVOX × 6 điều kiện giả lập micro thật
(sạch, nói nhỏ −30 dB, ồn SNR 15 dB và 5 dB, phòng vọng, lặng dài + ù 50 Hz). Lỗi mora trung bình:

| Cấu hình | Trung bình | Sạch | Ồn SNR 5 dB | Bịa chữ với im lặng/ồn (4 mẫu) |
|---|---|---|---|---|
| Không xử lý | 5.0% | 3.8% | 14.6% | 3/4 mẫu ra chữ |
| Cắt lặng / chuẩn hoá mức / cả ba | 4.9–5.1% | 3.6–4.5% | 13.0–14.8% | vẫn ra chữ |
| **Lọc ù 80 Hz + đệm 500 ms lặng hai đầu (mặc định)** | **1.9%** | **0.8%** | **6.8%** | **0/4** |

Lý do: mô hình hay mất âm đầu/cuối khi bản ghi bắt đầu hoặc dừng sát tiếng nói; đệm lặng hai đầu khắc phục. Cắt lặng làm tệ hơn nên tắt. Thêm ~50–80 ms xử lý mỗi câu (~0.2 giây cho câu 2.5 giây).
Sau thay đổi, bộ kiểm thử chính: lỗi mora câu thường **0.8%** (130/144 câu đúng hoàn toàn), không bịa chữ; điểm đầu-cuối câu đọc đúng trung bình **97** (130/144 đạt 100),
cặp tối thiểu đọc đúng 96 (72/78 đạt 100), cố ý đọc sai một âm 62 (27/78 vẫn đạt 100).
**Đánh đổi:** đọc đúng được nghe đúng nhiều hơn hẳn (trường âm 18/18, `っ` 11/12), nhưng khi cố ý đọc SAI trường âm/`っ` mô hình "sửa" thành câu đúng nhiều hơn (trường âm 6/18, `っ` 5/12 bị sửa, trước là 4/18 và 1/12); `t/d`, `k/g` trung thực 6/6.

**Đối chiếu câu mẫu** (phát hiện bằng chính câu `みなさん、こんにちは。入国の目的は何ですか。`):
1. Bỏ dấu câu trước khi gửi VOICEVOX làm nhiều từ dính thành một cụm (`ミナサンコンニチワニュウコクノ`), một lỗi nhỏ làm sai cả cụm (thiếu trường âm ở 入国 chỉ được 21 điểm).
   Nay `VoiceVoxKanaReader` giữ dấu câu khi gửi engine, và `KanaMoraComparer` luôn bắt đầu từ mới sau dấu câu → 79 điểm, chỉ 入国 bị đánh sai.
2. VOICEVOX luôn đọc 何ですか thành なにですか: nói đúng なんですか bị trừ (79 → **100**). Nay chữ Hán có cách đọc hợp lệ khác (`AlternativeReadings`, hiện chỉ 何: なに/なん)
   được chấp nhận khi người học nói ĐÚNG một trong các cách đọc liệt kê; không đoán cách đọc nào khác.
3. Dòng câu mẫu không còn chèn nguyên văn phần người học nói thừa (làm câu mẫu lẫn với lời người học); phần thừa là dấu `＋` nhỏ, rê chuột xem nội dung.

### 5.6 Sửa thu âm cho giọng thật (chưa đo bằng giọng thật)
Thử bằng giọng thật trên micro laptop: `パスポートを見せてください` nhận thành `すぽうっとを見せてください` (mất `パ` đầu câu). Nguyên nhân khả dĩ nhất là
**thu âm**, không phải mô hình: trước đây micro được mở lúc bấm ghi, nên 0.2–0.5 giây đầu bị mất (thiết bị khởi động, tự chỉnh âm lượng đang dò mức) — đúng chỗ âm đầu câu.
Đã sửa (`jcap-web/src/utils/warmMic.ts`, `pcmTakeBuffer.ts`):
1. **Giữ micro mở sẵn** khi tới lượt người học (chỉ khi trình duyệt đã cấp quyền micro, không tự bật hộp xin quyền). Micro được **đóng khi đang phát âm thanh**
   (giọng mẫu, lượt người kia, nghe lại) để tai nghe Bluetooth không chuyển sang chế độ đàm thoại làm giọng mẫu bị rè, và mở lại khi phát xong; đóng khi hết buổi hoặc rời trang.
   Trong lúc micro mở, trình duyệt hiện biểu tượng đang dùng micro.
2. **Thu trước 0.5 giây:** bản ghi chấm điểm lấy thẳng PCM từ micro (AudioWorklet) và đặt 0.5 giây âm thanh ngay trước lúc bấm vào đầu bản ghi.
   Không lấy phần thu trước khi đang phát âm thanh hoặc chưa quá 150 ms sau khi phát xong (tiếng loa sẽ bị nhận thành chữ). Nhịp nói tính khoảng lặng đầu câu riêng nên không bị lệch.
   Không có PCM (trình duyệt cũ) thì dùng bản MediaRecorder như trước. Bản MediaRecorder vẫn dùng để nghe lại và kiểm tra âm lượng.
3. **Bật/tắt khử nhiễu + tự chỉnh âm lượng** của trình duyệt (`localStorage` `jcap_mic_voice_processing` = `off`; khử tiếng vọng luôn bật). Mặc định vẫn bật cho tới khi có số liệu.

**Đo bằng giọng thật (chỉ chế độ phát triển):** trong `npm run dev`, dưới khối kết quả có thanh "Thử nghiệm (dev)": nút **Tải bản ghi** lưu về máy cặp
`jcap-s{id}-{thời gian}.wav` (đúng WAV 16 kHz backend nhận dạng) + `.json` (câu mẫu, cấu hình micro, phần thu trước, transcript Web Speech, kết quả lúc chấm),
và nút bật/tắt khử nhiễu. Không gửi hay lưu bản ghi ở đâu khác. Chạy `JCAP_BENCH=1 JCAP_REAL_DIR=<thư mục> dotnet test JCAP.Tests --filter "FullyQualifiedName~RealRecordingBench"`
(cần VOICEVOX) để có `real-report.md`: lỗi mora từng lượt theo 4 cấu hình xử lý trước, kana mô hình nghe ra và transcript Web Speech để so.
Đề xuất thu ~10 câu: đọc đúng và cố ý sai một âm, mỗi câu thử cả khử nhiễu bật và tắt.
Kết quả thử lại sau khi sửa thu âm (người dùng): câu `パスポート` **vẫn sai nhiều** → nguyên nhân chính là cách nhận dạng tự do, dẫn tới 5.7.

### 5.7 Chấm theo câu mẫu thay cho nhận dạng tự do (`PronunciationAligner`, `CtcScorer`)
Nhận dạng tự do bắt mô hình đoán 1 trong 47 âm ở mỗi chỗ mà không biết câu mẫu, nên giọng người học (khác giọng bản xứ mô hình đã học) dễ ra kana lộn xộn.
Shadowing luôn biết trước câu mẫu, nên nay hỏi mô hình "mora này đúng hay sai theo kiểu nào" (so xác suất CTC của câu mẫu với từng biến thể lỗi một mora),
xem `docs/shadowing-evaluation.md`. Không thêm mô hình, ~70 ms mỗi câu. Ngưỡng chọn bằng `JCAP.Tests/Bench/AlignmentBench.cs` (giọng VOICEVOX, 6 nhân vật):

| | Nhận dạng tự do (cũ) | Theo câu mẫu (Margin 4, nguyên âm +2) |
|---|---|---|
| Câu thường đọc đúng đạt 100 (n=144) | 130 | **141** |
| Câu thường đọc đúng + ồn SNR 10 dB đạt 100 | 109 | **134** |
| Cặp tối thiểu đọc đúng đạt 100 (n=78) | 72 | **76** |
| Đọc sai một âm bị trừ điểm (n=78) | 51 | 38 |

Theo loại lỗi (theo câu mẫu): trường âm 11/18, `っ` 7/12, `t→d` 6/6, `k→g` 4/6, `f→h` 6/6, `z→j` 4/6; `ん`, `sh→s`, `ts→ch`, `r→d` 0/6 (nhận dạng tự do cũng gần như không bắt được các loại này).
Ngưỡng nhỏ hơn bắt nhiều lỗi hơn nhưng báo nhầm nhiều hơn (Margin 2: phát hiện 45/78, đọc đúng có ồn đạt 100 chỉ 127/144). Ưu tiên ít báo nhầm vì đó là lỗi người dùng gặp.
**Đọc câu khác:** chỉ số lệch câu mẫu khi đọc đúng ≤ 0.42 (có ồn ≤ 0.97), đọc sai một âm ≤ 0.70, đọc câu khác ≥ 4.42 → ngưỡng 2.5.
**Còn phải kiểm chứng trên giọng thật:** `RealRecordingBench` in thêm bảng "tự do so với theo câu mẫu" cho từng bản ghi tải về; ngưỡng có thể cần chỉnh theo đó.

## 6. Chưa làm

- Nhận xét phát âm từng âm trong ứng dụng; `っ`, `ん`, pitch accent.
- Ngữ điệu (đường F0 so với cao độ từng mora VOICEVOX trả về).
- Điểm phát âm, điểm lưu loát, "độ giống giọng mẫu" tổng hợp (`fluencyScore`, `pronunciationScore` vẫn `null`).
- Kiểm chứng trên giọng người học thật và nhiều micro (chủ đích hiện tại: chỉ cần giống VOICEVOX, nhưng giọng người khác giọng máy vẫn ảnh hưởng độ đo, xem mục 7).
- Phân tích phát âm AI trả credit (đã gỡ tạm thời vì bản cũ sinh điểm bằng `Random`).

## 7. Giới hạn đã biết

1. **Điểm chỉ là độ khớp chữ.** Web Speech có thể tự sửa lỗi phát âm thành từ chuẩn (đọc `がこう` vẫn ra `学校`), nên lỗi đó không bị phát hiện bởi điểm.
2. **Giọng mẫu là giọng máy.** Các nhân vật VOICEVOX lệch nhau tới ~55% về nhịp tự nhiên (đo trên một câu). Hệ thống so với đúng nhân vật người học đã chọn, nhưng nếu `referenceSpeakerId` thiếu hoặc người học nghe file `nativeAudioUrl` của admin thì nhịp có thể lệch.
3. **Giọng người khác giọng máy** (nam/nữ, cao thấp, micro): độ chính xác của DTW, MFCC và mô hình âm vị trên giọng người chưa biết. Ngữ điệu (khi làm) cần chuẩn hóa theo người nói.
4. **Phụ thuộc VOICEVOX:** engine tắt thì không chấm được (`READING_UNAVAILABLE`) và không có giọng mẫu; engine xử lý tuần tự nên lấy cách đọc có thể bị chờ khi đang tổng hợp giọng (nên dùng `Shadowing:Reading:BaseUrl` trỏ engine riêng).
5. **Ngưỡng là heuristic** (cổng âm thanh, VAD, nhịp, trường âm), chỉ được chỉnh theo giọng tổng hợp.
6. **Chỉ Chrome/Edge** hỗ trợ Web Speech đầy đủ; Safari/Firefox có thể báo `BROWSER_STT_UNSUPPORTED`. Transcript do client gửi nên client gian lận vẫn gửi được transcript khớp tuyệt đối.
7. **Bản ghi gốc vẫn được upload** mỗi lần chấm dù backend không dùng (chỉ `analysisWav` được dùng).

## 8. Việc cải tiến đề xuất (theo thứ tự ưu tiên)

| # | Việc | Vì sao | Công sức | Rủi ro |
|---|---|---|---|---|
| 1 | **Tích hợp nhận xét âm vị có chọn lọc** (trước hết trường âm, `f/h`, `t/d`), thay phần DTW trường âm nếu mô hình âm vị tốt hơn | Trường âm: 95%/5% so với ~35%/~1% | Trung bình: thêm ONNX Runtime (NuGet) và mô hình 123 MB; CPU ~0.2–0.5 giây/câu | Chưa biết với giọng người thật; chỉ bật loại đạt chỉ tiêu |
| 2 | **Bộ kiểm thử tự động bằng VOICEVOX** (cặp đúng/sai âm vị, nhiều nhân vật, tốc độ), chạy được trong CI hoặc một lệnh | Biến số liệu mục 5 thành kiểm thử lặp lại được, chốt ngưỡng theo số liệu | Thấp–trung bình | Thấp |
| 3 | **Ngữ điệu:** so đường F0 (chuẩn hóa semitone theo trung vị của người nói) với cao độ từng mora từ `audio_query` | Khía cạnh còn thiếu lớn nhất; mục tiêu là giống mẫu | Cao (cần ước lượng F0 bằng C#) | Lệch octave, nhiễu F0; chỉ nên báo ngữ điệu câu, gắn "thử nghiệm" |
| 4 | **"Độ giống giọng mẫu"** gộp từ các thành phần đã kiểm chứng, công thức minh bạch, có phiên bản | Cho người học một con số dễ hiểu mà vẫn có căn cứ | Trung bình | Phải nói rõ là "giống giọng mẫu", không phải "chuẩn tiếng Nhật" |
| 5 | **Nêu tên âm sai** trong nhận xét ("`し` giống `す`") cho các loại âm vị đạt chỉ tiêu | Người học biết sửa gì | Thấp sau mục 1 | Báo nhầm; cần ngưỡng theo loại |
| 6 | **Thu vài bản ghi người thật** (5–8 người, nhiều thiết bị, cặp đúng/cố ý sai) và gán nhãn bằng người biết tiếng Nhật | Điều kiện để tin các con số ngoài giọng tổng hợp | Cần người tham gia | — |
| 7 | **Bảng hệ số tốc độ theo từng nhân vật** (đo một lần) để ngưỡng nhanh/chậm công bằng giữa các giọng | Các giọng lệch nhau tới ~55% | Thấp | Thấp |
| 8 | Hiện **tên giọng đang dùng để so** trong khối nhận xét | Người học hiểu vì sao "chậm hơn mẫu" | Rất thấp | Không |
| 9 | Bỏ upload bản ghi gốc, chỉ gửi `analysisWav` | Giảm dung lượng và thời gian | Thấp | Không |
| 10 | Engine VOICEVOX riêng cho lấy cách đọc | Tránh timeout khi đang tổng hợp giọng | Hạ tầng | Không |

Không nên làm: dùng `っ`, `ん`, `r/d`, `sh/s` của mô hình âm vị để nhận xét khi chưa cải thiện (báo nhầm cao hoặc không phát hiện); đưa nhận xét "thử nghiệm" vào điểm tổng khi chưa có chỉ tiêu.

## 9. Cấu hình và ngưỡng chính

| Khóa | Mặc định | Ý nghĩa |
|---|---|---|
| `Shadowing:Fluency:Comparison:MinContentMatch` | 70 | Ngưỡng Content Match để được so nhịp |
| `...:SlowRatio` / `FastRatio` | 0.70 / 1.40 | Ngưỡng chậm / nhanh so với mẫu |
| `...:ExtraPauseMinMs` | 400 | Dừng thừa tối thiểu |
| `...:MaxObservations` | 3 | Số nhận xét tối đa mỗi câu |
| `Shadowing:Pause:MaxAlignmentCost` | 2.5 | Chi phí tối đa để nêu tên từ cho khoảng dừng |
| `Shadowing:Duration:Enabled` | true | Bật/tắt đo trường âm (thử nghiệm) |
| `Shadowing:Duration:ShortRatio` | 0.55 | Ngưỡng trường âm ngắn |
| `Shadowing:Duration:MaxAlignmentCost` / `MaxTempoSpread` | 5.5 / 0.4 | Lọc độ tin cậy của căn chỉnh |
| `Shadowing:Fluency:ReferenceSpeaker` | = `Shadowing:Reading:Speaker` | Giọng mẫu dự phòng khi client không gửi |
| `Shadowing:Reading:BaseUrl` | = `VoiceVox:BaseUrl` | Nên là engine riêng |
| `Shadowing:Recognition:Source` | — | **Đã bỏ (M1):** không còn chấm bằng transcript của trình duyệt; giá trị `web_speech` bị bỏ qua |
| `Shadowing:Recognition:MaxConcurrent` / `QueueTimeoutMs` | số lõi / 2 · 10000 | Số lượt nhận dạng chạy đồng thời; chờ quá hạn → `SERVER_BUSY` |
| `Shadowing:Recognition:Mode` | `aligned` | `free`: nhận dạng tự do như trước thay vì chấm theo câu mẫu |
| `Shadowing:Alignment:Margin` / `VowelExtraMargin` | 4 / 2 | Độ chênh (nat) để một mora bị coi là đọc sai; lỗi đổi nguyên âm cần thêm |
| `Shadowing:Alignment:MaxMismatchPerFrame` | 2.5 | Lệch câu mẫu lớn hơn mức này = đọc câu khác → chấm tự do |
| `Shadowing:Phoneme:Enabled` | true | Bật/tắt bộ nhận dạng âm vị (thiếu tệp mô hình thì tự tắt) |
| `Shadowing:Phoneme:ModelPath` / `VocabPath` | `models/phoneme/model_quantized.onnx` / `vocab.json` | Đường dẫn tính từ thư mục gốc dự án |

## 10. Bản đồ file (phần âm thanh)

| Việc | File |
|---|---|
| Cổng âm thanh | `jcap-web/src/utils/audioGate.ts`, `jcap-web/src/services/audioMetricsService.ts` |
| Xuất WAV 16 kHz | `jcap-web/src/utils/wavEncoder.ts` |
| Micro mở sẵn, thu trước 0.5 s | `jcap-web/src/utils/warmMic.ts`, `jcap-web/src/utils/pcmTakeBuffer.ts` |
| Thu dữ liệu giọng thật (dev) | `jcap-web/src/components/shadowing/RecordingDevTools.tsx`, `JCAP.Tests/Bench/RealRecordingBench.cs` |
| Ghi âm, Web Speech, gửi/nhận | `jcap-web/src/views/shadowing/LearnerShadowingPracticeView.tsx`, `jcap-web/src/services/shadowingService.ts` |
| Hiển thị nhận xét nhịp | `jcap-web/src/components/shadowing/ShadowingSentenceResultCard.tsx` |
| Điều phối | `Services/Implementations/ShadowingEvaluationService.cs` |
| Đọc WAV, VAD, nhịp nói | `WavPcmReader.cs`, `FluencyAnalyzer.cs`, `FluencyComparer.cs` |
| Giọng mẫu và mốc mora | `VoiceVoxReferenceProvider.cs`, `VoiceVoxService.cs` (`GetMoraTimelineAsync`) |
| Vị trí khoảng dừng theo từ | `PausePositionLocator.cs` |
| Trường âm | `MoraDurationAnalyzer.cs`, `SpeechFeatures.cs`, `Dtw.cs` |
| Chấm theo câu mẫu | `PronunciationAligner.cs`, `CtcScorer.cs`; bench `JCAP.Tests/Bench/AlignmentBench.cs` |
| Nhận dạng âm vị từ bản ghi (nguồn chấm chính) | `OnnxPhonemeRecognizer.cs`, `PhonemeKana.cs`, `IPhonemeRecognizer.cs`; mô hình tải bằng `scripts/download-speech-models.*` |
| Bộ kiểm thử VOICEVOX | `JCAP.Tests/Bench/SpeechRecognitionBench.cs` (chạy khi `JCAP_BENCH=1`) |
| Kiểm thử | `FluencyAnalyzerTests`, `FluencyComparerTests`, `MoraDurationTests`, `PausePositionLocatorTests`, `ShadowingEvaluationServiceTests`; frontend `audioGate.test.ts`, `wavEncoder.test.ts` |
