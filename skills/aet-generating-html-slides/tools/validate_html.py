#!/usr/bin/env python3
"""
HTML Presentation Validator and Auto-Fixer

Validates HTML presentations and automatically fixes common errors:
- Syntax errors (unclosed tags, malformed tags)
- Structural errors (duplicate content, invalid nesting)
- Accessibility errors (missing alt attributes, ARIA labels)
- Encoding errors (missing charset, invalid characters)

Usage:
    python3 validate_html.py presentation.html [--fix] [--verbose]
"""

import re
import sys
import argparse
from html.parser import HTMLParser
from typing import List, Dict, Tuple


class HTMLValidator(HTMLParser):
    """HTML parser that detects common errors"""

    def __init__(self):
        super().__init__()
        self.errors = []
        self.warnings = []
        self.fixes = []
        self.tag_stack = []
        self.current_tag = None
        self.line_number = 1
        self.content_blocks = []
        self.seen_hashes = set()
        self.img_tags = []
        self.form_inputs = []
        self.buttons = []
        self.in_svg = False

        self.self_closing_tags = {
            "meta",
            "link",
            "img",
            "br",
            "hr",
            "input",
            "area",
            "base",
            "col",
            "command",
            "embed",
            "keygen",
            "param",
            "source",
            "track",
            "wbr",
            "path",
            "circle",
            "rect",
            "line",
            "polyline",
            "polygon",
            "ellipse",
            "use",
            "stop",
        }

    def handle_starttag(self, tag, attrs):
        self.current_tag = tag

        if tag == "svg":
            self.in_svg = True

        valid_html_tags = {
            "html",
            "head",
            "body",
            "title",
            "meta",
            "link",
            "script",
            "style",
            "div",
            "span",
            "p",
            "br",
            "hr",
            "a",
            "img",
            "strong",
            "em",
            "h1",
            "h2",
            "h3",
            "h4",
            "h5",
            "h6",
            "ul",
            "ol",
            "li",
            "dl",
            "dt",
            "dd",
            "table",
            "thead",
            "tbody",
            "tfoot",
            "tr",
            "th",
            "td",
            "form",
            "input",
            "button",
            "select",
            "option",
            "textarea",
            "label",
            "header",
            "footer",
            "nav",
            "aside",
            "main",
            "section",
            "article",
            "svg",
            "path",
            "circle",
            "rect",
            "line",
            "polyline",
            "polygon",
        }

        if tag not in valid_html_tags and not tag.isalpha():
            self.errors.append(
                {
                    "type": "malformed_tag",
                    "message": f"Malformed tag: <{tag}>",
                    "line": self.line_number,
                    "fix": f"Replace <{tag}> with valid HTML tag",
                }
            )
            self.fixes.append(f"Fix malformed tag: <{tag}>")

        if tag == "a" and not any(attr[0] == "href" for attr in attrs):
            self.warnings.append(
                {
                    "type": "accessibility",
                    "message": f"Link without href attribute",
                    "line": self.line_number,
                }
            )

        if tag == "img":
            alt_present = any(attr[0] == "alt" for attr in attrs)
            self.img_tags.append({"has_alt": alt_present, "line": self.line_number})
            if not alt_present:
                self.errors.append(
                    {
                        "type": "accessibility",
                        "message": f"Image missing alt attribute",
                        "line": self.line_number,
                        "fix": "Add alt attribute to image",
                    }
                )
                self.fixes.append("Add alt attribute to image")

        if tag == "input":
            label_present = any(
                attr[0] == "aria-label" or attr[0] == "id" for attr in attrs
            )
            self.form_inputs.append(
                {"has_label": label_present, "line": self.line_number}
            )
            if not label_present:
                self.warnings.append(
                    {
                        "type": "accessibility",
                        "message": f"Input may need label or aria-label",
                        "line": self.line_number,
                    }
                )

        if tag == "button":
            aria_label = any(attr[0] == "aria-label" for attr in attrs)
            self.buttons.append(
                {"has_aria_label": aria_label, "line": self.line_number}
            )

        if tag not in self.self_closing_tags:
            self.tag_stack.append(tag)

    def handle_endtag(self, tag):
        if tag == "svg":
            self.in_svg = False

        if not self.tag_stack:
            self.errors.append(
                {
                    "type": "orphaned_tag",
                    "message": f"Orphaned closing tag: </{tag}>",
                    "line": self.line_number,
                    "fix": f"Remove </{tag}>",
                }
            )
            self.fixes.append(f"Remove orphaned closing tag: </{tag}>")
        elif self.tag_stack[-1] != tag:
            if self.in_svg or tag in self.self_closing_tags:
                return

            self.errors.append(
                {
                    "type": "mismatched_tag",
                    "message": f"Mismatched tag: expected </{self.tag_stack[-1]}>, got </{tag}>",
                    "line": self.line_number,
                    "fix": f"Fix tag nesting for </{tag}>",
                }
            )
            self.fixes.append(f"Fix mismatched tag: </{tag}>")
            if tag in self.tag_stack:
                self.tag_stack.remove(tag)
            elif self.tag_stack:
                self.tag_stack.pop()
        else:
            self.tag_stack.pop()

    def handle_data(self, data):
        if data.strip() and len(data.strip()) > 50:
            content_hash = hash(data.strip())
            if content_hash in self.seen_hashes:
                self.errors.append(
                    {
                        "type": "duplicate_content",
                        "message": f"Duplicate content detected",
                        "line": self.line_number,
                        "fix": "Remove duplicate content block",
                    }
                )
                self.fixes.append("Remove duplicate content block")
            self.seen_hashes.add(content_hash)
            self.content_blocks.append(
                {
                    "content": data.strip(),
                    "hash": content_hash,
                    "line": self.line_number,
                }
            )

    def get_report(self) -> Dict:
        return {
            "errors": self.errors,
            "warnings": self.warnings,
            "fixes": self.fixes,
            "unclosed_tags": self.tag_stack,
            "images_without_alt": len(
                [img for img in self.img_tags if not img["has_alt"]]
            ),
            "total_images": len(self.img_tags),
        }


