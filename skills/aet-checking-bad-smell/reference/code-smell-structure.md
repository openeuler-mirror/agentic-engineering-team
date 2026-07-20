# 代码坏味道：结构性问题检测参考

## 适用场景
- 检测重复代码、过长参数列表、全局数据滥用

---

## 一、重复代码（Duplicated Code）

### 特征识别
- 相同或高度相似的代码块出现在多处
- 修改一处逻辑时需要同步修改多处
- Copy-paste 痕迹明显（仅改了变量名）

### 检测规则
```
严重程度：严重
检测模式：
  - 相同逻辑出现 >= 2 次（超过 5 行的相似代码块）
  - 相同的条件判断逻辑分散在多个方法中
  - 相同的错误处理/日志记录模式重复出现
```

### 重复类型
| 类型 | 位置 | 重构手段 |
|------|------|---------|
| 同一类内重复 | 同类两个方法 | 提取方法 |
| 兄弟类重复 | 继承层次的兄弟类 | 提取到父类 |
| 无关类重复 | 不同模块 | 提取工具类/服务 |

### 示例
```java
// 坏味道：重复的折扣计算逻辑
public double calculateGoldDiscount(double amount) {
    double discount = amount * 0.1;
    if (amount > 1000) discount = discount * 0.9;
    return discount;
}

public double calculateSilverDiscount(double amount) {
    double discount = amount * 0.05;
    if (amount > 1000) discount = discount * 0.9;  // 重复的大额折扣逻辑
    return discount;
}

// 改进：提取公共逻辑
private double applyLargePurchaseDiscount(double discount, double amount) {
    return amount > 1000 ? discount * 0.9 : discount;
}
```

---

## 二、过长参数列表（Long Parameter List）

### 特征识别
- 函数参数超过 3-4 个
- 多个参数总是一起传递（暗示应封装为对象）
- 存在大量 `null` 占位参数

### 检测规则
```
严重程度：中等
检测模式：
  - 函数参数个数 > 4
  - 多个同类型参数相邻（容易传错顺序）
  - 参数列表含布尔值（标志参数，见控制流问题）
```

### 示例
```java
// 坏味道：7个参数
public void createUser(String name, String email, String phone,
                       String address, String city, String country, int age) {
    // ...
}

// 改进：引入参数对象
public void createUser(UserProfile profile) {
    // ...
}
```

---

## 三、全局数据（Global Data）

### 特征识别
- 模块级全局变量或类级静态可变字段
- 单例模式持有大量可变状态
- 多处代码直接读写同一个全局变量

### 检测规则
```
严重程度：中等
检测模式：
  - public static 可变字段（非常量）
  - 全局状态通过单例传递（Singleton with mutable state）
  - 测试用例需要 setUp/tearDown 重置全局状态
```

### 示例
```java
// 坏味道：全局可变状态
public class AppConfig {
    public static String currentUser = "";  // 任何地方可修改，导致隐式依赖
    public static List<String> errors = new ArrayList<>();
}

// 改进：通过依赖注入传递上下文
public class UserService {
    private final UserContext userContext;  // 通过构造函数注入
    public UserService(UserContext userContext) {
        this.userContext = userContext;
    }
}
```

---

## 四、数据泥团（Data Clumps）

### 特征识别
- 3 个以上的数据项总是一起出现
- 多个函数接受相同的一组参数
- 删除其中一个参数，其他参数就没有意义

### 示例
```java
// 坏味道：x, y, width, height 总是一起出现
void draw(int x, int y, int width, int height) {}
void resize(int x, int y, int width, int height) {}

// 改进：封装为 Rectangle 对象
void draw(Rectangle rect) {}
void resize(Rectangle rect) {}
```
