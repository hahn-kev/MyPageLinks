interface Bookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

function isBookmarklet(url: string): boolean {
  return url.trimStart().toLowerCase().startsWith("javascript:");
}

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function decodeBookmarkletCode(js: string): string {
  // Bookmarklets aren't required to be percent-encoded, so treat decoding as
  // best-effort: fall back to the raw code if it contains a literal "%" that
  // isn't part of a valid escape sequence.
  try {
    return decodeURIComponent(js);
  } catch {
    return js;
  }
}

function executeBookmarklet(tabId: number, code: string): void {
  // Strip the "javascript:" prefix to get the code to execute
  const js = code.replace(/^\s*javascript:\s*/i, "");
  browser.tabs.executeScript(tabId, { code: decodeBookmarkletCode(js) });
}

interface SiteBookmarks {
  [hostname: string]: Bookmark[];
}

const STORAGE_KEY = "siteBookmarks";

async function getBookmarksForSite(hostname: string): Promise<Bookmark[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const all = (result[STORAGE_KEY] as SiteBookmarks) ?? {};
  const bookmarks = all[hostname] ?? [];

  // Migrate any bookmarks saved before ids were introduced
  let migrated = false;
  for (const bookmark of bookmarks) {
    if (!bookmark.id) {
      bookmark.id = generateId();
      migrated = true;
    }
  }
  if (migrated) {
    all[hostname] = bookmarks;
    await browser.storage.local.set({ [STORAGE_KEY]: all });
  }

  return bookmarks;
}

async function saveBookmarksForSite(hostname: string, bookmarks: Bookmark[]): Promise<void> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  const all = (result[STORAGE_KEY] as SiteBookmarks) ?? {};
  all[hostname] = bookmarks;
  await browser.storage.local.set({ [STORAGE_KEY]: all });
}

// Native HTML5 drag-and-drop is unreliable inside a browser_action popup: the
// OS-level drag session it triggers can steal focus and close the popup
// mid-drag before the drop handler runs. Track the drag with plain mouse
// events instead, the same approach the on-page FAB uses.
let draggingLi: HTMLLIElement | null = null;

// The click that follows a drag's mousedown/mouseup fires on whatever element
// ends up under the cursor, which may be a different bookmark's row rather
// than the drag handle — so suppress it globally instead of on the handle.
let suppressNextClick = false;

document.addEventListener(
  "click",
  (event) => {
    if (suppressNextClick) {
      suppressNextClick = false;
      event.stopPropagation();
      event.preventDefault();
    }
  },
  true,
);

function startDragReorder(li: HTMLLIElement, list: HTMLUListElement, hostname: string): void {
  suppressNextClick = true;
  draggingLi = li;
  li.classList.add("dragging");

  function onMouseMove(event: MouseEvent): void {
    if (!draggingLi) return;
    const target = document.elementFromPoint(event.clientX, event.clientY);
    const targetLi = target?.closest("li");
    if (!targetLi || targetLi === draggingLi || targetLi.parentElement !== list) return;

    const rect = targetLi.getBoundingClientRect();
    const before = event.clientY < rect.top + rect.height / 2;
    list.insertBefore(draggingLi, before ? targetLi : targetLi.nextSibling);
  }

  async function onMouseUp(): Promise<void> {
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
    if (!draggingLi) return;

    draggingLi.classList.remove("dragging");
    draggingLi = null;

    const orderedIds = Array.from(list.querySelectorAll<HTMLLIElement>("li[data-id]")).map(
      (el) => el.dataset.id as string,
    );
    const current = await getBookmarksForSite(hostname);
    const byId = new Map(current.map((b) => [b.id, b]));
    const reordered = orderedIds
      .map((id) => byId.get(id))
      .filter((b): b is Bookmark => Boolean(b));
    await saveBookmarksForSite(hostname, reordered);
  }

  document.addEventListener("mousemove", onMouseMove);
  document.addEventListener("mouseup", onMouseUp);
}

function renderEditForm(
  li: HTMLLIElement,
  bookmark: Bookmark,
  list: HTMLUListElement,
  hostname: string,
): void {
  li.innerHTML = "";
  li.classList.add("editing");

  const form = document.createElement("form");
  form.className = "edit-form";

  const urlInput = document.createElement("input");
  urlInput.type = "text";
  urlInput.value = bookmark.url;
  urlInput.required = true;
  urlInput.placeholder = "URL";

  const titleInput = document.createElement("input");
  titleInput.type = "text";
  titleInput.value = bookmark.title;
  titleInput.placeholder = "Title (optional)";

  const actions = document.createElement("div");
  actions.className = "edit-actions";

  const saveBtn = document.createElement("button");
  saveBtn.type = "submit";
  saveBtn.className = "btn btn-primary btn-small";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.className = "btn btn-secondary btn-small";
  cancelBtn.textContent = "Cancel";

  actions.appendChild(saveBtn);
  actions.appendChild(cancelBtn);

  form.appendChild(urlInput);
  form.appendChild(titleInput);
  form.appendChild(actions);
  li.appendChild(form);

  cancelBtn.addEventListener("click", async (event) => {
    event.stopPropagation();
    const bookmarks = await getBookmarksForSite(hostname);
    renderBookmarks(bookmarks, list, hostname);
  });

  form.addEventListener("click", (event) => event.stopPropagation());

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const url = urlInput.value.trim();
    if (!url) return;

    const bookmarks = await getBookmarksForSite(hostname);
    const updated = bookmarks.map((b) =>
      b.id === bookmark.id ? { ...b, url, title: titleInput.value.trim() } : b,
    );
    await saveBookmarksForSite(hostname, updated);
    renderBookmarks(updated, list, hostname);
  });

  urlInput.focus();
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
    li.dataset.id = bookmark.id;

    const dragHandle = document.createElement("span");
    dragHandle.className = "drag-handle";
    dragHandle.textContent = "⠿";
    dragHandle.title = "Drag to reorder";

    const text = document.createElement("span");
    text.className = "bookmark-text";
    text.textContent = bookmark.title || bookmark.url;
    text.title = bookmark.url;

    const bookmarkIsBookmarklet = isBookmarklet(bookmark.url);

    let jsBadge: HTMLSpanElement | null = null;
    if (bookmarkIsBookmarklet) {
      li.classList.add("bookmarklet");
      jsBadge = document.createElement("span");
      jsBadge.className = "js-badge";
      jsBadge.textContent = "JS";
    }

    dragHandle.addEventListener("mousedown", (event) => {
      if (event.button !== 0) return;
      event.preventDefault();
      startDragReorder(li, list, hostname);
    });

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

    const editBtn = document.createElement("button");
    editBtn.className = "btn-edit";
    editBtn.textContent = "✎";
    editBtn.title = "Edit bookmark";
    editBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      renderEditForm(li, bookmark, list, hostname);
    });

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove bookmark";
    removeBtn.addEventListener("click", async (event) => {
      event.stopPropagation();
      const updated = (await getBookmarksForSite(hostname)).filter(
        (b) => b.id !== bookmark.id,
      );
      await saveBookmarksForSite(hostname, updated);
      renderBookmarks(updated, list, hostname);
    });

    li.appendChild(dragHandle);
    if (jsBadge) li.appendChild(jsBadge);
    li.appendChild(text);
    li.appendChild(editBtn);
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
      id: generateId(),
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
