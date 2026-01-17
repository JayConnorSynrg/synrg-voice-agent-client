import { test, expect } from '@playwright/test';

test('debug blank page on GitHub Pages', async ({ page }) => {
  // Collect console messages
  const consoleLogs: string[] = [];
  const consoleErrors: string[] = [];

  page.on('console', msg => {
    const text = `[${msg.type()}] ${msg.text()}`;
    consoleLogs.push(text);
    if (msg.type() === 'error') {
      consoleErrors.push(text);
    }
  });

  // Collect network errors
  const networkErrors: string[] = [];
  page.on('requestfailed', request => {
    networkErrors.push(`FAILED: ${request.url()} - ${request.failure()?.errorText}`);
  });

  // Collect successful requests for debugging
  const loadedResources: string[] = [];
  page.on('response', response => {
    const status = response.status();
    const url = response.url();
    if (url.includes('index-') || url.includes('.js') || url.includes('.css')) {
      loadedResources.push(`[${status}] ${url}`);
    }
  });

  console.log('\n=== Navigating to GitHub Pages ===');
  const url = 'https://jayconnorsynrg.github.io/synrg-voice-agent-client/';

  await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

  // Wait a bit for any async rendering
  await page.waitForTimeout(3000);

  console.log('\n=== Loaded Resources ===');
  loadedResources.forEach(r => console.log(r));

  console.log('\n=== Console Logs ===');
  consoleLogs.forEach(l => console.log(l));

  console.log('\n=== Console Errors ===');
  consoleErrors.forEach(e => console.log(e));

  console.log('\n=== Network Errors ===');
  networkErrors.forEach(e => console.log(e));

  // Check page content
  const bodyHTML = await page.innerHTML('body');
  console.log('\n=== Body HTML (first 2000 chars) ===');
  console.log(bodyHTML.substring(0, 2000));

  // Check if root div exists and has content
  const rootDiv = page.locator('#root');
  const rootExists = await rootDiv.count() > 0;
  console.log(`\n=== #root exists: ${rootExists} ===`);

  if (rootExists) {
    const rootContent = await rootDiv.innerHTML();
    console.log('=== #root content (first 1000 chars) ===');
    console.log(rootContent.substring(0, 1000));
  }

  // Take screenshot
  await page.screenshot({ path: 'screenshots/github-pages-debug.png', fullPage: true });
  console.log('\n=== Screenshot saved to screenshots/github-pages-debug.png ===');

  // Check visible text
  const visibleText = await page.locator('body').innerText();
  console.log('\n=== Visible Text ===');
  console.log(visibleText || '(empty)');
});
