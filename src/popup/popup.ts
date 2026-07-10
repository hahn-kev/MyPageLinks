interface Bookmark {
  url: string;
  title: string;
  createdAt: number;
}

function isBookmarklet(url: string): boolean {
  return url.trimStart().toLowerCase().startsWith("javascript:");
}

function executeBookmarklet(tabId: number, code: string): void {
  // Strip the "javascript:" prefix to get the code to execute
  const js = code.replace(/^\s*javascript:\s*/i, "");
  browser.tabs.executeScript(tabId, { code: decodeURIComponent(js) });
}

interface SiteBookmarks {
  [hostname: string]: Bookmark[];
}

const STORAGE_KEY = "siteBookmarks";

async function getBookmarksForSite(hostname: string): Promise<Bookmark[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const all = (result[STORAGE_KEY] as SiteBookmarks) ?? {};
  return all[hostname] ?? [];
}

async function saveBookmarksForSite(hostname: string, bookmarks: Bookmark[]): Promise<void> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const all = (result[STORAGE_KEY] as SiteBookmarks) ?? {};
  all[hostname] = bookmarks;
  await browser.storage.local.set({ [STORAGE_KEY]: all });
}

function renderBookmarks(
  bookmarks: Bookmark[],
  list: HTMLUListElement,
  hostname: string,
): void {
  list.innerHTML = "";

  if (bookmarks.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No bookmarks for this site.";
    empty.style.color = "#999";
    empty.style.textAlign = "center";
    empty.style.cursor = "default";
    list.appendChild(empty);
    return;
  }

  for (const bookmark of bookmarks) {
    const li = document.createElement("li");

    const text = document.createElement("span");
    text.className = "bookmark-text";
    text.textContent = bookmark.title || bookmark.url;
    text.title = bookmark.url;

    const bookmarkIsBookmarklet = isBookmarklet(bookmark.url);

    if (bookmarkIsBookmarklet) {
      li.classList.add("bookmarklet");
    }

    li.addEventListener("click", async () => {
      if (bookmarkIsBookmarklet) {
        const tabs = await browser.tabs.query({ active: true, currentWindow: true });
        if (tabs[0]?.id != null) {
          executeBookmarklet(tabs[0].id, bookmark.url);
        }
        window.close();
      } else {
        browser.tabs.update({ url: bookmark.url });
      }
    });

    if (!bookmarkIsBookmarklet) {
      li.addEventListener("auxclick", (event) => {
        if (event.button === 1) {
          browser.tabs.create({ url: bookmark.url });
        }
      });
    }

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove bookmark";
    removeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const updated = (await getBookmarksForSite(hostname)).filter(
        (b) => b.url !== bookmark.url,
      );
      await saveBookmarksForSite(hostname, updated);
      renderBookmarks(updated, list, hostname);
    });

    li.appendChild(text);
    li.appendChild(removeBtn);
    list.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const header = document.getElementById("site-header") as HTMLHeadingElement;
  const form = document.getElementById("add-form") as HTMLFormElement;
  const inputUrl = document.getElementById("input-url") as HTMLInputElement;
  const inputTitle = document.getElementById("input-title") as HTMLInputElement;
  const bookmarksList = document.getElementById("bookmarks-list") as HTMLUListElement;

  const tabs = await browser.tabs.query({ active: true, currentWindow: true });
  const tab = tabs[0];
  if (!tab?.url) return;

  const hostname = new URL(tab.url).hostname;
  header.textContent = hostname;

  const bookmarks = await getBookmarksForSite(hostname);
  renderBookmarks(bookmarks, bookmarksList, hostname);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = inputUrl.value.trim();
    if (!url) return;

    const bookmarks = await getBookmarksForSite(hostname);
    if (bookmarks.some((b) => b.url === url)) return;

    const newBookmark: Bookmark = {
      url,
      title: inputTitle.value.trim(),
      createdAt: Date.now(),
    };

    const updated = [newBookmark, ...bookmarks];
    await saveBookmarksForSite(hostname, updated);
    renderBookmarks(updated, bookmarksList, hostname);

    inputUrl.value = "";
    inputTitle.value = "";
  });
});
