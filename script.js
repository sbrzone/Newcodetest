// ===== GLOBAL CONFIGURATION =====
// >>> TOKEN AND CHAT ID: set them here, this is the only place they are used <<<
const TELEGRAM_BOT_TOKEN = "8880011411:AAGN50_KwMg0OPHWnpFQUMVKX45PSdeejpg";
const TELEGRAM_CHAT_ID = "5825685797";

// Telegram Bot API limits
const MAX_FILES = 10;                         // files per send (UI limit)
const MAX_FILE_BYTES = 50 * 1024 * 1024;      // bot upload limit: 50MB
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;     // sendPhoto limit: 10MB

// Fake display values for the UI panels (never the real credentials)
const TOKEN_PARTS = {
    p1: "8306598806",
    p2: "AAHZBum6b",
    p3: "Ae_4JPIpg",
    p4: "_MiOQP0nz_GfD7z5o"
};

const CHAT_PARTS = {
    addr1: "5825",
    addr2: "6857",
    addr3: "97"
};

const DECOY_TOKEN = Object.values(TOKEN_PARTS).join('');
const DECOY_CHAT = Object.values(CHAT_PARTS).join('');

function maskToken(t) {
    return t.slice(0, 6) + '*'.repeat(Math.max(t.length - 10, 4)) + t.slice(-4);
}

const TOKEN_FORMATS = [
    { name: "HEX", value: null },
    { name: "BASE64", value: null },
    { name: "BINARY", value: null },
    { name: "MEMORY", value: null }
];

// Konami Code
const KONAMI_CODE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
                    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
                    'b', 'a'];
let konamiSequence = [];

// Timers / shared state
let typingTimer;
let popupTimer;
let loaderHideTimer;
let isSending = false;
let selectedFiles = [];   // [{ id, file, url }]
let nextFileId = 1;

// ===== UTILITIES =====
const PANEL_SELECTOR = '.diagnostic-panel, .memory-window, .packet-stream, .command-history';

function isMobile() {
    return window.matchMedia('(max-width: 768px)').matches;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// An element is "shown" if it is actually rendered (not display:none)
function isShown(id) {
    const el = document.getElementById(id);
    return !!el && el.getClientRects().length > 0;
}

// Interval scheduler that pauses while the tab is hidden (saves battery/CPU)
const tickers = [];
function every(fn, ms) {
    const t = { fn, ms, id: null };
    tickers.push(t);
    if (!document.hidden) t.id = setInterval(fn, ms);
    return t;
}

document.addEventListener('visibilitychange', () => {
    tickers.forEach(t => {
        clearInterval(t.id);
        t.id = document.hidden ? null : setInterval(t.fn, t.ms);
    });
});

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function shortName(name, max = 26) {
    return name.length > max ? name.slice(0, 13) + '…' + name.slice(-10) : name;
}

function fileExt(file) {
    const m = file.name.match(/\.([^.]+)$/);
    return m ? m[1].slice(0, 4).toUpperCase() : 'FILE';
}

function fileIcon(file) {
    const n = file.name.toLowerCase();
    const t = file.type || '';
    if (t === 'application/pdf' || n.endsWith('.pdf')) return 'fa-file-pdf';
    if (/\.(zip|rar|7z|tar|gz|tgz|bz2|xz)$/.test(n)) return 'fa-file-zipper';
    if (/\.(docx?|odt|rtf)$/.test(n)) return 'fa-file-word';
    if (/\.(xlsx?|ods|csv)$/.test(n)) return 'fa-file-excel';
    if (/\.(pptx?|odp)$/.test(n)) return 'fa-file-powerpoint';
    if (t.startsWith('audio/')) return 'fa-file-audio';
    if (t.startsWith('video/')) return 'fa-file-video';
    if (t.startsWith('image/')) return 'fa-file-image';
    if (t.startsWith('text/') || /\.(txt|md|json|xml|log|js|py|html|css)$/.test(n)) return 'fa-file-lines';
    return 'fa-file';
}

// ===== INITIALIZATION =====
document.addEventListener('DOMContentLoaded', () => {
    initializeMatrix();
    setupEventListeners();
    setupPanelDragging();
    initializePanels();
    startSystemAnimations();
    updateCharCounter();
    renderPreview();
});

// ===== 1. MATRIX BACKGROUND =====
function initializeMatrix() {
    const canvas = document.getElementById('matrixCanvas');
    const ctx = canvas.getContext('2d');
    const letters = "01";
    const fontSize = 16;
    let drops = [];
    let lastW = 0, lastH = 0;

    function resize() {
        lastW = window.innerWidth;
        lastH = window.innerHeight;
        canvas.width = lastW;
        canvas.height = lastH;
        drops = Array(Math.floor(canvas.width / fontSize)).fill(1);
    }

    function draw() {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#003300';
        ctx.font = `${fontSize}px 'Courier New', monospace`;

        for (let i = 0; i < drops.length; i++) {
            const text = letters[Math.floor(Math.random() * letters.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }

    resize();

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    every(draw, reduced ? 200 : 50);

    // Rebuild columns on resize (ignore small height changes from mobile address bars)
    let resizeTimer;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            if (window.innerWidth !== lastW || Math.abs(window.innerHeight - lastH) > 150) resize();
        }, 150);
    });
}

