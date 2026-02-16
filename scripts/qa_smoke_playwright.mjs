import { chromium } from 'playwright';

const BASE_URL = process.env.QA_BASE_URL || 'http://127.0.0.1:4173';
const TIMEOUT = 15000;

const result = {
  baseUrl: BASE_URL,
  checks: [],
  consoleErrors: [],
  pageErrors: [],
  screenshots: [],
  status: 'pass',
};

const pushCheck = (name, ok, detail = '') => {
  result.checks.push({ name, ok, detail });
  if (!ok) result.status = 'fail';
};

const ensureVisible = async (page, selector, name) => {
  try {
    await page.waitForSelector(selector, { timeout: TIMEOUT, state: 'visible' });
    pushCheck(name, true);
  } catch (err) {
    pushCheck(name, false, String(err));
  }
};

const run = async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      result.consoleErrors.push(msg.text());
      result.status = 'fail';
    }
  });
  page.on('pageerror', (error) => {
    result.pageErrors.push(String(error));
    result.status = 'fail';
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: TIMEOUT });
    pushCheck('앱 진입 성공', true);
  } catch (err) {
    pushCheck('앱 진입 성공', false, String(err));
    await browser.close();
    return result;
  }

  await ensureVisible(page, 'text=치비 서바이버즈', '타이틀 화면 노출');
  await page.screenshot({ path: 'docs/qa_title.png', fullPage: true });
  result.screenshots.push('docs/qa_title.png');

  try {
    await page.click('button:has-text("게임 시작")', { timeout: TIMEOUT });
    pushCheck('게임 시작 버튼 클릭', true);
  } catch (err) {
    pushCheck('게임 시작 버튼 클릭', false, String(err));
  }

  await ensureVisible(page, 'text=캐릭터 선택', '캐릭터 선택 화면 노출');
  await page.screenshot({ path: 'docs/qa_select.png', fullPage: true });
  result.screenshots.push('docs/qa_select.png');

  try {
    await page.click('button:has-text("출전")', { timeout: TIMEOUT });
    pushCheck('출전 버튼 클릭', true);
  } catch (err) {
    pushCheck('출전 버튼 클릭', false, String(err));
  }

  await ensureVisible(page, 'canvas.game-canvas', '게임 캔버스 노출');
  await ensureVisible(page, 'text=/STAGE\\s+1/', '스테이지 HUD 노출');
  await ensureVisible(page, 'text=EXP', 'EXP HUD 노출');

  await page.waitForTimeout(1200);
  await page.screenshot({ path: 'docs/qa_playing.png', fullPage: true });
  result.screenshots.push('docs/qa_playing.png');

  try {
    await page.keyboard.press('Escape');
    pushCheck('ESC 일시정지 입력', true);
  } catch (err) {
    pushCheck('ESC 일시정지 입력', false, String(err));
  }

  await ensureVisible(page, 'text=일시정지', '일시정지 모달 노출');

  try {
    await page.click('button:has-text("계속하기")', { timeout: TIMEOUT });
    pushCheck('계속하기 버튼 동작', true);
  } catch (err) {
    pushCheck('계속하기 버튼 동작', false, String(err));
  }

  await page.waitForTimeout(500);
  await page.screenshot({ path: 'docs/qa_resume.png', fullPage: true });
  result.screenshots.push('docs/qa_resume.png');

  if (result.consoleErrors.length > 0) {
    pushCheck('콘솔 에러 없음', false, result.consoleErrors.join('\n'));
  } else {
    pushCheck('콘솔 에러 없음', true);
  }

  if (result.pageErrors.length > 0) {
    pushCheck('런타임 예외 없음', false, result.pageErrors.join('\n'));
  } else {
    pushCheck('런타임 예외 없음', true);
  }

  await browser.close();
  return result;
};

const output = await run();
console.log(JSON.stringify(output, null, 2));
if (output.status !== 'pass') {
  process.exitCode = 1;
}
