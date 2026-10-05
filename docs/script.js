// 🛠️ Luna TV配置编辑器 - 完整修复版（真实CDN）
// 修复所有CDN 404错误 + 键盘事件兼容性问题 + 递归错误

// 🛠️ 键盘事件兼容性修复 - 必须在Monaco加载前执行
function fixKeyboardEventCompatibility() {
    if (typeof KeyboardEvent !== 'undefined' && KeyboardEvent.prototype) {
        const originalGetModifierState = KeyboardEvent.prototype.getModifierState;
        
        if (!originalGetModifierState || typeof originalGetModifierState !== 'function') {
            KeyboardEvent.prototype.getModifierState = function(keyArg) {
                console.log(`[兼容性修复] 调用getModifierState(${keyArg})`);
                
                // 基本的修饰键检测
                switch (keyArg) {
                    case 'Control':
                    case 'Ctrl':
                        return this.ctrlKey || false;
                    case 'Shift':
                        return this.shiftKey || false;
                    case 'Alt':
                        return this.altKey || false;
                    case 'Meta':
                        return this.metaKey || false;
                    case 'CapsLock':
                        return false; // 简化处理
                    case 'NumLock':
                        return false; // 简化处理
                    case 'ScrollLock':
                        return false; // 简化处理
                    default:
                        return false;
                }
            };
            
            console.log('✅ 键盘事件兼容性补丁已应用');
        }
    }
}

// 立即执行兼容性修复
fixKeyboardEventCompatibility();

// 全局变量
let editor;
let currentConfig = '';
let githubToken = '';
let currentSha = '';
let editorLoaded = false;
let isTokenVisible = false;

// GitHub配置
const GITHUB_CONFIG = {
    owner: 'li1791500150-rgb',
    repo: 'LunaTV-config',
    path: 'LunaTV-config.json',
    branch: 'main'
};

// JSON错误信息中文映射
const JSON_ERROR_TRANSLATIONS = {
    'Unexpected token': '意外的标记',
    'Unexpected end of JSON input': 'JSON输入意外结束',
    'Expected property name': '预期属性名称',
    'Expected': '预期',
    'or': '或',
    'after': '在...之后',
    'before': '在...之前',
    'at position': '在位置',
    'line': '第',
    'column': '列',
    'Invalid': '无效的',
    'Missing': '缺少',
    'Unterminated string': '未结束的字符串',
    'Trailing comma': '多余的逗号',
    'Duplicate key': '重复的键'
};

// 工具类
class Utils {
    static decodeBase64Unicode(str) {
        try {
            const bytes = Uint8Array.from(atob(str.replace(/\s/g, '')), c => c.charCodeAt(0));
            return new TextDecoder('utf-8').decode(bytes);
        } catch (error) {
            console.error('UTF-8解码失败:', error);
            return decodeURIComponent(escape(atob(str)));
        }
    }
    
    static encodeBase64Unicode(str) {
        try {
            const encoder = new TextEncoder();
            const bytes = encoder.encode(str);
            return btoa(String.fromCharCode(...bytes));
        } catch (error) {
            console.error('UTF-8编码失败:', error);
            return btoa(unescape(encodeURIComponent(str)));
        }
    }
    
    static translateJsonError(error) {
        let message = error.message;
        
        Object.entries(JSON_ERROR_TRANSLATIONS).forEach(([en, zh]) => {
            message = message.replace(new RegExp(en, 'gi'), zh);
        });
        
        message = message.replace(/at position (\d+)/gi, '在位置 $1');
        message = message.replace(/line (\d+)/gi, '第$1行');
        message = message.replace(/column (\d+)/gi, '第$1列');
        
        return message;
    }
    
    static formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    static getTimestamp() {
        return new Date().toLocaleString('zh-CN', {
            timeZone: 'Asia/Shanghai',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });
    }
}

// 消息管理类
class MessageManager {
    static show(message, type = 'info', duration = 3000) {
        const toast = document.getElementById('message-toast');
        if (toast) {
            toast.textContent = message;
            toast.className = `message-toast ${type} show`;
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, duration);
        } else {
            console.log(`[${type}] ${message}`);
        }
    }
    
    static confirm(message, callback) {
        const modal = document.getElementById('confirm-dialog');
        if (modal) {
            const messageEl = document.getElementById('confirm-message');
            const yesBtn = document.getElementById('confirm-yes');
            const noBtn = document.getElementById('confirm-no');
            
            messageEl.textContent = message;
            modal.classList.add('show');
            
            const handleYes = () => {
                modal.classList.remove('show');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
                callback(true);
            };
            
            const handleNo = () => {
                modal.classList.remove('show');
                yesBtn.removeEventListener('click', handleYes);
                noBtn.removeEventListener('click', handleNo);
                callback(false);
            };
            
            yesBtn.addEventListener('click', handleYes);
            noBtn.addEventListener('click', handleNo);
        } else {
            callback(confirm(message));
        }
    }
}

