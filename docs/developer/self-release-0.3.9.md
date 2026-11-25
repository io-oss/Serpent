# 官方 0.3.9 → 个人 0.3.9-self.1 升级实例

本文是 [Linux 个人版发布流程](self-release.md) 的一个具体演练：假设官方已经发布 `v0.3.9`，把当前 `0.3.8-self.1` 升级为 `0.3.9-self.1` 并发布。

文中的命令都从仓库根目录执行，默认远程为：

```text
origin   git@github.com:io-oss/Serpent.git    # 你的 fork
upstream git@github.com:dolag233/Serpent.git  # 官方仓库
```

如果本机 `git push` 报 `/etc/ssh/ssh_config.d/... Bad owner or permissions`，在命令前加：

```bash
GIT_SSH_COMMAND='ssh -F /dev/null -o BatchMode=yes -o StrictHostKeyChecking=yes' git push ...
```

## 0. 开始前确认

```bash
git status
git branch --show-current
git log --oneline -3
```

应当满足：

- 当前分支：`self/linux`
- 工作区干净
- `origin` 指向 `io-oss/Serpent`
- 当前版本：`0.3.8-self.1`
- 上一版 AppImage 已保留，可用于回滚

如果工作区有未提交改动，先提交或 stash，不要带着改动合并官方分支。

## 1. 同步官方 0.3.9 到 main

```bash
git fetch upstream --tags

git switch main
git merge --ff-only upstream/main
git push origin main
```

确认 `main` 上是官方 `0.3.9`：

```bash
node -p "require('./package.json').version"
git log --oneline -5
```

预期版本为 `0.3.9`，并且 `main` 与 `upstream/main` 的 SHA 一致：

```bash
git rev-parse main upstream/main
```

如果 `main` 不是快进而是出现分叉，说明之前有人直接改过 `main`；先停下来，把改动挪到 `self/linux`，再重置 `main`，不要在 `main` 上 merge。

## 2. 把 main 合并到 self/linux

```bash
git switch self/linux
git merge main
```

这里出现冲突是正常的。个人分支和官方分支都从旧版本改过 `package.json`、`package-lock.json`，通常至少这两个文件会冲突。

### 2.1 解决 package.json

目标不是保留旧版本号，而是：

- 采用官方的 `0.3.9` 依赖和脚本；
- 保留个人依赖 `@img/sharp-wasm32`；
- 保留个人更新器配置（在 `app-update-service.ts`，不在 package.json）；
- 合并完后再统一把版本改成 `0.3.9-self.1`。

如果官方升级了 `sharp`，例如从 `0.35.3` 到 `0.36.0`，必须同时把 wasm 后端改成同一版本。可以手动改：

```text
"sharp": "0.36.0",
"@img/sharp-wasm32": "0.36.0",
```

然后用 npm 校正 lockfile。

### 2.2 解决 package-lock.json

不要手工编辑这个文件。以官方版本为底，重新生成：

```bash
git checkout main -- package-lock.json
npm install
```

如果 `npm install` 后 `@img/sharp-wasm32` 的版本和 `sharp` 不一致，显式安装同版本：

```bash
npm install --save-exact @img/sharp-wasm32@<sharp 的版本>
```

确认：

```bash
node -e "const s=require('./node_modules/sharp/package.json').version; const w=require('./node_modules/@img/sharp-wasm32/package.json').version; console.log(s,w); if(s!==w)process.exit(1)"
```

### 2.3 其他个人改动的保留原则

合并时逐个检查：

| 文件/位置 | 处理原则 |
| --- | --- |
| `src/main/app-update-service.ts` | `SERPENT_GITHUB_REPOSITORY` 必须仍是 `io-oss/Serpent` |
| `src/shared/load-sharp.ts` | 保留 Linux wasm 回退和 `installLinuxSharpWasm()` |
| `src/main/index.ts`、`src/worker/index.ts`、插件入口 | 保留 wasm 回退的安装调用 |
| `forge.config.ts` | 保留 Linux 剔除原生 sharp 后端的规则 |
| `scripts/verify-package.mjs` | 保留 Linux wasm/版本一致性门禁 |
| `scripts/make-appimage.mjs` | 保留 AppDir 权限修正（`chmodSync(libDir, 0o755)`） |
| `tests/setup/linux-sharp.ts`、`vitest.config.ts` | 保留测试环境的 wasm 拦截 |
| `docs/developer/self-release.md` 等个人文档 | 保留 |

