import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import logoMark from '../../assets/jcap-logo-mark.svg';
import { JpText, ScoreRing, WordDiff, type DiffToken } from '../../components/jcap';
import { PREFECTURES, type PrefectureShape } from '../../data/japanMap';
import { DemoStamp, InkFilter, MAINLAND, MAP_VB, MAP_VB_ATTR, Msr } from './landingArt';
import { creditService } from '../../services/creditService';
import { subscriptionPlanService } from '../../services/subscriptionPlanService';
import type { CreditPackage } from '../../types/credit';
import './landing.css';

/**
 * Landing page cho khách chưa đăng nhập ở "/" (design-handoff mục 9d, bản 3; prototype/Landing.dc.html).
 * Nội dung bám đúng hệ thống đang chạy: không nhắc quy tắc mở chương theo % con dấu, không có số liệu học viên.
 */

/** Toạ độ bản đồ -> % trong khung (khung giữ đúng tỉ lệ viewBox nên % khớp vị trí) */
const pct = (p: PrefectureShape) => ({
  x: Math.round(((p.labelPos[0] - MAP_VB[0]) / MAP_VB[2]) * 1000) / 10,
  y: Math.round(((p.labelPos[1] - MAP_VB[1]) / MAP_VB[3]) * 1000) / 10,
});
const prefById = (id: number) => PREFECTURES.find((p) => p.id === id)!;

interface HeroSpot {
  ch: string;
  prefId: number;
  /** Đầu nét đứt phía thẻ (%), như prototype */
  to: [number, number];
  kind: string;
  jp: string;
  vi: string;
  card: React.CSSProperties;
  /** Ẩn trên điện thoại (chỉ giữ Hokkaido và Tokyo) */
  hideM?: boolean;
  /** Thẻ Tokyo đổi chỗ trên điện thoại */
  tk?: boolean;
}

const HERO_SPOTS: HeroSpot[] = [
  { ch: '宿', prefId: 1, to: [73, 10], kind: 'Khách sạn', jp: 'チェックインをお{願|ねが}いします。', vi: 'Cho tôi nhận phòng.', card: { right: 'calc(20.5% + 30px)', top: '1%' } },
  { ch: '食', prefId: 27, to: [24, 50], kind: 'Quán ăn', jp: 'おすすめは{何|なん}ですか。', vi: 'Món nào quán mình ngon nhất ạ?', card: { left: 0, top: '30%' }, hideM: true },
  { ch: '駅', prefId: 13, to: [75, 71], kind: 'Nhà ga', jp: '{新宿|しんじゅく}に{行|い}きますか。', vi: 'Tàu này có đi Shinjuku không?', card: { right: -40, top: '71%' }, tk: true },
  { ch: '医', prefId: 40, to: [28, 90], kind: 'Phòng khám', jp: '{熱|ねつ}があります。', vi: 'Tôi bị sốt.', card: { left: '23%', top: '90%' }, hideM: true },
];

const PAINS: [string, string][] = [
  ['Không có ai để nói cùng.', 'Học trên app thì hiểu, nhưng gần như chẳng có lúc nào phải mở miệng.'],
  ['Không phản xạ kịp.', 'Người đối diện vừa hỏi xong là đầu trống trơn.'],
  ['Không biết mình sai ở đâu.', 'Nói xong không ai sửa, lỗi cứ lặp lại.'],
  ['Học rời rạc.', 'Mỗi bài một chủ đề, không thấy mình đang đi tới đâu.'],
];

const STEPS: { n: string; title: string; note: string }[] = [
  { n: '一', title: 'Nói theo câu mẫu', note: 'Shadowing, chấm từng âm' },
  { n: '二', title: 'Hội thoại với nhân vật', note: 'AI đóng vai, có nhiệm vụ' },
  { n: '三', title: 'Nhận con dấu', note: 'Gom vào Sổ con dấu' },
];

const DIFF: DiffToken[] = [
  { text: '温めて', reading: 'あたためて', status: 'ok' },
  { text: 'もらえ', status: 'ok' },
  { text: 'ます', status: 'ok' },
  { text: 'か', status: 'missing' },
];

