# SQL 注入漏洞检测参考

## 适用场景
- 代码中有数据库查询操作
- SQL 语句中包含用户可控变量

---

## 一、SQL 注入（SQL Injection）

### 漏洞原理
用户可控输入未经参数化直接拼接进 SQL 语句，攻击者通过构造特殊字符改变 SQL 语义，读取/修改/删除数据库数据。

### 检测方法

#### 第一步：定位数据库操作代码
搜索关键词：`execute(`, `query(`, `createQuery(`, `nativeQuery`, `$db->query`

#### 第二步：识别拼接模式（危险）
```java
// 危险：+ 拼接
String sql = "SELECT * FROM users WHERE id = '" + userId + "'";

// 危险：格式化
String sql = String.format("SELECT * FROM users WHERE name = '%s'", name);
```
```python
# 危险：% 格式化
query = "SELECT * FROM users WHERE id = %d" % user_id  # 整数也可能被利用
query = "SELECT * FROM users WHERE name = '" + name + "'"
```
```xml
<!-- 危险：MyBatis ${}直接拼接 -->
<select id="findUser">
  SELECT * FROM users WHERE name = '${name}'
</select>
```

#### 第三步：确认安全写法
| 语言/框架 | 安全写法 |
|---------|---------|
| Java JDBC | `PreparedStatement` + `setString(index, value)` |
| Python | `cursor.execute("WHERE id=%s", (user_id,))` |
| PHP | PDO `prepare()` + `bindParam()` |
| .NET | `SqlCommand` + `Parameters.Add()` |
| MyBatis | `#{name}` 占位符（预编译） |
| Hibernate | `createQuery("WHERE name=:n").setParameter("n", name)` |
| Django | `Model.objects.filter(name=name)` |

#### 第四步：ORM 特殊危险场景
即使使用了 ORM，以下用法仍然危险：
- MyBatis `${}` 内容：ORDER BY 动态排序（`ORDER BY ${column}` 需白名单）
- Django `extra(where=["name='%s'" % name])`
- SQLAlchemy `text("WHERE id=" + user_id).execute()`

### 注入类型
| 类型 | 特征 | 检测手段 |
|------|------|---------|
| 联合注入 | `UNION SELECT` | 观察响应中额外数据 |
| 报错注入 | 错误信息包含 DB 结构 | 检查是否暴露异常堆栈 |
| 布尔盲注 | 条件真/假返回不同结果 | `AND 1=1` vs `AND 1=2` |
| 时间盲注 | 通过延迟判断 | `AND SLEEP(5)` |
| 二阶注入 | 数据存入DB后再次使用时注入 | 追踪数据的完整生命周期 |

### 漏洞示例
```java
// 漏洞
public User login(String user, String pass) {
    String sql = "SELECT * FROM users WHERE user='" + user
               + "' AND pass='" + pass + "'";
    // 攻击：user = "' OR '1'='1" -- 绕过密码验证
    return jdbcTemplate.queryForObject(sql, User.class);
}

// 修复
public User login(String user, String pass) {
    String sql = "SELECT * FROM users WHERE user=? AND pass=?";
    return jdbcTemplate.queryForObject(sql, User.class, user, pass);
}
```

### 验证方法
- 基础 Payload：`' OR 1=1 --`、`'; DROP TABLE test; --`
- 用 sqlmap 自动化扫描
- 检查错误信息是否泄露表结构、字段名
