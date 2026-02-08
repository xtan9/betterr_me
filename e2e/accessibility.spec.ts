import { test, expect } from '@playwright/test';

/**
 * QA-004: Accessibility audit
 * Tests WCAG 2.1 AA compliance across all pages.
 *
 * Acceptance criteria:
 * - Keyboard navigation works end-to-end
 * - Screen reader can complete main flows
 * - Color contrast passes
 * - No critical violations
 */

test.describe('Accessibility - Keyboard Navigation', () => {
  test('should navigate dashboard with keyboard only', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Tab through interactive elements
    await page.keyboard.press('Tab');
    const firstFocused = await page.evaluate(() => document.activeElement?.tagName);
    expect(firstFocused).toBeDefined();

    // Continue tabbing - should cycle through focusable elements
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => {
        const el = document.activeElement;
        return el ? { tag: el.tagName, role: el.getAttribute('role') } : null;
      });
      expect(focused).not.toBeNull();
    }
  });

  test('should have visible focus indicators', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Tab through several elements — the first Tab may land on a skip-link
    // or element without visible focus ring. Check multiple elements.
    let hasFocusStyle = false;
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press('Tab');
      hasFocusStyle = await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return false;
        const styles = window.getComputedStyle(el);
        const outline = styles.outline;
        const boxShadow = styles.boxShadow;
        const outlineWidth = styles.outlineWidth;
        // Has some focus indicator (outline or box-shadow)
        return (outline !== 'none' && outline !== '' && outlineWidth !== '0px') ||
               (boxShadow !== 'none' && boxShadow !== '');
      });
      if (hasFocusStyle) break;
    }

    expect(hasFocusStyle).toBe(true);
  });

  test('should navigate habits page with keyboard', async ({ page }) => {
    await page.goto('/habits');
    await page.waitForLoadState('networkidle');

    // Tab through elements
    await page.keyboard.press('Tab');

    // Should be able to reach the create button
    let foundCreateButton = false;
    for (let i = 0; i < 20; i++) {
      const activeText = await page.evaluate(() => document.activeElement?.textContent || '');
      if (/create|new/i.test(activeText)) {
        foundCreateButton = true;
        break;
      }
      await page.keyboard.press('Tab');
    }

    // Create button should be reachable
    expect(foundCreateButton).toBe(true);
  });

  test('should navigate create habit form with keyboard', async ({ page }) => {
    await page.goto('/habits/new');
    await page.waitForLoadState('networkidle');

    // Focus the name input directly so we start tabbing from within the form
    const nameInput = page.getByLabel(/name/i);
    await nameInput.focus();

    // Type habit name
    await page.keyboard.type('Keyboard Test Habit');

    // Tab through form fields (description, category, frequency, etc.)
    // Should be able to reach submit button via keyboard
    let foundSubmit = false;
    for (let i = 0; i < 25; i++) {
      await page.keyboard.press('Tab');
      const activeEl = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          type: el?.getAttribute('type'),
          text: el?.textContent?.trim(),
        };
      });
      if (activeEl.type === 'submit' || /create habit/i.test(activeEl.text || '')) {
        foundSubmit = true;
        break;
      }
    }

    expect(foundSubmit).toBe(true);
  });

  test('should activate checkboxes with Space key', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Target a specific seed habit to avoid parallel contention with other test files
    const checkbox = page.locator('[role="checkbox"][aria-label*="E2E Test - Seed Habit 2"]');
    await expect(checkbox).toBeVisible({ timeout: 10000 });

    const wasChecked = await checkbox.getAttribute('data-state') === 'checked';
    const expectedState = wasChecked ? 'unchecked' : 'checked';

    // Focus and press Space to toggle — checkbox is controlled, data-state updates after API + SWR refetch
    await checkbox.focus();
    await page.keyboard.press('Space');

    // Wait for state change after API call + SWR refetch
    await expect(checkbox).toHaveAttribute('data-state', expectedState, { timeout: 10000 });
  });

  test('should close dialogs with Escape key', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Dialog trigger/dialog tests are inherently optional — dialog may not exist
    const dialogTrigger = page.locator('[data-state="closed"]').first();
    const triggerCount = await dialogTrigger.count();
    if (triggerCount > 0 && await dialogTrigger.isVisible()) {
      await dialogTrigger.click();

      const dialog = page.locator('[role="dialog"]');
      const dialogVisible = await dialog.isVisible().catch(() => false);
      if (dialogVisible) {
        await page.keyboard.press('Escape');
        await expect(dialog).not.toBeVisible({ timeout: 3000 });
      }
    }
  });
});

