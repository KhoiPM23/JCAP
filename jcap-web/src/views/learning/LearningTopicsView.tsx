import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { EmptyState } from '../../components/jcap/EmptyState';
import type { LearnerPage, LearnerTopic, LearningContentKind } from '../../types/learnerLearning';
import { contentKind, LEARNING_LEVELS, positivePage, topicHref } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, Pagination, useLearningResource } from './LearningShared';
import './learningTopics.css';

const catalogs = {
  vocabularies: { title: 'Chủ đề từ vựng', unit: 'từ vựng' },
  grammars: { title: 'Chủ đề ngữ pháp', unit: 'mẫu ngữ pháp' },
} as const;

export function LearningTopicsView() {
  const [params, setParams] = useSearchParams();
  const kind = contentKind(params.get('kind'));
  const catalog = catalogs[kind];
  const page = positivePage(params.get('page'));
  const keyword = (params.get('keyword') || '').slice(0, 200);
  const selectedLevel = params.get('level') || '';
  const level = LEARNING_LEVELS.includes(selectedLevel) ? selectedLevel : '';
  const query = new URLSearchParams({ kind, page: String(page), pageSize: '12' });
  if (keyword) query.set('keyword', keyword);
  if (level) query.set('jlptLevel', level);
  const { data, loading, error, reload } = useLearningResource<LearnerPage<LearnerTopic>>(`topics?${query}`, 200);

  useEffect(() => {
    if (data && data.page !== page) {
      const next = new URLSearchParams(params);
      next.set('page', String(data.page));
      setParams(next, { replace: true });
    }
  }, [data, page, params, setParams]);

  function catalogLink(value: LearningContentKind) {
    const next = new URLSearchParams({ kind: value });
    if (level) next.set('level', level);
    return `?${next}`;
  }
  function filter(name: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(name, value);
    else next.delete(name);
    next.delete('page');
    setParams(next, { replace: true });
  }
  function onPage(value: number) {
    const next = new URLSearchParams(params);
    next.set('page', String(value));
    setParams(next);
  }

  return <LearningPage>
    <div className="lt-page">
    <h1 className="sr-only">{catalog.title}</h1>
    <nav className="lc-tabs lc-catalog-tabs" aria-label="Danh mục chủ đề">
      {(['vocabularies', 'grammars'] as const).map(value =>
        <Link key={value} to={catalogLink(value)} aria-current={value === kind ? 'page' : undefined}>
          {value === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'}
        </Link>)}
    </nav>
    <div className="lc-toolbar">
      <label className="lc-search"><Icon name="search" /><input aria-label="Tìm chủ đề" placeholder="Tìm tên hoặc mô tả chủ đề…" maxLength={200} value={keyword} onChange={e => filter('keyword', e.target.value)} />{keyword && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => filter('keyword', '')}><Icon name="close" size={18} /></button>}</label>
      <label className="lt-filter"><span>Trình độ</span><select aria-label="Lọc theo trình độ JLPT" value={level} onChange={e => filter('level', e.target.value)}><option value="">Tất cả</option>{LEARNING_LEVELS.map(value => <option key={value}>{value}</option>)}</select></label>
    </div>
    {error ? <LearningFailure error={error} reload={reload} back={catalogLink(kind)} /> : loading ? <LearningLoading /> : data && <>
      <div className="lc-section-meta" aria-live="polite"><span>{data.total} chủ đề{level ? ` · ${level}` : ''}</span></div>
      {data.items.length ? <ul className="lt-topic-list" aria-label={catalog.title}>
        {data.items.map(topic => <li key={topic.id}>
          <Link className="lc-topic" to={topicHref(topic.id, params, kind, true)}>
            <div className="lt-topic-main">
              <h2>{topic.name}</h2>{topic.description && <p>{topic.description}</p>}
            </div>
            <div className="lt-topic-meta">
              <LevelBadge level={topic.jlptLevel} />
              <span>{kind === 'vocabularies' ? topic.vocabularyCount : topic.grammarCount} {catalog.unit}</span>
            </div>
            <span className="lt-topic-arrow"><Icon name="chevron_right" size={20} /></span>
          </Link>
        </li>)}
      </ul> : <EmptyState icon="search_off" title="Chưa có chủ đề phù hợp" action={<button type="button" className="jc-btn jc-btn--ghost" onClick={() => {
        const next = new URLSearchParams(params);
        next.delete('keyword');
        next.delete('level');
        next.delete('page');
        setParams(next, { replace: true });
      }}>Xóa bộ lọc</button>}>Thử thay đổi trình độ hoặc từ khóa tìm kiếm.</EmptyState>}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} label="chủ đề" busy={loading} onPage={onPage} />
    </>}
    </div>
  </LearningPage>;
}
