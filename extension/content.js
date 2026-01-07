console.log("🌌 CORTEX: Interactive Agent Active");

// --- 1. SETUP & INJECTION ---
let sidebarRoot = null;
let uiState = {};

async function ensureSidebarExists() {
    // Remove zombie sidebar if it exists
    if (document.getElementById('sherpa-root')) { 
        document.getElementById('sherpa-root').remove(); 
    }
    
    sidebarRoot = document.createElement('div');
    sidebarRoot.id = "sherpa-root";
    document.body.appendChild(sidebarRoot);
    
    try {
        const resp = await fetch(chrome.runtime.getURL('sidebar.html'));
        sidebarRoot.innerHTML = await resp.text();
        initLogic();
    } catch(e) { console.error("Sidebar Load Failed:", e); }
}

chrome.runtime.onMessage.addListener((req) => {
    if (req.action === "toggle_sidebar") {
        if(!document.getElementById('sherpa-root')) {
            ensureSidebarExists().then(() => setTimeout(() => sidebarRoot.classList.toggle('open'), 100));
        } else {
            sidebarRoot.classList.toggle('open');
        }
    }
});
ensureSidebarExists();

// --- 2. UI LOGIC (Voice + Text) ---
function initLogic() {
    uiState = {
        input: sidebarRoot.querySelector('#hudInput'),
        sendBtn: sidebarRoot.querySelector('#sendBtn'),
        micBtn: sidebarRoot.querySelector('#micBtn'),
        timeline: sidebarRoot.querySelector('#timeline'),
        langSelect: sidebarRoot.querySelector('#langSelect')
    };

    // --- A. BIND TEXT INPUT ---
    uiState.sendBtn.onclick = () => { 
        if(uiState.input.value.trim()) executeCommand(uiState.input.value); 
    };
    uiState.input.addEventListener('keypress', (e) => { 
        if (e.key === 'Enter') uiState.sendBtn.click(); 
    });

    // --- B. BIND VOICE INPUT (RESTORED) ---
    if ('webkitSpeechRecognition' in window) {
        // eslint-disable-next-line no-undef
        const rec = new webkitSpeechRecognition();
        
        uiState.micBtn.onclick = () => {
            // Update lang dynamically from dropdown
            rec.lang = uiState.langSelect.value || "en-US"; 
            uiState.micBtn.style.background = "#ef4444"; // Red for Recording
            try { rec.start(); } catch(e) { console.warn("Voice restart", e); }
        };

        rec.onresult = (e) => {
            const text = e.results[0][0].transcript;
            uiState.input.value = text;
            uiState.micBtn.style.background = "#334155"; // Reset color
            setTimeout(() => uiState.sendBtn.click(), 600); // Auto-send
        };

        rec.onerror = (e) => {
            console.error("Voice Error:", e.error);
            uiState.micBtn.style.background = "#334155";
            if (e.error === 'not-allowed') {
                alert("Microphone access blocked. Please allow mic permissions for this site.");
            }
        };

        rec.onend = () => {
            uiState.micBtn.style.background = "#334155";
        };
    } else {
        uiState.micBtn.style.display = "none"; // Hide if not supported
    }
}

// --- 3. EXECUTION ENGINE ---
async function executeCommand(cmd, dynamicCreds = {}) {
    // Only show user message if it's a new command
    if (Object.keys(dynamicCreds).length === 0) addStep(cmd, "think", "User Intent");
    
    uiState.input.value = ""; 

    try {
        const res = await fetch('http://localhost:8000/navigate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query: cmd,
                current_url: window.location.href,
                html_content: document.body.outerHTML,
                dynamic_credentials: dynamicCreds,
                language: uiState.langSelect.value
            })
        });
        const data = await res.json();

        if(data.plan) data.plan.forEach(p => addStep(p.action, "info"));

        // HANDLE CREDENTIAL POPUP
        if (data.action === "ask_credentials") {
            renderCredentialForm(cmd); 
            return;
        }

        addStep(data.message, "success");

        if (data.action === "secure_autofill") {
            await universalAutofill(data.credentials);
            // Check for follow-up click
            if (data.target_text) {
                setTimeout(() => {
                    const el = findBestElement(data.target_text);
                    if(el) interact(el);
                }, 1500);
            }
        } 
        else if (data.action === "spotlight_click") {
            const el = findBestElement(data.target_text);
            if(el) interact(el);
        } 
        else if (data.action === "open_and_fill") {
            const el = findBestElement(data.target_text);
            if(el) {
                interact(el);
                setTimeout(() => universalAutofill(data.credentials), 2000);
            }
        }

    } catch (e) {
        addStep("Connection Failed", "risk", "Check server.py");
    }
}

