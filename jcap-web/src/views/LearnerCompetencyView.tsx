import React from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../components/jcap';
import { LearnerIntelligenceRadarCard } from '../components/roleplay/LearnerIntelligenceRadarCard';

/**
 * Trang Năng lực cá nhân chuyên biệt (tách khỏi Hồ sơ tài khoản theo yêu cầu điều hướng dropdown).
 * Tái sử dụng trọn vẹn LearnerIntelligenceRadarCard trên nền Washi / theme chung từ LearnerShell.
 */
export const LearnerCompetencyView: React.FC = () => {
  return (
    <div className="mx-auto flex max-w-[1040px] flex-col gap-5 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex items-center gap-1.5 text-sm text-sumi-muted" aria-label="Điều hướng phân cấp">
          <Link to="/profile" className="inline-flex items-center gap-1 font-medium hover:text-ai transition-colors">
            <Icon name="person" size={16} />
            <span>Hồ sơ</span>
          </Link>
          <span aria-hidden="true" className="text-sumi-faint">›</span>
          <span className="font-semibold text-sumi">Năng lực cá nhân</span>
        </nav>

        <div className="flex items-center gap-2">
          <Link
            to="/roleplay/results"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper-50 px-3 py-1.5 text-xs font-semibold text-sumi hover:border-ai/40 hover:text-ai transition-colors"
          >
            <Icon name="history" size={15} />
            <span>Lịch sử hội thoại</span>
          </Link>
          <Link
            to="/profile"
            className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-paper-50 px-3 py-1.5 text-xs font-semibold text-sumi hover:border-ai/40 hover:text-ai transition-colors"
          >
            <Icon name="arrow_back" size={15} />
            <span>Quay lại Hồ sơ</span>
          </Link>
        </div>
      </div>

      <LearnerIntelligenceRadarCard />
    </div>
  );
};
