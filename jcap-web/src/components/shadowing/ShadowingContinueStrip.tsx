import React from 'react';
import { Button, Icon } from '../jcap';
import type { ShadowingProgress } from '../../types/shadowingProgress';

/** Dải "Đang học dở": tên bài, câu đang dừng, nút tiếp tục và vạch tiến độ ở mép dưới */
export const ShadowingContinueStrip: React.FC<{ progress: ShadowingProgress; title: string; onResume: () => void }> = ({
  progress,
  title,
  onResume,
}) => {
  const sentence = progress.currentSentenceIndex + 1;
  const ratio = Math.min(1, progress.completedSentenceCount / Math.max(1, progress.totalSentenceCount));
  return (
    <section className="shl-continue" aria-label="Bài đang học dở">
      <div className="l">
        <p className="k">
          <Icon name="pending" size={16} />
          Đang học dở
          <span>{[progress.jlptLevel, `Vai ${progress.role}`].filter(Boolean).join(' · ')}</span>
        </p>
        <h2>{title}</h2>
      </div>
      {progress.currentSentenceText && (
        <div className="s">
          <p>{`Bạn dừng ở câu ${sentence}/${progress.totalSentenceCount}`}</p>
          <p className="jp" lang="ja">
            {progress.currentSentenceText}
          </p>
        </div>
      )}
      <Button variant="primary" icon="play_arrow" onClick={onResume} aria-label={`Tiếp tục câu ${sentence} của bài ${title}`}>
        {`Tiếp tục câu ${sentence}`}
      </Button>
      <span className="bar" role="progressbar" aria-label="Tiến độ bài đang dở" aria-valuemin={0} aria-valuemax={progress.totalSentenceCount} aria-valuenow={progress.completedSentenceCount}>
        <i style={{ transform: `scaleX(${ratio})` }} />
      </span>
    </section>
  );
};
