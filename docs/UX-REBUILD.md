# BilimLens — UX and PDF rebuild

## Scope and recovery

Work happens on `ux/report-rebuild` in the existing integration worktree, based on `bilimlens-local` at `2d74463` so the official logo and Russian README are retained. `integration/bilimlens` stays at `7763760`; all earlier worktrees are preserved. Analysis algorithms and thresholds must not change for presentation.

## Audit evidence

This is a source audit until browser access is available. Attempting `next dev` on 127.0.0.1:3100 fails with `listen EPERM`; the browser capture attempt is recorded separately. No before screenshots are claimed. The user's problematic PDF was described but not attached, so its page dimensions/image contents cannot be independently inspected here. Current code calls `window.print()`; no screenshot-export library is present in the inspected report implementation.

| Page | Concrete problem in current code | Implementation direction |
|---|---|---|
| Overview | 15 ranked bars, status list, up to all insights and distribution appear sequentially; no concise leading interpretation | One data-derived finding, 6 priority topics, top 3 actions, secondary distributions disclosed |
| Topics | Ranked bars, heatmap and full sortable table stack in one flow | Select one evidence view; paginated rows and chart slices; detail table disclosed |
| Textbooks | Long warnings/reasons, several charts and all topic rows compete with verdict | Verdict first; common-task dumbbell comparison; methods/topic rows on demand |
| Hours | Parameter form and all explanations precede/duplicate allocation work | Collapsible parameters and detail rows; allocation finding first |
| Simulator | One unbounded editable table and a second comparison table | Budget and comparisons prominent; editable topics paginated with state preserved |
| Errors | Skills/chart/categories/class table/task table stack; show-all tasks is unbounded | Leading skill/task finding, selectable evidence, paginated question/class rows |
| Reports | Full task list explicitly uses previewLimit=Infinity; same numbers repeated across many tables; browser print shares web layout | Short executive preview, separate complete-detail view; dedicated 5-page vector PDF and separate appendix |
| Data/import | Current dataset metadata, import, format tables, demo downloads form one long page | Import first; metadata, format docs and demo downloads disclosed |
| Methodology | All prose/formulas open simultaneously | Linked disclosure sections, opening hash-targeted section automatically |

## Implementation plan

- [x] Shared native disclosures, stable pagination and a finding/action pattern; accessible controls and empty states.
- [x] Group navigation around what happened, why and what to do; subject/grade primary filters, secondary filter disclosure.
- [x] Apply editorial Cyrillic-capable heading font while keeping readable UI body sizes.
- [x] Refactor all nine views for summary → evidence → details, retaining every row and export.
- [x] Add pdf-lib/fontkit with pinned dependency lock and licensed embedded fonts. Render 5 fixed A4 landscape pages using text and vector primitives. Complete tables go to a separately requested paginated appendix.
- [x] Add engine-equivalence, missing-data, long-label, pagination and PDF dimensions/text tests.
- [x] Generate Russian and Kazakh PDFs, render every page, inspect two rounds, fix findings; attempt web QA and record actual limitations.
- [x] TypeScript, lint, tests, production build and final static review. Update README/design/release evidence without claiming blocked browser gates passed.

## Direction

The methodologist should first see a finding, then choose evidence or a decision. Use three navigation groups: what happened (overview/topics), why (skills/textbooks), what to do (hours/simulator/reports), with import/methodology as utilities. Editorial Noto Serif headings and Onest controls share the existing green/neutral semantic palette. No changes to analytical formulas, invented causal explanations or attainment forecasts.


## Реализованный результат

- Левая панель на desktop полностью скрывается кнопкой и возвращается той же кнопкой. Ширина возвращается содержимому; предпочтение сохраняется в localStorage, синхронизируется между вкладками и корректно работает в памяти при недоступном хранилище. Мобильное меню не зависит от этого предпочтения. Четыре теста проверяют хранение/синхронизацию/SSR; браузерный сценарий добавлен, но его запуск заблокирован средой.
- Все девять экранов изменены непосредственно в коде. Обзор начинает с рассчитанного вывода; категории причин и действия отделены навигацией. Темы переключаются между рейтингом и heatmap. Учебники сравниваются точками и интервалами на общей шкале 0–100%. Детализация и методика открываются по запросу.
- Основные таблицы, графики длинных списков, heatmap по классам, вопросы, разбивки, редактируемые часы и список нарушений получили пагинацию. Фильтрация и изменение сортировки возвращают пользователя к началу нового набора; все строки доступны через страницы.
- В импорте есть отдельный просмотр всех принятых ответов и строк учебного плана с пагинацией и CSV-выгрузкой. Ошибочные строки, исключённые при импорте, не подменяются принятыми данными: сведения об исключениях сохраняются в метаданных.
- Отчёты показывают краткий вывод, показатели и пять тематических вкладок. Исходные задания не раздувают главный экран. PDF скачивается непосредственно; отдельная кнопка создаёт приложение. Экспорт не использует `window.print`, screenshot, canvas или размеры окна.
- PDF: пять фиксированных страниц A4 landscape (841,89 × 595,28 pt), настоящий выделяемый текст, векторные диаграммы, источник, период, номера страниц, синтетическая маркировка и ограничения. Полные таблицы доступны отдельно.
- Все новые надписи переведены на девять языков. В PDF встроены Noto Sans regular/bold; для китайского текста лениво загружается дополнительный шрифт. Редкие символы вне покрытия вызывают понятную ошибку, а не невидимую подмену глифа.
- Официальный логотип сохранён. Noto Serif SemiBold добавлен в документированную систему для редакционных заголовков; Onest остался шрифтом контролов и таблиц. Замечание детектора о новом шрифте исправлено обновлением DESIGN.md; подавление правила не применялось.

