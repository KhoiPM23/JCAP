import type {
  ShadowingTextbookItem,
  ShadowingChapterItem,
  ShadowingDialogueDetail,
  ShadowingSentenceItem,
  ShadowingVocabularyItem,
  ShadowingGrammarItem,
} from '../types/shadowing';

// ============================================================
// 1. MOCK TEXTBOOKS CATALOG (N3, N4, N5)
// ============================================================
export const MOCK_TEXTBOOKS: ShadowingTextbookItem[] = [
  // --- N4 ---
  {
    id: 'minna-no-nihongo-2',
    title: 'Minna no Nihongo II',
    japaneseTitle: 'みんなの日本語 初級 II',
    level: 'N4',
    coverImage: 'https://images.unsplash.com/photo-1544716278-ca5e3f4abd8c?auto=format&fit=crop&w=600&q=80',
    description: 'Giáo trình tiếng Nhật kinh điển dành cho trình độ Sơ Trung cấp N4, tập trung vào giao tiếp học đường, đời sống và ngữ pháp cốt lõi.',
    publisher: '3A Corporation',
    totalChapters: 25,
    totalDialogues: 50,
  },
  {
    id: 'try-n4',
    title: 'TRY! N4 - Tăng Cường Ngữ Pháp & Giao Tiếp',
    japaneseTitle: 'TRY! 日本語能力試験 N4 文法から伸ばす日本語',
    level: 'N4',
    coverImage: 'https://images.unsplash.com/photo-1532012164546-f432f2e3777d?auto=format&fit=crop&w=600&q=80',
    description: 'Tài liệu chuẩn bị cho kỳ thi JLPT N4 gắn liền với hội thoại đời thường và kỹ năng ứng biến trong các tình huống thực tế.',
    publisher: 'Ask Publishing',
    totalChapters: 12,
    totalDialogues: 24,
  },

  // --- N5 ---
  {
    id: 'minna-no-nihongo-1',
    title: 'Minna no Nihongo I',
    japaneseTitle: 'みんなの日本語 初級 I',
    level: 'N5',
    coverImage: 'https://images.unsplash.com/photo-1512820790803-83ca734da794?auto=format&fit=crop&w=600&q=80',
    description: 'Giáo trình mở đầu chuẩn mực cho người mới bắt đầu học tiếng Nhật, bao gồm các chủ đề chào hỏi, làm quen và chỉ đường cơ bản.',
    publisher: '3A Corporation',
    totalChapters: 25,
    totalDialogues: 45,
  },
  {
    id: 'fun-easy-n5',
    title: 'Nihongo Fun & Easy - Giao Tiếp Cơ Bản N5',
    japaneseTitle: 'にほんご Fun & Easy 初級会話',
    level: 'N5',
    coverImage: 'https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=600&q=80',
    description: 'Tổng hợp mẫu câu đối thoại ngắn gọn, sinh động phù hợp cho giao tiếp nhà hàng, mua sắm và sinh hoạt thường nhật tại Nhật.',
    publisher: 'The Japan Times',
    totalChapters: 10,
    totalDialogues: 20,
  },

  // --- N3 ---
  {
    id: 'try-n3',
    title: 'TRY! N3 - Ngữ Pháp & Hội Thoại Công Sở',
    japaneseTitle: 'TRY! 日本語能力試験 N3 文法から伸ばす日本語',
    level: 'N3',
    coverImage: 'https://images.unsplash.com/photo-1457369804613-52c61a468e7d?auto=format&fit=crop&w=600&q=80',
    description: 'Rèn luyện phản xạ ngữ pháp trung cấp N3 áp dụng vào môi trường doanh nghiệp Nhật, trao đổi tiến độ dự án IT và thư từ công việc.',
    publisher: 'Ask Publishing',
    totalChapters: 14,
    totalDialogues: 28,
  },
  {
    id: 'shadowing-business-n3',
    title: 'Shadowing - Tiếng Nhật Thương Mại Trung Cấp',
    japaneseTitle: 'シャドーイング 日本語を話そう! 就職・ビジネス編',
    level: 'N3',
    coverImage: 'https://images.unsplash.com/photo-1507842229458-5770a6c0d510?auto=format&fit=crop&w=600&q=80',
    description: 'Phương pháp Shadowing chuyên sâu cải thiện ngữ điệu Tokyo, cách dùng kính ngữ tôn kính và khiêm nhường trong các cuộc họp chuyên nghiệp.',
    publisher: 'Kuroshio Publishers',
    totalChapters: 8,
    totalDialogues: 18,
  },
];

