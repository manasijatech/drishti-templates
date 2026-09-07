import "dotenv/config";
import {
  BoxRenderable,
  createCliRenderer,
  type KeyEvent,
  ScrollBoxRenderable,
  TextAttributes,
  TextRenderable,
} from "@opentui/core";
import { type IngestionProgressEvent, OrderWinIngestionService } from "@order-win/core";
import { connectMongoose, MongoOrderWinRepository } from "@order-win/database";
import { createDrishtiAnnouncementSource } from "@order-win/drishti";

type Row = {
  readonly id: string;
  readonly when: string;
  readonly outcome: string;
  readonly symbol: string;
  readonly company: string;
};

type Counts = {
  fetched: number;
  inserted: number;
  updated: number;
  unchanged: number;
  rejected: number;
};

const palette = {
  background: "#101418",
  border: "#38434f",
  bright: "#f4f7fa",
  dim: "#82909f",
  green: "#4fd18b",
  cyan: "#5cc8ff",
  yellow: "#e6bd69",
};

const renderer = await createCliRenderer({
  backgroundColor: palette.background,
  clearOnShutdown: !process.argv.includes("--once"),
  consoleMode: "disabled",
  exitOnCtrlC: false,
  openConsoleOnError: false,
  targetFps: 15,
  useMouse: true,
});

let terminalWidth = process.stdout.columns ?? 90;
let terminalHeight = process.stdout.rows ?? 24;
let stage = "Starting";
let active = true;
let failed = false;
let page = 0;
let storedCount = 0;
let counts: Counts = { fetched: 0, inserted: 0, updated: 0, unchanged: 0, rejected: 0 };
const rows: Row[] = [];
const spinner = ["|", "/", "-", "\\"];
let spinnerIndex = 0;

const root = new BoxRenderable(renderer, {
  id: "root",
  width: "100%",
  height: "100%",
  flexDirection: "column",
  padding: 1,
  gap: 1,
});
const title = new TextRenderable(renderer, {
  id: "title",
  content: "ORDER WIN INGESTION",
  fg: palette.bright,
  attributes: TextAttributes.BOLD,
});
const statusPanel = new BoxRenderable(renderer, {
  id: "status-panel",
  width: "100%",
  height: 5,
  borderStyle: "rounded",
  borderColor: palette.border,
  paddingX: 1,
  flexDirection: "column",
});
const statusText = new TextRenderable(renderer, {
  id: "status",
  content: "",
  fg: palette.cyan,
});
const countsText = new TextRenderable(renderer, {
  id: "counts",
  content: "",
  fg: palette.dim,
});
const rowsPanel = new BoxRenderable(renderer, {
  id: "rows-panel",
  width: "100%",
  flexGrow: 1,
  borderStyle: "rounded",
  borderColor: palette.border,
  paddingX: 1,
  flexDirection: "column",
});
const headerText = new TextRenderable(renderer, {
  id: "rows-header",
  content: "",
  fg: palette.dim,
  attributes: TextAttributes.BOLD,
  selectable: false,
});
const rowsScroll = new ScrollBoxRenderable(renderer, {
  id: "rows-scroll",
  width: "100%",
  flexGrow: 1,
  scrollY: true,
  stickyScroll: true,
  stickyStart: "top",
  viewportCulling: false,
  verticalScrollbarOptions: {
    showArrows: true,
    trackOptions: {
      foregroundColor: palette.cyan,
      backgroundColor: palette.background,
    },
  },
});
const rowsText = new TextRenderable(renderer, {
  id: "rows",
  content: "",
  fg: palette.bright,
  selectable: true,
});
const footer = new TextRenderable(renderer, {
  id: "footer",
  content: "",
  fg: palette.dim,
});

statusPanel.add(statusText);
statusPanel.add(countsText);
rowsScroll.add(rowsText);
rowsPanel.add(headerText);
rowsPanel.add(rowsScroll);
root.add(title);
root.add(statusPanel);
root.add(rowsPanel);
root.add(footer);
renderer.root.add(root);
rowsScroll.focus();

function clip(value: string, width: number) {
  if (width <= 0) return "";
  if (value.length <= width) return value.padEnd(width);
  if (width === 1) return value.slice(0, 1);
  return `${value.slice(0, width - 1)}…`;
}

