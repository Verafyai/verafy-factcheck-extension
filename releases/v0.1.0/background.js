// Opens the side panel from the toolbar icon and handles "Check with Verafy" on selected text.

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: "verafy-check",
    title: "Check \u201c%s\u201d with Verafy",
    contexts: ["selection"]
  });
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId !== "verafy-check" || !tab) return;
  // sidePanel.open must run inside the user gesture, before any await.
  chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  chrome.storage.session.set({
    pending: {
      type: "statement",
      text: (info.selectionText || "").slice(0, 1000),
      url: tab.url || "",
      title: tab.title || "",
      ts: Date.now()
    }
  });
});
