const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const rw = require("rw");
const url = require("url");

const defaultChromeBin = "/usr/bin/chromium-browser";
if (!process.env.CHROME_BIN && fs.existsSync(defaultChromeBin)) {
    process.env.CHROME_BIN = defaultChromeBin;
}

const puppeteer = require("puppeteer");

const {program} = require("commander");

let uriArg = null;
let outputArg = null;

if (!process.defaultApp) {
    process.argv.unshift("--");
}

const addHeader = (header, arr) => {
    arr.push(header);
    return arr;
}

const parseInteger = value => parseInt(value, 10);
const parsePositiveInteger = value => {
    const intValue = parseInteger(value);
    if (!Number.isInteger(intValue) || intValue <= 0) {
        throw new Error("Value must be a positive integer");
    }
    return intValue;
};
const parseScale = value => {
    const scale = parseFloat(value);
    if (Number.isNaN(scale)) {
        throw new Error("Zoom must be a number");
    }
    return Math.min(Math.max(scale, 0.1), 2);
};
const parseDeviceScaleFactor = value => {
    const scale = parseFloat(value);
    if (Number.isNaN(scale) || scale <= 0) {
        throw new Error("Device scale factor must be a positive number");
    }
    return Math.min(scale, 4);
};
const parseShadowMode = value => {
    const mode = String(value).toLowerCase();
    if (!["flat", "native", "safe", "none"].includes(mode)) {
        throw new Error("Shadow mode must be one of: flat, native, safe, none");
    }
    return mode;
};
const parsePdfRenderMode = value => {
    const mode = String(value).toLowerCase();
    if (!["auto", "raster", "vector"].includes(mode)) {
        throw new Error("PDF render mode must be one of: auto, raster, vector");
    }
    return mode;
};

program
    .version("1.0.0")
    .description("convert HTML to PDF or PNG via stdin or a local / remote URI")
    .option("-L, --log", "enable verbose", false)
    .option("--pdf", "convert to pdf", false)
    .option("--png", "convert to png", false)
    .option("-T, --timeout <seconds>", "seconds before timing out (default: 120)", parseInteger, 120)
    .option("-D, --delay <milliseconds>", "milliseconds delay before saving (default: 200)", parseInteger, 200)
    .option("-P, --pagesize <size>", "page size of the generated PDF (default: A4)", /^(A3|A4|A5|Legal|Letter|Tabloid)$/i, "A4")
    .option("-M, --margins <marginsType>", "margins to use when generating the PDF (default: standard)", /^(standard|none|minimal)$/i, "standard")
    .option("-Z, --zoom <factor>", "zoom factor for higher scale rendering (default: 1 - represents 100%)", parseScale, 1)
    .option("--viewport-width <pixels>", "browser viewport width before printing (default: 800)", parsePositiveInteger, 800)
    .option("--viewport-height <pixels>", "browser viewport height before printing (default: 600)", parsePositiveInteger, 600)
    .option("--device-scale-factor <factor>", "raster/canvas render quality multiplier (default: 2)", parseDeviceScaleFactor, 2)
    .option("--pdf-render-mode <mode>", "PDF rendering mode: auto, raster for exact browser appearance, or vector for selectable text (default: auto)", parsePdfRenderMode, "auto")
    .option("--shadow-mode <mode>", "PDF shadow handling: native, safe, flat, or none (default: native)", parseShadowMode, "native")
    .option("-S, --stdout", "write conversion to stdout")
    .option("-A, --aggressive", "aggressive mode / runs dom-distiller")
    .option("-B, --bypass", "bypasses paywalls on digital publications (experimental feature)")
    .option("-H, --http-header <key:value>", "add custom headers to request", addHeader, [])
    .option("--proxy <url>", "use proxy to load remote HTML")
    .option("--no-portrait", "render in landscape")
    .option("--no-background", "omit CSS backgrounds")
    .option("--transparent", "hides default white background and allows generating pdfs with transparency.", false)
    .option("--no-cache", "disables caching")
    .option("--ignore-certificate-errors", "ignores certificate errors", true)
    .option("--ignore-gpu-blacklist", "Enables GPU in Docker environment")
    .option("--wait-for-status", "Wait until window.status === WINDOW_STATUS (default: wait for page to load)", false)
    .arguments("<URI> [output]")
    .action((uri, output) => {
        uriArg = uri;
        outputArg = output;
    })
    .parse(process.argv.slice(1));

