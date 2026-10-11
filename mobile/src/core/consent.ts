export type ConsentState = { value: string | null; waiting: boolean };

export class ConsentService {
  private state: ConsentState = { value: null, waiting: true };
  private listeners = new Set<() => void>();
  private request = 0;
  private controller?: AbortController;
  constructor(
    private endpoint: string,
    private onChoice: () => void,
    private fetcher: typeof fetch = fetch,
    private waitMs = 5000,
  ) {}
  snapshot = () => this.state;
  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  };
  private update(next: ConsentState) {
    this.state = next;
    this.listeners.forEach((fn) => fn());
  }
  async refresh() {
    const request = ++this.request;
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.update({ ...this.state, waiting: true });
    const timer = setTimeout(() => {
      if (request === this.request)
        this.update({ ...this.state, waiting: false });
    }, this.waitMs);
    // The five-second gate releases the page, NOT the request: late consent still counts.
    try {
      const response = await this.fetcher(`${this.endpoint}/consent`, {
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Consent unavailable");
      const body = await response.json();
      if (request !== this.request) return;
      if (body.consent !== null && typeof body.consent !== "string")
        throw new Error("Invalid consent");
      if (typeof body.consent === "string") this.onChoice();
      this.update({ value: body.consent, waiting: false });
    } catch {
      if (request === this.request)
        this.update({ ...this.state, waiting: false });
    } finally {
      clearTimeout(timer);
    }
  }
  dispose() {
    this.request++;
    this.controller?.abort();
  }
}
