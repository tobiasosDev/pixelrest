import { BoardLoader } from "./board-loader";
import { emptySnapshot, loadSnapshot } from "../src/lib/grid-db";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

export default async function Page() {
  let snapshot = emptySnapshot();
  try {
    snapshot = await loadSnapshot();
  } catch {
    snapshot = emptySnapshot();
  }
  const payload = JSON.stringify(snapshot).replace(/</g, "\\u003c");
  return (
    <>
      <main className="stage">
        <p className="mark">Pixelrest</p>
        <div id="viewport">
          <div
            id="grid-surface"
            data-canvas-size="3200"
            style={{ width: 3200, height: 3200 }}
          >
            <canvas id="board" width={3200} height={3200} />
          </div>
        </div>
      </main>
      <aside id="hud" aria-label="Board activity">
        <dl className="hud-stats">
          <div>
            <dt>
              <span className="hud-dot" aria-hidden="true" />
              Live
            </dt>
            <dd id="hud-live">–</dd>
          </div>
          <div>
            <dt>Today</dt>
            <dd id="hud-today">–</dd>
          </div>
        </dl>
        <p className="hud-kicker">Holders</p>
        <button
          type="button"
          id="hud-toggle"
          aria-expanded="false"
          aria-controls="hud-holders"
        >
          Holders
        </button>
        <ol id="hud-holders" />
      </aside>
      <footer className="dock">
        <div className="tools" role="group" aria-label="Board mode">
          <button
            type="button"
            id="tool-claim"
            className="tool"
            aria-pressed="false"
          >
            Claim
          </button>
        </div>
        <div className="zoom-tools">
          <button type="button" id="zoom-out" aria-label="Zoom out">
            -
          </button>
          <output id="zoom" htmlFor="viewport">
            100%
          </output>
          <button type="button" id="zoom-in" aria-label="Zoom in">
            +
          </button>
          <button type="button" id="zoom-fit">
            Fit
          </button>
        </div>
        <span id="coord" hidden />
        <p id="status" className="dock-msg" hidden />
      </footer>
      <aside id="ticket" aria-hidden="true">
        <form id="claim-form" noValidate>
          <header className="ticket-head">
            <p className="ticket-kicker">Claim</p>
            <p id="quote-line">No squares selected</p>
            <button
              type="button"
              id="ticket-close"
              aria-label="Close claim form"
            >
              Close
            </button>
          </header>
          <label>
            Website URL
            <input
              id="url"
              name="url"
              type="url"
              inputMode="url"
              autoComplete="url"
              placeholder="https://your-app.com"
              required
            />
          </label>
          <p className="hint">No image upload. We load the logo from this page.</p>
          <label>
            Description
            <textarea
              id="description"
              name="description"
              rows={3}
              maxLength={280}
              placeholder="What should people read on hover or a long press?"
              required
            />
          </label>
          <p id="form-error" className="error" hidden />
          <button type="submit" id="claim-submit" disabled>
            Pay and claim
          </button>
        </form>
      </aside>
      <div id="tip" hidden>
        <p id="tip-text" />
        <a
          id="tip-open"
          hidden
          rel="noopener noreferrer"
          target="_blank"
        >
          Open link
        </a>
      </div>
      <a id="occupant-link" hidden rel="noopener" />
      <script
        dangerouslySetInnerHTML={{
          __html: `window.__PIXELREST_GRID__=${payload};`,
        }}
      />
      <BoardLoader />
    </>
  );
}