const REGISTERS = [
  { av: '友', cls: 'f', who: 'Bạn bè', note: 'Nói thân mật, câu ngắn', jp: 'もう{一回|いっかい}{言|い}って。', vi: 'Nói lại lần nữa đi.' },
  { av: '店', cls: 's', who: 'Nhân viên cửa hàng', note: 'Lịch sự, dạng です・ます', jp: 'すみません、もう{一度|いちど}お{願|ねが}いします。', vi: 'Xin lỗi, nói lại giúp tôi với.' },
  { av: '面', cls: 'i', who: 'Người phỏng vấn', note: 'Kính ngữ trang trọng', jp: '{恐|おそ}れ{入|い}りますが、もう{一度|いちど}おっしゃっていただけますか。', vi: 'Thật ngại quá, anh/chị có thể nói lại một lần nữa được không ạ?' },
];

const HOW = [
  { n: '一', title: 'Chọn chương trên bản đồ', text: 'Mỗi chương gồm nhiều địa điểm, mỗi địa điểm là một tình huống giao tiếp.' },
  { n: '二', title: 'Luyện ở từng địa điểm', text: 'Shadowing để quen câu, rồi Hội thoại AI để dùng câu đó trong tình huống thật.' },
  { n: '三', title: 'Nhận con dấu', text: 'Học xong ở đâu, sổ của bạn có thêm con dấu của nơi đó.' },
];

const FAQ: [string, string][] = [
  ['Tôi chưa biết tiếng Nhật thì có học được không?', 'Nội dung bắt đầu từ cấp N5. Bạn nên thuộc hiragana và katakana trước, khi đó mới theo kịp các câu mẫu và hội thoại.'],
  ['“Học tập thích ứng” ở JCAP nghĩa là gì?', 'Trong Hội thoại AI, mỗi lượt hệ thống đo thời gian bạn trả lời, số lần xem bản dịch và mức gợi ý bạn dùng. Nếu bạn đang lưỡng lự, nhân vật nói câu ngắn và dễ hơn, kèm gợi ý. Nếu bạn phản xạ tốt, nhân vật nói tự nhiên hơn. Sau mỗi buổi, hồ sơ phản xạ của bạn được cập nhật để các buổi sau vừa sức.'],
  ['Shadowing chấm phát âm như thế nào?', 'Bạn nói theo câu mẫu, hệ thống nhận dạng giọng nói của bạn rồi so với câu mẫu theo từng âm. Một từ chỉ được tính đúng khi khớp hết các âm của từ đó, và bạn thấy ngay từ nào chưa khớp.'],
  ['Credit là gì, có bắt buộc mua không?', 'Credit chỉ dùng cho Hội thoại AI và để mở khoá bộ Flashcard. Shadowing, Hành trình và Sổ con dấu luôn miễn phí, nên bạn có thể học mà không mua gì.'],
  ['Học trên điện thoại được không?', 'Bạn mở JCAP bằng trình duyệt là học được. Phần Shadowing dùng nhận dạng giọng nói của trình duyệt, nên chúng tôi khuyên dùng Chrome trên máy tính hoặc điện thoại Android.'],
  ['Tiến độ học có được lưu lại không?', 'Có. Mỗi buổi Shadowing được lưu lịch sử, kết quả Hội thoại AI được lưu lại, và con dấu của bạn nằm trong Sổ con dấu.'],
];

const money = (n: number) => `${n.toLocaleString('vi-VN')}đ`;
/** "Gói Trải Nghiệm" -> "Trải Nghiệm"; "Gói Tháng Pro Max (Chuyên Sâu)" -> "Pro Max" */
const shortName = (name: string) => name.replace(/^Gói\s+(Tháng\s+)?/i, '').replace(/\s*\(.*\)\s*$/, '').trim();

/** Bản đồ cả nước (bỏ Okinawa) vẽ từ PREFECTURES; classFor tô trạng thái từng tỉnh */
const JapanSilhouette: React.FC<{ classFor?: (p: PrefectureShape) => string | undefined }> = ({ classFor }) => (
  <svg className="jmap" viewBox={MAP_VB_ATTR} aria-hidden="true" preserveAspectRatio="xMidYMid meet">
    {MAINLAND.map((p) => (
      <path key={p.id} className={classFor?.(p)} d={p.d} fillRule="evenodd" />
    ))}
  </svg>
);

const REGION_ORDER = ['kanto', 'chubu', 'kansai', 'tohoku', 'chugoku', 'kyushu', 'hokkaido', 'shikoku'] as const;

