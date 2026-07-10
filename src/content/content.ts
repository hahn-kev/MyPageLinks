interface ContentBookmark {
  url: string;
  title: string;
  createdAt: number;
}

interface ContentSiteBookmarks {
  [hostname: string]: ContentBookmark[];
}

interface FabPositions {
  [hostname: string]: { bottom: number; left: number };
}

const MPL_STORAGE_KEY = "siteBookmarks";
const MPL_POSITION_KEY = "fabPositions";

function mplIsBookmarklet(url: string): boolean {
  return url.trimStart().toLowerCase().startsWith("javascript:");
}

async function createFloatingUI(): Promise<void> {
  // Prevent double-injection
  if (document.getElementById("mpl-fab")) return;

  const hostname = window.location.hostname;

  // Only show FAB if there are bookmarks for this site
  const initialResult = await browser.storage.local.get(MPL_STORAGE_KEY);
  const initialAll = (initialResult[MPL_STORAGE_KEY] as ContentSiteBookmarks) ?? {};
  const initialBookmarks = initialAll[hostname] ?? [];
  if (initialBookmarks.length === 0) return;

  // Load saved position
  const posResult = await browser.storage.local.get(MPL_POSITION_KEY);
  const positions = (posResult[MPL_POSITION_KEY] as FabPositions) ?? {};
  const savedPos = positions[hostname] ?? { bottom: 24, left: 24 };

  // Shadow host for style isolation
  const host = document.createElement("div");
  host.id = "mpl-fab";
  host.style.cssText = `all:initial;position:fixed;bottom:${savedPos.bottom}px;left:${savedPos.left}px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;`;
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { margin:0; padding:0; box-sizing:border-box; }

    .fab {
      anchor-name: --mpl-fab;
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #0060df;
      border: none;
      cursor: grab;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,96,223,0.4);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      z-index: 2;
      user-select: none;
    }
    .fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0,96,223,0.5);
    }
    .fab:active { transform: scale(0.95); cursor: grabbing; }
    .fab.dragging { cursor: grabbing; transition: none; transform: none; }
    .fab svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: #fff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      pointer-events: none;
    }

    .panel {
      position: fixed;
      position-anchor: --mpl-fab;
      width: 260px;
      max-height: 340px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.18);
      overflow: hidden;

      /* Position the panel relative to the FAB anchor */
      position-area: top span-right;
      margin: 8px;

      /* Automatically flip to prevent overflow/viewport collisions */
      position-try-fallbacks: flip-block, flip-inline, flip-block flip-inline;

      /* Keep within viewport */
      position-visibility: anchors-visible;

      transform-origin: center;
      transform: scale(0.3);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.25s cubic-bezier(0.34,1.56,0.64,1), opacity 0.2s ease;
    }

    .panel.open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }

    .panel-header {
      padding: 12px 14px 8px;
      font-size: 12px;
      font-weight: 600;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      border-bottom: 1px solid #eee;
    }

    .panel-list {
      list-style: none;
      overflow-y: auto;
      max-height: 280px;
      padding: 6px 0;
    }

    .panel-list li {
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      color: #1a1a2e;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: background 0.15s;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .panel-list li:hover {
      background: #f0f4ff;
    }
    .panel-list li .link-text {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      color: #0060df;
    }
    .panel-list li.bookmarklet .link-text {
      color: #b5007f;
    }
    .panel-list li.bookmarklet .js-badge {
      font-size: 9px;
      font-weight: 700;
      color: #fff;
      background: #b5007f;
      border-radius: 3px;
      padding: 1px 4px;
      flex-shrink: 0;
    }

    .empty-msg {
      padding: 20px 14px;
      text-align: center;
      color: #999;
      font-size: 13px;
    }
  `;
  shadow.appendChild(style);

  // Container
  const container = document.createElement("div");
  shadow.appendChild(container);

  // Panel
  const panel = document.createElement("div");
  panel.className = "panel";

  const panelHeader = document.createElement("div");
  panelHeader.className = "panel-header";
  panelHeader.textContent = hostname;
  panel.appendChild(panelHeader);

  const panelList = document.createElement("ul");
  panelList.className = "panel-list";
  panel.appendChild(panelList);

  container.appendChild(panel);

  // FAB button
  const fab = document.createElement("button");
  fab.className = "fab";
  fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`;
  fab.title = "MyPageLinks";
  container.appendChild(fab);

  let isOpen = false;

  function toggle(): void {
    isOpen = !isOpen;
    panel.classList.toggle("open", isOpen);
    if (isOpen) loadBookmarks();
  }

  function collapse(): void {
    isOpen = false;
    panel.classList.remove("open");
  }

  // Drag logic
  let isDragging = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartLeft = 0;
  let dragStartBottom = 0;
  let didDrag = false;
  const DRAG_THRESHOLD = 5;

  fab.addEventListener("mousedown", (e: MouseEvent) => {
    if (e.button !== 0) return;
    isDragging = true;
    didDrag = false;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    dragStartLeft = parseInt(host.style.left) || savedPos.left;
    dragStartBottom = parseInt(host.style.bottom) || savedPos.bottom;
    fab.classList.add("dragging");
    e.preventDefault();
  });

  document.addEventListener("mousemove", (e: MouseEvent) => {
    if (!isDragging) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    if (!didDrag && Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
    didDrag = true;

    const newLeft = Math.max(0, Math.min(window.innerWidth - 48, dragStartLeft + dx));
    const newBottom = Math.max(0, Math.min(window.innerHeight - 48, dragStartBottom - dy));
    host.style.left = `${newLeft}px`;
    host.style.bottom = `${newBottom}px`;
  });

  document.addEventListener("mouseup", async () => {
    if (!isDragging) return;
    isDragging = false;
    fab.classList.remove("dragging");

    if (didDrag) {
      const newLeft = parseInt(host.style.left) || 24;
      const newBottom = parseInt(host.style.bottom) || 24;
      const posRes = await browser.storage.local.get(MPL_POSITION_KEY);
      const allPos = (posRes[MPL_POSITION_KEY] as FabPositions) ?? {};
      allPos[hostname] = { bottom: newBottom, left: newLeft };
      await browser.storage.local.set({ [MPL_POSITION_KEY]: allPos });
    }
  });

  async function loadBookmarks(): Promise<void> {
    const result = await browser.storage.local.get(MPL_STORAGE_KEY);
    const all = (result[MPL_STORAGE_KEY] as ContentSiteBookmarks) ?? {};
    const bookmarks = all[hostname] ?? [];

    panelList.innerHTML = "";

    if (bookmarks.length === 0) {
      const msg = document.createElement("div");
      msg.className = "empty-msg";
      msg.textContent = "No bookmarks for this site.";
      panelList.appendChild(msg);
      return;
    }

    for (const bm of bookmarks) {
      const li = document.createElement("li");
      const bmIsBookmarklet = mplIsBookmarklet(bm.url);

      if (bmIsBookmarklet) {
        li.classList.add("bookmarklet");
        const badge = document.createElement("span");
        badge.className = "js-badge";
        badge.textContent = "JS";
        li.appendChild(badge);
      }

      const text = document.createElement("span");
      text.className = "link-text";
      text.textContent = bm.title || bm.url;
      text.title = bm.url;
      li.appendChild(text);

      li.addEventListener("click", () => {
        if (bmIsBookmarklet) {
          const js = bm.url.replace(/^\s*javascript:\s*/i, "");
          const script = document.createElement("script");
          script.textContent = decodeURIComponent(js);
          document.documentElement.appendChild(script);
          script.remove();
        } else {
          window.location.href = bm.url;
        }
        collapse();
      });

      if (!bmIsBookmarklet) {
        li.addEventListener("mousedown", (event) => {
          if (event.button === 1) {
            event.preventDefault();
          }
        });
        li.addEventListener("auxclick", (event) => {
          if (event.button === 1) {
            event.preventDefault();
            browser.runtime.sendMessage({ type: "openTab", url: bm.url });
            collapse();
          }
        });
      }

      panelList.appendChild(li);
    }
  }

  fab.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!didDrag) toggle();
  });

  // Close when clicking outside
  document.addEventListener("click", () => {
    if (isOpen) collapse();
  });

  // Prevent panel clicks from closing
  panel.addEventListener("click", (e) => e.stopPropagation());
}

// Run when DOM is ready
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", createFloatingUI);
} else {
  createFloatingUI();
}
