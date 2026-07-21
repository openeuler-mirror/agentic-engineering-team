# 敏感信息泄露检测参考

## 适用场景
- 代码中存在日志打印、异常处理、错误输出
- 配置文件包含密钥、密码等敏感数据
- API 响应中包含内部信息

---

## 一、敏感信息泄露（Sensitive Data Exposure）

### 漏洞原理
程序将敏感信息（密码、密钥、内部路径、数据库结构等）写入日志、错误响应或配置文件，导致攻击者获取权限提升所需信息。

---

## 二、日志/错误信息泄露

### 检测方法
1. **搜索日志输出**：`logger.info()`, `logger.debug()`, `printStackTrace()`, `System.out.println()`, `console.log()`, `print()`
2. **检查输出内容是否包含**：
   - 完整异常堆栈（包含 SQL 语句、内部文件路径、类名）
   - 用户密码（明文或哈希值）
   - Session Token、JWT、API Key
   - 数据库连接字符串
   - 完整请求/响应体（可能包含敏感字段）
3. **检查错误响应**：HTTP 错误响应是否向客户端暴露堆栈信息

### 高风险模式
```java
// 危险：打印完整异常（含 SQL、路径）
catch (Exception e) {
    e.printStackTrace();  // 控制台输出，可能被日志系统收集
    return "Error: " + e.getMessage();  // 直接返回给客户端
}

// 危险：记录密码
logger.info("User login: username={}, password={}", username, password);

// 修复：只记录必要信息，错误返回通用提示
catch (Exception e) {
    logger.error("Login failed for user: {}", username, e);  // 后端记录完整
    return ResponseEntity.status(500).body("Internal server error");  // 前端通用
}
```

---

## 三、配置文件泄露

### 检测方法
1. **检查版本控制**：`.env`, `application.properties`, `config.yaml`, `settings.py`, `database.yml` 是否被提交到代码仓库
2. **检查 `.gitignore`**：上述文件是否被排除在版本控制之外
3. **检查硬编码凭证**：
   - 搜索 `password =`, `api_key =`, `secret =`, `token =`, `ACCESS_KEY`
   - 是否为明文硬编码而非环境变量引用

### 高风险模式
```python
# 危险：硬编码密钥
DATABASE_URL = "postgresql://admin:Password123@db.example.com/prod"
AWS_SECRET_KEY = "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY"

# 修复：使用环境变量
import os
DATABASE_URL = os.environ.get("DATABASE_URL")
AWS_SECRET_KEY = os.environ.get("AWS_SECRET_KEY")
```

---

## 四、API 响应中的信息泄露

### 检测方法
1. **检查错误响应格式**：是否返回含技术细节的错误（数据库错误、堆栈跟踪）
2. **检查用户数据接口**：是否返回了不必要的敏感字段（password_hash、internal_id、admin_flag）
3. **检查 HTTP 响应头**：`Server: Apache/2.4.1`, `X-Powered-By: PHP/7.2` 等暴露技术栈的头

### 修复建议
- 统一错误响应格式，生产环境关闭详细错误
- 使用 DTO/序列化白名单控制返回字段
- 移除泄露服务器信息的 HTTP 响应头

---

## 五、不安全的加密/哈希算法

### 适用场景：代码中有加密或哈希操作

### 危险算法
| 类型 | 危险算法 | 安全替代 |
|------|---------|---------|
| 哈希（密码存储） | MD5, SHA-1, SHA-256（无盐） | bcrypt, scrypt, Argon2 |
| 对称加密 | DES, 3DES, RC4 | AES-256-GCM |
| 非对称加密 | RSA-1024, DSA-1024 | RSA-2048+, ECC |
| 随机数 | `Math.random()`, `rand()` | 密码学安全随机数生成器 |

### 检测方法
1. 搜索 `MD5`, `SHA1`, `DES`, `RC4`, `Math.random()`
2. 检查密码存储是否使用了 bcrypt/Argon2（而非直接哈希）
3. 检查是否存在自研加密算法（安全性不可验证）
4. 检查密钥长度是否满足最低要求

### 漏洞示例
```python
# 危险：MD5 存储密码
import hashlib
password_hash = hashlib.md5(password.encode()).hexdigest()

# 修复：bcrypt
import bcrypt
password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt())
```
