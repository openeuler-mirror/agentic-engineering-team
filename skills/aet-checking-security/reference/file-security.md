# 文件安全漏洞检测参考

## 适用场景
- 代码中存在文件读取、写入、包含、上传操作
- 路径参数中包含用户可控变量

---

## 一、路径遍历（Path Traversal）

### 漏洞原理
用户可控的文件路径未经过滤，攻击者利用 `../` 序列跳出限定目录，读取或写入任意文件。

### 危险函数

| 语言 | 危险函数 |
|------|---------|
| Java | `new File(basePath + userInput)`, `FileInputStream(path)` |
| Python | `open(path)`, `os.path.join(base, user_input)` |
| PHP | `fopen()`, `file_get_contents()`, `readfile()`, `include $file` |
| Node.js | `fs.readFile(path)`, `fs.createReadStream(path)` |

### 检测方法
1. 搜索文件操作函数，检查路径参数是否含用户变量
2. 检查是否使用了路径规范化：
   - Java: `Paths.get(base).resolve(input).normalize()` 后检查是否以 base 开头
   - Python: `os.path.realpath()` 后校验前缀
3. 检查是否过滤了 `../`、`..\\`、URL 编码 `%2e%2e%2f`

### 漏洞示例
```python
# 漏洞
@app.route('/download')
def download():
    filename = request.args.get('file')
    path = '/var/app/files/' + filename  # 攻击：file=../../etc/passwd
    return open(path).read()

# 修复
import os
@app.route('/download')
def download():
    filename = request.args.get('file')
    safe_base = '/var/app/files'
    path = os.path.realpath(os.path.join(safe_base, filename))
    if not path.startswith(safe_base + os.sep):
        abort(403)
    return open(path).read()
```

### 验证方法
- Payload: `../../../etc/passwd`、`..%2F..%2Fetc%2Fpasswd`
- 检查响应是否包含系统文件内容

---

## 二、文件上传漏洞

### 漏洞原理
上传接口未对文件类型、内容严格校验，攻击者上传 WebShell 或恶意文件。

### 检测方法
1. **搜索上传处理代码**：`MultipartFile`, `$_FILES`, `request.files`
2. **检查校验层次**：
   - 前端校验（不可信，可绕过）
   - 后端扩展名校验（黑名单 → 白名单更安全）
   - MIME 类型校验（可伪造，作为辅助）
   - 文件头（Magic Number）校验（更可靠）
3. **检查文件存储**：
   - 是否将上传文件存储在 Web 可访问目录
   - 文件名是否重命名为随机名称（防止覆盖和猜测）
   - 是否限制了上传目录的执行权限
4. **检查内容过滤**：图片文件是否进行了图片重绘（防止图片马）

### 高风险特征
- 仅在前端用 JavaScript 校验文件扩展名
- 允许上传 `.php`, `.jsp`, `.aspx`, `.html` 等可执行文件
- 上传后文件保持原始文件名

### 验证方法
- 上传 `shell.php` 或修改 Content-Type 绕过 MIME 检测
- 上传包含 PHP 代码的图片文件（图片马）

---

## 三、本地文件包含（LFI）

### 适用语言：主要是 PHP

### 危险函数
`include()`, `require()`, `include_once()`, `require_once()`

### 检测方法
1. 搜索上述函数，检查文件名是否含用户可控变量
2. 检查是否过滤了路径遍历字符和协议头（`php://`, `data://`, `zip://`）
3. PHP 配置：是否开启 `allow_url_include`（远程文件包含 RFI 前提）

### 漏洞示例
```php
// 漏洞
$page = $_GET['page'];
include("pages/" . $page . ".php");
// 攻击：page=../../etc/passwd%00（截断后缀）

// 修复：白名单校验
$allowed = ['home', 'about', 'contact'];
$page = $_GET['page'];
if (!in_array($page, $allowed)) {
    die("Invalid page");
}
include("pages/" . $page . ".php");
```
