using System;
using System.Text.RegularExpressions;
using JCAP.Services.Interfaces;

namespace JCAP.Services.Implementations
{
    public class EpisodicFactExtractor : IEpisodicFactExtractor
    {
        private static readonly (Regex Pattern, string Fact)[] FactRules = new (Regex, string)[]
        {
            // 1. Quê quán / Nơi chốn
            (new Regex(@"(ダナン|da\s*nang).*(来|出身|住)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "origin: Da Nang"),
            (new Regex(@"(ハノイ|ha\s*noi).*(来|出身|住)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "origin: Hanoi"),
            (new Regex(@"(ホーチミン|ho\s*chi\s*minh|サイゴン).*(来|出身|住)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "origin: Ho Chi Minh City"),
            (new Regex(@"(ベトナム|vietnam).*(来|出身|国)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "origin: Vietnam"),
            (new Regex(@"(東京|tokyo).*(住|勤|い)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "location: Tokyo"),

            // 2. Sở thích ẩm thực & ăn uống
            (new Regex(@"(豚骨|とんこつ|トンコツ).*(好|好物|大好|食)", RegexOptions.Compiled), "likes: tonkotsu_ramen"),
            (new Regex(@"(醤油|しょうゆ).*(好|好物|大好)", RegexOptions.Compiled), "likes: shoyu_ramen"),
            (new Regex(@"(味噌|みそ).*(好|好物|大好)", RegexOptions.Compiled), "likes: miso_ramen"),
            (new Regex(@"(寿司|すし|スシ).*(好|大好)", RegexOptions.Compiled), "likes: sushi"),
            (new Regex(@"(ビール|酒|日本酒).*(好|飲)", RegexOptions.Compiled), "likes: japanese_sake"),
            (new Regex(@"(甘い|スイーツ|デザート).*(好|大好)", RegexOptions.Compiled), "likes: sweets"),
            (new Regex(@"(辛い|からい).*(好|大好)", RegexOptions.Compiled), "likes: spicy_food"),
            (new Regex(@"(辛い|からい).*(苦手|嫌|ダメ|無理|食.*ない)", RegexOptions.Compiled), "dislikes: spicy_food"),

            // 3. Nghề nghiệp / Học vấn
            (new Regex(@"(IT|エンジニア|プログラマ|開発).*(仕事|働|職)", RegexOptions.IgnoreCase | RegexOptions.Compiled), "career: IT engineer"),
            (new Regex(@"(学生|大学生|留学生).*(です|勉強)", RegexOptions.Compiled), "status: student"),
            (new Regex(@"(日本語).*(勉強|学|専攻)", RegexOptions.Compiled), "goal: learning_japanese"),

            // 4. Trải nghiệm du lịch
            (new Regex(@"(初|はじめて).*(日本|旅行|来)", RegexOptions.Compiled), "travel: first_time_in_japan"),
            (new Regex(@"(何回|2回|二回|前).*(来|行)", RegexOptions.Compiled), "travel: visited_japan_before"),
        };

        public string? ExtractFact(string japaneseText)
        {
            if (string.IsNullOrWhiteSpace(japaneseText))
                return null;

            var trimmed = japaneseText.Trim();
            foreach (var (pattern, fact) in FactRules)
            {
                if (pattern.IsMatch(trimmed))
                {
                    return fact;
                }
            }

            return null;
        }
    }
}

