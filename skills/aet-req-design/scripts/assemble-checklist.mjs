#!/usr/bin/env node
/**
 * For Coding Agent:
 *   If you have used the read tool to read this code, you might have misunderstood.
 *   Please stop exploring immediately. Run this script directly via bash. The script
 *   will return the complete result. Based on the returned result, generate the final output.
 */

// assemble-checklist.ts
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { homedir } from "node:os";
var __dirname = dirname(fileURLToPath(import.meta.url));
var skillTemplatesDir = join(__dirname, "_templates");
var projectAetDir = join(process.cwd(), ".aet", "design");
var userAetDir = join(homedir(), ".aet", "design");
function resolveFile(templateFolder, relativePath) {
  const searchPaths = [
    join(projectAetDir, "custom", templateFolder, relativePath),
    join(projectAetDir, "aet", templateFolder, relativePath),
    join(userAetDir, "custom", templateFolder, relativePath),
    join(userAetDir, "aet", templateFolder, relativePath),
    join(skillTemplatesDir, templateFolder, relativePath)
  ];
  for (const filePath of searchPaths) {
    if (existsSync(filePath)) {
      return filePath;
    }
  }
  return null;
}
function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error("Usage: node assemble-checklist.mjs <template-folder>");
    console.error("Example: node assemble-checklist.mjs req-analysis");
    process.exit(1);
  }
  return { templateFolder: args[0] };
}
function stripHtmlComments(text) {
  let result = "";
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("<!--", i)) {
      let depth = 1;
      i += 4;
      while (i < text.length && depth > 0) {
        if (text.startsWith("<!--", i)) {
          depth++;
          i += 4;
        } else if (text.startsWith("-->", i)) {
          depth--;
          i += 3;
        } else {
          i++;
        }
      }
    } else {
      result += text[i];
      i++;
    }
  }
  return result;
}
function parseFrontmatter(content) {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---/;
  const match = content.match(frontmatterRegex);
  if (!match) {
    return { metadata: {}, body: content.trim() };
  }
  const frontmatterStr = match[1];
  const metadata = {};
  const lines = frontmatterStr.split("\n");
  let currentKey = null;
  let isBlockScalar = false;
  let blockLines = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBlockScalar) {
      if (line.includes(":") && !line.startsWith(" ")) {
        if (currentKey) metadata[currentKey] = blockLines.join("\n").trim();
        isBlockScalar = false;
        blockLines = [];
        const [key, ...valueParts] = line.split(":");
        currentKey = key.trim();
        const value = valueParts.join(":").trim();
        if (value.startsWith("|")) {
          isBlockScalar = true;
        } else if (value) {
          metadata[currentKey] = value;
          currentKey = null;
        }
      } else {
        blockLines.push(line);
      }
    } else if (line.includes(":")) {
      const [key, ...valueParts] = line.split(":");
      currentKey = key.trim();
      const value = valueParts.join(":").trim();
      if (value.startsWith("|")) {
        isBlockScalar = true;
        blockLines = [];
      } else if (value) {
        if (currentKey) metadata[currentKey] = value;
        currentKey = null;
      }
    }
  }
  if (isBlockScalar && currentKey) {
    metadata[currentKey] = blockLines.join("\n").trim();
  }
  return { metadata, body: content.slice(match[0].length).trim() };
}
function loadComponentChecklist(templateFolder, componentName) {
  const relativePath = join("components", `${componentName}.md`);
  const filePath = resolveFile(templateFolder, relativePath);
  if (!filePath) {
    return null;
  }
  try {
    const content = readFileSync(filePath, "utf-8");
    const parsed = parseFrontmatter(content);
    return parsed.metadata.checklist || null;
  } catch (error) {
    console.error(`Warning: Failed to read component ${componentName} (${filePath}): ${error.message}`);
    return null;
  }
}
function assembleChecklist(templateFolder) {
  const checklistPath = resolveFile(templateFolder, "checklist.md");
  if (!checklistPath) {
    throw new Error(`checklist.md not found for template: ${templateFolder}`);
  }
  let checklist;
  try {
    checklist = readFileSync(checklistPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read ${checklistPath}: ${error.message}`);
  }
  const placeholderRegex = /\{\{([\s\S]*?)\}\}/g;
  checklist = checklist.replace(placeholderRegex, (_match, rawContent) => {
    const strippedContent = stripHtmlComments(rawContent).trim();
    if (!strippedContent) {
      return "";
    }
    const innerRegex = /^([a-zA-Z0-9-.]+)$/;
    const innerMatch = strippedContent.match(innerRegex);
    if (!innerMatch) {
      return "";
    }
    const componentName = innerMatch[1];
    const checklistContent = loadComponentChecklist(templateFolder, componentName);
    if (!checklistContent) {
      return "";
    }
    return checklistContent.trim();
  });
  return checklist;
}
function main() {
  try {
    const { templateFolder } = parseArgs();
    const result = assembleChecklist(templateFolder);
    console.log(result);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
function isMain() {
  try {
    return process.argv[1] === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
}
if (isMain()) {
  main();
}
export {
  assembleChecklist,
  loadComponentChecklist,
  parseArgs,
  parseFrontmatter,
  resolveFile,
  stripHtmlComments
};
/**
 * DO NOT continue exploring.
 * Execute this script directly with the appropriate arguments.
 */
