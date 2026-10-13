import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function initialize(page: Page) {
  await page.goto('/');
  const welcome = page.getByRole('dialog');
  await expect(welcome.getByRole('heading', { name: '欢迎来到你的成长实验室' })).toBeVisible();
  await welcome.getByLabel('如何称呼你').fill('测试同学');
  await welcome.getByRole('button', { name: '开启我的成长计划' }).click();
  await expect(welcome).not.toBeVisible();
}

async function createJournal(page: Page, title: string, body: string) {
  await page.goto('/#/journal');
  await page.getByRole('button', { name: '新建日志' }).click();
  await page.getByLabel('日志标题', { exact: true }).fill(title);
  await page.getByLabel('日志正文', { exact: true }).fill(body);
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  return page.url();
}

async function recordTraining(page: Page, reflection: string) {
  await page.goto('/#/training');
  await page.getByRole('button', { name: '记录这次练习' }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('训练心得', { exact: true }).fill(reflection);
  await dialog.getByRole('button', { name: '完成并保存到本机' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.locator('.training-history').filter({ hasText: reflection })).toBeVisible();
}

async function completeCourse(page: Page, note: string) {
  await page.goto('/#/academy/M04-L01');
  await page.getByLabel('学习笔记', { exact: true }).fill(note);
  await expect(page.locator('.lesson-notes .save-state')).toHaveText('已保存到本机');
  await page.getByRole('button', { name: '收藏课程', exact: true }).click();
  await expect(page.getByRole('button', { name: '已收藏', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '测试与复盘' }).click();
  const questions = page.locator('fieldset.quiz-question');
  await expect(questions).toHaveCount(3);
  for (const [index, answer] of [1, 2, 2].entries()) {
    await questions.nth(index).getByRole('radio').nth(answer).check();
  }
  await page.getByRole('button', { name: '提交测验并完成课程' }).click();
  await expect(page.getByText('本课程已完成 · 上次测验 100%', { exact: true })).toBeVisible();
}

async function completeAssessment(page: Page) {
  await page.goto('/#/assessment');
  await page.getByRole('button', { name: '开始 / 再次自评' }).click();
  for (let step = 0; step < 12; step++) {
    const questions = page.locator('fieldset.self-question');
    await expect(questions).toHaveCount(2);
    await questions.nth(0).getByRole('radio').nth(2).check();
    await questions.nth(1).getByRole('radio').nth(2).check();
    await page.getByRole('button', { name: step < 11 ? '下一维度' : '保存自评结果' }).click();
  }
  await expect(page.locator('.assessment-form')).not.toBeVisible();
  await expect(page.locator('.score-grid .card')).toHaveCount(12);
  await expect(page.locator('.assessment-history')).toHaveCount(1);
}

async function completeScenario(page: Page) {
  await page.goto('/#/scenarios');
  await page.getByRole('button', { name: '进入场景' }).first().click();
  for (let choice = 0; choice < 3; choice++) {
    await page.locator('.scenario-options button').first().click();
    await expect(page.locator('.scenario-feedback')).toContainText('其他可行的方式');
    await page.getByRole('button', { name: choice < 2 ? '继续对话' : '进入复盘' }).click();
  }
  await page
    .getByLabel('场景反思', { exact: true })
    .fill('说明具体兴趣，也尊重对方结束交流的时间。');
  await page.getByRole('button', { name: '保存练习结果' }).click();
  await expect(page.getByRole('button', { name: '练习已保存到本机' })).toBeVisible();
  await expect(page.locator('.scenario-history')).toContainText('3 次选择');
}

async function exportBackup(page: Page) {
  await page.goto('/#/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '一键导出 JSON' }).click();
  const download = await downloadPromise;
  const path = await download.path();
  expect(path).toBeTruthy();
  return {
    path: path!,
    data: JSON.parse(await readFile(path!, 'utf8')) as {
      schemaVersion: number;
      records: { id: string; kind: string; payload: unknown }[];
    },
  };
}

test('日志创建、自动保存、修改和刷新恢复', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await initialize(page);
  await page.getByRole('button', { name: '关闭提示' }).click();
  await expect(page.getByRole('heading', { name: '测试同学，让成长成为日常。' })).toBeVisible();
  const dashboardPath = testInfo.outputPath('desktop-dashboard.png');
  await page.screenshot({ path: dashboardPath, fullPage: true, animations: 'disabled' });
  await testInfo.attach('desktop dashboard', { path: dashboardPath, contentType: 'image/png' });
  await createJournal(page, '一次更清楚的表达', '## 今天的发现\n先说明观点，再分享一个具体例子。');
  await page.getByLabel('日志标签', { exact: true }).fill('表达，复盘');
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  await page.reload();
  await expect(page.getByLabel('日志标题', { exact: true })).toHaveValue('一次更清楚的表达');
  await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue(
    '## 今天的发现\n先说明观点，再分享一个具体例子。',
  );
  await expect(page.getByLabel('日志标签', { exact: true })).toHaveValue('表达，复盘');
  await page
    .getByLabel('日志正文', { exact: true })
    .fill('## 更新的复盘\n下一次，我会先询问对方的想法。');
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  await page.reload();
  await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue(
    '## 更新的复盘\n下一次，我会先询问对方的想法。',
  );
  await page.getByRole('button', { name: '切换预览' }).click();
  await expect(
    page.locator('.markdown-preview').getByRole('heading', { name: '更新的复盘' }),
  ).toBeVisible();
  await page.getByRole('button', { name: '切换预览' }).click();
  await page.getByLabel('日志标签', { exact: true }).fill('长'.repeat(100));
  await page.getByLabel('日志正文', { exact: true }).fill('长标签不会阻止之后的正文保存。');
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  await page.reload();
  await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue(
    '长标签不会阻止之后的正文保存。',
  );
  await expect(page.getByLabel('日志标签', { exact: true })).toHaveValue('长'.repeat(40));
});

test('自定义训练和兴趣目标真正持久保存、修改及删除', async ({ page }) => {
  await initialize(page);
  await page.goto('/#/training');
  await page.getByRole('button', { name: '自定义任务' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('任务名称').fill('向同学提出一个开放式问题');
  await dialog.getByLabel('具体做什么？').fill('交流时围绕对方提到的兴趣提问，听完再回应。');
  await dialog.getByLabel('训练时长').selectOption('15');
  await dialog.getByRole('button', { name: '保存任务' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '15 分钟 标准练习' }).click();
  await expect(
    page.locator('.training-card').filter({ hasText: '向同学提出一个开放式问题' }),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: '15 分钟 标准练习' }).click();
  await expect(
    page.locator('.training-card').filter({ hasText: '向同学提出一个开放式问题' }),
  ).toBeVisible();
  await page.goto('/#/studio');
  await page.getByRole('button', { name: '添加兴趣', exact: true }).click();
  await dialog.getByLabel('兴趣名称').fill('校园摄影');
  await dialog.getByLabel('为什么感兴趣？下一步想做什么？').fill('拍一次傍晚的光影。');
  await dialog.getByRole('button', { name: '保存到本机' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: '添加成长目标', exact: true }).click();
  await dialog.getByLabel('想完成的具体行动').fill('记录三次具体观察');
  await dialog.getByRole('button', { name: '保存到本机' }).click();
  await page.getByLabel('记录三次具体观察的状态').selectOption('已完成');
  await page.reload();
  await expect(page.locator('.interest-list')).toContainText('校园摄影');
  await expect(page.getByLabel('记录三次具体观察的状态')).toHaveValue('已完成');
  const interest = page.locator('.interest-list .studio-record').filter({ hasText: '校园摄影' });
  await interest.getByRole('button', { name: '编辑' }).click();
  await dialog.getByLabel('兴趣名称').fill('城市摄影');
  await dialog.getByRole('button', { name: '保存到本机' }).click();
  await expect(page.locator('.interest-list')).toContainText('城市摄影');
  page.once('dialog', (confirmation) => confirmation.accept());
  await page.locator('.interest-list .studio-record').getByRole('button', { name: '删除' }).click();
  await expect(page.locator('.interest-list')).not.toContainText('城市摄影');
  await page.reload();
  await expect(page.locator('.interest-list')).not.toContainText('城市摄影');
});

test('已缓存应用离线训练、编辑日志、关闭后重开仍恢复数据', async ({ page, context }) => {
  await initialize(page);
  const journalUrl = await createJournal(page, '离线练习记录', '联网时记录的初稿。');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);

  await context.setOffline(true);
  await recordTraining(page, '断网时也完成了一分钟观点练习。');
  await page.goto(journalUrl);
  await page
    .getByLabel('日志正文', { exact: true })
    .fill('断网后的真实修改，等待未来的云同步接入。');
  await expect(page.locator('.journal-editor .save-state')).toHaveText('已保存到本机');
  await page.reload();
  await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue(
    '断网后的真实修改，等待未来的云同步接入。',
  );

  await page.close();
  const reopened = await context.newPage();
  await reopened.goto(journalUrl);
  await expect(reopened.getByLabel('日志正文', { exact: true })).toHaveValue(
    '断网后的真实修改，等待未来的云同步接入。',
  );
  await expect(reopened.locator('.notice.offline')).toContainText('当前处于离线模式');
  await reopened.goto('/#/training');
  await expect(
    reopened.locator('.training-history').filter({ hasText: '断网时也完成了一分钟观点练习。' }),
  ).toBeVisible();
  await context.setOffline(false);
  await expect(reopened.locator('.top-status')).toContainText('在线');
  await expect(reopened.locator('.status-strip')).toContainText('云同步未启用');
  await expect(reopened.locator('.status-strip')).toContainText(/[1-9]\d* 项本地变更/);
});

test('课程笔记、收藏、五阶段位置和测验结果刷新后保留', async ({ page }) => {
  await initialize(page);
  await completeCourse(page, '观点、理由、例子，最后给对方回应空间。');
  await page.reload();
  await expect(page.getByLabel('学习笔记', { exact: true })).toHaveValue(
    '观点、理由、例子，最后给对方回应空间。',
  );
  await expect(page.getByRole('button', { name: '已收藏', exact: true })).toBeVisible();
  await expect(page.getByText('本课程已完成 · 上次测验 100%', { exact: true })).toBeVisible();
  await expect(page.locator('.lesson-tabs button.active')).toContainText('测试与复盘');
  await page.goto('/#/academy');
  await expect(page.locator('main')).toContainText('先说清楚');
});

test('JSON 导出、清空当前记录、预览并恢复完整私人记录', async ({ page }) => {
  await initialize(page);
  const journalUrl = await createJournal(
    page,
    '备份恢复验证',
    '私人文字应在完整 JSON 中恢复，普通统计 CSV 不包含日志。',
  );
  await recordTraining(page, '用于备份往返验证的真实训练记录。');
  await completeCourse(page, '备份中的课程笔记。');
  await completeAssessment(page);
  await completeScenario(page);
  await page.goto('/#/settings');
  await page.getByRole('button', { name: /Warm Literary/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');
  const backup = await exportBackup(page);
  expect(backup.data.schemaVersion).toBe(1);
  expect(backup.data.records.map((record) => record.kind)).toEqual(
    expect.arrayContaining([
      'profile',
      'journalEntry',
      'trainingRecord',
      'courseProgress',
      'lessonNote',
      'assessmentResult',
      'selfEvaluation',
      'scenarioAttempt',
      'appSettings',
    ]),
  );

  await page.getByRole('button', { name: '清空当前记录' }).click();
  const clearDialog = page.getByRole('dialog');
  await expect(clearDialog.getByRole('heading', { name: '确认清空当前记录' })).toBeVisible();
  await clearDialog.getByLabel('清空确认文字', { exact: true }).fill('清空');
  await clearDialog.getByRole('button', { name: '确认清空', exact: true }).click();
  await expect(clearDialog).not.toBeVisible();
  await expect(page.getByText('本地游客空间 · 0 条可见记录', { exact: true })).toBeVisible();
  await page.getByLabel('上传 JSON 备份', { exact: true }).setInputFiles(backup.path);
  const importDialog = page.getByRole('dialog');
  await expect(importDialog.getByRole('heading', { name: 'JSON 备份预览' })).toBeVisible();
  await importDialog.getByRole('combobox').selectOption('replace');
  page.once('dialog', (dialog) => dialog.accept());
  await importDialog.getByRole('button', { name: '确认恢复', exact: true }).click();
  await expect(importDialog).not.toBeVisible();
  await page.goto(journalUrl);
  await expect(page.getByLabel('日志标题', { exact: true })).toHaveValue('备份恢复验证');
  await expect(page.getByLabel('日志正文', { exact: true })).toHaveValue(
    '私人文字应在完整 JSON 中恢复，普通统计 CSV 不包含日志。',
  );
  await page.goto('/#/training');
  await expect(
    page.locator('.training-history').filter({ hasText: '用于备份往返验证的真实训练记录。' }),
  ).toBeVisible();
  await page.goto('/#/academy/M04-L01');
  await expect(page.getByLabel('学习笔记', { exact: true })).toHaveValue('备份中的课程笔记。');
  await expect(page.getByText('本课程已完成 · 上次测验 100%', { exact: true })).toBeVisible();
  await page.goto('/#/assessment');
  await expect(page.locator('.score-grid .card')).toHaveCount(12);
  await expect(page.locator('.assessment-history')).toHaveCount(1);
  await page.goto('/#/scenarios');
  await expect(page.locator('.scenario-history')).toContainText(
    '说明具体兴趣，也尊重对方结束交流的时间。',
  );
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'warm');

  const restored = await exportBackup(page);
  const businessContent = (records: typeof backup.data.records) =>
    records
      .map(({ id, kind, payload }) => ({ id, kind, payload }))
      .sort((a, b) => a.id.localeCompare(b.id));
  expect(businessContent(restored.data.records)).toEqual(businessContent(backup.data.records));
});

test('手机宽度下课程、训练、日志表单可以操作且页面无横向溢出', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await initialize(page);
  const journalUrl = await createJournal(page, '手机上的小发现', '在手机宽度下记录一次成长。');
  await page.getByRole('button', { name: '关闭提示' }).click();
  for (const { route, label } of [
    { route: '/#/academy/M04-L01', label: 'lesson' },
    { route: '/#/training', label: 'training' },
    { route: journalUrl, label: 'journal' },
  ]) {
    await page.goto(route);
    await expect(page.locator('main')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1);
    const imagePath = testInfo.outputPath(`mobile-${label}.png`);
    await page.screenshot({ path: imagePath, fullPage: true });
    await testInfo.attach(`mobile ${route}`, { path: imagePath, contentType: 'image/png' });
  }
  await page.goto('/#/training');
  await page.getByRole('button', { name: '记录这次练习' }).first().click();
  await page.getByLabel('训练心得', { exact: true }).fill('手机表单也能保存一次训练。');
  await page.getByRole('button', { name: '完成并保存到本机' }).click();
  await expect(
    page.locator('.training-history').filter({ hasText: '手机表单也能保存一次训练。' }),
  ).toBeVisible();
});
