import {
  getTracker,
  getWebViewCallback,
  newTracker,
  type Tracker,
  type TrackerConfig,
  type WebViewMessage,
} from "../vendor/tracker";

type Pending =
  | { type: "web"; message: WebViewMessage }
  | { type: "screen"; name: "front" | "article"; id?: string }
  | { type: "read"; id: string };

export class TrackingService {
  private tracker?: Tracker;
  private pending: Pending[] = [];
  private webCallback = getWebViewCallback();
  constructor(private config: TrackerConfig) {}
  allow = () => {
    if (this.tracker) return;
    this.tracker = getTracker(this.config.namespace) ?? newTracker(this.config);
    const pending = this.pending;
    this.pending = [];
    pending.forEach((event) => this.deliver(event));
  };
  web(raw: string) {
    this.deliver({ type: "web", message: { nativeEvent: { data: raw } } });
  }
  screen(name: "front" | "article", id?: string) {
    this.deliver({ type: "screen", name, id });
  }
  read(id: string) {
    this.deliver({ type: "read", id });
  }
  private deliver(event: Pending) {
    if (!this.tracker) {
      this.pending.push(event);
      return;
    }
    if (event.type === "web") this.webCallback(event.message);
    if (event.type === "screen")
      this.tracker.trackScreenViewEvent({
        name: event.name,
        ...(event.id ? { id: event.id } : {}),
      });
    if (event.type === "read")
      this.tracker.trackSelfDescribingEvent({
        schema: "iglu:com.example.news/article_read/jsonschema/1-0-0",
        data: { articleId: event.id },
      });
  }
}
