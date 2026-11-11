-- N5 review batch 1. Run after the full N5-N3 import with sqlcmd -f 65001 -b.
-- OpenJLPT (CC BY-SA 4.0), Tatoeba via OpenJLPT (CC BY 2.0 FR), Nihongo Mono Grammar (MIT).
-- Vietnamese entries reviewed against the Japanese source with AI assistance. See README for attribution.
SET NOCOUNT ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;

CREATE TABLE #Vocab (
    ExternalId nvarchar(200) PRIMARY KEY, OriginalMeaning nvarchar(1000), Meaning nvarchar(1000),
    OriginalPos nvarchar(100), PartOfSpeech nvarchar(100), Explanation nvarchar(max)
);
CREATE TABLE #Grammar (
    ExternalId nvarchar(200) PRIMARY KEY, OriginalMeaning nvarchar(1000), Meaning nvarchar(1000),
    OriginalFormation nvarchar(1000), Formation nvarchar(1000), OriginalExplanation nvarchar(max),
    Explanation nvarchar(max), OriginalNotes nvarchar(max), UsageNotes nvarchar(max)
);
CREATE TABLE #VocabExample (
    ContentId nvarchar(200), ExternalId nvarchar(200), Japanese nvarchar(2000), Vietnamese nvarchar(2000),
    PRIMARY KEY (ContentId, ExternalId)
);
CREATE TABLE #GrammarExample (
    ContentId nvarchar(200), ExternalId nvarchar(200), Japanese nvarchar(2000), Vietnamese nvarchar(2000),
    PRIMARY KEY (ContentId, ExternalId)
);
CREATE TABLE #OriginalExample (
    ContentId nvarchar(200) PRIMARY KEY, Japanese nvarchar(2000), Vietnamese nvarchar(2000)
);

