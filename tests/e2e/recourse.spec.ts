import { test, expect, type Page, type TestInfo } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.describe.serial('Recourse product lifecycle', () => {
  test('landing story is clear and responsive', async ({ page }, testInfo) => {
    for (const viewport of [
      { width: 1440, height: 900, name: 'desktop' },
      { width: 1024, height: 768, name: 'tablet' },
      { width: 390, height: 844, name: 'mobile' },
    ]) {
      await page.setViewportSize(viewport);
      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: /Find your next move/i }),
      ).toBeVisible();
      await expect(
        page.getByText(
          'No hardcoded categories. No external action without you.',
        ),
      ).toBeVisible();
      await page.screenshot({
        path: testInfo.outputPath(`landing-${viewport.name}.png`),
        fullPage: true,
      });
      await expect(page.locator('body')).not.toHaveCSS('overflow-x', 'scroll');
    }
  });

  test('new user completes a real case through response continuation', async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await signup(page, 'journey@example.test');
    await expect(
      page.getByRole('heading', { name: 'No cases yet.' }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('cases-empty-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('link', { name: /Bring your first case/i }).click();
    await page
      .getByLabel('The decision or situation')
      .fill(
        'Northfield Council refused my synthetic permit request because the date on my supporting evidence was unclear. I want reconsideration.',
      );
    await page
      .getByRole('button', { name: /Save and review my case/i })
      .click();
    await expect(
      page.getByRole('heading', { name: /understand the decision/i }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('case-new-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('tab', { name: 'Evidence' }).click();
    await page.getByLabel(/Choose a file/i).setInputFiles({
      name: 'dated-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic dated evidence from 20 July 2026.'),
    });
    await page.getByRole('button', { name: 'Add this file' }).click();
    await expect(page.getByText('dated-evidence.txt')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('evidence-stored-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Overview' }).click();
    await page.getByRole('button', { name: /Review my case/i }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('ai-consent-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: /I understand/i }).click();
    await expect(page.getByText(/Making sense of the case/i)).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('case-processing-desktop.png'),
      fullPage: true,
    });
    await expect(page.getByText('Your case is ready to use.')).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: testInfo.outputPath('case-ready-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('tab', { name: 'Process' }).click();
    await expect(
      page.getByRole('heading', {
        name: 'A written reconsideration request is available.',
      }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('research-found-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Ask Recourse' }).click();
    await page
      .getByLabel('Ask a case question')
      .fill(
        'The portal asks why the decision should be reconsidered. What should I write?',
      );
    await page.getByRole('button', { name: /^Ask/ }).click();
    await expect(
      page.getByText(/dated synthetic evidence addresses/i),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('ask-recourse-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('tab', { name: 'Drafts' }).click();
    await page.getByRole('button', { name: /Draft the email/i }).click();
    await expect(
      page.getByText('Request for reconsideration — SYN-1042'),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('email-draft-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'Formal letter' }).click();
    await page
      .getByRole('button', { name: /Draft the formal letter/i })
      .click();
    await expect(page.getByText('Letter preview')).toBeVisible();
    const pdfDownload = page.waitForEvent('download');
    await page.getByRole('button', { name: /Download PDF/i }).click();
    const downloadedLetter = await pdfDownload;
    expect(downloadedLetter.suggestedFilename()).toMatch(/letter\.pdf$/);
    await downloadedLetter.saveAs(testInfo.outputPath('formal-letter.pdf'));
    await page.screenshot({
      path: testInfo.outputPath('formal-letter-desktop.png'),
      fullPage: true,
    });

    await page.getByRole('button', { name: 'Email' }).click();
    await page.getByRole('button', { name: "I've submitted" }).click();
    await page.getByLabel('How did you submit?').selectOption('portal');
    await page.getByText('A Recourse draft, changed').click();
    await page
      .getByLabel('Paste what you actually submitted')
      .fill(
        'I asked for reconsideration and explained that the dated evidence addresses the reason in decision SYN-1042.',
      );
    await page.getByRole('button', { name: /Record my submission/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Waiting for a response' }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('waiting-response-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('button', { name: 'I received a response' }).click();
    await page
      .getByLabel('What did they say?')
      .fill('We reviewed the dated evidence but are maintaining the decision.');
    await page
      .getByRole('button', { name: /Save and review response/i })
      .click();
    await expect(page.getByText(/Comparing the response/i)).toBeVisible();
    await expect(page.getByText('Latest response reviewed')).toBeVisible({
      timeout: 20_000,
    });
    await page.screenshot({
      path: testInfo.outputPath('continued-case-desktop.png'),
      fullPage: true,
    });

    await page.reload();
    await expect(page.getByText('Latest response reviewed')).toBeVisible();
    await page.goBack();
    await page.goForward();
    await expect(
      page.getByRole('heading', {
        level: 1,
        name: /Northfield Council refused/i,
      }),
    ).toBeVisible();
    await assertA11y(page);
  });

  test('missing information, no verified process, quota pause, and prior submission stay truthful', async ({
    page,
  }, testInfo) => {
    await signup(page, 'states@example.test');
    await page.goto('/cases/new');
    await page
      .getByLabel('The decision or situation')
      .fill(
        'An unknown institution refused my synthetic request and gave no clear explanation for the decision.',
      );
    await page.getByRole('button', { name: /Save and review/i }).click();
    await expect(
      page.getByRole('heading', { name: /understand the decision/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Review my case/i }).click();
    const consent = page.getByRole('button', { name: /I understand/i });
    if (await consent.isVisible({ timeout: 3_000 }).catch(() => false))
      await consent.click();
    await expect(
      page.getByRole('heading', {
        name: 'Which institution made the decision?',
      }),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: testInfo.outputPath('missing-information-desktop.png'),
      fullPage: true,
    });
    await page
      .getByPlaceholder('Type what you know…')
      .fill('Northfield Council');
    await page.getByRole('button', { name: /Save and continue/i }).click();
    await expect(page.getByText(/Evidence that could help/i)).toBeVisible({
      timeout: 20_000,
    });

    await createFromCasebook(
      page,
      'Northfield Council refused my synthetic request, but there is a contradiction because two letters show different dates.',
    );
    await page.getByRole('button', { name: /Review my case/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Two details do not line up' }),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: testInfo.outputPath('contradiction-desktop.png'),
      fullPage: true,
    });

    await createFromCasebook(
      page,
      'No Process Office refused my synthetic request. There may be no published review route for this situation.',
    );
    await page.getByRole('button', { name: /Review my case/i }).click();
    await expect(page.getByText(/Evidence that could help/i)).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('tab', { name: 'Process' }).click();
    await expect(
      page.getByRole('heading', { name: /could not responsibly confirm/i }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('no-process-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await page.getByLabel(/Choose a file/i).setInputFiles({
      name: 'invalid.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from([0, 1, 2, 3]),
    });
    await page.getByRole('button', { name: 'Add this file' }).click();
    await expect(
      page
        .getByRole('alert')
        .filter({ hasText: 'Use a PDF, DOCX, TXT, PNG, JPEG, or WebP file.' }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('upload-error-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Ask Recourse' }).click();
    await page
      .getByLabel('Ask a case question')
      .fill('What is the unknown fact on the account?');
    await page.getByRole('button', { name: /^Ask/ }).click();
    await expect(
      page.getByText('The case does not contain that fact.'),
    ).toBeVisible();

    await createFromCasebook(
      page,
      'Northfield Council quota pause synthetic case should preserve progress when the provider is unavailable.',
    );
    await page.getByRole('button', { name: /Review my case/i }).click();
    await expect(
      page.getByRole('heading', {
        name: /reached the current AI usage limit/i,
      }),
    ).toBeVisible({ timeout: 20_000 });
    await page.screenshot({
      path: testInfo.outputPath('provider-quota-desktop.png'),
      fullPage: true,
    });

    await page.goto('/cases/new');
    await page
      .getByLabel('The decision or situation')
      .fill(
        'I submitted a synthetic request to Northfield Council before opening Recourse and have now received a decision.',
      );
    await page.getByText('I already submitted something').click();
    await page.getByRole('button', { name: /Save and review/i }).click();
    await page.getByRole('tab', { name: 'Drafts' }).click();
    await page
      .getByLabel('Paste what you actually submitted')
      .fill('This is the exact synthetic text submitted before Recourse.');
    await page.getByRole('button', { name: /Record my submission/i }).click();
    await expect(
      page.getByRole('heading', { name: 'Waiting for a response' }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('prior-submission-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Activity' }).click();
    await page.getByRole('button', { name: /Mark resolved/i }).click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(
      page.getByRole('heading', { name: /marked resolved/i }),
    ).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('resolved-desktop.png'),
      fullPage: true,
    });
    await page.getByRole('tab', { name: 'Activity' }).click();
    await page.getByRole('button', { name: 'Close case' }).click();
    await expect(page.getByText('Closed', { exact: true })).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath('closed-desktop.png'),
      fullPage: true,
    });
    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: /Delete permanently/i }).click();
    await expect(page).toHaveURL(/\/cases$/);
  });

  test('ready case remains usable at tablet and mobile widths with keyboard focus', async ({
    page,
  }, testInfo) => {
    await signup(page, 'responsive@example.test');
    await createFromCasebook(
      page,
      'Northfield Council refused my synthetic permit request because the date on the evidence was unclear.',
    );
    await page.getByRole('tab', { name: 'Evidence' }).click();
    await page.getByLabel(/Choose a file/i).setInputFiles({
      name: 'responsive-evidence.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Synthetic responsive evidence.'),
    });
    await page.getByRole('button', { name: 'Add this file' }).click();
    await page.getByRole('tab', { name: 'Overview' }).click();
    await expect(
      page.getByRole('heading', { name: /understand the decision/i }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Review my case/i }).click();
    const consent = page.getByRole('button', { name: /I understand/i });
    if (await consent.isVisible({ timeout: 3_000 }).catch(() => false))
      await consent.click();
    await expect(page.getByText('Your case is ready to use.')).toBeVisible({
      timeout: 20_000,
    });
    for (const viewport of [
      { width: 1024, height: 768, name: 'tablet' },
      { width: 390, height: 844, name: 'mobile' },
    ]) {
      await page.setViewportSize(viewport);
      await page.screenshot({
        path: testInfo.outputPath(`case-${viewport.name}.png`),
        fullPage: true,
      });
      const horizontalOverflow = await page.evaluate(
        () =>
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth,
      );
      expect(horizontalOverflow).toBe(false);
    }
    const overviewTab = page.getByRole('tab', { name: 'Overview' });
    await overviewTab.focus();
    await expect(overviewTab).toBeFocused();
    await page.keyboard.press('Enter');
  });
});

async function signup(page: Page, email: string) {
  await page.goto('/signup');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct horse battery staple');
  await page
    .getByRole('button', { name: /Create my private casebook/i })
    .click();
  await expect(page).toHaveURL(/\/cases$/);
}

async function createFromCasebook(page: Page, decision: string) {
  await page.goto('/cases/new');
  await page.getByLabel('The decision or situation').fill(decision);
  await page.getByRole('button', { name: /Save and review/i }).click();
  await expect(page).toHaveURL(/\/cases\/[a-f0-9]+$/);
}

async function assertA11y(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .analyze();
  expect(results.violations).toEqual([]);
}
