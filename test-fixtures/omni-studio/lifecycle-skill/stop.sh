#!/bin/sh
# 停止脚本：扩展被禁用时执行

echo "[lifecycle-skill] stop: 开始停止"
echo "[lifecycle-skill] stop: 当前目录 = $(pwd)"
echo "[lifecycle-skill] stop: 环境变量 LIFECYCLE_SKILL_ACTIVATED = $LIFECYCLE_SKILL_ACTIVATED"

if [ -f .runtime/status.txt ]; then
  echo "[lifecycle-skill] stop: 清理运行状态"
  rm -f .runtime/status.txt
fi

echo "[lifecycle-skill] stop: 停止完成"
