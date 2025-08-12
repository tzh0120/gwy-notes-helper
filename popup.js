/**
 * popup.js
 * 负责处理插件弹出窗口的逻辑
 * 主要是保存和读取API Key
 */

// 为“保存”按钮添加点击事件监听器
document.getElementById('save').addEventListener('click', () => {
    const apiKey = document.getElementById('apiKey').value;
    if (!apiKey) {
        const status = document.getElementById('status');
        status.style.color = 'red';
        status.textContent = 'API Key不能为空！';
        setTimeout(() => { status.textContent = ''; }, 2000);
        return;
    }

    // 使用 chrome.storage.sync 将API Key保存到云端同步存储
    chrome.storage.sync.set({ apiKey: apiKey }, () => {
        const status = document.getElementById('status');
        status.style.color = 'green';
        status.textContent = 'API Key已成功保存！';
        setTimeout(() => { status.textContent = ''; }, 2000);
    });
});

// 当弹出窗口加载时，尝试读取并显示已保存的API Key
document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.sync.get('apiKey', (data) => {
        if (data.apiKey) {
            document.getElementById('apiKey').value = data.apiKey;
        }
    });
});
