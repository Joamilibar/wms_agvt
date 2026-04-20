import { test, expect } from '@playwright/test';
import { expectNoA11yViolations, getA11yReport } from './helpers/a11y';

test.describe('Login Page Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
  });

  test('should have no WCAG 2.1 AA violations', async ({ page }) => {
    await expectNoA11yViolations(page, {
      level: 'wcag21aa',
    });
  });

  test('should have proper form labels', async ({ page }) => {
    // Check form has proper labels
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Contraseña')).toBeVisible();

    // Check submit button is accessible
    await expect(page.getByRole('button', { name: /ingresar/i })).toBeEnabled();

    // Run full a11y scan
    await expectNoA11yViolations(page);
  });

  test('should generate full accessibility report', async ({ page }) => {
    const report = await getA11yReport(page);

    console.log(`Accessibility Report:
      - Violations: ${report.violations}
      - Passes: ${report.passes}
      - Incomplete: ${report.incomplete}
    `);

    expect(report.violations).toBe(0);
  });
});

test.describe('Dashboard Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    // Login first
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@cabodehornos.cl');
    await page.getByLabel('Contraseña').fill('Admin123!');
    await page.getByRole('button', { name: /ingresar/i }).click();
    await page.waitForURL('/');
  });

  test('should have no WCAG 2.1 AA violations on dashboard', async ({ page }) => {
    await expectNoA11yViolations(page, {
      level: 'wcag21aa',
      // Exclude chart canvases from a11y scan (Recharts SVG)
      excludeSelectors: ['.recharts-wrapper'],
    });
  });

  test('sidebar navigation should be accessible', async ({ page }) => {
    // Check navigation landmarks
    const nav = page.locator('nav');
    await expect(nav).toBeVisible();

    // Check all nav links are accessible
    const links = nav.locator('a');
    const count = await links.count();
    expect(count).toBeGreaterThan(0);

    await expectNoA11yViolations(page);
  });
});
