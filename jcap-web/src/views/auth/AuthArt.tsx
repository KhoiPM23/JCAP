import React from 'react';
import { DemoStamp, InkFilter, MAINLAND, MAP_VB_ATTR } from '../landing/landingArt';

/**
 * Nửa trái của các trang đăng nhập/đăng ký: bản đồ Nhật vẽ từ PREFECTURES với 4 ghim 宿 食 駅 医 và 3 con dấu minh hoạ.
 * Tải lazy (kéo theo dữ liệu 47 tỉnh) để không làm nặng bundle chính.
 */
const PINS: { ch: string; x: number; y: number }[] = [
  { ch: '宿', x: 1626, y: 168 },
  { ch: '駅', x: 1415, y: 1027 },
  { ch: '食', x: 1076, y: 1114 },
  { ch: '医', x: 708, y: 1237 },
];

const AuthArt: React.FC = () => (
  <>
    <InkFilter />
    <svg className="amap" viewBox={MAP_VB_ATTR} aria-hidden="true">
      {MAINLAND.map((p) => (
        <path key={p.id} d={p.d} fillRule="evenodd" />
      ))}
      {PINS.map((p) => (
        <g key={p.ch}>
          <circle cx={p.x} cy={p.y} r={40} fill="var(--ai)" stroke="var(--paper-50)" strokeWidth={8} />
          <text x={p.x} y={p.y + 14} textAnchor="middle" fontSize={40} fontWeight={700} fill="var(--on-ai)">
            {p.ch}
          </text>
        </g>
      ))}
    </svg>
    <span className="stk" style={{ left: 64, top: 170 }}>
      <DemoStamp kind="konbini" size={112} rotate={-8} />
    </span>
    <span className="stk" style={{ left: 210, top: 250 }}>
      <DemoStamp kind="eki" size={96} rotate={6} />
    </span>
    <span className="stk" style={{ left: 96, top: 330 }}>
      <DemoStamp kind="shokudo" size={100} rotate={-4} />
    </span>
  </>
);

export default AuthArt;