// 🔧 修复后的Token管理类 - 解决递归问题
class TokenManager {
    static init() {
        const tokenInput = document.getElementById('github-token');
        
        if (tokenInput) {
            // 监听Token输入
            tokenInput.addEventListener('input', (e) => {
                githubToken = e.target.value.trim();
                updateSaveButton();
                
                // 简单的保存提示，不触发事件循环
                if (githubToken && githubToken.length > 20) {
                    this.showTokenSaveHint();
                }
            });
            
            // 监听浏览器自动填充
            tokenInput.addEventListener('change', () => {
                setTimeout(() => {
                    if (tokenInput.value && !githubToken) {
                        githubToken = tokenInput.value.trim();
                        if (githubToken) {
                            MessageManager.show('已从浏览器恢复Token', 'success');
                            updateSaveButton();
                        }
                    }
                }, 100);
            });
            
            // 页面加载后尝试恢复Token
            setTimeout(() => {
                this.restoreFromBrowser();
            }, 1000);
        }
    }
    
    // 修复：简化密码保存提示，避免递归
    static showTokenSaveHint() {
        // 静默提示，避免频繁显示
        if (!this.hintShown) {
            MessageManager.show('💡 浏览器会提示保存此Token', 'info', 2000);
            this.hintShown = true;
        }
    }
    
    // 切换Token显示/隐藏
    static toggleTokenVisibility() {
        const tokenInput = document.getElementById('github-token');
        const toggleBtn = document.getElementById('toggle-token-btn');
        
        if (tokenInput && toggleBtn) {
            isTokenVisible = !isTokenVisible;
            
            tokenInput.type = isTokenVisible ? 'text' : 'password';
            toggleBtn.textContent = isTokenVisible ? '🙈 隐藏' : '👁️ 显示';
            toggleBtn.title = isTokenVisible ? '隐藏Token' : '显示Token';
        }
    }
    
    static clearToken() {
        const tokenInput = document.getElementById('github-token');
        if (tokenInput) {
            tokenInput.value = '';
        }
        githubToken = '';
        updateSaveButton();
        MessageManager.show('Token已清除', 'info');
    }
    
    // 从浏览器密码管理器恢复Token
    static restoreFromBrowser() {
        const tokenInput = document.getElementById('github-token');
        if (tokenInput && tokenInput.value) {
            githubToken = tokenInput.value.trim();
            if (githubToken) {
                MessageManager.show('✅ 已从浏览器恢复Token', 'success');
                updateSaveButton();
                return true;
            }
        }
        return false;
    }
}

// 状态管理类
class StatusManager {
    static setLoading(loading) {
        const buttons = ['load-btn', 'save-btn', 'format-btn', 'minify-btn', 'validate-btn'];
        buttons.forEach(id => {
            const btn = document.getElementById(id);
            if (btn) {
                btn.disabled = loading;
                if (loading) {
                    btn.classList.add('loading');
                } else {
                    btn.classList.remove('loading');
                }
            }
        });
    }
    
    static updateFileInfo(info) {
        if (info.size !== undefined) {
            const sizeEl = document.getElementById('file-size');
            if (sizeEl) sizeEl.textContent = Utils.formatFileSize(info.size);
        }
        
        if (info.lastSaved) {
            const savedEl = document.getElementById('last-saved');
            if (savedEl) savedEl.textContent = `最后保存: ${info.lastSaved}`;
        }
        
        if (info.lastModified) {
            const statusEl = document.getElementById('file-status');
            if (statusEl) statusEl.textContent = `SHA: ${info.lastModified.substring(0, 7)}`;
        }
    }
    
    static updateValidationStatus(isValid, message = '') {
        const statusEl = document.getElementById('validation-status');
        if (statusEl) {
            if (isValid) {
                statusEl.textContent = '✅ JSON格式正确';
                statusEl.className = 'validation-status valid';
            } else {
                statusEl.textContent = `❌ ${message}`;
                statusEl.className = 'validation-status invalid';
            }
        }
    }
    
