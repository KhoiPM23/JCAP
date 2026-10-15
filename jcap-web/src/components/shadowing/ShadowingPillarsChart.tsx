import React from 'react';

interface ShadowingPillarsChartProps {
  contentMatchScore: number; // 60%
  fluencyScore: number; // 40%
  overallScore?: number; // 60% * match + 40% * fluency
  gateStatus?: 'good' | 'acceptable' | 'needs_retry';
  gateLabel?: string;
  className?: string;
}

export const ShadowingPillarsChart: React.FC<ShadowingPillarsChartProps> = ({
  contentMatchScore,
  fluencyScore,
  overallScore,
  gateStatus = 'good',
  gateLabel = 'Tín hiệu rõ nét',
  className = '',
}) => {
  const calculatedOverall =
    overallScore ?? Math.round(contentMatchScore * 0.60 + fluencyScore * 0.40);

  const getRank = (score: number) => {
    if (score >= 90) return { rank: 'S', label: 'Xuất sắc', color: 'emerald' };
    if (score >= 80) return { rank: 'A', label: 'Lưu loát', color: 'blue' };
    if (score >= 65) return { rank: 'B', label: 'Đạt chuẩn', color: 'amber' };
    return { rank: 'C', label: 'Cần luyện thêm', color: 'rose' };
  };

  const rankInfo = getRank(calculatedOverall);

  return (
    <div className={`p-4 bg-white rounded-2xl border border-[#E6EDF5] shadow-2xs space-y-4 ${className}`}>
      {/* Header: 2 Trụ cột cốt lõi */}
      <div className="flex items-center justify-between pb-3 border-b border-[#E6EDF5]">
        <div>
          <h4 className="text-xs font-extrabold text-[#071A44] uppercase tracking-wider flex items-center gap-1.5">
            <span>📊</span>
            <span>Mô hình đánh giá 2 Trụ cột cốt lõi</span>
          </h4>
          <p className="text-[11px] text-[#556987] mt-0.5">
            Chuẩn khoa học ngữ âm tiếng Nhật: <strong className="text-[#071A44]">60% Khớp nội dung</strong> + <strong className="text-[#071A44]">40% Lưu loát</strong>
          </p>
        </div>
        <div className="text-right">
          <span className="text-[10px] text-slate-400 font-bold block uppercase">Điểm tổng kết</span>
          <span className="text-xl font-black text-[#0878EE] leading-none">
            {calculatedOverall}%
          </span>
        </div>
      </div>

      {/* 2 Main Pillar Progress Bars */}
      <div className="space-y-3.5">
        {/* Pillar 1: Content Match (60%) */}
        <div className="p-3 bg-gradient-to-r from-blue-50/60 to-indigo-50/40 rounded-xl border border-blue-100/80">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <div className="flex items-center gap-1.5 font-black text-[#071A44]">
              <span className="text-base">🎯</span>
              <span>Khớp nội dung & Chữ viết (Content Match)</span>
              <span className="bg-[#0878EE] text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                Trọng số 60%
              </span>
            </div>
            <span className="font-black text-[#0878EE] text-sm">{contentMatchScore}%</span>
          </div>
          <div className="w-full bg-blue-100/70 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-[#0878EE] to-[#005bb5] h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, contentMatchScore))}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-[#556987] mt-1.5 flex items-center justify-between">
            <span>So khớp từ vựng, trợ từ (に/へ/で/を) và thể chia theo câu mẫu.</span>
            <span className="font-semibold text-slate-500 text-[10px]">
              {contentMatchScore >= 85 ? '🟢 Rất chuẩn' : contentMatchScore >= 65 ? '🟡 Khá tốt' : '🔴 Cần luyện thêm'}
            </span>
          </p>
        </div>

        {/* Pillar 2: Fluency (40%) */}
        <div className="p-3 bg-gradient-to-r from-teal-50/60 to-emerald-50/40 rounded-xl border border-teal-100/80">
          <div className="flex justify-between items-center text-xs mb-1.5">
            <div className="flex items-center gap-1.5 font-black text-[#071A44]">
              <span className="text-base">⚡</span>
              <span>Độ trôi chảy & Ngắt nghỉ (Fluency)</span>
              <span className="bg-teal-600 text-white text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
                Trọng số 40%
              </span>
            </div>
            <span className="font-black text-teal-700 text-sm">{fluencyScore}%</span>
          </div>
          <div className="w-full bg-teal-100/70 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-teal-500 to-emerald-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, fluencyScore))}%` }}
            ></div>
          </div>
          <p className="text-[11px] text-[#556987] mt-1.5 flex items-center justify-between">
            <span>Đo lường thời lượng nói thực tế, hạn chế ngập ngừng kéo dài &gt; 1.2s.</span>
            <span className="font-semibold text-slate-500 text-[10px]">
              {fluencyScore >= 85 ? '🟢 Liền mạch' : fluencyScore >= 65 ? '🟡 Ổn định' : '🔴 Ngập ngừng'}
            </span>
          </p>
        </div>
      </div>

      {/* Footer Info: AI Multimodal Intonation Note */}
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200/80 flex items-start gap-2 text-[11px] text-[#556987]">
        <span className="text-sm mt-0.5">💡</span>
        <div className="leading-relaxed">
          <strong className="text-[#071A44]">Lưu ý khoa học:</strong> Ngữ điệu tiếng Nhật (Pitch Accent, trọng âm cao thấp, sắc thái) không đo bằng đường cong thô mà được AI Gemini Multimodal chẩn đoán chuyên sâu theo báo cáo bên dưới.
        </div>
      </div>
    </div>
  );
};

