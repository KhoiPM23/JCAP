import type * as React from 'react';

type Node = React.ReactNode;
export type Jlpt = 'N5' | 'N4' | 'N3';
export type Tone = 'info' | 'success' | 'warning' | 'danger';

/** Logo JCAP thật (mark torii trong bong bóng thoại). Truyền src = đường dẫn asset trong ứng dụng. */
export interface LogoProps { variant?: 'mark' | 'lockup'; size?: number; withName?: boolean; src?: string; className?: string }
export declare function Logo(props: LogoProps): React.ReactElement;

/** Biểu tượng Material Symbols Rounded. */
export interface IconProps { name: string; size?: number; fill?: boolean; spin?: boolean; label?: string; className?: string; style?: React.CSSProperties }
export declare function Icon(props: IconProps): React.ReactElement;

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  icon?: string; iconRight?: string; loading?: boolean; block?: boolean;
}
export declare function Button(props: ButtonProps): React.ReactElement;

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string; /** Bắt buộc: aria-label + tooltip */ label: string;
  variant?: 'ghost' | 'secondary' | 'primary'; size?: 'sm' | 'md'; active?: boolean; fill?: boolean;
}
export declare function IconButton(props: IconButtonProps): React.ReactElement;

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string; hint?: string; error?: string; icon?: string; multiline?: boolean; rows?: number; trailing?: Node;
}
export declare function TextField(props: TextFieldProps): React.ReactElement;

export interface SelectOption { value: string; label: string; disabled?: boolean }
export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string; hint?: string; error?: string; placeholder?: string; options: Array<string | SelectOption>;
}
export declare function Select(props: SelectProps): React.ReactElement;

export interface SwitchProps { label?: string; description?: string; checked?: boolean; defaultChecked?: boolean; onChange?: (v: boolean) => void; disabled?: boolean; className?: string }
export declare function Switch(props: SwitchProps): React.ReactElement;

export interface SegmentOption { value: string; label: Node; icon?: string; count?: number; disabled?: boolean }
export interface SegmentedControlProps { options: Array<string | SegmentOption>; value?: string; defaultValue?: string; onChange?: (v: string) => void; size?: 'sm' | 'md'; block?: boolean; ariaLabel?: string; className?: string }
export declare function SegmentedControl(props: SegmentedControlProps): React.ReactElement;

export interface JlptBadgeProps { level: Jlpt; size?: 'sm' | 'md' | 'lg'; className?: string }
export declare function JlptBadge(props: JlptBadgeProps): React.ReactElement;

export interface CreditBadgeProps { amount: number; variant?: 'balance' | 'cost'; size?: 'sm' | 'md' | 'lg'; low?: boolean; unit?: string; onClick?: () => void; className?: string }
export declare function CreditBadge(props: CreditBadgeProps): React.ReactElement;

export interface BadgeProps { tone?: 'neutral' | 'ai' | 'shu' | Tone; icon?: string; dot?: boolean; children?: Node; className?: string }
export declare function Badge(props: BadgeProps): React.ReactElement;

export interface AlertProps { tone?: Tone; title?: Node; children?: Node; action?: Node; icon?: string; onClose?: () => void; className?: string }
export declare function Alert(props: AlertProps): React.ReactElement;

export interface ToastProps { tone?: Tone; title?: Node; children?: Node; action?: Node; icon?: string; onClose?: () => void; className?: string }
export declare function Toast(props: ToastProps): React.ReactElement;

export interface TabItem { id: string; label: Node; icon?: string; count?: number }
export interface TabsProps { items: TabItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; ariaLabel?: string; className?: string }
export declare function Tabs(props: TabsProps): React.ReactElement;

export interface Step { label: Node; description?: Node; status?: 'done' | 'current' | 'todo' | 'locked' | 'error'; tag?: Node; number?: number }
export interface StepperProps { steps: Step[]; orientation?: 'horizontal' | 'vertical'; className?: string }
export declare function Stepper(props: StepperProps): React.ReactElement;

