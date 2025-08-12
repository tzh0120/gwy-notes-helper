/**
 * ===================================================================
 * 公务员考试智能笔记助手 - 后台服务脚本 (background.js)
 * ===================================================================
 * 负责与外部API通信，是插件的“大脑”。
 * 1. 监听来自 content.js 的消息。
 * 2. 获取存储的API Key。
 * 3. 构建并发送Prompt给大语言模型。
 * 4. 将AI返回的结果传回 content.js。
 * ===================================================================
 */
const browserAPI = typeof browser !== 'undefined' ? browser : chrome;

// 辅助函数：异步获取存储在Chrome中的API Key
async function getApiKey() {
    const data = await browserAPI.storage.sync.get('apiKey');
    return data.apiKey;
}

// 核心逻辑：监听来自content script的消息
browserAPI.runtime.onConnect.addListener((port) => {
    console.log("【后台】新连接建立:", port.name); // 增加日志，确认连接成功
    // 确保是我们定义的端口
    if (port.name !== "summarize-stream") return;
     // 为这个端口添加消息监听器，只处理一次初始数据
    port.onMessage.addListener(async (message) => {
        if (message.type === "SUMMARIZE_TOPIC") {
            try {
                const apiKey = await getApiKey();
                if (!apiKey) {
                    // 如果用户没有设置API Key，则返回错误信息
                    throw new Error("尚未设置API Key，请点击插件图标进行设置。");
                }

                // ==================【Prompt设计】==================
                                const systemPrompt = `你是一位精通中国公务员行政能力测试你是一位精通中国公务员行政能力测试，风格“一针见血”的顶级行测备考策略师。`;

                // 从收到的数据中解构出追加的Prompt
                const { userPromptAddition, ...coreQuestionData } = message.payload;

                // 开始构建基础的用户指令
                                let userPrompt = `
你的任务是：根据我提供的题目和官方解析，生成一份专业、详实且易于归纳的知识点笔记。

**核心原则：**
你的所有输出都必须**严格围绕我提供的“官方解析”内容展开**。你可以对其进行归纳、提炼和结构化，但绝不能脱离原文进行过度的自由发挥。

**请严格按照以下四段式框架输出：**

**1. 【核心考点】**
- 用一句话精准概括这道题直接考察的核心概念或原则。

**2. 【知识点详解】**
- **这是主体部分，必须保证信息量。**
- 请系统性地梳理“官方解析”中提到的所有知识点，**可以使用分点罗列（1., 2., 3.）** 的方式，对定义、规则、原理或背景进行逻辑清晰的组织和呈现，使其更易于理解和记忆。

**3. 【选项分析】**
- 逐一分析关键选项。解释正确选项为何正确，并**明确指出**错误选项的具体错误原因，要能直接对应到知识点。

**4. 【拓展辨析】(可选)**
- **此部分必须高度相关，严格控制范围。**
- 仅在必要时，基于核心考点进行拓展。例如：
    - 辨析一个与本题考点极易混淆的概念。
    - 提及本题所用法条/公式的另一个常见应用场景。
- **如果官方解析内容详实，没有太多可供拓展的空间，请果断省略此部分，以保证笔记的简洁性。**
`;

                // 【核心改动】如果用户输入了追加指令，就将其加入到Prompt中
                if (userPromptAddition && userPromptAddition.trim() !== '') {
                    userPrompt += `
**用户的特别指令：**
请在遵循以上所有规则的前提下，特别注意以下要求： "${userPromptAddition}"
`;
                }

                // 将题目信息附加到Prompt的末尾
                userPrompt += `
**请根据以下题目信息，开始你的总结笔记工作：**
\`\`\`json
${JSON.stringify(coreQuestionData, null, 2)}
\`\`\`
`;
                // ======================================================

                // 使用 fetch API 向 DeepSeek 的服务器发送请求
                const response = await fetch('https://api.deepseek.com/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}` // 使用 Bearer Token 认证
                    },
                    body: JSON.stringify({
                        model: "deepseek-chat", // 使用指定的模型
                        messages: [
                            { "role": "system", "content": systemPrompt },
                            { "role": "user", "content": userPrompt }
                        ],
                        stream: true
                    })
                });

                if (!response.ok) {
                    throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
                }
                
                const reader = response.body.getReader();
                const decoder = new TextDecoder("utf-8");

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const textChunk = decoder.decode(value);
                    const lines = textChunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const jsonStr = line.substring(6); // 使用 substring 更安全
                            if (jsonStr.trim() === '[DONE]') break;
                            try {
                                const parsed = JSON.parse(jsonStr);
                                const content = parsed.choices[0]?.delta?.content || '';
                                if (content) {
                                    port.postMessage({ chunk: content });
                                }
                            } catch (e) { /* 忽略空行或解析错误 */ }
                        }
                    }
                }
            } catch (error) {
                console.error("【后台】流处理中发生错误:", error);
                port.postMessage({ error: error.message });
            } finally {
                console.log("【后台】流处理结束，关闭端口。");
                port.disconnect();
            }
        }
    });
});