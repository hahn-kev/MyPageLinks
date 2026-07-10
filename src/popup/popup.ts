interface SavedLink {
  url: string;
  title: string;
  savedAt: number;
}

const STORAGE_KEY = "savedLinks";

async function getLinks(): Promise<SavedLink[]> {
  const result = await browser.storage.local.get(STORAGE_KEY);
  return (result[STORAGE_KEY] as SavedLink[]) ?? [];
}

async function saveLinks(links: SavedLink[]): Promise<void> {
  await browser.storage.local.set({ [STORAGE_KEY]: links });
}

function renderLinks(links: SavedLink[], list: HTMLUListElement): void {
  list.innerHTML = "";

  if (links.length === 0) {
    const empty = document.createElement("li");
    empty.textContent = "No saved links yet.";
    empty.style.color = "#999";
    empty.style.textAlign = "center";
    list.appendChild(empty);
    return;
  }

  for (const link of links) {
    const li = document.createElement("li");

    const a = document.createElement("a");
    a.href = link.url;
    a.textContent = link.title || link.url;
    a.title = link.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";

    const removeBtn = document.createElement("button");
    removeBtn.className = "btn-remove";
    removeBtn.textContent = "✕";
    removeBtn.title = "Remove link";
    removeBtn.addEventListener("click", async () => {
      const updated = (await getLinks()).filter((l) => l.url !== link.url);
      await saveLinks(updated);
      renderLinks(updated, list);
    });

    li.appendChild(a);
    li.appendChild(removeBtn);
    list.appendChild(li);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const saveBtn = document.getElementById("save-link") as HTMLButtonElement;
  const linksList = document.getElementById("links-list") as HTMLUListElement;

  const links = await getLinks();
  renderLinks(links, linksList);

  saveBtn.addEventListener("click", async () => {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    if (!tab?.url) return;

    const links = await getLinks();
    if (links.some((l) => l.url === tab.url)) {
      return; // already saved
    }

    const newLink: SavedLink = {
      url: tab.url,
      title: tab.title ?? tab.url,
      savedAt: Date.now(),
    };

    const updated = [newLink, ...links];
    await saveLinks(updated);
    renderLinks(updated, linksList);
  });
});
