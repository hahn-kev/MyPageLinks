interface BgBookmark {
  id: string;
  url: string;
  title: string;
  createdAt: number;
}

interface BgSiteBookmarks {
  [hostname: string]: BgBookmark[];
}

const BG_STORAGE_KEY = "siteBookmarks";

function bgIsBookmarklet(url: string): boolean {
  return url.trimStart().toLowerCase().startsWith("javascript:");
}

async function bgFindBookmarkById(id: string): Promise<BgBookmark | undefined> {
  const result = await browser.storage.local.get(BG_STORAGE_KEY);
  const all = (result[BG_STORAGE_KEY] as BgSiteBookmarks) ?? {};
  for (const bookmarks of Object.values(all)) {
    const match = bookmarks.find((b) => b.id === id);
    if (match) return match;
  }
  return undefined;
}

function bgDecodeBookmarkletCode(js: string): string {
  // Bookmarklets aren't required to be percent-encoded, so treat decoding as
  // best-effort: fall back to the raw code if it contains a literal "%" that
  // isn't part of a valid escape sequence.
  try {
    return decodeURIComponent(js);
  } catch {
    return js;
  }
}

function bgExecuteBookmarklet(tabId: number, code: string): void {
  const js = code.replace(/^\s*javascript:\s*/i, "");
  browser.tabs.executeScript(tabId, { code: bgDecodeBookmarkletCode(js) });
}

browser.runtime.onInstalled.addListener(() => {
  console.log("MyPageLinks extension installed.");
});

browser.runtime.onMessage.addListener(
  (message: { type: string; url?: string; id?: string }, sender) => {
    if (message.type === "openTab" && message.url) {
      browser.tabs.create({ url: message.url });
      return;
    }

    if (message.type === "activateBookmark" && message.id) {
      const tabId = sender.tab?.id;
      if (tabId == null) return;

      void bgFindBookmarkById(message.id).then((bookmark) => {
        if (!bookmark) return;

        if (bgIsBookmarklet(bookmark.url)) {
          bgExecuteBookmarklet(tabId, bookmark.url);
        } else {
          browser.tabs.update(tabId, { url: bookmark.url });
        }
      });
    }
  },
);
