# Chuyển cảnh Bản đồ ↔ Trang (Hành trình, Hội thoại AI, Shadowing, Hồ sơ…)

Mã chạy được: `transition-demo.html` (cùng thư mục). Mở bằng trình duyệt, bấm mục trong thanh bên.
Nút "A" là nguyên văn prototype. Nút "B" là bản chỉ dùng transform/opacity. Bảng thời gian ở cuối trang được đo thật bằng `transitionrun`.
Hai bản được so bằng ảnh chụp: khung cuối (bản đồ, trang, cả khi thu gọn) giống nhau, lệch dưới 1px ở mép thanh bên (padding phải 13px thay vì viền 1px).

## 1. CSS và logic trạng thái

Toàn bộ trạng thái nằm ở lớp trên phần tử gốc `.app`:

| Lớp | Khi nào có | Tác dụng |
|---|---|---|
| `is-page` | trang khác `map` | `.pgbg` hiện, thanh bên chuyển từ dạng nổi sang dạng dock |
| `is-collapsed` | thanh bên thu gọn | width 240 → 72, `.pg` left 240 → 72, nhãn mờ đi |
| `is-pref` | đang xem một tỉnh | bản đồ zoom, thanh bên trượt ra trái |

Trang nào đang mở thì có thêm `.on` (một trang duy nhất). JS chỉ đổi lớp, không điều khiển hoạt họa:

```js
function render() {
  app.className = 'app' + (state.pref ? ' is-pref' : '') + (state.collapsed ? ' is-collapsed' : '') + (state.page !== 'map' ? ' is-page' : '');
  side.setAttribute('data-theme', state.page === 'map' ? 'kham-pha' : 'hoc-tap');   // token đổi ngay tại t=0
  pages.forEach(p => {
    const on = p.dataset.page === state.page;
    p.classList.toggle('on', on);
    p.setAttribute('aria-hidden', on ? 'false' : 'true');
  });
}
```

CSS nguyên văn (`--e: cubic-bezier(.2,.7,.2,1)`):

```css
/* Thanh bên */
.side{left:12px;top:12px;bottom:12px;width:240px;border-radius:20px;border:1px solid var(--line);background:var(--paper-100);box-shadow:0 14px 36px rgba(8,26,56,.32);
  transition:width .2s var(--e) 0s,transform .16s var(--e) .65s,opacity .16s linear .65s,left .3s var(--e),top .3s var(--e),bottom .3s var(--e),border-radius .3s var(--e),box-shadow .3s linear,background-color .3s linear}
.is-collapsed .side{width:72px;transition:width .2s var(--e) .09s,/* các phần còn lại như trên */}
.is-page .side{left:0;top:0;bottom:0;border-radius:0;border-width:0 1px 0 0;background:var(--paper-50);box-shadow:none}
.is-pref .side{transform:translateX(-120%);opacity:0;pointer-events:none;transition:width .2s 0s,transform .2s cubic-bezier(.4,0,1,1) 0s,opacity .2s linear 0s}

/* Tấm nền phủ bản đồ (z 14) */
.pgbg{position:absolute;inset:0;z-index:14;background:var(--paper-100);opacity:0;visibility:hidden;transition:opacity .28s linear,visibility 0s .28s}
.is-page .pgbg{opacity:1;visibility:visible;transition:opacity .28s linear,visibility 0s}

/* Trang (z 15), luôn có trong DOM */
.pg{position:absolute;top:0;right:0;bottom:0;left:240px;z-index:15;overflow-y:auto;background:transparent;
  opacity:0;visibility:hidden;transform:translateY(10px);
  transition:opacity .14s linear,transform .2s var(--e),visibility 0s .2s,left .2s var(--e) 0s}
.pg.on{opacity:1;visibility:visible;transform:none;
  transition:opacity .22s linear .14s,transform .32s var(--e) .14s,visibility 0s,left .2s var(--e) .09s}
.is-collapsed .pg{left:72px}
```

Lớp bản đồ `.mapfull` nằm dưới cùng, không đổi gì khi chuyển sang trang (chỉ zoom khi `is-pref`):
`transition: transform .45s cubic-bezier(.4,0,.2,1) .2s`, và ở `.is-pref` là `.6s … .2s`.

## 2. Bảng thời gian (ms, tính từ lúc bấm; đã đo bằng trình duyệt)

Bản đồ → Trang (ví dụ Hồ sơ), thanh bên đang mở rộng:

