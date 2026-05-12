# lifecycle-skill

Omni Studio 生命周期测试 Skill。

## 说明

此扩展包含完整的生命周期脚本，用于测试 Omni Studio CLI 的安装、启用、禁用、卸载流程。

## 脚本

| 脚本 | 路径 | 触发时机 |
|---|---|---|
| `activate.sh` | `lifecycle/activate.sh` | 执行其他脚本前先 source |
| `install.sh` | `lifecycle/install.sh` | 扩展安装到本地后 |
| `start.sh` | `lifecycle/start.sh` | 扩展被启用时 |
| `stop.sh` | `lifecycle/stop.sh` | 扩展被禁用时 |
| `uninstall.sh` | `lifecycle/uninstall.sh` | 扩展被卸载前 |

> 注意：脚本存放在 `lifecycle/` 子目录中，但执行时的工作目录（cwd）仍为扩展根目录。

## 模拟失败测试

所有生命周期脚本支持通过环境变量模拟失败：

```bash
export LIFECYCLE_TEST_FAIL=1
```

设置后执行任意生命周期脚本都会输出失败信息并返回 exit 1，用于测试 TUI 错误展示。

## 打包上传

```bash
cd test-fixtures/omni-studio/lifecycle-skill
chmod +x lifecycle/*.sh
zip -r lifecycle-skill.zip .
```

将生成的 `lifecycle-skill.zip` 上传到 Omni Studio 后端即可在市场中安装测试。
