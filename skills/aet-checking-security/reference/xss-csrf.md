# XSS & CSRF 漏洞检测参考

## 适用场景
- 代码中存在 HTML 输出点（echo、innerHTML、模板渲染等）
- 存在状态变更接口（表单提交、API 写操作）

---

## 一、XSS（跨站脚本攻击）

### 漏洞原理
用户可控输入未经转义直接插入 HTML 输出，攻击者注入恶意脚本在受害者浏览器中执行。

### 危险 Sink 函数（按语言）

| 语言 | 危险函数/写法 |
|------|-------------|
| PHP | `echo $var`, `print $var`, `<?= $var ?>` |
| Java | `response.getWriter().write(var)`, JSP `<%= var %>`, Thymeleaf `th:utext` |
| Python | `render_template_string(template)`, Jinja2 `{{ var \| safe }}` |
| JavaScript | `element.innerHTML = var`, `document.write(var)`, `outerHTML`, `insertAdjacentHTML` |

### 检测方法
1. **定位输出点**：搜索上述危险函数，记录输出变量名
2. **追溯数据来源**：变量是否直接/间接来自用户输入（`$_GET`, `request.getParameter()`, `req.body`, `req.query`）
3. **检查净化措施**：
   - HTML上下文：是否调用 `htmlspecialchars()` / `HtmlEncoder.encode()` / `escapeHtml()`
   - JS上下文：是否使用 `textContent` 替代 `innerHTML`
   - 属性上下文：是否对属性值做引号转义
4. **DOM-XSS 特检**：关注 `location.hash`, `document.URL`, `document.referrer` 等直接写入 DOM 的场景

### 验证示例
```
Payload: <script>alert(1)</script>
预期：被编码为 &lt;script&gt;alert(1)&lt;/script&gt; 输出 → 安全
实际：原样输出 → 存在 XSS
```

### 修复建议
- 根据输出上下文使用对应的编码函数
- 富文本场景使用白名单 HTML 过滤库（如 DOMPurify、jsoup）
- 设置 CSP 响应头作为纵深防御

---

## 二、CSRF（跨站请求伪造）

### 漏洞原理
攻击者诱导已登录用户访问恶意页面，利用浏览器自动携带 Cookie 的机制，以用户身份发起伪造请求。

### 检测方法
1. **识别状态变更接口**：POST/PUT/DELETE 接口，或 GET 接口执行写操作
2. **检查 Token 机制**：
   - 请求中是否携带 CSRF Token（表单隐藏字段、请求头）
   - 服务端是否验证 Token 有效性且与 Session 绑定
3. **检查 Referer/Origin 验证**：服务端是否校验请求头来源（非主要防护手段）
4. **检查 SameSite Cookie**：Cookie 是否设置 `SameSite=Strict` 或 `SameSite=Lax`
5. **框架内置防护**：使用的框架（Spring Security、Django CSRF middleware）是否已启用且未被 `@CsrfExempt` 等注解绕过

### 高风险特征
- 接口仅用 Cookie 鉴权，无额外 Token 验证
- 框架 CSRF 保护被全局禁用（`csrf().disable()`、`MIDDLEWARE` 中移除 `CsrfViewMiddleware`）

### 修复建议
- 所有状态变更接口强制验证 CSRF Token
- 配合 `SameSite=Strict` Cookie 属性
- 敏感操作额外要求二次验证