function tableLine(row: Row) {
  const innerWidth = Math.max(48, terminalWidth - 6);
  const companyWidth = Math.max(14, innerWidth - 41);
  return `${clip(row.when, 11)}  ${clip(row.outcome, 10)}  ${clip(row.symbol, 12)}  ${clip(row.company, companyWidth)}`;
}

function render() {
  const indicator = active ? spinner[spinnerIndex % spinner.length] : "✓";
  const pageLabel = page > 0 ? ` · page ${page}` : "";
  statusText.content = `${indicator} ${stage}${pageLabel}`;
  statusText.fg = failed ? palette.yellow : active ? palette.cyan : palette.green;
  countsText.content = [
    `${storedCount} stored  ·  ${counts.fetched} fetched`,
    `${counts.inserted} new  ·  ${counts.updated} updated  ·  ${counts.unchanged} unchanged  ·  ${counts.rejected} rejected`,
  ].join("\n");

  const header = tableLine({
    id: "header",
    when: "WHEN",
    outcome: "RESULT",
    symbol: "SYMBOL",
    company: "COMPANY",
  });
  const separatorWidth = Math.max(1, Math.min(terminalWidth - 6, 110));
  headerText.content = [header, "-".repeat(separatorWidth)].join("\n");
  rowsText.content = rows.length > 0 ? rows.map(tableLine).join("\n") : "Waiting for rows…";
  renderFooter();
}

function renderFooter() {
  const visibleRows = Math.max(1, terminalHeight - 15);
  const totalRows = rows.length;
  const firstVisible =
    totalRows === 0 ? 0 : Math.min(totalRows, Math.floor(rowsScroll.scrollTop) + 1);
  const lastVisible = Math.min(totalRows, firstVisible + visibleRows - 1);
  footer.content = `↑↓/wheel move  ·  PgUp/PgDn  ·  Home/End  ·  ${firstVisible}-${lastVisible} of ${totalRows}  ·  q quit`;
}

function liveTime() {
  return new Date().toLocaleTimeString("en-GB", { hour12: false });
}

function storedTime(value: Date | null) {
  if (!value) return "-";
  return value.toISOString().slice(5, 16).replace("T", " ");
}

function upsertRow(row: Row) {
  const existingIndex = rows.findIndex((existing) => existing.id === row.id);
  if (existingIndex >= 0) rows.splice(existingIndex, 1);
  rows.unshift(row);
  render();
}

function handleProgress(event: IngestionProgressEvent) {
  counts = {
    fetched: event.run.recordsFetched,
    inserted: event.run.recordsInserted,
    updated: event.run.recordsUpdated,
    unchanged: event.run.recordsUnchanged,
    rejected: event.run.recordsRejected,
  };
  if (event.type === "run-started") stage = "Reading tracked symbols";
  if (event.type === "page-fetched") {
    page = event.page;
    stage = `Processing ${event.rowCount} ${event.rowCount === 1 ? "row" : "rows"}`;
  }
  if (event.type === "row-processed") {
    stage = "Saving announcements";
    const exists = rows.some((row) => row.id === event.sourceAnnouncementId);
    if (!exists && event.outcome !== "rejected") storedCount += 1;
    upsertRow({
      id: event.sourceAnnouncementId,
      when: liveTime(),
      outcome: event.outcome,
      symbol: event.symbol,
      company: event.companyName ?? "-",
    });
  }
  if (event.type === "run-completed") {
    active = false;
    stage = "Complete";
  }
  render();
}

renderer.on("resize", (width, height) => {
  terminalWidth = Math.max(width, 40);
  terminalHeight = Math.max(height, 16);
  render();
});

let connection: Awaited<ReturnType<typeof connectMongoose>> | null = null;
let shuttingDown = false;
const timer = setInterval(() => {
  spinnerIndex += 1;
  if (active) render();
}, 120);

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  if (connection) await connection.close();
  renderer.destroy();
  process.exit(exitCode);
}

renderer.keyInput.on("keypress", (key: KeyEvent) => {
  if (key.name === "q" || (key.ctrl && key.name === "c")) void shutdown();
  if (key.name === "j") rowsScroll.scrollBy(1);
  if (key.name === "k") rowsScroll.scrollBy(-1);
  queueMicrotask(renderFooter);
});

