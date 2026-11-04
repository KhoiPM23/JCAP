// ============================================================================
// Mock Store cho Diễn đàn Cộng đồng JCAP (Community Forum - kiểu Threads / Reddit)
// - Nơi Học viên <-> Học viên <-> Admin cùng tạo chủ đề, bình luận, gửi ảnh/tệp,
//   thả upvote và chia sẻ kinh nghiệm học tiếng Nhật.
// - Tách biệt hoàn toàn với trang Hỗ trợ sự cố kỹ thuật (Helpdesk 1-1).
// ============================================================================

export type ForumChannel =
  | 'QA_JAPANESE'
  | 'SPEAKING_TIPS'
  | 'STUDY_BUDDY'
  | 'RESOURCES'
  | 'LOUNGE';

export interface ForumAttachment {
  id: string;
  fileName: string;
  fileSize: number;
  fileType: 'IMAGE' | 'FILE';
  url: string;
}

export interface ForumComment {
  id: string;
  postId: string;
  parentCommentId?: string | null; // Hỗ trợ trả lời lồng nhau (2 cấp)
  authorName: string;
  authorAvatar?: string;
  authorLevel: string; // N5, N4, N3, N2, N1, hoặc ADMIN
  authorRole: 'LEARNER' | 'ADMIN';
  isAnonymous: boolean;
  content: string;
  attachments: ForumAttachment[];
  upvotes: number;
  upvotedByMe?: boolean;
  isAcceptedAnswer?: boolean;
  createdAt: string;
}

export interface ForumPost {
  id: string;
  channel: ForumChannel;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  authorLevel: string;
  authorRole: 'LEARNER' | 'ADMIN';
  isAnonymous: boolean;
  isPinned?: boolean;
  isSolved?: boolean;
  upvotes: number;
  upvotedByMe?: boolean;
  views: number;
  attachments: ForumAttachment[];
  comments: ForumComment[];
  createdAt: string;
}

export const CHANNEL_META: Record<
  ForumChannel,
  {
    label: string;
    shortDesc: string;
    icon: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
  }
> = {
  QA_JAPANESE: {
    label: 'Hỏi đáp Tiếng Nhật',
    shortDesc: 'Giải đáp từ vựng, ngữ pháp, kính ngữ trong bài học',
    icon: '🎌',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
  },
  SPEAKING_TIPS: {
    label: 'Kinh nghiệm Luyện nói',
    shortDesc: 'Mẹo phản xạ với AI & luyện phát âm Shadowing',
    icon: '🎙️',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
  },
  STUDY_BUDDY: {
    label: 'Tìm bạn cùng học',
    shortDesc: 'Lập nhóm luyện giao tiếp & giữ chuỗi streak',
    icon: '🤝',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
  },
  RESOURCES: {
    label: 'Tài liệu & JLPT',
    shortDesc: 'Chia sẻ ghi chú, PDF, cheatsheet ôn thi N5-N1',
    icon: '📚',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
  },
  LOUNGE: {
    label: 'Góc Trò chuyện',
    shortDesc: 'Chia sẻ văn hóa Nhật Bản & động lực học tập',
    icon: '💬',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
  },
};

const STORAGE_KEY = 'jcap_mock_community_forum_v1';

