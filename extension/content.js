console.log("SiteSherpa Agent v10 🚀");

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    
    // --- NEW: COMBO MOVE (Click -> Wait -> Fill) ---
    if (req.action === "open_and_fill") {
        speak(req.message);
        
        // 1. Click the Login Button
        let btn = findElement(req);
        if (btn) {
            highlight(btn, "#f59e0b"); // Orange
            btn.click();
            
            // 2. Wait for Modal/Popup
            setTimeout(() => {
                // 3. Perform Autofill
                performAutofill(req.credentials);
            }, 2000); // 2 second delay for animation
        }
    }

    else if (req.action === "secure_autofill") {
        speak(req.message);
        performAutofill(req.credentials);
    }
    
    else if (req.action === "spotlight_click" || req.action === "hunter_click") {
        let el = findElement(req);
        if (el) {
            highlight(el, "#38bdf8"); // Blue
            setTimeout(() => el.click(), 1000);
        }
    }
});

// --- HELPER FUNCTIONS ---

function findElement(req) {
    if (req.selector) return document.querySelector(req.selector);
    if (req.target_text) {
        const xpath = `//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), "${req.target_text.toLowerCase()}")]`;
        try { 
            return document.evaluate(xpath, document, null, 9, null).singleNodeValue; 
        } catch(e){}
    }
    return null;
}

function performAutofill(creds) {
    console.log("Filling:", creds);
    for (const [key, val] of Object.entries(creds)) {
        const inputs = Array.from(document.querySelectorAll('input'));
        // Smart Match: checks placeholder, name, id, type
        const target = inputs.find(i => {
            const sig = (i.placeholder+i.name+i.id+i.type).toLowerCase();
            return sig.includes(key.toLowerCase().replace(/[^a-z]/g, ""));
        });

        if (target) {
            highlight(target, "#10b981"); // Green
            const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
            setter.call(target, val);
            target.dispatchEvent(new Event('input', {bubbles:true}));
        }
    }
    
    // Click Submit
    setTimeout(() => {
        const btn = document.querySelector('button[type="submit"], input[type="submit"]');
        if(btn) btn.click();
    }, 1500);
}

function highlight(el, color) {
    el.scrollIntoView({behavior:"smooth", block:"center"});
    el.style.transition = "0.3s";
    el.style.border = `3px solid ${color}`;
    el.style.boxShadow = `0 0 20px ${color}`;
}

function speak(text) {
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
}