## Фактически выполненные проверки

| Проверка | Результат |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | PASS, без предупреждений |
| `npm test` | PASS: 172 теста, 15 файлов |
| `BILIMLENS_IN_PROCESS_TSC=1 npm run build:webpack` | PASS: все маршруты приложения |
| `node --check e2e/smoke.mjs` и `e2e/analytics-suite.mjs` | PASS; сценарии адаптированы к раскрытию деталей и прямому PDF-download |
| `npm run pdf:preview` и варианты `--kk`, `--zh` | Созданы реальные основные PDF и приложения |
| `npm run verify:pdf` | PASS: 6 документов, A4 landscape, выделяемые слова на каждой странице, 0 слов вне полей, 0 предупреждений Poppler |
| PDF unit tests | Страницы/размеры, ToUnicode, длинные строки, отсутствие страниц-изображений, недостаточные данные, символы казахского языка, китайский fallback, извлечение текста на всех девяти языках |
| Визуальная проверка PDF | Выполнены повторные циклы рендера/просмотра. Исправлены пустоватые обзорные блоки, размеры колонок и исчезающие китайские глифы. Просмотрены все 5 страниц финального основного отчёта и страницы приложения; отдельно проверены казахский и китайский текст. |
| Независимое чтение кода | Исправлены найденные случаи: «нет проблем» при недостаточных данных, потеря конфликтов плана в UI, неверная область при переходе из вывода. Сохранность строк пагинации проверена тестами. |
| Аналитические алгоритмы | `git diff 2d74463 -- src/lib/analytics src/lib/config src/lib/data/validate-results.ts src/lib/report/report.ts` пуст: алгоритмы не менялись |

Текущие образцы на синтетическом курсе «Алгебра, 8 класс»: основной отчёт — 5 страниц на каждом языке; русское приложение — 17, казахское — 16, китайское — 14 страниц. Число страниц приложения зависит от языка и объёма данных. При полном scope основной отчёт также остаётся пятистраничным.

Артефакты находятся в `output/pdf/`, исключены из Git и воспроизводятся скриптом. PNG-проверки сохранены в `/tmp/bilimlens-ux-pdf-qa/`; это изображения PDF, а не скриншоты сайта. `pdfimages -list` обнаруживает в основном PDF только небольшой логотип, не изображения страниц.

## Открытые условия выпуска

- [ ] Реальный браузерный аудит всех девяти страниц, снимки до/после, сравнение desktop/tablet/mobile и два цикла визуального QA сайта. `next dev` на 127.0.0.1:3100 получает `listen EPERM`, Chromium завершается `sandbox_host_linux.cc ... Operation not permitted`. Альтернативный компьютерный инструмент вернул пустые списки приложений и браузеров. Эти проверки не выполнены и не заменяются серверным рендерингом.
- [ ] Выполнение адаптированных браузерных сценариев импорта/навигации/пагинации/скачивания PDF в среде, разрешающей сервер и Chromium. Прямой PDF-движок и полученные файлы проверены отдельно от клика браузера.
- [ ] Чистая установка зависимостей с доступом к npm registry. DNS registry недоступен, а offline lockfile-install упирается в отсутствующий кеш ранее существовавшего optional-пакета Tailwind. Новые pdf-lib/fontkit взяты из точных локальных установленных копий, закреплены обычными registry URL/integrity в lockfile и проверены через `npm ls`, тесты и production build. Абсолютных/file-зависимостей нет.
- [ ] Проверка обычного Turbopack production-пути в среде без запрета IPC. Проверенный production-путь здесь — Webpack с in-process TypeScript; проверки типов не отключены.

Итог: код UX-перестройки и самостоятельный PDF реализованы; PDF визуально проверен. Полностью закрывать Definition of Done и объявлять подтверждённую готовность сайта к демонстрации до браузерного QA нельзя. Исходные ветки сохранены; публикации и деплоя в рамках этой работы не было.
