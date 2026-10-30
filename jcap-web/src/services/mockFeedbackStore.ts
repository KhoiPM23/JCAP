// ============================================================================
// Mock Store cho Hòm thư Góp ý & Phản ánh Ẩn danh (Anonymous Feedback Box)
// - Mỗi Học viên (Learner) CHỈ xem được lịch sử bài góp ý của chính mình.
// - Admin xem được tất cả bài góp ý (bao gồm của mọi học viên) nhưng hoàn toàn ẨN DANH (#ANON-xxxx).
// - 3 Trạng thái rõ ràng:
//    + PENDING: Chờ Admin phản hồi
//    + IN_PROGRESS: Đang trò chuyện (Admin đã để ý & phản hồi)
//    + CLOSED: Đã đóng (Chỉ Admin mới có quyền đóng bài)
// ============================================================================

export type FeedbackCategory =
  | 'SCENARIO_BUG'
  | 'AI_ASSESSMENT'
  | 'PAYMENT_CREDIT'
  | 'SYSTEM_BUG'
  | 'SUGGESTION';

export type FeedbackStatus = 'PENDING' | 'IN_PROGRESS' | 'CLOSED';

export interface FeedbackAttachment {
  id: string;
  fileName: string;
  fileSize: number; // tính bằng bytes
  fileType: 'IMAGE' | 'FILE';
  mimeType: string;
  cloudinaryUrl: string;
  cloudinaryPublicId: string;
}

export interface FeedbackMessage {
  id: string;
  ticketId: string;
  senderRole: 'LEARNER' | 'ADMIN';
  content: string;
  attachments: FeedbackAttachment[];
  createdAt: string;
}

export interface FeedbackTicket {
  id: string;
  /**
   * Khóa định danh nội bộ:
   * - 'PRIMARY_DEMO_LEARNER': Các bài mẫu gắn với tài khoản Learner bạn đang dùng để test.
   * - 'OTHER_LEARNER_HIDDEN': Bài của học viên khác (Ẩn hoàn toàn với bạn ở trang Learner, chỉ Admin mới thấy).
   * - Hoặc ID/Email cụ thể của từng tài khoản khi tạo mới.
   */
  learnerOwnerKey: string;
  anonymousCode: string; // Mã ẩn danh hiển thị cho Admin & Learner, VD: #ANON-8492
  title: string;
  category: FeedbackCategory;
  status: FeedbackStatus;
  adminSeenAt?: string; // Thời điểm Admin đã mở xem bài
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  messages: FeedbackMessage[];
}

export const STATUS_META: Record<
  FeedbackStatus,
  {
    label: string;
    learnerHint: string;
    badgeBg: string;
    badgeText: string;
    badgeBorder: string;
    dotColor: string;
  }
> = {
  PENDING: {
    label: 'Chờ Admin phản hồi',
    learnerHint: 'Bài góp ý đã được gửi ẩn danh, đang chờ Admin tiếp nhận và phản hồi.',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-800',
    badgeBorder: 'border-amber-200',
    dotColor: 'bg-amber-500',
  },
  IN_PROGRESS: {
    label: 'Đang trò chuyện',
    learnerHint: 'Admin đã tiếp nhận và phản hồi. Bạn có thể trao đổi tiếp bên dưới.',
    badgeBg: 'bg-blue-50',
    badgeText: 'text-blue-700',
    badgeBorder: 'border-blue-200',
    dotColor: 'bg-blue-600',
  },
  CLOSED: {
    label: 'Đã đóng',
    learnerHint: 'Admin đã xử lý xong và đóng luồng góp ý này.',
    badgeBg: 'bg-slate-100',
    badgeText: 'text-slate-700',
    badgeBorder: 'border-slate-300',
    dotColor: 'bg-slate-500',
  },
};

export const CATEGORY_META: Record<
  FeedbackCategory,
  { label: string; badgeBg: string; badgeText: string; badgeBorder: string; icon: string }
