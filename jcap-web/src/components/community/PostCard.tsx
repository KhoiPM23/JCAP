import React, { useEffect, useRef, useState } from 'react';
import { Badge, Icon, IconButton, JlptBadge } from '../jcap';
import type { Jlpt } from '../jcap';
import { formatFileSize } from '../../services/feedbackService';
import type { ForumAttachment, ForumPost } from '../../types/community';
import { channelOf, channelStyle, woodStyle } from './channels';
import { ForumAvatar } from './ForumAvatar';
import { timeAgo } from './format';

export interface PostCardProps {
  post: ForumPost;
  open: boolean;
  isAdmin: boolean;
  onToggle: () => void;
  onLike: () => void;
  onSolve: () => void;
  onPin: () => void;
  onDelete: () => void;
  onImage: (attachment: ForumAttachment) => void;
  /** Phần bình luận, chỉ dựng khi bài đang mở */
  children?: React.ReactNode;
}

/** Ô icon theo loại tệp: PDF, Word, còn lại */
function fileKind(name: string): { label: string; icon: string; style?: React.CSSProperties } {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (ext === 'pdf') return { label: 'PDF', icon: 'picture_as_pdf', style: woodStyle('kanto') };
  if (ext === 'doc' || ext === 'docx') return { label: 'Word', icon: 'description', style: woodStyle('hokkaido') };
  return { label: ext ? ext.toUpperCase() : 'Tệp', icon: 'draft' };
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  open,
  isAdmin,
  onToggle,
  onLike,
  onSolve,
  onPin,
  onDelete,
  onImage,
  children,
}) => {
  const channel = channelOf(post.channel);
  const own = !!post.isOwnPost;
  const canDelete = own || isAdmin;
  const canSolve = post.channel === 'QA_JAPANESE' && (own || isAdmin);
  const admin = post.authorRole === 'ADMIN';
  const images = post.attachments.filter((a) => a.fileType === 'IMAGE');
  const files = post.attachments.filter((a) => a.fileType !== 'IMAGE');
  const headingId = `fm-t-${post.id}`;
  const bodyId = `fm-b-${post.id}`;

  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: PointerEvent) => !menuRef.current?.contains(e.target as Node) && setMenu(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenu(false);
    document.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu]);
  const run = (action: () => void) => {
    setMenu(false);
    action();
  };

  return (
    <article className={`fm-post ${open ? 'open' : ''}`} aria-labelledby={headingId}>
      <header className="fm-post-h">
        <ForumAvatar name={post.authorName} src={post.authorAvatar} anonymous={post.isAnonymous} admin={admin} mine={own} />
        <div className="who">
          <p className="n">
            <span className="nm">{post.authorName}</span>
            {admin ? (
              <Badge tone="ai" icon="shield_person">
                Admin
              </Badge>
            ) : (
              !post.isAnonymous && <JlptBadge level={post.authorLevel as Jlpt} size="sm" />
            )}
            {own && <span className="me">{post.isAnonymous ? '(bạn, đăng ẩn danh)' : '(bạn)'}</span>}
          </p>
          <p className="m">
            <time dateTime={post.createdAt}>{timeAgo(post.createdAt)}</time>
            <span aria-hidden="true">·</span>
            <span className="fm-ch fm-chip" style={channelStyle(post.channel)}>
              <Icon name={channel.icon} size={16} />
              {channel.label}
            </span>
          </p>
        </div>
        {(isAdmin || canDelete) && (
          <div className="fm-menu" ref={menuRef}>
            <IconButton icon="more_horiz" label="Tuỳ chọn bài" aria-expanded={menu} onClick={() => setMenu((v) => !v)} />
            {menu && (
              <div className="fm-pop" role="menu" aria-label="Tuỳ chọn bài">
                {isAdmin && (
                  <button type="button" role="menuitem" onClick={() => run(onPin)}>
                    <Icon name={post.isPinned ? 'keep_off' : 'push_pin'} size={20} />
                    {post.isPinned ? 'Bỏ ghim' : 'Ghim lên đầu'}
                  </button>
                )}
                {canDelete && (
                  <button type="button" role="menuitem" className="danger" onClick={() => run(onDelete)}>
                    <Icon name="delete" size={20} />
                    Xoá bài
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </header>

      {(post.isPinned || (post.isSolved && post.channel === 'QA_JAPANESE')) && (
        <div className="fm-tags">
          {post.isPinned && (
            <Badge tone="shu" icon="push_pin">
              Đã ghim
            </Badge>
          )}
          {post.isSolved && post.channel === 'QA_JAPANESE' && (
            <Badge tone="success" icon="check_circle">
              Đã giải đáp
            </Badge>
          )}
        </div>
      )}

      <h3 className="fm-title" id={headingId}>
        <button type="button" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          {post.title}
        </button>
      </h3>
      <div className="fm-content" id={bodyId}>
        <p className="fm-text">{post.content}</p>
        {images.length > 0 && (
          <div className="fm-imgs">
            {images.map((a) => (
              <button key={a.id} type="button" className="fm-img" onClick={() => onImage(a)} aria-label={`Xem ảnh ${a.fileName}`}>
                <img src={a.url} alt="" loading="lazy" />
                <span className="zoom" aria-hidden="true">
                  <Icon name="zoom_in" size={18} />
                </span>
              </button>
            ))}
          </div>
        )}
        {files.length > 0 && (
          <ul className="fm-files">
            {files.map((a) => {
              const kind = fileKind(a.fileName);
              return (
                <li key={a.id} className="fm-file">
                  <span className={`ft ${kind.style ? 'wood' : ''}`} style={kind.style} aria-hidden="true">
                    <Icon name={kind.icon} size={20} />
                  </span>
                  <span className="fx">
                    <span className="fn">{a.fileName}</span>
                    <span className="fs">{`${kind.label} · ${formatFileSize(a.fileSize)}`}</span>
                  </span>
                  <a className="jc-iconbtn jc-iconbtn--ghost jc-iconbtn--sm" href={a.url} target="_blank" rel="noreferrer" aria-label={`Tải ${a.fileName}`} title="Tải về">
                    <Icon name="download" size={18} />
                  </a>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="fm-actions">
        <button
          type="button"
          className={`fm-act ${post.upvotedByMe ? 'on' : ''}`}
          aria-pressed={!!post.upvotedByMe}
          aria-label={`Thích bài này. ${post.upvotes} lượt thích`}
          onClick={onLike}
        >
          <Icon name="thumb_up" size={20} fill={post.upvotedByMe} />
          {post.upvotes}
        </button>
        <button type="button" className="fm-act" aria-label={`${post.comments.length} bình luận`} onClick={onToggle}>
          <Icon name="chat_bubble" size={20} />
          {post.comments.length}
        </button>
        {canSolve && (
          <button type="button" className={`fm-act solve ${post.isSolved ? 'on' : ''}`} aria-pressed={!!post.isSolved} onClick={onSolve}>
            <Icon name="task_alt" size={20} />
            {post.isSolved ? 'Đã giải đáp' : 'Đánh dấu đã giải đáp'}
          </button>
        )}
        <span className="fm-sp" />
        <button type="button" className="fm-act open-btn" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
          <span>{open ? 'Thu gọn' : 'Xem bài'}</span>
          <Icon name={open ? 'expand_less' : 'expand_more'} size={20} />
        </button>
      </footer>

      {open && children}
    </article>
  );
};