| Phần tử | Thuộc tính | Trễ | Dài | Easing | Khoảng chạy |
|---|---|---|---|---|---|
| `.side` | left, top, bottom, border-radius | 0 | 300 | var(--e) | 0 → 300 |
| `.side` | box-shadow, background-color | 0 | 300 | linear | 0 → 300 |
| `.side` | border-width, màu chữ, viền (token) | snap tại 0 | | | |
| `.pgbg` | opacity 0 → 1 | 0 | 280 | linear | 0 → 280 |
| `.pgbg` | visibility | 0 | 0 | | hiện ngay |
| `.pg.on` | opacity 0 → 1 | 140 | 220 | linear | 140 → 360 |
| `.pg.on` | transform translateY(10px) → 0 | 140 | 320 | var(--e) | 140 → 460 |
| `.pg.on` | visibility | 0 | 0 | | hiện ngay |

Xong ở 460ms. Thứ tự: thanh bên và tấm nền chạy trước, nội dung trang vào sau 140ms.

Trang → Bản đồ:

| Phần tử | Thuộc tính | Trễ | Dài | Easing |
|---|---|---|---|---|
| `.pg` (vừa mất `.on`) | opacity → 0 | 0 | 140 | linear |
| `.pg` | transform → translateY(10px) | 0 | 200 | var(--e) |
| `.pg` | visibility → hidden | 200 | 0 | |
| `.pgbg` | opacity → 0 | 0 | 280 | linear |
| `.pgbg` | visibility → hidden | 280 | 0 | |
| `.side` | left, top, bottom, border-radius | 0 | 300 | var(--e) |
| `.side` | box-shadow, background-color | 0 | 300 | linear |

Xong ở 300ms. Nội dung trang biến mất trước (140ms), bản đồ hiện dần khi `.pgbg` mờ đi.

Trang → Trang: trang cũ ra 0 → 140 (opacity) / 200 (transform), trang mới vào từ 140. Hai trang không chồng lên nhau, `.pgbg` giữ nguyên.

Vào tỉnh (`is-pref`, ngoài phạm vi câu hỏi nhưng cùng lớp): thanh bên `transform` 0 → 200 (`cubic-bezier(.4,0,1,1)`) và opacity 0 → 1 trong 200 linear; khi thoát, thanh bên quay lại trễ 650ms, 160ms.

## 3. Trang nằm sẵn trong DOM hay mount/unmount?

Nằm sẵn trong DOM. Mọi `.pg` luôn được render, ẩn bằng `opacity:0; visibility:hidden; transform:translateY(10px)` và `aria-hidden="true"`. Không có mount/unmount, không FLIP, không View Transitions API. Phòng luyện `.rm-pg` làm giống vậy (`scale(.985)` thay vì translateY).
Trong app React thật không nên giữ tất cả mount (mục 6), và nên dùng thuộc tính `inert` thay cho `aria-hidden` để trang ẩn không nhận focus.

## 4. Thuộc tính nào gây layout, và bản chỉ dùng transform/opacity

Prototype đang animate:

| Loại | Thuộc tính | Ở đâu |
|---|---|---|
| Layout | `left`, `top`, `bottom` | `.side` khi vào/ra trang |
| Layout | `width` | `.side` khi thu gọn; `.shf-search` |
| Layout | `left` | `.pg` khi thu gọn (không đổi khi chỉ chuyển bản đồ ↔ trang) |
| Paint | `border-radius`, `box-shadow`, `background-color` | `.side` khi vào/ra trang |
| Compositor | `opacity`, `transform` | `.pg`, `.pgbg`, `.mapfull`, `.ppanel`, `.side` (is-pref) |

Chỉ thanh bên là có vấn đề, vì nó "nổi" (cách mép 12px, bo 20, đổ bóng) ở bản đồ và "dock" (sát mép, vuông) ở trang. Cách làm chỉ dùng compositor (nút B trong demo):

1. Hộp `.side` luôn ở hình học dock (0, 0, 240 x 900). Không animate `left/top/bottom`.
2. Dạng nổi là một lớp vỏ riêng `.side__shell--float` (bo 20, viền, bóng, nền `--paper-100`, `data-theme` tĩnh là `kham-pha` để màu giữ như bản đồ). Dạng dock là `.side__shell--dock` (viền phải, nền `--paper-50`, `data-theme` tĩnh là `hoc-tap`).
3. Vào trang: vỏ nổi trượt `translate(-12px,-12px)` trong 300ms, vỏ dock hiện `opacity 0 → 1` trong 300ms linear (giống đúng nội suy `background-color`), vỏ nổi tắt ở 240 → 300ms để không còn bóng thừa.
4. Nội dung thanh bên: ở dạng nổi lệch `(+13px, +13px)` cho nhóm trên và `(+13px, −13px)` cho nhóm dưới (nội dung của hộp nổi bị ép 26px theo chiều cao do viền và khoảng cách 12px), về `0` khi vào trang. Nhóm trên là `.side__top`, nhóm dưới là `.side__bot` (có `margin-top:auto`).

