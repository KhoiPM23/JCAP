import React from 'react';
import { Button } from '../jcap';
import { ForumAvatar } from './ForumAvatar';

/** Ô đăng nhanh: nút đăng bài duy nhất trên máy tính; bấm chỗ nào cũng mở khung soạn bài */
export const QuickComposer: React.FC<{ name: string; avatar?: string; admin?: boolean; onOpen: () => void }> = ({
  name,
  avatar,
  admin,
  onOpen,
}) => (
  <div className="fm-quick" onClick={onOpen}>
    <ForumAvatar name={name} src={avatar} admin={admin} mine size="sm" />
    {/* Hai nút để dùng được bằng bàn phím; bấm vào đâu trong viên cũng mở nhờ onClick ở khung */}
    <button type="button" className="fm-qbtn" aria-label="Đăng bài thảo luận: đặt câu hỏi, chia sẻ mẹo hoặc tài liệu">
      Bạn muốn hỏi hay chia sẻ điều gì?
    </button>
    <Button variant="primary" size="sm" icon="edit_square">
      Đăng bài
    </Button>
  </div>
);
