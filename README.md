# 打包工作台

前端独立仓库：`pkhosn/v2khd-web`。包含网页界面与服务端授权码入口，不包含三端客户端源码。

Cloudflare 导入本仓库，分支 `main`，构建命令留空，部署命令：

```sh
npx --yes wrangler@4.162.0 deploy --config ci/cloudflare/wrangler.jsonc
```

在 Worker 的 Settings → Variables and Secrets 新增 Secret `BUILD_ACCESS_CODE`，填写自己的授权码（至少 12 位），保存并部署。访问域名为 `app.lionhome.eu.org`。无需配置 Cloudflare Access。

进入流程：打开网页 → 输入授权码 → 进入工作台。未登录时无法获取工作台脚本，登录保持 8 小时。授权码只保存为 Cloudflare Secret，不写入本仓库。

品牌配置仅保存在当前浏览器，支持 JSON 导入导出。点击打包时才将本次配置临时传给私有构建仓库 `pkhosn/v2khd` 的 GitHub Actions，不写入 Git 历史。GitHub Token 只保存在当前页面内存中。

三端软件本身不包含网页授权码功能；客户端构建工作流继续由私有仓库负责。

完整部署步骤见 [部署说明](ci/cloudflare/README.txt)。新入口验收通过后，关闭旧 GitHub Pages 公开入口，避免绕过登录。
