/**
 * ===================================================================
 * 公务员考试智能笔记助手 - 核心脚本
 * ===================================================================
 * 负责在页面上执行所有操作，包括：
 * 1. 注入“一键总结”按钮
 * 2. 点击按钮时，提取题目所有信息
 * 3. 将信息发送给后台的AI进行分析
 * 4. 接收AI返回的总结，并将其显示在页面上
 * ===================================================================
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

/**
 * 辅助函数：专门用于提取统计信息 (新版 - 使用精确选择器)
 * @param {HTMLElement} block - 单个题目容器的DOM元素
 * @returns {object} - 包含统计信息的对象
 */
function extractOverallInfo(block) {
    // 这个新版本将直接通过您提供的选择器定位到具体的值
    // 不再需要遍历和分割字符串，更加高效和稳定
    const info = {

        // ===================【请您填写以下选择器】===================

        // 请找到【只包含】正确答案字母（如"A"）的那个元素的选择器
        correctAnswer: block.querySelector('.correct-answer')?.innerText.trim() || '',
        
        // 请找到【只包含】正确率（如"75%"）的那个元素的选择器
        accuracy: block.querySelector('.error-prone')?.innerText.trim() || '',
        
        // 请找到【只包含】易错项字母（如"C"）的那个元素的选择器
        commonError: block.querySelector('.correct-rate')?.innerText.trim() || ''

        // ==========================================================
    };

    return info;
}


/**
 * 主要函数：注入按钮和输入框，并绑定所有核心逻辑 (新版 - 增加用户Prompt输入)
 */
/**
 * 主要函数：注入按钮和输入框，并绑定所有核心逻辑 (最终版 - 操作区下置)
 */
/**
 * 主要函数：注入按钮和输入框，并绑定所有核心逻辑 (最终版 - 支持流式显示)
 */
function injectButtons() {
    const questionBlocks = document.querySelectorAll('.ti');

    questionBlocks.forEach(block => {
        if (block.querySelector('.ai-summary-btn')) return;

        const controlsContainer = document.createElement('div');
        controlsContainer.className = 'ai-controls-container';

        const btn = document.createElement('button');
        btn.textContent = '一键总结知识点';
        btn.className = 'ai-summary-btn';
        
        const promptTextarea = document.createElement('textarea');
        promptTextarea.className = 'ai-user-prompt';
        promptTextarea.rows = 2;
        promptTextarea.placeholder = '（选填）需要AI特别关注什么？';
        
        controlsContainer.appendChild(promptTextarea);
        controlsContainer.appendChild(btn);
        block.appendChild(controlsContainer);

        btn.addEventListener('click', async () => {
            btn.disabled = true;
            btn.textContent = '总结中...';
            
            // 【核心改动】移除旧的总结框，准备新的
            const oldContainer = block.querySelector('.ai-summary-container');
            if (oldContainer) oldContainer.remove();
            
            const summaryContainer = document.createElement('div');
            summaryContainer.className = 'ai-summary-container';
            block.appendChild(summaryContainer); // 先把空容器放上去
            summaryContainer.innerHTML = '正在连接AI服务器...'; // 初始提示

            try {
                const overallInfo = extractOverallInfo(block);
                const userPromptAddition = promptTextarea.value || '';

                const questionData = {
                    // ... 您所有的选择器逻辑保持不变 ...
                    questionText: block.querySelector('.question-choice-container .content')?.innerText || '',
                    options: Array.from(block.querySelectorAll('.choice-radios li')).map(li => {
                        // 尝试获取选项字母 (如 'A')，兼容多种可能的class
                        const letter = li.querySelector('.choice-radio-text, .input-radio')?.innerText.trim() || '';
                        // 获取选项的描述文字
                        const text = li.querySelector('.input-text')?.innerText.trim() || '';
                        // 优雅地拼接，即使字母为空也能正常显示
                        return letter ? `${letter}. ${text}` : text;
                    }),
                    correctAnswer: overallInfo.correctAnswer,
                    accuracy: overallInfo.accuracy,
                    commonError: overallInfo.commonError,
                    officialAnalysis: block.querySelector('[id^="section-solution-"] .content')?.innerText || '',
                    tags: Array.from(block.querySelectorAll('[id^="section-keypoint-"] span')).map(el => el.innerText),
                    source: block.querySelector('[id^="section-source-"] .content')?.innerText || '',
                    userPromptAddition: userPromptAddition
                };

                console.log("【插件】提取到的题目信息:", questionData);

                // 【核心改动】使用长连接端口进行通信
                const port = browserAPI.runtime.connect({ name: "summarize-stream" });

                // 通过端口发送我们的数据
                port.postMessage({ type: "SUMMARIZE_TOPIC", payload: questionData });

                let fullSummary = ''; // 用来拼接完整的结果，方便复制

                // 监听来自后台的消息（数据流）
                port.onMessage.addListener((message) => {
                    if (summaryContainer.innerHTML === '正在连接AI服务器...') {
                        summaryContainer.innerHTML = ''; // 清空初始提示
                    }
                    if (message.chunk) {
                        fullSummary += message.chunk;
                        // 渲染并净化HTML
                        const dirtyHtml = marked.parse(fullSummary);
                        const cleanHtml = DOMPurify.sanitize(dirtyHtml);
                        summaryContainer.innerHTML = cleanHtml;
                    } else if (message.error) {
                        summaryContainer.innerText = `错误: ${message.error}`;
                    }
                });

                // 监听端口断开事件（表示流结束）
                port.onDisconnect.addListener(() => {
                    if (fullSummary && !summaryContainer.querySelector('.copy-btn')) {
                        // 流结束后，添加复制按钮
                        const copyBtn = document.createElement('button');
                        copyBtn.className = 'copy-btn';
                        copyBtn.textContent = '复制';
                        copyBtn.onclick = () => {
                            navigator.clipboard.writeText(fullSummary).then(() => {
                                copyBtn.textContent = '已复制!';
                                setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
                            });
                        };
                        summaryContainer.appendChild(copyBtn);
                    }
                    // 【关键】只有当连接断开时，才恢复按钮状态
                    btn.disabled = false;
                    btn.textContent = '一键总结知识点';
                    console.log("【插件】流式连接已关闭。");
                });

            } catch (error) {
                // 这里的catch只捕获建立连接前的错误
                console.error("【插件】启动连接时失败:", error);
                summaryContainer.innerText = `错误: ${error.message}`;
                btn.disabled = false;
                btn.textContent = '一键总结知识点';
            }
        });
    });
}