/** Bản đồ nhỏ ở bước "Nhận con dấu": Kanto đang học, đường đi qua 3 nơi đã có dấu */
const MiniRouteMap: React.FC = () => (
  <svg className="mini" style={{ width: 160, height: 176 }} viewBox={MAP_VB_ATTR} role="img" aria-label="Bản đồ Nhật Bản, vùng Kanto đang học">
    {REGION_ORDER.map((r) => (
      <g key={r} className={r === 'kanto' ? 'mr on' : 'mr'}>
        {MAINLAND.filter((p) => p.region === r).map((p) => (
          <path key={p.id} d={p.d} fillRule="evenodd" />
        ))}
      </g>
    ))}
    <polyline points="1471,1028 1362,989 1415,1027 1362,1052" fill="none" stroke="var(--shu)" strokeWidth={5} strokeDasharray="12 10" strokeLinecap="round" />
    <circle cx={1362} cy={989} r={10} fill="var(--ai)" />
    {[
      [1471, 1028],
      [1415, 1027],
      [1362, 1052],
    ].map(([cx, cy]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={15} fill="none" stroke="var(--shu)" strokeWidth={7} />
    ))}
  </svg>
);

interface PriceRow {
  key: string;
  name: string;
  detail: string;
  price: string;
  plan?: boolean;
}

/** Bảng giá đọc từ dữ liệu thật: gói Credit (API công khai) và gói tháng (subscriptionPlanService) */
const usePriceRows = () => {
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    creditService.getPackages().then((res) => {
      if (!alive) return;
      if (res.success && res.data) setPackages(res.data);
      else setError(res.message || 'Chưa tải được bảng giá.');
    });
    return () => {
      alive = false;
    };
  }, []);

  const plans = useMemo(() => subscriptionPlanService.getPlans().filter((p) => p.isActive), []);

  const rows = useMemo<PriceRow[] | null>(() => {
    if (!packages) return null;
    const pk = packages
      .filter((p) => p.isActive)
      .sort((a, b) => a.price - b.price)
      .map<PriceRow>((p) => ({ key: `pk-${p.id}`, name: shortName(p.name), detail: `${p.credits.toLocaleString('vi-VN')} Credit`, price: money(p.price) }));
    const pl = plans.map<PriceRow>((p, i) => ({
      key: `pl-${p.id}`,
      name: shortName(p.name),
      detail: `${p.creditsAmount.toLocaleString('vi-VN')} Credit mỗi tuần, tối đa ${p.fiveHourQuota.toLocaleString('vi-VN')} mỗi 5 giờ`,
      price: `${money(p.price)}/tháng`,
      plan: i === 0,
    }));
    return [...pk, ...pl];
  }, [packages, plans]);

  return { rows, error };
};