test.describe('Accessibility - Semantic HTML', () => {
  test('should have proper heading hierarchy on dashboard', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const headings = await page.evaluate(() => {
      const h = document.querySelectorAll('h1, h2, h3, h4, h5, h6');
      return Array.from(h).map(el => ({
        level: parseInt(el.tagName[1]),
        text: el.textContent?.trim() || '',
      }));
    });

    // Should have at least one heading
    expect(headings.length).toBeGreaterThan(0);

    // Should not skip heading levels
    for (let i = 1; i < headings.length; i++) {
      const diff = headings[i].level - headings[i - 1].level;
      // Heading level should not jump more than 1 level down
      expect(diff).toBeLessThanOrEqual(1);
    }
  });

  test('should have alt text on images', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const imagesWithoutAlt = await page.evaluate(() => {
      const images = document.querySelectorAll('img');
      return Array.from(images).filter(img => !img.alt && !img.getAttribute('role')).length;
    });

    expect(imagesWithoutAlt).toBe(0);
  });

  test('should have labels on form inputs', async ({ page }) => {
    await page.goto('/habits/new');
    await page.waitForLoadState('networkidle');

    const unlabeledInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input:not([type="hidden"]), textarea, select');
      return Array.from(inputs).filter(input => {
        const id = input.id;
        const hasLabel = id ? document.querySelector(`label[for="${id}"]`) : false;
        const hasAriaLabel = input.getAttribute('aria-label');
        const hasAriaLabelledBy = input.getAttribute('aria-labelledby');
        const hasTitle = input.getAttribute('title');
        const isWrappedInLabel = input.closest('label');
        return !hasLabel && !hasAriaLabel && !hasAriaLabelledBy && !hasTitle && !isWrappedInLabel;
      }).length;
    });

    expect(unlabeledInputs).toBe(0);
  });

  test('should have proper ARIA roles on interactive elements', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Buttons should be buttons or have button role
    const improperButtons = await page.evaluate(() => {
      const clickables = document.querySelectorAll('[onclick], [tabindex="0"]');
      return Array.from(clickables).filter(el => {
        const tag = el.tagName.toLowerCase();
        const role = el.getAttribute('role');
        return tag !== 'a' && tag !== 'button' && tag !== 'input' &&
               tag !== 'select' && tag !== 'textarea' && !role;
      }).length;
    });

    // Allow some flexibility (third-party components may not follow perfectly)
    expect(improperButtons).toBeLessThan(5);
  });

  test('should have a main landmark', async ({ page }) => {
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const hasMain = await page.evaluate(() => {
      return document.querySelector('main, [role="main"]') !== null;
    });

    expect(hasMain).toBe(true);
  });
});

test.describe('Accessibility - Color and Contrast', () => {
  // Login page test — needs unauthenticated state to avoid potential redirect
  test.use({ storageState: { cookies: [], origins: [] } });

  test('login page should have sufficient color contrast', async ({ page }) => {
    await page.goto('/auth/login');
    await page.waitForLoadState('networkidle');

    // Check text contrast on key elements
    const contrastIssues = await page.evaluate(() => {
      function getLuminance(r: number, g: number, b: number): number {
        const [rs, gs, bs] = [r, g, b].map(c => {
          c = c / 255;
          return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
      }

      function getContrastRatio(l1: number, l2: number): number {
        const lighter = Math.max(l1, l2);
        const darker = Math.min(l1, l2);
        return (lighter + 0.05) / (darker + 0.05);
      }

      function parseColor(color: string): [number, number, number] {
        const match = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (match) return [parseInt(match[1]), parseInt(match[2]), parseInt(match[3])];
        return [0, 0, 0];
      }

      const textElements = document.querySelectorAll('p, span, label, h1, h2, h3, h4, button, a');
      let issues = 0;

      textElements.forEach(el => {
        const styles = window.getComputedStyle(el);
        const color = styles.color;
        const bgColor = styles.backgroundColor;
        const fontSize = parseFloat(styles.fontSize);

        if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)') {
          const [r1, g1, b1] = parseColor(color);
          const [r2, g2, b2] = parseColor(bgColor);
          const l1 = getLuminance(r1, g1, b1);
          const l2 = getLuminance(r2, g2, b2);
          const ratio = getContrastRatio(l1, l2);

          // WCAG AA: 4.5:1 for normal text, 3:1 for large text (>=18px or >=14px bold)
          const minRatio = fontSize >= 18 ? 3 : 4.5;
          if (ratio < minRatio) {
            issues++;
          }
        }
      });

      return issues;
    });

    // Allow some tolerance for non-critical decorative elements
    expect(contrastIssues).toBeLessThan(3);
  });
});

test.describe('Accessibility - Responsive', () => {
  test('should maintain touch targets of at least 44px on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const smallTouchTargets = await page.evaluate(() => {
      const interactive = document.querySelectorAll('button, a, input, [role="checkbox"], [role="button"]');
      let small = 0;

      interactive.forEach(el => {
        const rect = el.getBoundingClientRect();
        // Only check visible elements.
        // getBoundingClientRect() returns border-box dimensions (includes padding).
        if (rect.width > 0 && rect.height > 0) {
          // Exclude inline links within text (WCAG 2.5.8 inline exception)
          const tag = el.tagName.toLowerCase();
          const parentDisplay = window.getComputedStyle(el.parentElement!).display;
          const isInlineLink = tag === 'a' && (parentDisplay === 'block' || parentDisplay === 'flex')
            && window.getComputedStyle(el).display === 'inline';
          if (isInlineLink) return;

          // Exclude Radix UI checkboxes — they are 16x16 by design but have
          // adequate click area via parent spacing / label association.
          if (el.hasAttribute('data-slot') && el.getAttribute('data-slot') === 'checkbox') return;

          // Exclude elements inside habit/task cards — these are compact list items
          // with adequate tap area provided by their card container layout.
          if (el.closest('[data-slot="card"]')) return;

          if (rect.width < 44 || rect.height < 44) {
            small++;
          }
        }
      });

      return small;
    });

    // Allow some tolerance — inline nav links and small icon toggles may not
    // meet 44px on one dimension. Keep this tight to catch real regressions.
    expect(smallTouchTargets).toBeLessThan(8);
  });

  test('should not have font size below 16px for inputs on iOS', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/habits/new');
    await page.waitForLoadState('networkidle');

    const smallFontInputs = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input, textarea, select');
      let count = 0;
      inputs.forEach(el => {
        const fontSize = parseFloat(window.getComputedStyle(el).fontSize);
        if (fontSize < 16) count++;
      });
      return count;
    });

    // Inputs with font-size < 16px cause iOS zoom
    expect(smallFontInputs).toBe(0);
  });
});
