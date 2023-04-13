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
    .option("-V, --verbose", "enable verbose", false)
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
        "dumpio": options.verbose,
        "protocolTimeout": 0,
        "timeout": 0,
        "args": [
            '--headless=new',
            '--no-sandbox',
            '--disable-web-security',
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
            '-devtools-flags=disable',
            '--single-process', // <- this one doesn't works in Windows
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

const pdfOptions = {
    format: options.pagesize,
    margin: MarginEnum[options.margins],
    printBackground: !options.background,
    omitBackground: options.transparent,
    landscape: !options.portrait,
    preferCSSPageSize: true,
    timeout: options.waitForStatus ? 0 : options.timeout * 1000,
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

    await page.setDefaultNavigationTimeout(0);
    await page.setExtraHTTPHeaders(puppeteerHeaders);

    const result = await page.goto(uriArg);
    if (result.status() !== 200) {
        console.log('Error loading page:', result.status());
        await browser.close();
        process.exit(3);
    }

    // Load plugins
    const mediaPlugin = fs.readFileSync(path.join(__dirname, "./plugin_media.js"), "utf8");
    let plugins = "";

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

const wait = seconds => new Promise(resolve => {
    setTimeout(resolve, seconds * 1000);
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
