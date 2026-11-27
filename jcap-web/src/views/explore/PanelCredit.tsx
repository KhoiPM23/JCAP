import React from 'react';
import { PICTOGRAM_CREDIT } from '../../data/japanPictograms';
import { BOUNDARY_CREDIT } from './prefectureDetail';

/** Ghi nguồn cố định ở đáy ngăn tỉnh, dưới nút chính (điều khoản của bộ biểu tượng và dữ liệu ranh giới) */
export const PanelCredit: React.FC = () => (
  <p className="jm-pp-credit">
    Nguồn:{' '}
    <a href={PICTOGRAM_CREDIT.url} target="_blank" rel="noopener noreferrer" title={PICTOGRAM_CREDIT.text}>
      {PICTOGRAM_CREDIT.short}
    </a>
    {' · '}
    <a href={BOUNDARY_CREDIT.url} target="_blank" rel="noopener noreferrer" title={BOUNDARY_CREDIT.text}>
      {BOUNDARY_CREDIT.short}
    </a>
  </p>
);
