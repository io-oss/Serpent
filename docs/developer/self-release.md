# Linux 个人版发布流程（self/linux）

本文是 Serpent 个人 fork（`io-oss/Serpent`）的 Linux AppImage 发布流程，不适用于官方仓库。

## 1. 分支模型

| 分支 | 用途 |
| --- | --- |
| `main` | 纯官方镜像，只通过 `upstream/main` 快进 |
| `self/linux` | 个人修改、版本号、tag 和 AppImage 构建 |
| `backup/*` | 可选的本地上游/修复备份，不参与发布 |

发布物只从 `self/linux` 构建，不要从 `main` 构建。

## 2. 同步官方更新

```bash
git fetch upstream
git switch main
git merge --ff-only upstream/main
git push origin main

git switch self/linux
git merge main
```

如果 `main` 已经和 `upstream/main` 一致，直接跳到 `self/linux` 合并即可。

合并后重点检查：

- `src/shared/load-sharp.ts` 的 Linux wasm 回退是否仍在；
- `src/main/app-update-service.ts` 的 `SERPENT_GITHUB_REPOSITORY` 是否仍为 `io-oss/Serpent`；
- `@img/sharp-wasm32` 是否仍与 `sharp` 版本一致；
- `forge.config.ts` 是否仍会从 Linux 包中剔除原生 sharp 后端。

## 3. 版本号与 tag 约定

格式：

```text
{官方版本}-self.{迭代次数}
```

示例：

```text
0.3.8-self.1
0.3.8-self.2
0.3.9-self.1
```

规则：

- 使用单连字符，不要写 `0.3.8--self.1`；
- 迭代次数从 1 开始，每次对外发布递增；
- 不要使用前导零（`self.01` 不合法）；
- 每次官方基线变化后，迭代次数重置为 1；
- tag 必须是 `v` + 合法 semver，例如 `v0.3.8-self.1`；
- 不要复用同一个版本号发布不同构建。

## 4. 发版前检查清单

在 `self/linux` 上依次确认：

1. `main` 已同步到最新 `upstream/main`，且 `self/linux` 已合入 `main`。
2. 工作区干净，当前分支是 `self/linux`。
3. `SERPENT_GITHUB_REPOSITORY` 指向 `io-oss/Serpent`。
4. sharp wasm 修复仍在：
   - `load-sharp.ts` 会拒绝 `@img/sharp-linux-*` / `@img/sharp-libvips-linux-*`；
   - `package.json` 中 `@img/sharp-wasm32` 与 `sharp` 版本一致。
5. 安装依赖：

   ```bash
   npm ci
   ```

6. 类型检查和 Linux sharp 回归测试：

   ```bash
   npm run typecheck
   node scripts/run-vitest-with-electron.mjs run --config vitest.config.ts tests/worker/sharp-electron-linux.test.ts
   ```

7. 媒体包可用：

   ```bash
   npm run media:ensure
   ```

8. 更新版本号并提交：

   ```bash
   npm version --no-git-tag-version 0.3.8-self.1
   git add package.json package-lock.json
   git commit -m "chore(release): 0.3.8-self.1"
   git tag v0.3.8-self.1
   ```

9. 构建并校验 AppImage（见下一节）。

## 5. 构建 AppImage

### 仅自己机器使用（当前推荐）

在 Kubuntu 26.10 上直接构建，产物以本机 glibc 2.43 为基线，只能在相同或更新的系统上运行：

```bash
rm -rf out/make
npm run make:appimage
```

产物：

```text
out/make/appimage/Serpent-0.3.8-self.1-x86_64.AppImage
```

重命名为更新器要求的名字：

```bash
mv out/make/appimage/Serpent-0.3.8-self.1-x86_64.AppImage \
   out/make/appimage/Serpent-linux-x86-64-0.3.8-self.1.AppImage
```

### 需要兼容 Ubuntu 22.04+（可选）

安装 Docker 后使用 Ubuntu 22.04 基线：

```bash
npm run make:appimage:docker
```

同样重命名为 `Serpent-linux-x86-64-<版本>.AppImage`。

### 校验文件

```bash
npm run release:checksums
```

会生成：

```text
out/make/SHA256SUMS-linux-x64.txt
out/make/appimage/Serpent-linux-x86-64-0.3.8-self.1.AppImage.sha256
```

## 6. 构建后冒烟测试

1. 给 AppImage 加执行权限；
2. 启动应用；
3. 导入一张 JPEG/PNG 图片，确认缩略图生成；
4. 重启应用，确认库能正常打开、没有 Library Worker 139；
5. 在应用内检查更新，确认能识别 fork 的 Release；
6. 保留上一个版本作为回滚。

## 7. 发布到 fork 的 GitHub Releases

发布前确认：

- Release tag 为 `v0.3.8-self.1`；
- **不要**勾选 “Set as a pre-release”；
- **不要**保存为 draft；
- 资产名必须精确匹配更新器约定。

上传资产：

```text
Serpent-linux-x86-64-0.3.8-self.1.AppImage
Serpent-linux-x86-64-0.3.8-self.1.AppImage.sha256
SHA256SUMS-linux-x64.txt
release-meta.json（可选）
```

`release-meta.json` 可参考仓库根目录的 `release-meta.example.json`，其中 `version` 必须等于 `0.3.8-self.1`。

使用 GitHub 网页创建 Release 即可；如果安装了 `gh`：

```bash
gh release create v0.3.8-self.1 \
  out/make/appimage/Serpent-linux-x86-64-0.3.8-self.1.AppImage \
  out/make/appimage/Serpent-linux-x86-64-0.3.8-self.1.AppImage.sha256 \
  out/make/SHA256SUMS-linux-x64.txt \
  --title "Serpent v0.3.8-self.1" \
  --notes-file release-notes.md
```

## 8. 发布后验证

- 从上一个 self 版本检查更新，确认能找到 `v0.3.8-self.1`；
- 下载、校验并启动新 AppImage；
- 确认图片导入、缩略图、重启均正常；
- 若失败，重新发布更高的迭代号，不要修改已发布资产。

## 9. 注意事项

- 首次从官方 `0.3.8` 切换到 `0.3.8-self.1` 必须手动安装；`self` 版本按 semver 低于官方基线，旧版本不会把它当成更新。
- GitHub 的 `releases/latest` 取最近发布的正式 Release，不是 semver 最大者；不要倒序补发旧版本。
- 只发 Linux x64；linux-arm64 仍需先晋升媒体包。
- 本机构建的 AppImage 绑定本机 glibc，不能分发给旧发行版用户。
- 应用内更新下载的是完整 AppImage，用户需要替换旧文件；应用不会原地覆盖正在运行的 AppImage。
