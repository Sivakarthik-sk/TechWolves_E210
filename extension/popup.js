document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chatBox');
    const input = document.getElementById('userInput');
    const safetyModal = document.getElementById('safetyModal');
    let pendingAction = null;

    function addMsg(html, type) {
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        div.innerHTML = html;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    function renderPlan(plan) {
        if (!plan) return "";
        let html = `<div class="plan-card">`;
        plan.forEach(step => {
            const icon = step.status === 'done' ? 'check-circle' : 'circle';
            html += `<div class="plan-step ${step.status === 'pending' ? 'active' : ''}">
                <i class="fas fa-${icon}"></i> ${step.action}
            </div>`;
        });
        html += `</div>`;
        return html;
    }

    async function triggerBackend(creds = null, confirmation = false) {
        if (!confirmation && input.value) addMsg(input.value, 'user');
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.outerHTML
        }, async (res) => {
            if (!res || !res[0]) return;
            
            try {
                const req = await fetch('http://localhost:8000/navigate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: confirmation ? pendingAction : input.value,
                        current_url: tab.url,
                        html_content: res[0].result,
                        dynamic_credentials: creds || {},
                        user_confirmation: confirmation
                    })
                });
                const data = await req.json();
                
                // RENDER PLAN + MESSAGE
                const planHtml = renderPlan(data.plan);
                addMsg(`${data.message}<br>${planHtml}`, 'ai');

                // SAFETY STOP
                if (data.action === "require_safety_confirmation") {
                    safetyModal.style.display = 'block';
                    document.getElementById('safetyMsg').innerText = data.risk_msg;
                    pendingAction = input.value; // Store original query
                    return;
                } else {
                    safetyModal.style.display = 'none';
                }

                // AUTH FORM
                if (data.action === "ask_dynamic_credentials") {
                    const con = document.getElementById('form-inputs');
                    con.innerHTML = "";
                    document.getElementById('dynamic-form').style.display = 'block';
                    data.fields.forEach(f => {
                        const i = document.createElement('input');
                        i.className = 'login-input'; i.placeholder = f;
                        con.appendChild(i);
                    });
                } else {
                    document.getElementById('dynamic-form').style.display = 'none';
                    if(data.action !== "require_safety_confirmation") {
                         chrome.tabs.sendMessage(tab.id, data);
                         input.value = "";
                    }
                }
            } catch (e) { addMsg("Cortex Offline", "ai"); }
        });
    }

    document.getElementById('sendBtn').onclick = () => triggerBackend();
    
    document.getElementById('formSubmit').onclick = () => {
        const creds = {};
        document.querySelectorAll('.login-input').forEach(i => creds[i.placeholder] = i.value);
        triggerBackend(creds);
    };

    document.getElementById('safetyConfirmBtn').onclick = () => {
        triggerBackend(null, true);
    };
    
    // Voice (Standard)
    if (window.webkitSpeechRecognition) {
        const rec = new webkitSpeechRecognition();
        document.getElementById('micBtn').onclick = () => rec.start();
        rec.onresult = (e) => { input.value = e.results[0][0].transcript; triggerBackend(); };
    }
});