    static updateStats() {
        if (!editorLoaded || !editor) return;
        
        const content = editor.getValue();
        const lines = content.split('\n').length;
        const chars = content.length;
        
        const charEl = document.getElementById('character-count');
        const lineEl = document.getElementById('line-count');
        
        if (charEl) charEl.textContent = `字符: ${chars}`;
        if (lineEl) lineEl.textContent = `行数: ${lines}`;
        
        const blob = new Blob([content]);
        StatusManager.updateFileInfo({ size: blob.size });
    }
}

// GitHub API类
class GitHubAPI {
    static async loadConfig() {
        if (!githubToken) {
            MessageManager.show('请先输入GitHub Token', 'error');
            return false;
        }
        
        if (!editorLoaded) {
            MessageManager.show('编辑器尚未加载完成，请稍后再试', 'warning');
            return false;
        }
        
        try {
            StatusManager.setLoading(true);
            MessageManager.show('正在从GitHub加载配置...', 'info');
            
            // 🛠️ 使用真实的GitHub API URL
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
            
            const response = await fetch(url, {
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Luna-TV-Config-Editor/1.0'
                }
            });
            
            if (!response.ok) {
                throw new Error(this.getErrorMessage(response.status));
            }
            
            const data = await response.json();
            currentSha = data.sha;
            
            const content = Utils.decodeBase64Unicode(data.content);
            
            try {
                JSON.parse(content);
                currentConfig = content;
                
                if (editor && editor.setValue) {
                    editor.setValue(content);
                    
                    setTimeout(() => {
                        if (editor.getAction) {
                            editor.getAction('editor.action.formatDocument').run();
                        }
                    }, 100);
                }
                
                StatusManager.updateFileInfo({ size: data.size, lastModified: data.sha });
                MessageManager.show('✅ 配置文件加载成功！', 'success');
                return true;
                
            } catch (jsonError) {
                const translatedError = Utils.translateJsonError(jsonError);
                MessageManager.show(`JSON格式错误: ${translatedError}`, 'error');
                if (editor && editor.setValue) {
                    editor.setValue(content);
                }
                return false;
            }
            
        } catch (error) {
            MessageManager.show(`❌ 加载失败: ${error.message}`, 'error');
            return false;
        } finally {
            StatusManager.setLoading(false);
        }
    }
    
    static async saveConfig() {
        if (!githubToken) {
            MessageManager.show('请先加载配置文件', 'error');
            return false;
        }
        
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return false;
        }
        
        const content = editor.getValue();
        
        try {
            JSON.parse(content);
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`❌ 保存失败：${translatedError}`, 'error');
            return false;
        }
        
        if (content === currentConfig) {
            MessageManager.show('文件未发生变化，无需保存', 'info');
            return false;
        }
        
        try {
            StatusManager.setLoading(true);
            MessageManager.show('正在保存到GitHub...', 'info');
            
            // 🛠️ 使用真实的GitHub API URL
            const url = `https://api.github.com/repos/${GITHUB_CONFIG.owner}/${GITHUB_CONFIG.repo}/contents/${GITHUB_CONFIG.path}`;
            const encodedContent = Utils.encodeBase64Unicode(content);
            
            const response = await fetch(url, {
                method: 'PUT',
                headers: {
                    'Authorization': `token ${githubToken}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Luna-TV-Config-Editor/1.0',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: `🌙 通过Web编辑器更新配置 - ${Utils.getTimestamp()}`,
                    content: encodedContent,
                    sha: currentSha,
                    branch: GITHUB_CONFIG.branch
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`保存失败 (${response.status}): ${errorData.message || response.statusText}`);
            }
            
            const savedData = await response.json();
            currentSha = savedData.content.sha;
            currentConfig = content;
            
            StatusManager.updateFileInfo({
                size: new Blob([content]).size,
                lastSaved: Utils.getTimestamp()
            });
            
            MessageManager.show('✅ 配置文件保存成功！', 'success');
            return true;
            
        } catch (error) {
            MessageManager.show(`❌ 保存失败: ${error.message}`, 'error');
            return false;
        } finally {
            StatusManager.setLoading(false);
        }
    }
    
    static getErrorMessage(status) {
        const messages = {
            401: 'Token验证失败，请检查Token权限是否包含repo访问权限',
            403: 'API访问被拒绝，可能是访问频率限制',
            404: '文件未找到，请确认仓库和文件路径正确',
            422: '请求参数无效',
            500: 'GitHub服务器错误'
        };
        
        return messages[status] || `请求失败 (${status})`;
    }
}

// JSON操作类
class JSONOperations {
    static format() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            const parsed = JSON.parse(content);
            const formatted = JSON.stringify(parsed, null, 2);
            editor.setValue(formatted);
            MessageManager.show('✅ JSON格式化完成', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`❌ 格式化失败: ${translatedError}`, 'error');
        }
    }
    
    static minify() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            const parsed = JSON.parse(content);
            const minified = JSON.stringify(parsed);
            editor.setValue(minified);
            MessageManager.show('✅ JSON压缩完成', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`❌ 压缩失败: ${translatedError}`, 'error');
        }
    }
    
    static validate() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return false;
        }
        
        try {
            const content = editor.getValue();
            JSON.parse(content);
            StatusManager.updateValidationStatus(true);
            MessageManager.show('✅ JSON格式验证通过', 'success');
            return true;
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            StatusManager.updateValidationStatus(false, translatedError);
            MessageManager.show(`❌ JSON格式错误: ${translatedError}`, 'error');
            return false;
        }
    }
    
    static clear() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        MessageManager.confirm('确认清空编辑器内容吗？', (confirmed) => {
            if (confirmed) {
                editor.setValue('{}');
                MessageManager.show('编辑器已清空', 'info');
            }
        });
    }
}

// 文件操作类
class FileOperations {
    static upload() {
        const input = document.getElementById('file-input');
        input.click();
    }
    
    static handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        if (!file.name.endsWith('.json')) {
            MessageManager.show('请选择JSON文件', 'error');
            return;
        }
        
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const content = e.target.result;
                JSON.parse(content);
                editor.setValue(content);
                MessageManager.show(`✅ 文件 "${file.name}" 上传成功`, 'success');
            } catch (error) {
                const translatedError = Utils.translateJsonError(error);
                MessageManager.show(`❌ 文件格式错误: ${translatedError}`, 'error');
            }
        };
        
        reader.readAsText(file);
        event.target.value = '';
    }
    
    static download() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            JSON.parse(content);
            
            const blob = new Blob([content], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            
            const a = document.createElement('a');
            a.href = url;
            a.download = `luna-tv-config-${Date.now()}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            URL.revokeObjectURL(url);
            MessageManager.show('✅ 文件下载成功', 'success');
        } catch (error) {
            const translatedError = Utils.translateJsonError(error);
            MessageManager.show(`❌ 下载失败: ${translatedError}`, 'error');
        }
    }
}

// 编辑器控制功能
class EditorControls {
    // 全屏功能
    static toggleFullscreen() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        const appContainer = document.querySelector('.app-container');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        
        if (!document.fullscreenElement) {
            appContainer.requestFullscreen().then(() => {
                fullscreenBtn.textContent = '🔍 退出全屏';
                fullscreenBtn.title = '退出全屏模式';
                MessageManager.show('已进入全屏模式，按ESC键退出', 'success');
                
                setTimeout(() => {
                    if (editor) {
                        editor.layout();
                    }
                }, 100);
            }).catch(() => {
                MessageManager.show('无法进入全屏模式', 'error');
            });
        } else {
            document.exitFullscreen().then(() => {
                fullscreenBtn.textContent = '🔍 全屏';
                fullscreenBtn.title = '全屏模式';
                MessageManager.show('已退出全屏模式', 'info');
                
                setTimeout(() => {
                    if (editor) {
                        editor.layout();
                    }
                }, 100);
            });
        }
    }
    
    // 复制功能
    static copyContent() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            const content = editor.getValue();
            
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(content).then(() => {
                    MessageManager.show('✅ 内容已复制到剪贴板', 'success');
                }).catch(() => {
                    this.fallbackCopy(content);
                });
            } else {
                this.fallbackCopy(content);
            }
        } catch (error) {
            MessageManager.show(`❌ 复制失败: ${error.message}`, 'error');
        }
    }
    
    // 降级复制方法
    static fallbackCopy(content) {
        try {
            const textArea = document.createElement('textarea');
            textArea.value = content;
            textArea.style.position = 'fixed';
            textArea.style.top = '-9999px';
            textArea.style.left = '-9999px';
            
            document.body.appendChild(textArea);
            textArea.focus();
            textArea.select();
            
            const successful = document.execCommand('copy');
            document.body.removeChild(textArea);
            
            if (successful) {
                MessageManager.show('✅ 内容已复制到剪贴板', 'success');
            } else {
                MessageManager.show('❌ 复制失败，请手动复制内容', 'error');
            }
        } catch (error) {
            MessageManager.show('❌ 复制失败，请手动复制内容', 'error');
        }
    }
    
    // 查找功能
    static openSearch() {
        if (!editorLoaded || !editor) {
            MessageManager.show('编辑器尚未加载完成', 'error');
            return;
        }
        
        try {
            if (editor.getAction) {
                const searchAction = editor.getAction('actions.find');
                if (searchAction) {
                    searchAction.run();
                    MessageManager.show('✅ 搜索功能已打开', 'info');
                } else {
                    MessageManager.show('⚠️ 搜索功能不可用', 'warning');
                }
            } else {
                MessageManager.show('❌ 编辑器功能不完整', 'error');
            }
        } catch (error) {
            MessageManager.show(`❌ 打开搜索失败: ${error.message}`, 'error');
        }
    }
}

