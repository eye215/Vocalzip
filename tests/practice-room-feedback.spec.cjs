const {test,expect}=require('@playwright/test');

function wav(frequency=293.66){
 const rate=16000,frames=rate*2,bytes=44+frames*2,b=Buffer.alloc(bytes);
 b.write('RIFF',0);b.writeUInt32LE(bytes-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(rate,24);b.writeUInt32LE(rate*2,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(frames*2,40);
 for(let i=0;i<frames;i++)b.writeInt16LE(Math.round(7000*Math.sin(i*frequency*2*Math.PI/rate)),44+i*2);
 return b;
}

// After 제출: either the result, or the room's own error text (printed by the assertion when it fails).
async function result(scope){
 await expect(scope.locator('.result-heading').or(scope.locator('#record-error:not(:empty)')).first()).toBeVisible({timeout:15000});
 expect(await scope.locator('#record-error').textContent({timeout:1000}).catch(()=>'')||'').toBe('');
}

test('task timer starts on practice action and pitch feedback shows percent and cent together',async({page})=>{
 await page.goto('/practice-room/index.html');
 await page.locator('[data-task="tone"]').click();
 await page.waitForTimeout(1200);
 await expect(page.locator('#timer')).toHaveText('00:00');
 await expect(page.locator('#timer-toggle')).toHaveText('연습 시간 시작');
 await page.locator('#timer-toggle').click();
 await page.waitForTimeout(1100);
 await page.locator('#timer-toggle').click();
 await expect(page.locator('#timer')).toHaveText('00:01');
 await page.locator('[data-upload="0"]').setInputFiles({name:'D4.wav',mimeType:'audio/wav',buffer:wav()});
 await expect(page.locator('audio[data-audio="0"]')).toBeVisible();
 await page.locator('#submit').click();
 await result(page);
 await expect(page.locator('.result-heading')).toBeVisible();
 await expect(page.locator('.result-metric').first()).toContainText('%');
 await expect(page.locator('.result-metric').first()).toContainText('cent');
 await expect(page.locator('.result-metric').first()).toContainText(/기준 대비 주파수 차이 [+-]?\d+(?:\.\d+)?% · \d+ cent/);
 await expect(page.getByText('과제 타이머 00:01 · 녹음 2초')).toBeVisible();
 await expect(page.getByText('다음에 이렇게 소리 내봐요')).toBeVisible();
});

test('large pitch difference is marked as uncertain rather than graded',async({page})=>{
 await page.goto('/practice-room/index.html');
 await page.locator('[data-task="tone"]').click();
 await page.locator('[data-upload="0"]').setInputFiles({name:'C5.wav',mimeType:'audio/wav',buffer:wav(523.25)});
 await page.locator('#submit').click();
 await result(page);
 await expect(page.locator('.result-heading')).toContainText('분석은 보류');
 await expect(page.locator('.result-metric').first()).toContainText('확인 필요');
 await expect(page.locator('.result-metric').first()).toContainText('cent');
 await expect(page.locator('.result-metric').first()).toContainText('%');
 await expect(page.locator('.result-metric').first()).toContainText(/기준 대비 주파수 차이 [+-]?\d+(?:\.\d+)?% · \d+ cent/);
});

test('two connected-phrase recordings enable results without a memo',async({page})=>{
 await page.goto('/practice-room/index.html');
 await page.locator('[data-task="connect"]').click();
 await expect(page.locator('#submit')).toBeDisabled();
 await page.locator('[data-upload="0"]').setInputFiles({name:'A.wav',mimeType:'audio/wav',buffer:wav()});
 // Each pick re-renders the slots once the take is read: wait for it before picking the next one.
 await expect(page.locator('audio[data-audio="0"]')).toBeVisible();
 await expect(page.locator('#submit')).toBeDisabled();
 await page.locator('[data-upload="1"]').setInputFiles({name:'B.wav',mimeType:'audio/wav',buffer:wav()});
 await expect(page.locator('#submit')).toBeEnabled();
 await expect(page.locator('label[for="memo"]')).toContainText('(선택)');
 await page.locator('[data-action="remove"][data-slot="1"]').click();
 await expect(page.locator('#submit')).toBeDisabled();
 await page.locator('[data-upload="1"]').setInputFiles({name:'B.wav',mimeType:'audio/wav',buffer:wav()});
 await page.locator('#submit').click();
 await result(page);
 await expect(page.locator('.result-heading')).toBeVisible();
 await expect(page.getByText('별도 메모를 남기지 않았어요.')).toBeVisible();
});
