// Adds a rule of its own each time it starts, and asks for what it blocks to be counted on its button, as an ad blocker does.
(async () => {
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [10],
    addRules: [
      {
        id: 10,
        action: { type: 'block' },
        condition: { urlFilter: '/dynamic-block/', resourceTypes: ['xmlhttprequest'] },
      },
    ],
  });
  await chrome.declarativeNetRequest.setExtensionActionOptions({ displayActionCountAsBadgeText: true });
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: [{ id: 0, action: { type: 'block' }, condition: {} }],
    });
    console.log('rules: a bad rule was accepted');
  } catch (error) {
    console.log(`rules: a bad rule was refused: ${error.message}`);
  }
})();
