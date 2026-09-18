import React, { useState } from 'react';
import { Link } from 'react-router-dom';

// Cấu trúc dữ liệu của một Tình huống (Scenario)
export interface Scenario {
  id: number;
  title: string;
  japaneseTitle: string;
  level: string;
  category: string;
  aiRole: string;
  description: string;
  tasksCount: number;
}

interface ScenarioListViewProps {
  userEmail: string;
  userLevel: string;
  onSelectScenario: (scenario: Scenario) => void;
  onLogout: () => void;
}

// Danh sách dữ liệu kịch bản giả lập (Mock Data)
const MOCK_SCENARIOS: Scenario[] = [
  {
    id: 1,
    title: 'Gọi món tại quán mì Ramen',
    japaneseTitle: 'ラーメン屋での注文',
    level: 'N5',
    category: 'Đời sống hằng ngày',
    aiRole: 'Nhân viên quán Ramen (店員)',
    description: 'Thực hành chào hỏi, gọi một bát Tonkotsu Ramen, yêu cầu thêm trứng và xin nước lọc.',
    tasksCount: 3,
  },
  {
    id: 2,
    title: 'Hỏi đường đi tàu điện tại ga Shinjuku',
    japaneseTitle: '新宿駅で道を尋ねる',
    level: 'N4',
    category: 'Giao thông & Di chuyển',
    aiRole: 'Nhân viên nhà ga (駅員)',
    description: 'Hỏi cách mua vé và đổi tuyến tàu đi Asakusa bằng ngôn ngữ lịch sự丁寧語 (Teineigo).',
    tasksCount: 4,
  },
  {
    id: 3,
    title: 'Phỏng vấn xin việc làm thêm (Baito)',
    japaneseTitle: 'アルバイトの面接',
    level: 'N3',
    category: 'Công việc & Phỏng vấn',
    aiRole: 'Chủ cửa hàng tiện lợi (店長)',
    description: 'Tự giới thiệu bản thân, trình bày kinh nghiệm và sử dụng kính ngữ khiêm nhường (Kenjougo).',
    tasksCount: 4,
  },
];

export const ScenarioListView: React.FC<ScenarioListViewProps> = ({
  userEmail,
  userLevel,
  onSelectScenario,
  onLogout,
}) => {
  const [filterLevel, setFilterLevel] = useState<string>('ALL');

  // Lọc kịch bản theo tab đã bấm
  const filteredScenarios =
    filterLevel === 'ALL'
      ? MOCK_SCENARIOS
      : MOCK_SCENARIOS.filter((s) => s.level === filterLevel);

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Thanh Header trên cùng */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-red-600 text-white font-bold rounded-xl flex items-center justify-center">
              J
            </div>
            <span className="font-bold text-slate-800 text-lg">JCAP Nihongo</span>
          </div>

          <div className="flex items-center space-x-4">
            {/* Hiển thị số dư Credit - Bấm để chuyển đến trang nạp Credits */}
            <Link
              to="/credits"
              className="bg-amber-50 hover:bg-amber-100 text-amber-700 px-3 py-1.5 rounded-full text-xs font-bold border border-amber-200 transition-all flex items-center gap-1.5 shadow-sm hover:shadow active:scale-95 cursor-pointer"
              title="Xem chi tiết số dư & nạp thêm Credits"
            >
              <span>🪙</span>
              <span>Credits</span>
            </Link>
            {/* Thông tin user */}
            <div className="text-right hidden sm:block">
              <p className="text-xs font-semibold text-slate-800">{userEmail}</p>
              <p className="text-[11px] text-red-600 font-bold">Mục tiêu: {userLevel}</p>
            </div>
            {/* Nút thoát */}
            <button
              onClick={onLogout}
              className="text-xs text-slate-500 hover:text-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 transition"
            >
              Đăng xuất
            </button>
          </div>
        </div>
      </header>

      {/* Nội dung chính */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">Thư viện Tình huống Luyện nói</h1>
            <p className="text-slate-500 text-sm mt-1">
              Chọn một kịch bản để bắt đầu hội thoại tương tác với AI Persona.
            </p>
          </div>

          {/* Bộ lọc theo Level */}
          <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  filterLevel === lvl
                    ? 'bg-red-600 text-white shadow'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {lvl === 'ALL' ? 'Tất cả' : lvl}
              </button>
            ))}
          </div>
        </div>

        {/* Danh sách các Thẻ Tình huống (Cards) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredScenarios.map((scenario) => (
            <div
              key={scenario.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      scenario.level === 'N5'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : scenario.level === 'N4'
                        ? 'bg-blue-50 text-blue-700 border border-blue-200'
                        : 'bg-purple-50 text-purple-700 border border-purple-200'
                    }`}
                  >
                    JLPT {scenario.level}
                  </span>
                  <span className="text-xs text-slate-400 font-medium">
                    {scenario.tasksCount} nhiệm vụ
                  </span>
                </div>

                <h3 className="font-bold text-slate-800 text-lg leading-snug">
                  {scenario.title}
                </h3>
                <p className="text-xs text-red-600 font-medium mt-0.5 mb-3">
                  {scenario.japaneseTitle}
                </p>

                <p className="text-xs text-slate-500 line-clamp-3 mb-4 leading-relaxed">
                  {scenario.description}
                </p>

                <div className="bg-slate-50 rounded-xl p-2.5 text-xs text-slate-600 mb-6 border border-slate-100">
                  <span className="font-semibold text-slate-700">AI đóng vai:</span>{' '}
                  {scenario.aiRole}
                </div>
              </div>

              <button
                onClick={() => onSelectScenario(scenario)}
                className="w-full py-2.5 bg-slate-900 hover:bg-red-600 text-white text-xs font-bold rounded-xl transition shadow"
              >
                Bắt đầu Luyện nói ➔
              </button>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
};

