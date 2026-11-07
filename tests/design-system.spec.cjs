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
    await expect(page.locator('.vz-goal-card').getByText('오늘은 쉬어가는 날')).toBeVisible();
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


test.describe('responsive visual QA snapshot matrix',()=>{
  for(const width of [320,390,430]){
    test('viewport '+width+'px: no clipping, readable cards, reachable dock, correct goal scroll',async({page},testInfo)=>{
      await page.setViewportSize({width,height:844});
      await page.goto('/design-system/preview.html?visual=1');
      await expect(page.locator('.vz-goal-card')).toBeVisible();
      await page.evaluate(()=>document.fonts.ready);
      const metrics=await page.evaluate(()=>{
        const viewport=window.innerWidth;
        const all=[...document.querySelectorAll('.vz-card,.vz-dock,.vz-widget-grid,.vz-goal-card__body')];
        const bounds=all.map(n=>({name:n.className,left:n.getBoundingClientRect().left,right:n.getBoundingClientRect().right,clientWidth:n.clientWidth,scrollWidth:n.scrollWidth}));
        const dock=document.querySelector('.vz-dock').getBoundingClientRect();
        const list=document.querySelector('.vz-goal-list');
        const listRect=list.getBoundingClientRect();
        const goalButtons=[...document.querySelectorAll('.vz-goal-row')];
        const ring=document.querySelector('.vz-ring').getBoundingClientRect();
        return {viewport,docWidth:document.documentElement.scrollWidth,bounds,dockLeft:dock.left,dockRight:dock.right,ringRight:ring.right,listLeft:listRect.left,listWidth:listRect.width,listScrollHeight:list.scrollHeight,listClientHeight:list.clientHeight,goalButtons:goalButtons.length,errors:[]};
      });
      expect(metrics.docWidth,'no global horizontal scroll').toBeLessThanOrEqual(width+1);
      expect(metrics.dockLeft,'dock visible left').toBeGreaterThanOrEqual(0);
      expect(metrics.dockRight,'dock visible right').toBeLessThanOrEqual(width+1);
      expect(metrics.listWidth,'checklist minimum readable width').toBeGreaterThanOrEqual(120);
      expect(metrics.ringRight,'ring does not overlap checklist').toBeLessThanOrEqual(metrics.listLeft+1);
      expect(metrics.goalButtons).toBeGreaterThanOrEqual(3);
      expect(metrics.listScrollHeight).toBeGreaterThan(metrics.listClientHeight);
      for(const box of metrics.bounds){
        expect(box.left,box.name+' left bound').toBeGreaterThanOrEqual(-1);
        expect(box.right,box.name+' right bound').toBeLessThanOrEqual(width+1);
      }
      const fileName='ds-'+testInfo.project.name+'-'+width+'x844.png';
      await page.screenshot({path:'test-results/'+fileName,fullPage:false,animations:'disabled'});
      await testInfo.attach('screen-'+width,{path:'test-results/'+fileName,contentType:'image/png'});
    });
  }
  test('sheet is scrollable with 30 mixed suggestions and Escape returns focus',async({page})=>{
    await page.goto('/design-system/preview.html?firstEntry=1');
    const dialog=page.getByRole('dialog',{name:'오늘의 목표를 설정하세요'});
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button',{name:'오늘은 쉴래요'})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.locator('.vz-goal-card')).toBeVisible();
  });
});
