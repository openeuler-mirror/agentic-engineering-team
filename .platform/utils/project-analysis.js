/**
 * Project Analysis Injection (Resilient)
 *
 * 从 aet.js 抽离的项目分析模块。
 * 读取 .aet/project-analysis/ 目录下的 Markdown 文件，格式化为 XML 风格的结构化文本。
 */

const path = require('path');
const fs = require('fs');

function ensureStringPath(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input === 'object' && input.path) return input.path;
  return null;
}

function detectProjectAnalysisFolder(projectRoot) {
  try {
    const root = ensureStringPath(projectRoot);
    if (!root) return false;
    const analysisDir = path.join(root, '.aet', 'project-analysis');
    return fs.existsSync(analysisDir);
  } catch (err) {
    console.error('[AET] detectProjectAnalysisFolder error:', err.message);
    return false;
  }
}

function extractFrontmatter(content) {
  if (!content || typeof content !== 'string') {
    return '';
  }
  try {
    const match = content.match(/^---\n([\s\S]*?)\n---/);
    return match ? match[1] : '';
  } catch (err) {
    console.error('[AET] extractFrontmatter error:', err.message);
    return '';
  }
}

function readMarkdownFile(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    return fs.readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error('[AET] readMarkdownFile error:', err.message);
    return null;
  }
}

function readMarkdownMetadata(filePath) {
  const content = readMarkdownFile(filePath);
  if (!content) return null;
  const metadata = extractFrontmatter(content);
  return metadata || null;
}

function findCaseInsensitiveFile(dirPath, filename) {
  if (!dirPath || !filename) return null;
  try {
    if (!fs.existsSync(dirPath)) return null;
    const lowerTarget = filename.toLowerCase();
    const files = fs.readdirSync(dirPath);
    const match = files.find(f => f.toLowerCase() === lowerTarget);
    return match ? path.join(dirPath, match) : null;
  } catch (err) {
    console.error('[AET] findCaseInsensitiveFile error:', err.message);
    return null;
  }
}

function getMarkdownFiles(dirPath) {
  if (!dirPath) return [];
  try {
    if (!fs.existsSync(dirPath)) {
      return [];
    }
    const files = fs.readdirSync(dirPath);
    return files.filter(f => f && f.toLowerCase().endsWith('.md')).map(f => path.join(dirPath, f));
  } catch (err) {
    console.error('[AET] getMarkdownFiles error:', err.message);
    return [];
  }
}

function formatProjectAnalysis(projectRoot) {
  try {
    const root = ensureStringPath(projectRoot);
    if (!root) return null;
    
    const analysisDir = path.join(root, '.aet', 'project-analysis');
    
    if (!fs.existsSync(analysisDir)) {
      return null;
    }

    const architecturePath = findCaseInsensitiveFile(analysisDir, 'Architecture.md');
    const modulesPath = findCaseInsensitiveFile(analysisDir, 'Modules.md');
    const componentsDir = path.join(analysisDir, 'components');
    const principlesDir = path.join(analysisDir, 'principles');

    let output = '<project-analysis>\n';

    const architectureContent = architecturePath ? readMarkdownFile(architecturePath) : null;
    if (architectureContent) {
      output += `\n<architecture>\n`;
      output += `<path>${architecturePath}</path>\n`;
      output += `<content>${architectureContent}</content>\n`;
      output += `</architecture>\n`;
    }

    const modulesContent = modulesPath ? readMarkdownFile(modulesPath) : null;
    if (modulesContent) {
      output += `\n<modules>\n`;
      output += `<path>${modulesPath}</path>\n`;
      output += `<content>${modulesContent}</content>\n`;
      output += `</modules>\n`;
    }

    const componentFiles = getMarkdownFiles(componentsDir);
    const validComponents = [];
    for (const filePath of componentFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validComponents.push({ filePath, description });
      }
    }
    
    if (validComponents.length > 0) {
      output += `\n<components>\n`;
      for (const item of validComponents) {
        if (item.description) {
          output += `<item>\n`;
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += `</item>\n`;
        }
      }
      output += `</components>\n`;
    }
    const principleFiles = getMarkdownFiles(principlesDir);
    const validPrinciples = [];
    for (const filePath of principleFiles) {
      const metadata = readMarkdownMetadata(filePath);
      if (metadata && metadata.trim().length > 0) {
        const description = extractDescriptionFromFrontmatter(metadata);
        validPrinciples.push({ filePath, description });
      }
    }
    
    if (validPrinciples.length > 0) {
      output += `\n<principles>\n`;
      for (const item of validPrinciples) {
        if (item.description) {
          output += `<item>\n`;
          output += `<path>${item.filePath}</path>\n`;
          output += `<description>${item.description}</description>\n`;
          output += `</item>\n`;
        }
      }
      output += `</principles>\n`;
    }

    output += '</project-analysis>';

    return output;
  } catch (err) {
    console.error('[AET] formatProjectAnalysis error:', err.message);
    return null;
  }
}

function extractDescriptionFromFrontmatter(frontmatter) {
  if (!frontmatter || typeof frontmatter !== 'string') return null;
  const match = frontmatter.match(/^description:\s*(?:["'](.+?)["']|(.+))$/m);
  return match ? (match[1] || match[2]).trim() : null;
}

module.exports = {
  ensureStringPath,
  detectProjectAnalysisFolder,
  extractFrontmatter,
  readMarkdownFile,
  readMarkdownMetadata,
  extractDescriptionFromFrontmatter,
  findCaseInsensitiveFile,
  getMarkdownFiles,
  formatProjectAnalysis,
};
