import React, { useState } from 'react';
import {
  AudioPlayer,
  Badge,
  Button,
  ChatBubble,
  CreditBadge,
  EmptyState,
  FeedbackItem,
  Icon,
  IconButton,
  JlptBadge,
  JpText,
  Logo,
  MicButton,
  ProgressBar,
  QuotaMeter,
  ScoreRing,
  SegmentedControl,
  Select,
  Stepper,
  Switch,
  Tabs,
  TextField,
  WordDiff,
  type MicState,
} from '../components/jcap';

type Theme = 'hoc-tap' | 'phong-luyen' | 'kham-pha' | 'quan-tri';

/**
 * Trang dev (/dev/jcap): bày các component của design system (src/components/jcap) để so với
 * design-handoff/prototype/AppPrototype.dc.html. Đổi data-theme để xem màu theo từng khu vực.
 */
export const JcapShowcaseView: React.FC = () => {
  const [theme, setTheme] = useState<Theme>('hoc-tap');
  const [mic, setMic] = useState<MicState>('idle');
  const [selected, setSelected] = useState(false);
  const [furigana, setFurigana] = useState(true);

  return (
    <div data-theme={theme} className="min-h-screen bg-paper-100 text-sumi">
      <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-line bg-paper-50 px-6 py-3">
        <Logo size={32} />
        <h1 className="title-2 m-0">Design system JCAP</h1>
        <SegmentedControl
          ariaLabel="Direction"
          size="sm"
          value={theme}
          onChange={(v) => setTheme(v as Theme)}
          options={[
            { value: 'hoc-tap', label: 'Học tập' },
            { value: 'phong-luyen', label: 'Phòng luyện' },
            { value: 'kham-pha', label: 'Khám phá' },
            { value: 'quan-tri', label: 'Quản trị' },
          ]}
        />
      </header>

      <main className="mx-auto grid max-w-[1200px] gap-6 p-6 lg:grid-cols-2">
        <Section title="Logo · Icon">
          <div className="flex flex-wrap items-center gap-4">
            <Logo size={36} />
            <Logo size={36} withName={false} />
            <Icon name="map" size={24} />
            <Icon name="star" size={24} fill />
            <Icon name="progress_activity" size={24} spin label="Đang tải" />
          </div>
        </Section>

        <Section title="Button · IconButton">
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon="play_arrow">
              Bắt đầu hội thoại
            </Button>
            <Button>Huỷ</Button>
            <Button variant="ghost" iconRight="arrow_forward">
              Xem tất cả
            </Button>
            <Button variant="danger" size="sm">
              Kết thúc sớm
            </Button>
            <Button variant="primary" loading>
              Đang lưu
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <IconButton icon="settings" label="Cài đặt âm thanh" />
            <IconButton icon="bookmark" label="Lưu bài" variant="secondary" active />
            <IconButton icon="close" label="Đóng" size="sm" />
          </div>
        </Section>

        <Section title="Badge · JlptBadge · CreditBadge">
          <div className="flex flex-wrap items-center gap-2">
            <JlptBadge level="N5" />
            <JlptBadge level="N4" />
            <JlptBadge level="N3" size="lg" />
            <Badge tone="ai" icon="schedule">
              Đang dở 2/4
            </Badge>
            <Badge tone="shu" dot>
              Mới
            </Badge>
            <Badge tone="success">Đã xong</Badge>
            <Badge tone="warning">Sắp hết</Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <CreditBadge amount={3800} />
            <CreditBadge amount={5} variant="cost" size="sm" />
            <CreditBadge amount={12} low onClick={() => {}} />
          </div>
        </Section>

        <Section title="SegmentedControl · Tabs · Switch">
          <SegmentedControl ariaLabel="Mục tiêu JLPT" options={['N5', 'N4', 'N3']} defaultValue="N5" />
          <Tabs
            className="mt-4"
            ariaLabel="Lọc bài"
            items={[
              { id: 'all', label: 'Tất cả', count: 24 },
              { id: 'doing', label: 'Đang học', count: 3 },
              { id: 'todo', label: 'Chưa học', count: 18 },
              { id: 'saved', label: 'Đã lưu', icon: 'bookmark' },
            ]}
          />
          <div className="mt-4 space-y-3">
            <Switch label="Hiện furigana" description="Chữ đọc nhỏ phía trên chữ Hán" checked={furigana} onChange={setFurigana} />
            <Switch label="Tự phát giọng AI" defaultChecked />
            <Switch label="Tạm khoá" disabled />
          </div>
        </Section>

        <Section title="TextField · Select">
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label="Họ tên" placeholder="Nguyễn Văn A" hint="Hiện trên hồ sơ" />
            {/* <TextField label="Mật khẩu" type="password" /> (Mock UI showcase) */}
            <TextField label="Mật khẩu" type="password" placeholder="••••••••" />
            <TextField label="Tìm tình huống" icon="search" placeholder="Mua vé tàu…" />
            <TextField label="Email" defaultValue="a@" error="Email chưa đúng định dạng" />
            <Select label="Tốc độ đọc" options={['0.8×', '1×', '1.2×']} defaultValue="1×" />
            <TextField label="Ghi chú" multiline rows={2} />
          </div>
        </Section>

        <Section title="ProgressBar · QuotaMeter · ScoreRing">
          <ProgressBar value={3} max={6} label="Câu 3/6" showValue />
          <ProgressBar className="mt-3" value={70} tone="shu" size="sm" />
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <QuotaMeter label="Chu kỳ 5 giờ" used={34} total={50} resetIn="2 giờ 14 phút" />
            <QuotaMeter label="Tuần này" used={460} total={500} tone="week" />
          </div>
          <div className="mt-4 flex flex-wrap items-end gap-6">
            <ScoreRing value={86} showVerdict label="Phát âm" />
            <ScoreRing value={62} size={72} showVerdict />
            <ScoreRing value={35} size={56} />
          </div>
        </Section>

        <Section title="Stepper">
          <Stepper
            steps={[
              { label: 'Hiểu', status: 'done' },
              { label: 'Shadowing', description: 'Đạt từ 70', status: 'current' },
              { label: 'Kiểm tra', status: 'locked', tag: 'Sắp có' },
              { label: 'Hội thoại AI', description: 'Nhận dấu son' },
            ]}
          />
          <Stepper
            className="mt-4"
            orientation="vertical"
            steps={[
              { label: 'Chào nhân viên nhà ga', status: 'done' },
              { label: 'Hỏi giá vé đi Tokyo', status: 'current' },
              { label: 'Mua vé và hỏi sân ga', status: 'todo' },
            ]}
          />
        </Section>

        <Section title="EmptyState">
          <EmptyState icon="search_off" title="Không có bài nào khớp" action={<Button variant="primary">Xoá bộ lọc</Button>}>
            Thử bỏ bớt điều kiện lọc hoặc đổi từ khoá.
          </EmptyState>
        </Section>

        <Section title="JpText">
          <JpText text="{幕張|まくはり}メッセにはどうやって{行|い}きますか。" size="lg" furigana={furigana} />
          <JpText className="mt-2 block" text="{観光|かんこう}です。" romaji="kankou desu" />
        </Section>

        <Section title="ChatBubble">
          <div className="space-y-4">
            <ChatBubble from="ai" name="Nhân viên nhà ga" jp="いらっしゃいませ。どちらまでですか。" vi="Xin chào. Quý khách đi đâu ạ?" onPlay={() => {}} />
            <ChatBubble
              from="me"
              jp="{東京|とうきょう}までお{願|ねが}いします。"
              vi="Cho tôi đến Tokyo."
              score={84}
              onSelect={() => setSelected(!selected)}
              selected={selected}
              onPlay={() => {}}
            />
            <ChatBubble from="me" jp="すみません。" status="sending" onPlay={null} />
            <ChatBubble from="me" jp="ありがとう。" status="error" onRetry={() => {}} onPlay={null} />
          </div>
        </Section>

        <Section title="MicButton · AudioPlayer">
          <SegmentedControl
            size="sm"
            ariaLabel="Trạng thái micro"
            value={mic}
            onChange={(v) => setMic(v as MicState)}
            options={['idle', 'permission', 'recording', 'analyzing', 'denied', 'unsupported', 'disabled']}
          />
          <div className="mt-4 flex flex-wrap items-center gap-8">
            <MicButton state={mic} level={0.6} onClick={() => setMic(mic === 'recording' ? 'analyzing' : 'recording')} />
            <MicButton state="idle" size="md" hideLabel />
          </div>
          <div className="mt-4 space-y-3">
            <AudioPlayer label="Câu mẫu" duration={4} progress={0.4} speeds />
            <AudioPlayer variant="chip" label="Nghe mẫu" />
          </div>
        </Section>

        <Section title="WordDiff · FeedbackItem">
          <WordDiff
            tokens={[
              { text: '東京', reading: 'とうきょう' },
              { text: 'まで' },
              { text: 'おねがします', status: 'wrong', error: 'chouon', expected: 'おねがいします' },
              { text: 'ね', status: 'extra' },
              { text: 'か', status: 'missing', expected: 'か' },
            ]}
          />
          <div className="mt-4 space-y-3">
            <FeedbackItem tone="success" title="Trợ từ đúng">
              Bạn dùng 「まで」 đúng để nói điểm đến.
            </FeedbackItem>
            <FeedbackItem tone="warning" title="Nên lịch sự hơn" suggestion={{ jp: '{東京|とうきょう}まで{一枚|いちまい}お{願|ねが}いします。', vi: 'Cho tôi một vé đi Tokyo.' }} />
            <FeedbackItem tone="error" title="Thiếu trường âm">
              「おねがいします」 có âm い kéo dài.
            </FeedbackItem>
          </div>
        </Section>
      </main>
    </div>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <section className="rounded-jc-lg border border-line bg-paper-50 p-5 shadow-jc-sm">
    <h2 className="title-3 mb-4 mt-0">{title}</h2>
    {children}
  </section>
);
