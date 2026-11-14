授权码打包后台 · v2khd-web

访问流程：打开网页 → 输入授权码 → 进入打包工作台。
无需 Cloudflare Access、邮箱或验证码。

Cloudflare 后台部署（关联 GitHub）：
1. Workers & Pages → 创建应用 → 导入 GitHub 仓库，选择 Worker。
2. 导入前端仓库 pkhosn/v2khd-web，分支 main，名称 v2khd-web。
3. 根目录默认，构建命令留空（不要把部署命令填在此处），部署命令：
   npx --yes wrangler@4.162.0 deploy
4. 部署完成后，Worker → Settings → Variables and Secrets → Add：
   名称 BUILD_ACCESS_CODE，类型 Secret，值填写你自己设置的授权码（至少 12 位，建议随机生成）。
   保存并部署。授权码只保存在 Cloudflare 的 Secret 中，不要写进仓库或品牌 JSON。
5. 打开 Worker 控制台显示的 workers.dev 地址，输入授权码进入。
   自定义域名可稍后在 Settings → Domains & Routes 中绑定；默认部署不改动现有 DNS 记录。

如果之前设置过 Cloudflare Access，关闭该 Worker 的 Access 保护，避免先出现邮箱登录页。
未设置授权码时返回 503，页面不会公开。未登录不能访问页面脚本。
登录保持 8 小时；更换 Secret 授权码会使原有登录失效。
错误尝试受每 IP 每分钟 5 次的边缘限流约束（按 Cloudflare 机房计数）。

迁移：先在旧网页导出品牌 JSON，在新域名导入。
旧 GitHub Pages 入口已关闭，自动发布工作流已移除。不要重新开启 Pages，以免绕过网页授权码入口。
进入工作台后，打包连接的目标仓库仍为私有仓库 pkhosn/v2khd。GitHub Token 仍仅用于打包授权，保存在页面内存中。

后续更新代码推送到 main，Cloudflare 自动更新，Secret 授权码不需要重新写进代码。
其他设备上的旧 Git 克隆必须重新克隆，不能合并回已清理的历史。