// ============================================================
// 2. MOCK CHAPTERS
// ============================================================
export const MOCK_CHAPTERS: Record<string, ShadowingChapterItem[]> = {
  // Chapters of 'minna-no-nihongo-2' (N4)
  'minna-no-nihongo-2': [
    {
      id: 'minna-2-chap-13',
      textbookId: 'minna-no-nihongo-2',
      chapterNumber: 13,
      title: 'Bài 13: 買い物の会話 (Mua sắm & Nhờ vả)',
      japaneseTitle: '第13課：買い物の会話',
      description: 'Luyện tập giao tiếp mua sắm tại cửa hàng tiện lợi, siêu thị và hỏi tìm các mặt hàng cần thiết.',
      dialoguesCount: 2,
    },
    {
      id: 'minna-2-chap-14',
      textbookId: 'minna-no-nihongo-2',
      chapterNumber: 14,
      title: 'Bài 14: 学校案内 (Hướng dẫn trường học & Sinh hoạt ngoại khóa)',
      japaneseTitle: '第14課：学校案内',
      description: 'Bạn là tân học sinh. Lắng nghe và đối thoại cùng anh chị khóa trên về ngày hội câu lạc bộ sinh viên.',
      dialoguesCount: 3,
    },
    {
      id: 'minna-2-chap-15',
      textbookId: 'minna-no-nihongo-2',
      chapterNumber: 15,
      title: 'Bài 15: 許可を求める (Xin phép & Quy định)',
      japaneseTitle: '第15課：許可を求める',
      description: 'Thực hành các mẫu câu xin phép làm gì đó (~てもいいですか) và ghi nhớ quy định ký túc xá.',
      dialoguesCount: 2,
    },
  ],

  // Chapters of 'try-n4' (N4)
  'try-n4': [
    {
      id: 'try-n4-chap-1',
      textbookId: 'try-n4',
      chapterNumber: 1,
      title: 'Bài 1: 週末の予定 (Hẹn bạn bè cuối tuần)',
      japaneseTitle: '第1課：週末の予定',
      description: 'Hẹn gặp bạn bè đi xem phim, lên lịch trình dã ngoại và cách điều chỉnh giờ hẹn lịch sự.',
      dialoguesCount: 2,
    },
    {
      id: 'try-n4-chap-2',
      textbookId: 'try-n4',
      chapterNumber: 2,
      title: 'Bài 2: アルバイトの面接 (Phỏng vấn xin việc làm thêm)',
      japaneseTitle: '第2課：アルバイトの面接',
      description: 'Trả lời câu hỏi phỏng vấn xin việc làm thêm tại quán cà phê và cửa hàng tiện lợi.',
      dialoguesCount: 1,
    },
  ],

  // Chapters of 'minna-no-nihongo-1' (N5)
  'minna-no-nihongo-1': [
    {
      id: 'minna-1-chap-1',
      textbookId: 'minna-no-nihongo-1',
      chapterNumber: 1,
      title: 'Bài 1: 自己紹介 (Làm quen & Giới thiệu bản thân)',
      japaneseTitle: '第1課：初めまして',
      description: 'Làm quen, giới thiệu họ tên, quốc tịch, trường học và nghề nghiệp trong ngày đầu nhập học.',
      dialoguesCount: 2,
    },
    {
      id: 'minna-1-chap-3',
      textbookId: 'minna-no-nihongo-1',
      chapterNumber: 3,
      title: 'Bài 3: ここはどこですか (Hỏi địa điểm & Vị trí)',
      japaneseTitle: '第3課：ここはどこですか',
      description: 'Hỏi thăm vị trí các phòng ban trong trường, ga tàu điện và cửa hàng.',
      dialoguesCount: 1,
    },
  ],

  // Chapters of 'fun-easy-n5' (N5)
  'fun-easy-n5': [
    {
      id: 'fun-easy-chap-1',
      textbookId: 'fun-easy-n5',
      chapterNumber: 1,
      title: 'Bài 1: レストランで注文 (Gọi món tại quán ăn)',
      japaneseTitle: '第1課：レストランで注文',
      description: 'Gọi món ramen, chọn chỗ ngồi quầy bar và yêu cầu nước lọc tại quán ăn Nhật.',
      dialoguesCount: 1,
    },
  ],

  // Chapters of 'try-n3' (N3)
  'try-n3': [
    {
      id: 'try-n3-chap-1',
      textbookId: 'try-n3',
      chapterNumber: 1,
      title: 'Bài 1: IT企業の進捗報告 (Báo cáo tiến độ dự án IT)',
      japaneseTitle: '第1課：進捗報告',
      description: 'Báo cáo công việc hàng ngày trong Daily Scrum, thảo luận lịch phát hành phần mềm với cấp trên.',
      dialoguesCount: 2,
    },
    {
      id: 'try-n3-chap-2',
      textbookId: 'try-n3',
      chapterNumber: 2,
      title: 'Bài 2: ビジネス電話 (Giao tiếp điện thoại đối tác)',
      japaneseTitle: '第2課：ビジネス電話',
      description: 'Cách tiếp nhận cuộc gọi, ghi nhớ tin nhắn và hẹn giờ gọi lại chuyên nghiệp.',
      dialoguesCount: 1,
    },
  ],

  // Chapters of 'shadowing-business-n3' (N3)
  'shadowing-business-n3': [
    {
      id: 'shadowing-biz-chap-1',
      textbookId: 'shadowing-business-n3',
      chapterNumber: 1,
      title: 'Bài 1: 会議での意見発表 (Trình bày ý kiến trong cuộc họp)',
      japaneseTitle: '第1課：会議での意見発表',
      description: 'Đề xuất ý tưởng tính năng mới và nêu quan điểm mang tính xây dựng trong cuộc họp nhóm.',
      dialoguesCount: 1,
    },
  ],
};

