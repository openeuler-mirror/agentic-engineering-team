# Feature/Issue Template

This template provides a standardized structure for creating clear, comprehensive feature descriptions and issue reports. Use this template when creating platform issues or local feature descriptions.

## Template Structure

### 1. Background & Value (背景与价值)

**Purpose**: Explain why this feature is needed and what value it brings.

**Content Requirements**:
- **Current Situation**: Describe the current context or pain point
- **Problem Statement**: What issue needs to be addressed
- **Expected Value**: What benefit this feature will bring

**Example**:
```
Current situation: witty skill insight project uses command-line installation
that modifies opencode CLI, which is invasive and doesn't follow skill standards.

Problem: Need a way to distribute witty skill insight features as standardized
skills that comply with conventions.

Expected value: Users can install and use these skills via mainstream AI platforms
without invasive CLI modifications.
```

### 2. Requirements Details (需求详情)

**Purpose**: Provide detailed, actionable requirements for implementation.

**Content Requirements**:
- **Core Requirements**: Specific features and capabilities needed
- **Deliverables**: Concrete outputs (documents, code, configurations)
- **Detailed Requirements**: Break down complex requirements into sub-items

**Example**:
```
Core Requirements:
- Initialize client code repository with proper structure
- Support Claude/opencode AI tools one-click installation
- Include a test skill for validation

Deliverables:
1. Project repository with complete structure
2. Comprehensive README documentation including:
   - Project introduction
   - Installation instructions
   - Usage guide
   - Contribution guidelines
   - License information
3. Multi-language documentation support via docs/ directory
   - Design reasonable documentation organization structure
```

### 3. Solution Approach (方案说明)

**Purpose**: Clearly define the implementation approach to avoid free-form execution by the model.

**Content Requirements**:
- **Approach Definition**: Specify how the feature should be implemented
- **Constraints**: Any technical or business constraints
- **Decision Points** (if applicable): Areas requiring user input or selection

**Common Patterns**:

**Pattern A - Direct Specification** (for clear requirements):
```
Implementation approach:
- Use framework X with architecture pattern Y
- Follow the existing project's coding conventions
- Integrate with existing component Z
```

**Pattern B - Research Required** (for exploratory requirements):
```
Research needed:
- Investigate A, B, C to understand current state
- Based on research, present solution options to user
- Execute according to user's selection
```

**Pattern C - Options Present** (when multiple valid approaches exist):
```
Valid approaches:
1. Option 1: [description]
2. Option 2: [description]

User selection required before implementation.
```

**Key Principle**: This section should constrain the model's implementation approach, preventing it from making assumptions or free-form decisions.

### 4. Acceptance Criteria (验收标准)

**Purpose**: Define clear, testable conditions for feature completion.

**Content Requirements**:
- **Functional Criteria**: Specific, testable behaviors
- Each criterion should be independently verifiable
- Use specific, measurable language

**Example**:
```
1. Repository discoverable by skills.sh scanner
2. Repository discoverable by skillsmp.com scanner
3. Quick installation via npx (similar to skills.sh)
4. After installation, supports opencode AI tool usage
5. After installation, supports Claude AI tool usage
```

## Template Usage Guidelines

### When Writing Feature Descriptions

1. **Be Specific**: Avoid vague language like "improve performance"
2. **Provide Context**: Help implementers understand the "why"
3. **Define Boundaries**: Clearly state requirements and deliverables
4. **Support Testing**: Include testable acceptance criteria
5. **Constrain Implementation**: Use Solution Approach to guide the model

### Language and Style

- **Language**: Use user's preferred language (English/Chinese/mixed)
- **Tone**: Clear, professional, and concise
- **Formatting**: Use markdown for structure and readability

## Integration with SKILL.md

This template is referenced by the Create or Update Issue Workflow in SKILL.md:

- **Create/Update Issue Workflow**: Use this template when creating or updating platform issues
- **Feature Claim Workflow**: Use this template structure when creating local feature descriptions
- **Local Mode**: Use this template structure for local feature descriptions
