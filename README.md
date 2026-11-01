# Build Studio

Static interface for a private GitHub Actions build repository. This repository contains only browser HTML, CSS, JavaScript and the Pages deployment workflow.

Brand configuration, client source, build requests and installers remain in the separate private repository. A repository-scoped GitHub token is required to read configuration or submit a build. The page retains the token only in memory and does not write it to localStorage, sessionStorage, cookies, source files or build requests.

Installers are downloaded as per-platform ZIP archives containing the installer and SHA256 manifest. A link to the authenticated GitHub Actions page is also available for full logs and download fallback.