```css
.side{left:0;top:0;bottom:0;width:240px;padding:16px 13px 12px 12px;
  transition:width .2s var(--e) 0s,transform .16s var(--e) .65s,opacity .16s linear .65s}  /* width chỉ đổi khi thu gọn */
.side__shell{position:absolute;pointer-events:none;box-sizing:border-box}
.side__shell--float{left:12px;right:-12px;top:12px;bottom:12px;border-radius:20px;border:1px solid var(--line);
  background:var(--paper-100);box-shadow:0 14px 36px rgba(8,26,56,.32);
  opacity:1;transform:none;transition:transform .3s var(--e),opacity 0s}
.side__shell--dock{inset:0;border-right:1px solid var(--line);background:var(--paper-50);
  opacity:0;transition:opacity .3s linear 0s}
.side__body{position:relative;flex:1;display:flex;flex-direction:column;gap:14px;transform:translateX(13px);transition:transform .3s var(--e)}
.side__top{transform:translateY(13px);transition:transform .3s var(--e)}
.side__bot{margin-top:auto;transform:translateY(-13px);transition:transform .3s var(--e)}

.is-page .side__shell--float{transform:translate(-12px,-12px);opacity:0;transition:transform .3s var(--e),opacity .06s linear .24s}
.is-page .side__shell--dock{opacity:1}
.is-page .side__body,.is-page .side__top,.is-page .side__bot{transform:none}

@media (prefers-reduced-motion: reduce){
  .app *{transition-duration:.2s !important;transition-delay:0s !important;animation:none !important}
  .side__shell--float,.is-page .side__shell--float,.side__body,.side__top,.side__bot{transform:none}
}
```

Khác với prototype: khung giữa (từ 0 đến 300ms) không còn biến hình bo góc 20 → 0 và chiều cao 876 → 900 mà là hai lớp vỏ chồng nhau. Ở tốc độ thật khó thấy; khung đầu và khung cuối giống hệt. Việc thu gọn (width 240 ↔ 72) vẫn dùng `width`, vì chỉ xảy ra khi người dùng bấm và không đi kèm bản đồ; nếu cần cũng bỏ nốt thì phải đổi nhãn thành clip, ngoài phạm vi.

## 5. Chống giật khi bản đồ nặng nằm dưới

Trong prototype không dùng `will-change`, `contain` hay `content-visibility`. Bản đồ là một thẻ `<img>` raster duy nhất (không phải SVG), nên nó chỉ là một texture đã được trình duyệt tách lớp, không bị vẽ lại khi trang trượt lên. `.pgbg` là tấm nền đặc phủ kín nên trình duyệt cũng không phải tính gì thêm.
Nếu bản đồ trong app thật là SVG nhiều đường dẫn, hãy làm các bước sau (chưa có trong prototype):

```css
.map-layer{position:absolute;inset:0;contain:strict}                 /* cô lập layout + paint */
.map-layer[data-asleep="true"]{content-visibility:hidden;pointer-events:none}   /* không dựng khi đang ở trang */
.map-layer[data-asleep="true"] *{animation-play-state:paused}
.app[data-phase="run"] .pg,.app[data-phase="run"] .pgbg{will-change:opacity,transform}  /* chỉ trong lúc chạy */
.app{isolation:isolate}
```

- Ngủ sau khi vào trang xong (khi `.pgbg` `transitionend`), đánh thức trước khi quay lại bản đồ (bước dựng, mục 6), để chi phí dựng SVG nằm sau tấm nền đặc chứ không rơi vào khung hình đầu.
- Không bật `will-change` cố định. Chỉ gắn trong lúc chạy rồi gỡ, nếu không sẽ tốn bộ nhớ GPU cho mọi trang.
- Với SVG nặng, rasterize một lần (ví dụ thẻ `<img src="map.svg">` hoặc ảnh WebP) cho lớp nền khi vào tỉnh/ra tỉnh, chỉ giữ SVG cho lớp tương tác.

## 6. Bản React

Nguyên tắc: bước 1 dựng nội dung trang mới (có thể suspend, lazy, tải dữ liệu) trong `startTransition` khi trang còn ở trạng thái "tắt"; bước 2 sau khi DOM đã commit mới bật trạng thái `on` để CSS transition chạy.