/**
 * 辅助函数：在页面上显示AI总结结果 (新版 - 支持Markdown渲染)
 * @param {HTMLElement} block - 要在哪个题目下方显示
 * @param {object} summaryData - 包含总结内容或错误信息的对象
 */
function displaySummary(block, summaryData) {
    // 先移除可能已存在的旧总结框
    const oldContainer = block.querySelector('.ai-summary-container');
    if (oldContainer) {
        oldContainer.remove();
    }
    
    // 创建新的总结框容器
    const container = document.createElement('div');
    container.className = 'ai-summary-container';

    if (summaryData.error) {
        // 如果发生错误，直接显示错误文本
        container.innerText = summaryData.error;
    } else {
        // 【核心改动】如果成功，渲染Markdown内容
        // 1. 使用 Marked.js 将Markdown字符串转换为HTML字符串
        const dirtyHtml = marked.parse(summaryData.summary);
        // 2. 使用 DOMPurify 净化HTML，防止XSS攻击
        const cleanHtml = DOMPurify.sanitize(dirtyHtml);
        // 3. 将净化后的、安全的HTML内容插入到容器中
        container.innerHTML = cleanHtml;

        // "复制"按钮逻辑保持不变，但我们现在复制原始的Markdown文本，而不是渲染后的HTML
        const copyBtn = document.createElement('button');
        copyBtn.className = 'copy-btn';
        copyBtn.textContent = '复制';
        copyBtn.onclick = () => {
            navigator.clipboard.writeText(summaryData.summary).then(() => {
                copyBtn.textContent = '已复制!';
                setTimeout(() => { copyBtn.textContent = '复制'; }, 2000);
            });
        };
        container.appendChild(copyBtn);
    }
    
    // 将总结框添加到题目块的末尾
    block.appendChild(container);
}



// ======================= 脚本执行入口 =======================

// 首次加载页面时，立即尝试注入按钮
injectButtons();

// 为应对动态加载内容的网站(SPA)，使用 MutationObserver 监听DOM变化
// 当页面内容发生改变（例如滚动加载了新题目）时，再次尝试注入按钮
const observer = new MutationObserver((mutations) => {
    // 这里的逻辑可以优化，但简单地再次调用即可满足大部分需求
    injectButtons();
});

// 配置观察器并启动
observer.observe(document.body, {
    childList: true, // 观察直接子节点的变动
    subtree: true    // 观察所有后代节点的变动
});
