import uvicorn
import re
import traceback
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from bs4 import BeautifulSoup
try:
    from sentence_transformers import SentenceTransformer, util
    from deep_translator import GoogleTranslator
except:
    pass
try:
    from vault import get_credential, save_credential
except:
    def get_credential(d): return None
    def save_credential(d, c): pass

app = FastAPI()
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

print("🧠 CORTEX v10: COMBO-MOVE ENGINE READY")
try:
    model = SentenceTransformer('all-MiniLM-L6-v2')
    translator = GoogleTranslator(source='auto', target='en')
except:
    model = None

class UserQuery(BaseModel):
    query: str
    current_url: str
    html_content: str = ""
    dynamic_credentials: dict = {}

@app.post("/navigate")
async def navigate(data: UserQuery):
    try:
        # 1. TRANSLATE & PARSE
        eng_query = data.query.lower()
        if model:
            try: eng_query = translator.translate(data.query).lower()
            except: pass
        
        domain = data.current_url.split("//")[-1].split("/")[0]
        soup = BeautifulSoup(data.html_content, 'html.parser')

        # 2. EXTRACT CREDENTIALS FROM SENTENCE
        nl_creds = {}
        if "user" in eng_query or "pass" in eng_query:
            user_match = re.search(r"(user|id|username|email)\s+(?:is|as)?\s+([a-zA-Z0-9@.]+)", eng_query)
            pass_match = re.search(r"(pass|password|code)\s+(?:is|as)?\s+([a-zA-Z0-9@.]+)", eng_query)
            if user_match: nl_creds["Username"] = user_match.group(2)
            if pass_match: nl_creds["Password"] = pass_match.group(2)
        
        final_creds = {**data.dynamic_credentials, **nl_creds}

        # 3. INTELLIGENT LOGIN LOGIC
        if "login" in eng_query or "sign in" in eng_query or final_creds:
            if final_creds: save_credential(domain, final_creds)
            creds_to_use = final_creds or get_credential(domain)

            # CHECK VISIBILITY: Are there actual inputs on screen?
            visible_inputs = [i for i in soup.find_all('input') if i.get('type') not in ['hidden', 'submit']]
            
            if visible_inputs:
                # Case A: Form is open -> Just Fill
                if creds_to_use:
                    return {"action": "secure_autofill", "credentials": creds_to_use, "message": "Logging in..."}
                return {"action": "ask_dynamic_credentials", "fields": [i.get('placeholder') or "Field" for i in visible_inputs], "message": "Enter details."}
            
            else:
                # Case B: Form is HIDDEN -> Click Button THEN Fill (The Fix)
                # Find the login button
                login_btn = None
                for el in soup.find_all(['a', 'button', 'span', 'div']):
                    t = el.get_text(" ", strip=True).lower()
                    if t in ['login', 'sign in', 'login / signup', 'log in']:
                        login_btn = el
                        break
                
                if login_btn:
                    if creds_to_use:
                        # NEW ACTION: OPEN & FILL
                        return {
                            "action": "open_and_fill",
                            "selector": f"#{login_btn.get('id')}" if login_btn.get('id') else None,
                            "target_text": login_btn.get_text(strip=True),
                            "credentials": creds_to_use,
                            "message": "Opening login form & autofilling..."
                        }
                    else:
                        return {"action": "hunter_click", "target_text": login_btn.get_text(strip=True), "message": "Clicking Login..."}

        # 4. NAVIGATION
        candidates, texts = [], []
        for el in soup.find_all(['a', 'button', 'div', 'span']):
            t = el.get_text(" ", strip=True)
            if len(t) > 2 and len(t) < 50:
                candidates.append(el)
                texts.append(t)
        
        if candidates and model:
            scores = util.cos_sim(model.encode(eng_query), model.encode(texts))[0]
            best = candidates[scores.argmax()]
            if scores[scores.argmax()] > 0.25:
                return {"action": "spotlight_click", "target_text": best.get_text(" ", strip=True), "message": f"Opening {texts[scores.argmax()]}..."}

        return {"action": "speak", "message": "Ready."}

    except Exception:
        traceback.print_exc()
        return {"action": "speak", "message": "Error."}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)
