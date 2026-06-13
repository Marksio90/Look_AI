import { z } from 'zod';

export interface ComputerAction {
  action: 'click' | 'type' | 'navigate' | 'screenshot' | 'scroll' | 'keypress';
  target?: string;
  text?: string;
  url?: string;
}

export interface ComputerObservation {
  screenshot?: string; // base64
  text?: string;
  url?: string;
  error?: string;
}

export class ComputerUse {
  private browser?: import('playwright').Browser;
  private page?: import('playwright').Page;

  async start(): Promise<void> {
    try {
      const { chromium } = await import('playwright');
      this.browser = await chromium.launch({ headless: true });
      this.page = await this.browser.newPage();
    } catch (err) {
      throw new Error(`Playwright not available: ${(err as Error).message}. Install with: npm install -g playwright && npx playwright install chromium`);
    }
  }

  async execute(action: ComputerAction): Promise<ComputerObservation> {
    if (!this.page) {
      return { error: 'Browser not started. Call start() first.' };
    }

    try {
      switch (action.action) {
        case 'navigate':
          await this.page.goto(action.url ?? 'about:blank');
          return { url: this.page.url() };
        case 'click':
          if (action.target) await this.page.click(action.target);
          return { url: this.page.url() };
        case 'type':
          if (action.target && action.text) {
            await this.page.fill(action.target, action.text);
          }
          return {};
        case 'keypress':
          if (action.text) await this.page.keyboard.press(action.text as import('playwright').KeyboardPressOptions);
          return {};
        case 'scroll':
          await this.page.evaluate(() => window.scrollBy(0, 300));
          return {};
        case 'screenshot':
          const screenshot = await this.page.screenshot({ encoding: 'base64' });
          return { screenshot: screenshot as string, url: this.page.url() };
        default:
          return { error: `Unknown action: ${action.action}` };
      }
    } catch (err) {
      return { error: (err as Error).message };
    }
  }

  async stop(): Promise<void> {
    await this.browser?.close();
    this.browser = undefined;
    this.page = undefined;
  }
}

export const ComputerActionSchema = z.object({
  action: z.enum(['click', 'type', 'navigate', 'screenshot', 'scroll', 'keypress']),
  target: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
});
