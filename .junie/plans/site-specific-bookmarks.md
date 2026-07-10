---
sessionId: session-260710-120748-1fwp
---

# Requirements

### Overview & Goals
Transform MyPageLinks from a global link saver into a **site-specific bookmark manager**. When the user clicks the extension icon, they see bookmarks relevant to the current website's domain and can add new ones.

### User Stories
1. **Add a bookmark**: User is on `github.com`, clicks the extension, enters a URL (and optional title), and saves it. The bookmark is associated with `github.com`.
2. **Use a bookmark**: User is on `github.com`, clicks the extension, sees only `github.com` bookmarks. Left-click navigates in the current tab; middle-click opens in a new tab.
3. **Remove a bookmark**: User can delete a bookmark from the list.

### Functional Requirements
- The popup header shows the current site's domain.
- An input field lets the user type a URL (and optional title) to add a bookmark for the current domain.
- The bookmark list is filtered to the current tab's domain (hostname).
- Left-click on a bookmark navigates the current tab.
- Middle-click (auxclick, button===1) on a bookmark opens it in a new tab.
- Each bookmark has a remove button.
- Empty state shows a friendly message.

### Out of Scope
- Cross-browser support (Firefox only).
- Import/export, sync, or settings pages.
- Bookmark editing (only add/remove).

# Technical Design

### Current Implementation
- `src/popup/popup.ts` — saves the current page URL globally using `browser.storage.local` under key `savedLinks`.
- `src/popup/popup.html` — simple popup with a save button and list.
- `src/popup/popup.css` — basic styling.
- `src/manifest.json` — manifest v2 with `activeTab` and `storage` permissions.
- `src/background.ts` — empty/template background script.

### Key Decisions
- **Storage key structure**: Store bookmarks as a dictionary keyed by hostname: `{ [hostname: string]: Bookmark[] }` under a single storage key `siteBookmarks`. Simple and efficient for per-site lookups.
- **Domain extraction**: Use `new URL(tab.url).hostname` to derive the site key (e.g. `github.com`).
- **No background script needed**: All logic runs in the popup. The background script can remain minimal/empty.

### Data Model
```typescript
interface Bookmark {
  url: string;
  title: string;
  createdAt: number;
}

// Storage shape: { siteBookmarks: { [hostname: string]: Bookmark[] } }
```

### Proposed Changes

**`src/popup/popup.ts`** — Rewrite entirely:
- On load: query active tab, extract hostname, load bookmarks for that hostname.
- Render bookmark list with click (navigate current tab) and auxclick/middle-click (open new tab) handlers.
- Add form with URL input + optional title input + "Add" button.
- Remove button per bookmark.

**`src/popup/popup.html`** — Rewrite:
- Show current site domain in header.
- Add form with URL input, title input, and Add button.
- Bookmark list container.

**`src/popup/popup.css`** — Update styling for the new UI (inputs, form, bookmark items).

**`src/manifest.json`** — Add `tabs` permission (needed to query active tab URL in the popup).

**`src/background.ts`** — Keep minimal (no changes needed).

# Delivery Steps

###   Step 1: Set up storage layer and manifest
The data model and permissions are in place for site-specific bookmark storage.

- Update `src/manifest.json` to add `tabs` permission.
- In `src/popup/popup.ts`, define the `Bookmark` interface and storage helpers:
  - `getBookmarksForSite(hostname: string): Promise<Bookmark[]>`
  - `saveBookmarksForSite(hostname: string, bookmarks: Bookmark[]): Promise<void>`
- Use storage key `siteBookmarks` with shape `{ [hostname: string]: Bookmark[] }`.

###   Step 2: Build the popup UI and add-bookmark form
The popup shows the current domain and a form to add bookmarks.

- Rewrite `src/popup/popup.html` with: domain header element, URL input, optional title input, Add button, and bookmark list `<ul>`.
- Update `src/popup/popup.css` with styling for the form inputs, buttons, and layout.
- In `src/popup/popup.ts`, on `DOMContentLoaded`:
  - Query active tab, extract hostname via `new URL(tab.url).hostname`.
  - Display hostname in the header.
  - Wire the Add button to save a new bookmark for the current hostname (validate URL is not empty, prevent duplicates).

###   Step 3: Implement bookmark list with navigation and removal
The bookmark list renders per-site bookmarks with click navigation and removal.

- Implement `renderBookmarks()` in `src/popup/popup.ts`:
  - Render each bookmark as a list item with title/URL text and a remove button.
  - Left-click (`click` event) on a bookmark: call `browser.tabs.update()` to navigate the current tab.
  - Middle-click (`auxclick` with `event.button === 1`): call `browser.tabs.create({ url })` to open in a new tab.
  - Remove button: delete the bookmark from storage and re-render.
  - Empty state: show "No bookmarks for this site" message.
- Call `renderBookmarks()` on load after fetching bookmarks for the current hostname.