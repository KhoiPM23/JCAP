import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/jcap/Icon';
import { JpText } from '../../components/jcap/JpText';
import type { LearnerContentDetail, LearnerSource } from '../../types/learnerLearning';
import { catalogHref, contentKind, exampleText, sourceHref, topicHref } from './learningNavigation';
import { LearningFailure, LearningLoading, LearningPage, LevelBadge, useLearningResource } from './LearningShared';

function SourceDisclosure({ source, example = false }: { source: LearnerSource; example?: boolean }) {
  const url = sourceHref(source.sourceUrl); const licenseUrl = sourceHref(source.licenseUrl);
  return <details className="lc-source"><summary><Icon name="info" size={17} /><span>{example ? 'Nguồn câu ví dụ: ' : ''}{source.name} · {source.license}</span></summary><div className="lc-source-body"><p><strong>Phiên bản:</strong> {source.version}</p><p><strong>Nguồn:</strong> {url ? <a href={url} target="_blank" rel="noreferrer">{source.name}<Icon name="open_in_new" size={14} /></a> : source.name}</p><p><strong>Giấy phép:</strong> {licenseUrl ? <a href={licenseUrl} target="_blank" rel="noreferrer">{source.license}</a> : source.license}</p>{source.externalId && <p><strong>Mã bản ghi nguồn:</strong> {source.externalId}</p>}<p className="lc-attribution">{source.attribution}</p></div></details>;
}
export function LearningContentDetailView() {
  const { topicId, kind: routeKind, contentId } = useParams(); const [params] = useSearchParams(); const [furigana, setFurigana] = useState(true);
  const kind = contentKind(routeKind ?? null); const validKind = routeKind === 'vocabularies' || routeKind === 'grammars';
  const request = new URLSearchParams({ pageSize: '20' }); const keyword = (params.get('keyword') || '').slice(0, 200); if (keyword) request.set('keyword', keyword);
  const { data, loading, error, reload } = useLearningResource<LearnerContentDetail>(`topics/${topicId}/${validKind ? kind : 'invalid'}/${contentId}?${request}`);
  const listParams = new URLSearchParams(params); listParams.set('tab', kind);
  const list = `/learning/topics/${topicId}?${listParams}`;
  function neighbor(id: number, page: number) { const next = new URLSearchParams(listParams); next.set('page', String(page)); return `/learning/topics/${topicId}/${kind}/${id}?${next}`; }
  return <LearningPage><nav className="lc-breadcrumb" aria-label="Đường dẫn"><Link to={catalogHref(params)}>Kho học liệu</Link><Icon name="chevron_right" size={16} /><Link to={list}>{data?.topic.name || 'Chủ đề'}</Link><Icon name="chevron_right" size={16} /><Link to={list}>{kind === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'}</Link><Icon name="chevron_right" size={16} /><span>Chi tiết</span></nav>
    {error ? <LearningFailure error={error} reload={reload} back={list} /> : loading ? <LearningLoading /> : data && <div className="lc-detail-grid"><div className="lc-detail-main"><article className="lc-article"><header className="lc-article-header"><div className="lc-actions"><LevelBadge level={data.item.jlptLevel} /><span className="lc-type-label">{kind === 'vocabularies' ? 'Từ vựng' : 'Ngữ pháp'}</span></div><h1 lang="ja">{data.item.text}</h1>{data.item.reading && <p className="lc-detail-reading" lang="ja">{data.item.reading}</p>}<p className="lc-detail-meaning">{data.item.meaning}</p>{data.item.partOfSpeech && <p className="lc-detail-pos">{data.item.partOfSpeech}</p>}</header>
      {data.item.formation && <section className="lc-detail-section"><h2><Icon name="code" />Cấu trúc</h2><p className="lc-formation">{data.item.formation}</p></section>}
      <section className="lc-detail-section"><h2><Icon name="menu_book" />Giải thích</h2><p className="lc-prose">{data.explanation || 'Chưa có giải thích chi tiết cho mục này.'}</p></section>
      <section className="lc-detail-section"><div className="lc-example-heading"><h2><Icon name="format_quote" />Câu ví dụ</h2>{data.examples.length > 0 && <label className="lc-furigana"><input type="checkbox" checked={furigana} onChange={e => setFurigana(e.target.checked)} />Hiện cách đọc</label>}</div>{data.examples.length ? <ol className="lc-examples">{data.examples.map((example, index) => <li key={example.id || `legacy-${index}`}><span className="lc-example-number" aria-hidden="true">{index + 1}</span><div className="lc-example-content"><JpText as="p" text={exampleText(example.japaneseText, example.furigana)} furigana={furigana} size="lg" /><p className="lc-example-translation">{example.vietnameseTranslation || 'Chưa có bản dịch tiếng Việt.'}</p>{example.source && <SourceDisclosure source={example.source} example />}</div></li>)}</ol> : <p className="lc-muted">Chưa có câu ví dụ cho mục này.</p>}</section>
      {data.usageNotes && <section className="lc-detail-section"><div className="lc-usage"><h2><Icon name="lightbulb" />Lưu ý sử dụng</h2><p className="lc-prose">{data.usageNotes}</p></div></section>}
      {data.sources.length > 0 && <section className="lc-detail-section"><h2><Icon name="source" />Nguồn và giấy phép</h2>{data.sources.map((source, index) => <SourceDisclosure key={`${source.name}-${source.version}-${source.externalId}-${index}`} source={source} />)}</section>}
    </article><nav className="lc-detail-navigation" aria-label="Chuyển học liệu">{data.previousId !== null ? <Link to={neighbor(data.previousId, data.previousPage)}><Icon name="arrow_back" size={19} />Mục trước</Link> : <span />}<Link to={list}>Về danh sách</Link>{data.nextId !== null ? <Link to={neighbor(data.nextId, data.nextPage)}>Mục tiếp theo<Icon name="arrow_forward" size={19} /></Link> : <span />}</nav></div>
    <aside className="lc-detail-aside"><section><h2>Thông tin</h2><p>Trình độ: <strong>{data.item.jlptLevel}</strong></p><p>{kind === 'vocabularies' ? data.item.partOfSpeech ? `Từ loại: ${data.item.partOfSpeech}` : 'Loại học liệu: Từ vựng' : 'Loại học liệu: Ngữ pháp'}</p><p>{data.examples.length} câu ví dụ</p></section><section><h2>Trong các chủ đề</h2><div className="lc-topic-links">{data.topics.map(t => <Link key={t.id} to={topicHref(t.id, params, kind)} aria-current={t.id === data.topic.id ? 'true' : undefined}>{t.name}<Icon name="chevron_right" size={16} /></Link>)}</div></section></aside>
    </div>}
  </LearningPage>;
}
