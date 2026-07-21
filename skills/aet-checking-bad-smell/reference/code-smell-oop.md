# 代码坏味道：面向对象与控制流问题检测参考

## 适用场景
- 检测大类、依恋情结、基本类型偏执、消息链、中间人
- 检测控制流问题：重复条件、嵌套过深、标志参数、Null 泛滥

---

## 一、大类（Large Class）

### 特征识别
- 类的字段数 > 15 个
- 类的方法数 > 20 个
- 类名含 `Manager`, `Handler`, `Processor`, `Utils`（暗示职责不清）
- 类同时承担数据存储、业务逻辑、IO 操作

### 检测规则
```
严重程度：严重
检测模式：
  - 类文件行数 > 300 行
  - 字段可分为不同的逻辑分组（暗示应拆分）
  - 部分字段仅被部分方法使用
```

### 重构建议
- 按职责拆分（单一职责原则）
- 提取子类或相关类
- 将内聚的字段和方法提取为独立类

---

## 二、依恋情结（Feature Envy）

### 特征识别
- 函数频繁调用另一个类的 getter/setter
- 函数使用的数据大多来自其他类而非自身
- 函数更适合放在另一个类中

### 示例
```java
// 坏味道：Invoice 过度依赖 Order 的数据
class Invoice {
    public double calculateTotal(Order order) {
        return order.getPrice() * order.getQuantity() + order.getTax();
        // 这个方法应该在 Order 类中
    }
}

// 改进：将方法移到 Order 类
class Order {
    public double calculateTotal() {
        return this.price * this.quantity + this.tax;
    }
}
```

---

## 三、基本类型偏执（Primitive Obsession）

### 特征识别
- 用 String 表示电话号码、货币、日期范围
- 用 int/long 表示枚举值（魔法数字）
- 用数组/列表代替应该是对象的数据结构

### 示例
```java
// 坏味道
String phoneNumber = "13800138000";
int userType = 1;  // 1=admin, 2=user, 3=guest

// 改进
PhoneNumber phoneNumber = new PhoneNumber("13800138000");
UserType userType = UserType.ADMIN;  // 枚举类型
```

---

## 四、过长消息链（Message Chains）

### 特征识别
- 连续调用 `.getX().getY().getZ().doSomething()`
- 链式调用超过 3 层
- 导致代码与中间对象结构紧密耦合

### 检测规则
```
严重程度：轻微
检测模式：
  - 方法链长度 > 3（例：a.b().c().d().e()）
  - 链中包含 get 方法（暗示破坏了迪米特法则）
```

### 示例
```java
// 坏味道
String city = order.getCustomer().getAddress().getCity().getName();

// 改进：引入中间方法，隐藏委托关系
String city = order.getCustomerCity();
```

---

## 五、控制流问题

### 5.1 嵌套过深（Nested Loops / Deep Nesting）
```
严重程度：中等
检测模式：代码缩进层级 > 4 层
重构手段：提前返回（Guard Clause）、提取函数、使用 Stream/函数式
```

### 5.2 标志参数（Flag Argument）
```
严重程度：中等
检测模式：函数接受 boolean 参数控制行为
```
```java
// 坏味道
render(page, true, false);  // 含义不明的 true/false

// 改进：拆分为两个函数
renderWithHeader(page);
renderWithoutHeader(page);
```

### 5.3 Null 检查泛滥（Null Check Proliferation）
```
严重程度：中等
检测模式：同一变量在多处重复检查 null
重构手段：Optional 模式、空对象模式（Null Object Pattern）
```

### 5.4 重复条件判断（Repeated Conditional）
```
严重程度：中等
检测模式：相同条件表达式（if user.isAdmin()）在多处出现
重构手段：多态替代条件、提取策略对象
```

---

## 六、中间人（Middle Man）

### 特征识别
- 类中大多数方法只是简单委托给另一个对象
- getter/setter 没有任何实际逻辑，只是转发

### 检测规则
```
严重程度：轻微
检测模式：类中 > 50% 的方法是单行委托调用
```

### 示例
```java
// 坏味道：Department 只是转发给 Manager
class Department {
    Manager manager;
    public String getManagerName() { return manager.getName(); }
    public String getManagerEmail() { return manager.getEmail(); }
    public int getManagerAge() { return manager.getAge(); }
    // 所有方法都是简单委托...
}

// 改进：直接访问 manager 对象，或移除中间人
```
