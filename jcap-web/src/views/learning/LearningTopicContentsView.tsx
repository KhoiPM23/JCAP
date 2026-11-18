import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { EmptyState } from '../../components/jcap/EmptyState';
import { JpText } from '../../components/jcap/JpText';
import type { LearnerContentPage, LearnerTopic, LearningContentKind } from '../../types/learnerLearning';
import { catalogHref, contentKind, positivePage } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, Pagination, useLearningResource } from './LearningShared';
import './learningContents.css';

export function LearningTopicContentsView() {
  const { topicId } = useParams();
  const [params, setParams] = useSearchParams();
  const kind = contentKind(params.get('tab'));
  const page = positivePage(params.get('page'));
  const keyword = (params.get('keyword') || '').slice(0, 200);
  const isVocabulary = kind === 'vocabularies';
  const query = new URLSearchParams({ page: String(page), pageSize: '20' });
  if (keyword) query.set('keyword', keyword);
  const { data, loading, error, reload } = useLearningResource<LearnerContentPage>(
    `topics/${topicId}/${kind}?${query}`, 200
  );
  const [knownTopic, setKnownTopic] = useState<LearnerTopic | null>(null);
  useEffect(() => {
    if (data) setKnownTopic(data.topic);
  }, [data]);
  const topic = data?.topic ?? (knownTopic?.id === Number(topicId) ? knownTopic : null);
  useEffect(() => {
    if (data && data.contents.page !== page) {
      const next = new URLSearchParams(params);
      next.set('page', String(data.contents.page));
      setParams(next, { replace: true });
    }
  }, [data, page, params, setParams]);

  function tab(nextKind: LearningContentKind) {
    const next = new URLSearchParams(params);
    next.set('tab', nextKind);
    next.delete('page');
    next.delete('keyword');
    setParams(next);
  }
  function search(value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set('keyword', value);
    else next.delete('keyword');
    next.delete('page');
    setParams(next, { replace: true });
  }
  const back = catalogHref(params);
  const showTabs = !params.has('catalogKind');
  const unit = isVocabulary ? 'từ vựng' : 'mẫu ngữ pháp';

  return <LearningPage>
    <div className="ll-page">
      <nav className="lc-breadcrumb" aria-label="Đường dẫn">
        <Link to={back}>Kho học liệu</Link>
        <Icon name="chevron_right" size={16} />
        <span aria-current="page">{topic?.name || 'Chủ đề'}</span>
      </nav>
      <header className="ll-heading">
        <div className="lc-heading-row">
          <h1>{topic?.name || 'Học theo chủ đề'}</h1>
          {topic && <LevelBadge level={topic.jlptLevel} />}
          <h2 className="ll-kind">{isVocabulary ? 'Từ vựng' : 'Ngữ pháp'}</h2>
        </div>
        {topic?.description && <p>{topic.description}</p>}
      </header>
      {showTabs && <div className="lc-tabs" role="tablist" aria-label="Loại học liệu">
        {(['vocabularies', 'grammars'] as const).map(value => <button
          id={`lc-tab-${value}`}
          type="button"
          role="tab"
          key={value}
          aria-controls="lc-content-panel"
          aria-selected={kind === value}
          tabIndex={kind === value ? 0 : -1}
          onClick={() => tab(value)}
          onKeyDown={event => {
            if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
            event.preventDefault();
            const target = event.key === 'Home' ? 'vocabularies' : event.key === 'End' ? 'grammars'
              : kind === 'vocabularies' ? 'grammars' : 'vocabularies';
            tab(target);
            document.getElementById(`lc-tab-${target}`)?.focus();
          }}
        >
          <Icon name={value === 'vocabularies' ? 'translate' : 'format_quote'} />
          {value === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'}
          {topic && <span className="lc-tab-count">{value === 'vocabularies' ? topic.vocabularyCount : topic.grammarCount}</span>}
        </button>)}
      </div>}

      <div className="ll-sheet">
        <div className="ll-toolbar">
          {data && <span className="ll-total">{data.contents.total} {unit}</span>}
          <label className="lc-search">
            <Icon name="search" size={19} />
            <input
              aria-label="Tìm học liệu trong chủ đề"
              placeholder={isVocabulary ? 'Tìm từ, cách đọc hoặc nghĩa…' : 'Tìm mẫu, cách đọc hoặc nghĩa…'}
              maxLength={200}
              value={keyword}
              onChange={event => search(event.target.value)}
            />
            {keyword && <button type="button" aria-label="Xóa tìm kiếm" onClick={() => search('')}><Icon name="close" size={18} /></button>}
          </label>
        </div>

        <section
          id="lc-content-panel"
          role={showTabs ? 'tabpanel' : undefined}
          aria-labelledby={showTabs ? `lc-tab-${kind}` : undefined}
          aria-label={showTabs ? undefined : `Danh sách ${unit}`}
          aria-busy={loading}
        >
          {error ? <LearningFailure error={error} reload={reload} back={back} />
            : loading ? <LearningLoading />
              : data && <>
                <div aria-live="polite" className="sr-only">{data.contents.total} kết quả · trang {data.contents.page}</div>
                {data.contents.items.length ? <>
                  <div className="ll-column-headings" aria-hidden="true">
                    <span>{isVocabulary ? 'Từ và cách đọc' : 'Mẫu và cách đọc'}</span>
                    <span>Nghĩa tiếng Việt</span>
                  </div>
                  <ul className="lc-content-list">
                    {data.contents.items.map(item => <li key={item.id}>
                      <Link className="lc-content-row" to={`/learning/topics/${topicId}/${kind}/${item.id}?${params}`}>
                        <div className="ll-word">
                          <JpText text={item.text} className="lc-row-japanese" />
                          {item.reading && <p className="lc-row-reading" lang="ja">{item.reading}</p>}
                        </div>
                        <div className="ll-definition">
                          <p className="lc-row-meaning">{item.meaning}</p>
                          {item.partOfSpeech && <p className="lc-row-pos">{item.partOfSpeech}</p>}
                        </div>
                        <span className="lc-row-arrow"><Icon name="chevron_right" size={20} /></span>
                      </Link>
                    </li>)}
                  </ul>
                </> : <EmptyState
                  icon={keyword ? 'search_off' : 'menu_book'}
                  title={keyword ? 'Không có học liệu phù hợp' : isVocabulary ? 'Chưa có từ vựng trong chủ đề' : 'Chưa có ngữ pháp trong chủ đề'}
                  action={keyword ? <button className="jc-btn jc-btn--ghost" onClick={() => search('')}>Xóa tìm kiếm</button> : <Link className="jc-btn jc-btn--ghost" to={back}>Về kho học liệu</Link>}
                >
                  {keyword ? 'Thử tìm bằng tiếng Nhật, cách đọc hoặc nghĩa tiếng Việt.' : 'Chọn chủ đề khác trong kho học liệu.'}
                </EmptyState>}
                <Pagination
                  page={data.contents.page}
                  pageSize={data.contents.pageSize}
                  total={data.contents.total}
                  label={unit}
                  busy={loading}
                  onPage={value => {
                    const next = new URLSearchParams(params);
                    next.set('page', String(value));
                    setParams(next);
                  }}
                />
              </>}
        </section>
      </div>
    </div>
  </LearningPage>;
}