const options = program.opts();
const conversionType = options.png ? "png" : "pdf";
const rawArgs = process.argv.slice(1);
const hasTimeoutOption = rawArgs.some(arg => arg === "-T" || arg.startsWith("-T") || arg === "--timeout" || arg.startsWith("--timeout="));
const hasDelayOption = rawArgs.some(arg => arg === "-D" || arg.startsWith("-D") || arg === "--delay" || arg.startsWith("--delay="));

// Display help information by default
if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(1);
}

if (!uriArg) {
    console.error("No URI given. Set the URI to `-` to pipe HTML via stdin.");
    process.exit(1);
}

// Handle stdin
if (uriArg === "-") {
    let base64Html = Buffer.from(rw.readFileSync("/dev/stdin", "utf8"), "utf8").toString("base64");
    uriArg = "data:text/html;base64," + base64Html;
// Handle local paths
} else if (!uriArg.toLowerCase().startsWith("http") && !uriArg.toLowerCase().startsWith("chrome://")) {
    uriArg = url.format({
        protocol: "file",
        pathname: path.resolve(uriArg),
        slashes: true
    });
}

// Generate SHA1 hash if no output is specified
if (!outputArg) {
    const shasum = crypto.createHash("sha1");
    shasum.update(uriArg);
    outputArg = shasum.digest("hex") + `.${conversionType}`;
}

// Add custom headers if specified
let extraHeaders = options.httpHeader || [];

// Toggle cache headers
if (!options.cache) {
    extraHeaders.push("pragma: no-cache");
}

const puppeteerHeaders = extraHeaders.reduce((c, i) => {
    const [key, value] = i.split(":");
    c[key.trim()] = value.trim();
    return c;
}, {});

const args = () => {
    let o = {
        "headless": true,
        "dumpio": options.log && !options.stdout,
        "protocolTimeout": 0,
        "timeout": 0,
        "args": [
            '--headless=new',
            '--no-sandbox',
            '--disable-web-security',
	'--disable-setuid-sandbox',
      '--disable-dev-shm-usage', // Avoid issues with shared memory.
      '--disable-background-timer-throttling', // Prevent throttling of timers in background tabs.
      '--disable-renderer-backgrounding', // Keep the renderer processes alive when not in the foreground.
      '--disable-backgrounding-occluded-windows', // Disable backgrounding of windows occluded by other windows.
      '--disable-breakpad', // Disable crash reporting.
      '--disable-features=TranslateUI', // Disable built-in translate.
      '--disable-sync', // Disable browser sign-in and sync features.
      '--disable-extensions', // Disable extensions that could slow down processing.
      '--disable-default-apps', // Disable default apps.
            '--disable-features=IsolateOrigins',
            '--disable-site-isolation-trials',
            '--disable-features=BlockInsecurePrivateNetworkRequests',
            '--no-zygote',
            '--safebrowsing-disable-auto-update',
            '--run-all-compositor-stages-before-draw',
            '--disable-translate',
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-background-timer-throttling',
            '--disable-client-side-phishing-detection',
            '--disable-sync',
            '--disable-default-apps',
            '--disable-browser-side-navigation',
            '--disable-hang-monitor',
            '--disable-prompt-on-repost',
            '--no-first-run',
            '--mute-audio',
            '--hide-scrollbars',
            '--disable-dev-shm-usage',
            '--disable-setuid-sandbox',
            '--disable-accelerated-2d-canvas',
            '--devtools-flags=disable'
        ]
    };

    if(process.env.CHROME_BIN) {
        if (!options.stdout) {
            console.info("Set chromium path to: ", process.env.CHROME_BIN);
        }
        o["executablePath"] = process.env.CHROME_BIN
    }

    if (options.proxy) {
        if (!options.stdout) {
            console.info("Using proxy: ", options.proxy);
        }
        o.args.push(`--proxy-server=${options.proxy}`);
    }

    if (options.ignoreGpuBlacklist) {
        o.args.push("--disable-gpu");
    }

    o.ignoreHTTPSErrors = options.ignoreCertificateErrors;

    return o;
}