function required(name: "MONGODB_URI" | "DRISHTI_API_KEY") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function integer(name: string, fallback: number) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

async function runLive() {
  const mongodbUri = required("MONGODB_URI");
  const apiKey = required("DRISHTI_API_KEY");
  stage = "Connecting to MongoDB";
  render();
  connection = await connectMongoose(mongodbUri);
  const repository = new MongoOrderWinRepository(connection);
  stage = "Loading stored order wins";
  render();

  let cursor: string | null = null;
  do {
    const result = await repository.list({ limit: 100, ...(cursor ? { cursor } : {}) });
    for (const orderWin of result.items) {
      rows.push({
        id: orderWin.sourceAnnouncementId,
        when: storedTime(orderWin.announcedAt),
        outcome: "stored",
        symbol: orderWin.symbol,
        company: orderWin.companyName ?? "-",
      });
    }
    cursor = result.nextCursor;
    storedCount = rows.length;
    stage = `Loaded ${storedCount} stored order wins`;
    render();
  } while (cursor);

  stage = "Requesting Drishti";
  render();

  const lookbackMinutes = integer("INGESTION_LOOKBACK_MINUTES", 15);
  const to = new Date();
  const from = new Date(to.getTime() - lookbackMinutes * 60_000);
  const service = new OrderWinIngestionService(
    createDrishtiAnnouncementSource({
      apiKey,
      baseUrl: process.env.DRISHTI_BASE_URL ?? "https://developers.manasija.in",
      timeoutMs: integer("DRISHTI_TIMEOUT_MS", 30_000),
    }),
    repository,
    {
      pageSize: integer("INGESTION_PAGE_SIZE", 50),
      maxPages: integer("INGESTION_MAX_PAGES", 100),
      lockDurationMs: 15 * 60 * 1_000,
      onProgress: handleProgress,
    },
  );
  await service.ingest({ from, to, trigger: "manual" });
}

async function runDemo() {
  rows.push(
    {
      id: "announcement-bel",
      when: "09-07 09:15",
      symbol: "BEL",
      company: "Bharat Electronics",
      outcome: "stored",
    },
    {
      id: "announcement-rvnl",
      when: "09-06 16:40",
      symbol: "RVNL",
      company: "Rail Vikas Nigam",
      outcome: "stored",
    },
  );
  storedCount = rows.length;
  stage = `Loaded ${storedCount} stored order wins`;
  render();
  await Bun.sleep(350);

  const demoRows = [
    {
      id: "announcement-tcs",
      symbol: "TCS",
      company: "Tata Consultancy Services",
      outcome: "inserted",
    },
    {
      id: "announcement-bel",
      symbol: "BEL",
      company: "Bharat Electronics",
      outcome: "unchanged",
    },
    {
      id: "announcement-rvnl",
      symbol: "RVNL",
      company: "Rail Vikas Nigam",
      outcome: "updated",
    },
    {
      id: "announcement-lt",
      symbol: "LT",
      company: "Larsen & Toubro",
      outcome: "inserted",
    },
  ];
  page = 1;
  stage = "Fetching Drishti announcements";
  render();
  for (const row of demoRows) {
    await Bun.sleep(260);
    counts = {
      ...counts,
      fetched: counts.fetched + 1,
      inserted: counts.inserted + (row.outcome === "inserted" ? 1 : 0),
      updated: counts.updated + (row.outcome === "updated" ? 1 : 0),
      unchanged: counts.unchanged + (row.outcome === "unchanged" ? 1 : 0),
    };
    if (!rows.some((existing) => existing.id === row.id)) storedCount += 1;
    stage = "Saving announcements";
    upsertRow({ ...row, when: liveTime() });
  }
  active = false;
  stage = "Demo complete";
  render();
}

render();
try {
  if (process.argv.includes("--demo")) await runDemo();
  else await runLive();
  if (process.argv.includes("--once")) {
    await Bun.sleep(250);
    await shutdown();
  }
} catch (error) {
  active = false;
  failed = true;
  stage = error instanceof Error ? error.message : "Ingestion failed";
  footer.content = "q quit · check configuration and try again";
  render();
  if (process.argv.includes("--once")) {
    await Bun.sleep(250);
    await shutdown(1);
  }
}
