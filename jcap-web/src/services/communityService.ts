import type { ApiResponse } from '../types/auth';
import { resolveApiUrl } from '../utils/apiBase';
import type { ForumAttachment, ForumChannel, ForumComment, ForumPost } from '../types/community';

export interface BackendCommunityAttachmentDto {
  id: string;
  name: string;
  size: number;
  type: 'IMAGE' | 'FILE';
  url: string;
}

export interface BackendCommunityCommentDto {
  id: string;
  postId: string;
  parentCommentId?: string | null;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  authorLevel: string;
  authorRole: 'LEARNER' | 'ADMIN';
  isAnonymous: boolean;
  isOwnComment: boolean;
  content: string;
  createdAt: string;
  upvotes: number;
  upvotedByMe: boolean;
  isAcceptedAnswer: boolean;
  attachments: BackendCommunityAttachmentDto[];
}

export interface BackendCommunityPostDto {
  id: string;
  channel: ForumChannel;
  title: string;
  content: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string | null;
  authorLevel: string;
  authorRole: 'LEARNER' | 'ADMIN';
  isAnonymous: boolean;
  isOwnPost: boolean;
  createdAt: string;
  updatedAt: string;
  isPinned: boolean;
  isSolved: boolean;
  upvotes: number;
  upvotedByMe: boolean;
  views: number;
  attachments: BackendCommunityAttachmentDto[];
  comments: BackendCommunityCommentDto[];
}

export interface CreateCommunityPostPayload {
  channel: ForumChannel;
  title: string;
  content: string;
  isAnonymous: boolean;
  attachments: ForumAttachment[];
  authorId?: string;
  authorEmail?: string;
  authorName?: string;
  authorLevel?: string;
  authorRole?: string;
  authorAvatar?: string;
}

export interface CreateCommunityCommentPayload {
  parentCommentId?: string | null;
  content: string;
  isAnonymous: boolean;
  attachments: ForumAttachment[];
  authorId?: string;
  authorEmail?: string;
  authorName?: string;
  authorLevel?: string;
  authorRole?: string;
  authorAvatar?: string;
}

