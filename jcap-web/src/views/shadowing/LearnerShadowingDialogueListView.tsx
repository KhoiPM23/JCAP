import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { shadowingService } from '../../services/shadowingService';
import type { ShadowingTextbookItem, ShadowingChapterItem, ShadowingDialogueDetail } from '../../types/shadowing';
import { Button } from '../../components/ui/Button';

export const LearnerShadowingDialogueListView: React.FC = () => {
  const { textbookId, chapterId } = useParams<{ textbookId: string; chapterId: string }>();
  const navigate = useNavigate();

  const [textbook, setTextbook] = useState<ShadowingTextbookItem | null>(null);
  const [chapter, setChapter] = useState<ShadowingChapterItem | null>(null);
  const [dialogues, setDialogues] = useState<ShadowingDialogueDetail[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    if (!textbookId || !chapterId) return;

    const loadData = async () => {
      setIsLoading(true);
      const [bookRes, chapRes, diaRes] = await Promise.all([
        shadowingService.getTextbookById(textbookId),
        shadowingService.getChapterById(textbookId, chapterId),
        shadowingService.getDialoguesByChapter(chapterId),
      ]);

      if (bookRes.success && bookRes.data) setTextbook(bookRes.data);
      if (chapRes.success && chapRes.data) setChapter(chapRes.data);
      if (diaRes.success && diaRes.data) setDialogues(diaRes.data);

      setIsLoading(false);
    };

    loadData();
  }, [textbookId, chapterId]);

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-6 bg-gray-200 rounded w-1/3"></div>
        <div className="h-32 bg-gray-200 rounded-2xl"></div>
        <div className="space-y-4">
          <div className="h-28 bg-gray-200 rounded-2xl"></div>
          <div className="h-28 bg-gray-200 rounded-2xl"></div>
        </div>
      </div>
    );
  }

  if (!chapter || !textbook) {
    return (
      <div className="bg-white rounded-2xl border border-red-200 p-8 text-center space-y-3">
        <p className="text-red-600 font-bold">Không tìm thấy thông tin chương học.</p>
        <Button variant="secondary" onClick={() => navigate('/shadowing')}>
          Quay lại danh sách giáo trình
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 1. Breadcrumbs Navigation */}
      <nav className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-[#71809A]">
          <Link to="/shadowing" className="hover:text-[#0878EE] font-medium transition-colors">
            Thư viện Shadowing
          </Link>
          <span>/</span>
          <Link to={`/shadowing/textbooks/${textbook.id}`} className="hover:text-[#0878EE] font-medium transition-colors truncate max-w-[200px]">
            {textbook.title}
          </Link>
          <span>/</span>
          <span className="text-[#071A44] font-bold truncate max-w-[240px]">{chapter.title}</span>
        </div>

        <button
          onClick={() => navigate(`/shadowing/textbooks/${textbook.id}`)}
          className="flex items-center gap-1.5 text-xs font-bold text-[#0878EE] hover:text-[#0662C6] bg-blue-50 border border-blue-200 px-3 py-1 rounded-full transition-all cursor-pointer"
        >
          <span>←</span>
          <span>Chọn chương khác</span>
        </button>
      </nav>

      {/* 2. Chapter Header Banner */}
      <div className="bg-gradient-to-r from-blue-50/70 via-white to-blue-50/40 rounded-2xl border border-[#BCDDFB] p-6 shadow-xs">
        <div className="flex items-center gap-2 mb-2">
          <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-[#0878EE] text-white">
            JLPT {textbook.level}
          </span>
          <span className="text-xs font-bold text-[#0878EE]">
            {textbook.title} · Chương {chapter.chapterNumber}
          </span>
        </div>

        <h1 className="text-2xl font-black text-[#071A44] tracking-tight">{chapter.title}</h1>
        {chapter.japaneseTitle && (
          <p className="text-sm font-semibold text-[#0878EE] font-jp mt-0.5">{chapter.japaneseTitle}</p>
        )}

        <p className="text-xs text-[#556987] mt-2 max-w-2xl leading-relaxed">{chapter.description}</p>
      </div>

      {/* 3. Section Title */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-[#071A44] tracking-tight">
            Chọn bài hội thoại để luyện Shadowing
          </h2>
          <p className="text-xs text-[#71809A] mt-0.5">
            Mỗi bài đối thoại gồm các vai diễn và mục tiêu ngữ pháp riêng biệt. Chọn một bài để vào phòng luyện.
          </p>
        </div>
        <span className="text-xs font-bold text-[#0878EE] bg-blue-50 px-3 py-1 rounded-full border border-blue-200">
          {dialogues.length} bài hội thoại
        </span>
      </div>

      {/* 4. Dialogues List */}
      <div className="space-y-4">
        {dialogues.map((item, index) => {
          return (
            <div
              key={item.id}
              onClick={() => navigate(`/shadowing/practice/${item.id}`)}
              className="group bg-white rounded-2xl border border-[#E6EDF5] hover:border-[#0878EE] p-5 shadow-xs hover:shadow-md transition-all duration-200 flex flex-col md:flex-row md:items-center justify-between gap-5 cursor-pointer"
            >
              {/* Left Details */}
              <div className="space-y-2 flex-1">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-lg bg-blue-100 text-[#0878EE] font-bold text-xs flex items-center justify-center">
                    0{index + 1}
                  </span>
                  <h3 className="text-lg font-bold text-[#071A44] group-hover:text-[#0878EE] transition-colors">
                    {item.title}
                  </h3>
                  <span className="text-[11px] font-semibold text-[#71809A] bg-gray-100 px-2 py-0.5 rounded-md">
                    {item.sentences.length} câu thoại
                  </span>
                </div>

                {item.scenarioDescription && (
                  <p className="text-xs text-[#556987] leading-relaxed max-w-2xl">
                    {item.scenarioDescription}
                  </p>
                )}

                {/* Character Roles & Grammar Tags */}
                <div className="flex flex-wrap items-center gap-3 pt-1 text-xs">
                  <div className="flex items-center gap-2 bg-[#F8FAFD] border border-[#E6EDF5] px-3 py-1 rounded-lg text-[#071A44]">
                    <span>Vai A: <strong className="text-[#0878EE]">{item.speakerRoleA_Name}</strong></span>
                    <span>•</span>
                    <span>Vai B: <strong className="text-purple-700">{item.speakerRoleB_Name}</strong></span>
                  </div>

                  {item.targetGrammars && item.targetGrammars.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-bold text-[#71809A] uppercase">Ngữ pháp:</span>
                      {item.targetGrammars.map((g) => (
                        <span
                          key={g.id}
                          className="text-[11px] font-bold text-[#0878EE] bg-blue-50 border border-[#BCDDFB] px-2 py-0.5 rounded-full"
                        >
                          {g.pattern}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Right CTA Button */}
              <div className="flex-shrink-0 flex items-center">
                <button
                  type="button"
                  className="w-full md:w-auto px-5 py-2.5 rounded-xl bg-gradient-to-r from-[#0878EE] to-[#054EA0] hover:from-[#0662C6] hover:to-[#043A78] text-white text-xs font-bold flex items-center justify-center gap-2 shadow-sm transition-all transform group-hover:scale-102 cursor-pointer"
                >
                  <span>Vào phòng luyện Shadowing</span>
                  <span>➔</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