// ============================================================
// 3. MOCK DIALOGUES & SENTENCES
// ============================================================

// Chapter 14 Dialogue 01: REFERENCE SCENARIO (MATCHES IMAGE 2 EXACTLY!)
const DIALOGUE_1401: ShadowingDialogueDetail = {
  id: 1401,
  scenarioId: 14,
  textbookId: 'minna-no-nihongo-2',
  textbookTitle: 'みんなの日本語 II',
  chapterId: 'minna-2-chap-14',
  chapterTitle: 'Bài 14: 学校案内',
  title: 'Hội thoại 01: クラブ紹介の案内',
  jlptLevel: 'N4',
  sourceDescription: 'みんなの日本語 初級 II · Bài 14: 学校案内',
  scenarioTitle: 'みんなの日本語 II',
  scenarioDescription: 'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.',
  scenarioLevelDescription: 'Bạn là tân học sinh. Chị khóa trên Ran phụ trách Club Day gọi điện báo về Ngày giới thiệu câu lạc bộ. Hãy hỏi lịch trình, địa điểm nhận đơn, và cách đăng ký câu lạc bộ âm nhạc.',
  speakerRoleA_Name: 'Yuuri (Tân học sinh)',
  speakerRoleB_Name: 'Ran (Tiền bối)',
  totalSentences: 6,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 14011,
      orderIndex: 1,
      speakerRole: 'A',
      japaneseText: '大丈夫です。大丈夫ですね。',
      romajiText: 'Daijoubu desu. Daijoubu desu ne.',
      vietnameseTranslation: 'Dạ được chứ ạ. Không có vấn đề gì.',
      nativeAudioUrl: '',
    },
    {
      id: 14012,
      orderIndex: 2,
      speakerRole: 'B',
      japaneseText: 'よかった。では、クラブ紹介の日と時間を伝えてもいい？',
      romajiText: 'Yokatta. Dewa, kurabu shoukai no hi to jikan wo tsutaete mo ii?',
      vietnameseTranslation: 'Tốt quá. Vậy chị thông báo ngày và giờ giới thiệu câu lạc bộ được không?',
      nativeAudioUrl: '',
    },
    {
      id: 14013,
      orderIndex: 3,
      speakerRole: 'A',
      japaneseText: 'いいです、いつでもどうぞ。おねがいします。',
      romajiText: 'Ii desu, itsu demo douzo. Onegaishimasu.',
      vietnameseTranslation: 'Dạ được ạ, bất cứ lúc nào cũng được. Nhờ chị nhé.',
      nativeAudioUrl: '',
    },
    {
      id: 14014,
      orderIndex: 4,
      speakerRole: 'B',
      japaneseText: '来週の水曜日の午後3時から、体育館で行っています。',
      romajiText: 'Raishuu no suiyoubi no gogo sanji kara, taiikukan de okonatte imasu.',
      vietnameseTranslation: 'Vào thứ Tư tuần sau từ 3 giờ chiều, sự kiện sẽ diễn ra tại nhà thi đấu thể thao.',
      nativeAudioUrl: '',
    },
    {
      id: 14015,
      orderIndex: 5,
      speakerRole: 'A',
      japaneseText: '体育館ですね。場所は分かります。ありがとうございます。',
      romajiText: 'Taiikukan desu ne. Basho wa wakarimasu. Arigatou gozaimasu.',
      vietnameseTranslation: 'Tại nhà thi đấu đúng không ạ. Em biết chỗ đó rồi. Em cảm ơn chị nhiều.',
      nativeAudioUrl: '',
    },
    {
      id: 14016,
      orderIndex: 6,
      speakerRole: 'B',
      japaneseText: '楽しみに待っているね。また来週！',
      romajiText: 'Tanoshimi ni matte iru ne. Mata raishuu!',
      vietnameseTranslation: 'Chị rất mong gặp em. Hẹn gặp lại em vào tuần sau nhé!',
      nativeAudioUrl: '',
    },
  ],
  targetVocabularies: [
    {
      id: 1,
      word: 'クラブ紹介',
      reading: 'クラブしょうかい',
      meaning: 'Buổi giới thiệu các câu lạc bộ (sinh hoạt ngoại khóa, thể thao, văn hóa sinh viên)',
      wordClass: 'Danh từ (N)',
      jlptLevel: 'N4',
      exampleSentence: 'クラブ紹介の日と時間を教えてください。',
    },
    {
      id: 2,
      word: '伝える',
      reading: 'つたえる',
      meaning: 'Truyền đạt, nhắn lại, thông báo cho ai đó',
      wordClass: 'Động từ nhóm 2 (他動詞)',
      jlptLevel: 'N4',
      exampleSentence: '先生にクラブの用件を伝えておきます。',
    },
    {
      id: 3,
      word: 'いつでもどうぞ',
      reading: 'いつでもどうぞ',
      meaning: 'Bất cứ lúc nào cũng được ạ, xin mời / xin vui lòng',
      wordClass: 'Cụm từ giao tiếp',
      jlptLevel: 'N4',
      exampleSentence: '質問があればいつでもどうぞ。',
    },
    {
      id: 4,
      word: '体育館',
      reading: 'たいいくかん',
      meaning: 'Nhà thi đấu thể dục thể thao',
      wordClass: 'Danh từ (N)',
      jlptLevel: 'N4',
      exampleSentence: '来週、体育館でクラブ紹介を行います。',
    },
  ],
  targetGrammars: [
    {
      id: 1,
      pattern: '～てもいい？',
      meaning: 'Làm ... có được không? Dùng để xin phép đối phương làm một hành động nào đó trong ngữ cảnh thân mật.',
      jlptLevel: 'N4',
      exampleSentence: 'クラブ紹介の日と時間を伝えてもいい？',
    },
    {
      id: 2,
      pattern: '～ています',
      meaning: 'Đang thực hiện hành động hoặc biểu thị trạng thái kết quả của hành động kéo dài.',
      jlptLevel: 'N4',
      exampleSentence: '体育館で行っています。',
    },
    {
      id: 3,
      pattern: '～てよろしいですか',
      meaning: 'Dạng kính ngữ lịch sự trang trọng của ～てもいいですか, dùng khi xin phép cấp trên hoặc người lớn tuổi.',
      jlptLevel: 'N4',
      exampleSentence: '日程を確認させていただいてよろしいですか。',
    },
  ],
};