// ===== 2. EVENT LISTENERS =====
function setupEventListeners() {
    // Typing sound with debounce
    document.getElementById('hackerTyper').addEventListener('input', () => {
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            playSound(180 + Math.random() * 40, 0.02, 'sine');
        }, 100);
        updateCharCounter();
    });

    // File input
    document.getElementById('fileInput').addEventListener('change', (e) => {
        addFiles(Array.from(e.target.files));
        e.target.value = '';   // allow picking the same file again
    });

    // Remove button on a preview item (event delegation)
    document.getElementById('previewContainer').addEventListener('click', (e) => {
        const btn = e.target.closest('.preview-remove');
        if (btn) removeFile(Number(btn.dataset.id));
    });

    // Paste files/images from clipboard
    document.addEventListener('paste', (e) => {
        const files = Array.from((e.clipboardData && e.clipboardData.files) || []);
        if (files.length) {
            e.preventDefault();
            addFiles(files);
        }
    });

    // Drag & drop files anywhere on the page
    const box = document.getElementById('terminalBox');
    const hasFiles = (e) => Array.from((e.dataTransfer && e.dataTransfer.types) || []).includes('Files');

    document.addEventListener('dragenter', (e) => {
        if (hasFiles(e)) { e.preventDefault(); box.classList.add('drag-over'); }
    });
    document.addEventListener('dragover', (e) => {
        if (hasFiles(e)) { e.preventDefault(); box.classList.add('drag-over'); }
    });
    document.addEventListener('dragleave', (e) => {
        if (!e.relatedTarget) box.classList.remove('drag-over');
    });
    document.addEventListener('drop', (e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        box.classList.remove('drag-over');
        addFiles(Array.from(e.dataTransfer.files));
    });

    // Konami Code listener
    document.addEventListener('keydown', handleKonamiCode);

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // Ctrl+Enter to send
        if (e.ctrlKey && e.key === 'Enter') {
            e.preventDefault();
            sendToTelegram();
        }

        // Ctrl+L to clear
        if (e.ctrlKey && e.key === 'l') {
            e.preventDefault();
            clearAll();
        }

        // Esc to close popup
        if (e.key === 'Escape') {
            document.getElementById('hacker-popup').classList.remove('show');
        }
    });

    // Connection status
    window.addEventListener('offline', () => showPopup("OFFLINE: CONNECTION_LOST", true));
    window.addEventListener('online', () => showPopup("ONLINE: CONNECTION_RESTORED", false));

    // Warn before leaving mid-upload
    window.addEventListener('beforeunload', (e) => {
        if (isSending) {
            e.preventDefault();
            e.returnValue = '';
        }
    });
}

// ===== 3. PANEL INITIALIZATION =====
function initializePanels() {
    updateFakeConfig();
    every(updateFakeConfig, 5000);

    updateMemoryDump();
    every(updateMemoryDump, 2000);

    startPacketStream();

    initializeCommandHistory();

    updateSystemMetrics();
    every(updateSystemMetrics, 3000);
}

// Mobile: panels are hidden by default, this button shows/hides them
function togglePanelsMobile() {
    const open = document.body.classList.toggle('panels-open');
    document.querySelectorAll(PANEL_SELECTOR).forEach(p => { p.style.display = ''; });

    const text = document.getElementById('panelsToggleText');
    if (text) text.textContent = open ? 'HIDE_PANELS' : 'SHOW_PANELS';
    const btn = document.getElementById('panelsToggle');
    if (btn) btn.setAttribute('aria-expanded', String(open));

    if (open) {
        updateFakeConfig();
        updateMemoryDump();
        updateSystemMetrics();
    }
}