export interface MenuItem { icon: string; label: Node; tone?: 'danger'; onClick?: () => void }
export interface AppHeaderProps {
  name: string; level?: Jlpt; role?: 'learner' | 'admin'; credits?: number; creditsLow?: boolean;
  onCreditClick?: () => void; avatarUrl?: string; /** Chỉ truyền dưới 1024px để hiện nút mở Drawer */ onMenu?: () => void;
  menuItems?: MenuItem[]; menuOpen?: boolean; className?: string;
}
export declare function AppHeader(props: AppHeaderProps): React.ReactElement;

export interface NavItem { id: string; label: Node; icon: string; badge?: Node; href?: string }
export interface SideNavProps { sections: Array<{ title?: string; items: NavItem[] }>; value?: string; defaultValue?: string; onChange?: (id: string) => void; ariaLabel?: string; className?: string }
export declare function SideNav(props: SideNavProps): React.ReactElement;

export interface BottomNavProps { items: NavItem[]; value?: string; defaultValue?: string; onChange?: (id: string) => void; className?: string }
export declare function BottomNav(props: BottomNavProps): React.ReactElement;

export interface CardProps { title?: Node; subtitle?: Node; eyebrow?: Node; actions?: Node; children?: Node; tone?: 'sunken' | 'ai' | 'sora' | 'nami'; padding?: 'none'; onClick?: () => void; as?: string; className?: string }
export declare function Card(props: CardProps): React.ReactElement;

export interface ScenarioCardProps {
  code?: string; title: string; description?: string; levels?: Jlpt[]; cost?: number; thumbnail?: string;
  status?: 'open' | 'draft'; progress?: { done: number; total: number }; onClick?: () => void; className?: string;
}
export declare function ScenarioCard(props: ScenarioCardProps): React.ReactElement;

export interface ShadowingCardProps {
  title: string; topic?: string; textbook?: string; level?: Jlpt; sentences?: number; minutes?: number;
  progress?: { done: number; total: number }; bestScore?: number; bookmarked?: boolean;
  onBookmark?: () => void; onStart?: () => void; className?: string;
}
export declare function ShadowingCard(props: ShadowingCardProps): React.ReactElement;

export interface TableColumn<T = any> { key: string; label: Node; align?: 'left' | 'right' | 'center'; width?: string | number; render?: (row: T) => Node }
export interface TableProps<T = any> { columns: TableColumn<T>[]; rows: T[]; loading?: boolean; empty?: Node; stickyFirst?: boolean; caption?: string; className?: string }
export declare function Table<T = any>(props: TableProps<T>): React.ReactElement;

export interface ProgressBarProps { value: number; max?: number; label?: Node; showValue?: boolean; tone?: 'ai' | 'success' | 'warning' | 'danger' | 'shu' | 'credit'; size?: 'sm' | 'md' | 'lg'; className?: string }
export declare function ProgressBar(props: ProgressBarProps): React.ReactElement;

export interface QuotaMeterProps { label: string; used: number; total: number; resetIn?: string; tone?: '5h' | 'week' | 'wallet'; icon?: string; className?: string }
export declare function QuotaMeter(props: QuotaMeterProps): React.ReactElement;

export interface ScoreRingProps { value: number; size?: number; label?: Node; showVerdict?: boolean; tone?: 'good' | 'mid' | 'low'; className?: string }
export declare function ScoreRing(props: ScoreRingProps): React.ReactElement;

export interface EmptyStateProps { icon?: string; title: Node; children?: Node; action?: Node; secondaryAction?: Node; compact?: boolean; className?: string }
export declare function EmptyState(props: EmptyStateProps): React.ReactElement;

export interface SkeletonProps { variant?: 'text' | 'card' | 'bubble'; lines?: number; width?: string; height?: string }
export declare function Skeleton(props: SkeletonProps): React.ReactElement;

export interface ModalProps { open?: boolean; title: string; children?: Node; footer?: Node; onClose?: () => void; icon?: string; tone?: 'ai' | 'warning' | 'danger' | 'success'; size?: 'sm' | 'md' | 'lg'; /** chỉ cho preview */ inline?: boolean; className?: string }
export declare function Modal(props: ModalProps): React.ReactElement | null;

