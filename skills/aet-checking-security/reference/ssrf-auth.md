# SSRF & 身份验证 & 访问控制漏洞检测参考

## 适用场景
- 代码中有发起网络请求的逻辑
- 存在权限校验、Session/Token 认证
- 存在通过 ID 访问资源的接口

---

## 一、SSRF（服务器端请求伪造）

### 漏洞原理
服务端根据用户提供的 URL 发起网络请求，攻击者可利用其访问内网服务、云元数据接口或扫描内部网络。

### 危险函数

| 语言 | 危险函数 |
|------|---------|
| Java | `HttpURLConnection.openConnection(url)`, `HttpClient.execute(url)`, `URL.openStream()` |
| Python | `requests.get(url)`, `urllib.urlopen(url)`, `httpx.get(url)` |
| PHP | `curl_exec()`, `file_get_contents(url)` |
| Node.js | `http.get(url)`, `axios.get(url)`, `fetch(url)` |

### 检测方法
1. **定位 HTTP 客户端调用**：搜索上述函数
2. **追溯 URL 参数来源**：请求的目标 URL 是否全部或部分由用户输入控制
3. **检查 URL 过滤策略**：
   - 是否校验 URL 协议（仅允许 `http://`/`https://`，拒绝 `file://`, `gopher://`, `dict://`）
   - 是否校验目标 IP（拒绝 `127.0.0.1`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`）
   - 是否校验端口范围
   - DNS 重绑定防护：是否在请求前二次解析验证 IP

### 高风险场景
- URL 预览/截图功能
- Webhook 配置
- PDF/图片在线生成（传入 URL 抓取内容）
- 代理/转发功能

### 漏洞示例
```python
# 漏洞：用户可控 URL
@app.route('/fetch')
def fetch():
    url = request.args.get('url')
    resp = requests.get(url)  # 攻击：url=http://169.254.169.254/latest/meta-data/
    return resp.text

# 修复：白名单 + IP 段限制
import ipaddress, urllib.parse
ALLOWED_HOSTS = {'example.com', 'api.example.com'}
def is_safe_url(url):
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme not in ('http', 'https'):
        return False
    # 解析 IP 检查内网
    host = parsed.hostname
    try:
        ip = ipaddress.ip_address(host)
        if ip.is_private or ip.is_loopback:
            return False
    except ValueError:
        if host not in ALLOWED_HOSTS:
            return False
    return True
```

---

## 二、身份验证绕过

### 检测方法
1. **搜索权限校验代码**：`isAdmin()`, `hasRole()`, `@PreAuthorize`, `@RequiresPermission`
2. **检查校验是否完整**：
   - 接口是否缺少身份认证（未检查 Session/Token 有效性）
   - 是否存在可绕过的认证逻辑（如 URL 中含 `?admin=true`）
   - Token 有效性是否在服务端验证（而非仅在前端判断）
3. **JWT 特检**：
   - 是否接受 `alg: none`（无签名算法）
   - 是否严格验证签名
   - 是否校验 `exp`（过期时间）字段

### 高风险模式
```java
// 危险：权限校验被注释掉
public UserData getUserData(long userId) {
    // if (!currentUser.hasPermission("read_users")) throw new ForbiddenException();
    return userRepository.findById(userId);
}
```

---

## 三、不安全的直接对象引用（IDOR）

### 漏洞原理
接口通过用户可控的 ID 访问资源，服务端未验证当前用户是否有权访问该 ID 对应的资源。

### 检测方法
1. **识别资源访问接口**：`/api/orders/{id}`, `/api/users/{id}/profile`
2. **检查水平权限校验**：服务端是否验证 `resource.owner == currentUser`（而非仅验证用户已登录）
3. **检查垂直权限校验**：普通用户是否可访问管理员接口

### 漏洞示例
```java
// 漏洞：只验证登录，不验证所有权
@GetMapping("/orders/{orderId}")
public Order getOrder(@PathVariable Long orderId, @AuthenticationPrincipal User user) {
    return orderRepository.findById(orderId);  // 任意已登录用户可访问任意订单
}

// 修复：验证资源归属
@GetMapping("/orders/{orderId}")
public Order getOrder(@PathVariable Long orderId, @AuthenticationPrincipal User user) {
    Order order = orderRepository.findById(orderId);
    if (!order.getUserId().equals(user.getId())) {
        throw new ForbiddenException();
    }
    return order;
}
```

### 验证方法
- 用用户 A 的 Token 访问用户 B 的资源 ID
- 用普通用户 Token 访问管理员接口
