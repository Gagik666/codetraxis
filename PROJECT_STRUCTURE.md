# codetraxis — Project Structure

## Корень проекта

```
.gitignore
package.json          ← scripts: dev | build | build:server | build:client | start
bin/
  cli.js              ← CLI entry (prod: node server/dist/index.js | dev: --dev flag)
client/               ← React + Vite frontend
server/               ← Express + WS backend
```

---

## bin/

| Файл | Описание |
|---|---|
| `cli.js` | Prod: запускает `node server/dist/index.js`. Dev (--dev): ts-node-dev + Vite |

---

## server/

```
tsconfig.json         ← outDir: dist, module: commonjs, target: ES2020
package.json
src/
  index.ts            ← HTTP сервер, API роуты, раздача client/dist, watcher
  routes/
    tree.route.ts     ← GET  /api/tree          — файловое дерево
    file.route.ts     ← GET  /api/file          — содержимое файла
    agent.route.ts    ← POST/GET/DELETE /api/agent — install / status / uninstall
  utils/
    agent/
      agentInstaller.ts   ← Генерирует codetraxisAgent/ и инжектирует import в entry-файл
      debugHub.ts         ← WS хаб: /agent (target) → /debug (viewer)
    watcher/
      watcherService.ts   ← chokidar → WS /ws (tree_changed / file_changed)
      gitignoreWatcher.ts ← Перечитывает .gitignore при изменении
    file/
      buildTree.ts        ← Строит дерево файлов, учитывает .gitignore
      gitignoreLoader.ts  ← Парсит .gitignore паттерны
    git/
      getGitStatus.ts     ← Git статус для декораций дерева
dist/                 ← Скомпилированный JS (после npm run build:server)
```

---

## client/

```
vite.config.ts        ← build.outDir: dist | dev proxy → :3333
tsconfig.json / tsconfig.app.json / tsconfig.node.json
src/
  main.tsx            ← React entry
  App.tsx             ← BrowserRouter + Redux Provider
  pages/
    home/
      Home.tsx        ← Главная страница: TopMenu + LeftMenu + FileViewer / DebugPanel
  components/home/
    topMenu/          ← Верхняя панель + кнопки Add/Remove Agent
    leftMenu/         ← Боковая иконка-панель (Files / Debug)
    leftContentTree/  ← Файловое дерево
    treeItem/         ← Один узел дерева (файл / папка)
    addAgentModal/    ← Модалка установки агента
    removeAgentModal/ ← Модалка удаления агента
    fileViewer/
      FileViewer.tsx
      codePane/       ← Monaco editor (read-only)
      previewPane/    ← Превью изображений / SVG / компонентов
      viewModeSwitcher/
    debugPanel/
      DebugPanel.tsx
      DebugPanel.module.css
      utils/
        filters.ts        ← FILTERS: all | network | console
        colors.ts         ← Цвета и заголовки для событий
        formatters.ts
        generateTypes.ts  ← JSON → TypeScript интерфейсы
        parsers.ts
        types.ts
      components/
        TimelineItem/     ← Один элемент таймлайна
        NetworkExpanded/  ← Развёрнутое network событие
        ConsoleExpanded/  ← Развёрнутое console событие
        TypesPanel/       ← Боковая панель генерации TS типов
        EmptyState/
        GenerateTypesButton/
        CopyButton/
        HeadersTable/
        JsonOrText/
  redux/
    Store.ts
    treeSlice/        ← Файловое дерево
    fileSlice/        ← Открытый файл
    debugSlice/
      DebugSlice.ts   ← События (max 500, upsert по id), фильтр, статус агента
      types.ts        ← ConsoleEvent | NetworkEvent | DebugFilter
  hooks/
    useDebugSocket.ts    ← ws://:3333/debug → dispatch addEvent
    useProjectWatcher.ts ← ws://:3333/ws    → reload tree
    redux/
      useRedux.ts
  axios/
    axios.ts
    agent/agentApi.ts    ← install / status / uninstall
    tree/
      treeEndpoints.ts
      treeModel.ts
      treeService.ts
  constants/colors/
    colors.ts
    types.ts
  assets/icons/
    leftMenuIcons/
      FileIcon.tsx
      DebugIcon.tsx
dist/                 ← Собранный фронт (после npm run build:client)
```

---

## codetraxisAgent/ (генерируется в target-проекте)

```
codetraxisAgent/
  shared.ts                         ← WS bridge → ws://:3333/agent, queue, safeSerialize
  index.ts                          ← Всё подключает, экспортирует attachAxios()
  interceptors/
    consoleInterceptor.ts           ← Патчит console.log/info/warn/error
    fetchInterceptor.ts             ← Патчит globalThis.fetch
    xhrInterceptor.ts               ← Патчит XMLHttpRequest
```

---

## Сборка и публикация

```bash
npm run build           # build:server + build:client
npm run build:server    # tsc -p server/tsconfig.json → server/dist/
npm run build:client    # vite build → client/dist/

npm pack --dry-run      # проверить что попадёт в npm (bin + server/dist + client/dist)
npm publish
```

---

## npm publish — что включается (files в package.json)

```
✅ bin/
✅ server/dist/
✅ client/dist/

❌ server/src/
❌ client/src/
❌ node_modules/
❌ tsconfig.json
❌ .env
```


## client/
- README.md
- eslint.config.js
- index.html
- node_modules/
- package-lock.json
- package.json
- pnpm-lock.yaml
- src/
  - App.tsx
  - main.tsx
  - assets/
    - icons/
      - leftMenuIcons/
        - FileIcon.tsx
  - axios/
    - axios.ts
    - tree/
      - treeEndpoints.ts
      - treeModel.ts
      - treeService.ts
  - components/
    - home/
      - leftContentTree/
        - LeftContentTree.module.css
        - LeftContentTree.tsx
      - leftMenu/
        - LeftMenu.module.css
        - LeftMenu.tsx
      - topMenu/
        - TopMenu.module.css
        - TopMenu.tsx
      - treeItem/
        - TreeItem.module.css
        - TreeItem.tsx
  - constants/
    - colors/
      - colors.ts
      - types.ts
  - hooks/
    - redux/
      - useRedux.ts
  - pages/
    - home/
      - Home.module.css
      - Home.tsx
  - redux/
    - Store.ts
    - treeSlice/
      - TreeSlice.ts
      - asyncthunk.ts
      - reducers.ts
      - types.ts
  - tsconfig.app.json
  - tsconfig.json
  - tsconfig.node.json
  - vite.config.ts

## server/
- .env
- eslint.config.js
- node_modules/
- package-lock.json
- package.json
- pnpm-lock.yaml
- src/
  - index.ts
  - routes/
    - tree.route.ts
  - utils/
    - file/
      - buildTree.ts
  - tsconfig.json

---

Этот файл предназначен для быстрого ознакомления с горизонтальной и вертикальной структурой проекта. Используйте его для навигации и планирования изменений.