export const LandingView: React.FC = () => {
  const navigate = useNavigate();
  const [tab, setTab] = useState(1);
  const [faq, setFaq] = useState(0);
  const { rows, error } = usePriceRows();

  const goRegister = () => navigate('/register');
  const goLogin = () => navigate('/login');

  useEffect(() => {
    const prev = document.title;
    document.title = 'JCAP · Luyện nói tiếng Nhật từ N5 đến N3';
    return () => {
      document.title = prev;
    };
  }, []);

  const heroPins = useMemo(() => HERO_SPOTS.map((s) => ({ ...s, at: pct(prefById(s.prefId)) })), []);

  return (
    <div className="lp" data-theme="kham-pha">
      <InkFilter />

      <header className="nav">
        <div className="wrap">
          <a className="lp-brand" href="#h-hero">
            <img src={logoMark} alt="" />
            JCAP
          </a>
          <nav className="nlinks" aria-label="Trang">
            <a href="#thu">Tính năng</a>
            <a href="#bang-gia">Bảng giá</a>
            <a href="#cau-hoi">Câu hỏi</a>
          </nav>
          <span className="sp" />
          <button type="button" className="txtbtn login" onClick={goLogin}>
            Đăng nhập
          </button>
          <button type="button" className="btn-main sm" onClick={goRegister}>
            Bắt đầu miễn phí
          </button>
        </div>
      </header>

      <main>
        {/* Phần đầu */}
        <section className="hero3" aria-labelledby="h-hero">
          <div className="wrap">
            <div>
              <p className="lvl" aria-label="Trình độ JLPT từ N5 đến N3">
                <span className="t" aria-hidden="true">JLPT</span>
                <b aria-hidden="true">N5</b>
                <i aria-hidden="true" />
                <b aria-hidden="true">N4</b>
                <i aria-hidden="true" />
                <b aria-hidden="true">N3</b>
              </p>
              <h1 className="h1" id="h-hero" style={{ marginTop: 18 }}>
                <span className="nb">Đường ngàn dặm</span> <span className="nb">cũng bắt đầu</span> <span className="nb">từ một câu nói</span>
              </h1>
              <span className="jpline" lang="ja">
                <ruby>
                  千里<rt>せんり</rt>
                </ruby>
                の
                <ruby>
                  道<rt>みち</rt>
                </ruby>
                も
                <ruby>
                  一歩<rt>いっぽ</rt>
                </ruby>
                から。
              </span>
              <div className="ctas">
                <button type="button" className="btn-main" onClick={goRegister}>
                  Bắt đầu miễn phí
                </button>
                <a className="btn-line" href="#thu">
                  Xem thử một bài
                </a>
              </div>
            </div>
            <div className="jstage" role="img" aria-label="Bản đồ Nhật Bản với bốn tình huống luyện nói: khách sạn, quán ăn, nhà ga, phòng khám">
              <JapanSilhouette />
              <svg className="ldr" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
                {heroPins.map((s) => (
                  <line key={s.ch} className={s.hideM ? 'hide-m' : undefined} x1={s.at.x} y1={s.at.y} x2={s.to[0]} y2={s.to[1]} />
                ))}
              </svg>
              {heroPins.map((s, i) => (
                <span key={s.ch} className={`pin pop e${i + 1}`} style={{ left: `${s.at.x}%`, top: `${s.at.y}%` }} lang="ja" aria-hidden="true">
                  {s.ch}
                </span>
              ))}
              {heroPins.map((s, i) => (
                <div key={s.kind} className={`scard pop e${i + 1}${s.hideM ? ' hide-m' : ''}${s.tk ? ' tk' : ''}`} style={s.card}>
                  <span className="k">{s.kind}</span>
                  <JpText text={s.jp} furigana size="sm" />
                  <div className="vi">{s.vi}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Câu mở */}
        <section className="ask" aria-labelledby="h-ask">
          <div className="wrap">
            <p className="q" lang="ja" id="h-ask">
              <span className="nb">すみません、</span>
              <span className="nb">
                もう
                <ruby>
                  一度<rt>いちど</rt>
                </ruby>
                お
                <ruby>
                  願<rt>ねが</rt>
                </ruby>
                いします。
              </span>
            </p>
            <p className="qvi">Xin lỗi, bạn nói lại giúp tôi được không?</p>
            <p className="lead2">Nếu đây là câu bạn nói nhiều nhất mỗi khi người Nhật bắt chuyện, bạn không thiếu kiến thức. Bạn thiếu chỗ để luyện nói.</p>
            <ul className="pains">
              {PAINS.map(([b, s]) => (
                <li key={b}>
                  <b>{b}</b> <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Ba bước luyện */}
        <section className="sec" id="thu" aria-labelledby="h-try">
          <div className="wrap">
            <h2 className="h2" id="h-try">
              Mỗi tình huống, ba bước luyện.
            </h2>
            <div className="try">
              <ol className="steps3" aria-label="Ba bước ở một địa điểm">
                {STEPS.map((s, i) => (
                  <li key={s.n}>
                    <button type="button" className={tab === i + 1 ? 'on' : undefined} onClick={() => setTab(i + 1)} aria-pressed={tab === i + 1}>
                      <span className="n" lang="ja" aria-hidden="true">
                        {s.n}
                      </span>
                      <b>{s.title}</b>
                      <small>{s.note}</small>
                    </button>
                  </li>
                ))}
              </ol>
              <div>
                {tab === 1 && (
                  <div className="panel" aria-label="Nói theo câu mẫu">
                    <div className="ptop">
                      <span>
                        <b>Cửa hàng tiện lợi</b>, câu 2 trên 6
                      </span>
                      <span className="lp-tag free">Miễn phí</span>
                    </div>
                    <div className="shd">
                      <div className="shd-l">
                        <div>
                          <span className="lbl">Câu mẫu</span>
                          <div style={{ marginTop: 6 }}>
                            <JpText text="{温|あたた}めてもらえますか。" furigana size="lg" />
                          </div>
                          <div style={{ marginTop: 4, fontSize: 15, color: 'var(--sumi-muted)' }}>Bạn hâm nóng giúp tôi được không?</div>
                        </div>
                        <div>
                          <span className="lbl">Bạn vừa nói</span>
                          <div style={{ marginTop: 8 }}>
                            <WordDiff tokens={DIFF} showLegend />
                          </div>
                        </div>
                      </div>
                      <ScoreRing value={86} size={104} label="Độ khớp" />
                    </div>
                    <p className="cap">Hệ thống chấm độ khớp phát âm theo từng âm. Một từ chỉ được tính đúng khi bạn nói khớp hết các âm của từ đó.</p>
                  </div>
                )}
                {tab === 2 && (
                  <div className="panel" aria-label="Hội thoại với nhân viên">
                    <div className="ptop">
                      <span>
                        <b>Cửa hàng tiện lợi</b>, quầy thu ngân
                      </span>
                      <span className="lp-tag cr">Dùng Credit</span>
                    </div>
                    <div>
                      <span className="task done">
                        <Msr name="check_circle" />
                        Nhờ hâm nóng cơm hộp
                      </span>
                      <span className="task">
                        <Msr name="radio_button_unchecked" style={{ color: 'var(--sumi-faint)' }} />
                        Trả lời về túi đựng
                      </span>
                    </div>
                    <div className="mrow">
                      <span className="av" lang="ja">店</span>
                      <div className="mb">
                        <JpText text="お{弁当|べんとう}、{温|あたた}めますか。" furigana size="sm" />
                        <div className="vi">Cơm hộp này có cần hâm nóng không ạ?</div>
                      </div>
                    </div>
                    <div className="mrow lp-me">
                      <div className="mb">
                        <JpText text="はい、お{願|ねが}いします。" furigana size="sm" />
                        <div className="vi">Vâng, nhờ bạn.</div>
                      </div>
                    </div>
                    <div className="mrow">
                      <span className="av" lang="ja">店</span>
                      <div className="mb">
                        <JpText text="{袋|ふくろ}、いりますか。" furigana size="sm" />
                        <div className="vi">Bạn có cần túi không ạ?</div>
                      </div>
                    </div>
                    <p className="cap">
                      Nhân vật AI đóng vai người bạn gặp ở từng nơi, mỗi kịch bản có nhiệm vụ. Hết buổi có đánh giá và kết quả được lưu lại. Bạn có thể nói hoặc gõ.
                    </p>
                  </div>
                )}
                {tab === 3 && (
                  <div className="panel" aria-label="Nhận con dấu">
                    <div className="ptop">
                      <span>
                        <b>Sổ con dấu</b>
                      </span>
                      <span className="lp-tag free">Miễn phí</span>
                    </div>
                    <div className="stamps-demo">
                      <div className="mini-box">
                        <MiniRouteMap />
                      </div>
                      <div className="stamp-row">
                        <figure>
                          <DemoStamp kind="konbini" size={72} rotate={-6} />
                          <figcaption>Cửa hàng tiện lợi</figcaption>
                        </figure>
                        <figure>
                          <DemoStamp kind="eki" size={72} rotate={4} />
                          <figcaption>Nhà ga</figcaption>
                        </figure>
                        <figure>
                          <DemoStamp kind="shokudo" size={72} rotate={-3} />
                          <figcaption>Quán ăn</figcaption>
                        </figure>
                        <div className="slot-cell">
                          <span className="slot" style={{ '--s': '72px' } as React.CSSProperties} aria-hidden="true" />
                        </div>
                        <div className="slot-cell">
                          <span className="slot" style={{ '--s': '72px' } as React.CSSProperties} aria-hidden="true" />
                        </div>
                      </div>
                    </div>
                    <p className="cap">Mỗi nơi học xong là một con dấu. Lật sổ ra là thấy mình đã đi được bao xa.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Học tập thích ứng */}
        <section className="sec sec-ink" id="thich-ung" aria-labelledby="h-adp">
          <div className="wrap">
            <div className="adp">
              <div>
                <h2 className="h2" id="h-adp">
                  Học tập thích ứng: JCAP đổi cách nói theo bạn, ngay trong từng lượt.
                </h2>
                <p className="sub">
                  Mỗi lần bạn trả lời, hệ thống ghi lại bạn mất bao lâu, có xem bản dịch hay dùng gợi ý không. Lượt tiếp theo, nhân vật AI nói cho vừa với bạn.
                </p>
              </div>
              <div>
                <div className="adp-q">
                  <span className="av" lang="ja">店</span>
                  <div>
                    <JpText text="お{弁当|べんとう}、{温|あたた}めますか。" furigana size="md" />
                    <div className="vi">Nhân viên cửa hàng hỏi: Cơm hộp này có cần hâm nóng không ạ?</div>
                  </div>
                </div>
                <div className="paths">
                  <div className="path slow">
                    <div className="sig">
                      <span className="sigc">
                        <Msr name="timer" />
                        Trả lời sau 5 giây
                      </span>
                      <span className="sigc">
                        <Msr name="translate" />
                        Xem bản dịch 2 lần
                      </span>
                    </div>
                    <div className="arrow">
                      <Msr name="south" />
                      Nhân vật nói chậm và dễ hơn
                    </div>
                    <div className="ai">
                      <JpText text="{大丈夫|だいじょうぶ}ですよ。{袋|ふくろ}、いりますか。" furigana size="sm" />
                      <div className="vi">Không sao đâu. Bạn có cần túi không?</div>
                    </div>
                    <div className="hint">
                      <Msr name="lightbulb" />
                      <span>
                        Gợi ý điền chỗ trống: <b lang="ja">＿＿、お願いします。</b>
                      </span>
                    </div>
                    <p className="why">Câu ngắn hơn, từ cơ bản, có lời động viên và gợi ý sẵn.</p>
                  </div>
                  <div className="path fast">
                    <div className="sig">
                      <span className="sigc">
                        <Msr name="bolt" />
                        Trả lời sau 1,4 giây
                      </span>
                      <span className="sigc">
                        <Msr name="block" />
                        Không dùng gợi ý
                      </span>
                    </div>
                    <div className="arrow">
                      <Msr name="north" />
                      Nhân vật nói tự nhiên hơn
                    </div>
                    <div className="ai">
                      <JpText text="かしこまりました。{袋|ふくろ}はご{利用|りよう}ですか。お{箸|はし}もおつけしましょうか。" furigana size="sm" />
                      <div className="vi">Vâng ạ. Bạn có dùng túi không? Tôi lấy đũa luôn cho bạn nhé?</div>
                    </div>
                    <p className="why">Nhịp như người bản xứ, câu dài hơn, mở rộng chủ đề.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Kính ngữ */}
        <section className="sec" id="lich-su" aria-labelledby="h-reg">
          <div className="wrap">
            <h2 className="h2" id="h-reg">
              Cùng một ý, nói khác nhau với từng người.
            </h2>
            <p className="sub">
              Nhờ người khác nói lại là chuyện hằng ngày. Nhưng với bạn bè, với nhân viên cửa hàng và với người phỏng vấn, câu bạn cần nói không giống nhau.
            </p>
            <div className="reg">
              <div className="scale" aria-hidden="true">
                <span>Thân mật</span>
                <span>Trang trọng</span>
              </div>
              <ul className="rrows">
                {REGISTERS.map((r) => (
                  <li key={r.who} className="rrow">
                    <div className="who3">
                      <span className={`av ${r.cls}`} lang="ja">
                        {r.av}
                      </span>
                      <div>
                        <b>{r.who}</b>
                        <small>{r.note}</small>
                      </div>
                    </div>
                    <div>
                      <div className="rj">
                        <JpText text={r.jp} furigana size="lg" />
                      </div>
                      <div className="rv">{r.vi}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* Lộ trình */}
        <section className="sec route-sec" id="lo-trinh" aria-labelledby="h-route">
          <div className="wrap">
            <h2 className="h2" id="h-route">
              Lộ trình là một tấm bản đồ, mỗi nơi đi qua để lại một con dấu.
            </h2>
            <p className="sub">Bạn thấy rõ mình đã đi qua những đâu và nơi tiếp theo là gì, thay vì học từng bài rời rạc.</p>
            <div className="rt3">
              <div>
                <div className="rtmap" role="img" aria-label="Bản đồ minh hoạ: một vùng đã hoàn thành, một vùng đang học, các vùng còn lại chưa đi">
                  <JapanSilhouette classFor={(p) => (p.region === 'kanto' ? 'on' : p.region === 'chubu' ? 'on cur' : undefined)} />
                </div>
                <div className="leg" aria-hidden="true">
                  <span>
                    <i className="sw-on" />
                    Đã đi qua
                  </span>
                  <span>
                    <i className="sw-cur" />
                    Đang học
                  </span>
                  <span>
                    <i className="sw-todo" />
                    Chưa đi
                  </span>
                </div>
              </div>
              <ol className="how">
                {HOW.map((h) => (
                  <li key={h.n}>
                    <span className="n" lang="ja" aria-hidden="true">
                      {h.n}
                    </span>
                    <b>{h.title}</b>
                    <span>{h.text}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Bảng giá */}
        <section className="sec" id="bang-gia" aria-labelledby="h-price">
          <div className="wrap">
            <h2 className="h2" id="h-price">
              Bắt đầu miễn phí. Chỉ trả khi dùng Hội thoại AI.
            </h2>
            <div className="price">
              <div className="pfree">
                <span className="ttl">Miễn phí</span>
                <span className="big">0đ</span>
                <ul>
                  <li>Shadowing có chấm độ khớp</li>
                  <li>Bản đồ Hành trình</li>
                  <li>Sổ con dấu</li>
                  <li>Lịch sử luyện tập</li>
                </ul>
                <button type="button" className="btn-main" onClick={goRegister}>
                  Bắt đầu miễn phí
                </button>
              </div>
              <div className="paid">
                <h3>Credit cho Hội thoại AI</h3>
                <p className="muted">Mua lẻ dùng dần, hoặc chọn gói tháng nếu luyện thường xuyên.</p>
                {rows ? (
                  <table className="ptab">
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.key} className={r.plan ? 'plan' : undefined}>
                          <td>
                            <b>{r.name}</b>
                          </td>
                          <td className="cr">{r.detail}</td>
                          <td className="r">{r.price}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : error ? (
                  <p className="pstate" role="status">
                    Chưa tải được bảng giá lúc này. Bạn vẫn có thể bắt đầu miễn phí và xem giá trong mục Gói &amp; Credit sau khi đăng nhập.
                  </p>
                ) : (
                  <div aria-busy="true" aria-label="Đang tải bảng giá">
                    <span className="skl" />
                    <span className="skl" />
                    <span className="skl" />
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Câu hỏi thường gặp */}
        <section className="sec" id="cau-hoi" aria-labelledby="h-faq">
          <div className="wrap faq">
            <div>
              <h2 className="h2" id="h-faq">
                Câu hỏi thường gặp
              </h2>
              <p className="sub">Chưa thấy câu bạn cần? Tạo tài khoản và thử ngay, không cần thanh toán.</p>
            </div>
            <div>
              {FAQ.map(([q, a], i) => {
                const open = faq === i;
                return (
                  <div key={q} className={open ? 'qa open' : 'qa'}>
                    <button type="button" onClick={() => setFaq(open ? -1 : i)} aria-expanded={open} aria-controls={`lp-faq-${i}`}>
                      <span>{q}</span>
                      <Msr name="add" />
                    </button>
                    {open && (
                      <div className="ans" id={`lp-faq-${i}`}>
                        {a}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* Lời mời cuối trang */}
        <section className="final" id="dang-ky" aria-labelledby="h-final">
          <div className="wrap">
            <div>
              <h2 className="h2" id="h-final">
                Câu tiếng Nhật đầu tiên bạn nói ra, hôm nay.
              </h2>
              <p className="sub">Tạo tài khoản miễn phí, chọn chương đầu tiên trên bản đồ và bắt đầu từ một câu mẫu.</p>
              <div className="ctas">
                <button type="button" className="btn-main" onClick={goRegister}>
                  Bắt đầu miễn phí
                </button>
                <button type="button" className="btn-line" onClick={goLogin}>
                  Tôi đã có tài khoản
                </button>
              </div>
            </div>
            <div aria-hidden="true" className="seal3">
              <span className="stp stp--sq son" style={{ '--s': '160px', '--r': '-8deg' } as React.CSSProperties}>
                <span className="in">
                  <b lang="ja">話す</b>
                  <i>JCAP</i>
                </span>
              </span>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap">
          <a className="lp-brand" href="#h-hero">
            <img src={logoMark} alt="" />
            JCAP
          </a>
          <span>Luyện nói tiếng Nhật cho người Việt, từ N5 đến N3.</span>
          <span className="grow" />
          <a href="#thu">Tính năng</a>
          <a href="#bang-gia">Bảng giá</a>
          <a href="#cau-hoi">Câu hỏi</a>
          <button type="button" className="txtbtn" onClick={goLogin}>
            Đăng nhập
          </button>
        </div>
      </footer>
    </div>
  );
};

export default LandingView;
