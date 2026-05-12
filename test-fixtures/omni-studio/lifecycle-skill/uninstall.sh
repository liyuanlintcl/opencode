#!/bin/sh
# 卸载脚本：扩展被卸载前执行

echo "[lifecycle-skill] uninstall: 开始卸载"
echo "[lifecycle-skill] uninstall: 当前目录 = $(pwd)"
echo "[lifecycle-skill] uninstall: 环境变量 LIFECYCLE_SKILL_ACTIVATED = $LIFECYCLE_SKILL_ACTIVATED"

# 模拟清理
echo "[lifecycle-skill] uninstall: 清理运行时数据"
rm -rf .runtime

echo "[lifecycle-skill] uninstall: 卸载完成"
