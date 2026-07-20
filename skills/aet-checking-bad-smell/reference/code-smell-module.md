# 代码坏味道：模块依赖、注释与死代码检测参考

## 适用场景
- 检测模块间耦合问题
- 检测无用代码、过度注释
- 检测过度设计与技术债务

---

## 一、发散式变化（Divergent Change）

### 特征识别
- 一个类因为不同原因被修改
- 修改数据库结构需要改这个类，修改业务规则也需要改这个类
- 类承担了多种不相关的职责

### 检测规则
```
严重程度：中等
检测模式：
  - 类同时包含 IO 操作、业务逻辑、数据格式化
  - 类的修改历史 (git log) 涉及多个不相关的功能模块
```

### 重构建议：按变化原因拆分类，遵守单一职责原则

---

## 二、霰弹式修改（Shotgun Surgery）

### 特征识别
- 修改一个功能需要修改多个文件/类
- 相关逻辑分散在不同地方（与发散式变化相反）
- 新增一个字段需要在 5 个地方都加上

### 检测规则
```
严重程度：严重
检测模式：
  - 同一概念/规则散落在多个文件中
  - 修改 git commit 涉及大量文件变动（且都是小改动）
```

### 重构建议：将分散的相关逻辑合并到一个类/模块

---

## 三、过度设计（Speculative Generality）

### 特征识别
- 接口/抽象类只有一个实现
- 参数/配置项从未被实际使用
- 代码注释含"将来可能需要"、"预留扩展点"
- 过深的继承层次但每层几乎没有增加任何功能

### 检测规则
```
严重程度：轻微
检测模式：
  - 接口只有一个实现类且无扩展计划
  - 抽象方法在基类中有默认实现（空方法）
  - 方法参数从未在调用处传入非默认值
```

### 示例
```java
// 坏味道：过度抽象，只有一个实现
interface DataProcessor {
    void process(Data data);
}
abstract class AbstractDataProcessor implements DataProcessor {
    protected abstract void preProcess(Data data);
    protected abstract void postProcess(Data data);
}
class SimpleDataProcessor extends AbstractDataProcessor {
    // preProcess 和 postProcess 都是空方法
}

// 改进：直接使用普通类
class DataProcessor {
    void process(Data data) { ... }
}
```

---

## 四、被注释的代码（Commented-Out Code）

### 特征识别
- 大段被注释掉的代码块
- 注释代码中无解释原因
- 保留了多个版本的实现（注释了旧版，写了新版）

### 检测规则
```
严重程度：中等
检测模式：
  - 连续 3 行以上的注释代码块
  - TODO/FIXME 注释超过 30 天未处理
  - 注释中包含代码语法（赋值、方法调用等）
```

### 处理建议
- 不需要的代码直接删除（版本控制保存历史）
- 临时注释必须标注原因和计划恢复时间
- TODO 必须关联到 issue tracker

---

## 五、过度注释（Comments）

### 特征识别
- 注释解释"代码在做什么"而不是"为什么这样做"
- 变量名/函数名已经清晰表达，注释只是重复描述
- 废话注释：`// 增加 i` 对应 `i++`

### 检测规则
```
严重程度：轻微
检测模式：
  - 注释与紧邻代码内容完全重复
  - 每行代码都有行内注释
  - 函数内注释比代码多
```

### 好注释 vs 坏注释
```java
// 坏注释：解释 what（代码本身已经清晰）
i++;  // i 加 1

// 好注释：解释 why（背景和原因）
// 跳过第一个元素，因为它是哨兵值，不参与业务逻辑
i++;

// 好注释：解释复杂算法的意图
// 使用 Fisher-Yates 算法确保均匀随机分布
```

---

## 六、死代码（Dead Code）

### 特征识别
- 从未被调用的函数/方法
- 永远不可能为 true 的条件分支
- 已被删除功能的遗留代码
- 未使用的导入/依赖

### 检测规则
```
严重程度：中等
检测模式：
  - IDE 标注为"未使用"的变量/方法/导入
  - 条件表达式恒为 true 或 false（常量折叠）
  - catch 块为空（捕获异常后什么都不做）
```

### 示例
```java
// 死代码
import com.example.OldService;  // 未使用的导入

public void processData(Data data) {
    if (false) {  // 永远不执行的分支
        oldProcess(data);
    }
    // ...
}

private void oldProcess(Data data) {  // 从未被调用
    // 旧逻辑...
}
```