> = {
  SCENARIO_BUG: {
    label: 'Lỗi Kịch bản / Nội dung',
    badgeBg: 'bg-rose-50',
    badgeText: 'text-rose-700',
    badgeBorder: 'border-rose-200',
    icon: '📖',
  },
  AI_ASSESSMENT: {
    label: 'Chấm điểm AI & Giọng nói',
    badgeBg: 'bg-purple-50',
    badgeText: 'text-purple-700',
    badgeBorder: 'border-purple-200',
    icon: '🎙️',
  },
  PAYMENT_CREDIT: {
    label: 'Gói học & Credit',
    badgeBg: 'bg-amber-50',
    badgeText: 'text-amber-700',
    badgeBorder: 'border-amber-200',
    icon: '💳',
  },
  SYSTEM_BUG: {
    label: 'Lỗi Kỹ thuật / Giao diện',
    badgeBg: 'bg-orange-50',
    badgeText: 'text-orange-700',
    badgeBorder: 'border-orange-200',
    icon: '⚙️',
  },
  SUGGESTION: {
    label: 'Đóng góp Ý kiến / Đề xuất',
    badgeBg: 'bg-emerald-50',
    badgeText: 'text-emerald-700',
    badgeBorder: 'border-emerald-200',
    icon: '💡',
  },
};

const STORAGE_KEY = 'jcap_mock_anonymous_feedback_v3';

// ============================================================================
// CÁC ẢNH MINH HỌA SVG ĐÍNH KÈM TRÊN CLOUDINARY (DÙNG CHO DỮ LIỆU GIẢ)
// ============================================================================

const SAMPLE_SCREENSHOT_IZAKAYA = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
  <rect width="640" height="360" fill="#0F172A" rx="12"/>
  <rect x="24" y="24" width="592" height="44" fill="#1E293B" rx="8"/>
  <circle cx="48" cy="46" r="7" fill="#EF4444"/>
  <circle cx="68" cy="46" r="7" fill="#F59E0B"/>
  <circle cx="88" cy="46" r="7" fill="#10B981"/>
  <text x="116" y="51" fill="#94A3B8" font-family="sans-serif" font-size="13">JCAP Roleplay - Kịch bản Gọi món tại Izakaya (N4)</text>
  <rect x="24" y="88" width="592" height="120" fill="#1E293B" rx="10" stroke="#334155"/>
  <text x="48" y="125" fill="#38BDF8" font-family="sans-serif" font-size="14" font-weight="bold">Nhân viên quán (AI):</text>
  <text x="48" y="158" fill="#F8FAFC" font-family="sans-serif" font-size="20">ご注文 (ちゅうぶん) はお決まりですか？</text>
  <rect x="110" y="136" width="120" height="30" fill="none" stroke="#EF4444" stroke-width="2" stroke-dasharray="4 2" rx="4"/>
  <text x="48" y="190" fill="#FCA5A5" font-family="sans-serif" font-size="13">⚠ Furigana hiển thị "ちゅうぶん" thay vì "ちゅうもん"</text>
  <rect x="24" y="228" width="592" height="96" fill="#0F172A" stroke="#1E293B" rx="10"/>
  <text x="48" y="265" fill="#94A3B8" font-family="sans-serif" font-size="13">Cloudinary Storage • Public ID: issues/izakaya_furigana_screenshot_8492</text>
</svg>
`)}`;

const SAMPLE_PITCH_ACCENT = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" fill="#F8FAFC" rx="12" stroke="#CBD5E1"/>
  <rect x="24" y="24" width="592" height="50" fill="#EFF6FF" rx="8"/>
  <text x="44" y="54" fill="#1E40AF" font-family="sans-serif" font-size="15" font-weight="bold">Kết quả phân tích Pitch Accent - Bài Shadowing #12</text>
  <rect x="24" y="92" width="592" height="196" fill="#FFFFFF" rx="8" stroke="#E2E8F0"/>
  <text x="48" y="135" fill="#334155" font-family="sans-serif" font-size="18">Từ mục tiêu: 箸 (はし - HLL) • Điểm nhận diện: 58/100</text>
  <polyline points="60,220 180,160 320,230 460,235" fill="none" stroke="#0878EE" stroke-width="4"/>
  <polyline points="60,215 180,170 320,225 460,230" fill="none" stroke="#EF4444" stroke-width="3" stroke-dasharray="6 4"/>
  <text x="48" y="268" fill="#64748B" font-family="sans-serif" font-size="13">Đường xanh: Chuẩn bản xứ | Đường đỏ: Giọng thu âm học viên</text>
