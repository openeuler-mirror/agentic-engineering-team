# 代码坏味道：命名与可读性问题检测参考

## 适用场景
- 代码审查命名规范
- 函数/类职责评估

---

## 一、神秘命名（Mysterious Name）

### 特征识别
- 变量/函数/类名为单字母（`d`, `x`, `tmp`）或无意义缩写（`usrMgr`, `proc`）
- 名称无法传达其用途（`data`, `info`, `flag`, `handle`）
- 布尔变量命名为名词而非形容词/谓词（`error` vs `hasError`）

### 检测规则
```
严重程度：轻微
检测模式：
  - 变量名长度 <= 2 且不在循环计数器位置（i, j, k 除外）
  - 命名含 temp/tmp/data/info/flag/obj/item/val/res 但无修饰词
  - 函数名为动词+无意义名词（doProcess, handleData, manageItem）
```

### 示例
```java
// 坏味道
int d;            // 天数？距离？直径？
boolean flag;     // 什么标志？
void proc();      // 处理什么？

// 改进
int elapsedDays;
boolean isUserActive;
void sendWelcomeEmail();
```

---

## 二、过长的函数（Long Method）

### 特征识别
- 函数体超过 20-30 行
- 包含 3 层以上的嵌套（if/for/while 嵌套）
- 函数内注释分隔了多个逻辑段落（"// Step 1..." "// Step 2..."）
- 函数名含 `And`（表明承担了多个职责）

### 检测规则
```
严重程度：严重
检测模式：
  - 函数行数 > 30 行（包含空行注释）
  - 嵌套深度 > 3 层
  - 圈复杂度 > 10
  - 函数内有多处 return 且逻辑差异较大
```

### 示例
```java
// 坏味道：过长函数，包含多个职责
public void processOrder(Order order) {
    // 验证
    if (order == null) throw new NullPointerException();
    if (order.getItems().isEmpty()) throw new IllegalArgumentException();
    // ... 10行验证逻辑

    // 计算价格
    double total = 0;
    for (Item item : order.getItems()) {
        // ... 15行价格计算逻辑
    }

    // 发送邮件
    // ... 10行邮件发送逻辑

    // 持久化
    // ... 10行数据库操作
}

// 改进：提取子函数
public void processOrder(Order order) {
    validateOrder(order);
    double total = calculateTotal(order);
    sendConfirmationEmail(order, total);
    saveOrder(order, total);
}
```

### 重构建议
- 提取方法（Extract Method）：将逻辑段落提取为独立函数
- 使用卫语句（Guard Clauses）减少嵌套层数
- 分离关注点：验证/业务逻辑/持久化分离
