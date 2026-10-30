// Design system JCAP (port từ design-handoff/design-system/bundle.js; class jc-* nằm trong src/styles/jcap.css)
export { Icon, type IconProps } from './Icon';
export { Logo, type LogoProps } from './Logo';
export { Button, IconButton, type ButtonProps, type IconButtonProps } from './Button';
export { Badge, JlptBadge, CreditBadge, type BadgeProps, type JlptBadgeProps, type CreditBadgeProps } from './Badge';
export {
  TextField,
  Select,
  Switch,
  SegmentedControl,
  type TextFieldProps,
  type SelectProps,
  type SelectOption,
  type SwitchProps,
  type SegmentedControlProps,
  type SegmentOption,
} from './Form';
export { Tabs, Stepper, type TabsProps, type TabItem, type StepperProps, type Step } from './Tabs';
export { ProgressBar, QuotaMeter, ScoreRing, type ProgressBarProps, type QuotaMeterProps, type ScoreRingProps } from './Progress';
export { EmptyState, type EmptyStateProps } from './EmptyState';
export { JpText, type JpTextProps } from './JpText';
export { MicButton, AudioPlayer, type MicState, type MicButtonProps, type AudioPlayerProps } from './Speaking';
export { ChatBubble, type ChatBubbleProps } from './ChatBubble';
export { WordDiff, type WordDiffProps, type DiffToken, type DiffError } from './WordDiff';
export { FeedbackItem, type FeedbackItemProps } from './FeedbackItem';
export type { Jlpt, Tone } from './utils';