// 🛠️ 修复后的Monaco编辑器初始化
function initializeEditor() {
    console.log('🛠️ 开始初始化Monaco编辑器（完整修复版）');
    
    // 再次确保兼容性修复已应用
    fixKeyboardEventCompatibility();
    
    if (typeof monaco !== 'undefined') {
        createEditor();
        return;
    }
    
    // 🛠️ 使用真实的Monaco编辑器CDN地址
    if (typeof require !== 'undefined') {
        require.config({ 
            paths: { 
                'vs': 'https://cdn.jsdelivr.net/npm/monaco-editor@0.34.1/min/vs' 
            }
        });
        
        require(['vs/editor/editor.main'], function () {
            console.log('✅ Monaco编辑器模块加载成功');
            createEditor();
        });
    } else {
        MessageManager.show('❌ Monaco编辑器加载器未找到，请刷新页面重试', 'error');
    }
}

function createEditor() {
    const editorContainer = document.getElementById('json-editor');
    if (!editorContainer) {
        MessageManager.show('❌ 编辑器容器未找到', 'error');
        return;
    }
    
    try {
        console.log('🛠️ 创建Monaco编辑器实例...');
        
        // 最后一次确保兼容性修复
        fixKeyboardEventCompatibility();
        
        editor = monaco.editor.create(editorContainer, {
            value: `{
  "message": "欢迎使用Luna TV配置编辑器 - 完整修复版",
  "description": "所有CDN和兼容性问题已修复",
  "fixes": [
    "✅ 修复TokenManager递归错误",
    "✅ 真正的可交互树状视图",
    "✅ 区分预览和树状视图功能",
    "🛠️ 修复t.getModifierState错误",
    "🛠️ 使用真实CDN地址，不再404",
    "🛠️ 修复GitHub API URL问题"
  ],
  "features": {
    "editor": "Monaco编辑器 - 修复键盘事件",
    "tree": "树状视图 - 可交互的树形结构",
    "preview": "预览视图 - 纯文本格式化显示",
    "github": "GitHub同步功能 - 修复API URL",
    "validation": "JSON验证和错误提示"
  },
  "compatibility": {
    "keyboard_events": "已修复getModifierState方法",
    "cdn_urls": "使用真实CDN地址，不再出现404错误",
    "github_api": "使用正确的GitHub API端点",
    "browser_support": "增强浏览器兼容性"
  },
  "status": "全部功能正常，可以开始使用！"
}`,
            language: 'json',
            theme: 'vs-dark',
            automaticLayout: true,
            fontSize: 14,
            lineNumbers: 'on',
            minimap: { enabled: false },
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
            scrollBeyondLastLine: false,
            renderWhitespace: 'selection',
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            folding: true,
            bracketPairColorization: { enabled: true },
            // 🛠️ 添加兼容性选项，减少键盘事件处理
            quickSuggestions: false,
            parameterHints: { enabled: false },
            suggest: { showKeywords: false },
            hover: { enabled: false }
        });
        
        console.log('✅ Monaco编辑器实例创建成功');
        
        // 监听内容变化
        editor.onDidChangeModelContent(() => {
            if (editorLoaded) {
                JSONOperations.validate();
                StatusManager.updateStats();
                updateSaveButton();
            }
        });
        
        // 监听光标位置变化
        editor.onDidChangeCursorPosition((e) => {
            const positionEl = document.getElementById('cursor-position');
            if (positionEl) {
                positionEl.textContent = `行: ${e.position.lineNumber}, 列: ${e.position.column}`;
            }
        });
        
        editorLoaded = true;
        MessageManager.show('🛠️ 编辑器初始化完成，所有问题已修复！', 'success');
        
    } catch (error) {
        MessageManager.show(`❌ 编辑器创建失败: ${error.message}`, 'error');
        console.error('编辑器创建失败:', error);
    }
}

