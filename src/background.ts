browser.runtime.onInstalled.addListener(() => {
  console.log("MyPageLinks extension installed.");
});

browser.runtime.onMessage.addListener((message: { type: string; url: string }) => {
  if (message.type === "openTab") {
    browser.tabs.create({ url: message.url });
  }
});
