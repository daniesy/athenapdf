const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const rw = require("rw");
const url = require("url");
const puppeteer =  process.env.CHROME_BIN ? require("puppeteer-core") : require("puppeteer");

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

program
    .version("1.0.0")
    .description("convert HTML to PDF or PNG via stdin or a local / remote URI")
    .option("--pdf", "convert to pdf", false)
    .option("--png", "convert to png", false)
    .option("-T, --timeout <seconds>", "seconds before timing out (default: 120)", parseInt)
    .option("-D, --delay <milliseconds>", "milliseconds delay before saving (default: 200)", parseInt)
    .option("-P, --pagesize <size>", "page size of the generated PDF (default: A4)", /^(A3|A4|A5|Legal|Letter|Tabloid)$/i, "A4")
    .option("-M, --margins <marginsType>", "margins to use when generating the PDF (default: standard)", /^(standard|none|minimal)$/i, "standard")
    .option("-Z --zoom <factor>", "zoom factor for higher scale rendering (default: 1 - represents 100%)", parseInt)
    .option("-S, --stdout", "write conversion to stdout")
    .option("-A, --aggressive", "aggressive mode / runs dom-distiller")
    .option("-B, --bypass", "bypasses paywalls on digital publications (experimental feature)")
    .option("-H, --http-header <key:value>", "add custom headers to request", addHeader, [])
    .option("--proxy <url>", "use proxy to load remote HTML")
    .option("--no-portrait", "render in landscape")
    .option("--no-background", "omit CSS backgrounds")
    .option("--transparent", "hides default white background and allows generating pdfs with transparency.", false)
    .option("--no-cache", "disables caching")
    .option("--ignore-certificate-errors", "ignores certificate errors", false)
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

// Display help information by default
if (!process.argv.slice(2).length) {
    program.outputHelp();
    process.exit(1);
}

if (!uriArg) {
    console.error("No URI given. Set the URI to `-` to pipe HTML via stdin.");
}

// Handle stdin
if (uriArg === "-") {
    let base64Html = new Buffer(rw.readFileSync("/dev/stdin", "utf8"), "utf8").toString("base64");
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
    return puppeteerHeaders;
}, {});

const minimal_args = [
    '--autoplay-policy=user-gesture-required',
    '--disable-background-networking',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-breakpad',
    '--disable-client-side-phishing-detection',
    '--disable-component-update',
    '--disable-default-apps',
    '--disable-dev-shm-usage',
    '--disable-domain-reliability',
    '--disable-extensions',
    '--disable-features=AudioServiceOutOfProcess',
    '--disable-hang-monitor',
    '--disable-ipc-flooding-protection',
    '--disable-notifications',
    '--disable-offer-store-unmasked-wallet-cards',
    '--disable-popup-blocking',
    '--disable-print-preview',
    '--disable-prompt-on-repost',
    '--disable-renderer-backgrounding',
    '--disable-setuid-sandbox',
    '--disable-speech-api',
    '--disable-sync',
    '--hide-scrollbars',
    '--ignore-gpu-blacklist',
    '--metrics-recording-only',
    '--mute-audio',
    '--no-default-browser-check',
    '--no-first-run',
    '--no-pings',
    '--no-sandbox',
    '--no-zygote',
    '--password-store=basic',
    '--use-gl=swiftshader',
    '--use-mock-keychain',
];

const args = () => {
    let o = {
        "headless": true,
        "args": [
            '--no-sandbox',
            '--headless',
            '--disable-dev-shm-usage',
            ...minimal_args
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

    if (options.ignoreCertificateErrors) {
        o.ignoreHTTPSErrors = true;
    }

    return o;
}

const MarginEnum = {
    "standard": {"bottom": 0, "left": 0, "right": 0, "top": 0},
    "none": {"bottom": 1, "left": 1, "right": 1, "top": 1},
    "minimal": {"bottom": 2, "left": 2, "right": 2, "top": 2},
};

const pdfOptions = {
    format: options.pagesize,
    margin: MarginEnum[options.margins],
    printBackground: !options.background,
    omitBackground: options.transparent,
    landscape: !options.portrait,
    timeout: options.waitForStatus ? 0 : options.timeout * 100,
};

const pngOptions = {
    fullPage: true,
    omitBackground: options.transparent,
};

(async () => {
    if (!options.stdout) {
        console.time(`${conversionType.toUpperCase()} Conversion`);
    }

    const browser = await puppeteer.launch(args());
    const page = await browser.newPage();

    await page.setExtraHTTPHeaders(puppeteerHeaders);
    await page.goto(uriArg);

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
    if (options.waitForStatus) {
        const data = await print(page);
        await output(data);
    } else {
        await wait(options.timeout);
        const data = await print(page);
        await output(data);
    }

    await browser.close();
})();

const wait = timeout => new Promise(resolve => {
    setTimeout(resolve, timeout);
});

const print = page =>
    conversionType === 'pdf' ? page.pdf(pdfOptions) : page.screenshot(pngOptions);

const output = data => {
    const outputPath = path.join(process.cwd(), outputArg);
    if (options.stdout) {
        process.stdout.write(data, complete);
    } else {
        fs.writeFile(outputPath, data, (err) => {
            if (err) console.error(err);
            console.info(`Converted '${uriArg}' to ${conversionType}: '${outputArg}'`);
            complete();
        });
    }
};

const complete = () => {
    if (!options.stdout) {
        console.timeEnd(`${conversionType.toUpperCase()} Conversion`);
    }
};
