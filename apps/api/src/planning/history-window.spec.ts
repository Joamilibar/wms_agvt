import { historyWindow } from './history-window.js';

/**
 * The window rule the client fixed: from 2025-01-01 to the end of the month
 * before the run, capped at 24 months.
 */
describe('historyWindow', () => {
  it('starts at the floor while less than 24 months have passed', () => {
    const w = historyWindow(new Date(Date.UTC(2026, 8, 17))); // 17 sep 2026
    expect(w.fromMonth).toBe('2025-01');
    expect(w.toMonth).toBe('2026-08');
    expect(w.months).toBe(20);
    expect(w.to.toISOString().slice(0, 10)).toBe('2026-08-31');
  });

  it('fills the 24 months exactly in January 2027', () => {
    const w = historyWindow(new Date(Date.UTC(2027, 0, 5)));
    expect(w.fromMonth).toBe('2025-01');
    expect(w.toMonth).toBe('2026-12');
    expect(w.months).toBe(24);
  });

  it('slides forward and never exceeds 24 months', () => {
    const w = historyWindow(new Date(Date.UTC(2027, 5, 1))); // jun 2027
    expect(w.fromMonth).toBe('2025-06');
    expect(w.toMonth).toBe('2027-05');
    expect(w.months).toBe(24);
    expect(w.monthKeys[0]).toBe('2025-06');
    expect(w.monthKeys[23]).toBe('2027-05');
  });

  it('excludes the current month even on its last day', () => {
    const w = historyWindow(new Date(Date.UTC(2026, 8, 30)));
    expect(w.toMonth).toBe('2026-08');
  });
});
