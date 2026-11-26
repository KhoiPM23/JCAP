import React from 'react';
import { Icon } from '../jcap';
import type { RegionId } from '../../data/japanMap';
import { woodStyle } from './channels';

/** Màu avatar chữ cái, chọn cố định theo tên */
const TONES: RegionId[] = ['chugoku', 'kansai', 'chubu', 'kanto', 'hokkaido'];
const toneOf = (name: string) => TONES[[...name].reduce((n, ch) => n + ch.charCodeAt(0), 0) % TONES.length];

export const ForumAvatar: React.FC<{
  name: string;
  src?: string;
  anonymous?: boolean;
  admin?: boolean;
  /** Avatar của chính mình */
  mine?: boolean;
  size?: 'sm' | 'md';
}> = ({ name, src, anonymous, admin, mine, size = 'md' }) => {
  const cls = `fm-av ${size === 'sm' ? 'sm' : ''}`;
  if (anonymous)
    return (
      <span className={`${cls} anon`} aria-hidden="true">
        <Icon name="person" size={size === 'sm' ? 18 : 22} />
      </span>
    );
  if (src) return <img className={cls} src={src} alt="" />;
  const tone = admin ? 'admin' : mine ? 'mine' : 'wood';
  return (
    <span className={`${cls} ${tone}`} style={tone === 'wood' ? woodStyle(toneOf(name)) : undefined} aria-hidden="true">
      {[...name.trim()][0]?.toUpperCase() ?? '?'}
    </span>
  );
};
