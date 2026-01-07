// Listen for the Extension Icon Click
chrome.action.onClicked.addListener((tab) => {
    // Send a message to the active tab to toggle the Sidebar
    chrome.tabs.sendMessage(tab.id, { action: "toggle_sidebar" })
        .catch(err => {
            console.warn("SiteSherpa: Could not connect to content script. Is the page loaded?", err);
        });
});