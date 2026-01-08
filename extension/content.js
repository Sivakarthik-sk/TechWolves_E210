console.log("🌌 CORTEX: Oppenheimer V100");

let sidebarRoot = null;
let uiState = {};
let CURRENT_MODE = "auto";
let CURRENT_LANG = "en";
let isProcessing = false;

// --- 1. SETUP ---
async function ensureSidebarExists() {
    if (document.getElementById('sherpa-root')) return;
    sidebarRoot = document.createElement('div');
    sidebarRoot.id = "sherpa-root";
    document.body.appendChild(sidebarRoot);
    try {
        const resp = await fetch(chrome.runtime.getURL('sidebar.html'));
        sidebarRoot.innerHTML = await resp.text();
        initDelegation();
    } catch(e) {}
}

chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "toggle_sidebar") {
        if(!document.getElementById('sherpa-root')) ensureSidebarExists().then(() => setTimeout(toggle, 100));
        else toggle();
    }
});

function toggle() {
    sidebarRoot.classList.toggle('open');
    isProcessing = false;
}

ensureSidebarExists();

// --- 2. DELEGATION ---
function initDelegation() {
    console.log("✅ Ready");
    
    sidebarRoot.addEventListener('click', (e) => {
        const target = e.target;
        if(target.id === 'sendBtn' || target.closest('#sendBtn')) {
            const input = sidebarRoot.querySelector('#hudInput');
            if(input && input.value.trim() && !isProcessing) executeCommand(input.value.trim());
        }
        if(target.classList.contains('tab')) {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.hud-view').forEach(v => v.classList.remove('active'));
            target.classList.add('active');
            sidebarRoot.querySelector(`#view-${target.dataset.tab}`).classList.add('active');
            CURRENT_MODE = target.dataset.tab === 'chat' ? 'chat' : 'auto';
        }
        if(target.id === 'micBtn' || target.closest('#micBtn')) {
             if ('webkitSpeechRecognition' in window) {
                const rec = new webkitSpeechRecognition();
                rec.continuous = false;
                rec.lang = CURRENT_LANG === 'hi' ? 'hi-IN' : 'en-US';
                target.style.color = "#f59e0b";
                rec.start();
                rec.onresult = (ev) => { 
                    const txt = ev.results[0][0].transcript;
                    sidebarRoot.querySelector('#hudInput').value = txt;
                    executeCommand(txt);
                    target.style.color = "";
                };
            }
        }
    });

    sidebarRoot.addEventListener('keypress', (e) => {
        if(e.target.id === 'hudInput' && e.key === 'Enter' && !isProcessing) executeCommand(e.target.value.trim());
    });

    setTimeout(() => {
        if(!sidebarRoot.querySelector('#langSelect') && sidebarRoot.querySelector('.header')) {
            const s = document.createElement('select');
            s.id = "langSelect";
            s.style.cssText = "margin-left:auto; background:#333; color:white; border:none; padding:2px; font-size:11px;";
            s.innerHTML = `<option value="en">🇺🇸 EN</option><option value="hi">🇮🇳 HI</option><option value="es">🇪🇸 ES</option>`;
            sidebarRoot.querySelector('.header').appendChild(s);
            s.onchange = (ev) => CURRENT_LANG = ev.target.value;
        }
    }, 500);
}

