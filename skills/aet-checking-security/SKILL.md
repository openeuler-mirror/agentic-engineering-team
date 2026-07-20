---
name: aet-checking-security
description: Security audit skill - analyzes code for OWASP Top 10 and common vulnerabilities by identifying sensitive points (HTML output, SQL queries, file ops, system commands, network requests, auth logic), then loading the matching reference guide to trace data flow and verify exploitability
---

## Language Detection and Response

Automatically detect the language of user input and respond in the same language.

## When to Use

Use this skill when:
- You need to perform a security audit on code
- You want to detect OWASP Top 10 and related vulnerabilities
- You need to trace data flows from user input to dangerous sinks
- Called from the `aet-reviewing-code` orchestrator skill

---

## Core Audit Methodology

### Phase 1: Sensitive Point Identification

Scan the target code and classify all detected sensitive points using the mapping table below.
**For each matched category, load the linked reference file and follow its detection steps.**

| Category | Code Signals to Search For | Reference |
|----------|---------------------------|-----------|
| HTML Output / Template Rendering | `innerHTML`, `outerHTML`, `document.write`, `echo $var`, `response.write()`, `render_template_string`, JSP `<%= %>`, Thymeleaf `th:utext` | [xss-csrf.md](reference/xss-csrf.md) |
| Form / State-Changing Endpoints | `@PostMapping`, `app.post()`, `router.post()`, PUT/DELETE handlers that modify state | [xss-csrf.md](reference/xss-csrf.md) |
| System Command Execution | `Runtime.exec()`, `os.system()`, `subprocess`, `exec()`, `system()`, `shell_exec()`, `child_process.exec` | [command-injection.md](reference/command-injection.md) |
| Dynamic Code Evaluation | `eval()`, `new Function()`, `exec()` (Python), `assert()` (PHP), `compile()` | [command-injection.md](reference/command-injection.md) |
| Deserialization | `ObjectInputStream.readObject()`, `pickle.loads()`, `unserialize()`, `yaml.load()`, `BinaryFormatter.Deserialize` | [command-injection.md](reference/command-injection.md) |
| Database Queries | `execute(`, `query(`, `createQuery`, `nativeQuery`, `$db->query`, SQL string concatenation with `+` or `%s` | [sql-injection.md](reference/sql-injection.md) |
| File Read / Write / Include | `FileInputStream`, `open(path)`, `fopen()`, `file_get_contents()`, `include $var`, `require $var`, `fs.readFile` | [file-security.md](reference/file-security.md) |
| File Upload Handling | `MultipartFile`, `$_FILES`, `request.files`, upload endpoint handlers | [file-security.md](reference/file-security.md) |
| Log / Error Output | `logger.info()`, `printStackTrace()`, `e.getMessage()` returned to client, `console.log()` with sensitive data | [sensitive-info-leak.md](reference/sensitive-info-leak.md) |
| Hardcoded Credentials | `password =`, `api_key =`, `secret =`, `ACCESS_KEY`, `token =` as string literals in source/config | [sensitive-info-leak.md](reference/sensitive-info-leak.md) |
| Encryption / Hashing | `MD5`, `SHA1`, `DES`, `RC4`, `Math.random()` used in security context | [sensitive-info-leak.md](reference/sensitive-info-leak.md) |
| Outbound HTTP Requests | `HttpClient`, `requests.get(url)`, `URLConnection`, `curl_exec()`, `fetch(url)` with user-controlled URL | [ssrf-auth.md](reference/ssrf-auth.md) |
| Authentication / Permission Checks | `isAdmin()`, `hasRole()`, `@PreAuthorize`, JWT decode/verify logic | [ssrf-auth.md](reference/ssrf-auth.md) |
| Resource Access by ID | `/api/resource/{id}`, `findById(id)` without ownership verification | [ssrf-auth.md](reference/ssrf-auth.md) |

### Phase 2: Reference-Guided Analysis

For each sensitive point found:

1. **Load the linked reference** (e.g., `[xss-csrf.md](reference/xss-csrf.md)`)
2. **Follow the detection steps** defined in the reference
3. **Trace the data flow**: User Input (Source) → transformations → Dangerous Sink
4. **Verify sanitization gaps**: Is there missing encoding, parameterization, or validation?
5. **Assess exploitability**: Is the path reachable? Does it require authentication?

### Phase 3: Finding Documentation

For each confirmed vulnerability, document in this format:

```
### [SEVERITY] Vulnerability Type — File:Line

**Description**: What the vulnerability is and what an attacker can do.

**Affected Code**:
(code snippet)

**Data Flow**:
User Input → [function calls] → Dangerous Sink

**Missing Control**:
What sanitization/validation is absent.

**Proof of Concept**:
Example payload or exploitation scenario.

**Fix Recommendation**:
Specific code change with before/after example.
```

---

## Severity Classification

| Severity | Examples |
|---------|---------|
| Critical | RCE via command injection, SQL injection with auth bypass, Deserialization RCE |
| High | Stored XSS, SSRF to internal network, Path traversal to sensitive files, Auth bypass |
| Medium | CSRF on state-changing ops, IDOR, Reflected XSS, Sensitive info in logs |
| Low | Weak crypto (MD5 for non-auth), Info disclosure in error messages, Hardcoded non-secret config |

---

## Output Format

```markdown
# Security Audit Report

## Summary
- Files analyzed: N
- Sensitive points detected: N
- Confirmed vulnerabilities: N (Critical: X, High: X, Medium: X, Low: X)

## Findings

### [CRITICAL] SQL Injection — src/UserController.java:42
...

### [HIGH] Stored XSS — src/CommentService.java:78
...

### [MEDIUM] CSRF — src/api/OrderController.java:120
...

## Investigated but Not Exploitable
(Sensitive points reviewed and found safe, with brief reason)

## Fix Priority
1. ...
2. ...
```
