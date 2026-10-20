// Counts the tabs it can see and shows the count as its badge, which the main process can read back.
const count = () => chrome.tabs.query({}).then((tabs) => chrome.action.setBadgeText({ text: String(tabs.length) }));
chrome.tabs.onCreated.addListener(count);
chrome.tabs.onRemoved.addListener(count);
chrome.tabs.onUpdated.addListener(count);
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({ id: 'probe', title: 'Probe this page', contexts: ['page'] });
  count();
});
count();
