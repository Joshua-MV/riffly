import { useWindowDimensions } from 'react-native';

import { breakpoints } from './tokens';

export type LayoutSize = 'phone' | 'tablet' | 'desktop';

export function useLayout() {
  const { width, height } = useWindowDimensions();
  const size: LayoutSize = width >= breakpoints.desktop ? 'desktop' : width >= breakpoints.tablet ? 'tablet' : 'phone';
  return { width, height, size, isDesktop: size === 'desktop', isPhone: size === 'phone' };
}