export interface DrawerProps { open?: boolean; side?: 'right' | 'left' | 'bottom'; title: string; children?: Node; footer?: Node; onClose?: () => void; width?: string; inline?: boolean; className?: string }
export declare function Drawer(props: DrawerProps): React.ReactElement | null;

export type MicState = 'idle' | 'permission' | 'recording' | 'analyzing' | 'denied' | 'unsupported' | 'disabled';
export interface MicButtonProps { state?: MicState; /** 0–1 */ level?: number; onClick?: () => void; label?: string; hint?: string; size?: 'md' | 'lg'; hideLabel?: boolean; className?: string }
export declare function MicButton(props: MicButtonProps): React.ReactElement;

export interface AudioPlayerProps { variant?: 'bar' | 'chip'; label?: string; duration?: number; /** 0–1 */ progress?: number; playing?: boolean; onToggle?: (playing: boolean) => void; speeds?: boolean; speed?: number; onSpeed?: () => void; className?: string }
export declare function AudioPlayer(props: AudioPlayerProps): React.ReactElement;

/** text dùng cú pháp {漢字|かんじ} cho furigana */
export interface JpTextProps { text: string; furigana?: boolean; size?: 'sm' | 'md' | 'lg'; romaji?: string; as?: string; className?: string }
export declare function JpText(props: JpTextProps): React.ReactElement;

export interface ChatBubbleProps {
  from: 'ai' | 'me'; name?: string; jp: string; vi?: string; romaji?: string; avatar?: Node;
  showFurigana?: boolean; showTranslation?: boolean; onPlay?: ((playing: boolean) => void) | null;
  onSelect?: () => void; selected?: boolean; score?: number; status?: 'sending' | 'error'; onRetry?: () => void; className?: string;
}
export declare function ChatBubble(props: ChatBubbleProps): React.ReactElement;

export type DiffError = 'chouon' | 'sokuon' | 'hatsuon' | 'dakuon' | 'mora' | 'particle' | 'word' | 'extra';
export interface DiffToken { text: string; reading?: string; status?: 'ok' | 'wrong' | 'missing' | 'extra'; error?: DiffError; expected?: string }
export interface WordDiffProps { tokens: DiffToken[]; showLegend?: boolean; className?: string }
export declare function WordDiff(props: WordDiffProps): React.ReactElement;

export interface FeedbackItemProps { tone?: 'success' | 'warning' | 'error' | 'tip'; title: Node; children?: Node; suggestion?: { jp: string; vi?: string }; onPlay?: () => void; onCopy?: () => void; className?: string }
export declare function FeedbackItem(props: FeedbackItemProps): React.ReactElement;

declare global {
  interface Window {
    JCAP: {
      Logo: typeof Logo; Icon: typeof Icon; Button: typeof Button; IconButton: typeof IconButton; TextField: typeof TextField; Select: typeof Select;
      Switch: typeof Switch; SegmentedControl: typeof SegmentedControl; JlptBadge: typeof JlptBadge; CreditBadge: typeof CreditBadge;
      Badge: typeof Badge; Alert: typeof Alert; Toast: typeof Toast; Tabs: typeof Tabs; Stepper: typeof Stepper; AppHeader: typeof AppHeader;
      SideNav: typeof SideNav; BottomNav: typeof BottomNav; Card: typeof Card; ScenarioCard: typeof ScenarioCard; ShadowingCard: typeof ShadowingCard;
      Table: typeof Table; ProgressBar: typeof ProgressBar; QuotaMeter: typeof QuotaMeter; ScoreRing: typeof ScoreRing; EmptyState: typeof EmptyState;
      Skeleton: typeof Skeleton; Modal: typeof Modal; Drawer: typeof Drawer; MicButton: typeof MicButton; AudioPlayer: typeof AudioPlayer;
      JpText: typeof JpText; ChatBubble: typeof ChatBubble; WordDiff: typeof WordDiff; FeedbackItem: typeof FeedbackItem;
    };
  }
}