</svg>
`)}`;

const SAMPLE_PAYOS_RECEIPT = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="340" viewBox="0 0 640 340">
  <rect width="640" height="340" fill="#0F172A" rx="12"/>
  <rect x="40" y="28" width="560" height="284" fill="#FFFFFF" rx="12"/>
  <rect x="40" y="28" width="560" height="58" fill="#0878EE" rx="12"/>
  <text x="68" y="63" fill="#FFFFFF" font-family="sans-serif" font-size="16" font-weight="bold">Biên lai Thanh toán PayOS — Gói Chuyên Sâu (500 Credits)</text>
  <text x="68" y="122" fill="#334155" font-family="sans-serif" font-size="14">Mã đơn hàng (OrderCode): #17299482</text>
  <text x="68" y="156" fill="#334155" font-family="sans-serif" font-size="14">Số tiền chuyển khoản: 99.000 VNĐ</text>
  <text x="68" y="190" fill="#059669" font-family="sans-serif" font-size="14" font-weight="bold">Trạng thái ngân hàng: Thành công (Đã trừ tiền lúc 19:42)</text>
  <rect x="68" y="216" width="504" height="68" fill="#FEF3C7" rx="8" stroke="#F59E0B"/>
  <text x="88" y="255" fill="#92400E" font-family="sans-serif" font-size="13">Ảnh chụp màn hình biên lai gửi ẩn danh để Admin đối soát giao dịch</text>
</svg>
`)}`;

const SAMPLE_EXPLORE_FIX = `data:image/svg+xml;utf8,${encodeURIComponent(`
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="320" viewBox="0 0 640 320">
  <rect width="640" height="320" fill="#EFF6FF" rx="12" stroke="#BFDBFE"/>
  <rect x="28" y="24" width="584" height="48" fill="#0878EE" rx="8"/>
  <text x="48" y="53" fill="#FFFFFF" font-family="sans-serif" font-size="14" font-weight="bold">Bản cập nhật UI Bản đồ Khám phá (Đã căn chỉnh Responsive 13-inch)</text>
  <rect x="28" y="90" width="584" height="200" fill="#FFFFFF" rx="10" stroke="#93C5FD"/>
  <text x="52" y="140" fill="#1E3A8A" font-family="sans-serif" font-size="15" font-weight="bold">✓ Popup Địa danh vùng Kansai (Kyoto / Osaka) đã tự động co giãn</text>
  <text x="52" y="175" fill="#475569" font-family="sans-serif" font-size="13">Ảnh đính kèm bởi Ban Quản Trị JCAP (Admin) • Cloudinary: issues/admin_explore_fix_4186</text>
</svg>
`)}`;

