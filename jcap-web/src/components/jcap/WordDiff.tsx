import React from 'react';
import { Icon } from './Icon';
import { cx } from './utils';

export type DiffError = 'chouon' | 'sokuon' | 'hatsuon' | 'dakuon' | 'mora' | 'particle' | 'word' | 'extra';

export interface DiffToken {
  text: string;
  reading?: string;
  status?: 'ok' | 'wrong' | 'missing' | 'extra';
  error?: DiffError;
  /** Chữ đúng (sai: hiện "Đúng: …"; thiếu: hiện thay cho text) */
  expected?: string;
}

export interface WordDiffProps {
  tokens: DiffToken[];
  showLegend?: boolean;
  className?: string;
}

const ERR: Record<DiffError, string> = {
  chouon: 'Trường âm',
  sokuon: 'Âm ngắt っ',
  hatsuon: 'Âm mũi ん',
  dakuon: 'Hữu thanh ゛',
  mora: 'Số mora',
  particle: 'Trợ từ',
  word: 'Sai từ',
  extra: 'Thừa âm',
};
const ICON = { ok: 'check', wrong: 'close', missing: 'remove', extra: 'add' } as const;
const FALLBACK = { wrong: 'Sai', missing: 'Thiếu', extra: 'Thừa' } as const;

/** So từng từ của câu đã nói với câu mẫu (đúng / sai / thiếu / thừa), kèm loại lỗi phát âm */
export const WordDiff: React.FC<WordDiffProps> = ({ tokens, showLegend, className }) => (
  <div className={cx('jc-diff', className)}>
    <div className="jc-diff__row" lang="ja">
      {tokens.map((t, i) => {
        const s = t.status || 'ok';
        return (
          <span key={i} className={cx('jc-diff__tok', `is-${s}`)} title={s !== 'ok' && t.error ? ERR[t.error] : undefined}>
            {t.reading && <span className="jc-diff__reading">{t.reading}</span>}
            <span className="jc-diff__text">{s === 'missing' ? t.expected || t.text : t.text}</span>
            {s !== 'ok' && (
              <span className="jc-diff__tag" lang="vi">
                <Icon name={ICON[s]} size={12} />
                {t.error ? ERR[t.error] : FALLBACK[s]}
              </span>
            )}
            {s === 'wrong' && t.expected && (
              <span className="jc-diff__expected" lang="vi">
                {'Đúng: '}
                <span lang="ja">{t.expected}</span>
              </span>
            )}
          </span>
        );
      })}
    </div>
    {showLegend !== false && (
      <ul className="jc-diff__legend">
        {(['ok', 'wrong', 'missing', 'extra'] as const).map((s) => (
          <li key={s} className={`is-${s}`}>
            <span className="jc-diff__sw">
              <Icon name={ICON[s]} size={12} />
            </span>
            {s === 'ok' ? 'Đúng' : FALLBACK[s]}
          </li>
        ))}
      </ul>
    )}
  </div>
);