function buildInitialForumPosts(): ForumPost[] {
  const keigoChartSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="680" height="280" viewBox="0 0 680 280">
      <rect width="680" height="280" fill="#0F172A" rx="16"/>
      <text x="28" y="42" fill="#38BDF8" font-family="sans-serif" font-size="16" font-weight="bold">📌 Bảng tóm tắt Kính ngữ hay gặp trong kịch bản Nhà hàng &amp; Khách sạn (N4 - N3)</text>
      <rect x="28" y="62" height="190" width="624" fill="#1E293B" rx="10" stroke="#334155"/>
      <text x="48" y="98" fill="#94A3B8" font-family="sans-serif" font-size="13" font-weight="bold">Động từ gốc          Tôn kính ngữ (Khách)          Khiêm nhường ngữ (Mình)</text>
      <line x1="48" y1="110" x2="630" y2="110" stroke="#334155"/>
      <text x="48" y="140" fill="#F8FAFC" font-family="sans-serif" font-size="14">行く / 来る           いらっしゃる                  伺う (うかがう) / 参る</text>
      <text x="48" y="175" fill="#F8FAFC" font-family="sans-serif" font-size="14">食べる / 飲む         召し上がる (めしあがる)        いただく</text>
      <text x="48" y="210" fill="#F8FAFC" font-family="sans-serif" font-size="14">言う                  おっしゃる                    申し上げる / 申す</text>
      <text x="48" y="240" fill="#34D399" font-family="sans-serif" font-size="12">☁️ Lưu trữ trên Cloudinary • Chia sẻ bởi cộng đồng JCAP</text>
    </svg>
  `)}`;

  const shadowingResultSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" width="680" height="240" viewBox="0 0 680 240">
      <rect width="680" height="240" fill="#071A44" rx="16"/>
      <rect x="24" y="24" width="632" height="192" fill="#0F295E" rx="12" stroke="#1E40AF"/>
      <text x="48" y="66" fill="#60A5FA" font-family="sans-serif" font-size="15" font-weight="bold">🎙️ Kết quả luyện Shadowing N4 - Hội thoại tại Ga Tokyo</text>
      <text x="48" y="112" fill="#FFFFFF" font-family="sans-serif" font-size="28" font-weight="bold">Điểm tổng: 94/100 (Hạng S)</text>
      <text x="48" y="150" fill="#A7F3D0" font-family="sans-serif" font-size="14">✓ Độ chuẩn Mora: 96%   •   ✓ Nhịp điệu (Fluency): 92%   •   ✓ Ngữ điệu: Chuẩn</text>
      <text x="48" y="188" fill="#93C5FD" font-family="sans-serif" font-size="12">Mẹo: Ngắt nhịp đúng sau trợ từ は / を / に giúp tăng 15% điểm Fluency!</text>
    </svg>
  `)}`;

  return [
    {
      id: 'post-101',
      channel: 'RESOURCES',
      title: 'Tổng hợp bảng Kính ngữ (Sonkeigo & Kenjougo) giúp vượt qua mọi kịch bản N4-N3',
      content:
        'Chào mọi người! Khi luyện Hội thoại AI ở các kịch bản Nhà hàng, Khách sạn hay Phỏng vấn N3, mình thấy nhiều bạn hay nhầm giữa Tôn kính ngữ (dùng cho đối phương) và Khiêm nhường ngữ (dùng cho bản thân).\n\nMình tự làm 1 bảng tóm tắt kèm file PDF các mẫu câu cửa miệng để dán trước bàn học. Mọi người tải về tham khảo nhé!',
      authorId: 'user-minh-anh',
      authorName: 'Minh Anh Nguyễn',
      authorLevel: 'N3',
      authorRole: 'LEARNER',
      isAnonymous: false,
      isPinned: true,
      upvotes: 42,
      upvotedByMe: true,
      views: 318,
      attachments: [
        {
          id: 'att-f-1',
          fileName: 'bang_kinh_ngu_nhanh_n3.png',
          fileSize: 154200,
          fileType: 'IMAGE',
          url: keigoChartSvg,
        },
        {
          id: 'att-f-2',
          fileName: 'Cheatsheet_Keigo_Roleplay_JCAP.pdf',
          fileSize: 428000,
          fileType: 'FILE',
          url: 'https://res.cloudinary.com/demo/image/upload/v1312461204/sample.jpg',
        },
      ],
      createdAt: '2026-11-02T14:20:00+07:00',
      comments: [
        {
          id: 'cmt-101-1',
          postId: 'post-101',
          parentCommentId: null,
          authorName: 'Hoàng Nam',
          authorLevel: 'N4',
          authorRole: 'LEARNER',
          isAnonymous: false,
          content:
            'Cảm ơn bạn nhiều lắm! Hôm qua mình vào kịch bản Đặt phòng khách sạn cứ quen miệng nói 食べます thay vì いただきます, bảng này đúng thứ mình đang cần.',
          attachments: [],
          upvotes: 9,
          createdAt: '2026-11-02T15:05:00+07:00',
        },
        {
          id: 'cmt-101-2',
          postId: 'post-101',
          parentCommentId: 'cmt-101-1',
          authorName: 'Minh Anh Nguyễn',
          authorLevel: 'N3',
          authorRole: 'LEARNER',
          isAnonymous: false,
          content:
            'Cố lên bạn ơi! Lúc nói với lễ tân bạn cứ mở đầu bằng 「恐れ入りますが...」 là AI đánh giá điểm thái độ tự nhiên cao lắm đó.',
          attachments: [],
          upvotes: 5,
          createdAt: '2026-11-02T15:30:00+07:00',
        },
        {
          id: 'cmt-101-3',
          postId: 'post-101',
          parentCommentId: null,
          authorName: 'Ban Quản trị JCAP',
          authorLevel: 'ADMIN',
          authorRole: 'ADMIN',
          isAnonymous: false,
          content:
            'Bài tổng hợp rất trực quan và hữu ích cho các bạn đang luyện Roleplay! Admin xin phép ghim bài viết này lên đầu diễn đàn để mọi người dễ tra cứu nhé.',
          attachments: [],
          upvotes: 14,
          createdAt: '2026-11-02T16:10:00+07:00',
        },
      ],
    },
    {
      id: 'post-102',
      channel: 'QA_JAPANESE',
      title: 'Khi gọi món ở quán Ramen, phân biệt 「〜にします」 và 「〜をお願いします」 thế nào ạ?',
      content:
        'Mình mới học N5, lúc vào kịch bản Quán mì Ramen thấy nhân viên hỏi gọi món gì. Mình nghe bạn mình bảo nói 「とんこつラーメンにします」 cũng được mà 「とんこつラーメンをお願いします」 cũng đúng. Hai câu này khác sắc thái nhau thế nào vậy mọi người?',
      authorId: 'user-anon-1',
      authorName: 'Thành viên ẩn danh #204',
      authorLevel: 'N5',
      authorRole: 'LEARNER',
      isAnonymous: true,
      isSolved: true,
      upvotes: 19,
      upvotedByMe: false,
      views: 145,
      attachments: [],
      createdAt: '2026-11-02T19:40:00+07:00',
      comments: [
        {
          id: 'cmt-102-1',
          postId: 'post-102',
          parentCommentId: null,
          authorName: 'Thanh Tùng',
          authorLevel: 'N2',
          authorRole: 'LEARNER',
          isAnonymous: false,
          isAcceptedAnswer: true,
          content:
            'Giải thích ngắn gọn cho bạn dễ nhớ nhé:\n• 「A にします」 nhấn mạnh vào QUYẾT ĐỊNH CHỌN sau khi xem thực đơn (Kiểu: "Tôi chốt chọn món A nhé").\n• 「A をお願いします」 là câu YÊU CẦU / GỌI MÓN trực tiếp với nhân viên ("Cho tôi món A làm ơn").\nTrong quán ăn người Nhật dùng cả 2 đều rất tự nhiên!',
          attachments: [],
          upvotes: 16,
          createdAt: '2026-11-02T20:05:00+07:00',
        },
      ],
    },
    {
      id: 'post-103',
      channel: 'SPEAKING_TIPS',
      title: 'Mẹo kéo điểm Fluency từ 70 lên 94 khi luyện Shadowing cho người hay bị hụt hơi',
      content:
        'Trước đây mình đọc đuổi theo audio VOICEVOX toàn bị dính chữ cuối câu và điểm Fluency chỉ tầm 68-72. Sau 1 tuần thử cách nghe 2 lần không nhìn phụ đề để bắt nhịp ngắt nghỉ (pause) trước khi thu âm, điểm của mình đã lên 94!',
      authorId: 'user-khanh-vy',
      authorName: 'Khánh Vy',
      authorLevel: 'N4',
      authorRole: 'LEARNER',
      isAnonymous: false,
      upvotes: 28,
      upvotedByMe: false,
      views: 210,
      attachments: [
        {
          id: 'att-f-3',
          fileName: 'ket_qua_shadowing_94_diem.png',
          fileSize: 132000,
          fileType: 'IMAGE',
          url: shadowingResultSvg,
        },
      ],
      createdAt: '2026-11-02T21:15:00+07:00',
      comments: [
        {
          id: 'cmt-103-1',
          postId: 'post-103',
          parentCommentId: null,
          authorName: 'Thành viên ẩn danh #819',
          authorLevel: 'N5',
          authorRole: 'LEARNER',
          isAnonymous: true,
          content:
            'Đỉnh quá! Cho mình hỏi bạn thường tập mỗi câu bao nhiêu lần trước khi chuyển sang câu tiếp theo vậy?',
          attachments: [],
          upvotes: 3,
          createdAt: '2026-11-02T22:00:00+07:00',
        },
      ],
    },
    {
      id: 'post-104',
      channel: 'STUDY_BUDDY',
      title: 'Tìm 2-3 bạn đang ôn N4 mỗi tối 21h vào thi đua hoàn thành Bản đồ Hành trình Kanto!',
      content:
        'Hiện mình đang mở khóa đến tỉnh Kyoto trên bản đồ Khám phá. Có bạn nào muốn lập nhóm nhỏ nhắc nhau học 20 thẻ Flashcard và 1 kịch bản AI mỗi tối không? Comment bên dưới mình kết nối nhé!',
      authorId: 'user-duc-huy',
      authorName: 'Đức Huy',
      authorLevel: 'N4',
      authorRole: 'LEARNER',
      isAnonymous: false,
      upvotes: 12,
      upvotedByMe: false,
      views: 89,
      attachments: [],
      createdAt: '2026-11-02T23:10:00+07:00',
      comments: [],
    },
  ];
}

export function getForumPosts(): ForumPost[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = buildInitialForumPosts();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed: ForumPost[] = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const initial = buildInitialForumPosts();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
    return initial;
  } catch {
    return buildInitialForumPosts();
  }
}

export function saveForumPosts(posts: ForumPost[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (err) {
    console.error('Failed to save forum posts:', err);
  }
}

export function resetForumPosts(): ForumPost[] {
  const initial = buildInitialForumPosts();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(initial));
  return initial;
}