function buildDefaultTickets(): FeedbackTicket[] {
  return [
    // ========================================================================
    // 1. BÀI CỦA HỌC VIÊN HIỆN TẠI — TRẠNG THÁI: CHỜ ADMIN PHẢN HỒI (CHƯA XEM)
    // ========================================================================
    {
      id: 'fb-101',
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: '#ANON-3105',
      title: 'AI chấm điểm Pitch Accent từ "箸 (Hashi - Đũa)" hơi khắt khe ở bài Shadowing #12',
      category: 'AI_ASSESSMENT',
      status: 'PENDING',
      createdAt: '2026-10-28T20:15:00+07:00',
      updatedAt: '2026-10-28T20:15:00+07:00',
      messages: [
        {
          id: 'msg-101-1',
          ticketId: 'fb-101',
          senderRole: 'LEARNER',
          content:
            'Chào Admin, mình đang luyện bài Shadowing phân biệt trọng âm 箸 (Đũa - HLL) và 橋 (Cầu - LHH). Dù đường biểu đồ giọng thu âm của mình đi xuống đúng nhịp ở âm tiết thứ 2 nhưng hệ thống vẫn chấm 58/100 điểm. Mình đính kèm ảnh chụp kết quả bên dưới, mong team kỹ thuật kiểm tra giúp độ nhạy của bộ chấm điểm với giọng nữ trầm ạ!',
          attachments: [
            {
              id: 'att-101-1',
              fileName: 'pitch_accent_hashi_result.jpg',
              fileSize: 245760,
              fileType: 'IMAGE',
              mimeType: 'image/jpeg',
              cloudinaryUrl: SAMPLE_PITCH_ACCENT,
              cloudinaryPublicId: 'issues/pitch_accent_hashi_3105',
            },
          ],
          createdAt: '2026-10-28T20:15:00+07:00',
        },
      ],
    },

    // ========================================================================
    // 2. BÀI CỦA HỌC VIÊN HIỆN TẠI — TRẠNG THÁI: CHỜ ADMIN PHẢN HỒI (ĐÃ XEM)
    // ========================================================================
    {
      id: 'fb-102',
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: '#ANON-7290',
      title: 'Đã quét mã QR PayOS nạp gói 500 Credits nhưng ví chưa cộng điểm ngay',
      category: 'PAYMENT_CREDIT',
      status: 'PENDING',
      adminSeenAt: '2026-10-28T19:50:00+07:00',
      createdAt: '2026-10-28T19:45:00+07:00',
      updatedAt: '2026-10-28T19:45:00+07:00',
      messages: [
        {
          id: 'msg-102-1',
          ticketId: 'fb-102',
          senderRole: 'LEARNER',
          content:
            'Mình vừa thực hiện thanh toán qua cổng PayOS cho Gói Chuyên Sâu (mã đơn hàng #17299482) lúc 19:42. Ngân hàng báo đã trừ tiền thành công nhưng lúc chuyển hướng về lại trang web thì mạng nhà mình bị rớt nên giao dịch vẫn hiện "Đang xử lý". Mình gửi kèm ảnh biên lai để Admin kiểm tra giúp nhé!',
          attachments: [
            {
              id: 'att-102-1',
              fileName: 'bien_lai_payos_17299482.png',
              fileSize: 198400,
              fileType: 'IMAGE',
              mimeType: 'image/png',
              cloudinaryUrl: SAMPLE_PAYOS_RECEIPT,
              cloudinaryPublicId: 'issues/bien_lai_payos_7290',
            },
          ],
          createdAt: '2026-10-28T19:45:00+07:00',
        },
      ],
    },

    // ========================================================================
    // 3. BÀI CỦA HỌC VIÊN HIỆN TẠI — TRẠNG THÁI: ĐANG TRÒ CHUYỆN (3 TIN NHẮN)
    // ========================================================================
    {
      id: 'fb-103',
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: '#ANON-8492',
      title: 'Câu thoại số 4 trong kịch bản "Gọi món tại Izakaya (N4)" bị lệch furigana',
      category: 'SCENARIO_BUG',
      status: 'IN_PROGRESS',
      adminSeenAt: '2026-10-28T09:10:00+07:00',
      createdAt: '2026-10-28T08:15:00+07:00',
      updatedAt: '2026-10-28T10:42:00+07:00',
      messages: [
        {
          id: 'msg-103-1',
          ticketId: 'fb-103',
          senderRole: 'LEARNER',
          content:
            'Chào Admin, khi mình thực hành kịch bản "Gọi món tại Izakaya" (trình độ N4), ở lượt thoại số 4 của nhân viên quán, từ ご注文 có furigana hiển thị là "ちゅうぶん" thay vì đúng chuẩn là "ちゅうもん". Mình gửi kèm ảnh chụp màn hình bên dưới để team kiểm tra giúp nhé!',
          attachments: [
            {
              id: 'att-103-1',
              fileName: 'izakaya_furigana_screenshot.png',
              fileSize: 184320,
              fileType: 'IMAGE',
              mimeType: 'image/png',
              cloudinaryUrl: SAMPLE_SCREENSHOT_IZAKAYA,
              cloudinaryPublicId: 'issues/izakaya_furigana_screenshot_8492',
            },
          ],
          createdAt: '2026-10-28T08:15:00+07:00',
        },
        {
          id: 'msg-103-2',
          ticketId: 'fb-103',
          senderRole: 'ADMIN',
          content:
            'Cảm ơn bạn đã gửi phản ánh ẩn danh rất chi tiết! Đội ngũ nội dung đã kiểm tra ảnh bạn đính kèm và xác nhận đúng là có lỗi gõ nhầm furigana ở câu thoại #4. Cho mình hỏi thêm là phần giọng đọc AI ở câu đó phát âm ra tiếng có bị đọc nhầm theo không hay vẫn đọc đúng là "chuumon" ạ?',
          attachments: [],
          createdAt: '2026-10-28T09:30:00+07:00',
        },
        {
          id: 'msg-103-3',
          ticketId: 'fb-103',
          senderRole: 'LEARNER',
          content:
            'Phần âm thanh AI đọc vẫn chuẩn là "chuumon" ạ, chỉ có chữ furigana hiển thị phía trên chữ Hán bị nhầm thôi. Mình gửi kèm thêm file PDF tổng hợp 3 từ vựng món ăn trong bài mà mình thấy phần dịch nghĩa tiếng Việt có thể viết tự nhiên hơn để team tham khảo nhé!',
          attachments: [
            {
              id: 'att-103-2',
              fileName: 'gop_y_tu_vung_izakaya_n4.pdf',
              fileSize: 96400,
              fileType: 'FILE',
              mimeType: 'application/pdf',
              cloudinaryUrl: '#cloudinary-raw-pdf-preview',
              cloudinaryPublicId: 'issues/gop_y_tu_vung_izakaya_8492.pdf',
            },
          ],
          createdAt: '2026-10-28T10:42:00+07:00',
        },
      ],
    },

    // ========================================================================
    // 4. BÀI CỦA HỌC VIÊN HIỆN TẠI — TRẠNG THÁI: ĐANG TRÒ CHUYỆN (ADMIN VỪA TRẢ LỜI)
    // ========================================================================
    {
      id: 'fb-104',
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: '#ANON-4186',
      title: 'Thẻ thông tin địa danh trên Bản đồ Khám phá hơi tràn viền trên màn hình 13 inch',
      category: 'SYSTEM_BUG',
      status: 'IN_PROGRESS',
      adminSeenAt: '2026-10-27T15:00:00+07:00',
      createdAt: '2026-10-27T14:10:00+07:00',
      updatedAt: '2026-10-27T16:35:00+07:00',
      messages: [
        {
          id: 'msg-104-1',
          ticketId: 'fb-104',
          senderRole: 'LEARNER',
          content:
            'Khi mình mở mục Khám phá bản đồ Nhật Bản trên màn hình laptop 13 inch (độ phân giải 1366x768) và bấm vào tỉnh Kyoto, thẻ thông tin địa danh hiện ra hơi sát mép dưới nên phải cuộn chuột mới bấm được nút Nghe phát âm.',
          attachments: [],
          createdAt: '2026-10-27T14:10:00+07:00',
        },
        {
          id: 'msg-104-2',
          ticketId: 'fb-104',
          senderRole: 'ADMIN',
          content:
            'Chào bạn, bộ phận kỹ thuật đã điều chỉnh lại bố cục khung thông tin địa danh tự động thu gọn chiều cao trên màn hình nhỏ. Mình gửi kèm ảnh giao diện mới bên dưới, bạn thử tải lại trang xem đã thao tác thoải mái hơn chưa nhé! Nếu đã ổn mình sẽ đóng luồng hỗ trợ này.',
          attachments: [
            {
              id: 'att-104-1',
              fileName: 'explore_responsive_fixed.png',
              fileSize: 162000,
              fileType: 'IMAGE',
              mimeType: 'image/png',
              cloudinaryUrl: SAMPLE_EXPLORE_FIX,
              cloudinaryPublicId: 'issues/admin_explore_fix_4186',
            },
          ],
          createdAt: '2026-10-27T16:35:00+07:00',
        },
      ],
    },

    // ========================================================================
    // 5. BÀI CỦA HỌC VIÊN HIỆN TẠI — TRẠNG THÁI: ĐÃ ĐÓNG BỞI ADMIN
    // ========================================================================
    {
      id: 'fb-105',
      learnerOwnerKey: 'PRIMARY_DEMO_LEARNER',
      anonymousCode: '#ANON-6720',
      title: 'Đề xuất thêm tốc độ nghe chậm 0.75x cho phần luyện nghe câu mẫu N5',
      category: 'SUGGESTION',
      status: 'CLOSED',
      adminSeenAt: '2026-10-26T09:00:00+07:00',
      createdAt: '2026-10-25T16:10:00+07:00',
      updatedAt: '2026-10-26T11:20:00+07:00',
      closedAt: '2026-10-26T11:20:00+07:00',
      messages: [
        {
          id: 'msg-105-1',
          ticketId: 'fb-105',
          senderRole: 'LEARNER',
          content:
            'Đối với người mới bắt đầu ở mức N5, tốc độ nói tự nhiên của nhân vật AI đôi khi hơi nhanh khi nối âm. Nếu có thêm nút chỉnh tốc độ phát lại 0.75x ở phần nghe lại câu mẫu thì sẽ rất hữu ích cho tụi mình!',
          attachments: [],
          createdAt: '2026-10-25T16:10:00+07:00',
        },
        {
          id: 'msg-105-2',
          ticketId: 'fb-105',
          senderRole: 'ADMIN',
          content:
            'Cảm ơn góp ý rất thiết thực của bạn! Team phát triển đã bổ sung tùy chọn tốc độ phát 0.75x vào trình phát âm thanh mẫu cho các bài N5 và N4.',
          attachments: [],
          createdAt: '2026-10-26T10:15:00+07:00',
        },
        {
          id: 'msg-105-3',
          ticketId: 'fb-105',
          senderRole: 'LEARNER',
          content:
            'Mình vừa thử nghe lại ở mức 0.75x rất rõ chữ, cảm ơn Admin và đội ngũ phát triển nhiều nhé!',
          attachments: [],
          createdAt: '2026-10-26T11:05:00+07:00',
        },
      ],
    },

    // ========================================================================
    // 6 & 7. BÀI CỦA CÁC HỌC VIÊN KHÁC (ẨN ĐỐI VỚI BẠN Ở TRANG LEARNER,
    //        NHƯNG HIỂN THỊ ĐẦY ĐỦ KHI BẠN ĐĂNG NHẬP TÀI KHOẢN ADMIN)
    // ========================================================================
    {
      id: 'fb-206',
      learnerOwnerKey: 'OTHER_LEARNER_HIDDEN_1',
      anonymousCode: '#ANON-5519',
      title: 'Thắc mắc về việc bảo lưu số dư Credit lẻ khi đăng ký thêm gói Hội viên tháng',
      category: 'PAYMENT_CREDIT',
      status: 'PENDING',
      createdAt: '2026-10-28T18:05:00+07:00',
      updatedAt: '2026-10-28T18:05:00+07:00',
      messages: [
        {
          id: 'msg-206-1',
          ticketId: 'fb-206',
          senderRole: 'LEARNER',
          content:
            'Cho mình hỏi số Credit nạp lẻ còn dư trong ví có được giữ nguyên không giới hạn thời gian khi mình đăng ký thêm gói Hội viên tháng không ạ?',
          attachments: [],
          createdAt: '2026-10-28T18:05:00+07:00',
        },
      ],
    },
    {
      id: 'fb-207',
      learnerOwnerKey: 'OTHER_LEARNER_HIDDEN_2',
      anonymousCode: '#ANON-9041',
      title: 'Kịch bản "Phỏng vấn xin việc IT tại Tokyo" nên có thêm gợi ý kính ngữ Sonkeigo',
      category: 'SUGGESTION',
      status: 'IN_PROGRESS',
      adminSeenAt: '2026-10-28T11:30:00+07:00',
      createdAt: '2026-10-28T10:15:00+07:00',
      updatedAt: '2026-10-28T13:20:00+07:00',
      messages: [
        {
          id: 'msg-207-1',
          ticketId: 'fb-207',
          senderRole: 'LEARNER',
          content:
            'Trong bài phỏng vấn N3, phần nhiệm vụ (Mission) yêu cầu dùng kính ngữ với nhà tuyển dụng. Nếu phần gợi ý (Hint) có liệt kê sẵn các cặp động từ chuyển sang Sonkeigo / Kenjougo thì người học sẽ dễ phản xạ hơn ạ.',
          attachments: [],
          createdAt: '2026-10-28T10:15:00+07:00',
        },
        {
          id: 'msg-207-2',
          ticketId: 'fb-207',
          senderRole: 'ADMIN',
          content:
            'Chào bạn, ý tưởng rất hay! Chúng mình đang biên soạn bảng tra nhanh Kính ngữ ngay trong khung gợi ý của các kịch bản N3. Bạn mong muốn có thêm ví dụ câu hoàn chỉnh hay chỉ cần bảng động từ biến đổi là đủ?',
          attachments: [],
          createdAt: '2026-10-28T13:20:00+07:00',
        },
      ],
    },
  ];
}