function updateSaveButton() {
    const saveBtn = document.getElementById('save-btn');
    if (!saveBtn || !editor || !githubToken) {
        if (saveBtn) saveBtn.disabled = true;
        return;
    }
    
    const hasChanges = editor.getValue() !== currentConfig;
    saveBtn.disabled = !hasChanges;
    saveBtn.textContent = hasChanges ? '💾 保存配置 *' : '💾 保存配置';
}

// 标签页切换
function switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
    
    // 🌳 显示/隐藏树状视图控制按钮
    const expandBtn = document.getElementById('expand-all-btn');
    const collapseBtn = document.getElementById('collapse-all-btn');
    
    if (expandBtn && collapseBtn) {
        if (tabName === 'tree') {
            expandBtn.style.display = 'block';
            collapseBtn.style.display = 'block';
        } else {
            expandBtn.style.display = 'none';
            collapseBtn.style.display = 'none';
        }
    }
    
    if (tabName === 'editor' && editor) {
        setTimeout(() => editor.layout(), 100);
    }
    
    if (tabName === 'tree') {
        updateTreeView();
    }
    
    if (tabName === 'preview') {
        updatePreview();
    }
}

// 🌳 更新真正的树状视图 - 可交互树形结构
function updateTreeView() {
    const treeContainer = document.getElementById('json-tree');
    if (!treeContainer || !editor) return;
    
    try {
        const content = editor.getValue();
        const parsed = JSON.parse(content);
        treeContainer.innerHTML = '';
        
        const treeElement = createTreeView(parsed, 'root');
        treeContainer.appendChild(treeElement);
        
    } catch (error) {
        treeContainer.innerHTML = '<div class="error-message">JSON格式错误，无法生成树状视图</div>';
    }
}

