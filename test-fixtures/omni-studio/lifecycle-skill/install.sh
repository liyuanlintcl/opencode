#!/bin/sh
# 安装脚本：扩展被安装到本地后执行

echo "[lifecycle-skill] install: 开始安装"
echo "[lifecycle-skill] install: 当前目录 = $(pwd)"
echo "[lifecycle-skill] install: 环境变量 LIFECYCLE_SKILL_ACTIVATED = $LIFECYCLE_SKILL_ACTIVATED"

# 模拟安装依赖
mkdir -p .runtime
echo "installed_at=$(date -Iseconds)" > .runtime/meta.txt

echo "[lifecycle-skill] install: 安装完成"