const DIALOGUE_1402: ShadowingDialogueDetail = {
  id: 1402,
  scenarioId: 14,
  textbookId: 'minna-no-nihongo-2',
  textbookTitle: 'みんなの日本語 II',
  chapterId: 'minna-2-chap-14',
  chapterTitle: 'Bài 14: 学校案内',
  title: 'Hội thoại 02: 学校案内 (Tham quan khuôn viên)',
  jlptLevel: 'N4',
  sourceDescription: 'みんなの日本語 初級 II · Bài 14: 学校案内',
  scenarioTitle: 'みんなの日本語 II',
  scenarioDescription: 'Ran hướng dẫn Yuuri tham quan các tòa nhà chính trong trường đại học.',
  speakerRoleA_Name: 'Yuuri (Tân học sinh)',
  speakerRoleB_Name: 'Ran (Tiền bối)',
  totalSentences: 4,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 14021,
      orderIndex: 1,
      speakerRole: 'B',
      japaneseText: 'ここが留学生センターですよ。何か困ったことがあればここに来てください。',
      romajiText: 'Koko ga ryuugakusei sentaa desu yo. Nanika komatta koto ga areba koko ni kite kudasai.',
      vietnameseTranslation: 'Đây là trung tâm sinh viên quốc tế. Nếu có khó khăn gì em hãy đến đây nhé.',
      nativeAudioUrl: '',
    },
    {
      id: 14022,
      orderIndex: 2,
      speakerRole: 'A',
      japaneseText: '分かりました。先生方はいつもこちらにいらっしゃいますか？',
      romajiText: 'Wakarimashita. Sensei-gata wa itsumo kochira ni irasshaimasu ka?',
      vietnameseTranslation: 'Em hiểu rồi ạ. Các thầy cô lúc nào cũng có mặt ở đây ạ?',
      nativeAudioUrl: '',
    },
    {
      id: 14023,
      orderIndex: 3,
      speakerRole: 'B',
      japaneseText: 'はい、平日の午前9時から午後5時まで開いています。',
      romajiText: 'Hai, heijitsu no gozen kuji kara gogo goji made aite imasu.',
      vietnameseTranslation: 'Đúng rồi, mở cửa từ 9 giờ sáng đến 5 giờ chiều các ngày trong tuần.',
      nativeAudioUrl: '',
    },
    {
      id: 14024,
      orderIndex: 4,
      speakerRole: 'A',
      japaneseText: 'とても安心しました。ありがとうございます！',
      romajiText: 'Totemo anshin shimashita. Arigatou gozaimasu!',
      vietnameseTranslation: 'Em thấy yên tâm hơn rất nhiều rồi ạ. Cảm ơn chị!',
      nativeAudioUrl: '',
    },
  ],
  targetVocabularies: [
    {
      id: 11,
      word: '留学生センター',
      reading: 'りゅうがくせいセンター',
      meaning: 'Trung tâm hỗ trợ sinh viên quốc tế',
      jlptLevel: 'N4',
    },
  ],
  targetGrammars: [
    {
      id: 11,
      pattern: '～て開いています',
      meaning: 'Đang mở cửa (trạng thái tự động từ)',
      jlptLevel: 'N4',
    },
  ],
};