const MarginEnum = {
    "standard": {"bottom": 0, "left": 0, "right": 0, "top": 0},
    "none": {"bottom": 1, "left": 1, "right": 1, "top": 1},
    "minimal": {"bottom": 2, "left": 2, "right": 2, "top": 2},
};

const pageSize = String(options.pagesize).toUpperCase();
const marginType = String(options.margins).toLowerCase();

const pdfOptions = {
    format: pageSize,
    margin: MarginEnum[marginType],
    printBackground: options.background,
    omitBackground: options.transparent,
    landscape: !options.portrait,
    preferCSSPageSize: true,
    scale: options.zoom,
    timeout: options.waitForStatus ? 0 : options.timeout * 1000,
};

const pngOptions = {
    fullPage: true,
    omitBackground: options.transparent,
};

const renderDelayMs = hasDelayOption ? options.delay : (hasTimeoutOption ? options.timeout * 1000 : options.delay);

(async () => {
    if (!options.stdout) {
        console.time(`${conversionType.toUpperCase()} Conversion`);
    }

    const browser = await puppeteer.launch(args());

    try {
        const page = await browser.newPage();

        await page.setDefaultNavigationTimeout(options.timeout * 1000);
        await page.setExtraHTTPHeaders(puppeteerHeaders);
        await page.setViewport({
            width: options.viewportWidth,
            height: options.viewportHeight,
            deviceScaleFactor: options.deviceScaleFactor,
        });

        const result = await page.goto(uriArg, {waitUntil: "load"});
        if (result && result.status() !== 200) {
            const err = new Error(`Error loading page: ${result.status()}`);
            err.exitCode = 3;
            throw err;
        }

        // Load plugins
        const mediaPlugin = fs.readFileSync(path.join(__dirname, "./plugin_media.js"), "utf8");
        let plugins = mediaPlugin + "\n";

        if (options.aggressive) {
            const distillerPlugin = fs.readFileSync(path.join(__dirname, "./plugin_domdistiller.js"), "utf8");
            plugins += distillerPlugin + "\n";
        }
        if (options.waitForStatus) {
            const windowStatusPlugin = fs.readFileSync(path.join(__dirname, "./plugin_window-status.js"), "utf8");
            plugins += windowStatusPlugin + "\n";
        }

        await page.evaluate(plugins);
        await applyPrintQuality(page);
        await waitForRenderReady(page);

        if (!options.waitForStatus) {
            await wait(renderDelayMs);
        }
        const data = await print(page);
        await output(data);
    } finally {
        await closeBrowser(browser);
    }
})()
    .then(() => process.exit(0))
    .catch(err => {
        console.error(err);
        process.exit(err.exitCode || 1);
    });

const wait = milliseconds => new Promise(resolve => {
    setTimeout(resolve, milliseconds);
});

const waitForRenderReady = async page => {
    const timeoutMs = Math.max(options.timeout * 1000, 0);
    const networkIdleTimeout = Math.min(timeoutMs, 5000);

    if (networkIdleTimeout > 0 && typeof page.waitForNetworkIdle === "function") {
        await page.waitForNetworkIdle({
            idleTime: Math.max(options.delay, 500),
            timeout: networkIdleTimeout,
        }).catch(() => {});
    }

    await Promise.race([
        page.evaluate(async () => {
            if (document.fonts && document.fonts.ready) {
                await document.fonts.ready;
            }

            await Promise.all(Array.from(document.images)
                .filter(img => !img.complete)
                .map(img => new Promise(resolve => {
                    img.addEventListener("load", resolve, {once: true});
                    img.addEventListener("error", resolve, {once: true});
                })));
        }),
        wait(timeoutMs || 1000),
    ]);
};

