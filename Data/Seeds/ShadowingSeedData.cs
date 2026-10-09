using System;
using System.Collections.Generic;
using JCAP.Models;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// DEV SAMPLE / NON-PRODUCTION SEED DATA
    /// Dữ liệu mẫu phục vụ phát triển và kiểm thử tính năng Shadowing (N5, N4, N3).
    /// </summary>
    public static class ShadowingSeedData
    {
        public static List<ShadowingDialogue> GetDevSampleDialogues(int ramenScenarioId, int? baitoScenarioId = null)
        {
            var targetScenarioId = baitoScenarioId ?? ramenScenarioId;

            return new List<ShadowingDialogue>
            {
                // JLPT N5 Dialogue
                new ShadowingDialogue
                {
                    Title = "Hội thoại gọi món Ramen và xin thêm nước",
                    ScenarioId = ramenScenarioId,
                    JLPTLevel = "N5",
                    SourceDescription = "Giáo trình: みんなの日本語 I — Bài 5: 注文と依頼",
                    SpeakerRoleA_Name = "Khách hàng (Học viên)",
                    SpeakerRoleB_Name = "Nhân viên quán Ramen",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    Sentences = new List<ShadowingSentence>
                    {
                        new ShadowingSentence
                        {
                            OrderIndex = 1,
                            SpeakerRole = "B",
                            JapaneseText = "いらっしゃいませ！何名様ですか？",
                            RomajiText = "Irasshaimase! Nan-mei sama desu ka?",
                            VietnameseTranslation = "Xin kính chào quý khách! Quý khách đi mấy người ạ?",
                            NativeAudioUrl = null
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 2,
                            SpeakerRole = "A",
                            JapaneseText = "一人です。カウンター席でお願いします。",
                            RomajiText = "Hitori desu. Kauntaa seki de onegaishimasu.",
                            VietnameseTranslation = "Tôi đi một mình. Cho tôi ngồi ghế quầy bar nhé.",
                            NativeAudioUrl = null
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 3,
                            SpeakerRole = "B",
                            JapaneseText = "こちらへどうぞ。ご注文はお決まりですか？",
                            RomajiText = "Kochira e douzo. Go-chuumon wa okimari desu ka?",
                            VietnameseTranslation = "Xin mời đi lối này. Quý khách đã chọn được món chưa ạ?",
                            NativeAudioUrl = null
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 4,
                            SpeakerRole = "A",
                            JapaneseText = "豚骨ラーメンを一つください。麺は硬めでお願いします。",
                            RomajiText = "Tonkotsu raamen o hitotsu kudasai. Men wa katame de onegaishimasu.",
                            VietnameseTranslation = "Cho tôi một bát mì Ramen xương heo. Sợi mì làm dai một chút nhé.",
                            NativeAudioUrl = null
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 5,
                            SpeakerRole = "B",
                            JapaneseText = "かしこまりました。少々お待ちください。",
                            RomajiText = "Kashikomarimashita. Shou-shou omachi kudasai.",
                            VietnameseTranslation = "Tôi hiểu rồi ạ. Xin quý khách vui lòng đợi một chút.",
                            NativeAudioUrl = null
                        }
                    }
                },

                // JLPT N4 Dialogue (Khớp chuẩn 100% mẫu thiết kế Club Day trường học do người dùng cung cấp)
                new ShadowingDialogue
                {
                    Title = "Hội thoại 01: クラブ紹介の案内 (Ngày giới thiệu CLB)",
                    ScenarioId = targetScenarioId,
                    JLPTLevel = "N4",
                    SourceDescription = "Giáo trình: みんなの日本語 II — Bài 14: 学校案内",
                    SpeakerRoleA_Name = "Yuuri (Tân học sinh)",
                    SpeakerRoleB_Name = "Ran (Tiền bối)",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    Sentences = new List<ShadowingSentence>
                    {
                        new ShadowingSentence
                        {
                            OrderIndex = 1,
                            SpeakerRole = "B",
                            JapaneseText = "田中さん、ちょっといいですか？",
                            RomajiText = "Tanaka-san, chotto ii desu ka?",
                            VietnameseTranslation = "Tanaka ơi, chị nói chuyện một chút được không?",
                            NativeAudioUrl = "/audio/shadowing/n4_club_01.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 2,
                            SpeakerRole = "A",
                            JapaneseText = "大丈夫です。大丈夫ですね。",
                            RomajiText = "Daijoubu desu. Daijoubu desu ne.",
                            VietnameseTranslation = "Không sao đâu ạ. Chắc chắn ổn mà.",
                            NativeAudioUrl = "/audio/shadowing/n4_club_02.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 3,
                            SpeakerRole = "B",
                            JapaneseText = "よかった。では、クラブ紹介の日と時間を伝えてもいい？",
                            RomajiText = "Yokatta. Dewa, kurabu shoukai no hi to jikan o tsutaete mo ii?",
                            VietnameseTranslation = "Tốt quá rồi. Vậy chị nói trước về ngày và thời gian giới thiệu câu lạc bộ được không?",
                            NativeAudioUrl = "/audio/shadowing/n4_club_03.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 4,
                            SpeakerRole = "A",
                            JapaneseText = "いいです、いつでもどうぞ。おねがいします。",
                            RomajiText = "Ii desu, itsudemo douzo. Onegaishimasu.",
                            VietnameseTranslation = "Được chứ ạ, chị cứ nói bất cứ lúc nào. Em nhờ chị ạ.",
                            NativeAudioUrl = "/audio/shadowing/n4_club_04.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 5,
                            SpeakerRole = "B",
                            JapaneseText = "来週の水曜日の午後３時からです。体育館で行います。",
                            RomajiText = "Raishuu no suiyoubi no gogo san-ji kara desu. Taiikukan de okonaimasu.",
                            VietnameseTranslation = "Bắt đầu từ 3 giờ chiều thứ Tư tuần sau. Sẽ tổ chức tại nhà thi đấu thể thao.",
                            NativeAudioUrl = "/audio/shadowing/n4_club_05.mp3"
                        }
                    }
                },

                // JLPT N3 Dialogue
                new ShadowingDialogue
                {
                    Title = "Hội thoại trao đổi về lịch trình dự án IT",
                    ScenarioId = targetScenarioId,
                    JLPTLevel = "N3",
                    SourceDescription = "Giáo trình: TRY! N3 — Bài 5: ITビジネス日本語",
                    SpeakerRoleA_Name = "Kỹ sư phần mềm (Học viên)",
                    SpeakerRoleB_Name = "Quản lý dự án (PM Tanaka)",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow,
                    Sentences = new List<ShadowingSentence>
                    {
                        new ShadowingSentence
                        {
                            OrderIndex = 1,
                            SpeakerRole = "B",
                            JapaneseText = "田中です。来週のリリース日程について確認させていただけますか？",
                            RomajiText = "Tanaka desu. Raishuu no ririisu nittei ni tsuite kakunin sasete itadakemasu ka?",
                            VietnameseTranslation = "Tôi là Tanaka. Chúng ta có thể thảo luận xác nhận về lịch trình release tuần tới được không?",
                            NativeAudioUrl = "/audio/shadowing/n3_proj_01.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 2,
                            SpeakerRole = "A",
                            JapaneseText = "はい、現在テストフェーズに入っており、予定通り進行しております。",
                            RomajiText = "Hai, genzai tesuto feezu ni haitte ori, yotei doori shinkou shite orimasu.",
                            VietnameseTranslation = "Vâng, hiện dự án đang bước vào giai đoạn kiểm thử và vẫn bám sát đúng tiến độ ạ.",
                            NativeAudioUrl = "/audio/shadowing/n3_proj_02.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 3,
                            SpeakerRole = "B",
                            JapaneseText = "バグの対応状況はどうなっていますか？クリティカルな問題は残っていますか？",
                            RomajiText = "Bagu no taiou joukyou wa dou natte imasu ka? Kuritikaru na mondai wa nokotte imasu ka?",
                            VietnameseTranslation = "Tình hình fix bug hiện ra sao rồi? Còn vấn đề nghiêm trọng nào chưa giải quyết không?",
                            NativeAudioUrl = "/audio/shadowing/n3_proj_03.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 4,
                            SpeakerRole = "A",
                            JapaneseText = "重要度高の課題はすべて解消済みで、軽微なUI修正のみ残っております。",
                            RomajiText = "Juuyoudo kou no kadai wa subete kaishou-zumi de, keibi na UI shuusei nomi nokotte orimasu.",
                            VietnameseTranslation = "Tất cả các lỗi mức độ High đều đã fix xong, hiện chỉ còn chỉnh sửa một số lỗi UI nhỏ thôi ạ.",
                            NativeAudioUrl = "/audio/shadowing/n3_proj_04.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 5,
                            SpeakerRole = "B",
                            JapaneseText = "素晴らしいですね。では木曜日の最終レビューに向けて準備を進めてください。",
                            RomajiText = "Subarashii desu ne. Dewa mokuyoubi no saishuu rebyuu ni mukete junbi o susumete kudasai.",
                            VietnameseTranslation = "Tuyệt vời lắm. Vậy hãy tiếp tục hoàn thiện để chuẩn bị cho buổi review nghiệm thu vào thứ Năm nhé.",
                            NativeAudioUrl = "/audio/shadowing/n3_proj_05.mp3"
                        }
                    }
                }
            };
        }
    }
}