const DIALOGUE_1403: ShadowingDialogueDetail = {
  id: 1403,
  scenarioId: 14,
  textbookId: 'minna-no-nihongo-2',
  textbookTitle: 'みんなの日本語 II',
  chapterId: 'minna-2-chap-14',
  chapterTitle: 'Bài 14: 学校案内',
  title: 'Hội thoại 03: 図書館の利用方法 (Cách sử dụng thư viện)',
  jlptLevel: 'N4',
  sourceDescription: 'みんなの日本語 初級 II · Bài 14: 学校案内',
  scenarioTitle: 'みんなの日本語 II',
  scenarioDescription: 'Học viên trao đổi với thủ thư về cách đăng ký làm thẻ mượn sách thư viện trường.',
  speakerRoleA_Name: 'Học viên',
  speakerRoleB_Name: 'Thủ thư thư viện',
  totalSentences: 4,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 14031,
      orderIndex: 1,
      speakerRole: 'A',
      japaneseText: 'すみません、図書カードを作りたいんですが、どうすればいいですか？',
      romajiText: 'Sumimasen, tosho kaado wo tsukuritai n desu ga, dou sureba ii desu ka?',
      vietnameseTranslation: 'Xin lỗi, em muốn làm thẻ thư viện thì phải làm thế nào ạ?',
      nativeAudioUrl: '',
    },
    {
      id: 14032,
      orderIndex: 2,
      speakerRole: 'B',
      japaneseText: '学生証はお持ちですか？こちらの申込書にご記入ください。',
      romajiText: 'Gakuseishou wa omochi desu ka? Kochira no moushikomisho ni gokinyuu kudasai.',
      vietnameseTranslation: 'Em có mang theo thẻ học sinh không? Hãy điền vào phiếu đăng ký này nhé.',
      nativeAudioUrl: '',
    },
    {
      id: 14033,
      orderIndex: 3,
      speakerRole: 'A',
      japaneseText: 'はい、学生証はこちらです。本は何冊まで借りられますか？',
      romajiText: 'Hai, gakuseishou wa kochira desu. Hon wa nansatsu made kariraremasu ka?',
      vietnameseTranslation: 'Dạ, thẻ học sinh đây ạ. Em có thể mượn tối đa mấy quyển sách ạ?',
      nativeAudioUrl: '',
    },
    {
      id: 14034,
      orderIndex: 4,
      speakerRole: 'B',
      japaneseText: '一度に5冊まで、2週間借りられますよ。',
      romajiText: 'Ichido ni gosatsu made, nishuukan kariraremasu yo.',
      vietnameseTranslation: 'Một lần được mượn tối đa 5 quyển trong 2 tuần nhé.',
      nativeAudioUrl: '',
    },
  ],
};

