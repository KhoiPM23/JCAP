import React from 'react';
import { parseRuby } from './rubyText';
import { cx } from './utils';

export interface JpTextProps {
  /** Cú pháp {漢字|かんじ} cho furigana */
  text: string;
  furigana?: boolean;
  size?: 'sm' | 'md' | 'lg';
  romaji?: string;
  as?: React.ElementType;
  className?: string;
}

/** Câu tiếng Nhật có furigana (lang="ja"); furigana = false thì ẩn phần đọc nhưng vẫn giữ trong DOM */
export const JpText: React.FC<JpTextProps> = ({ text, furigana, size = 'md', romaji, as: Tag = 'span', className }) => (
  <Tag lang="ja" className={cx('jc-jp', `jc-jp--${size}`, furigana === false && 'no-furi', className)}>
    {parseRuby(text || '').map((seg, i) =>
      typeof seg === 'string' ? (
        <React.Fragment key={i}>{seg}</React.Fragment>
      ) : (
        <ruby key={i}>
          {seg.base}
          <rp>(</rp>
          <rt>{seg.reading}</rt>
          <rp>)</rp>
        </ruby>
      ),
    )}
    {romaji && (
      <span className="jc-jp__romaji" lang="ja-Latn">
        {romaji}
      </span>
    )}
  </Tag>
);
