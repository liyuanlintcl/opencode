#!/bin/sh
# 启动脚本：扩展被启用时执行

if [ "$LIFECYCLE_TEST_FAIL" = "1" ]; then
  echo "[lifecycle-skill] start: 模拟失败（LIFECYCLE_TEST_FAIL=1）"
  exit 1
fi

echo "[lifecycle-skill] start: 开始启动"
echo "[lifecycle-skill] start: 当前目录 = $(pwd)"
echo "[lifecycle-skill] start: 环境变量 LIFECYCLE_SKILL_ACTIVATED = $LIFECYCLE_SKILL_ACTIVATED"

if [ -f .runtime/meta.txt ]; then
  echo "[lifecycle-skill] start: 读取安装元数据"
  cat .runtime/meta.txt
fi

echo "running=true" > .runtime/status.txt
echo "[lifecycle-skill] start: 启动完成"
