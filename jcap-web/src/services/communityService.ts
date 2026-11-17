import type { ApiResponse } from '../types/auth';
import {
  type ForumChannel,
  type ForumAttachment,
  type ForumComment,
  type ForumPost,
  getForumPosts,
  saveForumPosts,
} from './mockCommunityStore';

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

function normalizePostId(rawId: string): string {
  if (rawId === 'post-101') return '1';
  if (rawId === 'post-102') return '2';
  if (rawId === 'post-103') return '3';
  return rawId;
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

let isMigratingLocalPosts = false;

export const communityService = {
  async fetchPosts(): Promise<{ posts: ForumPost[]; isLiveBackend: boolean }> {
    try {
      // Nếu trong localStorage có bài viết người dùng tạo trước đó (id dạng post-17...) chưa đẩy lên DB thì tự động đồng bộ lên DB
      if (!isMigratingLocalPosts) {
        const localPosts = getForumPosts();
        const unsynced = localPosts.filter((p) => p.id.startsWith('post-17'));
        if (unsynced.length > 0) {
          isMigratingLocalPosts = true;
          try {
            for (const p of unsynced.reverse()) {
              await fetch('/api/community/posts', {
                method: 'POST',
                headers: getAuthHeaders(),
                body: JSON.stringify({
                  channel: p.channel,
                  title: p.title,
                  content: p.content,
                  isAnonymous: p.isAnonymous,
                  authorId: p.authorId,
                  authorName: p.authorName,
                  authorLevel: p.authorLevel,
                  authorRole: p.authorRole,
                  authorAvatar: p.authorAvatar,
                  attachments: (p.attachments || []).map((a) => ({
                    id: a.id,
                    name: a.fileName,
                    size: a.fileSize,
                    type: a.fileType,
                    url: a.url,
                  })),
                }),
              });
            }
          } finally {
            isMigratingLocalPosts = false;
          }
        }
      }

      const res = await fetch('/api/community/posts', {
        method: 'GET',
        headers: getAuthHeaders(),
      });
      if (res.ok) {
        const json = (await res.json()) as ApiResponse<BackendCommunityPostDto[]>;
        if (json?.success && Array.isArray(json.data)) {
          const mapped = json.data.map(mapDtoToForumPost);
          saveForumPosts(mapped);
          return { posts: mapped, isLiveBackend: true };
        }
      }
    } catch {
      // Fallback to shared localStorage store if backend is offline
    }
    return { posts: getForumPosts(), isLiveBackend: false };
  },

  async createPost(
    payload: CreateCommunityPostPayload
  ): Promise<{ post: ForumPost | null; isLiveBackend: boolean }> {
    const storedUser = getCurrentStoredUser();
    const savedLevel = localStorage.getItem('jcap_level') || storedUser?.level || 'N5';

    try {
      const res = await fetch('/api/community/posts', {
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
          return { post: mapDtoToForumPost(json.data), isLiveBackend: true };
        }
      }
    } catch {
      // Fallback handled by caller
    }
    return { post: null, isLiveBackend: false };
  },

  async addComment(
    postId: string,
    payload: CreateCommunityCommentPayload
  ): Promise<{ post: ForumPost | null; isLiveBackend: boolean }> {
    const storedUser = getCurrentStoredUser();
    const savedLevel = localStorage.getItem('jcap_level') || storedUser?.level || 'N5';

    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(normalizePostId(postId))}/comments`, {
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
          return { post: mapDtoToForumPost(json.data), isLiveBackend: true };
        }
      }
    } catch {
      // Fallback handled by caller
    }
    return { post: null, isLiveBackend: false };
  },

  async toggleUpvote(postId: string): Promise<ForumPost | null> {
    try {
      const res = await fetch(`/api/community/posts/${encodeURIComponent(normalizePostId(postId))}/upvote`, {
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
      const res = await fetch(`/api/community/posts/${encodeURIComponent(normalizePostId(postId))}/toggle-solved`, {
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
      const res = await fetch(`/api/community/posts/${encodeURIComponent(normalizePostId(postId))}/toggle-pin`, {
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
      const res = await fetch(`/api/community/posts/${encodeURIComponent(normalizePostId(postId))}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
