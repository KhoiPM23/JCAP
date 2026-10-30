import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { scenarioService } from '../services/scenarioService';
import { roleplayService } from '../services/roleplayService';
import { ukiyoSound } from '../utils/ukiyoSoundEngine';
import { LivingAvatar } from '../components/roleplay/LivingAvatar';
import {
  GourmetIcon,
  TransitIcon,
  ShoppingIcon,
  BriefcaseIcon,
  LifeIcon,
  CompassIcon,
  SearchIcon,
  TargetIcon,
  SparkIcon,
  VolumeIcon,
  BookmarkIcon,
  ArrowRightIcon,
  AlertCircleIcon,
  ListTodoIcon,
} from '../components/common/Icons';
import type { ScenarioListItem, ScenarioDetails, ScenarioLevelConfiguration } from '../types/scenarioDetails';
import type { LearnerIntelligenceProfileDto, ActiveRoleplaySessionDto } from '../types/roleplay';

export interface Scenario {
  id: number;
  title: string;
  japaneseTitle?: string;
  level: string;
  category?: string;
  aiRole?: string;
  description: string;
  tasksCount?: number;
  thumbnail?: string;
  scenarioCode?: string;
  supportedJLPTLevels: string[];
}

interface ScenarioListViewProps {
  userEmail?: string;
  userLevel?: string;
  onSelectScenario: (scenario: Scenario) => void;
  onLogout?: () => void;
}

export const renderCategoryIcon = (key: string, className = 'w-4 h-4') => {
  switch (key) {
    case 'gourmet': return <GourmetIcon className={className} />;
    case 'transit': return <TransitIcon className={className} />;
    case 'shopping': return <ShoppingIcon className={className} />;
    case 'business': return <BriefcaseIcon className={className} />;
    case 'life': return <LifeIcon className={className} />;
    default: return <CompassIcon className={className} />;
  }
};

export function getScenarioCategory(item: ScenarioListItem): { key: string; label: string; icon: string } {
  // 1. Phân loại chuẩn xác theo mã kịch bản hệ thống
  const code = (item.scenarioCode || '').toUpperCase();
  if (code.startsWith('SCN_TRANSIT')) return { key: 'transit', label: 'Giao thông & Di chuyển', icon: '' };
  if (code.startsWith('SCN_KONBINI') || code.startsWith('SCN_SHOPPING')) return { key: 'shopping', label: 'Mua sắm & Tiện lợi', icon: '' };
  if (code.startsWith('SCN_OFFICE') || code.startsWith('SCN_BAITO') || code.startsWith('SCN_BUSINESS')) return { key: 'business', label: 'Công sở & Phỏng vấn', icon: '' };
  if (code.startsWith('SCN_CAFE') || code.startsWith('SCN_LIFE')) return { key: 'life', label: 'Đời sống & Giao tiếp', icon: '' };
  if (code.startsWith('SCN_RAMEN') || code.startsWith('SCN_GOURMET')) return { key: 'gourmet', label: 'Ẩm thực & Quán ăn', icon: '' };

  // 2. Fallback từ khóa ngữ nghĩa tiếng Việt chuẩn xác (tránh false positive như 'đường' trong 'ít đường' vs 'hỏi đường')
  const text = `${item.title} ${item.description}`.toLowerCase();
  if (
    text.includes('hỏi đường') ||
    text.includes('ga tàu') ||
    text.includes('nhà ga') ||
    text.includes('đi tàu') ||
    text.includes('chuyến tàu') ||
    text.includes('shinkansen') ||
    text.includes('sân bay') ||
    text.includes('vé tàu') ||
    text.includes('chuyến bay') ||
    text.includes('transit')
  ) {
    return { key: 'transit', label: 'Giao thông & Di chuyển', icon: '' };
  }
  if (
    text.includes('tiện lợi') ||
    text.includes('konbini') ||
    text.includes('7-eleven') ||
    text.includes('siêu thị') ||
    text.includes('shopping')
  ) {
    return { key: 'shopping', label: 'Mua sắm & Tiện lợi', icon: '' };
  }
  if (
    text.includes('phỏng vấn') ||
    text.includes('công sở') ||
    text.includes('xin việc') ||
    text.includes('baito') ||
    text.includes('văn phòng') ||
    text.includes('công ty') ||
    text.includes('đối tác') ||
    text.includes('hội nghị') ||
    text.includes('business') ||
    text.includes('office')
  ) {
    return { key: 'business', label: 'Công sở & Phỏng vấn', icon: '' };
  }
  if (
    text.includes('cà phê') ||
    text.includes('cafe') ||
    text.includes('harajuku') ||
    text.includes('bánh ngọt') ||
    text.includes('đời sống') ||
    text.includes('trà chiều')
  ) {
    return { key: 'life', label: 'Đời sống & Giao tiếp', icon: '' };
  }
  if (
    text.includes('ramen') ||
    text.includes('quán ăn') ||
    text.includes('gọi món') ||
    text.includes('ẩm thực') ||
    text.includes('nhà hàng') ||
    text.includes('gourmet')
  ) {
    return { key: 'gourmet', label: 'Ẩm thực & Quán ăn', icon: '' };
  }
  return { key: 'life', label: 'Đời sống & Giao tiếp', icon: '' };
}

