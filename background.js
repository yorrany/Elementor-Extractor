const MODE_KEY = 'mode';
const CONVERSION_KEY = 'conversion';
const CAPTURE_KEY = 'lastSerialized';

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get([MODE_KEY, CONVERSION_KEY], (result) => {
    const updates = {};
    if (!result[MODE_KEY]) updates[MODE_KEY] = 'container';
    if (!result[CONVERSION_KEY]) updates[CONVERSION_KEY] = 'native';
    if (Object.keys(updates).length) {
      chrome.storage.local.set(updates);
    }
  });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[CAPTURE_KEY]) {
    return;
  }
  if (changes[CAPTURE_KEY].newValue) {
    chrome.action.setBadgeText({ text: '1' });
    chrome.action.setBadgeBackgroundColor({ color: '#e03a8e' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
});
