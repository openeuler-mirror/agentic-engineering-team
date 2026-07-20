# 命令注入 & 代码注入 & 反序列化漏洞检测参考

## 适用场景
- 代码中调用系统命令（exec、system、shell 等）
- 使用 eval 或动态代码执行函数
- 存在反序列化操作

---

## 一、命令注入（OS Command Injection）

### 漏洞原理
用户可控输入被拼接进系统命令字符串，导致攻击者可执行任意 shell 命令。

### 危险 Sink 函数

| 语言 | 危险函数 |
|------|---------|
| Java | `Runtime.exec(string)`, `ProcessBuilder(string)` |
| Python | `os.system()`, `subprocess.call(..., shell=True)`, `subprocess.Popen(..., shell=True)` |
| PHP | `exec()`, `system()`, `shell_exec()`, `passthru()`, 反引号 `` `cmd` `` |
| Node.js | `child_process.exec()`, `child_process.execSync()` |
| C# | `Process.Start()` with user input |

### 检测方法
1. **定位危险函数**：搜索上表关键词
2. **检查参数来源**：命令字符串是否拼接了用户可控变量
3. **区分安全/危险调用方式**：
   - **危险**：`subprocess.call("ping " + host, shell=True)`
   - **安全**：`subprocess.call(["ping", host])` — 列表形式，OS 直接传参，无 shell 解析
4. **检查白名单校验**：是否对允许的命令值做严格白名单限制
5. **特殊情况**：`Runtime.exec(String[])` 相对安全，`Runtime.exec(String)` 危险

### 漏洞示例
```python
# 漏洞
import subprocess
def ping(host):
    output = subprocess.check_output("ping -c 1 " + host, shell=True)
    # 攻击：host = "127.0.0.1; cat /etc/passwd"

# 修复
def ping(host):
    output = subprocess.check_output(["ping", "-c", "1", host])
```

### 验证方法
- Payload: `127.0.0.1; id`、`127.0.0.1 | whoami`、`127.0.0.1 && cat /etc/passwd`
- 检查响应是否包含命令执行输出

---

## 二、代码注入（Code Injection）

### 危险函数

| 语言 | 危险函数 |
|------|---------|
| JavaScript | `eval(code)`, `new Function(code)`, `setTimeout(string)`, `setInterval(string)` |
| Python | `eval(expr)`, `exec(code)`, `compile(code)` |
| PHP | `eval()`, `assert(string)`, `preg_replace('/pattern/e', ...)` |

### 检测方法
1. 搜索 `eval(` 关键词
2. 检查传入 eval 的参数是否包含用户可控数据（无论直接还是间接）
3. 确认是否有沙箱/限制（通常不可信）

### 漏洞示例
```javascript
// 漏洞
app.get('/calc', (req, res) => {
    const result = eval(req.query.expr);  // 任意代码执行
    res.json({ result });
});

// 修复：使用安全表达式解析库
const math = require('mathjs');
app.get('/calc', (req, res) => {
    const result = math.evaluate(req.query.expr);
    res.json({ result });
});
```

---

## 三、反序列化漏洞（Insecure Deserialization）

### 危险函数

| 语言 | 危险函数 |
|------|---------|
| Java | `ObjectInputStream.readObject()` |
| Python | `pickle.loads()`, `yaml.load(data)` (unsafe loader) |
| PHP | `unserialize()` |
| .NET | `BinaryFormatter.Deserialize()`, `JavaScriptSerializer` |
| Ruby | `Marshal.load()` |

### 检测方法
1. **定位反序列化调用**：搜索上述函数
2. **检查数据来源**：反序列化的数据是否来自用户输入（请求体、Cookie、URL 参数）
3. **检查依赖库版本**：
   - Java：检查 `pom.xml`/`build.gradle` 中 Commons Collections、Fastjson、Jackson 版本，对比 CVE 列表
   - Python：检查是否使用 `yaml.safe_load()` 替代 `yaml.load()`
4. **检查白名单过滤**：Java 是否使用 `ValidatingObjectInputStream` 限制可反序列化的类

### 漏洞示例
```python
# 漏洞：反序列化用户传入的 Cookie
import pickle, base64
def get_profile():
    data = base64.b64decode(request.cookies.get('session'))
    user = pickle.loads(data)  # 攻击者可构造恶意 pickle 对象执行命令
    return user.name

# 修复：使用 JWT 或 HMAC 签名的会话数据
```

### 验证方法
- Python：构造 `__reduce__` 返回 `os.system` 的恶意 pickle 对象
- Java：使用 ysoserial 工具生成 Payload
