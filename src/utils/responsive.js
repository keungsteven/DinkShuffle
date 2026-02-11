/**
 * Responsive design utilities for React Native Web
 * Provides breakpoints, responsive values, and layout helpers
 */

import { useState, useEffect } from 'react';
import { Dimensions, Platform } from 'react-native';

// Breakpoints (following common conventions)
export const BREAKPOINTS = {
  mobile: 0,
  tablet: 768,
  desktop: 1024,
  wide: 1280,
};

/**
 * Get current breakpoint name based on window width
 * @param {number} width
 * @returns {'mobile' | 'tablet' | 'desktop' | 'wide'}
 */
export function getBreakpoint(width) {
  if (width >= BREAKPOINTS.wide) return 'wide';
  if (width >= BREAKPOINTS.desktop) return 'desktop';
  if (width >= BREAKPOINTS.tablet) return 'tablet';
  return 'mobile';
}

/**
 * Hook to get responsive screen dimensions and breakpoint
 * @returns {{ width: number, height: number, breakpoint: string, isMobile: boolean, isTablet: boolean, isDesktop: boolean }}
 */
export function useResponsive() {
  const [dimensions, setDimensions] = useState(() => {
    const { width, height } = Dimensions.get('window');
    return { width, height };
  });

  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({ width: window.width, height: window.height });
    });

    return () => subscription?.remove();
  }, []);

  const breakpoint = getBreakpoint(dimensions.width);

  return {
    width: dimensions.width,
    height: dimensions.height,
    breakpoint,
    isMobile: breakpoint === 'mobile',
    isTablet: breakpoint === 'tablet',
    isDesktop: breakpoint === 'desktop' || breakpoint === 'wide',
    isWide: breakpoint === 'wide',
  };
}

/**
 * Get responsive value based on breakpoint
 * @param {{ mobile?: T, tablet?: T, desktop?: T, wide?: T }} values
 * @param {string} breakpoint
 * @returns {T}
 */
export function getResponsiveValue(values, breakpoint) {
  // Fall back through breakpoints
  if (breakpoint === 'wide' && values.wide !== undefined) return values.wide;
  if ((breakpoint === 'wide' || breakpoint === 'desktop') && values.desktop !== undefined) return values.desktop;
  if ((breakpoint === 'wide' || breakpoint === 'desktop' || breakpoint === 'tablet') && values.tablet !== undefined) return values.tablet;
  return values.mobile;
}

/**
 * Create responsive styles object
 * @param {Function} stylesFn - Function that receives responsive helpers and returns styles
 * @returns {Function} - Hook that returns styles
 */
export function createResponsiveStyles(stylesFn) {
  return function useStyles() {
    const responsive = useResponsive();
    return stylesFn(responsive);
  };
}

/**
 * Common responsive container styles
 */
export const containerStyles = {
  // Centered container with max-width
  centered: {
    width: '100%',
    maxWidth: 1200,
    marginHorizontal: 'auto',
    paddingHorizontal: 16,
  },
  // Card container with proper spacing
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    ...Platform.select({
      web: {
        boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
      },
      default: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
        elevation: 2,
      },
    }),
  },
};

/**
 * Get grid column count based on width
 * @param {number} width - Container width
 * @param {number} minItemWidth - Minimum item width
 * @returns {number}
 */
export function getGridColumns(width, minItemWidth = 300) {
  return Math.max(1, Math.floor(width / minItemWidth));
}

/**
 * Common spacing values (scaled for different sizes)
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

/**
 * Typography scale
 */
export const typography = {
  h1: { fontSize: 36, fontWeight: '700', lineHeight: 44 },
  h2: { fontSize: 28, fontWeight: '600', lineHeight: 36 },
  h3: { fontSize: 22, fontWeight: '600', lineHeight: 28 },
  h4: { fontSize: 18, fontWeight: '600', lineHeight: 24 },
  body: { fontSize: 16, fontWeight: '400', lineHeight: 24 },
  bodySmall: { fontSize: 14, fontWeight: '400', lineHeight: 20 },
  caption: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
};

/**
 * Color palette
 */
export const colors = {
  primary: '#2563eb',
  primaryLight: '#eff6ff',
  primaryDark: '#1e40af',
  secondary: '#f3f4f6',
  success: '#10b981',
  successLight: '#d1fae5',
  warning: '#f59e0b',
  warningLight: '#fef3c7',
  error: '#dc2626',
  errorLight: '#fee2e2',
  text: '#1a1a1a',
  textSecondary: '#666',
  textMuted: '#999',
  border: '#e5e7eb',
  background: '#fff',
  backgroundAlt: '#fafafa',
};