const applyPrintQuality = async page => {
    await page.addStyleTag({
        content: `
            @media print {
                *, *::before, *::after {
                    -webkit-print-color-adjust: exact !important;
                    print-color-adjust: exact !important;
                    animation: none !important;
                    transition: none !important;
                }
            }
        `,
    });

    if (options.shadowMode === "native") {
        return;
    }

    if (options.shadowMode === "flat" || options.shadowMode === "none") {
        await page.addStyleTag({
            content: `
                @media print {
                    *, *::before, *::after {
                        box-shadow: none !important;
                        text-shadow: none !important;
                        filter: none !important;
                        -webkit-filter: none !important;
                        backdrop-filter: none !important;
                        -webkit-backdrop-filter: none !important;
                    }
                }
            `,
        });
        return;
    }

    await page.addStyleTag({
        content: `
            @media print {
                html.athenapdf-shadow-safe *::before,
                html.athenapdf-shadow-safe *::after {
                    box-shadow: none !important;
                    filter: none !important;
                    -webkit-filter: none !important;
                    backdrop-filter: none !important;
                    -webkit-backdrop-filter: none !important;
                }
            }
        `,
    });

    await page.evaluate(() => {
        document.documentElement.classList.add("athenapdf-shadow-safe");

        const safeBoxShadow = "0 0 0 1px rgba(148, 163, 184, 0.18)";
        const transparentShadow = /rgba?\(\s*0\s*,\s*0\s*,\s*0\s*(?:,\s*0\s*)?\)/i;

        for (const element of Array.from(document.querySelectorAll("*"))) {
            const style = window.getComputedStyle(element);
            const boxShadow = style.boxShadow;
            const filter = style.filter || style.webkitFilter;
            const backdropFilter = style.backdropFilter || style.webkitBackdropFilter;

            if (boxShadow && boxShadow !== "none" && !transparentShadow.test(boxShadow)) {
                element.style.boxShadow = boxShadow.includes("inset") ? "none" : safeBoxShadow;
            }

            if (filter && filter !== "none" && /drop-shadow|blur/i.test(filter)) {
                element.style.filter = "none";
                element.style.webkitFilter = "none";
            }

            if (backdropFilter && backdropFilter !== "none") {
                element.style.backdropFilter = "none";
                element.style.webkitBackdropFilter = "none";
            }
        }
    });
};

const closeBrowser = async browser => {
    const browserProcess = typeof browser.process === "function" ? browser.process() : null;

    try {
        browser.disconnect();
    } catch (err) {
        // Browser may already be closed by Chromium after a fatal launch/runtime error.
    }

    if (browserProcess && !browserProcess.killed) {
        browserProcess.kill("SIGKILL");
        await wait(250);
    }
};

const print = page =>
    conversionType === 'pdf' ? printPDF(page) : page.screenshot(pngOptions);

const printPDF = async page => {
    if (options.pdfRenderMode === "vector") {
        return page.pdf(pdfOptions);
    }

    const pagedPageCount = await getPagedPageCount(page);

    if (options.pdfRenderMode === "auto") {
        if (pagedPageCount === 0) {
            return page.pdf(pdfOptions);
        }

        const hasRenderablePagedPages = await waitForRenderablePagedPages(page);
        if (!hasRenderablePagedPages) {
            return page.pdf(pdfOptions);
        }
    } else if (pagedPageCount > 0) {
        const hasRenderablePagedPages = await waitForRenderablePagedPages(page);
        if (!hasRenderablePagedPages) {
            return page.pdf(pdfOptions);
        }
    }

    return rasterPDF(page);
};

const getPagedPageCount = page => {
    return page.evaluate(() => document.querySelectorAll(".pagedjs_page").length);
};

