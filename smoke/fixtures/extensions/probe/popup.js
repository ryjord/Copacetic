chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
  document.title = `active: ${tabs.map((tab) => tab.url).join(',')}`;
});
