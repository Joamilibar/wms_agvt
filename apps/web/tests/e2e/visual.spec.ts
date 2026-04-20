import { test, expect } from '@playwright/test';

test.describe('Visual Regression', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.getByLabel('Email').fill('admin@cabodehornos.cl');
    await page.getByLabel('Contraseña').fill('Admin123!');
    await page.getByRole('button', { name: /ingresar/i }).click();
    await page.waitForURL('/');
  });

  test('login page matches snapshot', async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('login.png', {
      fullPage: true,
    });
  });

  test('dashboard matches snapshot', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    await expect(page).toHaveScreenshot('dashboard.png', {
      fullPage: true,
    });
  });

  test('sidebar matches snapshot', async ({ page }) => {
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveScreenshot('sidebar.png');
  });

  test('responsive layouts match snapshots', async ({ page }) => {
    // Desktop
    await page.setViewportSize({ width: 1920, height: 1080 });
    await expect(page).toHaveScreenshot('dashboard-desktop.png');

    // Tablet
    await page.setViewportSize({ width: 768, height: 1024 });
    await expect(page).toHaveScreenshot('dashboard-tablet.png');

    // Mobile
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page).toHaveScreenshot('dashboard-mobile.png');
  });

  test('dark mode matches snapshot', async ({ page }) => {
    // WMS PRO is already dark by default
    await page.emulateMedia({ colorScheme: 'dark' });

    await expect(page).toHaveScreenshot('dashboard-dark.png', {
      fullPage: true,
    });
  });
});
