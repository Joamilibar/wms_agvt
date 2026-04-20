import { Page, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

export interface A11yOptions {
  /** WCAG conformance level: 'wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa' */
  level?: 'wcag2a' | 'wcag2aa' | 'wcag21aa' | 'wcag22aa';
  /** Specific rules to include */
  includeRules?: string[];
  /** Specific rules to exclude */
  excludeRules?: string[];
  /** Selectors to exclude from analysis */
  excludeSelectors?: string[];
}

/**
 * Run accessibility scan on page and assert no violations
 */
export async function expectNoA11yViolations(
  page: Page,
  options: A11yOptions = {}
): Promise<void> {
  const {
    level = 'wcag21aa',
    includeRules = [],
    excludeRules = [],
    excludeSelectors = [],
  } = options;

  let builder = new AxeBuilder({ page })
    .withTags([level, 'best-practice']);

  if (includeRules.length > 0) {
    builder = builder.include(includeRules);
  }

  if (excludeRules.length > 0) {
    builder = builder.disableRules(excludeRules);
  }

  if (excludeSelectors.length > 0) {
    for (const selector of excludeSelectors) {
      builder = builder.exclude(selector);
    }
  }

  const results = await builder.analyze();

  // Format violations for readable output
  const violationSummary = results.violations.map((v) => ({
    rule: v.id,
    impact: v.impact,
    description: v.description,
    nodes: v.nodes.length,
    elements: v.nodes.map((n) => n.html).slice(0, 3),
  }));

  expect(
    results.violations,
    `Found ${results.violations.length} accessibility violation(s):\n${JSON.stringify(violationSummary, null, 2)}`
  ).toHaveLength(0);
}

/**
 * Run accessibility scan and return detailed report
 */
export async function getA11yReport(
  page: Page,
  options: A11yOptions = {}
): Promise<{
  violations: number;
  passes: number;
  incomplete: number;
  details: unknown;
}> {
  const { level = 'wcag21aa' } = options;

  const results = await new AxeBuilder({ page })
    .withTags([level, 'best-practice'])
    .analyze();

  return {
    violations: results.violations.length,
    passes: results.passes.length,
    incomplete: results.incomplete.length,
    details: results,
  };
}