const DIALOGUE_1301: ShadowingDialogueDetail = {
  id: 1301,
  scenarioId: 13,
  textbookId: 'minna-no-nihongo-2',
  textbookTitle: 'みんなの日本語 II',
  chapterId: 'minna-2-chap-13',
  chapterTitle: 'Bài 13: 買い物の会話',
  title: 'Hội thoại 01: デパートで買い物 (Mua sắm ở bách hóa)',
  jlptLevel: 'N4',
  sourceDescription: 'みんなの日本語 初級 II · Bài 13: 買い物の会話',
  scenarioTitle: 'みんなの日本語 II',
  scenarioDescription: 'Hỏi nhân viên bán hàng về vị trí áo sơ mi và phòng thử đồ.',
  speakerRoleA_Name: 'Khách hàng',
  speakerRoleB_Name: 'Nhân viên bán hàng',
  totalSentences: 4,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 13011,
      orderIndex: 1,
      speakerRole: 'A',
      japaneseText: 'すみません、白いシャツを探しているんですが、どこにありますか？',
      romajiText: 'Sumimasen, shiroi shatsu wo sagashite iru n desu ga, doko ni arimasu ka?',
      vietnameseTranslation: 'Xin lỗi, tôi đang tìm áo sơ mi trắng, áo ở quầy nào vậy ạ?',
      nativeAudioUrl: '',
    },
    {
      id: 13012,
      orderIndex: 2,
      speakerRole: 'B',
      japaneseText: 'シャツコーナーは2階の右奥にございます。ご案内いたします。',
      romajiText: 'Shatsu koonaa wa nikai no migi oku ni gozaimasu. Goannai itashimasu.',
      vietnameseTranslation: 'Khu vực áo sơ mi ở phía trong bên phải tầng 2 ạ. Tôi xin phép dẫn quý khách đi.',
      nativeAudioUrl: '',
    },
    {
      id: 13013,
      orderIndex: 3,
      speakerRole: 'A',
      japaneseText: '試着してもいいですか？サイズを確認したいです。',
      romajiText: 'Shichaku shite mo ii desu ka? Saizu wo kakunin shitai desu.',
      vietnameseTranslation: 'Tôi có thể mặc thử được không? Tôi muốn kiểm tra cỡ áo.',
      nativeAudioUrl: '',
    },
    {
      id: 13014,
      orderIndex: 4,
      speakerRole: 'B',
      japaneseText: 'もちろんでございます。試着室はこちらでございます。',
      romajiText: 'Mochiron de gozaimasu. Shichakushitsu wa kochira de gozaimasu.',
      vietnameseTranslation: 'Dạ đương nhiên rồi ạ. Phòng thử đồ ở phía này ạ.',
      nativeAudioUrl: '',
    },
  ],
};