/**
 * Lấy toàn bộ danh sách ticket trong hệ thống (Dùng cho Admin hoặc xử lý lưu trữ)
 */
export function getAllMockFeedbackTickets(): FeedbackTicket[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seeded = buildDefaultTickets();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
      return seeded;
    }
    const parsed: FeedbackTicket[] = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    const seeded = buildDefaultTickets();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
    return seeded;
  } catch {
    return buildDefaultTickets();
  }
}

/**
 * Lấy danh sách bài góp ý CỦA RIÊNG HỌC VIÊN ĐANG ĐĂNG NHẬP:
 * - Gồm 5 bài mẫu ('PRIMARY_DEMO_LEARNER') + các bài do chính học viên này tạo mới.
 * - Tuyệt đối KHÔNG trả về các bài của học viên khác ('OTHER_LEARNER_HIDDEN_*').
 */
export function getLearnerOwnTickets(learnerOwnerKey: string): FeedbackTicket[] {
  const all = getAllMockFeedbackTickets();
  return all.filter(
    (t) =>
      t.learnerOwnerKey === 'PRIMARY_DEMO_LEARNER' ||
      t.learnerOwnerKey === learnerOwnerKey
  );
}

export function saveMockFeedbackTickets(tickets: FeedbackTicket[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tickets));
  } catch (err) {
    console.error('Failed to save mock feedback tickets:', err);
  }
}