export const ScenarioListView: React.FC<ScenarioListViewProps> = ({ onSelectScenario }) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const searchQuery = searchParams.get('query') || searchParams.get('search') || '';

  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [searchTerm, setSearchTerm] = useState<string>(searchQuery);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [filterCategory, setFilterCategory] = useState<string>('ALL');
  const [selectedScenarioId, setSelectedScenarioId] = useState<number | null>(null);
  const [selectedLevel, setSelectedLevel] = useState<string>('N5');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Thích ứng thông minh: Hồ sơ trí tuệ học viên ngầm (TikTok-style Profile)
  const [intelligenceProfile, setIntelligenceProfile] = useState<LearnerIntelligenceProfileDto | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState<boolean>(true);

  // Chi tiết kịch bản được chọn và phiên luyện tập dở dang
  const [scenarioDetailsCache, setScenarioDetailsCache] = useState<Record<number, ScenarioDetails>>({});
  const [activeSession, setActiveSession] = useState<ActiveRoleplaySessionDto | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);

  // 1. Tải danh sách kịch bản & Hồ sơ trí tuệ học viên
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      const [scenariosRes, profileRes] = await Promise.all([
        scenarioService.getScenarios(),
        roleplayService.getIntelligenceProfile().catch(() => ({ success: false, data: null })),
      ]);

      if (!isMounted) return;

      if (scenariosRes.success && scenariosRes.data) {
        setScenarios(scenariosRes.data);
        if (scenariosRes.data.length > 0) {
          const paramId = Number(searchParams.get('id'));
          const targetScenario = paramId ? scenariosRes.data.find(s => s.id === paramId) : null;
          const initial = targetScenario || scenariosRes.data[0];
          setSelectedScenarioId(initial.id);
          const firstLevel = initial.supportedJLPTLevels?.[0] || 'N5';
          setSelectedLevel(firstLevel);
        }
      } else {
        setError(scenariosRes.message || 'Không thể tải danh sách tình huống.');
      }

      if (profileRes.success && profileRes.data) {
        setIntelligenceProfile(profileRes.data);
      }
      setIsLoadingProfile(false);
      setLoading(false);
    };

    void fetchData();
    return () => {
      isMounted = false;
    };
  }, []);

  // 2. Tải chi tiết kịch bản và phiên dở dang khi chuyển đổi tình huống
  useEffect(() => {
    if (!selectedScenarioId) return;
    let isMounted = true;

    const loadSelectedDetails = async () => {
      // Kiểm tra phiên luyện tập dở dang
      void roleplayService.getActiveSession(selectedScenarioId).then((res) => {
        if (isMounted && res.success && res.data) {
          setActiveSession(res.data);
        } else if (isMounted) {
          setActiveSession(null);
        }
      });

      // Nếu đã có cache chi tiết kịch bản thì không fetch lại
      if (scenarioDetailsCache[selectedScenarioId]) {
        return;
      }

      setLoadingDetails(true);
      const res = await scenarioService.getDetails(selectedScenarioId);
      if (isMounted && res.success && res.data) {
        setScenarioDetailsCache((prev) => ({
          ...prev,
          [selectedScenarioId]: res.data!,
        }));
      }
      if (isMounted) setLoadingDetails(false);
    };

    void loadSelectedDetails();
    return () => {
      isMounted = false;
    };
  }, [selectedScenarioId]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    const newParams = new URLSearchParams(searchParams);
    if (val.trim()) {
      newParams.set('query', val.trim());
    } else {
      newParams.delete('query');
      newParams.delete('search');
    }
    setSearchParams(newParams, { replace: true });
  };

  const filteredScenarios = scenarios
    .filter((scenario) => {
      if (filterLevel !== 'ALL' && !scenario.supportedJLPTLevels?.includes(filterLevel)) {
        return false;
      }
      if (filterCategory !== 'ALL') {
        const cat = getScenarioCategory(scenario);
        if (cat.key !== filterCategory) return false;
      }
      const term = searchTerm.trim().toLowerCase();
      if (!term) return true;
      return (
        (scenario.title && scenario.title.toLowerCase().includes(term)) ||
        (scenario.description && scenario.description.toLowerCase().includes(term)) ||
        (scenario.scenarioCode && scenario.scenarioCode.toLowerCase().includes(term))
      );
    })
    .sort((a, b) => a.id - b.id);

  const selectedScenario = scenarios.find((s) => s.id === selectedScenarioId) || filteredScenarios[0] || null;
  const currentDetails = selectedScenario ? scenarioDetailsCache[selectedScenario.id] : null;

  // Lấy cấu hình cấp độ hiện tại (missions, vocab, grammar)
  const currentLevelConfig: ScenarioLevelConfiguration | null = currentDetails?.levelConfigurations?.find(
    (c) => c.jlptLevel.toUpperCase() === selectedLevel.toUpperCase()
  ) || currentDetails?.levelConfigurations?.[0] || null;

  // Gợi ý thích ứng thông minh (Next Best Scenario FYP Engine)
  const recommendedScenario = React.useMemo(() => {
    if (!scenarios.length) return null;
    if (!intelligenceProfile) {
      return {
        scenario: scenarios[0],
        badge: 'Khởi đầu hành trình',
        reason: 'Lựa chọn hoàn hảo để bắt đầu làm quen với đàm thoại tiếng Nhật tự nhiên.',
      };
    }

    // Nếu học viên yếu trợ từ (<75%), ưu tiên kịch bản Ẩm thực hoặc Giao thông
    if (intelligenceProfile.particleAccuracyRate < 75) {
      const match = scenarios.find((s) => {
        const cat = getScenarioCategory(s);
        return cat.key === 'gourmet' || cat.key === 'transit';
      });
      if (match) {
        return {
          scenario: match,
          badge: 'Rèn luyện trợ từ trọng điểm',
          reason: `Độ chính xác trợ từ hiện tại (${Math.round(
            intelligenceProfile.particleAccuracyRate
          )}%) cần tôi luyện thêm. Kịch bản này giúp bạn làm chủ trợ từ [に/で/を] trong 3 lượt nói!`,
        };
      }
    }

    // Nếu học viên điểm Kính ngữ chưa cao (<70%), ưu tiên kịch bản Công sở hoặc Mua sắm lịch sự
    if (intelligenceProfile.keigoCommandScore < 70) {
      const match = scenarios.find((s) => {
        const cat = getScenarioCategory(s);
        return cat.key === 'business' || cat.key === 'shopping';
      });
      if (match) {
        return {
          scenario: match,
          badge: 'Nâng cấp phản xạ kính ngữ',
          reason: `Điểm kính ngữ (${Math.round(
            intelligenceProfile.keigoCommandScore
          )}%) sẽ tăng vọt khi bạn hoàn thành các thử thách giao tiếp lịch sự tại đây!`,
        };
      }
    }

    // Mặc định: Bứt phá tốc độ phản xạ
    return {
      scenario: scenarios[0],
      badge: 'Bứt phá phản xạ đàm thoại',
      reason: `Chỉ số phản xạ của bạn (${Math.round(
        intelligenceProfile.speakingReflexIndex
      )} điểm) đang tiến triển rất tốt. Hãy tiếp tục bứt phá!`,
    };
  }, [scenarios, intelligenceProfile]);

  const [isStartingSession, setIsStartingSession] = useState<boolean>(false);

  const handleStart = async (item: ScenarioListItem, forceLevel?: string) => {
    ukiyoSound.playTaikoThud();
    const lvl = forceLevel || selectedLevel || item.supportedJLPTLevels?.[0] || 'N5';
    setIsStartingSession(true);
    try {
      const res = await roleplayService.startSession(item.id, lvl, false);
      if (res.success && res.data) {
        const sid = res.data.sessionId || res.data.id;
        navigate(`/scenarios/practice/${sid}`);
        return;
      }
    } catch {
      // fallback
    } finally {
      setIsStartingSession(false);
    }

    const mapped: Scenario = {
      id: item.id,
      title: item.title,
      description: item.description,
      thumbnail: item.thumbnail,
      scenarioCode: item.scenarioCode,
      level: lvl,
      supportedJLPTLevels: item.supportedJLPTLevels || [lvl],
    };
    onSelectScenario(mapped);
  };

  const handleResumeActiveSession = (sessionId: number) => {
    ukiyoSound.playMigotoChime();
    navigate(`/scenarios/practice/${sessionId}`);
  };

  return (
    <div data-theme="phong-luyen" className="w-full max-w-7xl mx-auto px-4 md:px-8 py-6 select-none font-sans">
      {/* Banner thông báo chế độ xem trước dành riêng cho Admin */}
      {user?.role === 'Admin' && (
        <div className="flex items-center justify-between bg-blue-50 border border-blue-200 text-blue-900 px-4 py-2.5 rounded-2xl text-xs font-medium mb-6">
          <div className="flex items-center gap-2">
            <span className="bg-[var(--ai)] text-white font-bold px-2 py-0.5 rounded text-[10px] uppercase tracking-wide">
              Chế độ xem trước
            </span>
            <span>Bạn đang xem thư viện kịch bản với giao diện của Học viên.</span>
          </div>
          <button
            type="button"
            onClick={() => navigate('/admin/scenarios')}
            className="text-[var(--ai)] hover:text-blue-900 font-bold underline transition cursor-pointer"
          >
            &larr; Quay lại Quản lý Kịch bản
          </button>
        </div>
      )}

      {/* ============================================================ */}
      {/* ADAPTIVE FYP HERO CARD (Gương soi Năng lực Đàm thoại ngầm)   */}
      {/* ============================================================ */}
      {intelligenceProfile && (
        <div className="mb-8 rounded-3xl border border-[var(--line)] bg-gradient-to-br from-white via-[var(--paper-50)] to-[#EEF5FC] p-6 shadow-sm relative overflow-hidden">
          {/* Họa tiết con dấu Omikuji */}
          <div className="absolute -right-4 -bottom-4 opacity-5 pointer-events-none select-none text-9xl font-serif font-black text-[var(--sumi)]">
            吉
          </div>

          <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6 relative z-10">
            {/* Cột trái: Chỉ số năng lực đàm thoại */}
            <div className="space-y-2 max-w-xl">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[var(--ai-soft)] text-[var(--ai)] border border-[var(--ai)]/20 font-sans">
                  Hồ sơ cá nhân hoá · Adaptive Profile
                </span>
                <span className="text-xs font-bold text-[var(--shu)] bg-[var(--shu-soft)] px-2.5 py-0.5 rounded-full flex items-center gap-1.5 font-sans">
                  <span className="text-[11px] font-serif font-black">{intelligenceProfile.omikujiRank ? intelligenceProfile.omikujiRank.split(' ')[0] : '大吉'}</span>
                  <span className="text-[11px]">{intelligenceProfile.omikujiRank || 'Đại Cát'}</span>
                </span>
              </div>

              <h2 className="text-xl md:text-2xl font-black text-[var(--sumi)] font-serif tracking-tight">
                Gương soi Năng lực Đàm thoại của bạn
              </h2>
              <p className="text-xs text-[var(--sumi-muted)] italic leading-relaxed">
                "{intelligenceProfile.kotowazaProverb || '継続は力なり (Kiên trì ắt thành công)'}"
              </p>

              {/* 4 Thước đo Phản xạ Giao tiếp */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
                <div className="rounded-2xl bg-white/80 p-3 border border-[var(--line)] shadow-2xs">
                  <div className="text-[10px] font-bold text-[var(--sumi-faint)] uppercase flex items-center gap-1.5"><SparkIcon className="w-3.5 h-3.5 text-amber-500" /><span>Phản xạ nói</span></div>
                  <div className="text-lg font-black text-[var(--sumi)] mt-0.5">
                    {Math.round(intelligenceProfile.speakingReflexIndex)}
                    <span className="text-[10px] font-normal text-slate-400">/100</span>
                  </div>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 border border-[var(--line)] shadow-2xs">
                  <div className="text-[10px] font-bold text-[var(--sumi-faint)] uppercase flex items-center gap-1.5"><TargetIcon className="w-3.5 h-3.5 text-emerald-600" /><span>Chuẩn trợ từ</span></div>
                  <div className="text-lg font-black text-emerald-700 mt-0.5">
                    {Math.round(intelligenceProfile.particleAccuracyRate)}%
                  </div>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 border border-[var(--line)] shadow-2xs">
                  <div className="text-[10px] font-bold text-[var(--sumi-faint)] uppercase flex items-center gap-1.5"><BriefcaseIcon className="w-3.5 h-3.5 text-[var(--ai)]" /><span>Vững kính ngữ</span></div>
                  <div className="text-lg font-black text-[var(--ai)] mt-0.5">
                    {Math.round(intelligenceProfile.keigoCommandScore)}%
                  </div>
                </div>

                <div className="rounded-2xl bg-white/80 p-3 border border-[var(--line)] shadow-2xs">
                  <div className="text-[10px] font-bold text-[var(--sumi-faint)] uppercase flex items-center gap-1.5"><VolumeIcon className="w-3.5 h-3.5 text-purple-600" /><span>Tốc độ Mora</span></div>
                  <div className="text-lg font-black text-purple-700 mt-0.5">
                    {intelligenceProfile.averageMoraRate > 0 ? intelligenceProfile.averageMoraRate.toFixed(1) : '6.8'}
                    <span className="text-[10px] font-normal text-slate-400">/s</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Cột phải: Khuyến nghị kịch bản dành riêng cho bạn */}
            {recommendedScenario && (
              <div className="w-full lg:w-80 rounded-2xl border border-[var(--ai)]/30 bg-white p-4 shadow-xs flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-black uppercase tracking-wider text-[var(--ai)]">
                      {recommendedScenario.badge}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      Đề xuất
                    </span>
                  </div>
                  <h3 className="font-bold text-sm text-[var(--sumi)] line-clamp-1">
                    {recommendedScenario.scenario.title}
                  </h3>
                  <p className="text-[11px] text-[var(--sumi-muted)] mt-1 line-clamp-2 leading-relaxed">
                    {recommendedScenario.reason}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    ukiyoSound.playMigotoChime();
                    setSelectedScenarioId(recommendedScenario.scenario.id);
                    handleStart(recommendedScenario.scenario);
                  }}
                  className="mt-3.5 w-full py-2.5 rounded-xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white text-xs font-bold shadow-xs transition active:scale-98 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  <span>Luyện tập kịch bản đề xuất</span>
                  <ArrowRightIcon className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tiêu đề trang & Giới thiệu */}
      <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-extrabold text-[var(--sumi)] tracking-tight font-serif">
            Thư viện Kịch bản Hội thoại AI
          </h1>
          <p className="text-slate-500 text-xs md:text-sm mt-1 max-w-2xl leading-relaxed">
            Nhập vai giao tiếp thực tế với các NPC thông minh. Hệ thống tự động phân tích phản xạ, chuẩn hoá phát âm và
            chấm điểm theo chuẩn JLPT.
          </p>
        </div>
      </div>

      {/* Tabs Chủ đề (Thematic Category Navigation) */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 mb-4 scrollbar-none">
        {[
          { key: 'ALL', label: 'Tất cả chủ đề' },
          { key: 'gourmet', label: 'Ẩm thực & Quán ăn' },
          { key: 'transit', label: 'Giao thông & Di chuyển' },
          { key: 'shopping', label: 'Mua sắm & Tiện lợi' },
          { key: 'business', label: 'Công sở & Phỏng vấn' },
          { key: 'life', label: 'Đời sống & Giao tiếp' },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => {
              ukiyoSound.playSubtleTap();
              setFilterCategory(tab.key);
            }}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition whitespace-nowrap cursor-pointer flex items-center gap-2 font-sans ${
              filterCategory === tab.key
                ? 'bg-[var(--sumi)] text-white shadow-xs'
                : 'bg-white text-[var(--sumi-muted)] border border-[var(--line)] hover:bg-[var(--paper-100)]'
            }`}
          >
            {renderCategoryIcon(tab.key, 'w-3.5 h-3.5')}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Toolbar Tìm kiếm & Bộ lọc Cấp độ JLPT */}
      <div className="bg-white p-4 rounded-2xl border border-[var(--line)] shadow-xs flex flex-col md:flex-row md:items-center gap-4 justify-between mb-8">
        {/* Ô Tìm kiếm */}
        <div className="relative flex-1 max-w-md">
          <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
            <span className="material-symbols-outlined text-lg">search</span>
          </span>
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Tìm theo mã, tên kịch bản hoặc từ khóa..."
            className="w-full pl-10 pr-9 py-2 bg-[var(--paper-100)] border border-[var(--line)] rounded-xl text-xs md:text-sm text-[var(--sumi)] placeholder-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--ai)]/20 focus:border-[var(--ai)] transition"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => handleSearchChange('')}
              className="absolute inset-y-0 right-0 pr-3 flex items-center text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Nút lọc trình độ JLPT */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <span className="text-xs font-bold text-[var(--sumi-muted)] mr-1 whitespace-nowrap">Trình độ:</span>
          {['ALL', 'N5', 'N4', 'N3'].map((lvl) => (
            <button
              key={lvl}
              type="button"
              onClick={() => {
                ukiyoSound.playSubtleTap();
                setFilterLevel(lvl);
              }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer whitespace-nowrap ${
                filterLevel === lvl
                  ? 'bg-[var(--ai)] text-white shadow-xs'
                  : 'bg-[var(--paper-200)] text-[var(--sumi-muted)] hover:bg-slate-200'
              }`}
            >
              {lvl === 'ALL' ? 'Tất cả' : `JLPT ${lvl}`}
            </button>
          ))}
        </div>
      </div>

      {/* Trạng thái Loading */}
      {loading && (
        <div className="flex justify-center items-center py-24">
          <div className="w-9 h-9 border-3 border-[var(--ai)]/20 border-t-[var(--ai)] rounded-full animate-spin" />
          <span className="ml-3 text-xs md:text-sm text-[var(--sumi-muted)] font-medium">
            Đang tải danh sách kịch bản...
          </span>
        </div>
      )}

      {/* Trạng thái Lỗi */}
      {!loading && error && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-2xl text-xs md:text-sm mb-6">
          {error}
        </div>
      )}

      {/* Bố cục 2 Cột: Master-Detail (Danh sách Kịch bản Trái & Thẻ Xem Trước Cố Định Phải) */}
      {!loading && !error && filteredScenarios.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* CỘT TRÁI: Thẻ Kịch bản (Chiếm 7/12 cột trên màn lớn) */}
          <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
            {filteredScenarios.map((item) => {
              const isSelected = selectedScenario?.id === item.id;
              const cat = getScenarioCategory(item);

              return (
                <div
                  key={item.id}
                  onClick={() => {
                    ukiyoSound.playSubtleTap();
                    setSelectedScenarioId(item.id);
                    if (item.supportedJLPTLevels?.length) {
                      if (!item.supportedJLPTLevels.includes(selectedLevel)) {
                        setSelectedLevel(item.supportedJLPTLevels[0]);
                      }
                    }
                  }}
                  className={`bg-white rounded-2xl p-5 border transition cursor-pointer flex flex-col justify-between relative overflow-hidden ${
                    isSelected
                      ? 'border-[var(--ai)] ring-3 ring-[var(--ai)]/20 shadow-md bg-gradient-to-b from-white to-[var(--ai-soft)]/20'
                      : 'border-[var(--line)] shadow-xs hover:border-[var(--line-strong)] hover:shadow-sm'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex gap-1 flex-wrap">
                        {item.supportedJLPTLevels?.map((lvl) => (
                          <span
                            key={lvl}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              lvl === 'N5'
                                ? 'bg-[var(--n5-soft)] text-[var(--n5)]'
                                : lvl === 'N4'
                                ? 'bg-[var(--n4-soft)] text-[var(--n4)]'
                                : 'bg-[var(--n3-soft)] text-[var(--n3)]'
                            }`}
                          >
                            JLPT {lvl}
                          </span>
                        ))}
                      </div>
                      <span className="text-[10px] font-mono text-[var(--sumi-muted)] bg-[var(--paper-200)] px-2 py-0.5 rounded">
                        {item.scenarioCode || `SCN_${item.id}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--ai)] mb-1">
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                    </div>

                    <h3 className="font-bold text-[var(--sumi)] text-base leading-snug line-clamp-1">{item.title}</h3>
                    <p className="text-xs text-[var(--sumi-muted)] line-clamp-2 my-2.5 leading-relaxed">
                      {item.description}
                    </p>
                  </div>

                  <div className="pt-3 border-t border-[var(--line)] flex items-center justify-between mt-2">
                    <span className="text-[11px] font-medium text-emerald-600 flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      <span>Sẵn sàng luyện tập</span>
                    </span>
                    <span
                      className={`text-xs font-bold flex items-center gap-0.5 ${
                        isSelected ? 'text-[var(--ai)]' : 'text-slate-400'
                      }`}
                    >
                      <span>{isSelected ? 'Đang chọn' : 'Xem'}</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CỘT PHẢI: Bảng Xem Trước Nhanh Cố Định (Sticky Inspector Card — Chiếm 5/12 cột) */}
          {selectedScenario && (
            <div className="lg:col-span-5 bg-white rounded-3xl border border-[var(--line)] shadow-lg sticky top-20 overflow-hidden">
              {/* Header Card với Họa tiết Sóng Nước Seigaiha */}
              <div className="bg-gradient-to-r from-[var(--sumi)] to-[var(--ai)] p-5 text-white relative">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-bold tracking-widest uppercase text-blue-200 text-[10px]">
                    Thẻ Chi Tiết Kịch Bản
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white/20 text-white font-bold">
                    {selectedScenario.scenarioCode || `SCN_${selectedScenario.id}`}
                  </span>
                </div>

                <div className="flex items-center gap-4 mt-2">
                  <LivingAvatar
                    size="md"
                    avatarState="idle"
                    personaName={currentLevelConfig?.aiPersona || selectedScenario.title}
                    scenarioTitle={selectedScenario.title}
                    hideLabel
                  />
                  <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-black leading-snug font-serif text-white line-clamp-1">
                      {selectedScenario.title}
                    </h2>
                    <p className="text-xs text-blue-100 mt-1 line-clamp-2 leading-relaxed">
                      {currentLevelConfig?.description || selectedScenario.description}
                    </p>
                  </div>
                </div>

                {/* Inline JLPT Level Switcher ngay trên thẻ Preview */}
                <div className="mt-4 pt-3 border-t border-white/20 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-blue-100">Cấp độ mục tiêu:</span>
                  <div className="flex items-center gap-1.5">
                    {selectedScenario.supportedJLPTLevels?.map((lvl) => (
                      <button
                        key={lvl}
                        type="button"
                        onClick={() => {
                          ukiyoSound.playSubtleTap();
                          setSelectedLevel(lvl);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                          selectedLevel === lvl
                            ? 'bg-white text-[var(--sumi)] shadow-xs'
                            : 'bg-white/15 text-white hover:bg-white/25'
                        }`}
                      >
                        JLPT {lvl}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Thân thẻ Preview: Nhiệm vụ & Từ vựng mục tiêu */}
              <div className="p-5 space-y-4 text-xs">
                {/* Thông tin Meta: Persona & Audio Engine */}
                <div className="grid grid-cols-2 gap-2 text-[11px] p-3 rounded-2xl bg-[var(--paper-100)] border border-[var(--line)]">
                  <div>
                    <span className="text-[var(--sumi-faint)]">Nhân vật đối thoại:</span>
                    <p className="font-bold text-[var(--ai)] mt-0.5">
                      {currentLevelConfig?.aiPersona || 'AI Persona'}
                    </p>
                  </div>
                  <div>
                    <span className="text-[var(--sumi-faint)]">Công nghệ âm thanh:</span>
                    <p className="font-bold text-emerald-700 mt-0.5">VOICEVOX + Whisper STT</p>
                  </div>
                </div>

                {/* Nhiệm vụ cần vượt qua */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-[var(--sumi)] uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                      <TargetIcon className="w-3.5 h-3.5 text-[var(--ai)]" />
                      <span>Mục tiêu nhiệm vụ ({currentLevelConfig?.missions?.length || 0})</span>
                    </span>
                    <span className="text-[10px] text-[var(--sumi-faint)]">Chấm tự động theo lượt nói</span>
                  </div>

                  {loadingDetails ? (
                    <div className="py-4 text-center text-[var(--sumi-faint)]">Đang tải nhiệm vụ...</div>
                  ) : currentLevelConfig?.missions && currentLevelConfig.missions.length > 0 ? (
                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {currentLevelConfig.missions.map((m, idx) => (
                        <div
                          key={m.id || idx}
                          className="flex items-start gap-2 p-2 rounded-xl bg-[var(--paper-50)] border border-[var(--line)]"
                        >
                          <span className="w-5 h-5 rounded-full bg-[var(--ai-soft)] text-[var(--ai)] font-bold grid place-items-center shrink-0 text-[10px]">
                            {idx + 1}
                          </span>
                          <span className="text-[var(--sumi)] font-medium leading-relaxed">{m.content}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[var(--sumi-faint)] italic">Hoàn thành hội thoại tự nhiên với nhân vật AI.</p>
                  )}
                </div>

                {/* Từ vựng trọng tâm */}
                {currentLevelConfig?.targetVocabularies && currentLevelConfig.targetVocabularies.length > 0 && (
                  <div>
                    <span className="font-bold text-[var(--sumi)] uppercase tracking-wider text-[11px] mb-2 flex items-center gap-1.5">
                      <BookmarkIcon className="w-3.5 h-3.5 text-rose-600" />
                      <span>Từ vựng trọng tâm ({currentLevelConfig.targetVocabularies.length})</span>
                    </span>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {currentLevelConfig.targetVocabularies.slice(0, 8).map((v) => (
                        <span
                          key={v.id}
                          className="px-2 py-1 rounded-lg bg-[var(--paper-100)] border border-[var(--line)] text-[var(--sumi)] font-semibold text-[11px]"
                          title={`${v.reading || ''} - ${v.meaning}`}
                        >
                          {v.word}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Nút hành động: Tiếp tục phiên dở dang hoặc Bắt đầu mới */}
                <div className="pt-2 border-t border-[var(--line)] space-y-2">
                  {activeSession ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-xs p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                          <span>Bạn có phiên đang dở ({activeSession.completedMissionsCount}/{activeSession.totalMissionsCount} nhiệm vụ)</span>
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleResumeActiveSession(activeSession.sessionId)}
                        className="w-full py-3.5 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs md:text-sm font-bold shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                      >
                        <span>Tiếp tục hội thoại dở dang</span>
                        <ArrowRightIcon className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleStart(selectedScenario, selectedLevel)}
                        className="w-full py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[var(--sumi)] text-xs font-semibold transition cursor-pointer"
                      >
                        Luyện lại từ đầu kịch bản này
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleStart(selectedScenario, selectedLevel)}
                      className="w-full py-3.5 rounded-2xl bg-[var(--ai)] hover:bg-[var(--ai-hover)] text-white text-xs md:text-sm font-bold shadow-md transition active:scale-98 cursor-pointer flex items-center justify-center gap-2"
                    >
                      <span>{isStartingSession ? 'Đang khởi tạo phòng luyện...' : `Vào phòng Luyện nói (JLPT ${selectedLevel})`}</span>
                      <ArrowRightIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