// --- 4. CREDENTIAL POPUP UI ---
function renderCredentialForm(originalCommand) {
    const formId = "cred-form-" + Date.now();
    const html = `
        <div class="step active" id="${formId}">
            <div class="step-dot" style="background:#f59e0b; border-color:#f59e0b"></div>
            <div class="step-content" style="background:rgba(255,255,255,0.05); padding:10px; border-radius:6px; width:100%">
                <div style="margin-bottom:8px; font-weight:bold; color:#f59e0b">🔐 Credentials Required</div>
                <input type="text" class="mini-input" placeholder="Username" id="u-${formId}" style="width:100%; margin-bottom:5px; padding:6px; background:#333; color:white; border:1px solid #555;">
                <input type="password" class="mini-input" placeholder="Password" id="p-${formId}" style="width:100%; margin-bottom:8px; padding:6px; background:#333; color:white; border:1px solid #555;">
                <button class="action-btn go" id="btn-${formId}" style="width:100%; padding:6px; background:#f59e0b; border:none; color:black; font-weight:bold; cursor:pointer;">LOGIN</button>
            </div>
        </div>
    `;
    uiState.timeline.insertAdjacentHTML('beforeend', html);
    
    setTimeout(() => {
        const btn = sidebarRoot.querySelector(`#btn-${formId}`);
        const uInput = sidebarRoot.querySelector(`#u-${formId}`);
        const pInput = sidebarRoot.querySelector(`#p-${formId}`);
        
        btn.onclick = () => {
            const user = uInput.value;
            const pass = pInput.value;
            if(user && pass) {
                document.getElementById(formId).remove();
                addStep("Credentials entered.", "success");
                executeCommand(originalCommand, { "Username": user, "Password": pass });
            }
        };
    }, 100);
}

function addStep(text, type="info", meta="") {
    const step = document.createElement('div');
    step.className = `step ${type === 'think' ? 'active' : ''}`;
    step.innerHTML = `<div class="step-dot"></div><div class="step-content">${text}${meta ? `<span class="meta">${meta}</span>` : ''}</div>`;
    uiState.timeline.appendChild(step);
    step.scrollIntoView({ behavior: 'smooth' });
}

// --- 5. ACTUATORS ---
async function universalAutofill(data) {
    for (const [key, value] of Object.entries(data)) {
        const element = findBestInput(key);
        if (element) {
            highlight(element, "#10b981");
            
            if (element.tagName === 'SELECT') {
                element.value = value;
                element.dispatchEvent(new Event('change', { bubbles: true }));
            } else {
                // AUMS Dropdown Support
                if (key.toLowerCase().includes("sem") || key.toLowerCase().includes("course")) {
                    await handleAUMSDropdown(element, value);
                } else {
                    element.value = value;
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                }
            }
        }
    }
    // Auto-Click Login if visible
    setTimeout(() => {
        const btn = document.querySelector('input[type="submit"], button[type="submit"]');
        if(btn) { highlight(btn, "#38bdf8"); btn.click(); }
        else {
             // Fallback find login button
             const allBtns = Array.from(document.querySelectorAll('button, a'));
             const loginBtn = allBtns.find(b => b.innerText.toLowerCase().includes('login') || b.innerText.toLowerCase().includes('sign in'));
             if(loginBtn) { highlight(loginBtn, "#38bdf8"); loginBtn.click(); }
        }
    }, 1500);
}

async function handleAUMSDropdown(element, value) {
    element.click();
    await new Promise(r => setTimeout(r, 600));
    const xpath = `//*[contains(text(), "${value}")]`;
    const iter = document.evaluate(xpath, document, null, 7, null);
    for(let i=0; i<iter.snapshotLength; i++) {
        let node = iter.snapshotItem(i);
        if(node.offsetParent && node.innerText.length < 50) {
            highlight(node, "#10b981"); node.click(); break;
        }
    }
}

function findBestInput(label) {
    const clean = label.toLowerCase();
    const inputs = Array.from(document.querySelectorAll('input:not([type="hidden"]), select'));
    return inputs.find(i => (i.placeholder && i.placeholder.toLowerCase().includes(clean)) || (i.name && i.name.toLowerCase().includes(clean)));
}

function findBestElement(text) {
    const xpath = `//*[contains(text(), "${text}")]`;
    try { return document.evaluate(xpath, document, null, 9, null).singleNodeValue; } catch (e) { return null; }
}

function interact(el) {
    highlight(el, "#38bdf8");
    setTimeout(() => { el.click(); }, 1000);
}

function highlight(el, color) {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.style.border = `3px solid ${color}`;
    setTimeout(() => { el.style.border = ""; }, 2000);
}