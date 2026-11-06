// Xuất dữ liệu roadmap (Khám phá) trong database local ra Data/Seeds/ExploreContent, rồi báo những gì đã đổi.
//   node tools/explore-content/export.mjs           chạy tay
//   node tools/explore-content/export.mjs --hook    chạy từ git pre-commit: lỗi chỉ cảnh báo, không chặn commit
// Chỉ đọc database. Phiên bản cũ của từng mục được giữ trong explore-content.history.json để máy khác nhận ra
// "mục này chưa ai sửa" và cập nhật theo; xem README trong Data/Seeds/ExploreContent.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..', '..');
const PACK = path.join(root, 'Data', 'Seeds', 'ExploreContent', 'explore-content.json');
const HISTORY = path.join(root, 'Data', 'Seeds', 'ExploreContent', 'explore-content.history.json');
const DOC = 'Dữ liệu roadmap (Khám phá) xuất từ database của người soạn bằng tools/explore-content/export.mjs. Không sửa tay: sửa trong trang admin rồi xuất lại. Xem README.md cùng thư mục.';

const stripBom = (s) => s.replace(/^﻿/, '');
const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(stripBom(fs.readFileSync(f, 'utf8'))) : fallback);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const arr = (x) => (typeof x === 'string' ? JSON.parse(x) : x) || [];

function connectionString() {
  const local = readJson(path.join(root, 'appsettings.Local.json'), {});
  const conn = local.ConnectionStrings?.DefaultConnection;
  if (!conn) throw new Error('Không thấy ConnectionStrings:DefaultConnection trong appsettings.Local.json.');
  return conn;
}

