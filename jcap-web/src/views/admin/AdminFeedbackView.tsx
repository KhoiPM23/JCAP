import React from 'react';
import { SupportDesk } from '../../components/support/SupportDesk';

/** Quản trị hỗ trợ (/admin/feedback): người gửi chỉ hiện bằng mã ẩn danh */
export const AdminFeedbackView: React.FC = () => <SupportDesk viewer="admin" theme="quan-tri" />;