```tsx
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, useTransition } from 'react';

type PageKey = 'map' | 'roleplay' | 'shadow' | 'profile' | 'settings' | 'plan';
type Phase = 'idle' | 'prepare' | 'run';

const pages: Record<Exclude<PageKey, 'map'>, React.LazyExoticComponent<React.ComponentType>> = {
  roleplay: lazy(() => import('./pages/ScenarioListView')),
  shadow:   lazy(() => import('./pages/LearnerShadowingListView')),
  profile:  lazy(() => import('./pages/LearnerProfileView')),
  settings: lazy(() => import('./pages/SettingsView')),
  plan:     lazy(() => import('./pages/SubscriptionQuotaView')),
};

export function useShell() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState<Set<PageKey>>(new Set());  // trang có trong DOM
  const [active, setActive] = useState<PageKey>('map');             // trang đang bật .on
  const [phase, setPhase] = useState<Phase>('idle');
  const [mapAsleep, setMapAsleep] = useState(false);
  const wanted = useRef<PageKey | null>(null);
  const [, startTransition] = useTransition();

  const go = useCallback((next: PageKey) => {
    wanted.current = next;
    setPhase('prepare');
    // 1. Dựng nội dung. UI cũ giữ nguyên cho tới khi lazy/dữ liệu của `next` xong.
    startTransition(() => {
      setMounted(prev => (next === 'map' || prev.has(next) ? prev : new Set(prev).add(next)));
      if (next === 'map') setMapAsleep(false);   // đánh thức bản đồ trong lúc còn ở sau tấm nền
    });
  }, []);

  // 2. Chạy sau khi DOM của bước 1 đã commit.
  useLayoutEffect(() => {
    const next = wanted.current;
    if (!next || phase !== 'prepare') return;
    if (next !== 'map' && !mounted.has(next)) return;       // chưa dựng xong
    wanted.current = null;
    rootRef.current?.getBoundingClientRect();               // ép tính style: trang đang ở trạng thái "tắt"
    const id = requestAnimationFrame(() => {                // 3. bật lớp, transition bắt đầu
      setActive(next);
      setPhase('run');
    });
    return () => cancelAnimationFrame(id);
  }, [mounted, phase]);

  // 4. Dọn dẹp khi tấm nền xong, hoặc sau 500ms nếu transitionend không bắn (giảm chuyển động, tab ẩn).
  useEffect(() => {
    if (phase !== 'run') return;
    const t = window.setTimeout(done, 500);
    function done() {
      setPhase('idle');
      setMapAsleep(active !== 'map');
      setMounted(prev => new Set([...prev].filter(k => k === active)));   // bỏ trang cũ; muốn giữ state thì không lọc
    }
    return () => clearTimeout(t);
  }, [phase, active]);

  return { rootRef, mounted, active, phase, mapAsleep, go };
}

export function AppShell() {
  const { rootRef, mounted, active, phase, mapAsleep, go } = useShell();
  const isPage = active !== 'map';
  return (
    <div ref={rootRef} className={'app' + (isPage ? ' is-page' : '')} data-phase={phase === 'run' ? 'run' : 'idle'} data-theme="kham-pha">
      <MapLayer asleep={mapAsleep} inert={isPage} />
      <div className="pgbg" data-theme="hoc-tap" aria-hidden="true" />
      {[...mounted].filter((k): k is Exclude<PageKey, 'map'> => k !== 'map').map(key => {
        const Page = pages[key];
        return (
          <section key={key} className={'pg' + (active === key ? ' on' : '')} data-theme="hoc-tap" inert={active !== key}>
            <Suspense fallback={null}><Page /></Suspense>
          </section>
        );
      })}
      <Sidebar current={active} onGo={go} />
    </div>
  );
}
```

Ghi chú:

- `inert` trên React 19 là prop boolean; React 18 cần `inert={cond ? '' : undefined}`.
- Chuyển trang ↔ trang dùng đúng luồng trên: trang cũ mất `.on` (ra 0 → 140), trang mới vào từ 140ms. Vì đã dựng xong ở bước 1 nên không có khung trống.
- `prefers-reduced-motion`: CSS ở mục 4 làm phần việc. Hook không cần xử lý riêng nhờ bộ hẹn 500ms; nếu muốn bỏ hẳn bước chờ thì `if (matchMedia('(prefers-reduced-motion: reduce)').matches) done()` ngay khi `phase === 'run'`.
- Màu: toàn bộ lấy từ token (`--paper-*`, `--line`, `--shu-soft`, `--sumi`). Các giá trị `rgba(8,26,56,.32)` của đổ bóng là giá trị có sẵn trong prototype, không phải màu mới.
