#!/bin/sh
# 环境激活脚本
# 执行其他生命周期脚本前会先 source 此脚本

echo "[lifecycle-skill] activate: 环境激活"
export LIFECYCLE_SKILL_ACTIVATED="true"