// --- 3. EXECUTION ---
async function executeCommand(cmd, dynamicCreds = {}, retrying=false) {
    if(!cmd) return;
    isProcessing = true;
    const sendBtn = sidebarRoot.querySelector('#sendBtn');
    
    if(!retrying) {
        sidebarRoot.querySelector('#hudInput').value = ""; 
        if(CURRENT_MODE === "chat") addChat("You", cmd);
        else addStep(cmd, "active");
        if(sendBtn) { sendBtn.style.opacity = "0.5"; sendBtn.innerText = "⏳"; }
    }

    try {
        const res = await fetch('http://localhost:8000/navigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: cmd,
                current_url: window.location.href,
                html_content: document.body.outerHTML,
                dynamic_credentials: dynamicCreds,
                mode: CURRENT_MODE,
                language: CURRENT_LANG
            })
        });
        const data = await res.json();

        // 1. CHAT
        if (data.reply) {
            typewriterChat("Sherpa", data.reply);
        }
        // 2. TELEPORTER (IRCTC FIX)
        else if (data.action === "direct_teleport") {
            addStep("Teleporting...", "success");
            window.location.href = data.url;
        }
        // 3. GOOGLE CLICKER (Index Fix)
        else if (data.action === "google_click") {
            const index = data.index;
            // Find all Main Results (h3 > a)
            const results = Array.from(document.querySelectorAll('h3')).map(h => h.closest('a')).filter(a => a);
            if (results[index]) {
                addStep(`Clicking Result #${index + 1}`, "info");
                window.location.href = results[index].href;
            } else {
                addStep("Result index out of range.", "danger");
            }
        }
        // 4. STANDARD CLICKER
        else if (data.target_text) {
             const el = findBestElement(data.target_text);
             if(el) {
                 addStep(`Found: ${data.target_text.substring(0,20)}...`, "info");
                 apexClick(el);
             } else {
                 addStep("Hidden element.", "danger");
             }
        } 
        // 5. RETRY
        else if(data.action === "force_expand" && !retrying) {
             addStep("Scanning menus...", "info");
             shakeMenus();
             setTimeout(() => executeCommand(cmd, dynamicCreds, true), 1200);
        } else {
             if(!retrying) addStep(data.message || "Not found.", "danger");
        }

    } catch (e) { console.error(e); addStep("Server Offline", "danger"); } 
    finally {
        isProcessing = false;
        if(sendBtn) { sendBtn.style.opacity = "1"; sendBtn.innerText = "➤"; }
    }
}

// --- PHYSICS ---
function shakeMenus() {
    const triggers = document.querySelectorAll('nav, .menu, .dropdown, li, a');
    const evt = new MouseEvent('mouseover', { bubbles: true, view: window });
    triggers.forEach(t => t.dispatchEvent(evt));
}

function findBestElement(txt) {
    const clean = txt.trim().toLowerCase();
    function scan(root) {
        const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${clean}")]`;
        const iter = document.evaluate(xpath, root, null, XPathResult.ANY_TYPE, null);
        let node = iter.iterateNext();
        if(node) return node;
        const all = root.querySelectorAll('*');
        for(let el of all) {
            if(el.shadowRoot) { const found = scan(el.shadowRoot); if(found) return found; }
            if((el.value || "").toLowerCase().includes(clean)) return el;
            if((el.getAttribute('aria-label') || "").toLowerCase().includes(clean)) return el;
        }
        return null;
    }
    return scan(document);
}

function apexClick(el) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    let clickable = el;
    let depth = 0;
    while(clickable && depth < 5) {
        if (clickable.tagName === 'A' || clickable.tagName === 'BUTTON' || clickable.onclick) break;
        clickable = clickable.parentElement;
        depth++;
    }
    if(!clickable) clickable = el;

    clickable.style.outline = "4px solid #10b981";
    clickable.style.zIndex = "2147483647"; 
    clickable.style.position = "relative";

    setTimeout(() => {
        const events = ['mouseover', 'mousedown', 'mouseup', 'click'];
        events.forEach(etype => clickable.dispatchEvent(new MouseEvent(etype, { bubbles: true, cancelable: true, view: window })));
        clickable.click();
        if(clickable.tagName === 'A' && clickable.href) window.location.assign(clickable.href);
        setTimeout(() => clickable.style.outline = "", 1500);
    }, 500);
}

function typewriterChat(sender, msg) {
    const out = sidebarRoot.querySelector('#chatOutput');
    const d = document.createElement('div');
    d.style.cssText = `margin:10px 0; padding:10px; border-radius:10px; background:#334155; color:white; align-self:flex-start; max-width: 85%; word-wrap: break-word;`;
    out.appendChild(d);
    let i = 0;
    function type() {
        if (i < msg.length) {
            d.innerText += msg.charAt(i);
            i++;
            out.scrollTop = out.scrollHeight;
            setTimeout(type, 10);
        }
    }
    type();
}

function addChat(sender, msg) {
    const out = sidebarRoot.querySelector('#chatOutput');
    const d = document.createElement('div');
    d.style.cssText = `margin:10px 0; padding:10px; border-radius:10px; background:${sender==='You'?'#3b82f6':'#334155'}; color:white; align-self:${sender==='You'?'flex-end':'flex-start'};`;
    d.innerText = msg;
    out.appendChild(d);
    out.scrollTop = out.scrollHeight;
}

function addStep(txt, type="info") {
    const tl = sidebarRoot.querySelector('#timeline');
    const s = document.createElement('div');
    s.className = `step ${type}`;
    s.innerHTML = `<div class="step-dot"></div><div class="step-content">${txt}</div>`;
    tl.appendChild(s);
    s.scrollIntoView({ behavior: 'smooth' });
}