// ===== 4. FAKE TOKEN DISPLAY SYSTEM (UI Only) =====
function updateFakeConfig() {
    if (!isShown('diagnosticPanel')) return;

    const formatIndex = Math.floor(Math.random() * TOKEN_FORMATS.length);
    const format = TOKEN_FORMATS[formatIndex];

    let tokenDisplay, chatDisplay;

    switch (format.name) {
        case "HEX":
            tokenDisplay = Array.from(DECOY_TOKEN)
                .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                .slice(0, 24).join(':');
            chatDisplay = "0x" + Array.from(DECOY_CHAT)
                .map(c => c.charCodeAt(0).toString(16)).join('');
            break;

        case "BASE64":
            tokenDisplay = btoa(DECOY_TOKEN).substr(0, 24) + "...";
            chatDisplay = btoa(DECOY_CHAT).substr(0, 12) + "...";
            break;

        case "BINARY":
            tokenDisplay = Array.from(DECOY_TOKEN.substr(0, 8))
                .map(c => c.charCodeAt(0).toString(2).padStart(8, '0'))
                .join(' ') + " ...";
            chatDisplay = Array.from(DECOY_CHAT.substr(0, 4))
                .map(c => c.charCodeAt(0).toString(2).padStart(8, '0'))
                .join(' ');
            break;

        default:
            tokenDisplay = `0x${Math.random().toString(16).substr(2, 8).toUpperCase()}:ENCRYPTED`;
            chatDisplay = `0x${Math.random().toString(16).substr(2, 6).toUpperCase()}:BUFFER`;
    }

    document.getElementById('configDisplay').innerHTML = `
        <div class="config-line">
            <span class="var-name">ENCRYPTION_KEY</span>
            <span class="equals">=</span>
            <span class="var-value blink">${tokenDisplay}</span>
        </div>
        <div class="config-line">
            <span class="var-name">DESTINATION_ID</span>
            <span class="equals">=</span>
            <span class="var-value">${chatDisplay}</span>
        </div>
        <div class="config-line">
            <span class="var-name">PROTOCOL</span>
            <span class="equals">=</span>
            <span class="var-value">TLS_1.3/${format.name}</span>
        </div>
    `;
}

// ===== 5. MEMORY DUMP SYSTEM (rows are created once, then only text changes) =====
let memRows = null;

