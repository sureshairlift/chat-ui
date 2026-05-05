import { bootstrapApplication } from "@angular/platform-browser";
import { provideHttpClient, withFetch } from "@angular/common/http";
import { provideRouter, withComponentInputBinding } from "@angular/router";
import { provideMarkdown } from "ngx-markdown";
import { AppComponent } from "./app/app.component";
import { routes } from "./app/app.routes";

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes, withComponentInputBinding()),
    // ApiClientService injects HttpClient. provideHttpClient registers it
    // for the standalone bootstrap. withFetch() switches the underlying
    // transport from XHR to the Fetch API — matches the SSE client's
    // transport, plays better with HTTP/2 multiplexing, and avoids a
    // bundle-size hit from the legacy XHR backend.
    provideHttpClient(withFetch()),
    // ngx-markdown — used by BlockRendererComponent to render text and
    // markdown blocks from the AI block protocol. Default config (no
    // syntax highlighting / KaTeX) keeps the bundle minimal; opt in to
    // those by passing `loader: ...` here when needed.
    provideMarkdown(),
  ],
}).catch((err) => console.error(err));
