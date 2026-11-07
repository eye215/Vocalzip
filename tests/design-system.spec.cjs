const {test,expect}=require('@playwright/test');

test.describe('VOCAL.zip design-system standalone preview',()=>{
  test.beforeEach(async({page})=>{ await page.goto('/design-system/preview.html'); });

  test('dashboard composes shared cards, active record dock and a single mixed goal list',async({page})=>{
    await expect(page.getByRole('heading',{name:'오늘의 목표'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'이번 주 연습'})).toBeVisible();
    await expect(page.getByRole('heading',{name:'뮤지컬 오디션'})).toBeVisible();
    await expect(page.getByRole('button',{name:'최근 연습곡 Defying Gravity 열기'})).toBeVisible();
    await expect(page.locator('.vz-goal-list .vz-goal-row')).toHaveCount(6);
    await expect(page.locator('.vz-goal-list')).toHaveAttribute('aria-label','오늘의 목표 목록, 내부 스크롤');
    const dims=await page.locator('.vz-goal-list').evaluate(el=>({scroll:el.scrollHeight,client:el.clientHeight}));
    expect(dims.scroll).toBeGreaterThan(dims.client);
    await expect(page.locator('.vz-week-grid .vz-week-day')).toHaveCount(7);
    await expect(page.locator('.vz-week')).not.toContainText('🔥');
    await expect(page.locator('.vz-week .progress-bar')).toHaveCount(0);
    await expect(page.locator('.vz-dock__item--record')).toContainText('녹음');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  });

  test('simple goal changes progress, amount goal requests a record rather than fake completion',async({page})=>{
    await expect(page.locator('.vz-ring__value')).toHaveText('33%');
    await page.getByRole('button',{name:/가사 암기 미완료/}).click();
    await expect(page.locator('.vz-ring__value')).toHaveText('50%');
    await page.getByRole('button',{name:/2절 고음 반복 5회 미완료/}).click();
    await expect(page.getByRole('dialog',{name:'수행 기록 입력'})).toBeVisible();
    await page.getByRole('dialog').getByRole('spinbutton',{name:'실제 수행량'}).fill('3');
    await page.getByRole('dialog').getByRole('button',{name:'기록 저장'}).click();
    await expect(page.locator('.vz-ring__value')).toHaveText('50%');
    await page.getByRole('button',{name:/2절 고음 반복 5회 미완료/}).click();
    await page.getByRole('dialog').getByRole('spinbutton',{name:'실제 수행량'}).fill('5');
    await page.getByRole('dialog').getByRole('button',{name:'기록 저장'}).click();
    await expect(page.locator('.vz-ring__value')).toHaveText('67%');
  });

  test('first-entry sheet supports rest, defer and explicit new plan',async({page})=>{
    await page.getByRole('button',{name:'첫 진입 목표 설정'}).click();
    await expect(page.getByRole('dialog',{name:'오늘의 목표를 설정하세요'})).toBeVisible();
    await page.getByRole('dialog').getByRole('button',{name:'오늘은 쉴래요'}).click();
    await expect(page.getByText('오늘은 쉬어가는 날')).toBeVisible();
    await page.getByRole('button',{name:'첫 진입 목표 설정'}).click();
    await page.getByRole('dialog').getByRole('button',{name:'나중에 정할게요'}).click();
    await expect(page.getByText('나중에 오늘의 목표를 정해보세요.')).toBeVisible();
    await page.getByRole('button',{name:'첫 진입 목표 설정'}).click();
    await page.getByRole('dialog').getByRole('button',{name:'오늘의 목표 설정하기'}).click();
    await expect(page.locator('.vz-goal-list .vz-goal-row')).toHaveCount(6);
  });

  test('student and teacher visual themes share geometry and avoid horizontal overflow',async({page})=>{
    const student=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--vz-color-accent').trim());
    expect(student).toBe('#7954e7');
    await page.getByRole('button',{name:'선생님 테마 보기'}).click();
    const teacher=await page.locator('html').evaluate(el=>getComputedStyle(el).getPropertyValue('--vz-color-accent').trim());
    expect(teacher).toBe('#386ccb');
    await expect(page.locator('.vz-card')).toHaveCount(4);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  });
});
