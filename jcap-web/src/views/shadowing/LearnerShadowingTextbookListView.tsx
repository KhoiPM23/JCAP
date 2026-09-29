import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingTextbookItem } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';

export const LearnerShadowingTextbookListView: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Selected JLPT level for content filtering (default N4 as per specifications)
  const levelParam = searchParams.get('level')?.toUpperCase() as 'N3' | 'N4' | 'N5' | undefined;
  const [selectedLevel, setSelectedLevel] = useState<'N3' | 'N4' | 'N5'>(levelParam || 'N4');

  const [textbooks, setTextbooks] = useState<ShadowingTextbookItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchKeyword, setSearchKeyword] = useState<string>('');

  useEffect(() => {
    const fetchBooks = async () => {
      setIsLoading(true);
      const res = await shadowingService.getTextbooks(selectedLevel);
      if (res.success && res.data) {
        setTextbooks(res.data);
      }
      setIsLoading(false);
    };

    fetchBooks();
  }, [selectedLevel]);

  const handleLevelSelect = (level: 'N3' | 'N4' | 'N5') => {
    setSelectedLevel(level);
    setSearchParams({ level });
  };

  const filteredBooks = textbooks.filter(book => {
    if (!searchKeyword.trim()) return true;
    const kw = searchKeyword.toLowerCase();
    return (
      book.title.toLowerCase().includes(kw) ||
      (book.japaneseTitle && book.japaneseTitle.toLowerCase().includes(kw)) ||
      book.description.toLowerCase().includes(kw)
    );
  });

  return (
    <div className="space-y-6">
      {/* 1. Header Banner */}
      <div className="bg-gradient-to-r from-white via-blue-50/30 to-white p-6 rounded-2xl border border-[#E6EDF5] shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">🎙️</span>
            <span className="text-xs font-bold text-[#0878EE] uppercase tracking-wider">
              Luyện phát âm & Phản xạ tiếng Nhật
            </span>
          </div>
          <h1 className="text-2xl font-black text-[#071A44] tracking-tight">
            Thư viện Giáo trình Shadowing
          </h1>
          <p className="text-sm text-[#71809A] mt-1 max-w-2xl leading-relaxed">
            Chọn trình độ và giáo trình bạn đang theo học để bắt đầu luyện tập ngữ điệu, ngắt câu và phản xạ giao tiếp cùng người bản xứ.
          </p>
        </div>

        {/* Level Legend Badge */}
        <div className="bg-[#F4F9FE] border border-[#BCDDFB] rounded-xl p-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-[#0878EE] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            {selectedLevel}
          </div>
          <div>
            <div className="text-xs font-bold text-[#071A44]">Trình độ đang chọn</div>
            <div className="text-[11px] text-[#71809A]">Nội dung học cấp độ JLPT {selectedLevel}</div>
          </div>
        </div>
      </div>

      {/* 2. Level Selector Bar & Filter */}
      <div className="bg-white p-4 rounded-xl border border-[#E6EDF5] shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Level Tabs: [N3] [N4] [N5] */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-[#71809A] mr-1 hidden sm:inline">Trình độ:</span>
          {(['N3', 'N4', 'N5'] as const).map((lvl) => {
            const isSelected = selectedLevel === lvl;
            return (
              <button
                key={lvl}
                type="button"
                onClick={() => handleLevelSelect(lvl)}
                className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                  isSelected
                    ? 'bg-[#0878EE] text-white shadow-sm shadow-blue-500/20 ring-2 ring-blue-200'
                    : 'bg-[#F4F9FE] hover:bg-[#EEF6FE] text-[#556987] border border-[#E6EDF5]'
                }`}
              >
                <span>JLPT</span>
                <span className="text-sm">{lvl}</span>
              </button>
            );
          })}
        </div>

        {/* Search inside textbook list */}
        <div className="relative w-full sm:w-72">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#71809A] text-xs">
            🔍
          </span>
          <input
            type="text"
            className="w-full pl-8 pr-3 py-2 border border-[#E6EDF5] rounded-xl text-xs text-[#071A44] placeholder-[#71809A] focus:outline-none focus:border-[#0878EE] focus:ring-1 focus:ring-[#0878EE] bg-gray-50/50"
            placeholder="Tìm tên sách giáo trình..."
            value={searchKeyword}
            onChange={(e) => setSearchKeyword(e.target.value)}
          />
          {searchKeyword && (
            <button
              onClick={() => setSearchKeyword('')}
              className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-xs text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* 3. Textbooks Grid (Book Cards) */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#E6EDF5] p-5 animate-pulse space-y-4">
              <div className="h-44 bg-gray-200 rounded-xl"></div>
              <div className="h-5 bg-gray-200 rounded w-3/4"></div>
              <div className="h-4 bg-gray-200 rounded w-1/2"></div>
              <div className="h-10 bg-gray-200 rounded-xl"></div>
            </div>
          ))}
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E6EDF5] p-12 text-center space-y-3 shadow-xs">
          <span className="text-4xl">📚</span>
          <h3 className="text-lg font-bold text-[#071A44]">Không tìm thấy giáo trình phù hợp</h3>
          <p className="text-xs text-[#71809A] max-w-sm mx-auto">
            Chưa có giáo trình nào với từ khóa bạn vừa nhập. Hãy thử tìm từ khóa khác hoặc chuyển sang cấp độ khác.
          </p>
          <Button variant="secondary" size="sm" onClick={() => setSearchKeyword('')}>
            Xóa tìm kiếm
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBooks.map((book) => {
            const levelBg =
              book.level === 'N5'
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : book.level === 'N4'
                ? 'bg-blue-50 text-[#0878EE] border-blue-200'
                : 'bg-purple-50 text-purple-700 border-purple-200';

            return (
              <div
                key={book.id}
                onClick={() => navigate(`/shadowing/textbooks/${book.id}`)}
                className="group bg-white rounded-2xl border border-[#E6EDF5] hover:border-[#BCDDFB] p-5 shadow-xs hover:shadow-lg transition-all duration-200 flex flex-col justify-between cursor-pointer relative overflow-hidden"
              >
                {/* Book Card Content */}
                <div>
                  {/* Book Cover Visual with 3D Book Spine Effect */}
                  <div className="w-full h-48 rounded-xl bg-gradient-to-br from-[#1E293B] via-[#0F172A] to-[#071A44] p-4 text-white relative overflow-hidden flex flex-col justify-between shadow-inner mb-4 group-hover:scale-[1.01] transition-transform">
                    {/* Visual pattern overlay */}
                    <div className="absolute inset-0 opacity-15 bg-[radial-gradient(#fff_1px,transparent_1px)] [background-size:12px_12px] pointer-events-none"></div>

                    {/* Book spine bar on left */}
                    <div className="absolute left-0 top-0 bottom-0 w-3 bg-gradient-to-r from-black/40 via-white/20 to-transparent"></div>

                    {/* Top Level Pill */}
                    <div className="flex items-center justify-between z-10 pl-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-black tracking-wider uppercase border bg-white/95 ${
                        book.level === 'N5' ? 'text-emerald-700 border-emerald-300' :
                        book.level === 'N4' ? 'text-[#0878EE] border-blue-300' :
                        'text-purple-700 border-purple-300'
                      }`}>
                        JLPT {book.level}
                      </span>
                      <span className="text-[10px] text-gray-300 bg-black/40 px-2 py-0.5 rounded-md backdrop-blur-xs">
                        {book.totalChapters} Chương
                      </span>
                    </div>

                    {/* Center Title in Book */}
                    <div className="z-10 pl-2 my-auto">
                      <div className="text-[11px] font-medium text-blue-200 tracking-wider font-jp line-clamp-1">
                        {book.japaneseTitle || '日本語教科書'}
                      </div>
                      <h3 className="text-xl font-black text-white leading-tight mt-1 drop-shadow-sm line-clamp-2">
                        {book.title}
                      </h3>
                    </div>

                    {/* Bottom Publisher */}
                    <div className="z-10 pl-2 flex items-center justify-between text-[10px] text-gray-300 pt-1 border-t border-white/10">
                      <span>{book.publisher || 'JCAP Curriculum'}</span>
                      <span className="text-amber-300 font-bold">★ Chuẩn Tokyo</span>
                    </div>
                  </div>

                  {/* Title & Description under Cover */}
                  <div className="space-y-1.5 mb-4">
                    <div className="flex items-center gap-2">
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${levelBg}`}>
                        Cấp độ {book.level}
                      </span>
                      <span className="text-xs text-[#71809A]">
                        {book.totalDialogues}+ bài hội thoại
                      </span>
                    </div>

                    <h2 className="text-base font-bold text-[#071A44] group-hover:text-[#0878EE] transition-colors leading-snug">
                      {book.title}
                    </h2>

                    <p className="text-xs text-[#71809A] leading-relaxed line-clamp-2 text-justify">
                      {book.description}
                    </p>
                  </div>
                </div>

                {/* Card Action Button */}
                <div className="pt-2 border-t border-[#E6EDF5] mt-auto">
                  <div className="w-full py-2.5 px-4 rounded-xl bg-[#F4F9FE] group-hover:bg-[#0878EE] text-[#0878EE] group-hover:text-white text-xs font-bold flex items-center justify-center gap-1.5 transition-all shadow-2xs">
                    <span>Chọn giáo trình & Khám phá các chương</span>
                    <span className="group-hover:translate-x-1 transition-transform">➔</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