如果官方这次已经用别的方式真正修好了 sharp（例如改用了无冲突的原生构建），不要凭直觉删除个人 wasm 补丁。先跑第 4 节的验证，确认官方修法在当前系统上能正常导入图片，再决定是否撤销补丁。

## 3. 合并后的静态检查

```bash
git diff --stat main...self/linux
git log --oneline main..self/linux
```

确认 `self/linux` 上仍然有个人修复提交，并且没有把 `main` 的个人改动带回来。

重点检查：

```bash
grep -n "io-oss/Serpent" src/main/app-update-service.ts
grep -n "@img/sharp-wasm32" package.json
grep -n "installLinuxSharpWasm" src/main/index.ts src/worker/index.ts
```

## 4. 安装依赖并跑验证

```bash
rm -rf node_modules
npm ci
npm run typecheck
```

Linux sharp 回归测试：

```bash
node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts \
  tests/worker/sharp-electron-linux.test.ts
```

媒体包校验：

```bash
npm run media:verify
```

如果媒体包不存在，先准备：

```bash
npm run media:ensure
```

下载 GitHub 资源需要代理时：

```bash
export https_proxy=http://127.0.0.1:7890
export http_proxy=http://127.0.0.1:7890
```

这一步的目标是确认：

- Electron 启动正常；
- 引入图片后不会出现 `SharpElectronLinux` 警告后的 `exit 139`；
- `@img/sharp-wasm32` 和 `sharp` 版本一致；
- `verify:package` 的 Linux 门禁能通过。

## 5. 修改版本并提交

官方版本是 `0.3.9`，个人第一个迭代是 `0.3.9-self.1`：

```bash
npm version --no-git-tag-version 0.3.9-self.1
git add package.json package-lock.json
git commit -m "chore(release): 0.3.9-self.1"
git tag v0.3.9-self.1
```

确认：

```bash
node -p "require('./package.json').version"
git tag --points-at HEAD
```

预期：

```text
0.3.9-self.1
v0.3.9-self.1
```

如果后面发现构建有问题：

- tag 还没推送：删除本地 tag 后重新打；
- tag 已推送但 Release 还没发：可以删除远端 tag 后重来；
- Release 已经发布：不要改 tag/资产，直接发 `0.3.9-self.2`。

## 6. 构建 AppImage

### 仅自己机器使用

先把上一版 AppImage 复制到安全位置，避免 `rm -rf out/make` 后失去回滚包：

```bash
mkdir -p ~/Applications
cp out/make/appimage/Serpent-linux-x86-64-0.3.8-self.*.AppImage ~/Applications/ 2>/dev/null || true
rm -rf out/make
npm run make:appimage
```

产物：

```text
out/make/appimage/Serpent-0.3.9-self.1-x86_64.AppImage
```

重命名为更新器要求的名字：

```bash
mv out/make/appimage/Serpent-0.3.9-self.1-x86_64.AppImage \
   out/make/appimage/Serpent-linux-x86-64-0.3.9-self.1.AppImage
```

### 需要兼容 Ubuntu 22.04+

如果 Docker 可用：

```bash
npm run make:appimage:docker
```

同样重命名。

### 生成校验文件

```bash
npm run release:checksums
```

生成：

```text
out/make/SHA256SUMS-linux-x64.txt
out/make/appimage/Serpent-linux-x86-64-0.3.9-self.1.AppImage.sha256
```

## 7. 构建后验证

先校验文件：

```bash
sha256sum -c out/make/appimage/Serpent-linux-x86-64-0.3.9-self.1.AppImage.sha256
```

再实际启动 AppImage：

1. 赋予执行权限；
2. 启动应用；
3. 导入一张 JPEG/PNG；
4. 确认缩略图生成；
5. 重启应用，确认库能打开、没有 Worker 139；
6. 打开“检查更新”，确认当前版本显示 `0.3.9-self.1`。

如果能跑打包 E2E，优先使用：