function getCurrentStoredUser(): {
  id?: string;
  email?: string;
  fullName?: string;
  role?: string;
  level?: string;
  avatarUrl?: string;
} | null {
  try {
    const raw = localStorage.getItem('jcap_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem('jcap_token');
  const storedUser = getCurrentStoredUser();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (storedUser?.id) {
    headers['X-User-Id'] = String(storedUser.id);
  }
  if (storedUser?.email) {
    headers['X-User-Email'] = String(storedUser.email);
  }
  return headers;
}

function mapDtoToForumPost(dto: BackendCommunityPostDto): ForumPost {
  return {
    id: String(dto.id),
    channel: (dto.channel || 'QA_JAPANESE') as ForumChannel,
    title: dto.title,
    content: dto.content,
    authorId: dto.authorId,
    authorName: dto.authorName,
    authorAvatar: dto.authorAvatar || undefined,
    authorLevel: dto.authorLevel || 'N5',
    authorRole: dto.authorRole === 'ADMIN' ? 'ADMIN' : 'LEARNER',
    isAnonymous: Boolean(dto.isAnonymous),
    isOwnPost: Boolean(dto.isOwnPost),
    isPinned: Boolean(dto.isPinned),
    isSolved: Boolean(dto.isSolved),
    upvotes: dto.upvotes ?? 0,
    upvotedByMe: Boolean(dto.upvotedByMe),
    views: dto.views ?? 1,
    createdAt: dto.createdAt,
    attachments: (dto.attachments || []).map((a) => ({
      id: String(a.id),
      fileName: a.name,
      fileSize: a.size,
      fileType: a.type === 'FILE' ? 'FILE' : 'IMAGE',
      url: a.url,
    })),
    comments: Array.from(
      new Map(
        (dto.comments || []).map((c): [string, ForumComment] => [
          String(c.id),
          {
            id: String(c.id),
            postId: String(c.postId),
            parentCommentId: c.parentCommentId ? String(c.parentCommentId) : null,
            authorId: c.authorId,
            authorName: c.authorName,
            authorAvatar: c.authorAvatar || undefined,
            authorLevel: c.authorLevel || 'N5',
            authorRole: c.authorRole === 'ADMIN' ? 'ADMIN' : 'LEARNER',
            isAnonymous: Boolean(c.isAnonymous),
            isOwnComment: Boolean(c.isOwnComment),
            content: c.content,
            createdAt: c.createdAt,
            upvotes: c.upvotes ?? 0,
            upvotedByMe: Boolean(c.upvotedByMe),
            isAcceptedAnswer: Boolean(c.isAcceptedAnswer),
            attachments: (c.attachments || []).map((a) => ({
              id: String(a.id),
              fileName: a.name,
              fileSize: a.size,
              fileType: a.type === 'FILE' ? 'FILE' : 'IMAGE',
              url: a.url,
            })),
          },
        ])
      ).values()
    ),
  };
}

export const communityService = {
  /** null = không tải được (máy chủ chưa phản hồi hoặc trả lỗi) */
  async fetchPosts(): Promise<ForumPost[] | null> {
    try {
      const res = await fetch(resolveApiUrl('/api/community/posts'), {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto[]>;
        if (json?.success && Array.isArray(json.data)) return json.data.map(mapDtoToForumPost);
      }
    } catch {
      // Không kết nối được
    }
    return null;
  },

  async createPost(
    payload: CreateCommunityPostPayload
  ): Promise<ForumPost | null> {
    const storedUser = getCurrentStoredUser();
    const savedLevel = localStorage.getItem('jcap_level') || storedUser?.level || 'N5';

    try {
      const res = await fetch(resolveApiUrl('/api/community/posts'), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          channel: payload.channel,
          title: payload.title,
          content: payload.content,
          isAnonymous: payload.isAnonymous,
          authorId: payload.authorId || storedUser?.id,
          authorEmail: payload.authorEmail || storedUser?.email,
          authorName:
            payload.authorName ||
            storedUser?.fullName ||
            storedUser?.email?.split('@')[0] ||
            'Học viên JCAP',
          authorLevel: payload.authorLevel || savedLevel,
          authorRole: payload.authorRole || storedUser?.role || 'LEARNER',
          authorAvatar: payload.authorAvatar || storedUser?.avatarUrl,
          attachments: payload.attachments.map((a) => ({
            id: a.id,
            name: a.fileName,
            size: a.fileSize,
            type: a.fileType,
            url: a.url,
          })),
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto>;
        if (json?.success && json.data) {
          return mapDtoToForumPost(json.data);
        }
      }
    } catch {
      // Nơi gọi báo lỗi và giữ nội dung
    }
    return null;
  },

  async addComment(
    postId: string,
    payload: CreateCommunityCommentPayload
  ): Promise<ForumPost | null> {
    const storedUser = getCurrentStoredUser();
    const savedLevel = localStorage.getItem('jcap_level') || storedUser?.level || 'N5';

    try {
      const res = await fetch(resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/comments`), {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          parentCommentId: payload.parentCommentId || null,
          content: payload.content,
          isAnonymous: payload.isAnonymous,
          authorId: payload.authorId || storedUser?.id,
          authorEmail: payload.authorEmail || storedUser?.email,
          authorName:
            payload.authorName ||
            storedUser?.fullName ||
            storedUser?.email?.split('@')[0] ||
            'Học viên JCAP',
          authorLevel: payload.authorLevel || savedLevel,
          authorRole: payload.authorRole || storedUser?.role || 'LEARNER',
          authorAvatar: payload.authorAvatar || storedUser?.avatarUrl,
          attachments: payload.attachments.map((a) => ({
            id: a.id,
            name: a.fileName,
            size: a.fileSize,
            type: a.fileType,
            url: a.url,
          })),
        }),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto>;
        if (json?.success && json.data) {
          return mapDtoToForumPost(json.data);
        }
      }
    } catch {
      // Nơi gọi báo lỗi và giữ nội dung
    }
    return null;
  },

  async toggleUpvote(postId: string): Promise<ForumPost | null> {
    try {
      const res = await fetch(resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/upvote`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto>;
        if (json?.success && json.data) {
          return mapDtoToForumPost(json.data);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  },

  async toggleSolved(postId: string): Promise<ForumPost | null> {
    try {
      const res = await fetch(resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/toggle-solved`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto>;
        if (json?.success && json.data) {
          return mapDtoToForumPost(json.data);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  },

  async togglePin(postId: string): Promise<ForumPost | null> {
    try {
      const res = await fetch(resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}/toggle-pin`), {
        method: 'POST',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto>;
        if (json?.success && json.data) {
          return mapDtoToForumPost(json.data);
        }
      }
    } catch {
      // Ignore
    }
    return null;
  },

  async deletePost(postId: string): Promise<boolean> {
    try {
      const res = await fetch(resolveApiUrl(`/api/community/posts/${encodeURIComponent(postId)}`), {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
