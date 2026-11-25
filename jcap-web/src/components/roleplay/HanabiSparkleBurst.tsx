import React, { useEffect, useMemo } from 'react';

interface HanabiSparkleBurstProps {
  className?: string;
  count?: number;
  label?: string;
  text?: string;
  active?: boolean;
  onComplete?: () => void;
}

interface Particle {
  id: number;
  tx: string;
  ty: string;
  size: number;
  color: string;
  delay: string;
  shape: 'star' | 'circle' | 'petal';
}

const GOLD_PALETTE = [
  '#F59E0B', // amber-500
  '#FBBF24', // amber-400
  '#FDE047', // yellow-300
  '#F43F5E', // rose-500
  '#FB7185', // rose-400
  '#10B981', // emerald-500
  '#38BDF8', // sky-400
];

export const HanabiSparkleBurst: React.FC<HanabiSparkleBurstProps> = ({
  className = '',
  count = 18,
  label = '見事！ Xuất sắc',
  text,
  active = true,
  onComplete,
}) => {
  const displayLabel = text || label;

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => {
      onComplete?.();
    }, 2800);
    return () => clearTimeout(timer);
  }, [active, onComplete]);

  if (!active) return null;
  const particles = useMemo<Particle[]>(() => {
    return Array.from({ length: count }, (_, i) => {
      const angle = (i / count) * 2 * Math.PI + (Math.random() - 0.5) * 0.4;
      const distance = 40 + Math.random() * 90;
      const tx = `${Math.cos(angle) * distance}px`;
      const ty = `${Math.sin(angle) * distance - 20}px`;
      const size = 5 + Math.floor(Math.random() * 8);
      const color = GOLD_PALETTE[i % GOLD_PALETTE.length];
      const delay = `${(i * 35)}ms`;
      const shape = i % 3 === 0 ? 'star' : i % 3 === 1 ? 'petal' : 'circle';

      return { id: i, tx, ty, size, color, delay, shape };
    });
  }, [count]);

  return (
    <div
      className={`pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      <div className="relative flex items-center justify-center">
        {/* Central Celebratory Badge */}
        {displayLabel && (
          <div className="animate-modal-pop rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-1.5 text-xs font-black text-white shadow-xl border border-amber-300/80 flex items-center gap-1.5 z-10 animate-pulse">
            <span className="text-xs font-serif font-bold text-amber-300">祝</span>
            <span className="font-serif font-black tracking-wide">{displayLabel}</span>
          </div>
        )}

        {/* Floating Sparks */}
        {particles.map((p) => (
          <span
            key={p.id}
            className="animate-hanabi-sparkle absolute left-1/2 top-1/2"
            style={
              {
                '--tx': p.tx,
                '--ty': p.ty,
                width: `${p.size}px`,
                height: `${p.size}px`,
                backgroundColor: p.shape === 'circle' ? p.color : undefined,
                color: p.color,
                borderRadius: p.shape === 'circle' ? '50%' : p.shape === 'petal' ? '40% 60% 70% 30% / 40% 50% 60% 50%' : undefined,
                animationDelay: p.delay,
                boxShadow: `0 0 8px ${p.color}`,
              } as React.CSSProperties
            }
          >
            {p.shape === 'star' && (
              <svg viewBox="0 0 24 24" fill={p.color} className="w-full h-full">
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            )}
            {p.shape === 'petal' && (
              <span
                className="block w-full h-full"
                style={{ backgroundColor: p.color, borderRadius: '50% 0 50% 0' }}
              />
            )}
          </span>
        ))}
      </div>
    </div>
  );
};
