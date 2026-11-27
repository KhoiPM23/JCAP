import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { SegmentedControl } from '../../components/jcap';
import { ConversationHistoryView } from '../ConversationHistoryView';
import { ShadowingHistoryPanel } from '../shadowing/ShadowingHistoryPanel';

type ResultsTab = 'roleplay' | 'shadowing';

/**
 * Trang Kết quả (/roleplay/results): một nút chuyển nhỏ giữa kết quả Hội thoại AI và lịch sử luyện Shadowing.
 * Tab đang xem nằm trên URL (?tab=shadowing) để link từ trang Shadowing mở đúng tab và nút Back hoạt động.
 * Phần Hội thoại AI giữ nguyên ConversationHistoryView.
 */
export const ResultsView: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: ResultsTab = searchParams.get('tab') === 'shadowing' ? 'shadowing' : 'roleplay';

  const changeTab = (next: string) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'shadowing') params.set('tab', 'shadowing');
    else params.delete('tab');
    setSearchParams(params);
  };

  return (
    <div className="jx-touch-page mx-auto flex w-full max-w-5xl flex-col gap-6 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="m-0 text-[28px] font-bold leading-[38px] text-sumi">Kết quả</h1>
          <p className="m-0 text-[15px] leading-6 text-sumi-muted">Xem lại các buổi đã luyện và điểm của từng buổi.</p>
        </div>
        <SegmentedControl
          className="jx-mobile-wrap"
          ariaLabel="Chọn loại kết quả"
          value={tab}
          onChange={changeTab}
          options={[
            { value: 'roleplay', label: 'Hội thoại AI', icon: 'forum' },
            { value: 'shadowing', label: 'Shadowing', icon: 'record_voice_over' },
          ]}
        />
      </div>

      {tab === 'shadowing' ? <ShadowingHistoryPanel /> : <ConversationHistoryView />}
    </div>
  );
};
