import { Ionicons } from '@expo/vector-icons';
import {
  Activity, AlignLeft, ArrowDown, ArrowLeft, ArrowUp, ArrowUpDown, AudioLines, BookOpen, CirclePlay, Check, ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CircleArrowDown,
  CircleCheck, CircleHelp, CircleUser, CircleX, Download, Ear, Ellipsis, FileText, FolderOpen, Gauge, Guitar, Hand, HardDrive,
  Heart, House, Info, Keyboard, LayoutGrid, Library, ListMusic, Maximize2, Metronome, Mic, Minimize2, Minus, Music, Music2, Pause,
  Play, Plus, RefreshCw, Repeat, RotateCcw, RotateCw, Search, Settings, SkipBack, SkipForward, SlidersHorizontal, Sparkles, Square,
  SquareCheck, SquarePen, Timer, Trash2, TriangleAlert, Type, Upload, Volume2, X, type LucideIcon,
} from 'lucide-react-native';
import type { ComponentProps } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

/** Icon names follow Ionicons (used across the app); they are drawn with Lucide line icons. */
export type IconName = ComponentProps<typeof Ionicons>['name'];

/** [Lucide icon, filled] for each name the app uses. */
const MAP: Partial<Record<IconName, [LucideIcon, boolean?]>> = {
  add: [Plus],
  remove: [Minus],
  refresh: [RefreshCw],
  'reload-outline': [RotateCcw],
  'arrow-back': [ArrowLeft],
  'arrow-up': [ArrowUp],
  'arrow-down': [ArrowDown],
  'arrow-up-circle': [ArrowUp],
  'arrow-down-circle': [CircleArrowDown, true],
  'arrow-down-circle-outline': [CircleArrowDown],
  'person-circle-outline': [CircleUser],
  'timer-outline': [Timer],
  text: [Type],
  speedometer: [Gauge],
  'speedometer-outline': [Gauge],
  search: [Search],
  pulse: [Metronome],
  'pulse-outline': [Activity],
  play: [Play, true],
  pause: [Pause, true],
  stop: [Square, true],
  'musical-note': [Music],
  'musical-notes': [Music2],
  'musical-notes-outline': [Music2],
  heart: [Heart, true],
  'heart-outline': [Heart],
  grid: [LayoutGrid],
  'grid-outline': [LayoutGrid],
  'download-outline': [Download],
  'cloud-upload-outline': [Upload],
  'create-outline': [SquarePen],
  close: [X],
  'close-circle': [CircleX],
  checkmark: [Check],
  'checkmark-circle': [CircleCheck],
  'checkbox': [SquareCheck],
  'square-outline': [Square],
  albums: [Library],
  'albums-outline': [Library],
  'library-outline': [Library],
  warning: [TriangleAlert],
  'volume-high': [Volume2],
  'trash-outline': [Trash2],
  sparkles: [Sparkles],
  repeat: [Repeat],
  'play-skip-forward': [SkipForward],
  'play-skip-back': [SkipBack],
  'play-forward': [RotateCw],
  'play-back': [RotateCcw],
  'information-circle': [Info],
  'alert-circle': [CircleAlert],
  home: [House],
  'home-outline': [House],
  'help-circle-outline': [CircleHelp],
  'hand-left-outline': [Hand],
  'folder-open': [FolderOpen],
  'folder-open-outline': [FolderOpen],
  expand: [Maximize2],
  contract: [Minimize2],
  'ear-outline': [Ear],
  'document-text-outline': [FileText],
  'chevron-forward': [ChevronRight],
  'chevron-back': [ChevronLeft],
  'chevron-down': [ChevronDown],
  mic: [Mic],
  'mic-outline': [Mic],
  settings: [Settings],
  'settings-outline': [Settings],
  'options-outline': [SlidersHorizontal],
  'keypad-outline': [Keyboard],
  'list-outline': [ListMusic],
  'pulse-sharp': [AudioLines],
  'server-outline': [HardDrive],
  'ellipsis-horizontal': [Ellipsis],
  'musical-notes-sharp': [Guitar],
  'play-circle-outline': [CirclePlay],
  'swap-vertical': [ArrowUpDown],
  'book-outline': [BookOpen],
  'reorder-three-outline': [AlignLeft],
};

export interface IconProps {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  style?: StyleProp<ViewStyle | TextStyle>;
  accessibilityLabel?: string;
}

/** Lucide-style 1.75-px line icons (16/18/20 in the chrome); Ionicons only as a fallback. */
export function Icon({ name, size = 18, color, strokeWidth = 1.75, style }: IconProps) {
  const hit = MAP[name];
  if (!hit) return <Ionicons name={name} size={size} color={color} style={style as StyleProp<TextStyle>} />;
  const [Glyph, filled] = hit;
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} fill={filled ? color : 'none'} style={style as StyleProp<ViewStyle>} />;
}