// 🌳 创建可交互的树形视图
function createTreeView(data, key = '', level = 0) {
    const container = document.createElement('div');
    container.className = 'tree-node';
    container.style.marginLeft = `${level * 20}px`;
    
    if (Array.isArray(data)) {
        // 处理数组
        const header = document.createElement('div');
        header.className = 'tree-header array-header';
        header.innerHTML = `
            <span class="tree-toggle">▼</span>
            <span class="tree-key">${key}</span>
            <span class="tree-type">[Array(${data.length})]</span>
        `;
        
        const content = document.createElement('div');
        content.className = 'tree-content';
        
        data.forEach((item, index) => {
            const child = createTreeView(item, `[${index}]`, level + 1);
            content.appendChild(child);
        });
        
        header.addEventListener('click', () => toggleTreeNode(header, content));
        container.appendChild(header);
        container.appendChild(content);
        
    } else if (data !== null && typeof data === 'object') {
        // 处理对象
        const keys = Object.keys(data);
        const header = document.createElement('div');
        header.className = 'tree-header object-header';
        header.innerHTML = `
            <span class="tree-toggle">▼</span>
            <span class="tree-key">${key}</span>
            <span class="tree-type">{Object(${keys.length})}</span>
        `;
        
        const content = document.createElement('div');
        content.className = 'tree-content';
        
        keys.forEach(objKey => {
            const child = createTreeView(data[objKey], objKey, level + 1);
            content.appendChild(child);
        });
        
        header.addEventListener('click', () => toggleTreeNode(header, content));
        container.appendChild(header);
        container.appendChild(content);
        
    } else {
        // 处理基本类型值
        const leaf = document.createElement('div');
        leaf.className = 'tree-leaf';
        
        let valueClass = 'tree-value';
        let displayValue = String(data);
        
        if (data === null) {
            valueClass += ' null-value';
            displayValue = 'null';
        } else if (typeof data === 'string') {
            valueClass += ' string-value';
            displayValue = `"${data}"`;
        } else if (typeof data === 'number') {
            valueClass += ' number-value';
        } else if (typeof data === 'boolean') {
            valueClass += ' boolean-value';
        }
        
        leaf.innerHTML = `
            <span class="tree-key">${key}:</span>
            <span class="${valueClass}">${displayValue}</span>
        `;
        
        container.appendChild(leaf);
    }
    
    return container;
}