def auto_fix_html(content: str) -> Tuple[str, List[str]]:
    """
    Auto-fix common HTML errors

    Returns:
        Tuple of (fixed_content, list_of_fixes_applied)
    """
    fixes_applied = []

    if not content.strip().startswith("<!DOCTYPE"):
        content = "<!DOCTYPE html>\n" + content
        fixes_applied.append("Added DOCTYPE declaration")

    if (
        "<meta charset=" not in content
        and '<meta http-equiv="Content-Type"' not in content
    ):
        head_match = re.search(r"<head>", content, re.IGNORECASE)
        if head_match:
            insert_pos = head_match.end()
            content = (
                content[:insert_pos]
                + '    <meta charset="UTF-8">\n'
                + content[insert_pos:]
            )
            fixes_applied.append("Added UTF-8 charset meta {tag")

    malformed_patterns = {
        r"<共有": "<div>",
        r"</共有>": "</div>",
        r"<divv": "<div",
        r"</divv>": "</div>",
        r"<spann": "<span",
        r"</spann>": "</span>",
        r"<pp>": "<p>",
        r"</pp>": "</p>",
        r"<h1h1>": "<h1>",
        r"</h1h1>": "</h1>",
        r"<divv>": "<div>",
        r"</divv>": "</div>",
    }

    for pattern, replacement in malformed_patterns.items():
        if re.search(pattern, content):
            content = re.sub(pattern, replacement, content)
            fixes_applied.append(f"Fixed malformed tag: {pattern} → {replacement}")

    lines = content.split("\n")
    deduped_lines = []
    seen_hashes = {}
    consecutive_duplicates = 0

    for i, line in enumerate(lines):
        line_stripped = line.strip()

        if not line_stripped:
            deduped_lines.append(line)
            continue

        line_hash = hash(line_stripped)

        if len(line_stripped) > 50 and line_hash in seen_hashes:
            last_occurrence = seen_hashes[line_hash]
            if i - last_occurrence < 20:
                consecutive_duplicates += 1
                if consecutive_duplicates >= 3:
                    fixes_applied.append(f"Removed duplicate content at line {i + 1}")
                    continue
            else:
                consecutive_duplicates = 0
        else:
            consecutive_duplicates = 0

        seen_hashes[line_hash] = i
        deduped_lines.append(line)

    content = "\n".join(deduped_lines)

    svg_path_pattern = r'<path[^>]*d="([^"]*[^\x00-\x7F][^"]*)"[^>]*/>'

    def fix_svg_path(match):
        path_data = match.group(1)
        fixed_path = re.sub(r"[^\x00-\x7F]", "0", path_data)
        if fixed_path != path_data:
            fixes_applied.append(
                "Fixed invalid SVG path data (removed non-ASCII characters)"
            )
        return match.group(0).replace(path_data, fixed_path)

    content = re.sub(svg_path_pattern, fix_svg_path, content)

    content = re.sub(r'">\s*"', '">', content)
    content = re.sub(r'(?<!["\'])"(?!\s*["\'])', "", content)

    content = re.sub(r"border-radius:\s*serif\s+", "border-radius: ", content)

    if "<html" not in content:
        doctype_end = content.find(">") + 1
        content = (
            content[:doctype_end]
            + '\n<html lang="en">'
            + content[doctype_end:]
            + "\n</html>"
        )
        fixes_applied.append("Added missing <html> tag")

    if "<body" not in content:
        head_close = content.find("</head>")
        if head_close != -1:
            insert_pos = head_close + len("</head>")
            content = (
                content[:insert_pos] + "\n<body>" + content[insert_pos:] + "\n</body>"
            )
            fixes_applied.append("Added missing <body> tag")

    def add_alt_to_img(match):
        img_tag = match.group(0)
        if "alt=" not in img_tag:
            img_tag = img_tag.replace(">", ' alt="">')
            fixes_applied.append("Added alt attribute to image")
        return img_tag

    content = re.sub(r"<img[^>]*>", add_alt_to_img, content)

    return content, fixes_applied