function dump() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jcap-explore-'));
  try {
    execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(here, 'dump-db.ps1'), '-Out', dir], {
      env: { ...process.env, JCAP_EXPORT_CONN: connectionString() },
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const read = (n) => JSON.parse(stripBom(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8')) || '[]');
    return Object.fromEntries(['spots', 'chapters', 'prefectures', 'words', 'grammars', 'vocabs', 'dialogues', 'scenarios'].map((n) => [n, read(n)]));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function build(db) {
  const spots = db.spots.filter((s) => s.JLPTLevel != null).map((s) => ({
    key: `spot-${s.Id}`,
    prefectureId: s.PrefectureId, iconId: s.IconId, nameVi: s.NameVi, nameJp: s.NameJp, nameKana: s.NameKana,
    latitude: s.Latitude, longitude: s.Longitude, status: s.Status, isActive: s.IsActive,
    lesson: {
      level: s.JLPTLevel, situation: s.Situation, realUse: s.RealUse, sentence: JSON.parse(s.SentenceJson || '[]'), meaning: s.Meaning,
      grammarNote: s.GrammarNote, estimatedMinutes: s.EstimatedMinutes,
      grammars: arr(s.Grammars).map((g) => g.Pattern),
      vocabularies: arr(s.Vocabularies).map((v) => v.Word),
      activities: arr(s.Activities).map((a) => ({
        type: a.ActivityType, dialogueTitle: a.DialogueTitle, scenarioTitle: a.ScenarioTitle, scenarioLevel: a.ScenarioLevel,
        passThreshold: a.PassThreshold, order: a.OrderIndex,
      })),
    },
  }));

  // Chỉ mang theo đúng cấp độ kịch bản mà mốc dùng, không kéo cả module sang
  const usedLevels = new Set(spots.flatMap((s) => s.lesson.activities).filter((a) => a.scenarioTitle).map((a) => `${a.scenarioTitle}|${a.scenarioLevel}`));
  return {
    _doc: DOC,
    grammars: db.grammars.map((g) => ({ pattern: g.Pattern, reading: g.Reading, meaning: g.Meaning, formation: g.Formation, explanation: g.Explanation, usageNotes: g.UsageNotes, exampleSentence: g.ExampleSentence, jlptLevel: g.JLPTLevel })),
    vocabularies: db.vocabs.map((v) => ({ word: v.Word, reading: v.Reading, meaning: v.Meaning, partOfSpeech: v.PartOfSpeech, jlptLevel: v.JLPTLevel, explanation: v.Explanation, usageNotes: v.UsageNotes })),
    scenarios: db.scenarios.map((s) => ({
      title: s.Title, description: s.Description, thumbnail: s.Thumbnail,
      levels: arr(s.Levels).filter((l) => usedLevels.has(`${s.Title}|${l.JLPTLevel}`)).map((l) => ({
        jlptLevel: l.JLPTLevel, title: l.Title, description: l.Description, aiPersona: l.AiPersona, creditCost: l.CreditCost, status: l.Status,
        missions: arr(l.Missions).map((m) => ({ content: m.Content, order: m.Order, completionCriteriaJson: m.CompletionCriteriaJson, isActive: m.IsActive })),
        targetVocabularies: arr(l.TargetVocabularies).map((t) => ({ word: t.Word, reading: t.Reading, meaning: t.Meaning })),
        targetGrammars: arr(l.TargetGrammars).map((t) => ({ pattern: t.Pattern, meaning: t.Meaning, exampleSentence: t.ExampleSentence })),
      })),
    })),
    dialogues: db.dialogues.map((d) => ({
      title: d.Title, scenarioTitle: d.ScenarioTitle, jlptLevel: d.JLPTLevel, sourceDescription: d.SourceDescription,
      speakerRoleA_Name: d.SpeakerRoleA_Name, speakerRoleB_Name: d.SpeakerRoleB_Name, speakerRolesJson: d.SpeakerRolesJson,
      sentences: arr(d.Sentences).map((x) => ({ orderIndex: x.OrderIndex, speakerRole: x.SpeakerRole, japaneseText: x.JapaneseText, romajiText: x.RomajiText, vietnameseTranslation: x.VietnameseTranslation, audioDurationMs: x.AudioDurationMs })),
      vocabularies: arr(d.Vocabularies).map((x) => ({ word: x.Word, orderIndex: x.OrderIndex, note: x.Note })),
      grammars: arr(d.Grammars).map((x) => ({ pattern: x.Pattern, orderIndex: x.OrderIndex, note: x.Note })),
    })),
    chapters: db.chapters.map((c) => ({ orderIndex: c.OrderIndex, title: c.Title, description: c.Description, minLevel: c.MinLevel, maxLevel: c.MaxLevel, prefectureIds: arr(c.Prefectures).map((p) => p.PrefectureId) })),
    openPrefectures: db.prefectures.map((p) => p.Id),
    spots,
    provinceWords: db.words.map((w) => ({ prefectureId: w.PrefectureId, word: w.Word, kana: w.Kana, meaning: w.Meaning, note: w.Note, status: w.Status })),
  };
}

// Tìm mục tương ứng trong bản xuất trước: theo key; bản cũ chưa có key thì theo (tỉnh, tên Nhật, cấp độ, biểu tượng)
function findOldSpot(oldSpots, s, taken) {
  const free = oldSpots.filter((o) => !taken.has(o));
  return free.find((o) => o.key && o.key === s.key)
    ?? free.find((o) => !o.key && o.prefectureId === s.prefectureId && o.nameJp === s.nameJp && o.lesson.level === s.lesson.level && o.iconId === s.iconId)
    ?? free.find((o) => !o.key && o.prefectureId === s.prefectureId && o.nameJp === s.nameJp && o.lesson.level === s.lesson.level);
}

const pushVersion = (map, key, version) => {
  const list = (map[key] ??= []);
  if (!list.some((v) => same(v, version))) list.push(version);
};

// Bản xuất cũ có thể thiếu trường rỗng của hoạt động; chuẩn hoá để không báo nhầm là đã sửa
const normalizeSpot = (s) => ({
  ...s,
  lesson: {
    ...s.lesson,
    activities: s.lesson.activities.map((a) => ({
      type: a.type, dialogueTitle: a.dialogueTitle ?? null, scenarioTitle: a.scenarioTitle ?? null, scenarioLevel: a.scenarioLevel ?? null,
      passThreshold: a.passThreshold ?? null, order: a.order,
    })),
  },
});

const withoutKey = ({ key, ...rest }) => rest;

/** Ghi phiên bản cũ của những mục vừa đổi vào lịch sử, trả danh sách thay đổi để báo. */
function diffAndRecord(oldPack, next, history) {
  const changes = [];
  const label = (s) => `${s.nameVi} (${s.nameJp}, tỉnh ${s.prefectureId}, ${s.lesson.level})`;
  const oldSpots = (oldPack.spots ?? []).map(normalizeSpot);
  const taken = new Set();
  for (const s of next.spots) {
    const o = findOldSpot(oldSpots, s, taken);
    if (!o) { changes.push(`+ Mốc mới: ${label(s)}${s.status === 'Draft' ? ' [nháp]' : ''}`); continue; }
    taken.add(o);
    if (same(withoutKey(o), withoutKey(s))) continue;
    pushVersion(history.spots, s.key, withoutKey(o));
    const fields = [];
    for (const f of ['iconId', 'nameVi', 'nameJp', 'nameKana', 'latitude', 'longitude', 'status', 'isActive']) if (o[f] !== s[f]) fields.push(f);
    for (const f of ['level', 'situation', 'realUse', 'sentence', 'meaning', 'grammarNote', 'estimatedMinutes', 'grammars', 'vocabularies', 'activities'])
      if (!same(o.lesson[f], s.lesson[f])) fields.push(f);
    changes.push(`~ Mốc sửa: ${label(s)}: ${fields.join(', ')}`);
  }
  for (const o of oldSpots) if (!taken.has(o)) changes.push(`- Mốc không còn trong database: ${label(o)}`);

  const oldChapters = new Map((oldPack.chapters ?? []).map((c) => [c.orderIndex, c]));
  for (const c of next.chapters) {
    const o = oldChapters.get(c.orderIndex);
    if (!o) { changes.push(`+ Chương mới: ${c.title}`); continue; }
    if (!same(o, c)) { pushVersion(history.chapters, String(c.orderIndex), o); changes.push(`~ Chương sửa: ${c.title}`); }
  }
  // Chương người soạn đã xoá (ngừng dùng): ghi bản cuối vào lịch sử để máy thành viên nhận ra và tắt theo nếu chưa tự sửa
  const nextOrders = new Set(next.chapters.map((c) => c.orderIndex));
  for (const o of oldChapters.values()) {
    if (nextOrders.has(o.orderIndex)) continue;
    pushVersion(history.chapters, String(o.orderIndex), o);
    changes.push(`- Chương không còn dùng: ${o.title}`);
  }

  const oldWords = new Map((oldPack.provinceWords ?? []).map((w) => [w.prefectureId, w]));
  for (const w of next.provinceWords) {
    const o = oldWords.get(w.prefectureId);
    if (!o) { changes.push(`+ Một từ ở tỉnh mới: tỉnh ${w.prefectureId} ${w.word}`); continue; }
    if (!same(o, w)) { pushVersion(history.words, String(w.prefectureId), o); changes.push(`~ Một từ ở tỉnh sửa: tỉnh ${w.prefectureId} ${w.word}`); }
  }

  const oldOpen = new Set(oldPack.openPrefectures ?? next.openPrefectures);
  const newOpen = new Set(next.openPrefectures);
  for (const id of newOpen) if (!oldOpen.has(id)) { history.prefectures[id] = true; changes.push(`~ Tỉnh ${id}: mở`); }
  for (const id of oldOpen) if (!newOpen.has(id)) { history.prefectures[id] = true; changes.push(`~ Tỉnh ${id}: đóng`); }

  for (const [kind, name, key] of [['grammars', 'Ngữ pháp', 'pattern'], ['vocabularies', 'Từ vựng', 'word'], ['scenarios', 'Kịch bản', 'title'], ['dialogues', 'Bài Shadowing', 'title']]) {
    const before = new Set((oldPack[kind] ?? []).map((x) => x[key]));
    for (const x of next[kind]) if (!before.has(x[key])) changes.push(`+ ${name} mốc tham chiếu: ${x[key]}`);
  }
  return changes;
}

/** Nội dung có vẻ chưa hoàn thiện: chỉ nhắc, vẫn xuất đúng như trong database. */
function warnings(next) {
  const out = [];
  const name = (s) => `${s.nameVi} (tỉnh ${s.prefectureId}, ${s.lesson.level})`;
  for (const s of next.spots) {
    const live = s.status === 'Published' && s.isActive;
    if (s.lesson.sentence.some((seg) => /[{}]/.test(seg.text))) out.push(`Câu mẫu có dấu { } thừa: ${name(s)}`);
    if (!/[぀-ヿ一-鿿]/.test(s.nameJp)) out.push(`Tên tiếng Nhật không có chữ Nhật: ${name(s)}: "${s.nameJp}"`);
    if (live && (s.lesson.situation.trim().length < 3 || s.lesson.realUse.trim().length < 3)) out.push(`Mốc đang dùng nhưng tình huống/cách dùng còn trống hoặc quá ngắn: ${name(s)}`);
  }
  return out;
}

function main() {
  const oldPack = readJson(PACK, {});
  const history = { spots: {}, chapters: {}, words: {}, prefectures: {}, ...readJson(HISTORY, {}) };
  const next = build(dump());
  const changes = diffAndRecord(oldPack, next, history);

  const text = JSON.stringify(next, null, 2) + '\n';
  const unchanged = fs.existsSync(PACK) && stripBom(fs.readFileSync(PACK, 'utf8')).replace(/\r\n/g, '\n') === text;
  if (!unchanged) {
    fs.writeFileSync(PACK, text, 'utf8');
    fs.writeFileSync(HISTORY, JSON.stringify(history, null, 2) + '\n', 'utf8');
  }

  console.log('[roadmap seed] ' + (unchanged ? 'Dữ liệu roadmap không đổi.' : changes.length ? `Đã cập nhật file seed, ${changes.length} thay đổi:` : 'Đã cập nhật file seed (nội dung tham chiếu hoặc định dạng).'));
  for (const c of changes) console.log('  ' + c);
  const warns = warnings(next);
  if (warns.length) { console.log(`[roadmap seed] Cần xem lại ${warns.length} mục (vẫn xuất đúng như database):`); for (const w of warns) console.log('  ! ' + w); }
}

try {
  main();
} catch (err) {
  console.error('[roadmap seed] Không xuất được dữ liệu roadmap: ' + err.message);
  process.exit(process.argv.includes('--hook') ? 0 : 1);
}
