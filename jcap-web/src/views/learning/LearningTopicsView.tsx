import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { EmptyState } from '../../components/jcap/EmptyState';
import type { LearnerPage, LearnerTopic, LearningContentKind } from '../../types/learnerLearning';
import { contentKind, LEARNING_LEVELS, positivePage, topicHref } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, Pagination, useLearningResource } from './LearningShared';

const catalogs = {
  vocabularies: { title: 'Chủ đề từ vựng', icon: 'translate', unit: 'từ vựng', description: 'Tìm từ vựng theo tình huống như ăn uống, mua sắm và di chuyển.' },
  grammars: { title: 'Chủ đề ngữ pháp', icon: 'format_quote', unit: 'mẫu ngữ pháp', description: 'Tìm mẫu câu theo điều bạn muốn diễn đạt, như yêu cầu, xin phép hoặc đối chiếu.' },
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
    <header className="lc-heading"><span className="lc-eyebrow">Kho học liệu</span><h1>Học theo chủ đề</h1><p>{catalog.description}</p></header>
    <nav className="lc-tabs lc-catalog-tabs" aria-label="Danh mục chủ đề">
      {(['vocabularies', 'grammars'] as const).map(value =>
        <Link key={value} to={catalogLink(value)} aria-current={value === kind ? 'page' : undefined}>
          <Icon name={catalogs[value].icon} />{catalogs[value].title}
        </Link>)}
    </nav>
    <div className="lc-toolbar">
      <label className="lc-filter"><span>Trình độ JLPT</span><select value={level} onChange={e => filter('level', e.target.value)}><option value="">Tất cả trình độ</option>{LEARNING_LEVELS.map(l => <option key={l}>{l}</option>)}</select></label>
      <label className="lc-search"><Icon name="search" /><input aria-label="Tìm chủ đề" placeholder="Tìm tên hoặc mô tả chủ đề…" maxLength={200} value={keyword} onChange={e => filter('keyword', e.target.value)} />{keyword && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => filter('keyword', '')}><Icon name="close" size={18} /></button>}</label>
    </div>
    {error ? <LearningFailure error={error} reload={reload} back={catalogLink(kind)} /> : loading ? <LearningLoading /> : data && <>
      <div className="lc-section-meta" aria-live="polite"><span>{data.total} chủ đề{level ? ` · ${level}` : ''}</span><span>Chọn chủ đề để bắt đầu</span></div>
      {data.items.length ? <div className="lc-topic-grid">
        {data.items.map(topic => <Link key={topic.id} className="lc-topic" to={topicHref(topic.id, params, kind, true)}>
          <div className="lc-topic-top"><span className="lc-topic-icon"><Icon name={catalog.icon} size={25} /></span><LevelBadge level={topic.jlptLevel} /></div>
          <h2>{topic.name}</h2><p>{topic.description || `Khám phá ${catalog.unit} trong chủ đề này.`}</p>
          <div className="lc-topic-bottom"><span>{kind === 'vocabularies' ? topic.vocabularyCount : topic.grammarCount} {catalog.unit}</span><Icon name="arrow_forward" size={19} /></div>
        </Link>)}
      </div> : <EmptyState icon="search_off" title="Chưa có chủ đề phù hợp">Thử thay đổi trình độ hoặc từ khóa tìm kiếm.</EmptyState>}
      <Pagination page={data.page} pageSize={data.pageSize} total={data.total} label="chủ đề" busy={loading} onPage={onPage} />
    </>}
  </LearningPage>;
}
