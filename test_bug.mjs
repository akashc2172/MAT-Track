const { chromium } = require('playwright');
(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('CONSOLE:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    await page.goto('http://localhost:5173');
    console.log("Navigated to page");
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Initialize Data Engine")');
    console.log("Clicked Initialize");
    await page.waitForTimeout(1000);
    await page.click('button:has-text("Proceed to Dashboard")');
    console.log("Clicked Proceed");
    await page.waitForTimeout(2000);

    const bodyText = await page.locator('body').innerText();
    console.log("Current Body Text:", bodyText.substring(0, 50));
    await browser.close();
})();
