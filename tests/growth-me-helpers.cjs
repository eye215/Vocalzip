// 성장 › 나 (app/growth-month.js, 성장 새 디자인 2026-11-27) for the browser specs: the period controls (주 · 월 · 전체, ‹ ›)
// sit behind the period pill beside the tabs, and the period's report, 다음 연습, 곡마다 자세히 and 한 것 are folded rows.
// These open them the way a person does (a tap), so a spec can reach what it checks.
'use strict';
const {expect} = require('@playwright/test');
/** The period pill opened (it stays open while 나 is on screen). */
async function openPeriods(page) {
  const pill = page.locator('[data-gm-period-open]');
  await expect(pill).toBeVisible();
  if (await pill.getAttribute('aria-expanded') !== 'true') await pill.click();
  await expect(page.locator('[data-gm-period-panel]')).toBeVisible();
}
/** 주 · 월 · 전체 through the pill. */
async function period(page, kind) { await openPeriods(page); await page.locator('[data-gm-period="' + kind + '"]').click(); }
/** ‹ (−1) or › (1) through the pill. */
async function move(page, dir) { await openPeriods(page); await page.locator('[data-gm-move="' + dir + '"]').click(); }
/** A folded row of 나 opened: 'report' (the period's report), 'next', 'changes', 'done'. It stays open across periods. */
async function openFold(page, key) {
  const fold = page.locator('[data-gm-fold="' + key + '"]');
  await expect(fold).toBeAttached();
  if (!(await fold.evaluate(d => d.open))) await fold.locator(':scope > summary').click();
  await expect(fold).toHaveAttribute('open', '');
}
const openReport = page => openFold(page, 'report');
module.exports = {openPeriods, period, move, openFold, openReport};