INSERT INTO #Vocab VALUES
    (N'eac7a22620', N'expression of gratitude before meals', N'Xin phép dùng bữa; lời nói trước khi ăn', N'exp', N'Cụm từ', N'Nói いただきます ngay trước khi bắt đầu ăn, thể hiện sự biết ơn đối với bữa ăn. Khi đứng sau một tân ngữ, いただきます còn là dạng khiêm nhường của もらいます, 食べます hoặc 飲みます tùy ngữ cảnh. Ví dụ ở quầy thanh toán có thể dùng với số tiền sẽ thu.'),
    (N'f843b00173', N'alcohol; rice wine', N'Rượu; đồ uống có cồn', N'n', N'Danh từ', N'お酒 có thể chỉ đồ uống có cồn nói chung. Khi cần nói rõ là rượu sake của Nhật, dùng 日本酒（にほんしゅ）.'),
    (N'edca336b1f', N'green tea', N'Trà; thường là trà xanh', N'n', N'Danh từ', N'Trong ngữ cảnh Nhật Bản, お茶 thường chỉ trà xanh, nhưng cũng có thể gọi chung là trà. お茶にする còn dùng khi rủ nhau nghỉ uống trà.'),
    (N'5620a00afc', N'coffee lounge', N'Quán cà phê; quán giải khát', N'n', N'Danh từ', N'喫茶店 thường gợi đến quán kiểu truyền thống, nơi khách ngồi uống cà phê hoặc trà. Một số quán cũng phục vụ bữa nhẹ.'),
    (N'797ae8d562', N'milk', N'Sữa bò', N'n', N'Danh từ', N'牛乳 chỉ sữa bò. Từ ミルク cũng có thể chỉ sữa và thường thấy trong tên đồ uống hoặc công thức món ăn.'),
    (N'6b454b895e', N'fruit', N'Trái cây', N'n', N'Danh từ', N'果物 là tên chung của trái cây. Có thể dùng trong cụm 果物を食べる hoặc gọi tên cụ thể như りんご（táo）.'),
    (N'1288e600be', N'black tea', N'Trà đen; hồng trà', N'n', N'Danh từ', N'紅茶 là trà đen, phân biệt với 緑茶（りょくちゃ）là trà xanh. Trong lời mời có thể đặt cạnh コーヒー để khách chọn.'),
    (N'67126059f1', N'coffee', N'Cà phê', N'n', N'Danh từ', N'Khi gọi một tách cà phê, có thể nói コーヒーを一杯（いっぱい）. もう一杯 nghĩa là thêm một tách nữa.'),
    (N'a2694d259e', N'cooked rice; meal', N'Cơm đã nấu; bữa ăn', N'n', N'Danh từ', N'ご飯 chỉ cơm khi đối lập với bánh mì hoặc thức ăn khác. Trong ご飯を食べる, từ này còn có nghĩa là ăn một bữa. Cách viết ご飯 thường gặp hơn 御飯 trong văn bản thông thường.'),
    (N'dbd7cd319c', N'fish', N'Cá', N'n', N'Danh từ', N'魚 chỉ con cá khi nói về động vật và chỉ món hoặc nguyên liệu cá trong ngữ cảnh ăn uống. 魚を食べる nghĩa là ăn cá.'),
    (N'1c0b0f77b6', N'kitchen', N'Nhà bếp; gian bếp', N'n', N'Danh từ', N'台所 thường chỉ khu vực nấu ăn trong nhà. Với hành động vào bếp, dùng 台所に入る; với hoạt động diễn ra trong bếp, dùng 台所で.'),
    (N'5c89b3094a', N'food', N'Thức ăn; đồ ăn', N'n', N'Danh từ', N'食べ物 là tên chung của những thứ để ăn. ご飯 có thể chỉ một bữa ăn, còn 飲み物 chỉ đồ uống.'),
    (N'3d12036023', N'rice bowl', N'Bát ăn cơm; chén trà tùy ngữ cảnh', N'n', N'Danh từ', N'茶碗（ちゃわん）thường là bát ăn cơm trong sinh hoạt hằng ngày. Trong ngữ cảnh trà đạo, từ này cũng có thể chỉ chén dùng để uống trà.'),
    (N'3669c65744', N'chicken meat', N'Thịt gà', N'n', N'Danh từ', N'鶏肉 chỉ thịt gà dùng làm thực phẩm. 鶏（にわとり）chỉ con gà, còn 肉 là thịt nói chung.'),
    (N'efac1fc502', N'meat', N'Thịt; phần thịt', N'n', N'Danh từ', N'肉 chỉ thịt nói chung. Khi cần nói cụ thể, có thể dùng 牛肉（thịt bò）, 豚肉（thịt lợn）hoặc 鶏肉（thịt gà）.'),
    (N'5e8fc8669c', N'a drink', N'Đồ uống; thức uống', N'n', N'Danh từ', N'飲み物 là tên chung của đồ uống. Khi chưa cần gọi tên một loại cụ thể, có thể nói 何か飲み物（thứ gì đó để uống）.'),
    (N'098e9e7e67', N'bread', N'Bánh mì', N'n', N'Danh từ', N'パン là tên chung cho bánh mì và nhiều loại bánh làm từ bột nhào theo kiểu bánh mì. 食パン（しょくパン）chỉ loại bánh mì ổ thường được cắt lát.'),
    (N'246b5ae84d', N'evening meal', N'Bữa tối; cơm tối', N'n', N'Danh từ', N'晩ご飯 là cách gọi thông dụng trong giao tiếp hằng ngày. 夕食（ゆうしょく）cũng có nghĩa là bữa tối và thường gặp trong văn viết hoặc cách nói trang trọng hơn.'),
    (N'0b492c3209', N'midday meal', N'Bữa trưa; cơm trưa', N'n', N'Danh từ', N'昼ご飯 là cách gọi bữa trưa trong giao tiếp. Trong lời rủ đi ăn, 昼ご飯を食べに行く nghĩa là đi ăn trưa.'),
    (N'936289666e', N'vegetable', N'Rau; rau củ', N'n', N'Danh từ', N'野菜 chỉ rau củ nói chung, bao gồm nhiều loại như rau lá và củ dùng để chế biến thức ăn. Trong cách gọi thông thường, trái cây thuộc nhóm 果物.'),
    (N'31893e4378', N'restaurant', N'Nhà hàng', N'n', N'Danh từ', N'レストラン chỉ nơi phục vụ bữa ăn. Khi nói ăn ở nhà hàng, dùng レストランで食べる; khi nói đi tới nhà hàng, dùng レストランに行く.');


