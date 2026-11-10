import { test, expect } from '@playwright/test';

test.describe('Hackathon Demo Walkthrough & Offline Hash Chain Loop', () => {
  test.beforeEach(async ({ page }) => {
    // Open app at root
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('1. One-Click Load Demo Bazaar seeds 4 karigars, 6 orders, disputed settlement, and trust scores', async ({ page }) => {
    // Check main title
    await expect(page.locator('text=GoldStack')).toBeVisible();

    // Verify "Load Demo Bazaar" button is visible for Jeweller
    const loadDemoBtn = page.locator('#btn-load-demo-bazaar');
    await expect(loadDemoBtn).toBeVisible();

    // Click "Load Demo Bazaar"
    await loadDemoBtn.click();

    // Wait for success toast notification
    await expect(page.locator('text=Demo Bazaar Loaded Successfully!')).toBeVisible({ timeout: 15000 });

    // 1. Verify 4 karigars in the Karigar selector dropdown
    const karigarSelect = page.locator('select').first();
    await expect(karigarSelect).toBeVisible();
    const selectText = await karigarSelect.innerText();
    expect(selectText).toContain('Ramesh Soni');
    expect(selectText).toContain('Priya Goldsmith');
    expect(selectText).toContain('Manoj Filigree');
    expect(selectText).toContain('Deepa Verma');

    // 2. Verify Occasion Orders tab shows 6 orders with AT_RISK wedding order due in 3 days
    const ordersTabBtn = page.locator('button:has-text("Occasion Orders")');
    await ordersTabBtn.click();
    await page.waitForTimeout(500);

    // Verify AT_RISK wedding order
    await expect(page.locator('text=ORD-2026-VIVAH-01')).toBeVisible();
    await expect(page.locator('text=AT_RISK')).toBeVisible();

    // 3. Verify Settlements tab shows disputed settlement
    const settlementsTabBtn = page.locator('button:has-text("Settlements")');
    await settlementsTabBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=SETTLE-2026-DISP-01')).toBeVisible();
    await expect(page.locator('text=DISPUTED')).toBeVisible();

    // 4. Verify Dispute Center shows open dispute
    const disputeTabBtn = page.locator('button:has-text("Dispute Center")');
    await disputeTabBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=DISP-2026-89102')).toBeVisible();

    // 5. Verify Artisan Trust tab shows high trust score and cold-start score
    const trustTabBtn = page.locator('button:has-text("Artisan Trust")');
    await trustTabBtn.click();
    await page.waitForTimeout(500);

    await expect(page.locator('text=Ramesh Soni')).toBeVisible();
    await expect(page.locator('text=Deepa Verma')).toBeVisible();
    // Cold-start score for Deepa Verma (4.10)
    await expect(page.locator('text=4.10').first()).toBeVisible();
  });

  test('2. Demo walkthrough checklist interactive panel navigation, minimization, and dismissal', async ({ page }) => {
    // Verify walkthrough panel header
    await expect(page.locator('text=Demo Walkthrough')).toBeVisible();
    await expect(page.locator('text=प्रस्तुति मार्गदर्शिका')).toBeVisible();

    // Verify step actions
    // Step 3 action: "View Occasion Orders"
    const step3Action = page.locator('button:has-text("View Occasion Orders")');
    await expect(step3Action).toBeVisible();
    await step3Action.click();

    // Check that Occasion Orders tab became active
    await expect(page.locator('text=Occasion Orders (शुभ विवाह व ऑर्डर)')).toBeVisible();

    // Step 6 action: "Open Dispute Center"
    const step6Action = page.locator('button:has-text("Open Dispute Center")');
    await expect(step6Action).toBeVisible();
    await step6Action.click();

    // Check that Dispute Center tab became active
    await expect(page.locator('text=Dispute Center (विवाद निवारण)')).toBeVisible();

    // Test Minimize / Expand
    const minimizeBtn = page.locator('button[title="Minimize Checklist"]');
    await minimizeBtn.click();
    // In minimized state, title changes to "Expand Checklist"
    const expandBtn = page.locator('button[title="Expand Checklist"]');
    await expect(expandBtn).toBeVisible();
    await expandBtn.click();

    // Test Dismiss / Reopen
    const dismissBtn = page.locator('button[title="Dismiss Checklist"]');
    await dismissBtn.click();

    // Panel should now be dismissed and floating button should appear
    const demoGuideBtn = page.locator('button[title="Open Demo Walkthrough Checklist"]');
    await expect(demoGuideBtn).toBeVisible();
    await expect(page.locator('text=Demo Guide')).toBeVisible();

    // Click floating button to restore
    await demoGuideBtn.click();
    await expect(page.locator('text=Demo Walkthrough')).toBeVisible();
  });

  test('3. Offline mode simulation, offline gold issuance, queue increment, reconnection, and chain integrity', async ({ page }) => {
    // 1. Activate simulated offline mode
    const offlineToggleBtn = page.locator('#btn-toggle-offline-sim');
    await expect(offlineToggleBtn).toBeVisible();
    await offlineToggleBtn.click();

    // Verify offline mode indicator
    await expect(page.locator('text=Sim Offline')).toBeVisible();
    await expect(page.locator('button:has-text("Offline Mode")')).toBeVisible();

    // 2. Navigate to "+ Issue Gold" tab
    const issueTabBtn = page.locator('button:has-text("+ Issue Gold")');
    await issueTabBtn.click();
    await page.waitForTimeout(300);

    // 3. Fill in issuance weight
    const weightInput = page.locator('input[type="number"]').first();
    await weightInput.fill('12.50');

    // 4. Draw digital signature on canvas
    const canvas = page.locator('canvas').first();
    await expect(canvas).toBeVisible();
    const box = await canvas.boundingBox();
    if (box) {
      await page.mouse.move(box.x + 20, box.y + 20);
      await page.mouse.down();
      await page.mouse.move(box.x + 60, box.y + 50);
      await page.mouse.move(box.x + 100, box.y + 30);
      await page.mouse.up();
    }

    // 5. Submit gold issuance
    const submitBtn = page.locator('button:has-text("Confirm & Issue Gold")');
    await submitBtn.click();

    // Verify queued offline toast
    await expect(page.locator('text=Transaction Queued Offline')).toBeVisible({ timeout: 10000 });

    // Verify queue badge indicates at least 1 queued transaction
    await expect(page.locator('button:has-text("Offline Mode (1)")')).toBeVisible({ timeout: 5000 });

    // 6. Reconnect to online mode
    await offlineToggleBtn.click();
    await expect(page.locator('text=Simulate Offline')).toBeVisible();

    // 7. Click sync button to commit offline transactions
    const syncBadgeBtn = page.locator('button:has-text("Offline Queued (Sync)")');
    if (await syncBadgeBtn.isVisible()) {
      await syncBadgeBtn.click();
      await expect(page.locator('text=Offline Sync Complete')).toBeVisible({ timeout: 10000 });
    }

    // 8. Navigate back to Passbook Ledger
    const ledgerTabBtn = page.locator('button:has-text("Passbook Ledger")');
    await ledgerTabBtn.click();
    await page.waitForTimeout(300);

    // 9. Click "Verify Chain" and confirm 100% INTACT
    const verifyChainBtn = page.locator('button:has-text("Verify Chain")');
    await verifyChainBtn.click();

    await expect(page.locator('text=100% INTACT')).toBeVisible({ timeout: 10000 });
  });
});

