#!/bin/bash
set -euo pipefail
# AtomGit PR 信息获取脚本
# 用法: ./fetch_pr.sh <owner> <repo> <pr_number>
# 示例: ./fetch_pr.sh mindspore community 1234
#
# 首次运行会提示输入token，之后会保存到本地（30天有效）

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TOKEN_FILE="${SCRIPT_DIR}/.atomgit_token"

get_token() {
    # 优先从环境变量读取
    if [ -n "${ATOMGIT_TOKEN:-}" ]; then
        echo "$ATOMGIT_TOKEN"
        return
    fi
    
    # 从本地文件读取
    if [ -f "$TOKEN_FILE" ]; then
        expiry=$(grep '"expiry"' "$TOKEN_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/')
        current_date=$(date +%Y-%m-%d)
        if [[ "$expiry" > "$current_date" ]]; then
            token=$(grep '"value"' "$TOKEN_FILE" | sed 's/.*: *"\([^"]*\)".*/\1/')
            echo "$token"
            return
        fi
    fi

    echo -n "请输入 AtomGit 私人令牌 (PRIVATE-TOKEN): "
    read -s input_token
    echo

    if [ -z "$input_token" ]; then
        echo "Token不能为空"
        exit 1
    fi

    expiry_date=$(python3 -c "from datetime import datetime, timedelta; print((datetime.now() + timedelta(days=30)).strftime('%Y-%m-%d'))")
    # 使用 Python 的 json 模块确保正确转义特殊字符
    python3 -c "import json; print(json.dumps({'value': '$input_token', 'expiry': '$expiry_date'}))" > "$TOKEN_FILE"
    echo "Token已保存到本地 (有效期30天)"
    echo "$input_token"
}

if [ $# -lt 3 ]; then
    echo "用法: $0 <owner> <repo> <pr_number>"
    echo "示例: $0 mindspore community 1234"
    exit 1
fi

OWNER="$1"
REPO="$2"
PR_NUM="$3"

TOKEN=$(get_token)
BASE_URL="https://api.atomgit.com/api/v5/repos/${OWNER}/${REPO}/pulls/${PR_NUM}"

echo "=== PR 详情 ==="
curl -s --fail --location "${BASE_URL}" \
    --header "PRIVATE-TOKEN: ${TOKEN}" \
    --header "Accept: application/json"

echo ""
echo "=== PR 文件列表 ==="
curl -s --fail --location "${BASE_URL}/files" \
    --header "PRIVATE-TOKEN: ${TOKEN}" \
    --header "Accept: application/json"