// N5 Example Dialogue
const DIALOGUE_1501: ShadowingDialogueDetail = {
  id: 1501,
  scenarioId: 1,
  textbookId: 'minna-no-nihongo-1',
  textbookTitle: 'みんなの日本語 I',
  chapterId: 'minna-1-chap-1',
  chapterTitle: 'Bài 1: 自己紹介',
  title: 'Hội thoại 01: 初めまして (Làm quen bạn mới)',
  jlptLevel: 'N5',
  sourceDescription: 'みんなの日本語 初級 I · Bài 1',
  scenarioTitle: 'みんなの日本語 I',
  scenarioDescription: 'Chào hỏi và làm quen với bạn học mới trong ngày khai giảng.',
  speakerRoleA_Name: 'Nam',
  speakerRoleB_Name: 'Tanaka',
  totalSentences: 4,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 15011,
      orderIndex: 1,
      speakerRole: 'A',
      japaneseText: '初めまして。ナムと申します。ベトナムから来ました。',
      romajiText: 'Hajimemashite. Namu to moushimasu. Betonamu kara kimashita.',
      vietnameseTranslation: 'Rất vui được gặp bạn. Tôi tên là Nam, đến từ Việt Nam.',
      nativeAudioUrl: '',
    },
    {
      id: 15012,
      orderIndex: 2,
      speakerRole: 'B',
      japaneseText: '初めまして、田中です。どうぞよろしくお願いします。',
      romajiText: 'Hajimemashite, Tanaka desu. Douzo yoroshiku onegaishimasu.',
      vietnameseTranslation: 'Chào bạn, tôi là Tanaka. Rất mong được giúp đỡ.',
      nativeAudioUrl: '',
    },
    {
      id: 15013,
      orderIndex: 3,
      speakerRole: 'A',
      japaneseText: 'こちらこそ、よろしくお願いします。専門は何ですか？',
      romajiText: 'Kochira koso, yoroshiku onegaishimasu. Senmon wa nan desu ka?',
      vietnameseTranslation: 'Tôi cũng vậy ạ. Chuyên ngành của bạn là gì vậy?',
      nativeAudioUrl: '',
    },
    {
      id: 15014,
      orderIndex: 4,
      speakerRole: 'B',
      japaneseText: 'IT情報工学です。ナムさんも同じクラスですね！',
      romajiText: 'Aitii jouhou kougaku desu. Namu-san mo onaji kurasu desu ne!',
      vietnameseTranslation: 'Chuyên ngành công nghệ thông tin IT. Bạn Nam cũng cùng lớp với tôi nhỉ!',
      nativeAudioUrl: '',
    },
  ],
};

