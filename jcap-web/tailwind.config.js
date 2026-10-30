/** @type {import('tailwindcss').Config} */
// Biên dịch lúc build (trước đây nạp qua cdn.tailwindcss.com): chạy ở trình duyệt nên mỗi lần có class mới lại chèn CSS và buộc
// tính lại style toàn trang (cả cây bản đồ), gây khựng khi chuyển từ bản đồ sang trang khác.
// Class trỏ vào token của design system (src/styles/tokens.css), đổi theo data-theme:
// bg-paper-100, text-sumi, border-line, bg-ai, bg-shu-soft, text-score-good, font-jp, font-mincho…
// Bo góc và đổ bóng đặt tên riêng (rounded-jc-lg, shadow-jc-md) để các trang cũ dùng rounded-lg/shadow-md
// của Tailwind giữ nguyên cho tới khi được làm lại theo thiết kế mới.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { 50: 'var(--paper-50)', 100: 'var(--paper-100)', 200: 'var(--paper-200)', 300: 'var(--paper-300)' },
        sumi: { DEFAULT: 'var(--sumi)', muted: 'var(--sumi-muted)', faint: 'var(--sumi-faint)' },
        line: { DEFAULT: 'var(--line)', strong: 'var(--line-strong)' },
        ai: { DEFAULT: 'var(--ai)', hover: 'var(--ai-hover)', soft: 'var(--ai-soft)' },
        'on-ai': 'var(--on-ai)',
        shu: { DEFAULT: 'var(--shu)', soft: 'var(--shu-soft)' },
        'on-shu': 'var(--on-shu)',
        sora: { DEFAULT: 'var(--sora)', soft: 'var(--sora-soft)' },
        'on-sora': 'var(--on-sora)',
        nami: { DEFAULT: 'var(--nami)', soft: 'var(--nami-soft)' },
        focus: 'var(--focus)',
        success: { DEFAULT: 'var(--success)', soft: 'var(--success-soft)' },
        warning: { DEFAULT: 'var(--warning)', soft: 'var(--warning-soft)' },
        danger: { DEFAULT: 'var(--danger)', soft: 'var(--danger-soft)' },
        info: { DEFAULT: 'var(--info)', soft: 'var(--info-soft)' },
        score: {
          good: 'var(--score-good)', 'good-soft': 'var(--score-good-soft)',
          mid: 'var(--score-mid)', 'mid-soft': 'var(--score-mid-soft)',
          low: 'var(--score-low)', 'low-soft': 'var(--score-low-soft)'
        },
        n5: { DEFAULT: 'var(--n5)', soft: 'var(--n5-soft)' },
        n4: { DEFAULT: 'var(--n4)', soft: 'var(--n4-soft)' },
        n3: { DEFAULT: 'var(--n3)', soft: 'var(--n3-soft)' },
        credit: { DEFAULT: 'var(--credit)', soft: 'var(--credit-soft)', coin: 'var(--credit-coin)' },
        quota: { '5h': 'var(--quota-5h)', week: 'var(--quota-week)' }
      },
      borderRadius: {
        'jc-sm': 'var(--radius-sm)', 'jc-md': 'var(--radius-md)', 'jc-lg': 'var(--radius-lg)', 'jc-xl': 'var(--radius-xl)', 'jc-full': 'var(--radius-full)'
      },
      boxShadow: { 'jc-sm': 'var(--shadow-sm)', 'jc-md': 'var(--shadow-md)', 'jc-lg': 'var(--shadow-lg)' },
      fontFamily: {
        sans: ['var(--font-sans)'],
        jp: ['var(--font-jp)'],
        mincho: ['var(--font-mincho)']
      }
    }
  },
  plugins: []
};
