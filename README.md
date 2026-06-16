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

### 方式三：本地 HTTP 服务

```bash
# Python
python3 -m http.server 8080

# Node.js
npx serve .
```

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

## 数据说明

数据保存在**浏览器本地** localStorage，key 为 `daily_journal_v2`。

> 清除浏览器缓存会丢失数据，请定期使用「导出备份」功能保存 JSON 文件。

导入时与现有数据合并，同一天记录以导入数据优先覆盖。

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