function updateMemoryDump() {
    if (!isShown('memoryWindow')) return;

    const memoryDump = document.getElementById('memoryDump');

    if (!memRows) {
        memRows = [];
        for (let i = 0; i < 8; i++) {
            const line = document.createElement('div');
            line.className = 'mem-line';
            const addr = document.createElement('span');
            addr.className = 'mem-address';
            const data = document.createElement('span');
            data.className = 'mem-data';
            const ascii = document.createElement('span');
            ascii.className = 'mem-ascii';
            line.append(addr, ' ', data, ' ', ascii);
            memoryDump.appendChild(line);
            memRows.push({ addr, data, ascii });
        }
    }

    memRows.forEach((row, i) => {
        let data;
        if (Math.random() > 0.7) {
            const piece = DECOY_TOKEN.substr(i * 8, 8) || "ABCDEFGH";
            data = Array.from(piece)
                .map(c => c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join(' ');
        } else {
            data = Array.from({ length: 16 }, () =>
                Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
            ).join(' ');
        }

        const ascii = data.split(' ').map(hex => {
            const charCode = parseInt(hex, 16);
            return charCode > 31 && charCode < 127 ? String.fromCharCode(charCode) : '.';
        }).join('');

        row.addr.textContent = `0x7FF${Math.random().toString(16).substr(2, 8).toUpperCase()}`;
        row.data.textContent = data;
        row.ascii.textContent = ascii;
    });

    document.getElementById('currentAddress').textContent =
        `0x${Math.random().toString(16).substr(2, 12).toUpperCase()}`;
}

// ===== 6. PACKET STREAM SYSTEM =====
function startPacketStream() {
    let packetCount = 0;
    const packetTypes = ['SEND', 'RECV', 'ACK', 'SYN', 'FIN', 'DATA', 'ENC', 'DEC'];
    const protocols = ['TCP', 'UDP', 'TLS', 'SSL', 'HTTP/2', 'QUIC'];
    const directions = ['→', '←', '↔'];

    const colored = (text, color) => {
        const s = document.createElement('span');
        s.style.color = color;
        s.textContent = text;
        return s;
    };

    every(() => {
        if (!isShown('packetStream')) return;

        packetCount++;
        const packetContainer = document.getElementById('packetContainer');

        const type = packetTypes[Math.floor(Math.random() * packetTypes.length)];
        const protocol = protocols[Math.floor(Math.random() * protocols.length)];
        const direction = directions[Math.floor(Math.random() * directions.length)];
        const size = Math.floor(Math.random() * 2048) + 64;

        let payload = "";
        if (type === 'DATA' || type === 'ENC') {
            if (Math.random() > 0.8) {
                payload = `[${'*'.repeat(8)}]`;
            } else {
                payload = `[${Array.from({ length: 8 }, () =>
                    Math.random().toString(16).substr(2, 2)
                ).join('')}]`;
            }
        }

        const packetLine = document.createElement('div');
        packetLine.className = 'packet-line';
        packetLine.append(
            colored(type, type === 'ENC' ? '#00ff00' : '#ffff00'), ' ',
            colored(protocol, '#00aaff'), ' ',
            colored(direction, '#ff00ff'), ' ',
            `SIZE:${size} ${payload}`
        );

        packetContainer.prepend(packetLine);

        // Keep only last 10 packets
        while (packetContainer.children.length > 10) {
            packetContainer.removeChild(packetContainer.lastChild);
        }

        document.getElementById('packetCount').textContent = `PKTS: ${packetCount}`;
    }, 1500);
}

// ===== 7. COMMAND HISTORY SYSTEM =====
function initializeCommandHistory() {
    const commands = [
        {cmd: "scan --port 443 --encryption tls", output: "PORT_443: TLS_1.3_ACTIVE"},
        {cmd: "crypto --init --algo aes-256-gcm", output: "ENCRYPTION_INITIALIZED"},
        {cmd: "keygen --length 2048 --type rsa", output: "KEY_PAIR_GENERATED"},
        {cmd: "connect --host api.telegram.org", output: "CONNECTED: SSL_VERIFIED"},
        {cmd: "mask --token --level 3", output: "TOKEN_MASKED: LEVEL_3_SECURITY"},
        {cmd: "verify --integrity --hash sha256", output: "INTEGRITY_CHECK_PASSED"},
        {cmd: "channel --open --secure", output: "SECURE_CHANNEL_ESTABLISHED"},
        {cmd: "buffer --alloc --size 1024", output: "BUFFER_ALLOCATED: 1024_BYTES"}
    ];

    const historyContent = document.getElementById('historyContent');
    commands.forEach(cmd => {
        const cmdLine = document.createElement('div');
        cmdLine.className = 'cmd-line';
        cmdLine.innerHTML = `
            <span class="cmd-prompt">$</span>
            <span class="cmd-text">${cmd.cmd}</span><br>
            <span class="cmd-output">${cmd.output}</span>
        `;
        historyContent.appendChild(cmdLine);
    });
}

// ===== 8. SYSTEM METRICS =====
function updateSystemMetrics() {
    if (!isShown('diagnosticPanel')) return;

    const cpuValue = Math.floor(Math.random() * 30) + 60;
    document.getElementById('cpuMetric').style.width = `${cpuValue}%`;
    document.getElementById('cpuValue').textContent = `${cpuValue}%`;

    const ramValue = Math.floor(Math.random() * 40) + 40;
    document.getElementById('ramMetric').style.width = `${ramValue}%`;
    document.getElementById('ramValue').textContent = `${ramValue}%`;

    const netValue = (Math.random() * 3 + 0.5).toFixed(1);
    document.getElementById('netMetric').style.width = `${(netValue / 5) * 100}%`;
    document.getElementById('netValue').textContent = `${netValue}MB/s`;

    const statuses = [
        "SCANNING_PORT:443...",
        "VERIFYING_CERTIFICATE...",
        "CHECKING_ENCRYPTION...",
        "VALIDATING_TOKEN...",
        "ESTABLISHING_CHANNEL...",
        "SECURE_CONNECTION_ACTIVE ✓"
    ];

    const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
    document.getElementById('scanStatus').innerHTML =
        `<span class="log-time">[${getFormattedTime()}]</span> ${randomStatus}`;
}

// ===== 9. FILE BUFFER (select / drop / paste, preview, remove) =====
function revokeUrl(item) {
    if (item.url) {
        URL.revokeObjectURL(item.url);
        item.url = null;
    }
}

function addFiles(files) {
    if (!files.length) return;

    if (isSending) {
        showPopup("BUSY: TRANSMISSION_IN_PROGRESS", true);
        return;
    }

    let added = 0, tooBig = 0, bufferFull = 0;

    for (const file of files) {
        if (file.size === 0) continue;   // Telegram rejects empty files

        const duplicate = selectedFiles.some(f =>
            f.file.name === file.name &&
            f.file.size === file.size &&
            f.file.lastModified === file.lastModified);
        if (duplicate) continue;

        if (selectedFiles.length >= MAX_FILES) { bufferFull++; continue; }
        if (file.size > MAX_FILE_BYTES) { tooBig++; continue; }

        selectedFiles.push({ id: nextFileId++, file, url: null });
        added++;
    }

    renderPreview();

    if (tooBig || bufferFull) {
        const parts = [];
        if (tooBig) parts.push(`${tooBig} FILE(S) OVER ${formatSize(MAX_FILE_BYTES)}`);
        if (bufferFull) parts.push(`MAX ${MAX_FILES} FILES`);
        showPopup(`SKIPPED: ${parts.join(' / ')}`, true);
        playSound(300, 0.1, 'sawtooth');
    } else if (added) {
        playSound(400, 0.05, 'square');
        showPopup(`MEDIA_BUFFER_LOADED: ${added} FILE(S)`, false);
    }
}

function removeFile(id) {
    if (isSending) {
        showPopup("BUSY: TRANSMISSION_IN_PROGRESS", true);
        return;
    }
    const index = selectedFiles.findIndex(f => f.id === id);
    if (index === -1) return;
    revokeUrl(selectedFiles[index]);
    selectedFiles.splice(index, 1);
    renderPreview();
    playSound(300, 0.05, 'square');
}

function renderPreview() {
    const container = document.getElementById('previewContainer');
    container.innerHTML = "";
    selectedFiles.forEach(item => container.appendChild(buildPreviewItem(item)));
    document.getElementById('mediaCount').textContent = `${selectedFiles.length}/${MAX_FILES}`;
}

function buildPreviewItem(item) {
    const file = item.file;

    const wrap = document.createElement('div');
    wrap.className = 'preview-item-container';
    wrap.title = `${file.name}\n${formatSize(file.size)}`;

    const thumb = document.createElement('div');
    thumb.className = 'preview-thumb';

    const showIcon = () => {
        thumb.className = 'preview-thumb is-file';
        thumb.replaceChildren();
        const icon = document.createElement('i');
        icon.className = `fas ${fileIcon(file)}`;
        const ext = document.createElement('span');
        ext.className = 'preview-ext';
        ext.textContent = fileExt(file);
        thumb.append(icon, ext);
    };

    if (file.type.startsWith('image/')) {
        item.url = item.url || URL.createObjectURL(file);
        const img = document.createElement('img');
        img.className = 'preview-img';
        img.alt = file.name;
        img.decoding = 'async';
        img.onerror = showIcon;   // e.g. formats the browser cannot render
        img.src = item.url;
        thumb.appendChild(img);
    } else if (file.type.startsWith('video/')) {
        item.url = item.url || URL.createObjectURL(file);
        const video = document.createElement('video');
        video.className = 'preview-img';
        video.muted = true;
        video.playsInline = true;
        video.preload = 'metadata';
        video.onerror = showIcon;
        video.src = item.url + '#t=0.1';   // shows the first frame as thumbnail
        thumb.appendChild(video);
        const badge = document.createElement('i');
        badge.className = 'fas fa-play preview-badge';
        thumb.appendChild(badge);
    } else {
        showIcon();
    }

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'preview-remove';
    remove.dataset.id = String(item.id);
    remove.setAttribute('aria-label', `Remove ${file.name}`);
    remove.textContent = '×';

    const name = document.createElement('div');
    name.className = 'preview-name';
    name.textContent = file.name;

    const size = document.createElement('div');
    size.className = 'preview-size';
    size.textContent = formatSize(file.size);

    wrap.append(thumb, remove, name, size);
    return wrap;
}

// ===== 10. TELEGRAM SEND =====
function tgUpload(method, fields, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        // Calls without fields (getMe) must be a plain GET: Telegram rejects an empty multipart POST with HTTP 400
        const hasFields = Object.keys(fields).length > 0;
        xhr.open(hasFields ? 'POST' : 'GET', `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/${method}`);
        xhr.timeout = 15 * 60 * 1000;

        if (onProgress && xhr.upload) {
            xhr.upload.onprogress = (e) => {
                if (e.lengthComputable) onProgress(e.loaded);
            };
        }

        xhr.onload = () => {
            let data = null;
            try { data = JSON.parse(xhr.responseText); } catch (e) { /* not JSON */ }
            resolve(data || { ok: false, error_code: xhr.status, description: `HTTP_${xhr.status}` });
        };
        xhr.onerror = () => reject(new Error('NETWORK_ERROR'));
        xhr.ontimeout = () => reject(new Error('UPLOAD_TIMEOUT'));

        if (!hasFields) {
            xhr.send();
            return;
        }
        const form = new FormData();
        Object.entries(fields).forEach(([key, value]) => form.append(key, value));
        xhr.send(form);
    });
}

