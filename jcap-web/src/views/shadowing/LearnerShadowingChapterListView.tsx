import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingTextbookItem, ShadowingChapterItem } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';

export const LearnerShadowingChapterListView: React.FC = () => {
  const { textbookId } = useParams<{ textbookId: string }>();
  const navigate = useNavigate();

  const [textbook, setTextbook] = useState<ShadowingTextbookItem | null>(null);
  const [chapters, setChapters] = useState<ShadowingChapterItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  useEffect(() => {
    if (!textbookId) return;

    const loadData = async () => {
      setIsLoading(true);
      const [bookRes, chaptersRes] = await Promise.all([
        shadowingService.getTextbookById(textbookId),
        shadowingService.getChapters(textbookId),
      ]);

      if (bookRes.success && bookRes.data) {
        setTextbook(bookRes.data);
      }
      if (chaptersRes.success && chaptersRes.data) {
        setChapters(chaptersRes.data);
      }
      setIsLoading(false);
    };

    loadData();
  }, [textbookId]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/4"></div>
        <div className="h-40 bg-gray-200 rounded-2xl"></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="h-32 bg-gray-200 rounded-2xl"></div>
          <div className="h-32 bg-gray-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!textbook) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center space-y-3">
        <p className="text-red-600 font-bold">Không tìm thấy giáo trình này.</p>
        <Button variant="secondary" onClick={() => navigate('/shadowing')}>
          ← Quay lại danh sách giáo trình
        </Button>
      </div>
    );
  }

  const filteredChapters = chapters.filter(chap => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      chap.title.toLowerCase().includes(kw) ||
      (chap.japaneseTitle && chap.japaneseTitle.toLowerCase().includes(kw)) ||
      chap.description.toLowerCase().includes(kw)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Breadcrumbs Navigation */}
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[#71809A]">
          <Link to="/shadowing" className="hover:text-[#0878EE] font-medium transition-colors">
            Thư viện Shadowing
          </Link>
          <span>/</span>
          <span className="text-[#071A44] font-bold truncate">{textbook.title}</span>
        </div>

        <button
          onClick={() => navigate(`/shadowing?level=${textbook.level}`)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0878EE] hover:text-[#0662C6] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full transition-all cursor-pointer"
        >
          <span>←</span>
          <span>Chọn giáo trình khác</span>
        </button>
      </nav>

      {/* 2. Textbook Overview Card */}
      <div className="bg-white rounded-2xl border border-[#E6EDF5] p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center gap-6">
        {/* Book Mini Cover Visual */}
        <div className="w-24 h-32 rounded-xl bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#071A44] p-3 text-white flex flex-col justify-between flex-shrink-0 shadow-md relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-2 bg-gradient-to-r from-black/40 via-white/20 to-transparent"></div>
          <span className="text-[9px] font-black uppercase text-amber-300">JLPT {textbook.level}</span>
          <div className="text-xs font-black line-clamp-2 leading-tight">{textbook.title}</div>
          <span className="text-[8px] text-gray-400">{textbook.publisher || 'JCAP'}</span>
        </div>

        {/* Info */}
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-blue-50 text-[#0878EE] border border-blue-200">
              JLPT {textbook.level}
            </span>
            <span className="text-xs text-[#71809A]">
              Xuất bản: <strong>{textbook.publisher || '3A Corporation'}</strong>
            </span>
            <span className="text-xs text-[#71809A]">•</span>
            <span className="text-xs text-[#71809A]">
              Quy mô: <strong>{chapters.length} Chương có sẵn</strong>
            </span>
          </div>

          <h1 className="text-2xl font-black text-[#071A44] tracking-tight">{textbook.title}</h1>
          {textbook.japaneseTitle && (
            <p className="text-xs font-semibold text-[#0878EE] font-jp">{textbook.japaneseTitle}</p>
          )}

          <p className="text-xs text-[#71809A] max-w-3xl leading-relaxed">{textbook.description}</p>
        </div>
      </div>

      {/* 3. Chapter Filter Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-[#E6EDF5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-black text-[#071A44] uppercase tracking-wider">
            Danh sách Chương học ({chapters.length})
          </h2>
          <span className="text-xs text-[#71809A]">· Nhấp vào chương để xem các bài hội thoại</span>
        </div>

        <div className="relative w-full sm:w-64">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#71809A] text-xs">
            🔍
          </span>
          <input
            type="text"
            className="w-full pl-8 pr-3 py-1.5 border border-[#E6EDF5] rounded-lg text-xs text-[#071A44] placeholder-[#71809A] focus:outline-none focus:border-[#0878EE] bg-gray-50/50"
            placeholder="Tìm theo tên bài học..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
        </div>
      </div>

      {/* 4. Chapter Cards Grid */}
      {filteredChapters.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-10 text-center space-y-2">
          <p className="text-sm text-[#71809A]">Không tìm thấy chương nào khớp với tìm kiếm.</p>
          <Button variant="secondary" size="sm" onClick={() => setSearchKeyword('')}>
            Xóa bộ lọc
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredChapters.map((chap) => (
            <div
              key={chap.id}
              onClick={() => navigate(`/shadowing/textbooks/${textbook.id}/chapters/${chap.id}`)}
              className="group bg-white rounded-2xl border border-[#E6EDF5] hover:border-[#BCDDFB] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col justify-between cursor-pointer"
            >
              <div>
                {/* Chapter Pill & Dialogue Count */}
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#F4F9FE] text-[#0878EE] border border-[#BCDDFB]">
                    Bài {chap.chapterNumber}
                  </span>
                  <span className="text-[11px] font-semibold text-[#71809A] bg-gray-100 px-2 py-0.5 rounded-md">
                    {chap.dialoguesCount} bài hội thoại
                  </span>
                </div>

                {/* Chapter Title */}
                <h3 className="text-base font-bold text-[#071A44] group-hover:text-[#0878EE] transition-colors leading-snug mb-1">
                  {chap.title}
                </h3>
                {chap.japaneseTitle && (
                  <p className="text-xs text-[#0878EE] font-medium font-jp mb-2.5">
                    {chap.japaneseTitle}
                  </p>
                )}

                <p className="text-xs text-[#71809A] leading-relaxed line-clamp-2">
                  {chap.description}
                </p>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-[#E6EDF5] mt-4 flex items-center justify-between text-xs font-bold text-[#0878EE] group-hover:text-[#0662C6]">
                <span>Xem danh sách hội thoại</span>
                <span className="group-hover:translate-x-1 transition-transform">➔</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