INSERT INTO #Grammar VALUES
    (N'cha-ikenai', N'must not do ~ (casual)', N'Không được làm… (cách nói rút gọn)', N'Verb［て form: ては → ちゃ］＋ いけない
Verb［て form: では → じゃ］＋ いけない', N'Dạng て của động từ: ては → ちゃ, では → じゃ. Sau đó thêm いけない hoặc いけません.', N'A spoken contraction of てはいけない that expresses prohibition — "you must not ~". て + は shrinks to ちゃ, and で + は (from verbs ending in で) shrinks to じゃ. Use it in casual conversation where the full form would feel stiff.', N'Dùng để ngăn hoặc cấm ai đó làm một việc trong hội thoại. ちゃ là dạng rút gọn của ては, còn じゃ là dạng rút gọn của では sau động từ có thể て kết thúc bằng で.', N'This is a casual, spoken contraction. Formal writing uses the full てはいけない, but ちゃいけません stays natural in polite everyday speech (teachers, staff, etc.).
ちゃ comes from て-form verbs (食べて→食べちゃ); じゃ comes from those whose て form is で (遊んで→遊んじゃ).', N'食べてはいけない → 食べちゃいけない; 遊んではいけない → 遊んじゃいけない. Khi viết nội quy, thường dùng dạng đầy đủ てはいけない hoặc てはいけません.'),
    (N'te-wa-ikenai', N'must not ~; may not ~', N'Không được làm…; cấm làm…', N'Verb［て form］＋ は ＋ いけない／いけません', N'Động từ thể て ＋ は ＋ いけない／いけません', N'States that an action is not allowed: attach はいけない to the て form of a verb to prohibit it. It is the standard way to express rules and forbidden things, and it pairs naturally with the permission form てもいい.', N'Nêu một quy định hoặc điều cấm. Đặt はいけない sau động từ thể て; dùng はいけません khi cần nói lịch sự. Đối chiếu với てもいい, mẫu dùng để cho phép.', N'In casual speech ては often contracts to ちゃ (食べてはいけない → 食べちゃいけない).
Do not confuse it with なくてはいけない, which means the opposite — that you MUST do something.', N'Phân biệt てはいけない (không được làm) với なくてはいけない (phải làm). Trong hội thoại, ては và では có thể rút gọn thành ちゃ và じゃ.');


INSERT INTO #VocabExample VALUES
    (N'eac7a22620', N'234953', N'８ドル５０セントいただきます。', N'Tổng cộng là 8 đô la 50 xu ạ.'),
    (N'eac7a22620', N'192061', N'ワインをいただきます。', N'Tôi xin dùng rượu vang.'),
    (N'f843b00173', N'195774', N'マイクはお酒をやめたの？', N'Mike bỏ rượu rồi à?'),
    (N'f843b00173', N'227033', N'お酒を飲んでもいいですか。', N'Tôi uống rượu được không?'),
    (N'edca336b1f', N'235316', N'３時はお茶にしよう。', N'Ba giờ mình nghỉ uống trà nhé.'),
    (N'edca336b1f', N'226878', N'お茶かコーヒーでもいかがですか。', N'Bạn dùng trà hay cà phê ạ?'),
    (N'5620a00afc', N'165940', N'私たちは喫茶店で昼食をとった。', N'Chúng tôi ăn trưa ở quán cà phê.'),
    (N'5620a00afc', N'222392', N'この喫茶店でよくおしゃべりしたわね。', N'Hồi đó chúng mình hay trò chuyện ở quán cà phê này nhỉ.'),
    (N'797ae8d562', N'182280', N'牛乳はバターやチーズになります。', N'Sữa bò được chế biến thành bơ và phô mai.'),
    (N'797ae8d562', N'182266', N'牛乳をチーズとバターにする。', N'Người ta dùng sữa bò để làm phô mai và bơ.'),
    (N'6b454b895e', N'84708', N'父はそんなに果物を食べないんです。', N'Bố tôi không ăn trái cây nhiều đến vậy đâu.'),
    (N'6b454b895e', N'84755', N'父はあんまり果物を食べません。', N'Bố tôi không ăn nhiều trái cây lắm.'),
    (N'1288e600be', N'173507', N'紅茶かコーヒーはいかがですか。', N'Bạn dùng trà đen hay cà phê ạ?'),
    (N'1288e600be', N'218548', N'これはなかなかおいしい紅茶だ。', N'Trà đen này khá ngon đấy.'),
    (N'67126059f1', N'213210', N'そのコーヒーはいいにおいがする。', N'Cà phê đó thơm quá.'),
    (N'67126059f1', N'224880', N'コーヒーをもういっぱいください。', N'Cho tôi thêm một tách cà phê.'),
    (N'a2694d259e', N'217034', N'ご飯とパンどちらがいいですか。', N'Bạn muốn dùng cơm hay bánh mì?'),
    (N'a2694d259e', N'79311', N'友達にご飯をおごってもらった。', N'Tôi được bạn mời một bữa.'),
    (N'dbd7cd319c', N'122254', N'日本人は魚をたくさん食べますか。', N'Người Nhật có ăn nhiều cá không?'),
    (N'dbd7cd319c', N'182097', N'魚は水中でなければ生きられない。', N'Cá chỉ sống được dưới nước.'),
    (N'1c0b0f77b6', N'192405', N'ルーシーは今台所にいるでしょう。', N'Chắc Lucy đang ở trong bếp.'),
    (N'1c0b0f77b6', N'212931', N'そのドアから台所へ出入りできる。', N'Có thể ra vào bếp qua cánh cửa đó.'),
    (N'5c89b3094a', N'145899', N'食べ物はすべてなくなってしまった。', N'Thức ăn đã hết sạch rồi.'),
    (N'5c89b3094a', N'145896', N'食べ物はよくかむほうがよい。', N'Nên nhai kỹ thức ăn.'),
    (N'3d12036023', N'220567', N'この茶わんはなんとすばらしいのでしょう。', N'Cái bát này đẹp quá!'),
    (N'3d12036023', N'202391', N'テーブルの上に茶碗があります。', N'Trên bàn có một cái bát.'),
    (N'3669c65744', N'125767', N'鶏肉を３ポンド分ください。', N'Cho tôi ba pao thịt gà.'),
    (N'3669c65744', N'222186', N'この鶏肉はよく揚げられている。', N'Miếng thịt gà này được chiên kỹ.'),
    (N'efac1fc502', N'122996', N'肉にはウジがわいていた。', N'Miếng thịt đã có giòi.'),
    (N'efac1fc502', N'226787', N'お肉は食べられません。', N'Tôi không ăn được thịt.'),
    (N'5e8fc8669c', N'188051', N'何か飲み物をいただけますか。', N'Cho tôi xin thứ gì đó để uống được không?'),
    (N'5e8fc8669c', N'199117', N'なにかおいしい飲み物をください。', N'Cho tôi một món đồ uống ngon nhé.'),
    (N'246b5ae84d', N'121185', N'晩ご飯ですよ、お父さん。', N'Bố ơi, đến giờ ăn tối rồi.'),
    (N'246b5ae84d', N'227833', N'おいしい晩御飯をありがとうございました。', N'Cảm ơn vì bữa tối ngon miệng.'),
    (N'0b492c3209', N'126420', N'昼ご飯を食べに外に出ませんか。', N'Mình ra ngoài ăn trưa nhé?'),
    (N'0b492c3209', N'172658', N'今は外出しないで。もうすぐ昼ご飯にするとこだから。', N'Đừng ra ngoài bây giờ nhé. Sắp ăn trưa rồi.'),
    (N'936289666e', N'207603', N'その店は野菜を売っている。', N'Cửa hàng đó bán rau củ.'),
    (N'936289666e', N'79599', N'野菜をたくさん食べなさい。', N'Hãy ăn nhiều rau củ.'),
    (N'31893e4378', N'231226', N'あのレストランはサービスがよい。', N'Nhà hàng kia phục vụ tốt.'),
    (N'31893e4378', N'223009', N'このレストランのカレーはうまいよ。', N'Món cà ri ở nhà hàng này ngon đấy.');


INSERT INTO #GrammarExample VALUES
    (N'cha-ikenai', N'cha-ikenai:example:1', N'ここで遊んじゃいけないよ。', N'Không được chơi ở đây đâu nhé.'),
    (N'cha-ikenai', N'cha-ikenai:example:2', N'授業中に寝ちゃいけません。', N'Không được ngủ trong giờ học.'),
    (N'te-wa-ikenai', N'te-wa-ikenai:example:1', N'ここで写真を撮ってはいけません。', N'Không được chụp ảnh ở đây.'),
    (N'te-wa-ikenai', N'te-wa-ikenai:example:2', N'授業中に寝てはいけません。', N'Không được ngủ trong giờ học.');


INSERT INTO #OriginalExample VALUES
    (N'eac7a22620', N'いただきます。', N'Xin phép dùng bữa ạ.'),
    (N'098e9e7e67', N'朝ごはんにパンを食べます。', N'Tôi ăn bánh mì vào bữa sáng.');

DECLARE @OpenJLPT int = (SELECT Id FROM LearningContentSources WHERE Name = N'OpenJLPT' AND Version = N'0d1d3410bec90bd4098a7c72de820543cb4f707c');
DECLARE @Tatoeba int = (SELECT Id FROM LearningContentSources WHERE Name = N'Tatoeba via OpenJLPT' AND Version = N'0d1d3410bec90bd4098a7c72de820543cb4f707c');
DECLARE @NihongoMono int = (SELECT Id FROM LearningContentSources WHERE Name = N'Nihongo Mono Grammar' AND Version = N'ec0ba4a0ce1611c568b0e4f8a223eb8029249a25');

SELECT v.Id, s.ExternalId INTO #MatchedVocab
FROM VocabularySources s JOIN Vocabularies v ON v.Id = s.VocabularyId
JOIN #Vocab patch ON patch.ExternalId = s.ExternalId
WHERE s.SourceId = @OpenJLPT AND v.JLPTLevel = N'N5';

SELECT g.Id, s.ExternalId INTO #MatchedGrammar
FROM GrammarSources s JOIN Grammars g ON g.Id = s.GrammarId
JOIN #Grammar patch ON patch.ExternalId = s.ExternalId
WHERE s.SourceId = @NihongoMono AND g.JLPTLevel = N'N5';

IF @Tatoeba IS NULL OR EXISTS (
    SELECT ExternalId FROM #Vocab
    EXCEPT SELECT ExternalId FROM #MatchedVocab GROUP BY ExternalId HAVING COUNT(*) = 1
) OR EXISTS (
    SELECT ExternalId FROM #Grammar
    EXCEPT SELECT ExternalId FROM #MatchedGrammar GROUP BY ExternalId HAVING COUNT(*) = 1
)
    THROW 51000, 'The reviewed N5 records are missing or ambiguous. Check the full import first.', 1;

UPDATE v SET v.Meaning = p.Meaning, v.PartOfSpeech = p.PartOfSpeech,
    v.Explanation = p.Explanation, v.UpdatedAt = SYSUTCDATETIME()
FROM Vocabularies v JOIN #MatchedVocab m ON m.Id = v.Id JOIN #Vocab p ON p.ExternalId = m.ExternalId
WHERE v.Meaning COLLATE Latin1_General_100_BIN2 = p.OriginalMeaning
  AND v.PartOfSpeech COLLATE Latin1_General_100_BIN2 = p.OriginalPos
  AND NULLIF(LTRIM(RTRIM(v.Explanation)), N'') IS NULL;
DECLARE @VocabularyUpdated int = @@ROWCOUNT;

UPDATE g SET g.Meaning = p.Meaning, g.Formation = p.Formation, g.Explanation = p.Explanation,
    g.UsageNotes = p.UsageNotes, g.UpdatedAt = SYSUTCDATETIME()
FROM Grammars g JOIN #MatchedGrammar m ON m.Id = g.Id JOIN #Grammar p ON p.ExternalId = m.ExternalId
WHERE g.Meaning COLLATE Latin1_General_100_BIN2 = p.OriginalMeaning
  AND REPLACE(g.Formation, NCHAR(13), N'') COLLATE Latin1_General_100_BIN2 = REPLACE(p.OriginalFormation, NCHAR(13), N'')
  AND REPLACE(g.Explanation, NCHAR(13), N'') COLLATE Latin1_General_100_BIN2 = REPLACE(p.OriginalExplanation, NCHAR(13), N'')
  AND REPLACE(g.UsageNotes, NCHAR(13), N'') COLLATE Latin1_General_100_BIN2 = REPLACE(p.OriginalNotes, NCHAR(13), N'');
DECLARE @GrammarUpdated int = @@ROWCOUNT;

UPDATE e SET e.VietnameseTranslation = p.Vietnamese
FROM VocabularyExamples e JOIN #MatchedVocab m ON m.Id = e.VocabularyId
JOIN #VocabExample p ON p.ContentId = m.ExternalId AND p.ExternalId = e.ExternalId
WHERE e.SourceId = @Tatoeba AND e.JapaneseText COLLATE Latin1_General_100_BIN2 = p.Japanese
  AND NULLIF(LTRIM(RTRIM(e.VietnameseTranslation)), N'') IS NULL;
DECLARE @VocabularyExamplesTranslated int = @@ROWCOUNT;

UPDATE e SET e.VietnameseTranslation = p.Vietnamese
FROM GrammarExamples e JOIN #MatchedGrammar m ON m.Id = e.GrammarId
JOIN #GrammarExample p ON p.ContentId = m.ExternalId AND p.ExternalId = e.ExternalId
WHERE e.SourceId = @NihongoMono AND e.JapaneseText COLLATE Latin1_General_100_BIN2 = p.Japanese
  AND NULLIF(LTRIM(RTRIM(e.VietnameseTranslation)), N'') IS NULL;
DECLARE @GrammarExamplesTranslated int = @@ROWCOUNT;

-- Original JCAP examples. No upstream SourceId or ExternalId is assigned.
INSERT INTO VocabularyExamples (VocabularyId, JapaneseText, VietnameseTranslation, OrderIndex)
SELECT m.Id, p.Japanese, p.Vietnamese, COALESCE((
    SELECT MAX(e.OrderIndex) FROM VocabularyExamples e WHERE e.VocabularyId = m.Id
), -1) + 1
FROM #MatchedVocab m JOIN #OriginalExample p ON p.ContentId = m.ExternalId
WHERE NOT EXISTS (
    SELECT 1 FROM VocabularyExamples e WITH (UPDLOCK, HOLDLOCK)
    WHERE e.VocabularyId = m.Id AND e.JapaneseText COLLATE Latin1_General_100_BIN2 = p.Japanese
);
DECLARE @VocabularyExamplesAdded int = @@ROWCOUNT;

COMMIT;
SELECT @VocabularyUpdated AS VocabularyUpdated, @GrammarUpdated AS GrammarUpdated,
    @VocabularyExamplesTranslated AS VocabularyExamplesTranslated,
    @GrammarExamplesTranslated AS GrammarExamplesTranslated,
    @VocabularyExamplesAdded AS VocabularyExamplesAdded;