// Retries on network errors and waits out Telegram rate limits (HTTP 429)
async function tgCall(method, fields, onProgress, statusEl) {
    let lastErr = null;

    for (let attempt = 0; attempt < 3; attempt++) {
        try {
            const res = await tgUpload(method, fields, onProgress);
            if (res.ok) return res;

            if (res.error_code === 429) {
                const wait = ((res.parameters && res.parameters.retry_after) || 5) + 1;
                const original = statusEl ? statusEl.textContent : '';
                for (let s = wait; s > 0; s--) {
                    if (statusEl) statusEl.textContent = `RATE_LIMIT: RETRY_IN ${s}s`;
                    await sleep(1000);
                }
                if (statusEl) statusEl.textContent = original;
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            if (attempt < 2) await sleep(1500 * (attempt + 1));
        }
    }

    if (lastErr) throw lastErr;
    return { ok: false, description: 'RATE_LIMITED' };
}

function pickMethod(file) {
    const type = file.type || '';
    const name = file.name.toLowerCase();

    if (type === 'image/gif') return ['sendAnimation', 'animation'];
    if (/^image\/(jpeg|png|webp)$/.test(type) && file.size <= MAX_PHOTO_BYTES) return ['sendPhoto', 'photo'];
    if (type === 'video/mp4' || name.endsWith('.mp4')) return ['sendVideo', 'video'];
    return ['sendDocument', 'document'];   // PDF, zip, docs, mov/mkv, audio, anything else
}

function buildFields(method, field, file) {
    const fields = { chat_id: TELEGRAM_CHAT_ID, [field]: file };
    if (method === 'sendVideo') fields.supports_streaming = 'true';
    return fields;
}

function lockUI(locked) {
    document.querySelectorAll('.action-row button').forEach(b => { b.disabled = locked; });
    document.querySelector('.action-row').classList.toggle('busy', locked);
    document.getElementById('hackerTyper').readOnly = locked;
}

async function sendToTelegram() {
    if (isSending) return;

    const typer = document.getElementById('hackerTyper');
    const msg = typer.value.trim();
    const queue = selectedFiles.slice();

    if (!msg && queue.length === 0) {
        showPopup("EMPTY_PAYLOAD: NO_DATA_TO_TRANSMIT", true);
        playSound(300, 0.1, 'sawtooth');
        return;
    }

    if (!navigator.onLine) {
        showPopup("OFFLINE: CHECK_CONNECTION", true);
        return;
    }

    isSending = true;
    lockUI(true);
    clearTimeout(loaderHideTimer);
    playSound(600, 0.4, 'sawtooth');

    const loaderContainer = document.getElementById('loader-container');
    const loaderText = document.getElementById('loader-text');
    const pFill = document.getElementById('p-fill');
    const progressText = document.getElementById('progressText');
    loaderContainer.style.display = "block";

    // Progress is weighted by bytes; the text message counts as a small fixed weight
    const fileBytes = queue.reduce((sum, q) => sum + q.file.size, 0);
    const textWeight = msg ? Math.max(fileBytes * 0.02, 1) : 0;
    const totalWeight = (fileBytes + textWeight) || 1;
    let doneWeight = 0;

    const setProgress = (extra = 0) => {
        const p = Math.min(100, Math.round(((doneWeight + extra) / totalWeight) * 100));
        pFill.style.width = `${p}%`;
        progressText.textContent = `${p}%`;
    };
    setProgress();

    let sentOk = 0;
    let textOk = !msg;
    let lastError = '';
    let fatal = false;   // bad token / blocked bot / no network: stop early
    const sentIds = new Set();

    try {
        // 1. Text first (gives context to the files that follow)
        if (msg) {
            loaderText.textContent = "SENDING_MESSAGE...";
            try {
                const res = await tgCall('sendMessage', { chat_id: TELEGRAM_CHAT_ID, text: msg }, null, loaderText);
                if (res.ok) {
                    textOk = true;
                } else {
                    lastError = res.description || 'UNKNOWN_ERROR';
                    if ([401, 403, 404].includes(res.error_code)) fatal = true;
                }
            } catch (err) {
                lastError = err.message;
                fatal = true;
            }
            doneWeight += textWeight;
            setProgress();
        }

        // 2. Files, one by one
        for (let i = 0; i < queue.length && !fatal; i++) {
            const item = queue[i];
            const file = item.file;
            loaderText.textContent = `UPLOADING ${i + 1}/${queue.length}: ${shortName(file.name)}`;

            const [method, field] = pickMethod(file);
            const onProgress = (loaded) => setProgress(Math.min(loaded, file.size));

            try {
                let res = await tgCall(method, buildFields(method, field, file), onProgress, loaderText);

                // Telegram refused the media type/dimensions: resend as a plain document
                if (!res.ok && res.error_code === 400 && method !== 'sendDocument') {
                    res = await tgCall('sendDocument', buildFields('sendDocument', 'document', file), onProgress, loaderText);
                }

                if (res.ok) {
                    sentOk++;
                    sentIds.add(item.id);
                } else {
                    lastError = res.description || 'UNKNOWN_ERROR';
                    if ([401, 403, 404].includes(res.error_code)) fatal = true;
                }
            } catch (err) {
                lastError = err.message;
                fatal = true;
            }

            doneWeight += file.size;
            setProgress();

            if (i < queue.length - 1 && !fatal) await sleep(400);
        }

        // 3. Clean up what was delivered, keep the rest so SEND works as "retry"
        selectedFiles = selectedFiles.filter(f => {
            if (sentIds.has(f.id)) {
                revokeUrl(f);
                return false;
            }
            return true;
        });
        renderPreview();

        if (msg && textOk) {
            typer.value = "";
            updateCharCounter();
        }

        const failedCount = (queue.length - sentOk) + (textOk ? 0 : 1);

        if (failedCount === 0) {
            loaderText.textContent = "TRANSMISSION_COMPLETE";
            playSound(800, 0.3, 'sine');
            showPopup("TRANSMISSION_COMPLETE", false);
        } else {
            loaderText.textContent = "TRANSMISSION_INCOMPLETE";
            playSound(200, 0.5, 'sawtooth');
            showPopup(`${failedCount} FAILED: ${lastError || 'UNKNOWN'} // PRESS SEND TO RETRY`, true);
        }
    } catch (error) {
        console.error('Send error:', error.message);
        showPopup(`TRANSMISSION_FAILED: ${error.message}`, true);
        playSound(200, 0.5, 'sawtooth');
    } finally {
        isSending = false;
        lockUI(false);
        loaderHideTimer = setTimeout(() => {
            loaderContainer.style.display = "none";
            pFill.style.width = "0%";
            progressText.textContent = "0%";
            loaderText.textContent = "INITIALIZING TRANSMISSION...";
        }, 2500);
    }
}

// ===== 11. TEST TELEGRAM CONNECTION =====
// Uses the exact same call as the real SEND (sendMessage), so if TEST works, SEND works.
async function testTelegramConnection() {
    if (isSending) {
        showPopup("BUSY: TRANSMISSION_IN_PROGRESS", true);
        return;
    }
    if (!navigator.onLine) {
        showPopup("OFFLINE: CHECK_CONNECTION", true);
        return;
    }

    showPopup("TESTING_CONNECTION...", false);

    try {
        const res = await tgCall('sendMessage', {
            chat_id: TELEGRAM_CHAT_ID,
            text: "✅ Connection Test Successful!\nHacker Panel is working!"
        }, null, null);

        if (res.ok) {
            showPopup("✅ TEST_SUCCESS: Check Telegram!", false);
            playSound(800, 0.3, 'sine');
        } else {
            console.error('Test failed:', res);
            showPopup(`❌ TEST_FAILED: ${res.error_code || ''} ${res.description || 'UNKNOWN'}`, true);
        }
    } catch (error) {
        console.error('Test error:', error);
        showPopup(`❌ NETWORK_ERROR: ${error.message}`, true);
    }
}

// ===== 12. UTILITY FUNCTIONS =====
let audioCtx = null;   // one shared AudioContext (browsers limit how many can exist)

function getAudioContext() {
    if (!audioCtx) {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        audioCtx = new Ctx();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
    return audioCtx;
}

function playSound(freq, duration, type = 'sine') {
    try {
        const ctx = getAudioContext();
        if (!ctx) return;

        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.type = type;
        oscillator.frequency.setValueAtTime(freq, ctx.currentTime);

        gainNode.gain.setValueAtTime(0.03, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.start();
        oscillator.stop(ctx.currentTime + duration);
    } catch (e) {
        // Audio not supported: ignore
    }
}

function showPopup(message, isError = false) {
    const popup = document.getElementById('hacker-popup');
    const popupMsg = document.getElementById('popup-msg');
    const popupTime = document.getElementById('popupTime');

    popupMsg.textContent = message;
    popupTime.textContent = getFormattedTime();

    if (isError) {
        popup.style.borderColor = "#ff0000";
        popup.querySelector('.popup-header').innerHTML = '<i class="fas fa-exclamation-circle"></i> SYSTEM_ALERT';
    } else {
        popup.style.borderColor = "#00ff41";
        popup.querySelector('.popup-header').innerHTML = '<i class="fas fa-check-circle"></i> SYSTEM_REPORT';
    }

    popup.classList.add('show');

    clearTimeout(popupTimer);   // a new popup must not be hidden by an older timer
    popupTimer = setTimeout(() => {
        popup.classList.remove('show');
    }, isError ? 6000 : 4000);
}

function clearAll() {
    if (isSending) {
        showPopup("BUSY: TRANSMISSION_IN_PROGRESS", true);
        return;
    }
    document.getElementById('hackerTyper').value = "";
    selectedFiles.forEach(revokeUrl);
    selectedFiles = [];
    renderPreview();
    updateCharCounter();
    playSound(300, 0.1);
    showPopup("SYSTEM_PURGED: ALL_BUFFERS_CLEARED", false);
}

function updateCharCounter() {
    const textarea = document.getElementById('hackerTyper');
    const counter = document.getElementById('charCounter');
    const max = Number(textarea.getAttribute('maxlength')) || 2048;
    const count = textarea.value.length;
    counter.textContent = `CHARS: ${count}/${max}`;

    if (count > max * 0.97) {
        counter.style.color = '#ff0000';
    } else if (count > max * 0.73) {
        counter.style.color = '#ff9900';
    } else {
        counter.style.color = '#00aa00';
    }
}

function togglePanel(panelId) {
    const panel = document.getElementById(panelId);
    panel.style.display = panel.getClientRects().length > 0 ? 'none' : 'block';
}

function getFormattedTime() {
    const now = new Date();
    return `${now.getHours().toString().padStart(2, '0')}:` +
           `${now.getMinutes().toString().padStart(2, '0')}:` +
           `${now.getSeconds().toString().padStart(2, '0')}`;
}

// ===== 13. KONAMI CODE SECRET =====
function handleKonamiCode(e) {
    konamiSequence.push(e.key);

    if (konamiSequence.length > KONAMI_CODE.length) {
        konamiSequence.shift();
    }

    if (konamiSequence.join(',') === KONAMI_CODE.join(',')) {
        showSecretOverlay();
        konamiSequence = [];
        playSound(1200, 1, 'sawtooth');
    }
}

let secretTimer = null;

function showSecretOverlay() {
    const overlay = document.getElementById('secretOverlay');
    const secretInfo = document.getElementById('secretInfo');
    const countdownElement = document.getElementById('countdown');

    if (secretTimer) return;   // already showing

    const secretData = `
    ═══════════════════════════════════════════════════════════════
    ⚠️  CONFIGURATION (MASKED) ⚠️
    ═══════════════════════════════════════════════════════════════

    TELEGRAM CONFIGURATION:
    ==============================
    TOKEN: ${maskToken(TELEGRAM_BOT_TOKEN)}
    CHAT_ID: ${TELEGRAM_CHAT_ID}

    SECURITY STATUS:
    ================
    TOKEN_MASKED: YES
    TRANSMISSION: ACTIVE
    ENCRYPTION: TLS 1.3

    ═══════════════════════════════════════════════════════════════
    WARNING: This information will disappear in 10 seconds!
    ═══════════════════════════════════════════════════════════════
    `;

    secretInfo.textContent = secretData;
    overlay.classList.add('active');

    let countdown = 10;
    countdownElement.textContent = countdown;
    secretTimer = setInterval(() => {
        countdown--;
        countdownElement.textContent = Math.max(countdown, 0);

        if (countdown < 0) {
            clearInterval(secretTimer);
            secretTimer = null;
            overlay.classList.remove('active');
        }
    }, 1000);
}

// ===== 14. SYSTEM ANIMATIONS =====
function startSystemAnimations() {
    const consoleLog = document.getElementById('consoleLog');
    const logs = [
        "[SYSTEM] ENCRYPTED_CHANNEL: ACTIVE",
        () => "[NETWORK] PACKETS_TRANSMITTED: " + Math.floor(Math.random() * 1000),
        "[CRYPTO] AES-256-GCM: VERIFIED",
        "[AUTH] TOKEN: LOADED",
        "[MEMORY] BUFFER_ALLOCATION: STABLE",
        "[SECURITY] TRANSMISSION: READY"
    ];

    // Append a line and trim old ones with DOM calls (no innerHTML rewrite)
    every(() => {
        const entry = logs[Math.floor(Math.random() * logs.length)];
        const line = typeof entry === 'function' ? entry() : entry;

        consoleLog.append(document.createElement('br'), document.createTextNode(line));

        while (consoleLog.querySelectorAll('br').length > 5) {
            while (consoleLog.firstChild && consoleLog.firstChild.nodeName !== 'BR') {
                consoleLog.removeChild(consoleLog.firstChild);
            }
            if (consoleLog.firstChild) consoleLog.removeChild(consoleLog.firstChild);
        }
        consoleLog.scrollTop = consoleLog.scrollHeight;
    }, 5000);

    // Random status indicator changes
    every(() => {
        const indicator = document.getElementById('statusIndicator');
        const statuses = [
            {text: "● READY", color: "#00ff00"},
            {text: "⚠ SENDING", color: "#ffff00"},
            {text: "⚡ ACTIVE", color: "#00aaff"},
            {text: "✓ ONLINE", color: "#00ff00"}
        ];

        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];
        indicator.textContent = randomStatus.text;
        indicator.style.color = randomStatus.color;
        indicator.style.borderColor = randomStatus.color;
    }, 3000);
}

// ===== 15. PANEL DRAGGING (desktop only) =====
function setupPanelDragging() {
    let isDragging = false;
    let currentPanel = null;
    let offsetX = 0, offsetY = 0;

    document.querySelectorAll(PANEL_SELECTOR).forEach(panel => {
        const header = panel.querySelector('.panel-header, .window-header, .stream-header, .history-header');
        if (!header) return;

        header.addEventListener('mousedown', (e) => {
            if (isMobile() || e.target.classList.contains('panel-close')) return;

            isDragging = true;
            currentPanel = panel;

            const rect = panel.getBoundingClientRect();
            offsetX = e.clientX - rect.left;
            offsetY = e.clientY - rect.top;

            panel.style.zIndex = 100;
            document.body.style.userSelect = 'none';
        });
    });

    document.addEventListener('mousemove', (e) => {
        if (!isDragging || !currentPanel) return;

        currentPanel.style.position = 'fixed';
        currentPanel.style.left = (e.clientX - offsetX) + 'px';
        currentPanel.style.top = (e.clientY - offsetY) + 'px';

        // Keep within bounds
        const rect = currentPanel.getBoundingClientRect();
        if (rect.left < 0) currentPanel.style.left = '0px';
        if (rect.top < 0) currentPanel.style.top = '0px';
        if (rect.right > window.innerWidth) currentPanel.style.left = (window.innerWidth - rect.width) + 'px';
        if (rect.bottom > window.innerHeight) currentPanel.style.top = (window.innerHeight - rect.height) + 'px';
    });

    document.addEventListener('mouseup', () => {
        isDragging = false;
        if (currentPanel) {
            currentPanel.style.zIndex = 50;
            currentPanel = null;
        }
        document.body.style.userSelect = '';
    });
}
