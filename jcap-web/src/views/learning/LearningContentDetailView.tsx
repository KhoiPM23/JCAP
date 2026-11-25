import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { JpText } from '../../components/jcap/JpText';
import type { LearnerContentDetail, LearnerSource } from '../../types/learnerLearning';
import { catalogHref, contentKind, exampleText, sourceHref } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, useLearningResource } from './LearningShared';
import './learningDetail.css';

function SourceDisclosure({ source, example = false }: { source: LearnerSource; example?: boolean }) {
  const url = sourceHref(source.sourceUrl);
  const licenseUrl = sourceHref(source.licenseUrl);
  return <details className="lc-source">
    <summary><Icon name="info" size={17} /><span>{example ? 'Nguồn câu ví dụ · ' : ''}{source.name} · {source.license}</span></summary>
    <div className="lc-source-body">
      <p><strong>Phiên bản</strong> {source.version}</p>
      <p>{url ? <a href={url} target="_blank" rel="noreferrer">{source.name}<Icon name="open_in_new" size={14} /></a> : source.name}</p>
      <p>{licenseUrl ? <a href={licenseUrl} target="_blank" rel="noreferrer">{source.license}</a> : source.license}</p>
      {source.externalId && <p><strong>Mã bản ghi</strong> {source.externalId}</p>}
      <p className="lc-attribution">{source.attribution}</p>
    </div>
  </details>;
}

export function LearningContentDetailView() {
  const { topicId, kind: routeKind, contentId } = useParams();
  const [params] = useSearchParams();
  const [furigana, setFurigana] = useState(true);
  const kind = contentKind(routeKind ?? null);
  const isVocabulary = kind === 'vocabularies';
  const validKind = routeKind === 'vocabularies' || routeKind === 'grammars';
  const request = new URLSearchParams({ pageSize: '20' });
  const keyword = (params.get('keyword') || '').slice(0, 200);
  if (keyword) request.set('keyword', keyword);
  const { data, loading, error, reload } = useLearningResource<LearnerContentDetail>(
    `topics/${topicId}/${validKind ? kind : 'invalid'}/${contentId}?${request}`
  );
  const listParams = new URLSearchParams(params);
  listParams.set('tab', kind);
  const list = `/learning/topics/${topicId}?${listParams}`;
  function neighbor(id: number, page: number) {
    const next = new URLSearchParams(listParams);
    next.set('page', String(page));
    return `/learning/topics/${topicId}/${kind}/${id}?${next}`;
  }

  return <LearningPage>
    <div className="ld-page">
      <nav className="lc-breadcrumb" aria-label="Đường dẫn">
        <Link to={catalogHref(params)}>Kho học liệu</Link>
        <Icon name="chevron_right" size={16} />
        <Link to={list}>{data?.topic.name || 'Chủ đề'}</Link>
        <Icon name="chevron_right" size={16} />
        <span aria-current="page">{isVocabulary ? 'Chi tiết từ vựng' : 'Chi tiết ngữ pháp'}</span>
      </nav>
      {error ? <LearningFailure error={error} reload={reload} back={list} />
        : loading ? <LearningLoading />
          : data && <>
            <article className="ld-article">
              <header className="ld-hero">
                <div className="ld-word">
                  <div className="ld-labels">
                    <span className="ld-kind"><Icon name={isVocabulary ? 'translate' : 'format_quote'} size={17} />{isVocabulary ? 'Từ vựng' : 'Ngữ pháp'}</span>
                    <LevelBadge level={data.item.jlptLevel} />
                  </div>
                  <h1 lang="ja">{data.item.text}</h1>
                  {data.item.reading && <p className="ld-reading" lang="ja">{data.item.reading}</p>}
                </div>
                <div className="ld-definition">
                  <span className="ld-caption">Nghĩa tiếng Việt</span>
                  <p className="ld-meaning">{data.item.meaning}</p>
                  {data.item.partOfSpeech && <p className="ld-pos">{data.item.partOfSpeech}</p>}
                </div>
              </header>
              {data.item.formation && <section className="ld-panel" id="learning-formation">
                <h2>Cấu trúc</h2>
                <p className="ld-formation" lang="ja">{data.item.formation}</p>
              </section>}
              <section className="ld-panel" id="learning-explanation">
                <h2>Giải thích</h2>
                <p className="ld-prose">{data.explanation || 'Chưa có giải thích chi tiết cho mục này.'}</p>
              </section>
              <section className="ld-panel" id="learning-examples">
                <div className="ld-section-heading">
                  <h2>Câu ví dụ{data.examples.length > 0 && <span className="ld-count">{data.examples.length}</span>}</h2>
                  {data.examples.length > 0 && <label className="ld-reading-toggle">
                    <input type="checkbox" checked={furigana} onChange={event => setFurigana(event.target.checked)} />
                    <span className="ld-switch" aria-hidden="true" />
                    Hiện cách đọc
                  </label>}
                </div>
                {data.examples.length ? <ul className="ld-examples">
                  {data.examples.map((example, index) => <li key={example.id || `legacy-${index}`}>
                    <JpText as="p" text={exampleText(example.japaneseText, example.furigana)} furigana={furigana} size="lg" />
                    <p className="ld-translation">{example.vietnameseTranslation || 'Chưa có bản dịch tiếng Việt.'}</p>
                    {example.source && <SourceDisclosure source={example.source} example />}
                  </li>)}
                </ul> : <p className="ld-prose">Chưa có câu ví dụ cho mục này.</p>}
              </section>
              {data.usageNotes && <section className="ld-panel ld-usage" id="learning-usage">
                <h2>Lưu ý sử dụng</h2>
                <p className="ld-prose">{data.usageNotes}</p>
              </section>}
              {data.sources.length > 0 && <section className="ld-panel ld-sources" id="learning-sources">
                <h2>Nguồn và giấy phép</h2>
                {data.sources.map((source, index) => <SourceDisclosure key={`${source.name}-${source.version}-${source.externalId}-${index}`} source={source} />)}
              </section>}
            </article>
            <nav className="ld-pagination" aria-label="Chuyển học liệu">
              {data.previousId !== null ? <Link to={neighbor(data.previousId, data.previousPage)}><Icon name="arrow_back" size={18} />Mục trước</Link> : <span />}
              <Link className="ld-return" to={list}><Icon name="list" size={18} />Về danh sách</Link>
              {data.nextId !== null ? <Link to={neighbor(data.nextId, data.nextPage)}>Mục tiếp theo<Icon name="arrow_forward" size={18} /></Link> : <span />}
            </nav>
          </>}
    </div>
  </LearningPage>;
}
