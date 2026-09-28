using System;
using System.Collections.Generic;
using JCAP.Models;

namespace JCAP.Data.Seeds
{
    /// <summary>
    /// DEV SAMPLE / NON-PRODUCTION SEED DATA
    /// Dữ liệu mẫu phục vụ phát triển và kiểm thử tính năng Shadowing (TV4/TV5).
    /// </summary>
    public static class ShadowingSeedData
    {
        public static List<ShadowingDialogue> GetDevSampleDialogues(int scenarioId)
        {
            return new List<ShadowingDialogue>
            {
                new ShadowingDialogue
                {
                    Title = "Hội thoại gọi món Ramen và xin thêm nước",
                    ScenarioId = scenarioId,
                    JLPTLevel = "N5",
                    SourceDescription = "DEV SAMPLE / NON-PRODUCTION — Kịch bản mẫu hội thoại gọi món tại quán Ramen",
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
                            NativeAudioUrl = "/audio/shadowing/ramen_sample_01.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 2,
                            SpeakerRole = "A",
                            JapaneseText = "一人です。カウンター席でお願いします。",
                            RomajiText = "Hitori desu. Kauntaa seki de onegaishimasu.",
                            VietnameseTranslation = "Tôi đi một mình. Cho tôi ngồi ghế quầy bar nhé.",
                            NativeAudioUrl = "/audio/shadowing/ramen_sample_02.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 3,
                            SpeakerRole = "B",
                            JapaneseText = "こちらへどうぞ。ご注文はお決まりですか？",
                            RomajiText = "Kochira e douzo. Go-chuumon wa okimari desu ka?",
                            VietnameseTranslation = "Xin mời đi lối này. Quý khách đã chọn được món chưa ạ?",
                            NativeAudioUrl = "/audio/shadowing/ramen_sample_03.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 4,
                            SpeakerRole = "A",
                            JapaneseText = "豚骨ラーメンを一つください。麺は硬めでお願いします。",
                            RomajiText = "Tonkotsu raamen o hitotsu kudasai. Men wa katame de onegaishimasu.",
                            VietnameseTranslation = "Cho tôi một bát mì Ramen xương heo. Sợi mì làm dai một chút nhé.",
                            NativeAudioUrl = "/audio/shadowing/ramen_sample_04.mp3"
                        },
                        new ShadowingSentence
                        {
                            OrderIndex = 5,
                            SpeakerRole = "B",
                            JapaneseText = "かしこまりました。少々お待ちください。",
                            RomajiText = "Kashikomarimashita. Shou-shou omachi kudasai.",
                            VietnameseTranslation = "Tôi hiểu rồi ạ. Xin quý khách vui lòng đợi một chút.",
                            NativeAudioUrl = "/audio/shadowing/ramen_sample_05.mp3"
                        }
                    }
                }
            };
        }
    }
}
