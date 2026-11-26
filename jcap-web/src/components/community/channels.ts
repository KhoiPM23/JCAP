import type React from 'react';
import type { RegionId } from '../../data/japanMap';
import type { ForumChannel } from '../../types/community';
import { WOODBLOCK } from '../../views/explore/exploreTheme';

export interface ChannelMeta {
  id: ForumChannel;
  label: string;
  desc: string;
  icon: string;
}

export const CHANNELS: ChannelMeta[] = [
  { id: 'QA_JAPANESE', label: 'Hỏi đáp Tiếng Nhật', desc: 'Giải đáp từ vựng, ngữ pháp, kính ngữ trong bài học', icon: 'quiz' },
  { id: 'SPEAKING_TIPS', label: 'Kinh nghiệm Luyện nói', desc: 'Mẹo phản xạ với AI và luyện phát âm Shadowing', icon: 'record_voice_over' },
  { id: 'STUDY_BUDDY', label: 'Tìm bạn cùng học', desc: 'Lập nhóm luyện giao tiếp, giữ chuỗi ngày học', icon: 'diversity_3' },
  { id: 'RESOURCES', label: 'Tài liệu & JLPT', desc: 'Chia sẻ ghi chú, PDF, bảng tóm tắt ôn thi', icon: 'menu_book' },
  { id: 'LOUNGE', label: 'Góc Trò chuyện', desc: 'Văn hoá Nhật Bản và động lực học tập', icon: 'local_cafe' },
];

export const channelOf = (id: ForumChannel): ChannelMeta => CHANNELS.find((c) => c.id === id) ?? CHANNELS[CHANNELS.length - 1];

/** Vùng trong bộ màu khắc gỗ (WOODBLOCK) dùng cho mỗi kênh */
const REGION: Record<ForumChannel, RegionId> = {
  QA_JAPANESE: 'hokkaido',
  SPEAKING_TIPS: 'chugoku',
  STUDY_BUDDY: 'kanto',
  RESOURCES: 'chubu',
  LOUNGE: 'kansai',
};

/** Biến CSS --k (mực) và --kf (nền) của một vùng màu; community.css tự đổi cho chế độ tối */
export function woodStyle(region: RegionId): React.CSSProperties {
  const [fill, , ink] = WOODBLOCK[region];
  return { '--k': ink, '--kf': fill } as React.CSSProperties;
}

export const channelStyle = (id: ForumChannel) => woodStyle(REGION[id] ?? 'kansai');
