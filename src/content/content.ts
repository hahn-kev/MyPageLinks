interface ContentBookmark {
  url: string;
  title: string;
  createdAt: number;
}

interface ContentSiteBookmarks {
  [hostname: string]: ContentBookmark[];
}

const MPL_STORAGE_KEY = "siteBookmarks";

function mplIsBookmarklet(url: string): boolean {
  return url.trimStart().toLowerCase().startsWith("javascript:");
}

function createFloatingUI(): void {
  // Prevent double-injection
  if (document.getElementById("mpl-fab")) return;

  const hostname = window.location.hostname;

  // Shadow host for style isolation
  const host = document.createElement("div");
  host.id = "mpl-fab";
  host.style.cssText = "all:initial;position:fixed;bottom:24px;left:24px;z-index:2147483647;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;";
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    * { margin:0; padding:0; box-sizing:border-box; }

    .fab {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: #0060df;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 14px rgba(0,96,223,0.4);
      transition: transform 0.2s ease, box-shadow 0.2s ease;
      position: relative;
      z-index: 2;
    }
    .fab:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(0,96,223,0.5);
    }
    .fab:active { transform: scale(0.95); }
    .fab svg {
      width: 22px;
      height: 22px;
      fill: none;
      stroke: #fff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }

    .panel {
      position: absolute;
      bottom: 56px;
      left: 0;
      width: 260px;
      max-height: 340px;
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 8px 30px rgba(0,0,0,0.18);
      overflow: hidden;
      transform-origin: bottom left;
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
    toggle();
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