def validate_html(content: str) -> Dict:
    """Validate HTML content and return report"""
    validator = HTMLValidator()
    try:
        validator.feed(content)
    except Exception as e:
        return {"parse_error": str(e), "errors": [], "warnings": [], "fixes": []}

    return validator.get_report()


def print_report(report: Dict, verbose: bool = False):
    """Print validation report"""
    print("\n" + "=" * 60)
    print("HTML VALIDATION REPORT")
    print("=" * 60)

    if "parse_error" in report:
        print(f"\n❌ PARSE ERROR: {report['parse_error']}")
        return

    if report["errors"]:
        print(f"\n❌ ERRORS FOUND: {len(report['errors'])}")
        for i, error in enumerate(report["errors"], 1):
            print(f"\n  {i}. {error['message']}")
            print(f"     Type: {error['type']}")
            if "line" in error:
                print(f"     Line: {error['line']}")
            if "fix" in error:
                print(f"     Fix: {error['fix']}")
    else:
        print("\n✅ No errors found")

    if report["warnings"] and verbose:
        print(f"\n⚠️  WARNINGS: {len(report['warnings'])}")
        for i, warning in enumerate(report["warnings"], 1):
            print(f"\n  {i}. {warning['message']}")
            print(f"     Type: {warning['type']}")
            if "line" in warning:
                print(f"     Line: {warning['line']}")

    if report["unclosed_tags"]:
        print(f"\n❌ UNCLOSED TAGS: {len(report['unclosed_tags'])}")
        for tag in report["unclosed_tags"]:
            print(f"  - <{tag}>")

    if report["images_without_alt"] > 0:
        print(
            f"\n⚠️  ACCESSIBILITY: {report['images_without_alt']} images missing alt attributes"
        )

    print("\n" + "=" * 60)


def main():
    parser = argparse.ArgumentParser(
        description="Validate and auto-fix HTML presentations"
    )
    parser.add_argument("file", help="HTML file to validate")
    parser.add_argument("--fix", action="store_true", help="Auto-fix detected errors")
    parser.add_argument(
        "--verbose", "-v", action="store_true", help="Show verbose output"
    )
    args = parser.parse_args()

    try:
        with open(args.file, "r", encoding="utf-8") as f:
            content = f.read()
    except FileNotFoundError:
        print(f"❌ Error: File not found: {args.file}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ Error reading file: {e}")
        sys.exit(1)

    print(f"📄 Validating: {args.file}")

    report = validate_html(content)
    print_report(report, args.verbose)

    if args.fix:
        print("\n🔧 Applying auto-fixes...")
        fixed_content, fixes = auto_fix_html(content)

        if fixes:
            print(f"\n✅ Fixes applied: {len(fixes)}")
            for i, fix in enumerate(fixes, 1):
                print(f"  {i}. {fix}")

            backup_file = args.file + ".backup"
            with open(backup_file, "w", encoding="utf-8") as f:
                f.write(content)

            with open(args.file, "w", encoding="utf-8") as f:
                f.write(fixed_content)

            print(f"\n💾 Original file backed up to: {backup_file}")
            print(f"💾 Fixed file saved to: {args.file}")

            print("\n🔍 Re-validating after fixes...")
            new_report = validate_html(fixed_content)
            print_report(new_report, args.verbose)
        else:
            print("\n✅ No fixes needed - file is already valid!")

    if report["errors"] or report["unclosed_tags"]:
        sys.exit(1)
    else:
        sys.exit(0)


if __name__ == "__main__":
    main()
