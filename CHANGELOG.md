# 修改日志 (Changelog)

## 2026-05-23

### 视频跟踪页 (VideoTrack)

- **新增驱动磁铁转速输入框**：在视频上传卡片中添加 ΩM 数字输入框（单位 RPM），绑定全局状态，跨页面共享
- **新增实验组编号输入框**：同位置添加文本输入框，绑定全局状态
- **新增重新上传按钮**：点击后删除后端旧视频文件、首帧截图、跟踪结果，清空前端状态，保留 ΩM 和实验组编号
- **新增清空跟踪按钮**：仅清空跟踪结果（CSV、图表、进度），保留视频和 ROI
- **新增导入拟合数据区**：跟踪完成后在数据表右侧显示确认窗口，展示 ΩM 和实验组信息，X（拟合转速 ΩD）和 Y（ΩM-ΩD）可编辑，点击"导入"按钮追加一行到数据拟合页，导入成功显示 toast 提示
- **新增布局交换按钮**：转速-时间曲线和 ROI 框选卡片标题栏均有交换按钮，点击可互换两个卡片的位置

### 数据拟合页 (DataFit)

- **fitRows 初始值改为空数组**：打开拟合页时不再预填 4 行空数据
- **导出报告改为 HTML 格式**：包含拟合图像（ECharts PNG base64）、拟合公式、拟合参数表（值+标准误）、R²/RMSE、原始数据表、生成时间戳

### AI 助手页 (AIAssistant)

- **AI 回复支持 Markdown/公式/代码块渲染**：通过 react-markdown + remark-gfm + remark-math + rehype-katex 实现，支持 LaTeX 公式（`$inline$`、`$$display$$`）、标题/加粗/列表/表格、代码块语法高亮

### 侧边栏 (Layout)

- **新增清空上传文件按钮**：红色按钮，点击弹出确认框，确认后调用后端 API 删除 uploads/ 和 results/ 全部文件，完成后显示删除统计

### 后端 (Backend)

- **`video_processor.py`**：新增 `cleanup_video(video_id)` 函数（删除单个视频及关联文件）、`clear_all_uploads()` 函数（清空全部上传和跟踪结果）
- **`main.py`**：新增 `DELETE /api/video/{video_id}` 端点（删除单个视频）、`DELETE /api/uploads` 端点（清空全部）

### 全局状态 (AppState)

- 新增 `driverRpm`、`experimentGroupId` 两对状态，跨页面共享

### Bug 修复

- 修复 `main.py` 中 `StatisticsRequest` 导入错误（D:\codex\4 分支无此功能）

### 仓库同步

- 所有改动同步到英文版（root）和中文版（zh/）
- 推送到 GitHub：`https://github.com/gggwbx/ems-viscometer-opencv.git`
  - `030a012` — feat: 全部功能改动
  - `9c737f8` — fix: 移除 StatisticsRequest 导入