```bash
SERPENT_E2E_PACKAGED_EXECUTABLE="$PWD/out/Serpent-linux-x64/Serpent" \
  npx playwright test tests/e2e/packaged-startup.test.ts
```

注意：该测试对界面动画比较敏感；如果卡在点击稳定性上，优先用实际 AppImage 手工完成“导入图片 + 重启”验证，不要把它当成 sharp 修复失败的证据。

## 8. 发布到 fork

先推送分支和 tag：

```bash
git push origin self/linux
git push origin v0.3.9-self.1
```

然后创建 Release：

```text
https://github.com/io-oss/Serpent/releases/new?tag=v0.3.9-self.1
```

要求：

- 正式发布，不勾 “Set as a pre-release”；
- 不保存为 draft；
- 标题：`Serpent v0.3.9-self.1`；
- 上传：
  - `Serpent-linux-x86-64-0.3.9-self.1.AppImage`
  - `Serpent-linux-x86-64-0.3.9-self.1.AppImage.sha256`
  - `SHA256SUMS-linux-x64.txt`
  - `release-meta.json`（可选）

`release-meta.json` 的 `version` 必须是 `0.3.9-self.1`，URL 指向：

```text
https://github.com/io-oss/Serpent/releases/tag/v0.3.9-self.1
```

示例：

```json
{
  "version": "0.3.9-self.1",
  "date": "2026-11-25",
  "changelog": [
    {
      "zhCN": "基于官方 0.3.9 的个人 Linux 构建，保留 sharp WebAssembly 回退。",
      "en": "Personal Linux build based on upstream 0.3.9, retaining the sharp WebAssembly fallback."
    }
  ],
  "changelogUrl": "https://github.com/io-oss/Serpent/releases/tag/v0.3.9-self.1",
  "downloadUrl": "https://github.com/io-oss/Serpent/releases/tag/v0.3.9-self.1",
  "mandatory": false
}
```

如果使用 `gh`：

```bash
gh release create v0.3.9-self.1 \
  out/make/appimage/Serpent-linux-x86-64-0.3.9-self.1.AppImage \
  out/make/appimage/Serpent-linux-x86-64-0.3.9-self.1.AppImage.sha256 \
  out/make/SHA256SUMS-linux-x64.txt \
  out/make/release-meta.json \
  --title "Serpent v0.3.9-self.1" \
  --notes-file out/make/release-notes.md
```

## 9. 发布后的更新验证

用上一版 `0.3.8-self.N` 启动应用，检查更新应看到：

```text
0.3.8-self.N → 0.3.9-self.1
```

因为 `0.3.9 > 0.3.8`，即使带 `-self.1` 后缀，版本序列仍然是递增的，更新器会正常提示。

再从 `0.3.9-self.1` 检查更新，应显示当前已是最新。

## 10. 回滚

- 保留上一版 AppImage，不要只保留最新版；
- 如果 `0.3.9-self.1` 有问题，直接换回旧 AppImage；
- 修复后发布 `0.3.9-self.2`，不要复用 `0.3.9-self.1` 的 tag 和资产；
- 如果问题来自官方 0.3.9 本身，可以先把 `self/linux` 回退到合并前的提交，或者只回退有问题的官方改动，再发新的 self 版本。

## 11. 发布前检查清单

```text
[ ] main 已同步到 upstream/main（官方 0.3.9）
[ ] self/linux 已合并 main
[ ] SERPENT_GITHUB_REPOSITORY 仍为 io-oss/Serpent
[ ] sharp wasm 回退仍在，且 @img/sharp-wasm32 与 sharp 版本一致
[ ] forge.config.ts / verify-package.mjs 的 Linux 门禁仍在
[ ] npm ci 成功
[ ] npm run typecheck 通过
[ ] tests/worker/sharp-electron-linux.test.ts 通过
[ ] npm run media:verify 通过
[ ] 版本号为 0.3.9-self.1，tag 为 v0.3.9-self.1
[ ] AppImage 构建成功并重命名为更新器要求的名字
[ ] SHA-256 校验通过
[ ] 实际启动、导入图片、重启验证通过
[ ] Release 为正式发布，资产名完整
[ ] 用上一版 self 版本验证应用内更新
```
