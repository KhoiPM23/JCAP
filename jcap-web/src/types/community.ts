/** Kiểu dữ liệu Diễn đàn (API /api/community) */

export type ForumChannel = 'QA_JAPANESE' | 'SPEAKING_TIPS' | 'STUDY_BUDDY' | 'RESOURCES' | 'LOUNGE';

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
  /** Trả lời một bình luận gốc (một cấp) */
  parentCommentId?: string | null;
  authorId?: string;
  isOwnComment?: boolean;
  authorName: string;
  authorAvatar?: string;
  /** N5…N1 hoặc ADMIN */
  authorLevel: string;
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
  isOwnPost?: boolean;
  isPinned?: boolean;
  isSolved?: boolean;
  upvotes: number;
  upvotedByMe?: boolean;
  views: number;
  attachments: ForumAttachment[];
  comments: ForumComment[];
  createdAt: string;
}
