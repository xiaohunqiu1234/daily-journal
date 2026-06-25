# 每日日志 Daily Journal

一个极简的本地日历日志工具。支持 GitHub Pages 一键部署，也可本地直接使用。

## 快速开始

### 方式一：GitHub Pages 部署（推荐）

1. **Fork 或上传本项目到你的 GitHub 仓库**

2. **开启 GitHub Pages**
   - 进入仓库 → Settings → Pages
   - Source 选择 **GitHub Actions**
   - 保存

3. **推送到 main 分支后自动部署**
   ```bash
   git add .
   git commit -m "init"
   git push origin main
   ```

4. **访问地址**
   ```
   https://<你的用户名>.github.io/<仓库名>/
   ```

Actions 执行完毕（约 30 秒）即可访问。后续每次推送 main 分支，自动重新部署。

---

### 方式二：本地直接打开

```
双击 index.html
```

无需服务器，Chrome / Edge / Safari / Firefox 均可直接从文件系统打开。

### 方式三：本地服务器（推荐，数据存项目目录）

```bash
node server.js
# 自定义端口： PORT=8080 node server.js
```

然后访问 `http://localhost:8080`。

此方式下，日志内容会持久化到项目目录的 **`data/journal.json`** 文件，
而不仅仅是浏览器缓存；同时仍镜像一份到 localStorage 作为离线兜底。
首次以此方式打开时，会自动把已有的浏览器 localStorage 缓存内容
合并写入该文件。

---

## 功能

- 月视图日历，有记录的日期自动标点
- 今日警句（自由填写）
- 今日七件事（带勾选，支持划线完成状态）
- 三栏反思区：今日反思 / 事情经过 / 改进措施
- 数据持久化至浏览器 localStorage
- 导出 JSON 备份 / 从 JSON 文件恢复
- 深色模式（跟随系统）
- `Ctrl+S` / `Cmd+S` 快捷保存
- 切换日期 / 月份时自动保存

---

## 数据存储

应用启动时按优先级自动探测三种后端，无论哪种都会镜像一份到浏览器 localStorage
（key `daily_journal_v2`）作为离线缓存：

| 后端 | 触发条件 | 数据存放位置 |
| --- | --- | --- |
| **本地服务器** | 运行 `node server.js` | 项目目录 `data/journal.json` |
| **GitHub Gist 云同步** | 在「云同步」中配置了 Token + Gist | 你的 GitHub 私密 Gist |
| **localStorage** | 以上都没有（如直接双击或线上未配置） | 仅当前浏览器 |

> 合并规则：同一天记录以 `updatedAt` 较新者为准。导入时与现有数据合并，同一天
> 以导入数据优先覆盖。建议定期用「导出备份」另存 JSON。

### GitHub Pages 上的持久化（云同步）

GitHub Pages 是纯静态托管，**无法运行 `node server.js`**。要让线上版本真正持久化
（而不是只存在访问者浏览器里），使用内置的 **GitHub Gist 云同步**：

1. 创建一个仅含 `gist` 权限的 Token：
   [github.com/settings/tokens/new?scopes=gist](https://github.com/settings/tokens/new?scopes=gist&description=daily-journal)
2. 打开应用 → 侧边栏「**云同步**」→ 粘贴 Token → 点「**新建并连接**」
   （首次会自动创建一个私密 Gist，并把当前浏览器里已有的记录上传过去）。
3. 之后所有记录会自动保存到该 Gist。换设备时，填入同一个 Token 和 Gist ID
   即可读到全部历史。

> Token 只保存在你本地浏览器的 localStorage，不会写入代码仓库、也不会随页面公开。
> 私密 Gist 仅你本人可见。未配置云同步时，应用自动退回 localStorage，不会报错。

---

## 文件结构

```
daily-journal/
├── .github/
│   └── workflows/
│       └── deploy.yml   # GitHub Actions 自动部署
├── css/
│   └── style.css
├── js/
│   └── app.js
├── data/                # 本地存储目录（运行 server.js 后生成，已 gitignore）
│   └── journal.json
├── server.js            # 零依赖本地服务器 + 数据读写接口
├── index.html
└── README.md
```

---

## 完全离线使用

图标库默认通过 CDN 加载。如需完全离线，下载图标字体后本地引用：

```bash
# 下载到项目目录
curl -o css/tabler-icons.min.css \
  https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css

# 同时下载字体文件（CSS 内引用了 woff2）
# 或直接用 npm 安装
npm install @tabler/icons-webfont
```

然后修改 `index.html` 中的引用：
```html
<!-- 将这行 -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@tabler/icons-webfont@3.19.0/dist/tabler-icons.min.css">
<!-- 改为 -->
<link rel="stylesheet" href="css/tabler-icons.min.css">
```