const waitForRenderablePagedPages = async page => {
    const timeoutMs = Math.min(Math.max(options.timeout * 1000, 1000), 10000);

    try {
        await page.waitForFunction(() => {
            const pages = Array.from(document.querySelectorAll(".pagedjs_page"));
            if (pages.length === 0) {
                return false;
            }

            return pages.some(pageElement => {
                const rect = pageElement.getBoundingClientRect();
                if (!rect.width || !rect.height) {
                    return false;
                }

                if (pageElement.textContent && pageElement.textContent.trim().length > 0) {
                    return true;
                }

                return Boolean(pageElement.querySelector("img, svg, canvas, table, video, picture, [style*='background']"));
            });
        }, {timeout: timeoutMs, polling: 100});
        return true;
    } catch (err) {
        return false;
    }
};

const rasterPDF = async page => {
    const pages = await captureRasterPages(page);
    const first = pages[0];
    const html = `
        <!doctype html>
        <html>
            <head>
                <style>
                    @page {
                        size: ${first.width}px ${first.height}px;
                        margin: 0;
                    }
                    html,
                    body {
                        margin: 0;
                        padding: 0;
                        background: ${options.transparent ? "transparent" : "white"};
                    }
                    .athenapdf-raster-page {
                        width: ${first.width}px;
                        height: ${first.height}px;
                        margin: 0;
                        padding: 0;
                        page-break-after: always;
                        break-after: page;
                        overflow: hidden;
                    }
                    .athenapdf-raster-page:last-child {
                        page-break-after: auto;
                        break-after: auto;
                    }
                    .athenapdf-raster-page img {
                        display: block;
                        width: 100%;
                        height: 100%;
                    }
                </style>
            </head>
            <body>
                ${pages.map(pageImage => `
                    <div class="athenapdf-raster-page">
                        <img src="data:image/png;base64,${pageImage.base64}" alt="">
                    </div>
                `).join("")}
            </body>
        </html>
    `;

    await page.setContent(html, {waitUntil: "load"});
    return page.pdf({
        width: `${first.width}px`,
        height: `${first.height}px`,
        margin: {"bottom": 0, "left": 0, "right": 0, "top": 0},
        printBackground: true,
        omitBackground: options.transparent,
        preferCSSPageSize: true,
        timeout: options.waitForStatus ? 0 : options.timeout * 1000,
    });
};

const captureRasterPages = async page => {
    const pagedElements = await page.$$(".pagedjs_page");
    const pageElements = pagedElements.length > 0 ? pagedElements : [null];
    const pages = [];

    for (const pageElement of pageElements) {
        let image;
        let bounds;

        if (pageElement) {
            bounds = await pageElement.boundingBox();
            image = await pageElement.screenshot({
                omitBackground: options.transparent,
                type: "png",
            });
        } else {
            bounds = await page.evaluate(() => ({
                width: Math.ceil(Math.max(
                    document.documentElement.scrollWidth,
                    document.body ? document.body.scrollWidth : 0,
                    window.innerWidth
                )),
                height: Math.ceil(Math.max(
                    document.documentElement.scrollHeight,
                    document.body ? document.body.scrollHeight : 0,
                    window.innerHeight
                )),
            }));
            image = await page.screenshot({
                fullPage: true,
                omitBackground: options.transparent,
                type: "png",
            });
        }

        pages.push({
            base64: image.toString("base64"),
            width: Math.ceil(bounds.width),
            height: Math.ceil(bounds.height),
        });
    }

    return pages;
};

const output = data => new Promise((resolve, reject) => {
    const outputPath = path.isAbsolute(outputArg) ? outputArg : path.join(process.cwd(), outputArg);

    if (options.stdout) {
        process.stdout.write(data, err => {
            if (err) {
                reject(err);
                return;
            }
            complete();
            resolve();
        });
        return;
    }

    fs.writeFile(outputPath, data, err => {
        if (err) {
            reject(err);
            return;
        }

        console.info(`Converted '${uriArg}' to ${conversionType}: '${outputArg}'`);
        complete();
        resolve();
    });
});

const complete = () => {
    if (!options.stdout) {
        console.timeEnd(`${conversionType.toUpperCase()} Conversion`);
    }
};
