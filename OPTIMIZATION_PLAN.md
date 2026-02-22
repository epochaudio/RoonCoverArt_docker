# CoverArt 16.9 优化规划（源码版）

目标：在不改变核心功能（Roon 配对、当前播放封面显示、Art Wall 模式）的前提下，提升代码可维护性、部署一致性与运行稳定性。

## 优先级 P0（先做）

- [x] 消除 `app.js` 内重复实现，统一使用 `utils/imageUtils.js`
  - 问题：`app.js` 底部本地 `saveArtwork/getImageStats` 覆盖了 `utils` 实现
  - 目标：恢复图片去重、数量上限、统计逻辑
  - 验收：`app.js` 不再定义重复函数；路由调用 `utils` 导出函数

- [x] 为 Socket.IO 控制事件补充 `transport` 就绪校验
  - 问题：未配对/断连时调用 `transport.*` 会抛错
  - 目标：未连接时返回错误事件/日志，不让进程异常
  - 验收：所有播放控制与设置修改入口在 `transport` 空值时安全返回

- [x] 为 browse HTTP 接口补充 `core`/服务就绪校验
  - 问题：未配对时 `/roonapi/goRefreshBrowse`、`/roonapi/goLoadBrowse` 可触发异常
  - 验收：未连接时返回 503 JSON 错误，不抛未捕获异常

## 优先级 P1（部署一致性）

- [x] 修复 Docker 与配置文档不一致问题（环境变量支持）
  - 目标：支持 `SERVER_PORT`、`ARTWORK_SAVEDIR`、`ARTWORK_AUTOSAVE`、`ARTWORK_FORMAT`
  - 方案：新增 `config/custom-environment-variables.json` + 端口/布尔值规范化
  - 验收：代码路径实际读取环境变量，且 `SERVER_PORT=8080` 时服务监听 8080

- [x] 优化 Dockerfile 启动链路
  - 问题：`entrypoint.sh` 未启用，`su-exec` 未安装，端口被 `CMD --port 3666` 硬编码覆盖
  - 目标：启用入口脚本、修复权限流程、移除硬编码端口覆盖
  - 验收：Dockerfile 使用 `ENTRYPOINT`；镜像内存在 `su-exec`

- [x] 修复配置类型问题（端口字符串）
  - 问题：`config/default.json` 中 `server.port` 为字符串
  - 验收：默认端口改为数字，并在代码中做显式数值转换

## 优先级 P2（前端行为与资源管理）

- [x] 对齐 Art Wall 行为参数（停止播放延时、每次刷新数量）
  - 目标：与说明文档一致（15 秒切换、每轮刷新 3 张）
  - 验收：前端常量与日志同步更新

- [x] 修复前端资源释放中的无效 `URL.revokeObjectURL` 调用
  - 目标：仅对 `blob:` URL 调用，避免误导和无效操作
  - 验收：缓存/颜色提取清理代码使用安全判断

- [x] 补齐 `getPairStatus` Socket 事件响应（与前端保持一致）
  - 验收：客户端发 `getPairStatus` 时服务端可返回 `pairStatus`

## 优先级 P3（后续可选）

- [ ] 增加 `.gitignore`（避免提交 `node_modules`、`config.json`、`images/`）
- [ ] 增加最小化健康检查接口或启动自检日志
- [ ] 为关键模块增加简单单元测试（图片文件命名/去重/数量管理）

## 执行顺序

1. P0 全部完成
2. P1 完成并验证 Docker 启动路径
3. P2 完成并做前端静态检查
4. 最后统一回归检查（`node --check`）

## 回归验证清单（执行阶段使用）

- [x] `node --check app.js`
- [x] `node --check public/js/index.js`
- [x] `node --check utils/imageUtils.js`
- [ ] `docker build`（如本轮需要）
- [ ] 手动验证：未配对状态访问接口不崩溃
- [ ] 手动验证：播放/暂停切换后前端显示模式与定时器行为正常
