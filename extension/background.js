chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;

  try {
    // 1. Try to send a "Wake Up" signal
    await chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" });
  } catch (err) {
    console.log("⚠️ Connection broken. Re-injecting Cortex...", err);

    // 2. If dead, FORCE inject everything fresh
    try {
      await chrome.scripting.insertCSS({
        target: { tabId: tab.id },
        files: ["sidebar.css"]
      });
      
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      
      // 3. Wait a split second for the brain to load, then trigger
      setTimeout(() => {
        chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" })
          .catch(e => console.error("Still failed:", e));
      }, 150);
      
    } catch (e) {
      console.error("Injection failed. Is this a restricted page?", e);
    }
  }
});