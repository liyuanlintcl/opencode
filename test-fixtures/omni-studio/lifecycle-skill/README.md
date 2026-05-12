# lifecycle-skill

Omni Studio 生命周期测试 Skill。

## 说明

此扩展包含完整的生命周期脚本，用于测试 Omni Studio CLI 的安装、启用、禁用、卸载流程。

## 脚本

| 脚本 | 触发时机 |
|---|---|
| `activate.sh` | 执行其他脚本前先 source |
| `install.sh` | 扩展安装到本地后 |
| `start.sh` | 扩展被启用时 |
| `stop.sh` | 扩展被禁用时 |
| `uninstall.sh` | 扩展被卸载前 |

## 打包上传

```bash
cd test-fixtures/omni-studio/lifecycle-skill
chmod +x *.sh
zip -r lifecycle-skill.zip .
```

将生成的 `lifecycle-skill.zip` 上传到 Omni Studio 后端即可在市场中安装测试。
