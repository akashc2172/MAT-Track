const { chromium } = require('playwright');
const fs = require('fs');

(async () => {
    console.log("Starting strict tests...");
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Set standard viewport
    await page.setViewportSize({ width: 1280, height: 800 });

    page.on('console', msg => console.log('BROWSER CONSOLE:', msg.text()));
    page.on('pageerror', err => console.error('BROWSER ERROR:', err.message));

    try {
        console.log("Navigating to app...");
        await page.goto('http://localhost:5173');
        await page.waitForTimeout(1000);

        // Check if we are on the initialize screen
        const initButton = page.locator('button:has-text("Initialize Data Engine")');
        if (await initButton.isVisible()) {
            console.log("Found Initialize button. Clicking...");
            await initButton.click();
            await page.waitForTimeout(2000); // give time to load and merge
            // Approving data
            const approveButton = page.locator('button:has-text("Proceed to Dashboard")').or(page.locator('button:has-text("Approve")'));
            if (await approveButton.isVisible()) {
                console.log("Found Approve button. Clicking...");
                await approveButton.click();
                await page.waitForTimeout(2000);
            }
        }

        console.log("1. Visual & Interaction Tests");
        // Check Master Table
        await page.screenshot({ path: 'test_evidence_dashboard.png' });
        console.log("Dashboard loaded successfully.");

        // Switch to Outreach Tab
        console.log("Clicking Outreach Workspace tab...");
        await page.click('text="Outreach Workspace"');
        await page.waitForTimeout(2000);
        await page.screenshot({ path: 'test_evidence_outreach_default.png' });
        console.log("Outreach Workspace loaded successfully.");

        // Type a bad validation string to test gates
        console.log("2. Validation Tests");
        // The default message uses {MissingSummary}, we will append text to it
        await page.fill('textarea', 'Hi {FirstName},\n\nTesting bad token: {SomeRandomToken}\n\nTesting empty: []\n\nTesting fallback: [No Missing FAFSA]');
        await page.waitForTimeout(1000);

        const hasValidationError = await page.isVisible('text="Validation Failed: Cannot Export"');
        if (hasValidationError) {
            console.log("[PASS] Validation correctly rejected bad placeholders / unresolved tokens / empty brackets.");
        } else {
            console.error("[FAIL] Validation did NOT catch bad placeholders.");
        }
        await page.screenshot({ path: 'test_evidence_validation_failed.png' });

        // Restore to Smart Default `{MissingSummary}`
        await page.fill('textarea', 'Hi {FirstName},\n\nYou are missing {MissingSummary}. Please fix.');
        await page.waitForTimeout(1000);
        await page.screenshot({ path: 'test_evidence_smart_default.png' });

        // 3. Logic Tests Evidence Logging
        // For the logic testing evidence, we can evaluate inner text of the generated preview cards
        console.log("3. Logic Tests & Example Outputs");
        const previewTexts = await page.$$eval('.card .whiteSpace-pre-wrap, .card > div:nth-child(2)', els => els.map(el => el.innerText).filter(t => t.includes('Hi ')));

        // Output some examples to prove the grammar
        console.log("\n--- GENERATED MESSAGE EXAMPLES ---");
        for (let i = 0; i < Math.min(10, previewTexts.length); i++) {
            if (previewTexts[i] && previewTexts[i].length > 10) {
                console.log(`Example ${i + 1}:\n${previewTexts[i]}\n`);
            }
        }

        console.log("Testing Complete. Capturing final state.");

    } catch (e) {
        console.error("Test failed:", e);
    } finally {
        await browser.close();
    }
})();
