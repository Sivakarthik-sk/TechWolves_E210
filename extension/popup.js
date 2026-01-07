document.addEventListener('DOMContentLoaded', () => {
    const chatBox = document.getElementById('chatBox');
    const input = document.getElementById('userInput');
    
    function addMsg(text, type) {
        if(!chatBox) return;
        const div = document.createElement('div');
        div.className = `msg ${type}`;
        div.innerText = text;
        chatBox.appendChild(div);
        chatBox.scrollTop = chatBox.scrollHeight;
    }

    // Voice Setup
    if (window.webkitSpeechRecognition) {
        const rec = new webkitSpeechRecognition();
        document.getElementById('micBtn').onclick = () => {
            rec.lang = document.getElementById('langSelect').value;
            rec.start();
            addMsg("Listening...", "plan");
        };
        rec.onresult = (e) => {
            input.value = e.results[0][0].transcript;
            triggerBackend();
        };
    }

    document.getElementById('sendBtn').onclick = () => triggerBackend();

    async function triggerBackend(creds = null) {
        if(input.value) addMsg(input.value, 'user');
        
        const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
        
        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            func: () => document.body.outerHTML
        }, async (res) => {
            if (!res || !res[0]) { addMsg("Error: Refresh Page", "plan"); return; }
            
            try {
                // Use localhost to avoid permission blocks
                const req = await fetch('http://localhost:8000/navigate', {
                    method: 'POST',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({
                        query: input.value,
                        current_url: tab.url,
                        html_content: res[0].result,
                        dynamic_credentials: creds || {}
                    })
                });
                const data = await req.json();
                addMsg(data.message, 'ai');
                
                input.value = ""; // Clear input

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
                    chrome.tabs.sendMessage(tab.id, data);
                }
            } catch (e) { addMsg("Backend Offline", "plan"); }
        });
    }
    
    document.getElementById('dynamicSubmitBtn').onclick = () => {
        const creds = {};
        document.querySelectorAll('.login-input').forEach(i => creds[i.placeholder] = i.value);
        triggerBackend(creds);
    };
});