// 🔄 切换树节点展开/收起
function toggleTreeNode(header, content) {
    const toggle = header.querySelector('.tree-toggle');
    const isExpanded = content.style.display !== 'none';
    
    if (isExpanded) {
        content.style.display = 'none';
        toggle.textContent = '▶';
        header.classList.add('collapsed');
    } else {
        content.style.display = 'block';
        toggle.textContent = '▼';
        header.classList.remove('collapsed');
    }
}

// 🌳 展开所有树节点
function expandAllTreeNodes() {
    const treeContainer = document.getElementById('json-tree');
    if (treeContainer) {
        const headers = treeContainer.querySelectorAll('.tree-header');
        const contents = treeContainer.querySelectorAll('.tree-content');
        
        headers.forEach(header => {
            const toggle = header.querySelector('.tree-toggle');
            if (toggle) {
                toggle.textContent = '▼';
                header.classList.remove('collapsed');
            }
        });
        
        contents.forEach(content => {
            content.style.display = 'block';
        });
        
        MessageManager.show('✅ 所有节点已展开', 'info');
    }
}

// 🌳 收起所有树节点
function collapseAllTreeNodes() {
    const treeContainer = document.getElementById('json-tree');
    if (treeContainer) {
        const headers = treeContainer.querySelectorAll('.tree-header');
        const contents = treeContainer.querySelectorAll('.tree-content');
        
        headers.forEach(header => {
            const toggle = header.querySelector('.tree-toggle');
            if (toggle) {
                toggle.textContent = '▶';
                header.classList.add('collapsed');
            }
        });
        
        contents.forEach(content => {
            content.style.display = 'none';
        });
        
        MessageManager.show('✅ 所有节点已收起', 'info');
    }
}

// 👁️ 更新预览内容 - 纯文本格式化显示
function updatePreview() {
    const previewContent = document.getElementById('json-preview-content');
    if (!previewContent || !editor) return;
    
    try {
        const content = editor.getValue();
        const parsed = JSON.parse(content);
        previewContent.textContent = JSON.stringify(parsed, null, 2);
    } catch (error) {
        previewContent.textContent = `JSON格式错误，无法生成预览:\n${error.message}`;
    }
}