export function resetMockFeedbackTickets(): FeedbackTicket[] {
  const seeded = buildDefaultTickets();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(seeded));
  return seeded;
}

/**
 * Tạo nhanh một tệp/ảnh đính kèm giả lập trên Cloudinary để tiện bấm test 1-click
 */
export function createSampleAttachment(type: 'IMAGE' | 'FILE'): FeedbackAttachment {
  const rand = Math.floor(1000 + Math.random() * 9000);
  if (type === 'IMAGE') {
    const sampleSvg = `data:image/svg+xml;utf8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" width="600" height="320" viewBox="0 0 600 320">
        <rect width="600" height="320" fill="#1E293B" rx="12"/>
        <rect x="20" y="20" width="560" height="40" fill="#334155" rx="6"/>
        <text x="40" y="45" fill="#E2E8F0" font-family="sans-serif" font-size="14" font-weight="bold">Ảnh chụp màn hình đính kèm #${rand}</text>
        <rect x="20" y="80" width="560" height="190" fill="#0F172A" rx="8" stroke="#38BDF8" stroke-dasharray="5 3"/>
        <text x="45" y="135" fill="#38BDF8" font-family="sans-serif" font-size="16">☁️ Lưu trữ trên Cloudinary (folder: issues/)</text>
        <text x="45" y="170" fill="#94A3B8" font-family="sans-serif" font-size="13">Đã xóa thông tin định danh cá nhân (EXIF stripped)</text>
        <text x="45" y="205" fill="#F8FAFC" font-family="sans-serif" font-size="14">Public ID: issues/screenshot_minh_hoa_${rand}</text>
      </svg>
    `)}`;
    return {
      id: `att-${Date.now()}-${rand}`,
      fileName: `anh_chup_man_hinh_${rand}.png`,
      fileSize: 164800,
      fileType: 'IMAGE',
      mimeType: 'image/png',
      cloudinaryUrl: sampleSvg,
      cloudinaryPublicId: `issues/anh_chup_man_hinh_${rand}`,
    };
  }
  return {
    id: `att-${Date.now()}-${rand}`,
    fileName: `tai_lieu_dinh_kem_${rand}.pdf`,
    fileSize: 88200,
    fileType: 'FILE',
    mimeType: 'application/pdf',
    cloudinaryUrl: `https://res.cloudinary.com/jcap-cloud/raw/upload/v1/issues/tai_lieu_dinh_kem_${rand}.pdf`,
    cloudinaryPublicId: `issues/tai_lieu_dinh_kem_${rand}.pdf`,
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}
