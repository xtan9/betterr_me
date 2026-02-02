import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useIsMobile } from '@/hooks/use-mobile';

describe('useIsMobile', () => {
  let originalMatchMedia: typeof window.matchMedia;
  let originalInnerWidth: number;
  let mockAddEventListener: ReturnType<typeof vi.fn>;
  let mockRemoveEventListener: ReturnType<typeof vi.fn>;
  let changeCallback: (() => void) | null = null;

  beforeEach(() => {
    originalMatchMedia = window.matchMedia;
    originalInnerWidth = window.innerWidth;
    mockAddEventListener = vi.fn((event, callback) => {
      if (event === 'change') {
        changeCallback = callback;
      }
    });
    mockRemoveEventListener = vi.fn();
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: originalInnerWidth,
    });
    changeCallback = null;
  });

  const setupMocks = (width: number) => {
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: width,
    });

    window.matchMedia = vi.fn().mockImplementation((query) => ({
      matches: width < 768,
      media: query,
      onchange: null,
      addListener: vi.fn(), // Deprecated
      removeListener: vi.fn(), // Deprecated
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
      dispatchEvent: vi.fn(),
    }));
  };

  it('returns false initially (undefined becomes false)', () => {
    setupMocks(1024);
    const { result } = renderHook(() => useIsMobile());

    // Initial render returns !!undefined which is false
    expect(result.current).toBe(false);
  });

  it('returns true for mobile width (< 768px)', () => {
    setupMocks(500);
    const { result } = renderHook(() => useIsMobile());

    // After useEffect runs, it should detect mobile
    expect(result.current).toBe(true);
  });

  it('returns false for desktop width (>= 768px)', () => {
    setupMocks(1024);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('returns false for exactly 768px width', () => {
    setupMocks(768);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);
  });

  it('returns true for 767px width', () => {
    setupMocks(767);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);
  });

  it('adds event listener on mount', () => {
    setupMocks(1024);
    renderHook(() => useIsMobile());

    expect(mockAddEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('removes event listener on unmount', () => {
    setupMocks(1024);
    const { unmount } = renderHook(() => useIsMobile());

    unmount();

    expect(mockRemoveEventListener).toHaveBeenCalledWith('change', expect.any(Function));
  });

  it('updates when window is resized to mobile', () => {
    setupMocks(1024);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(false);

    // Simulate resize to mobile
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });
      if (changeCallback) {
        changeCallback();
      }
    });

    expect(result.current).toBe(true);
  });

  it('updates when window is resized to desktop', () => {
    setupMocks(500);
    const { result } = renderHook(() => useIsMobile());

    expect(result.current).toBe(true);

    // Simulate resize to desktop
    act(() => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });
      if (changeCallback) {
        changeCallback();
      }
    });

    expect(result.current).toBe(false);
  });

  it('uses correct breakpoint query', () => {
    setupMocks(1024);
    renderHook(() => useIsMobile());

    expect(window.matchMedia).toHaveBeenCalledWith('(max-width: 767px)');
  });
});