// N3 Example Dialogue
const DIALOGUE_3101: ShadowingDialogueDetail = {
  id: 3101,
  scenarioId: 31,
  textbookId: 'try-n3',
  textbookTitle: 'TRY! N3',
  chapterId: 'try-n3-chap-1',
  chapterTitle: 'Bài 1: IT企業の進捗報告',
  title: 'Hội thoại 01: リリース日程の確認 (Xác nhận lịch bàn giao)',
  jlptLevel: 'N3',
  sourceDescription: 'TRY! N3 · Bài 1: IT企業の進捗報告',
  scenarioTitle: 'TRY! N3',
  scenarioDescription: 'Họp ngắn trao đổi cùng Project Manager về lịch kiểm thử và ngày release hệ thống.',
  speakerRoleA_Name: 'Kỹ sư phần mềm (SE)',
  speakerRoleB_Name: 'Quản lý dự án (PM)',
  totalSentences: 4,
  isActive: true,
  createdAt: '2026-09-28T10:00:00Z',
  sentences: [
    {
      id: 31011,
      orderIndex: 1,
      speakerRole: 'A',
      japaneseText: '部長、来週のリリース日程について確認させていただけますか？',
      romajiText: 'Buchou, raishuu no ririisu nittei ni tsuite kakunin sasete itadakemasu ka?',
      vietnameseTranslation: 'Thưa Trưởng phòng, cho phép em xin được xác nhận về lịch trình phát hành vào tuần sau được không ạ?',
      nativeAudioUrl: '',
    },
    {
      id: 31012,
      orderIndex: 2,
      speakerRole: 'B',
      japaneseText: 'ええ、いいですよ。テストフェーズの進捗はどうなっていますか？',
      romajiText: 'Ee, ii desu yo. Tesuto feezu no shinchoku wa dou natte imasu ka?',
      vietnameseTranslation: 'Ừ, được chứ. Tiến độ của giai đoạn kiểm thử hiện tại đang thế nào rồi em?',
      nativeAudioUrl: '',
    },
    {
      id: 31013,
      orderIndex: 3,
      speakerRole: 'A',
      japaneseText: '重要度高の課題はすべて解消済みで、予定通り進行しております。',
      romajiText: 'Juuyoudokou no kadai wa subete kaishou-zumi de, yotei doori shinkou shite orimasu.',
      vietnameseTranslation: 'Các vấn đề mức độ ưu tiên cao đều đã được giải quyết xong, dự án đang tiến hành đúng theo kế hoạch ạ.',
      nativeAudioUrl: '',
    },
    {
      id: 31014,
      orderIndex: 4,
      speakerRole: 'B',
      japaneseText: '素晴らしいですね。では金曜日の最終レビューに向けて準備を進めてください。',
      romajiText: 'Subarashii desu ne. Dewa kinyoubi no saishuu rebyuu ni mukete junbi wo susumete kudasai.',
      vietnameseTranslation: 'Tuyệt vời lắm. Vậy hãy tiếp tục xúc tiến chuẩn bị cho buổi nghiệm thu cuối vào thứ Sáu nhé.',
      nativeAudioUrl: '',
    },
  ],
};

// Map of all dialogues by ID
export const MOCK_ALL_DIALOGUES: Record<number, ShadowingDialogueDetail> = {
  1401: DIALOGUE_1401,
  1402: DIALOGUE_1402,
  1403: DIALOGUE_1403,
  1301: DIALOGUE_1301,
  1501: DIALOGUE_1501,
  3101: DIALOGUE_3101,
};

// Dialogues mapped by Chapter ID
export const MOCK_CHAPTER_DIALOGUES: Record<string, ShadowingDialogueDetail[]> = {
  'minna-2-chap-14': [DIALOGUE_1401, DIALOGUE_1402, DIALOGUE_1403],
  'minna-2-chap-13': [DIALOGUE_1301],
  'minna-1-chap-1': [DIALOGUE_1501],
  'try-n3-chap-1': [DIALOGUE_3101],
};

// ============================================================
// 4. HELPER FUNCTIONS FOR MOCK QUERIES
// ============================================================

export function getMockTextbooks(level?: string): ShadowingTextbookItem[] {
  if (!level || level === 'ALL') {
    return MOCK_TEXTBOOKS;
  }
  return MOCK_TEXTBOOKS.filter(t => t.level === level.toUpperCase());
}

export function getMockTextbookById(id: string): ShadowingTextbookItem | undefined {
  return MOCK_TEXTBOOKS.find(t => t.id === id);
}

export function getMockChapters(textbookId: string): ShadowingChapterItem[] {
  return MOCK_CHAPTERS[textbookId] || [];
}

export function getMockChapterById(textbookId: string, chapterId: string): ShadowingChapterItem | undefined {
  const chapters = MOCK_CHAPTERS[textbookId] || [];
  return chapters.find(c => c.id === chapterId);
}

export function getMockDialoguesByChapter(chapterId: string): ShadowingDialogueDetail[] {
  if (MOCK_CHAPTER_DIALOGUES[chapterId]) {
    return MOCK_CHAPTER_DIALOGUES[chapterId];
  }
  // Fallback: return dialogue 1401 if chapter has none
  return [DIALOGUE_1401];
}

export function getMockDialogueById(dialogueId: number): ShadowingDialogueDetail | undefined {
  return MOCK_ALL_DIALOGUES[dialogueId] || DIALOGUE_1401;
}