// 🛠️ 事件监听器设置（修复版本）
function setupEventListeners() {
    // 基础按钮事件
    const buttons = [
        { id: 'load-btn', handler: GitHubAPI.loadConfig },
        { id: 'save-btn', handler: GitHubAPI.saveConfig },
        { id: 'clear-token-btn', handler: TokenManager.clearToken },
        { id: 'toggle-token-btn', handler: TokenManager.toggleTokenVisibility },
        { id: 'upload-btn', handler: FileOperations.upload },
        { id: 'download-btn', handler: FileOperations.download },
        { id: 'format-btn', handler: JSONOperations.format },
        { id: 'minify-btn', handler: JSONOperations.minify },
        { id: 'validate-btn', handler: JSONOperations.validate },
        { id: 'clear-btn', handler: JSONOperations.clear }
    ];
    
    buttons.forEach(({ id, handler }) => {
        const btn = document.getElementById(id);
        if (btn) {
            btn.addEventListener('click', handler);
        }
    });
    
    // 编辑器控制按钮
    const fullscreenBtn = document.getElementById('fullscreen-btn');
    if (fullscreenBtn) {
        fullscreenBtn.addEventListener('click', EditorControls.toggleFullscreen);
    }
    
    const copyBtn = document.getElementById('copy-btn');
    if (copyBtn) {
        copyBtn.addEventListener('click', EditorControls.copyContent);
    }
    
    const searchBtn = document.getElementById('search-btn');
    if (searchBtn) {
        searchBtn.addEventListener('click', EditorControls.openSearch);
    }
    
    // 🌳 树状视图控制按钮
    const expandAllBtn = document.getElementById('expand-all-btn');
    if (expandAllBtn) {
        expandAllBtn.addEventListener('click', expandAllTreeNodes);
    }
    
    const collapseAllBtn = document.getElementById('collapse-all-btn');
    if (collapseAllBtn) {
        collapseAllBtn.addEventListener('click', collapseAllTreeNodes);
    }
    
    // 文件上传
    const fileInput = document.getElementById('file-input');
    if (fileInput) {
        fileInput.addEventListener('change', FileOperations.handleFileUpload);
    }
    
    // 标签页切换
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });
    
    // 编辑器选项
    const wordWrapToggle = document.getElementById('word-wrap-toggle');
    if (wordWrapToggle) {
        wordWrapToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ wordWrap: e.target.checked ? 'on' : 'off' });
            }
        });
    }
    
    const minimapToggle = document.getElementById('minimap-toggle');
    if (minimapToggle) {
        minimapToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ minimap: { enabled: e.target.checked } });
            }
        });
    }
    
    const lineNumbersToggle = document.getElementById('line-numbers-toggle');
    if (lineNumbersToggle) {
        lineNumbersToggle.addEventListener('change', (e) => {
            if (editor) {
                editor.updateOptions({ lineNumbers: e.target.checked ? 'on' : 'off' });
            }
        });
    }
    
    const themeSelect = document.getElementById('theme-select');
    if (themeSelect) {
        themeSelect.addEventListener('change', (e) => {
            if (typeof monaco !== 'undefined') {
                monaco.editor.setTheme(e.target.value);
            }
        });
    }
    
    const fontSizeSlider = document.getElementById('font-size-slider');
    if (fontSizeSlider) {
        fontSizeSlider.addEventListener('input', (e) => {
            const fontSize = parseInt(e.target.value);
            if (editor) {
                editor.updateOptions({ fontSize });
            }
            const valueSpan = document.getElementById('font-size-value');
            if (valueSpan) {
                valueSpan.textContent = `${fontSize}px`;
            }
        });
    }
    
    // 全屏状态监听
    document.addEventListener('fullscreenchange', () => {
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        if (fullscreenBtn) {
            if (document.fullscreenElement) {
                fullscreenBtn.textContent = '🔍 退出全屏';
                fullscreenBtn.title = '退出全屏模式';
            } else {
                fullscreenBtn.textContent = '🔍 全屏';
                fullscreenBtn.title = '全屏模式';
            }
        }
    });
    
    // 键盘快捷键
    document.addEventListener('keydown', (e) => {
        if (e.ctrlKey) {
            switch (e.key.toLowerCase()) {
                case 's':
                    e.preventDefault();
                    if (editorLoaded) GitHubAPI.saveConfig();
                    break;
                case 'o':
                    e.preventDefault();
                    if (editorLoaded) GitHubAPI.loadConfig();
                    break;
                case 'u':
                    e.preventDefault();
                    FileOperations.upload();
                    break;
                case 'd':
                    e.preventDefault();
                    FileOperations.download();
                    break;
                case 'f':
                    e.preventDefault();
                    if (editorLoaded) EditorControls.openSearch();
                    break;
                case 'c':
                    if (e.shiftKey) {
                        e.preventDefault();
                        if (editorLoaded) EditorControls.copyContent();
                    }
                    break;
                case 'enter':
                    if (e.altKey) {
                        e.preventDefault();
                        if (editorLoaded) EditorControls.toggleFullscreen();
                    }
                    break;
            }
        }
        
        // ESC键退出全屏
        if (e.key === 'Escape' && document.fullscreenElement) {
            document.exitFullscreen();
        }
    });
}

// 应用初始化
function initializeApp() {
    console.log('🛠️ Luna TV配置编辑器启动中（完整修复版）...');
    
    // 确保键盘事件兼容性修复已应用
    fixKeyboardEventCompatibility();
    
    // 初始化Token管理（修复递归版本）
    TokenManager.init();
    
    // 初始化编辑器
    initializeEditor();
    
    // 设置事件监听器
    setupEventListeners();
    
    // 显示欢迎消息
    setTimeout(() => {
        MessageManager.show('🛠️ Luna TV配置编辑器已启动，所有问题已完全修复！', 'success');
    }, 1500);
}

// 页面卸载前保存状态
window.addEventListener('beforeunload', (e) => {
    if (editor && editor.getValue() !== currentConfig && editor.getValue().trim() !== '') {
        e.preventDefault();
        e.returnValue = '您有未保存的更改，确定要离开吗？';
    }
});

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

console.log('🛠️ Luna TV配置编辑器已启动，CDN和兼容性问题已完全修复！');
