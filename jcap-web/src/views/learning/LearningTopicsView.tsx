import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { EmptyState } from '../../components/jcap/EmptyState';
import type { LearnerPage, LearnerTopic } from '../../types/learnerLearning';
import { LEARNING_LEVELS, positivePage, topicHref } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, Pagination, useLearningResource } from './LearningShared';

export function LearningTopicsView() {
  const [params, setParams] = useSearchParams();
  const page = positivePage(params.get('page')); const keyword = (params.get('keyword') || '').slice(0, 200);
  const selectedLevel = params.get('level') || ''; const level = LEARNING_LEVELS.includes(selectedLevel) ? selectedLevel : '';
  const query = new URLSearchParams({ page: String(page), pageSize: '12' });
  if (keyword) query.set('keyword', keyword); if (level) query.set('jlptLevel', level);
  const { data, loading, error, reload } = useLearningResource<LearnerPage<LearnerTopic>>(`topics?${query}`, 200);
  useEffect(() => {
    if (data && data.page !== page) { const next = new URLSearchParams(params); next.set('page', String(data.page)); setParams(next, { replace: true }); }
  }, [data, page, params, setParams]);
  function filter(name: string, value: string) { const next = new URLSearchParams(params); if (value) next.set(name, value); else next.delete(name); next.delete('page'); setParams(next, { replace: true }); }
  function onPage(value: number) { const next = new URLSearchParams(params); next.set('page', String(value)); setParams(next); }
  return <LearningPage><header className="lc-heading"><span className="lc-eyebrow">Kho học liệu</span><h1>Học theo chủ đề</h1><p>Khám phá từ vựng và ngữ pháp qua những chủ đề gần gũi với cuộc sống.</p></header>
    <div className="lc-toolbar"><label className="lc-filter"><span>Trình độ JLPT</span><select value={level} onChange={e => filter('level', e.target.value)}><option value="">Tất cả trình độ</option>{LEARNING_LEVELS.map(l => <option key={l}>{l}</option>)}</select></label><label className="lc-search"><Icon name="search" /><input aria-label="Tìm chủ đề" placeholder="Tìm tên hoặc mô tả chủ đề…" maxLength={200} value={keyword} onChange={e => filter('keyword', e.target.value)} />{keyword && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => filter('keyword', '')}><Icon name="close" size={18} /></button>}</label></div>
    {error ? <LearningFailure error={error} reload={reload} back="/learning/topics" /> : loading ? <LearningLoading /> : data && <><div className="lc-section-meta" aria-live="polite"><span>{data.total} chủ đề{level ? ` · ${level}` : ''}</span><span>Chọn chủ đề để bắt đầu</span></div>{data.items.length ? <div className="lc-topic-grid">{data.items.map(t => <Link key={t.id} className="lc-topic" to={topicHref(t.id, params, t.vocabularyCount === 0 && t.grammarCount > 0 ? 'grammars' : 'vocabularies', true)}><div className="lc-topic-top"><span className="lc-topic-icon"><Icon name="auto_stories" size={25} /></span><LevelBadge level={t.jlptLevel} /></div><h2>{t.name}</h2><p>{t.description || 'Từ vựng và cách diễn đạt trong chủ đề này.'}</p><div className="lc-topic-bottom"><span>{t.vocabularyCount} từ vựng</span><span>{t.grammarCount} ngữ pháp</span><Icon name="arrow_forward" size={19} /></div></Link>)}</div> : <EmptyState icon="search_off" title="Chưa có chủ đề phù hợp">Thử thay đổi trình độ hoặc từ khóa tìm kiếm.</EmptyState>}<Pagination page={data.page} pageSize={data.pageSize} total={data.total} label="chủ đề" busy={loading} onPage={onPage} /></>}
  </LearningPage>;
}
